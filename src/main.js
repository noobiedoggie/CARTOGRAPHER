/**
 * CARTOGRAPHER - application shell.
 *
 * Owns the canvas, renderer, camera, input, HUD and menu screens, and runs
 * the roguelite loop:
 *
 *   Main menu -> Atlas (meta shop)
 *            -> Run: floor 1..10 -> (upgrade choice between floors) -> boss
 *            -> Game over / Victory (pages banked into the Atlas)
 *
 * Saving: meta progress after every change; the current run is snapshotted
 * at each floor start (and on every lost heart) so "Continue" resumes it.
 */
import './styles.css';
import { App as CapApp } from '@capacitor/app';
import { TILE, MAP_W, MAP_H, BOSS_FLOOR } from './config.js';
import { RNG } from './core/rng.js';
import { Renderer } from './render/renderer.js';
import { paperCSS } from './render/paper.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { loadJSON, saveJSON, remove } from './core/storage.js';
import { AudioFX } from './core/audio.js';
import { HapticsFX } from './core/haptics.js';
import { Tutorial } from './ui/tutorial.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { bindFeedback } from './ui/feedback.js';
import { Game } from './game/game.js';
import { Run } from './game/run.js';
import { defaultMeta, migrateMeta, floorPages, buy } from './game/meta.js';
import { rollUpgrades, applyUpgrade, UPGRADES } from './game/upgrades.js';
import { World } from './world/world.js';
import { generateFloor } from './world/generator.js';
import { cheapestRoute } from './world/solver.js';
import { INK } from './world/tiles.js';

const S = TILE;

