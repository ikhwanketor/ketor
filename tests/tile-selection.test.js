/* The tile range the Select tool drags out: Ctrl+C copies the whole block of tiles and not
   only the one tile under the cursor, and Ctrl+V puts it back down tile by tile.

   The range is data in the store - { tile, w, h } in tiles, the anchor first - and the
   clipboard it fills is the same { w, h, cols, pixels } structure a single tile copy uses,
   only wider: the pixels in reading order with cols the length of one row. The gates below
   are byte for byte: a 2x2 block of tiles is painted, copied and pasted four tiles along,
   and the whole 0x40000 byte image is compared with the loaded file, so a paste that spills
   a byte outside its destination fails here. The 8x8 case is compared with the box the
   editor had before ranges existed, because it has to keep writing the same bytes in the
   same order, and a sheet that ends inside a tile proves a paste cuts such a tile instead of
   writing half of it. The keystrokes go to the tab root handler the way a browser delivers
   them, once with a text field as the target and once with the canvas, and the window is
   watched while the modules load to prove the range added no global listener: it rides the
   handler the tab already had. The marker and the drag are driven through a canvas that
   records what it is asked to draw, because the dashed box is the only thing that tells the
   user how far the next copy reaches. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-selection');

const REGION = 0x100;
const TILE_BYTES = 32;
const ROM_SIZE = 0x40000;
/* A sheet whose last byte falls one byte inside its third tile: tile 0 and tile 1 are whole,
   tile 2 is in the window by that one byte and may not be written at all. */
const END_REGION = ROM_SIZE - 65;

/* The pattern painted into a tile: colour (x + y + variant) % 8 on every pixel. The variant
   lets one tile of a block tell itself from the next, and no nibble is ever the 0xA the
   fixture fills the region with, so every byte of a painted tile is a real change. */
function pattern(x, y, variant) { return (x + y + (variant || 0)) % 8; }

/* The 4bpp byte a pixel belongs to: two pixels to a byte, x even in the low nibble. */
function byteAt(x, y) { return y * 4 + (x >> 1); }

/* The byte two pixels of the pattern make, the way core/tile-codec.js encodes them. */
function encodedByte(x, y, variant) { return pattern(x, y, variant) | (pattern(x + 1, y, variant) << 4); }

function openSheet(region) {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(region === undefined ? REGION : region);
  env.K.tile.setFormat('gba-4bpp');
  return env;
}

/* Paint one tile the way a user paints it: through setPixel, the hex patch layer. */
function paintTile(K, tile, variant) {
  const v = variant === undefined ? tile : variant;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) K.tile.setPixel(tile, x, y, pattern(x, y, v));
}

/* Every offset whose byte differs, so a case can say "exactly these" instead of trusting a
   spot check that never looks at the other 262143 bytes. */
function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  }
  return out;
}

/* Every byte of one tile of a sheet, in address order. */
function tileOffsets(tile, region) {
  const at = region === undefined ? REGION : region;
  const out = [];
  for (let i = 0; i < TILE_BYTES; i++) out.push(at + tile * TILE_BYTES + i);
  return out;
}

function tilePixels(K, tile) {
  const out = [];
  const px = K.tile.readTile(tile);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(px[y][x]);
  return out;
}

/* The tab root: the one handler the shortcuts hang off, so this is the handler a keydown
   inside the tab reaches. */
function rootHandler(env) { return env.K.ui.tabProviders.tile().props.onKeyDown; }

/* What the handler is handed as an event target: it reads the tag name and the
   contenteditable flag, which is what a browser puts on the element that has the focus. */
function element(tag, editable) { return { tagName: tag, isContentEditable: !!editable }; }

function press(handler, key, target, modifier) {
  const ev = { key: key, target: target, prevented: 0 };
  ev.preventDefault = function () { ev.prevented++; };
  if (modifier === 'meta') ev.metaKey = true; else if (modifier !== 'none') ev.ctrlKey = true;
  handler(ev);
  return ev;
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

/* ---------- a workbench with a canvas that records what it is asked to draw ---------- */

/* The element the tab hands React for the sheet canvas: the one node that carries the
   range as a prop, which is also where the mouse handlers the canvas calls live. */
function canvasElement(tree) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props && node.props.selection !== undefined) { found = node; return; }
    walk(node.props && node.props.children);
  })(tree);
  return found;
}

