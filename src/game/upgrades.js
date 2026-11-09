/**
 * Between-floor upgrades: after each floor the explorer picks 1 of 3.
 * Effects are read through Run getters (run.upg(id)) by the game systems.
 */
import { INK } from '../world/tiles.js';

/** Hand-drawn style SVG glyphs (24x24 viewBox, stroked in ink). */
const G = {
  well: 'M7 20h10l1-7H6z M9 13V9h6v4 M8 9h8 M12 5c2 0 3 1 3 3',
  bridges: 'M3 9h18M3 15h18M6 9v6M10 9v6M14 9v6M18 9v6M3 19c3-3 15-3 18 0',
  vision: 'M2 12c4-6 16-6 20 0c-4 6-16 6-20 0z M12 9a3 3 0 1 0 0.01 0z',
  sticky: 'M3 8c3-3 6 3 9 0s6 3 9 0 M6 10v5 M12 10v8 M18 10v4',
  still: 'M15 4a8 8 0 1 0 5 13a7 7 0 0 1-5-13z',
  boots: 'M8 3v11l-3 5h13l2-3-6-2V3z M8 8h4',
  steady: 'M5 20l3-1 11-11-2-2L6 17z M15 5l4 4 M4 21h6',
  diviner: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z M9 15a3 3 0 0 0 3 3',
  gilded: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z',
  mend: 'M12 20C6 16 3 12 3.5 8.5S9 4 12 7.5c3-3.5 8-2.5 8.5 1S18 16 12 20z M12 10v6M9 13h6',
  bramble: 'M3 18h18v-6H3z M3 15h18 M9 12v3 M15 15v3 M6 8l2 4M12 6v6M18 8l-2 4',
  patience: 'M6 3h12M6 21h12M7 3c0 6 4 7 5 9s5 3 5 9M17 3c0 6-4 7-5 9s-5 3-5 9',
  recycler: 'M7 7a7 7 0 0 1 11 2 M18 4v5h-5 M17 17a7 7 0 0 1-11-2 M6 20v-5h5',
  compass: 'M12 2a10 10 0 1 0 0.01 0z M12 5l2 7-2 7-2-7z M5 12h14',
  tidal: 'M2 9c3-3 5 3 8 0s5 3 8 0 M2 15c3-3 5 3 8 0s5 3 8 0 M18 9c2-2 3 0 4 0',
  secondwind: 'M4 14c0-6 10-9 13-4s-3 8-6 5 1-5 3-3 M3 19c5 1 12 1 18-2',
};

export const UPGRADES = [
  { id: 'well', name: 'Deep Inkwell', desc: '+20% max ink', max: 4 },
  { id: 'bridges', name: 'Light Planks', desc: 'Bridges cost 25% less ink', max: 2 },
  { id: 'vision', name: 'Far Sight', desc: '+1 vision radius', max: 3 },
  { id: 'sticky', name: 'Sticky Ink', desc: 'Enemies on or beside your ink move 40% slower', max: 1 },
  { id: 'still', name: 'Still Waters', desc: 'Ink slowly refills while you stand still', max: 3 },
  { id: 'boots', name: 'Swift Boots', desc: '+15% walking speed', max: 3 },
  { id: 'steady', name: 'Steady Hand', desc: 'Undo lasts 4s and refunds all the ink', max: 1 },
  { id: 'diviner', name: 'Pool Diviner', desc: 'Ink pools give 50% more and are sensed through fog', max: 1 },
  { id: 'gilded', name: 'Gilded Quill', desc: '+3 gold ink', max: 3, cond: (run) => run.hasInk(INK.GOLD), apply: (run) => (run.gold += 3) },
  { id: 'mend', name: 'Mended Heart', desc: 'Restore 1 heart', max: 99, cond: (run) => run.hearts < 3, apply: (run) => (run.hearts = Math.min(3, run.hearts + 1)) },
  { id: 'bramble', name: 'Bramble Walls', desc: 'Enemies that touch your red walls are snagged (stunned)', max: 1, cond: (run) => run.hasInk(INK.RED) },
  { id: 'patience', name: 'Patient World', desc: '+15s between rewrite waves', max: 2 },
  { id: 'recycler', name: 'Recycler', desc: 'Ink rubbed out by Erasers is half refunded', max: 1 },
  { id: 'compass', name: 'Ink Compass', desc: 'A second needle points to the nearest ink pool', max: 1 },
  { id: 'tidal', name: 'Tidal Ink', desc: 'Blue ink costs half', max: 1, cond: (run) => run.hasInk(INK.BLUE) },
  { id: 'secondwind', name: 'Second Wind', desc: 'When hurt: +10 ink and longer invulnerability', max: 1 },
].map((u) => ({ ...u, icon: G[u.id] }));

const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export const getUpgrade = (id) => byId[id];

/** Three distinct upgrades this run can still take. "Mended Heart" is favoured when hurt. */
export function rollUpgrades(run, rng, n = 3) {
  const pool = UPGRADES.filter((u) => run.upg(u.id) < u.max && (!u.cond || u.cond(run)));
  const out = [];
  if (run.hearts < 3) {
    const mend = pool.find((u) => u.id === 'mend');
    if (mend && rng.chance(run.hearts < 2 ? 0.85 : 0.4)) out.push(mend);
  }
  const rest = rng.shuffle(pool.filter((u) => !out.includes(u)));
  while (out.length < n && rest.length) out.push(rest.pop());
  return out;
}

/** Apply an upgrade's immediate effect and record the stack. */
export function applyUpgrade(run, id) {
  const u = byId[id];
  if (!u) return;
  run.addUpgrade(id);
  if (u.apply) u.apply(run);
}

export function upgradeIconSVG(u) {
  return `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="${u.icon}" fill="none" stroke="#1d1915" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
