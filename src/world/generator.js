/**
 * Procedural floor generation.
 *
 *  1. Cellular automata carve organic caves out of solid rock.
 *  2. Meandering rifts (chasms or rivers) cut across the whole map, so the
 *     explorer MUST spend ink on bridges - narrow crossing points are the
 *     reward for exploring.
 *  3. Lakes, ruins (stable ancient floor) and tiny-pocket cleanup.
 *  4. Start near the bottom, stairs near the top.
 *  5. The solver checks the minimum ink cost from start to exit; floors that
 *     are too cheap (ink wouldn't matter) or too expensive (unfair) are
 *     rejected and regenerated.
 *  6. Ink pools, chests (and boss anchors) are spread over reachable ground.
 */
import { RNG } from '../core/rng.js';
import { MAP_W, MAP_H, BOSS_FLOOR, BAL } from '../config.js';
import { T, terrainWalkable } from './tiles.js';
import { inkField } from './solver.js';

const MIN_COST = [0, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7];

/** Difficulty profile for a floor number (1-based). */
export function floorParams(floor) {
  const boss = floor >= BOSS_FLOOR;
  let rifts;
  if (boss) rifts = { count: 2, minW: 2, maxW: 3 };
  else if (floor <= 1) rifts = { count: 1, minW: 2, maxW: 3 };
  else if (floor === 2) rifts = { count: 2, minW: 1, maxW: 3 };
  else if (floor <= 4) rifts = { count: 2, minW: 2, maxW: 3 };
  else if (floor <= 7) rifts = { count: 3, minW: 1, maxW: 3 };
  else rifts = { count: 3, minW: 2, maxW: 4 };
  return {
    floor,
    boss,
    fill: boss ? 0.37 : Math.min(0.455, 0.42 + floor * 0.0035),
    rifts,
    riverChance: floor <= 1 ? 0 : 0.35,
    lakes: boss ? 1 : floor <= 1 ? 1 : 2 + (floor >= 5 ? 1 : 0),
    ruins: boss ? 3 : 2 + (floor >= 5 ? 1 : 0),
    pools: boss ? 3 : floor <= 3 ? 3 : 2 + (floor >= 7 ? 1 : 0),
    chests: boss ? 1 : 2 + (floor >= 4 ? 1 : 0),
    minCost: boss ? 4 : MIN_COST[Math.min(floor, MIN_COST.length - 1)],
    maxCost: Math.floor(BAL.startInk * 0.55),
  };
}

// ---------------------------------------------------------------------------
// Terrain layers
// ---------------------------------------------------------------------------

/** Classic cave cellular automaton (4-5 rule, with an R2 clause early on to break up big voids). */
function caveCA(rng, w, h, fill) {
  let a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      a[y * w + x] = border || rng.next() < fill ? T.ROCK : T.GROUND;
    }
  }
  const rockAt = (arr, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : arr[y * w + x] === T.ROCK ? 1 : 0);
  for (let iter = 0; iter < 5; iter++) {
    const b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          b[y * w + x] = T.ROCK;
          continue;
        }
        let n1 = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n1 += rockAt(a, x + dx, y + dy);
        let rock = n1 >= 5;
        if (iter < 3) {
          let n2 = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) n2 += rockAt(a, x + dx, y + dy);
          rock = rock || n2 <= 2;
        }
        b[y * w + x] = rock ? T.ROCK : T.GROUND;
      }
    }
    a = b;
  }
  return a;
}

/** Smooth 1D value noise in [0,1] for rift widths. */
function noise1D(rng, len, period) {
  const pts = [];
  for (let i = 0; i <= Math.ceil(len / period) + 1; i++) pts.push(rng.next());
  return (x) => {
    const f = x / period;
    const i = Math.floor(f);
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    return pts[i] * (1 - s) + pts[i + 1] * s;
  };
}

/**
 * A horizontal-ish band of chasm/water that spans the map. It only replaces
 * ground; rock stays rock, so the band is always an unbroken barrier.
 */
function carveRift(rng, terr, w, h, y0, minW, maxW, kind) {
  const widthNoise = noise1D(rng, w, rng.int(4, 7));
  let cy = y0;
  for (let x = 1; x < w - 1; x++) {
    // Random walk of the centre row, at most one row per column (keeps the band 4-connected-tight).
    const drift = (y0 - cy) * 0.15;
    const r = rng.next() + drift * 0.5;
    if (r < 0.28) cy -= 1;
    else if (r > 0.72) cy += 1;
    cy = Math.max(4, Math.min(h - 5, cy));
    const wd = Math.max(minW, Math.min(maxW, minW + Math.round(widthNoise(x) * (maxW - minW + 0.6) - 0.3)));
    const top = cy - Math.floor((wd - 1) / 2);
    for (let y = top; y < top + wd; y++) {
      if (y <= 0 || y >= h - 1) continue;
      const i = y * w + x;
      if (terr[i] !== T.ROCK) terr[i] = kind;
    }
  }
}

