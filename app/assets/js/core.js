window.__PT_APP_READY__ = false;
    window.__PT_RUNTIME_ERROR_HANDLER__ = null;
    const showBootstrapError = (title, detail) => {
      if (window.__PT_APP_READY__ && typeof window.__PT_RUNTIME_ERROR_HANDLER__ === 'function') {
        try {
          window.__PT_RUNTIME_ERROR_HANDLER__(title, detail || '');
          return;
        } catch (_) { }
      }
      const loader = document.getElementById('loader');
      const root = document.getElementById('root');
      if (loader) loader.style.display = 'none';
      if (root) root.style.display = 'block';
      let box = document.getElementById('pt-bootstrap-error');
      if (!box) {
        box = document.createElement('div');
        box.id = 'pt-bootstrap-error';
        box.className = 'error-box';
        box.style.whiteSpace = 'pre-wrap';
        box.style.margin = '16px auto';
        box.style.maxWidth = '980px';
        document.body.appendChild(box);
      }
      box.textContent = `${title}\n${detail || ''}`;
    };
    window.addEventListener('error', (ev) => {
      const detail = ev?.error?.stack || ev?.message || 'Unknown bootstrap error.';
      showBootstrapError('Bootstrap Error', detail);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev?.reason;
      const detail = (reason && reason.stack) ? reason.stack : String(reason || 'Unknown unhandled rejection.');
      showBootstrapError('Unhandled Promise Rejection', detail);
    });
    if (!window.React || !window.ReactDOM) {
      showBootstrapError(
        'Bootstrap Error',
        'React runtime failed to load. Check internet/CDN access for unpkg.com or serve React locally.'
      );
      throw new Error('React runtime not available.');
    }
    const {
      useState,
      useRef,
      useCallback,
      useEffect,
      useLayoutEffect,
      useMemo,
      memo
    } = React;
    const { createRoot } = ReactDOM;
    const e = React.createElement;

    // --- START OF COMPONENT: TextItem ---
    const TextItem = memo(({
      text,
      onUpdate,
      onQueueUpdate,
      onLiveDraftChange,
      onAutoTranslate,
      isTranslating,
      getTranslatedByteLength,
      liveEditMode,
      onLocateHex,
      onLocatePointers,
      onSelect,
      isSelected
    }) => {
      const [localText, setLocalText] = useState(text.translatedText || '');
      const isEditingRef = useRef(false);
      const [lengthProbeText, setLengthProbeText] = useState(text.translatedText || '');
      const textareaRef = useRef(null);
      const cursorRef = useRef(null);

      useEffect(() => {
        if (!isEditingRef.current) {
          setLocalText(text.translatedText || '');
        }
      }, [text.translatedText, text.id]);

      useEffect(() => {
        const settleDelay = isEditingRef.current ? 560 : 120;
        const timer = setTimeout(() => setLengthProbeText(localText), settleDelay);
        return () => clearTimeout(timer);
      }, [localText]);

      const handleTextChange = (event) => {
        const nextValue = event.target.value;
        cursorRef.current = {
          start: Number(event.target.selectionStart),
          end: Number(event.target.selectionEnd),
          dir: event.target.selectionDirection || 'none'
        };
        setLocalText(nextValue);
        if (onLiveDraftChange) onLiveDraftChange(text.id, nextValue);
      };

      useLayoutEffect(() => {
        if (!isEditingRef.current) return;
        const el = textareaRef.current;
        const sel = cursorRef.current;
        if (!el || !sel) return;
        const maxLen = String(localText || '').length;
        const start = Math.max(0, Math.min(Number(sel.start), maxLen));
        const end = Math.max(start, Math.min(Number(sel.end), maxLen));
        try {
          el.setSelectionRange(start, end, sel.dir || 'none');
        } catch (_) { }
      }, [localText]);

      const handleBlur = () => {
        isEditingRef.current = false;
        setLengthProbeText(localText);
        if (onQueueUpdate) onQueueUpdate(text.id, localText, true);
        else if (localText !== (text.translatedText || '')) onUpdate(text.id, localText);
      };

      const handleAutoTranslateClick = async () => {
        const newText = await onAutoTranslate(text);
        if (newText) {
          setLocalText(newText);
          onUpdate(text.id, newText);
        }
      };

      const isReadOnlySource = text.buildable === false;
      const { byteLength, isTooLong } = useMemo(() => {
        const len = getTranslatedByteLength(lengthProbeText);
        const originalLen = text.byteLength;
        return { byteLength: len, isTooLong: len > originalLen };
      }, [lengthProbeText, text, getTranslatedByteLength]);

      return e('div', { className: `text-item text-type-${text.textType}${isSelected ? ' ptr-highlight' : ''}`, onClick: () => onSelect && onSelect(text.id) },
        e('div', { style: { color: '#888', fontSize: '9px', marginBottom: '4px', textTransform: 'capitalize' } },
          `ID: ${text.id} | Offset: ${text.offset} | Type: ${text.textType.replace('-', ' ')}${isReadOnlySource ? ' | Read-only compressed source' : ''}`
        ),
        e('div', { className: 'text-item-body' },
          e('div', { className: 'text-item-original' },
            e('div', { style: { color: '#8ccf8c', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.02em' } }, 'Original'),
            e('p', { style: { marginBottom: '0', whiteSpace: 'pre-wrap' } }, text.originalText)
          ),
          e('div', { className: 'text-item-translation' },
            e('div', { style: { color: '#8ccf8c', fontSize: '9px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.02em' } }, 'Enter Translation'),
            e('textarea', {
              ref: textareaRef,
              className: "textarea",
              'data-text-id': String(text.id),
              style: { minHeight: '72px', fontSize: '11px' },
              placeholder: isReadOnlySource ? "Compressed source (read-only)." : "Enter translation...",
              value: localText,
              disabled: isReadOnlySource,
              onChange: handleTextChange,
              onBlur: handleBlur,
              onFocus: () => { isEditingRef.current = true; if (onSelect) onSelect(text.id); },
              onClick: (ev) => ev.stopPropagation()
            })
          )
        ),
        e('div', { className: 'translation-controls' },
          e('div', { className: 'flex', style: { gap: '6px' } },
            e('button', { className: "btn btn-small btn-auto-translate", onClick: handleAutoTranslateClick, disabled: isTranslating || isReadOnlySource },
              isTranslating ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' Translating...') : 'Auto-Translate'
            ),
            e('button', { className: "btn btn-small", onClick: () => onLocateHex && onLocateHex(text), disabled: !onLocateHex }, 'Open Hex'),
            e('button', { className: "btn btn-small", onClick: () => onLocatePointers && onLocatePointers(text), disabled: !onLocatePointers || isReadOnlySource }, 'Find Pointer')
          ),
          localText && localText.length > 0 && e('div', { className: `translation-info ${isTooLong && !isReadOnlySource ? 'length-warning' : ''}` },
            isReadOnlySource
              ? 'Read-only compressed text. Translation write-back requires decompression script workflow.'
              : (isTooLong
                ? `Warning: Requires relocation (${byteLength}/${text.byteLength} bytes).`
                : `Length: ${byteLength}/${text.byteLength} bytes`)
          )
        )
      );
    });
    // --- END OF COMPONENT: TextItem ---

    // --- START OF UTILITY FUNCTIONS ---
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const createTokenizer = (allKnownTokens) => {
      if (!allKnownTokens || allKnownTokens.length === 0) return null;
      const sortedTokens = allKnownTokens.sort((a, b) => b.length - a.length);
      const regexString = sortedTokens.map(escapeRegex).join('|') + '|\\n|\\s|.';
      return new RegExp(regexString, 'g');
    };

    const smartTextParse = (text, tokenizer, masterCharToHexMap, usePaddingByte = false, encodeOptions = null) => {
      if (text === undefined || text === null || !masterCharToHexMap) return new Uint8Array([]);
      const sourceText = String(text);
      if (!sourceText.length) return new Uint8Array([]);
      const bytes = [];
      const paddingByte = 0x00;
      const compressionEnabled = encodeOptions ? (encodeOptions.enableDteMte !== false) : true;
      const compressionStrategy = String((encodeOptions && encodeOptions.strategy) || 'optimal').toLowerCase();
      const useOptimalEncoding = compressionEnabled && compressionStrategy !== 'legacy' && masterCharToHexMap && masterCharToHexMap.size > 0;

      let newlineToken = null;
      for (const k of masterCharToHexMap.keys()) {
        const upper = String(k || '').toUpperCase();
        if (upper === '[LINE]' || upper === '[NEWLINE]' || k === '/') {
          newlineToken = k;
          break;
        }
      }

      const appendTokenBytes = (lookupToken, tokenBytes) => {
        if (!tokenBytes || tokenBytes.length === 0) return;
        bytes.push(...tokenBytes);
        if (usePaddingByte && tokenBytes.length === 1) {
          const tokenStr = String(lookupToken || '');
          const upper = tokenStr.toUpperCase();
          const isBracketToken = tokenStr.startsWith('[') && tokenStr.endsWith(']');
          const isLineToken = upper === '[LINE]' || upper === '[NEWLINE]' || tokenStr === '/';
          const isNonLineBracketToken = isBracketToken && !isLineToken;
          if (upper !== '[END]' && upper !== '[NULL]' && !isNonLineBracketToken) {
            bytes.push(paddingByte);
          }
        }
      };

      const resolveTokenBytes = (token) => {
        if (!token || !masterCharToHexMap) return null;
        if (masterCharToHexMap.has(token)) {
          return { key: token, bytes: masterCharToHexMap.get(token) };
        }
        const upperToken = String(token).toUpperCase();
        if (masterCharToHexMap.has(upperToken)) {
          return { key: upperToken, bytes: masterCharToHexMap.get(upperToken) };
        }
        return null;
      };

      if (!compressionEnabled) {
        const tokens = tokenizer ? (sourceText.match(tokenizer) || []) : sourceText.split('');
        for (let i = 0; i < tokens.length; i++) {
          const token = String(tokens[i] ?? '');
          if (!token) continue;
          if (token === '\n') {
            const resolvedNl = newlineToken ? resolveTokenBytes(newlineToken) : null;
            if (resolvedNl && resolvedNl.bytes) appendTokenBytes(resolvedNl.key, resolvedNl.bytes);
            continue;
          }
          const isBracketToken = token.startsWith('[') && token.endsWith(']');
          if (isBracketToken) {
            const resolved = resolveTokenBytes(token);
            if (resolved && resolved.bytes) appendTokenBytes(resolved.key, resolved.bytes);
            continue;
          }
          for (const ch of token) {
            const lookupToken = ch === '\n' && newlineToken ? newlineToken : ch;
            const resolved = resolveTokenBytes(lookupToken) || resolveTokenBytes(ch);
            if (resolved && resolved.bytes) appendTokenBytes(resolved.key, resolved.bytes);
          }
        }
        return new Uint8Array(bytes);
      }

      if (!useOptimalEncoding) {
        if (!tokenizer) return new Uint8Array([]);
        const tokens = sourceText.match(tokenizer) || [];
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          let lookupToken = token;
          if (token === '\n' && newlineToken) lookupToken = newlineToken;
          const resolved = resolveTokenBytes(lookupToken) || resolveTokenBytes(token);
          if (resolved && resolved.bytes) appendTokenBytes(resolved.key, resolved.bytes);
        }
        return new Uint8Array(bytes);
      }

      const sourceUpper = sourceText.toUpperCase();
      const candidatesByFirst = new Map();
      const seenCandidateKeys = new Set();
      const pushCandidate = (tokenKey, tokenBytes) => {
        if (typeof tokenKey !== 'string' || tokenKey.length === 0 || !tokenBytes || tokenBytes.length === 0) return;
        const dedupeKey = tokenKey + '|' + tokenBytes.length + '|' + Array.from(tokenBytes).join(',');
        if (seenCandidateKeys.has(dedupeKey)) return;
        seenCandidateKeys.add(dedupeKey);
        const first = tokenKey[0];
        if (!first) return;
        const candidate = {
          token: tokenKey,
          tokenUpper: tokenKey.toUpperCase(),
          charLen: tokenKey.length,
          byteLen: tokenBytes.length,
          bytes: tokenBytes
        };
        const keys = [first, first.toUpperCase()];
        for (const key of keys) {
          if (!candidatesByFirst.has(key)) candidatesByFirst.set(key, []);
          candidatesByFirst.get(key).push(candidate);
        }
      };

      for (const [tokenKey, tokenBytes] of masterCharToHexMap.entries()) {
        if (typeof tokenKey !== 'string' || tokenKey.length === 0) continue;
        pushCandidate(tokenKey, tokenBytes);
      }
      for (const arr of candidatesByFirst.values()) {
        arr.sort((a, b) => {
          if (b.charLen !== a.charLen) return b.charLen - a.charLen;
          if (a.byteLen !== b.byteLen) return a.byteLen - b.byteLen;
          return a.token.localeCompare(b.token);
        });
      }

      const n = sourceText.length;
      const dpCost = new Array(n + 1).fill(Infinity);
      const dpChoice = new Array(n).fill(null);
      dpCost[n] = 0;

      for (let i = n - 1; i >= 0; i--) {
        let bestCost = Infinity;
        let bestChoice = null;
        if (Number.isFinite(dpCost[i + 1])) {
          bestCost = dpCost[i + 1] + 1024;
          bestChoice = { type: 'skip', step: 1 };
        }
        const ch = sourceText[i];

        if (ch === '\n' && newlineToken) {
          const resolvedNl = resolveTokenBytes(newlineToken);
          if (resolvedNl && resolvedNl.bytes) {
            const nlBytes = resolvedNl.bytes;
            let nlCost = nlBytes.length;
            if (usePaddingByte && nlBytes.length === 1) nlCost += 1;
            nlCost += dpCost[i + 1];
            if (nlCost < bestCost) {
              bestCost = nlCost;
              bestChoice = { type: 'token', step: 1, key: resolvedNl.key, bytes: nlBytes };
            }
          }
        }

        const buckets = [];
        const b1 = candidatesByFirst.get(ch);
        const b2 = candidatesByFirst.get(ch.toUpperCase());
        if (b1) buckets.push(b1);
        if (b2 && b2 !== b1) buckets.push(b2);

        for (const bucket of buckets) {
          for (const cand of bucket) {
            const end = i + cand.charLen;
            if (end > n) continue;
            const seg = sourceText.slice(i, end);
            if (seg !== cand.token && sourceUpper.slice(i, end) !== cand.tokenUpper) continue;
            let candidateCost = cand.byteLen;
            if (usePaddingByte && cand.byteLen === 1) {
              const tokenStr = String(cand.token || '');
              const upper = tokenStr.toUpperCase();
              const isBracketToken = tokenStr.startsWith('[') && tokenStr.endsWith(']');
              const isLineToken = upper === '[LINE]' || upper === '[NEWLINE]' || tokenStr === '/';
              const isNonLineBracketToken = isBracketToken && !isLineToken;
              if (upper !== '[END]' && upper !== '[NULL]' && !isNonLineBracketToken) candidateCost += 1;
            }
            candidateCost += dpCost[end];
            const shouldTake =
              candidateCost < bestCost ||
              (candidateCost === bestCost && bestChoice && bestChoice.type === 'token' && cand.charLen > (bestChoice.step || 0));
            if (shouldTake) {
              bestCost = candidateCost;
              bestChoice = { type: 'token', step: cand.charLen, key: cand.token, bytes: cand.bytes };
            }
          }
        }

        dpCost[i] = Number.isFinite(bestCost) ? bestCost : (Number.isFinite(dpCost[i + 1]) ? dpCost[i + 1] + 1024 : Infinity);
        dpChoice[i] = bestChoice || { type: 'skip', step: 1 };
      }

      let idx = 0;
      while (idx < n) {
        const choice = dpChoice[idx];
        if (!choice || choice.type === 'skip') {
          idx += 1;
          continue;
        }
        appendTokenBytes(choice.key, choice.bytes);
        idx += Math.max(1, choice.step || 1);
      }

      return new Uint8Array(bytes);
    };

    const getSmartByteLength = (text, tokenizer, masterCharToHexMap, usePaddingByte = false, encodeOptions = null) => {
      if (text === undefined || text === null || !masterCharToHexMap) return 0;
      return smartTextParse(text, tokenizer, masterCharToHexMap, usePaddingByte, encodeOptions).length;
    };

    const detectSystem = (fileName, data) => {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      let detectedSystemKey = "unknown";
      let detectionMethod = "file extension";

      const systems = {
        nes: { name: "NES", terminator: [0x00], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0x8000, extensions: ['nes'] },
        snes: { name: "SNES", terminator: [0x00], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0x8000, extensions: ['sfc', 'smc', 'fig', 'snes'] },
        gb: { name: "Game Boy", terminator: [0x50], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0x4000, extensions: ['gb'] },
        gbc: { name: "GBC", terminator: [0x50], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0x4000, extensions: ['gbc'] },
        gba: { name: "GBA", terminator: [0xFF], pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x08000000, extensions: ['gba'] },
        nds: { name: "NDS", terminator: [0x00, 0xFF, 0xFE], pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x02000000, extensions: ['nds', 'srl'] },
        "3ds": { name: "Nintendo 3DS", terminator: [0x00], pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x00100000, extensions: ['3ds', 'cci', 'cxi', 'cia'] },
        psp: { name: "PlayStation Portable", terminator: [0x00], pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x08800000, extensions: ['iso', 'cso', 'pbp', 'elf'] },
        genesis: { name: "Sega Genesis/MD", terminator: [0x00], pointerSize: 4, pointerEndianness: 'big', pointerBase: 0x000000, extensions: ['gen', 'md', 'smd'] },
        pce: { name: "PC-Engine/TG-16", terminator: [0x00], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0x2000, extensions: ['pce'] },
        n64: { name: "Nintendo 64", terminator: [0x00], pointerSize: 4, pointerEndianness: 'big', pointerBase: 0x80000000, extensions: ['n64', 'z64', 'v64'] },
        ps1: { name: "PlayStation 1", terminator: [0x00], pointerSize: 4, pointerEndianness: 'little', pointerBase: 0x80010000, extensions: ['bin', 'iso', 'img', 'psx'] },
        unknown: { name: "Unknown", terminator: [0x00], pointerSize: 2, pointerEndianness: 'little', pointerBase: 0, extensions: [] }
      };

      const bytesToString = (arr) => { try { return String.fromCharCode(...Array.from(arr)); } catch (e) { return ''; } };
      const checkHeader = (offset, str) => data.length > offset + str.length && bytesToString(data.slice(offset, offset + str.length)) === str;

      if (data && data.length > 0x1000) {
        const headerChecks = new Map([
          [() => checkHeader(0, 'NES\x1A'), "nes"],
          [() => data.length > 0x104 && checkHeader(0x104, 'NINTENDO'), "gba"],
          [() => data.length > 0xC0 && (checkHeader(0xC0, 'ARM9') || checkHeader(0xC0, 'ARM7')), "nds"],
          [() => checkHeader(0x100, 'NCSD') || checkHeader(0x100, 'NCCH'), "3ds"],
          [() => checkHeader(0x8001, 'CD001') && checkHeader(0x8008, 'PSP GAME'), "psp"],
          [() => data.length > 0x7FD0 && (data[0x7FFD] === 0x05 || data[0x81FD] === 0x05 || data[0x4081FD] === 0x05), "snes"],
          [() => checkHeader(0x100, 'SEGA'), "genesis"],
          [() => checkHeader(0x01, 'CD001') || checkHeader(0x8001, 'PS-X EXE'), "ps1"],
          [() => data[0] === 0x80 && data[1] === 0x37 && data[2] === 0x12 && data[3] === 0x40, "n64"],
          [() => data[0] === 0x37 && data[1] === 0x80 && data[2] === 0x40 && data[3] === 0x12, "n64"],
          [() => data[0] === 0x40 && data[1] === 0x12 && data[2] === 0x37 && data[3] === 0x80, "n64"]
        ]);

        for (const [check, systemKey] of headerChecks) {
          if (check()) {
            detectedSystemKey = systemKey;
            detectionMethod = "header analysis";
            break;
          }
        }
      }

      if (detectedSystemKey === "unknown") {
        for (const key in systems) {
          if (systems[key].extensions.includes(ext)) {
            detectedSystemKey = key;
            detectionMethod = "file extension";
            break;
          }
        }
      }
      return { system: systems[detectedSystemKey] || systems.unknown, method: detectionMethod };
    };

    const rebuildRom = (originalRom, allTexts, tableData, system, tokenizer, usePaddingByte = false, pointerGroups = [], encodeOptions = null) => {
      let romCopy = new Uint8Array(originalRom);
      const { masterCharToHex } = tableData;
      if (!masterCharToHex) throw new Error("Character map is not ready.");

      const terminatorBytes = masterCharToHex.get('[END]') ?? masterCharToHex.get('[NULL]') ?? new Uint8Array([0x00]);
      const terminatorHex = terminatorBytes.length > 0 ? terminatorBytes[0] : 0x00;
      const isBracketToken = (token) => (
        typeof token === 'string' &&
        token.length >= 2 &&
        token.startsWith('[') &&
        token.endsWith(']')
      );
      const multiBytePrintableEntries = Array.from(masterCharToHex.entries())
        .filter(([char, bytes]) => {
          if (!bytes || bytes.length <= 1) return false;
          if (isBracketToken(char)) return false;
          if (char === '\n' || char === '\r' || char === '/') return false;
          return typeof char === 'string' && char.length > 0;
        });
      const hasMultiByteTextEncoding = multiBytePrintableEntries.length >= 12;
      const systemPipelineMap = {
        "NES": "pipeline_nes",
        "SNES": "pipeline_snes",
        "Game Boy": "pipeline_gb",
        "GBC": "pipeline_gbc",
        "GBA": "pipeline_gba",
        "NDS": "pipeline_nds",
        "Nintendo 3DS": "pipeline_3ds",
        "Nintendo 64": "pipeline_n64",
        "Sega Genesis/MD": "pipeline_genesis",
        "PlayStation Portable": "pipeline_psp",
        "PlayStation 1": "pipeline_ps1"
      };
      const systemPipeline = systemPipelineMap[system.name] || "pipeline_generic";
      const pointerProfile = (() => {
        if (system.name === "NES") return "profile_nes";
        if (system.name === "SNES") return "profile_snes";
        if (system.name === "Game Boy") return "profile_gb";
        if (system.name === "GBC") return "profile_gbc";
        if (system.name === "NDS") return "profile_nds";
        if (system.name === "Nintendo 3DS") return "profile_3ds";
        if (system.name === "Nintendo 64") return "profile_n64";
        if (system.name === "Sega Genesis/MD") return "profile_genesis";
        if (system.name === "PlayStation Portable") return "profile_psp";
        if (system.name === "PlayStation 1") return "profile_ps1";
        if (system.name === "GBA" && !usePaddingByte && !hasMultiByteTextEncoding) return "profile_gba_nonpadding";
        if (system.name === "GBA" && usePaddingByte && !hasMultiByteTextEncoding) return "profile_gba_dwe_singlebyte";
        return "profile_default";
      })();
      const isGbaNonPaddingProfile = pointerProfile === "profile_gba_nonpadding";
      const isGbaDweSingleByteProfile = pointerProfile === "profile_gba_dwe_singlebyte";
      const isNesProfile = pointerProfile === "profile_nes";
      const isSnesProfile = pointerProfile === "profile_snes";
      const isGbLikeProfile = pointerProfile === "profile_gb" || pointerProfile === "profile_gbc";
      const isStrictGbaPointerValidation = (system.name === "GBA") && (isGbaNonPaddingProfile || usePaddingByte);
      const isAbsoluteLikeGbaTransform = (transformId) => (
        transformId === 'gba' ||
        transformId === 'gba_offset' ||
        transformId === 'gba_mirror1' ||
        transformId === 'gba_mirror2' ||
        transformId === 'raw' ||
        transformId === 'base+'
      );
      let relocationLog = [];
      const compressionModeLabel = (encodeOptions && encodeOptions.enableDteMte === false)
        ? 'OFF'
        : String((encodeOptions && encodeOptions.strategy) || 'optimal').toUpperCase();
      relocationLog.push(`Pointer profile: ${pointerProfile}. DWE padding: ${usePaddingByte ? 'ON' : 'OFF'}.`);
      relocationLog.push(`System pipeline: ${systemPipeline}.`);
      relocationLog.push(`Table heuristic: multi-byte printable entries ${multiBytePrintableEntries.length}.`);
      relocationLog.push(`DTE/MTE encoding: ${compressionModeLabel}.`);
      if (isStrictGbaPointerValidation) {
        relocationLog.push(`Pointer validation: strict.`);
      }
      const textMap = new Map(allTexts.map(t => [t.id, t]));
      const parseNumericLoose = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
        if (typeof value !== 'string') return NaN;
        const v = value.trim();
        if (!v) return NaN;
        if (/^0x/i.test(v)) {
          const n = parseInt(v, 16);
          return Number.isFinite(n) ? n : NaN;
        }
        const n = Number(v);
        return Number.isFinite(n) ? Math.floor(n) : NaN;
      };
      const pointerHintEntries = [];
      if (Array.isArray(pointerGroups) && pointerGroups.length > 0) {
        for (const group of pointerGroups) {
          const groupTarget = parseNumericLoose(group?.targetOffset);
          if (!Array.isArray(group?.pointers)) continue;
          for (const p of group.pointers) {
            const ptrOffset = parseNumericLoose(p?.ptrOffset);
            const targetOffset = parseNumericLoose(p?.targetOffset);
            if (!Number.isFinite(ptrOffset) || ptrOffset < 0 || ptrOffset >= romCopy.length) continue;
            const resolvedTarget = Number.isFinite(targetOffset) ? targetOffset : groupTarget;
            if (!Number.isFinite(resolvedTarget) || resolvedTarget < 0) continue;
            const hintedSize = parseNumericLoose(p?.ptrSize);
            pointerHintEntries.push({
              ptrOffset,
              targetOffset: resolvedTarget,
              ptrSize: Number.isFinite(hintedSize) && hintedSize >= 2 && hintedSize <= 4 ? hintedSize : system.pointerSize,
              transformId: typeof p?.transformId === 'string' && p.transformId ? p.transformId : (
                typeof p?.type === 'string' && p.type ? p.type : (system.name === "GBA" ? 'gba' : 'raw')
              )
            });
          }
        }
      }
      const originalEncodedByStart = new Map();

      for (const t of allTexts) {
        const source = textMap.get(t.id) || t;
        if (typeof source.startByte !== 'number') continue;
        const encoded = smartTextParse(source.originalText, tokenizer, masterCharToHex, usePaddingByte, encodeOptions);
        if (encoded && encoded.length > 0) {
          originalEncodedByStart.set(source.startByte, encoded);
        }
      }

      const MAX_VERIFY_LEN = 64;
      const matchesEncodedAt = (romData, offset, encoded) => {
        if (!encoded || encoded.length === 0) return true;
        if (offset < 0 || offset >= romData.length) return false;
        const verifyLen = Math.min(encoded.length, MAX_VERIFY_LEN, romData.length - offset);
        if (verifyLen <= 0) return false;
        for (let i = 0; i < verifyLen; i++) {
          if (romData[offset + i] !== encoded[i]) return false;
        }
        return true;
      };

      const detectPointerTableSegments = (romData) => {
        const ptrSize = system.pointerSize;
        if (!ptrSize) return [];
        const isLittle = system.pointerEndianness === 'little';
        const minPointers = ptrSize === 4 ? 6 : 10;
        const windowSize = ptrSize === 4 ? 64 : 96;
        const threshold = ptrSize === 4 ? 0.6 : 0.65;
        const view = new DataView(romData.buffer);
        const totalPtrs = Math.floor(romData.length / ptrSize);
        if (totalPtrs < windowSize) return [];

        const buildSegments = (useRawBase) => {
          const base = useRawBase ? 0 : (system.pointerBase || 0);
          const isPtr = new Uint8Array(totalPtrs);
          for (let i = 0; i < totalPtrs; i++) {
            const offset = i * ptrSize;
            const value = ptrSize === 2 ? view.getUint16(offset, isLittle) : view.getUint32(offset, isLittle);
            let ok = false;
            if (base > 0) {
              ok = value >= base && (value - base) < romData.length;
            } else {
              ok = value < romData.length;
            }
            if (ok) isPtr[i] = 1;
          }

          const hot = new Uint8Array(totalPtrs);
          let sum = 0;
          for (let i = 0; i < windowSize; i++) sum += isPtr[i];
          for (let i = 0; i <= totalPtrs - windowSize; i++) {
            const ratio = sum / windowSize;
            if (ratio >= threshold) {
              for (let j = i; j < i + windowSize; j++) hot[j] = 1;
            }
            if (i + windowSize < totalPtrs) {
              sum += isPtr[i + windowSize] - isPtr[i];
            }
          }

          const segments = [];
          let start = -1;
          for (let i = 0; i < totalPtrs; i++) {
            if (hot[i]) {
              if (start === -1) start = i;
            } else if (start !== -1) {
              const end = i - 1;
              if (end - start + 1 >= minPointers) {
                segments.push({ start: start * ptrSize, end: (end * ptrSize) + (ptrSize - 1), base });
              }
              start = -1;
            }
          }
          if (start !== -1) {
            const end = totalPtrs - 1;
            if (end - start + 1 >= minPointers) {
              segments.push({ start: start * ptrSize, end: (end * ptrSize) + (ptrSize - 1), base });
            }
          }
          return segments;
        };

        let segments = buildSegments(false);
        if (segments.length === 0 && system.pointerBase > 0) {
          segments = buildSegments(true);
        }
        segments.sort((a, b) => (b.end - b.start) - (a.end - a.start));
        return segments;
      };
      const pointerRegions = detectPointerTableSegments(romCopy);
      const pointerRegionBases = pointerRegions.slice(0, 4).map(r => r.start);
      const computeCoverage = (pointers, targetCount) => {
        if (!pointers || pointers.length === 0) return 0;
        const distinctTargets = new Set(pointers.map(p => p.targetOffset)).size;
        return Math.min(1, distinctTargets / Math.max(1, targetCount));
      };
      const findPointersWithSizes = (targetOffsets, options) => {
        const sizeList = [system.pointerSize];
        if (system.name === "GBA" && system.pointerSize === 4) {
          sizeList.push(3);
          if (options?.allowShortRelative !== false) sizeList.push(2);
        }
        let best = [];
        let bestCoverage = 0;
        for (const size of sizeList) {
          const isShortRelative = system.name === "GBA" && size === 2;
          const useRegions = (!isShortRelative && size === system.pointerSize) ? options.pointerRegions : null;
          const res = findPointersHeuristically(romCopy, targetOffsets, {
            ...options,
            pointerRegions: useRegions,
            pointerSizeOverride: size,
            includeRelative: isShortRelative ? true : options.includeRelative,
            relativeOnly: isShortRelative
          });
          let filtered = selectBestPointerCandidates(res);
          let coverage = computeCoverage(filtered, targetOffsets.length);
          // Threshold lowered to 0.05 (5%) to catch scattered pointers in menu-heavy games like Castlevania
          if (coverage < 0.05 && useRegions) {
            const resFull = findPointersHeuristically(romCopy, targetOffsets, {
              ...options,
              pointerRegions: null,
              pointerSizeOverride: size,
              includeRelative: isShortRelative ? true : options.includeRelative,
              relativeOnly: isShortRelative
            });
            const filteredFull = selectBestPointerCandidates(resFull);
            const coverageFull = computeCoverage(filteredFull, targetOffsets.length);
            if (coverageFull > coverage) {
              filtered = filteredFull;
              coverage = coverageFull;
            }
          }
          if (coverage > bestCoverage || (coverage === bestCoverage && filtered.length > best.length)) {
            best = filtered;
            bestCoverage = coverage;
          }
        }
        return { pointers: best, coverage: bestCoverage };
      };

      const selectBestPointerCandidates = (pointers) => {
        if (!pointers || pointers.length === 0) return [];
        const build = (relaxValidation) => {
          const bestByOffset = new Map();
          for (const ptr of pointers) {
            const expected = originalEncodedByStart.get(ptr.targetOffset);
            if (!relaxValidation && expected && !matchesEncodedAt(originalRom, ptr.targetOffset, expected)) continue;
            const expectedLen = expected ? expected.length : 0;
            const existing = bestByOffset.get(ptr.ptrOffset);
            if (!existing || expectedLen > existing.expectedLen) {
              bestByOffset.set(ptr.ptrOffset, {
                ...ptr,
                expectedLen,
                confidence: Number.isFinite(ptr.confidence) ? ptr.confidence : 0.5,
                validationReason: ptr.validationReason || 'candidate'
              });
            }
          }
          return Array.from(bestByOffset.values()).map(({ expectedLen, ...rest }) => rest);
        };
        let selected = build(false);
        if (selected.length === 0 && pointers.length > 0) {
          selected = build(true);
        }
        return selected;
      };

      const selectBestPointerRun = (matches, targetCount, ptrSize) => {
        if (!matches || matches.length === 0) return [];
        const sorted = matches.slice().sort((a, b) => a.ptrOffset - b.ptrOffset);
        const deltaCounts = new Map();
        for (let i = 1; i < sorted.length; i++) {
          const delta = sorted[i].ptrOffset - sorted[i - 1].ptrOffset;
          if (delta > 0 && delta <= ptrSize * 32) {
            deltaCounts.set(delta, (deltaCounts.get(delta) || 0) + 1);
          }
        }
        const intervalCandidates = Array.from(deltaCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([delta]) => delta);
        if (!intervalCandidates.includes(ptrSize)) intervalCandidates.unshift(ptrSize);

        let best = { score: -1, run: [] };
        for (const interval of intervalCandidates) {
          let run = [sorted[0]];
          const evalRun = (entries) => {
            if (entries.length === 0) return;
            const distinctTargets = new Set(entries.map(e => e.targetOffset)).size;
            const coverage = distinctTargets / Math.max(1, targetCount);
            const distinctPtrs = new Set(entries.map(e => e.ptrOffset)).size;
            const score = coverage * 1000 + distinctPtrs;
            if (score > best.score) best = { score, run: entries.slice() };
          };
          for (let i = 1; i < sorted.length; i++) {
            const delta = sorted[i].ptrOffset - sorted[i - 1].ptrOffset;
            if (delta === interval) {
              run.push(sorted[i]);
            } else {
              evalRun(run);
              run = [sorted[i]];
            }
          }
          evalRun(run);
        }
        return best.run || [];
      };

      const filterByPointerRunsWithStep = (pointers, minRun, maxCount, stepSize) => {
        if (!pointers || pointers.length === 0) return [];
        const offsets = new Set(pointers.map(p => p.ptrOffset));
        const runLengthByOffset = new Map();
        const sortedOffsets = Array.from(offsets).sort((a, b) => a - b);
        const step = stepSize || system.pointerSize;
        let i = 0;
        while (i < sortedOffsets.length) {
          const start = sortedOffsets[i];
          let runLen = 1;
          while (i + runLen < sortedOffsets.length && sortedOffsets[i + runLen] === start + runLen * step) {
            runLen++;
          }
          for (let j = 0; j < runLen; j++) {
            runLengthByOffset.set(start + j * step, runLen);
          }
          i += runLen;
        }
        let filtered = pointers.map(p => ({ ...p, runLength: runLengthByOffset.get(p.ptrOffset) || 1 }));
        const strong = filtered.filter(p => p.runLength >= minRun);
        if (strong.length > 0) filtered = strong;
        filtered.sort((a, b) => b.runLength - a.runLength);
        if (maxCount && filtered.length > maxCount) filtered = filtered.slice(0, maxCount);
        return filtered.map(({ runLength, ...rest }) => rest);
      };

      const mergePointerLists = (primary, secondary) => {
        const map = new Map();
        for (const ptr of primary || []) map.set(ptr.ptrOffset, ptr);
        for (const ptr of secondary || []) {
          const existing = map.get(ptr.ptrOffset);
          if (!existing) {
            map.set(ptr.ptrOffset, ptr);
            continue;
          }
          const existingConfidence = Number.isFinite(existing.confidence) ? existing.confidence : 0.5;
          const nextConfidence = Number.isFinite(ptr.confidence) ? ptr.confidence : 0.5;
          if (nextConfidence > existingConfidence) {
            map.set(ptr.ptrOffset, ptr);
          }
        }
        return Array.from(map.values());
      };

      const addPointerMeta = (pointers, confidence, reason) => {
        return (pointers || []).map(ptr => ({
          ...ptr,
          confidence: Number.isFinite(ptr.confidence) ? ptr.confidence : confidence,
          validationReason: ptr.validationReason || reason
        }));
      };

      const getHintPointersForTargets = (targetOffsets) => {
        if (!Array.isArray(pointerHintEntries) || pointerHintEntries.length === 0) return [];
        const targetSet = new Set((targetOffsets || []).filter(v => Number.isFinite(v)));
        if (targetSet.size === 0) return [];
        const out = [];
        const seen = new Set();
        for (const hint of pointerHintEntries) {
          if (!targetSet.has(hint.targetOffset)) continue;
          const key = `${hint.ptrOffset}:${hint.targetOffset}:${hint.ptrSize}:${hint.transformId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ...hint });
          if (out.length >= 4096) break;
        }
        return out;
      };

      const findRaw24Pointers = (romData, targetOffsets, maxTotal = 8192) => {
        const valueToTargets = new Map();
        for (const target of targetOffsets) {
          if (!Number.isFinite(target) || target < 0) continue;
          const value = target & 0xFFFFFF;
          if (!valueToTargets.has(value)) valueToTargets.set(value, []);
          valueToTargets.get(value).push(target);
        }
        const matches = [];
        const limit = romData.length - 3;
        for (let i = 0; i <= limit; i++) {
          const value = romData[i] | (romData[i + 1] << 8) | (romData[i + 2] << 16);
          const targets = valueToTargets.get(value);
          if (targets && targets.length > 0) {
            for (const targetOffset of targets) {
              matches.push({ ptrOffset: i, targetOffset, transformId: 'raw', base: 0, value, ptrSize: 3 });
              if (matches.length >= maxTotal) return matches;
            }
          }
        }
        return matches;
      };

      const findLow16Pointers = (romData, targetOffsets, allowUnaligned = false, maxTotal = 8192) => {
        const valueToTargets = new Map();
        for (const target of targetOffsets) {
          if (!Number.isFinite(target) || target < 0) continue;
          const value = target & 0xFFFF;
          const base = target & 0xFF0000;
          if (!valueToTargets.has(value)) valueToTargets.set(value, []);
          valueToTargets.get(value).push({ targetOffset: target, base });
        }
        const matches = [];
        const limit = romData.length - 2;
        const step = allowUnaligned ? 1 : 2;
        for (let i = 0; i <= limit; i += step) {
          const value = romData[i] | (romData[i + 1] << 8);
          const targets = valueToTargets.get(value);
          if (targets && targets.length > 0) {
            for (const t of targets) {
              matches.push({ ptrOffset: i, targetOffset: t.targetOffset, transformId: 'low16', base: t.base, value, ptrSize: 2 });
              if (matches.length >= maxTotal) return matches;
            }
          }
        }
        return matches;
      };

      const findSignedRelative16Pointers = (romData, targetOffsets, baseCandidates, allowUnaligned = false, maxTotal = 8192) => {
        const valueToTargets = new Map();
        for (const target of targetOffsets) {
          if (!Number.isFinite(target) || target < 0) continue;
          for (const base of baseCandidates || []) {
            if (!Number.isFinite(base)) continue;
            const delta = target - base;
            if (delta < -0x8000 || delta > 0x7FFF) continue;
            const value = delta & 0xFFFF;
            if (!valueToTargets.has(value)) valueToTargets.set(value, []);
            valueToTargets.get(value).push({ targetOffset: target, base });
          }
        }
        const matches = [];
        const limit = romData.length - 2;
        const step = allowUnaligned ? 1 : 2;
        for (let i = 0; i <= limit; i += step) {
          const value = romData[i] | (romData[i + 1] << 8);
          const targets = valueToTargets.get(value);
          if (!targets || targets.length === 0) continue;
          for (const t of targets) {
            matches.push({
              ptrOffset: i,
              targetOffset: t.targetOffset,
              transformId: 'relative_signed16',
              base: t.base,
              value,
              ptrSize: 2
            });
            if (matches.length >= maxTotal) return matches;
          }
        }
        return matches;
      };

      const findExactGbaAbsolutePointers = (romData, targetOffsets, maxTotal = 8192) => {
        const valueToTarget = new Map();
        for (const targetOffset of targetOffsets) {
          if (!Number.isFinite(targetOffset) || targetOffset < 0) continue;
          valueToTarget.set((targetOffset | 0x08000000) >>> 0, { targetOffset, transformId: 'gba' });
          valueToTarget.set(targetOffset >>> 0, { targetOffset, transformId: 'gba_offset' });
        }
        const matches = [];
        const view = new DataView(romData.buffer);
        for (let i = 0; i <= romData.length - 4; i += 4) {
          const value = view.getUint32(i, true);
          const hit = valueToTarget.get(value >>> 0);
          if (hit) {
            matches.push({
              ptrOffset: i,
              targetOffset: hit.targetOffset,
              transformId: hit.transformId,
              base: 0,
              value,
              ptrSize: 4
            });
            if (matches.length >= maxTotal) break;
          }
        }
        return matches;
      };

      const findPointersHeuristically = (romData, targetOffsets, options = {}) => {
        const { baseCandidates = [], includeRelative = false, allowUnaligned = false, pointerRegions = null, pointerSizeOverride = null, relativeOnly = false } = options;
        const ptrSize = pointerSizeOverride || system.pointerSize;
        const isLittle = system.pointerEndianness === 'little';
        const searchEnd = romData.length - ptrSize;
        const view = new DataView(romData.buffer);
        const maxPointerValue = ptrSize === 2 ? 0xFFFF : (ptrSize === 3 ? 0xFFFFFF : 0xFFFFFFFF);
        const minRelativeValue = relativeOnly ? 0 : (ptrSize === 2 ? 0x20 : 0x100);

        const transforms = [];
        if (!relativeOnly) {
          if (system.name === "NES") {
            transforms.push({ id: 'raw', base: 0 });
            transforms.push({ id: 'nes_prg', base: 0x10 });
          } else if (system.name === "SNES") {
            transforms.push({ id: 'raw', base: 0 });
            transforms.push({ id: 'snes_lorom', base: 0 });
            transforms.push({ id: 'snes_hirom', base: 0 });
            transforms.push({ id: 'snes_bank', base: 0 });
          } else if (system.name === "GBA") {
            transforms.push({ id: 'raw', base: 0 });
            if (system.pointerBase > 0) {
              transforms.push({ id: 'base+', base: system.pointerBase });
              transforms.push({ id: 'base-', base: system.pointerBase });
            }
            if (ptrSize !== 3) {
              transforms.push({ id: 'gba', base: 0 });
              // Add support for GBA mirrors (Wait State 1 & 2) common in some games
              transforms.push({ id: 'gba_mirror1', base: 0 });
              transforms.push({ id: 'gba_mirror2', base: 0 });
            }
          } else if (system.name === "Game Boy" || system.name === "GB" || system.name === "GBC") {
            transforms.push({ id: 'raw', base: 0 });
            transforms.push({ id: 'gb_base+', base: 0x4000 });
            transforms.push({ id: 'gb_base-', base: 0x4000 });
            transforms.push({ id: 'gb_bank', base: 0 });
          } else {
            transforms.push({ id: 'raw', base: 0 });
            if (system.pointerBase > 0) {
              transforms.push({ id: 'base+', base: system.pointerBase });
              transforms.push({ id: 'base-', base: system.pointerBase });
            }
          }
        }
        if (includeRelative || relativeOnly) {
          for (const base of baseCandidates) {
            if (Number.isFinite(base) && base >= 0) {
              transforms.push({ id: 'relative', base });
              if (system.name === "GBA") {
                transforms.push({ id: 'rel_shift1', base });
                transforms.push({ id: 'rel_shift2', base });
              }
            }
          }
        }

        const valueToTargets = new Map();
        const addTargetValue = (value, targetOffset, transformId, base) => {
          if (value < 0 || value > maxPointerValue) return;
          if (!valueToTargets.has(value)) valueToTargets.set(value, []);
          valueToTargets.get(value).push({ targetOffset, transformId, base });
        };

        for (const targetOffset of targetOffsets) {
          for (const transform of transforms) {
            const value = applyPointerTransform(transform.id, targetOffset, transform.base);
            if (!Number.isFinite(value)) continue;
            if (transform.id === 'relative' || transform.id === 'rel_shift1' || transform.id === 'rel_shift2') {
              if (value < minRelativeValue) continue;
            }
            if (value < 0 || value > maxPointerValue) continue;
            addTargetValue(value, targetOffset, transform.id, transform.base);
          }
        }

        const readValue = (offset) => {
          if (ptrSize === 2) return view.getUint16(offset, isLittle);
          if (ptrSize === 4) return view.getUint32(offset, isLittle);
          if (isLittle) return romData[offset] | (romData[offset + 1] << 8) | (romData[offset + 2] << 16);
          return (romData[offset] << 16) | (romData[offset + 1] << 8) | romData[offset + 2];
        };

        const step = allowUnaligned ? 1 : ptrSize;
        const scanRegion = (start, end, matchesOut, valueHitOut) => {
          const regionStart = Math.max(0, start);
          const regionEnd = Math.min(searchEnd, end);
          for (let i = regionStart; i <= regionEnd; i += step) {
            if (!allowUnaligned && i % ptrSize !== 0) continue;
            try {
              const value = readValue(i);
              const targets = valueToTargets.get(value);
              if (targets && targets.length > 0) {
                valueHitOut.set(value, (valueHitOut.get(value) || 0) + 1);
                for (const target of targets) {
                  matchesOut.push({ ptrOffset: i, targetOffset: target.targetOffset, transformId: target.transformId, base: target.base || 0, value, ptrSize });
                }
              }
            } catch (e) { }
          }
        };

        let matches = [];
        let valueHitCount = new Map();
        if (pointerRegions && pointerRegions.length > 0) {
          for (const region of pointerRegions) {
            scanRegion(region.start, region.end, matches, valueHitCount);
          }
          if (matches.length < 2) {
            matches = [];
            valueHitCount = new Map();
            scanRegion(0, searchEnd, matches, valueHitCount);
          }
        } else {
          scanRegion(0, searchEnd, matches, valueHitCount);
        }

        const maxValueHits = Math.max(64, Math.floor(romData.length / 16384));
        const filtered = matches.filter(m => (valueHitCount.get(m.value) || 0) <= maxValueHits);
        return selectBestPointerRun(filtered, targetOffsets.length, ptrSize);
      };

      const applyPointerTransform = (transformId, offset, base = 0) => {
        switch (transformId) {
          case 'raw': return offset;
          case 'base+': return offset + system.pointerBase;
          case 'base-': return offset - system.pointerBase;
          case 'relative': return offset - base;
          case 'relative_signed16': {
            const delta = offset - base;
            if (delta < -0x8000 || delta > 0x7FFF) return NaN;
            return delta & 0xFFFF;
          }
          case 'low16': {
            if (((offset & 0xFF0000) !== (base & 0xFF0000))) return NaN;
            return offset & 0xFFFF;
          }
          case 'shift1': {
            if ((offset & 0x1) !== 0) return NaN;
            return offset >> 1;
          }
          case 'shift2': {
            if ((offset & 0x3) !== 0) return NaN;
            return offset >> 2;
          }
          case 'rel_shift1': {
            const delta = offset - base;
            if (delta < 0 || (delta & 0x1) !== 0) return NaN;
            return delta >> 1;
          }
          case 'rel_shift2': {
            const delta = offset - base;
            if (delta < 0 || (delta & 0x3) !== 0) return NaN;
            return delta >> 2;
          }
          case 'snes_lorom': return 0x8000 + (offset & 0x7FFF) + ((offset & 0x7F8000) << 1);
          case 'snes_hirom': return offset + 0xC00000;
          case 'snes_bank': return (offset & 0xFFFF) | 0x800000;
          case 'nes_base+': return offset + 0x8000;
          case 'nes_base-': return offset - 0x8000;
          case 'nes_header': return offset + 0x10;
          case 'nes_prg': return offset + 0x7FF0;
          case 'gba': return offset | 0x08000000;
          case 'gba_offset': return offset; // Return raw offset (0x00xxxxxx)
          case 'gba_mirror1': return offset | 0x09000000;
          case 'gba_mirror2': return offset | 0x0A000000;
          case 'gb_base+': return offset + 0x4000;
          case 'gb_base-': return offset - 0x4000;
          case 'gb_bank': return (offset & 0x3FFF) | 0x4000;
          case 'low16_variable':
            if (isGbaNonPaddingProfile) return NaN;
            return (offset - base) & 0xFFFF;
          case 'gba_variable':
            if (isGbaNonPaddingProfile) return NaN;
            return (offset - base);
          default: return offset;
        }
      };

      const readPointerValueAt = (romData, ptrOffset, ptrSize) => {
        if (!Number.isFinite(ptrOffset) || !Number.isFinite(ptrSize)) return NaN;
        if (ptrOffset < 0 || ptrOffset + ptrSize > romData.length) return NaN;
        if (ptrSize === 2) {
          return system.pointerEndianness === 'little'
            ? (romData[ptrOffset] | (romData[ptrOffset + 1] << 8))
            : ((romData[ptrOffset] << 8) | romData[ptrOffset + 1]);
        }
        if (ptrSize === 3) {
          return system.pointerEndianness === 'little'
            ? (romData[ptrOffset] | (romData[ptrOffset + 1] << 8) | (romData[ptrOffset + 2] << 16))
            : ((romData[ptrOffset] << 16) | (romData[ptrOffset + 1] << 8) | romData[ptrOffset + 2]);
        }
        if (ptrSize === 4) {
          if (system.pointerEndianness === 'little') {
            return (
              (romData[ptrOffset]) |
              (romData[ptrOffset + 1] << 8) |
              (romData[ptrOffset + 2] << 16) |
              ((romData[ptrOffset + 3] << 24) >>> 0)
            ) >>> 0;
          }
          return (
            ((romData[ptrOffset] << 24) >>> 0) |
            (romData[ptrOffset + 1] << 16) |
            (romData[ptrOffset + 2] << 8) |
            romData[ptrOffset + 3]
          ) >>> 0;
        }
        return NaN;
      };

      const decodePointerTarget = (transformId, pointerValue, base = 0) => {
        if (!Number.isFinite(pointerValue)) return NaN;
        switch (transformId) {
          case 'raw':
          case 'gba_offset':
            return pointerValue >>> 0;
          case 'base+':
            return (pointerValue - system.pointerBase) >>> 0;
          case 'base-':
            return (pointerValue + system.pointerBase) >>> 0;
          case 'relative':
            return (pointerValue + base) >>> 0;
          case 'relative_signed16': {
            const signed = (pointerValue & 0x8000) ? (pointerValue - 0x10000) : pointerValue;
            return (base + signed) >>> 0;
          }
          case 'rel_shift1':
            return ((pointerValue << 1) + base) >>> 0;
          case 'rel_shift2':
            return ((pointerValue << 2) + base) >>> 0;
          case 'low16':
            return (((base & 0xFF0000) | (pointerValue & 0xFFFF)) >>> 0);
          case 'low16_variable':
            return ((base + (pointerValue & 0xFFFF)) >>> 0);
          case 'gba':
            return (pointerValue - 0x08000000) >>> 0;
          case 'gba_mirror1':
            return (pointerValue - 0x09000000) >>> 0;
          case 'gba_mirror2':
            return (pointerValue - 0x0A000000) >>> 0;
          case 'gba_variable':
            return (pointerValue + base) >>> 0;
          case 'nes_base+':
            return (pointerValue - 0x8000) >>> 0;
          case 'nes_base-':
            return (pointerValue + 0x8000) >>> 0;
          case 'nes_header':
            return (pointerValue - 0x10) >>> 0;
          case 'nes_prg':
            return (pointerValue - 0x7FF0) >>> 0;
          case 'snes_lorom':
          case 'snes_hirom':
          case 'snes_bank':
          case 'gb_base+':
          case 'gb_base-':
          case 'gb_bank':
            return NaN;
          default:
            return NaN;
        }
      };

      // STRUCTURE SEARCH: Finds tables based on the *pattern* of distances between texts.
      const findPointersByStructure = (romData, sortedTargetOffsets, options = {}) => {
        if (sortedTargetOffsets.length < 3) return [];
        const {
          ptrSize = 4,
          isLittle = true,
          alignment = 2,
          transformId2 = 'low16_variable',
          transformId4 = 'gba_variable'
        } = options;
        const view = new DataView(romData.buffer);
        const searchEnd = romData.length - (sortedTargetOffsets.length * ptrSize);
        const deltas = [];
        for (let i = 0; i < sortedTargetOffsets.length - 1; i++) {
          deltas.push(sortedTargetOffsets[i + 1] - sortedTargetOffsets[i]);
        }
        const matches = [];
        const firstDelta = deltas[0];
        for (let i = 0; i <= searchEnd; i += alignment) {
          let v1, v2;
          if (ptrSize === 2) {
            v1 = view.getUint16(i, isLittle);
            v2 = view.getUint16(i + 2, isLittle);
          } else {
            v1 = view.getUint32(i, isLittle);
            v2 = view.getUint32(i + 4, isLittle);
          }
          if ((v2 - v1) === firstDelta) {
            let isChain = true;
            let currentPtr = i + ptrSize;
            for (let d = 1; d < deltas.length; d++) {
              let va, vb;
              if (ptrSize === 2) {
                va = view.getUint16(currentPtr, isLittle);
                vb = view.getUint16(currentPtr + 2, isLittle);
              } else {
                va = view.getUint32(currentPtr, isLittle);
                vb = view.getUint32(currentPtr + 4, isLittle);
              }
              if ((vb - va) !== deltas[d]) { isChain = false; break; }
              currentPtr += ptrSize;
            }
            if (isChain) {
              const tableVal0 = (ptrSize === 2) ? view.getUint16(i, isLittle) : view.getUint32(i, isLittle);
              const textAddr0 = sortedTargetOffsets[0];
              const impliedBase = textAddr0 - tableVal0;
              // Found a table! Populate matches.
              for (let k = 0; k < sortedTargetOffsets.length; k++) {
                const ptrOffset = i + (k * ptrSize);
                const val = (ptrSize === 2) ? view.getUint16(ptrOffset, isLittle) : view.getUint32(ptrOffset, isLittle);
                matches.push({
                  ptrOffset: ptrOffset,
                  targetOffset: sortedTargetOffsets[k],
                  transformId: (ptrSize === 2) ? transformId2 : transformId4,
                  base: impliedBase,
                  value: val,
                  ptrSize: ptrSize
                });
              }
              if (matches.length > 5) return matches;
            }
          }
        }
        return matches;
      };

      const findFreeSpaceInRange = (romData, start, end, requiredSize, fillerBytes) => {
        if (requiredSize === 0) return start;
        const fillers = new Set(fillerBytes || [0xFF]);
        let consecutive = 0;
        for (let i = end - 1; i >= start; i--) {
          if (fillers.has(romData[i])) {
            consecutive++;
            if (consecutive >= requiredSize + 4) return i;
          } else {
            consecutive = 0;
          }
        }
        return -1;
      };

      const findFreeSpace = (romData, requiredSize) => {
        if (requiredSize === 0) return 0;
        const fillers = [0xFF, 0x00, terminatorHex];
        return findFreeSpaceInRange(romData, 0, romData.length, requiredSize, fillers);
      };

      const groupTextsIntoBlocks = (texts) => {
        if (texts.length === 0) return [];
        if (isGbaNonPaddingProfile || isGbaDweSingleByteProfile || isNesProfile || isSnesProfile || isGbLikeProfile) {
          const changed = texts
            .filter(t => {
              const tx = textMap.get(t.id);
              return !!(tx && typeof tx.translatedText === 'string' && tx.translatedText.length > 0);
            })
            .sort((a, b) => a.startByte - b.startByte);
          return changed.map(t => ({
            texts: [t],
            start: t.startByte,
            end: t.startByte + t.byteLength - 1
          }));
        }
        const sorted = [...texts].sort((a, b) => a.startByte - b.startByte);
        const blocks = [];
        if (sorted.length > 0) {
          let currentBlock = { texts: [sorted[0]], start: sorted[0].startByte, end: sorted[0].startByte + sorted[0].byteLength - 1 };
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].startByte <= currentBlock.end + 5) {
              currentBlock.texts.push(sorted[i]);
              currentBlock.end = Math.max(currentBlock.end, sorted[i].startByte + sorted[i].byteLength - 1);
            } else {
              blocks.push(currentBlock);
              currentBlock = { texts: [sorted[i]], start: sorted[i].startByte, end: sorted[i].startByte + sorted[i].byteLength - 1 };
            }
          }
          blocks.push(currentBlock);
        }
        return blocks;
      };

      const allTextOffsetsSorted = allTexts
        .filter(t => typeof t.startByte === 'number')
        .map(t => t.startByte)
        .sort((a, b) => a - b);

      const getContextOffsets = (targetOffset, radius = 12) => {
        if (!Number.isFinite(targetOffset) || allTextOffsetsSorted.length === 0) return [];
        let idx = 0;
        let lo = 0;
        let hi = allTextOffsetsSorted.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const v = allTextOffsetsSorted[mid];
          if (v === targetOffset) {
            idx = mid;
            break;
          }
          if (v < targetOffset) {
            idx = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const bank = targetOffset & 0xFF0000;
        const start = Math.max(0, idx - radius);
        const end = Math.min(allTextOffsetsSorted.length - 1, idx + radius);
        const offsets = [];
        for (let i = start; i <= end; i++) {
          const off = allTextOffsetsSorted[i];
          if ((off & 0xFF0000) === bank) offsets.push(off);
        }
        return Array.from(new Set(offsets)).sort((a, b) => a - b);
      };

      const isLikelyControlByte = (value) => {
        return Number.isFinite(value) && (value <= 0x1F || value === 0xFF);
      };

      const detectPreTextAliasOffsets = (startOffset) => {
        if (!Number.isFinite(startOffset) || startOffset < 0) return [];
        const aliases = [startOffset];
        const addAlias = (offset) => {
          if (!Number.isFinite(offset) || offset < 0) return;
          if (!aliases.includes(offset)) aliases.push(offset);
        };

        if (!isGbaNonPaddingProfile) return aliases;

        if (startOffset >= 2) {
          const b0 = originalRom[startOffset - 2];
          const b1 = originalRom[startOffset - 1];
          if (isLikelyControlByte(b0) && isLikelyControlByte(b1)) {
            addAlias(startOffset - 2);
          }
        }

        if (startOffset >= 4) {
          const p0 = originalRom[startOffset - 4];
          const p1 = originalRom[startOffset - 3];
          const p2 = originalRom[startOffset - 2];
          const p3 = originalRom[startOffset - 1];
          if (p0 === 0x01 && p1 === 0x00 && isLikelyControlByte(p2) && isLikelyControlByte(p3)) {
            addAlias(startOffset - 4);
          }
        }

        aliases.sort((a, b) => a - b);
        return aliases;
      };

      const decodeGbaAbsoluteLikeOffset = (rawValue) => {
        const value = rawValue >>> 0;
        const high = value & 0xFF000000;
        if (high === 0x08000000 || high === 0x09000000 || high === 0x0A000000) {
          const offset = (value & 0x00FFFFFF) >>> 0;
          return offset < originalRom.length ? offset : NaN;
        }
        if (value < originalRom.length) return value;
        return NaN;
      };

      const detectContainerAnchor = (startOffset) => {
        if (!isGbaNonPaddingProfile) return null;
        if (!Number.isFinite(startOffset) || startOffset < 0 || startOffset >= originalRom.length) return null;
        const windowBack = 0x400;
        const targetMin = Math.max(0, startOffset - windowBack);
        const targetMax = startOffset;
        const view = new DataView(originalRom.buffer);

        const ranges = (pointerRegions && pointerRegions.length > 0)
          ? pointerRegions.map(r => ({
            start: Math.max(0, r.start - 0x200),
            end: Math.min(originalRom.length - 4, r.end + 0x200)
          }))
          : [{ start: 0, end: originalRom.length - 4 }];

        const byTarget = new Map();
        const addHit = (targetOffset, ptrOffset) => {
          let rec = byTarget.get(targetOffset);
          if (!rec) {
            rec = { count: 0, ptrOffsets: [] };
            byTarget.set(targetOffset, rec);
          }
          rec.count++;
          if (rec.ptrOffsets.length < 32) rec.ptrOffsets.push(ptrOffset);
        };

        for (const range of ranges) {
          for (let i = range.start; i <= range.end; i += 4) {
            let value;
            try {
              value = view.getUint32(i, true);
            } catch (e) {
              continue;
            }
            const off = decodeGbaAbsoluteLikeOffset(value);
            if (!Number.isFinite(off)) continue;
            if (off >= targetMin && off <= targetMax) {
              addHit(off, i);
            }
          }
        }

        if (byTarget.size === 0) return null;
        let bestTarget = -1;
        let bestScore = -Infinity;
        let bestRecord = null;
        for (const [targetOffset, rec] of byTarget.entries()) {
          const distance = startOffset - targetOffset;
          const score = rec.count * 100000 - distance;
          if (score > bestScore) {
            bestScore = score;
            bestTarget = targetOffset;
            bestRecord = rec;
          }
        }
        if (!bestRecord || bestTarget < 0) return null;

        let nextTargetOffset = NaN;
        for (const ptrOffset of bestRecord.ptrOffsets) {
          if (ptrOffset + 4 > originalRom.length - 4) continue;
          const nextValue = view.getUint32(ptrOffset + 4, true);
          const nextOffset = decodeGbaAbsoluteLikeOffset(nextValue);
          if (!Number.isFinite(nextOffset)) continue;
          if (nextOffset > bestTarget && nextOffset <= bestTarget + 0x20000) {
            if (!Number.isFinite(nextTargetOffset) || nextOffset < nextTargetOffset) {
              nextTargetOffset = nextOffset;
            }
          }
        }
        return {
          anchorOffset: bestTarget,
          pointerCount: bestRecord.count,
          nextTargetOffset
        };
      };

      const blocks = groupTextsIntoBlocks(allTexts);
      const modifications = [];
      let totalRequiredSpace = 0;

      for (const block of blocks) {
        if (!block.texts.some(t => textMap.get(t.id)?.translatedText?.length > 0)) continue;

        const sortedTexts = [...block.texts].sort((a, b) => a.startByte - b.startByte);
        const textAliasMap = new Map();
        let effectiveBlockStart = block.start;
        let effectiveBlockEnd = block.end;
        if (isGbaNonPaddingProfile && sortedTexts.length > 0) {
          const container = detectContainerAnchor(sortedTexts[0].startByte);
          if (container && Number.isFinite(container.anchorOffset) && container.anchorOffset < effectiveBlockStart) {
            effectiveBlockStart = container.anchorOffset;
            if (Number.isFinite(container.nextTargetOffset)) {
              const candidateEnd = Math.min(originalRom.length - 1, container.nextTargetOffset - 1);
              if (candidateEnd > effectiveBlockEnd) effectiveBlockEnd = candidateEnd;
            }
            const nextLabel = Number.isFinite(container.nextTargetOffset)
              ? `, next 0x${container.nextTargetOffset.toString(16).toUpperCase()}`
              : '';
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Container anchor 0x${container.anchorOffset.toString(16).toUpperCase()} (hits x${container.pointerCount}${nextLabel}).`);
          }
        }
        if (isGbaNonPaddingProfile) {
          for (const textItem of sortedTexts) {
            if (typeof textItem.startByte !== 'number') continue;
            const aliases = detectPreTextAliasOffsets(textItem.startByte);
            textAliasMap.set(textItem.startByte, aliases);
            if (aliases.length > 0) {
              effectiveBlockStart = Math.min(effectiveBlockStart, aliases[0]);
            }
          }
        }
        if (isGbaNonPaddingProfile && effectiveBlockStart < sortedTexts[0].startByte) {
          const firstStart = sortedTexts[0].startByte;
          const aliases = textAliasMap.get(firstStart) || [firstStart];
          if (!aliases.includes(effectiveBlockStart)) {
            aliases.push(effectiveBlockStart);
            aliases.sort((a, b) => a - b);
          }
          textAliasMap.set(firstStart, aliases);
        }

        const segments = [];
        const textOffsetsInBlock = new Map();
        const textRanges = [];
        let totalLength = 0;
        let runningOffset = 0;
        if (effectiveBlockStart < sortedTexts[0].startByte) {
          const prefixBytes = originalRom.slice(effectiveBlockStart, sortedTexts[0].startByte);
          segments.push(prefixBytes);
          totalLength += prefixBytes.length;
          runningOffset += prefixBytes.length;
        }

        for (let i = 0; i < sortedTexts.length; i++) {
          const textItem = sortedTexts[i];
          const textData = textMap.get(textItem.id);
          const textToParse = textData?.translatedText || textData.originalText;
          const encoded = smartTextParse(textToParse, tokenizer, masterCharToHex, usePaddingByte, encodeOptions);
          if (typeof textItem.startByte === 'number' && typeof textItem.byteLength === 'number') {
            textRanges.push({ start: textItem.startByte, end: textItem.startByte + textItem.byteLength - 1 });
          }
          textOffsetsInBlock.set(textItem.startByte, runningOffset);
          if (isGbaNonPaddingProfile) {
            const aliases = textAliasMap.get(textItem.startByte) || [textItem.startByte];
            for (const aliasOffset of aliases) {
              const rel = runningOffset - (textItem.startByte - aliasOffset);
              if (rel >= 0) textOffsetsInBlock.set(aliasOffset, rel);
            }
          }
          segments.push(encoded);
          totalLength += encoded.length;
          runningOffset += encoded.length;

          const next = sortedTexts[i + 1];
          if (next) {
            const gapStart = textItem.startByte + textItem.byteLength;
            const gapEnd = next.startByte;
            if (gapEnd > gapStart) {
              const gapBytes = originalRom.slice(gapStart, gapEnd);
              segments.push(gapBytes);
              totalLength += gapBytes.length;
              runningOffset += gapBytes.length;
            }
          }
        }
        const lastText = sortedTexts[sortedTexts.length - 1];
        const lastTextEnd = lastText.startByte + lastText.byteLength - 1;
        if (effectiveBlockEnd > lastTextEnd) {
          const suffixBytes = originalRom.slice(lastTextEnd + 1, effectiveBlockEnd + 1);
          segments.push(suffixBytes);
          totalLength += suffixBytes.length;
          runningOffset += suffixBytes.length;
        }
        if (effectiveBlockStart < sortedTexts[0].startByte) {
          textOffsetsInBlock.set(effectiveBlockStart, 0);
        }

        const newBlockBytes = new Uint8Array(totalLength);
        let offset = 0;
        segments.forEach(arr => { newBlockBytes.set(arr, offset); offset += arr.length; });

        const effectiveBlock = {
          ...block,
          start: effectiveBlockStart,
          end: effectiveBlockEnd
        };
        const originalBlockLength = (effectiveBlock.end - effectiveBlock.start) + 1;
        const needsRelocation = newBlockBytes.length > originalBlockLength;
        let needsPointerUpdate = false;
        for (const textItem of sortedTexts) {
          if (typeof textItem.startByte !== 'number') continue;
          const newRel = textOffsetsInBlock.get(textItem.startByte);
          const oldRel = textItem.startByte - effectiveBlock.start;
          if (newRel !== oldRel) { needsPointerUpdate = true; break; }
        }

        const mod = {
          block: effectiveBlock,
          newBlockBytes,
          originalBlockLength,
          needsRelocation,
          needsPointerUpdate,
          pointers: [],
          textOffsetsInBlock,
          textRanges,
          sortedTexts
        };
        if (needsRelocation || needsPointerUpdate) {
          const canonicalTargetOffsets = sortedTexts
            .map(t => t.startByte)
            .filter(v => Number.isFinite(v));
          const aliasTargetOffsets = isGbaNonPaddingProfile
            ? Array.from(new Set(canonicalTargetOffsets.flatMap(off => textAliasMap.get(off) || [off]))).sort((a, b) => a - b)
            : canonicalTargetOffsets;
          const targetOffsets = canonicalTargetOffsets;
          const searchTargetOffsets = aliasTargetOffsets.length > 0 ? aliasTargetOffsets : canonicalTargetOffsets;
          const coverageTargetCount = Math.max(1, targetOffsets.length);
          const minTarget = Math.min(...searchTargetOffsets);
          const baseCandidates = Array.from(new Set([effectiveBlock.start, minTarget, ...pointerRegionBases].filter(v => Number.isFinite(v))));
          if (isGbaNonPaddingProfile && searchTargetOffsets.length > targetOffsets.length) {
            relocationLog.push(`Block at 0x${effectiveBlock.start.toString(16).toUpperCase()}: Alias targets enabled (${searchTargetOffsets.length} from ${targetOffsets.length}).`);
          }
          const maxPointers = Math.min(8192, Math.max(64, Math.floor(romCopy.length / (system.pointerSize * 512))));
          let pointers = [];
          let search = { pointers: [], coverage: 0 };
          const hintPointersRaw = getHintPointersForTargets(searchTargetOffsets);
          if (hintPointersRaw.length > 0) {
            pointers = mergePointerLists(pointers, addPointerMeta(hintPointersRaw, 0.99, 'group_hint'));
            relocationLog.push(`Block at 0x${effectiveBlock.start.toString(16).toUpperCase()}: Loaded ${hintPointersRaw.length} pointer hint(s) from saved groups.`);
          }

          if (isGbaNonPaddingProfile) {
            let exact32 = addPointerMeta(findExactGbaAbsolutePointers(romCopy, searchTargetOffsets, 8192), 1.0, 'gba_nonpadding_exact32');
            exact32 = selectBestPointerCandidates(exact32);
            pointers = mergePointerLists(pointers, exact32);

            let raw24 = addPointerMeta(findRaw24Pointers(romCopy, searchTargetOffsets, 8192), 0.92, 'gba_nonpadding_raw24');
            raw24 = selectBestPointerCandidates(raw24);
            pointers = mergePointerLists(pointers, raw24);

            const relativeBases = Array.from(new Set([
              effectiveBlock.start,
              minTarget,
              effectiveBlock.start & 0xFF0000
            ].filter(v => Number.isFinite(v) && v >= 0)));

            const collectRelativeCandidates = (ptrSize, allowUnaligned, confidence, reason) => {
              const found = findPointersHeuristically(romCopy, searchTargetOffsets, {
                baseCandidates: relativeBases,
                includeRelative: true,
                allowUnaligned,
                pointerRegions: allowUnaligned ? null : pointerRegions,
                pointerSizeOverride: ptrSize,
                relativeOnly: true
              });
              let normalized = addPointerMeta(found, confidence, reason);
              normalized = selectBestPointerCandidates(normalized);
              if (normalized.length > 0 && ptrSize === 2) {
                normalized = filterByPointerRunsWithStep(normalized, 3, maxPointers, 2);
              }
              if (normalized.length > 0 && ptrSize === 3) {
                normalized = filterByPointerRunsWithStep(normalized, 2, maxPointers, 3);
              }
              return normalized;
            };

            const relative16Aligned = collectRelativeCandidates(2, false, 0.95, 'gba_nonpadding_relative16');
            pointers = mergePointerLists(pointers, relative16Aligned);

            if (computeCoverage(pointers, coverageTargetCount) < 0.35) {
              const relative16Unaligned = collectRelativeCandidates(2, true, 0.9, 'gba_nonpadding_relative16_unaligned');
              pointers = mergePointerLists(pointers, relative16Unaligned);
            }

            if (computeCoverage(pointers, coverageTargetCount) < 0.35) {
              let signed16 = findSignedRelative16Pointers(romCopy, searchTargetOffsets, relativeBases, false, 8192);
              if (signed16.length === 0) {
                signed16 = findSignedRelative16Pointers(romCopy, searchTargetOffsets, relativeBases, true, 8192);
              }
              signed16 = addPointerMeta(signed16, 0.9, 'gba_nonpadding_relative16_signed');
              signed16 = selectBestPointerCandidates(signed16);
              if (signed16.length > 0) {
                signed16 = filterByPointerRunsWithStep(signed16, 2, maxPointers, 2);
                pointers = mergePointerLists(pointers, signed16);
              }
            }

            const relative32Aligned = collectRelativeCandidates(4, false, 0.84, 'gba_nonpadding_relative32');
            pointers = mergePointerLists(pointers, relative32Aligned);

            if (computeCoverage(pointers, coverageTargetCount) < 0.25) {
              const relative24Aligned = collectRelativeCandidates(3, false, 0.82, 'gba_nonpadding_relative24');
              pointers = mergePointerLists(pointers, relative24Aligned);
            }

            if (computeCoverage(pointers, coverageTargetCount) < 0.35 && targetOffsets.length === 1) {
              const contextOffsets = getContextOffsets(targetOffsets[0], 14);
              if (contextOffsets.length >= 4) {
                const targetSet = new Set(targetOffsets);
                let context16 = findPointersByStructure(romCopy, contextOffsets, {
                  ptrSize: 2,
                  isLittle: true,
                  alignment: 2,
                  transformId2: 'relative',
                  transformId4: 'relative'
                });
                context16 = context16.filter(p => targetSet.has(p.targetOffset));
                context16 = addPointerMeta(context16, 0.96, 'gba_nonpadding_context16');
                context16 = selectBestPointerCandidates(context16);
                if (context16.length > 0) {
                  context16 = filterByPointerRunsWithStep(context16, 2, maxPointers, 2);
                  pointers = mergePointerLists(pointers, context16);
                }

                let context32 = findPointersByStructure(romCopy, contextOffsets, {
                  ptrSize: 4,
                  isLittle: true,
                  alignment: 4,
                  transformId2: 'relative',
                  transformId4: 'relative'
                });
                context32 = context32.filter(p => targetSet.has(p.targetOffset));
                context32 = addPointerMeta(context32, 0.88, 'gba_nonpadding_context32');
                context32 = selectBestPointerCandidates(context32);
                if (context32.length > 0) {
                  pointers = mergePointerLists(pointers, context32);
                }
              }
            }

            if (computeCoverage(pointers, coverageTargetCount) < 0.2) {
              let low16Pointers = findLow16Pointers(romCopy, searchTargetOffsets, false, 8192);
              if (low16Pointers.length === 0) {
                low16Pointers = findLow16Pointers(romCopy, searchTargetOffsets, true, 8192);
              }
              low16Pointers = addPointerMeta(low16Pointers, 0.7, 'gba_nonpadding_low16_absolute');
              low16Pointers = selectBestPointerCandidates(low16Pointers);
              if (low16Pointers.length > 0) {
                low16Pointers = filterByPointerRunsWithStep(low16Pointers, 3, maxPointers, 2);
                pointers = mergePointerLists(pointers, low16Pointers);
              }
            }

            search = { pointers, coverage: computeCoverage(pointers, coverageTargetCount) };
          } else {
            const trySearch = (includeRelative, allowUnaligned) => {
              return findPointersWithSizes(targetOffsets, {
                baseCandidates,
                includeRelative,
                allowUnaligned,
                pointerRegions,
                allowShortRelative: !needsRelocation
              });
            };

            search = trySearch(false, false);
            if (search.pointers.length === 0 || search.coverage < 0.1) {
              const next = trySearch(true, false);
              if (next.pointers.length > 0 || next.coverage > search.coverage) search = next;
            }
            if (search.pointers.length === 0 || search.coverage < 0.1) {
              const next = trySearch(true, true);
              if (next.pointers.length > 0 || next.coverage > search.coverage) search = next;
            }

            let searchedPointers = addPointerMeta(search.pointers, 0.7, 'default_heuristic');
            searchedPointers = selectBestPointerCandidates(searchedPointers);
            pointers = mergePointerLists(pointers, searchedPointers);

            if (system.name === "GBA" && (pointers.length === 0 || search.coverage < 0.2)) {
              let low16Pointers = findLow16Pointers(romCopy, targetOffsets, false, 8192);
              if (low16Pointers.length === 0) {
                low16Pointers = findLow16Pointers(romCopy, targetOffsets, true, 8192);
              }
              low16Pointers = addPointerMeta(low16Pointers, 0.72, 'default_low16');
              low16Pointers = selectBestPointerCandidates(low16Pointers);
              if (low16Pointers.length > 0) {
                low16Pointers = filterByPointerRunsWithStep(low16Pointers, 3, maxPointers, 2);
                pointers = mergePointerLists(pointers, low16Pointers);
              }
            }

            if (search.coverage < 0.35 && pointers.length < targetOffsets.length && !isGbaDweSingleByteProfile) {
              const structPtrs16 = addPointerMeta(findPointersByStructure(romCopy, targetOffsets, { ptrSize: 2, isLittle: true }), 0.45, 'structure16');
              const structPtrs32 = addPointerMeta(findPointersByStructure(romCopy, targetOffsets, { ptrSize: 4, isLittle: true }), 0.48, 'structure32');
              pointers = mergePointerLists(pointers, selectBestPointerCandidates(structPtrs16));
              pointers = mergePointerLists(pointers, selectBestPointerCandidates(structPtrs32));
            }
          }

          let finalPointers = selectBestPointerCandidates(pointers);
          if (isNesProfile && finalPointers.length > 0) {
            const preferred = finalPointers.filter(p => (
              p.transformId === 'nes_prg' ||
              p.transformId === 'nes_header' ||
              (p.transformId === 'raw' && (p.ptrSize || system.pointerSize) === 2)
            ));
            if (preferred.length > 0) finalPointers = preferred;
            finalPointers = filterByPointerRunsWithStep(finalPointers, 2, maxPointers, 2);
          }
          if (isSnesProfile && finalPointers.length > 0) {
            const preferred = finalPointers.filter(p => (
              p.transformId === 'snes_lorom' ||
              p.transformId === 'snes_hirom' ||
              p.transformId === 'snes_bank' ||
              p.transformId === 'raw'
            ));
            if (preferred.length > 0) finalPointers = preferred;
          }
          if (isGbLikeProfile && finalPointers.length > 0) {
            const preferred = finalPointers.filter(p => (
              p.transformId === 'gb_base+' ||
              p.transformId === 'gb_base-' ||
              p.transformId === 'gb_bank' ||
              p.transformId === 'raw'
            ));
            if (preferred.length > 0) finalPointers = preferred;
          }
          if (isGbaDweSingleByteProfile && finalPointers.length > 0) {
            const wordAbsolute = finalPointers.filter(p => {
              const size = p.ptrSize || system.pointerSize;
              return size >= 4 && isAbsoluteLikeGbaTransform(p.transformId);
            });
            if (wordAbsolute.length > 0) {
              finalPointers = wordAbsolute;
            } else {
              const non24 = finalPointers.filter(p => (p.ptrSize || system.pointerSize) !== 3);
              if (non24.length > 0) finalPointers = non24;
            }
          }
          if (finalPointers.length > maxPointers) {
            finalPointers.sort((a, b) => {
              const cB = Number.isFinite(b.confidence) ? b.confidence : 0.5;
              const cA = Number.isFinite(a.confidence) ? a.confidence : 0.5;
              return cB - cA;
            });
            finalPointers = finalPointers.slice(0, maxPointers);
          }
          if (isGbaNonPaddingProfile) {
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Pointer candidates ${finalPointers.length}, coverage ${(search.coverage * 100).toFixed(2)}%.`);
          }

          mod.pointers = finalPointers;
          if (mod.pointers.length > 0 && mod.pointers.length <= maxPointers) {
            if (needsRelocation && !isGbaNonPaddingProfile) totalRequiredSpace += newBlockBytes.length + terminatorBytes.length;
          } else if (mod.pointers.length > maxPointers) {
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Pointer scan found too many matches (${mod.pointers.length}). Relocation skipped to avoid corruption.`);
            mod.pointers = [];
          }
        }
        modifications.push(mod);
      }

      let freeSpaceOffset = findFreeSpace(romCopy, totalRequiredSpace);
      if (freeSpaceOffset === -1 && totalRequiredSpace > 0) {
        const newSize = romCopy.length + totalRequiredSpace + 0x2000;
        const expandedRom = new Uint8Array(newSize);
        expandedRom.set(romCopy);
        expandedRom.fill(terminatorHex, romCopy.length);
        freeSpaceOffset = romCopy.length;
        romCopy = expandedRom;
        relocationLog.push(`ROM expanded to ${Math.round(romCopy.length / 1024)}KB to make space for larger texts.`);
      }
      const romView = new DataView(romCopy.buffer);

      for (const mod of modifications) {
        const { block, newBlockBytes, originalBlockLength, needsRelocation, needsPointerUpdate, pointers, textOffsetsInBlock, textRanges, sortedTexts } = mod;
        let pointersForWrite = pointers;
        const shouldUpdatePointers = (needsRelocation || needsPointerUpdate) && pointers.length > 0;

        const fillRangeWithTerminatorPattern = (fillStart, fillEnd) => {
          if (fillEnd <= fillStart) return;
          if (terminatorBytes.length <= 1) {
            romCopy.fill(terminatorHex, fillStart, fillEnd);
            return;
          }
          let offset = fillStart;
          while (offset < fillEnd) {
            for (let j = 0; j < terminatorBytes.length && offset < fillEnd; j++) {
              romCopy[offset++] = terminatorBytes[j];
            }
          }
        };

        const writeInPlace = () => {
          romCopy.set(newBlockBytes, block.start);
          if (newBlockBytes.length < originalBlockLength) {
            const fillStart = block.start + newBlockBytes.length;
            const fillEnd = block.start + originalBlockLength;
            fillRangeWithTerminatorPattern(fillStart, fillEnd);
          }
        };

        const writeInPlaceFixedSlots = () => {
          let truncatedCount = 0;
          let writtenCount = 0;
          const localSortedTexts = Array.isArray(sortedTexts) ? sortedTexts : [];
          for (const textItem of localSortedTexts) {
            if (typeof textItem.startByte !== 'number' || typeof textItem.byteLength !== 'number') continue;
            const textData = textMap.get(textItem.id);
            if (!textData) continue;
            const slotStart = textItem.startByte;
            const slotLength = Math.max(0, textItem.byteLength);
            if (slotLength <= 0 || slotStart < 0 || (slotStart + slotLength) > romCopy.length) continue;
            const textToParse = textData.translatedText || textData.originalText || '';
            const encoded = smartTextParse(textToParse, tokenizer, masterCharToHex, usePaddingByte, encodeOptions);
            const writeLen = Math.min(encoded.length, slotLength);
            if (writeLen > 0) {
              romCopy.set(encoded.subarray(0, writeLen), slotStart);
            }
            if (writeLen < slotLength) {
              fillRangeWithTerminatorPattern(slotStart + writeLen, slotStart + slotLength);
            }
            if (encoded.length > slotLength) truncatedCount++;
            writtenCount++;
          }
          return { truncatedCount, writtenCount };
        };

        const isInTextRange = (offset) => {
          for (const range of textRanges) {
            if (offset >= range.start && offset <= range.end) return true;
          }
          return false;
        };

        const buildValidPointers = (newOffset, relaxValidation) => {
          const list = [];
          const stats = {
            originChecked: 0,
            originPassed: 0,
            targetChecked: 0,
            targetPassed: 0
          };
          for (const ptr of pointersForWrite) {
            if (ptr.ptrOffset >= block.start && ptr.ptrOffset <= block.end) {
              if (textRanges.length === 0 || isInTextRange(ptr.ptrOffset)) continue;
            }
            const rel = textOffsetsInBlock.get(ptr.targetOffset);
            if (rel === undefined) continue;
            const size = ptr.ptrSize || system.pointerSize;
            if (isStrictGbaPointerValidation) {
              const currentPointerValue = readPointerValueAt(romCopy, ptr.ptrOffset, size);
              if (!Number.isFinite(currentPointerValue)) continue;
              stats.originChecked++;
              const resolvedOldTarget = decodePointerTarget(ptr.transformId, currentPointerValue, ptr.base || 0);
              if (!Number.isFinite(resolvedOldTarget) || resolvedOldTarget !== ptr.targetOffset) continue;
              stats.originPassed++;
            }
            const expected = originalEncodedByStart.get(ptr.targetOffset);
            if (!relaxValidation && expected && !matchesEncodedAt(originalRom, ptr.targetOffset, expected)) continue;
            const newTargetOffset = newOffset + rel;
            const newPointerValue = applyPointerTransform(ptr.transformId, newTargetOffset, ptr.base || 0);
            if (!Number.isFinite(newPointerValue)) continue;
            if (newPointerValue < 0 || newPointerValue > 0xFFFFFFFF) continue;
            if (size === 2 && newPointerValue > 0xFFFF) continue;
            if (size === 3 && newPointerValue > 0xFFFFFF) continue;
            if (isStrictGbaPointerValidation) {
              stats.targetChecked++;
              const resolvedNewTarget = decodePointerTarget(ptr.transformId, newPointerValue, ptr.base || 0);
              if (!Number.isFinite(resolvedNewTarget) || resolvedNewTarget !== newTargetOffset) continue;
              stats.targetPassed++;
            }
            list.push({
              ptrOffset: ptr.ptrOffset,
              newPointerValue,
              ptrSize: size,
              transformId: ptr.transformId || 'unknown',
              confidence: Number.isFinite(ptr.confidence) ? ptr.confidence : 0.5,
              validationReason: ptr.validationReason || 'validated'
            });
          }
          return { list, stats };
        };

        if (shouldUpdatePointers) {
          let newOffset = needsRelocation ? freeSpaceOffset : block.start;
          if (needsRelocation && isGbaNonPaddingProfile) {
            const fillers = [0x00, 0xFF, terminatorHex];
            const requiredBytes = newBlockBytes.length + terminatorBytes.length;
            const isAbsoluteLikeTransform = (transformId) => (
              transformId === 'gba' ||
              transformId === 'gba_offset' ||
              transformId === 'gba_mirror1' ||
              transformId === 'gba_mirror2' ||
              transformId === 'raw'
            );
            const absoluteStrongPointers = pointersForWrite.filter(p => {
              const size = p.ptrSize || system.pointerSize;
              if (size < 4) return false;
              if (!isAbsoluteLikeTransform(p.transformId)) return false;
              const confidence = Number.isFinite(p.confidence) ? p.confidence : 0;
              return confidence >= 0.95;
            });
            if (absoluteStrongPointers.length > 0) {
              pointersForWrite = absoluteStrongPointers;
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Prioritizing ${absoluteStrongPointers.length} absolute pointer(s) for relocation.`);
            }
            const shortRelativePtrs = pointersForWrite.filter(p => {
              const size = p.ptrSize || system.pointerSize;
              return size === 2 && (p.transformId === 'relative' || p.transformId === 'relative_signed16' || p.transformId === 'rel_shift1' || p.transformId === 'rel_shift2');
            });
            if (shortRelativePtrs.length > 0) {
              const baseCount = new Map();
              for (const ptr of shortRelativePtrs) {
                const b = ptr.base || 0;
                baseCount.set(b, (baseCount.get(b) || 0) + 1);
              }
              let dominantBase = block.start;
              let dominantCount = -1;
              for (const [b, c] of baseCount.entries()) {
                if (c > dominantCount) {
                  dominantBase = b;
                  dominantCount = c;
                }
              }
              pointersForWrite = pointersForWrite.filter(p => {
                const size = p.ptrSize || system.pointerSize;
                if (size !== 2) return true;
                if (p.transformId === 'relative' || p.transformId === 'relative_signed16' || p.transformId === 'rel_shift1' || p.transformId === 'rel_shift2') {
                  return (p.base || 0) === dominantBase;
                }
                return true;
              });
              let rangeStart = Math.max(0, dominantBase);
              let rangeEnd = Math.min(romCopy.length, dominantBase + 0xFFFF + 1);
              if (pointersForWrite.some(p => (p.ptrSize || system.pointerSize) === 2 && p.transformId === 'rel_shift2')) {
                rangeEnd = Math.min(romCopy.length, dominantBase + (0xFFFF << 2) + 1);
              } else if (pointersForWrite.some(p => (p.ptrSize || system.pointerSize) === 2 && p.transformId === 'rel_shift1')) {
                rangeEnd = Math.min(romCopy.length, dominantBase + (0xFFFF << 1) + 1);
              }
              if (pointersForWrite.some(p => (p.ptrSize || system.pointerSize) === 2 && p.transformId === 'relative_signed16')) {
                rangeStart = Math.max(0, dominantBase - 0x8000);
                rangeEnd = Math.min(romCopy.length, dominantBase + 0x7FFF + 1);
              }
              let constrainedOffset = findFreeSpaceInRange(romCopy, rangeStart, rangeEnd, requiredBytes, fillers);
              if (constrainedOffset === -1) {
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation skipped (no free space in relative range for 16-bit pointers).`);
                continue;
              }
              const requiresAlign4 = pointersForWrite.some(p => (p.ptrSize || system.pointerSize) === 2 && p.transformId === 'rel_shift2');
              const requiresAlign2 = pointersForWrite.some(p => (p.ptrSize || system.pointerSize) === 2 && p.transformId === 'rel_shift1');
              if (requiresAlign4) constrainedOffset -= (constrainedOffset % 4);
              else if (requiresAlign2) constrainedOffset -= (constrainedOffset % 2);
              newOffset = constrainedOffset;
            } else {
              const bankBase = block.start & 0xFF0000;
              const bankStart = bankBase;
              const bankEnd = Math.min(bankBase + 0x10000, romCopy.length);
              const bankOffset = findFreeSpaceInRange(romCopy, bankStart, bankEnd, requiredBytes, fillers);
              const hasBankBoundPointers = pointersForWrite.some(p => p.transformId === 'low16' || p.transformId === 'low16_variable');
              if (bankOffset !== -1) {
                newOffset = bankOffset;
              } else if (hasBankBoundPointers) {
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation skipped (no free space in same bank for 16-bit pointers).`);
                continue;
              } else {
                const anyOffset = findFreeSpace(romCopy, requiredBytes);
                if (anyOffset === -1) {
                  relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation skipped (no safe free space in ROM without expansion).`);
                  continue;
                }
                newOffset = anyOffset;
              }
            }
          }
          if (needsRelocation && isGbaNonPaddingProfile) {
            const hasWordPointers = pointersForWrite.some(p => {
              const size = p.ptrSize || system.pointerSize;
              return size >= 4 || p.transformId === 'gba' || p.transformId === 'gba_offset' || p.transformId === 'gba_mirror1' || p.transformId === 'gba_mirror2' || p.transformId === 'raw';
            });
            const hasHalfwordPointers = pointersForWrite.some(p => (p.ptrSize || system.pointerSize) >= 2);
            if (hasWordPointers) {
              newOffset -= (newOffset % 4);
            } else if (hasHalfwordPointers) {
              newOffset -= (newOffset % 2);
            }
          }
          if (needsRelocation && isStrictGbaPointerValidation && !isGbaNonPaddingProfile) {
            const hasWordPointers = pointersForWrite.some(p => (p.ptrSize || system.pointerSize) >= 4);
            if (hasWordPointers) {
              newOffset -= (newOffset % 4);
            } else if (usePaddingByte) {
              newOffset -= (newOffset % 2);
            }
          }
          if (needsRelocation && isGbaDweSingleByteProfile) {
            newOffset -= (newOffset % 2);
          }
          let validationResult = buildValidPointers(newOffset, false);
          let validPointers = validationResult.list;
          if (validPointers.length === 0 && pointersForWrite.length > 0) {
            validationResult = buildValidPointers(newOffset, true);
            validPointers = validationResult.list;
          }
          if (needsRelocation && isStrictGbaPointerValidation && validPointers.length > 0) {
            const isInPointerRegion = (ptrOffset) => {
              for (const region of pointerRegions) {
                if (ptrOffset >= region.start && ptrOffset <= region.end) return true;
              }
              return false;
            };
            if (pointerRegions.length > 0) {
              const regionFiltered = validPointers.filter(p => isInPointerRegion(p.ptrOffset));
              if (regionFiltered.length > 0 && regionFiltered.length < validPointers.length) {
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Filtered pointers by region (${regionFiltered.length}/${validPointers.length}).`);
                validPointers = regionFiltered;
              }
            }
            if (!isGbaNonPaddingProfile && usePaddingByte && validPointers.length > 1) {
              const wordPointers = validPointers.filter(p => (p.ptrSize || system.pointerSize) >= 4);
              if (wordPointers.length > 0 && wordPointers.length < validPointers.length) {
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Restricted to word-sized pointers in DWE mode (${wordPointers.length}/${validPointers.length}).`);
                validPointers = wordPointers;
              }
              const absoluteStrong = validPointers.filter(p => {
                const size = p.ptrSize || system.pointerSize;
                if (size < 4) return false;
                if (!isAbsoluteLikeGbaTransform(p.transformId)) return false;
                const confidence = Number.isFinite(p.confidence) ? p.confidence : 0;
                return confidence >= 0.8;
              });
              if (absoluteStrong.length > 0) {
                if (absoluteStrong.length < validPointers.length) {
                  relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Prioritizing absolute pointers in DWE mode (${absoluteStrong.length}/${validPointers.length}).`);
                }
                validPointers = absoluteStrong;
              } else {
                const confident = validPointers.filter(p => (Number.isFinite(p.confidence) ? p.confidence : 0) >= 0.65);
                if (confident.length > 0 && confident.length < validPointers.length) {
                  relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Filtered weak pointers in DWE mode (${confident.length}/${validPointers.length}).`);
                  validPointers = confident;
                }
              }
            }
          }
          if (isGbaNonPaddingProfile && needsRelocation && validPointers.length > 0) {
            const preferred = validPointers.filter(p => (
              p.transformId === 'relative' ||
              p.transformId === 'relative_signed16' ||
              p.transformId === 'rel_shift1' ||
              p.transformId === 'rel_shift2' ||
              p.transformId === 'low16' ||
              (
                (p.transformId === 'gba' || p.transformId === 'gba_offset' || p.transformId === 'gba_mirror1' || p.transformId === 'gba_mirror2' || p.transformId === 'raw') &&
                (Number.isFinite(p.confidence) ? p.confidence : 0) >= 0.95
              )
            ));
            if (preferred.length > 0) {
              const strongest = preferred.filter(p => (Number.isFinite(p.confidence) ? p.confidence : 0) >= 0.95);
              validPointers = strongest.length > 0 ? strongest : preferred;
            } else {
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation skipped (only weak pointer transforms detected).`);
              validPointers = [];
            }
          }
          if (validPointers.length === 0) {
            if (needsRelocation) {
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation skipped (no safe pointers found).`);
              if (isStrictGbaPointerValidation) {
                relocationLog.push(`  -> Origin validation ${validationResult.stats.originPassed}/${validationResult.stats.originChecked}, target validation ${validationResult.stats.targetPassed}/${validationResult.stats.targetChecked}.`);
              }
            } else {
              if (needsPointerUpdate) {
                const slotResult = writeInPlaceFixedSlots();
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Pointer update failed (NO POINTERS FOUND). Applied fixed-slot in-place fallback (updated ${slotResult.writtenCount} text slot(s), truncated ${slotResult.truncatedCount}).`);
              } else {
                writeInPlace();
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Pointer update failed (NO POINTERS FOUND). In-place data written.`);
              }
              if (isStrictGbaPointerValidation) {
                relocationLog.push(`  -> Origin validation ${validationResult.stats.originPassed}/${validationResult.stats.originChecked}, target validation ${validationResult.stats.targetPassed}/${validationResult.stats.targetChecked}.`);
              }
            }
          } else {
            if (needsRelocation) {
              romCopy.set(newBlockBytes, newOffset);
              romCopy.set(terminatorBytes, newOffset + newBlockBytes.length);
            } else {
              writeInPlace();
            }
            validPointers.forEach(ptr => {
              if (ptr.ptrSize === 2) {
                romView.setUint16(ptr.ptrOffset, ptr.newPointerValue, system.pointerEndianness === 'little');
              } else if (ptr.ptrSize === 3) {
                const v = ptr.newPointerValue & 0xFFFFFF;
                if (system.pointerEndianness === 'little') {
                  romCopy[ptr.ptrOffset] = v & 0xFF;
                  romCopy[ptr.ptrOffset + 1] = (v >> 8) & 0xFF;
                  romCopy[ptr.ptrOffset + 2] = (v >> 16) & 0xFF;
                } else {
                  romCopy[ptr.ptrOffset] = (v >> 16) & 0xFF;
                  romCopy[ptr.ptrOffset + 1] = (v >> 8) & 0xFF;
                  romCopy[ptr.ptrOffset + 2] = v & 0xFF;
                }
              } else {
                romView.setUint32(ptr.ptrOffset, ptr.newPointerValue, system.pointerEndianness === 'little');
              }
            });
            if (needsRelocation) {
              if (!isGbaNonPaddingProfile) {
                freeSpaceOffset += newBlockBytes.length + terminatorBytes.length;
              }
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Relocated to 0x${newOffset.toString(16).toUpperCase()}. Updated ${validPointers.length} pointer(s).`);
              if (isStrictGbaPointerValidation) {
                const pointerSample = validPointers.slice(0, 8).map(p => `0x${p.ptrOffset.toString(16).toUpperCase()}(${p.transformId})`);
                if (pointerSample.length > 0) {
                  relocationLog.push(`  -> Pointer sample: ${pointerSample.join(', ')}`);
                }
                relocationLog.push(`  -> Origin validation ${validationResult.stats.originPassed}/${validationResult.stats.originChecked}, target validation ${validationResult.stats.targetPassed}/${validationResult.stats.targetChecked}.`);
              }
            } else {
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Updated ${validPointers.length} pointer(s) in-place.`);
              if (isStrictGbaPointerValidation) {
                relocationLog.push(`  -> Origin validation ${validationResult.stats.originPassed}/${validationResult.stats.originChecked}, target validation ${validationResult.stats.targetPassed}/${validationResult.stats.targetChecked}.`);
              }
            }
          }
        } else if (!needsRelocation) {
          if (needsPointerUpdate) {
            const slotResult = writeInPlaceFixedSlots();
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Pointer update failed (NO POINTERS FOUND). Applied fixed-slot in-place fallback (updated ${slotResult.writtenCount} text slot(s), truncated ${slotResult.truncatedCount}).`);
          } else {
            writeInPlace();
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Injected in-place.`);
          }
        } else {
          const sizeDiff = newBlockBytes.length - originalBlockLength;
          relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation failed (NO POINTERS FOUND). Size difference: ${sizeDiff} bytes. Original data kept to prevent corruption.`);
          relocationLog.push(`  -> Try using shorter translations or find pointers manually.`);
        }
      }
      return { modifiedRom: romCopy, relocationLog };
    };

    const createTextExtractorWorker = () => {
      const workerCode = `
          self.onmessage = async (e) => {
            try {
              const { romBuffer, tableData, options } = e.data;
              const romData = new Uint8Array(romBuffer);
              const {
                minLength,
                maxLength,
                asciiFallback,
                system,
                usePaddingByte,
                systemPipeline,
                strictExtractorMode,
                enableTextDecompression,
                decompressionMode,
                includeCompressedReadOnly,
                strictSceneProfile
              } = options;
              const PADDING_BYTE = 0x00;
              const useAsciiFallback = !!asciiFallback;
              const isRetroPipeline = systemPipeline === 'pipeline_nes' || systemPipeline === 'pipeline_snes' || systemPipeline === 'pipeline_gb' || systemPipeline === 'pipeline_gbc' || systemPipeline === 'pipeline_pce';
              const effectiveMinLength = isRetroPipeline ? Math.max(3, minLength || 0) : minLength;
              const strictMode = !!strictExtractorMode;
              const strictSceneProfileMode = String(strictSceneProfile || 'default').toLowerCase();
              const strictSceneBoundsMode = strictSceneProfileMode === 'khcom_castlevania';
              const strictAsciiRegex = /^[A-Za-z0-9\\s.,!?\"':;()\\-\\/]+$/;
              const strictDialogCueRegex = /(\\[[A-Z0-9 _\\-]+\\])|([a-z]{2,}.*[.!?])|\\b(hey|looks|coming|name|is|the|you|your|i|we|he|she|they|who|what|where|when|why|how|yes|no)\\b/i;
              const strictTitleNoiseRegex = /\\b(press\\s+start|new\\s+game|continue|option|konami|nintendo|square\\s+enix|disney|copyright|all\\s+rights\\s+reserved|licensed\\s+by|game\\s+boy|advance|chapter\\s+of\\s+memories|chain\\s+of\\s+memories|title\\s+screen)\\b/i;
              const allowDecompression = enableTextDecompression !== false;
              const decompressionModeNormalized = String(decompressionMode || 'auto').toLowerCase();
              const includeCompressed = includeCompressedReadOnly !== false;

              const isAsciiStandardByte = (b) => {
                const v = Number(b) & 0xFF;
                return v === 0x09 || v === 0x0A || v === 0x0D || (v >= 0x20 && v <= 0x7E);
              };
              const isShiftJisLeadByte = (b) => {
                const v = Number(b) & 0xFF;
                return (v >= 0x81 && v <= 0x9F) || (v >= 0xE0 && v <= 0xEF);
              };
              const isShiftJisTrailByte = (b) => {
                const v = Number(b) & 0xFF;
                return (v >= 0x40 && v <= 0x7E) || (v >= 0x80 && v <= 0xFC);
              };
              const isLikelyShiftJisPairAt = (bytes, idx) => {
                if (!bytes || idx < 0 || (idx + 1) >= bytes.length) return false;
                const a = bytes[idx] & 0xFF;
                const b = bytes[idx + 1] & 0xFF;
                return isShiftJisLeadByte(a) && isShiftJisTrailByte(b);
              };

              const byteToChar = new Map();
              const multiByteChars = [];
              const multiByteTerminators = [];
              const multiByteStartMarkers = [];
              const specialChars = new Map();
              const startBytes = new Set();

              if (tableData) {
                  if (tableData.singleByte) {
                    for (const hex in tableData.singleByte) {
                      const byteVal = parseInt(hex, 10);
                      const rawChar = tableData.singleByte[hex];
                      const char = typeof rawChar === 'string' ? rawChar : String(rawChar ?? '');
                      const upperChar = char.toUpperCase();

                      if (upperChar === '[SPACE]') {
                        byteToChar.set(byteVal, ' ');
                      } else if (upperChar === '[LINE]' || upperChar === '[NEWLINE]' || char === '/') {
                        byteToChar.set(byteVal, '\\n');
                      } else if (upperChar === '[START]') {
                        startBytes.add(byteVal);
                      } else if (char.startsWith('[') && char.endsWith(']')) {
                        if (upperChar !== '[END]' && upperChar !== '[NULL]' && upperChar !== '[START]') {
                            byteToChar.set(byteVal, char);
                        }
                        if (upperChar === '[END]') {
                            specialChars.set(byteVal, char);
                        }
                      } else {
                        byteToChar.set(byteVal, char);
                      }
                    }
                  }
                  if (tableData.multiByte) {
                    for (const hexSeq in tableData.multiByte) {
                        const bytes = hexSeq.match(/.{1,2}/g).map(h => parseInt(h, 16));
                        const rawChar = tableData.multiByte[hexSeq];
                        const char = typeof rawChar === 'string' ? rawChar : String(rawChar ?? '');
                        const upperChar = char.toUpperCase();
                        if (upperChar === '[END]' || upperChar === '[NULL]') {
                            multiByteTerminators.push(new Uint8Array(bytes));
                            continue;
                        }
                        if (upperChar === '[START]') {
                            multiByteStartMarkers.push(new Uint8Array(bytes));
                            continue;
                        }
                        const isLine = upperChar === '[LINE]' || upperChar === '[NEWLINE]' || char === '/';
                        const normalizedChar = upperChar === '[SPACE]' ? ' ' : char;
                        multiByteChars.push({ bytes: new Uint8Array(bytes), char: normalizedChar, isLine });
                    }
                    multiByteChars.sort((a, b) => b.bytes.length - a.bytes.length);
                    multiByteTerminators.sort((a, b) => b.length - a.length);
                    multiByteStartMarkers.sort((a, b) => b.length - a.length);
                  }
              }

              const explicitSingleTerminators = new Set();
              specialChars.forEach((val, key) => {
                const upper = String(val || '').toUpperCase();
                if (upper === '[END]' || upper === '[NULL]') explicitSingleTerminators.add(key);
              });
              const terminatorBytes = new Set(system.terminator || []);
              explicitSingleTerminators.forEach(t => terminatorBytes.add(t));
              for (const [byteVal, mappedChar] of byteToChar.entries()) {
                if (mappedChar !== undefined && mappedChar !== null && mappedChar !== '') {
                  terminatorBytes.delete(byteVal);
                }
              }
              if (terminatorBytes.size === 0) {
                if (explicitSingleTerminators.size > 0) {
                  explicitSingleTerminators.forEach(t => terminatorBytes.add(t));
                } else if (Array.isArray(system.terminator)) {
                  for (const t of system.terminator) {
                    if (!byteToChar.has(t)) terminatorBytes.add(t);
                  }
                }
              }

              const decodeLz10 = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x10) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const flags = src[inPos++];
                  for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                    const compressed = (flags & (0x80 >> bit)) !== 0;
                    if (!compressed) {
                      if (inPos >= src.length) return null;
                      out[outPos++] = src[inPos++];
                    } else {
                      if (inPos + 1 >= src.length) return null;
                      const b1 = src[inPos++];
                      const b2 = src[inPos++];
                      const length = (b1 >> 4) + 3;
                      const disp = ((b1 & 0x0F) << 8) | b2;
                      let copyPos = outPos - (disp + 1);
                      if (copyPos < 0) return null;
                      for (let j = 0; j < length && outPos < outLen; j++) {
                        out[outPos++] = out[copyPos++];
                      }
                    }
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeLz11 = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x11) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const flags = src[inPos++];
                  for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                    const compressed = (flags & (0x80 >> bit)) !== 0;
                    if (!compressed) {
                      if (inPos >= src.length) return null;
                      out[outPos++] = src[inPos++];
                    } else {
                      if (inPos >= src.length) return null;
                      const b1 = src[inPos++];
                      let length = 0;
                      let disp = 0;
                      const hi = b1 >> 4;
                      if (hi === 0) {
                        if (inPos + 1 >= src.length) return null;
                        const b2 = src[inPos++];
                        const b3 = src[inPos++];
                        length = (((b1 & 0x0F) << 4) | (b2 >> 4)) + 0x11;
                        disp = ((b2 & 0x0F) << 8) | b3;
                      } else if (hi === 1) {
                        if (inPos + 2 >= src.length) return null;
                        const b2 = src[inPos++];
                        const b3 = src[inPos++];
                        const b4 = src[inPos++];
                        length = (((b1 & 0x0F) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111;
                        disp = ((b3 & 0x0F) << 8) | b4;
                      } else {
                        if (inPos >= src.length) return null;
                        const b2 = src[inPos++];
                        length = hi + 1;
                        disp = ((b1 & 0x0F) << 8) | b2;
                      }
                      let copyPos = outPos - (disp + 1);
                      if (copyPos < 0) return null;
                      for (let j = 0; j < length && outPos < outLen; j++) {
                        out[outPos++] = out[copyPos++];
                      }
                    }
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeGbaRle = (src, start, maxOut = 1024 * 1024) => {
                if (start + 4 > src.length || src[start] !== 0x30) return null;
                const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 4;
                let outPos = 0;
                while (outPos < outLen && inPos < src.length) {
                  const header = src[inPos++];
                  const runLen = (header & 0x7F) + 1;
                  if ((header & 0x80) !== 0) {
                    if (inPos >= src.length) return null;
                    const value = src[inPos++];
                    for (let i = 0; i < runLen && outPos < outLen; i++) out[outPos++] = value;
                  } else {
                    if (inPos + runLen > src.length) return null;
                    const copyLen = Math.min(runLen, outLen - outPos);
                    out.set(src.subarray(inPos, inPos + copyLen), outPos);
                    inPos += runLen;
                    outPos += copyLen;
                  }
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeYaz0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x7A || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                if (outLen <= 0 || outLen > maxOut) return null;
                const out = new Uint8Array(outLen);
                let inPos = start + 16;
                let outPos = 0;
                let code = 0;
                let validBits = 0;
                while (outPos < outLen && inPos < src.length) {
                  if (validBits === 0) {
                    code = src[inPos++];
                    validBits = 8;
                  }
                  if ((code & 0x80) !== 0) {
                    if (inPos >= src.length) return null;
                    out[outPos++] = src[inPos++];
                  } else {
                    if (inPos + 1 >= src.length) return null;
                    const b1 = src[inPos++];
                    const b2 = src[inPos++];
                    const dist = ((b1 & 0x0F) << 8) | b2;
                    let copyPos = outPos - (dist + 1);
                    if (copyPos < 0) return null;
                    let len = b1 >> 4;
                    if (len === 0) {
                      if (inPos >= src.length) return null;
                      len = src[inPos++] + 0x12;
                    } else {
                      len += 2;
                    }
                    for (let i = 0; i < len && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                  code = (code << 1) & 0xFF;
                  validBits--;
                }
                if (outPos !== outLen) return null;
                return { out, consumed: inPos - start };
              };

              const decodeMio0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x4D || src[start + 1] !== 0x49 || src[start + 2] !== 0x4F || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                const compOff =
                  ((src[start + 8] << 24) >>> 0) |
                  (src[start + 9] << 16) |
                  (src[start + 10] << 8) |
                  src[start + 11];
                const rawOff =
                  ((src[start + 12] << 24) >>> 0) |
                  (src[start + 13] << 16) |
                  (src[start + 14] << 8) |
                  src[start + 15];
                if (outLen <= 0 || outLen > maxOut) return null;
                if (compOff < 16 || rawOff < 16) return null;
                let layoutPos = start + 16;
                let compPos = start + compOff;
                let rawPos = start + rawOff;
                if (layoutPos >= src.length || compPos >= src.length || rawPos >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let layout = 0;
                let bitsLeft = 0;
                while (outPos < outLen) {
                  if (bitsLeft === 0) {
                    if (layoutPos >= src.length) return null;
                    layout = src[layoutPos++];
                    bitsLeft = 8;
                  }
                  const isRaw = (layout & 0x80) !== 0;
                  layout = (layout << 1) & 0xFF;
                  bitsLeft--;
                  if (isRaw) {
                    if (rawPos >= src.length) return null;
                    out[outPos++] = src[rawPos++];
                  } else {
                    if (compPos + 1 >= src.length) return null;
                    const b1 = src[compPos++];
                    const b2 = src[compPos++];
                    const length = (b1 >> 4) + 3;
                    const disp = ((b1 & 0x0F) << 8) | b2;
                    let copyPos = outPos - (disp + 1);
                    if (copyPos < 0) return null;
                    for (let i = 0; i < length && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                }
                return { out, consumed: Math.max(layoutPos, compPos, rawPos) - start };
              };

              const decodeYay0 = (src, start, maxOut = 8 * 1024 * 1024) => {
                if (start + 16 > src.length) return null;
                if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x79 || src[start + 3] !== 0x30) return null;
                const outLen =
                  ((src[start + 4] << 24) >>> 0) |
                  (src[start + 5] << 16) |
                  (src[start + 6] << 8) |
                  src[start + 7];
                const linkOff =
                  ((src[start + 8] << 24) >>> 0) |
                  (src[start + 9] << 16) |
                  (src[start + 10] << 8) |
                  src[start + 11];
                const rawOff =
                  ((src[start + 12] << 24) >>> 0) |
                  (src[start + 13] << 16) |
                  (src[start + 14] << 8) |
                  src[start + 15];
                if (outLen <= 0 || outLen > maxOut) return null;
                if (linkOff < 16 || rawOff < 16) return null;
                let maskPos = start + 16;
                let linkPos = start + linkOff;
                let rawPos = start + rawOff;
                if (maskPos >= src.length || linkPos >= src.length || rawPos >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let mask = 0;
                let bitsLeft = 0;
                while (outPos < outLen) {
                  if (bitsLeft === 0) {
                    if (maskPos + 3 >= src.length) return null;
                    mask = ((src[maskPos] << 24) >>> 0) | (src[maskPos + 1] << 16) | (src[maskPos + 2] << 8) | src[maskPos + 3];
                    maskPos += 4;
                    bitsLeft = 32;
                  }
                  const isRaw = (mask & 0x80000000) !== 0;
                  mask = (mask << 1) >>> 0;
                  bitsLeft--;
                  if (isRaw) {
                    if (rawPos >= src.length) return null;
                    out[outPos++] = src[rawPos++];
                  } else {
                    if (linkPos + 1 >= src.length) return null;
                    const b1 = src[linkPos++];
                    const b2 = src[linkPos++];
                    const disp = ((b1 & 0x0F) << 8) | b2;
                    let length = b1 >> 4;
                    if (length === 0) {
                      if (rawPos >= src.length) return null;
                      length = src[rawPos++] + 0x12;
                    } else {
                      length += 2;
                    }
                    let copyPos = outPos - (disp + 1);
                    if (copyPos < 0) return null;
                    for (let i = 0; i < length && outPos < outLen; i++) {
                      out[outPos++] = out[copyPos++];
                    }
                  }
                }
                return { out, consumed: Math.max(maskPos, linkPos, rawPos) - start };
              };

              const decodeGbaHuffman = (src, start, maxOut = 1024 * 1024) => {
                if (start + 6 > src.length) return null;
                const header = src[start] | (src[start + 1] << 8) | (src[start + 2] << 16) | (src[start + 3] << 24);
                const type = (header >> 4) & 0x0F;
                const bitsPerSymbol = header & 0x0F;
                const outLen = (header >>> 8);
                if (type !== 2 || (bitsPerSymbol !== 4 && bitsPerSymbol !== 8)) return null;
                if (outLen <= 0 || outLen > maxOut) return null;
                const treeSize = (src[start + 4] * 2) + 1;
                const treeBase = start + 5;
                const streamBase = treeBase + treeSize;
                if (treeSize <= 0 || streamBase >= src.length) return null;
                const out = new Uint8Array(outLen);
                let outPos = 0;
                let inPos = streamBase;
                let bitPool = 0;
                let bitsLeft = 0;
                let lowNibble = null;
                const readBit = () => {
                  if (bitsLeft === 0) {
                    if (inPos + 3 >= src.length) return null;
                    bitPool = ((src[inPos] << 24) >>> 0) | (src[inPos + 1] << 16) | (src[inPos + 2] << 8) | src[inPos + 3];
                    inPos += 4;
                    bitsLeft = 32;
                  }
                  const bit = (bitPool & 0x80000000) !== 0 ? 1 : 0;
                  bitPool = (bitPool << 1) >>> 0;
                  bitsLeft--;
                  return bit;
                };
                const readLeaf = () => {
                  let nodeIndex = 0;
                  while (true) {
                    if (nodeIndex < 0 || nodeIndex >= treeSize) return null;
                    const node = src[treeBase + nodeIndex];
                    const bit = readBit();
                    if (bit === null) return null;
                    const offset = node & 0x3F;
                    const childBase = (nodeIndex & 0xFE) + (offset * 2) + 2;
                    if (bit === 0) {
                      const leaf = (node & 0x80) !== 0;
                      const idx = childBase;
                      if (idx < 0 || idx >= treeSize) return null;
                      if (leaf) return src[treeBase + idx];
                      nodeIndex = idx;
                    } else {
                      const leaf = (node & 0x40) !== 0;
                      const idx = childBase + 1;
                      if (idx < 0 || idx >= treeSize) return null;
                      if (leaf) return src[treeBase + idx];
                      nodeIndex = idx;
                    }
                  }
                };
                while (outPos < outLen) {
                  const symbol = readLeaf();
                  if (symbol === null) return null;
                  if (bitsPerSymbol === 8) {
                    out[outPos++] = symbol & 0xFF;
                  } else {
                    const nibble = symbol & 0x0F;
                    if (lowNibble === null) {
                      lowNibble = nibble;
                    } else {
                      out[outPos++] = ((nibble & 0x0F) << 4) | (lowNibble & 0x0F);
                      lowNibble = null;
                    }
                  }
                }
                return { out, consumed: inPos - start };
              };

              const shouldTryLz10 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'lz10' || decompressionModeNormalized === 'gba_lz77' || decompressionModeNormalized === 'nintendo_lz';
              const shouldTryLz11 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'lz11' || decompressionModeNormalized === 'nintendo_lz';
              const shouldTryHuffman =
                decompressionModeNormalized === 'auto' ||
                decompressionModeNormalized === 'huffman' ||
                decompressionModeNormalized === 'huff' ||
                decompressionModeNormalized === 'huff4' ||
                decompressionModeNormalized === 'huff8' ||
                decompressionModeNormalized === 'nintendo_huff';
              const shouldTryRle = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'rle' || decompressionModeNormalized === 'gba_rle';
              const shouldTryYaz0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'yaz0';
              const shouldTryMio0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'mio0';
              const shouldTryYay0 = decompressionModeNormalized === 'auto' || decompressionModeNormalized === 'yay0';

              const buildSourceList = async () => {
                const sources = [{
                  bytes: romData,
                  sourceType: 'rom',
                  sourceTag: 'ROM',
                  sourceStart: 0,
                  buildable: true,
                  compressed: false
                }];
                if (!allowDecompression || decompressionModeNormalized === 'none') return sources;

                const maxBlocks = isRetroPipeline ? 64 : 96;
                const seen = new Set();
                let found = 0;
                const scanLimit = Math.max(0, romData.length - 4);
                for (let i = 0; i <= scanLimit && found < maxBlocks; i++) {
                  const sig = romData[i];
                  let decoded = null;
                  let sourceType = '';
                  if (sig === 0x10 && shouldTryLz10) {
                    decoded = decodeLz10(romData, i);
                    sourceType = 'cmp_lz10';
                  } else if (sig === 0x11 && shouldTryLz11) {
                    decoded = decodeLz11(romData, i);
                    sourceType = 'cmp_lz11';
                  } else if ((sig & 0xF0) === 0x20 && shouldTryHuffman) {
                    decoded = decodeGbaHuffman(romData, i);
                    sourceType = 'cmp_huffman';
                  } else if (sig === 0x30 && shouldTryRle) {
                    decoded = decodeGbaRle(romData, i);
                    sourceType = 'cmp_rle';
                  } else if (shouldTryYaz0 && i + 16 <= romData.length && romData[i] === 0x59 && romData[i + 1] === 0x61 && romData[i + 2] === 0x7A && romData[i + 3] === 0x30) {
                    decoded = decodeYaz0(romData, i);
                    sourceType = 'cmp_yaz0';
                  } else if (shouldTryMio0 && i + 16 <= romData.length && romData[i] === 0x4D && romData[i + 1] === 0x49 && romData[i + 2] === 0x4F && romData[i + 3] === 0x30) {
                    decoded = decodeMio0(romData, i);
                    sourceType = 'cmp_mio0';
                  } else if (shouldTryYay0 && i + 16 <= romData.length && romData[i] === 0x59 && romData[i + 1] === 0x61 && romData[i + 2] === 0x79 && romData[i + 3] === 0x30) {
                    decoded = decodeYay0(romData, i);
                    sourceType = 'cmp_yay0';
                  }
                  if (!decoded || !decoded.out || decoded.out.length < Math.max(16, effectiveMinLength)) continue;
                  const out = decoded.out;
                  const signature = sourceType + ':' + out.length + ':' + out[0] + ':' + out[Math.min(out.length - 1, 7)] + ':' + out[Math.min(out.length - 1, 31)];
                  if (seen.has(signature)) continue;
                  seen.add(signature);
                  sources.push({
                    bytes: out,
                    sourceType,
                    sourceTag: sourceType.toUpperCase() + '@0x' + i.toString(16).toUpperCase(),
                    sourceStart: i,
                    buildable: false,
                    compressed: true
                  });
                  found++;
                  if (decoded.consumed && decoded.consumed > 8) {
                    i += Math.max(0, Math.min(decoded.consumed, 4096) - 1);
                  }
                  if (i > 0 && (i % 262144) === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
                return sources;
              };

              self.postMessage({ type: 'progress', value: 5 });
              const uniqueTexts = new Map();

              const storeDecodedString = (sourceMeta, start, end, chars) => {
                  if (start === -1 || chars.length < effectiveMinLength) return;
                  const decodedText = chars.join('');
                  if (!decodedText) return;
                  const isBuildable = sourceMeta && sourceMeta.buildable === true;
                  let mapKey = decodedText;
                  if (!isBuildable) {
                    if (!includeCompressed) return;
                    if (uniqueTexts.has(decodedText)) return;
                    mapKey = decodedText + '@@' + sourceMeta.sourceTag + '@@' + start;
                  }
                  if (uniqueTexts.has(mapKey)) return;
                  uniqueTexts.set(mapKey, {
                    decodedText,
                    startByte: isBuildable ? start : null,
                    endByte: isBuildable ? end : null,
                    byteLength: (end - start) + 1,
                    sourceType: sourceMeta ? sourceMeta.sourceType : 'rom',
                    sourceTag: sourceMeta ? sourceMeta.sourceTag : 'ROM',
                    sourceStart: sourceMeta ? sourceMeta.sourceStart : 0,
                    relativeStart: start,
                    buildable: isBuildable,
                    compressed: sourceMeta ? !!sourceMeta.compressed : false
                  });
              };

              const sources = await buildSourceList();
              const totalSources = Math.max(1, sources.length);
              for (let s = 0; s < sources.length; s++) {
                const sourceMeta = sources[s];
                const sourceBytes = sourceMeta.bytes;
                const sourceLength = sourceBytes.length;
                let currentStringChars = [];
                let stringStartOffset = -1;
                let unknownGapCount = 0;

                const flushCurrent = (currentIndex) => {
                  const end = Math.max(stringStartOffset, currentIndex - 1);
                  storeDecodedString(sourceMeta, stringStartOffset, end, currentStringChars);
                  currentStringChars = [];
                  stringStartOffset = -1;
                  unknownGapCount = 0;
                };

                for (let i = 0; i < sourceLength; i++) {
                    if (i > 0 && i % 262144 === 0) {
                        const sourceProgressBase = 8 + Math.floor((s / totalSources) * 80);
                        const sourceProgressSpan = Math.max(1, Math.floor(80 / totalSources));
                        const localProgress = Math.floor((i / Math.max(1, sourceLength)) * sourceProgressSpan);
                        self.postMessage({ type: 'progress', value: Math.min(90, sourceProgressBase + localProgress) });
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }

                    if (multiByteStartMarkers.length > 0) {
                        let started = false;
                        for (const startToken of multiByteStartMarkers) {
                            if (i + startToken.length > sourceLength) continue;
                            let match = true;
                            for (let j = 0; j < startToken.length; j++) {
                                if (sourceBytes[i + j] !== startToken[j]) { match = false; break; }
                            }
                            if (match) {
                                flushCurrent(i);
                                i += startToken.length - 1;
                                started = true;
                                break;
                            }
                        }
                        if (started) continue;
                    }

                    if (multiByteTerminators.length > 0) {
                        let terminated = false;
                        for (const term of multiByteTerminators) {
                            if (i + term.length > sourceLength) continue;
                            let match = true;
                            for (let j = 0; j < term.length; j++) {
                                if (sourceBytes[i + j] !== term[j]) { match = false; break; }
                            }
                            if (match) {
                                flushCurrent(i);
                                i += term.length - 1;
                                terminated = true;
                                break;
                            }
                        }
                        if (terminated) continue;
                    }

                    const currentByte = sourceBytes[i];
                    if (startBytes.has(currentByte)) {
                        flushCurrent(i);
                        continue;
                    }
                    if (terminatorBytes.has(currentByte)) {
                        flushCurrent(i);
                        continue;
                    }

                    let charFound = false;
                    let advance = 1;

                    let matchedMultiByte = null;
                    for (const mb of multiByteChars) {
                        if (i + mb.bytes.length > sourceLength) continue;
                        let match = true;
                        for (let j = 0; j < mb.bytes.length; j++) { if (sourceBytes[i + j] !== mb.bytes[j]) { match = false; break; } }
                        if (match) { matchedMultiByte = mb; break; }
                    }

                    if (matchedMultiByte) {
                        if (stringStartOffset === -1) stringStartOffset = i;
                        if (matchedMultiByte.isLine) {
                          currentStringChars.push('\\n');
                        } else {
                          currentStringChars.push(matchedMultiByte.char);
                        }
                        advance = matchedMultiByte.bytes.length;
                        charFound = true;
                        unknownGapCount = 0;
                    } else {
                        const char = byteToChar.get(currentByte);
                        if (char !== undefined) {
                            if (stringStartOffset === -1) stringStartOffset = i;
                            currentStringChars.push(char);
                            charFound = true;
                            unknownGapCount = 0;
                            if (usePaddingByte && i + 1 < sourceLength && sourceBytes[i + 1] === PADDING_BYTE) {
                                advance = 2;
                            }
                        } else if (useAsciiFallback && currentByte >= 0x20 && currentByte <= 0x7E) {
                            if (stringStartOffset === -1) stringStartOffset = i;
                            currentStringChars.push(String.fromCharCode(currentByte));
                            charFound = true;
                            unknownGapCount = 0;
                            if (usePaddingByte && i + 1 < sourceLength && sourceBytes[i + 1] === PADDING_BYTE) {
                                advance = 2;
                            }
                        } else if (strictSceneBoundsMode) {
                            const likelySjisPair = isLikelyShiftJisPairAt(sourceBytes, i);
                            const likelyAscii = isAsciiStandardByte(currentByte);
                            if (likelySjisPair) {
                              if (stringStartOffset === -1) stringStartOffset = i;
                              currentStringChars.push(' ');
                              charFound = true;
                              unknownGapCount = 0;
                              advance = 2;
                            } else if (likelyAscii && useAsciiFallback) {
                              if (stringStartOffset === -1) stringStartOffset = i;
                              currentStringChars.push(String.fromCharCode(currentByte));
                              charFound = true;
                              unknownGapCount = 0;
                            } else {
                              flushCurrent(i);
                              charFound = false;
                            }
                        } else if (isRetroPipeline && stringStartOffset !== -1 && !terminatorBytes.has(currentByte)) {
                            unknownGapCount += 1;
                            const toleratedGap = strictMode ? 2 : 3;
                            if (unknownGapCount <= toleratedGap) {
                              charFound = true;
                            } else {
                              const endOffset = Math.max(stringStartOffset, i - unknownGapCount);
                              storeDecodedString(sourceMeta, stringStartOffset, endOffset, currentStringChars);
                              currentStringChars = [];
                              stringStartOffset = -1;
                              unknownGapCount = 0;
                              charFound = false;
                            }
                        }
                    }

                    if (charFound) {
                        i += advance - 1;
                        if(currentStringChars.length > maxLength) {
                          storeDecodedString(sourceMeta, stringStartOffset, i, currentStringChars);
                          currentStringChars = [];
                          stringStartOffset = -1;
                          unknownGapCount = 0;
                        }
                    } else {
                        flushCurrent(i);
                    }
                }
                storeDecodedString(sourceMeta, stringStartOffset, sourceLength - 1, currentStringChars);
              }

              self.postMessage({ type: 'progress', value: 95 });
              const retroQualityFilter = (decodedText) => {
                const value = String(decodedText || '');
                if (!isRetroPipeline) return true;
                if (value.length < effectiveMinLength) return false;
                if (/\b(the|you|your|king|queen|lord|press|start|yes|no)\b/i.test(value)) return true;
                const bracketTokenCount = (value.match(/\[[0-9A-F]{2}\]/g) || []).length;
                const bracketThreshold = strictMode ? 0.24 : 0.30;
                if (bracketTokenCount > 0 && (bracketTokenCount / Math.max(1, value.length / 4)) > bracketThreshold) return false;
                const allowedCount = (value.match(/[A-Za-z0-9\s.,!?"':;()\/\-]/g) || []).length;
                const allowedRatio = allowedCount / Math.max(1, value.length);
                const allowedThreshold = strictMode ? 0.58 : 0.52;
                if (allowedRatio < allowedThreshold) return false;
                const letterCount = (value.match(/[A-Za-z]/g) || []).length;
                const minLetters = strictMode ? 2 : 1;
                if (letterCount < minLetters && value.length >= 9) return false;
                return true;
              };
              const retroLanguageScore = (decodedText) => {
                const value = String(decodedText || '');
                if (!value) return 0;
                const lower = value.toLowerCase();
                const len = Math.max(1, value.length);
                const allowedCount = (value.match(/[A-Za-z0-9\\s.,!?\"':;()\\/\\-]/g) || []).length;
                const allowedRatio = allowedCount / len;
                const letterCount = (value.match(/[A-Za-z]/g) || []).length;
                const letterRatio = letterCount / len;
                const commonWords = ['the', 'you', 'your', 'king', 'queen', 'lord', 'soldier', 'soldiers', 'press', 'start', 'yes', 'no', 'item', 'magic', 'save', 'load'];
                const digraphs = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'st'];
                let score = 0;
                score += allowedRatio * 0.40;
                score += Math.min(1, letterRatio * 1.8) * 0.25;
                let wordHit = 0;
                for (const w of commonWords) {
                  if (lower.includes(w)) {
                    wordHit++;
                    if (wordHit >= 4) break;
                  }
                }
                score += Math.min(0.22, wordHit * 0.055);
                let digraphHit = 0;
                for (const dg of digraphs) {
                  if (lower.includes(dg)) {
                    digraphHit++;
                    if (digraphHit >= 5) break;
                  }
                }
                score += Math.min(0.12, digraphHit * 0.024);
                if (/[A-Za-z]{3,}/.test(value)) score += 0.06;
                if (/[\\[\\]{}<>]/.test(value) && (value.match(/[\\[\\]{}<>]/g) || []).length > Math.max(2, Math.floor(len * 0.15))) score -= 0.20;
                if (/([A-Za-z0-9])\\1{4,}/.test(value)) score -= 0.12;
                if (/\\b(aa|bb|cc|dd|ee|ff|gg)\\b/i.test(value)) score -= 0.06;
                return Math.max(0, Math.min(1, score));
              };
              const extractedEntries = Array.from(uniqueTexts.values());
              let filteredEntries = isRetroPipeline
                ? extractedEntries.filter((entry) => retroQualityFilter(entry.decodedText))
                : extractedEntries;
              const strictSceneBoundsFilter = (decodedText) => {
                if (!strictSceneBoundsMode) return true;
                const value = String(decodedText || '');
                if (value.length < effectiveMinLength) return false;
                const withoutControls = value.replace(/\\[[^\\]]+\\]/g, ' ').replace(/\\s+/g, ' ').trim();
                if (!withoutControls) return false;
                if (!strictAsciiRegex.test(withoutControls)) return false;
                const printableCount = (withoutControls.match(/[A-Za-z0-9\\s.,!?\"':;()\\-\\/]/g) || []).length;
                const printableRatio = printableCount / Math.max(1, withoutControls.length);
                if (printableRatio < 0.78) return false;
                const bracketHexCount = (value.match(/\\[[0-9A-F]{2,4}\\]/gi) || []).length;
                if (bracketHexCount > Math.max(2, Math.floor(value.length * 0.10))) return false;
                if (/(?:^|\\s)(?:[0-9A-F]{2}\\s+){8,}[0-9A-F]{2}(?:\\s|$)/i.test(withoutControls)) return false;
                const hasDialogCue = strictDialogCueRegex.test(value);
                const hasTitleNoise = strictTitleNoiseRegex.test(withoutControls);
                if (hasTitleNoise && !hasDialogCue) return false;
                if (!hasDialogCue) return false;
                return true;
              };
              if (strictSceneBoundsMode) {
                filteredEntries = filteredEntries.filter((entry) => strictSceneBoundsFilter(entry.decodedText));
              }
              if (isRetroPipeline) {
                const minimumKeep = Math.min(700, Math.max(220, Math.floor(extractedEntries.length * 0.20)));
                if (filteredEntries.length < minimumKeep) {
                  const scored = extractedEntries
                    .map((entry) => ({ entry, score: retroLanguageScore(entry.decodedText) }))
                    .filter((item) => item.score >= (strictMode ? 0.56 : 0.50))
                    .sort((a, b) => b.score - a.score);
                  const seenRescue = new Set(filteredEntries.map((entry) => String(entry.sourceTag || '') + '@@' + String(entry.relativeStart || 0) + '@@' + String(entry.decodedText || '')));
                  for (const item of scored) {
                    if (filteredEntries.length >= minimumKeep) break;
                    const key = String(item.entry.sourceTag || '') + '@@' + String(item.entry.relativeStart || 0) + '@@' + String(item.entry.decodedText || '');
                    if (seenRescue.has(key)) continue;
                    seenRescue.add(key);
                    filteredEntries.push(item.entry);
                  }
                }
              }
              const processedTexts = filteredEntries.map((entry, index) => {
                const decodedText = entry.decodedText;
                let textType = entry.buildable ? 'system-internal' : 'compressed';
                const wordCount = decodedText.split(/\s+/).filter(Boolean).length;
                if (entry.buildable && (decodedText.length > 35 || wordCount > 5 || /[.?!]/.test(decodedText) || decodedText.includes('\\n'))) textType = 'dialogue';
                else if (entry.buildable && (/\b(item|magic|save|load|exit|yes|no|ok|cancel|status|skill|attack|defend|potion|sword|shield|inn|shop)\b/i.test(decodedText) || (decodedText.length > 2 && decodedText === decodedText.toUpperCase()))) textType = 'menu';
                else if (entry.buildable && wordCount > 1 && decodedText.length > 8) textType = 'system';
                const offsetLabel = entry.buildable
                  ? ('0x' + entry.startByte.toString(16).toUpperCase().padStart(6, '0'))
                  : ('CMP:' + entry.sourceTag + '+0x' + Number(entry.relativeStart || 0).toString(16).toUpperCase());
                return {
                  id: index + 1,
                  originalText: decodedText,
                  translatedText: '',
                  textType,
                  startByte: entry.buildable ? entry.startByte : null,
                  byteLength: entry.byteLength,
                  offset: offsetLabel,
                  buildable: !!entry.buildable,
                  sourceType: entry.sourceType,
                  sourceTag: entry.sourceTag,
                  compressed: !!entry.compressed
                };
              }).sort((a, b) => {
                const aBuild = a.buildable ? 0 : 1;
                const bBuild = b.buildable ? 0 : 1;
                if (aBuild !== bBuild) return aBuild - bBuild;
                const aStart = Number.isFinite(a.startByte) ? a.startByte : Number.MAX_SAFE_INTEGER;
                const bStart = Number.isFinite(b.startByte) ? b.startByte : Number.MAX_SAFE_INTEGER;
                if (aStart !== bStart) return aStart - bStart;
                return String(a.offset || '').localeCompare(String(b.offset || ''));
              });

              const chunkSize = 2500;
              if (processedTexts.length === 0) {
                self.postMessage({ type: 'resultChunk', texts: [], done: true, totalTextCount: 0 });
              } else {
                for (let i = 0; i < processedTexts.length; i += chunkSize) {
                  const chunk = processedTexts.slice(i, i + chunkSize);
                  const done = (i + chunkSize) >= processedTexts.length;
                  self.postMessage({ type: 'resultChunk', texts: chunk, done, totalTextCount: processedTexts.length });
                  if (!done) await new Promise(resolve => setTimeout(resolve, 0));
                }
              }
            } catch (error) {
              self.postMessage({ type: 'error', message: error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createRelativeSearchWorker = () => {
      const workerCode = `
            self.onmessage = async function(e) {
                const { type, payload } = e.data;
                if (type !== 'relativeSearch') return;
                try {
                    const { romBuffer, query, hexQuery, mode, paddingMode, maxResults, queryBytes: tableQueryBytes, queryCandidates: tableQueryCandidates, systemName } = payload;
                    if (!romBuffer) throw new Error("ROM not loaded.");
                    const rom = new Uint8Array(romBuffer);
                    let queryBytes = [];
                    let hasHexWildcard = false;
                    if (mode === 'hex') {
                        if (!hexQuery || !hexQuery.trim()) throw new Error("Hex query is empty.");
                        const cleaned = hexQuery.replace(/0x/gi, '').replace(/[^0-9A-Fa-f?]/g, ' ').trim();
                        const parts = cleaned.split(/\\s+/).filter(Boolean);
                        for (const p of parts) {
                            if (p === '??') {
                                hasHexWildcard = true;
                                queryBytes.push(-1);
                                continue;
                            }
                            if (!/^[0-9A-Fa-f]{1,2}$/.test(p)) throw new Error("Invalid hex byte: " + p);
                            queryBytes.push(parseInt(p, 16));
                        }
                    } else {
                        if (Array.isArray(tableQueryBytes) && tableQueryBytes.length >= 2) {
                            queryBytes = tableQueryBytes.map(v => Number(v) & 0xFF);
                        } else {
                            if (!query || !query.trim()) throw new Error("Search text is empty.");
                            for (let i = 0; i < query.length; i++) queryBytes.push(query.charCodeAt(i) & 0xFF);
                        }
                    }
                    if (queryBytes.length < 2) throw new Error("Query must be at least 2 characters/bytes.");

                    const results = [];
                    let modeList = [paddingMode];
                    if (paddingMode === 'auto') {
                        if (systemName === 'GBA' || systemName === 'NDS' || systemName === 'Nintendo 3DS' || systemName === 'PlayStation Portable') {
                            modeList = ['none', 'le', 'be'];
                        } else {
                            modeList = ['none'];
                        }
                    }
                    const maxOut = Math.max(1, Math.min(500, maxResults || 200));
                    const isRetro8Bit = systemName === 'NES' || systemName === 'SNES' || systemName === 'Game Boy' || systemName === 'GBC';
                    const queryCandidates = [];
                    const queryCandidateSeen = new Set();
                    const pushNgramCandidates = (bytes, sourcePrefix) => {
                        if (!Array.isArray(bytes) || bytes.length < 3) return;
                        const maxGram = Math.min(8, bytes.length);
                        for (let gramLen = maxGram; gramLen >= 3; gramLen--) {
                            for (let s = 0; (s + gramLen) <= bytes.length; s++) {
                                if (queryCandidates.length >= 180) return;
                                const gram = bytes.slice(s, s + gramLen);
                                pushQueryCandidate(gram, (sourcePrefix || 'ngram') + ':' + s + ':' + gramLen);
                            }
                        }
                    };
                    const pushQueryCandidate = (bytes, source) => {
                        if (!Array.isArray(bytes) || bytes.length < 2) return;
                        const normalized = bytes.map(v => Number(v) & 0xFF);
                        const key = normalized.join(',');
                        if (queryCandidateSeen.has(key)) return;
                        queryCandidateSeen.add(key);
                        queryCandidates.push({ bytes: normalized, source: source || 'unknown' });
                    };
                    if (Array.isArray(tableQueryCandidates)) {
                        for (const candidate of tableQueryCandidates) {
                            if (!candidate) continue;
                            pushQueryCandidate(candidate.bytes, candidate.source || 'table');
                        }
                    }
                    if (queryCandidates.length === 0 && !(mode === 'hex' && hasHexWildcard)) {
                        pushQueryCandidate(queryBytes, (Array.isArray(tableQueryBytes) && tableQueryBytes.length >= 2) ? 'table' : 'ascii');
                    }
                    if (mode === 'text' && isRetro8Bit) {
                        const retroCharset = " 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const retroVariants = [];
                        const seenVariant = new Set();
                        const pushVariant = (text) => {
                            const value = String(text || '');
                            if (!value || seenVariant.has(value)) return;
                            seenVariant.add(value);
                            retroVariants.push(value);
                        };
                        const toTitleCaseWords = (value) => value.replace(/\\b([a-z])/g, (m, c) => c.toUpperCase());
                        pushVariant(query);
                        pushVariant(query.toLowerCase());
                        pushVariant(query.toUpperCase());
                        if (query.length > 0) {
                            pushVariant(query.charAt(0).toUpperCase() + query.slice(1).toLowerCase());
                            pushVariant(toTitleCaseWords(query.toLowerCase()));
                        }
                        if (query.includes(' ')) {
                            const words = query.split(/\\s+/).filter(w => w && w.length >= 3);
                            for (const word of words) {
                                pushVariant(word);
                                pushVariant(word.toLowerCase());
                                pushVariant(word.toUpperCase());
                                pushVariant(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
                            }
                        }
                        for (const variant of retroVariants) {
                            const retroBytes = [];
                            let retroValid = true;
                            for (let i = 0; i < variant.length; i++) {
                                const idx = retroCharset.indexOf(variant[i]);
                                if (idx < 0) { retroValid = false; break; }
                                retroBytes.push(idx & 0xFF);
                            }
                            if (retroValid && retroBytes.length >= 2) {
                                pushQueryCandidate(retroBytes, 'retro:' + variant);
                                if (retroBytes.length >= 4) pushNgramCandidates(retroBytes, 'retro-ngram');
                            }
                        }
                    }
                    if (mode === 'text') {
                        if (Array.isArray(tableQueryBytes) && tableQueryBytes.length >= 4) {
                            pushNgramCandidates(tableQueryBytes.map(v => Number(v) & 0xFF), 'table-ngram');
                        }
                        if (queryBytes.length >= 4) {
                            pushNgramCandidates(queryBytes, 'ascii-ngram');
                        }
                    }
                    const scoreHit = (offset, modeId) => {
                        const step = modeId === 'none' ? 1 : 2;
                        const windowChars = isRetro8Bit ? 48 : 32;
                        let score = 0;
                        for (let i = 0; i < windowChars; i++) {
                            const p = offset + (i * step);
                            if (p < 0 || p >= rom.length) break;
                            const b = rom[p];
                            if (isRetro8Bit) {
                                if (b <= 0x7F) score += 1;
                                else score -= 1;
                                if (b === 0x00 || b === 0x3F || b === 0x50 || b === 0xFE || b === 0xFF) score += 0.5;
                            } else {
                                if (b >= 0x20 && b <= 0x7E) score += 1;
                            }
                        }
                        return score;
                    };
                    if (mode === 'hex' && hasHexWildcard) {
                        const wildcardResults = [];
                        for (const m of modeList) {
                            const step = m === 'none' ? 1 : 2;
                            const parities = m === 'none' ? [0] : [0, 1];
                            for (const parity of parities) {
                                for (let romOffset = parity; romOffset + ((queryBytes.length - 1) * step) < rom.length; romOffset += step) {
                                    let ok = true;
                                    for (let k = 0; k < queryBytes.length; k++) {
                                        const pos = romOffset + (k * step);
                                        const expected = queryBytes[k];
                                        if (expected >= 0 && rom[pos] !== expected) { ok = false; break; }
                                        if (m === 'le') {
                                            const pad = pos + 1;
                                            if (pad >= rom.length || rom[pad] !== 0x00) { ok = false; break; }
                                        } else if (m === 'be') {
                                            const pad = pos - 1;
                                            if (pad < 0 || rom[pad] !== 0x00) { ok = false; break; }
                                        }
                                    }
                                    if (!ok) continue;
                                    wildcardResults.push({
                                        offset: romOffset,
                                        mode: m,
                                        parity,
                                        offsetGuess: 0,
                                        score: scoreHit(romOffset, m) + 2,
                                        source: 'hex-wildcard'
                                    });
                                    if (wildcardResults.length >= maxOut) break;
                                }
                                if (wildcardResults.length >= maxOut) break;
                            }
                            if (wildcardResults.length >= maxOut) break;
                        }
                        const bestWildcard = new Map();
                        for (const item of wildcardResults) {
                            const key = item.mode + ':' + item.offset;
                            const prev = bestWildcard.get(key);
                            if (!prev || item.score > prev.score) bestWildcard.set(key, item);
                        }
                        const rankedWildcard = Array.from(bestWildcard.values())
                          .sort((a, b) => ((b.score || 0) - (a.score || 0)) || (a.offset - b.offset))
                          .slice(0, maxOut)
                          .map(({ score, ...rest }) => rest);
                        self.postMessage({ type: 'relativeSearchResult', results: rankedWildcard, patternLength: Math.max(0, queryBytes.length - 1), queryLength: queryBytes.length });
                        return;
                    }

                    const buildCharStream = (parity, step) => {
                        const len = Math.floor((rom.length - parity + step - 1) / step);
                        const stream = new Uint8Array(len);
                        let idx = 0;
                        for (let i = parity; i < rom.length; i += step) {
                            stream[idx++] = rom[i];
                        }
                        return stream;
                    };

                    const buildDeltaStream = (stream) => {
                        if (stream.length < 2) return new Uint8Array(0);
                        const deltas = new Uint8Array(stream.length - 1);
                        for (let i = 0; i < deltas.length; i++) {
                            deltas[i] = (stream[i + 1] - stream[i]) & 0xFF;
                        }
                        return deltas;
                    };

                    const searchPattern = (deltas, pat) => {
                        const m = pat.length;
                        const n = deltas.length;
                        const skip = new Array(256).fill(m);
                        for (let i = 0; i < m - 1; i++) skip[pat[i]] = m - 1 - i;
                        const hits = [];
                        let i = 0;
                        while (i <= n - m) {
                            let j = m - 1;
                            while (j >= 0 && pat[j] === deltas[i + j]) j--;
                            if (j < 0) {
                                hits.push(i);
                                i += m;
                            } else {
                                i += skip[deltas[i + m - 1]] || 1;
                            }
                            if (hits.length >= maxOut) break;
                        }
                        return hits;
                    };
                    const searchExactPattern = (data, pat) => {
                        const m = pat.length;
                        const n = data.length;
                        const skip = new Array(256).fill(m);
                        for (let i = 0; i < m - 1; i++) skip[pat[i]] = m - 1 - i;
                        const hits = [];
                        let i = 0;
                        while (i <= n - m) {
                            let j = m - 1;
                            while (j >= 0 && pat[j] === data[i + j]) j--;
                            if (j < 0) {
                                hits.push(i);
                                i += m;
                            } else {
                                i += skip[data[i + m - 1]] || 1;
                            }
                            if (hits.length >= maxOut) break;
                        }
                        return hits;
                    };
                    const searchLoosePattern = (data, pat, maxGap, maxHits) => {
                        const n = data.length;
                        const m = pat.length;
                        const hits = [];
                        if (m < 2 || n < m) return hits;
                        const allowedGap = Math.max(0, Math.min(3, Number(maxGap) || 1));
                        const guardControl = new Set([0x00, 0x0A, 0x0D, 0xFF, 0xFE, 0xFD, 0xFC]);
                        for (let i = 0; i < n; i++) {
                            if (data[i] !== pat[0]) continue;
                            let pos = i + 1;
                            let ok = true;
                            for (let k = 1; k < m; k++) {
                                let found = false;
                                for (let gap = 0; gap <= allowedGap; gap++) {
                                    const p = pos + gap;
                                    if (p >= n) break;
                                    const byte = data[p];
                                    if (byte === pat[k]) {
                                        pos = p + 1;
                                        found = true;
                                        break;
                                    }
                                    if (!guardControl.has(byte)) continue;
                                }
                                if (!found) { ok = false; break; }
                            }
                            if (!ok) continue;
                            hits.push(i);
                            if (hits.length >= maxHits) break;
                        }
                        return hits;
                    };

                    for (const candidate of queryCandidates) {
                        const candidateBytes = candidate.bytes;
                        const pattern = new Uint8Array(candidateBytes.length - 1);
                        for (let i = 0; i < pattern.length; i++) {
                            pattern[i] = (candidateBytes[i + 1] - candidateBytes[i]) & 0xFF;
                        }
                        for (const m of modeList) {
                            if (m === 'none') {
                                const exactHits = searchExactPattern(rom, candidateBytes);
                                for (const exactOffset of exactHits) {
                                    const charByte = rom[exactOffset];
                                    const offsetGuess = ((charByte - candidateBytes[0]) & 0xFF);
                                    const signedOffset = offsetGuess > 127 ? offsetGuess - 256 : offsetGuess;
                                    const score = scoreHit(exactOffset, m) + 6;
                                    results.push({ offset: exactOffset, mode: m, parity: 0, offsetGuess: signedOffset, score, source: candidate.source + ':exact' });
                                    if (results.length >= maxOut) break;
                                }
                                if (results.length >= maxOut) break;
                            }
                            const step = m === 'none' ? 1 : 2;
                            const parities = m === 'none' ? [0] : [0, 1];
                            for (const parity of parities) {
                                const charStream = buildCharStream(parity, step);
                                const deltas = buildDeltaStream(charStream);
                                if (deltas.length < pattern.length) continue;
                                const hits = searchPattern(deltas, pattern);
                                for (const hit of hits) {
                                    const romOffset = parity + hit * step;
                                    let ok = true;
                                    if (m === 'le') {
                                        for (let k = 0; k < candidateBytes.length; k++) {
                                            const pad = romOffset + k * 2 + 1;
                                            if (pad >= rom.length || rom[pad] !== 0x00) { ok = false; break; }
                                        }
                                    } else if (m === 'be') {
                                        for (let k = 0; k < candidateBytes.length; k++) {
                                            const pad = romOffset + k * 2 - 1;
                                            if (pad < 0 || rom[pad] !== 0x00) { ok = false; break; }
                                        }
                                    }
                                    if (!ok) continue;
                                    const charByte = rom[romOffset];
                                    const offsetGuess = ((charByte - candidateBytes[0]) & 0xFF);
                                    const signedOffset = offsetGuess > 127 ? offsetGuess - 256 : offsetGuess;
                                    const score = scoreHit(romOffset, m);
                                    results.push({ offset: romOffset, mode: m, parity, offsetGuess: signedOffset, score, source: candidate.source });
                                    if (results.length >= maxOut) break;
                                }
                                if (results.length >= maxOut) break;
                            }
                            if (results.length >= maxOut) break;
                        }
                        if (results.length >= maxOut) break;
                    }
                    if (results.length === 0 && mode === 'text' && isRetro8Bit) {
                        const fallbackCandidates = queryCandidates
                            .filter(c => Array.isArray(c.bytes) && c.bytes.length >= 3)
                            .sort((a, b) => b.bytes.length - a.bytes.length)
                            .slice(0, 24);
                        for (const candidate of fallbackCandidates) {
                            const looseHits = searchLoosePattern(rom, candidate.bytes, 2, Math.max(8, Math.min(64, Math.floor(maxOut / 2))));
                            for (const hit of looseHits) {
                                const charByte = rom[hit];
                                const offsetGuess = ((charByte - candidate.bytes[0]) & 0xFF);
                                const signedOffset = offsetGuess > 127 ? offsetGuess - 256 : offsetGuess;
                                const score = scoreHit(hit, 'none') - 1.5;
                                results.push({ offset: hit, mode: 'none', parity: 0, offsetGuess: signedOffset, score, source: (candidate.source || 'fallback') + ':loose' });
                                if (results.length >= maxOut) break;
                            }
                            if (results.length >= maxOut) break;
                        }
                    }

                    const bestByKey = new Map();
                    for (const r of results) {
                        const key = r.mode + ':' + r.offsetGuess + ':' + r.offset;
                        const prev = bestByKey.get(key);
                        if (!prev || (r.score || 0) > (prev.score || 0)) bestByKey.set(key, r);
                    }
                    const ranked = Array.from(bestByKey.values())
                      .sort((a, b) => ((b.score || 0) - (a.score || 0)) || (a.offset - b.offset))
                      .slice(0, maxOut)
                      .map(({ score, ...rest }) => rest);
                    self.postMessage({ type: 'relativeSearchResult', results: ranked, patternLength: Math.max(0, queryBytes.length - 1), queryLength: queryBytes.length });
                } catch (error) {
                    self.postMessage({ type: 'error', message: 'Generate table search failed: ' + error.message, stack: error.stack });
                }
            };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createHexWorker = () => {
      const workerCode = `
          const toHex = (v, width = 2) => v.toString(16).toUpperCase().padStart(width, '0');
          const parseHexPattern = (query) => {
            if (!query || !query.trim()) return null;
            let cleaned = query.replace(/0x/gi, '').replace(/[^0-9A-Fa-f?]/g, ' ').trim();
            if (!cleaned) return null;
            let parts = cleaned.split(/\\s+/).filter(Boolean);
            if (parts.length === 1 && parts[0].length > 2 && parts[0].length % 2 === 0 && !parts[0].includes('?')) {
              parts = parts[0].match(/.{1,2}/g) || [];
            }
            const bytes = [];
            const mask = [];
            for (const partRaw of parts) {
              const part = partRaw.toUpperCase();
              if (part === '??') {
                bytes.push(0);
                mask.push(false);
              } else if (/^[0-9A-F]{2}$/.test(part)) {
                bytes.push(parseInt(part, 16));
                mask.push(true);
              } else {
                throw new Error("Invalid hex pattern token: " + partRaw);
              }
            }
            if (bytes.length === 0) return null;
            return { bytes, mask };
          };
          const searchPattern = (data, start, end, pattern, maxMatches) => {
            if (!pattern || !pattern.bytes || pattern.bytes.length === 0) return [];
            const out = [];
            const { bytes, mask } = pattern;
            for (let i = start; i <= end - bytes.length; i++) {
              let ok = true;
              for (let j = 0; j < bytes.length; j++) {
                if (mask[j] && data[i + j] !== bytes[j]) {
                  ok = false;
                  break;
                }
              }
              if (ok) {
                out.push(i);
                if (out.length >= maxMatches) break;
              }
            }
            return out;
          };
          self.onmessage = async (e) => {
            const { type, payload } = e.data;
            if (type !== 'hexView') return;
            try {
              const {
                romBuffer,
                start = 0,
                length = 4096,
                columns = 16,
                rowLimit = 1024,
                searchHex = '',
                maxMatches = 500
              } = payload || {};
              if (!romBuffer) throw new Error('ROM not loaded.');
              const rom = new Uint8Array(romBuffer);
              const safeColumns = Math.max(8, Math.min(32, Number(columns) || 16));
              const safeRows = Math.max(128, Math.min(8192, Number(rowLimit) || 1024));
              const requestedLength = Math.max(256, Number(length) || 4096);
              const safeStart = Math.max(0, Math.min(rom.length - 1, Number(start) || 0));
              const windowByRows = safeRows * safeColumns;
              const windowLength = Math.max(256, Math.min(0x20000, requestedLength, windowByRows));
              const end = Math.min(rom.length, safeStart + windowLength);
              const rows = [];
              for (let off = safeStart; off < end; off += safeColumns) {
                const rowEnd = Math.min(off + safeColumns, end);
                const slice = rom.slice(off, rowEnd);
                const hexParts = [];
                let ascii = '';
                for (let i = 0; i < slice.length; i++) {
                  const b = slice[i];
                  hexParts.push(toHex(b));
                  ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
                }
                rows.push({
                  offset: off,
                  bytes: Array.from(slice),
                  hex: hexParts.join(' '),
                  ascii,
                  length: slice.length
                });
                if (rows.length >= safeRows) break;
                if (rows.length % 256 === 0) {
                  const ratio = (off - safeStart) / Math.max(1, (end - safeStart));
                  self.postMessage({ type: 'progress', value: 5 + Math.floor(ratio * 90) });
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
              }
              let matches = [];
              const pattern = parseHexPattern(searchHex);
              const matchLength = pattern && pattern.bytes ? pattern.bytes.length : 1;
              if (pattern) {
                matches = searchPattern(rom, safeStart, end, pattern, Math.max(1, Math.min(2000, Number(maxMatches) || 500)));
              }
              const renderedBytes = rows.reduce((sum, row) => sum + (row.length || 0), 0);
              const maxReachable = Math.min(requestedLength, Math.max(0, rom.length - safeStart));
              const truncated = renderedBytes < maxReachable;
              self.postMessage({
                type: 'hexResult',
                rows,
                matches,
                start: safeStart,
                end: safeStart + renderedBytes,
                total: rom.length,
                columns: safeColumns,
                rowLimit: safeRows,
                requestedLength,
                truncated,
                searched: !!pattern,
                matchLength
              });
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Hex worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createTranslationInputWorker = () => {
      const workerCode = `
          const pending = new Map();
          const clearPending = (id) => {
            const entry = pending.get(id);
            if (entry && entry.timer) clearTimeout(entry.timer);
            pending.delete(id);
          };
          const commit = (id, value) => {
            clearPending(id);
            self.postMessage({
              type: 'translationInputCommit',
              textId: id,
              newTranslation: String(value || '')
            });
          };
          self.onmessage = (e) => {
            const { type, payload } = e.data || {};
            const textId = Number(payload?.textId);
            const value = String(payload?.newTranslation || '');
            if (!Number.isFinite(textId)) return;
            if (type === 'flushTranslationUpdate') {
              commit(textId, value);
              return;
            }
            if (type === 'cancelTranslationUpdates') {
              if (Number.isFinite(textId)) clearPending(textId);
              return;
            }
            if (type !== 'queueTranslationUpdate') return;
            const delayMs = Math.max(40, Math.min(1200, Number(payload?.delayMs) || 180));
            clearPending(textId);
            const timer = setTimeout(() => commit(textId, value), delayMs);
            pending.set(textId, { timer });
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createSearchWorker = () => {
      const workerCode = `
          const indexRows = [];
          const idToPos = new Map();
          const normalizeSearchable = (value) => String(value || '')
            .replace(/\\[[^\\]]+\\]/g, ' ')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .replace(/\\s+/g, ' ')
            .trim()
            .toLowerCase();

          const buildRow = (item) => {
            const id = Number(item?.id);
            const originalText = String(item?.originalText || '');
            const translatedText = String(item?.translatedText || '');
            const offset = String(item?.offset || '');
            return {
              id,
              originalLower: originalText.toLowerCase(),
              translatedLower: translatedText.toLowerCase(),
              offsetLower: offset.toLowerCase(),
              originalNorm: normalizeSearchable(originalText),
              translatedNorm: normalizeSearchable(translatedText)
            };
          };

          const initIndex = (items) => {
            indexRows.length = 0;
            idToPos.clear();
            const list = Array.isArray(items) ? items : [];
            for (let i = 0; i < list.length; i++) {
              const row = buildRow(list[i]);
              if (!Number.isFinite(row.id)) continue;
              idToPos.set(row.id, indexRows.length);
              indexRows.push(row);
            }
            self.postMessage({ type: 'searchIndexReady', total: indexRows.length });
          };

          const updateTranslation = (textId, translatedText) => {
            const id = Number(textId);
            if (!Number.isFinite(id)) return;
            const pos = idToPos.get(id);
            if (!Number.isFinite(pos)) return;
            const safeText = String(translatedText || '');
            const row = indexRows[pos];
            row.translatedLower = safeText.toLowerCase();
            row.translatedNorm = normalizeSearchable(safeText);
          };

          const runSearch = (term, requestId) => {
            const rawTerm = String(term || '').trim();
            if (!rawTerm) {
              self.postMessage({ type: 'searchResult', requestId, matchedIds: [] });
              return;
            }
            const lowerTerm = rawTerm.toLowerCase();
            const normalizedTerm = normalizeSearchable(rawTerm);
            const matchedIds = [];
            for (let i = 0; i < indexRows.length; i++) {
              const row = indexRows[i];
              let hit = false;
              if (row.originalLower.includes(lowerTerm) || row.translatedLower.includes(lowerTerm) || row.offsetLower.includes(lowerTerm)) {
                hit = true;
              } else if (normalizedTerm && (row.originalNorm.includes(normalizedTerm) || row.translatedNorm.includes(normalizedTerm))) {
                hit = true;
              }
              if (hit) matchedIds.push(row.id);
            }
            self.postMessage({ type: 'searchResult', requestId, matchedIds });
          };

          self.onmessage = (e) => {
            const { type, payload } = e.data || {};
            if (type === 'initSearchIndex') {
              initIndex(payload?.items || []);
              return;
            }
            if (type === 'updateSearchTranslation') {
              updateTranslation(payload?.textId, payload?.translatedText);
              return;
            }
            if (type === 'runSearch') {
              runSearch(payload?.term || '', Number(payload?.requestId) || 0);
              return;
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createScenePreviewWorker = () => {
      const workerCode = `
          const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
          const state = {
            rom: null,
            romLength: 0,
            system: 'Unknown',
            bpp: 4,
            bytesPerTile: 32,
            decodeVariant: 'default',
            fontOffset: 0,
            fontScore: 0,
            codeBias: 0,
            codeValueMode: 'auto',
            charToCode: new Map(),
            tileCache: new Map(),
            codeToTileIndexCache: new Map(),
            tileResolveMode: 'heuristic',
            sceneBackground: null
          };

          const normalize = (text) => String(text || '')
            .replace(/\\r\\n/g, '\\n')
            .replace(/\\r/g, '\\n')
            .replace(/\\[LINE\\]/gi, '\\n')
            .replace(/\\//g, '\\n')
            .replace(/\\[[^\\]]+\\]/g, ' ');

          const inferBpp = (systemName, requestedBpp) => {
            const req = Number(requestedBpp);
            if (req === 1 || req === 2 || req === 4 || req === 8) return req;
            const s = String(systemName || '').toUpperCase();
            const isGbaLike = s.includes('GBA') || s.includes('GAME BOY ADVANCE') || s.includes('ADVANCE GAME BOY') || s.includes('AGB');
            if (isGbaLike || s.includes('SNES') || s.includes('NDS') || s.includes('PLAYSTATION') || s.includes('GENESIS')) return 4;
            if (s.includes('NES') || s.includes('GAME BOY') || s.includes('GBC') || s === 'GB') return 2;
            return 2;
          };

          const bytesPerTileForBpp = (bpp) => {
            const n = Number(bpp);
            if (n === 1) return 8;
            if (n === 2) return 16;
            if (n === 4) return 32;
            if (n === 8) return 64;
            return 32;
          };

          const normalizeVariantForBpp = (bpp, variantRaw) => {
            const variant = String(variantRaw || 'auto').toLowerCase();
            if (variant === 'auto') return 'auto';
            if (bpp === 4) return variant === 'swapped' ? 'swapped' : 'default';
            if (bpp === 2) return variant === 'linear' ? 'linear' : 'default';
            return 'default';
          };

          const extractCodeFromMultiHex = (hexKey) => {
            const key = String(hexKey || '').toUpperCase().replace(/[^0-9A-F]/g, '');
            if (!key || (key.length % 2) !== 0) return null;
            if (key.length === 2) return parseInt(key, 16) & 0xFF;
            const bytes = [];
            for (let i = 0; i < key.length; i += 2) bytes.push(parseInt(key.slice(i, i + 2), 16));
            const nonZero = bytes.filter((b) => b !== 0x00);
            if (nonZero.length === 1) return nonZero[0] & 0xFF;
            if (bytes.length === 2) {
              const hi = bytes[0] & 0xFF;
              const lo = bytes[1] & 0xFF;
              if (hi === 0x00 && lo !== 0x00) return lo;
              if (lo === 0x00 && hi !== 0x00) return hi;
              if ((hi >= 0x80 && hi <= 0x9F) || hi >= 0xE0) return lo;
              return lo;
            }
            return bytes[bytes.length - 1] & 0xFF;
          };

          const buildCharToCode = (singleByteMap, multiByteMap) => {
            const map = new Map();
            const entries = Object.entries(singleByteMap || {});
            for (let i = 0; i < entries.length; i++) {
              const rawCode = Number(entries[i][0]);
              const token = String(entries[i][1] || '');
              if (!Number.isFinite(rawCode)) continue;
              if (token.length === 1) map.set(token, rawCode);
              if (token === ' ' || token.toUpperCase() === '[SPACE]') map.set(' ', rawCode);
            }
            const multiEntries = Object.entries(multiByteMap || {});
            for (let i = 0; i < multiEntries.length; i++) {
              const token = String(multiEntries[i][1] || '');
              if (!token) continue;
              const code = extractCodeFromMultiHex(multiEntries[i][0]);
              if (!Number.isFinite(code)) continue;
              if (token.length === 1 && !map.has(token)) map.set(token, code);
              if ((token === ' ' || token.toUpperCase() === '[SPACE]') && !map.has(' ')) map.set(' ', code);
            }
            return map;
          };

          const detectCodeValueMode = (charMap) => {
            if (!(charMap instanceof Map) || charMap.size === 0) return 'auto';
            let total = 0;
            let multi = 0;
            charMap.forEach((value, key) => {
              if (typeof key !== 'string' || key.length !== 1) return;
              if (key === ' ' || key === '\\n' || key === '\\r') return;
              const n = Math.floor(Number(value));
              if (!Number.isFinite(n) || n < 0) return;
              total++;
              if (n > 0xFF) multi++;
            });
            if (total <= 0) return 'auto';
            return (multi / total) >= 0.25 ? 'low-byte' : 'full';
          };

          const decodeTile2bpp = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 16) > rom.length) return out;
            for (let y = 0; y < 8; y++) {
              const lo = rom[offset + y] || 0;
              const hi = rom[offset + 8 + y] || 0;
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                const v = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
                out[y * 8 + x] = v;
              }
            }
            return out;
          };

          const decodeTile2bppLinear = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 16) > rom.length) return out;
            let p = 0;
            for (let i = 0; i < 16; i++) {
              const b = rom[offset + i] || 0;
              out[p++] = (b >> 6) & 0x03;
              out[p++] = (b >> 4) & 0x03;
              out[p++] = (b >> 2) & 0x03;
              out[p++] = b & 0x03;
            }
            return out;
          };

          const decodeTile1bpp = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 8) > rom.length) return out;
            for (let y = 0; y < 8; y++) {
              const row = rom[offset + y] || 0;
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                out[(y * 8) + x] = (row >> bit) & 1;
              }
            }
            return out;
          };

          const decodeTile4bpp = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 32) > rom.length) return out;
            let p = 0;
            for (let i = 0; i < 32; i++) {
              const b = rom[offset + i] || 0;
              out[p++] = b & 0x0F;
              out[p++] = (b >> 4) & 0x0F;
            }
            return out;
          };

          const decodeTile4bppSwapped = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 32) > rom.length) return out;
            let p = 0;
            for (let i = 0; i < 32; i++) {
              const b = rom[offset + i] || 0;
              out[p++] = (b >> 4) & 0x0F;
              out[p++] = b & 0x0F;
            }
            return out;
          };

          const decodeTile8bpp = (rom, offset) => {
            const out = new Uint8Array(64);
            if (!rom || offset < 0 || (offset + 64) > rom.length) return out;
            for (let i = 0; i < 64; i++) out[i] = rom[offset + i] || 0;
            return out;
          };

          const decodeTileAtIndex = (tileIndex) => {
            const idx = Math.floor(Number(tileIndex));
            if (!Number.isFinite(idx) || idx < 0) return new Uint8Array(64);
            const cacheKey = (state.decodeVariant || 'default') + ':' + (Number(state.codeBias) || 0) + ':' + idx;
            if (state.tileCache.has(cacheKey)) return state.tileCache.get(cacheKey);
            const tileOffset = state.fontOffset + (idx * state.bytesPerTile);
            let tile;
            if (state.bpp === 1) tile = decodeTile1bpp(state.rom, tileOffset);
            else if (state.bpp === 2) tile = state.decodeVariant === 'linear' ? decodeTile2bppLinear(state.rom, tileOffset) : decodeTile2bpp(state.rom, tileOffset);
            else if (state.bpp === 8) tile = decodeTile8bpp(state.rom, tileOffset);
            else tile = state.decodeVariant === 'swapped' ? decodeTile4bppSwapped(state.rom, tileOffset) : decodeTile4bpp(state.rom, tileOffset);
            state.tileCache.set(cacheKey, tile);
            return tile;
          };

          const toTileIndex = (code) => {
            const numeric = Math.floor(Number(code));
            if (!Number.isFinite(numeric) || numeric < 0) return -1;
            const shifted = numeric - (Number(state.codeBias) || 0);
            if (Number.isFinite(shifted) && shifted >= 0) return shifted;
            return numeric;
          };

          const resolveTileIndex = (code) => {
            const numeric = Math.floor(Number(code));
            if (!Number.isFinite(numeric) || numeric < 0) return -1;
            const cacheKey = String(numeric);
            const cached = state.codeToTileIndexCache.get(cacheKey);
            if (Number.isFinite(cached) && cached >= 0) return cached;
            const candidates = [];
            const pushCandidate = (value, applyBias = true) => {
              const raw = Math.floor(Number(value));
              if (!Number.isFinite(raw) || raw < 0) return;
              const idx = applyBias ? toTileIndex(raw) : raw;
              if (!Number.isFinite(idx) || idx < 0) return;
              if (!candidates.includes(idx)) candidates.push(idx);
            };
            const directMode = state.tileResolveMode === 'direct';
            const tileMax = Math.floor(Math.max(0, (state.romLength - state.fontOffset) / Math.max(1, state.bytesPerTile)));
            const directIdxWithBias = toTileIndex(numeric);
            const directIdxRaw = Math.floor(Number(numeric));
            const fullIndexValid =
              (Number.isFinite(directIdxWithBias) && directIdxWithBias >= 0 && directIdxWithBias < tileMax) ||
              (Number.isFinite(directIdxRaw) && directIdxRaw >= 0 && directIdxRaw < tileMax);
            const forceLowByteMode = state.codeValueMode === 'low-byte';
            const preferByteCodes = directMode && numeric > 0xFF && (forceLowByteMode || !fullIndexValid);
            if (!preferByteCodes) {
              pushCandidate(numeric, true);
              pushCandidate(numeric, false);
            }
            if (numeric > 0xFF) {
              const low = numeric & 0xFF;
              const hi = (numeric >>> 8) & 0xFF;
              const hi2 = (numeric >>> 16) & 0xFF;
              pushCandidate(low, true);
              pushCandidate(low, false);
              pushCandidate(hi, true);
              pushCandidate(hi, false);
              if (hi2 > 0) {
                pushCandidate(hi2, true);
                pushCandidate(hi2, false);
              }
            }
            if (preferByteCodes) {
              pushCandidate(numeric, true);
              pushCandidate(numeric, false);
            }
            if (candidates.length === 0) {
              state.codeToTileIndexCache.set(cacheKey, -1);
              return -1;
            }
            if (directMode) {
              for (let i = 0; i < candidates.length; i++) {
                const idx = candidates[i];
                if (!Number.isFinite(idx) || idx < 0 || idx >= tileMax) continue;
                state.codeToTileIndexCache.set(cacheKey, idx);
                return idx;
              }
              state.codeToTileIndexCache.set(cacheKey, candidates[0]);
              return candidates[0];
            }
            let bestIndex = candidates[0];
            let bestScore = -999;
            for (let i = 0; i < candidates.length; i++) {
              const idx = candidates[i];
              const tile = decodeTileAtIndex(idx);
              const cov = tileCoverage(tile);
              const rows = tileRowsWithInk(tile);
              const trans = tileTransitions(tile);
              const profile = tileInkProfile(tile, state.bpp === 2 ? 4 : (state.bpp === 1 ? 2 : 16));
              let score = 0;
              const targetCov = state.bpp === 4 ? 0.27 : (state.bpp === 2 ? 0.23 : (state.bpp === 1 ? 0.17 : 0.31));
              score += 1 - Math.min(1, Math.abs(cov - targetCov) / Math.max(0.06, targetCov));
              score += (rows >= 2 && rows <= 8) ? 0.45 : -0.5;
              score += (trans >= 5 && trans <= 34) ? 0.45 : -0.5;
              if (state.bpp === 4) {
                const inkColors = Number(profile?.inkColors || 0);
                score += 1 - Math.min(1, Math.abs(inkColors - 2.2) / 4.2);
                if (Number(profile?.maxValue || 0) > 8) score -= 0.4;
              }
              if (cov < 0.01 || cov > 0.86) score -= 1.2;
              if (score > bestScore) {
                bestScore = score;
                bestIndex = idx;
              }
            }
            state.codeToTileIndexCache.set(cacheKey, bestIndex);
            return bestIndex;
          };

          const decodeTile = (code) => {
            const tileIndex = resolveTileIndex(code);
            if (!Number.isFinite(tileIndex) || tileIndex < 0) return new Uint8Array(64);
            return decodeTileAtIndex(tileIndex);
          };

          const tileCoverage = (tile) => {
            if (!tile || tile.length !== 64) return 0;
            let on = 0;
            for (let i = 0; i < 64; i++) if (tile[i] !== 0) on++;
            return on / 64;
          };

          const tileInkProfile = (tile, bins) => {
            const hist = new Uint16Array(Math.max(2, bins | 0));
            let maxValue = 0;
            for (let i = 0; i < 64; i++) {
              const v = Number(tile[i] || 0) & (hist.length - 1);
              if (v !== 0) hist[v]++;
              if (v > maxValue) maxValue = v;
            }
            let inkColors = 0;
            for (let i = 1; i < hist.length; i++) {
              if (hist[i] > 0) inkColors++;
            }
            return { inkColors, maxValue };
          };

          const tileSignature = (tile) => {
            let sig = 2166136261 >>> 0;
            for (let i = 0; i < 64; i++) {
              sig ^= tile[i] & 0xFF;
              sig = Math.imul(sig, 16777619) >>> 0;
            }
            return sig >>> 0;
          };

          const tileRowsWithInk = (tile) => {
            let rows = 0;
            for (let y = 0; y < 8; y++) {
              let rowInk = 0;
              for (let x = 0; x < 8; x++) {
                if (tile[(y * 8) + x] !== 0) rowInk++;
              }
              if (rowInk > 0) rows++;
            }
            return rows;
          };

          const tileTransitions = (tile) => {
            let transitions = 0;
            for (let y = 0; y < 8; y++) {
              let prev = -1;
              for (let x = 0; x < 8; x++) {
                const v = tile[(y * 8) + x] === 0 ? 0 : 1;
                if (prev >= 0 && v !== prev) transitions++;
                prev = v;
              }
            }
            return transitions;
          };

          const scoreFontCandidate = (offset, sampleCodes) => {
            if (!state.rom) return -1;
            if (offset < 0 || (offset + (state.bytesPerTile * 256)) >= state.romLength) return -1;
            let score = 0;
            let checked = 0;
            const spaceCode = state.charToCode.get(' ');
            const hasSpaceCode = Number.isFinite(spaceCode);
            const sigSet = new Set();
            let transitionAcc = 0;
            let coverageAcc = 0;
            let rowsAcc = 0;
            let tinyInkCount = 0;
            let heavyInkCount = 0;
            let paletteAcc = 0;
            let palettePenaltyAcc = 0;
            for (let i = 0; i < sampleCodes.length; i++) {
              const code = sampleCodes[i];
              if (!Number.isFinite(code)) continue;
              const tileIndex = toTileIndex(code);
              if (tileIndex < 0) continue;
              const tileOff = offset + (tileIndex * state.bytesPerTile);
              let tile;
              if (state.bpp === 1) tile = decodeTile1bpp(state.rom, tileOff);
              else if (state.bpp === 2) tile = state.decodeVariant === 'linear' ? decodeTile2bppLinear(state.rom, tileOff) : decodeTile2bpp(state.rom, tileOff);
              else if (state.bpp === 8) tile = decodeTile8bpp(state.rom, tileOff);
              else tile = state.decodeVariant === 'swapped' ? decodeTile4bppSwapped(state.rom, tileOff) : decodeTile4bpp(state.rom, tileOff);
              const cov = tileCoverage(tile);
              const rows = tileRowsWithInk(tile);
              const trans = tileTransitions(tile);
              const profile = tileInkProfile(tile, state.bpp === 2 ? 4 : (state.bpp === 1 ? 2 : 16));
              coverageAcc += cov;
              rowsAcc += rows;
              if (cov < 0.03) tinyInkCount++;
              if (cov > 0.72) heavyInkCount++;
              sigSet.add(tileSignature(tile));
              transitionAcc += trans;
              if (state.bpp === 4) {
                const paletteCompactness = 1 - Math.min(1, Math.abs((profile.inkColors || 0) - 2.2) / 3.8);
                paletteAcc += paletteCompactness;
                if ((profile.maxValue || 0) > 7) palettePenaltyAcc += 0.38;
              }
              if (hasSpaceCode && (Math.floor(Number(code)) === Math.floor(Number(spaceCode)))) {
                score += (cov < 0.12) ? 2.2 : -1.6;
                score += (rows <= 2) ? 0.6 : -0.4;
              } else {
                const targetCov = state.bpp === 4 ? 0.28 : (state.bpp === 2 ? 0.24 : (state.bpp === 1 ? 0.18 : 0.32));
                const covScore = 1 - Math.min(1, Math.abs(cov - targetCov) / Math.max(0.08, targetCov));
                score += covScore * 1.3;
                if (rows >= 2 && rows <= 8) score += 0.5;
                else score -= 0.4;
                if (trans >= 6 && trans <= 30) score += 0.55;
                else if (trans < 3 || trans > 40) score -= 0.75;
              }
              checked++;
            }
            if (checked === 0) return -1;
            const diversity = sigSet.size / checked;
            score += (Math.max(0, Math.min(1, (diversity - 0.3) / 0.6)) * 0.9);
            const avgTrans = transitionAcc / checked;
            const avgCov = coverageAcc / checked;
            const avgRows = rowsAcc / checked;
            const tinyInkRatio = tinyInkCount / checked;
            const heavyInkRatio = heavyInkCount / checked;
            if (avgTrans < 4 || avgTrans > 34) score -= 0.6;
            if (avgCov < 0.05 || avgCov > 0.58) score -= 1.0;
            if (avgRows < 1.7 || avgRows > 7.4) score -= 0.75;
            if (diversity < 0.22) score -= 0.9;
            if (heavyInkRatio > 0.55) score -= 1.2;
            if (tinyInkRatio > 0.65) score -= 0.9;
            if (state.bpp === 4 && checked > 0) {
              score += (paletteAcc / checked) * 0.30;
              score -= (palettePenaltyAcc / checked);
            }
            return score / checked;
          };

          const deriveTrustedCodeBias = () => {
            const fromSpace = Number(state.charToCode.get(' '));
            if (Number.isFinite(fromSpace) && fromSpace >= 0) return Math.floor(fromSpace);
            const fromUpperA = Number(state.charToCode.get('A'));
            if (Number.isFinite(fromUpperA) && fromUpperA >= 0x41) return Math.max(0, Math.floor(fromUpperA) - 0x41);
            const fromLowerA = Number(state.charToCode.get('a'));
            if (Number.isFinite(fromLowerA) && fromLowerA >= 0x61) return Math.max(0, Math.floor(fromLowerA) - 0x61);
            const digit0 = Number(state.charToCode.get('0'));
            if (Number.isFinite(digit0) && digit0 >= 0x30) return Math.max(0, Math.floor(digit0) - 0x30);
            return 0;
          };

          const detectBestCodeBias = (offset, sampleCodes, strictMode = false) => {
            const candidates = strictMode
              ? [0, 0x20, 0x30, 0x40]
              : [0, 0x20, 0x30, 0x40, 0x60, 0x80, 0xA0, 0xC0];
            const spaceCode = state.charToCode.get(' ');
            if (Number.isFinite(spaceCode) && spaceCode > 0) {
              candidates.push(Math.floor(spaceCode));
              candidates.push(Math.max(0, Math.floor(spaceCode) - 0x20));
            }
            const printable = [];
            for (let i = 0; i < sampleCodes.length; i++) {
              const c = Math.floor(Number(sampleCodes[i]));
              if (Number.isFinite(c) && c >= 0x20) printable.push(c);
            }
            if (printable.length > 0) {
              printable.sort((a, b) => a - b);
              const minCode = printable[0];
              const midCode = printable[Math.floor(printable.length / 2)];
              candidates.push(minCode);
              candidates.push(midCode);
              candidates.push(Math.max(0, minCode - 0x10));
              candidates.push(Math.max(0, minCode - 0x20));
              candidates.push(Math.max(0, minCode - 0x30));
              candidates.push(Math.max(0, minCode - 0x40));
            }
            const unique = Array.from(new Set(candidates.filter(v => Number.isFinite(v) && v >= 0))).slice(0, 24);
            const prevBias = Number(state.codeBias) || 0;
            let bestBias = prevBias;
            let bestScore = -999;
            for (let i = 0; i < unique.length; i++) {
              state.codeBias = Math.floor(unique[i]);
              state.tileCache.clear();
              state.codeToTileIndexCache.clear();
              const s = scoreFontCandidate(offset, sampleCodes);
              if (s > bestScore) {
                bestScore = s;
                bestBias = state.codeBias;
              }
            }
            state.codeBias = bestBias;
            state.tileCache.clear();
            state.codeToTileIndexCache.clear();
            return bestBias;
          };

          const chooseBestHintOffset = (hints, sampleCodes) => {
            if (!Array.isArray(hints) || hints.length === 0) return null;
            let best = null;
            for (let i = 0; i < hints.length; i++) {
              const entry = hints[i];
              const off = Number(entry?.offset);
              if (!Number.isFinite(off) || off < 0) continue;
              const score = scoreFontCandidate(Math.floor(off), sampleCodes);
              if (!best || score > best.score) {
                best = { offset: Math.floor(off), score };
              }
            }
            return best;
          };

          const autoDetectFontOffset = (sampleCodesInput) => {
            if (!state.rom || state.romLength < (state.bytesPerTile * 256)) return { offset: 0, score: -1, mode: 'fallback' };
            const sampleChars = [' ', 'A', 'B', 'E', 'H', 'M', 'a', 'e', 'i', 'n', 'o', 's', '0', '1', '2'];
            const sampleCodes = [];
            if (Array.isArray(sampleCodesInput)) {
              for (let i = 0; i < sampleCodesInput.length; i++) {
                const c = Number(sampleCodesInput[i]);
                if (Number.isFinite(c)) sampleCodes.push(Math.floor(c));
              }
            }
            for (let i = 0; i < sampleChars.length; i++) {
              const code = state.charToCode.get(sampleChars[i]);
              if (Number.isFinite(code)) sampleCodes.push(code);
            }
            if (sampleCodes.length === 0) sampleCodes.push(0x20, 0x41, 0x61);

            const maxBase = Math.max(0, state.romLength - (state.bytesPerTile * 256));
            let bestOffset = 0;
            let bestScore = -999;
            const coarseStep = state.bpp === 4 ? 0x200 : 0x100;
            for (let off = 0; off <= maxBase; off += coarseStep) {
              const score = scoreFontCandidate(off, sampleCodes);
              if (score > bestScore) {
                bestScore = score;
                bestOffset = off;
              }
            }
            const refineStart = Math.max(0, bestOffset - (coarseStep * 2));
            const refineEnd = Math.min(maxBase, bestOffset + (coarseStep * 2));
            for (let off = refineStart; off <= refineEnd; off += 0x20) {
              const score = scoreFontCandidate(off, sampleCodes);
              if (score > bestScore) {
                bestScore = score;
                bestOffset = off;
              }
            }
            return { offset: bestOffset, score: bestScore, mode: 'auto' };
          };

          const wrapSegment = (segment, maxCols, outLines, maxLines) => {
            const words = String(segment || '').split(/\\s+/).filter(Boolean);
            if (words.length === 0) {
              if (outLines.length < maxLines) outLines.push('');
              return outLines.length >= maxLines;
            }
            let current = '';
            for (let i = 0; i < words.length; i++) {
              let word = words[i];
              while (word.length > maxCols) {
                const chunk = word.slice(0, maxCols);
                word = word.slice(maxCols);
                if (current) {
                  if (outLines.length < maxLines) outLines.push(current);
                  current = '';
                }
                if (outLines.length < maxLines) outLines.push(chunk);
                if (outLines.length >= maxLines) return true;
              }
              if (!current) {
                current = word;
                continue;
              }
              if ((current.length + 1 + word.length) <= maxCols) {
                current += ' ' + word;
              } else {
                if (outLines.length < maxLines) outLines.push(current);
                current = word;
                if (outLines.length >= maxLines) return true;
              }
            }
            if (current) {
              if (outLines.length < maxLines) outLines.push(current);
              if (outLines.length >= maxLines) return true;
            }
            return false;
          };

          const makeFrame = (width, height) => {
            const w = clamp(Number(width) || 640, 256, 1280);
            const h = clamp(Number(height) || 360, 144, 720);
            const px = new Uint8ClampedArray(w * h * 4);
            return { width: w, height: h, pixels: px };
          };

          const fillRect = (frame, x, y, w, h, r, g, b, a = 255) => {
            const x0 = clamp(Math.floor(x), 0, frame.width);
            const y0 = clamp(Math.floor(y), 0, frame.height);
            const x1 = clamp(Math.floor(x + w), 0, frame.width);
            const y1 = clamp(Math.floor(y + h), 0, frame.height);
            for (let yy = y0; yy < y1; yy++) {
              let idx = ((yy * frame.width) + x0) * 4;
              for (let xx = x0; xx < x1; xx++) {
                frame.pixels[idx++] = r;
                frame.pixels[idx++] = g;
                frame.pixels[idx++] = b;
                frame.pixels[idx++] = a;
              }
            }
          };

          const drawScaledBackground = (frame, bg) => {
            if (!bg || !bg.pixels || !bg.width || !bg.height) return;
            const srcW = Math.max(1, Number(bg.width) || 1);
            const srcH = Math.max(1, Number(bg.height) || 1);
            const src = bg.pixels;
            for (let y = 0; y < frame.height; y++) {
              const sy = Math.min(srcH - 1, Math.floor((y * srcH) / frame.height));
              let dstIdx = (y * frame.width) * 4;
              for (let x = 0; x < frame.width; x++) {
                const sx = Math.min(srcW - 1, Math.floor((x * srcW) / frame.width));
                const srcIdx = ((sy * srcW) + sx) * 4;
                frame.pixels[dstIdx++] = src[srcIdx] || 0;
                frame.pixels[dstIdx++] = src[srcIdx + 1] || 0;
                frame.pixels[dstIdx++] = src[srcIdx + 2] || 0;
                frame.pixels[dstIdx++] = src[srcIdx + 3] === undefined ? 255 : src[srcIdx + 3];
              }
            }
          };

          const drawTile = (frame, tile, x, y, scale, fg, shadow = null) => {
            if (!tile || tile.length !== 64) return;
            const s = Math.max(1, Math.floor(scale) || 1);
            for (let py = 0; py < 8; py++) {
              for (let px = 0; px < 8; px++) {
                const v = tile[(py * 8) + px];
                if ((v & 0x0F) === 0) continue;
                const dx = x + (px * s);
                const dy = y + (py * s);
                if (shadow) fillRect(frame, dx + 1, dy + 1, s, s, shadow[0], shadow[1], shadow[2], 255);
                fillRect(frame, dx, dy, s, s, fg[0], fg[1], fg[2], 255);
              }
            }
          };

          const layoutLines = (rawText, maxCols, maxLines) => {
            const lines = [];
            let overflow = false;
            const segments = rawText.split('\\n');
            for (let i = 0; i < segments.length; i++) {
              const seg = String(segments[i] || '');
              if (!seg.trim()) {
                if (lines.length < maxLines) lines.push('');
                else { overflow = true; break; }
                continue;
              }
              const segOverflow = wrapSegment(seg, maxCols, lines, maxLines);
              if (segOverflow) { overflow = true; break; }
            }
            return { lines, overflow };
          };

          const renderFrame = (payload) => {
            const rawText = normalize(payload?.text || '');
            const maxCols = clamp(Number(payload?.maxCols) || 36, 10, 120);
            const maxLines = clamp(Number(payload?.maxLines) || 4, 1, 12);
            const mode = String(payload?.mode || 'font').toLowerCase();
            const requestedLineHeight = clamp(Number(payload?.lineHeight) || (mode === 'wasm' ? 20 : 19), 10, 42);
            const requestedPadding = clamp(Number(payload?.padding) || 18, 6, 72);
            const frame = makeFrame(payload?.width, payload?.height);
            const layout = layoutLines(rawText, maxCols, maxLines);
            const incomingBg = payload?.background || null;
            if (incomingBg && incomingBg.pixelsBuffer && Number.isFinite(Number(incomingBg.width)) && Number.isFinite(Number(incomingBg.height))) {
              const bgW = Math.max(1, Number(incomingBg.width) || 1);
              const bgH = Math.max(1, Number(incomingBg.height) || 1);
              const bgPixels = new Uint8ClampedArray(incomingBg.pixelsBuffer);
              if (bgPixels.length >= (bgW * bgH * 4)) {
                state.sceneBackground = { width: bgW, height: bgH, pixels: bgPixels };
              }
            } else if (payload?.clearBackground) {
              state.sceneBackground = null;
            }

            if (mode === 'wasm') {
              fillRect(frame, 0, 0, frame.width, frame.height, 3, 8, 14, 255);
              fillRect(frame, 8, 8, frame.width - 16, frame.height - 16, 17, 22, 38, 255);
              fillRect(frame, 16, 16, frame.width - 32, Math.floor(frame.height * 0.58), 22, 34, 48, 255);
              fillRect(frame, 16, Math.floor(frame.height * 0.62), frame.width - 32, Math.floor(frame.height * 0.30), 6, 8, 12, 255);
            } else {
              if (state.sceneBackground) {
                drawScaledBackground(frame, state.sceneBackground);
              } else {
                fillRect(frame, 0, 0, frame.width, frame.height, 0, 0, 0, 255);
              }
            }

            const boxPad = requestedPadding;
            const autoBoxHeight = Math.floor((requestedLineHeight * maxLines) + (requestedPadding * 1.9) + 18);
            const minBoxHeight = mode === 'font' ? Math.floor(frame.height * 0.28) : Math.floor(frame.height * 0.26);
            const maxBoxHeight = mode === 'font' ? Math.floor(frame.height * 0.92) : Math.floor(frame.height * 0.74);
            const boxH = clamp(autoBoxHeight, minBoxHeight, maxBoxHeight);
            const boxY = clamp(frame.height - boxH - boxPad, 0, frame.height - boxH);
            if (mode === 'font') {
              fillRect(frame, boxPad, boxY, frame.width - (boxPad * 2), boxH, 0, 0, 0, 172);
              fillRect(frame, boxPad, boxY, frame.width - (boxPad * 2), 1, 150, 200, 180, 255);
              fillRect(frame, boxPad, boxY + boxH - 1, frame.width - (boxPad * 2), 1, 150, 200, 180, 255);
            } else {
              fillRect(frame, boxPad, boxY, frame.width - (boxPad * 2), boxH, 6, 6, 8, 246);
              fillRect(frame, boxPad, boxY, frame.width - (boxPad * 2), 2, 130, 62, 98, 255);
              fillRect(frame, boxPad, boxY + boxH - 2, frame.width - (boxPad * 2), 2, 130, 62, 98, 255);
            }
            return {
              lines: layout.lines,
              overflow: layout.overflow,
              maxCols,
              maxLines,
              sourceLength: rawText.length,
              width: frame.width,
              height: frame.height,
              pixels: frame.pixels
            };
          };

          self.onmessage = (e) => {
            const { type, payload } = e.data || {};
            if (type === 'setFontSource') {
              const requestId = Number(payload?.requestId) || 0;
              const romBuffer = payload?.romBuffer;
              const singleByte = payload?.singleByte || {};
              const multiByte = payload?.multiByte || {};
              const sampleText = String(payload?.sampleText || '');
              state.system = String(payload?.systemName || 'Unknown');
              const requestedBpp = Number(payload?.bpp);
              const detectModeRaw = String(payload?.detectMode || '').toLowerCase();
              state.charToCode = buildCharToCode(singleByte, multiByte);
              state.codeValueMode = detectCodeValueMode(state.charToCode);
              state.tileCache.clear();
              state.codeToTileIndexCache.clear();
              state.rom = romBuffer ? new Uint8Array(romBuffer) : null;
              state.romLength = state.rom ? state.rom.length : 0;
              const sampledCodes = [];
              if (sampleText) {
                const normalizedSample = normalize(sampleText).replace(/\\s+/g, '');
                const seen = new Set();
                for (let i = 0; i < normalizedSample.length && sampledCodes.length < 80; i++) {
                  const ch = normalizedSample[i];
                  const code =
                    state.charToCode.get(ch) ??
                    state.charToCode.get(ch.toUpperCase()) ??
                    state.charToCode.get(ch.toLowerCase());
                  if (!Number.isFinite(code)) continue;
                  const key = Math.floor(Number(code));
                  if (seen.has(key)) continue;
                  seen.add(key);
                  sampledCodes.push(key);
                }
              }
              const requestedVariantRaw = String(payload?.variant || 'auto').toLowerCase();
              const hintCandidates = Array.isArray(payload?.candidateOffsets) ? payload.candidateOffsets.slice(0, 8) : [];
              const manualOffsetRaw =
                (payload?.manualOffset === null || payload?.manualOffset === undefined || payload?.manualOffset === '')
                  ? NaN
                  : Number(payload?.manualOffset);
              const systemUpper = String(state.system || '').toUpperCase();
              const isGbaLikeSystem =
                systemUpper.includes('GBA') ||
                systemUpper.includes('GAME BOY ADVANCE') ||
                systemUpper.includes('ADVANCE GAME BOY') ||
                systemUpper.includes('AGB') ||
                systemUpper.includes('NDS');
              const forceGbaDefaultVariant = (bppValue, variantValue) => {
                const normalized = normalizeVariantForBpp(bppValue, variantValue);
                if (normalized === 'auto') return normalized;
                if (isGbaLikeSystem && Number(bppValue) === 4) {
                  return 'default';
                }
                return normalized;
              };
              const requestedBppValid = (requestedBpp === 1 || requestedBpp === 2 || requestedBpp === 4 || requestedBpp === 8);
              const manualLikeMode = detectModeRaw.includes('manual') || detectModeRaw.includes('candidate');
              if (!manualLikeMode && Number.isFinite(manualOffsetRaw) && manualOffsetRaw >= 0) {
                hintCandidates.unshift({
                  offset: Math.floor(manualOffsetRaw),
                  bpp: requestedBppValid ? requestedBpp : undefined,
                  variant: requestedVariantRaw || 'auto',
                  score: Number(payload?.detectScore) || 0
                });
              }
              const trustedSelection = (detectModeRaw.includes('manual') || detectModeRaw.includes('candidate')) &&
                Number.isFinite(manualOffsetRaw) &&
                manualOffsetRaw >= 0 &&
                requestedBppValid;
              if (trustedSelection) {
                state.bpp = requestedBpp;
                state.bytesPerTile = bytesPerTileForBpp(requestedBpp);
                state.fontOffset = Math.floor(manualOffsetRaw);
                const forcedVariant = forceGbaDefaultVariant(state.bpp, requestedVariantRaw);
                state.decodeVariant = forcedVariant === 'auto' ? 'default' : forcedVariant;
                state.fontScore = Number(payload?.detectScore) || 0;
                if (state.codeValueMode === 'low-byte') state.codeBias = 0;
                else state.codeBias = detectBestCodeBias(state.fontOffset, sampledCodes, false);
                state.tileResolveMode = 'heuristic';
                self.postMessage({
                  type: 'sceneFontSourceReady',
                  requestId,
                  fontOffset: state.fontOffset,
                  fontBpp: state.bpp,
                  bytesPerTile: state.bytesPerTile,
                  detectVariant: state.decodeVariant,
                  detectScore: state.fontScore,
                  detectMode: detectModeRaw || 'manual',
                  romLength: state.romLength
                });
                return;
              }
              const pickVariantForOffset = (bpp, offset) => {
                const forced = forceGbaDefaultVariant(bpp, requestedVariantRaw);
                if (forced !== 'auto') return forced;
                const variants = bpp === 4 ? ['default', 'swapped'] : (bpp === 2 ? ['default', 'linear'] : ['default']);
                let bestVariant = variants[0];
                let bestScore = -999;
                let defaultScore = -999;
                for (let i = 0; i < variants.length; i++) {
                  state.decodeVariant = variants[i];
                  state.tileCache.clear();
                  state.codeToTileIndexCache.clear();
                  const score = scoreFontCandidate(Math.floor(offset), sampledCodes);
                  if (variants[i] === 'default') defaultScore = score;
                  if (score > bestScore) {
                    bestScore = score;
                    bestVariant = variants[i];
                  }
                }
                if (bpp === 4 && isGbaLikeSystem && bestVariant === 'swapped') {
                  if (Number.isFinite(defaultScore) && defaultScore >= (bestScore - 0.55)) {
                    return 'default';
                  }
                }
                return bestVariant;
              };
              const chooseBestBpp = (manualOffset) => {
                const sys = String(state.system || '').toUpperCase();
                const preferredBpp = (sys.includes('GBA') || sys.includes('SNES') || sys.includes('NDS') || sys.includes('PLAYSTATION') || sys.includes('GENESIS')) ? 4 : 2;
                const bppCandidates = (sys.includes('GBA') || sys.includes('SNES') || sys.includes('NDS') || sys.includes('PLAYSTATION') || sys.includes('GENESIS'))
                  ? [4, 2]
                  : ((sys.includes('NES') || sys.includes('GAME BOY') || sys.includes('GBC') || sys === 'GB') ? [2, 1] : [2, 4, 1]);
                const variantByBpp = (bpp) => {
                  if (bpp === 4) return ['default', 'swapped'];
                  if (bpp === 2) return ['default', 'linear'];
                  return ['default'];
                };
                let best = { score: -999, offset: 0, bpp: 2, mode: 'auto' };
              for (let i = 0; i < bppCandidates.length; i++) {
                const bpp = bppCandidates[i];
                state.bpp = bpp;
                state.bytesPerTile = bytesPerTileForBpp(bpp);
                const variantForce = normalizeVariantForBpp(bpp, requestedVariantRaw);
                const variants = variantForce === 'auto' ? variantByBpp(bpp) : [variantForce];
                for (let vi = 0; vi < variants.length; vi++) {
                  state.decodeVariant = variants[vi];
                  state.tileCache.clear();
                  state.codeToTileIndexCache.clear();
                  const detectAuto = Number.isFinite(manualOffset)
                    ? { offset: Math.floor(manualOffset), score: scoreFontCandidate(Math.floor(manualOffset), sampledCodes), mode: 'auto-anchor' }
                    : autoDetectFontOffset(sampledCodes);
                  const detectHint = chooseBestHintOffset(hintCandidates, sampledCodes);
                  const detect = (detectHint && detectHint.score >= (detectAuto.score - 0.10))
                    ? { offset: detectHint.offset, score: detectHint.score, mode: 'auto-hint' }
                    : detectAuto;
                  const sys = String(state.system || '').toUpperCase();
                  const isGbaLike = sys.includes('GBA') || sys.includes('GAME BOY ADVANCE') || sys.includes('ADVANCE GAME BOY') || sys.includes('AGB') || sys.includes('NDS');
                  const swappedPenalty =
                    (bpp === 4 && variants[vi] === 'swapped' && isGbaLike)
                      ? 0.35
                      : 0;
                  const weightedScore = detect.score + (bpp === preferredBpp ? 0.90 : -0.35) - swappedPenalty;
                  if (weightedScore > best.score) {
                    best = {
                      score: weightedScore,
                      offset: detect.offset,
                      bpp,
                      variant: variants[vi],
                      mode: detect.mode
                    };
                  }
                }
              }
                if (!best.variant) best.variant = 'default';
                return best;
              };
              if (manualLikeMode && Number.isFinite(manualOffsetRaw) && manualOffsetRaw >= 0) {
                if (requestedBpp === 1 || requestedBpp === 2 || requestedBpp === 4 || requestedBpp === 8) {
                  state.bpp = requestedBpp;
                  state.bytesPerTile = bytesPerTileForBpp(requestedBpp);
                  state.fontOffset = Math.floor(manualOffsetRaw);
                  const manualVariant = forceGbaDefaultVariant(state.bpp, requestedVariantRaw);
                  state.decodeVariant = manualVariant === 'auto' ? 'default' : manualVariant;
                  state.fontScore = scoreFontCandidate(state.fontOffset, sampledCodes);
                } else {
                  const bestManual = chooseBestBpp(manualOffsetRaw);
                  state.bpp = bestManual.bpp;
                  state.bytesPerTile = bytesPerTileForBpp(bestManual.bpp);
                  state.decodeVariant = String(bestManual.variant || 'default');
                  state.fontOffset = bestManual.offset;
                  state.fontScore = bestManual.score;
                }
                if (state.codeValueMode === 'low-byte') state.codeBias = 0;
                else state.codeBias = detectBestCodeBias(state.fontOffset, sampledCodes, false);
                state.tileResolveMode = 'heuristic';
                self.postMessage({
                  type: 'sceneFontSourceReady',
                  requestId,
                  fontOffset: state.fontOffset,
                  fontBpp: state.bpp,
                  bytesPerTile: state.bytesPerTile,
                  detectVariant: state.decodeVariant,
                  detectScore: state.fontScore,
                  detectMode: requestedBpp === 1 || requestedBpp === 2 || requestedBpp === 4 || requestedBpp === 8 ? 'manual' : 'manual-auto-bpp',
                  romLength: state.romLength
                });
                return;
              }
              if (requestedBpp === 1 || requestedBpp === 2 || requestedBpp === 4 || requestedBpp === 8) {
                state.bpp = requestedBpp;
                state.bytesPerTile = bytesPerTileForBpp(requestedBpp);
                const detectAuto = autoDetectFontOffset(sampledCodes);
                const detectHint = chooseBestHintOffset(hintCandidates, sampledCodes);
                const detect = (detectHint && detectHint.score >= (detectAuto.score - 0.10))
                  ? { offset: detectHint.offset, score: detectHint.score, mode: 'auto-hint' }
                  : detectAuto;
                state.fontOffset = detect.offset;
                state.decodeVariant = pickVariantForOffset(state.bpp, state.fontOffset);
                state.fontScore = detect.score;
              } else {
                const best = chooseBestBpp(Number.isFinite(manualOffsetRaw) ? manualOffsetRaw : NaN);
                state.bpp = best.bpp;
                state.bytesPerTile = bytesPerTileForBpp(best.bpp);
                state.decodeVariant = String(best.variant || 'default');
                state.fontOffset = best.offset;
                state.fontScore = best.score;
              }
              if (state.codeValueMode === 'low-byte') state.codeBias = 0;
              else state.codeBias = detectBestCodeBias(state.fontOffset, sampledCodes, false);
              state.tileResolveMode = 'heuristic';
              self.postMessage({
                type: 'sceneFontSourceReady',
                requestId,
                fontOffset: state.fontOffset,
                fontBpp: state.bpp,
                bytesPerTile: state.bytesPerTile,
                detectVariant: state.decodeVariant,
                detectScore: state.fontScore,
                detectMode: requestedBpp === 1 || requestedBpp === 2 || requestedBpp === 4 || requestedBpp === 8 ? 'auto' : 'auto-bpp',
                romLength: state.romLength
              });
              return;
            }
            if (type === 'layoutScenePreview' || type === 'renderSceneFrame') {
              const rendered = renderFrame(payload || {});
              self.postMessage({
                type: 'scenePreviewFrame',
                previewLines: rendered.lines,
                previewOverflow: rendered.overflow,
                previewMaxCols: rendered.maxCols,
                previewMaxLines: rendered.maxLines,
                previewSourceLength: rendered.sourceLength,
                frameWidth: rendered.width,
                frameHeight: rendered.height,
                framePixels: rendered.pixels,
                fontOffset: state.fontOffset,
                fontBpp: state.bpp,
                bytesPerTile: state.bytesPerTile
              }, [rendered.pixels.buffer]);
              return;
            }
            if (type === 'setSceneBackground') {
              const bg = payload?.background || null;
              if (bg && bg.pixelsBuffer && Number.isFinite(Number(bg.width)) && Number.isFinite(Number(bg.height))) {
                const w = Math.max(1, Number(bg.width) || 1);
                const h = Math.max(1, Number(bg.height) || 1);
                const pixels = new Uint8ClampedArray(bg.pixelsBuffer);
                if (pixels.length >= (w * h * 4)) {
                  state.sceneBackground = { width: w, height: h, pixels };
                }
              } else {
                state.sceneBackground = null;
              }
              return;
            }
          };
      `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createPointerWorker = () => {
      const workerCode = `
          const toHex = (v, width = 2) => v.toString(16).toUpperCase().padStart(width, '0');
          const encodeValue = (value, size, isLittle) => {
            const out = [];
            let n = Number(value) >>> 0;
            for (let i = 0; i < size; i++) {
              const b = (n >> (i * 8)) & 0xFF;
              out.push(b);
            }
            if (!isLittle) out.reverse();
            return out;
          };
          const findPattern = (data, pattern, maxHits) => {
            const hits = [];
            if (!pattern || pattern.length === 0) return hits;
            for (let i = 0; i <= data.length - pattern.length; i++) {
              let ok = true;
              for (let j = 0; j < pattern.length; j++) {
                if (data[i + j] !== pattern[j]) { ok = false; break; }
              }
              if (ok) {
                hits.push(i);
                if (hits.length >= maxHits) break;
              }
            }
            return hits;
          };
          self.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type !== 'pointerScan') return;
            try {
              const { romBuffer, targetOffset = 0, system = {}, maxMatches = 2000 } = payload || {};
              if (!romBuffer) throw new Error('ROM not loaded.');
              const rom = new Uint8Array(romBuffer);
              const pointerSize = Math.max(2, Math.min(4, Number(system.pointerSize) || 4));
              const isLittle = String(system.pointerEndianness || 'little').toLowerCase() !== 'big';
              const base = Number(system.pointerBase) || 0;
              const target = Math.max(0, Math.min(rom.length - 1, Number(targetOffset) || 0));
              const patterns = [];
              const pushPattern = (type, value, bytes) => {
                if (!Array.isArray(bytes) || bytes.length === 0) return;
                const key = bytes.join(',');
                if (patterns.some(p => p.key === key)) return;
                patterns.push({ key, type, value, bytes });
              };
              pushPattern('file_offset', target, encodeValue(target, pointerSize, isLittle));
              pushPattern('base_plus', target + base, encodeValue(target + base, pointerSize, isLittle));
              if (pointerSize === 4) {
                pushPattern('raw24_le', target, [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF]);
                pushPattern('raw24_be', target, [(target >> 16) & 0xFF, (target >> 8) & 0xFF, target & 0xFF]);
              }
              const out = [];
              const eachLimit = Math.max(50, Math.min(2000, Number(maxMatches) || 2000));
              for (const pattern of patterns) {
                const hits = findPattern(rom, pattern.bytes, eachLimit);
                for (const ptrOffset of hits) {
                  out.push({
                    ptrOffset,
                    type: pattern.type,
                    valueHex: '0x' + toHex(pattern.value >>> 0, pointerSize * 2),
                    bytesHex: pattern.bytes.map(b => toHex(b)).join(' ')
                  });
                  if (out.length >= eachLimit) break;
                }
                if (out.length >= eachLimit) break;
              }
              out.sort((a, b) => a.ptrOffset - b.ptrOffset);
              self.postMessage({ type: 'pointerResult', matches: out, targetOffset: target, pointerSize, endian: isLittle ? 'little' : 'big' });
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Pointer worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createRomPreviewWorker = () => {
      const workerCode = `
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const decode2bppTile = (src, offset, out, width, x0, y0, palette) => {
            if (offset + 16 > src.length) return;
            for (let y = 0; y < 8; y++) {
              const p0 = src[offset + y];
              const p1 = src[offset + y + 8];
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                const idx = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1);
                const c = palette[idx] || palette[0];
                const p = ((y0 + y) * width + (x0 + x)) * 4;
                out[p] = c[0];
                out[p + 1] = c[1];
                out[p + 2] = c[2];
                out[p + 3] = 255;
              }
            }
          };
          const decode4bppLinearTile = (src, offset, out, width, x0, y0, palette) => {
            if (offset + 32 > src.length) return;
            for (let y = 0; y < 8; y++) {
              const row = offset + (y * 4);
              for (let x = 0; x < 8; x++) {
                const b = src[row + (x >> 1)];
                const idx = (x & 1) === 0 ? (b & 0x0F) : ((b >> 4) & 0x0F);
                const c = palette[idx] || palette[0];
                const p = ((y0 + y) * width + (x0 + x)) * 4;
                out[p] = c[0];
                out[p + 1] = c[1];
                out[p + 2] = c[2];
                out[p + 3] = 255;
              }
            }
          };
          const decode4bppSnesTile = (src, offset, out, width, x0, y0, palette) => {
            if (offset + 32 > src.length) return;
            for (let y = 0; y < 8; y++) {
              const p0 = src[offset + y * 2];
              const p1 = src[offset + y * 2 + 1];
              const p2 = src[offset + 16 + y * 2];
              const p3 = src[offset + 16 + y * 2 + 1];
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                const idx = ((p0 >> bit) & 1) |
                  (((p1 >> bit) & 1) << 1) |
                  (((p2 >> bit) & 1) << 2) |
                  (((p3 >> bit) & 1) << 3);
                const c = palette[idx] || palette[0];
                const p = ((y0 + y) * width + (x0 + x)) * 4;
                out[p] = c[0];
                out[p + 1] = c[1];
                out[p + 2] = c[2];
                out[p + 3] = 255;
              }
            }
          };
          const buildPalette4 = () => ([
            [8, 20, 28], [55, 86, 108], [99, 143, 163], [188, 226, 237]
          ]);
          const buildPalette16 = () => {
            const p = [];
            for (let i = 0; i < 16; i++) {
              const v = Math.floor((i / 15) * 255);
              p.push([v, (v * 3) >> 2, clamp(35 + v, 0, 255)]);
            }
            return p;
          };
          self.onmessage = async (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'romPreview') return;
            try {
              const { romBuffer, systemName, focusOffset = 0 } = payload || {};
              if (!romBuffer) throw new Error('ROM not loaded.');
              const rom = new Uint8Array(romBuffer);
              const cols = 20;
              const rows = 18;
              const width = cols * 8;
              const height = rows * 8;
              const pixels = new Uint8ClampedArray(width * height * 4);
              const lowSystem = String(systemName || '').toLowerCase();

              let mode = '2bpp';
              let bytesPerTile = 16;
              if (lowSystem.includes('gba') || lowSystem.includes('nds') || lowSystem.includes('3ds') || lowSystem.includes('psp') || lowSystem.includes('playstation 1')) {
                mode = '4bpp-linear';
                bytesPerTile = 32;
              } else if (lowSystem.includes('snes')) {
                mode = '4bpp-snes';
                bytesPerTile = 32;
              } else if (lowSystem.includes('nintendo 64') || lowSystem.includes('genesis')) {
                mode = '4bpp-linear';
                bytesPerTile = 32;
              }

              const totalTiles = cols * rows;
              const previewBytes = totalTiles * bytesPerTile;
              let sourceStart = clamp(Number(focusOffset) || 0, 0, Math.max(0, rom.length - previewBytes));
              let sourceTag = 'focus-region';

              if (lowSystem.includes('nes') && rom.length >= 16 && rom[0] === 0x4E && rom[1] === 0x45 && rom[2] === 0x53 && rom[3] === 0x1A) {
                const prgBanks = rom[4] || 0;
                const chrBanks = rom[5] || 0;
                const hasTrainer = (rom[6] & 0x04) !== 0;
                const trainerSize = hasTrainer ? 512 : 0;
                const chrStart = 16 + trainerSize + (prgBanks * 16384);
                const chrSize = chrBanks * 8192;
                if (chrSize > 0 && chrStart + chrSize <= rom.length) {
                  sourceStart = chrStart;
                  mode = '2bpp';
                  bytesPerTile = 16;
                  sourceTag = 'nes-chr-rom';
                }
              }

              if (lowSystem.includes('game boy') || lowSystem.includes('gbc')) {
                mode = '2bpp';
                bytesPerTile = 16;
              }

              const palette4 = buildPalette4();
              const palette16 = buildPalette16();
              const maxStart = Math.max(0, rom.length - (totalTiles * bytesPerTile));
              sourceStart = clamp(sourceStart, 0, maxStart);

              for (let tile = 0; tile < totalTiles; tile++) {
                const tx = (tile % cols) * 8;
                const ty = Math.floor(tile / cols) * 8;
                const off = sourceStart + tile * bytesPerTile;
                if (mode === '2bpp') decode2bppTile(rom, off, pixels, width, tx, ty, palette4);
                else if (mode === '4bpp-snes') decode4bppSnesTile(rom, off, pixels, width, tx, ty, palette16);
                else decode4bppLinearTile(rom, off, pixels, width, tx, ty, palette16);
                if (tile > 0 && tile % 80 === 0) await new Promise(resolve => setTimeout(resolve, 0));
              }

              self.postMessage({
                type: 'romPreviewResult',
                width,
                height,
                pixels: pixels.buffer,
                mode,
                sourceStart,
                sourceTag,
                status: 'ROM preview rendered from tile data.'
              }, [pixels.buffer]);
            } catch (error) {
              self.postMessage({ type: 'error', message: 'ROM preview worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

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
              const line = commentIndex > -1 ? rawLine.substring(0, commentIndex) : rawLine;
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

    const createTileEditorWorker = () => {
      const workerCode = `
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const inferBpp = (mode, systemName) => {
            const m = String(mode || 'auto').toLowerCase();
            if (m === '2bpp') return 2;
            if (m === '4bpp') return 4;
            const s = String(systemName || '').toLowerCase();
            if (s.includes('nes') || s.includes('game boy') || s.includes('gbc') || s.includes('gb')) return 2;
            return 4;
          };
          const colorFromIndex = (idx, max) => {
            const n = clamp(idx, 0, max);
            const ratio = max > 0 ? (n / max) : 0;
            const r = clamp(Math.floor(35 + ratio * 220), 0, 255);
            const g = clamp(Math.floor(40 + ratio * 190), 0, 255);
            const b = clamp(Math.floor(55 + ratio * 170), 0, 255);
            return [r, g, b, 255];
          };
          const decodeTile2bpp = (src, base, outIdx, outOffset) => {
            if (base + 16 > src.length) return false;
            for (let y = 0; y < 8; y++) {
              const p0 = src[base + y];
              const p1 = src[base + y + 8];
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                const idx = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1);
                outIdx[outOffset + (y * 8) + x] = idx;
              }
            }
            return true;
          };
          const decodeTile4bpp = (src, base, outIdx, outOffset) => {
            if (base + 32 > src.length) return false;
            for (let y = 0; y < 8; y++) {
              const row = base + y * 4;
              for (let x = 0; x < 8; x++) {
                const b = src[row + (x >> 1)];
                const idx = (x & 1) === 0 ? (b & 0x0F) : ((b >> 4) & 0x0F);
                outIdx[outOffset + (y * 8) + x] = idx;
              }
            }
            return true;
          };
          const paintTileToImage = (tileIdxData, tileDataOffset, pixels, width, x0, y0, colorMax) => {
            for (let y = 0; y < 8; y++) {
              for (let x = 0; x < 8; x++) {
                const idx = tileIdxData[tileDataOffset + (y * 8) + x] || 0;
                const c = colorFromIndex(idx, colorMax);
                const p = ((y0 + y) * width + (x0 + x)) * 4;
                pixels[p] = c[0];
                pixels[p + 1] = c[1];
                pixels[p + 2] = c[2];
                pixels[p + 3] = c[3];
              }
            }
          };

          self.onmessage = async (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'renderTileEditor') return;
            try {
              const {
                romBuffer,
                systemName,
                tileOffset,
                tileCount,
                tilesPerRow,
                bppMode,
                mapOffset,
                mapWidth,
                mapHeight,
                mapEntrySize,
                mapEndian
              } = payload || {};
              if (!romBuffer) throw new Error('ROM data is missing.');
              const rom = new Uint8Array(romBuffer);
              const bpp = inferBpp(bppMode, systemName);
              const bytesPerTile = bpp === 2 ? 16 : 32;
              const maxColor = bpp === 2 ? 3 : 15;
              const safeTileOffset = clamp(Number(tileOffset) || 0, 0, Math.max(0, rom.length - bytesPerTile));
              const safeTileCount = clamp(Number(tileCount) || 256, 1, 4096);
              const safeCols = clamp(Number(tilesPerRow) || 16, 1, 64);
              const safeRows = Math.ceil(safeTileCount / safeCols);
              const sheetWidth = safeCols * 8;
              const sheetHeight = safeRows * 8;
              const sheetPixels = new Uint8ClampedArray(sheetWidth * sheetHeight * 4);
              const tileIndexData = new Uint8Array(safeTileCount * 64);

              for (let tile = 0; tile < safeTileCount; tile++) {
                const base = safeTileOffset + tile * bytesPerTile;
                if (base + bytesPerTile > rom.length) break;
                const outOffset = tile * 64;
                const ok = bpp === 2
                  ? decodeTile2bpp(rom, base, tileIndexData, outOffset)
                  : decodeTile4bpp(rom, base, tileIndexData, outOffset);
                if (!ok) continue;
                const tx = (tile % safeCols) * 8;
                const ty = Math.floor(tile / safeCols) * 8;
                paintTileToImage(tileIndexData, outOffset, sheetPixels, sheetWidth, tx, ty, maxColor);
                if (tile % 128 === 0) await new Promise(resolve => setTimeout(resolve, 0));
              }

              let mapPixels = new Uint8ClampedArray(0);
              let safeMapWidth = 0;
              let safeMapHeight = 0;
              let mapPresent = false;
              const mapOff = Number(mapOffset);
              if (Number.isFinite(mapOff) && mapOff >= 0) {
                safeMapWidth = clamp(Number(mapWidth) || 32, 1, 256);
                safeMapHeight = clamp(Number(mapHeight) || 32, 1, 256);
                const safeEntrySize = (Number(mapEntrySize) === 2) ? 2 : 1;
                const little = String(mapEndian || 'little').toLowerCase() !== 'big';
                const neededBytes = safeMapWidth * safeMapHeight * safeEntrySize;
                if (mapOff + neededBytes <= rom.length) {
                  mapPresent = true;
                  const mapPixelWidth = safeMapWidth * 8;
                  const mapPixelHeight = safeMapHeight * 8;
                  mapPixels = new Uint8ClampedArray(mapPixelWidth * mapPixelHeight * 4);
                  let idxPos = mapOff;
                  for (let ty = 0; ty < safeMapHeight; ty++) {
                    for (let tx = 0; tx < safeMapWidth; tx++) {
                      let tileIndex = 0;
                      if (safeEntrySize === 1) {
                        tileIndex = rom[idxPos++];
                      } else {
                        const b0 = rom[idxPos++];
                        const b1 = rom[idxPos++];
                        tileIndex = little ? (b0 | (b1 << 8)) : (b1 | (b0 << 8));
                      }
                      const tileSlot = tileIndex % safeTileCount;
                      const tileDataOffset = tileSlot * 64;
                      paintTileToImage(tileIndexData, tileDataOffset, mapPixels, mapPixelWidth, tx * 8, ty * 8, maxColor);
                    }
                    if (ty % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                  }
                }
              }

              self.postMessage({
                type: 'tileEditorResult',
                bpp,
                bytesPerTile,
                tileOffset: safeTileOffset,
                tileCount: safeTileCount,
                tilesPerRow: safeCols,
                sheetWidth,
                sheetHeight,
                sheetPixels: sheetPixels.buffer,
                mapWidth: safeMapWidth,
                mapHeight: safeMapHeight,
                mapPresent,
                mapPixels: mapPixels.buffer,
                status: 'Rendered ' + safeTileCount + ' tile(s) at 0x' + safeTileOffset.toString(16).toUpperCase() + ' (' + bpp + 'bpp).'
              }, [sheetPixels.buffer, mapPixels.buffer]);
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Tile editor worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createUnitTestWorker = () => {
      const workerFunctions =
        'const escapeRegex = ' + escapeRegex.toString() + ';\n' +
        'const createTokenizer = ' + createTokenizer.toString() + ';\n' +
        'const smartTextParse = ' + smartTextParse.toString() + ';\n' +
        'const detectSystem = ' + detectSystem.toString() + ';\n';
      const workerCode = workerFunctions + `
          const decodeLz10 = (src, start) => {
            if (start + 4 > src.length || src[start] !== 0x10) return null;
            const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
            const out = new Uint8Array(outLen);
            let inPos = start + 4;
            let outPos = 0;
            while (outPos < outLen && inPos < src.length) {
              const flags = src[inPos++];
              for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                const compressed = (flags & (0x80 >> bit)) !== 0;
                if (!compressed) {
                  out[outPos++] = src[inPos++];
                } else {
                  const b1 = src[inPos++];
                  const b2 = src[inPos++];
                  const len = (b1 >> 4) + 3;
                  const disp = ((b1 & 0x0F) << 8) | b2;
                  let copyPos = outPos - (disp + 1);
                  for (let j = 0; j < len && outPos < outLen; j++) out[outPos++] = out[copyPos++];
                }
              }
            }
            return outPos === outLen ? out : null;
          };
          const decodeLz11 = (src, start) => {
            if (start + 4 > src.length || src[start] !== 0x11) return null;
            const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
            const out = new Uint8Array(outLen);
            let inPos = start + 4;
            let outPos = 0;
            while (outPos < outLen && inPos < src.length) {
              const flags = src[inPos++];
              for (let bit = 0; bit < 8 && outPos < outLen; bit++) {
                const compressed = (flags & (0x80 >> bit)) !== 0;
                if (!compressed) {
                  out[outPos++] = src[inPos++];
                } else {
                  if (inPos >= src.length) return null;
                  const b1 = src[inPos++];
                  const hi = b1 >> 4;
                  let len = 0;
                  let disp = 0;
                  if (hi === 0) {
                    if (inPos + 1 >= src.length) return null;
                    const b2 = src[inPos++];
                    const b3 = src[inPos++];
                    len = (((b1 & 0x0F) << 4) | (b2 >> 4)) + 0x11;
                    disp = ((b2 & 0x0F) << 8) | b3;
                  } else if (hi === 1) {
                    if (inPos + 2 >= src.length) return null;
                    const b2 = src[inPos++];
                    const b3 = src[inPos++];
                    const b4 = src[inPos++];
                    len = (((b1 & 0x0F) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111;
                    disp = ((b3 & 0x0F) << 8) | b4;
                  } else {
                    if (inPos >= src.length) return null;
                    const b2 = src[inPos++];
                    len = hi + 1;
                    disp = ((b1 & 0x0F) << 8) | b2;
                  }
                  let copyPos = outPos - (disp + 1);
                  if (copyPos < 0) return null;
                  for (let j = 0; j < len && outPos < outLen; j++) out[outPos++] = out[copyPos++];
                }
              }
            }
            return outPos === outLen ? out : null;
          };
          const decodeRle = (src, start) => {
            if (start + 4 > src.length || src[start] !== 0x30) return null;
            const outLen = src[start + 1] | (src[start + 2] << 8) | (src[start + 3] << 16);
            const out = new Uint8Array(outLen);
            let inPos = start + 4;
            let outPos = 0;
            while (outPos < outLen && inPos < src.length) {
              const h = src[inPos++];
              const runLen = (h & 0x7F) + 1;
              if (h & 0x80) {
                const v = src[inPos++];
                for (let i = 0; i < runLen && outPos < outLen; i++) out[outPos++] = v;
              } else {
                for (let i = 0; i < runLen && outPos < outLen; i++) out[outPos++] = src[inPos++];
              }
            }
            return outPos === outLen ? out : null;
          };
          const decodeYaz0 = (src, start) => {
            if (start + 16 > src.length) return null;
            if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x7A || src[start + 3] !== 0x30) return null;
            const outLen =
              ((src[start + 4] << 24) >>> 0) |
              (src[start + 5] << 16) |
              (src[start + 6] << 8) |
              src[start + 7];
            if (outLen <= 0) return null;
            const out = new Uint8Array(outLen);
            let inPos = start + 16;
            let outPos = 0;
            let code = 0;
            let validBits = 0;
            while (outPos < outLen && inPos < src.length) {
              if (validBits === 0) {
                code = src[inPos++];
                validBits = 8;
              }
              if ((code & 0x80) !== 0) {
                out[outPos++] = src[inPos++];
              } else {
                if (inPos + 1 >= src.length) return null;
                const b1 = src[inPos++];
                const b2 = src[inPos++];
                const dist = ((b1 & 0x0F) << 8) | b2;
                let copyPos = outPos - (dist + 1);
                if (copyPos < 0) return null;
                let len = b1 >> 4;
                if (len === 0) {
                  if (inPos >= src.length) return null;
                  len = src[inPos++] + 0x12;
                } else {
                  len += 2;
                }
                for (let i = 0; i < len && outPos < outLen; i++) out[outPos++] = out[copyPos++];
              }
              code = (code << 1) & 0xFF;
              validBits--;
            }
            return outPos === outLen ? out : null;
          };
          const decodeMio0 = (src, start) => {
            if (start + 16 > src.length) return null;
            if (src[start] !== 0x4D || src[start + 1] !== 0x49 || src[start + 2] !== 0x4F || src[start + 3] !== 0x30) return null;
            const outLen =
              ((src[start + 4] << 24) >>> 0) |
              (src[start + 5] << 16) |
              (src[start + 6] << 8) |
              src[start + 7];
            const compOff =
              ((src[start + 8] << 24) >>> 0) |
              (src[start + 9] << 16) |
              (src[start + 10] << 8) |
              src[start + 11];
            const rawOff =
              ((src[start + 12] << 24) >>> 0) |
              (src[start + 13] << 16) |
              (src[start + 14] << 8) |
              src[start + 15];
            if (outLen <= 0 || compOff < 16 || rawOff < 16) return null;
            let layoutPos = start + 16;
            let compPos = start + compOff;
            let rawPos = start + rawOff;
            if (layoutPos >= src.length || compPos >= src.length || rawPos >= src.length) return null;
            const out = new Uint8Array(outLen);
            let outPos = 0;
            let layout = 0;
            let bitsLeft = 0;
            while (outPos < outLen) {
              if (bitsLeft === 0) {
                if (layoutPos >= src.length) return null;
                layout = src[layoutPos++];
                bitsLeft = 8;
              }
              const isRaw = (layout & 0x80) !== 0;
              layout = (layout << 1) & 0xFF;
              bitsLeft--;
              if (isRaw) {
                if (rawPos >= src.length) return null;
                out[outPos++] = src[rawPos++];
              } else {
                if (compPos + 1 >= src.length) return null;
                const b1 = src[compPos++];
                const b2 = src[compPos++];
                const len = (b1 >> 4) + 3;
                const disp = ((b1 & 0x0F) << 8) | b2;
                let copyPos = outPos - (disp + 1);
                if (copyPos < 0) return null;
                for (let i = 0; i < len && outPos < outLen; i++) out[outPos++] = out[copyPos++];
              }
            }
            return out;
          };
          const decodeYay0 = (src, start) => {
            if (start + 16 > src.length) return null;
            if (src[start] !== 0x59 || src[start + 1] !== 0x61 || src[start + 2] !== 0x79 || src[start + 3] !== 0x30) return null;
            const outLen =
              ((src[start + 4] << 24) >>> 0) |
              (src[start + 5] << 16) |
              (src[start + 6] << 8) |
              src[start + 7];
            const linkOff =
              ((src[start + 8] << 24) >>> 0) |
              (src[start + 9] << 16) |
              (src[start + 10] << 8) |
              src[start + 11];
            const rawOff =
              ((src[start + 12] << 24) >>> 0) |
              (src[start + 13] << 16) |
              (src[start + 14] << 8) |
              src[start + 15];
            if (outLen <= 0 || linkOff < 16 || rawOff < 16) return null;
            let maskPos = start + 16;
            let linkPos = start + linkOff;
            let rawPos = start + rawOff;
            if (maskPos >= src.length || linkPos >= src.length || rawPos >= src.length) return null;
            const out = new Uint8Array(outLen);
            let outPos = 0;
            let mask = 0;
            let bitsLeft = 0;
            while (outPos < outLen) {
              if (bitsLeft === 0) {
                if (maskPos + 3 >= src.length) return null;
                mask = ((src[maskPos] << 24) >>> 0) | (src[maskPos + 1] << 16) | (src[maskPos + 2] << 8) | src[maskPos + 3];
                maskPos += 4;
                bitsLeft = 32;
              }
              const isRaw = (mask & 0x80000000) !== 0;
              mask = (mask << 1) >>> 0;
              bitsLeft--;
              if (isRaw) {
                if (rawPos >= src.length) return null;
                out[outPos++] = src[rawPos++];
              } else {
                if (linkPos + 1 >= src.length) return null;
                const b1 = src[linkPos++];
                const b2 = src[linkPos++];
                const disp = ((b1 & 0x0F) << 8) | b2;
                let len = b1 >> 4;
                if (len === 0) {
                  if (rawPos >= src.length) return null;
                  len = src[rawPos++] + 0x12;
                } else {
                  len += 2;
                }
                let copyPos = outPos - (disp + 1);
                if (copyPos < 0) return null;
                for (let i = 0; i < len && outPos < outLen; i++) out[outPos++] = out[copyPos++];
              }
            }
            return out;
          };

          self.onmessage = (e) => {
            const { type } = e.data || {};
            if (type !== 'runUnitTests') return;
            const tests = [];
            const pass = (name, info) => tests.push({ name, pass: true, info: info || '' });
            const fail = (name, info) => tests.push({ name, pass: false, info: info || '' });
            const assert = (name, cond, infoOk, infoFail) => cond ? pass(name, infoOk) : fail(name, infoFail || 'Assertion failed');

            try {
              const map = new Map([
                ['A', new Uint8Array([0x41])],
                ['B', new Uint8Array([0x42])],
                ['AB', new Uint8Array([0x7E])],
                ['[LINE]', new Uint8Array([0x0A])],
                ['[END]', new Uint8Array([0x00])]
              ]);
              const tokenizer = createTokenizer(['AB', 'A', 'B', '[LINE]', '[END]']);
              const encodedLegacy = smartTextParse('AB', tokenizer, map, false, { enableDteMte: true, strategy: 'legacy' });
              assert('Legacy encode basic', encodedLegacy.length === 1 && encodedLegacy[0] === 0x7E, 'AB encoded as single token', 'Unexpected bytes: ' + Array.from(encodedLegacy).join(','));

              const dpMap = new Map([
                ['A', new Uint8Array([0x01])],
                ['B', new Uint8Array([0x02])],
                ['ABA', new Uint8Array([0xF0, 0xF1])],
                ['AB', new Uint8Array([0x10])]
              ]);
              const dpTok = createTokenizer(['ABA', 'AB', 'A', 'B']);
              const encodedOptimal = smartTextParse('ABAB', dpTok, dpMap, false, { enableDteMte: true, strategy: 'optimal' });
              assert('Optimal DTE/MTE DP encode', encodedOptimal.length === 2 && encodedOptimal[0] === 0x10 && encodedOptimal[1] === 0x10, 'DP selected AB+AB', 'Unexpected optimal bytes: ' + Array.from(encodedOptimal).join(','));

              const padded = smartTextParse('A', tokenizer, map, true, { enableDteMte: true, strategy: 'optimal' });
              assert('DWE padding insert', padded.length === 2 && padded[0] === 0x41 && padded[1] === 0x00, 'Padding inserted after single-byte token', 'Unexpected padded bytes: ' + Array.from(padded).join(','));

              const newlineEncoded = smartTextParse('A\\nB', tokenizer, map, false, { enableDteMte: true, strategy: 'optimal' });
              assert('Newline mapping', newlineEncoded.length === 3 && newlineEncoded[1] === 0x0A, 'Newline mapped through [LINE]', 'Unexpected newline bytes: ' + Array.from(newlineEncoded).join(','));

              const noCompression = smartTextParse('AB', tokenizer, map, false, { enableDteMte: false, strategy: 'optimal' });
              assert('Compression toggle off', noCompression.length === 2 && noCompression[0] === 0x41 && noCompression[1] === 0x42, 'DTE/MTE disabled uses single-char encoding', 'Unexpected no-compression bytes: ' + Array.from(noCompression).join(','));

              const endTokenNoPad = smartTextParse('A[END]', tokenizer, map, true, { enableDteMte: true, strategy: 'optimal' });
              assert('No padding after [END]', endTokenNoPad.length === 3 && endTokenNoPad[0] === 0x41 && endTokenNoPad[1] === 0x00 && endTokenNoPad[2] === 0x00, 'Padding excluded for terminator token', 'Unexpected [END] padded bytes: ' + Array.from(endTokenNoPad).join(','));

              const lzSample = new Uint8Array([0x10, 0x03, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43]);
              const lzOut = decodeLz10(lzSample, 0);
              assert('LZ10 decode sample', !!lzOut && String.fromCharCode(...lzOut) === 'ABC', 'LZ10 sample decoded', 'LZ10 decode failed');

              const lz11Sample = new Uint8Array([0x11, 0x03, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43]);
              const lz11Out = decodeLz11(lz11Sample, 0);
              assert('LZ11 decode sample', !!lz11Out && String.fromCharCode(...lz11Out) === 'ABC', 'LZ11 sample decoded', 'LZ11 decode failed');

              const rleSample = new Uint8Array([0x30, 0x05, 0x00, 0x00, 0x84, 0x41]);
              const rleOut = decodeRle(rleSample, 0);
              assert('RLE decode sample', !!rleOut && String.fromCharCode(...rleOut) === 'AAAAA', 'RLE sample decoded', 'RLE decode failed');

              const yaz0Sample = new Uint8Array([0x59, 0x61, 0x7A, 0x30, 0x00, 0x00, 0x00, 0x03, 0,0,0,0,0,0,0,0, 0xE0, 0x41, 0x42, 0x43]);
              const yaz0Out = decodeYaz0(yaz0Sample, 0);
              assert('Yaz0 decode sample', !!yaz0Out && String.fromCharCode(...yaz0Out) === 'ABC', 'Yaz0 sample decoded', 'Yaz0 decode failed');

              const mio0Sample = new Uint8Array([0x4D, 0x49, 0x4F, 0x30, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x11, 0x00, 0x00, 0x00, 0x11, 0xE0, 0x41, 0x42, 0x43]);
              const mio0Out = decodeMio0(mio0Sample, 0);
              assert('MIO0 decode sample', !!mio0Out && String.fromCharCode(...mio0Out) === 'ABC', 'MIO0 sample decoded', 'MIO0 decode failed');

              const yay0Sample = new Uint8Array([0x59, 0x61, 0x79, 0x30, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x14, 0xE0, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43]);
              const yay0Out = decodeYay0(yay0Sample, 0);
              assert('Yay0 decode sample', !!yay0Out && String.fromCharCode(...yay0Out) === 'ABC', 'Yay0 sample decoded', 'Yay0 decode failed');

              const badRle = decodeRle(new Uint8Array([0x30, 0x10, 0x00, 0x00, 0x80]), 0);
              assert('RLE invalid stream guard', badRle === null, 'Invalid RLE rejected', 'Invalid RLE should be rejected');

              const nes = new Uint8Array(32);
              nes[0] = 0x4E; nes[1] = 0x45; nes[2] = 0x53; nes[3] = 0x1A;
              const detected = detectSystem('test.nes', nes);
              assert('System detection NES', detected && detected.system && detected.system.name === 'NES', 'NES detected from header', 'Detected: ' + ((detected && detected.system && detected.system.name) || 'unknown'));

              const gba = new Uint8Array(0x2000);
              const sig = 'NINTENDO';
              for (let i = 0; i < sig.length; i++) gba[0x104 + i] = sig.charCodeAt(i);
              const detectedGba = detectSystem('test.bin', gba);
              assert('System detection GBA header', detectedGba && detectedGba.system && detectedGba.system.name === 'GBA', 'GBA detected from header', 'Detected: ' + ((detectedGba && detectedGba.system && detectedGba.system.name) || 'unknown'));

              const mapWasmCore = (name) => {
                const system = String(name || 'Unknown');
                const map = {
                  'NES': 'fceumm',
                  'SNES': 'snes9x',
                  'Game Boy': 'gambatte',
                  'GBC': 'sameboy',
                  'GBA': 'mgba',
                  'Sega Genesis/MD': 'genesis_plus_gx',
                  'NDS': 'desmume',
                  'PlayStation 1': 'pcsx_rearmed'
                };
                return map[system] || 'generic';
              };
              const normalizeCoreAlias = (value) => {
                const v = String(value || '').trim().toLowerCase();
                if (!v) return '';
                if (v === 'mgba' || v === 'gba' || v === 'gpsp') return 'gba';
                if (v === 'fceumm' || v === 'nestopia' || v === 'nes') return 'nes';
                if (v === 'snes9x' || v === 'mesen-s' || v === 'snes') return 'snes';
                if (v === 'gambatte' || v === 'sameboy' || v === 'gb') return 'gb';
                if (v === 'genesis_plus_gx' || v === 'segamd' || v === 'genesis') return 'genesis';
                if (v === 'desmume' || v === 'melonds' || v === 'nds') return 'nds';
                if (v === 'pcsx_rearmed' || v === 'swanstation' || v === 'psx' || v === 'ps1') return 'ps1';
                return v;
              };
              assert('WASM core mapping NES', mapWasmCore('NES') === 'fceumm', 'NES->fceumm', 'Unexpected NES core mapping');
              assert('WASM core mapping SNES', mapWasmCore('SNES') === 'snes9x', 'SNES->snes9x', 'Unexpected SNES core mapping');
              assert('WASM core mapping GB', mapWasmCore('Game Boy') === 'gambatte', 'GB->gambatte', 'Unexpected GB core mapping');
              assert('WASM core mapping GBC', mapWasmCore('GBC') === 'sameboy', 'GBC->sameboy', 'Unexpected GBC core mapping');
              assert('WASM core mapping GBA', mapWasmCore('GBA') === 'mgba', 'GBA->mgba', 'Unexpected GBA core mapping');
              assert('WASM core mapping Genesis', mapWasmCore('Sega Genesis/MD') === 'genesis_plus_gx', 'Genesis->genesis_plus_gx', 'Unexpected Genesis core mapping');
              assert('WASM core mapping NDS', mapWasmCore('NDS') === 'desmume', 'NDS->desmume', 'Unexpected NDS core mapping');
              assert('WASM core mapping PS1', mapWasmCore('PlayStation 1') === 'pcsx_rearmed', 'PS1->pcsx_rearmed', 'Unexpected PS1 core mapping');
              assert('WASM core mapping fallback', mapWasmCore('Nintendo 64') === 'generic', 'Fallback->generic', 'Unexpected fallback mapping');
              assert('WASM core alias GBA compat', normalizeCoreAlias('mgba') === normalizeCoreAlias('gba'), 'mgba/gba alias normalized', 'GBA alias normalization mismatch');
              assert('WASM core alias SNES compat', normalizeCoreAlias('snes9x') === normalizeCoreAlias('snes'), 'snes9x/snes alias normalized', 'SNES alias normalization mismatch');

              const parseNumericLike = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return NaN;
                if (/^0x[0-9a-f]+$/i.test(raw)) return parseInt(raw, 16);
                if (/^[0-9]+$/i.test(raw)) return parseInt(raw, 10);
                return NaN;
              };
              assert('Numeric parse hex offset', parseNumericLike('0xEA860') === 0xEA860, 'Hex parsed', 'Hex parse failed');
              assert('Numeric parse decimal offset', parseNumericLike('1536') === 1536, 'Decimal parsed', 'Decimal parse failed');
              assert('Numeric parse invalid offset', Number.isNaN(parseNumericLike('0xZZZZ')), 'Invalid rejected', 'Invalid parse should be NaN');

              const normalizePreviewText = (value) => String(value || '')
                .replace(/\\r\\n/g, '\\n')
                .replace(/\\r/g, '\\n')
                .replace(/\\[LINE\\]/gi, '\\n')
                .replace(/\\//g, '\\n')
                .replace(/\\[[^\\]]+\\]/g, ' ')
                .replace(/\\n{2,}/g, '\\n')
                .replace(/[ \\t]*\\n[ \\t]*/g, '\\n')
                .replace(/[ \\t]+/g, ' ')
                .trim();
              const digestPreviewText = (value) => {
                const src = normalizePreviewText(value);
                let hash = 0;
                for (let i = 0; i < src.length; i++) hash = ((hash * 33) ^ src.charCodeAt(i)) >>> 0;
                return hash >>> 0;
              };
              const digestA = digestPreviewText('[NAME]Hello/[LINE]World');
              const digestB = digestPreviewText('Hello\\nWorld');
              assert('Preview text normalize/digest stable', digestA === digestB, 'Digest is stable across control token variants', 'Digest mismatch across equivalent preview text');
              assert('Preview text normalize strips controls', normalizePreviewText('[MINA]Hello') === 'Hello', 'Control token removed for preview text', 'Control token should be removed');
              const strictAsciiRegex = /^[A-Za-z0-9\\s.,!?\"':;()\\-\\/]+$/;
              const strictDialogCueRegex = /(\\[[A-Z0-9 _\\-]+\\])|([a-z]{2,}.*[.!?])|\\b(hey|looks|coming|name|is|the|you|your|i|we|he|she|they|who|what|where|when|why|how|yes|no)\\b/i;
              const strictTitleNoiseRegex = /\\b(press\\s+start|new\\s+game|continue|option|konami|nintendo|square\\s+enix|disney|copyright|all\\s+rights\\s+reserved|licensed\\s+by|game\\s+boy|advance|chapter\\s+of\\s+memories|chain\\s+of\\s+memories|title\\s+screen)\\b/i;
              const strictSceneBoundsFilter = (decodedText) => {
                const value = String(decodedText || '');
                const withoutControls = value.replace(/\\[[^\\]]+\\]/g, ' ').replace(/\\s+/g, ' ').trim();
                if (!withoutControls) return false;
                if (!strictAsciiRegex.test(withoutControls)) return false;
                const printableCount = (withoutControls.match(/[A-Za-z0-9\\s.,!?\"':;()\\-\\/]/g) || []).length;
                const printableRatio = printableCount / Math.max(1, withoutControls.length);
                if (printableRatio < 0.78) return false;
                const hasDialogCue = strictDialogCueRegex.test(value);
                const hasTitleNoise = strictTitleNoiseRegex.test(withoutControls);
                if (hasTitleNoise && !hasDialogCue) return false;
                if (!hasDialogCue) return false;
                return true;
              };
              assert('Strict bounds rejects title-token text', strictSceneBoundsFilter('PRESS START') === false, 'Title token rejected in strict bounds', 'Strict bounds should reject title token text');
              assert('Strict bounds accepts dialog-token text', strictSceneBoundsFilter('[MINA]Hey, looks like he\\'s coming to.') === true, 'Dialog token accepted in strict bounds', 'Strict bounds should accept dialog token text');

              const buildAck = (payload) => ({
                frameId: Number(payload?.frameId) || 0,
                core: String(payload?.core || ''),
                coreHint: String(payload?.coreHint || ''),
                textDigest: Number(payload?.textDigest) || 0
              });
              const ack = buildAck({ frameId: 42, core: 'gba', coreHint: 'mgba', textDigest: 12345 });
              assert('Preview ACK shape frame/core', ack.frameId === 42 && ack.core === 'gba', 'ACK shape preserved', 'ACK shape mismatch');
              assert('Preview ACK shape digest', ack.textDigest === 12345, 'ACK digest preserved', 'ACK digest mismatch');
              assert('Preview core ready ack payload', buildAck({ core: 'gba', coreHint: 'mgba' }).coreHint === 'mgba', 'Core-ready payload includes coreHint', 'Missing coreHint in ACK payload');
              assert('Preview HUD text sync normalize', normalizePreviewText('[MINA]Hey/[LINE]Hello') === 'Hey\\nHello', 'HUD normalize keeps dialog lines', 'HUD normalize mismatch');
              const mockSaveStateResult = {
                requestId: 7,
                ok: true,
                saveStateBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
                length: 4
              };
              const saveStateBytes = mockSaveStateResult.saveStateBuffer ? new Uint8Array(mockSaveStateResult.saveStateBuffer) : new Uint8Array(0);
              assert(
                'Runtime save-state schema',
                mockSaveStateResult.ok === true && Number(mockSaveStateResult.requestId) > 0 && saveStateBytes.byteLength > 0,
                'Save-state payload schema is valid',
                'Save-state payload schema mismatch'
              );
              const mockLoadStateResult = {
                requestId: 8,
                ok: true,
                loadedBytes: 4,
                reason: 'state-restored'
              };
              assert(
                'Runtime load-state schema',
                mockLoadStateResult.ok === true && Number(mockLoadStateResult.requestId) > 0 && Number(mockLoadStateResult.loadedBytes) > 0,
                'Load-state payload schema is valid',
                'Load-state payload schema mismatch'
              );
              const extractCodeFromMultiHex = (hexKey) => {
                const key = String(hexKey || '').toUpperCase().replace(/[^0-9A-F]/g, '');
                if (!key || (key.length % 2) !== 0) return null;
                if (key.length === 2) return parseInt(key, 16) & 0xFF;
                const bytes = [];
                for (let i = 0; i < key.length; i += 2) bytes.push(parseInt(key.slice(i, i + 2), 16) & 0xFF);
                const nonZero = bytes.filter((b) => b !== 0x00);
                if (nonZero.length === 1) return nonZero[0] & 0xFF;
                if (bytes.length === 2) {
                  const hi = bytes[0] & 0xFF;
                  const lo = bytes[1] & 0xFF;
                  if (hi === 0x00 && lo !== 0x00) return lo;
                  if (lo === 0x00 && hi !== 0x00) return hi;
                  if ((hi >= 0x80 && hi <= 0x9F) || hi >= 0xE0) return lo;
                  return lo;
                }
                return bytes[bytes.length - 1] & 0xFF;
              };
              assert(
                'Font map multi-byte LE padded',
                extractCodeFromMultiHex('4100') === 0x41,
                '4100 resolved to tile code 0x41',
                'Failed to resolve LE padded glyph code'
              );
              assert(
                'Font map multi-byte BE padded',
                extractCodeFromMultiHex('0041') === 0x41,
                '0041 resolved to tile code 0x41',
                'Failed to resolve BE padded glyph code'
              );
            } catch (error) {
              fail('Worker exception', error.message || String(error));
            }

            const passed = tests.filter(t => t.pass).length;
            const failed = tests.length - passed;
            self.postMessage({
              type: 'unitTestResult',
              tests,
              summary: 'Unit tests completed: ' + passed + '/' + tests.length + ' passed, ' + failed + ' failed.',
              passed,
              failed,
              total: tests.length
            });
          };
      `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };
    const createRuntimeRamWorker = () => {
      const workerCode = `
          self.onmessage = async (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'runtimeSearch') return;
            try {
              const { ramBuffer, queryBuffer, limit = 2048, textId = null } = payload || {};
              if (!ramBuffer || !queryBuffer) throw new Error('Missing RAM or query buffer.');
              const ram = new Uint8Array(ramBuffer);
              const query = new Uint8Array(queryBuffer);
              if (query.length < 2) throw new Error('Runtime query must be at least 2 bytes.');
              if (ram.length < query.length) {
                self.postMessage({ type: 'runtimeSearchResult', hits: [], textId, queryByteLength: query.length });
                return;
              }

              const hits = [];
              const maxStart = ram.length - query.length;
              const maxHits = Math.max(1, Number(limit) || 2048);
              for (let i = 0; i <= maxStart; i++) {
                let matched = true;
                for (let j = 0; j < query.length; j++) {
                  if ((ram[i + j] & 0xFF) !== (query[j] & 0xFF)) {
                    matched = false;
                    break;
                  }
                }
                if (matched) {
                  hits.push(i);
                  if (hits.length >= maxHits) break;
                }
                if ((i % 131072) === 0) {
                  const progress = Math.max(0, Math.min(100, Math.floor((i / Math.max(1, maxStart)) * 100)));
                  self.postMessage({ type: 'runtimeSearchProgress', value: progress });
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
              }
              self.postMessage({ type: 'runtimeSearchResult', hits, textId, queryByteLength: query.length, capped: hits.length >= maxHits });
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Runtime RAM worker failed: ' + error.message, stack: error.stack });
            }
          };
        `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createRuntimeVizWorker = () => {
      const workerCode = `
          const grayscale = [
            [6, 14, 20, 255],
            [64, 84, 98, 255],
            [134, 166, 182, 255],
            [228, 240, 245, 255]
          ];
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const decodeNesTile = (src, tileOffset, out, width, x0, y0) => {
            if (tileOffset + 16 > src.length) return;
            for (let y = 0; y < 8; y++) {
              const p0 = src[tileOffset + y];
              const p1 = src[tileOffset + y + 8];
              for (let x = 0; x < 8; x++) {
                const bit = 7 - x;
                const idx = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1);
                const c = grayscale[idx] || grayscale[0];
                const p = ((y0 + y) * width + (x0 + x)) * 4;
                out[p] = c[0];
                out[p + 1] = c[1];
                out[p + 2] = c[2];
                out[p + 3] = c[3];
              }
            }
          };
          const parseNesPpuRange = (bytes) => {
            if (!bytes || bytes.length === 0) return { chr: null, nametable: null, summary: 'Empty dump.' };
            if (bytes.length >= 0x3000) {
              return {
                chr: bytes.subarray(0, 0x2000),
                nametable: bytes.subarray(0x2000, 0x23C0),
                summary: 'NES PPU memory map: pattern table 0x0000-0x1FFF, nametable 0x2000-0x23BF, attributes 0x23C0-0x23FF.'
              };
            }
            if (bytes.length >= 0x23C0) {
              return {
                chr: bytes.subarray(0, 0x2000),
                nametable: bytes.subarray(0x2000, 0x23C0),
                summary: 'NES dump interpreted as direct PPU domain.'
              };
            }
            if (bytes.length >= 0x2000) {
              return {
                chr: bytes.subarray(0, 0x2000),
                nametable: null,
                summary: 'Dump has pattern table only. Nametable missing.'
              };
            }
            return { chr: bytes, nametable: null, summary: 'Small dump; partial pattern data only.' };
          };
          const renderNesTilemap = async (bytes) => {
            const parsed = parseNesPpuRange(bytes);
            const chr = parsed.chr || bytes;
            const nametable = parsed.nametable;
            const cols = 32;
            const rows = 30;
            const width = cols * 8;
            const height = rows * 8;
            const pixels = new Uint8ClampedArray(width * height * 4);
            const mapPreview = [];
            for (let ty = 0; ty < rows; ty++) {
              const rowTokens = [];
              for (let tx = 0; tx < cols; tx++) {
                const ntIndex = ty * cols + tx;
                const tileIndex = nametable && ntIndex < nametable.length ? nametable[ntIndex] : ((ntIndex) & 0xFF);
                rowTokens.push(tileIndex.toString(16).toUpperCase().padStart(2, '0'));
                const tileOffset = (tileIndex * 16) % Math.max(16, chr.length);
                decodeNesTile(chr, tileOffset, pixels, width, tx * 8, ty * 8);
              }
              if (ty < 10) mapPreview.push(rowTokens.join(' '));
              if (ty % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
            return {
              width,
              height,
              pixels,
              summary: parsed.summary,
              details: [
                'Rendered off-main-thread from NES tile/nametable/PPU map.',
                'Top 10 nametable rows (hex tile indexes):',
                ...mapPreview
              ].join('\\n')
            };
          };
          const renderGbaVram = async (bytes) => {
            const source = bytes.length > 0x18000 ? bytes.subarray(0, 0x18000) : bytes;
            const cols = 32;
            const rows = 32;
            const width = cols * 8;
            const height = rows * 8;
            const pixels = new Uint8ClampedArray(width * height * 4);
            for (let tile = 0; tile < cols * rows; tile++) {
              const tx = (tile % cols) * 8;
              const ty = Math.floor(tile / cols) * 8;
              const base = tile * 32;
              if (base + 32 > source.length) break;
              for (let y = 0; y < 8; y++) {
                const row = base + y * 4;
                for (let x = 0; x < 8; x++) {
                  const b = source[row + (x >> 1)];
                  const idx = (x & 1) === 0 ? (b & 0x0F) : ((b >> 4) & 0x0F);
                  const shade = clamp(Math.floor((idx / 15) * 255), 0, 255);
                  const p = ((ty + y) * width + (tx + x)) * 4;
                  pixels[p] = shade;
                  pixels[p + 1] = (shade * 3) >> 2;
                  pixels[p + 2] = clamp(40 + shade, 0, 255);
                  pixels[p + 3] = 255;
                }
              }
              if (tile % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
            return {
              width,
              height,
              pixels,
              summary: 'GBA VRAM domain render (0x06000000 region expected).',
              details: 'Rendered off-main-thread from 4bpp tile data. Use emulator memory-domain scripting to stream VRAM snapshots.'
            };
          };
          self.onmessage = async (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'runtimeVizRender') return;
            try {
              const { dumpBuffer, systemName, domainMode } = payload || {};
              if (!dumpBuffer) throw new Error('Runtime domain dump is missing.');
              const bytes = new Uint8Array(dumpBuffer);
              const lowSystem = String(systemName || '').toLowerCase();
              let mode = String(domainMode || 'auto').toLowerCase();
              if (mode === 'auto') {
                mode = lowSystem.includes('nes') ? 'nes_ppu' : (lowSystem.includes('gba') ? 'gba_vram' : 'nes_ppu');
              }
              let rendered;
              if (mode === 'gba_vram') rendered = await renderGbaVram(bytes);
              else rendered = await renderNesTilemap(bytes);
              self.postMessage({
                type: 'runtimeVizResult',
                mode,
                width: rendered.width,
                height: rendered.height,
                pixels: rendered.pixels.buffer,
                summary: rendered.summary,
                details: rendered.details
              }, [rendered.pixels.buffer]);
            } catch (error) {
              self.postMessage({ type: 'error', message: 'Runtime Viz worker failed: ' + error.message, stack: error.stack });
            }
          };
      `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createPreviewAssertWorker = () => {
      const workerCode = `
          const normalizeCoreAlias = (value) => {
            const v = String(value || '').trim().toLowerCase();
            if (!v) return '';
            if (v === 'mgba' || v === 'gba' || v === 'gpsp') return 'gba';
            if (v === 'fceumm' || v === 'nestopia' || v === 'nes') return 'nes';
            if (v === 'snes9x' || v === 'mesen-s' || v === 'snes') return 'snes';
            if (v === 'gambatte' || v === 'sameboy' || v === 'gb') return 'gb';
            if (v === 'genesis_plus_gx' || v === 'segamd' || v === 'genesis') return 'genesis';
            if (v === 'desmume' || v === 'melonds' || v === 'nds') return 'nds';
            if (v === 'pcsx_rearmed' || v === 'swanstation' || v === 'psx' || v === 'ps1') return 'ps1';
            return v;
          };
              const normalizePreviewText = (value) => String(value || '')
                .replace(/\\r\\n/g, '\\n')
                .replace(/\\r/g, '\\n')
                .replace(/\\[LINE\\]/gi, '\\n')
                .replace(/\\//g, '\\n')
                .replace(/\\[[^\\]]+\\]/g, ' ')
                .replace(/\\n{2,}/g, '\\n')
                .replace(/[ \\t]*\\n[ \\t]*/g, '\\n')
                .replace(/[ \\t]+/g, ' ')
                .trim();
          const digestPreviewText = (value) => {
            const src = normalizePreviewText(value);
            let hash = 0;
            for (let i = 0; i < src.length; i++) hash = ((hash * 33) ^ src.charCodeAt(i)) >>> 0;
            return hash >>> 0;
          };
          self.onmessage = (e) => {
            const { type, payload } = e.data || {};
            if (type !== 'assertPreviewAck') return;
            const requestId = Number(payload?.requestId) || 0;
            const expectedFrameId = Number(payload?.expectedFrameId) || 0;
            const expectedCore = String(payload?.expectedCore || '');
            const expectedDigest = digestPreviewText(payload?.expectedText || '');
            const ack = payload?.ack || {};
            const ackFrameId = Number(ack?.frameId) || 0;
            const ackCore = String(ack?.core || '');
            const ackCoreHint = String(ack?.coreHint || '');
            const ackDigest = Number(ack?.textDigest) || 0;
            const framePass = ackFrameId === expectedFrameId;
            const corePass = (ackCore === expectedCore) ||
              (ackCoreHint === expectedCore) ||
              (normalizeCoreAlias(ackCore) === normalizeCoreAlias(expectedCore)) ||
              (normalizeCoreAlias(ackCoreHint) === normalizeCoreAlias(expectedCore));
            const digestPass = ackDigest === expectedDigest;
            self.postMessage({
              type: 'previewAssertResult',
              requestId,
              pass: framePass && corePass && digestPass,
              details: {
                framePass,
                corePass,
                digestPass,
                expectedFrameId,
                ackFrameId,
                expectedCore,
                ackCore,
                ackCoreHint,
                expectedDigest,
                ackDigest
              }
            });
          };
      `;
      return new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
    };

    const createBuildWorker = () => {
      const workerFunctions =
        'const escapeRegex = ' + escapeRegex.toString() + ';\n' +
        'const createTokenizer = ' + createTokenizer.toString() + ';\n' +
        'const smartTextParse = ' + smartTextParse.toString() + ';\n' +
        'const rebuildRom = ' + rebuildRom.toString() + ';\n';

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

                      const { modifiedRom: newRomData, relocationLog } = rebuildRom(
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
                      const relocationLog = Array.isArray(replay?.relocationLog) ? replay.relocationLog : [];
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

    const applyPatch = (romData, patchData, patchType) => {
      if (patchType !== 'ips') throw new Error(`Patch type '${patchType}' is not supported.`);
      const patchHeader = "PATCH";
      const patchEOF = "EOF";
      for (let i = 0; i < patchHeader.length; i++) {
        if (patchData[i] !== patchHeader.charCodeAt(i)) throw new Error("Invalid IPS patch header.");
      }

      let offset = patchHeader.length;
      let modifiedRom = new Uint8Array(romData);

      while (offset < patchData.length) {
        if (patchData[offset] === patchEOF.charCodeAt(0) && patchData[offset + 1] === patchEOF.charCodeAt(1) && patchData[offset + 2] === patchEOF.charCodeAt(2)) {
          return modifiedRom;
        }

        const recOffset = (patchData[offset] << 16) | (patchData[offset + 1] << 8) | patchData[offset + 2];
        offset += 3;
        const recSize = (patchData[offset] << 8) | patchData[offset + 1];
        offset += 2;

        // Grow ROM if patch writes past the end
        if (recOffset + recSize > modifiedRom.length) {
          const newRom = new Uint8Array(recOffset + recSize);
          newRom.set(modifiedRom);
          modifiedRom = newRom;
        }

        if (recSize > 0) { // Standard record
          for (let i = 0; i < recSize; i++) {
            modifiedRom[recOffset + i] = patchData[offset + i];
          }
          offset += recSize;
        } else { // RLE record
          const rleSize = (patchData[offset] << 8) | patchData[offset + 1];
          offset += 2;
          const rleByte = patchData[offset];
          offset += 1;

          if (recOffset + rleSize > modifiedRom.length) {
            const newRom = new Uint8Array(recOffset + rleSize);
            newRom.set(modifiedRom);
            modifiedRom = newRom;
          }
          modifiedRom.fill(rleByte, recOffset, recOffset + rleSize);
        }
      }
      return modifiedRom;
    };

    const exportCSV = (texts, fileName) => {
      const csvRows = ["ID,Offset,Original Text,Translated Text"];
      texts.forEach(text => {
        const original = `"${(text.originalText || '').replace(/"/g, '""').replace(/\n/g, '\\n')}"`;
        const translated = `"${(text.translatedText || '').replace(/"/g, '""').replace(/\n/g, '\\n')}"`;
        csvRows.push(`${text.id},${text.offset},${original},${translated}`);
      });
      const csvString = csvRows.join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a"); const url = URL.createObjectURL(blob);
      link.href = url; link.download = fileName;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const parseCSV = (csvContent) => {
      const translationsMap = new Map();
      const lines = csvContent.replace(/\r/g, '').split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cols = [];
        let currentField = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            if (inQuotes && line[j + 1] === '"') {
              currentField += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            cols.push(currentField);
            currentField = '';
          } else {
            currentField += char;
          }
        }
        cols.push(currentField);

        if (cols.length >= 4) {
          const id = parseInt(cols[0], 10);
          const translation = cols[3]?.replace(/\\n/g, '\n') || '';
          if (!isNaN(id)) {
            translationsMap.set(id, translation);
          }
        }
      }
      if (translationsMap.size === 0) {
        throw new Error("CSV file is empty or in an incorrect format.");
      }
      return translationsMap;
    };

    const aiTranslateText = async (text, sourceLang, targetLang, onProgress) => {
      if (!text) return "";
      onProgress(30); const processedText = text.replace(/\n/g, ' <br> ');
      const langPair = `${sourceLang}|${targetLang}`; const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(processedText)}&langpair=${langPair}`;
      try {
        const response = await fetch(url); onProgress(70);
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Translation API error.');
        onProgress(100);
        return (data.responseData.translatedText || text).replace(/ <br> /g, '\n').replace(/<br>/g, '\n');
      } catch (error) {
        console.error("Translation API error:", error);
        let errorMessage = "Translation API failed: ";
        if (error.name === 'AbortError') {
          errorMessage += "Request aborted.";
        } else if (error.message) {
          errorMessage += error.message;
        } else {
          errorMessage += "Unknown error.";
        }
        throw new Error(errorMessage);
      }
    };
