/* Runs every suite under tests/ and exits non zero when one fails.

   Usage: node tests/run-all.js [name filter] */

const { runSuites } = require('./helpers/tiny-test');
const insertPolicy = require('./insert-policy.test');
const pointerDetector = require('./pointer-detector.test');
const translatePanel = require('./translate-panel.test');
const gameProfile = require('./game-profile.test');
const saveState = require('./save-state.test');
const fontMap = require('./font-map.test');
const tableWidth = require('./table-width.test');

const suites = [insertPolicy.suite, pointerDetector.suite, translatePanel.suite, gameProfile.suite, saveState.suite, fontMap.suite, tableWidth.suite];
const filter = process.argv[2] ? String(process.argv[2]) : '';
const chosen = filter ? suites.filter(function (s) { return s.name.indexOf(filter) >= 0; }) : suites;

runSuites(chosen).then(function (ok) {
  process.exit(ok ? 0 : 1);
}).catch(function (error) {
  console.log('runner error: ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
