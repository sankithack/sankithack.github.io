/*
 * arm-engine.js — JavaScript port of the Arm Mali gralloc r56p0 size path.
 *
 * gralloc glue:   android/src/core/buffer_allocation.cpp  mali_gralloc_derive_format_and_size (422-521)
 * size math:      libformat/src/mali_calc.cpp             mali_libformat_get_layout (683-885),
 *                                                          mali_libformat_compute_allocation (887-982)
 * per-fourcc data libformat/src/mali_fourcc.cpp (read from GRALLOC_ARM.fourcc_table)
 *
 * Format *selection* (formats.cpp select_best_format) depends on the IP capabilities a device ships as
 * XML in /vendor/etc/gralloc, which are not in the archive. The calculator therefore models the
 * "forced format" request (formats.cpp:1185 select_forced_format): the caller names the base format and
 * the compression modifiers, gralloc validates them and computes the layout.
 *
 * All arithmetic is unsigned integer arithmetic as in the C++ (divisions truncate).
 */
(function () {
  'use strict';
  let A = null;
  const loc = (file, line, end) => ({ file, line, end, repo: 'arm' });
  const F = {
    BA: 'android/src/core/buffer_allocation.cpp', FM: 'android/src/core/formats.cpp', DRM: 'android/src/core/drm_utils.cpp',
    FI: 'android/src/core/format_info.cpp', FIH: 'android/src/core/format_info.h', FH: 'android/src/include/gralloc/formats.h',
    USG: 'android/src/usages.h', LF: 'libformat/src/mali_calc.cpp', LFF: 'libformat/src/mali_fourcc.cpp',
    MDF: 'thirdparty/include/mali_drm_fourcc.h', HEAP: 'android/src/allocator/dma_buf_heaps/dma_buf_heaps.cpp',
    ACC: 'android/src/core/buffer_access.cpp', IA: 'android/src/core/internal_format.h',
  };

  /* ---- internal format modifier bits (include/gralloc/formats.h:139-254) ---- */
  const EXT = (n) => 1 << (16 + n);
  const IF = {
    AFBC_BASIC: EXT(0), AFRC_BASIC: EXT(1), BLOCK_LINEAR_BASIC: EXT(2),
    AFBC_SPLITBLK: EXT(3), AFBC_WIDEBLK: EXT(4), AFBC_TILED_HEADERS: EXT(5), AFBC_EXTRAWIDEBLK: EXT(6),
    AFBC_DOUBLE_BODY: EXT(7), AFBC_BCH: EXT(8), AFBC_YUV_TRANSFORM: EXT(9), AFBC_SPARSE: EXT(10), AFBC_USM: EXT(11),
    AFRC_ROT_LAYOUT: EXT(3),
  };
  const CU_INTERNAL = { 16: 0, 24: 1, 32: 2 };              // MALI_GRALLOC_INTFMT_AFRC_CODING_UNIT_BYTES_* (formats.h)
  const RGBA_CU_SHIFT = 16 + 4, CHROMA_CU_SHIFT = 16 + 6;

  /* ---- DRM modifier constants (thirdparty/include/mali_drm_fourcc.h:95-217) ---- */
  const M = {
    BLOCK_16x16: 0x1n, BLOCK_32x8: 0x2n, BLOCK_64x4: 0x3n, BLOCK_32x8_64x4: 0x4n, BLOCK_MASK: 0xfn,
    YTR: 1n << 4n, SPLIT: 1n << 5n, SPARSE: 1n << 6n, CBR: 1n << 7n, TILED: 1n << 8n, SC: 1n << 9n, DB: 1n << 10n, BCH: 1n << 11n, USM: 1n << 12n,
    AFRC_LAYOUT_SCAN: 1n << 8n, CU_16: 1n, CU_24: 2n, CU_32: 3n,
  };
  const VENDOR_ARM = 0x08n, TYPE_AFBC = 0n, TYPE_AFRC = 2n;
  const fourccModCode = (vendor, val) => (vendor << 56n) | (val & 0x00ffffffffffffffn);
  const armCode = (type, val) => fourccModCode(VENDOR_ARM, (type << 52n) | (val & 0x000fffffffffffffn));
  const MOD_GENERIC_16_16_TILE = (0x04n << 56n) | 2n;

  /* ---- Arm private usages (android/src/usages.h:45-90), GRALLOC_USAGE_PRIVATE_n bit positions from :45-61 ---- */
  const PRIVATE = [
    ['MALI_GRALLOC_USAGE_FRONTBUFFER', 28, 65], ['MALI_GRALLOC_USAGE_NO_AFBC', 29, 69], ['MALI_GRALLOC_USAGE_FORCE_BACKBUFFER', 54, 67],
    ['MALI_GRALLOC_USAGE_AFBC_PADDING', 53, 71], ['MALI_GRALLOC_USAGE_YUV_COLOR_SPACE_BT601', 49, 75], ['MALI_GRALLOC_USAGE_YUV_COLOR_SPACE_BT709', 48, 76],
    ['MALI_GRALLOC_USAGE_RANGE_NARROW', 51, 81], ['MALI_GRALLOC_USAGE_RANGE_WIDE', 50, 82],
    ['MALI_GRALLOC_USAGE_CHROMA_SITING_CENTER', 59, 85], ['MALI_GRALLOC_USAGE_CHROMA_SITING_COSITED', 58, 86], ['MALI_GRALLOC_USAGE_CHROMA_SITING_CENTER_X', 57, 87],
  ].map(([name, bit, line]) => ({ name, bit, value: 1n << BigInt(bit), value_hex: '0x' + (1n << BigInt(bit)).toString(16), loc: { file: 'android/src/usages.h', line, repo: 'arm' } }));

  /* ---- usage helpers ---- */
  let U = {};
  const big = (s) => BigInt(s);

  function init(data) {
    A = data;
    U = {};
    for (const f of A.usages.flags) if (f.value != null) U[f.name] = big(f.value);
    for (const [k, g] of Object.entries(A.usages.groups)) U[k] = big(g.value);
    for (const p of PRIVATE) U[p.name] = p.value;
    U.PRIVATE_MASK = U.PRIVATE_MASK || 0xffff0000f0000000n;
  }

  const byName = (n) => A.formats.find((f) => f.name === n);
  function drmFourccName(fname, isAfbc) {
    // drm_fourcc_from_handle: gralloc's table first (drm_utils.cpp:65-84), then the local fallback (buffer_allocation.cpp:371-394)
    const t = A.drm_table[fname];
    if (t) {
      if (isAfbc && fname === 'MALI_GRALLOC_FORMAT_INTERNAL_RGB_565') return { fourcc: 'DRM_FORMAT_BGR565', cite: loc(F.DRM, 77, 81), note: 'RGB565 + AFBC is reported as BGR565' };
      return { fourcc: t.fourcc, cite: t.loc };
    }
    const fb = A.drm_fallback[fname];
    if (fb) return { fourcc: fb.fourcc, cite: fb.loc, note: 'no entry in the DRM table; local fallback mapping' };
    return null;
  }

  /* ---- libformat helpers (mali_calc.cpp) ---- */
  const align = (x, to) => Math.floor((x + to - 1) / to) * to;                 // mali_calc.cpp:53-56
  const alignE = (x, to) => ({ w: align(x.w, to.w), h: align(x.h, to.h) });
  function gcd(a, b) { if (a === b) return a; if (a < b) [a, b] = [b, a]; while (b !== 0) { const r = a % b; a = b; b = r; } return a; }  // :577-598
  const lcm = (a, b) => (a !== 0 && b !== 0 ? Math.floor((a * b) / gcd(a, b)) : Math.max(a, b));                                    // :608-616
  function subsampleFor(fi, plane) {                                         // :543-567
    if (plane === 0) return { w: 1, h: 1 };
    switch (fi.yuv_subsampling) {
      case 420: return { w: 2, h: 2 };
      case 422: return { w: 2, h: 1 };
      case 410: return { w: 4, h: 4 };
      case 411: return { w: 4, h: 1 };
      default: return { w: 1, h: 1 };
    }
  }
  const isAfbcMod = (m) => (m >> 56n) === VENDOR_ARM && ((m >> 52n) & 0xfn) === TYPE_AFBC && m !== 0n;
  const isAfrcMod = (m) => (m >> 56n) === VENDOR_ARM && ((m >> 52n) & 0xfn) === TYPE_AFRC;

  function superblockExtent(mod, plane, tiled) {                             // :177-199
    switch (mod & M.BLOCK_MASK) {
      case M.BLOCK_16x16: return { w: 16, h: 16 };
      case M.BLOCK_32x8: return { w: 32, h: tiled ? 8 : 16 };
      case M.BLOCK_64x4: return { w: 64, h: 4 };
      case M.BLOCK_32x8_64x4: return plane === 0 ? { w: 32, h: 8 } : { w: 64, h: 4 };
      default: return { w: 0, h: 0 };
    }
  }
  function afbcFactors(ext, tiledHdr, padded, isYuv) {                       // :201-238
    const nblk = padded && !isYuv ? 4 : 0;
    const paddedW = nblk * ext.w;
    const tile = tiledHdr ? { w: ext.w * tiledHdr, h: ext.h * tiledHdr } : { w: ext.w, h: ext.h };
    return { w: Math.floor(Math.max(paddedW, tile.w) / ext.w), h: Math.floor(tile.h / ext.h) };
  }

  /* mali_libformat_get_layout (mali_calc.cpp:683-885). Returns {layout} or {error}. */
  function getLayout(fourcc, mod, ipAlign, padded, trace) {
    const fi = A.fourcc_table[fourcc];
    if (!fi) return { error: `libformat has no entry for ${fourcc}`, cite: loc(F.LF, 692, 696) };
    const T = (msg, cite) => trace.push({ msg, cite });
    const lbi = fi.layout_block_info.map((b) => ({ ext: { w: b.w, h: b.h }, size: b.size }));
    const isYuv = !!fi.yuv_subsampling;
    if (mod === 0n) {
      if (!fi.is_linear) return { error: `${fourcc} is not linear-capable in libformat (is_linear = false)`, cite: loc(F.LF, 702, 738) };
      let L;
      if (fi.num_of_planes === 1) {
        // mali_libformat_linear_interleaved (:426-447): one plane, CPU pixel alignment, tile_size from the table
        L = { planes: [{ ext: lbi[0].ext, size: lbi[0].size, sub: { w: 1, h: 1 }, total_align: 1, plane_align: 1 }], ip: ipAlign, tile: fi.tile_size, afbc: null };
        T(`libformat: linear interleaved layout — block ${lbi[0].ext.w}×${lbi[0].ext.h} px = ${lbi[0].size} B`, loc(F.LF, 706, 709));
      } else if (fi.num_of_planes === 2) {
        // mali_libformat_linear_semiplanar (:449-475) called with defaults: ip align {1,1}, tile_size 1
        const sub = subsampleFor(fi, 1);
        L = { planes: [{ ext: lbi[0].ext, size: lbi[0].size, sub: { w: 1, h: 1 }, total_align: 1, plane_align: 1 }, { ext: lbi[1].ext, size: lbi[1].size, sub, total_align: 1, plane_align: 1 }], ip: { w: 1, h: 1 }, tile: 1, afbc: null };
        T(`libformat: linear semi-planar layout — Y block ${lbi[0].ext.w}×${lbi[0].ext.h} = ${lbi[0].size} B, chroma block ${lbi[1].ext.w}×${lbi[1].ext.h} = ${lbi[1].size} B, chroma subsampled ${sub.w}×${sub.h}. CPU pixel alignment is not passed for 2-plane layouts.`, loc(F.LF, 711, 718));
      } else if (fi.num_of_planes === 3) {
        const sub = subsampleFor(fi, 1);
        L = { planes: [0, 1, 2].map((i) => ({ ext: lbi[i].ext, size: lbi[i].size, sub: i ? sub : { w: 1, h: 1 }, total_align: 1, plane_align: 1 })), ip: ipAlign, tile: fi.tile_size, afbc: null };
        T(`libformat: linear planar layout — 3 planes, chroma subsampled ${sub.w}×${sub.h}`, loc(F.LF, 719, 727));
      } else return { error: 'unsupported plane count', cite: loc(F.LF, 729, 730) };
      L.bpp_p0 = fi.bpp[0];
      return { layout: L };
    }
    if (isAfbcMod(mod)) {
      if (!fi.is_afbc) return { error: `${fourcc} is not AFBC-capable in libformat (is_afbc = false)`, cite: loc(F.LF, 742, 808) };
      const tiled = (mod & M.TILED) !== 0n, db = (mod & M.DB) !== 0n;
      const wide = (mod & M.BLOCK_MASK) === M.BLOCK_32x8;
      const e0 = superblockExtent(mod, 0, tiled), e1 = superblockExtent(mod, 1, tiled);
      const tiledHdr = tiled ? (fi.bpp_afbc[0] > 32 ? 4 : 8) : 0;
      T(`libformat: AFBC superblock ${e0.w}×${e0.h}${fi.num_of_planes > 1 ? ` (plane 1: ${e1.w}×${e1.h})` : ''}${wide && !tiled ? ' — 32×8 without tiled headers is laid out as 32×16' : ''}`, loc(F.LF, 744, 748));
      if (tiled) T(`libformat: tiled headers group ${tiledHdr}×${tiledHdr} superblocks (bits_per_pixel_afbc[0] = ${fi.bpp_afbc[0]} ${fi.bpp_afbc[0] > 32 ? '> 32 → 4' : '≤ 32 → 8'})`, loc(F.LF, 752, 761));
      const wideFix = wide && !tiledHdr ? 2 : 1;
      if (fi.num_of_planes === 1) {
        // mali_libformat_afbc_interleaved (:240-312)
        let body = Math.floor(256 * fi.bpp_afbc[0] / 8);
        const afbcBpp = Math.floor(body * 8 / 256);
        body = align(body * wideFix, 128);
        let hdr = 16 * wideFix;
        if (db) body *= 2;
        const f = afbcFactors(e0, tiledHdr, padded, isYuv);
        const ext = { w: e0.w * f.w, h: e0.h * f.h };
        body *= f.w * f.h; hdr *= f.w * f.h;
        T(`libformat: interleaved AFBC — header ${hdr} B and body ${body} B per ${ext.w}×${ext.h} px block (16 B header per superblock; body = 256 px × ${fi.bpp_afbc[0]} bpp / 8${wideFix > 1 ? ' × 2' : ''}, aligned to 128${db ? ', × 2 for double body' : ''}; width factor ${f.w}${padded && !isYuv ? ' from AFBC padding (4 superblocks)' : ''}, height factor ${f.h})`, loc(F.LF, 246, 281));
        const pa = tiledHdr ? 4096 : 1024, pb = tiledHdr ? 4096 : 1;
        const L = { planes: [
          { ext, size: hdr, sub: { w: 1, h: 1 }, total_align: 1, plane_align: pa, header: true },
          { ext, size: body, sub: { w: 1, h: 1 }, total_align: 1, plane_align: pb },
        ], ip: { w: 1, h: 1 }, tile: 1, afbc: { bpp: [afbcBpp] } };
        T(`libformat: header plane aligned to ${pa} B, body plane to ${pb} B`, loc(F.LF, 296, 301));
        L.bpp_p0 = fi.bpp[0];
        return { layout: L };
      }
      if (fi.num_of_planes === 2) {
        const isRgbA8 = fourcc === 'DRM_FORMAT_RGB888_A8';
        if (!isRgbA8 && !tiled) return { error: 'libformat: 2-plane AFBC needs tiled headers', cite: loc(F.LF, 785, 788) };
        // mali_libformat_afbc_semiplanar (:314-402)
        let b0 = Math.floor(256 * fi.bpp_afbc[0] / 8);
        let b1 = isRgbA8 ? 256 : Math.floor(256 * fi.bpp_afbc[1] / 8);
        const bppL = Math.floor(b0 * 8 / 256), bppC = Math.floor(b1 * 8 / 256);
        const sub = isRgbA8 ? { w: 1, h: 1 } : subsampleFor(fi, 1);
        const pa = tiledHdr ? 4096 : 1024;
        b0 = align(b0 * wideFix, 128); b1 = align(b1, 128);
        let h0 = 16 * wideFix, h1 = 16;
        if (db) { b0 *= 2; b1 *= 2; }
        const f0 = afbcFactors(e0, tiledHdr, padded, isYuv), f1 = afbcFactors(e1, tiledHdr, padded, isYuv);
        const x0 = { w: e0.w * f0.w, h: e0.h * f0.h }, x1 = { w: e1.w * f1.w, h: e1.h * f1.h };
        b0 *= f0.w * f0.h; b1 *= f1.w * f1.h; h0 *= f0.w * f0.h; h1 *= f1.w * f1.h;
        T(`libformat: 2-plane AFBC — plane 0: header ${h0} B + body ${b0} B per ${x0.w}×${x0.h} px; plane 1: header ${h1} B + body ${b1} B per ${x1.w}×${x1.h} (subsampled ${sub.w}×${sub.h}); every part aligned to ${pa} B`, loc(F.LF, 319, 391));
        const L = { planes: [
          { ext: x0, size: h0, sub: { w: 1, h: 1 }, total_align: 1, plane_align: pa, header: true },
          { ext: x0, size: b0, sub: { w: 1, h: 1 }, total_align: 1, plane_align: pa },
          { ext: x1, size: h1, sub, total_align: 1, plane_align: pa, header: true },
          { ext: x1, size: b1, sub, total_align: 1, plane_align: pa },
        ], ip: { w: 1, h: 1 }, tile: 1, afbc: { bpp: [bppL, bppC] } };
        L.bpp_p0 = fi.bpp[0];
        return { layout: L };
      }
      return { error: 'libformat: AFBC supports 1 or 2 planes only', cite: loc(F.LF, 799, 800) };
    }
    if (isAfrcMod(mod)) {
      if (!fi.is_afrc) return { error: `${fourcc} is not AFRC-capable in libformat (is_afrc = false)`, cite: loc(F.LF, 812, 857) };
      const scan = (mod & M.AFRC_LAYOUT_SCAN) !== 0n;
      const tile = scan ? { w: 16, h: 4 } : { w: 8, h: 8 };                   // :124-144
      T(`libformat: AFRC paging tile ${tile.w}×${tile.h} (${scan ? 'scan' : 'rotation'} layout)`, loc(F.LF, 132, 141));
      const planes = [];
      for (let p = 0; p < fi.num_of_planes; p++) {
        const field = p === 0 ? Number(mod & 0xfn) : Number((mod >> 4n) & 0xfn);
        const cu = 8 + 8 * field;                                             // :520-532
        const ta = cu === 16 ? 1024 : cu === 24 ? 512 : cu === 32 ? 2048 : 0; // :411-424
        if (!ta) return { error: `AFRC coding unit for plane ${p} is ${cu} B (no alignment defined) — would divide by zero in align()`, cite: loc(F.LF, 411, 424) };
        const n = fi.ncmp[p];
        const clump = n === 1 ? tile : n === 2 ? { w: 8, h: 4 } : n === 3 || n === 4 ? { w: 4, h: 4 } : null;   // :146-175
        if (!clump) return { error: `invalid component count ${n}`, cite: loc(F.LF, 170, 171) };
        const ext = { w: tile.w * clump.w, h: tile.h * clump.h };
        planes.push({ ext, size: cu * tile.w * tile.h, sub: subsampleFor(fi, p), total_align: ta, plane_align: 1 });
        T(`libformat: AFRC plane ${p}: ${n} component(s) → clump ${clump.w}×${clump.h}, block ${ext.w}×${ext.h} px = ${cu} B × ${tile.w * tile.h} = ${cu * tile.w * tile.h} B; plane start aligned to ${ta} B`, loc(F.LF, 826, 847));
      }
      return { layout: { planes, ip: ipAlign, tile: fi.tile_size, afbc: null, bpp_p0: fi.bpp[0] } };
    }
    if (mod === MOD_GENERIC_16_16_TILE) {
      if (!fi.is_block_linear) return { error: `${fourcc} is not block-linear-capable in libformat`, cite: loc(F.LF, 861, 879) };
      const sub = subsampleFor(fi, 1);
      const e1 = { w: Math.floor(16 / sub.w), h: Math.floor(16 / sub.h) };
      const s0 = Math.floor(256 * fi.bpp[0] / 8), s1 = Math.floor(e1.w * e1.h * fi.bpp[1] / 8);
      T(`libformat: block-linear 16×16 — Y block ${s0} B, chroma block ${e1.w}×${e1.h} = ${s1} B; image extent aligned to 16×16`, loc(F.LF, 863, 872));
      return { layout: { planes: [
        { ext: { w: 16, h: 16 }, size: s0, sub: { w: 1, h: 1 }, total_align: 1, plane_align: 1 },
        { ext: e1, size: s1, sub, total_align: 1, plane_align: 1 },
      ], ip: { w: 16, h: 16 }, tile: 1, afbc: null, bpp_p0: fi.bpp[0] } };
    }
    return { error: 'modifier not supported by libformat', cite: loc(F.LF, 881, 884) };
  }

  /* mali_libformat_get_mali_stride_alignment (mali_calc.cpp:618-681) */
  function strideAlignment(fourcc, mod, optimizeForMali, pixelWidth) {
    const fi = A.fourcc_table[fourcc];
    if (mod !== 0n) return { sa: [1, 1, 1, 1, 1, 1] };
    const isYuv = !!fi.yuv_subsampling;
    const sa = [];
    for (let p = 0; p < 3; p++) {
      const hw = optimizeForMali ? (isYuv ? 128 : 64) : 0;
      let pw = 0;
      if (pixelWidth) {
        if ((fi.bpp[p] * pixelWidth) % 8 !== 0) return { error: `plane ${p}: ${fi.bpp[p]} bpp × ${pixelWidth} px is not a whole number of bytes → stride alignment 0 → INVALID`, cite: loc(F.LF, 631, 634) };
        pw = (fi.bpp[p] * pixelWidth) / 8;
      }
      sa.push(Math.max(1, lcm(hw, pw)));
    }
    return { sa, hw: optimizeForMali ? (isYuv ? 128 : 64) : 0 };
  }

  /* mali_libformat_compute_allocation (mali_calc.cpp:887-982) */
  function compute(L, image, sa) {
    const planes = [];
    let total = 0;
    for (let i = 0; i < L.planes.length; i++) {
      const b = L.planes[i];
      let ae = alignE({ w: Math.floor(image.w / b.sub.w) + (image.w % b.sub.w ? 1 : 0), h: Math.floor(image.h / b.sub.h) + (image.h % b.sub.h ? 1 : 0) }, b.ext);
      const nbx = ae.w / b.ext.w, nby = ae.h / b.ext.h;
      const blockStride = nbx * b.size;
      const sai = sa[i] == null ? 1 : sa[i];
      let rowStride = Math.floor(align(Math.floor(blockStride * L.tile / b.ext.h), sai) / L.tile);
      let size = rowStride * nby * b.ext.h;
      if (L.afbc) rowStride = Math.floor(L.afbc.bpp[Math.floor(i / 2)] * ae.w / 8);
      ae = alignE(ae, L.ip);
      total = align(total, b.total_align);
      size = align(size, b.plane_align);
      planes.push({ offset: total, size, block_stride: blockStride, row_stride: rowStride, aligned: ae, blocks: { x: nbx, y: nby }, header: !!b.header, ext: b.ext, sub: b.sub, block_size: b.size, sa: sai });
      total += size;
    }
    const pixelStride = L.bpp_p0 ? Math.floor(planes[0].row_stride * 8 / L.bpp_p0) : 0;
    let out = planes;
    if (L.afbc) {
      out = [];
      for (let k = 0; k < planes.length / 2; k++) {
        const h = planes[2 * k], bd = planes[2 * k + 1];
        out.push({ offset: h.offset, size: h.size + bd.size, header_size: h.size, body_size: bd.size, block_stride: bd.block_stride, row_stride: bd.row_stride, aligned: bd.aligned, blocks: bd.blocks, ext: bd.ext, sub: bd.sub, block_size: bd.block_size, header_block: h.block_size, sa: bd.sa });
      }
    }
    return { raw: planes, planes: out, total, pixel_stride: pixelStride };
  }

  /* ---- gralloc glue ---- */
  function producers(usage) {                                                 // formats.cpp:113-164
    let u = usage & ~U.PRIVATE_MASK & ~U.GRALLOC_USAGE_PROTECTED;
    const p = new Set();
    if (u === U.GRALLOC_USAGE_HW_COMPOSER) { p.add('DPU_AEU'); return p; }
    if (u & U.GRALLOC_USAGE_SW_WRITE_MASK) p.add('CPU');
    if ((u & U.GRALLOC_USAGE_DECODER) !== U.GRALLOC_USAGE_DECODER && (u & (U.GRALLOC_USAGE_HW_COMPOSER | U.GRALLOC_USAGE_HW_VIDEO_ENCODER)) === (U.GRALLOC_USAGE_HW_COMPOSER | U.GRALLOC_USAGE_HW_VIDEO_ENCODER)) p.add('DPU');
    if (u & (U.GRALLOC_USAGE_HW_RENDER | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) p.add('GPU');
    if (u & U.GRALLOC_USAGE_HW_CAMERA_WRITE) p.add('CAM');
    if ((u & U.GRALLOC_USAGE_DECODER) === U.GRALLOC_USAGE_DECODER) p.add('VPU');
    return p;
  }


  /* ======================================================================================
   * Automatic format selection — port of android/src/core/formats.cpp + capabilities/.
   * caps = { GPU: { present: bool, f: { FEATURE: 'RW'|'RO'|'WO'|'NO' } }, DPU, DPU_AEU, VPU, CAM }
   * An IP with present = false has no XML file: no restriction (capabilities.cpp:52-60).
   * ====================================================================================== */
  const CAPS = 'android/src/capabilities/capabilities.cpp', CAPH = 'android/src/capabilities/capabilities.h';
  const XIPS = ['GPU', 'DPU', 'DPU_AEU', 'VPU', 'CAM'];
  const CPU_FEATURES = ['FORMAT_R10G10B10A2', 'FORMAT_R10G10B10A10', 'FORMAT_R16G16B16A16_FLOAT', 'FORMAT_RGB16', 'FORMAT_DEPTH_STENCIL'];
  const FL = { F_NONE: 0, F_LIN: 1, F_AFBC: 2, F_AFRC: 4, F_BL_YUV: 8 };               // format_info.h:27-36
  const flagsOf = (arr) => (arr || []).reduce((a, n) => a | (FL[n] || 0), 0);
  const fname = (v) => ['LIN', 'AFBC', 'AFRC', 'BL_YUV'].filter((n, i) => v & (1 << i)).join('|') || 'NONE';
  const DEPTH = ['DEPTH_16', 'DEPTH_24', 'DEPTH_32F', 'DEPTH_32F_STENCIL_8', 'DEPTH_24_STENCIL_8_AFBC', 'DEPTH_24_STENCIL_8', 'STENCIL_8'].map((x) => 'MALI_GRALLOC_FORMAT_INTERNAL_' + x);
  const isDepth = (f) => DEPTH.includes(f.name);                                           // format_info.cpp:1081-1096
  const total = (f) => f.ncmp.reduce((a, b) => a + b, 0);
  const sn = (n) => n.replace('MALI_GRALLOC_FORMAT_INTERNAL_', '');
  function dataType(f) {                                                                   // formats.cpp:581-607
    const n = sn(f.name);
    if (['STENCIL_8', 'BLOB', 'RG16', 'RAW16'].includes(n)) return 'UINT';
    if (n === 'RGBA_16161616' || n === 'DEPTH_32F') return 'SFLOAT';
    return 'UNORM';
  }
  function consumersOf(usage) {                                                            // formats.cpp:44-102
    let u = usage & ~U.PRIVATE_MASK & ~U.GRALLOC_USAGE_PROTECTED;
    const c = new Set();
    if (u === U.GRALLOC_USAGE_HW_COMPOSER) { c.add('DPU'); return c; }
    if (u & U.GRALLOC_USAGE_SW_READ_MASK) c.add('CPU');
    if (u & U.GRALLOC_USAGE_HW_FB) c.add('DPU');
    if (u & U.GRALLOC_USAGE_HW_VIDEO_ENCODER) c.add('VPU');
    if ((u & (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_COMPOSER)) === (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_COMPOSER)) c.add('DPU');
    if (u & (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) c.add('GPU');
    if (u & (U.GRALLOC_USAGE_HW_CAMERA_READ | U.GRALLOC_USAGE_SENSOR_DIRECT_DATA)) c.add('CAM');
    return c;
  }
  /* ip_support_feature (capabilities.cpp:35-84) */
  function makeCaps(caps) {
    const perm = (ip, feat) => (caps[ip] && caps[ip].f && caps[ip].f[feat]) || null;
    function feature(prod, cons, feat) {
      if ((prod.has('CPU') || cons.has('CPU')) && !CPU_FEATURES.includes(feat)) return false;
      for (const ip of XIPS) {
        if (!caps[ip] || !caps[ip].present) continue;
        const p = perm(ip, feat);
        if (prod.has(ip) && !(p === 'RW' || p === 'WO')) return false;
        if (cons.has(ip) && !(p === 'RW' || p === 'RO')) return false;
      }
      return true;
    }
    const none = new Set();
    return {
      support: (p, c, feat) => feature(p, c, feat),
      prod: (p, feat) => feature(p, none, feat),
      cons: (c, feat) => feature(none, c, feat),
      present: (ip) => !feature(new Set([ip]), new Set([ip]), 'DISABLED'),           // capabilities.h:214-228
      gpuMissing: !(caps.GPU && caps.GPU.present),
    };
  }
  const subsampledYuv = (f) => f.is_yuv && (f.hsub > 1 || f.vsub > 1);
  function allocTypeOk(f, m) {                                                             // buffer_allocation.cpp:86-150 (multi-plane result)
    let multi = f.npln > 1;
    if (m.tiled) { if (f.npln > 1 && !m.x64 && f.is_yuv) multi = false; }
    else if (f.is_yuv && f.npln > 1) multi = false;
    if (m.x64 && !m.tiled) return null;
    if (f.npln === 1 && m.w32 && m.x64) return null;
    return { is_multi_plane: multi };
  }
  function modsToBits(m) {
    let b = 0;
    if (m.afbc) {
      b |= IF.AFBC_BASIC;
      if (m.split) b |= IF.AFBC_SPLITBLK; if (m.w32) b |= IF.AFBC_WIDEBLK; if (m.tiled) b |= IF.AFBC_TILED_HEADERS;
      if (m.x64) b |= IF.AFBC_EXTRAWIDEBLK; if (m.db) b |= IF.AFBC_DOUBLE_BODY; if (m.ytr) b |= IF.AFBC_YUV_TRANSFORM; if (m.sparse) b |= IF.AFBC_SPARSE;
    } else if (m.afrc) {
      b |= IF.AFRC_BASIC; if (m.rot) b |= IF.AFRC_ROT_LAYOUT;
      b |= (CU_INTERNAL[m.luma] || 0) << RGBA_CU_SHIFT; b |= (CU_INTERNAL[m.chroma] || 0) << CHROMA_CU_SHIFT;
    } else if (m.bl) b |= IF.BLOCK_LINEAR_BASIC;
    return b >>> 0;
  }
  function modsText(m) {
    if (m.afbc) return 'AFBC ' + [m.x64 && !m.w32 ? '64×4' : m.w32 && m.x64 ? '32×8+64×4' : m.w32 ? '32×8' : '16×16', m.tiled && 'tiled', m.split && 'split', m.db && 'double-body', m.sparse && 'sparse', m.ytr && 'YTR'].filter(Boolean).join(', ');
    if (m.afrc) return `AFRC ${m.rot ? 'rotation' : 'scan'} layout, CU ${m.luma}${m.chroma ? '/' + m.chroma : ''} B`;
    if (m.bl) return 'block-linear 16×16';
    return 'linear';
  }
  const usageIsFrontbuffer = (u) => !!(u & U.GRALLOC_USAGE_FRONTBUFFER) || (!!(u & U.MALI_GRALLOC_USAGE_FRONTBUFFER) && !(u & U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_SENTINEL));   // usages.h:215-220
  const usageIsNoAfbc = (u) => (u & U.MALI_GRALLOC_USAGE_NO_AFBC) === U.MALI_GRALLOC_USAGE_NO_AFBC && !(u & U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_SENTINEL);         // usages.h:230-237

  function isFormatSupported(C, f, row, usage, prod, cons) {                              // formats.cpp:374-472
    let fl = ~0;
    const R = (k) => flagsOf(row[k]);
    if (prod.has('CPU')) fl &= R('cpu_wr'); if (prod.has('GPU')) fl &= R('gpu_wr'); if (prod.has('DPU')) fl &= R('dpu_wr');
    if (prod.has('DPU_AEU')) fl &= R('dpu_aeu_wr'); if (prod.has('CAM')) fl &= R('cam_wr'); if (prod.has('VPU')) fl &= R('vpu_wr');
    if (cons.has('CPU')) fl &= R('cpu_rd'); if (cons.has('GPU')) fl &= R('gpu_rd'); if (cons.has('DPU')) fl &= R('dpu_rd'); if (cons.has('VPU')) fl &= R('vpu_rd');
    const why = [`IP table → ${fname(fl & 15)}`];
    if (usage & U.GRALLOC_USAGE_GPU_DATA_BUFFER) { fl &= FL.F_LIN; why.push('GPU_DATA_BUFFER → linear only'); }
    if (!(usage & U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_MASK) && (fl & FL.F_AFRC)) { fl &= ~FL.F_AFRC; why.push('no AFRC coding-size usage → no AFRC'); }
    const sup = (feat) => C.support(prod, cons, feat);
    if (fl & FL.F_AFBC) {
      if (!f.afbc || !sup('AFBC_16X16')) { fl &= ~FL.F_AFBC; why.push(!f.afbc ? 'table .afbc = false' : 'AFBC_16X16 missing'); }
      if (f.is_yuv && !sup('AFBC_YUV') && (fl & FL.F_AFBC)) { fl &= ~FL.F_AFBC; why.push('AFBC_YUV missing'); }
      if (usageIsFrontbuffer(usage) && !sup('AFBC_DOUBLE_BODY') && (fl & FL.F_AFBC)) { fl &= ~FL.F_AFBC; why.push('front buffer needs AFBC_DOUBLE_BODY'); }
      if (sn(f.name) === 'Y210' && !sup('AFBC_FORMAT_Y210') && (fl & FL.F_AFBC)) { fl &= ~FL.F_AFBC; why.push('AFBC_FORMAT_Y210 missing'); }
    }
    if (fl & FL.F_AFRC) {
      if (!f.afrc || (!sup('AFRC_ROT_LAYOUT') && !sup('AFRC_SCAN_LAYOUT'))) { fl &= ~FL.F_AFRC; why.push(!f.afrc ? 'table .afrc = false' : 'no AFRC layout feature'); }
    }
    if (fl & FL.F_BL_YUV) {
      if (!(f.block_linear && f.is_yuv)) { fl &= ~FL.F_BL_YUV; why.push('not a block-linear YUV format'); }
      else if (f.bps === 8 && !sup('YUV_BL_8')) { fl &= ~FL.F_BL_YUV; why.push('YUV_BL_8 missing'); }
      else if (f.bps === 10 && !sup('YUV_BL_10')) { fl &= ~FL.F_BL_YUV; why.push('YUV_BL_10 missing'); }
    }
    if ((fl & 15) !== 0) {
      const n = sn(f.name);
      if (n === 'RGBA_1010102' && !sup('FORMAT_R10G10B10A2')) { fl = 0; why.push('FORMAT_R10G10B10A2 missing → format unsupported'); }
      else if (n === 'RGBA_16161616') {
        if (!sup('FORMAT_R16G16B16A16_FLOAT')) { fl = 0; why.push('FORMAT_R16G16B16A16_FLOAT missing → unsupported'); }
        else if (!sup('AFBC_FORMAT_R16G16B16A16_FLOAT')) { fl = FL.F_LIN; why.push('AFBC_FORMAT_R16G16B16A16_FLOAT missing → linear'); }
      } else if (n === 'RGBA_10101010' && !sup('FORMAT_R10G10B10A10')) { fl = 0; why.push('FORMAT_R10G10B10A10 missing → unsupported'); }
      else if ((n === 'RAW16' || n === 'RG16') && !sup('FORMAT_RGB16')) { fl = 0; why.push('FORMAT_RGB16 missing → unsupported'); }
      else if (isDepth(f) && !sup('FORMAT_DEPTH_STENCIL')) { fl = 0; why.push('FORMAT_DEPTH_STENCIL missing → unsupported'); }
    }
    return { flags: fl & 15, why };
  }
  function afrcFormat(C, f, usage, prod, cons) {                                           // formats.cpp:620-680
    const m = { afrc: true };
    if (C.support(prod, cons, 'AFRC_ROT_LAYOUT')) m.rot = true;
    else if (!C.support(prod, cons, 'AFRC_SCAN_LAYOUT')) return null;
    const lm = usage & U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_MASK;
    m.luma = lm === U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_16 ? 16 : lm === U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_24 ? 24 : lm === U.MALI_GRALLOC_USAGE_AFRC_RGBA_LUMA_CODING_SIZE_32 ? 32 : 0;
    if (!m.luma) return null;
    const cm = usage & U.MALI_GRALLOC_USAGE_AFRC_CHROMA_CODING_SIZE_MASK;
    if (f.is_yuv) {
      m.chroma = cm === U.MALI_GRALLOC_USAGE_AFRC_CHROMA_CODING_SIZE_16 ? 16 : cm === U.MALI_GRALLOC_USAGE_AFRC_CHROMA_CODING_SIZE_24 ? 24 : cm === U.MALI_GRALLOC_USAGE_AFRC_CHROMA_CODING_SIZE_32 ? 32 : 0;
      if (!m.chroma) return null;
    } else if (cm) return null;
    return m;
  }
  function validateAfbc(C, f, m, prod, cons) {                                             // formats.cpp:485-572
    const sup = (feat) => C.support(prod, cons, feat);
    if (m.db) { m.w32 = false; m.x64 = false; }
    if (m.w32 && m.split && subsampledYuv(f)) m.split = false;
    if (m.w32 && !m.split && !subsampledYuv(f) && sn(f.name) !== 'RGB_565') { if (sup('AFBC_BLOCK_SPLIT')) m.split = true; else m.w32 = false; }
    if (sn(f.name) === 'RGB_565') m.split = false;
    if (m.afbc && !sup('AFBC_16X16')) return {};
    if (m.split && !sup('AFBC_BLOCK_SPLIT')) m.split = false;
    if (m.w32 && !sup('AFBC_32X8')) m.w32 = false;
    if (m.tiled && !sup('AFBC_TILED_HEADERS')) m.tiled = false;
    if (!m.sparse && (!C.prod(prod, 'AFBC_WRITE_NON_SPARSE') || prod.size === 0)) m.sparse = true;
    return m;
  }
  function afbcFormat(C, f, usage, prod, cons) {                                           // formats.cpp:696-793
    if (f.is_yuv) {
      if (cons.size && !C.cons(cons, 'AFBC_YUV')) return null;
      if (!C.prod(prod, 'AFBC_YUV')) return null;
    }
    if (prod.has('VPU') && cons.has('VPU')) return null;
    if (!C.support(prod, cons, 'AFBC_16X16')) return null;
    const m = { afbc: true, ytr: !!f.yuv_transform };
    if (prod.size === 0 || !C.prod(prod, 'AFBC_WRITE_NON_SPARSE')) m.sparse = true;
    if (C.support(prod, cons, 'AFBC_TILED_HEADERS')) {
      m.tiled = true;
      if (usageIsFrontbuffer(usage) && C.support(prod, cons, 'AFBC_DOUBLE_BODY')) m.db = true;
      if (f.npln > 1 && C.support(prod, cons, 'AFBC_TILED_HEADERS') && C.support(prod, cons, 'AFBC_64X4') && f.is_yuv) m.x64 = true;
    }
    if (prod.has('GPU') && cons.has('DPU') && C.present('DPU')) {
      if (C.support(prod, cons, 'AFBC_32X8') && !f.is_yuv) m.w32 = true;
      if (C.support(prod, cons, 'AFBC_BLOCK_SPLIT')) {
        let en = true;
        if (f.is_yuv && prod.has('GPU')) en = false;
        if ((!f.is_rgb || f.bpp[0] < 24) && (prod.has('DPU_AEU') || cons.has('DPU'))) en = false;
        m.split = en;
      }
    }
    const v = validateAfbc(C, f, m, prod, cons);
    return v.afbc ? v : null;
  }
  function supportedFormat(C, f, usage, prod, cons, dflags) {                              // formats.cpp:827-898
    const row = f.ip;
    if (!row) return { props: null, why: ['no formats_ip_support[] row'] };
    let r = isFormatSupported(C, f, row, usage, prod, cons);
    let why = r.why;
    if (r.flags === 0 && cons.has('GPU') && cons.has('DPU')) {
      const c2 = new Set(cons); c2.delete('DPU');
      r = isFormatSupported(C, f, row, usage, prod, c2);
      why = why.concat(['retry without DPU consumer (GPU composition fallback): ' + r.why.join('; ')]);
    }
    let fl = r.flags;
    if ((dflags & 8) && (usage & U.GRALLOC_USAGE_HW_FB)) { fl &= ~(FL.F_AFBC | FL.F_AFRC | FL.F_BL_YUV); why.push('HWC_FB_DISABLE_AFBC: framebuffer stays linear'); }
    if (fl & FL.F_AFRC) { const m = afrcFormat(C, f, usage, prod, cons); if (m) return { props: { flag: 'AFRC', m }, why }; why.push('AFRC not usable (layout feature / coding-size usage)'); }
    if ((fl & FL.F_AFBC) && !usageIsNoAfbc(usage)) {
      const m = afbcFormat(C, f, usage, prod, cons);
      if (m) { const at = allocTypeOk(f, m); if (at && (f.npln === 1 || at.is_multi_plane)) return { props: { flag: 'AFBC', m }, why }; why.push('AFBC modifiers not valid multi-plane AFBC for this format'); }
      else why.push('get_afbc_format returned no AFBC');
    } else if ((fl & FL.F_AFBC) && usageIsNoAfbc(usage)) why.push('MALI_GRALLOC_USAGE_NO_AFBC');
    if (fl & FL.F_BL_YUV) { if (C.support(prod, cons, 'YUV_BL_8') || C.support(prod, cons, 'YUV_BL_10')) return { props: { flag: 'BL_YUV', m: { bl: true } }, why }; }
    if (fl & FL.F_LIN) return { props: { flag: 'LIN', m: {} }, why };
    return { props: null, why };
  }
  function comparable(o, n) {                                                              // formats.cpp:910-955
    if (o.is_yuv && n.bps === o.bps) {
      if (total(n) === total(o)) return true;
      if (o.has_alpha && total(n) === 3 && n.is_yuv && !n.has_alpha) return true;
    } else if (o.is_rgb) {
      if (total(n) === total(o) && n.bpp[0] === o.bpp[0] && n.bps === o.bps) return true;
    } else if (isDepth(o) && isDepth(n)) return total(o) === total(n) && o.bps === n.bps;
    else if (n.name === o.name) return true;
    return false;
  }
  const compatible = (o, n) => n.hsub === o.hsub && n.vsub === o.vsub && n.is_rgb === o.is_rgb && n.is_yuv === o.is_yuv && comparable(o, n);   // :967-978
  const sameOrReordered = (x, y) => x.npln === y.npln && total(x) === total(y) && x.bps === y.bps && x.is_yuv === y.is_yuv && x.hsub === y.hsub && x.vsub === y.vsub;
  function grade(m, base, req) {                                                           // formats.cpp:991-1039
    let g = 1;
    if (m.afrc) { if (req.name === base.name || sameOrReordered(req, base)) g++; }
    else if (req.is_rgb && req.bpp[0] !== base.bpp[0]) return 0;
    if (m.afbc) { g += 2; for (const k of ['split', 'w32', 'tiled', 'x64', 'db', 'ytr', 'sparse']) if (m[k]) g += 1; }
    if (m.bl) g += 1;
    if (m.afrc) g += 2 ** 30;
    return g;
  }

  /* select_best_format (formats.cpp:1226-1330) + get_internal_format_with_usage (:347-358) */
  function selectBest(req, T) {
    const usage = req.usage, b = req.build || {};
    const sdk = b.sdk || 36;
    let dflags = 1 | 2 | 4;                                                                // GPU_DATA_BUFFER_WITH_ANY_FORMAT | USE_AIDL_FRONTBUFFER_USAGE | SUPPORTS_R8
    if (b.hwcFbDisableAfbc) dflags |= 8;
    dflags |= sdk > 33 ? 16 : 32;
    T(`allocate_common sets descriptor flags 0x${dflags.toString(16)} (any-format GPU data buffer, AIDL front buffer, R8${b.hwcFbDisableAfbc ? ', HWC_FB_DISABLE_AFBC' : ''}, ${sdk > 33 ? 'R16/RG16' : 'HW_IMP_CAM_USAGE'})`, loc('android/src/aidl/allocator.cpp', 38, 46));
    const hr = A.hal_requests.find((h) => h.hal === req.hal);
    if (!hr) return { ok: false, error: `unknown requested format ${req.hal}` };
    if (hr.condition && sdk <= 33) return { ok: false, error: `${req.hal} is only mapped when ${hr.condition.replace('#if ', '')}`, cite: hr.loc };
    let reqName = hr.internal;
    if ((dflags & 32) && req.hal === 'HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED' && (usage & (U.GRALLOC_USAGE_HW_CAMERA_WRITE | U.GRALLOC_USAGE_SENSOR_DIRECT_DATA | U.GRALLOC_USAGE_HW_CAMERA_READ))) {
      reqName = 'MALI_GRALLOC_FORMAT_INTERNAL_RG16'; T('Android 13 camera rule: IMPLEMENTATION_DEFINED + camera usage → RG16', loc(F.FM, 347, 358));
    }
    const rf = byName(reqName);
    if (!rf) return { ok: false, error: `${req.hal} maps to ${sn(reqName)}, which has no formats[] row — rejected`, cite: hr.loc };
    T(`requested ${req.hal} → base format ${sn(rf.name)}`, hr.loc);
    const perm = BigInt(rf.permitted_usage), V = U.VENDOR_USAGE;
    if (((perm | usage) & ~V) !== (perm & ~V)) return { ok: false, error: `usage not permitted for ${sn(rf.name)}: bits 0x${((~perm & usage) & ~V).toString(16)} are outside permitted_usage ${rf.permitted_usage_hex}`, cite: loc(F.FM, 1237, 1250) };
    T(`usage is within ${sn(rf.name)}.permitted_usage (${rf.permitted_usage_expr})`, loc(F.FM, 1237, 1250));
    const prod = producers(usage), cons = consumersOf(usage);
    if (!prod.size && !cons.size) return { ok: false, error: 'no producer and no consumer identified from the usage', cite: loc(F.FM, 1256, 1260) };
    if (!prod.size) { prod.add('CPU'); T('no producer identified: the CPU is assumed to be the producer', loc(F.FM, 1266, 1270)); }
    T(`producers: ${[...prod].join(', ')}; consumers: ${[...cons].join(', ') || 'none'}`, loc(F.FM, 44, 164));
    if (usageIsNoAfbc(usage) && rf.is_yuv) return { ok: false, error: 'MALI_GRALLOC_USAGE_NO_AFBC is invalid for YUV formats', cite: loc(F.FM, 1272, 1276) };
    if (!(dflags & 1) && (usage & U.GRALLOC_USAGE_GPU_DATA_BUFFER) && sn(rf.name) !== 'BLOB') return { ok: false, error: 'GPU_DATA_BUFFER needs BLOB without the AIDL allocator', cite: loc(F.FM, 1278, 1284) };
    if (!(dflags & 2) && (usage & U.GRALLOC_USAGE_FRONTBUFFER)) return { ok: false, error: 'FRONT_BUFFER usage not supported', cite: loc(F.FM, 1285, 1289) };
    if ((req.hal === 'GRALLOC_PIXEL_FORMAT_R16_UINT' || req.hal === 'GRALLOC_PIXEL_FORMAT_R16G16_UINT') && !(dflags & 16)) return { ok: false, error: `${req.hal} needs SUPPORTS_R16_RG16 (Android 14+)`, cite: loc(F.FM, 1298, 1304) };
    if (usageIsFrontbuffer(usage) && (req.layers || 1) > 1) return { ok: false, error: 'front-buffer usage with more than one layer is not supported', cite: loc(F.FM, 1306, 1310) };

    const C = makeCaps(req.caps || {});
    if (C.gpuMissing) return { ok: false, error: 'no GPU capabilities: gralloc aborts (LOG_ALWAYS_FATAL) when the GPU XML is missing', cite: loc(CAPS, 57, 61) };
    // get_best_format (formats.cpp:1060-1131)
    const candidates = [];
    let best = 0, bestC = null, reqC = null;
    for (const f of A.formats) {
      if (!compatible(rf, f)) continue;
      const r = supportedFormat(C, f, usage, prod, cons, dflags);
      const cand = { format: f, why: r.why, props: r.props, grade: 0 };
      if (r.props) {
        cand.grade = grade(r.props.m, f, rf);
        cand.text = modsText(r.props.m);
        if (cand.grade) {
          if (cand.grade > best) { best = cand.grade; bestC = cand; }
          if (f.name === rf.name) reqC = cand;
        }
      }
      candidates.push(cand);
    }
    const cpu = prod.has('CPU') || cons.has('CPU');
    let chosen = null;
    if (bestC) {
      if ((reqC ? reqC.grade : 0) !== best && !cpu) chosen = bestC;
      else if (reqC) chosen = reqC;
    }
    T(`get_best_format: ${candidates.length} compatible base formats, ${candidates.filter((x) => x.grade).length} supported; best grade ${best}${reqC ? `, requested format grade ${reqC.grade}` : ', requested format not supported'}`, loc(F.FM, 1060, 1131));
    if (!chosen) return { ok: false, error: cpu && bestC ? `the requested format is not supported, and with CPU usage gralloc does not switch to another base format (best would be ${sn(bestC.format.name)})` : 'no supported format for this usage and capability set', cite: loc(F.FM, 1112, 1128), candidates, best, prod: [...prod], cons: [...cons] };
    let f = chosen.format, m = chosen.props.m;
    if (b.nonConformant && (usage & U.GRALLOC_USAGE_HW_FB)) {
      if (sn(f.name) !== 'BGRA_8888' && (usage & (U.GRALLOC_USAGE_SW_WRITE_MASK | U.GRALLOC_USAGE_SW_READ_MASK))) return { ok: false, error: 'GRALLOC_NON_CONFORMANT_DISPLAY: framebuffer + CPU access needs BGRA_8888', cite: loc(F.FM, 1314, 1328) };
      f = byName('MALI_GRALLOC_FORMAT_INTERNAL_BGRA_8888'); m = {};
      T('GRALLOC_NON_CONFORMANT_DISPLAY: framebuffer forced to BGRA_8888 linear', loc(F.FM, 1314, 1328));
    }
    T(`selected ${sn(f.name)} — ${modsText(m)} (grade ${chosen.grade})`, loc(F.FM, 1112, 1128));
    return { ok: true, format: f, mods: modsToBits(m), m, request: rf, candidates, best, chosen: f.name, prod: [...prod], cons: [...cons], dflags };
  }
  /*
   * req = { format: internal format name, width, height, layers, usage: BigInt,
   *         comp: { type: 'linear'|'afbc'|'afrc'|'block_linear',
   *                 afbc: { block: '16x16'|'32x8'|'64x4'|'32x8_64x4', tiled, split, db, sparse, ytr, bch, usm },
   *                 afrc: { rot, rgba, luma, chroma } } }
   */
  function allocate(req) {
    const trace = [];
    const T = (msg, cite) => trace.push({ msg, cite });
    const fail = (error, cite) => { T('E: ' + error, cite); return { ok: false, error, trace }; };
    let f = req.mode === 'auto' ? null : byName(req.format);
    if (!f && req.mode !== 'auto') return fail(`unknown format ${req.format}`);
    const usage = req.usage;
    const W = req.width, H = req.height, layers = Math.max(1, req.layers || 1);

    // 1. usage check (formats.cpp:1348)
    const bad = usage & ~U.VALID_USAGE;
    if (bad) return fail(`usage 0x${usage.toString(16)} has bits outside VALID_USAGE: 0x${bad.toString(16)} — rejected`, loc(F.FM, 1348, 1353));
    T(`usage 0x${usage.toString(16)} is inside VALID_USAGE`, loc(F.FM, 1348));

    // 2. format: automatic selection (formats.cpp:1226-1330) or forced private format (formats.cpp:1185-1216)
    const c = req.comp || { type: 'linear' };
    let mods = 0;
    let selection = null;
    if (req.mode === 'auto') {
      selection = selectBest(req, T);
      if (!selection.ok) return Object.assign(fail(selection.error, selection.cite), { selection });
      f = selection.format; mods = selection.mods;
    } else {
    if (c.type === 'afbc') {
      const a = c.afbc || {};
      mods |= IF.AFBC_BASIC;
      if (a.block === '32x8' || a.block === '32x8_64x4') mods |= IF.AFBC_WIDEBLK;
      if (a.block === '64x4' || a.block === '32x8_64x4') mods |= IF.AFBC_EXTRAWIDEBLK;
      if (a.tiled) mods |= IF.AFBC_TILED_HEADERS;
      if (a.split) mods |= IF.AFBC_SPLITBLK;
      if (a.db) mods |= IF.AFBC_DOUBLE_BODY;
      if (a.sparse) mods |= IF.AFBC_SPARSE;
      if (a.ytr) mods |= IF.AFBC_YUV_TRANSFORM;
      if (a.bch) mods |= IF.AFBC_BCH;
      if (a.usm) mods |= IF.AFBC_USM;
    } else if (c.type === 'afrc') {
      const r = c.afrc || {};
      mods |= IF.AFRC_BASIC;
      if (r.rot) mods |= IF.AFRC_ROT_LAYOUT;
      const multi = f.is_yuv && f.npln > 1;
      mods |= (CU_INTERNAL[multi ? r.luma : r.rgba] || 0) << RGBA_CU_SHIFT;
      if (multi) mods |= (CU_INTERNAL[r.chroma] || 0) << CHROMA_CU_SHIFT;
    } else if (c.type === 'block_linear') mods |= IF.BLOCK_LINEAR_BASIC;
    if (req.privateFormats === false) return fail('forced private formats need GRALLOC_USE_PRIVATE_FORMATS=1 (configure PRIVATE_FORMATS=y, the default)', loc(F.FM, 1356, 1364));
    }
    const allocFormat = ((f.internal_value != null ? f.internal_value : f.value) | mods) >>> 0;
    const has = (bit) => (mods & bit) !== 0;
    if (req.mode !== 'auto') {
    T(`forced format: base ${f.name.replace('MALI_GRALLOC_FORMAT_INTERNAL_', '')} with modifiers 0x${(mods >>> 0).toString(16)} → alloc_format 0x${allocFormat.toString(16)}`, loc(F.FM, 1191, 1206));

    // check_modifiers_against_format (formats.cpp:1151-1175)
    const multiplaneReq = has(IF.AFBC_BASIC) && ((f.is_yuv && has(IF.AFBC_EXTRAWIDEBLK) && has(IF.AFBC_TILED_HEADERS)) || (f.npln > 1 && !(has(IF.AFBC_EXTRAWIDEBLK) || has(IF.AFBC_TILED_HEADERS))));
    let modsOk;
    if (has(IF.AFRC_BASIC) && f.afrc) modsOk = true;
    else if (!mods || (has(IF.BLOCK_LINEAR_BASIC) && f.block_linear)) modsOk = true;
    else if (has(IF.AFBC_BASIC)) modsOk = f.afbc && ((f.npln === 1 && !multiplaneReq) || (f.npln === 2 && multiplaneReq));
    else modsOk = false;
    if (!modsOk) {
      let why = '';
      if (has(IF.AFRC_BASIC)) why = 'format table says afrc = false';
      else if (has(IF.BLOCK_LINEAR_BASIC)) why = 'format table says block_linear = false';
      else if (!f.afbc) why = 'format table says afbc = false';
      else why = `${f.npln}-plane format with ${multiplaneReq ? 'multi' : 'single'}-plane AFBC request (YUV multi-plane AFBC needs 64×4 + tiled headers)`;
      return fail(`select_forced_format: invalid modifiers — ${why}`, loc(F.FM, 1151, 1175));
    }
    T('check_modifiers_against_format: modifiers accepted for this base format', loc(F.FM, 1151, 1175));
    }

    // 3. get_alloc_type (buffer_allocation.cpp:69-217)
    const at = { primary_type: 'UNCOMPRESSED', is_multi_plane: f.npln > 1, is_tiled: false, is_padded: false, is_frontbuffer_safe: false };
    if (has(IF.AFBC_BASIC)) {
      at.primary_type = has(IF.AFBC_WIDEBLK) ? 'AFBC_WIDEBLK' : has(IF.AFBC_EXTRAWIDEBLK) ? 'AFBC_EXTRAWIDEBLK' : 'AFBC';
      if (f.is_yuv && has(IF.AFBC_YUV_TRANSFORM)) T('W: YUV transform is enabled for a YUV format (warning only)', loc(F.BA, 88, 94));
      if (has(IF.AFBC_TILED_HEADERS)) {
        at.is_tiled = true;
        if (f.npln > 1 && !has(IF.AFBC_EXTRAWIDEBLK) && f.is_yuv) { at.is_multi_plane = false; T('W: extra-wide AFBC must be signalled for multi-plane YUV — falls back to single-plane AFBC', loc(F.BA, 111, 116)); }
        if (has(IF.AFBC_DOUBLE_BODY)) at.is_frontbuffer_safe = true;
      } else if (f.is_yuv && f.npln > 1) { at.is_multi_plane = false; T('W: multi-plane YUV AFBC needs tiled headers — falls back to single-plane AFBC', loc(F.BA, 125, 130)); }
      if (has(IF.AFBC_EXTRAWIDEBLK) && !at.is_tiled) return fail('get_alloc_type: extra-wide (64×4) blocks require tiled headers', loc(F.BA, 133, 138));
      if (at.is_frontbuffer_safe && (has(IF.AFBC_WIDEBLK) || has(IF.AFBC_EXTRAWIDEBLK))) T('W: front-buffer safe (double body) is not supported with wide/extra-wide blocks (logged as an error, allocation continues)', loc(F.BA, 140, 143));
      if (f.npln === 1 && has(IF.AFBC_WIDEBLK) && has(IF.AFBC_EXTRAWIDEBLK)) return fail('get_alloc_type: 32×8+64×4 implies multi-plane, invalid for a single-plane format', loc(F.BA, 145, 150));
      if (usage & U.MALI_GRALLOC_USAGE_AFBC_PADDING) at.is_padded = true;
    } else if (has(IF.AFRC_BASIC)) at.primary_type = 'AFRC';
    else if (has(IF.BLOCK_LINEAR_BASIC)) at.primary_type = 'BLOCK_LINEAR';
    T(`get_alloc_type: ${at.primary_type}${at.is_tiled ? ', tiled headers' : ''}${at.is_padded ? ', padded' : ''}${has(IF.AFBC_BASIC) ? (at.is_multi_plane ? ', multi-plane' : ', single-plane') : ''}`, loc(F.BA, 69, 217));

    // 4. validate_format (buffer_allocation.cpp:223-293)
    if (has(IF.AFBC_BASIC)) {
      if ((f.npln === 1 && at.is_multi_plane) || (f.npln > 1 && !at.is_multi_plane)) return fail(`validate_format: ${f.npln}-plane format is incompatible with ${at.is_multi_plane ? 'multi' : 'single'}-plane AFBC`, loc(F.BA, 242, 248));
      if (f.npln === 1 && at.primary_type === 'AFBC_EXTRAWIDEBLK') return fail('validate_format: single-plane format cannot use the extra-wide (64×4) AFBC type', loc(F.BA, 251, 256));
    } else if (!mods && !f.linear) return fail('validate_format: uncompressed requested but the format table says linear = false', loc(F.BA, 276, 284));
    if (f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_BLOB' && H !== 1) return fail('validate_format: BLOB height must be 1', loc(F.BA, 286, 290));
    T('validate_format: OK', loc(F.BA, 223, 293));

    // 5. mali_gralloc_adjust_dimensions (formats.cpp:178-215)
    let aw = W, ah = H;
    const prod = producers(usage);
    if (prod.has('VPU') && has(IF.AFBC_BASIC) && f.is_yuv && f.hsub === 2 && f.vsub === 2) {
      ah += has(IF.AFBC_TILED_HEADERS) ? 16 : 32;
      T(`adjust_dimensions: video decoder producer + AFBC YUV 4:2:0 → height + ${has(IF.AFBC_TILED_HEADERS) ? 16 : 32} = ${ah}`, loc(F.FM, 189, 199));
    }
    if (prod.has('GPU') && has(IF.AFBC_BASIC)) {
      aw = align(aw, 16); ah = align(ah, 16);
      T(`adjust_dimensions: GPU producer + AFBC → width/height aligned to 16: ${aw}×${ah}`, loc(F.FM, 202, 210));
    }
    if (aw === W && ah === H) T(`adjust_dimensions: no change (${W}×${H})`, loc(F.FM, 178, 215));

    // 6. DRM fourcc + modifier (buffer_allocation.cpp:396-420, drm_utils.cpp)
    const dm = drmFourccName(f.name, has(IF.AFBC_BASIC));
    if (!dm) return fail('could not find a DRM format for this internal format', loc(F.BA, 418, 419));
    let mod = 0n; const modNames = [];
    const isMulti = f.npln > 1;     // private_handle_t built with (npln > 1) (buffer_allocation.cpp:399-401)
    if (has(IF.AFBC_BASIC)) {
      let m = 0n;
      if (has(IF.AFBC_SPLITBLK)) { m |= M.SPLIT; modNames.push('SPLIT'); }
      if (has(IF.AFBC_TILED_HEADERS)) {
        m |= M.TILED; modNames.push('TILED');
        if (!f.is_yuv && f.bpp_afbc[0] <= 64) { m |= M.SC; modNames.push('SC'); }
      }
      if (has(IF.AFBC_DOUBLE_BODY)) { m |= M.DB; modNames.push('DB'); }
      if (has(IF.AFBC_BCH)) { m |= M.BCH; modNames.push('BCH'); }
      if (has(IF.AFBC_YUV_TRANSFORM)) { m |= M.YTR; modNames.push('YTR'); }
      if (has(IF.AFBC_SPARSE)) { m |= M.SPARSE; modNames.push('SPARSE'); }
      if (has(IF.AFBC_USM)) { m |= M.USM; modNames.push('USM'); }
      if (has(IF.AFBC_WIDEBLK)) { m |= isMulti ? M.BLOCK_32x8_64x4 : M.BLOCK_32x8; modNames.push(isMulti ? 'BLOCK_SIZE_32x8_64x4' : 'BLOCK_SIZE_32x8'); }
      else if (has(IF.AFBC_EXTRAWIDEBLK)) { m |= M.BLOCK_64x4; modNames.push('BLOCK_SIZE_64x4'); }
      else { m |= M.BLOCK_16x16; modNames.push('BLOCK_SIZE_16x16'); }
      mod = armCode(TYPE_AFBC, m);
      T(`DRM modifier: DRM_FORMAT_MOD_ARM_AFBC(${modNames.join(' | ')})`, loc(F.DRM, 153, 225));
    } else if (has(IF.AFRC_BASIC)) {
      let m = 0n;
      if (!has(IF.AFRC_ROT_LAYOUT)) { m |= M.AFRC_LAYOUT_SCAN; modNames.push('LAYOUT_SCAN'); }
      const luma = 16 + 8 * ((mods >>> RGBA_CU_SHIFT) & 3), chroma = 16 + 8 * ((mods >>> CHROMA_CU_SHIFT) & 3);
      const cuMod = (n) => (n === 32 ? M.CU_32 : n === 24 ? M.CU_24 : M.CU_16);
      if (f.is_yuv && isMulti) {
        m |= cuMod(luma); m |= cuMod(chroma) << 4n;
        modNames.push(`CU_SIZE_P0(${luma})`, `CU_SIZE_P12(${chroma})`);
      } else { m |= cuMod(luma); modNames.push(`CU_SIZE_P0(${luma})`); }
      mod = armCode(TYPE_AFRC, m);
      T(`DRM modifier: DRM_FORMAT_MOD_ARM_AFRC(${modNames.join(' | ')})`, loc(F.DRM, 86, 151));
    } else if (has(IF.BLOCK_LINEAR_BASIC)) {
      mod = MOD_GENERIC_16_16_TILE; modNames.push('GENERIC_16_16_TILE');
      T('DRM modifier: DRM_FORMAT_MOD_GENERIC_16_16_TILE', loc(F.DRM, 238, 241));
    } else T('DRM modifier: 0 (DRM_FORMAT_MOD_LINEAR)', loc(F.DRM, 242));
    T(`DRM fourcc: ${dm.fourcc}${dm.note ? ' — ' + dm.note : ''}`, dm.cite);

    // 7. usage → CPU / GPU flags and IP alignment (buffer_allocation.cpp:479-485)
    const hasCpu = (usage & (U.GRALLOC_USAGE_SW_READ_MASK | U.GRALLOC_USAGE_SW_WRITE_MASK)) !== 0n;
    const hasGpu = (usage & ~(U.PRIVATE_MASK | U.GRALLOC_USAGE_SW_READ_MASK | U.GRALLOC_USAGE_SW_WRITE_MASK | U.GRALLOC_USAGE_FRONTBUFFER)) !== 0n;
    const ip = { w: hasCpu ? f.align_w_cpu : 1, h: 1 };
    T(`has_cpu_usage = ${hasCpu}, has_gpu_usage = ${hasGpu} (any bit other than CPU, private and FRONTBUFFER counts as "GPU"); CPU pixel alignment ${ip.w}`, loc(F.BA, 479, 485));

    // 8. libformat layout + stride alignment
    const lr = getLayout(dm.fourcc, mod, ip, at.is_padded, trace);
    if (lr.error) return fail('mali_libformat_get_layout: ' + lr.error, lr.cite);
    const st = strideAlignment(dm.fourcc, mod, hasGpu, hasCpu ? f.align_w_cpu : 0);
    if (st.error) return fail('mali_libformat_get_mali_stride_alignment: ' + st.error, st.cite);
    const sa = st.sa.slice();
    if (mod === 0n) T(`stride alignment (bytes) per plane: ${sa.slice(0, 3).join(', ')} = lcm(${hasGpu ? st.hw + ' Mali HW' : 'no HW'}, ${hasCpu ? `bpp × ${f.align_w_cpu} px / 8 for the CPU` : 'no CPU'})`, loc(F.LF, 618, 672));
    else T('stride alignment: 1 for every plane (not linear)', loc(F.LF, 673, 679));
    if (f.name === 'MALI_GRALLOC_FORMAT_INTERNAL_YV12' && hasGpu && hasCpu) {
      sa[0] *= 2;
      sa[1] = align(Math.floor(sa[0] / 2), 16); sa[2] = align(Math.floor(sa[0] / 2), 16);
      T(`YV12 with CPU + HW usage: luma alignment doubled to ${sa[0]}, chroma = ALIGN(luma / 2, 16) = ${sa[1]}`, loc(F.BA, 318, 337));
    }

    // 9. compute allocation
    const al = compute(lr.layout, { w: aw, h: ah }, sa);
    T(`compute_allocation: ${al.planes.length} plane(s), total ${al.total} bytes`, loc(F.LF, 887, 938));
    if (lr.layout.afbc) T('AFBC header + body merged into one plane each; byte stride reported without the 128 B superblock alignment', loc(F.LF, 918, 925));
    if (al.total > 0xffffffff) return fail('total size exceeds 32 bits — libformat uses uint32_t sizes (overflow not simulated)', loc(F.LF, 929, 937));

    // 10. update_descriptor (buffer_allocation.cpp:339-369)
    let pixelStride = 0;
    if (hasCpu) {
      pixelStride = al.pixel_stride;
      if (/INTERNAL_RAW1[02]$/.test(f.name)) { pixelStride = al.planes[0].row_stride; T('RAW10/RAW12: pixel_stride is reported in bytes (AOSP definition)', loc(F.BA, 347, 357)); }
    }
    T(`pixel_stride = ${pixelStride}${hasCpu ? '' : ' (0 without CPU usage)'}`, loc(F.BA, 344, 362));
    let size = al.total;
    if (layers > 1) { size *= layers; T(`size × layer_count ${layers} = ${size}`, loc(F.BA, 364, 367)); }

    // heap (dma_buf_heaps.cpp:103-125) — heap names for system/system-uncached come from AOSP libdmabufheap (not in archive)
    let heap;
    if (usage & U.GRALLOC_USAGE_PROTECTED) heap = { name: 'protected', cite: loc(F.HEAP, 105, 108) };
    else if (!(usage & U.GRALLOC_USAGE_HW_VIDEO_ENCODER) && (usage & U.GRALLOC_USAGE_HW_FB)) heap = (req.build && req.build.contiguous) ? { name: 'linux,cma', note: 'GRALLOC_USE_CONTIGUOUS_DISPLAY_MEMORY=1', cite: loc(F.HEAP, 111, 112) } : { name: 'system', note: '"linux,cma" when built with GRALLOC_USE_CONTIGUOUS_DISPLAY_MEMORY', cite: loc(F.HEAP, 109, 116) };
    else if ((usage & U.GRALLOC_USAGE_SW_READ_MASK) === U.GRALLOC_USAGE_SW_READ_OFTEN) heap = { name: 'system', note: 'cached (CPU reads often)', cite: loc(F.HEAP, 117, 120) };
    else heap = { name: 'system-uncached', cite: loc(F.HEAP, 121, 124) };

    // dataspace (format_info.cpp:1034-1079)
    let ds = 'HAL_DATASPACE_UNKNOWN';
    if (f.is_yuv) {
      const m = usage & ((1n << 48n) | (1n << 49n));
      const csn = m === (1n << 49n) ? 'STANDARD_BT601_625' : m === (1n << 48n) ? 'STANDARD_BT709' : m ? 'STANDARD_BT2020' : 'STANDARD_UNSPECIFIED';
      const r = usage & ((1n << 51n) | (1n << 50n));
      const rn = r === (1n << 51n) ? 'RANGE_LIMITED' : r === (1n << 50n) ? 'RANGE_FULL' : 'RANGE_UNSPECIFIED';
      ds = `${csn} | ${rn}`;
    }

    return {
      ok: true, trace, format: f, alloc_format: allocFormat, mods, alloc_type: at, selection,
      data_type: dataType(f),
      adjusted: { w: aw, h: ah }, drm: { fourcc: dm.fourcc, modifier: mod, modifier_hex: '0x' + mod.toString(16).padStart(16, '0'), names: modNames },
      has_cpu: hasCpu, has_gpu: hasGpu, producers: [...prod], stride_alignment: sa.slice(0, Math.max(3, lr.layout.planes.length)),
      layout: lr.layout, allocation: al, planes: al.planes, total: al.total, size, pixel_stride: pixelStride, layers,
      heap, dataspace: { value: ds, cite: loc(F.FI, 1034, 1079) },
      lockable: !mods, lock_cite: loc(F.ACC, 191, 196),
    };
  }

  window.ArmEngine = { init, PRIVATE, selectBest, consumersOf, makeCaps, XIPS, dataType, allocate, getLayout, compute, strideAlignment, producers, IF, M, loc, F, usages: () => U };
})();
