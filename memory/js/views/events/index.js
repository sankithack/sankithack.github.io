// Events menu and runner entry point.
import { EVENTS, eventById } from './registry.js';
import { runEvent } from './engine.js';
import { unlockedLevel, bestResult, resultsFor } from '../../storage.js';
import { esc, pct } from '../../utils.js';

export function render(el, params, query) {
  if (params[0]) {
    const ev = eventById(params[0]);
    if (ev) return runEvent(el, ev, query);
  }
  el.innerHTML = `
    <div class="page-head"><h1>Practice Events</h1><p>Timed events modelled on memory championships. Each has a memorize phase, a recall phase and automatic scoring.</p></div>
    <div class="grid cols-2">${EVENTS.map((ev) => {
      const lvl = Math.min(unlockedLevel(ev.id), ev.levels.length - 1);
      const best = bestResult(ev.id);
      const n = resultsFor(ev.id).length;
      return `<a class="card link" href="#/events/${ev.id}">
        <div class="row between"><h2 class="mb0">${esc(ev.name)}</h2><span class="badge accent">Level ${lvl + 1}/${ev.levels.length}</span></div>
        <p class="muted" style="margin-top:6px">${ev.blurb}</p>
        <p class="small mb0">${best ? `Best: <b>${best.score}</b>/${best.total} (${pct(best.accuracy)}) · ${n} session${n === 1 ? '' : 's'}` : '<span class="muted">Not tried yet</span>'}</p>
      </a>`;
    }).join('')}</div>`;
}
