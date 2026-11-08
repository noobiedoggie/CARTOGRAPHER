/**
 * A* pathfinding on the tile grid (8 directions, no corner cutting) plus a
 * few BFS helpers. Buffers are allocated once per map size and re-used with
 * a "stamp" trick so a search never has to clear arrays.
 */

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Binary min-heap of node indices keyed by float priority. */
class MinHeap {
  constructor(cap) {
    this.items = new Int32Array(cap);
    this.pri = new Float32Array(cap);
    this.size = 0;
  }
  clear() {
    this.size = 0;
  }
  push(item, p) {
    if (this.size >= this.items.length) {
      const ni = new Int32Array(this.items.length * 2);
      ni.set(this.items);
      const np = new Float32Array(this.pri.length * 2);
      np.set(this.pri);
      this.items = ni;
      this.pri = np;
    }
    let i = this.size++;
    const items = this.items;
    const pri = this.pri;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      items[i] = items[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    items[i] = item;
    pri[i] = p;
  }
  pop() {
    const items = this.items;
    const pri = this.pri;
    const top = items[0];
    const n = --this.size;
    if (n > 0) {
      const item = items[n];
      const p = pri[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= p) break;
        items[i] = items[c];
        pri[i] = pri[c];
        i = c;
      }
      items[i] = item;
      pri[i] = p;
    }
    return top;
  }
}

function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
}

export class Pathfinder {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new MinHeap(n * 2);
  }

  /**
   * Find a path from (sx,sy) to (tx,ty).
   * @param {(i:number)=>boolean} passable
   * @param {object} [opts]
   * @param {number} [opts.maxNodes=4000] expansion budget
   * @param {(i:number)=>number} [opts.cost] per-tile cost multiplier (>= 1)
   * @param {boolean} [opts.partial] if the goal is unreachable, return a path to the closest node found
   * @returns {number[]|null} tile indices from the first step to the goal (start excluded)
   */
  find(sx, sy, tx, ty, passable, opts = {}) {
    const { w, h, g, parent, seen, closed, heap } = this;
    const maxNodes = opts.maxNodes ?? 4000;
    const costFn = opts.cost;
    if (++this.stamp >= 0xffffffff) {
      seen.fill(0);
      closed.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    const start = sy * w + sx;
    const goal = ty * w + tx;
    if (start === goal) return [];
    heap.clear();
    g[start] = 0;
    seen[start] = stamp;
    parent[start] = -1;
    heap.push(start, octile(sx, sy, tx, ty));
    let best = start;
    let bestH = octile(sx, sy, tx, ty);
    let expanded = 0;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      if (cur === goal) return this._build(goal, start);
      if (++expanded > maxNodes) break;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const hc = octile(cx, cy, tx, ty);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (closed[ni] === stamp) continue;
        if (!passable(ni)) continue;
        const diag = d >= 4;
        if (diag && (!passable(cy * w + nx) || !passable(ny * w + cx))) continue;
        const step = (diag ? SQRT2 : 1) * (costFn ? costFn(ni) : 1);
        const ng = g[cur] + step;
        if (seen[ni] !== stamp || ng < g[ni]) {
          seen[ni] = stamp;
          g[ni] = ng;
          parent[ni] = cur;
          heap.push(ni, ng + octile(nx, ny, tx, ty));
        }
      }
    }
    if (opts.partial && best !== start) return this._build(best, start);
    return null;
  }

  _build(end, start) {
    const path = [];
    let c = end;
    while (c !== start && c !== -1) {
      path.push(c);
      c = this.parent[c];
    }
    path.reverse();
    return path;
  }
}

/**
 * Breadth-first search (4-neighbour) from tile `start` over tiles accepted by
 * `through`, returning the first tile index for which `goal(i, dist)` is true.
 * @returns {{i:number, dist:number, prev:Int32Array}|null}
 */
export function bfsFind(w, h, start, through, goal, maxDist = 1e9) {
  const n = w * h;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const cur = queue[head++];
    const d = dist[cur];
    if (goal(cur, d)) return { i: cur, dist: d, prev };
    if (d >= maxDist) continue;
    const x = cur % w;
    const y = (cur / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1 || !through(ni)) continue;
      dist[ni] = d + 1;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  return null;
}

/** Walk a BFS `prev` chain back into a forward path (start excluded). */
export function bfsPath(prev, start, end) {
  const path = [];
  let c = end;
  while (c !== start && c !== -1) {
    path.push(c);
    c = prev[c];
  }
  return path.reverse();
}

/** Nearest tile (by BFS ring distance, ignoring walls) that satisfies pred. */
export function nearestTile(w, h, start, pred, maxDist = 12) {
  const r = bfsFind(w, h, start, () => true, (i) => pred(i), maxDist);
  return r ? r.i : -1;
}

export { DX, DY };
