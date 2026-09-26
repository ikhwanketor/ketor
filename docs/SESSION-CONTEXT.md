# Ketor - session context (read this first)

This file exists because context kept getting lost between rounds: the same requirement
was explained again by the user, and the same mistake was made twice. It holds what the
user asked for, every correction they gave, the decisions taken with their evidence, and
where the work stands. Read it before touching anything.

## 1. What the user is building and why

A browser-only ROM translation suite (hex, text, tables, groups, translation, insert,
patch) that must be usable by a **lay user** and still precise enough for a professional.
Their own project is **Castlevania: Aria of Sorrow (USA)** (151,417 extracted texts)
translated into Indonesian.

Standing instructions, given more than once:

- Work continuously, **without asking for confirmation** ("lanjutkan", "kerjakan semuanya dulu").
- **Never push.** The user pushes to GitHub themselves.
- **One batch = one commit**, and keep PRD_KETOR_BATCH16-20.md (workspace root, outside the
  repo) updated for the next agent.
- Do not touch app/index.html (the old production UI).
- If something cannot be verified, say so; never ship unverified logic.

## 2. Every correction the user gave (chronological, with what it meant)

| The user said (paraphrased) | What it meant | What was done |
|---|---|---|
| "app belum akurat" | pointer relocation must be correct, not approximate | known pointer table trusted, self check made fatal (batches 82-91) |
| "kalau hanya satu group saja yang bisa dimasukkan, apa fungsinya group?" | **Insert All must handle thousands of texts** | search battery skipped when the table names the record; free space mapped once; 400 texts in 15 s (batch 92) |
| "kenapa tidak pakai kombinasi geser dan relocate: geser dulu, yang gagal di-relocate" | hybrid request | implemented as the default, then measured: shifting **broke 9-16 records** when many grew, and their own log showed it degenerating (batch 95) |
| (their build log) "declared table at 0x229E94 with 124 entries, 118 records broken" | a **graphics** pointer table had been declared as the message table, so the self check read the wrong layout and every shift was rolled back for a reason that was not real | verified profile **always wins**; unconfirmed candidates **refused** (batch 96) |
| (their in-game test) "berhasil dijalankan tapi ada glitch grafik saat mc terkena serangan" | relocated records had been written into a run of zeroes **inside** the file that held sprite tiles | moved records now go **past the end of the rom**; the image grows (batch 96) |
| "insert berhasil tapi export patched rom tidak bisa" | adoptInsertedRom refused an image **longer** than the loaded file | accepts a longer image, keeps the extra bytes as the appended tail (batch 98) |
| "apakah itu benar-benar diperlukan? buat otomatis saja, jangan tampilkan ke user" | the Pointers and Insert Range panel confused lay users | panel deleted; the tool **finds the table itself** at build time (batches 94 to 96) |
| "seharusnya preview menampilkan tampilan real in-game di dalam rom, bukan preview seperti itu" | the page-layout mock is not what they want | investigated: the real picture needs the game own graphics; see section 4 |
| "apakah tidak ada ide gila ... tanpa emulator atau app lain" / "apakah berfungsi untuk semua console" | automatic, universal, no emulator | research and decision: **engine generic, data per game**; game profiles (batch 99) |
| "aku ingin app ini universal bukan salah satu game saja" | do not hardcode AoS | profile mechanism; the panel asks the profile |
| "taruh pointer dan insert range di panel sebelah kanan" then "panel masih sama" then "bodoh maksudku penempatan kotaknya" then "tampilannya ngawur, toolbar jadi hilang tulisannya, sudahlah hilangkan saja" | panel placement in the Translation tab | moved right, then into the tab, then a full-height column, then **the toolbar broke, and the panel was REMOVED at the user request (batch 107)** |

## 3. Decisions that are settled (do not reopen without new evidence)

