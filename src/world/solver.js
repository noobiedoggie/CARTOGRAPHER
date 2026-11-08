/**
 * Floor solver. Answers "what is the least ink needed to get from A to B?"
 *
 * Each tile has an ink need: 0 if the explorer can already stand on it,
 * 1 if a single tile of black ink would make it walkable (chasm, water,
 * walls), or impossible (rock). A 0-1 BFS over the 4-neighbour grid then
 * gives the exact minimum ink cost. The generator and every rewrite wave use
 * it to guarantee a floor is always beatable by a player who uses ink wisely.
 */
import { T, INK, terrainWalkable, isBridgeable } from './tiles.js';

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

/** 0 = walkable, 1 = needs one ink tile, -1 = impossible. */
export function inkNeed(terrain, ink, scrib, i) {
  const t = terrain[i];
  if (t === T.ROCK) return -1;
  const k = ink ? ink[i] : 0;
  if (k === INK.BLACK) return 0;
  if (k === INK.BLUE || k === INK.RED) return 1;
  if (scrib && scrib[i] > 0) return 1;
  if (terrainWalkable(t)) return 0;
  if (isBridgeable(t)) return 1;
  return -1;
}

/**
 * 0-1 BFS from `start`. Returns { dist, prev } where dist[i] is the minimum
 * ink needed to reach tile i (-1 = unreachable).
 */
export function inkField(w, h, terrain, ink, scrib, start) {
  const n = w * h;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const best = new Int32Array(n).fill(0x7fffffff);
  // Circular deque. Each node can be pushed a few times; 4n is plenty.
  const cap = n * 4;
  const dq = new Int32Array(cap);
  let head = 0;
  let size = 0;
  const pushFront = (v) => {
    head = (head - 1 + cap) % cap;
    dq[head] = v;
    size++;
  };
  const pushBack = (v) => {
    dq[(head + size) % cap] = v;
    size++;
  };
  best[start] = 0;
  pushBack(start);
  while (size > 0) {
    const cur = dq[head];
    head = (head + 1) % cap;
    size--;
    if (dist[cur] !== -1) continue; // already finalised
    dist[cur] = best[cur];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX4[k];
      const ny = cy + DY4[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      const need = inkNeed(terrain, ink, scrib, ni);
      if (need < 0) continue;
      const nd = dist[cur] + need;
      if (nd < best[ni]) {
        best[ni] = nd;
        prev[ni] = cur;
        if (need === 0) pushFront(ni);
        else pushBack(ni);
      }
    }
  }
  return { dist, prev };
}

/** Minimum ink to travel from tile index a to b (Infinity if impossible). */
export function minInkCost(w, h, terrain, ink, scrib, a, b) {
  const { dist } = inkField(w, h, terrain, ink, scrib, a);
  return dist[b] < 0 ? Infinity : dist[b];
}

/** Cheapest route as { cost, path: tileIndices (start..end) }. */
export function cheapestRoute(w, h, terrain, ink, scrib, a, b) {
  const { dist, prev } = inkField(w, h, terrain, ink, scrib, a);
  if (dist[b] < 0) return { cost: Infinity, path: [] };
  const path = [];
  for (let c = b; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  return { cost: dist[b], path };
}

/**
 * Emergency fallback: find a route that may dig through rock (carvable tiles
 * cost `rockCost`) and turn the rock along it into ground. Returns the ink
 * cost of the resulting route.
 */
export function carveRoute(w, h, terrain, ink, scrib, a, b, canCarve, rockCost = 6) {
  const n = w * h;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  // Small n (2400) - a simple O(n^2)-worst Dijkstra with a bucket queue.
  const buckets = [];
  const push = (i, d) => {
    (buckets[d] || (buckets[d] = [])).push(i);
  };
  dist[a] = 0;
  push(a, 0);
  outer: for (let d = 0; d < buckets.length; d++) {
    const list = buckets[d];
    if (!list) continue;
    for (let q = 0; q < list.length; q++) {
      const cur = list[q];
      if (done[cur] || dist[cur] !== d) continue;
      done[cur] = 1;
      if (cur === b) break outer;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX4[k];
        const ny = cy + DY4[k];
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const ni = ny * w + nx;
        if (done[ni]) continue;
        let need = inkNeed(terrain, ink, scrib, ni);
        if (need < 0) {
          if (!canCarve(ni)) continue;
          need = rockCost;
        }
        const nd = d + need;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          prev[ni] = cur;
          push(ni, nd);
        }
      }
    }
  }
  if (!isFinite(dist[b])) return Infinity;
  for (let c = b; c !== -1; c = prev[c]) {
    if (terrain[c] === T.ROCK) terrain[c] = T.GROUND;
  }
  return minInkCost(w, h, terrain, ink, scrib, a, b);
}
