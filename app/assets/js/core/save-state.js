/* Save states: the game as it was running, not as it sits in the cartridge.
   
   A state is where the font really lives. Hunting for glyph shapes in the image found 41
   look-alikes on one cartridge and none on another; the tiles the text window is drawing right
   now are in VRAM, with the game's own palette, and that is what the in game picture needs.
   
   VBA-M writes a state as a PNG: the visible screen is the image itself and the machine's
   memory sits in a 'gbAs' chunk, zlib compressed. A GBA state is IWRAM 0x8000, EWRAM 0x40000,
   VRAM 0x18000, palette 0x400, OAM 0x400 and IO 0x400, after a 0x400 header of registers.
   Nothing here guesses a shape: the blocks are taken by their size, and the palette is checked
   by counting the colours it actually holds. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

  var GBA_BLOCKS = [
    { id: 'iwram', size: 0x8000 },
    { id: 'ewram', size: 0x40000 },
    { id: 'vram', size: 0x18000 },
    { id: 'palette', size: 0x400 },
    { id: 'oam', size: 0x400 },
    { id: 'io', size: 0x400 }
  ];
  var GBA_BLOCKS_TOTAL = 0x8000 + 0x40000 + 0x18000 + 0x400 + 0x400 + 0x400;

  function u32be(bytes, at) {
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  }

  /* Every chunk of a PNG, so the state chunk and the screenshot can be told apart. */
  function pngChunks(bytes) {
    if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47)) return null;
    var out = [];
    var at = 8;
    while (at + 8 <= bytes.length) {
      var len = u32be(bytes, at);
      var type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
      out.push({ type: type, at: at + 8, length: len });
      at += 12 + len;
      if (type === 'IEND') break;
    }
    return out;
  }

  /* BGR555, the only colour format a GBA palette holds. */
  function colourOf(word) {
    var r = word & 0x1F, g = (word >> 5) & 0x1F, b = (word >> 10) & 0x1F;
    return { r: (r << 3) | (r >> 2), g: (g << 3) | (g >> 2), b: (b << 3) | (b >> 2), word: word };
  }

  /* A palette is 256 colours and a game uses many of them; a run of zeros or of text bytes
     does not look like that. Used to confirm the block that the sizes point at. */
  function paletteScore(bytes, at) {
    if (at < 0 || at + 0x400 > bytes.length) return -1;
    var seen = {}, distinct = 0, nonZero = 0;
    for (var i = 0; i < 0x400; i += 2) {
      var word = bytes[at + i] | (bytes[at + i + 1] << 8);
      if (word === 0) continue;
      nonZero++;
      if (!seen[word]) { seen[word] = 1; distinct++; }
    }
    return distinct * 4 + nonZero;
  }

  function splitGbaBlocks(state) {
    if (state.length < GBA_BLOCKS_TOTAL) return null;
    var at = state.length - GBA_BLOCKS_TOTAL;
    var blocks = { header: state.slice(0, at) };
    for (var i = 0; i < GBA_BLOCKS.length; i++) {
      var b = GBA_BLOCKS[i];
      blocks[b.id] = state.slice(at, at + b.size);
      at += b.size;
    }
    return blocks;
  }

  /* The palette the sizes point at is checked, and when it is not a palette the whole state is
     searched for the run that is - with VRAM sitting right before it, which is how a GBA state
     is laid out. This keeps the reader working for a state written by another emulator. */
  function locatePalette(state, blocks) {
    var direct = blocks && blocks.palette ? state.length - GBA_BLOCKS_TOTAL + 0x8000 + 0x40000 + 0x18000 : -1;
    if (direct >= 0 && paletteScore(state, direct) >= 8) return { at: direct, vramAt: direct - 0x18000, how: 'block sizes' };
    var best = -1, bestScore = 127;
    for (var at = 0; at + 0x400 <= state.length; at += 2) {
      var s = paletteScore(state, at);
      if (s > bestScore) { bestScore = s; best = at; }
    }
    if (best < 0) return null;
    var vramAt = best - 0x18000;
    return { at: best, vramAt: vramAt >= 0 ? vramAt : -1, how: 'searched for the colours' };
  }

  /* The screenshot inside the PNG, unfiltered. Colour type 2 and 6, eight bits per channel,
     which is what every emulator writes. */
  function decodeScreenshot(bytes, chunks, inflateSync) {
    var ihdr = null, idat = [];
    for (var i = 0; i < chunks.length; i++) {
      if (chunks[i].type === 'IHDR') ihdr = chunks[i];
      if (chunks[i].type === 'IDAT') idat.push(bytes.slice(chunks[i].at, chunks[i].at + chunks[i].length));
    }
    if (!ihdr || idat.length === 0) return null;
    var width = u32be(bytes, ihdr.at), height = u32be(bytes, ihdr.at + 4);
    var depth = bytes[ihdr.at + 8], colour = bytes[ihdr.at + 9];
    if (depth !== 8 || (colour !== 2 && colour !== 6)) return null;
    var bpp = colour === 6 ? 4 : 3;
    var total = 0;
    for (var k = 0; k < idat.length; k++) total += idat[k].length;
    var joined = new Uint8Array(total), cursor = 0;
    for (var k2 = 0; k2 < idat.length; k2++) { joined.set(idat[k2], cursor); cursor += idat[k2].length; }
    var raw;
    try { raw = inflateSync(joined); } catch (e) { return null; }
    var stride = width * bpp;
    var out = new Uint8Array(height * stride);
    var pos = 0;
    for (var y = 0; y < height; y++) {
      var filter = raw[pos++];
      for (var x = 0; x < stride; x++) {
        var value = raw[pos + x];
        var left = x >= bpp ? out[y * stride + x - bpp] : 0;
        var up = y > 0 ? out[(y - 1) * stride + x] : 0;
        var upLeft = (y > 0 && x >= bpp) ? out[(y - 1) * stride + x - bpp] : 0;
        if (filter === 1) value += left;
        else if (filter === 2) value += up;
        else if (filter === 3) value += (left + up) >> 1;
        else if (filter === 4) {
          var pa = Math.abs(up - upLeft), pb = Math.abs(left - upLeft), pc = Math.abs(left + up - 2 * upLeft);
          value += (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
        }
        out[y * stride + x] = value & 0xFF;
      }
      pos += stride;
    }
    return { width: width, height: height, bpp: bpp, pixels: out };
  }

  /* State bytes in, machine blocks out. A plain (uncompressed) state is accepted too, so a
     state from another emulator is not refused just because it is not wrapped in a PNG. */
  function readState(bytes, options) {
    var opts = options || {};
    var inflateSync = opts.inflate || defaultInflate;
    var chunks = pngChunks(bytes);
    var state = null, kind = null, screenshot = null;
    if (chunks) {
      var stateChunk = null;
      for (var i = 0; i < chunks.length; i++) {
        if (/^gbAs|^VBA |^STAT/.test(chunks[i].type)) { stateChunk = chunks[i]; break; }
      }
      if (stateChunk) {
        var payload = bytes.slice(stateChunk.at, stateChunk.at + stateChunk.length);
        try { state = inflateSync(payload); kind = 'png-vba-m'; }
        catch (e) { state = payload; kind = 'png-raw'; }
      }
      var shot = decodeScreenshot(bytes, chunks, inflateSync);
      if (shot) screenshot = shot;
    } else {
      state = bytes; kind = 'raw';
    }
    if (!state) return null;
    var blocks = splitGbaBlocks(state);
    var palette = locatePalette(state, blocks);
    return {
      kind: kind,
      size: state.length,
      blocks: blocks,
      vram: blocks ? blocks.vram : (palette && palette.vramAt >= 0 ? state.slice(palette.vramAt, palette.vramAt + 0x18000) : null),
      paletteAt: palette ? palette.at : -1,
      paletteHow: palette ? palette.how : 'not found',
      colours: palette ? readColours(state, palette.at) : [],
      screenshot: screenshot
    };
  }

  function readColours(state, at) {
    var out = [];
    for (var i = 0; i < 0x400; i += 2) out.push(colourOf(state[at + i] | (state[at + i + 1] << 8)));
    return out;
  }

  /* Tiles of a character block: 4bpp, 8x8, 32 bytes each, palette index per pixel. The text
     font of a GBA game is in the first block, which is why the in game picture starts there. */
  function fontTiles(vram, options) {
    var opts = options || {};
    var block = Number(opts.block) || 0;
    var count = Number(opts.count) || 512;
    var bpp = Number(opts.bpp) || 4;
    if (!vram) return [];
    var bytesPerTile = bpp === 8 ? 64 : (bpp === 4 ? 32 : 16);
    var base = block * 0x4000;
    var tiles = [];
    for (var t = 0; t < count; t++) {
      var at = base + t * bytesPerTile;
      if (at + bytesPerTile > vram.length) break;
      var rows = [], used = 0;
      for (var y = 0; y < 8; y++) {
        var row = [];
        for (var x = 0; x < 8; x++) {
          var index = 0;
          if (bpp === 4) {
            var byte = vram[at + y * 4 + (x >> 1)];
            index = (x & 1) ? (byte >> 4) : (byte & 0x0F);
          } else if (bpp === 8) {
            index = vram[at + y * 8 + x];
          } else {
            var b2 = vram[at + y * 2 + (x >> 3)];
            index = (b2 >> (7 - (x & 7))) & 1;
          }
          if (index) used++;
          row.push(index);
        }
        rows.push(row);
      }
      tiles.push({ index: t, rows: rows, pixels: used });
    }
    return tiles;
  }

  function glyphsInUse(vram, options) {
    var tiles = fontTiles(vram, options);
    var out = [];
    for (var i = 0; i < tiles.length; i++) if (tiles[i].pixels > 0) out.push(tiles[i]);
    return out;
  }

  function defaultInflate(bytes) {
    if (global.pako && typeof global.pako.inflate === 'function') return global.pako.inflate(bytes);
    if (typeof require === 'function') { try { return require('zlib').inflateSync(Buffer.from(bytes)); } catch (e) { } }
    throw new Error('no inflate available in this environment');
  }

  core.saveState = {
    GBA_BLOCKS: GBA_BLOCKS,
    GBA_BLOCKS_TOTAL: GBA_BLOCKS_TOTAL,
    pngChunks: pngChunks,
    paletteScore: paletteScore,
    splitGbaBlocks: splitGbaBlocks,
    locatePalette: locatePalette,
    colourOf: colourOf,
    decodeScreenshot: decodeScreenshot,
    read: readState,
    fontTiles: fontTiles,
    glyphsInUse: glyphsInUse
  };
})(window);