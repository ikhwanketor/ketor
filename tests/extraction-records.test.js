/* The extracted list is the records the game points at, not every printable run.

   A scan of a whole rom finds text in graphics, in fonts and in code as well. Measured
   on the two real roms in batch 131: Aria of Sorrow 244,921 runs where the game has
   2,893 messages, Kingdom Hearts 31,170 runs where 382 records are pointed at. What
   separates them is the pointer table, and this suite holds that behaviour on a rom
   built for it - with a table present and with none, so the fallback stays honest. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('extraction records');

const env = loadWorkbench();
const K = env.K;

const GBA = {
  name: 'GBA', terminator: [0x00], pipelineId: 'pipeline_gba',
  pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x08000000
};

/* The table file the engine is handed, as the Table tab builds it. */
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
  return {
    singleByte: singleByte, multiByte: multiByte,
    entryCount: Object.keys(singleByte).length + Object.keys(multiByte).length,
    name: 'synthetic.tbl'
  };
}

async function extract(rom, table) {
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

/* The same rom with a field of letters nothing points at: what graphics and font data
   look like to a scan that decodes every printable byte. */
function withNoise(rom, at, length) {
  const out = rom.slice();
  for (let i = 0; i < length; i++) out[at + i] = 0x41 + (i % 26);
  return out;
}

suite.test('the list is the records the game points at, and the noise is dropped', async function (t) {
  const fixture = buildSyntheticRom({ records: 24, textLength: 40 });
  const noiseAt = 0x30000;
  const rom = withNoise(fixture.rom, noiseAt, 0x4000);
  const st = await extract(rom, tableMaps(fixture.project.table.content));
  const texts = st.texts || [];
  assertEqual(texts.length, fixture.records.length, 'one text per record, nothing else: ' + st.status);
  const starts = texts.map(function (x) { return Number(x.startByte); });
  fixture.records.forEach(function (r) {
    assert(starts.indexOf(r.textStart) >= 0, 'the record at 0x' + r.textStart.toString(16) + ' is in the list');
  });
  const inNoise = starts.filter(function (s) { return s >= noiseAt && s < noiseAt + 0x4000; });
  assertEqual(inNoise.length, 0, 'no text came out of the noise field');
  const first = texts[starts.indexOf(fixture.records[0].textStart)];
  assertEqual(first.originalText, fixture.records[0].text, 'and the text is the record, not a run over it');
});

suite.test('with no table in the rom the scan keeps its runs', async function (t) {
  /* No table means no evidence to cut the list with, and the tool says what it found
     instead of pretending the rom has no text. */
  const fixture = buildSyntheticRom({ records: 24, textLength: 40 });
  const noiseAt = 0x30000;
  const rom = withNoise(fixture.rom, noiseAt, 0x4000);
  rom.fill(0x00, 0x1000, 0x1000 + 24 * 4);
  const st = await extract(rom, tableMaps(fixture.project.table.content));
  const texts = st.texts || [];
  assert(texts.length > fixture.records.length, 'the runs are all there: ' + st.status);
  const inNoise = texts.filter(function (x) { return Number(x.startByte) >= noiseAt && Number(x.startByte) < noiseAt + 0x4000; });
  assert(inNoise.length > 0, 'including the ones from the noise field');
});

module.exports = { suite: suite };
