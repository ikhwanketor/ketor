/* PNG out of the tile editor and back in.

   The export is the two pure pieces of batch 160 wired to the editor: tilesToRgba paints the
   indices with the palette the editor is showing, encodePng writes the file, and the bytes go
   to a download. The import is the same road backwards, and it has to end in the Hex Editor
   patch layer: pngChunks and decodeScreenshot read the file, rgbaToTiles turns the pixels into
   tile bytes, and every pixel is written through setPixel, the one path a byte takes. The
   gates below are byte for byte: a PNG exported from one part of the ROM is imported into
   another and the whole 0x40000 byte image is compared, so an import that spills a single
   byte outside its destination fails here.

   A compressed graphic is the second half of the import: the pixels land in the decompressed
   copy and writeBackCompressed puts them back - in place while the stream still fits its
   budget, by moving the block and redirecting the ROM's pointer when it grew, and by refusing
   and writing nothing when the address looks like data rather than a pointer table. When the
   file has no run left inside it the block is appended past the end, which the patch layer
   grows the image for; the tail case at the end checks the whole file and the tail for it. The
   relocation lives in core/pointer-map.js and the bus it names comes from
   core/console-profiles.js; the workbench page loads both, the harness had no reason to, so this
   suite loads them the way the page does.

   Inflate is the one thing a browser does not have. The workbench page loads pako from a CDN;
   this suite hands in zlib's inflateSync in the same place the page hands in pako, and one
   gate proves the honest refusal: with no inflate at all the import says so and writes
   nothing. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-png');

const REGION = 0x100;         // the sheet base the editor opens
const SOURCE_AT = 0x2000;     // tiles with real content: the fixture's record region
const PALETTE_AT = 0x800;     // where this suite writes its 16 colour BGR555 palette
const DESTINATION = 0x1500;   // an offset the editor does not have on screen
const STREAM_AT = 0x3000;     // where the compressed cases put their stream
const ROM_SIZE = 0x40000;
const TILE_BYTES = 32;        // gba-4bpp
const LZ77 = 0x10;
const BUDGET_SLACK = 512;     // a stream that fits its allocation with room to spare

/* A palette that is injective on purpose: two entries of the same colour would make the
   nearest-entry rule answer with the lower index, which is honest behaviour and a different
   tile. BGR555 quantises, so these are colours the ROM itself can hold (r5 = g5 = b5 = i). */
function writePalette(rom, at) {
  for (let i = 0; i < 16; i++) {
    const word = i * 0x0421;
    rom[at + i * 2] = word & 0xFF;
    rom[at + i * 2 + 1] = (word >> 8) & 0xFF;
  }
}

function writePointer(rom, at, value) {
  rom[at] = value & 0xFF;
  rom[at + 1] = (value >>> 8) & 0xFF;
  rom[at + 2] = (value >>> 16) & 0xFF;
  rom[at + 3] = (value >>> 24) & 0xFF;
}

/* The two files the compressed write back needs and the harness does not load, because no
   earlier suite reached them: the pointer map that plans the move and the console profiles
   that name the bus. The workbench page loads both before the tile activity. */
function loadCore(env, file) {
  const full = path.join(env.REPO, 'app', 'assets', 'js', 'core', file);
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), env.win, { filename: full });
}

function openSheet(options) {
  const opts = options || {};
  const env = loadWorkbench();
  loadCore(env, 'pointer-map.js');
  loadCore(env, 'console-profiles.js');
  const fixture = buildSyntheticRom({ records: 48 });
  if (opts.palette !== false) writePalette(fixture.rom, PALETTE_AT);
  if (typeof opts.prepare === 'function') opts.prepare(fixture.rom, env.K);
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(opts.region === undefined ? REGION : opts.region);
  env.K.tile.setFormat('gba-4bpp');
  if (opts.palette !== false) env.K.tile.loadPalette(PALETTE_AT, 'test');
  return { env: env, fixture: fixture, K: env.K };
}

/* The workbench page loads pako in the head; a test hands in zlib's inflate, which is the
   same contract: bytes in, inflated bytes out. */
