# Ketor

Ketor is a browser-only ROM translation suite. One page, `app/index.html`, opens a
cartridge image from disk and carries a translation project end to end: a hex editor,
text extraction and search, character tables, text groups, translation, insertion with
pointer recalculation, tile and font editing, patch export, and a debugger that reads a
ROM without running it. There is no backend and no build step - the page loads plain
scripts and stylesheets from `app/assets/` - and a loaded ROM is never uploaded
anywhere. The file stays in the browser tab; the only requests the application makes to
a server are the translation calls the user starts by hand.

## Status

- One application, one entry point: `app/index.html`, the workbench. The old
  monolithic page is frozen under `legacy/`, and nothing in `app/` or `tests/` loads
  it.
- Build token `150`: `window.__KT_BUILD__ = "150"` in the page, and `?v=150` on every
  script and stylesheet it loads.
- Gates: `231 passed, 0 failed` across `28 suites`, from `node tests/run-all.js`
  (run inside `ketor/`).
- No `package.json`, no bundler, no build command. React 18, ReactDOM 18 and pako come
  from CDNs; everything else is a file in this repository.

## Running it

Prerequisites: a modern browser (Web Workers, ES6, Canvas) and a static file server.
Opening `app/index.html` by double-clicking it is not supported: the app builds its
workers from Blob URLs, which a `file://` origin refuses, and the CDN scripts need a
network connection on first load.

Serve the **repository root** and open the app under `/app/`:

```bash
cd ketor
python -m http.server 8000
# open http://localhost:8000/app/
```

Or serve the `app/` folder itself, in which case the app is the root of that server:

```bash
cd ketor
npx serve app
# open the URL serve prints (http://localhost:3000/ by default)
```

Either way the folder that contains `index.html` plus its `assets/` tree must be the
one being served, because every reference in the page is relative. Serving the
repository root keeps the second page reachable too:
`http://localhost:8000/app/wasm-runtime/`.

`.github/workflows/static.yml` publishes the `app/` folder to GitHub Pages when
`main` is pushed, so the same files are what a deployed copy serves.

## Using it, step by step

1. **Load the ROM.** *Load ROM* on the welcome screen (or File > Load ROM) picks the
   file; the workbench reports its system, size and header.
2. **Load a table.** If the project already has a `.tbl`, load it (Table activity >
   *Load .tbl file*, or File > Load Table).
3. **Build a table instead, when there is none.** In the Table activity, paste a line of
   in-game text and press *Search* (Monkey-Moore relative search); check the preview,
   press *Apply for ROM*.
4. **Extract the text.** In Search Text, set Min/Max length and press *Extract Texts*.
5. **Filter and group.** Narrow the list, mark rows and use *Add to Group* (or create a
   group in the same step). Groups are what the Translation tab and the inserter work
   with.
6. **Translate.** In Translation, pick the group and edit each entry, or use a
   translation provider; the Size readout counts the bytes the build will write, and
   flags an entry that outgrows its original.
7. **Insert.** *Insert* compiles the selected group, *Insert All* every group. Pointers
   are recalculated, records that fit stay in place, over-long records are moved into
   free space and their pointer is rewritten; the report goes to the panel Log.
8. **Export.** In Patch & Export, *Export ROM* writes the whole image, *Export IPS*
   writes only the difference. Save the project (`<rom>.ketor`) or a CSV from the
   Translation sidebar if the work has to continue later.

**Readable texts only** (Search Text > Advanced) is on by default. A full scan of a
cartridge also finds graphics and fonts as text - the source records 244,921 printable
runs measured on Aria of Sorrow - so the filter keeps the runs that read like words.
Turn it off when a text is genuinely missing from the list: a table inside a script the
filter cannot judge, or a label made of symbols. The option applies at the next
*Extract Texts*, not to the list already on screen.

## The activities, tab by tab

The activity bar holds the tabs: Project, Table, Search Text, Hex Editor, Translation,
Tile Editor, Debugger, Patch & Export, Tests. An activity opens as a tab in the editor
area, and most of them also fill the left sidebar (their controls) and the right panel
(their settings).

### Project

Sidebar only; the editor area stays on the welcome screen. It shows the loaded file as a
tree: name, system, size, CRC32 and SHA1, the console header fields, a section map
(header, code region, PRG ROM, and so on per system), the character tables, the text
groups, the files in the project, and a recent list. Double-clicking a section jumps the
Hex Editor to that offset, a table opens the Table activity, a group opens in
Translation.

### Table

Builds a character table for a game whose encoding is unknown, and edits one by hand.

