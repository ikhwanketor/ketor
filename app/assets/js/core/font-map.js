/* The game's own font, read out of the cartridge and written back into it.
   
   The Aria of Sorrow font was found at 0x0E3A80 and verified glyph by glyph: raw 4bpp tiles, 32
   bytes each, the low nibble is the left pixel, and the glyphs run in ASCII order from 0x21. The
   profile carries that in graphics.font, so this reads the glyphs the game actually draws rather
   than a font found by shape, and it can write an edited glyph back into the same bytes. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

  function fontFromProfile(profile) {
    var graphics = profile && profile.graphics;
    var font = graphics && graphics.font;
    if (!font || !Number.isFinite(Number(font.at))) return null;
    return {
      at: Number(font.at),
      tileSize: Number(font.tileSize) || 32,
      kind: String(font.kind || 'gba-4bpp'),
      firstCode: Number.isFinite(Number(font.firstCode)) ? Number(font.firstCode) : 0x21,
      lastCode: Number.isFinite(Number(font.lastCode)) ? Number(font.lastCode) : 0x7E,
      indexRule: String(font.indexRule || 'code - firstCode'),
      source: font.source ? String(font.source) : ''
    };
  }

  function offsetOf(font, code) {
    if (!font) return -1;
    if (code < font.firstCode || code > font.lastCode) return -1;
    return font.at + (code - font.firstCode) * font.tileSize;
  }

  /* A glyph as the game stores it: eight rows of eight palette indices. The text font uses one
     colour, so the rows are kept in the byte they came out of and written back unchanged. */
  function readGlyph(rom, font, code) {
    var at = offsetOf(font, code);
    if (at < 0 || at + font.tileSize > rom.length) return null;
    var rows = [], indices = [];
    for (var y = 0; y < 8; y++) {
      var row = '', line = [];
      for (var x = 0; x < 8; x++) {
        var byte = rom[at + y * 4 + (x >> 1)];
        var value = (x & 1) ? (byte >> 4) : (byte & 0x0F);
        line.push(value);
        row += value ? '#' : '.';
      }
      rows.push(row);
      indices.push(line);
    }
    return { code: code, char: String.fromCharCode(code), at: at, rows: rows, indices: indices };
  }

  function readAll(rom, font) {
    var out = [];
    if (!font) return out;
    for (var code = font.firstCode; code <= font.lastCode; code++) {
      var glyph = readGlyph(rom, font, code);
      if (glyph) out.push(glyph);
    }
    return out;
  }

  function pixels(glyph) {
    var n = 0;
    for (var y = 0; y < glyph.rows.length; y++) {
      for (var x = 0; x < glyph.rows[y].length; x++) if (glyph.rows[y][x] === '#') n++;
    }
    return n;
  }

  /* Writes one glyph where the game keeps it: the same bytes the reader looked at, so the editor
     changes the cartridge and nothing else. A row that is not eight characters long is refused. */
  function writeGlyph(rom, font, code, rows) {
    var at = offsetOf(font, code);
    if (at < 0 || at + font.tileSize > rom.length) return { ok: false, reason: 'outside the font' };
    if (!rows || rows.length !== 8) return { ok: false, reason: 'a glyph is eight rows' };
    for (var i = 0; i < 8; i++) if (String(rows[i]).length !== 8) return { ok: false, reason: 'every row is eight pixels' };
    for (var y = 0; y < 8; y++) {
      var line = String(rows[y]);
      for (var x = 0; x < 8; x += 2) {
        var left = line[x] === '#' ? 1 : 0;
        var right = line[x + 1] === '#' ? 1 : 0;
        rom[at + y * 4 + (x >> 1)] = (left & 0x0F) | ((right & 0x0F) << 4);
      }
    }
    return { ok: true, at: at, bytes: font.tileSize };
  }

  core.fontMap = {
    fontFromProfile: fontFromProfile,
    offsetOf: offsetOf,
    readGlyph: readGlyph,
    readAll: readAll,
    writeGlyph: writeGlyph,
    pixels: pixels
  };
})(window);