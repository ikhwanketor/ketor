/* ============================================================
   Ketor -- Panel (bottom)
   ------------------------------------------------------------
   VS Code-style bottom panel with tabs. Default active tab
   is "background" showing real-time running tasks.

   Tabs:
   - Background: real-time running tasks (from Ketor.tasks + context)
   - Log: chronological log entries
   - Problems: validation errors/warnings
   ============================================================ */

/* ============================================================
   Ketor - Panel (bottom) v2
   ------------------------------------------------------------
   Tabs:
   - Session: running tasks + session overview (ROM, table,
     texts, groups, build, errors)
   - Log: rich chronological log with ms timestamp, padded
     source, colored level. Clear + Export buttons.
   - Problems: validation errors/warnings
   ============================================================ */

(function (global) {
  'use strict';

  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};

  var React = global.React;
  if (!React) return;
  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  var PANEL_TABS = [
    { id: 'session', label: 'Session' },
    { id: 'log', label: 'Log' },
    { id: 'problems', label: 'Problems' }
  ];

  var SOURCE_WIDTH = 12;

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    var ms = String(d.getMilliseconds()).padStart(3, '0');
    return hh + ':' + mm + ':' + ss + '.' + ms;
  }

  function formatDuration(startedAt, finishedAt) {
    if (!startedAt) return '';
    var end = finishedAt || Date.now();
    var ms = Math.max(0, end - startedAt);
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  // ---- Hook: re-render on any Ketor store change ----
  function useAllStores() {
    var st = useState(0);
    var force = st[1];
    useEffect(function () {
      function tick() {
        force(function (v) { return v + 1; });
      }
      var unsubs = [];
      var stores = [K.project, K.search, K.table, K.translate];
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        if (s && typeof s.subscribe === 'function') {
          unsubs.push(s.subscribe(tick));
        }
      }
      return function () {
        unsubs.forEach(function (u) { try { u(); } catch (_) { } });
      };
    }, []);
  }

  /* ============================================================
     SessionTab
     ============================================================ */
  function SessionTab(props) {
    useAllStores();
    var tasks = props.tasks || [];
    var problems = props.problems || [];
    var [, forceTick] = useState(0);

    useEffect(function () {
      var timer = setInterval(function () { forceTick(function (v) { return v + 1; }); }, 1000);
      return function () { clearInterval(timer); };
    }, []);

    var running = tasks.filter(function (t) { return t.status === 'running'; });

    var project = K.project ? K.project.getState() : null;
    var search = K.search ? K.search.getState() : null;
    var table = K.table ? K.table.getState() : null;
    var translate = K.translate ? K.translate.getState() : null;

    var romName = (project && project.romName) || (translate && translate.romName) || '';
    var romSize = (project && project.romSize) || (translate && translate.romSize) || 0;
    var romSystem = (project && project.romSystem) || (translate && translate.romSystem) || '';
    var romCrc = (project && project.crc32) || '';

    var tableName = '';
    var tableEntries = 0;
    var tableSource = '';
    if (translate && translate.tableData) {
      tableName = translate.tableData.name || '';
      tableEntries = translate.tableData.entryCount || 0;
      tableSource = 'translate';
    }
    if (!tableName && search && search.tableData) {
      tableName = search.tableData.name || '';
      tableEntries = search.tableData.entryCount || 0;
      tableSource = 'search';
    }
    if (!tableName && table && table.editEntries && table.editEntries.length) {
      tableName = table.editSource || 'edit-table';
      tableEntries = table.editEntries.length;
      tableSource = 'table';
    }

    var textsCount = (search && search.texts) ? search.texts.length : 0;
    var translatedCount = (translate && translate.texts)
      ? translate.texts.filter(function (x) { return x.translatedText && x.translatedText.trim(); }).length
      : 0;
    var pendingCount = Math.max(0, textsCount - translatedCount);
    var translatedPercent = textsCount > 0 ? Math.round((translatedCount / textsCount) * 100) : 0;

    var groups = (search && search.groups) ? search.groups : [];
    var groupSummary = groups.map(function (g) {
      return g.name + ' (' + ((g.textIds || []).length) + ')';
    }).join(', ');

    var hasBuild = translate && translate.modifiedRom && translate.modifiedRom.length > 0;
    var buildSize = hasBuild ? translate.modifiedRom.length : 0;
    var errorCount = problems.filter(function (p) { return p.severity === 'error'; }).length;

    if (!romName && running.length === 0) {
      return e('div', {
        className: 'kt-text-dim kt-text-small',
        style: { padding: '20px', textAlign: 'center', lineHeight: 1.7 }
      },
        'No ROM loaded.',
        e('br'),
        'Use File > Load ROM to start a session.'
      );
    }

    function Row(props2) {
      return e('div', {
        style: {
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          padding: '3px 0',
          fontFamily: 'var(--kt-font-mono)',
          fontSize: 12,
          lineHeight: 1.5
        }
      },
        e('span', {
          style: {
            flex: '0 0 90px',
            color: 'var(--kt-input-placeholder-fg)',
            textTransform: 'uppercase',
            fontSize: 10,
            letterSpacing: '0.05em'
          }
        }, props2.label),
        e('span', {
          style: {
            flex: 1,
            color: 'var(--kt-editor-fg)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
          }
        }, props2.value)
      );
    }

    var blocks = [];

    if (running.length > 0) {
      blocks.push(e('div', {
        key: 'running',
        style: { marginBottom: 12 }
      },
        e('div', {
          style: {
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--kt-input-placeholder-fg)',
            marginBottom: 6
          }
        }, 'Running Tasks'),
        running.map(function (t) {
          return e('div', {
            key: t.id,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 8px',
              background: 'var(--kt-sidebar-bg)',
              borderRadius: 2,
              borderLeft: '2px solid var(--kt-accent, #3794ff)',
              fontFamily: 'var(--kt-font-ui)',
              fontSize: 12,
              marginBottom: 4
            }
          },
            e('span', { className: 'kt-spinner' }),
            e('span', { style: { flex: '1 1 auto', color: 'var(--kt-editor-fg)' } }, t.label),
            e('span', {
              className: 'kt-text-dim kt-text-small',
              style: { whiteSpace: 'nowrap' }
            }, Math.floor(t.progress || 0) + '% · ' + formatDuration(t.startedAt, null))
          );
        })
      ));
    }

    if (romName) {
      var romLine = romName + '\n' +
        formatBytes(romSize) +
        (romSystem ? ', ' + romSystem : '') +
        (romCrc ? ', CRC32=' + romCrc : '');
      blocks.push(e(Row, { key: 'rom', label: 'ROM', value: romLine }));
    }

    if (tableName) {
      blocks.push(e(Row, {
        key: 'table',
        label: 'Table',
        value: tableName + '\n' + tableEntries + ' entries (' + tableSource + ')'
      }));
    } else if (romName) {
      blocks.push(e(Row, {
        key: 'table',
        label: 'Table',
        value: 'Not loaded'
      }));
    }

    if (textsCount > 0) {
      blocks.push(e(Row, {
        key: 'texts',
        label: 'Texts',
        value: textsCount.toLocaleString() + ' extracted\n' +
               translatedCount.toLocaleString() + ' translated (' + translatedPercent + '%)\n' +
               pendingCount.toLocaleString() + ' pending'
      }));
    }

    if (groups.length > 0) {
      blocks.push(e(Row, {
        key: 'groups',
        label: 'Groups',
        value: groups.length + ' total\n' + groupSummary
      }));
    }

    blocks.push(e(Row, {
      key: 'build',
      label: 'Last Build',
      value: hasBuild
        ? 'Ready (' + formatBytes(buildSize) + ')\nClick "Download ROM" in Translation sidebar to export'
        : 'Not yet built'
    }));

    blocks.push(e(Row, {
      key: 'errors',
      label: 'Errors',
      value: errorCount === 0
        ? '0 active'
        : errorCount + ' active (see Problems tab)'
    }));

    return e('div', { style: { padding: '10px 12px' } },
      blocks
    );
  }

  /* ============================================================
     LogTab
     ============================================================ */
  function LogTab(props) {
    var logs = props.logs || [];
    var onClear = props.onClear;
    var containerRef = useRef(null);
    var [autoScroll, setAutoScroll] = useState(true);

    useEffect(function () {
      if (!autoScroll) return;
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }, [logs, autoScroll]);

    var handleScroll = useCallback(function (ev) {
      var el = ev.currentTarget;
      var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      setAutoScroll(atBottom);
    }, []);

    var handleExport = useCallback(function () {
      try {
        var lines = logs.map(function (entry) {
          var t = formatTime(entry.timestamp);
          var src = String(entry.source || 'ketor');
          var lvl = String(entry.level || 'info').toUpperCase();
          return '[' + t + '] [' + lvl + '] ' + src + ': ' + entry.message;
        });
        var content = lines.join('\n');
        var blob = new Blob([content], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ketor-log-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) { }
    }, [logs]);

    if (logs.length === 0) {
      return e('div', {
        className: 'kt-text-dim kt-text-small',
        style: { padding: '20px', textAlign: 'center' }
      }, 'No log entries yet.');
    }

    return e('div', {
      ref: containerRef,
      onScroll: handleScroll,
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        fontFamily: 'var(--kt-font-mono)',
        fontSize: 12,
        lineHeight: 1.55
      }
    },
      e('div', null,
        logs.map(function (entry) {
          var lvl = String(entry.level || 'info').toLowerCase();
          var color = lvl === 'error' ? 'var(--kt-error-fg)'
            : lvl === 'warn' ? 'var(--kt-warning-fg)'
            : lvl === 'success' ? '#89d185'
            : 'var(--kt-editor-fg)';

          var src = String(entry.source || 'ketor');
          var srcPad = src.length < SOURCE_WIDTH
            ? src + ' '.repeat(SOURCE_WIDTH - src.length)
            : src;

          return e('div', {
            key: entry.id,
            style: {
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }
          },
            e('span', {
              className: 'kt-text-dim',
              style: { flex: '0 0 auto', opacity: 0.7 }
            }, '[' + formatTime(entry.timestamp) + ']'),
            e('span', {
              style: { flex: '0 0 auto', color: 'var(--kt-info-fg, #75beff)', opacity: 0.85 }
            }, srcPad),
            e('span', {
              style: { flex: '1 1 auto', color: color, minWidth: 0 }
            }, entry.message)
          );
        })
      )
    );
  }

  /* ============================================================
     ProblemsTab
     ============================================================ */
  function ProblemsTab(props) {
    var problems = props.problems || [];

    if (problems.length === 0) {
      return e('div', {
        className: 'kt-text-dim kt-text-small',
        style: { padding: '20px', textAlign: 'center' }
      }, 'No problems detected.');
    }

    return e('div', { style: { display: 'flex', flexDirection: 'column' } },
      problems.map(function (p) {
        var color = p.severity === 'error' ? 'var(--kt-error-fg)'
          : p.severity === 'warning' ? 'var(--kt-warning-fg)'
          : 'var(--kt-info-fg)';
        return e('div', {
          key: p.id,
          style: {
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '4px 0'
          }
        },
          K.ui.icon(
            p.severity === 'error' ? 'error' : (p.severity === 'warning' ? 'warning' : 'info'),
            { size: 14, style: { color: color, marginTop: '2px', flex: '0 0 auto' } }
          ),
          e('div', { style: { flex: '1 1 auto', minWidth: 0 } },
            e('div', { style: { wordBreak: 'break-word' } }, p.message),
            p.location
              ? e('div', { className: 'kt-text-small kt-text-dim' }, p.location)
              : null
          )
        );
      })
    );
  }

  /* ============================================================
     KetorPanel -- main container
     ============================================================ */
  function KetorPanel(props) {
    var activeTab = props.activeTab || 'session';
    var onTabChange = props.onTabChange || function () { };
    var onClose = props.onClose || function () { };
    var onResize = props.onResize;
    var onClearLogs = props.onClearLogs || function () { };
    var height = props.height || 240;
    var tasks = props.tasks || [];
    var logs = props.logs || [];
    var problems = props.problems || [];

    var onExportLogs = useCallback(function () {
      try {
        var lines = (logs || []).map(function (entry) {
          var t = formatTime(entry.timestamp);
          var src = String(entry.source || 'ketor');
          var lvl = String(entry.level || 'info').toUpperCase();
          return '[' + t + '] [' + lvl + '] ' + src + ': ' + entry.message;
        });
        var content = lines.join('\n');
        var blob = new Blob([content], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ketor-log-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) { }
    }, [logs]);

    var handleTabClick = useCallback(function (id) {
      onTabChange(id);
    }, [onTabChange]);

    var handleResizeStart = useCallback(function (ev) {
      if (typeof onResize !== 'function') return;
      ev.preventDefault();
      var startY = ev.clientY;
      var startHeight = height;

      var onMove = function (moveEv) {
        var delta = startY - moveEv.clientY;
        var nextHeight = Math.max(80, Math.min(600, startHeight + delta));
        onResize(nextHeight);
      };
      var onUp = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }, [onResize, height]);

    var problemBadge = problems.filter(function (p) { return p.severity === 'error'; }).length;

    return e('div', {
      className: 'kt-panel-container',
      style: { height: height + 'px' }
    },
      e('div', {
        onMouseDown: handleResizeStart,
        style: {
          height: '4px',
          cursor: 'row-resize',
          background: 'transparent',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: 'translateY(-2px)',
          zIndex: 10
        }
      }),
      e('div', { className: 'kt-panel-header' },
        PANEL_TABS.map(function (tab) {
          var badgeCount = tab.id === 'problems' ? problemBadge : 0;
          return e('button', {
            key: tab.id,
            type: 'button',
            className: 'kt-panel-tab' + (activeTab === tab.id ? ' active' : ''),
            onClick: function () { handleTabClick(tab.id); }
          },
            tab.label,
            badgeCount > 0
              ? e('span', {
                  className: 'kt-badge error',
                  style: { marginLeft: '6px', height: '14px', minWidth: '14px', fontSize: '9px' }
                }, badgeCount)
              : null
          );
        }),
        e('div', { className: 'spacer' }),
        activeTab === 'log'
          ? e('button', {
              type: 'button',
              className: 'icon-btn',
              onClick: onExportLogs,
              title: 'Export log to .txt'
            }, K.ui.icon('save', { size: 14 }))
          : null,
        activeTab === 'log'
          ? e('button', {
              type: 'button',
              className: 'icon-btn',
              onClick: onClearLogs,
              title: 'Clear all log entries'
            }, K.ui.icon('trash', { size: 14 }))
          : null,
        e('button', {
          type: 'button',
          className: 'icon-btn',
          onClick: onClose,
          title: 'Close Panel'
        }, K.ui.icon('close', { size: 14 }))
      ),
      e('div', { className: 'kt-panel-body' },
        activeTab === 'session'
          ? e(SessionTab, { tasks: tasks, problems: problems })
          : activeTab === 'log'
            ? e(LogTab, { logs: logs, onClear: onClearLogs })
            : e(ProblemsTab, { problems: problems })
      )
    );
  }

  K.ui.KetorPanel = KetorPanel;
  K.ui.KetorSessionTab = SessionTab;
  K.ui.KetorLogTab = LogTab;
  K.ui.KetorProblemsTab = ProblemsTab;

})(window);