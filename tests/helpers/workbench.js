/* Ketor test workbench.

   The app is a set of browser scripts that talk to each other through window and
   through workers. A test that wants to exercise the engine has to give it those
   two things: a window with the pieces it expects, and a way to run the code a
   worker was handed. This file is that harness, kept in one place so a suite only
   has to say what it is testing.

   Nothing here touches the network or the disk: a suite builds its own rom. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..', '..');
const JS = path.join(REPO, 'app', 'assets', 'js');
const CORE = path.join(JS, 'core');
const UI = path.join(JS, 'ui');

function makeReactStub() {
  return {
    createElement: function (type, props) {
      const children = Array.prototype.slice.call(arguments, 2);
      const merged = Object.assign({}, props || {});
      if (children.length === 1) merged.children = children[0];
      else if (children.length > 1) merged.children = children;
      return { type: type, props: merged };
    },
    useState: function (v) { return [typeof v === 'function' ? v() : v, function () {}]; },
    useEffect: function () {}, useLayoutEffect: function () {},
    useCallback: function (f) { return f; },
    useMemo: function (f) { return f(); },
    useRef: function () { return { current: null }; },
    memo: function (c) { return c; },
    useSyncExternalStore: function (s, g) { return g(); },
    useReducer: function (v) { return [v, function () {}]; },
    useContext: function () { return {}; },
    createContext: function () { return {}; },
    Fragment: 'f',
    forwardRef: function (f) { return f; },
    cloneElement: function (c) { return c; },
    Children: { map: function () { return []; }, toArray: function () { return []; } },
    isValidElement: function () { return false; },
    version: '18'
  };
}

function loadWorkbench() {
  const win = {
    React: makeReactStub(),
    addEventListener: function () {}, removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    requestAnimationFrame: function (f) { return setTimeout(f, 0); },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    confirm: function () { return true; },
    URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} },
    TextDecoder: function () { this.decode = function () { return ''; }; },
    TextEncoder: function () { this.encode = function () { return new Uint8Array(0); }; },
    performance: { now: function () { return Date.now(); } },
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost/' },
    crypto: undefined
  };
  win.Blob = function (parts) { win.__blob = String(parts[0]); };
  win.Worker = function () {
    const w = { code: win.__blob, msg: null, onmessage: null, ran: false, terminate: function () {} };
    w.postMessage = function (m) { w.msg = m; };
    win.__workers = win.__workers || [];
    win.__workers.push(w);
    return w;
  };
  win.document = {
    addEventListener: function () {},
    createElement: function () { return { style: {}, click: function () {}, appendChild: function () {}, download: null }; },
    body: { appendChild: function () {}, removeChild: function () {} },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  win.window = win;
  win.self = win;
  win.ReactDOM = { createRoot: function () { return { render: function () {} }; } };
  win.Ketor = {
    ui: {
      sidebarProviders: {}, tabProviders: {}, rightPanelProviders: {},
      registerSidebarProvider: function (id, fn) { win.Ketor.ui.sidebarProviders[id] = fn; },
      registerTabProvider: function (id, fn) { win.Ketor.ui.tabProviders[id] = fn; },
      registerRightPanelProvider: function (id, fn) { win.Ketor.ui.rightPanelProviders[id] = fn; },
      icon: function () { return {}; },
      getSidebarProvider: function () { return null; }, getTabProvider: function () { return null; }
    },
    core: {}
  };

  const load = (file) => vm.runInNewContext(fs.readFileSync(file, 'utf8'), win, { filename: file });
  load(path.join(JS, 'core.js'));
  vm.runInNewContext('window.__probe = { createTextExtractorWorker: createTextExtractorWorker, createBuildWorker: createBuildWorker, createTableWorker: createTableWorker };', win);
  win.Ketor.legacy = win.__probe;
  load(path.join(UI, 'ketor-search-state.js'));
  load(path.join(UI, 'ketor-hex-state.js'));
  load(path.join(UI, 'ketor-translate-state.js'));
  load(path.join(UI, 'ketor-translate-sidebar.js'));
  load(path.join(CORE, 'rom-identifier.js'));
  load(path.join(CORE, 'control-code-detector.js'));
  load(path.join(CORE, 'pointer-table-detector.js'));
  load(path.join(CORE, 'game-profile.js'));
  /* The font tools the in game preview needs: the game's own glyphs, not a mock up. */
  load(path.join(CORE, 'gba-compress.js'));
  load(path.join(CORE, 'font-codec.js'));
  load(path.join(CORE, 'font-detect.js'));
  load(path.join(CORE, 'tile-codec.js'));
  load(path.join(CORE, 'save-state.js'));
  load(path.join(CORE, 'font-map.js'));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Every worker the app created holds the code it was built from. Running that code
     in its own sandbox and then delivering the message the app posted is what makes
     a build happen here without a browser. */
  async function runPending() {
    const list = win.__workers || [];
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (w.ran || !w.msg || !w.onmessage || !w.code) continue;
      w.ran = true;
      const sandbox = {};
      sandbox.self = sandbox;
      sandbox.setTimeout = setTimeout;
      sandbox.clearTimeout = clearTimeout;
      sandbox.console = console;
      sandbox.performance = { now: function () { return Date.now(); } };
      sandbox.queueMicrotask = function (f) { Promise.resolve().then(f); };
      sandbox.TextDecoder = win.TextDecoder;
      sandbox.TextEncoder = win.TextEncoder;
      sandbox.crypto = undefined;
      sandbox.postMessage = function (m) { try { w.onmessage({ data: m }); } catch (e) { console.log('handler threw: ' + e.message); } };
      vm.runInNewContext(w.code, sandbox);
      sandbox.onmessage({ data: w.msg });
    }
  }

  /* Everything a rendered tree says, so a suite can assert on a panel without a
     browser: children, labels and tooltips. */
  function treeStrings(node, out) {
    const list = out || [];
    if (node === null || node === undefined || node === false || node === true) return list;
    if (typeof node === 'string') { list.push(node); return list; }
    if (typeof node === 'number') { list.push(String(node)); return list; }
    if (Array.isArray(node)) { node.forEach(function (item) { treeStrings(item, list); }); return list; }
    if (node.props) {
      if (typeof node.props.label === 'string') list.push(node.props.label);
      if (typeof node.props.title === 'string') list.push(node.props.title);
      /* A panel puts its buttons in an "actions" prop, not among the children, and those
         buttons are part of what the user sees. */
      if (node.props.actions) treeStrings(node.props.actions, list);
      treeStrings(node.props.children, list);
    }
    return list;
  }

  return { K: win.Ketor, win, runPending, sleep, REPO, treeStrings };
}

module.exports = { loadWorkbench };
