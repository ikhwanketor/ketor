/* ============================================================
   Ketor - Console profiles (Batch 51)
   ------------------------------------------------------------
   The tile editor and every detector have to know which console
   they are looking at: a Game Boy ROM has no LZ77 in it, an NES
   nametable has one byte per cell, a SNES tilemap has two and its
   tile format is planar. Those facts live here once, instead of
   being guessed again in each tool.

   Addresses are the ones the hardware uses; a profile never claims
   a ROM offset, only how to read what is there.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var PROFILES = {
    gba: {
      id: 'gba', label: 'Game Boy Advance',
      tileFormats: ['gba-4bpp', 'gba-8bpp'], defaultFormat: 'gba-4bpp',
      mapLayout: 'gba-text',
      palette: { format: 'bgr555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: ['bios-lz77', 'bios-rle'],
      charBlock: 0x4000, screenBlock: 0x800, tilesPerCharBlock: 512,
      pointerSize: 4, pointerBase: 0x08000000
    },
    nds: {
      id: 'nds', label: 'Nintendo DS',
      tileFormats: ['gba-4bpp', 'gba-8bpp'], defaultFormat: 'gba-4bpp',
      mapLayout: 'gba-text',
      palette: { format: 'bgr555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: ['bios-lz77', 'bios-rle', 'bios-huffman', 'lzss'],
      charBlock: 0x4000, screenBlock: 0x800, tilesPerCharBlock: 512,
      pointerSize: 4, pointerBase: 0x02000000
    },
    gb: {
      id: 'gb', label: 'Game Boy',
      tileFormats: ['gb-2bpp', 'gb-1bpp'], defaultFormat: 'gb-2bpp',
      mapLayout: 'gb-map',
      palette: { format: 'gb-shades', bytesPerColour: 0, coloursPerBank: 4, bankBytes: 0 },
      compression: [],
      bankSize: 0x4000, screenBlock: 0x400, tilesPerScreenBlock: 256,
      pointerSize: 2, pointerBase: 0x4000
    },
    gbc: {
      id: 'gbc', label: 'Game Boy Color',
      tileFormats: ['gb-2bpp', 'gb-1bpp'], defaultFormat: 'gb-2bpp',
      mapLayout: 'gb-map',
      palette: { format: 'gbc-bgr555', bytesPerColour: 2, coloursPerBank: 4, bankBytes: 8 },
      compression: [],
      bankSize: 0x4000, screenBlock: 0x400, tilesPerScreenBlock: 256,
      pointerSize: 2, pointerBase: 0x4000
    },
    nes: {
      id: 'nes', label: 'NES',
      tileFormats: ['nes-2bpp', 'gb-2bpp', 'gb-1bpp'], defaultFormat: 'nes-2bpp',
      mapLayout: 'nes-nametable',
      palette: { format: 'nes-2c02', bytesPerColour: 0, coloursPerBank: 4, bankBytes: 0 },
      compression: [],
      chrBank: 0x2000, tilesPerChrBank: 512, headerSize: 16,
      pointerSize: 2, pointerBase: 0x8000
    },
    snes: {
      id: 'snes', label: 'SNES',
      tileFormats: ['snes-4bpp', 'snes-2bpp', 'snes-8bpp'], defaultFormat: 'snes-4bpp',
      mapLayout: 'snes-text',
      palette: { format: 'bgr555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: [],
      charBlock: 0x2000, screenBlock: 0x800, tilesPerCharBlock: 256,
      headerSize: 0, possibleHeaderSize: 512,
      pointerSize: 2, pointerBase: 0x8000
    },
    genesis: {
      id: 'genesis', label: 'Sega Genesis / Mega Drive',
      tileFormats: ['genesis-4bpp', 'gb-1bpp'], defaultFormat: 'genesis-4bpp',
      mapLayout: 'genesis-plane',
      palette: { format: 'md-9bit', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: [],
      pointerSize: 4, pointerBase: 0x000000
    },
    pce: {
      id: 'pce', label: 'PC Engine / TurboGrafx-16',
      tileFormats: ['snes-4bpp', 'snes-2bpp'], defaultFormat: 'snes-4bpp',
      mapLayout: 'snes-text',
      palette: { format: 'bgr555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: [],
      pointerSize: 2, pointerBase: 0x2000
    },
    ps1: {
      id: 'ps1', label: 'PlayStation 1',
      tileFormats: [], defaultFormat: null,
      mapLayout: null,
      palette: { format: 'ps1-555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
      compression: [],
      textureBased: true,
      note: 'PlayStation graphics are textures (TIM files or VRAM uploads), not 8x8 tile sheets, so the tile editor has nothing to decode here.',
      pointerSize: 4, pointerBase: 0x80010000
    }
  };

  PROFILES.unknown = {
    id: 'unknown', label: 'Unknown',
    tileFormats: ['gba-4bpp', 'gb-2bpp', 'snes-4bpp', 'genesis-4bpp', 'gba-8bpp', 'snes-2bpp', 'gb-1bpp'],
    defaultFormat: 'gba-4bpp',
    mapLayout: 'gba-text',
    palette: { format: 'bgr555', bytesPerColour: 2, coloursPerBank: 16, bankBytes: 32 },
    compression: ['bios-lz77', 'bios-rle'],
    pointerSize: 2, pointerBase: 0
  };

  /* System names arrive as display strings ("Game Boy", "Sega Genesis/MD"), so
     they are folded back to an id here. */
  function normalizeSystem(name) {
    var raw = String(name == null ? '' : name).trim().toLowerCase();
    if (!raw) return 'unknown';
    if (PROFILES[raw]) return raw;
    if (raw.indexOf('gba') !== -1 || raw.indexOf('game boy advance') !== -1 || raw.indexOf('advance') !== -1) return 'gba';
    if (raw.indexOf('gbc') !== -1 || raw.indexOf('color') !== -1 || raw.indexOf('colour') !== -1) return 'gbc';
    if (raw.indexOf('game boy') !== -1 || raw === 'gb') return 'gb';
    // "genesis" and "snes" both contain the letters n-e-s, so the plain NES
    // test has to come last and has to be strict.
    if (raw.indexOf('genesis') !== -1 || raw.indexOf('mega drive') !== -1 || raw.indexOf('megadrive') !== -1) return 'genesis';
    if (raw.indexOf('snes') !== -1 || raw.indexOf('super nintendo') !== -1 || raw.indexOf('super famicom') !== -1) return 'snes';
    if (raw === 'nes' || raw.indexOf('nintendo entertainment') !== -1 || raw.indexOf('famicom') !== -1) return 'nes';
    if (raw.indexOf('nds') !== -1 || raw === 'ds' || raw.indexOf('nintendo ds') !== -1) return 'nds';
    if (raw.indexOf('pc engine') !== -1 || raw.indexOf('turbografx') !== -1 || raw.indexOf('pce') !== -1) return 'pce';
    if (raw.indexOf('playstation') !== -1 || raw.indexOf('ps1') !== -1 || raw.indexOf('psx') !== -1) return 'ps1';
    return 'unknown';
  }

  function profileFor(nameOrId) {
    var id = normalizeSystem(nameOrId);
    return PROFILES[id] || PROFILES.unknown;
  }

  function formatsFor(nameOrId) {
    return profileFor(nameOrId).tileFormats.slice();
  }

  function supportsCompression(nameOrId, scheme) {
    var p = profileFor(nameOrId);
    if (!scheme) return p.compression.length > 0;
    return p.compression.indexOf(scheme) !== -1;
  }

  K.core.CONSOLE_PROFILES = PROFILES;
  K.core.normalizeSystem = normalizeSystem;
  K.core.consoleProfile = profileFor;
  K.core.consoleFormats = formatsFor;
  K.core.consoleSupports = supportsCompression;
})(window);
