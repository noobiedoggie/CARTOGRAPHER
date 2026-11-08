/**
 * Run state: everything that persists between floors of one expedition
 * (hearts, gold ink, upgrades, statistics) plus derived modifiers that the
 * floor logic reads (max ink, vision, speed...). Meta-progression perks from
 * the Atlas are folded in here too.
 */
import { BAL, BOSS_FLOOR } from '../config.js';
import { INK } from '../world/tiles.js';
import { randomSeed } from '../core/rng.js';

export function freshStats() {
  return {
    inkUsed: 0,
    tilesDrawn: 0,
    floorsCleared: 0,
    chests: 0,
    trapped: 0,
    hits: 0,
    pages: 0,
    time: 0,
  };
}

export class Run {
  /**
   * @param {object} meta  persistent Atlas save (perks, unlocks) - may be null
   * @param {object} [saved] a run snapshot produced by toJSON()
   */
  constructor(meta, saved = null) {
    this.meta = meta || { perks: {}, unlocked: {} };
    if (saved) {
      Object.assign(this, structuredClone(saved));
      this.meta = meta || this.meta;
      return;
    }
    this.seed = randomSeed();
    this.floor = 1;
    this.hearts = BAL.hearts;
    this.upgrades = {};
    this.stats = freshStats();
    this.gold = this.hasInk(INK.GOLD) ? BAL.startGold : 0;
    this.ink = this.maxInk;
    this.skin = this.meta.skin || 'classic';
  }

  upg(id) {
    return this.upgrades[id] || 0;
  }
  perk(id) {
    return (this.meta.perks && this.meta.perks[id]) || 0;
  }
  addUpgrade(id) {
    this.upgrades[id] = this.upg(id) + 1;
  }

  /** Is an ink type available this run? Black is always available. */
  hasInk(type) {
    if (type === INK.BLACK) return true;
    const u = this.meta.unlocked || {};
    if (type === INK.BLUE) return !!u.blue;
    if (type === INK.RED) return !!u.red;
    if (type === INK.GOLD) return !!u.gold;
    return false;
  }

  get isBossFloor() {
    return this.floor >= BOSS_FLOOR;
  }
  get maxInk() {
    return Math.round((BAL.startInk + 6 * this.perk('inkwell')) * (1 + 0.2 * this.upg('well')));
  }
  get vision() {
    return BAL.vision + this.perk('eyes') + this.upg('vision');
  }
  get speedMult() {
    return 1 + 0.15 * this.upg('boots');
  }
  get rewriteInterval() {
    const base = this.isBossFloor ? BAL.bossRewriteInterval : BAL.rewriteInterval;
    return base + 15 * this.upg('patience') + 10 * this.perk('patience');
  }
  get undoWindow() {
    return this.upg('steady') ? 4 : BAL.undoWindow;
  }
  get undoRefund() {
    return this.upg('steady') ? 1 : BAL.undoRefund;
  }

  toJSON() {
    const { meta, ...rest } = this;
    return structuredClone(rest);
  }
}
