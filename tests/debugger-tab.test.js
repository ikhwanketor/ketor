/* The Debugger tab: the first debugger step that runs nothing.

   A display register is not in the ROM. The code writes IO memory while the console
   runs, so the only thing a ROM can be asked is where the code decides the register,
   and the answer is two constants sitting close together: the address and the value.
   The tab reads those constants out of the loaded file and shows the register, its
   value and the flags it decodes to. No emulator, no CPU, no key handler.

   Batch 158 added the memory panel, which is the Hex Editor's reader in a second
   window: 16 bytes to a row, a row address of the form 0x000100, the patched bytes in
   the Hex Editor's changed-byte colour and the hex cursor drawn where it falls. The
   gates below pin that reader - the row's 16 values against the file byte for byte, the
   patch marker, the clamp on a negative offset, half typed offset text, the save-state
   block list, and the promise that the panel added no keyboard listener to the window.

   Batch 159 added the listing and the breakpoint list: the same bytes go to
   K.core.disassemble, an odd address is read as Thumb the ARMv4T way, and a breakpoint
   is a note on a list that is drawn on the memory row and the instruction row it falls
   in. Nothing runs, so nothing is stopped; the gates below pin the listing, the mark,
   the entry candidates and the promise that the note brought no key handler with it. */

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

/* A GBA state exactly the size core/save-state.js splits: IWRAM, EWRAM, VRAM, palette,
   OAM and IO, one after the other. The palette is given sixteen distinct colours so the
   reader takes the block sizes at their word instead of searching the whole file. */
const GBA_STATE_SIZE = 0x8000 + 0x40000 + 0x18000 + 0x400 + 0x400 + 0x400;
const PALETTE_AT = 0x8000 + 0x40000 + 0x18000;

function writeWord(rom, at, value) {
  rom[at] = value & 0xFF;
  rom[at + 1] = (value >>> 8) & 0xFF;
  rom[at + 2] = (value >>> 16) & 0xFF;
  rom[at + 3] = (value >>> 24) & 0xFF;
}

/* Two uppercase hex digits, the shape the memory panel prints a byte in. */
function hex2(v) { return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }

function romWithDisplaySetup() {
  const fixture = buildSyntheticRom({ records: 8 });
  writeWord(fixture.rom, DISPCNT_AT, DISPCNT);
  writeWord(fixture.rom, DISPCNT_AT + 4, DISPCNT_VALUE);
  writeWord(fixture.rom, BG0CNT_AT, BG0CNT);
  writeWord(fixture.rom, BG0CNT_AT + 4, BG0CNT_VALUE);
  return fixture;
}

/* A rom whose first screen of memory is not one repeated byte: 0x10..0x1F at 0x100, so a
   row that reads the wrong offset, or mixes up the byte order, cannot pass by accident.
   0x200 stays the 0xAA the fixture fills with, which is a different byte to paste over. */
function romWithBytePattern() {
  const fixture = buildSyntheticRom({ records: 8 });
  for (let i = 0; i < 16; i++) fixture.rom[0x100 + i] = 0x10 + i;
  return fixture;
}

/* A rom with a small Thumb function at 0x300, behind the fixture's own fill pattern:
   push {lr}, movs r0, #1, ldr r0, [pc, #4], bx lr. The odd pointer 0x301 is how a BX
   target would address it, and the 0xAA fill in front is the boundary the entry scan
   can see. Nothing else in the fixture holds a 0xB5xx or a 0x4770 halfword. */
function romWithThumbCode() {
  const fixture = buildSyntheticRom({ records: 8 });
  [0xB500, 0x2001, 0x4801, 0x4770].forEach(function (hw, i) {
    fixture.rom[0x300 + i * 2] = hw & 0xFF;
    fixture.rom[0x300 + i * 2 + 1] = (hw >> 8) & 0xFF;
  });
  return fixture;
}

