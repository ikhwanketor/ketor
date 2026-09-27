const params = new URLSearchParams(location.search);
    const querySystem = params.get('system') || 'Unknown';
    const queryCore = params.get('core') || 'generic';
    const statusEl = document.getElementById('status');
    const emuHost = document.getElementById('emuHost');
    const emuStage = document.getElementById('game');
    const runtimePlaceholder = document.getElementById('runtimePlaceholder');
    window.__PT_RUNTIME_READY__ = false;
    document.querySelectorAll('[data-close-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-close-panel');
        const panel = id ? document.getElementById(id) : null;
        if (panel) panel.style.display = 'none';
      });
    });

    const runtimeState = {
      booting: false,
      ready: false,
      romKey: '',
      core: queryCore,
      system: querySystem,
      gameUrl: '',
      gameUrlOwned: false,
      loaderReady: false,
      lastSceneTextDigest: 0,
      lastSceneText: '',
      activeBootSeq: 0,
      lastReadySignal: '',
      coreProfile: null,
      audioMuted: true,
      paused: false,
      fastForward: false,
      lastSavedState: null,
      overlaySweepTimer: null,
      lastRomBytes: null,
      lastRomSignature: 0,
      ffPulseTimer: null
    };

    const supportLevelBySystem = {
      'NES': 'stable',
      'SNES': 'stable',
      'Game Boy': 'stable',
      'GBC': 'stable',
      'GBA': 'stable',
      'Sega Genesis/MD': 'profile-stage2',
      'Genesis': 'profile-stage2',
      'PC Engine': 'planned',
      'NDS': 'profile-stage2',
      'PlayStation 1': 'profile-stage2',
      'Nintendo 64': 'experimental',
      'PlayStation Portable': 'experimental',
      'Nintendo 3DS': 'limited'
    };

    function setPlaceholder(text, visible = true) {
      if (!runtimePlaceholder) return;
      runtimePlaceholder.textContent = String(text || '');
      runtimePlaceholder.classList.toggle('hidden', !visible);
    }

    function setStatus(text, isWarn = false) {
      statusEl.textContent = String(text || '');
      if (isWarn) statusEl.classList.add('warn');
      else statusEl.classList.remove('warn');
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    }

    function clearFastForwardPulse() {
      if (runtimeState.ffPulseTimer) {
        try { clearInterval(runtimeState.ffPulseTimer); } catch (_) { }
        runtimeState.ffPulseTimer = null;
      }
    }

    function applyFastForwardState(enabled) {
      const emu = window.EJS_emulator || null;
      const gm = (emu && emu.gameManager) ? emu.gameManager : (window.EJS_gameManager || null);
      const gmFns = (gm && gm.functions) ? gm.functions : null;
      const targetSpeed = enabled ? 99.0 : 1.0;
      let ok = false;

      const invoke = (target, method, ...args) => {
        if (!target || typeof target[method] !== 'function') return false;
        try {
          const out = target[method](...args);
          if (out && typeof out.then === 'function') return true;
          return out !== false;
        } catch (_) {
          return false;
        }
      };

      clearFastForwardPulse();

      if (emu && typeof emu.changeSettingOption === 'function') {
        ok = invoke(emu, 'changeSettingOption', 'ff-ratio', enabled ? 'unlimited' : '3.0', true) || ok;
        ok = invoke(emu, 'changeSettingOption', 'fastForward', enabled ? 'enabled' : 'disabled', true) || ok;
      }
      if (gm) {
        ok = invoke(gm, 'setFastForwardRatio', enabled ? 0 : 3) || ok;
        ok = invoke(gm, 'toggleFastForward', enabled ? 1 : 0) || ok;
      }
      if (gmFns) {
        ok = invoke(gmFns, 'setFastForwardRatio', enabled ? 0 : 3) || ok;
        ok = invoke(gmFns, 'toggleFastForward', enabled ? 1 : 0) || ok;
      }

      const targets = [emu, gm, gmFns, emu?.gameManager, emu?.functions].filter(Boolean);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        ok = invoke(t, 'setFastForward', enabled ? 1 : 0) || ok;
        ok = invoke(t, 'fastForward', enabled ? 1 : 0) || ok;
        ok = invoke(t, 'setSpeed', targetSpeed) || ok;
      }

      try {
        if (emu && typeof emu.isFastForward !== 'undefined') emu.isFastForward = !!enabled;
      } catch (_) { }
      try {
        if (emu && typeof emu.config === 'object') {
          emu.config.fastforward_ratio = enabled ? 0 : 3;
          emu.config.audio_sync = !enabled;
          emu.config.video_sync = !enabled;
        }
      } catch (_) { }
      try {
        window.EJS_speed = targetSpeed;
      } catch (_) { }
      if (ok) runtimeState.fastForward = !!enabled;
      return ok;
    }

    function activateEmuHost(active) {
      if (!emuHost) return;
      if (active) emuHost.classList.add('active');
      else emuHost.classList.remove('active');
      setPlaceholder(active ? '' : 'Integrated emulator runtime slot is idle.', !active);
    }

    function postToParent(type, payload, transferables) {
      try {
        if (Array.isArray(transferables) && transferables.length > 0) {
          window.parent?.postMessage({ source: 'pt-wasm-runtime', type, payload: payload || {} }, '*', transferables);
        } else {
          window.parent?.postMessage({ source: 'pt-wasm-runtime', type, payload: payload || {} }, '*');
        }
      } catch (_) { }
    }

    function normalizeText(value) {
      return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\[LINE\]/gi, '\n')
        .replace(/\//g, '\n')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }

    function digestText(text) {
      const src = String(text || '');
      let hash = 0;
      for (let i = 0; i < src.length; i++) hash = ((hash * 33) ^ src.charCodeAt(i)) >>> 0;
      return hash >>> 0;
    }

    function mapEjsCore(system, coreHint) {
      const hint = String(coreHint || '').toLowerCase();
      if (hint === 'fceumm' || hint === 'nestopia' || hint === 'nes') return 'nes';
      if (hint === 'snes9x' || hint === 'mesen-s' || hint === 'snes') return 'snes';
      if (hint === 'gambatte' || hint === 'sameboy' || hint === 'gb') return 'gb';
      if (hint === 'mgba' || hint === 'gpsp' || hint === 'gba') return 'gba';
      if (hint === 'genesis_plus_gx' || hint === 'segamd' || hint === 'genesis') return 'segaMD';
      if (hint === 'desmume' || hint === 'melonds' || hint === 'nds') return 'nds';
      if (hint === 'pcsx_rearmed' || hint === 'swanstation' || hint === 'psx' || hint === 'ps1') return 'psx';
      const s = String(system || '').toLowerCase();
      if (s.includes('nes')) return 'nes';
      if (s.includes('snes')) return 'snes';
      if (s.includes('game boy') || s.includes('gbc') || s === 'gb') return 'gb';
      if (s.includes('gba')) return 'gba';
      if (s.includes('genesis') || s.includes('sega')) return 'segaMD';
      if (s.includes('nds') || s.includes('nintendo ds')) return 'nds';
      if (s.includes('playstation 1') || s.includes('ps1')) return 'psx';
      return '';
    }

    function toUint8Array(value) {
      if (!value) return null;
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (ArrayBuffer.isView(value)) {
        const view = value;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      }
      if (typeof value === 'string') {
        try {
          const clean = value.trim();
          if (!clean) return null;
          const bin = atob(clean);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
          return out;
        } catch (_) {
          return null;
        }
      }
      if (typeof value === 'object' && Array.isArray(value.data)) {
        try {
          return new Uint8Array(value.data);
        } catch (_) { }
      }
      if (Array.isArray(value)) return new Uint8Array(value);
      return null;
    }

    function disposeGameUrl() {
      if (!runtimeState.gameUrl) return;
      if (runtimeState.gameUrlOwned) {
        try { URL.revokeObjectURL(runtimeState.gameUrl); } catch (_) { }
      }
      runtimeState.gameUrl = '';
      runtimeState.gameUrlOwned = false;
    }

    function clearEmuStage() {
      if (!emuStage) return;
      while (emuStage.firstChild) emuStage.removeChild(emuStage.firstChild);
    }

    function clearRuntimeCallbacks() {
      try { window.EJS_onGameStart = null; } catch (_) { }
      try { window.EJS_onReady = null; } catch (_) { }
      try { window.EJS_onLoadState = null; } catch (_) { }
      try { window.EJS_onLoad = null; } catch (_) { }
    }

    async function destroyRuntimeInstance() {
      stopOverlaySweepLoop();
      clearFastForwardPulse();
      clearRuntimeCallbacks();
      try {
        if (window.EJS_emulator && typeof window.EJS_emulator.gameStop === 'function') {
          window.EJS_emulator.gameStop();
        }
      } catch (_) { }
      try {
        if (window.EJS_emulator && typeof window.EJS_emulator.destroy === 'function') {
          window.EJS_emulator.destroy();
        }
      } catch (_) { }
      try {
        if (window.Module && typeof window.Module.exit === 'function') {
          window.Module.exit(0);
        }
      } catch (_) { }
      try { window.EJS_emulator = null; } catch (_) { }
      clearEmuStage();
      disposeGameUrl();
      runtimeState.ready = false;
      runtimeState.booting = false;
      runtimeState.paused = false;
      runtimeState.fastForward = false;
      try {
        document.body.classList.add('pt-menu-locked-global');
        document.body.classList.remove('pt-menu-open-global');
      } catch (_) { }
      activateEmuHost(false);
      await sleep(50);
    }

    async function ensureLoaderScript(forceReload = false) {
      const srcBase = 'https://cdn.emulatorjs.org/stable/data/loader.js';
      const shouldForceReload = forceReload === true;
      if (runtimeState.loaderReady && !shouldForceReload) return;

      if (shouldForceReload) {
        runtimeState.loaderReady = false;
        try {
          document.querySelectorAll('script[data-ejs-loader=\"1\"]').forEach((node) => node.remove());
        } catch (_) { }
      }

      const existing = document.querySelector('script[data-ejs-loader=\"1\"]');
      if (existing) {
        if (existing.dataset.ptReady === '1') {
          runtimeState.loaderReady = true;
          return;
        }
        await new Promise((resolve, reject) => {
          const onLoad = () => {
            existing.dataset.ptReady = '1';
            existing.removeEventListener('load', onLoad);
            existing.removeEventListener('error', onError);
            resolve();
          };
          const onError = () => {
            existing.removeEventListener('load', onLoad);
            existing.removeEventListener('error', onError);
            reject(new Error('Failed to initialize EmulatorJS runtime loader.'));
          };
          existing.addEventListener('load', onLoad);
          existing.addEventListener('error', onError);
        });
        runtimeState.loaderReady = true;
        return;
      }

      const src = shouldForceReload ? `${srcBase}?pt_reload=${Date.now()}` : srcBase;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.ejsLoader = '1';
        script.onload = () => {
          script.dataset.ptReady = '1';
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load EmulatorJS runtime loader.'));
        document.body.appendChild(script);
      });
      runtimeState.loaderReady = true;
    }

    function waitForEmulatorReady(timeoutMs = 25000) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          try {
            const stageHasVideo = !!(emuStage && emuStage.querySelector('canvas,video,iframe'));
            const emu = window.EJS_emulator;
            const hasStateApi =
              !!(emu && (
                typeof emu.game_save === 'function' ||
                typeof emu.game_load === 'function' ||
                typeof emu.saveState === 'function' ||
                typeof emu.loadState === 'function' ||
                typeof emu?.gameManager?.getState === 'function' ||
                typeof emu?.gameManager?.loadState === 'function'
              ));
            if (emu && (hasStateApi || stageHasVideo)) {
              resolve(window.EJS_emulator);
              return;
            }
            if (stageHasVideo) {
              resolve(window.EJS_emulator || {});
              return;
            }
          } catch (_) { }
          if ((Date.now() - start) > timeoutMs) {
            reject(new Error('WASM emulator core did not become ready within timeout.'));
            return;
          }
          setTimeout(tick, 120);
        };
        tick();
      });
    }

    async function awaitWithTimeout(value, timeoutMs) {
      if (!(value && typeof value.then === 'function')) return value;
      return await Promise.race([
        value,
        new Promise((_, reject) => setTimeout(() => reject(new Error('promise-timeout')), Math.max(100, Number(timeoutMs) || 1200)))
      ]);
    }

    async function tryLoadStateWhenReady(stateBytes, timeoutMs = 20000) {
      const saveData = toUint8Array(stateBytes);
      if (!saveData || saveData.length === 0) return false;
      const started = Date.now();
      while ((Date.now() - started) < timeoutMs) {
        try {
          const emu = window.EJS_emulator;
          if (emu && typeof emu.game_load === 'function') {
            let ok = emu.game_load(saveData);
            ok = await awaitWithTimeout(ok, 1400);
            return ok !== false;
          }
          if (emu && typeof emu.loadState === 'function') {
            let ok = emu.loadState(saveData);
            ok = await awaitWithTimeout(ok, 1400);
            return ok !== false;
          }
          if (emu && typeof emu.setState === 'function') {
            let ok = emu.setState(saveData);
            ok = await awaitWithTimeout(ok, 1400);
            return ok !== false;
          }
          if (emu && emu.gameManager && typeof emu.gameManager.setState === 'function') {
            let ok = emu.gameManager.setState(saveData);
            ok = await awaitWithTimeout(ok, 1400);
            return ok !== false;
          }
          if (emu && emu.gameManager && typeof emu.gameManager.loadState === 'function') {
            let ok = emu.gameManager.loadState(saveData);
            ok = await awaitWithTimeout(ok, 1400);
            return ok !== false;
          }
        } catch (_) { }
        await new Promise(r => setTimeout(r, 140));
      }
      return false;
    }

    function computeRomSignature(romBuffer) {
      try {
        const bytes = new Uint8Array(romBuffer || new ArrayBuffer(0));
        if (!bytes.length) return 0;
        let sig = 2166136261 >>> 0;
        for (let i = 0; i < bytes.length; i++) {
          sig ^= bytes[i] & 0xFF;
          sig = Math.imul(sig, 16777619) >>> 0;
        }
        sig ^= (bytes.length & 0xFF);
        sig = Math.imul(sig, 16777619) >>> 0;
        return sig >>> 0;
      } catch (_) {
        return 0;
      }
    }

    async function bootRuntimeCore({ romBuffer, romUrl = '', system, coreHint, forceReload = false }) {
      const ejsCore = mapEjsCore(system, coreHint);
      const hasRomBuffer = !!(romBuffer && ((romBuffer.byteLength || 0) > 0));
      const normalizedRomUrl = String(romUrl || '').trim();
      if (!ejsCore || (!hasRomBuffer && !normalizedRomUrl)) {
        throw new Error('WASM core adapter is unavailable for this system or ROM payload is missing.');
      }
      const romSig = hasRomBuffer ? computeRomSignature(romBuffer) : 0;
      const romPart = hasRomBuffer
        ? `${romBuffer.byteLength || 0}:${romSig}`
        : `url:${normalizedRomUrl}`;
      const key = `${String(system || '')}:${String(coreHint || '')}:${romPart}`;
      if (!forceReload && runtimeState.ready && runtimeState.romKey === key) return;

      runtimeState.booting = true;
      runtimeState.ready = false;
      runtimeState.romKey = key;
      runtimeState.core = ejsCore;
      runtimeState.system = String(system || runtimeState.system || 'Unknown');
      runtimeState.activeBootSeq += 1;
      const bootSeq = runtimeState.activeBootSeq;
      runtimeState.lastRomSignature = romSig;

      const coreProfiles = {
        nes: { volume: 0.25 },
        snes: { volume: 0.25 },
        gb: { volume: 0.30 },
        gba: { volume: 0.30 },
        segaMD: { volume: 0.28 },
        nds: { volume: 0.22 },
        psx: { volume: 0.22 }
      };
      runtimeState.coreProfile = coreProfiles[ejsCore] || { volume: 0.30 };

      await destroyRuntimeInstance();
      activateEmuHost(false);
      setPlaceholder('Booting integrated WASM core...', true);

      let gameUrl = normalizedRomUrl;
      let gameUrlOwned = false;
      if (hasRomBuffer) {
        const blob = new Blob([romBuffer], { type: 'application/octet-stream' });
        gameUrl = URL.createObjectURL(blob);
        gameUrlOwned = true;
        runtimeState.lastRomBytes = new Uint8Array(romBuffer);
        runtimeState.lastRomSignature = romSig;
      }
      runtimeState.gameUrl = gameUrl;
      runtimeState.gameUrlOwned = gameUrlOwned;

      window.EJS_player = '#game';
      window.EJS_core = ejsCore;
      window.EJS_gameUrl = gameUrl;
      window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
      window.EJS_startOnLoaded = true;
      window.EJS_backgroundColor = '#000000';
      window.EJS_volume = runtimeState.audioMuted ? 0 : (Number(runtimeState.coreProfile.volume) || 0.30);
      window.EJS_mute = true;
      window.EJS_startMuted = true;
      window.EJS_language = 'en-US';
      window.EJS_disableDatabases = true;
      window.EJS_disableCueBoot = true;
      window.EJS_retroarchOpts = [
        { name: 'fastforward_ratio', default: 99.0, isString: false }
      ];
      // Keep runtime UI minimal to reduce accidental hover popups and stutter on low-end devices.
      window.EJS_Buttons = {
        playPause: false,
        restart: false,
        mute: false,
        saveState: false,
        loadState: false,
        screenRecord: false,
        gamepad: false,
        cheat: false,
        volume: false,
        saveSavFiles: false,
        loadSavFiles: false,
        quickSave: false,
        quickLoad: false,
        screenshot: false,
        cacheManager: false,
        exitEmulation: false,
        settings: false,
        fullscreen: false
      };

      const readySignal = { resolved: false, resolve: null };
      const readyPromise = new Promise((resolve) => { readySignal.resolve = resolve; });
      const signalReady = (tag) => {
        if (readySignal.resolved) return;
        readySignal.resolved = true;
        runtimeState.lastReadySignal = String(tag || 'ready');
        if (typeof readySignal.resolve === 'function') readySignal.resolve(runtimeState.lastReadySignal);
      };
      clearRuntimeCallbacks();
      window.EJS_onReady = () => signalReady('EJS_onReady');
      window.EJS_onGameStart = () => signalReady('EJS_onGameStart');
      window.EJS_onLoadState = () => signalReady('EJS_onLoadState');
      window.EJS_onLoad = () => signalReady('EJS_onLoad');

      await ensureLoaderScript(forceReload);
      activateEmuHost(true);
      setPlaceholder('', false);
      applyRuntimeAudioState(true);

      try {
        await Promise.race([
          readyPromise,
          waitForEmulatorReady(4500).then(() => 'probe-ready')
        ]);
      } catch (waitErr) {
        if (bootSeq !== runtimeState.activeBootSeq) return;
        setStatus(`WASM core booted, but ready probe timed out. Runtime continues in compatibility mode. (${String(waitErr?.message || waitErr)})`, true);
      }
      if (bootSeq !== runtimeState.activeBootSeq) return;

      runtimeState.booting = false;
      runtimeState.ready = true;
      activateEmuHost(true);
      setStatus(`WASM core ready: ${runtimeState.core} (${runtimeState.system}) via ${runtimeState.lastReadySignal || 'probe'}.`);
      forceHideMenuPanels(false);
      suppressBrandingOverlays();
      ensureCanvasHierarchyVisible();
      setTimeout(() => suppressBrandingOverlays(), 250);
      setTimeout(() => suppressBrandingOverlays(), 900);
      setTimeout(() => ensureCanvasHierarchyVisible(), 260);
      setTimeout(() => ensureCanvasHierarchyVisible(), 920);
      startOverlaySweepLoop();
      postToParent('pt-runtime-core-ready', {
        system: runtimeState.system,
        core: runtimeState.core,
        coreHint: queryCore
      });
      applyRuntimeAudioState(runtimeState.audioMuted);
    }

    function getStateLoadProfile() {
      const core = String(runtimeState.core || '').toLowerCase();
      if (core === 'gba') return { bootDelayMs: 220, attempts: 2, betweenMs: 60 };
      if (core === 'snes' || core === 'segamd') return { bootDelayMs: 180, attempts: 2, betweenMs: 60 };
      if (core === 'nes' || core === 'gb') return { bootDelayMs: 140, attempts: 2, betweenMs: 50 };
      if (core === 'nds' || core === 'psx') return { bootDelayMs: 320, attempts: 2, betweenMs: 90 };
      return { bootDelayMs: 180, attempts: 2, betweenMs: 60 };
    }

    async function loadStateWithStabilization(stateBytes, timeoutMs = 18000) {
      const saveData = toUint8Array(stateBytes);
      if (!saveData || saveData.byteLength === 0) return false;
      const profile = getStateLoadProfile();
      const localTimeout = Math.max(2500, Number(timeoutMs) || 6000);
      const readyTimeout = Math.max(1200, Math.min(3600, Math.floor(localTimeout / 2)));
      try { await waitForEmulatorReady(readyTimeout); } catch (_) { }
      await sleep(Math.max(60, Math.min(520, Number(profile.bootDelayMs) || 220)));
      const attempts = Math.max(1, Number(profile.attempts) || 3);
      const perAttemptTimeout = Math.max(1200, Math.min(5200, Math.floor(localTimeout / attempts)));
      for (let i = 0; i < attempts; i++) {
        const ok = await tryLoadStateWhenReady(saveData, perAttemptTimeout);
        if (ok) return true;
        await sleep(Math.max(30, Math.min(180, Number(profile.betweenMs) || 70)) + (i * 40));
      }
      return false;
    }

    async function captureSaveState() {
      try {
        const emu = window.EJS_emulator;
        if (!emu) return null;
        let raw = null;
        if (typeof emu.game_save === 'function') raw = emu.game_save();
        else if (typeof emu.saveState === 'function') raw = emu.saveState();
        else if (typeof emu.getState === 'function') raw = emu.getState();
        else if (emu.gameManager && typeof emu.gameManager.saveState === 'function') raw = emu.gameManager.saveState();
        else if (emu.gameManager && typeof emu.gameManager.getState === 'function') raw = emu.gameManager.getState();
        if (raw && typeof raw.then === 'function') raw = await raw;
        const bytes = toUint8Array(raw);
        if (!bytes || bytes.length === 0) return null;
        const cloned = new Uint8Array(bytes);
        runtimeState.lastSavedState = new Uint8Array(cloned);
        return cloned;
      } catch (_) {
        return null;
      }
    }

    async function captureSaveStateWithRetry(maxAttempts = 8, delayMs = 70) {
      const attempts = Math.max(1, Number(maxAttempts) || 5);
      for (let i = 0; i < attempts; i++) {
        const bytes = await captureSaveState();
        if (bytes && bytes.byteLength > 0) return bytes;
        await sleep(delayMs);
      }
      return null;
    }

    async function hardResetAndLoadRuntime(payload) {
      const incomingRom = toUint8Array(payload?.romBuffer);
      if (!(incomingRom instanceof Uint8Array) || incomingRom.byteLength <= 0) {
        return { ok: false, loadedBytes: 0, reason: 'hard-reset-load-empty-rom' };
      }

      const skipStateRestore = payload?.skipStateRestore === true;
      const incomingState = toUint8Array(payload?.saveStateBuffer);
      const hasState = !skipStateRestore && !!(incomingState && incomingState.byteLength > 0);
      const romBuffer =
        (incomingRom.byteOffset === 0 && incomingRom.byteLength === incomingRom.buffer.byteLength)
          ? incomingRom.buffer
          : incomingRom.buffer.slice(incomingRom.byteOffset, incomingRom.byteOffset + incomingRom.byteLength);

      let loadedBytes = 0;
      let reason = hasState ? 'hard-reset-state-restored' : (skipStateRestore ? 'hard-reset-state-skipped-by-request' : 'hard-reset-no-state');

      try {
        try {
          const emu = window.EJS_emulator;
          if (emu && typeof emu.pause === 'function') emu.pause();
          else if (emu && typeof emu.togglePause === 'function') emu.togglePause();
        } catch (_) { }
        applyRuntimeAudioState(true);

        await bootRuntimeCore({
          romBuffer,
          romUrl: payload?.romUrl,
          system: payload?.system || querySystem,
          coreHint: payload?.core || queryCore,
          forceReload: true
        });

        let stateApplied = false;
        if (hasState) {
          stateApplied = await loadStateWithStabilization(incomingState, 5200);
          if (!stateApplied) {
            await sleep(180);
            stateApplied = await loadStateWithStabilization(incomingState, 3200);
          }
          if (stateApplied) {
            runtimeState.lastSavedState = new Uint8Array(incomingState);
            loadedBytes = incomingState.byteLength;
            reason = 'hard-reset-state-restored';
          } else {
            runtimeState.lastSavedState = null;
            loadedBytes = 0;
            reason = 'hard-reset-state-load-failed-fallback-no-state';
            try {
              const emu = window.EJS_emulator;
              const gm = (emu && emu.gameManager) ? emu.gameManager : null;
              if (emu && typeof emu.restart === 'function') emu.restart();
              else if (gm && gm.functions && typeof gm.functions.restart === 'function') gm.functions.restart();
              else if (gm && typeof gm.restart === 'function') gm.restart();
            } catch (_) { }
            await sleep(220);
            postToParent('pt-runtime-notify', {
              message: 'State restore failed for patched ROM. Runtime continued from fresh boot.'
            });
          }
        }

        try {
          const emu = window.EJS_emulator;
          if (emu && typeof emu.play === 'function') emu.play();
          if (emu && typeof emu.togglePause === 'function' && runtimeState.paused) emu.togglePause();
        } catch (_) { }

        runtimeState.lastRomBytes = new Uint8Array(romBuffer);
        runtimeState.lastRomSignature = computeRomSignature(romBuffer);
        runtimeState.paused = false;

        ensureCanvasHierarchyVisible();
        suppressBrandingOverlays();

        await sleep(hasState ? 240 : 180);
        try {
          const probe = await captureRuntimeFrameWithFallback(240, 160);
          if (!frameHasSignal(probe)) {
            const emu = window.EJS_emulator;
            if (emu && typeof emu.play === 'function') emu.play();
          }
        } catch (_) { }

        setTimeout(() => { captureRuntimeFrameWithFallback(240, 160).catch(() => null); }, 140);
        return { ok: true, loadedBytes, reason };
      } catch (err) {
        return { ok: false, loadedBytes: 0, reason: err?.message || String(err) };
      }
    }

    function captureRuntimeFrame(maxWidth = 640, maxHeight = 360) {
      try {
        const canvasList = emuStage ? Array.from(emuStage.querySelectorAll('canvas')) : [];
        const videoList = emuStage ? Array.from(emuStage.querySelectorAll('video')) : [];
        let srcCanvas = null;
        let bestArea = 0;
        for (let i = 0; i < canvasList.length; i++) {
          const c = canvasList[i];
          const w = Math.max(0, Number(c.width) || Number(c.clientWidth) || 0);
          const h = Math.max(0, Number(c.height) || Number(c.clientHeight) || 0);
          const area = w * h;
          if (area > bestArea) {
            bestArea = area;
            srcCanvas = c;
          }
        }
        let srcEl = srcCanvas;
        if (!srcEl && videoList.length > 0) {
          let bestVideo = null;
          let bestVideoArea = 0;
          for (let i = 0; i < videoList.length; i++) {
            const v = videoList[i];
            const w = Math.max(0, Number(v.videoWidth) || Number(v.clientWidth) || 0);
            const h = Math.max(0, Number(v.videoHeight) || Number(v.clientHeight) || 0);
            const area = w * h;
            if (area > bestVideoArea) {
              bestVideoArea = area;
              bestVideo = v;
            }
          }
          srcEl = bestVideo;
        }
        if (!srcEl) return null;
        const srcW = Math.max(1, Number(srcEl.width) || Number(srcEl.videoWidth) || Number(srcEl.clientWidth) || 1);
        const srcH = Math.max(1, Number(srcEl.height) || Number(srcEl.videoHeight) || Number(srcEl.clientHeight) || 1);
        const scale = Math.min(
          1,
          (Math.max(64, Number(maxWidth) || 640) / srcW),
          (Math.max(64, Number(maxHeight) || 360) / srcH)
        );
        const outW = Math.max(1, Math.floor(srcW * scale));
        const outH = Math.max(1, Math.floor(srcH * scale));
        const tmp = document.createElement('canvas');
        tmp.width = outW;
        tmp.height = outH;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(srcEl, 0, 0, srcW, srcH, 0, 0, outW, outH);
        const img = ctx.getImageData(0, 0, outW, outH);
        if (!img || !img.data || img.data.length < (outW * outH * 4)) return null;
        const pixels = new Uint8ClampedArray(img.data);
        return { width: outW, height: outH, pixels };
      } catch (_) {
        return null;
      }
    }

    async function decodePngBytesToFrame(pngBytes, maxWidth = 640, maxHeight = 360) {
      try {
        const bytes = toUint8Array(pngBytes);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) return null;
        const blob = new Blob([bytes], { type: 'image/png' });
        let bitmap = null;
        try {
          bitmap = await createImageBitmap(blob);
        } catch (_) { }
        let srcW = 0;
        let srcH = 0;
        let drawSource = bitmap;
        if (!drawSource) {
          const img = await new Promise((resolve, reject) => {
            const el = new Image();
            const url = URL.createObjectURL(blob);
            el.onload = () => {
              URL.revokeObjectURL(url);
              resolve(el);
            };
            el.onerror = () => {
              URL.revokeObjectURL(url);
              reject(new Error('png-decode-failed'));
            };
            el.src = url;
          });
          drawSource = img;
        }
        srcW = Math.max(1, Number(drawSource.width) || 1);
        srcH = Math.max(1, Number(drawSource.height) || 1);
        const scale = Math.min(
          1,
          (Math.max(64, Number(maxWidth) || 640) / srcW),
          (Math.max(64, Number(maxHeight) || 360) / srcH)
        );
        const outW = Math.max(1, Math.floor(srcW * scale));
        const outH = Math.max(1, Math.floor(srcH * scale));
        const tmp = document.createElement('canvas');
        tmp.width = outW;
        tmp.height = outH;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(drawSource, 0, 0, srcW, srcH, 0, 0, outW, outH);
        const imgData = ctx.getImageData(0, 0, outW, outH);
        if (!imgData || !(imgData.data instanceof Uint8ClampedArray)) return null;
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        return { width: outW, height: outH, pixels: new Uint8ClampedArray(imgData.data) };
      } catch (_) {
        return null;
      }
    }

    async function captureRuntimeFrameWithFallback(maxWidth = 640, maxHeight = 360) {
      let frame = captureRuntimeFrame(maxWidth, maxHeight);
      if (frame && frame.pixels instanceof Uint8ClampedArray) return frame;
      try {
        const emu = window.EJS_emulator;
        const gm = (emu && emu.gameManager) ? emu.gameManager : null;
        if (gm && typeof gm.screenshot === 'function') {
          const raw = await gm.screenshot();
          frame = await decodePngBytesToFrame(raw, maxWidth, maxHeight);
          if (frame && frame.pixels instanceof Uint8ClampedArray) return frame;
        }
      } catch (_) { }
      return null;
    }

    function frameHasSignal(frame) {
      if (!frame || !(frame.pixels instanceof Uint8ClampedArray)) return false;
      const p = frame.pixels;
      let nonBlack = 0;
      let opaque = 0;
      const stride = Math.max(16, Math.floor((p.length / 4) / 4096) * 4);
      for (let i = 0; i < p.length; i += stride) {
        const r = p[i] || 0;
        const g = p[i + 1] || 0;
        const b = p[i + 2] || 0;
        const a = p[i + 3] || 0;
        if (a > 0) opaque++;
        if ((r + g + b) > 6) nonBlack++;
        if (nonBlack >= 24) return true;
        if (opaque >= 96) return true;
      }
      return false;
    }

    function applyRuntimeAudioState(muted) {
      runtimeState.audioMuted = !!muted;
      const targetVolume = runtimeState.audioMuted ? 0 : (Number(runtimeState.coreProfile?.volume) || 0.30);
      try {
        window.EJS_volume = targetVolume;
      } catch (_) { }
      try {
        const emu = window.EJS_emulator;
        if (emu && typeof emu.setVolume === 'function') emu.setVolume(targetVolume);
      } catch (_) { }
      try {
        const host = emuStage || document;
        const mediaEls = host.querySelectorAll ? host.querySelectorAll('audio,video') : [];
        mediaEls.forEach((el) => {
          try {
            el.muted = runtimeState.audioMuted;
            if (!runtimeState.audioMuted) el.volume = Math.max(0, Math.min(1, targetVolume));
          } catch (_) { }
        });
      } catch (_) { }
    }

    const menuClickOnlyState = {
      button: null,
      panels: [],
      open: false,
      docHandler: null
    };

    function isLikelyMenuButton(node) {
      if (!node || !(node instanceof HTMLElement)) return false;
      const id = String(node.id || '').toLowerCase();
      const cls = String(node.className || '').toLowerCase();
      const aria = String(node.getAttribute('aria-label') || '').toLowerCase();
      const txt = String(node.textContent || '').trim();
      if (id.includes('menu_btn') || id === 'emulator_menu_btn') return true;
      if (cls.includes('menu-btn') || cls.includes('ejs_menu_btn') || cls.includes('ejs-menu-btn')) return true;
      if (aria.includes('menu')) return true;
      return txt === '☰' || txt === '≡';
    }

    function collectLikelyMenuNodes() {
      const root = emuStage || document;
      const all = Array.from(root.querySelectorAll('*'));
      const buttons = all.filter(isLikelyMenuButton);
      const panels = all.filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        if (buttons.includes(el)) return false;
        const id = String(el.id || '').toLowerCase();
        const cls = String(el.className || '').toLowerCase();
        if (!id && !cls) return false;
        const looksMenu = id.includes('menu') || cls.includes('menu');
        if (!looksMenu) return false;
        const r = el.getBoundingClientRect();
        if (!r || r.width < 40 || r.height < 40) return false;
        return true;
      });
      return { button: buttons[0] || null, panels };
    }

    function enforceSaveLoadOnlyMenu() {
      try {
        if (emuStage) emuStage.classList.add('pt-menu-save-load-only');
      } catch (_) { }
      const root = emuStage || document;
      const all = Array.from(root.querySelectorAll('*'));
      const menuItems = all.filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const id = String(el.id || '').toLowerCase();
        const cls = String(el.className || '').toLowerCase();
        if (!(id.includes('menu') || cls.includes('menu'))) return false;
        const txt = String(el.textContent || '').trim().toLowerCase();
        if (!txt) return false;
        if (txt.length > 120) return false;
        return true;
      });
      for (const item of menuItems) {
        try {
          const id = String(item.id || '').toLowerCase();
          const cls = String(item.className || '').toLowerCase();
          const txt = String(item.textContent || '').trim().toLowerCase();
          const keep =
            txt.includes('save') ||
            txt.includes('load') ||
            id.includes('save') ||
            id.includes('load') ||
            id.includes('state') ||
            cls.includes('save') ||
            cls.includes('load') ||
            cls.includes('state');
          item.setAttribute('data-pt-menu-item', '1');
          if (keep) item.setAttribute('data-pt-keep', '1');
          else item.removeAttribute('data-pt-keep');
        } catch (_) { }
      }
    }

    function suppressBrandingOverlays() {
      const root = emuStage || document;
      const nodes = Array.from(root.querySelectorAll('div,span,p,button,small,section,article,label,a,strong,b,i,h1,h2,h3'));
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const isMenuButtonNode = isLikelyMenuButton(node);
        const text = String(node.textContent || '').trim().toLowerCase();
        const id = String(node.id || '').toLowerCase();
        const cls = String(node.className || '').toLowerCase();
        const title = String(node.getAttribute('title') || '').toLowerCase();
        const aria = String(node.getAttribute('aria-label') || '').toLowerCase();
        const style = window.getComputedStyle(node);
        const zIndex = Number.parseInt(style?.zIndex || '0', 10);
        const isFloating = style?.position === 'fixed' || style?.position === 'absolute';
        const isBranding = (
          text === 'emulatorjs' ||
          text.startsWith('emulatorjs ') ||
          text.includes('emulatorjs 4.') ||
          title.includes('emulatorjs') ||
          aria.includes('emulatorjs')
        );
        const isUiOverlay = (
          id.includes('menu') ||
          cls.includes('menu') ||
          cls.includes('control') ||
          cls.includes('mobile') ||
          id.includes('button') ||
          cls.includes('button') ||
          cls.includes('watermark') ||
          text.includes('fast forward') ||
          text.includes('slow motion')
        );
        if (!isMenuButtonNode && !isBranding && !(isUiOverlay && isFloating && zIndex >= 5)) continue;
        if (node.querySelector('canvas,video,iframe')) continue;
        node.setAttribute('data-pt-branding', '1');
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('opacity', '0', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
      }
    }

    function stopOverlaySweepLoop() {
      if (runtimeState.overlaySweepTimer) {
        clearInterval(runtimeState.overlaySweepTimer);
        runtimeState.overlaySweepTimer = null;
      }
    }

    function startOverlaySweepLoop() {
      stopOverlaySweepLoop();
      runtimeState.overlaySweepTimer = setInterval(() => {
        suppressBrandingOverlays();
        ensureCanvasHierarchyVisible();
        forceHideMenuPanels(false);
      }, 900);
    }

    function ensureCanvasHierarchyVisible() {
      const root = emuStage || document;
      const canvases = Array.from(root.querySelectorAll('canvas'));
      for (const canvas of canvases) {
        if (!(canvas instanceof HTMLElement)) continue;
        canvas.style.setProperty('display', 'block', 'important');
        canvas.style.setProperty('opacity', '1', 'important');
        let parent = canvas.parentElement;
        let depth = 0;
        while (parent && depth < 8 && parent !== root.parentElement) {
          parent.style.setProperty('display', 'block', 'important');
          parent.style.setProperty('visibility', 'visible', 'important');
          parent.style.setProperty('opacity', '1', 'important');
          parent.style.setProperty('pointer-events', 'auto', 'important');
          parent = parent.parentElement;
          depth++;
        }
      }
    }

    function isLikelyMenuPanel(node) {
      if (!node || !(node instanceof HTMLElement)) return false;
      if (isLikelyMenuButton(node)) return false;
      const id = String(node.id || '').toLowerCase();
      const cls = String(node.className || '').toLowerCase();
      if (!id && !cls) return false;
      if (!(id.includes('menu') || cls.includes('menu'))) return false;
      const r = node.getBoundingClientRect();
      if (!r || r.width < 28 || r.height < 20) return false;
      return true;
    }

    function forceHideMenuPanels(open = false) {
      const root = emuStage || document;
      const all = Array.from(root.querySelectorAll('*'));
      for (const el of all) {
        if (!isLikelyMenuPanel(el)) continue;
        try {
          if (!open) {
            el.style.pointerEvents = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            el.style.display = 'none';
          } else {
            el.style.pointerEvents = 'auto';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
            el.style.display = '';
          }
        } catch (_) { }
      }
    }

    function applyMenuPanelState(open) {
      menuClickOnlyState.open = !!open;
      try {
        if (emuStage) {
          emuStage.classList.add('pt-menu-locked');
          emuStage.classList.toggle('pt-menu-open', !!open);
        }
        document.body.classList.add('pt-menu-locked-global');
        document.body.classList.toggle('pt-menu-open-global', !!open);
      } catch (_) { }
      forceHideMenuPanels(!!open);
      for (const panel of menuClickOnlyState.panels) {
        try {
          panel.style.pointerEvents = open ? 'auto' : 'none';
          panel.style.opacity = open ? '1' : '0';
          panel.style.visibility = open ? 'visible' : 'hidden';
          panel.style.transition = 'opacity 0s linear';
          panel.style.zIndex = open ? '99' : '1';
        } catch (_) { }
      }
    }

    const cpu = navigator.hardwareConcurrency || 0;
    const mem = navigator.deviceMemory || 0;
    const crossIso = typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false;
    setStatus(
      `Runtime diagnostics: cpu=${cpu || 'n/a'}, memory=${mem || 'n/a'}GB, crossOriginIsolated=${crossIso}.` +
      (crossIso ? '' : '\nWarning: SharedArrayBuffer features need cross-origin isolation (COOP/COEP).') +
      '\nAudio stability mode: muted by default.',
      !crossIso
    );

    window.addEventListener('message', async (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.source !== 'pockettranslate') return;
      const payload = msg.payload || {};

      if (msg.type === 'pt-runtime-load-rom') {
        try {
          await bootRuntimeCore({
            romBuffer: payload.romBuffer,
            romUrl: payload.romUrl,
            system: payload.system || querySystem,
            coreHint: payload.core || queryCore,
            forceReload: false
          });
        } catch (err) {
          activateEmuHost(false);
          setStatus(`WASM core bootstrap failed: ${String(err?.message || err)}`, true);
          postToParent('pt-runtime-error', { message: err?.message || String(err) });
        }
        return;
      }

      if (msg.type === 'pt-runtime-save-state' || msg.type === 'pt-runtime-req-save-state') {
        const requestId = Number(payload.requestId) || 0;
        if (!runtimeState.ready) {
          try { await waitForEmulatorReady(5000); } catch (_) { }
        }
        const stateBytes = await captureSaveStateWithRetry(36, 110);
        if (!stateBytes) {
          const emu = window.EJS_emulator || {};
          const methodHints = [
            typeof emu.game_save === 'function' ? 'game_save' : null,
            typeof emu.saveState === 'function' ? 'saveState' : null,
            typeof emu.getState === 'function' ? 'getState' : null,
            (emu.gameManager && typeof emu.gameManager.saveState === 'function') ? 'gameManager.saveState' : null,
            (emu.gameManager && typeof emu.gameManager.getState === 'function') ? 'gameManager.getState' : null
          ].filter(Boolean).join(',');
          postToParent('pt-runtime-save-state-result', {
            requestId,
            ok: false,
            reason: methodHints ? `save-state-unavailable (${methodHints})` : 'save-state-unavailable'
          });
          return;
        }
        const buffer = stateBytes.buffer.slice(stateBytes.byteOffset, stateBytes.byteOffset + stateBytes.byteLength);
        postToParent('pt-runtime-save-state-result', {
          requestId,
          ok: true,
          saveStateBuffer: buffer,
          length: stateBytes.byteLength
        }, [buffer]);
        return;
      }

      if (msg.type === 'pt-runtime-hard-reset-and-load' || msg.type === 'pt-runtime-load-rom-with-state') {
        const requestId = Number(payload.requestId) || 0;
        const result = await hardResetAndLoadRuntime(payload);
        if (!result.ok) {
          postToParent('pt-runtime-load-state-result', {
            requestId,
            ok: false,
            loadedBytes: 0,
            reason: result.reason || 'hard-reset-load-failed'
          });
          postToParent('pt-runtime-error', { message: result.reason || 'hard-reset-load-failed' });
        } else {
          postToParent('pt-runtime-load-state-result', {
            requestId,
            ok: true,
            loadedBytes: Number(result.loadedBytes) || 0,
            reason: String(result.reason || 'hard-reset-ok')
          });
        }
        return;
      }

      if (msg.type === 'pt-runtime-set-audio') {
        applyRuntimeAudioState(!!payload.muted);
        postToParent('pt-runtime-audio-result', {
          ok: true,
          muted: runtimeState.audioMuted
        });
        return;
      }

      if (msg.type === 'pt-runtime-fastforward') {
        const requestId = Number(payload.requestId) || 0;
        const enable = !!payload.enable;
        try {
          const ok = applyFastForwardState(enable);
          postToParent('pt-runtime-fastforward-result', {
            requestId,
            ok: !!ok,
            fastForward: !!runtimeState.fastForward,
            reason: ok ? 'ok' : 'fast-forward-unavailable'
          });
        } catch (err) {
          postToParent('pt-runtime-fastforward-result', {
            requestId,
            ok: false,
            fastForward: !!runtimeState.fastForward,
            reason: err?.message || String(err)
          });
        }
        return;
      }

      if (msg.type === 'pt-runtime-control') {
        const requestId = Number(payload.requestId) || 0;
        const action = String(payload.action || '').toLowerCase();
        try {
          if (action === 'save_state') {
            const bytes = await captureSaveStateWithRetry(28, 90);
            if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
              postToParent('pt-runtime-control-result', {
                requestId,
                action,
                ok: false,
                reason: 'save-state-unavailable'
              });
              return;
            }
            runtimeState.lastSavedState = new Uint8Array(bytes);
            const outBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            postToParent('pt-runtime-control-result', {
              requestId,
              action,
              ok: true,
              saveStateBuffer: outBuffer,
              loadedBytes: bytes.byteLength
            }, [outBuffer]);
            return;
          }
          if (action === 'load_state') {
            const incoming = toUint8Array(payload.saveStateBuffer);
            const sourceState = (incoming && incoming.byteLength > 0) ? incoming : runtimeState.lastSavedState;
            if (!(sourceState instanceof Uint8Array) || sourceState.byteLength <= 0) {
              postToParent('pt-runtime-control-result', {
                requestId,
                action,
                ok: false,
                reason: 'no-saved-state'
              });
              return;
            }
            let ok = await loadStateWithStabilization(sourceState, 4500);
            if (!ok) {
              await sleep(60);
              ok = await loadStateWithStabilization(sourceState, 2800);
            }
            if (ok) runtimeState.lastSavedState = new Uint8Array(sourceState);
            postToParent('pt-runtime-control-result', {
              requestId,
              action,
              ok: !!ok,
              loadedBytes: sourceState.byteLength,
              reason: ok ? 'state-restored' : 'state-load-failed'
            });
            return;
          }
          if (action === 'pause_toggle') {
            const emu = window.EJS_emulator;
            let paused = runtimeState.paused;
            if (emu && typeof emu.pause === 'function' && typeof emu.play === 'function') {
              paused = !runtimeState.paused;
              if (paused) emu.pause();
              else emu.play();
            } else if (emu && typeof emu.togglePause === 'function') {
              emu.togglePause();
              paused = !runtimeState.paused;
            }
            runtimeState.paused = !!paused;
            postToParent('pt-runtime-control-result', {
              requestId,
              action,
              ok: true,
              paused: runtimeState.paused
            });
            return;
          }
          if (action === 'fast_forward') {
            const emu = window.EJS_emulator;
            const hasEnable = Object.prototype.hasOwnProperty.call(payload, 'enable') || Object.prototype.hasOwnProperty.call(payload, 'enabled');
            const enabled = hasEnable
              ? !!(Object.prototype.hasOwnProperty.call(payload, 'enable') ? payload.enable : payload.enabled)
              : !runtimeState.fastForward;
            const ok = applyFastForwardState(enabled);
            if (enabled && runtimeState.paused && emu) {
              try {
                if (typeof emu.play === 'function') emu.play();
                else if (typeof emu.togglePause === 'function') emu.togglePause();
                runtimeState.paused = false;
              } catch (_) { }
            }
            postToParent('pt-runtime-control-result', {
              requestId,
              action,
              ok: !!ok,
              fastForward: runtimeState.fastForward,
              reason: ok ? 'ok' : 'fast-forward-unavailable'
            });
            return;
          }
          if (action === 'reset') {
            const emu = window.EJS_emulator;
            const gm = (emu && emu.gameManager) ? emu.gameManager : (window.EJS_gameManager || null);
            let ok = false;
            if (emu && typeof emu.restart === 'function') {
              emu.restart();
              ok = true;
            } else if (gm && gm.functions && typeof gm.functions.restart === 'function') {
              gm.functions.restart();
              ok = true;
            } else if (gm && typeof gm.restart === 'function') {
              gm.restart();
              ok = true;
            } else if (gm && typeof gm.resetGame === 'function') {
              gm.resetGame();
              ok = true;
            } else if (gm && typeof gm.gameReset === 'function') {
              gm.gameReset();
              ok = true;
            } else if (emu && typeof emu.gameReset === 'function') {
              emu.gameReset();
              ok = true;
            } else if (emu && typeof emu.reset === 'function') {
              emu.reset();
              ok = true;
            } else if (emu && typeof emu.game_restart === 'function') {
              emu.game_restart();
              ok = true;
            } else if (emu && emu.gameManager && typeof emu.gameManager.restart === 'function') {
              emu.gameManager.restart();
              ok = true;
            } else if (emu && emu.gameManager && typeof emu.gameManager.reset === 'function') {
              emu.gameManager.reset();
              ok = true;
            } else if (emu && typeof emu.gameStop === 'function' && typeof emu.gamePlay === 'function') {
              emu.gameStop();
              emu.gamePlay();
              ok = true;
            }
            if (!ok && runtimeState.lastSavedState instanceof Uint8Array && runtimeState.lastSavedState.byteLength > 0) {
              ok = await loadStateWithStabilization(runtimeState.lastSavedState, 5200);
            }
            if (!ok) {
              let rebootDone = false;
              if (runtimeState.lastRomBytes && runtimeState.lastRomBytes.byteLength > 0) {
                const rebootRom = runtimeState.lastRomBytes.buffer.slice(
                  runtimeState.lastRomBytes.byteOffset,
                  runtimeState.lastRomBytes.byteOffset + runtimeState.lastRomBytes.byteLength
                );
                await destroyRuntimeInstance();
                await sleep(50);
                await bootRuntimeCore({
                  romBuffer: rebootRom,
                  system: runtimeState.system || querySystem,
                  coreHint: runtimeState.core || queryCore,
                  forceReload: true
                });
                rebootDone = true;
              } else if (typeof runtimeState.gameUrl === 'string' && runtimeState.gameUrl.trim()) {
                await destroyRuntimeInstance();
                await sleep(50);
                await bootRuntimeCore({
                  romUrl: runtimeState.gameUrl,
                  system: runtimeState.system || querySystem,
                  coreHint: runtimeState.core || queryCore,
                  forceReload: true
                });
                rebootDone = true;
              }
              if (rebootDone && runtimeState.lastSavedState instanceof Uint8Array && runtimeState.lastSavedState.byteLength > 0) {
                await loadStateWithStabilization(runtimeState.lastSavedState, 3200);
              }
              ok = rebootDone || ok;
            }
            if (!ok && emu && typeof emu.pause === 'function' && typeof emu.play === 'function') {
              emu.pause();
              await sleep(60);
              emu.play();
              ok = true;
            }
            runtimeState.paused = false;
            runtimeState.fastForward = false;
            clearFastForwardPulse();
            postToParent('pt-runtime-control-result', {
              requestId,
              action,
              ok,
              reason: ok ? 'reset-ok' : 'reset-unavailable'
            });
            return;
          }
          postToParent('pt-runtime-control-result', {
            requestId,
            action,
            ok: false,
            reason: 'unknown-action'
          });
        } catch (err) {
          postToParent('pt-runtime-control-result', {
            requestId,
            action,
            ok: false,
            reason: err?.message || String(err)
          });
        }
        return;
      }

      if (msg.type === 'pt-runtime-scene-redraw') {
        let ok = false;
        const requestId = Number(payload.requestId) || 0;
        try {
          const emu = window.EJS_emulator;
          if (emu && typeof emu.pause === 'function' && typeof emu.play === 'function') {
            emu.pause();
            await sleep(18);
            emu.play();
            ok = true;
          } else if (emu && typeof emu.togglePause === 'function') {
            emu.togglePause();
            await sleep(18);
            emu.togglePause();
            ok = true;
          }
          if (emu && typeof emu.fastForward === 'function') {
            emu.fastForward(true);
            await sleep(28);
            emu.fastForward(!!runtimeState.fastForward);
            ok = true;
          } else if (emu && typeof emu.setSpeed === 'function') {
            const baseSpeed = runtimeState.fastForward ? 99.0 : 1.0;
            emu.setSpeed(runtimeState.fastForward ? 99.0 : 2.0);
            await sleep(28);
            emu.setSpeed(baseSpeed);
            ok = true;
          }
        } catch (_) { }
        postToParent('pt-runtime-scene-redraw-result', {
          requestId,
          ok,
          textId: Number(payload.textId) || 0
        });
        return;
      }

      if (msg.type === 'pt-runtime-scene') {
        const normalized = normalizeText(payload?.text || '');
        const digest = digestText(normalized);
        runtimeState.lastSceneText = normalized;
        runtimeState.lastSceneTextDigest = digest;
        postToParent('pt-runtime-ack', {
          frameId: Number(payload.frameId) || 0,
          system: payload.system || runtimeState.system || querySystem,
          core: runtimeState.ready ? (runtimeState.core || payload.core || queryCore) : (payload.core || queryCore),
          coreHint: payload.core || queryCore,
          textDigest: digest,
          lineCount: normalized ? normalized.split('\n').length : 0,
          overflow: false
        });
      }
    });

    try {
      let observerQueued = false;
      const menuObserver = new MutationObserver(() => {
        if (observerQueued) return;
        observerQueued = true;
        setTimeout(() => {
          observerQueued = false;
          suppressBrandingOverlays();
          ensureCanvasHierarchyVisible();
          if (!runtimeState.ready) return;
          forceHideMenuPanels(false);
        }, 120);
      });
      menuObserver.observe(emuStage || document.body, { childList: true, subtree: true });
    } catch (_) { }

    window.addEventListener('beforeunload', () => {
      stopOverlaySweepLoop();
    });

    postToParent('pt-runtime-ready', {
      system: querySystem,
      core: queryCore,
      coreHint: queryCore,
      acceptsRomLoad: true,
      supportsSaveStateBridge: true
    });
    window.__PT_RUNTIME_READY__ = true;
