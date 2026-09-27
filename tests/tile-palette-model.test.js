/* The palette model each console declares (core/console-profiles.js) against the one model
   the tile editor has (ui/ketor-tile-activity.js).

   console-profiles.js names six palette formats - bgr555, gbc-bgr555, gb-shades, nes-2c02,
   md-9bit and ps1-555 - and no file under app/assets/js reads those names: the tile editor
   decodes every palette as BGR555 (fromBgr555 / readPaletteAt / writePaletteColour). That
   is the finding this suite is the test half of.

   It pins what is true today - the declarations, the BGR555 read for GBA and SNES, the
   refusal to write a palette that did not come from the rom - and it writes the missing
   per console models as skipped cases whose bodies are the assertions the implementing
   batch has to make true. A skipped case does not run and cannot fail the gate; the runner
   prints its reason, so the gap is visible in every run and the batch that implements the
   model only has to flip suite.skip back to suite.test (see tests/helpers/tiny-test.js).

   The suite loads core/console-profiles.js the way tests/tile-png.test.js does, because
   the workbench harness does not load it.

   The palette words below are injective on purpose: two entries of the same colour would
   make a per console test pass for the wrong reason. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('tile-palette-model');

const PALETTE_AT = 0x800;             // where these fixtures write their palette words
const PALETTE_ROWS = 16;              // the default read is one sixteen word block

/* Sixteen distinct BGR555 words, low byte first: red, green, blue, white, then a grey ramp
   (word i * 0x0421 sets red = green = blue = i). */
const WORDS = [0x001F, 0x03E0, 0x7C00, 0x7FFF];
for (let i = 4; i < PALETTE_ROWS; i++) WORDS.push(i * 0x0421);
const RGB = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 255, g: 255, b: 255 }];

/* The five palette format names that only console-profiles.js knows. bgr555 is not in the
   list: that one name does have a consumer (the tile editor's fromBgr555). */
const PROFILE_PALETTE_FORMATS = ['gb-shades', 'gbc-bgr555', 'nes-2c02', 'md-9bit', 'ps1-555'];

/* The declarations, hand copied from console-profiles.js: a test that read the table it
   asserts could not notice a changed row. */
const EXPECTED_PALETTES = {
  gba:     { format: 'bgr555',     bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  nds:     { format: 'bgr555',     bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  gb:      { format: 'gb-shades',  bytesPerColour: 0, coloursPerBank: 4,  bankBytes: 0 },
  gbc:     { format: 'gbc-bgr555', bytesPerColour: 2, coloursPerBank: 4,  bankBytes: 8 },
  nes:     { format: 'nes-2c02',   bytesPerColour: 0, coloursPerBank: 4,  bankBytes: 0 },
  snes:    { format: 'bgr555',     bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  genesis: { format: 'md-9bit',    bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  pce:     { format: 'bgr555',     bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  ps1:     { format: 'ps1-555',    bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
  unknown: { format: 'bgr555',     bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 }
};

function loadCore(env, file) {
  const full = path.join(env.REPO, 'app', 'assets', 'js', 'core', file);
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), env.win, { filename: full });
}

/* The workbench with the profiles loaded, no rom needed. */
function openEnv() {
  const env = loadWorkbench();
  loadCore(env, 'console-profiles.js');
  return env;
}

function writePalette(rom, at, words) {
  words.forEach(function (word, i) {
    rom[at + i * 2] = word & 0xFF;
    rom[at + i * 2 + 1] = (word >> 8) & 0xFF;
  });
}

/* A loaded rom of the named console, the format the editor shows and (unless load is
   false) a palette read from PALETTE_AT the way a user reads one. */
function openSheet(options) {
  const opts = options || {};
  const env = openEnv();
  const fixture = buildSyntheticRom({ records: 48 });
  writePalette(fixture.rom, PALETTE_AT, opts.words || WORDS);
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, opts.system || 'GBA');
  env.K.tile.setFormat(opts.format || 'gba-4bpp');
  if (opts.load !== false) env.K.tile.loadPalette(PALETTE_AT, 'test');
  return { env: env, fixture: fixture, K: env.K };
}

/* Every offset whose byte differs, so a case can say "exactly these" instead of trusting a
   spot check that never looks at the other bytes. */
function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  }
  return out;
}

function jsFilesUnder(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push.apply(out, jsFilesUnder(full));
    else if (entry.name.slice(-3) === '.js') out.push(full);
  });
  return out;
}

function noRomPaletteOffset(K) {
  const off = K.tile.getState().paletteOffset;
  return off === null || off === undefined;
}

/* ---------- the declarations ---------- */