/* Every node the tab marked with a breakpoint, in render order. */
function nodesWithBreakpoint(node, out) {
  const list = out || [];
  if (!node || typeof node !== 'object') return list;
  if (Array.isArray(node)) {
    node.forEach(function (item) { nodesWithBreakpoint(item, list); });
    return list;
  }
  if (node.props && node.props['data-breakpoint']) list.push(node);
  nodesWithBreakpoint(node.props && node.props.children, list);
  return list;
}

function gbaState() {
  const state = new Uint8Array(GBA_STATE_SIZE);
  for (let i = 0; i < 16; i++) {
    const word = (i * 0x0421 + 0x001F) & 0x7FFF;
    state[PALETTE_AT + i * 2] = word & 0xFF;
    state[PALETTE_AT + i * 2 + 1] = (word >> 8) & 0xFF;
  }
  state[0x10] = 0x5A;
  state[0x11] = 0xA5;
  return state;
}

function loadRom(fixture) {
  const env = loadWorkbench();
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  return env;
}

function render(env) {
  const provider = env.K.ui.tabProviders.debugger;
  return provider({
    tab: { id: 'activity:debugger', kind: 'debugger', title: 'Debugger', payload: { activity: 'debugger' } },
    payload: { activity: 'debugger' },
    workbench: {}
  });
}

/* Depth first search for the first node a predicate accepts. */
function findNode(node, test) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findNode(node[i], test);
      if (hit) return hit;
    }
    return null;
  }
  if (test(node)) return node;
  return findNode(node.props && node.props.children, test);
}

/* The strings a node itself shows, its children only: a tooltip is not row text. */
function childStrings(node, out) {
  const list = out || [];
  if (node === null || node === undefined || node === false || node === true) return list;
  if (typeof node === 'string' || typeof node === 'number') { list.push(String(node)); return list; }
  if (Array.isArray(node)) {
    node.forEach(function (item) { childStrings(item, list); });
    return list;
  }
  if (node.props) childStrings(node.props.children, list);
  return list;
}

function inputByTitle(env, prefix) {
  return findNode(render(env), function (n) {
    return n.type === 'input' && n.props && typeof n.props.title === 'string' && n.props.title.indexOf(prefix) === 0;
  });
}

/* The one element in the tab that takes the keyboard. */
function gridNode(env) {
  return findNode(render(env), function (n) {
    return n.props && n.props.tabIndex === 0 && typeof n.props.onKeyDown === 'function';
  });
}

function press(handler, key, target, modifier) {
  const ev = { key: key, target: target, prevented: 0 };
  ev.preventDefault = function () { ev.prevented++; };
  if (modifier === 'meta') ev.metaKey = true; else if (modifier !== 'none') ev.ctrlKey = true;
  handler(ev);
  return ev;
}

function element(tag, editable) { return { tagName: tag, isContentEditable: !!editable }; }

function diffOffsets(before, after) {
  const out = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) if ((before[i] & 0xFF) !== (after[i] & 0xFF)) out.push(i);
  return out;
}

/* The workbench with the window watched from before the first module is loaded, so the
   listeners a module installs can be named. The debugger module is left out of one run,
   which is what makes "new listener" mean something. */
function watchedLoad(loadDebugger) {
  const calls = [];
  const env = loadWorkbench({
    loadDebugger: loadDebugger,
    beforeLoad: function (win) {
      const addWindow = win.addEventListener;
      win.addEventListener = function (type) { calls.push('window:' + type); return addWindow.apply(win, arguments); };
      const addDocument = win.document.addEventListener;
      win.document.addEventListener = function (type) { calls.push('document:' + type); return addDocument.apply(win.document, arguments); };
    }
  });
  return { env: env, calls: calls };
}

