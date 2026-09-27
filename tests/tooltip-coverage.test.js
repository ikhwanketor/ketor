/* Tooltip coverage, kept as a ratchet.
   ------------------------------------------------------------
   Every control the workbench draws should say what it does when the pointer rests on
   it. The audit recon (batch 183) counted the gap: 31 modules under app/assets/js/ui/,
   235 controls that are not an <option> (156 button, 52 input, 22 select, 5 textarea)
   plus 46 <option>. 102 controls carry their own title, 13 are explained by a titled
   ancestor element, and 128 are not explained at all (120 controls and 8 call sites of a
   wrapper component). One of those 128, the CompactHeader kebab, carries an aria-label and
   is a documented exception below, so the allowlist opens with 127 entries. The suite
   holds that number down: a control without an explanation
   fails unless it is recorded in the allowlist below, and the allowlist itself may not
   keep an entry that no longer points at a control without a tooltip. Each area batch
   adds its tooltips and deletes its own entries in the same commit, so the list can only
   shrink.

   What counts as an explanation, read from the source and never from a render:
     a) a title key at depth 1 of the props object of the e(...) call, or
     b) a titled ancestor e(...) call, unless the ancestor is one of the header-only
        components (Section, KtBox, KetorSidebarSection, TreeSection, CompactHeader),
        whose title is a heading and not a tooltip, or
     c) a call site of a wrapper component (Check, Action, LangSelect) that passes title,
        once the body of that component is shown to forward props.title to an element.
   An aria-label is accepted as an accessible name for an icon-only control (the two
   buttons named in the exceptions below), and a control whose props carry one is not a
   gap: the label is what a screen reader reads, and those two have no text of their own.

   Deliberately outside the scan:
     - <option> elements (46 today): an option is a row of a list that opens on click, it
       is never hovered on its own, and the select around it carries the explanation.
     - the five hidden file inputs of app/index.html (lines 154-158, display:none): they
       are never rendered with a size, the page is not a module under ui/ and cannot be
       opened with the pointer; the buttons that click them are what the scan sees.
     - the two icon buttons that already carry an aria-label instead of a title:
       ketor-editor.js KetorTab close (line 83 when the recon ran) and ketor-workbench.js
       CompactHeader kebab (line 203 when the recon ran). They explain themselves to a
       screen reader and have no room for a tooltip; the anchor test below keeps them
       honest by failing if the aria-label goes away.

   The planned batches, one area each: 184 tile, 185 font, 186 tables, 187 text/search,
   188 hex, 189 translate, 190 groups, 191 chrome, 192 dialog, 193 patch, 194 about, 195
   panel. The chrome area holds 7 entries and not the 8 of the recon: the eighth is the
   CompactHeader kebab, which carries an aria-label and is a documented exception above.

   The allowlist key is "file|tag|label|className|id", built from facts in the source, so
   a batch that only moves code cannot make an entry stale. When two controls in one file
   share all five facts, the key takes a #2, #3, ... suffix in source order. Line numbers
   appear in failure messages only. The value of an entry is a short reason plus the
   planned batch that will close it.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { createSuite, assert, assertEqual } = require('./helpers/tiny-test');

const suite = createSuite('tooltip-coverage');

const REPO = path.join(__dirname, '..');
const UI_DIR = path.join(REPO, 'app', 'assets', 'js', 'ui');

const CONTROL_TAGS = ['button', 'input', 'select', 'textarea'];
/* Components whose title prop is a heading, not a tooltip: a control inside one of these
   is not explained by it. */
const HEADER_ONLY = ['Section', 'KtBox', 'KetorSidebarSection', 'TreeSection', 'CompactHeader'];
/* The wrapper components the audit knows: name -> the module that declares it. */
const WRAPPERS = {
  Check: 'ketor-search-sidebar.js',
  Action: 'ketor-translate-sidebar.js',
  LangSelect: 'ketor-translate-tab.js'
};

/* ------------------------------------------------------------
   The scanner
   ------------------------------------------------------------
   A character walk, not a line regex: props objects are multi line, style objects nest,
   and a tag may be a conditional expression (statusbar draws
   e(item.clickable ? 'button' : 'div')). Comments, string literals and regex literals are
   masked first, and the argument list is read by balancing parentheses, so a title inside
   a comment or a nested call cannot be mistaken for the element's own. */

const CODE = 0, COMMENT = 1, STRING = 2, REGEX = 3;
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
const BACKTICK = String.fromCharCode(96);

function isIdentChar(c) { return c !== undefined && /[A-Za-z0-9_$]/.test(c); }
function isSpace(c) { return /\s/.test(c); }

/* One pass over the source marking every character as code, comment, string or regex. */
function maskSource(src) {
  const n = src.length;
  const kind = new Uint8Array(n);
  let last = '';
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== NEWLINE) { kind[i] = COMMENT; i++; }
      continue;
    }
    if (c === '/' && d === '*') {
      kind[i] = COMMENT; kind[i + 1] = COMMENT; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { kind[i] = COMMENT; i++; }
      if (i < n) { kind[i] = COMMENT; kind[i + 1] = COMMENT; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === BACKTICK) {
      const quote = c;
      kind[i] = STRING; i++;
      while (i < n) {
        if (src[i] === BACKSLASH) { kind[i] = STRING; i++; if (i < n) { kind[i] = STRING; i++; } continue; }
        kind[i] = STRING;
        if (src[i] === quote) { i++; break; }
        if (src[i] === NEWLINE && quote !== BACKTICK) { i++; break; }
        i++;
      }
      last = 'string';
      continue;
    }
    if (c === '/' && regexAllowed(last)) {
      kind[i] = REGEX; i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === BACKSLASH) { kind[i] = REGEX; i++; if (i < n) { kind[i] = REGEX; i++; } continue; }
        kind[i] = REGEX;
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        else if (src[i] === NEWLINE) break;
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) { kind[i] = REGEX; i++; }
      last = 'regex';
      continue;
    }
    if (!isSpace(c)) last = c;
    i++;
  }
  return kind;
}

