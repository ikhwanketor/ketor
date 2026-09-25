/* ============================================================
   Ketor - Canvas math (Batch 51)
   ------------------------------------------------------------
   Where the user clicks and which ROM byte changes have to be the
   same place, always. That is one transformation in three steps,
   and it lives here as pure functions so the canvas and the tests
   use the same arithmetic:

     1. screen point -> canvas point -> cell and pixel inside it
        cellX = floor(canvasX / (tileWidth * zoom))
        cellY = floor(canvasY / (tileHeight * zoom))
        pixelX = floor((canvasX - cellX * tileWidth * zoom) / zoom)
     2. cell -> linear index
        index = row * columns + column
     3. index -> byte address
        address = base + index * entryBytes

   Every step is checked by a round trip test: for each pixel of a
   canvas, the cell and pixel it reports must scale back to that same
   pixel, and index must map back to the column and row it came from.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  function positive(value, fallback) {
    var v = Math.floor(Number(value));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  function nonNegative(value, fallback) {
    var v = Math.floor(Number(value));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  /* Screen coordinates, which carry the page scroll, become coordinates inside
     the element. getBoundingClientRect already accounts for scroll, so this is a
     subtraction; it exists to keep that fact in one place. */
  function screenToCanvas(clientX, clientY, rect) {
    return { x: Number(clientX) - Number(rect.left), y: Number(clientY) - Number(rect.top) };
  }

  /* Step 1 for a sheet of tiles: how many tiles fit, and which tile and pixel a
     point lands on. Returns null outside the grid, never a negative index. */
  function tileHit(canvasX, canvasY, options) {
    var opts = options || {};
    var zoom = positive(opts.zoom, 1);
    var tileWidth = positive(opts.tileWidth, 8);
    var tileHeight = positive(opts.tileHeight, 8);
    var available = positive(opts.availableWidth, tileWidth * zoom);
    var tiles = positive(opts.tiles, 1);
    var perRow = Math.max(1, Math.floor(available / (tileWidth * zoom)));
    var rows = Math.ceil(tiles / perRow);
    var x = Number(canvasX), y = Number(canvasY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
    var column = Math.floor(x / (tileWidth * zoom));
    var row = Math.floor(y / (tileHeight * zoom));
    if (column < 0 || column >= perRow || row < 0 || row >= rows) return null;
    var index = row * perRow + column;
    if (index >= tiles) return null;
    var pixelX = Math.floor((x - column * tileWidth * zoom) / zoom);
    var pixelY = Math.floor((y - row * tileHeight * zoom) / zoom);
    if (pixelX < 0 || pixelX >= tileWidth || pixelY < 0 || pixelY >= tileHeight) return null;
    return { tile: index, x: pixelX, y: pixelY, column: column, row: row, perRow: perRow, rows: rows };
  }

  function tileSheetSize(options) {
    var opts = options || {};
    var zoom = positive(opts.zoom, 1);
    var tileWidth = positive(opts.tileWidth, 8);
    var tileHeight = positive(opts.tileHeight, 8);
    var available = positive(opts.availableWidth, tileWidth * zoom);
    var tiles = positive(opts.tiles, 1);
    var perRow = Math.max(1, Math.floor(available / (tileWidth * zoom)));
    var rows = Math.ceil(tiles / perRow);
    return { perRow: perRow, rows: rows, width: perRow * tileWidth * zoom, height: rows * tileHeight * zoom };
  }

  /* Step 1 for a map: whole cells, no pixel inside them needed for a click, but
     the pixel is reported as well for painters that want it. */
  function mapHit(canvasX, canvasY, options) {
    var opts = options || {};
    var zoom = positive(opts.zoom, 1);
    var tileWidth = positive(opts.tileWidth, 8);
    var tileHeight = positive(opts.tileHeight, 8);
    var columns = positive(opts.columns, 1);
    var rows = positive(opts.rows, 1);
    var x = Number(canvasX), y = Number(canvasY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
    var column = Math.floor(x / (tileWidth * zoom));
    var row = Math.floor(y / (tileHeight * zoom));
    if (column >= columns || row >= rows) return null;
    return {
      cell: cellIndex(column, row, columns),
      column: column,
      row: row,
      x: Math.floor((x - column * tileWidth * zoom) / zoom),
      y: Math.floor((y - row * tileHeight * zoom) / zoom)
    };
  }

  /* Step 2: the linear index a two dimensional map is stored as. */
  function cellIndex(column, row, columns) {
    var cols = positive(columns, 1);
    return nonNegative(row, 0) * cols + nonNegative(column, 0);
  }

  function indexToCell(index, columns) {
    var cols = positive(columns, 1);
    var i = nonNegative(index, 0);
    return { column: i % cols, row: Math.floor(i / cols) };
  }

  /* Step 3: the byte a cell starts at. entryBytes is 1 on the Game Boy and the
     NES, 2 on the GBA, SNES and Mega Drive. */
  function cellAddress(base, index, entryBytes) {
    return nonNegative(base, 0) + nonNegative(index, 0) * positive(entryBytes, 1);
  }

  function addressToCell(address, base, entryBytes) {
    var width = positive(entryBytes, 1);
    return Math.floor((Number(address) - nonNegative(base, 0)) / width);
  }

  /* The whole chain in one call, which is what a click handler wants. */
  function hitToAddress(canvasX, canvasY, options) {
    var opts = options || {};
    var hit = mapHit(canvasX, canvasY, opts);
    if (!hit) return null;
    var address = cellAddress(opts.base, hit.cell, opts.entryBytes);
    return {
      cell: hit.cell, column: hit.column, row: hit.row, x: hit.x, y: hit.y,
      address: address, length: positive(opts.entryBytes, 1)
    };
  }

  /* Which pixels of a tile one byte of it covers, so a hex cursor can be pointed
     at on the canvas. The three layouts answer differently:
       planar    one bit of eight pixels: a whole row
       nibble    two pixels per byte
       byte8     one pixel per byte
     Returns null when the byte index is outside the tile. */
  function byteToPixels(format, index, tileWidth) {
    var width = positive(tileWidth, 8);
    var b = nonNegative(index, 0);
    var kind = format && format.kind ? format.kind : 'nibble';
    var size = format && format.size ? format.size : 32;
    if (b >= size) return null;
    if (kind === 'nibble') {
      var row = Math.floor(b / (width / 2));
      var pair = b % (width / 2);
      return [{ x: pair * 2, y: row }, { x: pair * 2 + 1, y: row }];
    }
    if (kind === 'byte8') {
      return [{ x: b % width, y: Math.floor(b / width) }];
    }
    // 1bpp is one byte per row, so the byte index is the row itself
    if (kind === 'planar1') {
      var single = [];
      for (var sx = 0; sx < width; sx++) single.push({ x: sx, y: b });
      return single;
    }
    /* Planar: two bytes per row inside a 16 byte group, and the groups are
       further bit planes of the same eight rows, not more rows. */
    var group = Math.floor(b / 16);
    var planeRow = Math.floor((b % 16) / 2);
    var out = [];
    for (var x = 0; x < width; x++) out.push({ x: x, y: planeRow });
    return out;
  }

  K.core.screenToCanvas = screenToCanvas;
  K.core.tileHit = tileHit;
  K.core.tileSheetSize = tileSheetSize;
  K.core.mapHit = mapHit;
  K.core.cellIndex = cellIndex;
  K.core.indexToCell = indexToCell;
  K.core.cellAddress = cellAddress;
  K.core.addressToCell = addressToCell;
  K.core.hitToAddress = hitToAddress;
  K.core.byteToPixels = byteToPixels;
})(window);
