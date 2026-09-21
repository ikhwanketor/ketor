/* ============================================================
   Ketor -- Workbench Context
   ------------------------------------------------------------
   React Context providing global workbench state matching
   VS Code's IWorkbenchLayoutService + IEditorService shape.

   State shape:
   - activeActivity: string ('translate' | 'hex' | 'font' | ...)
   - sidebarVisible: boolean
   - activityBarVisible: boolean
   - statusBarVisible: boolean
   - panelVisible: boolean
   - panelActiveTab: string ('session' | 'log' | 'problems')
   - panelHeight: number
   - sidebarWidth: number
   - editorGroups: Array<{ id, tabs: [], activeTabId }>
   - activeEditorGroupId: string
   - theme: string ('dark-plus' | 'dark-modern' | 'dark-high-contrast')

   Actions:
   - setActiveActivity(id)
   - toggleSidebar() / setSidebarVisible(bool)
   - togglePanel() / setPanelVisible(bool)
   - setPanelActiveTab(id)
   - setPanelHeight(px) / setSidebarWidth(px)
   - toggleActivityBar() / toggleStatusBar()
   - openTab(groupId, tab) -- tab = { id, title, icon, kind, payload }
   - closeTab(groupId, tabId)
   - setActiveTab(groupId, tabId)
   - splitEditor()
   - closeEditorGroup(groupId)
   - setTheme(themeId)
   - getActiveTab()
   ============================================================ */

/* ============================================================
   Ketor -- Workbench Context (v2)
   ------------------------------------------------------------
   Adds: hasUnsavedWork flag, moveTab, tab persistence.
   Session behavior:
   - hasUnsavedWork = false  → welcome screen on next load
   - hasUnsavedWork = true   → restore tabs + layout on next load
   markDirty() triggered on ROM load / edit / build.
   markClean() triggered on export/save.
   ============================================================ */

/* ============================================================
   Ketor -- Workbench Context (v3)
   ------------------------------------------------------------
   Adds:
   - useBreakpoint() hook: 'mobile' | 'tablet' | 'desktop'
   - drawerOpen state (for mobile/tablet sidebar overlay)
   - Default sidebarVisible depends on breakpoint
     (mobile/tablet = false, desktop = true)
   - closeDrawer() to dismiss backdrop
   ============================================================ */

/* ============================================================
   Ketor - Workbench Context (v3.0)
   ------------------------------------------------------------
   useBreakpoint() hook: 'mobile' | 'tablet' | 'desktop'.
   Drawer state via sidebarVisible. Auto-close drawer on
   breakpoint change to non-desktop.
   ============================================================ */

/* ============================================================
   Ketor - Workbench Context (v3.1)
   ------------------------------------------------------------
   React Context for global workbench state.
   Breakpoints: mobile (<=600px), tablet (601-1024px), desktop.
   Session persistence: only tabs saved when hasUnsavedWork=true.
   ============================================================ */

