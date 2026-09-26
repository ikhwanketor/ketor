/* The Pointers & Insert Range panel: what it reads, what it declares, and what the
   build does with it. The panel is the only place a user can see which pointer table
   the engine will trust, so the readout has to be the truth the build uses, not a
   copy that can drift from it. */

const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('translate panel');

async function loadRom(fixture, options) {
  const env = loadWorkbench();
  const K = env.K;
  /* A suite may pretend the rom is one the registry knows, so the registry path is
     gated without shipping somebody's rom in the repository. */
  if (options && options.identifyAs) {
    K.core.identifyRom = function () { return { sha1: options.identifyAs }; };
  }
  const info = { data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length };
  K.hex.setRomFromLoad(info, 'GBA');
  K.search.setRomFromLoad(info, 'GBA');
  K.translate.setRomFromLoad(info, 'GBA');
  if (options && options.buildOptions) K.translate.setBuildOptions(options.buildOptions);
  K.translate.loadProjectContent(JSON.stringify(fixture.project));
  await env.runPending();
  await env.sleep(30);
  await env.runPending();
  return { env: env, K: K };
}

suite.test('without a table the panel says so, and says what that costs', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture);
  const info = loaded.K.translate.getPointerTableInfo();
  t.assertEqual(info.source, 'none', 'a rom nobody verified has no table yet');
  t.assertEqual(info.table, null, 'and no table object');
  t.assert(/searches each block/.test(info.note), 'the note should explain what happens without one');
});

suite.test('detecting finds the table this rom really has', async function (t) {
  const fixture = buildSyntheticRom({ records: 40 });
  const loaded = await loadRom(fixture);
  const rows = loaded.K.translate.detectPointers();
  t.assert(rows.length > 0, 'the detector found nothing: ' + loaded.K.translate.getState().pointerNote);
  const hit = rows.filter(function (r) { return r.at === fixture.table.at; })[0];
  t.assert(hit, 'the table at 0x' + fixture.table.at.toString(16) + ' was not reported');
  t.assertEqual(hit.entrySize, 4, 'four byte entries');
  t.assertEqual(hit.base, fixture.base, 'base 0x08000000');
  t.assert(hit.count >= fixture.count, 'the table should cover the records, got ' + hit.count);
});

suite.test('declaring a table changes what the build is handed', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture);
  const rows = loaded.K.translate.detectPointers();
  const declared = loaded.K.translate.declarePointerTable(rows[0]);
  t.assert(declared, 'the declaration should have been accepted');
  const info = loaded.K.translate.getPointerTableInfo();
  t.assertEqual(info.source, 'declared', 'the panel should report a declared table');
  t.assertEqual(info.table.at, rows[0].at, 'at the site that was declared');
  t.assertEqual(loaded.K.translate.getBuildOptions().knownPointerTable.at, rows[0].at, 'and the build options should carry it');

  const built = await (async function () {
    const target = fixture.records[1];
    loaded.K.search.applyTranslations([{ startByte: target.textStart, translatedText: target.text + ' X X X X' }]);
    await loaded.env.sleep(20);
    loaded.K.translate.buildModifiedRom('all');
    await loaded.env.runPending();
    await loaded.env.sleep(200);
    await loaded.env.runPending();
    return loaded.K.translate.getState();
  })();
  t.assert(built.modifiedRom, 'the build produced no image: ' + built.status);
  t.assert(/named by the table at 0x/.test((built.buildLog || []).join('\n')), 'the build should have used the declared table');
  t.assert(/Self check passed/.test((built.buildLog || []).join('\n')), 'the self check should have passed');

  loaded.K.translate.clearPointerTable();
  t.assertEqual(loaded.K.translate.getPointerTableInfo().source, 'none', 'clearing removes the declaration');
});