suite.test('every console profile declares the palette it has, and the editor reads that profile', function (t) {
  const env = openEnv();
  const profiles = env.K.core.CONSOLE_PROFILES;

  Object.keys(EXPECTED_PALETTES).forEach(function (id) {
    const want = EXPECTED_PALETTES[id];
    const p = profiles[id];
    t.assert(p, 'there is a profile for ' + id);
    t.assertEqual(p.palette.format, want.format, id + '.palette.format');
    t.assertEqual(p.palette.bytesPerColour, want.bytesPerColour, id + '.palette.bytesPerColour');
    t.assertEqual(p.palette.coloursPerBank, want.coloursPerBank, id + '.palette.coloursPerBank');
    t.assertEqual(p.palette.bankBytes, want.bankBytes, id + '.palette.bankBytes');
    /* The colour count of the tile format and the palette of the console have to agree for
       the 1bpp/2bpp consoles: two colours are two palette entries. */
    if (id !== 'ps1') {
      const t0 = env.K.core.TILE_FORMATS[p.tileFormats[0]];
      t.assert(t0, id + ' names a tile format the codec knows: ' + p.tileFormats[0]);
    }
  });

  /* System names arrive as display strings; the profile lookup folds them back. The editor
     asks for the profile with the label the rom was loaded under. */
  t.assertEqual(env.K.core.consoleProfile('Game Boy').id, 'gb', 'Game Boy');
  t.assertEqual(env.K.core.consoleProfile('Game Boy Color').id, 'gbc', 'Game Boy Color');
  t.assertEqual(env.K.core.consoleProfile('Nintendo Entertainment System').id, 'nes', 'NES');
  t.assertEqual(env.K.core.consoleProfile('Super Nintendo').id, 'snes', 'SNES');
  t.assertEqual(env.K.core.consoleProfile('Mega Drive').id, 'genesis', 'Mega Drive');
  t.assertEqual(env.K.core.consoleProfile('PlayStation').id, 'ps1', 'PlayStation');
});

/* The static half of the finding: five of the six palette format names have no consumer at
   all. When the batch that implements the models adds one, this case fails on purpose -
   the finding stops being true and this case has to be replaced by the per console cases
   that then turn green. */
suite.test('the five per console palette format names have no consumer in the app yet', function (t) {
  const env = openEnv();
  const root = path.join(env.REPO, 'app', 'assets', 'js');

  const users = jsFilesUnder(root).filter(function (file) {
    const text = fs.readFileSync(file, 'utf8');
    return PROFILE_PALETTE_FORMATS.some(function (name) { return text.indexOf(name) >= 0; });
  }).map(function (file) { return path.relative(env.REPO, file).split(path.sep).join('/'); }).sort();

  t.assertDeepEqual(users, ['app/assets/js/core/console-profiles.js'],
    'only the profile table names gb-shades, gbc-bgr555, nes-2c02, md-9bit or ps1-555');

  /* The one palette name that is implemented, and the shape the editor implements it in:
     always BGR555, whichever console the rom is. */
  t.assertEqual(typeof env.K.tile.fromBgr555, 'function', 'the editor can decode BGR555');
  const gb = openSheet({ system: 'GB', format: 'gb-2bpp' });
  t.assertEqual(gb.K.tile.consoleProfile().id, 'gb', 'the editor sees a Game Boy rom');
  t.assertEqual(gb.K.tile.readPaletteAt(PALETTE_AT).length, PALETTE_ROWS,
    'and still reads a sixteen word BGR555 block for it: the profile is not consulted (see the skipped cases)');
});

/* ---------- what is true today ---------- */

suite.test('GBA and SNES palettes read as BGR555 words, low byte first', function (t) {
  const gba = openSheet({ system: 'GBA' });
  t.assertEqual(gba.K.tile.consoleProfile().id, 'gba', 'the profile comes from the loaded rom');
  t.assertDeepEqual(gba.K.tile.readPaletteAt(PALETTE_AT, 4), RGB,
    '0x001F / 0x03E0 / 0x7C00 / 0x7FFF are red, green, blue, white');

  const snes = openSheet({ system: 'SNES' });
  t.assertEqual(snes.K.tile.consoleProfile().id, 'snes', 'the SNES profile as well');
  t.assertDeepEqual(snes.K.tile.readPaletteAt(PALETTE_AT, 4), RGB, 'and its palette is the same BGR555 block');

  const K = gba.K;
  t.assertEqual(K.tile.readPaletteAt(PALETTE_AT).length, PALETTE_ROWS, 'the default read is sixteen words');
  t.assertDeepEqual(K.tile.fromBgr555(0xFF, 0x7F), { r: 255, g: 255, b: 255 }, 'the expansion is (v << 3) | (v >> 2)');
  t.assertEqual(K.tile.readPaletteAt(gba.fixture.rom.length - 1), null, 'a word that runs past the end of the rom is null');
});

