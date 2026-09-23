/* ============================================================
   Ketor - Hex Editor Sidebar (v1)
   ------------------------------------------------------------
   Batch 18: ROM readout, goto, byte/text search, bookmarks and
   the console help text.

   The group manager and the section legend live in the editor's
   right column, not here, so there is exactly one place to manage
   groups and one place to read the colour legend.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uC = R.useCallback;
  var uS = R.useState;

  function Section(props) {
    return e('div', { className: 'kt-sidebar-section' },
      e('div', { className: 'kt-sidebar-section-header' }, props.title),
      e('div', { className: 'kt-sidebar-section-body', style: { padding: '6px 12px 12px 12px' } },
        props.children
      )
    );
  }

  function Row(props) {
    return e('div', {
      style: {
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, padding: '3px 0',
        color: 'var(--kt-sidebar-fg)'
      }
    },
      e('span', { style: { opacity: 0.7 } }, props.label),
      e('span', {
        style: {
          color: 'var(--kt-editor-fg)',
          fontFamily: props.mono ? 'var(--kt-font-mono)' : 'inherit',
          maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        },
        title: String(props.value === undefined ? '' : props.value)
      }, String(props.value === undefined ? '' : props.value))
    );
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function hexLabel(n, width) {
    return '0x' + Number(n || 0).toString(16).toUpperCase().padStart(width || 6, '0');
  }

  function parseGoto(value, base) {
    var v = String(value || '').trim().replace(/^0x/i, '');
    if (!v) return null;
    var n = base === 'dec' ? parseInt(v, 10) : parseInt(v, 16);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function HexSidebar() {
    var t = K.hex.useHex();
    var wf = K.workflow ? K.workflow.useWorkflowConfig() : null;

    var gotoSt = uS('');
    var gotoValue = gotoSt[0];
    var setGotoValue = gotoSt[1];
    var baseSt = uS('hex');
    var gotoBase = baseSt[0];
    var setGotoBase = baseSt[1];
    var labelSt = uS('');
    var bookmarkLabel = labelSt[0];
    var setBookmarkLabel = labelSt[1];

    var onGoto = uC(function () {
      var off = parseGoto(gotoValue, gotoBase);
      if (off === null) { K.hex.setSearchQuery(t.searchQuery); return; }
      K.hex.gotoOffset(off);
    }, [gotoValue, gotoBase]);

    var renameSt = uS(null);
    var renaming = renameSt[0];
    var setRenaming = renameSt[1];
    var renameValSt = uS('');
    var renameVal = renameValSt[0];
    var setRenameVal = renameValSt[1];

    var onSearch = uC(function () { K.hex.runSearch(); }, []);
    var onPrev = uC(function () { K.hex.prevResult(); }, []);
    var onNext = uC(function () { K.hex.nextResult(); }, []);
    var onClearSearch = uC(function () { K.hex.clearSearch(); }, []);

    var commitRename = uC(function (offset) {
      K.hex.renameBookmark(offset, renameVal);
      setRenaming(null);
    }, [renameVal]);

    var onAddBookmark = uC(function () {
      K.hex.addBookmark(t.cursorOffset, bookmarkLabel);
      setBookmarkLabel('');
    }, [t.cursorOffset, bookmarkLabel]);

    var onJumpBookmark = uC(function (off) { K.hex.gotoOffset(off); }, []);

    var hasRom = !!t.romBytes;
    var patchCount = Object.keys(t.patches || {}).length;
    var resultCount = (t.searchResults || []).length;
    var resultLabel = resultCount
      ? (t.searchIndex + 1) + ' / ' + resultCount + (t.searchTruncated ? '+' : '')
      : 'no results';

    return e('div', { style: { paddingBottom: 12 } },

      e(Section, { title: 'ROM' },
        hasRom
          ? e('div', null,
              e(Row, { label: 'Name', value: t.romName }),
              e(Row, { label: 'Size', value: formatBytes(t.romSize) }),
              e(Row, { label: 'System', value: t.romSystem || '?' }),
              e(Row, { label: 'Patches', value: patchCount }),
              e(Row, { label: 'Cursor', value: hexLabel(t.cursorOffset), mono: true })
            )
          : e('div', { className: 'kt-text-dim kt-text-small' },
              'No ROM loaded. Use File > Load ROM.')
      ),

      e(Section, { title: 'Goto Offset' },
        e('div', { style: { display: 'flex', gap: 4 } },
          e('input', {
            type: 'text',
            className: 'kt-input',
            placeholder: gotoBase === 'dec' ? '4096' : '0x1000',
            value: gotoValue,
            onChange: function (ev) { setGotoValue(ev.target.value); },
            onKeyDown: function (ev) { if (ev.key === 'Enter') onGoto(); },
            style: { flex: 1, minWidth: 0, fontFamily: 'var(--kt-font-mono)' },
            disabled: !hasRom
          }),
          e('select', {
            className: 'kt-select',
            value: gotoBase,
            onChange: function (ev) { setGotoBase(ev.target.value); },
            style: { width: 62, fontSize: 11 },
            disabled: !hasRom
          },
            e('option', { value: 'hex' }, 'Hex'),
            e('option', { value: 'dec' }, 'Dec')
          )
        ),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%', marginTop: 6 },
          onClick: onGoto,
          disabled: !hasRom
        }, 'Go')
      ),

      e(Section, { title: 'Search' },
        e('select', {
          className: 'kt-select',
          value: t.searchMode,
          onChange: function (ev) { K.hex.setSearchMode(ev.target.value); },
          style: { width: '100%', fontSize: 11, marginBottom: 6 },
          disabled: !hasRom
        },
          e('option', { value: 'hex' }, 'Hex bytes'),
          e('option', { value: 'text' }, 'Text (via table)')
        ),
        e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: t.searchMode === 'text' ? 'PRESS START' : '4E 45 53',
          value: t.searchQuery,
          onChange: function (ev) { K.hex.setSearchQuery(ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') onSearch(); },
          style: {
            width: '100%',
            fontFamily: 'var(--kt-font-mono)',
            marginBottom: 6
          },
          disabled: !hasRom
        }),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%' },
          onClick: onSearch,
          disabled: !hasRom || !String(t.searchQuery || '').trim()
        }, t.isSearching ? 'Searching...' : 'Find All'),
        e('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 6
          }
        },
          e('button', {
            type: 'button', className: 'kt-btn small',
            style: { flex: 1 },
            onClick: onPrev, disabled: !resultCount
          }, 'Prev'),
          e('button', {
            type: 'button', className: 'kt-btn small',
            style: { flex: 1 },
            onClick: onNext, disabled: !resultCount
          }, 'Next')
        ),
        e('div', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, marginTop: 4, fontSize: 10
          }
        },
          e('span', { style: { opacity: 0.7 } }, resultLabel),
          (t.searchQuery || resultCount) ? e('button', {
            type: 'button',
            title: 'Clear the search and its highlights',
            onClick: onClearSearch,
            style: {
              width: 16, height: 16, padding: 0,
              background: 'transparent', border: 'none',
              color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
              opacity: 0.6, display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }
          }, K.ui.icon('close', { size: 10 })) : null
        ),
        t.searchMode === 'text'
          ? e('div', { style: { fontSize: 10, opacity: 0.55, marginTop: 4, lineHeight: 1.5 } },
              'Text is encoded with the applied table, so the bytes searched are the bytes a build would write.')
          : null
      ),

      e(Section, { title: 'Bookmarks (' + (t.bookmarks || []).length + ')' },
        e('input', {
          type: 'text',
          className: 'kt-input',
          placeholder: 'Label (optional)',
          value: bookmarkLabel,
          onChange: function (ev) { setBookmarkLabel(ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') onAddBookmark(); },
          style: { width: '100%', marginBottom: 6 },
          disabled: !hasRom
        }),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%' },
          onClick: onAddBookmark,
          disabled: !hasRom
        }, 'Add Bookmark at Cursor'),

        (t.bookmarks || []).length === 0
          ? e('div', {
              style: {
                fontSize: 11, opacity: 0.6, marginTop: 8,
                textAlign: 'center', fontStyle: 'italic'
              }
            }, 'No bookmarks yet.')
          : e('div', {
              style: {
                marginTop: 8,
                border: '1px solid var(--kt-widget-border-default)',
                borderRadius: 3,
                background: 'var(--kt-editor-bg)',
                maxHeight: 180,
                overflowY: 'auto'
              }
            }, t.bookmarks.map(function (b) {
              return e('div', {
                key: 'bm-' + b.offset,
                style: {
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 6px', fontSize: 11,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer'
                },
                onClick: function () { onJumpBookmark(b.offset); },
                onDoubleClick: function () {
                  setRenameVal(b.label);
                  setRenaming(b.offset);
                },
                title: 'Jump to ' + hexLabel(b.offset) + ' (double-click to rename)'
              },
                e('span', {
                  style: {
                    width: 8, height: 8, borderRadius: 4,
                    background: b.color, flex: '0 0 auto'
                  }
                }),
                e('span', {
                  style: {
                    fontFamily: 'var(--kt-font-mono)', fontSize: 10,
                    color: 'var(--kt-info-fg, #75beff)', flex: '0 0 auto'
                  }
                }, hexLabel(b.offset)),
                renaming === b.offset
                  ? e('input', {
                      type: 'text',
                      className: 'kt-input',
                      value: renameVal,
                      autoFocus: true,
                      onClick: function (ev) { ev.stopPropagation(); },
                      onChange: function (ev) { setRenameVal(ev.target.value); },
                      onBlur: function () { commitRename(b.offset); },
                      onKeyDown: function (ev) {
                        if (ev.key === 'Enter') commitRename(b.offset);
                        if (ev.key === 'Escape') setRenaming(null);
                      },
                      style: { flex: 1, minWidth: 0, fontSize: 11, padding: '0 4px' }
                    })
                  : e('span', {
                      style: {
                        flex: 1, minWidth: 0, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      },
                      title: 'Double-click to rename'
                    }, b.label),
                e('button', {
                  type: 'button',
                  title: 'Rename bookmark',
                  onClick: function (ev) {
                    ev.stopPropagation();
                    setRenameVal(b.label);
                    setRenaming(b.offset);
                  },
                  style: {
                    width: 16, height: 16, padding: 0, flex: '0 0 auto',
                    background: 'transparent', border: 'none',
                    color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
                    opacity: 0.6, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }
                }, K.ui.icon('edit', { size: 10 })),
                e('button', {
                  type: 'button',
                  title: 'Remove bookmark',
                  onClick: function (ev) {
                    ev.stopPropagation();
                    K.hex.removeBookmark(b.offset);
                  },
                  style: {
                    width: 16, height: 16, padding: 0, flex: '0 0 auto',
                    background: 'transparent', border: 'none',
                    color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
                    opacity: 0.6, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }
                }, K.ui.icon('close', { size: 10 }))
              );
            })),

        (t.bookmarks || []).length > 0 ? e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%', marginTop: 6 },
          onClick: function () { K.hex.clearBookmarks(); }
        }, 'Clear Bookmarks') : null
      ),

      wf && wf.helpText ? e(Section, { title: 'Help' },
        e('div', {
          style: {
            fontSize: 11, lineHeight: 1.55,
            color: 'var(--kt-sidebar-fg)', opacity: 0.9
          }
        }, wf.helpText)
      ) : null,

      t.status ? e('div', {
        style: {
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--kt-sidebar-fg)',
          opacity: 0.85,
          borderTop: '1px solid var(--kt-widget-border-default)',
          marginTop: 8,
          wordBreak: 'break-word'
        }
      }, t.status) : null
    );
  }

  K.ui.registerSidebarProvider('hex', HexSidebar);

})(window);
