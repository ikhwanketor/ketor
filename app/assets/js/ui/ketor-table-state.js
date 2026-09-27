/* ============================================================
   Ketor - Table Activity State
   ------------------------------------------------------------
   Monkey-Moore style candidate list (Offset / Values / Preview).
   Reuses relative search worker (async, non-blocking).
   Persists search history + active table to sessionStorage.
   ============================================================ */

/* ============================================================
   Ketor - Table Activity State (v3)
   ------------------------------------------------------------
   Monkey-Moore settings in sidebar, results in left panel top
   (3 columns: Offset / Values / Preview-in-game), preview .tbl
   (hex=char) + compare in left panel bottom, edit table in
   right panel.
   ============================================================ */

/* Ketor - Table State v4 (multi-sample + wildcard capture) */

/* ============================================================
   Ketor - Table Activity State (v5)
   ------------------------------------------------------------
   Monkey-Moore style search + wildcard capture + editable
   preview + precise auto-comment for unknown bytes.
   ============================================================ */

/* ============================================================
   Ketor - Table Activity State (v6)
   ------------------------------------------------------------
   Adds smart guess for control code labels via text-flow
   analysis. Auto-applied after search, re-run/reset available.
   ============================================================ */

/* ============================================================
   Ketor - Table Activity State (v7)
   ------------------------------------------------------------
   Adds adopt-labels-from-compare. Control byte comments are
   now neutral ("control byte, function unknown") since we
   cannot infer per-game labels without a loaded reference.
   ============================================================ */

