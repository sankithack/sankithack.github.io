// Shared event flow: setup -> countdown -> memorize -> recall -> results.
//
// An event module (see numbers.js) provides:
//   id, name, blurb, tips (html), levels: [{label, cfg}], fields: [...], defaults: {...}
//   generate(cfg) -> data
//   memorize(box, data, cfg, ctx) -> cleanup?      ctx.done() ends memorization early
//   recall(box, data, cfg) -> { answers(), cleanup? }
//   check(data, answers, cfg) -> { rows, mode? }   rows as in lib/compare.js
//   untimedMemorize?: true (spoken numbers: playback decides the length)
import { db, update, settings, addResult, unlockedLevel, checkUnlock, bestResult, uid, UNLOCK_ACCURACY } from '../../storage.js';
import { scoreRows, comparisonHTML } from '../../lib/compare.js';
import { esc, countdown, fmtClock, fmtDuration, pct, toast, $, $$ } from '../../utils.js';

const TIME_FIELDS = [
  { key: 'memTime', label: 'Memorize time', hint: 'seconds', type: 'number', min: 10, max: 3600, step: 5 },
  { key: 'recallTime', label: 'Recall time', hint: 'seconds', type: 'number', min: 10, max: 3600, step: 5 },
];

export function runEvent(el, ev, query) {
  let cleanups = [];
  const clean = () => { cleanups.forEach((f) => { try { f?.(); } catch (e) { console.error(e); } }); cleanups = []; };

  const prefs = () => db().eventPrefs[ev.id] || {};
  const unlocked = () => Math.min(unlockedLevel(ev.id), ev.levels.length - 1);
  const fields = () => [...ev.fields, ...(ev.untimedMemorize ? TIME_FIELDS.slice(1) : TIME_FIELDS)];
  const levelKeys = (lv) => Object.keys(lv.cfg);

  // ---------- Setup ----------
  function setup(levelIdx = null, carry = null) {
    clean();
    const p = prefs();
    let level = levelIdx ?? (query?.get('level') != null ? Number(query.get('level')) : p.lastLevel ?? unlocked());
    if (level > unlocked()) level = unlocked();
    let cfg = carry ? { ...carry } : { ...ev.defaults, ...p.opts, ...ev.levels[level].cfg };

    el.innerHTML = `
      <div class="crumbs"><a href="#/events">← Events</a></div>
      <div class="page-head"><h1>${esc(ev.name)}</h1><p>${ev.blurb}</p></div>
      <div class="stack">
        <section class="card">
          <h2>Level</h2>
          <div class="level-list" id="levels">${ev.levels.map((lv, i) => `
            <button class="level-btn ${i < unlocked() ? 'passed' : ''} ${i > unlocked() ? 'locked' : ''}" data-i="${i}" ${i > unlocked() ? 'aria-disabled="true"' : ''}>
              ${i > unlocked() ? '🔒 ' : ''}${i + 1}<small>${esc(lv.label)}</small></button>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">Score ${pct(UNLOCK_ACCURACY)}+ on 2 of your last 3 tries at your highest level to unlock the next.</p>
        </section>
        <section class="card">
          <h2>Settings</h2>
          <form class="form-grid" id="opts">${fields().map(fieldHTML).join('')}</form>
          <p id="customNote" class="small" style="margin:10px 0 0"></p>
          <p class="small muted mb0" style="margin-top:6px">Scoring: ${settings().strict ? '<b>championship (strict)</b>' : 'standard (every correct item counts)'} · <a href="#/settings">change</a></p>
        </section>
        ${ev.tips ? `<details class="card"><summary><b>How to approach this event</b></summary><div class="lesson" style="margin-top:10px">${ev.tips}</div></details>` : ''}
        <button class="btn primary big block" id="start">Start memorizing</button>
      </div>`;

    const form = $('#opts', el);
    const fill = () => {
      for (const f of fields()) {
        const input = form.elements[f.key];
        if (!input) continue;
        if (f.type === 'checkbox') input.checked = !!cfg[f.key];
        else input.value = cfg[f.key];
      }
      refreshLevel();
    };
    const isCustom = () => levelKeys(ev.levels[level]).some((k) => String(cfg[k]) !== String(ev.levels[level].cfg[k]));
    const refreshLevel = () => {
      $$('.level-btn', el).forEach((b) => b.classList.toggle('selected', Number(b.dataset.i) === level && !isCustom()));
      $('#customNote', el).innerHTML = isCustom()
        ? '<span class="badge warn">Custom</span> These settings differ from the level, so this session won’t count towards unlocking.'
        : `<span class="badge accent">Level ${level + 1}</span> ${esc(ev.levels[level].label)}`;
    };

    form.addEventListener('input', () => {
      for (const f of fields()) {
        const input = form.elements[f.key];
        if (!input) continue;
        if (f.type === 'checkbox') cfg[f.key] = input.checked;
        else if (f.type === 'number') {
          const v = Number(input.value);
          if (input.value !== '' && Number.isFinite(v)) cfg[f.key] = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, v));
        } else cfg[f.key] = isNaN(Number(input.value)) || input.value === '' ? input.value : Number(input.value);
      }
      refreshLevel();
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    $('#levels', el).onclick = (e) => {
      const b = e.target.closest('.level-btn');
      if (!b) return;
      const i = Number(b.dataset.i);
      if (i > unlocked()) {
        toast(`Locked: reach ${pct(UNLOCK_ACCURACY)} at level ${unlocked() + 1} first. You can still try any size with custom settings.`, 4000);
        return;
      }
      level = i;
      cfg = { ...cfg, ...ev.levels[i].cfg };
      fill();
    };
    fill();

    $('#start', el).onclick = () => {
      const opts = {};
      for (const f of ev.fields) if (!levelKeys(ev.levels[level]).includes(f.key)) opts[f.key] = cfg[f.key];
      update((d) => { d.eventPrefs[ev.id] = { lastLevel: level, opts }; });
      start({ ...cfg }, isCustom() ? -1 : level);
    };
  }

  function fieldHTML(f) {
    const id = `f-${f.key}`;
    if (f.type === 'checkbox') {
      return `<div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" id="${id}" name="${f.key}"> ${esc(f.label)}</label></div>`;
    }
    const label = `<label for="${id}">${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}</label>`;
    if (f.type === 'select') {
      return `<div class="field">${label}<select id="${id}" name="${f.key}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`;
    }
    return `<div class="field">${label}<input id="${id}" name="${f.key}" type="number" inputmode="numeric" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}"></div>`;
  }

  // ---------- Run ----------
  function start(cfg, level) {
    clean();
    const data = ev.generate(cfg);
    const session = { cfg, level, data, memTime: 0, recallTime: 0 };
    let n = 3;
    el.innerHTML = `<div class="countdown" aria-live="assertive">${n}</div>`;
    const id = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(id); memorize(session); }
      else $('.countdown', el).textContent = n;
    }, 700);
    cleanups.push(() => clearInterval(id));
  }

  function bar(phase, sub, btnLabel) {
    return `<div class="event-bar">
      <span class="phase">${phase}</span><span class="muted small">${sub}</span>
      <span class="spacer"></span>
      <span class="timer" id="timer"></span>
      <button class="btn primary small" id="phaseBtn">${btnLabel}</button>
      <div class="timebar"><span id="timebar" style="width:100%"></span></div>
    </div><div id="stage"></div>`;
  }

  function startTimer(limit, onDone) {
    const timerEl = $('#timer', el);
    const barEl = $('#timebar', el);
    const t = countdown(limit, {
      onTick: (rem, elapsed) => {
        if (limit > 0) {
          timerEl.textContent = fmtClock(rem);
          timerEl.classList.toggle('low', rem <= 10);
          barEl.style.width = `${Math.max(0, (rem / limit) * 100)}%`;
        } else {
          timerEl.textContent = fmtClock(elapsed);
        }
      },
      onDone,
    });
    cleanups.push(t.stop);
    return t;
  }

  function memorize(session) {
    clean();
    const { cfg, data } = session;
    el.innerHTML = bar('Memorize', esc(ev.name), 'Done → Recall');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      session.memTime = timer.elapsed();
      recall(session);
    };
    const timer = startTimer(ev.untimedMemorize ? 0 : cfg.memTime, finish);
    $('#phaseBtn', el).onclick = finish;
    const c = ev.memorize($('#stage', el), data, cfg, { done: finish });
    if (typeof c === 'function') cleanups.push(c);
  }

  function recall(session) {
    clean();
    const { cfg, data } = session;
    el.innerHTML = bar('Recall', esc(ev.name), 'Submit');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      session.recallTime = timer.elapsed();
      const answers = r.answers();
      results(session, answers);
    };
    const timer = startTimer(cfg.recallTime, () => { toast('Time’s up!'); finish(); });
    $('#phaseBtn', el).onclick = finish;
    const r = ev.recall($('#stage', el), data, cfg);
    if (r.cleanup) cleanups.push(r.cleanup);
    window.scrollTo(0, 0);
  }

  function results(session, answers) {
    clean();
    const { cfg, level, data } = session;
    const { rows, mode } = ev.check(data, answers, cfg);
    const strict = settings().strict;
    const s = scoreRows(rows, { strict, mode });
    const prevBest = bestResult(ev.id);
    const result = {
      id: uid(), event: ev.id, level, date: new Date().toISOString(),
      score: s.score, raw: s.raw, total: s.total, accuracy: s.accuracy, strict,
      memTime: Math.round(session.memTime * 10) / 10, recallTime: Math.round(session.recallTime * 10) / 10,
      memLimit: cfg.memTime ?? null, recallLimit: cfg.recallTime, label: level >= 0 ? ev.levels[level].label : 'Custom',
    };
    addResult(result);
    const newLevel = checkUnlock(ev.id, level, ev.levels.length - 1);
    const isPB = s.score > 0 && (!prevBest || s.score > prevBest.score);

    el.innerHTML = `
      <div class="crumbs"><a href="#/events">← Events</a></div>
      <div class="stack">
        ${newLevel ? `<div class="callout"><p><b>🎉 Level ${level + 2} unlocked!</b> ${esc(ev.levels[level + 1].label)}. Great work. Consolidate at this level a few more times, or step up.</p></div>` : ''}
        ${isPB ? `<div class="callout warn"><p><b>🏆 New personal best</b> for ${esc(ev.name)}!</p></div>` : ''}
        <section class="card">
          <div class="row between"><h1 class="mb0">${esc(ev.name)}</h1><span class="badge ${level >= 0 ? 'accent' : 'warn'}">${level >= 0 ? `Level ${level + 1} · ${esc(result.label)}` : 'Custom'}</span></div>
          <div class="score-hero" style="margin-top:14px">
            <div class="stat"><span class="value">${s.score}<span class="muted" style="font-size:1.2rem"> / ${s.total}</span></span><span class="label">${strict ? 'championship score' : 'score'}</span></div>
            <div class="stat"><span class="value">${pct(s.accuracy)}</span><span class="label">accuracy</span></div>
            <div class="stat"><span class="value">${fmtDuration(session.memTime)}</span><span class="label">memorizing</span></div>
            <div class="stat"><span class="value">${fmtDuration(session.recallTime)}</span><span class="label">recall</span></div>
          </div>
          <p class="muted mb0">${feedback(s.accuracy, level)}</p>
        </section>
        <section class="card">
          <h2>Correct vs. yours</h2>
          <p class="small muted">Green = right, red = wrong or missing. Look for patterns: the same image failing twice usually means it needs replacing.</p>
          ${comparisonHTML(rows)}
        </section>
        <div class="btn-row">
          <button class="btn primary" id="again">Go again</button>
          ${newLevel ? `<button class="btn" id="next">Try level ${level + 2}</button>` : ''}
          <button class="btn" id="settings">Change settings</button>
          <a class="btn ghost" href="#/progress/${ev.id}">Progress</a>
        </div>
      </div>`;
    $('#again', el).onclick = () => start({ ...cfg }, level);
    $('#settings', el).onclick = () => setup(level >= 0 ? level : null, level >= 0 ? null : cfg);
    const nx = $('#next', el);
    if (nx) nx.onclick = () => setup(level + 1);
    window.scrollTo(0, 0);
  }

  function feedback(acc, level) {
    if (acc >= 0.9) return level >= 0 ? 'Excellent. Two of these in your last three attempts unlocks the next level.' : 'Excellent. Try a level for it to count towards unlocking.';
    if (acc >= 0.7) return 'Good. Find the spots where errors cluster: was it a weak image, or a locus you rushed?';
    if (acc >= 0.4) return 'Getting there. Slow down during memorization and make each image more vivid. Accuracy first, speed later.';
    return 'Tough round. Consider an easier level, more memorization time, or drilling your images in the Trainers first.';
  }

  setup();
  return clean;
}
