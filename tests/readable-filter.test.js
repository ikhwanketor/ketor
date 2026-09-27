/* The list offers texts a person could read.

   A scan of a whole rom decodes graphics, fonts and code as text as well: measured on Aria
   of Sorrow in batch 150, 244,921 printable runs where the game has a few thousand
   messages, and the pointer tables alone still handed 1,809 of them to the list as "text".
   The readable filter is the answer to that: a text stays when it is mostly letters, holds
   vowels, keeps its consonants sayable, and breaks into words. It is language blind - the
   German and French text of the same cartridge passes - and it can be turned off for a
   table that is not Latin script, which these cases hold as well. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom, tableContent } = require('./helpers/synthetic-rom');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('readable filter');

const env = loadWorkbench();
const K = env.K;

const GBA = {
  name: 'GBA', terminator: [0x00], pipelineId: 'pipeline_gba',
  pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x08000000
};

function tableMaps(content) {
  const singleByte = {};
  const multiByte = {};
  String(content || '').split('\n').filter(Boolean).forEach(function (line) {
    const eq = line.indexOf('=');
    if (eq <= 0) return;
    const hex = line.substring(0, eq).replace(/\s+/g, '').toUpperCase();
    let ch = line.substring(eq + 1);
    if (ch === ' ') ch = '[SPACE]';
    if (!/^[0-9A-F]+$/.test(hex) || hex.length % 2) return;
    if (hex.length === 2) singleByte[parseInt(hex, 16)] = ch;
    else multiByte[hex] = ch;
  });
  return { singleByte: singleByte, multiByte: multiByte, entryCount: 1, name: 'synthetic.tbl' };
}

async function extract(rom, table, options) {
  K.search.setExtractionOptions(Object.assign({ readableOnly: true }, options || {}));
  K.search.setRomFromLoad({ data: rom, name: 'synthetic.gba', size: rom.length }, 'GBA');
  K.search.setSystemProfile(GBA);
  K.search.setTableData(table);
  K.search.extractTexts();
  for (let i = 0; i < 300; i++) {
    await env.runPending();
    await env.sleep(15);
    if (!K.search.getState().isExtracting && i > 3) break;
  }
  return K.search.getState();
}

/* The same table with its records holding what graphics data holds: letter and number
   fragments a scan calls text ("H2H L1L ") and no person can read. The shape of the table is
   untouched, so only the text itself decides whether the list takes it - which is exactly
   the shape the real cartridges hand over, where the tile and font tables of Aria of Sorrow
   produced 1,809 of these. */
const SOUP = 'H2H L1L H2H L1L H2H L1L ';

function withGlyphSoup(fixture) {
  const rom = fixture.rom.slice();
  fixture.records.forEach(function (r, i) {
    let at = r.textStart;
    for (let k = 0; k < 24; k++) rom[at++] = SOUP.charCodeAt((i * 3 + k) % SOUP.length);
    rom.set(fixture.trailer, at);
    rom.fill(0x00, at + fixture.trailer.length, r.textStart + r.byteLength);
  });
  return rom;
}

suite.test('the records of a game stay in the list', async function (t) {
  const fixture = buildSyntheticRom({ records: 24, textLength: 40 });
  const st = await extract(fixture.rom, tableMaps(tableContent()));
  const starts = (st.texts || []).map(function (x) { return Number(x.startByte); });
  fixture.records.forEach(function (r) {
    assert(starts.indexOf(r.textStart) >= 0, 'the message at 0x' + r.textStart.toString(16) + ' is offered: ' + st.status);
  });
});

suite.test('glyph soup from a table with the same shape is not offered', async function (t) {
  const fixture = buildSyntheticRom({ records: 24, textLength: 40 });
  const rom = withGlyphSoup(fixture);
  const st = await extract(rom, tableMaps(tableContent()));
  const starts = (st.texts || []).map(function (x) { return Number(x.startByte); });
  const fromRecords = fixture.records.filter(function (r) { return starts.indexOf(r.textStart) >= 0; });
  assertEqual(fromRecords.length, 0, 'no record of the soup table is offered: ' + st.status);
  assert(/readable only/i.test(String(st.status)), 'and the list says why it is short: ' + st.status);
});

suite.test('the same table is read when the caller asks for everything', async function (t) {
  const fixture = buildSyntheticRom({ records: 24, textLength: 40 });
  const rom = withGlyphSoup(fixture);
  const st = await extract(rom, tableMaps(tableContent()), { readableOnly: false });
  const starts = (st.texts || []).map(function (x) { return Number(x.startByte); });
  const fromRecords = fixture.records.filter(function (r) { return starts.indexOf(r.textStart) >= 0; });
  /* The records the scan reached come back - eight of the fixture's twenty-four, because the
     rest are only read out of the cartridge for a table text consensus confirmed, and a table
     of soup never reaches that. The point of the case is the switch: nothing was offered
     before it, and the same table is the list after it. */
  assert(fromRecords.length >= 8, 'the records come back: ' + fromRecords.length + ' of 24, ' + st.status);
  assert(/the game points at/.test(String(st.status)), 'and the table is the source again: ' + st.status);
});

suite.test('a short label and a sentence in another language both stay', async function (t) {
  /* "Potion" is a label, "Der Trank" is the same label in German: the test asks for letters
     and words, not for English, so a translation project in any Latin script passes. */
  const fixture = buildSyntheticRom({ records: 8, textLength: 24 });
  const rom = fixture.rom.slice();
  const texts = ['POTION', 'Der Trank stellt 50 HP wieder her.'];
  texts.forEach(function (text, i) {
    const r = fixture.records[i];
    rom.fill(0x00, r.textStart, r.textStart + r.byteLength);
    for (let k = 0; k < text.length; k++) rom[r.textStart + k] = text.toUpperCase() === text ? text.charCodeAt(k) : text.charCodeAt(k);
    rom.set(fixture.trailer, r.textStart + text.length);
  });
  const st = await extract(rom, tableMaps(tableContent()));
  const offered = (st.texts || []).map(function (x) { return String(x.originalText); }).join('\n');
  assert(offered.indexOf('POTION') >= 0, 'the label is offered: ' + st.status);
  assert(offered.indexOf('Der Trank') >= 0, 'the German line is offered too');
});

suite.test('the switch is a checkbox in the advanced block of the sidebar', async function (t) {
  /* The option is only useful if a user can find it, and it sits with the other advanced
     extraction settings - so the panel is rendered the way the workbench renders it, with
     the advanced block open, and the label has to be in the tree. */
  const panel = loadWorkbench();
  const vm = require('vm');
  const path = require('path');
  const file = path.join(panel.REPO, 'app', 'assets', 'js', 'ui', 'ketor-search-sidebar.js');
  /* The stub the harness hands a component renders the closed state; a checkbox the user
     can only reach by clicking is one the test opens on purpose. */
  panel.win.React.useState = function (value) { return [true, function () {}]; };
  vm.runInNewContext(require('fs').readFileSync(file, 'utf8'), panel.win, { filename: file });
  const render = panel.K.ui.sidebarProviders.search;
  t.assert(typeof render === 'function', 'the search sidebar is registered');
  const strings = panel.treeStrings(render());
  t.assert(strings.indexOf('Readable texts only') >= 0,
    'the checkbox is in the advanced block: ' + strings.filter(function (s) { return /readable/i.test(s); }).join(' | '));
});

module.exports = { suite };
