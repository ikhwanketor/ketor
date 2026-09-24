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
    sourceLang: 'en', targetLang: 'id',
    providerMode: 'free',
    providerId: 'openai',
    providerEndpoint: '',
    providerModel: 'gpt-4o-mini'
  };

  var _listeners = new Set();
  var _workers = { table: null, build: null };
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

  // ---- UI (filter, page, selection) ----
  function setFilter(f) { _set({ filter: String(f || ''), page: 1 }); }
  function setPage(p) { _set({ page: Math.max(1, Number(p) || 1) }); }
  function selectOffset(off) {
    var o = Number(off);
    _set({ selectedOffset: Number.isFinite(o) ? o : null });
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
    var buildTexts = searchTexts.filter(function (t) {
      return assigned.has(Number(t.startByte)) &&
             (t.translatedText || '').trim().length > 0;
    });

    var scopeLabel = 'all groups';
    if (compileScope === 'group') {
      var gid = K.search.getState().selectedGroupId;
      if (!gid) { _set({ status: 'Select a group first.' }); return; }
      var inGroup = {};
      K.search.getTextsByGroup(gid).forEach(function (t) { inGroup[Number(t.startByte)] = true; });
      buildTexts = buildTexts.filter(function (t) { return inGroup[Number(t.startByte)] === true; });
      var g = null;
      K.search.getState().groups.forEach(function (x) { if (x.id === gid) g = x; });
      scopeLabel = g ? 'group "' + g.name + '"' : 'the selected group';
    }

    if (!buildTexts.length) {
      _set({ status: 'No translated texts in ' + scopeLabel + '.' });
      return;
    }

    _set({
      isBusy: true, progress: 10, compileScope: compileScope,
      status: 'Compiling ' + buildTexts.length + ' text(s) from ' + scopeLabel + '...'
    });

    var mch = {};
    _buildMasterMap(_state.tableData, mch);
    Object.keys(mch).forEach(function (k) {
      mch[k] = Array.from(mch[k]);
    });

    var rb = _state.romBytes;
    var romBuffer = rb.buffer.slice(rb.byteOffset, rb.byteOffset + rb.byteLength);

    _workers.build.postMessage({
      type: 'buildRom',
      payload: {
        originalRom: romBuffer,
        allTexts: buildTexts,
        tableData: { masterCharToHex: mch },
        system: {
          name: _state.romSystem, terminator: [0x00],
          pointerSize: 4, pointerEndianness: 'little', pointerBase: 0
        },
        usePaddingByte: false,
        pointerGroups: []
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
      _set({
        modifiedRom: bytes, isBusy: false, progress: 100,
        status: 'Compiled' + scopeNote + ': ' + Math.round(bytes.length / 1024) + ' KB'
      });
      setTimeout(function () { _set({ progress: 0 }); }, 800);
      return;
    }
    if (d.type === 'error') {
      _set({ isBusy: false, progress: 0, status: 'Build error: ' + (d.message || '') });
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
        _csvCell(t.originalText),
        _csvCell(t.translatedText)
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

    var options = { onProgress: function () { } };
    if (_state.providerMode === 'custom') {
      if (!_apiKeyCache) {
        _set({ status: 'Set an API key for ' + _state.providerId + ' first.' });
        return;
      }
      // The endpoint comes from the provider registry unless the user is on
      // the custom entry and supplied one.
      options.customApi = {
        provider: _state.providerId,
        endpoint: _state.providerEndpoint || '',
        apiKey: _apiKeyCache,
        model: _state.providerModel
      };
    }

    _setTranslating(true, sb);
    _set({ status: 'Translating ' + row.offset + '...' });
    tr(src, _state.sourceLang, _state.targetLang, options)
      .then(function (r) {
        K.search.setTranslatedText(sb, r.text);
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
      modifiedRom: null, isBusy: false, status: '', progress: 0
    });
  }

  K.translate.getState = getState;
  K.translate.subscribe = subscribe;
  K.translate.useTranslate = useTranslate;
  K.translate.loadTableContent = loadTableContent;
  K.translate.extractTexts = extractTexts;
  K.translate.measureBytes = measureBytes;
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
  K.translate.buildModifiedRom = buildModifiedRom;
  K.translate.saveProject = saveProject;
  K.translate.loadProjectContent = loadProjectContent;
  K.translate.downloadModifiedRom = downloadModifiedRom;
  K.translate.exportCsv = exportCsv;
  K.translate.importCsvContent = importCsvContent;
  K.translate.autoTranslateText = autoTranslateText;
  K.translate.reset = reset;
  K.translate.setRomFromLoad = setRomFromLoad;

})(window);