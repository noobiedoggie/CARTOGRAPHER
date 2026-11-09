/**
 * Static terrain art, painted into per-chunk caches in world coordinates.
 * Hand-drawn map style: hatched rock, inky chasms with cliff faces, washed
 * water with shore lines, stippled ground, masonry ruins.
 *
 * Everything uses stable per-tile hashes so a tile always looks the same.
 */
import { TILE } from '../config.js';
import { T, INK } from '../world/tiles.js';
import { hash2 } from '../core/rng.js';
import { drawInkTile } from './inkPainter.js';

const S = TILE;
const SEPIA = 'rgba(95,66,38,0.55)';

/** Wobbly edge line from (ax,ay) to (bx,by). */
function wobbleLine(ctx, ax, ay, bx, by, h, amp) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const nx = -(by - ay);
  const ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  const o = (h - 0.5) * amp;
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx + (nx / len) * o, my + (ny / len) * o, bx, by);
}

/** Paint the tiles of chunk rect [x0,x1) x [y0,y1) (clipped to it). */
export function paintTerrain(ctx, world, x0, y0, x1, y1) {
  const { w, h, terrain } = world;
  const ax = Math.max(0, x0 - 1);
  const ay = Math.max(0, y0 - 1);
  const bx = Math.min(w, x1 + 1);
  const by = Math.min(h, y1 + 1);
  const tAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.ROCK : terrain[y * w + x]);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 * S, y0 * S, (x1 - x0) * S, (y1 - y0) * S);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ---- Ground decoration (stipple, tufts, pebbles) + ruins floor ---------
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const t = terrain[y * w + x];
      if (t === T.ROCK || t === T.CHASM || t === T.WATER || t === T.VOID) continue;
      const hh = hash2(x, y, 5);
      const px = x * S;
      const py = y * S;
      if (t === T.RUINS) paintRuin(ctx, x, y, px, py);
      else if (hh < 0.14) {
        ctx.fillStyle = 'rgba(110,80,45,0.45)';
        const n = 3 + Math.floor(hh * 20);
        for (let k = 0; k < n; k++) {
          const dx = hash2(x, y, 40 + k) * S;
          const dy = hash2(x, y, 60 + k) * S;
          ctx.fillRect(px + dx, py + dy, 1.3, 1.3);
        }
      } else if (hh < 0.21) {
        ctx.strokeStyle = 'rgba(105,95,45,0.5)';
        ctx.lineWidth = 1;
        const gx = px + 6 + hash2(x, y, 9) * (S - 12);
        const gy = py + 8 + hash2(x, y, 10) * (S - 14);
        ctx.beginPath();
        ctx.moveTo(gx - 3, gy);
        ctx.lineTo(gx - 4, gy - 5);
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx, gy - 7);
        ctx.moveTo(gx + 3, gy);
        ctx.lineTo(gx + 4.5, gy - 5);
        ctx.stroke();
      } else if (hh < 0.235) {
        ctx.strokeStyle = SEPIA;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(px + S * hash2(x, y, 11), py + S * hash2(x, y, 12), 2.6, 1.9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ---- Water ------------------------------------------------------------
  ctx.fillStyle = 'rgba(118,156,170,0.55)';
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) if (terrain[y * w + x] === T.WATER) ctx.fillRect(x * S, y * S, S, S);
  ctx.strokeStyle = 'rgba(48,88,112,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      if (terrain[y * w + x] !== T.WATER) continue;
      const hh = hash2(x, y, 21);
      const wx = x * S + 6 + hh * (S - 16);
      const wy = y * S + 8 + hash2(x, y, 22) * (S - 14);
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 2.5, wy - 3, wx + 5, wy);
      ctx.quadraticCurveTo(wx + 7.5, wy + 3, wx + 10, wy);
    }
  ctx.stroke();
  edgeLines(ctx, ax, ay, bx, by, tAt, T.WATER, (t) => t !== T.WATER, 'rgba(52,92,116,0.9)', 1.6, 2.5, 0);
  edgeLines(ctx, ax, ay, bx, by, tAt, T.WATER, (t) => t !== T.WATER && t !== T.ROCK, 'rgba(52,92,116,0.32)', 1.1, 2, 4.5);

  // ---- Chasms -----------------------------------------------------------
  ctx.fillStyle = 'rgb(50,37,30)';
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) if (terrain[y * w + x] === T.CHASM) ctx.fillRect(x * S, y * S, S, S);
  // depth texture
  ctx.strokeStyle = 'rgba(120,92,64,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      if (terrain[y * w + x] !== T.CHASM) continue;
      for (let k = 0; k < 3; k++) {
        const sx = x * S + hash2(x, y, 70 + k) * (S - 8);
        const sy = y * S + 4 + hash2(x, y, 80 + k) * (S - 8);
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 4 + hash2(x, y, 90 + k) * 5, sy + 0.5);
      }
    }
  ctx.stroke();
  // cliff faces where the ground above drops into the chasm
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      if (terrain[y * w + x] !== T.CHASM) continue;
      const above = tAt(x, y - 1);
      if (above === T.CHASM || above === T.ROCK) continue;
      const g = ctx.createLinearGradient(0, y * S, 0, y * S + S * 0.5);
      g.addColorStop(0, 'rgba(150,115,78,0.95)');
      g.addColorStop(1, 'rgba(50,37,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x * S, y * S, S, S * 0.5);
      ctx.strokeStyle = 'rgba(60,40,25,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const vx = x * S + 3 + k * (S / 4) + hash2(x, y, 100 + k) * 3;
        ctx.moveTo(vx, y * S + 1);
        ctx.lineTo(vx + (hash2(x, y, 110 + k) - 0.5) * 2, y * S + S * (0.22 + hash2(x, y, 120 + k) * 0.2));
      }
      ctx.stroke();
    }
  edgeLines(ctx, ax, ay, bx, by, tAt, T.CHASM, (t) => t !== T.CHASM && t !== T.ROCK, 'rgba(28,18,12,0.95)', 2.2, 5, 0, true);

  // ---- Void: a hole torn through the page, the dark desk showing below ----
  let anyVoid = false;
  ctx.fillStyle = '#20150e';
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++)
      if (terrain[y * w + x] === T.VOID) {
        ctx.fillRect(x * S, y * S, S, S);
        anyVoid = true;
      }
  if (anyVoid) {
    // wood grain of the desk
    ctx.strokeStyle = 'rgba(90,60,38,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = ay; y < by; y++)
      for (let x = ax; x < bx; x++) {
        if (terrain[y * w + x] !== T.VOID) continue;
        for (let k = 0; k < 3; k++) {
          const gy = y * S + 5 + k * 10 + hash2(x, y, 300 + k) * 4;
          ctx.moveTo(x * S, gy);
          ctx.bezierCurveTo(x * S + S * 0.3, gy - 2, x * S + S * 0.7, gy + 2, (x + 1) * S, gy);
        }
      }
    ctx.stroke();
    // inner shadow under the torn lip
    edgeLines(ctx, ax, ay, bx, by, tAt, T.VOID, (t) => t !== T.VOID && t !== T.ROCK, 'rgba(0,0,0,0.45)', 6, 4, 3, true);
    // ragged white paper fibres at the tear, then a thin ink edge
    edgeLines(ctx, ax, ay, bx, by, tAt, T.VOID, (t) => t !== T.VOID, 'rgba(250,243,222,0.95)', 3.4, 7, 0, true);
    edgeLines(ctx, ax, ay, bx, by, tAt, T.VOID, (t) => t !== T.VOID, 'rgba(90,64,40,0.7)', 1, 7, -1.5, true);
  }

  // ---- Rock -------------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  let anyRock = false;
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++)
      if (terrain[y * w + x] === T.ROCK) {
        ctx.rect(x * S, y * S, S, S);
        anyRock = true;
      }
  if (anyRock) {
    ctx.fillStyle = 'rgba(146,112,76,0.42)';
    ctx.fill();
    ctx.clip();
    hatch(ctx, ax * S, ay * S, bx * S, by * S, 7, 1, 'rgba(78,54,32,0.42)', 1.05);
    // Cross-hatch the deep interior for depth.
    ctx.beginPath();
    let anyDeep = false;
    for (let y = ay; y < by; y++)
      for (let x = ax; x < bx; x++) {
        if (terrain[y * w + x] !== T.ROCK) continue;
        let deep = true;
        for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (tAt(x + dx, y + dy) !== T.ROCK) deep = false;
        if (deep) {
          ctx.rect(x * S, y * S, S, S);
          anyDeep = true;
        }
      }
    if (anyDeep) {
      ctx.clip();
      ctx.fillStyle = 'rgba(110,80,52,0.18)';
      ctx.fillRect(ax * S, ay * S, (bx - ax) * S, (by - ay) * S);
      hatch(ctx, ax * S, ay * S, bx * S, by * S, 7, -1, 'rgba(78,54,32,0.3)', 1);
    }
  }
  ctx.restore();
  edgeLines(ctx, ax, ay, bx, by, tAt, T.ROCK, (t) => t !== T.ROCK, 'rgba(58,40,24,0.9)', 2.1, 3.5, 0);
  // Pebbles at the cave foot
  ctx.strokeStyle = 'rgba(70,48,28,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      if (terrain[y * w + x] !== T.ROCK) continue;
      const below = tAt(x, y + 1);
      if (below === T.ROCK || below === T.CHASM || below === T.WATER || below === T.VOID) continue;
      if (hash2(x, y, 130) < 0.45) {
        const px = x * S + 5 + hash2(x, y, 131) * (S - 10);
        const py = (y + 1) * S + 3;
        ctx.moveTo(px + 3, py);
        ctx.arc(px, py, 3, 0, Math.PI, true);
      }
    }
  ctx.stroke();

  // ---- Static features ----------------------------------------------------
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      const t = terrain[y * w + x];
      if (t >= T.POOL) paintFeature(ctx, t, x, y);
    }

  // ---- Settled ink ------------------------------------------------------
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      const i = y * w + x;
      if (world.ink[i] !== INK.NONE && world.inkAnim[i] >= 1) drawInkTile(ctx, world, x, y, 1);
    }

  ctx.restore();
}

