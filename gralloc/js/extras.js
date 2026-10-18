/*
 * extras.js — animations and learning content.
 *   - describe(f): "In plain words" summary, generated only from table fields (each sentence cited)
 *   - alignment replay on the format page (frames come from engine.js per-plane steps)
 *   - buffer journey + autoplay on the Code flow page
 *   - selection funnel on the Usage page
 *   - pixel scan on the Pixel storage page
 *   - "Learn" chapters with live demos
 * All motion is disabled when the user prefers reduced motion (CSS), and every
 * animation can also be stepped manually.
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src, L, P, byName, shortName, badge, fmt, state, E, U, V, FD, CF } = G;
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const route = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'overview');

  /* ------------------------------------------------------------------ */
  /* In plain words                                                      */
  /* ------------------------------------------------------------------ */
  function compsOf(f, p) { return ((f.components && f.components.planes[p]) || []).filter((c) => c.bits > 0).slice().sort((a, b) => a.offset - b.offset); }
  function avgBpp(f) {
    // bpp already counts per-pixel bits for single-plane formats; chroma planes hold one sample per hsub×vsub pixels.
    let s = 0;
    for (let p = 0; p < f.npln; p++) s += f.bpp[p] / (p > 0 && f.is_yuv ? f.hsub * f.vsub : 1);
    return s;
  }
  const n2w = (n) => ['zero', 'one', 'two', 'three'][n] || String(n);
  function describe(f, compact) {
    const items = [];
    const row = src(f.row, 'formats[]');
    // Planes and what they hold
    const planeWords = f.npln === 1 ? 'a single plane' : `${n2w(f.npln)} separate planes`;
    items.push(`Pixel data is stored in ${planeWords} (<code>npln = ${f.npln}</code> ${row}).`);
    for (let p = 0; p < f.npln; p++) {
      const cs = compsOf(f, p);
      const sb = f.linear ? f.bpp[p] : f.bpp_afbc[p];
      const per = p > 0 && f.is_yuv ? `one sample for every ${f.hsub}×${f.vsub} block of pixels` : 'one sample per pixel';
      if (cs.length) {
        const span = Math.max(...cs.map((c) => c.offset + c.bits));
        const names = cs.map((c) => c.type);
        const uniq = [...new Set(names)];
        let what = uniq.length === 1 ? `${uniq[0]}` : `${cs.map((c) => c.type).join(', ')} (in this order, lowest bit first)`;
        let extra = '';
        if (span > sb && sb) extra = ` Its components span ${span} bits, so one ${span}-bit block covers ${span / sb} samples.`;
        else if (cs.length === 1 && cs[0].bits < sb) extra = ` The value uses ${cs[0].bits} of the ${sb} bits, starting at bit ${cs[0].offset}; the other ${sb - cs[0].bits} bits are unused.`;
        else if (cs.reduce((a, c) => a + c.bits, 0) < sb) extra = ` ${sb - cs.reduce((a, c) => a + c.bits, 0)} of the ${sb} bits carry no component.`;
        items.push(`Plane ${p} holds ${what} in ${sb}-bit samples, ${f.npln > 1 || p > 0 ? per : (f.is_yuv && f.hsub > 1 ? `with chroma shared by ${f.hsub}×${f.vsub} pixels` : per)}.${extra} ${src(f.components.loc, 'components')}`);
      } else if (!f.is_sbwc && f.linear) {
        items.push(`Plane ${p} uses ${sb}-bit samples with ${f.ncmp[p]} component(s) (<code>ncmp</code>), ${per}; the repo does not name the components ${src(FD.components_table_loc, 'component table')}.`);
      }
    }
    if (f.linear && !f.is_sbwc && !/_S10B$/.test(f.name)) {
      const a = avgBpp(f);
      items.push(`Before padding that is <b>${Number.isInteger(a) ? a : a.toFixed(2)} bits per pixel</b> on average (<code>bpp</code> ÷ sub-sampling), i.e. ${fmt(Math.round(1920 * 1080 * a / 8))} bytes for a 1920×1080 image ${row}.`);
    }
    if (f.has_alpha) items.push(`It carries an alpha channel (<code>has_alpha</code>) ${row}.`);
    // Allocation path and alignment
    if (f.is_exynos_format && f.exynos_prepare) {
      const x = f.exynos_prepare;
      items.push(`It is laid out by the Exynos path: ${x.align_w ? `width rounded up to ${x.align_w.value}` : 'width unchanged'}, ${x.align_h ? `height to ${x.align_h.value}` : 'height unchanged'}, then <code>${esc(x.setup)}()</code> fills in plane sizes ${src(x.loc)}.${f.fd_count ? ` Planes are spread over ${f.fd_count.fd_count} dma-buf(s) ${src(f.fd_count.loc)}.` : ''}`);
    } else if (f.linear) {
      items.push(`Width is rounded up to a multiple of ${f.align_w} pixels and height to ${f.align_h} (${f.align_w_cpu > 1 ? `with CPU access, width to ${f.align_w_cpu} pixels` : 'CPU access adds no extra pixel alignment'}) ${row}; rows are then padded to the byte alignment required by the hardware users ${src(L(P.ALLOC, 646, 704), 'calc_allocation_size')}.`);
      if (f.planes_contiguous && f.npln > 1) items.push(`<code>planes_contiguous = true</code>: chroma planes are <em>not</em> re-aligned, they follow the luma plane at its aligned size ${src(L(P.ALLOC, 325))}.`);
    }
    // Compression
    if (!f.linear) items.push(`It has no uncompressed form (<code>linear = false</code>): it can only be allocated AFBC-compressed, so the CPU cannot lock it ${src(L(P.ACC, 150))}.`);
    else if (f.afbc) items.push(`It may instead be stored AFBC-compressed, when every producer and consumer supports it — decided per allocation ${src(L(P.FMTS, 586), 'is_format_supported')}.`);
    if (f.is_sbwc) items.push(`It is SBWC-compressed (Samsung); using it with GPU usage is logged as invalid ${src(L(P.ALLOC, 984))}, and its sizes come from an external header (not confirmed in source).`);
    const c = f.enum_comments || {};
    if (c.group) items.push(`The source comment above its definition says: “${esc(c.group.text)}” ${src(c.group.loc)}.`);
    return `<div class="panel plain"><b>In plain words</b> <span class="small muted">— generated from the table fields; every sentence links to its source</span><ul class="${compact ? 'small' : ''}" style="margin:6px 0 0;padding-left:20px">${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  G.describe = describe;

  /* ------------------------------------------------------------------ */
  /* What the name and the letters mean                                  */
  /* ------------------------------------------------------------------ */
  const EXF = 'include/exynos_format.h';
  // Component letters: standard colour terminology (general background, not defined in gchips).
  const COMP_INFO = {
    R: ['Red', 'Intensity of red light in this pixel.'],
    G: ['Green', 'Intensity of green light.'],
    B: ['Blue', 'Intensity of blue light.'],
    A: ['Alpha', 'Opacity: 0 = fully transparent, maximum value = fully opaque. Used when layers are blended.'],
    Y: ['Luma (Y′)', 'Brightness: a weighted sum of red, green and blue. A Y-only image looks like a black-and-white photo.'],
    CB: ['Chroma blue (Cb, also called U)', 'Blue-difference colour: how much bluer (or more yellow) the pixel is than its brightness suggests. Mid value = no colour shift.'],
    CR: ['Chroma red (Cr, also called V)', 'Red-difference colour: how much redder (or more cyan) the pixel is than its brightness suggests. Mid value = no colour shift.'],
    RAW: ['Raw sensor value', 'One camera-sensor reading before demosaicing; each pixel measured a single colour through the sensor’s colour filter.'],
  };
  const COMP_COL = { R: '#e15759', G: '#59a14f', B: '#4e79a7', A: '#a0a0a0', Y: '#b9a77a', CB: '#5b8fd4', CR: '#e0766d', RAW: '#b07aa1' };
  const DIGITS = { '8888': [8, 8, 8, 8], '888': [8, 8, 8], '565': [5, 6, 5], '1010102': [10, 10, 10, 2], '16161616': [16, 16, 16, 16], '88': [8, 8], '8': [8] };

  function nameParts(f) {
    const n = shortName(f.name), out = [];
    const g = (part, meaning) => out.push({ part, meaning, cite: null });
    const c = (part, meaning, cite) => out.push({ part, meaning, cite });
    const row = f.row;
    let m;
    if ((m = n.match(/^(?:GOOGLE_)?(RGBA|RGBX|BGRA|RGB|RG|R)_(\d+)$/))) {
      const letters = m[1].split(''), bits = DIGITS[m[2]];
      if (n.startsWith('GOOGLE_')) c('GOOGLE_', 'Google-defined format (enum in exynos_format.h).', L(EXF, 105, 111));
      g(m[1], `Channel letters in name order: ${letters.map((x) => x === 'X' ? 'X = unused padding' : `${x} = ${(COMP_INFO[x] || [x])[0]}`).join(', ')}.`);
      if (bits) g(m[2], `Bits per channel in the same order: ${letters.map((x, i) => `${x} ${bits[i]}`).join(', ')} = ${bits.reduce((a, b) => a + b, 0)} bits per pixel.`);
      if (letters.includes('X')) c('X', 'The 4th byte is padding: the component table lists only R, G, B while bpp is 32.', L(P.MMD, 148, 151));
      if (f.name.endsWith('16161616')) c('16161616', 'Each channel is a 16-bit floating-point number (“16-bit floating point format.”).', L(P.MGF, 77));
      return out;
    }
    if (/^RAW(\d+)$/.test(n)) { const b = n.slice(3); g('RAW', COMP_INFO.RAW[1]); g(b, `${b} bits per sensor sample.`); if (b !== '16') c(b, 'How the samples are packed is not described in this repo (the mapper reports no component layout).', L(P.MMD, 276, 279)); return out; }
    if (n === 'BLOB') { c('BLOB', 'Opaque bytes, not pixels (e.g. JPEG data, ML model weights). Width = byte count, height must be 1.', L(P.ALLOC, 842, 847)); return out; }
    if (/DEPTH|STENCIL/.test(n)) {
      if (/DEPTH/.test(n)) g('DEPTH_' + (n.match(/DEPTH_(\w+?)(?:_STENCIL|$)/) || [, ''])[1], 'Depth buffer: per-pixel distance from the camera, used by 3D rendering. The number is its bit width; F = floating point.');
      if (/STENCIL/.test(n)) g('STENCIL_8', 'Stencil: 8 bits per pixel used as a mask for drawing.');
      c('', 'This repo does not name the components of depth/stencil formats (no DRM fourcc).', FD.components_table_loc);
      return out;
    }
    if (/^Y(8|16)$/.test(n)) { g(n, `Luma only (brightness, no colour), ${n.slice(1)} bits per pixel.`); return out; }
    // YUV families
    if (/^NV(12|21|16)$/.test(n)) {
      g('NV', 'Semi-planar YUV: a full-resolution Y plane followed by one plane of interleaved chroma pairs.');
      g(n.slice(2), n === 'NV12' ? '4:2:0 with Cb before Cr.' : n === 'NV21' ? '4:2:0 with Cr before Cb.' : '4:2:2 (chroma for every 2×1 pixels), Cb before Cr.');
      return out;
    }
    if (n === 'YV12') { g('YV12', 'Planar 4:2:0: a Y plane, then a V (Cr) plane, then a U (Cb) plane — note V comes before U.'); c('order', 'The component table confirms plane 1 = CR, plane 2 = CB.', L(P.MMD, 223, 230)); return out; }
    if (/^P(010|210)$/.test(n)) { g('P', 'Semi-planar like NV12/NV16, but each sample is 16 bits.'); g(n.slice(1), `${n === 'P010' ? '4:2:0' : '4:2:2'}, 10 bits of each 16-bit sample are used.`); c('bit 6', 'The 10 bits sit at bit offset 6 (the top of the 16-bit word).', L(P.MMD, 207, 222)); return out; }
    if (n === 'Y210' || n === 'Y410' || n === 'Y0L2') { g(n, n === 'Y210' ? 'Packed 4:2:2, 10-bit samples in 16-bit slots, Y Cb Y Cr order.' : n === 'Y410' ? 'Packed 4:4:4, 10 bits each for Cb, Y, Cr plus 2-bit alpha in 32 bits.' : 'Packed 4:2:0 10-bit with alpha, 2×2 blocks in 64 bits.'); c('layout', 'Bit positions from the component table.', L(P.MMD, 166, 183)); return out; }
    if ((m = n.match(/^YUV(420|422|444)_(8|10)BIT(_I)?$/))) {
      g('YUV' + m[1], `${m[1].split('').join(':')} chroma sub-sampling.`);
      g(m[2] + 'BIT', `${m[2]}-bit samples.`);
      if (m[3]) c('_I', '“Single-plane (I = interleaved) variants of 8/10-bit YUV formats” — these exist only AFBC-compressed.', L(P.MGF, 117, 120));
      else if (m[1] === '422') g('', 'Packed: Y0 Cb Y1 Cr in one plane (YUYV).');
      return out;
    }
    if (n === 'YCrCb_420_SP') { g('YCrCb', 'Chroma order Cr then Cb (NV21).'); g('420', '4:2:0.'); g('SP', 'Semi-planar.'); c('note', 'Requests for this value are remapped to the internal NV21 format.', L(P.FI, 234)); return out; }
    if (n.startsWith('EXYNOS_') || n.startsWith('GOOGLE_')) {
      if (n.startsWith('EXYNOS_')) c('EXYNOS_', 'Samsung Exynos vendor format, defined in exynos_format.h.', L(EXF, 26, 103));
      else c('GOOGLE_', 'Google-defined format, defined in exynos_format.h.', L(EXF, 105, 111));
      if (/YCbCr/.test(n)) g('YCbCr', 'Chroma order Cb then Cr.');
      if (/YCrCb/.test(n)) g('YCrCb', 'Chroma order Cr then Cb.');
      if (/YV12/.test(n)) g('YV12', 'Planar Y, V (Cr), U (Cb).');
      if (/_420/.test(n)) g('420', '4:2:0 chroma sub-sampling.');
      if (/NV12/.test(n)) g('NV12', 'Semi-planar 4:2:0, Cb before Cr.');
      if (/_SPN/.test(n)) c('SPN', 'Semi-planar, contiguous: all planes in one dma-buf (“contiguous(single fd) custom formats”).', L(EXF, 59));
      else if (/_SP_M/.test(n)) c('SP_M', 'Semi-planar, multi-fd: each plane in its own dma-buf — get_exynos_fd_count returns 2 for these formats (the allocator logs that multi-fd formats are deprecated).', L(P.FMTS, 1626, 1641));
      else if (/_SP(_|$)/.test(n)) g('SP', 'Semi-planar: Y plane + interleaved chroma plane.');
      if (/_P_M$|_YV12_M/.test(n)) c('_M', 'Multi-fd: each plane in its own dma-buf (3 fds).', L(P.FMTS, 1642, 1644));
      else if (/_420_P$/.test(n)) g('P', 'Planar: separate Y, Cb and Cr planes.');
      if (/P010/.test(n)) c('P010', '“10bit, 2x byte”: 10-bit samples stored in 16 bits.', L(EXF, 70, 77));
      if (/S10B/.test(n)) c('S10B', '“8bit + separated 2bit”: 10-bit data split into an 8-bit area and a separate 2-bit area.', L(EXF, 64, 68));
      if (/_10B/.test(n) && !/S10B/.test(n)) g('10B', '10-bit samples.');
      if (/SBWC/.test(n)) c('SBWC', 'Samsung Bandwidth Compression (“SBWC format”); sizes come from an external header.', L(EXF, 79));
      if ((m = n.match(/_L(\d+)$/))) c('L' + m[1], `Lossy SBWC (“SBWC Lossy formats”); ${m[1]} is passed as the rate to setup_sbwc_*_lossy(). What the number means exactly is not stated in source.`, f.exynos_prepare ? f.exynos_prepare.loc : L(EXF, 89));
      if (/TILED/.test(n)) c('TILED', `Pixels stored in ${f.tile_size}×${f.tile_size} tiles (tile_size); tile order not described.`, row);
      if (/_FULL$/.test(n)) c('FULL', 'Not stated in source; the old name in the trailing comment is HAL_PIXEL_FORMAT_EXYNOS_YCrCb_420_SP_FULL.', f.defined_at);
      if (/_10B$/.test(n) && n.startsWith('GOOGLE')) g('10B', '10-bit samples (P010-style 16-bit containers).');
      return out;
    }
    return out;
  }

  function componentRows(f) {
    const rows = [];
    const cs = f.components ? f.components.planes : [];
    cs.forEach((pl, p) => {
      const sorted = pl.slice().sort((a, b) => a.offset - b.offset);
      const seen = {};
      sorted.forEach((c) => {
        if (c.bits <= 0 && c.type !== 'RAW') return;
        const k = seen[c.type] = (seen[c.type] || 0) + 1;
        rows.push({ p, c, n: k });
      });
    });
    return rows;
  }

  function formatMeaning(f, compact) {
    const parts = nameParts(f);
    const rows = componentRows(f);
    const types = [...new Set(rows.map((r) => r.c.type))];
    const hasX = f.is_rgb && f.ncmp[0] === 3 && f.bpp[0] === 32;
    const general = '<span class="badge">general colour terminology</span>';
    const nameTable = parts.length ? `<table class="small meaning"><tbody>${parts.map((x) => `<tr><td class="mono">${esc(x.part)}</td><td>${esc(x.meaning)} ${x.cite ? src(x.cite) : ''}</td></tr>`).join('')}</tbody></table>` : '';
    const legend = types.length ? `<div class="complegend">${types.map((t) => {
      const [name, what] = COMP_INFO[t] || [t, ''];
      return `<div><span class="cdot" style="background:${COMP_COL[t] || '#ccc'}">${esc(t === 'CB' ? 'Cb' : t === 'CR' ? 'Cr' : t)}</span><div><b>${esc(name)}</b><div class="small muted">${esc(what)}</div></div></div>`;
    }).join('')}${hasX ? `<div><span class="cdot" style="background:var(--pad);color:var(--ink)">X</span><div><b>Unused (padding)</b><div class="small muted">8 bits per pixel that carry nothing; keeps each pixel 32-bit aligned.</div></div></div>` : ''}</div>` : '';
    const where = rows.length ? `<table class="small meaning"><thead><tr><th>plane</th><th>component</th><th>bits in the sample</th><th>byte(s)</th></tr></thead><tbody>${rows.map(({ p, c }) => `<tr><td>${p}</td><td><span class="cdot sm" style="background:${COMP_COL[c.type] || '#ccc'}"></span>${esc((COMP_INFO[c.type] || [c.type])[0])}</td><td class="mono">${c.bits > 0 ? `${c.offset}–${c.offset + c.bits - 1} (${c.bits} bits)` : 'size not stated'}</td><td class="mono">${c.bits > 0 ? (Math.floor(c.offset / 8) === Math.floor((c.offset + c.bits - 1) / 8) ? Math.floor(c.offset / 8) : `${Math.floor(c.offset / 8)}–${Math.floor((c.offset + c.bits - 1) / 8)}`) : '—'}</td></tr>`).join('')}</tbody></table>
      <div class="small muted">Lowest bit first, from the component table ${src(f.components.loc)}${rows.some((r) => r.c.offset > 0) ? ' — this is the order in memory, which can differ from the order in the name' : ''}.</div>` : '';
    const nameOrder = (f.name.match(/_(RGBA|RGBX|BGRA|RGB)_/) || [])[1];
    const memOrder = rows.filter((r) => r.p === 0).map((r) => r.c.type).join('');
    const orderNote = nameOrder && memOrder && nameOrder.replace('X', '') !== memOrder ? `<div class="note small">Name order <b>${nameOrder}</b> ≠ memory order (lowest bit first) <b>${memOrder.split('').join(', ')}</b>.</div>` : '';
    if (!parts.length && !legend) return '';
    return `<div class="panel meaning-panel"><b>What the name and the letters mean</b>
      ${nameTable ? `<h3 style="margin-top:8px">Reading the name</h3>${nameTable}<div class="small muted">Parts without a source link are standard naming, not defined in this repo.</div>` : ''}
      ${legend ? `<h3>The letters ${general}</h3>${legend}` : ''}
      ${compact ? '' : where}${orderNote}</div>`;
  }
  G.formatMeaning = formatMeaning;

  /* ------------------------------------------------------------------ */
  /* Alignment replay                                                    */
  /* ------------------------------------------------------------------ */
  function alignAnimator(r, reqW, reqH, id) {
    if (!r.ok || r.format.is_exynos_format) return '';
    const f = r.format;
    const planes = r.planes.filter((p) => p.steps && p.steps.length);
    if (!planes.length) return '';
    return `<div class="panel" id="${id}"><div class="row"><b>Replay: how each plane's size is derived</b>
      <span class="tabs" style="margin:0">${planes.map((_, i) => `<button data-pl="${i}" class="${i === 0 ? 'on' : ''}">plane ${i}</button>`).join('')}</span>
      <button data-act="play" class="primary">▶ Play</button><button data-act="prev">◀</button><button data-act="next">▶|</button>
      <span class="small muted" data-role="count"></span></div>
      <div class="aa-grid"><div><div class="small muted">whole plane (to scale)</div><div class="vp" data-view="full"></div></div>
      <div><div class="small muted">bottom-right corner, zoomed — where padding appears</div><div class="vp" data-view="corner"></div></div></div>
      <div class="legend small"><span><i style="background:var(--p0)"></i>requested content</span><span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>allocated width × height (pixels)</span><span><i class="hatch"></i>row padding up to byte_stride</span></div>
      <div class="caption" data-role="cap"></div></div>`;
  }
  function bindAlignAnimator(r, reqW, reqH, id) {
    const root = document.getElementById(id);
    if (!root) return;
    const f = r.format;
    const planes = r.planes.filter((p) => p.steps && p.steps.length);
    let pl = 0, i = 0, timer = null;
    const bppOf = (p) => (r.alloc_type && r.alloc_type.is_afbc ? f.bpp_afbc[p] : f.bpp[p]) || 8;
    function frames(p) {
      let stride = null;
      return planes[p].steps.map((s) => {
        if (s.stride != null) stride = s.stride;
        const stridePx = stride != null ? stride * 8 / bppOf(p) : s.w;
        return { w: s.w, h: s.h, stridePx: Math.max(stridePx, s.w), stride, msg: s.msg, cite: s.cite };
      });
    }
    function draw() {
      const fr = frames(pl);
      const cur = fr[Math.min(i, fr.length - 1)];
      const sub = pl > 0 && f.is_yuv ? [f.hsub, f.vsub] : [1, 1];
      const rw = Math.ceil(reqW / sub[0]), rh = Math.ceil(reqH / sub[1]);
      const maxW = Math.max(...fr.map((x) => x.stridePx), rw), maxH = Math.max(...fr.map((x) => x.h), rh);
      root.querySelectorAll('.vp').forEach((vp) => {
        const corner = vp.dataset.view === 'corner';
        const VW = Math.min(420, Math.max(160, (vp.closest('.panel').clientWidth - 60) / 2)), VH = corner ? 150 : 170;
        let ox = 0, oy = 0, s;
        if (corner) {
          const zx = Math.min(maxW, Math.max(16, 4 * (maxW - Math.min(rw, ...fr.map((x) => x.w))))), zy = Math.min(maxH, Math.max(16, 4 * (maxH - rh)));
          ox = maxW - zx; oy = maxH - zy; s = Math.min(VW / zx, VH / zy);
        } else s = Math.min(VW / maxW, VH / maxH);
        vp.style.height = Math.max(40, Math.min(VH, (maxH - oy) * s)) + 'px';
        vp.style.width = Math.max(80, Math.min(VW, (maxW - ox) * s)) + 'px';
        if (!vp.firstChild) vp.innerHTML = '<div class="b stride hatch"></div><div class="b alloc"></div><div class="b req"></div><div class="dim"></div>';
        const set = (el, w, h) => Object.assign(el.style, { left: (-ox * s) + 'px', top: (-oy * s) + 'px', width: (w * s) + 'px', height: (h * s) + 'px' });
        set(vp.querySelector('.stride'), cur.stridePx, cur.h);
        set(vp.querySelector('.alloc'), cur.w, cur.h);
        set(vp.querySelector('.req'), Math.min(rw, cur.w), Math.min(rh, cur.h));
        vp.querySelector('.dim').textContent = corner ? `x ${fmt(ox)}…${fmt(maxW)}, y ${fmt(oy)}…${fmt(maxH)}` : `${fmt(cur.w)} × ${fmt(cur.h)} px${cur.stride != null ? ` · stride ${fmt(cur.stride)} B` : ''}`;
      });
      root.querySelector('[data-role=count]').textContent = `step ${i + 1} / ${fr.length}`;
      root.querySelector('[data-role=cap]').innerHTML = `<b>${i + 1}.</b> ${esc(cur.msg)} ${src(cur.cite)}<div class="small muted">requested for this plane: ${fmt(rw)} × ${fmt(rh)} px</div>`;
      root.querySelector('[data-act=play]').textContent = timer ? '❚❚ Pause' : (i >= fr.length - 1 ? '↻ Replay' : '▶ Play');
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function play() {
      const n = frames(pl).length;
      if (i >= n - 1) i = 0;
      timer = setInterval(() => {
        if (!document.body.contains(root)) return stop();
        if (i >= frames(pl).length - 1) { stop(); draw(); return; }
        i++; draw();
      }, REDUCE ? 1400 : 1100);
      draw();
    }
    root.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', () => {
      stop(); pl = Number(b.dataset.pl); i = 0;
      root.querySelectorAll('[data-pl]').forEach((x) => x.classList.toggle('on', x === b));
      root.querySelectorAll('.vp').forEach((vp) => { vp.innerHTML = ''; });
      draw();
    }));
    root.querySelector('[data-act=play]').addEventListener('click', () => { if (timer) { stop(); draw(); } else play(); });
    root.querySelector('[data-act=prev]').addEventListener('click', () => { stop(); i = Math.max(0, i - 1); draw(); });
    root.querySelector('[data-act=next]').addEventListener('click', () => { stop(); i = Math.min(frames(pl).length - 1, i + 1); draw(); });
    draw();
  }
  G.alignAnimator = alignAnimator; G.bindAlignAnimator = bindAlignAnimator;

  // Hook into the format page: summary at the top, replay after the calculator result.
  const origFormatAfter = G.AFTER.format;
  G.AFTER.format = (params, name) => {
    origFormatAfter(params, name);
    const f = byName.get(name);
    if (!f) return;
    const h = document.querySelector('main h1');
    if (h && h.nextElementSibling) h.nextElementSibling.insertAdjacentHTML('afterend', describe(f) + formatMeaning(f));
    const out = document.getElementById('calcout');
    if (!out) return;
    const r = G.calcRun(name, G.usageValue(state.calc.usage));
    const html = alignAnimator(r, state.calc.w, state.calc.h, 'aa-format');
    if (html) {
      const anchor = out.querySelector('.tablewrap') || out.lastElementChild;
      anchor.insertAdjacentHTML('beforebegin', html);
      bindAlignAnimator(r, state.calc.w, state.calc.h, 'aa-format');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Code flow: buffer journey + autoplay                                */
  /* ------------------------------------------------------------------ */
  const LANES = ['Client process (IMapper)', 'Allocator service', 'Kernel (dma-buf)'];
  const PHASE_ORDER = (CF.phases || [['allocate'], ['import'], ['lock'], ['unlock'], ['free']]).map((p) => p[0]);
  // lane for each step, and the buffer state after it (hand-written from the cited code)
  const J = {
    aidl_allocate: [1], aidl_allocate2: [1], common_allocate: [1], buffer_allocate: [1], derive: [1], select_format: [1],
    get_best_format: [1], get_alloc_type: [1], calc_size: [1], exynos_prepare: [1], ion_allocate: [2], heap: [2], ion_allocate_attr: [2],
    mapper_import: [0], register: [0], retain: [0],
    mapper_lock: [0], gralloc_lock: [0], validate_lock: [0], ref_map: [0], ion_map: [2], buffer_sync: [0],
    mapper_unlock: [0], gralloc_unlock: [0],
    mapper_free: [0], unregister: [0], release: [0], ion_unmap: [2], alloc_side_free: [1],
    // full flow: selection internals, isSupported, stable-C mapper v5, metadata, HAL loading
    validate_desc: [1], get_base: [1], get_producers: [1], get_consumers: [1], producer_caps: [1], ip_caps: [1], consumer_caps: [1],
    active_caps: [1], get_supported: [1], is_fmt_supported: [1], ip_base: [1], get_afbc_format: [1], validate_afbc: [1], grade_format: [1],
    validate_fmt: [1], adjust_dims: [1], pixel_w_h: [1], select_heap: [1],
    aidl_is_supported: [1], common_is_supported: [1], mapper4_is_supported: [0], mapper_suffix: [1], v5_load: [0],
    v5_import: [0], v5_lock: [0], common_lock: [0], flush_locked: [0], reread_locked: [0], v5_unlock: [0], common_unlock: [0], v5_free: [0],
    v5_get_std: [0], v5_std_get: [0], std_helper: [0], plane_layouts: [0], v5_get_metadata: [0], pixel_get: [0], v5_set_std: [0],
    v5_set_helper: [0], set_crop: [0], v5_set_metadata: [0], hidl_get: [0], get_metadata: [0], hidl_set: [0], set_metadata: [0],
  };
  const STATE_AT = {
    // [handle, fds, ref_count, mapped, locked_ref_count, cpu flags, cite]
    aidl_allocate: ['descriptor received', '—', '—', 'no', '—', '—', L('gralloc4/src/aidl/GrallocAllocator.cpp', 38)],
    aidl_allocate2: ['descriptor received', '—', '—', 'no', '—', '—', L('gralloc4/src/aidl/GrallocAllocator2.cpp', 111)],
    derive: ['layout computed (alloc_format, plane_info)', '—', '—', 'no', '—', '—', L(P.ALLOC, 1045)],
    ion_allocate: ['private_handle_t created in allocator', 'buffer dma-buf(s)', '—', 'no', '—', '—', L(P.ION, 378)],
    ion_allocate_attr: ['complete; returned to caller, then the allocator closes its own copy', 'buffer fd(s) + metadata fd, dup’d to the client', '—', 'no', '—', '—', L(P.ALC, 134, 218)],
    common_allocate: ['allocation requested', '—', '—', 'no', '—', '—', L(P.ALC, 73)],
    mapper_import: ['cloned into this process', 'dup’d fds', '1', 'no', '0', '—', L(P.MAP, 450)],
    retain: ['registered', 'dup’d fds', '1 (ref_count++)', 'no — import does not map', '0', '—', L(P.REF, 279)],
    ref_map: ['registered', 'dup’d fds', '1', 'yes (mmap on first lock)', '0', '—', L(P.REF, 131)],
    buffer_sync: ['registered', 'dup’d fds', '1', 'yes', '0', 'cpu_read/cpu_write set', L(P.ACC, 69, 70)],
    gralloc_lock: ['locked', 'dup’d fds', '1', 'yes', '1 (locked_ref_count++)', 'set', L(P.ACC, 240)],
    gralloc_unlock: ['unlocked', 'dup’d fds', '1', 'yes — stays mapped until release', '0', 'cleared', L(P.ACC, 263, 265)],
    release: ['unregistered', 'dup’d fds', '0 → unmapped, record erased', 'no', '—', '—', L(P.REF, 306, 321)],
    mapper_free: ['deleted', 'closed', '0', 'no', '—', '—', L(P.MAP, 487, 488)],
    alloc_side_free: ['allocator copy deleted', 'closed in allocator', '—', '—', '—', '—', L(P.ALLOC, 1276, 1277)],
  };
  function stateFor(phase, idx) {
    // cumulative: walk all steps up to (phase, idx) in canonical order and keep the latest snapshot
    let last = null;
    for (const ph of PHASE_ORDER) {
      const ids = CF.paths[ph];
      for (let k = 0; k < ids.length; k++) {
        if (STATE_AT[ids[k]]) last = { id: ids[k], s: STATE_AT[ids[k]] };
        if (ph === phase && k === idx) return last;
      }
    }
    return last;
  }
  G.flowJourney = { LANES, PHASE_ORDER, J, STATE_AT, stateFor };
  /* ------------------------------------------------------------------ */
  /* Usage page: selection funnel                                        */
  /* ------------------------------------------------------------------ */
  const origUsageAfter = G.AFTER.usage;
  G.AFTER.usage = (params) => {
    origUsageAfter(params);
    const req = document.getElementById('ureq');
    if (!req) return;
    const r = E.allocate({ width: state.calc.w, height: state.calc.h, layer_count: 1, hal_format: V[req.value], usage: G.usageValue(state.calc.usage) }, state.flags);
    const c = r.selection && r.selection.candidates;
    const h2 = [...document.querySelectorAll('#uout h2')].find((x) => /Candidate formats/.test(x.textContent));
    if (!c || !h2) return;
    const sup = c.filter((x) => x.supported), best = Math.max(0, ...sup.map((x) => x.grade));
    const stages = [
      ['compatible base formats', c.length, 'same sub-sampling, RGB/YUV kind and comparable components', L(P.FMTS, 1150)],
      ['supported by every producer & consumer', sup.length, 'IP support table ∧ capability masks', L(P.FMTS, 586)],
      [`best grade (${best})`, sup.filter((x) => x.grade === best).length, '1 + number of AFBC modifier bits', L(P.FMTS, 1177)],
      ['selected', r.ok ? 1 : 0, r.ok ? shortName(r.format.name) : 'none', L(P.FMTS, 1307)],
    ];
    const max = Math.max(1, c.length);
    h2.insertAdjacentHTML('beforebegin', `<h2>Selection funnel</h2><div class="panel funnel">${stages.map(([t, n, d, cite], k) => `<div class="frow"><div class="flabel">${esc(t)}</div><div class="fbar"><span class="grow-x" style="width:${Math.max(2, 100 * n / max)}%;animation-delay:${k * 250}ms">${n}</span></div><div class="small muted">${esc(d)} ${src(cite)}</div></div>`).join('')}</div>`);
    const rows = h2.nextElementSibling && h2.nextElementSibling.querySelectorAll('tbody tr');
    if (rows) rows.forEach((tr, k) => { tr.classList.add('row-in'); tr.style.animationDelay = (k * 35) + 'ms'; });
  };

  /* ------------------------------------------------------------------ */
  /* Pixel storage: scan animation                                       */
  /* ------------------------------------------------------------------ */
  let scanTimer = null;
  function stopScan() { if (scanTimer) { clearInterval(scanTimer); scanTimer = null; } }
  const origStorageAfter = G.AFTER.storage;
  G.AFTER.storage = (params) => {
    origStorageAfter(params);
    const inp = document.querySelector('input[data-st="px"]');
    if (!inp) return;
    inp.closest('.panel').insertAdjacentHTML('beforeend', `<button id="scanbtn" class="${scanTimer ? '' : 'primary'}">${scanTimer ? '❚❚ Stop scan' : '▶ Scan pixels'}</button><span class="small muted">${G.storageState && G.storageState.scanMode === 'memory' ? 'walks through the stored samples in memory order' : 'walks the probe pixel through the image, left to right, top to bottom'}</span>`);
    document.getElementById('scanbtn').addEventListener('click', () => {
      if (scanTimer) { stopScan(); G.render(); return; }
      const st = G.storageState;
      scanTimer = setInterval(() => {
        if (route() !== 'storage') return stopScan();
        if (st.scanMode === 'memory') st.memk++;
        else {
          st.px++;
          if (st.px >= st.gw) { st.px = 0; st.py++; }
          if (st.py >= st.gh) { st.py = 0; }
        }
        G.storageSave(); G.render();
      }, REDUCE ? 1500 : 900);
      G.render();
    });
  };
  window.addEventListener('hashchange', () => { if (route() !== 'storage') stopScan(); });

  /* ------------------------------------------------------------------ */
  /* Learn                                                               */
  /* ------------------------------------------------------------------ */
  const CPU = () => U.GRALLOC_USAGE_SW_READ_OFTEN | U.GRALLOC_USAGE_SW_WRITE_OFTEN;
  const GPU = () => U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_RENDER;
  const run = (name, w, h, usage, flags) => E.allocate({ width: w, height: h, layer_count: 1, hal_format: byName.get(name) ? byName.get(name).value : V[name], usage }, flags || state.flags);
  const NO_FLAGS = Object.assign({}, E.DEFAULT_FLAGS);
  const GPU_AFBC = Object.assign({}, E.DEFAULT_FLAGS, { MALI_GPU_SUPPORT_AFBC_BASIC: true, MALI_GPU_SUPPORT_AFBC_YUV_WRITE: true, MALI_GPU_SUPPORT_AFBC_SPLITBLK: true, MALI_GPU_SUPPORT_AFBC_WIDEBLK: true, MALI_GPU_SUPPORT_AFBC_TILED_HEADERS: true });
  const fl = (name) => `<a class="mono" href="#/format/${encodeURIComponent(name)}">${esc(shortName(name))}</a>`;


  /* 4:2:0 chroma-sharing animation (Learn ch. 2). Standard BT.709 equations, unquantised — illustration only. */
  function sub420Html() {
    return `<div class="panel" id="sub420w"><div class="row"><b>Animation: how 4:2:0 stores a 2×2 block</b>
      <button class="primary" data-s="play">▶ Play</button><button data-s="0">original</button><button data-s="1">1 split</button><button data-s="2">2 share</button><button data-s="3">3 rebuild</button></div>
      <div class="row" style="align-items:flex-start;gap:24px"><div class="sub420" id="sub420"></div>
      <div class="small" style="max-width:420px"><div id="sub420cap" class="caption"></div>
      <div class="muted">Uses the standard BT.709 equations without quantisation, for illustration (not in this repo). In NV12 the four Y values go to plane 0 and the single Cb/Cr pair to plane 1 (${src(L(P.MMD, 192, 199), 'NV12 components')}); hsub = vsub = 2 (${src(byName.get('MALI_GRALLOC_FORMAT_INTERNAL_NV12').row, 'formats[]')}).</div></div></div></div>`;
  }
  function bindSub420() {
    const box = document.getElementById('sub420');
    if (!box) return;
    const cols = [[235, 16, 16], [235, 235, 16], [16, 16, 235], [235, 235, 235]];
    const kr = 0.2126, kb = 0.0722;
    const ycc = ([r, g, b]) => { const R = r / 255, Gg = g / 255, B = b / 255, Y = kr * R + (1 - kr - kb) * Gg + kb * B; return [Y, (B - Y) / (2 * (1 - kb)), (R - Y) / (2 * (1 - kr))]; };
    const rgb = (Y, Cb, Cr) => { const R = Y + 2 * (1 - kr) * Cr, B = Y + 2 * (1 - kb) * Cb, Gg = (Y - kr * R - kb * B) / (1 - kr - kb); return [R, Gg, B].map((v) => Math.max(0, Math.min(255, Math.round(v * 255)))); };
    const css = (c) => `rgb(${c.join(',')})`;
    const Y = cols.map((c) => ycc(c));
    const avg = [Y.reduce((a, c) => a + c[1], 0) / 4, Y.reduce((a, c) => a + c[2], 0) / 4];
    const pos = [[10, 10], [76, 10], [10, 76], [76, 76]];
    box.innerHTML = pos.map(([x, y], i) => `<div class="px" data-i="${i}" style="left:${x}px;top:${y}px"></div>`).join('') +
      pos.map(([x, y], i) => `<div class="dot" data-d="${i}" style="left:${x + 19}px;top:${y + 19}px;opacity:0"></div>`).join('') +
      `<div style="position:absolute;left:170px;top:10px" class="small muted">original</div>` +
      pos.map(([x, y], i) => `<div style="position:absolute;left:${170 + x / 2}px;top:${30 + y / 2}px;width:30px;height:30px;border-radius:4px;background:${css(cols[i])}"></div>`).join('');
    const pxs = [...box.querySelectorAll('.px')], dots = [...box.querySelectorAll('.dot')];
    const cap = document.getElementById('sub420cap');
    const caps = [
      'Four neighbouring pixels: red, yellow, blue, white.',
      '<b>Split</b>: each pixel becomes a brightness value <b>Y</b> (grey square) and a colour pair <b>Cb/Cr</b> (dot). Y is kept for every pixel.',
      '<b>Share</b>: the four Cb/Cr pairs are averaged into <b>one</b> pair — 4 Y + 1 Cb + 1 Cr = 6 samples instead of 12, i.e. 12 bits per pixel at 8 bits per sample.',
      '<b>Rebuild</b>: a reader combines each pixel’s own Y with the shared Cb/Cr. Brightness survives, but the four colours collapse towards their average — this is the colour bleeding you see in the Pixel storage tab.',
    ];
    function show(step) {
      cap.innerHTML = caps[step];
      pxs.forEach((el, i) => {
        const g = Math.round(Math.max(0, Math.min(1, Y[i][0])) * 255);
        el.style.background = step === 0 ? css(cols[i]) : step === 3 ? css(rgb(Y[i][0], avg[0], avg[1])) : `rgb(${g},${g},${g})`;
        el.textContent = step === 1 || step === 2 ? `Y ${(Y[i][0] * 100).toFixed(0)}%` : '';
      });
      dots.forEach((d, i) => {
        const [x, y] = pos[i];
        if (step === 1) Object.assign(d.style, { opacity: 1, left: (x + 19) + 'px', top: (y + 19) + 'px', background: css(rgb(0.5, Y[i][1], Y[i][2])) });
        else if (step === 2) Object.assign(d.style, { opacity: 1, left: '60px', top: '60px', background: css(rgb(0.5, avg[0], avg[1])) });
        else Object.assign(d.style, { opacity: 0 });
      });
    }
    let t = null;
    const root = document.getElementById('sub420w');
    root.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
      if (t) { clearInterval(t); t = null; }
      if (b.dataset.s !== 'play') return show(Number(b.dataset.s));
      let k = 0; show(0);
      t = setInterval(() => { if (!document.body.contains(root) || k >= 3) { clearInterval(t); t = null; return; } show(++k); }, 1700);
    }));
    show(0);
  }


  /* AFBC superblock animation (Learn ch. 5): numbers from the engine, header pointers from init_afbc. */
  const afbcState = { tiled: false };
  function afbcAnimHtml() {
    return `<div class="panel" id="afbcw"><div class="row"><b>Animation: how an AFBC buffer is organised</b>
      <button class="primary" data-a="play">▶ Play</button><button data-a="prev">◀</button><button data-a="next">▶</button>
      <label class="chk"><input type="checkbox" id="afbctiled" ${afbcState.tiled ? 'checked' : ''}> tiled headers (GPU with all AFBC features)</label></div>
      <div id="afbcbody"></div></div>`;
  }
  function bindAfbcAnim() {
    const root = document.getElementById('afbcw');
    if (!root) return;
    const flags = afbcState.tiled ? GPU_AFBC : Object.assign({}, E.DEFAULT_FLAGS, { MALI_GPU_SUPPORT_AFBC_BASIC: true });
    const W = 128, H = 64;
    const r = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', W, H, GPU(), flags);
    const body = document.getElementById('afbcbody');
    if (!r.ok || !r.alloc_type.is_afbc) { body.innerHTML = '<div class="note">AFBC was not selected with these assumptions.</div>'; return; }
    const pl = r.planes[0], f = r.format, tiled = r.alloc_type.is_tiled;
    const cols = pl.alloc_width / 16, rows = pl.alloc_height / 16, n = cols * rows;
    const sbBytes = E.ALIGN(Math.floor(f.bpp_afbc[0] * 256 / 8), 128);
    const hue = (i) => { const x = i % cols, y = Math.floor(i / cols); return `hsl(${20 + 300 * x / cols}, 65%, ${70 - 30 * y / rows}%)`; };
    const pad = (i) => (i % cols) * 16 >= W || Math.floor(i / cols) * 16 >= H;
    const cell = Math.max(12, Math.min(26, Math.floor(260 / cols)));
    body.innerHTML = `<div class="afbcgrid">
      <div><div class="small muted">image ${W}×${H} → allocated ${pl.alloc_width}×${pl.alloc_height}, ${cols}×${rows} superblocks of 16×16</div>
        <div class="sbgrid" style="grid-template-columns:repeat(${cols}, ${cell}px)">${Array.from({ length: n }, (_, i) => `<span data-i="${i}" class="${pad(i) ? 'hatch' : ''}" style="${pad(i) ? '' : `background:${hue(i)}`};width:${cell}px;height:${cell}px"></span>`).join('')}</div>
        <div class="small muted">hatched = padding superblocks added by alignment</div></div>
      <div style="min-width:0"><div class="small"><b>header</b> — ${n} entries × 16 B = ${fmt(n * 16)} B, aligned to ${fmt(pl.header)} B ${src(L(P.ALLOC, 776, 777))}</div>
        <div class="hstrip">${Array.from({ length: n }, (_, i) => `<span data-h="${i}"></span>`).join('')}${pl.header > n * 16 ? `<em style="flex:${(pl.header - n * 16) / 16}"></em>` : ''}</div>
        <div class="small" style="margin-top:8px"><b>body</b> — ${n} slots × ${fmt(sbBytes)} B = ${fmt(pl.body)} B reserved ${src(L(P.ALLOC, 736, 737))}</div>
        <div class="bstrip">${Array.from({ length: n }, (_, i) => `<span data-b="${i}"></span>`).join('')}</div>
        <div class="caption small" id="afbccap"></div></div></div>`;
    const cap = document.getElementById('afbccap');
    let i = -1, t = null;
    function show(k) {
      i = Math.max(0, Math.min(n - 1, k));
      body.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
      body.querySelectorAll('.done').forEach((e) => { if (Number(e.dataset.i ?? e.dataset.h ?? e.dataset.b) > i) e.classList.remove('done'); });
      for (let j = 0; j <= i; j++) ['i', 'h', 'b'].forEach((a) => { const e = body.querySelector(`[data-${a}="${j}"]`); if (e) e.classList.add('done'); });
      ['i', 'h', 'b'].forEach((a) => body.querySelector(`[data-${a}="${i}"]`).classList.add('on'));
      const x = (i % cols) * 16, y = Math.floor(i / cols) * 16;
      const bodyOff = pl.header + i * sbBytes;
      cap.innerHTML = `Superblock <b>${i}</b> covers pixels x ${x}–${x + 15}, y ${y}–${y + 15}${pad(i) ? ' (padding)' : ''}. Its header entry is bytes <b>${fmt(i * 16)}–${fmt(i * 16 + 15)}</b>. When built with <code>GRALLOC_INIT_AFBC</code> ${src(L(P.ION, 421, 432))}, ` + (tiled
        ? `with tiled headers gralloc initialises headers to zero (“solid colour” blocks) instead of pointing them at body slots ${src(L(P.ALLOC, 286, 293))}; where the payload goes is decided by the encoder (AFBC spec, not in this repo).`
        : `gralloc initialises it to point at body offset <b>${fmt(bodyOff)}</b> = header ${fmt(pl.header)} + ${i} × ${fmt(sbBytes)} ${src(L(P.ALLOC, 303, 308))}; the compressed payload written later may use less than the ${fmt(sbBytes)} B slot.`);
    }
    function stopA() { if (t) { clearInterval(t); t = null; } root.querySelector('[data-a=play]').textContent = '▶ Play'; }
    root.querySelector('[data-a=play]').onclick = () => {
      if (t) return stopA();
      if (i >= n - 1) i = -1;
      root.querySelector('[data-a=play]').textContent = '❚❚ Pause';
      t = setInterval(() => { if (!document.body.contains(root) || i >= n - 1) return stopA(); show(i + 1); }, n > 40 ? 160 : 320);
    };
    root.querySelector('[data-a=prev]').onclick = () => { stopA(); show(i - 1); };
    root.querySelector('[data-a=next]').onclick = () => { stopA(); show(i + 1); };
    document.getElementById('afbctiled').onchange = (e) => { stopA(); afbcState.tiled = e.target.checked; bindAfbcAnim(); };
    body.querySelectorAll('[data-i]').forEach((e) => e.addEventListener('click', () => { stopA(); show(Number(e.dataset.i)); }));
    show(0);
  }

  const CHAPTERS = [
    {
      title: 'A buffer is planes, strides and padding',
      body() {
        const r = run('MALI_GRALLOC_FORMAT_INTERNAL_NV12', 1000, 999, CPU(), NO_FLAGS);
        const p0 = r.planes[0], p1 = r.planes[1];
        return `<p>A gralloc buffer is one or more dma-bufs plus a description of where each <b>plane</b> starts and how its rows are laid out. For every plane gralloc records an <code>offset</code>, a <code>byte_stride</code> and the allocated <code>alloc_width</code> × <code>alloc_height</code> (${src(L(P.BUF, 74, 122), 'plane_info_t')}).</p>
        <ul>
          <li><b>byte_stride</b> is “the number of bytes between two vertically adjacent pixels in given plane”, i.e. <code>ALIGN(alloc_width × bpp / 8, alignment)</code>; for uncompressed buffers it “might contain additional padding beyond the alloc_width” (${src(L(P.BUF, 85, 99))}).</li>
          <li><b>alloc_width / alloc_height</b> are the requested size rounded up by format and usage rules (${src(L(P.BUF, 102, 119))}).</li>
          <li><b>offset</b>: plane <i>n</i> starts where plane <i>n−1</i> ends (generic path, ${src(L(P.ALLOC, 784, 787))}).</li>
          <li>The total size also gets <code>EXT_SIZE</code> = 256 bytes (“MFC requires EXT_SIZE padding”, ${src(L(P.ALLOC, 1178, 1179))}).</li>
        </ul>
        <h3>Live example: NV12, 1000 × 999, CPU read/write</h3>
        <p>Height 999 is odd but NV12 needs <code>align_h = 2</code>, so the luma plane becomes ${fmt(p0.alloc_width)} × ${fmt(p0.alloc_height)}. The chroma plane starts at byte ${fmt(p1.offset)} (= ${fmt(p0.byte_stride)} × ${fmt(p0.alloc_height)}) and has ${fmt(p1.alloc_width)} × ${fmt(p1.alloc_height)} CbCr pairs, ${fmt(p1.byte_stride)} bytes per row. Total: ${fmt(r.total)} bytes.</p>
        ${G.alignAnimator(r, 1000, 999, 'aa-l1')}${G.planeTable(r)}${G.layoutSVG(r, r.format, 1000, 999)}`;
      },
      after() { G.bindAlignAnimator(run('MALI_GRALLOC_FORMAT_INTERNAL_NV12', 1000, 999, CPU(), NO_FLAGS), 1000, 999, 'aa-l1'); },
    },
    {
      title: 'YUV and chroma sub-sampling',
      body() {
        const yuv = FD.formats.filter((f) => f.is_yuv && f.linear && !f.is_sbwc && !/_S10B$|_TILED$/.test(f.name) && !f.is_exynos_format);
        return `<p>YUV formats store brightness (<b>Y</b>, luma) separately from colour (<b>Cb</b>, <b>Cr</b>, chroma). Most of them store fewer chroma samples than pixels: <code>hsub</code>/<code>vsub</code> give the horizontal/vertical sub-sampling factors (${src(L(P.FIH, 62, 63))}), and the mapper reports them for every plane after the first (${src(L(P.MMD, 383, 384))}).</p>
        <ul>
          <li><b>4:2:0</b> (<code>hsub=2, vsub=2</code>): one Cb and one Cr per 2×2 pixels — e.g. ${fl('MALI_GRALLOC_FORMAT_INTERNAL_NV12')}, ${fl('MALI_GRALLOC_FORMAT_INTERNAL_YV12')}, ${fl('MALI_GRALLOC_FORMAT_INTERNAL_P010')}.</li>
          <li><b>4:2:2</b> (<code>hsub=2, vsub=1</code>): one Cb/Cr per 2×1 pixels — e.g. ${fl('MALI_GRALLOC_FORMAT_INTERNAL_NV16')}, ${fl('MALI_GRALLOC_FORMAT_INTERNAL_YUV422_8BIT')}, ${fl('MALI_GRALLOC_FORMAT_INTERNAL_Y210')}.</li>
          <li><b>4:4:4</b> (<code>hsub=vsub=1</code>): e.g. ${fl('MALI_GRALLOC_FORMAT_INTERNAL_Y410')}.</li>
        </ul>
        <p>How the samples are arranged differs: <b>semi-planar</b> (Y plane + one interleaved CbCr plane, NV12/NV21/P010), <b>planar</b> (separate Y, Cr, Cb planes, YV12 — note the component table puts Cr in plane 1 and Cb in plane 2, ${src(L(P.MMD, 225, 230))}), and <b>packed</b> (everything in one plane, YUYV-style ${fl('MALI_GRALLOC_FORMAT_INTERNAL_YUV422_8BIT')}, ${src(L(P.MMD, 162, 165))}).</p>
        ${sub420Html()}
        <p><a href="#/storage?f=MALI_GRALLOC_FORMAT_INTERNAL_NV12,MALI_GRALLOC_FORMAT_INTERNAL_YV12,MALI_GRALLOC_FORMAT_INTERNAL_YUV422_8BIT">Compare NV12, YV12 and YUYV in the Pixel storage tab</a> (try “Scan pixels”).</p>
        <h3>Bits per pixel before padding (computed from bpp and sub-sampling)</h3>
        <div class="tablewrap"><table><thead><tr><th>format</th><th>planes</th><th>sub-sampling</th><th>bpp per plane</th><th>avg bits / pixel</th><th>1920×1080 bytes</th></tr></thead><tbody>
        ${yuv.map((f) => { const a = avgBpp(f); return `<tr><td>${fl(f.name)}</td><td>${f.npln}</td><td>${f.hsub}×${f.vsub}</td><td class="mono">${f.bpp.slice(0, f.npln).join('/')}</td><td>${Number.isInteger(a) ? a : a.toFixed(2)}</td><td>${fmt(Math.round(1920 * 1080 * a / 8))}</td></tr>`; }).join('')}
        </tbody></table></div><p class="small muted">10-bit formats such as P010 store each 10-bit value in a 16-bit container (component offset 6, ${src(L(P.MMD, 215, 222))}), so they cost 16 bits per luma sample.</p>`;
      },
      after() { bindSub420(); },
    },
    {
      title: 'How gralloc picks the format it actually allocates',
      body() {
        const impl = ['HWC overlay only', 'Camera output + CPU read', 'Camera → video encoder (MFC)', 'BIG decoder → display', 'Video decoder → display', 'CPU read/write only'].map((k) => {
          const m = G.PRESETS[k]; const u = G.usageValue(m);
          const r = run('HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', 1920, 1080, u, NO_FLAGS);
          const why = r.trace.find((t) => /IMPLEMENTATION_DEFINED/.test(t.msg));
          return `<tr><td>${esc(k)}</td><td class="mono">${G.hex(u)}</td><td>${r.ok ? fl(r.format.name) + ' ' + E.modNames(r.alloc_format).map((x) => badge(x, 'b-afbc')).join('') : esc(r.error)}</td><td class="small">${why ? esc(why.msg) + ' ' + src(why.cite) : ''}</td></tr>`;
        }).join('');
        const app = G.usageValue(G.PRESETS['App window (GPU render + HWC overlay)']);
        const a0 = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1920, 1080, app, NO_FLAGS), a1 = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1920, 1080, app, GPU_AFBC);
        return `<p>The requested format is only a starting point. <code>mali_gralloc_select_format</code> (${src(L(P.FMTS, 1482))}) runs these steps:</p>
        <ol>
          <li><b>Resolve flexible formats</b> such as <code>IMPLEMENTATION_DEFINED</code> or <code>YCbCr_420_888</code> from the usage (${src(L(P.FMTS, 1365), 'get_base_format')}).</li>
          <li><b>Exynos formats and BLOB</b> are allocated as requested, and so is any request with usage 0 (${src(L(P.FMTS, 1509, 1516))}).</li>
          <li><b>Producers and consumers</b> are derived from the usage bits — CPU, GPU, display (DPU), video (VPU/MFC/BIG), camera, TPU (${src(L(P.FMTS, 198), 'get_producers')}, ${src(L(P.FMTS, 105), 'get_consumers')}).</li>
          <li><b>Capabilities</b> of all producers and of all consumers are intersected (${src(L(P.FMTS, 331))}, ${src(L(P.FMTS, 264))}); the masks themselves depend on board build flags (${src(L(P.CAPS, 42))}).</li>
          <li><b>Compatible formats</b> (same sub-sampling, same RGB/YUV kind, comparable components) are each checked against the IP support table and capabilities, and graded by how many AFBC features they get (${src(L(P.FMTS, 1228), 'get_best_format')}).</li>
          <li>The best one wins — <b>but only if no CPU is involved</b>; with CPU usage the requested format is kept (${src(L(P.FMTS, 1312, 1314))}).</li>
        </ol>
        <h3>Live: what does IMPLEMENTATION_DEFINED become?</h3>
        <div class="tablewrap"><table><thead><tr><th>usage preset</th><th>value</th><th>allocated as</th><th>rule</th></tr></thead><tbody>${impl}</tbody></table></div>
        <h3>Live: same request, different board</h3>
        <p>RGBA_8888, app-window usage (GPU render + texture + HWC). With no board flags the GPU advertises no AFBC, so the buffer stays uncompressed; with all <code>MALI_GPU_SUPPORT_AFBC_*</code> flags on it becomes AFBC.</p>
        <div class="grid2"><div class="panel"><b>no board flags</b>${G.resultSummary(a0)}</div><div class="panel"><b>GPU AFBC flags on</b>${G.resultSummary(a1)}</div></div>
        <p><a href="#/usage">Try other usages in the Usage flags tab</a> — it shows the candidate list and a funnel for any usage.</p>`;
      },
    },
    {
      title: 'Alignment, step by step',
      body() {
        const u = CPU() | GPU();
        const r = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1000, 999, u, NO_FLAGS);
        const y = run('MALI_GRALLOC_FORMAT_INTERNAL_YV12', 1000, 999, u, NO_FLAGS);
        return `<p>Sizes are rounded up in two layers inside <code>calc_allocation_size</code> (${src(L(P.ALLOC, 589))}):</p>
        <ol><li><b>Pixel alignment</b> (<code>get_pixel_w_h</code>, ${src(L(P.ALLOC, 317))}): round width/height to the format's <code>align_w</code>/<code>align_h</code>, divide by sub-sampling for chroma planes, then — with CPU usage — round width to <code>align_w_cpu</code>, or for AFBC to whole superblocks.</li>
        <li><b>Byte-stride alignment</b> (${src(L(P.ALLOC, 646, 704))}): the row is padded to <code>lcm(hw_align, cpu_align)</code> bytes, where <code>hw_align</code> is 16 (YUV) or 64 (RGB) for hardware usage and at least 64 with GPU usage, and <code>cpu_align = bpp × align_w_cpu / 8</code>.</li></ol>
        <h3>Live: RGBA_8888, 1000 × 999, CPU + GPU usage</h3>
        <p>Press play to watch the plane grow: 1000×999 → ${fmt(r.planes[0].alloc_width)}×${fmt(r.planes[0].alloc_height)} pixels, stride ${fmt(r.planes[0].byte_stride)} bytes, total ${fmt(r.total)} bytes (vs. ${fmt(1000 * 999 * 4)} bytes of actual pixels).</p>
        ${G.alignAnimator(r, 1000, 999, 'aa-l4')}
        <details><summary>All steps as text</summary>${G.traceList(r.planes[0].steps)}</details>
        <h3>A special rule: YV12</h3>
        <p>With both CPU and hardware usage, YV12's chroma stride is forced to <code>ALIGN(luma_stride / 2, 16)</code> (${src(L(P.ALLOC, 452, 466), 'update_yv12_stride')}). For 1000 × 999: luma stride ${fmt(y.planes[0].byte_stride)}, chroma strides ${fmt(y.planes[1].byte_stride)} / ${fmt(y.planes[2].byte_stride)} bytes.</p>
        ${G.alignAnimator(y, 1000, 999, 'aa-l4b')}`;
      },
      after() {
        const u = CPU() | GPU();
        G.bindAlignAnimator(run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1000, 999, u, NO_FLAGS), 1000, 999, 'aa-l4');
        G.bindAlignAnimator(run('MALI_GRALLOC_FORMAT_INTERNAL_YV12', 1000, 999, u, NO_FLAGS), 1000, 999, 'aa-l4b');
      },
    },
    {
      title: 'Compression: AFBC and SBWC',
      body() {
        const lin = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1920, 1080, GPU(), NO_FLAGS);
        const afbc = run('MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', 1920, 1080, GPU(), GPU_AFBC);
        const p = afbc.planes[0];
        return `<h3>AFBC (Arm Frame Buffer Compression)</h3>
        <p>AFBC is not a separate format: it is a set of <b>modifier bits</b> in the upper 32 bits of the 64-bit internal format (${src(L(P.MGF, 141, 171))}). The image is cut into <b>superblocks</b> of 16×16, 32×8 or 64×4 pixels (${src(L(P.ALLOC, 104, 133))}). The buffer holds a header array — 16 bytes per superblock (${src(L(P.ALLOC, 72))}) — followed by a body that reserves <code>ALIGN(bpp_afbc × pixels / 8, 128)</code> bytes per superblock (${src(L(P.ALLOC, 736))}).</p>
        ${afbcAnimHtml()}
        <p><b>Consequence:</b> gralloc reserves worst-case space, so an AFBC allocation is <em>not smaller</em> than the uncompressed one — the saving is in memory bandwidth, not allocation size. Live, RGBA_8888 1920×1080 GPU usage:</p>
        <div class="tablewrap"><table><thead><tr><th></th><th>uncompressed (no board flags)</th><th>AFBC (GPU AFBC flags on)</th></tr></thead><tbody>
          <tr><td>modifiers</td><td>—</td><td>${E.modNames(afbc.alloc_format).map((x) => badge(x, 'b-afbc')).join('')}</td></tr>
          <tr><td>allocated pixels</td><td>${fmt(lin.planes[0].alloc_width)}×${fmt(lin.planes[0].alloc_height)}</td><td>${fmt(p.alloc_width)}×${fmt(p.alloc_height)}</td></tr>
          <tr><td>header</td><td>—</td><td>${fmt(p.header)} bytes</td></tr>
          <tr><td>body</td><td>${fmt(lin.planes[0].body)} bytes</td><td>${fmt(p.body)} bytes</td></tr>
          <tr><td>total</td><td><b>${fmt(lin.total)}</b></td><td><b>${fmt(afbc.total)}</b></td></tr>
          <tr><td>CPU lock</td><td>${badge('allowed', 'b-ok')}</td><td>${badge('rejected', 'b-bad')} ${src(L(P.ACC, 150))}</td></tr>
        </tbody></table></div>
        <p>Whether AFBC is used is decided per allocation from the capabilities of every producer and consumer (chapter 3). Clients learn about it through the DRM modifier (${src(L(P.DRM, 117), 'drm_modifier_from_handle')}) and the COMPRESSION metadata (${src(L(P.MAP, 104, 109))}).</p>
        <h3>SBWC (Samsung Bandwidth Compression)</h3>
        <p>SBWC <em>is</em> expressed as separate format IDs: 8-bit and 10-bit, lossless and lossy (the L40…L80 suffixes) (${src(L(P.EXF, 79, 100))}). gralloc lays them out in <code>setup_sbwc_*</code> (${src(L(P.EXA, 56, 162))}) but the size macros come from a kernel header that is not in this repository, so their byte sizes are <b>not confirmed in source</b>. They are not reported as compressed through the COMPRESSION metadata (only AFBC is, ${src(L(P.MAP, 106, 107))}), and GPU usage with SBWC is logged as invalid (${src(L(P.ALLOC, 984))}). Camera buffers headed only to the MFC encoder may become SBWC automatically (${src(L(P.FMTS, 1387, 1400))}).</p>`;
      },
      after() { bindAfbcAnim(); },
    },
    {
      title: 'Life of a buffer',
      body() {
        return `<p>Two processes are involved: the <b>allocator service</b> creates the buffer, the <b>client</b> (any process that uses it) imports, locks and frees it through the mapper library.</p>
        <ol>
          <li><b>Allocate</b> (allocator): compute the layout, allocate dma-buf(s) from a heap chosen by usage (${src(L(P.ION, 82), 'select_dmabuf_heap')}), add a metadata dma-buf, then return handles — and immediately close the allocator's own copies (${src(L(P.ALC, 210, 218))}).</li>
          <li><b>Import</b> (client): clone the handle and take a reference. Nothing is mapped yet (${src(L(P.REF, 254, 281), 'BufferManager::retain')}).</li>
          <li><b>Lock</b>: AFBC buffers are refused; otherwise the buffer is mmapped on first lock and the CPU pointer returned (${src(L(P.ACC, 192, 243), 'mali_gralloc_lock')}). Cache sync via DMA_BUF_IOCTL_SYNC only happens if built with <code>GRALLOC_ION_SYNC_ON_LOCK</code> (${src(L(P.ACC, 72, 80))}).</li>
          <li><b>Unlock</b>: end CPU access; the mapping stays (${src(L(P.ACC, 254, 266))}).</li>
          <li><b>Free</b>: drop the reference; at zero the buffer is unmapped and its fds closed (${src(L(P.REF, 292, 325))}, ${src(L(P.MAP, 472, 491))}).</li>
        </ol>
        <p><a href="#/flow?p=allocate&amp;s=0">Run it in the Code flow tab</a>: press Run to execute the whole lifecycle line by line and watch the buffer state (ref count, mapping, lock count) change.</p>`;
      },
    },
  ];

  G.views.learn = (params, arg) => {
    const n = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(Number(arg)) || 0));
    const ch = CHAPTERS[n];
    return `<h1>Learn</h1>
      <div class="tabs">${CHAPTERS.map((c, i) => `<a class="tabbtn ${i === n ? 'on' : ''}" href="#/learn/${i}">${i + 1}. ${esc(c.title)}</a>`).join('')}</div>
      <div class="panel learn"><h2 style="margin-top:4px">${n + 1}. ${esc(ch.title)}</h2>${ch.body()}</div>
      <div class="row">${n > 0 ? `<a class="tabbtn" href="#/learn/${n - 1}">Back: ${esc(CHAPTERS[n - 1].title)}</a>` : ''}${n < CHAPTERS.length - 1 ? `<a class="tabbtn primary" href="#/learn/${n + 1}">Next: ${esc(CHAPTERS[n + 1].title)}</a>` : ''}</div>
      <p class="small muted">Explanations are written by hand; every claim links to the code it comes from, and every number on this page is computed live by the JS port of the allocator (engine.js) with no board flags unless stated.</p>`;
  };
  G.AFTER.learn = (params, arg) => {
    const n = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(Number(arg)) || 0));
    if (CHAPTERS[n].after) CHAPTERS[n].after();
  };
})();
