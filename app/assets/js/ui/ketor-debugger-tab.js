/* ============================================================
   Ketor - Debugger activity (Batch 155, memory viewer Batch 158)
   ------------------------------------------------------------
   The first debugger step that runs nothing. A display register is
   not inside the ROM: BG0CNT lives at 0x04000008 in IO memory and
   the game's code writes it while the console runs, so a ROM can
   only be asked where the code decides it. The code decides with
   two constants close together -- the address of the register, in a
   literal, and the value it stores -- so this tab hands the loaded
   file to K.core.backgroundsFrom and shows what came back: every
   display register the code names, the constant that sits beside
   it, the flags that constant decodes to, and the background
   set-ups those constants describe.

   Batch 158 adds the memory viewer. It is the Hex Editor's own
   reader wearing a second face: the bytes come from K.hex.viewBytes()
   and the edits from K.hex.viewPatches(), so the panel follows Load
   ROM, the compiled/inserted view and every patch without opening
   the file again or keeping a second byte reader. Sixteen bytes to a
   row with the row's address in front (0x000100), a patch drawn in
   the Hex Editor's own changed-byte colour, and the Hex Editor's
   cursor byte drawn where it falls. The Offset and Rows boxes follow
   the rule the tile activity set in batch 154: the text that was
   typed is kept in the store, and only text that parses is committed,
   clamped into the file, so "0x" halfway through a keystroke is not
   an error and never becomes NaN.
   A save state can be handed in through K.debugger.setSaveState (or
   the ketor:save-state-loaded event) and the picker then offers its
   RAM blocks through K.core.saveState.read; with no state the picker
   is skipped and the ROM is read alone.

   Nothing here executes anything: no emulator, no CPU. The only
   keyboard handler in this file sits on the memory grid container
   (tabIndex 0), never on the document or the window, so a keystroke
   in a text box stays in that box; Ctrl+C/V copy and paste hex text
   only while that grid has the focus.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var MONO = 'var(--kt-font-mono)';

  /* How far either side of the address constant the value constant is looked for.
     0x200 is the scanner's own default and covers a compiled setup block. */
  var SCAN_WINDOWS = [0x80, 0x200, 0x800];
  var DEFAULT_WINDOW = 0x200;

  /* The Hex Editor's changed-byte colours, so a patched byte is the same colour in both
     activities and one look is enough to tell an edit from the loaded file. */
  var CHANGED_BG = '#a8341a';
  var CHANGED_FG = '#ffffff';
  var CHANGED_RULE = '#ff9a7a';

  function hex(n, digits) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) return '?';
    var s = Math.floor(v).toString(16).toUpperCase();
    while (s.length < (digits || 0)) s = '0' + s;
    return '0x' + s;
  }

  /* The file that was loaded, without any insert on top: the same source image the
     Hex Editor and the tile editor read. */
  function sourceBytes() {
    if (K.hex && K.hex.getSourceBytes) {
      var bytes = K.hex.getSourceBytes();
      if (bytes && bytes.length) return bytes;
    }
    return null;
  }

  /* A register value in the words the GBA manual uses, so the row says what the flags
     mean instead of leaving a hex word to be decoded by hand. */
  function decodeText(name, decoded) {
    if (!decoded) return '';
    if (name === 'DISPCNT') {
      return 'mode ' + decoded.mode
        + ' | bg ' + (decoded.bg && decoded.bg.length ? decoded.bg.join(',') : 'none')
        + ' | obj ' + (decoded.obj ? 'on' : 'off')
        + ' | forced blank ' + (decoded.forcedBlank ? 'on' : 'off');
    }
    return 'priority ' + decoded.priority
      + ' | char base ' + decoded.charBase + ' at ' + hex(decoded.charBlockAddress, 8)
      + ' | screen base ' + decoded.screenBase + ' at ' + hex(decoded.screenBlockAddress, 8)
      + ' | size ' + decoded.sizeName
      + ' | 256 colours ' + (decoded.colour256 ? 'on' : 'off')
      + ' | mosaic ' + (decoded.mosaic ? 'on' : 'off');
  }

  function registerRow(entry, hit) {
    var best = hit && hit.candidates && hit.candidates.length ? hit.candidates[0] : null;
    var nameStyle = { flex: '0 0 74px', fontFamily: MONO, fontWeight: 600 };
    var addressStyle = { flex: '0 0 92px', fontFamily: MONO, opacity: 0.85 };
    var valueStyle = { flex: '0 0 58px', fontFamily: MONO, fontWeight: 600 };
    return e('div', {
      key: entry.name,
      style: {
        padding: '5px 6px', borderBottom: '1px solid var(--kt-widget-border-default)',
        background: best ? 'transparent' : 'rgba(255,255,255,0.02)'
      }
    },
      e('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
        e('span', { style: nameStyle }, entry.name),
        e('span', { style: addressStyle }, entry.address),
        e('span', { style: valueStyle }, best ? hex(best.value, 4) : '--'),
        e('span', { style: { flex: '1 1 auto', lineHeight: 1.45 } },
          best ? decodeText(entry.name, best.decoded)
            : 'not in this ROM: the code never names this address near a value that could be its constant')
      ),
      best ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.6, marginTop: 2 } },
        'constant read at ROM 0x' + Math.floor(best.valueAt).toString(16).toUpperCase()
        + ' | code names it at ROM 0x' + Math.floor(hit.registerAt).toString(16).toUpperCase()
        + (hit.mirror ? ' (mirror 0x' + Math.floor(hit.mirror).toString(16).toUpperCase() + ')' : '')
        + ' | confidence ' + Math.round((Number(best.confidence) || 0) * 100) + '%') : null,
      /* The constant that wins is the closest plausible one, and a word that straddles the
         tail of the address literal can look plausible too. The rest are printed beside
         it so the choice this row made can be checked instead of trusted. */
      hit && hit.candidates && hit.candidates.length > 1
        ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.5, marginTop: 1 } },
            'other constants near it: ' + hit.candidates.slice(1, 4).map(function (c) {
              return hex(c.value, 4) + ' at ROM 0x' + Math.floor(c.valueAt).toString(16).toUpperCase()
                + ' (' + Math.round((Number(c.confidence) || 0) * 100) + '%)';
            }).join('  '))
        : null
    );
  }

  function backgroundRow(bg, index) {
    return e('div', {
      key: 'bg' + index,
      style: { padding: '5px 6px', borderBottom: '1px solid var(--kt-widget-border-default)' }
    },
      e('div', { style: { fontFamily: MONO } },
        'screen base ' + bg.screenBase + ' at ' + hex(bg.screenBlockAddress, 8)
        + ' | char base ' + bg.charBase + ' at ' + hex(bg.charBlockAddress, 8)),
      e('div', { style: { opacity: 0.8, lineHeight: 1.45 } },
        bg.sizeName + ' | ' + (bg.colour256 ? '256 colours' : '16 colours')
        + ' | best ' + Math.round((Number(bg.best) || 0) * 100) + '%'
        + ' | ' + (Number(bg.count) || 0) + ' constant(s)'),
      bg.registers && bg.registers.length
        ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.6, marginTop: 2 } },
            bg.registers.map(function (r) {
              return r.name + '=' + hex(r.value, 4) + ' at ROM 0x' + Math.floor(r.valueAt).toString(16).toUpperCase();
            }).join('  '))
        : null
    );
  }

  /* ============================================================
     Memory viewer (Batch 158)
     ============================================================ */

  var ROW_BYTES = 16;
  var DEFAULT_ROWS = 8;
  var MAX_ROWS = 64;

  /* The blocks a GBA save state holds, named so the picker says what the numbers are. The
     order is the order core/save-state.js writes them in. */
  var BLOCK_LABELS = {
    iwram: 'IWRAM (32 KB)',
    ewram: 'EWRAM (256 KB)',
    vram: 'VRAM (96 KB)',
    palette: 'Palette RAM (1 KB)',
    oam: 'OAM (1 KB)',
    io: 'IO registers (1 KB)'
  };
  var BLOCK_ORDER = ['iwram', 'ewram', 'vram', 'palette', 'oam', 'io'];

  var _mem = {
    /* null means "the row the hex cursor sits on": the window follows the Hex Editor until
       the offset box commits a number of its own. */
    offset: null,
    /* What is in the offset box, kept apart from the committed offset, so the box never
       jumps under the cursor and half typed text is not treated as a value. */
    offsetText: null,
    rows: DEFAULT_ROWS,
    rowsText: null,
    /* 'rom' reads through K.hex; any other id reads one block of the save state. */
    block: 'rom',
    saveState: null,
    /* The text of the last copy, used by the paste when the browser hands out no clipboard
       (a test workbench, or a page the user denied the clipboard to). */
    clipboardText: '',
    status: ''
  };
  var _memListeners = new Set();

  function _memSet(patch) {
    var changed = false, next = _mem;
    Object.keys(patch).forEach(function (k) {
      if (_mem[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _mem); changed = true; }
        next[k] = patch[k];
      }
    });
    if (changed) { _mem = next; _memListeners.forEach(function (f) { try { f(); } catch (_) { } }); }
  }
  function getMemory() { return _mem; }
  function subscribeMemory(fn) {
    if (typeof fn !== 'function') return function () { };
    _memListeners.add(fn);
    return function () { _memListeners.delete(fn); };
  }
  function useMemory() { return R.useSyncExternalStore(subscribeMemory, getMemory, getMemory); }

  function hexStore() {
    return (K.hex && K.hex.getState) ? K.hex.getState() : null;
  }

  /* Six digits, like the Hex Editor's own format: 0x000100. A file taller than 16 MB grows
     the field instead of dropping a digit. */
  function hexAddress(n) {
    var v = Number(n);
    if (!Number.isFinite(v) || v < 0) v = 0;
    return '0x' + Math.floor(v).toString(16).toUpperCase().padStart(6, '0');
  }
  function hexByte(v) {
    return (Number(v) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
  }

  /* Memory is read in rows of 16, so a byte offset is shown from the start of its row. */
  function rowStart(offset) {
    var v = Number(offset);
    if (!Number.isFinite(v) || v < 0) v = 0;
    return Math.floor(v / ROW_BYTES) * ROW_BYTES;
  }

  function clampMemoryOffset(v, len) {
    var n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) n = 0;
    var total = Math.floor(Number(len));
    if (!(total > 0)) return 0;
    return Math.min(n, total - 1);
  }

  /* Free typing: spaces and a 0x prefix are fine, and text that is not a hex number yet
     - "0x" halfway through a keystroke - gives null instead of NaN. */
  function parseOffsetText(text) {
    var raw = String(text == null ? '' : text).replace(/\s+/g, '');
    if (!raw) return null;
    var digits = raw.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]+$/.test(digits)) return null;
    var v = parseInt(digits, 16);
    return Number.isFinite(v) ? v : null;
  }

  /* 1..64 rows, the range the box promises. Anything else is "no row count given". */
  function clampRows(v) {
    var n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.max(1, Math.min(MAX_ROWS, n));
  }

  function parseHexBytes(text) {
    var cleaned = String(text == null ? '' : text).replace(/0x/gi, ' ').replace(/[^0-9a-fA-F]/g, ' ').trim();
    if (!cleaned) return null;
    var compact = cleaned.replace(/\s+/g, '');
    if (compact.length % 2 !== 0) return null;
    var parts = compact.match(/.{2}/g);
    if (!parts || !parts.length) return null;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var v = parseInt(parts[i], 16);
      if (!Number.isFinite(v)) return null;
      out.push(v & 0xFF);
    }
    return out;
  }

  /* The ROM view is the Hex Editor's: viewBytes() is the buffer the editor shows (loaded
     file or inserted image) and viewPatches() the edits on top of it, so this file never
     keeps a byte reader of its own. */
  function romSource() {
    var bytes = (K.hex && K.hex.viewBytes) ? K.hex.viewBytes() : null;
    if (!bytes || !bytes.length) return null;
    return {
      kind: 'rom', id: 'rom', label: 'ROM',
      bytes: bytes,
      patches: (K.hex.viewPatches ? K.hex.viewPatches() : null) || {},
      /* A Hex Editor cursor marks a byte of the ROM. A state block is another address
         space, so the cursor is not drawn over it. */
      cursor: true
    };
  }

  function blockSource(memState) {
    var ss = memState.saveState;
    if (!ss || !ss.blocks) return null;
    var id = memState.block;
    var bytes = ss.blocks[id];
    if (!bytes || !bytes.length) return null;
    return {
      kind: 'state', id: id,
      label: (ss.name || 'save state') + ' \u00b7 ' + (BLOCK_LABELS[id] || id),
      bytes: bytes, patches: {}, cursor: false
    };
  }

  function memorySource(memState) {
    if (memState.block && memState.block !== 'rom') {
      var fromState = blockSource(memState);
      if (fromState) return fromState;
    }
    return romSource();
  }

  /* One row per 16 bytes, as data: the address of the row and its 16 byte values, each
     with the flag that says the user patched it and the tooltip that shows what it was.
     A test can read a row through this without rendering it. */
  function memoryRows(source, start, count) {
    var out = [];
    if (!source || !source.bytes || !source.bytes.length) return out;
    var bytes = source.bytes;
    var patches = source.patches || {};
    var total = bytes.length;
    var from = Math.max(0, Math.floor(Number(start) || 0));
    var rowCount = Math.max(1, Math.floor(Number(count) || 0));
    for (var r = 0; r < rowCount; r++) {
      var base = from + r * ROW_BYTES;
      if (base >= total) break;
      var cells = [];
      var texts = [];
      for (var i = 0; i < ROW_BYTES; i++) {
        var off = base + i;
        if (off >= total) {
          cells.push({ offset: off, text: '  ', value: null, patched: false, exists: false, title: '' });
          texts.push('  ');
          continue;
        }
        var raw = bytes[off] & 0xFF;
        var patched = patches[off] !== undefined;
        var value = patched ? (patches[off] & 0xFF) : raw;
        var label = hexByte(value);
        cells.push({
          offset: off, text: label, value: value, raw: raw, patched: patched, exists: true,
          title: hexAddress(off) + '  ' + label + (patched ? '  patched, was ' + hexByte(raw) : '')
        });
        texts.push(label);
      }
      out.push({
        address: hexAddress(base), start: base, cells: cells,
        text: hexAddress(base) + '  ' + texts.join(' ')
      });
    }
    return out;
  }

  /* What the panel is showing right now: the source, the first byte of the first row, the
     rows themselves and where the Hex Editor cursor sits. */
  function currentView() {
    var source = memorySource(_mem);
    if (!source) return null;
    var h = hexStore();
    var rawCursor = h ? Number(h.cursorOffset) : 0;
    var cursor = Number.isFinite(rawCursor) && rawCursor >= 0 ? Math.floor(rawCursor) : 0;
    var requested = _mem.offset === null ? cursor : _mem.offset;
    var start = rowStart(Math.min(Math.max(0, requested), Math.max(0, source.bytes.length - 1)));
    return {
      source: source, start: start, cursor: cursor, len: source.bytes.length,
      rows: memoryRows(source, start, _mem.rows)
    };
  }

  /* ---------- the offset and rows boxes ---------- */

  function typeMemoryOffset(text) {
    var typed = String(text == null ? '' : text);
    var patch = { offsetText: typed };
    var v = parseOffsetText(typed);
    if (v !== null) {
      var view = currentView();
      patch.offset = clampMemoryOffset(v, view ? view.len : 0);
      patch.status = 'Memory window at ' + hexAddress(rowStart(patch.offset)) + '.';
    }
    _memSet(patch);
  }

  function typeMemoryRows(text) {
    var typed = String(text == null ? '' : text);
    var patch = { rowsText: typed };
    var n = clampRows(typed);
    if (n !== null) patch.rows = n;
    _memSet(patch);
  }

  function scrollMemory(rowDelta) {
    var view = currentView();
    if (!view) { _memSet({ status: 'Load a ROM first.' }); return; }
    var next = clampMemoryOffset(view.start + rowDelta * ROW_BYTES, view.len);
    _memSet({
      offset: next, offsetText: null,
      status: 'Memory window at ' + hexAddress(rowStart(next)) + '.'
    });
  }

  function stepMemoryPage(dir) {
    scrollMemory((dir < 0 ? -1 : 1) * Math.max(1, _mem.rows));
  }

  function pickMemoryBlock(id) {
    var next = String(id || 'rom');
    _memSet({
      block: next, offset: null, offsetText: null,
      status: next === 'rom'
        ? 'Reading the ROM through the Hex Editor.'
        : 'Reading ' + (BLOCK_LABELS[next] || next) + ' out of the save state.'
    });
  }

  /* ---------- copy and paste ---------- */

  /* Only the byte values, one row to a line, so the text can be pasted back byte for byte.
     The address is left out: a parser that strips non hex characters would read it as
     bytes and the paste would land three bytes late. */
  function memoryText() {
    var view = currentView();
    if (!view) return '';
    return view.rows.map(function (row) {
      return row.cells.map(function (cell) { return cell.exists ? cell.text : '  '; })
        .join(' ').replace(/\s+$/, '');
    }).join('\n');
  }

  function copyMemory() {
    var view = currentView();
    if (!view) { _memSet({ status: 'Nothing to copy.' }); return ''; }
    var text = memoryText();
    _memSet({
      clipboardText: text,
      status: 'Copied ' + view.rows.length + ' row(s) from ' + hexAddress(view.start) + ' as hex text.'
    });
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      try { global.navigator.clipboard.writeText(text).then(function () { }, function () { }); } catch (_) { }
    }
    return text;
  }

  /* Pasted bytes go through K.hex.setByte one at a time: the same patch layer a painted
     pixel takes, so the edit joins Undo, Clear and Export. A save-state block is not the
     loaded file, so it stays read only. */
  function pasteMemoryText(text, at) {
    var view = currentView();
    if (!view) { _memSet({ status: 'Load a ROM first.' }); return 0; }
    if (view.source.kind !== 'rom') {
      _memSet({ status: 'A save-state block is read only: pick the ROM to edit bytes.' });
      return 0;
    }
    var bytes = parseHexBytes(text);
    if (!bytes || !bytes.length) { _memSet({ status: 'No hex bytes found in the text.' }); return 0; }
    var off = clampMemoryOffset(at === undefined || at === null ? view.start : at, view.len);
    var n = Math.min(bytes.length, view.len - off);
    var wrote = 0;
    for (var i = 0; i < n; i++) if (K.hex.setByte(off + i, bytes[i])) wrote++;
    _memSet({
      status: 'Pasted ' + wrote + ' byte(s) at ' + hexAddress(off)
        + (n < bytes.length ? ' (' + (bytes.length - n) + ' byte(s) ignored, past the end)' : '') + '.'
    });
    return wrote;
  }

  function pasteMemory() {
    var view = currentView();
    if (!view) { _memSet({ status: 'Load a ROM first.' }); return 0; }
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.readText === 'function') {
      try {
        clip.readText().then(function (text) { pasteMemoryText(text, view.start); }, function () {
          _memSet({ status: 'The clipboard could not be read; use Paste in the Hex Editor.' });
        });
        return 0;
      } catch (_) { }
    }
    if (_mem.clipboardText) return pasteMemoryText(_mem.clipboardText, view.start);
    _memSet({ status: 'Nothing to paste: copy a row first, or use the Hex Editor.' });
    return 0;
  }

  /* Typing in a box belongs to that box: Ctrl+C/V in the offset or rows field is the
     field's own keystroke, not the grid's. */
  function typingInField(target) {
    if (!target) return false;
    var tag = target.tagName ? String(target.tagName).toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable === true;
  }

  /* The only keyboard handler in this tab, and it sits on the memory grid container: no
     listener is added to the document or to the window, so a field elsewhere in the
     workbench never loses a key to this panel. */
  function onMemoryKey(ev) {
    if (typingInField(ev.target)) return;
    var k = ev.key;
    if (ev.ctrlKey || ev.metaKey) {
      var combo = String(k).toUpperCase();
      if (combo === 'C') { copyMemory(); ev.preventDefault(); return; }
      if (combo === 'V') { pasteMemory(); ev.preventDefault(); return; }
      return;
    }
    if (k === 'ArrowDown') { scrollMemory(1); ev.preventDefault(); return; }
    if (k === 'ArrowUp') { scrollMemory(-1); ev.preventDefault(); return; }
    if (k === 'PageDown') { stepMemoryPage(1); ev.preventDefault(); return; }
    if (k === 'PageUp') { stepMemoryPage(-1); ev.preventDefault(); return; }
    if (k === 'Home') { _memSet({ offset: 0, offsetText: null, status: 'Memory window at ' + hexAddress(0) + '.' }); ev.preventDefault(); return; }
    if (k === 'End') {
      var view = currentView();
      if (!view) return;
      var last = clampMemoryOffset(view.len - Math.max(1, _mem.rows) * ROW_BYTES, view.len);
      _memSet({ offset: last, offsetText: null, status: 'Memory window at ' + hexAddress(rowStart(last)) + '.' });
      ev.preventDefault();
    }
  }

  /* ---------- the save state path ---------- */

  function toBytes(source) {
    if (!source) return null;
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (source.data) return toBytes(source.data);
    if (source.buffer && source.byteLength !== undefined) {
      return new Uint8Array(source.buffer, source.byteOffset || 0, source.byteLength);
    }
    return null;
  }

  /* There is no save-state loader in the workbench yet, so this is the door: another module
     hands the bytes over through K.debugger.setSaveState, or through the
     ketor:save-state-loaded window event with { data, name }. With no state the picker is
     skipped and the panel reads the ROM; with one, core/save-state.js splits the blocks and
     the picker offers the ones it found. */
  function setSaveState(source, name) {
    var bytes = toBytes(source);
    var label = String(name || (source && source.name) || '');
    if (!bytes || !bytes.length) { _memSet({ status: 'No save state to read.' }); return null; }
    if (!K.core || !K.core.saveState || typeof K.core.saveState.read !== 'function') {
      _memSet({ status: 'The save-state reader is not loaded in this build.' });
      return null;
    }
    var read = null;
    try { read = K.core.saveState.read(bytes); } catch (error) { read = null; }
    var found = [];
    if (read && read.blocks) {
      BLOCK_ORDER.forEach(function (id) {
        var block = read.blocks[id];
        if (block && block.length) found.push({ id: id, label: BLOCK_LABELS[id] || id, bytes: block });
      });
    }
    if (!found.length) {
      _memSet({ saveState: null, block: 'rom', status: 'That save state holds no GBA memory block this reader knows.' });
      return null;
    }
    var byId = {};
    found.forEach(function (b) { byId[b.id] = b.bytes; });
    var next = {
      name: label || 'save state',
      size: bytes.length,
      kind: read.kind,
      blocksTrusted: !!read.blocksTrusted,
      blocks: byId
    };
    var patch = {
      saveState: next,
      status: 'Save state read: ' + found.length + ' memory block(s) out of ' + next.size + ' bytes.'
    };
    /* A state can be read without a ROM, so with no file loaded the panel opens on the
       first block instead of an empty ROM window. */
    if (!sourceBytes()) {
      patch.block = found[0].id;
      patch.offset = null;
      patch.offsetText = null;
    }
    _memSet(patch);
    return next;
  }

  function clearSaveState() {
    _memSet({
      saveState: null, block: 'rom', offset: null, offsetText: null,
      status: 'Save state dropped; the panel reads the ROM again.'
    });
  }

  function saveStateBlocks() {
    var ss = _mem.saveState;
    if (!ss || !ss.blocks) return [];
    return BLOCK_ORDER.filter(function (id) { return !!ss.blocks[id]; }).map(function (id) {
      return { id: id, label: BLOCK_LABELS[id] || id, size: ss.blocks[id].length };
    });
  }

  /* ---------- the panel ---------- */

  function cellStyle(cell, isCursor) {
    var style = {
      display: 'inline-block', width: 18, textAlign: 'center', fontFamily: MONO,
      color: 'var(--kt-editor-fg)', background: 'transparent', fontWeight: 400
    };
    if (!cell.exists) { style.opacity = 0.25; return style; }
    if (cell.patched) {
      style.background = CHANGED_BG;
      style.color = CHANGED_FG;
      style.fontWeight = 700;
      /* The rule under a patched byte survives the cursor sitting on it, so a byte that is
         both edited and current still reads as edited. */
      style.boxShadow = 'inset 0 -2px 0 0 ' + CHANGED_RULE;
    }
    if (isCursor) {
      style.background = 'var(--kt-editor-fg)';
      style.color = 'var(--kt-editor-bg)';
      style.fontWeight = 700;
    }
    return style;
  }

  function memoryRow(row, cursor, cursorShown) {
    return e('div', {
      key: 'r' + row.start,
      title: row.text,
      style: { display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'pre', fontFamily: MONO }
    },
      e('span', { style: { flex: '0 0 62px', opacity: 0.75 } }, row.address),
      e('span', null,
        row.cells.map(function (cell, i) {
          var isCursor = cursorShown && cell.exists && cell.offset === cursor;
          return e('span', { key: 'b' + i, title: cell.title, style: cellStyle(cell, isCursor) }, cell.text);
        })
      )
    );
  }

  function memoryPanel(memState, view) {
    var boxStyle = {
      fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)',
      color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)',
      borderRadius: 2, padding: '1px 4px'
    };
    var source = view ? view.source : null;
    var blocks = saveStateBlocks();
    var rows = view ? view.rows : [];
    var len = source ? source.bytes.length : 0;
    var last = rows.length ? Math.min(len - 1, rows[rows.length - 1].start + ROW_BYTES - 1) : 0;
    var start = view ? view.start : 0;
    var patchedCount = 0;
    rows.forEach(function (row) {
      row.cells.forEach(function (cell) { if (cell.patched) patchedCount++; });
    });
    var cursorShown = !!(view && source && source.cursor && view.cursor >= start && view.cursor <= last);
    var cursorNote = '';
    if (view) {
      if (!source.cursor) cursorNote = 'hex cursor ' + hexAddress(view.cursor) + ' is a ROM address, not drawn on a state block';
      else if (cursorShown) cursorNote = 'hex cursor ' + hexAddress(view.cursor);
      else cursorNote = 'hex cursor ' + hexAddress(view.cursor) + ' (outside this window)';
    }

    return e('div', { style: { border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
      e('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 6px',
          borderBottom: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-sidebar-bg)'
        }
      },
        blocks.length
          ? e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Read the ROM through the Hex Editor, or one memory block of the loaded save state' },
              'source',
              e('select', {
                value: memState.block,
                onChange: function (ev) { pickMemoryBlock(ev.target.value); },
                style: boxStyle
              },
                [e('option', { key: 'rom', value: 'rom' }, 'ROM')].concat(blocks.map(function (b) {
                  return e('option', { key: b.id, value: b.id }, b.label);
                }))
              )
            )
          : e('span', {
              style: { opacity: 0.7 },
              title: 'A save state can be handed to this tab with K.debugger.setSaveState, or with the ketor:save-state-loaded window event'
            }, 'ROM only: no save state loaded'),
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Byte offset the memory window starts at. Hex: 0x and spaces are fine, and a value past the end of the file stops at its last byte.' },
          e('span', { style: { opacity: 0.7 } }, 'Offset'),
          e('input', {
            type: 'text', spellCheck: false, placeholder: 'hex',
            title: 'Byte offset the memory window starts at. Hex: 0x and spaces are fine, and a value past the end of the file stops at its last byte.',
            value: memState.offsetText === null || memState.offsetText === undefined ? hexAddress(start) : memState.offsetText,
            onFocus: function (ev) { ev.target.select(); },
            onChange: function (ev) { typeMemoryOffset(ev.target.value); },
            style: Object.assign({ width: 76 }, boxStyle)
          }),
          e('span', { style: { fontFamily: MONO, opacity: 0.85 }, title: 'The row the window starts at' }, hexAddress(start))
        ),
        e('label', { style: { display: 'flex', alignItems: 'center', gap: 4 }, title: 'Rows of 16 bytes on screen, 1..64. Prev and Next step one page of this many rows.' },
          e('span', { style: { opacity: 0.7 } }, 'Rows'),
          e('input', {
            type: 'text', spellCheck: false,
            title: 'Rows of 16 bytes on screen, 1..64. Prev and Next step one page of this many rows.',
            value: memState.rowsText === null || memState.rowsText === undefined ? String(memState.rows) : memState.rowsText,
            onChange: function (ev) { typeMemoryRows(ev.target.value); },
            style: Object.assign({ width: 40 }, boxStyle)
          })
        ),
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          disabled: !view || start <= 0,
          title: 'Previous page: back by the number of rows on screen',
          onClick: function () { stepMemoryPage(-1); }
        }, 'Prev'),
        e('button', {
          type: 'button', className: 'kt-btn small secondary',
          disabled: !view || last >= len - 1,
          title: 'Next page: forward by the number of rows on screen',
          onClick: function () { stepMemoryPage(1); }
        }, 'Next'),
        e('span', { style: { marginLeft: 'auto', fontFamily: MONO, opacity: 0.75 } }, source ? source.label : 'no data')
      ),
      e('div', {
        /* The grid is the one element in this tab that takes the keyboard. tabIndex 0 makes
           it focusable, and the handler is on it, so no listener is added to the document
           or the window. */
        tabIndex: 0, onKeyDown: onMemoryKey,
        style: {
          outline: 'none', maxHeight: 240, overflow: 'auto', padding: '4px 6px',
          background: 'var(--kt-editor-bg, #1e1e1e)', fontSize: 11, lineHeight: '15px'
        }
      },
        rows.length
          ? rows.map(function (row) { return memoryRow(row, view.cursor, cursorShown); })
          : e('div', { style: { opacity: 0.7 } }, 'No byte to show here: the memory window is past the end of this source.')
      ),
      e('div', {
        style: {
          display: 'flex', gap: 10, flexWrap: 'wrap', padding: '3px 6px',
          borderTop: '1px solid var(--kt-widget-border-default)', fontFamily: MONO, fontSize: 10, opacity: 0.8
        }
      },
        e('span', null, view ? hexAddress(start) + '-' + hexAddress(last) + ' of ' + hexAddress(Math.max(0, len - 1)) : 'no data'),
        e('span', null, ROW_BYTES + ' bytes per row'),
        e('span', null, patchedCount + ' patched byte(s) in view'),
        e('span', null, cursorNote || 'no hex cursor'),
        e('span', { title: 'Ctrl+C copies the visible rows as hex text and Ctrl+V writes hex text back, while the grid has the focus' }, 'Ctrl+C/V on the grid')
      ),
      memState.status
        ? e('div', { style: { padding: '2px 6px', fontSize: 10, opacity: 0.75 } }, memState.status)
        : null
    );
  }

  /* ============================================================
     The tab
     ============================================================ */

  function DebuggerTab() {
    /* The bytes come from the Hex Editor's source image, the same buffer the rest of
       the workbench reads, so a ROM shows up here the moment it is loaded. */
    var hexState = K.hex && K.hex.useHex ? K.hex.useHex() : null;
    var memState = useMemory();
    var st = uS(DEFAULT_WINDOW);
    var scanWindow = st[0];
    var setScanWindow = st[1];
    /* Not named "hex": the module already has a hex() formatter and a local of that
       name would shadow it inside this component. */
    var bytes = (hexState && hexState.romBytes) || sourceBytes();
    var view = currentView();

    /* With no ROM the save state alone can still be read; with neither there is nothing
       this tab can show. */
    if ((!bytes || !bytes.length) && !memState.saveState) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Debugger'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from the File menu.'));
    }

    var core = K.core || {};
    var canScan = !!(bytes && bytes.length && core.backgroundsFrom && core.GBA_REGISTERS);
    var scan = canScan ? core.backgroundsFrom(bytes, { window: scanWindow }) : { hits: [], backgrounds: [] };
    var hits = scan.hits || [];
    var backgrounds = scan.backgrounds || [];
    var byName = {};
    hits.forEach(function (hit) { if (!byName[hit.register]) byName[hit.register] = hit; });
    var registers = canScan ? Object.keys(core.GBA_REGISTERS).sort(function (a, b) {
      return Number(a) - Number(b);
    }).map(function (key) {
      return { name: core.GBA_REGISTERS[key].name, address: hex(Number(key), 8) };
    }) : [];

    var selectStyle = {
      fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)',
      color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)',
      borderRadius: 2, padding: '1px 4px'
    };

    return e('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
      e('div', {
        style: {
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '5px 10px', borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)', fontSize: 11
        }
      },
        e('span', { style: { fontWeight: 600 } }, 'Debugger'),
        e('span', { style: { opacity: 0.7 } }, 'static register read, nothing runs'),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 } },
          (hexState && hexState.romName ? hexState.romName + ' | ' : '')
          + (bytes && bytes.length ? bytes.length + ' bytes' : 'no ROM')
          + (memState.saveState ? ' | state ' + memState.saveState.name : '')),
        canScan ? e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' },
          title: 'How far either side of the register address the value constant is looked for'
        },
          'window',
          e('select', {
            value: String(scanWindow),
            onChange: function (ev) { setScanWindow(Number(ev.target.value) || DEFAULT_WINDOW); },
            style: selectStyle
          },
            SCAN_WINDOWS.map(function (w) {
              return e('option', { key: w, value: String(w) }, hex(w, 0));
            })
          )
        ) : e('span', { style: { marginLeft: 'auto', opacity: 0.7 } }, 'no ROM to scan')
      ),
      e('div', {
        style: {
          flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11
        }
      },
        e('div', { style: { opacity: 0.8, lineHeight: 1.5 } },
          canScan
            ? 'The code decides each register with two constants side by side: the address it writes '
              + '(0x04000000 and up) and the value it stores. The ROM named ' + hits.length
              + ' such site(s) within 0x' + scanWindow.toString(16).toUpperCase()
              + ' of a value that could be the constant, describing ' + backgrounds.length
              + ' background set-up(s). No emulator is involved: these are bytes in the file.'
            : (bytes && bytes.length
                ? 'The GBA register scanner is not loaded in this build, so the ROM is only shown as memory here.'
                : 'No ROM is loaded: the register scan needs the file. A save state, when one is handed in, is readable on its own.')),
        e('div', { style: { fontWeight: 600 } }, 'Memory'),
        memoryPanel(memState, view),
        e('div', { style: { fontWeight: 600 } }, 'Display registers'),
        canScan
          ? e('div', { style: { border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
              registers.map(function (entry) { return registerRow(entry, byName[entry.name] || null); })
            )
          : e('div', { style: { opacity: 0.7 } },
              (bytes && bytes.length)
                ? 'The GBA register scanner is not loaded in this build.'
                : 'Load a ROM to scan for display registers.'),
        e('div', { style: { fontWeight: 600, marginTop: 2 } }, 'Backgrounds'),
        backgrounds.length
          ? e('div', { style: { border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
              backgrounds.map(backgroundRow))
          : e('div', { style: { opacity: 0.6, fontStyle: 'italic' } },
              'No background control constant was found in this file.'),
        e('div', { style: { opacity: 0.6, lineHeight: 1.5, marginTop: 2 } },
          'A hit is evidence, not proof: a constant that looks like a register value can sit in '
          + 'data that is not code. The confidence and the ROM offset are printed with every row so '
          + 'the bytes behind the claim can be checked in the Hex Editor.')
      )
    );
  }

  /* The path a save state takes when a loader arrives: the event carries { data, name }.
     Only a custom event is listened for; this module adds no keyboard listener. */
  global.addEventListener('ketor:save-state-loaded', function (ev) {
    var d = (ev && ev.detail) || null;
    if (!d) return;
    setSaveState(d.data || d.bytes || null, d.name);
  });

  K.ui.registerTabProvider('debugger', DebuggerTab);
  K.debugger = {
    decodeText: decodeText,
    scanWindow: DEFAULT_WINDOW,
    /* memory viewer */
    ROW_BYTES: ROW_BYTES,
    DEFAULT_ROWS: DEFAULT_ROWS,
    MAX_ROWS: MAX_ROWS,
    hexAddress: hexAddress,
    hexByte: hexByte,
    rowStart: rowStart,
    parseOffsetText: parseOffsetText,
    parseHexBytes: parseHexBytes,
    clampMemoryOffset: clampMemoryOffset,
    clampRows: clampRows,
    memoryRows: memoryRows,
    memoryView: currentView,
    memoryText: memoryText,
    getMemory: getMemory,
    subscribeMemory: subscribeMemory,
    typeMemoryOffset: typeMemoryOffset,
    typeMemoryRows: typeMemoryRows,
    scrollMemory: scrollMemory,
    stepMemoryPage: stepMemoryPage,
    pickMemoryBlock: pickMemoryBlock,
    copyMemory: copyMemory,
    pasteMemoryText: pasteMemoryText,
    pasteMemory: pasteMemory,
    memoryKeyHandler: onMemoryKey,
    setSaveState: setSaveState,
    clearSaveState: clearSaveState,
    saveStateBlocks: saveStateBlocks
  };
})(window);
