/*
 * tools.js — practical tools (#/tools/<tab>):
 *   dumpsys : paste "GraphicBufferAllocator buffers:" from dumpsys SurfaceFlinger; every row is
 *             decoded and re-run through the gchips engine (and Arm, optionally)
 *   usage   : decode a usage value bit by bit for gchips and Arm, with producers/consumers
 *   vs      : the same request through the gchips and Arm engines side by side
 * Row format: GraphicBufferAllocator::dump (frameworks/native, pinned in framework/SOURCE.txt).
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src, badge, fmt, E, FD, state } = G;
  const A = G.ARM, X = G.ARMX, AE = window.ArmEngine, FW = window.GRALLOC_FW;
  const U = E.U(), V = E.V();
  const hx = (v) => '0x' + BigInt(v).toString(16);
  const short = (n) => String(n).replace('MALI_GRALLOC_FORMAT_INTERNAL_', '').replace('HAL_PIXEL_FORMAT_', '');
  const fwl = (line, end) => ({ file: 'libs/ui/GraphicBufferAllocator.cpp', line, end, repo: 'fw' });

  // HAL value → name (prefer the public HAL_PIXEL_FORMAT_* spelling)
  const HAL = new Map();
  for (const [n, v] of Object.entries(V)) if (!HAL.has(v) || (n.startsWith('HAL_PIXEL_FORMAT_') && !HAL.get(v).startsWith('HAL_'))) HAL.set(v, n);
  const armHal = (v) => A && A.hal_requests.find((h) => h.hal_value === v);
  const armCaps = (k) => (X && X.CAPS_PRESETS[k] ? X.CAPS_PRESETS[k].caps() : null);

  const parseUsage = G.parseU64;

  function runG(fmtVal, w, h, layers, usage) {
    return E.allocate({ width: w, height: h, layer_count: layers, hal_format: fmtVal, usage }, state.flags);
  }
  function runA(fmtVal, w, h, layers, usage, capsKey) {
    if (!A || !AE) return null;
    const hr = armHal(fmtVal);
    if (!hr) return { ok: false, error: `format 0x${fmtVal.toString(16)} is not in Arm's hal_to_internal_format[] table` };
    try {
      return AE.allocate({ mode: 'auto', hal: hr.hal, width: w, height: h, layers, usage, caps: armCaps(capsKey || 'readme'), build: { sdk: 36 } });
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  const ts = Object.assign({ dump: '', u: '0xb00', vs: { f: 1, w: 1920, h: 1080, layers: 1, u: '0xb00', caps: 'readme' }, arm: false, caps: 'readme' }, G.store.get('tools', {}));
  const save = () => G.store.set('tools', ts);

  /* ------------------------------------------------------------------ dumpsys */
  // %18p | %12s | %4u (%4u) x %4u | %6u | %8X | 0x%8 PRIx64 | %s   (GraphicBufferAllocator.cpp:101-103)
  const ROW = /^\s*(\S+)\s*\|\s*([\d.]+\s*KiB|unknown)\s*\|\s*(\d+)\s*\(\s*(\d+)\)\s*x\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([0-9A-Fa-f]+)\s*\|\s*0x\s*([0-9a-fA-F]+)\s*\|\s*(.*)$/;
  function example() {
    // Built from the dump() format string with layouts from the gchips engine — not captured from a device.
    const rows = [[1080, 2400, 1, 0xb00n, 'example: app window'], [1080, 2400, 1, 0x1b00n, 'example: client target'], [512, 512, 1, 0x33n, 'example: CPU bitmap'], [1080, 2400, 4, 0xb00n, 'example: RGB_565 layer']];
    const lines = ['GraphicBufferAllocator buffers:', '            Handle |         Size |     W (Stride) x H | Layers |   Format |      Usage | Requestor'];
    rows.forEach(([w, h, f, u, name], i) => {
      const r = runG(f, w, h, 1, u);
      const stride = r.ok ? r.pixel_stride : w, bpp = f === 4 ? 2 : 4;
      const pad = (s, n) => String(s).padStart(n);
      lines.push(`${pad('0xb4000070a1b2c3' + (i + 1) * 10, 18)} | ${pad((stride * h * bpp / 1024).toFixed(2) + ' KiB', 12)} | ${pad(w, 4)} (${pad(stride, 4)}) x ${pad(h, 4)} | ${pad(1, 6)} | ${pad(f.toString(16).toUpperCase(), 8)} | 0x${pad(u.toString(16), 8)} | ${name}`);
    });
    return lines.join('\n');
  }
  function dumpsysPage() {
    return `<p class="lede">Paste the <code>GraphicBufferAllocator buffers:</code> block from <code>adb shell dumpsys SurfaceFlinger</code>. Each row is decoded with the format string of ${src(fwl(95, 103), 'GraphicBufferAllocator::dump')}, then the same request is run through the gchips engine${A ? ' (and Arm, if you want)' : ''} to show what the HAL would allocate.</p>
      <div class="panel">
        <textarea id="dumpin" aria-label="dumpsys SurfaceFlinger output" rows="9" spellcheck="false" placeholder="GraphicBufferAllocator buffers:\n            Handle |         Size |     W (Stride) x H | Layers |   Format |      Usage | Requestor\n...">${esc(ts.dump)}</textarea>
        <div class="row" style="margin-top:8px"><button id="dumpex" title="Built from the dump() format string with gchips layouts — not captured from a device">Load example</button><button id="dumpclr">Clear</button>
          ${A ? `<label class="small"><input type="checkbox" id="dumparm" ${ts.arm ? 'checked' : ''}> also run Arm r56p0 with</label> <select id="dumpcaps" aria-label="Arm capability set">${Object.entries(X.CAPS_PRESETS).map(([k, p]) => `<option value="${k}" ${k === ts.caps ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>` : ''}</div>
      </div>
      <p class="small muted">“Load example” writes rows in the dump() format with strides from the gchips engine; it is not output captured from a device.</p>
      <div id="dumpout"></div>
      <div class="note small"><b>About the Size column:</b> it is libui's own estimate, stride × height × bytesPerPixel(format) (${src(fwl(238, 247))}), not the real allocation; it is “unknown” when bytesPerPixel is 0. The computed size below is what the HAL engine allocates for that request. gchips results use your <a href="#/settings">build-flag assumptions</a>; usage bits the allocator may have adjusted are shown as recorded.</div>`;
  }
  function dumpsysDraw() {
    const out = document.getElementById('dumpout');
    const lines = ts.dump.split('\n');
    const rows = lines.map((l) => l.match(ROW)).filter(Boolean).filter((m) => m[1] !== 'Handle');
    if (!rows.length) { out.innerHTML = ts.dump.trim() ? '<p class="err">No buffer rows recognised. Rows look like <code>0x… | 10125.00 KiB | 1080 (1088) x 2400 | 1 | 1 | 0x b00 | name</code>.</p>' : ''; return; }
    let estTotal = 0, gTotal = 0, aTotal = 0, mism = 0;
    const bars = [];
    const body = rows.map((m) => {
      const [, handle, sizeStr, w, stride, h, layers, fmtHex, usageHex, name] = m;
      const fv = parseInt(fmtHex, 16), u = BigInt('0x' + usageHex), W = +w, H = +h, L = Math.max(1, +layers);
      const est = /KiB/.test(sizeStr) ? parseFloat(sizeStr) * 1024 : null;
      if (est) estTotal += est;
      const g = runG(fv, W, H, L, u), a = ts.arm ? runA(fv, W, H, L, u, ts.caps) : null;
      if (g.ok && g.total) gTotal += g.total;
      bars.push({ label: name.trim() || handle, total: g.ok ? g.total : 0, parts: g.ok ? planeParts(g.planes, g.total, 'byte_stride') : [] });
      if (a && a.ok) aTotal += a.size;
      const strideOk = g.ok && g.pixel_stride === +stride;
      if (g.ok && !strideOk) mism++;
      const fname = HAL.get(fv);
      const res = (r, isArm) => (!r ? '' : r.ok ? `<span class="mono">${esc(short(r.format.name))}</span>${isArm ? (r.drm.names.length ? ` <span class="small muted">${esc(r.drm.names.join('|'))}</span>` : '') : (E.modNames(r.alloc_format).length ? ` <span class="small muted">${esc(E.modNames(r.alloc_format).join('|'))}</span>` : '')}<br><b>${fmt(isArm ? r.size : r.total)}</b> B · stride ${fmt(r.pixel_stride)}${isArm ? '' : strideOk ? ' <span class="ok">✓</span>' : ` ${badge('≠ dump', 'b-bad')}`}<br><span class="small muted">${esc(r.heap.name || '')}</span>` : `<span class="err small">${esc(r.error)}</span>`);
      const usageLink = `#/tools/usage?u=${hx(u)}`;
      return `<tr><td class="small">${esc(name)}<br><span class="mono muted">${esc(handle)}</span></td><td class="mono">${W} × ${H}${L > 1 ? ` × ${L}` : ''}<br><span class="small muted">stride ${stride}</span></td>
        <td>${fname ? `<span class="mono">${esc(short(fname))}</span>` : '<span class="muted">?</span>'}<br><span class="small mono muted">0x${fv.toString(16)}</span></td>
        <td><a class="mono" href="${usageLink}">${hx(u)}</a><br><span class="small muted">${esc(E.listBits(E.get_producers(u), E.PR))} → ${esc(E.listBits(E.get_consumers(u), E.CO))}</span></td>
        <td class="small">${esc(sizeStr.trim())}</td><td>${res(g, false)}</td>${ts.arm ? `<td>${res(a, true)}</td>` : ''}</tr>`;
    }).join('');
    out.innerHTML = `<p><b>${rows.length}</b> buffers · dump estimate ${fmt(Math.round(estTotal))} B · gchips computes <b>${fmt(gTotal)}</b> B${ts.arm ? ` · Arm computes <b>${fmt(aTotal)}</b> B` : ''}${mism ? ` · ${badge(mism + ' stride mismatch' + (mism > 1 ? 'es' : ''), 'b-bad')} (the buffer may come from a different allocator, other build flags, or a format/usage the allocator rewrote)` : ''}</p>
      <details class="sbars-wrap" open><summary class="small">gchips size per buffer (to scale, one colour per plane)</summary>${sizeBars(bars)}</details>
      <div class="tablewrap"><table><thead><tr><th>requestor</th><th>size</th><th>format</th><th>usage (producers → consumers)</th><th>dump size</th><th>gchips</th>${ts.arm ? '<th>Arm r56p0</th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  /* ------------------------------------------------------------------ usage decoder */
  function decode(u, flags, kindOf) {
    const hits = [], covered = new Set();
    for (const f of flags) {
      if (f.value == null || /MASK/.test(f.name)) continue;
      const v = BigInt(f.value);
      if (v === 0n) continue;
      let on;
      if (/SW_READ_/.test(f.name)) on = (u & 0xFn) === v;
      else if (/SW_WRITE_/.test(f.name)) on = (u & 0xF0n) === v;
      else on = (u & v) === v;
      if (!on) continue;
      hits.push(f);
      for (let b = 0n; b < 64n; b++) if (v & (1n << b)) covered.add(b);
    }
    const loose = [];
    for (let b = 0n; b < 64n; b++) if ((u & (1n << b)) && !covered.has(b)) loose.push(Number(b));
    return { hits, loose };
  }
  // 64 cells, bit 63 … 0. Colour = which implementation names the bit; bits that were not set last time pop in.
  let prevBits = 0n;
  function bitGrid(u) {
    const names = (flags) => { const m = new Map(); for (const f of decode(u, flags).hits) for (let b = 0n; b < 64n; b++) if (BigInt(f.value) & (1n << b)) (m.get(b) || m.set(b, []).get(b)).push(f.name); return m; };
    const gn = names(FD.usages.flags), an = A ? names(A.usages.flags) : new Map();
    let k = 0;
    const cells = [];
    for (let b = 63n; b >= 0n; b--) {
      const on = (u >> b) & 1n, g = gn.get(b), a = an.get(b);
      const cls = !on ? '' : g && a ? 'on both' : g ? 'on g' : a ? 'on a' : 'on none';
      const fresh = on && !((prevBits >> b) & 1n);
      const tip = `bit ${b}${on ? ' (set)' : ''}${g ? ' · gchips: ' + g.join(', ') : ''}${a ? ' · Arm: ' + a.join(', ') : ''}`;
      cells.push(`<span class="bit ${cls}${fresh ? ' fresh' : ''}" style="--i:${fresh ? k++ : 0}" title="${esc(tip)}">${b % 4n === 0n ? `<i>${b}</i>` : ''}</span>`);
    }
    prevBits = u;
    return `<div class="bitgrid" role="img" aria-label="64 usage bits, set bits highlighted">${cells.join('')}</div>
      <p class="small bitkey"><span class="bit on both"></span> named by both <span class="bit on g"></span> gchips only ${A ? '<span class="bit on a"></span> Arm only ' : ''}<span class="bit on none"></span> set, unnamed <span class="bit"></span> clear · hover a cell for its flags</p>`;
  }
  function usagePage(params) {
    if (params && params.get('u')) ts.u = params.get('u');
    return `<p class="lede">Decode a usage value (hex like <code>0xb00</code>, or decimal) for both implementations: which named flags it contains, which bits nothing names, and the producers and consumers each one derives from it.</p>
      <div class="panel row"><input id="uin" type="text" value="${esc(ts.u)}" style="min-width:220px" spellcheck="false" aria-label="usage value">
        <select id="upre" aria-label="Usage presets"><option value="">Presets…</option>${Object.keys(G.PRESETS).map((k) => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div id="uout"></div>`;
  }
  function usageDraw() {
    const out = document.getElementById('uout');
    const u = parseUsage(ts.u);
    if (u == null) { out.innerHTML = '<p class="err">Not a 64-bit unsigned value. Use hex (0x…) or decimal.</p>'; return; }
    const side = (title, flags, prod, cons, cite, usageHref) => {
      const d = decode(u, flags);
      return `<div class="panel"><h3 style="margin-top:0">${title}</h3>
        <div class="small">producers: <b>${esc(prod)}</b> · consumers: <b>${esc(cons)}</b> ${cite}</div>
        <div class="tablewrap"><table><thead><tr><th>flag</th><th>value</th><th>defined</th></tr></thead><tbody>
        ${d.hits.map((f) => `<tr><td class="mono small">${esc(f.name)}${f.kind && f.kind !== 'standard' ? ` ${badge(f.kind)}` : ''}</td><td class="mono small">${esc(f.value_hex || hx(f.value))}</td><td>${src(f.loc)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">no named flags</td></tr>'}
        </tbody></table></div>
        ${d.loose.length ? `<p class="small">${badge('unnamed', 'b-unknown')} bit${d.loose.length > 1 ? 's' : ''} ${d.loose.join(', ')} ${d.loose.length > 1 ? 'are' : 'is'} set but no flag in this implementation names ${d.loose.length > 1 ? 'them' : 'it'}.</p>` : ''}
        <a class="btn small" href="${usageHref}">open in the usage page</a></div>`;
    };
    const gp = E.listBits(E.get_producers(u), E.PR), gc = E.listBits(E.get_consumers(u), E.CO);
    out.innerHTML = `<p class="mono">${hx(u)} = ${u.toString()} = 0b${u.toString(2)}</p>${bitGrid(u)}<div class="grid2">
      ${side('gchips', FD.usages.flags, gp, gc, src({ file: 'gralloc4/src/core/mali_gralloc_formats.cpp', line: 105, end: 240 }, 'get_consumers / get_producers'), `#/usage?u=${hx(u)}`)}
      ${A ? side('Arm r56p0', A.usages.flags, [...AE.producers(u)].join(', ') || 'none', [...AE.consumersOf(u)].join(', ') || 'none', src({ file: 'android/src/core/formats.cpp', line: 44, end: 164, repo: 'arm' }, 'consumers / producers'), '#/arm/usage') : ''}
    </div>`;
  }

  // Horizontal bars, one per item; each bar is split into plane segments and grows in from the left.
  function sizeBars(items) {
    const max = Math.max(1, ...items.map((x) => x.total || 0));
    return `<div class="sbars">${items.map((x, i) => {
      const segs = (x.parts && x.parts.length ? x.parts : [{ bytes: x.total }]).filter((p) => p.bytes > 0);
      return `<div class="sbar"><span class="sbar-lab small">${esc(x.label)}</span><span class="sbar-track"><span class="sbar-fill" style="width:${(100 * (x.total || 0)) / max}%;--i:${i}">${segs.map((p, j) => `<span class="sbar-seg p${j % 4}" style="flex:${p.bytes}" title="${esc(p.title || '')}"></span>`).join('')}</span></span><span class="sbar-val small mono">${x.total ? fmt(x.total) + ' B' : '—'}</span></div>`;
    }).join('')}</div>`;
  }
  // plane sizes from offsets: plane i runs to the next plane's offset (or the end of the buffer)
  // (formats with one fd per plane restart offsets at 0 — then show a single segment)
  const planeParts = (planes, total, strideKey) => planes.some((p, i) => i && p.offset <= planes[i - 1].offset) ? [{ bytes: total, title: `${planes.length} planes in separate fds` }] : planes.map((p, i) => {
    const end = i + 1 < planes.length ? planes[i + 1].offset : total;
    return { bytes: Math.max(0, end - p.offset), title: `plane ${i}: offset ${fmt(p.offset)}, ${fmt(end - p.offset)} B, stride ${fmt(p[strideKey])} B` };
  });

  /* ------------------------------------------------------------------ gchips vs Arm */
  const HAL_OPTS = [...HAL.entries()].filter(([, n]) => n.startsWith('HAL_PIXEL_FORMAT_')).sort((a, b) => a[0] - b[0]);
  function vsPage() {
    const s = ts.vs;
    return `<p class="lede">One request through both engines: what Google's gchips gralloc and the Arm r56p0 reference gralloc allocate for the same format, size and usage. gchips decides AFBC from <a href="#/settings">build flags</a>; Arm from the device capability XML (choose a set below).</p>
      <div class="panel row">
        <label class="small">format <select id="vsf">${HAL_OPTS.map(([v, n]) => `<option value="${v}" ${v === s.f ? 'selected' : ''}>${esc(short(n))} (0x${v.toString(16)})</option>`).join('')}</select></label>
        <label class="small">width <input id="vsw" type="number" min="1" value="${s.w}" style="width:90px"></label>
        <label class="small">height <input id="vsh" type="number" min="1" value="${s.h}" style="width:90px"></label>
        <label class="small">layers <input id="vsl" type="number" min="1" value="${s.layers}" style="width:60px"></label>
        <label class="small">usage <input id="vsu" type="text" value="${esc(s.u)}" style="width:150px" spellcheck="false"></label>
        <select id="vspre" aria-label="Usage presets"><option value="">usage presets…</option>${Object.keys(G.PRESETS).map((k) => `<option>${esc(k)}</option>`).join('')}</select>
        ${A ? `<label class="small">Arm capabilities <select id="vscaps">${Object.entries(X.CAPS_PRESETS).map(([k, p]) => `<option value="${k}" ${k === s.caps ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>` : ''}
      </div><div id="vsout"></div>`;
  }
  function vsDraw() {
    const s = ts.vs, out = document.getElementById('vsout');
    const u = parseUsage(s.u);
    if (u == null) { out.innerHTML = '<p class="err">Usage: Not a 64-bit unsigned value. Use hex (0x…) or decimal.</p>'; return; }
    const g = runG(s.f, s.w, s.h, s.layers, u), a = runA(s.f, s.w, s.h, s.layers, u, s.caps);
    const row = (label, gv, av) => `<tr class="${gv !== av ? 'diff' : ''}"><td>${label}</td><td class="mono small">${gv}</td><td class="mono small">${av}</td></tr>`;
    const gm = g.ok ? E.modNames(g.alloc_format).join(' | ') || 'none (linear)' : '—';
    const am = a && a.ok ? a.drm.names.join(' | ') || 'none (linear)' : '—';
    const err = (r, who) => (r && !r.ok ? `<div class="err small"><b>${who} rejects this request:</b> ${esc(r.error)}</div>` : '');
    const gPlanes = g.ok ? g.planes.map((p, i) => `p${i}: off ${fmt(p.offset)}, stride ${fmt(p.byte_stride)} B`).join('<br>') : '—';
    const aPlanes = a && a.ok ? a.planes.map((p, i) => `p${i}: off ${fmt(p.offset)}, stride ${fmt(p.row_stride)} B`).join('<br>') : '—';
    out.innerHTML = `${err(g, 'gchips')}${A ? err(a, 'Arm r56p0') : ''}<div class="tablewrap"><table class="vs"><thead><tr><th></th><th>gchips</th><th>Arm r56p0</th></tr></thead><tbody>
      ${row('allocated format', g.ok ? esc(short(g.format.name)) : '—', a && a.ok ? esc(short(a.format.name)) : '—')}
      ${row('modifiers', esc(gm), esc(am))}
      ${row('total bytes', g.ok ? fmt(g.total) : '—', a && a.ok ? fmt(a.size) : '—')}
      ${row('pixel stride', g.ok ? fmt(g.pixel_stride) : '—', a && a.ok ? fmt(a.pixel_stride) + (a.pixel_stride === 0 ? ' (0 without CPU usage)' : '') : '—')}
      ${row('planes', gPlanes, aPlanes)}
      ${row('CPU lockable', g.ok ? (g.lockable ? 'yes' : 'no') : '—', a && a.ok ? (a.lockable ? 'yes' : 'no') : '—')}
      ${row('dma-buf heap', g.ok ? esc(g.heap.name) : '—', a && a.ok ? esc(a.heap.name) : '—')}
      </tbody></table></div>
      ${sizeBars([{ label: 'gchips', total: g.ok ? g.total : 0, parts: g.ok ? planeParts(g.planes, g.total, 'byte_stride') : [] }].concat(A ? [{ label: 'Arm r56p0', total: a && a.ok ? a.size : 0, parts: a && a.ok ? planeParts(a.planes, a.size, 'row_stride') : [] }] : []))}
      <p class="small">Bars are to scale; each colour is one plane (hover for offset and size); anything after the last plane is in that plane's segment.
      Rows that differ are highlighted. Full detail: <a href="#/usage?u=${hx(u)}&f=${encodeURIComponent(HAL.get(s.f) || '')}&w=${s.w}&h=${s.h}">gchips calculator</a>${A ? ' · <a href="#/arm/calc">Arm calculator</a>' : ''}.</p>`;
  }

  /* ------------------------------------------------------------------ page */
  const TABS = [['dumpsys', 'dumpsys analyzer'], ['usage', 'Usage decoder'], ['vs', 'gchips vs Arm']];
  G.views.tools = (params, arg) => {
    const t = TABS.some(([k]) => k === arg) ? arg : 'dumpsys';
    const body = t === 'dumpsys' ? dumpsysPage() : t === 'usage' ? usagePage(params) : vsPage();
    return `<h1>Tools</h1><div class="tabs" role="tablist">${TABS.map(([k, l]) => `<a class="tabbtn ${k === t ? 'on' : ''}" href="#/tools/${k}">${esc(l)}</a>`).join('')}</div>${body}`;
  };
  G.AFTER.tools = (params, arg) => {
    const t = TABS.some(([k]) => k === arg) ? arg : 'dumpsys';
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    if (t === 'dumpsys') {
      on('dumpin', 'input', (e) => { ts.dump = e.target.value; save(); dumpsysDraw(); });
      on('dumpex', 'click', () => { ts.dump = example(); document.getElementById('dumpin').value = ts.dump; save(); dumpsysDraw(); });
      on('dumpclr', 'click', () => { ts.dump = ''; document.getElementById('dumpin').value = ''; save(); dumpsysDraw(); });
      on('dumparm', 'change', (e) => { ts.arm = e.target.checked; save(); dumpsysDraw(); });
      on('dumpcaps', 'change', (e) => { ts.caps = e.target.value; save(); dumpsysDraw(); });
      dumpsysDraw();
    } else if (t === 'usage') {
      on('uin', 'input', (e) => { ts.u = e.target.value; save(); usageDraw(); });
      on('upre', 'change', (e) => { const p = G.PRESETS[e.target.value]; if (!p) return; ts.u = hx(G.usageValue(p)); document.getElementById('uin').value = ts.u; e.target.value = ''; save(); usageDraw(); });
      usageDraw();
    } else {
      const s = ts.vs;
      const upd = () => { save(); vsDraw(); };
      on('vsf', 'change', (e) => { s.f = Number(e.target.value); upd(); });
      on('vsw', 'input', (e) => { s.w = Math.max(1, Number(e.target.value) || 1); upd(); });
      on('vsh', 'input', (e) => { s.h = Math.max(1, Number(e.target.value) || 1); upd(); });
      on('vsl', 'input', (e) => { s.layers = Math.max(1, Number(e.target.value) || 1); upd(); });
      on('vsu', 'input', (e) => { s.u = e.target.value; upd(); });
      on('vscaps', 'change', (e) => { s.caps = e.target.value; upd(); });
      on('vspre', 'change', (e) => { const p = G.PRESETS[e.target.value]; if (!p) return; s.u = hx(G.usageValue(p)); document.getElementById('vsu').value = s.u; e.target.value = ''; upd(); });
      vsDraw();
    }
  };
})();
