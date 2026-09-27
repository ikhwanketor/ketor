/* Ketor Translate State - shared store for translation activity */
/* ============================================================
   Ketor Translate State (v2)
   ------------------------------------------------------------
   Batch 16: reads and writes text entries from K.search
   (unified registry). No longer extracts on its own — that
   is done by Search Text activity. Retains Build / Export /
   Auto-translate responsibilities.
   ============================================================ */

/* ============================================================
   Ketor Translate State (v3)
   ------------------------------------------------------------
   Batch 19: measureBytes() reports the exact number of bytes a
   translation will occupy, using the same master map, token
   filter and encoder options the build worker uses, so the size
   shown next to a box can never disagree with the ROM that gets
   written. isTranslating drives the Auto Translate button.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  var R = global.React;
  if (!R) return;
  K.translate = K.translate || {};

  var _state = {
    romBytes: null, romName: '', romSystem: '', romSize: 0,
    tableData: null, tableContent: '',
    filter: '', page: 1, perPage: 20,
    selectedOffset: null,
    modifiedRom: null,
    isBusy: false, status: '', progress: 0,
    isTranslating: false, translatingOffset: null,
    compileScope: 'all',
    batch: { running: false, done: 0, total: 0 },
    sourceLang: 'en', targetLang: 'id',
    providerMode: 'free',
    providerId: 'openai',
    providerEndpoint: '',
    providerModel: 'gpt-4o-mini',
    // Compile report. rebuildRom() already relocates an over-long text into
    // free space and repoints the game's pointer table; these keys keep its
    // relocationLog and a short summary so the UI can show what happened
    // instead of throwing the report away.
    buildLog: [],
    buildSummary: null,
    /* Options the Pointers & Insert Range panel owns. They decide how a record that
       outgrows its room is handled: keep every record where it is and pay with the
       padding around it (default), move the record to free space and rewrite only
       its own table entry (allowMessageShift true), or refuse the growth and report
       it (allowMessageShift false). */
    buildOptions: {},
    /* Pointers & Insert Range (batch 94). pointerReport holds the candidates the
       structure detector found for this rom, so the panel can offer them; the table
       the engine will actually use lives in buildOptions.knownPointerTable. */
    pointerReport: [],
    gameProfile: null,
    gameProfileSource: '',
    pointerNote: ''
  };

  var _listeners = new Set();
  var _workers = { table: null, build: null };
  var _lastBuildPatches = 0;
  var _pendingBuildCount = 0;
  var _lastBuiltTexts = {};
  var _pendingTableName = null;

  function _set(patch) {
    var changed = false;
    var next = _state;
    Object.keys(patch).forEach(function (k) {
      if (_state[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = patch[k];
      }
    });
    if (changed) { _state = next; _notify(); }
  }

  function _notify() {
    _listeners.forEach(function (fn) { try { fn(); } catch (_) { } });
  }

  function getState() { return _state; }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () { };
    _listeners.add(fn);
    return function () { _listeners.delete(fn); };
  }
  function useTranslate() {
    return R.useSyncExternalStore(subscribe, getState, getState);
  }

  function _ensureWorkers() {
    var lg = K.legacy || {};
    if (!_workers.table && typeof lg.createTableWorker === 'function') {
      _workers.table = lg.createTableWorker();
      _workers.table.onmessage = _onTableMsg;
    }
    if (!_workers.build && typeof lg.createBuildWorker === 'function') {
      _workers.build = lg.createBuildWorker();
      _workers.build.onmessage = _onBuildMsg;
    }
  }

  // ---- Table ----
  function loadTableContent(content, fileName) {
    _set({ tableContent: content });
    _ensureWorkers();
    if (!_workers.table) { _set({ status: 'Table worker unavailable.' }); return; }
    _pendingTableName = fileName || 'custom.tbl';
    _workers.table.postMessage({
      type: 'parseTable',
      payload: { content: content, fileName: _pendingTableName, parseId: Date.now() }
    });
  }

  function _onTableMsg(ev) {
    var d = ev.data || {};
    if (d.type !== 'tableParsed') return;
    if (!d.entryCount) {
      _set({ status: 'Table empty/invalid.', tableData: null });
      return;
    }
    _set({
      tableData: {
        name: d.fileName || _pendingTableName,
        singleByte: d.singleByte || {},
        multiByte: d.multiByte || {},
        entryCount: d.entryCount,
        hasMultiByte: d.hasMultiByte === true
      },
      status: 'Table loaded: ' + d.entryCount + ' entries.'
    });
  }

  // ---- Pass-through (Batch 16) ----
  // Actual extraction now lives in Search Text activity. This thin
  // adapter keeps older callers working without changes.
  function extractTexts() {
    if (K.search && typeof K.search.extractTexts === 'function') {
      K.search.extractTexts();
      return;
    }
    _set({ status: 'Search activity not available.' });
  }

  // ---- Read helpers (delegate to K.search) ----
  function getActiveGroupId() {
    if (!K.search) return null;
    return K.search.getState().selectedGroupId || null;
  }

  function getActiveGroupEntries() {
    var gid = getActiveGroupId();
    if (!gid || !K.search) return [];
    return K.search.getTextsByGroup(gid);
  }

  // ---- Language / provider ----
  function setSourceLang(v) { _set({ sourceLang: String(v || 'en') }); }
  function setTargetLang(v) { _set({ targetLang: String(v || 'id') }); }
  function setProviderMode(mode) {
    _set({ providerMode: mode === 'custom' ? 'custom' : 'free' });
  }
  function setProviderId(id) { _set({ providerId: String(id || 'openai') }); }
  function setProviderModel(m) { _set({ providerModel: String(m || '') }); }
  function setProviderEndpoint(url) { _set({ providerEndpoint: String(url || '') }); }

  /* Switching provider pulls that provider's default endpoint and model so
     the form is never left pointing at the previous provider. Both stay
     editable, because model names change faster than this file does. */
  function setProvider(id) {
    var p = (K.core && typeof K.core.getTranslatorProvider === 'function')
      ? K.core.getTranslatorProvider(id) : null;
    _set({
      providerId: String(id || 'openai'),
      providerEndpoint: p ? p.endpoint : '',
      providerModel: p ? p.model : ''
    });
  }

  // API key is stored outside state so it can never leak through
  // exportCsv / project save. Kept in module-scope only.
  var _apiKeyCache = '';
  function setProviderApiKey(v) { _apiKeyCache = String(v || ''); }
  function getProviderApiKey() { return _apiKeyCache; }

  /* ---- Byte measurement ------------------------------------------
     The build worker builds its master map from singleByte/multiByte,
     filters bracket tokens out unless the table has multi byte entries
     or padding is on, and calls the encoder with no encode options,
     which leaves DTE/MTE enabled. Mirroring all of that here is the
     only way the Size readout and the built ROM can agree. */
  var _measure = { table: null, tokenizer: null, map: null };

  /* ---- Line break token ------------------------------------------
     The registry stores text exactly as the build encoder needs it, so a
     line break is the table's own token ([LINE], [NL], ...). Showing those
     tokens inside a text box turns a sentence into "[LINE]Japan." and makes
     the translator type control codes by hand. Both boxes therefore render
     the token as a real line break and turn the line breaks back into the
     token on the way to the registry, CSV and the build. */
  var LINE_TOKEN_NAMES = ['[LINE]', '[NEWLINE]', '[NL]', '[BR]', '[LF]', '[CR]', '[CRLF]', '[RETURN]'];
  var _lineTokenCache = { table: null, token: '' };

  function lineToken() {
    if (_lineTokenCache.table === _state.tableData) return _lineTokenCache.token;
    var token = '';
    var table = _state.tableData;
    if (table) {
      var map = {};
      _buildMasterMap(table, map);
      var wanted = {};
      LINE_TOKEN_NAMES.forEach(function (n) { wanted[n] = true; });
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var upper = String(keys[i]).toUpperCase();
        if (wanted[upper] !== true) continue;
        token = String(keys[i]);
        if (upper === '[LINE]') break;
      }
    }
    _lineTokenCache = { table: table, token: token };
    return token;
  }

  function toDisplay(text) {
    var value = String(text == null ? '' : text);
    var token = lineToken();
    if (!token || value.indexOf(token) < 0) return value;
    var parts = value.split(token);
    var out = parts[0];
    for (var i = 1; i < parts.length; i++) {
      // A token at the very end is a real break the game draws, so it is kept
      // as a newline; the trailing one only exists to close the last line.
      out += '\n' + parts[i];
    }
    return out;
  }

  function fromDisplay(text) {
    var value = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var token = lineToken();
    if (!token) return value.split('\n').join(' ');
    return value.split('\n').join(token);
  }

  function _measureTools(tableData) {
    if (_measure.table === tableData && _measure.tokenizer) return _measure;
    var lg = K.legacy || {};
    if (typeof lg.createTokenizer !== 'function') return null;

    var target = {};
    _buildMasterMap(tableData, target);
    var map = new Map();
    var hasMultiByte = false;
    Object.keys(target).forEach(function (k) {
      var bytes = target[k];
      map.set(k, bytes);
      if (bytes && bytes.length > 1) hasMultiByte = true;
    });
    if (!map.size) return null;

    var tokens = [];
    map.forEach(function (val, key) {
      var upper = String(key).toUpperCase();
      var isLineToken = upper === '[LINE]' || upper === '[NEWLINE]';
      var isBracketToken = key.length > 1 &&
        key.charAt(0) === '[' && key.charAt(key.length - 1) === ']';
      if (key.length > 0 && (!isBracketToken || hasMultiByte || isLineToken)) tokens.push(key);
    });
    if (!tokens.length) return null;

    _measure = { table: tableData, tokenizer: lg.createTokenizer(tokens), map: map };
    return _measure;
  }

  function measureBytes(text) {
    var value = String(text == null ? '' : text);
    if (!value) return 0;
    var lg = K.legacy || {};
    var tools = _measureTools(_state.tableData);
    if (!tools || typeof lg.getSmartByteLength !== 'function') return value.length;
    try {
      return lg.getSmartByteLength(value, tools.tokenizer, tools.map, false, null);
    } catch (_) {
      return value.length;
    }
  }

  /* How much room the original text really takes.
     The extractor reports the length of the region it scanned, and a text
     marked by hand in the Hex Editor keeps the length of the marked range,
     which can be longer than the text inside it (the next string starts
     right after this one). The number that decides "does the translation
     still fit" is what the same encoder writes for the original text, and
     the smaller of the two is the only safe answer: a block that is assumed
     too large makes the build overwrite the string that follows. */
  /* ---- Line budget (Batch 66) ---------------------------
     Kotak dialog di layar memuat sebanyak yang dibutuhkan baris aslinya. Baris
     yang lebih lebar dari baris terlebar di halaman aslinya membuat mesin
     membungkusnya, halaman itu butuh baris lebih banyak daripada kotak yang
     disediakan, dan baris-baris berikutnya saling menumpuk: halaman terlihat
     sesak dan jarak antar paragraf aslinya hilang. Anggarannya diambil dari
     halaman itu sendiri, bukan angka tebakan. */
  var LINE_TOKEN_SPLIT = /\[LINE\]|\[NEWLINE\]|\[NL\]/gi;
  function linesOf(text, isTokenForm) {
    var s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (isTokenForm) s = s.replace(LINE_TOKEN_SPLIT, '\n');
    return s.split('\n');
  }
  /* The layout of one game text, the way the engine draws it. Measured on the rom: a record
     holds pages joined by 05 09, a page holds lines joined by 06 (the [LINE] token), and the
     extractor gives one page per text. So a newline inside a text is a line break, and what
     the box has to answer is whether those lines fit the width the original page had. */
  function previewLayout(text, width) {
    var w = Math.max(8, Number(width) || 32);
    var lines = [];
    var over = [];
    String(text == null ? '' : text)
      .split(/\n/)
      .forEach(function (rawLine) {
        String(rawLine).split(/\[LINE\]/i).forEach(function (hardLine) {
          var words = hardLine.split(/\s+/).filter(function (word) { return word.length > 0; });
          if (words.length === 0) { lines.push({ text: '', over: false }); return; }
          var current = '';
          var flush = function () {
            if (current.length === 0) return;
            lines.push({ text: current, over: current.length > w });
            if (current.length > w) over.push(current);
            current = '';
          };
          words.forEach(function (word) {
            if (current.length === 0) { current = word; return; }
            if ((current + ' ' + word).length <= w) { current += ' ' + word; return; }
            flush();
            current = word;
          });
          flush();
        });
      });
    return { lines: lines, over: over, width: w };
  }

  function lineBudget(row) {
    if (!row) return { budget: 0, originalLines: 0, translatedLines: 0, over: [] };
    var origLines = linesOf(row.originalText, false);
    var newLines = linesOf(row.translatedText === undefined ? '' : row.translatedText, true);
    var widest = 0;
    origLines.forEach(function (l) {
      var n = String(l).replace(/\s+$/, '').length;
      if (n > widest) widest = n;
    });
    var over = [];
    newLines.forEach(function (l, i) {
      var n = String(l).replace(/\s+$/, '').length;
      if (widest > 0 && n > widest) over.push({ line: i + 1, length: n, budget: widest });
    });
    return { budget: widest, originalLines: origLines.length, translatedLines: newLines.length, over: over };
  }
  var _lineBudgetNote = '';
  var relocationLogNote = '';
  var _tableNote = '';

  function measureOriginal(row) {
    if (!row) return 0;
    var stored = Math.max(0, Number(row.byteLength) || 0);
    var byText = 0;
    try { byText = measureBytes(row.originalText); } catch (_) { byText = 0; }
    if (byText > 0 && stored > 0) return Math.min(byText, stored);
    return byText > 0 ? byText : stored;
  }

  // ---- UI (filter, page, selection) ----
  function setFilter(f) { _set({ filter: String(f || ''), page: 1 }); }
  function setPage(p) { _set({ page: Math.max(1, Number(p) || 1) }); }
  function selectOffset(off) {
    var o = Number(off);
    _set({ selectedOffset: Number.isFinite(o) ? o : null });
  }

  /* ---- Group wide text tools (Batch 21) ---------------------------
     Two jobs that a translator repeats hundreds of times and that were
     still done by hand: fixing one wrong word everywhere in a group, and
     throwing away the machine output of a group to start over. Both work
     on the stored value, so a line token inside the text is untouched. */
  function replaceInGroup(groupId, find, replace, caseSensitive) {
    if (!K.search || !groupId) return 0;
    var needle = String(find == null ? '' : find);
    if (!needle) return 0;
    var with_ = String(replace == null ? '' : replace);
    var entries = K.search.getTextsByGroup(groupId);
    var flags = caseSensitive ? 'g' : 'gi';
    var pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    var count = 0;
    entries.forEach(function (row) {
      var current = String(row.translatedText || '');
      if (!current) return;
      var next = current.replace(pattern, with_);
      if (next === current) return;
      K.search.setTranslatedText(row.startByte, next);
      count++;
    });
    return count;
  }

  function clearGroupTranslations(groupId, discardBuild) {
    if (!K.search || !groupId) return 0;
    var entries = K.search.getTextsByGroup(groupId);
    var count = 0;
    entries.forEach(function (row) {
      if (!String(row.translatedText || '')) return;
      K.search.setTranslatedText(row.startByte, '');
      count++;
    });
    // A compiled ROM built from translations that no longer exist is worse
    // than no ROM, so it goes with them.
    if (discardBuild && (_state.modifiedRom || _state.buildSummary)) {
      _set({ modifiedRom: null, buildLog: [], buildSummary: null });
      // Same meaning as Clear in the Hex Editor: the inserted bytes go too, so
      // the ROM is the loaded file again.
      if (K.hex && typeof K.hex.discardInsert === 'function') K.hex.discardInsert();
      if (K.hex && typeof K.hex.clearCompiledRom === 'function') K.hex.clearCompiledRom();
    }
    return count;
  }

  function setRomFromLoad(result, systemName) {
    _set({
      romBytes: result.data,
      romName: result.name,
      romSize: result.size,
      romSystem: systemName || 'Unknown',
      modifiedRom: null,
      selectedOffset: null,
      status: 'ROM ready.'
    });
    _applyProfileForRom();
  }

  /* A rom whose layout has been verified hands its pointer table to the engine instead
     of letting the engine guess. This entry was checked against three sources: the
     original rom, a build that crashed, and the indonesian translation patch. 2893 four
     byte little endian pointers based at 0x08000000; each aims at the two byte header in
     front of a message, and every record closes with 05 09 0a.
     It lives at module scope because both the build and the panel have to see it: while
     it sat inside buildModifiedRom the panel could not, the lookup threw, the build fell
     back to guessing a table from the image and found 2895 entries instead of 2893. */
  var KNOWN_POINTER_TABLES = {
    'abd71fe01ebb201bcc133074db1dd8c5253776c7': {
      name: 'Castlevania - Aria of Sorrow (USA)',
      at: 0x506B40, count: 2893, entrySize: 4, stride: 4,
      endianness: 'little', base: 0x08000000
    }
  };

  /* ---- Pointers & Insert Range ------------------------------------------
     Two questions the panel has to answer for the user, and one place each:
     which pointer table will the engine use for this rom, and how may a record
     that outgrows its room be handled. A rom whose layout has been verified
     carries its table in the registry; any other rom can have one declared after
     the structure detector has looked at it. */
  /* Identifying a rom hashes the whole file, and the panel asks on every render, so
     the answer is kept until a different rom is loaded. */
  var _verifiedTableCache = { bytes: null, table: null };
  function _verifiedTableForRom() {
    if (_verifiedTableCache.bytes === _state.romBytes) return _verifiedTableCache.table;
    var resolved = null;
    try {
      if (K.core && typeof K.core.identifyRom === 'function' && _state.romBytes) {
        var romIdent = K.core.identifyRom(_state.romBytes, _state.romName || '');
        var identKey = romIdent && romIdent.sha1 ? String(romIdent.sha1).toLowerCase() : '';
        if (identKey && KNOWN_POINTER_TABLES[identKey]) resolved = KNOWN_POINTER_TABLES[identKey];
      }
    } catch (_) { resolved = null; }
    _verifiedTableCache = { bytes: _state.romBytes, table: resolved };
    return resolved;
  }

  function getPointerTableInfo() {
    /* The readout has to be the truth the build uses, not a copy that can drift from it:
       it asks the same function the build asks. */
    var choice = _tableForBuild();
    if (choice.table) {
      return {
        source: choice.source,
        label: choice.source === 'profile' ? 'Verified profile for this rom' : 'Declared table',
        table: choice.table,
        ignoredDeclaration: choice.ignoredDeclaration || null,
        note: choice.source === 'profile'
          ? 'This rom is already recognised, so its table is used and a declaration is not needed.'
          : 'Every record is reached through this table, so a record that moves has only its own entry rewritten.'
      };
    }
    var verified = _verifiedTableForRom();
    if (verified) {
      return {
        source: 'profile',
        label: 'Verified profile for this rom',
        table: verified,
        note: (verified.name ? verified.name + ': ' : '') + verified.count + ' entries at 0x' + Number(verified.at).toString(16).toUpperCase() + ', taken as given.'
      };
    }
    return {
      source: 'none',
      label: 'No table known',
      table: null,
      ignoredDeclaration: choice.ignoredDeclaration || null,
      note: 'Without a table the engine searches each block for pointers. That is slower and it can act on a look-alike, so a table is worth declaring for a rom that is being translated seriously.'
    };
  }

  function _consoleRulesId() {
    return _consoleRulesIdFor(_state.romSystem);
  }

  /* The record terminator the detector should accept, taken from the loaded table
     when there is one: [END] closes a record, and its last byte is the marker the
     record test looks for. */
  function _tableTerminatorBytes() {
    var td = _state.tableData;
    var end = null;
    if (td && td.multiByte) {
      Object.keys(td.multiByte).forEach(function (hex) {
        var name = String(td.multiByte[hex] || '').toUpperCase();
        if (name !== '[END]' && name !== '[NULL]') return;
        var bytes = (hex.match(/.{1,2}/g) || []).map(function (h) { return parseInt(h, 16) & 0xFF; });
        if (bytes.length && (end === null || name === '[END]')) end = bytes;
      });
    }
    if (end && end.length) return [end[end.length - 1]];
    return [0x00];
  }

  /* Two rule entries can share a console name - "NES" is both the bank relative pair
     (nes) and a legacy entry that carries no bank step (nesBank). Taking the first
     match silently picked the one that cannot find a banked pointer, so the richest
     rule wins: the one that knows how the address is built. */
  function _consoleRulesIdFor(systemName) {
    if (K.core && typeof K.core.pointerRulesIdFor === 'function') return K.core.pointerRulesIdFor(systemName);
    return null;
  }

  /* Which write the engine has to use to store this kind of value again. A bank
     relative pair is not the same write as a flat base plus offset, and getting it
     wrong would point the game at an address nobody intended. */
  function _transformIdForHit(kind, rulesId) {
    if (kind === 'bank') {
      if (rulesId === 'nes' || rulesId === 'nes32') return 'nes_bank';
      if (rulesId === 'gb' || rulesId === 'gbc') return 'gb_bank';
      if (rulesId === 'snes' || rulesId === 'snesHi') return 'snes_bank';
      return null;
    }
    if (kind === 'base') return rulesId === 'gba' ? 'gba' : null;
    if (kind === 'raw') return 'raw';
    return null;
  }

  /* Consoles that keep no table: the pointers live scattered in code, so structure
     cannot find them. They are found per text here - the same detector that measured
     233 of 287 texts on Dragon Warrior IV - and handed to the worker as hints, which
     is the path a saved group already used. */
  function _detectedPointerGroups(texts, system, knownTable) {
    if (knownTable) return [];
    if (!_state.buildOptions || _state.buildOptions.useDetectedPointers === false) return [];
    if (!K.core || typeof K.core.findPointersForTexts !== 'function' || !_state.romBytes) return [];
    var rulesId = _consoleRulesIdFor(system && system.name);
    if (!rulesId) return [];
    var offsets = (texts || []).map(function (t) { return Number(t.startByte); }).filter(function (v) { return Number.isFinite(v); });
    if (!offsets.length) return [];
    var hits = [];
    try {
      hits = K.core.findPointersForTexts(_state.romBytes, {
        console: rulesId,
        textOffsets: offsets,
        maxSitesPerValue: 8
      });
    } catch (_) { return []; }
    var byText = {};
    (hits || []).forEach(function (hit) {
      var transformId = _transformIdForHit(hit.kind, rulesId);
      if (!transformId) return;
      var key = String(hit.text);
      if (!byText[key]) byText[key] = [];
      if (byText[key].length >= 4) return;
      byText[key].push({
        ptrOffset: Number(hit.at),
        /* The address the engine stores. For a record that opens with a header the
           detector hands back the record start, which is what the pointer has to name -
           naming the text start instead would skip the header when the record moves. */
        targetOffset: Number(hit.target === undefined ? hit.text : hit.target),
        ptrSize: Number(hit.size) || (Number(system && system.pointerSize) || 2),
        transformId: transformId
      });
    });
    var groups = [];
    Object.keys(byText).forEach(function (key) {
      groups.push({ targetOffset: Number(key), pointers: byText[key] });
    });
    return groups;
  }

  /* The table the build is handed. A rom that is in the registry already has a table
     that was verified against three sources, and that one wins: a declaration that has
     not been confirmed by the detector must never replace it. This is what made a build
     fail with 118 broken records - a declared table of 124 entries at 0x229E94 (graphics
     pointers, not messages) was used for the self check, so the check was reading the
     wrong layout and every shift was rolled back for a reason that was not real. */
  function _profilePointers() {
    var profile = _state.gameProfile;
    if (!profile || !profile.pointers) return null;
    var p = profile.pointers;
    if (!(Number(p.count) > 1) || !Number.isFinite(Number(p.at))) return null;
    return {
      at: Number(p.at),
      count: Number(p.count),
      entrySize: Number(p.entrySize) || 4,
      stride: Number(p.stride) || Number(p.entrySize) || 4,
      endianness: String(p.endianness || 'little'),
      base: Number(p.base) || 0,
      name: profile.name || 'game profile',
      confirmed: true
    };
  }

  function _tableForBuild() {
    var declared = _state.buildOptions ? _state.buildOptions.knownPointerTable : null;
    var fromProfile = _profilePointers();
    var verified = _verifiedTableForRom();
    /* A profile says what this game is, so it comes before anything worked out by guessing. */
    if (fromProfile) return { table: fromProfile, source: 'profile', ignoredDeclaration: null };
    /* A rom that is in the registry has a table verified against three sources, and that
       one is used whatever else was declared: a declaration is for roms nobody has worked
       out yet. Declaring something else for a known rom is how a graphics pointer table
       ended up in charge of the self check, which then reported 118 broken records that
       were perfectly fine (the user log of 26 Sep). */
    if (verified) {
      return { table: verified, source: 'profile', ignoredDeclaration: (declared && Number(declared.at) !== Number(verified.at)) ? declared : null };
    }
    if (declared && declared.confirmed === true) return { table: declared, source: declared.auto === true ? 'detected' : 'declared', ignoredDeclaration: null };
    return { table: null, source: 'none', ignoredDeclaration: declared || null };
  }

  function _applyProfileForRom() {
    if (!_state.romBytes || !K.core || typeof K.core.profileForHash !== 'function') return;
    var sha = '';
    try {
      var ident = (typeof K.core.identifyRom === 'function') ? K.core.identifyRom(_state.romBytes, _state.romName || '') : null;
      sha = ident && ident.sha1 ? String(ident.sha1).toLowerCase() : '';
    } catch (_) { sha = ''; }
    if (!sha) return;
    if (_state.gameProfile && _state.gameProfile.sha1 === sha) return;
    var built = K.core.profileForHash(sha);
    if (built) {
      _set({ gameProfile: built, gameProfileSource: 'built in', pointerNote: 'Game profile: ' + built.name + ' (built in).' });
    } else if (_state.gameProfileSource === 'built in') {
      _set({ gameProfile: null, gameProfileSource: '' });
    }
  }

  function loadProfileContent(content) {
    if (!K.core || typeof K.core.parseProfile !== 'function') { _set({ status: 'Game profiles are not available in this build.' }); return null; }
    var parsed = K.core.parseProfile(content);
    if (!parsed.profile) { _set({ status: 'Game profile: ' + parsed.error }); return null; }
    _set({
      gameProfile: parsed.profile,
      gameProfileSource: 'loaded',
      status: 'Game profile loaded: ' + parsed.profile.name
    });
    return parsed.profile;
  }

  function getProfile() { return _state.gameProfile; }

  function getProfileInfo() {
    if (!_state.gameProfile) return { profile: null, source: '', summary: null };
    var summary = (K.core && typeof K.core.profileSummary === 'function') ? K.core.profileSummary(_state.gameProfile) : null;
    return { profile: _state.gameProfile, source: _state.gameProfileSource, summary: summary };
  }

  function detectPointers() {
    if (!_state.romBytes) { _set({ pointerNote: 'Load a rom first.' }); return []; }
    if (!K.core || typeof K.core.detectPointerTables !== 'function') {
      _set({ pointerNote: 'The pointer detector is not loaded in this build.' });
      return [];
    }
    var rulesId = _consoleRulesId();
    var started = Date.now();
    var found = [];
    try {
      found = K.core.detectPointerTables(_state.romBytes, {
        console: rulesId || undefined,
        terminator: _tableTerminatorBytes(),
        minEntries: 8,
        maxResults: 4,
        textOffsets: (K.search && K.search.getState) ? (K.search.getState().texts || []).map(function (t) { return Number(t.startByte); }) : []
      });
    } catch (err) {
      _set({ pointerReport: [], pointerNote: 'Pointer detection failed: ' + (err && err.message ? err.message : String(err)) });
      return [];
    }
    var ms = Date.now() - started;
    var rows = (found || []).map(function (table) {
      return {
        at: Number(table.at),
        count: Number(table.count),
        entrySize: Number(table.entrySize),
        stride: Number(table.stride),
        endianness: table.endianness || 'little',
        base: Number(table.base),
        console: table.console || rulesId || '',
        confirmed: table.confirmed === true,
        deltaConsensus: Number(table.deltaConsensus) || 0,
        regionStart: Number(table.regionStart),
        regionEnd: Number(table.regionEnd)
      };
    });
    _set({
      pointerReport: rows,
      pointerNote: rows.length
        ? rows.length + ' candidate(s) in ' + ms + ' ms. Confirm the one that covers the records you extracted.'
        : 'No compact table found in ' + ms + ' ms. This rom may keep its pointers scattered, as the NES often does.'
    });
    return rows;
  }

  function declarePointerTable(candidate) {
    var table = candidate || null;
    if (!table || !Number.isFinite(Number(table.at)) || Number(table.count) < 2) {
      _set({ pointerNote: 'A table needs a site and at least two entries.' });
      return null;
    }
    /* Only a structure the detector could prove is accepted. A table that merely looks
       regular can point at graphics, and using one for the self check makes the check lie
       about records that are fine. */
    if (table.confirmed !== true && table.force !== true) {
      _set({ pointerNote: 'That candidate was not confirmed: its records do not all close with the terminator, so it is not the message table. Nothing was declared - the build keeps using ' + getPointerTableInfo().label.toLowerCase() + '.' });
      return null;
    }
    var declared = {
      at: Number(table.at),
      count: Number(table.count),
      entrySize: Number(table.entrySize) || 4,
      stride: Number(table.stride) || Number(table.entrySize) || 4,
      endianness: table.endianness || 'little',
      base: Number(table.base) || 0,
      name: table.name || 'declared table',
      declared: true,
      /* Confirmed by the detector when it was picked, and kept in the project file so a
         reloaded project is trusted for the same reason the pick was. */
      confirmed: true
    };
    setBuildOptions({ knownPointerTable: declared });
    _set({ pointerNote: 'Table declared at 0x' + declared.at.toString(16).toUpperCase() + ' with ' + declared.count + ' entries. Every record that has to move will be repointed through it.' });
    return declared;
  }

  function clearPointerTable() {
    var next = Object.assign({}, _state.buildOptions);
    delete next.knownPointerTable;
    _set({ buildOptions: next, pointerNote: 'Declared table removed; this rom falls back to the verified profile or to a per block search.' });
  }

  // ---- Build ----
  function _buildMasterMap(tableData, target) {
    if (!tableData) return;
    if (tableData.singleByte) {
      Object.keys(tableData.singleByte).forEach(function (k) {
        var ch = String(tableData.singleByte[k] || '');
        if (!ch) return;
        target[ch] = new Uint8Array([parseInt(k, 10) & 0xFF]);
      });
    }
    if (tableData.multiByte) {
      Object.keys(tableData.multiByte).forEach(function (hex) {
        var ch = String(tableData.multiByte[hex] || '');
        if (!ch || ch.length === 0) return;
        var bytes = hex.match(/.{1,2}/g).map(function (h) {
          return parseInt(h, 16) & 0xFF;
        });
        target[ch] = new Uint8Array(bytes);
      });
    }
  }

  /* Compiles the translated text into the ROM.
     scope 'group' limits the work to the entries of the selected group, the
     way Kruptar compiles one group at a time; scope 'all' recomputes and
     inserts every group at once. */
  /* Offsets this insert owns. A build writes the payload and slides the records that
     follow it, so a second build that starts from a buffer holding the first one shifts
     the same records twice: the records then lose their headers and the worker's self
     check refuses the rom (that is the "22 record(s)" failure). Everything the insert
     changed is remembered as a range and its hex patch is ignored on later builds, the
     same way the payload offsets already are. */
  var _insertOwnedRanges = [];
  var _lastBuildBase = null;
  function _rememberInsertRanges(before, after) {
    _insertOwnedRanges = [];
    if (!before || !after) return 0;
    var start = -1;
    var limit = Math.min(before.length, after.length);
    for (var i = 0; i < limit; i++) {
      if (before[i] !== after[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        _insertOwnedRanges.push([start, i]);
        start = -1;
      }
    }
    if (start >= 0) _insertOwnedRanges.push([start, limit]);
    return _insertOwnedRanges.length;
  }
  function _insideInsertRange(off) {
    for (var i = 0; i < _insertOwnedRanges.length; i++) {
      if (off >= _insertOwnedRanges[i][0] && off < _insertOwnedRanges[i][1]) return true;
    }
    return false;
  }
  K.translate.getInsertOwnedRanges = function () { return _insertOwnedRanges.slice(); };
  /* The build options are part of the translate state so the panel can read them
     back and a test can set them without reaching into the worker. */
  /* A named function, not only an export: the panel and the project loader call it
     from inside this module too. */
  function setBuildOptions(patch) {
    var next = Object.assign({}, _state.buildOptions, patch || {});
    _set({ buildOptions: next });
    return next;
  }
  function getBuildOptions() { return Object.assign({}, _state.buildOptions); }
  K.translate.setBuildOptions = setBuildOptions;
  K.translate.getBuildOptions = getBuildOptions;

  function buildModifiedRom(scope) {
    var compileScope = scope === 'group' ? 'group' : 'all';
    _ensureWorkers();
    if (!_workers.build) { _set({ status: 'Build unavailable.' }); return; }
    if (!_state.romBytes || !_state.tableData) {
      _set({ status: 'ROM and table required.' }); return;
    }
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }

    var assigned = K.search.getAssignedOffsets();
    var searchTexts = K.search.getState().texts || [];
    // Every text of the scope travels with the build, translated or not: the
    // engine has to know which other texts live inside the same pointer
    // container, otherwise it treats the container as free room and copies the
    // following texts along when it relocates one of them.
    // The block the build may reuse in place is the room the original text
    // occupies, measured with the encoder that is about to write. A range
    // length that is too generous would let the new text run into the next
    // string instead of being relocated and repointed.
    /* Which other texts live in the same pointer container as the ones being written.
       This used to be "the texts assigned to a group", and that was not enough: in this
       ROM the dialogue is packed back to back with a two byte gap, so a translated text
       that is written longer runs into the text that follows it. The engine only protects
       the neighbours it has been told about, so a neighbour outside the groups was
       overwritten and the game lost it. The window below hands the engine every text
       near a translation, whether it belongs to a group or not. */
    var translatedOffsets = searchTexts.filter(function (t) {
      return (t.translatedText || '').trim().length > 0;
    }).map(function (t) { return Number(t.startByte); });
    var WINDOW = 0x10000;
    function nearATranslation(t) {
      var start = Number(t.startByte);
      for (var i = 0; i < translatedOffsets.length; i++) {
        if (Math.abs(translatedOffsets[i] - start) <= WINDOW) return true;
      }
      return false;
    }
    var contextTexts = searchTexts.filter(function (t) {
      return assigned.has(Number(t.startByte)) || nearATranslation(t);
    }).map(function (t) {
      // A unique id per entry. The build worker keys its text map by id, so
      // entries without one (or with a repeated one) collapse into a single
      // key: every lookup then returns the same entry and only that one text
      // could ever be seen as changed.
      return Object.assign({}, t, {
        id: 'tx-' + Number(t.startByte),
        byteLength: measureOriginal(t)
      });
    });
    var buildTexts = contextTexts.filter(function (t) {
      return (t.translatedText || '').trim().length > 0;
    });

    var scopeLabel = 'all groups';
    if (compileScope === 'group') {
      var gid = K.search.getState().selectedGroupId;
      if (!gid) { _set({ status: 'Select a group first.' }); return; }
      var inGroup = {};
      K.search.getTextsByGroup(gid).forEach(function (t) { inGroup[Number(t.startByte)] = true; });
      buildTexts = buildTexts.filter(function (t) { return inGroup[Number(t.startByte)] === true; });
      contextTexts = contextTexts.filter(function (t) { return inGroup[Number(t.startByte)] === true; });
      var g = null;
      K.search.getState().groups.forEach(function (x) { if (x.id === gid) g = x; });
      scopeLabel = g ? 'group "' + g.name + '"' : 'the selected group';
    }

    if (!buildTexts.length) {
      _set({ status: 'No translated texts in ' + scopeLabel + '.' });
      return;
    }

    var overBudget = 0;
    var worstOver = null;
    buildTexts.forEach(function (t) {
      lineBudget(t).over.forEach(function (o) {
        overBudget++;
        if (!worstOver || (o.length - o.budget) > worstOver.excess) {
          worstOver = { offset: Number(t.startByte), excess: o.length - o.budget, length: o.length, budget: o.budget };
        }
      });
    });
    _lineBudgetNote = (overBudget && worstOver)
      ? overBudget + ' line(s) wider than the original page (worst ' + worstOver.length + ' vs ' +
        worstOver.budget + ' chars at 0x' + worstOver.offset.toString(16).toUpperCase() +
        '); the game wraps those and the page looks cramped'
      : '';

    _set({
      isBusy: true, progress: 10, compileScope: compileScope,
      status: 'Compiling ' + buildTexts.length + ' text(s) from ' + scopeLabel +
        (appliedPatches ? ' with ' + appliedPatches + ' hex patch(es) applied' : '') + '...'
    });

    var systemProfile = (K.workflow && typeof K.workflow.getSystemProfile === 'function')
      ? K.workflow.getSystemProfile() : null;
    var system = {
      name: (systemProfile && systemProfile.name) || _state.romSystem || 'Unknown',
      terminator: (systemProfile && Array.isArray(systemProfile.terminator) && systemProfile.terminator.length)
        ? systemProfile.terminator.slice() : [0x00],
      pointerSize: (systemProfile && Number(systemProfile.pointerSize)) || 4,
      pointerEndianness: (systemProfile && systemProfile.pointerEndianness) || 'little',
      pointerBase: (systemProfile && Number(systemProfile.pointerBase)) || 0
    };

    var tableChoice = _tableForBuild();
    /* A rom nobody has worked out yet: the tool looks for the table itself, once, before it
       falls back to hunting pointers block by block. This is the detector that used to be a
       button in the panel - it runs on its own now, because a translator should not have to
       know what a pointer table is to translate a game. The answer is remembered in the
       build options and travels with the project file, so it is paid for once. */
    if (!tableChoice.table && K.core && typeof K.core.detectPointerTables === 'function' && _state.romBytes) {
      try {
        var autoRules = _consoleRulesIdFor((systemProfile && systemProfile.name) || _state.romSystem);
        var autoFound = K.core.detectPointerTables(_state.romBytes, {
          console: autoRules || undefined,
          terminator: _tableTerminatorBytes(),
          minEntries: 8,
          maxResults: 4,
          textOffsets: contextTexts.map(function (t) { return Number(t.startByte); })
        }) || [];
        var autoTable = autoFound.filter(function (t) { return t.confirmed === true; })[0] || null;
        if (autoTable) {
          var remembered = {
            at: Number(autoTable.at),
            count: Number(autoTable.count),
            entrySize: Number(autoTable.entrySize) || 4,
            stride: Number(autoTable.stride) || 4,
            endianness: autoTable.endianness || 'little',
            base: Number(autoTable.base) || 0,
            name: 'table found automatically',
            confirmed: true,
            /* found by the tool, not picked by a person: the readout says so. */
            auto: true
          };
          setBuildOptions({ knownPointerTable: remembered });
          tableChoice = { table: remembered, source: 'detected', ignoredDeclaration: tableChoice.ignoredDeclaration };
          _tableNote = 'Pointer table found automatically: ' + remembered.count + ' pointers at 0x' + remembered.at.toString(16).toUpperCase() + '.';
        }
      } catch (_) { }
    }
    var knownTable = tableChoice.table;
    system.knownPointerTable = knownTable;
    if (tableChoice.ignoredDeclaration) {
      _tableNote = 'The declared table at 0x' + Number(tableChoice.ignoredDeclaration.at).toString(16).toUpperCase() + ' was not used: it is not confirmed, and this rom already has ' + (knownTable && knownTable.count ? knownTable.count + ' verified entries' : 'no verified table') + '.';
    } else if (tableChoice.ignoredVerified) {
      _tableNote = 'Using the declared table at 0x' + Number(tableChoice.ignoredVerified.at).toString(16).toUpperCase() + ' instead of the verified profile for this rom.';
    } else {
      _tableNote = '';
    }
    var buildOptions = _state.buildOptions || {};
    Object.keys(buildOptions).forEach(function (key) {
      var value = buildOptions[key];
      if (value === undefined || value === null) return;
      system[key] = value;
    });

    var mch = {};
    _buildMasterMap(_state.tableData, mch);
    Object.keys(mch).forEach(function (k) {
      mch[k] = Array.from(mch[k]);
    });

    // Patches made in the Hex Editor are part of the ROM now, so they are
    // applied before any text is inserted (decision R2.2 #6). The loaded
    // buffer itself is never modified.
    var rb = _state.romBytes;
    var patched = new Uint8Array(rb.buffer.slice(rb.byteOffset, rb.byteOffset + rb.byteLength));
    var appliedPatches = 0;
    var hexState = (K.hex && typeof K.hex.getState === 'function') ? K.hex.getState() : null;
    // Build from the loaded file, never from a buffer that already holds a
    // previous insert: the insert is written into free space, so rebuilding on
    // top of it finds new free space every time and duplicates the text.
    var insertedOffsets = (K.hex && typeof K.hex.getInsertedOffsets === 'function')
      ? K.hex.getInsertedOffsets() : {};
    if (hexState && hexState.patches) {
      Object.keys(hexState.patches).forEach(function (key) {
        var off = parseInt(key, 10);
        if (insertedOffsets[off]) return;
        if (_insideInsertRange(off)) return;   // the insert's own writes, including the records it shifted
        if (Number.isFinite(off) && off >= 0 && off < patched.length) {
          patched[off] = hexState.patches[key] & 0xFF;
          appliedPatches++;
        }
      });
    }
    _lastBuildBase = patched.slice();
    var romBuffer = patched.buffer;
    _lastBuildPatches = appliedPatches;
    _pendingBuildCount = buildTexts.length;
    // What each written text now says, so the registry can follow the insert.
    _lastBuiltTexts = {};
    buildTexts.forEach(function (t) {
      _lastBuiltTexts[Number(t.startByte)] = String(t.translatedText || '');
    });

    /* Consoles without a table get their pointers found here, per text. */
    var detectedPointerGroups = _detectedPointerGroups(contextTexts, system, knownTable);
    var detectedPointerCount = detectedPointerGroups.reduce(function (sum, g) { return sum + g.pointers.length; }, 0);
    if (detectedPointerCount > 0) {
      relocationLogNote = 'Per text pointer detector: ' + detectedPointerCount + ' pointer(s) for ' + detectedPointerGroups.length + ' text(s) handed to the build.';
    } else {
      relocationLogNote = '';
    }

    _workers.build.postMessage({
      type: 'buildRom',
      payload: {
        originalRom: romBuffer,
        appliedPatches: appliedPatches,
        // Translated or not: the container math needs the neighbours.
        allTexts: contextTexts,
        tableData: { masterCharToHex: mch },
        // The console's own pointer profile, not a generic one. The NES uses
        // 2 byte pointers based at $8000, the GBA 4 byte pointers based at
        // $08000000, the Game Boy bank relative pairs, and each console has
        // its own terminator. A generic profile here writes pointers the game
        // cannot follow, which is what made a compiled ROM unusable.
        system: system,
        usePaddingByte: false,
        pointerGroups: detectedPointerGroups
      }
    }, [romBuffer]);
  }

  function _onBuildMsg(ev) {
    var d = ev.data || {};
    if (d.type === 'progress') { _set({ progress: Number(d.value) || 0 }); return; }
    if (d.type === 'buildResult') {
      var p = d.modifiedRom;
      var bytes = p instanceof Uint8Array ? p
        : (p instanceof ArrayBuffer ? new Uint8Array(p) : new Uint8Array(p || []));
      var scopeNote = _state.compileScope === 'group' ? ' (selected group)' : ' (all groups)';
      var patchNote = _lastBuildPatches ? ', ' + _lastBuildPatches + ' hex patch(es) applied first' : '';

      // The build worker has always returned its relocation report; the UI
      // used to drop it. An over-long translation is moved into free space
      // and the game's own pointer is rewritten by rebuildRom(), and the only
      // way to know whether that happened, or was refused, is this log.
      var log = Array.isArray(d.relocationLog) ? d.relocationLog.slice() : [];
      var relocated = 0;
      var inPlace = 0;
      /* A record that grew is reported in three different ways and the report used to
         count only one of them, so a build that paid for every growth with the padding
         around it still said "0 written in place". */
      var grewInPlace = 0;
      var slidForward = 0;
      var leftWhereItIs = 0;
      var pointersUpdated = 0;
      var warnings = [];
      var relocations = [];
      var lastBlock = 0;
      log.forEach(function (line) {
        var text = String(line || '');
        var bm = text.match(/^Block at 0x([0-9A-F]+)/i);
        if (bm) lastBlock = parseInt(bm[1], 16);
        var rm = text.match(/Relocated to 0x([0-9A-F]+)/i);
        var gm = text.match(/Grew in place by (\d+) byte/i);
        if (rm) {
          relocated++;
          // Where the text went, so the Hex Editor can point at the new bytes
          // instead of leaving the user staring at the old ones.
          relocations.push({ from: lastBlock, to: parseInt(rm[1], 16), len: 0, kind: 'moved' });
        } else if (gm) {
          grewInPlace++;
          var sm = text.match(/(\d+) message\(s\) after it slid forward/);
          if (sm) slidForward += Number(sm[1]) || 0;
          relocations.push({ from: lastBlock, to: lastBlock, len: Number(gm[1]) || 0, kind: 'grew', pointers: 0 });
        } else if (/left where it is|stays where it is|Nothing was written/i.test(text)) leftWhereItIs++;
        else if (/Injected in-place|Updated \d+ pointer\(s\) in-place/i.test(text)) inPlace++;
        var pm = text.match(/Updated (\d+) pointer/);
        if (pm) {
          pointersUpdated += Number(pm[1]) || 0;
          if (relocations.length) relocations[relocations.length - 1].pointers = Number(pm[1]) || 0;
        }
        if (text.indexOf('[WARNING]') >= 0) warnings.push(text);
      });
      /* What the build says about the length of every text it wrote: longer than the room it
         had, exactly the same, or shorter. Only a longer text can force a record to move. */
      var longerTexts = 0, sameTexts = 0, shorterTexts = 0;
      log.forEach(function (line) {
        var lm = String(line || '').match(/Length check: of the texts this build wrote, (\d+) came out longer[\s\S]*?, (\d+) came out exactly the same length and (\d+) shorter/);
        if (!lm) return;
        longerTexts = Number(lm[1]) || 0;
        sameTexts = Number(lm[2]) || 0;
        shorterTexts = Number(lm[3]) || 0;
      });
      if (_lineBudgetNote) warnings.push('Line budget: ' + _lineBudgetNote);
      if (typeof relocationLogNote === 'string' && relocationLogNote) log.push(relocationLogNote);
      if (typeof _tableNote === 'string' && _tableNote) log.push(_tableNote);
      var owned = _rememberInsertRanges(_lastBuildBase, bytes);
      log.push('Insert ownership: ' + owned + ' range(s) of this build are excluded from the hex patches on the next one, so a second Insert All cannot shift the same records twice.');

      var summary = {
        at: Date.now(),
        bytes: bytes.length,
        texts: _pendingBuildCount,
        scope: _state.compileScope,
        relocations: relocations,
        relocated: relocated,
        grewInPlace: grewInPlace,
        slidForward: slidForward,
        leftWhereItIs: leftWhereItIs,
        inPlace: inPlace,
        pointersUpdated: pointersUpdated,
        warnings: warnings,
        longerTexts: longerTexts,
        sameTexts: sameTexts,
        shorterTexts: shorterTexts,
        lines: log.length
      };

      _set({
        modifiedRom: bytes, isBusy: false, progress: 100,
        buildLog: log, buildSummary: summary,
        status: 'Inserted into ROM' + scopeNote + ': ' + _pendingBuildCount + ' text(s), ' +
          Math.round(bytes.length / 1024) + ' KB' + patchNote +
          (grewInPlace ? ', ' + grewInPlace + ' grew where it was' + (slidForward ? ' (' + slidForward + ' later message(s) slid forward)' : '') : '') +
          (relocated ? ', ' + relocated + ' moved to free space and repointed' : '') +
          (!grewInPlace && !relocated ? ', nothing had to move' : '') +
          (leftWhereItIs ? ', ' + leftWhereItIs + ' left alone' : '') +
          (warnings.length ? ', ' + warnings.length + ' warning(s)' : '')
      });

      // Hand the compiled image to the Hex Editor so both activities show the
      // same bytes after a compile. Nothing is written into the loaded ROM.
      // What the user sees in the Hex Editor and exports from now on is the
      // inserted ROM, not the file that was loaded.
      if (K.hex && typeof K.hex.adoptInsertedRom === 'function') {
        K.hex.adoptInsertedRom(bytes, {
          at: summary.at, scope: summary.scope, relocations: relocations
        });
      }
      // The original text is never overwritten by an insert: it is the
      // translator's reference and the source for the next insert. What the
      // ROM holds now is visible in the Hex Editor.
      if (K.hex && typeof K.hex.setCompiledRom === 'function') {
        K.hex.setCompiledRom(bytes, {
          at: summary.at, scope: summary.scope, relocations: relocations
        });
      }
      setTimeout(function () { _set({ progress: 0 }); }, 800);
      return;
    }
    if (d.type === 'error') {
      /* The worker sends the stack with the message; the first frame is what turns "Build
         error: Cannot read properties of undefined" into a line somebody can fix, so it is
         kept in the status instead of thrown away. */
      var where = '';
      if (d.stack) {
        var frames = String(d.stack).split('\n').filter(function (line) { return line.indexOf('at ') >= 0; });
        if (frames.length > 0) where = ' (' + frames[0].trim() + ')';
      }
      _set({ isBusy: false, progress: 0, status: 'Build error: ' + (d.message || '') + where });
    }
  }

  /* ---- File helpers ---- */
  function _baseName() {
    return String(_state.romName || 'ketor').replace(/\.[^.]+$/, '') || 'ketor';
  }

  function _download(name, text, mime) {
    var blob = new global.Blob([text], { type: mime || 'text/plain' });
    var url = global.URL.createObjectURL(blob);
    var a = global.document.createElement('a');
    a.href = url;
    a.download = name;
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    global.URL.revokeObjectURL(url);
  }

  /* ---- CSV: group name, offset, original, translation ----------------
     Only entries that belong to a group are exported, because those are the
     ones a compile will touch. Every field is quoted so commas and newlines
     inside a text survive the round trip. */
  function _csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function _offsetKey(startByte) {
    return '0x' + Number(startByte || 0).toString(16).toUpperCase().padStart(6, '0');
  }

  function exportCsv() {
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }
    var rows = K.search.getAssignedEntries();
    if (!rows.length) {
      _set({ status: 'Nothing to export: no text is assigned to a group yet.' });
      return;
    }
    var lines = ['Group,Offset,Original,Translation'];
    rows.forEach(function (r) {
      var t = r.entry;
      lines.push([
        _csvCell(r.groupName),
        _csvCell(t.offset || _offsetKey(t.startByte)),
        _csvCell(toDisplay(t.originalText)),
        _csvCell(toDisplay(t.translatedText))
      ].join(','));
    });
    var name = _baseName() + '_translation.csv';
    _download(name, lines.join('\r\n'), 'text/csv;charset=utf-8');
    _set({ status: 'CSV exported: ' + rows.length + ' grouped text(s) to ' + name + '.' });
  }

  // Quoted-field CSV reader. Handles embedded commas, quotes and newlines.
  function _parseCsv(text) {
    var src = String(text || '');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  function importCsvContent(content) {
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }
    var rows = _parseCsv(content);
    if (!rows.length) { _set({ status: 'CSV import failed: the file is empty.' }); return; }

    var header = rows[0].map(function (c) { return String(c).trim().toLowerCase(); });
    var hasHeader = header.indexOf('offset') !== -1;
    var body = hasHeader ? rows.slice(1) : rows;
    var col = {
      group: header.indexOf('group'),
      offset: header.indexOf('offset'),
      original: header.indexOf('original'),
      translation: header.indexOf('translation')
    };
    if (!hasHeader) { col = { group: 0, offset: 1, original: 2, translation: 3 }; }

    var byOffset = {};
    K.search.getState().texts.forEach(function (t) { byOffset[_offsetKey(t.startByte)] = t; });

    var pairs = [];
    var unknown = 0;
    var empty = 0;
    body.forEach(function (r) {
      var rawOffset = String(r[col.offset] == null ? '' : r[col.offset]).trim();
      if (!rawOffset) return;
      var n = parseInt(rawOffset.replace(/^0x/i, ''), 16);
      if (!Number.isFinite(n)) { unknown++; return; }
      var key = _offsetKey(n);
      var entry = byOffset[key];
      if (!entry) { unknown++; return; }
      var translation = String(r[col.translation] == null ? '' : r[col.translation]);
      if (!translation.length) { empty++; return; }
      pairs.push({ startByte: entry.startByte, translatedText: translation });
    });

    if (!pairs.length) {
      _set({
        status: 'CSV import: no row matched this ROM (' + unknown + ' unknown offset(s)).'
      });
      return;
    }

    var applied = K.search.applyTranslations(pairs);
    _set({
      status: 'CSV import: ' + applied + ' translation(s) applied' +
        (unknown ? ', ' + unknown + ' offset(s) not in this ROM' : '') +
        (empty ? ', ' + empty + ' empty row(s) skipped' : '') + '.'
    });
  }

  /* ---- Project file ------------------------------------------------
     Kruptar saves its own binary project format tied to its pointer and
     table metadata. Ketor keeps the same idea - one file with the whole
     translation progress - in a readable JSON document, because the table
     and the pointers live in the registry here, not in the project. */
  function saveProject() {
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }
    var s = K.search.getState();
    if (!s.texts.length && !s.groups.length) {
      _set({ status: 'Nothing to save yet.' });
      return;
    }
    var payload = {
      format: 'ketor-project',
      version: 1,
      savedAt: new Date().toISOString(),
      rom: { name: _state.romName, size: _state.romSize, system: _state.romSystem },
      table: _state.tableData ? {
        name: _state.tableData.name,
        entryCount: _state.tableData.entryCount,
        content: _state.tableContent || ''
      } : null,
      /* The declared pointer table and the insert mode are part of the work: the user
         verified them for this rom, and losing them on the next load would mean
         declaring them again. */
      profile: _state.gameProfile ? { id: _state.gameProfile.id, source: _state.gameProfileSource, document: _state.gameProfileSource === 'loaded' ? _state.gameProfile : null } : null,
      pointers: {
        table: (_state.buildOptions && _state.buildOptions.knownPointerTable) || null,
        allowMessageShift: (_state.buildOptions && _state.buildOptions.allowMessageShift !== undefined)
          ? _state.buildOptions.allowMessageShift : null,
        allowRelocation: (_state.buildOptions && _state.buildOptions.allowRelocation !== undefined)
          ? _state.buildOptions.allowRelocation : null
      },
      groups: s.groups.map(function (g) {
        return { id: g.id, name: g.name, color: g.color, offsets: g.offsets, createdAt: g.createdAt };
      }),
      texts: s.texts.map(function (t) {
        return {
          startByte: t.startByte,
          offset: t.offset,
          byteLength: t.byteLength,
          originalText: t.originalText,
          translatedText: t.translatedText,
          comment: t.comment,
          textType: t.textType,
          buildable: t.buildable,
          source: t.source
        };
      })
    };
    var name = _baseName() + '.ketor';
    _download(name, JSON.stringify(payload, null, 1), 'application/json');
    _set({
      status: 'Project saved: ' + name + ' (' + payload.texts.length + ' text(s), ' +
        payload.groups.length + ' group(s)).'
    });
  }

  function loadProjectContent(content) {
    var payload = null;
    try {
      payload = JSON.parse(String(content || ''));
    } catch (_) {
      _set({ status: 'Project file is not valid JSON.' });
      return;
    }
    if (!payload || payload.format !== 'ketor-project') {
      _set({ status: 'Not a Ketor project file.' });
      return;
    }
    if (!K.search || typeof K.search.loadSnapshot !== 'function') {
      _set({ status: 'Search state not available.' });
      return;
    }

    K.search.loadSnapshot({ texts: payload.texts, groups: payload.groups });

    if (payload.table && payload.table.content) {
      loadTableContent(payload.table.content, payload.table.name || 'project.tbl');
    }
    if (payload.profile && payload.profile.document) {
      loadProfileContent(JSON.stringify(payload.profile.document));
    } else if (!_state.gameProfile) {
      _applyProfileForRom();
    }
    if (payload.pointers && payload.pointers.table) {
      declarePointerTable(payload.pointers.table);
    }
    if (payload.pointers && (payload.pointers.allowMessageShift !== undefined || payload.pointers.allowRelocation !== undefined)) {
      var modeOptions = {};
      if (payload.pointers.allowMessageShift !== undefined) modeOptions.allowMessageShift = payload.pointers.allowMessageShift === true ? true : (payload.pointers.allowMessageShift === false ? false : null);
      if (payload.pointers.allowRelocation !== undefined) modeOptions.allowRelocation = payload.pointers.allowRelocation === true ? true : (payload.pointers.allowRelocation === false ? false : null);
      setBuildOptions(modeOptions);
    }

    var savedName = payload.rom && payload.rom.name;
    var mismatch = savedName && _state.romName && savedName !== _state.romName;
    _set({
      status: 'Project loaded: ' + ((payload.texts || []).length) + ' text(s), ' +
        ((payload.groups || []).length) + ' group(s).' +
        (mismatch ? ' Warning: saved from ' + savedName + ' but the loaded ROM is ' + _state.romName + '.' : '')
    });
  }

  function downloadModifiedRom() {
    if (!_state.modifiedRom) return;
    var name = (_state.romName || 'translated.rom').replace(/\.[^.]+$/, '') + '_translated.rom';
    var blob = new Blob([_state.modifiedRom], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _set({ status: 'ROM downloaded: ' + name });
  }

  // ---- Auto-translate ----
  // startByte is the entry key. Writes result via K.search.setTranslatedText.
  function _setTranslating(active, offset) {
    _set({ isTranslating: !!active, translatingOffset: active ? Number(offset) : null });
  }

  /* Batch translation for one group. Requests go out one at a time because
     the free providers rate limit bursts, and the run can be stopped. */
  var _batch = { running: false, stop: false, done: 0, total: 0 };

  function _translateEntry(row) {
    var tr = K.core && K.core.translate;
    if (typeof tr !== 'function') return Promise.reject(new Error('Translator not available'));
    var options = { onProgress: function () { } };
    if (_state.providerMode === 'custom') {
      if (!_apiKeyCache) return Promise.reject(new Error('No API key set for ' + _state.providerId));
      options.customApi = {
        provider: _state.providerId,
        endpoint: _state.providerEndpoint || '',
        apiKey: _apiKeyCache,
        model: _state.providerModel
      };
    }
    // The provider never sees the table's line token. It gets a real line
    // break, which is what made "[LINE]" end up inside translations, and the
    // answer is turned back into tokens before it reaches the registry.
    var source = toDisplay(row.originalText);
    return tr(source, _state.sourceLang, _state.targetLang, options)
      .then(function (r) {
        var out = fromDisplay(r.text);
        K.search.setTranslatedText(row.startByte, out);
        r.text = out;
        return r;
      });
  }

  function autoTranslateGroup(groupId) {
    if (_batch.running) return;
    var gid = groupId || (K.search && K.search.getState().selectedGroupId);
    if (!gid) { _set({ status: 'Select a group first.' }); return; }
    var entries = K.search.getTextsByGroup(gid).filter(function (t) {
      return String(t.originalText || '').trim() && !String(t.translatedText || '').trim();
    });
    if (!entries.length) {
      _set({ status: 'Every text in this group already has a translation.' });
      return;
    }

    _batch = { running: true, stop: false, done: 0, total: entries.length };
    _set({ batch: { running: true, done: 0, total: entries.length }, isTranslating: true });

    var index = 0;
    var failures = 0;
    function step() {
      if (_batch.stop || index >= entries.length) {
        var stopped = _batch.stop;
        _batch.running = false;
        _set({
          batch: { running: false, done: _batch.done, total: _batch.total },
          isTranslating: false,
          status: (stopped ? 'Stopped after ' : 'Group translated: ') + _batch.done + ' of ' + _batch.total +
            (failures ? ', ' + failures + ' failed' : '') + '.'
        });
        return;
      }
      var row = entries[index++];
      _translateEntry(row)
        .then(function () { _batch.done++; })
        .catch(function () { failures++; })
        .then(function () {
          _set({
            batch: { running: true, done: _batch.done, total: _batch.total },
            status: 'Translating group: ' + _batch.done + '/' + _batch.total +
              ' (' + String(row.offset || '') + ')'
          });
          step();
        });
    }
    step();
  }

  function stopAutoTranslateGroup() {
    if (!_batch.running) return;
    _batch.stop = true;
  }

  function autoTranslateText(startByte) {
    var tr = K.core && K.core.translate;
    if (typeof tr !== 'function') { _set({ status: 'Translator not available.' }); return; }
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }

    var sb = Number(startByte);
    var texts = K.search.getState().texts || [];
    var row = null;
    for (var i = 0; i < texts.length; i++) {
      if (Number(texts[i].startByte) === sb) { row = texts[i]; break; }
    }
    if (!row) return;
    var src = row.originalText || '';
    if (!src.trim()) return;

    _setTranslating(true, sb);
    _set({ status: 'Translating ' + row.offset + '...' });
    _translateEntry(row)
      .then(function (r) {
        _setTranslating(false);
        _set({ status: 'Translated ' + row.offset + ' via ' + r.provider + '.' });
      })
      .catch(function (e) {
        _setTranslating(false);
        _set({ status: 'Translate failed: ' + (e.message || '') });
      });
  }

  function reset() {
    _set({
      romBytes: null, romName: '', romSystem: '', romSize: 0,
      tableData: null, tableContent: '',
      filter: '', page: 1, selectedOffset: null,
      modifiedRom: null, isBusy: false, status: '', progress: 0,
      buildLog: [], buildSummary: null
    });
  }

  K.translate.getState = getState;
  K.translate.getPointerTableInfo = getPointerTableInfo;
  K.translate.detectPointers = detectPointers;
  K.translate.declarePointerTable = declarePointerTable;
  K.translate.clearPointerTable = clearPointerTable;
  K.translate.subscribe = subscribe;
  K.translate.useTranslate = useTranslate;
  K.translate.loadTableContent = loadTableContent;
  K.translate.extractTexts = extractTexts;
  K.translate.measureBytes = measureBytes;
  K.translate.measureOriginal = measureOriginal;
  K.translate.lineBudget = lineBudget;
  K.translate.previewLayout = previewLayout;
  K.translate.getActiveGroupId = getActiveGroupId;
  K.translate.getActiveGroupEntries = getActiveGroupEntries;
  K.translate.setFilter = setFilter;
  K.translate.setPage = setPage;
  K.translate.selectOffset = selectOffset;
  K.translate.setSourceLang = setSourceLang;
  K.translate.setTargetLang = setTargetLang;
  K.translate.setProviderMode = setProviderMode;
  K.translate.setProviderId = setProviderId;
  K.translate.setProvider = setProvider;
  K.translate.setProviderEndpoint = setProviderEndpoint;
  K.translate.setProviderModel = setProviderModel;
  K.translate.setProviderApiKey = setProviderApiKey;
  K.translate.getProviderApiKey = getProviderApiKey;
  /* Sends the compiled image to the Hex Editor and switches it to the
     compiled view, so a compile can be checked byte by byte without leaving
     the ecosystem. The loaded ROM keeps its own patches, bookmarks and
     session, which stay attached to the original view. */
  function showCompiledInHex() {
    if (!_state.modifiedRom) { _set({ status: 'Compile first.' }); return false; }
    if (!K.hex || typeof K.hex.setCompiledRom !== 'function') return false;
    K.hex.setCompiledRom(_state.modifiedRom, { at: _state.buildSummary ? _state.buildSummary.at : Date.now(), scope: _state.compileScope });
    if (typeof K.hex.setViewSource === 'function') K.hex.setViewSource('compiled');
    try {
      global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
        detail: { activity: 'hex', source: 'translation-compile' }
      }));
    } catch (_) { }
    return true;
  }

  K.translate.buildModifiedRom = buildModifiedRom;
  K.translate.showCompiledInHex = showCompiledInHex;
  K.translate.toDisplay = toDisplay;
  K.translate.fromDisplay = fromDisplay;
  K.translate.lineToken = lineToken;
  K.translate.replaceInGroup = replaceInGroup;
  K.translate.clearGroupTranslations = clearGroupTranslations;
  K.translate.saveProject = saveProject;
  K.translate.loadProjectContent = loadProjectContent;
  K.translate.downloadModifiedRom = downloadModifiedRom;
  K.translate.exportCsv = exportCsv;
  K.translate.importCsvContent = importCsvContent;
  K.translate.autoTranslateText = autoTranslateText;
  K.translate.autoTranslateGroup = autoTranslateGroup;
  K.translate.stopAutoTranslateGroup = stopAutoTranslateGroup;
  K.translate.reset = reset;
  K.translate.setRomFromLoad = setRomFromLoad;
  K.translate.getProfile = getProfile;
  K.translate.getProfileInfo = getProfileInfo;
  K.translate.loadProfileContent = loadProfileContent;
  K.translate.applyProfileForRom = _applyProfileForRom;

})(window);