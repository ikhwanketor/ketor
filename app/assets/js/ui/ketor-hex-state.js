/* ============================================================
   Ketor - Hex Editor State (v1)
   ------------------------------------------------------------
   Batch 18: byte level editing on top of the loaded ROM.

   This is an editor, not a viewer: patches map an offset to a
   replacement byte, undo/redo walk a patch history, and every
   patched byte is reported so the grid can colour it.

   Per ROM persistence: bookmarks and patches are keyed by the
   ROM they belong to (name + size + a checksum of sampled
   bytes), because two ROMs loaded in one session must never
   share patches.

   Layers (all independently toggleable):
   - sections: derived from the console layout, read only
   - controlCodes: bytes listed in K.core.CONTROL_HINTS
   - groups: ranges already assigned to a group in K.search
   - changed: bytes present in patches
   - bookmarks: byte carries a bookmark, tinted with its own colour
   - searchHits: byte starts a search hit
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  var R = global.React;
  if (!R) return;
  K.hex = K.hex || {};

  var SESSION_KEY = 'ketor.hex.state';
  var ROM_LIMIT = 4;
  var MAX_RESULTS = 2000;
  var FLASH_MS = 1600;

  var _state = {
    romBytes: null, romName: '', romSystem: '', romSize: 0, romKey: '',
    // Batch 21: the compiled image from the Translation activity. It is a
    // second view over the same session, never a replacement: patches,
    // bookmarks and the ROM key stay attached to the loaded file.
    compiledBytes: null, compiledAt: 0, compiledScope: '',
    // Offsets the last insert owns. They are dropped before the next insert so
    // pressing Insert twice cannot duplicate the text.
    insertedOffsets: {},
    // Where the last compile moved text to, from the build worker's own
    // report. The compiled view marks those ranges so "did it repoint?" can be
    // answered by looking at the ROM instead of at a log line.
    compileRelocations: [],
    viewSource: 'original',
    cursorOffset: 0,
    selection: null,
    bytesPerRow: 16,
    viewMode: 'hex+ascii',
    bookmarks: [],
    patches: {},
    undoStack: [],
    redoStack: [],
    sections: [],
    highlightLayers: {
      sections: true,
      controlCodes: true,
      groups: true,
      changed: true,
      bookmarks: true,
      searchHits: true
    },
    searchMode: 'hex',
    searchQuery: '',
    searchResults: [],
    searchIndex: -1,
    searchTruncated: false,
    isSearching: false,
    focusToken: 0,
    focusOffset: 0,
    flashOffset: null,
    status: ''
  };

  var _listeners = new Set();
  function _set(patch) {
    var changed = false, next = _state;
    Object.keys(patch).forEach(function (k) {
      if (_state[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = patch[k];
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
  function useHex() { return R.useSyncExternalStore(subscribe, getState, getState); }

  function _hex(n, width) {
    return '0x' + Number(n || 0).toString(16).toUpperCase().padStart(width || 6, '0');
  }
  function _hex2(v) {
    return (Number(v) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
  }

  /* ---------- per ROM persistence ---------- */

  // Cheap FNV-1a over sampled bytes. Name + size alone would let a
  // renamed copy of a different build inherit the previous patches.
  function _romKey(name, bytes) {
    var hash = 0x811C9DC5;
    var len = bytes ? bytes.length : 0;
    var step = Math.max(1, Math.floor(len / 128));
    for (var i = 0; i < len; i += step) {
      hash ^= bytes[i] & 0xFF;
      hash = (hash * 0x01000193) >>> 0;
    }
    return String(name || 'rom') + '|' + len + '|' + hash.toString(16);
  }

  function _readStore() {
    try {
      var raw = global.sessionStorage.getItem(SESSION_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return { roms: {} };
      if (!parsed.roms || typeof parsed.roms !== 'object') parsed.roms = {};
      return parsed;
    } catch (_) { return { roms: {} }; }
  }

  function _persist() {
    if (!_state.romKey) return;
    try {
      var store = _readStore();
      store.roms[_state.romKey] = {
        bookmarks: _state.bookmarks,
        patches: _state.patches
      };
      var keys = Object.keys(store.roms);
      if (keys.length > ROM_LIMIT) {
        keys.slice(0, keys.length - ROM_LIMIT).forEach(function (k) { delete store.roms[k]; });
      }
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
    } catch (_) { }
  }

  function _restoreFor(key) {
    var store = _readStore();
    var entry = store.roms[key];
    if (!entry) return { bookmarks: [], patches: {} };
    var patches = {};
    if (entry.patches && typeof entry.patches === 'object') {
      Object.keys(entry.patches).forEach(function (k) {
        var off = parseInt(k, 10);
        var val = Number(entry.patches[k]);
        if (Number.isFinite(off) && off >= 0 && Number.isFinite(val)) patches[off] = val & 0xFF;
      });
    }
    var bookmarks = Array.isArray(entry.bookmarks) ? entry.bookmarks.filter(function (b) {
      return b && Number.isFinite(Number(b.offset));
    }).map(function (b) {
      return { offset: Number(b.offset), label: String(b.label || ''), color: String(b.color || '#569cd6') };
    }) : [];
    return { bookmarks: bookmarks, patches: patches };
  }

  /* ---------- sections ---------- */

  // Layout facts come from the console's own header, not from
  // assumptions: iNES declares its PRG/CHR bank counts, Game Boy
  // declares its ROM size at 0x148 (32 KiB << n), GBA has a fixed
  // 0xC0 header, and a SNES copier header only exists when the file
  // is 512 bytes past a 32 KiB boundary.
  // Section accents are shared with the legend and the grid gutter so a
  // band on screen can always be traced back to its row in the list.
  var SECTION_COLORS = [
    '#569cd6', '#4ec9b0', '#dcdcaa', '#c586c0',
    '#ce9178', '#4fc1ff', '#b5cea8', '#f44747'
  ];

  function buildSections(profile, bytes) {
    if (!bytes || !bytes.length) return [];
    var name = profile && profile.name ? profile.name : '';
    var total = bytes.length;
    var out = [];

    function push(id, label, start, end) {
      if (start >= total) return;
      out.push({
        id: id,
        label: label,
        start: start,
        end: Math.min(total, end) - 1,
        color: SECTION_COLORS[out.length % SECTION_COLORS.length]
      });
    }

    if (name === 'NES' && total > 16 &&
        bytes[0] === 0x4E && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1A) {
      push('sec:ines', 'iNES header', 0, 16);
      var pos = 16;
      if (bytes[6] & 4) { push('sec:trainer', 'Trainer (512 B)', pos, pos + 512); pos += 512; }
      var prgBanks = bytes[4];
      var chrBanks = bytes[5];
      if (prgBanks) { push('sec:prg', 'PRG ROM (' + prgBanks + ' x 16 KB)', pos, pos + prgBanks * 16384); pos += prgBanks * 16384; }
      if (chrBanks) { push('sec:chr', 'CHR ROM (' + chrBanks + ' x 8 KB)', pos, pos + chrBanks * 8192); }
      return out;
    }

    if ((name === 'Game Boy' || name === 'GBC' || name === 'GB') && total > 0x150) {
      var code = bytes[0x148];
      var banks = code <= 0x08 ? (2 << code) : 0;
      push('sec:gb-header', 'Cartridge header', 0x100, 0x150);
      push('sec:gb-bank0', 'ROM bank 0 (fixed, 16 KB)', 0, 0x4000);
      if (banks > 2) {
        push('sec:gb-banks', 'Switchable banks (' + (banks - 1) + ' x 16 KB)', 0x4000, total);
      } else if (banks === 2) {
        push('sec:gb-bank1', 'ROM bank 1 (16 KB)', 0x4000, total);
      } else {
        push('sec:gb-body', 'ROM body', 0x4000, total);
      }
      return out;
    }

    if (name === 'GBA' && total > 0xC0) {
      push('sec:gba-header', 'GBA header', 0, 0xC0);
      push('sec:gba-body', 'ROM body', 0xC0, total);
      return out;
    }

    if ((name === 'SNES') && total > 0x200 && (total % 0x8000) === 0x200) {
      push('sec:snes-copier', 'Copier header (512 B)', 0, 0x200);
      push('sec:snes-rom', 'SNES ROM', 0x200, total);
      return out;
    }

    var headerSize = profile && profile.hasHeader ? Number(profile.headerSize) : 0;
    if (headerSize > 0 && headerSize < total) {
      push('sec:header', 'Header', 0, headerSize);
      push('sec:body', 'Data', headerSize, total);
      return out;
    }

    push('sec:rom', 'ROM', 0, total);
    return out;
  }

  /* ---------- ROM lifecycle ---------- */

  function setRomFromLoad(result, systemName) {
    var bytes = result && result.data ? result.data : null;
    var system = systemName || 'Unknown';
    var key = bytes ? _romKey(result.name, bytes) : '';
    var restored = key ? _restoreFor(key) : { bookmarks: [], patches: {} };
    var profile = null;
    if (K.workflow && typeof K.workflow.getSystemProfile === 'function') {
      profile = K.workflow.getSystemProfile();
    }

    _set({
      romBytes: bytes,
      romName: (result && result.name) || '',
      romSystem: system,
      romSize: (result && result.size) || (bytes ? bytes.length : 0),
      romKey: key,
      cursorOffset: 0,
      selection: null,
      bookmarks: restored.bookmarks,
      patches: restored.patches,
      undoStack: [],
      redoStack: [],
      sections: buildSections(profile, bytes),
      searchQuery: '',
      searchResults: [],
      searchIndex: -1,
      searchTruncated: false,
      flashOffset: null,
      status: bytes ? 'ROM ready. Click a byte to move the cursor.' : ''
    });
  }

  // The profile arrives after the ROM loaded, so sections are rebuilt
  // once the workflow layer knows which console this is.
  function refreshSections() {
    var profile = (K.workflow && typeof K.workflow.getSystemProfile === 'function')
      ? K.workflow.getSystemProfile() : null;
    _set({ sections: buildSections(profile, _state.romBytes) });
  }

  function reset() {
    _set({
      romBytes: null, romName: '', romSystem: '', romSize: 0, romKey: '',
      cursorOffset: 0, selection: null, bookmarks: [], patches: {},
      undoStack: [], redoStack: [], sections: [],
      compiledBytes: null, compiledAt: 0, compiledScope: '', compileRelocations: [], viewSource: 'original',
      searchQuery: '', searchResults: [], searchIndex: -1, status: ''
    });
  }

  /* ---------- cursor, selection, view ---------- */

  function _clamp(offset) {
    var len = _state.romBytes ? _state.romBytes.length : 0;
    if (!len) return 0;
    return Math.max(0, Math.min(len - 1, Number(offset) || 0));
  }

  function setCursor(offset) {
    _set({ cursorOffset: _clamp(offset) });
  }

  function gotoOffset(offset) {
    var off = _clamp(offset);
    _set({
      cursorOffset: off,
      focusOffset: off,
      focusToken: _state.focusToken + 1,
      flashOffset: off,
      status: 'Goto ' + _hex(off) + ' (' + off + ')'
    });
    _scheduleFlashClear();
  }

  function setSelection(start, end) {
    if (start === null || start === undefined) { _set({ selection: null }); return; }
    var a = _clamp(start);
    var b = _clamp(end === undefined || end === null ? start : end);
    _set({ selection: { start: Math.min(a, b), end: Math.max(a, b) } });
  }

  function clearSelection() { _set({ selection: null }); }

  function setBytesPerRow(n) {
    var v = Number(n);
    if ([8, 16, 24, 32].indexOf(v) === -1) return;
    _set({ bytesPerRow: v });
  }

  function setViewMode(mode) {
    _set({ viewMode: mode === 'hex' ? 'hex' : 'hex+ascii' });
  }

  function setHighlightLayers(patch) {
    _set({ highlightLayers: Object.assign({}, _state.highlightLayers, patch || {}) });
  }

  function toggleHighlightLayer(key) {
    var next = Object.assign({}, _state.highlightLayers);
    next[key] = !next[key];
    _set({ highlightLayers: next });
  }

  var _flashTimer = null;
  function _scheduleFlashClear() {
    if (_flashTimer) { clearTimeout(_flashTimer); }
    _flashTimer = setTimeout(function () {
      _flashTimer = null;
      _set({ flashOffset: null });
    }, FLASH_MS);
  }

  /* ---------- patches ---------- */

  /* A patched byte changes the text it belongs to. Without this the Hex
     Editor and the Translation activity disagree about the same ROM: the
     grid shows the new byte while Search Text and Translation keep showing
     the string as it was extracted. The registry is the single owner of that
     text, so the fix belongs here: decode the affected entries again from
     the patched bytes and write the result back. */
  function _syncRegistryFor(offsets) {
    if (!K.search || typeof K.search.setOriginalText !== 'function') return 0;
    if (!offsets || !offsets.length) return 0;
    var texts = K.search.getState().texts || [];
    if (!texts.length) return 0;

    var affected = [];
    offsets.forEach(function (raw) {
      var off = Number(raw);
      for (var i = 0; i < texts.length; i++) {
        var t = texts[i];
        var start = Number(t.startByte);
        var len = Math.max(1, Number(t.byteLength) || 1);
        if (off >= start && off <= start + len - 1) {
          if (affected.indexOf(t) === -1) affected.push(t);
          break;
        }
      }
    });
    if (!affected.length) return 0;

    var changed = 0;
    affected.forEach(function (t) {
      var start = Number(t.startByte);
      var len = Math.max(1, Number(t.byteLength) || 1);
      var decoded = decodeRange(start, start + len - 1);
      if (decoded.text && decoded.text !== String(t.originalText || '')) {
        // The Hex Editor never rewrites the original text: an insert lives in the
        // patch layer, so re-decoding it here turned the original into the
        // translation. The text stays what the table decoded from the loaded ROM.
      }
    });
    return changed;
  }

  function _patchedOffsets() {
    return Object.keys(_state.patches || {}).map(Number);
  }

  /* ---------- view source: original ROM or compiled image ---------- */

  function isCompiledView() {
    return _state.viewSource === 'compiled' && !!_state.compiledBytes;
  }

  function viewBytes() {
    if (isCompiledView()) return _state.compiledBytes;
    return _state.romBytes;
  }

  // Patches belong to the loaded ROM. The compiled image is already the
  // result of those patches, so applying them again would show a byte that
  // is not in the file.
  function viewPatches() {
    return isCompiledView() ? {} : _state.patches;
  }

  function setCompiledRom(bytes, meta) {
    var data = null;
    if (bytes instanceof Uint8Array) data = bytes;
    else if (bytes instanceof ArrayBuffer) data = new Uint8Array(bytes);
    else if (bytes && bytes.buffer) data = new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    if (!data || !data.length) return false;
    var info = meta || {};
    _set({
      compiledBytes: data,
      compiledAt: Number(info.at) || Date.now(),
      compiledScope: String(info.scope || ''),
      compileRelocations: Array.isArray(info.relocations) ? info.relocations.slice() : [],
      // The editor stays on the loaded ROM: it is the one buffer the whole
      // session edits. Compiling reports its result, it does not take the
      // editor over.
      status: 'Inserted ROM ready (' + Math.round(data.length / 1024) + ' KB). The Hex Editor keeps editing the loaded ROM.'
    });
    return true;
  }

  /* The compiled image is invalid the moment its sources change (translations
     cleared, project reloaded), so it is dropped instead of being left on
     screen as if it still matched the work. */
  function clearCompiledRom() {
    if (!_state.compiledBytes && _state.viewSource === 'original') return false;
    _set({
      compiledBytes: null, compiledAt: 0, compiledScope: '', compileRelocations: [],
      viewSource: 'original',
      status: _state.compiledBytes ? 'Inserted result discarded.' : _state.status
    });
    return true;
  }

  function setViewSource(source) {
    var next = source === 'compiled' ? 'compiled' : 'original';
    if (next === 'compiled' && !_state.compiledBytes) {
      _set({ status: 'Nothing inserted yet. Use Insert in the Translation activity first.' });
      return false;
    }
    if (next === _state.viewSource) return true;
    _set({
      viewSource: next,
      selection: null,
      status: next === 'compiled'
        ? 'Viewing the inserted ROM.'
        : 'Viewing the loaded ROM.'
    });
    return true;
  }

  /* The inserted ROM becomes the buffer this session shows and exports. The
     loaded file stays the source for the next insert; without this the Hex
     Editor kept showing the source ROM and Export wrote it, so an insert that
     the log reported as done was invisible and never reached the game. */
  function adoptInsertedRom(bytes, meta) {
    var data = null;
    if (bytes instanceof Uint8Array) data = bytes;
    else if (bytes instanceof ArrayBuffer) data = new Uint8Array(bytes);
    else if (bytes && bytes.buffer) data = new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    if (!data || !data.length) return false;
    var info = meta || {};
    var source = _state.romBytes;
    if (!source || source.length !== data.length) return false;

    // The insert is expressed as a patch layer on top of the loaded ROM, not
    // as a replacement for it. That is what makes one ecosystem work: the Hex
    // Editor shows the inserted bytes, paints them as changed bytes, Clear
    // discards them (back to the source) and Export writes source + patches.
    var patches = Object.assign({}, _state.patches);
    var inserted = {};
    var diffCount = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i] === source[i]) continue;
      inserted[i] = true;
      if (patches[i] !== data[i]) diffCount++;
      patches[i] = data[i];
    }
    _set({
      patches: patches,
      insertedOffsets: inserted,
      compiledBytes: data,
      compileRelocations: Array.isArray(info.relocations) ? info.relocations.slice() : [],
      compiledAt: Number(info.at) || Date.now(),
      compiledScope: String(info.scope || ''),
      status: 'Inserted ROM applied as ' + diffCount + ' changed byte(s) over the loaded ROM. ' +
        'Clear in the Hex Editor discards the insert.'
    });
    return true;
  }

  function currentByte(offset) {
    var off = Number(offset);
    if (isCompiledView()) {
      if (off < 0 || off >= _state.compiledBytes.length) return null;
      return _state.compiledBytes[off] & 0xFF;
    }
    var patch = _state.patches[off];
    if (patch !== undefined) return patch & 0xFF;
    if (!_state.romBytes || off < 0 || off >= _state.romBytes.length) return null;
    return _state.romBytes[off] & 0xFF;
  }

  function isPatched(offset) {
    return _state.patches[Number(offset)] !== undefined;
  }

  function setByte(offset, value) {
    var off = Number(offset);
    var val = Number(value) & 0xFF;
    // The compiled image is a read-only view: a byte typed here would vanish
    // on the next compile, so the edit is refused with a reason instead.
    if (isCompiledView()) {
      _set({ status: 'This is the inserted ROM.' });
      return false;
    }
    if (!_state.romBytes || !Number.isFinite(off) || off < 0 || off >= _state.romBytes.length) return false;
    if (!Number.isFinite(Number(value))) return false;
    var before = currentByte(off);
    if (before === val) return false;

    var patches = Object.assign({}, _state.patches);
    if (val === (_state.romBytes[off] & 0xFF)) delete patches[off];
    else patches[off] = val;

    _set({
      patches: patches,
      undoStack: _state.undoStack.concat([{ offset: off, from: before, to: val }]),
      redoStack: [],
      status: 'Patched ' + _hex(off) + ': ' + _hex2(before) + ' -> ' + _hex2(val)
    });
    var resynced = _syncRegistryFor([off]);
    if (resynced) _set({ status: _state.status + ' · ' + resynced + ' text re-decoded' });
    _persist();
    return true;
  }

  function _applyPatchEntry(offset, value) {
    var patches = Object.assign({}, _state.patches);
    if (value === (_state.romBytes[offset] & 0xFF)) delete patches[offset];
    else patches[offset] = value & 0xFF;
    return patches;
  }

  function undo() {
    var stack = _state.undoStack;
    if (!stack.length || !_state.romBytes) return false;
    var entry = stack[stack.length - 1];
    _set({
      patches: _applyPatchEntry(entry.offset, entry.from),
      undoStack: stack.slice(0, -1),
      redoStack: _state.redoStack.concat([entry]),
      cursorOffset: entry.offset,
      status: 'Undo ' + _hex(entry.offset) + ' -> ' + _hex2(entry.from)
    });
    _syncRegistryFor([entry.offset]);
    _persist();
    return true;
  }

  function redo() {
    var stack = _state.redoStack;
    if (!stack.length || !_state.romBytes) return false;
    var entry = stack[stack.length - 1];
    _set({
      patches: _applyPatchEntry(entry.offset, entry.to),
      redoStack: stack.slice(0, -1),
      undoStack: _state.undoStack.concat([entry]),
      cursorOffset: entry.offset,
      status: 'Redo ' + _hex(entry.offset) + ' -> ' + _hex2(entry.to)
    });
    _syncRegistryFor([entry.offset]);
    _persist();
    return true;
  }

  function clearPatches() {
    // The insert is a patch layer too, so clearing patches clears it.
    _state = Object.assign({}, _state, { insertedOffsets: {} });
    if (!Object.keys(_state.patches).length) { _set({ status: 'No patches to clear.' }); return; }
    var count = Object.keys(_state.patches).length;
    var touched = _patchedOffsets();
    _set({ patches: {}, undoStack: [], redoStack: [], status: 'Cleared ' + count + ' patch(es).' });
    var resynced = _syncRegistryFor(touched);
    if (resynced) _set({ status: _state.status + ' · ' + resynced + ' text re-decoded' });
    _persist();
  }

  function getPatchedBytes() {
    if (!_state.romBytes) return null;
    var out = new Uint8Array(_state.romBytes.length);
    out.set(_state.romBytes);
    Object.keys(_state.patches).forEach(function (k) {
      var off = parseInt(k, 10);
      if (off >= 0 && off < out.length) out[off] = _state.patches[k] & 0xFF;
    });
    return out;
  }

  function exportPatchedRom() {
    var bytes = getPatchedBytes();
    if (!bytes) { _set({ status: 'No ROM loaded.' }); return; }
    var name = (_state.romName || 'patched.rom').replace(/\.[^.]+$/, '') + '_patched.rom';
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _set({
      status: 'Exported ' + name + ' (' + Object.keys(_state.patches).length + ' patch(es))'
    });
  }

  /* ---------- bookmarks ---------- */

  function addBookmark(offset, label) {
    var off = _clamp(offset);
    if (!_state.romBytes) return null;
    var exists = false;
    _state.bookmarks.forEach(function (b) { if (b.offset === off) exists = true; });
    if (exists) { _set({ status: 'Bookmark already set at ' + _hex(off) + '.' }); return off; }
    var palette = (K.search && K.search.COLOR_PALETTE) || ['#569cd6'];
    var bookmark = {
      offset: off,
      label: String(label || '').trim() || _hex(off),
      color: palette[_state.bookmarks.length % palette.length]
    };
    var next = _state.bookmarks.concat([bookmark]).sort(function (a, b) { return a.offset - b.offset; });
    _set({ bookmarks: next, status: 'Bookmark added at ' + _hex(off) + '.' });
    _persist();
    return off;
  }

  function removeBookmark(offset) {
    var off = Number(offset);
    var next = _state.bookmarks.filter(function (b) { return b.offset !== off; });
    if (next.length === _state.bookmarks.length) return;
    _set({ bookmarks: next, status: 'Bookmark removed at ' + _hex(off) + '.' });
    _persist();
  }

  function renameBookmark(offset, label) {
    var off = Number(offset);
    var next = _state.bookmarks.map(function (b) {
      if (b.offset !== off) return b;
      return Object.assign({}, b, { label: String(label || '').trim() || _hex(off) });
    });
    _set({ bookmarks: next });
    _persist();
  }

  function clearBookmarks() {
    if (!_state.bookmarks.length) return;
    _set({ bookmarks: [], status: 'Bookmarks cleared.' });
    _persist();
  }

  /* ---------- table bridge ---------- */

  // The applied table lives in Search Text state; hex only reads it.
  function activeTable() {
    if (K.search && typeof K.search.getState === 'function') {
      var st = K.search.getState();
      if (st && st.tableData && st.tableData.entryCount) return st.tableData;
    }
    return null;
  }

  function _charToBytes(tableData) {
    if (!tableData) return null;
    var map = {};
    var keys = [];
    if (tableData.singleByte) {
      Object.keys(tableData.singleByte).forEach(function (k) {
        var ch = String(tableData.singleByte[k] || '');
        if (!ch) return;
        var b = parseInt(k, 10) & 0xFF;
        map[ch] = new Uint8Array([b]);
        keys.push(ch);
      });
    }
    if (tableData.multiByte) {
      Object.keys(tableData.multiByte).forEach(function (hexKey) {
        var ch = String(tableData.multiByte[hexKey] || '');
        if (!ch) return;
        var parts = String(hexKey).match(/.{1,2}/g);
        if (!parts) return;
        map[ch] = new Uint8Array(parts.map(function (h) { return parseInt(h, 16) & 0xFF; }));
        keys.push(ch);
      });
    }
    if (!keys.length) return null;
    keys.sort(function (a, b) { return b.length - a.length; });
    return { map: map, keys: keys };
  }

  function _decodeIndex(tableData) {
    if (!tableData) return null;
    var single = {};
    var multi = [];
    if (tableData.singleByte) {
      Object.keys(tableData.singleByte).forEach(function (k) {
        var ch = String(tableData.singleByte[k] || '');
        if (ch) single[parseInt(k, 10) & 0xFF] = ch;
      });
    }
    if (tableData.multiByte) {
      Object.keys(tableData.multiByte).forEach(function (hexKey) {
        var ch = String(tableData.multiByte[hexKey] || '');
        var parts = String(hexKey).match(/.{1,2}/g);
        if (!ch || !parts) return;
        multi.push({ bytes: parts.map(function (h) { return parseInt(h, 16) & 0xFF; }), char: ch });
      });
      multi.sort(function (a, b) { return b.bytes.length - a.bytes.length; });
    }
    return { single: single, multi: multi };
  }

  function decodeRange(start, end) {
    var bytes = viewBytes();
    var tableData = activeTable();
    if (!bytes) return { text: '', mapped: 0, total: 0 };
    var from = _clamp(start);
    var to = _clamp(end === undefined ? start : end);
    var index = _decodeIndex(tableData);
    var text = '';
    var mapped = 0;
    var total = 0;
    var i = from;

    // Read through the patches: what the grid shows is what gets decoded, so
    // a marked range and a re-decode after an edit both match the screen.
    var livePatches = viewPatches();
    var byteAt = function (idx) {
      var p = livePatches[idx];
      if (p !== undefined) return p & 0xFF;
      return bytes[idx] & 0xFF;
    };

    while (i <= to) {
      total++;
      var hit = null;
      if (index) {
        for (var m = 0; m < index.multi.length; m++) {
          var cand = index.multi[m];
          if (i + cand.bytes.length - 1 > to) continue;
          var same = true;
          for (var b = 0; b < cand.bytes.length; b++) {
            if (byteAt(i + b) !== cand.bytes[b]) { same = false; break; }
          }
          if (same) { hit = cand; break; }
        }
        var single = index.single[byteAt(i)];
        if (!hit && single !== undefined) {
          hit = { bytes: [byteAt(i)], char: single };
        }
      }
      if (hit) {
        text += hit.char;
        mapped++;
        i += hit.bytes.length;
      } else {
        text += '[' + _hex2(byteAt(i)) + ']';
        i += 1;
      }
    }
    return { text: text, mapped: mapped, total: total };
  }

  function selectionRange() {
    var sel = _state.selection;
    if (!sel) return null;
    return { start: Math.min(sel.start, sel.end), end: Math.max(sel.start, sel.end) };
  }

  function selectionText() {
    var range = selectionRange();
    if (!range) return '';
    return decodeRange(range.start, range.end).text;
  }

  // Selection to group. The registry is the single source of text rows, so
  // when the selection already sits on extracted text this groups those
  // entries instead of writing a second, overlapping row: that duplicate
  // (with its own copy of the control codes) is what made the Search Text
  // list disagree with what the Hex Editor showed. A manual entry is only
  // created for bytes no existing entry describes.
  function selectionTexts() {
    var range = selectionRange();
    if (!range || !K.search || typeof K.search.getTextsInRange !== 'function') return [];
    return K.search.getTextsInRange(range.start, range.end);
  }

  function addSelectionToGroup(groupId) {
    var range = selectionRange();
    if (!range) { _set({ status: 'Select a byte range first.' }); return null; }
    if (!K.search || typeof K.search.addManualEntry !== 'function') {
      _set({ status: 'Search Text state is not available.' });
      return null;
    }

    var existing = selectionTexts();
    if (existing.length) {
      var offsets = existing.map(function (t) { return Number(t.startByte); });
      K.search.markAll(offsets);
      if (groupId) K.search.assignMarkedToGroup(groupId);
      _set({
        status: 'Selection covers ' + existing.length + ' existing text(s) (' +
          offsets.map(function (o) { return _hex(o); }).join(', ') +
          '). Grouped those instead of adding a duplicate entry.'
      });
      return offsets[0];
    }

    if (!activeTable()) {
      _set({ status: 'Load a table first: a byte range is decoded through the active table.' });
      return null;
    }

    var decoded = decodeRange(range.start, range.end);
    var startByte = K.search.addManualEntry({
      startByte: range.start,
      originalText: decoded.text,
      byteLength: range.end - range.start + 1
    });
    if (startByte === null || startByte === undefined) {
      _set({ status: 'Nothing to add: the selection decoded to an empty string.' });
      return null;
    }
    if (!groupId) { _set({ status: 'Entry added at ' + _hex(startByte) + '. Pick a group to assign it.' }); return startByte; }
    K.search.markAll([startByte]);
    K.search.assignMarkedToGroup(groupId);
    _set({
      status: 'New entry at ' + _hex(startByte) + ' (' + decoded.total + ' byte(s), ' +
        decoded.mapped + ' mapped) added to a group.'
    });
    return startByte;
  }

  /* ---------- search ---------- */

  function setSearchMode(mode) {
    _set({ searchMode: mode === 'text' ? 'text' : 'hex' });
  }

  function setSearchQuery(q) {
    _set({ searchQuery: String(q === undefined || q === null ? '' : q) });
  }

  function _parseHexQuery(q) {
    var clean = String(q || '').replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, ' ').trim();
    if (!clean) return null;
    var compact = clean.replace(/\s+/g, '');
    if (compact.length % 2 !== 0) return null;
    var parts = compact.match(/.{2}/g);
    if (!parts || !parts.length) return null;
    return new Uint8Array(parts.map(function (h) { return parseInt(h, 16) & 0xFF; }));
  }

  function _encodeTextQuery(q) {
    var tableData = activeTable();
    if (!tableData) return null;
    var built = _charToBytes(tableData);
    if (!built) return null;
    var legacy = K.legacy || {};
    if (typeof legacy.createTokenizer !== 'function' || typeof legacy.smartTextParse !== 'function') return null;

    var tokenizer = legacy.createTokenizer(built.keys.slice());
    var master = new Map();
    Object.keys(built.map).forEach(function (k) { master.set(k, built.map[k]); });
    try {
      // enableDteMte false keeps the plain longest-match encoding, so
      // the bytes searched here are the bytes a build would write.
      var out = legacy.smartTextParse(String(q || ''), tokenizer, master, false, { enableDteMte: false });
      return out && out.length ? out : null;
    } catch (_) { return null; }
  }

  function _buildNeedle() {
    if (_state.searchMode === 'text') {
      var encoded = _encodeTextQuery(_state.searchQuery);
      if (!encoded) {
        _set({ status: activeTable() ? 'Text search needs characters that exist in the table.' : 'Text search needs an applied table.' });
        return null;
      }
      return encoded;
    }
    var parsed = _parseHexQuery(_state.searchQuery);
    if (!parsed) { _set({ status: 'Enter hex bytes, for example 4E 45 53.' }); return null; }
    return parsed;
  }

  function runSearch() {
    var bytes = _state.romBytes;
    if (!bytes || !bytes.length) { _set({ status: 'Load a ROM first.' }); return; }
    var needle = _buildNeedle();
    // A refused query leaves the previous hits on screen otherwise,
    // which reads as if the new query had matched them. The status
    // message explaining the refusal is kept.
    if (!needle) {
      _set({ searchResults: [], searchIndex: -1, searchTruncated: false });
      return;
    }

    _set({ isSearching: true });
    var results = [];
    var truncated = false;
    var limit = bytes.length - needle.length;
    for (var i = 0; i <= limit; i++) {
      var match = true;
      for (var j = 0; j < needle.length; j++) {
        if ((bytes[i + j] & 0xFF) !== needle[j]) { match = false; break; }
      }
      if (match) {
        results.push(i);
        if (results.length >= MAX_RESULTS) { truncated = true; break; }
      }
    }

    var label = needle.length + ' byte query';
    _set({
      isSearching: false,
      searchResults: results,
      searchIndex: results.length ? 0 : -1,
      searchTruncated: truncated,
      cursorOffset: results.length ? results[0] : _state.cursorOffset,
      focusOffset: results.length ? results[0] : _state.focusOffset,
      focusToken: results.length ? _state.focusToken + 1 : _state.focusToken,
      status: results.length
        ? 'Found ' + results.length + (truncated ? '+' : '') + ' match(es) for ' + label + '.'
        : 'No match for ' + label + '.'
    });
  }

  function _stepResult(delta) {
    var results = _state.searchResults;
    if (!results.length) return;
    var idx = _state.searchIndex + delta;
    if (idx < 0) idx = results.length - 1;
    if (idx >= results.length) idx = 0;
    var off = results[idx];
    _set({
      searchIndex: idx,
      cursorOffset: off,
      focusOffset: off,
      focusToken: _state.focusToken + 1,
      flashOffset: off,
      status: 'Match ' + (idx + 1) + ' of ' + results.length + ' at ' + _hex(off)
    });
    _scheduleFlashClear();
  }

  function nextResult() { _stepResult(1); }
  function prevResult() { _stepResult(-1); }

  function clearSearch() {
    _set({ searchResults: [], searchIndex: -1, searchTruncated: false, status: '' });
  }

  /* ---------- events ---------- */

  global.addEventListener('ketor:rom-loaded', function (ev) {
    var d = (ev && ev.detail) || {};
    setRomFromLoad({ data: d.data || null, name: d.name, size: d.size }, d.system);
  });

  // The workflow config is resolved after the ROM event, so sections
  // are refreshed on the next tick instead of racing the detection.
  global.addEventListener('ketor:rom-loaded', function () {
    setTimeout(refreshSections, 0);
  });

  global.addEventListener('ketor:navigate-hex', function (ev) {
    var d = (ev && ev.detail) || null;
    if (!d) return;
    var off = Number(d.offset);
    if (!Number.isFinite(off)) return;
    gotoOffset(off);
  });

  _set({});

  K.hex.getState = getState;
  K.hex.subscribe = subscribe;
  K.hex.useHex = useHex;
  K.hex.setRomFromLoad = setRomFromLoad;
  K.hex.refreshSections = refreshSections;
  K.hex.reset = reset;
  K.hex.setCursor = setCursor;
  K.hex.gotoOffset = gotoOffset;
  K.hex.setSelection = setSelection;
  K.hex.clearSelection = clearSelection;
  K.hex.selectionRange = selectionRange;
  K.hex.selectionText = selectionText;
  K.hex.setBytesPerRow = setBytesPerRow;
  K.hex.setViewMode = setViewMode;
  K.hex.setHighlightLayers = setHighlightLayers;
  K.hex.toggleHighlightLayer = toggleHighlightLayer;
  K.hex.currentByte = currentByte;
  K.hex.viewBytes = viewBytes;
  K.hex.viewPatches = viewPatches;
  K.hex.isCompiledView = isCompiledView;
  K.hex.setCompiledRom = setCompiledRom;
  K.hex.clearCompiledRom = clearCompiledRom;
  K.hex.adoptInsertedRom = adoptInsertedRom;
  /* Discards the bytes an insert wrote and everything it reported, so Clear
     means the same thing in both activities: back to the loaded ROM. */
  function discardInsert() {
    var owned = _state.insertedOffsets || {};
    var patches = Object.assign({}, _state.patches);
    var dropped = 0;
    Object.keys(owned).forEach(function (key) {
      if (patches[key] !== undefined) { delete patches[key]; dropped++; }
    });
    _set({
      patches: patches,
      insertedOffsets: {},
      compileRelocations: [],
      compiledBytes: null,
      status: dropped
        ? 'Insert discarded: ' + dropped + ' byte(s) back to the loaded ROM.'
        : 'Nothing inserted to discard.'
    });
    return dropped;
  }
  K.hex.discardInsert = discardInsert;
  /* The file that was loaded, without any insert on top: the next insert has
     to start from it, otherwise every press of Insert writes another copy of
     the same text into the next free run of the ROM. */
  K.hex.getSourceBytes = function () { return _state.romBytes; };
  K.hex.getInsertedOffsets = function () { return _state.insertedOffsets || {}; };
  K.hex.clearCompiledRelocations = function () {
    _set({ compileRelocations: [] });
    return true;
  };
  // The list belongs to the last compile, not to a view: the editor has one
  // buffer and the offsets stay offered until the translator hides them.
  K.hex.getRelocations = function () {
    return _state.compileRelocations || [];
  };
  K.hex.setViewSource = setViewSource;
  K.hex.isPatched = isPatched;
  K.hex.setByte = setByte;
  K.hex.undo = undo;
  K.hex.redo = redo;
  K.hex.clearPatches = clearPatches;
  K.hex.getPatchedBytes = getPatchedBytes;
  K.hex.syncRegistryFor = _syncRegistryFor;
  K.hex.exportPatchedRom = exportPatchedRom;
  K.hex.addBookmark = addBookmark;
  K.hex.removeBookmark = removeBookmark;
  K.hex.renameBookmark = renameBookmark;
  K.hex.clearBookmarks = clearBookmarks;
  K.hex.activeTable = activeTable;
  K.hex.decodeRange = decodeRange;
  K.hex.addSelectionToGroup = addSelectionToGroup;
  K.hex.selectionTexts = selectionTexts;
  K.hex.setSearchMode = setSearchMode;
  K.hex.setSearchQuery = setSearchQuery;
  K.hex.runSearch = runSearch;
  K.hex.nextResult = nextResult;
  K.hex.prevResult = prevResult;
  K.hex.clearSearch = clearSearch;
  K.hex.buildSections = buildSections;
  K.hex.SECTION_COLORS = SECTION_COLORS;

})(window);
