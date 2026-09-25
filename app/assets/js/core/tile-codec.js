/* ============================================================
   Ketor - Tile Codec (Batch 47)
   ------------------------------------------------------------
   Decode and encode the tile formats the consoles in this project
   actually use. Every format is a pure function of the bytes, so a
   decode followed by an encode has to return the same bytes; that
   round trip is the test that keeps this file honest.

   Formats:
     gb-2bpp     Game Boy / GBC: 16 bytes, two bit planes per row,
                 bit 7 is the leftmost pixel.
     gba-4bpp    GBA / NDS 4bpp: 32 bytes, one nibble per pixel,
                 low nibble is the even pixel, as BGxCNT bit 7 = 0.
     gba-8bpp    GBA / NDS 8bpp: 64 bytes, one byte per pixel,
                 as BGxCNT bit 7 = 1.

   SNES planar 4bpp is deliberately absent: its plane layout differs
   from the GBA one and it has not been checked against a real SNES
   ROM yet. Adding it without that check would be a guess.
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  var FORMATS = {
    'gb-2bpp': { id: 'gb-2bpp', label: 'Game Boy 2bpp (16 bytes)', size: 16, colors: 4, width: 8, height: 8 },
    'gba-4bpp': { id: 'gba-4bpp', label: '4bpp (32 bytes)', size: 32, colors: 16, width: 8, height: 8 },
    'gba-8bpp': { id: 'gba-8bpp', label: '8bpp (64 bytes)', size: 64, colors: 256, width: 8, height: 8 }
  };

  function formatOf(id) { return FORMATS[id] || FORMATS['gba-4bpp']; }

  function tileSize(id) { return formatOf(id).size; }

  /* Returns an 8x8 array of colour indices, row by row. */
  function decodeTile(bytes, offset, formatId) {
    var f = formatOf(formatId);
    var out = [];
    var i, x, y, b0, b1, v;
    for (y = 0; y < 8; y++) {
      var row = [];
      for (x = 0; x < 8; x++) row.push(0);
      out.push(row);
    }
    if (!bytes || offset < 0 || offset + f.size > bytes.length) return out;
    if (f.id === 'gb-2bpp') {
      for (y = 0; y < 8; y++) {
        b0 = bytes[offset + y * 2] & 0xFF;
        b1 = bytes[offset + y * 2 + 1] & 0xFF;
        for (x = 0; x < 8; x++) {
          var bit = 7 - x;
          out[y][x] = (((b1 >> bit) & 1) << 1) | ((b0 >> bit) & 1);
        }
      }
      return out;
    }
    if (f.id === 'gba-8bpp') {
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) out[y][x] = bytes[offset + y * 8 + x] & 0xFF;
      return out;
    }
    // 4bpp: one nibble per pixel, low nibble first
    for (y = 0; y < 8; y++) {
      for (x = 0; x < 8; x++) {
        v = bytes[offset + y * 4 + (x >> 1)] & 0xFF;
        out[y][x] = (x & 1) ? ((v >> 4) & 0x0F) : (v & 0x0F);
      }
    }
    return out;
  }

  /* Writes the pixels back and returns how many bytes it touched. */
  function encodeTile(pixels, formatId) {
    var f = formatOf(formatId);
    var out = new Uint8Array(f.size);
    var x, y;
    if (f.id === 'gb-2bpp') {
      for (y = 0; y < 8; y++) {
        var b0 = 0, b1 = 0;
        for (x = 0; x < 8; x++) {
          var c = (pixels[y] && pixels[y][x]) & 0x03;
          var bit = 7 - x;
          b0 |= (c & 1) << bit;
          b1 |= ((c >> 1) & 1) << bit;
        }
        out[y * 2] = b0 & 0xFF;
        out[y * 2 + 1] = b1 & 0xFF;
      }
      return out;
    }
    if (f.id === 'gba-8bpp') {
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) out[y * 8 + x] = (pixels[y] && pixels[y][x] || 0) & 0xFF;
      return out;
    }
    for (y = 0; y < 8; y++) {
      for (x = 0; x < 4; x++) {
        var lo = (pixels[y] && pixels[y][x * 2]) & 0x0F;
        var hi = (pixels[y] && pixels[y][x * 2 + 1]) & 0x0F;
        out[y * 4 + x] = (lo | (hi << 4)) & 0xFF;
      }
    }
    return out;
  }

  /* True when decoding and encoding the same bytes gives those bytes back. */
  function roundTrip(bytes, offset, formatId) {
    var f = formatOf(formatId);
    if (!bytes || offset < 0 || offset + f.size > bytes.length) return false;
    var again = encodeTile(decodeTile(bytes, offset, formatId), formatId);
    for (var i = 0; i < f.size; i++) if (again[i] !== (bytes[offset + i] & 0xFF)) return false;
    return true;
  }

  /* 0..1 score of how likely this offset holds tiles of that format.
     Two measurements separate art from noise: a tile of a game uses few
     colours, and its pixels come in short runs instead of alternating at
     random. Colour count alone scored noise and art the same, which is why
     the first version of this function could not be used for detection. */
  function scoreRegion(bytes, offset, formatId, tileCount) {
    var f = formatOf(formatId);
    var count = Math.max(1, Math.min(Number(tileCount) || 16, 256));
    if (!bytes || offset < 0 || offset + f.size * count > bytes.length) return 0;
    var colourSum = 0;
    var allSeen = {};
    var totalPixels = 0;
    var nonZeroPixels = 0;
    var runSum = 0;
    var colourLimit = f.colors;
    for (var t = 0; t < count; t++) {
      var px = decodeTile(bytes, offset + t * f.size, formatId);
      var seen = {};
      var colours = 0;
      var runs = 0;
      var pixels = 0;
      for (var y = 0; y < 8; y++) {
        var last = -1;
        for (var x = 0; x < 8; x++) {
          var c = px[y][x];
          if (!seen[c]) { seen[c] = true; colours++; }
          if (c !== last) { runs++; last = c; }
          allSeen[c] = true;
          if (c) nonZeroPixels++;
          totalPixels++;
          pixels++;
        }
      }
      // few colours per tile is what a game palette looks like
      colourSum += Math.max(0, Math.min(1, 1 - (colours - 1) / Math.max(1, colourLimit - 1)));
      // long horizontal runs mean structure, not random bytes
      var meanRun = pixels / Math.max(1, runs);
      runSum += Math.max(0, Math.min(1, (meanRun - 1) / 2.5));
    }
    var regionColours = Object.keys(allSeen).length;
    var fill = totalPixels ? nonZeroPixels / totalPixels : 0;
    var base = (colourSum / count) * 0.55 + (runSum / count) * 0.45;
    // Few colours and long runs also describe empty padding, which scored a
    // perfect 1.0 and pushed the real graphics off the list of candidates.
    if (regionColours <= 2) base *= 0.15;
    if (fill < 0.03) base *= 0.4;
    if (fill > 0.97) base *= 0.4;
    return Math.max(0, Math.min(1, base));
  }

  Ketor.core.TILE_FORMATS = FORMATS;
  Ketor.core.tileFormat = formatOf;
  Ketor.core.tileSize = tileSize;
  Ketor.core.decodeTile = decodeTile;
  Ketor.core.encodeTile = encodeTile;
  Ketor.core.tileRoundTrip = roundTrip;
  Ketor.core.scoreTileRegion = scoreRegion;
})(window);
