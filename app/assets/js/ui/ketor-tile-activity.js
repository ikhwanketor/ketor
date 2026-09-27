/* ============================================================
   Ketor - Tile activity (Batch 47, extended in Batch 48)
   ------------------------------------------------------------
   State, editor tab and sidebar in one module, because they share
   one small store and the activity is one thing.

   Rules it follows:
   - It owns no byte buffer. A pixel change is written through the
     Hex Editor patch layer (K.hex.setByte), so it turns red as a
     changed byte, takes part in Clear / Undo / Redo and is written
     by Export like any other patch.
   - What it draws is read back through the same patch layer, so a
     painted pixel is visible immediately instead of being decoded
     from the untouched ROM again.
   - Clicking a tile selects its bytes in the Hex Editor, and moving
     the Hex Editor cursor highlights the tile and the pixels of the
     byte it sits on. The two views always agree.
   - The region and the format are detected by score, but a candidate
     is only proposed; the user confirms or picks another one.
   - A palette is read from the ROM as BGR555 (GBA) and a colour edit
     is written back through the patch layer, never into a copy.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var uE = R.useEffect;
  var uR = R.useRef;
  var MONO = 'var(--kt-font-mono)';
  var PALETTE_COLOURS = 16;

  /* Which console the loaded ROM is, so the format list, the map layout and the
     compression schemes come from its profile instead of from a guess. */
  function consoleProfile() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    // what the identifier worked out wins over the loader's label
    var name = (_state.romIdentity && _state.romIdentity.system) || (h ? h.romSystem : '');
    if (!K.core || !K.core.consoleProfile) return { id: 'unknown', label: 'Unknown', tileFormats: ['gba-4bpp'], defaultFormat: 'gba-4bpp', mapLayout: 'gba-text', compression: [] };
    return K.core.consoleProfile(name);
  }

  function mapLayoutId() {
    var p = consoleProfile();
    return p.mapLayout || 'gba-text';
  }

  var _state = {
    region: null,
    // a compressed graphic the user picked: the editor then reads the
    // decompressed bytes instead of the ROM
    graphicSource: null,
    romIdentity: null,
    inspector: true,
    fontBase: 0,
    // a font does not have to start at code 0: the one in this ROM starts at 0x20,
    // so its first tile is the space and A is the 34th tile of the sheet
    fontFirstCode: 0x20,
    format: 'gba-4bpp',
    palette: null,
    paletteOffset: null,
    paletteName: '',
    paletteCandidates: [],
    colour: 1,
    view: 'tiles',
    mapScreenBase: null,
    mapCharBase: null,
    mapSize: '32x32',
    mapDrawTile: null,
    mapCandidates: [],
    mapCursor: -1,
    screens: [],
    palettes: [],
    savedScreens: [],
    mapScanning: false,
    mapFlipH: false,
    mapFlipV: false,
    zoom: 2,
    /* The toolbar controls are ordinary buttons and a checkbox: no global keyboard
       handler lives in this activity, so the offset and stride boxes stay free to
       type in. Ctrl+C/V follows later for copy/paste of a region and is active only
       while the canvas has the focus. */
    grid: true,
    tiles: 128,
    candidates: [],
    scanning: false,
    status: ''
  };
  var _subs = new Set();
  function _set(patch) {
    var changed = false;
    var next = _state;
    Object.keys(patch).forEach(function (k) {
      if (_state[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = patch[k];
      }
    });
    if (changed) { _state = next; _subs.forEach(function (f) { try { f(); } catch (_) { } }); }
  }
  function getState() { return _state; }
  function subscribe(fn) { _subs.add(fn); return function () { _subs.delete(fn); }; }
  function useTile() { return R.useSyncExternalStore(subscribe, getState); }

  function hex6(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '------';
    return v.toString(16).toUpperCase().padStart(6, '0');
  }

  function romBytes() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    return h ? h.romBytes : null;
  }

  /* ---------- colour ---------- */

  // Plain ramp, used until a palette is read from the ROM: black, white, two greys.
  function rampColour(index) {
    var v = Math.max(0, Math.min(15, Number(index) || 0));
    var g = Math.round(v * 17);
    return { r: g, g: g, b: Math.round(g * 0.85) };
  }

  // GBA/SNES style BGR555 word: bit 0-4 red, 5-9 green, 10-14 blue, bit 15 unused.
  function fromBgr555(lo, hi) {
    var v = ((lo & 0xFF) | ((hi & 0xFF) << 8)) & 0xFFFF;
    var r5 = v & 31, g5 = (v >> 5) & 31, b5 = (v >> 10) & 31;
    return { r: (r5 << 3) | (r5 >> 2), g: (g5 << 3) | (g5 >> 2), b: (b5 << 3) | (b5 >> 2) };
  }
  function toBgr555(c) {
    var r5 = (Math.max(0, Math.min(255, c.r | 0)) >> 3) & 31;
    var g5 = (Math.max(0, Math.min(255, c.g | 0)) >> 3) & 31;
    var b5 = (Math.max(0, Math.min(255, c.b | 0)) >> 3) & 31;
    return (r5 | (g5 << 5) | (b5 << 10)) & 0xFFFF;
  }
  function paletteColour(index) {
    var p = _state.palette;
    var i = Number(index) || 0;
    if (p && p[i]) return p[i];
    return rampColour(i);
  }
  function colourCss(index) {
    var c = paletteColour(index);
    return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
  }
  function colourHex(c) {
    function p2(n) { var s = Math.max(0, Math.min(255, n | 0)).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + p2(c.r) + p2(c.g) + p2(c.b);
  }

  /* ---------- bytes: everything is read and written through the hex patch layer ---------- */

  function patchesMap() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    return (h && h.patches) || {};
  }

  function windowStart() {
    var r = Number(_state.region);
    return Number.isFinite(r) ? r : 0;
  }

  /* The visible tiles with the current patches applied. Without this the canvas
     would redraw the untouched ROM and a painted pixel would vanish. */
  function regionWindow() {
    var C = K.core;
    var gs = _state.graphicSource;
    if (gs && gs.data) {
      var gsSize = C.tileSize(_state.format);
      var from = gs.dataOffset || 0;
      var visible = Math.min(gs.data.length - from, gsSize * _state.tiles);
      var slice = gs.data.slice(from, from + visible);
      return {
        start: gs.offset,
        bytes: slice,
        compressed: { offset: gs.offset, label: gs.label, size: gs.size, dataOffset: gs.dataOffset || 0 },
        key: 'compressed:' + gs.offset + ':' + slice.length + ':' + (gs.version || 0)
      };
    }
    var src = romBytes();
    if (!src || !C || typeof C.tileSize !== 'function') return null;
    var start = windowStart();
    var size = C.tileSize(_state.format) * _state.tiles;
    var end = Math.min(src.length, start + size);
    if (!(end > start)) return null;
    var out = src.slice(start, end);
    var patches = patchesMap();
    var keyParts = [];
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= start && off < end) {
        out[off - start] = patches[k] & 0xFF;
        keyParts.push(k + '=' + (patches[k] & 0xFF));
      }
    });
    return { start: start, bytes: out, key: start + ':' + out.length + ':' + keyParts.join(',') };
  }

  function tileWindowOffset(tileIndex, C) {
    return Number(tileIndex) * C.tileSize(_state.format);
  }

  function readTile(tileIndex) {
    var win = regionWindow();
    var C = K.core;
    if (!win || !C || typeof C.decodeTile !== 'function') return null;
    var off = tileWindowOffset(tileIndex, C);
    if (off < 0 || off + C.tileSize(_state.format) > win.bytes.length) return null;
    return C.decodeTile(win.bytes, off, _state.format);
  }

  function tileAbsoluteOffset(tileIndex, C) {
    return windowStart() + tileWindowOffset(tileIndex, C);
  }

  /* Writes one pixel through the Hex Editor patch layer. */
  function setPixel(tileIndex, x, y, colour) {
    var C = K.core;
    var win = regionWindow();
    if (!win || !C || typeof C.encodeTile !== 'function') return false;
    var fmt = _state.format;
    var size = C.tileSize(fmt);
    var rel = tileWindowOffset(tileIndex, C);
    if (rel < 0 || rel + size > win.bytes.length) return false;
    var px = C.decodeTile(win.bytes, rel, fmt);
    var value = (Number(colour) || 0) & (C.tileFormat(fmt).colors - 1);
    if (px[y][x] === value) return false;
    px[y][x] = value;
    var encoded = C.encodeTile(px, fmt);

    /* A compressed graphic is edited in its decompressed copy first; the write back
       compresses it again and either fits it where it was or moves the whole thing
       and redirects the pointers to it. */
    if (win.compressed) {
      var gs = _state.graphicSource;
      var from = gs.dataOffset || 0;
      var changed = 0;
      for (var i = 0; i < encoded.length; i++) {
        if (gs.data[from + rel + i] === encoded[i]) continue;
        gs.data[from + rel + i] = encoded[i];
        changed++;
      }
      if (!changed) return false;
      _set({
        graphicSource: Object.assign({}, gs, { version: (gs.version || 0) + 1, dirty: true }),
        status: 'Pixel (' + x + ',' + y + ') colour ' + value + ' drawn on the decompressed copy; writing back...'
      });
      scheduleCompressedWrite();
      return true;
    }

    var base = win.start + rel;
    var written = 0;
    for (var i = 0; i < encoded.length; i++) {
      if (encoded[i] === (win.bytes[rel + i] & 0xFF)) continue;
      if (K.hex && K.hex.setByte && K.hex.setByte(base + i, encoded[i])) written++;
    }
    if (written && x >= 0) {
      _set({ status: 'Pixel (' + x + ',' + y + ') colour ' + value + ' written: ' + written + ' byte(s) at 0x' + hex6(base) + '.' });
    }
    return written > 0;
  }

  /* Which pixels of a tile one byte covers, so the Hex Editor cursor can be
     shown on the canvas. 4bpp: two pixels, 8bpp: one, 2bpp planes: a row. */
  /* Which pixels of a tile one byte covers comes from the shared mapping, so the
     hex cursor lands on the same pixels the codec reads. */
  function pixelSpanForByte(format, index) {
    if (!K.core.byteToPixels || !K.core.tileFormat) return null;
    return K.core.byteToPixels(K.core.tileFormat(format), index, 8);
  }

  /* ---------- detection ---------- */

  /* Score every 64 KiB step and keep the best few, so detection proposes a
     region instead of silently choosing one. */
  /* Detection follows what the console actually does. On a GBA or a DS almost
     every graphic is LZ77 or RLE compressed, and the tools the ROM hacking
     community uses find them by their four byte header - searching raw regions
     there means scoring padding and packed tables. On a Game Boy, NES, SNES or
     Mega Drive the tiles sit in the ROM as they are, so a raw region scan is the
     right tool. Both are run when both make sense, and the result says which is
     which. */
  function detect() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return; }
    var C = K.core;
    if (!C || typeof C.scanTileRegions !== 'function') { _set({ status: 'Tile codec missing.' }); return; }
    var prof = consoleProfile();
    var fmt = _state.format;
    _set({ scanning: true, graphicSource: null, status: 'Scanning ' + prof.label + ' for ' + fmt + ' graphics...' });
    var candidates = [];
    var decodedBlocks = 0;
    var referenced = 0;

    /* The strongest evidence available: a word in the ROM that names this block.
       The game points at its own graphics, so these are graphics whatever a score
       thinks, and they are also the ones a blind scan misses. Measured on the test
       ROM: 63 referenced blocks, 18 of them art, and the blind scan ranks none of
       them in its top forty. */
    // the console needs a bus the pointer map knows; asking whether offset 0 converts
    // is the wrong question, because offset 0 is not a bus address
    var busKnown = !!(C.pointerSystem && C.pointerSystem(prof.id)) && prof.compression && prof.compression.length > 0;
    if (typeof C.scanReferencedBlocks === 'function' && busKnown) {
      var ref = C.scanReferencedBlocks(bytes, { system: prof.id, tileOnly: true, minSize: 0x40, maxSize: 0x20000 });
      referenced = ref.blocks.length;
      ref.blocks.forEach(function (b) {
        var dec = C.decompressAt(bytes, b.offset, {});
        if (!dec) return;
        var tiles = Math.min(64, Math.floor(dec.size / C.tileSize(fmt)));
        if (tiles < 2) return;
        var bestShift = 0, bestScore = -1;
        [0, 2, 4, 8, 16].forEach(function (shift) {
          if (shift >= dec.data.length) return;
          var n = Math.min(64, Math.floor((dec.data.length - shift) / C.tileSize(fmt)));
          if (n < 2) return;
          var sc = C.scoreTileRegion(dec.data, shift, fmt, n);
          if (sc > bestScore) { bestScore = sc; bestShift = shift; }
        });
        candidates.push({
          offset: b.offset, score: bestScore, kind: 'compressed', type: b.type, size: b.size,
          compressedSize: (function () { var d = C.decompressAt(bytes, b.offset, {}); return d ? d.end - b.offset : b.size; })(),
          dataOffset: bestShift, verified: true, refs: b.count, refAt: b.refs[0],
          label: b.label + ' ' + (b.size < 1024 ? b.size + 'B' : Math.round(b.size / 1024) + 'K') + ' ref' + (b.count > 1 ? 'x' + b.count : '')
        });
      });
    }

    if (prof.compression && prof.compression.length && typeof C.scanCompressed === 'function') {
      var comp = C.scanCompressed(bytes, {
        maxResults: 40,
        score: function (data, at) {
          var tiles = Math.min(64, Math.floor((data.length - at) / C.tileSize(fmt)));
          return tiles >= 2 ? C.scoreTileRegion(data, at, fmt, tiles) : 0;
        }
      });
      decodedBlocks = comp.decoded;
      comp.top.forEach(function (b) {
        candidates.push({
          offset: b.offset, score: b.score, kind: 'compressed', type: b.type,
          size: b.size, dataOffset: b.dataOffset,
          label: b.label + ' ' + (b.size < 1024 ? b.size + 'B' : Math.round(b.size / 1024) + 'K')
        });
      });
    }
    var raw = C.scanTileRegions(bytes, { format: fmt, maxResults: 40 });
    raw.top.forEach(function (r) {
      candidates.push({ offset: r.offset, score: r.score, kind: 'raw', label: 'raw' });
    });
    // a referenced block outranks a guessed one, then the score decides
    candidates.sort(function (a, b) {
      var av = a.verified ? 1 : 0, bv = b.verified ? 1 : 0;
      if (av !== bv) return bv - av;
      return b.score - a.score || a.offset - b.offset;
    });
    var top = candidates.slice(0, 12);
    _set({
      scanning: false,
      candidates: top,
      region: top.length ? top[0].offset : null,
      status: top.length
        ? prof.label + ': best 0x' + hex6(top[0].offset) + ' (' + top[0].label + ', score ' + top[0].score.toFixed(2) + ')'
          + (referenced ? ', ' + referenced + ' block(s) the ROM itself points at' : '')
          + (decodedBlocks ? ', ' + decodedBlocks + ' compressed block(s) decoded.' : '.')
        : 'No candidate found.'
    });
  }

  /* Opening a compressed candidate decompresses it once and hands the editor the
     decompressed bytes, which is what a tile viewer shows for these consoles. */
  function openCandidate(cand) {
    if (!cand) return;
    var bytes = romBytes();
    if (!bytes) return;
    if (cand.kind === 'compressed') {
      var dec = K.core.decompressAt(bytes, cand.offset, {});
      if (!dec) { _set({ status: 'That block does not decompress any more.' }); return; }
      _set({
        region: cand.offset,
        graphicSource: {
          offset: cand.offset, label: cand.label, size: dec.size, dataOffset: cand.dataOffset || 0,
          data: Uint8Array.from(dec.data), type: cand.type || 0x10,
          // how many bytes the original stream occupies: the budget for writing in place
          budget: cand.compressedSize || Math.max(1, (cand.size || dec.size)),
          compressedSize: cand.compressedSize || 0, version: 0, dirty: false
        },
        status: 'Opened ' + cand.label + ' at 0x' + hex6(cand.offset) + ': ' + dec.size + ' bytes decompressed'
          + (cand.dataOffset ? ', tiles start ' + cand.dataOffset + ' byte(s) in.' : '.')
      });
      return;
    }
    _set({ region: cand.offset, graphicSource: null, status: 'Raw region 0x' + hex6(cand.offset) + ' (score ' + cand.score.toFixed(2) + ').' });
  }

  /* Writing a compressed graphic back to the ROM. Two outcomes, both through the
     patch layer: the new stream fits where the old one was, or the whole block moves
     to free space and every pointer that named the old address is redirected. */
  var _writeTimer = null;

  function scheduleCompressedWrite() {
    if (_writeTimer) global.clearTimeout(_writeTimer);
    _writeTimer = global.setTimeout(function () { _writeTimer = null; writeBackCompressed(); }, 450);
  }

  function writeBackCompressed() {
    var C = K.core;
    var gs = _state.graphicSource;
    var bytes = romBytes();
    if (!gs || !gs.data || !bytes || !C.encodeLike) return null;
    var enc = C.encodeLike(gs.type || 0x10, gs.data);
    if (!enc || !enc.verified) {
      _set({ status: 'Write back refused: the compressed result did not read back the same, so nothing was written.' });
      return null;
    }
    if (enc.compressedSize <= gs.budget) {
      var wrote = 0;
      for (var i = 0; i < enc.bytes.length; i++) if (K.hex.setByte(gs.offset + i, enc.bytes[i])) wrote++;
      _set({
        graphicSource: Object.assign({}, gs, { dirty: false, compressedSize: enc.compressedSize }),
        status: 'Written in place at 0x' + hex6(gs.offset) + ': ' + enc.compressedSize + ' of ' + gs.budget
          + ' byte(s) used, ' + wrote + ' byte(s) changed.'
      });
      return { inPlace: true, wrote: wrote, compressedSize: enc.compressedSize };
    }
    var plan = C.planRelocation(bytes, enc.bytes, { system: consoleProfile().id, oldOffset: gs.offset, align: 4 });
    if (!plan.ok) {
      _set({ status: 'The new stream is ' + enc.compressedSize + ' bytes and no longer fits at 0x' + hex6(gs.offset) + '. It could not be moved: ' + plan.reason + '. The edit stays in the editor; nothing was written.' });
      return plan;
    }
    var written = C.applyPlan(plan, function (offset, value) { return K.hex.setByte(offset, value); });
    _set({
      graphicSource: Object.assign({}, gs, {
        offset: plan.newOffset, budget: enc.compressedSize, compressedSize: enc.compressedSize, dirty: false
      }),
      status: 'Graphic moved to 0x' + hex6(plan.newOffset) + ' (' + enc.compressedSize + ' bytes, was ' + gs.budget
        + ' at 0x' + hex6(gs.offset) + '). ' + plan.pointers.length + ' pointer(s) redirected, ' + written
        + ' byte(s) written as patches. Undo or Clear discards the move.'
    });
    return plan;
  }

  /* Any activity can hand the tile editor an offset. The Hex Editor calls this from
     its sidebar, and the same call is registered as a command, so both views and the
     command palette name one place. A compressed stream starting at the offset is
     decompressed, and the alignment that scores best is used, the same nudge the
     scanner applies. */
  function openAt(offset, options) {
    var C = K.core;
    var bytes = romBytes();
    var at = Number(offset);
    var opts = options || {};
    if (!bytes || !Number.isFinite(at) || at < 0 || at >= bytes.length) {
      _set({ status: 'No ROM is loaded, or that offset is outside it.' });
      return false;
    }
    var head = (opts.compressed === false || !C.compressionHeaderAt) ? null : C.compressionHeaderAt(bytes, at, {});
    if (head) {
      var dec = C.decompressAt(bytes, at, {});
      if (dec) {
        var best = 0, bestScore = -1;
        [0, 2, 4, 8, 16].forEach(function (shift) {
          if (shift >= dec.data.length) return;
          var tiles = Math.min(64, Math.floor((dec.data.length - shift) / C.tileSize(_state.format)));
          if (tiles < 2) return;
          var score = C.scoreTileRegion(dec.data, shift, _state.format, tiles);
          if (score > bestScore) { bestScore = score; best = shift; }
        });
        openCandidate({
          kind: 'compressed', offset: at, type: head.type, size: head.size, label: head.label,
          dataOffset: best, compressedSize: dec.end - at
        });
        return true;
      }
    }
    _set({ region: at, graphicSource: null, status: 'Region set to 0x' + hex6(at) + ' by another activity.' });
    return true;
  }

  function focusActivity() {
    try {
      global.dispatchEvent(new CustomEvent('ketor:navigate-activity', { detail: { activity: 'tile', source: 'tile-open-at' } }));
    } catch (error) { /* the event is a nicety, not a requirement */ }
  }

  /* An address a person has in hand is usually a pointer, not a file offset: 0x08159000
     on a GBA, $80:8000 on a SNES. Accept both, plus plain hex and decimal, and convert
     through the console's bus mapping so typing what the game's code says is enough. */
  function parseOffsetInput(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return null;
    var value;
    if (/^0x/i.test(raw)) value = parseInt(raw.replace(/^0x/i, ''), 16);
    else if (/^[0-9]+$/.test(raw)) value = parseInt(raw, 10);
    else value = parseInt(raw.replace(/[^0-9a-fA-F]/g, ''), 16);
    if (!Number.isFinite(value)) return null;
    var prof = consoleProfile();
    if (K.core.toRomOffset) {
      var off = K.core.toRomOffset(prof.id, value, { allowBare: true });
      if (off !== null && off >= 0) return off;
    }
    return value >= 0 ? value : null;
  }

  /* ---------- what the user confirmed, remembered per ROM ----------
     Automatic detection proposes; a person decides. Once a screen is confirmed it is
     stored against the ROM, so the next time this file is opened the answer is exact
     instead of proposed. This is the honest equivalent of the per game configuration
     files that tools like Tilemap Studio ship with. */
  var SCREEN_STORE = 'ketor.screens.';

  function romIdentityKey() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    var ident = _state.romIdentity;
    if (ident && ident.sha1) return SCREEN_STORE + ident.sha1;
    if (h && h.romKey) return SCREEN_STORE + h.romKey;
    if (h && h.romName) return SCREEN_STORE + h.romName + '.' + (h.romSize || 0);
    return null;
  }

  function savedScreens() {
    var key = romIdentityKey();
    if (!key || !global.localStorage) return [];
    try {
      var raw = global.localStorage.getItem(key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) { return []; }
  }

  function writeSavedScreens(list) {
    var key = romIdentityKey();
    if (!key || !global.localStorage) return false;
    try { global.localStorage.setItem(key, JSON.stringify(list.slice(0, 40))); return true; } catch (error) { return false; }
  }

  function saveCurrentScreen(name) {
    var screen = Number(_state.mapScreenBase);
    if (!Number.isFinite(screen)) { _set({ status: 'Set a screen base first.' }); return false; }
    var entry = {
      name: String(name || '').trim() || ('screen at 0x' + hex6(screen)),
      mapOffset: screen,
      charBase: charBase(),
      layout: mapLayoutId(),
      format: _state.format,
      // only a palette that is really loaded is remembered: Number(null) is 0, which
      // would have stored "no palette" as the palette at offset zero
      paletteOffset: (_state.paletteOffset === null || _state.paletteOffset === undefined)
        ? null : Number(_state.paletteOffset),
      savedAt: Date.now()
    };
    var list = savedScreens().filter(function (s) { return !(s.mapOffset === entry.mapOffset && s.charBase === entry.charBase); });
    list.unshift(entry);
    if (!writeSavedScreens(list)) { _set({ status: 'This browser refused to store the screen.' }); return false; }
    _set({ savedScreens: list, status: 'Saved "' + entry.name + '" for this ROM: map 0x' + hex6(entry.mapOffset) + ' with character block 0x' + hex6(entry.charBase) + '.' });
    return true;
  }

  function loadSavedScreen(entry) {
    if (!entry) return false;
    _set({ mapScreenBase: entry.mapOffset, mapCharBase: entry.charBase, view: 'map' });
    // the palette first, so its own message does not bury what was loaded
    if (entry.paletteOffset !== null && entry.paletteOffset !== undefined) loadPalette(entry.paletteOffset);
    _set({
      status: 'Loaded "' + entry.name + '": map 0x' + hex6(entry.mapOffset) + ' with character block 0x' + hex6(entry.charBase)
        + (entry.paletteOffset !== null && entry.paletteOffset !== undefined ? ' and palette 0x' + hex6(entry.paletteOffset) : '') + '.'
    });
    return true;
  }

  function deleteSavedScreen(entry) {
    var list = savedScreens().filter(function (s) { return !(s.mapOffset === entry.mapOffset && s.charBase === entry.charBase); });
    writeSavedScreens(list);
    _set({ savedScreens: list, status: 'Forgot "' + entry.name + '".' });
  }

  function clearSource() {
    _set({ graphicSource: null, status: 'Reading the ROM again.' });
  }

  /* The safe write: copy the region somewhere free, redirect every pointer that
     named the old address, and let the whole move land in the patch layer, so it
     can be undone or thrown away like any other edit. Nothing here guesses: the
     plan refuses when there is no free space or the console needs a mapper the
     file does not describe. */
  function repointRegion(count) {
    var C = K.core;
    var bytes = romBytes();
    if (!bytes || !C.planRelocation) { _set({ status: 'Load a ROM first.' }); return null; }
    if (_state.graphicSource) { _set({ status: 'A compressed graphic cannot be moved yet: rewriting the stream comes with the compressor.' }); return null; }
    var win = regionWindow();
    var region = Number(_state.region);
    if (!win || !Number.isFinite(region)) { _set({ status: 'Pick a region first.' }); return null; }
    var tiles = Math.max(1, Math.min(Number(count) || 64, _state.tiles));
    var size = C.tileSize(_state.format) * tiles;
    var payload = win.bytes.slice(0, size);
    var plan = C.planRelocation(bytes, payload, { system: consoleProfile().id, oldOffset: region, align: 4 });
    if (!plan.ok) { _set({ status: 'Move refused: ' + plan.reason + '.' }); return plan; }
    var written = C.applyPlan(plan, function (offset, value) { return K.hex.setByte(offset, value); });
    _set({
      status: 'Moved ' + plan.bytes + ' byte(s) from 0x' + hex6(region) + ' to 0x' + hex6(plan.newOffset)
        + (plan.grows ? ', appended at the end' : ', into free space') + '. ' + plan.pointers.length
        + ' pointer(s) redirected, ' + written + ' byte(s) written as patches. Undo or Clear discards the move.'
    });
    return plan;
  }

  /* ---------- palette ---------- */

  function readPaletteAt(offset) {
    var bytes = romBytes();
    var off = Number(offset);
    if (!bytes || !Number.isFinite(off) || off < 0 || off + PALETTE_COLOURS * 2 > bytes.length) return null;
    var pal = [];
    for (var i = 0; i < PALETTE_COLOURS; i++) pal.push(fromBgr555(bytes[off + i * 2], bytes[off + i * 2 + 1]));
    return pal;
  }

  function loadPalette(offset, name) {
    var off = Number(offset);
    var pal = readPaletteAt(off);
    if (!pal) { _set({ status: 'Palette offset is outside the ROM.' }); return null; }
    _set({
      palette: pal,
      paletteOffset: off,
      paletteName: name == null ? '' : String(name),
      status: 'Palette: 16 colours read from 0x' + hex6(off) + ' (BGR555).'
    });
    return pal;
  }

  /* Score one candidate palette. Two habits of a real palette rank candidates:
     index 0 is the background and therefore dark, and the channels disagree
     somewhere instead of forming a grey ramp. Bit 15 of a BGR555 word is unused
     in a GBA palette, so more than two words with it set means the block is not
     a palette at all (the block at 0x240000 of the test ROM has three, and
     rendering the art with it turns the picture into magenta noise).
     Measured on that ROM, 8 MiB: 760322 of about 4.19M offsets pass the
     validity test, and 17693 aligned four-block banks look valid, so the score
     can only rank candidates - it cannot identify the palette an art file uses.
     Palettes the game stores compressed, and the copy in palette RAM, are not
     reachable this way. That is what the offset field and the paste box are
     for. */
  function paletteScore(bytes, off) {
    var distinct = {}, count = 0, alpha = 0, sumR = 0, sumG = 0, sumB = 0;
    var minR = 32, maxR = -1, minG = 32, maxG = -1, minB = 32, maxB = -1;
    for (var i = 0; i < PALETTE_COLOURS; i++) {
      var v = (bytes[off + i * 2] & 0xFF) | ((bytes[off + i * 2 + 1] & 0xFF) << 8);
      if (v & 0x8000) alpha++;
      if (!distinct[v]) { distinct[v] = true; count++; }
      var r5 = v & 31, g5 = (v >> 5) & 31, b5 = (v >> 10) & 31;
      sumR += r5; sumG += g5; sumB += b5;
      if (r5 > maxR) { maxR = r5; } if (r5 < minR) { minR = r5; }
      if (g5 > maxG) { maxG = g5; } if (g5 < minG) { minG = g5; }
      if (b5 > maxB) { maxB = b5; } if (b5 < minB) { minB = b5; }
    }
    if (count < 4 || alpha > 2) return null;
    var first = fromBgr555(bytes[off], bytes[off + 1]);
    var luma = (first.r * 0.299 + first.g * 0.587 + first.b * 0.114) / 255;
    var wide = ((maxR - minR) + (maxG - minG) + (maxB - minB)) / 93;
    // A real palette is not a grey ramp: the channels have to disagree somewhere.
    var avgR = sumR / PALETTE_COLOURS, avgG = sumG / PALETTE_COLOURS, avgB = sumB / PALETTE_COLOURS;
    var greyish = (Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgR - avgB)) / 93;
    var score = (count / PALETTE_COLOURS) * 0.2 + wide * 0.25 + (1 - luma) * 0.35 + Math.min(1, greyish * 3) * 0.2;
    return { offset: off, score: score, colours: count, luma: luma };
  }

  /* Best effort search for an uncompressed 16 colour palette. Palettes that the
     ROM stores compressed (LZ77) cannot be found this way and the GBA keeps the
     palette it is using in palette RAM, so the candidate list is a starting
     point: click through it, or type an offset, or paste 32 bytes from the
     emulator. */
  function findPalette() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return null; }
    var centre = windowStart();
    var span = 0x40000;
    var from = Math.max(0, centre - span);
    var to = Math.min(bytes.length - 32, centre + span);
    var found = [];
    for (var off = from; off <= to; off += 2) {
      var s = paletteScore(bytes, off);
      if (s) found.push(s);
    }
    if (!found.length) { _set({ status: 'No uncompressed 16 colour palette found near 0x' + hex6(centre) + '.' }); return null; }
    found.sort(function (a, b) { return b.score - a.score; });
    var top = found.slice(0, 8);
    _set({ paletteCandidates: top });
    loadPalette(top[0].offset, '');
    _set({
      status: 'Palette: ' + top.length + ' candidate(s) near 0x' + hex6(centre) + '. Best 0x' + hex6(top[0].offset)
        + ' (' + top[0].colours + ' colours, score ' + top[0].score.toFixed(2) + '). Click another candidate if the art looks wrong.'
    });
    return top[0];
  }

  /* A palette edit is a ROM edit: it goes through the patch layer. */
  function writePaletteColour(index, rgb) {
    var i = Number(index) || 0;
    var off = Number(_state.paletteOffset);
    var bytes = romBytes();
    if (!bytes || !Number.isFinite(off)) { _set({ status: 'Load a palette from the ROM first.' }); return false; }
    if (i < 0 || i >= PALETTE_COLOURS) return false;
    var v = toBgr555(rgb);
    var lo = v & 0xFF, hi = (v >> 8) & 0xFF;
    var wrote = 0;
    if ((bytes[off + i * 2] & 0xFF) !== lo && K.hex.setByte(off + i * 2, lo)) wrote++;
    if ((bytes[off + i * 2 + 1] & 0xFF) !== hi && K.hex.setByte(off + i * 2 + 1, hi)) wrote++;
    var pal = (_state.palette || []).slice();
    pal[i] = fromBgr555(lo, hi);
    _set({ palette: pal, status: 'Palette colour ' + i + ' = ' + colourHex(pal[i]) + ' written to 0x' + hex6(off + i * 2) + (wrote ? '' : ' (unchanged)') + '.' });
    return wrote > 0;
  }

  function paletteText() {
    var pal = _state.palette;
    if (!pal) return '';
    var out = ['JASC-PAL', '0100', String(pal.length)];
    pal.forEach(function (c) { out.push(c.r + ' ' + c.g + ' ' + c.b); });
    return out.join('\n') + '\n';
  }

  /* Accepts JASC-PAL and a plain list of r g b lines or 64 hex digits. */
  function parsePaletteText(text, name) {
    var raw = String(text == null ? '' : text);
    var lines = raw.replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    var colours = [];
    if (lines.length && /^JASC-PAL$/i.test(lines[0])) {
      for (var i = 3; i < lines.length && colours.length < PALETTE_COLOURS; i++) {
        var p = lines[i].split(/\s+/);
        if (p.length < 3) continue;
        var r = parseInt(p[0], 10), g = parseInt(p[1], 10), b = parseInt(p[2], 10);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
        colours.push({ r: r & 255, g: g & 255, b: b & 255 });
      }
    }
    if (!colours.length) {
      var hexOnly = raw.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
      if (hexOnly.length >= 96) {
        for (var j = 0; j + 4 <= hexOnly.length && colours.length < PALETTE_COLOURS; j += 4) {
          var lo = parseInt(hexOnly.substr(j, 2), 16), hi = parseInt(hexOnly.substr(j + 2, 2), 16);
          colours.push(fromBgr555(lo, hi));
        }
      }
    }
    if (!colours.length) {
      lines.forEach(function (l) {
        if (colours.length >= PALETTE_COLOURS) return;
        var p = l.split(/[\s,]+/);
        if (p.length < 3) return;
        var r = parseInt(p[0], 10), g = parseInt(p[1], 10), b = parseInt(p[2], 10);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return;
        colours.push({ r: r & 255, g: g & 255, b: b & 255 });
      });
    }
    if (!colours.length) { _set({ status: 'Palette text not understood: expected JASC-PAL, r g b lines, or 32 bytes of BGR555 hex.' }); return null; }
    while (colours.length < PALETTE_COLOURS) colours.push({ r: 0, g: 0, b: 0 });
    _set({
      palette: colours.slice(0, PALETTE_COLOURS),
      paletteName: name ? String(name) : 'imported',
      status: 'Palette loaded from text (' + Math.min(colours.length, PALETTE_COLOURS) + ' colours).'
    });
    return colours;
  }

  function exportPalette() {
    var text = paletteText();
    if (!text) { _set({ status: 'No palette loaded.' }); return; }
    var base = (String(_state.paletteName || 'palette')).replace(/\.[^.]+$/, '');
    var name = base + (Number.isFinite(Number(_state.paletteOffset)) ? '_0x' + hex6(_state.paletteOffset) : '') + '.pal';
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _set({ status: 'Exported ' + name + '.' });
  }

  function importPaletteDialog() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pal,.txt,.act';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { parsePaletteText(String(reader.result), file.name); };
      reader.onerror = function () { _set({ status: 'Could not read ' + file.name + '.' }); };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ---------- hex text (copy out, paste in) ---------- */

  function parseHexString(text) {
    var cleaned = String(text == null ? '' : text).replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, ' ');
    var parts = cleaned.split(/\s+/).filter(function (p) { return p.length > 0; });
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.length > 2) {
        for (var j = 0; j + 2 <= p.length; j += 2) out.push(parseInt(p.substr(j, 2), 16));
      } else if (p.length === 2) {
        out.push(parseInt(p, 16));
      } else {
        out.push(parseInt(p + '0', 16));
      }
    }
    for (var k = 0; k < out.length; k++) if (!Number.isFinite(out[k])) return null;
    return out;
  }

  function tileHexText(tileIndex) {
    var C = K.core;
    var win = regionWindow();
    if (!win || !C) return '';
    var size = C.tileSize(_state.format);
    var rel = tileWindowOffset(tileIndex, C);
    if (rel < 0 || rel + size > win.bytes.length) return '';
    var parts = [];
    for (var i = 0; i < size; i++) {
      var b = (win.bytes[rel + i] & 0xFF).toString(16).toUpperCase();
      parts.push(b.length < 2 ? '0' + b : b);
    }
    return parts.join(' ');
  }

  /* target: 'tile' writes at the selected tile, 'region' at the region start,
     'palette' loads it as the working palette, 'palette-rom' writes it at the
     palette offset. */
  function applyHex(text, target, byteLimit) {
    var bytes = parseHexString(text);
    if (!bytes || !bytes.length) { _set({ status: 'No hex bytes found in the text.' }); return 0; }
    if (target === 'palette') { return parsePaletteText(text) ? bytes.length : 0; }
    var off = target === 'palette-rom' ? Number(_state.paletteOffset) : windowStart();
    if (!Number.isFinite(off)) { _set({ status: 'Set a palette offset first.' }); return 0; }
    var limit = Number(byteLimit) > 0 ? Number(byteLimit) : bytes.length;
    var wrote = 0, n = Math.min(bytes.length, limit);
    for (var i = 0; i < n; i++) if (K.hex.setByte(off + i, bytes[i])) wrote++;
    _set({ status: 'Pasted ' + wrote + ' byte(s) at 0x' + hex6(off) + (n < bytes.length ? ' (' + (bytes.length - n) + ' byte(s) ignored, over the limit)' : '') + '.' });
    return wrote;
  }

  /* ---------- tile map ---------- */

  /* GBA text mode background map, as documented in GBATEK: a 2 byte entry per
     cell, bits 0-9 the tile number inside the character block, bit 10 and 11 the
     horizontal and vertical flip, bits 12-15 the palette bank. */
  var MAP_SIZES = {
    '32x32': [32, 32],
    '64x32': [64, 32],
    '32x64': [32, 64],
    '64x64': [64, 64]
  };

  function patchedByteAt(abs) {
    var patches = patchesMap();
    var v = patches[abs];
    if (v !== undefined) return v & 0xFF;
    var src = romBytes();
    if (!src || abs < 0 || abs >= src.length) return 0;
    return src[abs] & 0xFF;
  }

  function patchedWordsAt(offset, count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(patchedByteAt(offset + i) & 0xFF);
    return out;
  }

  function mapSizes() {
    if (K.core && K.core.mapSizes) return K.core.mapSizes(mapLayoutId());
    return MAP_SIZES;
  }

  function mapSize() {
    var sizes = mapSizes();
    return sizes[_state.mapSize] || sizes[Object.keys(sizes)[0]];
  }

  /* A character block is 16 KiB, so 4bpp holds 512 tiles and 8bpp holds 256. A map
     naming tiles past that cannot be drawn, which is what tells a map from data. */
  function charTilesLimit() {
    var f = K.core.tileFormat ? K.core.tileFormat(_state.format) : { size: 32 };
    return f && f.size ? Math.floor(0x4000 / f.size) : 512;
  }

  function entryBytes() {
    if (K.core && K.core.mapLayout) return K.core.mapLayout(mapLayoutId()).entryBytes;
    return 2;
  }

  /* The map bytes with the current patches applied, exactly like regionWindow. */
  function mapWindow() {
    var src = romBytes();
    var C = K.core;
    if (!src || !C) return null;
    var start = Number(_state.mapScreenBase);
    if (!Number.isFinite(start)) return null;
    var dim = mapSize();
    var width = entryBytes();
    var count = dim[0] * dim[1];
    var end = Math.min(src.length, start + count * width);
    if (!(end > start)) return null;
    var out = src.slice(start, end);
    var patches = patchesMap();
    var keyParts = [];
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= start && off < end) {
        out[off - start] = patches[k] & 0xFF;
        keyParts.push(k + '=' + (patches[k] & 0xFF));
      }
    });
    return {
      start: start, bytes: out, cols: dim[0], rows: dim[1],
      count: Math.min(count, Math.floor(out.length / width)),
      entryBytes: width,
      key: start + ':' + out.length + ':' + keyParts.join(',')
    };
  }

  /* The GBA character base is a 16 KiB block chosen by BGxCNT, and in a ROM it
     is wherever the graphics live. Until the user names one, the block of the
     detected tile region is used, because that is the art they are looking at. */
  function charBase() {
    var explicit = Number(_state.mapCharBase);
    if (_state.mapCharBase !== null && _state.mapCharBase !== undefined && Number.isFinite(explicit)) return explicit;
    var region = Number(_state.region);
    return Number.isFinite(region) ? (region & ~0x3FFF) : null;
  }

  /* 16 KiB covers 512 four bit per pixel tiles, one whole character block. */
  function charWindow() {
    var src = romBytes();
    var C = K.core;
    if (!src || !C) return null;
    var start = charBase();
    if (start === null || !Number.isFinite(start)) return null;
    var end = Math.min(src.length, start + 0x4000);
    if (!(end > start)) return null;
    var out = src.slice(start, end);
    var patches = patchesMap();
    var keyParts = [];
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= start && off < end) {
        out[off - start] = patches[k] & 0xFF;
        keyParts.push(k + '=' + (patches[k] & 0xFF));
      }
    });
    return { start: start, bytes: out, key: start + ':' + out.length + ':' + keyParts.join(',') };
  }

  /* The bit layout of a cell belongs to the console, so it comes from the map
     codec: GBA and SNES use two bytes, Game Boy and NES one, and the flips and
     palette bits sit in different places in each of them. */
  function entryTile(v) { return K.core.entryTile(v, mapLayoutId()); }
  function entryFlipH(v) { return K.core.entryFlipH(v, mapLayoutId()); }
  function entryFlipV(v) { return K.core.entryFlipV(v, mapLayoutId()); }
  function entryBank(v) { return K.core.entryPalette(v, mapLayoutId()); }

  function mapEntry(win, cell) {
    if (!win || cell < 0 || cell >= win.count) return null;
    return K.core.readMapEntry(win.bytes, cell * (win.entryBytes || entryBytes()), mapLayoutId());
  }

  /* Sixteen colours for one palette bank. The loaded palette is bank 0 and the
     banks after it are read from the ROM at 32 byte steps, which is how a GBA
     palette block is laid out. */
  function bankPalette(bank) {
    var b = Number(bank) || 0;
    var base = Number(_state.paletteOffset);
    if (!_state.palette || !Number.isFinite(base)) return null;
    if (b === 0) return _state.palette;
    var words = patchedWordsAt(base + b * 32, PALETTE_COLOURS * 2);
    var out = [];
    for (var i = 0; i < PALETTE_COLOURS; i++) out.push(fromBgr555(words[i * 2], words[i * 2 + 1]));
    return out;
  }

  function decodeMapTile(charWin, tileNumber, flipH, flipV, C) {
    if (!charWin || !C) return null;
    var fmt = _state.format;
    var size = C.tileSize(fmt);
    var off = tileNumber * size;
    if (off < 0 || off + size > charWin.bytes.length) return null;
    var px = C.decodeTile(charWin.bytes, off, fmt);
    if (!flipH && !flipV) return px;
    var out = [];
    for (var y = 0; y < 8; y++) {
      out.push([]);
      for (var x = 0; x < 8; x++) {
        var sx = flipH ? 7 - x : x;
        var sy = flipV ? 7 - y : y;
        out[y].push(px[sy][sx]);
      }
    }
    return out;
  }

  /* The whole map drawn into one offscreen canvas at 1:1. Every pixel of the
     map is written once, which a rectangle per pixel could not do at 64x64. */
  function renderMap(win, charWin) {
    var C = K.core;
    if (!win || !charWin || !C) return null;
    var w = win.cols * 8, h = win.rows * 8;
    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(w, h);
    var cache = {};
    var palCache = {};
    var width = win.entryBytes || 2;
    for (var cell = 0; cell < win.count; cell++) {
      var v = K.core.readMapEntry(win.bytes, cell * width, mapLayoutId());
      var tile = entryTile(v);
      var bank = entryBank(v);
      var key = tile + ':' + (entryFlipH(v) ? 1 : 0) + (entryFlipV(v) ? 1 : 0);
      var px = cache[key];
      if (px === undefined) { px = decodeMapTile(charWin, tile, entryFlipH(v), entryFlipV(v), C) || false; cache[key] = px; }
      var pal = palCache[bank];
      if (pal === undefined) { pal = bankPalette(bank) || null; palCache[bank] = pal; }
      var gx = (cell % win.cols) * 8;
      var gy = Math.floor(cell / win.cols) * 8;
      if (!px) continue;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var idx = px[y][x];
          var c = pal && pal[idx] ? pal[idx] : rampColour(idx);
          var o = ((gy + y) * w + (gx + x)) * 4;
          img.data[o] = c.r; img.data[o + 1] = c.g; img.data[o + 2] = c.b; img.data[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* A real map reuses a small set of tiles over its cells; random data gives
     almost every cell its own tile number. That difference is what this scan
     measures, together with how often a cell claims a high palette bank, which
     a text mode map rarely does. Screen bases are 2 KiB aligned in the GBA. */
  /* Kept as a thin wrapper so the tile activity and the tests share one rule:
     the score itself lives in the map codec next to the layouts it has to know. */
  function scoreMapBlock(bytes, offset, cells, cols) {
    if (K.core && K.core.scoreMapBlock) return K.core.scoreMapBlock(bytes, offset, cells, cols, mapLayoutId(), { charTiles: charTilesLimit() });
    return scoreMapBlockLocal(bytes, offset, cells, cols);
  }

  function scoreMapBlockLocal(bytes, offset, cells, cols) {
    if (offset < 0 || offset + cells * 2 > bytes.length) return null;
    var width = cols || 32;
    var seen = {};
    var distinct = 0;
    var bankHigh = 0;
    var runs = 0;
    for (var c = 0; c < cells; c++) {
      var v = (bytes[offset + c * 2] & 0xFF) | ((bytes[offset + c * 2 + 1] & 0xFF) << 8);
      var t = v & 0x3FF;
      if (!seen[t]) { seen[t] = true; distinct++; }
      if (((v >> 12) & 0xF) > 3) bankHigh++;   // text mode maps stay in the low banks
      // a map is made of stretches: floors, walls, ceilings repeat sideways
      if (c % width === 0) runs++;
      else {
        var p = (bytes[offset + (c - 1) * 2] & 0xFF) | ((bytes[offset + (c - 1) * 2 + 1] & 0xFF) << 8);
        if ((p & 0x3FF) !== t) runs++;
      }
    }
    var share = distinct / cells;
    var bankShare = bankHigh / cells;
    var meanRun = cells / Math.max(1, runs);
    var runTerm = Math.max(0, Math.min(1, (meanRun - 1) / 3));
    /* How many different tiles a map uses matters as much as the runs. The first
       version of this score rewarded repetition alone, and the top candidates on
       the test ROM became stripe patterns: 9 distinct tiles stretched over 1024
       cells with a mean run of 17, which is a texture, not a level. A real screen
       block sits between the two extremes. */
    var band;
    if (share < 0.02) band = 0.2;
    else if (share < 0.05) band = 0.6;
    else if (share <= 0.35) band = 1;
    else band = 0.3;
    var score = runTerm * 0.4 + band * 0.4 + (1 - bankShare) * 0.2;
    if (distinct < 4) score *= 0.3;
    return {
      offset: offset, score: Math.max(0, Math.min(1, score)), distinct: distinct,
      bankShare: bankShare, share: share, meanRun: meanRun
    };
  }

  function detectMap() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return null; }
    var dim = mapSize();
    var cells = dim[0] * dim[1];
    _set({ mapScanning: true, status: 'Scoring 2 KiB blocks for map entries...' });
    var found = [];
    for (var off = 0; off + cells * 2 <= bytes.length; off += 0x800) {
      var s = scoreMapBlock(bytes, off, cells, dim[0]);
      if (s) { s.cells = cells; s.cols = dim[0]; found.push(s); }
    }
    found.sort(function (a, b) { return b.score - a.score; });
    var top = found.slice(0, 8);
    if (!top.length) { _set({ mapScanning: false, status: 'No map candidate found.' }); return null; }
    _set({
      mapScanning: false,
      mapCandidates: top,
      mapScreenBase: top[0].offset,
      status: 'Map: best screen base 0x' + hex6(top[0].offset) + ' (score ' + top[0].score.toFixed(2)
        + ', ' + top[0].distinct + ' distinct tiles, tile numbers up to ' + top[0].maxTile
        + ' of the ' + charTilesLimit() + ' a character block holds).'
    });
    return top[0];
  }

  /* How much of a screen this map and character block actually draw: the share of
     cells whose tile is inside the block and is not blank. A wrong pairing leaves
     holes, because the numbers name tiles that are empty somewhere else. */
  function screenCoverage(mapData, cells, charBase, bytes) {
    var C = K.core;
    var size = C.tileSize(_state.format);
    var limit = charTilesLimit();
    var filled = 0, inside = 0;
    var used = {};
    for (var c = 0; c < cells; c++) {
      var v = C.readMapEntry(mapData, c * entryBytes(), mapLayoutId());
      var t = C.entryTile(v, mapLayoutId());
      if (t >= limit) continue;
      inside++;
      var at = charBase + t * size;
      if (at + size > bytes.length) continue;
      var px = C.decodeTile(bytes, at, _state.format);
      var any = false;
      for (var y = 0; y < 8 && !any; y++) for (var x = 0; x < 8; x++) if (px[y][x]) { any = true; break; }
      if (any) filled++;
      used[t] = true;
    }
    var distinct = Object.keys(used).length;
    return {
      coverage: cells ? filled / cells : 0,
      inside: cells ? inside / cells : 0,
      distinct: distinct
    };
  }

  /* Character bases worth trying: the block of the current tile region and the blocks
     the last detection named. */
  function candidateCharBases() {
    var out = [];
    function add(base) {
      var b = Math.max(0, Number(base) || 0);
      if (out.indexOf(b) === -1) out.push(b);
    }
    if (_state.region !== null) add(Number(_state.region) & ~0x3FFF);
    (_state.candidates || []).slice(0, 10).forEach(function (c) {
      add(c.offset);
      add(Number(c.offset) & ~0x3FFF);
    });
    if (_state.mapCharBase !== null && _state.mapCharBase !== undefined) add(Number(_state.mapCharBase));
    return out.slice(0, 10);
  }

  /* Character blocks found by their content: a 16 KiB boundary whose first tiles read
     as art. This is what the screen finder falls back on when no detection has run. */
  function scanCharBases() {
    var C = K.core;
    var bytes = romBytes();
    var step = 0x4000;
    var out = [];
    if (!bytes || !C.scoreTileRegion) return out;
    for (var off = 0; off + step <= bytes.length; off += step) {
      var score = C.scoreTileRegion(bytes, off, _state.format, 64);
      if (score >= 0.5) out.push({ offset: off, score: score });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 5).map(function (o) { return o.offset; });
  }

  /* Every surviving map against every character base, ranked by how much screen the
     two of them draw together. */
  function findScreens() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return null; }
    var maps = (_state.mapCandidates || []).filter(function (c) { return !c.overLimit; }).slice(0, 8);
    if (!maps.length) { _set({ status: 'No map candidate survives the character block limit. Run Detect map first.' }); return null; }
    var bases = candidateCharBases();
    if (bases.length < 3) {
      // nothing was detected yet: look for character blocks by their art instead
      scanCharBases().forEach(function (base) { if (bases.indexOf(base) === -1) bases.push(base); });
    }
    var out = [];
    maps.forEach(function (m) {
      var width = entryBytes();
      var data = bytes.slice(m.offset, Math.min(bytes.length, m.offset + m.cells * width));
      if (data.length < m.cells * width) return;
      bases.forEach(function (base) {
        var cov = screenCoverage(data, m.cells, base, bytes);
        out.push({
          mapOffset: m.offset, cells: m.cells, charBase: base,
          coverage: cov.coverage, inside: cov.inside, distinct: cov.distinct,
          mapScore: m.score,
          score: m.score * 0.35 + cov.coverage * 0.45 + Math.min(1, cov.distinct / 64) * 0.2
        });
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var top = out.slice(0, 8);
    _set({
      screens: top,
      status: top.length
        ? 'Screens: best is map 0x' + hex6(top[0].mapOffset) + ' with character block 0x' + hex6(top[0].charBase)
          + ' (draws ' + Math.round(top[0].coverage * 100) + '% of the cells, ' + top[0].distinct + ' distinct tiles).'
        : 'No screen pairing found.'
    });
    return top;
  }

  /* Placing a tile keeps the flip and palette bits of the entry unless the
     caller asks for them, so painting the map does not silently reset them. */
  function writeMapEntry(cell, tile, flipH, flipV, bank) {
    var win = mapWindow();
    if (!win || cell < 0 || cell >= win.count) return false;
    var v = mapEntry(win, cell);
    var next = K.core.buildEntry({
      tile: Number(tile),
      flipH: flipH == null ? entryFlipH(v) : !!flipH,
      flipV: flipV == null ? entryFlipV(v) : !!flipV,
      palette: bank == null ? entryBank(v) : (Number(bank) & 0xF)
    }, mapLayoutId(), v);
    var width = win.entryBytes || entryBytes();
    var bytesOut = K.core.entryBytesOf(next, mapLayoutId());
    var base = win.start + cell * width;
    var wrote = 0;
    for (var i = 0; i < bytesOut.length; i++) {
      if ((win.bytes[cell * width + i] & 0xFF) === bytesOut[i]) continue;
      if (K.hex.setByte(base + i, bytesOut[i])) wrote++;
    }
    if (wrote) {
      _set({
        status: 'Map cell ' + (cell % win.cols) + ',' + Math.floor(cell / win.cols) + ' = tile '
          + entryTile(next) + ' (' + wrote + ' byte(s) at 0x' + hex6(base) + ').'
      });
    }
    return wrote > 0;
  }

  function currentDrawTile(selected) {
    var t = _state.mapDrawTile;
    if (t === null || t === undefined) return selected;
    return Number(t);
  }

  /* Flood fill over cells that hold the same entry as the one clicked. */
  function mapBucket(cell, tile) {
    var win = mapWindow();
    if (!win || cell < 0 || cell >= win.count) return 0;
    var from = mapEntry(win, cell);
    var stack = [cell];
    var seen = {};
    var wrote = 0;
    while (stack.length) {
      var c = stack.pop();
      if (c < 0 || c >= win.count || seen[c]) continue;
      seen[c] = true;
      if (mapEntry(win, c) !== from) continue;
      if (writeMapEntry(c, tile, null, null, null)) wrote++;
      var col = c % win.cols;
      if (col > 0) stack.push(c - 1);
      if (col < win.cols - 1) stack.push(c + 1);
      stack.push(c - win.cols, c + win.cols);
    }
    return wrote;
  }

  /* ---------- canvas ---------- */


  function TileCanvas(props) {
    var ref = uR(null);
    // The window object is rebuilt on every render, so the effect reads the
    // latest props through a ref and only redraws when the key changes.
    var propsRef = uR(props);
    propsRef.current = props;
    uE(function () {
      var props = propsRef.current;
      var canvas = ref.current;
      if (!canvas || !props.bytes || !K.core) return;
      var C = K.core;
      var fmt = props.format;
      var size = C.tileSize(fmt);
      var z = props.zoom;
      var perRow = Math.max(1, Math.floor(props.width / (8 * z)));
      var rows = Math.ceil(props.tiles / perRow);
      canvas.width = perRow * 8 * z;
      canvas.height = rows * 8 * z;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var drawn = 0;
      for (var t = 0; t < props.tiles; t++) {
        // a font view draws the sheet in character order, so the drawn slot and the
        // tile in the buffer are two different numbers
        var source = props.order ? props.order[t] : t;
        if (source === null || source === undefined) continue;
        var off = source * size;
        if (off < 0 || off + size > props.bytes.length) continue;
        var px = C.decodeTile(props.bytes, off, fmt);
        var tx = (t % perRow) * 8 * z;
        var ty = Math.floor(t / perRow) * 8 * z;
        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            var c = props.colourOf ? props.colourOf(px[y][x]) : colourCss(px[y][x]);
            if (ctx.fillStyle !== c) ctx.fillStyle = c;
            ctx.fillRect(tx + x * z, ty + y * z, z, z);
          }
        }
        drawn++;
      }
      // the byte under the Hex Editor cursor, so both views point at one place
      if (props.cursorTile >= 0 && props.cursorTile < props.tiles) {
        var span = pixelSpanForByte(fmt, props.cursorByte);
        var ctx2 = (props.cursorTile % perRow) * 8 * z;
        var cty = Math.floor(props.cursorTile / perRow) * 8 * z;
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1;
        if (span) {
          span.forEach(function (p) {
            ctx.strokeRect(ctx2 + p.x * z + 0.5, cty + p.y * z + 0.5, z - 1, z - 1);
          });
        } else {
          ctx.strokeRect(ctx2 + 0.5, cty + 0.5, 8 * z - 1, 8 * z - 1);
        }
      }
      if (props.selected >= 0 && props.selected < props.tiles) {
        var sx = (props.selected % perRow) * 8 * z;
        var sy = Math.floor(props.selected / perRow) * 8 * z;
        ctx.strokeStyle = '#4daafc';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, 8 * z - 1, 8 * z - 1);
      }
      if (props.selPixel) {
        var ptx = ((props.selPixel.tile % perRow) * 8 + props.selPixel.x) * z;
        var pty = (Math.floor(props.selPixel.tile / perRow) * 8 + props.selPixel.y) * z;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(ptx + 0.5, pty + 0.5, z - 1, z - 1);
      }
      // the character each glyph stands for, so a font reads as a font
      if (props.labels) {
        ctx.font = Math.max(8, Math.round(8 * z * 0.5)) + 'px monospace';
        ctx.textBaseline = 'top';
        for (var li = 0; li < props.tiles; li++) {
          var label = props.labels[li];
          if (!label) continue;
          var lx = (li % perRow) * 8 * z + 2;
          var ly = Math.floor(li / perRow) * 8 * z + 2;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(lx - 1, ly - 1, ctx.measureText(label).width + 3, Math.round(8 * z * 0.5) + 3);
          ctx.fillStyle = '#ffd479';
          ctx.fillText(label, lx, ly);
        }
      }
      if (props.onDrawn) props.onDrawn(drawn);
    }, [props.windowKey, props.format, props.zoom, props.tiles, props.selected, props.selPixel, props.cursorTile, props.cursorByte, props.palette, props.width, props.orderKey]);
    return e('canvas', {
      ref: ref,
      onMouseDown: props.onClick,
      onMouseMove: props.onMove,
      onMouseUp: props.onUp,
      onMouseLeave: props.onUp,
      onContextMenu: props.onContext,
      style: { display: 'block', imageRendering: 'pixelated', cursor: 'crosshair' }
    });
  }

  function MapCanvas(props) {
    var ref = uR(null);
    var propsRef = uR(props);
    propsRef.current = props;
    uE(function () {
      var p = propsRef.current;
      var canvas = ref.current;
      if (!canvas || !p.win || !p.charWin) return;
      var off = renderMap(p.win, p.charWin);
      if (!off) return;
      var z = p.zoom;
      var w = p.win.cols * 8, h = p.win.rows * 8;
      var ctx = canvas.getContext('2d');
      canvas.width = w * z;
      canvas.height = h * z;
      ctx.imageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, w * z, h * z);
      if (z >= 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var c = 0; c <= p.win.cols; c++) { ctx.moveTo(c * 8 * z + 0.5, 0); ctx.lineTo(c * 8 * z + 0.5, h * z); }
        for (var r = 0; r <= p.win.rows; r++) { ctx.moveTo(0, r * 8 * z + 0.5); ctx.lineTo(w * z, r * 8 * z + 0.5); }
        ctx.stroke();
      }
      if (p.hexCell >= 0 && p.hexCell < p.win.count) {
        ctx.strokeStyle = '#ffcc00';
        ctx.strokeRect((p.hexCell % p.win.cols) * 8 * z + 0.5, Math.floor(p.hexCell / p.win.cols) * 8 * z + 0.5, 8 * z - 1, 8 * z - 1);
      }
      if (p.cursor >= 0 && p.cursor < p.win.count) {
        ctx.strokeStyle = '#4daafc';
        ctx.strokeRect((p.cursor % p.win.cols) * 8 * z + 0.5, Math.floor(p.cursor / p.win.cols) * 8 * z + 0.5, 8 * z - 1, 8 * z - 1);
      }
    }, [props.winKey, props.charKey, props.zoom, props.cursor, props.hexCell, props.palette]);
    return e('canvas', {
      ref: ref,
      onMouseDown: props.onClick,
      onMouseMove: props.onMove,
      onMouseUp: props.onUp,
      onMouseLeave: props.onUp,
      onContextMenu: props.onContext,
      style: { display: 'block', imageRendering: 'pixelated', cursor: 'crosshair' }
    });
  }

  var TOOLS = [
    { id: 'pencil', key: 'B', label: 'Pencil' },
    { id: 'line', key: 'L', label: 'Line' },
    { id: 'bucket', key: 'G', label: 'Bucket' },
    { id: 'pick', key: 'I', label: 'Eyedropper' },
    { id: 'select', key: 'V', label: 'Select' }
  ];

  /* One swatch per colour. The index is a parameter of this function, so each
     button closes over its own index instead of the loop variable. */
  function swatchButton(props, i) {
    var c = props.palette && props.palette[i] ? props.palette[i] : rampColour(i);
    var active = Number(props.colour) === i;
    return e('button', {
      key: 'sw' + i,
      type: 'button',
      title: 'Colour ' + i + ' ' + colourHex(c) + ' (key: ' + (i < 10 ? i : '-') + ')',
      onClick: function () { props.onPick(i); },
      style: {
        width: 22, height: 18, padding: 0, cursor: 'pointer',
        background: 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')',
        border: active ? '2px solid var(--kt-focus-border, #4daafc)' : '1px solid var(--kt-widget-border-default, #3c3c3c)',
        borderRadius: 2
      }
    }, e('span', { style: { fontSize: 9, color: (c.r + c.g + c.b) > 380 ? '#000' : '#fff' } }, String(i)));
  }

  function PaletteSwatches(props) {
    var cells = [];
    for (var i = 0; i < PALETTE_COLOURS; i++) cells.push(swatchButton(props, i));
    return e('div', { style: Object.assign({ display: 'grid', gridTemplateColumns: 'repeat(8, 22px)', gap: 2 }, props.style || {}) }, cells);
  }

  function TileTab() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var toolSt = uS('pencil'); var tool = toolSt[0]; var setTool = toolSt[1];
    var tileSt = uS(-1); var selected = tileSt[0]; var setSelected = tileSt[1];
    var selSt = uS(null); var sel = selSt[0]; var setSel = selSt[1];

    // the map cursor is in the store, not in this component: the inspector writes text
    // at that cell, so both have to see the same one
    var mapCursor = Number.isFinite(Number(st.mapCursor)) ? Number(st.mapCursor) : -1;
    function setMapCursor(v) { _set({ mapCursor: Math.max(-1, Number(v) || 0) }); }
    var dragRef = uR(null);
    var panRef = uR(null);
    var clipRef = uR(null);
    var wrapRef = uR(null);
    var bodyRef = uR(null);
    var widthSt = uS(800); var width = widthSt[0];

    uE(function () {
      function measure() { if (wrapRef.current) widthSt[1](wrapRef.current.clientWidth || 800); }
      measure();
      global.addEventListener('resize', measure);
      return function () { return global.removeEventListener('resize', measure); };
    }, []);

    var win = regionWindow();
    var mapWin = mapWindow();
    var charWin = charWindow();
    var windowKey = win ? win.key : 'none';
    var mapKey = mapWin ? mapWin.key : 'none';
    var charKey = charWin ? charWin.key : 'none';
    /* A font view is the same sheet, drawn in character order and labelled with the
       characters the table names. The slot on screen and the tile in the buffer are
       then two different numbers, which is the whole point. */
    var fontOrder = null;
    var fontLabels = null;
    var orderKey = 'plain';
    if (st.view === 'font' && K.core.codeChars) {
      var fontTable = K.hex.activeTable ? K.hex.activeTable() : null;
      var fontCodes = K.core.codeChars(fontTable);
      var fontBaseNow = Number(st.fontBase) || 0;
      fontOrder = [];
      fontLabels = [];
      var firstCodeNow = Number(st.fontFirstCode) || 0;
      for (var slot = 0; slot < st.tiles; slot++) {
        fontOrder.push(fontBaseNow + slot);
        // the tile at this slot holds code firstCode + slot, whatever the base is
        var slotChar = fontCodes[firstCodeNow + slot];
        fontLabels.push(slotChar === undefined || slotChar === ' ' ? '' : slotChar);
      }
      orderKey = 'font:' + fontBaseNow + ':' + st.tiles + ':' + firstCodeNow + ':' + (fontTable && fontTable.entryCount ? fontTable.entryCount : 0);
    }

    var hexCell = -1;
    if (hex && mapWin) {
      var mapRel = Number(hex.cursorOffset) - mapWin.start;
      if (mapRel >= 0 && mapRel < mapWin.count * 2) hexCell = Math.floor(mapRel / 2);
    }

    var cursorTile = -1, cursorByte = 0;
    if (hex && win && K.core) {
      var size = K.core.tileSize(st.format);
      var rel = Number(hex.cursorOffset) - win.start;
      if (rel >= 0 && rel < st.tiles * size) { cursorTile = Math.floor(rel / size); cursorByte = rel % size; }
    }

    /* ---- map view handlers ---- */

    function mapCellAt(ev, canvas) {
      if (!mapWin) return null;
      var point = K.core.screenToCanvas(ev.clientX, ev.clientY, canvas.getBoundingClientRect());
      var hit = K.core.mapHit(point.x, point.y, {
        zoom: st.zoom, columns: mapWin.cols, rows: mapWin.rows, tileWidth: 8, tileHeight: 8
      });
      return hit ? hit.cell : null;
    }
    function placeMapTile(cell) {
      var tile = currentDrawTile(selected);
      if (!Number.isFinite(tile) || tile < 0) { _set({ status: 'Pick a tile in the Tiles view first, or type a tile number in the sidebar.' }); return; }
      writeMapEntry(cell, tile, st.mapFlipH, st.mapFlipV, null);
    }
    function pickMapTile(cell) {
      var v = mapEntry(mapWin, cell);
      if (v === null) return;
      _set({
        mapDrawTile: entryTile(v), mapFlipH: entryFlipH(v), mapFlipV: entryFlipV(v),
        status: 'Picked tile ' + entryTile(v) + ' from cell ' + (cell % mapWin.cols) + ',' + Math.floor(cell / mapWin.cols)
          + (entryBank(v) ? ' (palette bank ' + entryBank(v) + ')' : '') + '.'
      });
    }
    function swapMapTile(cell) {
      var v = mapEntry(mapWin, cell);
      if (v === null) return;
      var current = currentDrawTile(selected);
      var inCell = entryTile(v);
      writeMapEntry(cell, Number.isFinite(current) ? current : inCell, null, null, null);
      _set({ mapDrawTile: inCell, status: 'Swapped: the cell now holds tile ' + (Number.isFinite(current) ? current : inCell) + ', you draw tile ' + inCell + '.' });
    }
    function onMapDown(ev) {
      if (ev.button === 1) {
        panRef.current = { x: ev.clientX, y: ev.clientY, left: bodyRef.current ? bodyRef.current.scrollLeft : 0, top: bodyRef.current ? bodyRef.current.scrollTop : 0 };
        ev.preventDefault();
        return;
      }
      var cell = mapCellAt(ev, ev.currentTarget);
      if (cell === null) return;
      setMapCursor(cell);
      var width = mapWin.entryBytes || entryBytes();
      if (K.hex.setSelection) K.hex.setSelection(mapWin.start + cell * width, mapWin.start + cell * width + width - 1);
      if (ev.altKey) { swapMapTile(cell); return; }
      if (ev.shiftKey) { mapBucket(cell, currentDrawTile(selected)); return; }
      if (ev.ctrlKey || ev.metaKey) { pickMapTile(cell); return; }
      placeMapTile(cell);
    }
    function onMapMove(ev) {
      var pan = panRef.current;
      if (!pan || !bodyRef.current) return;
      bodyRef.current.scrollLeft = pan.left - (ev.clientX - pan.x);
      bodyRef.current.scrollTop = pan.top - (ev.clientY - pan.y);
    }
    function onMapUp() { panRef.current = null; }
    function onMapContext(ev) {
      ev.preventDefault();
      var cell = mapCellAt(ev, ev.currentTarget);
      if (cell === null) return;
      setMapCursor(cell);
      pickMapTile(cell);
    }

    /* Pixel under the pointer. The arithmetic lives in core/canvas-math.js and is
       covered by a round trip test over the whole canvas, so the click and the
       byte it changes cannot drift apart here. */
    function pixelAt(ev, canvas) {
      var point = K.core.screenToCanvas(ev.clientX, ev.clientY, canvas.getBoundingClientRect());
      var hit = K.core.tileHit(point.x, point.y, {
        zoom: st.zoom, availableWidth: width - 16, tiles: st.tiles, tileWidth: 8, tileHeight: 8
      });
      if (!hit) return null;
      var real = fontOrder ? fontOrder[hit.tile] : hit.tile;
      if (real === null || real === undefined) return null;
      return { tile: real, slot: hit.tile, x: hit.x, y: hit.y };
    }

    function line(x0, y0, x1, y1, fn) {
      var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
      for (var guard = 0; guard < 64; guard++) {
        fn(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    }

    function bucket(tile, x, y, colour) {
      var px = readTile(tile);
      if (!px) return;
      var from = px[y][x];
      if (from === colour) return;
      var stack = [[x, y]];
      var seen = {};
      while (stack.length) {
        var p = stack.pop();
        var cx = p[0], cy = p[1];
        if (cx < 0 || cy < 0 || cx > 7 || cy > 7) continue;
        var key = cx + ',' + cy;
        if (seen[key]) continue;
        seen[key] = true;
        if (px[cy][cx] !== from) continue;
        px[cy][cx] = colour;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) if (px[yy][xx] !== from) setPixel(tile, xx, yy, px[yy][xx]);
    }

    function pickColour(tile, x, y) {
      var px = readTile(tile);
      if (!px) return;
      _set({ colour: px[y][x], status: 'Picked colour ' + px[y][x] + ' at tile ' + tile + ' (' + x + ',' + y + ').' });
    }

    /* Selecting a tile selects its bytes in the Hex Editor: one place, both views. */
    function selectTile(tile) {
      setSelected(tile);
      if (!K.core || !K.hex || !K.hex.setSelection) return;
      var size = K.core.tileSize(st.format);
      var off = tileAbsoluteOffset(tile, K.core);
      // setSelection takes the first and the last byte, not a length
      K.hex.setSelection(off, off + size - 1);
      if (K.hex.gotoOffset) K.hex.gotoOffset(off);
      setSel({ tile: tile, x: 0, y: 0 });
    }

    function onDown(ev) {
      var canvas = ev.currentTarget;
      var p = pixelAt(ev, canvas);
      if (!p) return;
      var right = ev.button === 2 || ev.ctrlKey === false && false;
      selectTile(p.tile);
      if (right || tool === 'pick') { pickColour(p.tile, p.x, p.y); return; }
      if (tool === 'select') { setSel({ tile: p.tile, x: p.x, y: p.y }); return; }
      if (tool === 'bucket') { bucket(p.tile, p.x, p.y, st.colour); return; }
      dragRef.current = { tile: p.tile, x0: p.x, y0: p.y };
      setSel({ tile: p.tile, x: p.x, y: p.y });
      if (tool === 'pencil') setPixel(p.tile, p.x, p.y, st.colour);
    }
    function onMove(ev) {
      var d = dragRef.current;
      if (!d) return;
      var p = pixelAt(ev, ev.currentTarget);
      if (!p || p.tile !== d.tile) return;
      if (tool === 'pencil') { line(d.x0, d.y0, p.x, p.y, function (x, y) { setPixel(d.tile, x, y, st.colour); }); d.x0 = p.x; d.y0 = p.y; }
      else setSel({ tile: d.tile, x: p.x, y: p.y });
    }
    function onUp(ev) {
      var d = dragRef.current;
      dragRef.current = null;
      if (!d || tool !== 'line') return;
      var p = pixelAt(ev, ev.currentTarget);
      if (!p || p.tile !== d.tile) return;
      line(d.x0, d.y0, p.x, p.y, function (x, y) { setPixel(d.tile, x, y, st.colour); });
    }
    function onContext(ev) {
      ev.preventDefault();
      var p = pixelAt(ev, ev.currentTarget);
      if (p) { selectTile(p.tile); pickColour(p.tile, p.x, p.y); }
    }

    function copyTile() {
      var px = selected >= 0 ? readTile(selected) : null;
      if (!px) return;
      clipRef.current = px;
      _set({ status: 'Tile ' + selected + ' copied.' });
    }
    function pasteTile() {
      var clip = clipRef.current;
      if (!clip || selected < 0) { _set({ status: 'Copy a tile first.' }); return; }
      for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) setPixel(selected, xx, yy, clip[yy][xx]);
    }


    function onKey(ev) {
      var k = ev.key;
      if (/^[0-9]$/.test(k)) { _set({ colour: Number(k) }); return; }
      if (k === '[') { _set({ colour: (st.colour + 15) % 16 }); ev.preventDefault(); return; }
      if (k === ']') { _set({ colour: (st.colour + 1) % 16 }); ev.preventDefault(); return; }
      var upper = String(k).toUpperCase();
      for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].key === upper) { setTool(TOOLS[i].id); ev.preventDefault(); return; }
      if (st.view === 'map') {
        if (k === 'Enter' || k === ' ') { if (mapCursor >= 0) placeMapTile(mapCursor); ev.preventDefault(); return; }
        if (upper === 'X') { _set({ mapFlipH: !st.mapFlipH }); ev.preventDefault(); return; }
        if (upper === 'Y') { _set({ mapFlipV: !st.mapFlipV }); ev.preventDefault(); return; }
        var mcols = mapWin ? mapWin.cols : 32;
        var mstep2 = 0;
        if (k === 'ArrowLeft') mstep2 = -1;
        else if (k === 'ArrowRight') mstep2 = 1;
        else if (k === 'ArrowUp') mstep2 = -mcols;
        else if (k === 'ArrowDown') mstep2 = mcols;
        if (mstep2 !== 0) {
          var limit = (mapWin ? mapWin.count : 1) - 1;
          setMapCursor(Math.max(0, Math.min(limit, (mapCursor < 0 ? 0 : mapCursor) + mstep2)));
          ev.preventDefault(); return;
        }
      }
      if (k === 'Delete' || k === 'Backspace') {
        if (selected >= 0) for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) setPixel(selected, x, y, 0);
        ev.preventDefault(); return;
      }
      if (k === 'Escape') { setSel(null); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'Z') { if (ev.shiftKey) K.hex.redo(); else K.hex.undo(); ev.preventDefault(); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'C') { copyTile(); ev.preventDefault(); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'V') { pasteTile(); ev.preventDefault(); return; }
      var step = 0, perRow = Math.max(1, Math.floor((width - 16) / (8 * st.zoom)));
      if (k === 'ArrowLeft') step = -1;
      else if (k === 'ArrowRight') step = 1;
      else if (k === 'ArrowUp') step = -perRow;
      else if (k === 'ArrowDown') step = perRow;
      if (step !== 0 && selected >= 0) { selectTile(Math.max(0, selected + step)); ev.preventDefault(); }
    }

    if (!hex || !hex.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Tile Editor'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from the File menu.'));
    }

    var TB = 'kt-btn small';
    return e('div', {
      ref: wrapRef, tabIndex: 0, onKeyDown: onKey,
      style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, outline: 'none' }
    },
      /* Zoom, grid and the view label, the controls the canvas is read with. They are
         plain buttons and a checkbox, so nothing here takes a keystroke away from the
         offset and stride inputs. Ctrl+C/V joins this row later for copy/paste of a
         region and only while the canvas itself has the focus. */
      e('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--kt-widget-border-default)', flexWrap: 'wrap' }
      },
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: Number(st.zoom) <= 1,
          title: 'One pixel less per tile: 1x is the smallest the sheet gets',
          onClick: function () { _set({ zoom: Math.max(1, (Number(st.zoom) || 1) - 1) }); }
        }, 'Zoom -'),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 }, title: 'Pixels per tile' }, 'x' + (Number(st.zoom) || 1)),
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: Number(st.zoom) >= 8,
          title: 'One pixel more per tile: 8x is the largest the sheet gets',
          onClick: function () { _set({ zoom: Math.min(8, (Number(st.zoom) || 1) + 1) }); }
        }, 'Zoom +'),
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }, title: 'Draw a one pixel grid over the sheet' },
          e('input', {
            type: 'checkbox', checked: _state.grid !== false,
            onChange: function (ev) { _set({ grid: !!ev.target.checked }); }
          }),
          'Grid'),
        e('span', { style: { opacity: 0.7 }, title: 'Which view of the sheet this tab draws' }, 'view: ' + st.view)
      ),
      e('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderBottom: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-sidebar-bg)', fontSize: 11, flexWrap: 'nowrap' } },
        TOOLS.map(function (t) {
          return e('button', {
            key: t.id, type: 'button',
            className: TB + (tool === t.id ? '' : ' secondary'),
            title: t.label + ' (' + t.key + ')',
            onClick: function () { setTool(t.id); }
          }, t.label);
        }),
        e('span', { style: { opacity: 0.25 } }, '|'),
        e('button', { type: 'button', className: TB + ' secondary', disabled: selected < 0, onClick: copyTile }, 'Copy'),
        e('button', { type: 'button', className: TB + ' secondary', disabled: selected < 0, onClick: pasteTile }, 'Paste'),
        e('button', {
          type: 'button', className: TB + (st.inspector === false ? ' secondary' : ''),
          title: 'Show or hide the inspector: palette, paste box and the state of a compressed graphic',
          onClick: function () { _set({ inspector: st.inspector === false }); }
        }, 'Inspector'),
        e('span', { style: { opacity: 0.25 } }, '|'),
        e('button', { type: 'button', className: TB + (st.view === 'tiles' ? '' : ' secondary'), onClick: function () { _set({ view: 'tiles' }); } }, 'Tiles'),
        e('button', { type: 'button', className: TB + (st.view === 'map' ? '' : ' secondary'), onClick: function () { _set({ view: 'map' }); } }, 'Map'),
        e('button', {
          type: 'button', className: TB + (st.view === 'font' ? '' : ' secondary'),
          title: 'Draw the sheet in character order, labelled from the loaded table',
          onClick: function () { _set({ view: 'font' }); }
        }, 'Font'),
        st.view === 'font' ? e('span', { style: { display: 'flex', alignItems: 'center', gap: 3 } },
          e('span', { style: { opacity: 0.7 }, title: 'Tile number that holds the first code of the font' }, 'base'),
          e('input', {
            type: 'number', value: st.fontBase,
            onChange: function (ev) { _set({ fontBase: Math.max(0, Number(ev.target.value) || 0) }); },
            style: { width: 58, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' }
          }),
          e('span', { style: { opacity: 0.7 }, title: 'The code the first tile of the sheet holds, 0x20 when a font starts at the space' }, 'first code'),
          e('input', {
            type: 'text', value: '0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase(),
            onChange: function (ev) { _set({ fontFirstCode: parseInt(String(ev.target.value).replace(/^0x/i, ''), 16) || 0 }); },
            style: { width: 52, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' }
          })
        ) : null,
        st.view === 'map' ? e('button', { type: 'button', className: TB + (st.mapFlipH ? '' : ' secondary'), title: 'Flip horizontally when placing (X)', onClick: function () { _set({ mapFlipH: !st.mapFlipH }); } }, 'H') : null,
        st.view === 'map' ? e('button', { type: 'button', className: TB + (st.mapFlipV ? '' : ' secondary'), title: 'Flip vertically when placing (Y)', onClick: function () { _set({ mapFlipV: !st.mapFlipV }); } }, 'V') : null,
        e('span', { style: { flex: 1 } }),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 } }, st.region === null ? 'no region' : '0x' + hex6(st.region)),
        e('span', { style: { opacity: 0.6 } }, st.format),
        e('span', { style: { opacity: 0.6 } }, selected < 0 ? 'no tile' : 'tile ' + selected),
        e('span', { style: { opacity: 0.6 } }, st.palette ? 'palette 0x' + hex6(st.paletteOffset) : 'no palette')
      ),

      e('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'stretch' } },
      e('div', { ref: bodyRef, style: { flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: 8 } },
        st.view === 'map'
          ? (mapWin && charWin ? e(MapCanvas, {
              win: mapWin, charWin: charWin, winKey: mapKey, charKey: charKey,
              zoom: st.zoom, cursor: mapCursor, hexCell: hexCell, palette: st.palette,
              onClick: onMapDown, onMove: onMapMove, onUp: onMapUp, onContext: onMapContext
            }) : e('div', { style: { opacity: 0.7 } }, 'Set a screen base and a character base in the sidebar, then load a palette to see the map in colour.'))
          : win ? e(TileCanvas, {
          bytes: win.bytes,
          windowKey: windowKey,
          format: st.format, zoom: st.zoom, tiles: st.tiles,
          selected: selected, selPixel: sel, palette: st.palette,
          order: fontOrder, labels: fontLabels, orderKey: orderKey,
          cursorTile: cursorTile, cursorByte: cursorByte,
          width: Math.max(200, width - 16),
          onClick: onDown, onMove: onMove, onUp: onUp, onContext: onContext
        }) : e('div', { style: { opacity: 0.7 } }, 'No region selected. Detect tiles or type a region offset in the sidebar.')
      ),
      st.inspector === false ? null : e(TileInspector, null)
      ),
      e('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 10px', borderTop: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-statusbar-bg)', color: 'var(--kt-statusbar-fg)', fontSize: 11 } },
        e('span', null, 'Colour'),
        e(PaletteSwatches, { palette: st.palette, colour: st.colour, onPick: function (i) { _set({ colour: i }); }, style: { gridTemplateColumns: 'repeat(16, 20px)' } }),
        e('input', {
          type: 'color', value: colourHex(paletteColour(st.colour)),
          title: st.palette ? 'Edit palette colour ' + st.colour + ' (written to the ROM as a patch)' : 'Load a palette from the ROM to edit colours',
          disabled: !st.palette,
          onChange: function (ev) {
            var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ev.target.value);
            if (!m) return;
            writePaletteColour(st.colour, { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) });
          },
          style: { width: 28, height: 20, padding: 0, background: 'transparent', border: '1px solid var(--kt-widget-border-default)' }
        }),
        e('button', { type: 'button', className: 'kt-btn small', disabled: selected < 0, onClick: function () { K.hex.gotoOffset(tileAbsoluteOffset(selected, K.core)); } }, 'Goto Hex'),
        e('span', { style: { flex: 1 } }),
        e('span', { style: { opacity: 0.75 } }, st.status)
      )
    );
  }

  /* The inspector holds what supports the drawing but is not needed while drawing:
     the palette, the paste box and the state of a compressed graphic. It sits to the
     right of the canvas so the left sidebar stays short enough to scan. */
  /* The map controls, moved out of the left sidebar. Setting a screen base and
     detecting a map are occasional things: they belong beside the canvas, not in the
     column you scan while drawing. */
  function MapInspector() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var mapScreenSt = uS(st.mapScreenBase === null ? '' : hex6(st.mapScreenBase));
    var mapCharSt = uS(hex6(charBase()));
    var mapTileSt = uS(st.mapDrawTile === null ? '' : Number(st.mapDrawTile).toString(16).toUpperCase());
    var textSt = uS('');
    var startSt = uS('');
    var nameSt = uS('');

    uE(function () { mapScreenSt[1](st.mapScreenBase === null ? '' : hex6(st.mapScreenBase)); }, [st.mapScreenBase]);
    uE(function () { mapCharSt[1](hex6(charBase())); }, [st.mapCharBase, st.region]);
    uE(function () { mapTileSt[1](st.mapDrawTile === null ? '' : Number(st.mapDrawTile).toString(16).toUpperCase()); }, [st.mapDrawTile]);

    /* Both accept a pointer as it is written in the game or in a disassembly, a file
       offset in hex, or a decimal number, and neither silently moves what was typed. */
    function commitMapScreen() {
      var raw = String(mapScreenSt[0]).trim();
      if (!raw) { _set({ mapScreenBase: null, status: 'No screen base: use Detect map or type one.' }); return; }
      var v = parseOffsetInput(raw);
      if (v === null) { _set({ status: 'Screen base not understood. A pointer like 0x08159000, or an offset like 0x159000, or a number.' }); return; }
      var aligned = (v % 0x800) === 0;
      _set({
        mapScreenBase: v,
        status: 'Screen base 0x' + hex6(v) + (aligned ? '.' : ' (not on a 2 KiB screen block boundary, which GBA hardware requires; it was kept as typed).')
      });
    }
    function commitMapChar() {
      var raw = String(mapCharSt[0]).trim();
      if (!raw) { _set({ mapCharBase: null, status: 'Character base follows the tile region block again.' }); return; }
      var v = parseOffsetInput(raw);
      if (v === null) { _set({ status: 'Character base not understood. A pointer like 0x080E0000, or an offset like 0xE0000.' }); return; }
      var aligned = (v % 0x4000) === 0;
      _set({
        mapCharBase: v,
        status: 'Character base 0x' + hex6(v) + (aligned ? '.' : ' (not on a 16 KiB character block boundary; it was kept as typed).')
      });
    }
    function screenFromCursor() {
      var at = Number(K.hex.getState().cursorOffset) || 0;
      _set({ mapScreenBase: at, view: 'map', status: 'Screen base taken from the hex cursor: 0x' + hex6(at) + '.' });
    }
    function charFromCursor() {
      var at = Number(K.hex.getState().cursorOffset) || 0;
      _set({ mapCharBase: at, view: 'map', status: 'Character base taken from the hex cursor: 0x' + hex6(at) + '.' });
    }
    function commitScreenName() {
      saveCurrentScreen(nameSt[0]);
      nameSt[1]('');
    }
    function commitMapTile() {
      var raw = String(mapTileSt[0]).trim();
      if (!raw) { _set({ mapDrawTile: null, status: 'Placing the tile selected in the Tiles view.' }); return; }
      var v = parseInt(raw.replace(/^0x/i, ''), 16);
      if (!Number.isFinite(v) || v < 0 || v > 0x3FF) { _set({ status: 'Tile number must be 0x000 - 0x3FF.' }); return; }
      _set({ mapDrawTile: v, status: 'Placing tile 0x' + Number(v).toString(16).toUpperCase() + '.' });
    }

    /* Writing a line of text onto the screen: the table says which code means which
       character, the font base says which tile holds code 0, and the cells are written
       as patches. This is how a name gets onto a title screen. */
    function writeText() {
      var table = K.hex.activeTable ? K.hex.activeTable() : null;
      var text = String(textSt[0] || '');
      var win = mapWindow();
      if (!table) { _set({ status: 'Load a table first: the text tool needs to know which code is which character.' }); return; }
      if (!text.trim()) { _set({ status: 'Type the text to write.' }); return; }
      if (!win) { _set({ status: 'Set a screen base first, or press Detect map.' }); return; }
      var start = String(startSt[0]).trim() === ''
        ? Math.max(0, Number(st.mapCursor) >= 0 ? Number(st.mapCursor) : 0)
        : parseInt(String(startSt[0]).replace(/^0x/i, ''), 16);
      if (!Number.isFinite(start)) { _set({ status: 'Start cell must be a number.' }); return; }
      var plan = K.core.planTextOnMap(text, {
        table: table, base: Number(st.fontBase) || 0, firstCode: Number(st.fontFirstCode) || 0,
        sheetTiles: st.tiles, cols: win.cols, startCell: start
      });
      var wrote = 0, skipped = 0;
      plan.cells.forEach(function (one) {
        if (one.tile === null) { skipped++; return; }
        if (writeMapEntry(one.cell, one.tile, null, null, null)) wrote++;
      });
      _set({
        status: 'Wrote ' + wrote + ' cell(s) from cell ' + start + ' with font base ' + (Number(st.fontBase) || 0)
          + ' and first code 0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase()
          + (skipped ? ', ' + skipped + ' character(s) were skipped' : '')
          + (plan.missing && plan.missing.length ? ' (not in the table: ' + plan.missing.join(' ') + ')' : '')
          + (plan.outside && plan.outside.length ? ' (outside the sheet: ' + plan.outside.join(' ') + ')' : '') + '.'
          + (wrote ? ' Undo discards it.' : '')
      });
    }

    var rowStyle = { display: 'flex', gap: 4, alignItems: 'center' };
    var inputStyle = { flex: '1 1 auto', fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };
    var head = { fontWeight: 600, marginTop: 4 };

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      e('div', { style: head }, 'Map'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, 'One entry per cell: tile number in bits 0-9, flips in 10-11, palette bank in 12-15. Click places the current tile, Ctrl+click picks it, Alt+click swaps it, Shift+click fills, middle drag scrolls.'),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !hex || !hex.romBytes || st.mapScanning,
        onClick: detectMap,
        title: 'Scan 2 KiB aligned blocks for one whose cells reuse few tile numbers'
      }, st.mapScanning ? 'Scanning...' : 'Detect map'),
      st.mapCandidates.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        e('div', { style: { opacity: 0.75 } }, 'Screen base candidates'),
        st.mapCandidates.slice(0, 6).map(function (c) {
          return e('button', {
            key: 'map' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.mapScreenBase === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            onClick: function () { _set({ mapScreenBase: c.offset }); }
          }, '0x' + hex6(c.offset) + '  ' + c.score.toFixed(2) + '  ' + c.distinct + ' tiles');
        })
      ) : null,
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: mapScreenSt[0], spellCheck: false,
          placeholder: 'screen base: pointer or offset',
          title: 'Accepts a pointer (0x08159000), a file offset (0x159000) or a number',
          onChange: function (ev) { mapScreenSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitMapScreen(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitMapScreen }, 'Go'),
        e('button', { type: 'button', className: 'kt-btn small secondary', title: 'Use the offset the hex cursor is on', onClick: screenFromCursor }, 'cursor')
      ),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: mapCharSt[0], spellCheck: false,
          placeholder: 'character base: pointer or offset',
          title: 'Accepts a pointer (0x080E0000), a file offset (0xE0000) or a number',
          onChange: function (ev) { mapCharSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitMapChar(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitMapChar }, 'Go'),
        e('button', { type: 'button', className: 'kt-btn small secondary', title: 'Use the offset the hex cursor is on', onClick: charFromCursor }, 'cursor')
      ),
      e('div', { style: { display: 'flex', gap: 4 } },
        e('input', {
          style: inputStyle, value: nameSt[0], spellCheck: false, placeholder: 'name this screen',
          onChange: function (ev) { nameSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitScreenName(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitScreenName, disabled: st.mapScreenBase === null }, 'Remember')
      ),
      (st.savedScreens && st.savedScreens.length) ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        e('div', { style: { opacity: 0.75 } }, 'Screens remembered for this ROM'),
        st.savedScreens.slice(0, 8).map(function (s) {
          return e('div', { key: 'saved' + s.mapOffset + '-' + s.charBase, style: { display: 'flex', gap: 4, alignItems: 'center' } },
            e('button', {
              type: 'button', className: 'kt-btn small', style: { flex: '1 1 auto', justifyContent: 'flex-start' },
              title: 'Load this screen: map 0x' + hex6(s.mapOffset) + ', character block 0x' + hex6(s.charBase),
              onClick: function () { loadSavedScreen(s); }
            }, s.name + '  ' + hex6(s.mapOffset)),
            e('button', {
              type: 'button', className: 'kt-btn small secondary', title: 'Forget this screen',
              onClick: function () { deleteSavedScreen(s); }
            }, 'x')
          );
        })
      ) : null,
      e('button', {
        type: 'button', className: 'kt-btn small secondary',
        title: 'A GBA character base is a 16 KiB block: take the block the current tile region lives in',
        disabled: st.region === null,
        onClick: function () {
          var base = Number(st.region) & ~0x3FFF;
          _set({ mapCharBase: base, status: 'Character base set to 0x' + hex6(base) + ', the 16 KiB block of the tile region.' });
        }
      }, 'Character block of the tile region'),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Map size',
        e('select', {
          className: 'kt-select', value: st.mapSize,
          onChange: function (ev) { _set({ mapSize: ev.target.value }); },
          style: { fontSize: 11 }
        }, Object.keys(mapSizes()).map(function (id) { return e('option', { key: id, value: id }, id); }))
      ),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: mapTileSt[0], spellCheck: false, placeholder: 'tile to place (hex, empty = selected)',
          onChange: function (ev) { mapTileSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitMapTile(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitMapTile }, 'Set')
      ),

      e('div', { style: head }, 'Screens'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, 'Pairs each map candidate with the character blocks the detection named, and keeps the ones that actually draw a full screen.'),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !hex || !hex.romBytes,
        onClick: findScreens,
        title: 'A map can only name the tiles of one character block, so a pairing that leaves the screen full of holes is wrong'
      }, 'Find screens'),
      st.screens && st.screens.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        st.screens.slice(0, 6).map(function (s) {
          return e('button', {
            key: 'scr' + s.mapOffset + '-' + s.charBase,
            type: 'button',
            className: 'kt-btn small' + (st.mapScreenBase === s.mapOffset && charBase() === s.charBase ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            title: 'Load this map and this character block into the map view',
            onClick: function () {
              _set({
                mapScreenBase: s.mapOffset, mapCharBase: s.charBase, view: 'map',
                status: 'Screen: map 0x' + hex6(s.mapOffset) + ' drawn with character block 0x' + hex6(s.charBase)
                  + ' (' + Math.round(s.coverage * 100) + '% of cells, ' + s.distinct + ' tiles).'
              });
            }
          }, 'map ' + hex6(s.mapOffset) + ' + chr ' + hex6(s.charBase) + '  ' + Math.round(s.coverage * 100) + '%  ' + s.distinct + ' tiles');
        })
      ) : null,
      e('div', { style: head }, 'Palettes for this screen'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, 'A palette cannot be worked out from a ROM alone: hundreds of thousands of offsets near a character block score the same. These are the ones the ROM points at and the ones sitting beside the tiles, so click through them with the screen in front of you. The one that looks right is remembered with the screen.'),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !hex || !hex.romBytes || !K.core.paletteCandidates,
        onClick: function () {
          var res = K.core.paletteCandidates(romBytes(), {
            near: charBase(), span: 0x40000, referenced: true, system: consoleProfile().id, max: 10
          });
          _set({
            palettes: res.top,
            status: 'Palettes: ' + res.pointed + ' the ROM points at, ' + res.total + ' candidate(s) in total, showing ' + res.top.length + '.'
          });
        },
        title: 'The ROM is asked which palettes it names, and the tiles are asked which palettes sit beside them'
      }, 'Find palettes'),
      (st.palettes && st.palettes.length) ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        st.palettes.map(function (p) {
          return e('button', {
            key: 'pal' + p.offset,
            type: 'button',
            className: 'kt-btn small' + (Number(st.paletteOffset) === p.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            title: 'Load these 16 colours',
            onClick: function () { loadPalette(p.offset, ''); }
          }, '0x' + hex6(p.offset) + '  ' + p.score.toFixed(2) + '  ' + p.reason);
        })
      ) : null,
      e('div', { style: head }, 'Write text on this screen'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, 'The table gives the code of each character and the font base gives the tile that holds code 0, so this writes the tile numbers a screen needs. A newline starts the next row.'),
      e('textarea', {
        value: textSt[0],
        onChange: function (ev) { textSt[1](ev.target.value); },
        placeholder: 'your name, or two lines',
        spellCheck: false,
        style: { minHeight: 44, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: 4, resize: 'vertical' }
      }),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: startSt[0], spellCheck: false, placeholder: 'start cell (empty = map cursor)',
          onChange: function (ev) { startSt[1](ev.target.value); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: writeText }, 'Write')
      ),
      e('div', { style: rowStyle },
        e('span', { style: { opacity: 0.7 } }, 'font base'),
        e('input', {
          style: { width: 58, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' },
          type: 'number', value: st.fontBase,
          onChange: function (ev) { _set({ fontBase: Math.max(0, Number(ev.target.value) || 0) }); }
        }),
        e('span', { style: { opacity: 0.7 } }, 'first code'),
        e('input', {
          style: { width: 52, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' },
          type: 'text', value: '0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase(),
          onChange: function (ev) { _set({ fontFirstCode: parseInt(String(ev.target.value).replace(/^0x/i, ''), 16) || 0 }); }
        })
      ),
      e('div', { style: { display: 'flex', gap: 4 } },
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          disabled: st.region === null || !hex || !hex.romBytes,
          title: 'Copy this region into free space and rewrite every pointer that named the old address',
          onClick: function () { repointRegion(64); }
        }, 'Move region'),
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          disabled: !hex || !hex.romBytes,
          title: 'Take the offset the Hex Editor cursor sits on as the region, and open it as a compressed graphic when a stream starts there',
          onClick: function () {
            var at = Number(K.hex.getState().cursorOffset) || 0;
            var src = K.hex.getSourceBytes();
            var head2 = (K.core.compressionHeaderAt && src) ? K.core.compressionHeaderAt(src, at, {}) : null;
            if (head2) {
              var dec = K.core.decompressAt(src, at, {});
              openCandidate({ kind: 'compressed', offset: at, type: head2.type, size: head2.size, label: head2.label, dataOffset: 0, compressedSize: dec ? (dec.end - at) : 0 });
              return;
            }
            _set({ region: at, graphicSource: null, status: 'Region set to the hex cursor: 0x' + hex6(at) + '.' });
          }
        }, 'Region = cursor')
      )
    );
  }

  function TileInspector() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var palSt = uS(st.paletteOffset === null ? '' : hex6(st.paletteOffset));
    var pasteSt = uS('');
    var targetSt = uS('tile');

    uE(function () { palSt[1](st.paletteOffset === null ? '' : hex6(st.paletteOffset)); }, [st.paletteOffset]);

    function commitPalette() {
      var v = parseInt(String(palSt[0]).replace(/^0x/i, ''), 16);
      if (!Number.isFinite(v)) { _set({ status: 'Palette offset must be a hex offset.' }); return; }
      loadPalette(v);
    }

    function applyPaste() {
      var text = pasteSt[0];
      var target = targetSt[0];
      if (target === 'palette') { parsePaletteText(text); return; }
      var bytes = parseHexString(text);
      if (!bytes || !bytes.length) { _set({ status: 'No hex bytes found in the text.' }); return; }
      var offset = target === 'palette-rom' ? Number(st.paletteOffset) : windowStart();
      if (!Number.isFinite(offset)) { _set({ status: 'Set a palette offset first.' }); return; }
      var limit = target === 'tile' ? K.core.tileSize(st.format) : bytes.length;
      var wrote = 0, n = Math.min(bytes.length, limit);
      for (var i = 0; i < n; i++) if (K.hex.setByte(offset + i, bytes[i])) wrote++;
      _set({ status: 'Pasted ' + wrote + ' byte(s) at 0x' + hex6(offset) + (n < bytes.length ? ' (' + (bytes.length - n) + ' ignored, over one tile)' : '') + '.' });
    }

    function copyHexText() {
      var selected = -1;
      var tile = st.region === null ? '' : tileHexText(0);
      if (!tile) { _set({ status: 'Nothing to copy.' }); return; }
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(tile).then(function () { _set({ status: 'Tile 0 bytes copied as hex text.' }); }, function () { _set({ status: 'Tile 0 bytes: ' + tile }); });
      } else {
        _set({ status: 'Tile 0 bytes: ' + tile });
      }
      return selected;
    }

    var rowStyle = { display: 'flex', gap: 4, alignItems: 'center' };
    var inputStyle = { flex: '1 1 auto', fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };
    var head = { fontWeight: 600, marginTop: 2 };

    return e('div', {
      style: {
        flex: '0 0 auto', width: 268, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12,
        borderLeft: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-sidebar-bg)'
      }
    },
      st.graphicSource ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
        e('div', { style: head }, 'Compressed graphic'),
        e('div', { style: { fontFamily: MONO } }, st.graphicSource.label + ' at 0x' + hex6(st.graphicSource.offset)),
        e('div', { style: { opacity: 0.7 } }, st.graphicSource.size + ' bytes decompressed'
          + (st.graphicSource.dataOffset ? ', tiles start ' + st.graphicSource.dataOffset + ' byte(s) in' : '') + '.'),
        e('div', { style: { opacity: 0.7 } }, st.graphicSource.compressedSize
          ? (st.graphicSource.compressedSize + ' of ' + st.graphicSource.budget + ' byte(s) used' + (st.graphicSource.dirty ? ', waiting to write back' : ', written'))
          : 'not written back yet'),
        e('div', { style: { display: 'flex', gap: 4 } },
          e('button', { type: 'button', className: 'kt-btn small', onClick: function () { writeBackCompressed(); } }, 'Write back'),
          e('button', { type: 'button', className: 'kt-btn small secondary', onClick: clearSource }, 'Read ROM')
        )
      ) : null,

      e('div', { style: head }, 'Palette'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, 'BGR555, 16 colours. An edit is written to the ROM as a patch.'),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: palSt[0], spellCheck: false, placeholder: 'palette offset',
          onChange: function (ev) { palSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitPalette(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitPalette, disabled: !hex || !hex.romBytes }, 'Load')
      ),
      e('div', { style: { display: 'flex', gap: 4 } },
        e('button', { type: 'button', className: 'kt-btn small secondary', style: { flex: '1 1 auto' }, disabled: !hex || !hex.romBytes, onClick: findPalette, title: 'Search around the region for an uncompressed 16 colour palette' }, 'Find'),
        e('button', { type: 'button', className: 'kt-btn small secondary', disabled: !st.palette, onClick: exportPalette }, 'Export .pal'),
        e('button', { type: 'button', className: 'kt-btn small secondary', onClick: importPaletteDialog }, 'Import')
      ),
      st.paletteCandidates && st.paletteCandidates.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        e('div', { style: { opacity: 0.75 } }, 'Palette candidates'),
        st.paletteCandidates.map(function (c) {
          return e('button', {
            key: 'pal' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.paletteOffset === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            onClick: function () { loadPalette(c.offset); }
          }, '0x' + hex6(c.offset) + '  ' + c.score.toFixed(2));
        })
      ) : null,
      st.palette ? e('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        e('span', { style: { opacity: 0.75 } }, 'Colour ' + st.colour),
        e('input', {
        type: 'color', value: colourHex(paletteColour(st.colour)),
        title: 'Edit palette colour ' + st.colour + ' (written as a patch)',
        onChange: function (ev) {
          var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ev.target.value);
          if (!m) return;
          writePaletteColour(st.colour, { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) });
        },
          style: { width: 46, height: 22, padding: 0, background: 'transparent', border: '1px solid var(--kt-widget-border-default)' }
        })
      ) : null,

      e('div', { style: head }, 'Paste hex from an emulator'),
      e('textarea', {
        value: pasteSt[0],
        onChange: function (ev) { pasteSt[1](ev.target.value); },
        placeholder: '20 21 22 ... tile bytes, or 32 bytes of BGR555 for a palette',
        spellCheck: false,
        style: { minHeight: 54, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: 4, resize: 'vertical' }
      }),
      e('select', { className: 'kt-select', value: targetSt[0], onChange: function (ev) { targetSt[1](ev.target.value); }, style: { fontSize: 11 } },
        e('option', { value: 'tile' }, 'Write at tile 0 of the region'),
        e('option', { value: 'region' }, 'Write at the region start'),
        e('option', { value: 'palette' }, 'Load as palette'),
        e('option', { value: 'palette-rom' }, 'Write at the palette offset')),
      e('div', { style: { display: 'flex', gap: 4 } },
        e('button', { type: 'button', className: 'kt-btn small', onClick: applyPaste }, 'Apply'),
        e('button', { type: 'button', className: 'kt-btn small secondary', onClick: copyHexText }, 'Copy tile 0'),
        e('button', { type: 'button', className: 'kt-btn small secondary', onClick: function () { pasteSt[1](''); } }, 'Clear')
      ),
      e(MapInspector, null)
    );
  }

  function TileSidebar() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var formats = (K.core && K.core.TILE_FORMATS) || {};
    var regionSt = uS(st.region === null ? '' : hex6(st.region));

    uE(function () { regionSt[1](st.region === null ? '' : hex6(st.region)); }, [st.region]);
    function commitRegion() {
      var v = parseInt(String(regionSt[0]).replace(/^0x/i, ''), 16);
      if (!Number.isFinite(v)) { _set({ status: 'Region must be a hex offset.' }); return; }
      _set({ region: v });
    }

    var rowStyle = { display: 'flex', gap: 4, alignItems: 'center' };
    var inputStyle = { flex: '1 1 auto', fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };

    var prof = consoleProfile();
    // The formats of this console come first; the rest stay reachable, because a
    // ROM can always surprise you.
    var preferred = (prof.tileFormats || []).filter(function (id) { return !!formats[id]; });
    var others = Object.keys(formats).filter(function (id) { return preferred.indexOf(id) === -1; });
    var formatIds = preferred.concat(others);
    return e('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
      e('div', { style: { fontWeight: 600 } }, 'Tiles'),
      st.romIdentity ? e('div', { style: { fontSize: 11, opacity: 0.8, lineHeight: 1.4 } },
        (st.romIdentity.title || 'Unrecognised ROM') + ' - ' + st.romIdentity.reason) : null,
      e('div', { style: { opacity: 0.75 } }, 'Console: ' + prof.label
        + (prof.compression && prof.compression.length ? ' (compressed graphics)' : ' (raw tile data)')),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Format',
        e('select', {
          className: 'kt-select', value: st.format,
          onChange: function (ev) { _set({ format: ev.target.value, region: null, candidates: [], graphicSource: null }); },
          style: { fontSize: 11 }
        }, formatIds.map(function (id) {
          return e('option', { key: id, value: id }, formats[id].label);
        }))
      ),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Zoom',
        e('select', {
          className: 'kt-select', value: st.zoom,
          onChange: function (ev) { _set({ zoom: Number(ev.target.value) }); },
          style: { fontSize: 11 }
        }, [1, 2, 3, 4, 6, 8].map(function (z) { return e('option', { key: 'z' + z, value: z }, z + 'x'); }))
      ),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Tiles shown',
        e('select', {
          className: 'kt-select', value: st.tiles,
          onChange: function (ev) { _set({ tiles: Number(ev.target.value) }); },
          style: { fontSize: 11 }
        }, [64, 128, 256, 512].map(function (n) { return e('option', { key: 't' + n, value: n }, String(n)); }))
      ),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !hex || !hex.romBytes || st.scanning,
        onClick: detect,
        title: (prof.compression && prof.compression.length)
          ? 'Find compressed ' + prof.label + ' graphics by their LZ77 / RLE header, plus raw tile regions'
          : 'Scan for raw ' + prof.label + ' tile data at this format'
      }, st.scanning ? 'Scanning...' : 'Detect tiles'),
      st.candidates.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 } },
        e('div', { style: { opacity: 0.75 } }, 'Candidates (score)'),
        st.candidates.map(function (c) {
          return e('button', {
            key: 'cand' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.region === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            title: c.kind === 'compressed'
              ? 'Decompress this ' + c.label + ' block and open it'
              : 'Read this raw region of the ROM',
            onClick: function () { openCandidate(c); }
          }, '0x' + hex6(c.offset) + '  ' + c.score.toFixed(2) + '  ' + (c.label || 'raw')
            + (c.verified ? '  \u2022 pointed at from 0x' + hex6(c.refAt) : ''));
        })
      ) : null,
      st.graphicSource ? e('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 }
      },
        e('div', { style: { fontFamily: MONO } }, 'Compressed: ' + st.graphicSource.label + ' at 0x' + hex6(st.graphicSource.offset)),
        e('div', { style: { opacity: 0.7 } }, st.graphicSource.size + ' bytes decompressed'
          + (st.graphicSource.dataOffset ? ', tiles start ' + st.graphicSource.dataOffset + ' byte(s) in' : '')
          + '. Painting a compressed graphic comes back once rewriting the stream is in.'),
        e('div', { style: { opacity: 0.7 } }, st.graphicSource.compressedSize
          ? (st.graphicSource.compressedSize + ' of ' + st.graphicSource.budget + ' byte(s) used' + (st.graphicSource.dirty ? ', waiting to write back' : ', written'))
          : 'not written back yet'),
        e('div', { style: { display: 'flex', gap: 4 } },
          e('button', { type: 'button', className: 'kt-btn small', onClick: function () { writeBackCompressed(); } }, 'Write back now'),
          e('button', { type: 'button', className: 'kt-btn small secondary', onClick: clearSource }, 'Read the ROM again')
        )
      ) : null,
      e('div', { style: { height: 1, background: 'var(--kt-widget-border-default)', margin: '2px 0' } }),
      e('div', { style: { fontWeight: 600 } }, 'Region'),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: regionSt[0], spellCheck: false, placeholder: 'hex offset',
          onChange: function (ev) { regionSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitRegion(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitRegion }, 'Go')
      ),
      e('div', { style: { opacity: 0.7, lineHeight: 1.45 } }, 'Palette, map, text and hex controls live in the inspector on the right of the canvas.'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.45 } }, st.status || 'Detect a region, then click a tile and paint pixels. Every pixel is written as a hex patch.')
    );
  }

  // A new ROM can be a different console, so the format and any opened compressed
  // source are dropped when one arrives.
  global.addEventListener('ketor:rom-loaded', function (ev) {
    // Identifying hashes the whole file, so it happens once per load, not per render.
    var detail = (ev && ev.detail) || {};
    var ident = null;
    if (detail.data && K.core.identifyRom) {
      try { ident = K.core.identifyRom(detail.data, detail.name || ''); } catch (err) { ident = null; }
    }
    var prof = consoleProfile();
    _set({
      romIdentity: ident,
      graphicSource: null,
      candidates: [],
      region: null,
      format: prof.defaultFormat || _state.format
    });
    /* The screens this ROM was already given, which is what makes the second visit
       exact instead of proposed. */
    var known = savedScreens();
    _set({
      savedScreens: known,
      status: prof.label + ' loaded: ' + known.length + ' screen(s) remembered, '
        + (prof.compression && prof.compression.length ? 'graphics are compressed' : 'tiles are stored raw') + '.'
    });
  });

  /* One call for the whole application: open an offset here and come to this activity. */
  K.tileOpenAt = function (offset, options) {
    var ok = openAt(offset, options);
    if (ok) focusActivity();
    return ok;
  };
  if (K.commands && K.commands.registerCommand) {
    K.commands.registerCommand('ketor.tile.openAt', function (arg) {
      var at = arg && (arg.offset !== undefined ? arg.offset : arg);
      return K.tileOpenAt(at, arg || {});
    });
  }

  K.ui.registerTabProvider('tile', TileTab);
  K.ui.registerSidebarProvider('tile', TileSidebar);
  K.tile = {
    getState: getState, subscribe: subscribe, useTile: useTile,
    detect: detect, setPixel: setPixel, setRegion: function (o) { _set({ region: Number(o) }); },
    setFormat: function (f) { _set({ format: String(f) }); }, colourAt: colourCss,
    setColour: function (v) { _set({ colour: Number(v) }); }, readTile: readTile,
    regionWindow: regionWindow, tileAbsoluteOffset: tileAbsoluteOffset,
    loadPalette: loadPalette, readPaletteAt: readPaletteAt, findPalette: findPalette, paletteScore: paletteScore,
    writePaletteColour: writePaletteColour,
    parsePaletteText: parsePaletteText, paletteText: paletteText,
    parseHexString: parseHexString, applyHex: applyHex, tileHexText: tileHexText,
    pixelSpanForByte: pixelSpanForByte, fromBgr555: fromBgr555, toBgr555: toBgr555,
    MAP_SIZES: MAP_SIZES, mapWindow: mapWindow, charWindow: charWindow, mapEntry: mapEntry,
    detectMap: detectMap, scoreMapBlock: scoreMapBlock, charBase: charBase,
    findScreens: findScreens, screenCoverage: screenCoverage, charTilesLimit: charTilesLimit, scanCharBases: scanCharBases,
    findPalettes: function () {
      if (!K.core.paletteCandidates) return null;
      var res = K.core.paletteCandidates(romBytes() || new Uint8Array(0), {
        near: charBase(), span: 0x40000, referenced: true, system: consoleProfile().id, max: 10
      });
      _set({ palettes: res.top, status: 'Palettes: ' + res.pointed + ' pointed at, ' + res.total + ' total.' });
      return res;
    },
    consoleProfile: consoleProfile, mapLayoutId: mapLayoutId, openCandidate: openCandidate, clearSource: clearSource,
    repointRegion: repointRegion, romIdentity: function () { return _state.romIdentity; },
    parseOffsetInput: parseOffsetInput, savedScreens: savedScreens, saveCurrentScreen: saveCurrentScreen,
    loadSavedScreen: loadSavedScreen, deleteSavedScreen: deleteSavedScreen,
    writeBackCompressed: writeBackCompressed, scheduleCompressedWrite: scheduleCompressedWrite,
    openAt: function (offset, options) { return K.tileOpenAt(offset, options); },
    writeMapEntry: writeMapEntry, mapBucket: mapBucket, renderMap: renderMap, bankPalette: bankPalette,
    decodeMapTile: decodeMapTile, entryTile: entryTile, entryFlipH: entryFlipH, entryFlipV: entryFlipV,
    entryBank: entryBank, setView: function (v) { _set({ view: String(v) }); },
    setMap: function (o) { _set(o || {}); },
    PALETTE_COLOURS: PALETTE_COLOURS
  };
})(window);
