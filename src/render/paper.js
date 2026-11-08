/**
 * Procedural parchment. Everything is generated at startup - no image assets.
 *
 *  - makePaper():  tileable cream paper with low-frequency mottling, fine
 *                  grain, fibres and faint stains.
 *  - makeGrain():  small neutral grain tile used as a multiply overlay so the
 *                  fog and sprites look printed on the same sheet.
 */
import { mulberry32 } from '../core/rng.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable value noise sampler with `cells` lattice cells across `size` px. */
function periodicNoise(rand, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (u, v) => {
    // u,v in [0,1)
    const fx = u * cells;
    const fy = v * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const xa = x0 % cells;
    const xb = (x0 + 1) % cells;
    const ya = (y0 % cells) * cells;
    const yb = ((y0 + 1) % cells) * cells;
    const a = g[ya + xa];
    const b = g[ya + xb];
    const c = g[yb + xa];
    const d = g[yb + xb];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * @param {number} size texture size (px, square, tileable)
 * @param {{r:number,g:number,b:number}} base base colour
 * @param {number} seed
 */
export function makePaper(size = 512, base = { r: 238, g: 225, b: 193 }, seed = 1337) {
  const rand = mulberry32(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const octaves = [periodicNoise(rand, 4), periodicNoise(rand, 9), periodicNoise(rand, 23), periodicNoise(rand, 61)];
  const weights = [0.45, 0.28, 0.17, 0.1];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let n = 0;
      for (let o = 0; o < 4; o++) n += octaves[o](u, v) * weights[o];
      const grain = (rand() - 0.5) * 9;
      const shade = (n - 0.5) * 26 + grain;
      const p = (y * size + x) * 4;
      d[p] = base.r + shade;
      d[p + 1] = base.g + shade * 0.95;
      d[p + 2] = base.b + shade * 0.8;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Fibres: short curved strokes, drawn with wrap-around so the tile stays seamless.
  const wrapDraw = (fn) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy);
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    const len = 6 + rand() * 22;
    const bend = (rand() - 0.5) * 10;
    const dark = rand() < 0.55;
    ctx.strokeStyle = dark ? `rgba(120,90,50,${0.05 + rand() * 0.06})` : `rgba(255,250,235,${0.1 + rand() * 0.12})`;
    ctx.lineWidth = 0.6 + rand() * 0.8;
    wrapDraw((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(
        x + ox + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y + oy + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x + ox + Math.cos(a) * len,
        y + oy + Math.sin(a) * len,
      );
      ctx.stroke();
    });
  }
  // Faint stains.
  for (let i = 0; i < 5; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 90;
    wrapDraw((ox, oy) => {
      const g = ctx.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(150,110,60,0.0)');
      g.addColorStop(0.75, `rgba(150,110,60,${0.04 + rand() * 0.04})`);
      g.addColorStop(1, 'rgba(150,110,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  return c;
}

/** Neutral grain tile (light greys) for 'multiply' overlays. */
export function makeGrain(size = 192, seed = 99) {
  const rand = mulberry32(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(rand() * rand() * 46);
    d[i * 4] = v;
    d[i * 4 + 1] = v - 2;
    d[i * 4 + 2] = v - 6;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paper as a CSS url() for DOM menus (generated once). */
let cssPaper = null;
export function paperCSS() {
  if (!cssPaper) {
    const c = makePaper(384, { r: 236, g: 222, b: 188 }, 4242);
    cssPaper = `url(${c.toDataURL('image/png')})`;
  }
  return cssPaper;
}