function keyboardCalls(calls) {
  return calls.filter(function (c) { return /:(key|keydown|keypress|keyup)$/.test(c); });
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

suite.test('the memory panel shows 16 bytes a row from the row the hex cursor sits on', function (t) {
  const fixture = romWithBytePattern();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);

  const expected = [];
  for (let i = 0; i < 16; i++) expected.push(hex2(fixture.rom[0x100 + i]));
  /* The format the panel prints a row in: 0x plus six uppercase hex digits, two spaces,
     then the 16 byte values as two uppercase hex digits each, one space apart. */
  const line = '0x000100  ' + expected.join(' ');

  t.assertEqual(K.debugger.hexAddress(0x100), '0x000100', 'an address is 0x plus six uppercase hex digits');
  const view = K.debugger.memoryView();
  t.assertEqual(view.start, 0x100, 'the window follows the hex cursor until the offset box says otherwise');
  const row = view.rows[0];
  t.assertEqual(row.address, '0x000100', 'the first row is the row the cursor sits on');
  t.assertEqual(row.text, line, 'a row is "<address>  XX XX ...", 16 values');
  t.assertEqual(row.cells.length, 16, 'one cell per byte of the row');
  t.assertDeepEqual(row.cells.map(function (c) { return c.text; }), expected, 'the cells hold the 16 bytes of the file');

  const tree = render(env);
  const text = env.treeStrings(tree).join('\n');
  t.assert(text.indexOf('0x000100') >= 0, 'the rendered tab should name the address 0x000100, got: ' + text.slice(0, 400));
  t.assert(text.indexOf(line) >= 0, 'and carry the whole row, address and 16 bytes');
  const renderedRow = findNode(tree, function (n) { return n.props && n.props.title === line; });
  t.assert(renderedRow, 'the rendered grid should hold the row: ' + line);
  const parts = childStrings(renderedRow);
  t.assertEqual(parts.length, 17, 'a row renders its address and exactly 16 byte values');
  t.assertEqual(parts[0], '0x000100', 'the address comes first');
  t.assertDeepEqual(parts.slice(1), expected, 'and then the 16 byte values of that line, in file order');
});

suite.test('the memory byte and the offset clamp agree with the Hex Editor', function (t) {
  const fixture = romWithBytePattern();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);
  t.assertEqual(K.hex.currentByte(0x100), fixture.rom[0x100] & 0xFF,
    'the byte the panel shows is the byte the Hex Editor reads');

  K.hex.gotoOffset(-5);
  const st = K.hex.getState();
  t.assertEqual(st.cursorOffset, 0, 'a negative goto clamps to zero instead of throwing');
  t.assertEqual(st.cursorOffset >= 0, true, 'and never goes negative');
  const view = K.debugger.memoryView();
  t.assertEqual(view.start, 0, 'so the memory window opens at the first byte');
  const text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('0x000000') >= 0, 'the first row is named 0x000000, got: ' + text.slice(0, 300));
  t.assertEqual(K.debugger.memoryRows(view.source, -4, 1)[0].address, '0x000000',
    'a negative row start clamps in the row builder too');
});

suite.test('half typed offset text is kept, not committed, and never becomes NaN', function (t) {
  const fixture = romWithBytePattern();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x200);

  const box = inputByTitle(env, 'Byte offset the memory window starts at');
  t.assert(box, 'the memory panel should offer an Offset box');
  box.props.onChange({ target: { value: '0x200' } });
  t.assertEqual(K.debugger.getMemory().offset, 0x200, 'a full value is committed');
  ['0x', '', 'zz', '0xzz', '   '].forEach(function (typed) {
    box.props.onChange({ target: { value: typed } });
    t.assertEqual(K.debugger.getMemory().offsetText, typed, 'the box keeps exactly what was typed: ' + JSON.stringify(typed));
    t.assertEqual(K.debugger.parseOffsetText(typed), null, JSON.stringify(typed) + ' is not a number yet');
    const text = env.treeStrings(render(env)).join('\n');
    t.assert(text.indexOf('NaN') < 0, JSON.stringify(typed) + ' must not put NaN on screen');
  });
  t.assertEqual(K.debugger.getMemory().offset, 0x200, 'text that does not parse leaves the committed offset alone');

  box.props.onChange({ target: { value: '0x300' } });
  t.assertEqual(K.debugger.getMemory().offset, 0x300, 'text that parses is committed');
  const committed = env.treeStrings(render(env)).join('\n');
  t.assert(committed.indexOf('0x000300') >= 0, 'and the window moves there');

  /* Past the end of the file the offset stops at the last byte: the window never points
     outside the buffer it reads. */
  box.props.onChange({ target: { value: '0xFFFFFF00' } });
  t.assertEqual(K.debugger.getMemory().offset, fixture.rom.length - 1, 'a huge offset is clamped to the last byte');

  const rowsBox = inputByTitle(env, 'Rows of 16 bytes on screen');
  t.assert(rowsBox, 'the panel should offer a Rows box');
  rowsBox.props.onChange({ target: { value: 'zz' } });
  t.assertEqual(K.debugger.getMemory().rows, 8, 'a row count that does not parse keeps the last one');
  rowsBox.props.onChange({ target: { value: '0' } });
  t.assertEqual(K.debugger.getMemory().rows, 8, 'zero rows is not a row count');
  rowsBox.props.onChange({ target: { value: '999' } });
  t.assertEqual(K.debugger.getMemory().rows, 64, 'a huge row count is clamped to the range the box promises');
  rowsBox.props.onChange({ target: { value: '4' } });
  t.assertEqual(K.debugger.getMemory().rows, 4, 'and a valid one is committed');
  const after = env.treeStrings(render(env)).join('\n');
  t.assert(after.indexOf('NaN') < 0, 'the rows box put no NaN on screen either');
});

