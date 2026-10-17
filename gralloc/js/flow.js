/*
 * flow.js — Code flow as an execution viewer.
 *
 * Shows each function's real source (extracted by tools/extract.py) and "executes" it:
 * a red execution bar moves through annotated stops; at a call it pushes a stack frame and
 * opens the callee, returning pops frames. Buffer state and the process lane update alongside.
 * Stop lines are resolved from source; the notes on them are hand-written.
 * Optionally the Android framework steps (tools/extract_fw.py) are spliced in front of the vendor flow.
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src } = G;
  // Two implementations share the viewer: gchips (default) and the Arm r56p0 reference gralloc.
  const IMPLS = { gchips: { CF: G.CF, FJ: G.flowJourney, name: 'gchips' } };
  if (G.ARM && G.flowJourneyArm) IMPLS.arm = { CF: G.ARM.callflow, FJ: G.flowJourneyArm, name: 'Arm r56p0' };
  // Android framework (libui: GraphicBuffer → Gralloc5) steps, joined in front of either vendor flow.
  const FW = window.GRALLOC_FW;
  let CF = G.CF, FJ = G.flowJourney, VCF = G.CF;

  // Vendor flow with the framework spliced in: each "@key" in a framework path becomes the vendor's
  // steps from its entry point for that key (callflow.entries) up to the next key's entry point.
  function withFramework(V) {
    const E = V.entries || {};
    const res = (id) => (id && id[0] === '@' ? E[id.slice(1)] || null : id);
    const steps = FW.steps.map((s) => ({ ...s, next: s.next.map(res).filter(Boolean), stops: s.stops.map((t) => ({ ...t, call: res(t.call) })) }));
    const paths = {};
    for (const [ph] of V.phases || DEFAULT_PHASES) {
      const vp = V.paths[ph] || [], fp = FW.paths[ph];
      if (!fp) { paths[ph] = vp; continue; }
      const starts = fp.filter((x) => x[0] === '@').map((x) => vp.indexOf(E[x.slice(1)])).filter((i) => i >= 0).sort((a, b) => a - b);
      const out = [], used = new Set();
      for (const x of fp) {
        if (x[0] !== '@') { out.push(x); continue; }
        const i = vp.indexOf(E[x.slice(1)]);
        if (i < 0) continue;
        const end = starts.find((j) => j > i) ?? vp.length;
        for (let k = i; k < end; k++) { out.push(vp[k]); used.add(k); }
      }
      vp.forEach((id, k) => { if (!used.has(k)) out.push(id); });
      paths[ph] = out;
    }
    return { ...V, steps: [...steps, ...V.steps], paths };
  }
  const merged = {};
  const STATE_NAMES = ['handle', 'fds', 'ref_count', 'mapped', 'locked_ref_count', 'CPU flags'];
  const DEFAULT_PHASES = [['allocate', 'Allocate'], ['import', 'Import'], ['lock', 'Lock'], ['unlock', 'Unlock'], ['free', 'Free']];
  const phases = () => CF.phases || DEFAULT_PHASES;
  const lastPhase = () => phases()[phases().length - 1][0];
  const SPEEDS = { slow: 2300, normal: 1400, fast: 700 };
  const step = (id) => CF.steps.find((s) => s.id === id);

  const fs = { impl: 'gchips', fw: !!FW, phase: null, pos: 0, playing: null, speed: 'normal', shownStep: null, prevStack: [] };
  function useImpl(k, fw) {
    const d = IMPLS[k] || IMPLS.gchips;
    const impl = IMPLS[k] ? k : 'gchips', withFw = !!FW && fw;
    if (fs.impl !== impl || fs.fw !== withFw || !fs.phase) { fs.phase = null; fs.pos = 0; }
    fs.impl = impl; fs.fw = withFw;
    VCF = d.CF; FJ = d.FJ;
    CF = withFw ? (merged[impl] = merged[impl] || withFramework(d.CF)) : d.CF;
    if (!fs.phase) fs.phase = phases()[0][0];
  }
  const isFw = (s) => s.layer === 'framework';
  // caller → callees that the phase's walk actually opens (same rule as stackAt)
  function opened(phase) {
    const ids = CF.paths[phase], st = [], pairs = new Set();
    for (const id of ids) {
      while (st.length && !step(st[st.length - 1]).next.includes(id)) st.pop();
      if (st.length) pairs.add(st[st.length - 1] + '>' + id);
      st.push(id);
    }
    return pairs;
  }
  // Where a callee that this phase does not open is shown instead.
  function shownElsewhere(callee) {
    if (CF.paths[fs.phase].includes(callee)) return 'shown earlier in this phase';
    const p = phases().find(([k]) => CF.paths[k] && CF.paths[k].includes(callee));
    return p ? `shown in the ${p[1]} phase` : '';
  }
  // Buffer state uses the vendor path; framework steps show the state left by the last vendor step before them.
  function stateAt(phase, id) {
    const vp = VCF.paths[phase] || [];
    let k = vp.indexOf(id);
    if (k < 0) {
      const mp = CF.paths[phase], at = mp.indexOf(id);
      for (let i = at - 1; i >= 0 && k < 0; i--) k = vp.indexOf(mp[i]);
    }
    if (k >= 0) return FJ.stateFor(phase, k);
    const P = phases(), i = P.findIndex(([x]) => x === phase);
    for (let j = i - 1; j >= 0; j--) { const ids = VCF.paths[P[j][0]] || []; if (ids.length) return FJ.stateFor(P[j][0], ids.length - 1); }
    return null;
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

  const layerTag = (s) => (isFw(s) ? '<span class="lay lay-fw">framework</span>' : `<span class="lay lay-hal">${esc(IMPLS[fs.impl].name)}</span>`);

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
    useImpl(params.get('impl') || 'gchips', params.get('fw') !== '0');
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
      <p class="lede">${esc(FJ.INTRO || 'Watch the real gralloc code run for one buffer: allocated by the allocator service, then imported, locked, unlocked and freed by an app.')}${fs.fw ? ' Each phase starts in the Android framework (GraphicBuffer → GraphicBufferAllocator/Mapper → Gralloc5) and follows the call into the vendor HAL.' : ''} The red bar marks the line being executed; calls open the called function.</p>
      <div class="flowpick">
        ${IMPLS.arm ? `<div class="seg" role="tablist" aria-label="implementation">${Object.entries(IMPLS).map(([k, d]) => `<button role="tab" data-impl="${k}" aria-selected="${k === fs.impl}">${esc(d.name)}</button>`).join('')}</div>` : ''}
        ${FW ? `<label class="small"><input type="checkbox" id="ffw" ${fs.fw ? 'checked' : ''}> start from the Android framework (libui → Gralloc5)</label>` : ''}
      </div>
      ${fs.fw ? `<p class="small muted">Framework steps (marked <span class="lay lay-fw">framework</span>) come from AOSP frameworks/native ${esc(FW.meta.branch)} @ <code>${esc(FW.meta.commit.slice(0, 12))}</code>; they join the ${esc(IMPLS[fs.impl].name)} code at the HAL entry points: ${Object.values(FW.markers).map(esc).join(', ')}.</p>` : ''}
      <div class="flowbar">
        <div class="seg" role="tablist">${phases().map(([k, t]) => `<button role="tab" data-phase="${k}" aria-selected="${k === fs.phase}">${t}</button>`).join('')}</div>
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
    history.replaceState(null, '', `#/flow?${fs.impl !== 'gchips' ? 'impl=' + fs.impl + '&' : ''}${FW && !fs.fw ? 'fw=0&' : ''}p=${fs.phase}&pos=${fs.pos}`);
    G.render.lastRoute = location.hash;

    // header + code (swap with a slide when the function changes)
    const lines = document.getElementById('xlines');
    if (fs.shownStep !== s.id) {
      const goingIn = fs.prevStack.length < stack.length;
      document.getElementById('xhead').innerHTML = `<div>${layerTag(s)} <b class="fn">${esc(s.function || s.title)}</b><span class="muted small"> ${esc(s.title !== s.function ? s.title : '')}</span></div>
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
      const opens = callee && opened(fs.phase).has(s.id + '>' + t.call);
      const where = callee && !opens ? shownElsewhere(t.call) : '';
      const cross = callee && isFw(s) && !isFw(callee) ? ` <span class="lay lay-hal">into ${esc(IMPLS[fs.impl].name)}</span>` : '';
      note.innerHTML = `<div class="anno ${t.call ? 'is-call' : ''}"><span class="ln-ref">${t.line}</span><div><p>${esc(t.note)}</p>
        <code class="small">${esc(t.text)}</code>${callee ? `<div class="small" style="margin-top:4px">Calls <b>${esc(callee.function || callee.title)}</b>${cross} — ${opens ? 'next step opens it' : esc(where || 'not followed here')}.</div>` : ''}
        <div class="small muted">${src({ file: s.def.file, line: t.line })}</div></div></div>`;
    }
    note.firstElementChild.classList.add('anim-in');

    // call stack
    const prev = fs.prevStack;
    document.getElementById('xstack').innerHTML = stack.slice().reverse().map((id, i) => {
      const fr = step(id), isNew = !prev.includes(id);
      return `<li class="${i === 0 ? 'top' : ''} ${isNew ? 'push' : ''} ${isFw(fr) ? 'fwframe' : ''}"><b>${esc(fr.function || fr.title)}</b><span class="small muted">${esc(fr.def.file.split('/').pop())}:${fr.def.line}</span></li>`;
    }).join('');
    fs.prevStack = stack;

    // lane + state
    const lane = isFw(s) ? 0 : (FJ.J[s.id] || [0])[0];
    const lanes = document.getElementById('xlanes');
    lanes.style.setProperty('--lane', lane);
    lanes.querySelectorAll('[data-lane]').forEach((d) => d.classList.toggle('on', Number(d.dataset.lane) === lane));
    const st = stateAt(fs.phase, s.id);
    const names = FJ.STATE_NAMES || STATE_NAMES;
    const old = update.lastState;
    document.getElementById('xstate').innerHTML = st ? `<table class="statetab">${names.map((n, k) => `<tr class="${old && old[k] !== st.s[k] ? 'flash' : ''}"><td>${n}</td><td>${esc(st.s[k])}</td></tr>`).join('')}</table><div class="small muted">after ${esc(step(st.id).function || step(st.id).title)} ${src(st.s[6])}</div>` : '<div class="small muted">no state change yet</div>';
    update.lastState = st ? st.s : null;

    // list + position + buttons
    document.getElementById('xlist').innerHTML = CF.paths[fs.phase].map((id) => {
      const f = step(id); const at = pl.findIndex((x) => x.id === id);
      return `<li class="${id === s.id ? 'on' : ''}">${layerTag(f)} <button data-goto="${at}">${esc(f.function || f.title)}</button> <span class="small muted">${esc(f.def.file.split('/').pop())}:${f.def.line}</span></li>`;
    }).join('');
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { stop(); fs.pos = Number(b.dataset.goto); update(1); }));
    document.getElementById('fpos').textContent = `step ${fs.pos + 1} of ${pl.length}`;
    document.getElementById('fprev').disabled = fs.pos === 0 && fs.phase === phases()[0][0];
    document.getElementById('fplay').textContent = fs.playing ? '❚❚ Pause' : (fs.pos === pl.length - 1 && fs.phase === lastPhase() ? '↻ Run again' : '▶ Run');
    document.querySelectorAll('[data-phase]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.phase === fs.phase)));
  }

  function advance(d) {
    const pl = plan(fs.phase);
    const P = phases(), i = P.findIndex(([k]) => k === fs.phase);
    if (d > 0 && fs.pos >= pl.length - 1) {
      if (i < P.length - 1) { fs.phase = P[i + 1][0]; fs.pos = 0; fs.prevStack = []; fs.shownStep = null; } else { stop(); return update(0); }
    } else if (d < 0 && fs.pos === 0) {
      if (i > 0) { fs.phase = P[i - 1][0]; fs.pos = plan(fs.phase).length - 1; fs.prevStack = []; fs.shownStep = null; }
    } else fs.pos += d;
    update(d);
  }
  function stop() { if (fs.playing) { clearInterval(fs.playing); fs.playing = null; } }
  function play() {
    if (fs.phase === lastPhase() && fs.pos === plan(lastPhase()).length - 1) { fs.phase = phases()[0][0]; fs.pos = 0; fs.prevStack = []; fs.shownStep = null; }
    fs.playing = setInterval(() => { if (!document.getElementById('xcode')) return stop(); advance(1); }, SPEEDS[fs.speed]);
    update(0);
  }

  // Link that opens the viewer on a function (framework on): first phase whose path contains it.
  G.flowLink = (impl, id) => {
    const d = IMPLS[impl];
    if (!d) return null;
    const C = FW ? (merged[impl] = merged[impl] || withFramework(d.CF)) : d.CF;
    for (const [ph] of C.phases || DEFAULT_PHASES) {
      let pos = 0;
      for (const x of C.paths[ph] || []) {
        if (x === id) return `#/flow?${impl !== 'gchips' ? 'impl=' + impl + '&' : ''}p=${ph}&pos=${pos}`;
        pos += 1 + C.steps.find((s) => s.id === x).stops.length;
      }
    }
    return null;
  };

  let keyBound = false;
  G.AFTER.flow = () => {
    stop();
    fs.prevStack = [];
    update.lastState = null;
    const go = (impl, fw) => { const q = [impl !== 'gchips' ? 'impl=' + impl : '', fw ? '' : 'fw=0'].filter(Boolean).join('&'); location.hash = '#/flow' + (q ? '?' + q : ''); };
    document.querySelectorAll('[data-impl]').forEach((b) => b.addEventListener('click', () => { stop(); go(b.dataset.impl, fs.fw); }));
    const ffw = document.getElementById('ffw');
    if (ffw) ffw.addEventListener('change', () => { stop(); go(fs.impl, ffw.checked); });
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
