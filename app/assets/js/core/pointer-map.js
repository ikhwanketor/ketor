/* ============================================================
   Ketor - Pointer map and safe write (Batch 51)
   ------------------------------------------------------------
   Two jobs, both about not corrupting a ROM.

   Addresses: the console reads memory through its own bus, the file
   on disk is a flat array. A pointer stored in a ROM is a bus
   address, so writing one means converting:

     GBA / NDS   linear, base 0x08000000 / 0x02000000, little endian
     Mega Drive  linear, no base, big endian
     SNES        banked: LoROM puts 32 KiB of ROM at $8000-$FFFF of
                 each bank, HiROM puts 64 KiB at $0000-$FFFF
     NES / GB    16 bit CPU address inside a bank the mapper chooses,
                 so a conversion without the mapper is refused rather
                 than guessed

   Space: growing data needs somewhere to go. findFreeRuns reports the
   runs of untouched bytes (0x00 or 0xFF), planRelocation produces the
   whole plan - where to write, and every pointer that has to be
   redirected - and the caller applies it through the patch layer, so
   a repoint is undoable like any other edit.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var SYSTEMS = {
    gba: { id: 'gba', label: 'GBA', kind: 'linear', base: 0x08000000, end: 0x0A000000, pointerBytes: 4, endian: 'little' },
    nds: { id: 'nds', label: 'NDS', kind: 'linear', base: 0x02000000, end: 0x02400000, pointerBytes: 4, endian: 'little' },
    genesis: { id: 'genesis', label: 'Mega Drive', kind: 'linear', base: 0x000000, end: 0x400000, pointerBytes: 4, endian: 'big' },
    snes: { id: 'snes', label: 'SNES', kind: 'snes', pointerBytes: 3, endian: 'little' },
    nes: { id: 'nes', label: 'NES', kind: 'banked', pointerBytes: 2, endian: 'little' },
    gb: { id: 'gb', label: 'Game Boy', kind: 'banked', pointerBytes: 2, endian: 'little' },
    gbc: { id: 'gbc', label: 'GBC', kind: 'banked', pointerBytes: 2, endian: 'little' }
  };

  function systemOf(nameOrId) {
    var raw = String(nameOrId == null ? '' : nameOrId).toLowerCase();
    if (SYSTEMS[raw]) return SYSTEMS[raw];
    if (K.core.normalizeSystem) {
      var id = K.core.normalizeSystem(nameOrId);
      if (SYSTEMS[id]) return SYSTEMS[id];
    }
    return null;
  }

  /* ---------- SNES banking ---------- */

  function snesHeader(bytes) {
    if (!bytes || bytes.length < 0x8000) return null;
    var headerOffset = (bytes.length % 0x8000) === 0x200 ? 0x200 : 0;
    function score(at) {
      if (at + 0x20 > bytes.length) return -1;
      var complement = (bytes[at + 0x1C] & 0xFF) | ((bytes[at + 0x1D] & 0xFF) << 8);
      var checksum = (bytes[at + 0x1E] & 0xFF) | ((bytes[at + 0x1F] & 0xFF) << 8);
      var title = '';
      for (var i = 0; i < 21; i++) {
        var c = bytes[at + i] & 0xFF;
        if (c >= 0x20 && c < 0x7F) title += String.fromCharCode(c);
      }
      var ok = ((complement ^ checksum) & 0xFFFF) === 0xFFFF;
      return { title: title.replace(/\s+$/, ''), checksumOk: ok, checksum: checksum };
    }
    var lo = score(headerOffset + 0x7FC0);
    var hi = score(headerOffset + 0xFFC0);
    var mapping = null;
    if (hi && hi.checksumOk && !(lo && lo.checksumOk)) mapping = 'hirom';
    else if (lo && lo.checksumOk) mapping = 'lorom';
    else if (hi && lo) mapping = null;
    return {
      copierHeader: headerOffset,
      mapping: mapping,
      lo: lo,
      hi: hi,
      title: (mapping === 'hirom' ? hi.title : (lo ? lo.title : ''))
    };
  }

  function snesToOffset(busAddress, mapping) {
    var addr = Number(busAddress) >>> 0;
    if (!Number.isFinite(addr)) return null;
    var bank = (addr >> 16) & 0xFF;
    var off = addr & 0xFFFF;
    if (mapping === 'hirom') {
      if (off < 0x8000 && bank < 0xC0) return null;
      return ((bank & 0x3F) << 16) | off;
    }
    // LoROM: 32 KiB of ROM in the upper half of every bank
    if (off < 0x8000) return null;
    return ((bank & 0x7F) << 15) | (off - 0x8000);
  }

  function offsetToSnes(pc, mapping) {
    var offset = Number(pc);
    if (!Number.isFinite(offset) || offset < 0) return null;
    if (mapping === 'hirom') return ((((offset >> 16) & 0x3F) | 0xC0) << 16) | (offset & 0xFFFF);
    return ((0x80 + (offset >> 15)) << 16) | (0x8000 + (offset & 0x7FFF));
  }

  /* ---------- the two directions ---------- */

  function toRomOffset(system, busAddress, options) {
    var sys = systemOf(system);
    if (!sys) return null;
    var addr = Number(busAddress);
    if (!Number.isFinite(addr)) return null;
    var opts = options || {};
    if (sys.kind === 'linear') {
      if (addr >= sys.base && addr < sys.end) return addr - sys.base;
      // a ROM address written without its base is accepted when it is in range
      if (opts.allowBare && addr >= 0 && addr < sys.end - sys.base) return addr;
      return null;
    }
    if (sys.kind === 'snes') return snesToOffset(addr, opts.mapping || 'lorom');
    return null;   // a banked console needs its mapper, see the header comment
  }

  function toBusAddress(system, romOffset, options) {
    var sys = systemOf(system);
    if (!sys) return null;
    var offset = Number(romOffset);
    if (!Number.isFinite(offset) || offset < 0) return null;
    var opts = options || {};
    if (sys.kind === 'linear') return (offset + sys.base) >>> 0;
    if (sys.kind === 'snes') return offsetToSnes(offset, opts.mapping || 'lorom');
    return null;
  }

  function readPointer(bytes, offset, system, options) {
    var sys = systemOf(system);
    if (!sys || !bytes || offset < 0 || offset + sys.pointerBytes > bytes.length) return null;
    var out = [];
    for (var i = 0; i < sys.pointerBytes; i++) out.push(bytes[offset + i] & 0xFF);
    if (sys.kind === 'snes') {
      // stored as address low, address high, bank
      if (options && options.mapping === 'hirom') {
        return ((out[2] & 0x3F) << 16) | ((out[1] & 0xFF) << 8) | (out[0] & 0xFF);
      }
      return ((out[2] & 0xFF) << 16) | ((out[1] & 0xFF) << 8) | (out[0] & 0xFF);
    }
    if (sys.endian === 'big') {
      return ((out[0] << 24) | (out[1] << 16) | (out[2] << 8) | out[3]) >>> 0;
    }
    var value = 0;
    for (var j = sys.pointerBytes - 1; j >= 0; j--) value = (value << 8) | out[j];
    return value >>> 0;
  }

  function pointerBytesOf(value, system, options) {
    var sys = systemOf(system);
    if (!sys) return null;
    var v = Number(value) >>> 0;
    if (sys.kind === 'snes') {
      var mapping = (options && options.mapping) || 'lorom';
      if (mapping === 'hirom') return [v & 0xFF, (v >> 8) & 0xFF, ((v >> 16) & 0x3F) | 0xC0];
      var bank = (v >> 16) & 0xFF;
      return [v & 0xFF, (v >> 8) & 0xFF, bank < 0x80 ? bank | 0x80 : bank];
    }
    var out = [];
    if (sys.endian === 'big') {
      for (var i = sys.pointerBytes - 1; i >= 0; i--) out.push((v >>> (i * 8)) & 0xFF);
      return out;
    }
    for (var j = 0; j < sys.pointerBytes; j++) out.push((v >>> (j * 8)) & 0xFF);
    return out;
  }

  /* ---------- free space ---------- */

  function findFreeRuns(bytes, options) {
    var opts = options || {};
    var wanted = opts.wanted === undefined ? [0x00, 0xFF] : opts.wanted;
    var minLength = Math.max(1, Number(opts.minLength) || 0x100);
    var from = Math.max(0, Number(opts.from) || 0);
    var to = Math.min(bytes.length, opts.to === undefined ? bytes.length : Number(opts.to));
    var runs = [];
    var i = from;
    while (i < to) {
      var value = bytes[i] & 0xFF;
      if (wanted.indexOf(value) === -1) { i++; continue; }
      var start = i;
      while (i < to && (bytes[i] & 0xFF) === value) i++;
      var length = i - start;
      if (length >= minLength) runs.push({ offset: start, length: length, fill: value });
    }
    runs.sort(function (a, b) { return b.length - a.length || a.offset - b.offset; });
    return runs;
  }

  /* Where a new block of data can go. The end of the file is offered first
     because appending never overwrites anything, then the largest untouched run
     inside the ROM is offered as well. */
  function findFreeSpace(bytes, size, options) {
    var opts = options || {};
    var need = Math.max(1, Number(size) || 0);
    var align = Math.max(1, Number(opts.align) || 1);
    var alignUp = function (v) { return Math.ceil(v / align) * align; };
    var appendAt = alignUp(bytes.length);
    var runs = findFreeRuns(bytes, { minLength: need, from: opts.from || 0, wanted: opts.wanted });
    var inside = runs.length ? runs[0] : null;
    return {
      append: { offset: appendAt, length: need, fill: null, grows: true },
      inside: inside ? { offset: alignUp(inside.offset), length: inside.length, fill: inside.fill, grows: false } : null,
      runs: runs.slice(0, 8)
    };
  }

  /* ---------- the safe write ---------- */

  /* A byte match is not a pointer. The value 0x08200000 turned up 248 times in the
     8 MiB test ROM, which is packed data that happens to look like an address, and
     rewriting all of them would destroy the file. So a match is only a site, and a
     site is only used when the number of sites is small enough to be a table. */
  function findPointersTo(bytes, targetOffset, system, options) {
    var sys = systemOf(system);
    if (!sys || !bytes) return [];
    var opts = options || {};
    var bus = toBusAddress(system, targetOffset, opts);
    if (bus === null) return [];
    var needle = pointerBytesOf(bus, system, opts);
    if (!needle) return [];
    var align = Math.max(1, Number(opts.pointerAlign) || defaultAlign(sys));
    var step = Math.max(1, Number(opts.step) || align);
    var start = Math.max(0, Number(opts.from) || 0);
    var out = [];
    var limit = Number(opts.max) || 500;
    for (var i = start; i + needle.length <= bytes.length; i += step) {
      var match = true;
      for (var j = 0; j < needle.length; j++) {
        if ((bytes[i + j] & 0xFF) !== needle[j]) { match = false; break; }
      }
      if (match) {
        out.push(i);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /* GBA, NDS and Mega Drive pointers sit on their own width; the SNES, NES and Game
     Boy pack three and two byte entries, so alignment says nothing there. */
  function defaultAlign(sys) {
    if (!sys) return 1;
    return (sys.kind === 'linear') ? sys.pointerBytes : 1;
  }

  /* How many candidate sites an address may have before the answer is treated as
     data rather than a pointer table. A level table with a hundred entries is
     possible, but then the caller should point at the table, not sweep the ROM. */
  var MAX_SITES = 32;

  function classifyPointerSites(bytes, targetOffset, system, options) {
    var opts = options || {};
    var sites = findPointersTo(bytes, targetOffset, system, opts);
    var sys = systemOf(system);
    var classified = sites.map(function (at) {
      var neighbours = 0;
      if (sys) {
        [at - sys.pointerBytes, at + sys.pointerBytes].forEach(function (n) {
          if (n < 0 || n + sys.pointerBytes > bytes.length) return;
          var value = readPointer(bytes, n, system, opts);
          if (value === null) return;
          var back = toRomOffset(system, value, opts);
          if (back !== null && back >= 0 && back < bytes.length) neighbours++;
        });
      }
      return { offset: at, inTable: neighbours > 0, neighbours: neighbours };
    });
    return {
      sites: classified,
      all: sites,
      inTable: classified.filter(function (s) { return s.inTable; }),
      isolated: classified.filter(function (s) { return !s.inTable; })
    };
  }

  /* Everything needed to move data somewhere else, as a list of byte writes.
     Nothing is applied here: the caller sends the writes through the patch
     layer, which keeps the move undoable and visible as changed bytes. */
  function planRelocation(bytes, payload, options) {
    var opts = options || {};
    var oldOffset = Number(opts.oldOffset);
    if (!Number.isFinite(oldOffset)) return { ok: false, reason: 'no old offset' };
    var size = payload ? payload.length : 0;
    if (!size) return { ok: false, reason: 'nothing to write' };
    var align = Math.max(1, Number(opts.align) || 1);
    var space = findFreeSpace(bytes, size, { align: align, wanted: opts.wanted });
    var target = opts.preferInside && space.inside ? space.inside : space.append;
    if (!target) return { ok: false, reason: 'no free space', space: space };
    var maxSites = Number(opts.maxSites) || MAX_SITES;
    var classified = opts.repoint === false ? null : classifyPointerSites(bytes, oldOffset, opts.system, opts);
    if (classified && classified.all.length > maxSites) {
      return {
        ok: false,
        reason: 'the address turns up ' + classified.all.length + ' times, too many to be a pointer table: this looks like data that happens to match, so nothing was written',
        candidates: classified.all.slice(0, 64),
        sites: classified.all.length
      };
    }
    /* Safety policy, and it is deliberately strict: a site that sits in a table of
       addresses is a pointer, a lone match may be one but is more often a number
       that happens to look like an address. Measured on the test ROM, the graphics
       offset 0x200000 matches sixteen aligned places, thirteen of them isolated:
       writing an address there would damage the file for nothing. */
    var maxIsolated = opts.maxIsolated === undefined ? 2 : Math.max(0, Number(opts.maxIsolated));
    if (classified && classified.isolated.length > maxIsolated) {
      return {
        ok: false,
        reason: 'the address matches ' + classified.all.length + ' place(s), but only '
          + classified.inTable.length + ' of them sit in a table of addresses. The other '
          + classified.isolated.length + ' look like data, so nothing was written',
        candidates: classified.all.slice(0, 64),
        sites: classified.all.length,
        inTable: classified.inTable.length,
        isolated: classified.isolated.length
      };
    }
    var pointers = classified ? classified.all : [];
    var writes = [];
    for (var i = 0; i < size; i++) writes.push({ offset: target.offset + i, value: payload[i] & 0xFF });
    var newPointer = pointerBytesOf(toBusAddress(opts.system, target.offset, opts), opts.system, opts);
    pointers.forEach(function (at) {
      for (var j = 0; j < newPointer.length; j++) writes.push({ offset: at + j, value: newPointer[j] });
    });
    return {
      ok: true,
      system: systemOf(opts.system) ? systemOf(opts.system).id : null,
      oldOffset: oldOffset,
      newOffset: target.offset,
      newBusAddress: toBusAddress(opts.system, target.offset, opts),
      grows: !!target.grows,
      bytes: size,
      pointers: pointers,
      inTable: classified && classified.inTable.length ? classified.inTable.length : 0,
      isolated: classified && classified.isolated.length ? classified.isolated.length : 0,
      maxSites: maxSites,
      writes: writes
    };
  }

  function applyPlan(plan, writeByte) {
    if (!plan || !plan.ok || typeof writeByte !== 'function') return 0;
    var written = 0;
    for (var i = 0; i < plan.writes.length; i++) {
      if (writeByte(plan.writes[i].offset, plan.writes[i].value)) written++;
    }
    return written;
  }

  K.core.POINTER_SYSTEMS = SYSTEMS;
  K.core.pointerSystem = systemOf;
  K.core.snesHeader = snesHeader;
  K.core.snesToOffset = snesToOffset;
  K.core.offsetToSnes = offsetToSnes;
  K.core.toRomOffset = toRomOffset;
  K.core.toBusAddress = toBusAddress;
  K.core.readPointer = readPointer;
  K.core.pointerBytesOf = pointerBytesOf;
  K.core.findFreeRuns = findFreeRuns;
  K.core.findFreeSpace = findFreeSpace;
  K.core.findPointersTo = findPointersTo;
  K.core.classifyPointerSites = classifyPointerSites;
  K.core.POINTER_MAX_SITES = MAX_SITES;
  K.core.planRelocation = planRelocation;
  K.core.applyPlan = applyPlan;
})(window);
