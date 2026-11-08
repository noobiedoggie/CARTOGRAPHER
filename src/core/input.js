/**
 * One-handed touch controls, built on Pointer Events (works for touch & mouse):
 *
 *   tap                       -> onTap(x, y)            (walk there)
 *   press, hold, then drag    -> onDrawStart/Move/End   (ink stroke)
 *   quick swipe (no hold)     -> onPan(dx, dy)          (look around)
 *   two-finger pinch          -> onPinch(factor, mx, my) (+ two-finger pan)
 *   mouse wheel               -> onPinch                 (desktop testing)
 *
 * All coordinates are CSS pixels relative to the element.
 */
import { BAL } from '../config.js';

export class Input {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.pointers = new Map();
    this.state = 'idle'; // idle | pending | pan | draw | pinch | locked
    this.start = null;
    this.holdTimer = 0;
    this.last = { x: 0, y: 0 };
    this.pinch = null;
    this.enabled = true;

    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => this._down(e), opts);
    el.addEventListener('pointermove', (e) => this._move(e), opts);
    el.addEventListener('pointerup', (e) => this._up(e, false), opts);
    el.addEventListener('pointercancel', (e) => this._up(e, true), opts);
    el.addEventListener('lostpointercapture', (e) => this._up(e, true), opts);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        const p = this._pos(e);
        this.h.onPinch?.(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      opts,
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pos(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** True while the finger is down and drawing (used for edge-scrolling). */
  get drawing() {
    return this.state === 'draw';
  }

  cancel() {
    clearTimeout(this.holdTimer);
    if (this.state === 'draw') this.h.onDrawCancel?.();
    this.state = this.pointers.size ? 'locked' : 'idle';
  }

  _down(e) {
    e.preventDefault();
    if (!this.enabled) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.state = 'pending';
      this.start = { x: p.x, y: p.y, t: performance.now() };
      this.last = { ...p };
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.state === 'pending') {
          this.state = 'draw';
          this.h.onDrawStart?.(this.last.x, this.last.y);
        }
      }, BAL.holdToDrawMs);
    } else if (this.pointers.size === 2) {
      clearTimeout(this.holdTimer);
      if (this.state === 'draw') this.h.onDrawCancel?.();
      this.state = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    switch (this.state) {
      case 'pending': {
        const moved = Math.hypot(p.x - this.start.x, p.y - this.start.y);
        if (moved > BAL.dragThresholdPx) {
          // Moved before the hold timer fired: this is a quick swipe -> pan.
          clearTimeout(this.holdTimer);
          this.state = 'pan';
          this.h.onPan?.(p.x - this.last.x, p.y - this.last.y);
        }
        break;
      }
      case 'pan':
        this.h.onPan?.(p.x - this.last.x, p.y - this.last.y);
        break;
      case 'draw':
        this.h.onDrawMove?.(p.x, p.y);
        break;
      case 'pinch': {
        if (this.pointers.size < 2) break;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.h.onPan?.(mx - this.pinch.mx, my - this.pinch.my);
        this.h.onPinch?.(dist / this.pinch.dist, mx, my);
        this.pinch = { dist, mx, my };
        break;
      }
      default:
        break;
    }
    this.last = { ...p };
  }

  _up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const p = this._pos(e);
    switch (this.state) {
      case 'pending': {
        clearTimeout(this.holdTimer);
        const dt = performance.now() - this.start.t;
        const moved = Math.hypot(p.x - this.start.x, p.y - this.start.y);
        if (!cancelled && dt < BAL.tapMaxMs + BAL.holdToDrawMs && moved <= BAL.dragThresholdPx) this.h.onTap?.(this.start.x, this.start.y);
        break;
      }
      case 'draw':
        if (cancelled) this.h.onDrawCancel?.();
        else this.h.onDrawEnd?.(p.x, p.y);
        break;
      default:
        break;
    }
    // After a pinch, ignore the remaining finger until everything is lifted.
    this.state = this.pointers.size > 0 ? 'locked' : 'idle';
  }
}
