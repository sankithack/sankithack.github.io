// Your week: activity over the last 7 days (from progress timestamps), what was done, and what's next.
import { h, icon } from '../lib/dom.js';
import { progress } from '../lib/store.js';
import { page, pageHead } from './common.js';
import { todayPlan } from './guide.js';
import { dailyStreak, localDate } from './daily.js';

const CATS = ['Openings', 'Tactics', 'Strategy', 'Endgames', 'Practice', 'Daily puzzle'];

/** Every timestamped study event: { t, cat, label, href } */
export function events(data) {
  const p = progress(), out = [];
  const find = (list, id) => list.find((x) => x.id === id);
  for (const [k, t] of Object.entries(p.seen)) {
    const [kind, id] = k.split(':');
    const map = { opening: ['Openings', data.openings, '#/openings/'], strategy: ['Strategy', data.strategy, '#/strategy/'], endgame: ['Endgames', data.endgames, '#/endgames/'] }[kind];
    const item = map && find(map[1], id);
    if (item) out.push({ t, cat: map[0], label: `Studied ${item.name}`, href: map[2] + id });
  }
  for (const [k, t] of Object.entries(p.solved)) {
    if (k.startsWith('daily:')) { out.push({ t, cat: 'Daily puzzle', label: `Daily puzzle ${k.slice(6)}`, href: `#/daily/${k.slice(6)}` }); continue; }
    const motif = find(data.tactics, k.replace(/-\d+$/, ''));
    if (!motif) continue;
    if (motif.id === k && Object.entries(p.solved).some(([k2, t2]) => k2.startsWith(k + '-') && Math.abs(t2 - t) < 2000)) continue; // same solve recorded twice
    out.push({ t, cat: 'Tactics', label: `Solved ${motif.name}${k !== motif.id ? ' (puzzle ' + k.split('-').pop() + ')' : ''}`, href: `#/tactics/${motif.id}${k !== motif.id ? '/' + k.split('-').pop() : ''}` });
  }
  for (const [k, d] of Object.entries(p.drills || {})) {
    if (!d.last) continue;
    const [kind, id, sub, idx] = k.split(':');
    let label = 'Practice', href = '#/practice';
    if (kind === 'o') { const o = find(data.openings, id); if (!o) continue; label = `Drilled ${o.name} (${sub === 'main' ? 'main line' : sub})`; href = `#/practice/opening/${id}/${sub}/${idx}`; }
    else if (kind === 'e') { const e = find(data.endgames, id); if (!e) continue; label = `Practised ${e.name}`; href = `#/practice/endgame/${id}`; }
    else if (kind === 'a') { const a = find(data.attack, id); if (!a) continue; label = `Attack drill: ${a.name}`; href = `#/practice/attack/${id}`; }
    out.push({ t: d.last, cat: 'Practice', label: label + (d.perfect ? ' ✓' : ''), href });
  }
  return out.sort((a, b) => b.t - a.t);
}

export function render(data) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (6 - i)); return localDate(d); });
  const evs = events(data).filter((e) => days.includes(localDate(new Date(e.t))));
  const byDay = days.map((d) => evs.filter((e) => localDate(new Date(e.t)) === d));
  const max = Math.max(1, ...byDay.map((l) => l.length));
  const activeDays = byDay.filter((l) => l.length).length;
  const label = (iso, long) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short' });

  // bar chart: one series (items per day); tooltip and table carry the per-category breakdown
  const tip = h('div.chart-tip', { role: 'status', hidden: true });
  const breakdown = (list) => CATS.map((c) => [c, list.filter((e) => e.cat === c).length]).filter(([, n]) => n);
  const bars = h('div.week-bars', { role: 'list', 'aria-label': 'Items studied per day, last 7 days' },
    byDay.map((list, i) => {
      const show = () => {
        tip.replaceChildren(h('strong', label(days[i], true)), h('span', `${list.length} item${list.length === 1 ? '' : 's'}`), ...breakdown(list).map(([c, n]) => h('span.muted', `${c}: ${n}`)));
        tip.hidden = false;
        tip.style.left = `${((i + 0.5) / 7) * 100}%`;
      };
      return h('div.week-col', { role: 'listitem', tabindex: 0, 'aria-label': `${label(days[i], true)}: ${list.length} item${list.length === 1 ? '' : 's'}`, onmouseenter: show, onfocus: show, onmouseleave: () => (tip.hidden = true), onblur: () => (tip.hidden = true) },
        h('div.week-plot', h('span.week-bar' + (list.length ? '' : '.is-zero'), { style: { '--h': `${(list.length / max) * 100}%` } },
          list.length === max && list.length ? h('span.week-val', String(list.length)) : null)),
        h('span.week-day' + (i === 6 ? '.is-today' : ''), i === 6 ? 'Today' : label(days[i])));
    }));

  const groups = CATS.map((c) => [c, evs.filter((e) => e.cat === c)]).filter(([, l]) => l.length);
  const plan = todayPlan(data);
  const streak = dailyStreak();
  return page('Your week',
    pageHead('Your week', 'What you studied over the last seven days, and what to work on next.'),
    h('div.week-stats',
      h('div.stat', h('span.stat-num', String(evs.length)), h('span.stat-label', 'items this week')),
      h('div.stat', h('span.stat-num', `${activeDays}/7`), h('span.stat-label', 'days with study')),
      h('div.stat', h('span.stat-num', String(streak)), h('span.stat-label', 'daily-puzzle streak'))),
    h('section.week-chart', { 'aria-label': 'Activity chart' },
      h('h2.h3', 'Items studied per day'),
      h('div.week-chart-box', bars, tip),
      h('details.spoiler', h('summary', 'Show as a table'),
        h('table.week-table', h('thead', h('tr', h('th', 'Day'), ...CATS.map((c) => h('th', c)), h('th', 'Total'))),
          h('tbody', byDay.map((list, i) => h('tr', h('th', label(days[i], true)), ...CATS.map((c) => h('td', String(list.filter((e) => e.cat === c).length))), h('td', String(list.length)))))))),
    evs.length ? null : h('div.empty', h('p', 'Nothing yet this week.'), h('a.btn.btn-primary', { href: '#/daily' }, 'Start with the daily puzzle')),
    groups.length ? h('section.week-done', h('h2', 'Done this week'),
      h('div.week-groups', groups.map(([c, list]) => h('div.io-card', h('h3', `${c} (${list.length})`),
        h('ul.week-list', list.slice(0, 12).map((e) => h('li', h('a', { href: e.href }, e.label)))), list.length > 12 ? h('p.muted.small', `and ${list.length - 12} more`) : null)))) : null,
    h('section.week-next', h('h2', 'Next week'),
      h('p.muted', `Roadmap stage ${plan.index + 1}: ${plan.stage.range} — ${plan.stage.title}. ${plan.done} of ${plan.total} done.`),
      h('ul.week-list', plan.items.map((r) => h('li', h('a', { href: r.href }, r.label)))),
      h('p', h('a', { href: '#/guide' }, 'Open the roadmap'), ' · ', h('a', { href: '#/progress' }, 'Back up your progress'))));
}
