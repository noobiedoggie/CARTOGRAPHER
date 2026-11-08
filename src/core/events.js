/** Minimal event emitter used to decouple game logic from audio / haptics / UI. */
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.map.get(type)?.delete(fn);
  }
  emit(type, data) {
    const set = this.map.get(type);
    if (set) for (const fn of set) fn(data);
    const any = this.map.get('*');
    if (any) for (const fn of any) fn(type, data);
  }
  clear() {
    this.map.clear();
  }
}
