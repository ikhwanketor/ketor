/* The 2D marquee the Select tool drags out of the sheet: the block is a rectangle of cells of
   the sheet grid - cols tiles across and rows tiles down - and not the run of w*h tiles batch
   165 counted from an anchor tile. The two shapes live side by side in the store, because the
   batch that added the rectangle may not take the run away: setSelection({ tile, w, h }) still
   hands over a run, a drag that stays inside one screen row still is one, and both are read
   back byte for byte.

   The gates below are byte for byte, the way the tile suites always are. A 2x2 run is painted,
   copied and pasted four tiles along, and the whole 0x40000 byte image is compared with the
   loaded file, so the rectangle cannot quietly change what an old range does. Then a marquee
   of three cells across and two down is copied out of a sixteen tile row: the clipboard is 24
   pixels wide and 16 tall, the pixels come out block row by block row - the second row of the
   block is the tile sixteen tiles below the first, not the tile after the third - and a paste
   at another cell writes exactly the six destination tiles the block names, each reading back
   as its source tile. A paste that reaches past the end of the window cuts a tile it cannot
   hold whole instead of writing half of it, and a block whose cells are all outside writes
   nothing at all.

   The Select tool's drag is driven through a canvas that records what it is asked to draw, at
   a zoom where one screen row holds sixteen tiles, so the cells a drag names can be counted by
   hand: a diagonal drag is a rectangle, a drag along one row is the run it always was, and a
   drag back past the anchor puts the first cell of the block at the other corner. The marker
   is checked on the same canvas - one dashed box per block row, cut where the row of the sheet
   ends - and the keystrokes go to the tab root handler the way a browser delivers them, once
   with a text field as the target and once with the canvas. The window is watched while the
   modules load to prove the marquee added no global keyboard listener: it rides the handler
   the tab already had. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-marquee');

const REGION = 0x100;
const TILE_BYTES = 32;
const ROM_SIZE = 0x40000;
/* A row of sixteen tiles, which is what the canvas draws at zoom 6 and what the tests below
   count cells with. */
const GRID = 16;
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

/* The bytes of a list of tiles, in address order: diffOffsets reports addresses, not the
   order the tiles were painted in. */
