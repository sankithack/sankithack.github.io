/*
 * usecases.js — "Use cases" tab: everyday Android scenarios and what gralloc does for each.
 *
 * Two kinds of information, kept apart on the page:
 *   - The scenario and its typical request (format + usage bits) are ANDROID BACKGROUND:
 *     what framework components usually ask for. They are not defined in this repo.
 *   - Everything gralloc does with that request — producers/consumers, chosen format,
 *     modifiers, layout, size, heap, lockability — is COMPUTED by engine.js, the port of
 *     the gchips code, and cited. Where the gchips source itself mentions the scenario
 *     (comments, heap names), that comment is quoted with its file:line.
 */
(function () {
  'use strict';
  const G = window.GX;
  const { esc, src, L, P, byName, shortName, badge, fmt, state, E, U, V } = G;
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ION = P.ION, FMTS = P.FMTS, ALLOC = P.ALLOC, ACC = P.ACC, USG = P.USG, REF = P.REF;

  // IP names exactly as defined in the source comment (mali_gralloc_formats.cpp:34-41) + Google video IPs.
  const IP = {
    CPU: ['CPU', 'Software access'], GPU: ['GPU', 'Graphics processor'], DPU: ['DPU', 'Display processor'],
    VPU: ['VPU', 'Video processor'], CAM: ['CAM', 'Camera ISP'], TPU: ['TPU', 'ML accelerator'],
    BIG: ['BIG', 'Google video IP (BigOcean/BigWave)'], MFC: ['MFC', 'Samsung video codec'],
  };
  const IP_CITE = L(FMTS, 34, 41);
  const IP_ICON = { CPU: '⌨', GPU: '◆', DPU: '▭', VPU: '▶', CAM: '◉', TPU: '✦', BIG: '▶', MFC: '▶' };

  const UC = [
    {
      id: 'app-window', title: 'An app draws its UI', icon: '📱',
      story: 'An app renders its window with the GPU; SurfaceFlinger then shows it, either by handing the buffer to the display hardware as an overlay or by sampling it as a texture.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', w: 1080, h: 2400, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER'],
      notes: [['GPU and DPU are both consumers when COMPOSER is combined with TEXTURE (“the GPU and DPU both act as compositors”).', L(FMTS, 142, 151)],
        ['If AFBC is chosen the app cannot lock the buffer for CPU drawing.', L(ACC, 149, 156)]],
      tryFlags: true,
    },
    {
      id: 'camera-preview', title: 'Camera preview on screen', icon: '📷',
      story: 'The camera HAL streams preview frames into buffers that the display (and sometimes the GPU) shows directly. The app asks for IMPLEMENTATION_DEFINED and lets gralloc choose.',
      req: 'HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', w: 1920, h: 1080, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['IMPLEMENTATION_DEFINED with TEXTURE or COMPOSER becomes the Exynos single-fd NV12 variant.', L(FMTS, 1383, 1386)]],
    },
    {
      id: 'photo-yuv', title: 'Taking a photo (YUV for processing)', icon: '🖼',
      story: 'For a still capture the camera writes a full-resolution YUV frame that the camera app / photo pipeline reads on the CPU before JPEG encoding.',
      req: 'HAL_PIXEL_FORMAT_YCbCr_420_888', w: 4032, h: 3024, read: 'often', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE'],
      notes: [['The source lists the camera scenarios this rule must be tested with: “1. Camera capture and initial photo processing … 5. Capture and resize - use chat app to capture a photo”.', L(FMTS, 1435, 1442)],
        ['Camera writes use the camera GCMA heap; with SW_READ_OFTEN the cached variant.', L(ION, 163, 173)]],
    },
    {
      id: 'photo-jpeg', title: 'Taking a photo (JPEG output)', icon: '🗜',
      story: 'The compressed JPEG produced by the camera is delivered in a BLOB buffer: one row of bytes, read by the app on the CPU.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_BLOB', w: 6 * 1024 * 1024, h: 1, read: 'often', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE'],
      notes: [['BLOB must have height 1.', L(ALLOC, 842, 847)], ['BLOB is allocated as requested, skipping format selection.', L(FMTS, 1509, 1512)]],
    },
    {
      id: 'video-record', title: 'Recording a video', icon: '🎥',
      story: 'While recording, camera frames go straight to the hardware video encoder. Nothing else reads them.',
      req: 'HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', w: 3840, h: 2160, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'GRALLOC_USAGE_HW_VIDEO_ENCODER'],
      notes: [['“Allocated camera buffer is SBWC compressed when 1. Camera is one of the producers 2. GPU is not one of the producers 3. MFC is the sole consumer” (controlled by debug.vendor.gpu.record_sbwc, default true).', L(FMTS, 1387, 1400)],
        ['VIDEO_ENCODER without a Google IP bit means the MFC encoder (“Support 64-bits usage version for GraphicBufferSource” TODO).', L(FMTS, 78, 94)]],
    },
    {
      id: 'video-play', title: 'Playing a video (YouTube, gallery)', icon: '🎬',
      story: 'The hardware decoder writes decoded frames; SurfaceFlinger shows them through the display hardware or the GPU.',
      req: 'HAL_PIXEL_FORMAT_YCbCr_420_888', w: 1920, h: 1080, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['YCbCr_420_888 with video usage becomes EXYNOS_YCbCr_420_SPN.', L(FMTS, 1429, 1432)],
        ['Exynos formats used by codecs get VIDEO_PRIVATE_DATA added.', L(ALLOC, 863, 868)]],
    },
    {
      id: 'video-big', title: 'Playing video on Google’s video IP', icon: '🎞',
      story: 'On Tensor devices the Google video block (BigOcean / BigWave) can be the decoder; the client signals it with the GOOGLE_IP_BIG private usage bit.',
      req: 'HAL_PIXEL_FORMAT_YCbCr_420_888', w: 3840, h: 2160, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_GOOGLE_IP_BIG', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['BIG decoder → producer BIG; CPU *_OFTEN would be rewritten to *_RARELY (“BO/BW cannot use the flags CPU_READ_RARELY as Codec layer redefines those flags”).', L(ALLOC, 541, 561)],
        ['Byte stride is aligned with lcm(…, 64) for BIG.', L(ALLOC, 686, 689)]],
    },
    {
      id: 'video-hdr', title: 'HDR (10-bit) video playback', icon: '🌈',
      story: 'HDR10 content is decoded into a 10-bit YUV buffer (P010) and shown on the display.',
      req: 'HAL_PIXEL_FORMAT_YCBCR_P010', w: 3840, h: 2160, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['P010 with video usage becomes EXYNOS_YCbCr_P010_SPN.', L(FMTS, 1456, 1459)],
        ['10-bit YUV defaults to the BT2020 / full-range dataspace.', L(P.FI, 423, 429)]],
    },
    {
      id: 'drm-video', title: 'Protected (DRM) video, e.g. a paid movie', icon: '🔒',
      story: 'Protected content is decoded into secure memory that the CPU must never see; only the display hardware reads it.',
      req: 'HAL_PIXEL_FORMAT_YCbCr_420_888', w: 3840, h: 2160, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_PROTECTED', 'GRALLOC_USAGE_HW_VIDEO_DECODER', 'GRALLOC_USAGE_HW_COMPOSER'],
      notes: [['PROTECTED + COMPOSER (no GPU) selects the vscaler-secure heap.', L(ION, 145, 149)],
        ['Protected buffers are never mapped for the CPU (unless PRIVATE_NONSECURE).', L(ION, 494, 499)]],
    },
    {
      id: 'screenshot', title: 'Taking a screenshot', icon: '✂',
      story: 'SurfaceFlinger renders the screen into an RGBA buffer with the GPU, then the system reads it on the CPU to save a PNG.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', w: 1080, h: 2400, read: 'often', write: 'none',
      bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['A CPU consumer prevents substituting another format and keeps the buffer lockable.', L(FMTS, 1312, 1314)]],
      tryFlags: true,
    },
    {
      id: 'screen-record', title: 'Screen recording / casting', icon: '📡',
      story: 'The display composes the screen into a buffer that is fed to the video encoder (virtual display).',
      req: 'HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', w: 1920, h: 1080, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_VIDEO_ENCODER'],
      notes: [['“DPU is normally consumer however, when there is an alternative consumer (VPU) and no other producer, it acts as a producer.”', L(FMTS, 217, 225)]],
    },
    {
      id: 'faceauth', title: 'Face unlock', icon: '🙂',
      story: 'Face authentication streams camera frames into secure buffers that only the camera ISP and the on-chip ML accelerator (TPU) can access.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RAW10', w: 1280, h: 960, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_PROTECTED', 'GRALLOC_USAGE_HW_CAMERA_WRITE', 'GS101_GRALLOC_USAGE_TPU_INPUT'],
      notes: [['Exact usage PROTECTED | CAMERA_WRITE | TPU_INPUT selects the “isp_image_heap” faimg-secure.', L(ION, 98, 101)],
        ['The repo defines six FaceAuth heaps (faeval, faimg, farawimg, faprev, famodel, faceauth_tpu).', L(ION, 54, 59)]],
      noteReq: 'The RAW10 request is illustrative: the repo defines the FaceAuth heaps by usage only, not the format used.',
    },
    {
      id: 'ml-model', title: 'Loading an ML model', icon: '🧠',
      story: 'Large blobs of model weights are shared with accelerators as gralloc BLOB buffers.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_BLOB', w: 256 * 1024 * 1024, h: 1, read: 'often', write: 'often',
      bits: [],
      notes: [['“BLOB formats are used for some ML models whose size can be really large (up to 2GB)” — so BLOB skips the 400 MB size check.', L(ALLOC, 532, 536)]],
    },
    {
      id: 'sensor', title: 'Sensor direct channel', icon: '🧭',
      story: 'High-rate sensor data (e.g. accelerometer) is written by the sensor hub directly into shared memory.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_BLOB', w: 4096, h: 1, read: 'often', write: 'none',
      bits: ['GRALLOC_USAGE_SENSOR_DIRECT_DATA'],
      notes: [['SENSOR_DIRECT_DATA selects sensor_direct_heap.', L(ION, 157, 161)]],
    },
    {
      id: 'video-call', title: 'Video call (preview + encode)', icon: '📞',
      story: 'In a video call the same camera frames are shown on screen and sent to the video encoder at the same time.',
      req: 'HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED', w: 1280, h: 720, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_VIDEO_ENCODER'],
      notes: [['TEXTURE/COMPOSER is checked first, so the buffer is the plain single-fd NV12 variant rather than SBWC.', L(FMTS, 1383, 1386)],
        ['SBWC would need the MFC encoder to be the only consumer; here the GPU and display also read the frames.', L(FMTS, 1387, 1394)]],
    },
    {
      id: 'raw-capture', title: 'Shooting a RAW (DNG) photo', icon: '🎞',
      story: 'Pro camera apps capture the unprocessed sensor data as RAW16 and read it on the CPU to write a DNG file.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RAW16', w: 4032, h: 3024, read: 'often', write: 'none',
      bits: ['GRALLOC_USAGE_HW_CAMERA_WRITE'],
      notes: [['RAW16 is reported to clients as DRM_FORMAT_R16.', L(P.DRM, 32)],
        ['On zuma builds the camera ISP needs a 32-byte aligned stride for RAW buffers (“Camera ISP requires RAW buffers to have 32-byte aligned stride”).', L(ALLOC, 670, 678)]],
    },
    {
      id: 'hdr-game', title: 'HDR game rendering (16-bit float colour)', icon: '🎮',
      story: 'A game renders in half-float RGBA (FP16) for HDR and hands frames to SurfaceFlinger.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_16161616', w: 2400, h: 1080, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER'],
      notes: [['The display cannot read RGBA_16161616 (dpu_rd = F_NONE), so gralloc retries the check with the GPU as the only consumer.', L(FMTS, 1009, 1035)],
        ['AFBC for FP16 needs the AFBC_RGBA16161616 capability; otherwise the format is forced to linear. No IP sets that capability in this repo.', L(FMTS, 646, 657)]],
      tryFlags: true,
    },
    {
      id: 'texture-array', title: 'A 6-layer texture array (e.g. skybox)', icon: '🧊',
      story: 'A 3D app uploads six 512×512 images as one layered texture, writing them on the CPU and sampling them on the GPU.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', w: 512, h: 512, layers: 6, read: 'none', write: 'often',
      bits: ['GRALLOC_USAGE_HW_TEXTURE'],
      notes: [['Each layer is sized like a single image, then the size is multiplied by layer_count (with extra alignment for AFBC).', L(ALLOC, 1153, 1176)],
        ['Asking for a real cube map (GPU_CUBE_MAP usage) is rejected: “BufferUsage::GPU_CUBE_MAP is unsupported”.', L(ALLOC, 481, 484)]],
    },
    {
      id: 'stylus', title: 'Low-latency stylus drawing (front buffer)', icon: '✏',
      story: 'Note-taking apps draw stylus strokes into the buffer that is currently on screen (front-buffer rendering) to cut latency.',
      req: 'MALI_GRALLOC_FORMAT_INTERNAL_RGBA_8888', w: 1080, h: 2400, read: 'none', write: 'none',
      bits: ['GRALLOC_USAGE_HW_RENDER', 'GRALLOC_USAGE_HW_TEXTURE', 'GRALLOC_USAGE_HW_COMPOSER', 'GRALLOC_USAGE_FRONT_BUFFER'],
      notes: [['With FRONT_BUFFER, AFBC is only allowed if producers and consumers support AFBC_DOUBLE_BODY (front-buffer-safe AFBC).', L(FMTS, 629, 635)],
        ['None of the IP capability masks in this repo include AFBC_DOUBLE_BODY, so front buffers stay uncompressed even with GPU AFBC on.', L('gralloc4/src/capabilities/src/gralloc_capabilities.cpp', 42, 145)]],
      tryFlags: true,
    },
  ];

  const ucState = { id: UC[0].id, gpuAfbc: false };
  let tourTimer = null;
  function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; } }

  function usageOf(uc) {
    return G.usageValue({ read: uc.read, write: uc.write, bits: uc.bits.slice() });
  }
  function flagsFor() {
    if (!ucState.gpuAfbc) return state.flags;
    return Object.assign({}, state.flags, { MALI_GPU_SUPPORT_AFBC_BASIC: true, MALI_GPU_SUPPORT_AFBC_YUV_WRITE: true, MALI_GPU_SUPPORT_AFBC_SPLITBLK: true, MALI_GPU_SUPPORT_AFBC_WIDEBLK: true, MALI_GPU_SUPPORT_AFBC_TILED_HEADERS: true });
  }
  const bitsOf = (v, table) => Object.keys(table).filter((k) => k !== 'VPUS' && (v & table[k]));

  /* Animated pipeline: producers → buffer → consumers (computed from usage). */
  function pipeline(uc, r, u) {
    const prods = bitsOf(E.get_producers(u), E.PR), cons = bitsOf(E.get_consumers(u), E.CO);
    const W = 760, H = Math.max(150, 40 + 52 * Math.max(prods.length, cons.length, 1));
    const bx = 280, bw = 200, by = H / 2 - 50, bh = 100;
    const node = (x, y, k, side) => {
      const [name, desc] = IP[k] || [k, ''];
      return `<g class="ucnode"><rect x="${x}" y="${y}" width="170" height="42" rx="8" fill="var(--panel)" stroke="var(--accent)"/><text x="${x + 12}" y="${y + 27}" font-size="18">${IP_ICON[k] || '•'}</text><text x="${x + 36}" y="${y + 18}" font-size="13" font-weight="700" fill="currentColor">${name}</text><text x="${x + 36}" y="${y + 33}" font-size="11" fill="var(--muted)">${esc(desc)}</text><title>${side}: ${name} — ${desc}</title></g>`;
    };
    const ys = (n) => Array.from({ length: n }, (_, i) => (H - n * 52) / 2 + i * 52 + 5);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;color:var(--ink)" role="img" aria-label="producer to consumer pipeline"><defs><marker id="uah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--muted)"/></marker></defs>`;
    s += `<text x="10" y="14" font-size="11" fill="var(--muted)">writes (producers)</text><text x="${W - 180}" y="14" font-size="11" fill="var(--muted)">reads (consumers)</text>`;
    const py = ys(prods.length || 1), cy = ys(cons.length || 1);
    const paths = [];
    (prods.length ? prods : [null]).forEach((k, i) => {
      if (k) s += node(10, py[i], k, 'producer'); else s += `<text x="20" y="${py[i] + 26}" font-size="12" fill="var(--muted)">none identified</text>`;
      if (k) paths.push(`M180,${py[i] + 21} C230,${py[i] + 21} 230,${H / 2} ${bx},${H / 2}`);
    });
    (cons.length ? cons : [null]).forEach((k, i) => {
      if (k) s += node(W - 180, cy[i], k, 'consumer'); else s += `<text x="${W - 170}" y="${cy[i] + 26}" font-size="12" fill="var(--muted)">none identified</text>`;
      if (k) paths.push(`M${bx + bw},${H / 2} C${bx + bw + 50},${H / 2} ${W - 230},${cy[i] + 21} ${W - 180},${cy[i] + 21}`);
    });
    paths.forEach((d) => { s += `<path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" marker-end="url(#uah)" class="flowline"/>`; });
    // the buffer
    const fmtName = r.ok ? shortName(r.format.name) : 'allocation fails';
    const mods = r.ok ? E.modNames(r.alloc_format) : [];
    s += `<g class="ucbuf"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>
      <text x="${bx + bw / 2}" y="${by + 22}" text-anchor="middle" font-size="12" fill="var(--muted)">gralloc buffer</text>
      <text x="${bx + bw / 2}" y="${by + 44}" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${esc(fmtName.length > 26 ? fmtName.slice(0, 25) + '…' : fmtName)}</text>
      <text x="${bx + bw / 2}" y="${by + 63}" text-anchor="middle" font-size="11" fill="var(--accent)">${esc(mods.length ? mods.map((m) => m.replace('AFBC_', '')).join(', ') : r.ok ? (r.unknown ? 'SBWC (size not in repo)' : 'uncompressed') : '')}</text>
      <text x="${bx + bw / 2}" y="${by + 82}" text-anchor="middle" font-size="12" fill="currentColor">${r.ok ? (r.total != null ? (r.total / 1048576).toFixed(2) + ' MiB, ' : '') + (r.lockable ? 'CPU-lockable' : 'not CPU-lockable') : ''}</text></g>`;
    // moving frames (SMIL motion along each path)
    if (!REDUCE && r.ok) {
      paths.forEach((d, i) => {
        const isIn = d.startsWith('M180');
        for (let k = 0; k < 2; k++) {
          const begin = `${((isIn ? 0 : 1.2) + k * 1.2 + i * 0.15).toFixed(2)}s`;
          s += `<rect width="14" height="10" rx="2" x="-7" y="-5" fill="${isIn ? 'var(--p1)' : 'var(--p0)'}" opacity=".9" visibility="hidden"><set attributeName="visibility" to="visible" begin="${begin}"/><animateMotion dur="2.4s" begin="${begin}" repeatCount="indefinite" path="${d}"/></rect>`;
        }
      });
    }
    return s + '</svg>';
  }

  function detail(uc) {
    const u = usageOf(uc);
    const r = E.allocate({ width: uc.w, height: uc.h, layer_count: uc.layers || 1, hal_format: byName.get(uc.req) ? byName.get(uc.req).value : V[uc.req], usage: u }, flagsFor());
    const prods = bitsOf(E.get_producers(u), E.PR), cons = bitsOf(E.get_consumers(u), E.CO);
    const why = r.trace.filter((t) => /→|IMPLEMENTATION_DEFINED|YCbCr_420_888|P010|get_best_format|as-is|update_usage_for_BIG|E:/.test(t.msg)).slice(0, 4);
    const usageList = [uc.read !== 'none' ? `SW_READ_${uc.read.toUpperCase()}` : null, uc.write !== 'none' ? `SW_WRITE_${uc.write.toUpperCase()}` : null, ...uc.bits.map((b) => b.replace(/^GRALLOC_USAGE_|^GS101_GRALLOC_USAGE_/, ''))].filter(Boolean);
    const link = `#/usage?u=${G.hex(u)}&f=${encodeURIComponent(uc.req)}&w=${uc.w}&h=${uc.h}`;
    return `<div class="panel uc-detail anim-in">
      <div class="row"><span style="font-size:28px">${uc.icon}</span><h2 style="margin:0">${esc(uc.title)}</h2></div>
      <p>${esc(uc.story)} <span class="badge b-manual">Android background</span></p>
      <div class="kv small"><div>typical request</div><div><span class="mono">${esc(shortName(uc.req))}</span>, ${uc.h === 1 ? fmt(uc.w) + ' bytes' : `${fmt(uc.w)} × ${fmt(uc.h)}${uc.layers ? ` × ${uc.layers} layers` : ''}`} <span class="badge b-manual">Android background</span>${uc.noteReq ? ` <span class="muted">${esc(uc.noteReq)}</span>` : ''}</div>
        <div>typical usage</div><div class="mono">${usageList.join(' | ') || '0'} = ${G.hex(u)}</div></div>
      <div class="jscroll"><div class="jinner">${pipeline(uc, r, u)}</div></div>
      ${!cons.length ? `<div class="note small">No consumer is derived from these bits: <code>COMPOSER</code> counts as a display consumer only when it is the sole public bit (ignoring PROTECTED) or is combined with <code>TEXTURE</code> (${src(L(FMTS, 119, 151))}). With no consumers the consumer capabilities stay unrestricted (${src(L(FMTS, 266, 315))}).</div>` : ''}
      ${!prods.length ? `<div class="note small">No producer is derived from these bits; gralloc then assumes no producer capabilities (${src(L(FMTS, 335, 339))}).</div>` : ''}
      <div class="small muted">Producers and consumers are derived from the usage bits by ${src(L(FMTS, 198), 'get_producers')} / ${src(L(FMTS, 105), 'get_consumers')}; IP names from ${src(IP_CITE)}. Moving blocks = frames being written into and read out of the buffer.</div>
      <div class="grid2" style="margin-top:10px"><div class="panel"><h3 style="margin-top:0">What gralloc does <span class="small muted">(computed)</span></h3>${G.resultSummary(r)}</div>
      <div class="panel"><h3 style="margin-top:0">Why</h3><ol class="trace">${why.map((t) => `<li>${esc(t.msg)} ${src(t.cite)}</li>`).join('')}</ol>
        <h3>The source says</h3><ul class="small">${uc.notes.map(([t, c]) => `<li>${esc(t)} ${src(c)}</li>`).join('')}</ul></div></div>
      <div class="row"><a class="tabbtn primary" href="${link}">Open in the usage-flag explorer</a>${r.ok ? `<a class="tabbtn" href="#/format/${encodeURIComponent(r.format.name)}">Format page: ${esc(shortName(r.format.name))}</a><a class="tabbtn" href="#/storage?f=${encodeURIComponent(r.format.name)}">How its pixels are stored</a>` : ''}</div>
    </div>`;
  }

  // Used by the Overview hero: the computed pipeline for one use case.
  G.ucPipeline = (id) => {
    const uc = UC.find((u) => u.id === id); if (!uc) return '';
    const u = usageOf(uc);
    const r = E.allocate({ width: uc.w, height: uc.h, layer_count: uc.layers || 1, hal_format: byName.get(uc.req) ? byName.get(uc.req).value : V[uc.req], usage: u }, state.flags);
    return { uc, html: pipeline(uc, r, u) };
  };
  G.views.usecases = (params, arg) => {
    if (arg && UC.some((u) => u.id === arg)) ucState.id = arg;
    const uc = UC.find((u) => u.id === ucState.id) || UC[0];
    return `<h1>Real-life use cases</h1>
      <p>Everyday things a phone does, and what gralloc does for each: who writes the buffer, who reads it, which format and compression gralloc picks, how big it is and where the memory comes from. The scenario and its usage bits are <b>Android background</b> (what framework components typically request); everything gralloc does with the request is <b>computed from the gchips code</b> and cited.</p>
      <div class="panel row"><button id="uctour" class="primary">${tourTimer ? '❚❚ Stop tour' : '▶ Tour all use cases'}</button>
        <label class="chk"><input type="checkbox" id="ucafbc" ${ucState.gpuAfbc ? 'checked' : ''}> assume a Mali GPU with all AFBC features (board flags)</label>
        <span class="small muted">${ucState.gpuAfbc ? 'on for this page only' : 'off = code with no board flags'}</span></div>
      <div class="ucgrid"><div class="uclist">${UC.map((u) => `<a href="#/usecases/${u.id}" class="ucitem ${u.id === uc.id ? 'on' : ''}"><span>${u.icon}</span>${esc(u.title)}</a>`).join('')}</div>
      <div>${detail(uc)}</div></div>`;
  };
  G.AFTER.usecases = () => {
    document.getElementById('ucafbc').addEventListener('change', (e) => { ucState.gpuAfbc = e.target.checked; G.render(); });
    document.getElementById('uctour').addEventListener('click', () => {
      if (tourTimer) { stopTour(); G.render(); return; }
      tourTimer = setInterval(() => {
        if (!/^#\/usecases/.test(location.hash)) return stopTour();
        const i = UC.findIndex((u) => u.id === ucState.id);
        location.hash = '#/usecases/' + UC[(i + 1) % UC.length].id;
      }, 6000);
      G.render();
    });
  };
  window.addEventListener('hashchange', () => { if (!/^#\/usecases/.test(location.hash)) stopTour(); });

  /* Overview hero: a live pipeline that cycles through everyday scenarios. */
  const HERO = ['app-window', 'camera-preview', 'video-play', 'video-record', 'screenshot'];
  let heroTimer = null, heroIdx = 0;
  function stopHero() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }
  function heroHtml() {
    const { uc, html } = G.ucPipeline(HERO[heroIdx]);
    const u = usageOf(uc);
    const r = E.allocate({ width: uc.w, height: uc.h, layer_count: uc.layers || 1, hal_format: byName.get(uc.req) ? byName.get(uc.req).value : V[uc.req], usage: u }, state.flags);
    return `<div class="row" style="justify-content:space-between"><div class="tabs" style="margin:0">${HERO.map((id, i) => { const x = UC.find((q) => q.id === id); return `<button data-hero="${i}" class="${i === heroIdx ? 'on' : ''}">${x.icon} ${esc(x.title)}</button>`; }).join('')}</div></div>
      <div class="anim-in">${'<div class="jscroll"><div class="jinner">' + html + '</div></div>'}
      <p class="small" style="margin:4px 0 0"><b>${esc(uc.title)}:</b> gralloc allocates <span class="mono">${r.ok ? esc(shortName(r.format.name)) : '—'}</span>${r.ok && r.total != null ? `, ${(r.total / 1048576).toFixed(1)} MiB` : ''}${r.ok ? `, from the ${esc(r.heap.name.split(' ')[0])} heap` : ''}. <a href="#/usecases/${uc.id}">How and why</a></p></div>`;
  }
  G.AFTER.overview = () => {
    stopHero();
    const lede = document.querySelector('main h1 + p');
    if (!lede) return;
    lede.insertAdjacentHTML('afterend', '<div class="panel hero" id="hero"></div>');
    const box = document.getElementById('hero');
    const draw = () => {
      box.innerHTML = '<div class="small muted" style="margin-bottom:6px">Live: who writes and reads a buffer in everyday situations, and what gralloc gives them (computed from the code)</div>' + heroHtml();
      box.querySelectorAll('[data-hero]').forEach((b) => b.addEventListener('click', () => { stopHero(); heroIdx = Number(b.dataset.hero); draw(); }));
    };
    draw();
    heroTimer = setInterval(() => { if (!document.getElementById('hero')) return stopHero(); heroIdx = (heroIdx + 1) % HERO.length; draw(); }, 5000);
  };
  window.addEventListener('hashchange', () => { if (location.hash && !/^#\/?$/.test(location.hash)) stopHero(); });
})();