/** Grow a blob of water over ground tiles. */
function growLake(rng, terr, w, h, size) {
  for (let tries = 0; tries < 30; tries++) {
    const x = rng.int(3, w - 4);
    const y = rng.int(8, h - 9);
    if (terr[y * w + x] !== T.GROUND) continue;
    const blob = [y * w + x];
    const inBlob = new Set(blob);
    while (blob.length < size) {
      const from = rng.pick(blob);
      const fx = from % w;
      const fy = (from / w) | 0;
      const d = rng.int(0, 3);
      const nx = fx + [1, -1, 0, 0][d];
      const ny = fy + [0, 0, 1, -1][d];
      if (nx < 2 || ny < 2 || nx >= w - 2 || ny >= h - 2) continue;
      const ni = ny * w + nx;
      if (inBlob.has(ni) || terr[ni] !== T.GROUND) {
        if (rng.chance(0.08)) break;
        continue;
      }
      inBlob.add(ni);
      blob.push(ni);
    }
    for (const i of blob) terr[i] = T.WATER;
    return;
  }
}

/** Fill unreachable little pockets (< minSize non-rock tiles) with rock. */
function fillPockets(terr, w, h, minSize) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || terr[s] === T.ROCK) continue;
    const comp = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
      for (const ni of nb) {
        if (ni < 0 || seen[ni] || terr[ni] === T.ROCK) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    if (comp.length < minSize) for (const c of comp) terr[c] = T.ROCK;
  }
}

/**
 * Terrain only (no start/exit/features). Also used by rewrite waves to
 * produce a fresh candidate world.
 */
export function generateTerrain(rng, params, w = MAP_W, h = MAP_H) {
  const terr = caveCA(rng, w, h, params.fill);
  // Rifts spaced evenly between the start (bottom) and exit (top) bands.
  const { count, minW, maxW } = params.rifts;
  const span = h - 20;
  for (let r = 0; r < count; r++) {
    const y0 = Math.round(10 + ((r + 1) * span) / (count + 1) + rng.int(-2, 2));
    const kind = rng.chance(params.riverChance) ? T.WATER : T.CHASM;
    carveRift(rng, terr, w, h, y0, minW, maxW, kind);
  }
  for (let l = 0; l < params.lakes; l++) growLake(rng, terr, w, h, rng.int(5, 16));
  fillPockets(terr, w, h, 10);
  return terr;
}

/** Stamp a few rectangular patches of ancient ruins over ground. */
function placeRuins(rng, terr, w, h, count) {
  const ruins = [];
  for (let r = 0, tries = 0; r < count && tries < 80; tries++) {
    const rw = rng.int(4, 6);
    const rh = rng.int(3, 5);
    const x0 = rng.int(2, w - rw - 2);
    const y0 = rng.int(8, h - rh - 8);
    let ground = 0;
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) if (terr[y * w + x] === T.GROUND) ground++;
    if (ground < rw * rh * 0.6) continue;
    const tiles = [];
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        const i = y * w + x;
        if (terr[i] === T.GROUND) {
          terr[i] = T.RUINS;
          tiles.push(i);
        }
      }
    }
    ruins.push(tiles);
    r++;
  }
  return ruins;
}

/** Pick an open tile inside a band of rows (prefers tiles with open neighbours). */
function pickOpenTile(rng, terr, w, h, y0, y1) {
  let best = -1;
  let bestScore = -1;
  for (let k = 0; k < 160; k++) {
    const x = rng.int(3, w - 4);
    const y = rng.int(y0, y1);
    const i = y * w + x;
    if (!terrainWalkable(terr[i])) continue;
    let open = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (terrainWalkable(terr[(y + dy) * w + (x + dx)])) open++;
    const score = open + rng.next() * 3;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function clearAround(terr, w, h, cx, cy, r) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      if (terr[i] !== T.RUINS) terr[i] = T.GROUND;
    }
  }
}

/** Choose `count` well-spread tiles from candidates. */
function spreadPick(rng, candidates, count, w, avoid, minDist) {
  const chosen = [];
  rng.shuffle(candidates);
  const far = (i, list, d) =>
    list.every((j) => Math.abs((i % w) - (j % w)) + Math.abs(((i / w) | 0) - ((j / w) | 0)) >= d);
  for (let d = minDist; d >= 2 && chosen.length < count; d -= 2) {
    for (const c of candidates) {
      if (chosen.length >= count) break;
      if (chosen.includes(c)) continue;
      if (far(c, chosen, d) && far(c, avoid, d)) chosen.push(c);
    }
  }
  return chosen;
}

