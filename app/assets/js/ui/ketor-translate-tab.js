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
     Apertium) plus a few common ones. The field is a datalist input, so any
     other ISO code can be typed by hand. */
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

  function pad6(n) { return String(n).padStart(6, '0'); }

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

  function caretInfo(text, pos) {
    var value = String(text || '');
    var at = Math.max(0, Math.min(value.length, Number(pos) || 0));
    var before = value.slice(0, at);
    var lastBreak = before.lastIndexOf('\n');
    return { x: at - lastBreak - 1, y: before.split('\n').length - 1, lines: value.split('\n').length };
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
      e('span', { style: { opacity: 0.75 } }, 'x: ' + props.caret.x + '/' + props.length),
      e('span', { style: { opacity: 0.75 } }, 'y: ' + props.caret.y + '/' + props.caret.lines),
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

  function SourceBox(props) {
    var text = String(props.text || '');
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
          opacity: 0.6, borderBottom: '1px solid var(--kt-widget-border-default)'
        }
      }, 'Original (read only)'),
      e(Ruler, { length: text.length, caret: -1 }),
      e('div', {
        style: {
          flex: '1 1 auto', minHeight: 0, overflow: 'auto',
          padding: '6px 8px',
          fontFamily: MONO, fontSize: 13, lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          color: 'var(--kt-editor-fg)'
        }
      }, text || e('span', { style: { opacity: 0.5 } }, '(empty)')),
      e(BoxFooter, {
        caret: caretInfo(text, 0),
        length: text.length,
        size: props.size,
        overflow: false
      })
    );
  }

  function TargetBox(props) {
    var st = uS(String(props.value || ''));
    var local = st[0];
    var setLocal = st[1];
    var caretSt = uS(0);
    var caretPos = caretSt[0];
    var setCaretPos = caretSt[1];
    var editingRef = uR(false);

    // Another entry was selected (or Auto Translate landed): take the registry
    // value unless the user is typing in this box right now.
    uE(function () {
      if (!editingRef.current) setLocal(String(props.value || ''));
    }, [props.value, props.offset]);

    var caret = caretInfo(local, caretPos);
    var size = props.measure(local);
    var overflow = overflowOf(size, props.originalSize);

    var push = uC(function (value) {
      setLocal(value);
      props.onChange(value);
    }, [props.onChange]);

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
        onFocus: function () { editingRef.current = true; },
        onBlur: function () { editingRef.current = false; },
        onSelect: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        onKeyUp: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        onClick: function (ev) { setCaretPos(ev.target.selectionStart || 0); },
        placeholder: 'Type the translation, or use Auto Translate',
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
    var overflow = overflowOf(props.size, row.byteLength || 0);
    var translation = String(row.translatedText || '');

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
          whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis'
        }
      }, String(row.originalText || '')),
      translation ? e('span', {
        style: {
          flex: '0 1 34%', minWidth: 0, opacity: 0.75,
          whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis'
        }
      }, '\u2192 ' + translation) : null,
      overflow ? e('span', {
        style: { flex: '0 0 auto', color: 'var(--kt-error-fg)', fontSize: 10 },
        title: 'Translation is longer than the original'
      }, '!') : null
    );
  }

  function LangField(props) {
    var id = 'kt-lang-' + props.name;
    return e('label', {
      style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' },
      title: props.title
    },
      props.label,
      e('input', {
        list: id,
        className: 'kt-input',
        value: props.value,
        onChange: function (ev) { props.onChange(ev.target.value); },
        style: { width: 96, fontFamily: MONO, fontSize: 11 }
      }),
      e('datalist', { id: id },
        LANGUAGES.map(function (l) {
          return e('option', { key: l[0], value: l[0] }, l[1]);
        })
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

    var filtered = uM(function () {
      var f = String(t.filter || '').trim().toLowerCase();
      if (!f) return entries;
      return entries.filter(function (row) {
        return String(row.originalText || '').toLowerCase().indexOf(f) >= 0 ||
          String(row.translatedText || '').toLowerCase().indexOf(f) >= 0 ||
          String(row.offset || '').toLowerCase().indexOf(f) >= 0;
      });
    }, [entries, t.filter]);

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

    return e('div', {
      style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }
    },
      e('div', {
        style: {
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
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
            borderBottom: '2px solid ' + (activeGroup ? activeGroup.color : 'transparent'),
            paddingBottom: 1
          }
        }, activeGroup ? activeGroup.name : '\u2014'),
        e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'Filter by original, translation, or offset...',
          value: t.filter,
          onChange: function (ev) { K.translate.setFilter(ev.target.value); },
          style: { flex: '1 1 200px', minWidth: 160 }
        }),
        e('span', {
          style: { fontSize: 11, color: 'var(--kt-sidebar-fg)', display: 'flex', gap: 12, whiteSpace: 'nowrap' }
        },
          e('span', null, 'Total: ', e('strong', null, stats.total)),
          e('span', null, 'Done: ', e('strong', null, stats.done)),
          e('span', null, 'Progress: ', e('strong', null,
            stats.total ? Math.round(stats.done / stats.total * 100) + '%' : '0%'))
        )
      ),

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
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '5px 10px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('button', {
          type: 'button', className: 'kt-btn',
          onClick: onAuto,
          disabled: !active || t.isTranslating,
          title: 'Translate this entry with the selected provider'
        }, t.isTranslating ? 'Translating...' : 'Auto Translate'),

        e(LangField, {
          name: 'src', label: 'From', value: t.sourceLang,
          title: 'Source language code',
          onChange: K.translate.setSourceLang
        }),
        e(LangField, {
          name: 'tgt', label: 'To', value: t.targetLang,
          title: 'Target language code',
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
            style: { fontSize: 11, width: 112 }
          },
            e('option', { value: 'free' }, 'Free (fallback)'),
            e('option', { value: 'custom' }, 'OpenAI / DeepL')
          )
        ),

        !freeMode ? e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap' }
        },
          'API',
          e('select', {
            className: 'kt-select',
            value: t.providerId,
            onChange: function (ev) { K.translate.setProviderId(ev.target.value); },
            style: { fontSize: 11, width: 78 }
          },
            e('option', { value: 'openai' }, 'OpenAI'),
            e('option', { value: 'deepl' }, 'DeepL')
          )
        ) : null,

        !freeMode ? e('input', {
          type: 'password',
          className: 'kt-input',
          placeholder: 'API key (kept in memory)',
          value: apiKey,
          onChange: function (ev) { setKey(ev.target.value); },
          title: 'Stored in memory only. Never written to the project, the CSV export or the session.',
          style: { width: 168, fontSize: 11 }
        }) : null,

        !freeMode && t.providerId === 'openai' ? e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'model',
          value: t.providerModel,
          onChange: function (ev) { K.translate.setProviderModel(ev.target.value); },
          style: { width: 120, fontSize: 11, fontFamily: MONO }
        }) : null,

        e('span', { style: { flex: 1 } }),

        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: onGotoHex,
          disabled: !active,
          title: 'Show this entry in the Hex Editor'
        }, 'Goto Hex'),

        active ? e('span', {
          style: { fontSize: 10, opacity: 0.6, fontFamily: MONO, whiteSpace: 'nowrap' }
        }, active.offset || '') : null
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
              size: active.byteLength || 0
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
          originalSize: active.byteLength || 0,
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
