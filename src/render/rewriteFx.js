/**
 * The rewrite wave, made scary:
 *  - the page CRUMPLES: faceted creases radiating from a crumple point,
 *    alternating light/dark facets, an inky darkening
 *  - INK RUNS down the screen in thick drips
 *  - the camera tilts, sways and shakes
 *  - the explorer's own ink GLOWS, drawn above the fog: the only stable thing
 *
 * `level` ramps 0 -> 1 when a wave starts and decays after it ends;
 * `warn` (0..1) builds up during the last seconds before a wave.
 */
import { TILE } from '../config.js';
import { INK } from '../world/tiles.js';
import { drawInkTile } from './inkPainter.js';

const S = TILE;

export class RewriteFX {
  constructor() {
    this.level = 0;
    this.target = 0;
    this.glow = 0;
    this.glowHold = 0;
    this.time = 0;
    this.facets = [];
    this.creases = [];
    this.drips = [];
  }

  reset() {
    this.level = this.target = this.glow = this.glowHold = 0;
    this.drips.length = 0;
  }

  start(W, H) {
    this.target = 1;
    this.glowHold = 99;
    this._crumple(W, H);
    this.drips.length = 0;
    const n = Math.round(W / 26);
    for (let k = 0; k < n; k++) {
      this.drips.push({
        x: Math.random() * W,
        len: -Math.random() * 120, // staggered starts
        speed: 90 + Math.random() * 220,
        max: H * (0.25 + Math.random() * 0.7),
        width: 3 + Math.random() * 9,
      });
    }
  }

  end() {
    this.target = 0;
    this.glowHold = 2.2;
  }

