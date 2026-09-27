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

/* The cache buster (?v=140) belongs to the request, not to the name. */
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
   KtBox used to be defined in ketor-table-state.js, a file the preview page loads after
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
  /* The three pages the app ships. A page that goes away on purpose takes its name out of
     this list in the same commit; the point of naming them is that the recursive walk is
     checked, not just the two pages at the top. */
  ['app/index.html', 'app/workbench-preview.html', 'app/wasm-runtime/index.html'].forEach(function (known) {
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

/* The preview page is the only page that loads the UI modules, so a scan that finds no
   user there would leave the order guard checking nothing at all. */
suite.test('a module that uses KtBox is loaded by the preview page', function () {
  const users = scriptsInOrder(path.join(APP, 'workbench-preview.html'), SCRIPT_SRC)
    .filter(function (s) { return s.abs !== BOX_SCRIPT && usesKtBox(s.abs); })
    .map(function (s) { return s.ref; });
  assert(users.length > 0, 'no script loaded by app/workbench-preview.html uses KtBox in code, so the load order guard has nothing to check');
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
