/* ============================================================
   Ketor -- Editor Area
   ------------------------------------------------------------
   VS Code-style editor area with multiple editor groups.
   Each group has its own tab bar and content area.
   Split support: horizontal (side-by-side) via CSS flex.

   Components:
   - KetorEditorArea -- container that renders all groups
   - KetorEditorGroup -- single group (tab bar + content)
   - KetorTab -- single tab
   - KetorWelcome -- welcome screen when no tabs are open
   ============================================================ */

/* ============================================================
   Ketor -- Editor Area (v2)
   ------------------------------------------------------------
   Adds tab drag & drop between groups. Visual drop indicator.
   Welcome screen: minimal KETOR branding + start actions +
   6 compact hints. No verbose marketing text.
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
  var useRef = React.useRef;
  var memo = React.memo;

  /* ============================================================
     KetorTab (draggable)
     ============================================================ */
  function KetorTab(props) {
    var tab = props.tab;
    var isActive = props.isActive;
    var groupId = props.groupId;
    var [dragging, setDragging] = useState(false);

    var handleDragStart = useCallback(function (ev) {
      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('application/x-ketor-tab', JSON.stringify({
          groupId: groupId,
          tabId: tab.id
        }));
      } catch (_) { }
      setDragging(true);
    }, [groupId, tab.id]);

    var handleDragEnd = useCallback(function () { setDragging(false); }, []);

    var handleClose = useCallback(function (ev) {
      ev.stopPropagation();
      props.onClose(tab.id);
    }, [tab.id, props.onClose]);

    var handleAux = useCallback(function (ev) {
      if (ev.button === 1) { ev.preventDefault(); props.onClose(tab.id); }
    }, [tab.id, props.onClose]);

    return e('div', {
      className: 'kt-tab' +
        (isActive ? ' active' : '') +
        (tab.dirty ? ' dirty' : '') +
        (dragging ? ' dragging' : ''),
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onClick: function () { props.onActivate(tab.id); },
      onAuxClick: handleAux,
      role: 'tab',
      'aria-selected': isActive,
      title: tab.tooltip || tab.title
    },
      tab.icon ? e('span', { className: 'tab-icon' }, Ketor.ui.icon(tab.icon, { size: 14 })) : null,
      e('span', { className: 'tab-label' }, tab.title),
      e('button', {
        type: 'button',
        className: 'tab-close',
        onClick: handleClose,
        tabIndex: -1,
        'aria-label': 'Close'
      }, Ketor.ui.icon('close', { size: 12 }))
    );
  }

  var MemoTab = memo(KetorTab);

  /* ============================================================
     Welcome (minimal, compact)
     ============================================================ */
  function KetorWelcome(props) {
    var onAction = props.onAction || function () { };

    var actions = [
      { id: 'load-rom', label: 'Load ROM' },
      { id: 'open-project', label: 'Open Project' },
      { id: 'recent-files', label: 'Recent Files' }
    ];

    var hints = [
      { icon: 'globe', title: 'Translate', body: 'Extract text with a .tbl, edit, auto-relocate overflow, rebuild.' },
      { icon: 'hex', title: 'Hex Editor', body: 'Byte inspection, sections, pointers, Monkey-Moore relative search.' },
      { icon: 'paintcan', title: 'Font & Graphics', body: 'Auto-detect font tiles, edit pixels, manage palettes.' },
      { icon: 'package', title: 'Patch & Export', body: 'Generate IPS, export modified ROM, project import/export.' },
      { icon: 'beaker', title: 'Tests', body: 'Unit tests and preview pipeline checks per workflow.' },
      { icon: 'wand', title: 'Translation APIs', body: 'MyMemory → Google → LibreTranslate → Apertium. Custom keys supported.' }
    ];

    return e('div', { className: 'kt-editor-empty' },
      e('div', { className: 'ketor-mark' }, 'KETOR'),
      e('div', { className: 'ketor-sub' }, 'Kernel Engine Translation for Old & Retro Games'),
      e('div', { className: 'ketor-actions' },
        actions.map(function (a) {
          return e('button', {
            key: a.id,
            type: 'button',
            className: 'kt-btn',
            onClick: function () { onAction(a.id); }
          }, a.label);
        })
      ),
      e('div', { className: 'ketor-hints' },
        hints.map(function (h) {
          return e('div', { key: h.title, className: 'ketor-hint' },
            e('div', { className: 'hh' },
              Ketor.ui.icon(h.icon, { size: 14 }),
              e('span', null, h.title)
            ),
            e('div', { className: 'hb' }, h.body)
          );
        })
      )
    );
  }

  /* ============================================================
     KetorEditorGroup (drop target)
     ============================================================ */
  function KetorEditorGroup(props) {
    var group = props.group;
    var isActiveGroup = props.isActiveGroup;
    var renderTabContent = props.renderTabContent;
    var onActivateTab = props.onActivateTab;
    var onCloseTab = props.onCloseTab;
    var onSplit = props.onSplit;
    var onCloseGroup = props.onCloseGroup;
    var onTabDrop = props.onTabDrop;
    var canCloseGroup = props.canCloseGroup;

    var [isDropTarget, setIsDropTarget] = useState(false);
    var [dropIndex, setDropIndex] = useState(-1);
    var tabbarRef = useRef(null);

    var activeTab = null;
    if (group.activeTabId) {
      activeTab = group.tabs.find(function (t) { return t.id === group.activeTabId; }) || null;
    }

    var handleDragOver = useCallback(function (ev) {
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { }
      setIsDropTarget(true);
      var tabbarEl = tabbarRef.current;
      if (!tabbarEl) return;
      var x = ev.clientX;
      var children = Array.prototype.slice.call(tabbarEl.querySelectorAll('.kt-tab'));
      var idx = children.length;
      for (var i = 0; i < children.length; i++) {
        var r = children[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) { idx = i; break; }
      }
      setDropIndex(idx);
    }, []);

    var handleDragLeave = useCallback(function (ev) {
      if (!ev.currentTarget.contains(ev.relatedTarget)) {
        setIsDropTarget(false);
        setDropIndex(-1);
      }
    }, []);

    var handleDrop = useCallback(function (ev) {
      ev.preventDefault();
      setIsDropTarget(false);
      var raw = '';
      try { raw = ev.dataTransfer.getData('application/x-ketor-tab'); } catch (_) { }
      setDropIndex(-1);
      if (!raw) return;
      var data = null;
      try { data = JSON.parse(raw); } catch (_) { return; }
      if (!data || !data.tabId) return;
      onTabDrop(data.groupId, data.tabId, group.id, dropIndex < 0 ? group.tabs.length : dropIndex);
    }, [group.id, group.tabs.length, dropIndex, onTabDrop]);

    return e('div', {
      className: 'kt-editor-group' + (isDropTarget ? ' drop-target' : ''),
      'data-active': isActiveGroup ? 'true' : 'false',
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop
    },
      e('div', { className: 'kt-tabbar', ref: tabbarRef },
        group.tabs.map(function (tab) {
          return e(MemoTab, {
            key: tab.id,
            tab: tab,
            groupId: group.id,
            isActive: group.activeTabId === tab.id,
            onActivate: function (tabId) { onActivateTab(group.id, tabId); },
            onClose: function (tabId) { onCloseTab(group.id, tabId); }
          });
        }),
        e('div', { style: { flex: '1 1 auto', minWidth: 0 } }),
        e('button', {
          type: 'button',
          onClick: function (ev) { ev.stopPropagation(); onSplit(); },
          title: 'Split Editor',
          style: {
            width: '28px', height: '100%',
            background: 'transparent', border: 'none',
            color: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }
        }, Ketor.ui.icon('split-horizontal', { size: 14 })),
        canCloseGroup
          ? e('button', {
              type: 'button',
              onClick: function (ev) { ev.stopPropagation(); onCloseGroup(); },
              title: 'Close Group',
              style: {
                width: '28px', height: '100%',
                background: 'transparent', border: 'none',
                color: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }
            }, Ketor.ui.icon('close', { size: 14 }))
          : null
      ),
      e('div', { className: 'kt-editor-content' },
        group.tabs.length === 0
          ? e(KetorWelcome, { onAction: props.onWelcomeAction })
          : group.tabs.map(function (tab) {
              var isActive = tab.id === group.activeTabId;
              return e('div', {
                key: tab.id,
                'data-kt-tab-content': tab.id,
                style: {
                  display: isActive ? 'block' : 'none',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                  position: 'relative'
                }
              }, renderTabContent(tab, group));
            })
      )
    );
  }

  /* ============================================================
     KetorEditorArea
     ============================================================ */
  function KetorEditorArea(props) {
    var groups = props.groups || [];
    var canCloseGroup = groups.length > 1;

    return e('div', { className: 'kt-editor-groups' },
      groups.map(function (group) {
        return e(KetorEditorGroup, {
          key: group.id,
          group: group,
          isActiveGroup: group.id === props.activeGroupId,
          renderTabContent: props.renderTabContent,
          onActivateTab: props.onActivateTab,
          onCloseTab: props.onCloseTab,
          onSplit: props.onSplit,
          onCloseGroup: function () { props.onCloseGroup(group.id); },
          onTabDrop: props.onTabDrop,
          canCloseGroup: canCloseGroup,
          onWelcomeAction: props.onWelcomeAction
        });
      })
    );
  }

  Ketor.ui.KetorEditorArea = KetorEditorArea;
  Ketor.ui.KetorEditorGroup = KetorEditorGroup;
  Ketor.ui.KetorTab = KetorTab;
  Ketor.ui.KetorWelcome = KetorWelcome;

})(window);