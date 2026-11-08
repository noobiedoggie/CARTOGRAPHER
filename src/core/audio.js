/**
 * Procedural sound with the Web Audio API - no audio files.
 *
 *  - pen scratch while drawing (looped band-passed noise, bumped per tile)
 *  - page flip between floors (filtered noise sweeps)
 *  - low drone that swells before and during rewrite waves
 *  - a handful of small effects (hits, pickups, alerts, erasing...)
 *
 * The AudioContext is created lazily on the first user gesture (mobile
 * autoplay rules) and suspended while the app is in the background.
 */
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.scratch = null;
    this.drone = null;
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { capture: true });
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return false;
      }
      const ctx = this.ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.75 : 0;
      this.master.connect(this.comp).connect(ctx.destination);
      // 2 seconds of white noise, reused by every noisy effect.
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05);
    if (!on) {
      this.scratchStop();
      this.droneStop();
    }
  }
  suspend() {
    this.droneStop();
    this.scratchStop();
    this.ctx?.suspend?.().catch(() => {});
  }
  resume() {
    this.ctx?.resume?.().catch(() => {});
  }

  get ok() {
    return this.enabled && this.ensure();
  }

  // ---------------------------------------------------------------- blocks
  /** One-shot filtered noise burst. */
  _noise(dur, o = {}) {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** One-shot oscillator note. */
  _tone(freq, dur, o = {}) {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      node = node.connect(f);
    }
    node.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // -------------------------------------------------------------- drawing
  scratchStart() {
    if (!this.ok || this.scratch) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3600;
    bp.Q.value = 1.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(bp).connect(hp).connect(g).connect(this.master);
    src.start();
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.02);
    this.scratch = { src, bp, g };
  }
  /** Each new tile makes the nib bite the paper a little harder. */
  scratchTick() {
    const s = this.scratch;
    if (!s || !this.ctx) return;
    const t = this.ctx.currentTime;
    s.bp.frequency.setTargetAtTime(2600 + Math.random() * 2600, t, 0.01);
    s.g.gain.cancelScheduledValues(t);
    s.g.gain.setTargetAtTime(0.22, t, 0.004);
    s.g.gain.setTargetAtTime(0.05, t + 0.04, 0.03);
  }
  scratchStop() {
    const s = this.scratch;
    if (!s) return;
    this.scratch = null;
    const t = this.ctx.currentTime;
    s.g.gain.cancelScheduledValues(t);
    s.g.gain.setTargetAtTime(0.0001, t, 0.03);
    s.src.stop(t + 0.2);
  }
  inkSet(type) {
    const f = [0, 180, 260, 140, 520][type] || 180;
    this._tone(f, 0.18, { type: 'sine', gain: 0.18, freqEnd: f * 0.6 });
    this._noise(0.12, { type: 'lowpass', freq: 900, gain: 0.12 });
  }
  undo() {
    this._noise(0.22, { type: 'bandpass', freq: 600, freqEnd: 3500, q: 2, gain: 0.25, attack: 0.15 });
  }
  deny() {
    this._tone(160, 0.09, { type: 'square', gain: 0.07, lowpass: 900 });
    this._tone(120, 0.12, { type: 'square', gain: 0.07, lowpass: 900, delay: 0.1 });
  }

  // ---------------------------------------------------------------- world
  pageFlip() {
    this._noise(0.28, { type: 'bandpass', freq: 700, freqEnd: 3200, q: 0.8, gain: 0.35, attack: 0.06 });
    this._noise(0.22, { type: 'highpass', freq: 2500, gain: 0.12, delay: 0.2 });
    this._tone(90, 0.15, { gain: 0.15, freqEnd: 50, delay: 0.38 });
  }
  droneStart() {
    if (!this.ok || this.drone) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 2.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);
    const oscs = [55, 55.6, 82.4, 41.2].map((f, k) => {
      const o = ctx.createOscillator();
      o.type = k === 3 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      return o;
    });
    lfo.start(t);
    lp.connect(g).connect(this.master);
    this.drone = { g, oscs, lfo };
  }
  droneStop() {
    const d = this.drone;
    if (!d) return;
    this.drone = null;
    const t = this.ctx.currentTime;
    d.g.gain.cancelScheduledValues(t);
    d.g.gain.setTargetAtTime(0.0001, t, 0.5);
    for (const o of d.oscs) o.stop(t + 2.5);
    d.lfo.stop(t + 2.5);
  }
  rewrite() {
    this._noise(2.4, { type: 'lowpass', freq: 200, freqEnd: 1800, q: 3, gain: 0.3, attack: 0.9 });
    this._tone(48, 2.2, { type: 'triangle', gain: 0.25, freqEnd: 36, attack: 0.4 });
  }
  step() {
    this._noise(0.05, { type: 'lowpass', freq: 500, gain: 0.08 });
  }
  pool() {
    [380, 520, 760].forEach((f, k) => this._tone(f, 0.12, { gain: 0.12, freqEnd: f * 1.4, delay: k * 0.07 }));
  }
  chest() {
    [523, 659, 784, 1046].forEach((f, k) => this._tone(f, 0.35, { type: 'triangle', gain: 0.13, delay: k * 0.08 }));
    this._noise(0.1, { type: 'lowpass', freq: 600, gain: 0.15 });
  }
  chime() {
    this._tone(880, 0.6, { type: 'sine', gain: 0.12 });
    this._tone(1320, 0.8, { type: 'sine', gain: 0.08, delay: 0.09 });
  }
  hiss() {
    this._noise(0.5, { type: 'highpass', freq: 3000, gain: 0.15, attack: 0.05 });
  }

  // -------------------------------------------------------------- danger
  hit() {
    this._tone(110, 0.3, { type: 'sine', gain: 0.45, freqEnd: 40 });
    this._noise(0.2, { type: 'lowpass', freq: 1200, gain: 0.3 });
  }
  alert() {
    this._tone(240, 0.22, { type: 'square', gain: 0.07, freqEnd: 110, lowpass: 700 });
  }
  erase() {
    for (let k = 0; k < 3; k++) this._noise(0.07, { type: 'bandpass', freq: 900 + Math.random() * 600, q: 3, gain: 0.18, delay: k * 0.06 });
  }
  scribble() {
    for (let k = 0; k < 6; k++) this._noise(0.05, { type: 'bandpass', freq: 3000 + Math.random() * 2000, q: 2, gain: 0.12, delay: k * 0.045 });
  }
  blot() {
    this._noise(0.1, { type: 'lowpass', freq: 700, gain: 0.18 });
  }
  trapped() {
    this._tone(620, 0.6, { type: 'sine', gain: 0.15, freqEnd: 70 });
  }
  roar() {
    this._tone(65, 1.2, { type: 'sawtooth', gain: 0.25, freqEnd: 40, lowpass: 400, attack: 0.1 });
    this._noise(1.0, { type: 'lowpass', freq: 400, gain: 0.25, attack: 0.2 });
  }
  anchor() {
    [392, 523, 784].forEach((f, k) => this._tone(f, 1.0, { type: 'sine', gain: 0.12, delay: k * 0.05 }));
  }
  death() {
    [330, 262, 196, 131].forEach((f, k) => this._tone(f, 0.45, { type: 'triangle', gain: 0.14, delay: k * 0.2 }));
  }
  exit() {
    [262, 330, 392, 523].forEach((f, k) => this._tone(f, 0.3, { type: 'triangle', gain: 0.12, delay: k * 0.07 }));
  }
  victory() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, k) => this._tone(f, 0.5, { type: 'triangle', gain: 0.13, delay: k * 0.14 }));
  }
  gameOver() {
    this._tone(196, 1.2, { type: 'sine', gain: 0.12, freqEnd: 98 });
  }
  click() {
    this._noise(0.03, { type: 'bandpass', freq: 2200, q: 2, gain: 0.12 });
  }
}
