import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Run } from '../src/game/run.js';
import { botPlayFloor } from './helpers.js';
import { BOSS_FLOOR } from '../src/config.js';

const meta = { perks: {}, unlocked: {} };

test('a careful bot can clear every floor (no enemies) using only black ink', () => {
  for (let seed = 1; seed <= 6; seed++) {
    for (let floor = 1; floor <= BOSS_FLOOR; floor++) {
      const run = new Run(meta);
      run.seed = seed * 7717;
      run.floor = floor;
      const game = new Game({ run, noEnemies: true });
      const res = botPlayFloor(game);
      assert.ok(res.ok, `seed ${seed} floor ${floor}: ${res.reason} after ${res.time.toFixed(1)}s`);
      assert.ok(run.stats.inkUsed >= game.gen.cost, 'spent at least the minimum ink');
    }
  }
});