/* ============================================================
   Ketor - Table Activity State (v12)
   ------------------------------------------------------------
   - ruleAssignChar: control bytes -> [UNK_XX] except 09 -> [TAB]
   - autoComment: enriches comment with control-code hints from
     Ketor.core.CONTROL_HINTS (toggleable via showControlHints)
   - adoptLabelsFromCompare: copy labels from loaded reference
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  var R = global.React;
  if (!R) return;
  K.table = K.table || {};
  /* KtBox, the collapsible box the table, search and hex tabs frame their panels with,
     is shared across tabs and lives in ketor-ui-box.js now, a file loaded before every
     module that calls K.ui.KtBox. The createElement / useState / useEffect aliases and
     the component itself moved there with it. */

  var HISTORY_KEY = 'ketor.table.history';
  var HISTORY_LIMIT = 20;

  var _state = {
    romBytes: null, romName: '', romSystem: '', romSize: 0,
    searchMode: 'relative',
    sampleText: '',
    wildcardEnabled: false,
    wildcardChar: '*',
    byteWidth: 8,
    /* The width the results in hand were searched with; 0 means "ask the table". */
    searchCharWidth: 0,
    endianness: 'little',
    charset: 'ASCII',
    advancedOpen: false,
    searchHistory: [],
    results: [],
    selectedResultIdx: -1,
    previewTbl: '',
    capturedBytes: [],
    compareFileName: '',
    compareTbl: '',
    editEntries: [],
    editSource: '',
    isApplied: false,
    isSearching: false,
    smartGuessMap: {},
    smartGuessActive: false,
    showControlHints: true,
    status: ''
  };

  var _listeners = new Set();
  function _set(p) {
    var changed = false, next = _state;
    Object.keys(p).forEach(function (k) {
      if (_state[k] !== p[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = p[k];
      }
    });
    if (changed) { _state = next; _notify(); }
  }
  function _notify() { _listeners.forEach(function (f) { try { f(); } catch (_) { } }); }
  function getState() { return _state; }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () { };
    _listeners.add(fn);
    return function () { _listeners.delete(fn); };
  }
  function useTable() { return R.useSyncExternalStore(subscribe, getState, getState); }

  function loadHistory() {
    try {
      var raw = global.sessionStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var a = JSON.parse(raw);
      return Array.isArray(a) ? a.slice(0, HISTORY_LIMIT) : [];
    } catch (_) { return []; }
  }
  function saveHistory(l) {
    try { global.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(l.slice(0, HISTORY_LIMIT))); } catch (_) { }
  }
  function pushHistory(v) {
    var s = String(v || '').trim();
    if (!s) return;
    var l = loadHistory().filter(function (x) { return x !== s; });
    l.unshift(s);
    if (l.length > HISTORY_LIMIT) l = l.slice(0, HISTORY_LIMIT);
    saveHistory(l);
    _set({ searchHistory: l });
  }

  /* ------------------------------------------------------------
     A table code is the bytes the game stores for one character.
     One byte (41=A) is the character and nothing else. A two byte
     code puts a padding zero beside the character, and the padding
     is not always behind: 20 00 is a space, but 00 20 is a space
     too, so the character byte is the byte that is not the padding,
     whichever side it sits on. Two real bytes name no single
     character, and that is said out loud instead of guessing one.
     ------------------------------------------------------------ */
  var PADDING_BYTE = 0x00;

  function bytesOfCode(hex) {
    var h = String(hex === undefined || hex === null ? '' : hex).replace(/\s+/g, '').toUpperCase();
    if (!h || h.length % 2 !== 0 || !/^[0-9A-F]+$/.test(h)) return null;
    var out = [];
    for (var i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    return out;
  }

  /* The byte that is the character, or -1 when the code has two real bytes. */
  function characterByteOf(hex) {
    var bytes = bytesOfCode(hex);
    if (!bytes) return NaN;
    if (bytes.length === 1) return bytes[0];
    var real = [];
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] !== PADDING_BYTE) real.push(bytes[i]);
    }
    if (real.length === 0) return PADDING_BYTE;
    if (real.length === 1) return real[0];
    return -1;
  }

  /* The codes of the table in hand: the edit table first, since that is the one
     the user brought in, then the generated preview. A search who reads a result
     back has to read it in this width. */
  function tableCodes() {
    var codes = [];
    (_state.editEntries || []).forEach(function (en) {
      if (en && en.hex) codes.push(String(en.hex));
    });
    if (codes.length) return codes;
    var entries = [];
    try { entries = parseTbl(_state.previewTbl || '') || []; } catch (_) { entries = []; }
    for (var i = 0; i < entries.length; i++) {
      codes.push(String((entries[i] && entries[i].hex) || ''));
    }
    return codes;
  }

  /* How many bytes one character takes, as the table says it: a code of four hex
     digits means two bytes a character. The setting is only the fallback. */
  function tableCharWidth() {
    var codes = tableCodes();
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i].replace(/\s+/g, '');
      if (code.length >= 4 && code.length % 2 === 0) return code.length / 2;
    }
    return _state.byteWidth === 16 ? 2 : 1;
  }

  /* The width the search that produced the results was run with. Everything that
     reads a result back - the wildcard capture, the preview table, the guess -
     uses this, so a sixteen bit result is read as sixteen bit all the way. */
  function searchCharWidth() {
    var w = Number(_state.searchCharWidth);
    if (w === 1 || w === 2) return w;
    return tableCharWidth();
  }

  /* Which byte of a two byte code holds the character: 0 when the padding is
     behind it (4100=A), 1 when the padding is in front (0041=A), -1 when the
     table does not say. */
  function tableCharIndex() {
    var codes = tableCodes();
    for (var i = 0; i < codes.length; i++) {
      var bytes = bytesOfCode(codes[i]);
      if (!bytes || bytes.length < 2) continue;
      return (bytes[0] === PADDING_BYTE && bytes[bytes.length - 1] !== PADDING_BYTE) ? 1 : 0;
    }
    return -1;
  }

  /* The code for a character byte, written the way the game stores it: two hex
     digits for a one byte table, four for a two byte table, with the padding on
     the side the loaded table uses. */
  function codeHexFor(byteValue, width, charIndex) {
    var b = byteValue & 0xFF;
    var h = b.toString(16).toUpperCase();
    if (h.length < 2) h = '0' + h;
    if (width !== 2) return h;
    return charIndex === 1 ? '00' + h : h + '00';
  }

  /* The preview follows the padding side of the table that was loaded; with no
     table to follow, the endianness setting decides which byte comes first. */
  function previewCharIndex() {
    var i = tableCharIndex();
    if (i === 0 || i === 1) return i;
    return _state.endianness === 'big' ? 1 : 0;
  }

  function parseTbl(content) {
    var lines = String(content || '').replace(/\r/g, '').split('\n');
    var out = [];
    var idx = 0;
    lines.forEach(function (line) {
      if (!line) return;
      var raw = line.trim();
      if (!raw || raw.charAt(0) === '#' || raw.charAt(0) === ';') return;
      var isLine = false, isEnd = false;
      var work = line;
      if (work.charAt(0) === '*') { isLine = true; work = work.substring(1); }
      else if (work.charAt(0) === '\\') { isEnd = true; work = work.substring(1); }
      var eq = work.indexOf('=');
      var hex, ch;
      if (eq < 0) {
        if (!isLine && !isEnd) return;
        hex = work.replace(/\s+/g, '').toUpperCase();
        ch = isLine ? '[LINE]' : '[END]';
      } else {
        hex = work.substring(0, eq).replace(/\s+/g, '').toUpperCase();
        ch = work.substring(eq + 1);
      }
      if (!/^[0-9A-F]+$/.test(hex) || hex.length % 2 !== 0) return;
      if (isLine) ch = '[LINE]';
      if (isEnd && (!ch || ch.trim() === '')) ch = '[END]';
      if (ch.toUpperCase() === '[SPACE]') ch = ' ';
      idx++;
      /* The comment and its hints talk about the character byte, which for a
         padded two byte code is the byte that is not the padding. */
      var charByte = characterByteOf(hex);
      var byteVal = charByte === -1 ? NaN : charByte;
      out.push({
        id: 'e' + idx, hex: hex, char: ch,
        bytes: (hex.match(/.{1,2}/g) || []).join(' '),
        comment: autoComment(ch, byteVal),
        isLine: isLine, isEnd: isEnd
      });
    });
    return out;
  }

  function autoComment(ch, byteVal) {
    var s = String(ch || '');
    var u = s.toUpperCase();

    if (u === '[SPACE]' || s === ' ') return 'space';

    if (u === '[LINE]' || u === '[NEWLINE]') {
      if (_state.showControlHints && Number.isFinite(byteVal)) {
        if (byteVal === 0x0A) return 'line break — ASCII LF (95%)';
        if (byteVal === 0x0D) return 'line break — ASCII CR (90%)';
        if (byteVal === 0xFE) return 'page break — custom (80%)';
        return 'line break — custom byte 0x' + byteVal.toString(16).toUpperCase() + ' (70%)';
      }
      return 'line break';
    }

    if (u === '[END]' || u === '[NULL]') {
      if (_state.showControlHints && Number.isFinite(byteVal)) {
        if (byteVal === 0x00) return 'end of text — NULL terminator (80%)';
        if (byteVal === 0x1A) return 'end of file (70%)';
        if (byteVal === 0xFF) return 'end of text — retro (65%)';
        if (byteVal === 0x0A || byteVal === 0x0D) return 'end of text — with padding (60%)';
        return 'end of text';
      }
      return 'end of text';
    }

    if (u === '[START]') return 'start marker';

    if (u === '[TAB]') {
      if (_state.showControlHints) return 'paragraph / page break (85%)';
      return 'tab';
    }

    if (u.indexOf('[UNK_') === 0) {
      /* Two digits is one byte. Four or more is a code whose padding may sit on
         either side, so its character byte is the byte that is not padding. */
      var m = u.match(/^\[UNK_([0-9A-F]{2,})\]$/);
      if (!m) return 'unknown byte';
      var codeHex = m[1];
      var b = characterByteOf(codeHex);
      if (b === -1) return 'unknown code (0x' + codeHex + ') - two real bytes, no single character byte';
      if (!Number.isFinite(b)) return 'unknown byte';

      if (b === 0x09) return 'tab';

      if (b < 0x20) {
        if (_state.showControlHints && K.core && K.core.CONTROL_HINTS && K.core.CONTROL_HINTS[b]) {
          return K.core.CONTROL_HINTS[b];
        }
        return 'control byte, function unknown';
      }

      if (b >= 0x20 && b <= 0x7E) {
        var ascii = String.fromCharCode(b);
        if (b >= 65 && b <= 90) return 'uppercase letter';
        if (b >= 97 && b <= 122) return 'lowercase letter';
        if (b >= 48 && b <= 57) return 'digit';
        if (b === 0x20) return 'space';
        return 'ASCII "' + ascii + '"';
      }

      return 'extended byte (0x' + b.toString(16).toUpperCase().padStart(2, '0') + ')';
    }

    if (s.length === 1) return classifyChar(s);
    return '';
  }

  function classifyChar(s) {
    if (s === ' ') return 'space';
    var cp = s.charCodeAt(0);
    if (cp >= 65 && cp <= 90) return 'uppercase letter';
    if (cp >= 97 && cp <= 122) return 'lowercase letter';
    if (cp >= 48 && cp <= 57) return 'digit';
    if ('.!?'.indexOf(s) >= 0) return 'sentence punctuation';
    if (',;:'.indexOf(s) >= 0) return 'punctuation';
    if ('()[]{}<>'.indexOf(s) >= 0) return 'bracket';
    if ('"\u0027`'.indexOf(s) >= 0) return 'quote';
    if ('-+*/\\'.indexOf(s) >= 0) return 'math symbol';
    if ('@#$%&'.indexOf(s) >= 0) return 'special character';
    if ('=~^|'.indexOf(s) >= 0) return 'operator';
    if (s === '_') return 'underscore';
    return '';
  }

  function entriesToTbl(entries) {
    return (entries || []).map(function (en) {
      var prefix = '';
      if (en.isLine) prefix = '*';
      if (en.isEnd) prefix = '\\';
      var ch = en.char || '';
      if (ch === ' ') ch = '[SPACE]';
      return prefix + en.hex + '=' + ch;
    }).join('\n');
  }

  function ruleAssignChar(v) {
    var b = v & 0xFF;
    if (b === 0x20) return ' ';
    if (b === 0x09) return '[TAB]';
    if (b >= 0x21 && b <= 0x7E) {
      if (b === 0x5B || b === 0x5D || b === 0x5C) {
        return '[UNK_' + b.toString(16).toUpperCase().padStart(2, '0') + ']';
      }
      return String.fromCharCode(b);
    }
    return '[UNK_' + b.toString(16).toUpperCase().padStart(2, '0') + ']';
  }

  function captureWildcardBytes(result) {
    if (!_state.wildcardEnabled) return [];
    var sample = String(result.sampleText || '');
    var wc = _state.wildcardChar.charCodeAt(0);
    if (!sample || !wc) return [];
    var data = _state.romBytes;
    if (!data) return [];
    /* A character can be two bytes wide, so a wildcard sits width bytes into the
       sample and the code it captured is the whole code, not one loose byte. */
    var width = searchCharWidth();
    var cap = [];
    var seen = {};
    for (var k = 0; k < sample.length; k++) {
      if (sample.charCodeAt(k) !== wc) continue;
      var pos = result.offset + k * width;
      if (pos < 0 || pos + width > data.length) continue;
      var code = '';
      for (var w = 0; w < width; w++) code += codeHexFor(data[pos + w], 1, 0);
      if (seen[code]) continue;
      seen[code] = true;
      var cb = characterByteOf(code);
      cap.push({
        pos: k,
        code: code,
        value: cb === -1 ? null : cb,
        char: cb === -1 ? '[UNK_' + code + ']' : ruleAssignChar(cb)
      });
    }
    return cap;
  }

  function buildPreviewFromResult(result, captured) {
    var lines = [];
    var handled = {};
    /* The preview table is written in the width of the search that produced it:
       one byte a character gives 41=A, two bytes gives 4100=A, which is the code
       the game stores and the code the search and the insert read back. */
    var width = searchCharWidth();
    var charIndex = previewCharIndex();
    var codeOf = function (b) { return codeHexFor(b, width, charIndex); };

    (captured || []).forEach(function (c) {
      var h = c.code || codeOf(c.value);
      if (handled[h]) return;
      handled[h] = true;
      var ch = c.char;
      if (ch === ' ') ch = '[SPACE]';
      lines.push(h + '=' + ch);
    });

    var keys = Object.keys(result.values || {});
    keys.sort();
    keys.forEach(function (key) {
      var cp = key.charCodeAt(0);
      var val = (result.values[key] & 0xFF);
      if (cp === 65 || cp === 97) {
        for (var lo = 0; lo < 26; lo++) {
          var b = (val + lo) & 0xFF;
          var hx = codeOf(b);
          if (handled[hx]) continue;
          handled[hx] = true;
          lines.push(hx + '=' + String.fromCharCode(cp + lo));
        }
      } else {
        var h2 = codeOf(val);
        if (handled[h2]) return;
        handled[h2] = true;
        lines.push(h2 + '=' + key);
      }
    });
    return lines.join('\n');
  }

  function setRomFromLoad(result, systemName) {
    _set({
      romBytes: result.data || null,
      romName: result.name || '',
      romSystem: systemName || 'Unknown',
      romSize: result.size || 0,
      results: [], selectedResultIdx: -1, previewTbl: '', capturedBytes: [],
      searchCharWidth: 0,
      compareFileName: '', compareTbl: '',
      editEntries: [], editSource: '', isApplied: false,
      smartGuessMap: {}, smartGuessActive: false,
      status: 'ROM ready.'
    });
  }

  function setSearchMode(v) { _set({ searchMode: v === 'value-scan' ? 'value-scan' : 'relative' }); }
  function setSampleText(v) { _set({ sampleText: String(v || '') }); }
  function setWildcardEnabled(v) { _set({ wildcardEnabled: v === true }); }
  function setWildcardChar(v) {
    var s = String(v || '');
    var c = s.length > 0 ? s.charAt(0) : '*';
    _set({ wildcardChar: c });
  }
  function setByteWidth(v) { _set({ byteWidth: Number(v) === 16 ? 16 : 8 }); }
  function setEndianness(v) { _set({ endianness: v === 'big' ? 'big' : 'little' }); }
  function setCharset(v) { _set({ charset: String(v || 'ASCII') }); }
  function toggleAdvanced() { _set({ advancedOpen: !_state.advancedOpen }); }
  function setShowControlHints(v) { _set({ showControlHints: v !== false }); }

  function setPreviewTbl(value) {
    _set({ previewTbl: String(value == null ? '' : value) });
  }

  function _runDetection(results) {
    if (!K.core || typeof K.core.detectControlCodes !== 'function') return {};
    try {
      return K.core.detectControlCodes(_state.romBytes, results, {
        maxResults: 500,
        /* The scan reads the sample as codes of the table's width, or a sixteen
           bit sample ends halfway through a character. */
        charWidth: searchCharWidth(),
        charByteOffset: previewCharIndex()
      });
    } catch (_) { return {}; }
  }

  function _applyGuess(previewTbl, guessMap) {
    if (!K.core || typeof K.core.applyGuessToPreview !== 'function') return previewTbl;
    try {
      return K.core.applyGuessToPreview(previewTbl, guessMap);
    } catch (_) { return previewTbl; }
  }

  function runSearch() {
    if (!_state.romBytes) { _set({ status: 'Load ROM first.' }); return; }
    var text = String(_state.sampleText || '');
    var lines = text.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    if (!lines.length) { _set({ status: 'Enter text in-game (one per line).' }); return; }
    /* How many bytes a character takes is a property of the table, not of a setting. A table
       whose codes are four hex digits (4100=A) says the game stores two bytes a character;
       searching the samples one byte a character found nothing, so there were no results, and
       with no results the preview stayed empty - the bug on the sixteen bit rom. The width is
       read from the table before this search clears the preview, and it is kept, because the
       capture, the preview and the guess all have to read the result back the same way. */
    var searchWidth = tableCharWidth();
    _set({
      isSearching: true,
      status: 'Searching ' + lines.length + ' sample(s)...',
      results: [], selectedResultIdx: -1, previewTbl: '', capturedBytes: [],
      smartGuessMap: {}, smartGuessActive: false,
      searchCharWidth: searchWidth
    });
    pushHistory(lines.join('\n'));
    setTimeout(function () {
      try {
        var all = [];
        var maxPer = Math.max(50, Math.floor(500 / lines.length));
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var res = K.core.runMonkeyMoore(_state.romBytes, {
            mode: _state.searchMode,
            keyword: line,
            wildcardEnabled: _state.wildcardEnabled,
            wildcardChar: _state.wildcardChar,
            byteWidth: searchWidth * 8,
            endianness: _state.endianness,
            maxResults: maxPer
          });
          for (var j = 0; j < res.results.length; j++) {
            var r = res.results[j];
            r.sampleIndex = i;
            r.sampleText = line;
            all.push(r);
          }
        }
        var previewTbl = '';
        var captured = [];
        var guessMap = {};
        var guessCount = 0;
        if (all.length > 0) {
          captured = captureWildcardBytes(all[0]);
          previewTbl = buildPreviewFromResult(all[0], captured);
          guessMap = _runDetection(all);
          guessCount = Object.keys(guessMap).length;
          if (guessCount > 0) {
            previewTbl = _applyGuess(previewTbl, guessMap);
          }
        }
        var statusMsg = 'Found ' + all.length + ' result(s) from ' + lines.length + ' sample(s).';
        if (guessCount > 0) statusMsg += ' Smart guess: ' + guessCount + ' control code(s) detected.';
        _set({
          results: all,
          selectedResultIdx: all.length > 0 ? 0 : -1,
          previewTbl: previewTbl,
          capturedBytes: captured,
          smartGuessMap: guessMap,
          smartGuessActive: guessCount > 0,
          isSearching: false,
          status: statusMsg
        });
      } catch (err) {
        _set({ isSearching: false, status: 'Search failed: ' + (err.message || '') });
      }
    }, 10);
  }

  function clearResults() {
    _set({
      results: [], selectedResultIdx: -1, previewTbl: '', capturedBytes: [],
      smartGuessMap: {}, smartGuessActive: false,
      searchCharWidth: 0,
      status: 'Results cleared.'
    });
  }

  function selectResult(idx) {
    var i = Number(idx);
    if (!Number.isFinite(i) || i < 0 || i >= _state.results.length) return;
    var r = _state.results[i];
    var captured = captureWildcardBytes(r);
    var previewTbl = buildPreviewFromResult(r, captured);
    if (_state.smartGuessActive && Object.keys(_state.smartGuessMap).length > 0) {
      previewTbl = _applyGuess(previewTbl, _state.smartGuessMap);
    }
    _set({
      selectedResultIdx: i,
      previewTbl: previewTbl,
      capturedBytes: captured
    });
  }

  function runSmartGuess() {
    if (!_state.romBytes || !_state.results.length) {
      _set({ status: 'No results to analyze.' });
      return;
    }
    var guessMap = _runDetection(_state.results);
    var guessCount = Object.keys(guessMap).length;
    var previewTbl = _state.previewTbl;
    var selectedIdx = _state.selectedResultIdx;
    if (selectedIdx >= 0 && selectedIdx < _state.results.length) {
      var r = _state.results[selectedIdx];
      var captured = captureWildcardBytes(r);
      previewTbl = buildPreviewFromResult(r, captured);
      if (guessCount > 0) previewTbl = _applyGuess(previewTbl, guessMap);
    }
    _set({
      smartGuessMap: guessMap,
      smartGuessActive: guessCount > 0,
      previewTbl: previewTbl,
      status: guessCount > 0
        ? 'Smart guess applied: ' + guessCount + ' control code(s) detected.'
        : 'Smart guess: no control codes detected.'
    });
  }

  function resetSmartGuess() {
    var selectedIdx = _state.selectedResultIdx;
    if (selectedIdx < 0 || selectedIdx >= _state.results.length) {
      _set({ smartGuessMap: {}, smartGuessActive: false, status: 'Smart guess reset.' });
      return;
    }
    var r = _state.results[selectedIdx];
    var captured = captureWildcardBytes(r);
    var previewTbl = buildPreviewFromResult(r, captured);
    _set({
      smartGuessMap: {},
      smartGuessActive: false,
      previewTbl: previewTbl,
      status: 'Smart guess reset.'
    });
  }

  function adoptLabelsFromCompare() {
    if (!_state.compareTbl) {
      _set({ status: 'Load a compare .tbl first.' });
      return;
    }
    if (!_state.previewTbl) {
      _set({ status: 'No preview to adopt into.' });
      return;
    }

    var compareEntries = parseTbl(_state.compareTbl);
    if (!compareEntries.length) {
      _set({ status: 'Compare table has no valid entries.' });
      return;
    }

    var loadedMap = {};
    var labelOwner = {};
    compareEntries.forEach(function (en) {
      var b = parseInt(en.hex, 16);
      if (!Number.isFinite(b)) return;
      if (en.char === ' ' || en.char === '[SPACE]') return;
      if (loadedMap[b] === undefined) {
        loadedMap[b] = en.char;
        if (labelOwner[en.char] === undefined) {
          labelOwner[en.char] = b;
        }
      }
    });

    var lines = String(_state.previewTbl).split('\n');
    var adoptedCount = 0;
    var downgradedCount = 0;

    var newLines = lines.map(function (line) {
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

      var b = parseInt(hex, 16);
      if (!Number.isFinite(b)) return line;

      if (loadedMap[b] !== undefined) {
        adoptedCount++;
        return prefix + hex + '=' + loadedMap[b];
      }

      if (ch.charAt(0) === '[' && ch.charAt(ch.length - 1) === ']') {
        var owner = labelOwner[ch];
        if (owner !== undefined && owner !== b) {
          downgradedCount++;
          return prefix + hex + '=[UNK_' + hex + ']';
        }
      }

      return line;
    });

    var statusMsg = 'Adopted ' + adoptedCount + ' label' + (adoptedCount === 1 ? '' : 's') + ' from compare.';
    if (downgradedCount > 0) {
      statusMsg += ' ' + downgradedCount + ' byte' + (downgradedCount === 1 ? '' : 's') + ' downgraded (conflict).';
    }

    _set({
      previewTbl: newLines.join('\n'),
      smartGuessMap: loadedMap,
      smartGuessActive: false,
      status: statusMsg
    });
  }

  function loadTableFile(content, fileName) {
    var entries = parseTbl(content);
    if (!entries.length) { _set({ status: 'File has no valid entries.' }); return; }
    _set({
      editEntries: entries,
      editSource: 'file:' + (fileName || 'unknown.tbl'),
      isApplied: false,
      status: 'Loaded ' + entries.length + ' entries from ' + (fileName || 'file') + '.'
    });
  }

  function loadCompareFile(content, fileName) {
    _set({
      compareFileName: fileName || '',
      compareTbl: String(content || ''),
      status: 'Loaded compare file: ' + (fileName || '') + '.'
    });
  }
  function clearCompare() { _set({ compareFileName: '', compareTbl: '', status: 'Compare cleared.' }); }

  function applyPreviewToEditTable() {
    if (!_state.previewTbl) { _set({ status: 'No preview to apply.' }); return; }
    var entries = parseTbl(_state.previewTbl);
    if (!entries.length) { _set({ status: 'Preview has no valid entries.' }); return; }
    _set({
      editEntries: entries,
      editSource: 'generated',
      isApplied: false,
      status: 'Applied preview (' + entries.length + ' entries) to Edit Table.'
    });
  }

  function updateEditEntry(id, patch) {
    var next = _state.editEntries.map(function (en) {
      if (en.id !== id) return en;
      var m = Object.assign({}, en, patch || {});
      if (typeof m.hex === 'string') m.bytes = (m.hex.match(/.{1,2}/g) || []).join(' ');
      var charChanged = patch && patch.char !== undefined;
      var hexChanged = patch && patch.hex !== undefined;
      var userComment = patch && patch.comment !== undefined;
      if ((charChanged || hexChanged) && !userComment) {
        var b = parseInt(m.hex, 16);
        m.comment = autoComment(m.char, b);
      }
      return m;
    });
    _set({ editEntries: next });
  }
  function addEditEntry() {
    var next = _state.editEntries.concat([{
      id: 'e_new_' + Date.now(), hex: '00', char: '', bytes: '00',
      comment: '', isLine: false, isEnd: false
    }]);
    _set({ editEntries: next });
  }
  function removeEditEntry(id) {
    _set({ editEntries: _state.editEntries.filter(function (en) { return en.id !== id; }) });
  }
  function sortEditTable() {
    var next = _state.editEntries.slice().sort(function (a, b) {
      var ah = parseInt(a.hex, 16), bh = parseInt(b.hex, 16);
      if (isNaN(ah) || isNaN(bh)) return 0;
      return ah - bh;
    });
    _set({ editEntries: next });
  }
  function clearEditTable() {
    _set({ editEntries: [], editSource: '', isApplied: false, status: 'Edit Table cleared.' });
  }
  function downloadEditTable() {
    if (!_state.editEntries.length) { _set({ status: 'Nothing to download.' }); return; }
    var content = entriesToTbl(_state.editEntries);
    var base = (_state.romName || 'ketor').replace(/\.[^.]+$/, '');
    var name = base + '.tbl';
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _set({ status: 'Downloaded ' + name });
  }

  function applyForRom() {
    if (!_state.editEntries.length) { _set({ status: 'Edit Table is empty.' }); return; }
    _set({ isApplied: true, status: 'Table applied for ROM. Proceeding to Search Text...' });
    try {
      global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
        detail: { activity: 'search', source: 'table-apply' }
      }));
    } catch (_) { }
  }

  function reset() {
    _set({
      romBytes: null, romName: '', romSystem: '', romSize: 0,
      sampleText: '', results: [], selectedResultIdx: -1,
      previewTbl: '', capturedBytes: [], searchCharWidth: 0,
      compareFileName: '', compareTbl: '',
      editEntries: [], editSource: '', isApplied: false,
      isSearching: false, smartGuessMap: {}, smartGuessActive: false,
      status: ''
    });
  }

  _set({ searchHistory: loadHistory() });

  K.table.getState = getState;
  K.table.subscribe = subscribe;
  K.table.useTable = useTable;
  K.table.setRomFromLoad = setRomFromLoad;
  K.table.setSearchMode = setSearchMode;
  K.table.setSampleText = setSampleText;
  K.table.setWildcardEnabled = setWildcardEnabled;
  K.table.setWildcardChar = setWildcardChar;
  K.table.setByteWidth = setByteWidth;
  K.table.setEndianness = setEndianness;
  K.table.setCharset = setCharset;
  K.table.toggleAdvanced = toggleAdvanced;
  K.table.setShowControlHints = setShowControlHints;
  K.table.runSearch = runSearch;
  K.table.clearResults = clearResults;
  K.table.selectResult = selectResult;
  K.table.runSmartGuess = runSmartGuess;
  K.table.resetSmartGuess = resetSmartGuess;
  K.table.adoptLabelsFromCompare = adoptLabelsFromCompare;
  K.table.loadTableFile = loadTableFile;
  K.table.loadCompareFile = loadCompareFile;
  K.table.clearCompare = clearCompare;
  K.table.applyPreviewToEditTable = applyPreviewToEditTable;
  K.table.setPreviewTbl = setPreviewTbl;
  K.table.updateEditEntry = updateEditEntry;
  K.table.addEditEntry = addEditEntry;
  K.table.removeEditEntry = removeEditEntry;
  K.table.sortEditTable = sortEditTable;
  K.table.clearEditTable = clearEditTable;
  K.table.downloadEditTable = downloadEditTable;
  K.table.applyForRom = applyForRom;
  K.table.reset = reset;

})(window);