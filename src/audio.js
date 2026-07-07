import * as THREE from 'three';

// All ship sound is synthesized with WebAudio — no assets.
// One-shots (doors, beeps) use simple distance attenuation from the listener;
// the reactor hum is a true THREE.PositionalAudio so it pans/falls off in 3D.
export class ShipAudio {
  constructor(listener) {
    this.listener = listener;
    this.ctx = listener.context;
    this.started = false;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this._tmp = new THREE.Vector3();
    this._beepSpots = [];
    this._noise = null;
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    this._noise = buf;
    return buf;
  }

  _distGain(pos, max = 20) {
    this.listener.getWorldPosition(this._tmp);
    const d = this._tmp.distanceTo(pos);
    return Math.max(0, 1 - d / max) ** 1.7;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const c = this.ctx;

    // low rumble bed
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    // slow LFO breathing on the rumble filter
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoAmp = c.createGain();
    lfoAmp.gain.value = 55;
    lfo.connect(lfoAmp).connect(lp.frequency);
    lfo.start();
    // faint beating drone
    for (const [f, amp] of [[48, 0.02], [96.4, 0.007]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(this.master);
      o.start();
    }
    this._scheduleBeeps();
  }

  // continuous positional reactor throb, mounted on the reactor group
  attachHum(obj) {
    const pa = new THREE.PositionalAudio(this.listener);
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.55;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    lp.connect(out);
    for (const [type, f, amp] of [['sawtooth', 38, 0.5], ['sine', 76.4, 0.35], ['triangle', 57, 0.2]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start();
    }
    pa.setNodeSource(out);
    pa.setRefDistance(2.6);
    pa.setRolloffFactor(1.8);
    pa.position.y = 1.5;
    obj.add(pa);
  }

  door(pos, opening) {
    if (!this.started) return;
    const amp = this._distGain(pos, 18) * 0.5;
    if (amp < 0.015) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.playbackRate.value = 1.6;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(opening ? 320 : 1600, t);
    bp.frequency.exponentialRampToValueAtTime(opening ? 1700 : 260, t + 0.32);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.45);
    // servo chirp
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(opening ? 140 : 220, t);
    o.frequency.linearRampToValueAtTime(opening ? 230 : 120, t + 0.3);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(amp * 0.25, t + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  footstep() {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.playbackRate.value = 2.5 + Math.random();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 550 + Math.random() * 350;
    const g = c.createGain();
    const amp = 0.055 + Math.random() * 0.02;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.12);
    // heel thump
    const o = c.createOscillator();
    o.frequency.setValueAtTime(72 + Math.random() * 18, t);
    const og = c.createGain();
    og.gain.setValueAtTime(amp * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.09);
  }

  // short UI blip for buttons/switches
  click(pos) {
    this._tone(pos, 1150 + Math.random() * 150, 0.05, 0.14, 'square');
  }

  ding(pos) {
    this._tone(pos, 1046, 0.12, 0.14, 'sine');
    setTimeout(() => this._tone(pos, 1568, 0.16, 0.12, 'sine'), 120);
  }

  _tone(pos, freq, dur, vol, type = 'sine') {
    if (!this.started) return;
    const amp = (pos ? this._distGain(pos, 16) : 1) * vol;
    if (amp < 0.008) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  lever(pos) {
    if (!this.started) return;
    const amp = this._distGain(pos, 14) * 0.4;
    if (amp < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.playbackRate.value = 1.8;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.12);
    this._tone(pos, 130, 0.09, 0.5, 'triangle');
  }

  hiss(pos, dur = 1.4, vol = 0.3) {
    if (!this.started) return;
    const amp = this._distGain(pos, 15) * vol;
    if (amp < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    src.playbackRate.value = 3;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.08);
    g.gain.setValueAtTime(amp, t + dur - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  }

  kick(pos) {
    if (!this.started) return;
    const amp = this._distGain(pos, 16) * 0.5;
    if (amp < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  bounce(pos, energy = 1) {
    this._tone(pos, 90 + Math.random() * 30, 0.08, Math.min(0.3, 0.12 * energy), 'sine');
  }

  scrape(pos) {
    if (!this.started) return;
    const amp = this._distGain(pos, 12) * 0.16;
    if (amp < 0.01) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.playbackRate.value = 0.8;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.4);
  }

  klaxon() {
    if (!this.started) return;
    const c = this.ctx, t0 = c.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * 0.75;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(392, t);
      o.frequency.linearRampToValueAtTime(523, t + 0.36);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.05);
      g.gain.setValueAtTime(0.11, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.75);
    }
  }

  registerBeeps(pos) {
    this._beepSpots.push(pos);
  }

  _scheduleBeeps() {
    const loop = () => {
      if (this._beepSpots.length) {
        const pos = this._beepSpots[Math.floor(Math.random() * this._beepSpots.length)];
        const amp = this._distGain(pos, 14) * 0.16;
        if (amp > 0.01) {
          const c = this.ctx, t = c.currentTime;
          const f = [660, 880, 990, 1320][Math.floor(Math.random() * 4)];
          for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
            const o = c.createOscillator();
            o.type = 'sine';
            o.frequency.value = f;
            const g = c.createGain();
            const t0 = t + i * 0.14;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(amp, t0 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
            o.connect(g).connect(this.master);
            o.start(t0);
            o.stop(t0 + 0.12);
          }
        }
      }
      this._beepTimer = setTimeout(loop, 3500 + Math.random() * 5500);
    };
    loop();
  }
}
