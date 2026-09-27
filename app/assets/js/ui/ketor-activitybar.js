/* ============================================================
   Ketor -- Activity Bar
   ------------------------------------------------------------
   VS Code-style activity bar (48px wide icon strip).
   - Click item to activate
   - Active state shows left border accent
   - Badge support (numeric)
   - Optional bottom section for settings/account icons

   Props:
   - items: Array<{ id, icon, tooltip, badge }>
   - activeId: string
   - onActivate: (id) => void
   - bottomItems: Array<{ id, icon, tooltip }> (optional)
   - onBottomActivate: (id) => void (optional)
   ============================================================ */

/* ============================================================
   Ketor - Activity Bar
   ------------------------------------------------------------
   Vertical (default, desktop/tablet landscape) or horizontal
   (compact mode, bottom tab bar). Same items, different
   layout. Parent passes orientation prop.
   ============================================================ */

/* ============================================================
   Ketor - Activity Bar
   ------------------------------------------------------------
   Vertical (default, desktop/tablet landscape) or horizontal
   (compact mode). Item list updated for the new workflow.
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};
  var React = global.React;
  if (!React) return;
  var e = React.createElement;

  function ActivityItem(props) {
    var item = props.item;
    var isActive = props.activeId === item.id;
    return e('button', {
      type: 'button',
      className: 'kt-activity-item' + (isActive ? ' active' : ''),
      title: item.tooltip || item.id,
      'aria-label': item.tooltip || item.id,
      'aria-pressed': isActive,
      onClick: function () { props.onActivate(item.id); }
    },
      Ketor.ui.icon(item.icon, { size: 22 }),
      item.badge != null && item.badge !== 0
        ? e('span', { className: 'badge' }, String(item.badge).slice(0, 3))
        : null
    );
  }

  function KetorActivityBar(props) {
    var items = props.items || [];
    var bottomItems = props.bottomItems || [];
    var activeId = props.activeId;
    var onActivate = props.onActivate || function () { };
    var onBottomActivate = props.onBottomActivate || function () { };
    var orientation = props.orientation === 'horizontal' ? 'horizontal' : 'vertical';

    var className = 'kt-activitybar kt-activitybar-' + orientation;

    var renderItem = function (item) {
      return e(ActivityItem, {
        key: item.id,
        item: item,
        activeId: activeId,
        onActivate: (bottomItems.indexOf(item) !== -1) ? onBottomActivate : onActivate
      });
    };

    return e('nav', {
      className: className,
      role: 'navigation',
      'aria-label': 'Activity Bar',
      'data-orientation': orientation
    },
      items.map(renderItem),
      bottomItems.length > 0
        ? e('div', { className: 'kt-activitybar-bottom' },
            bottomItems.map(renderItem)
          )
        : null
    );
  }

  Ketor.ui.DEFAULT_ACTIVITY_ITEMS = [
    { id: 'project', icon: 'folder', tooltip: 'Project (ROM + files + groups)' },
    { id: 'table', icon: 'file-code', tooltip: 'Table (generate / load / edit)' },
    { id: 'search', icon: 'search', tooltip: 'Search Text (extract + mark + group)' },
    { id: 'hex', icon: 'hex', tooltip: 'Hex Editor' },
    { id: 'translation', icon: 'globe', tooltip: 'Translation' },
    { id: 'tile', icon: 'paintcan', tooltip: 'Tile Editor' },
    { id: 'debugger', icon: 'debug', tooltip: 'Debugger' },
    { id: 'patch', icon: 'package', tooltip: 'Patch & Export' },
    { id: 'tests', icon: 'beaker', tooltip: 'Tests' }
  ];

  Ketor.ui.DEFAULT_ACTIVITY_BOTTOM = [
    { id: 'account', icon: 'account', tooltip: 'Account' },
    { id: 'settings', icon: 'settings', tooltip: 'Settings' }
  ];

  Ketor.ui.KetorActivityBar = KetorActivityBar;

})(window);