suite.test('a 4bpp or 8bpp sheet asks the palette for 16 or 256 entries', function (t) {
  const { K } = openSheet({ system: 'GBA' });

  t.assertEqual(K.tile.paletteColours('gb-2bpp'), 16, 'a 2bpp sheet is read through a sixteen entry block today');
  t.assertEqual(K.tile.paletteColours('snes-4bpp'), 16, 'a 4bpp sheet');
  K.tile.setFormat('gba-4bpp');
  t.assertEqual(K.tile.paletteColours(), 16, 'the sheet on screen decides when no format is passed');
  t.assertEqual(K.tile.paletteColours('genesis-4bpp'), 16, 'the Mega Drive 4bpp sheet too');
  t.assertEqual(K.tile.paletteColours('gba-8bpp'), 256, 'the 8bpp table carries 256 colours');
  t.assertEqual(K.tile.paletteColours('snes-8bpp'), 256, 'and so does the SNES one');
  K.tile.setFormat('gba-8bpp');
  t.assertEqual(K.tile.paletteColours(), 256, 'and the sheet follows its format');
  t.assertEqual(K.tile.PALETTE_COLOURS, 16, 'the old block size is still exported');
  t.assertEqual(K.tile.PALETTE_COLOURS_MAX, 256, 'and so is the widest palette');
});

suite.test('writePaletteColour refuses a palette that did not come from the rom, and writes two bytes when it did', function (t) {
  const none = openSheet({ system: 'GBA', load: false });
  const source = none.K.hex.getSourceBytes();

  t.assertEqual(none.K.tile.getState().palette, null, 'no palette is loaded yet');
  t.assertEqual(none.K.tile.writePaletteColour(0, { r: 255, g: 0, b: 0 }), false,
    'a colour edit with no rom offset is refused');
  t.assertDeepEqual(diffOffsets(source, none.K.hex.getPatchedBytes()), [], 'and not one byte of the rom was written');
  t.assert(none.K.tile.getState().status.indexOf('not read from the ROM') >= 0,
    'the status names the reason: ' + none.K.tile.getState().status);

  const loaded = openSheet({ system: 'GBA' });
  const before = loaded.K.hex.getSourceBytes();
  t.assertEqual(loaded.K.tile.writePaletteColour(1, { r: 255, g: 0, b: 255 }), true, 'entry 1 of a rom palette is written');
  t.assertDeepEqual(diffOffsets(before, loaded.K.hex.getPatchedBytes()), [PALETTE_AT + 2, PALETTE_AT + 3],
    'exactly the two bytes of entry 1');
  t.assertEqual(loaded.K.hex.getPatchedBytes()[PALETTE_AT + 2], 0x1F, 'BGR555 low byte first');
  t.assertEqual(loaded.K.hex.getPatchedBytes()[PALETTE_AT + 3], 0x7C, 'then the high byte');
  t.assertEqual(loaded.K.tile.writePaletteColour(200, { r: 1, g: 2, b: 3 }), false,
    'an index past the sixteenth entry of a 4bpp sheet is refused');
});

/* ---------- the models that do not exist yet: skipped, with the reason printed ---------- */

suite.skip('a 1bpp or 2bpp sheet holds as many colours as its format has',
  'the editor has no per format colour count: paletteColourCount() answers 16 for every layout under 256 colours, and the old suite pins that (tile-palette256, "a 4bpp sheet still reads sixteen colours and still refuses entry 200", pins 16 for gb-2bpp and gb-1bpp). The codec table already carries colors 2 and 4, so the implementing batch changes that function and that old pin.',
  function (t) {
    const { K } = openSheet({ system: 'GB', format: 'gb-1bpp' });
    t.assertEqual(K.tile.paletteColours('gb-1bpp'), 2, 'a 1bpp format has two colours');
    t.assertEqual(K.tile.paletteColours('gb-2bpp'), 4, 'a 2bpp format has four');
    t.assertEqual(K.tile.paletteColours('nes-2bpp'), 4, 'the NES 2bpp format has four');
    t.assertEqual(K.tile.paletteColours('snes-2bpp'), 4, 'and so does the SNES 2bpp format');
    t.assertEqual(K.tile.readPaletteAt(PALETTE_AT).length, 2, 'a 1bpp sheet reads two entries');
  });