/* ============================================================
   Ketor - Workbench Context (v3.2)
   ------------------------------------------------------------
   Breakpoint + orientation detection. Returns:
   - mode: 'desktop' | 'compact'
     * desktop: width >= 601 and (width > 1024 OR landscape)
     * compact: mobile any, or tablet portrait
   - breakpoint: 'mobile' | 'tablet' | 'desktop'
   - orientation: 'portrait' | 'landscape'
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};
  var React = global.React;
  if (!React) return;

  var SESSION_KEY = 'ketor.workbench.session';

  var DEFAULT_STATE = {
    activeActivity: 'translate',
    sidebarVisible: true,
    activityBarVisible: true,
    statusBarVisible: true,
    panelVisible: false,
    panelActiveTab: 'session',
    panelHeight: 220,
    sidebarWidth: 300,
    editorGroups: [{ id: 'group-1', tabs: [], activeTabId: null }],
    activeEditorGroupId: 'group-1',
    theme: 'dark-plus'
  };

  // ---- Viewport detection ------------------------------------------
  function detectViewport() {
    try {
      var w = window.innerWidth || document.documentElement.clientWidth;
      var h = window.innerHeight || document.documentElement.clientHeight;
      var orientation = (w > h) ? 'landscape' : 'portrait';

      var breakpoint;
      if (w <= 600) breakpoint = 'mobile';
      else if (w <= 1024) breakpoint = 'tablet';
      else breakpoint = 'desktop';

      var mode;
      if (breakpoint === 'desktop') mode = 'desktop';
      else if (breakpoint === 'tablet' && orientation === 'landscape') mode = 'desktop';
      else mode = 'compact';

      return {
        breakpoint: breakpoint,
        orientation: orientation,
        mode: mode,
        width: w,
        height: h
      };
    } catch (err) {
      return {
        breakpoint: 'desktop',
        orientation: 'landscape',
        mode: 'desktop',
        width: 1280,
        height: 720
      };
    }
  }

  function useViewport() {
    var st = React.useState(detectViewport);
    var vp = st[0];
    var setVp = st[1];
    React.useEffect(function () {
      var handler = function () { setVp(detectViewport()); };
      window.addEventListener('resize', handler);
      window.addEventListener('orientationchange', handler);
      return function () {
        window.removeEventListener('resize', handler);
        window.removeEventListener('orientationchange', handler);
      };
    }, []);
    return vp;
  }

  // ---- Session persistence -----------------------------------------
  function loadSession() {
    try {
      var raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function persistSession(state, hasWork) {
    try {
      var payload = {
        activeActivity: state.activeActivity,
        sidebarVisible: state.sidebarVisible,
        activityBarVisible: state.activityBarVisible,
        statusBarVisible: state.statusBarVisible,
        panelVisible: state.panelVisible,
        panelActiveTab: state.panelActiveTab,
        panelHeight: state.panelHeight,
        sidebarWidth: state.sidebarWidth,
        theme: state.theme,
        hasUnsavedWork: !!hasWork,
        editorGroups: hasWork ? state.editorGroups : DEFAULT_STATE.editorGroups,
        activeEditorGroupId: hasWork ? state.activeEditorGroupId : 'group-1',
        savedAt: Date.now()
      };
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (err) { }
  }

  function clearSession() {
    try { global.localStorage.removeItem(SESSION_KEY); } catch (err) { }
  }

  // ---- Context -----------------------------------------------------
  var WorkbenchContext = React.createContext({
    state: DEFAULT_STATE,
    actions: {},
    tasks: [],
    logs: [],
    problems: [],
    hasUnsavedWork: false,
    viewport: { breakpoint: 'desktop', orientation: 'landscape', mode: 'desktop' }
  });

  function newGroupId() {
    return 'group-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }

  function WorkbenchProvider(props) {
    var vp = useViewport();
    var saved = loadSession() || {};
    var hasSavedWork = saved.hasUnsavedWork === true;
    var isDesktop = vp.mode === 'desktop';

    var initialSidebar = isDesktop;
    if (saved && typeof saved.sidebarVisible === 'boolean') {
      initialSidebar = isDesktop ? saved.sidebarVisible : false;
    }

    var st1 = React.useState(saved.activeActivity || DEFAULT_STATE.activeActivity);
    var activeActivity = st1[0];
    var setActiveActivityRaw = st1[1];

    var st2 = React.useState(initialSidebar);
    var sidebarVisible = st2[0];
    var setSidebarVisibleRaw = st2[1];

    var st3 = React.useState(saved.activityBarVisible !== false);
    var activityBarVisible = st3[0];
    var setActivityBarVisibleRaw = st3[1];

    var st4 = React.useState(saved.statusBarVisible !== false);
    var statusBarVisible = st4[0];
    var setStatusBarVisibleRaw = st4[1];

    var st5 = React.useState(saved.panelVisible === true);
    var panelVisible = st5[0];
    var setPanelVisibleRaw = st5[1];

    var st6 = React.useState(saved.panelActiveTab || 'session');
    var panelActiveTab = st6[0];
    var setPanelActiveTabRaw = st6[1];

    var st7 = React.useState(Number(saved.panelHeight) || 220);
    var panelHeight = st7[0];
    var setPanelHeightRaw = st7[1];

    var st8 = React.useState(Number(saved.sidebarWidth) || 300);
    var sidebarWidth = st8[0];
    var setSidebarWidthRaw = st8[1];

    var groupsInit = DEFAULT_STATE.editorGroups;
    if (hasSavedWork && Array.isArray(saved.editorGroups) && saved.editorGroups.length > 0) {
      groupsInit = saved.editorGroups;
    }
    var st9 = React.useState(groupsInit);
    var editorGroups = st9[0];
    var setEditorGroups = st9[1];

    var aegInit = hasSavedWork && saved.activeEditorGroupId ? saved.activeEditorGroupId : 'group-1';
    var st10 = React.useState(aegInit);
    var activeEditorGroupId = st10[0];
    var setActiveEditorGroupId = st10[1];

    var st11 = React.useState(saved.theme || 'dark-plus');
    var theme = st11[0];
    var setThemeRaw = st11[1];

    var st12 = React.useState(hasSavedWork);
    var hasUnsavedWork = st12[0];
    var setHasUnsavedWork = st12[1];

    var st13 = React.useState([]);
    var tasks = st13[0];
    var setTasks = st13[1];

    var st14 = React.useState([]);
    var logs = st14[0];
    var setLogs = st14[1];

    var st15 = React.useState([]);
    var problems = st15[0];
    var setProblems = st15[1];

    React.useEffect(function () {
      if (vp.mode !== 'desktop') setSidebarVisibleRaw(false);
    }, [vp.mode]);

    var saveTimerRef = React.useRef(null);
    React.useEffect(function () {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(function () {
        persistSession({
          activeActivity: activeActivity,
          sidebarVisible: sidebarVisible,
          activityBarVisible: activityBarVisible,
          statusBarVisible: statusBarVisible,
          panelVisible: panelVisible,
          panelActiveTab: panelActiveTab,
          panelHeight: panelHeight,
          sidebarWidth: sidebarWidth,
          theme: theme,
          editorGroups: editorGroups,
          activeEditorGroupId: activeEditorGroupId
        }, hasUnsavedWork);
      }, 400);
      return function () {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, [activeActivity, sidebarVisible, activityBarVisible, statusBarVisible,
        panelVisible, panelActiveTab, panelHeight, sidebarWidth, theme,
        editorGroups, activeEditorGroupId, hasUnsavedWork]);

    React.useEffect(function () {
      try { document.documentElement.setAttribute('data-ketor-theme', theme); } catch (err) { }
    }, [theme]);

    var setActiveActivity = React.useCallback(function (id) {
      setActiveActivityRaw(function (prev) {
        if (prev === id && sidebarVisible) {
          setSidebarVisibleRaw(false);
          return prev;
        }
        if (!sidebarVisible) setSidebarVisibleRaw(true);
        return id;
      });
    }, [sidebarVisible]);

    var toggleSidebar = React.useCallback(function () {
      setSidebarVisibleRaw(function (v) { return !v; });
    }, []);

    var closeDrawer = React.useCallback(function () {
      setSidebarVisibleRaw(false);
    }, []);

    var togglePanel = React.useCallback(function () {
      setPanelVisibleRaw(function (v) { return !v; });
    }, []);

    var toggleActivityBar = React.useCallback(function () {
      setActivityBarVisibleRaw(function (v) { return !v; });
    }, []);

    var toggleStatusBar = React.useCallback(function () {
      setStatusBarVisibleRaw(function (v) { return !v; });
    }, []);

    var openTab = React.useCallback(function (groupId, tab) {
      setEditorGroups(function (groups) {
        return groups.map(function (g) {
          if (g.id !== groupId) return g;
          var exists = false;
          for (var i = 0; i < g.tabs.length; i++) {
            if (g.tabs[i].id === tab.id) { exists = true; break; }
          }
          if (exists) return Object.assign({}, g, { activeTabId: tab.id });
          return Object.assign({}, g, { tabs: g.tabs.concat([tab]), activeTabId: tab.id });
        });
      });
      setActiveEditorGroupId(groupId);
    }, []);

    var closeTab = React.useCallback(function (groupId, tabId) {
      setEditorGroups(function (groups) {
        return groups.map(function (g) {
          if (g.id !== groupId) return g;
          var remaining = g.tabs.filter(function (t) { return t.id !== tabId; });
          var nextActive = g.activeTabId;
          if (g.activeTabId === tabId) {
            nextActive = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
          }
          return Object.assign({}, g, { tabs: remaining, activeTabId: nextActive });
        });
      });
    }, []);

    var setActiveTab = React.useCallback(function (groupId, tabId) {
      setEditorGroups(function (groups) {
        return groups.map(function (g) {
          if (g.id !== groupId) return g;
          return Object.assign({}, g, { activeTabId: tabId });
        });
      });
      setActiveEditorGroupId(groupId);
    }, []);

    var moveTab = React.useCallback(function (fromId, tabId, toId, toIndex) {
      setEditorGroups(function (groups) {
        var from = null, to = null;
        for (var i = 0; i < groups.length; i++) {
          if (groups[i].id === fromId) from = groups[i];
          if (groups[i].id === toId) to = groups[i];
        }
        if (!from || !to) return groups;
        var tab = null;
        for (var j = 0; j < from.tabs.length; j++) {
          if (from.tabs[j].id === tabId) { tab = from.tabs[j]; break; }
        }
        if (!tab) return groups;

        if (fromId === toId) {
          var list = from.tabs.slice();
          var cur = -1;
          for (var k = 0; k < list.length; k++) {
            if (list[k].id === tabId) { cur = k; break; }
          }
          if (cur < 0) return groups;
          list.splice(cur, 1);
          var ins = Math.max(0, Math.min(toIndex, list.length));
          if (cur < toIndex) ins = Math.max(0, toIndex - 1);
          list.splice(ins, 0, tab);
          return groups.map(function (g) {
            if (g.id !== fromId) return g;
            return Object.assign({}, g, { tabs: list, activeTabId: tabId });
          });
        }

        var rem = from.tabs.filter(function (t) { return t.id !== tabId; });
        var nextA = from.activeTabId;
        if (from.activeTabId === tabId) {
          nextA = rem.length > 0 ? rem[rem.length - 1].id : null;
        }
        var toList = to.tabs.slice();
        var ins2 = Math.max(0, Math.min(toIndex, toList.length));
        toList.splice(ins2, 0, tab);

        return groups.map(function (g) {
          if (g.id === fromId) return Object.assign({}, g, { tabs: rem, activeTabId: nextA });
          if (g.id === toId) return Object.assign({}, g, { tabs: toList, activeTabId: tabId });
          return g;
        });
      });
      setActiveEditorGroupId(toId);
    }, []);

    var splitEditor = React.useCallback(function () {
      setEditorGroups(function (groups) {
        if (groups.length >= 3) return groups;
        return groups.concat([{ id: newGroupId(), tabs: [], activeTabId: null }]);
      });
    }, []);

    var closeEditorGroup = React.useCallback(function (groupId) {
      setEditorGroups(function (groups) {
        if (groups.length <= 1) return groups;
        var closing = null;
        var remaining = [];
        for (var i = 0; i < groups.length; i++) {
          if (groups[i].id === groupId) closing = groups[i];
          else remaining.push(groups[i]);
        }
        if (!closing || remaining.length === 0) return groups;

        var first = remaining[0];
        var mergedTabs = first.tabs.concat(closing.tabs);
        var nextActive = first.activeTabId;
        if (!nextActive && mergedTabs.length > 0) {
          nextActive = mergedTabs[mergedTabs.length - 1].id;
        }
        remaining[0] = Object.assign({}, first, {
          tabs: mergedTabs,
          activeTabId: nextActive
        });

        setActiveEditorGroupId(function (cur) {
          return cur === groupId ? remaining[0].id : cur;
        });
        return remaining;
      });
    }, []);

    var setTheme = React.useCallback(function (id) { setThemeRaw(id || 'dark-plus'); }, []);
    var setPanelActiveTab = React.useCallback(function (id) { setPanelActiveTabRaw(id || 'session'); }, []);
    var setPanelHeight = React.useCallback(function (px) {
      setPanelHeightRaw(Math.max(80, Math.min(600, Number(px) || 220)));
    }, []);
    var setSidebarWidth = React.useCallback(function (px) {
      setSidebarWidthRaw(Math.max(170, Math.min(600, Number(px) || 300)));
    }, []);

    var markDirty = React.useCallback(function () { setHasUnsavedWork(true); }, []);
    var markClean = React.useCallback(function () { setHasUnsavedWork(false); }, []);

    var startTask = React.useCallback(function (task) {
      var id = task.id || ('task-' + Date.now());
      var rec = {
        id: id, label: task.label || 'Task', detail: task.detail || '',
        progress: Number(task.progress) || 0, status: 'running',
        startedAt: Date.now(), finishedAt: null
      };
      setTasks(function (prev) {
        return [rec].concat(prev.filter(function (t) { return t.id !== id; })).slice(0, 20);
      });
      return id;
    }, []);

    var updateTask = React.useCallback(function (id, patch) {
      setTasks(function (prev) {
        return prev.map(function (t) {
          if (t.id !== id) return t;
          var next = Object.assign({}, t, patch || {});
          if (next.status !== 'running' && !next.finishedAt) next.finishedAt = Date.now();
          return next;
        });
      });
    }, []);

    var finishTask = React.useCallback(function (id, status, detail) {
      setTasks(function (prev) {
        return prev.map(function (t) {
          if (t.id !== id) return t;
          return Object.assign({}, t, {
            status: status || 'done', progress: 100,
            detail: detail != null ? detail : t.detail,
            finishedAt: Date.now()
          });
        });
      });
    }, []);

    var clearFinishedTasks = React.useCallback(function () {
      setTasks(function (prev) { return prev.filter(function (t) { return t.status === 'running'; }); });
    }, []);

    var appendLog = React.useCallback(function (level, message, source) {
      var entry = {
        id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        level: level || 'info', message: String(message || ''),
        source: source || 'ketor', timestamp: Date.now()
      };
      setLogs(function (prev) { return prev.concat([entry]).slice(-500); });
      return entry.id;
    }, []);

    var clearLogs = React.useCallback(function () { setLogs([]); }, []);

    var addProblem = React.useCallback(function (problem) {
      var rec = {
        id: problem.id || ('prob-' + Date.now()),
        severity: problem.severity || 'warning',
        message: String(problem.message || ''),
        source: problem.source || 'ketor',
        location: problem.location || null
      };
      setProblems(function (prev) {
        return [rec].concat(prev.filter(function (p) { return p.id !== rec.id; })).slice(0, 100);
      });
      return rec.id;
    }, []);

    var clearProblems = React.useCallback(function () { setProblems([]); }, []);

    var getActiveTab = React.useCallback(function () {
      var grp = null;
      for (var i = 0; i < editorGroups.length; i++) {
        if (editorGroups[i].id === activeEditorGroupId) { grp = editorGroups[i]; break; }
      }
      if (!grp || !grp.activeTabId) return null;
      for (var j = 0; j < grp.tabs.length; j++) {
        if (grp.tabs[j].id === grp.activeTabId) return grp.tabs[j];
      }
      return null;
    }, [editorGroups, activeEditorGroupId]);

    var state = React.useMemo(function () {
      return {
        activeActivity: activeActivity,
        sidebarVisible: sidebarVisible,
        activityBarVisible: activityBarVisible,
        statusBarVisible: statusBarVisible,
        panelVisible: panelVisible,
        panelActiveTab: panelActiveTab,
        panelHeight: panelHeight,
        sidebarWidth: sidebarWidth,
        editorGroups: editorGroups,
        activeEditorGroupId: activeEditorGroupId,
        theme: theme
      };
    }, [activeActivity, sidebarVisible, activityBarVisible, statusBarVisible,
        panelVisible, panelActiveTab, panelHeight, sidebarWidth,
        editorGroups, activeEditorGroupId, theme]);

    var actions = React.useMemo(function () {
      return {
        setActiveActivity: setActiveActivity,
        setSidebarVisible: setSidebarVisibleRaw,
        toggleSidebar: toggleSidebar,
        closeDrawer: closeDrawer,
        setPanelVisible: setPanelVisibleRaw,
        togglePanel: togglePanel,
        setPanelActiveTab: setPanelActiveTab,
        setPanelHeight: setPanelHeight,
        setSidebarWidth: setSidebarWidth,
        toggleActivityBar: toggleActivityBar,
        toggleStatusBar: toggleStatusBar,
        setActivityBarVisible: setActivityBarVisibleRaw,
        setStatusBarVisible: setStatusBarVisibleRaw,
        openTab: openTab,
        closeTab: closeTab,
        setActiveTab: setActiveTab,
        moveTab: moveTab,
        splitEditor: splitEditor,
        closeEditorGroup: closeEditorGroup,
        setTheme: setTheme,
        getActiveTab: getActiveTab,
        markDirty: markDirty,
        markClean: markClean,
        startTask: startTask,
        updateTask: updateTask,
        finishTask: finishTask,
        clearFinishedTasks: clearFinishedTasks,
        appendLog: appendLog,
        clearLogs: clearLogs,
        addProblem: addProblem,
        clearProblems: clearProblems
      };
    }, [setActiveActivity, toggleSidebar, closeDrawer, togglePanel, setPanelActiveTab,
        setPanelHeight, setSidebarWidth, toggleActivityBar, toggleStatusBar,
        openTab, closeTab, setActiveTab, moveTab, splitEditor, closeEditorGroup,
        setTheme, getActiveTab, markDirty, markClean, startTask, updateTask,
        finishTask, clearFinishedTasks, appendLog, clearLogs, addProblem, clearProblems]);

    var value = React.useMemo(function () {
      return {
        state: state,
        actions: actions,
        tasks: tasks,
        logs: logs,
        problems: problems,
        hasUnsavedWork: hasUnsavedWork,
        viewport: vp,
        breakpoint: vp.breakpoint,
        mode: vp.mode,
        orientation: vp.orientation
      };
    }, [state, actions, tasks, logs, problems, hasUnsavedWork, vp]);

    return React.createElement(WorkbenchContext.Provider, { value: value }, props.children);
  }

  function useWorkbench() {
    return React.useContext(WorkbenchContext);
  }

  Ketor.ui.WorkbenchContext = WorkbenchContext;
  Ketor.ui.WorkbenchProvider = WorkbenchProvider;
  Ketor.ui.useWorkbench = useWorkbench;
  Ketor.ui.useViewport = useViewport;
  Ketor.ui.detectViewport = detectViewport;
  Ketor.ui.clearSessionState = clearSession;

})(window);