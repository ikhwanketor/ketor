/* The tile codec's layout table and its byte vectors.

   core/tile-codec.js is the one place that knows how a tile is laid out; the editor, the
   font tools, the map codec, the VRAM reader and the PNG import all read it through
   decodeTile/encodeTile/tileSize. A round trip (decode then encode gives the same bytes)
   proves the two directions are inverses of each other and nothing else: two layouts that
   are wrong in mirror image pass it. So this suite does both:

     - it asserts the format table row by row, so a batch that adds or changes a format has
       to say what the format is: bytes per tile, colour count, layout kind, groups and
       which nibble holds the even pixel;
     - it pins hand computed byte vectors, one per layout kind plus both nibble orders, so
       a swapped nibble or a flipped bit order fails on a number worked out on paper
       rather than on a mutual inverse.

   The random samples are deterministic: a linear congruential generator with a fixed seed,
   never Math.random, so a failure here is reproducible.

   The nine formats below are the ones the consoles in this project actually use. A new
   row in the table without a new row here is a test failure on purpose. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-codec');

/* Hand copied from core/tile-codec.js, not read out of it: a test that reads the table it
   asserts cannot notice a changed row. groups and hiFirst are undefined where the layout
   has no such idea - planar1, nibble and byte8 carry no groups key and only the nibble
   layouts carry hiFirst. */
const EXPECTED_FORMATS = [
  { id: 'gb-2bpp',      size: 16, colors: 4,   kind: 'planar',  groups: 1,    hiFirst: undefined },
  { id: 'nes-2bpp',     size: 16, colors: 4,   kind: 'planar',  groups: 1,    hiFirst: undefined },
  { id: 'gb-1bpp',      size: 8,  colors: 2,   kind: 'planar1', groups: undefined, hiFirst: undefined },
  { id: 'snes-2bpp',    size: 16, colors: 4,   kind: 'planar',  groups: 1,    hiFirst: undefined },
  { id: 'snes-4bpp',    size: 32, colors: 16,  kind: 'planar',  groups: 2,    hiFirst: undefined },
  { id: 'snes-8bpp',    size: 64, colors: 256, kind: 'planar',  groups: 4,    hiFirst: undefined },
  { id: 'gba-4bpp',     size: 32, colors: 16,  kind: 'nibble',  groups: undefined, hiFirst: false },
  { id: 'genesis-4bpp', size: 32, colors: 16,  kind: 'nibble',  groups: undefined, hiFirst: true },
  { id: 'gba-8bpp',     size: 64, colors: 256, kind: 'byte8',   groups: undefined, hiFirst: undefined }
];

const SAMPLES = 300;          // per format, as the batch asks
const LCG_MUL = 1664525;
const LCG_ADD = 1013904223;

/* One byte per call out of a 32 bit state, so the sample is the same on every machine. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = ((state * LCG_MUL) + LCG_ADD) >>> 0;
    return state >>> 24;
  };
}

function zeros(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(0);
  return out;
}

function bytesOf(size, pairs) {
  const out = new Uint8Array(size);
  Object.keys(pairs || {}).forEach(function (at) { out[Number(at)] = pairs[at]; });
  return out;
}

/* One row as a string of digits, the way a hand written 1bpp vector reads. */
function rowOf(tile, y) { return tile[y].join(''); }

suite.test('the format table is these nine rows, with this size, colour count and layout', function (t) {
  const K = loadWorkbench().K;
  const table = K.core.TILE_FORMATS;

  t.assertDeepEqual(Object.keys(table).sort(), EXPECTED_FORMATS.map(function (f) { return f.id; }).sort(),
    'nine formats: this batch adds none and renames none');

  EXPECTED_FORMATS.forEach(function (want) {
    const f = table[want.id];
    t.assert(f, 'the table has a row for ' + want.id);
    t.assertEqual(f.id, want.id, want.id + '.id');
    t.assertEqual(f.size, want.size, want.id + '.size');
    t.assertEqual(f.colors, want.colors, want.id + '.colors');
    t.assertEqual(f.kind, want.kind, want.id + '.kind');
    t.assertEqual(f.groups, want.groups, want.id + '.groups');
    t.assertEqual(f.hiFirst, want.hiFirst, want.id + '.hiFirst');
    t.assertEqual(f.width, 8, want.id + '.width');
    t.assertEqual(f.height, 8, want.id + '.height');
    t.assertEqual(typeof f.label, 'string', want.id + ' has a label for the format box');
    /* tileSize is the table's size, so the editor and the codec cannot disagree about how
       far the next tile of a sheet sits. */
    t.assertEqual(K.core.tileSize(want.id), want.size, 'tileSize(' + want.id + ')');
  });

  /* A missing id is the default format, an empty string as well: that is the "no choice
     made yet" case the editor starts from. */
  t.assertEqual(K.core.tileFormat(undefined).id, 'gba-4bpp', 'no id means the default');
  t.assertEqual(K.core.tileFormat('').id, 'gba-4bpp', 'an empty id means the default');
  t.assertEqual(K.core.tileFormat('gba-4bpp').size, 32, 'the default is the 32 byte GBA 4bpp layout');
});

