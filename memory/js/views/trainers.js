// Image-system trainers: spaced-repetition flashcards and a timed speed drill.
import { NUMBERS, majorImage } from '../data/major.js';
import { paoFor } from '../data/pao.js';
import { DECK, SUITS, cardHTML, cardImage, cardPaoFor, cardInfo } from '../data/cards.js';
import { deckStatus, grade, schedule, GRADES, intervalLabel } from '../lib/srs.js';
import { db, update, settings, logActivity } from '../storage.js';
import { esc, shuffle, toast, fmtDuration, fmtDate, $, $$ } from '../utils.js';

const DECKS = {
  numbers: {
    title: 'Numbers 00–99',
    ids: NUMBERS.map((n) => `num:${n}`),
    key: (id) => id.slice(4),
    front: (k) => `<div class="front">${k}</div>`,
    back: (k) => settings().numberMode === 'pao' ? paoHTML(paoFor(k)) : `<div class="back">${esc(majorImage(k))}</div>`,
    editLink: () => (settings().numberMode === 'pao' ? '#/learn/systems/pao' : '#/learn/systems/major'),
    modeSetting: 'numberMode',
    modes: [['major', 'Major image'], ['pao', 'PAO']],
    ranges: [['all', 'All 00–99'], ...Array.from({ length: 10 }, (_, i) => [`r${i}`, `${i}0–${i}9`])],
    inRange: (k, r) => r === 'all' || k[0] === r.slice(1),
  },
  cards: {
    title: 'Playing cards',
    ids: DECK.map((c) => `card:${c}`),
    key: (id) => id.slice(5),
    front: (k) => cardHTML(k, { size: 'lg' }),
    back: (k) => settings().cardMode === 'pao' ? paoHTML(cardPaoFor(k)) : `<div class="back">${esc(cardImage(k))}</div>`,
    editLink: () => (settings().cardMode === 'pao' ? '#/learn/systems/cardPao' : '#/learn/systems/cards'),
    modeSetting: 'cardMode',
    modes: [['image', 'Card image'], ['pao', 'PAO']],
    ranges: [['all', 'Full deck'], ...SUITS.map((s) => [s.id, `${s.sym} ${s.name}`])],
    inRange: (k, r) => r === 'all' || k.endsWith(r),
  },
};

const paoHTML = (x) => `<div class="pao"><b>Person</b><span>${esc(x.p)}</span><b>Action</b><span>${esc(x.a)}</span><b>Object</b><span>${esc(x.o)}</span></div>`;

export function render(el, params) {
  const deck = DECKS[params[0]];
  if (!deck) return renderHome(el);
  if (params[1] === 'drill') return renderDrill(el, params[0], deck);
  return renderStudy(el, params[0], deck);
}

