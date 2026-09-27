/* The Hex Editor writing past the end of the loaded file.

   A relocation has to grow the image: the bytes it moves land after the last byte of the
   file, and the patch layer is where the whole application writes. Batch 52 added the
   appended tail and Export support for it, but setByte kept its old bound - the write was
   refused as soon as the offset reached the end of the image - so the tail never grew and
   the caller could not tell: a relocation plan that appended wrote nothing and still
   reported a move. The gates below are byte for byte: write one byte past 0x40000, and the
   image is the loaded 0x40000 bytes, the zeroes that make room for it, and the byte itself,
   with the loaded buffer untouched; write a second byte further out and the image reaches
   it; undo twice and the image is the loaded file again, all 262144 bytes of it. The
   regression at the end goes through the tile editor's own relocation, which is where the
   grown image is actually used.

   The last case is the one the bug was found through: the tile editor moves a region to
   free space, and when the only room left is past the end of the file the move used to
   apply zero of its planned writes while the status called it done.

   Clear insert is the other side of the tail: an insert that made the image longer owns
   those extra bytes, so discarding it has to take them out too. It used to remove only the
   inserted patches, and the appended tail stayed in the image and in Export. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWorkbench } = require('./helpers/workbench');
const { buildSyntheticRom } = require('./helpers/synthetic-rom');
const { createSuite } = require('./helpers/tiny-test');

const suite = createSuite('hex-append');

const ROM_SIZE = 0x40000;
const PATCHED = 0x100;        // a byte of the loaded file, for the delete-patch regression
const FIRST = 0x40010;        // one byte past the end, with a zero run in front of it
const SECOND = 0x40020;       // a second write, further out
const REGION = 0x2000;        // the fixture's record region: real content to move

function openRom() {
  const env = loadWorkbench();
  const fixture = buildSyntheticRom({ records: 48 });
  env.K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  return { env: env, fixture: fixture, K: env.K };
}

/* The two files the relocation case needs and the workbench does not load, because no
   earlier suite reached them: the pointer map that plans the move and the console
   profiles that name the bus. The workbench page loads both before the tile activity. */
function loadCore(env, file) {
  const full = path.join(env.REPO, 'app', 'assets', 'js', 'core', file);
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), env.win, { filename: full });
}

/* The first offset where the two images differ, or -1. Every byte is looked at, so "the
   image is the loaded file again" means all 262144 of them and not just the length. */
function firstDifference(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if ((a[i] & 0xFF) !== (b[i] & 0xFF)) return i;
  return -1;
}

suite.test('a byte past the end of the file grows the image, zero filled up to it', function (t) {
  const { K } = openRom();
  const source = K.hex.getSourceBytes();
  t.assertEqual(source.length, ROM_SIZE, 'the fixture is 0x40000 bytes');
  const lastSixteen = source.slice(ROM_SIZE - 16);
  t.assertEqual(K.hex.appendedLength(), 0, 'nothing is appended before the write');

  t.assertEqual(K.hex.setByte(FIRST, 0x5A), true, 'a write past the end is taken, not refused');

  t.assertEqual(K.hex.appendedLength(), 0x11, 'the tail grew to hold the offset that was written');
  t.assertEqual(K.hex.imageLength(), 0x40011, 'and the image reaches it');
  const image = K.hex.getPatchedBytes();
  t.assertEqual(image.length, 0x40011, 'getPatchedBytes returns the grown image');
  t.assertEqual(image[FIRST], 0x5A, 'with the byte that was written in it');
  for (let i = ROM_SIZE; i < FIRST; i++) t.assertEqual(image[i], 0x00, 'gap byte 0x' + i.toString(16) + ' is zero');
  t.assertEqual(K.hex.currentByte(FIRST), 0x5A, 'the editor reads the new byte back');
  t.assertEqual(K.hex.isPatched(FIRST), true, 'an appended byte is a changed byte');
  t.assertEqual(firstDifference(source.subarray(ROM_SIZE - 16), lastSixteen), -1, 'the last 16 bytes of the loaded file did not move');
  t.assertEqual(source.length, ROM_SIZE, 'and the loaded file did not grow: the write only made an image');
});

