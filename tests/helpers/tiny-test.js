/* A very small test collector: a suite registers cases, the runner runs them and
   reports one line each. No dependency, no watching, no config. */

function createSuite(name) {
  const cases = [];
  const skips = [];
  return {
    name: name,
    test: function (title, fn) { cases.push({ title: title, fn: fn }); },
    /* A case whose feature does not exist yet. It is not run and it does not fail the
       gate, and the reason is printed with the suite, so a documented gap stays visible
       in every run instead of living in a comment. The body is kept: the batch that
       implements the feature flips suite.skip back to suite.test and the assertions are
       already written. A suite that skips nothing prints exactly what it always did. */
    skip: function (title, reason, fn) { skips.push({ title: title, reason: reason, fn: fn }); },
    cases: cases,
    skips: skips
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'values differ') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((message || 'values differ') + ': expected ' + b + ', got ' + a);
}

async function runSuites(suites) {
  let passed = 0;
  const failures = [];
  const skipped = [];
  for (const suite of suites) {
    console.log('');
    console.log('== ' + suite.name);
    for (const item of suite.cases) {
      try {
        await item.fn({ assert: assert, assertEqual: assertEqual, assertDeepEqual: assertDeepEqual });
        passed++;
        console.log('  ok   ' + item.title);
      } catch (error) {
        failures.push({ suite: suite.name, title: item.title, error: error });
        console.log('  FAIL ' + item.title);
        console.log('       ' + (error && error.message ? error.message : String(error)));
        if (error && error.stack) {
          const line = String(error.stack).split('\n').filter(function (l) { return l.indexOf('at ') >= 0; })[1];
          if (line) console.log('       ' + line.trim());
        }
      }
    }
    for (const item of suite.skips || []) {
      skipped.push({ suite: suite.name, title: item.title });
      console.log('  skip ' + item.title);
      console.log('       ' + item.reason);
    }
  }
  console.log('');
  console.log(passed + ' passed, ' + failures.length + ' failed' + (skipped.length ? ', ' + skipped.length + ' skipped' : ''));
  return failures.length === 0;
}

module.exports = { createSuite: createSuite, runSuites: runSuites, assert: assert, assertEqual: assertEqual, assertDeepEqual: assertDeepEqual };