/* A button of the rendered tab, by the label it shows. */
function button(tree, label) {
  let found = null;
  (function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'button' && node.props && node.props.children === label) { found = node; return; }
    walk(node.props && node.props.children);
  })(tree);
  return found;
}

function hasRect(drawn, x, y, w, h) {
  return drawn.rects.some(function (r) { return r[0] === x && r[1] === y && r[2] === w && r[3] === h; });
}

/* The workbench the marker and the drag are driven through. Three things are stubbed that
   the plain helper leaves alone:

   - state: the workbench renders a component by calling it, so a hook that keeps its value
     between two renders is a counter plus a list. The Select tool is local state of the tab
     and a test that drags a range has to be able to pick it the way the toolbar does.
   - the sheet canvas: this harness has no canvas, so the ref React would fill is pointed at
     a recording object and the drawing effect is run by hand, which is the code path a
     browser runs on mount.
   - the sheet arithmetic: core/canvas-math.js turns a click into a tile and the workbench page
     loads it before the activity, so a mouse event here means the same thing it means there. */
function loadedEnv() {
  const drawn = { rects: [], dashes: [], used: false };
  drawn.reset = function () { drawn.rects.length = 0; drawn.dashes.length = 0; };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '',
    fillRect: function () {},
    strokeRect: function (x, y, w, h) { drawn.rects.push([x, y, w, h]); },
    setLineDash: function (d) { drawn.dashes.push(d.slice()); },
    measureText: function (text) { return { width: String(text).length * 6 }; },
    fillText: function () {}, stroke: function () {}
  };
  const canvas = { width: 0, height: 0, getContext: function () { drawn.used = true; return ctx; } };
  const cells = [];
  let at = 0;
  const effects = [], effectDeps = [];
  const env = loadWorkbench({
    loadTile: false,
    beforeLoad: function (win) {
      win.React.useState = function (initial) {
        const index = at++;
        if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
        return [cells[index], function (next) { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }];
      };
      win.React.useEffect = function (fn, deps) { effects.push(fn); effectDeps.push(deps || null); };
      const create = win.React.createElement;
      win.React.createElement = function (type, props) {
        const node = create.apply(null, arguments);
        if (type === 'canvas' && node.props && node.props.ref) node.props.ref.current = canvas;
        return node;
      };
    }
  });
  const load = function (file) { vm.runInNewContext(fs.readFileSync(file, 'utf8'), env.win, { filename: file }); };
  load(path.join(env.REPO, 'app', 'assets', 'js', 'ui', 'ketor-tile-activity.js'));
  load(path.join(env.REPO, 'app', 'assets', 'js', 'core', 'canvas-math.js'));
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(REGION);
  env.K.tile.setFormat('gba-4bpp');
  return {
    env: env, drawn: drawn, effects: effects, effectDeps: effectDeps,
    /* One render: the hook counter starts again and only the effects of this render are
       kept, so running them by hand draws the props of this render and no older ones. */
    render: function () {
      at = 0;
      effects.length = 0;
      effectDeps.length = 0;
      return env.K.ui.tabProviders.tile();
    }
  };
}

/* Render the tab, render the sheet canvas it asks for and run the effects of that render,
   which is what a browser does on mount: the sheet is drawn into the recording canvas and
   the range is marked on it. The canvas component is not a provider, so the tab's tree is
   asked for its element and that element's own function is called, exactly as React would. */
function drawSheet(made) {
  const tree = made.render();
  const node = canvasElement(tree);
  if (node && typeof node.type === 'function') node.type(node.props);
  made.effects.forEach(function (fn) {
    try { fn(); } catch (error) { /* an effect that needs more than this canvas is not this case */ }
  });
  return tree;
}

