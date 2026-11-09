/**
 * Menu screens (DOM overlays on paper):
 * main menu, Atlas (meta shop), how-to-play, settings, upgrade choice,
 * pause, game over and victory.
 */
import { BOSS_FLOOR } from '../config.js';
import { INK_UNLOCKS, PERKS, SKIN_LIST, perkCost } from '../game/meta.js';
import { upgradeIconSVG } from '../game/upgrades.js';
import { pageSVG, compassSVG } from './icons.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pages = (n) => `<span class="pages">${pageSVG}${n}</span>`;

export class Screens {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('screens');
    this.current = null;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      this.app.audio?.click();
      this.app.haptics?.light();
      this._act(b.dataset.action, b.dataset.arg);
    });
  }

  hide() {
    this.root.innerHTML = '';
    this.current = null;
  }

  _mount(name, html, cls = '') {
    this.current = name;
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    return this.root.firstElementChild;
  }

  _act(action, arg) {
    const a = this.app;
    const map = {
      new: () => a.newRun(),
      continue: () => a.continueRun(),
      atlas: () => this.atlas(),
      howto: () => this.howto(),
      settings: () => this.settings(arg),
      menu: () => a.toMenu(),
      back: () => (arg === 'pause' ? this.pause() : this.menu()),
      buyInk: () => a.buy('ink', arg),
      buyPerk: () => a.buy('perk', arg),
      buySkin: () => a.buy('skin', arg),
      wear: () => a.setSkin(arg),
      toggle: () => a.toggleSetting(arg),
      tutorial: () => a.replayTutorial(),
      reset: () => this.confirm('Erase ALL progress? Pages, unlocks and stats will be lost.', () => a.resetProgress()),
      pick: () => a.pickUpgrade(arg),
      resume: () => a.resume(),
      abandon: () => this.confirm('Abandon this expedition? You keep the pages you found.', () => a.abandon(), 'pause'),
      yes: () => this._yes?.(),
      closeNotice: () => this._close?.(),
      no: () => (this._no ? this._no() : this.menu()),
    };
    map[action]?.();
  }

  // -------------------------------------------------------------------------
  menu() {
    const m = this.app.meta;
    const saved = this.app.savedRun;
    const st = m.stats;
    this._mount(
      'menu',
      `<div class="panel">
        <div style="width:84px;height:84px;margin:-6px auto 4px">${compassSVG}</div>
        <h1 class="title">CARTOGRAPHER</h1>
        <p class="subtitle">What you draw becomes real.</p>
        ${saved ? `<button class="btn primary" data-action="continue">Continue - ${saved.floor >= BOSS_FLOOR ? 'The Devourer' : `Floor ${saved.floor}`}</button>` : ''}
        <button class="btn ${saved ? '' : 'primary'}" data-action="new">${saved ? 'New Expedition' : 'Begin Expedition'}</button>
        <button class="btn" data-action="atlas">The Atlas &nbsp; ${pages(m.pages)}</button>
        <div class="row">
          <button class="btn" data-action="howto">How to play</button>
          <button class="btn" data-action="settings">Settings</button>
        </div>
        <p class="note">Expeditions ${st.runs} &middot; Maps completed ${st.wins} &middot; Deepest floor ${st.bestFloor || '-'}</p>
      </div>`,
    );
  }

  atlas() {
    const m = this.app.meta;
    const inkRows = INK_UNLOCKS.map((u) => {
      const owned = m.unlocked[u.id];
      return `<div class="shop-item">
        <span class="skin-dot" style="background:${u.id === 'blue' ? '#3b72c4' : u.id === 'red' ? '#c95450' : 'radial-gradient(circle at 35% 35%,#f6dd8a,#d9a33a)'}"></span>
        <div class="txt"><b>${u.name}</b><div>${u.desc}</div></div>
        ${owned ? '<span class="owned">owned</span>' : `<button class="btn" data-action="buyInk" data-arg="${u.id}" ${m.pages < u.cost ? 'disabled' : ''}>${pages(u.cost)}</button>`}
      </div>`;
    }).join('');
    const perkRows = PERKS.map((p) => {
      const lvl = m.perks[p.id] || 0;
      const cost = perkCost(m, p);
      return `<div class="shop-item">
        <div class="txt"><b>${p.name}</b> <small>${lvl}/${p.costs.length}</small><div>${p.desc}</div></div>
        ${cost === null ? '<span class="owned">maxed</span>' : `<button class="btn" data-action="buyPerk" data-arg="${p.id}" ${m.pages < cost ? 'disabled' : ''}>${pages(cost)}</button>`}
      </div>`;
    }).join('');
    const skinRows = SKIN_LIST.map((s) => {
      const owned = m.skins.includes(s.id);
      const worn = m.skin === s.id;
      return `<div class="shop-item">
        <span class="skin-dot" style="background:linear-gradient(135deg, ${s.hat} 0 35%, ${s.coat} 35% 75%, ${s.scarf} 75%)"></span>
        <div class="txt"><b>${s.name}</b></div>
        ${worn ? '<span class="owned">wearing</span>' : owned ? `<button class="btn" data-action="wear" data-arg="${s.id}">Wear</button>` : `<button class="btn" data-action="buySkin" data-arg="${s.id}" ${m.pages < s.cost ? 'disabled' : ''}>${pages(s.cost)}</button>`}
      </div>`;
    }).join('');
    this._mount(
      'atlas',
      `<div class="panel atlas">
        <div class="atlas-head"><h2>The Atlas</h2>${pages(m.pages)}</div>
        <p class="note" style="text-align:left">Pages survive every expedition - even the ones that end badly.</p>
        <h3>Inks</h3>${inkRows}
        <h3>Starting perks</h3>${perkRows}
        <h3>Explorer</h3>${skinRows}
        <button class="btn" data-action="menu" style="margin-top:16px">Back</button>
      </div>`,
      'dim',
    );
  }

  howto() {
    this._mount(
      'howto',
      `<div class="panel howto">
        <h2>How to play</h2>
        <p><b>Tap</b> the map to walk there. The <b>golden light</b> and the compass needle at the screen edge point to the stairs.</p>
        <p><b>Press, hold, then drag</b> to draw with ink. Each tile costs 1 ink - the bubble shows the cost and turns <b style="color:#c95450">red</b> if you can't afford it. Lift your finger and the line becomes real.</p>
        <p>Ravines, rivers and <b>torn holes</b> cut every floor: <b>black</b> ink bridges them. You get <b>blue</b> (water - Smudges can't cross it) on floor 2 and <b>red</b> (walls) on floor 3.</p>
        <p><b>Undo</b> within 2 seconds for a 50% refund. <b>Quick swipe</b> to look around, <b>pinch</b> to zoom.</p>
        <p>Every minute the world <b>rewrites itself</b> and tears a rift across your way. Anything you can't see and haven't inked is redrawn - <b>your ink is the only thing that stays</b>.</p>
        <p><b>Smudges</b> smear 8 ink on touch (a heart if you're dry) and come running at the scratch of your pen. <b>Erasers</b> rub out your lines. Find the stairs on 10 floors, then survive the Devourer. 3 hearts for the whole expedition.</p>
        <button class="btn" data-action="menu">Back</button>
      </div>`,
      'dim',
    );
  }

  settings(from = 'menu') {
    const s = this.app.meta.settings;
    this._mount(
      'settings',
      `<div class="panel">
        <h2>Settings</h2>
        <div class="toggle">Sound <button class="btn" data-action="toggle" data-arg="sound">${s.sound ? 'On' : 'Off'}</button></div>
        <div class="toggle">Haptics <button class="btn" data-action="toggle" data-arg="haptics">${s.haptics ? 'On' : 'Off'}</button></div>
        <button class="btn" data-action="tutorial">Replay tutorial next run</button>
        ${from === 'pause' ? '' : '<button class="btn" data-action="reset">Reset progress</button>'}
        <button class="btn primary" data-action="back" data-arg="${from}">Back</button>
      </div>`,
      'dim',
    );
  }

  confirm(text, onYes, back = 'menu') {
    this._yes = onYes;
    this._no = back === 'pause' ? () => this.pause() : () => this.menu();
    this._mount(
      'confirm',
      `<div class="panel"><p style="font-size:17px">${text}</p>
        <div class="row"><button class="btn" data-action="no">Cancel</button><button class="btn primary" data-action="yes">Yes</button></div></div>`,
      'dim',
    );
  }

  /** Choose one of three upgrades after clearing a floor. */
  upgrade(choices, info) {
    const cards = choices
      .map(
        (u) => `<button class="card" data-action="pick" data-arg="${u.id}">
          <span class="glyph">${upgradeIconSVG(u)}</span>
          <span class="txt"><b>${u.name}</b><span>${u.desc}</span>
          ${info.levels[u.id] ? `<div class="lvl">owned x${info.levels[u.id]}</div>` : ''}</span>
        </button>`,
      )
      .join('');
    this._mount(
      'upgrade',
      `<div class="panel" style="margin-bottom:14px">
        <h2>Floor ${info.floor} charted!</h2>
        <p class="subtitle" style="margin:0">+${info.pages} pages &middot; next: ${info.next >= BOSS_FLOOR ? '<b>The Devourer</b>' : `Floor ${info.next}`}</p>
      </div>
      <div class="cards">${cards}</div>
      <p class="note" style="color:#f3f4ef">Choose one</p>`,
      'dim',
    );
  }

  /** A new ink is handed to the explorer mid-run. */
  newInk(types, onClose) {
    const info = {
      2: {
        name: 'Blue ink',
        color: '#3b72c4',
        what: 'Paints <b>water</b>.',
        how: '<b>Smudges cannot cross water.</b> Draw a line of blue between you and them. It also puts out fire.',
      },
      3: {
        name: 'Red ink',
        color: '#c95450',
        what: 'Builds <b>walls</b>.',
        how: 'Walls stop <b>everything</b>: Smudges, Erasers, even ink blots. Box yourself in, or wall off a crossing. Careful - you can\'t walk through them either.',
      },
    };
    this._close = onClose;
    const cards = types
      .map((t) => {
        const i = info[t];
        return `<div class="ink-card"><span class="ink-blot" style="background:${i.color}"></span>
          <h2 style="color:${i.color}">${i.name}</h2><p class="ink-what">${i.what}</p><p>${i.how}</p></div>`;
      })
      .join('');
    this._mount(
      'newInk',
      `<div class="panel">
        <p class="subtitle" style="margin:0 0 6px">A new ink for your quill!</p>
        ${cards}
        <p class="note">Pick inks with the buttons at the bottom of the screen.</p>
        <button class="btn primary" data-action="closeNotice">Got it</button>
      </div>`,
      'dim',
    );
  }

  pause() {
    this._mount(
      'pause',
      `<div class="panel">
        <h2>Paused</h2>
        <button class="btn primary" data-action="resume">Resume</button>
        <button class="btn" data-action="settings" data-arg="pause">Settings</button>
        <button class="btn" data-action="abandon">Abandon expedition</button>
      </div>`,
      'dim',
    );
  }

  /** Game over / victory with run stats. */
  summary(r) {
    const rows = [
      ['Floors charted', `${r.floorsCleared} / ${BOSS_FLOOR}`],
      ['Ink used', r.inkUsed],
      ['Tiles drawn', r.tilesDrawn],
      ['Chests opened', r.chests],
      ['Enemies trapped', r.trapped],
      ['Time', fmtTime(r.time)],
    ];
    this._mount(
      'summary',
      `<div class="panel">
        <h2>${r.victory ? 'The Map is Complete!' : 'The Ink Runs Dry'}</h2>
        <p class="subtitle">${r.victory ? 'The Devourer is left behind; your map is whole.' : r.floorReached >= BOSS_FLOOR ? 'Devoured at the very end...' : `Lost on floor ${r.floorReached}.`}</p>
        <div class="stats">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
        <p style="font-size:18px">Pages earned: ${pages(r.pages)}${r.bonus ? ` <small>(incl. +${r.bonus} victory)</small>` : ''}</p>
        <button class="btn primary" data-action="new">New Expedition</button>
        <div class="row">
          <button class="btn" data-action="atlas">Atlas</button>
          <button class="btn" data-action="menu">Menu</button>
        </div>
      </div>`,
      'dim',
    );
  }
}