  /** Faceted crumple: rays from a point to the screen border, plus stray creases. */
  _crumple(W, H) {
    const cx = W * (0.25 + Math.random() * 0.5);
    const cy = H * (0.3 + Math.random() * 0.4);
    const n = 11;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const r = Math.max(W, H);
      // a kinked ray: midpoint jitter makes it read as a fold, not a spoke
      const mx = cx + Math.cos(a) * r * 0.35 + (Math.random() - 0.5) * 40;
      const my = cy + Math.sin(a) * r * 0.35 + (Math.random() - 0.5) * 40;
      pts.push({ mx, my, ex: cx + Math.cos(a) * r, ey: cy + Math.sin(a) * r });
    }
    this.facets = pts.map((p, k) => ({ c: [cx, cy], a: p, b: pts[(k + 1) % n], shade: k % 2 ? 1 : -1, s: 0.5 + Math.random() * 0.5 }));
    this.creases = [];
    for (let k = 0; k < 7; k++) {
      let x = Math.random() * W;
      let y = Math.random() * H;
      let a = Math.random() * Math.PI * 2;
      const line = [[x, y]];
      for (let j = 0; j < 5; j++) {
        a += (Math.random() - 0.5) * 0.9;
        x += Math.cos(a) * (50 + Math.random() * 70);
        y += Math.sin(a) * (50 + Math.random() * 70);
        line.push([x, y]);
      }
      this.creases.push(line);
    }
  }

  update(dt, camera) {
    this.time += dt;
    const rate = this.target > this.level ? 5 : 0.9;
    this.level += (this.target - this.level) * Math.min(1, dt * rate);
    if (this.level < 0.003) this.level = 0;
    if (this.glowHold > 0) {
      this.glowHold -= dt;
      this.glow = Math.min(1, this.glow + dt * 4);
    } else this.glow = Math.max(0, this.glow - dt * 1.2);
    for (const d of this.drips) d.len = Math.min(d.max, d.len + d.speed * dt * (this.target ? 1 : 0.3));
    // The page buckles: tilt, sway and a constant tremor.
    const L = this.level;
    camera.tilt = L * (Math.sin(this.time * 6.5) * 0.022 + Math.sin(this.time * 2.1) * 0.012);
    camera.zoomWobble = 1 + L * 0.035 * Math.sin(this.time * 4.2);
    if (L > 0.05) camera.shake(2 + 5 * L);
  }

  /** Before the fog: nothing. Above the fog: darkening + glowing ink + wave band. */
  drawWorld(ctx, game, vt, time) {
    if (this.glow <= 0 && this.level <= 0) return;
    const w = game.world;
    const x0 = Math.max(0, vt.x0);
    const y0 = Math.max(0, vt.y0);
    const x1 = Math.min(w.w - 1, vt.x1);
    const y1 = Math.min(w.h - 1, vt.y1);
    // Darken the shifting page so the stable ink pops.
    if (this.level > 0) {
      ctx.fillStyle = `rgba(28,32,58,${0.32 * this.level})`;
      ctx.fillRect(x0 * S, y0 * S, (x1 - x0 + 1) * S, (y1 - y0 + 1) * S);
    }
    if (this.glow <= 0) return;
    const pulse = 0.75 + 0.25 * Math.sin(time * 7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,190,70,${0.32 * this.glow * pulse})`;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (w.ink[y * w.w + x] === INK.NONE) continue;
        ctx.beginPath();
        ctx.arc((x + 0.5) * S, (y + 0.5) * S, S * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.restore();
    // Redraw the ink crisp, on top of fog and gloom.
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.glow * 1.2);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (w.ink[y * w.w + x] !== INK.NONE && w.inkAnim[y * w.w + x] >= 1) drawInkTile(ctx, w, x, y, 1);
    ctx.restore();
  }

  /** Screen-space crumple, creases and running ink. */
  drawScreen(ctx, W, H, warn) {
    const L = this.level;
    if (warn > 0 && L < 0.01) {
      // Before the wave: ink seeps in from the top edge.
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.3);
      g.addColorStop(0, `rgba(35,40,56,${0.55 * warn})`);
      g.addColorStop(1, 'rgba(35,40,56,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.3);
    }
    if (L <= 0) return;
    ctx.save();
    // Facets
    for (const f of this.facets) {
      ctx.fillStyle = f.shade > 0 ? `rgba(255,255,255,${0.13 * L * f.s})` : `rgba(26,30,52,${0.2 * L * f.s})`;
      ctx.beginPath();
      ctx.moveTo(f.c[0], f.c[1]);
      ctx.lineTo(f.a.mx, f.a.my);
      ctx.lineTo(f.a.ex, f.a.ey);
      ctx.lineTo(f.b.ex, f.b.ey);
      ctx.lineTo(f.b.mx, f.b.my);
      ctx.closePath();
      ctx.fill();
    }
    // Fold lines: dark crease + light ridge
    const fold = (line) => {
      ctx.beginPath();
      line.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? `rgba(255,255,255,${0.55 * L})` : `rgba(30,36,60,${0.6 * L})`;
      ctx.lineWidth = pass ? 1.2 : 2;
      ctx.save();
      if (pass) ctx.translate(1.6, 1.6);
      for (const f of this.facets) fold([f.c, [f.a.mx, f.a.my], [f.a.ex, f.a.ey]]);
      for (const c of this.creases) fold(c);
      ctx.restore();
    }
    // Running ink
    ctx.fillStyle = `rgba(28,32,50,${0.88 * Math.min(1, L * 1.4)})`;
    for (const d of this.drips) {
      if (d.len <= 0) continue;
      const wdt = d.width;
      ctx.beginPath();
      ctx.moveTo(d.x - wdt / 2, 0);
      ctx.lineTo(d.x - wdt * 0.3, d.len);
      ctx.arc(d.x, d.len, wdt * 0.62, Math.PI, 0, true);
      ctx.lineTo(d.x + wdt / 2, 0);
      ctx.closePath();
      ctx.fill();
    }
    // Ink pooling along the top edge
    ctx.fillRect(0, 0, W, 6 + 18 * L);
    // Sepia gloom
    ctx.fillStyle = `rgba(30,36,64,${0.18 * L})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
