/**
 * Fog of war, drawn as aged blank parchment over the map.
 *
 * The fog is a small RGBA bitmap (4x4 pixels per tile) that is magnified with
 * bilinear smoothing, which gives soft vision edges for free. Each tile has:
 *   burn - reveal progress 0..1. When a tile is first explored its fog "burns"
 *          away: pixels whose noise value is below the burn front disappear
 *          and a glowing char line runs along the front, like burning paper.
 *   vis  - smoothed visibility; explored-but-not-visible tiles keep a light
 *          wash so they read as a faded sketch.
 */
import { TILE } from '../config.js';
import { mulberry32 } from '../core/rng.js';

const SUB = 4;
const SKETCH_ALPHA = 0.5;
const FOG = [214, 197, 160];
const SKETCH = [228, 214, 180];

export class FogRenderer {
  constructor(world) {
    this.reset(world);
  }

  reset(world) {
    this.world = world;
    const { w, h, n } = world;
    this.W = w * SUB;
    this.H = h * SUB;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.W, this.H);
    this.burn = new Float32Array(n);
    this.vis = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.reforming = new Uint8Array(n);
    // Per-pixel noise: smooth lattice noise + a little grain, so burn fronts look organic.
    const rand = mulberry32(5150);
    const L = 3;
    const gw = Math.ceil(this.W / L) + 2;
    const gh = Math.ceil(this.H / L) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    this.noise = new Float32Array(this.W * this.H);
    this.tex = new Float32Array(this.W * this.H);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const fx = x / L;
        const fy = y / L;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const a = grid[y0 * gw + x0];
        const b = grid[y0 * gw + x0 + 1];
        const c = grid[(y0 + 1) * gw + x0];
        const d = grid[(y0 + 1) * gw + x0 + 1];
        const s = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        this.noise[y * this.W + x] = s * 0.75 + rand() * 0.25;
        this.tex[y * this.W + x] = rand();
      }
    }
    for (let i = 0; i < n; i++) this._writeTile(i);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Advance animations; `px,py` = explorer tile (burn spreads outward from it). */
  update(dt, px, py) {
    const world = this.world;
    const { explored, visible, w, n } = world;
    const burn = this.burn;
    const vis = this.vis;
    const state = this.state;
    let minX = 1e9;
    let minY = 1e9;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < n; i++) {
      let changed = false;
      const ex = explored[i];
      if (ex && !state[i]) {
        state[i] = 1;
        this.reforming[i] = 0;
        const x = i % w;
        const y = (i / w) | 0;
        // Further tiles start burning a little later -> ripple outward.
        burn[i] = Math.min(burn[i], -Math.hypot(x - px, y - py) * 0.045);
        changed = true;
      } else if (!ex && state[i]) {
        state[i] = 0;
        this.reforming[i] = 1;
        changed = true;
      }
      if (state[i]) {
        if (burn[i] < 1) {
          burn[i] = Math.min(1, burn[i] + dt / 0.6);
          changed = true;
        }
      } else if (burn[i] > 0) {
        burn[i] = Math.max(0, burn[i] - dt / 0.9);
        changed = true;
      }
      const tv = visible[i] ? 1 : 0;
      if (vis[i] !== tv) {
        const d = tv - vis[i];
        const stepv = dt * 4.5;
        vis[i] = Math.abs(d) <= stepv ? tv : vis[i] + Math.sign(d) * stepv;
        changed = true;
      }
      if (changed) {
        this._writeTile(i);
        const x = i % w;
        const y = (i / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) {
      this.ctx.putImageData(this.img, 0, 0, minX * SUB, minY * SUB, (maxX - minX + 1) * SUB, (maxY - minY + 1) * SUB);
    }
  }

  /** Instantly settle everything (used on floor start / menus). */
  settle() {
    const { explored, visible, n } = this.world;
    for (let i = 0; i < n; i++) {
      this.state[i] = explored[i];
      this.burn[i] = explored[i] ? 1 : 0;
      this.vis[i] = visible[i];
      this.reforming[i] = 0;
      this._writeTile(i);
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  _writeTile(i) {
    const w = this.world.w;
    const x = i % w;
    const y = (i / w) | 0;
    const d = this.img.data;
    const b = this.burn[i];
    const thr = b * 1.3 - 0.15;
    const sketchA = SKETCH_ALPHA * (1 - this.vis[i]) * 255;
    const reform = this.reforming[i];
    for (let sy = 0; sy < SUB; sy++) {
      let p = (y * SUB + sy) * this.W + x * SUB;
      for (let sx = 0; sx < SUB; sx++, p++) {
        const nz = this.noise[p];
        const q = p * 4;
        if (b <= 0 || nz > thr) {
          const t = 0.93 + this.tex[p] * 0.12;
          d[q] = FOG[0] * t;
          d[q + 1] = FOG[1] * t;
          d[q + 2] = FOG[2] * t;
          d[q + 3] = 255;
        } else if (nz > thr - 0.13) {
          const e = (nz - (thr - 0.13)) / 0.13; // 0 = inner (charred) .. 1 = outer (glowing)
          if (reform) {
            d[q] = 150;
            d[q + 1] = 128;
            d[q + 2] = 98;
            d[q + 3] = 200;
          } else if (e > 0.55) {
            d[q] = 245;
            d[q + 1] = 150 + e * 60;
            d[q + 2] = 60;
            d[q + 3] = 255;
          } else {
            d[q] = 70 + e * 90;
            d[q + 1] = 40 + e * 50;
            d[q + 2] = 20;
            d[q + 3] = 255 * Math.min(1, 0.5 + e);
          }
        } else {
          d[q] = SKETCH[0];
          d[q + 1] = SKETCH[1];
          d[q + 2] = SKETCH[2];
          d[q + 3] = sketchA;
        }
      }
    }
  }

  draw(ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, this.world.w * TILE, this.world.h * TILE);
  }
}
