/*
 * storage.js — "Pixel storage" tab: how each format stores pixel data, and a
 * side-by-side comparison of up to three formats.
 *
 * Everything here is derived from data extracted from the repo:
 *   - component bit positions: PlaneLayout component table, MapperMetadata.cpp
 *     (keyed by DRM fourcc from drmutils.cpp)
 *   - sample size per plane: formats[].bpp (linear) / bpp_afbc — the same value
 *     the mapper reports as sampleIncrementInBits (MapperMetadata.cpp:309, :360-364)
 *   - subsampling: formats[].hsub/vsub, reported for planes > 0 (:383-384)
 *   - byte addresses: plane offset + row * byte_stride (+ sample position), the
 *     fields the mapper reports as offsetInBytes / strideInBytes (:377-379),
 *     from the JS port of the allocator (engine.js).
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src, L, P, byName, shortName, badge, fmt, state, E, U, V, FD } = G;

  const COMP_COL = { R: '#e15759', G: '#59a14f', B: '#4e79a7', A: '#a0a0a0', Y: '#c8b98a', CB: '#5b8fd4', CR: '#e0766d', RAW: '#b07aa1' };
  const GROUP_COL = ['#fde2b8', '#cfe8cf', '#d6e2f7', '#f6d0d6', '#e4d7f2', '#d3efec', '#f3e3c8', '#dfe7c4', '#f2d9e9', '#d9e6ee', '#efe7d2', '#e1e1f5'];
  const st = Object.assign({ gw: 16, gh: 8, px: 5, py: 3, src: 'sunset', scanMode: 'raster', memk: 0 }, G.store.get('storage', {}));
  if (st.src === 'upload') st.src = 'sunset'; // uploaded images are not persisted
  const save = () => G.store.set('storage', st);
  G.storageState = st; G.storageSave = save;

  const isRaw10or12 = (f) => f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_RAW10' || f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_RAW12';
  const isS10B = (f) => /_S10B$/.test(f.name);
  const isTiledExynos = (f) => f.name === 'HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SP_M_TILED';
  const isY0L2 = (f) => f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_Y0L2';

  /* Model of one plane: sample size, component instances, macro-pixel size. */
  function planeModel(f, p) {
    const sampleBits = f.linear ? f.bpp[p] : f.bpp_afbc[p];
    const raw = (f.components && f.components.planes[p]) || [];
    const comps = raw.filter((c) => c.bits > 0);
    const span = comps.length ? Math.max(...comps.map((c) => c.offset + c.bits)) : sampleBits;
    const macroBits = sampleBits ? Math.ceil(span / sampleBits) * sampleBits : span;
    const ppm = sampleBits ? macroBits / sampleBits : 1; // samples (pixels of this plane) per macro-pixel
    const count = {};
    comps.forEach((c) => { count[c.type] = (count[c.type] || 0) + 1; });
    const seen = {};
    const labelled = comps.slice().sort((a, b) => a.offset - b.offset).map((c) => {
      const i = seen[c.type] = (seen[c.type] === undefined ? 0 : seen[c.type] + 1);
      return Object.assign({}, c, { label: count[c.type] > 1 ? `${c.type}${i}` : c.type });
    });
    const sub = p > 0 && f.is_yuv ? [f.hsub || 1, f.vsub || 1] : [1, 1];
    return { p, sampleBits, comps: labelled, rawComps: raw, macroBits, ppm, sub };
  }

  function models(f) { return Array.from({ length: f.npln }, (_, p) => planeModel(f, p)); }

  /* Caveats: what the repo does NOT describe for this format (each cited). */
  function caveats(f, ms) {
    const out = [];
    if (!f.linear) out.push(['err', `<b>Compressed-only.</b> <code>.linear = false</code> in ${src(f.row)}: the format exists only as AFBC, so there is no row-by-row pixel layout. Sizes per superblock are below; the compressed encoding is defined by Arm's AFBC specification, not by this repo.`]);
    if (f.is_sbwc) out.push(['err', `<b>SBWC-compressed.</b> Data is stored with Samsung Bandwidth Compression (${src(f.sbwc_loc, 'is_sbwc_format')}). The bit layout of compressed data and even the buffer sizes come from <code>SBWC_*</code> macros in an external kernel header (${src(L(P.EXA, 19))}) — <b>Not confirmed in source</b>. The component view below (from the DRM fourcc the code reports, ${f.drm_fourcc ? src(f.drm_fourcc.loc) : ''}) describes the <em>decoded</em> semantics only.`]);
    if (isRaw10or12(f)) out.push(['note', `<b>Packed RAW.</b> The PlaneLayout table returns a single <code>RAW</code> component with size −1 (${src(L(P.MMD, 277))}) and the mapper reports <code>sampleIncrementInBits = 0</code> (${src(L(P.MMD, 371))}). The ${f.bpp[0]}-bit packing order is <b>not described in this repo</b>; only bpp=${f.bpp[0]} and the stride rules are.`]);
    if (isS10B(f)) out.push(['note', `<b>8-bit + separated 2-bit.</b> The enum comment says "${esc((f.enum_comments && f.enum_comments.group && f.enum_comments.group.text) || '')}" (${src(f.enum_comments && f.enum_comments.group && f.enum_comments.group.loc)}). <code>setup_420_sp_s10b</code> sizes each plane as <code>w×h</code> bytes + <code>S2B_PLANE_SIZE = ALIGN(w/4,16)×ALIGN(h,16)</code> (${src(L(P.EXA, 23))}, ${src(L(P.EXA, 210))}) with <code>byte_stride = width</code> (${src(L(P.EXA, 213))}). That implies 1 byte per sample in the main area plus 2 bits per sample in a separate area, but the order of the areas and the bit order of the 2-bit area are <b>not stated</b>. Note the mapper still reports <code>sampleIncrementInBits = bpp = ${f.bpp[0]}</code> (${src(L(P.MMD, 309))}), which does not match the 1-byte stride.`]);
    if (isTiledExynos(f)) out.push(['note', `<b>Tiled.</b> <code>tile_size = ${f.tile_size}</code> ("Tile size (in pixels), assumed square", ${src(L(P.FIH, 67))}) and <code>byte_stride = width × 16</code> (${src(L(P.EXA, 320))}). The order of pixels inside a tile and of tiles in memory is <b>not described in this repo</b>; the row view below is therefore not shown.`]);
    if (isY0L2(f)) out.push(['note', `<b>Y0L2.</b> One 64-bit block holds 4 Y, 1 Cb, 1 Cr and alpha bits (${f.components ? src(f.components.loc) : ''}); <code>tile_size = ${f.tile_size}</code> suggests a 2×2 pixel block, but which Y belongs to which pixel is <b>not stated in source</b>.`]);
    ms.forEach((m) => {
      if (!m.rawComps.length && !isRaw10or12(f) && f.linear && !f.is_sbwc) out.push(['note', `Plane ${m.p}: no component description — ${f.drm_fourcc ? `${esc(f.drm_fourcc.fourcc)} has no entry in the PlaneLayout table` : 'the format has no DRM fourcc (drmutils.cpp)'} (${src(FD.components_table_loc)}). Only the sample size (${m.sampleBits} bits) and component count (<code>ncmp[${m.p}] = ${f.ncmp[m.p]}</code>) are known.`]);
    });
    if (f.components && f.components.planes.length < f.npln && f.components.planes.length) out.push(['note', `The DRM fourcc reported for this format (${esc(f.drm_fourcc.fourcc)}, ${src(f.drm_fourcc.loc)}) describes ${f.components.planes.length} plane(s) but <code>npln = ${f.npln}</code>; plane(s) ≥ ${f.components.planes.length} get no component list.`]);
    if (f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_P210') out.push(['note', `The P210 component table lists <code>CB</code> twice in plane 1 (${src(L(P.MMD, 212))}); shown as written.`]);
    if (f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_RGB_565') out.push(['info', `With AFBC the reported fourcc changes to <code>DRM_FORMAT_BGR565</code> (${src(L(P.DRM, 106, 109))}), i.e. the component order flips (${src(L(P.MMD, 131))}).`]);
    if (f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_16161616') out.push(['info', `Each 16-bit component is floating point: "16-bit floating point format." (${src(L(P.MGF, 77))}); fourcc <code>ABGR16161616F</code>.`]);
    if (f.is_yuv) out.push(['info', `Chroma siting (where a chroma sample sits relative to its luma samples) is reported as <code>ChromaSiting_Unknown</code> for YUV (${src(L(P.MAP, 116))}); the grids below only show <em>which</em> pixels share a chroma sample.`]);
    if (f.is_exynos_format && f.fd_count && f.fd_count.fd_count > 1) out.push(['info', `Multi-fd: planes live in ${f.fd_count.fd_count} separate dma-bufs, so each plane's offset is relative to its own fd; the mapper warns plane-layout offsets of multi-fd formats are unreliable (${src(L(P.MMD, 317))}).`]);
    return out;
  }

  /* Bit/byte diagram of one macro-pixel (little-endian byte placement assumed). */
  function bitDiagram(m, sample) {
    if (!m.comps.length || m.macroBits % 8 !== 0 || m.macroBits > 64) return '';
    const bitv = (b) => (sample == null ? null : Number((sample >> BigInt(b)) & 1n));
    const owner = new Array(m.macroBits).fill(null);
    m.comps.forEach((c) => { for (let b = 0; b < c.bits; b++) owner[c.offset + b] = { c, b }; });
    const nbytes = m.macroBits / 8;
    let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0">';
    for (let B = 0; B < nbytes; B++) {
      html += `<div><div class="small muted" style="text-align:center">byte ${B}</div><div style="display:flex">`;
      for (let i = 7; i >= 0; i--) {
        const bit = B * 8 + i, o = owner[bit];
        const col = o ? COMP_COL[o.c.type] || '#ccc' : 'transparent';
        html += `<span title="sample bit ${bit}${o ? ` = ${o.c.label} bit ${o.b}` : ' (unused / padding)'}" style="width:22px;height:30px;border:1px solid var(--line);background:${o ? col + '55' : 'repeating-linear-gradient(45deg,var(--code),var(--code) 3px,transparent 3px,transparent 6px)'};font-size:9px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1"><b>${o ? esc(o.c.label) : ''}</b><span class="${sample == null ? 'muted' : ''}" style="${sample == null ? '' : 'font-size:12px;font-weight:700'}">${sample == null ? (o ? o.b : bit) : bitv(bit)}</span></span>`;
      }
      html += '</div></div>';
    }
    return html + '</div>';
  }

  function compTable(m) {
    if (!m.comps.length) return '';
    return `<table class="small"><thead><tr><th>component</th><th>bit offset</th><th>bits</th><th>byte(s)</th></tr></thead><tbody>${m.comps.map((c) =>
      `<tr><td><span style="display:inline-block;width:10px;height:10px;background:${COMP_COL[c.type]};margin-right:4px"></span>${esc(c.label)}</td><td>${c.offset}</td><td>${c.bits}</td><td>${Math.floor(c.offset / 8)}${Math.floor((c.offset + c.bits - 1) / 8) !== Math.floor(c.offset / 8) ? '–' + Math.floor((c.offset + c.bits - 1) / 8) : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  /* Which pixel group (shared-chroma block) a pixel belongs to. */
  function groupOf(f, x, y) {
    if (f.is_yuv && (f.hsub > 1 || f.vsub > 1)) {
      const nx = Math.ceil(st.gw / f.hsub);
      return Math.floor(y / f.vsub) * nx + Math.floor(x / f.hsub);
    }
    return y * st.gw + x;
  }
  const gcol = (g) => GROUP_COL[g % GROUP_COL.length];

  /* ------------------------------------------------------------------ */
  /* Real example images: sources, RGB→stored values, and decoding back  */
  /* ------------------------------------------------------------------ */
  const SOURCES = [
    ['sunset', 'Sunset scene (smooth colours)'],
    ['bars', 'Colour bars (7 bars, edges not on 2-pixel boundaries)'],
    ['gradient', 'Hue × brightness gradient'],
    ['detail', 'Fine detail: alternating red/blue columns (worst case for sub-sampling)'],
    ['upload', 'Your own image…'],
  ];
  let uploaded = null;          // HTMLImageElement chosen by the user (kept in memory only)
  let imgCache = { key: null, img: null };
  function drawScene(ctx, W, H) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, '#1d2b64'); sky.addColorStop(0.55, '#c8577a'); sky.addColorStop(1, '#f8a35b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.62);
    ctx.fillStyle = '#ffd56b'; ctx.beginPath(); ctx.arc(W * 0.68, H * 0.55, H * 0.17, 0, Math.PI * 2); ctx.fill();
    const sea = ctx.createLinearGradient(0, H * 0.62, 0, H);
    sea.addColorStop(0, '#2b4d7a'); sea.addColorStop(1, '#0b1730');
    ctx.fillStyle = sea; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.fillStyle = 'rgba(255,213,107,.55)';
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.6 + (i % 2) * W * 0.02, H * (0.66 + i * 0.05), W * (0.16 - i * 0.02), H * 0.02);
    ctx.fillStyle = '#122016'; ctx.beginPath(); ctx.moveTo(0, H * 0.62); ctx.lineTo(W * 0.18, H * 0.38); ctx.lineTo(W * 0.36, H * 0.62); ctx.fill();
  }
  function getImage(onReady) {
    const key = `${st.src}|${st.gw}x${st.gh}|${uploaded ? uploaded.src.length : 0}`;
    if (imgCache.key === key) return imgCache.img;
    const W = st.gw, H = st.gh, px = new Uint8ClampedArray(W * H * 4);
    const put = (x, y, r, g, b) => { const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
    const hsv = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5) * 255, f(3) * 255, f(1) * 255]; };
    if (st.src === 'bars') {
      const bars = [[235, 235, 235], [235, 235, 16], [16, 235, 235], [16, 235, 16], [235, 16, 235], [235, 16, 16], [16, 16, 235]];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, ...bars[Math.floor(x * 7 / W)]);
    } else if (st.src === 'gradient') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, ...hsv(360 * x / W, 1, 1 - 0.75 * y / Math.max(1, H - 1)));
    } else if (st.src === 'detail') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, ...(x % 2 ? [40, 70, 230] : [230, 40, 40]));
    } else if (st.src === 'upload' && uploaded) {
      // Whole image, no cropping: halve repeatedly for a clean downscale, then draw at W×H.
      try {
        let cur = uploaded, cw = uploaded.naturalWidth, ch = uploaded.naturalHeight;
        while (cw / 2 >= W * 2 && ch / 2 >= H * 2) {
          const c2 = document.createElement('canvas'); c2.width = Math.round(cw / 2); c2.height = Math.round(ch / 2);
          const x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(cur, 0, 0, c2.width, c2.height);
          cur = c2; cw = c2.width; ch = c2.height;
        }
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cur, 0, 0, W, H);
        px.set(ctx.getImageData(0, 0, W, H).data);
      } catch (e) { for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 128; px[i + 3] = 255; } }
    } else {
      try {
        const big = document.createElement('canvas'); big.width = 256; big.height = 128;
        const bctx = big.getContext('2d');
        drawScene(bctx, 256, 128);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(big, 0, 0, W, H);
        px.set(ctx.getImageData(0, 0, W, H).data);
      } catch (e) { for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 128; px[i + 3] = 255; } }
    }
    imgCache = { key, img: { w: W, h: H, px } };
    return imgCache.img;
  }
  // Fit the example grid to an image's aspect ratio and use its real size for the buffer.
  const MAX_GW = 48, MAX_GH = 32;
  function fitToImage(nw, nh) {
    const a = nw / nh;
    let gw = MAX_GW, gh = Math.max(1, Math.round(MAX_GW / a));
    if (gh > MAX_GH) { gh = MAX_GH; gw = Math.max(2, Math.round(MAX_GH * a)); }
    st.gw = Math.min(gw, nw); st.gh = Math.min(gh, nh);
    st.px = Math.min(st.px, st.gw - 1); st.py = Math.min(st.py, st.gh - 1);
    state.calc.w = nw; state.calc.h = nh;
    st.fitted = true;
    G.saveCalc(); save(); imgCache.key = null;
  }
  const rgbaAt = (img, x, y) => { const i = (Math.min(y, img.h - 1) * img.w + Math.min(x, img.w - 1)) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; };

  // Y'CbCr: standard equations (BT.601 / BT.709 / BT.2020) — NOT in this repo; the standard and
  // range are taken from gralloc's default dataspace for the format (format_info.cpp:393-443).
  const KR_KB = { BT601_625: [0.299, 0.114], BT709: [0.2126, 0.0722], BT2020: [0.2627, 0.0593] };
  function yccSpec(f) {
    const ds = E.dataspace(f, state.calc.w, state.calc.h);
    const kk = KR_KB[ds.standard] || KR_KB.BT709;
    return { ds, kr: kk[0], kb: kk[1], full: ds.range === 'FULL' };
  }
  function toYcc(spec, r, g, b) {
    const R = r / 255, Gg = g / 255, B = b / 255;
    const Y = spec.kr * R + (1 - spec.kr - spec.kb) * Gg + spec.kb * B;
    return [Y, (B - Y) / (2 * (1 - spec.kb)), (R - Y) / (2 * (1 - spec.kr))];
  }
  function quantY(spec, Y, n) { const m = (1 << n) - 1; return Math.max(0, Math.min(m, Math.round(spec.full ? Y * m : (16 + 219 * Y) * (1 << (n - 8))))); }
  function quantC(spec, C, n) { const m = (1 << n) - 1; return Math.max(0, Math.min(m, Math.round(spec.full ? C * m + (1 << (n - 1)) : (128 + 224 * C) * (1 << (n - 8))))); }
  function deqY(spec, v, n) { const m = (1 << n) - 1; return spec.full ? v / m : (v / (1 << (n - 8)) - 16) / 219; }
  function deqC(spec, v, n) { const m = (1 << n) - 1; return spec.full ? (v - (1 << (n - 1))) / m : (v / (1 << (n - 8)) - 128) / 224; }
  function fromYcc(spec, Y, Cb, Cr) {
    const R = Y + 2 * (1 - spec.kr) * Cr, B = Y + 2 * (1 - spec.kb) * Cb;
    const Gg = (Y - spec.kr * R - spec.kb * B) / (1 - spec.kr - spec.kb);
    return [R, Gg, B].map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
  }
  function toHalf(v) { // float → IEEE 754 binary16 bits
    const f32 = new Float32Array([v]), u = new Uint32Array(f32.buffer)[0];
    const s = (u >> 16) & 0x8000, e = ((u >> 23) & 0xff) - 127 + 15, m = u & 0x7fffff;
    if (e <= 0) return s | ((m | 0x800000) >> (1 - e + 13));
    if (e >= 31) return s | 0x7c00;
    return s | (e << 10) | Math.round(m / 8192);
  }
  function fromHalf(h) { const e = (h >> 10) & 31, m = h & 1023; const v = e === 0 ? m / 1024 * Math.pow(2, -14) : Math.pow(2, e - 15) * (1 + m / 1024); return h & 0x8000 ? -v : v; }
  const isFP16 = (f) => f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_16161616';

  /* Can this format be filled with example values from what the repo describes? */
  function encodable(f, ms) {
    if (!f.linear || f.is_sbwc || isS10B(f) || isTiledExynos(f) || isY0L2(f) || isRaw10or12(f)) return false;
    return ms.every((m) => m.comps.length && m.macroBits % 8 === 0 && m.macroBits <= 64);
  }

  /* Encode the example image into the format: per plane, rows of macro-pixels with
     component values and little-endian bytes; plus the decoded image. */
  function encode(f, ms, img) {
    if (!encodable(f, ms)) return null;
    const spec = f.is_yuv ? yccSpec(f) : null;
    const yccOf = (x, y) => { const [r, g, b] = rgbaAt(img, x, y); return toYcc(spec, r, g, b); };
    const avgC = (x0, x1, y0, y1) => { let cb = 0, cr = 0, n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = yccOf(x, y); cb += c[1]; cr += c[2]; n++; } return [cb / n, cr / n]; };
    const planes = ms.map((m) => {
      const planeW = Math.ceil(img.w / m.sub[0]), planeH = Math.ceil(img.h / m.sub[1]);
      const perRow = Math.ceil(planeW / m.ppm);
      const rows = [];
      for (let sy = 0; sy < planeH; sy++) {
        const row = [];
        for (let mi = 0; mi < perRow; mi++) {
          let x0, x1, y0, y1;
          if (m.p === 0) { x0 = mi * m.ppm; x1 = Math.min(img.w, x0 + m.ppm) - 1; y0 = y1 = sy; }
          else { x0 = mi * m.sub[0]; x1 = Math.min(img.w, x0 + m.sub[0]) - 1; y0 = sy * m.sub[1]; y1 = Math.min(img.h, y0 + m.sub[1]) - 1; }
          const chroma = f.is_yuv ? (m.p > 0 || m.ppm > 1 || (f.hsub === 1 && f.vsub === 1) ? avgC(x0, x1, y0, y1) : avgC(Math.floor(x0 / f.hsub) * f.hsub, Math.min(img.w - 1, Math.floor(x0 / f.hsub) * f.hsub + f.hsub - 1), Math.floor(y0 / f.vsub) * f.vsub, Math.min(img.h - 1, Math.floor(y0 / f.vsub) * f.vsub + f.vsub - 1))) : null;
          const vals = {};
          let sample = 0n;
          for (const c of m.comps) {
            const k = /\d$/.test(c.label) ? Number(c.label.match(/\d+$/)[0]) : 0;
            const px = rgbaAt(img, Math.min(x1, x0 + k), y0);
            let v;
            if (f.is_yuv) {
              if (c.type === 'Y') v = quantY(spec, toYcc(spec, px[0], px[1], px[2])[0], c.bits);
              else if (c.type === 'CB') v = quantC(spec, chroma[0], c.bits);
              else if (c.type === 'CR') v = quantC(spec, chroma[1], c.bits);
              else if (c.type === 'A') v = Math.round(px[3] / 255 * ((1 << c.bits) - 1));
            } else if (isFP16(f)) v = toHalf(px[{ R: 0, G: 1, B: 2, A: 3 }[c.type]] / 255);
            else v = Math.round(px[{ R: 0, G: 1, B: 2, A: 3 }[c.type]] / 255 * ((1 << c.bits) - 1));
            vals[c.label] = v || 0;
            sample |= BigInt(v || 0) << BigInt(c.offset);
          }
          const bytes = [];
          for (let B = 0; B < m.macroBits / 8; B++) bytes.push(Number((sample >> BigInt(B * 8)) & 0xffn));
          row.push({ x0, x1, y0, y1, vals, sample, bytes });
        }
        rows.push(row);
      }
      return { m, rows };
    });
    // Decode back to RGB, reading only the stored values.
    const out = new Uint8ClampedArray(img.w * img.h * 4);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const cellFor = (pl) => { const m = pl.m; const sx = Math.floor(x / m.sub[0]), sy = Math.floor(y / m.sub[1]); return pl.rows[sy][Math.floor(sx / m.ppm)]; };
      let rgb;
      if (f.is_yuv) {
        let Yv = null, Cb = null, Cr = null, nY = 8, nC = 8;
        planes.forEach((pl) => {
          const cell = cellFor(pl), m = pl.m;
          const k = m.ppm > 1 ? Math.floor(x / m.sub[0]) % m.ppm : 0;
          for (const c of m.comps) {
            if (c.type === 'Y' && (m.ppm === 1 || c.label === 'Y' || c.label === 'Y' + k)) { Yv = cell.vals[c.label]; nY = c.bits; }
            if (c.type === 'CB' && Cb === null) { Cb = cell.vals[c.label]; nC = c.bits; }
            if (c.type === 'CR' && Cr === null) { Cr = cell.vals[c.label]; nC = c.bits; }
          }
        });
        rgb = fromYcc(spec, Yv == null ? 0.5 : deqY(spec, Yv, nY), Cb == null ? 0 : deqC(spec, Cb, nC), Cr == null ? 0 : deqC(spec, Cr, nC));
      } else {
        const cell = cellFor(planes[0]); const ch = { R: 0, G: 0, B: 0 };
        for (const c of planes[0].m.comps) if (c.type in ch) ch[c.type] = isFP16(f) ? Math.round(fromHalf(cell.vals[c.label]) * 255) : Math.round(cell.vals[c.label] / ((1 << c.bits) - 1) * 255);
        rgb = [ch.R, ch.G, ch.B];
      }
      const i = (y * img.w + x) * 4; out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = 255;
    }
    return { spec, planes, decoded: out };
  }

  const hexv = (v, bits) => v.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
  const css = (r, g, b) => `rgb(${r},${g},${b})`;
  const ink = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#111' : '#fff');
  function cellColor(f, enc, pl, cell) {
    // Y-only cells: grey level of the luma value; chroma-only cells: colour at mid luma; otherwise pixel colour.
    const types = pl.m.comps.map((c) => c.type);
    if (f.is_yuv && types.every((t) => t === 'Y')) { const c = pl.m.comps[0]; const g = Math.round(Math.max(0, Math.min(1, deqY(enc.spec, cell.vals[c.label], c.bits))) * 255); return [g, g, g]; }
    if (f.is_yuv && !types.includes('Y')) {
      const cb = pl.m.comps.find((c) => c.type === 'CB'), cr = pl.m.comps.find((c) => c.type === 'CR');
      return fromYcc(enc.spec, 0.5, cb ? deqC(enc.spec, cell.vals[cb.label], cb.bits) : 0, cr ? deqC(enc.spec, cell.vals[cr.label], cr.bits) : 0);
    }
    const i = (cell.y0 * st.gw + cell.x0) * 4; return [enc.decoded[i], enc.decoded[i + 1], enc.decoded[i + 2]];
  }

  /* Stored samples in memory order (rows shown on the page only), for the memory-order scan. */
  const MEM_ROWS = 8;
  function memCells(f, ms) {
    if (isTiledExynos(f) || isS10B(f) || !f.linear || f.is_sbwc) return [];
    const out = [];
    ms.forEach((m) => {
      const planeW = Math.ceil(st.gw / m.sub[0]), planeH = Math.min(MEM_ROWS, Math.ceil(st.gh / m.sub[1]));
      const perRow = Math.ceil(planeW / m.ppm);
      for (let sy = 0; sy < planeH; sy++) for (let mi = 0; mi < perRow; mi++) {
        let x0, x1, y0, y1;
        if (m.p === 0) { x0 = mi * m.ppm; x1 = Math.min(st.gw, x0 + m.ppm) - 1; y0 = y1 = sy; }
        else { x0 = mi * m.sub[0]; x1 = Math.min(st.gw, x0 + m.sub[0]) - 1; y0 = sy * m.sub[1]; y1 = Math.min(st.gh, y0 + m.sub[1]) - 1; }
        out.push({ p: m.p, sy, mi, x0, x1, y0, y1, off: mi * m.macroBits / 8, labels: m.comps.map((c) => c.label) });
      }
    });
    return out;
  }
  function memCellFor(f, ms) {
    if (st.scanMode !== 'memory') return null;
    const cells = memCells(f, ms);
    if (!cells.length) return null;
    const k = st.memk % cells.length;
    return Object.assign({ k, n: cells.length }, cells[k]);
  }
  G.storageMemFirst = null;

  function imageGrid(f, data, title, outline, mc) {
    const cell = Math.max(10, Math.min(30, Math.floor(480 / st.gw)));
    let s = `<svg viewBox="0 0 ${st.gw * cell + 2} ${st.gh * cell + 2}" width="100%" style="max-width:${st.gw * cell + 2}px;display:block">`;
    for (let y = 0; y < st.gh; y++) for (let x = 0; x < st.gw; x++) {
      const i = (y * st.gw + x) * 4;
      s += `<rect style="--i:${y * st.gw + x}" x="${x * cell + 1}" y="${y * cell + 1}" width="${cell}" height="${cell}" fill="${css(data[i], data[i + 1], data[i + 2])}"><title>(${x},${y}) RGB ${data[i]},${data[i + 1]},${data[i + 2]}</title></rect>`;
    }
    if (outline && f.is_yuv && (f.hsub > 1 || f.vsub > 1)) {
      for (let y = 0; y < st.gh; y += f.vsub) for (let x = 0; x < st.gw; x += f.hsub)
        s += `<rect x="${x * cell + 1.5}" y="${y * cell + 1.5}" width="${Math.min(f.hsub, st.gw - x) * cell - 1}" height="${Math.min(f.vsub, st.gh - y) * cell - 1}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1"/>`;
    }
    if (mc) s += `<rect x="${mc.x0 * cell + 1}" y="${mc.y0 * cell + 1}" width="${(mc.x1 - mc.x0 + 1) * cell}" height="${(mc.y1 - mc.y0 + 1) * cell}" fill="none" stroke="var(--cr)" stroke-width="3" class="probe-mark"/>`;
    else s += `<rect x="${st.px * cell + 1}" y="${st.py * cell + 1}" width="${cell}" height="${cell}" fill="none" stroke="var(--accent)" stroke-width="3" class="probe-mark"/>`;
    return `<div><div class="small"><b>${title}</b></div>${s}</svg></div>`;
  }

  function pixelGrid(f) {
    const cell = 34;
    let s = `<svg viewBox="0 0 ${st.gw * cell + 2} ${st.gh * cell + 2}" width="100%" style="max-width:${st.gw * cell + 2}px">`;
    for (let y = 0; y < st.gh; y++) for (let x = 0; x < st.gw; x++) {
      const probe = x === st.px && y === st.py;
      s += `<rect x="${x * cell + 1}" y="${y * cell + 1}" width="${cell}" height="${cell}" fill="${gcol(groupOf(f, x, y))}" stroke="${probe ? 'var(--accent)' : '#999'}" stroke-width="${probe ? 3 : 0.5}"/><text x="${x * cell + cell / 2 + 1}" y="${y * cell + cell / 2 + 5}" font-size="10" text-anchor="middle" fill="#333">${x},${y}</text>`;
    }
    return s + '</svg>';
  }

  /* Rows of one plane in memory order, each macro-pixel coloured by the pixels it covers. */
  function planeRows(f, m, layoutPlane, enc, mc) {
    if (isTiledExynos(f) || isS10B(f) || !f.linear || f.is_sbwc) return '';
    const pl = enc ? enc.planes[m.p] : null;
    const MAXROWS = 8;
    const planeW = Math.ceil(st.gw / m.sub[0]), planeH = Math.ceil(st.gh / m.sub[1]);
    const perRow = Math.ceil(planeW / m.ppm);
    const bytesPer = m.macroBits / 8;
    const unknownMap = isY0L2(f) || isRaw10or12(f);
    let html = '';
    for (let sy = 0; sy < Math.min(planeH, MAXROWS); sy++) {
      html += `<div style="display:flex;align-items:stretch;margin:2px 0"><span class="small muted mono" style="width:54px;flex:none">row ${sy}</span>`;
      for (let mi = 0; mi < perRow; mi++) {
        let x0, x1, y0, y1;
        if (m.p === 0) { x0 = mi * m.ppm; x1 = Math.min(st.gw, x0 + m.ppm) - 1; y0 = y1 = sy; }
        else { x0 = mi * m.sub[0]; x1 = Math.min(st.gw, x0 + m.sub[0]) - 1; y0 = sy * m.sub[1]; y1 = Math.min(st.gh, y0 + m.sub[1]) - 1; }
        const rng = (a, b, n) => (a === b ? `${n}${a}` : `${n}${a}–${b}`);
        const covers = m.p === 0 ? rng(x0, x1, 'x') : `${rng(x0, x1, 'x')}, ${rng(y0, y1, 'y')}`;
        const hasProbe = mc ? (mc.p === m.p && mc.sy === sy && mc.mi === mi) : (st.px >= x0 && st.px <= x1 && st.py >= y0 && st.py <= y1);
        const label = m.comps.length ? m.comps.map((c) => c.label).join(' ') : isRaw10or12(f) ? 'RAW' : `${m.sampleBits}b`;
        if (pl) {
          const cell = pl.rows[sy][mi], col = cellColor(f, enc, pl, cell);
          const vals = m.comps.map((c) => `${c.label}&nbsp;${hexv(cell.vals[c.label], c.bits)}`).join(' ');
          html += `<span title="${esc(label)} — covers pixels ${covers}; stored bytes ${cell.bytes.map((b) => hexv(b, 8)).join(' ')} at row offset ${fmt(mi * bytesPer)}" style="flex:none;min-width:${Math.max(44, bytesPer * 16)}px;border:${hasProbe ? '3px solid var(--accent)' : '1px solid rgba(0,0,0,.25)'};background:${css(...col)};color:${ink(...col)};font-size:10px;padding:2px 3px;line-height:1.25" class="${hasProbe ? 'probe-cell' : ''}"><span class="mono">${vals}</span><br><span class="mono" style="opacity:.8">[${cell.bytes.map((b) => hexv(b, 8)).join(' ')}]</span><br><span style="opacity:.7">+${fmt(mi * bytesPer)}</span></span>`;
          continue;
        }
        html += `<span title="${esc(label)} — ${bytesPer} bytes at row offset ${fmt(mi * bytesPer)}; covers pixels ${covers}" style="flex:none;min-width:${Math.max(40, bytesPer * 13)}px;border:${hasProbe ? '2px solid var(--accent)' : '1px solid #999'};background:${unknownMap ? '#ddd' : gcol(groupOf(f, x0, y0))};color:#222;font-size:10px;padding:2px 3px;line-height:1.2"><b>${esc(label)}</b><br><span>${unknownMap ? '?' : covers}</span><br><span style="opacity:.7">+${fmt(mi * bytesPer)}</span></span>`;
      }
      if (layoutPlane) {
        const used = perRow * bytesPer;
        html += `<span class="small muted" style="padding:4px 6px;border:1px dashed var(--line);flex:none">… to byte_stride ${fmt(layoutPlane.byte_stride)}</span>`;
        void used;
      }
      html += '</div>';
    }
    if (planeH > MAXROWS) html += `<div class="small muted">… ${planeH - MAXROWS} more row(s) of this plane not shown</div>`;
    return `<div style="overflow-x:auto">${pl ? '<div class="small muted">Each cell = one stored sample: <span class="mono">component&nbsp;value</span> (hex), then its bytes in memory order <span class="mono">[byte0 byte1 …]</span>, then the byte offset in the row. Cell colour: luma-only samples as grey level, chroma-only samples as their colour at mid brightness, otherwise the decoded pixel colour.</div>' : ''}${html}</div>`;
  }

  /* AFBC storage summary for this format (if AFBC-capable). */
  function afbcBox(f) {
    if (!f.afbc) return '';
    const rows = [['16×16 (basic)', 16, 16], ['32×8 (wide)', 32, 8], ['64×4 (extra-wide)', 64, 4]].map(([n, w, h]) =>
      `<tr><td>${n}</td>${Array.from({ length: f.npln }, (_, p) => `<td>${G.E.ALIGN(Math.floor(f.bpp_afbc[p] * w * h / 8), 128)} B</td>`).join('')}</tr>`).join('');
    return `<details><summary class="small">If allocated with AFBC (<code>.afbc = true</code>)</summary>
      <p class="small">The plane is split into superblocks; each has a 16-byte header entry (${src(L(P.ALLOC, 72))}) and a body slot of <code>ALIGN(bpp_afbc × pixels / 8, 128)</code> bytes (${src(L(P.ALLOC, 736))}) — the space reserved, not the compressed size. <code>bpp_afbc = ${f.bpp_afbc.slice(0, f.npln).join('/')}</code>. The compressed encoding inside the body is not in this repo.</p>
      <table class="small"><thead><tr><th>superblock</th>${Array.from({ length: f.npln }, (_, p) => `<th>plane ${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`;
  }

  /* Address probe on a CPU-lockable allocation of state.calc w×h. */
  let pr_enc = null;
  function probe(f, ms) {
    const usage = U.GRALLOC_USAGE_SW_READ_OFTEN | U.GRALLOC_USAGE_SW_WRITE_OFTEN;
    const r = E.allocate({ width: state.calc.w, height: state.calc.h, layer_count: 1, hal_format: f.value, usage }, state.flags);
    const head = `<div class="small muted">Allocation: ${state.calc.w}×${state.calc.h}, usage SW_READ_OFTEN|SW_WRITE_OFTEN (CPU-lockable). Byte address = <code>offsetInBytes + row × strideInBytes + sample position</code>, the values the mapper reports (${src(L(P.MMD, 377, 379))}).</div>`;
    if (!r.ok) return { html: head + `<div class="err small">This format cannot be allocated for CPU access: ${esc(r.error)}</div>`, r };
    if (r.format.value !== f.value) return { html: head + `<div class="note small">Request was mapped to ${esc(shortName(r.format.name))}.</div>`, r };
    const fitted = st.src === 'upload' && uploaded && st.fitted && state.calc.w === uploaded.naturalWidth && state.calc.h === uploaded.naturalHeight;
    const bx = fitted ? Math.floor((st.px + 0.5) * state.calc.w / st.gw) : st.px, by = fitted ? Math.floor((st.py + 0.5) * state.calc.h / st.gh) : st.py;
    const mapNote = fitted ? `<div class="small">Grid pixel (${st.px},${st.py}) is the centre of buffer pixel <b>(${fmt(bx)}, ${fmt(by)})</b> — the grid is your ${fmt(state.calc.w)}×${fmt(state.calc.h)} image scaled to ${st.gw}×${st.gh}; stored values shown are for the scaled grid pixel.</div>` : '';
    if (bx >= state.calc.w || by >= state.calc.h) return { html: head + '<div class="note small">Probe pixel is outside the allocation.</div>', r };
    if (r.unknown || isTiledExynos(f) || isS10B(f)) return { html: head + `<div class="note small">Address not derivable from this repo for this format (see notes above). Plane offsets/strides from the allocator: ${r.planes.map((p, i) => `plane ${i}: offset ${fmt(p.offset)}, stride ${p.byte_stride ? fmt(p.byte_stride) : '?'}`).join('; ')}</div>`, r };
    const rows = ms.map((m) => {
      const lp = r.planes[m.p];
      if (!lp) return '';
      const sx = Math.floor(bx / m.sub[0]), sy = Math.floor(by / m.sub[1]);
      const gsx = Math.floor(st.px / m.sub[0]), gsy = Math.floor(st.py / m.sub[1]);
      if (isRaw10or12(f)) {
        return `<tr><td>${m.p}</td><td colspan="4">row ${sy} starts at byte ${fmt(lp.offset + sy * lp.byte_stride)} (stride ${fmt(lp.byte_stride)}); the pixel's bit position (${sx}×${m.sampleBits} = ${fmt(sx * m.sampleBits)} bits into the row) is only meaningful if samples are packed contiguously — <b>packing not confirmed in source</b></td></tr>`;
      }
      const mi = Math.floor(sx / m.ppm), bytes = m.macroBits / 8;
      const addr = lp.offset + sy * lp.byte_stride + mi * bytes;
      let mine = m.comps.map((c) => c.label);
      if (m.p === 0 && m.ppm > 1 && !isY0L2(f)) {
        const k = sx % m.ppm;
        mine = m.comps.filter((c) => !/\d$/.test(c.label) || c.label.endsWith(String(k))).map((c) => c.label);
      }
      const gmi = Math.floor(gsx / m.ppm);
      const pc = pr_enc && pr_enc.planes[m.p] && pr_enc.planes[m.p].rows[gsy] && pr_enc.planes[m.p].rows[gsy][gmi];
      const stored = pc ? `<td class="mono small">${m.comps.map((c) => `${c.label}=${hexv(pc.vals[c.label], c.bits)}`).join(' ')}<br>bytes ${pc.bytes.map((b) => hexv(b, 8)).join(' ')}</td>` : '<td class="small muted">—</td>';
      return `<tr><td>${m.p}</td><td class="mono">fd ${lp.fd_idx || 0}: ${fmt(lp.offset)} + ${sy}×${fmt(lp.byte_stride)} + ${mi}×${bytes}</td><td class="mono"><b>${fmt(addr)}</b> (${bytes} B)</td>${stored}<td class="small">${esc(mine.join(', ') || '—')}${m.p === 0 && m.ppm > 1 ? ` <span class="muted">(${m.ppm}-pixel macro; ${isY0L2(f) ? 'pixel↔Y mapping unknown' : 'Y index = x mod ' + m.ppm + ', assumed'})</span>` : ''}</td></tr>`;
    }).join('');
    return { html: head + mapNote + `<div class="tablewrap"><table class="small"><thead><tr><th>plane</th><th>offset + row×stride + macro×bytes</th><th>byte address</th><th>stored value (example image)</th><th>this pixel's components</th></tr></thead><tbody>${rows}</tbody></table></div>`, r };
  }


  function examplePanel(f) {
    const ms = models(f), img = getImage(), enc = encode(f, ms, img);
    const head = `<b class="small">Example image ${st.gw}×${st.gh} — ${esc((SOURCES.find((x) => x[0] === st.src) || SOURCES[0])[1])}</b>`;
    if (!enc) {
      return `<div class="panel">${head}<div class="row" style="align-items:flex-start;margin-top:4px">${imageGrid(f, img.px, 'source pixels', true, memCellFor(f, ms))}<div style="flex:1;min-width:160px">${pixelGrid(f)}</div></div>
        <div class="small muted">Stored values cannot be shown for this format: the repo does not describe how its samples encode pixel values (see the notes below). The right grid shows which pixels ${f.is_yuv && (f.hsub > 1 || f.vsub > 1) ? 'share a chroma sample' : 'map to separate samples'}.</div></div>`;
    }
    const sp = enc.spec;
    const conv = f.is_yuv
      ? `RGB → Y′CbCr with the standard ${sp.ds.standard.replace('_625', '')} equations, ${sp.ds.range.toLowerCase()} range — the standard and range gralloc assigns as this buffer's default dataspace at ${state.calc.w}×${state.calc.h} (${src(sp.ds.cite)}; equations themselves are not in this repo). Chroma = average of the pixels that share it. Conversion is done by producers (GPU, camera, codec), not by gralloc.`
      : isFP16(f) ? 'Each 0–255 channel is stored as a 16-bit float in 0.0–1.0.' : 'Each 0–255 channel is scaled to the component\'s bit width (e.g. 5 or 6 bits for RGB 565, 10 bits for 1010102).';
    return `<div class="panel">${head}
      <div class="row" style="align-items:flex-start;margin-top:4px;gap:12px">${imageGrid(f, img.px, 'original (what was written)', true, memCellFor(f, ms))}${imageGrid(f, enc.decoded, 'decoded back from the stored values', false, memCellFor(f, ms))}</div>
      <div class="small muted" style="margin-top:4px">${conv}${f.is_yuv && (f.hsub > 1 || f.vsub > 1) ? ` White outlines = pixels sharing one Cb/Cr pair (${f.hsub}×${f.vsub}); colour edges inside a box bleed in the decoded image.` : ''}</div></div>`;
  }

  function formatColumn(f) {
    const ms = models(f);
    const img = getImage();
    const enc = encode(f, ms, img);
    pr_enc = enc;
    const pr = probe(f, ms);
    const mc = memCellFor(f, ms);
    const memCap = mc ? `<div class="memcap anim-in"><b>Memory step ${mc.k + 1} of ${mc.n}</b>: plane ${mc.p}, row ${mc.sy}, byte +${fmt(mc.off)} in the row holds <span class="mono">${esc(mc.labels.join(' ') || 'sample')}</span> for pixels x ${mc.x0}${mc.x1 > mc.x0 ? '–' + mc.x1 : ''}, y ${mc.y0}${mc.y1 > mc.y0 ? '–' + mc.y1 : ''}.</div>` : (st.scanMode === 'memory' ? '<div class="small muted">Memory-order scan is not available for this format (its sample layout is not described in this repo).</div>' : '');
    const cv = caveats(f, ms);
    const c = f.enum_comments || {};
    const desc = [c.group && `"${esc(c.group.text)}" ${src(c.group.loc)}`, c.trailing && `trailing comment "${esc(c.trailing)}" ${src(f.defined_at)}`].filter(Boolean).join('<br>');
    return `<div class="panel">
      <h3 style="margin-top:0"><a class="mono" href="#/format/${encodeURIComponent(f.name)}">${esc(shortName(f.name))}</a></h3>
      <div class="kv small">
        <div>value</div><div class="mono">${f.value_hex}</div>
        <div>planes</div><div>${f.npln} ${src(f.row)}</div>
        <div>sample size</div><div>${ms.map((m) => `${m.sampleBits} bits`).join(' / ')} <span class="muted">(${f.linear ? 'bpp' : 'bpp_afbc'}; mapper reports this as sampleIncrementInBits ${src(L(P.MMD, f.is_exynos_format ? 309 : (f.linear ? 364 : 360)))})</span></div>
        <div>sub-sampling</div><div>${f.is_yuv ? `${f.hsub}×${f.vsub} on planes &gt; 0 ${src(L(P.MMD, 383, 384))}` : 'none'}</div>
        <div>bits per sample</div><div>${f.bps} (bps)</div>
        <div>DRM fourcc</div><div class="mono">${f.drm_fourcc ? esc(f.drm_fourcc.fourcc) + ' ' + src(f.drm_fourcc.loc) : 'none'}</div>
        ${desc ? `<div>comment in source</div><div>${desc}</div>` : ''}
      </div>
      ${G.describe ? G.describe(f, true) : ''}
      ${G.formatMeaning ? G.formatMeaning(f, true) : ''}
      ${cv.map(([k, t]) => `<div class="${k} small">${t}</div>`).join('')}
      ${memCap}
      ${ms.map((m) => `<h3>Plane ${m.p}${m.p > 0 ? ` <span class="small muted">(1 sample per ${m.sub[0]}×${m.sub[1]} pixels)</span>` : ''}</h3>
        ${m.comps.length ? `<div class="small" style="overflow-wrap:anywhere">One ${m.ppm > 1 ? `${m.macroBits}-bit block (${m.ppm} samples of ${m.sampleBits} bits — components span ${m.macroBits} bits)` : `${m.macroBits}-bit sample`}, components from ${src(f.components.loc)}:</div>${(() => { const cell = enc && enc.planes[m.p].rows[Math.floor(st.py / m.sub[1])] && enc.planes[m.p].rows[Math.floor(st.py / m.sub[1])][Math.floor(Math.floor(st.px / m.sub[0]) / m.ppm)]; return (cell ? `<div class="small muted">bit values below = the sample holding probe pixel (${st.px},${st.py}) of the example image</div>` : '') + bitDiagram(m, cell ? cell.sample : null); })()}${compTable(m)}` : ''}
        ${planeRows(f, m, pr.r && pr.r.ok && pr.r.format.value === f.value ? pr.r.planes[m.p] : null, enc, mc)}`).join('')}
      ${afbcBox(f)}
      <h3>Pixel → byte address (pixel ${st.px},${st.py})</h3>${pr.html}
    </div>`;
  }

  G.views.storage = (params) => {
    const sel = (params.get('f') || '').split(',').filter((n) => byName.has(n)).slice(0, 3);
    if (!sel.length) sel.push('MALI_GRALLOC_FORMAT_INTERNAL_NV12');
    if (st.scanMode === 'memory') { const f0 = byName.get(sel[0]); const m0 = memCellFor(f0, models(f0)); if (m0) { st.px = m0.x0; st.py = m0.y0; } }
    const opts = (cur) => FD.formats.map((f) => `<option value="${esc(f.name)}" ${f.name === cur ? 'selected' : ''}>${esc(shortName(f.name))}</option>`).join('');
    const slots = [0, 1, 2].map((i) => `<select data-sslot="${i}" aria-label="Format ${i + 1}"><option value="">${i === 0 ? '—' : '(compare with…)'}</option>${opts(sel[i])}</select>`).join(' ');
    const quick = [['NV12 vs NV21 vs YV12', 'MALI_GRALLOC_FORMAT_INTERNAL_NV12,MALI_GRALLOC_FORMAT_INTERNAL_NV21,MALI_GRALLOC_FORMAT_INTERNAL_YV12'],
      ['RGBA vs BGRA vs RGBX', 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888,MALI_GRALLOC_FORMAT_INTERNAL_BGRA_8888,MALI_GRALLOC_FORMAT_INTERNAL_RGBX_8888'],
      ['8-bit vs 10-bit 4:2:0', 'MALI_GRALLOC_FORMAT_INTERNAL_NV12,MALI_GRALLOC_FORMAT_INTERNAL_P010,HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN_S10B'],
      ['4:2:2 packed vs semi-planar', 'MALI_GRALLOC_FORMAT_INTERNAL_YUV422_8BIT,MALI_GRALLOC_FORMAT_INTERNAL_NV16,MALI_GRALLOC_FORMAT_INTERNAL_Y210'],
      ['RGB 565 / 1010102 / FP16', 'MALI_GRALLOC_FORMAT_INTERNAL_RGB_565,MALI_GRALLOC_FORMAT_INTERNAL_RGBA_1010102,MALI_GRALLOC_FORMAT_INTERNAL_RGBA_16161616'],
      ['NV12 vs Exynos SPN vs SBWC', 'MALI_GRALLOC_FORMAT_INTERNAL_NV12,HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN,HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN_SBWC'],
      ['RAW10 / RAW12 / RAW16', 'MALI_GRALLOC_FORMAT_INTERNAL_RAW10,MALI_GRALLOC_FORMAT_INTERNAL_RAW12,MALI_GRALLOC_FORMAT_INTERNAL_RAW16']];
    const num = (k, min, max, label) => `<label>${label} <input type="number" min="${min}" max="${max}" data-st="${k}" value="${st[k]}" style="width:64px"></label>`;
    return `<h1>Pixel storage</h1>
      <p>How each format puts pixel data into memory: the bits of one sample, which pixels share a chroma sample, the order of samples in each plane's rows, and the byte address of a chosen pixel. Pick up to three formats to compare them side by side.</p>
      <div class="panel"><div class="row">${slots}</div>
        <div class="row small" style="margin-top:6px"><span class="muted">Quick comparisons:</span> ${quick.map(([t, v]) => `<a href="#/storage?f=${v}">${t}</a>`).join(' · ')}</div></div>
      <div class="panel row"><label>Example image <select id="ssrc">${SOURCES.map(([k, t]) => `<option value="${k}" ${st.src === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <input type="file" id="sfile" aria-label="Upload an image" accept="image/*" style="display:${st.src === 'upload' ? 'inline' : 'none'}">
        ${st.src === 'upload' && uploaded ? `<span class="small">your image is ${fmt(uploaded.naturalWidth)} × ${fmt(uploaded.naturalHeight)} px</span>
          <button id="sfit" title="Set the example grid to this image's aspect ratio and the buffer to its real size">Use image size</button>` : ''}
        ${num('gw', 2, MAX_GW, 'grid')} × ${num('gh', 1, MAX_GH, '')} <span class="muted">|</span> ${num('px', 0, 99999, 'Probe pixel x')} ${num('py', 0, 99999, 'y')}
        <label class="small">Scan order <select id="sorder"><option value="raster" ${st.scanMode !== 'memory' ? 'selected' : ''}>pixels (left to right, top to bottom)</option><option value="memory" ${st.scanMode === 'memory' ? 'selected' : ''}>memory (how the bytes are stored)</option></select></label>
        <span class="small muted">Addresses use a ${fmt(state.calc.w)}×${fmt(state.calc.h)} buffer${st.src === 'upload' && uploaded && st.fitted ? ' (your image’s size)' : ' (the layout-calculator size; change it on any format page)'}.</span></div>
      <div class="info small">How to read this: a small real image is written into each format. For every plane you see the stored samples in memory order with their actual values and bytes, and the bits of the sample that holds the probe pixel (blue outline). <b>byte n</b> holds sample bits 8n…8n+7, assuming the sample is stored little-endian (PlaneLayoutComponent offset semantics are defined by AOSP, not in this repo). “Decoded back” rebuilds the picture from the stored values only — compare it with the original to see what sub-sampling or low bit depth loses.</div>
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(${sel.length > 1 ? 360 : 600}px,100%),1fr))">${sel.map((n) => `<div>${examplePanel(byName.get(n))}${formatColumn(byName.get(n))}</div>`).join('')}</div>`;
  };
  let revealed = null;
  G.AFTER.storage = () => {
    if (imgCache.key && imgCache.key !== revealed) { document.querySelectorAll('main .panel svg').forEach((sv) => { if (sv.querySelector('rect[style*="--i"]')) sv.classList.add('reveal'); }); revealed = imgCache.key; }
    const sel = document.getElementById('ssrc');
    if (sel) sel.addEventListener('change', () => { st.src = sel.value; save(); if (st.src !== 'upload' || uploaded) G.render(); else G.render(); });
    const so = document.getElementById('sorder');
    if (so) so.addEventListener('change', () => { st.scanMode = so.value; st.memk = 0; save(); G.render(); });
    const fit = document.getElementById('sfit');
    if (fit) fit.addEventListener('click', () => { fitToImage(uploaded.naturalWidth, uploaded.naturalHeight); G.render(); });
    const fi = document.getElementById('sfile');
    if (fi) fi.addEventListener('change', () => {
      const file = fi.files && fi.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => { const im = new Image(); im.onload = () => { uploaded = im; fitToImage(im.naturalWidth, im.naturalHeight); G.render(); }; im.src = rd.result; };
      rd.readAsDataURL(file);
    });
    const slots = [...document.querySelectorAll('select[data-sslot]')];
    slots.forEach((s) => s.addEventListener('change', () => {
      const v = slots.map((x) => x.value).filter(Boolean);
      location.hash = '#/storage?f=' + v.map(encodeURIComponent).join(',');
    }));
    document.querySelectorAll('input[data-st]').forEach((i) => i.addEventListener('change', () => {
      const lim = { gw: [2, MAX_GW], gh: [1, MAX_GH], px: [0, 1e6], py: [0, 1e6] }[i.dataset.st];
      st[i.dataset.st] = Math.min(lim[1], Math.max(lim[0], Math.floor(Number(i.value) || 0)));
      if (i.dataset.st === 'gw' || i.dataset.st === 'gh') st.fitted = false;
      save(); G.render();
    }));
  };
})();
