/* What the engine does with a record that outgrows its room.

   Six gates, all on a rom the fixture builds: nothing grows, one record grows, every
   record grows, the shift path is asked for, the shift path is refused, and the self
   check is the thing that decides whether an image is handed over at all. The numbers
   in the titles are the ones measured on the real project in batch 92. */

const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom, inspectRecords, readTable } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('insert policy');

async function build(fixture, translated, buildOptions) {
  const env = loadWorkbench();
  const K = env.K;
  const data = fixture.rom;
  const info = { data: data, name: 'synthetic.gba', size: data.length };
  K.hex.setRomFromLoad(info, 'GBA');
  K.search.setRomFromLoad(info, 'GBA');
  K.translate.setRomFromLoad(info, 'GBA');
  K.translate.setBuildOptions(buildOptions || { knownPointerTable: fixture.table });
  K.translate.loadProjectContent(JSON.stringify(fixture.project));
  await env.runPending();
  await env.sleep(30);
  await env.runPending();

  const pairs = [];
  Object.keys(translated || {}).forEach(function (key) {
    pairs.push({ startByte: Number(key), translatedText: translated[key] });
  });
  if (pairs.length > 0) K.search.applyTranslations(pairs);
  await env.sleep(20);

  K.translate.buildModifiedRom('all');
  await env.runPending();
  await env.sleep(200);
  await env.runPending();
  const state = K.translate.getState();
  return { state: state, out: state.modifiedRom, log: state.buildLog || [], env: env };
}

function logLine(log, pattern) {
  for (const line of log) if (pattern.test(String(line))) return String(line);
  return '';
}

function sameBytes(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function grow(text, extra) {
  return text + ' X'.repeat(Math.ceil(extra / 2)).slice(0, extra);
}

suite.test('nothing grows: the image is handed back untouched', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const translated = {};
  fixture.records.forEach(function (r) { translated[r.textStart] = r.text; });
  const built = await build(fixture, translated, { knownPointerTable: fixture.table });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assert(sameBytes(built.out, fixture.rom), 'an image with no growth should be byte for byte the loaded rom');
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assertEqual(report.broken.length, 0, 'no record may be broken');
  t.assertEqual(report.moved, 0, 'nothing should have moved');
  t.assert(/Self check passed/.test(built.log.join('\n')), 'the self check should have passed');
});

suite.test('the default grows the record in place and keeps the rom the size it was', async function (t) {
  /* The user was explicit: a bigger rom is dangerous (the header declares a size and flash
     carts have one), and only a text that overflows may be moved. A grown record is paid for
     by the padding of the messages after it, so nothing has to leave the rom at all. */
  const fixture = buildSyntheticRom({ records: 12 });
  const target = fixture.records[3];
  const translated = {};
  translated[target.textStart] = grow(target.text, 8);
  const built = await build(fixture, translated, { knownPointerTable: fixture.table });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assertEqual(built.out.length, fixture.rom.length, 'the image must not grow');

  const before = readTable(fixture.rom, fixture.table);
  const after = readTable(built.out, fixture.table);
  t.assertEqual(before[3], after[3], 'a record that grew in place keeps its address');
  let changed = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed++;
  t.assertEqual(changed, 0, 'and no pointer has to be rewritten for it');
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assertEqual(report.broken.length, 0, 'no record may be broken: ' + JSON.stringify(report.broken.slice(0, 3)));
  const text = built.log.join('\\n');
  t.assert(/Grew in place/.test(text), 'the log should say it grew where it was: ' + text.slice(0, 200));
  t.assert(/Insert check: all/.test(text), 'and every translated text should be verified present');
  t.assert(/Self check passed/.test(text), 'the self check should have passed');
});
suite.test('move only mode: the record moves to free space inside the rom, one entry changes', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const target = fixture.records[3];
  const translated = {};
  translated[target.textStart] = grow(target.text, 20);
  const built = await build(fixture, translated, {
    knownPointerTable: fixture.table, allowMessageShift: false, allowRelocation: true
  });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assertEqual(built.out.length, fixture.rom.length, 'the image must not grow');

  const before = readTable(fixture.rom, fixture.table);
  const after = readTable(built.out, fixture.table);
  let changed = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed++;
  t.assertEqual(changed, 1, 'exactly one table entry may change');
  const at = after[3];
  t.assert(at !== before[3], 'the grown record should have been repointed');
  t.assert(at < fixture.rom.length, 'to a place inside the rom, not past its end: 0x' + at.toString(16));
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assertEqual(report.broken.length, 0, 'no record may be broken: ' + JSON.stringify(report.broken.slice(0, 3)));
  const text = built.log.join('\\n');
  t.assert(/Self check passed/.test(text), 'the self check should have passed');
  t.assert(/Insert check: all/.test(text), 'and the insert check should be green');
  t.assert(!/Grew in place/.test(text), 'nothing may be shifted in this mode');
});
suite.test('every record grows: all grow in place and the rom keeps its size', async function (t) {
  const fixture = buildSyntheticRom({ records: 48 });
  const translated = {};
  fixture.records.forEach(function (r) { translated[r.textStart] = grow(r.text, 8); });
  const built = await build(fixture, translated, { knownPointerTable: fixture.table });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assertEqual(built.out.length, fixture.rom.length, 'the image must not grow');
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assert(report.moved <= 1, 'at most the last record may have to move (it has no padding after it): ' + report.moved + ' moved');
  t.assertEqual(report.moved + report.inPlace, fixture.count, 'every record must be accounted for');
  t.assertEqual(report.broken.length, 0, 'no record may be broken: ' + JSON.stringify(report.broken.slice(0, 3)));
  const text = built.log.join('\\n');
  t.assert(/Self check passed/.test(text), 'the self check should have passed');
  t.assert(/Insert check: all/.test(text), 'and the insert check should be green');
});
suite.test('every record grows in move only mode: each one moves to its own address', async function (t) {
  const fixture = buildSyntheticRom({ records: 48 });
  const translated = {};
  fixture.records.forEach(function (r) { translated[r.textStart] = grow(r.text, 8); });
  const built = await build(fixture, translated, {
    knownPointerTable: fixture.table, allowMessageShift: false, allowRelocation: true
  });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);

  const after = readTable(built.out, fixture.table);
  const unique = new Set(after);
  t.assertEqual(unique.size, after.length, 'every moved record needs its own address');
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assertEqual(report.moved, fixture.count, 'every grown record should have moved');
  t.assertEqual(report.broken.length, 0, 'no record may be broken: ' + JSON.stringify(report.broken.slice(0, 3)));
  t.assert(/Self check passed/.test(built.log.join('\n')), 'the self check should have passed');
});

