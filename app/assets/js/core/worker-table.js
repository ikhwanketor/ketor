/* The .tbl parser worker, moved out of the legacy core.js. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

    const createTableWorker = () => {
      const workerCode = `
          const parseTable = (content, fileName, parseId) => {
            const lines = String(content || '').replace(/\\r/g, '').split('\\n');
            const singleByte = {};
            const multiByte = {};
            let entryCount = 0;
            let maxByteLength = 1;
            const byteWidths = new Set();
            let spaceKeySeen = false;

            lines.forEach((rawLine) => {
              if (!rawLine) return;
              const trimmed = rawLine.trim();
              if (!trimmed || trimmed.startsWith('//')) return;
              const commentIndex = rawLine.indexOf(';');
              // ";" starts a comment, except when it *is* the value: tables
              // that map printable ASCII contain a "3B=;" line and stripping
              // it there would silently drop the semicolon mapping.
              const eqIndex = rawLine.indexOf('=');
              const semicolonIsValue = eqIndex > -1 && commentIndex === eqIndex + 1;
              const line = (commentIndex > -1 && !semicolonIsValue)
                ? rawLine.substring(0, commentIndex)
                : rawLine;
              const splitIndex = line.indexOf('=');
              if (splitIndex <= 0) return;

              const hexStr = line.substring(0, splitIndex).replace(/\\s+/g, '').toUpperCase();
              if (!/^[0-9A-F]+$/.test(hexStr) || (hexStr.length % 2) !== 0) return;

              let char = line.substring(splitIndex + 1);
              if (char === undefined) char = '';
              const valueRaw = char;
              const hasValue = valueRaw.length > 0;
              const bytes = hexStr.match(/.{1,2}/g).map(h => parseInt(h, 16));
              const isSpacePattern = bytes.some(b => b === 0x20) && bytes.every(b => b === 0x00 || b === 0x20);
              if (isSpacePattern) spaceKeySeen = true;
              const byteLen = hexStr.length / 2;
              const isAllZero = bytes.every(b => b === 0x00);

              if (valueRaw.trim() === '') {
                if (isAllZero && !hasValue) char = '[END]';
                else if (isAllZero && byteLen > 1 && !hasValue) char = '[END]';
                else if (hasValue || isSpacePattern) char = ' ';
                else char = '';
              } else {
                char = valueRaw.replace(/^\\s+/, '');
              }
              if (char === '') return;
              const trimmedChar = char.trim();
              if (trimmedChar === '/') char = '/';
              else if (trimmedChar.startsWith('[') && trimmedChar.endsWith(']')) char = trimmedChar;
              else if (trimmedChar.length > 0 && trimmedChar !== ' ') char = char.replace(/\\s+$/, '');
              if (String(char).toUpperCase() === '[SPACE]') char = ' ';

              byteWidths.add(byteLen);
              if (byteLen > maxByteLength) maxByteLength = byteLen;
              if (byteLen === 1) singleByte[parseInt(hexStr, 16)] = char;
              else multiByte[hexStr] = char;
              entryCount++;
            });

            const allChars = [...Object.values(singleByte), ...Object.values(multiByte)];
            const spaceDefined = allChars.some(c => c === ' ' || (typeof c === 'string' && c.toUpperCase() === '[SPACE]')) || spaceKeySeen;

            return {
              type: 'tableParsed',
              parseId,
              fileName: fileName || 'custom.tbl',
              singleByte,
              multiByte,
              entryCount,
              hasMultiByte: Object.keys(multiByte).length > 0,
              maxByteLength,
              byteWidths: Array.from(byteWidths).sort((a, b) => a - b),
              spaceDefined
            };
          };

          self.onmessage = (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'parseTable') return;
            try {
              const { content, fileName } = payload || {};
              const parseId = Number(payload?.parseId) || 0;
              const parsed = parseTable(content, fileName, parseId);
              self.postMessage(parsed);
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Table parser worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

  core.createTableWorker = createTableWorker;
})(window);
