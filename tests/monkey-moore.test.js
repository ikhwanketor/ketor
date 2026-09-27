/* The delta search behind the table tab (app/assets/js/core/monkey-moore.js).

   A sample is located by the steps between its characters instead of the codes themselves,
   so a block of text whose alphabet is still unknown can be found at all. This suite covers
   the three shapes that asks for - a plain relative sample, one with a wildcard or a case
   change, and a value scan of raw numbers - and the preview the table tab builds from the
   match.

   The equivalence block at the end pins the behaviour to the implementation this file
   replaced: every expectation in it was captured from app/assets/js/core/monkey-moore.js at
   HEAD 21d3034, before the rewrite, by running the same rom and the same options through it.
   A row is green only while the new implementation answers exactly the same, preview string
   included. */
'use strict';

const { loadWorkbench } = require('./helpers/workbench');
const { createSuite, assert, assertEqual, assertDeepEqual } = require('./helpers/tiny-test');

const suite = createSuite('delta search');

const env = loadWorkbench();
const run = env.K.core.runMonkeyMoore;

const FILL = 0x11;

function blank(size, fill) {
  const bytes = new Uint8Array(size);
  bytes.fill(fill);
  return bytes;
}

/* One byte a character. */
function writeText(bytes, at, text) {
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) & 0xFF;
  return bytes;
}

/* Two bytes a character, with the padding byte behind it or in front of it. */
function writeWideText(bytes, at, text, paddingInFront) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) & 0xFF;
    bytes[at + i * 2] = paddingInFront ? 0x00 : code;
    bytes[at + i * 2 + 1] = paddingInFront ? code : 0x00;
  }
  return bytes;
}

/* The same text moved into another alphabet: the letters keep their order but not their
   codes, which is the situation the delta search exists for. */
function writeMovedText(bytes, at, text, base) {
  for (let i = 0; i < text.length; i++) {
    bytes[at + i] = (base + (text.charCodeAt(i) - text.charCodeAt(0))) & 0xFF;
  }
  return bytes;
}

/* The roms the equivalence block is pinned on. */
const ROMS = {
  oneByteSample: function () { return writeText(blank(0x400, FILL), 0x100, 'ABCDEFGHIJK'); },
  oneByteSampleAsArray: function () { return Array.from(ROMS.oneByteSample()); },
  movedAlphabet: function () { return writeMovedText(blank(0x400, 0x02), 0x40, 'HELLOWORLD', 0x80); },
  twoByteSample: function () { return writeWideText(blank(0x4000, FILL), 0x100, 'ABCDEFGHIJK', false); },
  twoBytePaddedFront: function () { return writeWideText(blank(0x4000, FILL), 0x100, 'ABCDEFGHIJK', true); },
  noisyTwoByteSample: function () {
    const bytes = writeWideText(blank(0x4000, 0x00), 0x80, 'ABCDEFGHIJK', false);
    for (let i = 0; i < 8; i++) bytes[0x120 + i * 4] = 0xC0 + i;
    return bytes;
  },
  controlCodeSample: function () { return writeWideText(blank(0x4000, FILL), 0x100, 'AB\u000ADEF', false); },
  mixedCaseSample: function () { return writeText(blank(0x400, 0x00), 0x80, 'AbCdEf'); },
  craftedCodes: function () {
    const bytes = blank(0x400, 0x00);
    [0x20, 0x41, 0x22, 0x43, 0x24, 0x45].forEach(function (value, i) { bytes[0x100 + i] = value; });
    return bytes;
  },
  starSample: function () { return writeText(blank(0x400, 0x00), 0x50, 'A*C'); },
  spacedText: function () { return writeText(blank(0x400, 0x00), 0x60, 'A B C'); },
  byteValues: function () { return writeText(blank(0x400, 0x00), 0x100, 'ABCD'); },
  fillerRom: function () { return blank(0x400, FILL); },
  repeated: function () {
    const bytes = blank(0x400, 0x00);
    for (let i = 0; i < 5; i++) writeText(bytes, 0x100 + i * 0x20, 'ABCDEFGH');
    return bytes;
  },
  atTheStart: function () { return writeText(blank(0x200, 0x7E), 0, 'ABCDEFGHIJK'); },
  atTheEnd: function () { return writeText(blank(0x200, 0x7E), 0x200 - 11, 'ABCDEFGHIJK'); },
  shorterThanTheWindow: function () { return writeText(blank(20, 0x7E), 4, 'ABCDEFGHIJK'); },
  unknownBytes: function () {
    const bytes = writeText(blank(0x200, 0x00), 0x80, 'ABCDEFGHIJK');
    for (let i = 0; i < 8; i++) bytes[0x90 + i * 2] = 0xC0 + i;
    return bytes;
  },
  oddLength: function () { return writeWideText(blank(0x101, 0x22), 0x40, 'ABCDEFGHIJK', false); },
  highBytes: function () { return writeWideText(blank(0x400, 0x00), 0x100, '\u00FF\u00FE\u00FD', false); },
  tooShort: function () { return new Uint8Array([1, 2, 3]); },
  emptyRom: function () { return new Uint8Array(0); },
  nullRom: function () { return null; },
  int8View: function () { return new Int8Array([65, 66, 67, 68, 69, 70]); }
};

