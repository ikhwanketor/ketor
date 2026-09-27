/* Copy and paste of a tile region: Ctrl+C / Ctrl+V on the canvas, and the two toolbar
   buttons for anyone who does not use the shortcut.

   A copied region is data in the store - { w, h, cols, pixels } - not text, and a paste
   writes it back through setPixel, which is the one path a byte takes into the Hex Editor
   patch layer. The gates below are byte for byte: a pattern is painted into one tile,
   copied, pasted into another tile, and the whole 0x40000 byte image is compared with the
   loaded file, so a paste that spills a single byte outside its destination fails here.
   The keystrokes go to the tab root handler the way a browser delivers them, once with the
   canvas as the target and once with a text field, and the window is watched while the
   modules load to prove the shortcut added no global listener: it rides the handler the tab
   already had. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-clipboard');

const REGION = 0x100;
const TILE_BYTES = 32;
const ROM_SIZE = 0x40000;

/* The pattern painted into a source tile: colour 0..7 on every pixel, so no nibble of a
   painted byte is the 0xA the fixture fills the region with and every byte of a pasted
   tile is a real change. */
function pattern(x, y) { return (x + y) % 8; }

/* The 4bpp byte a pixel belongs to: two pixels to a byte, x even in the low nibble. */
function byteAt(x, y) { return y * 4 + (x >> 1); }

/* The byte two pixels of the pattern make, the way core/tile-codec.js encodes them. */
function encodedByte(x, y) { return pattern(x, y) | (pattern(x + 1, y) << 4); }

function openSheet() {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(REGION);
  env.K.tile.setFormat('gba-4bpp');
  return env;
}

/* Paint one tile the way a user paints it: through setPixel, the hex patch layer. */
function paintTile(K, tile) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) K.tile.setPixel(tile, x, y, pattern(x, y));
}

/* Every offset whose byte differs, so a case can say "exactly these" instead of trusting
   a spot check that never looks at the other 262143 bytes. */
function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  }
  return out;
}

/* Every byte of one tile of the sheet, in address order. */
function tileOffsets(tile) {
  const out = [];
  for (let i = 0; i < TILE_BYTES; i++) out.push(REGION + tile * TILE_BYTES + i);
  return out;
}

function tilePixels(K, tile) {
  const out = [];
  const px = K.tile.readTile(tile);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(px[y][x]);
  return out;
}

function patternPixels() {
  const out = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(pattern(x, y));
  return out;
}

/* The tab root: the one handler the shortcuts hang off. It is the element the tab renders,
   so this is the handler a keydown inside the tab reaches. */
function rootHandler(env) { return env.K.ui.tabProviders.tile().props.onKeyDown; }

/* What the handler is handed as an event target. It reads the tag name and the
   contenteditable flag, which is what a browser puts on the element that has the focus. */
function element(tag, editable) { return { tagName: tag, isContentEditable: !!editable }; }

function press(handler, key, target, modifier) {
  const ev = { key: key, target: target, prevented: 0 };
  ev.preventDefault = function () { ev.prevented++; };
  if (modifier === 'meta') ev.metaKey = true; else if (modifier !== 'none') ev.ctrlKey = true;
  handler(ev);
  return ev;
}

/* The Copy and Paste buttons of the rendered tab, by the label they show. */
function buttons(env) {
  const found = {};
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'button') {
      const label = typeof node.props.children === 'string' ? node.props.children : '';
      if (label === 'Copy' || label === 'Paste') found[label.toLowerCase()] = node;
    }
    walk(node.props && node.props.children);
  })(env.K.ui.tabProviders.tile());
  return found;
}

/* The workbench with the window watched from before the first module is loaded, so the
   listeners a module installs can be named. The tile module is left out of one run, which
   is what makes "new listener" mean something. */
function watchedLoad(loadTile) {
  const calls = [];
  const env = loadWorkbench({
    loadTile: loadTile,
    beforeLoad: function (win) {
      const addWindow = win.addEventListener;
      win.addEventListener = function (type) { calls.push('window:' + type); return addWindow.apply(win, arguments); };
      const addDocument = win.document.addEventListener;
      win.document.addEventListener = function (type) { calls.push('document:' + type); return addDocument.apply(win.document, arguments); };
    }
  });
  return { env: env, calls: calls };
}

