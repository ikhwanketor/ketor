/* A record whose text starts at the record start has no header, and translating it must
   not be read as damage.

   The record self check compared the first two bytes at a record with the first two bytes
   of the original record to prove the header survived the move. For a game whose records
   open with the text itself (Kingdom Hearts: the intro record starts with the letter 'A')
   those two bytes ARE the translation, so every moved record looked broken, the rom was
   handed back and the game kept its old words - the build the translator kept getting.
   These gates hold both halves: a header-less record can be translated and moved, and a
   record that really has a header still has to keep it. */
'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('headerless record');

const BASE = 0x08000000;

function tableContent() {
  const lines = [];
  for (let i = 0; i < 26; i++) {
    const code = (0x41 + i).toString(16).toUpperCase();
    lines.push(code + '=' + String.fromCharCode(0x41 + i));
  }
  lines.push('20=[SPACE]');
  lines.push('00=[END]');
  return lines.join('\n') + '\n';
}

/* Ten records that begin with their text, a four byte pointer table in front of them,
   and nothing else that looks like a pointer. */
function fixture(withHeader) {
  /* The region that holds the table and the records is filled with something that is
     not free space, and the rest of the rom stays zero - which is what the allocator
     looks for. A rom with no free space at all cannot move a record, and the point of
     this suite is the move. */
  const rom = new Uint8Array(0x40000);
  rom.fill(0x11, 0x1000, 0x2000 + 10 * 0x40);
  const records = [];
  const texts = [];
  for (let i = 0; i < 10; i++) {
    const head = 0x2000 + i * 0x40;
    const text = 'MESSAGE ' + String.fromCharCode(0x41 + i) + ' SAYS HELLO';
    let at = head;
    if (withHeader) { rom[head] = 0x01; rom[head + 1] = 0x00; at = head + 2; }
    for (let k = 0; k < text.length; k++) rom[at + k] = text.charCodeAt(k);
    rom[at + text.length] = 0x00;
    const byteLength = at + text.length + 1 - at;
    records.push({ head: head, textStart: at, byteLength: byteLength, text: text });
    texts.push({
      startByte: at, offset: at, byteLength: byteLength,
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
      table: { name: 'synthetic.tbl', entryCount: 28, content: tableContent() },
      groups: [], texts: texts
    }
  };
}

async function buildOne(withHeader, longerBy) {
  const env = loadWorkbench();
  const K = env.K;
  const f = fixture(withHeader);
  const target = f.records[3];
  f.project.texts[3].translatedText = target.text + ' AND MORE';
  const info = { data: f.rom, name: 'synthetic.gba', size: f.rom.length };
  K.hex.setRomFromLoad(info, 'GBA');
  K.search.setRomFromLoad(info, 'GBA');
  K.translate.setRomFromLoad(info, 'GBA');
  K.translate.setBuildOptions({ allowMessageShift: false, allowRelocation: true });
  K.translate.loadProjectContent(JSON.stringify(f.project));
  await env.runPending();
  await env.sleep(60);
  await env.runPending();
  K.translate.buildModifiedRom('all');
  await env.runPending();
  await env.sleep(500);
  await env.runPending();
  const st = K.translate.getState();
  return { state: st, log: (st.buildLog || []).join('\n'), fixture: f, target: target, rom: f.rom };
}

suite.test('a record without a header can be translated and moved', async function (t) {
  const built = await buildOne(false, 9);
  assert(built.log.indexOf('Self check failed') < 0,
    'the self check must not refuse a header-less record: ' + built.log.slice(0, 400));
  assert(built.log.indexOf('Self check passed') >= 0, 'the self check passed: ' + built.log.slice(0, 300));
  assert(built.log.indexOf('Relocated to 0x') >= 0, 'and the record was moved: ' + built.log.slice(0, 300));
  const out = built.state.modifiedRom;
  assert(out && out.length === built.rom.length, 'an image came back, the same size as the rom');
  let changed = 0;
  for (let i = 0; i < out.length; i++) if (out[i] !== built.rom[i]) changed++;
  assert(changed > 0, 'and it is not the original rom handed back');
  /* the text has to be where the table now says it is */
  const at = 0x1000 + 3 * 4;
  const target = (out[at] | (out[at + 1] << 8) | (out[at + 2] << 16) | (out[at + 3] << 24)) >>> 0;
  const offset = target - BASE;
  let read = '';
  for (let p = offset; p < out.length && out[p] !== 0x00; p++) read += String.fromCharCode(out[p]);
  assertEqual(read, built.fixture.records[3].text + ' AND MORE',
    'the moved record holds the translation at the address its pointer now names');
});

suite.test('a record that has a header still has to keep it', async function (t) {
  /* The test that was there must not be lost for the games it was written for. */
  const built = await buildOne(true, 9);
  assert(built.log.indexOf('Self check passed') >= 0 || built.log.indexOf('Self check failed') >= 0,
    'the build ran to its self check: ' + built.log.slice(0, 200));
  const out = built.state.modifiedRom;
  if (out) {
    const at = 0x1000 + 3 * 4;
    const target = (out[at] | (out[at + 1] << 8) | (out[at + 2] << 16) | (out[at + 3] << 24)) >>> 0;
    const offset = target - BASE;
    assertEqual(out[offset], 0x01, 'the record still opens with its header byte');
    assertEqual(out[offset + 1], 0x00, 'and its second header byte');
  }
});

module.exports = { suite: suite };
