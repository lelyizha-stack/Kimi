#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import io
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "games.json"
POSTS_DIR = ROOT / "posts"

def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")

def read_source(source: str) -> str:
    if source.startswith("http://") or source.startswith("https://"):
        with urlopen(source) as res:
            return res.read().decode("utf-8")
    return Path(source).read_text(encoding="utf-8")

def split_csv_list(value: str):
    return [item.strip() for item in str(value or "").split(",") if item.strip()]

def make_download_buttons(game):
    urls = game.get("downloadUrls") or {}
    buttons = []

    for platform in ["Windows", "Android"]:
        if platform in (game.get("platform") or []):
            url = urls.get(platform) or "#"
            buttons.append(
                f'<a href="{url}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Download {platform}</a>'
            )

    return "".join(buttons)

def make_genre_chips(game):
    return "".join(
        f'<span class="chip">{genre}</span>'
        for genre in (game.get("genres") or [])[:6]
    )

def make_platform_spans(game):
    return "".join(
        f'<span class="tag platform">{p}</span>'
        for p in (game.get("platform") or [])
    )

def create_detail_page(game):
    category_dir = POSTS_DIR / game["category"]
    category_dir.mkdir(parents=True, exist_ok=True)

    target = category_dir / f'{game["slug"]}.html'

    image_html = ""
    if game.get("image"):
        image_html = f'<img src="{game["image"]}" alt="{game["title"]}">'

    html = f'''<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{game.get("title", "")} - Karbit Prime</title>
  <link rel="stylesheet" href="../../style.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="../../" class="logo-wrap">
        <div class="logo-mark">KP</div>
        <div class="logo-text">
          <span class="logo-title">Karbit Prime</span>
          <span class="logo-sub">TL Indo • Mod • Cheat</span>
        </div>
      </a>

      <nav class="main-nav">
        <a href="../../">Home</a>
        <a href="../../donasi.html">Donasi</a>
        <a href="../../renpy.html">Ren'Py</a>
        <a href="../../rpgm.html">RPGM</a>
        <a href="../../mod.html">Mod</a>
        <a href="../../cheat.html">Cheat</a>
        <a href="../../money-editor.html">Money Editor</a>
        <a href="../../admin-local.html">Admin</a>
      </nav>
    </div>
  </header>

  <main class="page-shell">
    <div class="container">
      <section class="page-hero">
        <div class="page-copy">
          <div class="hero-badge">{game.get("emoji", "🎮")} Detail Game</div>
          <h1>{game.get("title", "")}</h1>
          <p>{game.get("description", "")}</p>
          <div class="toolbar" style="margin-top:20px">
            {make_genre_chips(game)}
          </div>
        </div>

        <div class="page-icon">{game.get("emoji", "🎮")}</div>
      </section>

      <section class="page-section">
        <div class="download-card">
          <div class="catalog-cover">
            {image_html}
            <div class="cover-emoji">{game.get("emoji", "🎮")}</div>
          </div>

          <div class="download-body">
            <div class="post-meta">
              <a class="tag {game.get("category", "")}" href="../../{game.get("category", "")}.html">
                {str(game.get("category", "")).upper()}
              </a>
              {make_platform_spans(game)}
              <span class="tag status">{game.get("status", "Updated")}</span>
            </div>

            <h3>Informasi Ringkas</h3>
            <p>Halaman detail ini dibuat otomatis dari script CSV / Google Sheet.</p>

            <div class="download-meta">
              <div><strong>{game.get("version", "-")}</strong><span>Versi</span></div>
              <div><strong>{game.get("size", "-")}</strong><span>Ukuran</span></div>
              <div><strong>{game.get("language", "-")}</strong><span>Bahasa</span></div>
            </div>

            <div class="note-box" style="margin-top:18px">
              Genre: {", ".join(game.get("genres", []))}<br>
              Platform: {", ".join(game.get("platform", []))}<br>
              Status: {game.get("status", "Updated")}
            </div>

            <div class="download-actions" style="margin-top:18px">
              {make_download_buttons(game)}
              <a href="../../{game.get("category", "")}.html" class="btn btn-secondary">Kembali ke Katalog</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</body>
</html>'''

    target.write_text(html, encoding="utf-8")

def row_to_game(row, counters):
    category = (row.get("category") or "renpy").strip().lower()
    if category not in {"renpy", "rpgm", "mod", "cheat"}:
        category = "renpy"

    title = (row.get("title") or "").strip()
    if not title:
        return None

    slug = (row.get("slug") or "").strip() or slugify(title)
    genres = split_csv_list(row.get("genres", "Adventure"))
    platform = [p for p in split_csv_list(row.get("platform", "Windows")) if p in {"Windows", "Android"}]
    if not platform:
        platform = ["Windows"]

    counters[category] = counters.get(category, 0) + 1

    download_windows = (row.get("downloadWindows") or row.get("downloadUrl") or "#").strip() or "#"
    download_android = (row.get("downloadAndroid") or "#").strip() or "#"

    game = {
        "id": row.get("id") or f"{category}-{str(counters[category]).zfill(3)}",
        "slug": slug,
        "title": title,
        "category": category,
        "genres": genres,
        "platform": platform,
        "version": (row.get("version") or "v1.0").strip(),
        "size": (row.get("size") or "-").strip(),
        "language": (row.get("language") or "English").strip(),
        "status": (row.get("status") or "Updated").strip(),
        "emoji": (row.get("emoji") or "🎮").strip(),
        "image": (row.get("image") or "").strip(),
        "description": (row.get("description") or "").strip(),
        "detailUrl": (row.get("detailUrl") or f"./posts/{category}/{slug}.html").strip(),
        "downloadUrls": {
            "Windows": download_windows,
            "Android": download_android
        },
        "createdAt": (row.get("createdAt") or date.today().isoformat()).strip()
    }
    return game

def main():
    if len(sys.argv) < 2:
        print('Pakai: python tools/sheets_to_json.py tools/sample-sheet.csv')
        print('atau:   python tools/sheets_to_json.py "https://docs.google.com/.../pub?output=csv"')
        sys.exit(1)

    source = sys.argv[1]
    content = read_source(source)
    reader = csv.DictReader(io.StringIO(content))

    counters = {}
    games = []

    for row in reader:
        game = row_to_game(row, counters)
        if game:
            games.append(game)
            create_detail_page(game)

    DATA_FILE.write_text(json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Berhasil update {len(games)} game.")
    print("File yang diupdate:")
    print("-", DATA_FILE)
    print("-", POSTS_DIR)

if __name__ == "__main__":
    main()