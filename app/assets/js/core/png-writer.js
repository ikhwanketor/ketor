/* ============================================================
   Ketor - PNG writer (Batch 160 / D2)
   ------------------------------------------------------------
   core/save-state.js reads the screenshots an emulator writes;
   this is the writer, so the project can hand an image back. It has
   no canvas: pixels come in, chunks go out, and Node can read the
   result with zlib and with pngChunks/decodeScreenshot.

   The image is always colour type 6 (RGBA), eight bits per channel,
   no interlace and no filter: every scanline is a zero byte and then
   width * 4 bytes of colour. The IDAT payload is a zlib stream built
   from stored deflate blocks - an uncompressed deflate stream is
   legal, needs no compressor, and every decoder inflates it - closed
   by the Adler-32 of the raw bytes. The CRC-32 table is the same
   polynomial the project already uses in ui/ketor-project.js; it is
   copied here so that a core file never reaches up into the ui layer
   to write a checksum.

   The function is total: a zero sized image gives a structurally
   complete PNG (the PNG spec asks for positive sizes, so 0x0 is a
   degenerate case, but its chunks and CRCs are real and this
   project's own reader takes it apart like any other), and pixels
   missing from a short buffer are read as 0 rather than throwing
   half way through a file.
   ============================================================ */

(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

  var SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  var MAX_STORED = 0xFFFF;

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* zlib's own checksum, mod 65521. */
  function adler32(bytes) {
    var a = 1, b = 0;
    for (var i = 0; i < bytes.length; i++) {
      a = (a + (bytes[i] & 0xFF)) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function u32be(out, at, value) {
    out[at] = (value >>> 24) & 0xFF;
    out[at + 1] = (value >>> 16) & 0xFF;
    out[at + 2] = (value >>> 8) & 0xFF;
    out[at + 3] = value & 0xFF;
  }

  function ascii(type) {
    var out = new Uint8Array(4);
    for (var i = 0; i < 4; i++) out[i] = type.charCodeAt(i) & 0xFF;
    return out;
  }

  /* length, type, data, CRC over type and data. */
  function chunk(type, data) {
    var head = ascii(type);
    var out = new Uint8Array(12 + data.length);
    u32be(out, 0, data.length);
    out.set(head, 4);
    out.set(data, 8);
    var body = new Uint8Array(4 + data.length);
    body.set(head, 0);
    body.set(data, 4);
    u32be(out, 8 + data.length, crc32(body));
    return out;
  }

  /* The zlib wrapper: 0x78 0x01 is a 32 KiB window with the check bits that
     make the two header bytes a multiple of 31, which is what the format
     demands. Then stored blocks - BFINAL on the last one, LEN, one's
     complement of LEN, the bytes - and the Adler-32 of everything. An empty
     input still gets one final empty block, so the stream is complete. */
  function zlibStored(raw) {
    var blocks = Math.max(1, Math.ceil(raw.length / MAX_STORED));
    var out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
    out[0] = 0x78;
    out[1] = 0x01;
    var at = 2;
    for (var i = 0; i < blocks; i++) {
      var start = i * MAX_STORED;
      var len = Math.min(MAX_STORED, raw.length - start);
      if (len < 0) len = 0;
      out[at++] = (i === blocks - 1) ? 1 : 0;
      out[at++] = len & 0xFF;
      out[at++] = (len >>> 8) & 0xFF;
      out[at++] = (~len) & 0xFF;
      out[at++] = ((~len) >>> 8) & 0xFF;
      out.set(raw.subarray(start, start + len), at);
      at += len;
    }
    var adler = adler32(raw);
    u32be(out, at, adler);
    at += 4;
    return out;
  }

  function join(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var at = 0;
    for (var k = 0; k < parts.length; k++) { out.set(parts[k], at); at += parts[k].length; }
    return out;
  }

  function encodePng(rgba, width, height) {
    var w = Math.floor(Number(width));
    var h = Math.floor(Number(height));
    if (!isFinite(w) || w < 0) w = 0;
    if (!isFinite(h) || h < 0) h = 0;

    var stride = w * 4;
    var raw = new Uint8Array(h * (stride + 1));
    var pixels = rgba || [];
    var at = 0;
    for (var y = 0; y < h; y++) {
      raw[at++] = 0;
      for (var x = 0; x < stride; x++) {
        var index = y * stride + x;
        raw[at++] = index < pixels.length ? (pixels[index] & 0xFF) : 0;
      }
    }

    var ihdr = new Uint8Array(13);
    u32be(ihdr, 0, w);
    u32be(ihdr, 4, h);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return join([
      new Uint8Array(SIGNATURE),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlibStored(raw)),
      chunk('IEND', new Uint8Array(0))
    ]);
  }

  core.encodePng = encodePng;
})(window);