suite.test('a patched byte is marked and keeps the value in the file for the tooltip', function (t) {
  const fixture = romWithBytePattern();
  const env = loadRom(fixture);
  const K = env.K;
  const rom = fixture.rom;
  K.hex.gotoOffset(0x100);
  const raw = rom[0x102] & 0xFF;
  t.assertEqual(K.hex.setByte(0x102, 0x99), true, 'the hex patch layer should take the byte');

  const view = K.debugger.memoryView();
  const cell = view.rows[0].cells[2];
  t.assertEqual(cell.offset, 0x102, 'the third cell is the patched byte');
  t.assertEqual(cell.text, '99', 'the panel shows the patched value');
  t.assertEqual(cell.patched, true, 'and marks the cell as patched');
  t.assertEqual(cell.raw, raw, 'while the value in the file is kept');
  t.assert(cell.title.indexOf('patched, was ' + hex2(raw)) >= 0, 'the tooltip says what it was, got: ' + cell.title);
  t.assertEqual(view.rows[0].cells[1].patched, false, 'its neighbours are not marked');
  t.assertEqual(rom[0x102] & 0xFF, raw, 'the loaded file is untouched');
  t.assertEqual(K.hex.currentByte(0x102), 0x99, 'and the hex reader agrees with the cell');
  const text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('1 patched byte(s) in view') >= 0, 'the panel counts the patches in view, got: ' + text.slice(0, 400));
});

suite.test('the memory grid keeps its keys: no global keyboard listener is added', function (t) {
  const baseline = watchedLoad(false);
  const loaded = watchedLoad(true);

  t.assertEqual(typeof baseline.env.K.debugger, 'undefined', 'the baseline run should leave the debugger module out');
  t.assert(loaded.env.K.debugger, 'the loaded run should have it');
  t.assertDeepEqual(keyboardCalls(baseline.calls), [],
    'no module should install a keyboard listener on the window, got: ' + JSON.stringify(baseline.calls));
  t.assertDeepEqual(keyboardCalls(loaded.calls), keyboardCalls(baseline.calls),
    'and the debugger tab must not add one either');
  const stateCalls = loaded.calls.filter(function (c) { return c === 'window:ketor:save-state-loaded'; });
  t.assertEqual(stateCalls.length, 1, 'the debugger module registers the save state event once');
  t.assertDeepEqual(loaded.calls.filter(function (c) { return c !== 'window:ketor:save-state-loaded'; }), baseline.calls,
    'and adds nothing else: the two runs agree on every other listener, got: ' + JSON.stringify(loaded.calls));
});

