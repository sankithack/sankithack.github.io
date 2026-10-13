/*
 * engine.js — a line-by-line JavaScript port of gchips gralloc4's format
 * selection and buffer layout logic.  Every function names the C/C++ function
 * it mirrors (file:line at the extracted commit).  64-bit quantities (usage,
 * capability masks, internal format with modifier bits) use BigInt.
 *
 * Mirrors:
 *   gralloc4/src/core/mali_gralloc_formats.cpp        (format selection)
 *   gralloc4/src/core/mali_gralloc_bufferallocation.cpp (size/stride/planes)
 *   gralloc4/src/core/exynos_format_allocation.h       (Exynos setup_*)
 *   gralloc4/src/capabilities/src/gralloc_capabilities.cpp (IP caps)
 *   gralloc4/src/allocator/mali_gralloc_ion.cpp        (heap selection)
 *   gralloc4/src/core/format_info.cpp                  (dataspace, lookups)
 *
 * Not portable from this repo: SBWC sizes (macros in external
 * <linux/videodev2_exynos_media.h>) — reported as unknown.
 */
(function (global) {
  'use strict';

  const P = {
    FMTS: 'gralloc4/src/core/mali_gralloc_formats.cpp',
    ALLOC: 'gralloc4/src/core/mali_gralloc_bufferallocation.cpp',
    EXA: 'gralloc4/src/core/exynos_format_allocation.h',
    CAPS: 'gralloc4/src/capabilities/src/gralloc_capabilities.cpp',
    ION: 'gralloc4/src/allocator/mali_gralloc_ion.cpp',
    FI: 'gralloc4/src/core/format_info.cpp',
    MGF: 'gralloc4/src/mali_gralloc_formats.h',
    HELP: 'gralloc4/src/gralloc_helper.h',
    DRM: 'gralloc4/interfaces/libs/drmutils/src/drmutils.cpp',
  };
  const C = (file, line) => ({ file, line });

  const MASK64 = (1n << 64n) - 1n;
  const bnot = (x) => MASK64 ^ BigInt(x);

  /* GRALLOC_ALIGN(value, base) ((((value) + (base) -1) / (base)) * (base))  gralloc_helper.h:28 */
  function ALIGN(v, b) {
    if (b === 0) return NaN; // division by zero in C
    return Math.floor((v + b - 1) / b) * b;
  }

  /* ---- constants (mali_gralloc_formats.h) ---- */
  const EXT = 32n;
  const MOD = {
    AFBC_BASIC: 1n << (EXT + 0n),        // :142
    AFBC_SPLITBLK: 1n << (EXT + 2n),     // :150
    AFBC_WIDEBLK: 1n << (EXT + 3n),      // :153
    AFBC_TILED_HEADERS: 1n << (EXT + 4n),// :156
    AFBC_EXTRAWIDEBLK: 1n << (EXT + 5n), // :159
    AFBC_DOUBLE_BODY: 1n << (EXT + 6n),  // :162
    AFBC_BCH: 1n << (EXT + 7n),          // :165
    AFBC_YUV_TRANSFORM: 1n << (EXT + 8n),// :168
    AFBC_SPARSE: 1n << (EXT + 9n),       // :171
  };
  const FMT_MASK = 0xffffffffn;
  const EXT_MASK = 0xffffffff00000000n;
  const AFBCENABLE_MASK = MOD.AFBC_BASIC;

  const CAP = {
    OPTIONS_PRESENT: 1n << 0n, AFBC_BASIC: 1n << 1n, AFBC_SPLITBLK: 1n << 2n, AFBC_WIDEBLK: 1n << 3n,
    AFBC_WRITE_NON_SPARSE: 1n << 4n, AFBC_TILED_HEADERS: 1n << 7n, AFBC_EXTRAWIDEBLK: 1n << 8n,
    AFBC_MULTIPLANE_READ: 1n << 9n, AFBC_DOUBLE_BODY: 1n << 10n, AFBC_YUV_READ: 1n << 11n,
    AFBC_YUV_WRITE: 1n << 12n, AFBC_RGBA16161616: 1n << 13n,
    PIXFMT_RGBA1010102: 1n << 32n, PIXFMT_RGBA16161616: 1n << 33n,
  }; // mali_gralloc_formats.h:323-342
  CAP.AFBCENABLE_MASK = CAP.AFBC_BASIC | CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK | CAP.AFBC_TILED_HEADERS; // :344

  /* producers/consumers — mali_gralloc_formats.cpp:42-59 */
  const PR = { CPU: 1, GPU: 2, DPU: 4, VPU: 16, CAM: 32, BIG: 64, MFC: 128, TPU: 256 };
  PR.VPUS = PR.VPU | PR.BIG | PR.MFC;
  const CO = { CPU: 1, GPU: 2, DPU: 4, VPU: 8, BIG: 16, MFC: 32, TPU: 64 };
  CO.VPUS = CO.VPU | CO.BIG | CO.MFC;

  const F_NONE = 0, F_LIN = 1, F_AFBC = 2, F_AFBC_SWIZ = 4; // format_info.h:27-33
  const FLAGBITS = { F_NONE, F_LIN, F_AFBC, F_AFBC_SWIZ };

  const AllocBaseType = { UNCOMPRESSED: 'UNCOMPRESSED', AFBC: 'AFBC', AFBC_WIDEBLK: 'AFBC_WIDEBLK', AFBC_EXTRAWIDEBLK: 'AFBC_EXTRAWIDEBLK' };

  /* Default build flags: everything off == the code as compiled with no board
   * soong_config values set.  Real Pixel boards set some of these in device
   * trees that are not part of this repository. */
  const DEFAULT_FLAGS = {
    MALI_GPU_SUPPORT_AFBC_BASIC: false,
    MALI_GPU_SUPPORT_AFBC_YUV_WRITE: false,
    MALI_GPU_SUPPORT_AFBC_SPLITBLK: false,
    MALI_GPU_SUPPORT_AFBC_WIDEBLK: false,
    MALI_GPU_SUPPORT_AFBC_TILED_HEADERS: false,
    SOC_ZUMA: false,
    GRALLOC_DPU_SUPPORT_1010102_AFBC: false,
    GRALLOC_ARM_NO_EXTERNAL_AFBC: false,
    GRALLOC_HWC_FB_DISABLE_AFBC: false,
    prop_debug_vendor_gpu_record_sbwc: true, // property_get_bool(..., true)  formats.cpp:1395
  };

  let D = null;          // GRALLOC_FORMATS data
  let byId = new Map();  // value -> format record
  let order = [];        // formats[] in table order
  let V = {};            // name -> numeric value
  let U = {};            // usage name -> BigInt

  function init(data) {
    D = data;
    order = data.formats;
    byId = new Map();
    V = {};
    for (const f of data.formats) {
      if (typeof f.value === 'number') { byId.set(f.value, f); V[f.name] = f.value; }
      if (f.alias) V[f.alias] = f.value;
    }
    for (const f of data.defined_only) if (typeof f.value === 'number') V[f.name] = f.value;
    for (const r of data.hal_requests) if (typeof r.hal_value === 'number') V[r.hal] = r.hal_value;
    U = {};
    for (const u of data.usages.flags) if (u.value != null) U[u.name] = BigInt(u.value);
    U.PRIVATE_MASK = BigInt(data.usages.private_mask.value);
    U.PUBLIC_MASK = bnot(U.PRIVATE_MASK);
    U.DECODER = U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_COMPOSER | U.GRALLOC_USAGE_EXTERNAL_DISP; // usages.h:126
  }

  const fmtIdx = (id) => order.findIndex((f) => f.value === id); // get_format_index  format_info.cpp:312
  const ipFlags = (f, k) => f.ip[k].reduce((a, t) => a | (FLAGBITS[t] || 0), 0);
  const isExynos = (id) => { const f = byId.get(id); return !!(f && f.is_exynos_format); }; // formats.cpp:1584
  const total_components = (f) => f.ncmp.reduce((a, b) => a + b, 0);

  /* ---------------- capabilities: gralloc_capabilities.cpp:42-145 ---------------- */
  function ipCaps(fl) {
    const c = {};
    c.cpu = CAP.OPTIONS_PRESENT | CAP.PIXFMT_RGBA1010102 | CAP.PIXFMT_RGBA16161616;          // :57-59
    c.dpu = CAP.OPTIONS_PRESENT | CAP.AFBC_BASIC | CAP.AFBC_YUV_READ;                        // :62-64
    if (fl.SOC_ZUMA) c.dpu |= CAP.AFBC_WIDEBLK;                                               // :65-67
    if (fl.GRALLOC_DPU_SUPPORT_1010102_AFBC) c.dpu |= CAP.PIXFMT_RGBA1010102;                 // :68-70
    c.gpu = CAP.OPTIONS_PRESENT;                                                              // :72
    if (fl.MALI_GPU_SUPPORT_AFBC_BASIC) {                                                     // :73
      c.gpu |= CAP.AFBC_BASIC | CAP.AFBC_YUV_READ | CAP.PIXFMT_RGBA1010102 | CAP.PIXFMT_RGBA16161616;
      if (fl.MALI_GPU_SUPPORT_AFBC_YUV_WRITE) c.gpu |= CAP.AFBC_YUV_WRITE;                    // :79-81
      if (fl.MALI_GPU_SUPPORT_AFBC_SPLITBLK) c.gpu |= CAP.AFBC_SPLITBLK;                      // :83-85
      if (fl.MALI_GPU_SUPPORT_AFBC_WIDEBLK) c.gpu |= CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK;    // :87-90
      if (fl.MALI_GPU_SUPPORT_AFBC_TILED_HEADERS)
        c.gpu |= CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK | CAP.AFBC_TILED_HEADERS;               // :92-96
    }
    c.bo = CAP.OPTIONS_PRESENT | CAP.AFBC_BASIC | CAP.AFBC_YUV_WRITE;                         // :100-102
    c.bw = CAP.OPTIONS_PRESENT | CAP.AFBC_BASIC | CAP.AFBC_YUV_READ | CAP.AFBC_YUV_WRITE | CAP.AFBC_WIDEBLK; // :105-109
    c.mfc = CAP.OPTIONS_PRESENT;                                                              // :112
    c.vpu = CAP.OPTIONS_PRESENT | CAP.AFBC_BASIC | CAP.AFBC_YUV_WRITE;                        // :115-117
    c.cam = CAP.OPTIONS_PRESENT;                                                              // :120
    if (fl.GRALLOC_ARM_NO_EXTERNAL_AFBC) for (const k in c) c[k] &= bnot(CAP.AFBCENABLE_MASK); // :123-132
    return c;
  }

  /* ---------------- producers / consumers ---------------- */
  function get_vpu_consumer(u) { // formats.cpp:78
    if (!(u & U.GRALLOC_USAGE_HW_VIDEO_ENCODER)) return 0;
    if (u & U.GRALLOC_USAGE_GOOGLE_IP_MFC) return CO.MFC;
    if (u & U.GRALLOC_USAGE_GOOGLE_IP_BIG) return CO.BIG;
    return CO.MFC;
  }
  function get_consumers(u) { // formats.cpp:105
    let c = 0;
    if (u & U.GS101_GRALLOC_USAGE_TPU_INPUT) c |= CO.TPU;
    u &= bnot(U.GRALLOC_USAGE_PROTECTED);
    if ((u & U.PUBLIC_MASK) === U.GRALLOC_USAGE_HW_COMPOSER) {
      c = CO.DPU;
    } else {
      if (u & U.GRALLOC_USAGE_SW_READ_MASK) c |= CO.CPU;
      if (u & U.GRALLOC_USAGE_HW_FB) c |= CO.DPU;
      c |= get_vpu_consumer(u);
      const tc = U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_COMPOSER;
      if ((u & tc) === tc) c |= CO.DPU;
      if (u & (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) c |= CO.GPU;
    }
    return c;
  }
  function get_vpu_producer(u) { // formats.cpp:171
    if (!(u & U.GRALLOC_USAGE_HW_VIDEO_DECODER)) return 0;
    if (u & U.GRALLOC_USAGE_GOOGLE_IP_BIG) return PR.BIG;
    if (u & U.GRALLOC_USAGE_GOOGLE_IP_MFC) return PR.MFC;
    return PR.VPU;
  }
  function get_producers(u) { // formats.cpp:198
    let p = 0;
    if (u & U.GS101_GRALLOC_USAGE_TPU_OUTPUT) p |= PR.TPU;
    u &= bnot(U.GRALLOC_USAGE_PROTECTED);
    if (u & U.GRALLOC_USAGE_SW_WRITE_MASK) p |= PR.CPU;
    const ce = U.GRALLOC_USAGE_HW_COMPOSER | U.GRALLOC_USAGE_HW_VIDEO_ENCODER;
    if ((u & U.DECODER) !== U.DECODER && (u & ce) === ce) p |= PR.DPU;
    if (u & (U.GRALLOC_USAGE_HW_RENDER | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) p |= PR.GPU;
    if (u & U.GRALLOC_USAGE_HW_CAMERA_WRITE) p |= PR.CAM;
    p |= get_vpu_producer(u);
    return p;
  }
  const consumers_use_cpu_caps = (c) => !!(c & (CO.CPU | CO.TPU)); // :242
  const producers_use_cpu_caps = (p) => !!(p & (PR.CPU | PR.TPU)); // :247

  function get_consumer_caps(c, caps, fl) { // formats.cpp:264
    let cc = MASK64;
    cc &= bnot(CAP.AFBC_YUV_WRITE);
    if (consumers_use_cpu_caps(c)) cc &= caps.cpu;
    if (c & CO.GPU && caps.gpu & CAP.OPTIONS_PRESENT) cc &= caps.gpu;
    if (c & CO.DPU && caps.dpu & CAP.OPTIONS_PRESENT) cc &= caps.dpu;
    if (c & CO.VPU && caps.vpu & CAP.OPTIONS_PRESENT) cc &= caps.vpu;
    if (c & CO.BIG) {
      const b = fl.SOC_ZUMA ? caps.bw : caps.bo;
      if (b & CAP.OPTIONS_PRESENT) cc &= b;
    }
    if (c & CO.MFC && caps.mfc & CAP.OPTIONS_PRESENT) cc &= caps.mfc;
    return cc;
  }
  function get_producer_caps(p, caps, fl) { // formats.cpp:331
    if (p === 0) return 0n;
    let pc = MASK64;
    pc &= bnot(CAP.AFBC_YUV_READ);
    if (producers_use_cpu_caps(p)) pc &= caps.cpu;
    if (p & PR.GPU && caps.gpu & CAP.OPTIONS_PRESENT) pc &= caps.gpu;
    if (p & PR.DPU && caps.dpu & CAP.OPTIONS_PRESENT) pc &= caps.dpu;
    if (p & PR.CAM && caps.cam & CAP.OPTIONS_PRESENT) pc &= caps.cam;
    if (p & PR.VPU && caps.vpu & CAP.OPTIONS_PRESENT) pc &= caps.vpu;
    if (p & PR.BIG) {
      const b = fl.SOC_ZUMA ? caps.bw : caps.bo;
      if (b & CAP.OPTIONS_PRESENT) pc &= b;
    }
    if (p & PR.MFC && caps.mfc & CAP.OPTIONS_PRESENT) pc &= caps.mfc;
    return pc;
  }

  /* mali_gralloc_adjust_dimensions  formats.cpp:409 */
  function adjust_dimensions(alloc_format, usage, w, h, trace) {
    const producers = get_producers(usage);
    if ((producers & PR.VPUS) && (alloc_format & MOD.AFBC_BASIC)) {
      const f = byId.get(Number(alloc_format & FMT_MASK));
      if (f && f.is_yuv && f.hsub === 2 && f.vsub === 2) {
        const add = (alloc_format & MOD.AFBC_TILED_HEADERS) ? 16 : 32;
        h += add;
        trace.push({ msg: `Video producer + AFBC YUV420: height += ${add} → ${h}`, cite: C(P.FMTS, 431) });
      }
    }
    if (producers & PR.GPU && alloc_format & MOD.AFBC_BASIC) {
      w = ALIGN(w, 16); h = ALIGN(h, 16);
      trace.push({ msg: `GPU producer + AFBC: pad to 16×16 → ${w}×${h}`, cite: C(P.FMTS, 441) });
    }
    return [w, h];
  }

  function ip_supports_base_format(p, c, f) { // formats.cpp:464
    let s = 0xff;
    if (producers_use_cpu_caps(p)) s &= ipFlags(f, 'cpu_wr');
    if (p & PR.GPU) s &= ipFlags(f, 'gpu_wr');
    if (p & PR.DPU) s &= ipFlags(f, 'dpu_wr');
    if (p & PR.CAM) s &= ipFlags(f, 'cam_wr');
    if (p & PR.VPUS) s &= ipFlags(f, 'vpu_wr');
    if (consumers_use_cpu_caps(c)) s &= ipFlags(f, 'cpu_rd');
    if (c & CO.GPU) s &= ipFlags(f, 'gpu_rd');
    if (c & CO.DPU) s &= ipFlags(f, 'dpu_rd');
    if (c & CO.VPUS) s &= ipFlags(f, 'vpu_rd');
    return s;
  }

  function is_subsampled_yuv(base) { // formats.cpp:524
    const f = byId.get(Number(BigInt(base) & FMT_MASK));
    return !!(f && f.is_yuv && (f.hsub > 1 || f.vsub > 1));
  }

  function is_afbc_multiplane_supported(p, c, pc, cc) { // formats.cpp:555
    return !!(pc & cc & CAP.AFBC_BASIC && pc & cc & CAP.AFBC_TILED_HEADERS &&
      pc & cc & CAP.AFBC_EXTRAWIDEBLK && cc & CAP.AFBC_MULTIPLANE_READ && p === 0);
  }

  function is_format_supported(f, usage, p, c, pc, cc) { // formats.cpp:586
    let fl = ip_supports_base_format(p, c, f);
    if (fl & F_AFBC) {
      if (!f.afbc || (pc & cc & CAP.AFBC_BASIC) === 0n) fl &= ~F_AFBC;
      if (f.npln > 1 && !is_afbc_multiplane_supported(p, c, pc, cc)) fl &= ~F_AFBC;
      if (f.is_yuv) {
        if ((pc & CAP.AFBC_YUV_WRITE) === 0n) fl &= ~F_AFBC;
        if ((cc & CAP.AFBC_YUV_READ) === 0n) fl &= ~F_AFBC;
      }
      if (usage & U.GRALLOC_USAGE_FRONT_BUFFER) {
        if ((pc & cc & CAP.AFBC_DOUBLE_BODY) === 0n) fl &= ~F_AFBC;
      }
    }
    if (fl !== F_NONE) {
      if (f.value === V.MALI_GRALLOC_FORMAT_INTERNAL_RGBA_1010102 &&
          (pc & cc & CAP.PIXFMT_RGBA1010102) === 0n) {
        fl = F_LIN; // :643-644 (W/A)
      } else if (f.value === V.MALI_GRALLOC_FORMAT_INTERNAL_RGBA_16161616) {
        if ((pc & cc & CAP.PIXFMT_RGBA16161616) === 0n) fl = F_LIN;
        else if ((pc & cc & CAP.AFBC_RGBA16161616) === 0n) fl = F_LIN;
      }
    }
    return fl;
  }

  function validate_afbc_format(af, pac, cac) { // formats.cpp:678
    const base = af & FMT_MASK;
    if (af & MOD.AFBC_DOUBLE_BODY) { af &= bnot(MOD.AFBC_WIDEBLK); af &= bnot(MOD.AFBC_EXTRAWIDEBLK); }
    if (af & MOD.AFBC_WIDEBLK && af & MOD.AFBC_SPLITBLK && is_subsampled_yuv(base)) af &= bnot(MOD.AFBC_SPLITBLK);
    if (af & MOD.AFBC_WIDEBLK && (af & MOD.AFBC_SPLITBLK) === 0n && !is_subsampled_yuv(base) &&
        Number(base) !== V.MALI_GRALLOC_FORMAT_INTERNAL_RGB_565) {
      if (pac & cac & CAP.AFBC_SPLITBLK) af |= MOD.AFBC_SPLITBLK; else af &= bnot(MOD.AFBC_WIDEBLK);
    }
    if (Number(base) === V.MALI_GRALLOC_FORMAT_INTERNAL_RGB_565) af &= bnot(MOD.AFBC_SPLITBLK);
    if ((af & MOD.AFBC_BASIC) && (pac & cac & CAP.AFBC_BASIC) === 0n) af &= bnot(MOD.AFBC_BASIC);
    if ((af & MOD.AFBC_SPLITBLK) && (pac & cac & CAP.AFBC_SPLITBLK) === 0n) af &= bnot(MOD.AFBC_SPLITBLK);
    if ((af & MOD.AFBC_WIDEBLK) && (pac & cac & CAP.AFBC_WIDEBLK) === 0n) af &= bnot(MOD.AFBC_WIDEBLK);
    if ((af & MOD.AFBC_TILED_HEADERS) && (pac & cac & CAP.AFBC_TILED_HEADERS) === 0n) af &= bnot(MOD.AFBC_TILED_HEADERS);
    if (!((af & MOD.AFBC_SPARSE) || (pac & CAP.AFBC_WRITE_NON_SPARSE))) af |= MOD.AFBC_SPARSE; // :773-779
    return af;
  }

  function get_afbc_format(base, usage, p, c, pc, cc) { // formats.cpp:801
    let af = BigInt(base);
    if (pc & cc & CAP.OPTIONS_PRESENT && ((p & PR.VPUS) === 0 || (c & CO.VPUS) === 0)) {
      if (pc & CAP.AFBC_BASIC && cc & CAP.AFBC_BASIC) {
        af |= MOD.AFBC_BASIC;
        /* YUV transform: #if 0 at :822-833 */
        if (!(pc & CAP.AFBC_WRITE_NON_SPARSE)) af |= MOD.AFBC_SPARSE;
        if (pc & CAP.AFBC_TILED_HEADERS && cc & CAP.AFBC_TILED_HEADERS) {
          af |= MOD.AFBC_TILED_HEADERS;
          if (usage & U.GRALLOC_USAGE_FRONT_BUFFER && pc & cc & CAP.AFBC_DOUBLE_BODY) af |= MOD.AFBC_DOUBLE_BODY;
        }
        if (c & CO.GPU) {
          if (pc & CAP.AFBC_SPLITBLK && cc & CAP.AFBC_SPLITBLK) af |= MOD.AFBC_SPLITBLK;
          if (pc & CAP.AFBC_WIDEBLK && cc & CAP.AFBC_WIDEBLK) af |= MOD.AFBC_WIDEBLK;
        }
      }
    }
    return validate_afbc_format(af, pc, cc);
  }

  function get_active_caps(f, p, c, pc, cc) { // formats.cpp:898 — returns [pc', cc']
    let pm = MASK64, cm = MASK64;
    const pcv = pc == null ? 0n : pc, ccv = cc == null ? 0n : cc;
    if (f.is_yuv) {
      if ((pcv & CAP.AFBC_YUV_WRITE) === 0n) pm &= bnot(CAP.AFBCENABLE_MASK);
      else if (p & PR.GPU) pm &= bnot(CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK);
      if ((ccv & CAP.AFBC_YUV_READ) === 0n) cm &= bnot(CAP.AFBCENABLE_MASK);
    }
    if ((p & PR.GPU) && (c & CO.GPU) && (pcv & ccv & CAP.AFBC_BASIC)) {
      pm &= bnot(CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK);
      cm &= bnot(CAP.AFBC_SPLITBLK | CAP.AFBC_WIDEBLK);
    }
    if (c & CO.DPU) {
      if (!f.is_rgb || f.bpp[0] < 24) cm &= bnot(CAP.AFBC_SPLITBLK);
    }
    return [pc == null ? null : pc & pm, cc == null ? null : cc & cm];
  }

  function get_alloc_type(format_ext, f, usage) { // bufferallocation.cpp:152
    const t = { primary_type: AllocBaseType.UNCOMPRESSED, is_multi_plane: f.npln > 1, is_tiled: false,
      is_padded: false, is_frontbuffer_safe: false, ok: true, log: [] };
    if (format_ext & AFBCENABLE_MASK) {
      if (f.is_yuv && (format_ext & MOD.AFBC_YUV_TRANSFORM)) t.log.push({ msg: 'W: YUV transform incorrectly enabled for YUV', cite: C(P.ALLOC, 170) });
      t.primary_type = AllocBaseType.AFBC;
      if (format_ext & MOD.AFBC_WIDEBLK) t.primary_type = AllocBaseType.AFBC_WIDEBLK;
      else if (format_ext & MOD.AFBC_EXTRAWIDEBLK) t.primary_type = AllocBaseType.AFBC_EXTRAWIDEBLK;
      if (format_ext & MOD.AFBC_TILED_HEADERS) {
        t.is_tiled = true;
        if (f.npln > 1 && (format_ext & MOD.AFBC_EXTRAWIDEBLK) === 0n) {
          t.log.push({ msg: 'W: Extra-wide AFBC must be signalled for multi-plane formats; falling back to single plane AFBC', cite: C(P.ALLOC, 192) });
          t.is_multi_plane = false;
        }
        if (format_ext & MOD.AFBC_DOUBLE_BODY) t.is_frontbuffer_safe = true;
      } else {
        if (f.npln > 1) t.log.push({ msg: 'W: Multi-plane AFBC is not supported without tiling; single plane AFBC', cite: C(P.ALLOC, 206) });
        t.is_multi_plane = false;
      }
      if (format_ext & MOD.AFBC_EXTRAWIDEBLK && !t.is_tiled) { t.ok = false; t.log.push({ msg: 'E: extra-wide without tiled headers', cite: C(P.ALLOC, 216) }); return t; }
      if (t.is_frontbuffer_safe && (format_ext & (MOD.AFBC_WIDEBLK | MOD.AFBC_EXTRAWIDEBLK))) t.log.push({ msg: 'E: Front-buffer safe not supported with wide/extra-wide block', cite: C(P.ALLOC, 223) });
      if (f.npln === 1 && format_ext & MOD.AFBC_WIDEBLK && format_ext & MOD.AFBC_EXTRAWIDEBLK) { t.ok = false; t.log.push({ msg: 'E: multiplane AFBC with single plane format', cite: C(P.ALLOC, 231) }); return t; }
      if (usage & U.MALI_GRALLOC_USAGE_AFBC_PADDING) t.is_padded = true;
    }
    t.is_afbc = t.primary_type !== AllocBaseType.UNCOMPRESSED;
    return t;
  }

  function get_supported_format(f, usage, p, c, pac, cac, caps, fl) { // formats.cpp:982
    const out = { base_format: f.value, format_ext: 0n, f_flags: 0, note: null };
    out.f_flags = is_format_supported(f, usage, p, c, pac, cac);
    if (out.f_flags === F_NONE && c & CO.GPU && c & CO.DPU) {
      const c2 = c & ~CO.DPU;
      let cc2 = get_consumer_caps(c2, caps, fl);
      cc2 = get_active_caps(f, p, c2, null, cc2)[1];
      out.f_flags = is_format_supported(f, usage, p, c2, pac, cc2);
      out.note = 'retried without DPU consumer (GPU fallback) :1009-1035';
    }
    if (out.f_flags & F_AFBC) {
      const af = get_afbc_format(f.value, usage, p, c, pac, cac);
      if ((usage & U.MALI_GRALLOC_USAGE_NO_AFBC) === U.MALI_GRALLOC_USAGE_NO_AFBC || af === BigInt(f.value)) out.f_flags &= ~F_AFBC;
      const at = get_alloc_type(af & EXT_MASK, f, usage);
      if (f.npln > 1 && at.is_multi_plane === false) out.f_flags &= ~F_AFBC;
      out.format_ext = af & EXT_MASK;
    }
    if ((out.f_flags & F_AFBC) === 0) out.format_ext = 0n;
    return out;
  }

  function comparable_components(o, n) { // formats.cpp:1093
    if (o.is_yuv && n.bps === o.bps) {
      if (total_components(n) === total_components(o)) return true;
      if (o.has_alpha && total_components(n) === 3 && n.is_yuv && !n.has_alpha) return true;
    } else if (o.is_rgb) {
      if (total_components(n) === total_components(o) && n.bpp[0] === o.bpp[0] && n.bps === o.bps) return true;
    } else {
      if (n.value === o.value) return true;
    }
    return false;
  }
  const is_format_compatible = (o, n) => n.hsub === o.hsub && n.vsub === o.vsub && n.is_rgb === o.is_rgb &&
    n.is_yuv === o.is_yuv && comparable_components(o, n); // :1150

  function grade_format(ext) { // formats.cpp:1177
    let g = 1;
    for (const k of ['AFBC_BASIC', 'AFBC_SPLITBLK', 'AFBC_WIDEBLK', 'AFBC_TILED_HEADERS', 'AFBC_EXTRAWIDEBLK',
      'AFBC_DOUBLE_BODY', 'AFBC_BCH', 'AFBC_YUV_TRANSFORM', 'AFBC_SPARSE']) if (ext & MOD[k]) g += 1;
    return g;
  }

  function get_best_format(req, usage, p, c, pac, cac, caps, fl, trace) { // formats.cpp:1228
    const rf = byId.get(req);
    const compat = order.filter((f) => is_format_compatible(rf, f));
    const cand = [];
    let n = 0, reqGrade = 0, best = 0, firstBest = 0n, reqFmt = 0n;
    for (const f of compat) {
      const s = get_supported_format(f, usage, p, c, pac, cac, caps, fl);
      const ok = s.f_flags !== F_NONE;
      const g = ok ? grade_format(s.format_ext) : 0;
      cand.push({ name: f.name, value: f.value, supported: ok, f_flags: s.f_flags, ext: s.format_ext, grade: g, note: s.note });
      if (ok && g) {
        n++;
        if (g > best) { best = g; firstBest = BigInt(s.base_format) | s.format_ext; }
        if (s.base_format === req) { reqGrade = g; reqFmt = BigInt(s.base_format) | s.format_ext; }
      }
    }
    let af = 0n, why = 'no supported compatible format';
    if (n > 0) {
      if (reqGrade !== best && (p & PR.CPU) === 0 && (c & CO.CPU) === 0) { af = firstBest; why = 'requested format not best and no CPU producer/consumer → first best compatible format'; }
      else if (reqGrade !== 0) { af = reqFmt; why = 'requested format kept'; }
      else why = 'requested format unsupported and CPU usage prevents substitution';
    }
    trace.push({ msg: `get_best_format: ${compat.length} compatible, ${n} supported; ${why}`, cite: C(P.FMTS, 1307) });
    return { alloc_format: af, candidates: cand };
  }

  /* get_internal_format  format_info.cpp:366 */
  function get_internal_format(base, map) {
    let internal = base;
    for (const h of D.hal_requests) {
      if (h.hal_value === base) {
        if (h.is_flex || map) internal = V[h.internal] != null ? V[h.internal] : 0;
        break;
      }
    }
    if (map && fmtIdx(internal) < 0) internal = 0;
    return internal;
  }

  /* get_base_format  formats.cpp:1365 */
  function get_base_format(req, usage, fl, trace) {
    let base = Number(BigInt(req) & FMT_MASK);
    const has = (x) => (usage & x) !== 0n;
    const cite = (l, m) => trace.push({ msg: m, cite: C(P.FMTS, l) });
    if (req === V.HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED) {
      const cons = get_consumers(usage), prods = get_producers(usage);
      if (has(U.GRALLOC_USAGE_HW_TEXTURE) || has(U.GRALLOC_USAGE_HW_COMPOSER)) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1385, 'IMPLEMENTATION_DEFINED + TEXTURE/COMPOSER → EXYNOS_YCbCr_420_SPN'); }
      else if ((prods & PR.CAM) && !(prods & PR.GPU) && cons === CO.MFC) {
        if (fl.prop_debug_vendor_gpu_record_sbwc) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN_SBWC; cite(1396, 'IMPLEMENTATION_DEFINED camera→MFC only, debug.vendor.gpu.record_sbwc=true → SPN_SBWC'); }
        else { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1398, 'camera→MFC, record_sbwc=false → SPN'); }
      }
      else if (get_consumers(usage) & CO.BIG) { base = V.HAL_PIXEL_FORMAT_GOOGLE_NV12_SP; cite(1403, 'IMPLEMENTATION_DEFINED + BIG consumer → GOOGLE_NV12_SP'); }
      else if (has(U.GRALLOC_USAGE_HW_VIDEO_ENCODER)) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1407, 'IMPLEMENTATION_DEFINED + VIDEO_ENCODER → SPN'); }
      else if (has(U.GRALLOC_USAGE_VIDEO_PRIVATE_DATA)) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1411, 'IMPLEMENTATION_DEFINED + VIDEO_PRIVATE_DATA → SPN'); }
      else if (has(U.GRALLOC_USAGE_HW_CAMERA_READ) && has(U.GRALLOC_USAGE_HW_CAMERA_WRITE)) { base = V.HAL_PIXEL_FORMAT_YCrCb_420_SP; cite(1416, 'IMPLEMENTATION_DEFINED camera read+write → YCrCb_420_SP (NV21)'); }
      else { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1420, 'IMPLEMENTATION_DEFINED default → SPN'); }
    } else if (req === V.HAL_PIXEL_FORMAT_YCbCr_420_888) {
      if (get_consumers(usage) & CO.BIG) { base = V.HAL_PIXEL_FORMAT_GOOGLE_NV12_SP; cite(1427, 'YCbCr_420_888 + BIG consumer → GOOGLE_NV12_SP'); }
      else if (has(U.GRALLOC_USAGE_HW_VIDEO_ENCODER | U.GRALLOC_USAGE_HW_VIDEO_DECODER)) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1431, 'YCbCr_420_888 + video → SPN'); }
      else if (has(U.GRALLOC_USAGE_HW_CAMERA_WRITE)) { base = V.HAL_PIXEL_FORMAT_YCrCb_420_SP; cite(1443, 'YCbCr_420_888 + camera write → YCrCb_420_SP (NV21)'); }
      else { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_420_SPN; cite(1447, 'YCbCr_420_888 default → SPN'); }
    } else if (req === V.HAL_PIXEL_FORMAT_YCBCR_P010) {
      if (get_consumers(usage) & CO.BIG) { base = V.HAL_PIXEL_FORMAT_GOOGLE_NV12_SP_10B; cite(1454, 'P010 + BIG consumer → GOOGLE_NV12_SP_10B'); }
      else if (has(U.GRALLOC_USAGE_HW_VIDEO_ENCODER | U.GRALLOC_USAGE_HW_VIDEO_DECODER)) { base = V.HAL_PIXEL_FORMAT_EXYNOS_YCbCr_P010_SPN; cite(1458, 'P010 + video → EXYNOS_YCbCr_P010_SPN'); }
    }
    const internal = get_internal_format(base, true);
    if (internal !== base) trace.push({ msg: `get_internal_format(0x${base.toString(16)}, true) → 0x${internal.toString(16)} (${nameOf(internal)})`, cite: C(P.FI, 366) });
    return internal;
  }

  function nameOf(id) { const f = byId.get(Number(id)); if (f) return f.name; for (const k in V) if (V[k] === Number(id)) return k; return '0x' + Number(id).toString(16); }

  /* mali_gralloc_select_format  formats.cpp:1482 */
  function select_format(req, usage, fl, trace) {
    const caps = ipCaps(fl);
    const res = { alloc_format: 0n, producers: 0, consumers: 0, producer_caps: 0n, consumer_caps: 0n, candidates: null, caps };
    const rb = get_base_format(req, usage, fl, trace);
    if (rb === 0 || fmtIdx(rb) < 0) { trace.push({ msg: 'E: Invalid base format', cite: C(P.FMTS, 1496) }); return res; }
    res.req_base = rb;
    if (isExynos(rb) || rb === V.HAL_PIXEL_FORMAT_BLOB) { res.alloc_format = BigInt(rb); trace.push({ msg: 'Exynos format or BLOB: allocate requested format as-is', cite: C(P.FMTS, 1509) }); return res; }
    if (usage === 0n) { res.alloc_format = BigInt(rb); trace.push({ msg: 'usage == 0: allocate as-is', cite: C(P.FMTS, 1513) }); return res; }
    const p = get_producers(usage), c = get_consumers(usage);
    res.producers = p; res.consumers = c;
    const pc = get_producer_caps(p, caps, fl);
    let cc;
    if (fl.GRALLOC_HWC_FB_DISABLE_AFBC && (usage & U.GRALLOC_USAGE_HW_FB)) { cc = CAP.OPTIONS_PRESENT; trace.push({ msg: 'GRALLOC_HWC_FB_DISABLE_AFBC: FB consumer caps = OPTIONS_PRESENT only', cite: C(P.FMTS, 1535) }); }
    else cc = get_consumer_caps(c, caps, fl);
    res.producer_caps = pc; res.consumer_caps = cc;
    trace.push({ msg: `producers=${listBits(p, PR)} consumers=${listBits(c, CO)}`, cite: C(P.FMTS, 1521) });
    if (p === 0 && c === 0) { trace.push({ msg: 'E: Producer and consumer not identified', cite: C(P.FMTS, 1548) }); return res; }
    const [pac, cac] = get_active_caps(byId.get(rb), p, c, pc, cc);
    res.producer_active_caps = pac; res.consumer_active_caps = cac;
    const b = get_best_format(rb, usage, p, c, pac, cac, caps, fl, trace);
    res.alloc_format = b.alloc_format; res.candidates = b.candidates;
    return res;
  }

  function listBits(v, table) { const o = []; for (const k in table) if (k !== 'VPUS' && (v & table[k])) o.push(k); return o.join('|') || 'none'; }

  /* ---------------- layout ---------------- */
  function get_afbc_sb_size_t(t) { // :104
    if (t === AllocBaseType.AFBC) return { w: 16, h: 16 };
    if (t === AllocBaseType.AFBC_WIDEBLK) return { w: 32, h: 8 };
    if (t === AllocBaseType.AFBC_EXTRAWIDEBLK) return { w: 64, h: 4 };
    return { w: 0, h: 0 };
  }
  const get_afbc_sb_size = (at, plane) => (plane > 0 && at.is_afbc && at.is_multi_plane) ? get_afbc_sb_size_t(AllocBaseType.AFBC_EXTRAWIDEBLK) : get_afbc_sb_size_t(at.primary_type); // :140

  function get_pixel_w_h(w, h, f, at, plane, has_cpu, steps) { // bufferallocation.cpp:317
    const sb = get_afbc_sb_size(at, plane);
    const push = (o) => steps.push(Object.assign(o, { w, h, phase: 'dims' }));
    push({ msg: `start from ${plane > 0 ? 'full' : 'requested'} size ${w}×${h}`, cite: C(P.ALLOC, 613) });
    const primary = plane === 0 || !f.planes_contiguous;
    if (primary) { w = ALIGN(w, f.align_w); h = ALIGN(h, f.align_h); push({ msg: `align to format align_w=${f.align_w}, align_h=${f.align_h} → ${w}×${h}`, cite: C(P.ALLOC, 334) }); }
    if (plane > 0) { w = Math.floor(w / f.hsub); h = Math.floor(h / f.vsub); push({ msg: `subsample ÷${f.hsub}/÷${f.vsub} → ${w}×${h}`, cite: C(P.ALLOC, 343) }); }
    let paw = 1, pah = 1;
    if (has_cpu && primary) { paw = f.align_w_cpu; push({ msg: `CPU usage: pixel_align_w = align_w_cpu = ${paw}`, cite: C(P.ALLOC, 354) }); }
    else if (at.is_afbc) {
      const nsb = (at.is_padded && !f.is_yuv) ? 4 : 0;
      paw = Math.max(0, nsb) * sb.w;
      let tw = sb.w, th = sb.h;
      if (at.is_tiled) { const m = f.bpp_afbc[plane] > 32 ? 4 : 8; tw *= m; th *= m; }
      paw = Math.max(paw, tw); pah = Math.max(pah, th);
      if (at.primary_type === AllocBaseType.AFBC_WIDEBLK && !at.is_tiled) pah = Math.max(pah, 16);
      push({ msg: `AFBC superblock ${sb.w}×${sb.h}${at.is_tiled ? ' (tiled header tile ' + tw + '×' + th + ')' : ''}: pixel_align ${paw}×${pah}`, cite: C(P.ALLOC, 367) });
    }
    const aw = Math.max(1, paw, f.tile_size), ah = Math.max(1, pah, f.tile_size);
    w = ALIGN(w, aw); h = ALIGN(h, ah);
    push({ msg: `final align to ${aw}×${ah} (incl. tile_size=${f.tile_size}) → ${w}×${h}`, cite: C(P.ALLOC, 400) });
    return [w, h];
  }

  function gcd(a, b) { if (a === b) return a; if (a < b) [a, b] = [b, a]; while (b !== 0) { const r = a % b; a = b; b = r; } return a; } // :405
  const lcm = (a, b) => (a !== 0 && b !== 0) ? (a * b) / gcd(a, b) : Math.max(a, b); // :431

  function align_plane_stride(pi, plane, f, sa) { // :563
    pi[plane].byte_stride = Math.floor(ALIGN(pi[plane].byte_stride * f.tile_size, sa) / f.tile_size);
    const bpp = f.bpp[plane];
    pi[plane].alloc_width = bpp ? Math.floor(pi[plane].byte_stride * 8 / bpp) : 0; // bpp==0 → C integer division by zero
    if (!bpp) pi[plane].div_by_zero = true;
  }

  const afbc_buffer_align = (tiled, s) => ALIGN(s, tiled ? 4096 : 1024); // :88

  function calc_allocation_size(width, height, at, f, has_cpu, has_hw, has_gpu, has_BIG, has_cam, fl) { // :589
    const pi = [0, 1, 2].map(() => ({ offset: 0, fd_idx: 0, size: 0, byte_stride: 0, alloc_width: 0, alloc_height: 0, steps: [] }));
    let size = 0;
    for (let plane = 0; plane < f.npln; plane++) {
      const s = pi[plane].steps;
      const rec = (o) => s.push(Object.assign(o, { w: pi[plane].alloc_width, h: pi[plane].alloc_height, stride: pi[plane].byte_stride, phase: 'stride' }));
      [pi[plane].alloc_width, pi[plane].alloc_height] = get_pixel_w_h(width, height, f, at, plane, has_cpu, s);
      if (at.is_afbc) {
        pi[plane].byte_stride = Math.floor(pi[plane].alloc_width * f.bpp_afbc[plane] / 8);
        rec({ msg: `AFBC byte_stride = ${pi[plane].alloc_width}×${f.bpp_afbc[plane]}/8 = ${pi[plane].byte_stride}`, cite: C(P.ALLOC, 630) });
      } else {
        pi[plane].byte_stride = Math.floor(pi[plane].alloc_width * f.bpp[plane] / 8);
        rec({ msg: `byte_stride = ${pi[plane].alloc_width}×${f.bpp[plane]}/8 = ${pi[plane].byte_stride}`, cite: C(P.ALLOC, 635) });
        let hw = 0;
        if (has_hw) { hw = f.is_yuv ? 16 : (f.is_rgb ? 64 : 0); rec({ msg: `HW usage: hw_align = ${hw} (${f.is_yuv ? 'YUV_BYTE_ALIGN_DEFAULT' : f.is_rgb ? 'RGB_BYTE_ALIGN_DEFAULT' : 'not RGB/YUV'})`, cite: C(P.ALLOC, 654) }); }
        if (has_gpu) { hw = Math.max(hw, 64); rec({ msg: `GPU usage: hw_align = max(hw_align, 64) = ${hw}`, cite: C(P.ALLOC, 667) }); }
        if (fl.SOC_ZUMA) {
          if (has_cam && [V.MALI_GRALLOC_FORMAT_INTERNAL_RAW10, V.MALI_GRALLOC_FORMAT_INTERNAL_RAW12, V.MALI_GRALLOC_FORMAT_INTERNAL_RAW16].includes(f.value)) { hw = Math.max(hw, 32); rec({ msg: `SOC_ZUMA camera RAW: hw_align = max(.,32) = ${hw}`, cite: C(P.ALLOC, 677) }); }
          if (has_cam && f.is_yuv) { hw = lcm(hw, 64); rec({ msg: `SOC_ZUMA camera YUV: hw_align = lcm(.,64) = ${hw}`, cite: C(P.ALLOC, 682) }); }
        }
        if (has_BIG) { hw = lcm(hw, 64); rec({ msg: `BIG usage: hw_align = lcm(.,64) = ${hw}`, cite: C(P.ALLOC, 688) }); }
        let cpu = 0;
        if (has_cpu && f.value !== V.MALI_GRALLOC_FORMAT_INTERNAL_RAW10) {
          const primary = plane === 0 || !f.planes_contiguous;
          if (primary) { cpu = Math.floor(f.bpp[plane] * f.align_w_cpu / 8); rec({ msg: `CPU usage: cpu_align = ${f.bpp[plane]}×${f.align_w_cpu}/8 = ${cpu}`, cite: C(P.ALLOC, 696) }); }
        }
        const sa = lcm(hw, cpu);
        if (sa) {
          align_plane_stride(pi, plane, f, sa);
          rec({ msg: `stride_align = lcm(${hw}, ${cpu}) = ${sa} → byte_stride ${pi[plane].byte_stride}, alloc_width ${pi[plane].alloc_width}`, cite: C(P.ALLOC, 703) });
        }
        if (f.value === V.MALI_GRALLOC_FORMAT_INTERNAL_YV12 && has_hw && has_cpu) { // :715 update_yv12_stride :452
          const luma = pi[0].byte_stride;
          pi[plane].byte_stride = plane === 0 ? ALIGN(luma, ALIGN(sa, 16)) : ALIGN(Math.floor(luma / 2), 16);
          rec({ msg: `YV12 realign: byte_stride = ${pi[plane].byte_stride}`, cite: C(P.ALLOC, 717) });
        }
      }
      const sb_num = Math.floor((pi[plane].alloc_width * pi[plane].alloc_height) / 256) >>> 0;
      let body = 0, header = 0;
      if (at.is_afbc) {
        const sb = get_afbc_sb_size(at, plane);
        const sbb = ALIGN(Math.floor(f.bpp_afbc[plane] * sb.w * sb.h / 8), 128);
        body = sb_num * sbb;
        rec({ msg: `AFBC body = ${sb_num} superblocks × ${sbb} B = ${body}`, cite: C(P.ALLOC, 737) });
        if (f.npln > 1 && plane < 2) { body = afbc_buffer_align(at.is_tiled, body); rec({ msg: `multi-plane: body aligned to ${at.is_tiled ? 4096 : 1024} → ${body}`, cite: C(P.ALLOC, 743) }); }
        if (at.is_frontbuffer_safe) { body += afbc_buffer_align(at.is_tiled, body); rec({ msg: `double body → ${body}`, cite: C(P.ALLOC, 750) }); }
        header = afbc_buffer_align(at.is_tiled, sb_num * 16);
        rec({ msg: `AFBC header = ALIGN(${sb_num}×16, ${at.is_tiled ? 4096 : 1024}) = ${header}`, cite: C(P.ALLOC, 776) });
      } else {
        if (has_BIG && plane && (f.value === V.HAL_PIXEL_FORMAT_GOOGLE_NV12_SP || f.value === V.HAL_PIXEL_FORMAT_GOOGLE_NV12_SP_10B)) {
          pi[plane].byte_stride = pi[0].byte_stride;
          rec({ msg: `BIG + GOOGLE_NV12_SP: chroma stride = luma stride = ${pi[0].byte_stride}`, cite: C(P.ALLOC, 760) });
        }
        body = pi[plane].byte_stride * pi[plane].alloc_height;
        rec({ msg: `body = ${pi[plane].byte_stride} × ${pi[plane].alloc_height} = ${body}`, cite: C(P.ALLOC, 762) });
      }
      if (plane > 0) pi[plane].offset = size;
      pi[plane].body = body; pi[plane].header = header;
      size += body + header;
    }
    return { planes: pi.slice(0, f.npln), all: pi, size };
  }

  /* ---------------- Exynos setup_* (exynos_format_allocation.h) ---------------- */
  const PLANE_SIZE = (w, h) => w * h;
  const S2B_PLANE_SIZE = (w, h) => ALIGN(Math.floor(w / 4), 16) * ALIGN(h, 16); // :23
  function placeSecond(pl, fd, n) { // common tail of the setup functions
    if (fd > 1) { pl[1].fd_idx = 1; if (n === 3) pl[2].fd_idx = 2; }
    else { pl[1].fd_idx = 0; pl[1].offset = pl[0].size; if (n === 3) { pl[2].fd_idx = 0; pl[2].offset = pl[0].size + pl[1].size; } }
  }
  const SETUP = {
    setup_420_sp(w, h, fd, pl) { // :164
      h = ALIGN(h, 2);
      Object.assign(pl[0], { size: PLANE_SIZE(w, h), alloc_width: w, alloc_height: h, byte_stride: w, fd_idx: 0 });
      Object.assign(pl[1], { size: PLANE_SIZE(w, h / 2), alloc_width: w, alloc_height: h / 2, byte_stride: w });
      placeSecond(pl, fd, 2); return 2;
    },
    setup_420_sp_s10b(w, h, fd, pl) { // :196
      h = ALIGN(h, 2);
      const ext = fd === 1 ? 64 : 256;
      Object.assign(pl[0], { size: PLANE_SIZE(w, h) + S2B_PLANE_SIZE(w, h) + ext, alloc_width: w, alloc_height: h, byte_stride: w, fd_idx: 0 });
      Object.assign(pl[1], { size: PLANE_SIZE(w, h / 2) + S2B_PLANE_SIZE(w, h / 2) + ext, alloc_width: w, alloc_height: h / 2, byte_stride: w });
      placeSecond(pl, fd, 2); return 2;
    },
    setup_p010_sp(w, h, fd, pl) { // :238
      h = ALIGN(h, 2);
      Object.assign(pl[0], { size: PLANE_SIZE(w * 2, h), alloc_width: w, alloc_height: h, byte_stride: w * 2, fd_idx: 0 });
      Object.assign(pl[1], { size: PLANE_SIZE(w * 2, h / 2), alloc_width: w, alloc_height: h / 2, byte_stride: w * 2 });
      placeSecond(pl, fd, 2); return 2;
    },
    setup_420_p(w, h, fd, pl) { // :270
      w = ALIGN(w, 2); h = ALIGN(h, 2);
      Object.assign(pl[0], { size: PLANE_SIZE(w, h), alloc_width: w, alloc_height: h, byte_stride: w, fd_idx: 0 });
      const cw = ALIGN(w / 2, 16), ch = h / 2;
      Object.assign(pl[1], { size: PLANE_SIZE(cw, ch), alloc_width: cw, alloc_height: ch, byte_stride: cw });
      Object.assign(pl[2], { size: PLANE_SIZE(cw, ch), alloc_width: cw, alloc_height: ch, byte_stride: cw });
      placeSecond(pl, fd, 3); return 3;
    },
    setup_420_sp_tiled(w, h, fd, pl) { // :311
      w = ALIGN(w, 2); h = ALIGN(h, 2);
      Object.assign(pl[0], { size: PLANE_SIZE(w, h), alloc_width: w, alloc_height: h, byte_stride: w * 16, fd_idx: 0 });
      const ch = ALIGN(h / 2, 32);
      Object.assign(pl[1], { size: PLANE_SIZE(w, ch), alloc_width: w, alloc_height: ch, byte_stride: w * 16 });
      placeSecond(pl, fd, 2);
      return 3; // sic: exynos_format_allocation.h:341 returns 3 although only 2 planes are set
    },
  };
  const SBWC_SETUPS = ['setup_sbwc_420_sp', 'setup_sbwc_420_sp_10bit', 'setup_sbwc_420_sp_lossy', 'setup_sbwc_420_sp_10bit_lossy'];

  function prepare_exynos(desc, f, usage, trace) { // bufferallocation.cpp:852
    let w = desc.width, h = desc.height;
    const id = f.value;
    const fd = f.fd_count ? f.fd_count.fd_count : 1;
    const pl = [0, 1, 2].map(() => ({ offset: 0, fd_idx: 0, size: 0, byte_stride: 0, alloc_width: 0, alloc_height: 0, steps: [] }));
    const out = { planes: pl, fd_count: fd, plane_count: 2, alloc_sizes: [0, 0, 0], unknown: false, errors: [] };
    if (usage & (U.GRALLOC_USAGE_HW_VIDEO_ENCODER | U.GRALLOC_USAGE_HW_VIDEO_DECODER)) {
      usage |= U.GRALLOC_USAGE_VIDEO_PRIVATE_DATA;
      trace.push({ msg: 'video usage: add GRALLOC_USAGE_VIDEO_PRIVATE_DATA', cite: C(P.ALLOC, 865) });
    }
    const prep = f.exynos_prepare;
    if (!prep) { out.errors.push('invalid yuv format (default case)'); trace.push({ msg: 'E: invalid yuv format → return -1 (return value ignored by caller)', cite: C(P.ALLOC, 973) }); return out; }
    if (prep.align_w) { w = ALIGN(w, prep.align_w.value); trace.push({ msg: `w = ALIGN(w, ${prep.align_w.token}) = ${w}`, cite: C(P.ALLOC, prep.align_w.line) }); }
    if (prep.align_h) { h = ALIGN(h, prep.align_h.value); trace.push({ msg: `h = ALIGN(h, ${prep.align_h.token}) = ${h}`, cite: C(P.ALLOC, prep.align_h.line) }); }
    const scite = prep.setup_loc ? C(prep.setup_loc.file, prep.setup_loc.line) : C(P.EXA, 1);
    if (SBWC_SETUPS.includes(prep.setup)) {
      out.unknown = true;
      out.sbwc_setup = prep.setup;
      out.sbwc_rate = prep.args && prep.args.length === 5 ? Number(prep.args[2]) : null;
      out.plane_count = 2;
      // What *is* known from source: alloc_width/height and fd placement.
      const isLossy = prep.setup.includes('lossy');
      const hal = isLossy ? 8 : 16;
      pl[0].alloc_width = ALIGN(w, 32); pl[0].alloc_height = ALIGN(h, hal);
      pl[1].alloc_width = ALIGN(w, 32); pl[1].alloc_height = ALIGN(h, hal) / 2;
      pl[1].fd_idx = fd > 1 ? 1 : 0;
      trace.push({ msg: `${prep.setup}(): sizes/strides come from SBWC*_SIZE/STRIDE macros in <linux/videodev2_exynos_media.h> — NOT in this repo. alloc_width=ALIGN(w,32)=${pl[0].alloc_width}, alloc_height=ALIGN(h,${hal})=${pl[0].alloc_height} (__ALIGN_UP also external; assumed round-up)`, cite: scite });
    } else {
      out.plane_count = SETUP[prep.setup](w, h, fd, pl);
      trace.push({ msg: `${prep.setup}(w=${w}, h=${h}, fd_count=${fd}) → plane_count ${out.plane_count}`, cite: scite });
    }
    if (usage & (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_RENDER | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) {
      if (f.is_sbwc) {
        out.errors.push('using SBWC format with GPU is invalid (logged; return value ignored by caller, allocation continues)');
        trace.push({ msg: 'E: SBWC with GPU usage is invalid → return -1, but caller ignores it (bufferallocation.cpp:1112)', cite: C(P.ALLOC, 984) });
      } else {
        for (let i = 0; i < out.plane_count; i++) {
          if (pl[i].size === pl[i].byte_stride * pl[i].alloc_height) {
            align_plane_stride(pl, i, f, 64);
            pl[i].size = pl[i].byte_stride * pl[i].alloc_height;
            trace.push({ msg: `GPU: plane ${i} stride aligned to 64 → byte_stride ${pl[i].byte_stride}, size ${pl[i].size}${pl[i].div_by_zero ? ' (bpp=0: integer division by zero in C)' : ''}`, cite: C(P.ALLOC, 998) });
          } else {
            trace.push({ msg: `E: plane ${i} size ${pl[i].size} != byte_stride×alloc_height; stride not realigned`, cite: C(P.ALLOC, 1003) });
          }
        }
      }
    }
    if (!out.unknown) {
      for (let fi = 0; fi < fd; fi++) {
        let s = 0;
        for (let i = 0; i < out.plane_count; i++) if (pl[i].fd_idx === fi) s += pl[i].size;
        s += 1024;
        s = s < 4096 ? 4096 : s;
        out.alloc_sizes[fi] = s;
        trace.push({ msg: `fd ${fi}: Σplane sizes + 1024, min 4 KiB → ${s}`, cite: C(P.ALLOC, 1032) });
      }
    }
    return out;
  }

  /* ---------------- validate ---------------- */
  function validate_descriptor(desc, usage, trace) { // :518
    for (const [n, l] of [['DEPRECATED_MALI_GRALLOC_USAGE_FRONTBUFFER', 477], ['UNSUPPORTED_MALI_GRALLOC_USAGE_CUBE_MAP', 481], ['UNSUPPORTED_MALI_GRALLOC_USAGE_MIPMAP_COMPLETE', 485]]) {
      if (U[n] && usage & U[n]) { trace.push({ msg: `E: ${n} present → descriptor rejected`, cite: C(P.ALLOC, l) }); return false; }
    }
    if (usage & (0xFFFEn << 32n)) { trace.push({ msg: 'E: INVALID_USAGE bits (0xFFFE<<32) set', cite: C(P.ALLOC, 524) }); return false; }
    if (desc.hal_format !== V.MALI_GRALLOC_FORMAT_INTERNAL_BLOB) {
      let lim = Math.floor(400 * (1 << 20) / 4 / desc.layer_count);
      if (desc.width > lim) { trace.push({ msg: 'E: width too big (validate_size)', cite: C(P.ALLOC, 504) }); return false; }
      lim = Math.floor(lim / desc.width);
      if (desc.height > lim) { trace.push({ msg: 'E: height too big (validate_size)', cite: C(P.ALLOC, 510) }); return false; }
    }
    return true;
  }

  function validate_format(f, at, desc, trace) { // :804
    if (at.is_afbc) {
      if (!f.afbc) { trace.push({ msg: 'E: AFBC selected but not supported for base format', cite: C(P.ALLOC, 815) }); return false; }
      if ((f.npln === 1 && at.is_multi_plane) || (f.npln > 1 && !at.is_multi_plane)) { trace.push({ msg: 'E: plane count incompatible with single/multi-plane AFBC', cite: C(P.ALLOC, 827) }); return false; }
    } else if (!f.linear) { trace.push({ msg: 'E: Uncompressed format requested but not supported (linear=false)', cite: C(P.ALLOC, 836) }); return false; }
    if (f.value === V.MALI_GRALLOC_FORMAT_INTERNAL_BLOB && desc.height !== 1) { trace.push({ msg: 'E: Height for format BLOB must be 1', cite: C(P.ALLOC, 845) }); return false; }
    return true;
  }

  /* ---------------- full allocation: mali_gralloc_buffer_allocate + derive ---------------- */
  function allocate(desc, flags) {
    const fl = Object.assign({}, DEFAULT_FLAGS, flags || {});
    const trace = [];
    let usage = BigInt(desc.usage);
    const r = { ok: false, trace, input_usage: usage };
    // mali_gralloc_buffer_allocate :1214
    if ((usage & (U.GRALLOC_USAGE_HW_VIDEO_DECODER | U.GRALLOC_USAGE_HW_VIDEO_ENCODER)) && (usage & U.GRALLOC_USAGE_GOOGLE_IP_BIG)) {
      const before = usage;
      if (usage & U.GRALLOC_USAGE_SW_READ_OFTEN) { usage &= bnot(U.GRALLOC_USAGE_SW_READ_OFTEN); usage |= U.GRALLOC_USAGE_SW_READ_RARELY; }
      if (usage & U.GRALLOC_USAGE_SW_WRITE_OFTEN) { usage &= bnot(U.GRALLOC_USAGE_SW_WRITE_OFTEN); usage |= U.GRALLOC_USAGE_SW_WRITE_RARELY; }
      if (before !== usage) trace.push({ msg: 'update_usage_for_BIG: CPU *_OFTEN → *_RARELY', cite: C(P.ALLOC, 549) });
    }
    r.usage = usage;
    // derive :1045
    if (!validate_descriptor(desc, usage, trace)) { r.error = '-EINVAL (validate_descriptor)'; return r; }
    const sel = select_format(desc.hal_format, usage, fl, trace);
    r.selection = sel;
    r.alloc_format = sel.alloc_format;
    const base = Number(sel.alloc_format & FMT_MASK);
    if (sel.alloc_format === 0n) { r.error = '-EINVAL (unsupported format/usage)'; trace.push({ msg: 'E: Unrecognized and/or unsupported format and usage', cite: C(P.ALLOC, 1082) }); return r; }
    const f = byId.get(base);
    r.format = f;
    if (isExynos(base) && f.fd_count && f.fd_count.fd_count !== 1) trace.push({ msg: 'W: Multi-fd formats have been deprecated', cite: C(P.ALLOC, 1072) });
    const at = get_alloc_type(sel.alloc_format & EXT_MASK, f, usage);
    r.alloc_type = at;
    trace.push(...at.log);
    if (!at.ok) { r.error = '-EINVAL (get_alloc_type)'; return r; }
    if (!validate_format(f, at, desc, trace)) { r.error = '-EINVAL (validate_format)'; return r; }
    let planes, alloc_sizes = [0, 0, 0], fd_count = 1, plane_count = f.npln;
    if (isExynos(base)) {
      trace.push({ msg: 'Exynos path: prepare_descriptor_exynos_formats', cite: C(P.ALLOC, 1112) });
      const ex = prepare_exynos(desc, f, usage, trace);
      planes = ex.planes; alloc_sizes = ex.alloc_sizes; fd_count = ex.fd_count; plane_count = ex.plane_count;
      r.unknown = ex.unknown; r.sbwc_setup = ex.sbwc_setup; r.sbwc_rate = ex.sbwc_rate; r.exynos_errors = ex.errors;
    } else {
      let [w, h] = adjust_dimensions(sel.alloc_format, usage, desc.width, desc.height, trace);
      r.adjusted = { width: w, height: h };
      const has_cpu = (usage & (U.GRALLOC_USAGE_SW_READ_MASK | U.GRALLOC_USAGE_SW_WRITE_MASK)) !== 0n;
      const has_hw = (usage & bnot(U.PRIVATE_MASK | U.GRALLOC_USAGE_SW_READ_MASK | U.GRALLOC_USAGE_SW_WRITE_MASK)) !== 0n;
      const has_gpu = (usage & (U.GRALLOC_USAGE_HW_TEXTURE | U.GRALLOC_USAGE_HW_RENDER | U.GRALLOC_USAGE_GPU_DATA_BUFFER)) !== 0n;
      const has_BIG = (usage & (U.GRALLOC_USAGE_HW_VIDEO_ENCODER | U.GRALLOC_USAGE_HW_VIDEO_DECODER)) !== 0n && (usage & U.GRALLOC_USAGE_GOOGLE_IP_BIG) !== 0n;
      const has_cam = (usage & (U.GRALLOC_USAGE_HW_CAMERA_WRITE | U.GRALLOC_USAGE_HW_CAMERA_READ)) !== 0n;
      r.has = { cpu: has_cpu, hw: has_hw, gpu: has_gpu, BIG: has_BIG, camera: has_cam };
      trace.push({ msg: `Generic path: calc_allocation_size(${w}×${h}) has_cpu=${has_cpu} has_hw=${has_hw} has_gpu=${has_gpu} has_BIG=${has_BIG} has_camera=${has_cam}`, cite: C(P.ALLOC, 1128) });
      const cs = calc_allocation_size(w, h, at, f, has_cpu, has_hw, has_gpu, has_BIG, has_cam, fl);
      planes = cs.all; alloc_sizes[0] = cs.size;
    }
    r.pixel_stride = (base === V.MALI_GRALLOC_FORMAT_INTERNAL_RAW12 || base === V.MALI_GRALLOC_FORMAT_INTERNAL_RAW10) ? planes[0].byte_stride : planes[0].alloc_width; // :1143
    trace.push({ msg: `pixel_stride = ${r.pixel_stride}`, cite: C(P.ALLOC, 1143) });
    const layers = desc.layer_count || 1;
    r.single_layer_size = alloc_sizes[0];
    if (layers > 1) {
      if (sel.alloc_format & AFBCENABLE_MASK) alloc_sizes[0] = ALIGN(alloc_sizes[0], (sel.alloc_format & MOD.AFBC_TILED_HEADERS) ? 4096 : 128);
      alloc_sizes[0] *= layers;
      trace.push({ msg: `layer_count ${layers}: alloc_sizes[0] = ${alloc_sizes[0]}`, cite: C(P.ALLOC, 1175) });
    }
    if (!r.unknown) {
      alloc_sizes[0] += 256;
      trace.push({ msg: `+ EXT_SIZE (256, "MFC requires EXT_SIZE padding") → alloc_sizes[0] = ${alloc_sizes[0]}`, cite: C(P.ALLOC, 1179) });
      if ((usage & U.GRALLOC_USAGE_HW_VIDEO_ENCODER) && (usage & U.GRALLOC_USAGE_GOOGLE_IP_BW)) {
        alloc_sizes[0] += 16 * 1024;
        trace.push({ msg: `+ BW_EXT_SIZE (16 KiB) → ${alloc_sizes[0]}`, cite: C(P.ALLOC, 1184) });
      }
    } else {
      trace.push({ msg: 'alloc_sizes unknown (SBWC); EXT_SIZE +256 would follow', cite: C(P.ALLOC, 1179) });
    }
    r.planes = planes.slice(0, Math.max(plane_count, 1));
    r.plane_count = plane_count;
    r.fd_count = fd_count;
    r.alloc_sizes = alloc_sizes.slice(0, fd_count);
    r.total = r.unknown ? null : r.alloc_sizes.reduce((a, b) => a + b, 0);
    r.heap = select_dmabuf_heap(usage, desc.placeholder);
    r.dataspace = get_format_dataspace(f, desc.width, desc.height);
    r.drm_modifier = drm_modifier(sel.alloc_format, at.is_multi_plane && f.npln > 1);
    r.lockable = (sel.alloc_format & EXT_MASK) === 0n;
    r.ok = true;
    return r;
  }

  /* select_dmabuf_heap  mali_gralloc_ion.cpp:82 (heap availability is runtime-dependent) */
  function select_dmabuf_heap(usage, placeholder) {
    if (placeholder) return { name: 'system', cite: C(P.ION, 213), note: 'placeholder buffer: 1 byte' };
    const P_ = U.GRALLOC_USAGE_PROTECTED, CW = U.GRALLOC_USAGE_HW_CAMERA_WRITE, CR = U.GRALLOC_USAGE_HW_CAMERA_READ,
      TI = U.GS101_GRALLOC_USAGE_TPU_INPUT, TO = U.GS101_GRALLOC_USAGE_TPU_OUTPUT, FE = U.GS101_GRALLOC_USAGE_FACEAUTH_RAW_EVAL,
      CO_ = U.GRALLOC_USAGE_HW_COMPOSER, TX = U.GRALLOC_USAGE_HW_TEXTURE, RE = U.GRALLOC_USAGE_HW_RENDER, FB = U.GRALLOC_USAGE_HW_FB;
    const fbsec = 'framebuffer-secure (or vframe-secure if unavailable)';
    const exact = [
      [P_ | CW | CR | FE, 'faeval-secure', 93], [P_ | CW | TI, 'faimg-secure', 98], [P_ | CW | CR, 'farawimg-secure', 102],
      [P_ | CW | CO_ | TX, 'faprev-secure', 106], [P_ | TI, 'famodel-secure', 111], [P_ | TO | TI, 'faceauth_tpu-secure', 115],
      [P_ | TX | RE | CO_ | FB, fbsec, 120], [P_ | TX | RE | CO_, fbsec, 126],
    ];
    for (const [bits, name, l] of exact) if (bits !== undefined && usage === bits) return { name, cite: C(P.ION, l), match: 'exact' };
    const often = (usage & U.GRALLOC_USAGE_SW_READ_MASK) === U.GRALLOC_USAGE_SW_READ_OFTEN;
    const inexact = [
      [P_ | TX, 'vframe-secure', 136], [P_ | RE, 'vframe-secure', 140], [P_ | CO_, 'vscaler-secure', 146], [P_, 'vframe-secure', 152],
      [U.GRALLOC_USAGE_SENSOR_DIRECT_DATA, 'sensor_direct_heap', 158], [CW, 'cam', 164], [CR, 'cam', 170], [0n, 'sys', 176],
    ];
    for (const [bits, name, l] of inexact) {
      if ((usage & bits) === bits) {
        if (name === 'cam') return { name: often ? 'gcma_camera (or system if gcma_camera-uncached is unavailable)' : 'gcma_camera-uncached (or system-uncached if unavailable)', cite: C(P.ION, l), match: 'subset', note: often ? 'SW_READ_OFTEN → cached variant (:194-199)' : null };
        if (name === 'sys') return { name: often ? 'system' : 'system-uncached', cite: C(P.ION, l), match: 'catch-all', note: 'heap name constants from external libdmabufheap' + (often ? '; SW_READ_OFTEN → cached system heap (:197-199)' : '') };
        return { name, cite: C(P.ION, l), match: 'subset' };
      }
    }
    return { name: '', cite: C(P.ION, 205) };
  }

  /* get_format_dataspace  format_info.cpp:393 (returns symbolic names) */
  function get_format_dataspace(f, w, h) {
    if (f.is_yuv) {
      if (f.bps >= 10) return { standard: 'BT2020', range: 'FULL', cite: C(P.FI, 427) };
      if (w < 1280 || h < 720) return { standard: 'BT601_625', range: 'LIMITED', cite: C(P.FI, 432) };
      return { standard: 'BT709', range: 'LIMITED', cite: C(P.FI, 420) };
    }
    if (f.is_rgb) return { standard: 'UNKNOWN', range: '', cite: C(P.FI, 441) };
    return { standard: 'UNKNOWN', range: '', cite: C(P.FI, 403) };
  }

  /* drm_modifier_from_handle  drmutils.cpp:117 (symbolic) */
  function drm_modifier(af, multi) {
    if ((af & AFBCENABLE_MASK) === 0n) return null;
    const m = [];
    if (af & MOD.AFBC_SPLITBLK) m.push('SPLIT');
    if (af & MOD.AFBC_TILED_HEADERS) m.push('TILED');
    if (af & MOD.AFBC_DOUBLE_BODY) m.push('DB');
    if (af & MOD.AFBC_BCH) m.push('BCH');
    if (af & MOD.AFBC_YUV_TRANSFORM) m.push('YTR');
    if (af & MOD.AFBC_SPARSE) m.push('SPARSE');
    if (af & MOD.AFBC_WIDEBLK) m.push(multi ? 'BLOCK_SIZE_32x8_64x4' : 'BLOCK_SIZE_32x8');
    else if (af & MOD.AFBC_EXTRAWIDEBLK) m.push('BLOCK_SIZE_64x4');
    else m.push('BLOCK_SIZE_16x16');
    return 'DRM_FORMAT_MOD_ARM_AFBC(' + m.join(' | ') + ')';
  }

  function modNames(af) { const o = []; for (const k in MOD) if (af & MOD[k]) o.push(k); return o; }

  global.GrallocEngine = {
    init, allocate, select_format, dataspace: get_format_dataspace, get_producers, get_consumers, ipCaps, select_dmabuf_heap,
    DEFAULT_FLAGS, MOD, CAP, PR, CO, modNames, nameOf, listBits, ALIGN, U: () => U, V: () => V, byId: () => byId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
