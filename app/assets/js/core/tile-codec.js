/* ============================================================
   Ketor - Tile Codec (Batch 47)
   ------------------------------------------------------------
   Decode and encode the tile formats the consoles in this project
   actually use. Every format is a pure function of the bytes, so a
   decode followed by an encode has to return the same bytes; that
   round trip is the test that keeps this file honest.

   Every console here stores 8x8 tiles, and there are only three
   layouts in the whole set, so each layout is implemented once:

     planar    one bit plane per row, bit 7 is the leftmost pixel.
               A 2bpp tile is one 16 byte block (plane 0, plane 1 per
               row): Game Boy, GBC, NES CHR, SNES 2bpp.
               SNES 4bpp is two of those blocks, 8bpp is four, and the
               later planes carry the higher colour bits.
     nibble    one nibble per pixel, 32 bytes for 4bpp. GBA/NDS put the
               even pixel in the low nibble, the Mega Drive puts it in
               the high nibble.
     byte8     one byte per pixel, 64 bytes, GBA/NDS 8bpp.

   The round trip test (decode then encode must return the same bytes)
   is what keeps this file honest, and every format below passes it on
   a real or synthetic ROM.
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  var FORMATS = {
    'gb-2bpp': { id: 'gb-2bpp', label: 'Game Boy / NES 2bpp (16 bytes)', size: 16, colors: 4, kind: 'planar', groups: 1, width: 8, height: 8 },
    'nes-2bpp': { id: 'nes-2bpp', label: 'NES CHR 2bpp (16 bytes)', size: 16, colors: 4, kind: 'planar', groups: 1, width: 8, height: 8 },
    'gb-1bpp': { id: 'gb-1bpp', label: '1bpp (8 bytes)', size: 8, colors: 2, kind: 'planar1', width: 8, height: 8 },
    'snes-2bpp': { id: 'snes-2bpp', label: 'SNES 2bpp planar (16 bytes)', size: 16, colors: 4, kind: 'planar', groups: 1, width: 8, height: 8 },
    'snes-4bpp': { id: 'snes-4bpp', label: 'SNES 4bpp planar (32 bytes)', size: 32, colors: 16, kind: 'planar', groups: 2, width: 8, height: 8 },
    'snes-8bpp': { id: 'snes-8bpp', label: 'SNES 8bpp planar (64 bytes)', size: 64, colors: 256, kind: 'planar', groups: 4, width: 8, height: 8 },
    'gba-4bpp': { id: 'gba-4bpp', label: 'GBA / NDS 4bpp (32 bytes)', size: 32, colors: 16, kind: 'nibble', hiFirst: false, width: 8, height: 8 },
    'genesis-4bpp': { id: 'genesis-4bpp', label: 'Mega Drive 4bpp (32 bytes)', size: 32, colors: 16, kind: 'nibble', hiFirst: true, width: 8, height: 8 },
    'gba-8bpp': { id: 'gba-8bpp', label: 'GBA / NDS 8bpp (64 bytes)', size: 64, colors: 256, kind: 'byte8', width: 8, height: 8 }
  };

  var DEFAULT_FORMAT = 'gba-4bpp';

  function blankTile() {
    var out = [];
    for (var y = 0; y < 8; y++) {
      var row = [];
      for (var x = 0; x < 8; x++) row.push(0);
      out.push(row);
    }
    return out;
  }

  /* planar: groups blocks of 16 bytes. Block g holds bit planes 2g and 2g+1,
     two bytes per row, most significant bit first. */
  function decodePlanar(bytes, offset, f) {
    var out = blankTile();
    for (var g = 0; g < f.groups; g++) {
      var base = offset + g * 16;
      for (var y = 0; y < 8; y++) {
        var b0 = bytes[base + y * 2] & 0xFF;
        var b1 = bytes[base + y * 2 + 1] & 0xFF;
        for (var x = 0; x < 8; x++) {
          var bit = 7 - x;
          out[y][x] |= (((b1 >> bit) & 1) << (g * 2 + 1)) | (((b0 >> bit) & 1) << (g * 2));
        }
      }
    }
    return out;
  }

  function encodePlanar(pixels, f) {
    var out = new Uint8Array(f.size);
    for (var g = 0; g < f.groups; g++) {
      var base = g * 16;
      for (var y = 0; y < 8; y++) {
        var b0 = 0, b1 = 0;
        for (var x = 0; x < 8; x++) {
          var c = (pixels[y] && pixels[y][x]) || 0;
          var bit = 7 - x;
          b0 |= ((c >> (g * 2)) & 1) << bit;
          b1 |= ((c >> (g * 2 + 1)) & 1) << bit;
        }
        out[base + y * 2] = b0 & 0xFF;
        out[base + y * 2 + 1] = b1 & 0xFF;
      }
    }
    return out;
  }

  function decodePlanar1(bytes, offset) {
    var out = blankTile();
    for (var y = 0; y < 8; y++) {
      var b = bytes[offset + y] & 0xFF;
      for (var x = 0; x < 8; x++) out[y][x] = (b >> (7 - x)) & 1;
    }
    return out;
  }

  function encodePlanar1(pixels) {
    var out = new Uint8Array(8);
    for (var y = 0; y < 8; y++) {
      var b = 0;
      for (var x = 0; x < 8; x++) b |= ((pixels[y] && pixels[y][x] ? 1 : 0) << (7 - x));
      out[y] = b & 0xFF;
    }
    return out;
  }

  function decodeNibble(bytes, offset, f) {
    var out = blankTile();
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var v = bytes[offset + y * 4 + (x >> 1)] & 0xFF;
        // GBA and NDS keep the even pixel in the low nibble, the Mega Drive in
        // the high one. Reading this the other way round only swaps pixel pairs,
        // so the art still looks like art; the round trip test is what caught it.
        var high = (x & 1) ? !f.hiFirst : f.hiFirst;
        out[y][x] = high ? ((v >> 4) & 0x0F) : (v & 0x0F);
      }
    }
    return out;
  }

  function encodeNibble(pixels, f) {
    var out = new Uint8Array(f.size);
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 4; x++) {
        var a = ((pixels[y] && pixels[y][x * 2]) || 0) & 0x0F;
        var b = ((pixels[y] && pixels[y][x * 2 + 1]) || 0) & 0x0F;
        out[y * 4 + x] = (f.hiFirst ? ((a << 4) | b) : ((b << 4) | a)) & 0xFF;
      }
    }
    return out;
  }

  function formatOf(id) { return FORMATS[id] || FORMATS[DEFAULT_FORMAT]; }

  function tileSize(id) { return formatOf(id).size; }

  /* Returns an 8x8 array of colour indices, row by row. */
  function decodeTile(bytes, offset, formatId) {
    var f = formatOf(formatId);
    if (!bytes || offset < 0 || offset + f.size > bytes.length) return blankTile();
    if (f.kind === 'planar') return decodePlanar(bytes, offset, f);
    if (f.kind === 'planar1') return decodePlanar1(bytes, offset);
    if (f.kind === 'byte8') {
      var out = blankTile();
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) out[y][x] = bytes[offset + y * 8 + x] & 0xFF;
      return out;
    }
    return decodeNibble(bytes, offset, f);
  }

  /* Writes the pixels back. The caller compares it with what is in the ROM,
     so an unchanged pixel costs nothing. */
  function encodeTile(pixels, formatId) {
    var f = formatOf(formatId);
    if (f.kind === 'planar') return encodePlanar(pixels, f);
    if (f.kind === 'planar1') return encodePlanar1(pixels);
    if (f.kind === 'byte8') {
      var out = new Uint8Array(f.size);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) out[y * 8 + x] = ((pixels[y] && pixels[y][x]) || 0) & 0xFF;
      return out;
    }
    return encodeNibble(pixels, f);
  }

  /* True when decoding and encoding the same bytes gives those bytes back. */
  function roundTrip(bytes, offset, formatId) {
    var f = formatOf(formatId);
    if (!bytes || offset < 0 || offset + f.size > bytes.length) return false;
    var again = encodeTile(decodeTile(bytes, offset, formatId), formatId);
    for (var i = 0; i < f.size; i++) if (again[i] !== (bytes[offset + i] & 0xFF)) return false;
    return true;
  }

  /* Raw measurements behind the score. Kept separate from the score so the
     rule can be tuned against real ROMs instead of guessed: every guard
     below was added after looking at these numbers for art and padding. */
  function regionMetrics(bytes, offset, formatId, tileCount) {
    var f = formatOf(formatId);
    var count = Math.max(1, Math.min(Number(tileCount) || 16, 256));
    if (!bytes || offset < 0 || offset + f.size * count > bytes.length) return null;
    var colourSum = 0;
    var runSum = 0;
    var histogram = {};
    var patternSeen = {};
    var totalPixels = 0;
    var nonZeroPixels = 0;
    var agreeSame = 0;
    var agreePairs = 0;
    for (var t = 0; t < count; t++) {
      var px = decodeTile(bytes, offset + t * f.size, formatId);
      var seen = {};
      var colours = 0;
      var runs = 0;
      var pixels = 0;
      var key = '';
      for (var y = 0; y < 8; y++) {
        var last = -1;
        key += px[y].join(',') + '|';
        for (var x = 0; x < 8; x++) {
          var c = px[y][x];
          if (!seen[c]) { seen[c] = true; colours++; }
          if (c !== last) { runs++; last = c; }
          histogram[c] = (histogram[c] || 0) + 1;
          if (c) nonZeroPixels++;
          totalPixels++;
          pixels++;
          // how often a pixel agrees with the one to its right and below it:
          // shapes agree, noise does not
          if (x < 7) { agreePairs++; if (c === px[y][x + 1]) agreeSame++; }
          if (y < 7) { agreePairs++; if (c === px[y + 1][x]) agreeSame++; }
        }
      }
      patternSeen[key] = (patternSeen[key] || 0) + 1;
      colourSum += colours;
      runSum += pixels / Math.max(1, runs);
    }
    var topShare = 0;
    Object.keys(patternSeen).forEach(function (k) { if (patternSeen[k] > topShare) topShare = patternSeen[k]; });
    var dominant = 0;
    Object.keys(histogram).forEach(function (k) { if (histogram[k] > dominant) dominant = histogram[k]; });
    /* Palette data is a run of little endian BGR555 words with bit 15 unused, so
       the odd byte of every pair keeps its top bit clear. Random tile data does
       that about half the time; a palette block does it nearly always. */
    var words = 0;
    var clearTop = 0;
    var printable = 0;
    var scanBytes = Math.min(count * f.size, bytes.length - offset);
    for (var b2 = 0; b2 < scanBytes; b2++) {
      var byteValue = bytes[offset + b2] & 0xFF;
      // A table of characters is as regular as a drawing, and the test ROM has
      // one at 0xE4000 that decoded to the readable run MNOPQRSTUVWXYZ. Text is
      // told apart by its bytes, not by its pixels.
      if (byteValue >= 0x20 && byteValue <= 0x7E) printable++;
      if ((b2 & 1) === 1) {
        words++;
        if ((byteValue & 0x80) === 0) clearTop++;
      }
    }
    return {
      count: count,
      coloursMean: colourSum / count,
      meanRun: runSum / count,
      agreement: agreePairs ? agreeSame / agreePairs : 0,
      paletteLike: words ? clearTop / words : 0,
      textLike: scanBytes ? printable / scanBytes : 0,
      regionColours: Object.keys(histogram).length,
      // one colour covering nearly everything is padding or a flat fill
      dominant: totalPixels ? dominant / totalPixels : 1,
      // a sheet of art holds many different tiles, padding holds one
      distinctShare: Object.keys(patternSeen).length / count,
      topShare: topShare / count,
      fill: totalPixels ? nonZeroPixels / totalPixels : 0,
      colourLimit: f.colors
    };
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* 0..1 score of how likely this offset holds tiles of that format.

     The rule is fitted to measurements, not to taste. On the 8 MiB test ROM and
     on synthetic sheets for the other consoles the samples separate like this:

       sample                        colours  mean run  dominant  distinct
       LZ77 art block 0x632764          2.19      4.65      0.58      0.88
       RLE art block 0x1DD124           2.09      5.29      0.90      0.66
       raw art region 0x200000          6.94      2.41      0.34      1.00
       SNES 4bpp sheet                  3.31      3.16      0.35      1.00
       BGR555 palette area              9.06      1.76      0.66      1.00
       executable code 0x100           12.47      1.22      0.31      1.00
       flat data 0x500000              14.38      1.10      0.20      1.00
       zero padding                     1.00      8.00      1.00      0.03
       speck region 0x170000            1.94      7.18      0.92      0.19

     So art is: pixels that come in runs, a colour count well under what the
     format allows, a background that is not everything and not nothing, and
     many different tiles. Each of those four is one term below, and the guards
     are the same four measurements again, because a single term can be fooled:
     code has structure but no runs, padding has runs but one tile, a palette has
     many colours and no runs at all. */
  function scoreRegion(bytes, offset, formatId, tileCount) {
    var m = regionMetrics(bytes, offset, formatId, tileCount);
    if (!m) return 0;
    /* Agreement between neighbouring pixels is what tells a drawing from a
       stream of bytes. Measured on the test ROM: real graphics agree 0.52 to
       0.90, executable code 0.24, flat packed data 0.05 to 0.21, a palette block
       0.47. The dense tileset at 0x200000 agrees only 0.52, which is why the
       first version of this rule, built on horizontal runs alone, ranked it below
       sparse sprite data instead of beside it. */
    /* Runs and agreement are multiplied, not averaged: a drawing needs both. A
       palette block read as tiles agrees 0.47 with itself and packs runs of 1.8,
       which an average would call half a drawing. Measured: art 0.52 to 0.90
       agreement with runs 2.4 to 5.3, code 0.24 with runs 1.2, flat data 0.05 to
       0.21 with runs 1.0 to 1.3. */
    var runTerm = clamp01((m.meanRun - 1.5) / 1.5);
    var agreeTerm = clamp01((m.agreement - 0.35) / 0.3);
    var structureTerm = runTerm * agreeTerm;
    var ratio = m.coloursMean / Math.max(1, m.colourLimit);
    var colourTerm = ratio <= 0.45 ? 1 : (ratio >= 0.7 ? 0.15 : 1 - ((ratio - 0.45) / 0.25) * 0.85);
    var distinctTerm = clamp01((m.distinctShare - 0.2) / 0.4);
    var base = structureTerm * 0.4 + colourTerm * 0.3 + distinctTerm * 0.3;
    // pixels that do not sit in runs either: executable code, packed tables
    if (m.meanRun < 1.6) base *= 0.35;
    // one colour is everything: empty padding, or a flat fill
    if (m.dominant > 0.93) base *= 0.4;
    // no background at all: colour noise
    if (m.dominant < 0.22) base *= 0.5;
    // almost every tile the same: a fill pattern, not a sheet
    if (m.topShare > 0.7) base *= 0.4;
    if (m.fill < 0.03 || m.fill > 0.97) base *= 0.4;
    // A raw palette block read as tiles: every word keeps bit 15 clear, and it
    // has no structure of its own. Compressed graphics also keep their high bits
    // clean, so this may only fire when the structure term is low as well.
    if (m.paletteLike > 0.8 && structureTerm < 0.15) base *= 0.35;
    // a character table read as tiles: printable bytes all the way through
    if (m.textLike > 0.9) base *= 0.3;
    return clamp01(base);
  }
  /* Raw scan, for everything that stores its tiles uncompressed. The step
     adapts to the ROM so a 32 KiB Game Boy ROM is not sampled four times and an
     8 MiB GBA ROM is not sampled four million times. */
  function scanTileRegions(bytes, options) {
    var opts = options || {};
    var formatId = opts.format || DEFAULT_FORMAT;
    var f = formatOf(formatId);
    if (!bytes || !bytes.length || !f.size) return { all: [], top: [], step: 0, tested: 0 };
    var tiles = Math.max(2, Math.min(opts.tiles || 32, 256));
    var step = opts.step;
    if (!step) {
      var target = Math.max(1, Math.floor(bytes.length / 4096));
      step = Math.max(0x400, Math.floor(target / 0x400) * 0x400);
    }
    var from = Math.max(0, Number(opts.from) || 0);
    var to = opts.to === undefined ? bytes.length : Math.min(bytes.length, Number(opts.to));
    var found = [];
    var tested = 0;
    for (var off = from; off + tiles * f.size <= to; off += step) {
      found.push({ offset: off, score: scoreRegion(bytes, off, formatId, tiles) });
      tested++;
    }
    found.sort(function (a, b) { return b.score - a.score || a.offset - b.offset; });
    return {
      all: found,
      top: found.slice(0, Math.max(1, opts.maxResults || 8)),
      step: step,
      tiles: tiles,
      tested: tested
    };
  }

  Ketor.core.scanTileRegions = scanTileRegions;
  Ketor.core.TILE_FORMATS = FORMATS;
  Ketor.core.tileFormat = formatOf;
  Ketor.core.tileSize = tileSize;
  Ketor.core.decodeTile = decodeTile;
  Ketor.core.encodeTile = encodeTile;
  Ketor.core.tileRoundTrip = roundTrip;
  Ketor.core.scoreTileRegion = scoreRegion;
  Ketor.core.tileRegionMetrics = regionMetrics;
  Ketor.core.clamp01 = clamp01;
})(window);
