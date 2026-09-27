/* The build worker: it carries the text codecs and the rom builder into the
   worker as source. The four helpers are stringified from core.*, and the source
   the worker is handed is the same source as before. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

    const createBuildWorker = () => {
      const workerFunctions =
        'const escapeRegex = ' + core.escapeRegex.toString() + ';\n' +
        'const createTokenizer = ' + core.createTokenizer.toString() + ';\n' +
        'const smartTextParse = ' + core.smartTextParse.toString() + ';\n' +
        'const rebuildRom = ' + core.rebuildRom.toString() + ';\n';

      const workerCode = workerFunctions + `
          self.onmessage = async (e) => {
              const { type, payload } = e.data;
              try {
                  if (type === 'buildRom') {
                      const { originalRom, allTexts, tableData, system, usePaddingByte, pointerGroups, encodeOptions, requestId, silentLive } = payload;
                      const safeRequestId = Number(requestId) || 0;
                      const isSilentLive = silentLive === true;
                      self.postMessage({ type: 'progress', value: 5, requestId: safeRequestId, silentLive: isSilentLive });

                      const masterCharToHex = new Map(Object.entries(tableData.masterCharToHex).map(([k, v]) => [k, new Uint8Array(v)]));

                      const allTokens = [];
                      let hasMultiByte = false;
                      masterCharToHex.forEach((val) => { if (val && val.length > 1) hasMultiByte = true; });
                      const isMultiByteMode = hasMultiByte || usePaddingByte;

                      masterCharToHex.forEach((val, key) => {
                          const upper = key.toUpperCase();
                          const isLineToken = upper === '[LINE]' || upper === '[NEWLINE]';
                          const isBracketToken = key.startsWith('[') && key.endsWith(']');
                          if (key.length > 0 && (!isBracketToken || isMultiByteMode || isLineToken)) {
                              allTokens.push(key);
                          }
                      });
                      const tokenizer = createTokenizer(allTokens);
                      self.postMessage({ type: 'progress', value: 20, requestId: safeRequestId, silentLive: isSilentLive });

                      let buildResult = rebuildRom(
                          new Uint8Array(originalRom),
                          allTexts,
                          { masterCharToHex },
                          system,
                          tokenizer,
                          usePaddingByte,
                          pointerGroups,
                          encodeOptions
                      );
                      self.postMessage({ type: 'progress', value: 95, requestId: safeRequestId, silentLive: isSilentLive });
                      let buildLog = Array.isArray(buildResult && buildResult.relocationLog) ? buildResult.relocationLog : [];
                      /* The self check is the last word, and a build it refuses is redone with
                         relocation only: a shift that broke a record must never be the reason a
                         user gets no rom at all. */
                      const buildRefused = buildLog.some(function (line) { return String(line).indexOf('Self check failed') >= 0; });
                      if (buildRefused && system.allowMessageShift === true && system.forceRelocationOnly !== true) {
                        const retrySystem = Object.assign({}, system, { forceRelocationOnly: true });
                        const retry = rebuildRom(
                            new Uint8Array(originalRom),
                            allTexts,
                            { masterCharToHex },
                            retrySystem,
                            tokenizer,
                            usePaddingByte,
                            pointerGroups,
                            encodeOptions
                        );
                        const retryLog = Array.isArray(retry && retry.relocationLog) ? retry.relocationLog : [];
                        const retryRefused = retryLog.some(function (line) { return String(line).indexOf('Self check failed') >= 0; });
                        buildResult = retry;
                        /* Keep the evidence from the pass that was thrown away: the user is
                           entitled to see which shifts were undone and what the check said. */
                        const discarded = buildLog.filter(function (line) {
                          return /undone|Self check failed|Growth report|not possible|cannot grow|paid out|no padding/.test(String(line));
                        }).slice(0, 40);
                        buildLog = ['A shift broke a record, so this build was redone with every grown record moved to free space instead.']
                          .concat(discarded)
                          .concat(['--- the build that was kept ---'])
                          .concat(retryLog);
                        if (!retryRefused) buildLog.push('The relocation only build passed the self check.');
                      }
                      const newRomData = buildResult.modifiedRom;
                      const relocationLog = buildLog;

                      self.postMessage({
                        type: 'buildResult',
                        requestId: safeRequestId,
                        silentLive: isSilentLive,
                        modifiedRom: newRomData.buffer,
                        relocationLog
                      }, [newRomData.buffer]);

                  } else if (type === 'pointerReplay') {
                      const { originalRom, allTexts, tableData, system, usePaddingByte, pointerGroups, encodeOptions } = payload;
                      self.postMessage({ type: 'progress', value: 10 });
                      const masterCharToHex = new Map(Object.entries(tableData.masterCharToHex).map(([k, v]) => [k, new Uint8Array(v)]));
                      const allTokens = [];
                      let hasMultiByte = false;
                      masterCharToHex.forEach((val) => { if (val && val.length > 1) hasMultiByte = true; });
                      const isMultiByteMode = hasMultiByte || usePaddingByte;
                      masterCharToHex.forEach((val, key) => {
                          const upper = key.toUpperCase();
                          const isLineToken = upper === '[LINE]' || upper === '[NEWLINE]';
                          const isBracketToken = key.startsWith('[') && key.endsWith(']');
                          if (key.length > 0 && (!isBracketToken || isMultiByteMode || isLineToken)) allTokens.push(key);
                      });
                      const tokenizer = createTokenizer(allTokens);
                      const replay = rebuildRom(
                          new Uint8Array(originalRom),
                          allTexts,
                          { masterCharToHex },
                          system,
                          tokenizer,
                          usePaddingByte,
                          pointerGroups,
                          encodeOptions
                      );
                      self.postMessage({ type: 'progress', value: 90 });

                      let updatedPointers = 0;
                      for (const line of relocationLog) {
                        const m = String(line).match(/Updated\\s+(\\d+)\\s+pointer/);
                        if (m) updatedPointers += Number(m[1]) || 0;
                      }
                      self.postMessage({ type: 'pointerReplayResult', relocationLog, updatedPointers });
                  
                  } else if (type === 'generateIps') {
                      const { originalData, modifiedData } = payload;
                      const o = new Uint8Array(originalData);
                      const m = new Uint8Array(modifiedData);
                      let p = [80, 65, 84, 67, 72]; // "PATCH"
                      let i = 0;
                      const maxLen = Math.max(o.length, m.length);
                      
                      while (i < maxLen) {
                          if (i >= o.length || o[i] !== m[i]) {
                              let start = i;
                              let diff = [];
                              
                              // Check for RLE opportunity
                              let isRle = true;
                              const rleByte = m[i];
                              let rleCount = 0;
                              while (i < m.length && (i >= o.length || o[i] !== m[i]) && rleCount < 65535) {
                                if (m[i] !== rleByte) isRle = false;
                                rleCount++;
                                i++;
                              }
                              // Backtrack to start of diff
                              i = start;

                              if (isRle && rleCount > 5) {
                                  // Use RLE encoding
                                  p.push(start >> 16 & 255, start >> 8 & 255, start & 255); // Offset
                                  p.push(0, 0); // Size 0 indicates RLE
                                  p.push(rleCount >> 8 & 255, rleCount & 255); // RLE count
                                  p.push(rleByte); // The byte to repeat
                                  i += rleCount;
                              } else {
                                  // Use standard diff encoding
                                  while (i < m.length && (i >= o.length || o[i] !== m[i]) && diff.length < 65535) {
                                      diff.push(m[i++]);
                                  }
                                  p.push(start >> 16 & 255, start >> 8 & 255, start & 255); // Offset
                                  p.push(diff.length >> 8 & 255, diff.length & 255); // Size
                                  p.push(...diff); // Data
                              }
                          } else {
                              i++;
                          }
                          if (i > 0 && i % 65536 === 0) { self.postMessage({ type: 'progress', value: Math.round((i / maxLen) * 95) }); }
                      }
                      
                      // Handle ROM expansion (truncation record)
                      if (m.length > o.length) {
                         p.push(o.length >> 16 & 255, o.length >> 8 & 255, o.length & 255); // Offset
                         const expansion = m.slice(o.length);
                         p.push(expansion.length >> 8 & 255, expansion.length & 255); // Size
                         p.push(...expansion); // Data
                      }

                      p.push(69, 79, 70); // "EOF"
                      const patchData = new Uint8Array(p);
                      self.postMessage({ type: 'ipsResult', patchData: patchData.buffer }, [patchData.buffer]);
                  }
              } catch (error) {
                  self.postMessage({ type: 'error', message: error.message, stack: error.stack });
              }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

  core.createBuildWorker = createBuildWorker;
})(window);
