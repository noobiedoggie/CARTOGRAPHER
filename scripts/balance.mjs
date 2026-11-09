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
import { playFloor } from '../tests/skilledBot.js';
import { rollUpgrades, applyUpgrade } from '../src/game/upgrades.js';

const RUNS = Number(process.argv[2] || 40);
const ALL = (process.argv[3] ?? '1') === '1';

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
