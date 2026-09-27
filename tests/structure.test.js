/* The shape of the app folder, checked where the browser would stay silent. Every page
   under app/ is an entry point: whatever it loads from disk has to be a file that exists,
   and a file that nothing loads is either a leftover or a page that forgot its script.
   This suite was written for the batch that removed app/assets/js/app.js (a stub whose
   whole body was one comment) together with two stylesheets no page linked and no rule
   imported; nothing failed then, and nothing would fail again, so the rule is a test now.
   The pages are read through fs and never written to. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('structure');

const REPO = path.join(__dirname, '..');
const APP = path.join(REPO, 'app');
const SCRIPT_ROOT = path.join(APP, 'assets', 'js');
const STYLE_ROOT = path.join(APP, 'assets', 'css');

/* The attribute is read with a quote aware pattern, so a src inside a comment or a data
   attribute is not picked up as a load. */
const SCRIPT_SRC = /<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const LINK_HREF = /<link\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function repoPath(abs) { return path.relative(REPO, abs).split(path.sep).join('/'); }

/* Every file below dir whose name the caller wants, at any depth, in a stable order. */
function walk(dir, wanted) {
  const found = [];
  fs.readdirSync(dir, { withFileTypes: true })
    .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; })
    .forEach(function (entry) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, wanted).forEach(function (p) { found.push(p); });
      else if (entry.isFile() && wanted(entry.name)) found.push(abs);
    });
  return found;
}

/* The entry points: every page under app/, nested ones included. */
function htmlFiles() { return walk(APP, function (name) { return /\.html$/i.test(name); }); }
function scriptsOnDisk() { return walk(SCRIPT_ROOT, function (name) { return /\.js$/i.test(name); }); }
function stylesOnDisk() { return walk(STYLE_ROOT, function (name) { return /\.css$/i.test(name); }); }

function attributes(text, pattern) {
  const values = [];
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) values.push(match[1] !== undefined ? match[1] : match[2]);
  return values;
}

/* http:, https:, data: and the protocol relative //host are not files this repository
   holds; everything else the page loads has to be here. */
function isLocal(ref) { return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref.trim()); }

