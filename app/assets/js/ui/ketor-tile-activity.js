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
   - A palette is read through the model its console declares
     (core/console-profiles.js: bgr555, gbc-bgr555, gb-shades,
     nes-2c02, md-9bit, ps1-555) and a colour edit is written back
     through the patch layer, never into a copy.
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
  /* One group of the inspector, the shape every other activity panel is built from
     (ketor-translate-sidebar.js, ketor-hex-sidebar.js, ketor-table-sidebar.js,
     ketor-search-sidebar.js): a .kt-sidebar-section with a header and a padded body, so the
     right hand panel of this activity reads like the sidebar of the others. */
  function Section(props) {
    return e('div', { className: 'kt-sidebar-section' },
      e('div', { className: 'kt-sidebar-section-header' }, props.title),
      e('div', {
        className: 'kt-sidebar-section-body',
        style: Object.assign({ padding: '6px 12px 12px 12px' }, props.bodyStyle || {})
      },
        props.children
      )
    );
  }
  var MONO = 'var(--kt-font-mono)';
  /* A palette is as wide as the format it is read for: sixteen BGR555 words (32 bytes) for
     the 1bpp/2bpp/4bpp layouts and 256 (512 bytes) for an 8bpp one. Which formats are 8bpp is
     read from the codec's own table (tileFormat().colors), so this file keeps no second list
     of them; PALETTE_COLOURS stays the sixteen colour block a map palette bank and the
     default width mean. */
  var PALETTE_COLOURS = 16;
  var PALETTE_COLOURS_MAX = 256;

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
    /* The copied region, kept as data rather than as text: { w, h, cols, pixels } with
       the pixels in reading order and cols the length of one row. The paste writes those
       pixels back through setPixel, so a copied tile lands in the hex patch layer like a
       painted one, and a later batch can widen the box without parsing anything. */
    clipboard: null,
    /* The tile range the Select tool drags out, in one of two shapes. A run is
       { tile, w, h }: the w*h tiles that follow the anchor tile in reading order, w to a
       clipboard row, which is what batch 165 stored and what setSelection({ tile, w, h })
       still hands over. A marquee is { col, row, cols, rows, tile }: the rectangle of cols by
       rows cells whose top left cell is (col,row) of the sheet grid the canvas draws, with
       tile the sheet tile of that first cell (a font view draws the sheet from another tile
       on, so the cell alone would name the wrong glyph). Which tiles share a screen row
       depends on how wide the viewport is, so the cells only mean something together with
       gridCols. No selection is null, so the editor copies exactly the one tile it always
       did. */
    selection: null,
    /* How many tiles one screen row of the sheet holds: what turns a tile index into a
       (col,row) cell and back. The canvas reports it as it draws (setGridCols) and a marquee
       cannot be read without it; 0 is "no canvas has named one yet". */
    gridCols: 0,
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
    /* The toolbar controls are ordinary buttons, a checkbox and three boxes: no global
       keyboard handler lives in this activity, and the one on the tab root steps aside
       while a box has the focus, so the offset and stride fields stay free to type in.
       Ctrl+C/V copies and pastes a region of the sheet and is handled by that same root
       handler, never by a listener on the document, so a field keeps its own clipboard
       keystrokes. */
    grid: true,
    /* Where the sheet is read from, how many bits a pixel is and how far the next tile
       of the sheet sits. offsetText holds what is in the offset box, so the box never
       jumps under the cursor: only text that parses is committed to offset. */
    offset: 0,
    offsetText: null,
    depth: 4,
    stride: 32,
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

  /* ---------- the palette model of a console ---------- */

  /* core/console-profiles.js declares the palette every console has, and this is the file that
     reads the declaration. The six formats it names are not one shape:

       bgr555      GBA, NDS, SNES, PC Engine: a 16 bit word, low byte first, red bits 0-4,
                   green 5-9, blue 10-14, bit 15 unused. What this editor always decoded, and
                   what the map palette banks still decode.
       gbc-bgr555  the same word, but one bank is four colours (eight bytes), not sixteen.
       gb-shades   the four shades of the DMG screen. bytesPerColour 0 means nothing about
                   them is in the file, so there is no colour to read and none to write.
       nes-2c02    a ROM byte is a six bit index into the PPU's fixed 64 colour table: the
                   colours live in the console and no colour edit can be written back.
       md-9bit     0BBB0GGG0RRR: three bits a channel, expanded to eight.
       ps1-555     the 555 word again, but bit 15 is the STP (semi transparency) flag rather
                   than an unused bit, so a palette that sets it is legal.

     paletteModel() answers with the model of the loaded ROM's console; readPaletteAt,
     writePaletteColour, paletteScore, findPalette, the swatch strip and the sidebar label all
     ask it instead of assuming BGR555, and a console whose profile is not loaded (or is
     'unknown') keeps the BGR555 behaviour of the batches before this one. */

  /* The 64 colours a NES PPU shows for the indices $00-$3F, from the 2C02G palette on the
     NESdev wiki (PPU palettes, generated with Persune's palette generator v0.15.0). $0D
     ("blacker than black", which the wiki says not to use), $0E, $0F, $1D-$1F, $2E, $2F, $3E
     and $3F are black in that table. */
  var NES_2C02 = [
    0x626262, 0x012090, 0x240BA0, 0x470090, 0x600062, 0x6A0024, 0x601100, 0x472700,   // $00-$07
    0x243C00, 0x014A00, 0x004F00, 0x004724, 0x003662, 0x000000, 0x000000, 0x000000,   // $08-$0F
    0xABABAB, 0x1F56E1, 0x4D39FF, 0x7E23EF, 0xA31BB7, 0xB42264, 0xAC370E, 0x8C5500,   // $10-$17
    0x5E7200, 0x2D8800, 0x079000, 0x008947, 0x00739D, 0x000000, 0x000000, 0x000000,   // $18-$1F
    0xFFFFFF, 0x67ACFF, 0x958DFF, 0xC875FF, 0xF26AFF, 0xFF6FC5, 0xFF836A, 0xE6A01F,   // $20-$27
    0xB8BF00, 0x85D801, 0x5BE335, 0x45DE88, 0x49CAE3, 0x4E4E4E, 0x000000, 0x000000,   // $28-$2F
    0xFFFFFF, 0xBFE0FF, 0xD1D3FF, 0xE6C9FF, 0xF7C3FF, 0xFFC4EE, 0xFFCBC9, 0xF7D7A9,   // $30-$37
    0xE6E397, 0xD1EE97, 0xBFF3A9, 0xB5F2C9, 0xB5EBEE, 0xB8B8B8, 0x000000, 0x000000    // $38-$3F
  ];

  /* The four shades of a DMG screen, palest first: tile colour 0 is the lightest pixel the LCD
     shows and colour 3 the darkest. */
  var DMG_SHADES = [0x9BBC0F, 0x8BAC0F, 0x306230, 0x0F380F];

  function packedColour(v) {
    return { r: (v >> 16) & 0xFF, g: (v >> 8) & 0xFF, b: v & 0xFF };
  }
  function clamp255(v) { return Math.max(0, Math.min(255, Math.round(Number(v) || 0))); }

  /* Mega Drive: ---BBB-GGG-RRR-, a three bit channel expanded to eight the way such a channel
     is: (v << 5) | (v << 2) | (v >> 1), so seven is 255. A real cartridge stores the word big
     endian; this editor keeps the one low byte first order every other read here uses, and a
     written entry goes back the same way, so a read and an edit of the same sheet agree. */
  function expand3(v) { return (v << 5) | (v << 2) | (v >> 1); }
  function fromMd9(lo, hi) {
    var v = ((lo & 0xFF) | ((hi & 0xFF) << 8)) & 0xFFFF;
    return { r: expand3((v >> 1) & 7), g: expand3((v >> 5) & 7), b: expand3((v >> 9) & 7) };
  }
  function toMd9(c) {
    return ((((clamp255(c.r) >> 5) & 7) << 1) | (((clamp255(c.g) >> 5) & 7) << 5)
      | (((clamp255(c.b) >> 5) & 7) << 9)) & 0xFFFF;
  }

  /* n entries of a fixed ramp, cycling when the sheet asks for more than the console has. */
  function packedRamp(ramp, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(packedColour(ramp[i % ramp.length]));
    return out;
  }

  /* The model a profile's palette format names. A profile that carries no palette at all - the
     fallback consoleProfile() hands back when core/console-profiles.js is not loaded - gets
     bgr555, which is exactly what every read in this file did before the models existed. */
  function paletteModelFor(profile) {
    var p = profile || {};
    var pal = p.palette || {};
    var format = String(pal.format || 'bgr555');
    var cols = Math.round(Number(pal.coloursPerBank));
    var model = {
      id: String(p.id == null ? 'unknown' : p.id),
      format: format,
      name: 'BGR555',
      bytesPerColour: Number(pal.bytesPerColour) || 0,
      coloursPerBank: cols > 0 ? cols : PALETTE_COLOURS,
      bankBytes: Number(pal.bankBytes) || 0,
      /* Bytes one entry takes in the file: two for a word, one for a NES index, none for a
         Game Boy shade (there is nothing in the file to read). */
      stride: 2,
      /* Do the colours themselves live in the file? For a NES index and a Game Boy ramp the
         answer is no, and then a colour edit has nothing to write. */
      inRom: true,
      /* Is one bank narrower than the sixteen colour block? A read with no count then stops at
         the bank instead of running into the next one. */
      bank: false,
      /* The bit that disqualifies a word when a candidate palette is scored. 0 when a set bit
         is legal (PS1's STP flag) or when there is no word to score. */
      alphaBit: 0x8000,
      /* The colours the canvas and the swatches fall back to while no palette is loaded, when
         the console has a palette that is not in the file. */
      ramp: null,
      readEntry: null,
      decode: fromBgr555,
      encode: toBgr555,
      label: '{n} colours read as BGR555 words. A colour edit is written to the ROM as a patch.',
      note: 'Read from the ROM as BGR555 words.',
      writeRefusal: 'No palette offset: this palette was not read from the ROM. Load a palette from the ROM first.',
      searchRefusal: ''
    };
    if (format === 'gb-shades') {
      model.name = 'Game Boy shades';
      model.stride = 0;
      model.inRom = false;
      model.bank = true;
      model.alphaBit = 0;
      model.ramp = DMG_SHADES.slice();
      model.decode = null;
      model.encode = null;
      model.label = '{n} shades from the DMG screen ramp, not data in the ROM: a colour edit has no byte to write.';
      model.note = 'The four shades are the screen, not data in the file.';
      model.writeRefusal = 'A Game Boy palette is the four shade ramp, not a colour in the ROM: nothing was written.';
      model.searchRefusal = 'A Game Boy palette is the four shade ramp: there is no colour palette to find in the ROM.';
    } else if (format === 'gbc-bgr555') {
      model.name = 'GBC BGR555';
      model.bank = true;
      model.label = '{n} colours: one GBC bank holds ' + model.coloursPerBank + ' BGR555 words ('
        + model.bankBytes + ' bytes). A colour edit is written to the ROM as a patch.';
      model.note = 'Read from the ROM as one bank of ' + model.coloursPerBank + ' BGR555 words ('
        + model.bankBytes + ' bytes).';
    } else if (format === 'nes-2c02') {
      model.name = 'NES 2C02';
      model.stride = 1;
      model.inRom = false;
      model.bank = true;
      model.alphaBit = 0;
      model.decode = null;
      model.encode = null;
      model.readEntry = function (bytes, at) { return packedColour(NES_2C02[(bytes[at] & 0xFF) & 0x3F]); };
      model.label = '{n} colours: each ROM byte is a six bit index into the fixed 2C02 table, so there is no colour to write back.';
      model.note = 'Each entry is a six bit 2C02 index read from the ROM.';
      model.writeRefusal = 'A NES palette is a 2C02 index: the colour is in the console, not in the ROM, so nothing was written.';
      model.searchRefusal = 'A NES palette is a list of 2C02 indices, not colours: there is no BGR555 palette to find.';
    } else if (format === 'md-9bit') {
      model.name = 'Mega Drive 9 bit';
      model.decode = fromMd9;
      model.encode = toMd9;
      model.label = '{n} colours as 0BBB0GGG0RRR: eight steps a channel. A colour edit is written to the ROM as a patch.';
      model.note = 'Read from the ROM as 0BBB0GGG0RRR words.';
    } else if (format === 'ps1-555') {
      model.name = 'PS1 555';
      model.alphaBit = 0;
      model.label = '{n} colours as 555 words; bit 15 is the semi transparency (STP) flag, not a colour bit.';
      model.note = 'Read as 555 words: bit 15 is the STP flag, not a colour bit.';
    }
    if (!model.readEntry && model.decode) {
      model.readEntry = function (bytes, at) { return model.decode(bytes[at] & 0xFF, bytes[at + 1] & 0xFF); };
    }
    return model;
  }

  /* The model of the console the loaded ROM is. The key is built without asking the profile
     table, because colourCss() asks for a fallback colour once per pixel of the sheet: the
     model is rebuilt only when the console, its system name or the sheet's format changed. */
  var _modelKey = null;
  var _modelCache = null;
  function paletteModel() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    var ident = _state.romIdentity;
    var key = (h ? h.romSystem : '') + '\u0000' + String(ident && ident.system) + '\u0000' + String(_state.format);
    if (_modelCache && _modelKey === key) return _modelCache;
    _modelCache = paletteModelFor(consoleProfile());
    _modelKey = key;
    return _modelCache;
  }

  /* What the sidebar says about the palette of the sheet: the model of the console and how
     many entries this sheet uses. */
  function paletteModelText() {
    return paletteModel().label.replace('{n}', String(paletteColourCount()));
  }

  /* ---------- colour ---------- */

  /* How many entries the palette of the sheet on screen may hold: the colour count of the
     format itself, which the codec's own table carries - two for a 1bpp layout, four for the
     2bpp ones, sixteen for 4bpp and 256 for 8bpp - so a 2bpp sheet no longer asks for a
     sixteen entry block it cannot use. The depth box can still ask for 8bpp on its own, and
     an unknown format id keeps the sixteen entry block. */
  function paletteColourCount(format) {
    var C = K.core;
    var id = (format === undefined || format === null || format === '') ? _state.format : format;
    var count = PALETTE_COLOURS;
    if (C && typeof C.tileFormat === 'function') {
      var f = C.tileFormat(id);
      var colors = f ? Math.round(Number(f.colors)) : 0;
      if (colors > 0) count = Math.min(PALETTE_COLOURS_MAX, colors);
    }
    if (Number(_state.depth) === 8) count = Math.max(count, PALETTE_COLOURS_MAX);
    return count;
  }

  /* Plain ramp, used until a palette is read from the ROM: black, white, two greys. Above
     index 15 - an 8bpp sheet with no palette loaded - the ramp keeps climbing instead of
     collapsing onto colour 15, so those pixels stay tellable apart while the palette is
     still being looked for. Indices 0-15 are exactly what they always were. */
  function rampColour(index) {
    var i = Math.max(0, Number(index) || 0);
    if (i > 15) {
      var g8 = Math.min(255, i);
      return { r: g8, g: g8, b: Math.round(g8 * 0.85) };
    }
    var v = Math.min(15, i);
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
    /* With no palette loaded a Game Boy still shows its own four shades (they are the screen,
       not the file); every other console keeps the grey ramp this file always had. */
    var ramp = paletteModel().ramp;
    if (ramp && ramp.length) return packedColour(ramp[i % ramp.length]);
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

  /* ---------- the base, the depth and the step of the sheet ---------- */

  /* One tile of a sheet takes one byte per pixel column of its depth: 1bpp is 8 bytes,
     2bpp 16, 4bpp 32, 8bpp 64. Those are the sizes the format table uses, so a sheet
     read at its own depth steps exactly as it did before these boxes existed. */
  var DEPTHS = [1, 2, 4, 8];
  function tileBytesForDepth(depth) {
    var d = Number(depth);
    return (DEPTHS.indexOf(d) >= 0 ? d : 4) * 8;
  }
  function depthForFormat(formatId) {
    var C = K.core;
    var size = (C && typeof C.tileSize === 'function') ? C.tileSize(formatId) : 32;
    var d = Math.round(Number(size) / 8);
    return DEPTHS.indexOf(d) >= 0 ? d : 4;
  }
  /* 1..64, the range the stride box promises. Anything else is "no stride given". */
  function clampStride(v) {
    var n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.max(1, Math.min(64, n));
  }
  /* Bytes from one tile of the sheet to the next. The stride box wins while it holds a
     number; an empty box lets the depth decide, which is the step this file took before
     the box existed (tileIndex * tileSize). */
  function tilePitch() {
    var s = clampStride(_state.stride);
    return s === null ? tileBytesForDepth(_state.depth) : s;
  }
  /* The depth and the stride that belong to a format, so picking one never leaves the
     sheet stepping at another format's tile size. */
  function formatPatch(formatId) {
    var d = depthForFormat(formatId);
    return { depth: d, stride: tileBytesForDepth(d) };
  }
  /* A sheet base is an address inside the ROM: everything past the last byte becomes
     that last byte rather than a window that reads nothing. */
  function clampOffset(v, len) {
    var n = Math.max(0, Math.round(Number(v) || 0));
    if (!(Number(len) > 0)) return 0;
    return Math.min(n, Math.round(Number(len)) - 1);
  }
  /* Free typing: spaces and a 0x prefix are fine, and text that is not a hex number yet
     - "0x" halfway through a keystroke - gives null instead of NaN. */
  function parseSheetOffset(text) {
    var raw = String(text == null ? '' : text).replace(/\s+/g, '');
    if (!raw) return null;
    var digits = raw.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]+$/.test(digits)) return null;
    var v = parseInt(digits, 16);
    return Number.isFinite(v) ? v : null;
  }

  function windowStart() {
    var r = _state.region;
    if (r !== null && r !== undefined && Number.isFinite(Number(r))) return Number(r);
    var o = Number(_state.offset);
    return Number.isFinite(o) ? o : 0;
  }

  /* A window of the ROM at a base the caller names, with the patches applied. These are
     the bytes an edit has to compare against and write to: the loaded file plus what the
     hex patch layer already holds; a copy of the file alone would lose a painted pixel.
     regionWindow() is this for the base the editor is looking at; an export or an import
     names a base of its own, which is why it is a function and not a second branch. */
  function windowBytesAt(start, size) {
    var C = K.core;
    var src = romBytes();
    if (!src || !C || typeof C.tileSize !== 'function') return null;
    var from = Math.max(0, Math.floor(Number(start) || 0));
    var end = Math.min(src.length, from + Math.max(0, Math.floor(Number(size) || 0)));
    if (!(end > from)) return null;
    var out = src.slice(from, end);
    var patches = patchesMap();
    var keyParts = [];
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= from && off < end) {
        out[off - from] = patches[k] & 0xFF;
        keyParts.push(k + '=' + (patches[k] & 0xFF));
      }
    });
    return { start: from, bytes: out, key: from + ':' + out.length + ':' + keyParts.join(',') };
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
    /* Room for as many tiles as the sheet shows at the step the depth and the stride
       ask for, which is the format's own tile size until either of them changes. */
    return windowBytesAt(windowStart(), tilePitch() * _state.tiles);
  }

  /* One compact line that says what the tab is looking at: the window base, the format,
     the depth and the step a tile takes, how many tiles are on the sheet, how many of the
     hex patches fall inside that window, which tile and pixel are picked, how far the
     image reaches and which graphic is open. Every part is read from the store and the hex
     layer when it is called, so a caller can print it with K.tile.statusLine() and the
     status strip of the tab renders the very same string instead of a second summary. An
     anchor that is not there shows a dash, never NaN: hex6 already answers '------' for a
     number it does not have, and the image length is asked for before it is printed. */
  function statusLine(hint) {
    var h = hint || {};
    var start = windowStart();
    var pitch = tilePitch();
    var depth = Number(_state.depth) || 4;
    var count = Math.max(0, Math.round(Number(_state.tiles) || 0));
    var from = Math.max(0, Math.floor(Number(start) || 0));
    var to = from + pitch * count;
    /* The patches that land on the sheet on screen, the same range windowBytesAt() applies:
       a patch outside the window belongs to another part of the ROM and is not counted. */
    var patches = patchesMap();
    var inside = 0;
    Object.keys(patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (Number.isFinite(off) && off >= from && off < to) inside++;
    });
    var selected = Number(h.selected);
    var sel = h.sel;
    var len = (K.hex && typeof K.hex.imageLength === 'function') ? Number(K.hex.imageLength()) : NaN;
    var gs = _state.graphicSource;
    var parts = [
      '0x' + hex6(start),
      String(_state.format == null ? '?' : _state.format),
      depth + 'bpp/' + pitch,
      'tiles ' + count,
      'patch ' + inside,
      'tile ' + (Number.isFinite(selected) && selected >= 0 ? String(selected) : '-')
    ];
    if (sel && Number.isFinite(Number(sel.x)) && Number.isFinite(Number(sel.y))) {
      parts.push('sel ' + (Number.isFinite(Number(sel.tile)) ? Number(sel.tile) : '?') + '@' + Number(sel.x) + ',' + Number(sel.y));
    }
    parts.push(Number.isFinite(len) ? 'image 0x' + hex6(len) + ' (' + len + ' byte(s))' : 'image -');
    parts.push(gs && gs.label ? 'graphic ' + String(gs.label) + ' 0x' + hex6(gs.offset) : 'graphic ROM');
    return parts.join(' | ');
  }

  /* The bytes an export reads and an import writes, at a base the caller names. While a
     compressed graphic is open the editor edits its decompressed copy, so a base that
     names that stream is served from the copy: an import there lands in the copy and goes
     to the ROM through writeBackCompressed, exactly where a painted pixel goes. */
  function imageWindowAt(at, size) {
    var C = K.core;
    var gs = _state.graphicSource;
    if (gs && gs.data && Number(at) === Number(gs.offset)) {
      var from = gs.dataOffset || 0;
      if (!(gs.data.length > from)) return null;
      var visible = Math.min(gs.data.length - from, Math.max(0, Math.floor(Number(size) || 0)));
      var slice = gs.data.slice(from, from + visible);
      return {
        start: gs.offset,
        bytes: slice,
        compressed: { offset: gs.offset, label: gs.label, size: gs.size, dataOffset: gs.dataOffset || 0 },
        key: 'compressed:' + gs.offset + ':' + slice.length + ':' + (gs.version || 0)
      };
    }
    return windowBytesAt(at, size);
  }

  /* Where tile n starts inside the window: the step the depth and the stride ask for,
     the format's tile size while both keep their defaults. */
  function tileWindowOffset(tileIndex, C) {
    return Number(tileIndex) * tilePitch();
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

  /* Writes one pixel of a tile in one window through the Hex Editor patch layer. The
     window is an argument because an import writes tiles the editor may not have on
     screen; a painted pixel hands in regionWindow(), so both take the same path. */
  function setPixelInWindow(win, tileIndex, x, y, colour) {
    var C = K.core;
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
        /* The window is the snapshot the pixels were decoded from; an import paints a
           whole tile through it, so it has to see the byte that was just written.
           Otherwise the second pixel of a 4bpp byte would be encoded against the tile as
           it was before the first one and undo it. */
        win.bytes[rel + i] = encoded[i];
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
      if (K.hex && K.hex.setByte && K.hex.setByte(base + i, encoded[i])) {
        written++;
        /* The window is a snapshot, and an import paints pixel after pixel into one of
           them: keep it in step with the byte just written so the second pixel of a 4bpp
           byte is encoded against what the ROM now holds instead of overwriting it. */
        win.bytes[rel + i] = encoded[i];
      }
    }
    if (written && x >= 0) {
      _set({ status: 'Pixel (' + x + ',' + y + ') colour ' + value + ' written: ' + written + ' byte(s) at 0x' + hex6(base) + '.' });
    }
    return written > 0;
  }

  /* A painted pixel is the window the editor is looking at. */
  function setPixel(tileIndex, x, y, colour) {
    return setPixelInWindow(regionWindow(), tileIndex, x, y, colour);
  }

  /* Which pixels of a tile one byte covers, so the Hex Editor cursor can be
     shown on the canvas. 4bpp: two pixels, 8bpp: one, 2bpp planes: a row. */
  /* Which pixels of a tile one byte covers comes from the shared mapping, so the
     hex cursor lands on the same pixels the codec reads. */
  function pixelSpanForByte(format, index) {
    if (!K.core.byteToPixels || !K.core.tileFormat) return null;
    return K.core.byteToPixels(K.core.tileFormat(format), index, 8);
  }

  /* ---------- clipboard: a box of pixels, copied and pasted through setPixel ---------- */

  /* The region this editor copies is one tile box of 8x8 pixels. There is no dragged box
     to take a larger one from: the canvas names one selected tile and the Hex Editor names
     one cursor, so the tile itself is the simplest box that is always there. The clipboard
     is a structure in the store, not a text blob - { w, h, cols, pixels } with the pixels
     in reading order and cols the length of a row - so the paste, the two toolbar buttons
     and a later multi tile box all read one shape. */
  /* Which tile a copy or a paste works on: the one named, else the tile the Hex Editor
     cursor sits on (the two views point at one place), else the first tile of the visible
     window, which is always drawn. */
  function regionTileIndex(tileIndex) {
    var named = tileIndex === null || tileIndex === undefined ? NaN : Number(tileIndex);
    if (Number.isFinite(named) && named >= 0) return Math.floor(named);
    var win = regionWindow();
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    if (!win || !h) return 0;
    var rel = Number(h.cursorOffset) - win.start;
    if (!Number.isFinite(rel) || rel < 0 || rel >= _state.tiles * tilePitch()) return 0;
    return Math.floor(rel / tilePitch());
  }

  /* How many tiles one screen row of the sheet holds. The canvas draws a row of this many
     and the Select tool counts the cells of its marquee with the same call, so the tile under
     the pointer and the cell a block names cannot drift apart. */
  function rowTiles(canvasWidth, zoom) {
    return Math.max(1, Math.floor((Number(canvasWidth) || 0) / (8 * (Number(zoom) || 1))));
  }
  /* The same number for a caller that has the viewport and not the canvas: the canvas is the
     viewport minus its padding, never thinner than 200 pixels. */
  function viewportRowTiles(viewWidth, zoom) {
    return rowTiles(Math.max(200, (Number(viewWidth) || 0) - 16), zoom);
  }
  /* The grid the store knows: 0 until a canvas - or a caller that measured the row itself -
     says how wide it is. */
  function sheetGridCols() {
    var n = Math.floor(Number(_state.gridCols));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function setGridCols(n) {
    var v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < 1) v = 0;
    if (v !== (Number(_state.gridCols) || 0)) _set({ gridCols: v });
  }

  /* The tile range the Select tool drags out, made safe to copy and to draw. A run is the
     { tile, w, h } batch 165 stored - w*h tiles from the anchor tile in reading order, w to a
     clipboard row - and it is still what setSelection({ tile, w, h }) hands over. A marquee is
     { col, row, cols, rows, tile }: the rectangle of cols by rows cells of the sheet grid
     whose top left cell holds tile. A block has to start on the sheet, both sizes are whole
     tiles of at least one, and it never claims more tiles than the sheet holds: a marquee also
     stops at the end of the row it starts on and at the last row of the sheet, so it stays a
     rectangle and never becomes a run that wraps. A marquee without a sheet grid - no canvas
     has named the row width - is no range at all, because a cell is not a tile yet. Anything
     that is not a range - null, an object without a usable anchor - is no selection at all,
     and no selection is the single tile box the editor had before ranges existed. */
  function normalizeSelection(sel) {
    if (!sel || typeof sel !== 'object') return null;
    var most = Math.max(1, Math.round(Number(_state.tiles) || 1));
    if (sel.cols !== undefined || sel.rows !== undefined || sel.col !== undefined || sel.row !== undefined) {
      var grid = sheetGridCols();
      if (!grid) return null;
      var col = Math.floor(Number(sel.col));
      var row = Math.floor(Number(sel.row));
      if (!Number.isFinite(col) || col < 0 || !Number.isFinite(row) || row < 0) return null;
      var sheetRows = Math.max(1, Math.ceil(most / grid));
      if (col >= grid || row >= sheetRows) return null;
      var cols = Math.floor(Number(sel.cols));
      var rows = Math.floor(Number(sel.rows));
      if (!Number.isFinite(cols) || cols < 1) cols = 1;
      if (!Number.isFinite(rows) || rows < 1) rows = 1;
      cols = Math.min(cols, grid - col);
      rows = Math.min(rows, sheetRows - row);
      var at = Math.floor(Number(sel.tile));
      if (!Number.isFinite(at) || at < 0) at = row * grid + col;
      return { col: col, row: row, cols: cols, rows: rows, tile: at };
    }
    var tile = Math.floor(Number(sel.tile));
    if (!Number.isFinite(tile) || tile < 0) return null;
    var w = Math.floor(Number(sel.w));
    var h = Math.floor(Number(sel.h));
    if (!Number.isFinite(w) || w < 1) w = 1;
    if (!Number.isFinite(h) || h < 1) h = 1;
    return { tile: tile, w: Math.min(most, w), h: Math.min(most, h) };
  }

  /* One reading of both shapes: a block is cols tiles across and rows down, and stride says
     which tile the next cell of the same block row holds. A run measures that stride in its
     own width - which is what makes an old w x 1 range and a one row marquee the same block -
     and a marquee measures it in the sheet grid. Only a marquee carries the cell it starts on:
     a run's anchor is a tile, not a cell of any grid. */
  function selectionBlock(sel) {
    var s = normalizeSelection(sel);
    if (!s) return null;
    if (s.cols !== undefined) {
      return { marquee: true, tile: s.tile, cols: s.cols, rows: s.rows, stride: sheetGridCols(), col: s.col, row: s.row };
    }
    return { marquee: false, tile: s.tile, cols: s.w, rows: s.h, stride: s.w };
  }

  /* The one way a selection enters the store: the Select tool hands its two corners here
     and a caller that names a range hands the range itself. clearSelection() is the same
     call with nothing, which is what Escape does. A copy, the marker on the canvas and the
     status line all read this one value, so they cannot show different ranges. */
  function setSelection(sel) { _set({ selection: normalizeSelection(sel) }); }
  function clearSelection() { setSelection(null); }

  /* A copy reads a region into the clipboard and writes nothing: copying is not an edit, so
     the patch layer and the loaded file stay exactly as they were. The region is the one
     tile the caller named - the selected tile, else the tile the Hex Editor cursor sits on -
     or, with a selection in the store, the block it names: a run of w*h tiles from its anchor
     or the cols x rows rectangle of the sheet grid, either way cols tiles to a clipboard row,
     which is the order the paste writes them back in. A tile of the block the window does not
     hold stays blank and is counted in the status, so a block half off the sheet still copies
     the tiles that are there. */
  function copyRegion(tileIndex) {
    var stored = _state.selection;
    var block = selectionBlock(stored);
    if (!block && stored) { _set({ status: 'Cannot copy the range: no sheet grid is open, so a cell of it is not a tile yet.' }); return false; }
    var anchor = block ? block.tile : regionTileIndex(tileIndex);
    var ws = block ? block.cols : 1;
    var hs = block ? block.rows : 1;
    var stride = block ? block.stride : 1;
    var pixels = [], missing = 0, read = {};
    var w = 8 * ws, h = 8 * hs;
    /* The pixels go into the clipboard the way the paste reads them back: row by row over
       the whole block, with the tile a pixel belongs to worked out from its column and the
       stride of the block. Reading one tile after another instead would put the second tile
       of a row under the first in the clipboard and a paste would scatter the block. */
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var src = anchor + Math.floor(y / 8) * stride + Math.floor(x / 8);
        var px = read[src];
        if (px === undefined) {
          px = readTile(src) || null;
          read[src] = px;
          if (!px) missing++;
        }
        pixels.push(px ? px[y % 8][x % 8] : 0);
      }
    }
    if (missing >= ws * hs) { _set({ status: 'Nothing to copy: open a tile region first.' }); return false; }
    /* The clipboard remembers which of the two shapes it came from: the paste lays a marquee
       out on the screen rows below its destination and a run out on its own clipboard row. */
    _set({
      clipboard: { w: w, h: h, cols: w, tile: anchor, pixels: pixels, marquee: block ? block.marquee : false },
      status: (block && block.marquee)
        ? 'Region col ' + block.col + ',row ' + block.row + ' (' + ws + 'x' + hs + ' tile(s)) copied as a ' + w + 'x' + h + ' block (' + pixels.length + ' pixels)'
          + (missing ? ', ' + missing + ' tile(s) outside the window are blank.' : '.')
        : (ws === 1 && hs === 1)
          ? 'Tile ' + anchor + ' copied as an 8x8 region (' + pixels.length + ' pixels).'
          : 'Tiles ' + anchor + '..' + (anchor + ws * hs - 1) + ' copied as a ' + w + 'x' + h + ' region (' + pixels.length + ' pixels)'
            + (missing ? ', ' + missing + ' tile(s) outside the window are blank.' : '.')
    });
    return true;
  }

  /* The paste writes every pixel back through setPixel, the one path a byte takes, so the
     pasted pixels become hex patches and take part in Undo, Clear and Export. A region of
     more than one tile is mapped tile by tile: the clipboard pixel (x,y) belongs to the tile
     floor(y/8) rows and floor(x/8) columns away from the destination, and lands at the pixel
     (x%8,y%8) inside it. A marquee was cut out of the screen grid, so its rows go back down
     the screen rows below the destination tile - the tile the caller names is where its first
     block row starts - while a run keeps the batch 165 stride of one clipboard row (cols/8
     tiles). The 8x8 case is the same arithmetic and writes the same bytes in the same order
     as the tile box always did. A destination tile that is not wholly inside the window is
     cut instead of half written, and the status says how many were: on a sheet that ends mid
     tile the last byte of it never moves. */
  function pasteRegion(tileIndex) {
    var clip = _state.clipboard;
    if (!clip || !clip.pixels || !clip.pixels.length) { _set({ status: 'Copy a tile first.' }); return false; }
    var tile = regionTileIndex(tileIndex);
    var w = Math.max(0, Math.floor(Number(clip.w) || 0));
    var hh = Math.max(0, Math.floor(Number(clip.h) || 0));
    var cols = Math.floor(Number(clip.cols) || 0) || w;
    var clipTiles = Math.max(1, Math.floor(cols / 8));
    var grid = sheetGridCols();
    var marquee = clip.marquee === true;
    /* A marquee is placed on the screen grid the canvas draws; without one its cells are not
       tiles, so nothing is written rather than a block somewhere else. */
    if (marquee && !grid) { _set({ status: 'Cannot paste the copied block: no sheet grid is open, so a cell of it is not a tile yet.' }); return false; }
    var perRow = marquee ? grid : clipTiles;
    var fit = {};
    var cut = 0, wrote = 0;
    for (var y = 0; y < hh; y++) {
      for (var x = 0; x < w; x++) {
        var dest = tile + Math.floor(y / 8) * perRow + Math.floor(x / 8);
        var open = fit[dest];
        if (open === undefined) {
          open = readTile(dest) !== null;
          fit[dest] = open;
          if (!open) cut++;
        }
        if (!open) continue;
        if (setPixel(dest, x % 8, y % 8, clip.pixels[y * cols + x])) wrote++;
      }
    }
    _set({
      status: 'Pasted the copied region into tile ' + tile + ': ' + wrote + ' pixel(s) changed'
        + (cut ? '; ' + cut + ' tile(s) outside the window were cut.' : '.')
    });
    return wrote > 0;
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

  /* How far the image the patch layer holds reaches right now: the loaded file plus the
     appended tail. It is where a move inside the file has to land, but it is not a wall an
     append cannot cross any more - setByte grows the tail to take a write past it (batch
     162) - so the caller uses it to tell an append from a plan that would land on top of a
     tail someone already wrote. */
  function patchableLength(bytes) {
    if (K.hex && typeof K.hex.imageLength === 'function') {
      var length = Number(K.hex.imageLength());
      if (Number.isFinite(length) && length > 0) return length;
    }
    return bytes ? bytes.length : 0;
  }

  function scheduleCompressedWrite() {
    if (_writeTimer) global.clearTimeout(_writeTimer);
    _writeTimer = global.setTimeout(function () { _writeTimer = null; writeBackCompressed(); }, 450);
  }

  function writeBackCompressed(options) {
    var opts = options || {};
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
    var plan = C.planRelocation(bytes, enc.bytes, {
      system: consoleProfile().id, oldOffset: gs.offset, align: 4,
      /* A move has to land where the patch layer can write it, and that is inside the
         image it holds. An import that made a graphic grow asks for the free space inside
         the file with opts.preferInside. */
      preferInside: opts.preferInside === true
    });
    if (!plan.ok) {
      _set({ status: 'The new stream is ' + enc.compressedSize + ' bytes and no longer fits at 0x' + hex6(gs.offset) + '. It could not be moved: ' + plan.reason + '. The edit stays in the editor; nothing was written.' });
      return plan;
    }
    /* An append lands past the end of the loaded file, which is no longer where the patch
       layer stops: setByte writes the appended tail and grows the image for it (batch 162,
       see the "bytes grown past the end" note in ui/ketor-hex-state.js), so the plan's
       writes are taken instead of being refused one by one. Two plans are still refused,
       because they are what makes an append a move rather than bytes nothing reads:
       - the plan redirects nothing, so the copy would be unreachable: the original is still
         where the game reads it from. That is the case this refusal has always reported as
         "no room inside the file", and it is the one the suite locks.
       - the plan would land inside the appended tail an earlier move (or a longer inserted
         image) already owns, overwriting bytes a pointer now names. planRelocation measures
         free space inside the loaded file only, so it cannot see that tail. */
    var limit = patchableLength(bytes);
    var appends = plan.newOffset >= bytes.length;
    var appended = (K.hex && typeof K.hex.appendedLength === 'function') ? (Number(K.hex.appendedLength()) || 0) : 0;
    var ontoTail = appends && appended > 0 && plan.newOffset < limit;
    var beyondImage = plan.newOffset + plan.bytes > limit && !(appends && plan.pointers.length > 0);
    if (ontoTail || beyondImage) {
      _set({ status: 'The new stream is ' + enc.compressedSize + ' bytes and no longer fits at 0x' + hex6(gs.offset) + '. ' + (ontoTail
        ? 'It would land on the ' + appended + ' byte(s) already appended at 0x' + hex6(bytes.length) + ', which a pointer may name.'
        : 'It would have to be appended past the end of the file (0x' + hex6(plan.newOffset) + ') and nothing named the old address, so the copy would be unreachable.') + ' The edit stays in the editor; nothing was written.' });
      return { ok: false, reason: 'no room inside the file', newOffset: plan.newOffset, bytes: plan.bytes };
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

  /* Reads the palette at an offset through the console's model. The count defaults to what the
     sheet's format holds - 2, 4, 16 or 256 entries - capped at one bank for a console whose
     bank is narrower than the sixteen colour block (a GBC bank is four). A Game Boy has no
     entry in the file at all, so its four shades come back whatever the offset is; a NES entry
     is one index byte, every other format two bytes a colour. An explicit count is honoured,
     clamped into the range a palette can be. */
  function readPaletteAt(offset, count) {
    var bytes = romBytes();
    var off = Number(offset);
    var model = paletteModel();
    var explicit = !(count === undefined || count === null);
    var n = explicit ? Math.round(Number(count)) : paletteColourCount();
    if (!Number.isFinite(n) || n < 1) n = PALETTE_COLOURS;
    if (!explicit && model.bank) n = Math.min(n, model.coloursPerBank);
    if (n > PALETTE_COLOURS_MAX) n = PALETTE_COLOURS_MAX;
    /* A Game Boy shade is not in the ROM: the ramp is the same at every offset. */
    if (!model.stride) return packedRamp(model.ramp, n);
    if (!bytes || !Number.isFinite(off) || off < 0 || off + n * model.stride > bytes.length) return null;
    var pal = [];
    for (var i = 0; i < n; i++) pal.push(model.readEntry(bytes, off + i * model.stride));
    return pal;
  }

  function loadPalette(offset, name) {
    var off = Number(offset);
    var model = paletteModel();
    var pal = readPaletteAt(off);
    if (!pal) { _set({ status: 'Palette offset is outside the ROM.' }); return null; }
    _set({
      palette: pal,
      /* Only a palette the file really holds has an offset an edit could write to. */
      paletteOffset: model.inRom ? off : null,
      paletteName: name == null ? '' : String(name),
      status: model.inRom
        ? 'Palette: ' + pal.length + ' colours read from 0x' + hex6(off) + ' (' + model.name + ').'
        : 'Palette: ' + pal.length + ' colours of the ' + model.name + ' model. ' + model.note
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
  function paletteScore(bytes, off, entries) {
    var model = paletteModel();
    /* A console whose colours are not in the file (a Game Boy ramp, NES indices) has no BGR555
       block to score at all. */
    if (!model.inRom) return null;
    /* How many words the candidate is scored as: sixteen by default, 256 when the sheet is
       8bpp. It is a parameter so the score of a 4bpp candidate is exactly the number it
       always was. */
    var n = (entries === undefined || entries === null) ? PALETTE_COLOURS : Math.round(Number(entries));
    if (!Number.isFinite(n) || n < 2) n = PALETTE_COLOURS;
    if (n > PALETTE_COLOURS_MAX) n = PALETTE_COLOURS_MAX;
    var distinct = {}, count = 0, alpha = 0, sumR = 0, sumG = 0, sumB = 0;
    var minR = 32, maxR = -1, minG = 32, maxG = -1, minB = 32, maxB = -1;
    for (var i = 0; i < n; i++) {
      var v = (bytes[off + i * 2] & 0xFF) | ((bytes[off + i * 2 + 1] & 0xFF) << 8);
      /* Bit 15 is unused on a GBA/SNES/GBC/MD word, so a palette that sets it often is not a
         palette; on a PS1 it is the STP flag and a legal palette may set it (model.alphaBit). */
      if (model.alphaBit && (v & model.alphaBit)) alpha++;
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
    var avgR = sumR / n, avgG = sumG / n, avgB = sumB / n;
    var greyish = (Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgR - avgB)) / 93;
    var score = (count / n) * 0.2 + wide * 0.25 + (1 - luma) * 0.35 + Math.min(1, greyish * 3) * 0.2;
    return { offset: off, score: score, colours: count, luma: luma };
  }

  /* Best effort search for an uncompressed palette. The width is the sheet's own: sixteen
     words near a 4bpp sheet, 256 near an 8bpp one. Palettes that the ROM stores compressed
     (LZ77) cannot be found this way and the GBA keeps the palette it is using in palette
     RAM, so the candidate list is a starting point: click through it, or type an offset, or
     paste 32 bytes (512 for 8bpp) from the emulator. */
  function findPalette() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return null; }
    var model = paletteModel();
    if (!model.inRom) { _set({ status: model.searchRefusal }); return null; }
    var entries = paletteColourCount();
    var block = entries * 2;
    var centre = windowStart();
    var span = 0x40000;
    var from = Math.max(0, centre - span);
    var to = Math.min(bytes.length - block, centre + span);
    var found = [];
    for (var off = from; off <= to; off += 2) {
      var s = paletteScore(bytes, off, entries);
      if (s) found.push(s);
    }
    if (!found.length) { _set({ status: 'No uncompressed ' + entries + ' colour palette found near 0x' + hex6(centre) + '.' }); return null; }
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

  /* The ROM offset a palette edit may write to, or null while the palette did not come from
     the ROM. Number(null) is 0, so asking Number.isFinite() about an unset offset answers
     "a palette at 0x000000" and a colour edit would land in the first bytes of the file:
     the offset is tested before it is converted. A palette imported from text has no offset
     at all; only loadPalette() reading one out of the file gives it back. */
  function paletteRomOffset() {
    var off = _state.paletteOffset;
    if (off === null || off === undefined || off === '') return null;
    var n = Number(off);
    return Number.isFinite(n) ? n : null;
  }

  /* A palette edit is a ROM edit: it goes through the patch layer. A console whose colours are
     not in the file at all - the Game Boy ramp, a NES 2C02 index - has nothing to write, and
     while no offset was read from the ROM the edit is refused, so not one byte is written. */
  function writePaletteColour(index, rgb) {
    var i = Number(index) || 0;
    var model = paletteModel();
    var off = paletteRomOffset();
    var bytes = romBytes();
    if (!model.inRom) { _set({ status: model.writeRefusal }); return false; }
    if (!bytes || off === null) {
      _set({ status: model.writeRefusal });
      return false;
    }
    /* The range follows the sheet: index 200 is a real entry of an 8bpp palette and an
       index a 4bpp sheet does not have. The two bytes of entry i sit at the palette offset
       plus i*2, so 200 writes the 401st and 402nd byte of a 512 byte palette. */
    if (i < 0 || i >= paletteColourCount()) return false;
    var v = model.encode(rgb);
    var lo = v & 0xFF, hi = (v >> 8) & 0xFF;
    var wrote = 0;
    if ((bytes[off + i * 2] & 0xFF) !== lo && K.hex.setByte(off + i * 2, lo)) wrote++;
    if ((bytes[off + i * 2 + 1] & 0xFF) !== hi && K.hex.setByte(off + i * 2 + 1, hi)) wrote++;
    var pal = (paletteWidened(_state.palette, paletteColourCount()) || []).slice();
    pal[i] = model.decode(lo, hi);
    _set({ palette: pal, status: 'Palette colour ' + i + ' = ' + colourHex(pal[i]) + ' written to 0x' + hex6(off + i * 2) + (wrote ? '' : ' (unchanged)') + '.' });
    return wrote > 0;
  }

  /* What the Find button promises: the palette width of the sheet on screen, and - for a
     console whose colours are not in the file - why there is nothing to search for. */
  function paletteFindTitle() {
    var model = paletteModel();
    if (!model.inRom) return model.searchRefusal;
    return 'Search around the region for an uncompressed palette of this format (' + paletteColourCount() + ' colours).';
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
    /* As many entries as the sheet's format holds, so a palette exported from an emulator
       is not cut to sixteen when an 8bpp sheet is the one on screen. */
    var want = paletteColourCount();
    var colours = [];
    if (lines.length && /^JASC-PAL$/i.test(lines[0])) {
      for (var i = 3; i < lines.length && colours.length < want; i++) {
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
        for (var j = 0; j + 4 <= hexOnly.length && colours.length < want; j += 4) {
          var lo = parseInt(hexOnly.substr(j, 2), 16), hi = parseInt(hexOnly.substr(j + 2, 2), 16);
          colours.push(fromBgr555(lo, hi));
        }
      }
    }
    if (!colours.length) {
      lines.forEach(function (l) {
        if (colours.length >= want) return;
        var p = l.split(/[\s,]+/);
        if (p.length < 3) return;
        var r = parseInt(p[0], 10), g = parseInt(p[1], 10), b = parseInt(p[2], 10);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return;
        colours.push({ r: r & 255, g: g & 255, b: b & 255 });
      });
    }
    if (!colours.length) { _set({ status: 'Palette text not understood: expected JASC-PAL, r g b lines, or 32 bytes of BGR555 hex.' }); return null; }
    while (colours.length < want) colours.push({ r: 0, g: 0, b: 0 });
    _set({
      palette: colours.slice(0, want),
      /* The text is not the ROM. Keeping the offset of the palette that was loaded before
         would let the colour picker write its two bytes into that old address, so an import
         drops it: the palette is 'imported' until loadPalette() reads a real one again. */
      paletteOffset: null,
      paletteName: name ? String(name) : 'imported',
      status: 'Palette loaded from text (' + Math.min(colours.length, want) + ' colours).'
    });
    return colours;
  }

  function exportPalette() {
    var text = paletteText();
    if (!text) { _set({ status: 'No palette loaded.' }); return; }
    var base = (String(_state.paletteName || 'palette')).replace(/\.[^.]+$/, '');
    // only an offset that really came from the ROM belongs in the file name
    var at = paletteRomOffset();
    var name = base + (at === null ? '' : '_0x' + hex6(at)) + '.pal';
    downloadBlob([text], 'text/plain', name);
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

  /* ---------- PNG: the sheet out, a picture in ---------- */

  /* The one download in this activity: a Blob, an anchor and a click. The palette export
     has always worked this way, and the PNG export reuses it so both files leave the same
     way and a test has one thing to watch. */
  function downloadBlob(parts, type, name) {
    var blob = new Blob(parts, { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* A palette of the width the sheet asks for: what the editor holds, widened from the ROM
     at the same offset when the format wants more entries than were read - sixteen colours
     loaded at 4bpp, then the same file read as 8bpp. Entries the editor already holds win,
     so a colour that was edited or drawn is not replaced by the byte the ROM still has. */
  function paletteWidened(pal, count) {
    if (pal && pal.length >= count) return pal;
    var off = paletteRomOffset();
    var rom = off === null ? null : readPaletteAt(off, count);
    if (!rom) return pal;
    if (pal) for (var i = 0; i < pal.length && i < count; i++) rom[i] = pal[i];
    return rom;
  }

  /* The colours an image is painted with and read back into: the palette the editor is
     showing, at the width of the sheet's format - 256 entries for 8bpp, so an index above
     15 is painted with its own colour instead of falling back to the ramp - or the palette
     the offset names. No palette means no import - see importTilesPng - because every
     colour would otherwise land on index 0. */
  function imagePalette() {
    var count = paletteColourCount();
    if (_state.palette && _state.palette.length) return paletteWidened(_state.palette, count);
    /* No offset means no palette at all: Number(null) is 0, and reading sixteen colours
       out of the first bytes of the ROM is not a palette anyone asked for. */
    if (_state.paletteOffset === null || _state.paletteOffset === undefined) return null;
    var off = Number(_state.paletteOffset);
    return Number.isFinite(off) ? readPaletteAt(off, count) : null;
  }

  /* The first count tiles of a window, packed one after another so tilesToRgba reads tile
     t at t * its size. The sheet may step by a stride of its own, and an export that
     ignored it would write a different picture from the one on screen. */
  function packedTiles(win, format, count, step) {
    var C = K.core;
    var size = C.tileSize(format);
    var out = new Uint8Array(count * size);
    for (var t = 0; t < count; t++) {
      var from = t * step;
      out.set(win.bytes.subarray(from, Math.min(win.bytes.length, from + size)), t * size);
    }
    return out;
  }

  /* Export: the tiles of the sheet become a PNG file. tilesToRgba paints the indices with
     the palette and encodePng writes the chunks - no canvas anywhere - and the bytes go to
     a download named after the base and the format, so two sheets of one ROM do not
     overwrite each other. The bytes come back to the caller too, which is what lets a test
     compare the file with the sheet it came from.

     at names the base: the region the editor has open by default, another offset when a
     caller asks for one. A compressed graphic exports from its decompressed copy, which is
     the picture the editor is showing, not the packed stream. */
  function exportTilesPng(options) {
    var opts = options || {};
    var C = K.core;
    var format = (opts.format === undefined || opts.format === null) ? _state.format : String(opts.format);
    var at = (opts.at === undefined || opts.at === null) ? windowStart() : Number(opts.at);
    if (!C || typeof C.tilesToRgba !== 'function' || typeof C.encodePng !== 'function') {
      _set({ status: 'Image export needs core/tile-image.js and core/png-writer.js.' });
      return null;
    }
    if (!Number.isFinite(at) || at < 0) { _set({ status: 'Export refused: no sheet base.' }); return null; }
    var size = C.tileSize(format);
    var step = tilePitch();
    var count = Math.max(0, Math.floor(Number(_state.tiles) || 0));
    if (opts.count !== undefined && opts.count !== null) {
      count = Math.floor(Number(opts.count));
      if (!isFinite(count) || count < 0) count = 0;
    }
    var win = imageWindowAt(at, count * step);
    var fits = (win && win.bytes.length >= size) ? Math.floor((win.bytes.length - size) / step) + 1 : 0;
    if (count > fits) count = fits;
    if (!win || count < 1) { _set({ status: 'Export refused: no whole tile fits at 0x' + hex6(at) + '.' }); return null; }

    var image = C.tilesToRgba(packedTiles(win, format, count, step), { at: 0, format: format, count: count, palette: imagePalette() });
    if (!image || !image.height) { _set({ status: 'Export refused: ' + format + ' is not a tile format this project knows.' }); return null; }
    var png = C.encodePng(image.pixels, image.width, image.height);
    var name = 'tiles_0x' + hex6(at) + '_' + format + '_' + count + 't.png';
    downloadBlob([png], 'image/png', name);
    _set({
      status: 'Exported ' + name + ': ' + count + ' tile(s) from 0x' + hex6(at) + ' as ' + format
        + ', ' + image.width + 'x' + image.height + '.'
    });
    return { bytes: png, name: name, width: image.width, height: image.height, count: count, at: at, format: format };
  }

  /* The inflate a PNG needs. A browser has none built in: the preview page loads pako from
     a CDN for exactly this (and core/save-state.js looks in the same place), while a host
     that has zlib - Node, or an explicit opts.inflate a caller hands in - is used as it
     is. Nothing is guessed: with none of the three an import cannot read a pixel, and it
     says so instead of writing a picture nobody asked for. */
  function inflateFor(provided) {
    if (typeof provided === 'function') return provided;
    if (global.pako && typeof global.pako.inflate === 'function') {
      return function (bytes) { return global.pako.inflate(bytes); };
    }
    if (typeof require === 'function') {
      try {
        var zlib = require('zlib');
        return function (bytes) { return zlib.inflateSync(Buffer.from(bytes)); };
      } catch (error) { /* no zlib here: the caller has to bring an inflate */ }
    }
    return null;
  }

  /* Write a compressed graphic back now instead of waiting for the debounce, so an import
     can say what happened - written, moved, or refused - before it returns. */
  function writeBackNow(options) {
    if (_writeTimer) { global.clearTimeout(_writeTimer); _writeTimer = null; }
    return writeBackCompressed(options);
  }

  /* Import: a PNG file becomes tiles at a base. The picture is read with the project's own
     reader - pngChunks and decodeScreenshot, the two the save state tab already runs -
     turned into tile bytes by rgbaToTiles, and every pixel then goes into the ROM through
     setPixel and writeBackCompressed. That is the one path a byte takes: an imported tile
     is a hex patch like a painted one and takes part in Undo, Clear and Export, and a
     compressed graphic is edited in its decompressed copy and written back the way a
     painted pixel is.

     Nothing is written when the file is not a PNG, when no inflate is available, when no
     palette is loaded (every colour would land on index 0), when the tiles do not fit the
     ROM, or when the write back refuses a stream that grew past its budget and could not
     be moved. In every one of those cases the status says why. */
  function importTilesPng(bytes, options) {
    var opts = options || {};
    var C = K.core;
    var at = (opts.at === undefined || opts.at === null) ? windowStart() : Number(opts.at);
    var format = (opts.format === undefined || opts.format === null) ? _state.format : String(opts.format);
    if (!bytes || !bytes.length) { _set({ status: 'Import refused: no file bytes.' }); return null; }
    if (!C || !C.saveState || typeof C.saveState.pngChunks !== 'function' || typeof C.saveState.decodeScreenshot !== 'function' || typeof C.rgbaToTiles !== 'function' || typeof C.tileSize !== 'function') {
      _set({ status: 'Image import needs core/save-state.js and core/tile-image.js.' });
      return null;
    }
    var chunks = C.saveState.pngChunks(bytes);
    if (!chunks) { _set({ status: 'That file is not a PNG (no signature), so nothing was written.' }); return null; }
    var inflate = inflateFor(opts.inflate);
    if (!inflate) { _set({ status: 'Import PNG needs pako: this page has no inflate, so nothing was written.' }); return null; }
    var shot = C.saveState.decodeScreenshot(bytes, chunks, inflate);
    if (!shot) { _set({ status: 'The PNG could not be read (it is not 8 bit RGB/RGBA, or its stream is damaged), so nothing was written.' }); return null; }
    var palette = imagePalette();
    if (!palette) { _set({ status: 'Import needs a palette: load one first so the PNG colours can be matched to it. Nothing was written.' }); return null; }
    if (!Number.isFinite(at) || at < 0) { _set({ status: 'Import refused: no sheet base.' }); return null; }
    var pngTiles = Math.floor(shot.width / 8) * Math.floor(shot.height / 8);
    if (!pngTiles) { _set({ status: 'The PNG holds no whole 8x8 tile, so nothing was written.' }); return null; }

    var count = Math.min(pngTiles, Math.max(1, Math.floor(Number(_state.tiles) || 1)));
    if (opts.count !== undefined && opts.count !== null) {
      count = Math.floor(Number(opts.count));
      if (!isFinite(count) || count < 0) count = 0;
    }
    if (count > pngTiles) count = pngTiles;
    if (count < 1) { _set({ status: 'Import refused: no tile to write.' }); return null; }

    var tiles = C.rgbaToTiles(shot.pixels, { width: shot.width, height: shot.height, format: format, palette: palette });
    if (!tiles || !tiles.count) { _set({ status: 'Import refused: ' + format + ' is not a tile format this project knows.' }); return null; }
    var size = C.tileSize(format);
    var step = tilePitch();
    var win = imageWindowAt(at, (count - 1) * step + size);
    if (!win) { _set({ status: 'Import refused: 0x' + hex6(at) + ' is outside the ROM. Nothing was written.' }); return null; }
    var fits = win.bytes.length >= size ? Math.floor((win.bytes.length - size) / step) + 1 : 0;
    if (count > fits) { _set({ status: 'Import refused: only ' + fits + ' tile(s) fit in the ROM at 0x' + hex6(at) + '. Nothing was written.' }); return null; }

    var pixels = 0, changed = 0;
    for (var t = 0; t < count; t++) {
      var grid = C.decodeTile(tiles.bytes, t * size, format);
      if (!grid) break;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          pixels++;
          if (setPixelInWindow(win, t, x, y, grid[y][x])) changed++;
        }
      }
    }
    var writeBack = null;
    if (win.compressed) {
      if (!changed) {
        _set({ status: 'Imported ' + count + ' tile(s) at 0x' + hex6(at) + ': the decompressed copy already holds them, so there is nothing to write back.' });
      } else {
        _set({ status: 'Imported ' + count + ' tile(s) at 0x' + hex6(at) + ': ' + changed + ' pixel(s) changed in the decompressed copy; writing it back...' });
        /* The import may have made the graphic grow, so the move goes into free space
           inside the file: an appended block is past the last byte the patch layer takes. */
        writeBack = writeBackNow({ preferInside: true });
      }
    } else {
      _set({
        status: 'Imported ' + count + ' tile(s) at 0x' + hex6(at) + ' as ' + format + ': ' + changed + ' of '
          + pixels + ' pixel(s) changed, written as hex patches.'
      });
    }
    return { at: at, format: format, count: count, pixels: pixels, changed: changed, writeBack: writeBack, bytes: tiles.bytes };
  }

  /* The picker behind the Import PNG button: the file is read as an ArrayBuffer and handed
     to the importer, which stays a plain function a test can call without a FileReader. */
  function importTilesPngDialog() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,image/png';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { importTilesPng(new Uint8Array(reader.result), {}); };
      reader.onerror = function () { _set({ status: 'Could not read ' + file.name + '.' }); };
      reader.readAsArrayBuffer(file);
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
    var off = target === 'palette-rom' ? paletteRomOffset() : windowStart();
    if (off === null || !Number.isFinite(Number(off))) { _set({ status: 'Set a palette offset first.' }); return 0; }
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
    if (!_state.palette) return null;
    /* Bank 0 is the palette that is loaded, whatever it was loaded from. A later bank is
       read from the ROM 32 bytes further on, and an imported palette has no such offset. */
    if (b === 0) return _state.palette;
    var base = paletteRomOffset();
    if (base === null) return null;
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
      // the step between two tiles is padded or tightened by the toolbar; the tile
      // itself is still as many bytes as its format reads
      var step = Number(props.pitch) > 0 ? Number(props.pitch) : size;
      var z = props.zoom;
      // the row of tiles the canvas draws: the same number the Select tool counts cells with
      var perRow = rowTiles(props.width, z);
      var rows = Math.ceil(props.tiles / perRow);
      canvas.width = perRow * 8 * z;
      canvas.height = rows * 8 * z;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var t = 0; t < props.tiles; t++) {
        // a font view draws the sheet in character order, so the drawn slot and the
        // tile in the buffer are two different numbers
        var source = props.order ? props.order[t] : t;
        if (source === null || source === undefined) continue;
        var off = source * step;
        if (off < 0 || off + size > props.bytes.length) continue;
        var px = C.decodeTile(props.bytes, off, fmt);
        var tx = (t % perRow) * 8 * z;
        var ty = Math.floor(t / perRow) * 8 * z;
        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            var c = colourCss(px[y][x]);
            if (ctx.fillStyle !== c) ctx.fillStyle = c;
            ctx.fillRect(tx + x * z, ty + y * z, z, z);
          }
        }
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
      /* The block the Select tool dragged out, drawn as the tiles a copy takes. A marquee is
         one dashed box per block row, cut where the row of the sheet ends: it is a rectangle
         of cells, so a box never reaches over the gap to the next screen row (batch 167). A
         run is the w*h tiles that follow its anchor, cut into screen rows where the sheet
         wraps at perRow, so a range that runs past the right edge shows the row of tiles it
         really is. The dash is what tells a block from the solid box of the picked tile. */
      if (props.selection) {
        var range = props.selection;
        ctx.strokeStyle = '#3fb950';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        if (range.cols !== undefined || range.col !== undefined) {
          var gcol = Math.floor(Number(range.col));
          var grow = Math.floor(Number(range.row));
          var gcols = Math.max(1, Math.floor(Number(range.cols) || 1));
          var grows = Math.max(1, Math.floor(Number(range.rows) || 1));
          if (Number.isFinite(gcol) && gcol >= 0 && Number.isFinite(grow) && grow >= 0) {
            for (var br = 0; br < grows; br++) {
              var cut = Math.min(gcols, perRow - gcol);
              if (cut < 1) break;
              ctx.strokeRect(gcol * 8 * z + 0.5, (grow + br) * 8 * z + 0.5, cut * 8 * z - 1, 8 * z - 1);
            }
          }
        } else {
          var anchor = Math.floor(Number(range.tile));
          var rw = Math.max(1, Math.floor(Number(range.w) || 1));
          var rh = Math.max(1, Math.floor(Number(range.h) || 1));
          if (Number.isFinite(anchor) && anchor >= 0) {
            for (var si = 0; si < rw * rh;) {
              var slot = anchor + si;
              if (slot >= props.tiles) break;
              var scol = slot % perRow;
              var srow = Math.floor(slot / perRow);
              var run = Math.min(rw * rh - si, perRow - scol);
              ctx.strokeRect(scol * 8 * z + 0.5, srow * 8 * z + 0.5, run * 8 * z - 1, 8 * z - 1);
              si += run;
            }
          }
        }
        ctx.setLineDash([]);
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
    }, [props.windowKey, props.format, props.zoom, props.tiles, props.selected, props.selection, props.selPixel, props.cursorTile, props.cursorByte, props.width, props.orderKey]);
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
     button closes over its own index instead of the loop variable. A cell of 18 pixels
     or more has room for the index printed on it; a smaller one keeps the colour and
     leaves the index to the tooltip. */
  function swatchButton(props, i, cell) {
    var size = Number(cell) > 0 ? Number(cell) : 22;
    var c = props.palette && props.palette[i] ? props.palette[i] : paletteColour(i);
    var active = Number(props.colour) === i;
    return e('button', {
      key: 'sw' + i,
      type: 'button',
      title: 'Colour ' + i + ' ' + colourHex(c) + ' (key: ' + (i < 10 ? i : '-') + ')',
      onClick: function () { props.onPick(i); },
      style: {
        width: size, height: size < 22 ? 14 : 18, padding: 0, cursor: 'pointer',
        background: 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')',
        border: active ? '2px solid var(--kt-focus-border, #4daafc)' : '1px solid var(--kt-widget-border-default, #3c3c3c)',
        borderRadius: 2
      }
    }, size < 18 ? null : e('span', { style: { fontSize: 9, color: (c.r + c.g + c.b) > 380 ? '#000' : '#fff' } }, String(i)));
  }

  /* The strip under the canvas: sixteen swatches for a 1/2/4bpp sheet, a 16x16 grid for the
     256 of an 8bpp one. The wide grid is drawn in smaller cells and capped in height so the
     strip stays a strip instead of pushing the canvas out of the tab; a scroll shows the
     rest. The count comes from the format, not from a fixed sixteen. */
  function PaletteSwatches(props) {
    var count = paletteColourCount(props.format);
    var wide = count > PALETTE_COLOURS;
    var cell = wide ? 16 : 22;
    var cells = [];
    for (var i = 0; i < count; i++) cells.push(swatchButton(props, i, cell));
    var style = Object.assign(
      { display: 'grid', gridTemplateColumns: 'repeat(' + (wide ? 16 : 8) + ', ' + cell + 'px)', gap: 2 },
      wide ? { maxHeight: 114, overflowY: 'auto' } : null,
      props.style || {}
    );
    if (wide) style.gridTemplateColumns = 'repeat(16, ' + cell + 'px)';
    return e('div', { style: style }, cells);
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
    /* The Select tool's drag lives apart from dragRef: a pencil or a line stays inside the
       one tile it started on, while a range has to follow the pointer across tiles. */
    var rangeRef = uR(null);
    var panRef = uR(null);
    var wrapRef = uR(null);
    var bodyRef = uR(null);
    var widthSt = uS(800); var width = widthSt[0];

    uE(function () {
      function measure() { if (wrapRef.current) widthSt[1](wrapRef.current.clientWidth || 800); }
      measure();
      global.addEventListener('resize', measure);
      return function () { return global.removeEventListener('resize', measure); };
    }, []);

    /* How wide one screen row of tiles is, told to the store: the canvas draws that many and
       the Select tool counts the cells of its marquee with the same number, so the marker and
       the block a copy reads are the block the user dragged out. A resized window writes a new
       one straight away. */
    uE(function () {
      setGridCols(viewportRowTiles(width, st.zoom));
    }, [width, st.zoom]);

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
      var step = tilePitch();
      var rel = Number(hex.cursorOffset) - win.start;
      if (rel >= 0 && rel < st.tiles * step) { cursorTile = Math.floor(rel / step); cursorByte = rel - cursorTile * step; }
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

    /* The Select tool drags a 2D marquee out of the sheet: the anchor is the cell the mouse
       went down on and every move makes the block the rectangle between that cell and the cell
       under the pointer, cols cells across and rows cells down (batch 167). A drag along one
       screen row is a w x 1 run whatever the viewport is, so it is stored in the shape batch
       165 used; a taller drag is a rectangle of cells and stores the cells it spans plus the
       tile of its first cell, so a copy reads the tiles the canvas drew. The row width the
       drag counts with is the one the canvas counts with, and it is handed to the store here
       too, because a marquee cannot be read back without it - the Select tool can be the first
       thing that measures the sheet. */
    function growSelection(anchorSlot, slot) {
      var perRow = viewportRowTiles(width, st.zoom);
      setGridCols(perRow);
      var aCol = anchorSlot % perRow, aRow = Math.floor(anchorSlot / perRow);
      var bCol = slot % perRow, bRow = Math.floor(slot / perRow);
      var col = Math.min(aCol, bCol), row = Math.min(aRow, bRow);
      var cols = Math.abs(aCol - bCol) + 1;
      var rows = Math.abs(aRow - bRow) + 1;
      /* The tile of the first cell of the block: a font view draws the sheet from another
         tile on, so the cell alone would name the wrong glyph. */
      var first = fontOrder ? fontOrder[row * perRow + col] : row * perRow + col;
      if (first === null || first === undefined) return;
      if (rows === 1) { setSelection({ tile: first, w: cols, h: 1 }); return; }
      setSelection({ col: col, row: row, cols: cols, rows: rows, tile: first });
    }

    function onDown(ev) {
      var canvas = ev.currentTarget;
      var p = pixelAt(ev, canvas);
      if (!p) return;
      /* A right click is button 2 and nothing else: the second half of the old test was
         and-ed with a literal false, so it could never change the result. */
      var right = ev.button === 2;
      selectTile(p.tile);
      if (right || tool === 'pick') { pickColour(p.tile, p.x, p.y); return; }
      if (tool === 'select') {
        setSel({ tile: p.tile, x: p.x, y: p.y });
        /* Down starts a new range at this tile: one tile until the pointer reaches another
           one, which is what onMove grows, and the anchor the marker and the copy read. */
        rangeRef.current = { slot: p.slot };
        setSelection({ tile: p.tile, w: 1, h: 1 });
        return;
      }
      if (tool === 'bucket') { bucket(p.tile, p.x, p.y, st.colour); return; }
      dragRef.current = { tile: p.tile, x0: p.x, y0: p.y };
      setSel({ tile: p.tile, x: p.x, y: p.y });
      if (tool === 'pencil') setPixel(p.tile, p.x, p.y, st.colour);
    }
    function onMove(ev) {
      var range = rangeRef.current;
      if (range) {
        var q = pixelAt(ev, ev.currentTarget);
        if (q) growSelection(range.slot, q.slot);
        return;
      }
      var d = dragRef.current;
      if (!d) return;
      var p = pixelAt(ev, ev.currentTarget);
      if (!p || p.tile !== d.tile) return;
      if (tool === 'pencil') { line(d.x0, d.y0, p.x, p.y, function (x, y) { setPixel(d.tile, x, y, st.colour); }); d.x0 = p.x; d.y0 = p.y; }
      else setSel({ tile: d.tile, x: p.x, y: p.y });
    }
    function onUp(ev) {
      rangeRef.current = null;
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

    /* The Copy and Paste buttons in the toolbar and the Ctrl+C/V branch of onKey call
       exactly these two functions. The tile selected on the canvas wins; with nothing
       selected the module falls back to the tile the Hex Editor cursor sits on - the one
       the canvas draws the cursor on - and then to the first tile of the window. */
    function copyTile() { return copyRegion(selected >= 0 ? selected : null); }
    function pasteTile() { return pasteRegion(selected >= 0 ? selected : null); }


    /* Typing in a box belongs to that box: every shortcut below is for the canvas, and
       without this the offset field would lose its A-F hex letters, its Backspace and
       its Ctrl+C/V to the tool keys. */
    function typingInField(target) {
      if (!target) return false;
      var tag = target.tagName ? String(target.tagName).toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      /* A rich text surface outside a form has no tag to name it, so the browser flag is
         asked instead: typing in one belongs to it just as much. */
      return target.isContentEditable === true;
    }

    /* The offset box: what was typed stays in the box (offsetText) and only text that
       parses is committed, clamped into the ROM. A detected region steps aside once a
       new sheet base is typed, otherwise the box would look dead. */
    function typeOffset(text) {
      var typed = String(text == null ? '' : text);
      var v = parseSheetOffset(typed);
      var patch = { offsetText: typed };
      if (v !== null) {
        var bytes = romBytes();
        var at = clampOffset(v, bytes ? bytes.length : 0);
        patch.offset = at;
        if (_state.region !== null && _state.region !== undefined && Number(_state.region) !== at) patch.region = null;
        /* A compressed copy holds the decompressed bytes, so it steps aside too, unless
           it has pixels waiting to be written back: those are never dropped. */
        var gs = _state.graphicSource;
        if (gs) {
          if (gs.dirty === true) patch.status = 'Offset 0x' + hex6(at) + ' noted; the open compressed copy still holds pixels waiting to be written back.';
          else patch.graphicSource = null;
        }
      }
      _set(patch);
    }

    function typeStride(text) {
      // an empty box is not an error: the depth decides the step again
      _set({ stride: clampStride(text) });
    }

    function pickDepth(depth) {
      var d = Number(depth);
      var step = tileBytesForDepth(d);
      _set({ depth: d, stride: step, status: 'Tile depth ' + d + 'bpp: the sheet steps ' + step + ' byte(s) a tile.' });
    }

    function onKey(ev) {
      if (typingInField(ev.target)) return;
      var k = ev.key;
      /* Copy and paste a region: Ctrl+C and Ctrl+V, or Cmd on a Mac. This root handler is
         the only one the activity has - no listener is added to the document or to the
         window - and the guard above keeps the keystroke inside a text field, where
         Ctrl+C/V belongs to the field. It runs before the plain tool keys, because Ctrl+V
         must paste and not pick the Select tool. */
      if (ev.ctrlKey || ev.metaKey) {
        var combo = String(k).toUpperCase();
        if (combo === 'C') { copyTile(); ev.preventDefault(); return; }
        if (combo === 'V') { pasteTile(); ev.preventDefault(); return; }
      }
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
      if (k === 'Escape') { setSel(null); clearSelection(); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'Z') { if (ev.shiftKey) K.hex.redo(); else K.hex.undo(); ev.preventDefault(); return; }
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
    /* One look for the three boxes, so the row reads as one set of controls. */
    var boxStyle = { fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };
    return e('div', {
      ref: wrapRef, tabIndex: 0, onKeyDown: onKey,
      style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, outline: 'none' }
    },
      /* Zoom, grid and the view label, the controls the canvas is read with. They are
         plain buttons and a checkbox, so nothing here takes a keystroke away from the
         offset and stride inputs. Copy and Paste sit in the tool row below for anyone who
         does not use Ctrl+C/V, and both call the same two functions the shortcut does. */
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
        /* The sheet base, the depth and the step. They are plain boxes: every keystroke
           reaches them, the half typed text is kept in the store, and only text that
           parses is committed to the state the canvas reads. */
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Byte offset in the ROM the sheet is read from. Hex: 0x and spaces are fine, and a value past the end of the ROM stops at its last byte.' },
          e('span', { style: { opacity: 0.7 } }, 'Offset'),
          e('input', {
            type: 'text', spellCheck: false, placeholder: 'hex',
            value: st.offsetText === null || st.offsetText === undefined ? hex6(st.offset) : st.offsetText,
            onFocus: function (ev) { ev.target.select(); },
            onChange: function (ev) { typeOffset(ev.target.value); },
            style: Object.assign({ width: 72 }, boxStyle)
          }),
          e('span', { style: { fontFamily: MONO, opacity: 0.85 }, title: 'The offset that is committed to the store' }, '0x' + hex6(st.offset))
        ),
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Bytes from one tile of the sheet to the next, 1..64. An empty box lets the depth decide.' },
          e('span', { style: { opacity: 0.7 } }, 'Stride'),
          e('input', {
            type: 'number', min: 1, max: 64, step: 1, spellCheck: false,
            value: st.stride === null || st.stride === undefined ? '' : st.stride,
            onChange: function (ev) { typeStride(ev.target.value); },
            style: Object.assign({ width: 54 }, boxStyle)
          })
        ),
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Bits a pixel takes on this sheet: it sets how many bytes one tile steps by (4bpp 32, 8bpp 64) and brings the stride to that number.' },
          e('span', { style: { opacity: 0.7 } }, 'Depth'),
          e('select', {
            className: 'kt-select', value: String(Number(st.depth) || 4),
            onChange: function (ev) { pickDepth(ev.target.value); },
            style: { fontSize: 11 }
          }, DEPTHS.map(function (d) { return e('option', { key: 'd' + d, value: String(d) }, d + 'bpp'); }))
        ),
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
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: !win,
          title: 'Copy the selected tile, or the whole range the Select tool dragged out, as one region (Ctrl+C while the canvas has the focus)',
          onClick: copyTile
        }, 'Copy'),
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: !win || !st.clipboard,
          title: 'Paste the copied region into the selected tile, tile by tile (Ctrl+V while the canvas has the focus)',
          onClick: pasteTile
        }, 'Paste'),
        /* The sheet as a file: out as a PNG (palette colours, no canvas) and back in from
           one. Both work on the region the editor has open, and the import writes every
           pixel through setPixel, so an imported tile is a hex patch like a painted one. */
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: !win,
          title: 'Write the tiles of the sheet to a PNG file: the palette colours, no canvas involved',
          onClick: function () { exportTilesPng({}); }
        }, 'Export PNG'),
        e('button', {
          type: 'button', className: TB + ' secondary', disabled: !win,
          title: 'Read a PNG file into the tiles at the sheet base. The zlib stream needs pako; every pixel lands as a hex patch',
          onClick: importTilesPngDialog
        }, 'Import PNG'),
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
        e('span', { style: { opacity: 0.6 } }, st.palette
          ? (st.paletteOffset === null || st.paletteOffset === undefined ? 'palette imported' : 'palette 0x' + hex6(st.paletteOffset))
          : 'no palette')
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
          format: st.format, zoom: st.zoom, tiles: st.tiles, pitch: tilePitch(),
          selected: selected, selPixel: sel, selection: st.selection, palette: st.palette,
          order: fontOrder, labels: fontLabels, orderKey: orderKey,
          cursorTile: cursorTile, cursorByte: cursorByte,
          width: Math.max(200, width - 16),
          onClick: onDown, onMove: onMove, onUp: onUp, onContext: onContext
        }) : e('div', { style: { opacity: 0.7 } }, 'No region selected. Detect tiles or type a region offset in the sidebar.')
      )
      /* The inspector is not drawn here: it is the right hand panel of this activity,
         registered at the end of the file and rendered by the workbench beside the work.
         Drawing it in the tab as well would show the palette and the paste box twice. */
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
        /* The one line summary of the window, the format and the step, the tiles, the
           patches inside it, the picked tile and pixel, the image length and the open
           graphic. It is the string K.tile.statusLine() hands out, not a second summary. */
        e('span', {
          style: { fontFamily: MONO, opacity: 0.85 },
          title: 'Window base, format, depth and stride, tiles, patches inside the window, picked tile, image length and graphic source'
        }, statusLine({ selected: selected, sel: sel })),
        e('span', { style: { opacity: 0.35 } }, '|'),
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
    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      e(Section, { title: 'Map' },
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
        )
      ),

      e(Section, { title: 'Screens' },
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
        ) : null
      ),

      e(Section, { title: 'Palettes for this screen' },
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
              className: 'kt-btn small' + (st.paletteOffset === p.offset ? '' : ' secondary'),
              style: { fontFamily: MONO, justifyContent: 'flex-start' },
              title: 'Load these 16 colours',
              onClick: function () { loadPalette(p.offset, ''); }
            }, '0x' + hex6(p.offset) + '  ' + p.score.toFixed(2) + '  ' + p.reason);
          })
        ) : null
      ),

      e(Section, { title: 'Write text on this screen' },
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
      var offset = target === 'palette-rom' ? paletteRomOffset() : windowStart();
      if (offset === null || !Number.isFinite(Number(offset))) { _set({ status: 'Set a palette offset first.' }); return; }
      var limit = target === 'tile' ? K.core.tileSize(st.format) : bytes.length;
      var wrote = 0, n = Math.min(bytes.length, limit);
      for (var i = 0; i < n; i++) if (K.hex.setByte(offset + i, bytes[i])) wrote++;
      _set({ status: 'Pasted ' + wrote + ' byte(s) at 0x' + hex6(offset) + (n < bytes.length ? ' (' + (bytes.length - n) + ' ignored, over one tile)' : '') + '.' });
    }

    function copyHexText() {
      /* Tile 0, always: st.region only says a region exists, so tileHexText(0) is the only
         tile this can copy - the removed `var selected = -1` never picked another one. */
      var tile = st.region === null ? '' : tileHexText(0);
      if (!tile) { _set({ status: 'Nothing to copy.' }); return; }
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(tile).then(function () { _set({ status: 'Tile 0 bytes copied as hex text.' }); }, function () { _set({ status: 'Tile 0 bytes: ' + tile }); });
      } else {
        _set({ status: 'Tile 0 bytes: ' + tile });
      }
    }

    var rowStyle = { display: 'flex', gap: 4, alignItems: 'center' };
    var inputStyle = { flex: '1 1 auto', fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)', color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)', borderRadius: 2, padding: '2px 4px' };
    return e('div', {
      /* The right panel host (.kt-right-panel-body) brings the column, its border and its
         background: the inspector fills it with one Section per group, and each section
         brings the padding and the scrolling a sidebar section has. */
      style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }
    },
      st.graphicSource ? e(Section, { title: 'Compressed graphic' },
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

      e(Section, { title: 'Palette' },
        e('div', { style: { opacity: 0.7, lineHeight: 1.4 } }, paletteModelText()),
        e('div', { style: rowStyle },
          e('input', {
            style: inputStyle, value: palSt[0], spellCheck: false, placeholder: 'palette offset',
            onChange: function (ev) { palSt[1](ev.target.value); },
            onKeyDown: function (ev) { if (ev.key === 'Enter') commitPalette(); }
          }),
          e('button', { type: 'button', className: 'kt-btn small', onClick: commitPalette, disabled: !hex || !hex.romBytes }, 'Load')
        ),
        e('div', { style: { display: 'flex', gap: 4 } },
          e('button', { type: 'button', className: 'kt-btn small secondary', style: { flex: '1 1 auto' }, onClick: findPalette, title: paletteFindTitle(), disabled: !hex || !hex.romBytes || !paletteModel().inRom }, 'Find'),
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
        ) : null
      ),

      e(Section, { title: 'Paste hex from an emulator' },
        e('textarea', {
          value: pasteSt[0],
          onChange: function (ev) { pasteSt[1](ev.target.value); },
          placeholder: '20 21 22 ... tile bytes, or 32 bytes of BGR555 for a palette (512 for 8bpp)',
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
        )
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
          onChange: function (ev) {
            /* A format carries its own tile size - a Game Boy 2bpp tile is 16 bytes, a
               GBA 8bpp tile 64 - so the depth and the stride follow the pick. */
            var format = ev.target.value;
            _set(Object.assign({ format: format, region: null, candidates: [], graphicSource: null }, formatPatch(format)));
          },
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
    var format = prof.defaultFormat || _state.format;
    _set(Object.assign({
      romIdentity: ident,
      graphicSource: null,
      candidates: [],
      region: null,
      format: format,
      // the sheet base has to land inside the ROM that just arrived
      offset: clampOffset(_state.offset, detail.data ? detail.data.length : 0)
    }, formatPatch(format)));
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
  /* The inspector is this activity's right hand panel. The workbench asks for a provider
     per activity and renders it in its own column beside the work (ketor-workbench.js,
     RightPanelWrapper: the panel is open by default, drags by its handle and collapses to
     a strip), so the tab does not draw the inspector inline any more - one component, one
     place, and the palette and paste box cannot show up twice. */
  K.ui.registerRightPanelProvider('tile', TileInspector, { title: 'Tile inspector' });
  K.tile = {
    getState: getState, subscribe: subscribe, useTile: useTile,
    detect: detect, setPixel: setPixel, setRegion: function (o) { _set({ region: Number(o) }); },
    setFormat: function (f) { var format = String(f); _set(Object.assign({ format: format }, formatPatch(format))); }, colourAt: colourCss,
    setColour: function (v) { _set({ colour: Number(v) }); }, readTile: readTile,
    copyRegion: copyRegion, pasteRegion: pasteRegion,
    setSelection: setSelection, clearSelection: clearSelection, setGridCols: setGridCols,
    regionWindow: regionWindow, tileAbsoluteOffset: tileAbsoluteOffset, statusLine: statusLine,
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
    exportTilesPng: exportTilesPng, importTilesPng: importTilesPng, importTilesPngDialog: importTilesPngDialog,
    openAt: function (offset, options) { return K.tileOpenAt(offset, options); },
    writeMapEntry: writeMapEntry, mapBucket: mapBucket, renderMap: renderMap, bankPalette: bankPalette,
    decodeMapTile: decodeMapTile, entryTile: entryTile, entryFlipH: entryFlipH, entryFlipV: entryFlipV,
    entryBank: entryBank, setView: function (v) { _set({ view: String(v) }); },
    setMap: function (o) { _set(o || {}); },
    /* The width of the palette the sheet on screen may hold, so a caller does not have to
       know that an 8bpp format carries 256 entries and a 4bpp one sixteen. */
    paletteColours: paletteColourCount,
    /* The per console model of the loaded ROM (gb-shades, gbc-bgr555, nes-2c02, md-9bit,
       ps1-555 or bgr555), so a caller can ask what the sheet's palette really is. */
    paletteModel: paletteModel,
    PALETTE_COLOURS: PALETTE_COLOURS,
    PALETTE_COLOURS_MAX: PALETTE_COLOURS_MAX
  };
})(window);
