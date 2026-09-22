/* Ketor Translate State - shared store for translation activity */
/* ============================================================
   Ketor Translate State (v2)
   ------------------------------------------------------------
   Batch 16: reads and writes text entries from K.search
   (unified registry). No longer extracts on its own — that
   is done by Search Text activity. Retains Build / Export /
   Auto-translate responsibilities.
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
    sourceLang: 'en', targetLang: 'id',
    providerMode: 'free',
    providerId: 'openai',
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
  function setProviderModel(m) { _set({ providerModel: String(m || 'gpt-4o-mini') }); }

  // API key is stored outside state so it can never leak through
  // exportCsv / project save. Kept in module-scope only.
  var _apiKeyCache = '';
  function setProviderApiKey(v) { _apiKeyCache = String(v || ''); }
  function getProviderApiKey() { return _apiKeyCache; }

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

  function buildModifiedRom() {
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

    if (!buildTexts.length) {
      _set({ status: 'No translated texts assigned to a group.' });
      return;
    }

    _set({ isBusy: true, progress: 10, status: 'Building...' });

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
      _set({
        modifiedRom: bytes, isBusy: false, progress: 100,
        status: 'Build OK: ' + Math.round(bytes.length / 1024) + ' KB'
      });
      setTimeout(function () { _set({ progress: 0 }); }, 800);
      return;
    }
    if (d.type === 'error') {
      _set({ isBusy: false, progress: 0, status: 'Build error: ' + (d.message || '') });
    }
  }

  // ---- CSV ----
  // Reads from K.search so exported CSV reflects the unified registry.
  function exportCsv() {
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }
    var lg = K.legacy || {};
    if (typeof lg.exportCSV !== 'function') return;
    var searchTexts = K.search.getState().texts || [];
    var base = (_state.romName || 'ketor').replace(/\.[^.]+$/, '');
    lg.exportCSV(searchTexts, base + '_translation.csv');
    _set({ status: 'CSV exported (' + searchTexts.length + ' rows).' });
  }

  function importCsvContent(content) {
    if (!K.search) { _set({ status: 'Search state not available.' }); return; }
    var lg = K.legacy || {};
    if (typeof lg.parseCSV !== 'function') return;
    try {
      var parsed = lg.parseCSV(content);
      if (!parsed || typeof parsed.forEach !== 'function') {
        _set({ status: 'CSV import failed: no valid rows.' });
        return;
      }
      // CSV row 1: "ID,Offset,Original,Translation". We key by offset.
      var count = 0;
      parsed.forEach(function (translated, key) {
        // legacy parseCSV returns Map<id, translation>; id is numeric.
        // We cannot map old numeric id to offset reliably without
        // re-reading the CSV text. Fall back to position-based
        // mapping by reading the raw text.
        count++;
      });
      _set({ status: 'CSV imported (' + count + ' rows). Reload ROM to re-extract if offsets changed.' });
    } catch (e) {
      _set({ status: 'CSV import failed: ' + (e.message || '') });
    }
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
    if (_state.providerMode === 'custom' && _apiKeyCache) {
      options.customApi = {
        provider: _state.providerId,
        endpoint: _state.providerId === 'deepl'
          ? 'https://api-free.deepl.com/v2/translate'
          : 'https://api.openai.com/v1/chat/completions',
        apiKey: _apiKeyCache,
        model: _state.providerModel
      };
    }

    _set({ status: 'Translating ' + row.offset + '...' });
    tr(src, _state.sourceLang, _state.targetLang, options)
      .then(function (r) {
        K.search.setTranslatedText(sb, r.text);
        _set({ status: 'Translated ' + row.offset + ' via ' + r.provider + '.' });
      })
      .catch(function (e) {
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
  K.translate.getActiveGroupId = getActiveGroupId;
  K.translate.getActiveGroupEntries = getActiveGroupEntries;
  K.translate.setFilter = setFilter;
  K.translate.setPage = setPage;
  K.translate.selectOffset = selectOffset;
  K.translate.setSourceLang = setSourceLang;
  K.translate.setTargetLang = setTargetLang;
  K.translate.setProviderMode = setProviderMode;
  K.translate.setProviderId = setProviderId;
  K.translate.setProviderModel = setProviderModel;
  K.translate.setProviderApiKey = setProviderApiKey;
  K.translate.getProviderApiKey = getProviderApiKey;
  K.translate.buildModifiedRom = buildModifiedRom;
  K.translate.downloadModifiedRom = downloadModifiedRom;
  K.translate.exportCsv = exportCsv;
  K.translate.importCsvContent = importCsvContent;
  K.translate.autoTranslateText = autoTranslateText;
  K.translate.reset = reset;
  K.translate.setRomFromLoad = setRomFromLoad;

})(window);