// Backup format and merge rules for learner progress (pure functions, testable in Node).
export const APP_ID = 'chess-strategy-academy';
const MAPS = ['seen', 'solved', 'best'];

export function makeBackup(state) {
  return { app: APP_ID, version: 1, exported: new Date().toISOString(), progress: state };
}

/** Parse and sanitise a backup. Throws an Error with a readable message if it isn't one of ours. */
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!obj || obj.app !== APP_ID || !obj.progress || typeof obj.progress !== 'object') throw new Error('That is not a Chess Strategy Academy backup.');
  return sanitise(obj.progress);
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
function sanitise(p) {
  const out = { seen: {}, solved: {}, cards: {}, best: {}, drills: {}, streak: { day: null, count: 0 } };
  for (const k of MAPS) for (const [id, v] of Object.entries(p[k] || {})) { const n = num(v); if (n !== null && id.length < 200) out[k][id] = n; }
  for (const [id, v] of Object.entries(p.cards || {})) if (v === 'known' || v === 'again') out.cards[id] = v;
  for (const [id, v] of Object.entries(p.drills || {})) {
    if (v && typeof v === 'object') out.drills[id] = { runs: num(v.runs) || 0, perfect: num(v.perfect) || 0, last: num(v.last) || 0 };
  }
  if (p.streak && /^\d{4}-\d\d-\d\d$/.test(p.streak.day || '')) out.streak = { day: p.streak.day, count: num(p.streak.count) || 0 };
  return out;
}

/** Combine two progress records without losing anything. */
export function mergeProgress(a, b) {
  const out = sanitise(a);
  const add = sanitise(b);
  for (const k of ['seen', 'solved']) for (const [id, t] of Object.entries(add[k])) out[k][id] = out[k][id] ? Math.min(out[k][id], t) : t;
  for (const [id, v] of Object.entries(add.best)) out.best[id] = Math.max(out.best[id] ?? 0, v);
  for (const [id, v] of Object.entries(add.cards)) out.cards[id] = out.cards[id] === 'known' || v === 'known' ? 'known' : v;
  for (const [id, v] of Object.entries(add.drills)) {
    const o = out.drills[id] || { runs: 0, perfect: 0, last: 0 };
    out.drills[id] = { runs: Math.max(o.runs, v.runs), perfect: Math.max(o.perfect, v.perfect), last: Math.max(o.last, v.last) };
  }
  const sa = out.streak, sb = add.streak;
  if (sb.day && (!sa.day || sb.day > sa.day || (sb.day === sa.day && sb.count > sa.count))) out.streak = sb;
  return out;
}

export function summarise(p, data) {
  const seen = (kind) => Object.keys(p.seen).filter((k) => k.startsWith(kind + ':')).length;
  return [
    ['Openings studied', seen('opening'), data?.openings.length],
    ['Tactics solved', data ? data.tactics.filter((t) => p.solved[t.id]).length : Object.keys(p.solved).length, data?.tactics.length],
    ['Plans read', seen('strategy'), data?.strategy.length],
    ['Endgames studied', seen('endgame'), data?.endgames.length],
    ['Lines practised', Object.keys(p.drills).length, null],
    ['Lines mastered', Object.values(p.drills).filter((d) => d.perfect > 0).length, null],
    ['Flashcards known', Object.values(p.cards).filter((v) => v === 'known').length, null],
  ];
}