suite.test('the insert mode is one of three and it reaches the build options', async function (t) {
  const fixture = buildSyntheticRom({ records: 8 });
  const loaded = await loadRom(fixture);
  const K = loaded.K;
  t.assertEqual(K.translate.getBuildOptions().allowMessageShift, undefined, 'the default is unset, which means the record moves');
  K.translate.setBuildOptions({ allowMessageShift: true });
  t.assertEqual(K.translate.getBuildOptions().allowMessageShift, true, 'shift mode');
  K.translate.setBuildOptions({ allowMessageShift: false });
  t.assertEqual(K.translate.getBuildOptions().allowMessageShift, false, 'never mode');
  K.translate.setBuildOptions({ allowMessageShift: null });
  t.assertEqual(K.translate.getBuildOptions().allowMessageShift, null, 'and back to the default');
});

suite.test('a project brings its declared table and its mode back', async function (t) {
  const fixture = buildSyntheticRom({ records: 8 });
  const loaded = await loadRom(fixture);
  const payload = JSON.parse(JSON.stringify(fixture.project));
  payload.pointers = {
    table: { at: 0x2000, count: 33, entrySize: 4, stride: 4, endianness: 'little', base: 0x08000000, name: 'declared table', confirmed: true },
    allowMessageShift: true
  };
  loaded.K.translate.loadProjectContent(JSON.stringify(payload));
  await loaded.env.sleep(20);
  const info = loaded.K.translate.getPointerTableInfo();
  t.assertEqual(info.source, 'declared', 'the saved declaration should be restored');
  t.assertEqual(info.table.at, 0x2000, 'at the saved site');
  t.assertEqual(info.table.count, 33, 'with the saved entry count');
  t.assertEqual(loaded.K.translate.getBuildOptions().allowMessageShift, true, 'and the saved insert mode');
});

suite.test('a rom the registry knows is read from the registry, not guessed', async function (t) {
  /* The regression this gate exists for: the registry once sat inside the build
     function, so the panel could not read it, the lookup threw, and the build fell
     back to guessing a table from the image - 2895 entries instead of 2893. */
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture, { identifyAs: 'abd71fe01ebb201bcc133074db1dd8c5253776c7' });
  const info = loaded.K.translate.getPointerTableInfo();
  t.assertEqual(info.source, 'profile', 'the verified profile should be used');
  t.assertEqual(info.table.at, 0x506B40, 'at the verified site');
  t.assertEqual(info.table.count, 2893, 'with the verified entry count');
});

suite.test('an unconfirmed candidate is refused, and never replaces the verified profile', async function (t) {
  /* The user log of 26 Sep: a candidate of 124 entries at 0x229E94 (graphics pointers)
     was declared, the self check then read that layout and reported 118 broken records
     that were fine, and every shift was rolled back for a reason that was not real. */
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture, { identifyAs: 'abd71fe01ebb201bcc133074db1dd8c5253776c7' });
  const K = loaded.K;
  const refused = K.translate.declarePointerTable({ at: 0x229E94, count: 124, entrySize: 4, stride: 4, base: 0x08000000, confirmed: false });
  t.assertEqual(refused, null, 'an unconfirmed candidate must not be declared');
  t.assert(/not confirmed/i.test(K.translate.getState().pointerNote), 'and the note should say why: ' + K.translate.getState().pointerNote);

  const accepted = K.translate.declarePointerTable({ at: 0x229E94, count: 124, entrySize: 4, stride: 4, base: 0x08000000, confirmed: true });
  t.assert(accepted, 'a confirmed candidate is accepted');
  const info = K.translate.getPointerTableInfo();
  t.assertEqual(info.source, 'profile', 'but the verified profile for this rom still wins');
  t.assertEqual(info.table.at, 0x506B40, 'at the verified site');
});

