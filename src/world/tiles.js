/**
 * Tile & ink definitions plus the passability rules shared by the explorer,
 * enemies, the solver and the renderer.
 */

export const T = Object.freeze({
  GROUND: 0,
  ROCK: 1,
  CHASM: 2,
  WATER: 3,
  RUINS: 4, // ancient floor: walkable and never rewritten
  POOL: 5, // ink pool: refills ink once
  POOL_DRY: 6,
  CHEST: 7,
  CHEST_OPEN: 8,
  EXIT: 9, // stairs down
  ANCHOR: 10, // boss floor seal (step on it)
  ANCHOR_LIT: 11,
});
export const TILE_TYPES = 12;

/** Ink layer values. GOLD is never stored on the map (it only reveals). */
export const INK = Object.freeze({ NONE: 0, BLACK: 1, BLUE: 2, RED: 3, GOLD: 4 });
export const INK_NAMES = ['none', 'black', 'blue', 'red', 'gold'];

/** Who is moving - different movers obey different rules. */
export const MOVER = Object.freeze({ PLAYER: 0, SMUDGE: 1, ERASER: 2, SCRIBBLER: 3 });

const lut = (list) => {
  const a = new Uint8Array(TILE_TYPES);
  for (const t of list) a[t] = 1;
  return a;
};

const WALK = lut([T.GROUND, T.RUINS, T.POOL, T.POOL_DRY, T.CHEST, T.CHEST_OPEN, T.EXIT, T.ANCHOR, T.ANCHOR_LIT]);
const STABLE = lut([T.RUINS, T.EXIT, T.ANCHOR, T.ANCHOR_LIT]);
const FLAMMABLE = lut([T.GROUND, T.RUINS, T.POOL_DRY, T.CHEST_OPEN]);
/** Plain floor that walls / water ink may be painted onto. */
const PAINTABLE = lut([T.GROUND, T.RUINS, T.POOL_DRY, T.CHEST_OPEN]);
/** Interactive items that block ink and get shuffled around by rewrite waves. */
const FEATURE = lut([T.POOL, T.CHEST, T.EXIT, T.ANCHOR, T.ANCHOR_LIT]);

export const terrainWalkable = (t) => WALK[t] === 1;
export const isStable = (t) => STABLE[t] === 1;
export const isFlammable = (t) => FLAMMABLE[t] === 1;
export const isPaintable = (t) => PAINTABLE[t] === 1;
export const isFeature = (t) => FEATURE[t] === 1;
export const isBridgeable = (t) => t === T.CHASM || t === T.WATER;
export const isLooseFeature = (t) => t === T.POOL || t === T.CHEST;
