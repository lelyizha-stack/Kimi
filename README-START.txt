Karbit Prime - Admin Ready Package

ISI PENTING
- index.html
- renpy.html
- rpgm.html
- mod.html
- cheat.html
- donasi.html
- admin-local.html
- admin-local.js
- style.css
- catalog.js
- data/games.json
- posts/...
- admin-termux/add_game.py
- tools/sample-sheet.csv
- tools/sheets_to_json.py
- .github/workflows/sync-from-sheet.yml.example

FITUR WEBSITE
- Search aktif
- Filter platform: Windows / Android
- Genre dinamis dari data
- Tag genre bisa diklik
- Tag platform bisa diklik
- Tag category bisa diklik
- Halaman kategori terpisah
- Homepage katalog modern
- Siap untuk ratusan item

OPSION UPDATE DATA
1) TERMUX
   python admin-termux/add_game.py
   Script akan update data/games.json dan membuat halaman detail contoh.

2) GOOGLE SHEETS / CSV
   python tools/sheets_to_json.py tools/sample-sheet.csv
   atau
   python tools/sheets_to_json.py "https://docs.google.com/.../pub?output=csv"

3) ADMIN LOKAL WEB
   Buka admin-local.html
   - load data situs sekarang
   - tambah game baru via form
   - export hasil ke games.json
   - import games.json yang lama

CATATAN
- GitHub Pages statis tidak bisa menulis langsung ke repo dari browser biasa tanpa auth/backend.
- Karena itu admin-local.html dibuat untuk EXPORT data JSON.
- Kalau nanti mau full web admin, kamu bisa lanjut ke GitHub API / OAuth / Decap CMS.
