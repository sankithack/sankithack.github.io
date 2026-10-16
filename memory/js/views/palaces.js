// Memory Palace Builder: create palaces, order loci, and practise walking them.
import { db, update, uid, logActivity } from '../storage.js';
import { esc, toast, shuffle, norm, fmtDate, pct, $, $$ } from '../utils.js';

const SAMPLE = {
  name: 'My home (sample)',
  loci: ['Front door', 'Doormat', 'Coat hook', 'Hallway mirror', 'Bathroom sink', 'Bathtub', 'Kitchen door', 'Fridge', 'Stove', 'Kitchen sink',
    'Dining table', 'Window', 'Sofa', 'Television', 'Bookshelf', 'Stairs', 'Bedroom door', 'Bed', 'Wardrobe', 'Desk'],
};

const findPalace = (id) => db().palaces.find((p) => p.id === id);

export function render(el, params) {
  if (!params.length) return renderList(el);
  const palace = findPalace(params[0]);
  if (!palace) {
    el.innerHTML = `<div class="card"><h1>Palace not found</h1><a href="#/palaces">All palaces</a></div>`;
    return;
  }
  if (params[1] === 'practice') return renderPractice(el, palace, params[2]);
  return renderEdit(el, palace);
}

/* ---------- List ---------- */
function renderList(el) {
  const palaces = db().palaces;
  const total = palaces.reduce((n, p) => n + p.loci.length, 0);
  el.innerHTML = `
    <div class="page-head"><h1>Memory Palaces</h1><p>Your palaces and their loci, in walking order. ${total ? `You own <b>${total}</b> loci.` : ''}</p></div>
    <div class="stack">
      <form class="card row" id="newForm">
        <div class="field" style="flex:1;min-width:200px">
          <label for="pname">New palace</label>
          <input id="pname" type="text" placeholder="e.g. Grandma’s house, My street, Office" required maxlength="80">
        </div>
        <button class="btn primary" type="submit" style="align-self:flex-end">Create</button>
      </form>
      ${palaces.length ? `<div class="grid cols-2">${palaces.map(cardHTML).join('')}</div>` : `
        <div class="card soft center">
          <h2>No palaces yet</h2>
          <p class="muted">Start with a place you know very well, like your home. Need inspiration? Load a sample route and rename the loci to match your own rooms.</p>
          <button class="btn" id="sample">Add sample home palace</button>
        </div>`}
      <div class="callout"><p><b>How many loci do you need?</b> 10 for your first week. A full deck of cards needs 26 loci (2 cards each). 100 digits need 25 loci (4 digits each). Keep adding palaces as you progress.</p></div>
    </div>`;

  $('#newForm', el).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pname', el).value.trim();
    if (!name) return;
    const p = { id: uid(), name, loci: [], created: new Date().toISOString(), practice: [] };
    update((d) => d.palaces.push(p));
    location.hash = `#/palaces/${p.id}`;
  };
  const sample = $('#sample', el);
  if (sample) sample.onclick = () => {
    const p = { id: uid(), name: SAMPLE.name, loci: [...SAMPLE.loci], created: new Date().toISOString(), practice: [] };
    update((d) => d.palaces.push(p));
    location.hash = `#/palaces/${p.id}`;
  };
}

function cardHTML(p) {
  const last = p.practice.at(-1);
  return `<div class="card">
    <div class="row between"><h2 class="mb0">${esc(p.name)}</h2><span class="badge accent">${p.loci.length} loci</span></div>
    <p class="small muted" style="margin-top:6px">${p.loci.slice(0, 5).map(esc).join(' → ')}${p.loci.length > 5 ? ' → …' : ''}</p>
    <p class="small">${last ? `Last practised ${fmtDate(last.date)}: <b>${pct(last.correct / last.total)}</b>` : '<span class="muted">Not practised yet</span>'}</p>
    <div class="btn-row">
      <a class="btn small" href="#/palaces/${p.id}">Edit</a>
      <a class="btn small primary ${p.loci.length < 2 ? 'hidden' : ''}" href="#/palaces/${p.id}/practice">Practise</a>
    </div>
  </div>`;
}

