/**
 * A "skilled" bot used by the balance harness: it knows the cheapest route,
 * detours to ink pools when low, blocks chasing Smudges with water/walls,
 * backs off, and springs the undo trap on Smudges standing on a fresh bridge.
 */
import { BOSS_FLOOR } from '../src/config.js';
import { INK, T } from '../src/world/tiles.js';
import { cheapestRoute, inkNeed, inkField } from '../src/world/solver.js';

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

export function playFloor(game) {
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
    // Only Smudges that can actually reach us are a threat.
    const chasers = game.enemies.filter(
      (e) => e.alive && e.kind === 'smudge' && e.state === 'chase' && e.sated <= 0 && e.path.length && e.path[e.path.length - 1] === game.playerTile,
    );
    // The undo trap: a Smudge stepped onto the bridge we just drew.
    if (game.lastStroke && game.undoTimeLeft() > 0) {
      const tiles = new Set(game.lastStroke.tiles.map((t) => t.i));
      if (chasers.some((e) => tiles.has(e.tile)) && !tiles.has(game.playerTile)) {
        game.undo();
        continue;
      }
    }
    const threat = chasers.find((e) => e.distTo(game.player) < 3.2);
    if (threat && defendCd <= 0 && defend(game, threat, route.cost)) {
      defendCd = 2;
      continue;
    }
    if (threat && threat.distTo(game.player) < 2.2) {
      // Back off, away from the Smudge.
      const p = game.player;
      const dx = p.x - threat.x;
      const dy = p.y - threat.y;
      const l = Math.hypot(dx, dy) || 1;
      game.walkTo(Math.round(p.x + (dx / l) * 4 - 0.5), Math.round(p.y + (dy / l) * 4 - 0.5));
      continue;
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
    if (still > 30) {
      if (process.env.DEBUG) console.log(`  stuck f${game.floor}: ink ${game.run.ink.toFixed(1)} routeCost ${route.cost} sweeping ${game.rewrite?.sweeping} pools ${[...w.terrain].filter((t) => t === T.POOL).length} pathLen ${game.player.path.length}`);
      return 'stuck';
    }
  }
  if (!game.done && !game.dead && process.env.DEBUG) {
    const route = cheapestRoute(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, exitIdx());
    const near = game.enemies.filter((e) => e.alive && e.distTo(game.player) < 6).map((e) => `${e.kind}:${e.state}:${e.distTo(game.player).toFixed(1)}`);
    const ch = { 0: '.', 1: '#', 2: ' ', 3: '~', 4: 'r', 5: 'O', 6: 'o', 7: '$', 8: 'c', 9: 'E', 12: '*' };
    const e = w.exit;
    for (let y = Math.max(0, e.y - 4); y <= e.y + 5; y++) {
      let line = '';
      for (let x = e.x - 8; x <= e.x + 8; x++) {
        if (!w.inside(x, y)) continue;
        const i = w.idx(x, y);
        const en = game.enemies.find((q) => q.alive && q.tile === i);
        line += x === game.player.tx && y === game.player.ty ? '@' : en ? en.kind[0].toUpperCase() : w.ink[i] ? 'k' : ch[w.terrain[i]] ?? '?';
      }
      console.log('     ' + line);
    }
    console.log(`  timeout f${game.floor}: ink ${game.run.ink.toFixed(1)} cost ${route.cost} tile ${game.player.tx},${game.player.ty} path ${game.player.path.length} near ${near.join(' ')} waves ${game.rewrite.count}`);
  }
  return game.done ? 'exit' : game.dead ? 'dead' : 'timeout';
}

