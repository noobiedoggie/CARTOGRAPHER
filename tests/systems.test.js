import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Run } from '../src/game/run.js';
import { INK, T, MOVER } from '../src/world/tiles.js';
import { minInkCost } from '../src/world/solver.js';
import { botPlayFloor, step, drawTiles } from './helpers.js';
import { BOSS_FLOOR } from '../src/config.js';

const allInks = { perks: {}, unlocked: { blue: true, red: true, gold: true } };

function makeGame(floor, seed, opts = {}) {
  const run = new Run(allInks);
  run.seed = seed;
  run.floor = floor;
  return new Game({ run, ...opts });
}

test('rewrite waves never make a floor unbeatable (frequent waves, bot still wins)', () => {
  for (let seed = 1; seed <= 4; seed++) {
    for (let floor = 1; floor <= 10; floor++) {
      const g = makeGame(floor, seed * 101, { noEnemies: true });
      g.run.hearts = 99; // fire from waves may singe the bot - we test reachability here
      g.rewrite.interval = 4;
      g.rewrite.timeLeft = 2;
      const res = botPlayFloor(g, 600);
      assert.ok(res.ok, `seed ${seed} floor ${floor}: ${res.reason}`);
      assert.ok(g.rewrite.count >= 1, 'at least one wave happened');
    }
  }
});

test('after a wave the exit is reachable with the ink in hand', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = makeGame(5, seed * 37, { noEnemies: true });
    g.run.ink = 6; // a player who wasted ink
    g.rewrite.timeLeft = 0.01;
    step(g, 3.5);
    assert.equal(g.rewrite.count, 1);
    const w = g.world;
    const cost = minInkCost(w.w, w.h, w.terrain, w.ink, w.scrib, g.playerTile, w.idx(w.exit.x, w.exit.y));
    const poolNearby = [...w.terrain].some((t) => t === T.POOL);
    assert.ok(cost <= Math.floor(g.run.ink) || poolNearby, `seed ${seed}: cost ${cost} with ${g.run.ink} ink`);
  }
});

test('player ink survives rewrite waves; unseen ground does not', () => {
  const g = makeGame(3, 4242, { noEnemies: true });
  const w = g.world;
  // Ink a line of ground near the start, then walk away so it's out of sight.
  const p = g.player;
  const tiles = [];
  for (let x = 1; x < w.w - 1 && tiles.length < 4; x++) {
    const i = w.idx(x, p.ty);
    if (w.explored[i] && w.terrain[i] === T.GROUND && i !== g.playerTile) tiles.push(i);
  }
  assert.ok(drawTiles(g, tiles));
  step(g, 1);
  const before = tiles.map((i) => [w.ink[i], w.terrain[i]]);
  w.visible.fill(0); // pretend we looked away
  g.rewrite.timeLeft = 0.01;
  step(g, 3.5);
  assert.deepEqual(tiles.map((i) => [w.ink[i], w.terrain[i]]), before);
});

test('enemy soak: every floor runs 90s of chaos without errors', () => {
  for (let floor = 1; floor <= BOSS_FLOOR; floor++) {
    const g = makeGame(floor, 900 + floor);
    g.run.hearts = 999;
    const w = g.world;
    const kinds = new Set(g.enemies.map((e) => e.kind));
    if (floor >= 3 && floor < BOSS_FLOOR) assert.ok(kinds.has('eraser'), 'erasers from floor 3');
    if (floor >= 5 && floor < BOSS_FLOOR) assert.ok(kinds.has('scribbler'), 'scribblers from floor 5');
    if (floor === BOSS_FLOOR) assert.ok(g.boss, 'boss exists');
    g.rewrite.interval = 20;
    let t = 0;
    while (t < 90 && !g.done) {
      // Wander randomly and scribble random ink around.
      if (!g.player.path.length) g.walkTo(g.rng.int(1, w.w - 2), g.rng.int(1, w.h - 2));
      if (g.rng.chance(0.05)) {
        const type = g.rng.pick([INK.BLACK, INK.BLUE, INK.RED]);
        g.setInkType(type);
        const x = g.player.tx + g.rng.int(-3, 3);
        const y = g.player.ty + g.rng.int(-3, 3);
        g.beginStroke(x + 0.5, y + 0.5);
        g.extendStroke(x + g.rng.int(-3, 3) + 0.5, y + g.rng.int(-3, 3) + 0.5);
        g.endStroke();
        if (g.rng.chance(0.3)) g.undo();
      }
      step(g, 0.5);
      t += 0.5;
      // Invariants
      assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y));
      assert.ok(w.canWalk(g.playerTile, MOVER.PLAYER) || g.dead, `floor ${floor}: explorer stands on solid ground`);
      for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && w.inside(e.tx, e.ty), 'enemy in bounds');
      assert.ok(g.run.ink >= 0 && g.run.ink <= g.run.maxInk + 16);
    }
  }
});

test('undoing a bridge under a smudge traps it', () => {
  const g = makeGame(2, 31337, { noEnemies: true });
  const w = g.world;
  // Find a chasm tile next to explored ground near the start.
  let target = -1;
  for (let i = 0; i < w.n && target < 0; i++) if (w.terrain[i] === T.CHASM) target = i;
  w.explored[target] = 1;
  g.setInkType(INK.BLACK);
  g.beginStroke(w.xOf(target) + 0.5, w.yOf(target) + 0.5);
  g.endStroke();
  assert.equal(w.ink[target], INK.BLACK);
  // Put a smudge on the bridge and undo.
  g.enemySystem.spawnEnabled = true;
  const e = g.enemySystem.spawn('smudge', 0);
  e.x = w.xOf(target) + 0.5;
  e.y = w.yOf(target) + 0.5;
  assert.ok(g.undo());
  assert.equal(e.alive, false);
  assert.equal(g.run.stats.trapped, 1);
});
