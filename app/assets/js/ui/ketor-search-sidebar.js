/* ============================================================
   Ketor - Search Text Sidebar (v1)
   ------------------------------------------------------------
   Extraction settings + Extract button + status readout.
   Keeps everything in one column so users do not have to jump
   between activities.
   ============================================================ */

/* ============================================================
   Ketor - Search Text Sidebar (v2)
   ------------------------------------------------------------
   Batch 17: wired to the per-console workflow config.
   - Help box at the top shows getHelpText() for the loaded ROM.
   - Options that only apply to some consoles follow getUIConfig()
     (showPaddingByte / showCompression / showDecompression /
     showStrictMode). While no ROM is loaded the config is null and
     every option stays visible, matching the old behaviour.
   - Extract button label comes from extractionLabel.
   - Strict extractor pass is now a real option instead of a
     hardcoded false; its default is seeded per console by
     Ketor.workflow from recommendedExtraction.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uC = R.useCallback;
  var uE = R.useEffect;
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

  // Collapsible console help. Re-expands whenever the console
  // changes so a novice loading a new ROM always sees the hint.
  function HelpBox(props) {
    var text = String(props.text || '');
    var system = String(props.system || '');
    var st = uS(true);
    var open = st[0];
    var setOpen = st[1];

    uE(function () { setOpen(true); }, [system]);

    if (!text) return null;

    return e('div', {
      style: {
        margin: '8px 12px 0 12px',
        border: '1px solid var(--kt-widget-border-default)',
        borderRadius: 3,
        background: 'var(--kt-editor-bg)',
        overflow: 'hidden'
      }
    },
      e('button', {
        type: 'button',
        className: 'kt-help-toggle',
        'aria-expanded': open,
        onClick: function () { setOpen(!open); },
        style: {
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '6px 8px',
          background: 'transparent', border: 'none',
          color: 'var(--kt-info-fg, #75beff)',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
          textAlign: 'left'
        }
      },
        K.ui.icon(open ? 'chevron-down' : 'chevron-right', { size: 12 }),
        K.ui.icon('info', { size: 12 }),
        e('span', {
          style: {
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }
        }, system ? system + ' workflow help' : 'Workflow help')
      ),
      open ? e('div', {
        style: {
          padding: '0 8px 8px 26px',
          fontSize: 11, lineHeight: 1.55,
          color: 'var(--kt-sidebar-fg)', opacity: 0.9
        }
      }, text) : null
    );
  }

  function SearchSidebar() {
    var t = K.search.useSearch();
    var wf = K.workflow ? K.workflow.useWorkflowConfig() : null;
    var opts = t.extractionOptions || {};
    var uiConfig = wf ? wf.uiConfig : null;
    var vis = K.workflow ? K.workflow.isVisible : function () { return true; };
    var st = uS(false);
    var advancedOpen = st[0];
    var setAdvancedOpen = st[1];

    var showCompression = vis('showCompression');
    var showDecompression = vis('showDecompression');
    var showPaddingByte = vis('showPaddingByte');
    var showStrictMode = vis('showStrictMode');
    var extractLabel = (uiConfig && uiConfig.extractionLabel) || 'Extract Texts';

    var advancedCount =
      (showStrictMode ? 1 : 0) +
      (showPaddingByte ? 1 : 0) +
      (showDecompression ? 2 : 0);

    var onExtract = uC(function () { K.search.extractTexts(); }, []);

    var setOpt = uC(function (patch) {
      K.search.setExtractionOptions(patch);
    }, []);

    var canExtract = !!t.romBytes && !!t.tableData && !t.isExtracting;

    return e('div', { style: { paddingBottom: 16 } },

      e(HelpBox, {
        text: wf ? wf.helpText : '',
        system: wf ? wf.workflowName : ''
      }),

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
        showCompression ? e(Check, {
          label: 'DTE/MTE compression',
          checked: opts.enableDteMteCompression !== false,
          onChange: function (v) { setOpt({ enableDteMteCompression: v }); }
        }) : null,

        e('button', {
          type: 'button',
          className: 'kt-btn',
          style: { width: '100%', marginTop: 8 },
          onClick: onExtract,
          disabled: !canExtract
        }, t.isExtracting ? 'Extracting...' : extractLabel),

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

      advancedCount > 0 ? e(Section, { title: 'Advanced' },
        e('button', {
          type: 'button',
          className: 'kt-btn small',
          style: { width: '100%', marginBottom: advancedOpen ? 8 : 0 },
          onClick: function () { setAdvancedOpen(!advancedOpen); }
        }, advancedOpen ? 'Hide Advanced' : 'Show Advanced'),

        advancedOpen ? e('div', null,
          showStrictMode ? e(Check, {
            label: 'Strict extractor',
            checked: opts.strictExtractorMode === true,
            onChange: function (v) { setOpt({ strictExtractorMode: v }); }
          }) : null,
          showPaddingByte ? e(Check, {
            label: 'DWE padding byte',
            checked: opts.usePaddingByte === true,
            onChange: function (v) { setOpt({ usePaddingByte: v }); }
          }) : null,
          showDecompression ? e(Check, {
            label: 'Text decompression',
            checked: opts.enableTextDecompression === true,
            onChange: function (v) { setOpt({ enableTextDecompression: v }); }
          }) : null,
          showDecompression ? e(Check, {
            label: 'Include compressed (read-only)',
            checked: opts.includeCompressedReadOnly === true,
            onChange: function (v) { setOpt({ includeCompressedReadOnly: v }); }
          }) : null
        ) : null
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

  K.ui.registerSidebarProvider('search', SearchSidebar);

})(window);
