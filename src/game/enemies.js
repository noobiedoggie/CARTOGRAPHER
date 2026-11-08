/**
 * Enemies. There is no combat - the explorer can only avoid, block (blue
 * water / red walls) or trap enemies with ink (e.g. undo a bridge under a
 * Smudge and it falls into the chasm).
 *
 *  Smudge    - wanders; chases on sight; can't cross water (natural or blue).
 *  Eraser    - hunts your ink and rubs it out, tile by tile.
 *  Scribbler - keeps its distance and scribbles walls across your path;
 *              from floor 7 it also flicks ink blots (red walls block them).
 *  Devourer  - boss: a giant eraser that floats over everything, eating the
 *              map into chasm. Red walls stall it, water slows it.
 */
import { BAL } from '../config.js';
import { T, INK, MOVER, isPaintable, isStable } from '../world/tiles.js';
import { lineOfSight } from '../world/vision.js';
import { bfsFind, bfsPath, nearestTile } from '../world/pathfinding.js';

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

export class Enemy {
  constructor(kind, mover, tx, ty, w) {
    this.kind = kind;
    this.mover = mover;
    this.x = tx + 0.5;
    this.y = ty + 0.5;
    this.w = w;
    this.path = [];
    this.alive = true;
    this.stun = 0;
    this.state = 'wander';
    this.idle = Math.random() * 1.5;
    this.repath = Math.random() * 0.5;
    this.sense = Math.random() * 0.25;
    this.lost = 0;
    this.alert = 0;
    this.anim = Math.random() * 100;
    this.dirX = 0;
    this.dirY = 1;
    this.bramble = 0;
    this.moving = false;
  }
  get tx() {
    return Math.floor(this.x);
  }
  get ty() {
    return Math.floor(this.y);
  }
  get tile() {
    return this.ty * this.w + this.tx;
  }
  occupies(i) {
    return i === this.tile;
  }
  distTo(p) {
    return Math.hypot(p.x - this.x, p.y - this.y);
  }

  /** Line of sight to the explorer (rock and red walls block it). */
  sees(game, range) {
    const p = game.player;
    if (this.distTo(p) > range) return false;
    const w = game.world;
    return lineOfSight(w, this.tx, this.ty, p.tx, p.ty, (i) => w.isOpaque(i) || w.ink[i] === INK.RED);
  }

  passable(game) {
    const w = game.world;
    const m = this.mover;
    return (i) => w.canWalk(i, m);
  }

  /** Speed multiplier from upgrades (Sticky Ink). */
  slow(game) {
    if (!game.run.upg('sticky')) return 1;
    const w = game.world;
    const x = this.tx;
    const y = this.ty;
    for (let k = -1; k < 4; k++) {
      const nx = k < 0 ? x : x + DX4[k];
      const ny = k < 0 ? y : y + DY4[k];
      if (w.inside(nx, ny) && w.ink[w.idx(nx, ny)] !== INK.NONE) return 0.6;
    }
    return 1;
  }

  moveAlong(game, dt, speed) {
    const w = game.world;
    let step = speed * dt;
    this.moving = this.path.length > 0;
    let guard = 0;
    while (step > 1e-6 && this.path.length && guard++ < 6) {
      const next = this.path[0];
      if (!w.canWalk(next, this.mover)) {
        this.path = [];
        break;
      }
      const nx = (next % w.w) + 0.5;
      const ny = ((next / w.w) | 0) + 0.5;
      const dx = nx - this.x;
      const dy = ny - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        this.dirX = dx / d;
        this.dirY = dy / d;
      }
      if (d <= step) {
        this.x = nx;
        this.y = ny;
        step -= d;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        step = 0;
      }
    }
  }

  /** Pick a random reachable tile nearby and stroll there. */
  wander(game, radius = 6) {
    const w = game.world;
    const pass = this.passable(game);
    for (let k = 0; k < 8; k++) {
      const x = this.tx + Math.round((Math.random() * 2 - 1) * radius);
      const y = this.ty + Math.round((Math.random() * 2 - 1) * radius);
      if (!w.inside(x, y) || !pass(w.idx(x, y))) continue;
      const path = game.pf.find(this.tx, this.ty, x, y, pass, { maxNodes: 400 });
      if (path && path.length) {
        this.path = path;
        return;
      }
    }
  }

  chasePath(game, tx, ty) {
    const path = game.pf.find(this.tx, this.ty, tx, ty, this.passable(game), { maxNodes: 900, partial: true });
    this.path = path || [];
  }
}

