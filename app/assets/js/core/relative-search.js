/* ============================================================
   Ketor -- Relative Search (Monkey-Moore compatible)
   ------------------------------------------------------------
   Implements Boyer-Moore relative search with:
   - Bad-character shift table for fast scanning
   - Relative pattern (delta between consecutive chars)
   - 8-bit and 16-bit character width support
   - Endianness selector (big / little)
   - Custom charset (Japanese kana/kanji, etc.)
   - Wildcard support (* = any character)
   - Value scan (raw numerical sequences)
   - Uppercase/lowercase auto-detection

   Reference: Monkey-Moore v1.1.0 by Darkl0rd
   https://github.com/rjricken/monkey-moore
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  var DEFAULT_CHARSET_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var DEFAULT_CHARSET_LOWER = 'abcdefghijklmnopqrstuvwxyz';
  var DEFAULT_CHARSET_DIGITS = '0123456789';
  var DEFAULT_CHARSET_FULL = DEFAULT_CHARSET_UPPER + DEFAULT_CHARSET_LOWER + DEFAULT_CHARSET_DIGITS;

  /**
   * Compute relative pattern (deltas) from a character string.
   * Returns array of signed deltas between consecutive characters.
   * @param {string} text
   * @param {string} charset
   * @returns {number[]|null}
   */
  function computeRelativePattern(text, charset) {
    var cs = charset || DEFAULT_CHARSET_UPPER;
    var indices = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var idx = cs.indexOf(ch);
      if (idx < 0) idx = cs.indexOf(ch.toUpperCase());
      if (idx < 0) idx = cs.indexOf(ch.toLowerCase());
      if (idx < 0) return null;
      indices.push(idx);
    }
    if (indices.length < 2) return null;
    var pattern = [];
    for (var j = 1; j < indices.length; j++) {
      pattern.push(indices[j] - indices[j - 1]);
    }
    return pattern;
  }

  /**
   * Build Boyer-Moore bad-character shift table for a delta pattern.
   * @param {number[]} pattern - Array of signed deltas
   * @returns {Object} shift table mapping delta value (as string key) to shift
   */
  function buildBadCharTable(pattern) {
    var table = {};
    var m = pattern.length;
    for (var i = 0; i < m; i++) {
      table[String(pattern[i])] = m - i - 1;
    }
    return table;
  }

  /**
   * Boyer-Moore relative search over a byte array.
   * @param {Uint8Array} data
   * @param {number[]} pattern - Relative deltas
   * @param {Object} options - { maxHits, charWidth, endianness }
   * @returns {number[]} - Array of hit offsets
   */
  function boyerMooreRelative(data, pattern, options) {
    var opts = options || {};
    var maxHits = opts.maxHits || 500;
    var charWidth = opts.charWidth || 1;
    var isLittle = opts.endianness !== 'big';
    var m = pattern.length;
    var n = data.length;
    var hits = [];

    if (m === 0 || n < (m + 1) * charWidth) return hits;

    var badChar = buildBadCharTable(pattern);
    var end = n - (m + 1) * charWidth;

    var readChar = function (offset) {
      if (charWidth === 1) return data[offset];
      if (isLittle) return data[offset] | (data[offset + 1] << 8);
      return (data[offset] << 8) | data[offset + 1];
    };

    var i = 0;
    while (i <= end) {
      var j = m - 1;
      while (j >= 0) {
        var curOff = i + (j + 1) * charWidth;
        var prevOff = i + j * charWidth;
        var delta = (readChar(curOff) - readChar(prevOff)) & 0xFFFF;
        if (delta > 0x7FFF) delta -= 0x10000;
        if (delta !== pattern[j]) break;
        j--;
      }
      if (j < 0) {
        hits.push(i);
        if (hits.length >= maxHits) break;
        i += charWidth;
      } else {
        var curOff2 = i + (j + 1) * charWidth;
        var prevOff2 = i + j * charWidth;
        var delta2 = (readChar(curOff2) - readChar(prevOff2)) & 0xFFFF;
        if (delta2 > 0x7FFF) delta2 -= 0x10000;
        var shift = badChar[String(delta2)];
        if (!shift || shift < 1) shift = m;
        i += shift * charWidth;
      }
    }
    return hits;
  }

  /**
   * Main relative search entry point.
   * @param {Uint8Array} rom
   * @param {string} query
   * @param {Object} options
   * @returns {{results: Array, pattern: number[], charset: string}}
   */
  function relativeSearch(rom, query, options) {
    var opts = options || {};
    var charset = opts.charset || DEFAULT_CHARSET_UPPER;
    var maxResults = opts.maxResults || 200;
    var charWidth = opts.charWidth || 1;
    var endianness = opts.endianness || 'little';
    var caseSensitive = opts.caseSensitive === true;

    var patterns = [];

    var upperPattern = computeRelativePattern(query, charset);
    if (upperPattern) patterns.push({ pattern: upperPattern, charset: charset, queryText: query });

    if (!caseSensitive) {
      var lowerPattern = computeRelativePattern(query.toLowerCase(), charset.toLowerCase());
      if (lowerPattern && JSON.stringify(lowerPattern) !== JSON.stringify(upperPattern)) {
        patterns.push({ pattern: lowerPattern, charset: charset.toLowerCase(), queryText: query.toLowerCase() });
      }
    }

    var results = [];
    for (var p = 0; p < patterns.length; p++) {
      var entry = patterns[p];
      var hits = boyerMooreRelative(rom, entry.pattern, {
        maxHits: maxResults,
        charWidth: charWidth,
        endianness: endianness
      });
      for (var h = 0; h < hits.length; h++) {
        var offset = hits[h];
        var firstCharIdx = entry.charset.indexOf(entry.queryText[0]);
        if (firstCharIdx < 0) firstCharIdx = entry.charset.indexOf(entry.queryText[0].toUpperCase());
        if (firstCharIdx < 0) continue;
        var firstCharValue = charWidth === 1
          ? rom[offset]
          : (endianness === 'big' ? (rom[offset] << 8) | rom[offset + 1] : rom[offset] | (rom[offset + 1] << 8));
        var baseOffset = (firstCharValue - firstCharIdx);
        results.push({
          offset: offset,
          offsetGuess: baseOffset,
          mode: 'relative',
          charWidth: charWidth,
          endianness: endianness,
          charset: entry.charset,
          score: 1.0,
          source: 'monkey-moore-relative'
        });
      }
    }

    var seen = {};
    var deduped = results.filter(function (r) {
      var key = r.offset + ':' + r.offsetGuess + ':' + r.charWidth;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) { return a.offset - b.offset; });

    return {
      results: deduped.slice(0, maxResults),
      pattern: patterns.length > 0 ? patterns[0].pattern : [],
      charset: patterns.length > 0 ? patterns[0].charset : charset
    };
  }

  /**
   * Value scan relative: search raw numerical sequences.
   * @param {Uint8Array} rom
   * @param {number[]} values
   * @param {Object} options
   * @returns {Array}
   */
  function valueScanRelative(rom, values, options) {
    var opts = options || {};
    var maxResults = opts.maxResults || 200;
    var charWidth = opts.charWidth || 1;
    var endianness = opts.endianness || 'little';
    var isLittle = endianness !== 'big';

    if (!values || values.length < 2) return [];

    var deltas = [];
    for (var i = 1; i < values.length; i++) {
      deltas.push(values[i] - values[i - 1]);
    }

    var hits = boyerMooreRelative(rom, deltas, {
      maxHits: maxResults,
      charWidth: charWidth,
      endianness: endianness
    });

    var results = [];
    for (var h = 0; h < hits.length; h++) {
      var offset = hits[h];
      var firstValue = charWidth === 1
        ? rom[offset]
        : (isLittle ? rom[offset] | (rom[offset + 1] << 8) : (rom[offset] << 8) | rom[offset + 1]);
      results.push({
        offset: offset,
        offsetGuess: (values[0] - firstValue),
        mode: 'value-scan',
        charWidth: charWidth,
        endianness: endianness,
        score: 0.9,
        source: 'monkey-moore-value-scan'
      });
    }
    return results;
  }

  /**
   * Wildcard-aware relative search.
   * Wildcard character '*' in query matches any single character.
   * @param {Uint8Array} rom
   * @param {string} query
   * @param {Object} options
   * @returns {Array}
   */
  function wildcardRelativeSearch(rom, query, options) {
    var opts = options || {};
    var charset = opts.charset || DEFAULT_CHARSET_UPPER;
    var maxResults = opts.maxResults || 200;
    var charWidth = opts.charWidth || 1;
    var endianness = opts.endianness || 'little';
    var isLittle = endianness !== 'big';

    var knownIndices = [];
    var wildcardFlags = [];
    for (var i = 0; i < query.length; i++) {
      if (query[i] === '*') {
        knownIndices.push(0);
        wildcardFlags.push(true);
      } else {
        var idx = charset.indexOf(query[i]);
        if (idx < 0) idx = charset.indexOf(query[i].toUpperCase());
        if (idx < 0) return [];
        knownIndices.push(idx);
        wildcardFlags.push(false);
      }
    }

    if (knownIndices.length < 2) return [];

    var readChar = function (offset) {
      if (charWidth === 1) return rom[offset];
      if (isLittle) return rom[offset] | (rom[offset + 1] << 8);
      return (rom[offset] << 8) | rom[offset + 1];
    };

    var results = [];
    var maxStart = rom.length - knownIndices.length * charWidth;
    for (var start = 0; start <= maxStart; start += charWidth) {
      var baseGuess = null;
      var consistent = true;
      for (var k = 0; k < knownIndices.length; k++) {
        if (wildcardFlags[k]) continue;
        var v = readChar(start + k * charWidth);
        var guess = v - knownIndices[k];
        if (baseGuess === null) baseGuess = guess;
        else if (baseGuess !== guess) { consistent = false; break; }
      }
      if (consistent && baseGuess !== null) {
        results.push({
          offset: start,
          offsetGuess: baseGuess,
          mode: 'relative-wildcard',
          charWidth: charWidth,
          endianness: endianness,
          charset: charset,
          score: 0.85,
          source: 'monkey-moore-wildcard'
        });
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }


})(window);