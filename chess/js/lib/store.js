// Data loading (JSON in /data) and progress tracking (localStorage).
const cache = {};
export async function loadData(name) {
  if (!cache[name]) cache[name] = fetch(`data/${name}.json`).then((r) => { if (!r.ok) throw new Error(`Couldn't load data/${name}.json (${r.status})`); return r.json(); });
  return cache[name];
}
export const loadAll = () => Promise.all([...['openings', 'tactics', 'strategy', 'endgames', 'games', 'attack'].map(loadData), loadData('popularity').catch(() => null)])
  .then(([openings, tactics, strategy, endgames, games, attack, popularity]) => ({ openings, tactics, strategy, endgames, games, attack, popularity }));

const KEY = 'chess-academy-progress-v1';
const blank = () => ({ seen: {}, solved: {}, cards: {}, best: {}, drills: {}, streak: { day: null, count: 0 } });
let state = read();
function read() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return blank(); }
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: progress lives for this visit only */ }
  listeners.forEach((fn) => fn(state));
}
const listeners = new Set();
export const onProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const progress = () => state;

function touchStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.streak.day === today) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = { day: today, count: state.streak.day === y ? state.streak.count + 1 : 1 };
}
export function markSeen(kind, id) { if (state.seen[`${kind}:${id}`]) return; state.seen[`${kind}:${id}`] = Date.now(); touchStreak(); write(); }
export const isSeen = (kind, id) => !!state.seen[`${kind}:${id}`];
export function markSolved(id) { state.solved[id] = Date.now(); touchStreak(); write(); }
export const isSolved = (id) => !!state.solved[id];
export function rateCard(id, known) { state.cards[id] = known ? 'known' : 'again'; touchStreak(); write(); }
export const cardState = (id) => state.cards[id];
export function saveBest(key, score) {
  const prev = state.best[key] ?? 0;
  if (score > prev) { state.best[key] = score; }
  touchStreak(); write();
  return score > prev;
}
export const best = (key) => state.best[key] ?? 0;
/** Practice results: drills[id] = { runs, perfect, last } */
export function recordDrill(id, perfect) {
  const d = state.drills[id] || { runs: 0, perfect: 0 };
  state.drills[id] = { runs: d.runs + 1, perfect: d.perfect + (perfect ? 1 : 0), last: Date.now() };
  touchStreak(); write();
}
export const drillState = (id) => state.drills?.[id] || null;
export const isMastered = (id) => (state.drills?.[id]?.perfect || 0) > 0;
export function loadOptional(name) { return loadData(name).catch(() => null); }

export function resetProgress() { state = blank(); write(); }
/** Replace or merge progress from a sanitised backup (see progress-io.js). */
export function restoreProgress(next, mode, merge) {
  state = { ...blank(), ...(mode === 'merge' ? merge(state, next) : next) };
  write();
}
