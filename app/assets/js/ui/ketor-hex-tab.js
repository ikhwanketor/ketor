/* ============================================================
   Ketor - Hex Editor Tab (v3)
   ------------------------------------------------------------
   Batch 18c, after testing against a real 8 MB GBA ROM.

   - Selection to group now reuses the registry (see
     ketor-hex-state.js): bytes an extracted entry already
     describes are grouped, never duplicated into a second row.
   - Colours were rebuilt so every meaning has its own treatment
     rather than its own shade of the same background: sections
     moved to the offset gutter, changed bytes and the selection
     are solid, the cursor is inverted, group ranges and control
     codes are underlines, bookmarks are a tint plus a rule, and
     search hits are the only yellow. Every pair was checked on a
     dark and on a light workbench theme, because the light theme
     selection token is a pale blue that white text cannot sit on.
   - The ASCII column is editable: double click it and type the
     character, or switch the toolbar to ASCII typing and type
     straight into the grid. Double clicking a hex cell still
     edits nibbles.
   - Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z undo and redo.
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
  var GUTTER = 82;
  var CELL = 22;
  var ASCII_CELL = 10;
  // Browsers cap how tall an element may be: Chrome about 33.5M px, Firefox
  // about 17.9M px. Below the cap every row keeps its exact pixel position,
  // which is what makes one wheel notch feel like one wheel notch. Above it
  // the scroll position maps proportionally to a row so the big NDS and
  // Switch images still work. 16M px sits under the smaller limit and stays
  // exact for ROMs up to ~12 MB, covering NES through GBA precisely.
  var MAX_VIRTUAL_HEIGHT = 16000000;

  /* Palette, modelled on how ImHex paints a hex grid: every layer owns a
     saturated background of its own hue, so a byte's meaning is readable at
     a glance instead of having to be decoded from a shade.
     Rule 1: each hue is dark enough for white text, or bright enough for
     near black text, so it stays legible on the dark and on the light
     workbench theme. Mid alpha over a light theme is what made an earlier
     version unreadable.
     Rule 2: one hue per meaning. Sections keep the offset gutter to
     themselves so they never compete with a byte level layer. */
  var C = {
    cursorBg: 'var(--kt-editor-fg)',
    cursorFg: 'var(--kt-editor-bg)',
    selBg: '#1d4ed8',
    selFg: '#ffffff',
    changedBg: '#a8341a',
    changedFg: '#ffffff',
    groupBg: '#1f6b3a',
    groupFg: '#ffffff',
    controlBg: '#6b2f8f',
    controlFg: '#ffffff',
    hitBg: '#8a6a12',
    hitFg: '#ffe9a8',
    hitCurrentBg: '#ffd24a',
    hitCurrentFg: '#101418',
    bookmarkBg: '#a82f66',
    bookmarkFg: '#ffffff',
    flashBg: 'var(--kt-editor-fg)',
    flashFg: 'var(--kt-editor-bg)'
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

  /* Cell factory. Every handler reads its offset and mode from the spec
     object, which is built fresh per byte, so no handler can close over a
     loop variable. That was the bug that made every click land on the last
     byte of the row. */
  function byteCell(spec) {
    return e('span', {
      key: spec.key,
      title: spec.title,
      onMouseDown: function (ev) {
        ev.preventDefault();
        spec.onDown(spec.offset, ev.shiftKey, spec.mode);
      },
      onMouseEnter: function (ev) {
        if (ev.buttons & 1) spec.onEnter(spec.offset);
      },
      onDoubleClick: function () { spec.onEdit(spec.offset, spec.mode); },
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
      var rule = null;

      // Weakest meaning first, strongest last; the last one to paint wins.
      if (inGroup) { bg = C.groupBg; fg = C.groupFg; weight = 500; }
      if (hint) { bg = C.controlBg; fg = C.controlFg; weight = 500; }
      if (props.layers.bookmarks && bookmark) {
        bg = C.bookmarkBg;
        fg = C.bookmarkFg;
        // The rule keeps the bookmark's own colour visible on top of the
        // shared bookmark background.
        rule = bookmark.color;
      }
      if (props.layers.searchHits && isHit && !isCurrentHit) { bg = C.hitBg; fg = C.hitFg; }
      if (props.layers.searchHits && isCurrentHit) { bg = C.hitCurrentBg; fg = C.hitCurrentFg; weight = 700; rule = null; }
      if (props.layers.changed && patched) { bg = C.changedBg; fg = C.changedFg; weight = 700; rule = null; }
      if (inSel) { bg = C.selBg; fg = C.selFg; rule = null; }
      if (isCursor) { bg = C.cursorBg; fg = C.cursorFg; weight = 700; rule = null; }
      if (isFlash) { bg = C.flashBg; fg = C.flashFg; weight = 700; rule = null; }

      var text = hex2(value);
      if (editing && props.edit.mode === 'hex') {
        text = props.edit.digits.length ? props.edit.digits + '_' : '__';
      }

      var title = '0x' + hex8(off) + '   dec ' + value + '   bin ' + value.toString(2).padStart(8, '0') +
        (isAsciiPrintable(value) ? "   '" + String.fromCharCode(value) + "'" : '') +
        (patched ? '\npatched, was ' + hex2(raw) : '') +
        (bookmark ? '\nbookmark: ' + bookmark.label : '') +
        (inGroup ? '\ngroup text, ' + (inGroup.end - inGroup.start + 1) + ' byte(s)' : '') +
        (hint ? '\n' + hint : '') +
        (section ? '\n' + section.label : '');

      var baseStyle = {
        display: 'inline-block',
        textAlign: 'center',
        background: bg,
        color: fg,
        fontWeight: weight,
        fontFamily: 'var(--kt-font-mono)',
        cursor: 'pointer',
        userSelect: 'none'
      };
      var marker = rule ? { boxShadow: 'inset 0 -2px 0 0 ' + rule } : {};

      cells.push(byteCell({
        key: 'b' + i,
        offset: off,
        mode: 'hex',
        text: text,
        title: title,
        onDown: props.onByteDown,
        onEnter: props.onByteEnter,
        onEdit: props.onByteEdit,
        style: Object.assign({ width: CELL }, baseStyle, marker)
      }));

      if (showAscii) {
        var asciiText = isAsciiPrintable(value) ? String.fromCharCode(value) : '.';
        if (editing && props.edit.mode === 'ascii') asciiText = props.edit.char || '_';
        asciiCells.push(byteCell({
          key: 'a' + i,
          offset: off,
          mode: 'ascii',
          text: asciiText,
          title: title + '\ndouble-click to edit this character',
          onDown: props.onByteDown,
          onEnter: props.onByteEnter,
          onEdit: props.onByteEdit,
          style: Object.assign({ width: ASCII_CELL }, baseStyle, marker)
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
        paddingLeft: 6
      }
    },
      e('span', {
        style: {
          display: 'inline-block',
          width: GUTTER - 9,
          paddingLeft: 4,
          boxSizing: 'border-box',
          color: 'var(--kt-editor-fg)',
          fontFamily: 'var(--kt-font-mono)',
          userSelect: 'none',
          // The section lives in the gutter so the byte cells stay free for
          // the layers the user is actually working with.
          background: section ? tint(section.color, props.rowTint) : 'transparent',
          borderLeft: section ? ('3px solid ' + section.color) : '3px solid transparent'
        },
        title: section ? section.label : ''
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
        boxShadow: props.rule ? ('inset 0 -3px 0 0 ' + props.rule) : undefined
      }
    });
  }

  function LayerLegend(props) {
    var items = [
      { key: 'sections', label: 'Section (gutter)', bg: 'rgba(86,156,214,0.45)' },
      { key: 'changed', label: 'Changed byte', bg: C.changedBg },
      { key: 'groups', label: 'Group text', bg: C.groupBg },
      { key: 'controlCodes', label: 'Control code', bg: C.controlBg },
      { key: 'bookmarks', label: 'Bookmark', bg: C.bookmarkBg },
      { key: 'searchHits', label: 'Search hit', bg: C.hitBg }
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
            e(LegendSwatch, { bg: it.bg, rule: it.rule }),
            e('span', null, it.label)
          );
        }),

        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' } },
          e(LegendSwatch, { bg: C.selBg }),
          e('span', { style: { opacity: 0.8 } }, 'Selection')
        ),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' } },
          e(LegendSwatch, { bg: 'var(--kt-editor-fg)' }),
          e('span', { style: { opacity: 0.8 } }, 'Cursor')
        ),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' } },
          e(LegendSwatch, { bg: C.hitCurrentBg }),
          e('span', { style: { opacity: 0.8 } }, 'Current hit')
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
              e(LegendSwatch, { bg: tint(sec.color, 0.55) }),
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

    // Which column the user is working in. Clicking or editing a byte sets
    // it, so typing does the obvious thing without a mode selector.
    var columnSt = uS('hex');
    var activeColumn = columnSt[0];
    var setActiveColumn = columnSt[1];

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

    var onByteDown = uC(function (offset, shiftKey, mode) {
      if (mode === 'ascii' || mode === 'hex') setActiveColumn(mode);
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

    var onByteEdit = uC(function (offset, mode) {
      K.hex.setCursor(offset);
      var m = mode === 'ascii' ? 'ascii' : 'hex';
      setActiveColumn(m);
      setEdit({ offset: offset, digits: '', char: '', mode: m });
    }, []);

    var writeByte = uC(function (offset, value) {
      K.hex.setByte(offset, value);
      K.hex.setCursor(Math.min(totalBytes - 1, offset + 1));
      setEdit(null);
    }, [totalBytes]);

    var onKeyDown = uC(function (ev) {
      if (!t.romBytes) return;
      var key = ev.key;

      if ((ev.ctrlKey || ev.metaKey) && (key === 'z' || key === 'Z')) {
        ev.preventDefault();
        if (ev.shiftKey) K.hex.redo(); else K.hex.undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (key === 'y' || key === 'Y')) {
        ev.preventDefault();
        K.hex.redo();
        return;
      }

      if (edit && edit.mode === 'ascii') {
        if (key === 'Escape' || key === 'Enter') { ev.preventDefault(); setEdit(null); return; }
        if (key === 'Backspace') { ev.preventDefault(); return; }
        if (key.length === 1 && key >= ' ' && key <= '~') {
          ev.preventDefault();
          K.hex.setByte(edit.offset, key.charCodeAt(0));
          // Stay in the character editor and move on, so a whole word can be
          // typed in one go instead of one double click per letter.
          var nextAscii = Math.min(totalBytes - 1, edit.offset + 1);
          K.hex.setCursor(nextAscii);
          setEdit({ offset: nextAscii, digits: '', char: '', mode: 'ascii' });
        }
        return;
      }

      if (edit) {
        if (key === 'Escape') { ev.preventDefault(); setEdit(null); return; }
        if (key === 'Enter') { ev.preventDefault(); commitEdit(edit.digits); return; }
        if (key === 'Backspace') {
          ev.preventDefault();
          setEdit({ offset: edit.offset, digits: edit.digits.slice(0, -1), char: '', mode: 'hex' });
          return;
        }
        if (key.length === 1 && HEX_DIGITS.indexOf(key) !== -1) {
          ev.preventDefault();
          var digits = edit.digits + key;
          if (digits.length >= 2) commitEdit(digits.slice(0, 2));
          else setEdit({ offset: edit.offset, digits: digits, char: '', mode: 'hex' });
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

      if (key.length < 1) return;

      if (activeColumn === 'ascii') {
        // ASCII typing writes straight through, like the text pane of a hex editor.
        if (key.length === 1 && key >= ' ' && key <= '~') {
          ev.preventDefault();
          writeByte(t.cursorOffset, key.charCodeAt(0));
        }
        return;
      }

      if (key.length === 1 && HEX_DIGITS.indexOf(key) !== -1) {
        ev.preventDefault();
        setEdit({ offset: t.cursorOffset, digits: key, char: '', mode: 'hex' });
      }
    }, [t.romBytes, t.cursorOffset, edit, commitEdit, perRow, totalBytes, activeColumn, writeByte]);

    if (!t.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Hex Editor'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from File > Load ROM.')
      );
    }

    var firstRow, lastRow, rowOffset;
    if (proportional) {
      var maxFirst = Math.max(0, totalRows - visibleRows);
      var frac = view.height && virtualHeight > view.height
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
      var sec = null;
      var secTint = 0.15;
      if (t.highlightLayers.sections) {
        sec = inRanges(sectionRanges, r * perRow);
        if (sec) secTint = (sectionRanges.indexOf(sec) % 2 === 0) ? 0.30 : 0.15;
      }
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
        section: sec,
        rowTint: secTint,
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
    var coveredBySelection = t.selection ? K.hex.selectionTexts() : [];
    var currentSection = null;
    for (var si = 0; si < sections.length; si++) {
      var sc = sections[si];
      var scEnd = sc.end === null ? totalBytes - 1 : sc.end;
      if (t.cursorOffset >= sc.start && t.cursorOffset <= scEnd) { currentSection = sc; break; }
    }

    var toolbarBtn = { display: 'inline-flex', alignItems: 'center', gap: 4 };

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
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap',
            padding: '5px 10px',
            borderBottom: '1px solid var(--kt-widget-border-default)',
            background: 'var(--kt-sidebar-bg)',
            overflowX: 'auto'
          }
        },
          e('button', {
            type: 'button', className: 'kt-btn small icon-only',
            title: 'Undo (Ctrl+Z)',
            onClick: function () { K.hex.undo(); },
            disabled: !(t.undoStack || []).length,
            style: toolbarBtn
          }, K.ui.icon('undo', { size: 15 })),
          e('button', {
            type: 'button', className: 'kt-btn small icon-only',
            title: 'Redo (Ctrl+Y)',
            onClick: function () { K.hex.redo(); },
            disabled: !(t.redoStack || []).length,
            style: toolbarBtn
          }, K.ui.icon('redo', { size: 15 })),

          e('span', { style: { opacity: 0.25 } }, '|'),

          e('select', {
            className: 'kt-select',
            value: perRow,
            title: 'Bytes per row',
            onChange: function (ev) { K.hex.setBytesPerRow(parseInt(ev.target.value, 10)); },
            style: { width: 54, fontSize: 11, flex: '0 0 auto' }
          }, [8, 16, 24, 32].map(function (n) {
            return e('option', { key: 'bpr' + n, value: n }, n + '/row');
          })),

          e('select', {
            className: 'kt-select',
            value: t.viewMode,
            title: 'View mode',
            onChange: function (ev) { K.hex.setViewMode(ev.target.value); },
            style: { width: 92, fontSize: 11, flex: '0 0 auto' }
          },
            e('option', { value: 'hex+ascii' }, 'Hex + ASCII'),
            e('option', { value: 'hex' }, 'Hex only')
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
              title: !t.selection
                ? 'Select a byte range first'
                : (coveredBySelection.length
                    ? 'Selection covers ' + coveredBySelection.length + ' existing text(s); those will be grouped'
                    : 'Selection covers no known text; a new entry will be created')
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
              maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', opacity: 0.85
            }
          }, '"' + selText.slice(0, 36) + (selText.length > 36 ? '\u2026' : '') + '"') : null,
          coveredBySelection.length ? e('span', {
            style: { color: 'var(--kt-color-success, #4ec9b0)' },
            title: 'These registry entries sit under the selection; Mark Selection groups them'
          }, coveredBySelection.length + ' known text(s)') : null,
          e('span', null, cursorValue === null ? '-' :
            'Dec ' + cursorValue + '  Hex ' + hex2(cursorValue) +
            '  Bin ' + cursorValue.toString(2).padStart(8, '0') +
            '  ' + (isAsciiPrintable(cursorValue) ? "'" + String.fromCharCode(cursorValue) + "'" : '.')),
          e('span', null, 'Patches: ' + patchCount),
          e('span', {
            title: 'Typing follows the column you last clicked: hex digits edit the byte, characters edit the ASCII column',
            style: { opacity: 0.75 }
          }, 'Typing ' + (activeColumn === 'ascii' ? 'ASCII' : 'hex')),
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
          style: { flex: '0 0 auto', maxHeight: '58%' }
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
