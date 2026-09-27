/* The ARM/Thumb disassembler: the bytes of a cartridge read as the instructions they
   would be if the CPU reached them.

   Nothing here runs a program. A GBA holds two instruction sets and the ARM7TDMI picks
   one from the low bit of a branch target, so the same bytes are two different listings
   depending on the address they are read at. The gates below pin that convention, the
   handful of encodings the Debugger tab promises to name, and the promise that come
   back as .word rather than as a mnemonic nobody checked. The suite is bare: the module
   is run in a vm with nothing but Ketor and console, the way font-map.test.js loads its
   own file. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSuite, assert, assertEqual, assertDeepEqual } = require('./helpers/tiny-test');
const suite = createSuite('arm disasm');

const win = { Ketor: {}, console: console };
win.window = win;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'core', 'arm-disasm.js'), 'utf8'), win, { filename: 'arm-disasm.js' });
const D = win.Ketor.core;

/* Little endian code, the way a cartridge stores it. */
function code16() {
  const out = [];
  for (let i = 0; i < arguments.length; i++) { const hw = arguments[i]; out.push(hw & 0xFF, (hw >> 8) & 0xFF); }
  return Uint8Array.from(out);
}

function code32() {
  const out = [];
  for (let i = 0; i < arguments.length; i++) {
    const w = arguments[i];
    out.push(w & 0xFF, (w >>> 8) & 0xFF, (w >>> 16) & 0xFF, (w >>> 24) & 0xFF);
  }
  return Uint8Array.from(out);
}

function one(bytes, options) {
  const rows = D.disassemble(bytes, Object.assign({ at: 0, count: 1 }, options || {}));
  assert(rows.length === 1, 'one instruction was asked for and ' + rows.length + ' came back');
  return rows[0];
}

function thumb(hw, extra) { return one(code16.apply(null, [hw].concat(extra || [])), { at: 0, thumb: true }); }
function arm(word) { return one(code32(word), { at: 0, thumb: false }); }

suite.test('a thumb instruction decodes to the mnemonic it is', function (t) {
  const movs = thumb(0x2000);
  t.assertEqual(movs.mnemonic, 'movs', '0x2000 is movs');
  t.assert(movs.text.indexOf('movs') === 0, 'and the text says so, got: ' + movs.text);
  t.assert(movs.text.indexOf('#0x0') >= 0, 'with the immediate it carries, got: ' + movs.text);

  const bx = thumb(0x4770);
  t.assertEqual(bx.mnemonic, 'bx', '0x4770 is bx');
  t.assertEqual(bx.text, 'bx lr', 'and it returns through lr');

  const nop = thumb(0x46C0);
  t.assertEqual(nop.mnemonic, 'nop', '0x46C0 is the nop every assembler emits');
  t.assertEqual(nop.text, 'nop', 'and it carries no operand');

  const ldr = thumb(0x4800);
  t.assertEqual(ldr.mnemonic, 'ldr', '0x4800 loads a literal through the pc');
  t.assertEqual(ldr.text, 'ldr r0, [pc, #0x0]', 'and names the register and the offset, got: ' + ldr.text);
  /* The base is the instruction address plus four with bit 1 cleared, so at 0 the
     literal sits at 4. */
  t.assertEqual(ldr.target, 4, 'the address it reads is reported with it');

  /* Format 2 (register and three bit immediate) and format 3 (eight bit immediate),
     the two ways thumb spells add and subtract. */
  t.assertEqual(thumb(0x1C08).mnemonic, 'adds', '0x1C08 is an add of two registers');
  t.assertEqual(thumb(0x1A08).mnemonic, 'subs', '0x1A08 is a subtract of two registers');
  t.assertEqual(thumb(0x1C08).text, 'adds r0, r1, #0x0', 'and writes the destination, the source and the third operand');
  t.assertEqual(thumb(0x3001).text, 'adds r0, #0x1', '0x3001 adds an immediate');
  t.assertEqual(thumb(0x3801).text, 'subs r0, #0x1', 'and 0x3801 subtracts one');
});

suite.test('a thumb branch to itself is reported as landing on itself', function (t) {
  const row = thumb(0xE7FE);
  t.assertEqual(row.mnemonic, 'b', '0xE7FE is an unconditional branch');
  t.assertEqual(row.target, 0, 'whose target is the instruction it already sits on');
  t.assert(row.text.indexOf('(self)') >= 0, 'the text says it is a self branch, got: ' + row.text);
  t.assert(row.text.indexOf('.+0x0') >= 0, 'with no distance to travel, got: ' + row.text);

  /* The same reading one instruction further on: the offset is relative to the
     instruction address plus four, not to the branch target arithmetic. */
  const rows = D.disassemble(code16(0xE7FE), { at: 0, thumb: true, count: 1 });
  t.assertEqual(rows[0].target, 0, 'a self branch at 0 aims at 0');
  const forward = D.disassemble(code16(0x46C0, 0xE001), { at: 0, thumb: true, count: 2 });
  t.assertEqual(forward[1].target, 8, 'a branch at 2 aims four bytes plus its offset past itself');
});

