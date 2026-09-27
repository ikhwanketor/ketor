/* ============================================================
   Ketor - Table Activity Sidebar
   ------------------------------------------------------------
   Monkey-Moore style search settings + actions.
   ============================================================ */

/* ============================================================
   Ketor - Table Sidebar (v3, Monkey-Moore layout)
   ============================================================ */

/* Ketor - Table Sidebar v4 (multi-sample + editable wildcard) */

/* ============================================================
   Ketor - Table Activity Sidebar (v5)
   ------------------------------------------------------------
   Adds "Show control hints" toggle in Advanced section.
   Hints are cosmetic comments (e.g. "likely [DELAY] (60%)")
   shown in Edit Table's Comment column for control bytes.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uC = R.useCallback;

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
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 0', fontSize: 11, color: 'var(--kt-sidebar-fg)'
      }
    },
      e('span', { style: { flex: '0 0 auto', opacity: 0.75, minWidth: 52 } }, props.label),
      e('div', { style: { flex: 1, minWidth: 0 } }, props.children)
    );
  }

  function TableSidebar() {
    var t = K.table.useTable();

    var onSample = uC(function (ev) {
      K.table.setSampleText(ev.target.value);
    }, []);

    var onWildChar = uC(function (ev) {
      var v = ev.target.value;
      K.table.setWildcardChar(v);
    }, []);

    var onHistory = uC(function (ev) {
      var v = ev.target.value;
      if (v) K.table.setSampleText(v);
    }, []);

    var onSearch = uC(function () { K.table.runSearch(); }, []);

    var onLoadFile = uC(function () {
      var inp = document.getElementById('kt-input-table');
      if (inp) inp.click();
    }, []);

    var onToggleHints = uC(function (ev) {
      K.table.setShowControlHints(ev.target.checked);
    }, []);

    var sampleLines = String(t.sampleText || '')
      .split('\n')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    var sampleCount = sampleLines.length;

    return e('div', { style: { paddingBottom: 16 } },

      e(Section, { title: 'Search Parameters' },
        e('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' } },
            e('input', {
              type: 'radio',
              name: 'kt-mm-mode',
              title: 'Matches the sample by the differences between its characters, so the byte values themselves do not have to be known',
              checked: t.searchMode === 'relative',
              onChange: function () { K.table.setSearchMode('relative'); }
            }),
            'Relative'
          ),
          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' } },
            e('input', {
              type: 'radio',
              name: 'kt-mm-mode',
              title: 'Reads the box above as numbers, not text, and looks for that sequence by the gaps between the values',
              checked: t.searchMode === 'value-scan',
              onChange: function () { K.table.setSearchMode('value-scan'); }
            }),
            'Value Scan'
          )
        ),

        e('textarea', {
          className: 'kt-textarea',
          title: 'One sample text per line; more lines make the match more reliable, and Value Scan mode reads them as numbers',
          placeholder: t.searchMode === 'value-scan'
            ? 'Values e.g., 41 42 43'
            : 'text in-game e.g., PRESS START',
          value: t.sampleText,
          onChange: onSample,
          rows: 4,
          style: {
            minHeight: 76,
            fontFamily: 'var(--kt-font-mono)',
            fontSize: 12,
            marginBottom: 6
          }
        }),

        e('div', {
          style: { fontSize: 10, opacity: 0.6, marginBottom: 6 }
        }, t.searchMode === 'value-scan'
            ? 'Values separated by space or comma.'
            : sampleCount + ' sample(s). One text per line, longer = more accurate.'),

        t.searchHistory.length > 0 ? e('select', {
          className: 'kt-select',
          title: 'Fills the sample box with a text you searched before; picking one does not start a new run by itself',
          style: { fontSize: 11, marginBottom: 6 },
          value: '',
          onChange: onHistory
        },
          e('option', { value: '' }, 'History (' + t.searchHistory.length + ')'),
          t.searchHistory.map(function (h, i) {
            var label = h.split('\n')[0];
            return e('option', { key: 'h' + i, value: h }, label.length > 40 ? label.slice(0, 40) + '...' : label);
          })
        ) : null,

        e('button', {
          type: 'button',
          className: 'kt-btn',
          title: 'Runs the sample over the whole ROM with the settings above; it waits for a ROM and at least one non-empty line',
          style: { width: '100%', marginBottom: 8 },
          onClick: onSearch,
          disabled: t.isSearching || !t.romBytes || sampleCount === 0
        }, t.isSearching ? 'Searching...' : 'Search'),

        e('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 0', fontSize: 11
          }
        },
          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: 1 } },
            e('input', {
              type: 'checkbox',
              title: 'Lets the wildcard character stand for any single character in the sample; turn it off when the text has to match exactly',
              checked: t.wildcardEnabled,
              onChange: function (ev) { K.table.setWildcardEnabled(ev.target.checked); }
            }),
            'Enable wildcards'
          ),
          e('input', {
            type: 'text',
            value: t.wildcardChar,
            onChange: onWildChar,
            maxLength: 1,
            title: 'Wildcard character (any single char)',
            style: {
              width: 32,
              textAlign: 'center',
              fontFamily: 'var(--kt-font-mono)',
              background: 'var(--kt-input-bg)',
              color: 'var(--kt-input-fg)',
              border: '1px solid var(--kt-input-border)',
              borderRadius: 2,
              padding: '2px 4px',
              fontSize: 12,
              cursor: 'text'
            }
          })
        ),

        e('div', {
          style: {
            display: 'flex', gap: 8, alignItems: 'center',
            padding: '3px 0', fontSize: 11
          }
        },
          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            e('input', {
              type: 'radio',
              name: 'kt-mm-bw',
              title: 'Reads one character as one byte; this is only the fallback when the loaded table does not state a wider code',
              checked: t.byteWidth === 8,
              onChange: function () { K.table.setByteWidth(8); }
            }),
            '8-bit'
          ),
          e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            e('input', {
              type: 'radio',
              name: 'kt-mm-bw',
              title: 'Reads one character as two bytes and shows the byte order choice; only the fallback when the table states no width',
              checked: t.byteWidth === 16,
              onChange: function () { K.table.setByteWidth(16); }
            }),
            '16-bit'
          )
        )
      ),

      e(Section, { title: 'Advanced' },
        e('button', {
          type: 'button',
          className: 'kt-btn small',
          title: 'Opens or closes the options most games do not need: charset, byte order and the control hint switch',
          style: { width: '100%', marginBottom: t.advancedOpen ? 8 : 0 },
          onClick: function () { K.table.toggleAdvanced(); }
        }, t.advancedOpen ? 'Hide Advanced' : 'Show Advanced'),

        t.advancedOpen ? e('div', null,
          e(Row, { label: 'Charset:' },
            e('select', {
              className: 'kt-select',
              title: 'Character set the table codes follow; Custom assumes no built-in set and trusts the loaded .tbl for every character',
              value: t.charset,
              onChange: function (ev) { K.table.setCharset(ev.target.value); },
              style: { fontSize: 11 }
            },
              e('option', { value: 'ASCII' }, 'ASCII'),
              e('option', { value: 'SHIFT-JIS' }, 'Shift-JIS'),
              e('option', { value: 'UNICODE' }, 'Unicode'),
              e('option', { value: 'CUSTOM' }, 'Custom')
            )
          ),
          t.byteWidth === 16 ? e(Row, { label: 'Byte order:' },
            e('select', {
              className: 'kt-select',
              title: 'Which byte of a two-byte character comes first in the ROM; it is shown only while the 16-bit width is selected',
              value: t.endianness,
              onChange: function (ev) { K.table.setEndianness(ev.target.value); },
              style: { fontSize: 11 }
            },
              e('option', { value: 'little' }, 'Little (LE)'),
              e('option', { value: 'big' }, 'Big (BE)')
            )
          ) : null,
          e('label', {
            style: {
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 0 2px 0', fontSize: 11,
              color: 'var(--kt-sidebar-fg)', cursor: 'pointer'
            },
            title: 'Show hints about likely control code meanings in the Comment column.'
          },
            e('input', {
              type: 'checkbox',
              checked: t.showControlHints !== false,
              onChange: onToggleHints
            }),
            'Show control hints'
          )
        ) : null
      ),

      e(Section, { title: 'Load .tbl' },
        e('button', {
          type: 'button',
          className: 'kt-btn small',
          title: 'Reads a .tbl file into the Edit Table, replacing the rows already there; nothing is written to the ROM yet',
          style: { width: '100%' },
          onClick: onLoadFile
        }, 'Load .tbl file')
      ),

      t.status ? e('div', {
        style: {
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--kt-sidebar-fg)',
          opacity: 0.8,
          borderTop: '1px solid var(--kt-widget-border-default)',
          marginTop: 8,
          wordBreak: 'break-word'
        }
      }, t.status) : null
    );
  }

  K.ui.registerSidebarProvider('table', TableSidebar);
})(window);