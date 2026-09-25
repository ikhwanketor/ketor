/* ============================================================
   Ketor - Font codec (Batch 55)
   ------------------------------------------------------------
   A font is tiles plus an order. The tiles are the glyphs, already
   handled by the tile codec; the order is what makes them a font:
   which tile holds which character. Two facts give that order:

     - the .tbl table, which says which byte value means which
       character in the text of this game
     - the screen itself, which is the proof. If tile base + code
       really is the glyph of code, then reading a screen through
       that order spells words. If the base is wrong, it spells
       noise. So the base is found by trying them and judging the
       text, not by assuming ASCII.

   Everything here is a pure function of bytes, a layout and a
   table, so it can be tested without a canvas.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* character -> code, from the table the user loaded */
  function charCodes(tableData) {
    var out = {};
    if (!tableData) return out;
    if (tableData.singleByte) {
      Object.keys(tableData.singleByte).forEach(function (k) {
        var ch = String(tableData.singleByte[k] == null ? '' : tableData.singleByte[k]);
        if (ch.length === 1) out[ch] = parseInt(k, 10) & 0xFF;
      });
    }
    if (tableData.multiByte) {
      Object.keys(tableData.multiByte).forEach(function (h) {
        var ch = String(tableData.multiByte[h] == null ? '' : tableData.multiByte[h]);
        var parts = String(h).match(/.{1,2}/g);
        if (ch.length === 1 && parts && parts.length === 1) out[ch] = parseInt(parts[0], 16) & 0xFF;
      });
    }
    return out;
  }

  function codeChars(tableData) {
    var codes = charCodes(tableData);
    var out = {};
    Object.keys(codes).forEach(function (ch) { out[codes[ch]] = ch; });
    return out;
  }

  /* Reading a screen: every cell names a tile, and the font base says which tile
     holds code 0, so the character of a cell is its tile number minus the base. */
  function readTextFromMap(mapBytes, options) {
    var opts = options || {};
    var layout = opts.layout || 'gba-text';
    var base = Number(opts.base) || 0;
    var cells = Number(opts.cells) || 0;
    var cols = Number(opts.cols) || 32;
    var chars = opts.codeChars || {};
    var blank = opts.blank === undefined ? -1 : Number(opts.blank);
    var unknown = opts.unknown || '?';
    var rows = [];
    for (var row = 0; row < Math.ceil(cells / cols); row++) {
      var line = '';
      for (var col = 0; col < cols; col++) {
        var cell = row * cols + col;
        if (cell >= cells) break;
        var v = K.core.readMapEntry(mapBytes, cell * (K.core.mapLayout(layout).entryBytes), layout);
        var tile = K.core.entryTile(v, layout);
        if (tile === blank) { line += ' '; continue; }
        var code = tile - base;
        if (code < 0 || code > 0xFF) { line += unknown; continue; }
        line += chars[code] === undefined ? unknown : chars[code];
      }
      rows.push(line.replace(/ +$/, ''));
    }
    return { lines: rows, text: rows.join('\n') };
  }

  /* Does this read like text? Real text is mostly letters and digits, it has
     spaces, and it does not repeat one character for ever. */
  function scoreText(text) {
    var s = String(text || '');
    if (s.length < 16) return 0;
    var letters = 0, digits = 0, spaces = 0, known = 0, longest = 1, run = 1;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (/[A-Za-z]/.test(c)) { letters++; known++; }
      else if (/[0-9]/.test(c)) { digits++; known++; }
      else if (c === ' ') { spaces++; known++; }
      else if (c !== '\n') { /* punctuation and unknowns count as not known */ }
      if (i > 0 && c === s.charAt(i - 1)) { run++; if (run > longest) longest = run; } else run = 1;
    }
    var n = s.replace(/\n/g, '').length || 1;
    var knownRatio = known / n;
    var spaceRatio = spaces / n;
    var spaceTerm = spaceRatio < 0.05 ? (spaceRatio / 0.05) * 0.6 : (spaceRatio <= 0.35 ? 1 : Math.max(0, 1 - (spaceRatio - 0.35) * 2.5));
    var runTerm = longest > 6 ? 0.2 : 1;
    var letterTerm = clamp01(letters / Math.max(1, letters + digits));
    return clamp01(knownRatio * 0.5 + spaceTerm * 0.25 + runTerm * 0.15 + letterTerm * 0.1);
  }

  /* The base is the tile number that holds code 0. Tried over a range and judged
     by whether the screen then reads as text. */
  function findFontBase(mapBytes, options) {
    var opts = options || {};
    var from = Number(opts.from) || 0;
    var to = opts.to === undefined ? 512 : Number(opts.to);
    var chars = opts.codeChars || {};
    var best = null;
    for (var base = from; base <= to; base++) {
      var read = readTextFromMap(mapBytes, {
        layout: opts.layout, cells: opts.cells, cols: opts.cols,
        base: base, codeChars: chars, blank: opts.blank
      });
      var score = scoreText(read.text);
      if (!best || score > best.score) best = { base: base, score: score, text: read.text.slice(0, 200) };
    }
    return best;
  }

  /* Text to tile numbers, which is what writing on a screen needs. A character
     the table does not know comes back as null so the caller can say so. */
  function textToTiles(text, tableData, base) {
    var codes = charCodes(tableData);
    var start = Number(base) || 0;
    var tiles = [];
    var missing = {};
    String(text || '').split('').forEach(function (ch) {
      if (codes[ch] === undefined) { missing[ch] = true; tiles.push(null); return; }
      tiles.push((start + codes[ch]) & 0x3FF);
    });
    return { tiles: tiles, missing: Object.keys(missing) };
  }

  /* Where the characters go. A screen is written row by row, and a newline moves
     to the next row instead of being written. */
  function planTextOnMap(text, options) {
    var opts = options || {};
    var cols = Math.max(1, Number(opts.cols) || 32);
    var startCell = Math.max(0, Number(opts.startCell) || 0);
    var limit = opts.limit === undefined ? 0 : Number(opts.limit);
    var converted = textToTiles(text, opts.table, opts.base);
    var cells = [];
    var cell = startCell;
    for (var i = 0; i < converted.tiles.length; i++) {
      var ch = String(text).charAt(i);
      if (ch === '\n') { cell = Math.ceil((cell + 1) / cols) * cols; continue; }
      if (limit && cells.length >= limit) break;
      cells.push({ cell: cell, tile: converted.tiles[i], char: ch });
      cell++;
    }
    return { cells: cells, missing: converted.missing, endCell: cell };
  }

  /* The glyph sheet in character order, which is what a font view draws. */
  function glyphSheet(tableData, base, options) {
    var opts = options || {};
    var chars = codeChars(tableData);
    var from = opts.from === undefined ? 0 : Number(opts.from);
    var to = opts.to === undefined ? 0xFF : Number(opts.to);
    var out = [];
    for (var code = from; code <= to; code++) {
      out.push({ code: code, tile: (Number(base) || 0) + code, char: chars[code] === undefined ? '' : chars[code] });
    }
    return out;
  }

  /* Looking for words instead of letters. The first version of this judged a screen
     by how many characters the table could name, and the table names almost every
     byte, so noise scored 0.8 and the best 'text' on the test ROM came out as
     Z9UWX44ef.ij. A word list cannot be fooled that way: either the letters spell
     something or they do not. */
  var COMMON_WORDS = ['THE', 'AND', 'YOU', 'ARE', 'FOR', 'NOT', 'BUT', 'ALL', 'ONE', 'TWO', 'NEW', 'USE', 'GET', 'CAN', 'HAS', 'WAS', 'HIS', 'HER', 'ITS', 'OUR', 'OUT', 'WHO', 'HOW', 'WHY', 'YES', 'NO', 'ON', 'OFF', 'IN', 'TO', 'OF', 'IS', 'IT', 'AT', 'AS', 'BE', 'BY', 'DO', 'GO', 'IF', 'MY', 'OR', 'SO', 'UP', 'WE', 'AN', 'AS', 'PRESS', 'START', 'GAME', 'OPTION', 'OPTIONS', 'CONTINUE', 'LOAD', 'SAVE', 'EXIT', 'QUIT', 'BACK', 'NEXT', 'LEVEL', 'STAGE', 'WORLD', 'PLAYER', 'SCORE', 'TIME', 'LIFE', 'LIVES', 'ITEM', 'ITEM', 'MENU', 'TITLE', 'CASTLE', 'CASTLEVANIA', 'DRACULA', 'SOUL', 'ARIA', 'SORROW', 'DEMO', 'MUSIC', 'SOUND', 'CONFIG', 'SETTING', 'SETTINGS', 'NAME', 'ENTER', 'SELECT', 'CANCEL', 'OK', 'ATTACK', 'MAGIC', 'WEAPON', 'ARMOR', 'POTION', 'HEART', 'GOLD', 'MAP', 'PAUSE', 'OPENING', 'ENDING', 'STAFF', 'CREDIT', 'CREDITS', 'TRANSLAT', 'VERSION', 'ENGLISH', 'JAPAN'];

  function countWords(text, words) {
    var haystack = String(text || '').toUpperCase();
    var list = words || COMMON_WORDS;
    var hits = 0;
    var found = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.length < 3) continue;
      if (haystack.indexOf(w) !== -1) { hits++; if (found.length < 12) found.push(w); }
    }
    return { hits: hits, words: found };
  }

  function scoreWords(text, words) {
    var r = countWords(text, words);
    var length = String(text || '').replace(/[^A-Za-z0-9]/g, '').length;
    if (!length) return { score: 0, hits: 0, words: [] };
    // a handful of real words in a run of a few hundred characters is already a find
    var density = r.hits / Math.max(1, length / 100);
    return { score: clamp01(density / 4), hits: r.hits, words: r.words };
  }

  /* The same search, but over bytes rather than a screen, so compressed text can be
     decoded and judged too. */
  function scoreBytesAsText(bytes, tableData, options) {
    var opts = options || {};
    var chars = opts.codeChars || codeChars(tableData);
    var out = '';
    var limit = Math.min(bytes.length, Number(opts.limit) || 4096);
    for (var i = 0; i < limit; i++) {
      var c = chars[bytes[i] & 0xFF];
      out += c === undefined ? ' ' : c;
    }
    return { text: out, result: scoreWords(out, opts.words) };
  }

  /* ---------- is this block of tiles a font? ----------
     A font is a run of glyphs: each tile has few colours, the glyphs sit on a
     common baseline, many tiles are not empty, and a few are (space and the codes
     nothing uses). Game art looks different: tiles that fill the frame with
     texture. Measured against the test ROM, the block at 0xE4000 that looked like
     a font while browsing scores here as one, and the tile sets around 0x200000
     score lower, because their tiles cover their whole 8x8 frame. */
  function glyphStats(bytes, at, format) {
    var px = K.core.decodeTile(bytes, at, format);
    var seen = {};
    var filled = 0;
    var topRow = 0, bottomRow = 0;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var c = px[y][x];
        seen[c] = true;
        if (c) {
          filled++;
          if (y === 0) topRow++;
          if (y === 7) bottomRow++;
        }
      }
    }
    return { colours: Object.keys(seen).length, filled: filled, topRow: topRow, bottomRow: bottomRow, pixels: px };
  }

  function looksLikeFont(bytes, options) {
    var opts = options || {};
    var format = opts.format || 'gba-4bpp';
    var at = Number(opts.at) || 0;
    var count = Math.max(4, Math.min(Number(opts.tiles) || 96, 256));
    var size = K.core.tileSize(format);
    if (!bytes || at < 0 || at + count * size > bytes.length) return null;
    var blank = 0, sparse = 0, dense = 0, edges = 0, colours = 0;
    var fills = [];
    for (var i = 0; i < count; i++) {
      var g = glyphStats(bytes, at + i * size, format);
      colours += g.colours;
      var share = g.filled / 64;
      fills.push(share);
      if (share <= 0.02) blank++;
      else if (share <= 0.55) sparse++;
      else dense++;
      if (g.topRow === 0 || g.bottomRow === 0) edges++;
    }
    var blankShare = blank / count;
    var sparseShare = sparse / count;
    var denseShare = dense / count;
    var edgeShare = edges / count;
    /* A font has some blank glyphs, mostly sparse ones, a few dense ones (M, W),
       and it does not fill every frame edge to edge. */
    var score = 0;
    if (blankShare >= 0.01 && blankShare <= 0.45) score += 0.25;
    score += clamp01(sparseShare / 0.6) * 0.35;
    score += clamp01((0.45 - denseShare) / 0.45) * 0.2;
    score += clamp01((0.25 - Math.max(0, edgeShare)) / 0.25) * 0.1;
    score += clamp01((6 - colours / count) / 4) * 0.1;
    return {
      offset: at, tiles: count, score: clamp01(score),
      blankShare: blankShare, sparseShare: sparseShare, denseShare: denseShare,
      coloursMean: colours / count
    };
  }

  /* ---------- which tile is code 0? ----------
     The space glyph and the unused codes are blank, and A and a are not. That is
     enough to suggest a few bases for a person to look at, and looking is the proof:
     the sheet either reads A B C or it does not. */
  function suggestFontBase(bytes, options) {
    var opts = options || {};
    var format = opts.format || 'gba-4bpp';
    var at = Number(opts.at) || 0;
    var span = Math.max(0x100, Math.min(Number(opts.span) || 0x180, 0x400));
    var size = K.core.tileSize(format);
    if (!bytes || at < 0 || at + span * size > bytes.length) return [];
    var blankAt = {};
    for (var i = 0; i < span; i++) {
      var g = glyphStats(bytes, at + i * size, format);
      blankAt[i] = g.filled <= 1;
    }
    var out = [];
    for (var base = 0; base + 0x80 < span; base++) {
      var spaceBlank = blankAt[base + 0x20];
      var aFilled = !blankAt[base + 0x41];
      var digitFilled = !blankAt[base + 0x30];
      var lowerFilled = !blankAt[base + 0x61];
      var score = (spaceBlank ? 0.35 : 0) + (aFilled ? 0.25 : 0) + (digitFilled ? 0.15 : 0) + (lowerFilled ? 0.15 : 0);
      // a base whose own tile is blank is more plausible: code 0 is usually unused
      if (blankAt[base]) score += 0.1;
      if (score > 0) out.push({ base: base, score: clamp01(score), spaceBlank: spaceBlank, aFilled: aFilled, digitFilled: digitFilled, lowerFilled: lowerFilled });
    }
    out.sort(function (a, b) { return b.score - a.score || a.base - b.base; });
    return out.slice(0, 12);
  }

  K.core.glyphStats = glyphStats;
  K.core.looksLikeFont = looksLikeFont;
  K.core.suggestFontBase = suggestFontBase;
  K.core.COMMON_WORDS = COMMON_WORDS;
  K.core.countWords = countWords;
  K.core.scoreWords = scoreWords;
  K.core.scoreBytesAsText = scoreBytesAsText;
  K.core.charCodes = charCodes;
  K.core.codeChars = codeChars;
  K.core.readTextFromMap = readTextFromMap;
  K.core.scoreText = scoreText;
  K.core.findFontBase = findFontBase;
  K.core.textToTiles = textToTiles;
  K.core.planTextOnMap = planTextOnMap;
  K.core.glyphSheet = glyphSheet;
})(window);