/* ---------- Overview ---------- */
function renderHome(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Image Trainers</h1><p>Make every image instant. Flashcards use spaced repetition: cards you know come back rarely, shaky ones come back soon.</p></div>
    <div class="grid cols-2">${Object.entries(DECKS).map(([id, d]) => deckCard(id, d)).join('')}</div>
    <div class="callout" style="margin-top:16px"><p><b>Two kinds of practice.</b> <i>Study</i> builds long-term memory of each image: do it daily, it takes 5–10 minutes. <i>Speed drill</i> times how fast images come to mind. Competitors aim for under 1 second per item.</p></div>`;
  $$('select[data-mode]', el).forEach((s) => {
    s.onchange = () => { update((d) => { d.settings[s.dataset.mode] = s.value; }); toast('Saved'); };
  });
}

function deckCard(id, d) {
  const st = deckStatus(d.ids);
  const todo = st.due.length + st.fresh.length;
  const drills = (db().drills?.[id] || []).slice(-1)[0];
  return `<div class="card">
    <h2>${d.title}</h2>
    <div class="grid cols-4" style="gap:10px;margin-bottom:14px">
      <div class="stat"><span class="value">${st.due.length}</span><span class="label">due</span></div>
      <div class="stat"><span class="value">${st.fresh.length}</span><span class="label">new today</span></div>
      <div class="stat"><span class="value">${st.learned}</span><span class="label">learned / ${st.total}</span></div>
      <div class="stat"><span class="value">${st.mature}</span><span class="label">mature</span></div>
    </div>
    <div class="progress" title="${st.learned} of ${st.total} learned"><span style="width:${(st.learned / st.total) * 100}%"></span></div>
    <div class="field" style="margin:14px 0">
      <label for="mode-${id}">Answer side shows</label>
      <select id="mode-${id}" data-mode="${d.modeSetting}">${d.modes.map(([v, l]) => `<option value="${v}" ${settings()[d.modeSetting] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="btn-row">
      <a class="btn primary" href="#/train/${id}">${todo ? `Study (${todo})` : 'All done today ✓'}</a>
      <a class="btn" href="#/train/${id}/drill">Speed drill</a>
      <a class="btn ghost" href="${d.editLink()}">Edit images</a>
    </div>
    ${drills ? `<p class="small muted" style="margin-top:10px">Last drill ${fmtDate(drills.date)}: ${drills.n} items, ${drills.avg.toFixed(2)}s each</p>` : ''}
  </div>`;
}

/* ---------- Study session ---------- */
function renderStudy(el, deckId, deck) {
  const st = deckStatus(deck.ids);
  // Interleave new cards among the reviews so a session isn't front-loaded.
  const queue = [...st.due];
  st.fresh.forEach((id, i) => queue.splice(Math.min(queue.length, i * 3 + 1), 0, id));
  const total = queue.length;
  let reviewed = 0;
  let again = 0;
  let shownAt = 0;
  let revealed = false;
  let current = null;
  const times = [];

  const head = `<div class="crumbs"><a href="#/train">← Trainers</a></div>`;

  if (!queue.length) {
    el.innerHTML = `${head}<div class="card center"><h1>Nothing due 🎉</h1><p class="muted">You’ve finished today’s ${deck.title.toLowerCase()} reviews. Try a speed drill, or raise “new flashcards per day” in Settings.</p>
      <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/train/${deckId}/drill">Speed drill</a><a class="btn" href="#/train">Back</a></div></div>`;
    return;
  }

  const draw = () => {
    if (!queue.length) return finish();
    current = queue[0];
    const k = deck.key(current);
    const isNew = !db().srs[current];
    el.innerHTML = `${head}
      <div class="card">
        <div class="row between small muted"><span>${deck.title}</span><span>${queue.length} left${isNew ? ' · <span class="badge accent">new</span>' : ''}</span></div>
        <div class="progress" style="margin:10px 0"><span style="width:${(reviewed / (total + again)) * 100}%"></span></div>
        <div class="flash">
          ${deck.front(k)}
          <div id="answer">${revealed ? deck.back(k) : '<p class="muted">Picture your image, then reveal.</p>'}</div>
          ${revealed && times.length ? `<p class="small muted mb0">${times.at(-1).toFixed(1)}s to reveal</p>` : ''}
        </div>
        <div id="controls">${revealed ? gradeButtons(current) : '<button class="btn primary big block" id="show">Show answer <kbd>Space</kbd></button>'}</div>
      </div>
      <p class="small muted center" style="margin-top:12px">Shortcuts: <kbd>Space</kbd> reveal · <kbd>1</kbd>–<kbd>4</kbd> grade · <a href="${deck.editLink()}">edit images</a></p>`;
    if (!revealed) {
      shownAt = performance.now();
      $('#show', el).onclick = reveal;
    } else {
      $$('[data-grade]', el).forEach((b) => (b.onclick = () => doGrade(b.dataset.grade)));
    }
  };

  const gradeButtons = (id) => `<div class="grade-row">${GRADES.map((g) => {
    const days = schedule(db().srs[id], g.key).interval;
    return `<button class="btn ${g.key}" data-grade="${g.key}">${g.label}<small>${intervalLabel(days)} · ${g.hotkey}</small></button>`;
  }).join('')}</div>`;

  const reveal = () => {
    times.push((performance.now() - shownAt) / 1000);
    revealed = true;
    draw();
  };

  const doGrade = (g) => {
    const id = queue.shift();
    grade(id, g);
    reviewed++;
    if (g === 'again') { again++; queue.splice(Math.min(queue.length, 3), 0, id); }
    revealed = false;
    draw();
  };

  const finish = () => {
    logActivity('srs', reviewed);
    const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
    el.innerHTML = `${head}<div class="card center">
      <h1>Session complete</h1>
      <div class="row" style="justify-content:center;gap:32px;margin:12px 0 20px">
        <div class="stat"><span class="value">${total}</span><span class="label">cards</span></div>
        <div class="stat"><span class="value">${again}</span><span class="label">“again” presses</span></div>
        <div class="stat"><span class="value">${avg.toFixed(1)}s</span><span class="label">avg to reveal</span></div>
      </div>
      <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/">Dashboard</a><a class="btn" href="#/train/${deckId}/drill">Speed drill</a></div>
    </div>`;
    current = null;
  };

  const onKey = (e) => {
    if (!current || e.target.closest('input, select, textarea')) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed) {
      const g = GRADES.find((x) => x.hotkey === e.key);
      if (g) doGrade(g.key);
      else if (e.key === ' ') { e.preventDefault(); doGrade('good'); }
    }
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}

/* ---------- Speed drill ---------- */
function renderDrill(el, deckId, deck) {
  const head = `<div class="crumbs"><a href="#/train">← Trainers</a></div>`;
  let items = [];
  let i = 0;
  let t0 = 0;
  let tItem = 0;
  let revealed = false;
  let running = false;
  let showAns = false;
  const log = [];

  el.innerHTML = `${head}
    <div class="page-head"><h1>Speed drill: ${deck.title}</h1><p>See the item, picture your image, and press <kbd>Space</kbd> (or tap) the moment it appears. Press <kbd>X</kbd> if it didn’t come.</p></div>
    <div class="card">
      <div class="form-grid">
        <div class="field"><label for="range">Items</label><select id="range">${deck.ranges.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" id="showAns"> Flash the answer after each item</label></div>
      </div>
      <button class="btn primary big" id="go" style="margin-top:14px">Start drill</button>
    </div>`;

  $('#go', el).onclick = () => {
    const r = $('#range', el).value;
    showAns = $('#showAns', el).checked;
    items = shuffle(deck.ids.map(deck.key).filter((k) => deck.inRange(k, r)));
    i = 0;
    running = true;
    t0 = performance.now();
    step();
  };

  function step() {
    if (i >= items.length) return finish();
    const k = items[i];
    revealed = false;
    tItem = performance.now();
    el.innerHTML = `${head}
      <div class="card">
        <div class="row between small muted"><span>${i + 1} / ${items.length}</span><span id="clock">0s</span></div>
        <div class="flash" id="tap" style="cursor:pointer">${deck.front(k)}<div id="answer" style="min-height:2.4em"></div></div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn" id="miss">Didn’t come <kbd>X</kbd></button>
          <button class="btn primary big" id="next">Got it <kbd>Space</kbd></button>
        </div>
      </div>`;
    $('#next', el).onclick = () => advance(true);
    $('#tap', el).onclick = () => advance(true);
    $('#miss', el).onclick = () => advance(false);
  }

  function advance(ok) {
    if (!running || revealed) return;
    const k = items[i];
    log.push({ k, sec: (performance.now() - tItem) / 1000, ok });
    if (showAns || !ok) {
      revealed = true;
      $('#answer', el).innerHTML = deck.back(k);
      setTimeout(() => { if (running) { i++; step(); } }, ok ? 600 : 1500);
    } else {
      i++;
      step();
    }
  }

  function finish() {
    running = false;
    const totalSec = (performance.now() - t0) / 1000;
    const avg = log.reduce((a, b) => a + b.sec, 0) / log.length;
    const misses = log.filter((x) => !x.ok);
    const slow = [...log].filter((x) => x.ok).sort((a, b) => b.sec - a.sec).slice(0, 8);
    update((d) => {
      d.drills ||= {};
      (d.drills[deckId] ||= []).push({ date: new Date().toISOString(), n: log.length, avg, misses: misses.length });
    });
    logActivity('srs', 0);
    const label = (k) => (deckId === 'cards' ? cardInfo(k).name : k);
    el.innerHTML = `${head}
      <div class="card">
        <h1>Drill complete</h1>
        <div class="row" style="gap:32px;margin:8px 0 20px">
          <div class="stat"><span class="value">${log.length}</span><span class="label">items</span></div>
          <div class="stat"><span class="value">${avg.toFixed(2)}s</span><span class="label">average per item</span></div>
          <div class="stat"><span class="value">${fmtDuration(totalSec)}</span><span class="label">total time</span></div>
          <div class="stat"><span class="value">${misses.length}</span><span class="label">didn’t come</span></div>
        </div>
        ${misses.length ? `<h3>Didn’t come: drill these, or choose a more vivid image</h3>
          <div class="ref-grid" style="margin-bottom:16px">${misses.map((x) => `<div><b>${esc(label(x.k))}</b> ${deck.back(x.k).replace(/<[^>]+>/g, ' ')}</div>`).join('')}</div>` : ''}
        ${slow.length ? `<h3>Slowest</h3>
          <div class="ref-grid" style="margin-bottom:16px">${slow.map((x) => `<div><b>${esc(label(x.k))}</b> ${x.sec.toFixed(1)}s</div>`).join('')}</div>` : ''}
        <div class="btn-row"><a class="btn primary" href="#/train/${deckId}/drill" id="again">Drill again</a><a class="btn" href="${deck.editLink()}">Edit images</a></div>
      </div>`;
    $('#again', el).onclick = (e) => { e.preventDefault(); log.length = 0; renderDrill(el, deckId, deck); };
  }

  const tick = setInterval(() => {
    const c = $('#clock', el);
    if (c && running) c.textContent = `${Math.floor((performance.now() - t0) / 1000)}s`;
  }, 500);
  const onKey = (e) => {
    if (!running || e.target.closest('input, select, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(true); }
    if (e.key === 'x' || e.key === 'X') advance(false);
  };
  document.addEventListener('keydown', onKey);
  return () => { clearInterval(tick); document.removeEventListener('keydown', onKey); running = false; };
}
