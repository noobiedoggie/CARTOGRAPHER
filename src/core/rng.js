/**
 * Deterministic random numbers. Every floor is generated from a seed so a
 * saved run can be regenerated exactly.
 */

/** mulberry32: tiny, fast, good-enough 32-bit PRNG. Returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  /** Float in [a, b). */
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  /** Integer in [a, b] (inclusive). */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

/** Stable hash of integer coordinates -> [0,1). Used for per-tile art variation. */
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Combine seeds (e.g. run seed + floor number) into a new 32-bit seed. */
export function mixSeed(a, b) {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(b + 0x632be5ab, 0xc2b2ae35)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return h >>> 0;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
