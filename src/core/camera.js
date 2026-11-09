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
    this.tilt = 0; // radians - the page buckles during rewrite waves
    this.zoomWobble = 1;
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
    // Keep the explorer a little above centre: the ink picker lives at the bottom.
    let gy = ty + this.panY + 40 / this.zoom;
    if (this.bounds) {
      // Keep the map mostly on screen.
      const hw = this.viewW / 2 / this.zoom;
      const hh = this.viewH / 2 / this.zoom;
      const m = TILE * 2;
      gx = this.bounds.w < hw * 2 - 2 * m ? this.bounds.w / 2 : clamp(gx, hw - m, this.bounds.w - hw + m);
      gy = this.bounds.h < hh * 2 - 2 * m ? this.bounds.h / 2 : clamp(gy, hh - m * 2.5, this.bounds.h - hh + m * 3);
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
    const z = this.zoom * this.zoomWobble;
    const dx = (wx - this.x) * z;
    const dy = (wy - this.y) * z;
    const c = Math.cos(this.tilt);
    const s = Math.sin(this.tilt);
    return [dx * c - dy * s + this.viewW / 2 + this.shakeX, dx * s + dy * c + this.viewH / 2 + this.shakeY];
  }

  screenToWorld(sx, sy) {
    const z = this.zoom * this.zoomWobble;
    const dx = sx - this.viewW / 2;
    const dy = sy - this.viewH / 2;
    const c = Math.cos(-this.tilt);
    const s = Math.sin(-this.tilt);
    return [(dx * c - dy * s) / z + this.x, (dx * s + dy * c) / z + this.y];
  }

  /** Set a canvas transform so drawing happens in world px (zoom, tilt, shake). */
  apply(ctx, dpr) {
    const z = this.zoom * this.zoomWobble * dpr;
    const c = Math.cos(this.tilt) * z;
    const s = Math.sin(this.tilt) * z;
    const ox = dpr * (this.viewW / 2 + this.shakeX);
    const oy = dpr * (this.viewH / 2 + this.shakeY);
    ctx.setTransform(c, s, -s, c, ox - (this.x * c - this.y * s), oy - (this.x * s + this.y * c));
  }

  /** Tile rectangle currently on screen (inclusive), padded by `pad` tiles. */
  visibleTiles(pad = 1) {
    const grow = this.tilt ? 1.25 : 1;
    const hw = (this.viewW / 2 / this.zoom) * grow;
    const hh = (this.viewH / 2 / this.zoom) * grow;
    return {
      x0: Math.floor((this.x - hw) / TILE) - pad,
      y0: Math.floor((this.y - hh) / TILE) - pad,
      x1: Math.floor((this.x + hw) / TILE) + pad,
      y1: Math.floor((this.y + hh) / TILE) + pad,
    };
  }
}
