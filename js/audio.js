'use strict';

const AUDIO = (() => {
  let ctx = null;
  let enabled = true;

  function ctx_() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Generic tone with envelope
  function tone(freq, dur, type = 'square', vol = 0.08, attack = 0.005, decay = 0.5) {
    if (!enabled) return;
    try {
      const c = ctx_();
      const osc = c.createOscillator();
      const gain = c.createGain();
      // Low-pass for retro muffled feel
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      osc.connect(filter); filter.connect(gain); gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + dur + 0.01);
    } catch (_) {}
  }

  function chord(notes, dur, type = 'square', vol = 0.06, delay = 0) {
    notes.forEach((f, i) => setTimeout(() => tone(f, dur, type, vol), delay + i * 70));
  }

  // ── Named sounds ────────────────────────────────────────────────────────────
  function move()   { tone(180, 0.04, 'square', 0.04); }

  function attack() {
    tone(120, 0.06, 'sawtooth', 0.14);
    setTimeout(() => tone(90, 0.10, 'sawtooth', 0.09), 40);
  }

  function hit() {
    tone(160, 0.05, 'sawtooth', 0.16);
    setTimeout(() => tone(100, 0.12, 'sawtooth', 0.10), 30);
  }

  function miss() { tone(300, 0.07, 'triangle', 0.06); }

  function pickup() {
    tone(523, 0.07, 'sine', 0.09);
    setTimeout(() => tone(659, 0.07, 'sine', 0.08), 75);
  }

  function equip() {
    tone(330, 0.05, 'square', 0.07);
    setTimeout(() => tone(440, 0.08, 'square', 0.07), 55);
  }

  function death() {
    [220, 185, 155, 120, 90].forEach((f, i) =>
      setTimeout(() => tone(f, 0.28, 'sawtooth', 0.14 - i * 0.02), i * 160));
  }

  function levelup() {
    chord([262, 330, 392, 523, 659], 0.18, 'square', 0.09, 0);
  }

  function flee() {
    tone(350, 0.04, 'triangle', 0.07);
    setTimeout(() => tone(280, 0.04, 'triangle', 0.07), 60);
    setTimeout(() => tone(220, 0.08, 'triangle', 0.06), 120);
  }

  function craft() {
    tone(280, 0.04, 'square', 0.07);
    setTimeout(() => tone(350, 0.04, 'square', 0.07), 50);
    setTimeout(() => tone(420, 0.08, 'square', 0.08), 100);
  }

  function trade() {
    tone(523, 0.07, 'sine', 0.07);
    setTimeout(() => tone(659, 0.07, 'sine', 0.08), 80);
    setTimeout(() => tone(784, 0.10, 'sine', 0.07), 160);
  }

  function save_() {
    tone(440, 0.06, 'sine', 0.07);
    setTimeout(() => tone(554, 0.10, 'sine', 0.07), 80);
  }

  function load_() {
    tone(554, 0.06, 'sine', 0.07);
    setTimeout(() => tone(440, 0.10, 'sine', 0.07), 80);
  }

  function error_() { tone(150, 0.15, 'sawtooth', 0.12); }

  function radiation() {
    // Subtle Geiger-click burst
    if (!enabled) return;
    try {
      const c = ctx_();
      const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(0.4, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
      src.connect(g); g.connect(c.destination);
      src.start(); src.stop(c.currentTime + 0.06);
    } catch (_) {}
  }

  function toggle() { enabled = !enabled; return enabled; }
  function isEnabled() { return enabled; }

  return {
    move, attack, hit, miss, pickup, equip,
    death, levelup, flee, craft, trade,
    save: save_, load: load_, error: error_, radiation,
    toggle, isEnabled,
  };
})();
