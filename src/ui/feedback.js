/**
 * Game-feel glue: turns game events into particles, floating text, toasts,
 * screen shake, sound and haptics. Keeps the simulation free of presentation.
 */
import { TILE } from '../config.js';
import { INK } from '../world/tiles.js';

const S = TILE;

/**
 * @param {import('../game/game.js').Game} game
 * @param {object} o { renderer, camera, hud, audio, haptics }
 */
export function bindFeedback(game, { renderer, camera, hud, audio, haptics }) {
  const fx = renderer.effects;
  const ev = game.events;
  const w = game.world;
  const tileC = (i) => [(w.xOf(i) + 0.5) * S, (w.yOf(i) + 0.5) * S];
  const xyC = (x, y) => [(x + 0.5) * S, (y + 0.5) * S];
  const A = (name, ...args) => audio && audio[name] && audio[name](...args);
  const H = (name, ...args) => haptics && haptics[name] && haptics[name](...args);

  ev.on('toast', (d) => hud.toast(d.text, d.kind));
  ev.on('walk', () => A('step'));
  ev.on('noPath', (d) => {
    const [x, y] = xyC(d.x, d.y);
    fx.ring(x, y, 'rgba(163,48,42,0.9)', 22, 0.5, 2);
    A('deny');
  });

  // --- Drawing -----------------------------------------------------------
  ev.on('strokeStart', () => {
    A('scratchStart');
    H('drawStart');
  });
  ev.on('strokeTile', () => {
    A('scratchTick');
    H('drawTick');
  });
  ev.on('strokeCancel', () => {
    A('scratchStop');
    H('drawEnd');
  });
  ev.on('stroke', (d) => {
    A('scratchStop');
    A('inkSet', d.type);
    H('drawEnd');
    const color = d.type === INK.BLUE ? '#2f62a8' : d.type === INK.RED ? '#a3302a' : d.type === INK.GOLD ? '#e0b648' : '#1d1915';
    for (const i of d.tiles.slice(0, 40)) {
      if (Math.random() < 0.4) {
        const [x, y] = tileC(i);
        fx.burst(x, y, 2, { color, speed: 34, size: 1.7 });
      }
    }
    if (d.type === INK.GOLD) {
      const [x, y] = tileC(d.tiles[0]);
      fx.burst(x, y, 24, { color: '#f0d27a', kind: 'ember', speed: 110, life: 1 });
    }
    if (d.partial) hud.toast('Out of ink - only part of the line was drawn', 'warn');
  });
  ev.on('strokeFail', () => {
    A('scratchStop');
    A('deny');
    H('drawEnd');
    hud.toast('Not enough ink!', 'warn');
  });
  ev.on('undo', (d) => {
    A('undo');
    hud.toast(`Undone  (+${d.refund} ink)`, 'info', 1200);
    for (const i of d.tiles.slice(0, 20)) {
      const [x, y] = tileC(i);
      fx.burst(x, y, 2, { color: '#d9c7a0', kind: 'flake', speed: 40 });
    }
  });

  // --- Pickups -------------------------------------------------------------
  ev.on('pool', (d) => {
    const [x, y] = xyC(d.x, d.y);
    fx.ring(x, y, '#2a2440', 40, 0.7);
    fx.burst(x, y, 12, { color: '#2a2440', speed: 70, up: 40, gravity: 160 });
    fx.text(x, y - 18, `+${d.gain} ink`, '#1d1915');
    A('pool');
    H('light');
  });
  ev.on('chest', (d) => {
    const [x, y] = xyC(d.x, d.y);
    fx.burst(x, y, 16, { color: '#e0b648', speed: 90, kind: 'flake', up: 30 });
    fx.text(x, y - 20, d.text, d.kind === 'heart' ? '#a3302a' : '#6b4a2b');
    A('chest');
    H('medium');
  });
  ev.on('exitSeen', () => {
    hud.toast('You spot the stairs down!', 'gold');
    A('chime');
  });

  // --- Danger --------------------------------------------------------------
  ev.on('damage', (d) => {
    camera.shake(10);
    renderer.flash = 0.5;
    const p = game.player;
    fx.burst(p.x * S, p.y * S, 14, { color: '#a3302a', speed: 120, size: 2.2 });
    A('hit');
    H('hit');
    if (d.source === 'fire') hud.toast('Burned!', 'warn', 1000);
  });
  ev.on('fall', () => hud.toast('You fell! Back on solid ground...', 'warn'));
  let smearToasts = 0;
  ev.on('smeared', (d) => {
    const p = game.player;
    camera.shake(8);
    renderer.flash = 0.3;
    fx.burst(p.x * S, p.y * S, 22, { color: '#1d1915', speed: 140, size: 3, gravity: 120 });
    fx.text(p.x * S, p.y * S - 22, `-${d.amount} ink`, '#1d1915', 16);
    hud.flashInk();
    A('smear');
    H('hit');
    if (smearToasts++ < 2) hud.toast('A Smudge smeared your ink! Run dry and it will cost a heart.', 'warn', 2400);
  });
  ev.on('dying', () => {
    A('death');
    H('death');
    camera.shake(16);
  });
  ev.on('alert', (d) => {
    if (d.visible) {
      A('alert');
      H('light');
    }
  });
  ev.on('erase', (d) => {
    const [x, y] = tileC(d.i);
    fx.burst(x, y, 10, { color: '#e59aa1', kind: 'crumb', speed: 70, gravity: 120, size: 1.8 });
    if (d.visible) A('erase');
  });
  ev.on('scribble', (d) => {
    for (const i of d.tiles) {
      const [x, y] = tileC(i);
      fx.burst(x, y, 4, { color: '#4a205c', speed: 50, size: 1.5 });
    }
    if (d.visible) {
      A('scribble');
      hud.toast('A Scribbler walls you in!', 'warn', 1500);
    }
  });
  ev.on('blot', () => A('blot'));
  ev.on('blotSplash', (d) => {
    fx.burst(d.x * S, d.y * S, 8, { color: '#1c1424', speed: 70, size: 2 });
    if (d.blocked) fx.text(d.x * S, d.y * S - 12, 'blocked!', '#a3302a', 13);
  });
  ev.on('trapped', (d) => {
    const water = d.into === 'water';
    fx.burst(d.x * S, d.y * S, 18, { color: water ? '#6f9bbf' : '#211a26', speed: 90, up: water ? 60 : 0, gravity: water ? 200 : 0 });
    fx.text(d.x * S, d.y * S - 18, 'Trapped!', '#6b4a2b');
    A('trapped');
  });
  ev.on('stunned', (d) => fx.text(d.e.x * S, d.e.y * S - 20, 'snagged!', '#a3302a', 12));
  ev.on('ignite', (d) => {
    const [x, y] = tileC(d.i);
    fx.burst(x, y, 8, { kind: 'ember', speed: 60, up: 40, life: 1.2 });
  });
  ev.on('extinguish', (d) => {
    const [x, y] = tileC(d.i);
    fx.burst(x, y, 10, { color: 'rgba(240,240,240,0.8)', speed: 40, up: 50, size: 3, life: 1 });
    A('hiss');
  });
  ev.on('burnt', (d) => {
    const [x, y] = tileC(d.i);
    fx.burst(x, y, 8, { color: '#5a4a3a', kind: 'flake', speed: 40, up: 30 });
  });

  // --- The world rewrites itself ------------------------------------------
  ev.on('rewriteWarn', () => {
    hud.toast('The page trembles... ink your route before it is rewritten!', 'danger', 3000);
    A('droneStart');
    H('light');
  });
  ev.on('rewriteTick', (d) => {
    camera.shake(2 + (4 - d.n) * 2);
    A('tick', d.n);
    H('medium');
  });
  ev.on('rewriteStart', () => {
    camera.shake(14);
    renderer.flash = 0.35;
    renderer.flashColor = '45,28,12';
    A('rewrite');
    H('rumble');
  });
  ev.on('rewriteEnd', (d) => {
    A('droneStop');
    renderer.flashColor = '163,48,42';
    if (d.cut) hud.toast('The page tore open across your way! Only your ink held.', 'danger', 3200);
    else hud.toast('The world has been rewritten. Only your ink remains.', 'danger', 2600);
    if (d.rescue === 'carved') hud.toast('...but a new passage opened', 'info');
  });

  // --- Boss ------------------------------------------------------------------
  ev.on('bossAwake', () => {
    camera.shake(16);
    hud.toast('The Devourer awakens!', 'danger', 2600);
    A('roar');
    H('death');
  });
  ev.on('devour', (d) => {
    const [x, y] = tileC(d.i);
    if (Math.random() < 0.5) fx.burst(x, y, 3, { color: '#c98a93', kind: 'crumb', speed: 80, gravity: 100 });
  });
  ev.on('anchor', (d) => {
    const [x, y] = xyC(d.x, d.y);
    fx.ring(x, y, '#e0b648', 90, 1, 5);
    fx.burst(x, y, 30, { kind: 'ember', speed: 140, life: 1.1 });
    camera.shake(8);
    hud.toast(`Anchor lit (${d.lit}/${d.total}) - the Devourer reels!`, 'gold');
    A('anchor');
    H('medium');
  });
  ev.on('exit', () => {
    A('exit');
    H('medium');
  });
}