suite.test('the export carries the appended byte in a file of the grown length', function (t) {
  const { env, K } = openRom();
  let offered = null;
  env.win.Blob = function (parts) { offered = parts[0]; };
  K.hex.setByte(FIRST, 0x5A);

  K.hex.exportPatchedRom();

  t.assert(offered, 'the export offered a file to the browser');
  t.assertEqual(offered.length, 0x40011, 'of the length the image grew to');
  t.assertEqual(offered[FIRST], 0x5A, 'holding the appended byte');
  t.assertEqual(offered[ROM_SIZE - 1], K.hex.getSourceBytes()[ROM_SIZE - 1], 'and the loaded bytes where they were');
  t.assert(K.hex.getState().status.indexOf('Exported') >= 0, 'and says what it wrote: ' + K.hex.getState().status);
});

suite.test('a second write further out grows the image to that offset too', function (t) {
  const { K } = openRom();
  K.hex.setByte(FIRST, 0x5A);

  t.assertEqual(K.hex.setByte(SECOND, 0x77), true, 'the second write is taken');

  t.assertEqual(K.hex.imageLength(), 0x40021, 'the image reaches the second offset');
  const image = K.hex.getPatchedBytes();
  t.assertEqual(image[FIRST], 0x5A, 'the first appended byte is still there');
  t.assertEqual(image[SECOND], 0x77, 'and so is the second');
  for (let i = FIRST + 1; i < SECOND; i++) t.assertEqual(image[i], 0x00, 'the run between them is zero at 0x' + i.toString(16));
});

suite.test('undo takes the growth back, byte for byte, and redo grows it again', function (t) {
  const { K } = openRom();
  const source = K.hex.getSourceBytes();
  K.hex.setByte(FIRST, 0x5A);
  K.hex.setByte(SECOND, 0x77);

  t.assertEqual(K.hex.undo(), true, 'the second write is one undo step');
  t.assertEqual(K.hex.imageLength(), 0x40011, 'and the tail that write grew goes away with it');
  t.assertEqual(K.hex.getPatchedBytes()[FIRST], 0x5A, 'the first appended byte is still there');

  t.assertEqual(K.hex.undo(), true, 'the first write is the next undo step');
  t.assertEqual(K.hex.appendedLength(), 0, 'and the image holds no appended byte again');
  const back = K.hex.getPatchedBytes();
  t.assertEqual(back.length, source.length, 'the image is as long as the loaded file again');
  t.assertEqual(firstDifference(back, source), -1, 'and every one of its bytes is the loaded file');

  t.assertEqual(K.hex.redo(), true, 'redo puts the first write back');
  t.assertEqual(K.hex.imageLength(), 0x40011, 'with the room it needs');
  t.assertEqual(K.hex.getPatchedBytes()[FIRST], 0x5A, 'and the byte it wrote');
  t.assertEqual(K.hex.redo(), true, 'and then the second');
  t.assertEqual(K.hex.imageLength(), 0x40021, 'which reaches its own offset again');
  t.assertEqual(K.hex.getPatchedBytes()[SECOND], 0x77, 'with the byte it wrote');
});

suite.test('writing the value a loaded byte already holds still deletes the patch', function (t) {
  const { K } = openRom();
  const source = K.hex.getSourceBytes();
  const original = source[PATCHED];

  t.assertEqual(K.hex.setByte(PATCHED, original ^ 0xFF), true, 'the byte is patched away from its original value');
  t.assertEqual(K.hex.isPatched(PATCHED), true, 'so it is a patch');
  t.assertEqual(K.hex.setByte(PATCHED, original), true, 'writing the original value back is a change from the patch');
  t.assertEqual(K.hex.isPatched(PATCHED), false, 'and it deletes the patch, the way it always did');
  t.assertEqual(K.hex.getPatchedBytes()[PATCHED], original, 'the image holds the loaded byte again');
  t.assertEqual(K.hex.setByte(PATCHED, original), false, 'writing it once more is not a change at all');
});

suite.test('writing an appended byte its own value again keeps the appended data', function (t) {
  const { K } = openRom();
  K.hex.setByte(FIRST, 0x5A);

  t.assertEqual(K.hex.setByte(FIRST, 0x5A), false, 'the same value is not a second write');

  t.assertEqual(K.hex.appendedLength(), 0x11, 'and the appended byte is still there');
  t.assertEqual(K.hex.getPatchedBytes()[FIRST], 0x5A, 'holding the value it was given');
});