- Monkey-Moore style search from a sample text: *Relative* (matches by the differences
  between characters, so the byte values do not have to be known) or *Value Scan*
  (numbers and the gaps between them), several sample lines, wildcards with a
  configurable character, and search history.
- 8-bit or 16-bit character width, byte order for the 16-bit case, charset
  (ASCII / Shift-JIS / Unicode / Custom) and a control-hint switch.
- Results as `Offset | Values | Preview-in-game`, then a generated preview that is
  editable as `hex=char` rows with a Comment column, *Smart Guess* for control-code
  labels, *Adopt Labels* from a loaded compare table, and *Apply for ROM* to make the
  table the one the other activities use.
- `Load .tbl file` reads a table into the editor, `Download .tbl` writes it back out;
  a second `.tbl` can be loaded beside the generated preview for comparison.
- The width a table declares is the width the search and the insert read back, so a
  16-bit game is found and written as 16-bit characters.

### Search Text

Extraction, filtering and grouping.

- Extraction runs in a worker with the loaded table and the loaded console's own
  workflow profile. Options: Min len, Max len, ASCII fallback, DTE/MTE compression
  (shown for consoles whose workflow supports it), and under Advanced: *Readable texts
  only*, *Strict extractor*, *DWE padding byte*, *Text decompression*, *Include
  compressed (read-only)*.
- The list filters by text, by text type (dialogue, menu, system, ...), by group
  assignment and by length; rows are marked and added to a group, or a new group is
  created for them in one step. Groups are renamed, reordered, sorted and edited here.
- Each entry carries its offset, original text, translation and an optional comment;
  the comment travels with the saved project.
- Paging keeps the list responsive: 100 rows a page, with first / previous / next / last
  and a page number box to jump straight to a page.

### Hex Editor

Byte level editing on top of the loaded image.

- Virtualised grid, 16 bytes a row by default (the row width is configurable), hex and
  ASCII columns or hex only. The ASCII column is editable; double-clicking a hex cell
  edits nibbles. Undo and redo: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z.
- Patches map an offset to a replacement byte, changed bytes are drawn red, and *Discard
  every patch* throws them away. Writing past the end of the file grows the image, and
  undo takes that growth back.
- Bookmarks are added at the cursor with an optional name, renamed, removed, jumped to
  and cleared. Bookmarks and patches persist per ROM (keyed by name, size and a
  checksum of sampled bytes), so two ROMs never share them.
- Highlight layers, each independently switchable: sections, control codes, group
  ranges, changed bytes, bookmarks and search hits.
- Byte (hex) and text search through the loaded table; the selection can be turned into
  a group with *Mark Selection*.
- After an insert, the compiled image from the Translation activity can be viewed here.
  It is read-only - the editor refuses to write into it - and the ranges the build
  reported as moved are marked.

### Translation

- Kruptar-style layout: the active group as a title, a numbered and paged list of its
  entries, and below it the active entry with a read-only Original box beside the
  editable Translation box, a positional ruler, x/y caret and a Size in bytes. Size
  comes from the same encoder the build runs, and an entry that outgrows its room is
  flagged.
- Machine translation with the free chain (MyMemory, Google, LibreTranslate, Apertium -
  no key needed) or with a provider the user configures (an OpenAI-compatible endpoint,
  DeepL and others; the key is held in memory and is never written to the project, the
  CSV or the session). Translate one entry, or every untranslated entry of the group one
  request at a time, and stop a run in flight. The selected text is sent to that
  service; the ROM file itself is not.
- A status filter and *jump to the next untranslated entry*, find and replace inside a
  group, clear a group's translations, and *show this entry in the Hex Editor*.
- Insertion: *Insert* compiles the group, *Insert All* every group. The builder
  recalculates pointers, keeps records that fit in place, moves over-long records into
  free space and rewrites their own pointer; the sidebar declares which pointer table
  the engine reads and what may happen to a record that does not fit (move only, shift
  only, both, never). The compile report - texts, moved records, in-place records,
  pointers updated, warnings - is written to the panel Log.
- Project I/O: `Save Project (.ketor)` and `Load Project (.ketor)` carry groups,
  translations, comments, the table, the console profile, the pointer declaration and
  the insert options; CSV export and import use the shape `group, offset, original,
  translation`.

### Tile Editor

Graphics, palettes and fonts.

- Sheet view: the region and the tile format are proposed by score and the user confirms
  or picks another; the format list and the map layout come from the console profile.
  Clicking a tile selects its bytes in the Hex Editor, and the Hex Editor cursor
  highlights the tile and pixel it sits on.