/* ---------- hand computed vectors ---------- */

/* gba-4bpp is 'nibble' with hiFirst false: byte 0x0F is two pixels, the low nibble is the
   even pixel (x = 0) and the high nibble the odd one (x = 1). 0x0F = 0b00001111, so
   x = 0 reads 15 and x = 1 reads 0 and the rest of the row is pixels 0, 0, 0, 0, 0, 0:
   the row is [15,0,0,0,0,0,0,0]. The Mega Drive nibble layout reads the same byte the
   other way round: [0,15,0,0,0,0,0,0]. Both directions are pinned (decode and encode),
   because a decode and an encode that swap the nibble in the same way would pass a round
   trip and still draw every pair of pixels in the wrong order. */
suite.test('the nibble order is pinned by hand: 0x0F is 15 then 0 on GBA, 0 then 15 on the Mega Drive', function (t) {
  const K = loadWorkbench().K;

  const gba = K.core.decodeTile(bytesOf(32, { 0: 0x0F }), 0, 'gba-4bpp');
  t.assertDeepEqual(gba[0], [15, 0, 0, 0, 0, 0, 0, 0], 'gba-4bpp: the low nibble is the even pixel');
  t.assertDeepEqual(gba[1], zeros(8), 'and the next row is the next four bytes');
  t.assertDeepEqual(Array.from(K.core.encodeTile(gba, 'gba-4bpp')).slice(0, 4), [0x0F, 0, 0, 0],
    'encoding those pixels writes the byte back');

  const md = K.core.decodeTile(bytesOf(32, { 0: 0x0F }), 0, 'genesis-4bpp');
  t.assertDeepEqual(md[0], [0, 15, 0, 0, 0, 0, 0, 0], 'genesis-4bpp: the high nibble is the even pixel');
  t.assertDeepEqual(Array.from(K.core.encodeTile(md, 'genesis-4bpp')).slice(0, 4), [0x0F, 0, 0, 0],
    'and it is the same byte, read the other way');
});

/* snes-4bpp is 'planar' with two groups of 16 bytes. Group 0 holds bit planes 0 and 1,
   group 1 holds planes 2 and 3; in a group the first byte of a row is the lower plane and
   bit 7 is the leftmost pixel. With plane0 = 0xAA (10101010), plane1 = 0x0F (00001111) and
   plane2 = 0xFF (11111111) the row is, bit by bit from x = 0:

     x       0  1  2  3  4  5  6  7
     plane0  1  0  1  0  1  0  1  0
     plane1  0  0  0  0  1  1  1  1
     plane2  1  1  1  1  1  1  1  1
     value   5  4  5  4  7  6  7  6     (plane0*1 + plane1*2 + plane2*4)

   That number is what the batch asked for and what the decode has to produce. */
suite.test('snes-4bpp planes 0xAA / 0x0F / 0xFF decode to 5,4,5,4,7,6,7,6', function (t) {
  const K = loadWorkbench().K;
  const bytes = bytesOf(32, { 0: 0xAA, 1: 0x0F, 16: 0xFF });

  const tile = K.core.decodeTile(bytes, 0, 'snes-4bpp');
  t.assertDeepEqual(tile[0], [5, 4, 5, 4, 7, 6, 7, 6], 'row 0 is the hand computed vector');
  for (let y = 1; y < 8; y++) t.assertDeepEqual(tile[y], zeros(8), 'row ' + y + ' is empty');

  t.assertDeepEqual(Array.from(K.core.encodeTile(tile, 'snes-4bpp')), Array.from(bytes),
    'and the pixels go back to exactly the 32 bytes they came from');
});

/* gb-2bpp is 'planar' with one group and planes 0 and 1. Same two bytes, one group: the
   planes are the same bits as the SNES case, so the values are 1,0,1,0,3,2,3,2. */
