/* ============================================================
   Ketor -- Command Registry
   ------------------------------------------------------------
   Central command system matching VS Code's command pattern.
   Menubar items, activity bar actions, sidebar buttons, and
   keyboard shortcuts all resolve to command IDs.

   API:
   - registerCommand(id, handler, options)
   - registerCommands({ id: handler, ... })
   - executeCommand(id, ...args) -> Promise
   - getCommand(id) / hasCommand(id) / listCommands()
   - onDidChange(fn) -> unsubscribe
   ============================================================ */

/* ============================================================
   Ketor - Command Registry + UI Provider Registry
   ------------------------------------------------------------
   Loaded first. Provides:
   - Ketor.commands.* : command registry (menubar, kebab, buttons)
   - Ketor.ui.registry : sidebar + tab provider registry
   - Ketor.ui.registerSidebarProvider(activityId, Component)
   - Ketor.ui.registerTabProvider(kind, Component)
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.commands = Ketor.commands || {};
  Ketor.ui = Ketor.ui || {};

  // ---- Command registry -------------------------------------------
  var cmdRegistry = new Map();
  var cmdListeners = new Set();

  function cmdNotify() {
    cmdListeners.forEach(function (fn) {
      try { fn(); } catch (_) { }
    });
  }

  function registerCommand(id, handler, options) {
    if (!id || typeof handler !== 'function') {
      console.warn('[Ketor.commands] Invalid registration:', id);
      return false;
    }
    cmdRegistry.set(id, { id: id, handler: handler, options: options || {} });
    cmdNotify();
    return true;
  }

  function unregisterCommand(id) {
    var removed = cmdRegistry.delete(id);
    if (removed) cmdNotify();
    return removed;
  }

  function getCommand(id) {
    return cmdRegistry.get(id) || null;
  }

  function hasCommand(id) {
    return cmdRegistry.has(id);
  }

  function listCommands() {
    return Array.from(cmdRegistry.values());
  }

  function executeCommand(id) {
    var args = Array.prototype.slice.call(arguments, 1);
    var cmd = cmdRegistry.get(id);
    if (!cmd) {
      console.warn('[Ketor.commands] Unknown command:', id);
      return Promise.reject(new Error('Unknown command: ' + id));
    }
    try {
      var result = cmd.handler.apply(null, args);
      if (result && typeof result.then === 'function') return result;
      return Promise.resolve(result);
    } catch (err) {
      console.error('[Ketor.commands] Command failed:', id, err);
      return Promise.reject(err);
    }
  }

  function onDidChange(fn) {
    if (typeof fn !== 'function') return function () { };
    cmdListeners.add(fn);
    return function () { cmdListeners.delete(fn); };
  }

  Ketor.commands.registerCommand = registerCommand;
  Ketor.commands.unregisterCommand = unregisterCommand;
  Ketor.commands.getCommand = getCommand;
  Ketor.commands.hasCommand = hasCommand;
  Ketor.commands.listCommands = listCommands;
  Ketor.commands.executeCommand = executeCommand;
  Ketor.commands.onDidChange = onDidChange;

  // ---- UI provider registry ---------------------------------------
  // Sidebar providers: registered by activity id (e.g. 'translate')
  // Tab providers: registered by tab kind (e.g. 'translate')
  Ketor.ui.registry = Ketor.ui.registry || {
    sidebars: {},
    tabs: {},
    /* The right hand panel: settings for the activity that is open, beside the work
       instead of buried in the left sidebar. The insert settings moved there. */
    rightPanels: {}
  };

  Ketor.ui.registerSidebarProvider = function (activityId, Component) {
    if (!activityId || typeof Component !== 'function') return false;
    Ketor.ui.registry.sidebars[String(activityId)] = Component;
    return true;
  };

  Ketor.ui.registerTabProvider = function (kind, Component) {
    if (!kind || typeof Component !== 'function') return false;
    Ketor.ui.registry.tabs[String(kind)] = Component;
    return true;
  };

  Ketor.ui.getSidebarProvider = function (activityId) {
    return Ketor.ui.registry.sidebars[String(activityId)] || null;
  };

  Ketor.ui.getTabProvider = function (kind) {
    return Ketor.ui.registry.tabs[String(kind)] || null;
  };

  Ketor.ui.registerRightPanelProvider = function (activityId, Component) {
    if (!activityId || typeof Component !== 'function') return false;
    Ketor.ui.registry.rightPanels[String(activityId)] = Component;
    return true;
  };

  Ketor.ui.getRightPanelProvider = function (activityId) {
    return Ketor.ui.registry.rightPanels[String(activityId)] || null;
  };

})(window);