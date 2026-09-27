/* The tile status bar, the right hand panel the workbench hosts for the activity, and
   the palette import that must not write to the offset of an older palette.

   The status line is one string: K.tile.statusLine() reads the window base, the format,
   the depth and the stride, the tiles, the patches that land inside that window, the
   picked tile and pixel, the image length and the graphic source out of the store and the
   hex layer, and the tab renders that very string, so a caller and the strip under the
   canvas cannot drift apart. The patch count is checked with a patch inside the window and
   one outside it, because a count that took every patch of the ROM would look right on a
   fresh sheet.

   The palette case is byte for byte: a palette made from text has no ROM offset, so the
   colour edit has to be refused and not one byte of the image may move - the bug this
   covers wrote two bytes into the offset of the palette that happened to be loaded before.
   A palette read out of the file with loadPalette() keeps its edit and writes exactly the
   two bytes of the entry it names. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-statusbar');

const REGION = 0x100;
const TILE_BYTES = 32;
/* A real offset in the synthetic rom with sixteen BGR555 words of room: the fixture fills
   nothing there, so every one of its words is 0x0000 and a white entry changes both bytes. */
const PALETTE_AT = 0x3000;
/* JASC-PAL, the one text form an emulator palette export uses. */
const PAL_TEXT = 'JASC-PAL\n0100\n3\n255 0 0\n0 255 0\n0 0 255\n';

function openSheet() {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(REGION);
  env.K.tile.setFormat('gba-4bpp');
  return env;
}

/* Every offset whose byte differs, so a case can say "not one byte" or "exactly these
   two" instead of trusting a spot check that never looks at the other 262143 bytes. */
function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  }
  return out;
}

/* The tab root: the one handler the shortcuts hang off, so this is the handler a keydown
   inside the tab reaches. */
function rootHandler(env) { return env.K.ui.tabProviders.tile().props.onKeyDown; }

/* What the handler is handed as an event target: the tag name and the contenteditable
   flag, which is what a browser puts on the element that has the focus. */
function element(tag, editable) { return { tagName: tag, isContentEditable: !!editable }; }

function press(handler, key, target) {
  const ev = { key: key, target: target, prevented: 0, ctrlKey: true };
  ev.preventDefault = function () { ev.prevented++; };
  handler(ev);
  return ev;
}

suite.test('the status line names the window, the format, the step, the tiles and the patches', function (t) {
  const env = openSheet();
  const K = env.K;
  const line = K.tile.statusLine();

  ['0x000100', 'gba-4bpp', '4bpp', 'tiles ', 'patch '].forEach(function (piece) {
    t.assert(line.indexOf(piece) >= 0, 'the line should hold "' + piece + '", got: ' + line);
  });
  t.assertEqual(line.indexOf('0x000100'), 0, 'the window base comes first, got: ' + line);
  t.assert(line.indexOf('4bpp/32') >= 0, 'the depth and the bytes a tile steps by sit together, got: ' + line);
  t.assertEqual(line.indexOf('NaN'), -1, 'no NaN may reach the status bar, got: ' + line);
  t.assertEqual(line.indexOf('undefined'), -1, 'and no undefined either, got: ' + line);
  t.assertEqual(K.tile.statusLine({ selected: -1, sel: null }), line,
    'nothing picked and no hint is the same line the tab draws for an untouched sheet');
});

suite.test('the patch count follows the window and the picked tile and pixel are named', function (t) {
  const env = openSheet();
  const K = env.K;

  t.assert(K.tile.statusLine().indexOf('patch 0') >= 0, 'a fresh sheet holds no patch, got: ' + K.tile.statusLine());
  K.tile.setPixel(0, 0, 5);
  t.assert(K.tile.statusLine().indexOf('patch 1') >= 0,
    'a painted pixel is one patch inside the window, got: ' + K.tile.statusLine());
  K.hex.setByte(0x20000, 0x5A);
  t.assert(K.tile.statusLine().indexOf('patch 1') >= 0,
    'a patch outside the window belongs to another part of the rom and is not counted, got: ' + K.tile.statusLine());

  const picked = K.tile.statusLine({ selected: 5, sel: { tile: 5, x: 2, y: 3 } });
  t.assert(picked.indexOf('tile 5') >= 0, 'the picked tile is named, got: ' + picked);
  t.assert(picked.indexOf('sel 5@2,3') >= 0, 'and the pixel box that is selected, got: ' + picked);
});

