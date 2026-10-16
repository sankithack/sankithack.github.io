// Small shared helpers: DOM, randomness, dates, timers.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/* ---------- Randomness ---------- */
export const randInt = (n) => Math.floor(Math.random() * n);
export const randRange = (min, max) => min + randInt(max - min + 1);
export const pick = (arr) => arr[randInt(arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);

// Deterministic PRNG so a seed always draws the same face.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Formatting ---------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
export const norm = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
export const pct = (x) => `${Math.round(x * 100)}%`;
export function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
export function fmtDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
}

/* ---------- Dates (local calendar days as YYYY-MM-DD) ---------- */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}
export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---------- UI ---------- */
let toastTimer;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Countdown timer. Calls onTick(remainingSec, elapsedSec) a few times a second
 * and onDone() when it reaches zero. seconds <= 0 means "no limit" (counts up).
 */
export function countdown(seconds, { onTick, onDone } = {}) {
  const start = performance.now();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const elapsed = (performance.now() - start) / 1000;
    const remaining = seconds > 0 ? seconds - elapsed : Infinity;
    onTick?.(remaining, elapsed);
    if (seconds > 0 && remaining <= 0) {
      stop();
      onDone?.();
    }
  };
  const id = setInterval(tick, 200);
  tick();
  function stop() {
    stopped = true;
    clearInterval(id);
  }
  return { stop, elapsed: () => (performance.now() - start) / 1000 };
}

export function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
