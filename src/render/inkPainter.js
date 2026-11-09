/**
 * Draws player ink. Each inked tile is drawn as a centre blob plus "arms"
 * reaching to same-colour neighbours, so strokes read as continuous lines.
 *
 *   black on ground  -> a thick inked trail
 *   black on chasm/water -> a plank bridge
 *   blue             -> painted water
 *   red              -> brick wall
 *
 * `p` (0..1) is the bleed-in progress: shapes overshoot slightly and leave
 * spreading blots, like ink soaking into paper.
 */
import { TILE, INK_COLORS } from '../config.js';
import { INK, isBridgeable } from '../world/tiles.js';
import { hash2 } from '../core/rng.js';

const S = TILE;
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function easeOutBack(t) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Which of the 4 neighbours carry the same ink. */
function links(world, x, y, k, linkFn) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!world.inside(nx, ny)) continue;
    const ni = world.idx(nx, ny);
    if (linkFn ? linkFn(ni) : world.ink[ni] === k) out.push([dx, dy]);
  }
  return out;
}

/**
 * @param {number} [kOverride] draw this ink instead of the tile's own (stroke preview)
 * @param {(i:number)=>boolean} [linkFn] custom neighbour-link test (stroke preview)
 */
export function drawInkTile(ctx, world, x, y, p = 1, kOverride = 0, linkFn = null) {
  const i = world.idx(x, y);
  const k = kOverride || world.ink[i];
  if (!k) return;
  const cx = (x + 0.5) * S;
  const cy = (y + 0.5) * S;
  const grow = p >= 1 ? 1 : Math.max(0, easeOutBack(p));
  const h = hash2(x, y, 31);
  const arms = links(world, x, y, k, linkFn);
  ctx.save();
  if (p < 1) ctx.globalAlpha *= Math.min(1, p * 2.4);
  ctx.translate(cx, cy);
  if (grow !== 1) ctx.scale(grow, grow);

  if (k === INK.BLACK) {
    if (isBridgeable(world.terrain[i])) drawBridge(ctx, arms, h);
    else drawTrail(ctx, arms, h);
  } else if (k === INK.BLUE) drawPaintedWater(ctx, arms, h, x, y);
  else if (k === INK.RED) drawWall(ctx, arms, h);
  ctx.restore();

  if (p < 1) drawBleed(ctx, cx, cy, k, p, h);
}

function drawTrail(ctx, arms, h) {
  ctx.strokeStyle = INK_COLORS[1];
  ctx.fillStyle = INK_COLORS[1];
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.38;
  const wob = (h - 0.5) * 4;
  for (const [dx, dy] of arms) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(dx * S * 0.25 - dy * wob, dy * S * 0.25 + dx * wob, dx * S * 0.5, dy * S * 0.5);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wob * 0.3, -wob * 0.3, S * (arms.length ? 0.19 : 0.24), 0, Math.PI * 2);
  ctx.fill();
  // Wet sheen
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = S * 0.06;
  for (const [dx, dy] of arms) {
    ctx.beginPath();
    ctx.moveTo(-dy * S * 0.07, dx * S * 0.07 - S * 0.03);
    ctx.lineTo(dx * S * 0.45 - dy * S * 0.07, dy * S * 0.45 + dx * S * 0.07 - S * 0.03);
    ctx.stroke();
  }
}

function drawBridge(ctx, arms, h) {
  const half = S * 0.37;
  const E = S * 0.5;
  const has = (dx, dy) => arms.some((a) => a[0] === dx && a[1] === dy);
  const hasV = has(0, -1) || has(0, 1);
  const hasH = has(-1, 0) || has(1, 0);
  // Deck: centre square + arms to linked neighbours (a "plus" shape).
  ctx.fillStyle = '#d1b183';
  ctx.fillRect(-half, -half, half * 2, half * 2);
  if (has(0, -1)) ctx.fillRect(-half, -E, half * 2, E - half);
  if (has(0, 1)) ctx.fillRect(-half, half, half * 2, E - half);
  if (has(-1, 0)) ctx.fillRect(-E, -half, E - half, half * 2);
  if (has(1, 0)) ctx.fillRect(half, -half, E - half, half * 2);

  // Planks run across the direction of travel.
  ctx.strokeStyle = INK_COLORS[1];
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const step = S / 5;
  const j = (h - 0.5) * 1.2;
  if (hasV || !hasH) {
    for (let yy = -E + step / 2; yy < E; yy += step) {
      let xa;
      let xb;
      if (Math.abs(yy) <= half) {
        xa = has(-1, 0) ? -E : -half;
        xb = has(1, 0) ? E : half;
      } else if (has(0, Math.sign(yy))) {
        xa = -half;
        xb = half;
      } else continue;
      ctx.moveTo(xa + 1, yy + j);
      ctx.lineTo(xb - 1, yy - j);
    }
  } else {
    for (let xx = -E + step / 2; xx < E; xx += step) {
      if (Math.abs(xx) > half && !has(Math.sign(xx), 0)) continue;
      ctx.moveTo(xx + j, -half + 1);
      ctx.lineTo(xx - j, half - 1);
    }
  }
  ctx.stroke();

  // Rails: the outline of the plus shape.
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (!has(0, -1)) {
    ctx.moveTo(-half, -half);
    ctx.lineTo(half, -half);
  } else {
    ctx.moveTo(-half, -half);
    ctx.lineTo(-half, -E);
    ctx.moveTo(half, -half);
    ctx.lineTo(half, -E);
  }
  if (!has(0, 1)) {
    ctx.moveTo(-half, half);
    ctx.lineTo(half, half);
  } else {
    ctx.moveTo(-half, half);
    ctx.lineTo(-half, E);
    ctx.moveTo(half, half);
    ctx.lineTo(half, E);
  }
  if (!has(-1, 0)) {
    ctx.moveTo(-half, -half);
    ctx.lineTo(-half, half);
  } else {
    ctx.moveTo(-half, -half);
    ctx.lineTo(-E, -half);
    ctx.moveTo(-half, half);
    ctx.lineTo(-E, half);
  }
  if (!has(1, 0)) {
    ctx.moveTo(half, -half);
    ctx.lineTo(half, half);
  } else {
    ctx.moveTo(half, -half);
    ctx.lineTo(E, -half);
    ctx.moveTo(half, half);
    ctx.lineTo(E, half);
  }
  ctx.stroke();
}

