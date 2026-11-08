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
