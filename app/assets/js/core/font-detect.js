/* ============================================================
   Ketor -- Font / Tile Auto-Detection
   ------------------------------------------------------------
   Score-based font detection across candidate offsets.
   Returns top N candidates with preview data.

   Scoring criteria (based on ROM hacking practice):
   - Tile diversity: font tiles must differ (not all 0x00 / 0xFF)
   - Ink coverage: 20-40% of pixels on (typical for 8x8 glyphs)
   - Transition count: 5-34 (characters have reasonable edges)
   - Row usage: 2-7 rows with ink (typical for letters)
   - Palette compactness (4bpp): 2-3 ink colors typical

   Platform-aware:
   - NES/GB: CHR ROM location (after PRG banks)
   - GBA/SNES/Genesis: full ROM scan
   - NDS: scan after NitroFS header
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  var BPP_TO_BYTES = { 1: 8, 2: 16, 4: 32, 8: 64 };

  function decodeTile2bpp(rom, offset) {
    var out = new Uint8Array(64);
    if (offset < 0 || offset + 16 > rom.length) return out;
    for (var y = 0; y < 8; y++) {
      var lo = rom[offset + y] || 0;
      var hi = rom[offset + 8 + y] || 0;
      for (var x = 0; x < 8; x++) {
        var bit = 7 - x;
        out[y * 8 + x] = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
      }
    }
    return out;
  }

  function decodeTile4bpp(rom, offset) {
    var out = new Uint8Array(64);
    if (offset < 0 || offset + 32 > rom.length) return out;
    var p = 0;
    for (var i = 0; i < 32; i++) {
      var b = rom[offset + i] || 0;
      out[p++] = b & 0x0F;
      out[p++] = (b >> 4) & 0x0F;
    }
    return out;
  }

  function tileCoverage(tile) {
    var on = 0;
    for (var i = 0; i < 64; i++) if (tile[i] !== 0) on++;
    return on / 64;
  }

  function tileRowsWithInk(tile) {
    var rows = 0;
    for (var y = 0; y < 8; y++) {
      var rowInk = 0;
      for (var x = 0; x < 8; x++) if (tile[y * 8 + x] !== 0) rowInk++;
      if (rowInk > 0) rows++;
    }
    return rows;
  }

  function tileTransitions(tile) {
    var transitions = 0;
    for (var y = 0; y < 8; y++) {
      var prev = -1;
      for (var x = 0; x < 8; x++) {
        var v = tile[y * 8 + x] === 0 ? 0 : 1;
        if (prev >= 0 && v !== prev) transitions++;
        prev = v;
      }
    }
    return transitions;
  }

  function tileInkColors(tile, bpp) {
    var seen = {};
    var count = 0;
    for (var i = 0; i < 64; i++) {
      var v = tile[i];
      if (v === 0) continue;
      if (!seen[v]) { seen[v] = true; count++; }
      if (count > 4) break;
    }
    return count;
  }

  function tileSignature(tile) {
    var sig = 2166136261 >>> 0;
    for (var i = 0; i < 64; i++) {
      sig ^= tile[i] & 0xFF;
      sig = Math.imul(sig, 16777619) >>> 0;
    }
    return sig >>> 0;
  }

  /**
   * Score a single candidate offset for a given BPP.
   * @param {Uint8Array} rom
   * @param {number} offset
   * @param {number} bpp
   * @param {number} sampleCount
   * @returns {number} score (higher = better font candidate)
   */
  function scoreCandidate(rom, offset, bpp, sampleCount) {
    var bytesPerTile = BPP_TO_BYTES[bpp] || 16;
    var totalBytes = bytesPerTile * sampleCount;
    if (offset < 0 || offset + totalBytes > rom.length) return -Infinity;

    var sigSet = {};
    var transitionsAcc = 0;
    var coverageAcc = 0;
    var rowsAcc = 0;
    var tinyInkCount = 0;
    var heavyInkCount = 0;
    var paletteAcc = 0;
    var checked = 0;

    var decodeFn = (bpp === 4) ? decodeTile4bpp : decodeTile2bpp;

    for (var i = 0; i < sampleCount; i++) {
      var tileOff = offset + i * bytesPerTile;
      var tile = decodeFn(rom, tileOff);
      var cov = tileCoverage(tile);
      var rows = tileRowsWithInk(tile);
      var trans = tileTransitions(tile);

      coverageAcc += cov;
      rowsAcc += rows;
      transitionsAcc += trans;
      if (cov < 0.03) tinyInkCount++;
      if (cov > 0.72) heavyInkCount++;
      sigSet[tileSignature(tile)] = true;

      if (bpp === 4) {
        var inkColors = tileInkColors(tile, 4);
        paletteAcc += 1 - Math.min(1, Math.abs(inkColors - 2.2) / 3.8);
      }
      checked++;
    }

    if (checked === 0) return -Infinity;

    var targetCov = bpp === 4 ? 0.28 : (bpp === 2 ? 0.24 : 0.18);
    var avgCov = coverageAcc / checked;
    var avgRows = rowsAcc / checked;
    var avgTrans = transitionsAcc / checked;
    var diversity = Object.keys(sigSet).length / checked;
    var tinyInkRatio = tinyInkCount / checked;
    var heavyInkRatio = heavyInkCount / checked;

    var score = 0;
    score += 1 - Math.min(1, Math.abs(avgCov - targetCov) / Math.max(0.08, targetCov));
    score += (avgRows >= 2 && avgRows <= 7) ? 0.45 : -0.5;
    score += (avgTrans >= 5 && avgTrans <= 34) ? 0.45 : -0.5;
    score += Math.max(0, Math.min(1, (diversity - 0.3) / 0.6)) * 0.9;
    if (avgCov < 0.05 || avgCov > 0.58) score -= 1.0;
    if (avgRows < 1.7 || avgRows > 7.4) score -= 0.75;
    if (diversity < 0.22) score -= 0.9;
    if (heavyInkRatio > 0.55) score -= 1.2;
    if (tinyInkRatio > 0.65) score -= 0.9;
    if (bpp === 4 && checked > 0) score += (paletteAcc / checked) * 0.30;

    return score;
  }

  /**
   * Detect top N font candidates.
   * @param {Uint8Array} rom
   * @param {Object} options
   * @returns {Array<{offset, bpp, score, preview}>}
   */
  function detectFontCandidates(rom, options) {
    var opts = options || {};
    var topN = opts.topN || 5;
    var systemName = String(opts.systemName || '').toUpperCase();
    var sampleCount = opts.sampleCount || 32;

    var bppCandidates;
    if (systemName.indexOf('GBA') !== -1 || systemName.indexOf('SNES') !== -1 ||
        systemName.indexOf('NDS') !== -1 || systemName.indexOf('GENESIS') !== -1 ||
        systemName.indexOf('PLAYSTATION') !== -1) {
      bppCandidates = [4, 2];
    } else if (systemName.indexOf('NES') !== -1 || systemName.indexOf('GAME BOY') !== -1 ||
               systemName.indexOf('GBC') !== -1 || systemName === 'GB') {
      bppCandidates = [2, 1];
    } else {
      bppCandidates = [2, 4, 1];
    }

    var scanStep = 0x100;
    var maxOffset = rom.length - (64 * sampleCount);
    if (maxOffset <= 0) return [];

    var candidates = [];
    for (var bc = 0; bc < bppCandidates.length; bc++) {
      var bpp = bppCandidates[bc];
      var bytesPerTile = BPP_TO_BYTES[bpp];
      var step = bpp === 4 ? 0x200 : 0x100;
      for (var off = 0; off <= maxOffset; off += step) {
        var score = scoreCandidate(rom, off, bpp, sampleCount);
        if (score > -Infinity) {
          candidates.push({ offset: off, bpp: bpp, score: score });
        }
      }
    }

    candidates.sort(function (a, b) { return b.score - a.score; });

    var seen = {};
    var out = [];
    for (var i = 0; i < candidates.length && out.length < topN; i++) {
      var c = candidates[i];
      var key = c.bpp + ':' + c.offset;
      if (seen[key]) continue;
      seen[key] = true;
      var dupOffset = out.some(function (o) { return Math.abs(o.offset - c.offset) < 0x100 && o.bpp === c.bpp; });
      if (dupOffset) continue;
      out.push({
        offset: c.offset,
        bpp: c.bpp,
        score: c.score,
        preview: generatePreview(rom, c.offset, c.bpp, 16)
      });
    }
    return out;
  }

  /**
   * Generate a preview grid of tiles.
   * @param {Uint8Array} rom
   * @param {number} offset
   * @param {number} bpp
   * @param {number} count
   * @returns {{width, height, pixels}}
   */
  function generatePreview(rom, offset, bpp, count) {
    var cols = 16;
    var rows = Math.ceil(count / cols);
    var width = cols * 8;
    var height = rows * 8;
    var pixels = new Uint8ClampedArray(width * height * 4);
    var bytesPerTile = BPP_TO_BYTES[bpp] || 16;
    var decodeFn = (bpp === 4) ? decodeTile4bpp : decodeTile2bpp;
    var maxColor = bpp === 4 ? 15 : 3;

    for (var i = 0; i < count; i++) {
      var tile = decodeFn(rom, offset + i * bytesPerTile);
      var tx = (i % cols) * 8;
      var ty = Math.floor(i / cols) * 8;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var v = tile[y * 8 + x];
          var shade = Math.floor((v / maxColor) * 255);
          var px = ((ty + y) * width + (tx + x)) * 4;
          pixels[px] = shade;
          pixels[px + 1] = shade;
          pixels[px + 2] = shade;
          pixels[px + 3] = 255;
        }
      }
    }

    return { width: width, height: height, pixels: pixels };
  }


})(window);