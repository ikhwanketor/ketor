/* The font of a game, read from the cartridge and written back: the mapping the profile carries, the
   glyphs it points at, and a write that lands in exactly the bytes the reader read. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');
const suite = createSuite('font map');

const win = { Ketor: {}, console: console };
win.window = win;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'core', 'font-map.js'), 'utf8'), win, { filename: 'font-map.js' });
const FM = win.Ketor.core.fontMap;
const { loadWorkbench } = require('./helpers/workbench');

const FONT = { at: 0x100, tileSize: 32, kind: 'gba-4bpp', firstCode: 0x21, lastCode: 0x7E };
const A = ['..##....', '.#..#...', '#....#..', '#....#..', '######..', '#....#..', '#....#..', '#....#..'];

suite.test('the profile decides where a code lives', function () {
  assertEqual(FM.offsetOf(FONT, 0x21), 0x100, 'the first code is the first tile');
  assertEqual(FM.offsetOf(FONT, 0x41), 0x100 + 0x20 * 32, 'A is thirty two tiles further on');
  assertEqual(FM.offsetOf(FONT, 0x20), -1, 'a code before the font has no tile');
  assertEqual(FM.offsetOf(FONT, 0x7F), -1, 'and neither has one after it');
});

suite.test('a glyph reads out of the cartridge as the rows it is', function () {
  const rom = new Uint8Array(0x1000);
  const at = FM.offsetOf(FONT, 0x41);
  A.forEach(function (row, y) { for (let x = 0; x < 8; x += 2) { const l = row[x] === '#' ? 1 : 0, r = row[x+1] === '#' ? 1 : 0; rom[at + y*4 + (x >> 1)] = l | (r << 4); } });
  const glyph = FM.readGlyph(rom, FONT, 0x41);
  assert(glyph, 'no glyph came back');
  assertEqual(glyph.char, 'A', 'and it is the code that was asked for');
  assertEqual(glyph.rows.join('/'), A.join('/'), 'with the rows that were written into it');
  assertEqual(FM.pixels(glyph), 20, 'and a pixel count that matches');
  const all = FM.readAll(rom, FONT);
  assertEqual(all.length, 0x7E - 0x21 + 1, 'every code of the range is read');
});

suite.test('an edited glyph is written back into the same bytes', function () {
  const rom = new Uint8Array(0x1000);
  const before = FM.readGlyph(rom, FONT, 0x41);
  assertEqual(FM.pixels(before), 0, 'the tile starts empty');
  const wrote = FM.writeGlyph(rom, FONT, 0x41, A);
  assert(wrote.ok, 'the write was refused: ' + wrote.reason);
  assertEqual(wrote.at, FM.offsetOf(FONT, 0x41), 'and it landed where the code lives');
  const after = FM.readGlyph(rom, FONT, 0x41);
  assertEqual(after.rows.join('/'), A.join('/'), 'reading it back gives what was written');
  const outside = FM.writeGlyph(rom, FONT, 0x20, A);
  assertEqual(outside.ok, false, 'a code outside the font is refused');
  const short = FM.writeGlyph(rom, FONT, 0x41, A.slice(0, 7));
  assertEqual(short.ok, false, 'and so is a glyph that is not eight rows');
});

suite.test('the profile of Aria of Sorrow carries the font found in the cartridge', function () {
  /* The profile is looked for in everything the module exports, so the gate does not depend on the
     name of the table it happens to use. */
  const prof = { Ketor: {}, console: console };
  prof.window = prof;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'core', 'game-profile.js'), 'utf8'), prof, { filename: 'game-profile.js' });
  const core = prof.Ketor.core || {};
  const wanted = 'abd71fe01ebb201bcc133074db1dd8c5253776c7';
  let aos = null;
  Object.keys(core).forEach(function (key) {
    const value = core[key];
    if (!value || typeof value !== 'object') return;
    if (value.sha1 === wanted) aos = value;
    const list = Array.isArray(value) ? value : Object.keys(value).map(k => value[k]);
    list.forEach(function (item) { if (item && typeof item === 'object' && item.sha1 === wanted) aos = item; });
  });
  assert(aos, 'the built in profile for Aria of Sorrow was not found in what the module exports');
  const font = FM.fontFromProfile(aos);
  assert(font, 'the profile carries no font');
  assertEqual(font.at, 0x0E3A80, 'the font starts where it was verified on the cartridge');
  assertEqual(font.kind, 'gba-4bpp', 'and it is 4bpp');
  assertEqual(font.firstCode, 0x21, 'with ! as the first glyph');
  assertEqual(font.lastCode, 0x7E, 'and ~ as the last');
});

module.exports = { suite: suite };