function withInflate(env) {
  env.win.pako = { inflate: zlib.inflateSync };
  return env;
}

/* The download is an anchor with a Blob URL. The harness document is a stub, so this wraps
   createElement to keep what the export offered the browser. */
function captureAnchors(env) {
  const anchors = [];
  const real = env.win.document.createElement;
  env.win.document.createElement = function (tag) {
    const el = real.call(env.win.document, tag);
    if (tag === 'a') anchors.push(el);
    return el;
  };
  return anchors;
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

function tileOffsets(at, count) {
  const out = [];
  for (let t = 0; t < count; t++) for (let i = 0; i < TILE_BYTES; i++) out.push(at + t * TILE_BYTES + i);
  return out;
}

function decode(env, png) {
  const chunks = env.K.core.saveState.pngChunks(png);
  if (!chunks) return null;
  return env.K.core.saveState.decodeScreenshot(png, chunks, zlib.inflateSync);
}

function samePixels(shot, expected, message, t) {
  if (shot.pixels.length !== expected.pixels.length) {
    t.assert(false, message + ': ' + shot.pixels.length + ' bytes against ' + expected.pixels.length);
    return;
  }
  for (let i = 0; i < shot.pixels.length; i++) {
    if (shot.pixels[i] !== expected.pixels[i]) {
      t.assert(false, message + ': byte ' + i + ' is ' + shot.pixels[i] + ', expected ' + expected.pixels[i]);
      return;
    }
  }
  t.assert(true, message);
}

/* The buttons of the rendered tab, by the label they show. */
function buttons(env, labels) {
  const found = {};
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'button') {
      const label = typeof node.props.children === 'string' ? node.props.children : '';
      if (labels.indexOf(label) >= 0) found[label] = node;
    }
    walk(node.props && node.props.children);
  })(env.K.ui.tabProviders.tile());
  return found;
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

/* ---------- export ---------- */

suite.test('an export is a PNG the project\'s own reader takes apart, pixel for pixel', function (t) {
  const { env, K } = openSheet();
  const anchors = captureAnchors(env);
  const res = K.tile.exportTilesPng({ at: SOURCE_AT, count: 3 });

  t.assert(res && res.bytes, 'the export hands the file back to the caller');
  t.assert(res.name.indexOf('0x002000') >= 0, 'the name carries the base: ' + res.name);
  t.assert(res.name.indexOf('gba-4bpp') >= 0, 'and the format: ' + res.name);
  t.assertEqual(anchors.length, 1, 'one download was offered');
  t.assertEqual(anchors[0].download, res.name, 'with the name the export reported');

  const shot = decode(env, res.bytes);
  t.assert(shot !== null, 'pngChunks and decodeScreenshot read the file');
  t.assertEqual(shot.width + 'x' + shot.height, '8x24', 'three tiles in one column');
  t.assertEqual(shot.bpp, 4, 'colour type 6, so four bytes a pixel');

  /* A flat picture would round trip whatever the export did with it, so the sheet has to
     hold more than one colour before the comparison means anything. */
  const colours = {};
  for (let i = 0; i < shot.pixels.length; i += 4) colours[shot.pixels[i] + ',' + shot.pixels[i + 1] + ',' + shot.pixels[i + 2]] = 1;
  t.assert(Object.keys(colours).length > 1, 'the exported tiles hold more than one colour (got ' + Object.keys(colours).length + ')');

  const expected = K.core.tilesToRgba(K.hex.getPatchedBytes(), {
    at: SOURCE_AT, format: 'gba-4bpp', count: 3, palette: K.tile.readPaletteAt(PALETTE_AT)
  });
  samePixels(shot, expected, 'the PNG RGBA is exactly what tilesToRgba painted', t);
});

