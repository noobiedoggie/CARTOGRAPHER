/**
 * CARTOGRAPHER - global configuration and balance knobs.
 *
 * Every number that affects difficulty lives here so the game can be
 * re-balanced without touching logic code.
 */

/** World pixels per tile (render space; the camera scales this to the screen). */
export const TILE = 32;
/** Floor size in tiles (portrait: taller than wide). */
export const MAP_W = 40;
export const MAP_H = 60;
/** Render-cache chunk size in tiles. */
export const CHUNK = 10;
/** Normal floors per run. Floor NORMAL_FLOORS + 1 is the boss floor. */
export const NORMAL_FLOORS = 10;
export const BOSS_FLOOR = NORMAL_FLOORS + 1;

export const BAL = {
  // --- Explorer -----------------------------------------------------------
  hearts: 3,
  playerSpeed: 4.0, // tiles / second
  inkPathSpeed: 1.3, // multiplier while walking on your own black ink
  vision: 5, // tiles
  invuln: 1.8, // seconds of invulnerability after a hit
  tilesAcross: 13, // how many tiles fit across the screen at zoom 1

  // --- Ink ----------------------------------------------------------------
  startInk: 30,
  undoWindow: 2.0, // seconds
  undoRefund: 0.5, // fraction refunded
  poolInk: 12, // ink gained from an ink pool
  goldRevealRadius: 3,
  startGold: 3, // once gold ink is unlocked
  stillRegenDelay: 1.0, // "Still Waters" upgrade
  stillRegenRate: 0.7, // ink / second per upgrade stack

  // --- Input --------------------------------------------------------------
  holdToDrawMs: 170, // press-and-hold time before a drag becomes a stroke
  tapMaxMs: 380,
  dragThresholdPx: 11,

  // --- World --------------------------------------------------------------
  rewriteInterval: 60, // seconds between rewrite waves
  bossRewriteInterval: 45,
  rewriteSweepTime: 2.4, // seconds for the wave to cross the map
  fireLife: 7, // seconds a tile burns
  fireSpreadChance: 0.12, // per neighbour, per spread tick
  fireTick: 0.5,
  fireCap: 55, // max simultaneously burning tiles
  scribbleLife: 16, // seconds an enemy scribble-wall lasts

  // --- Enemies ------------------------------------------------------------
  smudgeWander: 1.1,
  smudgeChase: 2.0, // + per-floor bonus below
  smudgeChasePerFloor: 0.07,
  smudgeSight: 6,
  satedTime: 3.5, // after landing a hit an enemy backs off for this long
  eraserSpeed: 1.8,
  eraseTime: 0.85, // seconds to rub out one ink tile
  scribblerSpeed: 1.9,
  scribbleCooldown: 7.5,
  blotSpeed: 6.5,
  bossSpeed: 1.45,
  bossSpeedPerAnchor: 0.4,
  bossBlotCooldown: 3.6,
  maxEnemies: 12,
};

/** Ink colours used by both the renderer and the DOM HUD. */
export const INK_COLORS = {
  1: '#1d1915', // black
  2: '#2f62a8', // blue
  3: '#a3302a', // red
  4: '#c9962b', // gold
};
