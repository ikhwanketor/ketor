/* ============================================================
   Ketor - Translate Sidebar (v4)
   ------------------------------------------------------------
   Batch 20: the ROM and Table readouts are gone, the group list
   scrolls, and the old Build section is replaced by the Kruptar
   style project operations:
     - Compile the selected group (recalculates and inserts only
       the text of that group),
     - Compile every group at once,
     - Save the whole translation progress as <rom>.ketor,
     - Load it back.
   Exporting a ROM belongs to the Patch & Export activity, so this
   sidebar never offers a download: a finished compile is reported and
   the bytes stay in state for that activity to pick up.
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
      e('div', {
        className: 'kt-sidebar-section-body',
        style: Object.assign({ padding: '6px 12px 12px 12px' }, props.bodyStyle || {})
      },
        props.children
      )
    );
  }

  function Action(props) {
    return e('button', {
      type: 'button',
      className: 'kt-btn small',
      title: props.title || '',
      disabled: props.disabled === true,
      onClick: props.onClick,
      style: { width: '100%', marginTop: props.first ? 0 : 6, textAlign: 'left' }
    }, props.label);
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  /* Pointers & Insert Range (batch 94).
     A declaration, the way Atlas declares a cartridge: which table the engine reads
     to find a record, and what may happen to a record that outgrows the room it has.
     The readout is the truth the build will use, not a suggestion: source, site,
     entry size and base come straight from the table the engine is handed. */
  /* Four ways to pay for a record that outgrows its room. The first is the one a
     translator asked for: shift first, verify every shift, and move the records the
     shift cannot keep. The others exist because a game can prefer one layout. */
  var INSERT_MODES = [
    {
      id: 'hybrid',
      label: 'Shift first, move what fails',
      title: 'Each grown record is shifted in place first - the layout the reference indonesian patch uses, everything keeps its address - and every shift is checked against the whole rom. A shift that would leave a record broken is undone and that record moves to free space instead.'
    },
    {
      id: 'moveonly',
      label: 'Always move to free space',
      title: 'Nothing in the message region is touched: every grown record is copied to free space and only its own pointer is rewritten. The Atlas rule, and the fastest for a whole translation.'
    },
    {
      id: 'shiftonly',
      label: 'Only shift, never move',
      title: 'A grown record is shifted in place or reported; nothing is ever copied elsewhere. Use it when you want the message region to keep exactly the layout the original game had.'
    },
    {
      id: 'never',
      label: 'Never move, only report',
      title: 'Nothing is written for a record that needs more room; the build reports how many bytes it is short.'
    }
  ];

  function TranslateSidebar() {
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;

    var onOpenSearch = uC(function () {
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
          detail: { activity: 'search', source: 'translate-sidebar' }
        }));
      } catch (_) { }
    }, []);

    var onDetectPointers = uC(function () { K.translate.detectPointers(); }, []);
    var onUseTable = uC(function (candidate) { K.translate.declarePointerTable(candidate); }, []);
    var onClearTable = uC(function () { K.translate.clearPointerTable(); }, []);
    var onInsertMode = uC(function (modeId) {
      if (modeId === 'moveonly') K.translate.setBuildOptions({ allowMessageShift: false, allowRelocation: true });
      else if (modeId === 'shiftonly') K.translate.setBuildOptions({ allowMessageShift: true, allowRelocation: false });
      else if (modeId === 'never') K.translate.setBuildOptions({ allowMessageShift: false, allowRelocation: false });
      else K.translate.setBuildOptions({ allowMessageShift: null, allowRelocation: null });
    }, []);

    var onCompileGroup = uC(function () { K.translate.buildModifiedRom('group'); }, []);
    var onCompileAll = uC(function () { K.translate.buildModifiedRom('all'); }, []);
    var onSaveProject = uC(function () { K.translate.saveProject(); }, []);
    var onLoadProject = uC(function () {
      var inp = document.getElementById('kt-input-project');
      if (inp) inp.click();
    }, []);
    var onExportCsv = uC(function () { K.translate.exportCsv(); }, []);
    var onImportCsv = uC(function () {
      var inp = document.getElementById('kt-input-csv');
      if (inp) inp.click();
    }, []);

    var groups = (s && s.groups) ? s.groups : [];
    var texts = (s && s.texts) ? s.texts : [];
    var expandedGroups = (s && s.expandedGroups) ? s.expandedGroups : {};
    var selectedGroupId = s ? s.selectedGroupId : null;

    var onToggleExpand = uC(function (id) {
      if (K.search) K.search.toggleGroupExpand(id);
    }, []);
    var onSelectGroup = uC(function (id) {
      if (K.search) K.search.selectGroup(id);
    }, []);
    var onRenameGroup = uC(function (id, name) {
      if (K.search) K.search.renameGroup(id, name);
    }, []);
    var onDeleteGroup = uC(function (id) {
      if (K.search) K.search.deleteGroup(id);
    }, []);
    var onRemoveText = uC(function (groupId, startByte) {
      if (K.search) K.search.removeFromGroup(groupId, startByte);
    }, []);
    var onMoveGroup = uC(function (id, direction) {
      if (K.search) K.search.moveGroup(id, direction);
    }, []);
    var onMoveText = uC(function (groupId, startByte, direction) {
      if (K.search) K.search.moveTextInGroup(groupId, startByte, direction);
    }, []);
    var onSortTexts = uC(function (groupId) {
      if (K.search) K.search.sortTextsInGroup(groupId);
    }, []);

    var pointerInfo = K.translate.getPointerTableInfo();
    var bo = t.buildOptions || {};
    var insertMode = 'hybrid';
    if (bo.allowMessageShift === false && bo.allowRelocation === true) insertMode = 'moveonly';
    else if (bo.allowMessageShift === true) insertMode = 'shiftonly';
    else if (bo.allowMessageShift === false) insertMode = 'never';

    var hasTexts = texts.length > 0;
    var selectedGroup = null;
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi].id === selectedGroupId) { selectedGroup = groups[gi]; break; }
    }
    var selectedCount = selectedGroup ? (selectedGroup.offsets || []).length : 0;

    return e('div', { style: { paddingBottom: 12 } },

      e(Section, { title: 'Project' },
        e(Action, {
          label: 'Save Project (.ketor)',
          title: 'Saves the whole translation progress, groups and translations, as <rom>.ketor.',
          disabled: !hasTexts && groups.length === 0,
          onClick: onSaveProject
        }),
        e(Action, {
          label: 'Load Project (.ketor)',
          title: 'Restores groups and translations from a saved .ketor file.',
          onClick: onLoadProject
        }),
        // No download here on purpose: getting a patched ROM out of the app
        // belongs to the Patch & Export activity. A finished compile is only
        // reported, so the user knows it is ready for that activity.
        t.isBusy ? e('div', {
          style: {
            marginTop: 8, height: 4,
            background: 'var(--kt-input-bg)', borderRadius: 2, overflow: 'hidden'
          }
        }, e('div', {
          style: {
            height: '100%',
            width: Math.max(2, Math.min(100, t.progress || 0)) + '%',
            background: 'var(--kt-focus-border)',
            transition: 'width 0.2s'
          }
        })) : null
      ),

      e(Section, {
        title: 'Groups (' + groups.length + ')',
        bodyStyle: { padding: '0 0 0 0' }
      },
        groups.length === 0
          ? e('div', { style: { padding: '10px 12px' } },
              e('div', {
                style: {
                  fontSize: 11, color: 'var(--kt-sidebar-fg)',
                  opacity: 0.75, lineHeight: 1.5, marginBottom: 8
                }
              }, 'No groups yet. Extract and group texts in the Search Text activity.'),
              e(Action, {
                label: 'Open Search Text',
                first: true,
                disabled: !t.romBytes,
                onClick: onOpenSearch
              })
            )
          : e('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
              // The list itself scrolls: a project with many groups used to
              // push everything below it out of reach.
              e('div', {
                style: {
                  maxHeight: '46vh',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  borderTop: '1px solid var(--kt-widget-border-default)',
                  borderBottom: '1px solid var(--kt-widget-border-default)'
                }
              },
                e(K.ui.KetorGroupsPanel, {
                  groups: groups,
                  texts: texts,
                  expanded: expandedGroups,
                  onToggleExpand: onToggleExpand,
                  onSelect: onSelectGroup,
                  onRename: onRenameGroup,
                  onDelete: onDeleteGroup,
                  onRemoveText: onRemoveText,
                  onMoveGroup: onMoveGroup,
                  onMoveText: onMoveText,
                  onSortTexts: onSortTexts,
                  selectedGroupId: selectedGroupId
                })
              ),
              e('div', { style: { padding: '6px 12px 0 12px' } },
                e(Action, {
                  label: 'Edit in Search Text',
                  first: true,
                  onClick: onOpenSearch
                })
              )
            )
      ),

      /* Pointers & Insert Range. Before this panel the tool decided both silently:
         the table came from a registry the user could not see, and whether a record
         might move was a constant in the code. */
      e(Section, { title: 'Pointers & Insert Range' },
        e('div', { style: { fontSize: 11, lineHeight: 1.5, color: 'var(--kt-sidebar-fg)', opacity: 0.85 } },
          e('div', { style: { fontWeight: 600, opacity: 1 } }, pointerInfo.label),
          pointerInfo.table
            ? e('div', { style: { marginTop: 2, fontFamily: 'monospace' } },
                '0x' + Number(pointerInfo.table.at).toString(16).toUpperCase() +
                '  ' + Number(pointerInfo.table.count) + ' entries' +
                '  ' + (Number(pointerInfo.table.entrySize) || 4) + ' byte' +
                '  base 0x' + (Number(pointerInfo.table.base) || 0).toString(16).toUpperCase())
            : null,
          e('div', { style: { marginTop: 4 } }, pointerInfo.note)
        ),
        e(Action, {
          label: 'Detect pointer table',
          title: 'Reads the loaded rom and reports compact pointer tables it can prove: constant spacing, every record closing with the terminator, and one entry delta over the texts you extracted.',
          disabled: !t.romBytes,
          onClick: onDetectPointers
        }),
        t.pointerNote ? e('div', {
          style: { marginTop: 6, fontSize: 11, opacity: 0.8, color: 'var(--kt-sidebar-fg)', lineHeight: 1.45 }
        }, t.pointerNote) : null,
        (t.pointerReport || []).length ? e('div', { style: { marginTop: 6 } },
          (t.pointerReport || []).map(function (cand, ci) {
            return e('button', {
              key: 'cand' + ci,
              type: 'button',
              className: 'kt-btn small',
              title: cand.confirmed ? 'Every record span closes and one entry delta covers the extracted texts.' : 'The structure is regular but the records did not all close; use it only if you know this rom.',
              onClick: function () { onUseTable(cand); },
              style: { width: '100%', textAlign: 'left', marginTop: 4 }
            }, 'Use 0x' + Number(cand.at).toString(16).toUpperCase() + ' · ' + cand.count + ' entries' + (cand.confirmed ? ' · records close' : ' · unconfirmed'));
          })
        ) : null,
        pointerInfo.source !== 'profile' ? e(Action, {
          label: 'Use no declared table',
          title: 'Falls back to the verified profile for this rom, or to a per block pointer search.',
          onClick: onClearTable
        }) : null,
        e('div', {
          style: { marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--kt-sidebar-fg)' }
        }, 'When a record needs more room'),
        INSERT_MODES.map(function (m) {
          return e('button', {
            key: m.id,
            type: 'button',
            className: 'kt-btn small',
            title: m.title,
            onClick: function () { onInsertMode(m.id); },
            style: { width: '100%', textAlign: 'left', marginTop: 4, fontWeight: insertMode === m.id ? 600 : 400 }
          }, (insertMode === m.id ? '● ' : '○ ') + m.label);
        }),
        t.buildSummary ? e('div', {
          style: { marginTop: 8, fontSize: 11, opacity: 0.8, color: 'var(--kt-sidebar-fg)', lineHeight: 1.45 }
        }, 'Last insert: ' +
          (t.buildSummary.relocated || 0) + ' record(s) moved to free space, ' +
          (t.buildSummary.grewInPlace || 0) + ' grew where they were, ' +
          (t.buildSummary.leftWhereItIs || 0) + ' left alone' +
          ((t.buildSummary.warnings || []).length ? ', ' + t.buildSummary.warnings.length + ' warning(s)' : '.')) : null
      ),

      hasTexts ? e(Section, { title: 'Translation I/O' },
        e(Action, {
          label: 'Export CSV',
          first: true,
          title: 'Writes one row per text that belongs to a group: group, offset, original, translation.',
          onClick: onExportCsv
        }),
        e(Action, {
          label: 'Import CSV',
          title: 'Reads a CSV in that same shape and applies the translations by offset.',
          onClick: onImportCsv
        })
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

  K.ui.registerSidebarProvider('translation', TranslateSidebar);
})(window);
