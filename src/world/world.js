/**
 * World: the tile grid for one floor.
 *
 * Layers (all flat typed arrays indexed by y * w + x):
 *   terrain  - base tile type (T.*)
 *   ink      - player ink on top of terrain (INK.*); permanent for the floor
 *   inkAnim  - 0..1 bleed-in animation progress for freshly drawn ink
 *   scrib    - seconds left on an enemy Scribbler wall (0 = none)
 *   fire     - seconds left burning (0 = not burning)
 *   ash      - cooldown so a burnt tile does not re-ignite immediately
 *   explored - 1 once the explorer has seen the tile (stays as a sketch)
 *   visible  - 1 while the tile is inside the current vision cone
 */
import { CHUNK } from '../config.js';
import { T, INK, MOVER, terrainWalkable } from './tiles.js';

export class World {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.n = n;
    this.terrain = new Uint8Array(n);
    this.ink = new Uint8Array(n);
    this.inkAnim = new Float32Array(n).fill(1);
    this.scrib = new Float32Array(n);
    this.fire = new Float32Array(n);
    this.ash = new Float32Array(n);
    this.explored = new Uint8Array(n);
    this.visible = new Uint8Array(n);
    this.cw = Math.ceil(w / CHUNK);
    this.ch = Math.ceil(h / CHUNK);
    /** Render-cache invalidation flags, one per chunk. */
    this.chunkDirty = new Uint8Array(this.cw * this.ch).fill(1);
    /** Bumped whenever walkability may have changed (lets AI cache paths). */
    this.version = 0;
    this.start = { x: 1, y: h - 2 };
    this.exit = { x: 1, y: 1 };
  }

  idx(x, y) {
    return y * this.w + x;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  xOf(i) {
    return i % this.w;
  }
  yOf(i) {
    return (i / this.w) | 0;
  }

  /** Flag the chunks around tile i for re-rendering (edges depend on neighbours). */
  markDirty(i) {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    const cx0 = Math.max(0, ((x - 1) / CHUNK) | 0);
    const cx1 = Math.min(this.cw - 1, ((x + 1) / CHUNK) | 0);
    const cy0 = Math.max(0, ((y - 1) / CHUNK) | 0);
    const cy1 = Math.min(this.ch - 1, ((y + 1) / CHUNK) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.chunkDirty[cy * this.cw + cx] = 1;
    this.version++;
  }

  markAllDirty() {
    this.chunkDirty.fill(1);
    this.version++;
  }

  setTerrain(i, t) {
    if (this.terrain[i] !== t) {
      this.terrain[i] = t;
      this.markDirty(i);
    }
  }

  setInk(i, k, animate = false) {
    if (this.ink[i] !== k) {
      this.ink[i] = k;
      this.inkAnim[i] = animate ? 0 : 1;
      this.markDirty(i);
    }
  }

  /** Can `mover` stand on tile i right now? */
  canWalk(i, mover) {
    const k = this.ink[i];
    if (k === INK.BLUE || k === INK.RED) return false;
    if (this.scrib[i] > 0 && mover !== MOVER.SCRIBBLER) return false;
    if (mover !== MOVER.PLAYER && this.fire[i] > 0) return false; // enemies fear fire
    if (k === INK.BLACK) return true; // paths and bridges (never drawn on rock)
    return terrainWalkable(this.terrain[i]);
  }

  canWalkXY(x, y, mover) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.canWalk(y * this.w + x, mover);
  }

  /** Blocks line of sight (vision and projectiles use slightly different rules). */
  isOpaque(i) {
    return this.terrain[i] === T.ROCK;
  }

  /** Blocks projectiles: rock and red ink walls. */
  blocksShot(i) {
    return this.terrain[i] === T.ROCK || this.ink[i] === INK.RED;
  }

  loadTerrain(arr) {
    this.terrain.set(arr);
    this.ink.fill(0);
    this.inkAnim.fill(1);
    this.scrib.fill(0);
    this.fire.fill(0);
    this.ash.fill(0);
    this.explored.fill(0);
    this.visible.fill(0);
    this.markAllDirty();
  }
}
