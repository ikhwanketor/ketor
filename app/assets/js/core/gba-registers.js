/* ============================================================
   Ketor - GBA display registers (Batch 55)
   ------------------------------------------------------------
   BGxCNT is not in the ROM. The register lives at 0x04000008
   and up, in IO memory, and the game's code writes it while it
   runs. So a ROM cannot be asked what BGxCNT says; it can only be
   asked where the code decides it.

   What the code looks like when it decides:

       ldr  r0, =0x04000008     ; the address of BG0CNT, in a literal
       ldr  r1, =0x1E04         ; the value, also in a literal
       strh r1, [r0]            ; store

   Both constants therefore sit in the ROM, close to each other,
   and the value has a shape: char base in bits 2-3, colour depth in
   bit 7, screen base in bits 8-12, size in bits 14-15. Finding an
   address with a well shaped value near it is evidence, not proof,
   so every hit is reported with the bytes that produced it and a
   confidence, and the caller shows them together.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var REGISTERS = {
    0x04000000: { name: 'DISPCNT', kind: 'display' },
    0x04000008: { name: 'BG0CNT', kind: 'bg', index: 0 },
    0x0400000A: { name: 'BG1CNT', kind: 'bg', index: 1 },
    0x0400000C: { name: 'BG2CNT', kind: 'bg', index: 2 },
    0x0400000E: { name: 'BG3CNT', kind: 'bg', index: 3 }
  };

  /* The GBA register block is mirrored: code may use 0x04000008 or its mirror at
     0x04000008 + 0x1000000 * n. Only the base block is used in practice, but the
     mirror is accepted so a hit is not missed. */
  var MIRRORS = [0, 0x01000000, 0x02000000, 0x03000000];

  function decodeBgxcnt(value) {
    var v = Number(value) & 0xFFFF;
    return {
      priority: v & 3,
      charBase: (v >> 2) & 3,
      mosaic: !!(v & 0x40),
      colour256: !!(v & 0x80),
      screenBase: (v >> 8) & 0x1F,
      wrap: !!(v & 0x2000),
      size: (v >> 14) & 3,
      sizeName: ['32x32', '64x32', '32x64', '64x64'][(v >> 14) & 3],
      charBlockAddress: 0x06000000 + ((v >> 2) & 3) * 0x4000,
      screenBlockAddress: 0x06000000 + ((v >> 8) & 0x1F) * 0x800
    };
  }

  function decodeDispcnt(value) {
    var v = Number(value) & 0xFFFF;
    return {
      mode: v & 7,
      bg: [0, 1, 2, 3].filter(function (i) { return (v & (0x100 << i)) !== 0; }),
      obj: !!(v & 0x1000),
      forcedBlank: !!(v & 0x80)
    };
  }

  function plausibleBgxcnt(value) {
    var v = Number(value) & 0xFFFF;
    if (v === 0 || v === 0xFFFF) return 0;
    var size = (v >> 14) & 3;
    var screenBase = (v >> 8) & 0x1F;
    var charBase = (v >> 2) & 3;
    var score = 0.4;
    // a screen block beyond 31 cannot exist, and a char block is 0 to 3
    if (screenBase > 31) score -= 0.4;
    if (size > 3) score -= 0.4;
    // the bits above 15 are not part of the register at all
    if ((Number(value) & 0xFFFF0000) !== 0) score -= 0.5;
    // a colour depth bit and a base that are zero everywhere is a common but dull case
    if (charBase === 0 && screenBase === 0 && size === 0) score -= 0.1;
    return Math.max(0, Math.min(1, score));
  }

  function plausibleDispcnt(value) {
    var v = Number(value) & 0xFFFF;
    if ((Number(value) & 0xFFFF0000) !== 0) return 0;
    var mode = v & 7;
    if (mode > 5) return 0;
    var score = 0.5;
    if (v & 0x1F00) score += 0.2;     // some background enabled
    if (v & 0x1000) score += 0.1;     // objects enabled
    if ((v & 0x1F00) === 0) score -= 0.2;
    return Math.max(0, Math.min(1, score));
  }

  function readU32Local(bytes, at) {
    if (at < 0 || at + 4 > bytes.length) return null;
    return ((bytes[at] & 0xFF) | ((bytes[at + 1] & 0xFF) << 8) | ((bytes[at + 2] & 0xFF) << 16) | ((bytes[at + 3] & 0xFF) << 24)) >>> 0;
  }

  /* Every place the code names a display register, with the constant that sits
     near it. The window is 0x200 bytes, which covers a compiled setup block. */
  function scanDisplaySetup(bytes, options) {
    var opts = options || {};
    var window = Math.max(8, Number(opts.window) || 0x200);
    var hits = [];
    for (var at = 0; at + 4 <= bytes.length; at += 4) {
      var word = readU32Local(bytes, at);
      var reg = null;
      MIRRORS.forEach(function (m) {
        if (reg) return;
        var candidate = word - m;
        if (REGISTERS[candidate]) reg = { address: candidate, info: REGISTERS[candidate], mirror: m };
      });
      if (!reg) continue;
      var found = [];
      for (var off = Math.max(0, at - window); off + 4 <= Math.min(bytes.length, at + window); off += 2) {
        if (off === at) continue;
        var value = readU32Local(bytes, off);
        var confidence = reg.info.kind === 'bg' ? plausibleBgxcnt(value) : plausibleDispcnt(value);
        if (confidence <= 0) continue;
        found.push({
          valueAt: off,
          raw: value,
          value: value & 0xFFFF,
          confidence: confidence,
          distance: Math.abs(off - at),
          decoded: reg.info.kind === 'bg' ? decodeBgxcnt(value) : decodeDispcnt(value)
        });
      }
      found.sort(function (a, b) { return b.confidence - a.confidence || a.distance - b.distance; });
      hits.push({
        registerAt: at,
        register: reg.info.name,
        mirror: reg.mirror,
        candidates: found.slice(0, 4)
      });
    }
    return hits;
  }

  /* The backgrounds a ROM sets up, gathered by the screen base they name. */
  function backgroundsFrom(bytes, options) {
    var hits = scanDisplaySetup(bytes, options);
    var byScreen = {};
    var order = [];
    hits.forEach(function (hit) {
      if (hit.register.indexOf('BG') !== 0) return;
      hit.candidates.forEach(function (c) {
        if (c.confidence < 0.4) return;
        var key = c.decoded.screenBase + ':' + c.decoded.charBase + ':' + c.decoded.colour256 + ':' + c.decoded.size;
        if (!byScreen[key]) {
          byScreen[key] = {
            screenBase: c.decoded.screenBase, charBase: c.decoded.charBase,
            colour256: c.decoded.colour256, size: c.decoded.size, sizeName: c.decoded.sizeName,
            screenBlockAddress: c.decoded.screenBlockAddress, charBlockAddress: c.decoded.charBlockAddress,
            registers: [], best: c.confidence, count: 0
          };
          order.push(key);
        }
        var entry = byScreen[key];
        entry.count++;
        if (c.confidence > entry.best) entry.best = c.confidence;
        if (entry.registers.length < 6) entry.registers.push({ name: hit.register, at: hit.registerAt, valueAt: c.valueAt, value: c.value, confidence: c.confidence });
      });
    });
    var out = order.map(function (k) { return byScreen[k]; });
    out.sort(function (a, b) { return b.best - a.best || b.count - a.count; });
    return { backgrounds: out, hits: hits };
  }

  K.core.GBA_REGISTERS = REGISTERS;
  K.core.backgroundsFrom = backgroundsFrom;
})(window);