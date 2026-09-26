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
    table: { at: 0x2000, count: 33, entrySize: 4, stride: 4, endianness: 'little', base: 0x08000000, name: 'declared table' },
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

suite.test('the panel renders the readout, the detector and the three modes', async function (t) {
  const fixture = buildSyntheticRom({ records: 12 });
  const loaded = await loadRom(fixture, { buildOptions: { knownPointerTable: fixture.table } });
  const provider = loaded.env.K.ui.sidebarProviders.translation;
  t.assert(typeof provider === 'function', 'the translation sidebar should be registered');
  const tree = provider();
  const text = loaded.env.treeStrings(tree).join(' | ');
  t.assert(text.indexOf('Pointers & Insert Range') >= 0, 'the section should be there: ' + text.slice(0, 200));
  t.assert(text.indexOf('Verified profile for this rom') >= 0 || text.indexOf('Declared table') >= 0, 'the readout should name the table source: ' + text.slice(0, 300));
  t.assert(text.indexOf('Detect pointer table') >= 0, 'the detect action should be there');
  t.assert(text.indexOf('Move the record to free space') >= 0, 'the default mode should be listed');
  t.assert(text.indexOf('Shift the messages after it') >= 0, 'the shift mode should be listed');
  t.assert(text.indexOf('Never move, only report') >= 0, 'the refusal mode should be listed');
  t.assert(text.indexOf('● Move the record') >= 0, 'the active mode should be marked');
});

module.exports = { suite: suite };
