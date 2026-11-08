/**
 * Floor-1 tutorial: a sequence of tooltips that teach tap-to-walk, drawing,
 * ink cost, undo, pools, the rewrite wave and the stairs. Steps wait for a
 * trigger (e.g. a chasm in view), then finish when the player does the
 * thing - or after a few seconds for purely informative tips.
 */
import { TILE } from '../config.js';
import { T, isBridgeable } from '../world/tiles.js';

const S = TILE;

function findVisible(game, pred) {
  const w = game.world;
  const p = game.player;
  let best = -1;
  let bestD = 1e9;
  for (let i = 0; i < w.n; i++) {
    if (!w.visible[i] || !pred(w, i)) continue;
    const d = Math.abs(w.xOf(i) - p.tx) + Math.abs(w.yOf(i) - p.ty);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const STEPS = [
  {
    id: 'walk',
    text: '<b>Tap</b> anywhere on the map to walk there.',
    done: (g, t) => t.taps >= 1 && g.floorStats.walked >= 3,
    target: (g) => {
      const w = g.world;
      const p = g.player;
      for (let dy = -5; dy <= -2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = p.tx + dx;
          const y = p.ty + dy;
          if (w.inside(x, y) && w.visible[w.idx(x, y)] && w.canWalk(w.idx(x, y), 0)) return w.idx(x, y);
        }
      return -1;
    },
  },
  { id: 'fog', text: 'The world is hidden in fog. Everything you have seen stays on your map as a faded <b>sketch</b>.', auto: 5 },
  {
    id: 'draw',
    when: (g) => findVisible(g, (w, i) => isBridgeable(w.terrain[i]) && !w.ink[i]) >= 0,
    text: 'Something blocks the way! <b>Press and hold</b>, then <b>drag</b> across it to draw a bridge of ink.',
    done: (g) => g.floorStats.strokes >= 1,
    target: (g) => findVisible(g, (w, i) => isBridgeable(w.terrain[i]) && !w.ink[i]),
  },
  { id: 'cost', text: 'Each tile costs <b>1 ink</b> (the bar at the top). While you draw, the bubble shows the price - <b>red</b> means you can\'t afford it.', auto: 6.5 },
  { id: 'undo', text: 'Drew something silly? Tap <b>Undo</b> within 2 seconds to get half the ink back.', auto: 5 },
  { id: 'look', text: '<b>Swipe</b> quickly to look around and <b>pinch</b> to zoom. Your lines are <b>permanent</b> for this floor.', auto: 5.5 },
  {
    id: 'pool',
    when: (g) => findVisible(g, (w, i) => w.terrain[i] === T.POOL) >= 0,
    text: 'An <b>ink pool</b>! Walk over it to refill your ink.',
    done: (g) => g.floorStats.poolsUsed >= 1,
    auto: 9,
    target: (g) => findVisible(g, (w, i) => w.terrain[i] === T.POOL),
  },
  {
    id: 'rewrite',
    interrupt: true,
    when: (g) => g.rewrite && !g.rewrite.sweeping && g.rewrite.timeLeft <= 14,
    text: 'Every minute the world <b>rewrites itself</b>: anything you can\'t see and haven\'t inked will change. Ink a path to keep a route!',
    auto: 9,
  },
  {
    id: 'exit',
    interrupt: true,
    when: (g) => g.exitKnown,
    text: 'There are the <b>stairs</b>! Reach them to finish the floor. Watch out for <b>Smudges</b> - they can\'t cross water.',
    auto: 7,
    target: (g) => g.world.idx(g.world.exit.x, g.world.exit.y),
  },
];

export class Tutorial {
  constructor(onFinish) {
    this.onFinish = onFinish;
    this.el = document.getElementById('tooltip');
    this.queue = STEPS.slice();
    this.cur = null;
    this.timer = 0;
    this.taps = 0;
    this.active = true;
    this.target = -1;
    this.shown = 0;
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  notify(evt) {
    if (evt === 'tap') this.taps++;
  }

  _show(step) {
    this.cur = step;
    this.timer = 0;
    this.shown++;
    this.queue = this.queue.filter((s) => s !== step);
    this.el.innerHTML = `<div>${step.text}</div>
      <div class="tip-row"><span>Tip ${this.shown} / ${STEPS.length}</span><button class="tip-skip" type="button">Skip tutorial</button></div>`;
    this.el.querySelector('.tip-skip').addEventListener('click', () => this.finish());
    this.el.hidden = false;
    this.el.style.animation = 'none';
    void this.el.offsetWidth;
    this.el.style.animation = '';
  }

  update(dt, game) {
    if (!this.active) return;
    // Interrupting tips (rewrite warning, stairs) jump the queue.
    if (!this.cur || !this.cur.interrupt) {
      const urgent = this.queue.find((s) => s.interrupt && s.when(game));
      if (urgent) {
        if (this.cur) this.queue.unshift(this.cur);
        this._show(urgent);
      }
    }
    if (!this.cur) {
      const next = this.queue.find((s) => !s.interrupt);
      if (!next) {
        if (!this.queue.length) this.finish();
        return;
      }
      if (next.when && !next.when(game)) {
        this.el.hidden = true;
        this.target = -1;
        return;
      }
      this._show(next);
    }
    this.timer += dt;
    const c = this.cur;
    this.target = c.target ? c.target(game) : -1;
    const done = (c.done && c.done(game, this)) || (c.auto && this.timer >= c.auto && (!c.done || this.timer >= c.auto));
    if (done && this.timer > 1.2) {
      this.cur = null;
      this.el.hidden = true;
    }
  }

  /** World-space highlight drawn by the renderer. */
  draw(ctx, game, time) {
    if (!this.active || this.target < 0) return;
    const w = game.world;
    const cx = (w.xOf(this.target) + 0.5) * S;
    const cy = (w.yOf(this.target) + 0.5) * S;
    const r = S * (0.7 + 0.12 * Math.sin(time * 5));
    ctx.save();
    ctx.strokeStyle = 'rgba(163,48,42,0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const b = Math.sin(time * 6) * 5;
    ctx.fillStyle = '#a3302a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r - 4 + b);
    ctx.lineTo(cx - 9, cy - r - 18 + b);
    ctx.lineTo(cx + 9, cy - r - 18 + b);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.el.hidden = true;
    this.target = -1;
    this.onFinish?.();
  }

  dispose() {
    this.active = false;
    this.el.hidden = true;
  }
}
