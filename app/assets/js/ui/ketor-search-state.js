/* ============================================================
   Ketor - Search Text State (v1)
   ------------------------------------------------------------
   Extraction + filter + mark + group assignment. Mirrors the
   pattern of ketor-table-state.js. Extraction uses the legacy
   worker (Ketor.legacy.createTextExtractorWorker).
   Groups + marked + filter + options persist to sessionStorage.
   Extracted texts live only in memory (re-extract after reload).
   ============================================================ */

/* ============================================================
   Ketor - Search Text State (v2)
   ------------------------------------------------------------
   Adds manual reordering for groups and texts-in-group.
   Reordering persists to sessionStorage.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  var R = global.React;
  if (!R) return;
  K.search = K.search || {};

  var SESSION_KEY = 'ketor.search.state';
  var COLOR_PALETTE = [
    '#4ec9b0', '#dcdcaa', '#f44747', '#569cd6',
    '#c586c0', '#ce9178', '#4fc1ff', '#b5cea8'
  ];

  var _state = {
    romBytes: null, romName: '', romSystem: '', romSize: 0,
    tableData: null,
    extractionOptions: {
      minLength: 3,
      maxLength: 1024,
      asciiFallback: true,
      usePaddingByte: false,
      enableDteMteCompression: true,
      enableTextDecompression: false,
      includeCompressedReadOnly: false
    },
    texts: [],
    isExtracting: false,
    progress: 0,
    filter: {
      search: '',
      type: 'all',
      assigned: 'all',
      minLength: 0,
      maxLength: 0
    },
    marked: {},
    groups: [],
    selectedGroupId: null,
    page: 1,
    listScrollTop: 0,
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
    if (changed) { _state = next; _notify(); _persist(); }
  }
  function _notify() { _listeners.forEach(function (f) { try { f(); } catch (_) { } }); }
  function getState() { return _state; }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () { };
    _listeners.add(fn);
    return function () { _listeners.delete(fn); };
  }
  function useSearch() { return R.useSyncExternalStore(subscribe, getState, getState); }

  function _persist() {
    try {
      var payload = {
        extractionOptions: _state.extractionOptions,
        filter: _state.filter,
        marked: _state.marked,
        groups: _state.groups,
        selectedGroupId: _state.selectedGroupId,
        page: _state.page || 1
      };
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (_) { }
  }
  function _restore() {
    try {
      var raw = global.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var patch = {};
      if (saved.extractionOptions) patch.extractionOptions = saved.extractionOptions;
      if (saved.filter) patch.filter = saved.filter;
      if (saved.marked) patch.marked = saved.marked;
      if (saved.groups && Array.isArray(saved.groups)) patch.groups = saved.groups;
      if (saved.selectedGroupId) patch.selectedGroupId = saved.selectedGroupId;
      if (Number.isFinite(Number(saved.page)) && Number(saved.page) > 0) {
        patch.page = Math.floor(Number(saved.page));
      }
      _set(patch);
    } catch (_) { }
  }

  function _nextColor() {
    var used = {};
    (_state.groups || []).forEach(function (g) { used[g.color] = true; });
    for (var i = 0; i < COLOR_PALETTE.length; i++) {
      if (!used[COLOR_PALETTE[i]]) return COLOR_PALETTE[i];
    }
    return COLOR_PALETTE[_state.groups.length % COLOR_PALETTE.length];
  }

  function setRomFromLoad(result, systemName) {
    _set({
      romBytes: result.data || null,
      romName: result.name || '',
      romSystem: systemName || 'Unknown',
      romSize: result.size || 0,
      texts: [],
      marked: {},
      groups: [],
      selectedGroupId: null,
      isExtracting: false,
      progress: 0,
      status: 'ROM ready. Load a table to extract texts.'
    });
  }

  function setTableData(tableData) {
    if (!tableData) { _set({ tableData: null }); return; }
    _set({
      tableData: tableData,
      status: tableData.entryCount
        ? 'Table ready: ' + tableData.entryCount + ' entries.'
        : 'Table is empty.'
    });
  }

  function setExtractionOptions(patch) {
    var next = Object.assign({}, _state.extractionOptions, patch || {});
    _set({ extractionOptions: next });
  }

  function setFilter(patch) {
    var next = Object.assign({}, _state.filter, patch || {});
    _set({ filter: next });
  }

  function setPage(p) {
    var n = Math.max(1, Math.floor(Number(p) || 1));
    if (n === _state.page) return;
    _set({ page: n, listScrollTop: 0 });
  }

  function setListScrollTop(px) {
    var n = Math.max(0, Math.floor(Number(px) || 0));
    if (n === _state.listScrollTop) return;
    _state = Object.assign({}, _state, { listScrollTop: n });
  }

  function toggleMark(textId) {
    var id = String(textId);
    var next = Object.assign({}, _state.marked);
    if (next[id]) delete next[id];
    else next[id] = true;
    _set({ marked: next });
  }

  function markAll(ids) {
    var next = Object.assign({}, _state.marked);
    (ids || []).forEach(function (id) { next[String(id)] = true; });
    _set({ marked: next });
  }

  function unmarkAll() { _set({ marked: {} }); }

  function getMarkedIds() {
    return Object.keys(_state.marked).map(function (k) { return Number(k); });
  }

  function createGroup(name) {
    var n = String(name || '').trim();
    if (!n) return null;
    var group = {
      id: 'g-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: n,
      color: _nextColor(),
      textIds: [],
      createdAt: Date.now()
    };
    _set({
      groups: _state.groups.concat([group]),
      selectedGroupId: group.id
    });
    return group.id;
  }

  function renameGroup(id, name) {
    var n = String(name || '').trim();
    if (!n) return;
    var next = _state.groups.map(function (g) {
      if (g.id !== id) return g;
      return Object.assign({}, g, { name: n });
    });
    _set({ groups: next });
  }

  function deleteGroup(id) {
    var next = _state.groups.filter(function (g) { return g.id !== id; });
    var nextSelected = _state.selectedGroupId === id ? null : _state.selectedGroupId;
    _set({ groups: next, selectedGroupId: nextSelected });
  }

  function selectGroup(id) {
    _set({ selectedGroupId: id || null });
  }

  function moveGroup(id, direction) {
    var idx = -1;
    for (var i = 0; i < _state.groups.length; i++) {
      if (_state.groups[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= _state.groups.length) return;
    var next = _state.groups.slice();
    var tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    _set({ groups: next });
  }

  function moveGroupTo(id, toIndex) {
    var idx = -1;
    for (var i = 0; i < _state.groups.length; i++) {
      if (_state.groups[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;
    var clamped = Math.max(0, Math.min(_state.groups.length - 1, Number(toIndex) || 0));
    if (clamped === idx) return;
    var next = _state.groups.slice();
    var item = next.splice(idx, 1)[0];
    next.splice(clamped, 0, item);
    _set({ groups: next });
  }

  function sortGroupsByName() {
    var next = _state.groups.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    _set({ groups: next, status: 'Groups sorted by name.' });
  }

  function moveTextInGroup(groupId, textId, direction) {
    var tid = Number(textId);
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      var ids = (g.textIds || []).slice();
      var idx = ids.indexOf(tid);
      if (idx < 0) return g;
      var target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= ids.length) return g;
      var tmp = ids[idx];
      ids[idx] = ids[target];
      ids[target] = tmp;
      return Object.assign({}, g, { textIds: ids });
    });
    _set({ groups: next });
  }

  function sortTextsInGroup(groupId) {
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      var ids = (g.textIds || []).slice().sort(function (a, b) {
        return Number(a) - Number(b);
      });
      return Object.assign({}, g, { textIds: ids });
    });
    _set({ groups: next, status: 'Group texts sorted by ID.' });
  }

  function assignMarkedToGroup(groupId) {
    if (!groupId) { _set({ status: 'Select or create a group first.' }); return; }
    var markedIds = getMarkedIds();
    if (!markedIds.length) { _set({ status: 'No texts marked.' }); return; }

    var targetGroup = null;
    _state.groups.forEach(function (g) { if (g.id === groupId) targetGroup = g; });
    if (!targetGroup) { _set({ status: 'Group not found.' }); return; }

    var alreadyAssigned = {};
    _state.groups.forEach(function (g) {
      if (g.id === groupId) return;
      (g.textIds || []).forEach(function (tid) { alreadyAssigned[tid] = true; });
    });

    var toAdd = [];
    var skipped = 0;
    markedIds.forEach(function (tid) {
      if (alreadyAssigned[tid]) { skipped++; return; }
      if (targetGroup.textIds.indexOf(tid) !== -1) return;
      toAdd.push(tid);
    });

    if (!toAdd.length && skipped === 0) {
      _set({ status: 'Nothing to add.' });
      return;
    }

    // Sort new additions by ID before appending, so groups stay
    // human-readable by default.
    toAdd.sort(function (a, b) { return a - b; });

    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      return Object.assign({}, g, { textIds: g.textIds.concat(toAdd) });
    });

    var msg = 'Added ' + toAdd.length + ' text(s) to "' + targetGroup.name + '".';
    if (skipped > 0) msg += ' ' + skipped + ' skipped (already in another group).';

    _set({
      groups: next,
      marked: {},
      status: msg
    });
  }

  function removeFromGroup(groupId, textId) {
    var tid = Number(textId);
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      return Object.assign({}, g, {
        textIds: g.textIds.filter(function (t) { return t !== tid; })
      });
    });
    _set({ groups: next, status: 'Removed text ' + tid + ' from group.' });
  }

  function getGroupForText(textId) {
    var tid = Number(textId);
    for (var i = 0; i < _state.groups.length; i++) {
      var g = _state.groups[i];
      if (g.textIds && g.textIds.indexOf(tid) !== -1) return g;
    }
    return null;
  }

  function getFilteredTexts() {
    var texts = _state.texts || [];
    var f = _state.filter || {};
    var term = String(f.search || '').trim().toLowerCase();

    return texts.filter(function (t) {
      if (f.type && f.type !== 'all') {
        if ((t.textType || '') !== f.type) return false;
      }
      if (f.assigned && f.assigned !== 'all') {
        var inGroup = getGroupForText(t.id) !== null;
        if (f.assigned === 'assigned' && !inGroup) return false;
        if (f.assigned === 'unassigned' && inGroup) return false;
      }
      var len = String(t.originalText || '').length;
      if (f.minLength > 0 && len < f.minLength) return false;
      if (f.maxLength > 0 && len > f.maxLength) return false;
      if (term) {
        var orig = String(t.originalText || '').toLowerCase();
        var tr = String(t.translatedText || '').toLowerCase();
        var off = String(t.offset || '').toLowerCase();
        if (orig.indexOf(term) === -1 &&
            tr.indexOf(term) === -1 &&
            off.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function extractTexts() {
    var lg = K.legacy || {};
    if (typeof lg.createTextExtractorWorker !== 'function') {
      _set({ status: 'Extractor worker is not available.' });
      return;
    }
    if (!_state.romBytes || !_state.tableData) {
      _set({ status: 'Load a ROM and Table first.' });
      return;
    }

    _set({
      isExtracting: true,
      progress: 5,
      texts: [],
      marked: {},
      status: 'Extracting...'
    });

    var buffer = [];
    var worker;
    try {
      worker = lg.createTextExtractorWorker();
    } catch (err) {
      _set({ isExtracting: false, status: 'Failed to start extractor: ' + (err.message || '') });
      return;
    }

    worker.onmessage = function (ev) {
      var d = ev.data || {};
      if (d.type === 'progress') {
        _set({ progress: Math.max(0, Math.min(100, Number(d.value) || 0)) });
        return;
      }
      if (d.type === 'resultChunk') {
        if (Array.isArray(d.texts) && d.texts.length) {
          buffer = buffer.concat(d.texts);
        }
        if (d.done) {
          var final = buffer.slice();
          buffer = [];
          _set({
            texts: final,
            isExtracting: false,
            progress: 0,
            status: 'Extracted ' + final.length + ' text(s).'
          });
          try { worker.terminate(); } catch (_) { }
        }
        return;
      }
      if (d.type === 'result' && Array.isArray(d.texts)) {
        _set({
          texts: d.texts,
          isExtracting: false,
          progress: 0,
          status: 'Extracted ' + d.texts.length + ' text(s).'
        });
        try { worker.terminate(); } catch (_) { }
        return;
      }
      if (d.type === 'error') {
        _set({
          isExtracting: false,
          progress: 0,
          status: 'Extract error: ' + (d.message || 'Unknown')
        });
        try { worker.terminate(); } catch (_) { }
      }
    };
    worker.onerror = function (ev) {
      _set({
        isExtracting: false,
        progress: 0,
        status: 'Extractor error: ' + (ev.message || 'unknown')
      });
      try { worker.terminate(); } catch (_) { }
    };

    var rb = _state.romBytes;
    var romBuffer = rb.buffer.slice(rb.byteOffset, rb.byteOffset + rb.byteLength);
    var opts = _state.extractionOptions || {};

    worker.postMessage({
      romBuffer: romBuffer,
      tableData: {
        singleByte: _state.tableData.singleByte || {},
        multiByte: _state.tableData.multiByte || {}
      },
      options: {
        minLength: opts.minLength || 3,
        maxLength: opts.maxLength || 1024,
        asciiFallback: opts.asciiFallback !== false,
        usePaddingByte: opts.usePaddingByte === true,
        enableDteMteCompression: opts.enableDteMteCompression !== false,
        compressionStrategy: 'optimal',
        enableTextDecompression: opts.enableTextDecompression === true,
        decompressionMode: 'auto',
        includeCompressedReadOnly: opts.includeCompressedReadOnly === true,
        strictExtractorMode: false,
        system: {
          name: _state.romSystem || 'Unknown',
          terminator: [0x00],
          pointerSize: 4,
          pointerEndianness: 'little',
          pointerBase: 0
        },
        systemPipeline: 'pipeline_generic'
      }
    }, [romBuffer]);
  }

  function reset() {
    _set({
      romBytes: null, romName: '', romSystem: '', romSize: 0,
      tableData: null,
      texts: [], isExtracting: false, progress: 0,
      marked: {}, groups: [], selectedGroupId: null, page: 1, listScrollTop: 0,
      status: ''
    });
  }

  _restore();

  K.search.getState = getState;
  K.search.subscribe = subscribe;
  K.search.useSearch = useSearch;
  K.search.setRomFromLoad = setRomFromLoad;
  K.search.setTableData = setTableData;
  K.search.setExtractionOptions = setExtractionOptions;
  K.search.setFilter = setFilter;
  K.search.setPage = setPage;
  K.search.setListScrollTop = setListScrollTop;
  K.search.toggleMark = toggleMark;
  K.search.markAll = markAll;
  K.search.unmarkAll = unmarkAll;
  K.search.getMarkedIds = getMarkedIds;
  K.search.createGroup = createGroup;
  K.search.renameGroup = renameGroup;
  K.search.deleteGroup = deleteGroup;
  K.search.selectGroup = selectGroup;
  K.search.moveGroup = moveGroup;
  K.search.moveGroupTo = moveGroupTo;
  K.search.sortGroupsByName = sortGroupsByName;
  K.search.moveTextInGroup = moveTextInGroup;
  K.search.sortTextsInGroup = sortTextsInGroup;
  K.search.assignMarkedToGroup = assignMarkedToGroup;
  K.search.removeFromGroup = removeFromGroup;
  K.search.getGroupForText = getGroupForText;
  K.search.getFilteredTexts = getFilteredTexts;
  K.search.extractTexts = extractTexts;
  K.search.reset = reset;
  K.search.COLOR_PALETTE = COLOR_PALETTE;

})(window);