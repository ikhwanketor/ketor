/* A 256 colour palette for an 8bpp sheet.

   An 8bpp tile is one byte a pixel, so every index from 0 to 255 is a colour of its own; a
   palette read as sixteen entries sends the other 240 to the grey ramp, and an export or an
   import of such a sheet is wrong from index 16 up. This suite gives a synthetic rom 256
   distinct BGR555 words at one offset, reads them as a gba-8bpp palette, paints the record
   region with it, turns the pixels back into bytes, round trips the sheet through a PNG the
   project's own reader takes apart, and edits entry 200 byte for byte. The last two cases
   are the guard rails: a 4bpp sheet still reads sixteen entries and still refuses index 200,
   and the swatch strip still shows sixteen cells for it, while the 8bpp sheet gets a 16x16
   grid of 256.

   The palette words are injective on purpose. Two entries of the same colour would make the
   nearest entry rule answer with the lower index, which is honest behaviour and a different
   tile. */
'use strict';
const zlib = require('zlib');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-palette256');

const SOURCE_AT = 0x2000;     // the fixture's record region: bytes above 15 as 8bpp indices
const DESTINATION = 0x1500;   // an offset the editor does not have on screen
const PALETTE_AT = 0x800;     // where this suite writes its 256 colour palette
const PALETTE_BYTES = 512;    // 256 BGR555 words
const TILE_BYTES = 64;        // gba-8bpp
const TILES = 2;
const ROM_SIZE = 0x40000;

/* Word i is i: red is the low five bits, green the three above, so all 256 words are
   different and the BGR555 expansion (r5 << 3) | (r5 >> 2) keeps every index a colour of
   its own. */
function writePalette256(rom, at) {
  for (let i = 0; i < 256; i++) {
    rom[at + i * 2] = i & 0xFF;
    rom[at + i * 2 + 1] = (i >> 8) & 0xFF;
  }
}

function openSheet(options) {
  const opts = options || {};
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  writePalette256(fixture.rom, PALETTE_AT);
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(SOURCE_AT);
  env.K.tile.setFormat(opts.format || 'gba-8bpp');
  env.K.tile.loadPalette(PALETTE_AT, 'test');
  return { env: env, fixture: fixture, K: env.K };
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

function rangeOffsets(at, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(at + i);
  return out;
}

function decodePng(env, png) {
  const chunks = env.K.core.saveState.pngChunks(png);
  if (!chunks) return null;
  return env.K.core.saveState.decodeScreenshot(png, chunks, zlib.inflateSync);
}

function rgbaAt(pixels, width, x, y) {
  const at = (y * width + x) * 4;
  return [pixels[at], pixels[at + 1], pixels[at + 2]];
}

function colourText(c) { return c.r + ',' + c.g + ',' + c.b; }

/* The pixels of a run of tiles that carry an index above 15, as [index, x, y, tile]. */
function highPixels(K, bytes, at, count) {
  const out = [];
  for (let t = 0; t < count; t++) {
    const tile = K.core.decodeTile(bytes, at + t * TILE_BYTES, 'gba-8bpp');
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (tile[y][x] > 15) out.push({ index: tile[y][x], x: x, y: y, tile: t });
      }
    }
  }
  return out;
}

/* The swatch strip of the rendered tab. The strip is a component of its own, so the walk
   finds the element React would render and calls it with its props, the way React does;
   every cell is a button whose tooltip names its colour index. */
function swatchStrip(env) {
  let found = null;
  (function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.type === 'function' && node.props
      && typeof node.props.onPick === 'function' && node.props.palette !== undefined) {
      found = node;
      return;
    }
    walk(node.props && node.props.children);
  })(env.K.ui.tabProviders.tile());
  if (!found) return null;
  const strip = found.type(found.props);
  const cells = (strip.props.children || []).filter(function (c) {
    return c && c.type === 'button' && typeof c.props.title === 'string' && c.props.title.indexOf('Colour ') === 0;
  });
  const style = strip.props.style || {};
  const match = /repeat\((\d+)/.exec(String(style.gridTemplateColumns || ''));
  const columns = match ? Number(match[1]) : 0;
  return { cells: cells, columns: columns, rows: columns ? cells.length / columns : 0, style: style };
}

/* ---------- the 256 colour read ---------- */

