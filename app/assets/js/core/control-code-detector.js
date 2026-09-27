/* ============================================================
   Ketor - Control Code Detector
   ------------------------------------------------------------
   Text-flow analysis: infer [LINE] vs [END] from byte position
   relative to alphanumeric characters in surrounding text.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector
   ------------------------------------------------------------
   Conservative text-flow analysis. Only labels [LINE] / [END]
   when confidence >= 70% and margin >= 15%. Other control
   bytes stay as [UNK_XX] for manual review or adoption from
   a loaded reference table.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v2)
   ------------------------------------------------------------
   Run-length analysis. A control byte is classified as [LINE]
   if the byte right after it starts a text run (>=5 printable
   chars). It is [END] if the following bytes are non-printable
   (padding, null, or another control byte). Ambiguous bytes
   stay unknown.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v3)
   ------------------------------------------------------------
   Sample-bounded analysis:
   - Only bytes inside the matched sample range are analyzed.
   - [END] requires 2+ consecutive null bytes after (padding).
   - [LINE] requires a printable byte immediately after.
   - Threshold 70% for both; ambiguous bytes stay unknown.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v4)
   ------------------------------------------------------------
   Position-aware analysis. A control byte that appears mostly
   at the END of a sample is [END]; one that appears in the
   MIDDLE (with printable text after) is [LINE]. Null bytes
   and terminators are skipped. minOccurrences lowered to 2.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v5)
   ------------------------------------------------------------
   Analyzes bytes at wildcard positions in each search result.
   - [END] when followed by two consecutive nulls (padding).
   - [LINE] when followed by a printable byte.
   - Ambiguous bytes (param-followed) stay unknown.
   minOccurrences lowered to 2.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v6)
   ------------------------------------------------------------
   Per-sample scan. [LINE] when followed by printable text;
   [END] when followed by null or another control byte (start
   of a new text entry). minOccurrences = 1.
   ============================================================ */

   /* ============================================================
   Ketor - Control Code Detector (v7)
   ------------------------------------------------------------
   Conservative. Only very strong patterns:
   - [END]: byte followed by two nulls (padding).
   - [LINE]: byte followed by printable directly, OR by two
     control bytes then printable (common [LINE][PARAM] chain).
   All other control bytes stay unknown.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v8)
   ------------------------------------------------------------
   Data-driven rules based on real Castlevania AoS patterns:
   - [END]: next1 == 0x00 && next2 == 0x00 (padding).
   - [LINE]: next1 printable directly, OR next1+next2 are both
     control bytes (except 0x09) followed by printable.
   - 0x09 is a standalone tab marker, never part of a chain.
   All other control bytes stay unknown for manual review or
   adoption from a loaded reference table.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v9)
   ------------------------------------------------------------
   Fixed: 0x09 is included as part of a control chain (05 09 4D).
   minOccurrences lowered to 1 so single-occurrence [END] bytes
   are still classified.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v10)
   ------------------------------------------------------------
   Special-case for 0x0A: because it is ambiguous by nature
   (some games use it as [END], others as [LINE]), when it
   appears at all we classify it, defaulting to [END] when
   no strong pattern matches. Other bytes unchanged from v9.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v11)
   ------------------------------------------------------------
   0x0A and 0x0D are treated as [LINE] by default (ASCII LF/CR
   standard). If followed by padding (00 00), classified as
   [END] to handle games that use LF as end-of-text.
   0x09 is [TAB]. Other control bytes follow context rules.
   ============================================================ */

