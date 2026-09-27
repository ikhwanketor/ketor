/* ============================================================
   Ketor - ROM Loader
   ------------------------------------------------------------
   Handles ROM file loading without freezing the browser.
   - Files < 32 MB   : read directly via file.arrayBuffer()
   - Files >= 32 MB  : chunked read (4 MB per chunk) with
                       event-loop yield between chunks
   - Rejects .zip/.rar/.7z archives
   - Soft size warning above 4 GB
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  var SMALL_FILE_THRESHOLD = 32 * 1024 * 1024;
  var CHUNK_SIZE = 4 * 1024 * 1024;
  var SOFT_SIZE_LIMIT = 4 * 1024 * 1024 * 1024;
  var FORBIDDEN_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];

  function getExt(name) {
    var parts = String(name || '').split('.');
    if (parts.length < 2) return '';
    return parts[parts.length - 1].toLowerCase();
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function readDirect(file) {
    return file.arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function readChunked(file, chunkSize, onProgress) {
    var total = file.size;
    var result = new Uint8Array(total);
    var offset = 0;

    function readNext() {
      if (offset >= total) return Promise.resolve(result);
      var end = Math.min(offset + chunkSize, total);
      var blob = file.slice(offset, end);
      return blob.arrayBuffer().then(function (buf) {
        result.set(new Uint8Array(buf), offset);
        offset = end;
        if (onProgress) {
          try { onProgress(offset / total); } catch (_) { }
        }
        return new Promise(function (r) { setTimeout(r, 0); }).then(readNext);
      });
    }

    return readNext();
  }

  function loadRomFile(file, options) {
    var opts = options || {};
    var onProgress = opts.onProgress || function () { };
    var onWarning = opts.onWarning || function () { };

    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }

      var ext = getExt(file.name);
      if (FORBIDDEN_EXT.indexOf(ext) !== -1) {
        reject(new Error('Archive file (.' + ext + ') is not supported. Extract the archive first and load the ROM inside.'));
        return;
      }

      if (file.size > SOFT_SIZE_LIMIT) {
        onWarning('File is ' + formatSize(file.size) + ' (> 4 GB). Loading may be slow or fail on low-memory devices.');
      }

      var useChunked = file.size >= SMALL_FILE_THRESHOLD;
      onProgress(0);

      var promise;
      if (useChunked) {
        promise = readChunked(file, CHUNK_SIZE, onProgress);
      } else {
        promise = readDirect(file).then(function (data) {
          onProgress(1);
          return data;
        });
      }

      promise.then(function (data) {
        resolve({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified || Date.now(),
          data: data,
          usedChunkedRead: useChunked
        });
      }).catch(reject);
    });
  }

  Ketor.core.loadRomFile = loadRomFile;
  Ketor.core.formatSize = formatSize;

})(window);