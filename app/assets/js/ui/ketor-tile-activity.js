/* ============================================================
   Ketor - Tile activity (Batch 47)
   ------------------------------------------------------------
   State, editor tab and sidebar in one module, because they share
   one small store and the activity is one thing.

   Rules it follows:
   - It owns no byte buffer. A pixel change is written through the
     Hex Editor patch layer (K.hex.setByte), so it turns red as a
     changed byte, takes part in Clear / Undo / Redo and is written
     by Export like any other patch.
   - Clicking a tile jumps the Hex Editor to its offset.
   - The region and the format are detected by score, but a candidate
     is only proposed; the user confirms or picks another one.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var uE = R.useEffect;
  var uC = R.useCallback;
  var uR = R.useRef;
  var MONO = 'var(--kt-font-mono)';

  var _state = {
    region: null,
    format: 'gba-4bpp',
    palette: 0,
    zoom: 3,
    tiles: 128,
    candidates: [],
    scanning: false,
    status: ''
  };
  var _subs = new Set();
  function _set(patch) {
    var changed = false;
    var next = _state;
    Object.keys(patch).forEach(function (k) {
      if (_state[k] !== patch[k]) {
        if (!changed) { next = Object.assign({}, _state); changed = true; }
        next[k] = patch[k];
      }
    });
    if (changed) { _state = next; _subs.forEach(function (f) { try { f(); } catch (_) { } }); }
  }
  function getState() { return _state; }
  function subscribe(fn) { _subs.add(fn); return function () { _subs.delete(fn); }; }
  function useTile() { return R.useSyncExternalStore(subscribe, getState); }

  function romBytes() {
    var h = K.hex && K.hex.getState ? K.hex.getState() : null;
    return h ? h.romBytes : null;
  }

  // colour 0..15 -> rgb, a plain ramp until the game palette is read from the ROM
  function colourAt(index) {
    var v = Math.max(0, Math.min(15, index));
    var g = Math.round(v * 17);
    return 'rgb(' + g + ',' + g + ',' + (v === 0 ? 0 : Math.round(g * 0.8)) + ')';
  }

  /* Score every 64 KiB step and keep the best few, so detection proposes a
     region instead of silently choosing one. */
  function detect() {
    var bytes = romBytes();
    if (!bytes) { _set({ status: 'Load a ROM first.' }); return; }
    if (!K.core || typeof K.core.scoreTileRegion !== 'function') { _set({ status: 'Tile codec missing.' }); return; }
    _set({ scanning: true, status: 'Scoring regions...' });
    var found = [];
    var fmt = _state.format;
    var step = 0x10000;
    for (var off = 0; off + 64 * K.core.tileSize(fmt) < bytes.length; off += step) {
      var score = K.core.scoreTileRegion(bytes, off, fmt, 64);
      found.push({ offset: off, score: score });
    }
    found.sort(function (a, b) { return b.score - a.score; });
    var best = found.slice(0, 8);
    _set({
      scanning: false,
      candidates: best,
      region: best.length ? best[0].offset : null,
      status: best.length
        ? 'Best region 0x' + best[0].offset.toString(16).toUpperCase() + ' (score ' + best[0].score.toFixed(2) + '), ' + (best.length - 1) + ' other candidate(s).'
        : 'No candidate found.'
    });
  }

  /* Writes one pixel through the Hex Editor patch layer. */
  function setPixel(tileIndex, x, y, colour) {
    var bytes = romBytes();
    var C = K.core;
    if (!bytes || !C || typeof C.decodeTile !== 'function') return false;
    var fmt = _state.format;
    var offset = Number(_state.region) + tileIndex * C.tileSize(fmt);
    if (!Number.isFinite(offset) || offset < 0 || offset + C.tileSize(fmt) > bytes.length) return false;
    var px = C.decodeTile(bytes, offset, fmt);
    px[y][x] = colour & (C.tileFormat(fmt).colors - 1);
    var encoded = C.encodeTile(px, fmt);
    var written = 0;
    for (var i = 0; i < encoded.length; i++) {
      var before = bytes[offset + i] & 0xFF;
      if (encoded[i] === before) continue;
      if (K.hex && K.hex.setByte && K.hex.setByte(offset + i, encoded[i])) written++;
    }
    _set({ status: written ? 'Pixel written: ' + written + ' byte(s) at 0x' + offset.toString(16).toUpperCase() + '.' : 'Pixel unchanged.' });
    return written > 0;
  }

  function TileCanvas(props) {
    var ref = uR(null);
    var bytes = props.bytes;
    var C = K.core;
    uE(function () {
      var canvas = ref.current;
      if (!canvas || !bytes || !C) return;
      var ctx = canvas.getContext('2d');
      var fmt = props.format;
      var size = C.tileSize(fmt);
      var perRow = Math.max(1, Math.floor(props.width / (8 * props.zoom)));
      var rows = Math.ceil(props.tiles / perRow);
      canvas.width = perRow * 8 * props.zoom;
      canvas.height = rows * 8 * props.zoom;
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var t = 0; t < props.tiles; t++) {
        var off = Number(props.region) + t * size;
        if (off < 0 || off + size > bytes.length) break;
        var px = C.decodeTile(bytes, off, fmt);
        var tx = (t % perRow) * 8 * props.zoom;
        var ty = Math.floor(t / perRow) * 8 * props.zoom;
        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            ctx.fillStyle = colourAt(px[y][x]);
            ctx.fillRect(tx + x * props.zoom, ty + y * props.zoom, props.zoom, props.zoom);
          }
        }
        if (props.selected === t) {
          ctx.strokeStyle = 'var(--kt-focus-border)';
          ctx.strokeStyle = '#4daafc';
          ctx.strokeRect(tx + 0.5, ty + 0.5, 8 * props.zoom - 1, 8 * props.zoom - 1);
        }
      }
    }, [bytes, props.region, props.format, props.zoom, props.tiles, props.selected, props.refresh]);
    return e('canvas', {
      ref: ref,
      onMouseDown: props.onClick,
      onMouseMove: props.onMove,
      onMouseUp: props.onUp,
      onMouseLeave: props.onUp,
      style: { display: 'block', imageRendering: 'pixelated', cursor: 'crosshair' }
    });
  }

  var TOOLS = [
    { id: 'pencil', key: 'B', label: 'Pencil' },
    { id: 'line', key: 'L', label: 'Line' },
    { id: 'bucket', key: 'G', label: 'Bucket' },
    { id: 'select', key: 'V', label: 'Select' }
  ];

  function TileTab() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var toolSt = uS('pencil'); var tool = toolSt[0]; var setTool = toolSt[1];
    var colSt = uS(1); var colour = colSt[0]; var setColour = colSt[1];
    var tileSt = uS(-1); var selected = tileSt[0]; var setSelected = tileSt[1];
    var selSt = uS(null); var sel = selSt[0]; var setSel = selSt[1];
    var dragRef = uR(null);
    var clipRef = uR(null);
    var wrapRef = uR(null);
    var widthSt = uS(800); var width = widthSt[0];

    uE(function () {
      function measure() { if (wrapRef.current) widthSt[1](wrapRef.current.clientWidth || 800); }
      measure();
      global.addEventListener('resize', measure);
      return function () { global.removeEventListener('resize', measure); };
    }, []);

    // Pixel under the pointer: which tile, and which of its 64 pixels.
    function pixelAt(ev, canvas) {
      var rect = canvas.getBoundingClientRect();
      var z = st.zoom;
      var perRow = Math.max(1, Math.floor((width - 16) / (8 * z)));
      var col = Math.floor((ev.clientX - rect.left) / (8 * z));
      var row = Math.floor((ev.clientY - rect.top) / (8 * z));
      if (col < 0 || row < 0 || col >= perRow) return null;
      var t = row * perRow + col;
      var x = Math.floor(((ev.clientX - rect.left) - col * 8 * z) / z);
      var y = Math.floor(((ev.clientY - rect.top) - row * 8 * z) / z);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return { tile: t, x: x, y: y };
    }

    function line(x0, y0, x1, y1, fn) {
      var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
      for (var guard = 0; guard < 64; guard++) {
        fn(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    }

    function bucket(tile, x, y, colour) {
      var bytes = hex && hex.romBytes;
      var C = K.core;
      if (!bytes || !C) return;
      var px = C.decodeTile(bytes, Number(st.region) + tile * C.tileSize(st.format), st.format);
      var from = px[y][x];
      if (from === colour) return;
      var stack = [[x, y]];
      var seen = {};
      while (stack.length) {
        var p = stack.pop();
        var cx = p[0], cy = p[1];
        if (cx < 0 || cy < 0 || cx > 7 || cy > 7) continue;
        var key = cx + ',' + cy;
        if (seen[key]) continue;
        seen[key] = true;
        if (px[cy][cx] !== from) continue;
        px[cy][cx] = colour;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) if (px[yy][xx] !== from) setPixel(tile, xx, yy, px[yy][xx]);
    }

    function onDown(ev) {
      var canvas = ev.currentTarget;
      var p = pixelAt(ev, canvas);
      if (!p) return;
      setSelected(p.tile);
      if (tool === 'select') { setSel({ tile: p.tile, x: p.x, y: p.y }); return; }
      if (tool === 'bucket') { bucket(p.tile, p.x, p.y, colour); return; }
      dragRef.current = { tile: p.tile, x0: p.x, y0: p.y };
      setSel({ tile: p.tile, x: p.x, y: p.y });
      if (tool === 'pencil') setPixel(p.tile, p.x, p.y, colour);
    }
    function onMove(ev) {
      var d = dragRef.current;
      if (!d) return;
      var p = pixelAt(ev, ev.currentTarget);
      if (!p || p.tile !== d.tile) return;
      if (tool === 'pencil') { line(d.x0, d.y0, p.x, p.y, function (x, y) { setPixel(d.tile, x, y, colour); }); d.x0 = p.x; d.y0 = p.y; }
      else setSel({ tile: d.tile, x: p.x, y: p.y });
    }
    function onUp(ev) {
      var d = dragRef.current;
      dragRef.current = null;
      if (!d || tool !== 'line') return;
      var p = pixelAt(ev, ev.currentTarget);
      if (!p || p.tile !== d.tile) return;
      line(d.x0, d.y0, p.x, p.y, function (x, y) { setPixel(d.tile, x, y, colour); });
    }

    function onKey(ev) {
      var k = ev.key;
      if (/^[0-9]$/.test(k)) { setColour(Number(k) === 0 ? 0 : Number(k) % 16); return; }
      var upper = String(k).toUpperCase();
      for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].key === upper) { setTool(TOOLS[i].id); ev.preventDefault(); return; }
      if (k === 'Delete' || k === 'Backspace') {
        if (selected >= 0) for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) setPixel(selected, x, y, 0);
        ev.preventDefault(); return;
      }
      if (k === 'Escape') { setSel(null); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'Z') { K.hex.undo(); ev.preventDefault(); return; }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'C') {
        var bytes = hex && hex.romBytes;
        if (bytes && selected >= 0 && K.core) clipRef.current = K.core.decodeTile(bytes, Number(st.region) + selected * K.core.tileSize(st.format), st.format);
        _set({ status: 'Tile copied.' });
        ev.preventDefault(); return;
      }
      if ((ev.ctrlKey || ev.metaKey) && upper === 'V') {
        var clip = clipRef.current;
        if (!clip || selected < 0) { _set({ status: 'Copy a tile first.' }); return; }
        for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) setPixel(selected, xx, yy, clip[yy][xx]);
        ev.preventDefault(); return;
      }
      var step = 0, perRow = Math.max(1, Math.floor((width - 16) / (8 * st.zoom)));
      if (k === 'ArrowLeft') step = -1;
      else if (k === 'ArrowRight') step = 1;
      else if (k === 'ArrowUp') step = -perRow;
      else if (k === 'ArrowDown') step = perRow;
      if (step !== 0 && selected >= 0) { setSelected(Math.max(0, selected + step)); ev.preventDefault(); }
    }

    if (!hex || !hex.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Tile Editor'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from the File menu.'));
    }

    return e('div', {
      ref: wrapRef, tabIndex: 0, onKeyDown: onKey,
      style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, outline: 'none' }
    },
      e('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderBottom: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-sidebar-bg)', fontSize: 11, flexWrap: 'nowrap' } },
        TOOLS.map(function (t) {
          return e('button', {
            key: t.id, type: 'button',
            className: 'kt-btn small' + (tool === t.id ? '' : ' secondary'),
            title: t.label + ' (' + t.key + ')',
            onClick: function () { setTool(t.id); }
          }, t.label);
        }),
        e('span', { style: { opacity: 0.25 } }, '|'),
        e('button', { type: 'button', className: 'kt-btn small secondary', disabled: selected < 0, onClick: function () { onKey({ key: 'c', ctrlKey: true, preventDefault: function () { } }); } }, 'Copy'),
        e('button', { type: 'button', className: 'kt-btn small secondary', disabled: selected < 0, onClick: function () { onKey({ key: 'v', ctrlKey: true, preventDefault: function () { } }); } }, 'Paste'),
        e('span', { style: { flex: 1 } }),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 } }, st.region === null ? 'no region' : '0x' + Number(st.region).toString(16).toUpperCase().padStart(6, '0')),
        e('span', { style: { opacity: 0.6 } }, st.format),
        e('span', { style: { opacity: 0.6 } }, selected < 0 ? 'no tile' : 'tile ' + selected)
      ),
      e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 8 } },
        e(TileCanvas, {
          bytes: hex.romBytes,
          region: st.region === null ? 0 : st.region,
          format: st.format, zoom: st.zoom, tiles: st.tiles,
          selected: selected, refresh: hex.patches,
          width: Math.max(200, width - 16),
          onClick: onDown, onMove: onMove, onUp: onUp
        })
      ),
      e('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '5px 10px', borderTop: '1px solid var(--kt-widget-border-default)', background: 'var(--kt-statusbar-bg)', color: 'var(--kt-statusbar-fg)', fontSize: 11 } },
        e('span', null, 'Colour'),
        e('select', { className: 'kt-select', value: colour, onChange: function (ev) { setColour(Number(ev.target.value)); }, style: { fontSize: 11 } },
          Array.apply(null, Array(16)).map(function (_, i) { return e('option', { key: 'c' + i, value: i }, String(i)); })),
        e('button', { type: 'button', className: 'kt-btn small', disabled: selected < 0, onClick: function () { K.hex.gotoOffset(Number(st.region) + selected * K.core.tileSize(st.format)); } }, 'Goto Hex'),
        e('span', { style: { flex: 1 } }),
        e('span', { style: { opacity: 0.75 } }, st.status)
      )
    );
  }

  function TileSidebar() {
    var st = useTile();
    var hex = K.hex ? K.hex.useHex() : null;
    var formats = (K.core && K.core.TILE_FORMATS) || {};
    return e('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 } },
      e('div', { style: { fontWeight: 600 } }, 'Tiles'),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Format',
        e('select', {
          className: 'kt-select', value: st.format,
          onChange: function (ev) { _set({ format: ev.target.value, region: null, candidates: [] }); },
          style: { fontSize: 11 }
        }, Object.keys(formats).map(function (id) {
          return e('option', { key: id, value: id }, formats[id].label);
        }))
      ),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Zoom',
        e('select', {
          className: 'kt-select', value: st.zoom,
          onChange: function (ev) { _set({ zoom: Number(ev.target.value) }); },
          style: { fontSize: 11 }
        }, [1, 2, 3, 4, 6, 8].map(function (z) { return e('option', { key: 'z' + z, value: z }, z + 'x'); }))
      ),
      e('label', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        'Tiles shown',
        e('select', {
          className: 'kt-select', value: st.tiles,
          onChange: function (ev) { _set({ tiles: Number(ev.target.value) }); },
          style: { fontSize: 11 }
        }, [64, 128, 256, 512].map(function (n) { return e('option', { key: 't' + n, value: n }, String(n)); }))
      ),
      e('button', {
        type: 'button', className: 'kt-btn',
        disabled: !hex || !hex.romBytes || st.scanning,
        onClick: detect,
        title: 'Score the ROM in 64 KiB steps and propose the best tile region'
      }, st.scanning ? 'Scanning...' : 'Detect tiles'),
      st.candidates.length ? e('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }
      },
        e('div', { style: { opacity: 0.75 } }, 'Candidates (score)'),
        st.candidates.map(function (c) {
          return e('button', {
            key: 'cand' + c.offset,
            type: 'button',
            className: 'kt-btn small' + (st.region === c.offset ? '' : ' secondary'),
            style: { fontFamily: MONO, justifyContent: 'flex-start' },
            onClick: function () { _set({ region: c.offset }); }
          }, '0x' + c.offset.toString(16).toUpperCase().padStart(6, '0') + '  ' + c.score.toFixed(2));
        })
      ) : null,
      e('div', { style: { opacity: 0.7, lineHeight: 1.5 } }, st.status || 'Detect a region, then click a tile and paint pixels. Every pixel is written as a hex patch.')
    );
  }

  K.ui.registerTabProvider('tile', TileTab);
  K.ui.registerSidebarProvider('tile', TileSidebar);
  K.tile = {
    getState: getState, subscribe: subscribe, useTile: useTile,
    detect: detect, setPixel: setPixel, setRegion: function (o) { _set({ region: Number(o) }); },
    setFormat: function (f) { _set({ format: String(f) }); }, colourAt: colourAt
  };
})(window);
