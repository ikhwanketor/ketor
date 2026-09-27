/* The text extraction worker, moved out of the legacy core.js. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

    const createTextExtractorWorker = () => {
      const workerCode = `
          self.onmessage = async (e) => {
            try {
              const { romBuffer, tableData, options } = e.data;
              const romData = new Uint8Array(romBuffer);
              const {
                minLength,
                maxLength,
                asciiFallback,
                system,
                usePaddingByte,
                systemPipeline,
                strictExtractorMode,
                enableTextDecompression,
                decompressionMode,
                includeCompressedReadOnly,
                strictSceneProfile
              } = options;
              const PADDING_BYTE = 0x00;
              /* A table can say that one character is two bytes (4100=A). A single byte the
                 table does not name is then not a character, and a run of them is not a text:
                 in the Kingdom Hearts rom a 446 byte run of 0x22 filler sits in front of the
                 next record, and the extractor glued it to that record's text as 446 quote
                 marks. The text it built was not a record - it began in filler, and the build
                 refused to move it ("Relocation skipped (no safe pointers found)"). A loose
                 byte may still continue a text the table itself started, because mixed
                 encodings exist; it may not start one. */
              /* Which one it is has to be read the same way rebuildRom reads it: only a
                 multi-byte entry whose value is a real character counts. Castlevania's table
                 carries nineteen multi-byte entries and every one of them is a bracket token
                 ([YOKO], [JULIUS]), so that table is a one byte table and its loose bytes must
                 keep opening texts; the Kingdom Hearts table is eighty four letters in two
                 bytes each and has no single byte entries at all. */
              const tableCharBytes = (() => {
                const multi = (tableData && tableData.multiByte) || {};
                let printable = 0;
                for (const key of Object.keys(multi)) {
                  const ch = String(multi[key] === undefined || multi[key] === null ? '' : multi[key]);
                  if (!ch || ch === '\\n' || ch === '\\r' || ch === '/') continue;
                  if (ch.length >= 2 && ch.startsWith('[') && ch.endsWith(']')) continue;
                  printable++;
                  if (printable >= 12) return 2;
                }
                return 1;
              })();
              const looseByteMayStartText = tableCharBytes === 1;
              const useAsciiFallback = !!asciiFallback;
              const isRetroPipeline = systemPipeline === 'pipeline_nes' || systemPipeline === 'pipeline_snes' || systemPipeline === 'pipeline_gb' || systemPipeline === 'pipeline_gbc' || systemPipeline === 'pipeline_pce';
              const effectiveMinLength = isRetroPipeline ? Math.max(3, minLength || 0) : minLength;
              const strictMode = !!strictExtractorMode;
              const strictSceneProfileMode = String(strictSceneProfile || 'default').toLowerCase();
              const strictSceneBoundsMode = strictSceneProfileMode === 'khcom_castlevania';
              const strictAsciiRegex = /^[A-Za-z0-9\\s.,!?\"':;()\\-\\/]+$/;
              const strictDialogCueRegex = /(\\[[A-Z0-9 _\\-]+\\])|([a-z]{2,}.*[.!?])|\\b(hey|looks|coming|name|is|the|you|your|i|we|he|she|they|who|what|where|when|why|how|yes|no)\\b/i;
              const strictTitleNoiseRegex = /\\b(press\\s+start|new\\s+game|continue|option|konami|nintendo|square\\s+enix|disney|copyright|all\\s+rights\\s+reserved|licensed\\s+by|game\\s+boy|advance|chapter\\s+of\\s+memories|chain\\s+of\\s+memories|title\\s+screen)\\b/i;
              const allowDecompression = enableTextDecompression !== false;
              const decompressionModeNormalized = String(decompressionMode || 'auto').toLowerCase();
              const includeCompressed = includeCompressedReadOnly !== false;

              const isAsciiStandardByte = (b) => {
                const v = Number(b) & 0xFF;
                return v === 0x09 || v === 0x0A || v === 0x0D || (v >= 0x20 && v <= 0x7E);
              };
              const isShiftJisLeadByte = (b) => {
                const v = Number(b) & 0xFF;
                return (v >= 0x81 && v <= 0x9F) || (v >= 0xE0 && v <= 0xEF);
              };
              const isShiftJisTrailByte = (b) => {
                const v = Number(b) & 0xFF;
                return (v >= 0x40 && v <= 0x7E) || (v >= 0x80 && v <= 0xFC);
              };
              const isLikelyShiftJisPairAt = (bytes, idx) => {
                if (!bytes || idx < 0 || (idx + 1) >= bytes.length) return false;
                const a = bytes[idx] & 0xFF;
                const b = bytes[idx + 1] & 0xFF;
                return isShiftJisLeadByte(a) && isShiftJisTrailByte(b);
              };

              const byteToChar = new Map();
              const multiByteChars = [];
              const multiByteTerminators = [];
              const multiByteStartMarkers = [];
              const specialChars = new Map();
              const startBytes = new Set();

              if (tableData) {
                  if (tableData.singleByte) {
                    for (const hex in tableData.singleByte) {
                      const byteVal = parseInt(hex, 10);
                      const rawChar = tableData.singleByte[hex];
                      const char = typeof rawChar === 'string' ? rawChar : String(rawChar ?? '');
                      const upperChar = char.toUpperCase();

                      if (upperChar === '[SPACE]') {
                        byteToChar.set(byteVal, ' ');
                      } else if (upperChar === '[LINE]' || upperChar === '[NEWLINE]' || char === '/') {
                        byteToChar.set(byteVal, '\\n');
                      } else if (upperChar === '[START]') {
                        startBytes.add(byteVal);
                      } else if (char.startsWith('[') && char.endsWith(']')) {
                        if (upperChar !== '[END]' && upperChar !== '[NULL]' && upperChar !== '[START]') {
                            byteToChar.set(byteVal, char);
                        }
                        if (upperChar === '[END]') {
                            specialChars.set(byteVal, char);
                        }
                      } else {
                        byteToChar.set(byteVal, char);
                      }
                    }
                  }
                  if (tableData.multiByte) {
                    for (const hexSeq in tableData.multiByte) {
                        const bytes = hexSeq.match(/.{1,2}/g).map(h => parseInt(h, 16));
                        const rawChar = tableData.multiByte[hexSeq];
                        const char = typeof rawChar === 'string' ? rawChar : String(rawChar ?? '');
                        const upperChar = char.toUpperCase();
                        if (upperChar === '[END]' || upperChar === '[NULL]') {
                            multiByteTerminators.push(new Uint8Array(bytes));
                            continue;
                        }
                        if (upperChar === '[START]') {
                            multiByteStartMarkers.push(new Uint8Array(bytes));
                            continue;
                        }
                        const isLine = upperChar === '[LINE]' || upperChar === '[NEWLINE]' || char === '/';
                        const normalizedChar = upperChar === '[SPACE]' ? ' ' : char;
                        multiByteChars.push({ bytes: new Uint8Array(bytes), char: normalizedChar, isLine });
                    }
                    multiByteChars.sort((a, b) => b.bytes.length - a.bytes.length);
                    multiByteTerminators.sort((a, b) => b.length - a.length);
                    multiByteStartMarkers.sort((a, b) => b.length - a.length);
                  }
              }

              const explicitSingleTerminators = new Set();
              specialChars.forEach((val, key) => {
                const upper = String(val || '').toUpperCase();
                if (upper === '[END]' || upper === '[NULL]') explicitSingleTerminators.add(key);
              });
              const terminatorBytes = new Set(system.terminator || []);
              explicitSingleTerminators.forEach(t => terminatorBytes.add(t));
              for (const [byteVal, mappedChar] of byteToChar.entries()) {
                if (mappedChar !== undefined && mappedChar !== null && mappedChar !== '') {
                  terminatorBytes.delete(byteVal);
                }
              }
              if (terminatorBytes.size === 0) {
                if (explicitSingleTerminators.size > 0) {
                  explicitSingleTerminators.forEach(t => terminatorBytes.add(t));
                } else if (Array.isArray(system.terminator)) {
                  for (const t of system.terminator) {
                    if (!byteToChar.has(t)) terminatorBytes.add(t);
                  }
                }
              }

              const decodeLz10 = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x10) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const flags = src[inPos++];
                  for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                    const compressed = (flags & (0x80 >> bit)) !== 0;
                    if (!compressed) {
                      if (inPos >= src.length) return null;
                      out[outPos++] = src[inPos++];
                    } else {
                      if (inPos + 1 >= src.length) return null;
                      const b1 = src[inPos++];
                      const b2 = src[inPos++];
                      const length = (b1 >> 4) + 3;
                      const disp = ((b1 & 0x0F) << 8) | b2;
                      let copyPos = outPos - (disp + 1);
                      if (copyPos < 0) return null;
                      for (let j = 0; j < length && outPos < outLen; j++) {
                        out[outPos++] = out[copyPos++];
                      }
                    }
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeLz11 = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x11) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const flags = src[inPos++];
                  for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                    const compressed = (flags & (0x80 >> bit)) !== 0;
                    if (!compressed) {
                      if (inPos >= src.length) return null;
                      out[outPos++] = src[inPos++];
                    } else {
                      if (inPos >= src.length) return null;
                      const b1 = src[inPos++];
                      let length = 0;
                      let disp = 0;
                      const hi = b1 >> 4;
                      if (hi === 0) {
                        if (inPos + 1 >= src.length) return null;
                        const b2 = src[inPos++];
                        const b3 = src[inPos++];
                        length = (((b1 & 0x0F) << 4) | (b2 >> 4)) + 0x11;
                        disp = ((b2 & 0x0F) << 8) | b3;
                      } else if (hi === 1) {
                        if (inPos + 2 >= src.length) return null;
                        const b2 = src[inPos++];
                        const b3 = src[inPos++];
                        const b4 = src[inPos++];
                        length = (((b1 & 0x0F) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111;
                        disp = ((b3 & 0x0F) << 8) | b4;
                      } else {
                        if (inPos >= src.length) return null;
                        const b2 = src[inPos++];
                        length = hi + 1;
                        disp = ((b1 & 0x0F) << 8) | b2;
                      }
                      let copyPos = outPos - (disp + 1);
                      if (copyPos < 0) return null;
                      for (let j = 0; j < length && outPos < outLen; j++) {
                        out[outPos++] = out[copyPos++];
                      }
                    }
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeGbaRle = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x30) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const header = src[inPos++];
                  const runLen = (header & 0x7F) + 1;
                  if ((header & 0x80) !== 0) {
                    if (inPos >= src.length) return null;
                    const value = src[inPos++];
                    for (let i = 0; i < runLen && outPos < outLen; i++) out[outPos++] = value;
                  } else {
                    if (inPos + runLen > src.length) return null;
                    const copyLen = Math.min(runLen, outLen - outPos);
                    out.set(src.subarray(inPos, inPos + copyLen), outPos);
                    inPos += runLen;
                    outPos += copyLen;
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeYaz0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x7A || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 16;
                let outPos = 0;
                let code = 0;
                let validBits = 0;
                while (outPos < outLen && inPos < src.length) {
                  if (validBits === 0) {
                    code = src[inPos++];
                    validBits = 8;
                  }
                  if ((code & 0x80) !== 0) {
                    if (inPos >= src.length) return null;
                    out[outPos++] = src[inPos++];
                  } else {
                    if (inPos + 1 >= src.length) return null;
                    const b1 = src[inPos++];
                    const b2 = src[inPos++];
                    const dist = ((b1 & 0x0F) << 8) | b2;
                    let copyPos = outPos - (dist + 1);
                    if (copyPos < 0) return null;
                    let len = b1 >> 4;
                    if (len === 0) {
                      if (inPos >= src.length) return null;
                      len = src[inPos++] + 0x12;
                    } else {
                      len += 2;
                    }
                    for (let i = 0; i < len && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                  code = (code << 1) & 0xFF;
                  validBits--;
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeMio0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x4D || src[start + 1] !== 0x49 || src[start + 2] !== 0x4F || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                const compOff =
                  ((src[start + 8] << 24) >>> 0) |
                  (src[start + 9] << 16) |
                  (src[start + 10] << 8) |
                  src[start + 11];
                const rawOff =
                  ((src[start + 12] << 24) >>> 0) |
                  (src[start + 13] << 16) |
                  (src[start + 14] << 8) |
                  src[start + 15];
                if (outLen <= 0 || outLen > maxOut) return null;
                if (compOff < 16 || rawOff < 16) return null;
                let layoutPos = start + 16;
                let compPos = start + compOff;
                let rawPos = start + rawOff;
                if (layoutPos >= src.length || compPos >= src.length || rawPos >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let layout = 0;
                let bitsLeft = 0;
                while (outPos < outLen) {
                  if (bitsLeft === 0) {
                    if (layoutPos >= src.length) return null;
                    layout = src[layoutPos++];
                    bitsLeft = 8;
                  }
                  const isRaw = (layout & 0x80) !== 0;
                  layout = (layout << 1) & 0xFF;
                  bitsLeft--;
                  if (isRaw) {
                    if (rawPos >= src.length) return null;
                    out[outPos++] = src[rawPos++];
                  } else {
                    if (compPos + 1 >= src.length) return null;
                    const b1 = src[compPos++];
                    const b2 = src[compPos++];
                    const length = (b1 >> 4) + 3;
                    const disp = ((b1 & 0x0F) << 8) | b2;
                    let copyPos = outPos - (disp + 1);
                    if (copyPos < 0) return null;
                    for (let i = 0; i < length && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                }
                return { out, consumed: Math.max(layoutPos, compPos, rawPos) - start };
              };

              const decodeYay0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x79 || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                const linkOff =
                  ((src[start + 8] << 24) >>> 0) |
                  (src[start + 9] << 16) |
                  (src[start + 10] << 8) |
                  src[start + 11];
                const rawOff =
                  ((src[start + 12] << 24) >>> 0) |
                  (src[start + 13] << 16) |
                  (src[start + 14] << 8) |
                  src[start + 15];
                if (outLen <= 0 || outLen > maxOut) return null;
                if (linkOff < 16 || rawOff < 16) return null;
                let maskPos = start + 16;
                let linkPos = start + linkOff;
                let rawPos = start + rawOff;
                if (maskPos >= src.length || linkPos >= src.length || rawPos >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let mask = 0;
                let bitsLeft = 0;
                while (outPos < outLen) {
                  if (bitsLeft === 0) {
                    if (maskPos + 3 >= src.length) return null;
                    mask = ((src[maskPos] << 24) >>> 0) | (src[maskPos + 1] << 16) | (src[maskPos + 2] << 8) | src[maskPos + 3];
                    maskPos += 4;
                    bitsLeft = 32;
                  }
                  const isRaw = (mask & 0x80000000) !== 0;
                  mask = (mask << 1) >>> 0;
                  bitsLeft--;
                  if (isRaw) {
                    if (rawPos >= src.length) return null;
                    out[outPos++] = src[rawPos++];
                  } else {
                    if (linkPos + 1 >= src.length) return null;
                    const b1 = src[linkPos++];
                    const b2 = src[linkPos++];
                    const disp = ((b1 & 0x0F) << 8) | b2;
                    let length = b1 >> 4;
                    if (length === 0) {
                      if (rawPos >= src.length) return null;
                      length = src[rawPos++] + 0x12;
                    } else {
                      length += 2;
                    }
                    let copyPos = outPos - (disp + 1);
                    if (copyPos < 0) return null;
                    for (let i = 0; i < length && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                }
                return { out, consumed: Math.max(maskPos, linkPos, rawPos) - start };
              };

              const decodeGbaHuffman = (src, start, maxOut = 1024 * 1024) => {
                if (start + 6 > src.length) return null;
                const header = src[start] | (src[start + 1] << 8) | (src[start + 2] << 16) | (src[start + 3] << 24);
                const type = (header >> 4) & 0x0F;
                const bitsPerSymbol = header & 0x0F;
                const outLen = (header >>> 8);
                if (type !== 2 || (bitsPerSymbol !== 4 && bitsPerSymbol !== 8)) return null;
                if (outLen <= 0 || outLen > maxOut) return null;
                const treeSize = (src[start + 4] * 2) + 1;
                const treeBase = start + 5;
                const streamBase = treeBase + treeSize;
                if (treeSize <= 0 || streamBase >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let inPos = streamBase;
                let bitPool = 0;
                let bitsLeft = 0;
                let lowNibble = null;
                const readBit = () => {
                  if (bitsLeft === 0) {
                    if (inPos + 3 >= src.length) return null;
                    bitPool = ((src[inPos] << 24) >>> 0) | (src[inPos + 1] << 16) | (src[inPos + 2] << 8) | src[inPos + 3];
                    inPos += 4;
                    bitsLeft = 32;
                  }
                  const bit = (bitPool & 0x80000000) !== 0 ? 1 : 0;
                  bitPool = (bitPool << 1) >>> 0;
                  bitsLeft--;
                  return bit;
                };
                const readLeaf = () => {
                  let nodeIndex = 0;
                  while (true) {
                    if (nodeIndex < 0 || nodeIndex >= treeSize) return null;
                    const node = src[treeBase + nodeIndex];
                    const bit = readBit();
                    if (bit === null) return null;
                    const offset = node & 0x3F;
                    const childBase = (nodeIndex & 0xFE) + (offset * 2) + 2;
                    if (bit === 0) {
                      const leaf = (node & 0x80) !== 0;
                      const idx = childBase;
                      if (idx < 0 || idx >= treeSize) return null;
                      if (leaf) return src[treeBase + idx];
                      nodeIndex = idx;
                    } else {
                      const leaf = (node & 0x40) !== 0;
                      const idx = childBase + 1;
                      if (idx < 0 || idx >= treeSize) return null;
                      if (leaf) return src[treeBase + idx];
                      nodeIndex = idx;
                    }
                  }
                };
                while (outPos < outLen) {
                  const symbol = readLeaf();
                  if (symbol === null) return null;
                  if (bitsPerSymbol === 8) {
                    out[outPos++] = symbol & 0xFF;
                  } else {
                    const nibble = symbol & 0x0F;
                    if (lowNibble === null) {
                      lowNibble = nibble;
                    } else {
                      out[outPos++] = ((nibble & 0x0F) << 4) | (lowNibble & 0x0F);
                      lowNibble = null;
                    }
                  }
                }
                return { out, consumed: inPos - start };
              };

              const shouldTryLz10 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'lz10' || decompressionModeNormalized === 'gba_lz77' || decompressionModeNormalized === 'nintendo_lz';
              const shouldTryLz11 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'lz11' || decompressionModeNormalized === 'nintendo_lz';
              const shouldTryHuffman =
                decompressionModeNormalized === 'auto' ||
                decompressionModeNormalized === 'huffman' ||
                decompressionModeNormalized === 'huff' ||
                decompressionModeNormalized === 'huff4' ||
                decompressionModeNormalized === 'huff8' ||
                decompressionModeNormalized === 'nintendo_huff';
              const shouldTryRle = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'rle' || decompressionModeNormalized === 'gba_rle';
              const shouldTryYaz0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'yaz0';
              const shouldTryMio0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'mio0';
              const shouldTryYay0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'yay0';

              const buildSourceList = async () => {
                const sources = [{
                  bytes: romData,
                  sourceType: 'rom',
                  sourceTag: 'ROM',
                  sourceStart: 0,
                  buildable: true,
                  compressed: false
                }];
                if (!allowDecompression || decompressionModeNormalized === 'none') return sources;

                const maxBlocks = isRetroPipeline ? 64 : 96;
                const seen = new Set();
                let found = 0;
                const scanLimit = Math.max(0, romData.length - 4);
                for (let i = 0; i <= scanLimit && found < maxBlocks; i++) {
                  const sig = romData[i];
                  let decoded = null;
                  let sourceType = '';
                  if (sig === 0x10 && shouldTryLz10) {
                    decoded = decodeLz10(romData, i);
                    sourceType = 'cmp_lz10';
                  } else if (sig === 0x11 && shouldTryLz11) {
                    decoded = decodeLz11(romData, i);
                    sourceType = 'cmp_lz11';
                  } else if ((sig & 0xF0) === 0x20 && shouldTryHuffman) {
                    decoded = decodeGbaHuffman(romData, i);
                    sourceType = 'cmp_huffman';
                  } else if (sig === 0x30 && shouldTryRle) {
                    decoded = decodeGbaRle(romData, i);
                    sourceType = 'cmp_rle';
                  } else if (shouldTryYaz0 && i + 16 <= romData.length && romData[i] === 0x59 && romData[i + 1] === 0x61 && romData[i + 2] === 0x7A && romData[i + 3] === 0x30) {
                    decoded = decodeYaz0(romData, i);
                    sourceType = 'cmp_yaz0';
                  } else if (shouldTryMio0 && i + 16 <= romData.length && romData[i] === 0x4D && romData[i + 1] === 0x49 && romData[i + 2] === 0x4F && romData[i + 3] === 0x30) {
                    decoded = decodeMio0(romData, i);
                    sourceType = 'cmp_mio0';
                  } else if (shouldTryYay0 && i + 16 <= romData.length && romData[i] === 0x59 && romData[i + 1] === 0x61 && romData[i + 2] === 0x79 && romData[i + 3] === 0x30) {
                    decoded = decodeYay0(romData, i);
                    sourceType = 'cmp_yay0';
                  }
                  if (!decoded || !decoded.out || decoded.out.length < Math.max(16, effectiveMinLength)) continue;
                  const out = decoded.out;
                  const signature = sourceType + ':' + out.length + ':' + out[0] + ':' + out[Math.min(out.length - 1, 7)] + ':' + out[Math.min(out.length - 1, 31)];
                  if (seen.has(signature)) continue;
                  seen.add(signature);
                  sources.push({
                    bytes: out,
                    sourceType,
                    sourceTag: sourceType.toUpperCase() + '@0x' + i.toString(16).toUpperCase(),
                    sourceStart: i,
                    buildable: false,
                    compressed: true
                  });
                  found++;
                  if (decoded.consumed && decoded.consumed > 8) {
                    i += Math.max(0, Math.min(decoded.consumed, 4096) - 1);
                  }
                  if (i > 0 && (i % 262144) === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
                return sources;
              };

              self.postMessage({ type: 'progress', value: 5 });
              const uniqueTexts = new Map();

              const storeDecodedString = (sourceMeta, start, end, chars) => {
                  if (start === -1 || chars.length < effectiveMinLength) return;
                  const decodedText = chars.join('');
                  if (!decodedText) return;
                  const isBuildable = sourceMeta && sourceMeta.buildable === true;
                  let mapKey = decodedText;
                  if (!isBuildable) {
                    if (!includeCompressed) return;
                    if (uniqueTexts.has(decodedText)) return;
                    mapKey = decodedText + '@@' + sourceMeta.sourceTag + '@@' + start;
                  }
                  if (uniqueTexts.has(mapKey)) return;
                  uniqueTexts.set(mapKey, {
                    decodedText,
                    startByte: isBuildable ? start : null,
                    endByte: isBuildable ? end : null,
                    byteLength: (end - start) + 1,
                    sourceType: sourceMeta ? sourceMeta.sourceType : 'rom',
                    sourceTag: sourceMeta ? sourceMeta.sourceTag : 'ROM',
                    sourceStart: sourceMeta ? sourceMeta.sourceStart : 0,
                    relativeStart: start,
                    buildable: isBuildable,
                    compressed: sourceMeta ? !!sourceMeta.compressed : false
                  });
              };

              const sources = await buildSourceList();
              const totalSources = Math.max(1, sources.length);
              for (let s = 0; s < sources.length; s++) {
                const sourceMeta = sources[s];
                const sourceBytes = sourceMeta.bytes;
                const sourceLength = sourceBytes.length;
                let currentStringChars = [];
                let stringStartOffset = -1;
                let unknownGapCount = 0;

                const flushCurrent = (currentIndex) => {
                  const end = Math.max(stringStartOffset, currentIndex - 1);
                  storeDecodedString(sourceMeta, stringStartOffset, end, currentStringChars);
                  currentStringChars = [];
                  stringStartOffset = -1;
                  unknownGapCount = 0;
                };

                for (let i = 0; i < sourceLength; i++) {
                    if (i > 0 && i % 262144 === 0) {
                        const sourceProgressBase = 8 + Math.floor((s / totalSources) * 80);
                        const sourceProgressSpan = Math.max(1, Math.floor(80 / totalSources));
                        const localProgress = Math.floor((i / Math.max(1, sourceLength)) * sourceProgressSpan);
                        self.postMessage({ type: 'progress', value: Math.min(90, sourceProgressBase + localProgress) });
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }

                    if (multiByteStartMarkers.length > 0) {
                        let started = false;
                        for (const startToken of multiByteStartMarkers) {
                            if (i + startToken.length > sourceLength) continue;
                            let match = true;
                            for (let j = 0; j < startToken.length; j++) {
                                if (sourceBytes[i + j] !== startToken[j]) { match = false; break; }
                            }
                            if (match) {
                                flushCurrent(i);
                                i += startToken.length - 1;
                                started = true;
                                break;
                            }
                        }
                        if (started) continue;
                    }

                    if (multiByteTerminators.length > 0) {
                        let terminated = false;
                        for (const term of multiByteTerminators) {
                            if (i + term.length > sourceLength) continue;
                            let match = true;
                            for (let j = 0; j < term.length; j++) {
                                if (sourceBytes[i + j] !== term[j]) { match = false; break; }
                            }
                            if (match) {
                                flushCurrent(i);
                                i += term.length - 1;
                                terminated = true;
                                break;
                            }
                        }
                        if (terminated) continue;
                    }

                    const currentByte = sourceBytes[i];
                    if (startBytes.has(currentByte)) {
                        flushCurrent(i);
                        continue;
                    }
                    if (terminatorBytes.has(currentByte)) {
                        flushCurrent(i);
                        continue;
                    }

                    let charFound = false;
                    let advance = 1;

                    let matchedMultiByte = null;
                    for (const mb of multiByteChars) {
                        if (i + mb.bytes.length > sourceLength) continue;
                        let match = true;
                        for (let j = 0; j < mb.bytes.length; j++) { if (sourceBytes[i + j] !== mb.bytes[j]) { match = false; break; } }
                        if (match) { matchedMultiByte = mb; break; }
                    }

                    if (matchedMultiByte) {
                        if (stringStartOffset === -1) stringStartOffset = i;
                        if (matchedMultiByte.isLine) {
                          currentStringChars.push('\\n');
                        } else {
                          currentStringChars.push(matchedMultiByte.char);
                        }
                        advance = matchedMultiByte.bytes.length;
                        charFound = true;
                        unknownGapCount = 0;
                    } else {
                        const char = byteToChar.get(currentByte);
                        if (char !== undefined) {
                            if (stringStartOffset === -1) stringStartOffset = i;
                            currentStringChars.push(char);
                            charFound = true;
                            unknownGapCount = 0;
                            if (usePaddingByte && i + 1 < sourceLength && sourceBytes[i + 1] === PADDING_BYTE) {
                                advance = 2;
                            }
                        } else if (useAsciiFallback && (looseByteMayStartText || stringStartOffset !== -1) && currentByte >= 0x20 && currentByte <= 0x7E) {
                            if (stringStartOffset === -1) stringStartOffset = i;
                            currentStringChars.push(String.fromCharCode(currentByte));
                            charFound = true;
                            unknownGapCount = 0;
                            if (usePaddingByte && i + 1 < sourceLength && sourceBytes[i + 1] === PADDING_BYTE) {
                                advance = 2;
                            }
                        } else if (strictSceneBoundsMode) {
                            const likelySjisPair = isLikelyShiftJisPairAt(sourceBytes, i);
                            const likelyAscii = isAsciiStandardByte(currentByte);
                            if (likelySjisPair) {
                              if (stringStartOffset === -1) stringStartOffset = i;
                              currentStringChars.push(' ');
                              charFound = true;
                              unknownGapCount = 0;
                              advance = 2;
                            } else if (likelyAscii && useAsciiFallback) {
                              if (stringStartOffset === -1) stringStartOffset = i;
                              currentStringChars.push(String.fromCharCode(currentByte));
                              charFound = true;
                              unknownGapCount = 0;
                            } else {
                              flushCurrent(i);
                              charFound = false;
                            }
                        } else if (isRetroPipeline && stringStartOffset !== -1 && !terminatorBytes.has(currentByte)) {
                            unknownGapCount += 1;
                            const toleratedGap = strictMode ? 2 : 3;
                            if (unknownGapCount <= toleratedGap) {
                              charFound = true;
                            } else {
                              const endOffset = Math.max(stringStartOffset, i - unknownGapCount);
                              storeDecodedString(sourceMeta, stringStartOffset, endOffset, currentStringChars);
                              currentStringChars = [];
                              stringStartOffset = -1;
                              unknownGapCount = 0;
                              charFound = false;
                            }
                        }
                    }

                    if (charFound) {
                        i += advance - 1;
                        if(currentStringChars.length > maxLength) {
                          storeDecodedString(sourceMeta, stringStartOffset, i, currentStringChars);
                          currentStringChars = [];
                          stringStartOffset = -1;
                          unknownGapCount = 0;
                        }
                    } else {
                        flushCurrent(i);
                    }
                }
                storeDecodedString(sourceMeta, stringStartOffset, sourceLength - 1, currentStringChars);
              }

              self.postMessage({ type: 'progress', value: 95 });
              const retroQualityFilter = (decodedText) => {
                const value = String(decodedText || '');
                if (!isRetroPipeline) return true;
                if (value.length < effectiveMinLength) return false;
                if (/\b(the|you|your|king|queen|lord|press|start|yes|no)\b/i.test(value)) return true;
                const bracketTokenCount = (value.match(/\[[0-9A-F]{2}\]/g) || []).length;
                const bracketThreshold = strictMode ? 0.24 : 0.30;
                if (bracketTokenCount > 0 && (bracketTokenCount / Math.max(1, value.length / 4)) > bracketThreshold) return false;
                const allowedCount = (value.match(/[A-Za-z0-9\s.,!?"':;()\/\-]/g) || []).length;
                const allowedRatio = allowedCount / Math.max(1, value.length);
                const allowedThreshold = strictMode ? 0.58 : 0.52;
                if (allowedRatio < allowedThreshold) return false;
                const letterCount = (value.match(/[A-Za-z]/g) || []).length;
                const minLetters = strictMode ? 2 : 1;
                if (letterCount < minLetters && value.length >= 9) return false;
                return true;
              };
              const retroLanguageScore = (decodedText) => {
                const value = String(decodedText || '');
                if (!value) return 0;
                const lower = value.toLowerCase();
                const len = Math.max(1, value.length);
                const allowedCount = (value.match(/[A-Za-z0-9\\s.,!?\"':;()\\/\\-]/g) || []).length;
                const allowedRatio = allowedCount / len;
                const letterCount = (value.match(/[A-Za-z]/g) || []).length;
                const letterRatio = letterCount / len;
                const commonWords = ['the', 'you', 'your', 'king', 'queen', 'lord', 'soldier', 'soldiers', 'press', 'start', 'yes', 'no', 'item', 'magic', 'save', 'load'];
                const digraphs = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'st'];
                let score = 0;
                score += allowedRatio * 0.40;
                score += Math.min(1, letterRatio * 1.8) * 0.25;
                let wordHit = 0;
                for (const w of commonWords) {
                  if (lower.includes(w)) {
                    wordHit++;
                    if (wordHit >= 4) break;
                  }
                }
                score += Math.min(0.22, wordHit * 0.055);
                let digraphHit = 0;
                for (const dg of digraphs) {
                  if (lower.includes(dg)) {
                    digraphHit++;
                    if (digraphHit >= 5) break;
                  }
                }
                score += Math.min(0.12, digraphHit * 0.024);
                if (/[A-Za-z]{3,}/.test(value)) score += 0.06;
                if (/[\\[\\]{}<>]/.test(value) && (value.match(/[\\[\\]{}<>]/g) || []).length > Math.max(2, Math.floor(len * 0.15))) score -= 0.20;
                if (/([A-Za-z0-9])\\1{4,}/.test(value)) score -= 0.12;
                if (/\\b(aa|bb|cc|dd|ee|ff|gg)\\b/i.test(value)) score -= 0.06;
                return Math.max(0, Math.min(1, score));
              };
              const extractedEntries = Array.from(uniqueTexts.values());
              let filteredEntries = isRetroPipeline
                ? extractedEntries.filter((entry) => retroQualityFilter(entry.decodedText))
                : extractedEntries;
              const strictSceneBoundsFilter = (decodedText) => {
                if (!strictSceneBoundsMode) return true;
                const value = String(decodedText || '');
                if (value.length < effectiveMinLength) return false;
                const withoutControls = value.replace(/\\[[^\\]]+\\]/g, ' ').replace(/\\s+/g, ' ').trim();
                if (!withoutControls) return false;
                if (!strictAsciiRegex.test(withoutControls)) return false;
                const printableCount = (withoutControls.match(/[A-Za-z0-9\\s.,!?\"':;()\\-\\/]/g) || []).length;
                const printableRatio = printableCount / Math.max(1, withoutControls.length);
                if (printableRatio < 0.78) return false;
                const bracketHexCount = (value.match(/\\[[0-9A-F]{2,4}\\]/gi) || []).length;
                if (bracketHexCount > Math.max(2, Math.floor(value.length * 0.10))) return false;
                if (/(?:^|\\s)(?:[0-9A-F]{2}\\s+){8,}[0-9A-F]{2}(?:\\s|$)/i.test(withoutControls)) return false;
                const hasDialogCue = strictDialogCueRegex.test(value);
                const hasTitleNoise = strictTitleNoiseRegex.test(withoutControls);
                if (hasTitleNoise && !hasDialogCue) return false;
                if (!hasDialogCue) return false;
                return true;
              };
              if (strictSceneBoundsMode) {
                filteredEntries = filteredEntries.filter((entry) => strictSceneBoundsFilter(entry.decodedText));
              }
              if (isRetroPipeline) {
                const minimumKeep = Math.min(700, Math.max(220, Math.floor(extractedEntries.length * 0.20)));
                if (filteredEntries.length < minimumKeep) {
                  const scored = extractedEntries
                    .map((entry) => ({ entry, score: retroLanguageScore(entry.decodedText) }))
                    .filter((item) => item.score >= (strictMode ? 0.56 : 0.50))
                    .sort((a, b) => b.score - a.score);
                  const seenRescue = new Set(filteredEntries.map((entry) => String(entry.sourceTag || '') + '@@' + String(entry.relativeStart || 0) + '@@' + String(entry.decodedText || '')));
                  for (const item of scored) {
                    if (filteredEntries.length >= minimumKeep) break;
                    const key = String(item.entry.sourceTag || '') + '@@' + String(item.entry.relativeStart || 0) + '@@' + String(item.entry.decodedText || '');
                    if (seenRescue.has(key)) continue;
                    seenRescue.add(key);
                    filteredEntries.push(item.entry);
                  }
                }
              }
              const processedTexts = filteredEntries.map((entry, index) => {
                const decodedText = entry.decodedText;
                let textType = entry.buildable ? 'system-internal' : 'compressed';
                const wordCount = decodedText.split(/\s+/).filter(Boolean).length;
                if (entry.buildable && (decodedText.length > 35 || wordCount > 5 || /[.?!]/.test(decodedText) || decodedText.includes('\\n'))) textType = 'dialogue';
                else if (entry.buildable && (/\b(item|magic|save|load|exit|yes|no|ok|cancel|status|skill|attack|defend|potion|sword|shield|inn|shop)\b/i.test(decodedText) || (decodedText.length > 2 && decodedText === decodedText.toUpperCase()))) textType = 'menu';
                else if (entry.buildable && wordCount > 1 && decodedText.length > 8) textType = 'system';
                const offsetLabel = entry.buildable
                  ? ('0x' + entry.startByte.toString(16).toUpperCase().padStart(6, '0'))
                  : ('CMP:' + entry.sourceTag + '+0x' + Number(entry.relativeStart || 0).toString(16).toUpperCase());
                return {
                  id: index + 1,
                  originalText: decodedText,
                  translatedText: '',
                  textType,
                  startByte: entry.buildable ? entry.startByte : null,
                  byteLength: entry.byteLength,
                  offset: offsetLabel,
                  buildable: !!entry.buildable,
                  sourceType: entry.sourceType,
                  sourceTag: entry.sourceTag,
                  compressed: !!entry.compressed
                };
              }).sort((a, b) => {
                const aBuild = a.buildable ? 0 : 1;
                const bBuild = b.buildable ? 0 : 1;
                if (aBuild !== bBuild) return aBuild - bBuild;
                const aStart = Number.isFinite(a.startByte) ? a.startByte : Number.MAX_SAFE_INTEGER;
                const bStart = Number.isFinite(b.startByte) ? b.startByte : Number.MAX_SAFE_INTEGER;
                if (aStart !== bStart) return aStart - bStart;
                return String(a.offset || '').localeCompare(String(b.offset || ''));
              });

              const chunkSize = 2500;
              if (processedTexts.length === 0) {
                self.postMessage({ type: 'resultChunk', texts: [], done: true, totalTextCount: 0 });
              } else {
                for (let i = 0; i < processedTexts.length; i += chunkSize) {
                  const chunk = processedTexts.slice(i, i + chunkSize);
                  const done = (i + chunkSize) >= processedTexts.length;
                  self.postMessage({ type: 'resultChunk', texts: chunk, done, totalTextCount: processedTexts.length });
                  if (!done) await new Promise(resolve => setTimeout(resolve, 0));
                }
              }
            } catch (error) {
              self.postMessage({ type: 'error', message: error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

  core.createTextExtractorWorker = createTextExtractorWorker;
})(window);
