/* ============================================================
   Ketor - Patch and Export activity (Batch 58)
   ------------------------------------------------------------
   What the work so far adds up to, on one screen: how many bytes
   differ from the file that was loaded, where they are, how much
   the image has grown, and the two ways out - the patched ROM
   itself, or an IPS patch that carries only the difference.

   Everything here is read from the patch layer, so it always agrees
   with what the hex editor shows in red.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var MONO = 'var(--kt-font-mono)';

  function hex6(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '------';
    return v.toString(16).toUpperCase().padStart(6, '0');
  }

  function short(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /* The patched offsets, grouped into runs, so a person sees regions instead of
     a list of single bytes. */
  function changeRuns(patches, gap) {
    var offsets = Object.keys(patches || {}).map(Number).filter(function (n) { return Number.isFinite(n); }).sort(function (a, b) { return a - b; });
    var runs = [];
    var limit = gap === undefined ? 16 : Number(gap);
    offsets.forEach(function (off) {
      var last = runs.length ? runs[runs.length - 1] : null;
      if (last && off - last.end <= limit) { last.end = off + 1; last.count++; return; }
      runs.push({ start: off, end: off + 1, count: 1 });
    });
    return runs;
  }

  function patchState() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    var appended = (K.hex && K.hex.appendedLength) ? K.hex.appendedLength() : 0;
    var patches = (h && h.patches) || {};
    return {
      romName: h ? h.romName : '',
      romSize: h ? h.romSize || (h.romBytes ? h.romBytes.length : 0) : 0,
      sourceSize: h && h.romBytes ? h.romBytes.length : 0,
      patches: patches,
      patchCount: Object.keys(patches).length,
      appended: appended,
      imageSize: (h && h.romBytes ? h.romBytes.length : 0) + appended,
      relocations: (K.hex && K.hex.getRelocations) ? (K.hex.getRelocations() || []).length : 0
    };
  }

  function usePatchState() {
    var h = K.hex ? K.hex.useHex() : null;
    return patchState();
  }

  function download(bytes, name, type) {
    var blob = new Blob([bytes], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* The patch, built from the loaded file and the image the editor would export. */
  function buildPatch() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    if (!h || !h.romBytes) return null;
    if (!K.core.buildIps || !K.core.diffBytes) return null;
    var before = K.hex.getSourceBytes();
    var after = K.hex.getPatchedBytes();
    if (!before || !after) return null;
    var changes = K.core.diffBytes(before, after);
    var built = K.core.buildIps(changes);
    return { changes: changes.length, bytes: built.bytes, skipped: built.skipped, records: built.records };
  }

  function PatchSidebar() {
    var st = usePatchState();
    var runs = changeRuns(st.patches);
    var patch = buildPatch();

    return e('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
      e('div', { style: { fontWeight: 600 } }, 'Patch and Export'),
      e('div', { style: { opacity: 0.75 } }, st.romName || 'No ROM loaded.'),
      e('div', { style: { fontFamily: MONO, display: 'flex', flexDirection: 'column', gap: 2 } },
        e('span', null, 'loaded   ' + short(st.sourceSize)),
        e('span', null, 'changed  ' + st.patchCount + ' byte(s) in ' + runs.length + ' region(s)'),
        e('span', null, 'grown by ' + short(st.appended)),
        e('span', null, 'export   ' + short(st.imageSize)),
        patch ? e('span', null, 'ips      ' + short(patch.bytes.length) + (patch.skipped ? ' (' + patch.skipped + ' byte(s) past the IPS limit)' : '')) : null
      ),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !st.patchCount && !st.appended,
        title: 'Write the whole image, patches and appended bytes included',
        onClick: function () { if (K.hex.exportPatchedRom) K.hex.exportPatchedRom(); }
      }, 'Export patched ROM'),
      e('button', {
        type: 'button', className: 'kt-btn secondary',
        disabled: !patch || !patch.bytes.length,
        title: 'Write only the difference, as an IPS patch',
        onClick: function () {
          var built = buildPatch();
          if (!built) return;
          var base = String(st.romName || 'patched').replace(/\.[^.]+$/, '');
          download(built.bytes, base + '.ips');
        }
      }, 'Export IPS patch'),
      e('button', {
        type: 'button', className: 'kt-btn secondary',
        disabled: !st.patchCount && !st.appended,
        title: 'Throw the patches away and go back to the loaded file',
        onClick: function () { if (K.hex.clearPatches) K.hex.clearPatches(); }
      }, 'Discard all patches'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.45 } }, 'An IPS patch cannot say that a file got shorter, and it cannot address past 16 MB; both limits are reported here instead of being applied quietly.')
    );
  }

  function PatchTab() {
    var st = usePatchState();
    var runs = changeRuns(st.patches);
    var patch = buildPatch();
    var listed = runs.slice(0, 40);

    return e('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
      e('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-sidebar-bg)', fontSize: 11, flexWrap: 'wrap' } },
        e('span', { style: { fontWeight: 600 } }, st.romName || 'No ROM'),
        e('span', { style: { opacity: 0.7 } }, st.patchCount + ' changed byte(s)'),
        e('span', { style: { opacity: 0.7 } }, 'in ' + runs.length + ' region(s)'),
        st.appended ? e('span', { style: { opacity: 0.7 } }, 'grown by ' + short(st.appended)) : null,
        patch ? e('span', { style: { opacity: 0.7 } }, 'IPS would be ' + short(patch.bytes.length)) : null,
        e('span', { style: { flex: 1 } }),
        e('button', {
          type: 'button', className: 'kt-btn small', disabled: !st.patchCount && !st.appended,
          title: 'Write the whole image to a file, patches and appended bytes included; needs a change first',
          onClick: function () { if (K.hex.exportPatchedRom) K.hex.exportPatchedRom(); }
        }, 'Export ROM'),
        e('button', {
          type: 'button', className: 'kt-btn small secondary', disabled: !patch || !patch.bytes.length,
          title: 'Write only the changed bytes as an IPS patch another tool can apply to the clean ROM',
          onClick: function () {
            var built = buildPatch();
            if (!built) return;
            download(built.bytes, String(st.romName || 'patched').replace(/\.[^.]+$/, '') + '.ips');
          }
        }, 'Export IPS')
      ),
      e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 10, fontSize: 12 } },
        !st.patchCount && !st.appended
          ? e('div', { style: { opacity: 0.7 } }, 'Nothing changed yet. Paint a tile, write text on a screen, or type in the hex editor, and the changes collect here.')
          : e('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              e('div', { style: { opacity: 0.75 } }, 'Changed regions, before and after:'),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, fontFamily: MONO } },
                listed.map(function (run) {
                  var h = K.hex.getState();
                  var before = '';
                  var after = '';
                  var src = h.romBytes || new Uint8Array(0);
                  for (var i = run.start; i < Math.min(run.end, run.start + 8); i++) {
                    var b = src[i] === undefined ? 0 : src[i] & 0xFF;
                    var a = st.patches[i] === undefined ? b : (st.patches[i] & 0xFF);
                    before += (b < 16 ? '0' : '') + b.toString(16).toUpperCase() + ' ';
                    after += (a < 16 ? '0' : '') + a.toString(16).toUpperCase() + ' ';
                  }
                  return e('div', { key: 'run' + run.start, style: { display: 'flex', gap: 8 } },
                    e('span', { style: { opacity: 0.8, minWidth: 70 } }, '0x' + hex6(run.start)),
                    e('span', { style: { opacity: 0.55, minWidth: 120 } }, before.trim() + (run.end - run.start > 8 ? ' ...' : '')),
                    e('span', null, '->'),
                    e('span', { style: { minWidth: 120 } }, after.trim() + (run.end - run.start > 8 ? ' ...' : '')),
                    e('span', { style: { opacity: 0.6 } }, run.end - run.start + ' byte(s)')
                  );
                })
              ),
              runs.length > listed.length ? e('div', { style: { opacity: 0.6 } }, (runs.length - listed.length) + ' more region(s)') : null,
              st.appended ? e('div', { style: { marginTop: 6 } },
                e('div', { style: { opacity: 0.75 } }, 'Grown region:'),
                e('div', { style: { fontFamily: MONO } }, short(st.appended) + ' byte(s) appended after 0x' + hex6(st.sourceSize) + ', written by Export and by the IPS patch.')) : null,
              e('div', { style: { marginTop: 6, opacity: 0.7, lineHeight: 1.5 } },
                'The IPS patch carries only the difference, so it applies to a clean copy of the game. The exported ROM carries everything. Both come from the same patch layer the hex editor shows in red.')
            )
      )
    );
  }

  K.ui.registerTabProvider('patch', PatchTab);
  K.ui.registerSidebarProvider('patch', PatchSidebar);
  K.patch = {
    changeRuns: changeRuns, buildPatch: buildPatch, state: patchState, summary: short
  };
})(window);