suite.test('the compiled view still refuses every write, growth included', function (t) {
  const { K } = openRom();
  K.hex.setCompiledRom(new Uint8Array(ROM_SIZE), {});
  t.assertEqual(K.hex.setViewSource('compiled'), true, 'the inserted image is on screen');

  t.assertEqual(K.hex.setByte(PATCHED, 0x11), false, 'a byte of the compiled image is refused');
  t.assertEqual(K.hex.setByte(FIRST, 0x11), false, 'and so is one past the end of the loaded file');
  t.assertEqual(K.hex.imageLength(), ROM_SIZE, 'nothing was appended');
  t.assertEqual(K.hex.isPatched(PATCHED), false, 'and no patch was recorded');
  t.assertEqual(K.hex.getState().status, 'This is the inserted ROM.', 'the refusal still says why');
});

/* The path the bug was reported through. The tile editor moves a region with
   core/pointer-map.js; with every untouched run inside the file painted over, the only
   room the plan can offer is past the end, and that is the plan whose writes used to be
   refused one by one while the status reported the move as done. */
suite.test('a relocation that appends writes the bytes it planned, not a status line', function (t) {
  const env = loadWorkbench();
  loadCore(env, 'pointer-map.js');
  loadCore(env, 'console-profiles.js');
  const fixture = buildSyntheticRom({ records: 48 });
  /* The fixture leaves the tail of the file as zeroes, which is free space; filling it
     with 0xAA leaves no run big enough for the payload inside the file. */
  fixture.rom.fill(0xAA, fixture.region.end);
  const K = env.K;
  K.hex.setRomFromLoad({ data: fixture.rom, name: 'synthetic.gba', size: fixture.rom.length }, 'GBA');
  K.tile.setRegion(REGION);
  K.tile.setFormat('gba-4bpp');
  const source = K.hex.getSourceBytes();
  const payload = source.slice(REGION, REGION + 32);

  const plan = K.tile.repointRegion(1);

  t.assert(plan && plan.ok, 'the move was planned');
  t.assertEqual(plan.bytes, 32, 'one 4bpp tile is the payload');
  t.assertEqual(plan.grows, true, 'and the plan had to append: there is no room inside the file');
  t.assertEqual(plan.newOffset, ROM_SIZE, 'so it lands at the end of the loaded file');

  const status = K.tile.getState().status;
  /* A write that changes nothing is not counted, so the report is compared against the
     payload the move had to write rather than against every planned word. */
  const written = /(\d+) byte\(s\) written/.exec(status);
  t.assert(written, 'the move reports how many bytes it wrote: ' + status);
  t.assert(Number(written[1]) >= plan.bytes,
    'the whole payload of ' + plan.bytes + ' byte(s) was written, not zero of them ('
      + written[1] + ' of ' + plan.writes.length + ' planned): ' + status);
  t.assert(status.indexOf('appended at the end') >= 0, 'and the move is reported as an append: ' + status);

  t.assertEqual(K.hex.imageLength(), ROM_SIZE + plan.bytes, 'the image grew by exactly the payload');
  const image = K.hex.getPatchedBytes();
  t.assertEqual(firstDifference(image.subarray(ROM_SIZE, ROM_SIZE + plan.bytes), payload), -1,
    'and holds the bytes the region held');
  t.assertEqual(K.core.readPointer(image, 0x1000, 'gba'), plan.newBusAddress,
    'the pointer that named the region was redirected to where it moved');

  let guard = 0;
  while (K.hex.undo() && guard < 256) guard++;
  t.assertEqual(K.hex.imageLength(), ROM_SIZE, 'undoing the move takes the appended bytes back out');
  t.assertEqual(firstDifference(K.hex.getPatchedBytes(), source), -1, 'and the image is the loaded file again');
});

/* ---------- Clear insert gives the tail back ---------- */

/* The tail an inserted image added is part of the insert. This is the path the Translation
   activity drives: a compiled image longer than the file is applied as patches over the
   loaded ROM, the extra bytes become the appended tail, and Clear insert has to leave the
   loaded file behind - length and all 262144 bytes of it. */
