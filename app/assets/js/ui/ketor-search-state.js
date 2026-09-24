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

/* ============================================================
   Ketor - Search Text State (v3)
   ------------------------------------------------------------
   Batch 16: registry unification.

   Identity:
   - Each text entry is identified by its `startByte` (offset).
     The `id` field is gone. Offsets are deterministic across
     re-extraction of the same ROM + table, so group membership
     survives re-extract naturally.

   Ordering:
   - All display order is by startByte ascending (physical ROM
     order: menu first, then intro, then dialogue, etc.).

   Group membership:
   - groups[].offsets = array of startByte numbers.
   - Backward migration from old `textIds` discards membership
     (IDs referenced transient in-memory indexes). Group names,
     colors, and order are preserved.

   New per-entry fields:
   - translatedText: '' (filled by Translation tab)
   - comment: '' (optional note)
   - source: 'extract' | 'manual'
   ============================================================ */

/* ============================================================
   Ketor - Search Text State (v4)
   ------------------------------------------------------------
   Batch 20: applyTranslations() writes many entries in one notification,
   getAssignedEntries() lists group membership for export, and
   loadSnapshot() restores a saved project.

   Batch 17: extraction options gain a strictExtractorMode flag
   and can be seeded from the per-console workflow config via
   applyExtractionDefaults(). Keys the user has edited by hand
   in this session are never overwritten by a console default.
   ============================================================ */

