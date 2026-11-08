/**
 * Game: the simulation of ONE floor.
 *
 * Pure logic - no DOM, no canvas - so it can run headless in tests. The
 * renderer reads its state; audio/haptics/UI react to events emitted on
 * `this.events`.
 */
import { MAP_W, MAP_H, BAL } from '../config.js';
import { RNG, mixSeed } from '../core/rng.js';
import { Emitter } from '../core/events.js';
import { T, INK, MOVER } from '../world/tiles.js';
import { World } from '../world/world.js';
import { Pathfinder, nearestTile } from '../world/pathfinding.js';
import { computeVision, revealDisc } from '../world/vision.js';
import { generateFloor } from '../world/generator.js';
import { Player } from './player.js';
import { Stroke, line4, canDraw, strokeCosts, affordableCount, MAX_STROKE } from './ink.js';
import { EnemySystem } from './enemies.js';
import { HazardSystem } from './hazards.js';
import { RewriteSystem } from './rewrite.js';
import { BossFloorSystem } from './boss.js';

export class Game {
  /**
   * @param {object} o
   * @param {import('./run.js').Run} o.run
   * @param {Emitter} [o.events]
   * @param {boolean} [o.noEnemies]  tests: skip enemy spawns
   * @param {boolean} [o.noRewrite]  tests: no rewrite waves
   */
  constructor({ run, events, noEnemies = false, noRewrite = false }) {
    this.run = run;
    this.floor = run.floor;
    this.isBoss = run.isBossFloor;
    this.events = events || new Emitter();
    this.seed = mixSeed(run.seed, run.floor);
    this.rng = new RNG(mixSeed(this.seed, 77));

    const gen = generateFloor(this.floor, this.seed);
    this.gen = gen;
    this.world = new World(MAP_W, MAP_H);
    this.world.loadTerrain(gen.terrain);
    this.world.start = gen.start;
    this.world.exit = gen.exit;
    this.pf = new Pathfinder(MAP_W, MAP_H);
    this.player = new Player(gen.start.x, gen.start.y);
    this.player.lastTile = this.world.idx(gen.start.x, gen.start.y);

    this.time = 0;
    this.inkType = INK.BLACK;
    this.stroke = null;
    this.lastStroke = null; // undo record
    this.animInk = []; // freshly drawn tiles bleeding in
    this.exitKnown = false;
    this.done = false; // floor finished (exit reached)
    this.dead = false;
    this.deathTimer = 0;
    this.paused = false;
    this.floorStats = { strokes: 0, walked: 0, poolsUsed: 0 };

    this.exitLocked = false;
    this.boss = null;
    if (run.upg('compass')) this.exitKnown = true;
    this.enemies = [];
    this.projectiles = [];

    run.ink = run.maxInk; // ink refills at the start of every floor
    this.refreshVision();

    // Systems are updated in order every frame.
    this.hazards = new HazardSystem();
    this.enemySystem = new EnemySystem(this, !noEnemies);
    this.bossFloor = this.isBoss && !noEnemies ? new BossFloorSystem(this) : null;
    this.rewrite = noRewrite ? null : new RewriteSystem(this);
    this.systems = [this.hazards, this.enemySystem, this.rewrite, this.bossFloor].filter(Boolean);
  }

  objectiveText() {
    return this.bossFloor ? this.bossFloor.objective() : '';
  }

  /** Enemy ink blot projectile from (x,y) aimed at (tx,ty) (tile units). */
  spawnBlot(x, y, tx, ty) {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    this.projectiles.push({ x, y, vx: (dx / d) * BAL.blotSpeed, vy: (dy / d) * BAL.blotSpeed, life: 2.2, alive: true });
    this.events.emit('blot', { x, y });
  }

