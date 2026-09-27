/* The tile editor writes a pixel back into the rom byte the console reads.

   A painted pixel is not an edit to a copy of the sheet: the byte goes through the Hex
   Editor patch layer, which is where Clear, Undo, Redo and Export all look. These gates
   are byte for byte: paint one pixel, ask the patch layer for the patched image and for
   the loaded file, and check that the two differ in exactly the one byte the 4bpp layout
   names, with the nibble on the side the GBA keeps it, and that nothing else in the
   0x40000 bytes moved. The negative cases - a colour that is already there, a tile that
   does not fit the region window - have to leave the image untouched. The feature is
   already there; what these pin down is that no later change to the codec or the window
   can move that pixel somewhere else in silence. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-writeback');

const REGION = 0x100;
const ROM_SIZE = 0x40000;
/* The fixture fills everything up to its record region with 0xAA, so a 4bpp pixel
   read from 0x100 is colour 0xA on both nibbles of every byte. */
const UNPAINTED = 0xAA;

function openSheet() {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  env.K.tile.setRegion(REGION);
  env.K.tile.setFormat('gba-4bpp');
  return env;
}

/* Undo every patch, so one case cannot colour another case's diff. */
function clearPatches(K) {
  let guard = 0;
  while (K.hex.undo() && guard < ROM_SIZE) guard++;
}

/* Every offset whose byte differs, so a case can say "exactly this one" instead of
   trusting a spot check that never looks at the other 262143 bytes. */
function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  }
  return out;
}

suite.test('a tile of the region reads the bytes the layout names', function (t) {
  const env = openSheet();
  const win = env.K.tile.regionWindow();
  t.assertEqual(win.start, REGION, 'the window should start at the region');
  t.assertEqual(win.bytes.length, 32 * 128, '128 four bit per pixel tiles fit the window');
  const tile = env.K.tile.readTile(0);
  t.assertEqual(tile[0][0], 0xA, 'the 0xAA byte reads as colour 0xA');
  t.assertEqual(tile[7][7], 0xA, 'and every pixel of the tile is that colour');
});

suite.test('one pixel becomes the low nibble of the first byte of its tile', function (t) {
  const env = openSheet();
  const K = env.K;
  const before = K.hex.getPatchedBytes();
  t.assertEqual(K.tile.setPixel(0, 0, 0, 1), true, 'painting a pixel should report a write');
  const after = K.hex.getPatchedBytes();
  t.assertEqual(after.length, before.length, 'the image should not grow');
  t.assertDeepEqual(diffOffsets(before, after), [REGION], 'exactly the first tile byte should change');
  t.assertEqual(after[REGION], 0xA1, 'x=0 is the low nibble: 0xAA -> 0xA1');
  t.assertEqual(K.tile.readTile(0)[0][0], 1, 'the sheet is read back through the patch layer');
});

suite.test('a pixel in another row, and in another tile, lands on its own byte', function (t) {
  const env = openSheet();
  const K = env.K;
  const before = K.hex.getPatchedBytes();

  t.assertEqual(K.tile.setPixel(0, 5, 3, 2), true, 'row 3, column 5 should be writable');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [REGION + 0x0E],
    'x=5 y=3 is byte y*4 + (x>>1) = 0x0E');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 0x0E], 0x2A, 'x=5 is the high nibble: 0xAA -> 0x2A');

  clearPatches(K);
  t.assertEqual(diffOffsets(before, K.hex.getPatchedBytes()).length, 0, 'undo leaves the image clean');

  t.assertEqual(K.tile.setPixel(3, 0, 0, 4), true, 'the fourth tile should be writable');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [REGION + 0x60],
    'tile 3 starts 3 * 32 bytes into the region');
  t.assertEqual(K.hex.getPatchedBytes()[REGION + 0x60], 0xA4, 'x=0 is the low nibble again: 0xAA -> 0xA4');
});

suite.test('nothing else in the whole rom moves, and the loaded file stays untouched', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  t.assertEqual(source.length, ROM_SIZE, 'the fixture is 0x40000 bytes');

  K.tile.setPixel(0, 0, 0, 1);
  const patched = K.hex.getPatchedBytes();
  t.assertEqual(patched.length, ROM_SIZE, 'the patched image has the same length');
  t.assertDeepEqual(diffOffsets(source, patched), [REGION], 'all 0x40000 bytes differ in exactly one offset');
  t.assertEqual(source[REGION], UNPAINTED, 'the loaded buffer still holds 0xAA');
  t.assert(K.hex.getSourceBytes() === K.hex.getState().romBytes,
    'the source bytes are the loaded buffer itself, not a copy of it');
  t.assertEqual(K.hex.isPatched(REGION), true, '0x100 is a patch now');
});

suite.test('undo takes the pixel back out of the patch layer', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();
  K.tile.setPixel(0, 0, 0, 1);
  t.assertEqual(K.hex.undo(), true, 'the pixel is one undo step');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'the image is the loaded file again');
  t.assertEqual(K.hex.isPatched(REGION), false, 'and 0x100 is no longer patched');
  t.assertEqual(K.tile.readTile(0)[0][0], 0xA, 'the sheet reads colour 0xA again');
});

suite.test('a colour already there and a tile outside the window write nothing', function (t) {
  const env = openSheet();
  const K = env.K;
  const source = K.hex.getSourceBytes();

  t.assertEqual(K.tile.setPixel(0, 0, 0, 0xA), false, 'the pixel is already colour 0xA');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'so no byte was written');

  K.tile.setRegion(ROM_SIZE - 0x100);
  const win = K.tile.regionWindow();
  t.assertEqual(win.start, ROM_SIZE - 0x100, 'the window moved to the end of the rom');
  t.assertEqual(win.bytes.length, 0x100, 'and only the bytes that are left fit in it');
  t.assertEqual(K.tile.setPixel(127, 0, 0, 1), false, 'the last tile of the sheet does not fit');
  t.assertEqual(K.tile.setPixel(200, 0, 0, 1), false, 'nor does a tile past the sheet');
  t.assertDeepEqual(diffOffsets(source, K.hex.getPatchedBytes()), [], 'and still no byte was written');
});

module.exports = { suite: suite };