1. **One way to insert**, and it is the way **both** Kruptar 7 and Atlas work: write the text
   where there is room, rewrite **its own** pointer, move nothing else. Evidence: Kruptar 7
   file 7/MainUnit.pas (Ptrs[J] := $FFFFFFFF and WPBreak := True, then
   ProgressInsertErrorProc(grName, WPLeftSize) - a text that does not fit is reported, not
   shifted); Atlas AtlasFile.cpp (Address = GetAddress(GetPosT(), Size, WritePos) then
   WriteP(&Address, ...)).
2. **Relocated records go past the end of the rom** (the image grows). Interior "free" runs
   are a trap: one held sprite tiles and the game glitched when the player was hit.
3. **A verified profile always beats a declaration**; only a *confirmed* candidate (every
   record closes) may be declared.
4. **Game profiles** carry everything about one game (pointer table, record shape, font,
   window graphics, palette, room table). Absent means *not known yet*, never zero.
5. **No emulator inside the app** (the user rejected it: heavy, and gbajs needs a real GBA
   BIOS which cannot be shipped).

## 4. What the in-game picture still needs (open research)

The screen a player sees is assembled **by the game at run time** (tilesets copied to VRAM,
tilemaps, palettes, window placement, portraits), so it cannot be read out of the rom for an
arbitrary message. Options, cheapest first:

1. **Profile fields** (graphics.font, graphics.window, graphics.palette): with those filled,
   the page can be drawn the way the engine draws it. For AoS they are **empty**: a scan of
   the whole rom (bpp 1/2/4, 8x8 and 16x16, three index rules) found only shapes that fail a
   letter test, most graphics are compressed, and there is **no public disassembly of AoS**.
2. **One save state** gives the font + window + palette for **all** texts (VRAM is
   uncompressed); background and portraits need one capture per scene.
3. **Zelda ALTTP** is the best second target to prove the mechanism, because its data is
   public: snesrev/zelda3 has assets/restool.py (sprite_sheets.decode_font() - the font
   lives inside a sprite sheet) and assets/text_compression.py (the dialogue itself is
   compressed).
4. A per-game reverse engineering project (rooms, tileset, tilemap, palette) is the only
   fully automatic no-emulator route, and it is what map editors do per game (Advance Map,
   Tilemap Studio, DSVania). Not quick.

## 5. Where the work stands

- Branch refactor/ketor-vscode-ui, **60 commits ahead of origin**, tree clean.
- node tests/run-all.js -> **29 gates**, all green. Suites live in tests/ (synthetic rom
  fixture, no dependency, no network).
- Build token in app/workbench-preview.html is **87**. **Bump it on every UI change** or the
  user sees cached files and reports bugs that are already fixed.
- Batches 103 to 107 were the page layout panel: added to the tab, restyled, made a
  full-height column, then **removed** when the column broke the tab toolbar. Batch 107
  restored the tab to the file it had at commit 3308b87.

## 6. Open items, in the order they matter

1. **Insert and Insert All: the user says it is still not solved.** The report used to say
   "1 text(s) relocated" for seven texts that live in **one record** (it counts records);
   the labels were fixed in batch 101. Next: ask for a **fresh build log plus what the game
   shows**, then verify the image itself (all pages of the record present at the new
   address) and compare the scope group path against the all path.
2. **In-game picture** per section 4 (profile fields, a save state, or Zelda first).
3. A universal in-app **font and window picker** that writes into the profile, plus the
   per-console gaps: GB/GBC 2bpp as a first-class tile format, SNES/NDS/PS1 decompressors,
   and the "font inside a sprite sheet" case.
4. Directory restructure by function and console, plus dead code removal (PRD R31.3).
5. Tile Editor bugs (deferred by the user: "tile editor masih ngawur ... untuk nanti saja").

## 7. How to work with this user (learned the hard way)

- They test in the browser immediately and report what they see. **Show one small change,
  let them look, then continue** - do not restructure a layout in one sweep.
- When they say something looks wrong, **ask which tab or panel it should look like**, or
  compare against one they named. Two rounds were wasted guessing (content vs placement).
- Their screenshots carry the information: read them before changing UI.
- They do not want jargon in the UI. Plain words, short labels, no walls of text.
- They are blunt when frustrated. Acknowledge, fix, keep the summary short, and never claim
  something works when it has not been verified.
