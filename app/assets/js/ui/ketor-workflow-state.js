/* ============================================================
   Ketor - Workflow Config State (v1)
   ------------------------------------------------------------
   Batch 17: exposes the per-console workflow modules in
   workflows/*.js to the UI.

   Every time a ROM is loaded the workflow for that ROM is
   resolved and the results of getUIConfig(), getSystemProfile()
   and getHelpText() are published through the standard state
   module pattern.

   Naming: Ketor.workflows is the workflow registry
   (workflows/index.js), Ketor.workflow is this state module.

   uiConfig is null while no ROM is loaded, or when no workflow
   could be resolved. Consumers must read null as "console
   unknown" and keep every control available, so the UI falls
   back to its pre-Batch-17 behaviour instead of hiding options
   based on a guess.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  var R = global.React;
  if (!R) return;
  K.workflow = K.workflow || {};

  var _state = {
    romName: '',
    romSize: 0,
    romSystem: '',
    workflow: null,
    workflowName: '',
    systemProfile: null,
    uiConfig: null,
    helpText: '',
    ready: false
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
    if (changed) { _state = next; _notify(); }
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

  function useWorkflowConfig() {
    return R.useSyncExternalStore(subscribe, getState, getState);
  }

  // Bitmask / visibility helper. Unknown console means "show it":
  // hiding a control is only ever justified by real config.
  function isVisible(key) {
    if (!_state.uiConfig) return true;
    return _state.uiConfig[key] === true;
  }

  // ROM bytes are handed to the state modules just before
  // ketor:rom-loaded is dispatched, so Search Text already holds
  // the fresh buffer. The name check keeps this from reading a
  // buffer that belongs to a previously loaded ROM.
  function _romBytesFromSearch(romName) {
    if (!K.search || typeof K.search.getState !== 'function') return null;
    var st = null;
    try { st = K.search.getState(); } catch (_) { return null; }
    if (!st || !st.romBytes) return null;
    if (romName && st.romName && st.romName !== romName) return null;
    return st.romBytes;
  }

  function _resolveWorkflow(detail) {
    var w = K.workflows || {};
    var bytes = _romBytesFromSearch(detail.name);

    if (bytes && typeof w.detectWorkflow === 'function') {
      try {
        var detected = w.detectWorkflow(bytes, detail.name);
        if (detected) return detected;
      } catch (_) { }
    }

    // Fallback: the workbench runs detectWorkflow() itself and puts
    // the resulting system name on the event detail.
    if (detail.system && typeof w.getWorkflowByName === 'function') {
      try {
        var named = w.getWorkflowByName(detail.system);
        if (named) return named;
      } catch (_) { }
    }

    return null;
  }

  // Console-recommended extraction defaults are applied as initial
  // values only. K.search.applyExtractionDefaults() skips any key
  // the user has already changed by hand in this session.
  function _applyExtractionDefaults(uiConfig) {
    if (!uiConfig) return;
    if (!K.search || typeof K.search.applyExtractionDefaults !== 'function') return;

    var patch = {};
    var min = Number(uiConfig.defaultMinLength);
    var max = Number(uiConfig.defaultMaxLength);
    if (Number.isFinite(min) && min >= 1) patch.minLength = Math.floor(min);
    if (Number.isFinite(max) && max >= 8) patch.maxLength = Math.floor(max);
    // recommendedExtraction: 'strict' enables the extractor strict
    // pass; 'standard' and 'engine-aware' leave it off.
    patch.strictExtractorMode = uiConfig.recommendedExtraction === 'strict';

    K.search.applyExtractionDefaults(patch);
  }

  function onRomLoaded(ev) {
    var detail = (ev && ev.detail) ? ev.detail : {};
    var wf = _resolveWorkflow(detail);

    var uiConfig = null;
    var systemProfile = null;
    var helpText = '';

    if (wf) {
      if (typeof wf.getUIConfig === 'function') {
        try { uiConfig = wf.getUIConfig() || null; } catch (_) { }
      }
      if (typeof wf.getSystemProfile === 'function') {
        try { systemProfile = wf.getSystemProfile() || null; } catch (_) { }
      }
      if (typeof wf.getHelpText === 'function') {
        try { helpText = String(wf.getHelpText() || ''); } catch (_) { }
      }
    }

    _set({
      romName: detail.name || '',
      romSize: Number(detail.size) || 0,
      romSystem: detail.system || (wf ? wf.name : '') || '',
      workflow: wf,
      workflowName: wf ? (wf.name || '') : '',
      systemProfile: systemProfile,
      uiConfig: uiConfig,
      helpText: helpText,
      ready: !!wf
    });

    _applyExtractionDefaults(uiConfig);
  }

  global.addEventListener('ketor:rom-loaded', onRomLoaded);

  K.workflow.getState = getState;
  K.workflow.subscribe = subscribe;
  K.workflow.useWorkflowConfig = useWorkflowConfig;
  K.workflow.isVisible = isVisible;
  K.workflow.getUIConfig = function () { return _state.uiConfig; };
  K.workflow.getSystemProfile = function () { return _state.systemProfile; };
  K.workflow.getHelpText = function () { return _state.helpText; };

})(window);
