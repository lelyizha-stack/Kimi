#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
from pathlib import Path
from datetime import date


ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "games.json"
POSTS_DIR = ROOT / "posts"


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def ask(prompt: str, default: str = "") -> str:
    value = input(f"{prompt}" + (f" [{default}]" if default else "") + ": ").strip()
    return value or default


def ask_category() -> str:
    allowed = ["renpy", "rpgm", "mod", "cheat"]
    while True:
        value = ask("Category (renpy/rpgm/mod/cheat)", "renpy").lower()
        if value in allowed:
            return value
        print("Category tidak valid.")


def ask_platform() -> list[str]:
    allowed = ["Windows", "Android"]
    while True:
        raw = ask("Platform pisahkan koma (Windows, Android)", "Windows")
        items = [item.strip().title() for item in raw.split(",") if item.strip()]
        items = [item for item in items if item in allowed]
        if items:
            return list(dict.fromkeys(items))
        print("Pilih minimal satu platform: Windows atau Android.")


def ask_genres() -> list[str]:
    while True:
        raw = ask("Genre pisahkan koma", "Adventure")
        items = [item.strip() for item in raw.split(",") if item.strip()]
        if items:
            return list(dict.fromkeys(items))
        print("Genre tidak boleh kosong.")


def ask_download_urls(platforms: list[str]) -> dict:
    urls = {
        "Windows": "#",
        "Android": "#"
    }

    if "Windows" in platforms:
        urls["Windows"] = ask("Link download Windows", "#")

    if "Android" in platforms:
        urls["Android"] = ask("Link download Android", "#")

    return urls


def load_games() -> list:
    if not DATA_FILE.exists():
        return []
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_games(games: list) -> None:
    DATA_FILE.write_text(
        json.dumps(games, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def make_id(games: list, category: str) -> str:
    count = sum(1 for g in games if g.get("category") == category) + 1
    return f"{category}-{count:03d}"


def make_download_buttons(game: dict) -> str:
    urls = game.get("downloadUrls") or {}
    buttons = []

    for platform in ["Windows", "Android"]:
        if platform in (game.get("platform") or []):
            url = urls.get(platform) or "#"
            buttons.append(
                f'<a href="{url}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Download {platform}</a>'
            )

    return "".join(buttons)


def make_genre_chips(game: dict) -> str:
    return "".join(
        f'<span class="chip">{genre}</span>'
        for genre in (game.get("genres") or [])[:6]
    )


def make_platform_spans(game: dict) -> str:
    return "".join(
        f'<span class="tag platform">{p}</span>'
        for p in (game.get("platform") or [])
    )


def create_detail_page(game: dict) -> None:
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
            <p>Halaman detail ini dibuat otomatis dari script Termux.</p>

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


def main() -> None:
    games = load_games()

    title = ask("Judul game")
    category = ask_category()
    genres = ask_genres()
    platform = ask_platform()
    version = ask("Versi", "v1.0")
    size = ask("Ukuran", "500 MB")
    language = ask("Bahasa", "English")
    status = ask("Status", "Updated")
    emoji = ask("Emoji", "🎮")
    image = ask("Link gambar")
    description = ask("Deskripsi")
    download_urls = ask_download_urls(platform)

    slug = slugify(title)

    game = {
        "id": make_id(games, category),
        "slug": slug,
        "title": title,
        "category": category,
        "genres": genres,
        "platform": platform,
        "version": version,
        "size": size,
        "language": language,
        "status": status,
        "emoji": emoji,
        "image": image,
        "description": description,
        "detailUrl": f"./posts/{category}/{slug}.html",
        "downloadUrls": download_urls,
        "createdAt": date.today().isoformat()
    }

    games.insert(0, game)
    save_games(games)
    create_detail_page(game)

    print("\nBerhasil menambah game baru:")
    print(json.dumps(game, ensure_ascii=False, indent=2))
    print("\nFile yang diupdate:")
    print("-", DATA_FILE)
    print("-", ROOT / "posts" / category / f"{slug}.html")


if __name__ == "__main__":
    main()