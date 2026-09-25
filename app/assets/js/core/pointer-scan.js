/* ============================================================
   Ketor - Pointer tables (Batch 50)
   ------------------------------------------------------------
   A pointer table is how a game finds its data: a run of four byte
   little endian addresses into the ROM. Reverse engineering a game
   starts by finding those runs, because they name the graphics, the
   maps and the text. Every ROM hacking tutorial on the subject
   describes the same two steps: find the pointer, follow it, and
   check that what it points at makes sense.

   This module only finds runs and classifies their targets. The
   caller decides what "makes sense" means for the data it wants.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  function readU32(bytes, offset) {
    var b0 = bytes[offset] & 0xFF, b1 = bytes[offset + 1] & 0xFF;
    var b2 = bytes[offset + 2] & 0xFF, b3 = bytes[offset + 3] & 0xFF;
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  function writeU32List(bytes, value, options) {
    var opts = options || {};
    var out = [];
    var v = value >>> 0;
    for (var i = 0; i + 4 <= bytes.length; i += opts.step || 2) {
      if (readU32(bytes, i) === v) out.push(i);
      if (out.length >= (opts.max || 5000)) break;
    }
    return out;
  }

  function readU16(bytes, offset) {
    return ((bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8)) & 0xFFFF;
  }

  /* Walk the ROM and keep every run of consecutive in-bounds addresses. Two
     filler values are ignored: zero and 0xFFFFFFFF, because tables are often
     terminated or padded with them. */
  function scanTables(bytes, options) {
    var opts = options || {};
    var stride = opts.stride || 4;
    var minCount = opts.minCount === undefined ? 8 : opts.minCount;
    var classify = opts.classify || null;
    var len = bytes.length;
    var runs = [];
    var current = null;
    var zeros = 0;
    for (var off = 0; off + 4 <= len; off += stride) {
      var v = readU32(bytes, off);
      var valid = v !== 0 && v !== 0xFFFFFFFF && v >= 8 && v + 8 < len;
      if (!valid) {
        if (current && current.values.length >= minCount) runs.push(current);
        current = null;
        if (v === 0) zeros++;
        continue;
      }
      if (!current) current = { offset: off, values: [] };
      current.values.push(v);
    }
    if (current && current.values.length >= minCount) runs.push(current);
    var out = [];
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      var kinds = {};
      var sorted = true;
      for (var i = 0; i < run.values.length; i++) {
        var kind = classify ? (classify(run.values[i]) || 'other') : 'rom';
        kinds[kind] = (kinds[kind] || 0) + 1;
        if (i > 0 && run.values[i] < run.values[i - 1]) sorted = false;
      }
      var bestKind = 'rom', bestCount = -1;
      Object.keys(kinds).forEach(function (k) {
        if (kinds[k] > bestCount) { bestCount = kinds[k]; bestKind = k; }
      });
      out.push({
        offset: run.offset,
        count: run.values.length,
        bytes: run.values.length * stride,
        kind: bestKind,
        kindShare: bestCount / run.values.length,
        kinds: kinds,
        ascending: sorted,
        first: run.values[0],
        last: run.values[run.values.length - 1],
        values: run.values
      });
    }
    out.sort(function (a, b) { return b.count - a.count || a.offset - b.offset; });
    return { tables: out, zeroSlots: zeros };
  }

  /* Targets that hold compressed graphics, which is what a graphics pointer
     table points at. */
  function graphicsClassifier(bytes, options) {
    var opts = options || {};
    return function (value) {
      if (!K.core.compressionHeaderAt) return 'rom';
      var head = K.core.compressionHeaderAt(bytes, value, { minSize: opts.minSize || 0x40 });
      if (!head) return 'rom';
      if (head.size % (opts.tileSize || 32) !== 0) return 'rom';
      return 'graphics';
    };
  }

  K.core.readU32 = readU32;
  K.core.readU16 = readU16;
  K.core.findU32 = writeU32List;
  K.core.scanPointerTables = scanTables;
  K.core.graphicsClassifier = graphicsClassifier;
})(window);