// ---------------------------------------------------------------------------
export class Smudge extends Enemy {
  constructor(tx, ty, w) {
    super('smudge', MOVER.SMUDGE, tx, ty, w);
  }
  update(game, dt) {
    this.anim += dt;
    this.alert = Math.max(0, this.alert - dt);
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    this.sense -= dt;
    if (this.sense <= 0) {
      this.sense = 0.25;
      if (this.sees(game, BAL.smudgeSight)) {
        if (this.state !== 'chase') {
          this.state = 'chase';
          this.alert = 1;
          this.repath = 0;
          game.events.emit('alert', { e: this, visible: game.world.visible[this.tile] === 1 });
        }
        this.lost = 0;
      }
    }
    let speed;
    if (this.state === 'chase') {
      this.lost += dt;
      if (this.lost > 3.5) {
        this.state = 'wander';
        this.path = [];
      }
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 0.45;
        this.chasePath(game, game.player.tx, game.player.ty);
      }
      speed = BAL.smudgeChase + BAL.smudgeChasePerFloor * game.floor;
    } else {
      speed = BAL.smudgeWander;
      if (!this.path.length) {
        this.idle -= dt;
        if (this.idle <= 0) {
          this.idle = 0.6 + Math.random() * 1.8;
          this.wander(game);
        }
      }
    }
    this.moveAlong(game, dt, speed * this.slow(game));
  }
}

// ---------------------------------------------------------------------------
export class Eraser extends Enemy {
  constructor(tx, ty, w) {
    super('eraser', MOVER.ERASER, tx, ty, w);
    this.erasing = -1;
    this.eraseT = 0;
    this.think = Math.random();
  }

  _hasInkNeighbour(w, i) {
    const x = i % w.w;
    const y = (i / w.w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX4[k];
      const ny = y + DY4[k];
      if (w.inside(nx, ny) && w.ink[ny * w.w + nx] !== INK.NONE) return ny * w.w + nx;
    }
    return -1;
  }

  plan(game) {
    const w = game.world;
    const here = this.tile;
    const adj = this._hasInkNeighbour(w, here);
    if (adj >= 0) {
      this.erasing = adj;
      this.eraseT = 0;
      this.path = [];
      return;
    }
    const pass = this.passable(game);
    const r = bfsFind(w.w, w.h, here, pass, (i, d) => d > 0 && this._hasInkNeighbour(w, i) >= 0, 45);
    if (r) {
      this.path = bfsPath(r.prev, here, r.i);
      this.state = 'hunt';
      return;
    }
    if (w.ink[here] !== INK.NONE) {
      // Standing on the last bit of ink around: rub it out (even if it's the bridge we're on).
      this.erasing = here;
      this.eraseT = 0;
      return;
    }
    // No ink anywhere near: drift towards the explorer.
    this.state = 'drift';
    const p = game.player;
    if (this.distTo(p) < 16 && Math.random() < 0.6) this.chasePath(game, p.tx, p.ty);
    else this.wander(game, 7);
  }

  update(game, dt) {
    this.anim += dt;
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    const w = game.world;
    if (this.erasing >= 0) {
      if (w.ink[this.erasing] === INK.NONE) {
        this.erasing = -1;
      } else {
        this.eraseT += dt;
        if (this.eraseT >= BAL.eraseTime) {
          const i = this.erasing;
          const was = w.ink[i];
          w.setInk(i, INK.NONE);
          this.erasing = -1;
          if (game.run.upg('recycler')) game.run.ink = Math.min(game.run.maxInk, game.run.ink + 0.5);
          game.events.emit('erase', { i, ink: was, visible: w.visible[i] === 1 });
          game.afterTerrainChange();
          this.think = 0;
        }
        return;
      }
    }
    this.think -= dt;
    if (this.think <= 0 || (!this.path.length && this.state !== 'idle')) {
      this.think = 0.9;
      this.plan(game);
    }
    const speed = (this.state === 'drift' ? BAL.eraserSpeed * 0.7 : BAL.eraserSpeed) + game.floor * 0.04;
    this.moveAlong(game, dt, speed * this.slow(game));
  }
}