suite.test('an arm instruction decodes to the mnemonic it is', function (t) {
  const push = arm(0xE92D4800);
  t.assertEqual(push.mnemonic, 'push', '0xE92D4800 is the frame push');
  t.assert(push.text.indexOf('fp') >= 0, 'the list names r11 the way a frame does, got: ' + push.text);
  t.assert(push.text.indexOf('lr') >= 0, 'and it saves the return address, got: ' + push.text);
  t.assertEqual(push.text, 'push {fp, lr}', 'as the pair a function prologue writes');

  const bx = arm(0xE12FFF1E);
  t.assertEqual(bx.mnemonic, 'bx', '0xE12FFF1E is bx');
  t.assertEqual(bx.text, 'bx lr', 'and it returns through lr');

  const mov = arm(0xE3A00001);
  t.assertEqual(mov.mnemonic, 'mov', '0xE3A00001 is a mov');
  t.assertEqual(mov.text, 'mov r0, #0x1', 'of an immediate into r0');
  t.assertEqual(arm(0xE3B00001).mnemonic, 'movs', 'and the flag writing form is movs');

  const nop = arm(0xE1A00000);
  t.assertEqual(nop.mnemonic, 'nop', '0xE1A00000 is the arm nop');
  t.assertEqual(nop.text, 'nop', 'and it says nothing else');

  /* Branches, both forms, with the eight byte pipeline offset the CPU applies. */
  t.assertEqual(arm(0xEA000000).text, 'b .+0x8', 'a branch forward lands eight bytes on');
  t.assertEqual(arm(0xEAFFFFFE).text, 'b .+0x0 (self)', 'and the self branch says so');
  t.assertEqual(arm(0xEB000000).mnemonic, 'bl', '0xEB000000 is the branch with link');
  t.assertEqual(arm(0xEAFFFFFE).target, 0, 'the self branch aims at itself in arm too');
});

suite.test('a pushed frame lists its registers, a popped one names the pc', function (t) {
  t.assertEqual(thumb(0xB500).text, 'push {lr}', 'a bare push saves lr');
  t.assertEqual(thumb(0xB510).text, 'push {r4, lr}', 'and a frame adds the registers it uses');
  t.assertEqual(thumb(0xB5F0).text, 'push {r4, r5, r6, r7, lr}', 'listed in register order');
  t.assertEqual(thumb(0xBD00).text, 'pop {pc}', 'a pop returns through the pc');
  t.assertEqual(thumb(0xBDF0).text, 'pop {r4, r5, r6, r7, pc}', 'with the same list');
  t.assertEqual(arm(0xE8BD8000).text, 'pop {pc}', 'and arm spells the two the same way');
});

suite.test('every row carries its address, bytes, size and mnemonic, and the step is the width', function (t) {
  const thumbCode = new Uint8Array(0x110);
  thumbCode.set(code16(0x2000, 0x4770, 0xB500), 0x100);
  const thumbRows = D.disassemble(thumbCode, { at: 0x100, thumb: true, count: 3 });
  t.assertEqual(thumbRows.length, 3, 'three thumb instructions were asked for');
  thumbRows.forEach(function (row, i) {
    t.assertEqual(row.at, 0x100 + i * 2, 'row ' + i + ' sits two bytes past the one before');
    t.assertEqual(row.size, 2, 'a thumb instruction is two bytes wide');
    t.assertEqual(row.bytes.length, 2, 'and its bytes are two values');
    t.assertEqual(typeof row.mnemonic, 'string', 'with a mnemonic');
    t.assertEqual(typeof row.text, 'string', 'and a text');
  });
  t.assertDeepEqual(thumbRows[0].bytes, [0x00, 0x20], 'the bytes are the little endian halfword');
  t.assertDeepEqual(thumbRows[2].bytes, [0x00, 0xB5], 'for every row, not only the first');

  const armCode = new Uint8Array(0x208);
  armCode.set(code32(0xE92D4800, 0xE1A00000), 0x200);
  const armRows = D.disassemble(armCode, { at: 0x200, thumb: false, count: 2 });
  t.assertEqual(armRows.length, 2, 'two arm instructions were asked for');
  armRows.forEach(function (row, i) {
    t.assertEqual(row.at, 0x200 + i * 4, 'row ' + i + ' sits four bytes past the one before');
    t.assertEqual(row.size, 4, 'an arm instruction is four bytes wide');
    t.assertEqual(row.bytes.length, 4, 'and its bytes are four values');
    t.assertEqual(typeof row.mnemonic, 'string', 'with a mnemonic');
  });
  t.assertDeepEqual(armRows[0].bytes, [0x00, 0x48, 0x2D, 0xE9], 'the bytes are the little endian word');
});

