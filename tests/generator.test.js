import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloor, floorParams } from '../src/world/generator.js';
import { inkField } from '../src/world/solver.js';
import { T } from '../src/world/tiles.js';
import { MAP_W, MAP_H, BOSS_FLOOR } from '../src/config.js';

const W = MAP_W;
const H = MAP_H;

test('every floor type generates valid, beatable maps', () => {
  for (let floor = 1; floor <= BOSS_FLOOR; floor++) {
    const p = floorParams(floor);
    for (let s = 0; s < 40; s++) {
      const g = generateFloor(floor, 9000 + s * 131 + floor);
      const start = g.start.y * W + g.start.x;
      const exit = g.exit.y * W + g.exit.x;
      assert.equal(g.terrain[exit], T.EXIT, 'exit tile is stairs');
      assert.ok(g.start.y >= H - 8, 'start near the bottom');
      assert.ok(g.exit.y <= 7, 'exit near the top');
      const { dist } = inkField(W, H, g.terrain, null, null, start);
      assert.ok(dist[exit] >= 0, `floor ${floor} seed ${s}: exit reachable`);
      assert.equal(dist[exit], g.cost);
      if (g.attempts <= 60) {
        assert.ok(g.cost >= p.minCost && g.cost <= p.maxCost, `floor ${floor}: cost ${g.cost} within [${p.minCost},${p.maxCost}]`);
      }
      // Border is solid rock.
      for (let x = 0; x < W; x++) {
        assert.equal(g.terrain[x], T.ROCK);
        assert.equal(g.terrain[(H - 1) * W + x], T.ROCK);
      }
      // At least one ink pool reachable without spending ink.
      let freePool = false;
      let pools = 0;
      for (let i = 0; i < W * H; i++) {
        if (g.terrain[i] === T.POOL) {
          pools++;
          if (dist[i] === 0) freePool = true;
          assert.ok(dist[i] >= 0, 'pools are reachable');
        }
      }
      assert.ok(pools >= 2, `floor ${floor}: has pools (${pools})`);
      assert.ok(freePool, `floor ${floor} seed ${s}: a pool reachable for free`);
      if (p.boss) {
        assert.equal(g.anchors.length, 3, 'boss floor has 3 anchors');
        for (const a of g.anchors) assert.ok(dist[a] >= 0, 'anchor reachable');
      }
    }
  }
});

test('generation is deterministic per seed', () => {
  const a = generateFloor(4, 12345);
  const b = generateFloor(4, 12345);
  assert.deepEqual(a.terrain, b.terrain);
  assert.deepEqual(a.start, b.start);
});

test('later floors demand more ink on average', () => {
  const avg = (f) => {
    let s = 0;
    for (let k = 0; k < 30; k++) s += generateFloor(f, 777 + k).cost;
    return s / 30;
  };
  assert.ok(avg(10) > avg(1) + 2);
});
