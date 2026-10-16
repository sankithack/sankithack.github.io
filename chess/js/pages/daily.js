// Daily puzzle: the same position for everyone on a given day, with a shareable link.
import { h, icon } from '../lib/dom.js';
import { createPuzzle, allPuzzles } from '../lib/puzzle.js';
import { markSolved, isSolved, progress } from '../lib/store.js';
import { page, pageHead, levelTag, tag } from './common.js';

export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNumber = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);

/** A fixed shuffle of all puzzles, so consecutive days get different motifs. */
function order(puzzles) {
  let s = 2026;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...puzzles];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function puzzleForDate(tactics, iso) {
  const list = order(allPuzzles(tactics));
  return list[((dayNumber(iso) % list.length) + list.length) % list.length];
}
/** Consecutive days (ending today or yesterday) with the daily puzzle solved. */
export function dailyStreak(today = localDate()) {
  const solved = progress().solved;
  let n = 0;
  const d = new Date(today + 'T12:00:00');
  if (!solved['daily:' + today]) d.setDate(d.getDate() - 1);
  while (solved['daily:' + localDate(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function render(data, date, pid) {
  const today = localDate();
  const iso = /^\d{4}-\d\d-\d\d$/.test(date || '') && date <= today ? date : today;
  const all = allPuzzles(data.tactics);
  const pz = (pid && all.find((p) => p.pid === pid)) || puzzleForDate(data.tactics, iso);
  const key = 'daily:' + iso;
  const result = h('div.puzzle-reveal', { hidden: !isSolved(key) },
    h('h2.h3', 'Why it works'), h('p', pz.explanation), h('p.muted', `Theme: ${pz.name}. `, h('a', { href: `#/tactics/${pz.motif.id}` }, 'Study this motif')));
  const streakEl = h('p.daily-streak');
  const paintStreak = () => { const s = dailyStreak(today); streakEl.textContent = s ? `Daily streak: ${s} day${s === 1 ? '' : 's'}.` : 'Solve today\'s puzzle to start a streak.'; };
  paintStreak();
  let clean = false;
  const puzzle = createPuzzle(pz, { onSolved: (r) => {
    result.hidden = false;
    if (r.revealed) { streakEl.textContent = isSolved(key) ? streakEl.textContent : 'Solution shown — it doesn\'t count for the streak. Try again tomorrow!'; return; }
    clean = r.clean; markSolved(key); markSolved(pz.pid); markSolved(pz.motif.id); paintStreak();
  } });
  const shareMsg = h('span.muted.small', { role: 'status' });
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/daily/${iso}/${pz.pid}`;
    const text = `Chess Strategy Academy daily puzzle, ${iso}${isSolved(key) ? (clean ? ': solved with no hints ✓' : ': solved ✓') : ''}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Daily chess puzzle', text, url }); shareMsg.textContent = 'Shared.'; }
      else { await navigator.clipboard.writeText(`${text}\n${url}`); shareMsg.textContent = 'Link copied.'; }
    } catch { shareMsg.textContent = url; }
  };
  const prev = new Date(iso + 'T12:00:00'); prev.setDate(prev.getDate() - 1);
  const next = new Date(iso + 'T12:00:00'); next.setDate(next.getDate() + 1);
  const pretty = new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return page('Daily puzzle',
    pageHead('Daily puzzle', iso === today ? 'One new position every day — the same for everyone. Come back tomorrow for the next one.' : `The puzzle from ${pretty}.`),
    h('div.study', h('div.study-board', puzzle.el),
      h('div.study-text',
        h('p.daily-date', pretty), h('div.tags', levelTag(pz.level), tag(pz.goal, 'quiet')),
        streakEl,
        h('div.puzzle-actions', h('button.btn.btn-primary', { type: 'button', onclick: share }, icon('arrow', 16), 'Share'), shareMsg),
        result,
        h('nav.pager.daily-pager', { 'aria-label': 'Other days' },
          h('a', { href: `#/daily/${localDate(prev)}` }, '← Previous day'),
          iso < today ? h('a', { href: localDate(next) >= today ? '#/daily' : `#/daily/${localDate(next)}` }, 'Next day →') : h('span')))));
}
