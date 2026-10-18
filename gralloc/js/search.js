/*
 * search.js — site-wide search (header button, "/" or Ctrl+K).
 * Index is built from the loaded data: formats (gchips + Arm), code-flow functions (framework,
 * gchips, Arm), glossary terms, usage flags, Arm files and functions, and the site's pages.
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc } = G;
  const A = G.ARM, FW = window.GRALLOC_FW, GL = window.GRALLOC_GLOSSARY;
  let INDEX = null;

  const PAGES = [
    ['Overview', '#/'], ['Learn', '#/learn'], ['Use cases', '#/usecases'], ['Formats', '#/formats'], ['Pixel storage', '#/storage'],
    ['Compare formats', '#/compare'], ['Code flow', '#/flow'], ['Framework (libui → HAL)', '#/framework'], ['Usage flags', '#/usage'],
    ['Glossary', '#/glossary'], ['Build-flag assumptions', '#/settings'],
    ['Framework: AIMapper v5 functions', '#/framework?s=aimapper'], ['Framework: metadata support', '#/framework?s=metadata'], ['Framework: metadata storage (shared_metadata)', '#/framework?s=storage'],
    ['Framework: GraphicBuffer parcel layout', '#/framework?s=parcel'], ['Framework: loading the HAL', '#/framework?s=load'],
    ['Arm r56p0 overview', '#/arm'], ['Arm formats', '#/arm/formats'], ['Arm allocation calculator', '#/arm/calc'], ['Arm capabilities (XML)', '#/arm/caps'],
    ['Arm mapper & metadata', '#/arm/mapper'], ['Arm handles & descriptors', '#/arm/handles'], ['Arm build & config', '#/arm/build'],
    ['Arm source map', '#/arm/files'], ['Arm vs gchips', '#/arm/diff'], ['Arm usage flags', '#/arm/usage'], ['Arm terms', '#/arm/glossary'],
    ['Arm request mapping', '#/arm/requests'],
    ['Tools: dumpsys analyzer', '#/tools/dumpsys'], ['Tools: usage decoder', '#/tools/usage'], ['Tools: gchips vs Arm', '#/tools/vs'],
  ];
  const short = (n) => n.replace('MALI_GRALLOC_FORMAT_INTERNAL_', '').replace('HAL_PIXEL_FORMAT_', '');
  const slug = (t) => t.replace(/\W+/g, '-');

  function build() {
    const out = [];
    const add = (kind, name, sub, href, extra) => { if (href) out.push({ kind, name, sub, href, hay: (name + ' ' + (extra || '')).toLowerCase() }); };
    PAGES.forEach(([t, h]) => add('page', t, '', h));
    G.FD.formats.forEach((f) => add('gchips format', short(f.name), f.name, '#/format/' + encodeURIComponent(f.name), f.name));
    if (A) A.formats.forEach((f) => add('Arm format', short(f.name), f.name, '#/arm/format/' + encodeURIComponent(f.name), f.name));
    const seen = new Set();
    const fns = (impl, label, steps) => steps.forEach((s) => {
      const k = impl + ':' + s.id;
      if (seen.has(k)) return;
      seen.add(k);
      add(label, s.function || s.title, `${s.def.file.split('/').pop()}:${s.def.line} — ${s.description || ''}`, G.flowLink && G.flowLink(impl, s.id), s.title + ' ' + s.def.file);
    });
    if (FW) fns('gchips', 'framework function', FW.steps);
    fns('gchips', 'gchips function', G.CF.steps);
    if (A) fns('arm', 'Arm function', A.callflow.steps);
    if (GL) GL.terms.forEach((t) => add('term', t.term, t.definition, '#/glossary?t=' + encodeURIComponent(slug(t.term)), t.definition));
    (G.FD.usages.flags || []).forEach((u) => add('gchips usage', u.name, u.value_hex || '', '#/usage', u.expr || ''));
    if (A) {
      A.usages.flags.forEach((u) => add('Arm usage', u.name, u.value_hex || '', '#/arm/usage'));
      A.files.forEach((f) => {
        add('Arm file', f.path.split('/').pop(), `${f.path} — ${f.note || ''}`, '#/arm/files?q=' + encodeURIComponent(f.path), f.path + ' ' + (f.note || ''));
        (f.functions || []).forEach((x) => add('Arm source function', x.name, `${f.path}:${x.line}`, '#/arm/files?q=' + encodeURIComponent(x.name), f.path));
      });
    }
    return out;
  }

  function query(q) {
    INDEX = INDEX || build();
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const res = [];
    for (const it of INDEX) {
      if (!words.every((w) => it.hay.includes(w))) continue;
      const n = it.name.toLowerCase(), w = words[0];
      const score = (n === w ? 0 : n.startsWith(w) ? 1 : n.includes(w) ? 2 : 3) * 10 + (it.kind === 'page' ? 0 : 1) + n.length / 1000;
      res.push([score, it]);
    }
    return res.sort((a, b) => a[0] - b[0]).slice(0, 60).map((x) => x[1]);
  }

  let box = null, sel = 0, items = [];
  function open() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'srch';
      box.innerHTML = `<div class="srch-panel" role="dialog" aria-modal="true" aria-label="Search the site">
        <input id="srchq" type="search" placeholder="Search formats, functions, flags, terms, files…" autocomplete="off" spellcheck="false">
        <div id="srchres" class="srch-res" role="listbox"></div>
        <div class="srch-foot small muted">↑ ↓ to move · Enter to open · Esc to close</div></div>`;
      document.body.appendChild(box);
      box.addEventListener('click', (e) => { if (e.target === box) close(); });
      const inp = box.querySelector('#srchq');
      inp.addEventListener('input', () => { sel = 0; draw(inp.value); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
        else if (e.key === 'Enter' && items[sel]) { go(items[sel].href); }
        else if (e.key === 'Escape') close();
      });
    }
    box.hidden = false;
    document.body.classList.add('srch-open');
    const inp = box.querySelector('#srchq');
    inp.focus(); inp.select();
    draw(inp.value);
  }
  function close() { if (box) { box.hidden = true; document.body.classList.remove('srch-open'); } }
  function go(href) { close(); if (location.hash === href) G.render(); else location.hash = href; }
  function draw(q) {
    items = query(q);
    const el = box.querySelector('#srchres');
    el.innerHTML = q.trim() ? (items.length ? items.map((it, i) => `<a role="option" href="${it.href}" data-i="${i}" class="${i === sel ? 'on' : ''}"><span class="srch-kind">${esc(it.kind)}</span><b>${esc(it.name)}</b><span class="small muted">${esc((it.sub || '').slice(0, 140))}</span></a>`).join('')
      : '<p class="small muted">No matches.</p>') : '<p class="small muted">Try “NV12”, “lock”, “AFBC”, “dataspace”, “SW_READ”, “allocate2”.</p>';
    el.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.getAttribute('href')); }));
  }
  function mark() {
    box.querySelectorAll('#srchres a').forEach((a) => a.classList.toggle('on', Number(a.dataset.i) === sel));
    const on = box.querySelector('#srchres a.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'srch-btn'; btn.setAttribute('aria-label', 'Search (press /)');
  btn.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12.6" y1="12.6" x2="17" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search</span><kbd>/</kbd>';
  btn.addEventListener('click', open);
  const theme = document.getElementById('theme');
  if (theme) theme.parentNode.insertBefore(btn, theme);
  // Keyboard shortcuts panel ("?")
  let help = null;
  const KEYS = [['/', 'or Ctrl+K — search the site'], ['?', 'show this list'], ['Esc', 'close search / this list'],
    ['→ / ←', 'Code flow: next / previous step'], ['Space', 'Code flow: run / pause'], ['↑ ↓ Enter', 'Search: move and open a result']];
  function toggleHelp(show) {
    if (!help) {
      help = document.createElement('div');
      help.className = 'srch';
      help.innerHTML = `<div class="srch-panel keys" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><h3>Keyboard shortcuts</h3>
        <table>${KEYS.map(([k, d]) => `<tr><td>${k.split(' ').map((x) => (/^(or|\/)$/.test(x) ? x : `<kbd>${esc(x)}</kbd>`)).join(' ')}</td><td>${esc(d)}</td></tr>`).join('')}</table></div>`;
      help.addEventListener('click', (e) => { if (e.target === help) toggleHelp(false); });
      document.body.appendChild(help);
    }
    help.hidden = !show;
  }
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape' && help && !help.hidden) { toggleHelp(false); return; }
    if (e.key === '?' && !typing) { e.preventDefault(); toggleHelp(true); return; }
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); toggleHelp(false); open(); }
  });
  G.search = { open, query };
})();
