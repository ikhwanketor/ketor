/* The two pure pieces an image export is built from: tiles to pixels and back
   (core/tile-image.js), and pixels to a PNG file (core/png-writer.js).

   Nothing here needs a canvas. The workbench harness has no getContext and no
   createImageData, so a test that passed would be a test of the stub; what is
   checked instead is the thing the export promises to a user: the bytes of a
   synthetic rom come out of the pixel buffer unchanged, and the PNG is taken
   apart by the project's own reader - pngChunks and decodeScreenshot, the ones
   the save state tab already runs - and by zlib.inflateSync.

   The palettes below are injective on purpose. The round trip is byte for byte
   only when every index has a colour of its own: two entries the same colour
   would make the nearest-entry rule answer with the lower index, which is the
   honest behaviour and a different tile. */
'use strict';
const zlib = require('zlib');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile image');

/* The synthetic rom fills everything before its record region with 0xAA, so a
   sample from there is one flat colour. The records hold text bytes, which is
   where a round trip has something to compare. */
const REGION = 0x2000;

function palette256() {
  const out = [];
  for (let i = 0; i < 256; i++) out.push({ r: (i * 7 + 3) & 0xFF, g: (i * 13 + 5) & 0xFF, b: (i * 29 + 11) & 0xFF });
  return out;
}
function palette16() {
  const out = [];
  for (let i = 0; i < 16; i++) out.push({ r: i * 16, g: 255 - i * 16, b: (i * 37) & 0xFF });
  return out;
}
function palette4() {
  return [{ r: 0, g: 0, b: 0 }, { r: 85, g: 85, b: 85 }, { r: 170, g: 170, b: 170 }, { r: 255, g: 255, b: 255 }];
}

function env() { return loadWorkbench(); }
function isUint8(value) { return Object.prototype.toString.call(value) === '[object Uint8Array]'; }
function isClamped(value) { return Object.prototype.toString.call(value) === '[object Uint8ClampedArray]'; }
function u32be(bytes, at) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}
/* CRC-32 a bit at a time, so the answer does not come from the table the
   writer uses: the polynomial is the only shared thing between them. */
function crc32Bits(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] & 0xFF;
    for (let k = 0; k < 8; k++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function rgbaAt(pixels, width, x, y) {
  const at = (y * width + x) * 4;
  return [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]];
}

/* One case per format: a sheet of tiles in, the same rom bytes out. */
[
  { format: 'gba-4bpp', size: 32, at: REGION + 3 * 32, count: 6, palette: palette16() },
  { format: 'gba-8bpp', size: 64, at: REGION + 5 * 64, count: 5, palette: palette256() },
  { format: 'gb-2bpp', size: 16, at: REGION + 1 * 16, count: 8, palette: palette4() }
].forEach(function (spec) {
  suite.test(spec.format + ': ' + spec.count + ' tiles come back from the pixels byte for byte', function (t) {
    const e = env();
    const rom = buildSyntheticRom({ records: 48 }).rom;
    const image = e.K.core.tilesToRgba(rom, { at: spec.at, format: spec.format, count: spec.count, palette: spec.palette });
    t.assertEqual(image.width, 8, 'a tile is eight pixels wide');
    t.assertEqual(image.height, spec.count * 8, 'the sheet is one column of tiles');
    t.assertEqual(image.pixels.length, 8 * spec.count * 8 * 4, 'four bytes a pixel');
    t.assert(isClamped(image.pixels), 'the pixel buffer is a Uint8ClampedArray, the type a canvas would take');

    /* A flat fill would round trip whatever the codec did with it, so the
       sample has to hold more than one colour before the comparison means
       anything. */
    const colours = {};
    for (let i = 0; i < image.pixels.length; i += 4) colours[image.pixels[i] + ',' + image.pixels[i + 1] + ',' + image.pixels[i + 2]] = 1;
    t.assert(Object.keys(colours).length > 1, 'the sampled tiles hold more than one colour (got ' + Object.keys(colours).length + ')');

    const back = e.K.core.rgbaToTiles(image.pixels, { width: image.width, height: image.height, format: spec.format, palette: spec.palette });
    t.assertEqual(back.count, spec.count, 'the same number of tiles comes back');
    t.assertEqual(back.bytes.length, spec.count * spec.size, 'and the format\'s bytes per tile');
    for (let i = 0; i < back.bytes.length; i++) {
      if (back.bytes[i] !== rom[spec.at + i]) {
        t.assert(false, 'byte ' + i + ' differs at rom 0x' + (spec.at + i).toString(16) + ': rom 0x' + rom[spec.at + i].toString(16) + ', image 0x' + back.bytes[i].toString(16));
      }
    }
  });
});