function tileListOffsets(tiles, region) {
  const out = [];
  tiles.forEach(function (tile) {
    tileOffsets(tile, region).forEach(function (off) { out.push(off); });
  });
  out.sort(function (a, b) { return a - b; });
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
   listeners a module installs can be named. The tile module is left out of one run, which is
   what makes "new listener" mean something. */
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

/* The element the tab hands React for the sheet canvas: the one node that carries the block
   as a prop, which is also where the mouse handlers the canvas calls live. */
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
     and a test that drags a marquee has to be able to pick it the way the toolbar does.
   - the sheet canvas: this harness has no canvas, so the ref React would fill is pointed at
     a recording object and the drawing effect is run by hand, which is the code path a
     browser runs on mount.
   - the sheet arithmetic: core/canvas-math.js turns a click into a tile and the workbench page
     loads it before the activity, so a mouse event here means the same thing it means there.

   The zoom is a parameter because it is what decides how many tiles one screen row holds: at
   zoom 6 a viewport of 800 pixels draws sixteen of them, which is a row a test can count
   cells in by hand. */
function loadedEnv(zoom) {
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
  if (zoom) env.K.tile.setMap({ zoom: zoom });
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
   the block is marked on it. The canvas component is not a provider, so the tab's tree is
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
   fetched after it are the ones that drag a marquee. */
function pickSelectTool(made) {
  const node = button(made.render(), 'Select');
  if (!node) throw new Error('the toolbar should offer a Select button');
  node.props.onClick();
  return canvasElement(made.render());
}

/* A mouse event on the sheet canvas. The rect starts at 0,0, so the point a cell names is
   the middle of that cell at the zoom the workbench was built with: 8 * 6 = 48 pixels a tile
   at zoom 6, and a screen row holds sixteen of them. */
function mouse(handler, x, y) {
  const ev = {
    clientX: x, clientY: y, button: 0, ctrlKey: false,
    currentTarget: { getBoundingClientRect: function () { return { left: 0, top: 0 }; } }
  };
  ev.preventDefault = function () {};
  handler(ev);
  return ev;
}

/* Where the middle of a cell sits on the sheet at this width and zoom. */
function cellPoint(col, row, zoom, perRow) {
  const z = zoom === undefined ? 6 : zoom;
  const step = 8 * z;
  return { x: col * step + step / 2, y: row * step + step / 2 };
}

/* ---------- the two shapes in the store ---------- */

suite.test('a marquee is a cell rectangle of the sheet grid and an old range is still a run', function (t) {
  const env = openSheet();
  const K = env.K;

  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  t.assertDeepEqual(K.tile.getState().selection, { tile: 4, w: 2, h: 2 },
    'the range batch 165 stored is the range the store holds, key for key');

  t.assertEqual(K.tile.getState().gridCols, 0, 'no canvas has named a row width yet');
  K.tile.setSelection({ col: 1, row: 1, cols: 3, rows: 2 });
  t.assertEqual(K.tile.getState().selection, null,
    'a marquee without a sheet grid is no range: a cell of it is not a tile yet, and a wrong block is worse than none');

  K.tile.setGridCols(GRID);
  t.assertEqual(K.tile.getState().gridCols, GRID, 'the row width the canvas measures is in the store');
  K.tile.setSelection({ col: 1, row: 1, cols: 3, rows: 2 });
  t.assertDeepEqual(K.tile.getState().selection, { col: 1, row: 1, cols: 3, rows: 2, tile: 17 },
    'the cells are kept and so is the tile of the first one: row 1 * 16 + col 1');

  K.tile.setSelection({ col: 15, row: 0, cols: 4, rows: 2 });
  t.assertDeepEqual(K.tile.getState().selection, { col: 15, row: 0, cols: 1, rows: 2, tile: 15 },
    'a marquee stops at the end of the row it starts on instead of wrapping into the next one');
  K.tile.setSelection({ col: 0, row: 8, cols: 1, rows: 1 });
  t.assertEqual(K.tile.getState().selection, null,
    'and a block that starts below the last row of the sheet is no block at all');
  K.tile.setSelection({ col: 2, row: 2, cols: 0, rows: -3 });
  t.assertDeepEqual(K.tile.getState().selection, { col: 2, row: 2, cols: 1, rows: 1, tile: 34 },
    'a size under one cell is one cell');
  K.tile.setSelection({ col: 2.9, row: 2.9, cols: 3.9, rows: 2.9 });
  t.assertDeepEqual(K.tile.getState().selection, { col: 2, row: 2, cols: 3, rows: 2, tile: 34 },
    'a cell and a size are whole tiles only');
  K.tile.setSelection({ col: 1, row: 1, cols: 1000, rows: 1000 });
  t.assertDeepEqual(K.tile.getState().selection, { col: 1, row: 1, cols: 15, rows: 7, tile: 17 },
    'a block never claims more tiles than the row and the sheet hold');
  K.tile.clearSelection();
  t.assertEqual(K.tile.getState().selection, null, 'clearing it takes the block away again');
});

/* ---------- the run batch 165 copied is untouched ---------- */

suite.test('setSelection({ tile, w, h }) still copies the run batch 165 copied, byte for byte', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  [4, 5, 6, 7].forEach(function (tile) { paintTile(K, tile); });
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileListOffsets([4, 5, 6, 7]),
    'the four tiles of the run are painted before anything is copied');

  K.tile.setSelection({ tile: 4, w: 2, h: 2 });
  t.assertEqual(K.tile.copyRegion(9), true, 'the copy reports a region even when the caller names another tile: the range decides');
  const clip = K.tile.getState().clipboard;
  t.assertEqual(clip.w, 16, 'two tiles to a clipboard row make a box 16 pixels wide');
  t.assertEqual(clip.h, 16, 'and two rows of tiles make it 16 pixels tall');
  t.assertEqual(clip.cols, 16, 'with 16 pixels to a row');
  t.assertEqual(clip.tile, 4, 'the clip remembers the anchor of the run, not the tile the caller named');
  t.assertEqual(clip.pixels.length, 256, 'one entry per pixel of the four tiles');
  t.assertEqual(clip.marquee, false, 'and it says it is a run: the paste lays it out on its own clipboard row');

  t.assertEqual(K.tile.pasteRegion(20), true, 'the paste should report writes');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileListOffsets([4, 5, 6, 7, 20, 21, 22, 23]),
    'all 0x40000 bytes differ in the four tiles of the run and the four it was pasted into, and nowhere else');
  [[20, 4], [21, 5], [22, 6], [23, 7]].forEach(function (pair) {
    t.assertDeepEqual(tilePixels(K, pair[0]), tilePixels(K, pair[1]),
      'destination tile ' + pair[0] + ' reads back as source tile ' + pair[1]);
  });
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 23 * TILE_BYTES + byteAt(6, 5)], encodedByte(6, 5, 7),
    'the last destination tile holds its own corner of the run through the same encoding');
});