// ---------------------------------------------------------------------------
export class Scribbler extends Enemy {
  constructor(tx, ty, w) {
    super('scribbler', MOVER.SCRIBBLER, tx, ty, w);
    this.cast = 3 + Math.random() * 3;
    this.blot = 2 + Math.random() * 2;
  }

  update(game, dt) {
    this.anim += dt;
    this.alert = Math.max(0, this.alert - dt);
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    const p = game.player;
    const d = this.distTo(p);
    this.sense -= dt;
    if (this.sense <= 0) {
      this.sense = 0.3;
      this.seeing = this.sees(game, 8.5);
      if (this.seeing) {
        if (this.state !== 'harass') {
          this.alert = 1;
          game.events.emit('alert', { e: this, visible: game.world.visible[this.tile] === 1 });
        }
        this.state = 'harass';
        this.lost = 0;
      }
    }
    if (this.state === 'harass') {
      this.lost += dt;
      if (this.lost > 4) this.state = 'wander';
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 0.6;
        if (d < 3.5) this._flee(game);
        else if (d > 6) this.chasePath(game, p.tx, p.ty);
        else this.path = [];
      }
      this.cast -= dt;
      if (this.cast <= 0 && this.seeing) {
        this.cast = Math.max(4.5, BAL.scribbleCooldown - game.floor * 0.2);
        this._scribble(game);
      }
      if (game.floor >= 7) {
        this.blot -= dt;
        if (this.blot <= 0 && this.seeing && d < 9) {
          this.blot = 3.8;
          game.spawnBlot(this.x, this.y, p.x, p.y);
        }
      }
    } else if (!this.path.length) {
      this.idle -= dt;
      if (this.idle <= 0) {
        this.idle = 1 + Math.random() * 2;
        this.wander(game);
      }
    }
    this.moveAlong(game, dt, BAL.scribblerSpeed * this.slow(game));
  }

  _flee(game) {
    const p = game.player;
    const w = game.world;
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const tx = Math.round(this.x + (dx / l) * 4);
    const ty = Math.round(this.y + (dy / l) * 4);
    if (!w.inside(tx, ty)) return;
    const pass = this.passable(game);
    const goal = nearestTile(w.w, w.h, w.idx(tx, ty), pass, 3);
    if (goal >= 0) this.chasePath(game, w.xOf(goal), w.yOf(goal));
  }

  /** Scribble a 5-tile wall across the explorer's way. */
  _scribble(game) {
    const p = game.player;
    const w = game.world;
    let dx = p.moving ? p.dirX : p.x - this.x;
    let dy = p.moving ? p.dirY : p.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      dx = Math.sign(dx);
      dy = 0;
    } else {
      dy = Math.sign(dy) || 1;
      dx = 0;
    }
    const cx = p.tx + dx * 2;
    const cy = p.ty + dy * 2;
    const tiles = [];
    for (let k = -2; k <= 2; k++) {
      const x = cx - dy * k;
      const y = cy + dx * k;
      if (!w.inside(x, y)) continue;
      const i = w.idx(x, y);
      if (!isPaintable(w.terrain[i]) || w.ink[i] !== INK.NONE || w.fire[i] > 0 || game.isOccupied(i)) continue;
      w.scrib[i] = BAL.scribbleLife;
      w.version++;
      tiles.push(i);
    }
    if (tiles.length) {
      game.events.emit('scribble', { tiles, visible: tiles.some((i) => w.visible[i]) });
      game.afterTerrainChange();
    }
  }
}

// ---------------------------------------------------------------------------
export class Devourer extends Enemy {
  constructor(tx, ty, w) {
    super('boss', MOVER.SMUDGE, tx, ty, w);
    this.dormant = 4;
    this.blot = 3;
    this.chew = new Map(); // tile -> seconds of chewing left (red / blue ink)
    this.eatTick = 0;
    this.speedBoost = 0;
    this.radius = 1.45;
  }
  occupies(i) {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    return Math.abs(x - this.tx) <= 1 && Math.abs(y - this.ty) <= 1;
  }

