/**
 * In-game HUD (DOM overlay): ink bar with live cost preview, hearts, floor
 * label, rewrite timer, pause, ink picker and undo button. Values are only
 * written to the DOM when they change, so updating every frame is cheap.
 */
import { INK } from '../world/tiles.js';
import { BOSS_FLOOR } from '../config.js';
import { heartSVG, hourglassSVG, pauseSVG, undoSVG } from './icons.js';

const INK_INFO = {
  [INK.BLACK]: { name: 'Path', sub: 'bridge', cls: 'black' },
  [INK.BLUE]: { name: 'Water', sub: 'blocks foes', cls: 'blue' },
  [INK.RED]: { name: 'Wall', sub: 'blocks all', cls: 'red' },
  [INK.GOLD]: { name: 'Gold', sub: 'reveal', cls: 'gold' },
};

export class HUD {
  constructor(handlers) {
    this.h = handlers;
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-row">
          <div class="hearts" id="hearts"></div>
          <div class="floor-label" id="floor-label"></div>
          <div class="timer" id="timer">${hourglassSVG}<span id="timer-text">1:00</span></div>
          <button class="icon-btn" id="btn-pause" aria-label="Pause">${pauseSVG}</button>
        </div>
        <div class="ink-bar" id="ink-bar">
          <div class="ink-fill" id="ink-fill"></div>
          <div class="ink-cost" id="ink-cost"></div>
          <span class="ink-text" id="ink-text"></span>
        </div>
        <div class="objective" id="objective" hidden></div>
      </div>
      <div class="hud-bottom">
        <button class="undo-btn" id="btn-undo" hidden>${undoSVG}<span>Undo</span><i id="undo-ring"></i></button>
        <div class="ink-picker" id="ink-picker"></div>
      </div>`;
    this.el = {
      hearts: this.root.querySelector('#hearts'),
      floor: this.root.querySelector('#floor-label'),
      timer: this.root.querySelector('#timer'),
      timerText: this.root.querySelector('#timer-text'),
      inkBar: this.root.querySelector('#ink-bar'),
      inkFill: this.root.querySelector('#ink-fill'),
      inkCost: this.root.querySelector('#ink-cost'),
      inkText: this.root.querySelector('#ink-text'),
      objective: this.root.querySelector('#objective'),
      undo: this.root.querySelector('#btn-undo'),
      undoRing: this.root.querySelector('#undo-ring'),
      picker: this.root.querySelector('#ink-picker'),
    };
    this.cache = {};
    const stop = (e) => e.stopPropagation();
    for (const b of [this.el.undo, this.root.querySelector('#btn-pause')]) b.addEventListener('pointerdown', stop);
    this.el.undo.addEventListener('click', () => this.h.onUndo?.());
    this.root.querySelector('#btn-pause').addEventListener('click', () => this.h.onPause?.());
    this.toasts = document.getElementById('toasts');
  }

  show(on) {
    this.root.hidden = !on;
  }

  /** Rebuild the ink picker for the inks this run has. */
  buildPicker(run) {
    const types = [INK.BLACK, INK.BLUE, INK.RED, INK.GOLD].filter((t) => run.hasInk(t));
    this.el.picker.innerHTML = types
      .map(
        (t) => `<button class="ink-btn ${INK_INFO[t].cls}" data-ink="${t}">
          <span class="swatch"></span><b>${INK_INFO[t].name}</b><small data-sub>${INK_INFO[t].sub}</small></button>`,
      )
      .join('');
    for (const b of this.el.picker.querySelectorAll('.ink-btn')) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => this.h.onInk?.(Number(b.dataset.ink)));
    }
    this.el.picker.hidden = types.length <= 1 && false;
    this.cache.inkType = -1;
    this.cache.gold = -1;
  }

  _set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  update(game) {
    const run = game.run;
    const el = this.el;
    // Hearts
    this._set('hearts', run.hearts, (h) => {
      let s = '';
      for (let i = 0; i < 3; i++) s += heartSVG(i < h);
      el.hearts.innerHTML = s;
      el.hearts.classList.remove('hit');
      void el.hearts.offsetWidth;
      el.hearts.classList.add('hit');
    });
    this._set('floor', run.floor, (f) => {
      el.floor.textContent = f >= BOSS_FLOOR ? 'The Devourer' : `Floor ${f}`;
    });

    // Ink bar + live cost preview
    const max = run.maxInk;
    const ink = Math.floor(run.ink + 1e-6);
    const pv = game.strokePreview();
    const isGold = pv && pv.type === INK.GOLD;
    const cost = pv && !isGold ? pv.cost : 0;
    const short = cost > ink;
    this._set('ink', `${ink}/${max}/${cost}`, () => {
      const fillPct = Math.max(0, Math.min(1, ink / max)) * 100;
      el.inkFill.style.width = `${fillPct}%`;
      const costPct = (Math.min(cost, ink) / max) * 100;
      el.inkCost.style.width = `${short ? fillPct : costPct}%`;
      el.inkCost.style.left = `${short ? 0 : fillPct - costPct}%`;
      el.inkText.textContent = cost ? `${ink} / ${max}   -${cost}` : `${ink} / ${max}`;
    });
    this._set('short', short, (s) => el.inkBar.classList.toggle('short', s));
    this._set('previewing', cost > 0, (s) => el.inkBar.classList.toggle('previewing', s));

    // Rewrite timer
    const rw = game.rewrite;
    const tleft = rw ? Math.ceil(rw.timeLeft) : -1;
    const sweeping = rw ? rw.sweeping : false;
    this._set('timer', `${tleft}/${sweeping}`, () => {
      if (!rw) {
        el.timer.hidden = true;
        return;
      }
      el.timer.hidden = false;
      el.timerText.textContent = sweeping ? 'Rewriting' : `${Math.floor(tleft / 60)}:${String(tleft % 60).padStart(2, '0')}`;
      el.timer.classList.toggle('urgent', !sweeping && tleft <= 10);
      el.timer.classList.toggle('sweeping', sweeping);
    });

    // Objective line (boss anchors etc.)
    const obj = game.objectiveText ? game.objectiveText() : '';
    this._set('objective', obj, (o) => {
      el.objective.hidden = !o;
      el.objective.textContent = o;
    });

    // Ink picker state
    this._set('inkType', game.inkType, (t) => {
      for (const b of el.picker.querySelectorAll('.ink-btn')) b.classList.toggle('active', Number(b.dataset.ink) === t);
    });
    this._set('gold', run.gold, (g) => {
      const b = el.picker.querySelector('.ink-btn.gold small');
      if (b) b.textContent = `x${g}`;
    });

    // Undo
    const left = game.undoTimeLeft();
    const show = left > 0;
    this._set('undoShow', show, (s) => {
      el.undo.hidden = !s;
    });
    if (show) el.undoRing.style.setProperty('--t', String(left / run.undoWindow));
  }

  /** Floating message near the top of the screen. */
  toast(text, kind = 'info', ms = 2200) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }
}
