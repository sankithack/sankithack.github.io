// Home: today's plan, streak, flashcards due, recent scores and personal bests.
import { planForDay, WEEKS, PLAN_DAYS } from '../data/curriculum.js';
import { lessonById } from '../data/lessons.js';
import { NUMBERS } from '../data/major.js';
import { DECK } from '../data/cards.js';
import { EVENTS, eventById } from './events/registry.js';
import { deckStatus } from '../lib/srs.js';
import { db, update, streak, todayActivity, unlockedLevel, bestResult } from '../storage.js';
import { esc, dateKey, addDays, daysBetween, fmtDate, pct, $ } from '../utils.js';

const DECK_IDS = { numbers: NUMBERS.map((n) => `num:${n}`), cards: DECK.map((c) => `card:${c}`) };
const DECK_NAMES = { numbers: 'number images', cards: 'card images' };

function taskInfo(t) {
  const d = db();
  const today = todayActivity();
  switch (t.type) {
    case 'lesson': {
      const l = lessonById(t.id);
      return { title: `Lesson: ${l.title}`, sub: `${l.minutes} min read + mini-exercise`, href: `#/learn/${t.id}`, done: d.lessonsDone.includes(t.id), cta: 'Read' };
    }
    case 'build': {
      const best = Math.max(0, ...d.palaces.map((p) => p.loci.length));
      return { title: `Build a palace with ${t.loci} loci`, sub: best ? `Your biggest palace has ${best}` : 'Start with your home', href: '#/palaces', done: best >= t.loci, cta: 'Build' };
    }
    case 'palace': {
      const p = d.palaces.find((x) => x.loci.length >= 2);
      return { title: 'Walk your memory palace', sub: 'A quick walk-through or random quiz', href: p ? `#/palaces/${p.id}/practice` : '#/palaces', done: today.palace > 0, cta: 'Practise' };
    }
    case 'srs': {
      const st = deckStatus(DECK_IDS[t.deck]);
      const left = st.due.length + st.fresh.length;
      return { title: `Flashcards: ${DECK_NAMES[t.deck]}`, sub: left ? `${st.due.length} due · ${st.fresh.length} new` : 'All caught up', href: `#/train/${t.deck}`, done: left === 0, cta: 'Study' };
    }
    case 'event': {
      const ev = eventById(t.id);
      const lvl = Math.min(unlockedLevel(t.id), ev.levels.length - 1);
      const times = t.times || 1;
      const doneN = today.events[t.id] || 0;
      return {
        title: `${ev.name}${times > 1 ? ` ×${times}` : ''}`,
        sub: `Level ${lvl + 1}: ${ev.levels[lvl].label}${times > 1 ? ` · ${Math.min(doneN, times)}/${times} today` : ''}`,
        href: `#/events/${t.id}?level=${lvl}`,
        done: doneN >= times,
        cta: 'Start',
      };
    }
  }
  return { title: '?', sub: '', href: '#/', done: false, cta: 'Go' };
}

