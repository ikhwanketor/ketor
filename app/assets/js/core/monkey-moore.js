/* ============================================================
   Ketor - Monkey-Moore Core Algorithm (faithful port)
   ------------------------------------------------------------
   Direct port of Monkey-Moore v1.1.0 (rjricken).
   Modes: simple_relative, wildcard_relative, value_scan.
   Preview uses '#' for unknown bytes, 50-char window, match
   centered. Case change auto-detects wildcard mode.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var PREVIEW_WIDTH = 50;

  function isUpper(cp) { return cp >= 65 && cp <= 90; }
  function isLower(cp) { return cp >= 97 && cp <= 122; }

  function keywordToCodepoints(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
    return out;
  }

  function computeRelativeValues(codepoints) {
    var d = [];
    for (var i = 1; i < codepoints.length; i++) {
      d.push(codepoints[i] - codepoints[i - 1]);
    }
    return d;
  }

  // Read value from data at given "character" position.
  // data: Uint8Array. charWidth: 1 or 2. little: bool.
  function readChar(data, index, charWidth, little) {
    if (charWidth === 1) return data[index];
    var a = data[index * 2];
    var b = data[index * 2 + 1];
    if (a === undefined || b === undefined) return -1;
    return little ? (a | (b << 8)) : ((a << 8) | b);
  }

  function dataCharCount(data, charWidth) {
    return Math.floor(data.length / charWidth);
  }

  // Detect search mode from keyword
  function detectMode(codepoints, wildcardCp) {
    var hasWildcard = false;
    var hasUpper = false, hasLower = false;
    for (var i = 0; i < codepoints.length; i++) {
      if (wildcardCp && codepoints[i] === wildcardCp) hasWildcard = true;
      if (isUpper(codepoints[i])) hasUpper = true;
      if (isLower(codepoints[i])) hasLower = true;
    }
    if (hasWildcard || (hasUpper && hasLower)) return 'wildcard_relative';
    return 'simple_relative';
  }

  // ---- Simple relative search (no wildcards) ----
  function searchSimple(data, codepoints, charWidth, little, maxHits) {
    var count = dataCharCount(data, charWidth);
    var n = codepoints.length;
    if (n < 2 || count < n) return [];

    var diffs = computeRelativeValues(codepoints);
    var m = diffs.length;

    // Build skip table (delta -255..255 → index 0..510)
    var skip = new Int32Array(512);
    for (var i = 0; i < 512; i++) skip[i] = m;
    for (var i = 0; i < m - 1; i++) {
      var d = diffs[i];
      if (d < -255 || d > 255) continue;
      skip[d + 255] = m - 1 - i;
    }

    var results = [];
    var i = 0;
    var limit = count - n;
    while (i <= limit) {
      var j = m - 1;
      var ok = true;
      while (j >= 0) {
        var cur = readChar(data, i + j + 1, charWidth, little);
        var prev = readChar(data, i + j, charWidth, little);
        if (cur < 0 || prev < 0) { ok = false; break; }
        var delta = cur - prev;
        if (delta !== diffs[j]) { ok = false; break; }
        j--;
      }
      if (ok) {
        // Match at position i
        var anchorVal = readChar(data, i, charWidth, little);
        // values_map: anchor char -> value
        var values = {};
        values[String.fromCharCode(codepoints[0])] = anchorVal;
        results.push({ position: i, values: values });
        i += n;
        if (results.length >= maxHits) break;
      } else {
        /* Boyer-Moore shift. The skip table is built for the delta aligned with
           the last pattern delta, so that is the one the shift has to be read
           from. Reading it from the position that happened to mismatch is what
           let a clean sample with a single occurrence in the rom be skipped
           over: the scan jumped past the one window that would have matched. */
        var cur2 = readChar(data, i + m, charWidth, little);
        var prev2 = readChar(data, i + m - 1, charWidth, little);
        var shift = m;
        if (cur2 >= 0 && prev2 >= 0) {
          var d2 = cur2 - prev2;
          if (d2 >= -255 && d2 <= 255) {
            shift = skip[d2 + 255];
            if (shift < 1) shift = 1;
          }
        }
        i += shift;
      }
    }
    return results;
  }

  // ---- Wildcard relative search ----
  // Wildcard positions in keyword are ignored (any value accepted).
  // Case change also goes here: we can't know exact value, so we
  // match relative deltas only between literal (non-wildcard) runs.
  function searchWildcard(data, codepoints, wildcardCp, charWidth, little, maxHits) {
    var count = dataCharCount(data, charWidth);
    var n = codepoints.length;
    if (n < 2 || count < n) return [];

    // Build "literal" positions (indexes in keyword) that are not wildcards.
    var literalIdx = [];
    for (var i = 0; i < n; i++) {
      if (wildcardCp && codepoints[i] === wildcardCp) continue;
      literalIdx.push(i);
    }
    if (literalIdx.length < 2) return [];

    // Deltas between consecutive literal positions only.
    var litDeltas = [];
    for (var k = 1; k < literalIdx.length; k++) {
      litDeltas.push({
        fromIdx: literalIdx[k - 1],
        toIdx: literalIdx[k],
        expected: codepoints[literalIdx[k]] - codepoints[literalIdx[k - 1]],
        span: literalIdx[k] - literalIdx[k - 1]
      });
    }

    // Scan
    var results = [];
    var step = 1;
    var limit = count - n;
    for (var start = 0; start <= limit; start += step) {
      var ok = true;
      for (var d = 0; d < litDeltas.length; d++) {
        var ld = litDeltas[d];
        var v1 = readChar(data, start + ld.fromIdx, charWidth, little);
        var v2 = readChar(data, start + ld.toIdx, charWidth, little);
        if (v1 < 0 || v2 < 0) { ok = false; break; }
        if ((v2 - v1) !== ld.expected) { ok = false; break; }
      }
      if (!ok) continue;
      var anchor = readChar(data, start + literalIdx[0], charWidth, little);
      if (anchor < 0) continue;
      // Build values map: for each distinct literal char, derive value.
      var first = codepoints[literalIdx[0]];
      var values = {};
      var seen = {};
      for (var q = 0; q < literalIdx.length; q++) {
        var idx = literalIdx[q];
        var ch = codepoints[idx];
        if (seen[ch]) continue;
        seen[ch] = true;
        var val = readChar(data, start + idx, charWidth, little);
        if (val >= 0) values[String.fromCharCode(ch)] = val;
      }
      // Also emit A= and a= bases for display (case change)
      var baseA = null, basea = null;
      for (var key in values) {
        var cp = key.charCodeAt(0);
        if (isUpper(cp) && baseA === null) baseA = values[key] - (cp - 65);
        if (isLower(cp) && basea === null) basea = values[key] - (cp - 97);
      }
      var displayValues = {};
      if (baseA !== null) displayValues['A'] = baseA & 0xFF;
      if (basea !== null) displayValues['a'] = basea & 0xFF;
      if (Object.keys(displayValues).length === 0) displayValues = values;
      results.push({ position: start, values: displayValues });
      if (results.length >= maxHits) break;
    }
    return results;
  }

  // ---- Value scan ----
  // reference_values: array of numeric byte values (user provided).
  // We derive relative deltas and match raw numeric sequence ignoring
  // the actual anchor value.
  function searchValueScan(data, refValues, charWidth, little, maxHits) {
    var count = dataCharCount(data, charWidth);
    var n = refValues.length;
    if (n < 2 || count < n) return [];
    var diffs = computeRelativeValues(refValues);
    var m = diffs.length;
    var results = [];
    var limit = count - n;
    for (var i = 0; i <= limit; i++) {
      var ok = true;
      for (var j = 0; j < m; j++) {
        var v1 = readChar(data, i + j, charWidth, little);
        var v2 = readChar(data, i + j + 1, charWidth, little);
        if (v1 < 0 || v2 < 0) { ok = false; break; }
        if ((v2 - v1) !== diffs[j]) { ok = false; break; }
      }
      if (ok) {
        results.push({ position: i, values: {} });
        if (results.length >= maxHits) break;
      }
    }
    return results;
  }

  // ---- Preview generation ----
  // data: Uint8Array, matchPos in char index, values_map: {char: value}
  function generatePreview(data, matchPos, codepoints, values, charWidth, little) {
    var count = dataCharCount(data, charWidth);
    var kwLen = codepoints.length;
    var kwHalf = Math.floor(kwLen / 2);
    var winHalf = Math.floor(PREVIEW_WIDTH / 2);
    var back = winHalf - kwHalf;
    var start = matchPos - back;
    if (start < 0) start = 0;
    var end = start + PREVIEW_WIDTH;
    if (end > count) {
      end = count;
      start = Math.max(0, end - PREVIEW_WIDTH);
    }

    // Build decoding map
    var isAsciiSearch = true;
    var decoding = {};
    for (var key in values) {
      var ch = key;
      var val = values[key];
      var cp = ch.charCodeAt(0);
      if (isAsciiSearch && (cp === 65 || cp === 97)) {
        for (var lo = 0; lo < 26; lo++) {
          decoding[val + lo] = String.fromCharCode(cp + lo);
        }
      } else {
        decoding[val] = ch;
      }
    }

    var out = '';
    for (var i = start; i < end; i++) {
      var v = readChar(data, i, charWidth, little);
      if (v < 0) { out += '#'; continue; }
      var dec = decoding[v];
      if (dec !== undefined) out += dec;
      else out += '#';
    }
    return out;
  }

  // ---- Public API ----
  function runSearch(romBytes, options) {
    var opts = options || {};
    var mode = opts.mode || 'relative';
    var keyword = String(opts.keyword || '');
    var wildcardChar = String(opts.wildcardChar || '*');
    var wildcardEnabled = opts.wildcardEnabled === true;
    var charWidth = opts.byteWidth === 16 ? 2 : 1;
    var little = opts.endianness !== 'big';
    var maxHits = Math.max(1, Number(opts.maxResults) || 200);

    var data = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes || []);

    var matches;
    var codepoints = [];
    if (mode === 'value-scan') {
      // Parse keyword as numeric list (space or comma separated)
      var nums = keyword.split(/[\s,]+/).filter(Boolean).map(function (s) {
        var n = parseInt(s.replace(/^0x/i, ''), 16);
        return isNaN(n) ? parseInt(s, 10) : n;
      }).filter(function (n) { return Number.isFinite(n); });
      if (nums.length < 2) return { results: [], previewWidth: PREVIEW_WIDTH };
      matches = searchValueScan(data, nums, charWidth, little, maxHits);
      codepoints = nums;
    } else {
      codepoints = keywordToCodepoints(keyword);
      if (codepoints.length < 2) return { results: [], previewWidth: PREVIEW_WIDTH };
      var wildcardCp = wildcardEnabled && wildcardChar.length > 0
        ? wildcardChar.charCodeAt(0) : 0;
      var detected = detectMode(codepoints, wildcardCp);
      if (detected === 'wildcard_relative') {
        matches = searchWildcard(data, codepoints, wildcardCp, charWidth, little, maxHits);
      } else {
        matches = searchSimple(data, codepoints, charWidth, little, maxHits);
      }
    }

    // Convert to results with offset + valuesLabel + preview
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var offset = m.position * charWidth;
      var preview = generatePreview(data, m.position, codepoints, m.values, charWidth, little);
      // Values label
      var keys = Object.keys(m.values);
      keys.sort();
      var valuesLabel = keys.map(function (k) {
        var h = (m.values[k] & 0xFF).toString(16).toUpperCase();
        if (h.length < 2) h = '0' + h;
        /* A two byte character is shown as the code the game stores, padding and
           all, so the label can be read against the table it becomes. */
        if (charWidth === 2) h = little ? h + '00' : '00' + h;
        return k + '=' + h;
      }).join(' ');
      out.push({
        offset: offset,
        values: m.values,
        valuesLabel: valuesLabel,
        preview: preview
      });
    }
    return { results: out, previewWidth: PREVIEW_WIDTH };
  }

  K.core.runMonkeyMoore = runSearch;

})(window);