  update(game, dt) {
    this.anim += dt;
    if (this.dormant > 0) {
      this.dormant -= dt;
      if (this.dormant <= 0) game.events.emit('bossAwake', {});
      return;
    }
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    const w = game.world;
    const p = game.player;
    // Eat the map under the 3x3 footprint.
    let slow = 1;
    this.eatTick -= dt;
    const eatNow = this.eatTick <= 0;
    if (eatNow) this.eatTick = 0.12;
    const pt = game.playerTile;
    let ate = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = this.tx + dx;
        const y = this.ty + dy;
        if (x <= 0 || y <= 0 || x >= w.w - 1 || y >= w.h - 1) continue;
        const i = w.idx(x, y);
        const k = w.ink[i];
        if (k === INK.RED || k === INK.BLUE) {
          slow = Math.min(slow, k === INK.RED ? 0.12 : 0.45);
          const left = (this.chew.get(i) ?? (k === INK.RED ? 1.1 : 1.6)) - dt;
          if (left <= 0) {
            this.chew.delete(i);
            w.setInk(i, INK.NONE);
            game.events.emit('devour', { i, ink: k });
          } else this.chew.set(i, left);
          continue;
        }
        if (!eatNow || i === pt) continue;
        if (k === INK.BLACK) {
          w.setInk(i, INK.NONE);
          ate = true;
        }
        const t = w.terrain[i];
        if (t !== T.CHASM && !isStable(t)) {
          w.setTerrain(i, T.CHASM);
          w.fire[i] = 0;
          w.scrib[i] = 0;
          ate = true;
        }
      }
    }
    if (ate) {
      game.events.emit('devour', { i: this.tile });
      game.afterTerrainChange();
    }
    // Float straight at the explorer.
    const speed = (BAL.bossSpeed + this.speedBoost) * slow;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.dirX = dx / d;
    this.dirY = dy / d;
    this.moving = slow > 0.5;
    if (d > 0.8) {
      this.x = Math.max(1.5, Math.min(w.w - 1.5, this.x + this.dirX * speed * dt));
      this.y = Math.max(1.5, Math.min(w.h - 1.5, this.y + this.dirY * speed * dt));
    }
    // Spit a fan of ink blots.
    this.blot -= dt;
    if (this.blot <= 0 && d < 11) {
      this.blot = BAL.bossBlotCooldown;
      const a = Math.atan2(dy, dx);
      for (const off of [-0.28, 0, 0.28]) game.spawnBlot(this.x, this.y, this.x + Math.cos(a + off) * 5, this.y + Math.sin(a + off) * 5);
    }
  }
}

// ---------------------------------------------------------------------------

/** Number of each enemy type on a normal floor. */
export function enemyCounts(floor) {
  return {
    smudge: floor <= 1 ? 1 : Math.min(6, 1 + Math.ceil(floor / 2)),
    eraser: floor >= 3 ? 1 + Math.floor((floor - 3) / 3) : 0,
    scribbler: floor >= 5 ? 1 + Math.floor((floor - 5) / 3) : 0,
  };
}

const MAKERS = { smudge: Smudge, eraser: Eraser, scribbler: Scribbler };

/**
 * Owns enemies and projectiles: spawning, updates, contact damage, falling
 * into chasms when the ground under them changes.
 */
export class EnemySystem {
  constructor(game, spawnEnabled = true) {
    this.game = game;
    this.spawnEnabled = spawnEnabled;
    if (!spawnEnabled) return;
    const counts = game.isBoss ? { smudge: 2, eraser: 1, scribbler: 0 } : enemyCounts(game.floor);
    for (const [kind, n] of Object.entries(counts)) for (let k = 0; k < n; k++) this.spawn(kind, 14, true);
  }

  /** Spawn an enemy on a valid tile away from the explorer (unseen if possible). */
  spawn(kind, minDist = 10, atStart = false) {
    const game = this.game;
    const w = game.world;
    if (game.enemies.filter((e) => e.alive).length >= BAL.maxEnemies) return null;
    const Maker = MAKERS[kind];
    const mover = kind === 'eraser' ? MOVER.ERASER : kind === 'scribbler' ? MOVER.SCRIBBLER : MOVER.SMUDGE;
    const p = game.player;
    const ex = w.exit.x;
    const ey = w.exit.y;
    for (let tries = 0; tries < 300; tries++) {
      const x = game.rng.int(2, w.w - 3);
      const y = game.rng.int(2, w.h - 3);
      const i = w.idx(x, y);
      if (!w.canWalk(i, mover) || w.terrain[i] !== T.GROUND) continue;
      if (w.visible[i] && tries < 250) continue;
      if (Math.abs(x - p.tx) + Math.abs(y - p.ty) < minDist) continue;
      if (Math.abs(x - ex) + Math.abs(y - ey) < 4) continue;
      if (atStart && game.enemies.some((e) => Math.abs(e.tx - x) + Math.abs(e.ty - y) < 5) && tries < 200) continue;
      const e = new Maker(x, y, w.w);
      game.enemies.push(e);
      return e;
    }
    return null;
  }