/* ---------- the marquee ---------- */

suite.test('a marquee copies block row by block row and pastes the same cells another row on', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  K.tile.setGridCols(GRID);
  K.tile.setSelection({ col: 1, row: 1, cols: 3, rows: 2 });
  /* Six tiles a block three cells across and two down covers in a sixteen tile row: the first
     row of the block is 17, 18, 19 and the second is 33, 34, 35 - sixteen tiles below it. */
  const src = [17, 18, 19, 33, 34, 35];
  src.forEach(function (tile) { paintTile(K, tile); });
  const blocks = src.map(function (tile) { return tilePixels(K, tile); });
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileListOffsets(src),
    'the six tiles of the block are the only painted ones');

  t.assertEqual(K.tile.copyRegion(0), true, 'the copy reads the block the range names, not the tile the caller named');
  const clip = K.tile.getState().clipboard;
  t.assertEqual(clip.w, 24, 'three cells across make a box 24 pixels wide');
  t.assertEqual(clip.h, 16, 'two cells down make it 16 pixels tall');
  t.assertEqual(clip.cols, 24, 'with 24 pixels to a clipboard row');
  t.assertEqual(clip.tile, 17, 'the clip is anchored at the first cell of the block');
  t.assertEqual(clip.marquee, true, 'and it remembers the block is a marquee, not a run');
  t.assertEqual(clip.pixels.length, 384, 'one entry per pixel of the six tiles');
  t.assertEqual(clip.pixels[3 * 24 + 2], blocks[0][3 * 8 + 2], 'the first tile of the block starts the clip');
  t.assertEqual(clip.pixels[3 * 24 + 10], blocks[1][3 * 8 + 2], 'the cell to its right follows it');
  t.assertEqual(clip.pixels[3 * 24 + 18], blocks[2][3 * 8 + 2], 'and the third cell of the block row ends it');
  t.assertEqual(clip.pixels[11 * 24 + 2], blocks[3][3 * 8 + 2],
    'the second block row is the tile sixteen tiles below the first, not the tile after the third');
  t.assertEqual(clip.pixels[11 * 24 + 18], blocks[5][3 * 8 + 2], 'through to the last cell of the block');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), tileListOffsets(src),
    'copying is not an edit: not one byte of the rom moved');

  /* Pasted at tile 24 - cell (8,1) of the grid - the block lands on the next three cells of
     that row and the three sixteen tiles below them. */
  t.assertEqual(K.tile.pasteRegion(24), true, 'the paste reports the writes it made');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    tileListOffsets(src.concat([24, 25, 26, 40, 41, 42])),
    'all 0x40000 bytes differ in the six tiles of the block and the six cells it was pasted into, and nowhere else');
  [[24, 0], [25, 1], [26, 2], [40, 3], [41, 4], [42, 5]].forEach(function (pair) {
    t.assertDeepEqual(tilePixels(K, pair[0]), blocks[pair[1]],
      'destination tile ' + pair[0] + ' reads back as source tile ' + src[pair[1]]);
  });
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 24 * TILE_BYTES + byteAt(2, 3)], encodedByte(2, 3, 17),
    'the byte of the first destination tile holds the copied nibbles of (2,3)');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 41 * TILE_BYTES + byteAt(6, 5)], encodedByte(6, 5, 34),
    'and the tile of the second block row holds its own corner, not the one above it');
  /* A run of six tiles from 17 would have copied 20, 21 and 22 as its second clipboard row
     and pasted them into 27, 28 and 29; a rectangle reads the row sixteen tiles below it. */
  [20, 21, 22, 23, 27, 28, 29, 39].forEach(function (tile) {
    t.assertEqual(K.hex.getPatchedBytes()[REGION + tile * TILE_BYTES + byteAt(3, 4)],
      source[REGION + tile * TILE_BYTES + byteAt(3, 4)],
      'tile ' + tile + ' was neither read nor written: the block is a rectangle, not a run that wraps');
  });
});