suite.test('the tab renders the status line and leaves the inspector to the right panel', function (t) {
  const env = openSheet();
  const K = env.K;

  const text = env.treeStrings(K.ui.tabProviders.tile()).join('\n');
  const line = K.tile.statusLine();
  t.assert(text.indexOf(line) >= 0, 'the strip should render the string statusLine() hands out, got: ' + text.slice(-500));
  ['0x000100', 'gba-4bpp', 'tiles ', 'patch '].forEach(function (piece) {
    t.assert(text.indexOf(piece) >= 0, 'the rendered tab should hold "' + piece + '"');
  });
  t.assertEqual(text.indexOf('Paste hex from an emulator'), -1,
    'the tab must not draw the inspector inline as well: it belongs to the right panel');

  t.assertEqual(typeof K.ui.rightPanelProviders.tile, 'function', 'the tile activity should register a right panel provider');
  t.assert(K.ui.rightPanelProviders.tile, 'the registry should hold the component');
  const panelText = env.treeStrings(K.ui.rightPanelProviders.tile({ activity: 'tile' })).join('\n');
  t.assert(panelText.indexOf('Paste hex from an emulator') >= 0, 'the provider is where the inspector renders, got: ' + panelText.slice(0, 200));
  t.assert(panelText.indexOf('Palette') >= 0, 'with the palette controls on it');
});

suite.test('Ctrl+C in a text field keeps its own copy and leaves the tab clipboard alone', function (t) {
  const env = openSheet();
  const K = env.K;
  K.tile.copyRegion(5);
  const clip = K.tile.getState().clipboard;
  const before = K.hex.getPatchedBytes();
  const handler = rootHandler(env);

  ['INPUT', 'TEXTAREA', 'SELECT'].forEach(function (tag) {
    const ev = press(handler, 'c', element(tag));
    t.assertEqual(ev.prevented, 0, 'Ctrl+C in a ' + tag + ' is the field\'s own copy, not the tab\'s');
  });
  t.assert(K.tile.getState().clipboard === clip, 'none of those keystrokes replaced the clipboard');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and not one byte of the rom moved');

  /* The handler is live: the same keystroke with the canvas as the target does copy, so
     the field case above is a guard and not a handler that answers nothing at all. */
  K.hex.gotoOffset(REGION + 9 * TILE_BYTES);
  const canvas = press(handler, 'c', element('CANVAS'));
  t.assertEqual(canvas.prevented, 1, 'Ctrl+C on the canvas belongs to the tab');
  t.assert(K.tile.getState().clipboard !== clip, 'and it fills the clipboard with the tile under the hex cursor');
  t.assertEqual(K.tile.getState().clipboard.tile, 9, 'which is the tile the cursor sits on');
});

suite.test('an imported palette has no rom offset: the colour edit is refused and writes nothing', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();

  t.assert(K.tile.loadPalette(PALETTE_AT, 'from the rom') !== null, 'a real palette offset should load');
  t.assertEqual(K.tile.getState().paletteOffset, PALETTE_AT, 'and is remembered as the offset an edit writes to');

  t.assert(K.tile.parsePaletteText(PAL_TEXT) !== null, 'the text should parse into a palette');
  t.assertEqual(K.tile.getState().paletteOffset, null,
    'an imported palette has no offset: the one of the palette loaded before must be dropped');
  t.assertEqual(K.tile.getState().paletteName, 'imported', 'and the palette says where it came from');

  t.assertEqual(K.tile.writePaletteColour(0, { r: 1, g: 2, b: 3 }), false, 'the colour edit has to be refused');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [],
    'not one byte written: not at the old palette offset, not anywhere');
  t.assert(K.tile.getState().status.indexOf('offset') >= 0, 'and the status should say why: ' + K.tile.getState().status);

  t.assertEqual(K.tile.applyHex('11 22 33 44', 'palette-rom'), 0,
    'the hex paste aimed at the palette offset is refused for the same reason');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'and writes nothing either');
});

suite.test('a palette read from the rom writes exactly the two bytes of the entry that was edited', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();

  const pal = K.tile.loadPalette(PALETTE_AT);
  t.assert(pal, 'the palette should load from a real offset');
  t.assertEqual(pal.length, 16, 'sixteen colours come out of the rom');

  t.assertEqual(K.tile.writePaletteColour(0, { r: 255, g: 255, b: 255 }), true,
    'with an offset from the rom a colour edit is written');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [PALETTE_AT, PALETTE_AT + 1],
    'exactly the two bytes of entry 0');
  t.assertEqual(K.hex.getPatchedBytes()[PALETTE_AT], 0xFF, 'BGR555 low byte first');
  t.assertEqual(K.hex.getPatchedBytes()[PALETTE_AT + 1], 0x7F, 'then the high byte');
  t.assertEqual(K.tile.getState().palette[0].r, 255, 'and the editor holds the colour that was written');
});

module.exports = { suite: suite };
