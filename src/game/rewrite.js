/**
 * "The world rewrites itself."
 *
 * Every N seconds a wave sweeps down the map. Every tile that is
 *   - not currently in sight,
 *   - not inked by the explorer,
 *   - not ancient/stable (ruins, stairs, anchors) and not right next to you,
 * is replaced by a freshly generated world (fog rolls back over it, too).
 * Player ink is the only stable thing - so ink a route to keep it.
 *
 * Fairness: the replacement is chosen among several candidates so that the
 * stairs stay reachable with the ink the explorer currently has; after the
 * sweep the solver re-checks from the explorer's position and, if needed,
 * digs a passage through hidden rock or conjures an ink pool.
 */
import { BAL } from '../config.js';
import { RNG, mixSeed } from '../core/rng.js';
import { T, INK, isStable, isLooseFeature } from '../world/tiles.js';
import { floorParams, generateTerrain } from '../world/generator.js';
import { minInkCost, inkField, carveRoute } from '../world/solver.js';

export class RewriteSystem {
  constructor(game) {
    this.interval = game.run.rewriteInterval;
    this.timeLeft = this.interval;
    this.sweeping = false;
    this.sweepPos = 0; // rows swept so far (float)
    this.applied = 0;
    this.count = 0;
    this.warned = false;
    this.plan = null;
  }

  update(game, dt) {
    if (!this.sweeping) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && !this.warned) {
        this.warned = true;
        game.events.emit('rewriteWarn', {});
      }
      if (this.timeLeft <= 0) this.start(game);
      return;
    }
    const h = game.world.h;
    this.sweepPos = Math.min(h, this.sweepPos + (dt / BAL.rewriteSweepTime) * h);
    while (this.applied < Math.floor(this.sweepPos)) this.applyRow(game, this.applied++);
    if (this.applied >= h) this.finish(game);
  }

  start(game) {
    this.sweeping = true;
    this.sweepPos = 0;
    this.applied = 0;
    this.plan = this.makePlan(game);
    this._eligible = this.plan.eligible;
    game.events.emit('rewriteStart', {});
  }

  /** Which tiles may change right now? */
  eligibleMask(game) {
    const w = game.world;
    const mask = new Uint8Array(w.n);
    const p = game.player;
    const e = w.exit;
    for (let y = 1; y < w.h - 1; y++) {
      for (let x = 1; x < w.w - 1; x++) {
        const i = y * w.w + x;
        if (w.visible[i] || w.ink[i] !== INK.NONE || isStable(w.terrain[i])) continue;
        if (Math.abs(x - p.tx) <= 1 && Math.abs(y - p.ty) <= 1) continue;
        if (Math.abs(x - e.x) <= 1 && Math.abs(y - e.y) <= 1) continue;
        mask[i] = 1;
      }
    }
    return mask;
  }

  makePlan(game) {
    const w = game.world;
    const eligible = this.eligibleMask(game);
    const params = floorParams(game.floor);
    const rng = new RNG(mixSeed(game.seed, 1000 + this.count));
    const exit = w.idx(w.exit.x, w.exit.y);
    const budget = Math.floor(game.run.ink);
    // Pools and chests in the rewritten area are shuffled to new places.
    const loose = [];
    for (let i = 0; i < w.n; i++) if (eligible[i] && isLooseFeature(w.terrain[i])) loose.push(w.terrain[i]);
    const scrib = new Float32Array(w.n);
    for (let i = 0; i < w.n; i++) if (!eligible[i]) scrib[i] = w.scrib[i];

    let best = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = generateTerrain(rng, params, w.w, w.h);
      const next = w.terrain.slice();
      for (let i = 0; i < w.n; i++) if (eligible[i]) next[i] = cand[i];
      this._placeLoose(rng, next, eligible, loose, w);
      const cost = minInkCost(w.w, w.h, next, w.ink, scrib, game.playerTile, exit);
      if (!best || cost < best.cost) best = { next, eligible, cost };
      if (cost <= budget) break;
    }
    return best;
  }

  _placeLoose(rng, next, eligible, loose, w) {
    if (!loose.length) return;
    const spots = [];
    for (let i = 0; i < w.n; i++) if (eligible[i] && next[i] === T.GROUND) spots.push(i);
    rng.shuffle(spots);
    let k = 0;
    for (const t of loose) {
      while (k < spots.length) {
        const i = spots[k++];
        const x = i % w.w;
        const y = (i / w.w) | 0;
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nt = next[(y + dy) * w.w + (x + dx)];
            if (nt === T.POOL || nt === T.CHEST || nt === T.EXIT) clear = false;
          }
        if (clear) {
          next[i] = t;
          break;
        }
      }
    }
  }

  applyRow(game, y) {
    const w = game.world;
    const { next, eligible } = this.plan;
    const p = game.player;
    for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x;
      if (!eligible[i] || w.visible[i]) continue;
      if (Math.abs(x - p.tx) <= 1 && Math.abs(y - p.ty) <= 1) continue;
      w.setTerrain(i, next[i]);
      w.explored[i] = 0;
      w.fire[i] = 0;
      w.scrib[i] = 0;
      w.ash[i] = 0;
    }
    w.version++;
  }

  finish(game) {
    this.sweeping = false;
    this.count++;
    this.timeLeft = this.interval;
    this.warned = false;
    this.plan = null;
    const w = game.world;
    const changed = [];
    for (let i = 0; i < w.n; i++) if (this._eligible[i] && !w.explored[i]) changed.push(i);
    this._eligible = null;
    const rescue = this.ensureBeatable(game);
    w.markAllDirty();
    game.afterTerrainChange();
    game.onRewrite(changed);
    game.events.emit('rewriteEnd', { count: this.count, rescue });
  }

  /** Solver safety net: the stairs must stay reachable with the ink you hold. */
  ensureBeatable(game) {
    const w = game.world;
    const exit = w.idx(w.exit.x, w.exit.y);
    const budget = Math.floor(game.run.ink);
    let cost = minInkCost(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, exit);
    if (cost <= budget) return null;
    // 1) Dig through hidden rock.
    const canCarve = (i) => !w.visible[i] && w.terrain[i] === T.ROCK;
    cost = carveRoute(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, exit, canCarve);
    if (cost <= budget) return 'carved';
    // 2) Still short of ink: a fresh ink pool wells up somewhere you can reach.
    const { dist } = inkField(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile);
    const cands = [];
    for (let i = 0; i < w.n; i++) if (dist[i] === 0 && w.terrain[i] === T.GROUND && i !== game.playerTile) cands.push(i);
    if (cands.length) {
      const hidden = cands.filter((i) => !w.visible[i]);
      const pick = (hidden.length ? hidden : cands)[Math.floor(game.rng.next() * (hidden.length || cands.length))];
      w.setTerrain(pick, T.POOL);
      w.explored[pick] = 1;
      game.events.emit('toast', { text: 'Fresh ink wells up somewhere on your map...', kind: 'info' });
      return 'pool';
    }
    return 'stuck';
  }
}
