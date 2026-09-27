/* ============================================================
   Ketor - Game profiles
   ------------------------------------------------------------
   Every piece of knowledge that is about ONE game, in one file:
   which console it is, where its pointer table is, how a record
   ends, where the font lives and how a character code becomes a
   glyph, which graphics the dialogue window uses, and (later)
   which table describes the rooms.

   The engine stays generic, the knowledge is data. That is how the
   tools that work across many games do it: Kruptar keeps a .kpl
   config per game, DSVania Editor describes one engine at a time,
   Advance Map one game family. It is also the only way to be
   precise: guessing a table from shapes gave 41 wrong candidates on
   one rom and none at all on another, while a profile states the
   address and the rule.

   A profile is a plain JSON document, so a user can write one, fix
   one, or share one. Fields that are unknown are simply absent, and
   the engine falls back to what it can work out by itself.

   Shape:

     {
       "format": "ketor-profile", "version": 1,
       "id": "castlevania-aos-usa", "name": "Castlevania - Aria of Sorrow (USA)",
       "console": "gba", "sha1": "abd71fe0...",
       "text":     { "table": "castlevaniaGBA.tbl" },
       "pointers": { "at": 0x506B40, "count": 2893, "entrySize": 4, "stride": 4,
                     "endianness": "little", "base": 0x08000000 },
       "records":  { "header": "0100", "end": "05090A" },
       "graphics": {
         "tileFormat": "gba-4bpp",
         "font":   { "at": 0x..., "tileSize": 8, "indexRule": "code-0x20", "firstCode": 0x20, "lastCode": 0x7F,
                     "kind": "tiles" | "sheet", "compression": "none" | "lz77" | "rle" },
         "window": { "at": 0x..., "tiles": 9, "compression": "lz77" },
         "palette":{ "at": 0x..., "format": "bgr555" }
       },
       "scenes":   { "rooms": { "table": 0x..., "stride": 0, "tilesetField": 0, "tilemapField": 0, "paletteField": 0 } },
       "notes": "how the addresses were found, who verified them"
     }
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};
  var K = Ketor;

  var PROFILE_FORMAT = 'ketor-profile';
  var PROFILE_VERSION = 1;

  /* The profiles that ship with the app. One entry, and every field in it was
     verified against the rom: the table against three sources (the original rom,
     a crashing build of this tool, and the indonesian translation patch), the
     record shape (01 00 header, 05 09 0a end) by dumping records, and the console
     by the header. */
  var BUILT_IN = [
    {
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      id: 'castlevania-aos-usa',
      name: 'Castlevania - Aria of Sorrow (USA)',
      console: 'gba',
      sha1: 'abd71fe01ebb201bcc133074db1dd8c5253776c7',
      text: { table: 'castlevaniaGBA.tbl', note: '164 entries, one byte per character' },
      pointers: { at: 0x506B40, count: 2893, entrySize: 4, stride: 4, endianness: 'little', base: 0x08000000 },
      records: { header: '0100', end: '05090A' },
      graphics: {
        tileFormat: 'gba-4bpp',
        font: {
          /* Verified on the cartridge, glyph by glyph: the tiles at 0x0E3A80 were decoded as 4bpp
             and read as the characters they are (! " 0 9 A B Z a z all checked), the region is
             raw rather than compressed, the low nibble is the left pixel and the glyphs run in
             ASCII order from 0x21. The Tile Editor pointed at 0x0E3660, 33 tiles before the
             first glyph. */
          at: 0x0E3A80,
          tileSize: 32,
          kind: 'gba-4bpp',
          firstCode: 0x21,
          lastCode: 0x7E,
          indexRule: 'code - 0x21',
          source: 'verified on the cartridge'
        },
        window: null,
        palette: null,
        note: 'The dialogue font is not located yet: it is not a standalone run of tiles (a scan of the whole rom, bpp 1/2/4, 8x8 and 16x16, three index rules, found only shapes that fail a letter test), and most graphics here are compressed. Filling these three fields is what turns the page layout into the real in game picture.'
      },
      scenes: { rooms: null, note: 'No public map of this engine exists (no disassembly), so the rooms have to be worked out or captured.' }
    }
  ];

  function isProfile(value) {
    return !!(value && typeof value === 'object' && value.format === PROFILE_FORMAT);
  }

  function normalizeHex(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    var text = String(value).trim();
    if (!text) return null;
    if (/^0x[0-9a-f]+$/i.test(text) || /^[0-9a-f]+$/i.test(text)) {
      var parsed = parseInt(text.replace(/^0x/i, ''), 16);
      return Number.isFinite(parsed) ? (parsed >>> 0) : null;
    }
    var dec = parseInt(text, 10);
    return Number.isFinite(dec) ? (dec >>> 0) : null;
  }

  function normalizeBytes(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      var out = [];
      for (var i = 0; i < value.length; i++) {
        var b = Number(value[i]);
        if (!Number.isFinite(b)) return null;
        out.push(b & 0xFF);
      }
      return out.length ? out : null;
    }
    var text = String(value).replace(/[^0-9a-fA-F]/g, '');
    if (!text || text.length % 2 !== 0) return null;
    var bytes = [];
    for (var k = 0; k < text.length; k += 2) bytes.push(parseInt(text.substr(k, 2), 16) & 0xFF);
    return bytes.length ? bytes : null;
  }

  /* Everything a profile says, with the numbers as numbers and the byte strings as
     arrays, so the engine never has to parse a document twice. Unknown fields stay
     null: absent means "not known yet", never "zero". */
  function normalizeProfile(input) {
    if (!input || typeof input !== 'object') return null;
    var raw = input;
    var p = {
      format: PROFILE_FORMAT,
      version: Number(raw.version) || PROFILE_VERSION,
      id: String(raw.id || ''),
      name: String(raw.name || raw.id || 'Unnamed profile'),
      console: String(raw.console || ''),
      sha1: raw.sha1 ? String(raw.sha1).toLowerCase() : '',
      notes: raw.notes ? String(raw.notes) : ''
    };
    var t = raw.text || {};
    p.text = { table: t.table ? String(t.table) : null, note: t.note ? String(t.note) : null };
    var pt = raw.pointers || raw.table;
    if (pt && normalizeHex(pt.at) !== null) {
      p.pointers = {
        at: normalizeHex(pt.at),
        count: Number(pt.count) || 0,
        entrySize: Number(pt.entrySize) || 4,
        stride: Number(pt.stride) || Number(pt.entrySize) || 4,
        endianness: String(pt.endianness || 'little'),
        base: normalizeHex(pt.base) || 0,
        name: String(pt.name || p.name),
        confirmed: pt.confirmed !== false
      };
    } else p.pointers = null;
    var rec = raw.records || {};
    p.records = {
      header: normalizeBytes(rec.header),
      end: normalizeBytes(rec.end),
      note: rec.note ? String(rec.note) : null
    };
    var g = raw.graphics || {};
    var font = g.font || null;
    p.graphics = {
      tileFormat: g.tileFormat ? String(g.tileFormat) : null,
      note: g.note ? String(g.note) : null,
      font: font && normalizeHex(font.at) !== null ? {
        at: normalizeHex(font.at),
        tileSize: Number(font.tileSize) || 8,
        indexRule: String(font.indexRule || 'code-0x20'),
        firstCode: normalizeHex(font.firstCode) !== null ? normalizeHex(font.firstCode) : 0x20,
        lastCode: normalizeHex(font.lastCode) !== null ? normalizeHex(font.lastCode) : 0x7F,
        kind: String(font.kind || 'tiles'),
        compression: String(font.compression || 'none'),
        bitsPerPixel: Number(font.bitsPerPixel) || 0
      } : null,
      window: g.window && normalizeHex(g.window.at) !== null ? {
        at: normalizeHex(g.window.at),
        tiles: Number(g.window.tiles) || 9,
        compression: String(g.window.compression || 'none'),
        note: g.window.note ? String(g.window.note) : null
      } : null,
      palette: g.palette && normalizeHex(g.palette.at) !== null ? {
        at: normalizeHex(g.palette.at),
        format: String(g.palette.format || 'bgr555'),
        colors: Number(g.palette.colors) || 16
      } : null
    };
    var s = raw.scenes || {};
    p.scenes = {
      rooms: s.rooms && normalizeHex(s.rooms.table) !== null ? {
        table: normalizeHex(s.rooms.table),
        stride: Number(s.rooms.stride) || 0,
        tilesetField: Number(s.rooms.tilesetField) || 0,
        tilemapField: Number(s.rooms.tilemapField) || 0,
        paletteField: Number(s.rooms.paletteField) || 0,
        note: s.rooms.note ? String(s.rooms.note) : null
      } : null,
      note: s.note ? String(s.note) : null
    };
    return p;
  }

  function profileForHash(sha1) {
    var key = String(sha1 || '').toLowerCase();
    if (!key) return null;
    for (var i = 0; i < BUILT_IN.length; i++) {
      if (String(BUILT_IN[i].sha1 || '').toLowerCase() === key) return normalizeProfile(BUILT_IN[i]);
    }
    return null;
  }

  function parseProfile(text) {
    var data = null;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (err) { return { profile: null, error: 'The profile file is not valid JSON.' }; }
    if (!isProfile(data)) return { profile: null, error: 'Not a Ketor game profile (missing "format": "ketor-profile").' };
    var profile = normalizeProfile(data);
    if (!profile) return { profile: null, error: 'The profile has no usable content.' };
    var problems = validateProfile(profile);
    return { profile: profile, error: null, problems: problems };
  }

  /* What is missing, in the order it matters. A profile is allowed to be partial:
     the engine uses what is there and says what is not. */
  function validateProfile(profile) {
    var problems = [];
    if (!profile) return ['no profile'];
    if (!profile.pointers && !profile.graphics.font) problems.push('no pointer table and no font: the profile does not describe anything this tool can use yet');
    if (profile.pointers) {
      if (!(profile.pointers.count > 1)) problems.push('pointer table: count must be more than one');
      if (!(profile.pointers.entrySize >= 2 && profile.pointers.entrySize <= 4)) problems.push('pointer table: entry size must be 2, 3 or 4 bytes');
    }
    if (profile.graphics.font) {
      var f = profile.graphics.font;
      if (!(f.tileSize >= 8 && f.tileSize <= 32)) problems.push('font: tile size looks wrong (' + f.tileSize + ')');
      if (!(f.lastCode >= f.firstCode)) problems.push('font: the last character code is below the first');
    }
    return problems;
  }

  /* A draft for a rom nobody has written a profile for: what can be measured is
     filled in, everything else says null rather than guessing. */
  function draftProfile(romInfo) {
    var info = romInfo || {};
    return normalizeProfile({
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      id: info.id || 'unnamed-rom',
      name: info.name || 'Unnamed rom',
      console: info.console || '',
      sha1: info.sha1 || '',
      notes: 'Draft: only what could be measured from the rom is filled in. Addresses left out are unknown, not zero.',
      pointers: info.pointers || null,
      graphics: info.graphics || {},
      scenes: info.scenes || {}
    });
  }

  function profileSummary(profile) {
    if (!profile) return { id: '', name: 'No profile', known: [], missing: ['everything'], complete: false };
    var known = [];
    var missing = [];
    if (profile.pointers && profile.pointers.count > 1) {
      known.push('pointer table (' + profile.pointers.count + ' entries at 0x' + Number(profile.pointers.at).toString(16).toUpperCase() + ')');
    } else missing.push('pointer table');
    if (profile.records && profile.records.end) known.push('record end code');
    else missing.push('record end code');
    if (profile.graphics.font) known.push('font');
    else missing.push('font');
    if (profile.graphics.window) known.push('dialogue window graphics');
    else missing.push('dialogue window graphics');
    if (profile.graphics.palette) known.push('palette');
    else missing.push('palette');
    if (profile.scenes.rooms) known.push('room table');
    else missing.push('room table');
    return {
      id: profile.id,
      name: profile.name,
      known: known,
      missing: missing,
      complete: missing.length === 0
    };
  }

  K.core.BUILT_IN_PROFILES = BUILT_IN;
  K.core.parseProfile = parseProfile;
  K.core.profileForHash = profileForHash;
  K.core.profileSummary = profileSummary;
})(typeof window !== 'undefined' ? window : this);
