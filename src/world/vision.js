/**
 * Field of view: tiles within the vision radius with a clear line of sight
 * (rock blocks sight) become visible; anything ever visible becomes explored
 * and stays on the map as a faded sketch.
 */

/** Bresenham line of sight between tile centres. Intermediate opaque tiles block. */
export function lineOfSight(world, x0, y0, x1, y1, blocks = (i) => world.isOpaque(i)) {
  const w = world.w;
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && blocks(y * w + x)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Recompute the visible set around (px,py).
 * @param {number[]} [newly] receives indices of tiles explored for the first time
 */
export function computeVision(world, px, py, radius, newly) {
  const { w, h, visible, explored } = world;
  visible.fill(0);
  const r = Math.ceil(radius);
  const r2 = radius * radius + radius * 0.6; // slightly rounder disc
  for (let dy = -r; dy <= r; dy++) {
    const y = py + dy;
    if (y < 0 || y >= h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = px + dx;
      if (x < 0 || x >= w) continue;
      if (dx * dx + dy * dy > r2) continue;
      if (!lineOfSight(world, px, py, x, y)) continue;
      const i = y * w + x;
      visible[i] = 1;
      if (!explored[i]) {
        explored[i] = 1;
        if (newly) newly.push(i);
      }
    }
  }
}

/** Reveal a disc with no line-of-sight test (gold ink, map fragments). */
export function revealDisc(world, cx, cy, radius, newly) {
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > radius * radius + 0.5) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!world.inside(x, y)) continue;
      const i = world.idx(x, y);
      if (!world.explored[i]) {
        world.explored[i] = 1;
        if (newly) newly.push(i);
      }
    }
  }
}
