/* ============================================================
   Ketor - Debugger activity (Batch 155)
   ------------------------------------------------------------
   The first debugger step that runs nothing. A display register is
   not inside the ROM: BG0CNT lives at 0x04000008 in IO memory and
   the game's code writes it while the console runs, so a ROM can
   only be asked where the code decides it. The code decides with
   two constants close together -- the address of the register, in a
   literal, and the value it stores -- so this tab hands the loaded
   file to K.core.backgroundsFrom and shows what came back: every
   display register the code names, the constant that sits beside
   it, the flags that constant decodes to, and the background
   set-ups those constants describe.

   Nothing here executes anything: no emulator, no CPU, no key
   handler of its own. The list is read from the Hex Editor's source
   bytes, so it follows Load ROM without a refresh button, and the
   whole tab stays readable with the keyboard alone because it holds
   no keyboard handler to fight over a keystroke.
   ============================================================ */

(function (global) {
  'use strict';
  var K = global.Ketor = global.Ketor || {};
  K.ui = K.ui || {};
  var R = global.React;
  if (!R) return;
  var e = R.createElement;
  var uS = R.useState;
  var MONO = 'var(--kt-font-mono)';

  /* How far either side of the address constant the value constant is looked for.
     0x200 is the scanner's own default and covers a compiled setup block. */
  var SCAN_WINDOWS = [0x80, 0x200, 0x800];
  var DEFAULT_WINDOW = 0x200;

  function hex(n, digits) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) return '?';
    var s = Math.floor(v).toString(16).toUpperCase();
    while (s.length < (digits || 0)) s = '0' + s;
    return '0x' + s;
  }

  /* The file that was loaded, without any insert on top: the same source image the
     Hex Editor and the tile editor read. */
  function sourceBytes() {
    if (K.hex && K.hex.getSourceBytes) {
      var bytes = K.hex.getSourceBytes();
      if (bytes && bytes.length) return bytes;
    }
    return null;
  }

  /* A register value in the words the GBA manual uses, so the row says what the flags
     mean instead of leaving a hex word to be decoded by hand. */
  function decodeText(name, decoded) {
    if (!decoded) return '';
    if (name === 'DISPCNT') {
      return 'mode ' + decoded.mode
        + ' | bg ' + (decoded.bg && decoded.bg.length ? decoded.bg.join(',') : 'none')
        + ' | obj ' + (decoded.obj ? 'on' : 'off')
        + ' | forced blank ' + (decoded.forcedBlank ? 'on' : 'off');
    }
    return 'priority ' + decoded.priority
      + ' | char base ' + decoded.charBase + ' at ' + hex(decoded.charBlockAddress, 8)
      + ' | screen base ' + decoded.screenBase + ' at ' + hex(decoded.screenBlockAddress, 8)
      + ' | size ' + decoded.sizeName
      + ' | 256 colours ' + (decoded.colour256 ? 'on' : 'off')
      + ' | mosaic ' + (decoded.mosaic ? 'on' : 'off');
  }

  function registerRow(entry, hit) {
    var best = hit && hit.candidates && hit.candidates.length ? hit.candidates[0] : null;
    var nameStyle = { flex: '0 0 74px', fontFamily: MONO, fontWeight: 600 };
    var addressStyle = { flex: '0 0 92px', fontFamily: MONO, opacity: 0.85 };
    var valueStyle = { flex: '0 0 58px', fontFamily: MONO, fontWeight: 600 };
    return e('div', {
      key: entry.name,
      style: {
        padding: '5px 6px', borderBottom: '1px solid var(--kt-widget-border-default)',
        background: best ? 'transparent' : 'rgba(255,255,255,0.02)'
      }
    },
      e('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
        e('span', { style: nameStyle }, entry.name),
        e('span', { style: addressStyle }, entry.address),
        e('span', { style: valueStyle }, best ? hex(best.value, 4) : '--'),
        e('span', { style: { flex: '1 1 auto', lineHeight: 1.45 } },
          best ? decodeText(entry.name, best.decoded)
            : 'not in this ROM: the code never names this address near a value that could be its constant')
      ),
      best ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.6, marginTop: 2 } },
        'constant read at ROM 0x' + Math.floor(best.valueAt).toString(16).toUpperCase()
        + ' | code names it at ROM 0x' + Math.floor(hit.registerAt).toString(16).toUpperCase()
        + (hit.mirror ? ' (mirror 0x' + Math.floor(hit.mirror).toString(16).toUpperCase() + ')' : '')
        + ' | confidence ' + Math.round((Number(best.confidence) || 0) * 100) + '%') : null,
      /* The constant that wins is the closest plausible one, and a word that straddles the
         tail of the address literal can look plausible too. The rest are printed beside
         it so the choice this row made can be checked instead of trusted. */
      hit && hit.candidates && hit.candidates.length > 1
        ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.5, marginTop: 1 } },
            'other constants near it: ' + hit.candidates.slice(1, 4).map(function (c) {
              return hex(c.value, 4) + ' at ROM 0x' + Math.floor(c.valueAt).toString(16).toUpperCase()
                + ' (' + Math.round((Number(c.confidence) || 0) * 100) + '%)';
            }).join('  '))
        : null
    );
  }

  function backgroundRow(bg, index) {
    return e('div', {
      key: 'bg' + index,
      style: { padding: '5px 6px', borderBottom: '1px solid var(--kt-widget-border-default)' }
    },
      e('div', { style: { fontFamily: MONO } },
        'screen base ' + bg.screenBase + ' at ' + hex(bg.screenBlockAddress, 8)
        + ' | char base ' + bg.charBase + ' at ' + hex(bg.charBlockAddress, 8)),
      e('div', { style: { opacity: 0.8, lineHeight: 1.45 } },
        bg.sizeName + ' | ' + (bg.colour256 ? '256 colours' : '16 colours')
        + ' | best ' + Math.round((Number(bg.best) || 0) * 100) + '%'
        + ' | ' + (Number(bg.count) || 0) + ' constant(s)'),
      bg.registers && bg.registers.length
        ? e('div', { style: { fontFamily: MONO, fontSize: 10, opacity: 0.6, marginTop: 2 } },
            bg.registers.map(function (r) {
              return r.name + '=' + hex(r.value, 4) + ' at ROM 0x' + Math.floor(r.valueAt).toString(16).toUpperCase();
            }).join('  '))
        : null
    );
  }

  function DebuggerTab() {
    /* The bytes come from the Hex Editor's source image, the same buffer the rest of
       the workbench reads, so a ROM shows up here the moment it is loaded. */
    var hexState = K.hex && K.hex.useHex ? K.hex.useHex() : null;
    var st = uS(DEFAULT_WINDOW);
    var scanWindow = st[0];
    var setScanWindow = st[1];
    /* Not named "hex": the module already has a hex() formatter and a local of that
       name would shadow it inside this component. */
    var bytes = (hexState && hexState.romBytes) || sourceBytes();

    if (!bytes) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Debugger'),
        e('div', { className: 'ap-hint' }, 'Load a ROM first from the File menu.'));
    }

    var core = K.core || {};
    if (!core.backgroundsFrom || !core.GBA_REGISTERS) {
      return e('div', { className: 'kt-activity-placeholder' },
        e('div', { className: 'ap-title' }, 'Debugger'),
        e('div', { className: 'ap-hint' }, 'The GBA register scanner is not loaded in this build.'));
    }

    var scan = core.backgroundsFrom(bytes, { window: scanWindow });
    var hits = scan.hits || [];
    var backgrounds = scan.backgrounds || [];
    var byName = {};
    hits.forEach(function (hit) { if (!byName[hit.register]) byName[hit.register] = hit; });
    var registers = Object.keys(core.GBA_REGISTERS).sort(function (a, b) {
      return Number(a) - Number(b);
    }).map(function (key) {
      return { name: core.GBA_REGISTERS[key].name, address: hex(Number(key), 8) };
    });

    var selectStyle = {
      fontFamily: MONO, fontSize: 11, background: 'var(--kt-input-bg, #3c3c3c)',
      color: 'var(--kt-input-fg, #ccc)', border: '1px solid var(--kt-widget-border-default)',
      borderRadius: 2, padding: '1px 4px'
    };

    return e('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
      e('div', {
        style: {
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '5px 10px', borderBottom: '1px solid var(--kt-widget-border-default)',
          background: 'var(--kt-sidebar-bg)', fontSize: 11
        }
      },
        e('span', { style: { fontWeight: 600 } }, 'Debugger'),
        e('span', { style: { opacity: 0.7 } }, 'static register read, nothing runs'),
        e('span', { style: { fontFamily: MONO, opacity: 0.85 } },
          (hexState && hexState.romName ? hexState.romName + ' | ' : '') + bytes.length + ' bytes'),
        e('label', {
          style: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' },
          title: 'How far either side of the register address the value constant is looked for'
        },
          'window',
          e('select', {
            value: String(scanWindow),
            onChange: function (ev) { setScanWindow(Number(ev.target.value) || DEFAULT_WINDOW); },
            style: selectStyle
          },
            SCAN_WINDOWS.map(function (w) {
              return e('option', { key: w, value: String(w) }, hex(w, 0));
            })
          )
        )
      ),
      e('div', {
        style: {
          flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11
        }
      },
        e('div', { style: { opacity: 0.8, lineHeight: 1.5 } },
          'The code decides each register with two constants side by side: the address it writes '
          + '(0x04000000 and up) and the value it stores. The ROM named ' + hits.length
          + ' such site(s) within 0x' + scanWindow.toString(16).toUpperCase()
          + ' of a value that could be the constant, describing ' + backgrounds.length
          + ' background set-up(s). No emulator is involved: these are bytes in the file.'),
        e('div', { style: { fontWeight: 600 } }, 'Display registers'),
        e('div', { style: { border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
          registers.map(function (entry) { return registerRow(entry, byName[entry.name] || null); })
        ),
        e('div', { style: { fontWeight: 600, marginTop: 2 } }, 'Backgrounds'),
        backgrounds.length
          ? e('div', { style: { border: '1px solid var(--kt-widget-border-default)', borderRadius: 3 } },
              backgrounds.map(backgroundRow))
          : e('div', { style: { opacity: 0.6, fontStyle: 'italic' } },
              'No background control constant was found in this file.'),
        e('div', { style: { opacity: 0.6, lineHeight: 1.5, marginTop: 2 } },
          'A hit is evidence, not proof: a constant that looks like a register value can sit in '
          + 'data that is not code. The confidence and the ROM offset are printed with every row so '
          + 'the bytes behind the claim can be checked in the Hex Editor.')
      )
    );
  }

  K.ui.registerTabProvider('debugger', DebuggerTab);
  K.debugger = { decodeText: decodeText, scanWindow: DEFAULT_WINDOW };
})(window);
