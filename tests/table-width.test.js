/* The table tab on a sixteen bit game: the same work an eight bit table gets, done in the
   width the table itself declares. A code is the bytes the game stores for one character, the
   padding beside it may sit on either side (20 00 is a space, and so is 00 20), and the table a
   search builds has to be one the search and the insert can read back - which is the bug this
   suite was written for: on the sixteen bit rom the preview came out eight bit wide, so the
   table it produced could never be applied to the game it was read from. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('table width');

const env = loadWorkbench();
const T = env.K.table;
const run = env.K.core.runMonkeyMoore;
const sleep = env.sleep;

const FILLER = 0x11;

/* A rom whose text is one byte a character, so a search can be checked exactly. */
function rom8(text, at) {
  const bytes = new Uint8Array(0x400);
  bytes.fill(FILLER);
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) & 0xFF;
  return bytes;
}

/* A rom whose text is two bytes a character, with a padding zero behind each one -
   the shape the Kingdom Hearts cartridge uses (4100=A, 2000=space). */
function rom16(text, at, paddingInFront) {
  const bytes = new Uint8Array(0x4000);
  bytes.fill(FILLER);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) & 0xFF;
    bytes[at + i * 2] = paddingInFront ? 0x00 : c;
    bytes[at + i * 2 + 1] = paddingInFront ? c : 0x00;
  }
  return bytes;
}

async function search() {
  T.setSampleText(T.getState().sampleText);
  T.runSearch();
  await sleep(40);
  return T.getState();
}

suite.test('a one byte table still builds a one byte preview', async function () {
  T.reset();
  T.setRomFromLoad({ data: rom8('ABCDEFGHIJK', 0x100), name: 'aos.gba', size: 0x400 }, 'GBA');
  T.setByteWidth(8);
  T.setSampleText('ABCDEFGHIJK');
  const st = await search();
  assertEqual(st.searchCharWidth, 1, 'the search ran one byte a character');
  assert(st.previewTbl.indexOf('41=A') >= 0, 'the preview says 41=A: ' + st.previewTbl);
  assert(st.previewTbl.indexOf('4100') < 0, 'and nothing in it is two bytes wide');
  assertEqual(st.results[0].valuesLabel, 'A=41', 'the values column shows the one byte code');
});

suite.test('a sixteen bit table builds a sixteen bit preview', async function () {
  T.reset();
  T.setRomFromLoad({ data: rom16('ABCDEFGHIJK', 0x100), name: 'kh.gba', size: 0x4000 }, 'GBA');
  T.setByteWidth(16);
  T.setSampleText('ABCDEFGHIJK');
  const st = await search();
  assertEqual(st.searchCharWidth, 2, 'the search ran two bytes a character');
  assert(st.previewTbl.indexOf('4100=A') >= 0, 'the preview says 4100=A: ' + st.previewTbl);
  assert(st.previewTbl.indexOf('4B00=K') >= 0, 'and it carries on in the same width');
  assertEqual(st.results[0].valuesLabel, 'A=4100', 'the values column shows the code the game stores');
});

suite.test('the loaded table decides the width, not the setting', async function () {
  T.reset();
  T.setRomFromLoad({ data: rom16('ABCDEFGHIJK', 0x100), name: 'kh.gba', size: 0x4000 }, 'GBA');
  T.setByteWidth(8);
  T.loadTableFile(['4100=A', '4200=B', '2000=[SPACE]'].join('\n'), 'khcom.tbl');
  T.setSampleText('ABCDEFGHIJK');
  const st = await search();
  assertEqual(st.searchCharWidth, 2, 'the table in hand is sixteen bit, so the search is');
  assert(st.previewTbl.indexOf('4100=A') >= 0, 'the preview follows that table: ' + st.previewTbl);
  T.applyPreviewToEditTable();
  const entry = T.getState().editEntries[0];
  assertEqual(entry.hex, '4100', 'the edit table gets the code the game stores');
  assertEqual(entry.bytes, '41 00', 'as the two bytes it is');
  assertEqual(entry.char, 'A', 'with the character it stands for');
  assertEqual(entry.comment, 'uppercase letter', 'and a comment that knows what it is');
});

