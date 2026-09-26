/* The game profile: the one place where knowledge about a single game lives.

   The point of the profile is precision: guessing a pointer table from shapes produced
   41 wrong candidates on one rom and none on another, while a profile states the address
   and the rule. These gates check the mechanism (lookup, validation, use by the build,
   project round trip), not the contents of any one game's profile. */

const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('game profile');

const AOS_SHA = 'abd71fe01ebb201bcc133074db1dd8c5253776c7';

async function loadRom(fixture, options) {
  const env = loadWorkbench();
  const K = env.K;
  if (options && options.identifyAs) K.core.identifyRom = function () { return { sha1: options.identifyAs }; };
  const info = { data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length };
  K.hex.setRomFromLoad(info, 'GBA');
  K.search.setRomFromLoad(info, 'GBA');
  K.translate.setRomFromLoad(info, 'GBA');
  if (options && options.profile) K.translate.loadProfileContent(JSON.stringify(options.profile));
  if (options && options.buildOptions) K.translate.setBuildOptions(options.buildOptions);
  K.translate.loadProjectContent(JSON.stringify(fixture.project));
  await env.runPending();
  await env.sleep(30);
  await env.runPending();
  return { env: env, K: K };
}

suite.test('a rom the app knows gets its profile by fingerprint', async function (t) {
  const fixture = buildSyntheticRom({ records: 8 });
  const loaded = await loadRom(fixture, { identifyAs: AOS_SHA });
  const info = loaded.K.translate.getProfileInfo();
  t.assert(info.profile, 'a profile should have been found for that fingerprint');
  t.assertEqual(info.source, 'built in', 'from the built in registry');
  t.assertEqual(info.profile.id, 'castlevania-aos-usa', 'the Aria of Sorrow profile');
  t.assertEqual(info.profile.pointers.at, 0x506B40, 'with the verified table site');
  t.assertEqual(info.profile.pointers.count, 2893, 'and its entry count');
  t.assert(info.summary.known.join(' ').indexOf('pointer table') >= 0, 'the summary should list what is known');
  t.assert(info.summary.missing.join(' ').indexOf('font') >= 0, 'and say the font is not known yet');
  t.assertEqual(info.summary.complete, false, 'so the profile is not complete');
});

suite.test('a rom nobody knows gets no profile, and says so by having none', async function (t) {
  const fixture = buildSyntheticRom({ records: 8 });
  const loaded = await loadRom(fixture);
  const info = loaded.K.translate.getProfileInfo();
  t.assertEqual(info.profile, null, 'no profile for an unknown fingerprint');
  t.assertEqual(info.source, '', 'and no source is claimed');
});

suite.test('a profile a user writes is used by the build, and its table wins', async function (t) {
  const fixture = buildSyntheticRom({ records: 16 });
  const profile = {
    format: 'ketor-profile', version: 1,
    id: 'synthetic-gba', name: 'Synthetic test rom', console: 'gba', sha1: '',
    pointers: { at: fixture.table.at, count: fixture.count, entrySize: 4, stride: 4, endianness: 'little', base: fixture.base },
    records: { header: '0100', end: '05090A' },
    graphics: { tileFormat: 'gba-4bpp', font: null, window: null, palette: null }
  };
  const loaded = await loadRom(fixture, { profile: profile });
  const K = loaded.K;
  const info = K.translate.getProfileInfo();
  t.assertEqual(info.source, 'loaded', 'the loaded profile is the one in force');
  t.assertEqual(info.summary.complete, false, 'it is still missing the graphics');
  t.assert(info.summary.known.join(' ').indexOf('pointer table (16 entries') >= 0, 'and the table is listed as known: ' + info.summary.known.join(', '));

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
  t.assert(/Synthetic test rom/.test(log), 'the build report should name the profile it used: ' + log.slice(0, 300));
  t.assert(/Self check passed/.test(log), 'and the self check should have passed');
});

suite.test('a broken profile file is refused with a reason, not half applied', async function (t) {
  const fixture = buildSyntheticRom({ records: 8 });
  const env = loadWorkbench();
  const K = env.K;
  const info = { data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length };
  K.hex.setRomFromLoad(info, 'GBA'); K.search.setRomFromLoad(info, 'GBA'); K.translate.setRomFromLoad(info, 'GBA');
  t.assertEqual(K.translate.loadProfileContent('{ not json'), null, 'invalid JSON is refused');
  t.assert(/not valid JSON/.test(K.translate.getState().status), 'with a reason: ' + K.translate.getState().status);
  t.assertEqual(K.translate.loadProfileContent(JSON.stringify({ format: 'something-else' })), null, 'a foreign document is refused');
  t.assert(/Not a Ketor game profile/.test(K.translate.getState().status), 'with its own reason');
  t.assertEqual(K.translate.getProfileInfo().profile, null, 'and nothing was applied');
});

module.exports = { suite: suite };