/* Pick the Select tool through the toolbar button, the way a user does: the stub above
   keeps the state, so the next render draws the tab with that tool and the mouse handlers
   fetched after it are the ones that drag a range. */
function pickSelectTool(made) {
  const node = button(made.render(), 'Select');
  if (!node) throw new Error('the toolbar should offer a Select button');
  node.props.onClick();
  return canvasElement(made.render());
}

/* A mouse event on the sheet canvas. The rect starts at 0,0 and every tile is 8 pixels at
   the default zoom of 2, so a tile slot is a point the tab's arithmetic can name. */
function mouse(handler, x, y) {
  const ev = {
    clientX: x, clientY: y, button: 0, ctrlKey: false,
    currentTarget: { getBoundingClientRect: function () { return { left: 0, top: 0 }; } }
  };
  ev.preventDefault = function () {};
  handler(ev);
  return ev;
}

/* Where the middle of a tile slot sits on the sheet at this width and zoom: 49 tiles to a
   screen row of 784 pixels, 16 pixels a tile. */
function tilePoint(slot) { return { x: (slot % 49) * 16 + 8, y: Math.floor(slot / 49) * 16 + 8 }; }

/* ---------- the range in the store ---------- */

suite.test('the range lives in the store and no range is the default', function (t) {
  const env = openSheet();
  const K = env.K;

  t.assertEqual(K.tile.getState().selection, null,
    'the editor starts with no range at all, so a copy still takes the one tile it always did');
  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 2, h: 2 },
    'the range the caller named is the range the store holds');
  K.tile.clearSelection();
  t.assertEqual(K.tile.getState().selection, null, 'clearing it takes the range away again');

  K.tile.setSelection(null);
  t.assertEqual(K.tile.getState().selection, null, 'and nothing is the same call as no range');
  K.tile.setSelection({ w: 2, h: 2 });
  t.assertEqual(K.tile.getState().selection, null, 'a range without an anchor tile is no range');
  K.tile.setSelection({ tile: -1, w: 2, h: 2 });
  t.assertEqual(K.tile.getState().selection, null, 'and neither is one that starts before the sheet');
  K.tile.setSelection({ tile: 3, w: 0, h: -2 });
  t.assertDeepEqual(K.tile.getState().selection, { tile: 3, w: 1, h: 1 },
    'a size under one tile is one tile, never a block that reads nothing');
  K.tile.setSelection({ tile: 4.7, w: 2.9, h: 2.9 });
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 2, h: 2 }, 'a size is whole tiles only');
  K.tile.setSelection({ tile: 4, w: 1000, h: 1000 });
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 128, h: 128 },
    'a block never claims more tiles than the sheet holds');
  K.tile.clearSelection();
});

/* ---------- the block ---------- */

