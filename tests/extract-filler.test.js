/* What the extractor may call a text.
   A table that encodes one character in two bytes (4100=A) does not name single bytes, so a
   run of single bytes is not text. On the Kingdom Hearts rom a 446 byte run of 0x22 filler sat
   in front of the next record and the extractor glued it to that record's text as 446 quote
   marks; the text it produced began in filler, was not a record, and the build refused to move
   it ("Relocation skipped (no safe pointers found)") - the failing build this suite is about.
   The gates below hold both halves of the rule: a loose byte may not start a text in a two byte
   table, and it may still continue one, and the eight bit path keeps its old behaviour. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('extraction');

const env = loadWorkbench();
const K = env.K;

const GBA = {
  name: 'GBA', terminator: [0x00], pipelineId: 'pipeline_gba',
  pointerSize: 4, pointerEndianness: 'little', pointerBase: 0
};

/* A rom shaped like the failing one: a terminator, a run of filler bytes the
   table cannot name, and then the record that really follows it. */
function romWithFiller(options) {
  const opts = options || {};
  const twoByte = opts.twoByte !== false;
  const recordAt = opts.recordAt === undefined ? 0x200 : opts.recordAt;
  const fillerAt = opts.fillerAt === undefined ? 0x100 : opts.fillerAt;
  const fillerLength = opts.fillerLength === undefined ? 0x60 : opts.fillerLength;
  const text = opts.text || 'HELLO THERE';
  const bytes = new Uint8Array(0x400);
  bytes.fill(0x11);
  bytes[0x80] = 0x00;
  if (twoByte) bytes[0x81] = 0xE0;
  for (let i = 0; i < fillerLength; i++) bytes[fillerAt + i] = 0x22;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (twoByte) {
      bytes[recordAt + i * 2] = c;
      bytes[recordAt + i * 2 + 1] = 0x00;
    } else {
      bytes[recordAt + i] = c;
    }
  }
  return { bytes: bytes, recordAt: recordAt, fillerAt: fillerAt, fillerLength: fillerLength, text: text };
}

/* The table the rom is written in, as the Table tab hands it over. */
function tableOf(twoByte) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const singleByte = {};
  const multiByte = {};
  for (let i = 0; i < letters.length; i++) {
    if (twoByte) multiByte[(0x41 + i).toString(16).toUpperCase() + '00'] = letters[i];
    else singleByte[0x41 + i] = letters[i];
  }
  if (twoByte) { multiByte['2000'] = '[SPACE]'; singleByte[0x20] = '[SPACE]'; }
  else singleByte[0x20] = '[SPACE]';
  return { singleByte: singleByte, multiByte: multiByte, entryCount: Object.keys(singleByte).length + Object.keys(multiByte).length, name: 'test.tbl' };
}

async function extract(rom, table) {
  K.search.setRomFromLoad({ data: rom, name: 'filler.gba', size: rom.length }, 'GBA');
  K.search.setSystemProfile(GBA);
  K.search.setTableData(table);
  K.search.extractTexts();
  for (let i = 0; i < 60; i++) {
    await env.runPending();
    await env.sleep(20);
    if (!K.search.getState().isExtracting && (K.search.getState().texts || []).length >= 0 && i > 2) break;
  }
  return K.search.getState().texts || [];
}

suite.test('a two byte table does not start a text in filler', async function (t) {
  const fixture = romWithFiller({ twoByte: true });
  const texts = await extract(fixture.bytes, tableOf(true));
  const mine = texts.filter(function (x) { return String(x.originalText || '').indexOf(fixture.text) >= 0; });
  assertEqual(mine.length, 1, 'the record is extracted once, got: ' + JSON.stringify(texts.map(function (x) { return x.originalText; }).slice(0, 5)));
  assertEqual(mine[0].originalText, fixture.text, 'with the text the record holds, nothing glued in front');
  assertEqual(Number(mine[0].startByte), fixture.recordAt, 'and it starts at the record, not in the filler');
  const glued = texts.filter(function (x) { return /^"{3,}/.test(String(x.originalText || '')); });
  assertEqual(glued.length, 0, 'no text begins with the filler: ' + JSON.stringify(glued.map(function (x) { return String(x.originalText).slice(0, 20); })));
  const inFiller = texts.filter(function (x) { return Number(x.startByte) >= fixture.fillerAt && Number(x.startByte) < fixture.recordAt; });
  assertEqual(inFiller.length, 0, 'and none starts inside the run');
});

suite.test('a loose byte may still continue a text the table started', async function (t) {
  /* Mixed encodings exist: the table names the letters of a word and the rest of the line is
     plain bytes. That tail belongs to the text; only a text that would begin with it does not. */
  const bytes = new Uint8Array(0x400);
  bytes.fill(0x11);
  bytes[0x80] = 0x00;
  bytes[0x81] = 0xE0;
  const head = 'AB';
  for (let i = 0; i < head.length; i++) { bytes[0x100 + i * 2] = head.charCodeAt(i); bytes[0x100 + i * 2 + 1] = 0x00; }
  const tail = 'CD';
  for (let i = 0; i < tail.length; i++) bytes[0x104 + i] = tail.charCodeAt(i);
  bytes[0x106] = 0x00;
  const texts = await extract(bytes, tableOf(true));
  const hit = texts.filter(function (x) { return String(x.originalText || '').indexOf(head) >= 0; });
  assertEqual(hit.length, 1, 'the text is extracted');
  assert(String(hit[0].originalText).indexOf(tail) >= 0,
    'and the plain bytes after it are part of it: ' + JSON.stringify(hit[0].originalText));
});

suite.test('a one byte table keeps its old behaviour', async function (t) {
  /* The eight bit path is the stable one and is not touched: there a byte the table does not
     name is still a character, and a run of them still opens a text. */
  const fixture = romWithFiller({ twoByte: false });
  const texts = await extract(fixture.bytes, tableOf(false));
  const opened = texts.filter(function (x) { return Number(x.startByte) === fixture.fillerAt; });
  assert(opened.length >= 1, 'the loose bytes still open a text in a one byte table, got starts: ' + JSON.stringify(texts.map(function (x) { return Number(x.startByte); }).slice(0, 6)));
  assert(/^"{3,}/.test(String(opened[0].originalText || '')), 'and that text still begins with them: ' + JSON.stringify(String(opened[0].originalText).slice(0, 24)));
});

module.exports = { suite: suite };
