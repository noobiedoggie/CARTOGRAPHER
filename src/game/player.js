/**
 * The explorer. Positions are in tile units; a tile's centre is (x+0.5, y+0.5).
 */
export class Player {
  constructor(tx, ty) {
    this.x = tx + 0.5;
    this.y = ty + 0.5;
    this.path = []; // tile indices still to visit
    this.dest = -1; // tile index the player tapped
    this.moving = false;
    this.dirX = 0;
    this.dirY = -1;
    this.walkPhase = 0;
    this.invuln = 0;
    this.stillTime = 0;
    this.hurtFlash = 0;
    this.lastTile = -1;
  }
  get tx() {
    return Math.floor(this.x);
  }
  get ty() {
    return Math.floor(this.y);
  }
}
