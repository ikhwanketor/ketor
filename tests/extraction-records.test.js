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

async function extract(rom, table, terminator) {
  K.search.setRomFromLoad({ data: rom, name: 'synthetic.gba', size: rom.length }, 'GBA');
  K.search.setSystemProfile(terminator ? Object.assign({}, GBA, { terminator: terminator }) : GBA);
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

suite.test('a table whose records do not all open the same way is still read', async function (t) {
  /* The intro table of Kingdom Hearts names its records from a run of pointers and its
     records do not all open with the same number of header bytes: the first starts with
     the letter itself, the record after it with a two byte code. The distance from a
     pointer to its first character is therefore not one value across the table, the
     detector's text consensus never reaches its threshold, and the table comes back
     unconfirmed. It is still the table the game uses. */
  const fixture = buildSyntheticRom({ records: 12, textLength: 36 });
  const rom = fixture.rom.slice();
  const expected = [];
  fixture.records.forEach(function (r, i) {
    if (i % 2 === 0) { expected.push(r.textStart); return; }
    for (let k = r.byteLength - 1; k >= 0; k--) rom[r.textStart + 2 + k] = rom[r.textStart + k];
    rom[r.textStart] = 0x00;
    rom[r.textStart + 1] = 0x00;
    expected.push(r.textStart + 2);
  });
  const noiseAt = 0x30000;
  for (let i = 0; i < 0x2000; i++) rom[noiseAt + i] = 0x61 + (i % 26);
  const st = await extract(rom, tableMaps(fixture.project.table.content));
  const texts = st.texts || [];
  const starts = texts.map(function (x) { return Number(x.startByte); });
  expected.forEach(function (at) {
    assert(starts.indexOf(at) >= 0,
      'the record whose text starts at 0x' + at.toString(16) + ' is in the list: ' + st.status);
  });
  assertEqual(texts.length, fixture.records.length, 'and nothing else is: ' + st.status);
});

suite.test('a pointer that carries the base is read past sixteen megabytes', async function (t) {
  /* A four byte GBA pointer holds the address the console sees. The detector used to
     take the masked word for a file offset, which is the same thing only while the
     offset stays under sixteen megabytes; on a 32 megabyte cartridge every record past
     that mark landed outside the file and its site was thrown away. Kingdom Hearts is
     such a rom and the build finds its message table only because it subtracts the
     base. */
  const fixture = buildSyntheticRom({ records: 16, textLength: 40, romSize: 0x2000000, regionAt: 0x1100000 });
  const tables = K.core.detectPointerTables(fixture.rom, {
    system: 'GBA', pipelineId: 'pipeline_gba', terminator: [0x00],
    minEntries: 6, maxResults: 64, keepUnconfirmed: true, textOffsets: []
  });
  const heads = fixture.records.map(function (r) { return r.head; });
  const named = tables.filter(function (tb) {
    const entries = (tb.entries || []).map(Number);
    return heads.every(function (h) { return entries.indexOf(h) >= 0; });
  });
  assert(named.length >= 1, 'the table above 16 MB is found; the detector returned ' + tables.length +
    ' table(s) and none names those records');
  assertEqual(Number(named[0].at), fixture.table.at, 'and it is the table the records were written into');
});

suite.test('the shape of the Kingdom Hearts table is read: sixteen byte stride, mixed headers', async function (t) {
  /* This is the intro table of Kingdom Hearts: 0x86AB44 holds a four byte pointer and
     twelve bytes of metadata per entry, sixteen bytes apart, and its records do not all
     open the same way - one starts with the letter, the next with a two byte code. Both
     of those are the reason the intro line was missing from the list once already, so
     the shape is pinned here: the detector has to find the table, and the list has to be
     its records. */
  const rom = new Uint8Array(0x40000);
  rom.fill(0x11, 0x1000, 0x34000);
  const expected = [];
  const heads = [];
  /* Eight bigger, plainer tables elsewhere in the rom, so the detector reports more
     than the six strongest - which is exactly what hid the intro's table on the real
     cartridge: it is small, and its records do not agree on one header width, so it
     sorts last and the default limit of six cut it off. */
  for (let d = 0; d < 8; d++) {
    const tableAt = 0x8000 + d * 0x100;
    for (let e = 0; e < 24; e++) {
      const head = 0x10000 + d * 0x800 + e * 0x20;
      const text = 'DECOY ' + String.fromCharCode(0x41 + d) + ' LINE ' + String.fromCharCode(0x41 + e) + ' TEXT';
      rom[head] = 0x01;
      rom[head + 1] = 0x00;
      for (let k = 0; k < text.length; k++) rom[head + 2 + k] = text.charCodeAt(k);
      rom[head + 2 + text.length] = 0x00;
      expected.push(head + 2);
      const pointer = (0x08000000 + head) >>> 0;
      const site = tableAt + e * 4;
      rom[site] = pointer & 0xFF;
      rom[site + 1] = (pointer >>> 8) & 0xFF;
      rom[site + 2] = (pointer >>> 16) & 0xFF;
      rom[site + 3] = (pointer >>> 24) & 0xFF;
    }
  }
  for (let i = 0; i < 10; i++) {
    const head = 0x2000 + i * 0x80;
    const text = 'MESSAGE ' + String.fromCharCode(0x41 + i) + ' SAYS HELLO';
    let at = head;
    if (i % 2 === 1) { rom[head] = 0x07; rom[head + 1] = 0x00; at = head + 2; }
    for (let k = 0; k < text.length; k++) rom[at + k] = text.charCodeAt(k);
    rom[at + text.length] = 0x00;
    expected.push(at);
    heads.push(head);
    /* the entry: the pointer, then twelve bytes of metadata that are not pointers */
    const site = 0x1000 + i * 16;
    const pointer = (0x08000000 + head) >>> 0;
    rom[site] = pointer & 0xFF;
    rom[site + 1] = (pointer >>> 8) & 0xFF;
    rom[site + 2] = (pointer >>> 16) & 0xFF;
    rom[site + 3] = (pointer >>> 24) & 0xFF;
    rom[site + 4] = 0x01; rom[site + 5] = 0x00; rom[site + 6] = 0x2D; rom[site + 7] = 0x00;
    rom[site + 8] = 0x01; rom[site + 9] = 0x00; rom[site + 10] = 0x00; rom[site + 11] = 0x00;
    rom[site + 12] = 0x39; rom[site + 13] = 0x03; rom[site + 14] = 0x00; rom[site + 15] = 0x00;
  }
  const noiseAt = 0x3A000;
  for (let i = 0; i < 0x2000; i++) rom[noiseAt + i] = 0x61 + (i % 26);
  const table = {
    singleByte: (function () { const m = {}; for (let i = 0; i < 26; i++) m[0x41 + i] = String.fromCharCode(0x41 + i); m[0x20] = '[SPACE]'; m[0x00] = '[END]'; return m; })(),
    multiByte: {}, entryCount: 28, name: 'synthetic.tbl'
  };
  const st = await extract(rom, table);
  const texts = st.texts || [];
  const starts = texts.map(function (x) { return Number(x.startByte); });
  expected.forEach(function (at) {
    assert(starts.indexOf(at) >= 0,
      'the record whose text starts at 0x' + at.toString(16) + ' is in the list: ' + st.status);
  });
  assertEqual(texts.length, expected.length, 'and the list is those records and nothing else: ' + st.status);
});

suite.test('the list does not depend on the terminator the profile guessed', async function (t) {
  /* The workflow hands the extractor a terminator it guessed from the console. When that
     guess is wrong the table detector cannot close a single span, and the whole list used
     to collapse: measured on Aria of Sorrow with the profile's 0xFF, 19 texts instead of
     2,331, and on Kingdom Hearts 16 instead of 1,758. The game's own table says which byte
     ends its records, so its end codes are read into the terminator list and zero is
     always there (the build uses the same fallback). */
  const fixture = buildSyntheticRom({ records: 12, textLength: 36 });
  const noiseAt = 0x30000;
  const rom = withNoise(fixture.rom, noiseAt, 0x2000);
  const content = (function () {
    const lines = [];
    for (let i = 0; i < 26; i++) lines.push((0x41 + i).toString(16).toUpperCase() + '=' + String.fromCharCode(0x41 + i));
    lines.push('20=[SPACE]');
    lines.push('0A=[END]');
    return lines.join('\n') + '\n';
  })();
  const withZero = await extract(rom, tableMaps(content), [0x00]);
  const withWrongGuess = await extract(rom, tableMaps(content), [0xFF]);
  assertEqual(withWrongGuess.texts.length, withZero.texts.length,
    'a wrong terminator in the profile must not change the list: 0x00 gave ' + withZero.texts.length +
    ' text(s), 0xFF gave ' + withWrongGuess.texts.length + ' (' + withWrongGuess.status + ')');
  assert(withZero.texts.length >= fixture.records.length,
    'and the records are there: ' + withZero.status);
});

module.exports = { suite: suite };
