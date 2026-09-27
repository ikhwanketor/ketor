/* The rail of the tile activity: the boxes the tab draws on its right, what each box holds
   and which of them a beginner meets open.

   The inspector used to be the right hand panel of the workbench - this was the only activity
   that registered one - so this suite pinned Ketor.ui.rightPanelProviders.tile, the order of
   the sections it drew and the .kt-sidebar-section shape of every group (batch 170). Batch
   174 moved the inspector into the tab, the way the hex, table and search tabs keep their
   columns inside themselves: the rail is a fixed 234 pixel column with a left border and the
   sidebar background, every group is a .kt-ui-box (the frame KtBox draws for the other
   activities), the workbench registers no panel for this activity any more, and the groups
   are ordered the way a session uses them - the occasional ones closed until they are asked
   for, so a beginner meets the two a drawing session always needs.

   React is a stub in this harness: an element is { type, props }, and a component is an
   element whose type is a function. draw() below calls every component with its props the way
   React would, so the walkers see the boxes, the titles and the bodies a browser would get
   instead of the components that would render them. A closed box keeps its body in the tree,
   hidden with display:none, which is what lets the ownership case below read a group that
   starts closed. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile panel');

const REGION = 0x100;
/* A real offset in the synthetic rom with sixteen BGR555 words of room, so a palette loads. */
const PALETTE_AT = 0x3000;

/* The groups of the rail, in the order the tab draws them, which is the order a session uses
   them. 'Compressed graphic' is not in the list because it belongs to a graphic the user
   opened, not to a plain sheet; the case below adds one and checks the place it takes. */
const SECTIONS = [
  'Map',
  'Write text on this screen',
  'Palette',
  'Screens',
  'Palettes for this screen',
  'Paste hex from an emulator'
];

/* The two groups a drawing session needs: open when the tab first draws. */
const OPEN = ['Write text on this screen', 'Palette'];

/* The occasional ones, closed until the chevron is clicked, with one control each that has
   to be in the tree even while the box is closed. */
const CLOSED = {
  'Map': 'Detect map',
  'Screens': 'Find screens',
  'Palettes for this screen': 'Find palettes',
  'Paste hex from an emulator': 'Apply'
};

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

/* What a node itself says: its title props and every string under it. */
function textOf(env, node) { return env.treeStrings(node).join(' '); }

/* The rail: the fixed column the tab draws beside the sheet, the way the hex tab draws its
   own (flex 0 0 234px plus the border that separates it from the work). */
function railOf(tree) {
  let found = null;
  walk(tree, function (node) {
    const style = node.props && node.props.style;
    if (!found && style && style.flex === '0 0 234px') found = node;
  });
  return found;
}

/* Every box of the rail, in the order the tab draws them. */
function boxesOf(tree) {
  const out = [];
  walk(tree, function (node) { if (hasClass(node, 'kt-ui-box')) out.push(node); });
  return out;
}

/* The title of a box: the uppercase label beside its chevron. */
function boxTitle(box) {
  let title = '';
  walk(box, function (node) {
    const style = node.props && node.props.style;
    if (!title && style && style.textTransform === 'uppercase') title = String(node.props.children || '');
  });
  return title;
}

function boxTitles(tree) { return boxesOf(tree).map(boxTitle); }

function boxOf(tree, title) {
  return boxesOf(tree).filter(function (box) { return boxTitle(box) === title; })[0] || null;
}

function boxBody(box) {
  let body = null;
  walk(box, function (node) { if (!body && hasClass(node, 'kt-ui-box-body')) body = node; });
  return body;
}

/* The chevron that opens and closes the box. */
function toggleOf(box) {
  let button = null;
  walk(box, function (node) {
    const style = node.props && node.props.style;
    if (!button && node.type === 'button' && style && style.width === 18) button = node;
  });
  return button;
}

