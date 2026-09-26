/* A rom built for the test, with the shape the engine has to handle.

   Four things are laid out on purpose: a message table of four byte little endian
   pointers based at 0x08000000, records that each start with a two byte header
   (01 00) in front of the text and close with 05 09 0A, the padding after every
   record that a grown message can borrow, and a large area of zeroes at the end
   that holds nothing a pointer aims at, so a record may live there.

   The shape is modelled on Castlevania - Aria of Sorrow, whose table and record
   format were worked out from the original rom, a crashing build and the
   indonesian translation patch, so a test written against this fixture exercises
   the same code path as the real project. */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?';
const HEADER = [0x01, 0x00];
const TRAILER = [0x05, 0x09, 0x0A];

function sentence(index, length) {
  let out = 'MESSAGE ' + String(index + 100).padStart(3, '0') + ' SAYS ';
  while (out.length < length - 1) {
    out += CHARS[(index * 7 + out.length * 3) % CHARS.length];
  }
  return out.slice(0, length - 1) + '.';
}

/* One table line per byte the text uses, plus the two control tokens. A pure single
   byte table keeps the engine on the GBA non padding profile, which is the one the
   real project uses. */
function tableContent() {
  const lines = [];
  for (let i = 0; i < 256; i++) {
    const ch = String.fromCharCode(i);
    if (/[A-Za-z0-9 .,!?]/.test(ch) && i >= 0x20 && i < 0x7F) lines.push(i.toString(16).toUpperCase().padStart(2, '0') + '=' + ch);
  }
  lines.push('05 09 0A=[END]');
  lines.push('05 09=[LINE]');
  lines.push('00=[NULL]');
  return lines.join('\n') + '\n';
}

function buildSyntheticRom(options) {
  const opts = options || {};
  const recordCount = opts.records === undefined ? 48 : opts.records;
  const textLength = opts.textLength === undefined ? 48 : opts.textLength;
  const romSize = opts.romSize === undefined ? 0x40000 : opts.romSize;
  const tableAt = opts.tableAt === undefined ? 0x1000 : opts.tableAt;
  const regionAt = opts.regionAt === undefined ? 0x2000 : opts.regionAt;
  const stride = opts.stride === undefined ? 64 : opts.stride;
  const base = 0x08000000;

  const rom = new Uint8Array(romSize);
  /* Not free space: the allocator looks for runs of 0x00, 0xFF and the end code, and
     a test that wants the records to land after the table should not have to care
     which run wins. */
  rom.fill(0xAA, 0, regionAt + recordCount * stride);
  const records = [];
  const texts = [];

  for (let i = 0; i < recordCount; i++) {
    const head = regionAt + i * stride;
    const textStart = head + HEADER.length;
    const text = sentence(i, textLength);
    rom.set(HEADER, head);
    for (let k = 0; k < text.length; k++) rom[textStart + k] = text.charCodeAt(k);
    rom.set(TRAILER, textStart + text.length);
    /* The padding after the end code is what a grown message borrows when the shift
       path is asked for, and the engine only borrows zeroes, so the record is padded
       the way the real project pads its own. */
    rom.fill(0x00, textStart + text.length + TRAILER.length, head + stride);
    const byteLength = text.length + TRAILER.length;
    records.push({ index: i, head: head, textStart: textStart, byteLength: byteLength, text: text });
    texts.push({
      startByte: textStart,
      offset: textStart,
      byteLength: byteLength,
      originalText: text,
      translatedText: '',
      comment: '',
      textType: 'dialogue',
      buildable: true,
      source: 'synthetic'
    });
    rom[tableAt + i * 4] = head & 0xFF;
    rom[tableAt + i * 4 + 1] = (head >> 8) & 0xFF;
    rom[tableAt + i * 4 + 2] = (head >> 16) & 0xFF;
    rom[tableAt + i * 4 + 3] = ((head >> 24) | 0x08) & 0xFF;
  }

  const project = {
    format: 'ketor-project',
    version: 1,
    rom: { name: 'synthetic.gba', size: romSize, system: 'GBA' },
    table: { name: 'synthetic.tbl', entryCount: 0, content: tableContent() },
    groups: [],
    texts: texts
  };

  return {
    rom: rom,
    project: project,
    records: records,
    count: recordCount,
    table: { at: tableAt, count: recordCount, entrySize: 4, stride: 4, endianness: 'little', base: base },
    region: { start: regionAt, end: regionAt + recordCount * stride },
    trailer: TRAILER,
    header: HEADER,
    base: base
  };
}

function readTable(image, table) {
  const out = [];
  for (let i = 0; i < table.count; i++) {
    const at = table.at + i * 4;
    if (at + 4 > image.length) break;
    const value = ((image[at] | (image[at + 1] << 8) | (image[at + 2] << 16) | (image[at + 3] << 24)) >>> 0) - table.base;
    out.push(value);
  }
  return out;
}

/* Reads the finished image the way the game would: follow every entry, and report a
   record as broken when it lost its header or never closes with the end code. */
function inspectRecords(image, fixture, originalRom) {
  const targets = readTable(image, fixture.table);
  const report = { entries: targets.length, broken: [], moved: 0, inPlace: 0, outside: 0 };
  for (let i = 0; i < targets.length; i++) {
    const at = targets[i];
    const originalHead = fixture.records[i].head;
    if (!(at >= 0) || at + 4 > image.length) { report.outside++; report.broken.push({ index: i, reason: 'outside the rom', at: at }); continue; }
    if (at === originalHead) report.inPlace++; else report.moved++;
    const headerKept = image[at] === originalRom[originalHead] && image[at + 1] === originalRom[originalHead + 1];
    let closes = false;
    const limit = Math.min(image.length, at + 0x400);
    for (let p = at; p < limit; p++) {
      if (image[p] === fixture.trailer[0] && image[p + 1] === fixture.trailer[1] && image[p + 2] === fixture.trailer[2]) { closes = true; break; }
    }
    if (!headerKept) report.broken.push({ index: i, reason: 'header lost', at: at });
    else if (!closes) report.broken.push({ index: i, reason: 'never closes', at: at });
  }
  return report;
}

module.exports = { buildSyntheticRom, readTable, inspectRecords, tableContent };
