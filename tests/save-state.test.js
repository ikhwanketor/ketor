/* The save state reader, checked against a state built here byte by byte: a PNG with the
   screenshot in IDAT and the machine's memory in a gbAs chunk, exactly the way VBA-M writes
   one. No file from a user is needed to know that the blocks, the palette and the glyphs come
   out right. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('save state');


const win = { Ketor: {}, console: console, Buffer: Buffer };
win.window = win;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'core', 'save-state.js'), 'utf8'),
  win, { filename: 'save-state.js' }
);
const SS = win.Ketor.core.saveState;

/* CRC32 for the PNG chunks the fixture is made of. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* The state: 0x400 of registers, then IWRAM, EWRAM, VRAM, palette, OAM and IO. */
const HEADER = 0x400;
const IWRAM = 0x8000, EWRAM = 0x40000, VRAM = 0x18000, PALETTE = 0x400, OAM = 0x400, IO = 0x400;
const VRAM_AT = HEADER + IWRAM + EWRAM;
const PALETTE_AT = VRAM_AT + VRAM;
function buildState() {
  const state = Buffer.alloc(HEADER + IWRAM + EWRAM + VRAM + PALETTE + OAM + IO);
  /* tile 0: four bytes a row, two pixels each - 1 2 3 4 5 6 7 8 on the first row. */
  /* the low nibble is the first pixel, which is how a GBA tile is stored. */
  state[VRAM_AT + 0] = 0x21; state[VRAM_AT + 1] = 0x43;
  state[VRAM_AT + 2] = 0x65; state[VRAM_AT + 3] = 0x87;
  /* palette: colour 0 transparent, colour 1 pure red in BGR555, colour 2 green, colour 3 blue. */
  const words = [0x0000, 0x001F, 0x03E0, 0x7C00];
  words.forEach((w, i) => state.writeUInt16LE(w, PALETTE_AT + i * 2));
  return state;
}
function buildPng(state) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  /* two rows of two RGB pixels, filter byte 0 in front of each. */
  const raw = Buffer.from([0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('gbAs', zlib.deflateSync(state)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
const inflate = (bytes) => new Uint8Array(zlib.inflateSync(Buffer.from(bytes)));

suite.test('the state is split into the machine blocks a GBA state is made of', function () {
  const png = buildPng(buildState());
  const read = SS.read(new Uint8Array(png), { inflate: inflate });
  assert(read, 'the reader returned nothing');
  assertEqual(read.kind, 'png-vba-m', 'the state chunk should be found in the PNG');
  assert(read.blocks, 'no blocks were split out');
  assertEqual(read.blocks.vram.length, VRAM, 'VRAM is 0x18000 bytes');
  assertEqual(read.blocks.palette.length, PALETTE, 'the palette is 0x400 bytes');
  assertEqual(read.blocks.ewram.length, EWRAM, 'EWRAM is 0x40000 bytes');
  assertEqual(read.paletteAt, PALETTE_AT, 'the palette sits where the sizes say it does');
});

suite.test('the palette is read as colours and the screenshot as pixels', function () {
  const png = buildPng(buildState());
  const read = SS.read(new Uint8Array(png), { inflate: inflate });
  assertEqual(read.colours[1].r, 255, 'colour 1 is red');
  assertEqual(read.colours[1].g, 0, 'and carries no green');
  assertEqual(read.colours[2].g, 255, 'colour 2 is green');
  assertEqual(read.colours[3].b, 255, 'colour 3 is blue');
  assert(read.screenshot, 'the screenshot was not decoded');
  assertEqual(read.screenshot.width, 2, 'width');
  assertEqual(read.screenshot.height, 2, 'height');
  const px = read.screenshot.pixels;
  assertEqual(px[0], 255, 'first pixel red');
  assertEqual(px[1], 0, 'first pixel not green');
  assertEqual(px[3], 0, 'second pixel black');
  assertEqual(px[6], 255, 'the first pixel of the second row is white');
  assertEqual(px[7], 255, 'and so is its green');
  assertEqual(px[8], 255, 'and its blue');
});

suite.test('the glyphs the text window draws come out of VRAM', function () {
  const read = SS.read(new Uint8Array(buildPng(buildState())), { inflate: inflate });
  const tiles = SS.fontTiles(read.vram, { block: 0, count: 4 });
  assertEqual(tiles.length, 4, 'four tiles were asked for');
  assertEqual(tiles[0].rows[0].join(','), '1,2,3,4,5,6,7,8', 'the first row of tile 0');
  assertEqual(tiles[0].rows[1].join(','), '0,0,0,0,0,0,0,0', 'and the rest of it is empty');
  assertEqual(tiles[0].pixels, 8, 'eight pixels are set');
  const inUse = SS.glyphsInUse(read.vram, { block: 0, count: 4 });
  assertEqual(inUse.length, 1, 'only one of the four tiles has pixels');
});

suite.test('a run of zeros is not mistaken for a palette', function () {
  const zeros = new Uint8Array(0x800);
  assert(SS.paletteScore(zeros, 0) === 0, 'an empty run scores zero');
  const state = buildState();
  assert(SS.paletteScore(new Uint8Array(state), PALETTE_AT) > 0, 'the palette scores above zero');
});
module.exports = { suite: suite };