suite.test('Clear insert takes the appended tail an inserted image added out of the image', function (t) {
  const { K } = openRom();
  const source = K.hex.getSourceBytes();
  const TAIL = 0x20;
  const image = new Uint8Array(ROM_SIZE + TAIL);
  image.set(source);
  image[PATCHED] = source[PATCHED] ^ 0xFF;      // a byte the insert rewrote inside the file
  image[REGION] = source[REGION] ^ 0x5A;        // and a second one, further in
  for (let i = 0; i < TAIL; i++) image[ROM_SIZE + i] = 0x40 + i;   // the bytes a longer image added

  t.assertEqual(K.hex.adoptInsertedRom(image, { relocations: [{ from: REGION, to: ROM_SIZE }] }), true,
    'the longer inserted image is applied as patches over the loaded ROM');
  t.assertEqual(K.hex.appendedLength(), TAIL, 'and its extra bytes are the appended tail');
  t.assertEqual(K.hex.imageLength(), ROM_SIZE + TAIL, 'so the image is longer than the loaded file');
  t.assertEqual(K.hex.getPatchedBytes()[ROM_SIZE + 3], 0x43, 'the tail is in the image');
  t.assertEqual(K.hex.isPatched(ROM_SIZE + 3), true, 'and counts as a changed byte');

  K.hex.discardInsert();

  t.assertEqual(K.hex.appendedLength(), 0, 'Clear insert empties the appended tail');
  t.assertEqual(K.hex.getAppended(), null, 'the tail itself is gone, not just its length');
  t.assertEqual(K.hex.imageLength(), ROM_SIZE, 'and the image is as long as the loaded ROM again');
  const back = K.hex.getPatchedBytes();
  t.assertEqual(back.length, ROM_SIZE, 'getPatchedBytes returns a file of that length');
  t.assertEqual(firstDifference(back, source), -1, 'and every one of its 262144 bytes is the loaded file');
  t.assertEqual(K.hex.isPatched(ROM_SIZE + 3), false, 'a byte that only existed in the tail is not a patch any more');
  t.assertEqual(K.hex.isPatched(PATCHED), false, 'and neither is the byte inside the file the insert rewrote');
  t.assertDeepEqual(K.hex.getInsertedOffsets(), {}, 'nothing is owned by the insert any more');
});

/* A write the editor made past the end of the file is in the same tail, and Clear insert
   takes it with the insert. The history step that grew it goes too: the bytes it names no
   longer exist, so undoing it would grow the zero run back. */
suite.test('Clear insert drops the appended bytes the editor wrote, and undo cannot grow them back', function (t) {
  const { K } = openRom();
  const source = K.hex.getSourceBytes();
  t.assertEqual(K.hex.setByte(FIRST, 0x5A), true, 'the editor writes a byte past the end of the file');
  t.assertEqual(K.hex.appendedLength(), 0x11, 'which grows the appended tail');
  t.assertEqual(K.hex.setByte(PATCHED, source[PATCHED] ^ 0xFF), true, 'and an ordinary patch inside the file');

  K.hex.discardInsert();

  t.assertEqual(K.hex.appendedLength(), 0, 'Clear insert takes the whole tail out');
  t.assertEqual(K.hex.imageLength(), ROM_SIZE, 'so the image is the loaded ROM again');
  t.assertEqual(K.hex.getPatchedBytes().length, ROM_SIZE, 'and getPatchedBytes returns a file of that length');
  t.assertEqual(K.hex.getPatchedBytes()[PATCHED], source[PATCHED] ^ 0xFF,
    'the patch inside the file survives: it is an ordinary edit, not the insert');

  t.assertEqual(K.hex.undo(), true, 'the in-file patch is still an undo step');
  t.assertEqual(K.hex.getPatchedBytes()[PATCHED], source[PATCHED], 'and undoing it restores the loaded byte');
  t.assertEqual(K.hex.undo(), false, 'the step that grew the tail is gone with the bytes it named');
  t.assertEqual(K.hex.imageLength(), ROM_SIZE, 'so no undo grows an empty tail back');
  t.assertEqual(firstDifference(K.hex.getPatchedBytes(), source), -1, 'and the image is still the loaded file');
});

module.exports = { suite: suite };
