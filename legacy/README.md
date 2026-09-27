# legacy/ — frozen archive of PocketTranslate

The contents of this folder are the old **PocketTranslate** application (a single
`index.html` page + `core.js` at 4,729 lines + `app-ui.js`) together with its
`main.css`. Since batch 180 the application in use is the workbench in `app/`, and
this folder is **not loaded, not referenced, and not tested** by anything in `app/`
or `tests/`.

## Why it is kept, not deleted

- `core.js` still holds `createRelativeSearchWorker` (here at lines 4693-5066)
  and a few other helpers that have not been moved to `app/assets/js/core/`.
  `app-ui.js` calls it through a global name, so both stay intact here until
  that move is finished.
- The history and original shape of the functions that have already been moved
  (text codec, `rebuildRom`, the three workers) can be compared directly with their
  new copies in `app/assets/js/core/`.
- If a bug report comes in from the old version, its files can still be opened as they are.

This folder is frozen: fixes and new features go into `app/`, not here.

## How to open it

This page creates Workers through `URL.createObjectURL`, and files are fetched with
`fetch`/`<script src>`; opening `index.html` directly from `file://` will fail in
many browsers. Run a static server from the repo root, then open:

```
python -m http.server 8080
# then: http://localhost:8080/legacy/index.html
```

The `assets/` structure is deliberately kept exactly as it was so that the references
`./assets/css/main.css`, `./assets/js/core.js` and `./assets/js/app-ui.js` in
`index.html` stay correct without being changed.

## Provenance note

The origin of `createRelativeSearchWorker` (`legacy/assets/js/core.js:4693-5066`) is
unknown: there is no batch note, no companion file, and no commit history that
explains where that code came from or where its pattern was taken from.
Treat it as code with no provenance until someone can prove otherwise.

## The `unused/` folder

`unused/` holds files that are **not used by the application at all**: not loaded by
any page, not called by any other module, and not tested for behaviour. Files here
are kept as reference only (comparing old shapes, tracing origins), not as code that
can be re-enabled without a clear reason.

| File | Origin | Reason archived |
| --- | --- | --- |
| `ketor-tasks-registry.js` | `app/assets/js/ui/ketor-tasks-registry.js` | Batch 182: the only writer and reader of `Ketor.tasks.*` was that file itself, while the bottom panel already takes the task list from the workbench context (`props.tasks` in `app/assets/js/ui/ketor-panel.js`). There is no real caller, so its `<script>` tag was pulled from `app/index.html` and the file was moved here. |

## Quick map

| File | Contents |
| --- | --- |
| `index.html` | the old page; loads `./assets/css/main.css`, `./assets/js/core.js`, `./assets/js/app-ui.js` |
| `assets/js/core.js` | the old engine: text codec, `rebuildRom`, all workers, patch, CSV, AI translate |
| `assets/js/app-ui.js` | the old React components (one big file) |
| `assets/css/main.css` | the old theme; `.btn-danger` (lines 181-189) has already been copied to `app/assets/css/vscode-components.css` |
| `unused/ketor-tasks-registry.js` | the unused `Ketor.tasks` task registry; see the `unused/` section above |