suite.test('a paste cuts the cells the window does not hold instead of writing half of one', function (t) {
  const env = openSheet(END_REGION);
  const K = env.K;
  const source = K.hex.getSourceBytes();
  K.tile.setGridCols(GRID);
  K.tile.setSelection({ col: 0, row: 0, cols: 2, rows: 1 });
  paintTile(K, 0);
  paintTile(K, 1);
  t.assertEqual(K.tile.copyRegion(0), true, 'the two whole tiles of the sheet copy');
  const clip = K.tile.getState().clipboard;
  t.assertEqual(clip.w, 16, 'two cells across make a box 16 pixels wide');
  t.assertEqual(clip.h, 8, 'one cell down makes it 8 pixels tall');

  const before = K.hex.getPatchedBytes();
  t.assertEqual(K.tile.pasteRegion(2), false,
    'tile 2 is not wholly inside the window and tile 3 is past it, so no pixel may be written');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [],
    'not one byte of the rom moved: the single byte of tile 2 the window does hold stays as it was');
  t.assertEqual(K.hex.isPatched(END_REGION + 2 * TILE_BYTES), false, 'it is not even a patch');
  t.assert(K.tile.getState().status.indexOf('outside the window') >= 0,
    'and the status says the cells were cut, got: ' + K.tile.getState().status);

  t.assertEqual(K.tile.pasteRegion(1), true, 'a block that reaches past the end writes the cells that fit');
  t.assertDeepEqual(tilePixels(K, 1), tilePixels(K, 0),
    'the destination cell that fits reads back as the first cell of the block');
  t.assertEqual(K.hex.getPatchedBytes()[END_REGION + 2 * TILE_BYTES], source[END_REGION + 2 * TILE_BYTES],
    'and the one byte of the cut tile is still the loaded file byte');
  t.assertEqual(K.hex.isPatched(END_REGION + 2 * TILE_BYTES), false, 'the half held tile never became a patch');
  t.assert(K.tile.getState().status.indexOf('outside the window') >= 0,
    'the status names the cell that was cut, got: ' + K.tile.getState().status);
});

/* ---------- the select tool's drag ---------- */