suite.test('nothing about pointers is put in front of the user', async function (t) {
  /* The panel existed for one round and was removed on request: a translator should not have
     to know what a pointer table is. The tool finds the table itself and says so in the build
     report, and the settings stay in the project file for anyone who wants to drive them. */
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture);
  const sidebar = loaded.env.K.ui.sidebarProviders.translation;
  t.assert(typeof sidebar === 'function', 'the normal sidebar is still registered');
  const text = loaded.env.treeStrings(sidebar()).join(' | ');
  t.assert(text.indexOf('Pointer') < 0 && text.indexOf('Insert Range') < 0,
    'the sidebar must not talk about pointers or insert ranges: ' + text.slice(0, 200));
});

suite.test('the in game panel is its own right hand panel, not a box in the editor', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture);
  const panel = loaded.env.K.ui.rightPanelProviders.translation;
  t.assert(typeof panel === 'function', 'the translation activity offers a right hand panel');
  const K = loaded.K;
  K.search.applyTranslations([{ startByte: fixture.records[1].textStart, translatedText: 'Baris satu[LINE]Baris dua yang panjang sekali supaya terlihat membungkus di dalam kotak.' }]);
  K.translate.selectOffset(fixture.records[1].textStart);
  await loaded.env.sleep(20);
  const text = loaded.env.treeStrings(panel()).join(' | ');
  t.assert(text.indexOf('Baris satu') >= 0, 'it shows the translation of the selected page: ' + text.slice(0, 200));
  t.assert(/line\(s\), original page width/.test(text), 'and how many lines it needs: ' + text.slice(-200));
  t.assert(/Show the original text|Show your translation/.test(text), 'with a way to see the original in the same box');
});
suite.test('a build needs no settings at all: the table is found and used automatically', async function (t) {
  const fixture = buildSyntheticRom({ records: 16 });
  const loaded = await loadRom(fixture);
  const K = loaded.K;
  t.assertEqual(K.translate.getPointerTableInfo().source, 'none', 'nothing is known before the build');
  const target = fixture.records[2];
  K.search.applyTranslations([{ startByte: target.textStart, translatedText: target.text + ' X X X X' }]);
  await loaded.env.sleep(20);
  K.translate.buildModifiedRom('all');
  await loaded.env.runPending();
  await loaded.env.sleep(200);
  await loaded.env.runPending();
  const state = K.translate.getState();
  t.assert(state.modifiedRom, 'the build produced no image: ' + state.status);
  const log = (state.buildLog || []).join('\n');
  t.assert(/found automatically/.test(log), 'the log should say the table was found by the tool: ' + log.slice(0, 300));
  t.assert(/Self check passed/.test(log), 'and the self check should have passed');
  t.assertEqual(K.translate.getPointerTableInfo().source, 'detected', 'the found table is remembered for the next build');
});


suite.test('the in game preview lays a text out the way the engine draws it', async function (t) {
  /* Measured on the rom: a record holds pages joined by 05 09, a page holds lines joined by
     06 (the [LINE] token), and the extractor gives one page per text. The box therefore has
     to answer one question per text: do these lines fit the width the original page had. */
  const fixture = buildSyntheticRom({ records: 4 });
  const loaded = await loadRom(fixture);
  const layout = loaded.K.translate.previewLayout;

  t.assertEqual(layout('one\ntwo', 20).lines.length, 2, 'a newline is a line break');
  t.assertEqual(layout('a[LINE]b', 20).lines.length, 2, 'so is the line token');
  const wrapped = layout('alpha beta gamma delta', 12);
  t.assertEqual(wrapped.lines.length, 2, 'a line wider than the box wraps');
  wrapped.lines.forEach(function (line) {
    t.assert(line.text.length <= 12, 'no line may be wider than the box: ' + JSON.stringify(line.text));
  });
  t.assertEqual(wrapped.over.length, 0, 'and nothing is reported as too wide');
  const tooWide = layout('supercalifragilistic', 10);
  t.assertEqual(tooWide.over.length, 1, 'a word that cannot be broken is reported as too wide');
  t.assert(layout('[SOMA PORTRAIT]Hello', 20).lines[0].text.indexOf('[SOMA PORTRAIT]') === 0, 'a speaker token stays in the line');
});

module.exports = { suite: suite };
