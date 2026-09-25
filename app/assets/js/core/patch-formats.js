/* ============================================================
   Ketor - Patch formats (Batch 58)
   ------------------------------------------------------------
   An IPS patch is a list of writes: the literal PATCH, then
   records of a three byte big endian offset, a two byte length and
   the bytes, and EOF at the end. A record whose length is zero is a
   run: two bytes of length and one byte of value.

   What IPS cannot say is 'the file got shorter'. It can point past
   the end of the original, and the applier pads what it skipped, so
   a grown ROM is expressible and a truncated one is not. That limit
   is reported rather than hidden.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var MAX_OFFSET = 0xFFFFFF;
  var RLE_MIN = 13;   // below this a run costs more than it saves

  /* changes: [{ offset, bytes }] or [{ offset, value }], in any order. */
  function buildIps(changes, options) {
    var opts = options || {};
    var list = (changes || []).map(function (c) {
      var bytes = c.bytes ? (c.bytes instanceof Uint8Array ? c.bytes : Uint8Array.from(c.bytes)) : new Uint8Array([c.value & 0xFF]);
      return { offset: Number(c.offset), bytes: bytes };
    }).filter(function (c) { return Number.isFinite(c.offset) && c.offset >= 0 && c.bytes.length; });
    list.sort(function (a, b) { return a.offset - b.offset; });
    var out = [];
    'PATCH'.split('').forEach(function (ch) { out.push(ch.charCodeAt(0)); });
    var skipped = 0;
    var i = 0;
    while (i < list.length) {
      var start = list[i].offset;
      var chunk = [];
      var at = start;
      var j = i;
      while (j < list.length && list[j].offset === at) {
        for (var b = 0; b < list[j].bytes.length; b++) chunk.push(list[j].bytes[b] & 0xFF);
        at += list[j].bytes.length;
        j++;
        // merge the next change only when it continues the same run
        if (j < list.length && list[j].offset !== at) break;
      }
      i = j;
      if (start > MAX_OFFSET) { skipped += chunk.length; continue; }
      var usable = Math.min(chunk.length, MAX_OFFSET - start + 1);
      if (usable < chunk.length) skipped += chunk.length - usable;
      var pos = 0;
      while (pos < usable) {
        var run = 1;
        while (pos + run < usable && chunk[pos + run] === chunk[pos] && run < 0xFFFF) run++;
        var take = usable - pos;
        if (run >= RLE_MIN) {
          pushRecord(out, start + pos, 0, run, chunk[pos]);
          pos += run;
          continue;
        }
        // a literal record, stopping before a run worth encoding on its own
        var length = 0;
        while (pos + length < usable && length < 0xFFFF) {
          var ahead = 1;
          while (pos + length + ahead < usable && chunk[pos + length + ahead] === chunk[pos + length] && ahead < RLE_MIN) ahead++;
          if (ahead >= RLE_MIN) break;
          length++;
        }
        if (length === 0) length = Math.min(take, 0xFFFF);
        pushRecord(out, start + pos, length, 0, 0, chunk.slice(pos, pos + length));
        pos += length;
      }
    }
    'EOF'.split('').forEach(function (ch) { out.push(ch.charCodeAt(0)); });
    return { bytes: new Uint8Array(out), records: list.length, skipped: skipped, largest: list.length ? list[list.length - 1].offset : 0 };
  }

  function pushRecord(out, offset, length, run, value, data) {
    out.push((offset >> 16) & 0xFF, (offset >> 8) & 0xFF, offset & 0xFF);
    out.push((length >> 8) & 0xFF, length & 0xFF);
    if (length === 0) {
      out.push((run >> 8) & 0xFF, run & 0xFF, value & 0xFF);
      return;
    }
    for (var i = 0; i < data.length; i++) out.push(data[i] & 0xFF);
  }

  /* Reading one back, which is how the test proves the writer is right and how the
     application can show what a patch would do before it is exported. */
  function parseIps(bytes) {
    if (!bytes || bytes.length < 8) return null;
    var text = function (at, len) {
      var s = '';
      for (var i = 0; i < len; i++) s += String.fromCharCode(bytes[at + i] & 0xFF);
      return s;
    };
    if (text(0, 5) !== 'PATCH') return null;
    var at = 5;
    var records = [];
    var truncated = false;
    while (at + 3 <= bytes.length) {
      if (text(at, 3) === 'EOF') { at += 3; break; }
      if (at + 5 > bytes.length) { truncated = true; break; }
      var offset = ((bytes[at] & 0xFF) << 16) | ((bytes[at + 1] & 0xFF) << 8) | (bytes[at + 2] & 0xFF);
      var length = ((bytes[at + 3] & 0xFF) << 8) | (bytes[at + 4] & 0xFF);
      at += 5;
      if (length === 0) {
        if (at + 3 > bytes.length) { truncated = true; break; }
        var run = ((bytes[at] & 0xFF) << 8) | (bytes[at + 1] & 0xFF);
        var value = bytes[at + 2] & 0xFF;
        at += 3;
        records.push({ offset: offset, run: run, value: value });
        continue;
      }
      if (at + length > bytes.length) { truncated = true; break; }
      var data = bytes.slice(at, at + length);
      at += length;
      records.push({ offset: offset, bytes: data });
    }
    return { records: records, truncated: truncated, size: at };
  }

  function applyIps(ips, original, options) {
    var opts = options || {};
    var parsed = parseIps(ips);
    if (!parsed) return null;
    var fill = opts.fill === undefined ? 0x00 : opts.fill & 0xFF;
    var end = original ? original.length : 0;
    parsed.records.forEach(function (r) {
      var size = r.run ? r.run : r.bytes.length;
      if (r.offset + size > end) end = r.offset + size;
    });
    var out = new Uint8Array(end);
    if (original) out.set(original); else out.fill(fill);
    if (original && fill !== 0x00) for (var i = original.length; i < end; i++) out[i] = fill;
    parsed.records.forEach(function (r) {
      if (r.run) {
        for (var k = 0; k < r.run; k++) out[r.offset + k] = r.value;
        return;
      }
      out.set(r.bytes, r.offset);
    });
    return out;
  }

  /* The changes between two images, which is what a patch is made of. */
  function diffBytes(before, after, options) {
    var opts = options || {};
    var changes = [];
    var max = Math.max(before ? before.length : 0, after ? after.length : 0);
    var run = null;
    var gap = opts.gap === undefined ? 8 : Number(opts.gap);
    for (var i = 0; i < max; i++) {
      var a = before && i < before.length ? before[i] & 0xFF : -1;
      var b = after && i < after.length ? after[i] & 0xFF : -1;
      if (a === b) continue;
      if (run && i - run.end <= gap) {
        // close enough to keep in the same record, filling the gap
        for (var g = run.end; g < i; g++) run.bytes.push(after[g] & 0xFF);
        run.bytes.push(b & 0xFF);
        run.end = i + 1;
        continue;
      }
      if (run) changes.push(run);
      run = { offset: i, bytes: [b & 0xFF], end: i + 1 };
    }
    if (run) changes.push(run);
    return changes;
  }

  K.core.MAX_IPS_OFFSET = MAX_OFFSET;
  K.core.buildIps = buildIps;
  K.core.parseIps = parseIps;
  K.core.applyIps = applyIps;
  K.core.diffBytes = diffBytes;
})(window);