suite.test('the export follows the stride the sheet is stepping', function (t) {
  const { env, K } = openSheet();
  K.tile.setMap({ stride: 64 });   // tile 1 starts 64 bytes in, not 32

  const res = K.tile.exportTilesPng({ at: SOURCE_AT, count: 2 });
  t.assert(res && res.bytes, 'the export ran');
  const shot = decode(env, res.bytes);
  t.assertEqual(shot.width + 'x' + shot.height, '8x16', 'two tiles');

  const palette = K.tile.readPaletteAt(PALETTE_AT);
  const patched = K.hex.getPatchedBytes();
  const first = K.core.tilesToRgba(patched, { at: SOURCE_AT, format: 'gba-4bpp', count: 1, palette: palette });
  const second = K.core.tilesToRgba(patched, { at: SOURCE_AT + 64, format: 'gba-4bpp', count: 1, palette: palette });
  const head = { pixels: shot.pixels.subarray(0, 8 * 8 * 4) };
  const tail = { pixels: shot.pixels.subarray(8 * 8 * 4) };
  samePixels(head, first, 'the first tile is the sheet at its base', t);
  samePixels(tail, second, 'the second tile is the one the stride names, not the next 32 bytes', t);
});

/* ---------- import ---------- */

suite.test('a PNG from one offset is written into another, byte for byte', function (t) {
  const { env, K } = openSheet();
  withInflate(env);
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 2 }).bytes;
  const source = K.hex.getSourceBytes();

  const res = K.tile.importTilesPng(png, { at: DESTINATION, count: 2 });
  t.assert(res, 'the import ran');
  t.assertEqual(res.count, 2, 'two tiles');
  t.assertEqual(res.pixels, 128, 'two tiles of 64 pixels were offered to the writer');

  /* The pixels whose colour differs: the destination is 0xAA everywhere, and a source
     pixel that happens to be colour 10 as well is already what the import wants. */
  let expectedToChange = 0;
  for (let tile = 0; tile < 2; tile++) {
    const from = K.core.decodeTile(source, SOURCE_AT + tile * TILE_BYTES, 'gba-4bpp');
    const to = K.core.decodeTile(source, DESTINATION + tile * TILE_BYTES, 'gba-4bpp');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (from[y][x] !== to[y][x]) expectedToChange++;
  }
  t.assertEqual(res.changed, expectedToChange, 'exactly the pixels whose colour differs changed');
  t.assert(expectedToChange > 100, 'and that is most of both tiles (' + expectedToChange + ' of ' + res.pixels + ')');

  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, source.length, 'the image did not grow');
  t.assertDeepEqual(diffOffsets(source, patched), tileOffsets(DESTINATION, 2),
    'all ' + ROM_SIZE + ' bytes differ in exactly the two destination tiles, and nowhere else');
  for (let i = 0; i < 2 * TILE_BYTES; i++) {
    t.assertEqual(patched[DESTINATION + i], source[SOURCE_AT + i], 'destination byte ' + i + ' is the source byte');
  }
  t.assertEqual(K.hex.isPatched(DESTINATION), true, 'the first destination byte is a hex patch now');
  t.assertEqual(K.tile.getState().region, REGION, 'the editor stayed where it was');
  t.assertEqual(source[DESTINATION], 0xAA, 'the loaded file still holds its own 0xAA');
});

suite.test('the destination is the only thing that moves, a painted pixel included', function (t) {
  const { env, K } = openSheet();
  withInflate(env);
  K.tile.setPixel(0, 0, 0, 3);   // a patch well away from the destination
  const before = K.hex.getPatchedBytes();
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 1 }).bytes;

  const res = K.tile.importTilesPng(png, { at: DESTINATION, count: 1 });
  t.assert(res, 'the import ran');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), tileOffsets(DESTINATION, 1),
    'one tile moved and the painted pixel outside it is untouched');
});

suite.test('with no inflate the import names pako and writes nothing', function (t) {
  const { env, K } = openSheet();
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 1 }).bytes;
  const source = K.hex.getSourceBytes();

  const res = K.tile.importTilesPng(png, { at: DESTINATION, count: 1 });
  t.assertEqual(res, null, 'the import refuses');
  t.assert(K.tile.getState().status.indexOf('pako') >= 0, 'and names pako: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'not one byte of the ROM was written');
});

