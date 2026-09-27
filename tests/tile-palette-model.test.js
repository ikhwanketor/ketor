/* The palette model each console declares (core/console-profiles.js) against the model the
   tile editor resolves for it (ui/ketor-tile-activity.js, paletteModel).

   console-profiles.js names six palette formats - bgr555, gbc-bgr555, gb-shades, nes-2c02,
   md-9bit and ps1-555. Batch 168 wrote this suite against an editor that knew only the first
   one: fromBgr555 decoded every palette and readPaletteAt read a sixteen word block for every
   console, whatever the profile said. That was the finding, and the five cases it wrote as
   skips were the assertions the implementing batch had to make true.

   Batch 169 implemented the models. The five skipped cases are ordinary cases now, the static
   case that pinned "the five names have no consumer" became the case that names the consumer,
   and the per console cases below (plus the Mega Drive channel vectors, the write refusals and
   the PS1 STP flag) pin the models themselves.

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

/* The five palette format names the profile table declares for the consoles that do not store
   plain BGR555 words. bgr555 is not in the list: it is the layout the editor decoded from the
   start, while these five are the ones batch 169 taught it. */
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

/* The palette sentence the rail draws, and the swatch strip the tab draws. React is a stub
   in this harness, so a component can be called with its props directly, the way
   tile-palette256 reads the strip. treeStrings() hands back every label, title and child the
   rendered tree holds, in tree order; the sentence sits inside a box of the rail the tab
   draws itself (batch 174), so the components on the way to it are drawn first. */
function drawnStrings(env, node) {
  const draw = function (n) {
    if (Array.isArray(n)) return n.map(draw);
    if (!n || typeof n !== 'object' || !n.props) return n;
    if (typeof n.type === 'function') return draw(n.type(n.props));
    const props = Object.assign({}, n.props);
    if (props.children !== undefined) props.children = draw(props.children);
    return { type: n.type, props: props };
  };
  return env.treeStrings(draw(node));
}
function paletteLabel(env) {
  const strings = drawnStrings(env, env.K.ui.tabProviders.tile());
  /* The sentence starts with the count the model declares; the toolbar of the tab has
     tooltips that mention colours too, so the shape of the label is what is matched here. */
  return strings.filter(function (s) { return /^\d+ (colours|shades)/.test(s); })[0] || '';
}

function swatchStrip(env) {
  let found = null;
  (function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.type === 'function' && node.props
      && typeof node.props.onPick === 'function' && node.props.palette !== undefined) { found = node; return; }
    walk(node.props && node.props.children);
  })(env.K.ui.tabProviders.tile());
  if (!found) return null;
  const strip = found.type(found.props);
  return { cells: (strip.props.children || []).filter(function (c) { return c && c.type === 'button'; }) };
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

/* The static half of the finding - five of the six palette format names had no consumer at
   all - was closed by batch 169, exactly as the comment here said it would be: the case that
   pinned the gap is replaced by the case that pins the consumer. */
