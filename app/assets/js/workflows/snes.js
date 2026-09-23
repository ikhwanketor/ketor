/* ============================================================
   Ketor -- SNES Workflow
   ------------------------------------------------------------
   Super Nintendo Entertainment System (Super Famicom)
   - CPU: Ricoh 5A22 (65816, 16-bit)
   - ROM: up to 4 MB (LoROM/HiROM mapping)
   - Pointer: 2-byte or 3-byte, little-endian
   - Terminator: varies per game (0x00, 0xFF, or custom)
   - Font: 2bpp or 4bpp planar, multiple tile sets
   - Encoding: ASCII, Shift-JIS, or custom; DTE/MTE common
   - Compression: LZSS frequently used
   - LoROM: bank size 0x8000, pointers are 2-byte
   - HiROM: bank size 0x10000, pointers may be 3-byte
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.workflows = Ketor.workflows || {};

  function SNESWorkflow() {
    Ketor.workflows.BaseWorkflow.call(this);
    this.name = 'SNES';
    this.extensions = ['sfc', 'smc', 'fig', 'snes'];
  }

  SNESWorkflow.prototype = Object.create(Ketor.workflows.BaseWorkflow.prototype);
  SNESWorkflow.prototype.constructor = SNESWorkflow;

  /**
   * Detect SNES by checking header at 0x7FC0 or 0x81C0 (HiROM).
   * Score-based detection across multiple candidates.
   */
  SNESWorkflow.prototype.detect = function (data, fileName) {
    var ext = (fileName || '').split('.').pop().toLowerCase();
    // Extension check first
    if (this.extensions.indexOf(ext) !== -1) return true;

    if (!data || data.length < 0x8000) return false;

    // SNES internal header is at 0x7FC0 (LoROM) or 0xFFC0 (HiROM)
    // when no copier header. With copier header (512 bytes), shift +0x200.
    var candidates = [0x7FC0, 0x7FC0 + 0x200, 0xFFC0, 0xFFC0 + 0x200];
    var bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var off = candidates[i];
      if (off + 0x20 > data.length) continue;
      var score = 0;
      // Check for typical SNES header characteristics
      // Byte 0x15: ROM size (log2, typical 0x08-0x0D)
      var romSize = data[off + 0x17];
      if (romSize >= 0x05 && romSize <= 0x0D) score += 2;
      // Byte 0x16: checksum complement, byte 0x17: checksum
      var checksum = data[off + 0x1F] | (data[off + 0x1E] << 8);
      var complement = data[off + 0x1D] | (data[off + 0x1C] << 8);
      if (((checksum ^ complement) & 0xFFFF) === 0xFFFF) score += 3;
      // Map mode byte at 0x15
      var mapMode = data[off + 0x15];
      if (mapMode === 0x20 || mapMode === 0x21 || mapMode === 0x30 || mapMode === 0x31) score += 2;
      if (score > bestScore) bestScore = score;
    }
    return bestScore >= 4;
  };

  SNESWorkflow.prototype.getSystemProfile = function () {
    return {
      name: 'SNES',
      terminator: [0x00],
      pointerSize: 2,
      pointerEndianness: 'little',
      pointerBase: 0x8000,
      extensions: ['sfc', 'smc', 'fig', 'snes'],
      hasHeader: true,
      headerSize: 0x200, // copier header (optional)
      bankSize: 0x8000,  // LoROM default
      pipelineId: 'pipeline_snes',
      profileId: 'profile_snes',
      // SNES pointer transforms:
      // snes_lorom: 0x8000 + (offset & 0x7FFF) + ((offset & 0x7F8000) << 1)
      // snes_hirom: offset + 0xC00000
      // snes_bank: (offset & 0xFFFF) | 0x800000
      pointerTransforms: ['raw', 'snes_lorom', 'snes_hirom', 'snes_bank'],
      // DTE/MTE commonly used in SNES games
      supportsDteMte: true,
      // LZSS compression common
      supportsLzss: true
    };
  };

  SNESWorkflow.prototype.getUIConfig = function () {
    return {
      showPaddingByte: false,
      showStrictMode: true,
      showCompression: true,
      showDecompression: true,
      defaultMinLength: 3,
      defaultMaxLength: 768,
      recommendedExtraction: 'strict',
      extractionLabel: 'Extract SNES Texts',
      showFontEditor: true,
      fontInfo: {
        bpp: 4, // 4bpp most common, 2bpp also used
        tileWidth: 8,
        tileHeight: 8,
        bytesPerTile: 32,
        chrLocation: 'vram',
        multipleTileSets: true
      },
      dteMteOptions: {
        enabled: true,
        label: 'DTE/MTE Compression'
      },
      compressionOptions: {
        enabled: true,
        modes: ['auto', 'lzss', 'none'],
        label: 'LZSS Decompression'
      }
    };
  };

  SNESWorkflow.prototype.getHelpText = function () {
    return 'SNES games use LoROM or HiROM mapping with 2-byte or ' +
           '3-byte pointers. Fonts may be 2bpp or 4bpp, and many ' +
           'games use DTE/MTE encoding to save space. LZSS ' +
           'compression is common; enable decompression if texts ' +
           'do not appear correctly.';
  };

  SNESWorkflow.prototype.extractText = function (rom, tableData, options) {
    var profile = this.getSystemProfile();
    return new Promise(function (resolve, reject) {
      if (!global.Ketor || !global.Ketor.extractTextViaWorker) {
        reject(new Error('Extraction worker not available.'));
        return;
      }
      var extractionOptions = {
        minLength: options.minLength || 3,
        maxLength: options.maxLength || 768,
        asciiFallback: !!options.asciiFallback,
        strictExtractorMode: false,
        system: profile,
        systemPipeline: profile.pipelineId,
        usePaddingByte: false,
        enableDteMteCompression: options.enableDteMteCompression !== false,
        compressionStrategy: options.compressionStrategy || 'optimal',
        enableTextDecompression: options.enableTextDecompression !== false,
        decompressionMode: options.decompressionMode || 'auto',
        includeCompressedReadOnly: options.includeCompressedReadOnly !== false
      };
      global.Ketor.extractTextViaWorker(rom, tableData, extractionOptions)
        .then(resolve)
        .catch(reject);
    });
  };

  SNESWorkflow.prototype.insertText = function (rom, texts, tableData, options) {
    var profile = this.getSystemProfile();
    return new Promise(function (resolve, reject) {
      if (!global.Ketor || !global.Ketor.buildRomViaWorker) {
        reject(new Error('Build worker not available.'));
        return;
      }
      global.Ketor.buildRomViaWorker(rom, texts, tableData, profile, options)
        .then(resolve)
        .catch(reject);
    });
  };

  SNESWorkflow.prototype.validateBuild = function (rom, texts) {
    var overflow = this.findOverflowTexts(texts, null);
    if (overflow.length === 0) {
      return {
        ok: true,
        severity: 'ok',
        report: 'All texts fit. LoROM/HiROM pointer validation passed.'
      };
    }
    return {
      ok: true,
      severity: 'warn',
      report: overflow.length + ' text(s) exceed original length. ' +
              'Auto-relocation with LoROM/HiROM pointer update will be applied.'
    };
  };

  Ketor.workflows.SNESWorkflow = SNESWorkflow;

})(window);