suite.test('Ctrl+C/V and the page keys live on the grid and step aside for a field', function (t) {
  const fixture = romWithBytePattern();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);
  /* A row that differs from the file it sits on: patch 0x100..0x10F to 0xE0..0xEF, so the
     copied text can only come from the patch layer, and a paste that writes the file's own
     0x10..0x1F bytes instead shows up in the diff. */
  for (let i = 0; i < 16; i++) t.assertEqual(K.hex.setByte(0x100 + i, 0xE0 + i), true, 'patch byte ' + i + ' of the copied row');

  const grid = gridNode(env);
  t.assert(grid, 'the memory grid should be focusable (tabIndex 0)');
  const handler = grid.props.onKeyDown;

  ['INPUT', 'TEXTAREA', 'SELECT'].forEach(function (tag) {
    const copy = press(handler, 'c', element(tag));
    t.assertEqual(copy.prevented, 0, 'Ctrl+C in a ' + tag + ' belongs to the field');
    const paste = press(handler, 'v', element(tag));
    t.assertEqual(paste.prevented, 0, 'Ctrl+V in a ' + tag + ' belongs to the field');
  });
  const rich = press(handler, 'c', element('DIV', true));
  t.assertEqual(rich.prevented, 0, 'and Ctrl+C in a contenteditable surface stays there');
  t.assertEqual(K.debugger.getMemory().clipboardText, '', 'no field keystroke reached the grid clipboard');
  t.assertEqual(K.hex.currentByte(0x200), 0xAA, 'and no field keystroke pasted a byte');

  const copy = press(handler, 'c', element('DIV'));
  t.assertEqual(copy.prevented, 1, 'Ctrl+C on the grid is the grid\'s');
  const clip = K.debugger.getMemory().clipboardText;
  t.assertEqual(clip, K.debugger.memoryText(), 'the copy holds the visible rows as hex text');
  t.assertEqual(clip.split('\n')[0], 'E0 E1 E2 E3 E4 E5 E6 E7 E8 E9 EA EB EC ED EE EF',
    'one row to a line, one space between two digit values, read through the patch layer');
  t.assert(clip.indexOf('0x') < 0, 'the text pastes back byte for byte, so it carries no address');

  K.debugger.typeMemoryOffset('0x200');
  const beforePaste = K.hex.getPatchedBytes();
  const paste = press(handler, 'v', element('DIV'));
  t.assertEqual(paste.prevented, 1, 'Ctrl+V on the grid is the grid\'s');
  const pasted = [];
  for (let i = 0; i < 16; i++) pasted.push(0x200 + i);
  t.assertDeepEqual(diffOffsets(beforePaste, K.hex.getPatchedBytes()), pasted,
    'Ctrl+V wrote the copied row at the window and not one byte elsewhere');
  const touched = [];
  for (let i = 0; i < 16; i++) touched.push(0x100 + i);
  for (let i = 0; i < 16; i++) touched.push(0x200 + i);
  t.assertDeepEqual(diffOffsets(fixture.rom, K.hex.getPatchedBytes()), touched,
    'the file now differs from the rom at the copied row and the pasted row only');
  for (let i = 0; i < 16; i++) {
    t.assertEqual(K.hex.currentByte(0x200 + i), 0xE0 + i, 'byte ' + i + ' of the pasted row should hold the copied value');
  }

  K.debugger.typeMemoryOffset('0x200');
  t.assertEqual(press(handler, 'PageDown', element('DIV'), 'none').prevented, 1, 'PageDown belongs to the grid');
  t.assertEqual(K.debugger.memoryView().start, 0x200 + 8 * 16, 'PageDown moves one page of the rows on screen');
  t.assertEqual(press(handler, 'ArrowDown', element('DIV'), 'none').prevented, 1, 'ArrowDown too');
  t.assertEqual(K.debugger.memoryView().start, 0x200 + 9 * 16, 'and moves a row at a time');
  t.assertEqual(press(handler, 'Home', element('DIV'), 'none').prevented, 1, 'Home belongs to the grid');
  t.assertEqual(K.debugger.memoryView().start, 0, 'and goes back to the first byte');
  const inField = press(handler, 'ArrowDown', element('INPUT'), 'none');
  t.assertEqual(inField.prevented, 0, 'an arrow key in a field stays in the field');
  t.assertEqual(K.debugger.memoryView().start, 0, 'and does not move the memory window');
});

