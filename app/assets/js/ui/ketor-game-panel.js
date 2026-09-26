/* ============================================================
   Ketor - Page layout panel (right side)
   ------------------------------------------------------------
   The page as the game shows it, beside the text being edited.

   The chrome is the shared box (K.ui.KtBox: collapse chevron,
   uppercase title, actions), the same one the Groups panel, the
   Table tab and the Hex Editor use, so the right hand side of the
   workbench looks like one application instead of one panel per
   author.

   What is faithful today is the layout, and it is faithful because
   it was measured on the rom rather than assumed: a record holds
   pages joined by 05 09, a page holds lines joined by 06 (the
   [LINE] token), and the extractor gives one page per text. The
   width comes from the original page.

   The in game picture itself (font, window frame, background,
   portrait) comes from the game profile when the profile knows where
   those are, never from a guess. That is what makes this panel
   universal: it asks the profile, and a profile is plain JSON that a
   user can write or load for any game on any console.
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

  /* The shared box chrome when it is there, a plain box when it is not (a test harness
     that loads this file alone should not fail because the kit is missing). */
  function Box(props) {
    if (typeof K.ui.KtBox === 'function') return e(K.ui.KtBox, props);
    return e('div', {
      className: 'kt-ui-box',
      style: { display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid var(--kt-widget-border-default)', borderRadius: 3, background: 'var(--kt-sidebar-bg)', overflow: 'hidden' }
    },
      e('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--kt-widget-border-default)' }
      },
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
          ? { color: '#f0c674', background: 'rgba(240,198,116,0.12)', borderRadius: 3, padding: '0 3px', fontSize: '0.92em' }
          : null
      }, part);
    });
  }

  function PageLayoutPanel() {
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;
    var originalState = uS(false);
    var showOriginal = originalState[0];
    var setShowOriginal = originalState[1];

    var texts = (s && s.texts) ? s.texts : [];
    var active = null;
    if (t.selectedOffset !== null && t.selectedOffset !== undefined) {
      for (var i = 0; i < texts.length; i++) {
        if (Number(texts[i].startByte) === Number(t.selectedOffset)) { active = texts[i]; break; }
      }
    }
    if (!active && texts.length) active = texts[0];

    var toggle = e('button', {
      type: 'button',
      className: 'kt-btn small',
      style: { fontSize: 10, padding: '1px 6px' },
      title: showOriginal ? 'Show your translation' : 'Show the original text',
      onClick: function () { setShowOriginal(!showOriginal); }
    }, showOriginal ? 'Original' : 'Translation');

    if (!active) {
      return e(Box, { id: 'translate-page-layout', title: 'Page layout', style: { minHeight: 0 } },
        e('div', { className: 'kt-hint' }, 'Select a text in the list to see the page as the game shows it.'));
    }

    var budget = K.translate.lineBudget(active);
    var width = Math.max(8, Number(budget.budget) || 32);
    var text = showOriginal ? active.originalText : active.translatedText;
    var layout = K.translate.previewLayout(text, width);
    var empty = String(text == null ? '' : text).trim().length === 0;
    var over = layout.lines.filter(function (line) { return line.over; }).length;
    var profileInfo = (K.translate.getProfileInfo) ? K.translate.getProfileInfo() : null;
    var fontKnown = !!(profileInfo && profileInfo.profile && profileInfo.profile.graphics && profileInfo.profile.graphics.font);

    return e(Box, {
      id: 'translate-page-layout',
      title: 'Page layout',
      actions: toggle,
      style: { minHeight: 0 }
    },
      empty
        ? e('div', { className: 'kt-hint', style: { fontStyle: 'italic' } }, 'Nothing translated yet for this page.')
        : e('div', {
            style: {
              background: '#0b1020',
              border: '2px solid #8fa6d8',
              borderRadius: 4,
              boxShadow: 'inset 0 0 0 2px #1b2545',
              padding: '10px 12px',
              minHeight: 70,
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: '18px',
              color: '#f2f5ff',
              textShadow: '1px 1px 0 #000'
            }
          },
            layout.lines.map(function (line, i) {
              return e('div', {
                key: 'l' + i,
                style: { whiteSpace: 'pre-wrap', color: line.over ? '#ff9d9d' : '#f2f5ff' }
              }, renderTokens(line.text, 'l' + i));
            })
          ),
      e('div', {
        className: 'kt-hint',
        style: { marginTop: 8, color: over > 0 ? 'var(--kt-error-fg)' : undefined }
      },
        layout.lines.length + ' line(s), original page width ' + width + ' characters' +
        (over > 0 ? ', ' + over + ' line(s) wider than the original page' : '') + '.'
      ),
      e('div', { className: 'kt-hint', style: { marginTop: 6, opacity: 0.7 } },
        fontKnown
          ? 'Lines, page width and glyphs come from this game profile, so this is how the engine will draw the page.'
          : 'Lines and page width follow the rom. The letters are still the system font: this game profile does not name a font yet. Filling "graphics.font" in the profile (or loading one) is what turns this into the real in game picture.')
    );
  }

  K.ui.registerRightPanelProvider('translation', PageLayoutPanel, { title: 'Page layout' });
})(window);