suite.test('an 8bpp sheet reads 256 BGR555 words, and entry 200 is its own colour', function (t) {
  const { K } = openSheet();

  const pal = K.tile.readPaletteAt(PALETTE_AT);
  t.assert(pal, 'the palette reads');
  t.assertEqual(pal.length, 256, '256 entries come out of the rom, not sixteen');
  t.assertEqual(K.tile.getState().palette.length, 256, 'and the state holds all of them');
  t.assertEqual(K.tile.getState().paletteOffset, PALETTE_AT, 'the offset an edit writes to is remembered');
  t.assert(K.tile.getState().status.indexOf('256 colours') >= 0,
    'the status says how many were read: ' + K.tile.getState().status);
  t.assertDeepEqual(pal, K.tile.getState().palette, 'the state is exactly what was read');
  t.assertEqual(K.tile.paletteColours(), 256, 'the sheet asks for a 256 entry palette');

  /* Word 200 is 0x00C8: r5 8, g5 6, b5 0. */
  const expected = K.tile.fromBgr555(200 & 0xFF, (200 >> 8) & 0xFF);
  t.assertDeepEqual(pal[200], expected, 'entry 200 is the word at index 200, decoded');
  t.assert(colourText(pal[200]) !== colourText(pal[5]), 'index 200 and index 5 are two different colours');
  t.assertEqual(K.tile.colourAt(200), 'rgb(' + colourText(pal[200]) + ')',
    'the canvas paints index 200 with entry 200');
  t.assertEqual(K.tile.colourAt(5), 'rgb(' + colourText(pal[5]) + ')', 'and index 5 with entry 5');
  /* The ramp sixteen entries clamp to: every index above 15 used to become colour 15. */
  t.assert(K.tile.colourAt(200) !== 'rgb(255,255,217)',
    'index 200 did not fall back to the ramp, got ' + K.tile.colourAt(200));

  /* The 512 byte block is the whole palette: the word after it is the next thing in the
     rom, so a read that ran past its end would show up here. */
  t.assert(K.tile.readPaletteAt(PALETTE_AT + PALETTE_BYTES) !== null, 'the offset after the block is still readable');
  t.assert(colourText(K.tile.readPaletteAt(PALETTE_AT)[255]) === colourText(K.tile.fromBgr555(255, 0)),
    'entry 255 is the last word of the block');
});

/* ---------- pixels and bytes ---------- */

suite.test('tilesToRgba and rgbaToTiles round trip a gba-8bpp sheet byte for byte', function (t) {
  const { K, fixture } = openSheet();
  const rom = fixture.rom;
  const palette = K.tile.readPaletteAt(PALETTE_AT);
  const image = K.core.tilesToRgba(rom, { at: SOURCE_AT, format: 'gba-8bpp', count: TILES, palette: palette });

  t.assertEqual(image.width, 8, 'a tile is eight pixels wide');
  t.assertEqual(image.height, TILES * 8, 'the sheet is one column of tiles');
  t.assertEqual(image.pixels.length, 8 * TILES * 8 * 4, 'four bytes a pixel');

  const high = highPixels(K, rom, SOURCE_AT, TILES);
  t.assert(high.length > 0, 'the sampled tiles hold indices above 15 (' + high.length + ' pixels)');

  /* Every pixel above 15 carries its own entry: the ramp would give them all one colour. */
  for (let i = 0; i < Math.min(high.length, 8); i++) {
    const px = high[i];
    t.assertEqual(rgbaAt(image.pixels, 8, px.x, px.y + px.tile * 8).join(','), colourText(palette[px.index]),
      'pixel index ' + px.index + ' at (' + px.x + ',' + px.y + ') is palette entry ' + px.index);
  }

  const back = K.core.rgbaToTiles(image.pixels, { width: image.width, height: image.height, format: 'gba-8bpp', palette: palette });
  t.assertEqual(back.count, TILES, 'the same number of tiles comes back');
  t.assertEqual(back.bytes.length, TILES * TILE_BYTES, 'and the format\'s bytes per tile');
  t.assertDeepEqual(Array.from(back.bytes), Array.from(rom.subarray(SOURCE_AT, SOURCE_AT + TILES * TILE_BYTES)),
    'every byte of the sheet came back, indices above 15 included');
});

/* ---------- PNG out and back in ---------- */

