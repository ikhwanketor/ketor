/* The ROM builder: allTexts and tableData in, a rebuilt rom out. Moved out of
   the legacy core.js without a change. */
(function (global) {
  'use strict';
  var Ketor = global.Ketor = global.Ketor || {};
  var core = Ketor.core = Ketor.core || {};

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
      /* Pointers that name an address inside a bank cannot express an address in
         another bank: writing one for a record that moved across a bank boundary
         produces a value that reads back as a different address. The mask is the
         window such a pointer can reach. */
      const BANK_RELATIVE_TRANSFORMS = { nes_bank: 0x3FFF, gb_bank: 0x3FFF, snes_bank: 0x7FFF };
      const bankMaskFor = (transformId) => BANK_RELATIVE_TRANSFORMS[transformId] || 0;
      const isBankRelativeTransform = (transformId) => bankMaskFor(transformId) > 0;
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
        /* A GBA rom whose text is more than one byte a character is still a GBA rom. Both
           lines above are written for a one byte table, so a sixteen bit table (4100=A in
           khcom.tbl) fell through to the generic profile and every GBA rule - the strict
           pointer validation, the absolute transforms, every branch that asks whether this
           is a GBA profile - was skipped. That is what the translator's build printed:
           "Pointer profile: profile_default" on a GBA cartridge. The console decides the
           console; the table decides the encoding, not the profile. */
        if (system.name === "GBA" && usePaddingByte) return "profile_gba_dwe_multibyte";
        if (system.name === "GBA") return "profile_gba_multibyte";
        return "profile_default";
      })();
      const isGbaNonPaddingProfile = pointerProfile === "profile_gba_nonpadding";
      const isGbaDweSingleByteProfile = pointerProfile === "profile_gba_dwe_singlebyte";
      const isGbaMultibyteProfile = pointerProfile === "profile_gba_multibyte" || pointerProfile === "profile_gba_dwe_multibyte";
      const isNesProfile = pointerProfile === "profile_nes";
      const isSnesProfile = pointerProfile === "profile_snes";
      const isGbLikeProfile = pointerProfile === "profile_gb" || pointerProfile === "profile_gbc";
      const isStrictGbaPointerValidation = (system.name === "GBA") &&
        (isGbaNonPaddingProfile || isGbaDweSingleByteProfile || isGbaMultibyteProfile || usePaddingByte);
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
          /* The NES switchable window: file offset 0x0000-0x3FFF inside a bank is CPU
             0x8000-0xBFFF, so the stored value is the offset inside the bank plus
             0x8000. The detector builds the same value, which is how a per text
             pointer is handed to the engine. */
          case 'nes_bank': return (offset & 0x3FFF) | 0x8000;
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

      /* A run of filler bytes is not automatically free space. On this ROM three
         of the four zero runs in the dialogue bank are live structures that a
         pointer aims at - 0xE81F4 is the target of the word at 0xE8880, and the
         run is one object of zeros, not padding. Writing a relocated message into
         one of them deleted game data, and the game then ran abnormally. A run
         only counts as free when no pointer anywhere in the file lands inside it. */
      /* Every console spells a pointer differently, so the set of addresses the ROM
         itself points at is built per profile: GBA and NDS use a 32 bit word with a
         bus base, Genesis and SNES HiROM use big endian words, and the 16 bit
         consoles (NES, SNES LoROM, GB, PCE) use a CPU address whose bank is not in
         the word at all - every bank is therefore treated as a possible target. The
         last rule is deliberately generous: it may refuse a run that was free, and
         the price of that is a longer search or ROM expansion, never a game that
         breaks because its data was overwritten. */
      const consoleBank = (() => {
        const name = String(system.name || '').toLowerCase();
        /* The order matters: 'gba' contains 'gb', so a Game Boy test first turned
           every GBA build into a 16 bit console and the reference scan then marked
           almost the whole file as pointed at, which refused every relocation. */
        if (name.indexOf('gba') >= 0) return { kind: 'gba' };
        if (name.indexOf('nds') >= 0 || name.indexOf('nintendo ds') >= 0) return { kind: 'nds' };
        if (name.indexOf('genesis') >= 0 || name.indexOf('mega drive') >= 0 || name.indexOf('mega-drive') >= 0) return { kind: 'linear32' };
        if (name.indexOf('gb') >= 0) return { kind: 'cpu16', window: 0x4000, step: 0x4000, cpuBase: 0x4000 };
        if (name.indexOf('snes') >= 0 || name.indexOf('super') >= 0) return { kind: 'cpu16', window: 0x8000, step: 0x8000, cpuBase: 0x8000 };
        if (name.indexOf('nes') >= 0) return { kind: 'cpu16', window: 0x8000, step: 0x4000, cpuBase: 0x8000 };
        if (name.indexOf('pce') >= 0 || name.indexOf('turbografx') >= 0) return { kind: 'cpu16', window: 0x2000, step: 0x2000, cpuBase: 0x2000 };
        return { kind: 'gba' };
      })();
      const referencedOffsets = (() => {
        const targets = new Set();
        const size = originalRom.length;
        const add = (offset) => {
          if (Number.isFinite(offset) && offset >= 0 && offset < size) targets.add(offset | 0);
        };
        const little = String(system.pointerEndianness || 'little') === 'little';
        for (let i = 0; i + 4 <= size; i += 2) {
          const le = (originalRom[i] | (originalRom[i + 1] << 8) | (originalRom[i + 2] << 16) | (originalRom[i + 3] << 24)) >>> 0;
          const be = ((originalRom[i] << 24) | (originalRom[i + 1] << 16) | (originalRom[i + 2] << 8) | originalRom[i + 3]) >>> 0;
          if (consoleBank.kind !== 'cpu16') {
            if ((le & 0xFF000000) === 0x08000000 && little) add(le & 0x01FFFFFF);
            if ((le & 0xFF000000) === 0x02000000 && little) add(le & 0x01FFFFFF);
            if ((le & 0xFF000000) === 0x02200000 && little) add(le & 0x01FFFFFF);
            if ((be & 0xFF000000) === 0x08000000 && !little) add(be & 0x01FFFFFF);
            if (!little && be < size) add(be);
            if (consoleBank.kind === 'gba' || consoleBank.kind === 'nds') {
              if ((le & 0xFF000000) === 0x08000000) add(le & 0x01FFFFFF);
            }
          }
          const base = Number(system.pointerBase) || 0;
          if (base > 0 && le >= base && (le - base) < size) add(le - base);
        }
        if (consoleBank.kind === 'cpu16') {
          const banks = Math.min(256, Math.ceil(size / consoleBank.step));
          for (let i = 0; i + 2 <= size; i += 2) {
            const w = little ? (originalRom[i] | (originalRom[i + 1] << 8)) : ((originalRom[i] << 8) | originalRom[i + 1]);
            /* All ones is what an empty bank is filled with, not a pointer. Reading it
               as one marked the last byte of every bank as referenced, and since a free
               run is rejected when any byte of it is referenced, a NES rom had no free
               run anywhere its pointers could reach: the per text detector found the
               pointers and the move was still refused for lack of room. */
            if (w === 0xFFFF) continue;
            const hi = w - consoleBank.cpuBase;
            if (hi < 0 || hi >= consoleBank.window) continue;
            for (let b = 0; b < banks; b++) add(b * consoleBank.step + hi);
          }
        }
        return targets;
      })();
      const rangeIsReferenced = (from, to) => {
        if (referencedOffsets.size === 0) return false;
        const lo = Math.max(0, from);
        const hi = Math.min(originalRom.length, to);
        for (let t = lo; t < hi; t++) {
          if (referencedOffsets.has(t)) return true;
        }
        return false;
      };
      const findFreeSpaceInRange = (romData, start, end, requiredSize, fillerBytes) => {
        if (requiredSize === 0) return start;
        const fillers = new Set(fillerBytes || [0xFF]);
        const need = requiredSize + 4;
        /* One pass, one verdict per run. Checking the run again for every byte it
           contains made the search quadratic and a real 8 MB rom with megabyte
           sized filler areas never finished. The whole filler run has to be
           unreferenced, not only the bytes about to be written: a pointer to the
           start of the run makes the rest of the run that object's data. */
        let runEnd = -1;
        for (let i = end - 1; i >= start - 1; i--) {
          if (i >= start && fillers.has(romData[i])) {
            if (runEnd < 0) runEnd = i + 1;
            continue;
          }
          if (runEnd >= 0) {
            const runStart = i + 1;
            if (runEnd - runStart >= need && !rangeIsReferenced(runStart, runEnd)) {
              return runEnd - need;
            }
            runEnd = -1;
          }
        }
        return -1;
      };

      const findFreeSpace = (romData, requiredSize) => {
        if (requiredSize === 0) return 0;
        const fillers = [0xFF, 0x00, terminatorHex];
        return findFreeSpaceInRange(romData, 0, romData.length, requiredSize, fillers);
      };



