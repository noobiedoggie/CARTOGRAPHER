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
import { Effects } from './effects.js';
import { drawPlayer, drawDestination } from './sprites.js';

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
    this.quality = 1; // 0 = low (no grain overlay)
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      if (!game.dead || Math.floor(time * 8) % 2) drawPlayer(ctx, game.player, scene.skin, time, !!game.stroke);
    } else {
      for (const d of this.extraDrawers) d(ctx, scene);
    }
    this.effects.draw(ctx);

    if (scene.showFog !== false && this.fog) this.fog.draw(ctx);
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
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(0.45, this.flash)})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    for (const d of this.screenDrawers) d(ctx, scene);
    if (game) this._drawCostLabel(ctx, game, scene, time);
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