suite.test('a PNG of an 8bpp sheet imports back byte for byte, indices above 15 included', function (t) {
  const { env, K } = openSheet();
  const source = K.hex.getSourceBytes();
  const palette = K.tile.readPaletteAt(PALETTE_AT);
  const high = highPixels(K, source, SOURCE_AT, TILES);
  t.assert(high.length > 0, 'the exported tiles hold indices above 15 (' + high.length + ' pixels)');

  const exported = K.tile.exportTilesPng({ at: SOURCE_AT, count: TILES });
  t.assert(exported && exported.bytes, 'the export hands the file back');
  t.assert(exported.name.indexOf('gba-8bpp') >= 0, 'the name carries the format: ' + exported.name);
  const shot = decodePng(env, exported.bytes);
  t.assert(shot !== null, 'pngChunks and decodeScreenshot read the file');
  t.assertEqual(shot.width + 'x' + shot.height, '8x16', 'two 8bpp tiles in one column');

  /* The PNG itself, before any import: an index above 15 is painted with its own entry and
     not with the colour sixteen entries would clamp it to. */
  for (let i = 0; i < Math.min(high.length, 8); i++) {
    const px = high[i];
    t.assertEqual(rgbaAt(shot.pixels, shot.width, px.x, px.y + px.tile * 8).join(','), colourText(palette[px.index]),
      'the PNG pixel of index ' + px.index + ' is palette entry ' + px.index);
  }

  const written = K.tile.importTilesPng(exported.bytes, { at: DESTINATION, count: TILES, inflate: zlib.inflateSync });
  t.assert(written, 'the import ran');
  t.assertEqual(written.count, TILES, 'two tiles were offered');
  t.assertEqual(written.pixels, TILES * 64, 'and all of their pixels');

  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, source.length, 'the image did not grow');
  /* The destination is 0xAA everywhere, so every one of its bytes is a pixel whose colour
     differs from the source; the import writes exactly those bytes and nothing else. */
  let expectedToChange = 0;
  for (let tile = 0; tile < TILES; tile++) {
    const from = K.core.decodeTile(source, SOURCE_AT + tile * TILE_BYTES, 'gba-8bpp');
    const to = K.core.decodeTile(source, DESTINATION + tile * TILE_BYTES, 'gba-8bpp');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (from[y][x] !== to[y][x]) expectedToChange++;
  }
  const diff = diffOffsets(source, patched);
  t.assertEqual(diff.length, expectedToChange, 'the pixels whose colour differs are the bytes that moved');
  t.assert(expectedToChange > 0, 'and that is every pixel of both tiles (' + expectedToChange + ' of ' + written.pixels + ')');
  t.assertDeepEqual(diff, rangeOffsets(DESTINATION, TILES * TILE_BYTES),
    'the two destination tiles moved, and nothing else in ' + ROM_SIZE + ' bytes');

  let highWritten = 0;
  for (let i = 0; i < TILES * TILE_BYTES; i++) {
    t.assertEqual(patched[DESTINATION + i], source[SOURCE_AT + i], 'destination byte ' + i + ' is the source byte');
    if ((source[SOURCE_AT + i] & 0xFF) > 15) highWritten++;
  }
  t.assert(highWritten > 15, 'and that comparison covers the pixels above index 15 (' + highWritten + ' of ' + (TILES * TILE_BYTES) + ')');
  t.assertEqual(K.hex.isPatched(DESTINATION), true, 'the first destination byte is a hex patch now');
});

/* ---------- one entry of the 512 byte block ---------- */