let _recordTable = null;
      const recordTable = () => {
        if (_recordTable) return _recordTable;
        _recordTable = { entries: [] };
        /* A verified table beats discovery: the layout of this rom was worked out
           from the original file, from a crashing build and from the indonesian
           translation patch, so the engine is told where the records are. */
        const known = system && system.knownPointerTable;
        if (known && Number.isFinite(known.at) && Number(known.count) > 1) {
          const kSize = Number(known.entrySize) || 4;
          const kStride = Number(known.stride) || kSize;
          const kLittle = String(known.endianness || 'little') === 'little';
          const kBase = Number(known.base) || 0;
          const knownEntries = [];
          const knownSites = [];
          for (let i = 0; i < Number(known.count); i++) {
            const at = Number(known.at) + i * kStride;
            if (at + kSize > originalRom.length) break;
            let v = 0;
            if (kLittle) { for (let b = kSize - 1; b >= 0; b--) v = (v * 256) + originalRom[at + b]; }
            else { for (let b = 0; b < kSize; b++) v = (v * 256) + originalRom[at + b]; }
            const off = (v >>> 0) - kBase;
            if (off < 0 || off >= originalRom.length) break;
            knownEntries.push(off);
            knownSites.push(at);
          }
          if (knownEntries.length >= 8) {
            relocationLog.push('Pointer table: known profile ' + (known.name || '') + ' at 0x' + Number(known.at).toString(16).toUpperCase() + ' with ' + knownEntries.length + ' entries, taken as given instead of guessed.');
            _recordTable.entries = knownEntries;
            _recordTable.sites = knownSites;
            _recordTable.size = kSize;
            _recordTable.stride = kStride;
            _recordTable.base = kBase;
            _recordTable.little = kLittle;
            _recordTable.bySite = Object.create(null);
            for (let i = 0; i < knownEntries.length; i++) _recordTable.bySite[knownEntries[i]] = knownSites[i];
            return _recordTable;
          }
        }
        for (let start = 0; start + 8 * 8 <= originalRom.length; start += 2) {
          const run = [];
          for (let k = 0; k < 8; k++) {
            const at = start + k * 4;
            const v = (originalRom[at] | (originalRom[at + 1] << 8) | (originalRom[at + 2] << 16) | (originalRom[at + 3] << 24)) >>> 0;
            if ((v & 0xFF000000) !== 0x08000000) break;
            const off = v & 0x01FFFFFF;
            if (off >= originalRom.length) break;
            if (run.length && off <= run[run.length - 1]) break;
            run.push(off);
          }
          if (run.length < 8) continue;
          let at = start + run.length * 4;
          while (at + 4 <= originalRom.length) {
            const v = (originalRom[at] | (originalRom[at + 1] << 8) | (originalRom[at + 2] << 16) | (originalRom[at + 3] << 24)) >>> 0;
            if ((v & 0xFF000000) !== 0x08000000) break;
            const off = v & 0x01FFFFFF;
            if (off >= originalRom.length || off <= run[run.length - 1]) break;
            run.push(off);
            at += 4;
          }
          if (run.length > _recordTable.entries.length) _recordTable.entries = run;
          start += (run.length - 1) * 4;
        }
        return _recordTable;
      };
      const recordIndexFor = (offset) => {
        const entries = recordTable().entries;
        for (let k = 0; k < entries.length - 1; k++) {
          if (offset >= entries[k] && offset < entries[k + 1]) return k;
        }
        return -1;
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
          /* A text is not always a record of its own. On this GBA ROM one dialogue
             message is a run of pages joined by the same two byte control pair
             (05 09) and a single pointer aims at the head of the run; the engine
             walks the pages itself. Writing one page of that run somewhere else -
             or letting the pages after it keep their old offsets - left the rest
             of the message unreachable: the compiled ROM then showed only the
             relocated line and every other line of that message was gone in game.
             A changed text therefore brings its whole run along, and the changed
             texts of one run share a single block so that they are written
             together instead of overwriting each other. */
          const known = texts
            .filter(t => typeof t.startByte === 'number' && typeof t.byteLength === 'number')
            .sort((a, b) => a.startByte - b.startByte);
          const knownIndex = new Map();
          known.forEach((t, i) => { if (!knownIndex.has(t.startByte)) knownIndex.set(t.startByte, i); });
          const controlPairAt = (startOffset) => {
            if (!Number.isFinite(startOffset) || startOffset < 2) return null;
            const b0 = originalRom[startOffset - 2];
            const b1 = originalRom[startOffset - 1];
            if (!isLikelyControlByte(b0) || !isLikelyControlByte(b1)) return null;
            return (b0 << 8) | b1;
          };
          /* Pages of one message are joined by the same control pair, and a
             message boundary can be written with several pairs in a row (the intro
             message is followed by three of them before the next message begins).
             The pages join when the whole gap is nothing but repetitions of the
             same pair, so the run reaches the real end of the message - a run that
             stopped short would leave the pages after it behind when it moves. */
          const linkGap = (left, right) => {
            const gap = Number(right.startByte) - (Number(left.startByte) + Number(left.byteLength));
            if (gap < 2 || gap > 8 || gap % 2 !== 0) return 0;
            const hi = originalRom[right.startByte - 2];
            const lo = originalRom[right.startByte - 1];
            if (!isLikelyControlByte(hi) || !isLikelyControlByte(lo)) return 0;
            for (let k = 0; k < gap; k += 2) {
              if (originalRom[right.startByte - 2 - k] !== hi) return 0;
              if (originalRom[right.startByte - 1 - k] !== lo) return 0;
            }
            return gap;
          };
          /* The room of a page stops where the separator in front of the next
             known text begins. The stored byteLength can be two bytes short (a
             line break is stored as a newline, which the table spells [LINE]),
             so the block would have been measured too small and the last page of
             the message would have lost its tail. Counting the separator pairs
             backwards from the next text gives the real end. */
          const derivedEnd = (item, separator) => {
            if (separator === null) return null;
            const idx = knownIndex.get(item.startByte);
            const next = idx === undefined ? null : known[idx + 1];
            if (!next) return null;
            const hi = separator >> 8;
            const lo = separator & 0xFF;
            let reps = 0;
            let p = Number(next.startByte);
            while (reps < 4 && p - 2 > Number(item.startByte) &&
                   originalRom[p - 2] === hi && originalRom[p - 1] === lo) {
              reps++;
              p -= 2;
            }
            if (reps === 0) return null;
            const end = p - 1;
            const len = end - Number(item.startByte) + 1;
            if (len <= 0 || Math.abs(len - Number(item.byteLength)) > 8) return null;
            return end;
          };
          /* The last page of a message carries the console's end code, and the
             stored byteLength can be a couple of bytes short of it (the extractor
             measures the text, the end code is a token). Copying the page verbatim
             then dropped the end code and the relocated message ran straight into
             whatever followed. Walk to the end code and take it along. */
          const endWithTerminator = (item) => {
            const start = Number(item.startByte);
            const len = Number(item.byteLength);
            if (!Number.isFinite(start) || !Number.isFinite(len) || len <= 0) return null;
            for (let k = 0; k <= 8; k++) {
              if (originalRom[start + len + k] === terminatorHex) return start + len + k;
            }
            return null;
          };
          const runOf = (seed) => {
            const seedIdx = knownIndex.get(seed.startByte);
            if (seedIdx === undefined) return [seed];
            let separator = null;
            const next = known[seedIdx + 1];
            if (next && linkGap(seed, next) && controlPairAt(next.startByte) !== null) {
              separator = controlPairAt(next.startByte);
            } else {
              const prev = known[seedIdx - 1];
              if (prev && linkGap(prev, seed) && controlPairAt(seed.startByte) !== null) {
                separator = controlPairAt(seed.startByte);
              }
            }
            if (separator === null) return [seed];
            const run = [seed];
            let i = seedIdx - 1;
            while (i >= 0 && run.length < 512) {
              const prev = known[i];
              if (!linkGap(prev, run[0]) || controlPairAt(run[0].startByte) !== separator) break;
              run.unshift(prev);
              i--;
            }
            i = seedIdx + 1;
            while (i < known.length && run.length < 512) {
              const nxt = known[i];
              if (!linkGap(run[run.length - 1], nxt) || controlPairAt(nxt.startByte) !== separator) break;
              run.push(nxt);
              i++;
            }
            const lastRunItem = run[run.length - 1];
            return run.map(item => {
              let end = derivedEnd(item, separator);
              if (end === null && item === lastRunItem) end = endWithTerminator(item);
              if (end === null) return item;
              const len = end - Number(item.startByte) + 1;
              return len === Number(item.byteLength) ? item : Object.assign({}, item, { byteLength: len });
            });
          };
          const chainBlocks = [];
          const chainHeads = new Set();
          for (const t of changed) {
            const run = runOf(t);
            const head = Number(run[0].startByte);
            if (chainHeads.has(head)) continue;
            chainHeads.add(head);
            let end = 0;
            run.forEach(item => { end = Math.max(end, Number(item.startByte) + Number(item.byteLength) - 1); });
            chainBlocks.push({ texts: run, start: Number(run[0].startByte), end: end });
          }
          if (chainBlocks.some(b => b.texts.length > 1)) {
            relocationLog.push(`Chained text run(s): ${chainBlocks.filter(b => b.texts.length > 1).length} message(s) of ${chainBlocks.filter(b => b.texts.length > 1).map(b => b.texts.length).join(', ')} page(s) will be written as one unit.`);
          }
          /* A record is the unit of work (batch 79). A page inside a record has no
             pointer of its own, so a page that grew was written past its own span and
             clobbered the page that follows it inside the same record; the engine then
             read a broken conversation and skipped it while every structural check
             passed. Blocks that share a record are merged into one block covering the
             whole record, so the growth is paid at the record's end. */
          const byRecord = new Map();
          chainBlocks.forEach(function (b) {
            const ridx = recordIndexFor(b.start);
            const key = ridx >= 0 ? ('r' + ridx) : ('b' + b.start);
            const hit = byRecord.get(key);
            if (!hit) {
              byRecord.set(key, { texts: b.texts.slice(), start: b.start, end: b.end, ridx: ridx });
              return;
            }
            hit.texts = hit.texts.concat(b.texts);
            hit.start = Math.min(hit.start, b.start);
            hit.end = Math.max(hit.end, b.end);
          });
          const wholeRecords = [];
          byRecord.forEach(function (b) {
            if (b.ridx < 0) { wholeRecords.push({ texts: b.texts, start: b.start, end: b.end }); return; }
            const entries = recordTable().entries;
            const recStart = entries[b.ridx];
            const nextStart = (b.ridx + 1 < entries.length) ? entries[b.ridx + 1] : originalRom.length;
            const inside = textsStartingIn(recStart, nextStart);
            const texts = inside.length ? inside : b.texts;
            let end = b.end;
            texts.forEach(function (t) { end = Math.max(end, Number(t.startByte) + Number(t.byteLength) - 1); });
            /* A record's end code and its padding sit after the last page, and the last
               page's stored length does not always reach them. A block that stopped at the
               last page therefore dropped the end code of the record it wrote: the shift
               kept the record at its address, its text read correctly, and the record no
               longer closed (batch 95, record 0xEF6B8, 23 pages). The next table entry says
               where the record really ends, so the block is taken to there. */
            if (b.ridx + 1 < entries.length && (nextStart - 1) > end) {
              let recordEnd = nextStart - 1;
              /* The end code has to be part of the block; the zero padding after it must
                 not be, because that padding is exactly what a grown record borrows when
                 the shift path pays for the growth. Including it made the write longer
                 than the space the shift had freed and pushed the next record down by the
                 difference (record 0xEFBCD). */
              while (recordEnd > end && originalRom[recordEnd] === 0x00) recordEnd--;
              end = recordEnd;
            }
            if (texts.length > b.texts.length) {
              relocationLog.push(`Record at 0x${recStart.toString(16).toUpperCase()}: written as one unit with all ${texts.length} page(s) instead of ${b.texts.length}, so the growth lands at the end of the record.`);
            }
            wholeRecords.push({ texts: texts, start: recStart, end: end });
          });
          return wholeRecords;
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

      /* Records collect the texts that start inside them, and the answer used to be a
         filter over every text of the rom - once per touched record, hundreds of
         millions of comparisons for a full translation. Sorted once here, the question
         becomes a range. */
      const allTextsByStart = allTexts
        .filter(t => typeof t.startByte === 'number')
        .sort((a, b) => Number(a.startByte) - Number(b.startByte));
      const textsStartingIn = (from, to) => {
        let lo = 0;
        let hi = allTextsByStart.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (Number(allTextsByStart[mid].startByte) < from) lo = mid + 1; else hi = mid;
        }
        const out = [];
        for (let i = lo; i < allTextsByStart.length; i++) {
          const t = allTextsByStart[i];
          if (Number(t.startByte) >= to) break;
          out.push(t);
        }
        return out;
      };

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

      /* "Which words in this image aim at this text?" is asked once per block, and it
         was answered by reading every fourth byte of the whole image: two million reads
         for every block, which is hours for a build that inserts a whole translation.
         The pointer-like words are indexed once instead, bucketed by target address, so
         the same question costs a handful of entries. */
      let _gbaPointerBuckets = null;
      const gbaPointerBuckets = () => {
        if (_gbaPointerBuckets) return _gbaPointerBuckets;
        const buckets = new Map();
        const view = new DataView(originalRom.buffer, originalRom.byteOffset, originalRom.byteLength);
        const ranges = (pointerRegions && pointerRegions.length > 0)
          ? pointerRegions.map(r => ({ start: Math.max(0, r.start), end: Math.min(originalRom.length - 4, r.end) }))
          : [{ start: 0, end: originalRom.length - 4 }];
        for (const range of ranges) {
          const first = range.start + ((4 - (range.start % 4)) % 4);
          for (let i = first; i <= range.end; i += 4) {
            const off = decodeGbaAbsoluteLikeOffset(view.getUint32(i, true));
            if (!Number.isFinite(off)) continue;
            const key = off >> 10;
            const list = buckets.get(key);
            if (list) { list.push(off, i); } else { buckets.set(key, [off, i]); }
          }
        }
        _gbaPointerBuckets = buckets;
        return buckets;
      };

      const detectContainerAnchor = (startOffset) => {
        if (!isGbaNonPaddingProfile) return null;
        if (!Number.isFinite(startOffset) || startOffset < 0 || startOffset >= originalRom.length) return null;
        const windowBack = 0x400;
        const targetMin = Math.max(0, startOffset - windowBack);
        const targetMax = startOffset;
        const view = new DataView(originalRom.buffer, originalRom.byteOffset, originalRom.byteLength);

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

        const buckets = gbaPointerBuckets();
        for (let key = (targetMin >> 10); key <= (targetMax >> 10); key++) {
          const list = buckets.get(key);
          if (!list) continue;
          for (let k = 0; k + 1 < list.length; k += 2) {
            const off = list[k];
            if (off < targetMin || off > targetMax) continue;
            addHit(off, list[k + 1]);
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

      /* The entry the engine itself uses for a record. The known table is taken as
         given, so the head of a record is a lookup there instead of a guess, and every
         record that has to move already has the one word that must change. */
      const knownEntryFor = (start) => {
        const table = recordTable();
        if (!table || !table.bySite) return null;
        const kBase = Number(table.base) || 0;
        const kTransform = kBase === 0x08000000 ? 'gba' : (kBase === 0 ? 'raw' : null);
        if (!kTransform) return null;
        let site = table.bySite[Number(start)];
        if (!Number.isFinite(site)) {
          const ridx = recordIndexFor(start);
          if (ridx < 0 || Number((table.entries || [])[ridx]) !== Number(start)) return null;
          site = (table.sites || [])[ridx];
        }
        if (!Number.isFinite(site)) return null;
        return {
          ptrOffset: site,
          ptrSize: table.size || system.pointerSize || 4,
          transformId: kTransform,
          base: kBase,
          confidence: 1,
          knownTable: true,
          targetOffset: Number(start)
        };
      };

      /* Every record must still carry its header where its entry points and still close
         with the end code. The entries are read from the current image, so the check sees
         the layout the game will see. It is a function because the shift path asks the same
         question after every shift it makes: a shift is kept only when the whole rom still
         checks out, which is what lets the tool try the reference layout first and move
         only the records the shift cannot keep. */
      const findBrokenRecords = () => {
        const table = recordTable();
        const sites = table.sites || [];
        const bad = [];
        const total = Math.min(sites.length, (table.entries || []).length);
        if (total < 8) return bad;
        /* How many bytes in front of a record are a header rather than the text itself,
           worked out from where the texts of this build begin. A record whose text starts
           at the record start has no header to keep: on Kingdom Hearts the intro record
           begins with the letter 'A' and its translation begins with 'D', and the two
           byte comparison below read that as "this record lost its header" - so every
           translation of a header-less record was refused and the original rom was handed
           back, which is exactly the build the user kept getting. A record with a real
           header (Aria of Sorrow: 01 00 in front of every message) keeps its test: the
           text starts two bytes later, so two bytes are compared, as before. The Insert
           check further down is the net for the text itself. */
        const textStarts = [];
        for (const t of allTexts) {
          const s = Number(t && t.startByte);
          if (Number.isFinite(s) && s >= 0) textStarts.push(s);
        }
        textStarts.sort((a, b) => a - b);
        const headerLengthOf = (recordStart, recordEnd) => {
          for (const s of textStarts) {
            if (s < recordStart) continue;
            if (recordEnd !== undefined && s >= recordEnd) break;
            return s - recordStart;
          }
          return 0;
        };
        for (let i = 0; i < total - 1; i++) {
          const at = sites[i];
          let v = 0;
          for (let b = 3; b >= 0; b--) v = (v * 256) + romCopy[at + b];
          const from = (v >>> 0) - (table.base || 0);
          let vNext = 0;
          for (let b = 3; b >= 0; b--) vNext = (vNext * 256) + romCopy[sites[i + 1] + b];
          const to = (vNext >>> 0) - (table.base || 0);
          if (from < 0 || from >= romCopy.length) { bad.push(from); continue; }
          let closes = false;
          if (to > from && to <= romCopy.length && (to - from) <= 0x10000) {
            for (let p = to - 1; p >= from; p--) { if (romCopy[p] === terminatorHex) { closes = true; break; } }
          } else {
            const limit = Math.min(romCopy.length, from + 0x10000);
            for (let p = from; p < limit; p++) { if (romCopy[p] === terminatorHex) { closes = true; break; } }
          }
          const originalStart = (table.entries || [])[i];
          const originalEnd = (table.entries || [])[i + 1];
          const headerLength = originalStart === undefined
            ? 0
            : headerLengthOf(originalStart, originalEnd === undefined ? originalStart + 0x10000 : originalEnd);
          let headerKept = true;
          if (originalStart !== undefined && headerLength > 0) {
            for (let h = 0; h < headerLength; h++) {
              const at = from + h;
              if (at >= romCopy.length || romCopy[at] !== originalRom[originalStart + h]) { headerKept = false; break; }
            }
          }
          if (!closes || !headerKept) bad.push(from);
        }
        return bad;
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
            // One pointer target can describe a whole run of texts: on this
            // ROM the pointer aims at 0xEA7C8 while seven texts follow it, and
            // the next pointer entry aims at 0xEAB54. Taking that anchor for
            // every one of those texts made each of them rewrite the whole run
            // from 0xEA7C8, so only the last text of the group survived.
            // The anchor belongs to the first text of the run only.
            const anchor = container.anchorOffset;
            const textStart = Number(sortedTexts[0].startByte);
            const candidateEnd = Number.isFinite(container.nextTargetOffset)
              ? Math.min(originalRom.length - 1, container.nextTargetOffset - 1)
              : effectiveBlockEnd;
            const earlierTextInside = allTexts.some(t => Number.isFinite(t.startByte) &&
              Number(t.startByte) !== textStart &&
              Number(t.startByte) >= anchor && Number(t.startByte) < textStart);
            if (earlierTextInside) {
              relocationLog.push(`Block at 0x${textStart.toString(16).toUpperCase()}: Container 0x${anchor.toString(16).toUpperCase()} starts an earlier text; keeping this text's own offset.`);
            } else {
              effectiveBlockStart = anchor;
              // The end may only grow to the container end when this is the
              // only text in it, otherwise the block would swallow the texts
              // that follow and the filler would erase them.
              const laterTextInside = allTexts.some(t => Number.isFinite(t.startByte) &&
                Number(t.startByte) !== textStart &&
                Number(t.startByte) > textStart && Number(t.startByte) <= candidateEnd);
              if (!laterTextInside && candidateEnd > effectiveBlockEnd) {
                effectiveBlockEnd = candidateEnd;
              }
              const nextLabel = Number.isFinite(container.nextTargetOffset)
                ? `, next 0x${container.nextTargetOffset.toString(16).toUpperCase()}`
                : '';
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Container anchor 0x${anchor.toString(16).toUpperCase()} (hits x${container.pointerCount}${nextLabel}${laterTextInside ? ', shared by later texts' : ''}).`);
            }
          }
        }
        if (isGbaNonPaddingProfile) {
          for (const textItem of sortedTexts) {
            if (typeof textItem.startByte !== 'number') continue;
            const aliases = detectPreTextAliasOffsets(textItem.startByte);
            textAliasMap.set(textItem.startByte, aliases);
            // An alias is the short prefix in front of a text (a length byte, a
            // control code). A match far below the text is a coincidence, and
            // letting it move the block start backwards makes the block look
            // larger than the text region: an over-long translation then looked
            // like it still fit, was written in place and was silently cut to
            // the region. Only a prefix right in front of the text counts.
            //
            // It also has to be an address the engine itself names. Two bytes that
            // merely happen to sit in the control range are not a prefix: on the
            // header-less record fixture two filler bytes of 0x11 did this, the block
            // start moved two bytes back, and the record was then read as a page inside
            // the record before it - and a page inside a record may not move, so the
            // build refused the translation. On Aria of Sorrow the alias is the table
            // entry itself (0xEA744, with the text at 0xEA746), which is exactly the
            // case this is for.
            const aliasEntries = (recordTable().entries || []);
            const aliasIsRecordStart = aliases.length > 0 &&
              Number(aliases[0]) !== Number(textItem.startByte) &&
              aliasEntries.indexOf(Number(aliases[0])) >= 0;
            if (aliasIsRecordStart && aliases[0] >= Number(textItem.startByte) - 8) {
              effectiveBlockStart = Math.min(effectiveBlockStart, aliases[0]);
            }
          }
        }
        /* A text can start inside the record the table names - a control code in front of
           it, as Kingdom Hearts opens its intro record with 00 E0 before the first letter.
           The record is the unit the engine reaches through its entry, so the record is
           the unit that has to move: the block is extended back to the address the table
           names and the entry then carries the whole record to its new place. Without
           this the build said "This page sits inside record 0x... and has no pointer of
           its own" and left a translation that did not fit where it was. */
        if (isGbaNonPaddingProfile || isGbaMultibyteProfile) {
          const firstTextStart = Number(sortedTexts[0].startByte);
          if (Number.isFinite(firstTextStart)) {
            const recordIdx = recordIndexFor(firstTextStart);
            const recordStart = recordIdx >= 0 ? Number(recordTable().entries[recordIdx]) : NaN;
            if (Number.isFinite(recordStart) && recordStart < effectiveBlockStart && recordStart >= firstTextStart - 0x40) {
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': the text starts inside the record the table names at 0x' + recordStart.toString(16).toUpperCase() + ', so the whole record moves.');
              effectiveBlockStart = recordStart;
              const recordAliases = textAliasMap.get(firstTextStart) || [];
              if (recordAliases.indexOf(recordStart) < 0) {
                recordAliases.push(recordStart);
                recordAliases.sort((a, b) => a - b);
              }
              textAliasMap.set(firstTextStart, recordAliases);
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
        const encodedByStart = new Map();
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
          /* Pages that were not translated are copied byte for byte. Re-encoding
             them from the extracted text is lossy - the extractor stores a line
             break as a newline while the table spells it [LINE] - so a page that
             came along only because a neighbour was translated would have been
             rewritten with the wrong control code. */
          const hasTranslation = !!(textData && typeof textData.translatedText === 'string' && textData.translatedText.length > 0);
          let textToEncode = textData ? textData.translatedText : '';
          if (hasTranslation && textData && typeof textData.originalText === 'string') {
            /* Engine tokens name the speaker and the portrait - [SOMA PORTRAIT][SOMA] on
               this rom. They are part of the text, so a translation that rewrites them
               ("potret soma" instead of "SOMA PORTRAIT") writes a page whose header the
               engine no longer recognises and the conversation is skipped, even though
               every structural check passes. The leading token block of the original is
               restored whenever the translation does not repeat it. */
            const prefixMatch = /^(?:\[[^\]]{1,32}\])+/.exec(textData.originalText);
            if (prefixMatch && prefixMatch[0]) {
              const kept = prefixMatch[0];
              if (textToEncode.indexOf(kept) !== 0) {
                textToEncode = kept + textToEncode.replace(/^(?:\[[^\]]{1,32}\])+/, '');
                relocationLog.push(`Block at 0x${Number(textItem.startByte).toString(16).toUpperCase()}: page header restored to ${kept} because the translation had changed it.`);
              }
            }
          }
          let encoded = hasTranslation
            ? smartTextParse(textToEncode, tokenizer, masterCharToHex, usePaddingByte, encodeOptions)
            : originalRom.slice(Number(textItem.startByte), Number(textItem.startByte) + Number(textItem.byteLength));
          /* A record's room holds the text PLUS the control bytes that close it: the
             page separator and the end code (05 09 0a on this rom). Writing only the
             encoded translation dropped them, so the record had no end and the engine
             read straight into the next record - the dialogue was skipped and the game
             froze, while every structural check still passed because the table and the
             spans looked right. The reference indonesian patch keeps those bytes at the
             end of every record, so they are part of the format. The trailer is exactly
             the room left over after the original text, which is how it is derived here
             - no guess about the record format. */
          if (hasTranslation && textData && typeof textData.originalText === 'string') {
            const roomLen = Number(textItem.byteLength);
            const startByte = Number(textItem.startByte);
            const originalEncoded = smartTextParse(textData.originalText, tokenizer, masterCharToHex, usePaddingByte, encodeOptions);
            if (roomLen > originalEncoded.length && originalEncoded.length > 0) {
              const trailer = originalRom.slice(startByte + originalEncoded.length, startByte + roomLen);
              const merged = new Uint8Array(encoded.length + trailer.length);
              merged.set(encoded, 0);
              merged.set(trailer, encoded.length);
              encoded = merged;
            }
          }
          if (typeof textItem.startByte === 'number' && typeof textItem.byteLength === 'number') {
            textRanges.push({ start: textItem.startByte, end: textItem.startByte + textItem.byteLength - 1 });
          }
          /* What this text looks like once written (translation, restored engine tokens and
             trailer): the insert check compares against these bytes, not against a fresh
             encoding of the raw translation, which reported restored pages as missing. */
          encodedByStart.set(Number(textItem.startByte), encoded);
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

        const packedBlockBytes = new Uint8Array(totalLength);
        let offset = 0;
        segments.forEach(arr => { packedBlockBytes.set(arr, offset); offset += arr.length; });

        const effectiveBlock = {
          ...block,
          start: effectiveBlockStart,
          end: effectiveBlockEnd
        };
        const originalBlockLength = (effectiveBlock.end - effectiveBlock.start) + 1;
        /* Slack inside a chained run is spent before anything is moved: a page
           whose translation is shorter than its own room keeps every page after it
           exactly where it was, and the leftover bytes are cleared instead of
           being packed away. A page that does not move cannot break a reference
           the pointer search failed to find. Packing the run tight stays the
           fallback, for when the pages that shrank have to pay for one that grew. */
        let newBlockBytes = packedBlockBytes;
        if (sortedTexts.length > 1 && packedBlockBytes.length !== originalBlockLength) {
          const padded = originalRom.slice(effectiveBlockStart, effectiveBlockEnd + 1);
          let fits = true;
          for (let i = 0; i < sortedTexts.length; i++) {
            const item = sortedTexts[i];
            const textData = textMap.get(item.id);
            const hasTranslation = !!(textData && typeof textData.translatedText === 'string' && textData.translatedText.length > 0);
            const encoded = hasTranslation
              ? smartTextParse(textData.translatedText, tokenizer, masterCharToHex, usePaddingByte, encodeOptions)
              : originalRom.slice(Number(item.startByte), Number(item.startByte) + Number(item.byteLength));
            const next = sortedTexts[i + 1];
            const room = next
              ? Number(item.byteLength)
              : (effectiveBlockEnd - Number(item.startByte) + 1);
            const rel = Number(item.startByte) - effectiveBlockStart;
            if (encoded.length > room || rel < 0 || rel + room > padded.length) { fits = false; break; }
            padded.set(encoded, rel);
            if (encoded.length < room) padded.fill(0, rel + encoded.length, rel + room);
          }
          if (fits) {
            newBlockBytes = padded;
            textOffsetsInBlock.clear();
            sortedTexts.forEach(function (item) {
              textOffsetsInBlock.set(item.startByte, Number(item.startByte) - effectiveBlockStart);
            });
            for (const [key, aliases] of Array.from(textAliasMap.entries())) {
              for (const aliasOffset of aliases) {
                const rel = Number(aliasOffset) - effectiveBlockStart;
                if (rel >= 0) textOffsetsInBlock.set(aliasOffset, rel);
              }
            }
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: run of ${sortedTexts.length} page(s) written at its own offsets, slack cleared instead of moving the pages after it.`);
          }
        }
        const needsRelocation = newBlockBytes.length > originalBlockLength;
        let needsPointerUpdate = false;
        for (const textItem of sortedTexts) {
          if (typeof textItem.startByte !== 'number') continue;
          const newRel = textOffsetsInBlock.get(textItem.startByte);
          const oldRel = textItem.startByte - effectiveBlock.start;
          if (newRel !== oldRel) { needsPointerUpdate = true; break; }
        }
        /* A chained run is read by the engine from its head, page by page. When the
           run still fits where it is, the head does not move and nothing outside
           has to be repointed. Searching for pointers to the inner pages then only
           finds look-alikes: on this ROM a sixteen bit tile index inside a map
           block was rewritten and the graphics changed. The run is written in
           place instead. */
        if (!needsRelocation && sortedTexts.length > 1) {
          needsPointerUpdate = false;
        }

        /* The translator asked the app to know, for every text in the group, whether it came
           out longer than the room it had, exactly the same, or shorter - and to say which of
           them is the reason a record had to move. Encoded length against the room the text
           already owned answers it exactly, and it is the same number the writer used. */
        const lengthClasses = { longer: 0, same: 0, shorter: 0 };
        sortedTexts.forEach(function (item) {
          const enc = encodedByStart.get(Number(item.startByte));
          if (!enc) return;
          const room = Number(item.byteLength) || 0;
          if (enc.length > room) lengthClasses.longer++;
          else if (enc.length === room) lengthClasses.same++;
          else lengthClasses.shorter++;
        });
        if (lengthClasses.longer + lengthClasses.same + lengthClasses.shorter > 0) {
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': ' + lengthClasses.longer + ' text(s) longer than their room, ' + lengthClasses.same + ' exactly the same length, ' + lengthClasses.shorter + ' shorter.');
        }
        const mod = {
          block: effectiveBlock,
          lengthClasses,
          newBlockBytes,
          originalBlockLength,
          needsRelocation,
          needsPointerUpdate,
          pointers: [],
          textOffsetsInBlock,
          encodedByStart,
          textRanges,
          sortedTexts
        };
        if (needsRelocation || needsPointerUpdate) {
          /* When the engine's own table names this record the search battery below -
             which reads the whole image several times for every block, and made a build
             of a thousand records take hours - has nothing to add: that entry is the
             reference the engine follows, and every other word the scan finds is a
             look-alike that must not be rewritten (build 66 wrote one of those and the
             game skipped exactly that conversation). */
          const knownEntryForBlock = knownEntryFor(effectiveBlock.start) || knownEntryFor(block.start);
          if (knownEntryForBlock) {
            mod.pointers = [knownEntryForBlock];
            relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': this record is named by the table at 0x' + Number(knownEntryForBlock.ptrOffset).toString(16).toUpperCase() + ', so that entry is used and the pointer search is skipped.');
          } else {
          /* Only the head of a chained run may be repointed. The engine reaches
             the pages after it by walking the run, and a value that looks like a
             pointer to an inner page is a tile index far more often than it is a
             real address. */
          const chainHeadOnly = sortedTexts.length > 1;
          const canonicalTargetOffsets = (chainHeadOnly ? [sortedTexts[0]] : sortedTexts)
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
            relocationLog.push(`Block at 0x${effectiveBlock.start.toString(16).toUpperCase()}: Loaded ${hintPointersRaw.length} pointer hint(s) from saved groups and from the per text detector.`);
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
              p.transformId === 'nes_bank' ||
              (p.transformId === 'raw' && (p.ptrSize || system.pointerSize) === 2)
            ));
            if (preferred.length > 0) finalPointers = preferred;
            /* The run filter exists to throw away coincidences: a real table sits in a
               run of constant spacing. A hint is not a coincidence - it is where the
               per text detector found this text address in the image - and on the NES
               the pointers are scattered by nature, so hints stay outside the filter
               and are merged back. */
            const hints = finalPointers.filter(p => p.validationReason === 'group_hint');
            const guessed = finalPointers.filter(p => p.validationReason !== 'group_hint');
            finalPointers = mergePointerLists(filterByPointerRunsWithStep(guessed, 2, maxPointers, 2), hints);
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
          } /* end of the search battery, skipped when the known table names the record */
        }
        modifications.push(mod);
      }

      /* One line for the whole build: how many of the texts this build wrote came out longer
         than the room they had (those are the only ones that force a record to move), how many
         came out exactly the same length and how many are shorter - and the last two keep the
         offset they already had, with no pointer written for them. */
      const lengthTotals = { longer: 0, same: 0, shorter: 0 };
      modifications.forEach(function (m) {
        const c = m && m.lengthClasses;
        if (!c) return;
        lengthTotals.longer += c.longer;
        lengthTotals.same += c.same;
        lengthTotals.shorter += c.shorter;
      });
      if (lengthTotals.longer + lengthTotals.same + lengthTotals.shorter > 0) {
        relocationLog.push('Length check: of the texts this build wrote, ' + lengthTotals.longer + ' came out longer than the room they had' +
          (lengthTotals.longer > 0 ? ' - a record that holds one of those is the only kind that has to move' : '') + ', ' +
          lengthTotals.same + ' came out exactly the same length and ' + lengthTotals.shorter + ' shorter; those stay at their own offset and no pointer is written for them.');
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
      let romView = new DataView(romCopy.buffer);
      /* Everything above the highest byte the game actually uses is padding: the cartridge
         was filled to 8MB and no asset lives there. A record moved into that padding changes
         nothing the engine can read, so the padding is the first place tried. A run of zeros
         in the middle of the image is only a fallback: it can be tile data the game copies
         into video memory, and writing text into one of those corrupted the graphics (the
         screen glitched when Soma was hit - user report, 27 Sep). */
      const tailFreeStart = (() => {
        let lastUsed = -1;
        for (let i = originalRom.length - 1; i >= 0; i--) {
          const by = originalRom[i];
          if (by !== 0x00 && by !== 0xFF) { lastUsed = i; break; }
        }
        if (lastUsed < 0) return -1;
        /* A cushion of 0x100 bytes: a table that reads a little past its own end still
           finds filler and never one of the records written here. */
        let at = lastUsed + 1 + 0x100;
        at += (4 - (at % 4)) % 4;
        return at < originalRom.length ? at : -1;
      })();
      let tailCursor = tailFreeStart;
      let tailAllocations = 0;
      /* Free space is mapped once and handed out from a cursor. The search used to walk
         the whole image for every record that moved, so a build that moved hundreds of
         them never finished; mapping the filler runs once and carving every allocation
         out of them makes the cost one scan for the whole build. A run that is
         referenced at any byte is skipped - a pointer to the start of a run makes the
         rest of that run that object data - and every allocation keeps a four byte
         guard above it, exactly like the old search did. */
      const freeSpaceRuns = [];
      (() => {
        const isFiller = (b) => b === 0xFF || b === 0x00 || b === terminatorHex;
        for (let i = 0, runStart = -1; i <= romCopy.length; i++) {
          if (i < romCopy.length && isFiller(romCopy[i])) { if (runStart < 0) runStart = i; continue; }
          if (runStart >= 0) {
            if (i - runStart >= 64 && !rangeIsReferenced(runStart, i)) freeSpaceRuns.push({ start: runStart, end: i, cursor: i, filler: romCopy[runStart] });
            runStart = -1;
          }
        }
      })();
      /* The run the older allocator already reserved must not be handed out twice. */
      if (totalRequiredSpace > 0 && freeSpaceOffset >= 0) {
        const keepFrom = freeSpaceOffset;
        const keepTo = freeSpaceOffset + totalRequiredSpace + 4;
        const keptRuns = [];
        for (const run of freeSpaceRuns) {
          if (run.end <= keepFrom || run.start >= keepTo) { keptRuns.push(run); continue; }
          if (run.start < keepFrom) keptRuns.push({ start: run.start, end: keepFrom, cursor: keepFrom });
          if (run.end > keepTo) keptRuns.push({ start: keepTo, end: run.end, cursor: run.end });
        }
        freeSpaceRuns.length = 0;
        keptRuns.forEach(function (r) { freeSpaceRuns.push(r); });
      }
      /* A record that moves is put inside the rom, never past its end: a bigger file is a
         different cartridge (the user called it dangerous, and they are right - the header
         declares a size, flash carts have one, and nothing about the game expects it).
         Free space is taken from runs of filler that nothing points at, and a run of 0xFF is
         preferred: that is how a cartridge is padded, while runs of zeroes can be tile data
         (one of those held sprite tiles, and the game glitched when the player was hit).
         system.allowRomGrowth === true asks for the old behaviour of growing the image. */
      let appendCursor = 0;
      const allocateFreeSpace = (need) => {
        if (system.allowRomGrowth === true) {
          if (appendCursor === 0) appendCursor = romCopy.length;
          let at = appendCursor;
          at += (4 - (at % 4)) % 4;
          const end = at + need;
          if (end + 0x1000 > romCopy.length) {
            const grown = new Uint8Array(end + 0x4000);
            grown.set(romCopy);
            romCopy = grown;
            romView = new DataView(romCopy.buffer);
            relocationLog.push('ROM grown to ' + Math.round(romCopy.length / 1024) + 'KB so the records that move sit after everything the game uses.');
          }
          appendCursor = end;
          return at;
        }
        const fits = (run) => (run.cursor - run.start) >= (need + 4);
        const carve = (run) => {
          let at = run.cursor - need;
          at -= (at % 4);
          run.cursor = at;
          return at;
        };
        /* 1. The padding at the end of the cartridge. */
        if (tailCursor >= 0) {
          let at = tailCursor;
          at += (4 - (at % 4)) % 4;
          let end = at + need;
          /* Skip a spot the image points at, even in the padding. */
          for (let guard = 0; guard < 64 && end + 4 <= originalRom.length && rangeIsReferenced(at, end + 4); guard++) {
            at = end + 4;
            at += (4 - (at % 4)) % 4;
            end = at + need;
          }
          if (end + 4 <= originalRom.length) {
            if (tailAllocations === 0) {
              relocationLog.push('Free space: the records that move are put in the padding after everything the game uses (from 0x' + at.toString(16).toUpperCase() + '), so no graphic, table or sound is touched.');
            }
            tailAllocations++;
            tailCursor = end + 4;
            return at;
          }
          tailCursor = -1;
        }
        /* 2. A run of 0xFF anywhere else: that is how a cartridge is padded. */
        const ffRun = freeSpaceRuns.filter(r => r.filler === 0xFF && fits(r))[0];
        if (ffRun) return carve(ffRun);
        const anyRun = freeSpaceRuns.filter(fits)[0];
        if (anyRun) return carve(anyRun);
        if (system.allowRomGrowth === true && freeSpaceRuns.length > 0 && (romCopy.length + need + 0x2000) <= 0x2000000) {
          const grown = new Uint8Array(romCopy.length + need + 0x2000);
          grown.set(romCopy);
          grown.fill(terminatorHex, romCopy.length);
          freeSpaceRuns.push({ start: romCopy.length, end: grown.length, cursor: grown.length });
          romCopy = grown;
          romView = new DataView(romCopy.buffer);
          relocationLog.push('ROM expanded to ' + Math.round(romCopy.length / 1024) + 'KB to make room for the records that move to free space.');
          return allocateFreeSpace(need);
        }
        return -1;
      };
      /* A record that outgrows its room is moved to free space and only its own table
         entry is rewritten, so nothing else in the image shifts (Atlas does the same).
         allowMessageShift true asks for the other path - grow in place by borrowing the
         padding of the messages after it - and false refuses the move as well and reports it. */
      let borrowKept = 0;
      let borrowRolledBack = 0;
      const grownRecordCount = modifications.filter(m => m.needsRelocation).length;
      if (grownRecordCount > 0) {
        relocationLog.push(grownRecordCount + ' record(s) need more room than they have; each one moves to the padding at the end of the cartridge and only its own table entry is rewritten' +
          (system.allowMessageShift === true ? ', unless the padding after it can pay for the growth.' : ', so the texts that do fit stay exactly where they were.'));
      }

      /* Highest first. A block that grows shifts the records after it, so every block
         already written must sit above the one being written; otherwise a later block
         writes at the address it had before the shift and lands on content that has already
         moved, which is what froze the intro. */
      modifications.sort(function (a, b) { return Number(b.block.start) - Number(a.block.start); });

      for (const mod of modifications) {
        const { block, newBlockBytes, originalBlockLength, needsRelocation, needsPointerUpdate, pointers, textOffsetsInBlock, textRanges, sortedTexts } = mod;
        let pointersForWrite = pointers;
        /* The engine reaches a record through one entry in its message table. When
           that entry is known, it - not the heuristic scan - is the reference that
           decides where the record lives. Atlas works the same way: a text that
           outgrows its slot moves to free space, its pointer is rewritten, and no
           other text in the file is touched. The entry joins the candidate list
           here, before validation, so exactly the same checks apply to it as to a
           pointer the scan found: the word at that site must really aim at this
           record, and the value written back is recomputed from the new address. */
        const knownRecordPointer = needsRelocation ? knownEntryFor(block.start) : null;
        if (needsRelocation && knownRecordPointer &&
            !pointersForWrite.some(p => Number(p.ptrOffset) === Number(knownRecordPointer.ptrOffset))) {
          pointersForWrite = pointersForWrite.concat([knownRecordPointer]);
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': the known table names this record at 0x' + Number(knownRecordPointer.ptrOffset).toString(16).toUpperCase() + ', so the move can use the entry the engine itself reads instead of a look-alike (the scan had found ' + pointers.length + ').');
        }
        const shouldUpdatePointers = (needsRelocation || needsPointerUpdate) && pointersForWrite.length > 0;
        /* Borrowing the padding of the messages that follow is tried before any address
           is chosen. When it works every record keeps its own place and the helper has
           already recalculated everything that moved, so not one pointer of this block
           has to be written. Trying it after the pointer values had been built was
           wrong: the growth then fell back to free space while the entries were still
           written with the address the search had picked earlier, and five records
           ended up aiming at a zeroed run (build 92, 0xE95F4). */
      let borrowStopReason = '';
      const growByBorrowingFollowingPadding = (list) => {
          /* Everything below reads the image as it is now, not as it started. With two records growing in one build the second shift has to plan against the layout the first shift produced; reading the original file made the second shift overwrite the first one, so the entries pointed at content that had never moved (21 records at 0xEAB78). */
          if (!needsRelocation) return null;
          const grow = Number(newBlockBytes.length) - Number(originalBlockLength);
          if (!(grow > 0)) { borrowStopReason = 'the record did not grow'; return null; }
          if ((Number(system.pointerSize) || 4) !== 4 || String(system.pointerEndianness || 'little') !== 'little') { borrowStopReason = 'this console does not use four byte little endian pointers'; return null; }
          const stride = 4;
          const valueAt = (at) => (romCopy[at] | (romCopy[at + 1] << 8) | (romCopy[at + 2] << 16) | (romCopy[at + 3] << 24)) >>> 0;
          const targetAt = (at) => {
            if (at < 0 || at + 4 > romCopy.length) return -1;
            const v = valueAt(at);
            if ((v & 0xFF000000) !== 0x08000000) return -1;
            const off = v & 0x01FFFFFF;
            return off < romCopy.length ? off : -1;
          };
          const sites = list
            .filter(p => (p.ptrSize || system.pointerSize) === 4 &&
              (p.transformId === 'gba' || p.transformId === 'gba_offset' || p.transformId === 'raw'))
            .map(p => p.ptrOffset)
            .filter(v => Number.isFinite(v))
            .sort((a, b) => a - b);
          const blockStart = Number(block.start);
          const site = sites.filter(at => targetAt(at) === blockStart)[0];
          if (!Number.isFinite(site)) { borrowStopReason = 'no pointer of this record was found'; return null; }
          let lo = site;
          while (lo - stride >= 0) {
            const prev = targetAt(lo - stride);
            const cur = targetAt(lo);
            if (prev < 0 || cur < 0 || prev >= cur || (cur - prev) > 0x10000) break;
            lo -= stride;
          }
          /* The geometry of the region comes from this walk. A record that has already moved
             to free space keeps its bytes in the region - a move never clears the original -
             so for those the walk falls back to the address the table had for them and carries
             on: their padding is still there to borrow. Without that fallback one moved record
             ended the walk, every record below it was refused a shift, and the hybrid fell
             back to moving all of them (batch 95, 48 record fixture and the real project). */
          const walkTable = recordTable();
          const walkSites = walkTable.sites || [];
          const walkEntries = walkTable.entries || [];
          const walkStride = Number(walkTable.stride) || stride;
          const firstSite = walkSites.length ? Number(walkSites[0]) : NaN;
          const entries = [];
          let hi = lo;
          let previousEntry = -1;
          let walkIndex = Number.isFinite(firstSite) ? Math.round((hi - firstSite) / walkStride) : -1;
          while (hi + stride <= romCopy.length) {
            let cur = targetAt(hi);
            if (cur < 0) break;
            if (previousEntry >= 0 && (cur <= previousEntry || (cur - previousEntry) > 0x10000)) {
              if (walkIndex >= 0 && walkIndex < walkEntries.length) cur = Number(walkEntries[walkIndex]);
            }
            if (previousEntry >= 0 && !(cur > previousEntry)) { hi += stride; walkIndex++; continue; }
            entries.push(cur);
            previousEntry = cur;
            hi += stride;
            walkIndex++;
          }
          if (entries.length < 4) { borrowStopReason = 'the table walk stopped after ' + entries.length + ' entries'; return null; }
          const idx = entries.indexOf(blockStart);
          if (idx < 0 || idx >= entries.length - 1) { borrowStopReason = 'the record is the last one the table walk reached (idx ' + idx + ' of ' + entries.length + ')'; return null; }
          const spans = [];
          for (let i = idx; i < entries.length - 1; i++) {
            const s = entries[i];
            const e = entries[i + 1];
            let pad = 0;
            while (e - 1 - pad >= s && romCopy[e - 1 - pad] === 0x00) pad++;
            spans.push({ start: s, len: e - s - pad, pad: pad });
          }
          const grown = spans[0];
          if (grown.start !== blockStart || grown.len <= 0) { borrowStopReason = 'this block does not begin a record span'; return null; }
          const keep = 2;
          let need = grow;
          /* Take at most (pad - 2) from each message and never less than nothing:
             a message whose padding is already down to the minimum simply keeps it,
             otherwise the arithmetic would grow the padding of one message while
             shrinking another and the end of the region would drift. */
          const takeFrom = (pad) => Math.min(need, Math.max(0, pad - keep));
          const take0 = takeFrom(grown.pad);
          need -= take0;
          const q0 = grown.pad - take0;
          const plan = [];
          let cursor = grown.start + grown.len + grow + q0;
          for (let i = 1; i < spans.length && need > 0; i++) {
            const sp = spans[i];
            const take = takeFrom(sp.pad);
            need -= take;
            const q = sp.pad - take;
            const to = cursor;
            if (to > sp.start) plan.push({ from: sp.start, len: sp.len, to: to });
            cursor = to + sp.len + q;
          }
          if (need > 0) { borrowStopReason = 'the padding after it covers all but ' + need + ' of the ' + grow + ' byte(s) needed'; return null; }
          if (plan.length === 0) return { grew: grow, moved: 0, repointed: 0 };
          const tailStart = plan[0].from;
          const last = plan[plan.length - 1];
          const tailEnd = last.from + last.len;
          if (tailEnd > romCopy.length || tailStart <= blockStart) { borrowStopReason = 'the shifted range does not sit after the record'; return null; }
          const movedTo = (off) => {
            for (let i = 0; i < plan.length; i++) {
              const p = plan[i];
              if (off >= p.from && off < p.from + p.len) return p.to + (off - p.from);
            }
            return -1;
          };
          /* A word that aims at padding keeps aiming at zeros: the whole tail is
             cleared first and only message content is written back, so a reference
             into bytes that disappear still finds zero bytes. Counted, not fatal. */
          let paddingRefs = 0;
          for (let i = 0; i + 4 <= romCopy.length; i += 2) {
            const t = targetAt(i);
            if (t < 0 || t < tailStart || t >= tailEnd) continue;
            if (movedTo(t) < 0) paddingRefs++;
          }
          if (paddingRefs > 0) {
            relocationLog.push(`Borrow check: ${paddingRefs} reference(s) aim at padding that is cleared to zero.`);
          }
          const tail = romCopy.slice(tailStart, tailEnd);
          romCopy.fill(0x00, tailStart, tailEnd);
          plan.forEach(function (p) {
            romCopy.set(tail.subarray(p.from - tailStart, p.from - tailStart + p.len), p.to);
          });
          /* Only words that aim at a record head that actually moved may be rewritten. Asking
             the whole image and rewriting every pointer shaped word also rewrote graphics: a
             tile word can look exactly like 0x08xxxxxx with an offset inside the shifted area,
             and the game glitched whenever the player was hit (user report, 27 Sep). A record
             head is what the engine stores; pages inside a record are reached by walking it, so
             no pointer aims at them. */
          const movedHeads = new Set(plan.map(p => p.from));
          let repointed = 0;
          /* Every word this shift rewrites is remembered with the bytes it had, and the
             tail is remembered as it was, so the whole shift can be undone when the
             check afterwards says it broke something. A shift that cannot be undone
             cannot be tried first. */
          const rewrites = [];
          for (let i = 0; i + 4 <= romCopy.length; i += 2) {
            if (i >= tailStart && i < tailEnd) continue;
            const v = (romCopy[i] | (romCopy[i + 1] << 8) | (romCopy[i + 2] << 16) | (romCopy[i + 3] << 24)) >>> 0;
            if ((v & 0xFF000000) !== 0x08000000) continue;
            const target = v & 0x01FFFFFF;
            if (!movedHeads.has(target)) continue;
            const moved = movedTo(target);
            if (moved < 0) continue;
            const nv = (0x08000000 + moved) >>> 0;
            rewrites.push({ at: i, bytes: [romCopy[i], romCopy[i + 1], romCopy[i + 2], romCopy[i + 3]] });
            romCopy[i] = nv & 0xFF;
            romCopy[i + 1] = (nv >> 8) & 0xFF;
            romCopy[i + 2] = (nv >> 16) & 0xFF;
            romCopy[i + 3] = (nv >>> 24) & 0xFF;
            repointed++;
          }
          return {
            grew: grow,
            moved: plan.length,
            repointed: repointed,
            plan: plan,
            tailStart: tailStart,
            tailEnd: tailEnd,
            tailBefore: tail,
            rewrites: rewrites,
            movedTo: movedTo
          };
        };

        /* Puts the image back exactly as it was before a shift. */
        const undoBorrow = (borrow) => {
          if (!borrow || !borrow.tailBefore) return;
          romCopy.set(borrow.tailBefore, borrow.tailStart);
          (borrow.rewrites || []).forEach(function (w) {
            romCopy[w.at] = w.bytes[0];
            romCopy[w.at + 1] = w.bytes[1];
            romCopy[w.at + 2] = w.bytes[2];
            romCopy[w.at + 3] = w.bytes[3];
          });
        };

        /* Did the shift keep everything it moved where it can be read? Three questions,
           all answerable without guessing:
             - every text that sat inside the moved tail has a new address (a text is
               not padding, so one without a destination means the plan missed it),
             - at that new address the bytes still read as the same original text,
             - and, when the rom has a table, every entry that now aims into the tail
               still finds the record header it used to find.
           A shift that fails any of them is undone and the record moves instead. */
        const verifyBorrow = (borrow) => {
          if (!borrow || !borrow.movedTo) return { ok: true, broken: [] };
          const tailStart = borrow.tailStart;
          const tailEnd = borrow.tailEnd;
          const table = recordTable();
          const sites = table.sites || [];
          const entries = table.entries || [];
          for (let i = 0; i < Math.min(sites.length, entries.length); i++) {
            let v = 0;
            for (let b = 3; b >= 0; b--) v = (v * 256) + romCopy[sites[i] + b];
            const from = (v >>> 0) - (table.base || 0);
            if (from < 0 || from >= romCopy.length) {
              if (v !== 0) return { ok: false, why: 'entry ' + i + ' aims outside the rom' };
              continue;
            }
            if (from < tailStart || from >= tailEnd) continue;
            const originalStart = entries[i];
            if (!Number.isFinite(originalStart)) continue;
            if (romCopy[from] !== originalRom[originalStart] || romCopy[from + 1] !== originalRom[originalStart + 1]) {
              return { ok: false, why: 'record 0x' + Number(originalStart).toString(16).toUpperCase() + ' lost its header' };
            }
          }
          /* The tail is compared with itself as it was before the shift, not with the
             original rom: a record inside the tail may already hold a translation, and
             checking it against the english bytes would undo every honest shift. */
          const tailBefore = borrow.tailBefore;
          for (const start of originalEncodedByStart.keys()) {
            if (start < tailStart || start >= tailEnd) continue;
            const to = borrow.movedTo(start);
            if (to < 0) return { ok: false, why: 'text 0x' + Number(start).toString(16).toUpperCase() + ' was left behind' };
            const from = start - tailStart;
            for (let k = 0; k < 4 && from + k < tailBefore.length; k++) {
              if (romCopy[to + k] !== tailBefore[from + k]) {
                return { ok: false, why: 'text 0x' + Number(start).toString(16).toUpperCase() + ' does not read back at its new address' };
              }
            }
          }
          /* And every record the shift moved has to still close inside its own span. The
             span of a record is the distance to the next entry that aims into the tail,
             which is exactly what the game will read. */
          const reached = [];
          for (let i = 0; i < Math.min(sites.length, entries.length); i++) {
            let w = 0;
            for (let b = 3; b >= 0; b--) w = (w * 256) + romCopy[sites[i] + b];
            const at = (w >>> 0) - (table.base || 0);
            if (at >= tailStart && at < tailEnd) reached.push({ index: i, at: at });
          }
          reached.sort(function (a, b) { return a.at - b.at; });
          for (let k = 0; k < reached.length; k++) {
            const from = reached[k].at;
            const to = (k + 1 < reached.length) ? reached[k + 1].at : Math.min(romCopy.length, from + 0x10000);
            let closes = false;
            for (let p = Math.min(romCopy.length, to) - 1; p >= from; p--) {
              if (romCopy[p] === terminatorHex) { closes = true; break; }
            }
            if (!closes) {
              const original = Number(entries[reached[k].index]) || from;
              return { ok: false, broken: [original], why: 'record 0x' + original.toString(16).toUpperCase() + ' would not close after the shift' };
            }
          }
          return { ok: true, broken: [] };
        };

        /* One way of paying for a record that outgrows its room, the way both Kruptar 7 and
           Atlas do it: write the record where there is room and rewrite its own pointer.
           Kruptar 7 packs the texts into declared destination blocks and marks a text that
           does not fit as an insert error (7/MainUnit.pas, "Ptrs[J] := $FFFFFFFF" and
           "ProgressInsertErrorProc(grName, WPLeftSize)"), Atlas writes an over long text to
           free space and rewrites its pointer, and neither of them slides the rest of the
           file or recalculates every pointer. The shift path below is kept as an experiment
           behind allowMessageShift true only, and the panel does not offer it. */
        /* Moving, not shifting, is the default. A shift grows one record where it stands by
           pushing every message after it forward and recalculating their pointers; the texts that
           already fit are then no longer at their own offset, which is exactly what the translator
           asked us to stop doing, and a build with a shift in it glitched the graphics in the game.
           So a record that is too long moves to the padding at the end of the cartridge and only
           its own entry in the table is rewritten; nothing else in the image is touched.
           allowMessageShift true asks for the shift as an experiment (it is still verified, and it
           is undone when the check says it broke something). */
        const shiftAllowed = system.allowMessageShift === true && system.forceRelocationOnly !== true;
        const willBorrow = needsRelocation && pointersForWrite.length > 0 && shiftAllowed;
        if (willBorrow) {
          const borrowCandidates = knownRecordPointer
            ? pointersForWrite.filter(p => Number(p.ptrOffset) === Number(knownRecordPointer.ptrOffset))
            : pointersForWrite;
          borrowStopReason = '';
          const borrowed = growByBorrowingFollowingPadding(borrowCandidates);
          if (!borrowed && borrowStopReason) {
            relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': the shift was not possible - ' + borrowStopReason + '.');
          }
          if (borrowed) {
            /* A shift is kept only when both questions answer yes: the local one (did
               everything it moved end up where it can be read) and the whole rom one
               (does every record still carry its header and close). The second costs a
               pass over the table, which is nothing next to writing a rom the game
               cannot read. When either says no, the shift is undone and this record
               moves to free space instead - the hybrid the translator asked for. */
            /* Only what the shift itself touched is judged here. Asking the whole rom after
               every shift let one unrelated record - or a wrong table - roll back every shift
               in the build, which is the opposite of what was asked for: shift the texts one
               by one and move only the ones that fail. The whole rom is still checked once at
               the end, and a build that fails there is redone with relocation only. */
            const verdict = verifyBorrow(borrowed);
            const brokenAfterShift = verdict.ok ? verdict.broken : [];
            if (verdict.ok && brokenAfterShift.length === 0) {
              mod.writtenAt = block.start;
              romCopy.set(newBlockBytes, block.start);
              borrowKept++;
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': Grew in place by ' + borrowed.grew + ' byte(s); ' + borrowed.moved + ' message(s) after it slid forward, ' + borrowed.repointed + ' pointer(s) recalculated, and the shift checked out.');
              continue;
            }
            undoBorrow(borrowed);
            borrowRolledBack++;
            const why = verdict.ok
              ? 'record 0x' + (Number(brokenAfterShift[0]) >>> 0).toString(16).toUpperCase() + ' would have been left broken'
              : verdict.why;
            relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': the shift was undone (' + why + '), so this record moves to free space instead.');
          }
        }
        /* Asked for the shift and nothing else: a record that cannot shift is reported
           rather than moved. */
        if (needsRelocation && willBorrow && system.allowMessageShift === true) {
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': [WARNING] This record cannot grow where it is - the padding after it is used up or the shift did not check out - and this build was asked to shift only. Nothing was written; shorten the page or leave the option unset so it can move to free space.');
          continue;
        }
        /* Either the borrow was not asked for or the region has no padding left, so the
           record moves to free space through its own table entry. The address is taken
           now, before the pointer values are built from it. */
        /* Asked to move nothing, nothing is decided here: a record that needs more room
           than it has is reported and left alone, and no free space is taken for it. */
        if (needsRelocation && system.allowMessageShift === false && system.allowRelocation !== true) {
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': [WARNING] Needs ' + (Number(newBlockBytes.length) - Number(originalBlockLength)) + ' byte(s) more than this record has. Nothing was written because this build was asked to move nothing (allowMessageShift false). Shorten the page, or leave the option unset so the record can move to free space.');
          continue;
        }
        const movesByKnownEntry = !!(needsRelocation && knownRecordPointer);
        if (movesByKnownEntry) {
          const why = system.allowMessageShift === true
            ? 'free space was asked for, so the messages around it stay where they are'
            : (willBorrow ? 'this region has no padding left to borrow' : 'the padding of this region is already paid out');
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': ' + why + ', so this record moves to free space and only its own table entry is rewritten.');
        /* The translator asked why the pages they never touched moved as well. A page inside a
           record has no pointer of its own: the engine takes the record from the table and reads
           the pages one after another, so the smallest thing that can be put somewhere else is the
           record. Saying how many pages travelled with it turns that into a number they can check. */
        if (sortedTexts.length > 1) {
          relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': that record is a chain of ' + sortedTexts.length + ' page(s) and they all travel with it, because a page has no pointer of its own - only this record\'s entry in the table is rewritten. The pages you did not edit are copied byte for byte.');
        }
        }

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

          /* An entry that names a message inside this block has to be pointed at where that
             message now sits - whether the block stayed where it was or moved. The pages of
             a block are re-encoded (a translation is rarely the same length as the words it
             replaces), so a page that came out shorter moves every page after it, and the
             table still names the old addresses. The user's Kingdom Hearts build wrote the
             intro's block in place, its pages shifted two bytes, and the game then read a
             terminator at the address its table named: only the first line of the intro
             appeared in game. This used to run only on a move, which is why a build that
             reported success and passed every check still lost the lines. */
          const repointEntriesInsideBlock = (baseOffset, validPointers) => {
            if (!(Number(originalBlockLength) > 0) || textRanges.length === 0) return;
            const kTable = recordTable();
            const kBase = kTable ? (Number(kTable.base) || 0) : 0;
            const kSize = kTable ? (Number(kTable.size) || 4) : 4;
            const kLittle = String(system.pointerEndianness || 'little') === 'little';
            let innerRepointed = 0;
            if (kTable && kTable.entries && kTable.sites && kBase === 0x08000000) {
              const spanStart = Number(block.start);
              const spanEnd = spanStart + Number(originalBlockLength);
              const ranges = [];
              textRanges.forEach(function (rg) {
                const rel = textOffsetsInBlock.get(Number(rg.start));
                if (Number.isFinite(rel)) ranges.push({ start: Number(rg.start), end: Number(rg.end), rel: Number(rel) });
              });
              for (let ki = 0; ki < kTable.entries.length; ki++) {
                const target = Number(kTable.entries[ki]);
                if (!(target >= spanStart && target < spanEnd)) continue;
                const site = Number(kTable.sites[ki]);
                if (!Number.isFinite(site)) continue;
                if (validPointers.some(function (p) { return Number(p.ptrOffset) === site; })) continue;
                /* The bytes at the site have to be the address the engine stores, or this
                   entry is not a pointer at all. A detector that merges tables keeps some
                   sites whose four bytes only look like an address (on Aria of Sorrow 2,903
                   entries are reported where the game's table has 2,893: two pointers of a
                   neighbouring table and eight such coincidences). Rewriting one of those
                   because its value happens to land inside the record being written would
                   corrupt whatever the four bytes really are, so only a value that is the
                   base plus the target - or its GBA mirror, base plus 16 MB - is rewritten. */
                const stored = kSize >= 4
                  ? (romView.getUint32(site, kLittle) >>> 0)
                  : (kSize === 2 ? (romView.getUint16(site, kLittle) >>> 0) : (kBase + target) >>> 0);
                const wanted = (kBase + target) >>> 0;
                const mirrored = (wanted + 0x01000000) >>> 0;
                if (kSize >= 2 && stored !== wanted && stored !== mirrored) continue;
                let rel = null;
                for (let ri = 0; ri < ranges.length; ri++) {
                  const rg = ranges[ri];
                  if (target >= rg.start && target <= rg.end) { rel = rg.rel + (target - rg.start); break; }
                }
                if (rel === null) continue;
                const value = (kBase + Number(baseOffset) + rel) >>> 0;
                if (kSize >= 4) {
                  romView.setUint32(site, value, kLittle);
                } else if (kSize === 3) {
                  if (kLittle) {
                    romCopy[site] = value & 0xFF;
                    romCopy[site + 1] = (value >> 8) & 0xFF;
                    romCopy[site + 2] = (value >> 16) & 0xFF;
                  } else {
                    romCopy[site] = (value >> 16) & 0xFF;
                    romCopy[site + 1] = (value >> 8) & 0xFF;
                    romCopy[site + 2] = value & 0xFF;
                  }
                } else if (kSize === 2) {
                  romView.setUint16(site, value & 0xFFFF, kLittle);
                } else {
                  continue;
                }
                innerRepointed++;
              }
            }
            if (innerRepointed > 0) {
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': ' + innerRepointed + ' entry(ies) of the table name a message inside this span and were pointed at where that message was written.');
            }
          };

        const writeInPlace = () => {
          mod.writtenAt = block.start;
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
              /* A slot that is followed by the two byte chain separator is one
                 page of a longer message. Padding it with the end code would end
                 that message at this page and hide every page after it, so the
                 slack is filled with the neutral byte instead. */
              const after = slotStart + slotLength;
              const chainContinues = after + 1 < romCopy.length &&
                isLikelyControlByte(romCopy[after]) && isLikelyControlByte(romCopy[after + 1]);
              if (chainContinues) {
                romCopy.fill(0x00, slotStart + writeLen, slotStart + slotLength);
              } else {
                fillRangeWithTerminatorPattern(slotStart + writeLen, slotStart + slotLength);
              }
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
            /* A bank relative pointer has to stay in its own bank. Dropped and counted
               rather than written: the alternative is a pointer that reads back as an
               address nobody intended. */
            if (isBankRelativeTransform(ptr.transformId)) {
              const mask = bankMaskFor(ptr.transformId);
              stats.bankChecked = (stats.bankChecked || 0) + 1;
              if ((Number(newTargetOffset) & ~mask) !== (Number(ptr.targetOffset) & ~mask)) {
                stats.bankSkipped = (stats.bankSkipped || 0) + 1;
                continue;
              }
            }
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

        /* Grow in place by borrowing the padding that follows, instead of moving
           the message somewhere else in the file. A message table covers one
           contiguous region (on this rom 2893 entries over 0xEA744..0x11664E) and
           every message in it ends with the console's end code plus a few zero
           bytes. A message that grew pays for the growth with those bytes: the
           messages after it slide forward just far enough that the end of the
           region does not move, and every word that pointed inside the moved part
           is recalculated - the table entries and the 2668 words outside the table
           that aim into the same region. Moving a grown message out of the region
           is what made the game skip dialogue: this rom put one at 0x1A73C4 while
           its neighbours stayed at 0xEA7C8, and the engine reads the table in
           order. */
        /* The records of this rom are indexed by one pointer table, and pages inside
         a record have no pointer of their own: anything the search finds for a page
         is a look-alike. Build 69 acted on those look-alikes and moved four pages
         to 0x1297F4 while the game skipped exactly those conversations, so the rule
         is now: only the head of a record may leave its place, a page inside a
         record can only grow where it is (or be reported so it can be shortened). */

        if (shouldUpdatePointers) {
          let newOffset = needsRelocation ? freeSpaceOffset : block.start;
          /* A record that moves through its own table entry carries the full address,
             so any free run will do and no bank or range search is needed. */
          if (movesByKnownEntry) {
            const room = newBlockBytes.length + terminatorBytes.length;
            const at = allocateFreeSpace(room);
            if (at < 0) {
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': [WARNING] No free space left in this rom for the moved record; it stays where it is. Shorten the page or let the tool expand the rom.');
              continue;
            }
            newOffset = at;
          } else if (needsRelocation && isBankRelativeTransform((pointersForWrite[0] || {}).transformId)) {
            /* A bank relative pointer can only name an address in its own bank, so the
               record lands in that bank or does not move at all. The window is searched
               first; when it has no free run the block is reported instead of written
               somewhere the pointer cannot reach. */
            const bankTransform = pointersForWrite.filter(p => isBankRelativeTransform(p.transformId))[0];
            const mask = bankMaskFor(bankTransform.transformId);
            const bankBase = Number(block.start) & ~mask;
            const requiredBytes = newBlockBytes.length + terminatorBytes.length;
            const at = findFreeSpaceInRange(romCopy, bankBase, Math.min(romCopy.length, bankBase + mask + 1), requiredBytes, [0x00, 0xFF, terminatorHex]);
            if (at === -1) {
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': [WARNING] This record needs ' + (Number(newBlockBytes.length) - Number(originalBlockLength)) + ' byte(s) more room and its pointer can only name an address inside its own ' + Math.round((mask + 1) / 1024) + ' KB bank, which has no free run. Nothing was written; shorten the page.');
              continue;
            }
            newOffset = at - (at % 2);
          } else if (needsRelocation && isGbaNonPaddingProfile) {
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
          if (needsRelocation && (validationResult.stats.bankSkipped || 0) > 0) {
            relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': ' + validationResult.stats.bankSkipped + ' pointer(s) cannot follow this record out of its bank and were left alone.');
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
          /* Moving text in a game whose record format is not fully understood is
             what broke the dialogue: the intro message displayed fine while it was
             written in place, and the same game skipped conversations once a
             message was moved (build 66 relocated one out of the region, build 67
             slid twenty six of them by a few bytes - the crashing export). The
             records hold engine data the tool cannot see, so by default nothing
             moves: a page that needs more room than its record has is reported and
             left alone. Shifting stays available behind an explicit request, for
             testing or for games whose format has been worked out. */
          /* Atlas rule: on a move the engine's own entry is the only word that may be
             rewritten. The scan finds look-alikes as well - build 66 moved a record
             while writing a second, wrong site, and the game skipped that
             conversation even though the bytes of the record itself were right - so
             the known entry replaces the list instead of joining it. A move is the
             one case where the table entry is enough: the engine reaches the record
             through it, and every other word in the file keeps aiming where it did. */
          if (needsRelocation && knownRecordPointer && validPointers.length > 0) {
            const trusted = validPointers.filter(p => Number(p.ptrOffset) === Number(knownRecordPointer.ptrOffset));
            if (trusted.length > 0 && trusted.length < validPointers.length) {
              relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': keeping only the known table entry at 0x' + Number(knownRecordPointer.ptrOffset).toString(16).toUpperCase() + ' for this move; ' + (validPointers.length - trusted.length) + ' heuristic pointer(s) are left untouched.');
              validPointers = trusted;
            }
          }
          /* A page inside a record may not move: no pointer of its own exists, so a
             relocation would trust a look-alike and the conversation would vanish. */
          if (needsRelocation) {
            const ridx = recordIndexFor(block.start);
            if (ridx >= 0 && recordTable().entries[ridx] !== block.start) {
              relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] This page sits inside record 0x${recordTable().entries[ridx].toString(16).toUpperCase()} and has no pointer of its own, so it was left where it is. Shorten the page (it needs ${Number(newBlockBytes.length) - Number(originalBlockLength)} byte(s) less) or move the whole record.`);
              continue;
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
                /* no pointer was written on this path, so no site has to be skipped */
                repointEntriesInsideBlock(block.start, []);
                relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Pointer update failed (NO POINTERS FOUND). In-place data written.`);
              }
              if (isStrictGbaPointerValidation) {
                relocationLog.push(`  -> Origin validation ${validationResult.stats.originPassed}/${validationResult.stats.originChecked}, target validation ${validationResult.stats.targetPassed}/${validationResult.stats.targetChecked}.`);
              }
            }
          } else {
            if (needsRelocation) {
              mod.writtenAt = newOffset;
              romCopy.set(newBlockBytes, newOffset);
              romCopy.set(terminatorBytes, newOffset + newBlockBytes.length);
            } else {
              writeInPlace();
              repointEntriesInsideBlock(block.start, validPointers);
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
              /* Atlas writes the pointer of every entry it inserts, and here a moved block is a
                 whole span of the image: the record the table names plus the messages that sit
                 inside that same span. Those were copied into the moved block, and while their
                 entries still aim at the old bytes they keep saying what the game said before the
                 translation - a script that starts at one of them reads the original text. Every
                 entry whose target lands inside a text this block wrote is given the address of
                 that text's copy, through the same relative offset the text was written with, so
                 it stays right whether the pages were repacked or kept at their own offsets.
                 Nothing outside the span is touched. */
              if (needsRelocation && originalBlockLength > 0 && textRanges.length > 0) {
                const kTable = recordTable();
                const kBase = kTable ? (Number(kTable.base) || 0) : 0;
                const kSize = kTable ? (Number(kTable.size) || 4) : 4;
                const kLittle = String(system.pointerEndianness || 'little') === 'little';
                let innerRepointed = 0;
                if (kTable && kTable.entries && kTable.sites && kBase === 0x08000000) {
                  const spanStart = Number(block.start);
                  const spanEnd = spanStart + Number(originalBlockLength);
                  const ranges = [];
                  textRanges.forEach(function (rg) {
                    const rel = textOffsetsInBlock.get(Number(rg.start));
                    if (Number.isFinite(rel)) ranges.push({ start: Number(rg.start), end: Number(rg.end), rel: Number(rel) });
                  });
                  for (let ki = 0; ki < kTable.entries.length; ki++) {
                    const target = Number(kTable.entries[ki]);
                    if (!(target >= spanStart && target < spanEnd)) continue;
                    const site = Number(kTable.sites[ki]);
                    if (!Number.isFinite(site)) continue;
                    if (validPointers.some(function (p) { return Number(p.ptrOffset) === site; })) continue;
                    let rel = null;
                    for (let ri = 0; ri < ranges.length; ri++) {
                      const rg = ranges[ri];
                      if (target >= rg.start && target <= rg.end) { rel = rg.rel + (target - rg.start); break; }
                    }
                    if (rel === null) continue;
                    const value = (kBase + newOffset + rel) >>> 0;
                    if (kSize >= 4) {
                      romView.setUint32(site, value, kLittle);
                    } else if (kSize === 3) {
                      if (kLittle) {
                        romCopy[site] = value & 0xFF;
                        romCopy[site + 1] = (value >> 8) & 0xFF;
                        romCopy[site + 2] = (value >> 16) & 0xFF;
                      } else {
                        romCopy[site] = (value >> 16) & 0xFF;
                        romCopy[site + 1] = (value >> 8) & 0xFF;
                        romCopy[site + 2] = value & 0xFF;
                      }
                    } else if (kSize === 2) {
                      romView.setUint16(site, value & 0xFFFF, kLittle);
                    } else {
                      continue;
                    }
                    innerRepointed++;
                  }
                }
                if (innerRepointed > 0) {
                  relocationLog.push('Block at 0x' + Number(block.start).toString(16).toUpperCase() + ': ' + innerRepointed + ' entry(ies) of the table name a message inside this span, so they were pointed at the moved copy as well - a script that starts at one of those messages reads the translated text instead of the old one.');
                }
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
            /* nothing was repointed here either: only the pages inside the block move */
            repointEntriesInsideBlock(block.start, []);
            relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: Injected in-place.`);
          }
        } else {
          const sizeDiff = newBlockBytes.length - originalBlockLength;
          relocationLog.push(`Block at 0x${block.start.toString(16).toUpperCase()}: [WARNING] Relocation failed (NO POINTERS FOUND). Size difference: ${sizeDiff} bytes. Original data kept to prevent corruption.`);
          relocationLog.push(`  -> Try using shorter translations or find pointers manually.`);
        }
      }
      const selfCheckBad = findBrokenRecords();
      if (selfCheckBad.length > 0) {
        const badAt = Number(selfCheckBad[0]) >>> 0;
        const dump = [0, 1, 2, 3, 4, 5, 6, 7].map(k => (romCopy[badAt + k] || 0).toString(16)).join(' ');
      }
      if (selfCheckBad.length > 0 && system.keepBrokenImageForTests !== true) {
        relocationLog.push(`[WARNING] Self check failed: ${selfCheckBad.length} record(s) lost their end code or their header (first at 0x${selfCheckBad[0].toString(16).toUpperCase()}). The original bytes are handed back instead of a rom that would freeze or skip dialogue. Build in smaller scopes - one group, or a few neighbouring texts - and run Insert All again.`);
        return { modifiedRom: originalRom.slice(0), relocationLog };
      }
      /* The self check reads records; this reads TEXTS. A record can keep its header and still
         be missing the translation that was meant to be in it (a block written somewhere else,
         a page left alone, a slot cut short), and that is exactly the failure the user kept
         hitting: the report said the insert was done while the game showed the old words. Every
         text that was built is looked for at the address its record was written to. */
      const insertMissing = [];
      let insertChecked = 0;
      for (const mod of modifications) {
        if (!Number.isFinite(Number(mod.writtenAt))) continue;
        const writtenAt = Number(mod.writtenAt);
        const localTexts = Array.isArray(mod.sortedTexts) ? mod.sortedTexts : [];
        for (const textItem of localTexts) {
          const textData = textMap.get(textItem.id);
          if (!textData || !String(textData.translatedText || '').length) continue;
          const rel = mod.textOffsetsInBlock ? mod.textOffsetsInBlock.get(Number(textItem.startByte)) : undefined;
          if (rel === undefined) continue;
          const written = mod.encodedByStart ? mod.encodedByStart.get(Number(textItem.startByte)) : null;
          const encoded = written || smartTextParse(textData.translatedText, tokenizer, masterCharToHex, usePaddingByte, encodeOptions);
          if (!encoded || !encoded.length) continue;
          insertChecked++;
          const at = writtenAt + Number(rel);
          let present = at + encoded.length <= romCopy.length;
          if (present) {
            for (let k = 0; k < encoded.length; k++) {
              if (romCopy[at + k] !== encoded[k]) { present = false; break; }
            }
          }
          if (!present) insertMissing.push({ startByte: Number(textItem.startByte), at: at });
        }
      }
      if (insertMissing.length > 0) {
        relocationLog.push('[WARNING] Insert check: ' + insertMissing.length + ' of ' + insertChecked + ' translated text(s) are NOT where the build says they are (first at 0x' + Number(insertMissing[0].startByte).toString(16).toUpperCase() + ', looked for at 0x' + Number(insertMissing[0].at).toString(16).toUpperCase() + '). The old text would show in the game.');
      } else if (insertChecked > 0) {
        relocationLog.push('Insert check: all ' + insertChecked + ' translated text(s) are present in the image at the address their record was written to.');
      }

      if (borrowKept > 0 || borrowRolledBack > 0) {
        relocationLog.push('Growth report: ' + borrowKept + ' record(s) grew in place after the shift checked out' +
          (borrowRolledBack > 0 ? ', and ' + borrowRolledBack + ' shift(s) were undone and moved instead' : '') + '.');
      }
      relocationLog.push(`Self check passed: all ${(recordTable().entries || []).length} records close with the end code and keep their header.`);
      return { modifiedRom: romCopy, relocationLog };
    };

  core.rebuildRom = rebuildRom;
})(window);
