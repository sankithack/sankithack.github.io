/*
 * arm-pages.js — further "Arm r56p0" tabs: capability XML editor, mapper & metadata, handles & descriptors,
 * build & configuration, a map of every file in the archive, HAL request mapping, terms, and the code-flow
 * data for the extra Arm steps. Everything shown comes from site/data/arm.js (tools/extract_arm.py +
 * tools/arm_more.py); hand-written sentences are explanations of the cited lines.
 */
(function () {
  'use strict';
  const G = window.GX, X = G.ARMX;
  if (!X) return;
  const { esc, src, badge, fmt } = G;
  const { A, AE, st, save, sn, fmtLink, al, AF, hx, PAGES, AFTERS, CAPS_PRESETS, capsFrom } = X;
  const MC = 'android/src/idl_common/mapper/mapper_common.cpp', MM = 'android/src/idl_common/mapper/mapper_metadata.cpp';
  const V5 = 'android/src/stablec/mapper/mapper.cpp', SH = 'android/src/idl_common/gralloc_shared/shared_metadata.cpp';
  const BUF = 'android/src/core/buffer.h', XML = 'android/src/capabilities/xml_configuration.cpp', CAPC = 'android/src/capabilities/capabilities.cpp';
  const PERMS = ['RW', 'RO', 'WO', 'NO'];

  /* ------------------------------------------------------------------ Capabilities */
  function xmlText(caps) {
    const ips = AE.XIPS.filter((ip) => caps[ip] && caps[ip].present);
    return `<capabilities version="0.4">\n${ips.map((ip) => `  <ip_capabilities ip="${ip}">\n${Object.entries(caps[ip].f).filter(([, p]) => p).map(([n, p]) => `    <feature name="${n}" permission="${p}" />`).join('\n')}\n  </ip_capabilities>`).join('\n')}\n</capabilities>`;
  }
  PAGES.caps = () => {
    const caps = st.caps;
    const feats = A.capability_features;
    return `<p class="lede">At start-up gralloc reads every <code>*.xml</code> in <code>/vendor/etc/gralloc</code> (${src(al(XML, 22))}) and, for each IP (GPU, DPU, DPU_AEU, VPU, CAM), keeps the features listed for it. Format selection then asks one question per feature: do all producers allow writing it and all consumers allow reading it? ${src(al(CAPC, 35, 84), 'ip_support_feature')}</p>
      <div class="grid2">
        <div class="panel"><b>Rules from the code</b><ul class="small" style="margin:6px 0 0 18px;padding:0">
          <li>A producer needs <code>RW</code> or <code>WO</code>; a consumer needs <code>RW</code> or <code>RO</code>. A feature that is not listed counts as unsupported (${src(al(XML, 270, 317), 'is_feature_supported')}).</li>
          <li>An IP with no XML entry is <b>not restricted at all</b>; only a missing GPU entry is fatal (${src(al(CAPC, 56, 63))}).</li>
          <li>If the CPU reads or writes the buffer, only five format features can pass: ${['FORMAT_R10G10B10A2', 'FORMAT_R10G10B10A10', 'FORMAT_R16G16B16A16_FLOAT', 'FORMAT_RGB16', 'FORMAT_DEPTH_STENCIL'].map((x) => `<code>${x}</code>`).join(', ')} (${src(al(CAPC, 28, 33))}). So <b>CPU access always means linear</b>.</li>
          <li>An IP is “present” unless its XML marks <code>DISABLED</code> RW or it has no XML (${src(al('android/src/capabilities/capabilities.h', 214, 228), 'ip_t::present')}); GPU→DPU AFBC extras need the DPU present.</li>
          <li>Unknown feature names make the whole file invalid (${src(al(XML, 213, 223))}).</li></ul></div>
        <div class="panel"><b>Preset</b> <select id="cpreset">${Object.entries(CAPS_PRESETS).map(([k, p]) => `<option value="${k}" ${st.capsPreset === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}<option value="custom" ${st.capsPreset === 'custom' ? 'selected' : ''}>custom</option></select>
          <p class="small muted">The README example is the only capability file content in the archive (${src(A.capability_example.loc, 'README.md:' + A.capability_example.loc.line)}); real devices ship their own. Your edits are used by the <a href="#/arm/calc">allocation calculator</a>.</p>
          <pre class="small" style="overflow:auto;max-height:220px">${esc(xmlText(caps))}</pre></div>
      </div>
      <h2>Edit the XML</h2>
      <div class="tablewrap"><table><thead><tr><th>feature</th>${AE.XIPS.map((ip) => `<th><label class="chk"><input type="checkbox" data-ipon="${ip}" ${caps[ip].present ? 'checked' : ''}>${ip}</label></th>`).join('')}<th>meaning (README)</th></tr></thead><tbody>
      ${feats.map((f) => `<tr><td class="mono small">${esc(f.name)} ${src(f.loc, 'h:' + f.loc.line)}</td>${AE.XIPS.map((ip) => `<td>${caps[ip].present ? `<select data-cap="${ip}|${f.name}">${['', ...PERMS].map((p) => `<option ${caps[ip].f[f.name] === p || (!p && !caps[ip].f[f.name]) ? 'selected' : ''}>${p}</option>`).join('')}</select>` : '<span class="muted small">no XML</span>'}</td>`).join('')}
        <td class="small">${f.description ? esc(f.description) + ' ' + src(f.readme, 'README:' + f.readme.line) : (f.name === 'DISABLED' ? 'IP explicitly not present (used by ip_t::present)' : '<span class="muted">not described in README</span>')}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Where each feature is checked</h2>
      <div class="tablewrap"><table><thead><tr><th>feature</th><th>effect in format selection</th></tr></thead><tbody>
      ${FEATURE_USE.map(([n, d, c]) => `<tr><td class="mono small">${n}</td><td class="small">${esc(d)} ${c.map((x) => src(x)).join(' ')}</td></tr>`).join('')}
      </tbody></table></div>`;
  };
  const FM = AF.FM;
  const FEATURE_USE = [
    ['AFBC_16X16', 'Required for any AFBC; without it AFBC is dropped from the format and validate_afbc clears all AFBC modifiers.', [al(FM, 386, 389), al(FM, 540, 544)]],
    ['AFBC_YUV', 'YUV formats only get AFBC if every IP (and the producer) supports it.', [al(FM, 393, 396), al(FM, 701, 712)]],
    ['AFBC_DOUBLE_BODY', 'Front-buffer usage needs it for AFBC; with tiled headers it enables the double body layout.', [al(FM, 398, 404), al(FM, 743, 746)]],
    ['AFBC_FORMAT_Y210', 'Y210 keeps AFBC only with this feature.', [al(FM, 406, 410)]],
    ['AFBC_TILED_HEADERS', 'Tiled header layout; also a precondition for multi-plane (64×4) AFBC.', [al(FM, 739, 752), al(FM, 558, 563)]],
    ['AFBC_64X4', 'With tiled headers: multi-plane YUV AFBC (luma 32×8 or 64×4, chroma 64×4).', [al(FM, 332, 336), al(FM, 748, 751)]],
    ['AFBC_32X8', 'GPU → DPU RGB: wide blocks. Removed if any IP lacks it.', [al(FM, 761, 767), al(FM, 552, 556)]],
    ['AFBC_BLOCK_SPLIT', 'GPU → DPU split block (not for YUV from the GPU, not for < 24 bpp to the DPU); needed with 32×8 for > 16 bpp RGB.', [al(FM, 769, 789), al(FM, 517, 532)]],
    ['AFBC_WRITE_NON_SPARSE', 'Without it on every producer the sparse layout is used.', [al(FM, 734, 737), al(FM, 565, 569)]],
    ['AFBC_FORMAT_R16G16B16A16_FLOAT', 'RGBA_FP16: without it the format stays linear.', [al(FM, 448, 451)]],
    ['FORMAT_R16G16B16A16_FLOAT', 'RGBA_FP16 is unsupported without it.', [al(FM, 444, 447)]],
    ['FORMAT_R10G10B10A2', 'RGBA_1010102 is unsupported without it.', [al(FM, 437, 441)]],
    ['FORMAT_R10G10B10A10', 'RGBA_10101010 is unsupported without it.', [al(FM, 453, 457)]],
    ['FORMAT_RGB16', 'RAW16 and RG16 are unsupported without it.', [al(FM, 458, 462)]],
    ['FORMAT_DEPTH_STENCIL', 'Depth/stencil formats are unsupported without it.', [al(FM, 464, 468)]],
    ['YUV_BL_8 / YUV_BL_10', '16×16 block-linear for 8-bit / 10-bit YUV.', [al(FM, 420, 433), al(FM, 795, 803)]],
    ['AFRC_ROT_LAYOUT / AFRC_SCAN_LAYOUT', 'AFRC needs one of them (rotation preferred) and the AFRC coding-size usage bits.', [al(FM, 412, 419), al(FM, 626, 638)]],
    ['DISABLED', 'Marks an IP as not present.', [al('android/src/capabilities/capabilities.h', 214, 228)]],
  ];
  AFTERS.caps = () => {
    const rer = () => { st.capsPreset = 'custom'; save(); G.render(); };
    const p = document.getElementById('cpreset');
    if (p) p.addEventListener('change', () => { st.capsPreset = p.value; if (CAPS_PRESETS[p.value]) st.caps = CAPS_PRESETS[p.value].caps(); save(); G.render(); });
    document.querySelectorAll('[data-ipon]').forEach((i) => i.addEventListener('change', () => { st.caps[i.dataset.ipon].present = i.checked; rer(); }));
    document.querySelectorAll('[data-cap]').forEach((s) => s.addEventListener('change', () => {
      const [ip, f] = s.dataset.cap.split('|');
      if (s.value) st.caps[ip].f[f] = s.value; else delete st.caps[ip].f[f];
      rer();
    }));
  };

  /* ------------------------------------------------------------------ Mapper & metadata */
  PAGES.mapper = () => {
    const md = A.metadata;
    const lay = A.shared_metadata_layout;
    return `<p class="lede">Apps and the system talk to gralloc buffers through the mapper. In r56p0 that is the <b>stable-C AIMapper v5</b> library <code>mapper.arm.so</code> (${src(al(V5, 451, 455), 'AIMapper_loadIMapper')}); every entry point forwards to the shared code in <code>idl_common/mapper</code>. Step through these calls in the <a href="#/flow?impl=arm&p=metadata">code-flow viewer</a>.</p>
      <h2>Mapper entry points</h2>
      <div class="tablewrap"><table><thead><tr><th>AIMapper v5</th><th>common function</th><th>what it does</th></tr></thead><tbody>
      ${MAPPER_API.map(([a, b, d, c1, c2]) => `<tr><td class="mono small">${a} ${src(c1)}</td><td class="mono small">${b} ${src(c2)}</td><td class="small">${esc(d)}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Lock rules</h2>
      <ol class="trace">${LOCK_RULES.map(([t, c]) => `<li>${esc(t)} ${src(c)}</li>`).join('')}</ol>
      <div class="note small"><code>mali_gralloc_lock_ycbcr</code> (${src(al(AF.ACC, 284, 386))}) fills an <code>android_ycbcr</code> for Y8/Y16, NV12, NV21, YV12 and YU12, but nothing in this archive calls it: the v5 mapper has no lockYCbCr entry, clients read PLANE_LAYOUTS instead.</div>
      <h2>Metadata types (${md.length})</h2>
      <p class="small">From the table <code>metadata_descriptions</code> (${src(al(MC, 59, 91))}). “get” and “set” link to the case in ${src(al(MM, 80), 'get_metadata')} / ${src(al(MM, 422), 'set_metadata')}.</p>
      <div class="tablewrap"><table><thead><tr><th>type</th><th>get</th><th>set</th><th>value comes from</th><th>condition</th></tr></thead><tbody>
      ${md.map((m) => `<tr><td class="mono small">${m.kind === 'arm' ? 'ArmMetadataType::' : ''}${esc(m.name)} ${src(m.loc, 'row')}</td>
        <td>${m.gettable ? badge('get', 'b-ok') + ' ' + (m.get ? src(m.get, 'case') : '') : '—'}</td>
        <td>${m.settable ? badge('set', 'b-ok') + ' ' + (m.set ? src(m.set, 'case') : '') : m.set ? `<span class="small muted">rejected ${src(m.set, 'case')}</span>` : '—'}</td>
        <td class="small">${esc(META_SRC[m.name] || m.description || '')}</td><td class="small mono">${esc(m.condition || '')}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>Shared-memory metadata region</h2>
      <p class="small">Created by the allocator next to each buffer (${src(al('android/src/idl_common/allocator/allocator.cpp', 118, 151))}) with ashmem (${src(al('android/src/allocator/shared_memory/shared_memory.cpp', 27, 52))}), mapped by every importer (${src(al(MC, 109, 117))}). Optional client-reserved bytes follow it (${src(al(MC, 406, 423), 'get_reserved_region')}). Offsets are fixed by <code>static_assert</code>s:</p>
      <div class="grid2">${lay.map((v) => `<div class="panel"><b class="mono small">${esc(v.variant)}</b><div class="tablewrap"><table><thead><tr><th>field</th><th>offset</th><th>size</th></tr></thead><tbody>
        ${v.fields.map((f) => `<tr><td class="mono small">${esc(f.field)}</td><td>${f.offset == null ? '' : fmt(f.offset)}</td><td>${f.size == null ? '' : fmt(f.size)} ${src(f.loc, 'assert')}</td></tr>`).join('')}</tbody></table></div>
        ${/≤/.test(v.variant) ? '<p class="small muted">Fields before smpte2094_10 have the same offsets as above (SMPTE 2094-50 is absent).</p>' : ''}</div>`).join('')}</div>
      <h2>PLANE_LAYOUTS</h2>
      <ul class="small">${PLANE_RULES.map(([t, c]) => `<li>${esc(t)} ${src(c)}</li>`).join('')}</ul>`;
  };
  const MAPPER_API = [
    ['importBuffer', 'import_buffer', 'Clone the handle, mmap the metadata, record import_pid, add to the pool.', al(V5, 98, 112), al(MC, 93, 142)],
    ['freeBuffer', 'free_buffer', 'Remove from the pool; unmap buffer and metadata if imported by this process.', al(V5, 114, 118), al(MC, 144, 170)],
    ['lock', 'lock → lock_buffer', 'Wait on the fence, check, map once, CpuSyncStart.', al(V5, 120, 126), al(MC, 186, 233)],
    ['unlock', 'unlock → unlock_buffer', 'Flush if written, lock_count--; release fence is always -1.', al(V5, 128, 132), al(MC, 265, 295)],
    ['flushLockedBuffer', 'flush_locked_buffer', 'CpuSyncEnd(write) while still locked.', al(V5, 134, 138), al(MC, 317, 334)],
    ['rereadLockedBuffer', 'reread_locked_buffer', 'CpuSyncStart(read) while still locked.', al(V5, 140, 144), al(MC, 336, 353)],
    ['getReservedRegion', 'get_reserved_region', 'Pointer after the shared metadata; error if none was reserved.', al(V5, 146, 153), al(MC, 406, 423)],
    ['getMetadata / getStandardMetadata', 'get → get_metadata', 'Encode one metadata value.', al(V5, 280, 305), al(MC, 362, 392)],
    ['setMetadata / setStandardMetadata', 'set → set_metadata', 'Decode and store one value (imported handles only).', al(V5, 351, 366), al(MC, 394, 404)],
    ['getTransportSize', 'get_transport_size', 'numFds / numInts of the handle.', al(V5, 368, 382), al(MC, 425, 439)],
    ['listSupportedMetadataTypes', 'list_supported_metadata_types', 'The metadata table below.', al(V5, 384, 391), al(MC, 441, 444)],
    ['dumpBuffer / dumpAllBuffers', 'dump_buffer / dump_buffers', 'All standard metadata of one / every registered buffer.', al(V5, 393, 448), al(MC, 479, 512)],
  ];
  const LOCK_RULES = [
    ['A second write lock on a non-BLOB buffer is not an error: it only bumps lock_count and marks invalid_write_locks (for VTS).', al(MC, 196, 209)],
    ['The acquire fence is waited on with sync_wait(fence, -1).', al(MC, 212, 215)],
    ['Region must be non-negative and inside width × height.', al(AF.ACC, 142, 166)],
    ['The lock usage must contain CPU bits, and (except BLOB) overlap the buffer’s own usage.', al(AF.ACC, 173, 182)],
    ['Only the process that imported the handle may lock it.', al(AF.ACC, 184, 189)],
    ['Formats with modifiers (AFBC, AFRC, block-linear) cannot be locked.', al(AF.ACC, 191, 196)],
    ['The buffer is mapped once per process, under a mutex, and stays mapped until free.', al(AF.ACC, 419, 431)],
    ['Lock: lock_count++, cpu_write set for write locks, CpuSyncStart(read, write).', al(AF.ACC, 92, 103)],
    ['Unlock: CpuSyncEnd only if cpu_write; cpu_write cleared when lock_count reaches 0.', al(AF.ACC, 104, 120)],
    ['Unlocking a buffer that is not locked returns BAD_BUFFER.', al(MC, 274, 278)],
  ];
  const META_SRC = {
    BUFFER_ID: 'backing_store_id = pid << 32 | counter (buffer_allocation.cpp:45-50)', NAME: 'shared memory (set at allocation)', WIDTH: 'handle width (requested)', HEIGHT: 'handle height (requested)',
    LAYER_COUNT: 'handle layer_count', PIXEL_FORMAT_REQUESTED: 'handle req_format (the HAL format asked for)', PIXEL_FORMAT_FOURCC: 'drm_fourcc_from_handle', PIXEL_FORMAT_MODIFIER: 'drm_modifier_from_handle',
    USAGE: 'producer | consumer usage', ALLOCATION_SIZE: 'handle size (all layers)', PROTECTED_CONTENT: '1 if PROTECTED usage', COMPRESSION: 'AFBC / AFRC (Arm extension) / None', INTERLACED: 'always None',
    CHROMA_SITING: 'shared memory; default Unknown for YUV, None otherwise', PLANE_LAYOUTS: 'get_plane_layouts (see below)', DATASPACE: 'shared memory (default from private usage bits)', BLEND_MODE: 'shared memory (default INVALID)',
    SMPTE2086: 'shared memory (HDR static)', CTA861_3: 'shared memory (HDR static)', SMPTE2094_40: 'shared memory blob (HDR10+)', SMPTE2094_50: 'shared memory blob', SMPTE2094_10: 'shared memory blob (Dolby Vision)',
    CROP: 'plane 0: stored crop or 0,0,width,height; other planes: alloc size', STRIDE: 'handle stride (pixel stride)',
  };
  const PLANE_RULES = [
    ['Number of planes: 1, or 2/3 for multi-plane formats (3 when plane 2 has a non-zero offset).', al(BUF, 211, 214)],
    ['totalSizeInBytes of a plane is the next plane’s offset, for the last plane the layer size minus its offset.', al(MC, 758, 766)],
    ['sampleIncrementInBits is bpp_afbc for AFBC, bpp otherwise, 0 for linear RAW10/RAW12.', al(MC, 777, 782)],
    ['strideInBytes, widthInSamples and heightInSamples are byte_stride, alloc_width and alloc_height from allocation.', al(MC, 784, 795)],
    ['Components come from a fourcc table; depth/stencil formats and RAW10/12 have special cases.', al(MC, 514, 741)],
  ];

  /* ------------------------------------------------------------------ Handles & descriptors */
  PAGES.handles = () => {
    const S = A.structs, enc = A.descriptor_encoding;
    const table = (k, title, note) => `<h2>${title}</h2>${note ? `<p class="small">${note}</p>` : ''}<p class="small">${src(S[k].loc, `${k}`)}</p>
      <div class="tablewrap"><table><thead><tr><th>field</th><th>type</th><th>comment in source</th></tr></thead><tbody>${S[k].fields.map((f) => `<tr><td class="mono small">${esc(f.name)} ${src({ file: S[k].loc.file, line: f.line, repo: 'arm' }, ':' + f.line)}</td><td class="mono small">${esc(f.type)}</td><td class="small">${esc(f.comment)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<p class="lede">The structures a buffer passes through: the encoded descriptor from the client, the internal descriptor, the handle that crosses processes, and the per-process imported handle.</p>
      <h2>Encoded buffer descriptor (${enc.size} bytes)</h2>
      <p class="small">Clients of the AIDL v1 <code>allocate</code> call send this byte vector; <code>allocate2</code> skips it (${src(enc.loc, 'grallocEncodeBufferDescriptor')}, decode ${src(enc.decode)}). Consumer usage is set equal to producer usage when decoding.</p>
      <div class="tablewrap"><table><thead><tr><th>offset</th><th>size</th><th>field</th></tr></thead><tbody>${enc.fields.map((f) => `<tr><td>${f.offset}</td><td>${f.size}</td><td class="mono small">${esc(f.field)} ${src(f.loc)}</td></tr>`).join('')}</tbody></table></div>
      <h2>Allocator descriptor flags</h2>
      <div class="tablewrap"><table><thead><tr><th>flag</th><th>value</th><th>set by the AIDL allocator?</th></tr></thead><tbody>${A.descriptor_flags.map((d) => `<tr><td class="mono small">${esc(d.name)} ${src(d.loc)}</td><td>${hx(d.value)}</td><td class="small">${esc(FLAG_SET[d.name] || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">allocate_common checks the result equals <code>DESCRIPTOR_ALLOCATOR_FLAGS</code>, which always includes SUPPORTS_R16_RG16 (${src(al('android/src/aidl/allocator.cpp', 48))}, ${src(al('android/src/idl_common/gralloc_shared/include/idl_common/descriptor.h', 76, 80))}).</p>
      ${table('buffer_descriptor_t', 'buffer_descriptor_t — request + computed layout')}
      ${table('plane_info_t', 'plane_info_t — per plane (up to 3)')}
      ${table('private_handle_t', 'private_handle_t — the native handle sent between processes', `Two fds: the buffer dma-buf (share_fd) and the shared metadata (share_attr_fd) (${src(al(BUF, 38, 40))}). handle_cast checks version, fd/int counts and the magic 0x3141592 (${src(al(BUF, 286, 324))}).`)}
      ${table('imported_handle', 'imported_handle — added in the importing process', `numInts covers only the private part, so this state is never copied to another process (${src(al(BUF, 252, 261))}).`)}
      ${table('AllocType', 'AllocType — allocation type derived from the modifiers', `Plus an <code>afrc</code> sub-struct: RGBA/luma and chroma coding-unit bytes and plane alignment, clump width/height per plane, paging tile width/height (${src(al('android/src/core/buffer_allocation.h', 90, 118))}).`)}
      ${table('format_info_t', 'format_info_t — one row of formats[]')}
      ${table('format_ip_support_t', 'format_ip_support_t — one row of formats_ip_support[]')}
      <h2>Forced (private) format wrappers</h2>
      <p class="small">Clients that want a specific layout pass one of these as the requested format; the 32-bit result has the sentinel bit set (${src(al(AF.FH, 332, 342), 'mali_gralloc_format_wrapper')}).</p>
      <div class="tablewrap"><table><thead><tr><th>macro</th><th>expands to</th></tr></thead><tbody>${A.format_wrappers.map((w) => `<tr><td class="mono small">${esc(w.name)}(${esc(w.args)}) ${src(w.loc)}</td><td class="mono small">${esc(w.body)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const FLAG_SET = {
    GPU_DATA_BUFFER_WITH_ANY_FORMAT: 'always — GPU_DATA_BUFFER allowed with any format', USE_AIDL_FRONTBUFFER_USAGE: 'always — FRONT_BUFFER usage allowed', SUPPORTS_R8: 'always — R8 allowed',
    HWC_FB_DISABLE_AFBC: 'only with GRALLOC_HWC_FB_DISABLE_AFBC=1', SUPPORTS_R16_RG16: 'PLATFORM_SDK_VERSION > 33', HW_IMP_CAM_USAGE: 'PLATFORM_SDK_VERSION ≤ 33 (camera IMPLEMENTATION_DEFINED → RG16)',
  };

  /* ------------------------------------------------------------------ Build & configuration */
  PAGES.build = () => {
    const B = A.build;
    const byMacro = {};
    for (const u of B.macro_uses) (byMacro[u.macro] = byMacro[u.macro] || []).push(u);
    const props = B.props.reduce((m, p) => ((m[p.file] = m[p.file] || []).push(p), m), {});
    return `<p class="lede">The archive ships every <code>Android.bp</code> as <code>*.disabled</code>. <code>configure</code> picks the variants for the target Android version and options and copies them to <code>Android.bp</code> (${src(al('configure_utils', 38, 43), 'enable()')}).</p>
      <h2>configure options</h2>
      <div class="tablewrap"><table><thead><tr><th>option</th><th>meaning</th><th>script</th></tr></thead><tbody>${B.configure_options.map((o) => `<tr><td class="mono">${esc(o.option)}</td><td class="small">${esc(o.note || '')}</td><td>${src(o.loc)}</td></tr>`).join('')}</tbody></table></div>
      <h2>What configure enables</h2><ol class="trace">${BUILD_STEPS.map(([t, c]) => `<li>${esc(t)} ${src(c)}</li>`).join('')}</ol>
      <h2>Compile-time macros (-D) in the blueprints</h2>
      <div class="tablewrap"><table><thead><tr><th>macro</th><th>value</th><th>defined in</th><th>tested in source</th></tr></thead><tbody>${B.cflags.map((c) => `<tr><td class="mono small">${esc(c.macro)}</td><td class="mono small">${esc(c.value || '')}</td><td>${src(c.loc)}</td>
        <td class="small">${(byMacro[c.macro] || []).slice(0, 6).map((u) => src(u.loc)).join(' ') || '<span class="muted">not tested in C++ (blueprint only)</span>'}</td></tr>`).join('')}</tbody></table></div>
      <h2>Every #if on a build macro (${B.macro_uses.length})</h2>
      <div class="tablewrap"><table><thead><tr><th>condition</th><th>where</th><th>controls</th></tr></thead><tbody>${B.macro_uses.map((u) => `<tr><td class="mono small">${esc(u.cond)}</td><td>${src(u.loc)}</td><td class="small">${esc(MACRO_NOTE[u.macro] || '')}</td></tr>`).join('')}</tbody></table></div>
      <h2>Device makefile and vendor properties</h2>
      <p class="small"><code>gralloc.device.mk</code> defaults GRALLOC_USE_CONTIGUOUS_DISPLAY_MEMORY and GRALLOC_HWC_FB_DISABLE_AFBC to 0 (hikey960 turns contiguous memory on), passes them as soong config variables and adds two property files (${src(al('android/gralloc.device.mk', 17, 55))}). No source file in this archive reads these properties; they publish values for other Mali components.</p>
      ${Object.entries(props).map(([f, ps]) => `<h3 class="mono small">${esc(f)}</h3><div class="tablewrap"><table><tbody>${ps.map((p) => `<tr><td class="mono small">${esc(p.key)}</td><td class="mono small">${esc(p.value)}</td><td>${src(p.loc)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      <h2>Service and VINTF</h2><ul class="small">
        <li>main() registers <code>IAllocator/default</code> with ADD_SERVICE_ALLOW_ISOLATED and joins the binder pool ${src(al('android/service/aidl/service.cpp', 26, 37))}</li>
        <li>VINTF manifest: allocator version 2 ${src(al('android/service/aidl/2.x/manifest_allocator.xml', 1))}; init script ${src(al('android/service/aidl/2.x/android.hardware.graphics.allocator-V2-service.rc', 1))}</li>
        <li>Stable-C mapper fragment ${src(al('android/src/stablec/mapper/mapper.arm.xml', 1))}; <code>getIMapperLibrarySuffix</code> returns "arm" ${src(al('android/src/aidl/allocator.cpp', 193, 203))}</li>
        <li>drm_hwcomposer plug-in reads PLANE_FDS through the stable-C mapper ${src(al('android/drm_hwcomposer/BufferInfoMapperMetadata.cpp', 59, 160))}</li></ul>`;
  };
  const BUILD_STEPS = [
    ['Detect the Android version (Baklava → 16, cinnamonbun → 17, a recent build-id date upgrades 16 → 17); Android 13+ turns VINTF on.', al('android/configure', 42, 63)],
    ['Delete every generated Android.bp / Android.mk, then always enable src/Android.bp.', al('android/configure', 130, 134)],
    ['Release or debug config; default or non-conformant display config.', al('android/configure', 136, 144)],
    ['Common modules (allocator, shared memory, core, capabilities, idl_common) + interfaces + per-version files (*.disabled.15/16/17).', al('android/configure', 146, 179)],
    ['AIDL allocator v2 service and library; stable-C mapper.', al('android/configure', 181, 201)],
    ['Optional drm_hwcomposer plug-in (legacy / v2 / HWC3 / upstream HWC3).', al('android/configure', 203, 222)],
    ['VINTF fragments or not; finally the dma-buf heaps back-end.', al('android/configure', 223, 232)],
    ['libformat/configure enables libformat/Android.bp.', al('libformat/configure', 1)],
  ];
  const MACRO_NOTE = {
    PLATFORM_API_LEVEL: 'SMPTE 2094-50 metadata (API > 36), STRIDE metadata (API > 33)', PLATFORM_SDK_VERSION: 'R16/RG16 flags vs camera rule; RGBA_10101010 request mapping',
    GRALLOC_USE_PRIVATE_FORMATS: 'forced private formats', GRALLOC_ALLOCATOR_AIDL_VERSION: 'allocate2 / isSupported / getIMapperLibrarySuffix',
    GRALLOC_HWC_FB_DISABLE_AFBC: 'HWC_FB_DISABLE_AFBC descriptor flag', GRALLOC_NON_CONFORMANT_DISPLAY: 'BGRA_8888 framebuffer', GRALLOC_USE_CONTIGUOUS_DISPLAY_MEMORY: 'linux,cma heap for HW_FB',
    GRALLOC_STABLEC_MAPPER_ENABLED: 'mapper suffix "arm"', USE_LEGACY_DRM_HWC: 'drm_hwcomposer API variant',
  };

  /* ------------------------------------------------------------------ Source map */
  const fq = { q: '' };
  PAGES.files = () => {
    const files = A.files;
    const tot = files.reduce((a, f) => a + f.lines, 0), fns = files.reduce((a, f) => a + (f.functions || []).length, 0);
    return `<p class="lede">Every file in the archive (${files.length} files, ${fmt(tot)} lines, ${fns} function definitions found). The one-line notes are written from reading each file; function lists are extracted.</p>
      <div class="panel row"><input id="fileq" type="text" placeholder="filter by path, note or function" value="${esc(fq.q)}" style="min-width:260px"><span id="filecount" class="small muted"></span></div>
      <div id="filelist"></div>`;
  };
  AFTERS.files = () => {
    const draw = () => {
      const q = fq.q.toLowerCase();
      const rows = A.files.filter((f) => !q || f.path.toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q) || (f.functions || []).some((x) => x.name.toLowerCase().includes(q)));
      document.getElementById('filecount').textContent = `${rows.length} of ${A.files.length}`;
      document.getElementById('filelist').innerHTML = `<div class="tablewrap"><table><thead><tr><th>file</th><th>lines</th><th>kind</th><th>what it is</th></tr></thead><tbody>${rows.map((f) => `<tr><td class="mono small">${src(f.loc, f.path)}</td><td>${f.lines}</td><td class="small">${esc(f.kind)}</td>
        <td class="small">${esc(f.note)}${f.functions && f.functions.length ? `<details${q && f.functions.some((x) => x.name.toLowerCase().includes(q)) ? ' open' : ''}><summary>${f.functions.length} functions</summary>${f.functions.map((x) => `${src({ file: f.path, line: x.line, repo: 'arm' }, x.line)} <span class="mono">${esc(x.name)}</span>`).join('<br>')}</details>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    };
    document.getElementById('fileq').addEventListener('input', (e) => { fq.q = e.target.value; draw(); });
    draw();
  };

  /* ------------------------------------------------------------------ HAL request mapping + defined-only */
  PAGES.requests = () => `<p class="lede">How a requested Android format becomes a base format: the <code>hal_to_internal_format[]</code> table (${src(A.table_locs.hal_map)}) via ${src(al(AF.FI, 1011, 1031), 'get_internal_format')}, plus one usage rule (${src(al(AF.FM, 347, 358), 'get_internal_format_with_usage')}).</p>
    <div class="tablewrap"><table><thead><tr><th>requested</th><th>value</th><th>→ base format</th><th>condition</th><th>row</th></tr></thead><tbody>
    ${A.hal_requests.map((h) => `<tr><td class="mono small">${esc(h.hal)}</td><td class="mono">${h.hal_value != null ? hx(h.hal_value) : '?'} ${h.hal_value_source === 'manual' ? badge('AOSP', 'b-manual') : ''}</td>
      <td>${byName_(h.internal) ? fmtLink(h.internal) : `<span class="mono">${esc(sn(h.internal))}</span> ${badge('rejected', 'b-bad')}`}</td><td class="mono small">${esc(h.condition || '')}</td><td>${src(h.loc)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="note small">Camera rule (Android 13 only, HW_IMP_CAM_USAGE): IMPLEMENTATION_DEFINED with camera or sensor usage becomes RG16. On Android 14+ the README asks for <code>PIXEL_FORMAT_R16G16_UINT</code> / <code>R16_UINT</code> instead (${src(al('README.md', 141, 161), 'README')}).</div>
    <h2>Defined but not allocatable</h2>
    <div class="tablewrap"><table><thead><tr><th>name</th><th>value</th><th>defined</th></tr></thead><tbody>${A.defined_only.map((d) => `<tr><td class="mono small">${esc(d.name)}</td><td class="mono">${esc(d.value_hex || '?')}</td><td>${src(d.defined_at)}</td></tr>`).join('')}</tbody></table></div>`;
  const byName_ = (n) => X.byName.has(n);

  /* ------------------------------------------------------------------ Terms */
  PAGES.glossary = () => `<p class="lede">Words used in the Arm code, explained and linked to where they are defined.</p>
    ${TERMS.map(([t, d, c]) => `<div class="panel"><b>${esc(t)}</b><p style="margin:4px 0">${esc(d)}</p><div class="small">${c.map((x) => src(x)).join(' ')}</div></div>`).join('')}`;
  const TERMS = [
    ['libformat', 'Arm’s size library. Given a DRM fourcc, a modifier and the image size it returns planes, strides and the total size. gralloc r56p0 does no size math of its own.', [al(AF.LF, 683, 982)]],
    ['DRM fourcc / modifier', 'Linux display names for a pixel layout: the fourcc names the format (e.g. NV12), the 64-bit modifier names the tiling/compression (AFBC, AFRC, 16×16 tile, or 0 = linear).', [al(AF.DRM, 24, 63), al(AF.MDF, 95, 217)]],
    ['Internal format', '32-bit word: base format in the low bits, modifier bits from bit 16 (AFBC/AFRC/block-linear options), plus a separate data type.', [al(AF.FH, 139, 156), al('android/src/core/internal_format.h', 30, 70)]],
    ['Forced / private format', 'A requested format with the sentinel bit and modifiers already set, built with GRALLOC_PRIVATE_FORMAT_WRAPPER_*. Selection is skipped; gralloc only checks the modifiers fit the format.', [al(AF.FM, 1185, 1216)]],
    ['AFBC', 'Arm Frame Buffer Compression: lossless, blocks of 16×16, 32×8 or 64×4 pixels, each with a 16-byte header; the body size per block varies.', [al(AF.LF, 177, 402)]],
    ['Superblock / tiled headers', 'One AFBC block and its header. With tiled headers, headers are grouped for 8×8 (≤ 32 bpp) or 4×4 superblocks and planes are 4 KiB aligned.', [al(AF.LF, 752, 761)]],
    ['Sparse / split / wide / double body / YTR / BCH / USM', 'AFBC options: sparse body layout, split blocks, 32×8 wide blocks, a second body for front-buffer use, YUV transform, buffer content hints, uncompressed storage mode.', [al(AF.FH, 168, 200)]],
    ['AFRC', 'Arm Fixed Rate Compression: lossy, a fixed number of bytes per coding unit, so the size is known in advance.', [al(AF.LF, 810, 858)]],
    ['Coding unit (CU)', 'AFRC’s compressed unit: 16, 24 or 32 bytes, chosen by the client through usage bits (luma/RGBA and chroma separately).', [al(AF.USG, 92, 110), al(AF.LF, 520, 532)]],
    ['Paging tile / clump', 'AFRC geometry: a paging tile is 16×4 (scan) or 8×8 (rotation) coding units; a clump is the pixels per coding unit (depends on component count).', [al(AF.LF, 124, 175)]],
    ['Block-linear', '16×16 pixel tiles stored one after another (generic DRM tile modifier), for 8/10-bit YUV.', [al(AF.LF, 859, 880)]],
    ['Capability XML', 'Per-device files in /vendor/etc/gralloc saying which features each IP can read/write. They decide AFBC/AFRC/block-linear choices.', [al('README.md', 17, 204)]],
    ['Producer / consumer, IP', 'Which hardware writes and reads the buffer, derived from usage: CPU, GPU, DPU (display), DPU_AEU (display write-back), VPU (video), CAM.', [al(AF.FM, 44, 164)]],
    ['Grade', 'Score used to pick among supported formats: modifiers add points, AFRC adds 2^30.', [al(AF.FM, 991, 1039)]],
    ['permitted_usage', 'Per-format mask of usages that format may be allocated with.', [al(AF.FIH, 82)]],
    ['Shared metadata', 'An ashmem region next to each buffer holding mutable metadata (dataspace, crop, HDR …), mapped by every importer.', [al(SH, 1)]],
    ['Imported handle', 'The per-process copy of a buffer handle made at import; holds lock count, CPU mapping and import pid.', [al(BUF, 248, 274)]],
    ['Stable-C mapper (AIMapper v5)', 'Mapper as a plain C library loaded with dlopen (mapper.arm.so) instead of a HIDL service.', [al(V5, 451, 455)]],
  ];

  /* ------------------------------------------------------------------ formats page: link to the request mapping */
  const origFormats = G.views.arm;
  G.views.arm = () => {
    let html = origFormats();
    const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[1] || '';
    if (p === 'formats' || p === 'requests') {
      const bar = `<div class="tabs" style="margin-top:4px"><button data-arm="formats" class="${p === 'formats' ? 'on' : ''}">Supported formats (${A.formats.length})</button><button data-arm="requests" class="${p === 'requests' ? 'on' : ''}">Request mapping (${A.hal_requests.length}) + defined only (${A.defined_only.length})</button></div>`;
      html = html.replace(/(<div class="tabs">[\s\S]*?<\/div>)/, '$1' + bar);
    }
    return html;
  };
  // Keep the "Formats" tab highlighted on the request-mapping page.
  const origAfter = G.AFTER.arm;
  G.AFTER.arm = (params) => {
    origAfter(params);
    const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[1] || '';
    if (p === 'requests') { const b = document.querySelector('.tabs [data-arm="formats"]'); if (b) b.classList.add('on'); }
  };

  /* ------------------------------------------------------------------ code flow: extra Arm steps */
  const FJ = G.flowJourneyArm;
  if (FJ) {
    Object.assign(FJ.J, {
      get_supported: [1], is_fmt_supported: [1], ip_support_feature: [1], get_afrc_format: [1], get_afbc_format: [1], validate_afbc: [1], grade_format: [1],
      allocate2: [1], is_supported: [1], mapper_suffix: [1], v5_load: [0], v5_get_std: [0], v5_set_std: [0], protected_heap: [2], v5_import: [0], v5_lock: [0], common_lock: [0], v5_unlock: [0], common_unlock: [0], v5_free: [0],
      v5_get_metadata: [0], common_get: [0], get_metadata: [0], plane_layouts: [0], v5_set_metadata: [0], common_set: [0], set_metadata: [0],
    });
    Object.assign(FJ.STATE_AT, {
      'allocate:get_best': ['format selected (base + modifiers)', '—', '—', 'no', '—', '—', al(AF.FM, 1112, 1128)],
      'supported:is_supported': ['nothing allocated: only the derivation is run', '—', '—', 'no', '—', '—', al('android/src/aidl/allocator.cpp', 158, 164)],
      'metadata:get_metadata': ['imported', 'dup’d fds', 'read (fixed fields from the handle, mutable ones from shared memory)', 'unchanged', 'unchanged', 'unchanged', al(MM, 80, 420)],
      'metadata:set_metadata': ['imported', 'dup’d fds', 'written (dataspace, chroma siting, blend mode, HDR, crop)', 'unchanged', 'unchanged', 'unchanged', al(MM, 422, 590)],
    });
    const PH = (A.callflow.phases || []).map((p) => p[0]);
    FJ.PHASE_ORDER = PH;
    FJ.stateFor = (phase, idx) => {
      let last = null;
      for (const ph of PH) {
        const ids = A.callflow.paths[ph];
        for (let k = 0; k < ids.length; k++) {
          const s = FJ.STATE_AT[ph + ':' + ids[k]];
          if (s) last = { id: ids[k], s };
          if (ph === phase && k === idx) return last;
        }
      }
      return last;
    };
  }
  void capsFrom;
})();
