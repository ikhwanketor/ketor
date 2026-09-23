/* ============================================================
   Ketor - Project Activity (state + sidebar)
   ------------------------------------------------------------
   Sidebar only. Shows ROM info, header details (Show All toggle),
   Sections tree, Tables, Groups, Project Files, Recent Files.
   No editor tab. Editor area shows welcome screen when this
   activity is active.
   ============================================================ */

/* ============================================================
   Ketor - Project Activity (state + sidebar)
   ------------------------------------------------------------
   Fixed Batch 14a:
   - Double-click dispatches 'ketor:navigate-activity' and
     'ketor:navigate-hex' events with source + label so the
     workbench can log them to the panel.
   ============================================================ */

(function (global) {
  'use strict';

  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var uC = R.useCallback;

  var RECENT_KEY = 'ketor.recent.files';
  var RECENT_LIMIT = 20;

  var _state = {
    romName: '',
    romSize: 0,
    romSystem: 'Unknown',
    romBytes: null,
    crc32: '',
    sha1: '',
    header: {},
    showAllHeader: false,
    sections: [],
    tables: [],
    groups: [],
    expanded: {
      rom: true,
      header: false,
      sections: false,
      tables: true,
      groups: true,
      projectFiles: true,
      recent: false
    },
    selectedNode: '',
    recent: []
  };

  var _listeners = new Set();

  function _set(patch) {
    var changed = false;
    var next = _state;
    Object.keys(patch).forEach(function (k) {
      if (_state[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = patch[k];
      }
    });
    if (changed) { _liveCache = null; _state = next; _notify(); }
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

  function useProject() {
    return R.useSyncExternalStore(subscribe, getState, getState);
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function bytesToHex(buf) {
    var s = '';
    for (var i = 0; i < buf.length; i++) {
      s += (buf[i] & 0xFF).toString(16).padStart(2, '0');
    }
    return s;
  }

  var _crc32Table = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function computeCrc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = (_crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0);
  }

  function computeSha1(bytes) {
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.resolve('');
    }
    var slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return global.crypto.subtle.digest('SHA-1', slice).then(function (hash) {
      return bytesToHex(new Uint8Array(hash)).toUpperCase();
    }).catch(function () { return ''; });
  }

  function parseHeader(bytes, systemName) {
    var sys = String(systemName || '').toUpperCase();
    var info = {};
    try {
      if (sys === 'NES') {
        if (bytes.length > 16 && bytes[0] === 0x4E && bytes[1] === 0x45
            && bytes[2] === 0x53 && bytes[3] === 0x1A) {
          info['Format'] = 'iNES';
          info['PRG Banks'] = bytes[4] + ' x 16 KB';
          info['CHR Banks'] = bytes[5] + ' x 8 KB';
          info['Mapper'] = (((bytes[7] & 0xF0) | (bytes[6] >> 4)) & 0xFF);
          info['Mirroring'] = (bytes[6] & 1) ? 'Vertical' : 'Horizontal';
          info['Battery'] = (bytes[6] & 2) ? 'Yes' : 'No';
          info['Trainer'] = (bytes[6] & 4) ? 'Yes' : 'No';
          info['Four-screen'] = (bytes[6] & 8) ? 'Yes' : 'No';
        }
      } else if (sys === 'GAME BOY' || sys === 'GBC' || sys === 'GB') {
        if (bytes.length > 0x150) {
          info['Format'] = (bytes[0x143] & 0x80) ? 'CGB' : 'DMG';
          var title = '';
          for (var i = 0x134; i < 0x144; i++) {
            if (bytes[i] === 0) break;
            if (bytes[i] >= 0x20 && bytes[i] <= 0x7E) {
              title += String.fromCharCode(bytes[i]);
            }
          }
          info['Title'] = title.trim() || '(empty)';
          info['CGB Flag'] = '0x' + bytes[0x143].toString(16).toUpperCase().padStart(2, '0');
          info['SGB Flag'] = '0x' + bytes[0x146].toString(16).toUpperCase().padStart(2, '0');
          info['Cartridge Type'] = '0x' + bytes[0x147].toString(16).toUpperCase().padStart(2, '0');
          info['ROM Size Code'] = '0x' + bytes[0x148].toString(16).toUpperCase().padStart(2, '0');
          info['RAM Size Code'] = '0x' + bytes[0x149].toString(16).toUpperCase().padStart(2, '0');
        }
      } else if (sys === 'GBA') {
        if (bytes.length > 0xC0) {
          info['Format'] = 'GBA';
          var title2 = '';
          for (var j = 0xA0; j < 0xAC; j++) {
            if (bytes[j] === 0) break;
            if (bytes[j] >= 0x20 && bytes[j] <= 0x7E) {
              title2 += String.fromCharCode(bytes[j]);
            }
          }
          info['Title'] = title2.trim() || '(empty)';
          var gc = '';
          for (var k = 0xAC; k < 0xB0; k++) {
            if (bytes[k] >= 0x20 && bytes[k] <= 0x7E) gc += String.fromCharCode(bytes[k]);
          }
          info['Game Code'] = gc || '(empty)';
          var mk = '';
          for (var m = 0xB0; m < 0xB2; m++) {
            if (bytes[m] >= 0x20 && bytes[m] <= 0x7E) mk += String.fromCharCode(bytes[m]);
          }
          info['Maker Code'] = mk || '(empty)';
          info['Version'] = bytes[0xBC];
          info['Header Checksum'] = '0x' + bytes[0xBD].toString(16).toUpperCase().padStart(2, '0');
        }
      } else if (sys === 'SNES') {
        var bases = [0x7FC0, 0x7FC0 + 0x200, 0xFFC0, 0xFFC0 + 0x200];
        for (var b = 0; b < bases.length; b++) {
          var off = bases[b];
          if (off + 0x20 > bytes.length) continue;
          var t3 = '';
          for (var t = off; t < off + 21; t++) {
            if (bytes[t] === 0) break;
            if (bytes[t] >= 0x20 && bytes[t] <= 0x7E) t3 += String.fromCharCode(bytes[t]);
          }
          if (t3.trim().length > 0) {
            info['Format'] = 'SNES';
            info['Title'] = t3.trim();
            info['Header Offset'] = '0x' + off.toString(16).toUpperCase();
            info['Map Mode'] = '0x' + bytes[off + 0x15].toString(16).toUpperCase().padStart(2, '0');
            info['ROM Size Code'] = '0x' + bytes[off + 0x17].toString(16).toUpperCase().padStart(2, '0');
            info['SRAM Size Code'] = '0x' + bytes[off + 0x18].toString(16).toUpperCase().padStart(2, '0');
            info['Region'] = '0x' + bytes[off + 0x19].toString(16).toUpperCase().padStart(2, '0');
            break;
          }
        }
      } else if (sys === 'NINTENDO 64') {
        if (bytes.length > 0x40) {
          info['Format'] = 'N64';
          info['Clock Rate'] = '0x' + (
            (bytes[0x0C] << 24) | (bytes[0x0D] << 16) |
            (bytes[0x0E] << 8) | bytes[0x0F]
          ).toString(16).toUpperCase();
          var t4 = '';
          for (var n = 0x20; n < 0x34; n++) {
            if (bytes[n] >= 0x20 && bytes[n] <= 0x7E) t4 += String.fromCharCode(bytes[n]);
          }
          info['Title'] = t4.trim() || '(empty)';
        }
      }
    } catch (_) { }
    return info;
  }

  function buildSections(systemName) {
    var sys = String(systemName || '').toUpperCase();
    var s = [];
    if (sys === 'NES') {
      s.push({ id: 'nes-hdr', label: 'iNES Header', start: 0, end: 15 });
      s.push({ id: 'nes-prg', label: 'PRG ROM', start: 16, end: null });
    } else if (sys === 'GBA') {
      s.push({ id: 'gba-hdr', label: 'ROM Header', start: 0, end: 0xBF });
      s.push({ id: 'gba-logo', label: 'Nintendo Logo', start: 0x04, end: 0x9F });
      s.push({ id: 'gba-code', label: 'Code Region', start: 0xC0, end: null });
    } else if (sys === 'SNES') {
      s.push({ id: 'snes-hdr', label: 'Internal Header', start: 0x7FC0, end: 0x7FDF });
      s.push({ id: 'snes-code', label: 'Code + Data', start: 0x8000, end: null });
    } else if (sys === 'GAME BOY' || sys === 'GBC' || sys === 'GB') {
      s.push({ id: 'gb-hdr', label: 'Cartridge Header', start: 0x100, end: 0x14F });
      s.push({ id: 'gb-code', label: 'Code Region', start: 0x150, end: null });
    } else {
      s.push({ id: 'hdr', label: 'Header', start: 0, end: 0xFF });
      s.push({ id: 'body', label: 'Body', start: 0x100, end: null });
    }
    return s;
  }

  function loadRecent() {
    try {
      var raw = global.sessionStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function pushRecent(entry) {
    try {
      var list = loadRecent();
      list = list.filter(function (r) {
        return !(r.name === entry.name && r.size === entry.size);
      });
      list.unshift({
        name: entry.name,
        size: entry.size,
        system: entry.system,
        hash: entry.hash || '',
        openedAt: Date.now()
      });
      if (list.length > RECENT_LIMIT) list = list.slice(0, RECENT_LIMIT);
      global.sessionStorage.setItem(RECENT_KEY, JSON.stringify(list));
      _set({ recent: list });
    } catch (_) { }
  }

  function setRomFromLoad(result, systemName) {
    _set({
      romName: result.name || '',
      romSize: result.size || 0,
      romSystem: systemName || 'Unknown',
      romBytes: result.data || null,
      crc32: '',
      sha1: '',
      header: {},
      showAllHeader: false,
      sections: buildSections(systemName),
      selectedNode: '',
      expanded: Object.assign({}, _state.expanded, {
        rom: true,
        header: false,
        sections: false,
        tables: true,
        groups: true,
        projectFiles: true
      })
    });

    if (result.data && result.data.length > 0) {
      var crc = computeCrc32(result.data);
      _set({ crc32: crc.toString(16).toUpperCase().padStart(8, '0') });

      var hdr = parseHeader(result.data, systemName);
      _set({ header: hdr });

      computeSha1(result.data).then(function (sha) {
        if (sha) _set({ sha1: sha });
        pushRecent({
          name: result.name,
          size: result.size,
          system: systemName,
          hash: sha || (crc.toString(16).toUpperCase().padStart(8, '0'))
        });
      });
    }
  }

  function toggleShowAllHeader() {
    _set({ showAllHeader: !_state.showAllHeader });
  }

  function toggleExpanded(nodeId) {
    var next = Object.assign({}, _state.expanded);
    next[nodeId] = !next[nodeId];
    _set({ expanded: next });
  }

  function selectNode(nodeId) {
    _set({ selectedNode: String(nodeId || '') });
  }

  function clearRecent() {
    try { global.sessionStorage.removeItem(RECENT_KEY); } catch (_) { }
    _set({ recent: [] });
  }

  function reset() {
    _set({
      romName: '', romSize: 0, romSystem: 'Unknown', romBytes: null,
      crc32: '', sha1: '', header: {}, showAllHeader: false,
      sections: [], tables: [], groups: [],
      selectedNode: '',
      expanded: {
        rom: true, header: false, sections: false,
        tables: true, groups: true, projectFiles: true, recent: false
      }
    });
  }

  // ---- Live data from the owning activity stores -------------------
  // This sidebar used to render whatever was copied into it when the
  // ROM loaded, so tables applied later, groups created in Search
  // Text and session outputs never appeared. Rather than mirroring
  // those values here and keeping two copies in sync, the sidebar
  // subscribes to the stores that own them and rebuilds a cached
  // snapshot whenever any of them notifies. The cache keeps
  // useSyncExternalStore's getSnapshot referentially stable.
  var _liveListeners = new Set();
  var _liveCache = null;
  var _liveAttached = false;

  function _invalidateLive() {
    _liveCache = null;
    _liveListeners.forEach(function (fn) { try { fn(); } catch (_) { } });
  }

  function _attachLiveSources() {
    if (_liveAttached) return;
    _liveAttached = true;
    ['search', 'table', 'translate', 'workflow'].forEach(function (name) {
      var mod = K[name];
      if (!mod || typeof mod.subscribe !== 'function') return;
      try { mod.subscribe(_invalidateLive); } catch (_) { }
    });
  }

  function subscribeLive(fn) {
    if (typeof fn !== 'function') return function () { };
    _liveListeners.add(fn);
    _attachLiveSources();
    return function () { _liveListeners.delete(fn); };
  }

  function _searchState() {
    return (K.search && typeof K.search.getState === 'function') ? K.search.getState() : null;
  }

  function _tableState() {
    return (K.table && typeof K.table.getState === 'function') ? K.table.getState() : null;
  }

  function _translateState() {
    return (K.translate && typeof K.translate.getState === 'function') ? K.translate.getState() : null;
  }

  // Tables currently in play: the one applied for this ROM, a compare
  // table loaded for cross checking, and edits that are not applied yet.
  function _tableEntries() {
    var out = [];
    var s = _searchState();
    var ts = _tableState();
    var applied = s && s.tableData;

    if (applied && applied.entryCount) {
      out.push({
        id: 'table:applied',
        name: applied.name || 'table.tbl',
        meta: applied.entryCount + ' entries',
        tag: 'applied',
        activity: 'table'
      });
    }
    if (ts && ts.compareFileName) {
      out.push({
        id: 'table:compare',
        name: ts.compareFileName,
        meta: 'compare',
        tag: 'reference',
        activity: 'table'
      });
    }
    if (ts && !ts.isApplied && ts.editEntries && ts.editEntries.length) {
      out.push({
        id: 'table:edits',
        name: 'Table edits',
        meta: ts.editEntries.length + ' entries',
        tag: 'not applied',
        activity: 'table'
      });
    }
    return out;
  }

  function _groupEntries() {
    var s = _searchState();
    var groups = (s && Array.isArray(s.groups)) ? s.groups : [];
    var texts = (s && Array.isArray(s.texts)) ? s.texts : [];

    var byOffset = {};
    texts.forEach(function (t) { byOffset[Number(t.startByte)] = t; });

    return groups.map(function (g) {
      var offsets = Array.isArray(g.offsets) ? g.offsets : [];
      var done = 0;
      offsets.forEach(function (off) {
        var t = byOffset[Number(off)];
        if (t && String(t.translatedText || '').trim()) done++;
      });
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        count: offsets.length,
        done: done,
        meta: offsets.length + (offsets.length === 1 ? ' text' : ' texts') +
          (done > 0 ? ' \u00b7 ' + done + ' done' : ''),
        activity: 'translation'
      };
    });
  }

  // Files this session actually produced, named the same way the
  // download actions name them.
  function _fileEntries() {
    var out = [];
    var s = _searchState();
    var ts = _tableState();
    var tr = _translateState();
    var applied = s && s.tableData;

    if (_state.romName) {
      out.push({
        id: 'file:rom',
        name: _state.romName,
        meta: formatBytes(_state.romSize),
        tag: 'ROM',
        activity: null
      });
    }
    if (applied && applied.entryCount) {
      out.push({
        id: 'file:table',
        name: applied.name || 'table.tbl',
        meta: applied.entryCount + ' entries',
        tag: 'TBL',
        activity: 'table'
      });
    }
    if (ts && ts.compareFileName) {
      out.push({
        id: 'file:compare',
        name: ts.compareFileName,
        meta: 'compare',
        tag: 'TBL',
        activity: 'table'
      });
    }
    if (tr && tr.modifiedRom) {
      out.push({
        id: 'file:build',
        name: (_state.romName || 'translated.rom').replace(/\.[^.]+$/, '') + '_translated.rom',
        meta: formatBytes(tr.modifiedRom.length),
        tag: 'built',
        activity: 'translation'
      });
    }
    return out;
  }

  function _buildLiveSnapshot() {
    return {
      tables: _tableEntries(),
      groups: _groupEntries(),
      files: _fileEntries()
    };
  }

  function getLiveSnapshot() {
    if (!_liveCache) _liveCache = _buildLiveSnapshot();
    return _liveCache;
  }

  function useLiveData() {
    return R.useSyncExternalStore(subscribeLive, getLiveSnapshot, getLiveSnapshot);
  }

  // ---- Navigation event helpers -----------------------------------
  function dispatchNavigateActivity(activityId, source, label) {
    try {
      global.dispatchEvent(new CustomEvent('ketor:navigate-activity', {
        detail: {
          activity: activityId,
          source: source || 'project-tree',
          label: label || ''
        }
      }));
    } catch (_) { }
  }

  function dispatchNavigateHex(offset, source, label) {
    try {
      global.dispatchEvent(new CustomEvent('ketor:navigate-hex', {
        detail: {
          offset: Number(offset) || 0,
          source: source || 'project-tree',
          label: label || ''
        }
      }));
    } catch (_) { }
  }

  // ---- React Sidebar ----------------------------------------------
  function TreeSection(props) {
    var expanded = props.expanded;
    var onToggle = props.onToggle;
    var children = props.children;
    var title = props.title;
    var actions = props.actions;

    return e('div', { className: 'kt-sidebar-section' },
      e('div', {
        className: 'kt-tree-section-header',
        onClick: onToggle,
        style: {
          display: 'flex', alignItems: 'center',
          padding: '4px 8px 4px 4px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          color: 'var(--kt-sidebar-title-fg)'
        }
      },
        e('span', {
          style: {
            display: 'inline-flex',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.1s'
          }
        }, K.ui.icon('chevron-right', { size: 12 })),
        e('span', { style: { marginLeft: 4, flex: 1 } }, title),
        actions || null
      ),
      expanded ? e('div', { style: { padding: '2px 0 6px 0' } }, children) : null
    );
  }

  function InfoRow(props) {
    return e('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        padding: '2px 8px 2px 24px',
        fontSize: 11,
        color: 'var(--kt-sidebar-fg)'
      }
    },
      e('span', { style: { opacity: 0.7, flex: '0 0 auto' } }, props.label),
      e('span', {
        style: {
          color: 'var(--kt-editor-fg)',
          fontFamily: 'var(--kt-font-mono)',
          textAlign: 'right',
          wordBreak: 'break-all'
        }
      }, props.value)
    );
  }

  function TreeLeaf(props) {
    var selected = props.selected;
    return e('div', {
      onClick: props.onClick,
      onDoubleClick: props.onDoubleClick,
      title: props.tooltip || '',
      style: {
        padding: '3px 8px 3px ' + (24 + (props.indent || 0) * 12) + 'px',
        cursor: props.onDoubleClick ? 'pointer' : 'default',
        fontSize: 12,
        color: 'var(--kt-sidebar-fg)',
        background: selected ? 'var(--kt-list-active-selection-bg)' : 'transparent',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    },
      props.icon ? e('span', {
        style: { display: 'inline-flex', flex: '0 0 auto', opacity: 0.7 }
      }, K.ui.icon(props.icon, { size: 13 })) : null,
      e('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } },
        props.label),
      props.meta ? e('span', {
        style: { opacity: 0.5, fontSize: 10, flex: '0 0 auto' }
      }, props.meta) : null
    );
  }

  function ProjectSidebar() {
    var p = useProject();
    var live = useLiveData();

    var onGoTable = uC(function () {
      dispatchNavigateActivity('table', 'project-tree', 'Tables');
    }, []);

    var onGoTranslation = uC(function (groupName) {
      dispatchNavigateActivity('translation', 'project-tree', groupName || 'Groups');
    }, []);

    var onGoSearch = uC(function () {
      dispatchNavigateActivity('search', 'project-tree', 'Groups');
    }, []);

    // Selecting the group first means the Translation tab opens on
    // the group the user double-clicked instead of whatever was
    // selected before.
    var onGoGroup = uC(function (groupId, groupName) {
      if (K.search && typeof K.search.selectGroup === 'function') {
        K.search.selectGroup(groupId);
      }
      onGoTranslation(groupName);
    }, [onGoTranslation]);

    var onOpenLive = uC(function (entry) {
      if (!entry || !entry.activity) return;
      dispatchNavigateActivity(entry.activity, 'project-tree', entry.name || '');
    }, []);

    var onGoHex = uC(function (offset, label) {
      dispatchNavigateHex(offset, 'project-tree', label || '');
    }, []);

    var headerKeys = Object.keys(p.header || {});
    var KEY_FIELDS = ['Format', 'Title', 'System', 'Region', 'Version'];
    var visibleHeaderKeys = p.showAllHeader
      ? headerKeys
      : headerKeys.filter(function (k) { return KEY_FIELDS.indexOf(k) >= 0; }).slice(0, 5);

    if (!p.romName) {
      return e('div', { style: { paddingBottom: 12 } },
        e('div', {
          style: {
            padding: '16px 12px',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--kt-input-placeholder-fg)',
            lineHeight: 1.6
          }
        },
          e('div', { style: { marginBottom: 8, opacity: 0.7 } },
            K.ui.icon('folder', { size: 32 })),
          'No ROM loaded.',
          e('br'),
          'Use File > Load ROM.'
        )
      );
    }

    return e('div', { style: { paddingBottom: 16 } },

      e(TreeSection, {
        title: 'ROM',
        expanded: p.expanded.rom,
        onToggle: function () { toggleExpanded('rom'); }
      },
        e(InfoRow, { label: 'Name', value: p.romName }),
        e(InfoRow, { label: 'System', value: p.romSystem }),
        e(InfoRow, { label: 'Size', value: formatBytes(p.romSize) }),
        e(InfoRow, { label: 'CRC32', value: p.crc32 || '...' }),
        e(InfoRow, { label: 'SHA1', value: p.sha1 || '...' })
      ),

      headerKeys.length > 0 ? e(TreeSection, {
        title: 'Header Details',
        expanded: p.expanded.header,
        onToggle: function () { toggleExpanded('header'); }
      },
        visibleHeaderKeys.map(function (k) {
          return e(InfoRow, { key: k, label: k, value: String(p.header[k]) });
        }),
        headerKeys.length > 5 ? e('div', {
          onClick: toggleShowAllHeader,
          style: {
            padding: '4px 8px 4px 24px',
            fontSize: 11,
            color: '#3794ff',
            cursor: 'pointer',
            textDecoration: 'underline'
          }
        }, p.showAllHeader ? 'Show less' : 'Show all (' + headerKeys.length + ')') : null
      ) : null,

      e(TreeSection, {
        title: 'Sections',
        expanded: p.expanded.sections,
        onToggle: function () { toggleExpanded('sections'); }
      },
        p.sections.length === 0
          ? e('div', {
              style: {
                padding: '4px 8px 4px 24px', fontSize: 11,
                color: 'var(--kt-input-placeholder-fg)', opacity: 0.7
              }
            }, 'No sections detected.')
          : p.sections.map(function (sec) {
              var range = '0x' + sec.start.toString(16).toUpperCase() +
                (sec.end !== null ? ' - 0x' + sec.end.toString(16).toUpperCase() : '+');
              return e(TreeLeaf, {
                key: sec.id,
                label: sec.label,
                meta: range,
                icon: 'file',
                selected: p.selectedNode === sec.id,
                tooltip: 'Double-click to open Hex Editor at 0x' + sec.start.toString(16).toUpperCase(),
                onClick: function () { selectNode(sec.id); },
                onDoubleClick: function () { onGoHex(sec.start, sec.label); }
              });
            })
      ),

      e(TreeSection, {
        title: 'Tables',
        expanded: p.expanded.tables,
        onToggle: function () { toggleExpanded('tables'); }
      },
        live.tables.length === 0
          ? e(TreeLeaf, {
              label: 'Load or generate table',
              icon: 'file-code',
              meta: 'Open Table',
              selected: p.selectedNode === 'tables-open',
              tooltip: 'Double-click opens Table activity',
              onClick: function () { selectNode('tables-open'); },
              onDoubleClick: onGoTable
            })
          : live.tables.map(function (t) {
              return e(TreeLeaf, {
                key: t.id,
                label: t.name,
                icon: 'file-code',
                meta: t.meta + ' \u00b7 ' + t.tag,
                selected: p.selectedNode === t.id,
                tooltip: 'Double-click opens Table activity',
                onClick: function () { selectNode(t.id); },
                onDoubleClick: function () { onOpenLive(t); }
              });
            })
      ),

      e(TreeSection, {
        title: 'Groups',
        expanded: p.expanded.groups,
        onToggle: function () { toggleExpanded('groups'); }
      },
        live.groups.length === 0
          ? e(TreeLeaf, {
              label: 'No groups yet',
              icon: 'folder',
              meta: 'Create in Search',
              selected: p.selectedNode === 'groups-empty',
              tooltip: 'Double-click opens Search Text activity',
              onClick: function () { selectNode('groups-empty'); },
              onDoubleClick: onGoSearch
            })
          : live.groups.map(function (g) {
              return e(TreeLeaf, {
                key: g.id,
                label: g.name,
                icon: 'folder',
                meta: g.meta,
                selected: p.selectedNode === ('group:' + g.id),
                tooltip: 'Double-click opens this group in Translation',
                onClick: function () { selectNode('group:' + g.id); },
                onDoubleClick: function () { onGoGroup(g.id, g.name); }
              });
            })
      ),

      e(TreeSection, {
        title: 'Project Files',
        expanded: p.expanded.projectFiles,
        onToggle: function () { toggleExpanded('projectFiles'); }
      },
        live.files.length === 0
          ? e('div', {
              style: {
                padding: '4px 8px 4px 24px', fontSize: 11,
                color: 'var(--kt-input-placeholder-fg)', opacity: 0.7
              }
            }, 'Nothing loaded yet.')
          : live.files.map(function (f) {
              return e(TreeLeaf, {
                key: f.id,
                label: f.name,
                icon: 'file',
                meta: f.meta + ' \u00b7 ' + f.tag,
                selected: p.selectedNode === f.id,
                tooltip: f.activity ? 'Double-click opens ' + f.activity : f.name,
                onClick: function () { selectNode(f.id); },
                onDoubleClick: function () { onOpenLive(f); }
              });
            })
      ),

      p.recent.length > 0 ? e(TreeSection, {
        title: 'Recent',
        expanded: p.expanded.recent,
        onToggle: function () { toggleExpanded('recent'); },
        actions: e('button', {
          type: 'button',
          onClick: function (ev) { ev.stopPropagation(); clearRecent(); },
          title: 'Clear recent',
          style: {
            background: 'transparent', border: 'none',
            color: 'var(--kt-sidebar-fg)', cursor: 'pointer',
            opacity: 0.6, fontSize: 11, padding: '0 4px'
          }
        }, 'clear')
      },
        p.recent.slice(0, 8).map(function (r, idx) {
          var meta = formatBytes(r.size);
          return e(TreeLeaf, {
            key: 'recent-' + idx,
            label: r.name,
            icon: 'file',
            meta: meta,
            selected: p.selectedNode === ('recent:' + idx),
            tooltip: r.system + ' | ' + (r.hash || ''),
            onClick: function () { selectNode('recent:' + idx); }
          });
        })
      ) : null
    );
  }

  _set({ recent: loadRecent() });

  K.project = {
    getState: getState,
    subscribe: subscribe,
    useProject: useProject,
    useLiveData: useLiveData,
    setRomFromLoad: setRomFromLoad,
    toggleShowAllHeader: toggleShowAllHeader,
    toggleExpanded: toggleExpanded,
    selectNode: selectNode,
    clearRecent: clearRecent,
    reset: reset,
    formatBytes: formatBytes
  };

  K.ui.registerSidebarProvider('project', ProjectSidebar);

})(window);