/* ============================================================
   Ketor - Control Code Detector (v12)
   ------------------------------------------------------------
   Four layers:
   1) Universal labels from ASCII / cross-game consensus.
   2) Medium-confidence labels (retro standards).
   3) Context override (padding evidence) for ambiguous bytes.
   4) Comment hints exposed via Ketor.core.CONTROL_HINTS.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var HINTS = {
    0x00: 'end of text — NULL terminator (80%)',
    0x01: 'likely [COLOR] command, with color parameter (65%)',
    0x02: 'likely [SOUND] SFX trigger (50%)',
    0x03: 'likely [PLAYER] name variable (60%)',
    0x04: 'likely [SPEED] text speed, with value (55%)',
    0x05: 'likely [DELAY] pause command, with duration (60%)',
    0x06: 'likely [LINE] custom line break (70%)',
    0x07: 'likely [BELL] sound alert (40%)',
    0x08: 'likely [BACKSPACE] delete char (30%)',
    0x09: 'paragraph / page break (85%)',
    0x0A: 'line break — ASCII LF (95%)',
    0x0B: 'likely [TAB-V] vertical tab (20%)',
    0x0C: 'likely [CLEAR] clear text box (75%)',
    0x0D: 'line break — ASCII CR (90%)',
    0x0E: 'likely [FONT] change font (50%)',
    0x0F: 'likely [ICON] symbol trigger (45%)',
    0x1A: 'end of file — EOF (70%)',
    0xFE: 'page break — custom (80%)',
    0xFF: 'end of text — retro terminator (65%)'
  };

  function isPrintable(b) { return b >= 0x20 && b <= 0x7E; }
  function isControl(b) { return b > 0 && b < 0x20; }

  function detectControlCodes(romBytes, results, options) {
    var opts = options || {};
    var maxResults = Math.min(Number(opts.maxResults) || 500, results ? results.length : 0);

    if (!romBytes || !results || !results.length) return {};

    /* A table can put two bytes in one character. The scan then has to read the
       sample as codes: the code that follows is a whole code away, and which of
       its bytes is the character depends on the side the padding sits on. With
       one byte a character this is the byte right after, exactly as before. */
    var charWidth = Number(opts.charWidth) === 2 ? 2 : 1;
    var charByteOffset = Number(opts.charByteOffset) === 1 ? 1 : 0;
    var codeByteAt = function (codeStart) {
      var at = codeStart + charByteOffset;
      return (at >= 0 && at < romBytes.length) ? (romBytes[at] & 0xFF) : -1;
    };

    var stats = {};

    for (var r = 0; r < maxResults; r++) {
      var result = results[r];
      if (!result) continue;
      var offset = Number(result.offset);
      if (!Number.isFinite(offset) || offset < 0) continue;

      var sampleLen = String(result.sampleText || '').length;
      if (sampleLen < 3) continue;

      var sampleEnd = Math.min(romBytes.length, offset + sampleLen * charWidth);

      for (var i = offset; i < sampleEnd; i++) {
        var b = romBytes[i] & 0xFF;
        if (b === 0x00 || b > 0x1F) continue;

        if (!stats[b]) stats[b] = { total: 0, paddingAfter: 0, printableAfter: 0, chainAfter: 0 };
        stats[b].total++;

        /* The code this byte belongs to, then the character byte of the codes that
           come after it: a lone padding zero is not the end of the text. */
        var codeStart = offset + Math.floor((i - offset) / charWidth) * charWidth;
        var n1 = codeByteAt(codeStart + charWidth);
        var n2 = codeByteAt(codeStart + charWidth * 2);
        var n3 = codeByteAt(codeStart + charWidth * 3);

        if (n1 === 0x00 && n2 === 0x00) stats[b].paddingAfter++;
        if (isPrintable(n1)) stats[b].printableAfter++;
        if (isControl(n1) && isControl(n2) && isPrintable(n3)) stats[b].chainAfter++;
      }
    }

    var out = {};

    // Layer 1 — universal certainty
    out[0x09] = { label: '[TAB]', confidence: 0.85 };
    out[0x0A] = { label: '[LINE]', confidence: 0.95 };
    out[0x0D] = { label: '[LINE]', confidence: 0.90 };

    // Layer 2 — medium confidence
    out[0xFE] = { label: '[LINE]', confidence: 0.80 };
    out[0x1A] = { label: '[END]', confidence: 0.70 };

    // Layer 3 — contextual override
    Object.keys(stats).forEach(function (k) {
      var b = parseInt(k, 10);
      if (!Number.isFinite(b)) return;
      var s = stats[k];
      if (s.total < 1) return;

      var padRatio = s.paddingAfter / s.total;
      var printRatio = s.printableAfter / s.total;
      var chainRatio = s.chainAfter / s.total;

      // Override 0A / 0D to [END] when padding evidence is strong
      if (b === 0x0A || b === 0x0D) {
        if (padRatio >= 0.5) {
          out[b] = { label: '[END]', confidence: 0.6, occurrences: s.total };
        } else {
          out[b].occurrences = s.total;
        }
        return;
      }

      // Custom bytes (excluding universal ones already set)
      if (b === 0x09 || b === 0xFE || b === 0x1A) return;

      if (padRatio >= 0.75) {
        out[b] = { label: '[END]', confidence: padRatio, occurrences: s.total };
      } else if (printRatio >= 0.75 || chainRatio >= 0.75) {
        out[b] = { label: '[LINE]', confidence: Math.max(printRatio, chainRatio), occurrences: s.total };
      }
    });

    return out;
  }

  function applyGuessToPreview(previewTbl, guessMap) {
    if (!previewTbl || !guessMap) return previewTbl;
    var lines = String(previewTbl).split('\n');
    var out = lines.map(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === '#' || trimmed.charAt(0) === ';') return line;

      var prefix = '';
      var work = trimmed;
      if (work.charAt(0) === '*') { prefix = '*'; work = work.substring(1); }
      else if (work.charAt(0) === '\\') { prefix = '\\'; work = work.substring(1); }

      var eq = work.indexOf('=');
      if (eq < 0) return line;
      var hex = work.substring(0, eq).toUpperCase();
      var ch = work.substring(eq + 1);

      var m = ch.match(/^\[UNK_([0-9A-F]{2})\]$/);
      if (!m) return line;
      var byteVal = parseInt(m[1], 16);
      var guess = guessMap[byteVal];
      if (!guess) return line;
      return prefix + hex + '=' + guess.label;
    });
    return out.join('\n');
  }

  K.core.detectControlCodes = detectControlCodes;
  K.core.applyGuessToPreview = applyGuessToPreview;
  K.core.CONTROL_HINTS = HINTS;

})(window);