/* The cache buster (?v=142) belongs to the request, not to the name. */
function bareRef(ref) { return ref.trim().replace(/[?#].*$/, ''); }

/* "/assets/x" is how the page is served from app/, "./x" and "x" sit beside the page. */
function targetOf(htmlAbs, ref) {
  const clean = bareRef(ref);
  if (!clean) return null;
  return clean.charAt(0) === '/' ? path.join(APP, clean) : path.resolve(path.dirname(htmlAbs), clean);
}

function isFile(abs) {
  try { return fs.statSync(abs).isFile(); } catch (error) { return false; }
}

/* One page, read as text: what it loads and what is wrong with that. Each message names
   the page and the path it points at, so a failure says where to look. */
function inspectHtml(htmlAbs, text) {
  const page = repoPath(htmlAbs);
  const missingScripts = [];
  const missingLinks = [];
  const duplicates = [];
  const seen = {};

  attributes(text, SCRIPT_SRC).forEach(function (ref) {
    const target = targetOf(htmlAbs, ref);
    if (isLocal(ref) && (!target || !isFile(target))) {
      missingScripts.push(page + ' loads <script src="' + ref.trim() + '"> but ' + (target ? repoPath(target) : ref.trim()) + ' is not a file on disk');
    }
    const key = bareRef(ref);
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] === 2) duplicates.push(page + ' loads <script src="' + key + '"> twice');
  });

  attributes(text, LINK_HREF).forEach(function (ref) {
    const target = targetOf(htmlAbs, ref);
    if (isLocal(ref) && (!target || !isFile(target))) {
      missingLinks.push(page + ' links <link href="' + ref.trim() + '"> but ' + (target ? repoPath(target) : ref.trim()) + ' is not a file on disk');
    }
  });

  return { missingScripts: missingScripts, missingLinks: missingLinks, duplicates: duplicates };
}

function readPage(htmlAbs) { return inspectHtml(htmlAbs, fs.readFileSync(htmlAbs, 'utf8')); }

/* What the pages load from disk, keyed by absolute path. */
function loadedBy(pages, pattern) {
  const loaded = {};
  pages.forEach(function (htmlAbs) {
    attributes(fs.readFileSync(htmlAbs, 'utf8'), pattern).forEach(function (ref) {
      if (!isLocal(ref)) return;
      const target = targetOf(htmlAbs, ref);
      if (target) loaded[target] = true;
    });
  });
  return loaded;
}

function orphans(pages, files, pattern) {
  const loaded = loadedBy(pages, pattern);
  return files.filter(function (abs) { return !loaded[abs]; }).map(repoPath);
}

/* ------------------------------------------------------------
   The load order of the shared box
   ------------------------------------------------------------
   KtBox used to be defined in ketor-table-state.js, a file the workbench page loads after
   two modules that talk about the component, and the component now lives in
   ui/ketor-ui-box.js, which has to be loaded before every module that uses it. What
   counts as a use is KtBox in code, not in a comment: ketor-tile-activity.js and
   ketor-groups-panel.js only mention the name while drawing their own markup. */
const BOX_SCRIPT = path.join(SCRIPT_ROOT, 'ui', 'ketor-ui-box.js');
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
/* A // that follows " or ' or : is part of a string such as a url, not a comment. */
const LINE_COMMENT = /(^|[^:"'\\])\/\/[^\n]*/gm;

function codeOf(text) {
  return String(text).replace(BLOCK_COMMENT, ' ').replace(LINE_COMMENT, '$1');
}

function usesKtBox(abs) {
  try { return /\bKtBox\b/.test(codeOf(fs.readFileSync(abs, 'utf8'))); } catch (error) { return false; }
}

/* The local scripts one page loads, in the order the page loads them. */
function scriptsInOrder(htmlAbs, pattern) {
  const out = [];
  attributes(fs.readFileSync(htmlAbs, 'utf8'), pattern).forEach(function (ref) {
    if (!isLocal(ref)) return;
    const target = targetOf(htmlAbs, ref);
    if (target) out.push({ ref: bareRef(ref), abs: target });
  });
  return out;
}

/* The modules tests/helpers/workbench.js loads, in the order its load() calls run. */
function harnessLoads() {
  const text = fs.readFileSync(path.join(__dirname, 'helpers', 'workbench.js'), 'utf8');
  const found = [];
  const pattern = /load\(path\.join\(\w+,\s*'([^']+)'\)\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) found.push(match[1]);
  return found;
}

suite.test('every page under app/ is an entry point, the nested ones included', function () {
  const pages = htmlFiles().map(repoPath);
  /* The pages the app ships. A page that goes away on purpose takes its name out of this
     list in the same commit; the point of naming them is that the recursive walk is
     checked, not just the two pages at the top. The old PocketTranslate page left app/
     for legacy/ in batch 180, so its name left this list with it. */
  ['app/index.html', 'app/wasm-runtime/index.html'].forEach(function (known) {
    assert(pages.indexOf(known) >= 0, 'the walk over app/ did not find the page ' + known + '; it found ' + JSON.stringify(pages));
  });
});

suite.test('every script a page loads is a file on disk', function () {
  const pages = htmlFiles();
  assert(pages.length > 0, 'no entry point html was found under app/');
  pages.forEach(function (htmlAbs) {
    const problems = readPage(htmlAbs).missingScripts;
    assertEqual(problems.length, 0, problems.join('; '));
  });
});

suite.test('every stylesheet a page links is a file on disk', function () {
  const pages = htmlFiles();
  assert(pages.length > 0, 'no entry point html was found under app/');
  pages.forEach(function (htmlAbs) {
    const problems = readPage(htmlAbs).missingLinks;
    assertEqual(problems.length, 0, problems.join('; '));
  });
});

suite.test('no page loads the same script twice', function () {
  htmlFiles().forEach(function (htmlAbs) {
    const problems = readPage(htmlAbs).duplicates;
    assertEqual(problems.length, 0, problems.join('; '));
  });
});

suite.test('every script under app/assets/js is loaded by some page', function () {
  const dead = orphans(htmlFiles(), scriptsOnDisk(), SCRIPT_SRC);
  assertEqual(dead.length, 0, 'nothing loads ' + dead.join(', ') + '; load it from a page or delete it');
});

suite.test('every stylesheet under app/assets/css is linked by some page', function () {
  const dead = orphans(htmlFiles(), stylesOnDisk(), LINK_HREF);
  assertEqual(dead.length, 0, 'nothing links ' + dead.join(', ') + '; link it from a page or delete it');
});

/* The workbench page is the only page that loads the UI modules, so a scan that finds no
   user there would leave the order guard checking nothing at all. */
suite.test('a module that uses KtBox is loaded by the workbench page', function () {
  const users = scriptsInOrder(path.join(APP, 'index.html'), SCRIPT_SRC)
    .filter(function (s) { return s.abs !== BOX_SCRIPT && usesKtBox(s.abs); })
    .map(function (s) { return s.ref; });
  assert(users.length > 0, 'no script loaded by app/index.html uses KtBox in code, so the load order guard has nothing to check');
});

suite.test('every page loads the shared box before the modules that use KtBox', function () {
  htmlFiles().forEach(function (htmlAbs) {
    const page = repoPath(htmlAbs);
    const scripts = scriptsInOrder(htmlAbs, SCRIPT_SRC).filter(function (s) { return /\.js$/i.test(s.abs); });
    const users = scripts.filter(function (s) { return s.abs !== BOX_SCRIPT && usesKtBox(s.abs); });
    if (!users.length) return;
    const boxAt = scripts.findIndex(function (s) { return s.abs === BOX_SCRIPT; });
    assert(boxAt >= 0, page + ' loads ' + users.map(function (s) { return s.ref; }).join(', ') + ', which use KtBox, but never loads ui/ketor-ui-box.js');
    users.forEach(function (s) {
      const userAt = scripts.findIndex(function (u) { return u.abs === s.abs; });
      assert(boxAt < userAt, page + ' loads ' + s.ref + ' before ui/ketor-ui-box.js (positions ' + userAt + ' and ' + boxAt + '); the box has to come first');
    });
  });
});

suite.test('the test harness loads the shared box before the modules that use KtBox', function () {
  const order = harnessLoads();
  const boxAt = order.indexOf('ketor-ui-box.js');
  assert(boxAt >= 0, 'tests/helpers/workbench.js never loads ketor-ui-box.js, so K.ui.KtBox is undefined for the suites that render it');
  order.forEach(function (name, i) {
    if (name === 'ketor-ui-box.js') return;
    const abs = path.join(SCRIPT_ROOT, 'ui', name);
    if (!isFile(abs) || !usesKtBox(abs)) return;
    assert(boxAt < i, 'tests/helpers/workbench.js loads ' + name + ' before ketor-ui-box.js; a module that uses KtBox has to run after the box is defined');
  });
  /* The harness loads no tab module that calls KtBox yet, so the anchor is the file the
     box was lifted out of: the pair stays in the order the page loads it. */
  const stateAt = order.indexOf('ketor-table-state.js');
  assert(stateAt < 0 || boxAt < stateAt, 'tests/helpers/workbench.js loads ketor-table-state.js before ketor-ui-box.js; the box keeps the place of the definition it replaced');
});

/* ------------------------------------------------------------
   The workbench and the legacy core.js
   ------------------------------------------------------------
   The workbench used to load app/assets/js/core.js for seven names and reach them through
   an inline bridge that copied fourteen keys onto window.Ketor.legacy; only six of those
   keys were ever read. Batch 180 moved the code the workbench really used into
   app/assets/js/core/ and archived the old engine under legacy/, so these tests hold the
   line: the shared names are published, the build worker still carries its four helpers as
   source, and neither the page nor app/ has anything left of the old file. Batch 181
   renamed the page to app/index.html: "preview" was the name of a second application
   that left app/ for legacy/, and this page is the application now. */
const CORE_ROOT = path.join(SCRIPT_ROOT, 'core');
/* The one application page: app/index.html, the name Pages serves from app/. */
const WORKBENCH = path.join(APP, 'index.html');
const WORKBENCH_BUILD = '153';
const WORKBENCH_CORE_FILES = ['text-codec.js', 'rom-builder.js', 'worker-text-extract.js', 'worker-build.js', 'worker-table.js'];
/* What the ui reads out of window.Ketor.core, one name per module. */
const CORE_NAMES = ['escapeRegex', 'createTokenizer', 'smartTextParse', 'getSmartByteLength',
  'rebuildRom', 'createTextExtractorWorker', 'createBuildWorker', 'createTableWorker'];
/* The helpers createBuildWorker stringifies into the worker it builds. */
const WORKER_HELPERS = ['escapeRegex', 'createTokenizer', 'smartTextParse', 'rebuildRom'];
/* What batch 180 and batch 182 moved out of app/. The path under legacy/ mirrors the path
   it had, and the old page keeps its name under legacy/ only: batch 181 gave app/index.html
   to the workbench, so that page is checked by its home in the archive instead. Batch 182
   moved one module no page loaded into legacy/unused/ under its bare name, so
   ARCHIVED_UNUSED says where the files that kept no app/ path ended up. */
const ARCHIVED = ['app/assets/js/core.js', 'app/assets/js/app-ui.js', 'app/assets/css/main.css',
  'app/assets/js/ui/ketor-tasks-registry.js'];
const ARCHIVED_UNUSED = { 'app/assets/js/ui/ketor-tasks-registry.js': 'legacy/unused/ketor-tasks-registry.js' };
const ARCHIVED_PAGE = 'legacy/index.html';
/* Where a file batch 180 or later took out of app/ lives now: the mirror of its app/ path,
   unless it was archived without one. */
function archivedPath(rel) { return ARCHIVED_UNUSED[rel] || ('legacy/' + rel.slice('app/'.length)); }

/* A window just bare enough to run the core modules: they touch nothing else at load. */
function sandboxOf() {
  const win = { console: console, Uint8Array: Uint8Array, Map: Map, Set: Set, RegExp: RegExp, Math: Math,
    Number: Number, String: String, Object: Object, Array: Array, JSON: JSON, Error: Error, Promise: Promise,
    Symbol: Symbol, Boolean: Boolean, TextDecoder: TextDecoder, TextEncoder: TextEncoder,
    setTimeout: setTimeout, clearTimeout: clearTimeout, queueMicrotask: queueMicrotask,
    Worker: function () {}, Blob: function () {},
    URL: { createObjectURL: function () { return 'blob:test'; }, revokeObjectURL: function () {} } };
  win.window = win;
  return win;
}

function loadCoreInto(win, file) {
  const abs = path.join(CORE_ROOT, file);
  vm.runInNewContext(fs.readFileSync(abs, 'utf8'), win, { filename: abs });
}

suite.test('the workbench core modules publish the eight shared names on window.Ketor.core', function () {
  const win = sandboxOf();
  WORKBENCH_CORE_FILES.forEach(function (file) { loadCoreInto(win, file); });
  CORE_NAMES.forEach(function (name) {
    assert(typeof win.Ketor.core[name] === 'function',
      'app/assets/js/core does not publish Ketor.core.' + name + '; the workbench ui reads it from there');
  });
});

suite.test('the build worker source still carries the four helpers it stringifies', function () {
  const win = sandboxOf();
  ['text-codec.js', 'rom-builder.js', 'worker-build.js'].forEach(function (file) { loadCoreInto(win, file); });
  const source = win.Ketor.core.createBuildWorker.toString();
  WORKER_HELPERS.forEach(function (name) {
    assert(source.indexOf('const ' + name + ' = ') >= 0,
      'createBuildWorker no longer puts "const ' + name + ' = " into the worker source it builds; the worker would run without its ' + name);
  });
});

suite.test('the workbench page loads core.js no more and keeps no Ketor.legacy bridge', function () {
  const text = fs.readFileSync(WORKBENCH, 'utf8');
  assert(text.indexOf('core.js') < 0, 'app/index.html still mentions core.js; the old engine lives in legacy/ now');
  assert(text.indexOf('Ketor.legacy') < 0, 'app/index.html still installs the Ketor.legacy bridge; the ui reads window.Ketor.core instead');
  assert(text.indexOf('(build ' + WORKBENCH_BUILD + ')') >= 0, 'app/index.html is not at build ' + WORKBENCH_BUILD);
  assert(text.indexOf('__KT_BUILD__ = "' + WORKBENCH_BUILD + '"') >= 0, 'window.__KT_BUILD__ is not ' + WORKBENCH_BUILD);
  const refs = attributes(text, SCRIPT_SRC).map(bareRef);
  let previous = -1;
  WORKBENCH_CORE_FILES.forEach(function (file) {
    const ref = './assets/js/core/' + file;
    const at = refs.indexOf(ref);
    assert(at >= 0, 'app/index.html does not load ' + ref);
    assert(at > previous, 'app/index.html loads ' + ref + ' before the module it is built on; the page has to load them in order: ' + WORKBENCH_CORE_FILES.join(', '));
    previous = at;
  });
});

/* ------------------------------------------------------------
   The rename: app/workbench-preview.html is app/index.html
   ------------------------------------------------------------
   Batch 181 made the workbench the one application page under the name Pages serves from
   app/. The old name said "preview" while a second application lived beside it; that
   application is archived under legacy/ now, and only the workbench and the wasm runtime
   page it drives stay under app/. These tests lock the name, the build token and the five
   core modules, and they keep the recursive scan over app/ honest about the new page. */
suite.test('the workbench page is app/index.html and the preview name is gone', function () {
  assert(isFile(WORKBENCH), 'app/index.html is missing; batch 181 renamed the workbench page to it');
  assert(!isFile(path.join(APP, 'workbench-preview.html')), 'app/workbench-preview.html still exists; the workbench page is app/index.html');
  const pages = htmlFiles().map(repoPath);
  assert(pages.indexOf('app/index.html') >= 0, 'the walk over app/ did not find app/index.html; it found ' + JSON.stringify(pages));
  assert(pages.indexOf('app/workbench-preview.html') < 0, 'the walk over app/ still finds app/workbench-preview.html; it found ' + JSON.stringify(pages));
});

suite.test('app/index.html loads the five core modules and carries build ' + WORKBENCH_BUILD, function () {
  const text = fs.readFileSync(WORKBENCH, 'utf8');
  const scripts = attributes(text, SCRIPT_SRC).map(bareRef);
  WORKBENCH_CORE_FILES.forEach(function (file) {
    assert(scripts.indexOf('./assets/js/core/' + file) >= 0, 'app/index.html does not load ./assets/js/core/' + file);
  });
  assert(text.indexOf('(build ' + WORKBENCH_BUILD + ')') >= 0, 'app/index.html is not at build ' + WORKBENCH_BUILD);
  assert(text.indexOf('__KT_BUILD__ = "' + WORKBENCH_BUILD + '"') >= 0, 'app/index.html does not set window.__KT_BUILD__ to ' + WORKBENCH_BUILD);
  /* Every cache buster on the page is the build token, so a page bumped in one place and
     left behind in another fails here instead of serving a stale stylesheet. */
  const stale = attributes(text, SCRIPT_SRC).concat(attributes(text, LINK_HREF))
    .map(function (ref) { return ref.trim(); })
    .filter(function (ref) { return /\?v=\d+/.test(ref) && ref.indexOf('?v=' + WORKBENCH_BUILD) < 0; });
  assertEqual(stale.length, 0, 'app/index.html still asks for ' + stale.join(', ') + ' at a build other than ' + WORKBENCH_BUILD);
});

suite.test('the recursive scan over app/ covers app/index.html and the nested runtime page', function () {
  const pages = htmlFiles();
  const known = pages.map(repoPath);
  assert(known.indexOf('app/index.html') >= 0 && known.indexOf('app/wasm-runtime/index.html') >= 0,
    'the recursive walk over app/ does not cover both entry points; it found ' + JSON.stringify(known));
  pages.forEach(function (htmlAbs) {
    const report = readPage(htmlAbs);
    assertEqual(report.missingScripts.length, 0, report.missingScripts.join('; '));
    assertEqual(report.missingLinks.length, 0, report.missingLinks.join('; '));
  });
});

suite.test('the one css rule the workbench needs from main.css came across with it', function () {
  const text = fs.readFileSync(path.join(STYLE_ROOT, 'vscode-components.css'), 'utf8');
  ['.btn-danger {', '.btn-danger:hover {'].forEach(function (rule) {
    assert(text.indexOf(rule) >= 0, 'app/assets/css/vscode-components.css has no ' + rule + ', a rule ui/ketor-table-tab.js sets on a kt-btn and main.css used to carry');
  });
});

suite.test('the legacy engine and the old page are archived under legacy/, out of app/', function () {
  ARCHIVED.forEach(function (rel) {
    assert(!isFile(path.join(REPO, rel)), rel + ' is still inside app/; it was archived under legacy/');
    const archived = archivedPath(rel);
    assert(isFile(path.join(REPO, archived)), archived + ' is missing; the archive under legacy/ has to hold every file app/ gave up');
  });
  assert(isFile(path.join(REPO, ARCHIVED_PAGE)), ARCHIVED_PAGE + ' is missing; the archive under legacy/ has to hold the old page, whose name app/index.html now belongs to the workbench');
  assert(isFile(path.join(REPO, 'legacy', 'README.md')), 'legacy/README.md is missing; the archive has to say what it is and how to open it');
});

module.exports = {
  suite: suite,
  inspectHtml: inspectHtml,
  htmlFiles: htmlFiles,
  loadedBy: loadedBy,
  scriptsOnDisk: scriptsOnDisk,
  stylesOnDisk: stylesOnDisk,
  orphans: orphans,
  repoPath: repoPath,
  SCRIPT_SRC: SCRIPT_SRC,
  LINK_HREF: LINK_HREF
};
