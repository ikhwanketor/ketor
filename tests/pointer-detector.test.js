/* What the pointer detector finds, on roms built to have a known answer.

   The two modes answer different questions and both are measured here: a compact
   table (GBA, four byte little endian pointers based at 0x08000000) is found
   structurally, and a console that keeps no table (NES, 16 bit bank pointers
   scattered in code) gets a per text answer instead. The last gate pins the honest
   negative: on that NES layout no table exists, so none may be reported. */

const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('pointer detector');

const env = loadWorkbench();
const detect = env.K.core.detectPointerTables;
const findForTexts = env.K.core.findPointersForTexts;
const rules = env.K.core.POINTER_CONSOLE_RULES;

function writePointer16(bytes, at, value) {
  bytes[at] = value & 0xFF;
  bytes[at + 1] = (value >> 8) & 0xFF;
}

/* A NES shape: text in the 0x8000 window, each pointer stored somewhere else. */
function buildNesRom(options) {
  const opts = options || {};
  const count = opts.count === undefined ? 24 : opts.count;
  const size = opts.size === undefined ? 0x10000 : opts.size;
  const bytes = new Uint8Array(size);
  bytes.fill(0xFF);
  const texts = [];
  for (let i = 0; i < count; i++) {
    const textAt = 0x100 + i * 0x40;
    const pointerAt = 0x4000 + i * 7;
    const message = 'TEXT ' + String(100 + i) + ' IN THE BANK';
    for (let k = 0; k < message.length; k++) bytes[textAt + k] = message.charCodeAt(k);
    bytes[textAt + message.length] = 0x00;
    writePointer16(bytes, pointerAt, 0x8000 + (textAt % rules.nes.bankStep));
    texts.push({ text: textAt, site: pointerAt });
  }
  return { bytes: bytes, texts: texts, count: count };
}

/* A Game Boy shape: the pointer is the address inside the bank it lives in. */
function buildGbRom(options) {
  const opts = options || {};
  const count = opts.count === undefined ? 24 : opts.count;
  const size = opts.size === undefined ? 0x8000 : opts.size;
  const bytes = new Uint8Array(size);
  bytes.fill(0x00);
  const texts = [];
  for (let i = 0; i < count; i++) {
    const textAt = 0x4000 + i * 0x40;
    const pointerAt = 0x1000 + i * 5;
    const message = 'TEXT ' + String(200 + i) + ' HERE';
    for (let k = 0; k < message.length; k++) bytes[textAt + k] = message.charCodeAt(k);
    bytes[textAt + message.length] = 0x00;
    writePointer16(bytes, pointerAt, textAt);
    texts.push({ text: textAt, site: pointerAt });
  }
  return { bytes: bytes, texts: texts, count: count };
}

suite.test('a compact GBA table is found where it was written', async function (t) {
  const fixture = buildSyntheticRom({ records: 40 });
  const found = detect(fixture.rom, {
    console: 'gba',
    terminator: [0x0A, 0x05],
    textOffsets: fixture.records.map(function (r) { return r.textStart; }),
    minEntries: 8
  });
  t.assert(found.length > 0, 'no table was reported at all');
  const hit = found.filter(function (table) { return table.at === fixture.table.at; })[0];
  t.assert(hit, 'the table at 0x' + fixture.table.at.toString(16) + ' was not among ' + found.map(function (f) { return '0x' + f.at.toString(16); }).join(', '));
  t.assertEqual(hit.entrySize, 4, 'four byte entries');
  t.assertEqual(hit.base, fixture.base, 'base 0x08000000');
  t.assertEqual(hit.stride, 4, 'four byte stride');
  t.assert(hit.count >= fixture.count, 'the table should cover all ' + fixture.count + ' records, got ' + hit.count);
});

suite.test('every mapped entry of that table is readable back', async function (t) {
  const fixture = buildSyntheticRom({ records: 16 });
  const found = detect(fixture.rom, { console: 'gba', terminator: [0x0A, 0x05], minEntries: 8 });
  const table = found.filter(function (f) { return f.at === fixture.table.at; })[0];
  t.assert(table, 'the table was not found');
  const read = env.K.core.readPointerTable;
  for (let i = 0; i < fixture.count; i++) {
    t.assertEqual(read(fixture.rom, table, i), fixture.records[i].head, 'entry ' + i + ' should aim at record ' + i);
  }
});

suite.test('a NES rom with scattered pointers gets a per text answer', async function (t) {
  const fixture = buildNesRom({ count: 24 });
  const found = findForTexts(fixture.bytes, {
    console: 'nes',
    textOffsets: fixture.texts.map(function (x) { return x.text; })
  });
  /* A value can sit at more than one place - the search reports candidates, the
     insert path decides - so the gate is that the real site is among them. */
  const byText = {};
  found.forEach(function (hit) { (byText[hit.text] = byText[hit.text] || []).push(hit.at); });
  let located = 0;
  fixture.texts.forEach(function (item) { if ((byText[item.text] || []).indexOf(item.site) >= 0) located++; });
  t.assertEqual(located, fixture.count, 'every pointer should be found at the site it was written to');
});

suite.test('a Game Boy rom with in bank pointers gets a per text answer', async function (t) {
  const fixture = buildGbRom({ count: 16 });
  const found = findForTexts(fixture.bytes, {
    console: 'gb',
    textOffsets: fixture.texts.map(function (x) { return x.text; })
  });
  const byText = {};
  found.forEach(function (hit) { (byText[hit.text] = byText[hit.text] || []).push(hit.at); });
  let located = 0;
  fixture.texts.forEach(function (item) { if ((byText[item.text] || []).indexOf(item.site) >= 0) located++; });
  t.assertEqual(located, fixture.count, 'every pointer should be found');
});

suite.test('a rom with no table reports no table', async function (t) {
  const fixture = buildNesRom({ count: 24 });
  const found = detect(fixture.bytes, {
    console: 'nes',
    terminator: [0x00],
    textOffsets: fixture.texts.map(function (x) { return x.text; }),
    minEntries: 8
  });
  t.assertEqual(found.length, 0, 'a scattered layout must not be reported as a table: ' + JSON.stringify(found.slice(0, 2)));
});

suite.test('the console rules carry the model the engine uses', async function (t) {
  t.assertEqual(rules.gba.base, 0x08000000, 'GBA pointers are based at 0x08000000');
  t.assertEqual(rules.nes.base, 0x8000, 'NES pointers are based at 0x8000');
  t.assertEqual(rules.nes.bankStep, 0x4000, 'NES banks step by 0x4000');
  t.assertEqual(rules.snes.threeByte, true, 'SNES can carry a three byte pointer');
  t.assertEqual(rules.gb.bankStep, 0x4000, 'GB banks step by 0x4000');
  const names = Object.keys(rules);
  t.assert(names.length >= 20, 'the table should cover the consoles added in batch 73, got ' + names.length);
});

module.exports = { suite: suite };
