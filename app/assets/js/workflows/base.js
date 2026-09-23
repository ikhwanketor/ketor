/* ============================================================
   Ketor -- Base Workflow
   ------------------------------------------------------------
   Every console workflow must implement this interface.
   Ensures consistent behavior while allowing per-console
   strategies.
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.workflows = Ketor.workflows || {};

  /**
   * BaseWorkflow -- abstract class for all console workflows.
   * Do not instantiate directly; extend this class instead.
   */
  function BaseWorkflow() {
    this.name = 'Unknown';
    this.extensions = [];
    this.profile = null;
  }

  /**
   * Detect whether this workflow matches the loaded ROM.
   * Override in subclass for header-specific detection.
   * @param {Uint8Array} data - ROM bytes
   * @param {string} fileName - Original file name
   * @returns {boolean}
   */
  BaseWorkflow.prototype.detect = function (data, fileName) {
    var ext = (fileName || '').split('.').pop().toLowerCase();
    return this.extensions.indexOf(ext) !== -1;
  };

  /**
   * Return system profile: terminator, pointer size, base, etc.
   * @returns {Object}
   */
  BaseWorkflow.prototype.getSystemProfile = function () {
    return {
      name: this.name,
      terminator: [0x00],
      pointerSize: 2,
      pointerEndianness: 'little',
      pointerBase: 0,
      extensions: this.extensions,
      hasHeader: false,
      headerSize: 0
    };
  };

  /**
   * UI configuration specific to this console.
   * Used to show/hide options that are not relevant.
   * @returns {Object}
   */
  BaseWorkflow.prototype.getUIConfig = function () {
    return {
      showPaddingByte: false,
      showStrictMode: false,
      showCompression: false,
      showDecompression: false,
      defaultMinLength: 3,
      defaultMaxLength: 1024,
      recommendedExtraction: 'standard',
      extractionLabel: 'Extract Texts',
      showFontEditor: true
    };
  };

  /**
   * Help text for novice users.
   * @returns {string}
   */
  BaseWorkflow.prototype.getHelpText = function () {
    return 'Load a ROM and a table file to begin translation.';
  };

  /**
   * Extract text entries from ROM.
   * @param {Uint8Array} rom - ROM bytes
   * @param {Object} tableData - Parsed table
   * @param {Object} options - Extraction options
   * @returns {Promise<Array>}
   */
  BaseWorkflow.prototype.extractText = function (rom, tableData, options) {
    return Promise.reject(
      new Error('extractText() not implemented for ' + this.name)
    );
  };

  /**
   * Insert translated texts into ROM.
   * @param {Uint8Array} rom - ROM bytes
   * @param {Array} texts - Text entries with translations
   * @param {Object} tableData - Parsed table
   * @param {Object} options - Insertion options
   * @returns {Promise<{modifiedRom: Uint8Array, log: Array}>}
   */
  BaseWorkflow.prototype.insertText = function (rom, texts, tableData, options) {
    return Promise.reject(
      new Error('insertText() not implemented for ' + this.name)
    );
  };

  /**
   * Validate build before committing changes.
   * Override for console-specific constraints.
   * @param {Uint8Array} rom - Original ROM
   * @param {Array} texts - Text entries with translations
   * @returns {{ok: boolean, severity: string, report: string}}
   */
  BaseWorkflow.prototype.validateBuild = function (rom, texts) {
    return { ok: true, severity: 'ok', report: 'No validation constraints.' };
  };

  /**
   * Helper: find texts that overflow their original byte length.
   * @param {Array} texts
   * @param {Function} getByteLength - Optional byte length calculator
   * @returns {Array<{text: Object, overflowBy: number}>}
   */
  BaseWorkflow.prototype.findOverflowTexts = function (texts, getByteLength) {
    var overflow = [];
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!t || t.buildable === false) continue;
      if (!t.translatedText || !t.translatedText.trim()) continue;
      var len = getByteLength
        ? getByteLength(t.translatedText)
        : t.translatedText.length;
      if (len > (t.byteLength || 0)) {
        overflow.push({ text: t, overflowBy: len - (t.byteLength || 0) });
      }
    }
    return overflow;
  };

  /**
   * Systems whose text lives in a game specific character table
   * instead of ASCII. The extractor falls back to plain ASCII runs
   * when its table lookup finds nothing, which on these systems
   * mostly adds noise, so their extraction defaults turn it off.
   * Mirrors the strictTableSystems guard used by the production
   * entry point (app-ui.js). The user can still switch it back on.
   */
  Ketor.workflows.ASCII_FALLBACK_OFF_SYSTEMS = ['NES', 'SNES', 'Game Boy', 'GBC'];

  Ketor.workflows.BaseWorkflow = BaseWorkflow;

})(window);