suite.test('an explicit inflate is enough, and a file that is not a PNG is refused', function (t) {
  const { env, K } = openSheet();
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 1 }).bytes;
  const source = K.hex.getSourceBytes();

  const junk = new Uint8Array([0x4B, 0x65, 0x74, 0x6F, 0x72]);   // "Ketor": no PNG signature
  t.assertEqual(K.tile.importTilesPng(junk, { at: DESTINATION, count: 1, inflate: zlib.inflateSync }), null,
    'a file that is not a PNG is refused');
  t.assert(K.tile.getState().status.indexOf('not a PNG') >= 0, 'and says why: ' + K.tile.getState().status);

  /* A real PNG with a damaged zlib stream: the signature and the chunks parse, the pixels
     do not, so nothing may be written either. */
  const damaged = png.slice();
  const chunks = K.core.saveState.pngChunks(damaged);
  const idat = chunks.filter(function (c) { return c.type === 'IDAT'; })[0];
  damaged[idat.at + idat.length - 1] = damaged[idat.at + idat.length - 1] ^ 0xFF;
  t.assertEqual(K.tile.importTilesPng(damaged, { at: DESTINATION, count: 1, inflate: zlib.inflateSync }), null,
    'a damaged stream is refused');
  t.assert(K.tile.getState().status.indexOf('could not be read') >= 0, 'and says why: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'neither refusal wrote a byte');
});

suite.test('without a palette the import refuses instead of painting index 0', function (t) {
  const { env, K } = openSheet({ palette: false });
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 1 }).bytes;
  const source = K.hex.getSourceBytes();

  t.assertEqual(K.tile.getState().palette, null, 'no palette is loaded');
  t.assertEqual(K.tile.importTilesPng(png, { at: DESTINATION, count: 1, inflate: zlib.inflateSync }), null,
    'the import refuses');
  t.assert(K.tile.getState().status.indexOf('palette') >= 0, 'and asks for one: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'nothing was written');
});

/* ---------- import into a compressed graphic ---------- */

/* Two or more blank tiles: LZ77 packs 128 zero bytes into 22, so an import of real pixels
   cannot fit the same budget and the write back has to move the block. */
function openCompressed(options) {
  const opts = options || {};
  const data = new Uint8Array((opts.tiles || 4) * TILE_BYTES);
  let enc = null;
  const sheet = openSheet({
    prepare: function (rom, core) {
      enc = core.core.encodeLike(LZ77, data);
      /* A case about having nowhere inside to move paints over every untouched run first;
         the stream goes in afterwards so it is still readable. */
      if (opts.fill) rom.fill(0xAA, 0x2C00);
      rom.set(enc.bytes, STREAM_AT);
      if (typeof opts.pointers === 'function') opts.pointers(rom);
    }
  });
  sheet.enc = enc;
  sheet.data = data;
  withInflate(sheet.env);
  sheet.K.tile.openCandidate({
    kind: 'compressed', offset: STREAM_AT, type: LZ77, size: data.length,
    label: 'test LZ77', dataOffset: 0, compressedSize: opts.budget === undefined ? enc.compressedSize : opts.budget
  });
  return sheet;
}

suite.test('a compressed graphic that still fits is written back in place', function (t) {
  const { env, K, enc } = openCompressed({ tiles: 2, budget: BUDGET_SLACK });
  const gs = K.tile.getState().graphicSource;
  t.assertEqual(gs.offset, STREAM_AT, 'the stream is open');
  t.assertEqual(gs.budget, BUDGET_SLACK, 'with the room the game left for it');

  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 2 }).bytes;
  const source = K.hex.getSourceBytes();
  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 2 });

  t.assert(res && res.writeBack, 'the write back ran before the import returned');
  t.assertEqual(res.writeBack.inPlace, true, 'the stream still fits, so it stayed where it was');
  t.assert(enc.compressedSize < BUDGET_SLACK, 'the original stream was ' + enc.compressedSize + ' bytes, well inside');
  t.assertEqual(K.tile.getState().graphicSource.offset, STREAM_AT, 'the block did not move');

  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, source.length, 'nothing was appended to the file');
  const diff = diffOffsets(source, patched);
  t.assert(diff.length > 0, 'the import wrote bytes');
  t.assert(diff[0] >= STREAM_AT && diff[diff.length - 1] < STREAM_AT + BUDGET_SLACK,
    'every written byte is inside the budget the stream owns');
  const back = K.core.decompressAt(patched, STREAM_AT, {});
  t.assert(back !== null, 'the rewritten stream still decodes');
  for (let i = 0; i < 2 * TILE_BYTES; i++) {
    t.assertEqual(back.data[i], source[SOURCE_AT + i], 'decompressed byte ' + i + ' is the imported tile byte');
  }

  /* The same file again is not an edit: the copy already holds those pixels, so there is
     nothing to write back and the ROM keeps exactly what the first import left. */
  const again = K.tile.importTilesPng(png, { at: STREAM_AT, count: 2 });
  t.assertEqual(again.changed, 0, 'the second import finds every pixel already there');
  t.assertEqual(again.writeBack, null, 'so it does not compress and write the block again');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), diff, 'and the ROM is as the first import left it');
});