suite.test('writePaletteColour(200) writes exactly the two bytes of entry 200', function (t) {
  const { K } = openSheet();
  const source = K.hex.getSourceBytes();

  t.assertEqual(K.tile.writePaletteColour(200, { r: 255, g: 0, b: 255 }), true, 'the edit is written');
  const patched = K.hex.getPatchedBytes();
  t.assertDeepEqual(diffOffsets(source, patched), [PALETTE_AT + 400, PALETTE_AT + 401],
    'exactly the two bytes of entry 200, at the palette offset plus 200*2');
  t.assertEqual(patched[PALETTE_AT + 400], 0x1F, 'BGR555 low byte first');
  t.assertEqual(patched[PALETTE_AT + 401], 0x7C, 'then the high byte');
  t.assertDeepEqual(K.tile.getState().palette[200], { r: 255, g: 0, b: 255 },
    'and the editor holds the colour that was written');

  /* 512 bytes of palette: entry 255 is the last one and entry 256 is past the block. */
  t.assertEqual(K.tile.writePaletteColour(255, { r: 0, g: 255, b: 0 }), true, 'entry 255 is inside the palette');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    [PALETTE_AT + 400, PALETTE_AT + 401, PALETTE_AT + 510, PALETTE_AT + 511],
    'entry 255 wrote the last two bytes of the block and nothing else');
  t.assertEqual(K.tile.writePaletteColour(256, { r: 1, g: 2, b: 3 }), false, 'index 256 is outside the palette');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()),
    [PALETTE_AT + 400, PALETTE_AT + 401, PALETTE_AT + 510, PALETTE_AT + 511],
    'and the refused edit wrote nothing');
});

/* ---------- the old widths, unchanged ---------- */

suite.test('a 4bpp sheet still reads sixteen colours and still refuses entry 200', function (t) {
  const { K } = openSheet({ format: 'gba-4bpp' });
  const source = K.hex.getSourceBytes();

  t.assertEqual(K.tile.paletteColours(), 16, 'a 4bpp sheet asks for sixteen entries');
  const pal = K.tile.readPaletteAt(PALETTE_AT);
  t.assert(pal, 'the palette reads');
  t.assertEqual(pal.length, 16, 'sixteen colours come out of the rom');
  t.assertEqual(K.tile.getState().palette.length, 16, 'and the state holds sixteen');
  t.assert(K.tile.getState().status.indexOf('16 colours') >= 0,
    'the status names sixteen: ' + K.tile.getState().status);
  t.assertEqual(K.tile.colourAt(15), 'rgb(' + colourText(pal[15]) + ')', 'index 15 is entry 15');
  t.assertEqual(K.tile.writePaletteColour(200, { r: 255, g: 0, b: 255 }), false,
    'a colour edit above the sixteenth entry has to be refused');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'and not one byte of the rom moved');

  /* The same words at the same offset: what the format changes is how many of them are the
     palette. The 2bpp and 1bpp layouts keep their sixteen entry block too. */
  K.tile.setFormat('gb-2bpp');
  t.assertEqual(K.tile.paletteColours(), 16, 'a 2bpp sheet reads the same sixteen entry block');
  K.tile.setFormat('gb-1bpp');
  t.assertEqual(K.tile.paletteColours(), 16, 'and so does a 1bpp one');
  K.tile.setFormat('gba-8bpp');
  t.assertEqual(K.tile.paletteColours(), 256, 'the same sheet read as 8bpp asks for 256 entries');
  t.assertEqual(K.tile.readPaletteAt(PALETTE_AT).length, 256, 'and reads all 256 words');
  K.tile.setFormat('gba-4bpp');
  K.tile.setMap({ depth: 8 });
  t.assertEqual(K.tile.paletteColours(), 256, 'the depth box alone asks for 8bpp and 256 entries');
});

/* ---------- the swatch strip ---------- */

suite.test('the swatch strip follows the format: sixteen cells, or a 16x16 grid', function (t) {
  const wide = swatchStrip(openSheet());
  t.assert(wide, 'the tab renders the swatch strip');
  t.assertEqual(wide.cells.length, 256, 'an 8bpp sheet gets a swatch for every entry');
  t.assertEqual(wide.columns, 16, 'laid out in 16 columns');
  t.assertEqual(wide.rows, 16, 'and 16 rows: a 16x16 grid');
  t.assert(wide.style.overflowY === 'auto', 'the grid is capped in height so the strip stays a strip');
  const last = wide.cells[255];
  t.assert(last && last.props.title.indexOf('Colour 255 ') === 0, 'the last cell is colour 255: ' + (last && last.props.title));

  const narrow = swatchStrip(openSheet({ format: 'gba-4bpp' }));
  t.assert(narrow, 'the tab renders the swatch strip for a 4bpp sheet too');
  t.assertEqual(narrow.cells.length, 16, 'a 4bpp sheet still gets sixteen swatches');
  t.assertEqual(narrow.rows, 1, 'in one row of sixteen, not a grid');
  t.assert(!narrow.style.overflowY, 'and it is not the scrolling wide grid');
});

module.exports = { suite: suite };