function keyboardCalls(calls) {
  return calls.filter(function (c) { return /:(key|keydown|keypress|keyup)$/.test(c); });
}

suite.test('a copy puts the tile box in the store as data and writes no byte', function (t) {
  const env = openSheet();
  const K = env.K;
  paintTile(K, 5);
  const beforeCopy = K.hex.getPatchedBytes();

  t.assertEqual(K.tile.copyRegion(5), true, 'copying a tile that fits the window should report success');
  const clip = K.tile.getState().clipboard;
  t.assert(clip && typeof clip === 'object' && !Array.isArray(clip), 'the clipboard should be a structure, not text');
  t.assertEqual(clip.w, 8, 'the box is 8 pixels wide');
  t.assertEqual(clip.h, 8, 'and 8 pixels tall');
  t.assertEqual(clip.cols, 8, 'with 8 pixels to a row');
  t.assertEqual(clip.tile, 5, 'and it remembers the tile it came from');
  t.assert(Array.isArray(clip.pixels), 'the pixels are stored as a flat array');
  t.assertEqual(clip.pixels.length, 64, 'one entry per pixel of the tile');
  t.assertEqual(clip.pixels[3 * clip.cols + 2], pattern(2, 3), 'a pixel sits at row * cols + column');
  t.assertDeepEqual(diffOffsets(beforeCopy, K.hex.getPatchedBytes()), [],
    'copying is not an edit: not one byte of the rom moved');
});

suite.test('a paste writes the copied pattern into another tile, byte for byte', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  paintTile(K, 5);
  K.tile.copyRegion(5);

  t.assertEqual(K.tile.pasteRegion(9), true, 'the paste should report writes');
  const patched = K.hex.getPatchedBytes();
  t.assertDeepEqual(diffOffsets(source, patched), tileOffsets(5).concat(tileOffsets(9)),
    'all 0x40000 bytes differ in the two tiles and nowhere else');

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x += 2) {
      t.assertEqual(patched[REGION + 9 * TILE_BYTES + byteAt(x, y)], encodedByte(x, y),
        'destination byte y*4 + (x>>1) should hold the copied nibbles of (' + x + ',' + y + ')');
    }
  }
  t.assertDeepEqual(tilePixels(K, 9), patternPixels(), 'the destination tile reads back as the pattern');
  t.assertDeepEqual(tilePixels(K, 5), patternPixels(), 'and the tile it came from is untouched');
  t.assertEqual(K.hex.isPatched(REGION + 9 * TILE_BYTES), true, 'the destination byte is a hex patch now');
  t.assertEqual(source[REGION + 9 * TILE_BYTES], 0xAA, 'the loaded file still holds its own 0xAA');
});

suite.test('a paste with nothing copied says so and writes nothing', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();

  t.assertEqual(K.tile.getState().clipboard, null, 'the editor starts with an empty clipboard');
  t.assertEqual(K.tile.pasteRegion(9), false, 'pasting nothing reports no write');
  t.assert(K.tile.getState().status.indexOf('Copy a tile first') >= 0,
    'and the status asks for a copy, got: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'no byte of the rom was written');
});

suite.test('a paste onto the tile it was copied from changes nothing', function (t) {
  const env = openSheet();
  const K = env.K;
  paintTile(K, 5);
  K.tile.copyRegion(5);
  const before = K.hex.getPatchedBytes();

  t.assertEqual(K.tile.pasteRegion(5), false, 'every pixel of the tile already has the copied colour');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'so the patch layer did not move');
});