suite.test('tilesToRgba paints each index with the palette entry of that number', function (t) {
  const e = env();
  /* Row 0 of a GBA 4bpp tile: 0x10 is pixel 0 and pixel 1, low nibble first. */
  const bytes = new Uint8Array(32);
  bytes[0] = 0x10; bytes[1] = 0x32; bytes[2] = 0x54; bytes[3] = 0x76;
  const palette = palette16();
  const image = e.K.core.tilesToRgba(bytes, { at: 0, format: 'gba-4bpp', count: 1, palette: palette });
  t.assertEqual(image.width, 8, 'one tile is eight wide');
  t.assertEqual(image.height, 8, 'and eight tall');
  t.assertEqual(rgbaAt(image.pixels, 8, 0, 0).join(','), [palette[0].r, palette[0].g, palette[0].b, 255].join(','), 'pixel 0 is colour 0, opaque');
  t.assertEqual(rgbaAt(image.pixels, 8, 1, 0).join(','), [palette[1].r, palette[1].g, palette[1].b, 255].join(','), 'pixel 1 is colour 1');
  t.assertEqual(rgbaAt(image.pixels, 8, 2, 0).join(','), [palette[2].r, palette[2].g, palette[2].b, 255].join(','), 'pixel 2 is colour 2');
  t.assertEqual(rgbaAt(image.pixels, 8, 7, 0).join(','), [palette[7].r, palette[7].g, palette[7].b, 255].join(','), 'and the high nibble of the last byte is pixel 7');
});

suite.test('a palette may be 0xRRGGBB numbers instead of {r,g,b} objects', function (t) {
  const e = env();
  const bytes = new Uint8Array(32);
  bytes[0] = 0x10; bytes[1] = 0x32; bytes[2] = 0x54; bytes[3] = 0x76;
  const numbers = e.K.core.tilesToRgba(bytes, { at: 0, format: 'gba-4bpp', count: 1, palette: [0x000000, 0xFF0000, 0x00FF00, 0x0000FF] });
  const objects = e.K.core.tilesToRgba(bytes, { at: 0, format: 'gba-4bpp', count: 1, palette: [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }] });
  for (let i = 0; i < numbers.pixels.length; i++) {
    if (numbers.pixels[i] !== objects.pixels[i]) t.assert(false, 'pixel byte ' + i + ' differs between the two palette forms');
  }
  t.assertEqual(rgbaAt(numbers.pixels, 8, 1, 0).join(','), '255,0,0,255', '0xFF0000 reads as red');
  /* Reading the number the other way round (0x0000FF as red) would show here. */
  t.assertEqual(rgbaAt(numbers.pixels, 8, 3, 0).join(','), '0,0,255,255', '0x0000FF reads as blue');
});

suite.test('a colour the palette does not hold takes the nearest entry', function (t) {
  const e = env();
  const palette = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }];
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 240; pixels[i + 1] = 10; pixels[i + 2] = 10; pixels[i + 3] = 255; }
  const back = e.K.core.rgbaToTiles(pixels, { width: 8, height: 8, format: 'gba-4bpp', palette: palette });
  const tile = e.K.core.decodeTile(back.bytes, 0, 'gba-4bpp');
  t.assertEqual(tile[0][0], 1, 'a near red pixel is written as the red entry');
  t.assertEqual(tile[7][7], 1, 'every pixel of the tile, not just the first');
  pixels[0] = 5; pixels[1] = 5; pixels[2] = 5;
  const dark = e.K.core.rgbaToTiles(pixels, { width: 8, height: 8, format: 'gba-4bpp', palette: palette });
  t.assertEqual(e.K.core.decodeTile(dark.bytes, 0, 'gba-4bpp')[0][0], 0, 'a near black pixel is written as the black entry');
});