  update(game, dt) {
    const p = game.player;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      e.update(game, dt);
      if (e.bramble > 0) e.bramble -= dt;
      // Bramble Walls: touching a red wall stuns.
      if (game.run.upg('bramble') && e.kind !== 'boss' && e.bramble <= 0 && e.stun <= 0) {
        const w = game.world;
        for (let k = 0; k < 4; k++) {
          const nx = e.tx + DX4[k];
          const ny = e.ty + DY4[k];
          if (w.inside(nx, ny) && w.ink[w.idx(nx, ny)] === INK.RED) {
            e.stun = 2;
            e.bramble = 5;
            game.events.emit('stunned', { e });
            break;
          }
        }
      }
      // Contact damage
      const reach = e.kind === 'boss' ? 1.45 : 0.62;
      if (!game.dead && e.distTo(p) < reach && (e.kind !== 'boss' || e.dormant <= 0)) {
        if (game.damage(e.kind)) {
          if (e.kind === 'boss') this.knockback(game, e);
          else e.stun = Math.max(e.stun, 0.8); // give the explorer a moment to get away
        }
      }
    }
    // Projectiles
    const w = game.world;
    for (const b of game.projectiles) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const tx = Math.floor(b.x);
      const ty = Math.floor(b.y);
      if (b.life <= 0 || !w.inside(tx, ty) || w.blocksShot(w.idx(tx, ty))) {
        b.alive = false;
        game.events.emit('blotSplash', { x: b.x, y: b.y, blocked: w.inside(tx, ty) && w.ink[w.idx(tx, ty)] === INK.RED });
        continue;
      }
      if (Math.hypot(b.x - p.x, b.y - p.y) < 0.45) {
        b.alive = false;
        game.damage('blot');
        game.events.emit('blotSplash', { x: b.x, y: b.y, hit: true });
      }
    }
    game.projectiles = game.projectiles.filter((b) => b.alive);
    game.enemies = game.enemies.filter((e) => e.alive);
  }

  /** Throw the explorer clear of the boss after a hit. */
  knockback(game, boss) {
    const w = game.world;
    const p = game.player;
    const pass = (i) => w.canWalk(i, MOVER.PLAYER);
    const r = bfsFind(w.w, w.h, game.playerTile, () => true, (i) => pass(i) && Math.hypot(w.xOf(i) + 0.5 - boss.x, w.yOf(i) + 0.5 - boss.y) >= 3.5, 8);
    if (r) {
      p.x = w.xOf(r.i) + 0.5;
      p.y = w.yOf(r.i) + 0.5;
      p.path = [];
      game.refreshVision();
    }
  }

  /** Ground changed: enemies on chasm/water fall in, walled-in ones shuffle out. */
  afterTerrainChange(game) {
    const w = game.world;
    for (const e of game.enemies) {
      if (!e.alive || e.kind === 'boss') continue;
      e.path = [];
      const i = e.tile;
      if (w.canWalk(i, e.mover)) continue;
      const t = w.terrain[i];
      const k = w.ink[i];
      if ((t === T.CHASM || t === T.WATER || k === INK.BLUE) && k !== INK.BLACK && k !== INK.RED) {
        e.alive = false;
        game.run.stats.trapped++;
        game.events.emit('trapped', { e, x: e.x, y: e.y, into: t === T.CHASM ? 'chasm' : 'water' });
        continue;
      }
      const safe = nearestTile(w.w, w.h, i, (j) => w.canWalk(j, e.mover), 6);
      if (safe >= 0) {
        e.x = w.xOf(safe) + 0.5;
        e.y = w.yOf(safe) + 0.5;
      }
    }
  }
}
