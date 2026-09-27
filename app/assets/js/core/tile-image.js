/* ============================================================
   Ketor - Tile Image (Batch 160 / D1)
   ------------------------------------------------------------
   The tile codec (core/tile-codec.js) reads and writes colour
   indices; this file is the other half of the pipe. Indices become
   pixels here, and pixels become indices again.

   It is a pure function of its arguments - no canvas, no ImageData
   and no DOM - so a Node test can exercise it and a worker can use
   it without a document. Both directions go through
   Ketor.core.decodeTile and Ketor.core.encodeTile, so a layout lives
   in exactly one file and this one cannot disagree with the editor
   about which nibble holds the first pixel.

   A palette entry is either a {r,g,b} object with channels 0-255 or
   a 0xRRGGBB number; both are accepted everywhere a palette is. The
   numbers are read the way CSS writes a colour (0xRRGGBB), not as
   BGR555: the ROM's BGR555 words are already turned into {r,g,b} by
   the palette reader before they reach this file.

   With no palette at all a colour index i is the grey r=g=b=i, which
   is reversible, so a sheet still shows a picture before the game's
   own palette has been found. An index the palette does not cover
   falls back to that same ramp one entry at a time, which is what
   lets a 16 colour palette show an 8bpp sheet instead of refusing
   it. Alpha is read and dropped: none of these formats stores one.
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

  var DEFAULT_FORMAT = 'gba-4bpp';

  /* The codec owns the layout table. A missing format means "the default",
     a format the table does not know means null: a typo on an export would
     otherwise be read as gba-4bpp in silence, and 32 bytes against 64 draws
     half a picture with no error anywhere. */
  function formatIdOf(id) {
    if (!core.tileFormat || !core.TILE_FORMATS) return null;
    if (id === undefined || id === null || id === '') return DEFAULT_FORMAT;
    return Object.prototype.hasOwnProperty.call(core.TILE_FORMATS, id) ? id : null;
  }

  function byteOf(value) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) n = 0;
    return n < 0 ? 0 : (n > 255 ? 255 : n);
  }

  /* One palette in, one list of {r,g,b} out; null means "no palette". A hole
     in the list is kept as null so colourOfIndex can fall back per entry. */
  function normalisePalette(palette) {
    if (!palette) return null;
    var list = [];
    for (var i = 0; i < palette.length; i++) {
      var entry = palette[i];
      if (typeof entry === 'number') list.push({ r: (entry >> 16) & 0xFF, g: (entry >> 8) & 0xFF, b: entry & 0xFF });
      else if (entry && typeof entry === 'object') list.push({ r: byteOf(entry.r), g: byteOf(entry.g), b: byteOf(entry.b) });
      else list.push(null);
    }
    return list;
  }

  function colourOfIndex(palette, index) {
    var i = Math.round(Number(index));
    if (!isFinite(i) || i < 0) i = 0;
    var entry = palette && palette[i];
    if (entry) return { r: entry.r, g: entry.g, b: entry.b };
    var v = i > 255 ? 255 : i;
    return { r: v, g: v, b: v };
  }

  /* Nearest palette entry to one colour.

     An exact hit wins outright, because distance 0 is the only thing the byte
     for byte round trip needs. Otherwise the smallest squared RGB distance
     wins and a tie goes to the lower index, so the answer does not depend on
     which end the scan started from. */
  function nearestIndex(palette, colour) {
    if (!palette || palette.length === 0) return 0;
    var best = 0, bestDistance = -1;
    for (var i = 0; i < palette.length; i++) {
      var entry = palette[i];
      if (!entry) continue;
      var dr = entry.r - colour.r, dg = entry.g - colour.g, db = entry.b - colour.b;
      var d = dr * dr + dg * dg + db * db;
      if (d === 0) return i;
      if (bestDistance < 0 || d < bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  }

  /* Pixels for a column of tiles: 8 wide, 8 * count tall, RGBA.

     count defaults to 1 - the caller that wants a sheet says how big it is,
     so a call on an 8 MiB rom cannot allocate an image nobody asked for. The
     count is then clamped to the tiles that actually fit, so the last tile is
     never read past the end of the buffer as a blank tile.

     count 0 is an empty image (height 0, no pixels), not an error: a sheet
     that holds nothing is something a caller may legitimately ask for, and
     rgbaToTiles turns it back into zero tiles. */
  function tilesToRgba(bytes, options) {
    var opts = options || {};
    var formatId = formatIdOf(opts.format);
    if (!formatId) return null;
    var f = core.tileFormat(formatId);
    var palette = normalisePalette(opts.palette);
    var at = Math.floor(Number(opts.at));
    if (!isFinite(at) || at < 0) at = 0;
    var fits = 0;
    if (bytes && bytes.length > at) fits = Math.floor((bytes.length - at) / f.size);
    var count = 1;
    if (opts.count !== undefined && opts.count !== null) {
      count = Math.floor(Number(opts.count));
      if (!isFinite(count) || count < 0) count = 0;
    }
    if (count > fits) count = fits;

    var width = 8;
    var height = 8 * count;
    var pixels = new Uint8ClampedArray(width * height * 4);
    for (var t = 0; t < count; t++) {
      var tile = core.decodeTile(bytes, at + t * f.size, formatId);
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var colour = colourOfIndex(palette, tile[y][x]);
          var out = ((t * 8 + y) * width + x) * 4;
          pixels[out] = colour.r;
          pixels[out + 1] = colour.g;
          pixels[out + 2] = colour.b;
          pixels[out + 3] = 255;
        }
      }
    }
    return { width: width, height: height, pixels: pixels };
  }

  /* The way back. The sheet may be several tiles wide: columns are taken left
     to right, rows top to bottom, and a tile starts at every multiple of 8
     pixels. An 8 pixel wide image - what tilesToRgba writes - is the one
     column case of the same layout, so the round trip stays byte identical.

     A colour the palette does not hold is mapped to the nearest entry (see
     nearestIndex). The index is then clamped into the format's own range: a
     16 colour format has 16 slots, and a nibble carrying 17 would spill into
     the pixel beside it in 4bpp, or set bits the planar layouts do not own.
     Clamping writes the last usable index instead of a byte no console would
     read back as the colour that was asked for.

     No pixels at all is null - there is nothing to write - while an empty
     selection is {bytes: empty, count: 0}. */
  function rgbaToTiles(rgba, options) {
    var opts = options || {};
    var formatId = formatIdOf(opts.format);
    if (!formatId || !rgba) return null;
    var f = core.tileFormat(formatId);
    var palette = normalisePalette(opts.palette);
    var width = Math.floor(Number(opts.width));
    var height = Math.floor(Number(opts.height));
    if (!isFinite(width) || width < 0) width = 0;
    if (!isFinite(height) || height < 0) height = 0;
    var cols = Math.floor(width / 8);
    var rows = Math.floor(height / 8);
    var count = cols * rows;
    var bytes = new Uint8Array(count * f.size);
    var outside = width * height * 4;
    for (var t = 0; t < count; t++) {
      var col = t % cols;
      var row = Math.floor(t / cols);
      var tile = [];
      for (var y = 0; y < 8; y++) {
        var line = [];
        for (var x = 0; x < 8; x++) {
          var at = ((row * 8 + y) * width + col * 8 + x) * 4;
          var colour = at + 2 < outside
            ? { r: rgba[at] & 0xFF, g: rgba[at + 1] & 0xFF, b: rgba[at + 2] & 0xFF }
            : { r: 0, g: 0, b: 0 };
          var index = nearestIndex(palette, colour);
          if (index > f.colors - 1) index = f.colors - 1;
          line.push(index);
        }
        tile.push(line);
      }
      bytes.set(core.encodeTile(tile, formatId), t * f.size);
    }
    return { bytes: bytes, count: count };
  }

  core.tilesToRgba = tilesToRgba;
  core.rgbaToTiles = rgbaToTiles;
})(window);
