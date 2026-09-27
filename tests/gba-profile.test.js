/* Which pointer profile a GBA rom gets, and why the table must not decide it.

   The translator's build printed "Pointer profile: profile_default. DWE padding: OFF." on
   a GBA cartridge whose table is two bytes a character (khcom.tbl: 4100=A). Both GBA
   lines in the selection are written for a one byte table, so a sixteen bit table fell
   through to the generic profile and every GBA rule - the strict pointer validation,
   the absolute transforms, every branch that asks whether this is a GBA profile - was
   skipped. The console decides the console; the table decides the encoding.

   These two gates pin the label the build prints, which is the line that was wrong, and
   the one byte case next to it so a careless change to the order shows up. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { createSuite, assert } = require('./helpers/tiny-test');

const suite = createSuite('gba profile');

const BASE = 0x08000000;

/* Letters and a space, one or two bytes a character, plus the end code. */
function tableContent(twoByte) {
  const lines = [];
  for (let i = 0; i < 26; i++) {
    const code = (0x41 + i).toString(16).toUpperCase();
    lines.push((twoByte ? code + '00' : code) + '=' + String.fromCharCode(0x41 + i));
  }
  lines.push((twoByte ? '2000' : '20') + '=[SPACE]');
  lines.push((twoByte ? '0000' : '00') + '=[END]');
  return lines.join('\n') + '\n';
}

function writeCode(rom, at, ch, twoByte) {
  const code = ch === ' ' ? 0x20 : ch.charCodeAt(0);
  rom[at] = code;
  if (twoByte) rom[at + 1] = 0x00;
  return at + (twoByte ? 2 : 1);
}

/* Twelve records, a four byte pointer table in front of them, and nothing else the
   engine could mistake for a pointer. */
function fixture(twoByte) {
  const rom = new Uint8Array(0x40000);
  const records = [];
  const texts = [];
  for (let i = 0; i < 12; i++) {
    const head = 0x2000 + i * 0x40;
    const text = 'MESSAGE ' + String.fromCharCode(0x41 + i) + ' SAYS HELLO';
    rom[head] = 0x01;
    rom[head + 1] = 0x00;
    let at = head + 2;
    for (let k = 0; k < text.length; k++) at = writeCode(rom, at, text[k], twoByte);
    rom[at] = 0x00;
    if (twoByte) rom[at + 1] = 0x00;
    const byteLength = at - (head + 2) + (twoByte ? 2 : 1);
    records.push({ head: head, textStart: head + 2, byteLength: byteLength, text: text });
    texts.push({
      startByte: head + 2, offset: head + 2, byteLength: byteLength,
      originalText: text, translatedText: '', comment: '',
      textType: 'dialogue', buildable: true, source: 'synthetic'
    });
    const pointer = (BASE + head) >>> 0;
    rom[0x1000 + i * 4] = pointer & 0xFF;
    rom[0x1000 + i * 4 + 1] = (pointer >>> 8) & 0xFF;
    rom[0x1000 + i * 4 + 2] = (pointer >>> 16) & 0xFF;
    rom[0x1000 + i * 4 + 3] = (pointer >>> 24) & 0xFF;
  }
  return {
    rom: rom, records: records,
    project: {
      format: 'ketor-project', version: 1,
      rom: { name: 'synthetic.gba', size: rom.length, system: 'GBA' },
      table: { name: 'synthetic.tbl', entryCount: 28, content: tableContent(twoByte) },
      groups: [], texts: texts
    }
  };
}

/* Each case gets its own workbench: the harness runs a worker once, so a second table
   handed to the same table worker would never be parsed and the first table would be
   the one the build sees. That is a limit of this harness, not of the app. */
async function buildOnce(twoByte) {
  const env = loadWorkbench();
  const K = env.K;
  const f = fixture(twoByte);
  const info = { data: f.rom, name: 'synthetic.gba', size: f.rom.length };
  K.hex.setRomFromLoad(info, 'GBA');
  K.search.setRomFromLoad(info, 'GBA');
  K.translate.setRomFromLoad(info, 'GBA');
  K.translate.loadProjectContent(JSON.stringify(f.project));
  await env.runPending();
  await env.sleep(60);
  await env.runPending();
  const pairs = f.records.slice(0, 3).map(function (r) {
    return { startByte: r.textStart, translatedText: 'HELLO' };
  });
  K.search.applyTranslations(pairs);
  await env.sleep(30);
  K.translate.buildModifiedRom('all');
  await env.runPending();
  await env.sleep(500);
  await env.runPending();
  const st = K.translate.getState();
  return { state: st, log: (st.buildLog || []).join('\n') };
}

suite.test('a sixteen bit table on a GBA rom is still read as a GBA rom', async function (t) {
  const built = await buildOnce(true);
  assert(built.log.indexOf('System pipeline: pipeline_gba') >= 0, 'the build ran as GBA: ' + built.log.slice(0, 200));
  assert(built.log.indexOf('Pointer profile: profile_gba_multibyte.') >= 0,
    'the profile is the GBA one for a multi byte table, got: ' + built.log.split('\n')[0]);
  assert(built.log.indexOf('profile_default') < 0, 'and the generic profile is not used for a GBA cartridge');
  assert(built.log.indexOf('DWE padding: OFF') >= 0, 'with the padding byte off, which is the case that was reported');
});

suite.test('a one byte table keeps the profile it always had', async function (t) {
  const built = await buildOnce(false);
  assert(built.log.indexOf('Pointer profile: profile_gba_nonpadding.') >= 0,
    'a one byte table on a GBA rom keeps profile_gba_nonpadding, got: ' + built.log.split('\n')[0]);
  assert(built.log.indexOf('profile_default') < 0, 'and never falls back to the generic profile');
});

module.exports = { suite: suite };
