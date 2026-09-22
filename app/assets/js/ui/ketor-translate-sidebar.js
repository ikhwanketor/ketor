/* Ketor Translate Sidebar - registers provider for 'translate' activity */
/* ============================================================
   Ketor - Translate Sidebar (v3)
   ------------------------------------------------------------
   Batch 16: adapted to offset-keyed registry. Groups and texts
   now read from K.search with global expandedGroups, and
   clicking a group sets selectedGroupId for the main tab.
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
        display: 'flex', justifyContent: 'space-between',
        fontSize: '11px', padding: '3px 0',
        color: 'var(--kt-sidebar-fg)'
      }
    },
      e('span', { style: { opacity: 0.7 } }, props.label),
      e('span', { style: { color: 'var(--kt-editor-fg)' } }, props.value)
    );
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

    var onLoadTable = uC(function () {
      var inp = document.getElementById('kt-input-table');
      if (inp) inp.click();
    }, []);

    var onOpenSearch = uC(function () {
      try {
        global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
          detail: { activity: 'search', source: 'translate-sidebar' }
        }));
      } catch (_) { }
    }, []);

    var onBuild = uC(function () { K.translate.buildModifiedRom(); }, []);
    var onExport = uC(function () { K.translate.downloadModifiedRom(); }, []);
    var onExportCsv = uC(function () { K.translate.exportCsv(); }, []);
    var onImportCsv = uC(function () {
      var inp = document.querySelector('[data-ketor-role="csv"]');
      if (inp) inp.click();
    }, []);

    var groups = (s && s.groups) ? s.groups : [];
    var texts = (s && s.texts) ? s.texts : [];
    var expandedGroups = (s && s.expandedGroups) ? s.expandedGroups : {};

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

    return e('div', { style: { paddingBottom: 12 } },
      e(Section, { title: 'ROM' },
        t.romName
          ? e('div', null,
              e(Row, { label: 'Name', value: t.romName }),
              e(Row, { label: 'Size', value: formatBytes(t.romSize) }),
              e(Row, { label: 'System', value: t.romSystem || '?' })
            )
          : e('div', { className: 'kt-text-dim kt-text-small' },
              'No ROM loaded. Use File > Load ROM.')
      ),

      e(Section, { title: 'Table' },
        t.tableData
          ? e('div', null,
              e(Row, { label: 'Name', value: t.tableData.name }),
              e(Row, { label: 'Entries', value: String(t.tableData.entryCount) }),
              e('button', {
                type: 'button', className: 'kt-btn small',
                style: { marginTop: 8, width: '100%' },
                onClick: onLoadTable
              }, 'Reload Table')
            )
          : e('button', {
              type: 'button', className: 'kt-btn small',
              style: { width: '100%' },
              onClick: onLoadTable,
              disabled: !t.romName
            }, 'Load Table (.tbl)')
      ),

      e(Section, { title: 'Groups (' + groups.length + ')' },
        groups.length === 0
          ? e('div', null,
              e('div', {
                style: {
                  fontSize: 11,
                  color: 'var(--kt-sidebar-fg)',
                  opacity: 0.75,
                  lineHeight: 1.5,
                  marginBottom: 8
                }
              }, 'No groups yet. Extract and group texts in the Search Text activity.'),
              e('button', {
                type: 'button',
                className: 'kt-btn small',
                style: { width: '100%' },
                onClick: onOpenSearch,
                disabled: !t.romBytes
              }, 'Open Search Text')
            )
          : e('div', null,
              e('div', {
                style: {
                  border: '1px solid var(--kt-widget-border-default)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: 'var(--kt-sidebar-bg)'
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
                  selectedGroupId: s ? s.selectedGroupId : null
                })
              ),
              e('button', {
                type: 'button',
                className: 'kt-btn small',
                style: { marginTop: 8, width: '100%' },
                onClick: onOpenSearch
              }, 'Edit in Search Text')
            )
      ),

      hasTexts ? e(Section, { title: 'Build' },
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%' },
          onClick: onBuild,
          disabled: t.isBusy
        }, t.isBusy ? 'Building...' : 'Build Modified ROM'),
        t.modifiedRom ? e('button', {
          type: 'button', className: 'kt-btn small',
          style: { marginTop: 6, width: '100%' },
          onClick: onExport
        }, 'Download ROM (' + formatBytes(t.modifiedRom.length) + ')') : null
      ) : null,

      hasTexts ? e(Section, { title: 'Translation I/O' },
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { width: '100%' },
          onClick: onExportCsv
        }, 'Export CSV'),
        e('button', {
          type: 'button', className: 'kt-btn small',
          style: { marginTop: 6, width: '100%' },
          onClick: onImportCsv
        }, 'Import CSV')
      ) : null,

      t.status ? e('div', {
        style: {
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--kt-sidebar-fg)',
          opacity: 0.8,
          borderTop: '1px solid var(--kt-widget-border-default)',
          marginTop: 8
        }
      }, t.status) : null
    );
  }

  K.ui.registerSidebarProvider('translation', TranslateSidebar);
})(window);