suite.test('a compressed graphic that outgrew its budget moves, and the ROM pointer follows', function (t) {
  const { env, K } = openCompressed({
    tiles: 4,
    pointers: function (rom) { writePointer(rom, 0x400, 0x08000000 + STREAM_AT); }
  });

  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 4 }).bytes;
  const source = K.hex.getSourceBytes();
  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 4 });

  t.assert(res && res.writeBack, 'the write back ran');
  t.assertEqual(res.writeBack.ok, true, 'the move was allowed: ' + (res.writeBack.reason || ''));
  t.assertEqual(res.writeBack.grows, false, 'the stream moved into free space inside the file');
  t.assertEqual(res.writeBack.pointers.length, 1, 'the one word that named the graphic was found');
  const moved = res.writeBack.newOffset;
  t.assert(moved > STREAM_AT && moved + res.writeBack.bytes <= ROM_SIZE,
    'the new block sits inside the ROM (0x' + moved.toString(16) + ')');
  t.assertEqual(K.tile.getState().graphicSource.offset, moved, 'the editor follows the block it moved');

  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, source.length, 'the image did not grow: the patch layer cannot write past its own end');
  t.assertEqual(K.core.readPointer(patched, 0x400, 'gba'), 0x08000000 + moved, 'the pointer names the new address');
  t.assertEqual(patched[STREAM_AT], source[STREAM_AT], 'the old stream is still there, untouched');

  /* Every changed byte is the pointer or the moved stream: the move moved the graphic and
     redirected the one word that named it, and nothing else in 0x40000 bytes moved. */
  const outside = diffOffsets(source, patched).filter(function (o) {
    return !(o >= 0x400 && o < 0x404) && !(o >= moved && o < moved + res.writeBack.bytes);
  });
  t.assertDeepEqual(outside, [], 'every changed byte is the pointer or the block it now names');

  const back = K.core.decompressAt(patched, moved, {});
  t.assert(back !== null, 'the moved stream decodes where the pointer now points');
  for (let i = 0; i < 4 * TILE_BYTES; i++) {
    t.assertEqual(back.data[i], source[SOURCE_AT + i], 'decompressed byte ' + i + ' is the imported tile byte');
  }
});

suite.test('a graphic that grew and cannot be moved is refused: not one byte is written', function (t) {
  const { env, K } = openCompressed({
    tiles: 4,
    /* The address turns up in 33 aligned words. That is too many to be a pointer table, so
       planRelocation refuses to rewrite them and the import must write nothing at all. */
    pointers: function (rom) {
      for (let i = 0; i < 33; i++) writePointer(rom, 0x400 + i * 4, 0x08000000 + STREAM_AT);
    }
  });

  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 4 }).bytes;
  const source = K.hex.getSourceBytes();
  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 4 });

  t.assert(res && res.writeBack, 'the import ran and asked for the write back');
  t.assertEqual(res.writeBack.ok, false, 'the move was refused');
  t.assertEqual(res.writeBack.sites, 33, 'because the address turns up 33 times');
  t.assert(K.tile.getState().status.indexOf('nothing was written') >= 0,
    'and the status says so: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'not one byte of the ROM moved');
  t.assertEqual(K.tile.getState().graphicSource.offset, STREAM_AT, 'the graphic stays where it was');
});