suite.test('a copy takes the whole block and a paste puts it down tile by tile', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  [4, 5, 6, 7].forEach(function (tile) { paintTile(K, tile); });
  const blocks = [4, 5, 6, 7].map(function (tile) { return tilePixels(K, tile); });
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(4).concat(tileOffsets(5), tileOffsets(6), tileOffsets(7)),
    'the four tiles of the block are painted before anything is copied');

  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  t.assertEqual(K.tile.copyRegion(9), true,
    'the copy reports a region even when the caller names another tile: the range decides');
  const clip = K.tile.getState().clipboard;
  t.assert(clip && typeof clip === 'object' && !Array.isArray(clip), 'the clipboard is the same structure as ever');
  t.assertEqual(clip.w, 16, 'two tiles to a clipboard row make a box 16 pixels wide');
  t.assertEqual(clip.h, 16, 'and two rows of tiles make it 16 pixels tall');
  t.assertEqual(clip.cols, 16, 'with 16 pixels to a row');
  t.assertEqual(clip.tile, 4, 'the clip remembers the anchor of the range, not the tile the caller named');
  t.assertEqual(clip.pixels.length, 256, 'one entry per pixel of the four tiles');
  t.assertEqual(clip.pixels[3 * 16 + 2], blocks[0][3 * 8 + 2], 'the first tile of the row is the first tile of the clip');
  t.assertEqual(clip.pixels[3 * 16 + 10], blocks[1][3 * 8 + 2], 'the tenth column of the clip is the second tile of the row');
  t.assertEqual(clip.pixels[11 * 16 + 2], blocks[2][3 * 8 + 2], 'and the ninth row of the clip is the second row of tiles');
  t.assertEqual(clip.pixels[11 * 16 + 10], blocks[3][3 * 8 + 2], 'both corners of the block are in the clip');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(4).concat(tileOffsets(5), tileOffsets(6), tileOffsets(7)),
    'copying is not an edit: not one byte of the rom moved');

  t.assertEqual(K.tile.pasteRegion(20), true, 'the paste should report writes');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(4).concat(tileOffsets(5), tileOffsets(6), tileOffsets(7),
      tileOffsets(20), tileOffsets(21), tileOffsets(22), tileOffsets(23)),
    'all 0x40000 bytes differ in the four tiles of the block and the four it was pasted into, and nowhere else');
  [[20, 0], [21, 1], [22, 2], [23, 3]].forEach(function (pair) {
    t.assertDeepEqual(tilePixels(K, pair[0]), blocks[pair[1]],
      'destination tile ' + pair[0] + ' reads back as source tile ' + [4, 5, 6, 7][pair[1]]);
  });
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 20 * TILE_BYTES + byteAt(2, 3)], encodedByte(2, 3, 4),
    'the byte of the first destination tile holds the copied nibbles of (2,3)');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 23 * TILE_BYTES + byteAt(6, 5)], encodedByte(6, 5, 7),
    'and the last destination tile holds its own corner of the block');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 24 * TILE_BYTES], 0xAA,
    'the tile after the block still holds the loaded file');
});

suite.test('a paste cuts a tile the window does not hold instead of writing half of it', function (t) {
  const env = openSheet(END_REGION);
  const K = env.K;
  const source = K.hex.getSourceBytes();
  paintTile(K, 0, 0);
  t.assertEqual(K.tile.copyRegion(0), true, 'the first tile of the sheet copies');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileOffsets(0, END_REGION),
    'the painted tile is the only change so far');

  t.assertEqual(K.tile.pasteRegion(1), true, 'tile 1 is wholly inside the window and takes the copy');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(0, END_REGION).concat(tileOffsets(1, END_REGION)),
    'the whole 0x40000 image differs in the two whole tiles of the sheet and nowhere else');

  const afterPaste = K.hex.getPatchedBytes();
  t.assertEqual(K.tile.pasteRegion(2), false,
    'tile 2 is not wholly inside the window, so no pixel of it may be written');
  t.assertDeepEqual(diffOffsets(afterPaste, K.hex.getPatchedBytes()), [],
    'not one byte of the rom moved: the single byte of tile 2 the window does hold stays as it was');
  t.assertEqual(K.hex.isPatched(END_REGION + 2 * TILE_BYTES), false, 'it is not even a patch');
  t.assert(K.tile.getState().status.indexOf('outside the window') >= 0,
    'and the status says the tile was cut, got: ' + K.tile.getState().status);
});

/* ---------- the single tile box the editor had before ranges ---------- */

