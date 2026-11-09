/**
 * Renderer: composes the frame.
 *
 *   desk -> paper sheet -> cached terrain chunks -> animated tiles (pools,
 *   fire, scribbles, fresh ink) -> stroke preview & route -> sprites ->
 *   particles -> fog -> map border / markers -> rewrite wave ->
 *   (screen space) grain, vignette, damage flash, cost label, compass.
 */
import { TILE, CHUNK, INK_COLORS } from '../config.js';
import { T, INK } from '../world/tiles.js';
import { hash2 } from '../core/rng.js';
import { makePaper, makeGrain } from './paper.js';
import { paintTerrain } from './terrainPainter.js';
import { drawInkTile } from './inkPainter.js';
import { FogRenderer } from './fogRenderer.js';
import { RewriteFX } from './rewriteFx.js';
import { Effects } from './effects.js';
import { drawPlayer, drawDestination, drawSmudge, drawEraser, drawScribbler, drawDevourer, drawBlot } from './sprites.js';

const S = TILE;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.paper = makePaper(512);
    this.grain = makeGrain();
    this.paperPattern = this.ctx.createPattern(this.paper, 'repeat');
    this.grainPattern = this.ctx.createPattern(this.grain, 'repeat');
    try {
      this.paperPattern.setTransform(new DOMMatrix().scale(0.5, 0.5));
    } catch {
      /* older webviews: unscaled pattern is fine */
    }
    this.world = null;
    this.fog = null;
    this.chunks = [];
    this.chunkScale = 2;
    this.effects = new Effects();
    this.flash = 0; // red damage flash
    this.flashColor = '163,48,42';
    this.extraDrawers = []; // (ctx, scene) => void, world space, below fog
    this.overFogDrawers = []; // world space, above fog
    this.screenDrawers = []; // screen space
    this.rewriteFx = new RewriteFX();
    this.quality = 1; // 0 = low (no grain overlay)
    this.maxDpr = 2;
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.chunkScale = dpr >= 1.5 ? 2 : 1.5;
    this._makeVignette();
    if (this.world) this.setWorld(this.world, true);
  }

  _makeVignette() {
    const c = document.createElement('canvas');
    const w = Math.max(2, Math.round(this.cssW / 2));
    const h = Math.max(2, Math.round(this.cssH / 2));
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(60,36,16,0)');
    grad.addColorStop(1, 'rgba(60,36,16,0.42)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    this.vignette = c;
  }

  /** Attach a new world (new floor). keepFog = only rebuild caches. */
  setWorld(world, keepFog = false) {
    this.world = world;
    this.chunks = new Array(world.cw * world.ch).fill(null);
    world.markAllDirty();
    if (!keepFog || !this.fog || this.fog.world !== world) this.fog = new FogRenderer(world);
  }

  _buildChunk(ci) {
    const world = this.world;
    const cx = ci % world.cw;
    const cy = (ci / world.cw) | 0;
    const px = CHUNK * S;
    const scale = this.chunkScale;
    let c = this.chunks[ci];
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(px * scale);
      c.height = Math.ceil(px * scale);
      this.chunks[ci] = c;
    }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(scale, 0, 0, scale, -cx * px * scale, -cy * px * scale);
    paintTerrain(g, world, cx * CHUNK, cy * CHUNK, Math.min(world.w, (cx + 1) * CHUNK), Math.min(world.h, (cy + 1) * CHUNK));
    world.chunkDirty[ci] = 0;
  }

  /** Rebuild every dirty chunk now (menus / floor start). */
  buildAll() {
    const world = this.world;
    for (let ci = 0; ci < world.cw * world.ch; ci++) if (world.chunkDirty[ci] || !this.chunks[ci]) this._buildChunk(ci);
  }

  /**
   * @param {object} scene { world, camera, game?, time, input?, skin?, showFog }
   */
  render(scene) {
    const { ctx, dpr } = this;
    const { world, camera: cam, game, time } = scene;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!world) return;

    cam.apply(ctx, dpr);
    const MW = world.w * S;
    const MH = world.h * S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(10, 12, MW, MH);
    ctx.fillStyle = this.paperPattern;
    ctx.fillRect(0, 0, MW, MH);

    // Terrain chunks
    const vt = cam.visibleTiles(1);
    const cx0 = Math.max(0, Math.floor(vt.x0 / CHUNK));
    const cy0 = Math.max(0, Math.floor(vt.y0 / CHUNK));
    const cx1 = Math.min(world.cw - 1, Math.floor(vt.x1 / CHUNK));
    const cy1 = Math.min(world.ch - 1, Math.floor(vt.y1 / CHUNK));
    let budget = 5;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ci = cy * world.cw + cx;
        if ((world.chunkDirty[ci] || !this.chunks[ci]) && (budget-- > 0 || !this.chunks[ci])) this._buildChunk(ci);
        ctx.drawImage(this.chunks[ci], cx * CHUNK * S, cy * CHUNK * S, CHUNK * S, CHUNK * S);
      }
    }

    const x0 = Math.max(0, vt.x0);
    const y0 = Math.max(0, vt.y0);
    const x1 = Math.min(world.w - 1, vt.x1);
    const y1 = Math.min(world.h - 1, vt.y1);
    this._drawDynamicTiles(ctx, world, x0, y0, x1, y1, time, game);

    if (game) {
      for (const a of game.animInk) {
        const p = Math.max(0, Math.min(1, a.t / 0.45));
        if (a.t > 0) drawInkTile(ctx, world, world.xOf(a.i), world.yOf(a.i), p);
      }
      this._drawRoute(ctx, game, time);
      this._drawPreview(ctx, game, time);
      for (const d of this.extraDrawers) d(ctx, scene);
      this._drawEnemies(ctx, game, time);
      if (!game.dead || Math.floor(time * 8) % 2) drawPlayer(ctx, game.player, scene.skin, time, !!game.stroke);
      for (const b of game.projectiles) drawBlot(ctx, b, time);
    } else {
      for (const d of this.extraDrawers) d(ctx, scene);
    }
    this.effects.draw(ctx);

    if (scene.showFog !== false && this.fog) this.fog.draw(ctx);
    if (game) this._drawOverFog(ctx, game, time, vt);
    for (const d of this.overFogDrawers) d(ctx, scene);
    this._drawBorder(ctx, MW, MH);

    // ---- Screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.quality > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = this.grainPattern;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.vignette, 0, 0, this.cssW, this.cssH);
    if (this.flash > 0) {
      // Red vignette that bleeds in from the screen edges when hurt.
      const W = this.cssW;
      const H = this.cssH;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, `rgba(${this.flashColor},0)`);
      g.addColorStop(1, `rgba(${this.flashColor},${Math.min(0.6, this.flash * 1.3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    for (const d of this.screenDrawers) d(ctx, scene);
    if (game) {
      this._drawRewriteWarning(ctx, game, time);
      this._drawCompass(ctx, game, scene, time);
      this._drawCostLabel(ctx, game, scene, time);
    }
  }

  /** Enemies are only drawn where the explorer can see (faded at the vision edge). */
  _drawEnemies(ctx, game, time) {
    const w = game.world;
    const vis = this.fog ? this.fog.vis : null;
    for (const e of game.enemies) {
      if (e.kind === 'boss') continue; // drawn above the fog
      const a = vis ? vis[e.tile] : w.visible[e.tile];
      if (a <= 0.05) continue;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      if (e.kind === 'smudge') drawSmudge(ctx, e, time);
      else if (e.kind === 'eraser') {
        drawEraser(ctx, e, time);
        if (e.erasing >= 0) {
          // highlight the tile being rubbed out
          const ex = (w.xOf(e.erasing) + 0.5) * S;
          const ey = (w.yOf(e.erasing) + 0.5) * S;
          ctx.strokeStyle = `rgba(229,154,161,${0.5 + 0.4 * Math.sin(time * 20)})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(ex - S * 0.45, ey - S * 0.45, S * 0.9, S * 0.9);
          if (Math.random() < 0.4) this.effects.burst(ex, ey, 1, { color: '#e59aa1', kind: 'crumb', speed: 50, size: 1.6, gravity: 80 });
        }
      } else if (e.kind === 'scribbler') drawScribbler(ctx, e, time);
      ctx.globalAlpha = 1;
    }
  }

  _drawOverFog(ctx, game, time, vt) {
    const w = game.world;
    // Ink pools sensed through the fog (Pool Diviner upgrade).
    if (game.run.upg('diviner')) {
      ctx.fillStyle = 'rgba(40,36,70,0.55)';
      for (let i = 0; i < w.n; i++) {
        if (w.terrain[i] !== T.POOL || w.visible[i]) continue;
        ctx.beginPath();
        ctx.arc((w.xOf(i) + 0.5) * S, (w.yOf(i) + 0.5) * S, S * (0.18 + 0.03 * Math.sin(time * 3 + i)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Beacons: the stairs (and boss anchors) shine through the fog from afar.
    for (const b of game.beacons()) this._drawBeacon(ctx, b, time, w);
    // The Devourer looms over the fog as a shadow.
    if (game.boss && game.boss.alive) {
      const b = game.boss;
      const seen = w.visible[b.tile] === 1;
      drawDevourer(ctx, b, time, seen ? 1 : 0.45);
    }
    // Rewrite: gloom + glowing (stable) ink, then the wet ink wave front.
    this.rewriteFx.drawWorld(ctx, game, vt, time);
    const rw = game.rewrite;
    if (rw && rw.sweeping) this._drawWaveFront(ctx, w, rw.sweepPos * S, time);
  }

  /** A pillar of light over a goal tile, drawn above the fog. */
  _drawBeacon(ctx, b, time, w) {
    const cx = (b.x + 0.5) * S;
    const cy = (b.y + 0.5) * S;
    const col = b.color;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + b.x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, S * 2.2);
    g.addColorStop(0, `rgba(${col},${0.55 + 0.25 * pulse})`);
    g.addColorStop(0.4, `rgba(${col},0.22)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - S * 2.2, cy - S * 2.2, S * 4.4, S * 4.4);
    // vertical beam rising from the goal
    const beam = ctx.createLinearGradient(0, cy - S * 6, 0, cy);
    beam.addColorStop(0, `rgba(${col},0)`);
    beam.addColorStop(1, `rgba(${col},${0.35 + 0.2 * pulse})`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.15, cy);
    ctx.lineTo(cx - S * 0.45, cy - S * 6);
    ctx.lineTo(cx + S * 0.45, cy - S * 6);
    ctx.lineTo(cx + S * 0.15, cy);
    ctx.closePath();
    ctx.fill();
    // slowly turning rays
    ctx.strokeStyle = `rgba(${col},${0.35 * pulse + 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = time * 0.6 + (k * Math.PI) / 4;
      ctx.moveTo(cx + Math.cos(a) * S * 0.7, cy + Math.sin(a) * S * 0.7);
      ctx.lineTo(cx + Math.cos(a) * S * 1.5, cy + Math.sin(a) * S * 1.5);
    }
    ctx.stroke();
    ctx.restore();
    // icon on top
    if (!w.visible[w.idx(b.x, b.y)]) {
      ctx.fillStyle = 'rgba(43,32,24,0.9)';
      ctx.strokeStyle = `rgb(${col})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(${col})`;
      if (b.kind === 'exit') for (let k = 0; k < 3; k++) ctx.fillRect(cx - S * 0.22 + k * 3, cy - S * 0.2 + k * S * 0.14, S * 0.44 - k * 6, S * 0.09);
      else {
        ctx.beginPath();
        ctx.arc(cx, cy, S * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** The rewrite front: a wet black wave with ink running off its lip. */
  _drawWaveFront(ctx, w, y, time) {
    const MW = w.w * S;
    const g = ctx.createLinearGradient(0, y - S * 4, 0, y);
    g.addColorStop(0, 'rgba(60,35,15,0)');
    g.addColorStop(1, 'rgba(60,35,15,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - S * 4, MW, S * 4);
    const frame = Math.floor(time * 16);
    ctx.fillStyle = 'rgba(20,15,12,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, y - S * 1.1);
    for (let x = 0; x <= MW; x += S / 2) ctx.lineTo(x, y - S * 0.9 + (hash2(x, frame, 9) - 0.5) * 10);
    for (let x = MW; x >= 0; x -= S / 4) {
      const drip = hash2(Math.floor(x / (S / 4)), 3, 11);
      const len = drip > 0.7 ? S * (0.6 + drip * 1.6) * (0.7 + 0.3 * Math.sin(time * 5 + x)) : S * 0.15 * drip;
      ctx.lineTo(x, y + len);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,90,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= MW; x += S / 2) {
      const yy = y - S * 0.95 + (hash2(x, frame, 9) - 0.5) * 10;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      this.effects.burst(Math.random() * MW, y, 1, { color: k % 2 ? '#d9c7a0' : '#1d1915', kind: 'flake', speed: 60, size: 3, gravity: 60, life: 1 });
    }
  }

  /** Last 10 seconds: ink seeps in; during and after the wave: crumpled page. */
  _drawRewriteWarning(ctx, game, time) {
    const rw = game.rewrite;
    let warn = 0;
    if (rw && !rw.sweeping && rw.timeLeft <= 10) warn = (1 - rw.timeLeft / 10) * (0.6 + 0.4 * Math.sin(time * (rw.timeLeft < 3 ? 14 : 7)));
    this.rewriteFx.drawScreen(ctx, this.cssW, this.cssH, Math.max(0, warn));
  }

  /** Compass needle at the screen edge pointing to the current goal (+ distance). */
  _drawCompass(ctx, game, scene, time) {
    const goals = game.compassTargets();
    for (const g of goals) this._drawArrow(ctx, scene.camera, game, g, time);
  }

  _drawArrow(ctx, cam, game, g, time) {
    const [sx, sy] = cam.worldToScreen((g.x + 0.5) * S, (g.y + 0.5) * S);
    const m = 34;
    const top = 150;
    const bottom = this.cssH - 150;
    if (sx > m && sx < this.cssW - m && sy > top && sy < bottom) return;
    const cx = this.cssW / 2;
    const cy = (top + bottom) / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const rx = this.cssW / 2 - m;
    const ry = (bottom - top) / 2;
    const t = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * t;
    const ay = cy + Math.sin(a) * t;
    const size = g.small ? 0.7 : 1;
    ctx.save();
    ctx.translate(ax, ay);
    // distance badge
    if (!g.small) {
      const p = game.player;
      const d = Math.round(Math.hypot(g.x + 0.5 - p.x, g.y + 0.5 - p.y));
      ctx.font = 'bold 14px "Segoe Print", "Bradley Hand", casual, cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bx = -Math.cos(a) * 30;
      const by = -Math.sin(a) * 30;
      ctx.fillStyle = 'rgba(242,232,206,0.95)';
      ctx.strokeStyle = '#1d1915';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx - 18, by - 11, 36, 22, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d1915';
      ctx.fillText(String(d), bx, by + 1);
    }
    ctx.rotate(a);
    const bob = Math.sin(time * 5) * 3;
    ctx.scale(size, size);
    ctx.fillStyle = g.color;
    ctx.strokeStyle = '#1d1915';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20 + bob, 0);
    ctx.lineTo(-10 + bob, -14);
    ctx.lineTo(-4 + bob, 0);
    ctx.lineTo(-10 + bob, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawDynamicTiles(ctx, world, x0, y0, x1, y1, time, game) {
    const { terrain, fire, scrib, w } = world;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        const t = terrain[i];
        const cx = (x + 0.5) * S;
        const cy = (y + 0.5) * S;
        if (t === T.POOL) {
          const ph = (time * 0.8 + hash2(x, y, 3)) % 1;
          ctx.strokeStyle = `rgba(170,180,235,${0.5 * (1 - ph)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, S * (0.08 + ph * 0.28), S * (0.06 + ph * 0.22), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (t === T.EXIT) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 3);
          const locked = game && game.exitLocked;
          const g = ctx.createRadialGradient(cx, cy, S * 0.2, cx, cy, S * 1.1);
          g.addColorStop(0, locked ? `rgba(120,40,160,${0.25 + pulse * 0.2})` : `rgba(255,210,120,${0.25 + pulse * 0.25})`);
          g.addColorStop(1, 'rgba(255,210,120,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - S * 1.1, cy - S * 1.1, S * 2.2, S * 2.2);
        } else if (t === T.ANCHOR_LIT) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4 + x);
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, S * 0.9);
          g.addColorStop(0, `rgba(255,220,110,${0.45 + pulse * 0.3})`);
          g.addColorStop(1, 'rgba(255,220,110,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - S, cy - S, S * 2, S * 2);
        } else if (t === T.ANCHOR) {
          ctx.strokeStyle = `rgba(200,150,40,${0.35 + 0.3 * Math.sin(time * 3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, S * (0.48 + 0.06 * Math.sin(time * 3)), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (scrib[i] > 0) this._drawScribble(ctx, x, y, scrib[i], time);
        if (fire[i] > 0) this._drawFire(ctx, x, y, fire[i], time);
      }
    }
  }

  _drawScribble(ctx, x, y, life, time) {
    const frame = Math.floor(time * 8);
    const alpha = Math.min(1, life / 2.5);
    ctx.strokeStyle = `rgba(74,32,92,${0.85 * alpha})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    const bx = x * S;
    const by = y * S;
    for (let k = 0; k < 9; k++) {
      const px = bx + 3 + hash2(x * 31 + k, y, frame) * (S - 6);
      const py = by + 3 + hash2(x, y * 31 + k, frame) * (S - 6);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(40,16,52,${0.6 * alpha})`;
    ctx.strokeRect(bx + 2, by + 2, S - 4, S - 4);
  }

  _drawFire(ctx, x, y, life, time) {
    const cx = (x + 0.5) * S;
    const by = (y + 0.85) * S;
    const k = Math.min(1, life / 1.5);
    const g = ctx.createRadialGradient(cx, by - S * 0.3, 2, cx, by - S * 0.3, S * 0.8);
    g.addColorStop(0, `rgba(255,170,60,${0.35 * k})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - S * 0.8, by - S * 1.1, S * 1.6, S * 1.4);
    for (let f = 0; f < 3; f++) {
      const fx = cx + (f - 1) * S * 0.22;
      const hgt = S * (0.45 + 0.2 * Math.sin(time * 11 + f * 2 + x)) * k;
      const sway = Math.sin(time * 7 + f + y) * 3;
      ctx.fillStyle = f === 1 ? '#f0a43a' : '#d9572a';
      ctx.strokeStyle = '#5a1f0e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(fx - S * 0.13, by);
      ctx.quadraticCurveTo(fx - S * 0.12, by - hgt * 0.6, fx + sway, by - hgt);
      ctx.quadraticCurveTo(fx + S * 0.12, by - hgt * 0.6, fx + S * 0.13, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Dotted route along the explorer's path + destination X. */
  _drawRoute(ctx, game, time) {
    const p = game.player;
    if (!p.path.length) return;
    const w = game.world;
    ctx.strokeStyle = 'rgba(163,48,42,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 6]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.moveTo(p.x * S, p.y * S);
    let last = p.path[p.path.length - 1];
    for (const i of p.path) {
      if (!w.explored[i]) break;
      ctx.lineTo((w.xOf(i) + 0.5) * S, (w.yOf(i) + 0.5) * S);
      last = i;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    drawDestination(ctx, w.xOf(last), w.yOf(last), time);
  }

  /** Ghost of the stroke being drawn: ink colour if affordable, red crosses if not. */
  _drawPreview(ctx, game, time) {
    const pv = game.strokePreview();
    if (!pv) return;
    const w = game.world;
    const color = INK_COLORS[pv.type];
    const okSet = new Set(pv.tiles.slice(0, pv.affordable));
    const linkFn = (j) => okSet.has(j);
    for (let k = 0; k < pv.tiles.length; k++) {
      const i = pv.tiles[k];
      const x = w.xOf(i);
      const y = w.yOf(i);
      const cx = (x + 0.5) * S;
      const cy = (y + 0.5) * S;
      if (k < pv.affordable) {
        ctx.globalAlpha = 0.55 + 0.15 * Math.sin(time * 10 + k * 0.5);
        if (pv.type === INK.GOLD) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        } else drawInkTile(ctx, w, x, y, 1, pv.type, linkFn);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = 'rgba(200,30,20,0.9)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x * S + 3, y * S + 3, S - 6, S - 6);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 6);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.moveTo(cx + 6, cy - 6);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.stroke();
      }
    }
    // Crossed-out tiles that can't take this ink.
    ctx.strokeStyle = 'rgba(90,60,40,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const i of pv.rejected) {
      const cx = (w.xOf(i) + 0.5) * S;
      const cy = (w.yOf(i) + 0.5) * S;
      if (!w.explored[i]) continue;
      ctx.moveTo(cx - 4, cy - 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4);
      ctx.lineTo(cx - 4, cy + 4);
    }
    ctx.stroke();
  }

  _drawBorder(ctx, MW, MH) {
    ctx.strokeStyle = 'rgba(60,40,22,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-6, -6, MW + 12, MH + 12);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-11, -11, MW + 22, MH + 22);
  }

  /** "-7" cost bubble above the finger while drawing. */
  _drawCostLabel(ctx, game, scene, time) {
    const pv = game.strokePreview();
    if (!pv || !pv.tip) return;
    const [sx, sy] = scene.camera.worldToScreen(pv.tip.x * S, pv.tip.y * S);
    const short = pv.cost > pv.budget;
    const unit = pv.type === INK.GOLD ? ' gold' : '';
    const text = short ? `-${pv.cost}${unit}  (have ${pv.budget})` : `-${pv.cost}${unit}`;
    ctx.font = 'bold 20px "Segoe Print", "Bradley Hand", casual, cursive';
    const tw = ctx.measureText(text).width + 22;
    const bx = Math.max(8, Math.min(this.cssW - tw - 8, sx - tw / 2));
    const by = Math.max(70, sy - 88);
    ctx.fillStyle = short ? 'rgba(163,48,42,0.95)' : 'rgba(242,232,206,0.96)';
    ctx.strokeStyle = '#1d1915';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, tw, 34, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = short ? '#fff4e6' : INK_COLORS[pv.type] || '#1d1915';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + tw / 2, by + 18);
    // little pointer
    ctx.beginPath();
    ctx.moveTo(Math.max(bx + 12, Math.min(bx + tw - 12, sx)) - 6, by + 34);
    ctx.lineTo(Math.max(bx + 12, Math.min(bx + tw - 12, sx)), by + 42 + Math.sin(time * 8));
    ctx.lineTo(Math.max(bx + 12, Math.min(bx + tw - 12, sx)) + 6, by + 34);
    ctx.fillStyle = short ? 'rgba(163,48,42,0.95)' : 'rgba(242,232,206,0.96)';
    ctx.fill();
    ctx.stroke();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
