/* ============================================================
   Ketor - Translate Tab (v3)
   ------------------------------------------------------------
   Batch 19: Kruptar7 style layout.

   Top: the active group as a title, then a numbered preview list
   of that group's entries only (000001, 000002, ...), with an
   "Index N of M" footer and the pager.
   Bottom: the active entry, with a read-only Original box and an
   editable Translation box side by side. Both carry the Kruptar7
   chrome: a positional ruler on top, x/y carets, a Size readout
   in bytes and an insert indicator.

   Size uses K.translate.measureBytes(), which runs the same
   encoder the build worker runs, so the number next to a box is
   the number of bytes the build will write.

   The pointer/table property panel from Kruptar7 is deliberately
   not reproduced: pointers are handled per console through
   getSystemProfile().

   Batch 20: typing no longer writes to the registry on every
   keystroke, the language pickers are real selects, the provider
   list comes from core/translator.js (DeepSeek and the rest),
   and the free text filter became a status filter plus a jump to
   the next untranslated entry.
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

  var MONO = 'var(--kt-font-mono)';

  /* Languages offered by the free chain (MyMemory, Google, LibreTranslate,
     Apertium) plus a few common ones. The select falls back to showing any
     code that is not listed, so a value loaded from a project still displays. */
  var LANGUAGES = [
    ['en', 'English'], ['id', 'Indonesian'], ['ja', 'Japanese'], ['ko', 'Korean'],
    ['zh', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'],
    ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'],
    ['pt', 'Portuguese'], ['ru', 'Russian'], ['ar', 'Arabic'], ['nl', 'Dutch'],
    ['pl', 'Polish'], ['tr', 'Turkish'], ['sv', 'Swedish'], ['th', 'Thai'],
    ['vi', 'Vietnamese'], ['ms', 'Malay'], ['fil', 'Filipino'], ['hi', 'Hindi'],
    ['bn', 'Bengali'], ['uk', 'Ukrainian'], ['cs', 'Czech'], ['da', 'Danish'],
    ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'], ['hu', 'Hungarian'],
    ['no', 'Norwegian'], ['ro', 'Romanian'], ['sk', 'Slovak'], ['bg', 'Bulgarian'],
    ['ca', 'Catalan'], ['fa', 'Persian'], ['lt', 'Lithuanian'], ['lv', 'Latvian']
  ];

  // Batch 21: one toolbar is one row, so every button on it is the same size.
  // The middle toolbar used to mix kt-btn with kt-btn small, which read as
  // two different rows of controls.
  var TOOL_BTN = {
    height: 24,
    minWidth: 88,
    padding: '0 10px',
    fontSize: 11,
    lineHeight: '22px',
    flex: '0 0 auto'
  };

  function pad6(n) { return String(n).padStart(6, '0'); }

  /* The list shows the text the way the boxes below it do: real line breaks,
     no table tokens and no marker characters. A row grows with its text, the
     way Kruptar's list does. */
  function listText(text) {
    return K.translate.toDisplay(text);
  }

  function overflowOf(byteLen, originalLen) {
    return originalLen > 0 && byteLen > originalLen;
  }

  /* Kruptar7 keeps a positional ruler above each box. Ticks every ten
     columns, with the caret column marked. */
  function Ruler(props) {
    var length = Math.max(1, Number(props.length) || 1);
    var caret = Number(props.caret);
    var marks = [];
    for (var c = 0; c <= length; c += 10) {
      marks.push(e('span', {
        key: 'm' + c,
        style: {
          position: 'absolute',
          left: (c * 7.2) + 'px',
          top: 0,
          color: 'var(--kt-input-placeholder-fg)',
          fontSize: 9,
          fontFamily: MONO
        }
      }, String(c)));
    }
    return e('div', {
      style: {
        position: 'relative',
        height: 13,
        overflow: 'hidden',
        borderBottom: '1px solid var(--kt-widget-border-default)',
        background: 'var(--kt-sidebar-bg)',
        flex: '0 0 auto'
      }
    },
      marks,
      isFinite(caret) && caret >= 0 ? e('span', {
        style: {
          position: 'absolute',
          left: (caret * 7.2) + 'px',
          top: 0, bottom: 0, width: 1,
          background: 'var(--kt-focus-border)'
        }
      }) : null
    );
  }

  /* x is the column inside the line the caret sits on, so it has to be
     reported against the length of that line, not against the length of the
     whole text: "x: 0/88" told the translator nothing. y counts lines. */
  function caretInfo(text, pos) {
    var value = String(text || '');
    var at = Math.max(0, Math.min(value.length, Number(pos) || 0));
    var before = value.slice(0, at);
    var lastBreak = before.lastIndexOf('\n');
    var x = at - lastBreak - 1;
    var lineStart = lastBreak + 1;
    var nextBreak = value.indexOf('\n', lineStart);
    var lineEnd = nextBreak === -1 ? value.length : nextBreak;
    return {
      x: x,
      y: before.split('\n').length - 1,
      lines: value.split('\n').length,
      lineLength: Math.max(0, lineEnd - lineStart)
    };
  }

  function BoxFooter(props) {
    return e('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '2px 6px',
        borderTop: '1px solid var(--kt-widget-border-default)',
        background: 'var(--kt-statusbar-bg)',
        color: 'var(--kt-statusbar-fg)',
        fontFamily: MONO,
        fontSize: 10,
        flex: '0 0 auto'
      }
    },
      e('span', { style: { opacity: 0.75 } },
        'x: ' + props.caret.x + '/' + (props.caret.lineLength === undefined ? props.length : props.caret.lineLength)),
      e('span', { style: { opacity: 0.75 } },
        'y: ' + (props.caret.y + 1) + '/' + props.caret.lines),
      e('span', { style: { flex: 1 } }),
      props.mode ? e('span', {
        style: {
          opacity: 0.75, border: '1px solid var(--kt-widget-border-default)',
          padding: '0 4px', borderRadius: 2
        }
      }, props.mode) : null,
      e('span', {
        style: {
          color: props.overflow ? 'var(--kt-error-fg)' : 'var(--kt-editor-fg)',
          fontWeight: props.overflow ? 700 : 400
        },
        title: props.overflow
          ? 'Longer than the original text; the build has to relocate it'
          : 'Bytes this text occupies with the active table'
      }, 'Size: ' + props.size)
    );
  }

  /* Batch 21: the Original box is a real (read only) field, not a div, so a
     click puts a caret in the text and the footer reports the x/y position
     the translator is looking at. That position is what the game's own line
     width has to be compared against. */
  function SourceBox(props) {
    var text = K.translate.toDisplay(props.text);
    var caretSt = uS(0);
    var caretPos = caretSt[0];
    var setCaretPos = caretSt[1];

    // A new entry means the old index belongs to different text, which is what
    // made the reported x/y look wrong: the caret stayed at the old offset.
    uE(function () { setCaretPos(0); }, [props.offset, text]);

    var at = Math.max(0, Math.min(text.length, Number(caretPos) || 0));
    var caret = caretInfo(text, at);
    var MAX_MARKED_CHARS = 800;
    var marked = null;
    if (text.length && text.length <= MAX_MARKED_CHARS) {
      var out = [];
      for (var ci = 0; ci < text.length; ci++) {
        var chr = text.charAt(ci);
        if (chr === '\n') {
          out.push(e('span', { key: 'nl' + ci }, '\n'));
          continue;
        }
        out.push(e('span', {
          key: 'ch' + ci,
          onClick: (function (index) {
            return function () { setCaretPos(index); };
          })(ci),
          title: 'Column ' + caretInfo(text, ci).x + ', line ' + (caretInfo(text, ci).y + 1),
          style: {
            background: ci === at ? 'var(--kt-focus-border)' : 'transparent',
            color: ci === at ? 'var(--kt-editor-bg)' : 'var(--kt-editor-fg)',
            cursor: 'text'
          }
        }, chr));
      }
      marked = out;
    }

    return e('div', {
      style: {
        flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--kt-widget-border-default)',
        borderRadius: 3,
        background: 'var(--kt-editor-bg)',
        overflow: 'hidden'
      }
    },
      e('div', {
        style: {
          flex: '0 0 auto', padding: '3px 6px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
          opacity: 0.6, borderBottom: '1px solid var(--kt-widget-border-default)',
          display: 'flex', alignItems: 'center', gap: 6
        }
      },
        'Original (read only)',
        e('span', { style: { textTransform: 'none', letterSpacing: 0, opacity: 0.8 } },
          'click a character to mark it')
      ),
      e(Ruler, { length: text.length, caret: caret.x }),
      e('div', {
        'data-kt-original-box': '1',
        title: 'Read only. Click a character: its column (x) and line (y) are reported below.',
        style: {
          flex: '1 1 auto', minHeight: 0,
          width: '100%',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: '6px 8px',
          fontFamily: MONO, fontSize: 13, lineHeight: 1.5,
          color: 'var(--kt-editor-fg)',
          caretColor: 'var(--kt-focus-border)',
          cursor: 'text'
        }
      }, marked || e('span', null, text || '(empty)')),
      e(BoxFooter, {
        caret: caret,
        length: text.length,
        size: props.size,
        overflow: false
      })
    );
  }

  function TargetBox(props) {
    var lineTok = K.translate.lineToken();
    var st = uS(K.translate.toDisplay(props.value));
    var local = st[0];
    var setLocal = st[1];
    var caretSt = uS(0);
    var caretPos = caretSt[0];
    var setCaretPos = caretSt[1];
    var editingRef = uR(false);
    var pendingRef = uR(null);
    var latestRef = uR(local);

    // Another entry was selected (or Auto Translate landed): take the registry
    // value unless the user is typing in this box right now.
    uE(function () {
      if (editingRef.current) return;
      var next = K.translate.toDisplay(props.value);
      latestRef.current = next;
      setLocal(next);
    }, [props.value, props.offset]);

    var commit = uC(function (value) { props.onChange(value); }, [props.onChange]);

    // Every committed keystroke used to write to the registry, which
    // re-renders the editor, the sidebar, the session panel and the project
    // tab, and used to rewrite sessionStorage as well. Typing now stays
    // local and lands in the registry a moment after the last keystroke.
    var push = uC(function (value) {
      latestRef.current = value;
      setLocal(value);
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(function () {
        pendingRef.current = null;
        commit(K.translate.fromDisplay(latestRef.current));
      }, 350);
    }, [commit]);

    var flush = uC(function () {
      if (!pendingRef.current) return;
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
      commit(K.translate.fromDisplay(latestRef.current));
    }, [commit]);

    var caret = caretInfo(local, caretPos);
    // The box shows line breaks, the ROM stores the line token: measure the
    // stored form, which is what the build will encode.
    var size = props.measure(K.translate.fromDisplay(local));
    var overflow = overflowOf(size, props.originalSize);

    return e('div', {
      style: {
        flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column',
        border: '1px solid ' + (overflow ? 'var(--kt-error-fg)' : 'var(--kt-widget-border-default)'),
        borderRadius: 3,
        background: 'var(--kt-editor-bg)',
        overflow: 'hidden'
      }
    },
      e('div', {
        style: {
          flex: '0 0 auto', padding: '3px 6px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
          opacity: 0.6, borderBottom: '1px solid var(--kt-widget-border-default)',
          display: 'flex', alignItems: 'center', gap: 6
        }
      },
        'Translation (editable)',
        props.isTranslating ? e('span', { className: 'kt-spinner' }) : null
      ),
      e(Ruler, { length: local.length, caret: caret.x }),
      e('textarea', {
        value: local,
        spellCheck: false,
        onChange: function (ev) { push(ev.target.value); },
        onKeyDown: function (ev) {
          // Without a line token in the table a newline cannot be encoded, so
          // Enter would silently become a space. It is refused instead.
          if (ev.key === 'Enter' && !lineTok) {
            ev.preventDefault();
          }
        },
        onFocus: function () { editingRef.current = true; },
        onBlur: function () { editingRef.current = false; flush(); },
        onSelect: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        onKeyUp: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        onClick: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        placeholder: lineTok
          ? 'Type the translation, or use Auto Translate. Enter inserts the line break token.'
          : 'Type the translation, or use Auto Translate',
        style: {
          flex: '1 1 auto', minHeight: 0,
          width: '100%',
          background: 'var(--kt-input-bg)',
          color: 'var(--kt-input-fg)',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: '6px 8px',
          fontFamily: MONO, fontSize: 13, lineHeight: 1.5
        }
      }),
      e(BoxFooter, {
        caret: caret,
        length: local.length,
        size: size,
        overflow: overflow,
        mode: 'Insert'
      })
    );
  }

  function PreviewRow(props) {
    var row = props.row;
    var active = props.active;
    var overflow = overflowOf(props.size, K.translate.measureOriginal(row));
    var original = listText(row.originalText);
    var translation = listText(row.translatedText);

    return e('div', {
      onClick: function () { props.onSelect(row.startByte); },
      title: 'Index ' + (props.index + 1) + ' · ' + (row.offset || ''),
      style: {
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '2px 8px',
        fontFamily: MONO, fontSize: 12,
        cursor: 'pointer',
        background: active ? 'var(--kt-list-active-selection-bg)' : 'transparent',
        color: active ? 'var(--kt-list-active-selection-fg)' : 'var(--kt-editor-fg)',
        borderBottom: '1px solid rgba(255,255,255,0.03)'
      }
    },
      e('span', { style: { flex: '0 0 auto', opacity: 0.6, fontSize: 10 } }, pad6(props.index + 1)),
      e('span', {
        style: {
          flex: '1 1 auto', minWidth: 0,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }
      }, original),
      translation ? e('span', {
        style: {
          flex: '0 1 34%', minWidth: 0, opacity: 0.75,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }
      }, '\u2192 ' + translation) : null,
      overflow ? e('span', {
        style: { flex: '0 0 auto', color: 'var(--kt-error-fg)', fontSize: 10 },
        title: 'Translation is longer than the original'
      }, '!') : null
    );
  }

  /* A real select: the datalist popup rendered detached from the field, which
     looked like it belonged to the sidebar. A code that is not in the list is
     still offered as its own option so the control never shows blank. */
  function LangSelect(props) {
    var value = String(props.value || '');
    var known = false;
    LANGUAGES.forEach(function (l) { if (l[0] === value) known = true; });
    return e('label', {
      style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' },
      title: props.title
    },
      props.label,
      e('select', {
        className: 'kt-select',
        value: value,
        onChange: function (ev) { props.onChange(ev.target.value); },
        style: { flex: '0 1 132px', minWidth: 96, fontSize: 11 }
      },
        LANGUAGES.map(function (l) {
          return e('option', { key: l[0], value: l[0] }, l[0] + '  ' + l[1]);
        }),
        known ? null : e('option', { value: value }, value || '(none)')
      )
    );
  }

  function TranslateTab() {
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;
    var apiKeySt = uS('');
    var apiKey = apiKeySt[0];
    var setApiKey = apiKeySt[1];

    var activeGroupId = s ? s.selectedGroupId : null;
    var activeGroup = null;
    if (s && activeGroupId) {
      for (var i = 0; i < s.groups.length; i++) {
        if (s.groups[i].id === activeGroupId) { activeGroup = s.groups[i]; break; }
      }
    }

    var entries = uM(function () {
      if (!s || !activeGroupId) return [];
      return K.search.getTextsByGroup(activeGroupId);
    }, [s ? s.texts : null, s ? s.groups : null, activeGroupId]);

    /* The old free text filter searched inside one group, where the list is
       short enough to scan by eye. What a translator actually needs is to see
       only the work that is left, or only what does not fit, so the field now
       selects by status and the toolbar carries a jump to the next untranslated
       entry. */
    var status = String(t.filter || 'all') || 'all';
    var filtered = uM(function () {
      if (status === 'all') return entries;
      return entries.filter(function (row) {
        var done = String(row.translatedText || '').trim().length > 0;
        if (status === 'untranslated') return !done;
        if (status === 'translated') return done;
        if (status === 'overflow') {
          return done &&
            K.translate.measureBytes(row.translatedText) > K.translate.measureOriginal(row);
        }
        return true;
      });
    }, [entries, status]);

    var total = filtered.length;
    var perPage = t.perPage || 40;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.min(Math.max(1, t.page || 1), totalPages);
    var slice = filtered.slice((page - 1) * perPage, page * perPage);

    // The active entry is never written to the store during render: the
    // selection falls back to the first visible entry when the stored one is
    // not part of this group.
    var active = null;
    if (t.selectedOffset !== null && t.selectedOffset !== undefined) {
      for (var a = 0; a < filtered.length; a++) {
        if (Number(filtered[a].startByte) === Number(t.selectedOffset)) { active = filtered[a]; break; }
      }
    }
    if (!active && slice.length) active = slice[0];
    var activeIndex = active ? filtered.indexOf(active) : -1;

    var stats = uM(function () {
      var done = 0;
      for (var j = 0; j < entries.length; j++) {
        if (String(entries[j].translatedText || '').trim()) done++;
      }
      return { total: entries.length, done: done };
    }, [entries]);

    var onAuto = uC(function () {
      if (active) K.translate.autoTranslateText(active.startByte);
    }, [active]);

    // Walks the whole group, not just the visible page, and wraps.
    var untranslatedCount = uM(function () {
      var n = 0;
      for (var i = 0; i < entries.length; i++) {
        if (!String(entries[i].translatedText || '').trim()) n++;
      }
      return n;
    }, [entries]);

    var batch = t.batch || { running: false, done: 0, total: 0 };

    var onBatch = uC(function () { K.translate.autoTranslateGroup(activeGroupId); }, [activeGroupId]);
    var onStopBatch = uC(function () { K.translate.stopAutoTranslateGroup(); }, []);

    var onNextUntranslated = uC(function () {
      if (!entries.length) return;
      var from = 0;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i] === active) { from = i + 1; break; }
      }
      for (var step = 0; step < entries.length; step++) {
        var row = entries[(from + step) % entries.length];
        if (!String(row.translatedText || '').trim()) {
          K.translate.selectOffset(row.startByte);
          K.translate.setFilter(status);
          return;
        }
      }
      K.translate.selectOffset(entries[0].startByte);
    }, [entries, active, status]);

    var onGotoHex = uC(function () {
      if (!active) return;
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-hex', {
          detail: {
            offset: Number(active.startByte),
            label: String(active.originalText || '').slice(0, 30),
            source: 'translation'
          }
        }));
      } catch (_) { }
    }, [active]);

    var onOpenSearch = uC(function () {
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
          detail: { activity: 'search', source: 'translation-empty' }
        }));
      } catch (_) { }
    }, []);

    var onOpenHex = uC(function () {
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
          detail: { activity: 'hex', source: 'translation-empty' }
        }));
      } catch (_) { }
    }, []);

    var setKey = uC(function (value) {
      setApiKey(value);
      K.translate.setProviderApiKey(value);
    }, []);

    /* ---- Group wide tools (Batch 21) ------------------------------
       Find & replace inside the active group, and a way to throw away the
       machine output of a group and start over. Both live beside the group
       name because that is the scope they work on. */
    var toolsSt = uS(false);
    var toolsOpen = toolsSt[0];
    var setToolsOpen = toolsSt[1];
    var findSt = uS('');
    var findText = findSt[0];
    var setFindText = findSt[1];
    var replSt = uS('');
    var replText = replSt[0];
    var setReplText = replSt[1];
    var caseSt = uS(false);
    var caseSensitive = caseSt[0];
    var setCaseSensitive = caseSt[1];
    var noteSt = uS('');
    var toolNote = noteSt[0];
    var setToolNote = noteSt[1];

    var onReplaceInGroup = uC(function () {
      if (!String(findText || '')) {
        setToolNote('Type what to find first.');
        return;
      }
      var n = K.translate.replaceInGroup(activeGroupId, findText, replText, caseSensitive);
      setToolNote(n
        ? 'Replaced in ' + n + ' entry/entries of this group.'
        : 'Nothing matched in this group.');
    }, [activeGroupId, findText, replText, caseSensitive]);

    // Enter is what a translator presses after typing a word to fix; it used
    // to do nothing at all.
    var onToolKeyDown = uC(function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); onReplaceInGroup(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); setToolsOpen(false); }
    }, [onReplaceInGroup]);

    var onClearGroup = uC(function () {
      var n = 0;
      for (var i = 0; i < entries.length; i++) {
        if (String(entries[i].translatedText || '')) n++;
      }
      if (!n) { setToolNote('This group has no translations to clear.'); return; }
      // Same contract as Clear in the Hex Editor: the work is thrown away,
      // including the ROM that was compiled from it, so no stale compiled
      // image is left behind pretending the translations are still in it.
      var hadBuild = !!t.modifiedRom;
      if (!global.confirm('Clear ' + n + ' translation(s) in this group?' +
        (hadBuild ? ' The compiled ROM is discarded too.' : ''))) return;
      var done = K.translate.clearGroupTranslations(activeGroupId, true);
      setToolNote('Cleared ' + done + ' translation(s).' + (hadBuild ? ' Compiled ROM discarded.' : ''));
    }, [activeGroupId, entries]);

    /* ---- Compile report (Batch 21) --------------------------------
       rebuildRom() relocates a text that no longer fits, writes it into free
       space and rewrites the pointer that the game follows. It reports every
       decision; until now that report was thrown away. */
    // The compile report lives in the bottom panel Log now, not in this
    // toolbar: it is a report, not a control.

    if (!t.romName) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Translation'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from File menu.')
      );
    }

    if (!s || s.groups.length === 0) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Translation'),
        e('div', { className: 'ap-hint' },
          'No groups yet. Extract texts and create a group in Search Text (or mark a byte range in Hex Editor).'),
        e('div', { style: { display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' } },
          e('button', { type: 'button', className: 'kt-btn', onClick: onOpenSearch }, 'Open Search Text'),
          e('button', { type: 'button', className: 'kt-btn secondary', onClick: onOpenHex }, 'Open Hex Editor')
        )
      );
    }

    if (!activeGroupId) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Translation'),
        e('div', { className: 'ap-hint' }, 'Select a group in the sidebar to start translating.')
      );
    }

    var freeMode = t.providerMode !== 'custom';
    var providers = (K.core && K.core.TRANSLATOR_PROVIDERS) || [];
    var currentProvider = (K.core && typeof K.core.getTranslatorProvider === 'function')
      ? K.core.getTranslatorProvider(t.providerId) : null;
    var providerKind = currentProvider ? currentProvider.kind : 'chat';

    return e('div', {
      style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }
    },
      e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'nowrap',
          padding: '5px 10px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('span', {
          style: {
            fontSize: 12, fontWeight: 600,
            color: activeGroup ? activeGroup.color : 'inherit',
            whiteSpace: 'nowrap',
            flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            borderBottom: '2px solid ' + (activeGroup ? activeGroup.color : 'transparent'),
            paddingBottom: 1
          }
        }, activeGroup ? activeGroup.name : '\u2014'),
        e('select', {
          className: 'kt-select',
          value: status,
          title: 'Show only part of the group',
          onChange: function (ev) { K.translate.setFilter(ev.target.value); },
          style: { fontSize: 11, flex: '0 1 148px', minWidth: 110 }
        },
          e('option', { value: 'all' }, 'All entries'),
          e('option', { value: 'untranslated' }, 'Untranslated'),
          e('option', { value: 'translated' }, 'Translated'),
          e('option', { value: 'overflow' }, 'Longer than original')
        ),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: TOOL_BTN,
          onClick: onNextUntranslated,
          disabled: !entries.length,
          title: 'Jump to the next entry in this group that has no translation'
        }, 'Next untranslated'),

        // Jumping to the bytes of the entry belongs to the group header, next
        // to the entry it refers to, not to the provider row at the bottom.
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: TOOL_BTN,
          onClick: onGotoHex,
          disabled: !active,
          title: 'Show this entry in the Hex Editor'
        }, 'Goto Hex'),

        // Kruptar's F9 and Ctrl+F9: recalculate the pointers and insert the
        // text of this group, or of every group, into the ROM.
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: TOOL_BTN,
          onClick: function () { K.translate.buildModifiedRom('group'); },
          disabled: !activeGroupId || t.isBusy,
          title: 'Insert: recalculates the pointers and writes the text of this group into the ROM (Kruptar F9)'
        }, t.isBusy && t.compileScope === 'group' ? 'Inserting...' : 'Insert'),
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          style: TOOL_BTN,
          onClick: function () { K.translate.buildModifiedRom('all'); },
          disabled: !entries.length || t.isBusy,
          title: 'Insert every group at once (Kruptar Ctrl+F9)'
        }, t.isBusy && t.compileScope === 'all' ? 'Inserting all...' : 'Insert All'),
        active ? e('span', {
          style: { fontSize: 10, opacity: 0.6, fontFamily: MONO, whiteSpace: 'nowrap' }
        }, active.offset || '') : null,

        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          style: TOOL_BTN,
          onClick: function () { setToolsOpen(!toolsOpen); },
          title: 'Find and replace inside this group, or clear its translations'
        }, 'Tools'),
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          style: TOOL_BTN,
          onClick: onClearGroup,
          disabled: !entries.length,
          title: 'Clear every translation in this group'
        }, 'Clear'),

        e('span', {
          style: {
            fontSize: 11, color: 'var(--kt-sidebar-fg)',
            display: 'flex', gap: 12, whiteSpace: 'nowrap',
            flex: '0 0 auto', marginLeft: 'auto', paddingLeft: 12
          }
        },
          e('span', null, 'Total: ', e('strong', null, stats.total)),
          e('span', null, 'Done: ', e('strong', null, stats.done)),
          e('span', null, 'Progress: ', e('strong', null,
            stats.total ? Math.round(stats.done / stats.total * 100) + '%' : '0%'))
        )
      ),

      toolsOpen ? e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '4px 10px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-editor-bg)',
          fontSize: 11
        }
      },
        e('span', { style: { opacity: 0.7, whiteSpace: 'nowrap' } },
          'Find in this group\u2019s translations'),
        e('input', {
          type: 'text', className: 'kt-input',
          value: findText,
          placeholder: 'word or token to find',
          onKeyDown: onToolKeyDown,
          onChange: function (ev) { setFindText(ev.target.value); },
          style: { flex: '0 1 190px', minWidth: 92, fontSize: 11, fontFamily: MONO }
        }),
        e('span', { style: { opacity: 0.7 } }, 'Replace with'),
        e('input', {
          type: 'text', className: 'kt-input',
          value: replText,
          placeholder: 'replacement (empty deletes it)',
          onKeyDown: onToolKeyDown,
          onChange: function (ev) { setReplText(ev.target.value); },
          style: { flex: '0 1 190px', minWidth: 92, fontSize: 11, fontFamily: MONO }
        }),
        e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
          title: 'Match case'
        },
          e('input', {
            type: 'checkbox',
            checked: caseSensitive,
            onChange: function (ev) { setCaseSensitive(!!ev.target.checked); }
          }),
          'Aa'
        ),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: TOOL_BTN,
          onClick: onReplaceInGroup,
          disabled: !findText || !entries.length,
          title: 'Replace inside every translation of this group. Originals are never touched.'
        }, 'Replace in group'),
        toolNote ? e('span', { style: { opacity: 0.85, whiteSpace: 'nowrap' } }, toolNote) : null,
        e('span', { style: { flex: 1 } }),
        e('span', { style: { opacity: 0.55, whiteSpace: 'nowrap' } },
          'Enter replaces, Esc closes. Original texts are never changed.')
      ) : null,

      e('div', {
        style: {
          flex: '1 1 42%', minHeight: 0,
          display: 'flex', flexDirection: 'column',
          borderBottom: '1px solid var(--kt-widget-border-default)'
        }
      },
        total === 0
          ? e('div', {
              style: {
                flex: '1 1 auto', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontStyle: 'italic',
                color: 'var(--kt-input-placeholder-fg)', fontSize: 12
              }
            }, entries.length === 0
              ? 'This group has no texts yet. Add some via Search Text or Hex Editor.'
              : 'No entry matches the filter.')
          : e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto' } },
              slice.map(function (row, idx) {
                return e(PreviewRow, {
                  key: 'pr-' + row.startByte,
                  row: row,
                  index: (page - 1) * perPage + idx,
                  active: active === row,
                  size: K.translate.measureBytes(row.translatedText || ''),
                  onSelect: K.translate.selectOffset
                });
              })
            ),

        e('div', {
          style: {
            flex: '0 0 auto',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 8px',
            background: 'var(--kt-statusbar-bg)',
            color: 'var(--kt-statusbar-fg)',
            fontFamily: MONO, fontSize: 11
          }
        },
          e('span', null, 'Index ' + (activeIndex >= 0 ? activeIndex + 1 : 0) + ' of ' + total),
          e('span', { style: { flex: 1 } }),
          totalPages > 1 ? e('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { K.translate.setPage(1); }, disabled: page <= 1
            }, '<<'),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { K.translate.setPage(page - 1); }, disabled: page <= 1
            }, '<'),
            e('span', null, page + ' / ' + totalPages),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { K.translate.setPage(page + 1); }, disabled: page >= totalPages
            }, '>'),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { K.translate.setPage(totalPages); }, disabled: page >= totalPages
            }, '>>')
          ) : null
        )
      ),

      e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'nowrap',
          padding: '5px 10px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: TOOL_BTN,
          onClick: onAuto,
          disabled: !active || t.isTranslating,
          title: 'Translate this entry with the selected provider'
        }, t.isTranslating && !batch.running ? 'Translating...' : 'Auto Translate'),

        // Kruptar works a group at a time, and so does a translator: the
        // slowest part of the job is feeding entries through one by one.
        batch.running
          ? e('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              e('span', { className: 'kt-spinner' }),
              e('span', {
                style: { fontSize: 11, fontFamily: MONO, whiteSpace: 'nowrap' }
              }, 'Group ' + batch.done + '/' + batch.total),
              e('button', {
                type: 'button', className: 'kt-btn small',
                style: TOOL_BTN,
                onClick: onStopBatch,
                title: 'Stop after the request in flight'
              }, 'Stop')
            )
          : e('button', {
              type: 'button', className: 'kt-btn small',
              style: TOOL_BTN,
              onClick: onBatch,
              disabled: !entries.length,
              title: 'Translate every entry of this group that has no translation yet, one request at a time'
            }, 'Auto Translate Group (' + untranslatedCount + ')'),

        e(LangSelect, {
          name: 'src', label: 'From', value: t.sourceLang,
          title: 'Source language',
          onChange: K.translate.setSourceLang
        }),
        e(LangSelect, {
          name: 'tgt', label: 'To', value: t.targetLang,
          title: 'Target language',
          onChange: K.translate.setTargetLang
        }),

        e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }
        },
          'Provider',
          e('select', {
            className: 'kt-select',
            value: freeMode ? 'free' : 'custom',
            onChange: function (ev) {
              K.translate.setProviderMode(ev.target.value === 'custom' ? 'custom' : 'free');
            },
            style: { fontSize: 11, flex: '0 1 118px', minWidth: 94 }
          },
            e('option', { value: 'free' }, 'Free (fallback)'),
            e('option', { value: 'custom' }, 'AI')
          )
        ),

        !freeMode ? e('select', {
          className: 'kt-select',
          value: t.providerId,
          title: 'Translation provider. The list comes from core/translator.js.',
          onChange: function (ev) { K.translate.setProvider(ev.target.value); },
          style: { fontSize: 11, flex: '0 1 186px', minWidth: 100 }
        },
          providers.map(function (p) {
            return e('option', { key: p.id, value: p.id }, p.label);
          })
        ) : null,

        !freeMode ? e('input', {
          type: 'password',
          className: 'kt-input',
          placeholder: 'API key (kept in memory)',
          value: apiKey,
          onChange: function (ev) { setKey(ev.target.value); },
          title: 'Stored in memory only. Never written to the project, the CSV export or the session.',
          style: { flex: '0 1 168px', minWidth: 88, fontSize: 11 }
        }) : null,

        !freeMode && providerKind === 'chat' ? e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'model',
          value: t.providerModel,
          onChange: function (ev) { K.translate.setProviderModel(ev.target.value); },
          title: 'Model id. Defaults come from the provider list; model names change, so this stays editable.',
          style: { flex: '0 1 150px', minWidth: 76, fontSize: 11, fontFamily: MONO }
        }) : null,

        !freeMode && t.providerId === 'custom' ? e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'https://endpoint/v1/chat/completions',
          value: t.providerEndpoint,
          onChange: function (ev) { K.translate.setProviderEndpoint(ev.target.value); },
          title: 'Endpoint for the custom provider. Any OpenAI compatible server works.',
          style: { flex: '0 1 250px', minWidth: 100, fontSize: 11, fontFamily: MONO }
        }) : null,

        e('span', { style: { flex: 1 } })
      ),

      e('div', {
        style: {
          flex: '1 1 58%', minHeight: 0,
          display: 'flex', gap: 8, padding: 8
        }
      },
        active
          ? e(SourceBox, {
              text: active.originalText,
              offset: active.startByte,
              size: K.translate.measureOriginal(active)
            })
          : e('div', {
              style: {
                flex: '1 1 0', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontStyle: 'italic',
                color: 'var(--kt-input-placeholder-fg)', fontSize: 12
              }
            }, 'Select an entry above to translate it.'),

        active ? e(TargetBox, {
          key: 'target-' + active.startByte,
          offset: active.startByte,
          value: active.translatedText || '',
          originalSize: K.translate.measureOriginal(active),
          isTranslating: t.isTranslating && Number(t.translatingOffset) === Number(active.startByte),
          measure: K.translate.measureBytes,
          onChange: function (value) {
            K.search.setTranslatedText(active.startByte, value);
          }
        }) : null
      )
    );
  }

  K.ui.registerTabProvider('translation', TranslateTab);

})(window);