suite.test('the low bit of an address is what selects thumb', function (t) {
  t.assertEqual(D.isThumbAddress(0), false, 'an even offset is arm');
  t.assertEqual(D.isThumbAddress(2), false, 'and so is every even one');
  t.assertEqual(D.isThumbAddress(1), true, 'an odd offset is thumb');
  t.assertEqual(D.isThumbAddress(0x08000001), true, 'a thumb pointer keeps its low bit');
  t.assertEqual(D.isThumbAddress(0x08000000), false, 'and an arm pointer has none');
  t.assertEqual(D.isThumbAddress(undefined), false, 'no address is not thumb');
  t.assertEqual(D.isThumbAddress(NaN), false, 'and neither is a value that is not a number');

  /* The odd bit says which set to read; the listing starts at the halfword behind it. */
  const thumbCode = new Uint8Array(0x1004);
  thumbCode.set(code16(0x2000, 0x4770), 0x1000);
  const rows = D.disassemble(thumbCode, { at: 0x1001, count: 2 });
  t.assertEqual(rows.length, 2, 'an odd offset still disassembles');
  t.assertEqual(rows[0].at, 0x1000, 'from the even address it points at');
  t.assertEqual(rows[0].mnemonic, 'movs', 'and the bytes are read as thumb');
  t.assertEqual(rows[1].at, 0x1002, 'the next row steps by two');

  /* An explicit flag wins over the bit, so a caller with a symbol table is not stuck. */
  const armCode = new Uint8Array(0x1004);
  armCode.set(code32(0xE1A00000), 0x1000);
  const armRows = D.disassemble(armCode, { at: 0x1001, thumb: false, count: 1 });
  t.assertEqual(armRows[0].at, 0x1000, 'an arm read moves back to the word boundary');
  t.assertEqual(armRows[0].size, 4, 'and reads four bytes');
});

suite.test('zero, one and a thousand instructions are all answered without throwing', function (t) {
  const tiny = code32(0xE1A00000);
  t.assertEqual(D.disassemble(tiny, { count: 0 }).length, 0, 'zero instructions is an empty listing');
  t.assertEqual(D.disassemble(tiny, { count: 1 }).length, 1, 'one is one');
  /* The listing stops at the end of the buffer instead of inventing bytes. */
  t.assertEqual(D.disassemble(tiny, { count: 1000 }).length, 1, 'a thousand past four bytes is one row');

  const many = new Uint8Array(0x20000);
  t.assertEqual(D.disassemble(many, { at: 0, thumb: true, count: 1000 }).length, 1000,
    'and a thousand inside a long buffer is a thousand rows');
  t.assertEqual(D.disassemble(many, { at: 0, thumb: true, count: 1e9 }).length <= 0x20000 / 2, true,
    'a caller asking for more than the buffer holds is stopped by the buffer');

  t.assertEqual(D.disassemble(null, { count: 4 }).length, 0, 'no buffer is an empty listing');
  t.assertEqual(D.disassemble(new Uint8Array(0), { count: 4 }).length, 0, 'and so is an empty one');
  t.assertEqual(D.disassemble(undefined, { at: -20, count: 4 }).length, 0, 'a negative start clamps instead of throwing');
  t.assertEqual(D.disassemble(tiny, { count: -5 }).length, 0, 'and so does a negative count');
  t.assertEqual(D.disassemble(tiny, {}).length, 1, 'no count at all still returns a listing');
});

