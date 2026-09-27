/* The right hand panel of the tile activity: the groups it draws and the shape it shares
   with the panels of every other activity.

   The inspector used to be a column of bare divs with its own padding, its own font size and
   its own headings, while every sidebar (translate, hex, table, search) draws a group as a
   .kt-sidebar-section with a .kt-sidebar-section-header and a .kt-sidebar-section-body. Batch
   170 rebuilt the tile inspector from that same Section, so this suite is about the shape:
   which titles are drawn and in which order, which class names come out, where the padding
   lives, and that every conditional group - the compressed graphic, the palette candidates,
   the map candidates, the remembered screens and the found palettes - is still inside the
   section that owns it.

   React is a stub in this harness: an element is { type, props }, and a component is an
   element whose type is a function. treeStrings() reads the props of the elements it is
   handed, but it does not call a component, so Section and MapInspector are invisible to it
   until they are drawn. draw() below calls every component with its props the way React
   would, and the walkers then see the headers, the bodies and the class names a browser
   would get. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile panel');

const REGION = 0x100;
/* A real offset in the synthetic rom with sixteen BGR555 words of room, so a palette loads. */
const PALETTE_AT = 0x3000;

/* The groups of the inspector, in the order it draws them. 'Compressed graphic' is not in
   the list because it belongs to a graphic the user opened, not to a plain sheet; the case
   below adds one and checks that its section appears first. */
const SECTIONS = [
  'Palette',
  'Paste hex from an emulator',
  'Map',
  'Screens',
  'Palettes for this screen',
  'Write text on this screen'
];

function openSheet() {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(REGION);
  env.K.tile.setFormat('gba-4bpp');
  return env;
}

/* Every component called with its props, so the element tree holds what the browser would
   render and not the components that would render it. */
function draw(node) {
  if (Array.isArray(node)) return node.map(draw);
  if (!node || typeof node !== 'object' || !node.props) return node;
  if (typeof node.type === 'function') return draw(node.type(node.props));
  const props = Object.assign({}, node.props);
  if (props.children !== undefined) props.children = draw(props.children);
  return { type: node.type, props: props };
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (n) { walk(n, visit); }); return; }
  visit(node);
  walk(node.props && node.props.children, visit);
}

function classList(node) {
  const raw = node && node.props && node.props.className;
  return typeof raw === 'string' ? raw.split(/\s+/) : [];
}

function hasClass(node, name) { return classList(node).indexOf(name) >= 0; }

function classes(tree) {
  const out = [];
  walk(tree, function (node) { classList(node).forEach(function (c) { out.push(c); }); });
  return out;
}

function stylesOf(tree, name) {
  const out = [];
  walk(tree, function (node) { if (hasClass(node, name)) out.push(node.props.style || {}); });
  return out;
}

/* What a node itself says: its title props and every string under it. */
function textOf(env, node) { return env.treeStrings(node).join(' '); }

/* The titles of the sections, in tree order: the text of every .kt-sidebar-section-header. */
function sectionTitles(env, tree) {
  const out = [];
  walk(tree, function (node) {
    if (hasClass(node, 'kt-sidebar-section-header')) out.push(textOf(env, node));
  });
  return out;
}

/* The body of the section whose header says title, so a case can say which section a group
   landed in and not merely that it is somewhere on the panel. */
function sectionBody(tree, title) {
  let found = null;
  walk(tree, function (node) {
    if (found || !hasClass(node, 'kt-sidebar-section')) return;
    const kids = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    const header = kids.filter(function (k) { return k && hasClass(k, 'kt-sidebar-section-header'); })[0];
    if (!header || header.props.children !== title) return;
    found = kids.filter(function (k) { return k && hasClass(k, 'kt-sidebar-section-body'); })[0] || null;
  });
  return found;
}

suite.test('the inspector draws its groups as titled sections, in the order they belong', function (t) {
  const env = openSheet();
  const panel = draw(env.K.ui.rightPanelProviders.tile({ activity: 'tile' }));

  t.assertDeepEqual(sectionTitles(env, panel), SECTIONS,
    'every group of the inspector is a Section with its own title');
  const text = env.treeStrings(panel).join('\n');
  SECTIONS.forEach(function (title) {
    t.assert(text.indexOf(title) >= 0, 'the rendered panel should carry "' + title + '"');
  });
  t.assertEqual(env.treeStrings(panel).join('\n').indexOf('Compressed graphic'), -1,
    'a sheet read from the rom draws no compressed graphic section');
});

suite.test('an opened compressed graphic adds its own section, first', function (t) {
  const env = openSheet();
  const K = env.K;
  K.tile.setMap({
    graphicSource: {
      offset: REGION, label: 'LZ77 test block', size: 64, dataOffset: 0, budget: 128,
      compressedSize: 0, dirty: false, data: new Uint8Array(64), version: 0
    }
  });
  const panel = draw(K.ui.rightPanelProviders.tile({ activity: 'tile' }));

  t.assertDeepEqual(sectionTitles(env, panel), ['Compressed graphic'].concat(SECTIONS),
    'the compressed graphic is a section of its own, before the others');
  t.assert(textOf(env, sectionBody(panel, 'Compressed graphic')).indexOf('LZ77 test block') >= 0,
    'and it still names the block it was opened from');
});