suite.test('the Select tool drags a 2D marquee out of the sheet, not a run', function (t) {
  const made = loadedEnv(6);
  const K = made.env.K;
  const canvas = pickSelectTool(made);
  t.assert(canvas, 'the tab should draw the sheet canvas');
  const down = canvas.props.onClick, move = canvas.props.onMove, up = canvas.props.onUp;

  /* At zoom 6 a viewport of 800 pixels draws sixteen tiles to a screen row, so cell (1,1) is
     slot 17 and cell (3,2) is slot 35. */
  const a = cellPoint(1, 1), b = cellPoint(3, 2), c = cellPoint(4, 1);
  mouse(down, a.x, a.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 17, w: 1, h: 1 },
    'the cell the mouse goes down on is the anchor of a one tile block');
  mouse(move, b.x, b.y);
  t.assertDeepEqual(K.tile.getState().selection, { col: 1, row: 1, cols: 3, rows: 2, tile: 17 },
    'a diagonal drag is the rectangle of cells between the two corners: three across, two down');
  mouse(move, c.x, c.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 17, w: 4, h: 1 },
    'a drag that stays inside one screen row is the four tile run it always was');
  mouse(up, c.x, c.y);
  t.assertDeepEqual(K.tile.getState().selection, { tile: 17, w: 4, h: 1 }, 'letting go keeps the block');
  t.assertEqual(K.tile.getState().gridCols, 16,
    'the drag hands the row width it counted with to the store, because a marquee cannot be read back without it');

  /* A drag back past the anchor puts the first cell of the block at the other corner. */
  mouse(down, cellPoint(3, 1).x, cellPoint(3, 1).y);
  mouse(move, cellPoint(1, 2).x, cellPoint(1, 2).y);
  t.assertDeepEqual(K.tile.getState().selection, { col: 1, row: 1, cols: 3, rows: 2, tile: 17 },
    'dragging back past the anchor names the same rectangle from its other corner');
  mouse(up, cellPoint(1, 2).x, cellPoint(1, 2).y);

  /* One screen row down and no cell across is a column of tiles, which is the shape batch
     165 read as a run of a whole clipboard row. */
  mouse(down, cellPoint(1, 1).x, cellPoint(1, 1).y);
  mouse(move, cellPoint(1, 2).x, cellPoint(1, 2).y);
  t.assertDeepEqual(K.tile.getState().selection, { col: 1, row: 1, cols: 1, rows: 2, tile: 17 },
    'a straight drag down one row is the column of two cells it is, not a band across the sheet');
  mouse(up, cellPoint(1, 2).x, cellPoint(1, 2).y);

  press(rootHandler(made.env), 'Escape', element('CANVAS'), 'none');
  t.assertEqual(K.tile.getState().selection, null, 'Escape clears the block the tool dragged out');
});

/* ---------- the marker ---------- */

suite.test('the marquee is handed to the canvas and marked one dashed box per block row', function (t) {
  const made = loadedEnv(6);
  const K = made.env.K;
  K.tile.setGridCols(GRID);
  K.tile.setSelection({ col: 1, row: 1, cols: 3, rows: 2 });
  const tree = drawSheet(made);
  t.assertEqual(made.drawn.used, true, 'the sheet canvas should be drawn into');
  t.assertEqual(K.tile.getState().gridCols, 16, 'and the canvas tells the store the row width it drew');
  t.assertDeepEqual(made.drawn.dashes[0], [4, 2], 'the block is marked with the dash the marker asks for');
  t.assert(hasRect(made.drawn, 48.5, 48.5, 143, 47),
    'the first block row is one dashed box three tiles wide, got: ' + JSON.stringify(made.drawn.rects.slice(-4)));
  t.assert(hasRect(made.drawn, 48.5, 96.5, 143, 47),
    'and the second block row is the box one row of tiles below it');
  t.assert(!hasRect(made.drawn, 48.5, 48.5, 143, 95),
    'the block is not one tall box over both rows');
  t.assertDeepEqual(made.drawn.dashes, [[4, 2], []], 'the dash is set for the block and put back afterwards');
  const node = canvasElement(tree);
  t.assertDeepEqual(node.props.selection, { col: 1, row: 1, cols: 3, rows: 2, tile: 17 },
    'the canvas is handed the block the store holds');
  t.assert(made.effectDeps.some(function (d) { return d && d.indexOf(node.props.selection) >= 0; }),
    'and the block is in the dependency list of the drawing effect, so a new one redraws the sheet');

  /* A block that starts at the last cell of the row is cut there instead of reaching over the
     gap into the next one. */
  K.tile.setSelection({ col: 15, row: 0, cols: 1, rows: 3 });
  made.drawn.reset();
  drawSheet(made);
  t.assert(hasRect(made.drawn, 720.5, 0.5, 47, 47),
    'the last cell of the row is a box of its own, got: ' + JSON.stringify(made.drawn.rects.slice(-6)));
  t.assert(hasRect(made.drawn, 720.5, 48.5, 47, 47), 'and the next block row is the box below it');
  t.assert(hasRect(made.drawn, 720.5, 96.5, 47, 47), 'through to the last row of the block');

  K.tile.clearSelection();
  made.drawn.reset();
  const plain = drawSheet(made);
  t.assertDeepEqual(made.drawn.dashes, [], 'with no block nothing is dashed');
  t.assertEqual(canvasElement(plain).props.selection, null, 'and the canvas is handed no block at all');
});

