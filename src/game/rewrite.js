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
      const before = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      const now = Math.ceil(this.timeLeft);
      if (now !== before && now <= 3 && now >= 1) game.events.emit('rewriteTick', { n: now });
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
    this._lastTear = this.plan.tear.size;
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

    // Build several candidate worlds. The wave is hostile: it keeps the one
    // that makes your route MOST expensive while still affordable with the
    // ink you hold (with a little margin). A tear is ripped across the way
    // ahead, just beyond your sight - only your ink lines survive it.
    const margin = 2;
    const nowCost = minInkCost(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, exit);
    // Hurt, but within reason: a few ink more than the route costs now.
    const cap = Math.min(budget - margin, (isFinite(nowCost) ? nowCost : 0) + 3 + Math.ceil(game.floor / 5));
    let hardest = null;
    let cheapest = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = generateTerrain(rng, params, w.w, w.h);
      const next = w.terrain.slice();
      for (let i = 0; i < w.n; i++) if (eligible[i]) next[i] = cand[i];
      this._placeLoose(rng, next, eligible, loose, w);
      const tear = this._tear(game, rng, next, eligible);
      const cost = minInkCost(w.w, w.h, next, w.ink, scrib, game.playerTile, exit);
      const plan = { next, eligible, cost, tear };
      if (!cheapest || cost < cheapest.cost) cheapest = plan;
      if (cost <= cap && (!hardest || cost > hardest.cost)) hardest = plan;
    }
    return hardest || cheapest;
  }

  /**
   * Rip a band of void/chasm/water across the map a few tiles past the edge
   * of the explorer's vision, towards the stairs. Only eligible (unseen,
   * un-inked) ground is torn, so an inked path punches straight through it.
   */
  _tear(game, rng, next, eligible) {
    const w = game.world;
    const p = game.player;
    const e = w.exit;
    const dir = e.y < p.ty ? -1 : 1;
    const vision = Math.ceil(game.run.vision);
    if (Math.abs(e.y - p.ty) < vision + 5) return new Set();
    const kind = rng.pick([T.VOID, T.VOID, T.CHASM, T.WATER]);
    const width = game.floor >= 5 ? 3 : 2;
    let cy = p.ty + dir * (vision + 2 + rng.int(0, 1));
    const torn = new Set();
    for (let x = 1; x < w.w - 1; x++) {
      if (rng.next() < 0.3) cy += rng.next() < 0.5 ? -1 : 1;
      for (let k = 0; k < width; k++) {
        const y = cy + dir * k;
        if (y <= 1 || y >= w.h - 2) continue;
        const i = y * w.w + x;
        if (!eligible[i] || next[i] !== T.GROUND) continue;
        next[i] = kind;
        torn.add(i);
      }
    }
    return torn;
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
      // The fog rolls back over the rewritten page - except the fresh tear,
      // which stays sketched on your map so you know your way was cut.
      w.explored[i] = this.plan.tear.has(i) ? 1 : 0;
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
    game.events.emit('rewriteEnd', { count: this.count, rescue, cut: this._lastTear > 0 });
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
