/* ============================================================
   Ketor - Search Text Sidebar (v1)
   ------------------------------------------------------------
   Extraction settings + Extract button + status readout.
   Keeps everything in one column so users do not have to jump
   between activities.
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
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 0', fontSize: 11, color: 'var(--kt-sidebar-fg)'
      }
    },
      e('span', { style: { flex: '0 0 auto', opacity: 0.75, minWidth: 52 } }, props.label),
      e('div', { style: { flex: 1, minWidth: 0 } }, props.children)
    );
  }

  function Check(props) {
    return e('label', {
      style: {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 0', fontSize: 11, color: 'var(--kt-sidebar-fg)',
        cursor: 'pointer'
      }
    },
      e('input', {
        type: 'checkbox',
        checked: props.checked === true,
        onChange: function (ev) { props.onChange(ev.target.checked); }
      }),
      e('span', null, props.label)
    );
  }

  function SearchSidebar() {
    var t = K.search.useSearch();
    var opts = t.extractionOptions || {};
    var st = uS(false);
    var advancedOpen = st[0];
    var setAdvancedOpen = st[1];

    var onExtract = uC(function () { K.search.extractTexts(); }, []);

    var setOpt = uC(function (patch) {
      K.search.setExtractionOptions(patch);
    }, []);

    var canExtract = !!t.romBytes && !!t.tableData && !t.isExtracting;

    return e('div', { style: { paddingBottom: 16 } },

      e(Section, { title: 'Extraction' },
        e(Row, { label: 'Min len:' },
          e('input', {
            type: 'number',
            min: 1,
            max: 512,
            value: opts.minLength || 3,
            onChange: function (ev) {
              setOpt({ minLength: Math.max(1, parseInt(ev.target.value, 10) || 3) });
            },
            style: { width: '100%' }
          })
        ),
        e(Row, { label: 'Max len:' },
          e('input', {
            type: 'number',
            min: 8,
            max: 8192,
            value: opts.maxLength || 1024,
            onChange: function (ev) {
              setOpt({ maxLength: Math.max(8, parseInt(ev.target.value, 10) || 1024) });
            },
            style: { width: '100%' }
          })
        ),
        e(Check, {
          label: 'ASCII fallback',
          checked: opts.asciiFallback !== false,
          onChange: function (v) { setOpt({ asciiFallback: v }); }
        }),
        e(Check, {
          label: 'DTE/MTE compression',
          checked: opts.enableDteMteCompression !== false,
          onChange: function (v) { setOpt({ enableDteMteCompression: v }); }
        }),

        e('button', {
          type: 'button',
          className: 'kt-btn',
          style: { width: '100%', marginTop: 8 },
          onClick: onExtract,
          disabled: !canExtract
        }, t.isExtracting ? 'Extracting...' : 'Extract Texts'),

        t.isExtracting ? e('div', {
          style: {
            marginTop: 8,
            height: 4,
            background: 'var(--kt-input-bg)',
            borderRadius: 2,
            overflow: 'hidden'
          }
        },
          e('div', {
            style: {
              height: '100%',
              width: Math.max(2, Math.min(100, t.progress || 0)) + '%',
              background: 'var(--kt-focus-border)',
              transition: 'width 0.2s'
            }
          })
        ) : null
      ),

      e(Section, { title: 'Advanced' },
        e('button', {
          type: 'button',
          className: 'kt-btn small',
          style: { width: '100%', marginBottom: advancedOpen ? 8 : 0 },
          onClick: function () { setAdvancedOpen(!advancedOpen); }
        }, advancedOpen ? 'Hide Advanced' : 'Show Advanced'),

        advancedOpen ? e('div', null,
          e(Check, {
            label: 'DWE padding byte',
            checked: opts.usePaddingByte === true,
            onChange: function (v) { setOpt({ usePaddingByte: v }); }
          }),
          e(Check, {
            label: 'Text decompression',
            checked: opts.enableTextDecompression === true,
            onChange: function (v) { setOpt({ enableTextDecompression: v }); }
          }),
          e(Check, {
            label: 'Include compressed (read-only)',
            checked: opts.includeCompressedReadOnly === true,
            onChange: function (v) { setOpt({ includeCompressedReadOnly: v }); }
          })
        ) : null
      ),

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

  K.ui.registerSidebarProvider('search', SearchSidebar);

})(window);