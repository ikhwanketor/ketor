/* ============================================================
   Ketor - What kind of data is this block? (Batch 59)
   ------------------------------------------------------------
   A block the ROM points at is either tiles, a screen map or a
   palette, and telling them apart is what makes a screen
   assembleable without an emulator: pick the map that is pointed
   at, the tiles that are pointed at, and the palette that is
   pointed at, and the screen is theirs.

   Each kind has a shape a score can see:
     tiles     a multiple of the tile size, and it reads as art
     map       a multiple of the cell size, sized like a screen
               block, and its cells repeat in runs
     palette   a multiple of 32 bytes of little endian BGR555 words
               with bit 15 unused
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  /* BGR555 words with bit 15 unused, which is what a palette is. */
  function paletteScore(bytes, options) {
    var opts = options || {};
    var at = Number(opts.at) || 0;
    var length = Math.min(Number(opts.length) || 0, 0x200, bytes.length - at);
    if (length < 32 || length % 32 !== 0) return 0;
    var words = 0, clear = 0, distinct = {}, count = 0;
    for (var i = 0; i + 2 <= length; i += 2) {
      var v = (bytes[at + i] & 0xFF) | ((bytes[at + i + 1] & 0xFF) << 8);
      words++;
      if ((v & 0x8000) === 0) clear++;
      if (!distinct[v]) { distinct[v] = true; count++; }
    }
    var clearShare = words ? clear / words : 0;
    if (clearShare < 0.9) return 0;
    var colours = count;
    if (colours < 4) return 0;
    var term = Math.min(1, colours / 16);
    return Math.max(0, Math.min(1, clearShare * 0.5 + term * 0.5));
  }

  function mapScoreOf(bytes, options) {
    var opts = options || {};
    var at = Number(opts.at) || 0;
    var layout = opts.layout || 'gba-text';
    var length = Number(opts.length) || 0;
    var entry = K.core.mapLayout(layout).entryBytes;
    if (!length || length % entry !== 0) return null;
    var cells = Math.floor(length / entry);
    if (cells < 256 || cells > 8192) return null;
    var best = null;
    [32, 64].forEach(function (cols) {
      if (cols > cells) return;
      var score = K.core.scoreMapBlock(bytes, at, cells, cols, layout);
      if (!score) return;
      if (!best || score.score > best.score) best = { score: score.score, distinct: score.distinct, meanRun: score.meanRun, cols: cols, cells: cells };
    });
    return best;
  }

  function tileScoreOf(bytes, options) {
    var opts = options || {};
    var at = Number(opts.at) || 0;
    var format = opts.format || 'gba-4bpp';
    var size = K.core.tileSize(format);
    var length = Number(opts.length) || 0;
    if (!length || length % size !== 0) return null;
    var tiles = Math.floor(length / size);
    if (tiles < 4) return null;
    var best = 0;
    [0, 2, 4, 8, 16].forEach(function (shift) {
      if (shift >= length) return;
      var n = Math.min(64, Math.floor((length - shift) / size));
      if (n < 2) return;
      var s = K.core.scoreTileRegion(bytes, at + shift, format, n);
      if (s > best) best = s;
    });
    return { score: best, tiles: tiles };
  }

  /* What this block is, with the evidence for each reading. The kind wins on score,
     but every reading is reported so the interface can show why. */
  function classifyBlock(bytes, options) {
    var opts = options || {};
    var at = Number(opts.at) || 0;
    var length = Number(opts.length) || 0;
    if (!bytes || at < 0 || at + length > bytes.length || length <= 0) return null;
    var palette = paletteScore(bytes, { at: at, length: length });
    var map = mapScoreOf(bytes, { at: at, length: length, layout: opts.layout });
    var tiles = tileScoreOf(bytes, { at: at, length: length, format: opts.format });
    var readings = [
      { kind: 'tiles', score: tiles ? tiles.score : 0, detail: tiles ? tiles.tiles + ' tile(s)' : 'not a whole number of tiles' },
      { kind: 'map', score: map ? map.score : 0, detail: map ? (map.cells + ' cells, ' + map.distinct + ' distinct, run ' + map.meanRun.toFixed(1)) : 'not a screen block size' },
      { kind: 'palette', score: palette, detail: length >= 32 ? Math.min(length, 0x200) / 2 + ' colour(s) at most' : 'too small' }
    ];
    readings.sort(function (a, b) { return b.score - a.score; });
    var best = readings[0];
    var second = readings[1];
    return {
      offset: at, length: length,
      kind: best.score > 0.35 ? best.kind : 'other',
      score: best.score,
      margin: best.score - second.score,
      readings: readings,
      map: map, tiles: tiles
    };
  }

  /* Every block the ROM points at, with its kind. */
  function referencedKinds(bytes, options) {
    var opts = options || {};
    var system = opts.system || 'gba';
    if (!K.core.scanReferencedBlocks) return { blocks: [], byKind: {} };
    var ref = K.core.scanReferencedBlocks(bytes, {
      system: system, tileOnly: false, minSize: 0x20, maxSize: opts.maxSize || 0x20000
    });
    var out = [];
    ref.blocks.forEach(function (block) {
      var dec = K.core.decompressAt ? K.core.decompressAt(bytes, block.offset, {}) : null;
      var data = dec ? dec.data : bytes.slice(block.offset, Math.min(bytes.length, block.offset + (opts.rawSpan || 0x2000)));
      var length = dec ? dec.size : data.length;
      var classified = classifyBlock(data, { at: 0, length: length, format: opts.format, layout: opts.layout });
      if (!classified) return;
      out.push({
        offset: block.offset, refs: block.count, refAt: block.refs[0],
        compressed: !!dec, size: length,
        kind: classified.kind, score: classified.score, margin: classified.margin,
        readings: classified.readings, map: classified.map, tiles: classified.tiles
      });
    });
    var byKind = { tiles: [], map: [], palette: [], other: [] };
    out.forEach(function (b) { (byKind[b.kind] || byKind.other).push(b); });
    Object.keys(byKind).forEach(function (k) {
      byKind[k].sort(function (a, b) { return b.score - a.score || a.offset - b.offset; });
    });
    return { blocks: out, byKind: byKind, references: ref.references };
  }

  K.core.paletteScore = paletteScore;
  K.core.classifyBlock = classifyBlock;
  K.core.referencedKinds = referencedKinds;
})(window);