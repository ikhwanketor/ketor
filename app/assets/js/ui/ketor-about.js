/* ============================================================
   Ketor -- About Modal
   ------------------------------------------------------------
   KETOR = Kernel Engine Translation for Old & Retro Games
   Shows version, meaning, author, license, and repository link.
   Triggered by command 'ketor.about.show'.
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.ui = Ketor.ui || {};

  var React = global.React;
  if (!React) return;
  var e = React.createElement;
  var useCallback = React.useCallback;

  var VERSION = '0.0.1-Beta';
  var KETOR_MEANING = 'Kernel Engine Translation for Old & Retro Games';

  function KetorAboutModal(props) {
    var open = props.open;
    var onClose = props.onClose || function () { };

    var handleOverlay = useCallback(function (ev) {
      if (ev.target === ev.currentTarget) onClose();
    }, [onClose]);

    if (!open) return null;

    return e('div', {
      className: 'kt-modal-overlay',
      onClick: handleOverlay,
      role: 'dialog',
      'aria-label': 'About Ketor'
    },
      e('div', { className: 'kt-modal', style: { maxWidth: '560px' } },
        e('div', { className: 'kt-modal-header' },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            Ketor.ui.icon('globe', { size: 22 }),
            e('strong', { style: { letterSpacing: '0.05em' } }, 'KETOR')
          ),
          e('button', {
            type: 'button',
            className: 'icon-btn',
            onClick: onClose,
            title: 'Close'
          }, Ketor.ui.icon('close', { size: 14 }))
        ),
        e('div', { className: 'kt-modal-body' },
          e('h2', {
            style: {
              margin: '0 0 4px 0',
              fontSize: '15px',
              fontWeight: 500,
              lineHeight: 1.4
            }
          }, KETOR_MEANING),
          e('div', {
            className: 'kt-text-dim kt-text-small',
            style: { marginBottom: '18px' }
          }, 'Version ' + VERSION),
          e('p', {
            style: { lineHeight: 1.6, fontSize: '13px', margin: '0 0 12px 0' }
          },
            'Ketor is a browser-based ROM translation studio for retro and modern consoles. ' +
            'Extract text, translate in place, edit fonts and tiles, patch, and export -- all ' +
            'client-side, without any uploads or servers.'
          ),
          e('p', {
            style: { lineHeight: 1.6, fontSize: '13px', margin: '0 0 12px 0' }
          },
            'The native desktop build is written in C++ with CMake. This web build mirrors ' +
            'its feature set for cross-platform access.'
          ),
          e('hr', { className: 'kt-separator' }),
          e('div', {
            className: 'kt-text-small kt-text-dim',
            style: { lineHeight: 1.9 }
          },
            e('div', null, 'Author: ', e('strong', null, 'Ikhwan Ketor')),
            e('div', null, 'License: GPL-3.0'),
            e('div', null,
              'Repository: ',
              e('a', {
                href: 'https://github.com/ikhwanketor/ketor',
                target: '_blank',
                rel: 'noopener noreferrer',
                style: { color: '#3794ff' }
              }, 'github.com/ikhwanketor/ketor')
            ),
            e('div', null, 'Powered by React, WebAssembly, and EmulatorJS.')
          )
        ),
        e('div', { className: 'kt-modal-footer' },
          e('button', {
            type: 'button',
            className: 'kt-btn secondary',
            title: 'Close this window and go back to the workbench, leaving the project untouched',
            onClick: onClose
          }, 'Close')
        )
      )
    );
  }

  Ketor.ui.KetorAboutModal = KetorAboutModal;

})(window);