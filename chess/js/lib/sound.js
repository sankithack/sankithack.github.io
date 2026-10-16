// Optional move sounds, synthesised with Web Audio (no files). Off until the learner turns them on.
const KEY = 'chess-academy-sound';
let ctx = null;
let enabled = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  document.dispatchEvent(new Event('soundchange'));
  if (on) play('move');
}

function audio() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// a short wooden "tock": filtered noise burst + a soft low tone
function tock(c, t, { freq = 220, gain = 0.5, decay = 0.07, cutoff = 1800 } = {}) {
  const len = Math.floor(c.sampleRate * decay);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination); src.start(t);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + decay);
  og.gain.setValueAtTime(gain * 0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + decay * 1.4);
  o.connect(og).connect(c.destination); o.start(t); o.stop(t + decay * 1.5);
}
function tone(c, t, freq, dur, gain = 0.12, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

/** kind: move | capture | check | success | error */
export function play(kind) {
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.005;
  switch (kind) {
    case 'move': tock(c, t); break;
    case 'capture': tock(c, t, { freq: 160, gain: 0.7, decay: 0.09, cutoff: 1200 }); tock(c, t + 0.045, { freq: 260, gain: 0.35, decay: 0.05 }); break;
    case 'check': tock(c, t); tone(c, t + 0.03, 880, 0.12, 0.08, 'triangle'); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.07, f, 0.22, 0.1, 'triangle')); break;
    case 'error': tone(c, t, 196, 0.16, 0.12, 'square'); tone(c, t + 0.09, 147, 0.2, 0.1, 'square'); break;
  }
}
