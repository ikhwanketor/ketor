/* ============================================================
   Ketor - Table Activity Editor Tab
   ------------------------------------------------------------
   Left panel: candidate list (Offset / Values / Preview) +
               full preview with search bar + Apply .tbl
   Right panel: edit table (visual, 6 columns) +
                large Apply for ROM button
   ============================================================ */

/* ============================================================
   Ketor - Table Activity Tab (v3)
   ------------------------------------------------------------
   Left top:  Results (Offset | Values | Preview-in-game)
   Left bot:  Preview .tbl (hex=char) + Compare (loaded .tbl)
   Right:     Edit Table + Apply for ROM
   ============================================================ */

/* Ketor - Table Tab v4 (KtBox collapsible + merged preview/compare) */

/* ============================================================
   Ketor - Table Activity Editor Tab (v5)
   ------------------------------------------------------------
   Left top:  Results (Offset | Values | Preview-in-game)
   Left bot:  Preview (generated = editable, loaded = read-only)
   Right:     Edit Table + Apply for ROM
   ============================================================ */

/* ============================================================
   Ketor - Table Activity Editor Tab (v6)
   ------------------------------------------------------------
   Adds Smart Guess + Reset Smart Guess buttons in Results
   header. Re-run shows confirmation before overwriting preview.
   ============================================================ */

