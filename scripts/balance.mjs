#!/usr/bin/env node
/**
 * Balance harness: a "skilled" bot plays full expeditions headless and we
 * report the win rate and where runs end. The bot is a proxy for a good
 * player: it knows the cheapest route (like an experienced explorer reading
 * the map), detours to ink pools when low, and blocks chasing Smudges with
 * water/walls - but it reacts late and never uses advanced tricks.
 *
 *   node scripts/balance.mjs [runs=40] [allInks=1]
 */
import { Game } from '../src/game/game.js';
import { Run } from '../src/game/run.js';
import { RNG } from '../src/core/rng.js';
import { BOSS_FLOOR } from '../src/config.js';
import { INK, T, MOVER } from '../src/world/tiles.js';
import { cheapestRoute, inkNeed, inkField } from '../src/world/solver.js';
import { rollUpgrades, applyUpgrade } from '../src/game/upgrades.js';

const RUNS = Number(process.argv[2] || 40);
const ALL = (process.argv[3] ?? '1') === '1';
const DT = 1 / 30;

function stroke(game, tiles, type) {
  if (!tiles.length) return false;
  const w = game.world;
  game.setInkType(type);
  if (!game.beginStroke(w.xOf(tiles[0]) + 0.5, w.yOf(tiles[0]) + 0.5)) return false;
  for (const i of tiles.slice(1)) game.extendStroke(w.xOf(i) + 0.5, w.yOf(i) + 0.5);
  game.endStroke();
  return true;
}

/** Throw a short barrier between the explorer and a threat. */
function defend(game, e, routeCost) {
  const run = game.run;
  const w = game.world;
  const p = game.player;
  const type = run.hasInk(INK.BLUE) && e.kind === 'smudge' ? INK.BLUE : run.hasInk(INK.RED) ? INK.RED : 0;
  if (!type) return false;
  if (run.ink - 4 < routeCost + 2) return false;
  let dx = e.x - p.x;
  let dy = e.y - p.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    dx = Math.sign(dx);
    dy = 0;
  } else {
    dy = Math.sign(dy);
    dx = 0;
  }
  const cx = p.tx + dx;
  const cy = p.ty + dy;
  const tiles = [];
  for (let k = -1; k <= 1; k++) {
    const x = cx - dy * k;
    const y = cy + dx * k;
    if (w.inside(x, y)) tiles.push(w.idx(x, y));
  }
  return stroke(game, tiles, type);
}

function playFloor(game) {
  const w = game.world;
  let think = 0;
  let defendCd = 0;
  const exitIdx = () => w.idx(w.exit.x, w.exit.y);
  let lastPos = -1;
  let still = 0;
  while (!game.done && !game.dead && game.time < 600) {
    game.update(DT);
    think -= DT;
    defendCd -= DT;
    if (think > 0) continue;
    think = 0.25;
    const run = game.run;
    let goal = exitIdx();
    // Boss floor: anchors first.
    if (game.bossFloor && game.exitLocked) {
      const f = inkField(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile).dist;
      let best = -1;
      for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.ANCHOR && f[i] >= 0 && (best < 0 || f[i] < f[best])) best = i;
      if (best >= 0) goal = best;
    }
    const route = cheapestRoute(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, goal);
    // Low on ink? Grab the nearest free pool.
    if (run.ink < route.cost + 3) {
      const f = inkField(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile).dist;
      let best = -1;
      for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.POOL && f[i] === 0 && (w.explored[i] || game.run.upg('diviner'))) best = best < 0 || Math.abs(w.xOf(i) - game.player.tx) + Math.abs(w.yOf(i) - game.player.ty) < Math.abs(w.xOf(best) - game.player.tx) + Math.abs(w.yOf(best) - game.player.ty) ? i : best;
      if (best >= 0) {
        game.walkTo(w.xOf(best), w.yOf(best));
        continue;
      }
    }
    // Threat response (reaction ~0.25s, 2s cooldown).
    if (defendCd <= 0) {
      const threat = game.enemies.find((e) => e.alive && e.kind === 'smudge' && e.state === 'chase' && e.distTo(game.player) < 3.2);
      if (threat && defend(game, threat, route.cost)) defendCd = 2;
    }
    if (!isFinite(route.cost)) continue;
    const need = (i) => inkNeed(w.terrain, w.ink, w.scrib, i);
    let k = 0;
    while (k + 1 < route.path.length && need(route.path[k + 1]) === 0) k++;
    const standAt = route.path[k];
    if (standAt !== game.playerTile) {
      if (game.player.dest !== standAt) game.walkTo(w.xOf(standAt), w.yOf(standAt));
    } else {
      const seg = [];
      for (let j = k + 1; j < route.path.length && need(route.path[j]) === 1 && w.explored[route.path[j]]; j++) seg.push(route.path[j]);
      if (seg.length) stroke(game, [standAt, ...seg], INK.BLACK);
      if (seg.length) game.walkTo(w.xOf(seg[seg.length - 1]), w.yOf(seg[seg.length - 1]));
    }
    if (game.playerTile === lastPos) still += 0.25;
    else {
      still = 0;
      lastPos = game.playerTile;
    }
    if (still > 30) return 'stuck';
  }
  return game.done ? 'exit' : game.dead ? 'dead' : 'timeout';
}

const meta = { perks: {}, unlocked: ALL ? { blue: true, red: true, gold: true } : {} };
const ends = {};
const sources = {};
const hitsByFloor = new Array(BOSS_FLOOR + 1).fill(0);
let wins = 0;
let stuck = 0;
let time = 0;
for (let r = 0; r < RUNS; r++) {
  const run = new Run(meta);
  run.seed = 5000 + r * 7919;
  const rng = new RNG(run.seed);
  let result = 'dead';
  for (;;) {
    const before = run.stats.hits;
    const game = new Game({ run });
    game.events.on('damage', (d) => (sources[d.source] = (sources[d.source] || 0) + 1));
    const res = playFloor(game);
    hitsByFloor[run.floor] += run.stats.hits - before;
    time += game.time;
    if (res !== 'exit') {
      if (res !== 'dead') stuck++;
      result = `${res}@${run.floor}`;
      break;
    }
    if (run.floor >= BOSS_FLOOR) {
      result = 'win';
      wins++;
      break;
    }
    const choices = rollUpgrades(run, rng, 3);
    if (choices.length) applyUpgrade(run, (choices.find((c) => c.id === 'mend') || rng.pick(choices)).id);
    run.floor++;
  }
  ends[result] = (ends[result] || 0) + 1;
}
console.log(`runs ${RUNS} (inks: ${ALL ? 'all' : 'black only'})  wins ${wins} (${((wins / RUNS) * 100).toFixed(0)}%)  stuck/timeout ${stuck}`);
console.log('run endings:', Object.entries(ends).sort().map(([k, v]) => `${k}:${v}`).join('  '));
console.log('hits taken per floor (total):', hitsByFloor.slice(1).map((h, i) => `${i + 1}:${h}`).join(' '));
console.log('damage sources:', JSON.stringify(sources));
console.log(`avg floor time ${(time / Object.values(ends).reduce((a, b) => a + b, 0) / 1).toFixed(0)}s per run`);