suite.test('a save state offers its RAM blocks and stays read only', function (t) {
  const env = loadWorkbench();
  const K = env.K;
  const state = gbaState();

  const info = K.debugger.setSaveState({ data: state, name: 'synthetic.state' });
  t.assert(info, 'a GBA state should surrender its memory blocks');
  t.assertEqual(info.size, GBA_STATE_SIZE, 'the reader reports the state it read');
  t.assertDeepEqual(K.debugger.saveStateBlocks().map(function (b) { return b.id; }),
    ['iwram', 'ewram', 'vram', 'palette', 'oam', 'io'],
    'the six GBA blocks are offered, in the order the state writes them');

  K.debugger.pickMemoryBlock('iwram');
  const view = K.debugger.memoryView();
  t.assertEqual(view.source.kind, 'state', 'the window reads the block, not the rom');
  t.assertEqual(view.source.bytes.length, 0x8000, 'IWRAM is 32 KB');
  t.assertEqual(view.rows[0].cells.length, 16, 'a row of a block is 16 bytes wide too');
  t.assertEqual(view.rows[0].cells[0].text, '00', 'the block starts empty');
  t.assertEqual(view.rows[1].cells[0].text, '5A', 'the byte put at 0x10 is the first cell of the second row');
  t.assertEqual(view.rows[1].cells[1].text, 'A5', 'with its neighbour');

  const tree = render(env);
  const text = env.treeStrings(tree).join('\n');
  t.assert(text.indexOf('IWRAM (32 KB)') >= 0, 'the picker names the block, got: ' + text.slice(0, 400));
  t.assert(text.indexOf('synthetic.state') >= 0, 'and the panel names the state it came from');
  t.assert(text.indexOf('not drawn on a state block') >= 0, 'the hex cursor belongs to the rom and is not drawn here');

  K.debugger.pickMemoryBlock('ewram');
  t.assertEqual(K.debugger.memoryView().source.bytes.length, 0x40000, 'EWRAM is 256 KB');

  t.assertEqual(K.debugger.pasteMemoryText('00 01 02', 0), 0, 'a state block is not the loaded file');
  t.assert(K.debugger.getMemory().status.indexOf('read only') >= 0,
    'so the paste is refused with a reason, got: ' + K.debugger.getMemory().status);
  t.assertEqual(state[0], 0, 'and no byte of the state moved');

  K.debugger.pickMemoryBlock('rom');
  t.assertEqual(K.debugger.memoryView(), null, 'with no rom loaded the rom source is empty');
  t.assertEqual(K.debugger.clearSaveState() === undefined, true, 'the state can be dropped');
  t.assertDeepEqual(K.debugger.saveStateBlocks(), [], 'and the block list goes with it');
});

suite.test('with no save state the picker is skipped, and one it cannot read is skipped too', function (t) {
  const env = loadWorkbench();
  const K = env.K;
  t.assertDeepEqual(K.debugger.saveStateBlocks(), [], 'no state, no blocks');
  t.assertEqual(K.debugger.setSaveState(null), null, 'handing in nothing is refused');

  const fixture = romWithBytePattern();
  K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  let text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('no save state loaded') >= 0, 'the panel says the ROM is all it has');
  t.assert(text.indexOf('IWRAM') < 0, 'and no block is offered');

  t.assertEqual(K.debugger.setSaveState(new Uint8Array(32), 'tiny.state'), null,
    'a state too short to hold the blocks is refused');
  t.assert(K.debugger.getMemory().status.indexOf('no GBA memory block') >= 0,
    'with a reason, got: ' + K.debugger.getMemory().status);
  t.assertDeepEqual(K.debugger.saveStateBlocks(), [], 'and nothing is offered');
  text = env.treeStrings(render(env)).join('\n');
  t.assert(text.indexOf('0x000000') >= 0, 'the ROM window still renders');
});