/** Diagonal hatching over a rect (direction dir = +1 or -1). */
function hatch(ctx, x0, y0, x1, y1, spacing, dir, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  const span = x1 - x0 + (y1 - y0);
  for (let c = -span; c < span; c += spacing) {
    const jitter = Math.sin(c * 0.37) * 1.2;
    if (dir > 0) {
      ctx.moveTo(x0 + c + jitter, y1);
      ctx.lineTo(x0 + c + (y1 - y0), y0);
    } else {
      ctx.moveTo(x0 + c + jitter, y0);
      ctx.lineTo(x0 + c + (y1 - y0), y1);
    }
  }
  ctx.stroke();
}

/**
 * Stroke the outline between tiles of `kind` and neighbours matching `against`.
 * `inset` offsets the line into the kind tile (for shore ripples), `jag` makes it zig-zag.
 */
function edgeLines(ctx, ax, ay, bx, by, tAt, kind, against, color, width, amp, inset, jag = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      if (tAt(x, y) !== kind) continue;
      const X = x * S;
      const Y = y * S;
      const sides = [
        [0, -1, X, Y + inset, X + S, Y + inset],
        [1, 0, X + S - inset, Y, X + S - inset, Y + S],
        [0, 1, X, Y + S - inset, X + S, Y + S - inset],
        [-1, 0, X + inset, Y, X + inset, Y + S],
      ];
      for (let s = 0; s < 4; s++) {
        const [dx, dy, x1, y1, x2, y2] = sides[s];
        if (!against(tAt(x + dx, y + dy))) continue;
        const h = hash2(x * 4 + s, y, 17);
        if (jag) {
          const n = 4;
          ctx.moveTo(x1, y1);
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            const off = k === n ? 0 : (hash2(x * 4 + s, y * 4 + k, 19) - 0.5) * amp;
            ctx.lineTo(x1 + (x2 - x1) * t + (dy ? 0 : off), y1 + (y2 - y1) * t + (dx ? 0 : off));
          }
        } else wobbleLine(ctx, x1, y1, x2, y2, h, amp);
      }
    }
  }
  ctx.stroke();
}