suite.test('the tile editor is the consumer of the five per console palette format names', function (t) {
  const env = openEnv();
  const root = path.join(env.REPO, 'app', 'assets', 'js');

  const users = jsFilesUnder(root).filter(function (file) {
    const text = fs.readFileSync(file, 'utf8');
    return PROFILE_PALETTE_FORMATS.some(function (name) { return text.indexOf(name) >= 0; });
  }).map(function (file) { return path.relative(env.REPO, file).split(path.sep).join('/'); }).sort();

  t.assertDeepEqual(users, ['app/assets/js/core/console-profiles.js', 'app/assets/js/ui/ketor-tile-activity.js'],
    'the profile table declares gb-shades, gbc-bgr555, nes-2c02, md-9bit and ps1-555, and the tile editor resolves them');

  /* The one palette name that was implemented all along, and the shape the editor still
     implements it in for the consoles that store BGR555 words. */
  t.assertEqual(typeof env.K.tile.fromBgr555, 'function', 'the editor can decode BGR555');
  const gb = openSheet({ system: 'GB', format: 'gb-2bpp' });
  t.assertEqual(gb.K.tile.consoleProfile().id, 'gb', 'the editor sees a Game Boy rom');
  t.assertEqual(gb.K.tile.readPaletteAt(PALETTE_AT).length, 4,
    'and reads its profile now: the four DMG shades, not the sixteen words of the fixture');
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

suite.test('a sheet asks its format for the palette width the codec table declares', function (t) {
  const { K } = openSheet({ system: 'GBA' });

  t.assertEqual(K.tile.paletteColours('gb-2bpp'), 4, 'a 2bpp sheet has four colours, not a sixteen entry block');
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

/* ---------- the models of the consoles that do not store BGR555 words ---------- */

suite.test('a 1bpp or 2bpp sheet holds as many colours as its format has', function (t) {
    const { K } = openSheet({ system: 'GB', format: 'gb-1bpp' });
    t.assertEqual(K.tile.paletteColours('gb-1bpp'), 2, 'a 1bpp format has two colours');
    t.assertEqual(K.tile.paletteColours('gb-2bpp'), 4, 'a 2bpp format has four');
    t.assertEqual(K.tile.paletteColours('nes-2bpp'), 4, 'the NES 2bpp format has four');
    t.assertEqual(K.tile.paletteColours('snes-2bpp'), 4, 'and so does the SNES 2bpp format');
    t.assertEqual(K.tile.readPaletteAt(PALETTE_AT).length, 2, 'a 1bpp sheet reads two entries');
  });

suite.test('a GBC palette is one bank of four colours, eight bytes', function (t) {
    const { K } = openSheet({ system: 'GBC', format: 'gb-2bpp' });
    t.assertEqual(K.tile.consoleProfile().id, 'gbc', 'the profile comes from the loaded rom');
    t.assertEqual(K.tile.consoleProfile().palette.bankBytes, 8, 'one bank is eight bytes');
    const bank = K.tile.readPaletteAt(PALETTE_AT);
    t.assertEqual(bank.length, 4, 'a read with no count takes one bank, not sixteen colours');
    t.assertDeepEqual(bank, RGB, 'and the four words are the first four of the block');
    const next = K.tile.readPaletteAt(PALETTE_AT + 8);
    t.assertEqual(next.length, 4, 'the next bank starts eight bytes on');
    /* Eight bytes on is word four: the four words at +8 are words 4, 5, 6 and 7 of the
       fixture, which is what a bank of four colours means. (The skipped vector of batch 168
       said words five to eight, an off by one against its own "eight bytes on" sentence: a
       two byte word cannot start one entry into the block.) */
    t.assertDeepEqual(next, [4 * 0x0421, 5 * 0x0421, 6 * 0x0421, 7 * 0x0421].map(function (w) { return K.tile.fromBgr555(w & 0xFF, w >> 8); }),
      'and its colours are words four to seven');
  });

suite.test('a Game Boy palette is the four shade ramp, not a block in the rom', function (t) {
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

suite.test('a NES palette is a 2C02 index, so the rom holds no colour to write back', function (t) {
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

suite.test('a Mega Drive palette is 0BBB0GGG0RRR, not BGR555', function (t) {
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

/* ---------- the models, checked where they are used ---------- */

suite.test('the editor resolves the model every console profile declares', function (t) {
  const wants = [
    ['GBA', 'gba', 'bgr555'],
    ['Game Boy Color', 'gbc', 'gbc-bgr555'],
    ['Game Boy', 'gb', 'gb-shades'],
    ['NES', 'nes', 'nes-2c02'],
    ['Super Nintendo', 'snes', 'bgr555'],
    ['Mega Drive', 'genesis', 'md-9bit'],
    ['PlayStation', 'ps1', 'ps1-555'],
    ['Unknown', 'unknown', 'bgr555']
  ];
  wants.forEach(function (want) {
    const { K } = openSheet({ system: want[0] });
    t.assertEqual(K.tile.consoleProfile().id, want[1], want[0] + ' is the ' + want[1] + ' profile');
    t.assertEqual(K.tile.paletteModel().format, want[2], want[0] + ' resolves the ' + want[2] + ' model');
  });
});

suite.test('a Mega Drive word is 0BBB0GGG0RRR: three bits a channel, eight bits out', function (t) {
  /* One channel at a time, so a decode that swaps two fields cannot pass: seven is the widest
     a three bit channel goes, and each word sets exactly one of the three fields. */
  const channels = [
    [0x000E, { r: 255, g: 0, b: 0 }, 'red'],
    [0x00E0, { r: 0, g: 255, b: 0 }, 'green'],
    [0x0E00, { r: 0, g: 0, b: 255 }, 'blue']
  ];
  channels.forEach(function (c) {
    const words = [];
    for (let i = 0; i < PALETTE_ROWS; i++) words.push(c[0]);
    const sheet = openSheet({ system: 'Genesis', format: 'genesis-4bpp', words: words });
    t.assertDeepEqual(sheet.K.tile.readPaletteAt(PALETTE_AT, 1), [c[1]],
      '0x' + c[0].toString(16).toUpperCase() + ' is ' + c[2] + ' seven, expanded to eight bits');
  });

  const fill = [];
  for (let i = 0; i < PALETTE_ROWS; i++) fill.push(0x0E0E);
  const magenta = openSheet({ system: 'Genesis', format: 'genesis-4bpp', words: fill });
  t.assertDeepEqual(magenta.K.tile.readPaletteAt(PALETTE_AT, 2),
    [{ r: 255, g: 0, b: 255 }, { r: 255, g: 0, b: 255 }], 'the fixture word 0x0E0E is magenta on every entry');

  const { K } = openSheet({ system: 'Genesis', format: 'genesis-4bpp' });
  t.assertDeepEqual(K.tile.fromBgr555(0x0E, 0x0E), { r: 115, g: 132, b: 24 },
    'the same word read as BGR555 is another colour, so the case cannot pass by accident');

  /* And back: a colour written to the ROM leaves the 9 bit word it came from. The fixture
     starts at 0x001F, so a blue entry moves both bytes of entry 0. */
  const before = K.hex.getSourceBytes();
  t.assertEqual(K.tile.writePaletteColour(0, { r: 0, g: 0, b: 255 }), true, 'a Mega Drive colour edit is written');
  t.assertDeepEqual(diffOffsets(before, K.hex.getPatchedBytes()), [PALETTE_AT, PALETTE_AT + 1],
    'exactly the two bytes of entry 0');
  t.assertEqual(K.hex.getPatchedBytes()[PALETTE_AT], 0x00, 'blue seven sits in bits 9-11: low byte first');
  t.assertEqual(K.hex.getPatchedBytes()[PALETTE_AT + 1], 0x0E, 'then the high byte');
  t.assertDeepEqual(K.tile.getState().palette[0], { r: 0, g: 0, b: 255 }, 'and the editor holds the colour that was written');
  t.assertEqual(K.tile.colourAt(0), 'rgb(0,0,255)', 'which is what the canvas paints');
});

suite.test('a Game Boy or a NES colour edit is refused and moves no byte of the rom', function (t) {
  const gb = openSheet({ system: 'GB', format: 'gb-2bpp', load: false });
  const gbSource = gb.K.hex.getSourceBytes();
  t.assert(gb.K.tile.loadPalette(PALETTE_AT, 'gb') !== null, 'a Game Boy palette loads');
  t.assertEqual(gb.K.tile.getState().paletteOffset, null, 'and leaves no rom offset behind');
  t.assertEqual(gb.K.tile.writePaletteColour(0, { r: 0, g: 0, b: 0 }), false, 'so a shade cannot be written');
  t.assert(gb.K.tile.getState().status.indexOf('not a colour in the ROM') >= 0,
    'the status names the reason: ' + gb.K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(gbSource, gb.K.hex.getPatchedBytes()), [], 'and not one byte of the Game Boy rom moved');
  t.assertEqual(gb.K.tile.findPalette(), null, 'there is no colour palette to search for either');
  t.assert(gb.K.tile.getState().status.indexOf('four shade ramp') >= 0,
    'which the status says: ' + gb.K.tile.getState().status);

  const nes = openSheet({ system: 'NES', format: 'nes-2bpp', load: false });
  const nesSource = nes.K.hex.getSourceBytes();
  t.assert(nes.K.tile.loadPalette(PALETTE_AT, 'nes') !== null, 'a NES palette loads');
  t.assertEqual(nes.K.tile.getState().paletteOffset, null, 'and leaves no rom offset behind');
  t.assertEqual(nes.K.tile.writePaletteColour(3, { r: 0, g: 0, b: 0 }), false, 'a 2C02 colour cannot be written');
  t.assert(nes.K.tile.getState().status.indexOf('in the console, not in the ROM') >= 0,
    'the status names the reason: ' + nes.K.tile.getState().status);
  t.assertDeepEqual(diffOffsets(nesSource, nes.K.hex.getPatchedBytes()), [], 'and not one byte of the NES rom moved');
});

suite.test('a PS1 palette word may set bit 15, so the STP flag is not a reason to refuse it', function (t) {
  const stp = [];
  for (let i = 0; i < PALETTE_ROWS; i++) stp.push(0x8000 | (i * 0x0421));

  const ps = openSheet({ system: 'PlayStation', format: 'gba-4bpp', words: stp });
  t.assertEqual(ps.K.tile.consoleProfile().id, 'ps1', 'the profile comes from the loaded rom');
  t.assertEqual(ps.K.tile.paletteModel().format, 'ps1-555', 'and the model is the PS1 word');
  t.assertEqual(ps.K.tile.paletteModel().alphaBit, 0, 'no bit disqualifies a word: bit 15 is STP, not alpha');
  t.assertDeepEqual(ps.K.tile.readPaletteAt(PALETTE_AT, 4),
    [0, 1, 2, 3].map(function (i) { const w = 0x8000 | (i * 0x0421); return ps.K.tile.fromBgr555(w & 0xFF, w >> 8); }),
    'every word decodes as 555 with bit 15 ignored, instead of being refused');
  t.assert(ps.K.tile.paletteScore(ps.K.hex.getSourceBytes(), PALETTE_AT, PALETTE_ROWS),
    'a sixteen word PS1 palette that sets STP everywhere still scores as a palette');

  const gba = openSheet({ system: 'GBA', format: 'gba-4bpp', words: stp });
  t.assertEqual(gba.K.tile.paletteScore(gba.K.hex.getSourceBytes(), PALETTE_AT, PALETTE_ROWS), null,
    'the same block is still not a GBA palette: bit 15 is unused there');
});

suite.test('the sidebar label and the swatch strip follow the model, not a fixed sixteen', function (t) {
  const gb = openSheet({ system: 'GB', format: 'gb-2bpp' });
  t.assert(paletteLabel(gb.env).indexOf('4 shades from the DMG screen ramp') === 0,
    'the Game Boy label names the four shades: ' + paletteLabel(gb.env));
  const gbStrip = swatchStrip(gb.env);
  t.assertEqual(gbStrip.cells.length, 4, 'a 2bpp Game Boy sheet shows four swatches');
  t.assertEqual(gbStrip.cells[0].props.style.background, 'rgb(155,188,15)',
    'and the first one is the lightest DMG shade, not the grey ramp of a sheet with no palette');

  const gbc = openSheet({ system: 'GBC', format: 'gb-2bpp' });
  t.assert(paletteLabel(gbc.env).indexOf('4 colours: one GBC bank holds 4 BGR555 words (8 bytes)') === 0,
    'the GBC label names the four colour bank its profile declares: ' + paletteLabel(gbc.env));
  t.assertEqual(swatchStrip(gbc.env).cells.length, 4, 'and a GBC sheet shows four swatches');

  const md = openSheet({ system: 'Genesis', format: 'genesis-4bpp' });
  t.assert(paletteLabel(md.env).indexOf('16 colours as 0BBB0GGG0RRR: eight steps a channel') === 0,
    'the Mega Drive label names the nine bit layout: ' + paletteLabel(md.env));
  t.assertEqual(swatchStrip(md.env).cells.length, 16, 'and sixteen swatches');

  const gba = openSheet({ system: 'GBA', format: 'gba-4bpp' });
  t.assert(paletteLabel(gba.env).indexOf('16 colours read as BGR555 words') === 0,
    'while the GBA keeps the BGR555 sentence: ' + paletteLabel(gba.env));
});

module.exports = { suite: suite };