suite.test('gb-2bpp planes 0xAA / 0x0F decode to 1,0,1,0,3,2,3,2', function (t) {
  const K = loadWorkbench().K;
  const bytes = bytesOf(16, { 0: 0xAA, 1: 0x0F });

  const tile = K.core.decodeTile(bytes, 0, 'gb-2bpp');
  t.assertDeepEqual(tile[0], [1, 0, 1, 0, 3, 2, 3, 2], 'row 0 is the hand computed vector');
  t.assertDeepEqual(Array.from(K.core.encodeTile(tile, 'gb-2bpp')), Array.from(bytes),
    'and the pixels go back to exactly the 16 bytes they came from');
});

/* gb-1bpp is 'planar1': one byte per row, bit 7 is the leftmost pixel, no planes at all.
   0x81 = 10000001 is pixel 1 at x = 0 and x = 7 and 0 everywhere else. */
suite.test('gb-1bpp byte 0x81 is 1,0,0,0,0,0,0,1', function (t) {
  const K = loadWorkbench().K;
  const bytes = bytesOf(8, { 0: 0x81, 7: 0xFF });

  const tile = K.core.decodeTile(bytes, 0, 'gb-1bpp');
  t.assertEqual(rowOf(tile, 0), '10000001', 'bit 7 is x = 0 and bit 0 is x = 7');
  t.assertEqual(rowOf(tile, 7), '11111111', 'and every byte is one row');
  t.assertDeepEqual(Array.from(K.core.encodeTile(tile, 'gb-1bpp')), Array.from(bytes),
    'and the pixels go back to exactly the 8 bytes they came from');
});

/* gba-8bpp is 'byte8': one byte per pixel, 64 bytes, row by row. */
suite.test('gba-8bpp is one byte per pixel: 0..15 is 01234567 / 89ABCDEF as indices 0..15', function (t) {
  const K = loadWorkbench().K;
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) bytes[i] = i;

  const tile = K.core.decodeTile(bytes, 0, 'gba-8bpp');
  t.assertDeepEqual(tile[0], [0, 1, 2, 3, 4, 5, 6, 7], 'row 0');
  t.assertDeepEqual(tile[1], [8, 9, 10, 11, 12, 13, 14, 15], 'row 1');
  t.assertDeepEqual(tile[7], [56, 57, 58, 59, 60, 61, 62, 63], 'row 7');
  t.assertDeepEqual(Array.from(K.core.encodeTile(tile, 'gba-8bpp')), Array.from(bytes),
    'and the pixels go back to exactly the 64 bytes they came from');
});

/* ---------- every format, both directions, on random bytes ---------- */

suite.test('all nine formats round trip byte for byte on 300 deterministic samples each', function (t) {
  const K = loadWorkbench().K;

  EXPECTED_FORMATS.forEach(function (want) {
    const next = makeRandom(0x5EED ^ (want.size * 7919) ^ want.colors);
    for (let n = 0; n < SAMPLES; n++) {
      /* The sample is not always at offset 0 and the buffer has a tail, so the offset
         argument and the end of the buffer are exercised with the same bytes. */
      const offset = n % 24;
      const buffer = new Uint8Array(offset + want.size + (n % 5));
      for (let i = 0; i < buffer.length; i++) buffer[i] = next();

      const tile = K.core.decodeTile(buffer, offset, want.id);
      t.assertEqual(tile.length, 8, want.id + ' sample ' + n + ' has eight rows');
      t.assertEqual(tile[0].length, 8, want.id + ' sample ' + n + ' has eight columns');

      const again = K.core.encodeTile(tile, want.id);
      t.assertEqual(again.length, want.size, want.id + ' sample ' + n + ' encodes ' + want.size + ' bytes');
      for (let i = 0; i < want.size; i++) {
        t.assertEqual(again[i], buffer[offset + i], want.id + ' sample ' + n + ': byte ' + i + ' of the round trip');
      }
      t.assertEqual(K.core.tileRoundTrip(buffer, offset, want.id), true, want.id + ' sample ' + n + ' reports the round trip');
    }
  });
});

/* ---------- what the console names buy ---------- */

/* gb-2bpp, nes-2bpp and snes-2bpp have the same layout: 16 bytes, four colours, one group,
   bit 7 leftmost. The ids stay separate because each console names the format it uses in
   its profile, and the editor shows that name; the codec treats them as one layout. This
   case documents the finding instead of collapsing the ids: a batch that removes them
   would change every console-profiles.tileFormats list. */
