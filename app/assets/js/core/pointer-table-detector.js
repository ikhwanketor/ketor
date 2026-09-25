(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};
  var K = Ketor;

  /* ------------------------------------------------------------------
     Pointer table detector - the user only maps text in Search Text.

     Those offsets are enough to find the table that indexes them, so the
     app never has to guess a pointer again:

       1. one pass over the rom builds a map from every word value to the
          places it appears (4 and 2 byte, both endiannesses),
       2. a mapped text offset o is matched by a word whose value is
          base + o + delta for a small delta (the record header sits in
          front of the text), for each console base,
       3. matching sites on a constant stride form a table hypothesis,
       4. the hypothesis survives only when the records it describes look
          like records: entries ascending, each span ending with the
          console's terminator plus padding, spans covering one region,
          and the targets matching the mapped text offsets.

     Step 4 is what makes it trustworthy. A wrong table cannot satisfy the
     record structure, so the detector reports nothing instead of something
     wrong, and the app can ask the user to confirm one line. */
  function readValue(bytes, at, size, little) {
    if (at < 0 || at + size > bytes.length) return -1;
    var v = 0;
    if (little) { for (var i = size - 1; i >= 0; i--) v = (v * 256) + bytes[at + i]; }
    else { for (var j = 0; j < size; j++) v = (v * 256) + bytes[at + j]; }
    return v >>> 0;
  }

  var DEFAULT_BASES = [0x08000000, 0x02000000, 0x8000, 0x4000, 0x2000, 0];

  function valueMap(bytes, size, little) {
    var map = Object.create(null);
    for (var at = 0; at + size <= bytes.length; at += 2) {
      var v = readValue(bytes, at, size, little);
      var list = map[v];
      if (list) { if (list.length < 64) list.push(at); } else { map[v] = [at]; }
    }
    return map;
  }

  function detect(bytes, options) {
    var opts = options || {};
    var texts = (opts.textOffsets || []).filter(function (o) { return Number.isFinite(o) && o >= 0 && o < bytes.length; });
    if (texts.length < 3 || bytes.length < 64) return [];
    var term = (opts.terminator && opts.terminator.length) ? opts.terminator : [0x00];
    var termSet = Object.create(null);
    term.forEach(function (c) { termSet[c & 0xFF] = true; });
    var bases = opts.bases || DEFAULT_BASES;
    var sizes = opts.entrySize ? [opts.entrySize] : [4, 2];
    var orders = opts.endianness ? [opts.endianness] : ['little', 'big'];
    var deltaWindow = Number.isFinite(opts.deltaWindow) ? opts.deltaWindow : 4;
    var textSet = Object.create(null);
    texts.forEach(function (o) { textSet[o] = true; });

    /* is this offset the start of a record the game can read? */
    var looksLikeRecord = function (target) {
      if (textSet[target] || textSet[target + 2]) return true;
      if (target + 4 > bytes.length) return false;
      return false;
    };
    var spanIsRecord = function (from, to) {
      if (to <= from || to > bytes.length) return false;
      var seenEnd = -1;
      for (var p = to - 1; p >= from; p--) { if (termSet[bytes[p]]) { seenEnd = p; break; } }
      if (seenEnd < 0) return false;
      var zeros = 0;
      for (var z = to - 1; z >= from && bytes[z] === 0x00; z--) zeros++;
      return zeros >= 1;
    };

    var found = [];
    sizes.forEach(function (size) {
      orders.forEach(function (order) {
        var little = order === 'little';
        var map = valueMap(bytes, size, little);
        bases.forEach(function (base) {
          /* sites whose word addresses a mapped text, with the header delta */
          var hits = [];
          texts.forEach(function (o) {
            for (var d = -deltaWindow; d <= deltaWindow; d++) {
              var v = base + o + d;
              if (v < 0 || v > 0xFFFFFFFF) continue;
              var list = map[v];
              if (!list) continue;
              for (var i = 0; i < list.length; i++) hits.push({ at: list[i], target: o + d, delta: d });
              break;
            }
          });
          if (hits.length < 3) return;
          hits.sort(function (a, b) { return a.at - b.at; });
          var strides = Object.create(null);
          for (var h = 1; h < hits.length; h++) {
            var s = hits[h].at - hits[h - 1].at;
            if (s > 0 && s <= 64) strides[s] = (strides[s] || 0) + 1;
          }
          Object.keys(strides).forEach(function (key) {
            var stride = Number(key);
            if (strides[key] < 2) return;
            var best = null;
            for (var i = 0; i < hits.length; i++) {
              var run = [hits[i]];
              var j = i + 1;
              while (j < hits.length && hits[j].at - run[run.length - 1].at === stride) { run.push(hits[j]); j++; }
              if (run.length >= 3 && (!best || run.length > best.length)) best = run;
            }
            if (!best) return;
            var anchor = best[0];
            var targetAt = function (at) {
              var v = readValue(bytes, at, size, little);
              if (v < 0 || v < base) return -1;
              var off = v - base;
              return (off >= 0 && off < bytes.length) ? off : -1;
            };
            /* extend only over spans that really look like records */
            var lo = anchor.at;
            while (lo - stride >= 0) {
              var prev = targetAt(lo - stride), cur = targetAt(lo);
              if (prev < 0 || cur < 0 || prev >= cur) break;
              if (!spanIsRecord(prev, cur)) break;
              if (!looksLikeRecord(prev)) break;
              lo -= stride;
            }
            var hi = lo;
            var okSpans = 0, badSpans = 0;
            while (hi + stride + size <= bytes.length) {
              var a = targetAt(hi), b = targetAt(hi + stride);
              if (a < 0 || b < 0 || b <= a) break;
              if (!spanIsRecord(a, b)) break;
              okSpans++;
              hi += stride;
            }
            var entryCount = okSpans + 1;
            if (entryCount < 8) return;
            var entries = [];
            for (var e = 0, at = lo; e < entryCount; e++, at += stride) entries.push(targetAt(at));
            var regionStart = entries[0];
            var regionEnd = entries[entries.length - 1];
            var entrySet = Object.create(null);
            entries.forEach(function (t) { if (t >= 0) entrySet[t] = true; });
            var matched = 0, deltas = Object.create(null);
            texts.forEach(function (o) {
              for (var d = -deltaWindow; d <= deltaWindow; d++) {
                if (entrySet[o + d]) { matched++; deltas[d] = (deltas[d] || 0) + 1; break; }
              }
            });
            var ratio = okSpans / Math.max(1, okSpans + badSpans);
            if (ratio < 0.98) return;
            if (matched < Math.min(3, texts.length)) return;
            found.push({
              at: lo, stride: stride, entrySize: size, endianness: order, base: base,
              count: entryCount, regionStart: regionStart, regionEnd: regionEnd,
              spansOk: okSpans, spansBad: badSpans, matchedTexts: matched, textsGiven: texts.length,
              deltas: deltas,
              score: ratio * 0.5 + Math.min(1, matched / Math.max(1, Math.min(texts.length, 64))) * 0.5
            });
          });
        });
      });
    });
    /* Sparse mappings start the walk somewhere in the middle of the table, so the
       same table shows up several times with different starts. Hypotheses that
       share the shape and the same stride phase are one table: merge them, then
       walk the whole range once and keep it only when every span is a record.
       This is what turns "a table around my texts" into "the table". */
    var groups = [];
    found.forEach(function (r) {
      var g = null;
      for (var i = 0; i < groups.length; i++) {
        var cand = groups[i];
        if (cand.entrySize !== r.entrySize || cand.endianness !== r.endianness) continue;
        if (cand.base !== r.base || cand.stride !== r.stride) continue;
        if (((cand.at - r.at) % r.stride) !== 0) continue;
        var lo = Math.min(cand.at, r.at);
        var hiA = cand.at + (cand.count - 1) * cand.stride;
        var hiB = r.at + (r.count - 1) * r.stride;
        var hi = Math.max(hiA, hiB);
        if (lo > Math.min(cand.at + (cand.count - 1) * cand.stride, hiB) + r.stride * 4) continue;
        cand.at = lo;
        cand.count = Math.floor((hi - lo) / cand.stride) + 1;
        cand.matchedTexts = Math.max(cand.matchedTexts, r.matchedTexts);
        g = cand;
        break;
      }
      if (!g) {
        groups.push({ at: r.at, stride: r.stride, entrySize: r.entrySize, endianness: r.endianness, base: r.base, count: r.count, matchedTexts: r.matchedTexts, textsGiven: r.textsGiven, deltas: r.deltas });
      }
    });
    var merged = [];
    groups.forEach(function (g) {
      var little = g.endianness !== 'big';
      var targetAt = function (at) {
        var v = readValue(bytes, at, g.entrySize, little);
        if (v < 0 || v < g.base) return -1;
        var off = v - g.base;
        return (off >= 0 && off < bytes.length) ? off : -1;
      };
      /* walk down to the first entry that is not part of the same table */
      var lo = g.at;
      while (lo - g.stride >= 0) {
        var prev = targetAt(lo - g.stride), cur = targetAt(lo);
        if (prev < 0 || cur < 0 || prev >= cur || !spanIsRecord(prev, cur)) break;
        lo -= g.stride;
      }
      /* and up to the last one */
      var hi = g.at + (g.count - 1) * g.stride;
      var ok = 0, bad = 0;
      var at = lo;
      var entries = [];
      while (at + g.stride + g.entrySize <= bytes.length) {
        var a = targetAt(at), b = targetAt(at + g.stride);
        if (a < 0 || b < 0 || b <= a) break;
        if (!spanIsRecord(a, b)) break;
        entries.push(a);
        ok++;
        at += g.stride;
      }
      var lastTarget = targetAt(at);
      if (lastTarget >= 0) entries.push(lastTarget);
      if (entries.length < 8) return;
      var entrySet = Object.create(null);
      entries.forEach(function (t) { if (t >= 0) entrySet[t] = true; });
      var matched = 0, deltas = Object.create(null);
      texts.forEach(function (o) {
        for (var d = -deltaWindow; d <= deltaWindow; d++) {
          if (entrySet[o + d]) { matched++; deltas[d] = (deltas[d] || 0) + 1; break; }
        }
      });
      var ratio = ok / Math.max(1, ok + bad);
      merged.push({
        at: lo, stride: g.stride, entrySize: g.entrySize, endianness: g.endianness, base: g.base,
        count: entries.length, regionStart: entries[0], regionEnd: entries[entries.length - 1],
        spansOk: ok, spansBad: bad, matchedTexts: matched, textsGiven: texts.length, deltas: deltas,
        score: ratio * 0.5 + Math.min(1, matched / Math.max(1, Math.min(texts.length, 64))) * 0.5
      });
    });
    merged.sort(function (a, b) { return b.score - a.score || b.count - a.count; });
    var out = [], seen = Object.create(null);
    merged.forEach(function (r) {
      var k = r.at + '|' + r.entrySize + '|' + r.base;
      if (seen[k]) return;
      seen[k] = true;
      out.push(r);
    });
    return out.slice(0, Number(opts.maxResults) || 6);
  }

  K.core.detectPointerTables = detect;
  K.core.readPointerTable = function (bytes, table, index) {
    if (!bytes || !table) return -1;
    var v = readValue(bytes, table.at + index * table.stride, table.entrySize, table.endianness !== 'big');
    if (v < table.base) return -1;
    var off = v - table.base;
    return off < bytes.length ? off : -1;
  };
})(typeof window !== 'undefined' ? window : this);