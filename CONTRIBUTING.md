# Contributing to Ketor

Issues and pull requests are welcome at https://github.com/ikhwanketor/ketor.

## Running the tests

```bash
cd ketor
node tests/run-all.js            # every suite
node tests/run-all.js insert     # suites whose name contains "insert"
```

No dependency, no config, no network. A change is ready when the run reports
**0 failed and 0 skipped**; the passed count may only go up.

## Rules of this repository

- Do not delete or weaken an existing test. A test that no longer matches the
  behaviour has to be updated, and the commit message has to say why.
- Do not add files to the repository for personal notes or scratch work. The tree
  holds the application, its tests and its documentation.
- Keep the application free of a build step: a page loads plain scripts and
  stylesheets from `app/assets/`.
- One batch is one commit, and the message is `batch N: <what changed>`. The build
  token in `app/index.html` and in `tests/structure.test.js` moves with the batch.

## License of a contribution

Contributions are accepted under the GNU General Public License version 3, the
license of this project (`LICENSE`), including the additional attribution terms in
`NOTICE`. By sending a contribution you agree that:

- the work is your own, or you have the right to submit it under these terms;
- your contribution is licensed under GPL-3.0 (or a later version) once it is
  merged;
- the maintainer may relicense the project, your contribution included, under any
  other license - for example a later version of the GPL or another free-software
  license - so the license can be changed in the future without having to track
  down every contributor.

You keep the copyright on your contribution: you grant these rights, you do not
transfer ownership.