/* A / is a division when it follows a value: an identifier, a string or a closing bracket. */
function regexAllowed(last) {
  if (last === '') return true;
  if (last === 'string' || last === 'regex') return false;
  if (isIdentChar(last)) return false;
  if (last === ')' || last === ']') return false;
  return true;
}

function skipSpace(src, kind, from, to) {
  let i = from;
  while (i < to && (kind[i] !== CODE || isSpace(src[i]))) i++;
  return i;
}

/* The first character that is neither a space nor a comment, whatever kind it is: a
   quoted prop key starts with a string, so skipSpace would walk straight past it. */
function firstToken(src, kind, from, to) {
  let i = from;
  while (i < to) {
    if (kind[i] === COMMENT || (kind[i] === CODE && isSpace(src[i]))) { i++; continue; }
    break;
  }
  return i;
}

/* The index of the ) that closes the ( at open, or -1. */
function matchParen(src, kind, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (kind[i] !== CODE) continue;
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* The top level commas of an argument list, as [from, to) ranges. */
function splitArgs(src, kind, from, to) {
  const args = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    if (kind[i] !== CODE) continue;
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { args.push([start, i]); start = i + 1; }
  }
  args.push([start, to]);
  return args.filter(function (r) { return src.slice(r[0], r[1]).trim() !== ''; });
}

/* The source of a range with comments blanked out; string literals stay, they are what
   labels, placeholders and quoted prop keys are made of. */
function clean(src, kind, from, to) {
  let out = '';
  for (let i = from; i < to; i++) {
    if (kind[i] === CODE || kind[i] === STRING) out += src[i];
    else if (kind[i] === COMMENT) out += ' ';
  }
  return out;
}

function collapse(s) { return String(s).replace(/\s+/g, ' ').trim(); }

