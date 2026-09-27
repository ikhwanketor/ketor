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
const monkeyMoore = require('./monkey-moore.test');
const extractFiller = require('./extract-filler.test');
const extractionRecords = require('./extraction-records.test');
const gbaProfile = require('./gba-profile.test');
const headerlessRecord = require('./headerless-record.test');
const readableFilter = require('./readable-filter.test');
const debuggerTab = require('./debugger-tab.test');
const armDisasm = require('./arm-disasm.test');
const tileWriteback = require('./tile-writeback.test');
const tileClipboard = require('./tile-clipboard.test');
const tileSelection = require('./tile-selection.test');
const tileMarquee = require('./tile-marquee.test');
const tileImage = require('./tile-image.test');
const tilePng = require('./tile-png.test');
const tileStatusbar = require('./tile-statusbar.test');
const tilePalette256 = require('./tile-palette256.test');
const tileCodec = require('./tile-codec.test');
const tilePaletteModel = require('./tile-palette-model.test');
const tilePanel = require('./tile-panel.test');
const hexAppend = require('./hex-append.test');
const structure = require('./structure.test');
const tooltipCoverage = require('./tooltip-coverage.test');

const suites = [insertPolicy.suite, pointerDetector.suite, translatePanel.suite, gameProfile.suite, saveState.suite, fontMap.suite, tableWidth.suite, monkeyMoore.suite, extractFiller.suite, extractionRecords.suite, gbaProfile.suite, headerlessRecord.suite, readableFilter.suite, debuggerTab.suite, armDisasm.suite, tileWriteback.suite, tileClipboard.suite, tileSelection.suite, tileMarquee.suite, tileImage.suite, tilePng.suite, tileStatusbar.suite, tilePalette256.suite, tileCodec.suite, tilePaletteModel.suite, tilePanel.suite, hexAppend.suite, structure.suite, tooltipCoverage.suite];
const filter = process.argv[2] ? String(process.argv[2]) : '';
const chosen = filter ? suites.filter(function (s) { return s.name.indexOf(filter) >= 0; }) : suites;

runSuites(chosen).then(function (ok) {
  process.exit(ok ? 0 : 1);
}).catch(function (error) {
  console.log('runner error: ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