function paintRuin(ctx, x, y, px, py) {
  const hh = hash2(x, y, 140);
  ctx.strokeStyle = 'rgba(120,90,55,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3);
  if (hh < 0.35) {
    // Broken wall stub of bricks
    ctx.fillStyle = 'rgba(176,146,104,0.75)';
    ctx.strokeStyle = 'rgba(80,58,34,0.8)';
    const n = 2 + Math.floor(hh * 6);
    for (let k = 0; k < n; k++) {
      const bx = px + 3 + k * 7;
      const by = py + 4 + (k % 2) * 5 + hash2(x, y, 150 + k) * 4;
      ctx.fillRect(bx, by, 7, 5);
      ctx.strokeRect(bx, by, 7, 5);
    }
  } else if (hh < 0.47) {
    // Column
    ctx.fillStyle = 'rgba(196,172,132,0.9)';
    ctx.strokeStyle = 'rgba(80,58,34,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px + S / 2, py + S / 2, S * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + S / 2, py + S / 2, S * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  } else if (hh < 0.6) {
    ctx.strokeStyle = 'rgba(100,72,42,0.45)';
    ctx.beginPath();
    ctx.moveTo(px + 4, py + S * 0.6);
    ctx.lineTo(px + S * 0.45, py + S * 0.52);
    ctx.lineTo(px + S * 0.6, py + S * 0.75);
    ctx.stroke();
  }
}

