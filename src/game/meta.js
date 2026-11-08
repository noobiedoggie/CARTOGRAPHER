/**
 * Meta-progression ("The Atlas"). Pages earned in runs - win or lose - are
 * spent here on ink types, permanent starting perks and explorer outfits.
 */
import { BOSS_FLOOR } from '../config.js';
import { SKINS } from '../render/sprites.js';

export const META_VERSION = 1;

export function defaultMeta() {
  return {
    v: META_VERSION,
    pages: 0,
    totalPages: 0,
    unlocked: { blue: false, red: false, gold: false },
    perks: {},
    skins: ['classic'],
    skin: 'classic',
    stats: { runs: 0, wins: 0, deaths: 0, bestFloor: 0, tilesDrawn: 0, trapped: 0 },
    settings: { sound: true, haptics: true },
    tutorialDone: false,
  };
}

/** Fill in fields missing from older saves. */
export function migrateMeta(m) {
  const d = defaultMeta();
  if (!m || typeof m !== 'object') return d;
  return {
    ...d,
    ...m,
    unlocked: { ...d.unlocked, ...(m.unlocked || {}) },
    perks: { ...(m.perks || {}) },
    skins: Array.isArray(m.skins) && m.skins.length ? m.skins : d.skins,
    stats: { ...d.stats, ...(m.stats || {}) },
    settings: { ...d.settings, ...(m.settings || {}) },
  };
}

export const INK_UNLOCKS = [
  { id: 'blue', name: 'Blue Ink', desc: 'Paints water. Smudges cannot cross it, and it puts out fire.', cost: 10 },
  { id: 'red', name: 'Red Ink', desc: 'Builds walls that block everything - even ink blots.', cost: 25 },
  { id: 'gold', name: 'Gold Ink', desc: 'Rare. Burns away fog around each drop and marks the stairs. Start runs with 3.', cost: 45 },
];

export const PERKS = [
  { id: 'inkwell', name: 'Larger Inkwell', desc: '+6 max ink', costs: [8, 18, 32] },
  { id: 'scavenger', name: 'Scavenger', desc: 'Chests hold +1 page', costs: [12, 24] },
  { id: 'eyes', name: 'Keen Eyes', desc: '+1 vision radius', costs: [22] },
  { id: 'patience', name: 'Slow Ink Clock', desc: '+10s between rewrite waves', costs: [28] },
  { id: 'headstart', name: 'Head Start', desc: 'Begin each run with a random upgrade', costs: [30] },
];

export const SKIN_LIST = Object.entries(SKINS).map(([id, s]) => ({ id, ...s }));

/** Pages for clearing floor f (the boss pays a bonus on top). */
export function floorPages(f) {
  return f >= BOSS_FLOOR ? 25 : 2 + Math.floor(f / 2);
}

export function perkCost(meta, perk) {
  const lvl = meta.perks[perk.id] || 0;
  return lvl < perk.costs.length ? perk.costs[lvl] : null;
}

/** Try to buy something. Returns true on success (meta is mutated). */
export function buy(meta, kind, id) {
  let cost = null;
  if (kind === 'ink') {
    const u = INK_UNLOCKS.find((x) => x.id === id);
    if (!u || meta.unlocked[id]) return false;
    cost = u.cost;
    if (meta.pages < cost) return false;
    meta.unlocked[id] = true;
  } else if (kind === 'perk') {
    const p = PERKS.find((x) => x.id === id);
    if (!p) return false;
    cost = perkCost(meta, p);
    if (cost === null || meta.pages < cost) return false;
    meta.perks[id] = (meta.perks[id] || 0) + 1;
  } else if (kind === 'skin') {
    const s = SKINS[id];
    if (!s || meta.skins.includes(id)) return false;
    cost = s.cost;
    if (meta.pages < cost) return false;
    meta.skins.push(id);
    meta.skin = id;
  } else return false;
  meta.pages -= cost;
  return true;
}
