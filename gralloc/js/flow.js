/*
 * flow.js — Code flow as an execution viewer.
 *
 * Shows each function's real source (extracted by tools/extract.py) and "executes" it:
 * a red execution bar moves through annotated stops; at a call it pushes a stack frame and
 * opens the callee, returning pops frames. Buffer state and the process lane update alongside.
 * Stop lines are resolved from source; the notes on them are hand-written.
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src } = G;
  // Two implementations share the viewer: gchips (default) and the Arm r56p0 reference gralloc.
  const IMPLS = { gchips: { CF: G.CF, FJ: G.flowJourney, name: 'gchips' } };
  if (G.ARM && G.flowJourneyArm) IMPLS.arm = { CF: G.ARM.callflow, FJ: G.flowJourneyArm, name: 'Arm r56p0' };
  let CF = G.CF, FJ = G.flowJourney;
  const STATE_NAMES = ['handle', 'fds', 'ref_count', 'mapped', 'locked_ref_count', 'CPU flags'];
  const PHASES = [['allocate', 'Allocate'], ['import', 'Import'], ['lock', 'Lock'], ['unlock', 'Unlock'], ['free', 'Free']];
  const SPEEDS = { slow: 2300, normal: 1400, fast: 700 };
  const step = (id) => CF.steps.find((s) => s.id === id);

  const fs = { impl: 'gchips', phase: 'allocate', pos: 0, playing: null, speed: 'normal', shownStep: null, prevStack: [] };
  function useImpl(k) {
    const d = IMPLS[k] || IMPLS.gchips;
    if (fs.impl !== (IMPLS[k] ? k : 'gchips')) { fs.phase = 'allocate'; fs.pos = 0; }
    fs.impl = IMPLS[k] ? k : 'gchips';
    CF = d.CF; FJ = d.FJ;
  }

  // Execution plan for a phase: entry of each function (k = -1) then each of its stops.
  function plan(phase) {
    const out = [];
    for (const id of CF.paths[phase]) {
      out.push({ id, k: -1 });
      step(id).stops.forEach((_, k) => out.push({ id, k }));
    }
    return out;
  }
  // Call stack at a position: push a function when it is called by the frame on top, otherwise unwind.
  function stackAt(phase, pos) {
    const pl = plan(phase), st = [];
    let last = null;
    for (let i = 0; i <= pos; i++) {
      const id = pl[i].id;
      if (id === last) continue;
      last = id;
      while (st.length && !step(st[st.length - 1]).next.includes(id)) st.pop();
      st.push(id);
    }
    return st;
  }

  /* --- syntax colouring (escaped text in, HTML out) --- */
  const KW = /\b(if|else|for|while|switch|case|default|return|break|continue|const|static|auto|struct|class|bool|int|void|uint8_t|uint16_t|uint32_t|uint64_t|int32_t|int64_t|size_t|nullptr|true|false|new|delete|sizeof|template|typename|using|namespace)\b/g;
  function colour(line, inBlock) {
    const t = line.trim();
    if (inBlock.v || t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) {
      if (t.startsWith('/*') && !t.includes('*/')) inBlock.v = true;
      if (inBlock.v && t.includes('*/')) inBlock.v = false;
      return `<span class="c-com">${esc(line)}</span>`;
    }
    let h = esc(line);
    const cut = h.indexOf('//');
    let tail = '';
    if (cut >= 0 && !/https?:$/.test(h.slice(0, cut))) { tail = `<span class="c-com">${h.slice(cut)}</span>`; h = h.slice(0, cut); }
    // keywords only outside string literals, so markup inserted for strings is never touched
    h = h.split(/(&quot;.*?&quot;)/g).map((part, i) => (i % 2 ? `<span class="c-str">${part}</span>` : part.replace(KW, '<span class="c-kw">$1</span>'))).join('');
    return h + tail;
  }

  function codeHtml(s) {
    const lines = s.code.split('\n'), first = s.code_loc.line, inBlock = { v: false };
    const stops = new Map(s.stops.map((t, k) => [t.line, { t, k }]));
    return lines.map((l, i) => {
      const n = first + i, st = stops.get(n);
      const cls = st ? (st.t.call ? 'ln stop call' : 'ln stop') : 'ln';
      return `<div class="${cls}" data-n="${n}"${st ? ` data-k="${st.k}"` : ''}><span class="gut">${n}</span><span class="mk">${st ? (st.t.call ? '↳' : '●') : ''}</span><code>${colour(l, inBlock) || ' '}</code></div>`;
    }).join('');
  }

  G.views.flow = (params) => {
    useImpl(params.get('impl') || 'gchips');
    const ph = params.get('p');
    if (ph && CF.paths[ph]) {
      fs.phase = ph;
      // legacy links (?s=index of function) and new links (?pos=)
      if (params.get('pos') != null) fs.pos = Math.max(0, Number(params.get('pos')) || 0);
      else if (params.get('s') != null) { const id = CF.paths[ph][Number(params.get('s')) || 0]; fs.pos = Math.max(0, plan(ph).findIndex((x) => x.id === id)); }
      else fs.pos = 0;
    }
    fs.shownStep = null;
    return `<h1>Code flow</h1>
      <p class="lede">${esc(FJ.INTRO || 'Watch the real gralloc code run for one buffer: allocated by the allocator service, then imported, locked, unlocked and freed by an app.')} The red bar marks the line being executed; calls open the called function.</p>
      ${IMPLS.arm ? `<div class="seg" role="tablist" aria-label="implementation" style="margin-bottom:8px">${Object.entries(IMPLS).map(([k, d]) => `<button role="tab" data-impl="${k}" aria-selected="${k === fs.impl}">${esc(d.name)}</button>`).join('')}</div>` : ''}
      <div class="flowbar">
        <div class="seg" role="tablist">${PHASES.map(([k, t]) => `<button role="tab" data-phase="${k}" aria-selected="${k === fs.phase}">${t}</button>`).join('')}</div>
        <div class="flowctl">
          <button id="fprev" aria-label="Previous step">◀</button>
          <button id="fplay" class="primary"></button>
          <button id="fnext" aria-label="Next step">▶</button>
          <label class="small">speed <select id="fspeed">${Object.keys(SPEEDS).map((k) => `<option ${k === fs.speed ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <span id="fpos" class="small muted"></span>
        </div>
      </div>
      <div class="xgrid">
        <aside class="xside">
          <section><h3>Call stack</h3><ol id="xstack" class="xstack"></ol></section>
          <section><h3>Runs in</h3><div id="xlanes" class="xlanes">${FJ.LANES.map((l, i) => `<div data-lane="${i}">${esc(l)}</div>`).join('')}<span class="xlane-hi"></span></div></section>
          <section><h3>Buffer state</h3><div id="xstate"></div></section>
        </aside>
        <section class="xmain">
          <header class="xhead" id="xhead"></header>
          <div class="xcode" id="xcode" tabindex="0" aria-label="source code"><div class="execbar" id="execbar"></div><div id="xlines"></div></div>
          <div class="xnote" id="xnote" aria-live="polite"></div>
          <details class="xall"><summary>All functions in this phase</summary><ol id="xlist" class="xlist"></ol></details>
        </section>
      </div>`;
  };

  function update(dir) {
    const pl = plan(fs.phase);
    fs.pos = Math.min(Math.max(0, fs.pos), pl.length - 1);
    const cur = pl[fs.pos], s = step(cur.id);
    const stack = stackAt(fs.phase, fs.pos);
    history.replaceState(null, '', `#/flow?${fs.impl !== 'gchips' ? 'impl=' + fs.impl + '&' : ''}p=${fs.phase}&pos=${fs.pos}`);
    G.render.lastRoute = location.hash;

    // header + code (swap with a slide when the function changes)
    const lines = document.getElementById('xlines');
    if (fs.shownStep !== s.id) {
      const goingIn = fs.prevStack.length < stack.length;
      document.getElementById('xhead').innerHTML = `<div><b class="fn">${esc(s.function || s.title)}</b><span class="muted small"> ${esc(s.title !== s.function ? s.title : '')}</span></div>
        <div class="small">${src(s.def, s.def.file + ':' + s.def.line)}${s.code_loc.end < s.def.end ? ` <span class="muted">(first ${s.code_loc.end - s.code_loc.line + 1} lines)</span>` : ''}</div>`;
      lines.className = fs.shownStep && dir ? (goingIn ? 'slide-in-r' : 'slide-in-l') : '';
      lines.innerHTML = codeHtml(s);
      fs.shownStep = s.id;
      lines.querySelectorAll('.ln.stop').forEach((el) => el.addEventListener('click', () => {
        stop(); fs.pos = pl.findIndex((x) => x.id === s.id && x.k === Number(el.dataset.k)); update(1);
      }));
    }
    // execution bar
    const line = cur.k < 0 ? s.def.line : s.stops[cur.k].line;
    const el = lines.querySelector(`.ln[data-n="${line}"]`) || lines.firstElementChild;
    lines.querySelectorAll('.ln.now').forEach((x) => x.classList.remove('now'));
    el.classList.add('now');
    const box = document.getElementById('xcode'), bar = document.getElementById('execbar');
    bar.style.top = el.offsetTop + 'px';
    bar.style.height = el.offsetHeight + 'px';
    const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });

    // annotation
    const note = document.getElementById('xnote');
    if (cur.k < 0) {
      note.innerHTML = `<div class="anno"><span class="ln-ref">${s.def.line}</span><div><b>Enter ${esc(s.function || s.title)}</b><p>${esc(s.description)}</p></div></div>`;
    } else {
      const t = s.stops[cur.k];
      const callee = t.call && step(t.call);
      note.innerHTML = `<div class="anno ${t.call ? 'is-call' : ''}"><span class="ln-ref">${t.line}</span><div><p>${esc(t.note)}</p>
        <code class="small">${esc(t.text)}</code>${callee ? `<div class="small" style="margin-top:4px">Calls <b>${esc(callee.function || callee.title)}</b> — next step opens it.</div>` : ''}
        <div class="small muted">${src({ file: s.def.file, line: t.line })}</div></div></div>`;
    }
    note.firstElementChild.classList.add('anim-in');

    // call stack
    const prev = fs.prevStack;
    document.getElementById('xstack').innerHTML = stack.slice().reverse().map((id, i) => {
      const fr = step(id), isNew = !prev.includes(id);
      return `<li class="${i === 0 ? 'top' : ''} ${isNew ? 'push' : ''}"><b>${esc(fr.function || fr.title)}</b><span class="small muted">${esc(fr.def.file.split('/').pop())}:${fr.def.line}</span></li>`;
    }).join('');
    fs.prevStack = stack;

    // lane + state
    const lane = (FJ.J[s.id] || [0])[0];
    const lanes = document.getElementById('xlanes');
    lanes.style.setProperty('--lane', lane);
    lanes.querySelectorAll('[data-lane]').forEach((d) => d.classList.toggle('on', Number(d.dataset.lane) === lane));
    const sidx = CF.paths[fs.phase].indexOf(s.id);
    const st = FJ.stateFor(fs.phase, sidx);
    const names = FJ.STATE_NAMES || STATE_NAMES;
    const old = update.lastState;
    document.getElementById('xstate').innerHTML = st ? `<table class="statetab">${names.map((n, k) => `<tr class="${old && old[k] !== st.s[k] ? 'flash' : ''}"><td>${n}</td><td>${esc(st.s[k])}</td></tr>`).join('')}</table><div class="small muted">after ${esc(step(st.id).function || step(st.id).title)} ${src(st.s[6])}</div>` : '<div class="small muted">no state change yet</div>';
    update.lastState = st ? st.s : null;

    // list + position + buttons
    document.getElementById('xlist').innerHTML = CF.paths[fs.phase].map((id) => {
      const f = step(id); const at = pl.findIndex((x) => x.id === id);
      return `<li class="${id === s.id ? 'on' : ''}"><button data-goto="${at}">${esc(f.function || f.title)}</button> <span class="small muted">${esc(f.def.file.split('/').pop())}:${f.def.line}</span></li>`;
    }).join('');
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { stop(); fs.pos = Number(b.dataset.goto); update(1); }));
    document.getElementById('fpos').textContent = `step ${fs.pos + 1} of ${pl.length}`;
    document.getElementById('fprev').disabled = fs.pos === 0 && fs.phase === PHASES[0][0];
    document.getElementById('fplay').textContent = fs.playing ? '❚❚ Pause' : (fs.pos === pl.length - 1 && fs.phase === 'free' ? '↻ Run again' : '▶ Run');
    document.querySelectorAll('[data-phase]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.phase === fs.phase)));
  }

  function advance(d) {
    const pl = plan(fs.phase);
    const i = PHASES.findIndex(([k]) => k === fs.phase);
    if (d > 0 && fs.pos >= pl.length - 1) {
      if (i < PHASES.length - 1) { fs.phase = PHASES[i + 1][0]; fs.pos = 0; fs.prevStack = []; fs.shownStep = null; } else { stop(); return update(0); }
    } else if (d < 0 && fs.pos === 0) {
      if (i > 0) { fs.phase = PHASES[i - 1][0]; fs.pos = plan(fs.phase).length - 1; fs.prevStack = []; fs.shownStep = null; }
    } else fs.pos += d;
    update(d);
  }
  function stop() { if (fs.playing) { clearInterval(fs.playing); fs.playing = null; } }
  function play() {
    if (fs.phase === 'free' && fs.pos === plan('free').length - 1) { fs.phase = 'allocate'; fs.pos = 0; fs.prevStack = []; fs.shownStep = null; }
    fs.playing = setInterval(() => { if (!document.getElementById('xcode')) return stop(); advance(1); }, SPEEDS[fs.speed]);
    update(0);
  }

  let keyBound = false;
  G.AFTER.flow = () => {
    stop();
    fs.prevStack = [];
    update.lastState = null;
    document.querySelectorAll('[data-impl]').forEach((b) => b.addEventListener('click', () => { stop(); location.hash = b.dataset.impl === 'gchips' ? '#/flow' : '#/flow?impl=' + b.dataset.impl; }));
    document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => { stop(); fs.phase = b.dataset.phase; fs.pos = 0; fs.prevStack = []; fs.shownStep = null; update(0); }));
    document.getElementById('fprev').addEventListener('click', () => { stop(); advance(-1); });
    document.getElementById('fnext').addEventListener('click', () => { stop(); advance(1); });
    document.getElementById('fplay').addEventListener('click', () => { if (fs.playing) { stop(); update(0); } else play(); });
    document.getElementById('fspeed').addEventListener('change', (e) => { fs.speed = e.target.value; if (fs.playing) { stop(); play(); } });
    if (!keyBound) {
      keyBound = true;
      document.addEventListener('keydown', (e) => {
        if (!document.getElementById('xcode') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.key === 'ArrowRight') { stop(); advance(1); }
        else if (e.key === 'ArrowLeft') { stop(); advance(-1); }
        else if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (fs.playing) { stop(); update(0); } else play(); }
      });
    }
    update(0);
  };
  window.addEventListener('hashchange', () => { if (!/^#\/flow/.test(location.hash)) stop(); });
})();
