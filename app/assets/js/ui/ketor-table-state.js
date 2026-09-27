/* ============================================================
   Ketor - Table Activity State
   ------------------------------------------------------------
   Monkey-Moore style candidate list (Offset / Values / Preview).
   Reuses legacy relative search worker (async, non-blocking).
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
  var e = R.createElement;
  var uS = R.useState;
  var uE = R.useEffect;

  function KtBox(props) {
    var id = String(props.id || 'box');
    var st = uS(props.defaultCollapsed === true);
    var collapsed = st[0];
    var setCollapsed = st[1];

    uE(function () {
      try {
        var raw = global.sessionStorage.getItem('ketor.collapse.state');
        var map = raw ? JSON.parse(raw) : {};
        if (typeof map[id] === 'boolean') setCollapsed(map[id]);
      } catch (_) { }
    }, [id]);

    function toggle() {
      var next = !collapsed;
      setCollapsed(next);
      try {
        var raw = global.sessionStorage.getItem('ketor.collapse.state');
        var map = raw ? JSON.parse(raw) : {};
        map[id] = next;
        global.sessionStorage.setItem('ketor.collapse.state', JSON.stringify(map));
      } catch (_) { }
    }

    return e('div', {
      className: 'kt-ui-box' + (collapsed ? ' kt-ui-box-collapsed' : ''),
      style: Object.assign({
        display: 'flex', flexDirection: 'column', minHeight: 0,
        border: '1px solid var(--kt-widget-border-default)',
        borderRadius: 3, background: 'var(--kt-sidebar-bg)',
        overflow: 'hidden'
      }, props.style || {})
    },
      e('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', flex: '0 0 auto',
          borderBottom: collapsed ? 'none' : '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)'
        }
      },
        e('button', {
          type: 'button', onClick: toggle,
          title: collapsed ? 'Expand' : 'Collapse',
          style: {
            width: 18, height: 18, padding: 0,
            background: 'transparent', border: 'none',
            color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 2
          }
        }, K.ui.icon(collapsed ? 'chevron-right' : 'chevron-down', { size: 12 })),
        e('div', {
          style: {
            flex: 1, minWidth: 0, fontSize: 11,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            opacity: 0.7, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis'
          }
        }, props.title || ''),
        props.actions ? e('div', { style: { display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' } }, props.actions) : null
      ),
      !collapsed ? e('div', {
        style: Object.assign({
          flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 8
        }, props.bodyStyle || {})
      }, props.children) : null
    );
  }

  K.ui.KtBox = KtBox;

  var HISTORY_KEY = 'ketor.table.history';
  var HISTORY_LIMIT = 20;

  var _state = {
    romBytes: null, romName: '', romSystem: '', romSize: 0,
    searchMode: 'relative',
    sampleText: '',
    wildcardEnabled: false,
    wildcardChar: '*',
    byteWidth: 8,
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
      var byteVal = parseInt(hex, 16);
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
      var m = u.match(/^\[UNK_([0-9A-F]{2})\]$/);
      if (!m) return 'unknown byte';
      var b = parseInt(m[1], 16);
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
        return 'ASCII "' + ascii + '"';
      }

      return 'extended byte (0x' + m[1] + ')';
    }

    if (s.length === 1) return classifyChar(s);
    return '';
  }

  function classifyChar(s) {
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
    if (_state.byteWidth !== 8) return [];
    var sample = String(result.sampleText || '');
    var wc = _state.wildcardChar.charCodeAt(0);
    if (!sample || !wc) return [];
    var data = _state.romBytes;
    if (!data) return [];
    var cap = [];
    var seen = {};
    for (var k = 0; k < sample.length; k++) {
      if (sample.charCodeAt(k) !== wc) continue;
      var pos = result.offset + k;
      if (pos < 0 || pos >= data.length) continue;
      var v = data[pos] & 0xFF;
      if (seen[v]) continue;
      seen[v] = true;
      cap.push({ pos: k, value: v, char: ruleAssignChar(v) });
    }
    return cap;
  }

  function buildPreviewFromResult(result, captured) {
    var lines = [];
    var handled = {};

    (captured || []).forEach(function (c) {
      var h = c.value.toString(16).toUpperCase().padStart(2, '0');
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
          var hx = b.toString(16).toUpperCase().padStart(2, '0');
          if (handled[hx]) continue;
          handled[hx] = true;
          lines.push(hx + '=' + String.fromCharCode(cp + lo));
        }
      } else {
        var h2 = val.toString(16).toUpperCase().padStart(2, '0');
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
        maxResults: 500
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
    _set({
      isSearching: true,
      status: 'Searching ' + lines.length + ' sample(s)...',
      results: [], selectedResultIdx: -1, previewTbl: '', capturedBytes: [],
      smartGuessMap: {}, smartGuessActive: false
    });
    pushHistory(lines.join('\n'));
    setTimeout(function () {
      try {
        var all = [];
        /* How many bytes a character takes is a property of the table, not of a setting. A table
           whose codes are four hex digits (4100=A) says the game stores two bytes a character;
           searching the samples one byte a character found nothing, so there were no results, and
           with no results the preview stayed empty - the bug on the sixteen bit rom. The search
           follows the table from now on, and the old setting is only the fallback. */
        var tableBytes = 1;
        try {
          var tableEntries = parseTbl(_state.previewTbl || '') || [];
          for (var te = 0; te < tableEntries.length; te++) {
            var entry = tableEntries[te];
            var code = String(entry && (entry.hex !== undefined ? entry.hex : (entry.code !== undefined ? entry.code : entry[0])) || '');
            if (code.length >= 4 && code.length % 2 === 0) { tableBytes = code.length / 2; break; }
          }
        } catch (e) { tableBytes = 1; }
        var maxPer = Math.max(50, Math.floor(500 / lines.length));
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var res = K.core.runMonkeyMoore(_state.romBytes, {
            mode: _state.searchMode,
            keyword: line,
            wildcardEnabled: _state.wildcardEnabled,
            wildcardChar: _state.wildcardChar,
            byteWidth: tableBytes > 1 ? tableBytes * 8 : _state.byteWidth,
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
      previewTbl: '', capturedBytes: [],
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