const NOTHING = { results: [], previewWidth: 50 };

/* ---- the three modes ---- */

suite.test('a sample moved into another alphabet is found by its steps', function () {
  const out = run(ROMS.movedAlphabet(), { mode: 'relative', keyword: 'HELLOWORLD', byteWidth: 8, endianness: 'little' });
  assertEqual(out.results.length, 1, 'one hit, although no code in the rom equals the sample');
  assertEqual(out.results[0].offset, 0x40, 'at the address the text was moved to');
  assertEqual(out.results[0].values.H, 0x80, 'the first character carries the value read there');
  assertEqual(out.results[0].valuesLabel, 'H=80', 'and the values column reports that code');
});

suite.test('a wildcard search skips the character the sample does not spell out', function () {
  const options = { mode: 'relative', keyword: 'AB*DEF', wildcardEnabled: true, wildcardChar: '*', byteWidth: 16, endianness: 'little' };
  const out = run(ROMS.controlCodeSample(), options);
  assertEqual(out.results.length, 1, 'the sample is found across the control code');
  assertEqual(out.results[0].offset, 0x100, 'at the address the text is at');
  assert(out.results[0].preview.indexOf('AB#DEF') >= 0,
    'the window shows the code it could not name as #: ' + out.results[0].preview);
  const off = run(ROMS.controlCodeSample(), { mode: 'relative', keyword: 'AB*DEF', wildcardEnabled: false, byteWidth: 16, endianness: 'little' });
  assertEqual(off.results.length, 0, 'with wildcards off the star is a character like any other, and the rom has none');
});

suite.test('a sample that mixes capital and small letters is matched by its steps', function () {
  const out = run(ROMS.craftedCodes(), { mode: 'relative', keyword: 'AbCdEf', byteWidth: 8, endianness: 'little' });
  assertEqual(out.results.length, 1, 'one hit in a rom whose codes are not the ones that were typed');
  assertEqual(out.results[0].offset, 0x100, 'at the address the text is at');
  assertEqual(out.results[0].valuesLabel, 'A=20 a=40',
    'the case change is answered with both alphabets the sample could belong to');
  assertEqual(out.results[0].preview.indexOf('AbCdEf'), 22, 'with the match in the middle of the window');
});

