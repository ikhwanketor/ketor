/* ============================================================
   Ketor - In game panel (right side)
   ------------------------------------------------------------
   The page as the game shows it, next to the text being edited.

   What is faithful today is the layout, and it is faithful because it
   was measured on the rom rather than assumed: a record holds pages
   joined by 05 09, a page holds lines joined by 06 (the [LINE] token),
   and the extractor gives one page per text. So the box below breaks
   its lines exactly where the game breaks them, uses the width of the
   original page, and marks the lines that no longer fit.

   What is not there yet: the game own glyphs. The dialogue font of
   Aria of Sorrow is not where a plain scan looks for it (the
   candidates around 0xE4E00 decode to blank tiles under the obvious
   rules) and most graphics on that rom are compressed, so the font has
   to be found and unpacked before this box can draw the real letters.
   The panel says that instead of pretending.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var MONO = "Consolas, 'Courier New', monospace";

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

  function InGamePanel() {
    var t = K.translate.useTranslate();
    var s = K.search ? K.search.useSearch() : null;
    var showOriginalState = R.useState(false);
    var showOriginal = showOriginalState[0];
    var setShowOriginal = showOriginalState[1];

    /* The same entry the editor is on: the selected one, or the first of the list. */
    var texts = (s && s.texts) ? s.texts : [];
    var active = null;
    if (t.selectedOffset !== null && t.selectedOffset !== undefined) {
      for (var i = 0; i < texts.length; i++) {
        if (Number(texts[i].startByte) === Number(t.selectedOffset)) { active = texts[i]; break; }
      }
    }
    if (!active && texts.length) active = texts[0];

    if (!active) {
      return e('div', { className: 'kt-hint', style: { padding: 12 } },
        'Select a text in the list to see the page as the game shows it.');
    }

    var budget = K.translate.lineBudget(active);
    var width = Math.max(8, Number(budget.budget) || 32);
    var text = showOriginal ? active.originalText : active.translatedText;
    var layout = K.translate.previewLayout(text, width);
    var empty = String(text == null ? '' : text).trim().length === 0;
    var over = layout.lines.filter(function (line) { return line.over; }).length;

    return e('div', { style: { padding: 10, display: 'flex', flexDirection: 'column', gap: 8 } },
      e('div', { className: 'kt-hint' },
        (showOriginal ? 'Original text' : 'Your translation') + (empty && !showOriginal ? ' (empty)' : ''),
        e('button', {
          type: 'button',
          className: 'kt-btn small',
          style: { float: 'right', fontSize: 10, padding: '1px 6px' },
          onClick: function () { setShowOriginal(!showOriginal); }
        }, showOriginal ? 'Show translation' : 'Show original')
      ),
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
        style: { color: over > 0 ? 'var(--kt-error-fg)' : undefined }
      },
        layout.lines.length + ' line(s), original page width ' + width + ' characters' +
        (over > 0 ? ', ' + over + ' line(s) wider than the original page' : '') + '.'
      ),
      e('div', { className: 'kt-hint', style: { opacity: 0.65 } },
        'Lines and page width follow the rom. The full in game picture (font, window frame, background, portrait) is drawn by the game while it runs, so painting it here needs the runtime state of the moment the message is shown: a save state or a screenshot. That is the next step, not something this box pretends to be.')
    );
  }

  K.ui.registerRightPanelProvider('translation', InGamePanel, { title: 'Page layout' });
})(window);