suite.test('a graphic that grew with nowhere inside to move is refused too', function (t) {
  const { env, K } = openCompressed({
    tiles: 4,
    /* Every untouched run inside the file is painted over, so the only place the plan can
       offer is past the end of the loaded file - where the patch layer refuses to write. */
    fill: true
  });

  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 4 }).bytes;
  const source = K.hex.getSourceBytes();
  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 4 });

  t.assert(res && res.writeBack, 'the import ran and asked for the write back');
  t.assertEqual(res.writeBack.ok, false, 'the move was refused');
  t.assertEqual(res.writeBack.reason, 'no room inside the file', 'because there is no free run left inside the file');
  t.assert(K.tile.getState().status.indexOf('nothing was written') >= 0,
    'and the status says so: ' + K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'not one byte of the ROM moved');
  t.assertEqual(K.tile.getState().graphicSource.offset, STREAM_AT, 'the graphic stays where it was');
});

/* ---------- the toolbar and the keyboard ---------- */

suite.test('the toolbar offers both buttons, and they run the two calls', function (t) {
  const { env, K } = openSheet();
  withInflate(env);
  const found = buttons(env, ['Export PNG', 'Import PNG']);
  t.assert(found['Export PNG'], 'Export PNG is in the toolbar');
  t.assert(found['Import PNG'], 'Import PNG is in the toolbar');
  t.assertEqual(found['Export PNG'].props.disabled, false, 'the export is live while a tile region is open');
  t.assertEqual(found['Import PNG'].props.disabled, false, 'and so is the import');

  const anchors = captureAnchors(env);
  found['Export PNG'].props.onClick();
  t.assertEqual(anchors.length, 1, 'the button offered a download');
  t.assert(/^tiles_0x/.test(anchors[0].download), 'named like the export names it: ' + anchors[0].download);
  t.assertEqual(K.hex.getPatchedBytes().length, ROM_SIZE, 'exporting wrote no byte of the ROM');

  /* The import button opens a file picker; the harness document is a stub, so this proves
     the click path builds the input and stops there without touching the ROM. */
  const before = K.hex.getPatchedBytes();
  found['Import PNG'].props.onClick();
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and importing writes nothing before a file is chosen');
});

suite.test('the two buttons add no global keyboard listener', function (t) {
  const baseline = watchedLoad(false);
  const loaded = watchedLoad(true);

  t.assertDeepEqual(keyboardCalls(baseline.calls), [],
    'no module should install a keyboard listener on the window, got: ' + JSON.stringify(baseline.calls));
  t.assertDeepEqual(keyboardCalls(loaded.calls), keyboardCalls(baseline.calls),
    'loading the tile module must not add one either');
  t.assert(loaded.calls.length > baseline.calls.length, 'the spy should see the tile module load');
  t.assertDeepEqual(loaded.calls.slice(baseline.calls.length), ['window:ketor:rom-loaded'],
    'the tile module registers the rom loaded event and nothing else, got: '
      + JSON.stringify(loaded.calls.slice(baseline.calls.length)));
});

/* ---------- a move with nowhere inside to go ---------- */

/* Every untouched run inside the file painted over leaves the end of the file as the only
   place the block can go. The patch layer grows the image to take such a write (batch 162,
   ui/ketor-hex-state.js), so the plan is applied rather than refused: the stream lands past
   the last loaded byte, the word that named the old address is rewritten to the new one, and
   the whole file and the whole tail are compared so a byte written anywhere else fails. */
