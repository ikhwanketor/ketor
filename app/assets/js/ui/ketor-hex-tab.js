/* ============================================================
   Ketor - Hex Editor Tab (v2)
   ------------------------------------------------------------
   Batch 18b: fixes and polish after testing against a real
   8 MB GBA ROM.

   - Clicking a byte used to move the cursor to the last byte of
     the row: the cell handlers closed over a single var declared
     inside the loop. Cells are now built through a factory so
     every handler owns its offset. Regression covered by test.
   - The grid is colour coded: each section gets its own accent
     used for the row band and the legend, changed bytes, group
     ranges, control codes, bookmarks and search hits each have
     a distinct treatment, and the legend explains all of them.
   - Mouse navigation: press and drag selects a range live,
     shift+click extends, double click starts an edit. Keyboard
     navigation is unchanged.
   - Bookmarks and search hits are now visible in the grid, and
     the bytes-per-row, view mode, clear search, clear patches and
     bookmark rename controls are all reachable.
   - The group manager moved out of the sidebar into its own
     column on the right, matching the Search Text activity.
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
  // Browsers cap how tall an element may be: Chrome allows about 33.5M px,
  // Firefox about 17.9M px. Below the cap every row keeps its exact pixel
  // position, which is what makes one wheel notch feel like one wheel notch.
  // Above it the scroll position is mapped proportionally to a row, so the
  // grid still works for the large NDS and Switch images. 16M px sits under
  // the smallest of the two limits and stays exact for ROMs up to ~12 MB,
  // which covers NES through GBA without any loss of precision.
  var MAX_VIRTUAL_HEIGHT = 16000000;
  var HEX_DIGITS = '0123456789abcdefABCDEF';
  var GUTTER = 82;
  var CELL = 22;
  var ASCII_CELL = 10;

  /* Palette. Accents are mid tone so they stay readable on both the
     dark and the light workbench themes, and every meaning has exactly
     one colour so the legend never lies. */
  var C = {
    cursorBg: 'var(--kt-focus-border, #007fd4)',
    cursorFg: '#ffffff',
    selBg: 'var(--kt-editor-selection, #264f78)',
    selFg: 'var(--kt-list-active-selection-fg, #ffffff)',
    changedBg: 'rgba(229,166,99,0.26)',
    changedFg: 'var(--kt-warning-fg, #cca700)',
    groupBg: 'rgba(86,156,214,0.20)',
    groupFg: 'var(--kt-info-fg, #75beff)',
    controlBg: 'rgba(197,134,192,0.20)',
    controlFg: '#c586c0',
    bookmarkBg: 'rgba(78,201,176,0.18)',
    hitBg: 'rgba(255,214,102,0.20)',
    hitCurrentBg: 'rgba(255,214,102,0.50)',
    hitFg: 'var(--kt-editor-fg)',
    flashBg: 'rgba(255,255,255,0.55)',
    flashFg: '#101418'
  };

  function hex2(v) { return (Number(v) & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
  function hex8(v) { return Number(v || 0).toString(16).toUpperCase().padStart(8, '0'); }
  function isAsciiPrintable(v) { return v >= 0x20 && v <= 0x7E; }

  function tint(hex, alpha) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 'transparent';
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 0xFF) + ',' + ((n >> 8) & 0xFF) + ',' + (n & 0xFF) + ',' + alpha + ')';
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
    return (offset <= r.end) ? r : null;
  }

  function toRanges(list) {
    if (!list || !list.length) return [];
    return list.slice().sort(function (a, b) { return a.start - b.start; });
  }

  /* Cell factory. Every handler closes over its own arguments instead of
     a loop variable, which is what broke click targeting before. */
  function byteCell(spec) {
    return e('span', {
      key: spec.key,
      title: spec.title,
      onMouseDown: function (ev) {
        ev.preventDefault();
        spec.onDown(spec.offset, ev.shiftKey);
      },
      onMouseEnter: function (ev) {
        if (ev.buttons & 1) spec.onEnter(spec.offset);
      },
      onDoubleClick: function () { spec.onEdit(spec.offset); },
      style: spec.style
    }, spec.text);
  }

  function HexRow(props) {
    var row = props.row;
    var perRow = props.bytesPerRow;
    var bytes = props.romBytes;
    var base = row * perRow;
    var section = props.section;
    var showAscii = props.viewMode !== 'hex';

    var cells = [];
    var asciiCells = [];

    for (var i = 0; i < perRow; i++) {
      var off = base + i;

      if (off >= bytes.length) {
        cells.push(e('span', { key: 'e' + i, style: { display: 'inline-block', width: CELL } }, ' '));
        if (showAscii) {
          asciiCells.push(e('span', { key: 'ae' + i, style: { display: 'inline-block', width: ASCII_CELL } }, ' '));
        }
        continue;
      }

      var raw = bytes[off] & 0xFF;
      var patched = props.patches[off] !== undefined;
      var value = patched ? props.patches[off] : raw;
      var bookmark = props.bookmarkMap[off];
      var hitIndex = props.hitMap[off];
      var isHit = hitIndex !== undefined;
      var isCurrentHit = isHit && hitIndex === props.currentHitIndex;
      var isCursor = off === props.cursorOffset;
      var inSel = props.selStart !== null && off >= props.selStart && off <= props.selEnd;
      var isFlash = off === props.flashOffset;
      var inGroup = props.layers.groups ? inRanges(props.groupRanges, off) : null;
      var hint = props.layers.controlCodes ? props.controlHints[value] : null;
      var editing = props.edit && props.edit.offset === off;

      var bg = 'transparent';
      var fg = 'var(--kt-editor-fg)';
      var weight = 400;

      if (props.layers.sections && section) bg = tint(section.color, 0.07);
      if (props.layers.bookmarks && bookmark) bg = C.bookmarkBg;
      if (inGroup) { bg = C.groupBg; fg = C.groupFg; }
      if (hint) { bg = C.controlBg; fg = C.controlFg; }
      if (props.layers.searchHits && isHit) bg = C.hitBg;
      if (props.layers.searchHits && isCurrentHit) bg = C.hitCurrentBg;
      if (props.layers.changed && patched) { bg = C.changedBg; fg = C.changedFg; weight = 700; }
      if (inSel) { bg = C.selBg; fg = C.selFg; }
      if (isCursor) { bg = C.cursorBg; fg = C.cursorFg; weight = 700; }
      if (isFlash) { bg = C.flashBg; fg = C.flashFg; }

      var text = hex2(value);
      if (editing) text = props.edit.digits.length ? props.edit.digits + '_' : '__';

      var title = '0x' + hex8(off) + '   dec ' + value + '   bin ' + value.toString(2).padStart(8, '0') +
        (isAsciiPrintable(value) ? "   '" + String.fromCharCode(value) + "'" : '') +
        (patched ? '\npatched, was ' + hex2(raw) : '') +
        (bookmark ? '\nbookmark: ' + bookmark.label : '') +
        (inGroup ? '\ngroup text, ' + (inGroup.end - inGroup.start + 1) + ' byte(s)' : '') +
        (hint ? '\n' + hint : '') +
        (section ? '\n' + section.label : '');

      cells.push(byteCell({
        key: 'b' + i,
        offset: off,
        text: text,
        title: title,
        onDown: props.onByteDown,
        onEnter: props.onByteEnter,
        onEdit: props.onByteEdit,
        style: {
          display: 'inline-block',
          width: CELL,
          textAlign: 'center',
          background: bg,
          color: fg,
          fontWeight: weight,
          fontFamily: 'var(--kt-font-mono)',
          borderBottom: (props.layers.bookmarks && bookmark) ? ('2px solid ' + bookmark.color) : '2px solid transparent',
          cursor: 'pointer',
          userSelect: 'none'
        }
      }));

      if (showAscii) {
        asciiCells.push(byteCell({
          key: 'a' + i,
          offset: off,
          text: isAsciiPrintable(value) ? String.fromCharCode(value) : '.',
          title: title,
          onDown: props.onByteDown,
          onEnter: props.onByteEnter,
          onEdit: props.onByteEdit,
          style: {
            display: 'inline-block',
            width: ASCII_CELL,
            textAlign: 'center',
            background: bg,
            color: fg,
            fontWeight: weight,
            fontFamily: 'var(--kt-font-mono)',
            cursor: 'pointer',
            userSelect: 'none'
          }
        }));
      }
    }

    return e('div', {
      style: {
        position: 'absolute',
        top: (row - (props.rowOffset || 0)) * ROW_HEIGHT,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        lineHeight: ROW_HEIGHT + 'px',
        whiteSpace: 'pre',
        fontSize: 12,
        borderLeft: section ? ('3px solid ' + section.color) : '3px solid transparent',
        paddingLeft: 6
      }
    },
      e('span', {
        style: {
          display: 'inline-block',
          width: GUTTER - 9,
          color: 'var(--kt-input-placeholder-fg)',
          fontFamily: 'var(--kt-font-mono)',
          userSelect: 'none'
        }
      }, hex8(base)),
      cells,
      showAscii ? e('span', { style: { display: 'inline-block', width: 12 } }, ' ') : null,
      showAscii ? e('span', { style: { fontFamily: 'var(--kt-font-mono)' } }, asciiCells) : null
    );
  }

  function LegendSwatch(props) {
    return e('span', {
      style: {
        width: 12, height: 12, borderRadius: 2, flex: '0 0 auto',
        background: props.bg,
        border: '1px solid var(--kt-widget-border-default)',
        borderBottom: props.border || undefined
      }
    });
  }

  function LayerLegend(props) {
    var items = [
      { key: 'sections', label: 'Sections', bg: 'rgba(86,156,214,0.35)' },
      { key: 'changed', label: 'Changed byte', bg: C.changedBg, border: '2px solid ' + C.changedFg },
      { key: 'groups', label: 'Group text', bg: C.groupBg, border: '2px solid ' + C.groupFg },
      { key: 'controlCodes', label: 'Control code', bg: C.controlBg, border: '2px solid ' + C.controlFg },
      { key: 'bookmarks', label: 'Bookmark', bg: C.bookmarkBg, border: '2px solid #4ec9b0' },
      { key: 'searchHits', label: 'Search hit', bg: C.hitBg, border: '2px solid rgba(255,214,102,0.9)' }
    ];

    return e('div', null,
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        items.map(function (it) {
          return e('label', {
            key: it.key,
            style: {
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, cursor: 'pointer', padding: '1px 0'
            }
          },
            e('input', {
              type: 'checkbox',
              checked: props.layers[it.key] === true,
              onChange: function () { props.onToggle(it.key); }
            }),
            e(LegendSwatch, { bg: it.bg, border: it.border }),
            e('span', null, it.label)
          );
        }),

        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' } },
          e(LegendSwatch, { bg: C.selBg }),
          e('span', { style: { opacity: 0.8 } }, 'Selection')
        ),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' } },
          e(LegendSwatch, { bg: C.cursorBg }),
          e('span', { style: { opacity: 0.8 } }, 'Cursor')
        )
      ),

      props.sections.length ? e('div', { style: { marginTop: 10 } },
        e('div', {
          style: {
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
            opacity: 0.55, marginBottom: 4
          }
        }, 'ROM layout'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          props.sections.map(function (sec) {
            var active = props.cursorOffset >= sec.start && props.cursorOffset <= sec.end;
            return e('div', {
              key: sec.id,
              onClick: function () { props.onGoto(sec.start); },
              title: 'Jump to 0x' + hex8(sec.start),
              style: {
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, cursor: 'pointer', padding: '1px 2px',
                borderRadius: 2,
                background: active ? tint(sec.color, 0.22) : 'transparent'
              }
            },
              e(LegendSwatch, { bg: tint(sec.color, 0.75) }),
              e('span', {
                style: {
                  flex: 1, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }
              }, sec.label),
              e('span', {
                style: {
                  fontFamily: 'var(--kt-font-mono)', fontSize: 10,
                  opacity: 0.6, flex: '0 0 auto'
                }
              }, hex8(sec.start))
            );
          })
        )
      ) : null
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

    var assignSt = uS(false);
    var assignOpen = assignSt[0];
    var setAssignOpen = assignSt[1];
    var newGroupSt = uS(false);
    var newGroupOpen = newGroupSt[0];
    var setNewGroupOpen = newGroupSt[1];
    var groupColSt = uS(true);
    var groupsOpen = groupColSt[0];
    var setGroupsOpen = groupColSt[1];

    var dragRef = uR(null);
    var rafRef = uR(0);

    var perRow = t.bytesPerRow || 16;
    var totalBytes = t.romBytes ? t.romBytes.length : 0;
    var totalRows = Math.max(1, Math.ceil(totalBytes / perRow));

    var fullHeight = totalRows * ROW_HEIGHT;
    var virtualHeight = Math.min(fullHeight, MAX_VIRTUAL_HEIGHT);
    var proportional = virtualHeight < fullHeight;
    var visibleRows = Math.max(1, Math.ceil((view.height || 400) / ROW_HEIGHT));

    // Scroll position for a byte offset, in whichever mode is active.
    function scrollTopForRow(row) {
      var el = scrollRef.current;
      var height = el ? el.clientHeight : (view.height || 400);
      if (!proportional) {
        return Math.max(0, row * ROW_HEIGHT - Math.floor(height / 2) + ROW_HEIGHT);
      }
      var maxFirst = Math.max(1, totalRows - visibleRows);
      var frac = Math.min(1, Math.max(0, row / maxFirst));
      return Math.max(0, frac * Math.max(0, virtualHeight - height));
    }

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

    // Releasing the mouse outside the grid must still end the drag.
    uE(function () {
      function stop() { dragRef.current = null; }
      document.addEventListener('mouseup', stop);
      return function () { document.removeEventListener('mouseup', stop); };
    }, []);

    var onScroll = uC(function () {
      var el = scrollRef.current;
      if (!el) return;
      if (rafRef.current) return;
      rafRef.current = global.requestAnimationFrame(function () {
        rafRef.current = 0;
        setView({ scrollTop: el.scrollTop, height: el.clientHeight || 400 });
      });
    }, []);

    uE(function () {
      var el = scrollRef.current;
      if (!el || !t.romBytes) return;
      el.scrollTop = scrollTopForRow(Math.floor((t.focusOffset || 0) / perRow));
      setView({ scrollTop: el.scrollTop, height: el.clientHeight || 400 });
    }, [t.focusToken, t.bytesPerRow]);

    uE(function () {
      var el = scrollRef.current;
      if (el) el.focus();
      if (t.romBytes) K.hex.refreshSections();
    }, [!!t.romBytes]);

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

    var bookmarkMap = uM(function () {
      var map = {};
      (t.bookmarks || []).forEach(function (b) { map[b.offset] = b; });
      return map;
    }, [t.bookmarks]);

    var hitMap = uM(function () {
      var map = {};
      (t.searchResults || []).forEach(function (off, idx) { map[off] = idx; });
      return map;
    }, [t.searchResults]);

    var sections = t.sections || [];
    var sectionRanges = uM(function () {
      return sections.map(function (sec) {
        return {
          start: sec.start,
          end: sec.end === null ? totalBytes - 1 : sec.end,
          color: sec.color
        };
      });
    }, [t.sections, totalBytes]);

    var controlHints = (K.core && K.core.CONTROL_HINTS) ? K.core.CONTROL_HINTS : {};

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
        K.hex.setCursor(offset);
        return;
      }
      dragRef.current = offset;
      K.hex.setCursor(offset);
      K.hex.setSelection(offset, offset);
    }, [edit, t.cursorOffset]);

    var onByteEnter = uC(function (offset) {
      if (dragRef.current === null || dragRef.current === undefined) return;
      K.hex.setSelection(dragRef.current, offset);
      K.hex.setCursor(offset);
    }, []);

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
        }
        return;
      }

      var pageRows = Math.max(1, Math.floor((scrollRef.current ? scrollRef.current.clientHeight : 400) / ROW_HEIGHT));
      var step = 0;
      if (key === 'ArrowLeft') step = -1;
      else if (key === 'ArrowRight') step = 1;
      else if (key === 'ArrowUp') step = -perRow;
      else if (key === 'ArrowDown') step = perRow;
      else if (key === 'PageUp') step = -perRow * pageRows;
      else if (key === 'PageDown') step = perRow * pageRows;
      else if (key === 'Home') { ev.preventDefault(); K.hex.setCursor(0); return; }
      else if (key === 'End') { ev.preventDefault(); K.hex.setCursor(totalBytes - 1); return; }

      if (step !== 0) {
        ev.preventDefault();
        var next = Math.max(0, Math.min(totalBytes - 1, t.cursorOffset + step));
        if (ev.shiftKey) K.hex.setSelection(t.cursorOffset, next);
        K.hex.setCursor(next);
        var el = scrollRef.current;
        if (el && !proportional) {
          var top = Math.floor(next / perRow) * ROW_HEIGHT;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
            el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
          }
        } else if (el) {
          el.scrollTop = scrollTopForRow(Math.floor(next / perRow));
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

    var firstRow, lastRow, rowOffset;
    if (proportional) {
      var maxFirst = Math.max(0, totalRows - visibleRows);
      var frac = virtualHeight > view.height
        ? view.scrollTop / (virtualHeight - view.height)
        : 0;
      firstRow = Math.max(0, Math.min(maxFirst, Math.round(frac * maxFirst)));
      lastRow = Math.min(totalRows - 1, firstRow + visibleRows + OVERSCAN);
      rowOffset = firstRow;
    } else {
      firstRow = Math.max(0, Math.floor(view.scrollTop / ROW_HEIGHT) - OVERSCAN);
      lastRow = Math.min(totalRows - 1, Math.ceil((view.scrollTop + view.height) / ROW_HEIGHT) + OVERSCAN);
      rowOffset = 0;
    }

    var rows = [];
    for (var r = firstRow; r <= lastRow; r++) {
      rows.push(e(HexRow, {
        key: 'row-' + r,
        row: r,
        rowOffset: rowOffset,
        bytesPerRow: perRow,
        romBytes: t.romBytes,
        patches: t.patches,
        cursorOffset: t.cursorOffset,
        selStart: t.selection ? t.selection.start : null,
        selEnd: t.selection ? t.selection.end : null,
        flashOffset: t.flashOffset,
        layers: t.highlightLayers,
        viewMode: t.viewMode,
        groupRanges: groupRanges,
        bookmarkMap: bookmarkMap,
        hitMap: hitMap,
        currentHitIndex: t.searchIndex,
        section: t.highlightLayers.sections ? inRanges(sectionRanges, r * perRow) : null,
        controlHints: controlHints,
        edit: edit,
        onByteDown: onByteDown,
        onByteEnter: onByteEnter,
        onByteEdit: onByteEdit
      }));
    }

    var selLength = t.selection ? (t.selection.end - t.selection.start + 1) : 0;
    var cursorValue = K.hex.currentByte(t.cursorOffset);
    var patchCount = Object.keys(t.patches || {}).length;
    var groups = (s && s.groups) ? s.groups : [];
    var selText = t.selection ? K.hex.selectionText() : '';
    var currentSection = null;
    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var secEnd = sec.end === null ? totalBytes - 1 : sec.end;
      if (t.cursorOffset >= sec.start && t.cursorOffset <= secEnd) { currentSection = sec; break; }
    }

    var toolbarBtn = {
      display: 'inline-flex', alignItems: 'center', gap: 4
    };

    return e('div', {
      style: { display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }
    },
      e('div', {
        style: {
          flex: '1 1 auto', minWidth: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
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
            title: 'Undo (or press a hex digit to start editing)',
            onClick: function () { K.hex.undo(); },
            disabled: !(t.undoStack || []).length,
            style: toolbarBtn
          }, K.ui.icon('undo', { size: 13 }), 'Undo'),
          e('button', {
            type: 'button', className: 'kt-btn small',
            title: 'Redo',
            onClick: function () { K.hex.redo(); },
            disabled: !(t.redoStack || []).length,
            style: toolbarBtn
          }, K.ui.icon('redo', { size: 13 }), 'Redo'),

          e('span', { style: { opacity: 0.25 } }, '|'),

          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 } },
            'Bytes/row',
            e('select', {
              className: 'kt-select',
              value: perRow,
              onChange: function (ev) { K.hex.setBytesPerRow(parseInt(ev.target.value, 10)); },
              style: { width: 56, fontSize: 11 }
            }, [8, 16, 24, 32].map(function (n) {
              return e('option', { key: 'bpr' + n, value: n }, String(n));
            }))
          ),

          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 } },
            'View',
            e('select', {
              className: 'kt-select',
              value: t.viewMode,
              onChange: function (ev) { K.hex.setViewMode(ev.target.value); },
              style: { width: 96, fontSize: 11 }
            },
              e('option', { value: 'hex+ascii' }, 'Hex + ASCII'),
              e('option', { value: 'hex' }, 'Hex only')
            )
          ),

          e('button', {
            type: 'button', className: 'kt-btn small',
            onClick: function () { setGroupsOpen(!groupsOpen); },
            title: groupsOpen ? 'Hide the group column' : 'Show the group column'
          }, groupsOpen ? 'Groups \u25b8' : 'Groups \u25c2'),

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
              groups: groups,
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
            disabled: patchCount === 0,
            title: 'Download a copy of the ROM with every patch applied'
          }, 'Export Patched ROM (' + patchCount + ')'),

          e('button', {
            type: 'button', className: 'kt-btn small secondary',
            onClick: function () {
              if (patchCount && global.confirm('Discard all ' + patchCount + ' patch(es)?')) {
                K.hex.clearPatches();
              }
            },
            disabled: patchCount === 0,
            title: 'Discard every patch'
          }, 'Clear')
        ),

        e('div', {
          ref: scrollRef,
          tabIndex: 0,
          onScroll: onScroll,
          onKeyDown: onKeyDown,
          onMouseUp: function () { dragRef.current = null; },
          onMouseLeave: function () { dragRef.current = null; },
          style: {
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'auto',
            position: 'relative',
            background: 'var(--kt-editor-bg)',
            color: 'var(--kt-editor-fg)',
            outline: 'none',
            cursor: 'crosshair'
          }
        },
          e('div', {
            style: {
              position: 'relative',
              height: virtualHeight,
              minWidth: 300 + perRow * (CELL + (t.viewMode === 'hex' ? 0 : ASCII_CELL))
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
          currentSection ? e('span', {
            style: { display: 'inline-flex', alignItems: 'center', gap: 5 }
          },
            e('span', {
              style: {
                width: 9, height: 9, borderRadius: 2,
                background: tint(currentSection.color, 0.8)
              }
            }),
            e('span', null, currentSection.label)
          ) : null,
          e('span', null, 'Sel: ' + (t.selection
            ? selLength + ' B  ' + hex8(t.selection.start) + ' - ' + hex8(t.selection.end)
            : '-')),
          selText ? e('span', {
            title: selText,
            style: {
              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', opacity: 0.85
            }
          }, '"' + selText.slice(0, 40) + (selText.length > 40 ? '\u2026' : '') + '"') : null,
          e('span', null, cursorValue === null ? '-' :
            'Dec ' + cursorValue + '  Hex ' + hex2(cursorValue) +
            '  Bin ' + cursorValue.toString(2).padStart(8, '0') +
            '  ' + (isAsciiPrintable(cursorValue) ? "'" + String.fromCharCode(cursorValue) + "'" : '.')),
          e('span', null, 'Patches: ' + patchCount),
          e('span', { style: { flex: 1 } }),
          e('span', { style: { opacity: 0.7 } }, t.romSystem || '')
        )
      ),

      groupsOpen ? e('div', {
        style: {
          flex: '0 0 268px',
          minWidth: 0,
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: 8,
          borderLeft: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)',
          overflow: 'hidden'
        }
      },
        e(K.ui.KtBox, {
          id: 'hex-layers',
          title: 'Layers',
          bodyStyle: { padding: 8, overflow: 'auto' },
          style: { flex: '0 0 auto', maxHeight: '55%' }
        },
          e(LayerLegend, {
            layers: t.highlightLayers,
            onToggle: K.hex.toggleHighlightLayer,
            sections: sections,
            onGoto: K.hex.gotoOffset,
            cursorOffset: t.cursorOffset
          })
        ),

        e(K.ui.KtBox, {
          id: 'hex-groups',
          title: 'Groups (' + groups.length + ')',
          bodyStyle: { padding: 0, overflow: 'auto' },
          style: { flex: '1 1 auto', minHeight: 0 }
        },
          e(K.ui.KetorGroupsPanel, {
            groups: groups,
            texts: (s && s.texts) ? s.texts : [],
            expanded: (s && s.expandedGroups) ? s.expandedGroups : {},
            onToggleExpand: function (id) { if (K.search) K.search.toggleGroupExpand(id); },
            onSelect: function (id) { if (K.search) K.search.selectGroup(id); },
            onRename: function (id, name) { if (K.search) K.search.renameGroup(id, name); },
            onDelete: function (id) { if (K.search) K.search.deleteGroup(id); },
            onRemoveText: function (gid, off) { if (K.search) K.search.removeFromGroup(gid, off); },
            onMoveGroup: function (id, dir) { if (K.search) K.search.moveGroup(id, dir); },
            onMoveText: function (gid, off, dir) { if (K.search) K.search.moveTextInGroup(gid, off, dir); },
            onSortTexts: function (gid) { if (K.search) K.search.sortTextsInGroup(gid); },
            selectedGroupId: s ? s.selectedGroupId : null,
            emptyMessage: 'No groups yet. Drag over the bytes you want, then use "Mark Selection".'
          })
        )
      ) : null,

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
