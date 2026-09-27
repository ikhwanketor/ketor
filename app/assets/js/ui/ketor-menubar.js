/* ============================================================
   Ketor -- Menu Bar
   ------------------------------------------------------------
   VS Code-style menu bar with working dropdown menus.
   Matches VS Code menu appearance and behavior:
   - Click top-level item opens dropdown
   - Click outside closes
   - Hover switches between top-level menus while open
   - Menu items call Ketor.commands.executeCommand(id)
   - Items disabled if command not registered
   - Checkmarks, separators, shortcut labels supported

   Props:
   - menus: Array<{ id, label, items }>
   - onCommand: (commandId) => void (optional override)
   - context: Object (for dynamic checkmarks)
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};

  var React = global.React;
  if (!React) return;
  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  var DEFAULT_MENUS = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'load-rom', label: 'Load ROM...', command: 'ketor.file.loadRom', shortcut: 'Ctrl+O' },
        { id: 'load-table', label: 'Load Table...', command: 'ketor.file.loadTable', shortcut: 'Ctrl+T' },
        { separator: true },
        { id: 'import-project', label: 'Import Project...', command: 'ketor.file.importProject' },
        { id: 'export-project', label: 'Export Project...', command: 'ketor.file.exportProject' },
        { separator: true },
        { id: 'save-rom', label: 'Save Modified ROM', command: 'ketor.file.saveModifiedRom', shortcut: 'Ctrl+S' },
        { id: 'export-ips', label: 'Export IPS Patch', command: 'ketor.file.exportIps' }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', command: 'ketor.edit.undo', shortcut: 'Ctrl+Z' },
        { id: 'redo', label: 'Redo', command: 'ketor.edit.redo', shortcut: 'Ctrl+Y' },
        { separator: true },
        { id: 'cut', label: 'Cut', command: 'ketor.edit.cut', shortcut: 'Ctrl+X' },
        { id: 'copy', label: 'Copy', command: 'ketor.edit.copy', shortcut: 'Ctrl+C' },
        { id: 'paste', label: 'Paste', command: 'ketor.edit.paste', shortcut: 'Ctrl+V' },
        { separator: true },
        { id: 'find', label: 'Find', command: 'ketor.edit.find', shortcut: 'Ctrl+F' }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'toggle-sidebar', label: 'Toggle Primary Sidebar', command: 'ketor.view.toggleSidebar', shortcut: 'Ctrl+B' },
        { id: 'toggle-panel', label: 'Toggle Panel', command: 'ketor.view.togglePanel', shortcut: 'Ctrl+J' },
        { id: 'toggle-activitybar', label: 'Activity Bar', command: 'ketor.view.toggleActivityBar', contextKey: 'activityBarVisible' },
        { id: 'toggle-statusbar', label: 'Status Bar', command: 'ketor.view.toggleStatusBar', contextKey: 'statusBarVisible' },
        { separator: true },
        { id: 'split-editor', label: 'Split Editor', command: 'ketor.view.splitEditor', shortcut: 'Ctrl+\\' },
        { separator: true },
        { id: 'appearance', label: 'Appearance', command: 'ketor.view.appearance' },
        { id: 'theme', label: 'Color Theme', command: 'ketor.view.theme' }
      ]
    },
    {
      id: 'about',
      label: 'About',
      items: [
        { id: 'about-ketor', label: 'About Ketor', command: 'ketor.about.show' },
        { id: 'documentation', label: 'Documentation', command: 'ketor.help.documentation' },
        { separator: true },
        { id: 'report-issue', label: 'Report Issue', command: 'ketor.help.reportIssue' },
        { id: 'release-notes', label: 'Release Notes', command: 'ketor.help.releaseNotes' }
      ]
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        { id: 'preferences', label: 'Preferences...', command: 'ketor.settings.open', shortcut: 'Ctrl+,' },
        { id: 'theme-settings', label: 'Color Theme', command: 'ketor.settings.theme' },
        { id: 'shortcuts', label: 'Keyboard Shortcuts', command: 'ketor.settings.shortcuts', shortcut: 'Ctrl+K Ctrl+S' },
        { separator: true },
        { id: 'advanced', label: 'Advanced Options', command: 'ketor.settings.advanced' }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'welcome', label: 'Welcome', command: 'ketor.help.welcome' },
        { id: 'docs', label: 'Documentation', command: 'ketor.help.documentation' },
        { id: 'keybindings', label: 'Keyboard Shortcuts Reference', command: 'ketor.help.shortcuts' },
        { separator: true },
        { id: 'community', label: 'Community', command: 'ketor.help.community' },
        { id: 'repo', label: 'GitHub Repository', command: 'ketor.help.repository' }
      ]
    }
  ];

  function MenuItem(props) {
    var item = props.item;
    var isEnabled = true;
    if (item.command && !Ketor.commands.hasCommand(item.command)) isEnabled = false;
    if (item.disabled) isEnabled = false;

    if (item.separator) {
      return e('div', { className: 'kt-dropdown-separator' });
    }

    var isChecked = !!item.checked;
    var shortcut = item.shortcut || '';

    return e('button', {
      type: 'button',
      className: 'kt-dropdown-item',
      title: 'Run this command and close the dropdown; the shortcut shown beside it works anywhere',
      disabled: !isEnabled,
      onClick: function (ev) {
        ev.stopPropagation();
        if (!isEnabled) return;
        props.onSelect(item);
      }
    },
      e('span', { className: 'kt-dropdown-check' }, isChecked ? '✓' : ''),
      e('span', null, item.label),
      shortcut ? e('span', { className: 'shortcut' }, shortcut) : null
    );
  }

  function MenuDropdown(props) {
    var menu = props.menu;
    var context = props.context || {};
    var items = menu.items.map(function (item) {
      if (item.contextKey && context[item.contextKey] !== undefined) {
        return Object.assign({}, item, { checked: !!context[item.contextKey] });
      }
      return item;
    });

    return e('div', {
      className: 'kt-dropdown',
      style: { left: props.left + 'px' },
      role: 'menu',
      onClick: function (ev) { ev.stopPropagation(); }
    },
      items.map(function (item, idx) {
        return e(MenuItem, {
          key: menu.id + '-' + idx,
          item: item,
          onSelect: props.onSelect
        });
      })
    );
  }

  function KetorMenubar(props) {
    var menus = props.menus || DEFAULT_MENUS;
    var context = props.context || {};
    var [openMenu, setOpenMenu] = useState(null);
    var [menuPosition, setMenuPosition] = useState({ left: 0 });
    var containerRef = useRef(null);

    useEffect(function () {
      if (!openMenu) return;
      var handler = function (ev) {
        if (containerRef.current && !containerRef.current.contains(ev.target)) {
          setOpenMenu(null);
        }
      };
      document.addEventListener('mousedown', handler);
      return function () { document.removeEventListener('mousedown', handler); };
    }, [openMenu]);

    useEffect(function () {
      if (!openMenu) return;
      var handler = function (ev) {
        if (ev.key === 'Escape') {
          setOpenMenu(null);
        }
      };
      document.addEventListener('keydown', handler);
      return function () { document.removeEventListener('keydown', handler); };
    }, [openMenu]);

    var handleTopClick = useCallback(function (menu, ev) {
      if (openMenu === menu.id) {
        setOpenMenu(null);
        return;
      }
      var rect = ev.currentTarget.getBoundingClientRect();
      setMenuPosition({ left: rect.left });
      setOpenMenu(menu.id);
    }, [openMenu]);

    var handleTopHover = useCallback(function (menu, ev) {
      if (!openMenu) return;
      if (openMenu === menu.id) return;
      var rect = ev.currentTarget.getBoundingClientRect();
      setMenuPosition({ left: rect.left });
      setOpenMenu(menu.id);
    }, [openMenu]);

    var handleSelect = useCallback(function (item) {
      setOpenMenu(null);
      if (!item || !item.command) return;
      if (!Ketor.commands.hasCommand(item.command)) {
        console.warn('[Ketor.menubar] Unknown command:', item.command);
        return;
      }
      if (typeof props.onCommand === 'function') {
        props.onCommand(item.command, item);
      }
      Ketor.commands.executeCommand(item.command).catch(function (err) {
        console.error('[Ketor.menubar] Command failed:', item.command, err);
      });
    }, [props.onCommand]);

    var activeMenu = menus.find(function (m) { return m.id === openMenu; }) || null;

    return e('div', {
      className: 'kt-menubar',
      ref: containerRef,
      role: 'menubar'
    },
      menus.map(function (menu) {
        return e('button', {
          key: menu.id,
          type: 'button',
          className: 'kt-menubar-item' + (openMenu === menu.id ? ' active' : ''),
          title: 'Open this menu; once one is open, moving across the bar switches menus',
          onClick: function (ev) { handleTopClick(menu, ev); },
          onMouseEnter: function (ev) { handleTopHover(menu, ev); },
          role: 'menuitem',
          'aria-haspopup': 'true',
          'aria-expanded': openMenu === menu.id
        }, menu.label);
      }),
      activeMenu ? e(MenuDropdown, {
        menu: activeMenu,
        context: context,
        left: menuPosition.left,
        onSelect: handleSelect
      }) : null
    );
  }

  Ketor.ui.KetorMenubar = KetorMenubar;

})(window);