/**
 * Generate a complete, validated floor.
 * @returns {{terrain:Uint8Array, start:{x,y}, exit:{x,y}, cost:number, anchors:number[], attempts:number, params:object}}
 */
export function generateFloor(floor, seed, w = MAP_W, h = MAP_H) {
  const params = floorParams(floor);
  const rng = new RNG(seed);
  let fallback = null;

  for (let attempt = 1; attempt <= 60; attempt++) {
    const terr = generateTerrain(rng, params, w, h);
    const ruins = placeRuins(rng, terr, w, h, params.ruins);
    const s = pickOpenTile(rng, terr, w, h, h - 7, h - 3);
    const e = pickOpenTile(rng, terr, w, h, 2, 6);
    if (s < 0 || e < 0) continue;
    const sx = s % w;
    const sy = (s / w) | 0;
    const ex = e % w;
    const ey = (e / w) | 0;
    clearAround(terr, w, h, sx, sy, 1);
    clearAround(terr, w, h, ex, ey, 1);
    terr[e] = T.EXIT;

    const field = inkField(w, h, terr, null, null, s);
    const cost = field.dist[e];
    if (cost < 0) continue;
    // A decent pocket of free ground around the start.
    let freeArea = 0;
    for (let i = 0; i < w * h; i++) if (field.dist[i] === 0) freeArea++;
    if (freeArea < 30) continue;

    const ok = cost >= params.minCost && cost <= params.maxCost;
    if (!ok) {
      const miss = cost < params.minCost ? params.minCost - cost : cost - params.maxCost;
      if (!fallback || miss < fallback.miss) fallback = { miss, terr: terr.slice(), s, e, cost, ruins, field };
      continue;
    }
    return finishFloor(rng, params, terr, w, h, s, e, cost, ruins, field, attempt);
  }
  // Extremely unlikely: accept the closest candidate (still solvable).
  const f = fallback;
  return finishFloor(rng, params, f.terr, w, h, f.s, f.e, f.cost, f.ruins, f.field, 61);
}

function finishFloor(rng, params, terr, w, h, s, e, cost, ruins, field, attempts) {
  const dist = field.dist;
  const sx = s % w;
  const sy = (s / w) | 0;
  const manhattan = (i) => Math.abs((i % w) - sx) + Math.abs(((i / w) | 0) - sy);
  const nearFeature = (i) => {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = terr[(y + dy) * w + (x + dx)];
        if (t === T.POOL || t === T.CHEST || t === T.EXIT || t === T.ANCHOR) return true;
      }
    return false;
  };
  const placed = [s, e];

  // Anchors (boss floor): three seals at different heights, alternating sides.
  const anchors = [];
  if (params.boss) {
    const bands = [
      [h - 22, h - 16, 3, Math.floor(w / 2) - 3],
      [h / 2 - 4, h / 2 + 2, Math.floor(w / 2) + 3, w - 4],
      [12, 18, 3, Math.floor(w / 2) - 3],
    ];
    for (const [y0, y1, x0, x1] of bands) {
      const cands = [];
      for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (dist[i] >= 0 && terrainWalkable(terr[i]) && terr[i] !== T.EXIT) cands.push(i);
        }
      if (cands.length) {
        const a = rng.pick(cands);
        terr[a] = T.ANCHOR;
        anchors.push(a);
        placed.push(a);
      }
    }
  }

  // Ink pools. The first one is reachable without ink, so nobody starts stuck.
  const freeCands = [];
  const anyCands = [];
  for (let i = 0; i < w * h; i++) {
    if (terr[i] !== T.GROUND || dist[i] < 0 || manhattan(i) < 7 || nearFeature(i)) continue;
    anyCands.push(i);
    if (dist[i] === 0) freeCands.push(i);
  }
  const pools = [];
  const first = spreadPick(rng, freeCands, 1, w, placed, 8);
  pools.push(...first);
  pools.push(...spreadPick(rng, anyCands, params.pools - pools.length, w, [...placed, ...pools], 9));
  for (const p of pools) terr[p] = T.POOL;
  placed.push(...pools);

  // Chests: prefer ruins.
  const ruinCands = [];
  for (const r of ruins) for (const i of r) if (dist[i] >= 0 && !nearFeature(i)) ruinCands.push(i);
  let chests = spreadPick(rng, ruinCands, params.chests, w, placed, 6);
  if (chests.length < params.chests) {
    const more = anyCands.filter((i) => terr[i] === T.GROUND && !nearFeature(i));
    chests = chests.concat(spreadPick(rng, more, params.chests - chests.length, w, [...placed, ...chests], 7));
  }
  for (const c of chests) terr[c] = T.CHEST;

  return {
    terrain: terr,
    start: { x: sx, y: sy },
    exit: { x: e % w, y: (e / w) | 0 },
    cost,
    anchors,
    attempts,
    params,
  };
}