suite.test('a colour past index 15 snaps to 15 in a 4bpp tile instead of a wild nibble', function (t) {
  const e = env();
  const palette = [];
  for (let i = 0; i < 20; i++) palette.push({ r: i * 12, g: 255 - i * 12, b: 40 });
  const wanted = palette[18];
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = wanted.r; pixels[i + 1] = wanted.g; pixels[i + 2] = wanted.b; pixels[i + 3] = 255; }
  const back = e.K.core.rgbaToTiles(pixels, { width: 8, height: 8, format: 'gba-4bpp', palette: palette });
  const tile = e.K.core.decodeTile(back.bytes, 0, 'gba-4bpp');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) t.assertEqual(tile[y][x], 15, 'pixel ' + x + ',' + y + ' is the last usable index');
  }
  /* 18 & 0x0F is 2, and 0x22 would be a colour the palette put at index 2 -
     a picture of the wrong colour, written without an error anywhere. */
  t.assertEqual(back.bytes[0], 0xFF, 'both nibbles of the byte are 15');
});

suite.test('count 0 is an empty image, and it turns back into zero tiles', function (t) {
  const e = env();
  const rom = buildSyntheticRom({ records: 48 }).rom;
  const image = e.K.core.tilesToRgba(rom, { at: REGION, format: 'gba-4bpp', count: 0, palette: palette16() });
  t.assertEqual(image.width, 8, 'still eight wide');
  t.assertEqual(image.height, 0, 'no tiles tall');
  t.assertEqual(image.pixels.length, 0, 'and no pixels');
  const back = e.K.core.rgbaToTiles(image.pixels, { width: image.width, height: image.height, format: 'gba-4bpp', palette: palette16() });
  t.assertEqual(back.count, 0, 'zero tiles back');
  t.assertEqual(back.bytes.length, 0, 'and no bytes');
});

suite.test('an unknown format is refused, a missing one is the 4bpp default', function (t) {
  const e = env();
  const rom = buildSyntheticRom({ records: 48 }).rom;
  t.assertEqual(e.K.core.tilesToRgba(rom, { at: 0, format: 'gba-9bpp', count: 1 }), null, 'tiles out of a format the codec does not have: null');
  t.assertEqual(e.K.core.rgbaToTiles(new Uint8ClampedArray(8 * 8 * 4), { width: 8, height: 8, format: 'gba-9bpp' }), null, 'pixels into it: null too');
  const fallback = e.K.core.tilesToRgba(rom, { at: REGION, count: 1 });
  t.assertEqual(fallback.height, 8, 'no format named falls back to the codec default');
  t.assertEqual(fallback.pixels.length, 8 * 8 * 4, 'one four bit per pixel tile');
  t.assertEqual(e.K.core.rgbaToTiles(fallback.pixels, { width: 8, height: 8 }).bytes.length, 32, 'and writes 32 byte tiles');
});

suite.test('encodePng writes signature, IHDR, IDAT, IEND and a real CRC on every chunk', function (t) {
  const e = env();
  const width = 5, height = 3;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + 11) & 0xFF;
  const png = e.K.core.encodePng(pixels, width, height);
  t.assert(isUint8(png), 'the writer hands back a Uint8Array');
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < signature.length; i++) t.assertEqual(png[i], signature[i], 'signature byte ' + i);

  const chunks = e.K.core.saveState.pngChunks(png);
  t.assert(chunks !== null, 'the project\'s own reader finds the chunks');
  const types = chunks.map(function (c) { return c.type; });
  t.assertEqual(types[0], 'IHDR', 'IHDR comes first');
  t.assertEqual(types[types.length - 1], 'IEND', 'IEND comes last');
  t.assert(types.filter(function (x) { return x === 'IDAT'; }).length >= 1, 'at least one IDAT');
  t.assertEqual(types.filter(function (x) { return x !== 'IHDR' && x !== 'IDAT' && x !== 'IEND'; }).length, 0, 'and nothing else');

  const ihdr = chunks[0];
  t.assertEqual(u32be(png, ihdr.at), width, 'IHDR width');
  t.assertEqual(u32be(png, ihdr.at + 4), height, 'IHDR height');
  t.assertEqual(png[ihdr.at + 8], 8, 'eight bits a channel');
  t.assertEqual(png[ihdr.at + 9], 6, 'colour type 6: RGBA');
  t.assertEqual(png[ihdr.at + 10], 0, 'deflate');
  t.assertEqual(png[ihdr.at + 11], 0, 'no filter method');
  t.assertEqual(png[ihdr.at + 12], 0, 'no interlace');

  /* Every chunk's CRC, recomputed a bit at a time from the type and the data. */
  for (const chunk of chunks) {
    const body = png.subarray(chunk.at - 4, chunk.at + chunk.length);
    t.assertEqual(u32be(png, chunk.at + chunk.length), crc32Bits(body), chunk.type + ' CRC');
  }

  /* The IDAT payload is a real zlib stream: filter byte 0 in front of every
     row, then the pixels. */
  let idat = [];
  for (const chunk of chunks) if (chunk.type === 'IDAT') idat = idat.concat(Array.from(png.subarray(chunk.at, chunk.at + chunk.length)));
  const raw = zlib.inflateSync(Buffer.from(idat));
  t.assertEqual(raw.length, height * (1 + width * 4), 'one filter byte and four bytes a pixel per row');
  for (let y = 0; y < height; y++) {
    t.assertEqual(raw[y * (1 + width * 4)], 0, 'row ' + y + ' carries filter 0');
    for (let x = 0; x < width * 4; x++) {
      t.assertEqual(raw[y * (1 + width * 4) + 1 + x], pixels[y * width * 4 + x], 'pixel byte ' + x + ' of row ' + y);
    }
  }

  /* The Adler-32 at the tail is the one zlib verifies: flip a bit in it and
     the stream stops being readable. */
  const last = chunks.filter(function (c) { return c.type === 'IDAT'; }).pop();
  const damaged = png.slice();
  damaged[last.at + last.length - 1] = damaged[last.at + last.length - 1] ^ 0xFF;
  t.assertEqual(e.K.core.saveState.decodeScreenshot(damaged, chunks, zlib.inflateSync), null, 'a damaged checksum is refused');
});

