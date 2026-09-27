/* ============================================================
   Ketor -- Sidebar + Tree View
   ------------------------------------------------------------
   VS Code-style resizable sidebar with:
   - Header (title + hover actions)
   - Collapsible sections
   - Tree view (nesting, icons, selection, metadata)

   Exports:
   - KetorSidebar (container)
   - KetorSidebarSection (collapsible section)
   - KetorTreeView (generic tree)
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};

  var React = global.React;
  if (!React) return;
  var e = React.createElement;
  var useState = React.useState;
  var useCallback = React.useCallback;
  var memo = React.memo;

  /* ============================================================
     KetorSidebar -- container
     ============================================================ */
  function KetorSidebar(props) {
    var title = props.title || '';
    var actions = props.actions || [];
    var children = props.children;

    return e('aside', {
      className: 'kt-sidebar',
      role: 'complementary'
    },
      title
        ? e('div', { className: 'kt-sidebar-header' },
            e('span', null, title),
            actions.length > 0
              ? e('div', { className: 'actions' },
                  actions.map(function (action, idx) {
                    return e('button', {
                      key: action.id || ('act-' + idx),
                      type: 'button',
                      className: 'icon-btn',
                      title: action.tooltip || action.id,
                      onClick: function () {
                        if (action.command && Ketor.commands.hasCommand(action.command)) {
                          Ketor.commands.executeCommand(action.command);
                        } else if (typeof action.onClick === 'function') {
                          action.onClick();
                        }
                      }
                    }, Ketor.ui.icon(action.icon, { size: 16 }));
                  })
                )
              : null
          )
        : null,
      e('div', { className: 'kt-sidebar-content' }, children)
    );
  }

  /* ============================================================
     KetorSidebarSection -- collapsible section
     ============================================================ */
  function KetorSidebarSection(props) {
    var section = props.section || {};
    var defaultCollapsed = section.collapsed === true;
    var [collapsed, setCollapsed] = useState(defaultCollapsed);

    var onToggle = useCallback(function () {
      setCollapsed(function (prev) { return !prev; });
    }, []);

    return e('div', { className: 'kt-sidebar-section' },
      e('button', {
        type: 'button',
        className: 'kt-sidebar-section-header' + (collapsed ? ' collapsed' : ''),
        title: 'Collapse or expand this sidebar section; the state is kept while the activity stays open',
        onClick: onToggle,
        'aria-expanded': !collapsed
      },
        e('span', { className: 'chevron' }, Ketor.ui.icon('chevron-down', { size: 12 })),
        e('span', null, section.title || '')
      ),
      e('div', {
        className: 'kt-sidebar-section-body' + (collapsed ? ' collapsed' : '')
      }, props.children)
    );
  }

  /* ============================================================
     KetorTreeView -- generic tree view
     ------------------------------------------------------------
     Item shape: { id, label, icon, meta, children, disabled, dimmed }
     ============================================================ */
  function TreeItemRow(props) {
    var item = props.item;
    var level = props.level || 0;
    var hasChildren = Array.isArray(item.children) && item.children.length > 0;
    var [expanded, setExpanded] = useState(item.expanded !== false);
    var isSelected = props.selectedId === item.id;

    var handleClick = useCallback(function (ev) {
      ev.stopPropagation();
      if (item.disabled) return;
      props.onSelect(item);
      if (hasChildren && item.toggleOnClick !== false) {
        setExpanded(function (prev) { return !prev; });
      }
    }, [item, hasChildren, props.onSelect]);

    var indentPx = level * 12;

    return e('div', null,
      e('button', {
        type: 'button',
        className: 'kt-tree-item' +
          (isSelected ? ' selected' : '') +
          (expanded ? ' expanded' : '') +
          (item.dimmed ? ' dimmed' : ''),
        style: { paddingLeft: (8 + indentPx) + 'px' },
        onClick: handleClick,
        title: item.tooltip || item.label,
        disabled: !!item.disabled
      },
        e('span', { className: 'chevron', style: { visibility: hasChildren ? 'visible' : 'hidden' } },
          Ketor.ui.icon('chevron-right', { size: 12 })
        ),
        item.icon
          ? e('span', { className: 'icon' }, Ketor.ui.icon(item.icon, { size: 14 }))
          : null,
        e('span', { className: 'label' }, item.label),
        item.meta != null
          ? e('span', { className: 'meta' }, String(item.meta))
          : null
      ),
      hasChildren && expanded
        ? e('div', { className: 'kt-tree-children' },
            item.children.map(function (child, idx) {
              return e(TreeItemRow, {
                key: child.id || (item.id + '-c-' + idx),
                item: child,
                level: level + 1,
                selectedId: props.selectedId,
                onSelect: props.onSelect
              });
            })
          )
        : null
    );
  }

  var MemoTreeItemRow = memo(TreeItemRow);

  function KetorTreeView(props) {
    var items = props.items || [];
    var selectedId = props.selectedId;
    var onSelect = props.onSelect || function () { };

    if (items.length === 0) {
      return e('div', {
        className: 'kt-text-dim kt-text-small',
        style: { padding: '8px 16px' }
      }, props.emptyMessage || 'No items.');
    }

    return e('div', { className: 'kt-tree', role: 'tree' },
      items.map(function (item, idx) {
        return e(MemoTreeItemRow, {
          key: item.id || ('root-' + idx),
          item: item,
          level: 0,
          selectedId: selectedId,
          onSelect: onSelect
        });
      })
    );
  }

  Ketor.ui.KetorSidebar = KetorSidebar;
  Ketor.ui.KetorSidebarSection = KetorSidebarSection;

})(window);