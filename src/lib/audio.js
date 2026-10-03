// Original synthesized SFX (WebAudio). No audio files, no licensing. Mute is persisted.
let ctx = null, crowd = null, muted = localStorage.getItem('apex_muted') === '1';
const listeners = new Set();

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noiseBuffer(c, secs = 2) {
  const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.5; }
  return b;
}
export const sfx = {
  isMuted: () => muted,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setMuted(m) {
    muted = m; localStorage.setItem('apex_muted', m ? '1' : '0');
    if (crowd && ctx) crowd.gain.gain.setTargetAtTime(m ? 0 : crowd.base, ctx.currentTime, 0.1);
    listeners.forEach((f) => f(m));
  },
  unlock() { ac(); },
  startCrowd() {
    const c = ac(); if (!c || crowd) return;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 3); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = muted ? 0 : 0.05;
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start();
    crowd = { gain: g, base: 0.05, src };
  },
  stopCrowd() { if (crowd && ctx) { crowd.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); const s = crowd.src; setTimeout(() => { try { s.stop(); } catch { /* noop */ } }, 800); crowd = null; } },
  swell(level = 0.16, secs = 2.2) {
    const c = ac(); if (!c || !crowd || muted) return;
    const t = c.currentTime;
    crowd.gain.gain.cancelScheduledValues(t);
    crowd.gain.gain.setTargetAtTime(level, t, 0.15);
    crowd.gain.gain.setTargetAtTime(crowd.base, t + secs, 0.6);
  },
  whistle(long = false) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime, dur = long ? 0.9 : 0.35;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = 2900; o2.frequency.value = 3080;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 38; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); o2.connect(g); g.connect(c.destination); [o, o2, lfo].forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
  },
  goal() { this.swell(0.28, 4); this.whistle(false); },
};