export function render(el) {
  const d = db();
  const start = d.curriculum.startDate;
  const today = dateKey();
  const s = streak();

  let planHTML;
  if (!start) {
    planHTML = `
      <section class="card">
        <h2>Welcome to Loci 👋</h2>
        <p>This site teaches the techniques memory athletes use, then trains you with timed events like the ones in real championships. Everything is stored in your browser, so remember to <a href="#/settings">export a backup</a> now and then.</p>
        <p>The <b>4-week beginner plan</b> gives you a short daily checklist: about 20–30 minutes a day. It starts with memory palaces and images, then numbers, cards and faces, and ends with a mini competition.</p>
        <div class="btn-row"><button class="btn primary big" id="startPlan">Start the 4-week plan</button><a class="btn big" href="#/learn/palace">Just read lesson 1</a></div>
      </section>`;
  } else {
    const dayIndex = Math.max(0, daysBetween(start, today));
    const { week, weekIndex, tasks } = planForDay(dayIndex);
    const infos = tasks.map(taskInfo);
    const doneCount = infos.filter((t) => t.done).length;
    const inPlan = dayIndex < PLAN_DAYS;
    planHTML = `
      <section class="card">
        <div class="row between">
          <div><span class="badge accent">${inPlan ? `Week ${weekIndex + 1} · Day ${(dayIndex % 7) + 1}` : `Day ${dayIndex + 1}`}</span>
          <h2 style="margin:8px 0 4px">${esc(week.title)}</h2></div>
          <div class="stat" style="text-align:right"><span class="value">${doneCount}/${infos.length}</span><span class="label">done today</span></div>
        </div>
        <p class="muted">${esc(week.goal)}</p>
        <div class="progress" style="margin-bottom:6px"><span style="width:${(doneCount / infos.length) * 100}%"></span></div>
        <div>${infos.map((t) => `
          <div class="task ${t.done ? 'done' : ''}">
            <span class="tick" aria-hidden="true">✓</span>
            <div><div class="title">${esc(t.title)}</div><div class="small muted">${esc(t.sub)}</div></div>
            <a class="btn small ${t.done ? '' : 'primary'}" href="${t.href}">${t.done ? 'Again' : t.cta}</a>
          </div>`).join('')}</div>
        ${doneCount === infos.length ? '<p class="callout" style="margin:12px 0 0">🎉 Today’s plan is complete. Extra practice is a bonus, and rest is part of training too.</p>' : ''}
      </section>`;
  }

  const recent = [...d.results].reverse().slice(0, 6);
  const nums = deckStatus(DECK_IDS.numbers);
  const cards = deckStatus(DECK_IDS.cards);
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const isActive = (k) => { const a = d.activity[k]; return a && (Object.keys(a.events).length || a.srs || a.lessons.length || a.palace); };

  el.innerHTML = `
    <div class="page-head"><h1>Dashboard</h1><p>${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
    <div class="stack">
      ${planHTML}
      <div class="grid cols-3">
        <section class="card">
          <h3>Streak</h3>
          <div class="row" style="align-items:flex-end"><span class="streak">${s}</span><span class="muted">day${s === 1 ? '' : 's'} 🔥</span></div>
          <div class="row" style="gap:4px;margin-top:12px" aria-label="Last 14 days">${last14.map((k) => `<span title="${k}" style="width:14px;height:14px;border-radius:4px;background:${isActive(k) ? 'var(--accent)' : 'var(--surface-2)'};${k === today ? 'outline:2px solid var(--accent);outline-offset:1px' : ''}"></span>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">Train a little every day. Consistency beats marathon sessions.</p>
        </section>
        <section class="card">
          <h3>Flashcards</h3>
          <div class="task"><div><div class="title">Numbers 00–99</div><div class="small muted">${nums.learned}/100 learned · ${nums.due.length} due · ${nums.fresh.length} new</div></div><a class="btn small" href="#/train/numbers">Study</a></div>
          <div class="task"><div><div class="title">Cards</div><div class="small muted">${cards.learned}/52 learned · ${cards.due.length} due · ${cards.fresh.length} new</div></div><a class="btn small" href="#/train/cards">Study</a></div>
        </section>
        <section class="card">
          <h3>Memory palaces</h3>
          <div class="stat"><span class="value">${d.palaces.reduce((n, p) => n + p.loci.length, 0)}</span><span class="label">loci in ${d.palaces.length} palace${d.palaces.length === 1 ? '' : 's'}</span></div>
          <a class="btn small" href="#/palaces" style="margin-top:12px">Manage palaces</a>
        </section>
      </div>
      <section class="card">
        <div class="row between"><h2 class="mb0">Personal bests</h2><a class="small" href="#/progress">All progress →</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Level</th><th class="num">Best</th><th class="num">Accuracy</th><th>Date</th></tr></thead>
          <tbody>${EVENTS.map((ev) => {
            const b = bestResult(ev.id);
            const lvl = Math.min(unlockedLevel(ev.id), ev.levels.length - 1);
            return `<tr><td><a href="#/events/${ev.id}">${esc(ev.name)}</a></td><td>${lvl + 1}/${ev.levels.length}</td>
              <td class="num">${b ? `<b>${b.score}</b> / ${b.total}` : '–'}</td><td class="num">${b ? pct(b.accuracy) : '–'}</td><td>${b ? fmtDate(b.date) : ''}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>
      <section class="card">
        <h2>Recent sessions</h2>
        ${recent.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Level</th><th class="num">Score</th><th class="num">Accuracy</th><th>When</th></tr></thead>
          <tbody>${recent.map((r) => `<tr><td>${esc(eventById(r.event)?.name || r.event)}</td><td>${esc(r.label)}</td><td class="num">${r.score}/${r.total}</td>
            <td class="num"><span class="badge ${r.accuracy >= 0.9 ? 'ok' : r.accuracy >= 0.6 ? 'warn' : 'bad'}">${pct(r.accuracy)}</span></td><td>${fmtDate(r.date)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="muted mb0">No events yet. Your scores will show up here.</p>'}
      </section>
      ${start ? `<section class="card soft small">
        <h3>The plan</h3>
        <ol class="mb0" style="padding-left:1.2em">${WEEKS.map((w, i) => `<li${i === Math.floor(Math.max(0, daysBetween(start, today)) / 7) ? ' style="font-weight:700"' : ''}>${esc(w.title)}</li>`).join('')}</ol>
        <p style="margin:10px 0 0">Started ${fmtDate(start)}. <button class="btn ghost small" id="restartPlan">Restart plan from today</button></p>
      </section>` : ''}
    </div>`;

  const sp = $('#startPlan', el);
  if (sp) sp.onclick = () => { update((x) => { x.curriculum.startDate = today; }); render(el); };
  const rp = $('#restartPlan', el);
  if (rp) rp.onclick = () => {
    if (!confirm('Restart the 4-week plan from today? Your scores and levels are kept.')) return;
    update((x) => { x.curriculum.startDate = today; });
    render(el);
  };
}