function stringLiterals(src, kind, from, to) {
  const out = [];
  let i = from;
  while (i < to) {
    if (kind[i] === STRING && (src[i] === "'" || src[i] === '"')) {
      const quote = src[i];
      let j = i + 1;
      let value = '';
      while (j < to) {
        if (src[j] === BACKSLASH) { value += src[j + 1]; j += 2; continue; }
        if (src[j] === quote) break;
        value += src[j]; j++;
      }
      out.push({ value: value, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/* The depth 1 keys of a props object literal, or null when the argument is not one. */
function propEntries(src, kind, range) {
  const from = firstToken(src, kind, range[0], range[1]);
  if (src[from] !== '{') return null;
  let depth = 0;
  let end = -1;
  for (let i = from; i < range[1]; i++) {
    if (kind[i] !== CODE) continue;
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  if (firstToken(src, kind, end + 1, range[1]) < range[1]) return null;
  const ranges = [];
  let start = from + 1;
  depth = 0;
  for (let i = from + 1; i < end; i++) {
    if (kind[i] !== CODE) continue;
    const c = src[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { ranges.push([start, i]); start = i + 1; }
  }
  ranges.push([start, end]);
  const props = [];
  ranges.forEach(function (r) {
    const s = firstToken(src, kind, r[0], r[1]);
    if (s >= r[1]) return;
    let name = null;
    if (src[s] === '.' && src[s + 1] === '.' && src[s + 2] === '.') name = '...';
    else if (kind[s] === STRING) {
      const lit = stringLiterals(src, kind, s, r[1])[0];
      name = lit ? lit.value : null;
    } else {
      let j = s;
      while (j < r[1] && /[A-Za-z0-9_$]/.test(src[j])) j++;
      name = src.slice(s, j);
    }
    let d = 0;
    let valueFrom = -1;
    for (let i = s; i < r[1]; i++) {
      if (kind[i] !== CODE) continue;
      const c = src[i];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
      else if (c === ':' && d === 0) { valueFrom = i + 1; break; }
    }
    props.push({ name: name, range: r, valueFrom: valueFrom, text: collapse(clean(src, kind, r[0], r[1])) });
  });
  return props;
}

/* What the first argument names: a native tag, a conditional that draws one, or a
   component. A conditional is a control when any of its branches is one. */
function tagInfo(src, kind, range) {
  const text = collapse(clean(src, kind, range[0], range[1]));
  const lits = stringLiterals(src, kind, range[0], range[1]);
  const plain = lits.length === 1 &&
    collapse(clean(src, kind, range[0], lits[0].start)) === '' &&
    collapse(clean(src, kind, lits[0].end, range[1])) === '';
  if (plain) return { kind: 'native', tag: lits[0].value, text: text };
  const controlTags = [];
  lits.forEach(function (l) {
    if (CONTROL_TAGS.indexOf(l.value) >= 0 && controlTags.indexOf(l.value) < 0) controlTags.push(l.value);
  });
  if (controlTags.length && clean(src, kind, range[0], range[1]).indexOf('?') >= 0) {
    return { kind: 'native-conditional', tag: controlTags.join('/'), tags: controlTags, text: text };
  }
  const m = /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(clean(src, kind, range[0], range[1]));
  return { kind: 'component', tag: m ? m[1] : '(dynamic)', text: text };
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === NEWLINE) line++;
  return line;
}

function scanSource(file, text) {
  const kind = maskSource(text);
  const calls = [];
  for (let i = 0; i < text.length; i++) {
    if (kind[i] !== CODE || text[i] !== 'e') continue;
    if (i > 0 && (isIdentChar(text[i - 1]) || text[i - 1] === '.')) continue;
    const open = skipSpace(text, kind, i + 1, text.length);
    if (text[open] !== '(') continue;
    const close = matchParen(text, kind, open);
    if (close < 0) continue;
    const args = splitArgs(text, kind, open + 1, close);
    if (args.length === 0) continue;
    calls.push({ file: file, start: i, end: close + 1, args: args, text: text, kind: kind });
  }
  calls.forEach(function (call) {
    call.line = lineOf(text, call.start);
    call.tag = tagInfo(text, kind, call.args[0]);
    call.props = call.args.length > 1 ? propEntries(text, kind, call.args[1]) : null;
    call.hasTitle = propOf(call, 'title') !== null;
    call.hasAriaLabel = propOf(call, 'aria-label') !== null;
    call.children = call.props ? call.args.slice(2) : call.args.slice(1);
  });
  calls.forEach(function (call) {
    let parent = null;
    calls.forEach(function (other) {
      if (other === call || other.start > call.start || other.end < call.end) return;
      if (!parent || (other.end - other.start) < (parent.end - parent.start)) parent = other;
    });
    call.parent = parent;
  });
  calls.forEach(function (call) { call.calls = calls; call.identity = identityOf(call, text, kind); });
  return { file: file, text: text, kind: kind, calls: calls };
}

const PROP_LABELS = ['label', 'aria-label', 'placeholder', 'value', 'key', 'checked', 'name', 'type'];

/* The prop entry of a call, or null. The value range starts after the colon. */
function propOf(call, name) {
  if (!call.props) return null;
  const found = call.props.filter(function (p) { return p.name === name; })[0];
  return found || null;
}

/* The value of a prop as a fact for the key: the literal when it is one, else the source. */
function propText(call, name) {
  const found = propOf(call, name);
  if (!found) return '-';
  const start = found.valueFrom >= 0 ? found.valueFrom : found.range[0];
  const lits = stringLiterals(call.text, call.kind, start, found.range[1]);
  if (lits.length === 1 &&
      collapse(clean(call.text, call.kind, start, lits[0].start)) === '' &&
      collapse(clean(call.text, call.kind, lits[0].end, found.range[1])) === '') return lits[0].value;
  return collapse(clean(call.text, call.kind, start, found.range[1])) || '-';
}

/* A child that is one plain string literal: the visible label of the control. */
function soleStringChild(call) {
  for (let i = 0; i < call.children.length; i++) {
    const r = call.children[i];
    const lits = stringLiterals(call.text, call.kind, r[0], r[1]);
    if (lits.length === 1 &&
        collapse(clean(call.text, call.kind, r[0], lits[0].start)) === '' &&
        collapse(clean(call.text, call.kind, lits[0].end, r[1])) === '') return lits[0].value;
  }
  return null;
}

/* A tag name is not an identity: the first literal of e('span', ...) is 'span'. */
const TAG_NAMES = ['div', 'span', 'label', 'button', 'input', 'select', 'textarea', 'option', 'svg', 'path', 'a', 'p', 'strong', 'em'];

/* The first string literal the children hold that is not a tag name: the branch of a
   ternary label, or the name of the icon an icon-only button draws. */
function childLiteral(call) {
  for (let i = 0; i < call.children.length; i++) {
    const r = call.children[i];
    const lits = stringLiterals(call.text, call.kind, r[0], r[1]);
    for (let j = 0; j < lits.length; j++) {
      if (TAG_NAMES.indexOf(lits[j].value) < 0) return lits[j].value;
    }
  }
  return null;
}

/* The last child before this one that names something: a span of text, or the
   placeholder/value of the field beside it. It is how the two font inputs of the tile
   toolbar and the three Go buttons of the map boxes tell each other apart. */
function siblingHint(call) {
  const parent = call.parent;
  if (!parent) return null;
  const at = parent.children.indexOf(call.args);
  if (at <= 0) return null;
  for (let i = at - 1; i >= 0; i--) {
    const r = parent.children[i];
    const inner = call.calls.filter(function (c) { return c !== call && c.start >= r[0] && c.end <= r[1]; });
    for (let k = 0; k < inner.length; k++) {
      for (let n = 0; n < 3; n++) {
        const value = propText(inner[k], ['placeholder', 'value', 'label'][n]);
        if (value !== '-') return value;
      }
    }
    const lits = stringLiterals(call.text, call.kind, r[0], r[1]);
    if (lits.length) return lits[lits.length - 1].value;
  }
  return null;
}

/* How the audit names a control: the visible label, else the prop that identifies it,
   else the text of the field next to it, else the handler it calls. */
function identityOf(call, text, kind) {
  const child = soleStringChild(call);
  if (child !== null) return child;
  for (let i = 0; i < 2; i++) {
    const v = propText(call, PROP_LABELS[i]);
    if (v !== '-') return PROP_LABELS[i] + '=' + v;
  }
  for (let i = 2; i < 6; i++) {
    const v = propText(call, PROP_LABELS[i]);
    if (v !== '-') return PROP_LABELS[i] + '=' + v;
  }
  const literal = childLiteral(call);
  if (literal !== null) return literal;
  const sibling = siblingHint(call);
  if (sibling) return sibling;
  const onClick = propOf(call, 'onClick');
  if (onClick) {
    const value = collapse(clean(text, kind, onClick.valueFrom >= 0 ? onClick.valueFrom : onClick.range[0], onClick.range[1]));
    if (/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(value)) return 'onClick=' + value;
  }
  for (let i = 6; i < PROP_LABELS.length; i++) {
    const v = propText(call, PROP_LABELS[i]);
    if (v !== '-') return PROP_LABELS[i] + '=' + v;
  }
  return '-';
}

/* ------------------------------------------------------------
   What counts as explained
   ------------------------------------------------------------ */

function isNative(call) { return call.tag.kind === 'native' || call.tag.kind === 'native-conditional'; }
function isControl(call) {
  if (call.tag.kind === 'native') return CONTROL_TAGS.indexOf(call.tag.tag) >= 0;
  return call.tag.kind === 'native-conditional';
}
function isWrapperSite(call) {
  return call.tag.kind === 'component' &&
    Object.prototype.hasOwnProperty.call(WRAPPERS, call.tag.tag) &&
    WRAPPERS[call.tag.tag] === call.file;
}
function isHeaderOnly(call) {
  return call.tag.kind === 'component' && HEADER_ONLY.indexOf(call.tag.tag) >= 0;
}

/* The body of a wrapper component has to hand props.title to an element, or every call
   site that passes one is a promise the component breaks. */
function forwardsTitle(scan, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(\\s*props\\s*\\)').exec(scan.text);
  if (!m) return false;
  const open = scan.text.indexOf('{', scan.text.indexOf(')', m.index));
  if (open < 0) return false;
  let depth = 0;
  let close = -1;
  for (let i = open; i < scan.text.length; i++) {
    if (scan.kind[i] !== CODE) continue;
    if (scan.text[i] === '{') depth++;
    else if (scan.text[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) return false;
  return scan.calls.some(function (call) {
    if (call.start < open || call.end > close) return false;
    const title = propOf(call, 'title');
    return !!title && /props\.title/.test(title.text);
  });
}

/* Walking up the call chain, not the DOM: an element drawn inside a titled one inherits
   the pointer explanation, unless the titled ancestor is a heading component. */
function titledAncestor(call) {
  let node = call.parent;
  while (node) {
    if (node.hasTitle && !isHeaderOnly(node)) return node;
    node = node.parent;
  }
  return null;
}

function explained(call, forwards) {
  if (isWrapperSite(call)) return call.hasTitle && forwards;
  if (call.hasTitle || call.hasAriaLabel) return true;
  return !!titledAncestor(call);
}

/* ------------------------------------------------------------
   The scan of the modules and the ratchet
   ------------------------------------------------------------ */

function uiFiles() {
  return fs.readdirSync(UI_DIR).filter(function (f) { return /\.js$/.test(f); }).sort();
}

function scanUi() {
  const moduleFiles = uiFiles();
  const scans = moduleFiles.map(function (f) {
    return scanSource(f, fs.readFileSync(path.join(UI_DIR, f), 'utf8'));
  });
  const forwards = {};
  Object.keys(WRAPPERS).forEach(function (name) {
    const scan = scans.filter(function (s) { return s.file === WRAPPERS[name]; })[0];
    forwards[name] = scan ? forwardsTitle(scan, name) : false;
  });
  const gaps = [];
  scans.forEach(function (scan) {
    scan.calls.forEach(function (call) {
      if (isControl(call) && !explained(call, forwards[call.tag.tag])) gaps.push(gapOf(call, 'control'));
      else if (isWrapperSite(call) && !explained(call, forwards[call.tag.tag])) gaps.push(gapOf(call, 'wrapper call'));
    });
  });
  return { scans: scans, forwards: forwards, gaps: withSignatures(gaps) };
}

function gapOf(call, kind) {
  return {
    kind: kind,
    file: call.file,
    line: call.line,
    tag: call.tag.tag,
    label: call.identity,
    className: propText(call, 'className'),
    id: propText(call, 'id')
  };
}

/* The key: file|tag|label|className|id, with #2, #3, ... when two controls of one file
   share all five facts. */
function baseKeyOf(gap) {
  return gap.file + '|' + gap.tag + '|' + gap.label + '|' + gap.className + '|' + gap.id;
}

function withSignatures(gaps) {
  const base = {};
  gaps.forEach(function (gap) {
    const key = baseKeyOf(gap);
    base[key] = (base[key] || 0) + 1;
    gap.baseKey = key;
    gap.key = key;
  });
  const seen = {};
  gaps.forEach(function (gap) {
    if (base[gap.baseKey] < 2) return;
    seen[gap.baseKey] = (seen[gap.baseKey] || 0) + 1;
    gap.key = gap.baseKey + '#' + seen[gap.baseKey];
  });
  return gaps;
}

function describeGap(gap) {
  const facts = [];
  if (gap.className !== '-') facts.push('className "' + gap.className + '"');
  if (gap.id !== '-') facts.push('id "' + gap.id + '"');
  return 'app/assets/js/ui/' + gap.file + ':' + gap.line + ' ' + gap.tag + ' "' + gap.label + '"' +
    (facts.length ? ' (' + facts.join(', ') + ')' : '') +
    ' is a ' + gap.kind + ' with no explanation; give it a title or record "' + (gap.key || baseKeyOf(gap)) + '" in the allowlist';
}

/* ------------------------------------------------------------
   The allowlist
   ------------------------------------------------------------
   One entry per gap the recon found, grouped by the area batch that will close it. */

const ALLOWLIST = {
  /* ---- tile: 32 gaps; batch 184 adds the tooltips and deletes every entry below ---- */
  tile: {
    "ketor-tile-activity.js|button|Tiles|TB + (st.view === 'tiles' ? '' : ' secondary')|-": "\"Tiles\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Map|TB + (st.view === 'map' ? '' : ' secondary')|-": "\"Map\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Goto Hex|kt-btn small|-": "\"Goto Hex\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|key='map' + c.offset|'kt-btn small' + (st.mapScreenBase === c.offset ? '' : ' secondary')|-": "Map: \"key='map' + c.offset\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Go|kt-btn small|-#1": "Map: \"Go\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Go|kt-btn small|-#2": "Map: \"Go\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|placeholder=name this screen|-|-": "Map: input (placeholder=name this screen) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Remember|kt-btn small|-": "Map: \"Remember\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|select|value=st.mapSize|kt-select|-": "Map: select (value=st.mapSize) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|placeholder=tile to place (hex, empty = selected)|-|-": "Map: input (placeholder=tile to place (hex, empty = selected)) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Set|kt-btn small|-": "Map: \"Set\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|textarea|placeholder=your name, or two lines|-|-": "Write text on this screen: textarea (placeholder=your name, or two lines) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|placeholder=start cell (empty = map cursor)|-|-": "Write text on this screen: input (placeholder=start cell (empty = map cursor)) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Write|kt-btn small|-": "Write text on this screen: \"Write\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|value=st.fontBase|-|-#2": "Write text on this screen: input (value=st.fontBase) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|value='0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase()|-|-#2": "Write text on this screen: input (value='0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase()) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|placeholder=palette offset|-|-": "Palette: input (placeholder=palette offset) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Load|kt-btn small|-": "Palette: \"Load\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Export .pal|kt-btn small secondary|-": "Palette: \"Export .pal\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Import|kt-btn small secondary|-": "Palette: \"Import\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|key='pal' + c.offset|'kt-btn small' + (st.paletteOffset === c.offset ? '' : ' secondary')|-": "Palette: \"key='pal' + c.offset\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Write back|kt-btn small|-": "Compressed graphic: \"Write back\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Read ROM|kt-btn small secondary|-": "Compressed graphic: \"Read ROM\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|textarea|placeholder=20 21 22 ... tile bytes, or 32 bytes of BGR555 for a palette (512 for 8bpp)|-|-": "Paste hex from an emulator: textarea (placeholder=20 21 22 ... tile bytes, or 32 bytes of BGR555 for a palette (512 for 8bpp)) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|select|value=targetSt[0]|kt-select|-": "Paste hex from an emulator: select (value=targetSt[0]) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Apply|kt-btn small|-": "Paste hex from an emulator: \"Apply\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Copy tile 0|kt-btn small secondary|-": "Paste hex from an emulator: \"Copy tile 0\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Clear|kt-btn small secondary|-": "Paste hex from an emulator: \"Clear\" button — no tooltip yet; batch 184",
    "ketor-tile-activity.js|select|value=st.format|kt-select|-": "select (value=st.format) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|select|value=st.tiles|kt-select|-": "select (value=st.tiles) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|input|placeholder=hex offset|-|-": "input (placeholder=hex offset) — no tooltip yet; batch 184",
    "ketor-tile-activity.js|button|Go|kt-btn small|-#3": "\"Go\" button — no tooltip yet; batch 184",
  },

  /* ---- font: 2 gaps; batch 185 adds the tooltips and deletes every entry below ---- */
  font: {
    "ketor-tile-activity.js|input|value=st.fontBase|-|-#1": "input (value=st.fontBase) — no tooltip yet; batch 185",
    "ketor-tile-activity.js|input|value='0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase()|-|-#1": "input (value='0x' + (Number(st.fontFirstCode) || 0).toString(16).toUpperCase()) — no tooltip yet; batch 185",
  },

  /* ---- tables: 25 gaps; batch 186 adds the tooltips and deletes every entry below ---- */
  tables: {
    "ketor-table-sidebar.js|input|checked=t.searchMode === 'relative'|-|-": "Search Parameters: input (checked=t.searchMode === 'relative') — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|input|checked=t.searchMode === 'value-scan'|-|-": "Search Parameters: input (checked=t.searchMode === 'value-scan') — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|textarea|placeholder=t.searchMode === 'value-scan' ? 'Values e.g., 41 42 43' : 'text in-game e.g., PRESS START'|kt-textarea|-": "Search Parameters: textarea (placeholder=t.searchMode === 'value-scan' ? 'Values e.g., 41 42 43' : 'text in-game e.g., PRESS START') — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|select|value=|kt-select|-": "Search Parameters: select (value=) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|button|Searching...|kt-btn|-": "Search Parameters: \"Searching...\" button — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|input|checked=t.wildcardEnabled|-|-": "Search Parameters: input (checked=t.wildcardEnabled) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|input|checked=t.byteWidth === 8|-|-": "Search Parameters: input (checked=t.byteWidth === 8) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|input|checked=t.byteWidth === 16|-|-": "Search Parameters: input (checked=t.byteWidth === 16) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|button|Hide Advanced|kt-btn small|-": "Advanced: \"Hide Advanced\" button — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|select|value=t.charset|kt-select|-": "Advanced: select (value=t.charset) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|select|value=t.endianness|kt-select|-": "Advanced: select (value=t.endianness) — no tooltip yet; batch 186",
    "ketor-table-sidebar.js|button|Load .tbl file|kt-btn small|-": "Load .tbl: \"Load .tbl file\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|textarea|placeholder=Edit generated table here (hex=char per line)...|-|-": "textarea (placeholder=Edit generated table here (hex=char per line)...) — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|+ Add|kt-btn small|-": "\"+ Add\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Sort|kt-btn small|-": "\"Sort\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Download .tbl|kt-btn small|-": "\"Download .tbl\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Clear|kt-btn small btn-danger|-": "\"Clear\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|input|value=en.hex|-|-": "input (value=en.hex) — no tooltip yet; batch 186",
    "ketor-table-tab.js|input|value=en.char|-|-": "input (value=en.char) — no tooltip yet; batch 186",
    "ketor-table-tab.js|input|placeholder=note|-|-": "input (placeholder=note) — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Clear|kt-btn small|-": "\"Clear\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Load .tbl to Compare|kt-btn small|-": "\"Load .tbl to Compare\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Clear Compare|kt-btn small btn-danger|-": "\"Clear Compare\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Apply .tbl to Edit Panel|kt-btn|-": "\"Apply .tbl to Edit Panel\" button — no tooltip yet; batch 186",
    "ketor-table-tab.js|button|Applied for ROM|-|-": "\"Applied for ROM\" button — no tooltip yet; batch 186",
  },

  /* ---- textSearch: 23 gaps; batch 187 adds the tooltips and deletes every entry below ---- */
  textSearch: {
    "ketor-search-sidebar.js|button|chevron-down|kt-help-toggle|-": "\"chevron-down\" button — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|input|value=opts.minLength || 3|-|-": "Extraction: input (value=opts.minLength || 3) — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|input|value=opts.maxLength || 1024|-|-": "Extraction: input (value=opts.maxLength || 1024) — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=ASCII fallback|-|-": "Extraction: checkbox row \"ASCII fallback\" — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=DTE/MTE compression|-|-": "Extraction: checkbox row \"DTE/MTE compression\" — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|button|Extracting...|kt-btn|-": "Extraction: \"Extracting...\" button — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|button|Hide Advanced|kt-btn small|-": "Advanced: \"Hide Advanced\" button — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=Strict extractor|-|-": "Advanced: checkbox row \"Strict extractor\" — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=DWE padding byte|-|-": "Advanced: checkbox row \"DWE padding byte\" — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=Text decompression|-|-": "Advanced: checkbox row \"Text decompression\" — no tooltip yet; batch 187",
    "ketor-search-sidebar.js|Check|label=Include compressed (read-only)|-|-": "Advanced: checkbox row \"Include compressed (read-only)\" — no tooltip yet; batch 187",
    "ketor-search-tab.js|input|placeholder=Search original, translation, or offset...|kt-input|-": "input (placeholder=Search original, translation, or offset...) — no tooltip yet; batch 187",
    "ketor-search-tab.js|select|value=filter.type || 'all'|kt-select|-": "select (value=filter.type || 'all') — no tooltip yet; batch 187",
    "ketor-search-tab.js|select|value=filter.assigned || 'all'|kt-select|-": "select (value=filter.assigned || 'all') — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|Clear filters|-|-": "\"Clear filters\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|input|checked=checked === true|-|-": "input (checked=checked === true) — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|Select page|kt-btn small|-": "\"Select page\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|Clear marks|kt-btn small|-": "\"Clear marks\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|<<|kt-btn small|-": "\"<<\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|<|kt-btn small|-": "\"<\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|>|kt-btn small|-": "\">\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|>>|kt-btn small|-": "\">>\" button — no tooltip yet; batch 187",
    "ketor-search-tab.js|button|Add to Group (|kt-btn|-": "\"Add to Group (\" button — no tooltip yet; batch 187",
  },

  /* ---- hex: 14 gaps; batch 188 adds the tooltips and deletes every entry below ---- */
  hex: {
    "ketor-hex-sidebar.js|input|placeholder=gotoBase === 'dec' ? '4096' : '0x1000'|kt-input|-": "Goto Offset: input (placeholder=gotoBase === 'dec' ? '4096' : '0x1000') — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|select|value=gotoBase|kt-select|-": "Goto Offset: select (value=gotoBase) — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Go|kt-btn small|-": "Goto Offset: \"Go\" button — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|select|value=t.searchMode|kt-select|-": "Search: select (value=t.searchMode) — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|input|placeholder=t.searchMode === 'text' ? 'PRESS START' : '4E 45 53'|kt-input|-": "Search: input (placeholder=t.searchMode === 'text' ? 'PRESS START' : '4E 45 53') — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Searching...|kt-btn small|-": "Search: \"Searching...\" button — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Prev|kt-btn small|-": "Search: \"Prev\" button — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Next|kt-btn small|-": "Search: \"Next\" button — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|input|placeholder=Label (optional)|kt-input|-": "input (placeholder=Label (optional)) — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Add Bookmark at Cursor|kt-btn small|-": "\"Add Bookmark at Cursor\" button — no tooltip yet; batch 188",
    "ketor-hex-sidebar.js|button|Clear Bookmarks|kt-btn small|-": "\"Clear Bookmarks\" button — no tooltip yet; batch 188",
    "ketor-hex-tab.js|input|checked=props.layers[it.key] === true|-|-": "input (checked=props.layers[it.key] === true) — no tooltip yet; batch 188",
    "ketor-hex-tab.js|select|value=perRow|kt-select|-": "select (value=perRow) — no tooltip yet; batch 188",
    "ketor-hex-tab.js|select|value=t.viewMode|kt-select|-": "select (value=t.viewMode) — no tooltip yet; batch 188",
  },

  /* ---- translate: 12 gaps; batch 189 adds the tooltips and deletes every entry below ---- */
  translate: {
    "ketor-translate-sidebar.js|Action|label=Open Search Text|-|-": "action button \"Open Search Text\" — no tooltip yet; batch 189",
    "ketor-translate-sidebar.js|Action|label=Edit in Search Text|-|-": "action button \"Edit in Search Text\" — no tooltip yet; batch 189",
    "ketor-translate-tab.js|textarea|placeholder=lineTok ? 'Type the translation, or use Auto Translate. Enter inserts the line break token.' : 'Type the translation, or use Auto Translate'|-|-": "textarea (placeholder=lineTok ? 'Type the translation, or use Auto Translate. Enter inserts the line break token.' : 'Type the translation, or use Auto Translate') — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|Open Search Text|kt-btn|-": "\"Open Search Text\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|Open Hex Editor|kt-btn secondary|-": "\"Open Hex Editor\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|input|placeholder=word or token to find|kt-input|-": "input (placeholder=word or token to find) — no tooltip yet; batch 189",
    "ketor-translate-tab.js|input|placeholder=replacement (empty deletes it)|kt-input|-": "input (placeholder=replacement (empty deletes it)) — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|<<|kt-btn small|-": "\"<<\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|<|kt-btn small|-": "\"<\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|>|kt-btn small|-": "\">\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|button|>>|kt-btn small|-": "\">>\" button — no tooltip yet; batch 189",
    "ketor-translate-tab.js|select|value=freeMode ? 'free' : 'custom'|kt-select|-": "select (value=freeMode ? 'free' : 'custom') — no tooltip yet; batch 189",
  },

  /* ---- groups: 6 gaps; batch 190 adds the tooltips and deletes every entry below ---- */
  groups: {
    "ketor-groups-panel.js|input|value=editVal|-|-": "input (value=editVal) — no tooltip yet; batch 190",
    "ketor-search-tab.js|button|key=g.id|-|-": "\"key=g.id\" button — no tooltip yet; batch 190",
    "ketor-search-tab.js|button|+ New Group...|-|-": "\"+ New Group...\" button — no tooltip yet; batch 190",
    "ketor-search-tab.js|input|placeholder=Group name (e.g. \"Menu\", \"Battle Lines\")|kt-input|-": "input (placeholder=Group name (e.g. \"Menu\", \"Battle Lines\")) — no tooltip yet; batch 190",
    "ketor-search-tab.js|button|Cancel|kt-btn secondary|-": "\"Cancel\" button — no tooltip yet; batch 190",
    "ketor-search-tab.js|button|Create & Assign|kt-btn|-": "\"Create & Assign\" button — no tooltip yet; batch 190",
  },

  /* ---- chrome: 7 gaps; batch 191 adds the tooltips and deletes every entry below ---- */
  chrome: {
    "ketor-editor.js|button|key=a.id|kt-btn|-": "\"key=a.id\" button — no tooltip yet; batch 191",
    "ketor-kebab-menu.js|button|kt-kebab-chevron|kt-kebab-section-header|-": "\"kt-kebab-chevron\" button — no tooltip yet; batch 191",
    "ketor-kebab-menu.js|button|key=item.id|kt-dropdown-item|-": "\"key=item.id\" button — no tooltip yet; batch 191",
    "ketor-menubar.js|button|kt-dropdown-check|kt-dropdown-item|-": "\"kt-dropdown-check\" button — no tooltip yet; batch 191",
    "ketor-menubar.js|button|key=menu.id|'kt-menubar-item' + (openMenu === menu.id ? ' active' : '')|-": "\"key=menu.id\" button — no tooltip yet; batch 191",
    "ketor-sidebar.js|button|chevron|'kt-sidebar-section-header' + (collapsed ? ' collapsed' : '')|-": "\"chevron\" button — no tooltip yet; batch 191",
    "ketor-workbench.js|button|close|icon-btn|-": "\"close\" button — no tooltip yet; batch 191",
  },

  /* ---- dialog: 2 gaps; batch 192 adds the tooltips and deletes every entry below ---- */
  dialog: {
    "ketor-workbench.js|input|checked=props.currentTheme === th.id|-|-": "input (checked=props.currentTheme === th.id) — no tooltip yet; batch 192",
    "ketor-workbench.js|button|Done|kt-btn secondary|-": "\"Done\" button — no tooltip yet; batch 192",
  },

  /* ---- patch: 2 gaps; batch 193 adds the tooltips and deletes every entry below ---- */
  patch: {
    "ketor-patch-activity.js|button|Export ROM|kt-btn small|-": "\"Export ROM\" button — no tooltip yet; batch 193",
    "ketor-patch-activity.js|button|Export IPS|kt-btn small secondary|-": "\"Export IPS\" button — no tooltip yet; batch 193",
  },

  /* ---- about: 1 gap; batch 194 adds the tooltips and deletes every entry below ---- */
  about: {
    "ketor-about.js|button|Close|kt-btn secondary|-": "\"Close\" button — no tooltip yet; batch 194",
  },

  /* ---- panel: 1 gap; batch 195 adds the tooltips and deletes every entry below ---- */
  panel: {
    "ketor-panel.js|button|key=tab.id|'kt-panel-tab' + (activeTab === tab.id ? ' active' : '')|-": "\"key=tab.id\" button — no tooltip yet; batch 195",
  },
};

/* Every entry of every area, keyed by the audit signature, with the area and the reason
   kept beside it so a failure can say where the entry lives and which batch owns it. */
function allowlistPairs() {
  const pairs = [];
  Object.keys(ALLOWLIST).forEach(function (area) {
    Object.keys(ALLOWLIST[area]).forEach(function (key) {
      pairs.push({ key: key, area: area, reason: ALLOWLIST[area][key] });
    });
  });
  return pairs;
}

function allowlistIndex() {
  const flat = {};
  allowlistPairs().forEach(function (pair) { flat[pair.key] = pair; });
  return flat;
}

function duplicateAllowlistKeys() {
  const seen = {};
  return allowlistPairs().filter(function (pair) {
    if (seen[pair.key]) return true;
    seen[pair.key] = true;
    return false;
  }).map(function (pair) { return pair.key; });
}

/* ------------------------------------------------------------
   The tests
   ------------------------------------------------------------ */

suite.test('every control in app/assets/js/ui explains itself, or is a recorded gap', function () {
  const scan = scanUi();
  const allowed = allowlistIndex();
  const unrecorded = scan.gaps.filter(function (gap) { return !allowed[gap.key]; });
  assertEqual(unrecorded.length, 0, unrecorded.map(describeGap).join('; '));
});

suite.test('the allowlist holds no stale entry', function () {
  const scan = scanUi();
  const allowed = allowlistIndex();
  const open = {};
  scan.gaps.forEach(function (gap) { open[gap.key] = true; });
  const stale = Object.keys(allowed).filter(function (key) { return !open[key]; });
  assertEqual(stale.length, 0, stale.map(function (key) {
    return '"' + key + '" (' + allowed[key].area + ': ' + allowed[key].reason + ') no longer names a control ' +
      'without a title; the batch that added the title or removed the control has to delete the entry';
  }).join('; '));
});

suite.test('no two areas claim the same control', function () {
  const duplicates = duplicateAllowlistKeys();
  assertEqual(duplicates.length, 0,
    'the allowlist names ' + duplicates.join(', ') + ' twice; one area has to give the entry up');
});

suite.test('the three wrapper components still forward props.title to an element', function () {
  const scan = scanUi();
  Object.keys(WRAPPERS).forEach(function (name) {
    assert(scan.forwards[name] === true,
      'the body of ' + name + ' in app/assets/js/ui/' + WRAPPERS[name] + ' does not hand props.title to an element; ' +
      'every call site that passes a title would lose it');
  });
});

suite.test('the scan still reads the modules it guards', function () {
  const scan = scanUi();
  const controls = [];
  let wrapperSites = 0;
  let conditional = 0;
  let ariaOnly = 0;
  scan.scans.forEach(function (s) {
    s.calls.forEach(function (call) {
      if (isControl(call)) {
        controls.push(call);
        if (call.tag.kind === 'native-conditional') conditional++;
        if (call.hasAriaLabel && !call.hasTitle) ariaOnly++;
      }
      if (isWrapperSite(call)) wrapperSites++;
    });
  });
  assert(scan.scans.length >= 25, 'the scan read only ' + scan.scans.length + ' modules under app/assets/js/ui');
  assert(controls.length >= 200, 'the scan found only ' + controls.length + ' controls in app/assets/js/ui; ' +
    'the element factory or its alias changed and the audit is watching nothing');
  assert(wrapperSites >= 10, 'the scan found only ' + wrapperSites + ' call sites of Check/Action/LangSelect');
  assert(conditional >= 1, 'the scan no longer reads a conditional tag such as e(item.clickable ? \'button\' : \'div\')');
  assert(ariaOnly >= 1, 'the scan no longer sees an icon button whose only name is its aria-label; the two exceptions in the header would go unnoticed');
});

suite.test('the scanner reads a source sample the way the rules say', function () {
  const sample = [
    "(function () {",
    "  var e = React.createElement;",
    "  function Section(props) { return e('div', null, props.title); }",
    "  function Check(props) { return e('label', { title: props.title }, e('input', { type: 'checkbox' })); }",
    "  function Demo(props) {",
    "    return e('div', null,",
    "      e(Section, { title: 'heading only' }, e('button', { className: 'blind' }, 'Blind')),",
    "      e('div', { title: 'the box' },",
    "        e('button', { type: 'button', title: 'explained' }, 'Own'),",
    "        e('input', { type: 'text' }),",
    "        e(item.clickable ? 'button' : 'div', { title: 'conditional' }, 'Cond'),",
    "        e(Check, { label: 'no title here' }),",
    "        e(Check, { label: 'titled', title: 'row sentence' })",
    "      )",
    "    );",
    "  }",
    "})();"
  ].join('\n');
  const scan = scanSource('ketor-search-sidebar.js', sample);
  const gaps = [];
  let controls = 0;
  scan.calls.forEach(function (call) {
    if (isControl(call)) {
      controls++;
      if (!explained(call, false)) gaps.push(describeGap(gapOf(call, 'control')));
    }
    if (isWrapperSite(call) && !explained(call, forwardsTitle(scan, 'Check'))) {
      gaps.push(describeGap(gapOf(call, 'wrapper call')));
    }
  });
  assertEqual(controls, 5, 'the sample draws five controls: ' + JSON.stringify(scan.calls.map(function (c) { return c.tag.tag; })));
  assertEqual(gaps.length, 2, 'the sample has two gaps, the blind button and the untitled Check: ' + gaps.join('; '));
  assert(gaps[0].indexOf('app/assets/js/ui/ketor-search-sidebar.js:') === 0, 'the failure message has to name the file: ' + gaps[0]);
  assert(/ketor-search-sidebar[.]js:\d+ button/.test(gaps[0]), 'the failure message has to name the line: ' + gaps[0]);
  assert(gaps[0].indexOf('button "Blind"') >= 0, 'the failure message has to name the tag and the label: ' + gaps[0]);
  assert(gaps[1].indexOf('Check "label=no title here"') >= 0, 'the wrapper call site is named by its label prop: ' + gaps[1]);
});

module.exports = {
  suite: suite,
  scanUi: scanUi,
  scanSource: scanSource,
  uiFiles: uiFiles,
  ALLOWLIST: ALLOWLIST
};