- Font view: the same sheet drawn in character order and labelled with the characters
  the loaded table gives, with a *font base* (the tile that holds the first code) and a
  *first code*. *Write text on this screen* turns a text plus table plus font base into
  the tile numbers a screen needs, a newline starting the next row.
- Palette: read and written through the model the console declares (bgr555, gbc-bgr555,
  gb-shades, nes-2c02, md-9bit, ps1-555), with a palette hunt, palettes per screen, and
  the sixteen-colour block the map banks use. A colour edit goes through the patch
  layer; a Game Boy or NES colour edit is refused, because the ROM holds no colour to
  write for those.
- Map: the map scan and screen hunt read a screen's tile map (a two byte entry per cell,
  as GBATEK documents it) and remember the screen the user confirmed against the ROM.
- PNG: the sheet is exported as a PNG, and a PNG is imported back into the region
  (inflated with pako, which the page loads from the CDN for exactly this).
- Clipboard: Ctrl+C and Ctrl+V on the sheet grid copy and paste a block of pixels.
- Compressed graphic: open a compressed graphic and the editor works on its decompressed
  copy; a button recompresses the edited graphic and writes it back as a patch, and
  reports how much of the byte budget is used. A stream that does not read back is
  refused instead of being written.
- Paste hex from an emulator: bytes copied out of a running emulator as hex text are
  pasted back, and the chosen target decides whether they land on a tile, a screen or a
  palette; tile 0 of the region can be copied out as hex text the other way.
- Every pixel change is a patch in the Hex Editor's own patch layer: it turns red, it
  takes part in undo/redo, and Export writes it.

### Debugger

Reads a ROM without running it - there is no emulator and no CPU here.

- Display registers: the code that names a register (for example BG0CNT at
  0x04000008) is found in the file, together with the constant stored beside it, the
  flags that constant decodes to and the background set-ups they describe; the tab shows
  what it found, not a running value.
- Memory viewer: sixteen bytes a row with the row address, patches in the Hex Editor's
  changed-byte colour and the Hex Editor cursor byte marked. Offset and Rows boxes keep
  the text that was typed and commit only what parses.
- A save state can be handed to the tab (`K.debugger.setSaveState`, or the
  `ketor:save-state-loaded` event) and its GBA RAM blocks are offered through
  `core/save-state.js`; with no state, the ROM is read alone.
- Listing and breakpoints: the bytes of the window are disassembled as ARM or Thumb
  (the mode comes from the low bit of the address, the ARMv4T way). A breakpoint is a
  note on a list - exec, read or write - marked in the memory and disassembly rows.
  Nothing runs, so nothing is ever stopped.
- Copy and paste of hex text work only while the memory grid itself has focus; the tab
  owns no document-level shortcut.

### Patch & Export

What the work so far adds up to, on one screen: the loaded size, how many bytes differ
from the loaded file and in how many regions, how much the image has grown, the size the
export and the IPS patch would have, and the changed regions listed before and after.

- *Export ROM* writes the whole image, patches and appended bytes included.
- *Export IPS* writes only the difference, so it applies to a clean copy of the game. An
  IPS patch cannot say that a file got shorter and cannot address past 16 MB; both limits
  are reported instead of being applied quietly.
- *Discard all patches* returns to the loaded file.

### Not in the workbench

- No emulator and no CPU: the Debugger reads bytes and never executes them.
- The emulator is a **separate page**, `app/wasm-runtime/`, which loads EmulatorJS from
  `cdn.emulatorjs.org` at runtime. It is not linked from the workbench, and the
  workbench never hands it the ROM.
- The **Tests** activity has no tab registered yet; it opens a placeholder.
- Several menu commands are placeholders that only write "pending next batch" to the
  Log: File > Import Project / Export Project / Save Modified ROM / Export IPS Patch,
  every Edit entry (Undo, Redo, Cut, Copy, Paste, Find), Settings > Preferences /
  Keyboard Shortcuts / Advanced Options, Help > Welcome / Keyboard Shortcuts Reference /
  Community, and About > Release Notes. The working equivalents live in the activities:
  the Hex Editor's own Ctrl+Z and Ctrl+Y, Patch & Export for the ROM and the IPS patch,
  and the Translation sidebar for project save and load.
- The welcome screen's *Recent Files* action says itself that it is not wired up.

## Tests

```bash
cd ketor
node tests/run-all.js            # every suite
node tests/run-all.js insert     # suites whose name contains "insert"
```

No dependency, no config, no network. A suite builds the rom it needs, so the suites run
anywhere and give the same answer every time. A run today: **28 suites, 231 cases,
`231 passed, 0 failed`**.

