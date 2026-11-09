import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMeta, migrateMeta, buy, floorPages, PERKS, INK_UNLOCKS } from '../src/game/meta.js';
import { rollUpgrades, applyUpgrade, UPGRADES } from '../src/game/upgrades.js';
import { Run } from '../src/game/run.js';
import { RNG } from '../src/core/rng.js';
import { BAL, BOSS_FLOOR } from '../src/config.js';
import { INK } from '../src/world/tiles.js';

test('buying spends pages and unlocks', () => {
  const m = defaultMeta();
  assert.equal(buy(m, 'ink', 'blue'), false, 'cannot afford');
  m.pages = 100;
  assert.equal(buy(m, 'ink', 'blue'), true);
  assert.equal(m.unlocked.blue, true);
  assert.equal(buy(m, 'ink', 'blue'), false, 'no double buy');
  const p = PERKS.find((x) => x.id === 'inkwell');
  for (let k = 0; k < p.costs.length; k++) assert.equal(buy(m, 'perk', 'inkwell'), true);
  assert.equal(buy(m, 'perk', 'inkwell'), false, 'maxed');
  assert.equal(m.perks.inkwell, 3);
  const blueCost = INK_UNLOCKS.find((u) => u.id === 'blue').cost;
  assert.equal(m.pages, 100 - blueCost - p.costs.reduce((a, b) => a + b, 0));
});

test('perks and upgrades change run stats', () => {
  const m = defaultMeta();
  m.perks.inkwell = 2;
  m.unlocked.gold = true;
  const run = new Run(m);
  assert.equal(run.maxInk, BAL.startInk + 12);
  assert.equal(run.gold, BAL.startGold);
  assert.ok(run.hasInk(INK.GOLD) && !run.hasInk(INK.RED));
  applyUpgrade(run, 'well');
  assert.equal(run.maxInk, Math.round((BAL.startInk + 12) * 1.2));
  run.hearts = 1;
  applyUpgrade(run, 'mend');
  assert.equal(run.hearts, 2);
});

test('upgrade rolls are distinct and respect conditions', () => {
  const run = new Run(defaultMeta()); // no blue/red/gold
  for (let s = 0; s < 200; s++) {
    const r = rollUpgrades(run, new RNG(s));
    assert.equal(r.length, 3);
    assert.equal(new Set(r.map((u) => u.id)).size, 3);
    for (const u of r) assert.ok(!['tidal', 'bramble', 'gilded', 'mend'].includes(u.id), `${u.id} not offered`);
  }
  // Maxed upgrades are never offered again.
  for (const u of UPGRADES) run.upgrades[u.id] = u.max;
  assert.equal(rollUpgrades(run, new RNG(1)).length, 0);
});

test('run snapshots round-trip', () => {
  const run = new Run(defaultMeta());
  run.floor = 5;
  run.addUpgrade('boots');
  run.stats.pages = 9;
  const copy = new Run(defaultMeta(), JSON.parse(JSON.stringify(run.toJSON())));
  assert.equal(copy.floor, 5);
  assert.equal(copy.upg('boots'), 1);
  assert.equal(copy.stats.pages, 9);
  assert.equal(copy.seed, run.seed);
});

test('pages economy and migration', () => {
  let total = 0;
  for (let f = 1; f < BOSS_FLOOR; f++) total += floorPages(f);
  assert.ok(total >= 35 && total <= 60, `a full run pays ${total} pages before the boss bonus`);
  const m = migrateMeta({ pages: 5, unlocked: { red: true } });
  assert.equal(m.pages, 5);
  assert.equal(m.unlocked.red, true);
  assert.equal(m.unlocked.blue, false);
  assert.ok(m.settings.sound);
});

test('blue ink arrives on floor 2, red on floor 3 (earlier with the Atlas)', () => {
  const run = new Run(defaultMeta());
  assert.ok(!run.hasInk(INK.BLUE) && !run.hasInk(INK.RED));
  run.floor = 2;
  assert.ok(run.hasInk(INK.BLUE) && !run.hasInk(INK.RED));
  assert.deepEqual(run.newInks(), [INK.BLUE]);
  run.floor = 3;
  assert.ok(run.hasInk(INK.RED));
  assert.deepEqual(run.newInks(), [INK.RED]);
  const m = defaultMeta();
  m.unlocked.blue = true;
  const early = new Run(m);
  assert.ok(early.hasInk(INK.BLUE));
  early.floor = 2;
  assert.deepEqual(early.newInks(), [], 'no announcement when already owned');
});
