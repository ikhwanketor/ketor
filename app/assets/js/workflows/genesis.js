/* ============================================================
   Ketor -- Sega Genesis / Mega Drive Workflow
   ------------------------------------------------------------
   Sega Genesis (Mega Drive)
   - CPU: Motorola 68000 @ 7.6 MHz (main) + Z80 (sound)
   - ROM: up to 4 MB (cartridge), up to 4 GB (Mega-CD)
   - Pointer: 4-byte, big-endian, absolute ROM address
   - Terminator: 0x00, 0xFF, or custom per game
   - Font: 4bpp tile, 8x8 (some games use 1bpp with custom routine)
   - Encoding: ASCII, Shift-JIS, or custom
   - ROM expansion often required: max 4 MB on cartridge
   - Pointer format: ROM address padded with zeros
     Example: $123456 -> 00 12 34 56
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.workflows = Ketor.workflows || {};

  function GenesisWorkflow() {
    Ketor.workflows.BaseWorkflow.call(this);
    this.name = 'Sega Genesis/MD';
    this.extensions = ['gen', 'md', 'smd', 'bin'];
  }

  GenesisWorkflow.prototype = Object.create(Ketor.workflows.BaseWorkflow.prototype);
  GenesisWorkflow.prototype.constructor = GenesisWorkflow;

  /**
   * Detect Genesis via "SEGA" signature at offset 0x100.
   * Most commercial ROMs have this in the header.
   */
  GenesisWorkflow.prototype.detect = function (data, fileName) {
    if (data && data.length > 0x110) {
      var sig = 'SEGA';
      var match = true;
      for (var i = 0; i < sig.length; i++) {
        if (data[0x100 + i] !== sig.charCodeAt(i)) { match = false; break; }
      }
      if (match) return true;
    }
    return Ketor.workflows.BaseWorkflow.prototype.detect.call(this, data, fileName);
  };

  GenesisWorkflow.prototype.getSystemProfile = function () {
    return {
      name: 'Sega Genesis/MD',
      terminator: [0x00],
      pointerSize: 4,
      pointerEndianness: 'big',
      pointerBase: 0,
      extensions: ['gen', 'md', 'smd', 'bin'],
      hasHeader: false,
      headerSize: 0,
      pipelineId: 'pipeline_genesis',
      profileId: 'profile_genesis',
      // Genesis pointer is absolute ROM address (big-endian)
      pointerTransforms: ['raw'],
      // ROM expansion supported for overflow texts
      supportsRomExpansion: true,
      maxRomSize: 0x400000, // 4 MB cartridge limit
      // Font may be 4bpp or 1bpp
      defaultFontBpp: 4,
      supportsColor: true
    };
  };

  GenesisWorkflow.prototype.getUIConfig = function () {
    return {
      showPaddingByte: false,
      showStrictMode: true,
      showCompression: false,
      showDecompression: false,
      defaultMinLength: 3,
      defaultMaxLength: 900,
      recommendedExtraction: 'strict',
      extractionLabel: 'Extract Genesis Texts',
      showFontEditor: true,
      fontInfo: {
        bpp: 4,
        tileWidth: 8,
        tileHeight: 8,
        bytesPerTile: 32,
        chrLocation: 'rom',
        supports1bpp: true
      },
      romExpansionOptions: {
        enabled: true,
        maxSize: 0x400000,
        label: 'Auto ROM Expansion'
      }
    };
  };

  GenesisWorkflow.prototype.getHelpText = function () {
    return 'Sega Genesis games use 4-byte big-endian pointers that are ' +
           'absolute ROM addresses. Example: ROM address $123456 is stored ' +
           'as hex bytes 00 12 34 56. Fonts are usually 4bpp tiles, but ' +
           'some games use 1bpp with a custom routine. ROM expansion is ' +
           'often needed because the cartridge limit is 4 MB.';
  };

  GenesisWorkflow.prototype.extractText = function (rom, tableData, options) {
    var profile = this.getSystemProfile();
    return new Promise(function (resolve, reject) {
      if (!global.Ketor || !global.Ketor.extractTextViaWorker) {
        reject(new Error('Extraction worker not available.'));
        return;
      }
      var extractionOptions = {
        minLength: options.minLength || 3,
        maxLength: options.maxLength || 900,
        asciiFallback: options.asciiFallback !== false,
        strictExtractorMode: options.strictExtractorMode === true,
        system: profile,
        systemPipeline: profile.pipelineId,
        usePaddingByte: false,
        enableDteMteCompression: !!options.enableDteMteCompression,
        compressionStrategy: options.compressionStrategy || 'optimal',
        enableTextDecompression: false,
        includeCompressedReadOnly: false
      };
      global.Ketor.extractTextViaWorker(rom, tableData, extractionOptions)
        .then(resolve)
        .catch(reject);
    });
  };

  GenesisWorkflow.prototype.insertText = function (rom, texts, tableData, options) {
    var profile = this.getSystemProfile();
    return new Promise(function (resolve, reject) {
      if (!global.Ketor || !global.Ketor.buildRomViaWorker) {
        reject(new Error('Build worker not available.'));
        return;
      }
      var insertOptions = {
        usePaddingByte: false,
        pointerGroups: options.pointerGroups || [],
        enableRomExpansion: options.enableRomExpansion !== false,
        maxRomSize: profile.maxRomSize
      };
      global.Ketor.buildRomViaWorker(rom, texts, tableData, profile, insertOptions)
        .then(resolve)
        .catch(reject);
    });
  };

  GenesisWorkflow.prototype.validateBuild = function (rom, texts) {
    var overflow = this.findOverflowTexts(texts, null);
    if (overflow.length === 0) {
      return {
        ok: true,
        severity: 'ok',
        report: 'All texts fit. Genesis 4-byte big-endian pointer validation passed.'
      };
    }
    var willExpand = (rom.length + 0x10000) <= 0x400000;
    return {
      ok: willExpand,
      severity: willExpand ? 'warn' : 'block',
      report: overflow.length + ' text(s) exceed original length. ' +
              (willExpand
                ? 'Auto ROM expansion will be applied (max 4 MB).'
                : 'ROM expansion would exceed the 4 MB cartridge limit.')
    };
  };

  Ketor.workflows.GenesisWorkflow = GenesisWorkflow;

})(window);