suite.test('the disassembly panel lists the instructions the bytes would be', function (t) {
  const fixture = romWithThumbCode();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);

  t.assertEqual(K.debugger.disassemblerReady(), true, 'the disassembler should be loaded in this build');
  K.debugger.typeDisasmOffset('0x301');
  const view = K.debugger.disassembleView();
  t.assertEqual(view.thumb, true, 'an odd address is a Thumb pointer, so the listing is Thumb');
  t.assertEqual(view.start, 0x300, 'and it starts at the halfword the pointer names');
  t.assertDeepEqual(view.rows.slice(0, 4).map(function (r) { return r.mnemonic; }),
    ['push', 'movs', 'ldr', 'bx'], 'the four instructions written into the fixture are the four it decodes');
  t.assertEqual(view.rows[0].bytes.map(hex2).join(' '), '00 B5', 'a Thumb row carries its two bytes');

  const tree = render(env);
  const text = env.treeStrings(tree).join('\n');
  t.assert(text.indexOf('Disassembly') >= 0, 'the tab should carry a Disassembly panel, got: ' + text.slice(0, 300));
  t.assert(text.indexOf('movs') >= 0, 'and name a real mnemonic, got: ' + text.slice(0, 800));
  t.assert(text.indexOf('bx lr') >= 0, 'such as the return the function ends with');
  t.assert(text.indexOf('0x000300') >= 0, 'with the address of the first row');
  t.assert(text.indexOf('00 B5') >= 0, 'and the bytes it read, in file order, got: ' + text.slice(0, 800));
  t.assert(text.indexOf('nothing runs: these are bytes in the file') >= 0,
    'the panel should say that nothing runs here');

  /* One instruction to a row: address, bytes, then the instruction they would be. */
  const row = findNode(tree, function (n) { return n.props && n.props.title === '0x000300  push {lr}'; });
  t.assert(row, 'the first row should be rendered with its address and its text');
  t.assertDeepEqual(childStrings(row), ['0x000300', '00 B5', 'push {lr}'],
    'the row is the address, the bytes and the instruction');

  /* The other half of the same rule: an even address is read as ARM. */
  K.debugger.typeDisasmOffset('0x300');
  t.assertEqual(K.debugger.disassembleView().thumb, false, 'an even address is read as ARM');
  const armText = env.treeStrings(render(env)).join('\n');
  t.assert(armText.indexOf('Disassembly') >= 0, 'the panel is still there');
  t.assert(armText.indexOf('movs') < 0, 'and the Thumb mnemonics are gone');
});