/* ============================================================
   Ketor - Search Text State (v5)
   ------------------------------------------------------------
   Batch 17b: the extractor now runs with the console's real
   system profile and pipeline. Previously every ROM was
   extracted with a generic profile, which meant the terminator
   set was always {0x00} (wrong for GB/GBC 0x50, GBA 0xFF,
   PCE 0xFC, NDS 0x00/0xFF/0xFE) and the retro quality filter
   never engaged for NES/SNES/GB/GBC/PCE. The profile is pushed
   by K.workflow right after ketor:rom-loaded.
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
    systemProfile: null,
    extractionOptions: {
      minLength: 3,
      maxLength: 1024,
      asciiFallback: true,
      usePaddingByte: false,
      enableDteMteCompression: true,
      enableTextDecompression: false,
      includeCompressedReadOnly: false,
      strictExtractorMode: false
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
    expandedGroups: {},
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
        expandedGroups: _state.expandedGroups,
        page: _state.page || 1
      };
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (_) { }
  }

  function _migrateGroup(g) {
    var copy = Object.assign({}, g);
    // Batch 16: textIds (index-based, transient) -> offsets.
    // Old textIds cannot be mapped without in-memory texts;
    // discard membership but keep group name/color/order.
    if (Array.isArray(copy.textIds) && !Array.isArray(copy.offsets)) {
      copy.offsets = [];
      delete copy.textIds;
    }
    if (!Array.isArray(copy.offsets)) copy.offsets = [];
    return copy;
  }

  function _restore() {
    try {
      var raw = global.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var patch = {};
      if (saved.extractionOptions) patch.extractionOptions = saved.extractionOptions;
      if (saved.filter) patch.filter = saved.filter;
      if (saved.marked && typeof saved.marked === 'object') {
        // Marked keys were stringified index IDs; discard.
        patch.marked = {};
      }
      if (saved.groups && Array.isArray(saved.groups)) {
        patch.groups = saved.groups.map(_migrateGroup);
      }
      if (saved.selectedGroupId) patch.selectedGroupId = saved.selectedGroupId;
      if (saved.expandedGroups && typeof saved.expandedGroups === 'object') {
        patch.expandedGroups = saved.expandedGroups;
      }
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

  function _offsetHex(sb) {
    return '0x' + Number(sb || 0).toString(16).toUpperCase().padStart(6, '0');
  }

  function setRomFromLoad(result, systemName) {
    _set({
      romBytes: result.data || null,
      romName: result.name || '',
      romSystem: systemName || 'Unknown',
      romSize: result.size || 0,
      // Cleared here so a stale profile can never leak into the next
      // ROM; K.workflow pushes the new one right after the event.
      systemProfile: null,
      // A .tbl belongs to one game, so keeping the previous ROM's
      // table would silently extract the new ROM with the wrong
      // character map. Status already tells the user to load one.
      tableData: null,
      texts: [],
      marked: {},
      groups: [],
      selectedGroupId: null,
      expandedGroups: {},
      isExtracting: false,
      progress: 0,
      page: 1,
      listScrollTop: 0,
      status: 'ROM ready. Load a table to extract texts.'
    });
  }

  function setSystemProfile(profile) {
    if (!profile || typeof profile !== 'object') { _set({ systemProfile: null }); return; }
    _set({ systemProfile: profile });
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

  // Option keys the user changed by hand this session. Console
  // defaults from applyExtractionDefaults() must not clobber them.
  var _optionOverrides = {};

  function setExtractionOptions(patch) {
    var p = patch || {};
    Object.keys(p).forEach(function (k) { _optionOverrides[k] = true; });
    var next = Object.assign({}, _state.extractionOptions, p);
    _set({ extractionOptions: next });
  }

  // Seeds console-recommended extraction defaults. Only keys the
  // user has not touched are filled, so switching ROMs adapts the
  // defaults without discarding deliberate choices.
  function applyExtractionDefaults(patch) {
    var p = patch || {};
    var next = null;
    Object.keys(p).forEach(function (k) {
      if (_optionOverrides[k]) return;
      if (_state.extractionOptions[k] === p[k]) return;
      if (!next) next = Object.assign({}, _state.extractionOptions);
      next[k] = p[k];
    });
    if (next) _set({ extractionOptions: next });
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

  function setExpandedGroups(map) {
    _set({ expandedGroups: map || {} });
  }

  function toggleGroupExpand(id) {
    var next = Object.assign({}, _state.expandedGroups);
    next[id] = !next[id];
    _set({ expandedGroups: next });
  }

  function expandGroup(id) {
    if (_state.expandedGroups[id]) return;
    var next = Object.assign({}, _state.expandedGroups);
    next[id] = true;
    _set({ expandedGroups: next });
  }

  // Marking uses startByte keys.
  function toggleMark(startByte) {
    var key = String(Number(startByte));
    var next = Object.assign({}, _state.marked);
    if (next[key]) delete next[key];
    else next[key] = true;
    _set({ marked: next });
  }

  function markAll(startBytes) {
    var next = Object.assign({}, _state.marked);
    (startBytes || []).forEach(function (sb) { next[String(Number(sb))] = true; });
    _set({ marked: next });
  }

  function unmarkAll() { _set({ marked: {} }); }

  function getMarkedOffsets() {
    return Object.keys(_state.marked).map(function (k) { return Number(k); });
  }

  function createGroup(name) {
    var n = String(name || '').trim();
    if (!n) return null;
    var group = {
      id: 'g-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: n,
      color: _nextColor(),
      offsets: [],
      createdAt: Date.now()
    };
    var expanded = Object.assign({}, _state.expandedGroups);
    expanded[group.id] = true;
    _set({
      groups: _state.groups.concat([group]),
      selectedGroupId: group.id,
      expandedGroups: expanded
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
    var expanded = Object.assign({}, _state.expandedGroups);
    delete expanded[id];
    _set({ groups: next, selectedGroupId: nextSelected, expandedGroups: expanded });
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

  function moveTextInGroup(groupId, offset, direction) {
    var sb = Number(offset);
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      var list = (g.offsets || []).slice();
      var idx = list.indexOf(sb);
      if (idx < 0) return g;
      var target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= list.length) return g;
      var tmp = list[idx];
      list[idx] = list[target];
      list[target] = tmp;
      return Object.assign({}, g, { offsets: list });
    });
    _set({ groups: next });
  }

  function sortTextsInGroup(groupId) {
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      var list = (g.offsets || []).slice().sort(function (a, b) { return a - b; });
      return Object.assign({}, g, { offsets: list });
    });
    _set({ groups: next, status: 'Group sorted by offset.' });
  }

  function assignMarkedToGroup(groupId) {
    if (!groupId) { _set({ status: 'Select or create a group first.' }); return; }
    var markedOffsets = getMarkedOffsets();
    if (!markedOffsets.length) { _set({ status: 'No texts marked.' }); return; }

    var targetGroup = null;
    _state.groups.forEach(function (g) { if (g.id === groupId) targetGroup = g; });
    if (!targetGroup) { _set({ status: 'Group not found.' }); return; }

    var alreadyAssigned = {};
    _state.groups.forEach(function (g) {
      if (g.id === groupId) return;
      (g.offsets || []).forEach(function (off) { alreadyAssigned[off] = true; });
    });

    var toAdd = [];
    var skipped = 0;
    var existing = targetGroup.offsets || [];
    markedOffsets.forEach(function (off) {
      if (alreadyAssigned[off]) { skipped++; return; }
      if (existing.indexOf(off) !== -1) return;
      toAdd.push(off);
    });

    if (!toAdd.length && skipped === 0) {
      _set({ status: 'Nothing to add.' });
      return;
    }

    toAdd.sort(function (a, b) { return a - b; });

    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      var merged = (g.offsets || []).concat(toAdd);
      merged.sort(function (a, b) { return a - b; });
      return Object.assign({}, g, { offsets: merged });
    });

    var msg = 'Added ' + toAdd.length + ' text(s) to "' + targetGroup.name + '".';
    if (skipped > 0) msg += ' ' + skipped + ' skipped (already in another group).';

    _set({
      groups: next,
      marked: {},
      status: msg
    });
  }

  function removeFromGroup(groupId, offset) {
    var sb = Number(offset);
    var next = _state.groups.map(function (g) {
      if (g.id !== groupId) return g;
      return Object.assign({}, g, {
        offsets: (g.offsets || []).filter(function (o) { return o !== sb; })
      });
    });
    _set({ groups: next, status: 'Removed ' + _offsetHex(sb) + ' from group.' });
  }

  function getGroupForText(startByte) {
    var sb = Number(startByte);
    for (var i = 0; i < _state.groups.length; i++) {
      var g = _state.groups[i];
      if (g.offsets && g.offsets.indexOf(sb) !== -1) return g;
    }
    return null;
  }

  // Derived: set of all startBytes currently assigned to any group.
  function getAssignedOffsets() {
    var set = new Set();
    (_state.groups || []).forEach(function (g) {
      (g.offsets || []).forEach(function (off) { set.add(off); });
    });
    return set;
  }

  // Returns entries belonging to a specific group, sorted by startByte.
  function getTextsByGroup(groupId) {
    var g = null;
    for (var i = 0; i < _state.groups.length; i++) {
      if (_state.groups[i].id === groupId) { g = _state.groups[i]; break; }
    }
    if (!g) return [];
    var offsetSet = {};
    (g.offsets || []).forEach(function (off) { offsetSet[off] = true; });
    var texts = _state.texts || [];
    var out = texts.filter(function (t) { return offsetSet[t.startByte] === true; });
    out.sort(function (a, b) { return a.startByte - b.startByte; });
    return out;
  }

  // Returns all texts sorted by startByte (physical ROM order).
  function getSortedTexts() {
    var texts = (_state.texts || []).slice();
    texts.sort(function (a, b) {
      var aBuild = a.buildable === false ? 1 : 0;
      var bBuild = b.buildable === false ? 1 : 0;
      if (aBuild !== bBuild) return aBuild - bBuild;
      var aS = Number.isFinite(a.startByte) ? a.startByte : Number.MAX_SAFE_INTEGER;
      var bS = Number.isFinite(b.startByte) ? b.startByte : Number.MAX_SAFE_INTEGER;
      return aS - bS;
    });
    return texts;
  }

  function getFilteredTexts() {
    var texts = getSortedTexts();
    var f = _state.filter || {};
    var term = String(f.search || '').trim().toLowerCase();
    var assignedSet = getAssignedOffsets();

    return texts.filter(function (t) {
      if (f.type && f.type !== 'all') {
        if ((t.textType || '') !== f.type) return false;
      }
      if (f.assigned && f.assigned !== 'all') {
        var inGroup = assignedSet.has(t.startByte);
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

  // Every text row in the app lives in this registry, so anything that
  // wants to add one has to check what already covers those bytes first.
  // Without this the Hex Editor produced a second row for bytes an
  // extracted entry already described, complete with its own copy of the
  // control codes.
  function _overlaps(t, start, end) {
    var s = Number(t.startByte);
    if (!Number.isFinite(s)) return false;
    var len = Math.max(1, Number(t.byteLength) || 1);
    return s <= end && (s + len - 1) >= start;
  }

  // Entries whose byte span intersects [start, end], ordered by offset.
  function getTextsInRange(start, end) {
    var a = Number(start);
    var b = Number(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
    var lo = Math.min(a, b);
    var hi = Math.max(a, b);
    var out = (_state.texts || []).filter(function (t) { return _overlaps(t, lo, hi); });
    out.sort(function (x, y) { return Number(x.startByte) - Number(y.startByte); });
    return out;
  }

  function _normalizeEntry(e) {
    var copy = Object.assign({}, e);
    delete copy.id;
    if (copy.translatedText === undefined) copy.translatedText = '';
    if (copy.comment === undefined) copy.comment = '';
    if (copy.source === undefined) copy.source = 'extract';
    return copy;
  }

  function addManualEntry(payload) {
    var sb = Number(payload && payload.startByte);
    if (!Number.isFinite(sb) || sb < 0) return null;
    var text = String((payload && payload.originalText) || '').trim();
    if (!text) return null;
    var bl = Math.max(1, Number((payload && payload.byteLength) || 0));

    var texts = _state.texts || [];
    for (var i = 0; i < texts.length; i++) {
      if (Number(texts[i].startByte) === sb) {
        _set({ status: 'Entry at ' + _offsetHex(sb) + ' already exists.' });
        return sb;
      }
    }

    var covering = getTextsInRange(sb, sb + bl - 1);
    if (covering.length) {
      _set({
        status: 'Bytes ' + _offsetHex(sb) + '-' + _offsetHex(sb + bl - 1) +
          ' are already described by ' + covering.length + ' existing text(s); using those.'
      });
      return Number(covering[0].startByte);
    }

    var entry = {
      startByte: sb,
      offset: _offsetHex(sb),
      byteLength: bl,
      originalText: text,
      translatedText: '',
      comment: '',
      textType: 'dialogue',
      buildable: true,
      sourceType: 'hex-manual',
      sourceTag: 'HexEditor',
      compressed: false,
      source: 'manual'
    };

    var next = texts.concat([entry]);
    next.sort(function (a, b) { return Number(a.startByte) - Number(b.startByte); });

    _set({
      texts: next,
      status: 'Added manual entry at ' + _offsetHex(sb) + '.'
    });
    return sb;
  }

  // Bulk translation write: one store notification for a whole CSV import
  // instead of one per row.
  function applyTranslations(pairs) {
    if (!pairs || !pairs.length) return 0;
    var wanted = {};
    pairs.forEach(function (p) {
      var sb = Number(p && p.startByte);
      if (Number.isFinite(sb)) wanted[sb] = String(p.translatedText == null ? '' : p.translatedText);
    });
    var applied = 0;
    var next = (_state.texts || []).map(function (t) {
      var sb = Number(t.startByte);
      if (!Object.prototype.hasOwnProperty.call(wanted, sb)) return t;
      applied++;
      if (String(t.translatedText || '') === wanted[sb]) return t;
      return Object.assign({}, t, { translatedText: wanted[sb] });
    });
    if (applied) _set({ texts: next });
    return applied;
  }

  // Every entry that belongs to a group, with the group it belongs to.
  // Used by the CSV export and by the project file.
  function getAssignedEntries() {
    var map = {};
    (_state.texts || []).forEach(function (t) { map[Number(t.startByte)] = t; });
    var out = [];
    (_state.groups || []).forEach(function (g) {
      (g.offsets || []).forEach(function (off) {
        var entry = map[Number(off)];
        if (entry) out.push({ groupId: g.id, groupName: g.name, entry: entry });
      });
    });
    return out;
  }

  // Replaces groups and texts from a saved project file. Offsets, texts and
  // translations come back exactly as they were saved.
  function loadSnapshot(payload) {
    var data = payload || {};
    var texts = (Array.isArray(data.texts) ? data.texts : []).map(function (t) {
      var copy = Object.assign({}, t);
      copy.startByte = Number(copy.startByte);
      delete copy.id;
      if (copy.translatedText === undefined) copy.translatedText = '';
      if (copy.comment === undefined) copy.comment = '';
      if (copy.source === undefined) copy.source = 'extract';
      if (!copy.offset) copy.offset = _offsetHex(copy.startByte);
      return copy;
    }).filter(function (t) { return Number.isFinite(t.startByte) && t.startByte >= 0; });

    var groups = (Array.isArray(data.groups) ? data.groups : []).map(function (g, idx) {
      var offsets = (Array.isArray(g.offsets) ? g.offsets : [])
        .map(Number).filter(function (n) { return Number.isFinite(n); });
      return {
        id: g.id || ('g-load-' + Date.now() + '-' + idx),
        name: String(g.name || ('Group ' + (idx + 1))),
        color: g.color || COLOR_PALETTE[idx % COLOR_PALETTE.length],
        offsets: offsets,
        createdAt: Number(g.createdAt) || Date.now()
      };
    });

    texts.sort(function (a, b) { return a.startByte - b.startByte; });

    var expanded = {};
    if (groups.length) expanded[groups[0].id] = true;

    _set({
      texts: texts,
      groups: groups,
      selectedGroupId: groups.length ? groups[0].id : null,
      marked: {},
      expandedGroups: expanded,
      page: 1,
      filter: { search: '', type: 'all', assigned: 'all', minLength: 0, maxLength: 0 },
      status: 'Project loaded: ' + texts.length + ' text(s) in ' + groups.length + ' group(s).'
    });
  }

  function setTranslatedText(startByte, value) {
    var sb = Number(startByte);
    var val = String(value == null ? '' : value);
    var texts = _state.texts || [];
    var changed = false;
    var next = texts.map(function (t) {
      if (Number(t.startByte) !== sb) return t;
      if ((t.translatedText || '') === val) return t;
      changed = true;
      return Object.assign({}, t, { translatedText: val });
    });
    if (changed) _set({ texts: next });
  }

  function setComment(startByte, value) {
    var sb = Number(startByte);
    var val = String(value == null ? '' : value);
    var texts = _state.texts || [];
    var changed = false;
    var next = texts.map(function (t) {
      if (Number(t.startByte) !== sb) return t;
      if ((t.comment || '') === val) return t;
      changed = true;
      return Object.assign({}, t, { comment: val });
    });
    if (changed) _set({ texts: next });
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
          var final = buffer.map(_normalizeEntry);
          final.sort(function (a, b) {
            var aBuild = a.buildable === false ? 1 : 0;
            var bBuild = b.buildable === false ? 1 : 0;
            if (aBuild !== bBuild) return aBuild - bBuild;
            var aS = Number.isFinite(a.startByte) ? a.startByte : Number.MAX_SAFE_INTEGER;
            var bS = Number.isFinite(b.startByte) ? b.startByte : Number.MAX_SAFE_INTEGER;
            return aS - bS;
          });
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
        var arr = d.texts.map(_normalizeEntry);
        arr.sort(function (a, b) {
          var aS = Number.isFinite(a.startByte) ? a.startByte : Number.MAX_SAFE_INTEGER;
          var bS = Number.isFinite(b.startByte) ? b.startByte : Number.MAX_SAFE_INTEGER;
          return aS - bS;
        });
        _set({
          texts: arr,
          isExtracting: false,
          progress: 0,
          status: 'Extracted ' + arr.length + ' text(s).'
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

    // The extractor reads system.terminator to decide where a string
    // ends and systemPipeline to enable the retro quality filter, so
    // both have to come from the workflow that matched this ROM.
    var profile = _state.systemProfile;
    var system = {
      name: (profile && profile.name) || _state.romSystem || 'Unknown',
      terminator: (profile && Array.isArray(profile.terminator) && profile.terminator.length)
        ? profile.terminator.slice()
        : [0x00],
      pointerSize: (profile && Number(profile.pointerSize)) || 4,
      pointerEndianness: (profile && profile.pointerEndianness) || 'little',
      pointerBase: (profile && Number(profile.pointerBase)) || 0
    };
    var systemPipeline = (profile && profile.pipelineId) || 'pipeline_generic';

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
        strictExtractorMode: opts.strictExtractorMode === true,
        system: system,
        systemPipeline: systemPipeline
      }
    }, [romBuffer]);
  }

  function refresh() { _notify(); }

  function reset() {
    _set({
      romBytes: null, romName: '', romSystem: '', romSize: 0,
      tableData: null, systemProfile: null,
      texts: [], isExtracting: false, progress: 0,
      marked: {}, groups: [], selectedGroupId: null,
      expandedGroups: {}, page: 1, listScrollTop: 0,
      status: ''
    });
  }

  _restore();

  K.search.getState = getState;
  K.search.subscribe = subscribe;
  K.search.useSearch = useSearch;
  K.search.setRomFromLoad = setRomFromLoad;
  K.search.setTableData = setTableData;
  K.search.setSystemProfile = setSystemProfile;
  K.search.setExtractionOptions = setExtractionOptions;
  K.search.applyExtractionDefaults = applyExtractionDefaults;
  K.search.setFilter = setFilter;
  K.search.setPage = setPage;
  K.search.setListScrollTop = setListScrollTop;
  K.search.setExpandedGroups = setExpandedGroups;
  K.search.toggleGroupExpand = toggleGroupExpand;
  K.search.expandGroup = expandGroup;
  K.search.toggleMark = toggleMark;
  K.search.markAll = markAll;
  K.search.unmarkAll = unmarkAll;
  K.search.getMarkedOffsets = getMarkedOffsets;
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
  K.search.getAssignedOffsets = getAssignedOffsets;
  K.search.getTextsByGroup = getTextsByGroup;
  K.search.getSortedTexts = getSortedTexts;
  K.search.getFilteredTexts = getFilteredTexts;
  K.search.getTextsInRange = getTextsInRange;
  K.search.addManualEntry = addManualEntry;
  K.search.setTranslatedText = setTranslatedText;
  K.search.applyTranslations = applyTranslations;
  K.search.getAssignedEntries = getAssignedEntries;
  K.search.loadSnapshot = loadSnapshot;
  K.search.setComment = setComment;
  K.search.extractTexts = extractTexts;
  K.search.refresh = refresh;
  K.search.reset = reset;
  K.search.COLOR_PALETTE = COLOR_PALETTE;

})(window);