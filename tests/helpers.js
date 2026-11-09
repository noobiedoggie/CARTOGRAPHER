/**
 * Test helpers: a headless "cartographer bot" that plays a floor through the
 * real Game API (tap-to-walk + ink strokes), guided by the floor solver.
 */
import { cheapestRoute, inkNeed, inkField } from '../src/world/solver.js';
import { INK, T } from '../src/world/tiles.js';

export const DT = 1 / 30;

export function step(game, seconds) {
  const n = Math.ceil(seconds / DT);
  for (let k = 0; k < n && !game.done && !game.dead; k++) game.update(DT);
}

/** Walk to tile index `target`; returns true when the explorer arrives. */
export function walkTo(game, target, maxSeconds = 60) {
  const w = game.world;
  const t0 = game.time;
  while (game.playerTile !== target && !game.done && !game.dead && game.time - t0 < maxSeconds) {
    if (!game.player.path.length && !game.walkTo(w.xOf(target), w.yOf(target))) step(game, 0.2);
    step(game, 0.1);
  }
  return game.playerTile === target;
}

/** Draw a stroke over the given tile indices (in order). */
export function drawTiles(game, tiles, type = INK.BLACK) {
  const w = game.world;
  game.setInkType(type);
  if (!game.beginStroke(w.xOf(tiles[0]) + 0.5, w.yOf(tiles[0]) + 0.5)) return false;
  for (const i of tiles.slice(1)) game.extendStroke(w.xOf(i) + 0.5, w.yOf(i) + 0.5);
  game.endStroke();
  return true;
}

/**
 * Play the current floor to the exit, bridging only what the solver says is
 * necessary. Returns { ok, reason, time }.
 */
export function botPlayFloor(game, maxSeconds = 400) {
  const w = game.world;
  const exit = w.idx(w.exit.x, w.exit.y);
  let lastProgress = game.time;
  let lastTile = -1;
  while (!game.done && !game.dead && game.time < maxSeconds) {
    const route = cheapestRoute(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile, exit);
    // Mid-sweep the page is half old, half new: wait for the wave to finish.
    if (game.rewrite && game.rewrite.sweeping) {
      step(game, 0.25);
      continue;
    }
    if (!isFinite(route.cost)) return { ok: false, reason: 'no route', time: game.time };
    if (route.cost > Math.floor(game.run.ink)) {
      // Short on ink: refill at the nearest pool reachable for free, else wait for a wave.
      const { dist } = inkField(w.w, w.h, w.terrain, w.ink, w.scrib, game.playerTile);
      let pool = -1;
      for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.POOL && dist[i] === 0) pool = i;
      if (pool >= 0) walkTo(game, pool, 60);
      else step(game, 1);
      if (game.time - lastProgress > 120) return { ok: false, reason: `ink ${game.run.ink} < ${route.cost}`, time: game.time };
      continue;
    }
    const need = (i) => inkNeed(w.terrain, w.ink, w.scrib, i);
    let k = 0;
    while (k + 1 < route.path.length && need(route.path[k + 1]) === 0) k++;
    const standAt = route.path[k];
    if (standAt !== game.playerTile) {
      walkTo(game, standAt, 60);
    } else {
      const run = [];
      for (let j = k + 1; j < route.path.length && need(route.path[j]) === 1 && w.explored[route.path[j]]; j++) run.push(route.path[j]);
      if (run.length) {
        // Start the stroke on our own tile so the bridge connects.
        drawTiles(game, [standAt, ...run]);
        step(game, 0.3);
        walkTo(game, run[run.length - 1], 10);
      } else step(game, 0.2);
    }
    if (game.playerTile !== lastTile) {
      lastTile = game.playerTile;
      lastProgress = game.time;
    } else if (game.time - lastProgress > 40) return { ok: false, reason: 'stuck', time: game.time };
  }
  return { ok: game.done, reason: game.dead ? 'dead' : game.done ? 'exit' : 'timeout', time: game.time };
}
