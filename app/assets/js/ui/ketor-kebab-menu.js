/* ============================================================
   Ketor - Kebab Menu
   ------------------------------------------------------------
   Vertical dropdown menu for compact mode (mobile/tablet
   portrait). Same command registry as menubar. Sections are
   collapsible (Q6=C).
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

  var SECTIONS = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'load-rom', label: 'Load ROM...', command: 'ketor.file.loadRom' },
        { id: 'load-table', label: 'Load Table...', command: 'ketor.file.loadTable' },
        { id: 'save-rom', label: 'Save Modified ROM', command: 'ketor.file.saveModifiedRom' },
        { id: 'export-ips', label: 'Export IPS Patch', command: 'ketor.file.exportIps' },
        { id: 'import-project', label: 'Import Project...', command: 'ketor.file.importProject' },
        { id: 'export-project', label: 'Export Project...', command: 'ketor.file.exportProject' }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', command: 'ketor.edit.undo' },
        { id: 'redo', label: 'Redo', command: 'ketor.edit.redo' },
        { id: 'find', label: 'Find', command: 'ketor.edit.find' }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'toggle-sidebar', label: 'Toggle Sidebar', command: 'ketor.view.toggleSidebar' },
        { id: 'toggle-panel', label: 'Toggle Panel', command: 'ketor.view.togglePanel' },
        { id: 'split', label: 'Split Editor', command: 'ketor.view.splitEditor' }
      ]
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        { id: 'theme', label: 'Color Theme', command: 'ketor.settings.theme' },
        { id: 'preferences', label: 'Preferences...', command: 'ketor.settings.open' },
        { id: 'shortcuts', label: 'Keyboard Shortcuts', command: 'ketor.settings.shortcuts' }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'about', label: 'About Ketor', command: 'ketor.about.show' },
        { id: 'docs', label: 'Documentation', command: 'ketor.help.documentation' },
        { id: 'shortcuts-help', label: 'Keyboard Shortcuts Ref', command: 'ketor.help.shortcuts' }
      ]
    }
  ];


  function KebabSection(props) {
    var section = props.section;
    var st = useState(section.id === 'file');
    var expanded = st[0];
    var setExpanded = st[1];

    var handleToggle = useCallback(function () {
      setExpanded(function (v) { return !v; });
    }, []);

    return e('div', { className: 'kt-kebab-section' },
      e('button', {
        type: 'button',
        className: 'kt-kebab-section-header',
        title: 'Show or hide the commands of this section; the menu stays open while you browse',
        onClick: handleToggle,
        'aria-expanded': expanded
      },
        e('span', { className: 'kt-kebab-chevron' + (expanded ? ' expanded' : '') },
          Ketor.ui.icon('chevron-right', { size: 12 })
        ),
        e('span', null, section.label)
      ),
      expanded
        ? e('div', { className: 'kt-kebab-items' },
            section.items.map(function (item) {
              var enabled = !item.command || Ketor.commands.hasCommand(item.command);
              return e('button', {
                key: item.id,
                type: 'button',
                className: 'kt-dropdown-item',
                title: 'Run this command and close the menu; greyed items have no handler registered',
                disabled: !enabled,
                onClick: function (ev) {
                  ev.stopPropagation();
                  if (!enabled) return;
                  props.onSelect(item);
                }
              },
                e('span', { className: 'kt-dropdown-check' }, ''),
                e('span', null, item.label),
                e('span', { className: 'shortcut' }, '')
              );
            })
          )
        : null
    );
  }

  function KetorKebabMenu(props) {
    var open = props.open;
    var onClose = props.onClose || function () { };
    var anchorRef = props.anchorRef;

    var menuRef = useRef(null);

    useEffect(function () {
      if (!open) return;
      var onDocClick = function (ev) {
        if (menuRef.current && menuRef.current.contains(ev.target)) return;
        if (anchorRef && anchorRef.current && anchorRef.current.contains(ev.target)) return;
        onClose();
      };
      var onKey = function (ev) {
        if (ev.key === 'Escape') onClose();
      };
      var timer = setTimeout(function () {
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('touchstart', onDocClick, { passive: true });
        document.addEventListener('keydown', onKey);
      }, 0);
      return function () {
        clearTimeout(timer);
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('touchstart', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }, [open, onClose, anchorRef]);

    var handleSelect = useCallback(function (item) {
      onClose();
      if (!item || !item.command) return;
      if (!Ketor.commands.hasCommand(item.command)) return;
      Ketor.commands.executeCommand(item.command).catch(function (err) {
        console.error('[Ketor.kebab] Command failed:', item.command, err);
      });
    }, [onClose]);

    if (!open) return null;

    return e('div', {
      className: 'kt-kebab-menu',
      ref: menuRef,
      role: 'menu'
    },
      SECTIONS.map(function (section) {
        return e(KebabSection, {
          key: section.id,
          section: section,
          onSelect: handleSelect
        });
      })
    );
  }

  Ketor.ui.KetorKebabMenu = KetorKebabMenu;

})(window);