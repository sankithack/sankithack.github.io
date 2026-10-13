/* app.js — views for the gchips gralloc explorer.  No framework; hash routing. */
(function () {
  'use strict';
  const FD = window.GRALLOC_FORMATS, CF = window.GRALLOC_CALLFLOW, GL = window.GRALLOC_GLOSSARY;
  const E = window.GrallocEngine;
  E.init(FD);
  const U = E.U(), V = E.V();
  const BROWSE = FD.meta.browse;
  const app = document.getElementById('app');

  /* ---------------- helpers ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (file) => file.replace(/^gralloc4\/src\//, '').replace(/^gralloc4\//, '');
  function src(loc, label) {
    if (!loc) return '<span class="badge b-unknown">no source location</span>';
    const t = label || `${short(loc.file)}:${loc.line}${loc.end ? '-' + loc.end : ''}`;
    const href = BROWSE ? `${BROWSE}${loc.file}#${loc.line}` : '#';
    return `<a class="src" href="${href}" target="_blank" rel="noopener" title="${esc(loc.file)}:${loc.line}">${esc(t)}</a>`;
  }
  const L = (file, line, end) => ({ file, line, end });
  const P = {
    FMTS: 'gralloc4/src/core/mali_gralloc_formats.cpp', ALLOC: 'gralloc4/src/core/mali_gralloc_bufferallocation.cpp',
    FI: 'gralloc4/src/core/format_info.cpp', FIH: 'gralloc4/src/core/format_info.h', MGF: 'gralloc4/src/mali_gralloc_formats.h',
    ION: 'gralloc4/src/allocator/mali_gralloc_ion.cpp', USG: 'gralloc4/src/mali_gralloc_usages.h', EXA: 'gralloc4/src/core/exynos_format_allocation.h',
    ACC: 'gralloc4/src/core/mali_gralloc_bufferaccess.cpp', ALC: 'gralloc4/src/hidl_common/Allocator.cpp', MMD: 'gralloc4/src/hidl_common/MapperMetadata.cpp',
    MAP: 'gralloc4/src/hidl_common/Mapper.cpp', CAPS: 'gralloc4/src/capabilities/src/gralloc_capabilities.cpp', DRM: 'gralloc4/interfaces/libs/drmutils/src/drmutils.cpp',
    REF: 'gralloc4/src/core/mali_gralloc_reference.cpp', BUF: 'gralloc4/src/mali_gralloc_buffer.h', EXF: 'include/exynos_format.h',
  };
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const hex = (n) => '0x' + BigInt(n).toString(16);
  const byName = new Map(FD.formats.map((f) => [f.name, f]));
  const shortName = (n) => n.replace('MALI_GRALLOC_FORMAT_INTERNAL_', '').replace('HAL_PIXEL_FORMAT_', '');
  const badge = (t, cls) => `<span class="badge ${cls || ''}">${esc(t)}</span>`;
  const srcBadge = (s) => s === 'manual' ? badge('manual — not in repo', 'b-manual') : s === 'unknown' ? badge('not confirmed in source', 'b-unknown') : '';
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gx.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gx.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  /* ---------------- shared state ---------------- */
  const state = {
    flags: Object.assign({}, E.DEFAULT_FLAGS, store.get('flags', {})),
    calc: Object.assign({ w: 1920, h: 1080, layers: 1, usage: { read: 'often', write: 'often', bits: ['GRALLOC_USAGE_HW_TEXTURE'] } }, store.get('calc', {})),
  };
  const saveCalc = () => store.set('calc', state.calc);

  /* ---------------- usage model ---------------- */
  const READ = { none: 0n, rarely: U.GRALLOC_USAGE_SW_READ_RARELY, often: U.GRALLOC_USAGE_SW_READ_OFTEN };
  const WRITE = { none: 0n, rarely: U.GRALLOC_USAGE_SW_WRITE_RARELY, often: U.GRALLOC_USAGE_SW_WRITE_OFTEN };
  const SKIP = /^GRALLOC_USAGE_SW_(READ|WRITE)_(RARELY|OFTEN|MASK)$/;
  // Checkbox list: every usage flag the repo names, deduplicating aliases with equal value.
  const FLAG_LIST = (() => {
    const out = [], seen = new Map();
    for (const f of FD.usages.flags) {
      if (SKIP.test(f.name)) continue;
      const key = f.value == null ? f.name : f.kind + ':' + f.value;
      if (seen.has(key)) { seen.get(key).aliases.push(f.name); continue; }
      const e = Object.assign({ aliases: [] }, f);
      seen.set(key, e); out.push(e);
    }
    return out;
  })();
  const flagByName = (n) => FLAG_LIST.find((f) => f.name === n || f.aliases.includes(n));
  function usageValue(m) {
    let v = READ[m.read] | WRITE[m.write];
    for (const n of m.bits) { const f = flagByName(n); if (f && f.value != null) v |= BigInt(f.value); }
    return v;
  }
  const PRESETS = {
    'CPU read/write only': { read: 'often', write: 'often', bits: [] },
    'App window (GPU render + HWC overlay)': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER'] },
    'GPU texture (+CPU write)': { read: 'none', write: 'often', bits: ['GRALLOC_USAGE_HW_TEXTURE'] },
    'GPU render target only': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_RENDER'] },
    'HWC overlay only': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_COMPOSER'] },
    'Client target (FB)': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_FB'] },
    'Camera output + CPU read': { read: 'often', write: 'none', bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE'] },
    'Camera → video encoder (MFC)': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'GRALLOC_USAGE_HW_VIDEO_ENCODER'] },
    'Video decoder → display': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER'] },
    'BIG decoder → display': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_GOOGLE_IP_BIG', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER'] },
    'Protected video → HWC': { read: 'none', write: 'none', bits: ['GRALLOC_USAGE_PROTECTED', 'GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_HW_COMPOSER'] },
    'No usage (0)': { read: 'none', write: 'none', bits: [] },
  };

  function usagePicker(m, id, compact) {
    const v = usageValue(m);
    const radios = (k, title) => `<span class="chk"><b>${title}</b></span>` + ['none', 'rarely', 'often'].map((o) =>
      `<label class="chk"><input type="radio" name="${id}-${k}" data-u="${k}" value="${o}" ${m[k] === o ? 'checked' : ''}>${o}</label>`).join('');
    const items = FLAG_LIST.map((f) => {
      const dis = f.value == null;
      const label = shortUsage(f.name) + (f.aliases.length ? ' (= ' + f.aliases.map(shortUsage).join(', ') + ')' : '');
      return `<label class="chk" title="${esc((f.note || '') + ' ' + (f.value_hex || 'value unknown'))}"><input type="checkbox" data-flag="${esc(f.name)}" ${m.bits.includes(f.name) ? 'checked' : ''} ${dis ? 'disabled' : ''}>
        <span class="mono">${esc(label)}</span> <span class="muted small">${f.value_hex || '?'}</span>${f.source !== 'parsed' ? ' ' + (f.value == null ? badge('value not in repo', 'b-unknown') : badge(f.valid_usage_comment ? 'bit confirmed by comment' : 'manual', f.valid_usage_comment ? '' : 'b-manual')) : ''}</label>`;
    }).join('');
    return `<div class="panel" id="${id}">
      <div class="row"><b>Usage</b> <span class="mono">${hex(v)}</span>
        <select data-preset><option value="">Presets…</option>${Object.keys(PRESETS).map((k) => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div class="row">${radios('read', 'CPU read:')}</div><div class="row">${radios('write', 'CPU write:')}</div>
      <details ${compact ? '' : 'open'}><summary>Other usage flags (${m.bits.length} set)</summary><div class="flags">${items}</div>
      <p class="small muted">Values: AOSP <code>BufferUsage</code> constants are defined outside this repo; their bit positions are confirmed by the comments in ${src(FD.usages.valid_usage_loc, 'VALID_USAGE')}. CPU READ/WRITE RARELY/OFTEN encodings (2/3, 0x20/0x30) are AOSP values, <b>not confirmed in source</b>. Private bits are parsed from ${src(L(P.USG, 39, 58), 'mali_gralloc_usages.h')}.</p></details></div>`;
  }
  const shortUsage = (n) => n.replace(/^GRALLOC_USAGE_/, '').replace(/^MALI_GRALLOC_USAGE_/, 'MALI_').replace(/^GS101_GRALLOC_USAGE_/, 'GS101_');
  function bindUsagePicker(id, m, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('input[data-u]').forEach((i) => i.addEventListener('change', () => { m[i.dataset.u] = i.value; onChange(); }));
    el.querySelectorAll('input[data-flag]').forEach((i) => i.addEventListener('change', () => {
      const n = i.dataset.flag;
      m.bits = m.bits.filter((x) => x !== n);
      if (i.checked) m.bits.push(n);
      onChange();
    }));
    el.querySelector('select[data-preset]').addEventListener('change', (ev) => {
      const p = PRESETS[ev.target.value];
      if (p) { m.read = p.read; m.write = p.write; m.bits = p.bits.slice(); onChange(); }
    });
  }

  function dimsPicker(id, withLayers) {
    const c = state.calc;
    return `<div class="row" id="${id}"><label>Width <input type="number" min="1" data-d="w" value="${c.w}"></label>
      <label>Height <input type="number" min="1" data-d="h" value="${c.h}"></label>
      ${withLayers ? `<label>Layers <input type="number" min="1" max="16" data-d="layers" value="${c.layers}"></label>` : ''}
      <span class="small muted">presets:</span> ${[[1920, 1080], [1280, 720], [3840, 2160], [4032, 3024], [1000, 999]].map(([w, h]) => `<button data-wh="${w}x${h}">${w}×${h}</button>`).join(' ')}</div>`;
  }
  function bindDims(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('input[data-d]').forEach((i) => i.addEventListener('change', () => {
      const v = Math.max(1, Math.floor(Number(i.value) || 1));
      state.calc[i.dataset.d] = v; onChange();
    }));
    el.querySelectorAll('button[data-wh]').forEach((b) => b.addEventListener('click', () => {
      const [w, h] = b.dataset.wh.split('x').map(Number); state.calc.w = w; state.calc.h = h; onChange();
    }));
  }

  function flagsSummary() {
    const on = Object.keys(state.flags).filter((k) => state.flags[k] !== E.DEFAULT_FLAGS[k]);
    return `<div class="small muted">Build-flag assumptions: ${on.length ? on.map((k) => `<code>${k}=${state.flags[k]}</code>`).join(' ') : 'none set (code as compiled with no board flags)'} — <a href="#/settings">change</a></div>`;
  }

  function traceList(trace) {
    return `<ol class="trace">${trace.map((t) => `<li class="${/^E:/.test(t.msg) ? 'err' : /^W:/.test(t.msg) ? 'note' : ''}" style="${/^[EW]:/.test(t.msg) ? 'padding:2px 6px;margin:2px 0' : ''}">${esc(t.msg)} ${src(t.cite)}</li>`).join('')}</ol>`;
  }

  /* ---------------- layout visualisation ---------------- */
  const PCOL = ['var(--p0)', 'var(--p1)', 'var(--p2)'];
  function layoutSVG(r, f, reqW, reqH) {
    if (!r.ok) return '';
    const parts = [];
    const W = 760;
    // 1. linear byte map per fd
    let y = 0;
    const svgRows = [];
    for (let fd = 0; fd < r.fd_count; fd++) {
      const total = r.alloc_sizes[fd];
      const segs = [];
      r.planes.forEach((p, i) => {
        if ((p.fd_idx || 0) !== fd) return;
        if (r.format.is_exynos_format) segs.push({ off: p.offset, len: p.size, col: PCOL[i], label: `plane ${i}` });
        else {
          if (p.header) segs.push({ off: p.offset, len: p.header, col: 'var(--hdr)', label: `AFBC hdr ${i}` });
          segs.push({ off: p.offset + (p.header || 0), len: p.body, col: PCOL[i], label: `plane ${i}` });
        }
      });
      if (r.unknown || !total) { svgRows.push(`<text x="0" y="${y + 14}" font-size="12" fill="currentColor">fd ${fd}: size not computable from this repo (SBWC macros are external)</text>`); y += 26; continue; }
      const sc = W / total;
      svgRows.push(`<text x="0" y="${y + 12}" font-size="12" fill="currentColor">fd ${fd} — ${fmt(total)} bytes</text>`);
      y += 16;
      svgRows.push(`<rect x="0" y="${y}" width="${W}" height="26" fill="var(--pad)"/>`);
      for (const s of segs) {
        const x = s.off * sc, w = Math.max(1, s.len * sc);
        svgRows.push(`<rect class="seg" x="${x}" y="${y}" width="${w}" height="26" fill="${s.col}"><title>${esc(s.label)}: offset ${fmt(s.off)}, ${fmt(s.len)} bytes</title></rect>`);
        if (w > 60) svgRows.push(`<text x="${x + 4}" y="${y + 17}" font-size="11" fill="#fff">${esc(s.label)} @${fmt(s.off)}</text>`);
      }
      y += 34;
    }
    parts.push(`<svg viewBox="0 0 ${W} ${y}" width="100%" style="max-width:${W}px;color:var(--ink)" role="img" aria-label="buffer byte map">${svgRows.join('')}</svg>`);
    parts.push(`<div class="legend small"><span><i style="background:var(--p0)"></i>plane 0</span><span><i style="background:var(--p1)"></i>plane 1</span><span><i style="background:var(--p2)"></i>plane 2</span><span><i style="background:var(--hdr)"></i>AFBC header</span><span><i style="background:var(--pad)"></i>padding / EXT_SIZE / unused</span></div>`);

    // 2. per-plane 2D view
    const cells = [];
    r.planes.forEach((p, i) => {
      if (!p.alloc_height && !p.byte_stride) { cells.push(`<div class="panel small"><b>plane ${i}</b>: all fields zero (set by return value only — see trace)</div>`); return; }
      const isAfbc = r.alloc_type && r.alloc_type.is_afbc;
      const sub = i > 0 ? [f.hsub || 1, f.vsub || 1] : [1, 1];
      let outerW, outerH, inW, inH, unit;
      if (isAfbc) { outerW = p.alloc_width; outerH = p.alloc_height; inW = Math.ceil(reqW / sub[0]); inH = Math.ceil(reqH / sub[1]); unit = 'pixels'; }
      else {
        outerW = p.byte_stride; outerH = p.alloc_height; unit = 'bytes';
        inW = Math.ceil(reqW / sub[0]) * (f.bpp[i] || 0) / 8; inH = Math.ceil(reqH / sub[1]);
      }
      if (r.unknown) { outerW = p.alloc_width; unit = 'pixels'; inW = reqW; inH = Math.ceil(reqH / sub[1]); }
      inW = Math.min(inW, outerW); inH = Math.min(inH, outerH);
      const BW = 220, sc = BW / Math.max(outerW, 1), BH = Math.max(24, Math.min(150, outerH * sc));
      const sy = BH / Math.max(outerH, 1);
      let sbGrid = '';
      if (isAfbc && r.alloc_type) {
        const sbw = r.alloc_type.primary_type === 'AFBC_WIDEBLK' ? 32 : r.alloc_type.primary_type === 'AFBC_EXTRAWIDEBLK' || (i > 0 && r.alloc_type.is_multi_plane) ? 64 : 16;
        const sbh = sbw === 32 ? 8 : sbw === 64 ? 4 : 16;
        if (outerW / sbw * outerH / sbh < 2500) {
          for (let x = sbw; x < outerW; x += sbw) sbGrid += `<line x1="${x * sc}" y1="0" x2="${x * sc}" y2="${BH}" stroke="#fff" stroke-opacity=".25"/>`;
          for (let yy = sbh; yy < outerH; yy += sbh) sbGrid += `<line x1="0" y1="${yy * sy}" x2="${BW}" y2="${yy * sy}" stroke="#fff" stroke-opacity=".25"/>`;
        }
      }
      cells.push(`<div class="panel"><b>plane ${i}</b> <span class="small muted">${unit}</span><div class="planecell" style="margin-top:6px">
        <svg viewBox="0 0 ${BW + 2} ${BH + 2}" width="${BW + 2}" height="${BH + 2}" style="max-width:100%;display:block">
          <rect x="1" y="1" width="${BW}" height="${BH}" fill="var(--pad)"/>
          <rect x="1" y="1" width="${inW * sc}" height="${inH * sy}" fill="${PCOL[i]}"/>${sbGrid}
        </svg>
        <div class="kv small"><div>outer (allocated)</div><div>${fmt(outerW)} × ${fmt(outerH)} ${unit}</div>
        <div>requested content</div><div>${fmt(Math.round(inW))} × ${fmt(inH)} ${unit} <span class="muted">(illustrative: request ÷ subsampling${unit === 'bytes' ? ' × bpp/8' : ''})</span></div>
        <div>row padding</div><div>${fmt(Math.round(outerW - inW))} ${unit}</div><div>height padding</div><div>${fmt(outerH - inH)} rows</div>
        ${isAfbc ? `<div>superblock grid</div><div>white lines (when &lt; 2500 blocks)</div>` : ''}</div></div></div>`);
    });
    parts.push(`<div class="grid2">${cells.join('')}</div>`);
    if (f.name === 'HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SP_M_TILED') parts.push(`<div class="note small">For this tiled format <code>byte_stride = width × 16</code> (${src(L(P.EXA, 320))}) — the pitch of a 16-row tile row, so the 2-D view above is not a row-by-row picture.</div>`);
    return parts.join('');
  }

  function planeTable(r) {
    if (!r.ok) return '';
    const rows = r.planes.map((p, i) => `<tr><td>${i}</td><td>${fmt(p.offset)}</td><td>${p.fd_idx || 0}</td><td>${r.unknown && !p.byte_stride ? '<span class="badge b-unknown">unknown</span>' : fmt(p.byte_stride)}</td><td>${fmt(p.alloc_width)}</td><td>${fmt(p.alloc_height)}</td>
      <td>${r.format.is_exynos_format ? (r.unknown ? '<span class="badge b-unknown">unknown</span>' : fmt(p.size)) : `${fmt(p.body)}${p.header ? ' + hdr ' + fmt(p.header) : ''}`}</td></tr>`).join('');
    return `<div class="tablewrap"><table><thead><tr><th>plane</th><th>offset</th><th>fd</th><th>byte_stride</th><th>alloc_width</th><th>alloc_height</th><th>${r.format.is_exynos_format ? 'plane_info.size' : 'body (+AFBC header)'}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">${r.format.is_exynos_format ? 'Exynos path: <code>plane_info[].size</code> is set by setup_*().' : 'Generic path: <code>calc_allocation_size</code> sets offset/byte_stride/alloc_width/alloc_height; <code>plane_info[].size</code> stays 0 (sizes shown are its local body/header values).'}</p>`;
  }

  function resultSummary(r) {
    if (!r.ok) return `<div class="err"><b>Allocation fails:</b> ${esc(r.error)}</div>`;
    const f = r.format;
    const mods = E.modNames(r.alloc_format);
    return `<div class="kv">
      <div>selected format</div><div><a href="#/format/${encodeURIComponent(f.name)}">${esc(f.name)}</a> <span class="mono">${hex(r.alloc_format)}</span> ${mods.map((m) => badge(m, 'b-afbc')).join('')}</div>
      <div>allocation type</div><div>${r.alloc_type.primary_type}${r.alloc_type.is_tiled ? ', tiled headers' : ''}${r.alloc_type.is_multi_plane && r.alloc_type.is_afbc ? ', multi-plane' : ''}</div>
      <div>fd count</div><div>${r.fd_count}</div>
      <div>alloc_sizes</div><div>${r.unknown ? '<span class="badge b-unknown">Not confirmed in source (SBWC)</span>' : r.alloc_sizes.map(fmt).join(' + ') + ' bytes'}</div>
      <div>total</div><div>${r.unknown ? '—' : '<b>' + fmt(r.total) + ' bytes</b> (' + (r.total / 1048576).toFixed(2) + ' MiB)'}</div>
      <div>pixel stride (reported)</div><div>${fmt(r.pixel_stride)} ${src(L(P.ALLOC, 1143))}</div>
      <div>CPU lock</div><div>${r.lockable ? badge('allowed', 'b-ok') : badge('rejected: AFBC buffers cannot be locked', 'b-bad')} ${src(L(P.ACC, 150))}</div>
      <div>dma-buf heap</div><div>${esc(r.heap.name)} ${r.heap.note ? '<span class="small muted">' + esc(r.heap.note) + '</span>' : ''} ${src(r.heap.cite)}</div>
      <div>default dataspace</div><div>${r.dataspace.standard}${r.dataspace.range ? ' / ' + r.dataspace.range : ''} ${src(r.dataspace.cite)}</div>
      ${r.drm_modifier ? `<div>DRM modifier</div><div class="mono small">${esc(r.drm_modifier)} ${src(L(P.DRM, 117))}</div>` : ''}
    </div>${(r.exynos_errors || []).map((e) => `<div class="err small">${esc(e)}</div>`).join('')}`;
  }

  function calcRun(fname, usage) {
    const f = byName.get(fname);
    return E.allocate({ width: state.calc.w, height: state.calc.h, layer_count: state.calc.layers, hal_format: f ? f.value : V[fname], usage }, state.flags);
  }

  /* ---------------- views ---------------- */
  const views = {};

  views.overview = () => {
    const c = FD.counts;
    const s = CF.steps;
    const step = (id) => s.find((x) => x.id === id);
    return `<h1>Google gchips gralloc — how buffers are described and allocated</h1>
    <p>This site is generated from <a href="${FD.meta.repo}">${esc(FD.meta.repo)}</a> at commit <code>${esc(FD.meta.commit)}</code> by <code>tools/extract.py</code>. Every value links to the line it came from. Items marked ${badge('manual — not in repo', 'b-manual')} come from AOSP headers outside this repository; items marked ${badge('not confirmed in source', 'b-unknown')} cannot be determined from it at all.</p>

    <h2>What gralloc is (in this repo)</h2>
    <div class="grid2">
      <div class="panel"><b>Allocator service</b> — a binder service (<code>pixel_gralloc_allocator</code>, ${src(L('gralloc4/service/aidl/service.cpp', 20))}) implementing AIDL <code>IAllocator</code> V1 or V2 (${src(step('aidl_allocate').def, 'GrallocAllocator.cpp')}, ${src(step('aidl_allocate2').def, 'GrallocAllocator2.cpp')}). It turns a request (width, height, format, usage, layers) into dma-buf file descriptors plus a <code>private_handle_t</code> describing the layout.</div>
      <div class="panel"><b>Mapper library</b> — loaded into each client process: HIDL <code>IMapper@4.0</code> (${src(L('gralloc4/src/4.x/GrallocMapper.cpp', 271), 'HIDL_FETCH_IMapper')}) or stable-C <code>AIMapper</code> v5 (${src(L('gralloc4/src/stable-c/GrallocMapper.cpp', 283), 'AIMapper_loadIMapper')}). It imports handles, locks/unlocks for CPU access, frees, and exposes metadata (plane layouts, dataspace, HDR...).</div>
    </div>

    <h2>Where it sits in the graphics stack</h2>
    <p class="note small"><b>Android background (not from this repo):</b> app/framework components (SurfaceFlinger, HWC, camera HAL, codecs) request buffers through BufferQueue / <code>GraphicBuffer</code>, which call IAllocator and IMapper. The middle and right of the diagram is what this repo implements; the IP-block names on the left are the producers/consumers gralloc derives from usage flags (${src(L(P.FMTS, 42, 59))}).</p>
    ${archSVG()}

    <h2>Repository layout</h2>
    <div class="tablewrap"><table><thead><tr><th>Path</th><th>Role</th></tr></thead><tbody>
      <tr><td><code>gralloc4/src/core/</code></td><td><code>libgralloc_core</code>: format tables (${src(FD.table_locs.formats, 'formats[]')}), format selection (${src(step('select_format').def, 'mali_gralloc_select_format')}), size/stride math (${src(step('calc_size').def, 'calc_allocation_size')}), lock (${src(step('gralloc_lock').def, 'mali_gralloc_lock')}), reference counting (${src(L(P.REF, 32), 'BufferManager')})</td></tr>
      <tr><td><code>gralloc4/src/allocator/</code></td><td><code>libgralloc_allocator</code>: dma-buf heap selection and mmap (${src(step('heap').def, 'mali_gralloc_ion.cpp')})</td></tr>
      <tr><td><code>gralloc4/src/capabilities/</code></td><td><code>libgralloc_capabilities</code>: per-IP AFBC capability masks (${src(L(P.CAPS, 42), 'get_ip_capabilities')})</td></tr>
      <tr><td><code>gralloc4/src/hidl_common/</code></td><td>shared Allocator / Mapper / metadata code used by both mapper versions</td></tr>
      <tr><td><code>gralloc4/src/4.x/</code>, <code>stable-c/</code>, <code>aidl/</code></td><td>mapper4 (HIDL), mapper5 (stable-C) and AIDL allocator front ends, chosen by soong variable <code>pixel_gralloc.mapper_version</code> (${src(L('gralloc4/Android.bp', 75, 100), 'gralloc4/Android.bp')})</td></tr>
      <tr><td><code>gralloc4/interfaces/</code></td><td>Arm AIDL metadata types and <code>libgralloc_drmutils</code> (DRM fourcc/modifier, ${src(FD.drm_table_loc, 'drmutils.cpp')})</td></tr>
      <tr><td><code>include/exynos_format.h</code></td><td>Exynos (0x101–0x172) and Google (0x301–0x304) format IDs (${src(L(P.EXF, 26, 111))})</td></tr>
      <tr><td><code>libvendorgraphicbuffer/</code></td><td>client-side helper for vendor HALs reading handle fields (gralloc4/ and gralloc5/ variants)</td></tr>
      <tr><td><code>libexynosutils/</code>, <code>videoapi/</code></td><td>not part of gralloc (V4L2 utils, video metadata)</td></tr>
    </tbody></table></div>

    <h2>How many formats?</h2>
    <div class="tablewrap"><table><tbody>
      <tr><td>Rows in <code>formats[]</code> — base formats gralloc can lay out (this is the count used on this site)</td><td><b>${c.formats_table}</b></td><td>${src(FD.table_locs.formats)}</td></tr>
      <tr><td>Rows in <code>formats_ip_support[]</code> (same IDs; mismatches: ${c.formats_without_ip_row.length + c.ip_rows_without_format.length})</td><td>${c.ip_support_table}</td><td>${src(FD.table_locs.ip)}</td></tr>
      <tr><td>Rows in <code>hal_to_internal_format[]</code> (request-side mapping, includes flex formats)</td><td>${c.hal_to_internal_table}</td><td>${src(FD.table_locs.hal_map)}</td></tr>
      <tr><td>Exynos enum values / Google enum values</td><td>${c.exynos_enum} / ${c.google_enum}</td><td>${src(L(P.EXF, 26, 111))}</td></tr>
      <tr><td>Defined IDs with no <code>formats[]</code> row (cannot be allocated)</td><td>${c.defined_only}</td><td><a href="#/formats?tab=defined">list</a></td></tr>
    </tbody></table></div>
    <p class="small">The site shows ${FD.formats.length} formats in the explorer, which equals the ${c.formats_table} rows parsed from ${src(FD.table_locs.formats, 'formats[]')}.</p>

    <h2>What cannot be determined from this repository</h2>
    <ul>
      <li><b>SBWC sizes/strides.</b> ${src(L(P.EXA, 19))} includes <code>&lt;linux/videodev2_exynos_media.h&gt;</code>; the <code>SBWC_*</code>/<code>SBWCL_*</code> size macros and <code>__ALIGN_UP</code> live there, outside this repo. The 16 SBWC formats show structure (fd/plane placement, alloc width/height) but no byte sizes.</li>
      <li><b>Board build flags</b> (<code>MALI_GPU_SUPPORT_AFBC_*</code>, <code>SOC_ZUMA</code>, …) are set in device trees outside the repo. They decide whether AFBC is used. Default here: all off. <a href="#/settings">Change assumptions</a>.</li>
      <li><b>Numeric values of AOSP constants</b> (<code>HAL_PIXEL_FORMAT_*</code>, <code>BufferUsage</code>) are not in the repo; they are shown with a "manual" badge.</li>
      <li><b>Runtime heap availability</b> (<code>find_first_available_heap</code>, ${src(L(P.ION, 72))}).</li>
    </ul>

    <h2>Code observations</h2>
    <p class="small muted">Read from the code; stated as observations, not claims about intent.</p>
    <ul class="small">
      <li>Requesting <code>HAL_PIXEL_FORMAT_YCrCb_420_SP</code> (0x11) maps to <code>MALI_GRALLOC_FORMAT_INTERNAL_NV21</code> (${src(L(P.FI, 234))}) because the only caller passes <code>map_to_internal=true</code> (${src(L(P.FMTS, 1491))}); the 0x11 row in <code>formats[]</code> and its Exynos branch (${src(L(P.ALLOC, 910))}) appear unreachable via <code>mali_gralloc_select_format</code>.</li>
      <li><code>setup_420_sp_tiled</code> sets two planes but returns 3 (${src(L(P.EXA, 341))}); with GPU usage the empty third plane then reaches <code>align_plane_stride</code> with <code>bpp[2]==0</code> (integer division by zero).</li>
      <li><code>prepare_descriptor_exynos_formats</code>'s return value is ignored (${src(L(P.ALLOC, 1112))}), so "SBWC with GPU is invalid" (${src(L(P.ALLOC, 984))}) only logs.</li>
      <li><code>get_num_planes</code> returns 3 for <code>YCrCb_420_SP</code> (${src(L(P.MMD, 68))}) although it is 2-plane.</li>
      <li>The P210 component table lists <code>CB</code> twice (${src(L(P.MMD, 212))}).</li>
      <li><code>EXYNOS_YCbCr_420_P_M</code> (3-plane) reports <code>DRM_FORMAT_NV12</code> (${src(L(P.DRM, 66))}).</li>
      <li>The error-unwind loop in <code>mali_gralloc_ion_map</code> increments <code>fidx</code> instead of <code>cidx</code> (${src(L(P.ION, 513))}).</li>
      <li>AFBC YUV-transform enabling is compiled out with <code>#if 0</code> (${src(L(P.FMTS, 822, 833))}).</li>
    </ul>`;
  };

  function archSVG() {
    const box = (x, y, w, h, t, sub, cls) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${cls === 'bg' ? 'var(--code)' : 'var(--panel)'}" stroke="${cls === 'hi' ? 'var(--accent)' : 'var(--line)'}" stroke-width="${cls === 'hi' ? 2 : 1}"/><text x="${x + w / 2}" y="${y + 18}" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">${t}</text>${sub ? `<text x="${x + w / 2}" y="${y + 34}" text-anchor="middle" font-size="11" fill="var(--muted)">${sub}</text>` : ''}</g>`;
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--muted)" stroke-width="1.5" marker-end="url(#ah)"/>`;
    return `<svg viewBox="0 0 980 360" width="100%" style="max-width:980px;color:var(--ink)" role="img" aria-label="architecture diagram">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>
    <text x="10" y="16" font-size="12" fill="var(--muted)">Clients (Android background) → usage-derived IP</text>
    ${box(10, 26, 200, 40, 'App / GPU (Mali)', 'TEXTURE, RENDER → GPU', 'bg')}
    ${box(10, 76, 200, 40, 'SurfaceFlinger / HWC', 'COMPOSER, FB → DPU', 'bg')}
    ${box(10, 126, 200, 40, 'Camera HAL', 'CAMERA_* → CAM', 'bg')}
    ${box(10, 176, 200, 40, 'Codecs (MFC, BigOcean/Wave)', 'VIDEO_* (+IP_BIG/MFC)', 'bg')}
    ${box(10, 226, 200, 40, 'FaceAuth / TPU', 'GS101 TPU_*', 'bg')}
    ${box(10, 276, 200, 40, 'CPU access', 'SW_READ / SW_WRITE → CPU', 'bg')}
    ${box(270, 60, 230, 50, 'IAllocator (AIDL)', 'GrallocAllocator[2].cpp', 'hi')}
    ${box(270, 200, 230, 50, 'IMapper 4.0 / AIMapper 5', 'GrallocMapper.cpp (per process)', 'hi')}
    ${box(560, 20, 200, 44, 'format selection', 'mali_gralloc_formats.cpp', 'hi')}
    ${box(560, 74, 200, 44, 'size / stride / planes', 'mali_gralloc_bufferallocation.cpp', 'hi')}
    ${box(560, 128, 200, 44, 'IP capabilities', 'gralloc_capabilities.cpp', 'hi')}
    ${box(560, 200, 200, 44, 'refcount / map / lock', 'mali_gralloc_reference/access', 'hi')}
    ${box(560, 254, 200, 44, 'metadata', 'MapperMetadata / SharedMetadata', 'hi')}
    ${box(800, 60, 170, 60, 'dma-buf heaps', 'system, secure, camera…', '')}
    ${box(800, 200, 170, 60, 'kernel dma-buf', 'mmap / DMA_BUF_IOCTL_SYNC', '')}
    ${arrow(210, 100, 268, 85)}${arrow(210, 240, 268, 225)}
    ${arrow(500, 80, 558, 42)}${arrow(500, 85, 558, 96)}${arrow(660, 64, 660, 72)}${arrow(660, 118, 660, 126)}
    ${arrow(500, 225, 558, 222)}${arrow(500, 230, 558, 276)}
    ${arrow(760, 96, 798, 90)}${arrow(760, 222, 798, 230)}
    <text x="270" y="140" font-size="11" fill="var(--muted)">handle (fds + private_handle_t)</text>${arrow(385, 112, 385, 198)}
    <text x="10" y="345" font-size="11" fill="var(--muted)">Highlighted boxes = this repo. Grey boxes = Android background; the usage→IP mapping is from get_producers/get_consumers.</text>
    </svg>`;
  }

  /* ---- formats explorer ---- */
  const CATS = ['RGB', 'YUV', 'RAW/Bayer', 'Depth/Stencil', 'Blob', 'Vendor: Exynos', 'Vendor: Google'];
  const IPS = [['cpu_wr', 'CPU write'], ['cpu_rd', 'CPU read'], ['gpu_wr', 'GPU write'], ['gpu_rd', 'GPU read'], ['dpu_wr', 'DPU write'], ['dpu_rd', 'DPU read'], ['vpu_wr', 'Video write'], ['vpu_rd', 'Video read'], ['cam_wr', 'Camera write']];
  const ipHas = (f, k, flag) => f.ip[k].includes(flag);
  const fstate = { q: '', cat: '', planes: '', comp: '', ip: '' };

  views.formats = (params) => {
    const tab = params.get('tab') || 'supported';
    const tabs = `<div class="tabs">${[['supported', `Supported (${FD.formats.length})`], ['defined', `Defined only (${FD.defined_only.length})`], ['requests', `Request mapping (${FD.hal_requests.length})`]].map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'supported') {
      body = `<div class="panel row">
        <input type="text" id="fq" placeholder="search name / hex value" value="${esc(fstate.q)}" style="min-width:240px">
        <select id="fcat"><option value="">all categories</option>${CATS.map((c) => `<option ${fstate.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select id="fpl"><option value="">any planes</option>${[1, 2, 3].map((n) => `<option ${String(fstate.planes) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select id="fcomp"><option value="">any compression</option>${['AFBC-capable', 'SBWC', 'none'].map((c) => `<option ${fstate.comp === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select id="fip"><option value="">any IP usage</option>${IPS.map(([k, t]) => `<option value="${k}" ${fstate.ip === k ? 'selected' : ''}>${t} (linear or AFBC)</option>`).join('')}</select>
        <span id="fcount" class="small muted"></span></div>
        <div class="tablewrap"><table><thead><tr><th>Format</th><th>Value</th><th>Categories</th><th>Planes</th><th>bpp (linear)</th><th>sub-sampling</th><th>align w/h/cpu</th><th>IP (from formats_ip_support[])</th><th>row</th></tr></thead><tbody id="ftbody"></tbody></table></div>
        <p class="small muted">Categories are derived from <code>is_rgb</code>/<code>is_yuv</code>/<code>afbc</code>, the format name and its section in <code>formats[]</code>. "AFBC-capable" means <code>.afbc = true</code> in the table; whether AFBC is actually used depends on IP capabilities and usage.</p>`;
    } else if (tab === 'defined') {
      body = `<p>These IDs are defined in an enum but have <b>no row in <code>formats[]</code></b>, so <code>get_format_index</code> fails for them and they cannot be allocated as-is. Some are reachable as <em>requests</em> that map to another format.</p>
        <div class="tablewrap"><table><thead><tr><th>Name</th><th>Value</th><th>Defined</th><th>Request mapping</th><th>Referenced in code</th></tr></thead><tbody>
        ${FD.defined_only.map((d) => `<tr><td class="mono">${esc(d.name)}</td><td class="mono">${d.value_hex || '?'} ${srcBadge(d.value_source)}</td><td>${src(d.defined_at)}</td>
          <td>${d.hal_map ? `→ <span class="mono">${esc(shortName(d.hal_map.internal))}</span>${d.hal_map.is_flex ? ' (flex)' : ''} ${src(d.hal_map.loc)}` : '—'}</td>
          <td class="small">${d.references.filter((r) => !(r.file === d.defined_at.file && r.line === d.defined_at.line)).slice(0, 6).map((r) => src(r, `${short(r.file)}:${r.line}`) + (r.func ? ` <span class="muted">${esc(r.func)}</span>` : '')).join('<br>') || '<span class="muted">only its definition</span>'}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else {
      body = `<p>Rows of ${src(FD.table_locs.hal_map, 'hal_to_internal_format[]')}. <code>get_internal_format(base, map_to_internal)</code> (${src(L(P.FI, 366))}) applies a row when <code>is_flex</code> or when <code>map_to_internal</code> is true — which it always is on the allocation path (${src(L(P.FMTS, 1491))}). Some requests are first rewritten by usage in <code>get_base_format</code> (${src(L(P.FMTS, 1365))}).</p>
        <div class="tablewrap"><table><thead><tr><th>Requested (HAL)</th><th>Value</th><th>flex</th><th>→ internal</th><th>row</th></tr></thead><tbody>
        ${FD.hal_requests.map((h) => `<tr><td class="mono">${esc(h.hal)}</td><td class="mono">${h.hal_value != null ? hex(h.hal_value) : '?'} ${srcBadge(h.hal_value_source)}</td><td>${h.is_flex ? 'yes' : ''}</td>
          <td class="mono">${byName.has(h.internal) ? `<a href="#/format/${encodeURIComponent(h.internal)}">${esc(shortName(h.internal))}</a>` : esc(h.internal) + ' <span class="badge b-bad">rejected</span>'}</td><td>${src(h.loc)}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
    return `<h1>Format explorer</h1>${tabs}${body}`;
  };
  function formatsAfter(params) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/formats?tab=' + b.dataset.tab; }));
    const tb = document.getElementById('ftbody');
    if (!tb) return;
    const draw = () => {
      const q = fstate.q.toLowerCase();
      const rows = FD.formats.filter((f) => {
        if (q && !(f.name.toLowerCase().includes(q) || (f.value_hex || '').includes(q))) return false;
        if (fstate.cat && !f.categories.includes(fstate.cat)) return false;
        if (fstate.planes && f.npln !== Number(fstate.planes)) return false;
        if (fstate.comp === 'AFBC-capable' && !f.afbc) return false;
        if (fstate.comp === 'SBWC' && !f.is_sbwc) return false;
        if (fstate.comp === 'none' && (f.afbc || f.is_sbwc)) return false;
        if (fstate.ip && f.ip[fstate.ip].every((x) => x === 'F_NONE')) return false;
        return true;
      });
      document.getElementById('fcount').textContent = `${rows.length} of ${FD.formats.length}`;
      tb.innerHTML = rows.map((f) => `<tr>
        <td><a href="#/format/${encodeURIComponent(f.name)}" class="mono">${esc(shortName(f.name))}</a></td>
        <td class="mono">${f.value_hex || '?'} ${f.value_source === 'manual' ? badge('AOSP', 'b-manual') : ''}</td>
        <td>${f.categories.map((c) => badge(c.replace('Compressed: ', ''), c.includes('AFBC') ? 'b-afbc' : c.includes('SBWC') ? 'b-sbwc' : '')).join('')}</td>
        <td>${f.npln}</td><td class="mono">${f.bpp.slice(0, f.npln).join('/')}</td>
        <td>${f.is_yuv ? `${f.hsub}×${f.vsub}` : '—'}</td><td class="mono">${f.align_w}/${f.align_h}/${f.align_w_cpu}</td>
        <td class="small">${IPS.filter(([k]) => !f.ip[k].every((x) => x === 'F_NONE')).map(([k, t]) => badge(t + (ipHas(f, k, 'F_AFBC') ? (ipHas(f, k, 'F_LIN') ? ' L+A' : ' AFBC') : ''), ipHas(f, k, 'F_AFBC') ? 'b-afbc' : '')).join('')}</td>
        <td>${src(f.row, ':' + f.row.line)}</td></tr>`).join('');
    };
    const bind = (id, key) => document.getElementById(id).addEventListener(id === 'fq' ? 'input' : 'change', (e) => { fstate[key] = e.target.value; draw(); });
    bind('fq', 'q'); bind('fcat', 'cat'); bind('fpl', 'planes'); bind('fcomp', 'comp'); bind('fip', 'ip');
    draw();
  }

  /* ---- format detail ---- */
  const FIELD_DOC = [
    ['npln', 'Number of planes', 'uint8_t npln;'],
    ['ncmp', 'Components per plane', 'ncmp[MAX_PLANES]'],
    ['bps', 'Bits per sample (largest)', 'uint8_t bps;'],
    ['bpp', 'Bits per pixel per plane, linear (incl. padding)', 'uint8_t bpp[MAX_PLANES];'],
    ['bpp_afbc', 'Bits per pixel per plane, AFBC', 'bpp_afbc[MAX_PLANES]'],
    ['hsub', 'Horizontal sub-sampling', 'uint8_t hsub;'],
    ['vsub', 'Vertical sub-sampling', 'uint8_t vsub;'],
    ['align_w', 'Width alignment (pixels)', 'uint8_t align_w;'],
    ['align_h', 'Height alignment (pixels)', 'uint8_t align_h;'],
    ['align_w_cpu', 'Width alignment with CPU usage (pixels)', 'uint8_t align_w_cpu;'],
    ['tile_size', 'Tile size (linear)', 'uint16_t tile_size;'],
    ['has_alpha', 'Alpha present', 'bool has_alpha;'],
    ['is_rgb', 'RGB format', 'bool is_rgb;'],
    ['is_yuv', 'YUV format', 'bool is_yuv;'],
    ['afbc', 'AFBC supported by spec + gralloc', 'bool afbc;'],
    ['linear', 'Uncompressed supported', 'bool linear;'],
    ['yuv_transform', 'AFBC YUV transform capable', 'bool yuv_transform;'],
    ['flex', 'Representable as flex', 'bool flex;'],
    ['planes_contiguous', 'Chroma planes not re-aligned (contiguous)', 'bool planes_contiguous;'],
  ];
  function fieldDocLoc(pat) {
    // format_info.h line of the struct member (format_info.h:53-87)
    const m = { 'uint8_t npln;': 56, 'ncmp[MAX_PLANES]': 57, 'uint8_t bps;': 58, 'bpp_afbc[MAX_PLANES]': 59, 'uint8_t bpp[MAX_PLANES];': 60, 'uint8_t hsub;': 62, 'uint8_t vsub;': 63, 'uint8_t align_w;': 64, 'uint8_t align_h;': 65, 'uint8_t align_w_cpu;': 66, 'uint16_t tile_size;': 67, 'bool has_alpha;': 68, 'bool is_rgb;': 69, 'bool is_yuv;': 70, 'bool afbc;': 71, 'bool linear;': 72, 'bool yuv_transform;': 73, 'bool flex;': 74, 'bool planes_contiguous;': 75 }[pat];
    return L(P.FIH, m);
  }

  views.format = (params, name) => {
    const f = byName.get(name);
    if (!f) return `<h1>Unknown format</h1><p>${esc(name)} is not in <code>formats[]</code>. <a href="#/formats?tab=defined">Defined-only IDs</a></p>`;
    const val = (k) => Array.isArray(f[k]) ? f[k].join(', ') : String(f[k]);
    const fields = FIELD_DOC.map(([k, t, pat]) => `<tr><td class="mono">${k}</td><td>${esc(val(k))}${k === 'align_w_cpu' && f.align_w_cpu_from_default_macro ? ' <span class="small muted">(ALIGN_W_CPU_DEFAULT ' + src(FD.table_locs.align_w_cpu_default) + ')</span>' : ''}</td><td class="small muted">${t} ${src(fieldDocLoc(pat), 'def')}</td><td>${src(f.row, ':' + f.row.line)}</td></tr>`).join('');
    const ipRows = IPS.concat([['dpu_aeu_wr', 'DPU AEU write (unused in Exynos)']]).map(([k, t]) => `<tr><td>${t}</td><td>${f.ip[k].map((x) => badge(x, x === 'F_AFBC' ? 'b-afbc' : x === 'F_LIN' ? 'b-ok' : '')).join('')}${f.ip.omitted.includes(k) ? ' <span class="small muted">(field omitted in row → 0 = F_NONE)</span>' : ''}</td></tr>`).join('');
    const refsByFunc = {};
    for (const r of f.references) (refsByFunc[r.func || '(file scope)'] = refsByFunc[r.func || '(file scope)'] || []).push(r);
    const comps = f.components ? f.components.planes.map((pl, i) => compBar(pl, i)).join('') : '<span class="muted">No component description in the PlaneLayout table for this format</span>';
    const ex = f.exynos_prepare;
    const mpo = f.mapper_num_planes_override;
    return `<h1 class="mono" style="font-size:20px">${esc(f.name)}</h1>
    <div class="row">${f.categories.map((c) => badge(c, c.includes('AFBC') ? 'b-afbc' : c.includes('SBWC') ? 'b-sbwc' : '')).join('')}
      <a href="#/compare?f=${encodeURIComponent(f.name)}">compare…</a> <a href="#/storage?f=${encodeURIComponent(f.name)}">how the data is stored…</a></div>
    <div class="grid2">
      <div class="panel"><div class="kv">
        <div>value</div><div class="mono">${f.value_hex || '?'} ${srcBadge(f.value_source)} ${src(f.defined_at, 'defined')}${f.value_note ? `<div class="small muted">${esc(f.value_note)}</div>` : ''}</div>
        ${f.alias ? `<div>alias of</div><div class="mono">${esc(f.alias)}</div>` : ''}
        <div>table section</div><div>${esc(f.section || '(top of table)')}</div>
        <div>Exynos path?</div><div>${f.is_exynos_format ? 'yes — <code>prepare_descriptor_exynos_formats</code>' : 'no — generic <code>calc_allocation_size</code>'} ${src(FD.exynos.is_exynos_loc, 'is_exynos_format')}</div>
        ${f.fd_count ? `<div>fd count</div><div>${f.fd_count.fd_count} ${src(f.fd_count.loc)}${f.fd_count.fd_count > 1 ? ' ' + badge('multi-fd (deprecated)', 'b-manual') : ''}</div>` : ''}
        ${f.is_sbwc ? `<div>SBWC</div><div>yes ${src(f.sbwc_loc, 'is_sbwc_format')}</div>` : ''}
        <div>DRM fourcc</div><div class="mono">${f.drm_fourcc ? esc(f.drm_fourcc.fourcc) + ' ' + src(f.drm_fourcc.loc) : 'DRM_FORMAT_INVALID (not in table)'} </div>
        ${mpo ? `<div>mapper plane count</div><div>${mpo.value} ${src(mpo.loc, 'get_num_planes')}${mpo.value !== f.npln ? ' ' + badge('differs from npln=' + f.npln, 'b-manual') : ''}</div>` : ''}
        <div>requested via</div><div class="small">${f.requested_via.length ? f.requested_via.map((h) => `<span class="mono">${esc(shortName(h.hal))}</span>${h.is_flex ? ' (flex)' : ''} ${src(h.loc)}`).join('<br>') : '—'}</div>
      </div></div>
      <div class="panel"><b>Components / bit layout</b> <span class="small muted">from PlaneLayout table ${f.components ? src(f.components.loc) : ''} keyed by DRM fourcc</span><div style="margin-top:6px">${comps}</div></div>
    </div>

    <h2>Layout calculator</h2>
    <p class="small muted">Runs the JS port of <code>mali_gralloc_buffer_allocate → mali_gralloc_derive_format_and_size</code> (${src(L(P.ALLOC, 1045))}) for a request of <b>this format</b> with the usage below. Note that format selection may substitute another format when no CPU usage is set (${src(L(P.FMTS, 1312))}).</p>
    ${dimsPicker('dims', true)}
    ${usagePicker(state.calc.usage, 'up', true)}
    ${flagsSummary()}
    <div id="calcout"></div>

    <h2>formats[] fields</h2>
    <div class="tablewrap"><table><thead><tr><th>field</th><th>value</th><th>meaning (struct def)</th><th>source row</th></tr></thead><tbody>${fields}</tbody></table></div>
    <pre>${esc(f.row_text)}</pre>

    <h2>IP support (formats_ip_support[])</h2>
    <div class="grid2"><div><table><tbody>${ipRows}</tbody></table></div>
    <div class="small"><p>Row ${src(f.ip.row)}. These flags are the <em>superset</em>; <code>ip_supports_base_format</code> ANDs the producer/consumer columns (${src(L(P.FMTS, 464))}), then IP capability masks can still remove AFBC (${src(L(P.FMTS, 586))}).</p><pre>${esc(f.ip.row_text)}</pre></div></div>

    ${ex ? `<h2>Exynos allocation</h2><p>Case ${src(ex.loc)} → <code>${esc(ex.setup)}</code> ${src(ex.setup_loc)}</p><pre>${ex.stmts.map((s) => `${String(s.line).padStart(5)}  ${esc(s.text)}`).join('\n')}</pre>${f.is_sbwc ? '<div class="note">SBWC sizes come from macros in an external kernel header — <b>Not confirmed in source</b>.</div>' : ''}` : ''}

    <h2>Where the code references it (${f.references.length})</h2>
    <div class="tablewrap"><table><tbody>${Object.entries(refsByFunc).map(([fn, rs]) => `<tr><td class="mono small">${esc(fn)}</td><td class="small">${rs.map((r) => `${src(r)} <span class="mono muted">${esc(r.text.slice(0, 110))}</span>${r.via ? ' <span class="badge">via ' + esc(r.via) + '</span>' : ''}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
  };

  function compBar(pl, i) {
    if (!pl.length) return `<div class="small muted">plane ${i}: (no components listed — AFBC-only fourcc)</div>`;
    const bits = Math.max(...pl.map((c) => c.offset + Math.max(c.bits, 0)));
    const col = { R: '#e15759', G: '#59a14f', B: '#4e79a7', A: '#9c9c9c', Y: '#bab0ac', CB: '#4e79a7', CR: '#e15759', RAW: '#b07aa1' };
    const sorted = pl.slice().sort((a, b) => a.offset - b.offset);
    return `<div class="small">plane ${i} (${bits} bits)</div><div style="display:flex;width:100%;max-width:520px;margin-bottom:6px">${sorted.map((c) => `<span class="comp" style="flex:${Math.max(c.bits, 1)};background:${col[c.type] || '#ccc'}33" title="${c.type} bits ${c.offset}..${c.offset + c.bits - 1}">${c.type}<br>${c.offset}:${c.bits}</span>`).join('')}</div>`;
  }

  function formatAfter(params, name) {
    const f = byName.get(name);
    if (!f) return;
    const run = () => {
      saveCalc();
      const r = calcRun(name, usageValue(state.calc.usage));
      document.getElementById('calcout').innerHTML = `<div class="grid2"><div class="panel">${resultSummary(r)}</div>
        <div class="panel"><b>Derivation trace</b>${traceList(r.trace)}</div></div>
        ${r.ok ? planeTable(r) + layoutSVG(r, r.format, state.calc.w, state.calc.h) + (r.planes.some((p) => p.steps && p.steps.length) ? `<details><summary>Per-plane alignment steps</summary>${r.planes.map((p, i) => `<h3>plane ${i}</h3>${traceList(p.steps || [])}`).join('')}</details>` : '') : ''}`;
    };
    const rerender = () => { render(); };
    bindDims('dims', rerender);
    bindUsagePicker('up', state.calc.usage, rerender);
    run();
  }

  /* ---- compare ---- */
  views.compare = (params) => {
    const sel = (params.get('f') || '').split(',').filter((n) => byName.has(n));
    while (sel.length < 2) sel.push(['MALI_GRALLOC_FORMAT_INTERNAL_NV12', 'HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN', 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888'].find((n) => !sel.includes(n)));
    const opts = (cur) => FD.formats.map((f) => `<option value="${esc(f.name)}" ${f.name === cur ? 'selected' : ''}>${esc(shortName(f.name))}</option>`).join('');
    const slots = [0, 1, 2].map((i) => `<select data-slot="${i}"><option value="">${i === 2 ? '(optional third)' : '—'}</option>${opts(sel[i])}</select>`).join(' ');
    return `<h1>Compare formats</h1><div class="panel row">${slots}</div>${dimsPicker('dims', true)}${usagePicker(state.calc.usage, 'up', true)}${flagsSummary()}<div id="cmpout"></div>`;
  };
  function compareAfter(params) {
    const sel = (params.get('f') || '').split(',').filter((n) => byName.has(n));
    const slots = [...document.querySelectorAll('select[data-slot]')];
    const names = slots.map((s) => s.value).filter(Boolean);
    slots.forEach((s) => s.addEventListener('change', () => { location.hash = '#/compare?f=' + slots.map((x) => x.value).filter(Boolean).map(encodeURIComponent).join(','); }));
    bindDims('dims', render);
    bindUsagePicker('up', state.calc.usage, render);
    saveCalc();
    const fs = names.map((n) => byName.get(n));
    const rs = names.map((n) => calcRun(n, usageValue(state.calc.usage)));
    const row = (label, fn) => { const vals = fs.map((f, i) => fn(f, rs[i])); const d = new Set(vals.map(String)).size > 1; return `<tr class="${d ? 'diff' : ''}"><td>${label}</td>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`; };
    const maxT = Math.max(1, ...rs.map((r) => r.ok && r.total ? r.total : 0));
    const html = `<div class="tablewrap"><table class="cmp"><thead><tr><th></th>${fs.map((f) => `<th><a href="#/format/${encodeURIComponent(f.name)}" class="mono">${esc(shortName(f.name))}</a></th>`).join('')}</tr></thead><tbody>
      ${row('value', (f) => f.value_hex)}${row('categories', (f) => f.categories.join(', '))}
      ${['npln', 'bpp', 'bpp_afbc', 'bps', 'hsub', 'vsub', 'align_w', 'align_h', 'align_w_cpu', 'tile_size', 'afbc', 'linear', 'planes_contiguous'].map((k) => row(k, (f) => Array.isArray(f[k]) ? f[k].join('/') : String(f[k]))).join('')}
      ${row('Exynos path', (f) => f.is_exynos_format ? 'yes' : 'no')}${row('DRM fourcc', (f) => f.drm_fourcc ? f.drm_fourcc.fourcc : '—')}
      ${row('selected format', (f, r) => r.ok ? shortName(r.format.name) + ' ' + E.modNames(r.alloc_format).join(' ') : 'fails: ' + r.error)}
      ${row('pixel stride', (f, r) => r.ok ? fmt(r.pixel_stride) : '—')}
      ${row('plane byte strides', (f, r) => r.ok ? r.planes.map((p) => fmt(p.byte_stride)).join(' / ') : '—')}
      ${row('plane offsets', (f, r) => r.ok ? r.planes.map((p) => fmt(p.offset)).join(' / ') : '—')}
      ${row('fd count', (f, r) => r.ok ? r.fd_count : '—')}
      ${row('total bytes', (f, r) => r.ok ? (r.unknown ? '<span class="badge b-unknown">Not confirmed in source</span>' : `<b>${fmt(r.total)}</b><div style="height:8px;background:var(--p0);width:${(100 * r.total / maxT).toFixed(1)}%"></div>`) : '—')}
      ${row('heap', (f, r) => r.ok ? esc(r.heap.name) : '—')}
      ${row('row source', (f) => src(f.row))}
    </tbody></table></div><p class="small muted">Highlighted rows differ.</p>
    <div class="grid2">${rs.map((r, i) => `<div class="panel"><b class="mono">${esc(shortName(names[i]))}</b>${r.ok ? layoutSVG(r, r.format, state.calc.w, state.calc.h) : `<div class="err">${esc(r.error)}</div>`}</div>`).join('')}</div>`;
    document.getElementById('cmpout').innerHTML = `<p><a href="#/storage?f=${names.map(encodeURIComponent).join(',')}">Compare how these formats store pixel data →</a></p>` + html;
  }

  /* ---- code flow ---- */
  const PHASES = [['allocate', 'Allocate'], ['import', 'Import'], ['lock', 'Lock'], ['unlock', 'Unlock'], ['free', 'Free']];
  views.flow = (params) => {
    const phase = params.get('p') || 'allocate';
    const ids = CF.paths[phase];
    const cur = Math.min(Math.max(0, Number(params.get('s') || 0)), ids.length - 1);
    const st = CF.steps.find((s) => s.id === ids[cur]);
    const snippet = st.snippet.split('\n').map((l, i) => `${String(st.snippet_loc.line + i).padStart(5)}  ${esc(l)}`).join('\n');
    const nexts = st.next.map((n) => { const s = CF.steps.find((x) => x.id === n); const ph = Object.keys(CF.paths).find((p) => CF.paths[p].includes(n)); const ix = CF.paths[ph].indexOf(n); return `<a class="badge b-afbc" href="#/flow?p=${ph}&s=${ix}">${esc(s.title)}</a>`; }).join(' ');
    return `<h1>Code flow walkthrough</h1>
      <div class="tabs">${PHASES.map(([k, t]) => `<button data-phase="${k}" class="${k === phase ? 'on' : ''}">${t}</button>`).join('')}</div>
      <p class="small muted">Order: allocate (allocator process) → import (client process) → lock → unlock → free. Snippets and line numbers are extracted from source by <code>tools/extract.py</code>; descriptions are written from reading those lines.</p>
      <div class="flowgrid"><div class="panel"><ol class="steplist">${ids.map((id, i) => { const s = CF.steps.find((x) => x.id === id); return `<li class="${i === cur ? 'cur' : ''}" data-step="${i}">${i + 1}. ${esc(s.title)}</li>`; }).join('')}</ol></div>
      <div><div class="step cur"><div class="row"><b>${cur + 1}/${ids.length} · ${esc(st.title)}</b> <span class="mono small">${esc(st.function || '')}</span> ${src(st.def, 'definition ' + short(st.def.file) + ':' + st.def.line)}</div>
        <p>${esc(st.description)}</p>
        <pre>${snippet}</pre><div class="small muted">snippet ${src(st.snippet_loc)}</div>
        ${nexts ? `<p class="small">Calls next: ${nexts}</p>` : ''}
        <div class="row"><button id="prev" ${cur === 0 ? 'disabled' : ''}>← Prev</button><button id="next" class="primary" ${cur === ids.length - 1 ? 'disabled' : ''}>Next →</button><span class="small muted">(arrow keys work too)</span></div>
      </div></div></div>`;
  };
  function flowAfter(params) {
    const phase = params.get('p') || 'allocate';
    const n = CF.paths[phase].length;
    const cur = Math.min(Math.max(0, Number(params.get('s') || 0)), n - 1);
    const go = (s) => { if (s >= 0 && s < n) location.hash = `#/flow?p=${phase}&s=${s}`; };
    document.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => { location.hash = '#/flow?p=' + b.dataset.phase; }));
    document.querySelectorAll('[data-step]').forEach((li) => li.addEventListener('click', () => go(Number(li.dataset.step))));
    document.getElementById('prev').addEventListener('click', () => go(cur - 1));
    document.getElementById('next').addEventListener('click', () => go(cur + 1));
    keyHandler = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); };
  }
  let keyHandler = null;
  document.addEventListener('keydown', (e) => { if (keyHandler) keyHandler(e); });

  /* ---- usage explorer ---- */
  const C2 = (f, l) => L(f, l);
  // Hand-written index of where each flag changes behaviour (each entry cites the line).
  const USAGE_EFFECTS = [
    ['SW_READ', 'CPU becomes a consumer', C2(P.FMTS, 125)],
    ['SW_WRITE', 'CPU becomes a producer', C2(P.FMTS, 212)],
    ['SW_ANY', 'CPU producer/consumer prevents substituting a different (better-graded) base format', C2(P.FMTS, 1312)],
    ['SW_ANY', 'pixel alignment uses align_w_cpu on primary planes', C2(P.ALLOC, 352)],
    ['SW_ANY', 'byte-stride cpu_align = bpp × align_w_cpu / 8 (not for RAW10)', C2(P.ALLOC, 691)],
    ['SW_ANY', 'lock requires a CPU usage bit', C2(P.ACC, 159)],
    ['SW_READ_OFTEN', 'cached heap variant (gcma_camera / system) instead of uncached', C2(P.ION, 194)],
    ['GRALLOC_USAGE_HW_TEXTURE', 'GPU consumer', C2(P.FMTS, 153)],
    ['GRALLOC_USAGE_GPU_DATA_BUFFER', 'GPU consumer and producer', C2(P.FMTS, 153)],
    ['GPU', 'linear byte stride aligned to 64 (GPU_BYTE_ALIGN_DEFAULT)', C2(P.ALLOC, 659)],
    ['GPU', 'Exynos formats: stride realigned to 64; SBWC + GPU logged as invalid', C2(P.ALLOC, 980)],
    ['GRALLOC_USAGE_HW_RENDER', 'GPU producer', C2(P.FMTS, 227)],
    ['GRALLOC_USAGE_HW_RENDER', 'GPU producer pads AFBC allocations to 16×16', C2(P.FMTS, 436)],
    ['GRALLOC_USAGE_HW_COMPOSER', 'alone (ignoring PROTECTED/private bits): DPU is the only consumer', C2(P.FMTS, 119)],
    ['GRALLOC_USAGE_HW_COMPOSER', 'with HW_TEXTURE: DPU consumer as well as GPU', C2(P.FMTS, 147)],
    ['GRALLOC_USAGE_HW_COMPOSER', 'with VIDEO_ENCODER (and not the legacy decoder combo): DPU producer', C2(P.FMTS, 220)],
    ['GRALLOC_USAGE_HW_COMPOSER', 'IMPLEMENTATION_DEFINED → EXYNOS_YCbCr_420_SPN', C2(P.FMTS, 1383)],
    ['GRALLOC_USAGE_HW_COMPOSER', 'DPU consumer drops AFBC split-block unless RGB ≥24 bpp', C2(P.FMTS, 945)],
    ['GRALLOC_USAGE_HW_FB', 'DPU consumer', C2(P.FMTS, 135)],
    ['GRALLOC_USAGE_HW_FB', 'GRALLOC_HWC_FB_DISABLE_AFBC (build flag) strips AFBC', C2(P.FMTS, 1531)],
    ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'camera producer (caps: OPTIONS_PRESENT only → no AFBC)', C2(P.FMTS, 232)],
    ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'IMPLEMENTATION_DEFINED + camera → MFC only: SPN_SBWC (property-dependent)', C2(P.FMTS, 1387)],
    ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'YCbCr_420_888 → YCrCb_420_SP (NV21)', C2(P.FMTS, 1433)],
    ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'camera GCMA heap', C2(P.ION, 164)],
    ['CAMERA', 'SOC_ZUMA: RAW stride 32 B, YUV stride lcm 64 B', C2(P.ALLOC, 670)],
    ['GRALLOC_USAGE_HW_CAMERA_READ', 'with CAMERA_WRITE: IMPLEMENTATION_DEFINED → NV21', C2(P.FMTS, 1413)],
    ['GRALLOC_USAGE_HW_CAMERA_READ', 'camera GCMA heap', C2(P.ION, 170)],
    ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'video producer (VPU, or BIG/MFC with the Google IP bits)', C2(P.FMTS, 171)],
    ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'AFBC YUV420 from video producer: height += 16/32', C2(P.FMTS, 422)],
    ['VIDEO', 'Exynos formats: VIDEO_PRIVATE_DATA added', C2(P.ALLOC, 863)],
    ['VIDEO', 'YCbCr_420_888 → SPN; P010 → P010_SPN', C2(P.FMTS, 1429)],
    ['GRALLOC_USAGE_HW_VIDEO_ENCODER', 'video consumer (MFC by default, or BIG)', C2(P.FMTS, 78)],
    ['GRALLOC_USAGE_HW_VIDEO_ENCODER', 'IMPLEMENTATION_DEFINED → SPN', C2(P.FMTS, 1405)],
    ['ENC_BW', 'VIDEO_ENCODER + IP_BW: +16 KiB BW_EXT_SIZE', C2(P.ALLOC, 1181)],
    ['GRALLOC_USAGE_GOOGLE_IP_BIG', 'BIG consumer → GOOGLE_NV12_SP / NV12_SP_10B for flex/P010 requests', C2(P.FMTS, 1401)],
    ['VIDEO_BIG', 'CPU *_OFTEN rewritten to *_RARELY', C2(P.ALLOC, 549)],
    ['VIDEO_BIG', 'stride lcm with 64; GOOGLE_NV12_SP chroma stride = luma stride', C2(P.ALLOC, 686)],
    ['GRALLOC_USAGE_GOOGLE_IP_MFC', 'selects MFC as video consumer/producer (caps: no AFBC)', C2(P.FMTS, 86)],
    ['GRALLOC_USAGE_PROTECTED', 'ignored for producer/consumer derivation', C2(P.FMTS, 115)],
    ['GRALLOC_USAGE_PROTECTED', 'secure dma-buf heaps', C2(P.ION, 136)],
    ['GRALLOC_USAGE_PROTECTED', 'no CPU mapping (unless PRIVATE_NONSECURE)', C2(P.ION, 495)],
    ['GRALLOC_USAGE_PROTECTED', 'AFBC headers not initialised (GRALLOC_INIT_AFBC)', C2(P.ION, 432)],
    ['MALI_GRALLOC_USAGE_NO_AFBC', 'AFBC removed from every candidate', C2(P.FMTS, 1051)],
    ['MALI_GRALLOC_USAGE_AFBC_PADDING', 'AFBC header stride padded to 4 superblocks (non-YUV)', C2(P.ALLOC, 360)],
    ['GRALLOC_USAGE_FRONT_BUFFER', 'AFBC needs DOUBLE_BODY capability (none of the IP caps set it)', C2(P.FMTS, 629)],
    ['GS101_GRALLOC_USAGE_TPU_INPUT', 'TPU consumer (uses CPU caps); FaceAuth heaps', C2(P.FMTS, 109)],
    ['GS101_GRALLOC_USAGE_TPU_OUTPUT', 'TPU producer (uses CPU caps)', C2(P.FMTS, 202)],
    ['GRALLOC_USAGE_SENSOR_DIRECT_DATA', 'sensor_direct_heap', C2(P.ION, 158)],
    ['GRALLOC_USAGE_ROIINFO', 'metadata buffer +32 KiB', C2(P.ALC, 128)],
    ['GRALLOC_USAGE_VIDEO_PRIVATE_DATA', 'IMPLEMENTATION_DEFINED → SPN', C2(P.FMTS, 1409)],
    ['GRALLOC_USAGE_NOZEROED', 'no CPU mapping (unless PRIVATE_NONSECURE)', C2(P.ION, 495)],
    ['DEPRECATED_MALI_GRALLOC_USAGE_FRONTBUFFER', 'descriptor rejected', C2(P.ALLOC, 477)],
    ['UNSUPPORTED_MALI_GRALLOC_USAGE_CUBE_MAP', 'descriptor rejected', C2(P.ALLOC, 481)],
    ['UNSUPPORTED_MALI_GRALLOC_USAGE_MIPMAP_COMPLETE', 'descriptor rejected', C2(P.ALLOC, 485)],
  ];
  function effectActive(key, m, u) {
    const has = (n) => U[n] !== undefined && (u & U[n]) !== 0n;
    switch (key) {
      case 'SW_READ': return m.read !== 'none';
      case 'SW_WRITE': return m.write !== 'none';
      case 'SW_ANY': return m.read !== 'none' || m.write !== 'none';
      case 'SW_READ_OFTEN': return m.read === 'often';
      case 'GPU': return has('GRALLOC_USAGE_HW_TEXTURE') || has('GRALLOC_USAGE_HW_RENDER') || has('GRALLOC_USAGE_GPU_DATA_BUFFER');
      case 'CAMERA': return has('GRALLOC_USAGE_HW_CAMERA_WRITE') || has('GRALLOC_USAGE_HW_CAMERA_READ');
      case 'VIDEO': return has('GRALLOC_USAGE_HW_VIDEO_DECODER') || has('GRALLOC_USAGE_HW_VIDEO_ENCODER');
      case 'ENC_BW': return has('GRALLOC_USAGE_HW_VIDEO_ENCODER') && has('GRALLOC_USAGE_GOOGLE_IP_BW');
      case 'VIDEO_BIG': return (has('GRALLOC_USAGE_HW_VIDEO_DECODER') || has('GRALLOC_USAGE_HW_VIDEO_ENCODER')) && has('GRALLOC_USAGE_GOOGLE_IP_BIG');
      default: return has(key);
    }
  }
  const ustate = { req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', all: false };
  views.usage = () => {
    const reqOpts = [['HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', 'IMPLEMENTATION_DEFINED (flex)'], ['HAL_PIXEL_FORMAT_YCbCr_420_888', 'YCbCr_420_888 (flex)'], ['HAL_PIXEL_FORMAT_YCBCR_P010', 'YCBCR_P010']]
      .concat(FD.formats.map((f) => [f.name, shortName(f.name)]));
    return `<h1>Usage-flag explorer</h1>
      <p>Pick usage bits and a requested format. The page runs the ported selection algorithm and shows which producers/consumers and capabilities result, which candidate formats were considered, the chosen layout, and which code paths the selected bits touch.</p>
      <div class="panel row"><label>Requested format <select id="ureq">${reqOpts.map(([v, t]) => `<option value="${esc(v)}" ${v === ustate.req ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      ${dimsPicker('dims', false)}
      ${usagePicker(state.calc.usage, 'up', false)}
      ${flagsSummary()}
      <div id="uout"></div>`;
  };
  function usageAfter() {
    bindDims('dims', render);
    bindUsagePicker('up', state.calc.usage, render);
    document.getElementById('ureq').addEventListener('change', (e) => { ustate.req = e.target.value; render(); });
    saveCalc();
    const m = state.calc.usage, u = usageValue(m);
    const r = E.allocate({ width: state.calc.w, height: state.calc.h, layer_count: 1, hal_format: V[ustate.req], usage: u }, state.flags);
    const sel = r.selection;
    const capRow = (n, v) => `<tr><td>${n}</td><td class="mono">${v == null ? '—' : hex(v)}</td><td class="small">${v == null ? '' : capNames(v)}</td></tr>`;
    const caps = sel ? sel.caps : E.ipCaps(state.flags);
    let html = `<div class="grid2"><div class="panel"><h3>Result</h3>${resultSummary(r)}</div>
      <div class="panel"><h3>Producers / consumers</h3>
        <div class="kv"><div>producers</div><div>${sel ? E.listBits(sel.producers, E.PR) : '—'} ${src(L(P.FMTS, 198), 'get_producers')}</div>
        <div>consumers</div><div>${sel ? E.listBits(sel.consumers, E.CO) : '—'} ${src(L(P.FMTS, 105), 'get_consumers')}</div></div>
        <table class="small" style="margin-top:6px"><tbody>
        ${sel && sel.producers !== undefined ? capRow('producer caps', sel.producer_caps) + capRow('consumer caps', sel.consumer_caps) + capRow('producer active', sel.producer_active_caps) + capRow('consumer active', sel.consumer_active_caps) : ''}
        </tbody></table>
        <details><summary class="small">IP capability masks with current build flags ${src(L(P.CAPS, 42))}</summary><table class="small"><tbody>${Object.entries(caps).map(([k, v]) => capRow(k, v)).join('')}</tbody></table></details>
      </div></div>
      <div class="panel"><h3>Trace</h3>${traceList(r.trace)}</div>`;
    if (sel && sel.candidates) {
      html += `<h2>Candidate formats considered by get_best_format ${src(L(P.FMTS, 1228))}</h2>
        <div class="tablewrap"><table><thead><tr><th>compatible format</th><th>supported</th><th>support flags</th><th>modifiers</th><th>grade</th></tr></thead><tbody>
        ${sel.candidates.map((c) => `<tr class="${r.ok && c.value === r.format.value ? 'diff' : ''}"><td class="mono"><a href="#/format/${encodeURIComponent(c.name)}">${esc(shortName(c.name))}</a></td><td>${c.supported ? badge('yes', 'b-ok') : badge('no', 'b-bad')}</td><td>${['F_LIN', 'F_AFBC'].filter((x, i) => c.f_flags & (1 << i)).join('|') || 'F_NONE'}${c.note ? ' <span class="small muted">' + esc(c.note) + '</span>' : ''}</td><td class="small">${E.modNames(c.ext).join(', ')}</td><td>${c.grade || ''}</td></tr>`).join('')}
        </tbody></table></div><p class="small muted">Grade = 1 + number of AFBC modifier bits (${src(L(P.FMTS, 1177))}). Highlighted = selected.</p>`;
    }
    const act = USAGE_EFFECTS.filter(([k]) => effectActive(k, m, u));
    html += `<h2>Code paths affected by the selected bits (${act.length})</h2>
      <p class="small muted">Hand-written index of the places where these bits change behaviour; each line is cited.</p>
      <div class="tablewrap"><table><tbody>${act.map(([k, t, c]) => `<tr><td class="mono small">${esc(k.replace(/^GRALLOC_USAGE_/, ''))}</td><td>${esc(t)}</td><td>${src(c)}</td></tr>`).join('') || '<tr><td class="muted">none</td></tr>'}</tbody></table></div>
      <h2>All formats requested with this usage</h2>
      <p class="small muted">Each of the ${FD.formats.length} formats is requested directly (${state.calc.w}×${state.calc.h}) with the usage above.</p>
      <div class="tablewrap"><table><thead><tr><th>requested</th><th>result</th><th>modifiers</th><th>total bytes</th></tr></thead><tbody>
      ${FD.formats.map((f) => { const x = calcRun(f.name, u); return `<tr><td class="mono"><a href="#/format/${encodeURIComponent(f.name)}">${esc(shortName(f.name))}</a></td><td>${x.ok ? (x.format.name === f.name ? 'as requested' : '→ <span class="mono">' + esc(shortName(x.format.name)) + '</span>') : '<span class="badge b-bad">' + esc(x.error) + '</span>'}</td><td class="small">${x.ok ? E.modNames(x.alloc_format).join(', ') : ''}</td><td>${x.ok ? (x.unknown ? badge('unknown (SBWC)', 'b-unknown') : fmt(x.total)) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    document.getElementById('uout').innerHTML = html;
  }
  function capNames(v) { const o = []; for (const k in E.CAP) if (k !== 'AFBCENABLE_MASK' && (v & E.CAP[k])) o.push(k); return o.join(', '); }

  /* ---- settings ---- */
  const FLAG_DOC = {
    MALI_GPU_SUPPORT_AFBC_BASIC: ['GPU AFBC basic + YUV read + 1010102/16161616 pixel formats', L(P.CAPS, 73)],
    MALI_GPU_SUPPORT_AFBC_YUV_WRITE: ['GPU can write YUV AFBC (nested in BASIC)', L(P.CAPS, 79)],
    MALI_GPU_SUPPORT_AFBC_SPLITBLK: ['GPU split block (nested in BASIC)', L(P.CAPS, 83)],
    MALI_GPU_SUPPORT_AFBC_WIDEBLK: ['GPU wide block (+split) (nested in BASIC)', L(P.CAPS, 87)],
    MALI_GPU_SUPPORT_AFBC_TILED_HEADERS: ['GPU tiled headers (+split +wide) (nested in BASIC)', L(P.CAPS, 92)],
    SOC_ZUMA: ['DPU wide-block; BIG uses BigWave caps; camera RAW/YUV stride rules', L('gralloc4/Android.bp', 183)],
    GRALLOC_DPU_SUPPORT_1010102_AFBC: ['DPU RGBA_1010102 capability', L(P.CAPS, 68)],
    GRALLOC_ARM_NO_EXTERNAL_AFBC: ['strip AFBC capabilities from every IP', L(P.CAPS, 123)],
    GRALLOC_HWC_FB_DISABLE_AFBC: ['no AFBC for HW_FB (client target) buffers', L(P.FMTS, 1531)],
    prop_debug_vendor_gpu_record_sbwc: ['runtime property debug.vendor.gpu.record_sbwc (default true) for camera→MFC IMPLEMENTATION_DEFINED', L(P.FMTS, 1395)],
  };
  views.settings = () => `<h1>Build-flag assumptions</h1>
    <p>These soong/board flags are compiled in on real devices but are <b>not set anywhere in this repository</b> (device trees elsewhere decide them). They change capability masks and therefore AFBC selection. Defaults = all off (property: true), i.e. the code as compiled with no board configuration.</p>
    <div class="panel">${Object.keys(E.DEFAULT_FLAGS).map((k) => `<div><label class="chk"><input type="checkbox" data-bf="${k}" ${state.flags[k] ? 'checked' : ''}><code>${k}</code></label> <span class="small muted">${esc(FLAG_DOC[k][0])}</span> ${src(FLAG_DOC[k][1])}</div>`).join('')}
    <div class="row" style="margin-top:8px"><button id="bfreset">Reset to defaults</button><button id="bfgpu">Example: Mali GPU with all AFBC features</button></div></div>
    <p class="small muted">Saved in this browser only.</p>`;
  function settingsAfter() {
    document.querySelectorAll('[data-bf]').forEach((i) => i.addEventListener('change', () => { state.flags[i.dataset.bf] = i.checked; store.set('flags', state.flags); }));
    document.getElementById('bfreset').addEventListener('click', () => { state.flags = Object.assign({}, E.DEFAULT_FLAGS); store.set('flags', state.flags); render(); });
    document.getElementById('bfgpu').addEventListener('click', () => {
      for (const k of ['MALI_GPU_SUPPORT_AFBC_BASIC', 'MALI_GPU_SUPPORT_AFBC_YUV_WRITE', 'MALI_GPU_SUPPORT_AFBC_SPLITBLK', 'MALI_GPU_SUPPORT_AFBC_WIDEBLK', 'MALI_GPU_SUPPORT_AFBC_TILED_HEADERS']) state.flags[k] = true;
      store.set('flags', state.flags); render();
    });
  }

  /* ---- glossary ---- */
  views.glossary = () => `<h1>Glossary</h1><p class="small muted">Definitions are written by hand; each links to where the concept appears in the code.</p>
    ${GL.terms.map((t) => `<div class="panel" id="g-${esc(t.term.replace(/\W+/g, '-'))}"><b>${esc(t.term)}</b><p style="margin:4px 0">${esc(t.definition)}</p>
      <div class="small">${t.code.map((c) => `${src(c)} <span class="mono muted">${esc(c.text)}</span>`).join('<br>')}</div></div>`).join('')}`;

  /* ---------------- router ---------------- */
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const parts = path.split('/').map(decodeURIComponent);
    return { route: parts[0] || 'overview', arg: parts[1], params: new URLSearchParams(q || '') };
  }
  const AFTER = { formats: formatsAfter, format: formatAfter, compare: compareAfter, flow: flowAfter, usage: usageAfter, settings: settingsAfter };
  function render() {
    const { route, arg, params } = parse();
    keyHandler = null;
    const v = views[route] || views.overview;
    const y = window.scrollY;
    app.innerHTML = v(params, arg);
    if (render.lastRoute !== location.hash) { app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in'); }
    if (AFTER[route]) AFTER[route](params, arg);
    document.querySelectorAll('#nav a').forEach((a) => {
      const r = a.getAttribute('href').replace(/^#\/?/, '') || 'overview';
      a.classList.toggle('active', r === route || (route === 'format' && r === 'formats'));
    });
    if (render.lastRoute === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render.lastRoute = location.hash;
  }
  window.addEventListener('hashchange', render);
  // Theme: system (default) / light / dark — stored per browser, applied before paint by index.html.
  (function () {
    const sel = document.getElementById('theme');
    if (!sel) return;
    sel.value = store.get('theme', 'system');
    sel.addEventListener('change', () => {
      store.set('theme', sel.value);
      if (sel.value === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', sel.value);
    });
  })();
  document.getElementById('foot').innerHTML = `Data: <code>site/data/*.json</code> generated by <code>tools/extract.py</code> from gchips @ <code>${esc((FD.meta.commit || '').slice(0, 12))}</code>. Source links open android.googlesource.com at that commit.`;
  // Extension point for additional views (site/js/storage.js).
  window.GX = { views, AFTER, esc, src, L, P, byName, shortName, badge, fmt, hex, state, saveCalc, render, dimsPicker, bindDims, E, U, V, FD, CF, store,
    usageValue, calcRun, layoutSVG, planeTable, traceList, resultSummary, PRESETS, usagePicker, bindUsagePicker };
  document.addEventListener('DOMContentLoaded', render);
})();
