// SM-2 style spaced repetition scheduler, day-based.
// Card state: { ef, reps, interval, due, lapses, introduced }
import { db, update } from '../storage.js';
import { dateKey, addDays } from '../utils.js';

export const GRADES = [
  { key: 'again', label: 'Again', hotkey: '1' },
  { key: 'hard', label: 'Hard', hotkey: '2' },
  { key: 'good', label: 'Good', hotkey: '3' },
  { key: 'easy', label: 'Easy', hotkey: '4' },
];

const fresh = () => ({ ef: 2.5, reps: 0, interval: 0, due: null, lapses: 0, introduced: null });

/** Compute the next state without saving (used for button previews too). */
export function schedule(card, grade, today = dateKey()) {
  const c = { ...fresh(), ...card };
  switch (grade) {
    case 'again':
      c.reps = 0;
      c.interval = 0;
      c.lapses += 1;
      c.ef = Math.max(1.3, c.ef - 0.2);
      break;
    case 'hard':
      c.interval = c.reps === 0 ? 1 : Math.max(c.interval + 1, Math.round(c.interval * 1.2));
      c.ef = Math.max(1.3, c.ef - 0.15);
      c.reps += 1;
      break;
    case 'good':
      c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ef);
      c.reps += 1;
      break;
    case 'easy':
      c.interval = c.reps === 0 ? 3 : c.reps === 1 ? 6 : Math.round(c.interval * c.ef * 1.3);
      c.ef += 0.15;
      c.reps += 1;
      break;
  }
  c.due = addDays(today, c.interval);
  c.introduced ||= today;
  return c;
}

export function grade(id, g) {
  const next = schedule(db().srs[id], g);
  update((d) => { d.srs[id] = next; });
  return next;
}

export const intervalLabel = (days) => (days === 0 ? 'now' : days === 1 ? '1 day' : days < 30 ? `${days} days` : `${Math.round(days / 30)} mo`);

/** Split a deck's ids into due reviews, new cards available today, and counts. */
export function deckStatus(ids) {
  const srs = db().srs;
  const today = dateKey();
  const due = [];
  const unseen = [];
  let introducedToday = 0;
  let learned = 0;
  let mature = 0;
  for (const id of ids) {
    const c = srs[id];
    if (!c) { unseen.push(id); continue; }
    if (c.introduced === today) introducedToday++;
    if (c.reps > 0) learned++;
    if (c.interval >= 21) mature++;
    if (!c.due || c.due <= today) due.push(id);
  }
  due.sort((a, b) => (srs[a].due || '').localeCompare(srs[b].due || ''));
  const newLimit = Math.max(0, db().settings.newPerDay - introducedToday);
  return { due, fresh: unseen.slice(0, newLimit), unseen: unseen.length, learned, mature, total: ids.length };
}