suite.test('Ctrl+C and Ctrl+V on the canvas copy and paste the region under the hex cursor', function (t) {
  const env = openSheet();
  const K = env.K;
  paintTile(K, 5);
  const source = K.hex.getSourceBytes();

  K.hex.gotoOffset(REGION + 5 * TILE_BYTES);
  const handler = rootHandler(env);
  const copy = press(handler, 'c', element('CANVAS'));
  t.assertEqual(copy.prevented, 1, 'Ctrl+C on the canvas belongs to the tab');
  const clip = K.tile.getState().clipboard;
  t.assert(clip, 'Ctrl+C should have filled the clipboard');
  t.assertEqual(clip.tile, 5, 'with the tile the hex cursor sits on');

  K.hex.gotoOffset(REGION + 9 * TILE_BYTES);
  const paste = press(handler, 'v', element('CANVAS'));
  t.assertEqual(paste.prevented, 1, 'Ctrl+V on the canvas belongs to the tab');
  t.assertEqual(K.tile.getState().clipboard, clip, 'and it pastes the clipboard that was filled');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileOffsets(5).concat(tileOffsets(9)),
    'Ctrl+V has to paste; picking the Select tool instead would leave the rom untouched');

  K.hex.gotoOffset(REGION + 10 * TILE_BYTES);
  const meta = press(handler, 'v', element('CANVAS'), 'meta');
  t.assertEqual(meta.prevented, 1, 'Cmd+V is the same shortcut on a Mac');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(5).concat(tileOffsets(9), tileOffsets(10)), 'and it pasted the third tile too');
});

suite.test('a keystroke in a text field or a rich text surface is left alone', function (t) {
  const env = openSheet();
  const K = env.K;
  paintTile(K, 5);
  K.tile.copyRegion(5);
  const clip = K.tile.getState().clipboard;
  const before = K.hex.getPatchedBytes();
  const handler = rootHandler(env);

  ['INPUT', 'TEXTAREA', 'SELECT'].forEach(function (tag) {
    const copy = press(handler, 'c', element(tag));
    t.assertEqual(copy.prevented, 0, 'Ctrl+C in a ' + tag + ' is the field\'s own copy, not the tab\'s');
    const paste = press(handler, 'v', element(tag));
    t.assertEqual(paste.prevented, 0, 'Ctrl+V in a ' + tag + ' is the field\'s own paste');
  });

  const richCopy = press(handler, 'c', element('DIV', true));
  t.assertEqual(richCopy.prevented, 0, 'Ctrl+C in a contenteditable surface is left to that surface');
  const richPaste = press(handler, 'v', element('DIV', true));
  t.assertEqual(richPaste.prevented, 0, 'and so is Ctrl+V');

  t.assertEqual(K.tile.getState().clipboard, clip, 'none of those keystrokes replaced the clipboard');
  t.assertDeepEqual(tilePixels(K, 9), (function () {
    const out = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(0xA);
    return out;
  })(), 'and none of them pasted into the sheet');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'the rom is exactly as it was');
});

suite.test('the shortcut adds no global keyboard listener: the tab root keeps it', function (t) {
  const baseline = watchedLoad(false);
  const loaded = watchedLoad(true);

  t.assertDeepEqual(keyboardCalls(baseline.calls), [],
    'no module should install a keyboard listener on the window, got: ' + JSON.stringify(baseline.calls));
  t.assertDeepEqual(keyboardCalls(loaded.calls), keyboardCalls(baseline.calls),
    'loading the tile module must not add one either');
  t.assert(loaded.calls.length > baseline.calls.length, 'the spy should see the tile module load');
  const added = loaded.calls.slice(baseline.calls.length);
  t.assertDeepEqual(added, ['window:ketor:rom-loaded'],
    'the tile module registers the rom loaded event and nothing else, got: ' + JSON.stringify(added));
});

suite.test('the Copy and Paste buttons call the same two functions as the shortcut', function (t) {
  const env = openSheet();
  const K = env.K;
  paintTile(K, 5);
  const source = K.hex.getSourceBytes();
  K.hex.gotoOffset(REGION + 5 * TILE_BYTES);

  const first = buttons(env);
  t.assert(first.copy && first.paste, 'the toolbar should offer a Copy and a Paste button');
  t.assertEqual(first.copy.props.disabled, false, 'Copy is live while a tile region is open');
  t.assertEqual(first.paste.props.disabled, true, 'Paste has nothing to paste yet');

  first.copy.props.onClick();
  t.assert(K.tile.getState().clipboard, 'the Copy button filled the clipboard');
  t.assertEqual(K.tile.getState().clipboard.tile, 5, 'from the tile the hex cursor sits on');

  const second = buttons(env);
  t.assertEqual(second.paste.props.disabled, false, 'Paste is live once something was copied');
  K.hex.gotoOffset(REGION + 9 * TILE_BYTES);
  second.paste.props.onClick();
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileOffsets(5).concat(tileOffsets(9)),
    'the Paste button wrote the destination tile and nothing else');
});

module.exports = { suite: suite };