suite.test('the PNG decodes back to exactly the pixels that went in', function (t) {
  const e = env();
  const width = 9, height = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 53 + 7) & 0xFF;
  const png = e.K.core.encodePng(pixels, width, height);
  const chunks = e.K.core.saveState.pngChunks(png);
  const shot = e.K.core.saveState.decodeScreenshot(png, chunks, zlib.inflateSync);
  t.assert(shot !== null, 'decodeScreenshot reads the file');
  t.assertEqual(shot.width, width, 'width');
  t.assertEqual(shot.height, height, 'height');
  t.assertEqual(shot.bpp, 4, 'four bytes a pixel, so colour type 6');
  t.assertEqual(shot.pixels.length, pixels.length, 'the same number of bytes');
  for (let i = 0; i < pixels.length; i++) {
    if (shot.pixels[i] !== pixels[i]) t.assert(false, 'pixel byte ' + i + ' differs: wrote ' + pixels[i] + ', read ' + shot.pixels[i]);
  }
});

suite.test('a 0x0 image does not throw: the chunks are real and read back empty', function (t) {
  const e = env();
  const png = e.K.core.encodePng(new Uint8ClampedArray(0), 0, 0);
  t.assert(isUint8(png), 'still a Uint8Array');
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < signature.length; i++) t.assertEqual(png[i], signature[i], 'signature byte ' + i);
  const chunks = e.K.core.saveState.pngChunks(png);
  t.assertEqual(chunks.map(function (c) { return c.type; }).join(','), 'IHDR,IDAT,IEND', 'IHDR, one IDAT and IEND');
  t.assertEqual(u32be(png, chunks[0].at), 0, 'width 0 as asked');
  t.assertEqual(u32be(png, chunks[0].at + 4), 0, 'height 0 as asked');
  for (const chunk of chunks) {
    const body = png.subarray(chunk.at - 4, chunk.at + chunk.length);
    t.assertEqual(u32be(png, chunk.at + chunk.length), crc32Bits(body), chunk.type + ' CRC');
  }
  const shot = e.K.core.saveState.decodeScreenshot(png, chunks, zlib.inflateSync);
  t.assert(shot !== null, 'the reader takes the degenerate image apart');
  t.assertEqual(shot.width + 'x' + shot.height, '0x0', 'and says it is empty');
  t.assertEqual(shot.pixels.length, 0, 'with no pixels');
  /* A null pixel buffer with a real size is read as transparent black rather
     than throwing, which is what keeps the writer total. */
  const black = e.K.core.encodePng(null, 1, 1);
  const shot2 = e.K.core.saveState.decodeScreenshot(black, e.K.core.saveState.pngChunks(black), zlib.inflateSync);
  t.assertEqual(Array.from(shot2.pixels).join(','), '0,0,0,0', 'missing pixels read as zero');
});

module.exports = { suite };