suite.test('the tab draws the rail itself and the workbench keeps no panel for it', function (t) {
  const env = openSheet();
  const K = env.K;
  const tree = draw(K.ui.tabProviders.tile());

  t.assertEqual(K.ui.rightPanelProviders.tile, undefined,
    'the tile activity registers no right hand panel any more: the inspector is in the tab');
  t.assertEqual(typeof K.ui.tabProviders.tile, 'function', 'and the tab is still its provider');

  const rail = railOf(tree);
  t.assert(rail, 'the tab draws a rail beside the sheet');
  const style = rail.props.style;
  t.assertEqual(style.flex, '0 0 234px', 'as wide as the column the hex tab draws');
  t.assertEqual(style.minWidth, 0, 'and it may shrink with the tab');
  t.assertEqual(style.display, 'flex', 'a column');
  t.assertEqual(style.flexDirection, 'column', 'of boxes');
  t.assertEqual(style.padding, 8, 'with the padding the other rails use');
  t.assertEqual(style.borderLeft, '1px solid var(--kt-widget-border-default)',
    'a border on the side that faces the canvas');
  t.assertEqual(style.background, 'var(--kt-sidebar-bg)', 'and the sidebar background');
  t.assertEqual(style.overflow, 'auto', 'the rail scrolls when its boxes are taller than the tab');

  t.assertEqual(boxesOf(rail).length, SECTIONS.length, 'every group of the inspector is a box of the rail');
});

suite.test('the boxes are ordered the way a drawing session uses them', function (t) {
  const env = openSheet();
  const tree = draw(env.K.ui.tabProviders.tile());

  t.assertDeepEqual(boxTitles(tree), SECTIONS, 'every group is a box with its own title');
  const text = env.treeStrings(tree).join('\n');
  SECTIONS.forEach(function (title) {
    t.assert(text.indexOf(title) >= 0, 'the rendered tab should carry "' + title + '"');
  });
  t.assertEqual(text.indexOf('Compressed graphic'), -1,
    'a sheet read from the rom draws no compressed graphic box');
});

suite.test('the two groups a drawing session needs are open, the occasional ones start closed', function (t) {
  const env = openSheet();
  const tree = draw(env.K.ui.tabProviders.tile());

  OPEN.forEach(function (title) {
    const box = boxOf(tree, title);
    t.assert(box, 'the box "' + title + '" is drawn');
    t.assertEqual(classList(box).indexOf('kt-ui-box-collapsed'), -1, '"' + title + '" starts open');
    const body = boxBody(box);
    t.assert(body, 'so its body is in the tree');
    t.assertEqual((body.props.style || {}).display, 'block', 'and on screen');
    t.assertEqual((body.props.style || {}).padding, 8, 'padded the way KtBox pads a body');
    const toggle = toggleOf(box);
    t.assert(toggle, 'the box has a chevron of its own');
    t.assertEqual(toggle.props['aria-expanded'], 'true', 'which says the box is open');
    t.assertEqual(toggle.props.title, 'Hide ' + title, 'and offers to close it');
  });

  Object.keys(CLOSED).forEach(function (title) {
    const box = boxOf(tree, title);
    t.assert(box, 'the box "' + title + '" is drawn');
    t.assert(hasClass(box, 'kt-ui-box-collapsed'),
      '"' + title + '" starts closed, so a beginner meets it as one line');
    const body = boxBody(box);
    t.assert(body, 'its body is still in the tree: that is what makes the group one click away');
    t.assertEqual((body.props.style || {}).display, 'none', 'hidden while the box is closed');
    t.assert(textOf(env, body).indexOf(CLOSED[title]) >= 0,
      'and it still holds its controls, "' + CLOSED[title] + '" among them');
    const toggle = toggleOf(box);
    t.assert(toggle, 'the box has a chevron');
    t.assertEqual(toggle.props['aria-expanded'], 'false', 'which says the box is closed');
    t.assertEqual(toggle.props.title, 'Show ' + title, 'and offers to open it');
  });
});

