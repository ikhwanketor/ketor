/* ============================================================
   Ketor - Hex Editor Tab (v1)
   ------------------------------------------------------------
   Batch 18: windowed hex grid with byte editing.

   Only the rows inside the viewport (plus a small overscan) are
   rendered, so a 16 MB ROM costs the same as a small one. Rows
   are absolutely positioned inside a spacer whose height is the
   full row count, which keeps the native scrollbar accurate.

   Editing model: click selects, double-click or the first hex
   digit starts an edit, the second digit commits and advances.
   Enter commits, Escape cancels. Every commit goes through
   K.hex.setByte so undo/redo and the changed-byte colouring stay
   in one place.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var uC = R.useCallback;
  var uM = R.useMemo;
  var uE = R.useEffect;
  var uR = R.useRef;

  var ROW_HEIGHT = 21;
  var OVERSCAN = 4;
  var HEX_DIGITS = '0123456789abcdefABCDEF';

  function hex2(v) { return (Number(v) & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
  function hex8(v) { return Number(v || 0).toString(16).toUpperCase().padStart(8, '0'); }
  function isAsciiPrintable(v) { return v >= 0x20 && v <= 0x7E; }

  function parseOffset(text, base) {
    var v = String(text || '').trim().replace(/^0x/i, '');
    if (!v) return null;
    var n = base === 'dec' ? parseInt(v, 10) : parseInt(v, 16);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Ranges are sorted by start; find whether an offset falls inside one.
  function inRanges(ranges, offset) {
    if (!ranges || !ranges.length) return null;
    var lo = 0, hi = ranges.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (ranges[mid].start <= offset) { found = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (found < 0) return null;
    var r = ranges[found];
    return offset <= r.end ? r : null;
  }

  function toRanges(list) {
    if (!list || !list.length) return [];
    return list.slice().sort(function (a, b) { return a.start - b.start; });
  }

  function HexRow(props) {
    var row = props.row;
    var perRow = props.bytesPerRow;
    var bytes = props.romBytes;
    var base = row * perRow;

    var cells = [];
    var ascii = [];
    for (var i = 0; i < perRow; i++) {
      var off = base + i;
      if (off >= bytes.length) {
        cells.push(e('span', { key: 'e' + i, style: { color: 'transparent' } }, '  '));
        ascii.push(e('span', { key: 'a' + i }, ' '));
        continue;
      }
      var raw = bytes[off] & 0xFF;
      var patched = props.patches[off] !== undefined;
      var value = patched ? props.patches[off] : raw;
      var isCursor = off === props.cursorOffset;
      var inSel = props.selStart !== null && off >= props.selStart && off <= props.selEnd;
      var isFlash = off === props.flashOffset;
      var inGroup = props.layers.groups ? inRanges(props.groupRanges, off) : null;
      var hint = props.layers.controlCodes ? props.controlHints[value] : null;
      var editing = props.edit && props.edit.offset === off;

      var bg = 'transparent';
      if (props.layers.sections && props.sectionRange && off >= props.sectionRange.start && off <= props.sectionRange.end) {
        bg = props.sectionRange.tint;
      }
      if (inGroup) bg = 'rgba(86,156,214,0.16)';
      if (inSel) bg = 'var(--kt-editor-selection, #264f78)';
      if (isCursor) bg = 'rgba(255,255,255,0.26)';
      if (isFlash) bg = 'rgba(255,215,64,0.45)';

      var color = 'var(--kt-editor-fg)';
      if (hint) color = 'var(--kt-warning-fg, #cca700)';
      if (inGroup) color = 'var(--kt-info-fg, #75beff)';
      if (patched) color = 'var(--kt-warning-fg, #cca700)';
      if (patched && inGroup) color = 'var(--kt-info-fg, #75beff)';

      var text = hex2(value);
      if (editing) text = props.edit.digits.length ? props.edit.digits + '_' : '__';

      cells.push(e('span', {
        key: 'b' + i,
        title: (hint ? hint + '\n' : '') + '0x' + hex8(off) + '  dec ' + value +
          (patched ? '  (was ' + hex2(raw) + ')' : ''),
        onMouseDown: function (ev) { props.onByteDown(off, ev.shiftKey); },
        onDoubleClick: function () { props.onByteEdit(off); },
        style: {
          display: 'inline-block',
          width: 22,
          textAlign: 'center',
          background: bg,
          color: color,
          fontFamily: 'var(--kt-font-mono)',
          fontWeight: patched ? 600 : 400,
          cursor: 'pointer',
          userSelect: 'none'
        }
      }, text));

      ascii.push(e('span', {
        key: 'c' + i,
        onMouseDown: function (ev) { props.onByteDown(off, ev.shiftKey); },
        style: {
          display: 'inline-block',
          width: 10,
          textAlign: 'center',
          background: bg,
          color: color,
          cursor: 'pointer',
          userSelect: 'none'
        }
      }, isAsciiPrintable(value) ? String.fromCharCode(value) : '.'));
    }

    return e('div', {
      style: {
        position: 'absolute',
        top: row * ROW_HEIGHT,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        lineHeight: ROW_HEIGHT + 'px',
        whiteSpace: 'pre',
        paddingLeft: 8,
        fontSize: 12
      }
    },
      e('span', {
        style: {
          display: 'inline-block',
          width: 76,
          color: 'var(--kt-input-placeholder-fg)',
          fontFamily: 'var(--kt-font-mono)',
          userSelect: 'none'
        }
      }, hex8(base)),
      cells,
      e('span', { style: { display: 'inline-block', width: 14 } }, ' '),
      e('span', {
        style: { fontFamily: 'var(--kt-font-mono)', letterSpacing: 0 }
      }, ascii)
    );
  }

  function HexTab() {
    var t = K.hex.useHex();
    var s = K.search ? K.search.useSearch() : null;

    var scrollRef = uR(null);
    var viewSt = uS({ scrollTop: 0, height: 400 });
    var view = viewSt[0];
    var setView = viewSt[1];

    var editSt = uS(null);
    var edit = editSt[0];
    var setEdit = editSt[1];

    var gotoSt = uS('');
    var gotoValue = gotoSt[0];
    var setGotoValue = gotoSt[1];

    var assignSt = uS(false);
    var assignOpen = assignSt[0];
    var setAssignOpen = assignSt[1];
    var newGroupSt = uS(false);
    var newGroupOpen = newGroupSt[0];
    var setNewGroupOpen = newGroupSt[1];

    var perRow = t.bytesPerRow || 16;
    var totalBytes = t.romBytes ? t.romBytes.length : 0;
    var totalRows = Math.max(1, Math.ceil(totalBytes / perRow));

    // ---- measure the viewport ----
    uE(function () {
      var el = scrollRef.current;
      if (!el) return;
      function measure() {
        setView({ scrollTop: el.scrollTop, height: el.clientHeight || 400 });
      }
      measure();
      window.addEventListener('resize', measure);
      return function () { window.removeEventListener('resize', measure); };
    }, [t.romBytes]);

    var rafRef = uR(0);
    var onScroll = uC(function () {
      var el = scrollRef.current;
      if (!el) return;
      if (rafRef.current) return;
      rafRef.current = global.requestAnimationFrame(function () {
        rafRef.current = 0;
        setView({ scrollTop: el.scrollTop, height: el.clientHeight || 400 });
      });
    }, []);

    // ---- follow explicit navigation (goto, search hit, event) ----
    uE(function () {
      var el = scrollRef.current;
      if (!el || !t.romBytes) return;
      var row = Math.floor((t.focusOffset || 0) / perRow);
      var target = row * ROW_HEIGHT - Math.floor((el.clientHeight || 400) / 2) + ROW_HEIGHT;
      el.scrollTop = Math.max(0, target);
      setView({ scrollTop: el.scrollTop, height: el.clientHeight || 400 });
    }, [t.focusToken]);

    uE(function () {
      var el = scrollRef.current;
      if (el) el.focus();
      if (t.romBytes) K.hex.refreshSections();
    }, [!!t.romBytes]);

    // ---- highlight range sources ----
    var groupRanges = uM(function () {
      if (!s) return [];
      var map = {};
      (s.texts || []).forEach(function (x) { map[Number(x.startByte)] = x; });
      var out = [];
      (s.groups || []).forEach(function (g) {
        (g.offsets || []).forEach(function (off) {
          var entry = map[Number(off)];
          if (!entry) return;
          var len = Math.max(1, Number(entry.byteLength) || 1);
          out.push({ start: Number(off), end: Number(off) + len - 1 });
        });
      });
      return toRanges(out);
    }, [s ? s.groups : null, s ? s.texts : null]);

    var sectionRanges = uM(function () {
      var list = (t.sections || []).map(function (sec, idx) {
        return {
          start: sec.start,
          end: sec.end === null ? totalBytes - 1 : sec.end,
          tint: idx % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.075)'
        };
      });
      return list;
    }, [t.sections, totalBytes]);

    var controlHints = (K.core && K.core.CONTROL_HINTS) ? K.core.CONTROL_HINTS : {};

    // ---- editing ----
    var commitEdit = uC(function (digits) {
      if (!edit) return;
      if (digits && digits.length === 2) {
        K.hex.setByte(edit.offset, parseInt(digits, 16));
        K.hex.setCursor(Math.min(totalBytes - 1, edit.offset + 1));
      }
      setEdit(null);
    }, [edit, totalBytes]);

    var onByteDown = uC(function (offset, shiftKey) {
      if (edit) setEdit(null);
      if (shiftKey) {
        K.hex.setSelection(t.cursorOffset, offset);
      } else {
        K.hex.setCursor(offset);
        K.hex.clearSelection();
      }
    }, [edit, t.cursorOffset]);

    var onByteEdit = uC(function (offset) {
      K.hex.setCursor(offset);
      setEdit({ offset: offset, digits: '' });
    }, []);

    var onKeyDown = uC(function (ev) {
      if (!t.romBytes) return;
      var key = ev.key;

      if (edit) {
        if (key === 'Escape') { ev.preventDefault(); setEdit(null); return; }
        if (key === 'Enter') { ev.preventDefault(); commitEdit(edit.digits); return; }
        if (key === 'Backspace') {
          ev.preventDefault();
          setEdit({ offset: edit.offset, digits: edit.digits.slice(0, -1) });
          return;
        }
        if (key.length === 1 && HEX_DIGITS.indexOf(key) !== -1) {
          ev.preventDefault();
          var digits = edit.digits + key;
          if (digits.length >= 2) commitEdit(digits.slice(0, 2));
          else setEdit({ offset: edit.offset, digits: digits });
          return;
        }
        return;
      }

      var step = 0;
      if (key === 'ArrowLeft') step = -1;
      else if (key === 'ArrowRight') step = 1;
      else if (key === 'ArrowUp') step = -perRow;
      else if (key === 'ArrowDown') step = perRow;
      else if (key === 'PageUp') step = -perRow * Math.max(1, Math.floor((scrollRef.current ? scrollRef.current.clientHeight : 400) / ROW_HEIGHT));
      else if (key === 'PageDown') step = perRow * Math.max(1, Math.floor((scrollRef.current ? scrollRef.current.clientHeight : 400) / ROW_HEIGHT));
      else if (key === 'Home') { ev.preventDefault(); K.hex.setCursor(0); return; }
      else if (key === 'End') { ev.preventDefault(); K.hex.setCursor(totalBytes - 1); return; }

      if (step !== 0) {
        ev.preventDefault();
        var next = Math.max(0, Math.min(totalBytes - 1, t.cursorOffset + step));
        if (ev.shiftKey) K.hex.setSelection(t.cursorOffset, next);
        K.hex.setCursor(next);
        var row = Math.floor(next / perRow);
        var el = scrollRef.current;
        if (el) {
          var top = row * ROW_HEIGHT;
          var bottom = top + ROW_HEIGHT;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
        }
        return;
      }

      if (key.length === 1 && HEX_DIGITS.indexOf(key) !== -1) {
        ev.preventDefault();
        setEdit({ offset: t.cursorOffset, digits: key });
      }
    }, [t.romBytes, t.cursorOffset, edit, commitEdit, perRow, totalBytes]);

    if (!t.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Hex Editor'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from File > Load ROM.')
      );
    }

    var firstRow = Math.max(0, Math.floor(view.scrollTop / ROW_HEIGHT) - OVERSCAN);
    var lastRow = Math.min(totalRows - 1, Math.ceil((view.scrollTop + view.height) / ROW_HEIGHT) + OVERSCAN);

    var rows = [];
    for (var r = firstRow; r <= lastRow; r++) {
      var sec = null;
      if (t.highlightLayers.sections) {
        sec = inRanges(sectionRanges, r * perRow);
      }
      rows.push(e(HexRow, {
        key: 'row-' + r,
        row: r,
        bytesPerRow: perRow,
        romBytes: t.romBytes,
        patches: t.patches,
        cursorOffset: t.cursorOffset,
        selStart: t.selection ? t.selection.start : null,
        selEnd: t.selection ? t.selection.end : null,
        flashOffset: t.flashOffset,
        layers: t.highlightLayers,
        groupRanges: groupRanges,
        sectionRange: sec,
        controlHints: controlHints,
        edit: edit,
        onByteDown: onByteDown,
        onByteEdit: onByteEdit
      }));
    }

    var selLength = t.selection ? (t.selection.end - t.selection.start + 1) : 0;
    var cursorValue = K.hex.currentByte(t.cursorOffset);
    var patchCount = Object.keys(t.patches || {}).length;
    var layerKeys = [
      { id: 'sections', label: 'Sections' },
      { id: 'controlCodes', label: 'Control codes' },
      { id: 'groups', label: 'Groups' },
      { id: 'changed', label: 'Changed' }
    ];

    return e('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        height: '100%', minHeight: 0, overflow: 'hidden'
      }
    },
      e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '6px 10px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('button', {
          type: 'button', className: 'kt-btn small',
          title: 'Undo (Ctrl+Z inside the grid)',
          onClick: function () { K.hex.undo(); },
          disabled: !(t.undoStack || []).length,
          style: { display: 'inline-flex', alignItems: 'center', gap: 4 }
        }, K.ui.icon('undo', { size: 12 }), 'Undo'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          title: 'Redo',
          onClick: function () { K.hex.redo(); },
          disabled: !(t.redoStack || []).length,
          style: { display: 'inline-flex', alignItems: 'center', gap: 4 }
        }, K.ui.icon('redo', { size: 12 }), 'Redo'),

        e('span', { style: { opacity: 0.25 } }, '|'),

        e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: '0x1000',
          value: gotoValue,
          onChange: function (ev) { setGotoValue(ev.target.value); },
          onKeyDown: function (ev) {
            if (ev.key !== 'Enter') return;
            var off = parseOffset(gotoValue, /^0x/i.test(gotoValue) ? 'hex' : 'hex');
            if (off !== null) K.hex.gotoOffset(off);
          },
          style: { width: 90, fontFamily: 'var(--kt-font-mono)', fontSize: 11 }
        }),

        e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }
        }, 'Bytes/row',
          e('select', {
            className: 'kt-select',
            value: perRow,
            onChange: function (ev) { K.hex.setBytesPerRow(parseInt(ev.target.value, 10)); },
            style: { width: 58, fontSize: 11 }
          }, [8, 16, 24, 32].map(function (n) {
            return e('option', { key: 'bpr' + n, value: n }, String(n));
          }))
        ),

        e('span', { style: { opacity: 0.25 } }, '|'),

        layerKeys.map(function (l) {
          return e('label', {
            key: l.id,
            style: {
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, cursor: 'pointer'
            }
          },
            e('input', {
              type: 'checkbox',
              checked: t.highlightLayers[l.id] === true,
              onChange: function () { K.hex.toggleHighlightLayer(l.id); }
            }),
            l.label
          );
        }),

        e('span', { style: { flex: 1 } }),

        e('div', { style: { position: 'relative' } },
          e('button', {
            type: 'button',
            className: 'kt-btn small',
            'data-kt-assign-trigger': '1',
            disabled: !t.selection,
            onClick: function () { setAssignOpen(!assignOpen); },
            title: t.selection ? 'Add the selected bytes as a text entry' : 'Select a byte range first'
          }, 'Mark Selection (' + selLength + ')'),
          K.ui.AssignMenu ? e(K.ui.AssignMenu, {
            groups: s ? s.groups : [],
            open: assignOpen,
            direction: 'down',
            onClose: function () { setAssignOpen(false); },
            onSelect: function (groupId) {
              K.hex.addSelectionToGroup(groupId);
              setAssignOpen(false);
            },
            onCreate: function () { setAssignOpen(false); setNewGroupOpen(true); }
          }) : null
        ),

        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: function () { K.hex.exportPatchedRom(); },
          disabled: patchCount === 0
        }, 'Export Patched ROM (' + patchCount + ')')
      ),

      e('div', {
        ref: scrollRef,
        tabIndex: 0,
        onScroll: onScroll,
        onKeyDown: onKeyDown,
        style: {
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          background: 'var(--kt-editor-bg)',
          color: 'var(--kt-editor-fg)',
          outline: 'none'
        }
      },
        e('div', {
          style: {
            position: 'relative',
            height: totalRows * ROW_HEIGHT,
            minWidth: 260 + perRow * 34
          }
        }, rows)
      ),

      e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '3px 10px',
          borderTop: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-statusbar-bg)',
          color: 'var(--kt-statusbar-fg)',
          fontSize: 11,
          fontFamily: 'var(--kt-font-mono)'
        }
      },
        e('span', null, hex8(t.cursorOffset) + ' (' + t.cursorOffset + ')'),
        e('span', null, 'Sel: ' + (t.selection
          ? selLength + ' B  ' + hex8(t.selection.start) + ' - ' + hex8(t.selection.end)
          : '-')),
        e('span', null, cursorValue === null ? '-' :
          'Dec ' + cursorValue + '  Hex ' + hex2(cursorValue) +
          '  Bin ' + cursorValue.toString(2).padStart(8, '0') +
          '  ' + (isAsciiPrintable(cursorValue) ? "'" + String.fromCharCode(cursorValue) + "'" : '.')),
        e('span', null, 'Patches: ' + patchCount),
        e('span', { style: { flex: 1 } }),
        e('span', { style: { opacity: 0.7 } }, t.romSystem || '')
      ),

      K.ui.NewGroupModal ? e(K.ui.NewGroupModal, {
        open: newGroupOpen,
        onClose: function () { setNewGroupOpen(false); },
        onCreate: function (name) {
          var id = K.search.createGroup(name);
          if (id) K.hex.addSelectionToGroup(id);
          setNewGroupOpen(false);
        }
      }) : null
    );
  }

  K.ui.registerTabProvider('hex', HexTab);

})(window);
