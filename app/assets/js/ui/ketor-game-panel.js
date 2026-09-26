/* ============================================================
   Ketor - Page layout inspector (Translation activity)
   ------------------------------------------------------------
   Two boxes, the same shape as the other inspectors: one holds the
   page drawn as the engine draws it, the other the facts about it.
   Short labels only - a translator reading this panel is looking at
   the page, not at documentation.

   The layout is faithful because it was measured on the rom, not
   assumed: pages are joined by 05 09, lines by 06 (the [LINE] token),
   and the extractor gives one page per text. The width is the width
   of the original page.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var MONO = "Consolas, 'Courier New', monospace";

  function Box(props) {
    if (typeof K.ui.KtBox === 'function') return e(K.ui.KtBox, props);
    return e('div', { className: 'kt-ui-box', style: { display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid var(--kt-widget-border-default)', borderRadius: 3, background: 'var(--kt-sidebar-bg)', overflow: 'hidden' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--kt-widget-border-default)' } },
        e('div', { style: { flex: 1, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 } }, props.title || ''),
        props.actions || null
      ),
      e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 8 } }, props.children)
    );
  }

  function renderTokens(line, keyPrefix) {
    var parts = String(line).split(/(\[[^\]]{1,24}\])/g);
    return parts.map(function (part, i) {
      if (!part) return null;
      var isToken = /^\[[^\]]{1,24}\]$/.test(part);
      return e('span', {
        key: keyPrefix + '-' + i,
        style: isToken
          ? { color: '#ffd479', background: 'rgba(255,212,121,0.14)', borderRadius: 2, padding: '0 2px' }
          : null
      }, part);
    });
  }

  function Row(props) {
    return e('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, lineHeight: '16px' } },
      e('span', { style: { opacity: 0.65 } }, props.label),
      e('span', { style: Object.assign({ fontFamily: MONO }, props.style || {}) }, props.value)
    );
  }

  function PageLayoutPanel(props) {
    var given = props || {};
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;
    var originalState = uS(false);
    var showOriginal = originalState[0];
    var setShowOriginal = originalState[1];

    var active = given.row || null;
    if (!active && s && s.texts && t.selectedOffset !== null && t.selectedOffset !== undefined) {
      for (var i = 0; i < s.texts.length; i++) {
        if (Number(s.texts[i].startByte) === Number(t.selectedOffset)) { active = s.texts[i]; break; }
      }
    }

    var toggle = e('button', {
      type: 'button',
      className: 'kt-btn small',
      style: { fontSize: 10, padding: '1px 6px' },
      title: showOriginal ? 'Show your translation' : 'Show the original text',
      onClick: function () { setShowOriginal(!showOriginal); }
    }, showOriginal ? 'Original' : 'Translation');

    if (!active) {
      return e(Box, { id: 'translate-page-layout', title: 'Page layout', style: { flex: 1, minHeight: 0 } },
        e('div', { style: { fontSize: 11, opacity: 0.65 } }, 'Select a text.'));
    }

    var budget = given.budget || K.translate.lineBudget(active);
    var width = Math.max(8, Number(budget.budget) || 32);
    var text = showOriginal ? active.originalText : active.translatedText;
    var layout = K.translate.previewLayout(text, width);
    var empty = String(text == null ? '' : text).trim().length === 0;
    var over = layout.lines.filter(function (line) { return line.over; }).length;
    var profileInfo = (K.translate.getProfileInfo) ? K.translate.getProfileInfo() : null;
    var fontKnown = !!(profileInfo && profileInfo.profile && profileInfo.profile.graphics && profileInfo.profile.graphics.font);

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 } },
      e(Box, {
        id: 'translate-page-layout',
        title: 'Page layout',
        actions: toggle,
        style: { flex: '1 1 auto', minHeight: 0 }
      },
        e('div', {
          style: {
            background: '#0d1226',
            border: '1px solid #55688f',
            borderRadius: 3,
            padding: '8px 10px',
            minHeight: 64,
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: '17px',
            color: '#f4f7ff'
          }
        },
          empty
            ? e('div', { style: { opacity: 0.5, fontStyle: 'italic' } }, 'no translation yet')
            : layout.lines.map(function (line, i) {
                return e('div', {
                  key: 'l' + i,
                  style: { whiteSpace: 'pre-wrap', color: line.over ? '#ff9d9d' : '#f4f7ff' }
                }, renderTokens(line.text, 'l' + i));
              })
        )
      ),
      e(Box, { id: 'translate-page-facts', title: 'Details', style: { flex: '0 0 auto' } },
        e(Row, { label: 'lines', value: String(layout.lines.length) }),
        e(Row, { label: 'page width', value: width + ' chars' }),
        e(Row, {
          label: 'too wide',
          value: over > 0 ? over + ' line(s)' : 'none',
          style: over > 0 ? { color: 'var(--kt-error-fg)' } : { opacity: 0.75 }
        }),
        e(Row, { label: 'glyphs', value: fontKnown ? 'game font' : 'system font' }),
        e(Row, { label: 'profile', value: profileInfo && profileInfo.profile ? profileInfo.profile.id : 'none' })
      )
    );
  }

  /* The inspector of the Translation activity (see ketor-translate-tab.js). */
  K.ui.KetorPageLayoutPanel = PageLayoutPanel;
})(window);
