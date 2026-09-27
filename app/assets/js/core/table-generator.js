/* ============================================================
   Ketor -- Table Generator (.tbl)
   ------------------------------------------------------------
   Generates .tbl files from relative search results.

   Format (Data Crystal standard):
   - UTF-8 encoded
   - Each line: HEX=string
   - Big-endian for multi-byte entries
   - Blank lines ignored, # at line start = comment
   - Control codes:
     *HEX     = newline
     \HEX     = end-of-text
     \HEX=[label] = end-of-text with label
     (HEXh)Title  = bookmark

   Reference:
   https://datacrystal.tcrf.net/wiki/Table_file
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  /**
   * Auto-detect control bytes (line break, end-of-text) by scanning
   * around a known text offset.
   * @param {Uint8Array} rom
   * @param {number} offset - Known text offset
   * @param {Set<number>} printableBytes - Set of bytes that map to printable chars
   * @param {Object} options
   * @returns {{lineByte: number, endByte: number}}
   */
  function detectControlBytes(rom, offset, printableBytes, options) {
    var opts = options || {};
    var scanRadius = opts.scanRadius || 0x4000;
    var charWidth = opts.charWidth || 1;

    var start = Math.max(0, offset - scanRadius);
    var end = Math.min(rom.length - 2, offset + scanRadius);

    var lineCandidates = [0x0A, 0x0D, 0x06, 0xFE];
    var endCandidates = [0x00, 0xFF, 0xFE];

    var scoreLine = function (byteVal) {
      var score = 0;
      for (var i = start + charWidth; i <= end; i += charWidth) {
        if (rom[i] !== byteVal) continue;
        var prev = rom[i - charWidth];
        var next = rom[i + charWidth];
        if (printableBytes.has(next)) score += 3;
        if (printableBytes.has(prev)) score += 1;
        if (next === 0x00) score -= 1;
      }
      return score;
    };

    var scoreEnd = function (byteVal) {
      var score = 0;
      for (var i = start; i <= end; i += charWidth) {
        if (rom[i] !== byteVal) continue;
        var next = rom[i + charWidth];
        if (!printableBytes.has(next)) score += 2;
        if (next === 0x00) score += 1;
      }
      return score;
    };

    var bestLine = lineCandidates[0];
    var bestLineScore = -Infinity;
    for (var lc = 0; lc < lineCandidates.length; lc++) {
      var s = scoreLine(lineCandidates[lc]);
      if (s > bestLineScore) { bestLineScore = s; bestLine = lineCandidates[lc]; }
    }

    var bestEnd = endCandidates[0];
    var bestEndScore = -Infinity;
    for (var ec = 0; ec < endCandidates.length; ec++) {
      var s2 = scoreEnd(endCandidates[ec]);
      if (s2 > bestEndScore) { bestEndScore = s2; bestEnd = endCandidates[ec]; }
    }

    if (bestLine === bestEnd) {
      bestLine = (bestLine === 0x0A) ? 0x06 : bestLine;
      if (bestLine === bestEnd) bestEnd = (bestEnd === 0x00) ? 0xFF : 0x00;
    }

    return { lineByte: bestLine, endByte: bestEnd };
  }

  /**
   * Format a byte value as hex key, respecting padding mode.
   * @param {number} byteVal
   * @param {string} paddingMode - 'none' | 'le' | 'be'
   * @returns {string}
   */
  function formatByteKey(byteVal, paddingMode) {
    var hex = (byteVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    if (paddingMode === 'le') return hex + '00';
    if (paddingMode === 'be') return '00' + hex;
    return hex;
  }

  /**
   * Generate a complete .tbl content string.
   * @param {Object} config
   * @param {number} config.offsetGuess
   * @param {string} config.charset
   * @param {string} config.paddingMode - 'none' | 'le' | 'be'
   * @param {number} config.lineByte
   * @param {number} config.endByte
   * @param {Object} [config.extraEntries] - Map of hex→char to add
   * @returns {string}
   */
  function generateTableContent(config) {
    var offsetGuess = Number(config.offsetGuess) || 0;
    var charset = config.charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var paddingMode = config.paddingMode || 'none';
    var lineByte = Number(config.lineByte);
    var endByte = Number(config.endByte);
    var extraEntries = config.extraEntries || {};

    var lines = [];
    lines.push('# Ketor generated table');
    lines.push('# Charset: ' + charset);
    lines.push('# Offset guess: ' + offsetGuess);
    lines.push('# Padding: ' + paddingMode);
    lines.push('');

    var controlLines = [];
    if (Number.isFinite(lineByte)) {
      controlLines.push('*' + formatByteKey(lineByte, paddingMode));
    }
    if (Number.isFinite(endByte)) {
      controlLines.push('\\' + formatByteKey(endByte, paddingMode));
    }
    if (controlLines.length > 0) {
      lines.push('# Control codes');
      lines = lines.concat(controlLines);
      lines.push('');
    }

    lines.push('# Character entries');
    for (var i = 0; i < charset.length; i++) {
      var byteVal = (offsetGuess + i) & 0xFF;
      var key = formatByteKey(byteVal, paddingMode);
      var ch = charset[i];
      if (ch === ' ') ch = '[SPACE]';
      lines.push(key + '=' + ch);
    }

    var extraKeys = Object.keys(extraEntries);
    if (extraKeys.length > 0) {
      lines.push('');
      lines.push('# Extra entries');
      for (var k = 0; k < extraKeys.length; k++) {
        lines.push(extraKeys[k] + '=' + extraEntries[extraKeys[k]]);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse a .tbl content into single/multi byte maps.
   * @param {string} content
   * @returns {{singleByte: Object, multiByte: Object, entryCount: number}}
   */
  function parseTableContent(content) {
    var lines = String(content || '').replace(/\r/g, '').split('\n');
    var singleByte = {};
    var multiByte = {};
    var entryCount = 0;

    for (var i = 0; i < lines.length; i++) {
      var rawLine = lines[i];
      if (!rawLine) continue;
      var trimmed = rawLine.trim();
      if (!trimmed || trimmed.charAt(0) === '#' || trimmed.charAt(0) === ';') continue;

      var isLine = false;
      var isEnd = false;
      var line = rawLine;

      if (line.charAt(0) === '*') { isLine = true; line = line.substring(1); }
      else if (line.charAt(0) === '\\') { isEnd = true; line = line.substring(1); }

      var eq = line.indexOf('=');
      var hexStr, char;
      if (eq < 0) {
        if (!isLine && !isEnd) continue;
        hexStr = line.replace(/\s+/g, '').toUpperCase();
        char = isLine ? '[LINE]' : '[END]';
      } else {
        hexStr = line.substring(0, eq).replace(/\s+/g, '').toUpperCase();
        char = line.substring(eq + 1);
      }

      if (!/^[0-9A-F]+$/.test(hexStr) || hexStr.length % 2 !== 0) continue;

      if (isLine) char = '[LINE]';
      if (isEnd) {
        var endLabel = char.trim();
        char = (endLabel && endLabel.charAt(0) === '[') ? endLabel : '[END]';
      }

      if (char.length === 0 && hexStr.match(/^0+$/)) char = '[END]';
      if (char.toUpperCase() === '[SPACE]') char = ' ';

      var byteLen = hexStr.length / 2;
      if (byteLen === 1) singleByte[parseInt(hexStr, 16)] = char;
      else multiByte[hexStr] = char;
      entryCount++;
    }

    return { singleByte: singleByte, multiByte: multiByte, entryCount: entryCount };
  }


})(window);