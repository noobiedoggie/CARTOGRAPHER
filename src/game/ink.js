/**
 * Ink strokes: turning a finger path into grid tiles, deciding which tiles a
 * given ink can be painted on, and pricing a stroke.
 */
import { T, INK, isBridgeable, isPaintable, isFeature } from '../world/tiles.js';

/** Max tiles in one stroke (keeps previews readable). */
export const MAX_STROKE = 90;

/**
 * Visit every tile on the segment (x0,y0)->(x1,y1) with 4-connected steps,
 * so a drawn line never has diagonal gaps (diagonal bridges must be walkable).
 */
export function line4(x0, y0, x1, y1, visit) {
  const nx = Math.abs(x1 - x0);
  const ny = Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  visit(x, y);
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    if ((0.5 + ix) / nx < (0.5 + iy) / ny) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    visit(x, y);
  }
}

export class Stroke {
  constructor(type) {
    this.type = type;
    this.tiles = []; // accepted tiles in drawing order
    this.set = new Set();
    this.rejected = new Set(); // tiles the finger crossed that can't take this ink
    this.last = null;
    this.tip = null; // last finger position in tile units (float)
  }
}

/** Can ink `type` be placed on tile i right now? */
export function canDraw(game, i, type) {
  const w = game.world;
  const t = w.terrain[i];
  const k = w.ink[i];
  if (type === INK.GOLD) return true; // gold only reveals; works even in fog
  if (!w.explored[i]) return false;
  if (t === T.ROCK || isFeature(t)) return false;
  if (k === type) return false;
  if (type === INK.BLACK) return true; // path on ground, bridge over chasm/water, or overwrite a wall
  // Water and walls can't be painted under the explorer or an enemy.
  if (game.isOccupied(i)) return false;
  if (type === INK.BLUE) return isPaintable(t) || t === T.CHASM || k !== INK.NONE;
  if (type === INK.RED) return isPaintable(t) || k === INK.BLACK || k === INK.BLUE;
  return false;
}

/** Ink price of one tile (may be fractional because of upgrades). */
export function tileCost(game, i, type) {
  if (type === INK.GOLD) return 1;
  const run = game.run;
  if (type === INK.BLACK && isBridgeable(game.world.terrain[i]) && game.world.ink[i] !== INK.BLACK) {
    return Math.max(0.25, 1 - 0.25 * run.upg('bridges'));
  }
  if (type === INK.BLUE && run.upg('tidal')) return 0.5;
  return 1;
}

/** Running (prefix) integer cost for every tile of the stroke. */
export function strokeCosts(game, stroke) {
  const out = new Array(stroke.tiles.length);
  let sum = 0;
  for (let k = 0; k < stroke.tiles.length; k++) {
    sum += tileCost(game, stroke.tiles[k], stroke.type);
    out[k] = Math.ceil(sum - 1e-6);
  }
  return out;
}

/** Number of leading tiles affordable with `budget`. */
export function affordableCount(costs, budget) {
  let n = 0;
  while (n < costs.length && costs[n] <= budget) n++;
  return n;
}