Two suites guard the repository itself rather than a behaviour:

- `structure` reads every page under `app/` and checks that each script and stylesheet
  it loads is a file on disk, that no page loads the same script twice, that every script
  under `app/assets/js` and every stylesheet under `app/assets/css` is loaded by some
  page (a file nothing loads is a leftover or a page that forgot its script), that
  `app/index.html` carries the expected build token, and that the old engine and page
  stay archived under `legacy/`, out of `app/`.
- `tooltip-coverage` checks that every control in `app/assets/js/ui` explains itself
  (a `title` on the control, a titled ancestor, or a wrapper that forwards
  `props.title`), or is recorded in an allowlist that may only shrink: a new unexplained
  control fails, and an allowlist entry that no longer points at a gap fails too.

## Repository layout

```
app/
  index.html                 the workbench (build 150)
  assets/css/                four stylesheets: theme, components, base, mobile
  assets/js/core/            engine modules: rom loading and building, codecs
                             (text, tile, font, map, png), pointer search,
                             Monkey-Moore, compression, patch formats, workers
  assets/js/ui/              workbench modules: shell, activity bar, editor,
                             panel, status bar, and the tab and sidebar modules
  assets/js/workflows/       one profile per system (nes, gb, gbc, snes, gba,
                             genesis, ps1, n64, nds, pce, psp, 3ds, switch, ps2,
                             pc, android, ios, j2me) plus the registry
  wasm-runtime/              the separate emulator page (EmulatorJS from its CDN)
tests/
  run-all.js                 the runner
  *.test.js                  the suites
  helpers/                   the harness: fake window, synthetic rom, tiny runner
legacy/                      the frozen old application (index.html, core.js,
                             app-ui.js, main.css)
legacy/unused/               modules nothing loads and nothing calls
.github/workflows/static.yml publishes app/ to GitHub Pages
LICENSE
README.md
```

`legacy/` is kept rather than deleted on purpose: the old `core.js` still holds helpers
that were never moved, the moved functions can be compared against their originals, and
a bug report from the old version can still be opened as it was. It is frozen - fixes and
features go to `app/` - and `legacy/README.md` records what is in it and why.
`legacy/unused/` holds files that no page loads and no module calls; they are reference
material, not code waiting to be switched back on.

## Third-party code and references

Loaded from a CDN at page open (nothing is vendored in this repository):

| Component | Where it comes from | License |
| --- | --- | --- |
| React 18 + ReactDOM 18 | unpkg CDN, loaded by `app/index.html` | MIT |
| pako 2.1.0 | cdnjs CDN, loaded by `app/index.html` for PNG inflate | MIT |
| EmulatorJS | `cdn.emulatorjs.org`, loaded at runtime only by `app/wasm-runtime/` | GPL-3.0 |

EmulatorJS is not bundled here: it is fetched by that one separate page, which the
workbench does not link to.

Optional, only when the user asks for a translation: the free chain (MyMemory, Google,
LibreTranslate, Apertium) and any provider the user configures with their own key. Those
are network calls made by the browser; the ROM is not sent.

Prior work this project learned from, credited by the source itself:

- **Monkey-Moore** (rjricken, GPL-3.0) - the delta (relative) search technique used by
  `app/assets/js/core/monkey-moore.js` and `core/relative-search.js` is the one
  popularised by Monkey-Moore. Both files are independent implementations written for
  this project from the described behaviour, not ports: no code was taken from that
  project. Its GPL-3.0 license is credited here as the origin of the technique.
- **GBATEK** - the GBA format documentation the codecs cite: the BIOS decompression
  formats in `core/gba-compress.js`, the VRAM layout in `core/gba-vram.js` and the
  text-mode background map in the tile activity.
- **Tilemap Studio** (Rangi42, LGPL-3.0) - named by the tile activity as the kind of tool
  that ships per-game configuration for the screens it knows; no code from it is
  included here.

Where a reference is documentation, no code was taken from it. Nothing above is a
dependency of the application except the three CDN entries in the table.

## License

See [LICENSE](LICENSE) for the terms.

Third-party components remain under their own licenses, as listed above.

## Contributing

Issues and pull requests are welcome at
https://github.com/ikhwanketor/ketor. By sending a contribution you agree that it may be
distributed under the license of this project.

## ROMs and tables

This repository contains no ROM and no commercial character table. A ROM or a table that
is under copyright is not part of this project and must not be committed to it. Use your
own dump of a game you own; the application runs entirely in your browser, and the file
you open stays there.
