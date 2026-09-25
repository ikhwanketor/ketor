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

  var _state = {
    region: null,
    format: 'gba-4bpp',
    palette: null,
    paletteOffset: null,
    paletteName: '',
    paletteCandidates: [],
    colour: 1,
    zoom: 3,
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
    var src = romBytes();
    var C = K.core;
    if (!src || !C || typeof C.tileSize !== 'function') return null;
    var start = windowStart();
    var size = C.tileSize(_state.format) * _state.tiles;
    var end = Math.min(src.length, start + size);
    if (!(end > start)) return null;
    var out = src.slice(start, end);
    var patches = patchesMap();
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= start && off < end) out[off - start] = patches[k] & 0xFF;
    });
    return { start: start, bytes: out };
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
    px[y][x] = value;
    var encoded = C.encodeTile(px, fmt);
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
  function pixelSpanForByte(format, index) {
    var b = Number(index) || 0;
    if (format === 'gba-4bpp') {
      var row = Math.floor(b / 4), par = b % 4;
      return [{ x: par * 2, y: row }, { x: par * 2 + 1, y: row }];
    }
    if (format === 'gba-8bpp') return [{ x: b % 8, y: Math.floor(b / 8) }];
    if (format === 'gb-2bpp' || format === 'nes-2bpp') {
      var r2 = Math.floor(b / 2);
      var span = [];
      for (var x = 0; x < 8; x++) span.push({ x: x, y: r2 });
      return span;
    }
    return null;
  }

  /* ---------- detection ---------- */

  /* Score every 64 KiB step and keep the best few, so detection proposes a
     region instead of silently choosing one. */
  function detect() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return; }
    if (!K.core || typeof K.core.scoreTileRegion !== 'function') { _set({ status: 'Tile codec missing.' }); return; }
    _set({ scanning: true, status: 'Scoring regions...' });
    var found = [];
    var fmt = _state.format;
    var step = 0x10000;
    for (var off = 0; off + 64 * K.core.tileSize(fmt) < bytes.length; off += step) {
      var score = K.core.scoreTileRegion(bytes, off, fmt, 64);
      found.push({ offset: off, score: score });
    }
    found.sort(function (a, b) { return b.score - a.score; });
    var best = found.slice(0, 8);
    _set({
      scanning: false,
      candidates: best,
      region: best.length ? best[0].offset : null,
      status: best.length
        ? 'Best region 0x' + hex6(best[0].offset) + ' (score ' + best[0].score.toFixed(2) + '), ' + (best.length - 1) + ' other candidate(s).'
        : 'No candidate found.'
    });
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

  /* ---------- canvas ---------- */

  function TileCanvas(props) {
    var ref = uR(null);
    uE(function () {
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
        var off = t * size;
        if (off < 0 || off + size > props.bytes.length) break;
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
      if (props.onDrawn) props.onDrawn(drawn);
    }, [props.bytes, props.windowKey, props.format, props.zoom, props.tiles, props.selected, props.selPixel, props.cursorTile, props.cursorByte, props.palette, props.width]);
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
    var hexPanelSt = uS(false); var hexPanel = hexPanelSt[0]; var setHexPanel = hexPanelSt[1];
    var pasteSt = uS(''); var pasteText = pasteSt[0]; var setPasteText = pasteSt[1];
    var targetSt = uS('tile'); var pasteTarget = targetSt[0]; var setPasteTarget = targetSt[1];
    var dragRef = uR(null);
    var clipRef = uR(null);
    var wrapRef = uR(null);
    var widthSt = uS(800); var width = widthSt[0];

    uE(function () {
      function measure() { if (wrapRef.current) widthSt[1](wrapRef.current.clientWidth || 800); }
      measure();
      global.addEventListener('resize', measure);
      return function () { return global.removeEventListener('resize', measure); };
    }, []);

    var win = regionWindow();
    var windowKey = win ? (win.start + ':' + win.bytes.length + ':' + (hex && hex.patches ? Object.keys(hex.patches).length : 0)) : 'none';

    var cursorTile = -1, cursorByte = 0;
    if (hex && win && K.core) {
      var size = K.core.tileSize(st.format);
      var rel = Number(hex.cursorOffset) - win.start;
      if (rel >= 0 && rel < st.tiles * size) { cursorTile = Math.floor(rel / size); cursorByte = rel % size; }
    }

    // Pixel under the pointer: which tile, and which of its 64 pixels.
    function pixelAt(ev, canvas) {
      var rect = canvas.getBoundingClientRect();
      var z = st.zoom;
      var perRow = Math.max(1, Math.floor((width - 16) / (8 * z)));
      var col = Math.floor((ev.clientX - rect.left) / (8 * z));
      var row = Math.floor((ev.clientY - rect.top) / (8 * z));
      if (col < 0 || row < 0 || col >= perRow) return null;
      var t = row * perRow + col;
      if (t < 0 || t >= st.tiles) return null;
      var x = Math.floor(((ev.clientX - rect.left) - col * 8 * z) / z);
      var y = Math.floor(((ev.clientY - rect.top) - row * 8 * z) / z);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return { tile: t, x: x, y: y };
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
    function copyHexText() {
      var text = selected >= 0 ? tileHexText(selected) : '';
      if (!text) { _set({ status: 'Nothing to copy.' }); return; }
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(function () {
          _set({ status: 'Tile ' + selected + ' bytes copied as hex text.' });
        }, function () { _set({ status: 'Tile ' + selected + ' bytes: ' + text }); });
      } else {
        _set({ status: 'Tile ' + selected + ' bytes: ' + text });
      }
    }
    function applyPaste() {
      var limit = pasteTarget === 'tile' && K.core ? K.core.tileSize(st.format) : 0;
      var off = pasteTarget === 'tile' && K.core ? tileAbsoluteOffset(Math.max(0, selected), K.core) : null;
      if (pasteTarget === 'tile' || pasteTarget === 'region') {
        var bytes = parseHexString(pasteText);
        if (!bytes || !bytes.length) { _set({ status: 'No hex bytes found in the text.' }); return; }
        var start = pasteTarget === 'tile' ? off : windowStart();
        var wrote = 0, n = limit > 0 ? Math.min(bytes.length, limit) : bytes.length;
        for (var i = 0; i < n; i++) if (K.hex.setByte(start + i, bytes[i])) wrote++;
        _set({ status: 'Pasted ' + wrote + ' byte(s) at 0x' + hex6(start) + '.' });
        return;
      }
      if (pasteTarget === 'palette') { parsePaletteText(pasteText); return; }
      applyHex(pasteText, 'palette-rom');
    }

    function onKey(ev) {
      var k = ev.key;
      if (/^[0-9]$/.test(k)) { _set({ colour: Number(k) }); return; }
      if (k === '[') { _set({ colour: (st.colour + 15) % 16 }); ev.preventDefault(); return; }
      if (k === ']') { _set({ colour: (st.colour + 1) % 16 }); ev.preventDefault(); return; }
      var upper = String(k).toUpperCase();
      for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].key === upper) { setTool(TOOLS[i].id); ev.preventDefault(); return; }
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
          type: 'button', className: TB + (hexPanel ? '' : ' secondary'),
          title: 'Copy this tile as hex, or paste bytes from an emulator (tile, region, palette)',
          onClick: function () { setHexPanel(!hexPanel); }
        }, 'Hex'),
        e('span', { style: { flex: 1 } }),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 } }, st.region === null ? 'no region' : '0x' + hex6(st.region)),
        e('span', { style: { opacity: 0.6 } }, st.format),
        e('span', { style: { opacity: 0.6 } }, selected < 0 ? 'no tile' : 'tile ' + selected),
        e('span', { style: { opacity: 0.6 } }, st.palette ? 'palette 0x' + hex6(st.paletteOffset) : 'no palette')
      ),
      hexPanel ? e('div', { style: { flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'flex-start', padding: '6px 10px', borderBottom: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-editor-bg, #1e1e1e)' } },
        e('textarea', {
          value: pasteText,
          onChange: function (ev) { setPasteText(ev.target.value); },
          placeholder: 'Paste hex from an emulator: 20 21 22 ... (tile bytes, or 32 bytes of BGR555 for a palette)',
          spellCheck: false,
          style: { flex: '1 1 auto', minHeight: 46, fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: 4, resize: 'vertical' }
        }),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' } },
          e('select', { className: 'kt-select', value: pasteTarget, onChange: function (ev) { setPasteTarget(ev.target.value); }, style: { fontSize: 11 } },
            e('option', { value: 'tile' }, 'Write at selected tile'),
            e('option', { value: 'region' }, 'Write at region start'),
            e('option', { value: 'palette' }, 'Load as palette'),
            e('option', { value: 'palette-rom' }, 'Write at palette offset')),
          e('div', { style: { display: 'flex', gap: 4 } },
            e('button', { type: 'button', className: TB, onClick: applyPaste }, 'Apply'),
            e('button', { type: 'button', className: TB + ' secondary', onClick: copyHexText, disabled: selected < 0 }, 'Copy hex'),
            e('button', { type: 'button', className: TB + ' secondary', onClick: function () { setPasteText(''); } }, 'Clear'))
        )
      ) : null,
      e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 8 } },
        win ? e(TileCanvas, {
          bytes: win.bytes,
          windowKey: windowKey,
          format: st.format, zoom: st.zoom, tiles: st.tiles,
          selected: selected, selPixel: sel, palette: st.palette,
          cursorTile: cursorTile, cursorByte: cursorByte,
          width: Math.max(200, width - 16),
          onClick: onDown, onMove: onMove, onUp: onUp, onContext: onContext
        }) : e('div', { style: { opacity: 0.7 } }, 'No region selected. Detect tiles or type a region offset in the sidebar.')
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

  function TileSidebar() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var formats = (K.core && K.core.TILE_FORMATS) || {};
    var regionSt = uS(st.region === null ? '' : hex6(st.region));
    var palSt = uS(st.paletteOffset === null ? '' : hex6(st.paletteOffset));

    uE(function () { regionSt[1](st.region === null ? '' : hex6(st.region)); }, [st.region]);
    uE(function () { palSt[1](st.paletteOffset === null ? '' : hex6(st.paletteOffset)); }, [st.paletteOffset]);

    function commitRegion() {
      var v = parseInt(String(regionSt[0]).replace(/^0x/i, ''), 16);
      if (!Number.isFinite(v)) { _set({ status: 'Region must be a hex offset.' }); return; }
      _set({ region: v });
    }
    function commitPalette() {
      var v = parseInt(String(palSt[0]).replace(/^0x/i, ''), 16);
      if (!Number.isFinite(v)) { _set({ status: 'Palette offset must be a hex offset.' }); return; }
      loadPalette(v);
    }

    var rowStyle = { display: 'flex', gap: 4, alignItems: 'center' };
    var inputStyle = { flex: '1 1 auto', fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };

    return e('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
      e('div', { style: { fontWeight: 600 } }, 'Tiles'),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Format',
        e('select', {
          className: 'kt-select', value: st.format,
          onChange: function (ev) { _set({ format: ev.target.value, region: null, candidates: [] }); },
          style: { fontSize: 11 }
        }, Object.keys(formats).map(function (id) {
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
        title: 'Score the ROM in 64 KiB steps and propose the best tile region'
      }, st.scanning ? 'Scanning...' : 'Detect tiles'),
      st.candidates.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 } },
        e('div', { style: { opacity: 0.75 } }, 'Candidates (score)'),
        st.candidates.map(function (c) {
          return e('button', {
            key: 'cand' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.region === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            onClick: function () { _set({ region: c.offset }); }
          }, '0x' + hex6(c.offset) + '  ' + c.score.toFixed(2));
        })
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
      e('div', { style: { height: 1, background: 'var(--kt-widget-border-default)', margin: '2px 0' } }),
      e('div', { style: { fontWeight: 600 } }, 'Palette'),
      e('div', { style: { opacity: 0.7, lineHeight: 1.45 } }, 'BGR555, 16 colours (32 bytes). Load from the ROM, edit a colour (written as a patch), or paste 32 bytes from an emulator in the Hex panel.'),
      e('div', { style: rowStyle },
        e('input', {
          style: inputStyle, value: palSt[0], spellCheck: false, placeholder: 'palette offset',
          onChange: function (ev) { palSt[1](ev.target.value); },
          onKeyDown: function (ev) { if (ev.key === 'Enter') commitPalette(); }
        }),
        e('button', { type: 'button', className: 'kt-btn small', onClick: commitPalette, disabled: !hex || !hex.romBytes }, 'Load')
      ),
      e('div', { style: { display: 'flex', gap: 4 } },
        e('button', { type: 'button', className: 'kt-btn small secondary', style: { flex: '1 1 auto' }, disabled: !hex || !hex.romBytes, onClick: findPalette, title: 'Search +-0x40000 around the region for an uncompressed 16 colour palette' }, 'Find near region'),
        e('button', { type: 'button', className: 'kt-btn small secondary', disabled: !st.palette, onClick: exportPalette }, 'Export .pal'),
        e('button', { type: 'button', className: 'kt-btn small secondary', onClick: importPaletteDialog }, 'Import')
      ),
      st.paletteCandidates && st.paletteCandidates.length ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        e('div', { style: { opacity: 0.75 } }, 'Palette candidates (score)'),
        st.paletteCandidates.map(function (c) {
          return e('button', {
            key: 'pal' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.paletteOffset === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            title: 'Load the 16 colours at this offset',
            onClick: function () { loadPalette(c.offset); }
          }, '0x' + hex6(c.offset) + '  ' + c.score.toFixed(2));
        })
      ) : null,
      st.palette ? e(PaletteSwatches, { palette: st.palette, colour: st.colour, onPick: function (i) { _set({ colour: i }); } }) : null,
      e('div', { style: { opacity: 0.7, lineHeight: 1.45 } }, st.status || 'Detect a region, then click a tile and paint pixels. Every pixel is written as a hex patch.')
    );
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
    PALETTE_COLOURS: PALETTE_COLOURS
  };
})(window);
