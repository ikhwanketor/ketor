/* ============================================================
   Ketor - Delta Search Core
   ------------------------------------------------------------
   Locates a sample in a ROM by the steps between its characters
   instead of the codes themselves, so a text block whose
   alphabet is still unknown can be found. The delta (relative)
   search technique is the one popularised by Monkey-Moore
   (rjricken, GPL-3.0); this file is an independent Ketor
   implementation of that behaviour and contains no code copied
   from that project.

   Modes: simple_relative, wildcard_relative, value_scan.
   Preview: a 50 character window, '#' wherever the sample cannot
   name the byte, the match kept as close to the middle as the
   ends of the ROM allow.
   ============================================================ */

(function (global) {
  'use strict';

  var K = global.Ketor = global.Ketor || {};
  K.core = K.core || {};

  var WINDOW = 50;              /* characters shown in a preview */
  var UNKNOWN = '#';            /* a slot the sample gives no character for */
  var CAPITAL_A = 65;
  var SMALL_A = 97;
  var ALPHABET = 26;
  var BYTE_MASK = 0xFF;
  var STEP_FLOOR = -255;        /* a step between two 8 bit values */
  var STEP_CEIL = 255;
  var DEFAULT_LIMIT = 200;

  function isCapital(code) { return code >= CAPITAL_A && code <= CAPITAL_A + ALPHABET - 1; }
  function isSmall(code) { return code >= SMALL_A && code <= SMALL_A + ALPHABET - 1; }

  /* The sample as numbers: one code unit per character. */
  function codeUnits(text) {
    var codes = [];
    for (var i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));
    return codes;
  }

  /* The steps a run of numbers walks: steps[k] is what has to be added to the k-th
     number to reach the one after it. A sample of one number walks nowhere. */
  function stepsOf(numbers) {
    var steps = [];
    for (var i = 1; i < numbers.length; i++) steps.push(numbers[i] - numbers[i - 1]);
    return steps;
  }

  function slotCount(rom, width) {
    return Math.floor(rom.length / width);
  }

  /* How many slots the ROM holds, and a way to read one of them. A character can be one
     byte or two, and a two byte character can be stored either way round. */
  function makeReader(rom, width, little, slots) {
    if (width === 1) {
      return function (slot) {
        if (slot < 0 || slot >= slots) return -1;
        return rom[slot];
      };
    }
    return function (slot) {
      if (slot < 0 || slot >= slots) return -1;
      var first = rom[slot * 2];
      var second = rom[slot * 2 + 1];
      return little ? (first | (second << 8)) : ((first << 8) | second);
    };
  }

  /* A sample is only a wildcard search when the box asked for wildcards and the sample
     either carries the wildcard character or mixes capital and small letters. A case
     change means the codes of the sample are not the codes in the ROM, so the exact
     values cannot be asked for; the steps still can. */
  function wantsWildcardPath(codes, wildcardCode) {
    var sawWildcard = false;
    var sawCapital = false;
    var sawSmall = false;
    for (var i = 0; i < codes.length; i++) {
      if (wildcardCode && codes[i] === wildcardCode) sawWildcard = true;
      if (isCapital(codes[i])) sawCapital = true;
      else if (isSmall(codes[i])) sawSmall = true;
    }
    return sawWildcard || (sawCapital && sawSmall);
  }

  /* The skip table a delta scan moves on: how far the window may slide when its last
     step does not line up, so that a step that does line up is not slid past. The table
     is indexed by the step itself, kept in the range two 8 bit values can differ by. */
  function makeSkipTable(steps) {
    var edges = steps.length;
    var table = new Int32Array((STEP_CEIL - STEP_FLOOR) + 1);
    for (var i = 0; i < table.length; i++) table[i] = edges;
    for (var k = 0; k < edges - 1; k++) table[steps[k] - STEP_FLOOR] = edges - 1 - k;
    return table;
  }

  function skipDistance(table, read, start, edges) {
    var ahead = read(start + edges);
    var behind = read(start + edges - 1);
    if (ahead < 0 || behind < 0) return edges;
    var delta = ahead - behind;
    if (delta < STEP_FLOOR || delta > STEP_CEIL) return edges;
    var move = table[delta - STEP_FLOOR];
    return move < 1 ? 1 : move;
  }

  /* Plain delta scan: the ROM is walked in windows the length of the sample, comparing
     the steps inside the window with the steps of the sample. The anchor value is read
     off the first character of the match, since only the steps are known up front. */
  function scanPlain(read, slots, codes, limit) {
    var span = codes.length;
    if (span < 2 || slots < span) return [];
    var steps = stepsOf(codes);
    var edges = steps.length;
    var skip = makeSkipTable(steps);
    var hits = [];
    var start = 0;
    var lastStart = slots - span;
    while (start <= lastStart) {
      var lined = true;
      for (var j = edges - 1; j >= 0; j--) {
        var high = read(start + j + 1);
        var low = read(start + j);
        if (high < 0 || low < 0 || high - low !== steps[j]) { lined = false; break; }
      }
      if (lined) {
        var values = {};
        values[String.fromCharCode(codes[0])] = read(start);
        hits.push({ position: start, values: values });
        if (hits.length >= limit) break;
        start += span;
      } else {
        start += skipDistance(skip, read, start, edges);
      }
    }
    return hits;
  }

  /* Wildcard scan: the positions the sample does spell out are compared step by step;
     the wildcard positions are skipped, and the character stored there is simply not
     known. Two spelled out characters are needed for a step to exist at all. */
  function scanMasked(read, slots, codes, wildcardCode, limit) {
    var span = codes.length;
    if (span < 2 || slots < span) return [];
    var spelled = [];
    for (var i = 0; i < span; i++) {
      if (wildcardCode && codes[i] === wildcardCode) continue;
      spelled.push(i);
    }
    if (spelled.length < 2) return [];

    var hops = [];
    for (var k = 1; k < spelled.length; k++) {
      hops.push({
        from: spelled[k - 1],
        to: spelled[k],
        step: codes[spelled[k]] - codes[spelled[k - 1]]
      });
    }

    var hits = [];
    var lastStart = slots - span;
    for (var start = 0; start <= lastStart; start++) {
      var lined = true;
      for (var h = 0; h < hops.length; h++) {
        var here = read(start + hops[h].from);
        var there = read(start + hops[h].to);
        if (here < 0 || there < 0 || there - here !== hops[h].step) { lined = false; break; }
      }
      if (!lined) continue;
      if (read(start + spelled[0]) < 0) continue;
      hits.push({ position: start, values: sampleCharacters(read, start, codes, spelled) });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /* One value per distinct character the sample spells out, read from the match. */
  function sampleCharacters(read, start, codes, spelled) {
    var sampled = {};
    var taken = {};
    for (var q = 0; q < spelled.length; q++) {
      var index = spelled[q];
      var code = codes[index];
      if (taken[code]) continue;
      taken[code] = true;
      var value = read(start + index);
      if (value >= 0) sampled[String.fromCharCode(code)] = value;
    }
    return sampleCharacters.shrinkToCaseBase(sampled);
  }

  /* A sample that changes case cannot say which of the two alphabets the ROM uses, so the
     table is offered as the two bases the sample implies: A and a. The base is the value
     the sample's letter would have if its alphabet started at zero. A sample that names
     no letter at all keeps whatever it sampled. */
  sampleCharacters.shrinkToCaseBase = function (sampled) {
    var capitalBase = null;
    var smallBase = null;
    Object.keys(sampled).forEach(function (ch) {
      var code = ch.charCodeAt(0);
      if (capitalBase === null && isCapital(code)) capitalBase = sampled[ch] - (code - CAPITAL_A);
      if (smallBase === null && isSmall(code)) smallBase = sampled[ch] - (code - SMALL_A);
    });
    var bases = {};
    if (capitalBase !== null) bases['A'] = capitalBase & BYTE_MASK;
    if (smallBase !== null) bases['a'] = smallBase & BYTE_MASK;
    return Object.keys(bases).length > 0 ? bases : sampled;
  };

  /* Value scan: the sample is already a list of numbers, so the same step comparison is
     run over it, and the values of the match are not claimed (the caller supplied them). */
  function scanNumbers(read, slots, wanted, limit) {
    var span = wanted.length;
    if (span < 2 || slots < span) return [];
    var steps = stepsOf(wanted);
    var hits = [];
    var lastStart = slots - span;
    for (var start = 0; start <= lastStart; start++) {
      var lined = true;
      for (var k = 0; k < steps.length; k++) {
        var here = read(start + k);
        var there = read(start + k + 1);
        if (here < 0 || there < 0 || there - here !== steps[k]) { lined = false; break; }
      }
      if (!lined) continue;
      hits.push({ position: start, values: {} });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /* The characters the sample's values stand for. A letter stands for the whole alphabet
     it belongs to, which is what turns a code back into readable text. */
  function makeLegend(values) {
    var legend = {};
    Object.keys(values).forEach(function (ch) {
      var code = ch.charCodeAt(0);
      var value = values[ch];
      if (code === CAPITAL_A || code === SMALL_A) {
        for (var i = 0; i < ALPHABET; i++) legend[value + i] = String.fromCharCode(code + i);
      } else {
        legend[value] = ch;
      }
    });
    return legend;
  }

  function renderWindow(read, slots, anchor, span, values) {
    var lead = Math.floor(WINDOW / 2) - Math.floor(span / 2);
    var from = anchor - lead;
    if (from < 0) from = 0;
    var to = from + WINDOW;
    if (to > slots) {
      to = slots;
      from = Math.max(0, to - WINDOW);
    }
    var legend = makeLegend(values);
    var text = '';
    for (var slot = from; slot < to; slot++) {
      var value = read(slot);
      if (value < 0) { text += UNKNOWN; continue; }
      var ch = legend[value];
      text += ch === undefined ? UNKNOWN : ch;
    }
    return text;
  }

  /* The values column: the code the game stores for each character of the sample, in the
     width and byte order the scan ran in. */
  function labelOf(values, width, little) {
    var keys = Object.keys(values).sort();
    return keys.map(function (key) {
      var hex = (values[key] & BYTE_MASK).toString(16).toUpperCase();
      if (hex.length < 2) hex = '0' + hex;
      if (width === 2) hex = little ? hex + '00' : '00' + hex;
      return key + '=' + hex;
    }).join(' ');
  }

  /* The value list of a value scan. A token is read as a hexadecimal number, with or
     without the 0x marker, the way the sample box has always taken it; a token that is
     no number at all is dropped. */
  function readNumbers(keyword) {
    return keyword.split(/[\s,]+/).filter(Boolean).map(function (token) {
      var value = parseInt(token.replace(/^0x/i, ''), 16);
      return isNaN(value) ? parseInt(token, 10) : value;
    }).filter(function (value) { return Number.isFinite(value); });
  }

  function nothingFound() {
    return { results: [], previewWidth: WINDOW };
  }

  function runMonkeyMoore(romBytes, options) {
    var settings = options || {};
    var mode = settings.mode || 'relative';
    var keyword = String(settings.keyword || '');
    var wildcardChar = String(settings.wildcardChar || '*');
    var wildcardsOn = settings.wildcardEnabled === true;
    var width = settings.byteWidth === 16 ? 2 : 1;
    var little = settings.endianness !== 'big';
    var limit = Math.max(1, Number(settings.maxResults) || DEFAULT_LIMIT);

    var rom = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes || []);
    var slots = slotCount(rom, width);
    var read = makeReader(rom, width, little, slots);

    var sample;
    var hits;
    if (mode === 'value-scan') {
      var wanted = readNumbers(keyword);
      if (wanted.length < 2) return nothingFound();
      sample = wanted;
      hits = scanNumbers(read, slots, wanted, limit);
    } else {
      var codes = codeUnits(keyword);
      if (codes.length < 2) return nothingFound();
      var wildcardCode = wildcardsOn && wildcardChar.length > 0 ? wildcardChar.charCodeAt(0) : 0;
      sample = codes;
      hits = wantsWildcardPath(codes, wildcardCode)
        ? scanMasked(read, slots, codes, wildcardCode, limit)
        : scanPlain(read, slots, codes, limit);
    }

    var results = [];
    for (var i = 0; i < hits.length; i++) {
      results.push({
        offset: hits[i].position * width,
        values: hits[i].values,
        valuesLabel: labelOf(hits[i].values, width, little),
        preview: renderWindow(read, slots, hits[i].position, sample.length, hits[i].values)
      });
    }
    return { results: results, previewWidth: WINDOW };
  }

  K.core.runMonkeyMoore = runMonkeyMoore;

})(window);
