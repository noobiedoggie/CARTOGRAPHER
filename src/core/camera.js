/**
 * 2D camera: follows the explorer, supports manual pan offsets (quick swipe),
 * pinch zoom around a focal point, and screen shake.
 */
import { TILE, BAL } from '../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Camera {
  constructor() {
    this.x = 0; // world px at the screen centre
    this.y = 0;
    this.viewW = 360;
    this.viewH = 640;
    this.baseZoom = 1;
    this.userZoom = 1;
    this.zoom = 1;
    this.panX = 0; // manual offset from the follow target (world px)
    this.panY = 0;
    this.panHold = 0; // seconds before the manual offset starts relaxing
    this.shakeAmt = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.bounds = null; // {w,h} in world px
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.baseZoom = w / (BAL.tilesAcross * TILE);
    this.zoom = this.baseZoom * this.userZoom;
  }

  setUserZoom(z) {
    this.userZoom = clamp(z, 0.55, 2.4);
    this.zoom = this.baseZoom * this.userZoom;
  }

  /** Zoom by `factor` keeping the world point under screen (sx,sy) fixed. */
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.setUserZoom(this.userZoom * factor);
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.panX += wx - nx;
    this.panY += wy - ny;
    this.panHold = 2.5;
  }

  /** Pan by a screen-space delta (finger drag). */
  panBy(dxScreen, dyScreen) {
    const dx = -dxScreen / this.zoom;
    const dy = -dyScreen / this.zoom;
    this.panX += dx;
    this.panY += dy;
    this.x += dx;
    this.y += dy;
    this.panHold = 2.5;
    this._clampPan();
  }

  _clampPan() {
    const lim = 14 * TILE;
    this.panX = clamp(this.panX, -lim, lim);
    this.panY = clamp(this.panY, -lim * 1.6, lim * 1.6);
  }

  /** Release the manual offset so the camera re-centres on the explorer. */
  recenter() {
    this.panHold = 0;
  }

  /** Follow target world position. */
  follow(tx, ty, dt, snap = false) {
    if (this.panHold > 0) this.panHold -= dt;
    else {
      const relax = 1 - Math.exp(-dt * 1.8);
      this.panX -= this.panX * relax;
      this.panY -= this.panY * relax;
    }
    let gx = tx + this.panX;
    let gy = ty + this.panY;
    if (this.bounds) {
      // Keep the map mostly on screen.
      const hw = this.viewW / 2 / this.zoom;
      const hh = this.viewH / 2 / this.zoom;
      const m = TILE * 2;
      gx = this.bounds.w < hw * 2 - 2 * m ? this.bounds.w / 2 : clamp(gx, hw - m, this.bounds.w - hw + m);
      gy = this.bounds.h < hh * 2 - 2 * m ? this.bounds.h / 2 : clamp(gy, hh - m * 2, this.bounds.h - hh + m * 2);
    }
    if (snap) {
      this.x = gx;
      this.y = gy;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      this.x += (gx - this.x) * k;
      this.y += (gy - this.y) * k;
    }
    // Screen shake
    if (this.shakeAmt > 0.05) {
      this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 9);
    } else {
      this.shakeAmt = this.shakeX = this.shakeY = 0;
    }
  }

  shake(px) {
    this.shakeAmt = Math.max(this.shakeAmt, px);
  }

  worldToScreen(wx, wy) {
    return [(wx - this.x) * this.zoom + this.viewW / 2 + this.shakeX, (wy - this.y) * this.zoom + this.viewH / 2 + this.shakeY];
  }

  screenToWorld(sx, sy) {
    return [(sx - this.viewW / 2) / this.zoom + this.x, (sy - this.viewH / 2) / this.zoom + this.y];
  }

  /** Set a canvas transform so drawing happens in world px. */
  apply(ctx, dpr) {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, dpr * (this.viewW / 2 + this.shakeX) - this.x * z, dpr * (this.viewH / 2 + this.shakeY) - this.y * z);
  }

  /** Tile rectangle currently on screen (inclusive), padded by `pad` tiles. */
  visibleTiles(pad = 1) {
    const hw = this.viewW / 2 / this.zoom;
    const hh = this.viewH / 2 / this.zoom;
    return {
      x0: Math.floor((this.x - hw) / TILE) - pad,
      y0: Math.floor((this.y - hh) / TILE) - pad,
      x1: Math.floor((this.x + hw) / TILE) + pad,
      y1: Math.floor((this.y + hh) / TILE) + pad,
    };
  }
}
