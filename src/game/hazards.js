/**
 * Environmental hazards:
 *  - Fire spreads over dry ground and burns black ink (a burning bridge
 *    collapses!). Blue ink puts it out. It hurts the explorer; enemies avoid it.
 *  - Enemy scribble-walls fade after a while.
 */
import { BAL } from '../config.js';
import { INK, isFlammable } from '../world/tiles.js';

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

export class HazardSystem {
  constructor() {
    this.tick = 0;
    this.burning = 0;
  }

  static flammable(w, i) {
    const k = w.ink[i];
    if (k === INK.BLACK) return true;
    if (k !== INK.NONE) return false;
    return isFlammable(w.terrain[i]);
  }

  ignite(game, i) {
    const w = game.world;
    if (w.fire[i] > 0 || w.ash[i] > 0 || !HazardSystem.flammable(w, i)) return false;
    w.fire[i] = BAL.fireLife * (0.8 + game.rng.next() * 0.4);
    w.version++;
    return true;
  }

  update(game, dt) {
    const w = game.world;
    const { fire, ash, scrib, n } = w;
    let burning = 0;
    let collapsed = false;
    for (let i = 0; i < n; i++) {
      if (ash[i] > 0) ash[i] = Math.max(0, ash[i] - dt);
      if (scrib[i] > 0) {
        scrib[i] -= dt;
        if (scrib[i] <= 0) {
          scrib[i] = 0;
          w.version++;
        }
      }
      if (fire[i] > 0) {
        burning++;
        fire[i] -= dt;
        // Water ink drawn on top (or ground turned to chasm) puts it out.
        if (!HazardSystem.flammable(w, i)) fire[i] = 0;
        if (fire[i] <= 0) {
          fire[i] = 0;
          ash[i] = 20;
          w.version++;
          if (w.ink[i] === INK.BLACK) {
            w.setInk(i, INK.NONE);
            collapsed = true;
            game.events.emit('burnt', { i });
          }
        }
      }
    }
    this.burning = burning;
    if (collapsed) game.afterTerrainChange();

    // Spread
    this.tick -= dt;
    if (this.tick <= 0 && burning > 0) {
      this.tick = BAL.fireTick;
      const lit = [];
      for (let i = 0; i < n; i++) if (fire[i] > 0) lit.push(i);
      for (const i of lit) {
        const x = i % w.w;
        const y = (i / w.w) | 0;
        for (let k = 0; k < 4; k++) {
          if (burning >= BAL.fireCap) break;
          const nx = x + DX4[k];
          const ny = y + DY4[k];
          if (!w.inside(nx, ny)) continue;
          if (game.rng.next() < BAL.fireSpreadChance && this.ignite(game, ny * w.w + nx)) burning++;
        }
      }
    }

    // Standing in fire hurts.
    if (fire[game.playerTile] > 0) game.damage('fire');
  }
}
