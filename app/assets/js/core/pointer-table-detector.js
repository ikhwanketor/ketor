(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};
  var K = Ketor;

  /* ==================================================================
     Pointer table detector, second design.

     The first design asked "which word matches one of my text offsets"
     and built the table out of those matches. That is fragile: a page
     inside a record has no entry of its own, extraction noise adds
     matches that do not belong to any table, and on four real roms it
     found nothing at all. Tables are a property of the ROM, not of the
     text list, so they are found structurally now and the mapped text
     only confirms what the structure already claims:

       1. every aligned word that decodes to an address inside the rom
          is a candidate pointer site (per console rules below),
       2. sites whose spacing is constant over a long run are a table
          (this is the low-entropy window idea: a pointer table is a
          straight line in a sea of noise),
       3. a table is accepted only when the records it describes behave
          like records: strictly ascending targets, every span closing
          with the console terminator plus padding, targets inside the
          rom, and the runs covering one region,
       4. the mapped text offsets then say how much of the table the
          user already knows, and which entry delta the records use
          (the header in front of a text).

     Step 3 is the gate. A wrong table cannot make thousands of spans
     end exactly like records, so a false positive is practically out of
     reach, and when nothing passes the detector reports nothing. */

  /* Console rules, the part every tool gets wrong. pointerSize and
     endianness are obvious; the interesting fields are alignment, the
     address base, a bit flag that may ride in the pointer, and the byte
     that a pointer must end with, which lets a scan reject 99% of the
     words before it compares anything. */
  var CONSOLE_RULES = {
    gba:     { name: 'GBA',     size: 4, little: true,  align: 2, base: 0x08000000, addressMask: 0x01FFFFFF, endsWith: [0x08, 0x09], romTop: 0x0A000000 },
    /* banked consoles: the bank of the table is the bank of the data */
    nesBank: { name: 'NES', size: 2, little: true, align: 2, base: 0x8000, banked: true, bankSize: 0x4000 },
    nds:     { name: 'NDS',     size: 4, little: true,  align: 4, base: 0x02000000, endsWith: [0x02, 0x03], romTop: 0x02400000 },
    ps1:     { name: 'PS1',     size: 4, little: true,  align: 4, base: 0x80000000, lastByte: 0x80 },
    ps2:     { name: 'PS2',     size: 4, little: true,  align: 4, base: 0x00100000 },
    psp:     { name: 'PSP',     size: 4, little: true,  align: 4, base: 0x08800000 },
    genesis: { name: 'Genesis', size: 4, little: false, align: 2, base: 0x00000000 },
    snes:    { name: 'SNES',    size: 2, little: true,  align: 2, base: 0x8000, banked: true, bankStep: 0x8000, window: 0x8000, threeByte: true },
    snesHi:  { name: 'SNES HiROM', size: 2, little: true, align: 2, base: 0x8000, banked: true, bankStep: 0x10000, window: 0x8000 },
    nes:     { name: 'NES',     size: 2, little: true,  align: 2, base: 0x8000, banked: true, bankStep: 0x4000, window: 0x8000, flagMask: 0x7FFF },
    nes32:   { name: 'NES 32K', size: 2, little: true, align: 2, base: 0xC000, banked: true, bankStep: 0x4000, window: 0x4000 },
    gb:      { name: 'GB',      size: 2, little: true,  align: 2, base: 0x4000, banked: true, bankStep: 0x4000, window: 0x4000, threeByte: true },
    gbc:     { name: 'GBC',     size: 2, little: true,  align: 2, base: 0x4000, banked: true, bankStep: 0x4000, window: 0x4000, threeByte: true },
    pce:     { name: 'PCE',     size: 2, little: true,  align: 2, base: 0x2000, banked: true, bankStep: 0x2000, window: 0x2000 },
    /* Consoles added in batch 73: the same model, their own rules. */
    sms:     { name: 'SMS/GG',  size: 2, little: true,  align: 2, base: 0x0000, banked: true, bankStep: 0x4000, window: 0x8000 },
    ngp:     { name: 'NeoGeo Pocket', size: 2, little: true, align: 2, base: 0x2000, banked: true, bankStep: 0x10000, window: 0x8000 },
    wswan:   { name: 'WonderSwan', size: 2, little: true, align: 2, base: 0x2000, banked: true, bankStep: 0x10000, window: 0x10000 },
    lynx:    { name: 'Atari Lynx', size: 2, little: true, align: 2, base: 0x0000, banked: true, bankStep: 0x400, window: 0x400 },
    segacd:  { name: 'Sega CD',   size: 4, little: false, align: 2, base: 0x00000000 },
    sega32x: { name: 'Sega 32X',   size: 4, little: false, align: 2, base: 0x00000000 },
    saturn:  { name: 'Saturn',    size: 4, little: false, align: 4, base: 0x06000000, endsWith: [0x06] },
    n64:     { name: 'N64',       size: 4, little: false, align: 4, base: 0x80000000, endsWith: [0x80] },
    n64rom:  { name: 'N64 ROM offset', size: 4, little: false, align: 4, base: 0x00000000 },
    gc:      { name: 'GameCube/Wii', size: 4, little: false, align: 4, base: 0x80000000, endsWith: [0x80] },
    amiga:   { name: 'Amiga',     size: 4, little: false, align: 2, base: 0x00000000 },
    c64:     { name: 'C64',       size: 2, little: true,  align: 2, base: 0x0000, banked: true, bankStep: 0x4000, window: 0x4000 }
  };

  function readValue(bytes, at, size, little) {
    if (at < 0 || at + size > bytes.length) return -1;
    var v = 0;
    if (little) { for (var i = size - 1; i >= 0; i--) v = (v * 256) + bytes[at + i]; }
    else { for (var j = 0; j < size; j++) v = (v * 256) + bytes[at + j]; }
    return v >>> 0;
  }

  function rulesFor(options) {
    if (options && options.rules) return options.rules;
    var id = String((options && (options.console || options.consoleId)) || '').toLowerCase();
    if (CONSOLE_RULES[id]) return CONSOLE_RULES[id];
    var range = (options && options.consoles) || Object.keys(CONSOLE_RULES);
    return CONSOLE_RULES[range[0]] || CONSOLE_RULES.gba;
  }

  /* Candidate pointer sites: a word that decodes to an address inside the rom. */
  function candidateSites(bytes, rules, mode) {
    var sites = [];
    var size = rules.size;
    var mask = rules.flagMask;
    for (var at = 0; at + size <= bytes.length; at += rules.align) {
      var v = readValue(bytes, at, size, rules.little);
      if (v < 0) continue;
      if (rules.endsWith && rules.endsWith.length) {
        var top = (v >>> ((size - 1) * 8)) & 0xFF;
        var ok = false;
        for (var e = 0; e < rules.endsWith.length; e++) if (top === rules.endsWith[e]) { ok = true; break; }
        if (!ok) continue;
      }
      if (rules.lastByte !== undefined && ((v >>> ((size - 1) * 8)) & 0xFF) !== rules.lastByte) continue;
      if (mask && ((v & 0xFFFF) & ~mask)) v = (v & mask) >>> 0;
      var decoded = rules.addressMask ? ((v & rules.addressMask) >>> 0) : v;
      var target = -1;
      if (mode === 'base') {
        /* With an address mask the masked word IS the rom offset: on the GBA both
           0x08xxxxxx and the 0x09 mirror decode to the same byte. */
        target = rules.addressMask ? decoded : (decoded - rules.base);
      } else if (mode === 'raw') {
        target = v;
      } else if (mode === 'bank') {
        /* A 16 bit pointer carries no bank: the bank is the one the table itself
           lives in. The window is the CPU window (32K on NES and SNES LoROM, 16K
           on GB) and the bank step is how far the file advances per bank, so a
           pointer into the upper half of a NES window lands in the next 16K bank. */
        var bankStep = rules.bankStep || rules.bankSize || 0x4000;
        var window = rules.window || bankStep;
        var bankStart = Math.floor(at / bankStep) * bankStep;
        var within = v - rules.base;
        if (within >= 0 && within < window) target = bankStart + within;
      } else if (mode === 'bank3') {
        /* Three byte pointers (bank plus address), as SNES and GB writers use them. */
        if (at + 3 > bytes.length) continue;
        var addr3 = bytes[at] | (bytes[at + 1] << 8);
        var bank3v = bytes[at + 2];
        var step3 = rules.bankStep || 0x8000;
        if (addr3 < rules.base) continue;
        target = bank3v * step3 + (addr3 - rules.base);
      }
      if (target < 0 || target >= bytes.length) continue;
      if (rules.romTop && size === 4 && v >= rules.romTop) continue;
      sites.push({ at: at, target: target >>> 0, value: v });
    }
    return sites;
  }

  function spanIsRecord(bytes, from, to, termSet) {
    if (to <= from || to > bytes.length) return false;
    /* The gate is the terminator. Padding after it is a bonus: several consoles
       pack their strings back to back with no padding at all, and requiring it
       made every table on NES, SNES, GB and GBC fail. */
    for (var p = to - 1; p >= from; p--) { if (termSet[bytes[p]]) return true; }
    return false;
  }

  /* Longest run of sites with a constant spacing: the low entropy window. */
  /* A table can contain an entry that is not a pointer at all (a zero, a flag
     word), which used to cut one table into two. A run therefore tolerates a few
     missing sites as long as every step stays a multiple of the stride. */
  function tableRunsFrom(bytes, sites, minEntries, missingAllowed, termSet) {
    var runs = [];
    var i = 0;
    while (i < sites.length - 1) {
      var stride = sites[i + 1].at - sites[i].at;
      if (stride <= 0 || stride > 128) { i++; continue; }
      var end = i + 1;
      while (end + 1 < sites.length) {
        var step = sites[end + 1].at - sites[end].at;
        if (step === stride) { end++; continue; }
        /* A hole (an entry that is not a pointer at all) may be crossed, but only
           when the records on both sides still read like records: the structure
           decides, not the distance. */
        if (step > stride && step <= stride * (missingAllowed + 1) &&
            (step % stride === 0 || spanIsRecord(bytes, sites[end].target, sites[end + 1].target, termSet))) { end++; continue; }
        break;
      }
      var count = end - i + 1;
      var holes = Math.round((sites[end].at - sites[i].at) / stride) + 1 - count;
      if (count >= minEntries) runs.push({ from: i, to: end, stride: stride, holes: holes });
      i = end + 1;
    }
    return runs;
  }

  function detect(bytes, options) {
    var opts = options || {};
    var rules = rulesFor(opts);
    var term = (opts.terminator && opts.terminator.length) ? opts.terminator : [0x00];
    var termSet = Object.create(null);
    term.forEach(function (c) { termSet[c & 0xFF] = true; });
    var minEntries = Number(opts.minEntries) || 16;
    var texts = (opts.textOffsets || []).filter(function (o) { return Number.isFinite(o) && o >= 0 && o < bytes.length; });
    var textSet = Object.create(null);
    texts.forEach(function (o) { textSet[o] = true; });
    var deltaWindow = Number.isFinite(opts.deltaWindow) ? opts.deltaWindow : 4;

    var results = [];
    var modes = rules.banked ? (rules.threeByte ? ['bank', 'bank3', 'base', 'raw'] : ['bank', 'base', 'raw']) : ['base', 'raw'];
    modes.forEach(function (mode) {
      var sites = candidateSites(bytes, rules, mode);
      if (sites.length < minEntries) return;
      var runs = tableRunsFrom(bytes, sites, minEntries, 4, termSet);
      runs.forEach(function (run) {
        var stride = run.stride;
        var lo = sites[run.from].at;
        var hi = sites[run.to].at;
        /* the run has to be a record table: strictly ascending targets and
           every span closing like a record */
        var entries = [];
        for (var k = run.from; k <= run.to; k++) entries.push(sites[k].target);
        var ascending = true;
        for (var a = 1; a < entries.length; a++) if (entries[a] <= entries[a - 1]) { ascending = false; break; }
        if (!ascending) return;
        var ok = 0, bad = 0;
        for (var s = 0; s < entries.length - 1; s++) {
          if (spanIsRecord(bytes, entries[s], entries[s + 1], termSet)) ok++; else bad++;
        }
        if (ok < minEntries || bad > 0) return;
        var entrySet = Object.create(null);
        entries.forEach(function (t) { entrySet[t] = true; });
        var matched = 0, deltas = Object.create(null);
        texts.forEach(function (o) {
          for (var d = -deltaWindow; d <= deltaWindow; d++) {
            if (entrySet[o + d]) { matched++; deltas[d] = (deltas[d] || 0) + 1; break; }
          }
        });
        /* Consensus, the criterion that separates a real text table from a table
           shaped coincidence. A text table points at its records through one header
           offset, so all the texts the user mapped land on a delta of the same value
           (on Aria of Sorrow 1754 of 1754 land on delta -2). A table that only looks
           like records has its matches scattered over every delta, which is what the
           Game Boy candidates did before this gate existed. */
        var dominant = 0, dominantDelta = null;
        Object.keys(deltas).forEach(function (d) { if (deltas[d] > dominant) { dominant = deltas[d]; dominantDelta = Number(d); } });
        var consensus = matched > 0 ? dominant / matched : 0;
        var confirmed = bad === 0 && matched >= 4 && consensus >= 0.8;
        if (texts.length >= 8 && !confirmed) return;
        results.push({
          console: rules.name, at: lo, stride: stride, entrySize: rules.size,
          dominantDelta: dominantDelta, deltaConsensus: consensus, confirmed: confirmed,
          endianness: rules.little ? 'little' : 'big', base: mode === 'raw' ? 0 : rules.base, mode: mode,
          count: entries.length, regionStart: entries[0], regionEnd: entries[entries.length - 1],
          spansOk: ok, spansBad: bad, matchedTexts: matched, textsGiven: texts.length,
          deltas: deltas, confidence: confirmed ? 0.98 : (bad === 0 ? 0.6 : 0.4)
        });
      });
    });
    results.sort(function (a, b) {
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return b.deltaConsensus - a.deltaConsensus;
    });
    var out = [], seen = Object.create(null);
    results.forEach(function (r) {
      var key = r.at + '|' + r.stride + '|' + r.base;
      if (seen[key]) return;
      seen[key] = true;
      out.push(r);
    });
    return out.slice(0, Number(opts.maxResults) || 6);
  }

  K.core.POINTER_CONSOLE_RULES = CONSOLE_RULES;
  K.core.detectPointerTables = detect;
  K.core.readPointerTable = function (bytes, table, index) {
    if (!bytes || !table) return -1;
    var v = readValue(bytes, table.at + index * table.stride, table.entrySize, table.endianness !== 'big');
    var off = v - (table.base || 0);
    return (off >= 0 && off < bytes.length) ? off : -1;
  };
})(typeof window !== 'undefined' ? window : this);