suite.test('without a range the copy is one tile, and a 1x1 range is that same box', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  paintTile(K, 5, 5);

  t.assertEqual(K.tile.copyRegion(5), true, 'a copy with no range reads the tile it is given');
  const one = K.tile.getState().clipboard;
  t.assertEqual(one.w, 8, 'the box is 8 pixels wide');
  t.assertEqual(one.h, 8, 'and 8 pixels tall');
  t.assertEqual(one.cols, 8, 'with 8 pixels to a row');
  t.assertEqual(one.tile, 5, 'and it remembers the tile it came from');
  t.assertEqual(one.pixels.length, 64, 'one entry per pixel of the tile');
  t.assertEqual(one.pixels[3 * 8 + 2], pattern(2, 3, 5), 'a pixel sits at row * cols + column');
  t.assertEqual(K.tile.pasteRegion(9), true, 'the paste writes the copied tile');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileOffsets(5).concat(tileOffsets(9)),
    'all 0x40000 bytes differ in the two tiles and nowhere else');
  t.assertDeepEqual(tilePixels(K, 9), tilePixels(K, 5), 'and the destination reads back as the source');

  t.assertEqual(K.tile.getState().selection, null, 'the store still holds no range');
  K.tile.setSelection({ tile: 5, w: 1, h: 1 });
  t.assertEqual(K.tile.copyRegion(5), true, 'a one tile range copies too');
  t.assertDeepEqual(K.tile.getState().clipboard, one,
    'and it is byte for byte the box a copy without a range makes');
  t.assertEqual(K.tile.pasteRegion(10), true, 'a paste from it writes');
  t.assertDeepEqual(tilePixels(K, 10), tilePixels(K, 5), 'the same pixels in the next tile');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 10 * TILE_BYTES + byteAt(4, 6)], encodedByte(4, 6, 5),
    'through the same encoding the single tile paste always used');
});

/* ---------- the shortcut ---------- */

suite.test('Ctrl+C in a text field keeps its own copy; on the canvas it copies the whole range', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  [4, 5, 6, 7].forEach(function (tile) { paintTile(K, tile); });
  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  K.tile.copyRegion(4);
  const clip = K.tile.getState().clipboard;
  const before = K.hex.getPatchedBytes();
  const handler = rootHandler(env);

  ['INPUT', 'TEXTAREA', 'SELECT'].forEach(function (tag) {
    const copy = press(handler, 'c', element(tag));
    t.assertEqual(copy.prevented, 0, 'Ctrl+C in a ' + tag + ' is the field\'s own copy, not the tab\'s');
    const paste = press(handler, 'v', element(tag));
    t.assertEqual(paste.prevented, 0, 'and Ctrl+V belongs to the field too, even with a range in the store');
  });
  t.assert(K.tile.getState().clipboard === clip, 'none of those keystrokes replaced the clipboard');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and not one byte of the rom moved');

  K.hex.gotoOffset(REGION + 9 * TILE_BYTES);
  const canvas = press(handler, 'c', element('CANVAS'));
  t.assertEqual(canvas.prevented, 1, 'Ctrl+C on the canvas belongs to the tab');
  const block = K.tile.getState().clipboard;
  t.assert(block !== clip, 'and it fills the clipboard with the range again');
  t.assertEqual(block.w, 16, '16 pixels to a row');
  t.assertEqual(block.h, 16, 'two rows of tiles');
  t.assertEqual(block.tile, 4, 'anchored at the tile the range starts on, not at the hex cursor');
  t.assertDeepEqual(block.pixels, clip.pixels, 'and the pixels are the ones the range holds');

  const paste = press(handler, 'v', element('CANVAS'));
  t.assertEqual(paste.prevented, 1, 'Ctrl+V on the canvas pastes it');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileOffsets(4).concat(tileOffsets(5), tileOffsets(6), tileOffsets(7),
      tileOffsets(9), tileOffsets(10), tileOffsets(11), tileOffsets(12)),
    'the four tiles of the block and the four the hex cursor named, and nothing else');

  const escape = press(handler, 'Escape', element('CANVAS'), 'none');
  t.assertEqual(escape.prevented, 0, 'Escape is not the tab\'s to prevent');
  t.assertEqual(K.tile.getState().selection, null, 'but it clears the range');
  t.assertEqual(K.tile.getState().clipboard, block, 'and leaves the clipboard alone');
  K.hex.gotoOffset(REGION + 20 * TILE_BYTES);
  press(handler, 'c', element('CANVAS'));
  t.assertEqual(K.tile.getState().clipboard.w, 8, 'with no range, Ctrl+C is the one tile box again');
  t.assertEqual(K.tile.getState().clipboard.tile, 20, 'of the tile the hex cursor sits on');
});

