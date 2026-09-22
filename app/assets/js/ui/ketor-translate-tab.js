/* Ketor Translate Tab - registers tab provider for 'translate' kind */
/* ============================================================
   Ketor - Translate Tab (v2)
   ------------------------------------------------------------
   Batch 16: reads entries from K.search (selected group),
   writes translatedText back to K.search. Does not own text
   state anymore.
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

  function TextRow(props) {
    var row = props.row;
    var isActive = props.isActive;
    var tableData = props.tableData;
    var onActivate = props.onActivate;

    var st = uS(row.translatedText || '');
    var local = st[0];
    var setLocal = st[1];
    var editingRef = uR(false);

    uE(function () {
      if (!editingRef.current) setLocal(row.translatedText || '');
    }, [row.translatedText, row.startByte]);

    var byteLen = uM(function () {
      var text = local || '';
      if (!text) return 0;
      var hasMulti = tableData && tableData.hasMultiByte;
      if (hasMulti) return text.length * 2;
      return text.length;
    }, [local, tableData]);

    var originalLen = row.byteLength || 0;
    var overflow = byteLen > originalLen && originalLen > 0;

    var commit = uC(function () {
      editingRef.current = false;
      if ((row.translatedText || '') !== local) {
        K.search.setTranslatedText(row.startByte, local);
      }
    }, [local, row.startByte, row.translatedText]);

    var onFocus = uC(function () {
      editingRef.current = true;
      if (onActivate) onActivate(row.startByte);
    }, [row.startByte, onActivate]);

    var onAuto = uC(function () {
      K.translate.autoTranslateText(row.startByte);
    }, [row.startByte]);

    var onOpenHex = uC(function () {
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-hex', {
          detail: {
            offset: row.startByte,
            label: String(row.originalText || '').slice(0, 30),
            source: 'translation'
          }
        }));
      } catch (_) { }
    }, [row]);

    return e('div', {
      className: 'kt-text-item' + (isActive ? ' selected' : ''),
      onClick: function () { if (onActivate) onActivate(row.startByte); },
      style: {
        border: '1px solid ' + (isActive ? 'var(--kt-focus-border)' : 'var(--kt-widget-border-default)'),
        borderRadius: 4,
        padding: 10,
        marginBottom: 8,
        background: 'var(--kt-sidebar-bg)'
      }
    },
      e('div', {
        style: {
          fontSize: 10,
          color: 'var(--kt-input-placeholder-fg)',
          marginBottom: 6,
          display: 'flex',
          gap: 12
        }
      },
        e('span', null, 'Offset: ', e('strong', {
          style: { color: 'var(--kt-info-fg, #75beff)', fontFamily: 'var(--kt-font-mono)' }
        }, row.offset || ('0x' + Number(row.startByte).toString(16).toUpperCase()))),
        e('span', null, 'Type: ' + (row.textType || 'text')),
        row.source === 'manual'
          ? e('span', { style: { color: '#c586c0' } }, '· manual')
          : null
      ),

      e('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          alignItems: 'stretch'
        }
      },
        e('div', {
          style: {
            border: '1px solid var(--kt-widget-border-default)',
            borderRadius: 3,
            padding: 6,
            background: 'var(--kt-editor-bg)'
          }
        },
          e('div', {
            style: { fontSize: 9, textTransform: 'uppercase', opacity: 0.5, marginBottom: 4 }
          }, 'Original'),
          e('pre', {
            style: {
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: 'var(--kt-font-mono)', fontSize: 12, lineHeight: 1.4,
              color: 'var(--kt-editor-fg)'
            }
          }, row.originalText)
        ),
        e('div', {
          style: {
            border: '1px solid var(--kt-widget-border-default)',
            borderRadius: 3,
            padding: 6,
            background: 'var(--kt-editor-bg)'
          }
        },
          e('div', {
            style: { fontSize: 9, textTransform: 'uppercase', opacity: 0.5, marginBottom: 4 }
          }, 'Translation'),
          e('textarea', {
            value: local,
            onChange: function (ev) { setLocal(ev.target.value); },
            onFocus: onFocus,
            onBlur: commit,
            placeholder: 'Enter translation...',
            style: {
              width: '100%', minHeight: 60, background: 'var(--kt-input-bg)',
              color: 'var(--kt-input-fg)',
              border: '1px solid var(--kt-input-border)',
              borderRadius: 2, padding: 6,
              fontFamily: 'var(--kt-font-mono)', fontSize: 12,
              resize: 'vertical'
            }
          })
        )
      ),

      e('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 6, fontSize: 10
        }
      },
        e('div', {
          style: {
            color: overflow ? 'var(--kt-error-fg)' : 'var(--kt-input-placeholder-fg)'
          }
        }, overflow
            ? 'Overflow: ' + byteLen + '/' + originalLen + ' bytes'
            : (local ? byteLen + '/' + originalLen + ' bytes' : '')),
        e('div', { style: { display: 'flex', gap: 4 } },
          e('button', {
            type: 'button', className: 'kt-btn small',
            onClick: onAuto, disabled: !row.originalText
          }, 'Auto'),
          e('button', {
            type: 'button', className: 'kt-btn small',
            onClick: onOpenHex
          }, 'Hex')
        )
      )
    );
  }

  function TranslateTab() {
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;

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
      var f = (t.filter || '').trim().toLowerCase();
      if (!f) return entries;
      return entries.filter(function (row) {
        var o = (row.originalText || '').toLowerCase();
        var tr = (row.translatedText || '').toLowerCase();
        var off = (row.offset || '').toLowerCase();
        return o.indexOf(f) >= 0 || tr.indexOf(f) >= 0 || off.indexOf(f) >= 0;
      });
    }, [entries, t.filter]);

    var total = filtered.length;
    var perPage = t.perPage || 20;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.min(t.page, totalPages);
    var slice = filtered.slice((page - 1) * perPage, page * perPage);

    var stats = uM(function () {
      var done = 0;
      for (var j = 0; j < entries.length; j++) {
        if ((entries[j].translatedText || '').trim()) done++;
      }
      return { total: entries.length, done: done };
    }, [entries]);

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

    return e('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        height: '100%', minHeight: 0, overflow: 'hidden'
      }
    },
      e('div', {
        style: {
          padding: '8px 12px',
          borderBottom: '1px solid var(--kt-widget-border-default)',
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          flex: '0 0 auto'
        }
      },
        e('span', {
          style: {
            fontSize: 12, fontWeight: 600,
            color: activeGroup ? activeGroup.color : 'inherit',
            whiteSpace: 'nowrap'
          }
        }, activeGroup ? activeGroup.name : '—'),
        e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'Filter by original, translation, or offset...',
          value: t.filter,
          onChange: function (ev) { K.translate.setFilter(ev.target.value); },
          style: { flex: '1 1 220px', minWidth: 180 }
        }),
        e('div', {
          style: {
            fontSize: 11, color: 'var(--kt-sidebar-fg)',
            display: 'flex', gap: 12, whiteSpace: 'nowrap'
          }
        },
          e('span', null, 'Total: ', e('strong', null, stats.total)),
          e('span', null, 'Done: ', e('strong', null, stats.done)),
          e('span', null, 'Progress: ', e('strong', null,
            stats.total ? Math.round(stats.done / stats.total * 100) + '%' : '0%'))
        )
      ),

      entries.length === 0
        ? e('div', { style: { padding: 32, textAlign: 'center', color: 'var(--kt-input-placeholder-fg)', fontStyle: 'italic' } },
            'This group has no texts yet. Add some via Search Text or Hex Editor.')
        : e('div', {
            style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 12 }
          }, slice.map(function (row) {
            return e(TextRow, {
              key: 'tr-' + row.startByte,
              row: row,
              isActive: t.selectedOffset === row.startByte,
              tableData: s.tableData,
              onActivate: K.translate.selectOffset
            });
          })),

      totalPages > 1 ? e('div', {
        style: {
          flex: '0 0 auto',
          padding: '8px 12px',
          borderTop: '1px solid var(--kt-widget-border-default)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6
        }
      },
        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: function () { K.translate.setPage(1); },
          disabled: page <= 1
        }, '<<'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: function () { K.translate.setPage(page - 1); },
          disabled: page <= 1
        }, '<'),
        e('span', { style: { fontSize: 11, padding: '0 8px' } }, page + ' / ' + totalPages),
        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: function () { K.translate.setPage(page + 1); },
          disabled: page >= totalPages
        }, '>'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          onClick: function () { K.translate.setPage(totalPages); },
          disabled: page >= totalPages
        }, '>>')
      ) : null
    );
  }

  K.ui.registerTabProvider('translation', TranslateTab);
})(window);