suite.test('a breakpoint is a note on a list, drawn where its address falls', function (t) {
  const fixture = romWithThumbCode();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);
  K.debugger.typeDisasmOffset('0x301');

  /* Two notes: a read on a byte of the memory window, an exec inside the listing. */
  K.debugger.typeBreakpointAddress('0x100');
  K.debugger.setBreakpointType('read');
  t.assertDeepEqual(K.debugger.addBreakpointFromBox(), { address: 0x100, type: 'read' },
    'the address box and the type picker add the note they describe');
  K.debugger.typeBreakpointAddress('0x302');
  K.debugger.setBreakpointType('exec');
  t.assertEqual(K.debugger.addBreakpointFromBox().type, 'exec', 'and a note of another kind');
  t.assertDeepEqual(K.debugger.breakpoints(), [{ address: 0x100, type: 'read' }, { address: 0x302, type: 'exec' }],
    'the list holds both, in address order');
  t.assertEqual(K.debugger.breakpointsInRange(0x300, 0x304).join(','), 'exec',
    'the range one instruction covers finds its note');
  t.assertEqual(K.debugger.breakpointTypesAt(0x100).join(','), 'read', 'and an address finds its own kinds');

  const tree = render(env);
  const text = env.treeStrings(tree).join('\n');
  t.assert(text.indexOf('Breakpoints') >= 0, 'the tab should offer the breakpoint list');
  t.assert(text.indexOf('0x000302') >= 0, 'and name the address that was added');
  t.assert(text.indexOf('not a trap') >= 0, 'and say that a note here stops nothing');
  t.assert(text.indexOf('1 row(s) marked with a breakpoint') >= 0,
    'the memory panel counts the row it marked, got: ' + text.slice(0, 800));
  t.assert(text.indexOf('1 row(s) with a breakpoint') >= 0, 'and the listing counts its own');

  const marks = nodesWithBreakpoint(tree);
  t.assertDeepEqual(marks.map(function (n) { return n.props['data-breakpoint'] + '@' + n.props.title.slice(0, 8); }),
    ['read@0x000100', 'exec@0x000302'], 'the memory row and the instruction row carry the marks');

  /* The Add button is the same path, and a note already on the list is not added twice. */
  const addButton = findNode(tree, function (n) { return n.type === 'button' && childStrings(n).indexOf('Add') >= 0; });
  t.assert(addButton, 'the panel should offer an Add button');
  addButton.props.onClick();
  t.assertEqual(K.debugger.breakpoints().length, 2, 'adding the address already listed changes nothing');

  /* Typing that is not an address yet adds nothing, and no NaN reaches the screen. */
  K.debugger.typeBreakpointAddress('zz');
  t.assertEqual(K.debugger.addBreakpointFromBox(), null, 'text that is not a number is refused');
  t.assertEqual(K.debugger.breakpoints().length, 2, 'and nothing was added');
  t.assert(K.debugger.getDisasm().status.indexOf('not an address yet') >= 0,
    'with a reason, got: ' + K.debugger.getDisasm().status);
  t.assert(env.treeStrings(render(env)).join('\n').indexOf('NaN') < 0, 'and no NaN reaches the screen');

  t.assertEqual(K.debugger.removeBreakpoint(0x100, 'read'), 1, 'the read note can be removed');
  t.assertEqual(K.debugger.breakpoints().length, 1, 'and the exec note stays');
  t.assertDeepEqual(nodesWithBreakpoint(render(env)).map(function (n) { return n.props['data-breakpoint']; }), ['exec'],
    'the memory row is unmarked again while the instruction row keeps its mark');
  t.assertEqual(K.debugger.clearBreakpoints(), 1, 'Clear empties what is left');
  t.assertDeepEqual(K.debugger.breakpoints(), [], 'so the list is empty');
  t.assertDeepEqual(nodesWithBreakpoint(render(env)), [], 'and no row is marked');
});

suite.test('a thumb entry candidate is offered with the evidence that found it', function (t) {
  const fixture = romWithThumbCode();
  const env = loadRom(fixture);
  const K = env.K;
  K.hex.gotoOffset(0x100);
  K.debugger.typeDisasmOffset('0x100');

  const entries = K.debugger.disassembleView().entries;
  t.assertEqual(entries.length, 1, 'the fixture holds one prologue behind a fill pattern, got: ' + JSON.stringify(entries));
  t.assertEqual(entries[0].at, 0x300, 'at the offset the function sits at');
  t.assertEqual(entries[0].kind, 'push-lr', 'found by the push that saves lr');
  t.assertEqual(entries[0].evidence, 'padding in front of it', 'with the fill pattern that made it a boundary');
  t.assertEqual(entries[0].text, 'push {lr}', 'and it carries the halfword it was found from');

  const tree = render(env);
  const text = env.treeStrings(tree).join('\n');
  t.assert(text.indexOf('Thumb entry candidates') >= 0, 'the panel lists the candidates');
  t.assert(text.indexOf('push-lr') >= 0, 'with the shape that found them');
  const button = findNode(tree, function (n) { return n.type === 'button' && childStrings(n).indexOf('Disassemble') >= 0; });
  t.assert(button, 'each candidate offers to be disassembled');
  button.props.onClick();
  t.assertEqual(K.debugger.getDisasm().offset, 0x301, 'the button hands over the odd pointer a BX target would carry');
  t.assertEqual(K.debugger.disassembleView().thumb, true, 'so the listing is Thumb');
  t.assertEqual(K.debugger.disassembleView().start, 0x300, 'and it starts at the prologue');
  t.assert(env.treeStrings(render(env)).join('\n').indexOf('push {lr}') >= 0, 'which is now on screen');
});

module.exports = { suite: suite };