suite.test('shift only mode: the record grows where it is and stays there', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const target = fixture.records[2];
  const translated = {};
  translated[target.textStart] = grow(target.text, 8);
  const built = await build(fixture, translated, { knownPointerTable: fixture.table, allowMessageShift: true });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);

  const before = readTable(fixture.rom, fixture.table);
  const after = readTable(built.out, fixture.table);
  t.assert(before[2] === after[2], 'growing in place must not repoint the record');
  t.assert(/Grew in place/.test(built.log.join('\n')), 'the log should say it grew in place');
  const report = inspectRecords(built.out, fixture, fixture.rom);
  t.assertEqual(report.broken.length, 0, 'no record may be broken');
});

suite.test('allowMessageShift false: nothing is written and the record is reported', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const target = fixture.records[4];
  const translated = {};
  translated[target.textStart] = grow(target.text, 20);
  const built = await build(fixture, translated, { knownPointerTable: fixture.table, allowMessageShift: false });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assert(sameBytes(built.out, fixture.rom), 'nothing may be written when moving nothing was asked for');
  const text = built.log.join('\n');
  t.assert(/asked to move nothing/.test(text), 'the log should say the growth was refused');
  t.assert(/Needs 20 byte\(s\) more/.test(text), 'the log should say how many bytes the record needs');
  t.assert(/Self check passed/.test(text), 'the self check should have passed');
});

suite.test('the self check is the net: a build it refuses hands the original back', async function (t) {
  /* Asking for the shift path on every record at once is the case measured on the real
     project: twenty two of them left nine records without their end code. Whether this
     rom breaks the same way is not the point of the gate - the point is that no image
     which fails the check is ever handed over. */
  const fixture = buildSyntheticRom({ records: 48 });
  const translated = {};
  fixture.records.forEach(function (r) { translated[r.textStart] = grow(r.text, 40); });
  const built = await build(fixture, translated, { knownPointerTable: fixture.table, allowMessageShift: true, keepBrokenImageForTests: false });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  const text = built.log.join('\n');
  if (/Self check failed/.test(text)) {
    t.assert(sameBytes(built.out, fixture.rom), 'a refused build must hand the loaded rom back');
  } else {
    t.assert(/Self check passed/.test(text), 'a build that was not refused must say the check passed');
    const report = inspectRecords(built.out, fixture, fixture.rom);
    t.assertEqual(report.broken.length, 0, 'an image that passes the check must have no broken record');
  }
});

suite.test('an insert that stays inside the rom reaches Export patched ROM', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const target = fixture.records[5];
  const translated = {};
  translated[target.textStart] = grow(target.text, 24);
  const built = await build(fixture, translated, { knownPointerTable: fixture.table });
  t.assert(built.out, 'the build produced no image: ' + built.state.status);
  t.assertEqual(built.out.length, fixture.rom.length, 'the image keeps the size of the file that was loaded');

  const K = built.env.K;
  const exported = K.hex.getPatchedBytes();
  t.assertEqual(exported.length, built.out.length, 'the exported image has the size of the insert');
  let same = true;
  for (let i = 0; i < built.out.length; i++) { if (exported[i] !== built.out[i]) { same = false; break; } }
  t.assert(same, 'and it carries every byte of the insert');
  K.hex.exportPatchedRom();
  const status = String(K.hex.getState().status || '');
  t.assert(/Exported/.test(status), 'the export should report the file it wrote: ' + status);
  t.assert(/\.gba\b/i.test(status), 'with the rom extension of the file that was loaded: ' + status);
});
module.exports = { suite: suite };
