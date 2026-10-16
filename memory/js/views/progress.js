// Progress: per-event charts of score, accuracy and memorization time, plus history.
import { EVENTS, eventById } from './events/registry.js';
import { lineChart } from '../lib/chart.js';
import { db, update, resultsFor, bestResult, unlockedLevel } from '../storage.js';
import { esc, fmtDate, fmtDuration, pct, toast, $, $$ } from '../utils.js';

export function render(el, params, query) {
  const d = db();
  const lastEvent = d.results.at(-1)?.event;
  const ev = eventById(params[0]) || eventById(lastEvent) || EVENTS[0];
  const all = resultsFor(ev.id);
  const levelFilter = query?.get('level') ?? 'all';
  const rows = levelFilter === 'all' ? all : all.filter((r) => String(r.level) === levelFilter);
  const levelsUsed = [...new Set(all.map((r) => r.level))].sort((a, b) => a - b);
  const best = bestResult(ev.id);
  const last10 = rows.slice(-10);
  const avg = (arr, f) => (arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0);
  const trainingDays = Object.keys(d.activity).length;

  el.innerHTML = `
    <div class="page-head"><h1>Progress</h1><p>${d.results.length} event sessions over ${trainingDays} training day${trainingDays === 1 ? '' : 's'}.</p></div>
    <div class="stack">
      <div class="card row">
        <div class="field" style="flex:1;min-width:180px"><label for="ev">Event</label>
          <select id="ev">${EVENTS.map((e) => `<option value="${e.id}" ${e.id === ev.id ? 'selected' : ''}>${esc(e.name)} (${resultsFor(e.id).length})</option>`).join('')}</select></div>
        <div class="field" style="flex:1;min-width:180px"><label for="lv">Level</label>
          <select id="lv"><option value="all">All levels</option>${levelsUsed.map((l) => `<option value="${l}" ${String(l) === levelFilter ? 'selected' : ''}>${l < 0 ? 'Custom' : `Level ${l + 1}: ${esc(ev.levels[l]?.label || '')}`}</option>`).join('')}</select></div>
      </div>
      <div class="grid cols-4">
        <div class="card stat"><span class="value">${rows.length}</span><span class="label">sessions</span></div>
        <div class="card stat"><span class="value">${best ? best.score : '–'}</span><span class="label">personal best${best ? ` (${esc(best.label)})` : ''}</span></div>
        <div class="card stat"><span class="value">${last10.length ? pct(avg(last10, (r) => r.accuracy)) : '–'}</span><span class="label">avg accuracy, last ${last10.length || 10}</span></div>
        <div class="card stat"><span class="value">${Math.min(unlockedLevel(ev.id), ev.levels.length - 1) + 1}/${ev.levels.length}</span><span class="label">level unlocked</span></div>
      </div>
      ${levelFilter === 'all' && levelsUsed.length > 1 ? '<p class="small muted mb0">Tip: scores from different levels aren’t directly comparable. Filter by level, or watch accuracy.</p>' : ''}
      <div class="grid charts">
        <section class="card"><h3>Score</h3><div id="c-score"></div></section>
        <section class="card"><h3>Accuracy</h3><div id="c-acc"></div></section>
        <section class="card"><h3>${ev.untimedMemorize ? 'Recall time' : 'Memorization time'}</h3><div id="c-time"></div></section>
        <section class="card"><h3>Items per minute memorized</h3><div id="c-rate"></div></section>
      </div>
      <section class="card">
        <h2>History</h2>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Level</th><th class="num">Score</th><th class="num">Accuracy</th><th class="num">Memorize</th><th class="num">Recall</th><th></th></tr></thead>
          <tbody>${[...rows].reverse().map((r) => `<tr>
            <td>${fmtDate(r.date)} <span class="muted small">${new Date(r.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></td>
            <td>${esc(r.label)}${r.strict ? ' <span class="badge">strict</span>' : ''}</td>
            <td class="num">${r.score}/${r.total}</td><td class="num">${pct(r.accuracy)}</td>
            <td class="num">${fmtDuration(r.memTime)}</td><td class="num">${fmtDuration(r.recallTime)}</td>
            <td><button class="btn ghost small danger" data-del="${r.id}" aria-label="Delete session">✕</button></td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="muted mb0">No sessions yet. <a href="#/events/${ev.id}">Try ${esc(ev.name)}</a>.</p>`}
      </section>
    </div>`;

  const date = (r) => fmtDate(r.date);
  const tip = (r, main) => `<b>${main}</b><br>${esc(date(r))} · ${esc(r.label)}`;
  const xLabel = (i) => date(rows[i]);
  lineChart($('#c-score', el), { title: 'Score', points: rows.map((r) => ({ y: r.score, tip: tip(r, `${r.score} / ${r.total}`) })), xLabel });
  lineChart($('#c-acc', el), { title: 'Accuracy', yMax: 1, fmt: (v) => `${Math.round(v * 100)}%`, points: rows.map((r) => ({ y: r.accuracy, tip: tip(r, pct(r.accuracy)) })), xLabel });
  const tKey = ev.untimedMemorize ? 'recallTime' : 'memTime';
  lineChart($('#c-time', el), { title: 'Time', fmt: (v) => `${Math.round(v)}s`, points: rows.map((r) => ({ y: r[tKey], tip: tip(r, fmtDuration(r[tKey])) })), xLabel });
  const rate = (r) => (r.memTime > 0 ? (r.raw / r.memTime) * 60 : 0);
  lineChart($('#c-rate', el), { title: 'Correct items per minute of memorizing', fmt: (v) => (v === 0 ? '0' : v.toFixed(v < 10 ? 1 : 0)), points: rows.map((r) => ({ y: rate(r), tip: tip(r, `${rate(r).toFixed(1)} correct / min`) })), xLabel });

  $('#ev', el).onchange = (e) => { location.hash = `#/progress/${e.target.value}`; };
  $('#lv', el).onchange = (e) => { location.hash = `#/progress/${ev.id}${e.target.value === 'all' ? '' : `?level=${e.target.value}`}`; };
  $$('[data-del]', el).forEach((b) => {
    b.onclick = () => {
      if (!confirm('Delete this session from your history?')) return;
      update((x) => { x.results = x.results.filter((r) => r.id !== b.dataset.del); });
      toast('Session deleted');
      render(el, [ev.id], query);
    };
  });
}
