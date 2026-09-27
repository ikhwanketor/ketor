/* ============================================================
   Ketor - a static ARM/Thumb disassembler (Batch 159)
   ------------------------------------------------------------
   Nothing here executes. A GBA cartridge holds two instruction
   sets, ARM (32 bit) and Thumb (16 bit), and the ARM7TDMI switches
   between them at run time. The bytes in the file are just bytes,
   so this module answers one question only: if the CPU reached this
   offset, which instruction would it be? The Debugger tab shows the
   answer beside the hex and no CPU is involved anywhere.

   Thumb or ARM is a property of the address, not of the bytes. In
   ARMv4T a BX/BLX target carries the new instruction set in bit 0:
   an odd address selects Thumb and an even one selects ARM, and a
   return address written by BL is even while a Thumb code pointer
   in a table is odd. isThumbAddress reads that bit and nothing
   else; it is a convention about the pointer, not evidence about
   the code. A caller that knows better (a symbol table, a header)
   can pass thumb: true/false to disassemble.

   What is not decoded is printed as .word with the raw value, never
   as a mnemonic that might be wrong. Thumb BL is two 16 bit halves
   and a row here is always one halfword wide, so the pair is left
   as .word rather than showing half an instruction. ARM
   coprocessor, PSR transfer, multiply and swap encodings are left
   out for the same reason.

   Known limits, said plainly:
     - The listing is linear. Data that sits between functions is
       decoded as instructions until the next known boundary.
     - thumbEntryPoints guesses boundaries from a fill pattern in
       front of a prologue; it reports candidates with the evidence
       it used and cannot prove any of them.
     - No symbol, no relocation, no PC-relative literal is followed:
       a literal pool load names the address it reads.
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

  var DEFAULT_COUNT = 16;
  /* A caller asking for a million lines gets a listing, not a hang. */
  var MAX_COUNT = 4096;
  var DEFAULT_ENTRIES = 16;
  var MAX_ENTRIES = 256;

  /* r13, r14 and r15 read better by name. A register list also names r11 and r12
     fp and ip, the way a listing prints a frame push, while a single operand keeps
     r11 and r12 so nothing is hidden. */
  var OPERAND_REGS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'sp', 'lr', 'pc'];
  var LIST_REGS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'fp', 'ip', 'sp', 'lr', 'pc'];

  /* The four bit condition field of an ARM instruction. 0xE is "always" and carries
     no suffix; 0xF is not a condition on this CPU and is left as data. */
  var CONDITIONS = ['eq', 'ne', 'cs', 'cc', 'mi', 'pl', 'vs', 'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le', '', 'nv'];

  var THUMB_ALU = ['ands', 'eors', 'lsls', 'lsrs', 'asrs', 'adcs', 'sbcs', 'rors', 'tst', 'negs', 'cmp', 'cmn', 'orrs', 'muls', 'bics', 'mvns'];
  var ARM_ALU = ['and', 'eor', 'sub', 'rsb', 'add', 'adc', 'sbc', 'rsc', 'tst', 'teq', 'cmp', 'cmn', 'orr', 'mov', 'bic', 'mvn'];
  /* TST, TEQ, CMP and CMN always write the flags and take no "s". */
  var ARM_FLAG_ONLY = [8, 9, 10, 11];
  var SHIFT_NAMES = ['lsl', 'lsr', 'asr', 'ror'];

  /* ---------- small helpers ---------- */

  function hx(value, digits) {
    var v = Number(value);
    if (!isFinite(v)) v = 0;
    var s = Math.floor(Math.abs(v)).toString(16).toUpperCase();
    while (s.length < (digits || 0)) s = '0' + s;
    return s;
  }

  function hex(value, digits) { return '0x' + hx(value, digits); }

  function regName(n) { return OPERAND_REGS[n & 0xF] || ('r' + (n & 0xF)); }

  /* A register list sorted by register number, the order the encoding lists them in. */
  function regList(mask) {
    var parts = [];
    for (var i = 0; i < 16; i++) if (mask & (1 << i)) parts.push(LIST_REGS[i]);
    return '{' + parts.join(', ') + '}';
  }

  function signExtend(value, bits) {
    var m = 1 << (bits - 1);
    return ((value & ((1 << bits) - 1)) ^ m) - m;
  }

  function ror(value, bits) {
    var b = ((bits % 32) + 32) % 32;
    var v = value >>> 0;
    if (b === 0) return v;
    return ((v >>> b) | (v << (32 - b))) >>> 0;
  }

  function bytesOf(source, at, size) {
    var out = [];
    for (var i = 0; i < size; i++) out.push(source[at + i] & 0xFF);
    return out;
  }

  function byteAt(bytes, at) {
    if (!bytes || at < 0 || at >= bytes.length) return 0;
    return bytes[at] & 0xFF;
  }

  function halfwordAt(bytes, at) {
    return (byteAt(bytes, at) | (byteAt(bytes, at + 1) << 8)) & 0xFFFF;
  }

  function wordAt(bytes, at) {
    return (byteAt(bytes, at) | (byteAt(bytes, at + 1) << 8)
      | (byteAt(bytes, at + 2) << 16) | (byteAt(bytes, at + 3) << 24)) >>> 0;
  }

  function word(value) { return '.word ' + hex(value >>> 0, 8); }
  function halfword(value) { return '.word ' + hex(value & 0xFFFF, 4); }

  /* ---------- the Thumb bit ---------- */

  /* ARMv4T keeps the instruction set of a branch target in the low bit of the
     address: BX/BLX copy that bit into the T flag, so a pointer to Thumb code is
     odd and a pointer to ARM code is even. A GBA ROM is mapped at 0x08000000, which
     is even, so the bit means the same on a file offset and on the address the
     console sees. This is a convention about a pointer, not a fact about the bytes:
     an odd offset that was typed by hand says "Thumb", nothing more. */
  function isThumbAddress(at) {
    var v = Number(at);
    if (!isFinite(v)) return false;
    return (Math.floor(v) & 1) === 1;
  }

  /* ---------- Thumb (16 bit) ---------- */

  function thumbBranchText(mnemonic, at, offset) {
    var arrow = offset < 0 ? '.-' : '.+';
    var delta = hex(Math.abs(offset), 1);
    return mnemonic + ' ' + arrow + delta + (offset === 0 ? ' (self)' : '');
  }

  function decodeThumb(bytes, at) {
    var hw = halfwordAt(bytes, at);

    /* Format 2: add/subtract register or three bit immediate (00011). */
    if ((hw & 0xF800) === 0x1800) {
      var f2imm = (hw >> 10) & 1;
      var f2sub = (hw >> 9) & 1;
      var f2rs = (hw >> 3) & 7;
      var f2rd = hw & 7;
      var f2name = (f2sub ? 'subs' : 'adds');
      var f2third = f2imm ? '#0x' + hx((hw >> 6) & 7, 0) : regName((hw >> 6) & 7);
      return { mnemonic: f2name, text: f2name + ' ' + regName(f2rd) + ', ' + regName(f2rs) + ', ' + f2third };
    }

    /* Format 1: move shifted register (000). */
    if ((hw & 0xE000) === 0x0000) {
      var f1op = (hw >> 11) & 3;
      var f1amount = (hw >> 6) & 0x1F;
      if (f1op === 3) return { mnemonic: '.word', text: halfword(hw) };
      /* A shift amount of zero on a right shift means thirty two, not zero. */
      if (f1op !== 0 && f1amount === 0) f1amount = 32;
      var f1name = ['lsls', 'lsrs', 'asrs'][f1op];
      return {
        mnemonic: f1name,
        text: f1name + ' ' + regName(hw & 7) + ', ' + regName((hw >> 3) & 7) + ', #0x' + hx(f1amount, 0)
      };
    }

    /* Format 3: move/compare/add/subtract immediate (001). */
    if ((hw & 0xE000) === 0x2000) {
      var f3op = (hw >> 11) & 3;
      var f3name = ['movs', 'cmp', 'adds', 'subs'][f3op];
      return {
        mnemonic: f3name,
        text: f3name + ' ' + regName((hw >> 8) & 7) + ', #0x' + hx(hw & 0xFF, 0)
      };
    }

    /* Format 4: ALU operations (010000). */
    if ((hw & 0xFC00) === 0x4000) {
      var f4op = (hw >> 6) & 0xF;
      var f4rs = (hw >> 3) & 7;
      var f4rd = hw & 7;
      var f4name = THUMB_ALU[f4op];
      if (f4op === 13) return { mnemonic: f4name, text: f4name + ' ' + regName(f4rd) + ', ' + regName(f4rs) + ', ' + regName(f4rd) };
      return { mnemonic: f4name, text: f4name + ' ' + regName(f4rd) + ', ' + regName(f4rs) };
    }

    /* Format 5: hi register operations and branch exchange (010001). */
    if ((hw & 0xFC00) === 0x4400) {
      var f5op = (hw >> 8) & 3;
      var f5h1 = (hw >> 7) & 1;
      var f5h2 = (hw >> 6) & 1;
      var f5rs = ((f5h2 << 3) | ((hw >> 3) & 7)) & 0xF;
      var f5rd = ((f5h1 << 3) | (hw & 7)) & 0xF;
      if (f5op === 3) {
        if ((hw & 7) !== 0) return { mnemonic: '.word', text: halfword(hw) };
        var f5link = f5h1 === 1;
        var f5name = f5link ? 'blx' : 'bx';
        return { mnemonic: f5name, text: f5name + ' ' + regName(f5rs), target: null };
      }
      if (f5op === 2) {
        /* mov r8, r8 is the encoding every assembler emits for nop (0x46C0). */
        if (hw === 0x46C0) return { mnemonic: 'nop', text: 'nop' };
        return { mnemonic: 'mov', text: 'mov ' + regName(f5rd) + ', ' + regName(f5rs) };
      }
      var f5alu = f5op === 0 ? 'add' : 'cmp';
      return { mnemonic: f5alu, text: f5alu + ' ' + regName(f5rd) + ', ' + regName(f5rs) };
    }

    /* Format 6: PC relative load (01001). */
    if ((hw & 0xF800) === 0x4800) {
      var f6rd = (hw >> 8) & 7;
      var f6imm = (hw & 0xFF) * 4;
      /* The base is the instruction address plus four with bit 1 cleared, the way the
         CPU forms the PC for a literal load. */
      var f6target = (((at + 4) & 0xFFFFFFFC) + f6imm) >>> 0;
      return {
        mnemonic: 'ldr',
        text: 'ldr ' + regName(f6rd) + ', [pc, #' + hex(f6imm, 0) + ']',
        target: f6target
      };
    }

    /* Format 7: load/store with register offset (0101). */
    if ((hw & 0xFE00) === 0x5000) {
      var f7l = (hw >> 11) & 1;
      var f7b = (hw >> 10) & 1;
      var f7name = (f7l ? 'ldr' : 'str') + (f7b ? 'b' : '');
      return {
        mnemonic: f7name,
        text: f7name + ' ' + regName(hw & 7) + ', [' + regName((hw >> 3) & 7) + ', ' + regName((hw >> 6) & 7) + ']'
      };
    }

    /* Format 8: load/store sign extended byte and halfword (0101 with bit 9 set). */
    if ((hw & 0xFE00) === 0x5200) {
      var f8h = (hw >> 11) & 1;
      var f8s = (hw >> 10) & 1;
      var f8name = f8h ? (f8s ? 'ldsh' : 'ldrh') : (f8s ? 'ldsb' : 'strh');
      return {
        mnemonic: f8name,
        text: f8name + ' ' + regName(hw & 7) + ', [' + regName((hw >> 3) & 7) + ', ' + regName((hw >> 6) & 7) + ']'
      };
    }

    /* Format 9: load/store with immediate offset (011). */
    if ((hw & 0xE000) === 0x6000) {
      var f9b = (hw >> 12) & 1;
      var f9l = (hw >> 11) & 1;
      var f9name = (f9l ? 'ldr' : 'str') + (f9b ? 'b' : '');
      var f9off = ((hw >> 6) & 0x1F) * (f9b ? 1 : 4);
      return {
        mnemonic: f9name,
        text: f9name + ' ' + regName(hw & 7) + ', [' + regName((hw >> 3) & 7) + ', #' + hex(f9off, 0) + ']'
      };
    }

    /* Format 10: load/store halfword with immediate offset (1000). */
    if ((hw & 0xF000) === 0x8000) {
      var f10l = (hw >> 11) & 1;
      var f10name = f10l ? 'ldrh' : 'strh';
      var f10off = ((hw >> 6) & 0x1F) * 2;
      return {
        mnemonic: f10name,
        text: f10name + ' ' + regName(hw & 7) + ', [' + regName((hw >> 3) & 7) + ', #' + hex(f10off, 0) + ']'
      };
    }

    /* Format 11: SP relative load/store (1001). */
    if ((hw & 0xF000) === 0x9000) {
      var f11l = (hw >> 11) & 1;
      var f11name = f11l ? 'ldr' : 'str';
      var f11off = (hw & 0xFF) * 4;
      return {
        mnemonic: f11name,
        text: f11name + ' ' + regName((hw >> 8) & 7) + ', [sp, #' + hex(f11off, 0) + ']'
      };
    }

    /* Format 12: load address (1010). */
    if ((hw & 0xF000) === 0xA000) {
      var f12sp = (hw >> 11) & 1;
      var f12off = (hw & 0xFF) * 4;
      var f12target = f12sp ? null : ((((at + 4) & 0xFFFFFFFC) + f12off) >>> 0);
      return {
        mnemonic: 'add',
        text: 'add ' + regName((hw >> 8) & 7) + ', ' + (f12sp ? 'sp' : 'pc') + ', #' + hex(f12off, 0),
        target: f12target
      };
    }

    /* Format 13: add offset to SP (10110000). */
    if ((hw & 0xFF00) === 0xB000) {
      var f13sub = (hw >> 7) & 1;
      var f13name = f13sub ? 'sub' : 'add';
      var f13off = (hw & 0x7F) * 4;
      return { mnemonic: f13name, text: f13name + ' sp, #' + hex(f13off, 0) };
    }

    /* Format 14: push and pop (1011 0/1 10). */
    if ((hw & 0xFE00) === 0xB400 || (hw & 0xFE00) === 0xBC00) {
      var f14pop = (hw & 0x0800) !== 0;
      var f14extra = (hw >> 8) & 1;
      var mask = hw & 0xFF;
      var list = mask;
      if (f14extra) list |= (f14pop ? (1 << 15) : (1 << 14));
      if (!list) return { mnemonic: '.word', text: halfword(hw) };
      var f14name = f14pop ? 'pop' : 'push';
      return { mnemonic: f14name, text: f14name + ' ' + regList(list) };
    }

    /* Format 15: multiple load/store (1100). */
    if ((hw & 0xF000) === 0xC000) {
      var f15l = (hw >> 11) & 1;
      var f15mask = hw & 0xFF;
      if (!f15mask) return { mnemonic: '.word', text: halfword(hw) };
      var f15name = f15l ? 'ldmia' : 'stmia';
      return {
        mnemonic: f15name,
        text: f15name + ' ' + regName((hw >> 8) & 7) + '!, ' + regList(f15mask)
      };
    }

    /* Format 16: conditional branch, and the software interrupt (1101). */
    if ((hw & 0xF000) === 0xD000) {
      var f16cond = (hw >> 8) & 0xF;
      if (f16cond === 0xF) {
        return { mnemonic: 'swi', text: 'swi #0x' + hx(hw & 0xFF, 0) };
      }
      if (f16cond === 0xE) return { mnemonic: '.word', text: halfword(hw) };
      var f16off = signExtend(hw & 0xFF, 8) * 2;
      var f16name = 'b' + CONDITIONS[f16cond];
      return {
        mnemonic: f16name,
        /* The listing prints where the branch goes relative to itself, which is the
           encoded offset plus the four bytes the PC has already moved on by. */
        text: thumbBranchText(f16name, at, f16off + 4),
        target: (at + 4 + f16off) >>> 0
      };
    }

    /* Format 17/18: unconditional branch (11100) and the BL prefix (11110/11111). */
    if ((hw & 0xF800) === 0xE000) {
      var f18off = signExtend(hw & 0x7FF, 11) * 2;
      return {
        mnemonic: 'b',
        text: thumbBranchText('b', at, f18off + 4),
        target: (at + 4 + f18off) >>> 0
      };
    }

    /* Thumb BL is two halfwords: 11110 offset high, then 11111 offset low. A row here
       is one halfword wide, so half of a branch is left as data rather than printed
       as an instruction that would not run on its own. */
    if ((hw & 0xF800) === 0xF000 || (hw & 0xF800) === 0xF800) {
      return { mnemonic: '.word', text: halfword(hw) };
    }

    return { mnemonic: '.word', text: halfword(hw) };
  }

  /* ---------- ARM (32 bit) ---------- */

  function armOperand2(inst) {
    var i = (inst >>> 25) & 1;
    if (i) {
      var rotate = ((inst >>> 8) & 0xF) * 2;
      var value = ror(inst & 0xFF, rotate);
      return { text: '#0x' + hx(value, 0), immediate: true, value: value };
    }
    var rm = inst & 0xF;
    var text = regName(rm);
    var byRegister = (inst >>> 4) & 1;
    var type = (inst >>> 5) & 3;
    if (byRegister) {
      return { text: text + ', ' + SHIFT_NAMES[type] + ' ' + regName((inst >>> 8) & 0xF) };
    }
    var amount = (inst >>> 7) & 0x1F;
    if (type === 3 && amount === 0) return { text: text + ', rrx' };
    if (amount === 0 && type === 0) return { text: text };
    /* A right shift by zero is a shift by thirty two. */
    if (amount === 0) amount = 32;
    return { text: text + ', ' + SHIFT_NAMES[type] + ' #0x' + hx(amount, 0) };
  }

  function decodeArm(bytes, at) {
    var inst = wordAt(bytes, at);
    var cond = (inst >>> 28) & 0xF;
    /* 1111 is not a condition this CPU takes: the word is left as data. */
    if (cond === 0xF) return { mnemonic: '.word', text: word(inst) };
    var suffix = CONDITIONS[cond];

    /* Branch and branch with link (bits 27-25 = 101). */
    if ((inst & 0x0E000000) === 0x0A000000) {
      var link = ((inst >>> 24) & 1) === 1;
      var offset = signExtend(inst & 0xFFFFFF, 24) * 4;
      var name = (link ? 'bl' : 'b') + suffix;
      return {
        mnemonic: name,
        text: thumbBranchText(name, at, offset + 8),
        target: (at + 8 + offset) >>> 0
      };
    }

    /* Branch and exchange (BX) and branch with link and exchange (BLX), register form. */
    if ((inst & 0x0FFFFFF0) === 0x012FFF10 || (inst & 0x0FFFFFF0) === 0x012FFF30) {
      var exchangeLink = (inst & 0xF0) === 0x30;
      var exchangeName = (exchangeLink ? 'blx' : 'bx') + suffix;
      return { mnemonic: exchangeName, text: exchangeName + ' ' + regName(inst & 0xF) };
    }

    /* Software interrupt (cond 1111 opcode, here always the 1110 condition). */
    if ((inst & 0x0F000000) === 0x0F000000) {
      return { mnemonic: 'swi' + suffix, text: 'swi' + suffix + ' #0x' + hx(inst & 0xFFFFFF, 0) };
    }

    /* Block data transfer (bits 27-25 = 100). */
    if ((inst & 0x0E000000) === 0x08000000) {
      var p = (inst >>> 24) & 1;
      var u = (inst >>> 23) & 1;
      var s = (inst >>> 22) & 1;
      var w = (inst >>> 21) & 1;
      var l = (inst >>> 20) & 1;
      var rn = (inst >>> 16) & 0xF;
      var listMask = inst & 0xFFFF;
      if (!listMask) return { mnemonic: '.word', text: word(inst) };
      if (!l && rn === 13 && p === 1 && u === 0 && w === 1) {
        return { mnemonic: 'push' + suffix, text: 'push' + suffix + ' ' + regList(listMask) };
      }
      if (l && rn === 13 && p === 0 && u === 1 && w === 1) {
        return { mnemonic: 'pop' + suffix, text: 'pop' + suffix + ' ' + regList(listMask) };
      }
      var mode = (p ? 'd' : 'i') + (u ? 'a' : 'b');
      var blockName = (l ? 'ldm' : 'stm') + suffix + mode;
      return {
        mnemonic: blockName,
        text: blockName + ' ' + regName(rn) + (w ? '!' : '') + ', ' + regList(listMask) + (s ? '^' : '')
      };
    }

    /* Single data transfer (bits 27-26 = 01). */
    if ((inst & 0x0C000000) === 0x04000000) {
      var sP = (inst >>> 24) & 1;
      var sU = (inst >>> 23) & 1;
      var sB = (inst >>> 22) & 1;
      var sW = (inst >>> 21) & 1;
      var sL = (inst >>> 20) & 1;
      var sRn = (inst >>> 16) & 0xF;
      var sRd = (inst >>> 12) & 0xF;
      var sName = (sL ? 'ldr' : 'str') + suffix + (sB ? 'b' : '');
      var sOffset;
      if ((inst >>> 25) & 1) {
        /* Register offset: the shift sits in the same bits the immediate uses. */
        var sAmount = (inst >>> 7) & 0x1F;
        var sType = (inst >>> 5) & 3;
        var sShift = '';
        if (!(sType === 0 && sAmount === 0)) {
          sShift = ', ' + SHIFT_NAMES[sType] + ' #0x' + hx(sAmount === 0 ? 32 : sAmount, 0);
        }
        sOffset = (inst & 0xF) === 0 && !sShift ? '' : ', ' + (sU ? '' : '-') + regName(inst & 0xF) + sShift;
      } else {
        sOffset = (inst & 0xFFF) === 0 ? '' : ', #' + (sU ? '' : '-') + hex(inst & 0xFFF, 0);
      }
      var sAddress = '[' + regName(sRn) + sOffset + ']';
      if (!sP) sAddress += ', ' + regName(sRd);
      return {
        mnemonic: sName,
        text: sName + ' ' + regName(sRd) + ', ' + sAddress + (sP && sW ? '!' : '')
      };
    }

    /* Halfword and signed data transfer (bits 27-25 = 000 with bit 4 and bit 7 set). */
    if ((inst & 0x0E000000) === 0 && ((inst >>> 4) & 1) === 1 && ((inst >>> 7) & 1) === 1) {
      var hP = (inst >>> 24) & 1;
      var hU = (inst >>> 23) & 1;
      var hI = (inst >>> 22) & 1;
      var hW = (inst >>> 21) & 1;
      var hL = (inst >>> 20) & 1;
      var hRn = (inst >>> 16) & 0xF;
      var hRd = (inst >>> 12) & 0xF;
      var hS = (inst >>> 6) & 1;
      var hH = (inst >>> 5) & 1;
      if (!hS && !hH) return { mnemonic: '.word', text: word(inst) };
      if (!hL && (hS || !hH)) return { mnemonic: '.word', text: word(inst) };
      /* LDR{cond}H, LDR{cond}SB and LDR{cond}SH, so the suffix goes after the base. */
      var hBase = hL ? (hH ? (hS ? 'ldrsh' : 'ldrh') : 'ldrsb') : 'strh';
      var hName = hBase.slice(0, 3) + suffix + hBase.slice(3);
      var hOffset = hI ? '#0x' + hx((((inst >>> 8) & 0xF) << 4) | (inst & 0xF), 0) : regName(inst & 0xF);
      return {
        mnemonic: hName,
        text: hName + ' ' + regName(hRd) + ', [' + regName(hRn) + (hI && ((inst >>> 8) & 0xF) === 0 && (inst & 0xF) === 0 ? '' : ', ' + (hU ? '' : '-') + hOffset)
          + ']' + (hP && hW ? '!' : '')
      };
    }

    /* Data processing (bits 27-26 = 00). */
    if ((inst & 0x0C000000) === 0) {
      var opcode = (inst >>> 21) & 0xF;
      var setFlags = ((inst >>> 20) & 1) === 1;
      var dRn = (inst >>> 16) & 0xF;
      var dRd = (inst >>> 12) & 0xF;
      var flagOnly = ARM_FLAG_ONLY.indexOf(opcode) >= 0;
      /* ADD{cond}{S}: the condition comes first, the flag bit last. */
      var dName = ARM_ALU[opcode] + suffix;
      if (!flagOnly && setFlags) dName += 's';
      /* mov r0, r0 with no shift and no flags is the encoding for nop (0xE1A00000). */
      if (opcode === 13 && !setFlags && ((inst >>> 25) & 1) === 0
        && (inst & 0xF) === dRd && ((inst >>> 4) & 0xFF) === 0) {
        return { mnemonic: 'nop', text: 'nop' };
      }
      var operand = armOperand2(inst);
      var dOperands;
      if (opcode === 13 || opcode === 15) dOperands = regName(dRd) + ', ' + operand.text;
      else if (flagOnly) dOperands = regName(dRn) + ', ' + operand.text;
      else dOperands = regName(dRd) + ', ' + regName(dRn) + ', ' + operand.text;
      return { mnemonic: dName, text: dName + ' ' + dOperands };
    }

    return { mnemonic: '.word', text: word(inst) };
  }

  /* ---------- the two entry points ---------- */

  function toCount(value, fallback, max) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return fallback;
    return Math.min(n, max);
  }

  /* Disassemble a window of a byte buffer. Each row is one instruction:
     { at, bytes, size, mnemonic, text } and, for a branch or a literal load, target.
     Thumb rows are two bytes and step by two, ARM rows are four and step by four.
     The listing stops at the end of the buffer instead of reading past it. */
  function disassemble(bytes, options) {
    var opts = options || {};
    var total = (bytes && bytes.length) ? bytes.length : 0;
    var thumb = opts.thumb === undefined ? isThumbAddress(opts.at) : !!opts.thumb;
    var size = thumb ? 2 : 4;
    var raw = Math.floor(Number(opts.at));
    if (!isFinite(raw) || raw < 0) raw = 0;
    /* The low bits of a pointer say which set to use, not where the instruction is. */
    var start = thumb ? (raw & ~1) : (raw & ~3);
    var count = opts.count === undefined ? DEFAULT_COUNT : toCount(opts.count, 0, MAX_COUNT);
    var out = [];
    for (var i = 0; i < count; i++) {
      var at = start + i * size;
      if (at + size > total) break;
      var decoded = thumb ? decodeThumb(bytes, at) : decodeArm(bytes, at);
      out.push({
        at: at,
        bytes: bytesOf(bytes, at, size),
        size: size,
        mnemonic: decoded.mnemonic,
        text: decoded.text,
        target: decoded.target === undefined ? null : decoded.target
      });
    }
    return out;
  }

  /* A halfword that reads as padding rather than as the instruction in front of a
     function: all zeroes, all ones, or four bytes of one repeated value, which is
     what a fill pattern, an alignment gap or the tail of a text record looks like. */
  function isPaddingHalfword(bytes, at) {
    if (at < 2) return false;
    var prev = halfwordAt(bytes, at - 2);
    if (prev === 0x0000 || prev === 0xFFFF) return true;
    if (at >= 4) {
      var b = byteAt(bytes, at - 1);
      if (byteAt(bytes, at - 2) === b && byteAt(bytes, at - 3) === b && byteAt(bytes, at - 4) === b) return true;
    }
    return false;
  }

  /* Candidate Thumb entry points, found by shape alone:
       - a push that saves lr (1011 0101 xxxxxxxx), the prologue of a function that
         returns, standing behind padding;
       - a bx lr (0x4770), a stub that returns immediately, standing behind padding.
     The padding in front is the evidence: code that runs into the candidate would
     have a real instruction there instead. Every candidate is reported with the
     halfword that produced it and what stood in front, and none of them is a proof:
     a literal pool can hold 0xB5xx, and a function that starts right after another
     function's last instruction is invisible to this rule. */
  function thumbEntryPoints(bytes, options) {
    var opts = options || {};
    var total = (bytes && bytes.length) ? bytes.length : 0;
    var limit = opts.limit === undefined ? DEFAULT_ENTRIES : toCount(opts.limit, DEFAULT_ENTRIES, MAX_ENTRIES);
    var out = [];
    for (var at = 0; at + 2 <= total && out.length < limit; at += 2) {
      var hw = halfwordAt(bytes, at);
      var prologue = (hw & 0xFE00) === 0xB400 && (hw & 0x0100) !== 0;
      var returns = hw === 0x4770;
      if (!prologue && !returns) continue;
      var padding = isPaddingHalfword(bytes, at);
      if (!padding && at !== 0) continue;
      out.push({
        at: at,
        thumb: true,
        kind: prologue ? 'push-lr' : 'bx-lr',
        text: prologue ? 'push ' + regList((hw & 0xFF) | (1 << 14)) : 'bx lr',
        evidence: padding ? 'padding in front of it' : 'the first halfword of the image'
      });
    }
    return out;
  }

  core.disassemble = disassemble;
  core.isThumbAddress = isThumbAddress;
  core.thumbEntryPoints = thumbEntryPoints;
  core.armDisasm = {
    DEFAULT_COUNT: DEFAULT_COUNT,
    MAX_COUNT: MAX_COUNT,
    OPERAND_REGS: OPERAND_REGS,
    LIST_REGS: LIST_REGS
  };
})(window);
