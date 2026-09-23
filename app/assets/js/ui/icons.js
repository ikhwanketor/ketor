/* ============================================================
   Ketor -- Icon Registry (minimalist geometric)
   ------------------------------------------------------------
   All icons are stroke-based, 1.5px, round caps/joins.
   16x16 viewBox with 2px padding. Minimalist, no AI slop.
   Use: Ketor.ui.icon('globe', { size: 20 }) for React
        Ketor.ui.iconHtml('globe', 20) for string
   ============================================================ */

/* ============================================================
   Ketor - Icon Registry (minimalist geometric stroke icons)
   ------------------------------------------------------------
   16x16 viewBox by default. settings uses 24x24 (Feather cog).
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};

  var ICONS = {
    globe: '<circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/><path d="M2 8h12"/>',
    hex: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.5"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="0.5"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="0.5"/><rect x="9" y="9" width="4.5" height="4.5" rx="0.5"/>',
    paintcan: '<path d="M3 13.5L8 3l5 10.5"/><path d="M5 10.5h6"/>',
    package: '<path d="M8 2L2 5v6l6 3 6-3V5L8 2z"/><path d="M2 5l6 3 6-3"/><path d="M8 8v7"/>',
    beaker: '<path d="M6.5 2v4.5L2.5 13c-.3.7.2 1.5 1 1.5h9c.8 0 1.3-.8 1-1.5L9.5 6.5V2"/><path d="M5.5 2h5"/>',

    'chevron-down': '<path d="M4 6l4 4 4-4"/>',
    'chevron-right': '<path d="M6 4l4 4-4 4"/>',
    'chevron-left': '<path d="M10 4l-4 4 4 4"/>',
    'chevron-up': '<path d="M4 10l4-4 4 4"/>',
    close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    add: '<path d="M8 3v10M3 8h10"/>',
    remove: '<path d="M3 8h10"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>',
    file: '<path d="M9 1.5H4.5a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4.5L9 1.5z"/><path d="M9 1.5v3.5h3.5"/>',
    folder: '<path d="M2 4.5A.5.5 0 0 1 2.5 4h3.6l1.4 1.5h6A.5.5 0 0 1 14 6v6a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 2 12V4.5z"/>',
    'file-code': '<path d="M9 1.5H4.5a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4.5L9 1.5z"/><path d="M9 1.5v3.5h3.5"/><path d="M6.5 8L5 9.5l1.5 1.5M9.5 8l1.5 1.5-1.5 1.5"/>',
    'symbol-color': '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="5" r="0.8" fill="currentColor" stroke="none"/><circle cx="8" cy="11" r="0.8" fill="currentColor" stroke="none"/><circle cx="5" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="0.8" fill="currentColor" stroke="none"/>',
    run: '<path d="M4 3l9 5-9 5V3z"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    refresh: '<path d="M13.5 8A5.5 5.5 0 0 1 8 13.5 5.5 5.5 0 0 1 2.5 8 5.5 5.5 0 0 1 8 2.5c1.8 0 3.4.9 4.4 2.2"/><path d="M12.5 2.5v2.5H10"/>',
    undo: '<path d="M5 5.4h5.2a3.1 3.1 0 0 1 0 6.2H7.6" stroke-width="2.1"/><path d="M2.4 5.4L7 2.2v6.4z" fill="currentColor" stroke="none"/>',
    redo: '<path d="M11 5.4H5.8a3.1 3.1 0 0 0 0 6.2h2.6" stroke-width="2.1"/><path d="M13.6 5.4L9 2.2v6.4z" fill="currentColor" stroke="none"/>',
    save: '<path d="M3 3.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V5.5L10 3H3.5a.5.5 0 0 0-.5.5z"/><path d="M5 3v3h5V3M5 13v-4h6v4"/>',
    trash: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.8 9.2a.5.5 0 0 0 .5.3h5.4a.5.5 0 0 0 .5-.3L12 4"/>',
    copy: '<rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3.5a.5.5 0 0 1 .5-.5H11"/>',
    paste: '<rect x="3.5" y="3" width="9" height="11" rx="1"/><path d="M6 3V2h4v1M6 7.5h4M6 10.5h4"/>',
    edit: '<path d="M2.5 13.5l1-3.5L11 2.5l3 3-7.5 7.5-4 1z"/><path d="M10 3.5l3 3"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v4M8 5.5v0.01"/>',
    warning: '<path d="M8 2L1.5 13h13L8 2z"/><path d="M8 6.5v3.5M8 12v0.01"/>',
    error: '<circle cx="8" cy="8" r="6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/>',
    menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
    'kebab-vertical': '<circle cx="8" cy="3.5" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12.5" r="1" fill="currentColor" stroke="none"/>',
    ellipsis: '<circle cx="4" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>',
    'layout-sidebar-left': '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M6.5 2.5v11"/>',
    'layout-panel': '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 10h12"/>',
    'split-horizontal': '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M8 2.5v11"/>',
    'split-vertical': '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 8h12"/>',
    'zoom-in': '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5M5 7h4M7 5v4"/>',
    'zoom-out': '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5M5 7h4"/>',
    account: '<circle cx="8" cy="6" r="2.5"/><path d="M3 14a5 5 0 0 1 10 0"/>',
    history: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 2"/>',
    sync: '<path d="M13.5 8A5.5 5.5 0 0 1 8 13.5"/><path d="M2.5 8A5.5 5.5 0 0 1 8 2.5"/><path d="M13 2v3h-3M3 14v-3h3"/>',
    'cloud-download': '<path d="M5 10a3 3 0 1 1 .5-5.95A4 4 0 0 1 13 6a2.5 2.5 0 0 1-.5 4"/><path d="M8 8v6M5.5 11.5L8 14l2.5-2.5"/>',
    debug: '<circle cx="8" cy="9" r="3"/><path d="M8 3v3M5 6h6M5 12h6M4.5 4.5l1.5 1.5M11.5 4.5L10 6M4.5 13.5L6 12M11.5 13.5L10 12"/>',
    wand: '<path d="M3 13l8-8M10.5 3.5L13 6"/><path d="M6 3v2M5 4h2M12 11v2M11 12h2"/>',
    'symbol-numeric': '<path d="M4 3v10M3 3h2M10 3h4l-4 5h4M10 13h4"/>'
  };

  // Aliases
  ICONS['file-binary'] = ICONS.hex;
  ICONS['chrome-close'] = ICONS.close;

  // Settings icon override: Feather cog (24x24 viewBox) to avoid
  // the previous sun-like appearance
  var ICON_VIEWBOX = {
    settings: '0 0 24 24'
  };

  var ICON_PATH_OVERRIDES = {
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  };

  function getInner(name) {
    if (ICON_PATH_OVERRIDES[name]) return ICON_PATH_OVERRIDES[name];
    return ICONS[name] || null;
  }

  function getViewBox(name) {
    return ICON_VIEWBOX[name] || '0 0 16 16';
  }

  function iconHtml(name, size) {
    var inner = getInner(name);
    if (!inner) return '';
    var s = size || 16;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + getViewBox(name) + '" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  function icon(name, props) {
    var inner = getInner(name);
    if (!inner || !global.React) return null;
    var p = props || {};
    var size = p.size || 16;
    return global.React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: getViewBox(name),
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: p.className || '',
      style: p.style || {},
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: inner }
    });
  }

  function iconExists(name) { return !!getInner(name); }
  function listIcons() { return Object.keys(ICONS).concat(Object.keys(ICON_PATH_OVERRIDES)); }

  Ketor.ui.icon = icon;
  Ketor.ui.iconHtml = iconHtml;
  Ketor.ui.iconExists = iconExists;
  Ketor.ui.listIcons = listIcons;
  Ketor.ui.ICONS = ICONS;

})(window);