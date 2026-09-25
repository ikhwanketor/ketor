/* ============================================================
   Ketor - Map codec (Batch 51)
   ------------------------------------------------------------
   A map cell is a number that names a tile plus a few bits that say
   how to draw it. Every console packs those bits differently:

     gba-text       2 bytes: tile 0-9, flip 10-11, palette bank 12-15
     snes-text      2 bytes: tile 0-9, palette 10-12, priority 13,
                    flip 14-15
     genesis-plane  2 bytes: tile 0-10, flip 11-12, palette 13-14,
                    priority 15
     gb-map         1 byte:  the tile number, nothing else
     nes-nametable  1 byte:  the tile number, attributes live in a
                    separate 64 byte table after the cells

   Scoring a block as a map lives here too, because the score has to
   know how many bytes a cell takes.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var LAYOUTS = {
    'gba-text': {
      id: 'gba-text', label: 'GBA text mode BG',
      entryBytes: 2, tileBits: 10, tileMask: 0x3FF,
      flipH: 0x400, flipV: 0x800, paletteShift: 12, paletteMask: 0xF,
      sizes: { '32x32': [32, 32], '64x32': [64, 32], '32x64': [32, 64], '64x64': [64, 64] },
      align: 0x800
    },
    'snes-text': {
      id: 'snes-text', label: 'SNES tilemap',
      entryBytes: 2, tileBits: 10, tileMask: 0x3FF,
      flipH: 0x4000, flipV: 0x8000, paletteShift: 10, paletteMask: 0x7,
      priority: 0x2000,
      sizes: { '32x32': [32, 32], '64x32': [64, 32], '32x64': [32, 64], '64x64': [64, 64] },
      align: 0x800
    },
    'genesis-plane': {
      id: 'genesis-plane', label: 'Mega Drive plane',
      entryBytes: 2, tileBits: 11, tileMask: 0x7FF,
      flipH: 0x800, flipV: 0x1000, paletteShift: 13, paletteMask: 0x3,
      priority: 0x8000,
      sizes: { '32x32': [32, 32], '64x32': [64, 32], '32x64': [32, 64], '64x64': [64, 64] },
      align: 0x2000
    },
    'gb-map': {
      id: 'gb-map', label: 'Game Boy 32x32 map',
      entryBytes: 1, tileBits: 8, tileMask: 0xFF,
      sizes: { '32x32': [32, 32] },
      align: 0x400
    },
    'nes-nametable': {
      id: 'nes-nametable', label: 'NES nametable',
      entryBytes: 1, tileBits: 8, tileMask: 0xFF,
      sizes: { '32x30': [32, 30] },
      align: 0x400, attributeBytes: 64
    }
  };

  function layoutOf(id) { return LAYOUTS[id] || LAYOUTS['gba-text']; }

  function sizesOf(id) { return layoutOf(id).sizes; }

  function readEntry(bytes, offset, layoutId) {
    var L = layoutOf(layoutId);
    if (!bytes || offset < 0 || offset + L.entryBytes > bytes.length) return null;
    if (L.entryBytes === 1) return bytes[offset] & 0xFF;
    return ((bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8)) & 0xFFFF;
  }

  function entryTile(v, layoutId) { return (Number(v) || 0) & layoutOf(layoutId).tileMask; }
  function entryFlipH(v, layoutId) { var L = layoutOf(layoutId); return !!L.flipH && ((Number(v) || 0) & L.flipH) !== 0; }
  function entryFlipV(v, layoutId) { var L = layoutOf(layoutId); return !!L.flipV && ((Number(v) || 0) & L.flipV) !== 0; }
  function entryPalette(v, layoutId) {
    var L = layoutOf(layoutId);
    if (!L.paletteMask) return 0;
    return ((Number(v) || 0) >> L.paletteShift) & L.paletteMask;
  }
  function entryPriority(v, layoutId) {
    var L = layoutOf(layoutId);
    return !!L.priority && ((Number(v) || 0) & L.priority) !== 0;
  }

  /* Builds a cell value. A field the caller leaves out keeps the value it
     already has in "current", so placing a tile never silently resets a flip
     or a palette bank that was there. */
  function buildEntry(parts, layoutId, current) {
    var L = layoutOf(layoutId);
    var v = Number(current) || 0;
    v &= ~L.tileMask;
    v |= (Number(parts && parts.tile) || 0) & L.tileMask;
    if (L.flipH && parts && parts.flipH !== undefined && parts.flipH !== null) {
      v = parts.flipH ? (v | L.flipH) : (v & ~L.flipH);
    }
    if (L.flipV && parts && parts.flipV !== undefined && parts.flipV !== null) {
      v = parts.flipV ? (v | L.flipV) : (v & ~L.flipV);
    }
    if (L.paletteMask && parts && parts.palette !== undefined && parts.palette !== null) {
      v &= ~(L.paletteMask << L.paletteShift);
      v |= ((Number(parts.palette) & L.paletteMask) << L.paletteShift);
    }
    if (L.priority && parts && parts.priority !== undefined && parts.priority !== null) {
      v = parts.priority ? (v | L.priority) : (v & ~L.priority);
    }
    return v & 0xFFFF;
  }

  function entryBytesOf(v, layoutId) {
    var L = layoutOf(layoutId);
    var x = Number(v) || 0;
    if (L.entryBytes === 1) return [x & 0xFF];
    return [x & 0xFF, (x >> 8) & 0xFF];
  }

  /* Is this block laid out like a map? A real map repeats tiles in runs and
     uses a believable number of different tiles. Repetition alone is not
     enough: the first version of this score picked stripe textures on the
     test ROM, nine tiles stretched over a thousand cells. */
  function scoreMapBlock(bytes, offset, cells, cols, layoutId, options) {
    var opts = options || {};
    var L = layoutOf(layoutId);
    var width = cols || 32;
    if (!bytes || offset < 0 || offset + cells * L.entryBytes > bytes.length) return null;
    var seen = {};
    var distinct = 0;
    var highBits = 0;
    var runs = 0;
    var prev = -1;
    var maxTile = 0;
    for (var c = 0; c < cells; c++) {
      var v = readEntry(bytes, offset + c * L.entryBytes, layoutId);
      var t = entryTile(v, layoutId);
      if (!seen[t]) { seen[t] = true; distinct++; }
      if (t > maxTile) maxTile = t;
      if (L.paletteMask && entryPalette(v, layoutId) > 3) highBits++;
      if (c % width === 0 || t !== prev) runs++;
      prev = t;
    }
    /* A text mode map can only name the tiles of one character block: 512 of them for
       4bpp, 256 for 8bpp. A block that names tiles past that cannot be drawn by the
       hardware it is meant to run on, so it is data and not a map. Measured on the test
       ROM this is the whole difference between 539 candidates and 3. */
    var limit = opts.charTiles === undefined ? 0 : Number(opts.charTiles) || 0;
    var overLimit = limit > 0 && maxTile >= limit;
    var share = distinct / cells;
    var highShare = highBits / cells;
    var meanRun = cells / Math.max(1, runs);
    var runTerm = Math.max(0, Math.min(1, (meanRun - 1) / 3));
    var band;
    if (share < 0.02) band = 0.2;
    else if (share < 0.05) band = 0.6;
    else if (share <= 0.35) band = 1;
    else band = 0.3;
    var score = runTerm * 0.4 + band * 0.4 + (1 - highShare) * 0.2;
    if (distinct < 4) score *= 0.3;
    if (overLimit) score *= 0.05;
    return {
      offset: offset,
      score: Math.max(0, Math.min(1, score)),
      maxTile: maxTile,
      charTiles: limit,
      overLimit: overLimit,
      distinct: distinct,
      highShare: highShare,
      share: share,
      meanRun: meanRun,
      entryBytes: L.entryBytes
    };
  }

  /* Corroboration for a map candidate, and it is the question a reverse engineer
     asks out loud: does what this map points at make sense? The tiles a real map
     references are the art of that screen, so together they score like art. Packed
     data references tile numbers that lead nowhere in particular, and the tiles it
     would draw do not read as a drawing at all.
     The referenced tiles are gathered into one buffer and measured with the same
     tile score the tile editor uses, so both detectors agree on what art is. */
  function mapUsageScore(bytes, mapOffset, cells, cols, options) {
    var opts = options || {};
    var layoutId = opts.layout || 'gba-text';
    var L = layoutOf(layoutId);
    var format = opts.format || 'gba-4bpp';
    var charBase = opts.charBase;
    if (!bytes || charBase === undefined || charBase === null) return null;
    var tileSize = (K.core.tileSize ? K.core.tileSize(format) : 32);
    var used = {};
    var order = [];
    for (var c = 0; c < cells; c++) {
      var v = readEntry(bytes, mapOffset + c * L.entryBytes, layoutId);
      var t = entryTile(v, layoutId);
      if (!used[t]) { used[t] = true; order.push(t); }
    }
    var limit = Math.min(order.length, 96);
    var gathered = new Uint8Array(limit * tileSize);
    var kept = 0;
    for (var i = 0; i < limit; i++) {
      var at = charBase + order[i] * tileSize;
      if (at < 0 || at + tileSize > bytes.length) continue;
      for (var j = 0; j < tileSize; j++) gathered[kept * tileSize + j] = bytes[at + j] & 0xFF;
      kept++;
    }
    if (kept < 2 || !K.core.scoreTileRegion) return { distinct: order.length, tiles: kept, artScore: 0, verified: false };
    var art = K.core.scoreTileRegion(gathered, 0, format, Math.min(64, kept));
    return {
      distinct: order.length,
      tiles: kept,
      artScore: art,
      // a map whose tiles read as art is corroborated; a block of data is not
      verified: art >= 0.6
    };
  }

  K.core.mapUsageScore = mapUsageScore;
  K.core.MAP_LAYOUTS = LAYOUTS;
  K.core.mapLayout = layoutOf;
  K.core.mapSizes = sizesOf;
  K.core.readMapEntry = readEntry;
  K.core.entryTile = entryTile;
  K.core.entryFlipH = entryFlipH;
  K.core.entryFlipV = entryFlipV;
  K.core.entryPalette = entryPalette;
  K.core.entryPriority = entryPriority;
  K.core.buildEntry = buildEntry;
  K.core.entryBytesOf = entryBytesOf;
  K.core.scoreMapBlock = scoreMapBlock;
})(window);