class CartographerApp {
  constructor() {
    document.documentElement.style.setProperty('--paper-tex', paperCSS());
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.camera = new Camera();
    this.camera.bounds = { w: MAP_W * S, h: MAP_H * S };
    this.time = 0;
    this.mode = 'boot'; // boot | menu | game | pause | upgrade | summary | transition
    this.game = null;
    this.run = null;
    this.meta = defaultMeta();
    this.savedRun = null;
    this.pointer = null;
    this.audio = new AudioFX();
    this.haptics = new HapticsFX();
    this.tutorial = null;

    this.hud = new HUD({
      onUndo: () => this.game?.undo(),
      onInk: (t) => {
        this.game?.setInkType(t);
        this.audio?.click();
        this.haptics?.light();
      },
      onPause: () => this.pause(),
    });
    this.screens = new Screens(this);
    this.input = new Input(this.canvas, {
      onTap: (x, y) => this.onTap(x, y),
      onDrawStart: (x, y) => this.onDrawStart(x, y),
      onDrawMove: (x, y) => this.onDrawMove(x, y),
      onDrawEnd: () => this.playing && this.game.endStroke(),
      onDrawCancel: () => this.game?.cancelStroke(),
      onPan: (dx, dy) => this.camera.panBy(dx, dy),
      onPinch: (f, x, y) => this.camera.zoomAt(f, x, y),
    });

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'game') this.pause();
        this.audio?.suspend();
      } else this.audio?.resume();
    });
    try {
      CapApp.addListener('backButton', () => this.onBack());
    } catch {
      /* not on a device */
    }
    this.renderer.overFogDrawers.push((ctx, scene) => scene.game && this.tutorial?.draw(ctx, scene.game, scene.time));
    this.resize();
    this.makeMenuWorld();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.init();
  }

  get playing() {
    return this.mode === 'game' && this.game && !this.game.done && !this.game.dead;
  }

  async init() {
    this.meta = migrateMeta(await loadJSON('meta'));
    this.savedRun = await loadJSON('run');
    this.applySettings();
    this.toMenu();
  }

  applySettings() {
    this.audio?.setEnabled(this.meta.settings.sound);
    this.haptics?.setEnabled(this.meta.settings.haptics);
  }

  saveMeta() {
    saveJSON('meta', this.meta);
  }
  saveRun() {
    if (!this.run) return;
    this.savedRun = this.run.toJSON();
    saveJSON('run', this.savedRun);
  }
  clearRun() {
    this.savedRun = null;
    remove('run');
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.camera.setViewport(w, h);
  }

  // ---------------------------------------------------------------------
  // Input -> game
  // ---------------------------------------------------------------------
  toTile(sx, sy) {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    return [wx / S, wy / S];
  }
  onTap(sx, sy) {
    if (!this.playing) return;
    const [tx, ty] = this.toTile(sx, sy);
    this.game.walkTo(Math.floor(tx), Math.floor(ty));
    this.camera.recenter();
    this.tutorial?.notify('tap');
  }
  onDrawStart(sx, sy) {
    if (!this.playing) return;
    this.pointer = { x: sx, y: sy };
    const [tx, ty] = this.toTile(sx, sy);
    this.game.beginStroke(tx, ty);
  }
  onDrawMove(sx, sy) {
    if (!this.playing) return;
    this.pointer = { x: sx, y: sy };
    const [tx, ty] = this.toTile(sx, sy);
    this.game.extendStroke(tx, ty);
  }
  onBack() {
    switch (this.mode) {
      case 'game':
        this.pause();
        break;
      case 'pause':
        this.resume();
        break;
      case 'menu':
        if (this.screens.current === 'menu') CapApp.exitApp?.();
        else this.screens.menu();
        break;
      case 'summary':
        this.toMenu();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------
  toMenu() {
    this.mode = 'menu';
    this.endTutorial();
    this.audio?.droneStop();
    this.game = null;
    this.hud.show(false);
    this.makeMenuWorld();
    this.screens.menu();
  }

  newRun() {
    this.clearRun();
    this.run = new Run(this.meta);
    this.run.skin = this.meta.skin;
    if (this.meta.perks.headstart) {
      const pick = rollUpgrades(this.run, new RNG(this.run.seed ^ 0xabc), 1)[0];
      if (pick) {
        applyUpgrade(this.run, pick.id);
        this.run.ink = this.run.maxInk;
        this.pendingToast = `Head start: ${pick.name}`;
      }
    }
    this.meta.stats.runs++;
    this.saveMeta();
    this.flipTo('Floor 1', () => this.startFloor());
  }

  continueRun() {
    if (!this.savedRun) return this.newRun();
    this.run = new Run(this.meta, this.savedRun);
    this.flipTo(this.run.floor >= BOSS_FLOOR ? 'The Devourer' : `Floor ${this.run.floor}`, () => this.startFloor());
  }

  startFloor() {
    const run = this.run;
    const game = new Game({ run });
    this.game = game;
    bindFeedback(game, { renderer: this.renderer, camera: this.camera, hud: this.hud, audio: this.audio, haptics: this.haptics });
    game.events.on('exit', () => setTimeout(() => this.onFloorCleared(), 650));
    game.events.on('death', () => this.finishRun(false));
    game.events.on('dying', () => this.clearRun());
    game.events.on('damage', () => {
      if (!game.dead) this.saveRun();
    });
    this.renderer.setWorld(game.world);
    this.renderer.effects.clear();
    this.renderer.fog.settle();
    this.renderer.buildAll();
    this.camera.panX = this.camera.panY = 0;
    this.camera.setUserZoom(this.camera.userZoom);
    this.camera.follow(game.player.x * S, game.player.y * S, 0, true);
    this.hud.buildPicker(run);
    this.hud.show(true);
    this.screens.hide();
    this.mode = 'game';
    this.saveRun();
    this.endTutorial();
    if (run.floor === 1 && !this.meta.tutorialDone) {
      this.tutorial = new Tutorial(() => {
        this.meta.tutorialDone = true;
        this.saveMeta();
      });
    } else {
      const name = run.floor >= BOSS_FLOOR ? 'The Devourer awaits' : `Floor ${run.floor} - find the stairs`;
      this.hud.toast(name, 'info', 1800);
    }
    if (this.pendingToast) {
      this.hud.toast(this.pendingToast, 'gold');
      this.pendingToast = null;
    }
  }

  onFloorCleared() {
    const run = this.run;
    if (!run || this.mode !== 'game') return;
    if (run.floor >= BOSS_FLOOR) return this.finishRun(true);
    const pagesEarned = floorPages(run.floor);
    run.stats.pages += pagesEarned;
    this.mode = 'upgrade';
    this.endTutorial();
    this.audio?.droneStop();
    this.hud.show(false);
    const rng = new RNG((run.seed ^ (run.floor * 7919)) >>> 0);
    const choices = rollUpgrades(run, rng, 3);
    const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, run.upg(u.id)]));
    this.screens.upgrade(choices, { floor: run.floor, next: run.floor + 1, pages: pagesEarned, levels });
  }

  pickUpgrade(id) {
    if (this.mode !== 'upgrade') return;
    applyUpgrade(this.run, id);
    this.run.floor++;
    this.mode = 'transition';
    this.flipTo(this.run.floor >= BOSS_FLOOR ? 'The Devourer' : `Floor ${this.run.floor}`, () => this.startFloor());
  }

  endTutorial() {
    this.tutorial?.dispose();
    this.tutorial = null;
  }

  finishRun(victory) {
    const run = this.run;
    if (!run || this.mode === 'summary') return;
    this.endTutorial();
    this.audio?.droneStop();
    const bonus = victory ? floorPages(BOSS_FLOOR) : 0;
    run.stats.pages += bonus;
    const m = this.meta;
    m.pages += run.stats.pages;
    m.totalPages += run.stats.pages;
    if (victory) m.stats.wins++;
    else m.stats.deaths++;
    m.stats.bestFloor = Math.max(m.stats.bestFloor, run.floor);
    m.stats.tilesDrawn += run.stats.tilesDrawn;
    m.stats.trapped += run.stats.trapped;
    this.saveMeta();
    this.clearRun();
    this.mode = 'summary';
    this.hud.show(false);
    this.audio?.[victory ? 'victory' : 'gameOver']?.();
    this.screens.summary({ victory, floorReached: run.floor, bonus, ...run.stats });
  }

  pause() {
    if (this.mode !== 'game' || !this.game) return;
    this.game.cancelStroke();
    this.input.cancel();
    this.game.paused = true;
    this.mode = 'pause';
    this.screens.pause();
    this.audio?.droneStop?.();
  }
  resume() {
    if (this.mode !== 'pause' || !this.game) return;
    this.game.paused = false;
    this.mode = 'game';
    this.screens.hide();
  }
  abandon() {
    if (this.game) this.game.paused = true;
    this.mode = 'game';
    this.finishRun(false);
  }

  buy(kind, id) {
    if (buy(this.meta, kind, id)) {
      this.saveMeta();
      this.audio?.chime();
      this.haptics?.medium();
    }
    this.screens.atlas();
  }
  setSkin(id) {
    if (this.meta.skins.includes(id)) this.meta.skin = id;
    this.saveMeta();
    this.screens.atlas();
  }
  toggleSetting(key) {
    this.meta.settings[key] = !this.meta.settings[key];
    this.applySettings();
    this.saveMeta();
    this.screens.settings(this.mode === 'pause' ? 'pause' : 'menu');
  }
  replayTutorial() {
    this.meta.tutorialDone = false;
    this.saveMeta();
    this.hud.toast('The tutorial will play on your next floor 1', 'info');
  }
  resetProgress() {
    this.meta = defaultMeta();
    this.saveMeta();
    this.clearRun();
    this.applySettings();
    this.toMenu();
  }

  /** Page-turn transition; `fn` runs while the page covers the screen. */
  flipTo(label, fn) {
    const flip = document.getElementById('flip');
    document.getElementById('flip-label').textContent = label;
    flip.classList.remove('go');
    void flip.offsetWidth;
    flip.classList.add('go');
    this.audio?.pageFlip();
    this.haptics?.light();
    this.mode = 'transition';
    this.screens.hide();
    setTimeout(fn, 430);
    setTimeout(() => flip.classList.remove('go'), 1000);
  }

  // ---------------------------------------------------------------------
  // Menu backdrop: a finished map slowly drifting by
  // ---------------------------------------------------------------------
  makeMenuWorld() {
    const gen = generateFloor(4, 20261108);
    const w = new World(MAP_W, MAP_H);
    w.loadTerrain(gen.terrain);
    w.start = gen.start;
    w.exit = gen.exit;
    w.explored.fill(1);
    w.visible.fill(1);
    // Ink the charted route.
    const route = cheapestRoute(w.w, w.h, w.terrain, null, null, w.idx(gen.start.x, gen.start.y), w.idx(gen.exit.x, gen.exit.y));
    for (const i of route.path) w.ink[i] = INK.BLACK;
    this.menuWorld = w;
    this.menuRoute = route.path;
    this.renderer.setWorld(w);
    this.renderer.fog.settle();
  }

  // ---------------------------------------------------------------------
  /**
   * Adaptive quality: if frames stay slow for a few seconds, drop the paper
   * grain overlay, then the canvas resolution (keeps 60 FPS on older phones).
   */
  watchPerformance(rawMs) {
    const pf = this.perf || (this.perf = { ema: 16.7, slow: 0, level: 2 });
    pf.ema = pf.ema * 0.95 + Math.min(rawMs, 100) * 0.05;
    if (this.mode !== 'game' || document.hidden) return;
    pf.slow = pf.ema > 22 ? pf.slow + rawMs / 1000 : Math.max(0, pf.slow - rawMs / 2000);
    if (pf.slow > 3 && pf.level > 0) {
      pf.level--;
      pf.slow = 0;
      if (pf.level === 1) this.renderer.quality = 0;
      else {
        this.renderer.maxDpr = 1.25;
        this.resize();
      }
    }
  }

  frame(t) {
    const raw = t - this.last;
    const dt = Math.min(0.05, raw / 1000);
    this.last = t;
    this.time += dt;
    this.watchPerformance(raw);
    const g = this.game;
    if (g && (this.mode === 'game' || this.mode === 'transition' || this.mode === 'upgrade' || this.mode === 'summary' || this.mode === 'pause')) {
      if (this.mode === 'game') {
        g.update(dt);
        this.edgeScroll(dt);
        this.tutorial?.update(dt, g);
      }
      const p = g.player;
      this.camera.follow(p.x * S, p.y * S, dt);
      this.renderer.fog.update(dt, p.tx, p.ty);
      if (this.mode === 'game') this.hud.update(g);
      this.renderer.effects.update(dt);
      this.renderer.flash = Math.max(0, this.renderer.flash - dt);
      this.renderer.render({ world: g.world, camera: this.camera, game: g, time: this.time, skin: this.run?.skin });
    } else if (this.menuWorld) {
      // Drift along the inked route.
      const r = this.menuRoute;
      const k = (this.time * 1.2) % (r.length * 2);
      const idx = r[Math.floor(k < r.length ? k : r.length * 2 - k - 1)] ?? r[0];
      const w = this.menuWorld;
      this.camera.follow((w.xOf(idx) + 0.5) * S, (w.yOf(idx) + 0.5) * S, dt * 0.25);
      this.renderer.render({ world: w, camera: this.camera, game: null, time: this.time });
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** While drawing near a screen edge, scroll the map so long strokes are possible. */
  edgeScroll(dt) {
    if (!this.input.drawing || !this.pointer || !this.game?.stroke) return;
    const m = 56;
    const { x, y } = this.pointer;
    const W = this.camera.viewW;
    const H = this.camera.viewH;
    let vx = 0;
    let vy = 0;
    if (x < m) vx = -(m - x) / m;
    else if (x > W - m) vx = (x - (W - m)) / m;
    if (y < m + 60) vy = -(m + 60 - y) / m;
    else if (y > H - m) vy = (y - (H - m)) / m;
    if (!vx && !vy) return;
    const speed = 420 * dt;
    this.camera.panBy(-vx * speed, -vy * speed);
    const [tx, ty] = this.toTile(x, y);
    this.game.extendStroke(tx, ty);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new CartographerApp();
  window.__cart = app; // debug / automated test hook
  window.__INK = INK;
});
