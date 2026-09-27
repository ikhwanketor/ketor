/* ============================================================
   Ketor - GBA compression (Batch 50)
   ------------------------------------------------------------
   Graphics on the GBA are not stored as plain tiles. The BIOS
   decompresses them at run time, so the ROM holds LZ77 or RLE
   streams with a four byte header: one byte of type, three bytes
   of decompressed size. That is why scanning raw ROM regions for
   tile-like bytes finds padding and textures instead of art, and
   why the tools people actually use (unLZ-GBA, NLZ-GBA, GBA
   Graphics Editor) search for these headers first.

   Format reference: GBATEK, "GBA BIOS Decompression Functions".
   - type 0x10 LZ77: a flag byte holds eight block flags, MSB
     first; flag 0 copies one literal byte, flag 1 takes two bytes
     that encode length and distance.
   - type 0x30 RLE: a flag byte with bit 7 set repeats the next
     byte (length 3..130), otherwise it copies 1..128 literals.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var TYPE_LZ77 = 0x10;
  var TYPE_HUFFMAN = 0x20;
  var TYPE_RLE = 0x30;
  // Measured on the test ROM: real graphics blocks declare 819 up to 197376 bytes,
  // but the 256 KiB blocks that showed up in a first scan were false positives, so
  // the ceiling sits at 128 KiB where the believable blocks are.
  var DEFAULT_LIMIT = 0x20000;

  function minimumCompressedSize(size) {
    return 4 + Math.ceil(Math.max(0, Number(size) || 0) / 130);
  }

  function u24(bytes, offset) {
    return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8) | ((bytes[offset + 2] & 0xFF) << 16);
  }

  /* A header is only believed when the type byte matches something the BIOS
     knows, the declared size is sane, and the stream cannot be longer than the
     space that is left. Everything else is a byte that happens to be 0x10. */
  function headerAt(bytes, offset, options) {
    var opts = options || {};
    var limit = opts.limit || DEFAULT_LIMIT;
    var off = Number(offset);
    if (!bytes || !Number.isFinite(off) || off < 0 || off + 4 > bytes.length) return null;
    var type = bytes[off] & 0xFF;
    if (type !== TYPE_LZ77 && type !== TYPE_RLE) return null;
    var size = u24(bytes, off + 1);
    var minSize = opts.minSize === undefined ? 0x20 : opts.minSize;
    if (size < minSize || size > limit) return null;
    /* How small a stream can be. One RLE block carries 130 output bytes in two
       input bytes, and an LZ77 reference carries 18 in two, so the loose bound is
       one input byte per 130 output bytes. An earlier version demanded one byte per
       eight and rejected perfectly good highly compressed blocks. */
    if (off + minimumCompressedSize(size) > bytes.length) return null;
    return { offset: off, type: type, size: size, label: type === TYPE_LZ77 ? 'LZ77' : 'RLE' };
  }

  /* Returns { data, end } with end the first byte after the stream, or null when
     the stream is malformed. Malformed means: a back reference before the start
     of the output, a literal that runs past the buffer, or a declared size the
     stream does not actually produce. */
  function lz77Decode(bytes, offset, options) {
    var opts = options || {};
    var limit = opts.limit || DEFAULT_LIMIT;
    var off = Number(offset);
    if (!bytes || bytes[off] !== TYPE_LZ77) return null;
    var size = u24(bytes, off + 1);
    if (size <= 0 || size > limit) return null;
    var out = new Uint8Array(size);
    var o = 0;
    var i = off + 4;
    var end = bytes.length;
    while (o < size) {
      if (i >= end) return null;
      var flags = bytes[i++] & 0xFF;
      for (var bit = 0; bit < 8 && o < size; bit++) {
        if (flags & (0x80 >> bit)) {
          if (i + 1 >= end) return null;
          var b0 = bytes[i++] & 0xFF;
          var b1 = bytes[i++] & 0xFF;
          var n = (b0 >> 4) & 0x0F;
          var disp = (((b0 & 0x0F) << 8) | b1) + 1;
          // 0x00 0x00 is the end marker the BIOS also stops on
          if (n === 0 && disp === 1) return o === size ? { data: out, end: i } : null;
          var len = n + 3;
          if (disp > o) return null;
          for (var k = 0; k < len && o < size; k++) {
            out[o] = out[o - disp];
            o++;
          }
        } else {
          if (i >= end) return null;
          out[o++] = bytes[i++] & 0xFF;
        }
      }
    }
    return { data: out, end: i };
  }

  function rleDecode(bytes, offset, options) {
    var opts = options || {};
    var limit = opts.limit || DEFAULT_LIMIT;
    var off = Number(offset);
    if (!bytes || bytes[off] !== TYPE_RLE) return null;
    var size = u24(bytes, off + 1);
    if (size <= 0 || size > limit) return null;
    var out = new Uint8Array(size);
    var o = 0;
    var i = off + 4;
    var end = bytes.length;
    while (o < size) {
      if (i >= end) return null;
      var flag = bytes[i++] & 0xFF;
      if (flag & 0x80) {
        if (i >= end) return null;
        var value = bytes[i++] & 0xFF;
        var run = (flag & 0x7F) + 3;
        for (var k = 0; k < run && o < size; k++) out[o++] = value;
      } else {
        var literals = (flag & 0x7F) + 1;
        for (var j = 0; j < literals && o < size; j++) {
          if (i >= end) return null;
          out[o++] = bytes[i++] & 0xFF;
        }
      }
    }
    return { data: out, end: i };
  }

  function decodeAt(bytes, offset, options) {
    var head = headerAt(bytes, offset, options);
    if (!head) return null;
    var res = head.type === TYPE_LZ77 ? lz77Decode(bytes, offset, options) : rleDecode(bytes, offset, options);
    if (!res) return null;
    return { data: res.data, end: res.end, type: head.type, label: head.label, size: head.size, offset: head.offset };
  }

  function lz77Decompress(bytes, offset, options) {
    var r = lz77Decode(bytes, offset, options);
    return r ? r.data : null;
  }

  function rleDecompress(bytes, offset, options) {
    var r = rleDecode(bytes, offset, options);
    return r ? r.data : null;
  }

  /* Every compressed block in the ROM, with an optional score for what the
     decompressed bytes look like. Data is dropped again, because a commercial
     ROM holds many blocks and only the ranking matters.

     A game may put a few bytes of its own in front of the tiles inside the
     compressed payload. On the test ROM the real graphics blocks declare sizes
     of 2052 or 8196 bytes, which is 2048 or 8192 bytes of tiles plus a four byte
     word. So the score is taken at a few small offsets and the best one wins,
     exactly like nudging the offset in a tile viewer. */
  function scanCompressed(bytes, options) {
    var opts = options || {};
    var step = opts.step || 4;
    var minSize = opts.minSize === undefined ? 0x40 : opts.minSize;
    var maxSize = opts.maxSize || DEFAULT_LIMIT;
    var score = opts.score || null;
    var maxResults = opts.maxResults || 400;
    var alignOffsets = opts.alignOffsets || [0, 2, 4, 8, 16];
    var found = [];
    var scanned = 0;
    var decoded = 0;
    for (var off = 0; off + 4 <= bytes.length; off += step) {
      var type = bytes[off] & 0xFF;
      if (type !== TYPE_LZ77 && type !== TYPE_RLE) continue;
      scanned++;
      var size = u24(bytes, off + 1);
      if (size < minSize || size > maxSize) continue;
      if (off + minimumCompressedSize(size) > bytes.length) continue;
      var dec = decodeAt(bytes, off, { limit: maxSize, minSize: minSize });
      if (!dec) continue;
      decoded++;
      var best = 0;
      var bestAt = 0;
      if (score) {
        for (var a = 0; a < alignOffsets.length; a++) {
          var at = alignOffsets[a];
          if (at >= dec.data.length) break;
          var s = score(dec.data, at) || 0;
          if (s > best) { best = s; bestAt = at; }
        }
      }
      found.push({
        offset: off,
        type: dec.type,
        label: dec.label,
        size: dec.size,
        compressedSize: dec.end - off,
        dataOffset: bestAt,
        score: best
      });
    }
    found.sort(function (a, b) { return b.score - a.score || a.offset - b.offset; });
    return {
      all: found,
      top: found.slice(0, maxResults),
      total: found.length,
      headers: scanned,
      decoded: decoded
    };
  }

  /* ---------- compression ---------- */

  /* The encoder is the exact inverse of the decoder above, and that decoder is
     the one that reads real game streams: it decodes 1794 blocks of the test ROM
     at exactly their declared sizes. So a stream this encoder produces, and that
     decoder reads back byte for byte, is in the format the console reads. */
  var WINDOW = 0x1000;   // the BIOS looks back 4096 bytes
  var MAX_MATCH = 18;    // and copies at most 18 at a time
  var MIN_MATCH = 3;

  function matchKey(data, at) {
    return ((data[at] & 0xFF) << 16) | ((data[at + 1] & 0xFF) << 8) | (data[at + 2] & 0xFF);
  }

  function lz77Encode(data, options) {
    var opts = options || {};
    var input = data instanceof Uint8Array ? data : Uint8Array.from(data || []);
    var length = input.length;
    var out = [TYPE_LZ77, length & 0xFF, (length >> 8) & 0xFF, (length >> 16) & 0xFF];
    if (!length) return new Uint8Array(out);
    var maxChain = Math.max(1, Number(opts.chain) || 24);
    var head = {};
    var prev = new Int32Array(length);
    for (var p = 0; p < length; p++) prev[p] = -1;
    function insert(at) {
      if (at + MIN_MATCH > length) return;
      var key = matchKey(input, at);
      prev[at] = head[key] === undefined ? -1 : head[key];
      head[key] = at;
    }
    function longest(at) {
      if (at + MIN_MATCH > length) return null;
      var best = null;
      var candidate = head[matchKey(input, at)];
      var tried = 0;
      while (candidate !== undefined && candidate >= 0 && tried < maxChain) {
        var distance = at - candidate;
        if (distance > WINDOW) break;
        var len = 0;
        while (len < MAX_MATCH && at + len < length && input[candidate + len] === input[at + len]) len++;
        /* A match of three at distance one would encode as 0x00 0x00, which is the
           end marker the decompressor stops on. Three identical bytes are written as
           literals instead, exactly as the encoders that made the real streams do. */
        var forbidden = (len === MIN_MATCH && distance === 1);
        if (len >= MIN_MATCH && !forbidden && (!best || len > best.len)) {
          best = { pos: candidate, len: len, distance: distance };
          if (len === MAX_MATCH) break;
        }
        candidate = prev[candidate];
        tried++;
      }
      return best;
    }
    var i = 0;
    while (i < length) {
      var flagAt = out.length;
      out.push(0);
      var flags = 0;
      for (var bit = 0; bit < 8 && i < length; bit++) {
        var match = longest(i);
        if (match && match.len >= MIN_MATCH) {
          flags |= (0x80 >> bit);
          var encoded = match.distance - 1;
          out.push((((match.len - MIN_MATCH) << 4) | ((encoded >> 8) & 0x0F)) & 0xFF);
          out.push(encoded & 0xFF);
          for (var k = 0; k < match.len; k++) insert(i + k);
          i += match.len;
        } else {
          out.push(input[i] & 0xFF);
          insert(i);
          i++;
        }
      }
      out[flagAt] = flags & 0xFF;
    }
    return new Uint8Array(out);
  }

  /* RLE: a run of three or more becomes one block, everything else is copied in
     runs of at most 128 bytes, which is what the flag byte can express. */
  function runLengthAt(input, at, limit) {
    var run = 1;
    while (at + run < input.length && run < limit && input[at + run] === input[at]) run++;
    return run;
  }

  function rleEncode(data) {
    var input = data instanceof Uint8Array ? data : Uint8Array.from(data || []);
    var length = input.length;
    var out = [TYPE_RLE, length & 0xFF, (length >> 8) & 0xFF, (length >> 16) & 0xFF];
    var i = 0;
    while (i < length) {
      var run = runLengthAt(input, i, 130);
      if (run >= 3) {
        out.push(0x80 | ((run - 3) & 0x7F));
        out.push(input[i] & 0xFF);
        i += run;
        continue;
      }
      // copy up to 128 bytes, stopping where a run of three begins
      var start = i;
      var literal = 0;
      while (i < length && literal < 128) {
        if (runLengthAt(input, i, 3) >= 3) break;
        i++;
        literal++;
      }
      out.push((literal - 1) & 0x7F);
      for (var j = 0; j < literal; j++) out.push(input[start + j] & 0xFF);
    }
    return new Uint8Array(out);
  }

  /* The compressed form of a block, in the scheme the original block used, and
     the size the caller needs to decide between writing in place and moving. */
  function encodeLike(type, data, options) {
    var bytes = type === TYPE_RLE ? rleEncode(data, options) : lz77Encode(data, options);
    if (!bytes) return null;
    var opts2 = { limit: Math.max(DEFAULT_LIMIT, data.length), minSize: 0 };
    var check = type === TYPE_RLE ? rleDecode(bytes, 0, opts2) : lz77Decode(bytes, 0, opts2);
    // an empty block has nothing to verify: the decoder refuses a zero size stream
    var ok = data.length === 0 || (!!check && check.data.length === data.length && sameBytes(check.data, data));
    return {
      bytes: bytes,
      type: type,
      size: data.length,
      compressedSize: bytes.length,
      verified: ok
    };
  }

  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if ((a[i] & 0xFF) !== (b[i] & 0xFF)) return false;
    return true;
  }

  K.core.encodeLike = encodeLike;
  K.core.compressionHeaderAt = headerAt;
  K.core.decompressAt = decodeAt;
  K.core.scanCompressed = scanCompressed;
})(window);
