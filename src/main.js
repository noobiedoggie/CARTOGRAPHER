/**
 * CARTOGRAPHER - entry point (Phase 1 harness: boots straight into a floor).
 */
import './styles.css';
import { TILE, MAP_W, MAP_H } from './config.js';
import { Renderer } from './render/renderer.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { HUD } from './ui/hud.js';
import { Game } from './game/game.js';
import { Run } from './game/run.js';
import { INK } from './world/tiles.js';
import { bindFeedback } from './ui/feedback.js';

const S = TILE;

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.camera = new Camera();
    this.camera.bounds = { w: MAP_W * S, h: MAP_H * S };
    this.time = 0;
    this.game = null;
    this.pointer = null;
    this.hud = new HUD({
      onUndo: () => this.game?.undo(),
      onInk: (t) => this.game?.setInkType(t),
      onPause: () => {},
    });
    this.input = new Input(this.canvas, {
      onTap: (x, y) => this.onTap(x, y),
      onDrawStart: (x, y) => this.onDrawStart(x, y),
      onDrawMove: (x, y) => this.onDrawMove(x, y),
      onDrawEnd: () => this.game?.endStroke(),
      onDrawCancel: () => this.game?.cancelStroke(),
      onPan: (dx, dy) => this.camera.panBy(dx, dy),
      onPinch: (f, x, y) => this.camera.zoomAt(f, x, y),
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.startRun();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.camera.setViewport(w, h);
  }

  toTile(sx, sy) {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    return [wx / S, wy / S];
  }

  onTap(sx, sy) {
    if (!this.game) return;
    const [tx, ty] = this.toTile(sx, sy);
    this.game.walkTo(Math.floor(tx), Math.floor(ty));
    this.camera.recenter();
  }

  onDrawStart(sx, sy) {
    if (!this.game) return;
    this.pointer = { x: sx, y: sy };
    const [tx, ty] = this.toTile(sx, sy);
    this.game.beginStroke(tx, ty);
  }

  onDrawMove(sx, sy) {
    if (!this.game) return;
    this.pointer = { x: sx, y: sy };
    const [tx, ty] = this.toTile(sx, sy);
    this.game.extendStroke(tx, ty);
  }

  startRun() {
    const meta = { perks: {}, unlocked: { blue: true, red: true, gold: true } };
    this.run = new Run(meta);
    this.startFloor();
  }

  startFloor() {
    this.game = new Game({ run: this.run });
    this.bindEvents(this.game);
    this.renderer.setWorld(this.game.world);
    this.renderer.effects.clear();
    this.renderer.fog.settle();
    this.renderer.buildAll();
    const p = this.game.player;
    this.camera.panX = this.camera.panY = 0;
    this.camera.follow(p.x * S, p.y * S, 0, true);
    this.hud.buildPicker(this.run);
    this.hud.show(true);
  }

  bindEvents(game) {
    bindFeedback(game, { renderer: this.renderer, camera: this.camera, hud: this.hud });
    game.events.on('exit', () => {
      this.run.floor++;
      setTimeout(() => this.startFloor(), 600);
    });
  }

  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.time += dt;
    const g = this.game;
    if (g) {
      g.update(dt);
      this.edgeScroll(dt);
      const p = g.player;
      this.camera.follow(p.x * S, p.y * S, dt);
      this.renderer.fog.update(dt, p.tx, p.ty);
      this.hud.update(g);
    }
    this.renderer.effects.update(dt);
    this.renderer.flash = Math.max(0, this.renderer.flash - dt);
    this.renderer.render({ world: g?.world, camera: this.camera, game: g, time: this.time, skin: this.run?.skin });
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
  const app = new App();
  window.__cart = app; // debug / automated test hook
  window.__INK = INK;
});
