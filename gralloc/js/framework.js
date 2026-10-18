/*
 * framework.js — the Android framework side of gralloc (#/framework).
 *
 * Data: site/data/framework.js (tools/extract_fw.py): libui code-flow steps plus reference tables
 * parsed from AOSP frameworks/native (pinned commit), with vendor columns parsed from gchips and
 * the Arm r56p0 archive. Joins to the vendor flows use callflow.entries from each vendor's data.
 */
(function () {
  'use strict';
  const G = window.GX, FW = window.GRALLOC_FW;
  if (!FW) return;
  const { esc, src, badge } = G;
  const R = FW.reference;
  const A = G.ARM;
  const fwStep = (id) => FW.steps.find((s) => s.id === id);
  const gStep = (id) => G.CF.steps.find((s) => s.id === id);
  const aStep = (id) => A && A.callflow.steps.find((s) => s.id === id);
  const fl = (file, line, end) => ({ file, line, end, repo: 'fw' });
  const G5 = 'libs/ui/Gralloc5.cpp', GBM = 'libs/ui/GraphicBufferMapper.cpp', GBA = 'libs/ui/GraphicBufferAllocator.cpp';
  const flowBtn = (impl, id, label) => { const h = G.flowLink && G.flowLink(impl, id); return h ? `<a class="btn small" href="${h}">${esc(label)}</a>` : ''; };
  const fnCell = (s) => (s ? `<span class="mono">${esc(s.function || s.title)}</span><br>${src(s.def)}` : '<span class="muted">—</span>');
  const yes = (loc, extra) => (loc ? `<span class="ok">✓</span> ${src(loc)}${extra ? ` <span class="small muted">${esc(extra)}</span>` : ''}` : '<span class="muted">—</span>');

  const SECTIONS = [['stack', 'The stack'], ['phases', 'Phase by phase'], ['load', 'Loading the HAL'], ['aimapper', 'AIMapper v5'],
    ['iallocator', 'IAllocator'], ['metadata', 'Metadata support'], ['storage', 'Metadata storage'], ['parcel', 'GraphicBuffer parcel'], ['checks', 'Checks & errors'], ['notes', 'Code observations']];

  function stack() {
    const g = (id) => gStep(id), a = (id) => aStep(id);
    const box = (title, sub, loc, cls, l) => `<div class="stk-box ${cls || ''}"${l ? ` data-l="${l}"` : ''}><b>${esc(title)}</b>${sub ? `<span class="small">${sub}</span>` : ''}${loc ? `<span class="small">${src(loc)}</span>` : ''}</div>`;
    const vend = (gs, as, what, l) => `<div class="stk-vend">${box('gchips: ' + (gs ? gs.function : '—'), what, gs && gs.def, 'hal', l)}${A ? box('Arm r56p0: ' + (as ? as.function : '—'), what, as && as.def, 'hal', l) : ''}</div>`;
    return `<div class="stk">
      <div class="stk-proc"><div class="stk-lab">Client process (app, SurfaceFlinger, camera HAL, codec…)</div>
        ${box('GraphicBuffer', 'owns one buffer: allocate, lock/unlock, flatten/unflatten for binder', fwStep('fw_gb_ctor').def, 'fw', 'gb')}
        <div class="stk-row">${box('GraphicBufferAllocator', 'singleton; allocate / free + dumpsys list', fwStep('fw_gba_ctor').def, 'fw', 'gba')}${box('GraphicBufferMapper', 'singleton; import, lock, metadata', fwStep('fw_gbm_ctor').def, 'fw', 'gbm')}</div>
        <div class="stk-row">${box('Gralloc5Allocator', 'AIDL IAllocator client', fwStep('fw_g5_alloc').def, 'fw', 'g5a')}${box('Gralloc5Mapper', 'calls the AIMapper v5 function table', fwStep('fw_g5m_ctor').def, 'fw', 'g5m')}</div>
        <div class="stk-arrow" data-hop="dl">dlopen <code>mapper.&lt;suffix&gt;.so</code> into this process, then <code>AIMapper_loadIMapper</code> ${src(fwStep('fw_load_lib').def)}</div>
        ${vend(g('v5_load'), a('v5_load'), 'mapper library (in this process)', 'map')}
      </div>
      <div class="stk-arrow" data-hop="binder">binder: <code>IAllocator/default</code>, version ≥ 2 ${src(R.service_name)} ${src(R.min_version)}</div>
      <div class="stk-proc"><div class="stk-lab">Allocator service process</div>
        ${vend(g('aidl_allocate2'), a('allocate2'), 'IAllocator::allocate2', 'svc')}
      </div>
      <div class="stk-arrow" data-hop="dmabuf">dma-buf heaps</div>
      <div class="stk-proc"><div class="stk-lab">Kernel</div>${vend(g('heap'), a('allocator_allocate'), 'allocate one dma-buf per fd', 'heap')}</div>
    </div>`;
  }

  /* ---- call journey: step through one phase on the stack diagram ---- */
  // Layer of a libui step: by file, and for Gralloc5.cpp by class; free helpers run in their caller's layer.
  function fwLayer(s, prev) {
    const f = s.def.file, fn = s.function || '';
    if (/GraphicBuffer\.cpp$/.test(f)) return 'gb';
    if (/GraphicBufferAllocator/.test(f)) return 'gba';
    if (/GraphicBufferMapper/.test(f)) return 'gbm';
    if (/^Gralloc5Allocator::/.test(fn)) return 'g5a';
    if (/^Gralloc5Mapper::/.test(fn)) return 'g5m';
    return prev || 'g5m';
  }
  // What each HAL entry crosses: binder to the allocator service, or a call into the in-process mapper library.
  const MARK_HOPS = { suffix: [['binder', 'svc']], supported: [['binder', 'svc']], allocate: [['binder', 'svc'], ['dmabuf', 'heap']], load: [['dl', 'map']] };
  function journey(phase) {
    const out = [], EN = { g: G.CF.entries || {}, a: (A && A.callflow.entries) || {} };
    let prev = null;
    for (const id of FW.paths[phase] || []) {
      if (id[0] === '@') {
        const m = id.slice(1), gs = gStep(EN.g[m]), as = aStep(EN.a[m]);
        const vend = `${gs ? `gchips <span class="mono">${esc(gs.function)}</span> ${src(gs.def)}` : ''}${A && as ? ` · Arm <span class="mono">${esc(as.function)}</span> ${src(as.def)}` : ''}`;
        (MARK_HOPS[m] || [[null, 'map']]).forEach(([hop, l], i) => out.push({ l, hop, html: i === 0 ? `<b>${esc(FW.markers[m])}</b> — ${vend}` : `the allocator gets the memory from a dma-buf heap — ${vend}` }));
        prev = null;
        continue;
      }
      const s = fwStep(id);
      if (!s) continue;
      prev = fwLayer(s, prev);
      out.push({ l: prev, hop: null, html: `<span class="mono">${esc(s.function || s.title)}</span> ${src(s.def)}<br><span class="small muted">${esc(s.description || '')}</span>` });
    }
    return out;
  }
  const js = { phase: 'allocate', i: 0, timer: null };
  function journeyPanel() {
    return `<div class="panel journey"><div class="row"><b>Watch a call cross the layers</b>
      <span class="tabs small" id="jphase">${G.CF.phases.map(([ph, label]) => `<button data-jp="${ph}" class="${ph === js.phase ? 'on' : ''}">${esc(label)}</button>`).join('')}</span></div>
      <div class="row"><button id="jplay" class="primary">▶ Play</button><button id="jprev" aria-label="Previous step">←</button><button id="jnext" aria-label="Next step">→</button><span id="jcount" class="small muted"></span>
      <a class="small" id="jflow" href="#/flow">open this phase in the code flow</a></div>
      <div id="jcap" class="jcap" aria-live="polite"></div></div>`;
  }
  function journeyBind() {
    const root = document.querySelector('.journey');
    if (!root) return;
    const stop = () => { clearInterval(js.timer); js.timer = null; const b = document.getElementById('jplay'); if (b) b.textContent = '▶ Play'; };
    // the panel sticks under the (sticky) header; boxes scrolled to must clear both
    const hdr = document.querySelector('header.top');
    const place = () => { const t = hdr ? hdr.offsetHeight : 52; root.style.setProperty('--jtop', t + 'px'); document.documentElement.style.setProperty('--jbottom', t + root.offsetHeight + 12 + 'px'); };
    place();
    const show = (follow) => {
      if (!document.body.contains(root)) return stop();
      const steps = journey(js.phase), s = steps[js.i];
      document.querySelectorAll('.stk [data-l], .stk [data-hop]').forEach((e) => e.classList.remove('on', 'was'));
      steps.slice(0, js.i).forEach((p) => document.querySelectorAll(`.stk [data-l="${p.l}"]`).forEach((e) => e.classList.add('was')));
      if (!s) return;
      const act = [...document.querySelectorAll(`.stk [data-l="${s.l}"]`)];
      act.forEach((e) => { e.classList.remove('was'); e.classList.add('on'); });
      // keep the active layer on screen once the reader has started stepping
      if (follow && act[0]) act[0].scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (s.hop) document.querySelectorAll(`.stk [data-hop="${s.hop}"]`).forEach((e) => e.classList.add('on'));
      const cap = document.getElementById('jcap');
      cap.innerHTML = s.html; cap.classList.remove('anim-in'); void cap.offsetWidth; cap.classList.add('anim-in');
      document.getElementById('jcount').textContent = `step ${js.i + 1} / ${steps.length}`;
      const first = (FW.paths[js.phase] || []).find((x) => x[0] !== '@');
      const fl = first && G.flowLink && G.flowLink('gchips', first);
      if (fl) document.getElementById('jflow').href = fl;
    };
    root.querySelectorAll('[data-jp]').forEach((b) => b.addEventListener('click', () => {
      js.phase = b.dataset.jp; js.i = 0;
      root.querySelectorAll('[data-jp]').forEach((x) => x.classList.toggle('on', x === b));
      show();
    }));
    const step = (d) => { const n = journey(js.phase).length; js.i = Math.max(0, Math.min(n - 1, js.i + d)); show(true); };
    document.getElementById('jnext').addEventListener('click', () => { stop(); step(1); });
    document.getElementById('jprev').addEventListener('click', () => { stop(); step(-1); });
    document.getElementById('jplay').addEventListener('click', (e) => {
      if (js.timer) return stop();
      if (js.i >= journey(js.phase).length - 1) js.i = -1;
      e.target.textContent = '⏸ Pause';
      step(1);
      js.timer = setInterval(() => { if (js.i >= journey(js.phase).length - 1) return stop(); step(1); }, 1400);
    });
    stop();
    show();
  }

  function phases() {
    const E = { gchips: G.CF.entries || {}, arm: (A && A.callflow.entries) || {} };
    return `<div class="tablewrap"><table><thead><tr><th>phase</th><th>framework starts at</th><th>enters the HAL via</th><th>gchips</th>${A ? '<th>Arm r56p0</th>' : ''}<th>walk it</th></tr></thead><tbody>
      ${G.CF.phases.map(([ph, label]) => {
        const p = FW.paths[ph] || [];
        const first = fwStep(p.find((x) => x[0] !== '@'));
        const marks = p.filter((x) => x[0] === '@').map((x) => x.slice(1));
        return `<tr><td><b>${esc(label)}</b></td><td>${first ? fnCell(first) : '—'}</td>
          <td class="small">${marks.map((m) => esc(FW.markers[m])).join('<br>')}</td>
          <td class="small">${marks.map((m) => fnCell(gStep(E.gchips[m]))).join('<br>')}</td>
          ${A ? `<td class="small">${marks.map((m) => fnCell(aStep(E.arm[m]))).join('<br>')}</td>` : ''}
          <td>${first ? flowBtn('gchips', first.id, 'gchips') : ''} ${A && first ? flowBtn('arm', first.id, 'Arm') : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function loading() {
    const ids = FW.paths.setup.filter((x) => x[0] !== '@');
    const g = gStep('mapper_suffix'), a = aStep('mapper_suffix');
    return `<p>What happens the first time a process touches GraphicBufferAllocator or GraphicBufferMapper. Each step's notes come from the cited lines.</p>
      <ol class="steps">${ids.map((id) => { const s = fwStep(id); return `<li><b class="mono">${esc(s.function)}</b> ${src(s.def)}<div class="small">${esc(s.description)}</div>
        <ul class="small">${s.stops.map((t) => `<li>${src({ ...s.def, line: t.line, end: undefined }, String(t.line))} ${esc(t.note)}</li>`).join('')}</ul></li>`; }).join('')}</ol>
      <div class="grid2">
        <div class="panel"><b>gchips</b> answers <code>getIMapperLibrarySuffix</code> with <code>"pixel"</code> → <code>mapper.pixel.so</code> ${g ? src(g.def) : ''}</div>
        ${a ? `<div class="panel"><b>Arm r56p0</b> answers <code>"arm"</code> → <code>mapper.arm.so</code>, only when built with <code>GRALLOC_STABLEC_MAPPER_ENABLED=1</code> ${src(a.def)}</div>` : ''}
      </div>
      <h3>Mapper version fallback</h3>
      <p class="small">GraphicBufferMapper tries each wrapper in this order and keeps the first whose <code>isLoaded()</code> is true; none at all is fatal.</p>
      <ol class="small">${R.mapper_versions.map((v) => `<li><span class="mono">${esc(v.wrapper)}</span> (gralloc ${v.version}) ${src(v.loc)}</li>`).join('')}</ol>`;
  }

  function iface(rows, which) {
    return `<div class="tablewrap"><table><thead><tr><th>${which}</th><th>called by libui</th><th>gchips</th>${A ? '<th>Arm r56p0</th>' : ''}</tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="mono">${esc(r.name)}</td>
        <td class="small">${r.framework.length ? r.framework.map((c) => `${src(c.loc)} <span class="muted">in ${esc(c.from || '?')}</span>`).join('<br>') : '<span class="muted">not called by libui</span>'}</td>
        <td class="small">${r.gchips ? src(r.gchips) : (r.name === 'getInterfaceVersion' ? '<span class="muted">generated by AIDL</span>' : '<span class="muted">—</span>')}</td>
        ${A ? `<td class="small">${r.arm ? src(r.arm) : (r.name === 'getInterfaceVersion' ? '<span class="muted">generated by AIDL</span>' : '<span class="muted">not found</span>')}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>`;
  }

  // Where both HALs keep mutable metadata: one shared dma-buf per buffer holding struct shared_metadata.
  function storage() {
    const SM = G.CF.shared_metadata, AL = (A && A.shared_metadata_layout) || [];
    if (!SM) return '';
    const hi = AL.find((v) => /> 36/.test(v.variant)), lo = AL.find((v) => /≤ 36/.test(v.variant));
    // The ≤ 36 variant lists only the members after the #if; members below its first offset are common to both.
    const split = lo ? Math.min(...lo.fields.filter((x) => x.offset != null).map((x) => x.offset)) : Infinity;
    const aRow = (f) => {
      const h = hi && hi.fields.find((x) => x.field === f), l = lo && lo.fields.find((x) => x.field === f);
      if (!h && !l) return null;
      const off = (x) => (x.offset == null ? '' : `@${x.offset}, `) + `${x.size} B`;
      return h && l && (h.offset !== l.offset || h.size !== l.size) ? `API > 36: ${off(h)} ${src(h.loc)}<br>API ≤ 36: ${off(l)} ${src(l.loc)}` : `${off(h || l)} ${src((h || l).loc)}${!l && lo && h.offset != null && h.offset >= split ? ' <span class="small muted">(API > 36 only)</span>' : ''}`;
    };
    const names = SM.fields.map((f) => f.field);
    (hi ? hi.fields : []).concat(lo ? lo.fields : []).forEach((f) => { if (!names.includes(f.field)) names.push(f.field); });
    const fl = (impl, id, t) => { const h = G.flowLink && G.flowLink(impl, id); return h ? `<a href="${h}">${esc(t)}</a>` : esc(t); };
    return `<p class="small">Both HALs keep the values that can change after allocation (dataspace, crop, blend mode, HDR, name…) in a <b>second dma-buf</b> per buffer, laid out as <code>struct shared_metadata</code>. Every process that imports the buffer maps the same bytes, so a value set in one process is seen in the others.</p>
      <div class="tablewrap"><table><thead><tr><th>field</th><th>gchips ${src(SM.struct, 'SharedMetadata_struct.h')}</th>${A ? '<th>Arm r56p0 (offset, size)</th>' : ''}</tr></thead><tbody>
      ${names.map((n) => { const g = SM.fields.find((f) => f.field === n), a = A ? aRow(n) : null;
        return `<tr><td class="mono">${esc(n)}</td><td class="small">${g ? `<span class="mono">${esc(g.type)}</span> ${src(g.loc)}` : '<span class="muted">—</span>'}</td>${A ? `<td class="small mono">${a || '<span class="muted">—</span>'}</td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>
      <ul class="small">
        <li><b>Offsets:</b> Arm's come from its enabled <code>static_assert</code>s. gchips' matching asserts are compiled out with <code>#if 0</code> ${src(SM.asserts_disabled)}, and its first two members are Exynos video structs defined outside gralloc, so byte offsets for gchips are not derived here.</li>
        <li><b>When it is mapped:</b> gchips maps the metadata dma-buf on first use — ${fl('gchips', 'metadata_addr', 'get_metadata_addr')} → ${fl('gchips', 'map_metadata', 'map_metadata_locked')}. Arm maps it during import — ${fl('arm', 'import_buffer', 'import_buffer')}.</li>
        <li><b>Reading a value:</b> gchips' getters call <code>.value()</code> on the returned address without checking it (${fl('gchips', 'shm_get_dataspace', 'get_dataspace')}). Arm's read <code>attr_base</code> directly (${fl('arm', 'shm_get_dataspace', 'get_dataspace')}).</li>
        <li><b>Size:</b> gchips allocates shared metadata + the client's reserved region ${src(SM.attr_size)}, plus 32 KiB when <code>GRALLOC_USAGE_ROIINFO</code> is set ${src(G.L('gralloc4/src/hidl_common/Allocator.cpp', 128, 131))} — that is where <code>get_video_roiinfo</code> points, after the struct and the reserved region.</li>
      </ul>`;
  }

  function metadata() {
    const M = R.metadata;
    const arm = new Map(((A && A.metadata) || []).filter((m) => m.kind === 'standard').map((m) => [m.name, m]));
    const types = [...new Set([...M.framework.map((r) => r.type), ...Object.keys(M.gchips_get), ...Object.keys(M.gchips_set), ...arm.keys()])];
    const acc = (t, op) => M.framework.filter((r) => r.type === t && r.op === op).map((r) => `<span class="mono">${esc(r.method)}</span> ${src(r.loc)}`).join('<br>') || '<span class="muted">—</span>';
    return `<p class="small">Standard metadata (<code>StandardMetadataType</code>) through the stable-C mapper. “libui” = the typed accessor in Gralloc5Mapper; gchips get = a branch in <code>getStandardMetadataHelper</code>
      (${src(gStep('std_helper').def, 'Mapper.cpp')}; other types return UNSUPPORTED), gchips set = the “Supported to set” cases of ${src(gStep('v5_set_std').def, 'setStandardMetadata')}; Arm = its metadata table (see <a href="#/arm/mapper">Arm mapper &amp; metadata</a>).</p>
      <div class="tablewrap"><table><thead><tr><th>type</th><th>libui get</th><th>libui set</th><th>gchips get</th><th>gchips set</th>${A ? '<th>Arm get</th><th>Arm set</th>' : ''}</tr></thead><tbody>
      ${types.map((t) => { const am = arm.get(t); return `<tr><td class="mono small">${esc(t)}</td><td class="small">${acc(t, 'get')}</td><td class="small">${acc(t, 'set')}</td>
        <td class="small">${yes(M.gchips_get[t])}</td><td class="small">${yes(M.gchips_set[t])}</td>
        ${A ? `<td class="small">${am && am.gettable ? yes(am.get || am.loc, am.condition) : '<span class="muted">—</span>'}</td><td class="small">${am && am.settable ? yes(am.set || am.loc, am.condition) : '<span class="muted">—</span>'}</td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>`;
  }

  function parcel() {
    const P = R.parcel;
    return `<p>${src(P.def, 'GraphicBuffer::flatten')} writes a 13-word header (${src(P.size, 'getFlattenedSize')}: 13 + numInts words), then the handle's ints; the fds travel separately as binder fds. ${src(P.unflatten_magic, 'unflatten')} also accepts the older 12-word <code>'GBFR'</code> header.</p>
      <div class="tablewrap"><table><thead><tr><th>word</th><th>value</th><th>line</th></tr></thead><tbody>
      ${P.words.map((w) => `<tr><td>${w.index}</td><td class="mono small">${esc(w.value)}${w.comment ? ` <span class="muted">// ${esc(w.comment)}</span>` : ''}${(w.index === 10 || w.index === 11) && w.value !== '0' ? ' <span class="small muted">(when a handle exists)</span>' : ''}</td><td>${src(w.loc)}</td></tr>`).join('')}
      <tr><td>13…</td><td class="small">handle ints (numInts of them)</td><td>${src({ ...P.def, line: P.def.line + 26, end: P.def.line + 27 })}</td></tr>
      </tbody></table></div>`;
  }

  function checks() {
    const v = fwStep('fw_validate_size');
    return `<h3>allocate2 errors → status_t</h3>
      <div class="tablewrap"><table><thead><tr><th>AIDL AllocationError</th><th>libui status</th><th>line</th></tr></thead><tbody>
      ${R.alloc_errors.map((e) => `<tr><td class="mono small">${e.aidl.map(esc).join(', ')}</td><td class="mono">${esc(e.status)}</td><td>${src(e.loc)}</td></tr>`).join('')}</tbody></table></div>
      <h3>Usage bits</h3>
      <p class="small">makeDescriptor rejects usage bits that are not values of the AIDL <code>BufferUsage</code> enum ${src(R.valid_usage)}, except bits 10 and 13, which are accepted for old callers ${src(R.removed_usage)}. The older allocateHelper path clears those two bits before calling the HAL ${src(fl(GBA, 223, 224))}.</p>
      <h3>Import check (validateBufferSize)</h3>
      <ul class="small">${v.stops.map((t) => `<li>${src({ ...v.def, line: t.line, end: undefined }, String(t.line))} ${esc(t.note)}</li>`).join('')}</ul>`;
  }

  function notes() {
    const items = [
      ['Gralloc5Mapper::preload() is empty (a TODO): zygote cannot use binder to ask the allocator for the library suffix.', fl(G5, 315, 319)],
      ['loadIMapperLibrary calls getIMapperLibrarySuffix on the result of waitForAllocator without checking it for nullptr (waitForAllocator returns nullptr when the service is not declared or too old).', fl(G5, 94, 96)],
      ['getInstance calls the pointer returned by dlsym("AIMapper_loadIMapper") without checking it for nullptr.', fl(G5, 128, 130)],
      ['Gralloc5Mapper::lock always reports bytes-per-pixel and bytes-per-stride as -1; GraphicBuffer::lockAsync derives them from PLANE_LAYOUTS instead.', fl(G5, 608, 609)],
      ['validateBufferSize does not compare usage: the check is commented out because allocators may adjust usage bits.', fl(G5, 578, 588)],
      ['Gralloc5Mapper::isSupported returns OK even when the binder call fails; only *outSupported becomes false.', fl(G5, 744, 749)],
      ['GraphicBufferMapper::unlock without an out-fence waits on the release fence itself, so the call is synchronous.', fl(GBM, 173, 178)],
    ];
    return `<p class="small muted">Read from the code; stated as observations, not claims about intent.</p><ul class="small">${items.map(([t, l]) => `<li>${esc(t)} ${src(l)}</li>`).join('')}</ul>`;
  }

  G.views.framework = () => `<h1>Android framework → gralloc HAL</h1>
    <p class="lede">How Android's graphics library <b>libui</b> reaches the vendor gralloc: <code>GraphicBuffer</code> → <code>GraphicBufferAllocator</code> / <code>GraphicBufferMapper</code> → <code>Gralloc5Allocator</code> / <code>Gralloc5Mapper</code> → AIDL <code>IAllocator</code> (binder) and the stable-C <code>AIMapper</code> v5 (in-process). Parsed from AOSP frameworks/native ${esc(FW.meta.branch)} @ <code>${esc(FW.meta.commit.slice(0, 12))}</code>; <span class="mono">fw:</span> links open that commit.</p>
    <nav class="toc small">${SECTIONS.map(([k, t]) => `<a href="#/framework" data-sec="${k}">${esc(t)}</a>`).join('')}</nav>
    <h2 id="fw-stack">The stack</h2><div class="jwrap">${journeyPanel()}${stack()}</div>
    <h2 id="fw-phases">Phase by phase</h2><p class="small">Every phase of the <a href="#/flow">code flow</a> starts in libui and crosses into the vendor code at these points.</p>${phases()}
    <h2 id="fw-load">Loading the HAL</h2>${loading()}
    <h2 id="fw-aimapper">AIMapper v5 functions</h2><p class="small">All functions of the stable-C mapper table that libui calls or either vendor implements.</p>${iface(R.aimapper, 'AIMapper v5')}
    <h2 id="fw-iallocator">IAllocator methods</h2>${iface(R.iallocator, 'IAllocator')}
    <h2 id="fw-metadata">Metadata support</h2>${metadata()}
    <h2 id="fw-storage">Metadata storage</h2>${storage()}
    <h2 id="fw-parcel">GraphicBuffer over binder</h2>${parcel()}
    <h2 id="fw-checks">Checks &amp; errors</h2>${checks()}
    <h2 id="fw-notes">Code observations</h2>${notes()}`;

  G.AFTER.framework = (params) => {
    journeyBind();
    document.querySelectorAll('.toc [data-sec]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const el = document.getElementById('fw-' + a.dataset.sec);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const s = params && params.get('s');
    const el = s && document.getElementById('fw-' + s);
    if (el) setTimeout(() => el.scrollIntoView(), 0); // after render() has reset the scroll position
  };
})();