/* ---------- Edit ---------- */
function renderEdit(el, palace) {
  el.innerHTML = `
    <div class="crumbs"><a href="#/palaces">← Palaces</a></div>
    <div class="stack">
      <div class="card">
        <div class="field"><label for="name">Palace name</label><input id="name" type="text" value="${esc(palace.name)}" maxlength="80"></div>
      </div>
      <div class="card">
        <div class="row between"><h2 class="mb0">Loci <span class="badge accent" id="count">${palace.loci.length}</span></h2>
          <a class="btn primary small ${palace.loci.length < 2 ? 'hidden' : ''}" id="practise" href="#/palaces/${palace.id}/practice">Practise →</a></div>
        <p class="small muted">In walking order. Use ↑ ↓ to reorder. Choose distinct spots that differ in shape and position.</p>
        <ol class="loci-list" id="loci"></ol>
        <form class="row" id="addForm" style="margin-top:12px">
          <input id="newLocus" type="text" placeholder="Next locus, e.g. Kitchen sink" style="flex:1;min-width:180px" maxlength="80">
          <button class="btn" type="submit">Add</button>
        </form>
        <details style="margin-top:14px">
          <summary class="small">Add many at once</summary>
          <div class="field" style="margin-top:8px">
            <textarea id="bulk" placeholder="One locus per line"></textarea>
            <button class="btn small" id="bulkAdd" type="button" style="align-self:flex-start">Add lines</button>
          </div>
        </details>
      </div>
      <div class="row between">
        <span></span>
        <button class="btn danger small" id="delete">Delete palace</button>
      </div>
    </div>`;

  const list = $('#loci', el);
  const save = (fn) => { update(() => fn(palace)); drawLoci(); };

  function drawLoci() {
    list.innerHTML = palace.loci.map((l, i) => `
      <li data-i="${i}">
        <span class="n">${i + 1}</span>
        <input type="text" value="${esc(l)}" aria-label="Locus ${i + 1}" maxlength="80">
        <button class="btn ghost" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="btn ghost" data-act="down" ${i === palace.loci.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="btn ghost danger" data-act="del" aria-label="Delete">✕</button>
      </li>`).join('') || '<li class="muted small">No loci yet. Add your first one below.</li>';
    $('#count', el).textContent = palace.loci.length;
    $('#practise', el).classList.toggle('hidden', palace.loci.length < 2);
  }
  drawLoci();

  $('#name', el).onchange = (e) => {
    const v = e.target.value.trim();
    if (v) { update(() => { palace.name = v; }); toast('Saved'); }
  };

  list.addEventListener('change', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || e.target.tagName !== 'INPUT') return;
    const v = e.target.value.trim();
    const i = Number(li.dataset.i);
    if (!v) { e.target.value = palace.loci[i]; return; }
    update(() => { palace.loci[i] = v; });
    toast('Saved');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('li').dataset.i);
    const act = btn.dataset.act;
    if (act === 'del' && !confirm(`Delete locus “${palace.loci[i]}”?`)) return;
    save((p) => {
      if (act === 'up') [p.loci[i - 1], p.loci[i]] = [p.loci[i], p.loci[i - 1]];
      if (act === 'down') [p.loci[i + 1], p.loci[i]] = [p.loci[i], p.loci[i + 1]];
      if (act === 'del') p.loci.splice(i, 1);
    });
    const target = act === 'up' ? i - 1 : act === 'down' ? i + 1 : -1;
    if (target >= 0) $(`li[data-i="${target}"] button[data-act="${act}"]`, list)?.focus();
  });

  $('#addForm', el).onsubmit = (e) => {
    e.preventDefault();
    const input = $('#newLocus', el);
    const v = input.value.trim();
    if (!v) return;
    save((p) => p.loci.push(v));
    input.value = '';
    input.focus();
  };

  $('#bulkAdd', el).onclick = () => {
    const lines = $('#bulk', el).value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    save((p) => p.loci.push(...lines));
    $('#bulk', el).value = '';
    toast(`Added ${lines.length} loci`);
  };

  $('#delete', el).onclick = () => {
    if (!confirm(`Delete the palace “${palace.name}” and all its loci?`)) return;
    update((d) => { d.palaces = d.palaces.filter((p) => p.id !== palace.id); });
    location.hash = '#/palaces';
  };
}

