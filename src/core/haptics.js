/**
 * Haptic feedback through the Capacitor Haptics plugin (falls back to the
 * Vibration API on the web). Every call is fire-and-forget and never throws.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const safe = (p) => {
  try {
    p?.catch?.(() => {});
  } catch {
    /* ignore */
  }
};

export class HapticsFX {
  constructor() {
    this.enabled = true;
    this.lastTick = 0;
    this.selecting = false;
  }
  setEnabled(on) {
    this.enabled = on;
  }
  light() {
    if (this.enabled) safe(Haptics.impact({ style: ImpactStyle.Light }));
  }
  medium() {
    if (this.enabled) safe(Haptics.impact({ style: ImpactStyle.Medium }));
  }
  /** Taking damage: a heavy thump. */
  hit() {
    if (!this.enabled) return;
    safe(Haptics.impact({ style: ImpactStyle.Heavy }));
    safe(Haptics.vibrate({ duration: 120 }));
  }
  death() {
    if (this.enabled) safe(Haptics.notification({ type: NotificationType.Error }));
  }
  /** Drawing: a selection "tick" for every new tile (throttled). */
  drawStart() {
    if (!this.enabled) return;
    this.selecting = true;
    safe(Haptics.selectionStart());
    safe(Haptics.impact({ style: ImpactStyle.Light }));
  }
  drawTick() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastTick < 35) return;
    this.lastTick = now;
    safe(Haptics.selectionChanged());
  }
  drawEnd() {
    if (!this.enabled || !this.selecting) return;
    this.selecting = false;
    safe(Haptics.selectionEnd());
  }
}
