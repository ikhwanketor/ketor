/* Save states: the game as it was running, not as it sits in the cartridge.
   
   A state is where the font really lives. Hunting for glyph shapes in the image found 41
   look-alikes on one cartridge and none on another; the tiles the text window is drawing right
   now are in VRAM, with the game's own palette, and that is what the in game picture needs.
   
   VBA-M writes a state as a PNG: the visible screen is the image itself and the machine's
   memory sits in a 'gbAs' chunk, zlib compressed. A GBA state is IWRAM 0x8000, EWRAM 0x40000,
   VRAM 0x18000, palette 0x400, OAM 0x400 and IO 0x400, after a 0x400 header of registers.
   The offsets below are the layout a GBA state is written in, and they are still a hypothesis:
   the state the translator sent inflates to 0x61000 bytes and its tail from 0x60000 on is zeros,
   so the palette is not where the sizes point. Searching for it is no answer either - 59401
   windows of EWRAM scored above 60 distinct halfwords on that state, which is data, not colours.
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

  /* The screen is the ground truth for the palette: every colour on it came out of palette RAM,
     so the window that covers those colours is the palette. On the state the translator sent this
     found the run at 0x7A0, covering 112 of the 167 colours on screen (the runner up was its own
     neighbour at 0x7A2, so the peak is single and clear), while looking for a window that is
     merely rich in colours offered 59401 candidates inside EWRAM - that was data, not colours.
     It locates colours. It says nothing about where VRAM is: the tile layout still needs the
     emulator's own writer order, and a screenshot is a composited frame, not a set of tiles. */
  function locatePaletteByScreenshot(screenshot, state, options) {
    var opts = options || {};
    if (!screenshot || !screenshot.pixels) return null;
    var wanted = {}, total = 0;
    for (var i = 0; i < screenshot.pixels.length; i += screenshot.bpp) {
      var key = (screenshot.pixels[i] << 16) | (screenshot.pixels[i + 1] << 8) | screenshot.pixels[i + 2];
      if (!wanted[key]) { wanted[key] = 1; total++; }
    }
    if (total === 0) return null;
    var best = null;
    for (var at = 0; at + 0x400 <= state.length; at += 2) {
      var seen = {}, covered = 0;
      for (var k = 0; k < 0x400; k += 2) {
        var word = state[at + k] | (state[at + k + 1] << 8);
        var c = colourKey(word);
        if (wanted[c] && !seen[c]) { seen[c] = 1; covered++; }
      }
      if (!best || covered > best.covered) best = { at: at, covered: covered };
    }
    if (!best) return null;
    var share = best.covered / total;
    if (share < (Number(opts.minShare) || 0.4)) return null;
    return { at: best.at, covered: best.covered, total: total, share: share, how: 'screenshot colours' };
  }

  /* The packed colour the screenshot is written in, from a BGR555 palette word. */
  function colourKey(word) {
    var c = colourOf(word);
    return (c.r << 16) | (c.g << 8) | c.b;
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
    /* Prefer the palette the screen proves over the one a size calculation put there. */
    if ((!palette || palette.how !== 'block sizes') && screenshot) {
      var byScreen = locatePaletteByScreenshot(screenshot, state);
      if (byScreen) palette = { at: byScreen.at, vramAt: -1, how: byScreen.how, covered: byScreen.covered, total: byScreen.total };
    }
    return {
      kind: kind,
      size: state.length,
      blocks: blocks,
      /* VRAM is only handed out when the block sizes placed it. A palette that had to be
         searched for says nothing about where VRAM is, and a wrong VRAM would be read as a
         font: the caller gets null and has to say so instead of showing shapes that are not
         glyphs. */
      blocksTrusted: !!(palette && palette.how === 'block sizes'),
      vram: (palette && palette.how === 'block sizes') ? (blocks ? blocks.vram : null) : null,
      paletteAt: palette ? palette.at : -1,
      paletteHow: palette ? palette.how : 'not found',
      paletteCovered: palette && palette.covered !== undefined ? palette.covered : -1,
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

  /* A VBA state is gzip and, unlike the mGBA PNG states, it really does carry VRAM and the
     palette. Its writer order is known from the source (CPUWriteState): after the header comes
     IWRAM 0x8000, then the palette 0x400, then EWRAM 0x40000, then VRAM 0x18000. The header is
     large (the state is 2MB while those blocks are only 0x60C00), so the palette is found by the
     colours the screen shows and VRAM follows from the order. Measured on a state saved together
     with a screenshot: palette at 0x1C40 covering 256 of 263 screen colours (97.3%), VRAM at
     0x42040 with 381 tiles in use and a run of glyph tiles. */
  function colourWordsOfScreenshot(screenshot) {
    var words = [], seen = {};
    for (var i = 0; i < screenshot.pixels.length; i += screenshot.bpp) {
      var r = screenshot.pixels[i], g = screenshot.pixels[i + 1], b = screenshot.pixels[i + 2];
      var word = ((b >> 3) << 10) | ((g >> 3) << 5) | (r >> 3);
      if (!seen[word]) { seen[word] = 1; words.push(word); }
    }
    return words;
  }

  /* The same idea as locatePaletteByScreenshot, without needing the pixels: a list of BGR555
     words is enough, and a test can hand one in directly. */
  function locatePaletteByWords(words, state, options) {
    var opts = options || {};
    if (!words || !words.length) return null;
    var want = new Uint8Array(65536);
    for (var i = 0; i < words.length; i++) want[words[i] & 0xFFFF] = 1;
    var half = new Uint16Array(state.buffer, state.byteOffset, Math.floor(state.length / 2));
    /* Distinct colours, not entries: a run of zeros matches the transparent black of the screen
       on every entry it holds, and counting entries let a window of padding beat the palette.
       The stamp array keeps the count exact without allocating per window. */
    var stamp = new Int32Array(65536);
    var stampId = 0;
    var best = null;
    for (var w = 0; w + 256 <= half.length; w++) {
      stampId++;
      var hit = 0;
      for (var k = 0; k < 256; k++) {
        var word = half[w + k];
        if (!want[word] || stamp[word] === stampId) continue;
        stamp[word] = stampId;
        hit++;
      }
      /* A window that overlaps a palette covers the same colours as the palette itself, so the
         last of the equal best is taken: that is the window starting at the first colour. */
      if (!best || hit >= best.hit) best = { w: w, hit: hit };
    }
    if (!best) return null;
    var share = best.hit / words.length;
    if (share < (Number(opts.minShare) || 0.5)) return null;
    return { at: best.w * 2, covered: best.hit, total: words.length, share: share, how: 'screenshot colours' };
  }

  /* A VBA state: gunzip, find the palette from what the screen showed, and take VRAM where the
     writer order puts it. The blocks are only handed out when the palette was proven by the
     screen, exactly like the PNG reader. */
  function readVbaState(bytes, options) {
    var opts = options || {};
    var inflateSync = opts.inflate || defaultInflate;
    var state = bytes;
    if (bytes[0] === 0x1F && bytes[1] === 0x8B) {
      try { state = inflateSync(bytes); } catch (e) { return null; }
      state = new Uint8Array(state);
    }
    if (state.length < 0x60C00) return null;
    var words = opts.words || (opts.screenshot ? colourWordsOfScreenshot(opts.screenshot) : null);
    var palette = words ? locatePaletteByWords(words, state, opts) : null;
    var vramAt = palette ? palette.at + 0x400 + 0x40000 : -1;
    var vram = (palette && vramAt + 0x18000 <= state.length) ? state.slice(vramAt, vramAt + 0x18000) : null;
    return {
      kind: 'vba-sgm',
      size: state.length,
      state: state,
      paletteAt: palette ? palette.at : -1,
      paletteCovered: palette ? palette.covered : -1,
      paletteTotal: palette ? palette.total : -1,
      paletteHow: palette ? palette.how : 'not found',
      colours: palette ? readColours(state, palette.at) : [],
      vramAt: vramAt,
      vram: vram,
      blocksTrusted: !!palette
    };
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
    locatePaletteByScreenshot: locatePaletteByScreenshot,
    colourKey: colourKey,
    colourOf: colourOf,
    decodeScreenshot: decodeScreenshot,
    read: readState,
    readVbaState: readVbaState,
    locatePaletteByWords: locatePaletteByWords,
    colourWordsOfScreenshot: colourWordsOfScreenshot,
    fontTiles: fontTiles,
    glyphsInUse: glyphsInUse
  };
})(window);