# legacy/ — arsip beku PocketTranslate

Isi folder ini adalah aplikasi lama **PocketTranslate** (satu halaman `index.html` +
`core.js` 4.729 baris + `app-ui.js`) beserta `main.css`-nya. Sejak batch 180
aplikasi yang dipakai adalah workbench di `app/`, dan folder ini **tidak dimuat,
tidak dirujuk, dan tidak diuji** oleh apa pun di `app/` maupun `tests/`.

## Kenapa disimpan, bukan dihapus

- `core.js` masih menyimpan `createRelativeSearchWorker` (di sini baris 4693-5066)
  dan beberapa helper lain yang belum dipindahkan ke `app/assets/js/core/`.
  `app-ui.js` memanggilnya lewat nama global, jadi keduanya utuh di sini sampai
  pemindahan itu selesai.
- Riwayat dan bentuk asli fungsi-fungsi yang sudah dipindah (text codec, `rebuildRom`,
  tiga worker) bisa dibandingkan langsung dengan salinan barunya di `app/assets/js/core/`.
- Kalau ada laporan bug dari versi lama, berkasnya masih bisa dibuka apa adanya.

Folder ini beku: perbaikan dan fitur baru masuk ke `app/`, bukan ke sini.

## Cara membukanya

Halaman ini membuat Worker lewat `URL.createObjectURL`, dan berkas diambil dengan
`fetch`/`<script src>`; membuka `index.html` langsung dari `file://` akan gagal di
banyak peramban. Jalankan server statis dari akar repo, lalu buka:

```
python -m http.server 8080
# lalu: http://localhost:8080/legacy/index.html
```

Struktur `assets/` sengaja dipertahankan persis seperti aslinya supaya rujukan
`./assets/css/main.css`, `./assets/js/core.js` dan `./assets/js/app-ui.js` di
`index.html` tetap benar tanpa diubah.

## Catatan provenans

Asal-usul `createRelativeSearchWorker` (`legacy/assets/js/core.js:4693-5066`) tidak
diketahui: tidak ada catatan batch, tidak ada berkas pendamping, dan tidak ada
riwayat commit yang menjelaskan dari mana kode itu datang atau polanya diambil.
Perlakukan sebagai kode tanpa provenans sampai ada yang bisa membuktikannya.

## Peta cepat

| Berkas | Isi |
| --- | --- |
| `index.html` | halaman lama; memuat `./assets/css/main.css`, `./assets/js/core.js`, `./assets/js/app-ui.js` |
| `assets/js/core.js` | mesin lama: text codec, `rebuildRom`, semua worker, patch, CSV, AI translate |
| `assets/js/app-ui.js` | komponen React lama (satu berkas besar) |
| `assets/css/main.css` | tema lama; `.btn-danger` (baris 181-189) sudah disalin ke `app/assets/css/vscode-components.css` |