suite.test('the panel is built from the same Section shape as the other activities', function (t) {
  const env = openSheet();
  const SHAPE = ['kt-sidebar-section', 'kt-sidebar-section-header', 'kt-sidebar-section-body'];
  const panel = classes(draw(env.K.ui.rightPanelProviders.tile({ activity: 'tile' })));
  SHAPE.forEach(function (name) {
    t.assert(panel.indexOf(name) >= 0, 'the tile panel draws a ' + name);
  });

  const sidebar = env.K.ui.sidebarProviders.translation;
  t.assertEqual(typeof sidebar, 'function', 'the translation sidebar is the panel the shape comes from');
  const translation = classes(draw(sidebar()));
  SHAPE.forEach(function (name) {
    t.assert(translation.indexOf(name) >= 0, 'the translation sidebar draws the same ' + name);
  });

  const count = function (list, name) { return list.filter(function (c) { return c === name; }).length; };
  t.assertEqual(count(panel, 'kt-sidebar-section'), SECTIONS.length, 'one section per group of the inspector');
  t.assertEqual(count(panel, 'kt-sidebar-section-header'), count(panel, 'kt-sidebar-section'),
    'one header per section');
  t.assertEqual(count(panel, 'kt-sidebar-section-body'), count(panel, 'kt-sidebar-section'),
    'and one body per section');
});

suite.test('the section body brings the padding, the panel root brings none', function (t) {
  const env = openSheet();
  const panel = draw(env.K.ui.rightPanelProviders.tile({ activity: 'tile' }));

  const bodies = stylesOf(panel, 'kt-sidebar-section-body');
  t.assertEqual(bodies.length, SECTIONS.length, 'one body per group');
  bodies.forEach(function (style) {
    t.assertEqual(style.padding, '6px 12px 12px 12px', 'a section body pads the way every other panel pads');
  });

  const root = panel.props.style || {};
  t.assertEqual(root.padding, undefined, 'the panel root no longer carries the padding');
  t.assertEqual(root.fontSize, undefined, 'nor a font size of its own');
  t.assertEqual(root.overflowY, undefined, 'nor a second scroller: .kt-right-panel-body scrolls the panel');
  t.assertEqual(root.flex, '1 1 auto', 'the root fills the host');
  t.assertEqual(root.minWidth, 0, 'and may shrink with it');
  t.assertEqual(root.display, 'flex', 'a column');
  t.assertEqual(root.flexDirection, 'column', 'of sections');
  t.assertEqual(root.gap, 8, 'with the gap between them');
});

suite.test('every conditional group stays inside the section that owns it', function (t) {
  const env = openSheet();
  const K = env.K;
  K.tile.loadPalette(PALETTE_AT);
  K.tile.setMap({
    paletteCandidates: [{ offset: PALETTE_AT, score: 1.25 }],
    mapCandidates: [{ offset: 0x2000, score: 2.5, distinct: 7 }],
    savedScreens: [{ mapOffset: 0x2000, charBase: 0, name: 'title' }],
    screens: [{ mapOffset: 0x2000, charBase: 0, coverage: 1, distinct: 7 }],
    palettes: [{ offset: PALETTE_AT, score: 1.25, reason: 'pointed at' }]
  });
  const panel = draw(K.ui.rightPanelProviders.tile({ activity: 'tile' }));

  const inSection = function (title, piece) {
    const body = sectionBody(panel, title);
    t.assert(body, 'the section "' + title + '" is drawn');
    t.assert(textOf(env, body).indexOf(piece) >= 0,
      '"' + piece + '" belongs to the section "' + title + '"');
  };
  inSection('Palette', 'Palette candidates');
  inSection('Palette', 'Colour 1');
  inSection('Map', 'Screen base candidates');
  inSection('Map', 'Screens remembered for this ROM');
  inSection('Screens', 'map 002000 + chr 000000');
  inSection('Palettes for this screen', 'pointed at');
  inSection('Paste hex from an emulator', 'Write at tile 0 of the region');
});

suite.test('the tab keeps the inspector out and the right panel keeps it', function (t) {
  const env = openSheet();
  const K = env.K;

  const tabText = env.treeStrings(K.ui.tabProviders.tile()).join('\n');
  t.assertEqual(tabText.indexOf('Paste hex from an emulator'), -1,
    'the tab must not draw the inspector inline as well');
  t.assertEqual(typeof K.ui.rightPanelProviders.tile, 'function',
    'the tile activity should register a right panel provider');

  const panelText = env.treeStrings(draw(K.ui.rightPanelProviders.tile({ activity: 'tile' }))).join('\n');
  t.assert(panelText.indexOf('Paste hex from an emulator') >= 0,
    'the provider is where the inspector renders, got: ' + panelText.slice(0, 200));
  t.assert(panelText.indexOf('Palette') >= 0, 'with the palette controls on it');
});

module.exports = { suite: suite };