suite.test('a filler byte becomes a word, never an invented mnemonic', function (t) {
  const filler = new Uint8Array(64);
  filler.fill(0xFF);
  const thumbRows = D.disassemble(filler, { at: 0, thumb: true, count: 32 });
  t.assertEqual(thumbRows.length, 32, 'the listing covers the filler');
  thumbRows.forEach(function (row) {
    t.assertEqual(row.mnemonic, '.word', '0xFFFF is not an instruction this decoder names');
    t.assert(/^\.word 0x[0-9A-F]{4}$/.test(row.text), 'and it is printed with its raw value, got: ' + row.text);
  });
  const armRows = D.disassemble(filler, { at: 0, thumb: false, count: 16 });
  armRows.forEach(function (row) {
    t.assertEqual(row.mnemonic, '.word', '0xFFFFFFFF carries the never condition and is data');
    t.assert(/^\.word 0x[0-9A-F]{8}$/.test(row.text), 'printed as a whole word, got: ' + row.text);
  });
  /* Thumb BL is two halfwords and half of it is not an instruction, so the prefix is
     left as data rather than shown as a branch that would not run. */
  t.assertEqual(thumb(0xF000).mnemonic, '.word', 'a thumb bl prefix on its own is data');
  t.assertEqual(thumb(0xDF00).mnemonic, 'swi', 'while the software interrupt is named');
});

suite.test('random bytes decode to rows without ever throwing', function (t) {
  /* A fixed generator, so a failure can be reproduced: the point is that no byte
     pattern reaches a branch of the decoder that throws, not that the draw is random. */
  let seed = 0x12345678;
  function next() {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    return (seed >>> 16) & 0xFF;
  }
  const noise = new Uint8Array(512);
  for (let i = 0; i < noise.length; i++) noise[i] = next();

  const sets = [{ thumb: true, size: 2 }, { thumb: false, size: 4 }];
  sets.forEach(function (set) {
    const rows = D.disassemble(noise, { at: 0, thumb: set.thumb, count: 100 });
    t.assertEqual(rows.length, 100, 'the listing is as long as it was asked for');
    rows.forEach(function (row) {
      t.assertEqual(row.bytes.length, set.size, 'every row carries its bytes');
      t.assertEqual(row.size, set.size, 'and its width');
      t.assertEqual(typeof row.mnemonic === 'string' && row.mnemonic.length > 0, true, 'and a mnemonic');
      t.assert(row.text.indexOf('NaN') < 0 && row.text.indexOf('undefined') < 0,
        'no row prints a value the decoder failed to work out, got: ' + row.text);
    });
  });
});

suite.test('a thumb entry point is a prologue or a return behind padding', function (t) {
  const bytes = new Uint8Array(24);
  bytes.fill(0xAA, 0, 8);                       /* a text record, or an alignment fill */
  bytes.set(code16(0xB510), 8);                 /* push {r4, lr}, a function that returns */
  bytes.set(code16(0x2000), 10);
  bytes.set(code16(0x4770), 12);                /* bx lr in the middle of the function: not an entry */
  bytes.set(code16(0x0000), 14);                /* padding */
  bytes.set(code16(0x4770), 16);                /* a stub that returns at once */

  const found = D.thumbEntryPoints(bytes);
  t.assertDeepEqual(found.map(function (e) { return e.at; }), [8, 16],
    'the prologue behind the fill and the stub behind the padding are the two candidates, got: ' + JSON.stringify(found));
  t.assertDeepEqual(found.map(function (e) { return e.kind; }), ['push-lr', 'bx-lr'], 'each with the shape that found it');
  t.assert(found[0].text.indexOf('push') === 0, 'the candidate carries the halfword it was found from, got: ' + found[0].text);
  t.assertEqual(found[0].thumb, true, 'a candidate is a thumb address');

  const limited = D.thumbEntryPoints(bytes, { limit: 1 });
  t.assertEqual(limited.length, 1, 'the caller can ask for fewer candidates');
  t.assertEqual(limited[0].at, 8, 'and gets the first one');

  t.assertDeepEqual(D.thumbEntryPoints(new Uint8Array(0)), [], 'an empty buffer has none');
  t.assertDeepEqual(D.thumbEntryPoints(null), [], 'and neither has no buffer at all');
});

suite.test('a candidate is not invented in the middle of running code', function (t) {
  /* A prologue with a real instruction in front of it is reached by falling through,
     so it is not a boundary this scan can see. Saying nothing is the honest answer. */
  t.assertDeepEqual(D.thumbEntryPoints(code16(0x2000, 0x2101, 0xB500, 0x4770)), [],
    'code with no padding in front of the prologue yields no candidate');
  /* Four bytes of one repeated value read as a fill, which is what a literal pool
     looks like after its last word. */
  const afterFill = Uint8Array.from(Array.from(code16(0xAAAA, 0xAAAA, 0xB5F0)).map(function (b) { return b; }));
  const found = D.thumbEntryPoints(afterFill);
  t.assertEqual(found.length, 1, 'a repeated halfword counts as padding');
  t.assertEqual(found[0].at, 4, 'and the prologue behind it is a candidate');
});

module.exports = { suite: suite };