suite.test('a value scan finds the byte sequence the numbers describe', function () {
  const out = run(ROMS.byteValues(), { mode: 'value-scan', keyword: '0x41, 0x42, 0x43, 0x44', byteWidth: 8 });
  assertEqual(out.results.length, 1, 'one hit');
  assertEqual(out.results[0].offset, 0x100, 'at the address of the byte sequence');
  assertEqual(out.results[0].valuesLabel, '', 'a value scan claims no character values');
  const plain = run(ROMS.byteValues(), { mode: 'value-scan', keyword: '41 42 43 44', byteWidth: 8 });
  assertEqual(plain.results.length, 1, 'the same list without the 0x marker reads the same way');
  assertEqual(plain.results[0].offset, 0x100, 'and finds the same address');
  assertEqual(run(ROMS.byteValues(), { mode: 'value-scan', keyword: '0x41', byteWidth: 8 }).results.length, 0,
    'one number is not a sequence and finds nothing');
});

/* ---- the preview ---- */

suite.test('the preview is a fifty character window with the match in the middle', function () {
  const out = run(ROMS.oneByteSample(), { mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 8, endianness: 'little' });
  const preview = out.results[0].preview;
  assertEqual(out.previewWidth, 50, 'the window width the caller is told about');
  assertEqual(preview.length, 50, 'fifty characters of window');
  assertEqual(preview.indexOf('ABCDEFGHIJK'), 20, 'the match sits a half sample left of the middle');
  assertEqual(preview.replace(/[^#]/g, '').length, 39, 'every byte the sample cannot name is a #');
});

suite.test('the window slides back to keep a match at the end of the rom inside it', function () {
  const preview = run(ROMS.atTheEnd(), { mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 8, endianness: 'little' }).results[0].preview;
  assertEqual(preview.length, 50, 'still fifty characters');
  assertEqual(preview.indexOf('ABCDEFGHIJK'), 39, 'with the whole match in view');
});

suite.test('a rom shorter than the window shows only what it holds', function () {
  const out = run(ROMS.shorterThanTheWindow(), { mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 8, endianness: 'little' });
  assertEqual(out.results[0].preview, '####ABCDEFGHIJK#####', 'four characters before the match and five after it');
});

/* ---- the result shape the table tab reads ---- */

suite.test('a result carries the fields the table tab reads', function () {
  const out = run(ROMS.oneByteSample(), { mode: 'relative', keyword: 'ABCDEFGHIJK', byteWidth: 8, endianness: 'little' });
  const hit = out.results[0];
  assertDeepEqual(Object.keys(hit).sort(), ['offset', 'preview', 'values', 'valuesLabel'], 'the four fields, no more');
  assertEqual(typeof hit.offset, 'number', 'the offset is a number of bytes into the rom');
  assertDeepEqual(hit.values, { A: 65 }, 'the values map a caller turns into table lines');
  assertEqual(hit.valuesLabel, 'A=41', 'and its one line reading');
  assertEqual(run(ROMS.repeated(), { mode: 'relative', keyword: 'ABCDEFGH', byteWidth: 8, maxResults: 1 }).results.length, 1,
    'maxResults caps how many hits come back');
});

/* ---- the edges ---- */

suite.test('a sample the rom cannot hold answers with nothing', function () {
  assertDeepEqual(run(ROMS.oneByteSample(), { mode: 'relative', keyword: '', byteWidth: 8 }), NOTHING, 'an empty sample');
  assertDeepEqual(run(ROMS.oneByteSample(), { mode: 'relative', keyword: 'A', byteWidth: 8 }), NOTHING, 'a one character sample');
  assertDeepEqual(run(ROMS.tooShort(), { mode: 'relative', keyword: 'ABCDEFGH', byteWidth: 8 }), NOTHING, 'a sample longer than the rom');
  assertDeepEqual(run(ROMS.fillerRom(), { mode: 'relative', keyword: 'ABCDEFGH', byteWidth: 8 }), NOTHING, 'steps the rom never takes');
  assertDeepEqual(run(ROMS.emptyRom(), { mode: 'relative', keyword: 'ABCDEFGH', byteWidth: 8 }), NOTHING, 'an empty rom');
  assertDeepEqual(run(ROMS.nullRom(), { mode: 'relative', keyword: 'ABCDEFGH', byteWidth: 8 }), NOTHING, 'no rom at all');
  assertDeepEqual(run(ROMS.oneByteSample(), { mode: 'value-scan', keyword: '0x41', byteWidth: 8 }), NOTHING, 'a value scan of one number');
  const pair = run(ROMS.byteValues(), { mode: 'value-scan', keyword: '0x41, 0x42', byteWidth: 8 });
  assertEqual(pair.results.length, 3, 'a two number value scan matches its one step wherever it falls, and ABCD walks it three times');
  assertEqual(pair.results.map(function (hit) { return hit.offset; }).join(','), '256,257,258', 'at the three windows that step fits');
});

/* ---- equivalence with the implementation this file replaced ---- */
const SAME_RELATIVE = [
  ['simple-8bit-one-hit', 'oneByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8,"endianness":"little"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-8bit-no-width', 'oneByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-8bit-array-input', 'oneByteSampleAsArray', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-8bit-empty-mode', 'oneByteSample', {"mode":"","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-8bit-shifted-base', 'movedAlphabet', {"mode":"relative","keyword":"HELLOWORLD","byteWidth":8,"endianness":"little"}, '{"results":[{"offset":64,"values":{"H":128},"valuesLabel":"H=80","preview":"####################H#############################"}],"previewWidth":50}'],
  ['simple-16bit-little', 'twoByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=4100","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-16bit-big', 'twoByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"big"}, '{"results":[],"previewWidth":50}'],
  ['simple-16bit-front-padding-big', 'twoBytePaddedFront', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"big"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=0041","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['simple-16bit-front-padding-little', 'twoBytePaddedFront', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"little"}, '{"results":[],"previewWidth":50}'],
  ['wildcard-16bit-control-code', 'controlCodeSample', {"mode":"relative","keyword":"AB*DEF","wildcardEnabled":true,"wildcardChar":"*","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=4100","preview":"######################AB#DEF######################"}],"previewWidth":50}'],
  ['wildcard-16bit-wildcard-off', 'controlCodeSample', {"mode":"relative","keyword":"AB*DEF","wildcardEnabled":false,"byteWidth":16,"endianness":"little"}, '{"results":[],"previewWidth":50}'],
  ['wildcard-mixed-case', 'mixedCaseSample', {"mode":"relative","keyword":"AbCdEf","byteWidth":8,"endianness":"little"}, '{"results":[{"offset":128,"values":{"A":65,"a":97},"valuesLabel":"A=41 a=61","preview":"######################AbCdEf######################"}],"previewWidth":50}'],
  ['wildcard-mixed-case-max1', 'mixedCaseSample', {"mode":"relative","keyword":"AbCdEf","byteWidth":8,"maxResults":1}, '{"results":[{"offset":128,"values":{"A":65,"a":97},"valuesLabel":"A=41 a=61","preview":"######################AbCdEf######################"}],"previewWidth":50}'],
  ['wildcard-star-literal', 'starSample', {"mode":"relative","keyword":"A*C","wildcardEnabled":false,"byteWidth":8}, '{"results":[{"offset":80,"values":{"A":65},"valuesLabel":"A=41","preview":"########################A#C#######################"}],"previewWidth":50}'],
  ['wildcard-star-enabled-middle', 'starSample', {"mode":"relative","keyword":"A*C","wildcardEnabled":true,"wildcardChar":"*","byteWidth":8}, '{"results":[{"offset":80,"values":{"A":65},"valuesLabel":"A=41","preview":"########################A#C#######################"}],"previewWidth":50}'],
  ['cap-five-hits', 'repeated', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":288,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":320,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":352,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":384,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"}],"previewWidth":50}'],
  ['cap-three', 'repeated', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8,"maxResults":3}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":288,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"},{"offset":320,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"}],"previewWidth":50}'],
  ['cap-one', 'repeated', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8,"maxResults":1}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"#####################ABCDEFGH#####################"}],"previewWidth":50}'],
  ['flat-sample-in-filler-many-hits', 'oneByteSample', {"mode":"relative","keyword":"ZZZZZZZZ","byteWidth":8}, '{"results":[{"offset":0,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":8,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":16,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":24,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":32,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":40,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":48,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":56,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":64,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":72,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":80,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":88,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":96,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":104,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":112,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":120,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":128,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":136,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":144,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":152,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":160,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":168,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":176,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":184,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":192,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":200,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":208,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":216,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":224,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":232,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ#####"},{"offset":240,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ###########ZZ"},{"offset":248,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ###########ZZZZZZZZZZ"},{"offset":267,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZ###########ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":275,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZ###########ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":283,"values":{"Z":17},"valuesLabel":"Z=11","preview":"#####ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":291,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":299,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":307,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":315,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":323,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":331,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":339,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":347,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":355,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":363,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":371,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":379,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":387,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":395,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":403,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":411,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":419,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":427,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":435,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":443,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":451,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":459,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":467,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":475,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":483,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":491,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":499,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":507,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":515,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":523,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":531,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":539,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":547,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":555,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":563,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":571,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":579,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":587,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":595,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":603,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":611,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":619,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":627,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":635,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":643,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":651,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":659,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":667,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":675,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":683,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":691,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":699,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":707,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":715,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":723,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":731,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":739,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":747,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":755,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":763,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":771,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":779,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":787,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":795,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":803,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":811,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":819,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":827,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":835,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":843,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":851,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":859,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":867,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":875,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":883,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":891,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":899,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":907,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":915,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":923,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":931,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":939,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":947,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":955,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":963,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":971,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":979,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":987,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":995,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":1003,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},{"offset":1011,"values":{"Z":17},"valuesLabel":"Z=11","preview":"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"}],"previewWidth":50}'],
  ['preview-match-at-zero', 'atTheStart', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":0,"values":{"A":65},"valuesLabel":"A=41","preview":"ABCDEFGHIJK#######################################"}],"previewWidth":50}'],
  ['preview-match-at-end', 'atTheEnd', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":501,"values":{"A":65},"valuesLabel":"A=41","preview":"#######################################ABCDEFGHIJK"}],"previewWidth":50}'],
  ['preview-rom-shorter-than-window', 'shorterThanTheWindow', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":4,"values":{"A":65},"valuesLabel":"A=41","preview":"####ABCDEFGHIJK#####"}],"previewWidth":50}'],
  ['preview-unknown-bytes', 'unknownBytes', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8}, '{"results":[{"offset":128,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['preview-unknown-bytes-16bit', 'noisyTwoByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":128,"values":{"A":65},"valuesLabel":"A=4100","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['odd-length-16bit', 'oddLength', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":64,"values":{"A":65},"valuesLabel":"A=4100","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['values-label-high-byte', 'highBytes', {"mode":"relative","keyword":"ÿþý","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":256,"values":{"ÿ":255},"valuesLabel":"ÿ=FF00","preview":"########################ÿ#########################"}],"previewWidth":50}'],
  ['case-change-crafted-codes', 'craftedCodes', {"mode":"relative","keyword":"AbCdEf","byteWidth":8}, '{"results":[{"offset":256,"values":{"A":32,"a":64},"valuesLabel":"A=20 a=40","preview":"######################AbCdEf######################"}],"previewWidth":50}'],
  ['keyword-with-spaces', 'spacedText', {"mode":"relative","keyword":"A B C","byteWidth":8}, '{"results":[{"offset":96,"values":{"A":65},"valuesLabel":"A=41","preview":"#######################A#B#C######################"}],"previewWidth":50}'],
];

const SAME_VALUE_SCANS = [
  ['value-scan-hex-list', 'byteValues', {"mode":"value-scan","keyword":"41 42 43 44","byteWidth":8}, '{"results":[{"offset":256,"values":{},"valuesLabel":"","preview":"##################################################"}],"previewWidth":50}'],
  ['value-scan-comma-hex', 'byteValues', {"mode":"value-scan","keyword":"0x41,0x42,0x43,0x44","byteWidth":8}, '{"results":[{"offset":256,"values":{},"valuesLabel":"","preview":"##################################################"}],"previewWidth":50}'],
  ['value-scan-mixed-separators', 'byteValues', {"mode":"value-scan","keyword":" 0x41 , 0x42\t0x43 0x44 ","byteWidth":8}, '{"results":[{"offset":256,"values":{},"valuesLabel":"","preview":"##################################################"}],"previewWidth":50}'],
  ['value-scan-decimal-looking', 'byteValues', {"mode":"value-scan","keyword":"65 66 67 68","byteWidth":8}, '{"results":[{"offset":256,"values":{},"valuesLabel":"","preview":"##################################################"}],"previewWidth":50}'],
  ['value-scan-single-number', 'byteValues', {"mode":"value-scan","keyword":"41","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['value-scan-empty', 'byteValues', {"mode":"value-scan","keyword":"","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['value-scan-16bit', 'twoByteSample', {"mode":"value-scan","keyword":"41 42 43 44","byteWidth":16,"endianness":"little"}, '{"results":[{"offset":256,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":258,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":260,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":262,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":264,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":266,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":268,"values":{},"valuesLabel":"","preview":"##################################################"},{"offset":270,"values":{},"valuesLabel":"","preview":"##################################################"}],"previewWidth":50}'],
  ['value-scan-16bit-big', 'twoByteSample', {"mode":"value-scan","keyword":"41 42 43 44","byteWidth":16,"endianness":"big"}, '{"results":[],"previewWidth":50}'],
];

const SAME_EDGES = [
  ['edge-empty-keyword', 'oneByteSample', {"mode":"relative","keyword":"","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['edge-one-char-keyword', 'oneByteSample', {"mode":"relative","keyword":"A","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['edge-keyword-longer-than-rom', 'tooShort', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['edge-empty-rom', 'emptyRom', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['edge-null-rom', 'nullRom', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['no-match-in-filler', 'fillerRom', {"mode":"relative","keyword":"ABCDEFGH","byteWidth":8}, '{"results":[],"previewWidth":50}'],
  ['edge-null-options', 'oneByteSample', null, '{"results":[],"previewWidth":50}'],
  ['edge-missing-options-fields', 'oneByteSample', {}, '{"results":[],"previewWidth":50}'],
  ['edge-nan-max-results', 'oneByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8,"maxResults":"abc"}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['edge-zero-max-results', 'oneByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8,"maxResults":0}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['edge-negative-max-results', 'oneByteSample', {"mode":"relative","keyword":"ABCDEFGHIJK","byteWidth":8,"maxResults":-5}, '{"results":[{"offset":256,"values":{"A":65},"valuesLabel":"A=41","preview":"####################ABCDEFGHIJK###################"}],"previewWidth":50}'],
  ['edge-int8-view', 'int8View', {"mode":"relative","keyword":"ABCDEF","byteWidth":8}, '{"results":[{"offset":0,"values":{"A":65},"valuesLabel":"A=41","preview":"ABCDEF"}],"previewWidth":50}'],
];
[
  ['a relative search', SAME_RELATIVE],
  ['a value scan', SAME_VALUE_SCANS],
  ['an edge case', SAME_EDGES]
].forEach(function (group) {
  suite.test('the replaced implementation gave the same answer for ' + group[0], function () {
    group[1].forEach(function (row) {
      assertDeepEqual(run(ROMS[row[1]](), row[2]), JSON.parse(row[3]), row[0]);
    });
  });
});

module.exports = { suite: suite };
