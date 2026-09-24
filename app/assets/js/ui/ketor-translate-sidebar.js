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

    var hasTexts = texts.length > 0;
    var selectedGroup = null;
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi].id === selectedGroupId) { selectedGroup = groups[gi]; break; }
    }
    var selectedCount = selectedGroup ? (selectedGroup.offsets || []).length : 0;

    return e('div', { style: { paddingBottom: 12 } },

      e(Section, { title: 'Project' },
        e(Action, {
          label: 'Compile Selected Group' + (selectedGroup ? ' (' + selectedCount + ')' : ''),
          first: true,
          title: 'Compiles, recalculates and inserts the text of the selected group only.',
          disabled: !t.romBytes || !selectedGroupId || t.isBusy,
          onClick: onCompileGroup
        }),
        e(Action, {
          label: 'Compile All Groups',
          title: 'Recomputes and inserts the text of every group in the project at once.',
          disabled: !t.romBytes || !hasTexts || t.isBusy,
          onClick: onCompileAll
        }),
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
        t.modifiedRom ? e('div', {
          style: {
            marginTop: 8, fontSize: 11,
            color: 'var(--kt-sidebar-fg)', opacity: 0.85, lineHeight: 1.5
          }
        }, 'Compiled ROM ready (' + formatBytes(t.modifiedRom.length) +
           '). Exporting it belongs to the Patch & Export activity.') : null,
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

      hasTexts ? e(Section, { title: 'Translation I/O' },
        e(Action, {
          label: 'Export CSV (grouped texts)',
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