/* ---------- Practice ---------- */
function renderPractice(el, palace, mode) {
  if (palace.loci.length < 2) { location.hash = `#/palaces/${palace.id}`; return; }
  const modes = [
    ['walk', 'Walk-through', 'Go station by station. Try to name each locus before revealing it.'],
    ['quiz', 'Random quiz', 'Random questions: “What is locus 7?” and “What number is the Sofa?”'],
    ['recall', 'Full recall', 'Write every locus in order from memory, then see the comparison.'],
  ];
  if (!mode) {
    el.innerHTML = `
      <div class="crumbs"><a href="#/palaces/${palace.id}">← ${esc(palace.name)}</a></div>
      <div class="page-head"><h1>Practise: ${esc(palace.name)}</h1><p>${palace.loci.length} loci. Fluency here makes every event faster.</p></div>
      <div class="grid cols-3">
        ${modes.map(([id, t, d]) => `<a class="card link" href="#/palaces/${palace.id}/practice/${id}"><h2>${t}</h2><p class="muted mb0">${d}</p></a>`).join('')}
      </div>
      ${palace.practice.length ? `<h2 style="margin-top:24px">History</h2><div class="card table-wrap"><table><thead><tr><th>Date</th><th>Mode</th><th class="num">Score</th></tr></thead><tbody>
        ${palace.practice.slice(-10).reverse().map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.mode || '')}</td><td class="num">${r.correct}/${r.total} (${pct(r.correct / r.total)})</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    return;
  }
  const head = `<div class="crumbs"><a href="#/palaces/${palace.id}/practice">← Practice modes</a></div>`;
  const finish = (correct, total, modeName) => {
    update(() => palace.practice.push({ date: new Date().toISOString(), correct, total, mode: modeName }));
    logActivity('palace');
  };
  if (mode === 'walk') return walk(el, palace, head, finish);
  if (mode === 'quiz') return quiz(el, palace, head, finish);
  if (mode === 'recall') return fullRecall(el, palace, head, finish);
  location.hash = `#/palaces/${palace.id}/practice`;
}

function walk(el, palace, head, finish) {
  let i = 0;
  let revealed = false;
  let correct = 0;
  const n = palace.loci.length;
  const draw = () => {
    if (i >= n) {
      finish(correct, n, 'walk');
      el.innerHTML = `${head}<div class="card center"><h1>Walk complete</h1><p class="stat"><span class="value">${correct} / ${n}</span><span class="label">loci named before reveal</span></p>
        <div class="btn-row" style="justify-content:center"><a class="btn primary" href="#/palaces/${palace.id}/practice/walk" id="again">Walk again</a><a class="btn" href="#/palaces/${palace.id}/practice/quiz">Random quiz</a></div></div>`;
      $('#again', el).onclick = (e) => { e.preventDefault(); i = 0; correct = 0; revealed = false; draw(); };
      return;
    }
    el.innerHTML = `${head}
      <div class="card walk">
        <div class="progress" style="margin-bottom:16px"><span style="width:${(i / n) * 100}%"></span></div>
        <div class="num">Locus ${i + 1} of ${n}</div>
        <div class="locus">${revealed ? esc(palace.loci[i]) : '?'}</div>
        <p class="muted small">${i > 0 ? `After: ${esc(palace.loci[i - 1])}` : 'The start of your route'}</p>
        <div class="btn-row" style="justify-content:center">
          ${revealed
            ? `<button class="btn" data-g="0">Missed it</button><button class="btn primary" data-g="1">I knew it</button>`
            : `<button class="btn primary big" data-g="reveal">Reveal <kbd>Space</kbd></button>`}
        </div>
      </div>`;
    $$('button[data-g]', el).forEach((b) => (b.onclick = () => act(b.dataset.g)));
  };
  const act = (g) => {
    if (g === 'reveal') { revealed = true; return draw(); }
    if (g === '1') correct++;
    i++;
    revealed = false;
    draw();
  };
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ' && !revealed && i < n) { e.preventDefault(); act('reveal'); }
    else if (revealed && (e.key === '1' || e.key === 'ArrowRight' || e.key === 'Enter')) act('1');
    else if (revealed && (e.key === '0' || e.key === 'ArrowLeft')) act('0');
  };
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}