function blob(ctx, cx, cy, r, x, y, seed) {
  ctx.beginPath();
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (0.82 + 0.28 * hash2(x, y, seed + (k % n)));
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr * 0.85;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintFeature(ctx, t, x, y) {
  const cx = (x + 0.5) * S;
  const cy = (y + 0.5) * S;
  ctx.lineWidth = 1.5;
  switch (t) {
    case T.POOL:
      blob(ctx, cx, cy, S * 0.4, x, y, 200);
      ctx.fillStyle = 'rgba(22,20,34,0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,8,15,1)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,160,215,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx - S * 0.1, cy - S * 0.1, S * 0.13, S * 0.06, -0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case T.POOL_DRY:
      blob(ctx, cx, cy, S * 0.4, x, y, 200);
      ctx.fillStyle = 'rgba(40,32,34,0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,32,34,0.35)';
      ctx.stroke();
      break;
    case T.CHEST:
    case T.CHEST_OPEN: {
      const bw = S * 0.58;
      const bh = S * 0.36;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + S * 0.06;
      ctx.fillStyle = 'rgba(60,40,20,0.25)';
      ctx.fillRect(bx + 2, by + 3, bw, bh);
      ctx.fillStyle = '#b37b3d';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#3d2610';
      ctx.strokeRect(bx, by, bw, bh);
      if (t === T.CHEST) {
        ctx.fillStyle = '#9a6530';
        ctx.fillRect(bx, by - S * 0.12, bw, S * 0.14);
        ctx.strokeRect(bx, by - S * 0.12, bw, S * 0.14);
        ctx.fillStyle = '#e0b648';
        ctx.fillRect(cx - 2.5, by - 2, 5, 6);
        ctx.strokeRect(cx - 2.5, by - 2, 5, 6);
      } else {
        ctx.fillStyle = '#2a1a0c';
        ctx.fillRect(bx + 2, by + 1, bw - 4, bh * 0.4);
        ctx.fillStyle = '#9a6530';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw - 3, by - S * 0.22);
        ctx.lineTo(bx + 3, by - S * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.25, by);
      ctx.lineTo(bx + bw * 0.25, by + bh);
      ctx.moveTo(bx + bw * 0.75, by);
      ctx.lineTo(bx + bw * 0.75, by + bh);
      ctx.stroke();
      break;
    }
    case T.EXIT: {
      const r = S * 0.4;
      ctx.fillStyle = '#2b2018';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.strokeStyle = '#120c08';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      // Steps receding into the dark
      for (let k = 0; k < 4; k++) {
        const inset = k * r * 0.2;
        const yy = cy - r + k * r * 0.45 + 3;
        ctx.fillStyle = `rgba(${190 - k * 35},${160 - k * 30},${120 - k * 25},1)`;
        ctx.fillRect(cx - r + inset + 2, yy, (r - inset) * 2 - 4, r * 0.3);
        ctx.strokeStyle = 'rgba(20,12,6,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - r + inset + 2, yy, (r - inset) * 2 - 4, r * 0.3);
      }
      break;
    }
    case T.ANCHOR:
    case T.ANCHOR_LIT: {
      ctx.strokeStyle = t === T.ANCHOR_LIT ? '#8a6414' : '#3a2a1a';
      ctx.fillStyle = t === T.ANCHOR_LIT ? 'rgba(230,190,80,0.6)' : 'rgba(150,120,80,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * S * 0.3, cy + Math.sin(a) * S * 0.3);
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}
