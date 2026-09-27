/* ============================================================
   Ketor - Shared UI Box
   ------------------------------------------------------------
   The collapsible box (frame, uppercase title, chevron toggle)
   the table, search and hex tabs wrap their panels in, so the
   users live in different tabs and the component lives in a
   file of its own instead of inside one tab's state module.
   It is loaded before every module that calls K.ui.KtBox
   (workbench-preview.html, tests/helpers/workbench.js).
   A closed box drops its body from the tree: a collapsed
   KtBox renders no children at all, and the test harness
   renders such a box with an empty state, which is why the
   tile rail (ketor-tile-activity.js) draws its own section
   markup when it needs a body that stays readable collapsed.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var uE = R.useEffect;

  function KtBox(props) {
    var id = String(props.id || 'box');
    var st = uS(props.defaultCollapsed === true);
    var collapsed = st[0];
    var setCollapsed = st[1];

    uE(function () {
      try {
        var raw = global.sessionStorage.getItem('ketor.collapse.state');
        var map = raw ? JSON.parse(raw) : {};
        if (typeof map[id] === 'boolean') setCollapsed(map[id]);
      } catch (_) { }
    }, [id]);

    function toggle() {
      var next = !collapsed;
      setCollapsed(next);
      try {
        var raw = global.sessionStorage.getItem('ketor.collapse.state');
        var map = raw ? JSON.parse(raw) : {};
        map[id] = next;
        global.sessionStorage.setItem('ketor.collapse.state', JSON.stringify(map));
      } catch (_) { }
    }

    return e('div', {
      className: 'kt-ui-box' + (collapsed ? ' kt-ui-box-collapsed' : ''),
      style: Object.assign({
        display: 'flex', flexDirection: 'column', minHeight: 0,
        border: '1px solid var(--kt-widget-border-default)',
        borderRadius: 3, background: 'var(--kt-sidebar-bg)',
        overflow: 'hidden'
      }, props.style || {})
    },
      e('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', flex: '0 0 auto',
          borderBottom: collapsed ? 'none' : '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('button', {
          type: 'button', onClick: toggle,
          title: collapsed ? 'Expand' : 'Collapse',
          style: {
            width: 18, height: 18, padding: 0,
            background: 'transparent', border: 'none',
            color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 2
          }
        }, K.ui.icon(collapsed ? 'chevron-right' : 'chevron-down', { size: 12 })),
        e('div', {
          style: {
            flex: 1, minWidth: 0, fontSize: 11,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            opacity: 0.7, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis'
          }
        }, props.title || ''),
        props.actions ? e('div', { style: { display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' } }, props.actions) : null
      ),
      !collapsed ? e('div', {
        style: Object.assign({
          flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 8
        }, props.bodyStyle || {})
      }, props.children) : null
    );
  }

  K.ui.KtBox = KtBox;

})(window);