/* ============================================================
   Ketor - Table Activity Editor Tab (v7)
   ------------------------------------------------------------
   Adds "Adopt Labels" button in Preview header (visible only
   when a compare table is loaded). Smart Guess / Reset Smart
   remain in Results header.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uC = R.useCallback;

  var KtBox = K.ui.KtBox;

  function thStyle(w, align) {
    return {
      padding: '4px 6px',
      width: w,
      textAlign: align || 'center',
      borderBottom: '1px solid var(--kt-widget-border-default)',
      fontWeight: 600,
      fontSize: 10,
      textTransform: 'uppercase',
      color: 'var(--kt-sidebar-title-fg)'
    };
  }

  function tdStyle(align) {
    return {
      padding: '3px 6px',
      textAlign: align || 'center',
      borderBottom: '1px solid var(--kt-widget-border-default)',
      overflow: 'hidden'
    };
  }

  function inputMini(w) {
    return {
      width: w,
      background: 'var(--kt-input-bg)',
      color: 'var(--kt-input-fg)',
      border: '1px solid var(--kt-input-border)',
      borderRadius: 2,
      padding: '2px 4px',
      fontFamily: 'var(--kt-font-mono)',
      fontSize: 11
    };
  }

  function ResultsTable(props) {
    var results = props.results;
    var selectedIdx = props.selectedIdx;

    if (!results.length) {
      return e('div', {
        style: {
          padding: 20,
          textAlign: 'center',
          fontStyle: 'italic',
          fontSize: 12,
          color: 'var(--kt-input-placeholder-fg)'
        }
      }, 'No results yet. Enter text in-game and click Search.');
    }

    return e('table', {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--kt-font-mono)',
        fontSize: 11
      }
    },
      e('thead', null,
        e('tr', null,
          e('th', { style: thStyle(90, 'left') }, 'Offset'),
          e('th', { style: thStyle(110, 'left') }, 'Values'),
          e('th', { style: thStyle(0, 'left') }, 'Preview')
        )
      ),
      e('tbody', null,
        results.map(function (r, idx) {
          var isSel = idx === selectedIdx;
          return e('tr', {
            key: 'r' + idx,
            onClick: function () { K.table.selectResult(idx); },
            style: {
              cursor: 'pointer',
              background: isSel
                ? 'var(--kt-list-active-selection-bg)'
                : (idx % 2 ? 'transparent' : 'rgba(255,255,255,0.02)')
            }
          },
            e('td', { style: tdStyle('left') }, '0x' + r.offset.toString(16).toUpperCase()),
            e('td', { style: tdStyle('left') }, r.valuesLabel || ''),
            e('td', {
              style: Object.assign(tdStyle('left'), {
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: 0.85
              })
            }, r.preview)
          );
        })
      )
    );
  }

  function PreviewBody(props) {
    var previewContent = props.previewContent;
    var compareFileName = props.compareFileName;
    var compareContent = props.compareContent;
    var onPreviewChange = props.onPreviewChange;

    if (!previewContent && !compareFileName) {
      return e('div', {
        style: {
          padding: 12,
          fontStyle: 'italic',
          fontSize: 11,
          color: 'var(--kt-input-placeholder-fg)'
        }
      }, 'Select a result to see its .tbl preview.');
    }

    var baseStyle = {
      margin: 0,
      padding: 8,
      background: 'var(--kt-editor-bg)',
      border: '1px solid var(--kt-widget-border-default)',
      borderRadius: 2,
      fontFamily: 'var(--kt-font-mono)',
      fontSize: 11,
      lineHeight: 1.5,
      color: 'var(--kt-editor-fg)',
      height: '100%',
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      boxSizing: 'border-box'
    };

    var textareaStyle = Object.assign({}, baseStyle, {
      width: '100%',
      resize: 'none',
      outline: 'none',
      display: 'block'
    });

    var renderGenerated = function () {
      if (typeof onPreviewChange === 'function') {
        return e('textarea', {
          value: previewContent || '',
          onChange: function (ev) { onPreviewChange(ev.target.value); },
          spellCheck: false,
          title: 'Edits the generated table in place, one hex=char pair per line; the rows reach the Edit Panel, not the ROM',
          placeholder: 'Edit generated table here (hex=char per line)...',
          style: textareaStyle
        });
      }
      return e('pre', { style: baseStyle }, previewContent || '');
    };

    if (!compareFileName) {
      return e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          gap: 4
        }
      },
        typeof onPreviewChange === 'function'
          ? e('div', { style: { fontSize: 10, color: '#3794ff', flex: '0 0 auto' } }, 'Generated (editable)')
          : null,
        e('div', { style: { flex: '1 1 auto', minHeight: 0 } }, renderGenerated())
      );
    }

    return e('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        height: '100%',
        minHeight: 0
      }
    },
      e('div', {
        style: { display: 'flex', flexDirection: 'column', minHeight: 0 }
      },
        e('div', { style: { fontSize: 10, color: '#3794ff', marginBottom: 4, flex: '0 0 auto' } },
          'Generated (editable)'),
        e('div', { style: { flex: '1 1 auto', minHeight: 0 } }, renderGenerated())
      ),
      e('div', {
        style: { display: 'flex', flexDirection: 'column', minHeight: 0 }
      },
        e('div', { style: { fontSize: 10, color: '#3794ff', marginBottom: 4, flex: '0 0 auto' } },
          'Loaded: ' + compareFileName),
        e('pre', { style: baseStyle }, compareContent || '(empty)')
      )
    );
  }

  function EditTableBody(props) {
    var entries = props.entries;

    return e('div', {
      style: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }
    },
      e('div', { style: { display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', flex: '0 0 auto' } },
        e('button', {
          type: 'button', className: 'kt-btn small',
          title: 'Appends an empty row at the end so a code the search missed can be typed in by hand',
          onClick: function () { K.table.addEditEntry(); }
        }, '+ Add'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          title: 'Puts the edit rows in hex order; it needs at least two rows and reorders nothing else',
          onClick: function () { K.table.sortEditTable(); },
          disabled: entries.length < 2
        }, 'Sort'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          title: 'Saves the Edit Table as a .tbl file named after the loaded ROM; it needs at least one row',
          onClick: function () { K.table.downloadEditTable(); },
          disabled: entries.length === 0
        }, 'Download .tbl'),
        e('button', {
          type: 'button', className: 'kt-btn small btn-danger',
          title: 'Removes every row of the Edit Table and forgets where it came from; the ROM is untouched, the table is lost',
          onClick: function () { K.table.clearEditTable(); },
          disabled: entries.length === 0
        }, 'Clear')
      ),
      e('div', {
        style: {
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid var(--kt-widget-border-default)',
          borderRadius: 2,
          background: 'var(--kt-editor-bg)'
        }
      },
        entries.length === 0
          ? e('div', {
              style: {
                padding: 16,
                textAlign: 'center',
                fontStyle: 'italic',
                fontSize: 11,
                color: 'var(--kt-input-placeholder-fg)'
              }
            }, 'Edit Table is empty. Apply preview or load a .tbl.')
          : e('table', {
              style: {
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--kt-font-mono)',
                fontSize: 11
              }
            },
              e('thead', null,
                e('tr', null,
                  e('th', { style: thStyle(28) }, '#'),
                  e('th', { style: thStyle(70, 'left') }, 'Hex'),
                  e('th', { style: thStyle(80, 'left') }, 'Char'),
                  e('th', { style: thStyle(70, 'left') }, 'Bytes'),
                  e('th', { style: thStyle(110, 'left') }, 'Comment'),
                  e('th', { style: thStyle(36) }, '')
                )
              ),
              e('tbody', null,
                entries.map(function (en, idx) {
                  return e('tr', {
                    key: en.id,
                    style: { background: idx % 2 ? 'transparent' : 'rgba(255,255,255,0.02)' }
                  },
                    e('td', { style: tdStyle() }, idx + 1),
                    e('td', { style: tdStyle('left') },
                      e('input', {
                        type: 'text',
                        title: 'Code of this row in hex; changing it updates the bytes and the automatic comment beside it',
                        value: en.hex,
                        onChange: function (ev) {
                          var v = ev.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                          K.table.updateEditEntry(en.id, { hex: v });
                        },
                        style: inputMini(70)
                      })
                    ),
                    e('td', { style: tdStyle('left') },
                      e('input', {
                        type: 'text',
                        title: 'Character this code stands for; typing one refreshes the bytes and comment so the .tbl line stays consistent',
                        value: en.char,
                        onChange: function (ev) {
                          K.table.updateEditEntry(en.id, { char: ev.target.value });
                        },
                        style: inputMini(80)
                      })
                    ),
                    e('td', { style: Object.assign(tdStyle('left'), { opacity: 0.6 }) }, en.bytes),
                    e('td', { style: tdStyle('left') },
                      e('input', {
                        type: 'text',
                        title: 'Free note kept with this row in the .tbl export; it never reaches the ROM and may be left empty',
                        value: en.comment || '',
                        placeholder: 'note',
                        onChange: function (ev) {
                          K.table.updateEditEntry(en.id, { comment: ev.target.value });
                        },
                        style: inputMini(110)
                      })
                    ),
                    e('td', { style: tdStyle() },
                      e('button', {
                        type: 'button',
                        className: 'icon-btn',
                        style: { width: 22, height: 22, padding: 0 },
                        onClick: function () { K.table.removeEditEntry(en.id); },
                        title: 'Remove'
                      }, K.ui.icon('close', { size: 12 }))
                    )
                  );
                })
              )
            )
      )
    );
  }

  function TableTab() {
    var t = K.table.useTable();

    var onLoadCompare = uC(function () {
      var inp = document.getElementById('kt-input-table-compare');
      if (inp) inp.click();
    }, []);

    var onClearCompare = uC(function () {
      K.table.clearCompare();
    }, []);

    var onAdoptLabels = uC(function () {
      K.table.adoptLabelsFromCompare();
    }, []);

    var onApplyPreview = uC(function () {
      K.table.applyPreviewToEditTable();
    }, []);

    var onApplyForRom = uC(function () {
      K.table.applyForRom();
    }, []);

    var onPreviewChange = uC(function (value) {
      K.table.setPreviewTbl(value);
    }, []);

    var onRunSmartGuess = uC(function () {
      if (t.previewTbl && t.smartGuessActive) {
        var ok = global.confirm(
          'Re-run will overwrite the current preview, including any manual edits. Continue?'
        );
        if (!ok) return;
      }
      K.table.runSmartGuess();
    }, [t.previewTbl, t.smartGuessActive]);

    var onResetSmartGuess = uC(function () {
      K.table.resetSmartGuess();
    }, []);

    if (!t.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Table Workspace'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from File menu.')
      );
    }

    var resultsActions = [];
    if (t.results.length > 0) {
      resultsActions.push(e('button', {
        key: 'smart',
        type: 'button',
        className: 'kt-btn small',
        onClick: onRunSmartGuess,
        title: 'Detect control codes ([LINE], [END]) from text flow'
      }, 'Smart Guess'));
      if (t.smartGuessActive) {
        resultsActions.push(e('button', {
          key: 'reset-smart',
          type: 'button',
          className: 'kt-btn small',
          onClick: onResetSmartGuess,
          title: 'Reset control code labels to unknown'
        }, 'Reset Smart'));
      }
      resultsActions.push(e('button', {
        key: 'clear',
        type: 'button',
        className: 'kt-btn small',
        title: 'Drops every search result and the preview built from them; the Edit Table and a loaded compare file stay',
        onClick: function () { K.table.clearResults(); }
      }, 'Clear'));
    }

    var previewActions = [];
    previewActions.push(e('button', {
      key: 'load-compare',
      type: 'button',
      className: 'kt-btn small',
      title: 'Reads a second .tbl beside the generated preview so the two label sets can be compared side by side',
      onClick: onLoadCompare
    }, 'Load .tbl to Compare'));

    if (t.compareFileName) {
      previewActions.push(e('button', {
        key: 'adopt-labels',
        type: 'button',
        className: 'kt-btn small',
        onClick: onAdoptLabels,
        disabled: !t.previewTbl,
        title: 'Copy labels from loaded table to generated preview'
      }, 'Adopt Labels'));
      previewActions.push(e('button', {
        key: 'clear-compare',
        type: 'button',
        className: 'kt-btn small btn-danger',
        title: 'Unloads the compare table and leaves the Preview box showing the generated table alone',
        onClick: onClearCompare
      }, 'Clear Compare'));
    }

    return e('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '100%',
        gap: 12,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: 12
      }
    },
      e('div', {
        style: {
          display: 'grid',
          gridTemplateRows: '1fr 1fr',
          gap: 8,
          minHeight: 0,
          overflow: 'hidden'
        }
      },
        e(KtBox, {
          id: 'table-results',
          title: 'Results (' + t.results.length + ')',
          actions: resultsActions.length > 0 ? resultsActions : null,
          bodyStyle: { padding: 0 },
          style: { minHeight: 0 }
        },
          e(ResultsTable, { results: t.results, selectedIdx: t.selectedResultIdx })
        ),

        e(KtBox, {
          id: 'table-preview',
          title: t.compareFileName ? 'Preview (compare)' : 'Preview',
          actions: previewActions,
          bodyStyle: { padding: 6 },
          style: { minHeight: 0 }
        },
          e('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              height: '100%',
              gap: 6
            }
          },
            e('div', { style: { flex: '1 1 auto', minHeight: 0 } },
              e(PreviewBody, {
                previewContent: t.previewTbl,
                compareFileName: t.compareFileName,
                compareContent: t.compareTbl,
                onPreviewChange: onPreviewChange
              })
            ),
            t.previewTbl ? e('button', {
              type: 'button',
              className: 'kt-btn',
              title: 'Copies the generated preview into the Edit Table, replacing its rows; use it once the preview reads well',
              style: { flex: '0 0 auto', width: '100%' },
              onClick: onApplyPreview
            }, 'Apply .tbl to Edit Panel') : null
          )
        )
      ),

      e('div', {
        style: {
          display: 'grid',
          gridTemplateRows: '1fr auto',
          gap: 8,
          minHeight: 0,
          overflow: 'hidden'
        }
      },
        e(KtBox, {
          id: 'table-edit',
          title: 'Edit Table' + (t.editSource ? ' - ' + t.editSource : ''),
          bodyStyle: { padding: 8 },
          style: { minHeight: 0 }
        },
          e(EditTableBody, { entries: t.editEntries })
        ),

        e('button', {
          type: 'button',
          title: 'Keeps this Edit Table as the table of the ROM and moves on to Search Text, which reads the texts with it; needs a row',
          onClick: onApplyForRom,
          disabled: t.editEntries.length === 0,
          style: {
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
            width: '100%',
            background: t.isApplied ? '#16825d' : 'var(--kt-button-bg)',
            color: '#fff',
            border: '1px solid ' + (t.isApplied ? '#16825d' : 'var(--kt-button-bg)'),
            borderRadius: 3,
            cursor: t.editEntries.length === 0 ? 'not-allowed' : 'pointer',
            opacity: t.editEntries.length === 0 ? 0.5 : 1
          }
        }, t.isApplied ? 'Applied for ROM' : 'Apply for ROM')
      )
    );
  }

  K.ui.registerTabProvider('table', TableTab);
})(window);