suite.skip('a GBC palette is one bank of four colours, eight bytes',
  'the profile declares gbc-bgr555 with coloursPerBank 4 and bankBytes 8, and the editor reads a sixteen word (32 byte) block for every console. Only readPaletteAt is involved: the GBC bit layout is BGR555, so no new codec is needed, only a bank width that follows the profile.',
  function (t) {
    const { K } = openSheet({ system: 'GBC', format: 'gb-2bpp' });
    t.assertEqual(K.tile.consoleProfile().id, 'gbc', 'the profile comes from the loaded rom');
    t.assertEqual(K.tile.consoleProfile().palette.bankBytes, 8, 'one bank is eight bytes');
    const bank = K.tile.readPaletteAt(PALETTE_AT);
    t.assertEqual(bank.length, 4, 'a read with no count takes one bank, not sixteen colours');
    t.assertDeepEqual(bank, RGB, 'and the four words are the first four of the block');
    const next = K.tile.readPaletteAt(PALETTE_AT + 8);
    t.assertEqual(next.length, 4, 'the next bank starts eight bytes on');
    t.assertDeepEqual(next, [5 * 0x0421, 6 * 0x0421, 7 * 0x0421, 8 * 0x0421].map(function (w) { return K.tile.fromBgr555(w & 0xFF, w >> 8); }),
      'and its colours are words four to seven');
  });

suite.skip('a Game Boy palette is the four shade ramp, not a block in the rom',
  'the profile declares gb-shades with bytesPerColour 0 and bankBytes 0: the four shades are what a Game Boy screen can show, not data in the file. The implementing batch decides the exact ramp; what the model has to guarantee is that nothing in the rom is treated as a palette and that a colour edit therefore has no offset to write to.',
  function (t) {
    const { K } = openSheet({ system: 'GB', format: 'gb-2bpp', load: false });
    const before = K.hex.getSourceBytes();
    t.assertEqual(K.tile.consoleProfile().palette.format, 'gb-shades', 'the declared format');
    t.assertEqual(K.tile.consoleProfile().palette.bytesPerColour, 0, 'nothing per colour is stored');
    t.assertEqual(K.tile.paletteColours('gb-2bpp'), 4, 'four shades for a 2bpp sheet');
    K.tile.loadPalette(PALETTE_AT, 'gb');
    t.assert(noRomPaletteOffset(K), 'reading a palette leaves the rom offset unset');
    t.assertEqual(K.tile.writePaletteColour(0, { r: 0, g: 0, b: 0 }), false, 'so there is nothing in the rom to write');
    t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and no byte of the rom moved');
  });

suite.skip('a NES palette is a 2C02 index, so the rom holds no colour to write back',
  'the profile declares nes-2c02 with bytesPerColour 0: the ROM byte is a six bit index into the fixed 2C02 table, and the table is the same in every console. The implementing batch owns the table; what the model has to guarantee is that the indices are not read as BGR555 and that a colour edit is refused because the palette is not in the file.',
  function (t) {
    const { K } = openSheet({ system: 'NES', format: 'nes-2bpp', load: false });
    const before = K.hex.getSourceBytes();
    t.assertEqual(K.tile.consoleProfile().id, 'nes', 'the profile comes from the loaded rom');
    t.assertEqual(K.tile.consoleProfile().palette.format, 'nes-2c02', 'the declared format');
    t.assertEqual(K.tile.consoleProfile().palette.bytesPerColour, 0, 'the rom stores indices, not colours');
    K.tile.loadPalette(PALETTE_AT, 'nes');
    t.assert(noRomPaletteOffset(K), 'reading a palette leaves the rom offset unset');
    t.assertEqual(K.tile.writePaletteColour(3, { r: 0, g: 0, b: 0 }), false, 'a 2C02 colour is not written into a rom');
    t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [], 'and no byte of the rom moved');
  });

suite.skip('a Mega Drive palette is 0BBB0GGG0RRR, not BGR555',
  'the profile declares md-9bit: three bits per channel in the word ---BBB-GGG-RRR- (the requirement writes the same layout as 0BBB0GGG0RRR), expanded to eight bits as (v << 5) | (v << 2) | (v >> 1). The fixture word 0x0E0E is its own big endian twin (both bytes are 0x0E), so this vector does not depend on the word order the implementing batch picks: R = 7, G = 0, B = 7 is magenta, while the BGR555 read gives (115, 132, 24).',
  function (t) {
    const words = [];
    for (let i = 0; i < PALETTE_ROWS; i++) words.push(0x0E0E);
    const { K } = openSheet({ system: 'Genesis', format: 'genesis-4bpp', words: words });
    t.assertEqual(K.tile.consoleProfile().id, 'genesis', 'the profile comes from the loaded rom');
    t.assertEqual(K.tile.consoleProfile().palette.format, 'md-9bit', 'the declared format');
    const pal = K.tile.readPaletteAt(PALETTE_AT);
    t.assertEqual(pal.length, 16, 'a Mega Drive palette is sixteen entries');
    t.assertDeepEqual(pal[0], { r: 255, g: 0, b: 255 }, '0x0E0E is red 7, green 0, blue 7 in the 3 bit layout');
    t.assertDeepEqual(pal[15], { r: 255, g: 0, b: 255 }, 'and every entry of this fixture is that same word');
  });

module.exports = { suite: suite };