suite.test('a space reads the same with the padding on either side', function () {
  T.reset();
  T.loadTableFile([
    '20=[SPACE]', '2000=[SPACE]', '0020=[UNK_20]',
    '0A00=[UNK_0A]', '000A=[UNK_0A]',
    '4100=A', '0041=[UNK_41]', '9F00=[UNK_9F]', '8140=[UNK_8140]'
  ].join('\n'), 'mixed.tbl');
  const rows = {};
  T.getState().editEntries.forEach(function (en) { rows[en.hex] = en.comment; });
  assertEqual(rows['20'], 'space', 'a one byte space');
  assertEqual(rows['2000'], 'space', 'a space with the padding behind it');
  assertEqual(rows['0020'], 'space', 'and a space with the padding in front of it');
  assert(rows['0A00'].indexOf('line break') === 0, 'the line break is named: ' + rows['0A00']);
  assertEqual(rows['000A'], rows['0A00'], 'and it reads the same from either side');
  assertEqual(rows['0041'], 'uppercase letter', 'a letter padded in front is still a letter');
  assertEqual(rows['9F00'], 'extended byte (0x9F)', 'an extended byte is reported as one byte');
  assertEqual(rows['8140'], 'unknown code (0x8140) - two real bytes, no single character byte',
    'two real bytes are not guessed at');
});

suite.test('a control code inside a sixteen bit sample is captured and guessed', async function () {
  T.reset();
  /* The rom holds AB<0A>DEF, two bytes a character; the sample says * where the 0A is. */
  T.setRomFromLoad({ data: rom16('AB\u000ADEF', 0x100), name: 'kh.gba', size: 0x4000 }, 'GBA');
  T.setByteWidth(16);
  T.setWildcardEnabled(true);
  T.setSampleText('AB*DEF');
  const st = await search();
  assert(st.results.length > 0, 'the wildcard search found the sample');
  const codes = st.capturedBytes.map(function (c) { return c.code; });
  assert(codes.indexOf('0A00') >= 0, 'the capture read the whole code, not one byte: ' + JSON.stringify(codes));
  /* The search applies the guess by itself, so the guess is taken back first: the
     reset is what the button does, and it shows what the code is without it. */
  T.resetSmartGuess();
  const plain = T.getState();
  assert(plain.previewTbl.indexOf('0A00=[UNK_0A]') >= 0,
    'with the guess reset the sixteen bit code is unknown: ' + plain.previewTbl);
  T.runSmartGuess();
  const guessed = T.getState();
  assert(guessed.previewTbl.indexOf('0A00=[LINE]') >= 0,
    'and the guess names it: ' + guessed.previewTbl);
});

suite.test('a sample that sits in one place in the rom is found there', function () {
  const eight = run(rom8('ABCDEFGHIJK', 0x100), {
    mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 8, endianness: 'little'
  }).results;
  assertEqual(eight.length, 1, 'one hit for the eight bit sample');
  assertEqual(eight[0].offset, 0x100, 'at the address the text is at');

  const sixteen = run(rom16('ABCDEFGHIJK', 0x100), {
    mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 16, endianness: 'little'
  }).results;
  assertEqual(sixteen.length, 1, 'and one hit for the sixteen bit sample');
  assertEqual(sixteen[0].offset, 0x100, 'at the same address');

  const front = run(rom16('ABCDEFGHIJK', 0x100, true), {
    mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 16, endianness: 'big'
  }).results;
  assertEqual(front.length, 1, 'a table padded in front is found the same way');
  assertEqual(front[0].valuesLabel, 'A=0041', 'and its values column shows the padding in front');
});

module.exports = { suite: suite };