function drawPaintedWater(ctx, arms, h, x, y) {
  ctx.fillStyle = 'rgba(47,98,168,0.80)';
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.44, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of arms) {
    if (dx) ctx.fillRect(dx > 0 ? 0 : -S * 0.5, -S * 0.44, S * 0.5, S * 0.88);
    else ctx.fillRect(-S * 0.44, dy > 0 ? 0 : -S * 0.5, S * 0.88, S * 0.5);
  }
  // Little wave marks
  ctx.strokeStyle = 'rgba(225,238,255,0.6)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  const ox = (hash2(x, y, 7) - 0.5) * S * 0.3;
  const oy = (h - 0.5) * S * 0.3;
  ctx.beginPath();
  ctx.moveTo(ox - S * 0.2, oy);
  ctx.quadraticCurveTo(ox - S * 0.1, oy - S * 0.1, ox, oy);
  ctx.quadraticCurveTo(ox + S * 0.1, oy + S * 0.1, ox + S * 0.2, oy);
  ctx.stroke();
}

function drawWall(ctx, arms, h) {
  const half = S * 0.43;
  const has = (dx, dy) => arms.some((a) => a[0] === dx && a[1] === dy);
  const x0 = has(-1, 0) ? -S * 0.5 : -half;
  const x1 = has(1, 0) ? S * 0.5 : half;
  const y0 = has(0, -1) ? -S * 0.5 : -half;
  const y1 = has(0, 1) ? S * 0.5 : half;
  // Drop shadow
  ctx.fillStyle = 'rgba(40,18,28,0.28)';
  ctx.fillRect(x0 + 2, y0 + 3, x1 - x0, y1 - y0);
  // Body
  ctx.fillStyle = INK_COLORS[3];
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Bricks
  ctx.strokeStyle = 'rgba(90,24,26,0.55)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const rows = 3;
  for (let r = 1; r < rows; r++) {
    const yy = -S * 0.5 + (r * S) / rows;
    if (yy > y0 && yy < y1) {
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
    }
  }
  for (let r = 0; r < rows; r++) {
    const ya = Math.max(y0, -S * 0.5 + (r * S) / rows);
    const yb = Math.min(y1, -S * 0.5 + ((r + 1) * S) / rows);
    const off = r % 2 ? S * 0.25 : 0;
    for (let xx = -S * 0.5 + off; xx < S * 0.5; xx += S * 0.5) {
      if (xx <= x0 || xx >= x1) continue;
      ctx.moveTo(xx, ya);
      ctx.lineTo(xx, yb);
    }
  }
  ctx.stroke();
  // Highlight + outline on open sides
  ctx.strokeStyle = 'rgba(255,190,170,0.35)';
  ctx.lineWidth = 1.5;
  if (!has(0, -1)) {
    ctx.beginPath();
    ctx.moveTo(x0 + 2, y0 + 2);
    ctx.lineTo(x1 - 2, y0 + 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(70,22,26,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  const wob = (h - 0.5) * 1.5;
  if (!has(0, -1)) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0 + wob);
  }
  if (!has(0, 1)) {
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1 - wob);
  }
  if (!has(-1, 0)) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + wob, y1);
  }
  if (!has(1, 0)) {
    ctx.moveTo(x1, y0);
    ctx.lineTo(x1 - wob, y1);
  }
  ctx.stroke();
}

/** Spreading blots while the ink soaks in. */
function drawBleed(ctx, cx, cy, k, p, h) {
  const color = k === INK.BLUE ? '47,98,168' : k === INK.RED ? '163,48,42' : '29,25,21';
  ctx.fillStyle = `rgba(${color},${0.45 * (1 - p)})`;
  for (let b = 0; b < 4; b++) {
    const a = h * 6.283 + b * 1.7;
    const d = (0.22 + 0.18 * hash2(b, k, h * 1000)) * S * (0.4 + p);
    const r = S * (0.08 + 0.06 * ((b * 7 + h * 10) % 1)) * (1 - p * 0.4);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
