/* ============================================================
   Ketor - VRAM map and the ROM side of a screen (Batch 56)
   ------------------------------------------------------------
   BGxCNT cannot be read from a ROM, but the ROM does contain
   the two things that matter, and they sit next to each other:

       ldr r0, =0x08200000     ; where the data is in the ROM
       ldr r1, =0x06008000     ; where it must end up in VRAM
       swi 0x12                ; LZ77UnCompVram

   The pair is the whole answer. A VRAM destination in the
   background area names a character base (16 KiB steps) or a
   screen base (2 KiB steps); the ROM address it comes from names
   the data. So a screen is found by finding the pair, not by
   guessing at offsets.

   VRAM layout, from GBATEK:
     0x06000000-0x0600FFFF  background tiles and maps
     0x06010000-0x06013FFF  object tiles
     0x06014000-0x06017FFF  object maps
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var VRAM_BASE = 0x06000000;
  var BG_END = 0x06010000;
  var OBJ_TILES_END = 0x06014000;
  var OBJ_MAP_END = 0x06018000;
  var CHAR_BLOCK = 0x4000;
  var SCREEN_BLOCK = 0x800;

  function vramKind(address) {
    var a = Number(address) >>> 0;
    if (a < VRAM_BASE || a >= OBJ_MAP_END) return null;
    if (a < BG_END) {
      var offset = a - VRAM_BASE;
      return {
        area: 'background',
        offset: offset,
        charBlock: Math.floor(offset / CHAR_BLOCK),
        charOffset: offset % CHAR_BLOCK,
        screenBlock: Math.floor(offset / SCREEN_BLOCK),
        screenOffset: offset % SCREEN_BLOCK,
        onCharBoundary: offset % CHAR_BLOCK === 0,
        onScreenBoundary: offset % SCREEN_BLOCK === 0
      };
    }
    if (a < OBJ_TILES_END) return { area: 'object tiles', offset: a - VRAM_BASE, charBlock: Math.floor((a - BG_END) / CHAR_BLOCK), onCharBoundary: (a - BG_END) % CHAR_BLOCK === 0 };
    return { area: 'object map', offset: a - VRAM_BASE, screenBlock: Math.floor((a - OBJ_TILES_END) / SCREEN_BLOCK), onScreenBoundary: (a - OBJ_TILES_END) % SCREEN_BLOCK === 0 };
  }

  function readU32(bytes, at) {
    if (!bytes || at < 0 || at + 4 > bytes.length) return null;
    return ((bytes[at] & 0xFF) | ((bytes[at + 1] & 0xFF) << 8) | ((bytes[at + 2] & 0xFF) << 16) | ((bytes[at + 3] & 0xFF) << 24)) >>> 0;
  }

  /* Every place the ROM names both a compressed block and a VRAM address close
     enough to belong to the same setup. Nothing is decoded here: a pair is a
     claim about where data goes, and the caller decides what that means. */
  /* The DMA registers. A copy to VRAM is set up by writing them, and the three
     words that matter - the register address, the source and the destination -
     sit in one compiled block. */
  var DMA_REGISTERS = (function () {
    var out = {};
    for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) out[0x040000B0 + i * 12 + j * 4] = 'DMA' + i;
    out[0x040000D4] = 'DMA3';   // the older names for the same registers
    out[0x040000D8] = 'DMA3';
    out[0x040000DC] = 'DMA3';
    return out;
  })();

  /* Pairs with evidence. Two measurements decided this shape:
     - proximity alone, a ROM address near a VRAM address, gives 7154 candidates on
       the test ROM, which is no answer at all;
     - requiring the DMA register that performs the copy in the same window gives 86,
       and 60 of them land exactly on a screen block boundary. */
  function findVramPairs(bytes, options) {
    var opts = options || {};
    var system = opts.system || 'gba';
    var window = Math.max(8, Number(opts.window) || 0x80);
    var pairs = [];
    if (!K.core.toRomOffset) return pairs;
    for (var at = 0; at + 4 <= bytes.length; at += 4) {
      var register = readU32(bytes, at);
      if (!DMA_REGISTERS[register]) continue;
      var from = Math.max(0, at - window);
      var to = Math.min(bytes.length - 4, at + window);
      var source = null, dest = null;
      for (var w = from; w <= to; w += 4) {
        var v = readU32(bytes, w);
        if (v >= 0x08000000 && v < 0x0A000000) {
          var off = K.core.toRomOffset(system, v, opts);
          if (off !== null && off >= 0 && off < bytes.length) source = { at: w, value: v, target: off };
        }
        if (v >= 0x06000000 && v < 0x06018000) dest = { at: w, value: v, kind: vramKind(v) };
      }
      if (!source || !dest) continue;
      var head = K.core.compressionHeaderAt ? K.core.compressionHeaderAt(bytes, source.target, { minSize: 0x40 }) : null;
      pairs.push({
        source: source.target, sourceAt: source.at, head: head,
        dest: dest.value, destAt: dest.at, kind: dest.kind,
        register: DMA_REGISTERS[register], registerAt: at,
        distance: Math.abs(source.at - dest.at)
      });
    }
    return pairs;
  }

  /* Screens: a pair whose VRAM destination sits on a screen block boundary and
     whose data decompresses to a whole number of cells. The character side is a
     pair that lands on a character block boundary. Together they are a screen;
     the score says how much the two agree. */
  function screenCandidates(bytes, options) {
    var opts = options || {};
    var layoutId = opts.layout || 'gba-text';
    var format = opts.format || 'gba-4bpp';
    var entryBytes = K.core.mapLayout ? K.core.mapLayout(layoutId).entryBytes : 2;
    var pairs = findVramPairs(bytes, opts);
    var screens = [];
    var chars = [];
    var seen = {};
    var MAP_SIZES = [0x800, 0x1000, 0x2000];   // 32x32, 64x32 or 32x64, 64x64
    pairs.forEach(function (pair) {
      var key = pair.source + ':' + pair.dest;
      if (seen[key]) return;
      seen[key] = true;
      /* A DMA copy is usually raw bytes; a BIOS call is a compressed stream. Both
         are here, so both are read: the compressed one through the decoder, the raw
         one straight from the ROM, with the span taken from where it is going. */
      var data = null, compressed = false;
      if (pair.head && K.core.decompressAt) {
        var dec = K.core.decompressAt(bytes, pair.source, {});
        if (dec) { data = dec.data; compressed = true; }
      }
      if (!data) {
        var span = (pair.kind.area === 'background' && !pair.kind.onScreenBoundary) ? 0x4000 : 0x2000;
        data = bytes.slice(pair.source, Math.min(bytes.length, pair.source + span));
      }
      if (!data || !data.length) return;
      if (pair.kind.area === 'background' && pair.kind.onScreenBoundary) {
        // the shape of a screen is decided by scoring the usual sizes, not by guessing one
        var best = null;
        MAP_SIZES.forEach(function (size) {
          var usable = Math.min(size, data.length);
          var cells = Math.floor(usable / entryBytes);
          if (cells < 256) return;
          var score = K.core.scoreMapBlock ? K.core.scoreMapBlock(data, 0, cells, 32, layoutId) : null;
          if (!score) return;
          if (!best || score.score > best.layout) {
            best = { size: size, cells: cells, cols: 32, layout: score.score, distinct: score.distinct };
          }
        });
        if (best) {
          screens.push({
            offset: pair.source, size: best.size, cells: best.cells, cols: best.cols,
            vram: pair.dest, screenBlock: pair.kind.screenBlock,
            layout: best.layout, distinct: best.distinct,
            compressed: compressed, data: data
          });
        }
      }
      if (K.core.tileSize && (pair.kind.onCharBoundary || pair.kind.area === 'object tiles')) {
        var tileBytes = K.core.tileSize(format);
        var tiles = Math.floor(Math.min(data.length, 0x4000) / tileBytes);
        if (tiles >= 16) {
          chars.push({
            offset: pair.source, size: tiles * tileBytes, vram: pair.dest,
            charBlock: pair.kind.charBlock, tiles: tiles,
            compressed: compressed, data: data
          });
        }
      }
    });
    /* every screen against every character block it could be drawn with */
    var out = [];
    screens.forEach(function (screen) {
      chars.forEach(function (char) {
        var usage = K.core.mapUsageScore
          ? K.core.mapUsageScore(screen.data, 0, screen.cells, screen.cols, { layout: layoutId, format: format, charBase: 0 })
          : null;
        // the gathered tiles of the candidate character block, measured the same way
        var gathered = K.core.mapUsageScore && K.core.tileSize
          ? gatherReferenced(screen.data, screen.cells, screen.cols, char.data, format, layoutId)
          : null;
        var art = gathered ? gathered.artScore : 0;
        out.push({
          screen: screen, char: char,
          layout: screen.layout,
          art: art,
          distinct: gathered ? gathered.distinct : 0,
          tiles: gathered ? gathered.tiles : 0,
          score: screen.layout * 0.5 + art * 0.5
        });
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return { pairs: pairs.length, screens: screens, chars: chars, candidates: out };
  }

  /* The tiles a map names, taken from a given tile buffer, measured with the tile
     score so a pairing either looks like a drawing or it does not. */
  function gatherReferenced(mapBytes, cells, cols, charBytes, format, layoutId) {
    var size = K.core.tileSize(format);
    var seen = {};
    var order = [];
    for (var c = 0; c < cells; c++) {
      var v = K.core.readMapEntry(mapBytes, c * (K.core.mapLayout(layoutId).entryBytes), layoutId);
      var t = K.core.entryTile(v, layoutId);
      if (!seen[t]) { seen[t] = true; order.push(t); }
    }
    var limit = Math.min(order.length, 96);
    var gathered = new Uint8Array(limit * size);
    var kept = 0;
    for (var i = 0; i < limit; i++) {
      var at = order[i] * size;
      if (at < 0 || at + size > charBytes.length) continue;
      for (var j = 0; j < size; j++) gathered[kept * size + j] = charBytes[at + j] & 0xFF;
      kept++;
    }
    if (kept < 2) return { artScore: 0, distinct: order.length, tiles: kept };
    return {
      artScore: K.core.scoreTileRegion ? K.core.scoreTileRegion(gathered, 0, format, Math.min(64, kept)) : 0,
      distinct: order.length,
      tiles: kept
    };
  }

  K.core.VRAM = { base: VRAM_BASE, charBlock: CHAR_BLOCK, screenBlock: SCREEN_BLOCK, bgEnd: BG_END, objTilesEnd: OBJ_TILES_END, objMapEnd: OBJ_MAP_END };
  K.core.vramKind = vramKind;
  K.core.findVramPairs = findVramPairs;
  K.core.screenCandidates = screenCandidates;
  K.core.gatherReferenced = gatherReferenced;
})(window);