// Lenient match for locus names: exact, contained, or a small typo.
function similar(a, b) {
  a = norm(a); b = norm(b);
  if (!a) return false;
  if (a === b || (a.length >= 3 && (b.includes(a) || a.includes(b)))) return true;
  return editDistance(a, b) <= Math.max(1, Math.floor(b.length / 6));
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function quiz(el, palace, head, finish) {
  const n = palace.loci.length;
  const count = Math.min(10, n);
  const qs = shuffle(palace.loci.map((l, i) => i)).slice(0, count).map((i) => ({ i, dir: Math.random() < 0.5 ? 'name' : 'number' }));
  let q = 0;
  let correct = 0;
  const draw = (feedback = '') => {
    if (q >= qs.length) {
      finish(correct, qs.length, 'quiz');
      el.innerHTML = `${head}<div class="card center"><h1>Quiz complete</h1><p class="stat"><span class="value">${correct} / ${qs.length}</span><span class="label">correct</span></p>
        <div class="btn-row" style="justify-content:center"><button class="btn primary" id="again">New quiz</button><a class="btn" href="#/palaces/${palace.id}/practice/recall">Full recall</a></div></div>`;
      $('#again', el).onclick = () => quiz(el, palace, head, finish);
      return;
    }
    const { i, dir } = qs[q];
    el.innerHTML = `${head}
      <div class="card walk">
        <div class="progress" style="margin-bottom:16px"><span style="width:${(q / qs.length) * 100}%"></span></div>
        <div class="num">Question ${q + 1} of ${qs.length}</div>
        <div class="locus">${dir === 'name' ? `What is locus #${i + 1}?` : `Which number is “${esc(palace.loci[i])}”?`}</div>
        <form class="row" style="justify-content:center;margin-top:12px" autocomplete="off">
          <input id="ans" type="${dir === 'name' ? 'text' : 'number'}" inputmode="${dir === 'name' ? 'text' : 'numeric'}" style="max-width:260px" required aria-label="Your answer">
          <button class="btn primary" type="submit">Check</button>
        </form>
        <p style="min-height:1.6em;margin-top:12px">${feedback}</p>
      </div>`;
    $('#ans', el).focus();
    $('form', el).onsubmit = (e) => {
      e.preventDefault();
      const v = $('#ans', el).value;
      const ok = dir === 'name' ? similar(v, palace.loci[i]) : Number(v) === i + 1;
      if (ok) correct++;
      const fb = ok
        ? `<span class="badge ok">✓ Correct</span> ${dir === 'name' ? esc(palace.loci[i]) : `#${i + 1}`}`
        : `<span class="badge bad">✗</span> It was <b>${dir === 'name' ? esc(palace.loci[i]) : `#${i + 1}`}</b>`;
      q++;
      draw(fb);
    };
  };
  draw();
}

function fullRecall(el, palace, head, finish) {
  const n = palace.loci.length;
  el.innerHTML = `${head}
    <div class="card">
      <h2>Write your ${n} loci in order</h2>
      <form class="recall-rows" autocomplete="off">
        ${palace.loci.map((_, i) => `<div class="recall-row"><span class="rowno">${i + 1}.</span><input type="text" data-i="${i}" aria-label="Locus ${i + 1}"></div>`).join('')}
        <div class="btn-row"><button class="btn primary" type="submit">Check</button></div>
      </form>
    </div>`;
  $('input', el).focus();
  $('form', el).onsubmit = (e) => {
    e.preventDefault();
    let correct = 0;
    const rows = palace.loci.map((l, i) => {
      const g = $(`input[data-i="${i}"]`, el).value;
      const ok = similar(g, l);
      if (ok) correct++;
      return `<div class="cmp-row"><span class="lbl">#${i + 1}</span>
        <div class="cmp-line"><span class="tag">locus</span><span class="cmp-cell text">${esc(l)}</span></div>
        <div class="cmp-line"><span class="tag">yours</span><span class="cmp-cell text ${ok ? 'ok' : g ? 'bad' : 'bad empty'}">${esc(g) || '—'}</span></div></div>`;
    });
    finish(correct, n, 'recall');
    el.innerHTML = `${head}
      <div class="card">
        <div class="score-hero"><div class="stat"><span class="value">${correct} / ${n}</span><span class="label">loci in the right place</span></div></div>
        <div class="cmp">${rows.join('')}</div>
        <div class="btn-row" style="margin-top:16px"><a class="btn primary" href="#/palaces/${palace.id}/practice">Practice modes</a><a class="btn" href="#/palaces/${palace.id}">Edit palace</a></div>
      </div>`;
  };
}