suite.test('an opened compressed graphic adds its box in its place in the workflow', function (t) {
  const env = openSheet();
  const K = env.K;
  K.tile.setMap({
    graphicSource: {
      offset: REGION, label: 'LZ77 test block', size: 64, dataOffset: 0, budget: 128,
      compressedSize: 0, dirty: false, data: new Uint8Array(64), version: 0
    }
  });
  const tree = draw(K.ui.tabProviders.tile());

  t.assertDeepEqual(boxTitles(tree), SECTIONS.slice(0, 5).concat(['Compressed graphic', SECTIONS[5]]),
    'the compressed graphic is a box of its own, between the screen groups and the paste box');
  const box = boxOf(tree, 'Compressed graphic');
  t.assert(hasClass(box, 'kt-ui-box-collapsed'), 'it starts closed like the other occasional groups');
  const body = boxBody(box);
  t.assert(textOf(env, body).indexOf('LZ77 test block') >= 0,
    'and it still names the block it was opened from');
  t.assert(textOf(env, body).indexOf('Write back') >= 0, 'with the button that writes it back');
});

suite.test('each box is the shared .kt-ui-box the other activities draw', function (t) {
  const env = openSheet();
  const tree = draw(env.K.ui.tabProviders.tile());
  const boxes = boxesOf(tree);

  t.assertEqual(typeof env.K.ui.KtBox, 'function', 'the shared box component is loaded');
  boxes.forEach(function (box) {
    t.assert(hasClass(box, 'kt-ui-box'), 'every group is a kt-ui-box');
    t.assertEqual((box.props.style || {}).flex, '0 0 auto',
      'and keeps its own height, so the rail scrolls instead of squashing the boxes');
  });

  /* The frame the shared component hands out, drawn the same way: the classes the rail uses
     are the classes KtBox uses, so the tile rail is the same column as the other tabs'. */
  const shared = draw(env.win.React.createElement(env.K.ui.KtBox, { id: 'probe', title: 'Probe', defaultCollapsed: true }));
  t.assert(hasClass(shared, 'kt-ui-box'), 'KtBox draws the same frame');
  t.assert(hasClass(shared, 'kt-ui-box-collapsed'), 'and the same closed class');

  const counts = {};
  classes(tree).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
  t.assertEqual(counts['kt-ui-box-body'] || 0, boxes.length, 'one body per box');
  boxes.forEach(function (box) { t.assert(toggleOf(box), 'and one chevron per box'); });
});

suite.test('every conditional group stays inside the box that owns it', function (t) {
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
  const tree = draw(K.ui.tabProviders.tile());

  const inBox = function (title, piece) {
    const box = boxOf(tree, title);
    t.assert(box, 'the box "' + title + '" is drawn');
    t.assert(textOf(env, boxBody(box)).indexOf(piece) >= 0,
      '"' + piece + '" belongs to the box "' + title + '"');
  };
  inBox('Palette', 'Palette candidates');
  inBox('Palette', 'Colour 1');
  inBox('Map', 'Screen base candidates');
  inBox('Map', 'Screens remembered for this ROM');
  inBox('Write text on this screen', 'Move region');
  inBox('Screens', 'map 002000 + chr 000000');
  inBox('Palettes for this screen', 'pointed at');
  inBox('Paste hex from an emulator', 'Write at tile 0 of the region');
});

suite.test('every group keeps the controls it had', function (t) {
  const env = openSheet();
  const tree = draw(env.K.ui.tabProviders.tile());
  const text = env.treeStrings(tree).join('\n');

  /* One control of each group, the ones a caller drives by hand; a control that was dropped
     in the move shows up here even though the box that holds it is closed. */
  ['Detect map', 'Find screens', 'Find palettes', 'Move region', 'Region = cursor',
    'Character block of the tile region', 'Copy tile 0', 'Export .pal', 'Apply'].forEach(function (label) {
    t.assert(text.indexOf(label) >= 0, 'the rendered rail should still carry "' + label + '"');
  });
});

module.exports = { suite: suite };
