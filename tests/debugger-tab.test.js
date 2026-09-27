/* The Debugger tab: the first debugger step that runs nothing.

   A display register is not in the ROM. The code writes IO memory while the console
   runs, so the only thing a ROM can be asked is where the code decides the register,
   and the answer is two constants sitting close together: the address and the value.
   The tab reads those constants out of the loaded file and shows the register, its
   value and the flags it decodes to. No emulator, no CPU, no key handler.

   These gates pin what the panel says with a ROM loaded and without one, so a tab
   that quietly reads the wrong buffer, or one that claims registers before a file is
   there, shows up. */

'use strict';
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('debugger tab');

const DISPCNT = 0x04000000;
const BG0CNT = 0x04000008;
/* The scanner looks 0x200 bytes either side of the address constant, so the two setup
   blocks are kept more than a window apart and neither can borrow the other's value.
   The value sits right behind its address, the way a literal pool holds
   "ldr r0, =0x04000008" followed by "ldr r1, =0x1E04". */
const DISPCNT_AT = 0x10000;
const BG0CNT_AT = 0x20000;
/* DISPCNT 0x1F00: mode 0 with backgrounds 0 to 3 on. BG0CNT 0x1E04: char base 1,
   screen base 30, 32x32 tiles, 16 colours. */
const DISPCNT_VALUE = 0x1F00;
const BG0CNT_VALUE = 0x1E04;

function writeWord(rom, at, value) {
  rom[at] = value & 0xFF;
  rom[at + 1] = (value >>> 8) & 0xFF;
  rom[at + 2] = (value >>> 16) & 0xFF;
  rom[at + 3] = (value >>> 24) & 0xFF;
}

function romWithDisplaySetup() {
  const fixture = buildSyntheticRom({ records: 8 });
  writeWord(fixture.rom, DISPCNT_AT, DISPCNT);
  writeWord(fixture.rom, DISPCNT_AT + 4, DISPCNT_VALUE);
  writeWord(fixture.rom, BG0CNT_AT, BG0CNT);
  writeWord(fixture.rom, BG0CNT_AT + 4, BG0CNT_VALUE);
  return fixture;
}

function render(env) {
  const provider = env.K.ui.tabProviders.debugger;
  return provider({
    tab: { id: 'activity:debugger', kind: 'debugger', title: 'Debugger', payload: { activity: 'debugger' } },
    payload: { activity: 'debugger' },
    workbench: {}
  });
}

suite.test('the activity is a debugger tab with a provider, not a placeholder', function (t) {
  const env = loadWorkbench();
  t.assert(typeof env.K.ui.tabProviders.debugger === 'function', 'the debugger tab provider should be registered');
  const text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('Load a ROM first') >= 0, 'without a rom the tab should ask for one, got: ' + text);
  t.assert(text.indexOf('DISPCNT') < 0, 'and it should claim no register before a file is loaded');
});

suite.test('the display registers the rom names are listed with their flags', function (t) {
  const env = loadWorkbench();
  const fixture = romWithDisplaySetup();
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  const text = env.treeStrings(render(env)).join('\n');

  t.assert(text.indexOf('DISPCNT') >= 0, 'DISPCNT should be listed, got: ' + text);
  t.assert(text.indexOf('BG0CNT') >= 0, 'BG0CNT should be listed');
  t.assert(text.indexOf('0x04000000') >= 0, 'the IO address of DISPCNT should be shown');
  t.assert(text.indexOf('0x04000008') >= 0, 'the IO address of BG0CNT should be shown');
  t.assert(text.indexOf('0x1F00') >= 0, 'the DISPCNT constant should be shown');
  t.assert(text.indexOf('0x1E04') >= 0, 'the BG0CNT constant should be shown');
  t.assert(text.indexOf('mode 0') >= 0, 'DISPCNT should decode to mode 0');
  t.assert(text.indexOf('bg 0,1,2,3') >= 0, 'with backgrounds 0 to 3 enabled');
  t.assert(text.indexOf('forced blank off') >= 0, 'and the forced blank flag reported');
  /* The row has to decode the constant it chose, not just list the register: a word that
     straddles the address literal is plausible too, so the winner is pinned here. */
  t.assert(text.indexOf('priority 0 | char base 1 at 0x06004000') >= 0,
    'the BG0CNT row should decode the value constant that follows its address');
  t.assert(text.indexOf('char base 1') >= 0, 'BG0CNT should report its char base');
  t.assert(text.indexOf('screen base 30') >= 0, 'and its screen base');
  t.assert(text.indexOf('1E04') >= 0, 'the background row should repeat the constant that made it');
});

suite.test('a rom with no setup block reports no background instead of a register', function (t) {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 4 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  const text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('DISPCNT') >= 0, 'the register table is still the five known registers');
  t.assert(text.indexOf('not in this ROM') >= 0, 'and every one of them is marked as not found');
  t.assert(text.indexOf('No background control constant') >= 0, 'and no background is claimed');
});

module.exports = { suite: suite };
