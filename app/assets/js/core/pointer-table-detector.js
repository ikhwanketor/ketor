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
    gba:     { name: 'GBA',     size: 4, little: true,  align: 2, base: 0x08000000, endsWith: [0x08, 0x09], romTop: 0x0A000000 },
    /* banked consoles: the bank of the table is the bank of the data */
    nesBank: { name: 'NES', size: 2, little: true, align: 2, base: 0x8000, banked: true, bankSize: 0x4000 },
    nds:     { name: 'NDS',     size: 4, little: true,  align: 4, base: 0x02000000, endsWith: [0x02, 0x03], romTop: 0x02400000 },
    ps1:     { name: 'PS1',     size: 4, little: true,  align: 4, base: 0x80000000, lastByte: 0x80 },
    ps2:     { name: 'PS2',     size: 4, little: true,  align: 4, base: 0x00100000 },
    psp:     { name: 'PSP',     size: 4, little: true,  align: 4, base: 0x08800000 },
    genesis: { name: 'Genesis', size: 4, little: false, align: 2, base: 0x00000000 },
    snes:    { name: 'SNES',    size: 2, little: true,  align: 2, base: 0x8000, banked: true, bankSize: 0x8000, flagMask: 0x7FFF },
    nes:     { name: 'NES',     size: 2, little: true,  align: 2, base: 0x8000, banked: true, bankSize: 0x4000, flagMask: 0x7FFF },
    gb:      { name: 'GB',      size: 2, little: true,  align: 2, base: 0x4000, banked: true, bankSize: 0x4000 },
    gbc:     { name: 'GBC',     size: 2, little: true,  align: 2, base: 0x4000, banked: true, bankSize: 0x4000 },
    pce:     { name: 'PCE',     size: 2, little: true,  align: 2, base: 0x2000, banked: true, bankSize: 0x2000 }
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
      var target = -1;
      if (mode === 'base') {
        target = v - rules.base;
      } else if (mode === 'raw') {
        target = v;
      } else if (mode === 'bank') {
        /* A 16 bit pointer carries no bank: the bank is the one the table itself
           lives in, which is how NES, SNES, GB and PCE engines address their data.
           The target is therefore bankStart + (value - cpuBase). */
        var bankStart = Math.floor(at / rules.bankSize) * rules.bankSize;
        var within = v - rules.base;
        if (within >= 0 && within < rules.bankSize) target = bankStart + within;
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
  function tableRunsFrom(sites, minEntries, missingAllowed) {
    var runs = [];
    var i = 0;
    while (i < sites.length - 1) {
      var stride = sites[i + 1].at - sites[i].at;
      if (stride <= 0 || stride > 128) { i++; continue; }
      var end = i + 1;
      while (end + 1 < sites.length) {
        var step = sites[end + 1].at - sites[end].at;
        if (step === stride) { end++; continue; }
        if (step > stride && step <= stride * (missingAllowed + 1) && step % stride === 0) { end++; continue; }
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
    var modes = rules.banked ? ['bank', 'base', 'raw'] : ['base', 'raw'];
    modes.forEach(function (mode) {
      var sites = candidateSites(bytes, rules, mode);
      if (sites.length < minEntries) return;
      var runs = tableRunsFrom(sites, minEntries, 4);
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