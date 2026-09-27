/* ============================================================
   Ketor - ROM identifier (Batch 51)
   ------------------------------------------------------------
   A ROM is identified in stages, and the answer says which stage
   decided it, because a guess and a fact must not look the same in
   the interface:

     stage 1  a hash that is in the database: the entry names the
              console and the offsets somebody already verified
     stage 2  the header: NES\x1A, NINTENDO at 0x104 (GBA), ARM9 or
              ARM7 (NDS), SEGA (Mega Drive), the SNES checksum pair,
              the Game Boy logo, CD001 for a PlayStation disc
     stage 3  nothing matched: the console stays unknown and the
              editor opens in manual mode, where the user finds the
              data by eye

   The database is deliberately small and every entry says how it was
   verified. An invented offset in a database is worse than no entry,
   because it makes the editor look certain when it is not.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  /* ---------- SHA-1, so identification works the same in Node and the browser ---------- */

  function sha1(bytes) {
    var data = bytes;
    if (!(data instanceof Uint8Array)) data = new Uint8Array(bytes.buffer || bytes);
    var ml = data.length * 8;
    var withPadding = ((data.length + 8) >> 6) + 1;
    var words = new Int32Array(withPadding * 16);
    for (var i = 0; i < data.length; i++) words[i >> 2] |= (data[i] & 0xFF) << (24 - (i % 4) * 8);
    words[data.length >> 2] |= 0x80 << (24 - (data.length % 4) * 8);
    words[withPadding * 16 - 1] = ml;
    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var w = new Int32Array(80);
    for (var block = 0; block < withPadding; block++) {
      for (var t = 0; t < 16; t++) w[t] = words[block * 16 + t] | 0;
      for (var t2 = 16; t2 < 80; t2++) {
        var n = w[t2 - 3] ^ w[t2 - 8] ^ w[t2 - 14] ^ w[t2 - 16];
        w[t2] = (n << 1) | (n >>> 31);
      }
      var a = h0, b = h1, c = h2, d = h3, e2 = h4;
      for (var s = 0; s < 80; s++) {
        var f, k;
        if (s < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
        else if (s < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (s < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var temp = (((a << 5) | (a >>> 27)) + f + e2 + k + w[s]) | 0;
        e2 = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e2) | 0;
    }
    function word(v) { var out = (v >>> 0).toString(16); while (out.length < 8) out = '0' + out; return out; }
    return word(h0) + word(h1) + word(h2) + word(h3) + word(h4);
  }

  /* ---------- the database ---------- */

  var KNOWN_ROMS = {
    // Verified in this project: the graphics blocks below were decompressed and
    // looked at, and the tile format round trips over 400 offsets of this file.
    'abd71fe01ebb201bcc133074db1dd8c5253776c7': {
      title: 'Castlevania - Aria of Sorrow (USA)',
      system: 'gba',
      size: 8388608,
      md5: 'e7470df4d241f73060d14437011b90ce',
      notes: 'Graphics are LZ77 and RLE compressed. Palettes are compressed too, so the palette finder rarely lands on the right one; load a palette offset or paste 32 bytes from an emulator.',
      verified: {
        tileFormat: 'gba-4bpp',
        compression: ['bios-lz77', 'bios-rle'],
        graphics: [
          { offset: 0x632764, kind: 'lz77', bytes: 2052, dataOffset: 4, note: 'looked at: real art' },
          { offset: 0x1DD124, kind: 'rle', bytes: 12800, dataOffset: 0, note: 'looked at: real art' },
          { offset: 0x61EFD0, kind: 'lz77', bytes: 8196, dataOffset: 4, note: 'looked at: real art' },
          { offset: 0x200000, kind: 'raw', bytes: 0, note: 'looked at: tile set, decodes as gba-4bpp' },
          { offset: 0xE4000, kind: 'raw', bytes: 0, note: 'looked at: font-like 4bpp patterns' }
        ]
      }
    }
  };

  function registerRom(hash, entry) {
    var key = String(hash || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(key) || !entry) return false;
    KNOWN_ROMS[key] = entry;
    return true;
  }

  /* ---------- stage 2 ---------- */

  function bytesToString(bytes, offset, length) {
    var out = '';
    for (var i = 0; i < length; i++) {
      var c = bytes[offset + i] & 0xFF;
      out += String.fromCharCode(c);
    }
    return out;
  }

  function hasAt(bytes, offset, text) {
    if (offset + text.length > bytes.length) return false;
    return bytesToString(bytes, offset, text.length) === text;
  }

  /* Byte patterns are compared as numbers: the Game Boy logo starts with
     CE ED 66 66, and writing that as a string invites an escape mistake. */
  function hasBytes(bytes, offset, pattern) {
    if (offset + pattern.length > bytes.length) return false;
    for (var i = 0; i < pattern.length; i++) {
      if ((bytes[offset + i] & 0xFF) !== pattern[i]) return false;
    }
    return true;
  }

  /* The Game Boy and GBC put the Nintendo logo at 0x104, the GBA puts the word
     NINTENDO there, the NDS has ARM9/ARM7 and so on. */
  function headerSystem(bytes) {
    if (!bytes || bytes.length < 0x150) return null;
    if (hasAt(bytes, 0, 'NES\u001a')) {
      var flags6 = bytes[6] & 0xFF;
      return { system: 'nes', detail: 'iNES header, mapper ' + ((flags6 >> 4) | (bytes[7] & 0xF0)), confidence: 1 };
    }
    if (hasAt(bytes, 0x104, 'NINTENDO')) {
      var gbaTitle = bytesToString(bytes, 0xA0, 12).replace(/\0+$/, '').replace(/\s+$/, '');
      return { system: 'gba', detail: 'Nintendo logo at 0x104, title "' + gbaTitle + '"', confidence: 1 };
    }
    if (hasAt(bytes, 0xC0, 'ARM9') || hasAt(bytes, 0xC0, 'ARM7') || hasAt(bytes, 0x0, 'ARM9')) {
      return { system: 'nds', detail: 'ARM9/ARM7 header', confidence: 1 };
    }
    if (hasAt(bytes, 0x100, 'SEGA')) {
      return { system: 'genesis', detail: 'SEGA at 0x100', confidence: 1 };
    }
    if (hasBytes(bytes, 0x104, [0xCE, 0xED, 0x66, 0x66])) {
      var gbTitle = bytesToString(bytes, 0x134, 15).replace(/\0+$/, '');
      var cgbFlag = bytes[0x143] & 0xFF;
      return {
        system: (cgbFlag === 0x80 || cgbFlag === 0xC0) ? 'gbc' : 'gb',
        detail: 'Nintendo logo at 0x104, title "' + gbTitle.replace(/\s+$/, '') + '"'
          + (cgbFlag === 0x80 || cgbFlag === 0xC0 ? ', colour flag set' : ''),
        confidence: 0.95
      };
    }
    if (hasAt(bytes, 0x8001, 'CD001') || hasAt(bytes, 0x1, 'CD001')) {
      return { system: 'ps1', detail: 'ISO9660 volume descriptor', confidence: 0.7 };
    }
    if (K.core.snesHeader) {
      var snes = K.core.snesHeader(bytes);
      if (snes && snes.mapping) {
        return {
          system: 'snes',
          detail: 'SNES header with a matching checksum pair, ' + snes.mapping.toUpperCase()
            + (snes.title ? ', title "' + snes.title + '"' : ''),
          confidence: 0.9
        };
      }
    }
    return null;
  }

  function extensionSystem(fileName) {
    var ext = String(fileName || '').split('.').pop().toLowerCase();
    var map = {
      nes: 'nes', sfc: 'snes', smc: 'snes', fig: 'snes', snes: 'snes',
      gb: 'gb', gbc: 'gbc', gba: 'gba', nds: 'nds', srl: 'nds',
      gen: 'genesis', md: 'genesis', smd: 'genesis',
      bin: 'ps1', iso: 'ps1', img: 'ps1', cue: 'ps1'
    };
    return map[ext] || null;
  }

  var HEADER_BYTES = 0x200;   // a copier header, common on SNES dumps

  function identify(bytes, fileName) {
    if (!bytes || !bytes.length) return { stage: 'none', system: 'unknown', confidence: 0, reason: 'no data' };
    var hash = sha1(bytes);
    var known = KNOWN_ROMS[hash] || null;
    if (known) {
      return {
        stage: 'database',
        sha1: hash,
        system: known.system,
        title: known.title,
        confidence: 1,
        known: known,
        reason: 'hash ' + hash.slice(0, 12) + ' is in the database: ' + known.title
      };
    }
    var head = headerSystem(bytes);
    if (head) {
      return {
        stage: 'header',
        sha1: hash,
        system: head.system,
        title: '',
        confidence: head.confidence,
        known: null,
        reason: 'header: ' + head.detail
      };
    }
    var byExt = extensionSystem(fileName);
    if (byExt) {
      return {
        stage: 'extension',
        sha1: hash,
        system: byExt,
        title: '',
        confidence: 0.4,
        known: null,
        reason: 'only the file extension says ' + byExt + ', so the editor opens in manual mode'
      };
    }
    return {
      stage: 'manual',
      sha1: hash,
      system: 'unknown',
      title: '',
      confidence: 0,
      known: null,
      reason: 'nothing matched: use the console list and the region offset to find the graphics by eye'
    };
  }

  K.core.identifyRom = identify;
})(window);
