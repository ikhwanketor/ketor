/* ============================================================
   Ketor - Search Text Editor Tab (v1)
   ------------------------------------------------------------
   Left column: filter bar + text list with per-row checkbox +
                "Add to Group" button below.
   Right column: Group Manager accordion (Kruptar7-style).
   ============================================================ */

/* ============================================================
   Ketor - Search Text Editor Tab (v2)
   ------------------------------------------------------------
   Changes from v1:
   - Uses shared Ketor.ui.KetorGroupsPanel component
   - Replaces browser prompt() with a themed React modal
     (Safari and modern browsers block prompt())
   ============================================================ */

/* ============================================================
   Ketor - Search Text Editor Tab (v3)
   ------------------------------------------------------------
   Changes from v2:
   - Page state moved to ketor-search-state.js (persists across
     tab switches and browser reloads)
   - Page indicator is now an editable input with Go button,
     so users can jump directly to a page (e.g. 290)
   ============================================================ */

/* ============================================================
   Ketor - Search Text Editor Tab (v4)
   ------------------------------------------------------------
   Batch 16: id removed. Identity is startByte (offset).
   Display order is physical ROM order (by offset ascending).
   Column "ID" dropped, offset is the primary identifier.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uC = R.useCallback;
  var uS = R.useState;
  var uM = R.useMemo;
  var uR = R.useRef;
  var uE = R.useEffect;

  var KtBox = K.ui.KtBox;
  var PAGE_SIZE = 100;

  function thStyle(w, align) {
    return {
      padding: '4px 6px',
      width: w,
      textAlign: align || 'left',
      borderBottom: '1px solid var(--kt-widget-border-default)',
      fontWeight: 600,
      fontSize: 10,
      textTransform: 'uppercase',
      color: 'var(--kt-sidebar-title-fg)'
    };
  }

  function tdStyle(align) {
    return {
      padding: '3px 6px',
      textAlign: align || 'left',
      borderBottom: '1px solid var(--kt-widget-border-default)',
      overflow: 'hidden'
    };
  }

  function FilterBar(props) {
    var filter = props.filter;
    var setFilter = props.setFilter;
    var total = props.total;
    var visible = props.visible;

    var onChange = function (patch) { setFilter(patch); };

    return e('div', {
      style: {
        padding: '8px 10px',
        borderBottom: '1px solid var(--kt-widget-border-default)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '0 0 auto'
      }
    },
      e('input', {
        type: 'text',
        className: 'kt-input',
        placeholder: 'Search original, translation, or offset...',
        value: filter.search || '',
        onChange: function (ev) { onChange({ search: ev.target.value }); },
        style: { width: '100%' }
      }),
      e('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        e('select', {
          className: 'kt-select',
          value: filter.type || 'all',
          onChange: function (ev) { onChange({ type: ev.target.value }); },
          style: { fontSize: 11, flex: '1 1 90px', minWidth: 80 }
        },
          e('option', { value: 'all' }, 'All types'),
          e('option', { value: 'dialogue' }, 'Dialogue'),
          e('option', { value: 'menu' }, 'Menu'),
          e('option', { value: 'system' }, 'System'),
          e('option', { value: 'system-internal' }, 'Internal'),
          e('option', { value: 'compressed' }, 'Compressed')
        ),
        e('select', {
          className: 'kt-select',
          value: filter.assigned || 'all',
          onChange: function (ev) { onChange({ assigned: ev.target.value }); },
          style: { fontSize: 11, flex: '1 1 90px', minWidth: 80 }
        },
          e('option', { value: 'all' }, 'All status'),
          e('option', { value: 'assigned' }, 'Assigned'),
          e('option', { value: 'unassigned' }, 'Unassigned')
        ),
        e('input', {
          type: 'number',
          className: 'kt-input',
          placeholder: 'Min',
          value: filter.minLength || '',
          onChange: function (ev) { onChange({ minLength: parseInt(ev.target.value, 10) || 0 }); },
          style: { width: 54, fontSize: 11 },
          title: 'Minimum text length'
        }),
        e('input', {
          type: 'number',
          className: 'kt-input',
          placeholder: 'Max',
          value: filter.maxLength || '',
          onChange: function (ev) { onChange({ maxLength: parseInt(ev.target.value, 10) || 0 }); },
          style: { width: 54, fontSize: 11 },
          title: 'Maximum text length'
        })
      ),
      e('div', {
        style: {
          fontSize: 10,
          color: 'var(--kt-input-placeholder-fg)',
          display: 'flex',
          justifyContent: 'space-between'
        }
      },
        e('span', null, 'Showing ' + visible + ' of ' + total + ' text(s)'),
        (filter.search || (filter.type && filter.type !== 'all') ||
         (filter.assigned && filter.assigned !== 'all') ||
         filter.minLength > 0 || filter.maxLength > 0)
          ? e('button', {
              type: 'button',
              onClick: function () {
                setFilter({ search: '', type: 'all', assigned: 'all', minLength: 0, maxLength: 0 });
              },
              style: {
                background: 'transparent', border: 'none',
                color: '#3794ff', cursor: 'pointer',
                padding: 0, fontSize: 10, fontFamily: 'inherit'
              }
            }, 'Clear filters')
          : null
      )
    );
  }

  function TextRow(props) {
    var t = props.text;
    var checked = props.checked;
    var group = props.group;
    var onToggle = props.onToggle;

    var typeColors = {
      'dialogue': '#dcdcaa',
      'menu': '#569cd6',
      'system': '#f44747',
      'system-internal': '#808080',
      'compressed': '#c586c0'
    };

    var groupBadge = group
      ? e('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 8,
            fontSize: 9,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid ' + group.color,
            color: group.color
          },
          title: 'Assigned to ' + group.name
        },
          e('span', {
            style: {
              width: 6, height: 6, borderRadius: 3,
              background: group.color
            }
          }),
          group.name
        )
      : null;

    return e('tr', {
      style: {
        background: checked ? 'rgba(55,148,255,0.08)' : 'transparent'
      }
    },
      e('td', { style: Object.assign(tdStyle('center'), { width: 28 }) },
        e('input', {
          type: 'checkbox',
          checked: checked === true,
          onChange: function () { onToggle(t.startByte); },
          style: { cursor: 'pointer' }
        })
      ),
      e('td', { style: Object.assign(tdStyle('left'), {
        width: 100,
        fontFamily: 'var(--kt-font-mono)',
        fontSize: 10,
        color: 'var(--kt-info-fg, #75beff)'
      }) },
        t.offset || ('0x' + Number(t.startByte || 0).toString(16).toUpperCase().padStart(6, '0'))
      ),
      e('td', { style: Object.assign(tdStyle('left'), { width: 80, fontSize: 10 }) },
        e('span', {
          style: {
            color: typeColors[t.textType] || 'var(--kt-sidebar-fg)',
            textTransform: 'capitalize'
          }
        }, String(t.textType || '').replace('-', ' '))
      ),
      e('td', {
        style: Object.assign(tdStyle('left'), {
          fontSize: 11,
          fontFamily: 'var(--kt-font-mono)',
          color: 'var(--kt-editor-fg)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: 0
        })
      }, (K.translate && typeof K.translate.toDisplay === 'function')
        ? K.translate.toDisplay(t.originalText || '')
        : String(t.originalText || '')),
      group ? e('td', { style: Object.assign(tdStyle('left'), { width: 120 }) }, groupBadge) : e('td', { style: tdStyle('left') }, '')
    );
  }

  function AssignMenu(props) {
    var groups = props.groups;
    var open = props.open;
    var onClose = props.onClose;
    var onSelect = props.onSelect;
    var onCreate = props.onCreate;
    var menuRef = uR(null);

    uE(function () {
      if (!open) return;
      var onDocClick = function (ev) {
        if (menuRef.current && menuRef.current.contains(ev.target)) return;
        if (ev.target.closest && ev.target.closest('[data-kt-assign-trigger]')) return;
        onClose();
      };
      var timer = setTimeout(function () {
        document.addEventListener('mousedown', onDocClick);
      }, 0);
      return function () {
        clearTimeout(timer);
        document.removeEventListener('mousedown', onDocClick);
      };
    }, [open, onClose]);

    if (!open) return null;

    var hasGroups = groups && groups.length > 0;

    var downward = props.direction === 'down';

    return e('div', {
      ref: menuRef,
      style: {
        position: 'absolute',
        bottom: downward ? 'auto' : '100%',
        top: downward ? '100%' : 'auto',
        left: 0,
        marginBottom: downward ? 0 : 4,
        marginTop: downward ? 4 : 0,
        minWidth: 220,
        maxHeight: 260,
        overflowY: 'auto',
        background: 'var(--kt-menu-bg)',
        color: 'var(--kt-menu-fg)',
        border: '1px solid var(--kt-widget-border-default)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        borderRadius: 3,
        padding: '4px 0',
        zIndex: 100
      }
    },
      hasGroups
        ? groups.map(function (g) {
            return e('button', {
              key: g.id,
              type: 'button',
              onClick: function () { onSelect(g.id); },
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: 12
              },
              onMouseEnter: function (ev) { ev.currentTarget.style.background = 'var(--kt-list-hover-bg)'; },
              onMouseLeave: function (ev) { ev.currentTarget.style.background = 'transparent'; }
            },
              e('span', {
                style: {
                  width: 8, height: 8, borderRadius: 4,
                  background: g.color, flex: '0 0 auto'
                }
              }),
              e('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, g.name),
              e('span', { style: { fontSize: 10, opacity: 0.6 } }, (g.offsets || []).length)
            );
          })
        : e('div', {
            style: {
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--kt-input-placeholder-fg)',
              fontStyle: 'italic'
            }
          }, 'No groups yet'),
      e('div', {
        style: {
          height: 1,
          background: 'var(--kt-widget-border-default)',
          margin: '4px 0'
        }
      }),
      e('button', {
        type: 'button',
        onClick: onCreate,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          color: '#3794ff',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 12
        },
        onMouseEnter: function (ev) { ev.currentTarget.style.background = 'var(--kt-list-hover-bg)'; },
        onMouseLeave: function (ev) { ev.currentTarget.style.background = 'transparent'; }
      }, '+ New Group...')
    );
  }

  function NewGroupModal(props) {
    var open = props.open;
    var onClose = props.onClose;
    var onCreate = props.onCreate;

    var st = uS('');
    var name = st[0];
    var setName = st[1];
    var inputRef = uR(null);

    uE(function () {
      if (open && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
      if (!open) setName('');
    }, [open]);

    if (!open) return null;

    var submit = function () {
      var v = String(name || '').trim();
      if (!v) return;
      onCreate(v);
    };

    return e('div', {
      className: 'kt-modal-overlay',
      onClick: function (ev) {
        if (ev.target === ev.currentTarget) onClose();
      }
    },
      e('div', { className: 'kt-modal', style: { maxWidth: 380 } },
        e('div', { className: 'kt-modal-header' },
          e('strong', null, 'New Group')
        ),
        e('div', { className: 'kt-modal-body' },
          e('input', {
            ref: inputRef,
            type: 'text',
            className: 'kt-input',
            placeholder: 'Group name (e.g. "Menu", "Battle Lines")',
            value: name,
            onChange: function (ev) { setName(ev.target.value); },
            onKeyDown: function (ev) {
              if (ev.key === 'Enter') submit();
              if (ev.key === 'Escape') onClose();
            },
            style: { width: '100%' }
          })
        ),
        e('div', { className: 'kt-modal-footer' },
          e('button', {
            type: 'button',
            className: 'kt-btn secondary',
            onClick: onClose
          }, 'Cancel'),
          e('button', {
            type: 'button',
            className: 'kt-btn',
            onClick: submit,
            disabled: !String(name || '').trim()
          }, 'Create & Assign')
        )
      )
    );
  }

  function PageInput(props) {
    var current = props.current;
    var total = props.total;
    var onGo = props.onGo;

    var st = uS(String(current));
    var val = st[0];
    var setVal = st[1];

    uE(function () { setVal(String(current)); }, [current]);

    var commit = function () {
      var n = parseInt(String(val || '').trim(), 10);
      if (!Number.isFinite(n) || n < 1) { setVal(String(current)); return; }
      if (n > total) n = total;
      if (n === current) { setVal(String(current)); return; }
      onGo(n);
    };

    return e('div', {
      style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }
    },
      e('span', { style: { opacity: 0.7 } }, 'Page'),
      e('input', {
        type: 'text',
        value: val,
        onChange: function (ev) {
          var v = String(ev.target.value || '').replace(/[^0-9]/g, '');
          setVal(v);
        },
        onBlur: commit,
        onKeyDown: function (ev) {
          if (ev.key === 'Enter') { commit(); try { ev.target.blur(); } catch (_) { } }
          if (ev.key === 'Escape') { setVal(String(current)); try { ev.target.blur(); } catch (_) { } }
        },
        title: 'Type a page number and press Enter',
        style: {
          width: 52,
          background: 'var(--kt-input-bg)',
          color: 'var(--kt-input-fg)',
          border: '1px solid var(--kt-input-border)',
          borderRadius: 2,
          padding: '2px 4px',
          fontFamily: 'var(--kt-font-mono)',
          fontSize: 11,
          textAlign: 'center'
        }
      }),
      e('span', { style: { opacity: 0.6 } }, '/ ' + total)
    );
  }

  function SearchTab() {
    var t = K.search.useSearch();

    var assignMenuSt = uS(false);
    var assignMenuOpen = assignMenuSt[0];
    var setAssignMenuOpen = assignMenuSt[1];

    var newGroupModalSt = uS(false);
    var newGroupModalOpen = newGroupModalSt[0];
    var setNewGroupModalOpen = newGroupModalSt[1];

    var listContainerRef = uR(null);
    var restoredRef = uR(false);

    uE(function () {
      if (restoredRef.current) return;
      restoredRef.current = true;
      var el = listContainerRef.current;
      if (el && t.listScrollTop > 0) el.scrollTop = t.listScrollTop;
    }, [t.listScrollTop]);

    var onListScroll = uC(function (ev) {
      K.search.setListScrollTop(ev.currentTarget.scrollTop);
    }, []);

    var filtered = uM(function () {
      return K.search.getFilteredTexts();
    }, [t.texts, t.filter, t.groups, t.marked]);

    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var safePage = Math.min(Math.max(1, t.page || 1), totalPages);
    var slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    var markedCount = uM(function () {
      return Object.keys(t.marked || {}).length;
    }, [t.marked]);

    var setPage = uC(function (p) { K.search.setPage(p); }, []);

    var onToggleMark = uC(function (startByte) {
      K.search.toggleMark(startByte);
    }, []);

    var onSelectAll = uC(function () {
      var offsets = slice.map(function (x) { return x.startByte; });
      K.search.markAll(offsets);
    }, [slice]);

    var onDeselectAll = uC(function () { K.search.unmarkAll(); }, []);

    var onAssign = uC(function (groupId) {
      K.search.assignMarkedToGroup(groupId);
      setAssignMenuOpen(false);
    }, []);

    var onNewGroupOpen = uC(function () {
      setAssignMenuOpen(false);
      setNewGroupModalOpen(true);
    }, []);

    var onNewGroupCreate = uC(function (name) {
      var id = K.search.createGroup(name);
      if (id) {
        K.search.assignMarkedToGroup(id);
      }
      setNewGroupModalOpen(false);
    }, []);

    var onNewGroupClose = uC(function () { setNewGroupModalOpen(false); }, []);

    var onRemoveText = uC(function (groupId, startByte) {
      K.search.removeFromGroup(groupId, startByte);
    }, []);

    var onRenameGroup = uC(function (id, name) { K.search.renameGroup(id, name); }, []);
    var onDeleteGroup = uC(function (id) { K.search.deleteGroup(id); }, []);
    var onMoveGroup = uC(function (id, direction) { K.search.moveGroup(id, direction); }, []);
    var onMoveText = uC(function (groupId, startByte, direction) {
      K.search.moveTextInGroup(groupId, startByte, direction);
    }, []);
    var onSortTexts = uC(function (groupId) { K.search.sortTextsInGroup(groupId); }, []);
    var onToggleExpand = uC(function (id) { K.search.toggleGroupExpand(id); }, []);

    if (!t.romBytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Search Text'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from File menu.')
      );
    }

    if (!t.tableData) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Search Text'),
        e('div', { className: 'ap-hint' }, 'Load a .tbl table, then click "Extract Texts" in the sidebar.')
      );
    }

    return e('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: 12,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        padding: 12
      }
    },
      e('div', {
        style: { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }
      },
        e(KtBox, {
          id: 'search-list',
          title: 'Extracted Texts (' + t.texts.length + ')',
          actions: null,
          bodyStyle: { padding: 0, display: 'flex', flexDirection: 'column' },
          style: { minHeight: 0, flex: 1 }
        },
          e(FilterBar, {
            filter: t.filter,
            setFilter: K.search.setFilter,
            total: t.texts.length,
            visible: total
          }),
          e('div', {
            ref: listContainerRef,
            onScroll: onListScroll,
            style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto' }
          },
            t.texts.length === 0
              ? e('div', {
                  style: {
                    padding: 24, textAlign: 'center', fontStyle: 'italic',
                    fontSize: 12, color: 'var(--kt-input-placeholder-fg)'
                  }
                }, t.isExtracting ? 'Extracting...' : 'No texts yet. Click "Extract Texts" in the sidebar.')
              : slice.length === 0
                ? e('div', {
                    style: {
                      padding: 24, textAlign: 'center', fontStyle: 'italic',
                      fontSize: 12, color: 'var(--kt-input-placeholder-fg)'
                    }
                  }, 'No texts match the current filters.')
                : e('table', {
                    style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 }
                  },
                    e('thead', null,
                      e('tr', null,
                        e('th', { style: Object.assign(thStyle(28, 'center'), { position: 'sticky', top: 0, background: 'var(--kt-sidebar-bg)', zIndex: 1 }) }, ''),
                        e('th', { style: Object.assign(thStyle(100), { position: 'sticky', top: 0, background: 'var(--kt-sidebar-bg)', zIndex: 1 }) }, 'Offset'),
                        e('th', { style: Object.assign(thStyle(80), { position: 'sticky', top: 0, background: 'var(--kt-sidebar-bg)', zIndex: 1 }) }, 'Type'),
                        e('th', { style: Object.assign(thStyle(null), { position: 'sticky', top: 0, background: 'var(--kt-sidebar-bg)', zIndex: 1 }) }, 'Original'),
                        e('th', { style: Object.assign(thStyle(120), { position: 'sticky', top: 0, background: 'var(--kt-sidebar-bg)', zIndex: 1 }) }, 'Group')
                      )
                    ),
                    e('tbody', null,
                      slice.map(function (tx) {
                        var g = K.search.getGroupForText(tx.startByte);
                        return e(TextRow, {
                          key: 'tx-' + tx.startByte,
                          text: tx,
                          checked: !!t.marked[String(tx.startByte)],
                          group: g,
                          onToggle: onToggleMark
                        });
                      })
                    )
                  )
          )
        ),

        e('div', {
          style: {
            flex: '0 0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            padding: '8px 0 0 0',
            flexWrap: 'wrap'
          }
        },
          e('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: onSelectAll, disabled: slice.length === 0
            }, 'Select page'),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: onDeselectAll, disabled: markedCount === 0
            }, 'Clear marks')
          ),
          totalPages > 1 ? e('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { setPage(1); }, disabled: safePage <= 1
            }, '<<'),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { setPage(safePage - 1); }, disabled: safePage <= 1
            }, '<'),
            e(PageInput, { current: safePage, total: totalPages, onGo: setPage }),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { setPage(safePage + 1); }, disabled: safePage >= totalPages
            }, '>'),
            e('button', {
              type: 'button', className: 'kt-btn small',
              onClick: function () { setPage(totalPages); }, disabled: safePage >= totalPages
            }, '>>')
          ) : null,
          e('div', { style: { position: 'relative' } },
            e('button', {
              type: 'button',
              'data-kt-assign-trigger': '1',
              className: 'kt-btn',
              onClick: function () { setAssignMenuOpen(!assignMenuOpen); },
              disabled: markedCount === 0
            }, 'Add to Group (' + markedCount + ')'),
            e(AssignMenu, {
              open: assignMenuOpen,
              groups: t.groups,
              onClose: function () { setAssignMenuOpen(false); },
              onSelect: onAssign,
              onCreate: onNewGroupOpen
            })
          )
        )
      ),

      e('div', {
        style: { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }
      },
        e(KtBox, {
          id: 'search-groups',
          title: 'Groups (' + t.groups.length + ')',
          actions: null,
          bodyStyle: { padding: 0, overflow: 'auto' },
          style: { minHeight: 0, flex: 1 }
        },
          e(K.ui.KetorGroupsPanel, {
            groups: t.groups,
            texts: t.texts,
            expanded: t.expandedGroups || {},
            onToggleExpand: onToggleExpand,
            onRename: onRenameGroup,
            onDelete: onDeleteGroup,
            onRemoveText: onRemoveText,
            onMoveGroup: onMoveGroup,
            onMoveText: onMoveText,
            onSortTexts: onSortTexts,
            onSelect: K.search.selectGroup,
            selectedGroupId: t.selectedGroupId
          })
        )
      ),

      e(NewGroupModal, {
        open: newGroupModalOpen,
        onClose: onNewGroupClose,
        onCreate: onNewGroupCreate
      })
    );
  }

  // Shared with the Hex Editor toolbar so both activities offer the
  // exact same "pick a group / create one" flow.
  K.ui.AssignMenu = AssignMenu;
  K.ui.NewGroupModal = NewGroupModal;

  K.ui.registerTabProvider('search', SearchTab);

})(window);