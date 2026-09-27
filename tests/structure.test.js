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

/* The cache buster (?v=139) belongs to the request, not to the name. */
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