  /** After each rewrite wave: new trouble appears in the redrawn areas. */
  onRewrite(changed) {
    if (this.dead || this.done) return;
    if (this.floor >= 4 && !this.isBoss && this.enemySystem.spawnEnabled && this.rng.chance(0.6)) {
      const kinds = this.floor >= 6 && this.rng.chance(0.3) ? 'eraser' : 'smudge';
      this.enemySystem.spawn(kinds, 10);
    }
    if (this.floor >= 3 && changed.length) {
      const p = this.player;
      const w = this.world;
      const far = changed.filter((i) => {
        const d = Math.abs(w.xOf(i) - p.tx) + Math.abs(w.yOf(i) - p.ty);
        return d >= 6 && d <= 16 && w.terrain[i] === T.GROUND;
      });
      const embers = 1 + Math.floor(this.floor / 4);
      for (let k = 0; k < embers && far.length; k++) {
        const i = far.splice(Math.floor(this.rng.next() * far.length), 1)[0];
        if (this.hazards.ignite(this, i)) this.events.emit('ignite', { i });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------
  get playerTile() {
    return this.world.idx(this.player.tx, this.player.ty);
  }

  /** Is an entity standing on tile i? (Blocks painting water/walls there.) */
  isOccupied(i) {
    if (i === this.playerTile) return true;
    for (const e of this.enemies) if (e.alive && e.occupies(i)) return true;
    return false;
  }

  undoTimeLeft() {
    const r = this.lastStroke;
    if (!r) return 0;
    return Math.max(0, this.run.undoWindow - (this.time - r.time));
  }

  /** Live stroke preview for the renderer/HUD. */
  strokePreview() {
    const s = this.stroke;
    if (!s) return null;
    const costs = strokeCosts(this, s);
    const budget = s.type === INK.GOLD ? this.run.gold : Math.floor(this.run.ink);
    const affordable = affordableCount(costs, budget);
    return {
      type: s.type,
      tiles: s.tiles,
      rejected: s.rejected,
      cost: costs.length ? costs[costs.length - 1] : 0,
      affordable,
      budget,
      tip: s.tip,
    };
  }

  // ---------------------------------------------------------------------
  // Player commands
  // ---------------------------------------------------------------------

  /** Walk to tile (tx,ty) using A*. Unexplored tiles are assumed walkable. */
  walkTo(tx, ty) {
    if (this.dead || this.done) return false;
    const w = this.world;
    if (!w.inside(tx, ty)) return false;
    let target = w.idx(tx, ty);
    // Tapped something solid we already know about? Aim for the closest standable tile.
    if (w.explored[target] && !w.canWalk(target, MOVER.PLAYER)) {
      let best = -1;
      let bestD = 1e9;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (!w.inside(x, y)) continue;
          const i = w.idx(x, y);
          if (!w.explored[i] || !w.canWalk(i, MOVER.PLAYER)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      if (best < 0) {
        this.events.emit('noPath', { x: tx, y: ty });
        return false;
      }
      target = best;
    }
    const path = this._findPath(target);
    if (!path || path.length === 0) {
      this.events.emit('noPath', { x: tx, y: ty });
      return false;
    }
    this.player.path = path;
    this.player.dest = target;
    this.events.emit('walk', { x: w.xOf(target), y: w.yOf(target) });
    return true;
  }

  _findPath(target) {
    const w = this.world;
    const p = this.player;
    const passable = (i) => (w.explored[i] ? w.canWalk(i, MOVER.PLAYER) : true);
    // Steer around enemies you can see (their tile and the ring around it).
    const danger = new Set();
    for (const e of this.enemies) {
      if (!e.alive || !w.visible[e.tile]) continue;
      const r = e.kind === 'boss' ? 2 : 1;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (w.inside(e.tx + dx, e.ty + dy)) danger.add(w.idx(e.tx + dx, e.ty + dy));
    }
    const cost = (i) => (!w.explored[i] ? 1.35 : w.fire[i] > 0 ? 6 : w.ink[i] === INK.BLACK ? 0.8 : 1) + (danger.has(i) ? 6 : 0);
    const path = this.pf.find(p.tx, p.ty, w.xOf(target), w.yOf(target), passable, { maxNodes: 6000, cost, partial: true });
    if (path && path.length) {
      // If we're off-centre, step back to our own tile centre first (avoids cutting corners).
      const cx = p.tx + 0.5;
      const cy = p.ty + 0.5;
      if (Math.hypot(p.x - cx, p.y - cy) > 0.2) path.unshift(this.playerTile);
    }
    return path;
  }

  _replan() {
    const p = this.player;
    if (p.dest < 0) {
      p.path = [];
      return;
    }
    const path = this._findPath(p.dest);
    p.path = path || [];
  }

  setInkType(type) {
    if (!this.run.hasInk(type)) return;
    this.inkType = type;
    this.events.emit('inkType', type);
  }

  /** Finger held down: start a stroke at world tile coords (fx,fy floats). */
  beginStroke(fx, fy) {
    if (this.dead || this.done) return false;
    if (this.inkType === INK.GOLD && this.run.gold <= 0) {
      this.events.emit('toast', { text: 'No gold ink left', kind: 'warn' });
      return false;
    }
    this.stroke = new Stroke(this.inkType);
    this.events.emit('strokeStart', { type: this.inkType });
    this.extendStroke(fx, fy);
    return true;
  }

  extendStroke(fx, fy) {
    const s = this.stroke;
    if (!s) return;
    const w = this.world;
    s.tip = { x: fx, y: fy };
    const tx = Math.max(0, Math.min(w.w - 1, Math.floor(fx)));
    const ty = Math.max(0, Math.min(w.h - 1, Math.floor(fy)));
    const visit = (x, y) => {
      const i = w.idx(x, y);
      if (s.set.has(i) || s.rejected.has(i)) return;
      if (s.tiles.length < MAX_STROKE && canDraw(this, i, s.type)) {
        s.set.add(i);
        s.tiles.push(i);
        this.events.emit('strokeTile', { i, n: s.tiles.length });
      } else s.rejected.add(i);
    };
    if (!s.last) visit(tx, ty);
    else if (s.last.x !== tx || s.last.y !== ty) line4(s.last.x, s.last.y, tx, ty, visit);
    s.last = { x: tx, y: ty };
  }

  cancelStroke() {
    if (this.stroke) this.events.emit('strokeCancel', {});
    this.stroke = null;
  }

  /** Finger lifted: the affordable part of the stroke becomes real terrain. */
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    if (!s.tiles.length) {
      this.events.emit('strokeCancel', {});
      return;
    }
    const w = this.world;
    const run = this.run;
    // Things may have moved under the finger; re-check every tile.
    s.tiles = s.tiles.filter((i) => canDraw(this, i, s.type));
    const costs = strokeCosts(this, s);
    const budget = s.type === INK.GOLD ? run.gold : Math.floor(run.ink);
    const n = affordableCount(costs, budget);
    if (n === 0) {
      this.events.emit('strokeFail', { need: costs[0] || 1 });
      return;
    }
    const cost = costs[n - 1];
    const record = { type: s.type, time: this.time, cost, tiles: [] };
    const revealed = [];
    for (let k = 0; k < n; k++) {
      const i = s.tiles[k];
      if (s.type === INK.GOLD) {
        revealDisc(w, w.xOf(i), w.yOf(i), BAL.goldRevealRadius, revealed);
        continue;
      }
      record.tiles.push({ i, ink: w.ink[i], scrib: w.scrib[i] });
      w.setInk(i, s.type, true);
      w.scrib[i] = 0;
      if (s.type === INK.BLUE && w.fire[i] > 0) {
        w.fire[i] = 0;
        w.ash[i] = 8;
        this.events.emit('extinguish', { i });
      }
      this.animInk.push({ i, t: -k * 0.022 });
    }
    if (s.type === INK.GOLD) {
      run.gold -= cost;
      if (!this.exitKnown) {
        this.exitKnown = true;
        const e = w.exit;
        revealDisc(w, e.x, e.y, 1.5, revealed);
        this.events.emit('toast', { text: 'The gold ink points the way to the stairs', kind: 'gold' });
      }
      this.lastStroke = null;
    } else {
      run.ink -= cost;
      this.lastStroke = record;
    }
    run.stats.inkUsed += cost;
    run.stats.tilesDrawn += n;
    this.floorStats.strokes++;
    this.events.emit('stroke', { type: s.type, tiles: s.tiles.slice(0, n), cost, partial: n < s.tiles.length });
    this.afterTerrainChange();
  }

  /** Undo the last stroke if still inside the undo window. */
  undo() {
    const r = this.lastStroke;
    if (!r || this.undoTimeLeft() <= 0) return false;
    const w = this.world;
    const pi = this.playerTile;
    for (const t of r.tiles) {
      if (t.i !== pi) continue;
      const cur = w.ink[pi];
      w.ink[pi] = t.ink;
      const ok = w.canWalk(pi, MOVER.PLAYER);
      w.ink[pi] = cur;
      if (!ok) {
        this.events.emit('toast', { text: "Can't undo - you're standing on it!", kind: 'warn' });
        return false;
      }
    }
    for (const t of r.tiles) {
      w.setInk(t.i, t.ink);
      w.scrib[t.i] = t.scrib;
    }
    const undone = new Set(r.tiles.map((t) => t.i));
    this.animInk = this.animInk.filter((a) => !undone.has(a.i));
    const refund = Math.round(r.cost * this.run.undoRefund);
    this.run.ink = Math.min(this.run.maxInk, this.run.ink + refund);
    this.run.stats.inkUsed -= refund;
    this.lastStroke = null;
    this.events.emit('undo', { refund, tiles: r.tiles.map((t) => t.i) });
    this.afterTerrainChange();
    return true;
  }

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------
  update(dt) {
    if (this.paused || this.done) return;
    this.time += dt;
    this.run.stats.time += dt;

    // Ink bleed-in animation.
    if (this.animInk.length) {
      const w = this.world;
      for (const a of this.animInk) {
        a.t += dt;
        w.inkAnim[a.i] = Math.max(0, Math.min(1, a.t / 0.45));
      }
      const still = [];
      for (const a of this.animInk) {
        if (w.inkAnim[a.i] >= 1) w.markDirty(a.i);
        else still.push(a);
      }
      this.animInk = still;
    }

    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0 && !this.deathAnnounced) {
        this.deathAnnounced = true;
        this.events.emit('death', {});
      }
      return;
    }

    this.updatePlayer(dt);
    for (const s of this.systems) s.update(this, dt);
  }

  updatePlayer(dt) {
    const p = this.player;
    const w = this.world;
    const run = this.run;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);

    let step = BAL.playerSpeed * run.speedMult * (w.ink[this.playerTile] === INK.BLACK ? BAL.inkPathSpeed : 1) * dt;
    p.moving = p.path.length > 0;
    let guard = 0;
    while (step > 1e-6 && p.path.length && guard++ < 8) {
      const next = p.path[0];
      if (!w.canWalk(next, MOVER.PLAYER)) {
        this._replan();
        if (!p.path.length || p.path[0] === next) {
          p.path = [];
          break;
        }
        continue;
      }
      const nx = w.xOf(next) + 0.5;
      const ny = w.yOf(next) + 0.5;
      const dx = nx - p.x;
      const dy = ny - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        p.dirX = dx / d;
        p.dirY = dy / d;
      }
      if (d <= step) {
        p.x = nx;
        p.y = ny;
        step -= d;
        p.path.shift();
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        step = 0;
      }
      this._checkTileChange();
    }
    if (p.moving) {
      p.walkPhase += dt * 11;
      p.stillTime = 0;
    } else {
      p.stillTime += dt;
      // "Still Waters": regenerate ink while standing still.
      const sw = run.upg('still');
      if (sw && p.stillTime > BAL.stillRegenDelay && !this.stroke) {
        run.ink = Math.min(run.maxInk, run.ink + BAL.stillRegenRate * sw * dt);
      }
    }
    if (!p.path.length) p.dest = -1;
  }

  _checkTileChange() {
    const p = this.player;
    const i = this.playerTile;
    if (i === p.lastTile) return;
    p.lastTile = i;
    this.floorStats.walked++;
    this.refreshVision();
    this.onEnterTile(i);
  }

  /** Recompute field of view; replan if the path runs into something we just discovered. */
  refreshVision() {
    const newly = [];
    computeVision(this.world, this.player.tx, this.player.ty, this.run.vision, newly);
    const w = this.world;
    if (newly.length) {
      const e = w.idx(w.exit.x, w.exit.y);
      if (!this.exitKnown && w.explored[e]) {
        this.exitKnown = true;
        this.events.emit('exitSeen', {});
      }
      this.events.emit('reveal', { tiles: newly });
      const p = this.player;
      if (p.path.some((t) => w.explored[t] && !w.canWalk(t, MOVER.PLAYER))) this._replan();
    }
  }

  onEnterTile(i) {
    const w = this.world;
    const run = this.run;
    const t = w.terrain[i];
    const x = w.xOf(i);
    const y = w.yOf(i);
    if (t === T.POOL) {
      if (run.ink >= run.maxInk - 0.01) {
        this.events.emit('toast', { text: 'Inkwell already full', kind: 'info' });
      } else {
        const gain = Math.round(BAL.poolInk * (run.upg('diviner') ? 1.5 : 1));
        run.ink = Math.min(run.maxInk, run.ink + gain);
        w.setTerrain(i, T.POOL_DRY);
        this.floorStats.poolsUsed++;
        this.events.emit('pool', { x, y, gain });
      }
    } else if (t === T.CHEST) {
      this.openChest(i);
    } else if (t === T.EXIT) {
      this.reachExit();
    }
    for (const s of this.systems) s.onEnterTile?.(this, i);
  }

  openChest(i) {
    const w = this.world;
    const run = this.run;
    w.setTerrain(i, T.CHEST_OPEN);
    run.stats.chests++;
    const r = this.rng.next();
    let text;
    let kind = 'ink';
    if (r < 0.14 && run.hearts < 3) {
      run.hearts++;
      text = '+1 heart';
      kind = 'heart';
    } else if (r < 0.28 && run.hasInk(INK.GOLD)) {
      run.gold += 2;
      text = '+2 gold ink';
      kind = 'gold';
    } else if (r < 0.4 && !this.exitKnown) {
      this.exitKnown = true;
      const e = w.exit;
      revealDisc(w, e.x, e.y, 2.5);
      text = 'A map fragment! The stairs are revealed';
      kind = 'map';
    } else if (r < 0.7) {
      const pages = 2 + this.rng.int(0, 2) + run.perk('scavenger');
      run.stats.pages += pages;
      text = `+${pages} pages`;
      kind = 'pages';
    } else {
      const gain = 8;
      run.ink = Math.min(run.maxInk + 8, run.ink + gain); // chests may overfill a little
      text = `+${gain} ink`;
    }
    this.events.emit('chest', { x: w.xOf(i), y: w.yOf(i), text, kind });
  }

  reachExit() {
    for (const s of this.systems) if (s.canExit && !s.canExit(this)) return;
    if (this.done) return;
    this.done = true;
    this.cancelStroke();
    this.run.stats.floorsCleared++;
    this.events.emit('exit', { floor: this.floor });
  }

  /** Called after ink/terrain changes: check footing of everyone, refresh paths. */
  afterTerrainChange() {
    this.checkPlayerFooting();
    for (const s of this.systems) s.afterTerrainChange?.(this);
    this.refreshVision();
  }

  checkPlayerFooting() {
    const w = this.world;
    const i = this.playerTile;
    if (w.canWalk(i, MOVER.PLAYER)) return;
    const safe = nearestTile(w.w, w.h, i, (j) => w.canWalk(j, MOVER.PLAYER) && w.explored[j], 12);
    if (safe >= 0) {
      this.player.x = w.xOf(safe) + 0.5;
      this.player.y = w.yOf(safe) + 0.5;
    }
    this.player.path = [];
    this.events.emit('fall', { x: w.xOf(i), y: w.yOf(i) });
    this.damage('fall', true);
  }

  /** Lose a heart (unless invulnerable). */
  damage(source, force = false) {
    const p = this.player;
    if (this.dead || this.done) return false;
    if (p.invuln > 0 && !force) return false;
    const run = this.run;
    run.hearts--;
    run.stats.hits++;
    p.invuln = BAL.invuln * (run.upg('secondwind') ? 1.6 : 1);
    p.hurtFlash = 0.5;
    if (run.upg('secondwind')) run.ink = Math.min(run.maxInk, run.ink + 10);
    this.events.emit('damage', { source, hearts: run.hearts });
    if (run.hearts <= 0) {
      this.dead = true;
      this.deathTimer = 1.6;
      this.cancelStroke();
      this.player.path = [];
      this.events.emit('dying', {});
    }
    return true;
  }
}