/* ---------- the shortcut ---------- */

suite.test('Ctrl+C in a text field keeps its own copy; on the canvas it copies the marquee', function (t) {
  const env = openSheet();
  const K = env.K;
  K.tile.setGridCols(GRID);
  K.tile.setSelection({ col: 1, row: 1, cols: 3, rows: 2 });
  t.assertEqual(K.tile.copyRegion(0), true, 'the block copies once');
  const clip = K.tile.getState().clipboard;
  const before = K.hex.getPatchedBytes();
  const handler = rootHandler(env);

  ['INPUT', 'TEXTAREA', 'SELECT'].forEach(function (tag) {
    const copy = press(handler, 'c', element(tag));
    t.assertEqual(copy.prevented, 0, 'Ctrl+C in a ' + tag + ' is the field\'s own copy, not the tab\'s');
    const paste = press(handler, 'v', element(tag));
    t.assertEqual(paste.prevented, 0, 'and Ctrl+V belongs to the field too, even with a block in the store');
  });
  t.assert(K.tile.getState().clipboard === clip, 'none of those keystrokes replaced the clipboard');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and not one byte of the rom moved');

  /* The hex cursor names another tile, and the marquee still wins: the two shapes are read
     from the one selection in the store. */
  K.hex.gotoOffset(REGION + 40 * TILE_BYTES);
  const canvas = press(handler, 'c', element('CANVAS'));
  t.assertEqual(canvas.prevented, 1, 'Ctrl+C on the canvas belongs to the tab');
  const block = K.tile.getState().clipboard;
  t.assert(block !== clip, 'and it fills the clipboard with the block again');
  t.assertEqual(block.marquee, true, 'as a marquee');
  t.assertEqual(block.w, 24, '24 pixels to a row');
  t.assertEqual(block.h, 16, 'two block rows tall');
  t.assertEqual(block.tile, 17, 'anchored at the first cell of the block, not at the tile the hex cursor sits on');
  t.assertDeepEqual(block.pixels, clip.pixels, 'and the pixels are the ones the block holds');

  press(handler, 'Escape', element('CANVAS'), 'none');
  t.assertEqual(K.tile.getState().selection, null, 'Escape clears the block');
  t.assertEqual(K.tile.getState().clipboard, block, 'and leaves the clipboard alone');
  press(handler, 'c', element('CANVAS'));
  t.assertEqual(K.tile.getState().clipboard.w, 8, 'with no block, Ctrl+C is the one tile box again');
});

suite.test('the marquee adds no global keyboard listener: the tab root keeps it', function (t) {
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

module.exports = { suite: suite };
