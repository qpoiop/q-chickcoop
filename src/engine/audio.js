import { ASSETS } from '../data/assets.js';

// Audio manager: looping BGM + lightweight synthesized SFX via WebAudio.
// Browsers block audio until a user gesture, so start() is called from the
// Deploy/Redeploy button. Music ducks/pauses cleanly across game states.

export class Audio {
  constructor() {
    this.ctx = null;
    this.music = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.started = false;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.ctx.destination);
  }

  // Kick off BGM on first user gesture.
  start() {
    if (this.started) { this.resume(); return; }
    this.started = true;
    this._ensureCtx();
    if (!this.ctx) return;
    const el = new window.Audio(ASSETS.bgm);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    this.music = el;
    try {
      const src = this.ctx.createMediaElementSource(el);
      src.connect(this.musicGain);
    } catch (e) { /* Safari: element already routed — play directly */ }
    el.volume = 0.34;
    el.play().catch(() => {});
    this.resume();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); if (this.music && this.music.paused) this.music.play().catch(() => {}); }

  setMusic(on) {
    this.enabled = on;
    if (this.music) this.music.volume = on ? 0.34 : 0;
  }

  // ---- SFX: short procedural blips (no extra asset downloads) ----
  _blip({ freq = 440, type = 'square', dur = 0.08, gain = 0.5, slide = 0 }) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur);
  }

  shoot(weaponKey) {
    const map = {
      flare:   { freq: 260, type: 'triangle', dur: 0.1, slide: -120, gain: 0.4 },
      pulse:   { freq: 620, type: 'square',   dur: 0.05, slide: -60,  gain: 0.22 },
      arc:     { freq: 500, type: 'sawtooth', dur: 0.09, slide: 120,  gain: 0.3 },
      scatter: { freq: 200, type: 'square',   dur: 0.12, slide: -80,  gain: 0.42 },
      lance:   { freq: 720, type: 'sawtooth', dur: 0.12, slide: 260,  gain: 0.3 },
    };
    this._blip(map[weaponKey] || map.pulse);
  }
  hit()    { this._blip({ freq: 180, type: 'square', dur: 0.05, gain: 0.25, slide: -60 }); }
  kill()   { this._blip({ freq: 420, type: 'triangle', dur: 0.14, gain: 0.35, slide: 180 }); }
  hurt()   { this._blip({ freq: 140, type: 'sawtooth', dur: 0.18, gain: 0.4, slide: -60 }); }
  pickup() { this._blip({ freq: 660, type: 'sine', dur: 0.12, gain: 0.35, slide: 240 }); }
  levelUp(){ this._blip({ freq: 520, type: 'triangle', dur: 0.22, gain: 0.4, slide: 320 }); }
  boss()   { this._blip({ freq: 90,  type: 'sawtooth', dur: 0.5, gain: 0.5, slide: 40 }); }
  ui()     { this._blip({ freq: 440, type: 'sine', dur: 0.05, gain: 0.2 }); }
}