suite.test('a graphic that grew with nowhere inside is appended and the pointer follows', function (t) {
  const { env, K } = openCompressed({
    tiles: 4,
    fill: true,
    pointers: function (rom) { writePointer(rom, 0x400, 0x08000000 + STREAM_AT); }
  });

  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 4 }).bytes;
  const source = K.hex.getSourceBytes();
  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 4 });

  t.assert(res && res.writeBack, 'the import ran and asked for the write back');
  t.assertEqual(res.writeBack.ok, true, 'the append plan ran: ' + (res.writeBack.reason || ''));
  t.assertEqual(res.writeBack.grows, true, 'there is no run left inside the file, so the block had to be appended');
  t.assertEqual(res.writeBack.newOffset, ROM_SIZE, 'and it lands right after the last byte of the loaded file');
  t.assertEqual(res.writeBack.pointers.length, 1, 'the word that named the old block was found');
  t.assert(K.tile.getState().status.indexOf('pointer(s) redirected') >= 0,
    'and the write back reports the move it made: ' + K.tile.getState().status);
  const written = /(\d+) byte\(s\) written/.exec(K.tile.getState().status);
  t.assert(written, 'the move reports how many bytes it wrote: ' + K.tile.getState().status);
  t.assert(Number(written[1]) >= res.writeBack.bytes,
    'the whole appended block was taken, not refused byte by byte (' + written[1] + ' of ' + res.writeBack.bytes + ')');
  const moved = res.writeBack.newOffset;

  t.assertEqual(K.hex.imageLength(), ROM_SIZE + res.writeBack.bytes, 'the image grew by exactly the block');
  t.assertEqual(K.tile.getState().graphicSource.offset, moved, 'the editor follows the block it appended');

  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, ROM_SIZE + res.writeBack.bytes, 'and getPatchedBytes returns an image of that length');
  t.assertEqual(K.core.readPointer(patched, 0x400, 'gba'), 0x08000000 + moved, 'the pointer names the new address');
  t.assertEqual(patched[STREAM_AT], source[STREAM_AT], 'the old stream is still there, untouched');

  const back = K.core.decompressAt(patched, moved, {});
  t.assert(back !== null, 'the appended stream decodes where the pointer now points');
  for (let i = 0; i < 4 * TILE_BYTES; i++) {
    t.assertEqual(back.data[i], source[SOURCE_AT + i], 'decompressed byte ' + i + ' is the imported tile byte');
  }

  /* Every changed byte of the file and of the tail is the pointer word or the block it now
     names: the filter leaves nothing else, and the image ends with the block itself. */
  const outside = diffOffsets(source, patched).filter(function (o) {
    return !(o >= 0x400 && o < 0x404) && !(o >= moved && o < moved + res.writeBack.bytes);
  });
  t.assertDeepEqual(outside, [], 'every changed byte is the pointer or the block it now names');
});

/* The tail an earlier move (or a longer inserted image) appended is data a pointer may now
   name, and planRelocation measures free space inside the loaded file only, so it cannot see
   it. A plan that would land on top of that tail is refused, or the second move would
   quietly overwrite the bytes the first one wrote. */
suite.test('a move that would land on the tail an earlier append owns is refused', function (t) {
  const { env, K } = openCompressed({
    tiles: 4,
    fill: true,
    pointers: function (rom) { writePointer(rom, 0x400, 0x08000000 + STREAM_AT); }
  });
  const TAIL = 0x40;
  K.hex.appendBytes(new Uint8Array(TAIL));   // what a first append move leaves behind
  const png = K.tile.exportTilesPng({ at: SOURCE_AT, count: 4 }).bytes;
  const source = K.hex.getSourceBytes();
  const before = K.hex.getPatchedBytes();

  const res = K.tile.importTilesPng(png, { at: STREAM_AT, count: 4 });

  t.assert(res && res.writeBack, 'the import ran and asked for the write back');
  t.assertEqual(res.writeBack.ok, false, 'the move was refused');
  t.assertEqual(res.writeBack.reason, 'no room inside the file', 'because the only room left is the tail an earlier append owns');
  t.assert(K.tile.getState().status.indexOf('nothing was written') >= 0,
    'and the status says so: ' + K.tile.getState().status);
  t.assertEqual(K.hex.imageLength(), ROM_SIZE + TAIL, 'the image did not grow past the appended tail');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'not one byte of the file or of the tail moved');
  t.assertEqual(K.tile.getState().graphicSource.offset, STREAM_AT, 'the graphic stays where it was');
  t.assertEqual(K.core.readPointer(K.hex.getPatchedBytes(), 0x400, 'gba'), 0x08000000 + STREAM_AT,
    'and the pointer still names it');
});

module.exports = { suite: suite };