suite.test('gb-2bpp, nes-2bpp and snes-2bpp are the same layout for the same bytes', function (t) {
  const K = loadWorkbench().K;
  const next = makeRandom(0xA11A5);

  for (let n = 0; n < SAMPLES; n++) {
    const buffer = new Uint8Array(16);
    for (let i = 0; i < 16; i++) buffer[i] = next();

    const gb = K.core.decodeTile(buffer, 0, 'gb-2bpp');
    const nes = K.core.decodeTile(buffer, 0, 'nes-2bpp');
    const snes = K.core.decodeTile(buffer, 0, 'snes-2bpp');
    t.assertDeepEqual(nes, gb, 'sample ' + n + ': the NES 2bpp layout is the Game Boy one');
    t.assertDeepEqual(snes, gb, 'sample ' + n + ': the SNES 2bpp layout is the Game Boy one');

    const bytes = Array.from(K.core.encodeTile(gb, 'gb-2bpp'));
    t.assertDeepEqual(Array.from(K.core.encodeTile(nes, 'nes-2bpp')), bytes, 'sample ' + n + ': and the encode agrees too');
    t.assertDeepEqual(Array.from(K.core.encodeTile(snes, 'snes-2bpp')), bytes, 'sample ' + n + ': and so does the SNES one');
  }
});

/* ---------- a format id the table does not know ---------- */

/* Two modules disagree about an unknown id, and this case pins both sides as they are.

   core/tile-codec.js formatOf() falls back to gba-4bpp in silence, and its tileSize() does
   formatOf(id).size, so an unknown id is a 32 byte tile with no error anywhere.
   core/tile-image.js formatIdOf() answers null for the same id - its own comment says a
   typo on an export would otherwise draw half a picture in silence - and tilesToRgba /
   rgbaToTiles return null. So the same typo is a wrong picture through the codec and a
   refusal through the image layer.

   TODO(batch): unify the guard - make tileFormat return null for an id the table does not
   have - is NOT safe today, and this case is why. tileSize is called at more than thirty
   sites that dereference .size immediately: core/block-kinds.js:67, core/font-codec.js:263
   and :305, core/map-codec.js:188, core/gba-vram.js:189 and :229, and about twenty five
   places in ui/ketor-tile-activity.js. A null there is a TypeError in the middle of a
   render instead of the silent default. Unifying the guard therefore means changing
   tileSize and every one of those call sites first; until then the old behaviour is pinned
   here on purpose. */
suite.test('an unknown format id: the codec silently reads gba-4bpp, the image layer returns null', function (t) {
  const K = loadWorkbench().K;
  const unknown = 'gba-4bpp-typo';

  t.assert(!Object.prototype.hasOwnProperty.call(K.core.TILE_FORMATS, unknown), 'the table really does not know this id');

  t.assertEqual(K.core.tileFormat(unknown).id, 'gba-4bpp', 'the codec falls back to the default in silence');
  t.assert(K.core.tileFormat(unknown) === K.core.TILE_FORMATS['gba-4bpp'], 'the same row object, not a copy');
  t.assertEqual(K.core.tileSize(unknown), 32, 'and the tile size follows the default');
  t.assertDeepEqual(K.core.decodeTile(bytesOf(32, { 0: 0x0F }), 0, unknown)[0], [15, 0, 0, 0, 0, 0, 0, 0],
    'so an unknown id decodes as GBA 4bpp');

  const bytes = bytesOf(32, { 0: 0x0F });
  t.assertEqual(K.core.tilesToRgba(bytes, { at: 0, count: 1, format: unknown }), null,
    'the image layer refuses the same id');
  t.assertEqual(K.core.rgbaToTiles(new Uint8ClampedArray(8 * 8 * 4), { width: 8, height: 8, format: unknown }), null,
    'and so does the way back');
  t.assert(K.core.tilesToRgba(bytes, { at: 0, count: 1 }) !== null,
    'a missing format is not an unknown one: it is the default, and that read still works');
});

/* ---------- a buffer that is too short ---------- */

/* decodeTile answers a blank tile and tileRoundTrip answers false when the window does not
   fit, so a sheet at the end of a ROM shows empty tiles instead of throwing or reading the
   next allocation. */
suite.test('a window past the end of the buffer is a blank tile, not an exception', function (t) {
  const K = loadWorkbench().K;
  const short = bytesOf(16, { 0: 0xFF, 1: 0xFF });

  const tile = K.core.decodeTile(short, 0, 'gba-4bpp');
  t.assertDeepEqual(tile, [zeros(8), zeros(8), zeros(8), zeros(8), zeros(8), zeros(8), zeros(8), zeros(8)],
    'the 32 byte layout does not fit in 16 bytes');
  t.assertEqual(K.core.tileRoundTrip(short, 0, 'gba-4bpp'), false, 'and the round trip says so');
  t.assertEqual(K.core.tileRoundTrip(short, -1, 'gba-4bpp'), false, 'a negative offset is refused too');
});

module.exports = { suite: suite };
