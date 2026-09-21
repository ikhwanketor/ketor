/* ============================================================
   Ketor - Groups Panel (shared component)
   ------------------------------------------------------------
   Kruptar7-style accordion for text groups. Reusable across
   the Search Text editor (right column) and the Translation
   sidebar. Renders a plain list — parent wraps it in KtBox /
   Section as needed.
   ============================================================ */

/* ============================================================
   Ketor - Groups Panel (shared component) v2
   ------------------------------------------------------------
   Adds up/down buttons for manual reordering of groups and of
   texts within a group. Buttons are compact 18x18 icons that
   sit next to existing action buttons.
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
  var uM = R.useMemo;
  var uR = R.useRef;
  var uE = R.useEffect;

  function iconButtonStyle(disabled) {
    return {
      width: 20, height: 20,
      background: 'transparent',
      border: 'none',
      color: 'var(--kt-sidebar-fg)',
      cursor: disabled ? 'default' : 'pointer',
      padding: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 2,
      opacity: disabled ? 0.25 : 0.6,
      flex: '0 0 auto'
    };
  }

  function GroupItem(props) {
    var g = props.group;
    var index = props.index;
    var total = props.total;
    var texts = props.texts;
    var expanded = props.expanded;
    var onToggleExpand = props.onToggleExpand;
    var onRename = props.onRename;
    var onDelete = props.onDelete;
    var onRemoveText = props.onRemoveText;
    var onSelect = props.onSelect;
    var onMoveGroup = props.onMoveGroup;
    var onMoveText = props.onMoveText;
    var onSortTexts = props.onSortTexts;
    var selected = props.selected;

    var st = uS(false);
    var editing = st[0];
    var setEditing = st[1];
    var ev = uS(g.name);
    var editVal = ev[0];
    var setEditVal = ev[1];
    var editRef = uR(null);

    uE(function () {
      if (editing && editRef.current) {
        editRef.current.focus();
        editRef.current.select();
      }
    }, [editing]);

    uE(function () {
      if (!editing) setEditVal(g.name);
    }, [g.name, editing]);

    var commitRename = function () {
      var v = String(editVal || '').trim();
      if (v && v !== g.name) onRename(g.id, v);
      setEditing(false);
    };

    var groupTexts = uM(function () {
      var map = {};
      (texts || []).forEach(function (t) { map[t.id] = t; });
      return (g.textIds || []).map(function (id) { return map[id]; }).filter(Boolean);
    }, [g.textIds, texts]);

    var canUp = index > 0;
    var canDown = index < total - 1;

    return e('div', {
      style: {
        borderBottom: '1px solid var(--kt-widget-border-default)',
        background: selected ? 'var(--kt-list-active-selection-bg)' : 'transparent'
      }
    },
      e('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          cursor: 'pointer',
          fontSize: 12
        },
        onClick: function (ev) {
          if (ev.target.closest('[data-group-action]')) return;
          if (onSelect) onSelect(g.id);
          onToggleExpand(g.id);
        }
      },
        e('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14, height: 14,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.1s',
            flex: '0 0 auto'
          }
        }, K.ui.icon('chevron-right', { size: 12 })),
        e('span', {
          style: {
            width: 10, height: 10, borderRadius: 5,
            background: g.color, flex: '0 0 auto'
          }
        }),
        editing
          ? e('input', {
              ref: editRef,
              type: 'text',
              value: editVal,
              onChange: function (ev) { setEditVal(ev.target.value); },
              onBlur: commitRename,
              onKeyDown: function (ev) {
                if (ev.key === 'Enter') commitRename();
                if (ev.key === 'Escape') { setEditVal(g.name); setEditing(false); }
              },
              onClick: function (ev) { ev.stopPropagation(); },
              style: {
                flex: 1,
                background: 'var(--kt-input-bg)',
                color: 'var(--kt-input-fg)',
                border: '1px solid var(--kt-input-active-border)',
                borderRadius: 2,
                padding: '1px 4px',
                fontSize: 12,
                fontFamily: 'inherit',
                minWidth: 0
              }
            })
          : e('span', {
              style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
            }, g.name),
        e('span', {
          style: { fontSize: 10, opacity: 0.6, flex: '0 0 auto', marginRight: 2 }
        }, groupTexts.length),
        e('button', {
          type: 'button',
          'data-group-action': 'move-up',
          title: canUp ? 'Move group up' : 'Already at top',
          disabled: !canUp,
          onClick: function (ev) {
            ev.stopPropagation();
            if (canUp) onMoveGroup(g.id, 'up');
          },
          style: iconButtonStyle(!canUp)
        }, K.ui.icon('chevron-up', { size: 12 })),
        e('button', {
          type: 'button',
          'data-group-action': 'move-down',
          title: canDown ? 'Move group down' : 'Already at bottom',
          disabled: !canDown,
          onClick: function (ev) {
            ev.stopPropagation();
            if (canDown) onMoveGroup(g.id, 'down');
          },
          style: iconButtonStyle(!canDown)
        }, K.ui.icon('chevron-down', { size: 12 })),
        e('button', {
          type: 'button',
          'data-group-action': 'rename',
          title: 'Rename group',
          onClick: function (ev) {
            ev.stopPropagation();
            setEditVal(g.name);
            setEditing(true);
          },
          style: iconButtonStyle(false)
        }, K.ui.icon('edit', { size: 12 })),
        e('button', {
          type: 'button',
          'data-group-action': 'delete',
          title: 'Delete group',
          onClick: function (ev) {
            ev.stopPropagation();
            if (global.confirm('Delete group "' + g.name + '"? Texts inside will be unassigned.')) {
              onDelete(g.id);
            }
          },
          style: iconButtonStyle(false)
        }, K.ui.icon('trash', { size: 12 }))
      ),
      expanded ? e('div', {
        style: { background: 'var(--kt-editor-bg)' }
      },
        groupTexts.length === 0
          ? e('div', {
              style: {
                padding: '8px 24px',
                fontSize: 11,
                fontStyle: 'italic',
                color: 'var(--kt-input-placeholder-fg)'
              }
            }, 'No texts in this group yet.')
          : e('div', null,
              e('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '4px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)'
                }
              },
                e('button', {
                  type: 'button',
                  onClick: function (ev) {
                    ev.stopPropagation();
                    onSortTexts(g.id);
                  },
                  title: 'Sort texts in this group by ID',
                  style: {
                    background: 'transparent',
                    border: 'none',
                    color: '#3794ff',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: '2px 6px',
                    fontFamily: 'inherit'
                  }
                }, 'Sort by ID')
              ),
              groupTexts.map(function (t, tIdx) {
                var canTextUp = tIdx > 0;
                var canTextDown = tIdx < groupTexts.length - 1;
                return e('div', {
                  key: 'gt-' + g.id + '-' + t.id,
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 4,
                    padding: '4px 6px 4px 20px',
                    fontSize: 11,
                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                  }
                },
                  e('span', {
                    style: {
                      fontFamily: 'var(--kt-font-mono)',
                      fontSize: 10,
                      opacity: 0.5,
                      flex: '0 0 auto',
                      minWidth: 40
                    }
                  }, '#' + t.id),
                  e('span', {
                    style: {
                      flex: 1,
                      fontFamily: 'var(--kt-font-mono)',
                      color: 'var(--kt-editor-fg)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minWidth: 0
                    }
                  }, String(t.originalText || '')),
                  e('button', {
                    type: 'button',
                    title: canTextUp ? 'Move up' : 'Already at top',
                    disabled: !canTextUp,
                    onClick: function (ev) {
                      ev.stopPropagation();
                      if (canTextUp) onMoveText(g.id, t.id, 'up');
                    },
                    style: Object.assign(iconButtonStyle(!canTextUp), {
                      width: 16, height: 16
                    })
                  }, K.ui.icon('chevron-up', { size: 10 })),
                  e('button', {
                    type: 'button',
                    title: canTextDown ? 'Move down' : 'Already at bottom',
                    disabled: !canTextDown,
                    onClick: function (ev) {
                      ev.stopPropagation();
                      if (canTextDown) onMoveText(g.id, t.id, 'down');
                    },
                    style: Object.assign(iconButtonStyle(!canTextDown), {
                      width: 16, height: 16
                    })
                  }, K.ui.icon('chevron-down', { size: 10 })),
                  e('button', {
                    type: 'button',
                    title: 'Remove from group',
                    onClick: function (ev) {
                      ev.stopPropagation();
                      onRemoveText(g.id, t.id);
                    },
                    style: Object.assign(iconButtonStyle(false), {
                      width: 16, height: 16
                    })
                  }, K.ui.icon('close', { size: 10 }))
                );
              })
            )
      ) : null
    );
  }

  function KetorGroupsPanel(props) {
    var groups = props.groups || [];
    var texts = props.texts || [];
    var expanded = props.expanded || {};
    var onToggleExpand = props.onToggleExpand || function () { };
    var onRename = props.onRename || function () { };
    var onDelete = props.onDelete || function () { };
    var onRemoveText = props.onRemoveText || function () { };
    var onMoveGroup = props.onMoveGroup || function () { };
    var onMoveText = props.onMoveText || function () { };
    var onSortTexts = props.onSortTexts || function () { };
    var onSelect = props.onSelect;
    var selectedGroupId = props.selectedGroupId;
    var emptyMessage = props.emptyMessage ||
      'No groups yet. Mark texts and click "Add to Group" to create one.';

    if (groups.length === 0) {
      return e('div', {
        style: {
          padding: 20,
          fontSize: 11,
          textAlign: 'center',
          color: 'var(--kt-input-placeholder-fg)',
          lineHeight: 1.6
        }
      }, emptyMessage);
    }

    return e('div', null,
      groups.map(function (g, idx) {
        return e(GroupItem, {
          key: g.id,
          group: g,
          index: idx,
          total: groups.length,
          texts: texts,
          expanded: !!expanded[g.id],
          onToggleExpand: onToggleExpand,
          onRename: onRename,
          onDelete: onDelete,
          onRemoveText: onRemoveText,
          onMoveGroup: onMoveGroup,
          onMoveText: onMoveText,
          onSortTexts: onSortTexts,
          onSelect: onSelect,
          selected: selectedGroupId === g.id
        });
      })
    );
  }

  K.ui.KetorGroupsPanel = KetorGroupsPanel;

})(window);