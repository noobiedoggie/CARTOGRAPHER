/**
 * Hand-drawn sprites, drawn procedurally every frame (no image assets).
 * All functions draw in world pixels.
 */
import { TILE } from '../config.js';

const S = TILE;
const INK = '#1d1915';

/** Explorer outfits (unlockable in the Atlas). */
export const SKINS = {
  classic: { name: 'The Cartographer', coat: '#6b4a2b', hat: '#3b2a1c', scarf: '#a3302a', face: '#f1e2c3', cost: 0 },
  scarlet: { name: 'Scarlet Wayfarer', coat: '#93302a', hat: '#2b1b14', scarf: '#e0b648', face: '#f1e2c3', cost: 12 },
  verdant: { name: 'Verdant Scout', coat: '#456f3c', hat: '#27361f', scarf: '#d8c27a', face: '#f1e2c3', cost: 20 },
  nocturne: { name: 'Night Surveyor', coat: '#2d3150', hat: '#15172a', scarf: '#86acd9', face: '#e9dcc2', cost: 35 },
  gilded: { name: 'Gilded Archivist', coat: '#b48d2f', hat: '#5a4210', scarf: '#f4e3a1', face: '#f6e7c9', cost: 60 },
};

export function drawPlayer(ctx, p, skin, time, drawing) {
  const sk = SKINS[skin] || SKINS.classic;
  const px = p.x * S;
  const py = p.y * S;
  const bob = p.moving ? Math.abs(Math.sin(p.walkPhase)) * -2 : Math.sin(time * 2.2) * 0.6;
  ctx.save();
  if (p.invuln > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.45;

  // Shadow
  ctx.fillStyle = 'rgba(50,32,16,0.28)';
  ctx.beginPath();
  ctx.ellipse(px, py + S * 0.3, S * 0.27, S * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  const step = p.moving ? Math.sin(p.walkPhase) * 3 : 0;
  ctx.beginPath();
  ctx.moveTo(px - 4, py + S * 0.2);
  ctx.lineTo(px - 4 + step * 0.3, py + S * 0.3 + step * 0.3);
  ctx.moveTo(px + 4, py + S * 0.2);
  ctx.lineTo(px + 4 - step * 0.3, py + S * 0.3 - step * 0.3);
  ctx.stroke();

  // Scarf trailing opposite to the walking direction
  const sx = -p.dirX * 7;
  const sy = -p.dirY * 4;
  ctx.strokeStyle = sk.scarf;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, py - S * 0.08 + bob);
  ctx.quadraticCurveTo(px + sx * 0.6, py - S * 0.04 + bob + Math.sin(time * 9) * 1.5, px + sx, py + sy + bob + Math.sin(time * 9 + 1) * 2);
  ctx.stroke();

  // Cloak
  ctx.fillStyle = sk.coat;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(px, py - S * 0.2 + bob);
  ctx.bezierCurveTo(px + S * 0.18, py - S * 0.1 + bob, px + S * 0.28, py + S * 0.12 + bob, px + S * 0.24, py + S * 0.24 + bob);
  ctx.quadraticCurveTo(px, py + S * 0.3 + bob, px - S * 0.24, py + S * 0.24 + bob);
  ctx.bezierCurveTo(px - S * 0.28, py + S * 0.12 + bob, px - S * 0.18, py - S * 0.1 + bob, px, py - S * 0.2 + bob);
  ctx.fill();
  ctx.stroke();
  // Satchel strap
  ctx.strokeStyle = 'rgba(29,25,21,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px - S * 0.12, py - S * 0.08 + bob);
  ctx.lineTo(px + S * 0.16, py + S * 0.16 + bob);
  ctx.stroke();

  // Head
  const hy = py - S * 0.22 + bob;
  ctx.fillStyle = sk.face;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(px, hy, S * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eyes look where we walk
  ctx.fillStyle = INK;
  const ex = p.dirX * 2;
  const ey = Math.max(-1, p.dirY * 1.5);
  if (p.dirY < 0.6) {
    ctx.fillRect(px - 3.2 + ex, hy - 0.5 + ey, 1.8, 1.8);
    ctx.fillRect(px + 1.6 + ex, hy - 0.5 + ey, 1.8, 1.8);
  }
  // Hat
  ctx.fillStyle = sk.hat;
  ctx.beginPath();
  ctx.ellipse(px, hy - S * 0.08, S * 0.24, S * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - S * 0.12, hy - S * 0.09);
  ctx.quadraticCurveTo(px - S * 0.11, hy - S * 0.27, px, hy - S * 0.27);
  ctx.quadraticCurveTo(px + S * 0.11, hy - S * 0.27, px + S * 0.12, hy - S * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = sk.scarf;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px - S * 0.115, hy - S * 0.13);
  ctx.lineTo(px + S * 0.115, hy - S * 0.13);
  ctx.stroke();

  // Quill while drawing
  if (drawing) {
    ctx.save();
    ctx.translate(px + S * 0.26, py - S * 0.05 + bob);
    ctx.rotate(-0.7 + Math.sin(time * 18) * 0.15);
    ctx.fillStyle = '#f4ecd8';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4, -9, 1, -18);
    ctx.quadraticCurveTo(-3, -9, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Small "X marks the spot" at the walk destination. */
export function drawDestination(ctx, x, y, time) {
  const cx = (x + 0.5) * S;
  const cy = (y + 0.5) * S;
  const r = S * 0.2 * (1 + Math.sin(time * 6) * 0.08);
  ctx.strokeStyle = 'rgba(163,48,42,0.85)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r);
  ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

/** Smudge: a wobbling ink blot with eyes. */
export function drawSmudge(ctx, e, time) {
  const px = e.x * S;
  const py = e.y * S;
  const t = e.anim;
  const chase = e.state === 'chase';
  ctx.fillStyle = 'rgba(30,20,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(px, py + S * 0.28, S * 0.3, S * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = 11;
  for (let layer = 0; layer < 2; layer++) {
    const r0 = S * (layer ? 0.3 : 0.36);
    ctx.fillStyle = layer ? '#211a26' : 'rgba(33,26,38,0.4)';
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = r0 * (1 + 0.13 * Math.sin(t * (chase ? 9 : 4) + k * 1.9) + 0.06 * Math.sin(t * 2.3 + k * 3.1));
      const x = px + Math.cos(a) * r;
      const y = py + Math.sin(a) * r * 0.9 - S * 0.04;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // drips
  ctx.fillStyle = '#211a26';
  for (let k = 0; k < 2; k++) {
    const dx = (k ? 0.14 : -0.1) * S;
    const len = S * (0.12 + 0.06 * Math.sin(t * 3 + k * 2));
    ctx.beginPath();
    ctx.ellipse(px + dx, py + S * 0.22, S * 0.04, len, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // eyes
  const lx = e.dirX * 2.5;
  const ly = e.dirY * 2;
  ctx.fillStyle = chase ? '#ffd9c2' : '#f2e8ce';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(px + s * S * 0.11 + lx, py - S * 0.07 + ly, S * 0.07, chase ? S * 0.05 : S * 0.08, s * (chase ? 0.4 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = chase ? '#a3302a' : '#1d1915';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(px + s * S * 0.11 + lx * 1.4, py - S * 0.06 + ly * 1.3, S * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  drawStatus(ctx, e, px, py - S * 0.5, time);
}

/** Eraser: a pink rubber block with a sleeve, rocking as it scrubs. */
export function drawEraser(ctx, e, time) {
  const px = e.x * S;
  const py = e.y * S;
  const scrub = e.erasing >= 0;
  const ang = Math.atan2(e.dirY, e.dirX) * 0.15 + (scrub ? Math.sin(time * 30) * 0.18 : Math.sin(e.anim * 6) * 0.05);
  ctx.save();
  ctx.translate(px + (scrub ? Math.sin(time * 30) * 2 : 0), py);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(40,20,20,0.2)';
  ctx.fillRect(-S * 0.33 + 2, -S * 0.2 + 4, S * 0.66, S * 0.42);
  ctx.fillStyle = '#e59aa1';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-S * 0.33, -S * 0.2);
  ctx.lineTo(S * 0.33, -S * 0.2);
  ctx.lineTo(S * 0.33, S * 0.22);
  ctx.lineTo(-S * 0.33, S * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3b6fb0';
  ctx.fillRect(S * 0.06, -S * 0.2, S * 0.27, S * 0.42);
  ctx.strokeRect(S * 0.06, -S * 0.2, S * 0.27, S * 0.42);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S * 0.1, -S * 0.12);
  ctx.lineTo(S * 0.29, -S * 0.12);
  ctx.stroke();
  // Grumpy face
  ctx.fillStyle = INK;
  ctx.fillRect(-S * 0.21, -S * 0.06, 3, 3);
  ctx.fillRect(-S * 0.07, -S * 0.06, 3, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-S * 0.25, -S * 0.12);
  ctx.lineTo(-S * 0.15, -S * 0.09);
  ctx.moveTo(-S * 0.02, -S * 0.12);
  ctx.lineTo(-S * 0.12, -S * 0.09);
  ctx.moveTo(-S * 0.2, S * 0.1);
  ctx.quadraticCurveTo(-S * 0.13, S * 0.05, -S * 0.06, S * 0.1);
  ctx.stroke();
  ctx.restore();
  drawStatus(ctx, e, px, py - S * 0.45, time);
}

/** Scribbler: a restless tangle of lines with a pen nib. */
export function drawScribbler(ctx, e, time) {
  const px = e.x * S;
  const py = e.y * S;
  const frame = Math.floor(time * 10);
  ctx.strokeStyle = '#4a205c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = k * 2.399 + frame * 0.7;
    const r = S * (0.12 + 0.2 * Math.abs(Math.sin(k * 1.7 + frame * 0.31)));
    const x = px + Math.cos(a) * r;
    const y = py - S * 0.05 + Math.sin(a) * r * 0.85;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // eye
  ctx.fillStyle = '#f2e8ce';
  ctx.beginPath();
  ctx.arc(px, py - S * 0.06, S * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a205c';
  ctx.beginPath();
  ctx.arc(px + e.dirX * 2, py - S * 0.06 + e.dirY * 2, S * 0.035, 0, Math.PI * 2);
  ctx.fill();
  // nib
  const a = Math.atan2(e.dirY, e.dirX);
  ctx.save();
  ctx.translate(px + Math.cos(a) * S * 0.3, py + Math.sin(a) * S * 0.3);
  ctx.rotate(a);
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-3, -4);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawStatus(ctx, e, px, py - S * 0.5, time);
}

/** The Devourer: a giant, worn eraser with a toothy maw. */
export function drawDevourer(ctx, e, time, alpha = 1) {
  const px = e.x * S;
  const py = e.y * S;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  const wob = e.dormant > 0 ? Math.sin(time * 3) * 0.02 : Math.sin(time * 5) * 0.04;
  ctx.rotate(e.dirX * 0.12 + wob);
  const W = S * 2.7;
  const H = S * 2.1;
  ctx.fillStyle = 'rgba(30,10,10,0.3)';
  ctx.fillRect(-W / 2 + 6, -H / 2 + 10, W, H);
  // body
  ctx.fillStyle = e.stun > 0 ? '#c9a0a8' : '#d98591';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-W / 2 + 10, -H / 2);
  ctx.lineTo(W / 2 - 6, -H / 2 + 4);
  ctx.quadraticCurveTo(W / 2, -H / 2 + 4, W / 2, -H / 2 + 12);
  ctx.lineTo(W / 2 - 4, H / 2 - 8);
  ctx.lineTo(-W / 2 + 4, H / 2);
  ctx.lineTo(-W / 2, -H / 2 + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // sleeve band
  ctx.fillStyle = '#2f5e9c';
  ctx.fillRect(-W / 2 + 2, -H / 2 + 6, W * 0.16, H - 10);
  ctx.strokeRect(-W / 2 + 2, -H / 2 + 6, W * 0.16, H - 10);
  ctx.fillRect(W / 2 - W * 0.18, -H / 2 + 8, W * 0.14, H - 16);
  ctx.strokeRect(W / 2 - W * 0.18, -H / 2 + 8, W * 0.14, H - 16);
  // eyes
  const angry = e.dormant <= 0;
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#f7ead0';
    ctx.beginPath();
    ctx.ellipse(s * S * 0.42, -S * 0.42, S * 0.2, angry ? S * 0.12 : S * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (angry) {
      ctx.fillStyle = e.stun > 0 ? INK : '#8a1a12';
      ctx.beginPath();
      ctx.arc(s * S * 0.42 + e.dirX * 4, -S * 0.42 + e.dirY * 3, S * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * S * 0.2, -S * 0.66);
      ctx.lineTo(s * S * 0.62, -S * 0.56);
      ctx.stroke();
    }
  }
  // maw
  const open = e.dormant > 0 ? 0.15 : 0.5 + 0.5 * Math.abs(Math.sin(time * 6));
  ctx.fillStyle = '#2a0c0c';
  ctx.beginPath();
  ctx.ellipse(0, S * 0.3, S * 0.75, S * 0.32 * open + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2e8ce';
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.moveTo(k * S * 0.2 - 5, S * 0.3 - S * 0.3 * open);
    ctx.lineTo(k * S * 0.2 + 5, S * 0.3 - S * 0.3 * open);
    ctx.lineTo(k * S * 0.2, S * 0.3 - S * 0.3 * open + 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (e.stun > 0) drawStars(ctx, px, py - S * 1.3, time);
}

export function drawBlot(ctx, b, time) {
  const px = b.x * S;
  const py = b.y * S;
  const a = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(30,20,35,0.35)';
  ctx.beginPath();
  ctx.ellipse(-8, 0, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1424';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.quadraticCurveTo(0, -6, -5, 0);
  ctx.quadraticCurveTo(0, 6, 7, 0);
  ctx.fill();
  ctx.restore();
}

function drawStars(ctx, x, y, time) {
  ctx.fillStyle = '#e0b648';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const a = time * 4 + (k * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 14;
    const sy = y + Math.sin(a) * 5;
    ctx.beginPath();
    for (let j = 0; j < 10; j++) {
      const r = j % 2 ? 2.2 : 5;
      const aa = (j / 10) * Math.PI * 2;
      ctx.lineTo(sx + Math.cos(aa) * r, sy + Math.sin(aa) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** Alert "!" and stun stars above an enemy. */
function drawStatus(ctx, e, x, y, time) {
  if (e.stun > 0) {
    drawStars(ctx, x, y + 4, time);
    return;
  }
  if (e.alert > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, e.alert * 2);
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f2e8ce';
    ctx.strokeText('!', x, y - (1 - e.alert) * 6);
    ctx.fillStyle = '#a3302a';
    ctx.fillText('!', x, y - (1 - e.alert) * 6);
    ctx.restore();
  }
}