suite.test('the range adds no global keyboard listener: the tab root keeps it', function (t) {
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

/* ---------- the marker and the drag ---------- */

suite.test('the range is handed to the canvas and marked with a dashed box per screen row', function (t) {
  const made = loadedEnv();
  const K = made.env.K;

  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  const tree = drawSheet(made);
  t.assertEqual(made.drawn.used, true, 'the sheet canvas should be drawn into');
  t.assertDeepEqual(made.drawn.dashes[0], [4, 2], 'the range is marked with the dash the marker asks for');
  t.assert(hasRect(made.drawn, 64.5, 0.5, 63, 15),
    'a 2x2 block at tile 4 is one dashed box 16 pixels wide, got: ' + JSON.stringify(made.drawn.rects.slice(-6)));
  const node = canvasElement(tree);
  t.assertDeepEqual(node.props.selection, { tile: 4, w: 2, h: 2 },
    'the canvas is handed the range the store holds');
  t.assert(made.effectDeps.some(function (d) { return d && d.indexOf(node.props.selection) >= 0; }),
    'and the range is in the dependency list of the drawing effect, so a new range redraws the sheet');

  K.tile.clearSelection();
  made.drawn.reset();
  const plain = drawSheet(made);
  t.assertDeepEqual(made.drawn.dashes, [], 'with no range nothing is dashed');
  t.assert(!hasRect(made.drawn, 64.5, 0.5, 63, 15), 'and no range box is drawn');
  t.assertEqual(canvasElement(plain).props.selection, null, 'the canvas is handed no range at all');

  /* A range that runs past the right edge of a screen row - 49 tiles at this width and zoom
     - is cut into one box per row instead of one box over the gap between the rows. */
  K.tile.setSelection({ tile: 48, w: 3, h: 1 });
  made.drawn.reset();
  drawSheet(made);
  t.assert(hasRect(made.drawn, 768.5, 0.5, 15, 15),
    'the last tile of the row is a box of its own, got: ' + JSON.stringify(made.drawn.rects.slice(-6)));
  t.assert(hasRect(made.drawn, 0.5, 16.5, 31, 15), 'and the two tiles past the edge are the next row\'s box');
  t.assertDeepEqual(made.drawn.dashes, [[4, 2], []], 'the dash is set for the range and put back afterwards');
});

suite.test('the Select tool drags a range out of the sheet and Escape clears it', function (t) {
  const made = loadedEnv();
  const env = made.env;
  const K = env.K;
  const canvas = pickSelectTool(made);
  t.assert(canvas, 'the tab should draw the sheet canvas');
  const down = canvas.props.onClick, move = canvas.props.onMove, up = canvas.props.onUp;

  const a = tilePoint(4), b = tilePoint(8), c = tilePoint(2);
  mouse(down, a.x, a.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 1, h: 1 },
    'the tile the mouse goes down on is the anchor of a one tile range');
  mouse(move, b.x, b.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 5, h: 1 },
    'dragging four tiles along the row makes a five tile block');
  mouse(move, c.x, c.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 2, w: 3, h: 1 },
    'dragging back past the anchor puts the anchor at the other end of the run');
  mouse(up, c.x, c.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 2, w: 3, h: 1 }, 'letting go keeps the range');

  /* One screen row holds 49 tiles, so tile 53 is the tile of the second screen row under
     tile 4. Batch 167 made the Select tool drag a 2D marquee, so that drag is the rectangle
     of cells it really is - one column, two rows - and not the run of 49 tiles to a clipboard
     row batch 165 counted for a drag that left the anchor's screen row. */
  const d = tilePoint(4), e2 = tilePoint(53);
  mouse(down, d.x, d.y);
  mouse(move, e2.x, e2.y);
  t.assertDeepEqual(K.tile.getState().selection, { col: 4, row: 0, cols: 1, rows: 2, tile: 4 },
    'a drag into another screen row is the rectangle of cells between the two corners, not a run');
  mouse(up, e2.x, e2.y);

  press(rootHandler(env), 'Escape', element('CANVAS'), 'none');
  t.assertEqual(K.tile.getState().selection, null, 'Escape clears the range the tool dragged out');
});

module.exports = { suite: suite };
