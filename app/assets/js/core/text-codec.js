/* Text codecs the workbench shares: escapeRegex, createTokenizer,
   smartTextParse and getSmartByteLength, moved out of the legacy core.js. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

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
            const isExactCase = seg === cand.token;
            // A token may be written in another case than the table lists it
            // ("[line]" for "[LINE]"), which is why the uppercase form is
            // accepted at all. For a single character that leniency is wrong:
            // "T" and "t" are different codes, and the lowercase token used to
            // win the tie, so every capital letter was written with the code of
            // its lowercase form.
            const isLooseCase = !isExactCase && sourceUpper.slice(i, end) === cand.tokenUpper;
            if (!isExactCase && !isLooseCase) continue;
            let candidateCost = cand.byteLen;
            // Loose case is a fallback, never a tie winner: a table that only
            // lists lowercase still encodes an uppercase source instead of
            // dropping the character.
            if (isLooseCase) candidateCost += 0.5;
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

  core.escapeRegex = escapeRegex;
  core.createTokenizer = createTokenizer;
  core.smartTextParse = smartTextParse;
  core.getSmartByteLength = getSmartByteLength;
})(window);
