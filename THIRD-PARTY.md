# Third-party components and credits

Ketor is licensed under the GNU General Public License version 3 (`LICENSE`),
with the additional attribution terms recorded in `NOTICE`. This file lists the
third-party components the application uses and the prior work its source credits.
**Nothing listed below is distributed in this repository.**

## Components the application loads at runtime

| Component | Where it comes from | Loaded by | License |
| --- | --- | --- | --- |
| React 18 + ReactDOM 18 | unpkg CDN - `https://unpkg.com/react@18/umd/react.development.js` and `https://unpkg.com/react-dom@18/umd/react-dom.development.js` | `app/index.html` | MIT |
| pako 2.1.0 | cdnjs CDN - `https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js` | `app/index.html` (PNG inflate in the tile editor, and `core/save-state.js` when `window.pako` is present) | MIT |
| EmulatorJS | `https://cdn.emulatorjs.org/stable/data/` (loader script and data path) | only the separate page `app/wasm-runtime/`, through `app/wasm-runtime/assets/js/runtime.js` | GPL-3.0 |

React and pako are fetched by the browser when the workbench page opens; EmulatorJS
is fetched only when the user opens the runtime page, which the workbench does not
link to. All three stay on their own CDN: no copy of them is vendored here, so this
repository distributes neither their source nor their binaries.

EmulatorJS is GPL-3.0, the same license as this project, so running the runtime page
does not put the two under conflicting terms; the compatibility noted here is about
the license, not about any code being shared.

## Prior work the source credits

- **Monkey-Moore** (rjricken, GPL-3.0; `https://github.com/rjricken/monkey-moore`, also
  credited as Darkl0rd in the source) - the origin of the delta (relative) search
  technique. `app/assets/js/core/monkey-moore.js` and `app/assets/js/core/relative-search.js`
  are independent implementations written for Ketor from the described behaviour; no
  code was taken from that project, and its GPL-3.0 license is credited here as the
  origin of the technique.
- **GBATEK** - the GBA hardware documentation the codecs cite: the BIOS decompression
  formats in `app/assets/js/core/gba-compress.js`, the VRAM layout in
  `app/assets/js/core/gba-vram.js`, and the text-mode background map in
  `app/assets/js/ui/ketor-tile-activity.js`. Documentation only: no code was taken from
  it.
- **Tilemap Studio** (Rangi42, LGPL-3.0) - named in `app/assets/js/ui/ketor-tile-activity.js`
  as the kind of tool that ships per-game screen configuration for the maps it knows.
  It is a reference by name only: no code from it is included here.

## `legacy/`

`legacy/` is not a third-party component. It is an archive of this project's own
earlier version - the old PocketTranslate page, engine and stylesheet - kept frozen
for comparison and for old bug reports; nothing under `app/` or `tests/` loads it
(see `legacy/README.md`).

The provenance of one function it holds, `createRelativeSearchWorker`
(`legacy/assets/js/core.js:4693-5066`), is not known: no batch note, companion file
or commit history explains where it came from. It is recorded here as unknown rather
than credited to anyone, and it is not part of the application.
