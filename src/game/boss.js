/**
 * Boss floor: "The Devourer". The stairs are sealed until the explorer
 * touches the three anchors scattered across the map, while a giant eraser
 * chases them, eating the world into chasm. Each anchor stuns the Devourer
 * but makes it angrier (faster).
 */
import { BAL } from '../config.js';
import { T } from '../world/tiles.js';
import { Devourer } from './enemies.js';

export class BossFloorSystem {
  constructor(game) {
    this.total = game.gen.anchors.length;
    this.lit = 0;
    game.exitLocked = true;
    const w = game.world;
    const x = Math.max(2, Math.min(w.w - 3, w.start.x));
    const y = w.h - 2;
    this.boss = new Devourer(x, y, w.w);
    game.enemies.push(this.boss);
    game.boss = this.boss;
    game.events.emit('toast', { text: 'The Devourer stirs below... light the 3 anchors!', kind: 'danger' });
  }

  update() {}

  onEnterTile(game, i) {
    const w = game.world;
    if (w.terrain[i] !== T.ANCHOR) return;
    w.setTerrain(i, T.ANCHOR_LIT);
    this.lit++;
    this.boss.stun = 3;
    this.boss.speedBoost = this.lit * BAL.bossSpeedPerAnchor;
    game.events.emit('anchor', { lit: this.lit, total: this.total, x: w.xOf(i), y: w.yOf(i) });
    if (this.lit >= this.total) {
      game.exitLocked = false;
      game.events.emit('toast', { text: 'The stairs are unsealed - run!', kind: 'gold' });
    }
  }

  canExit(game) {
    if (!game.exitLocked) return true;
    game.events.emit('toast', { text: `Sealed! Anchors lit: ${this.lit}/${this.total}`, kind: 'warn' });
    return false;
  }

  objective() {
    return this.lit >= this.total ? 'Reach the stairs!' : `Anchors lit: ${this.lit} / ${this.total}`;
  }
}
