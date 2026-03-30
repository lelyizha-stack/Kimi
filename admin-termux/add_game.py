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

def ask(prompt, default=""):
    value = input(f"{prompt}" + (f" [{default}]" if default else "") + ": ").strip()
    return value or default

def ask_category():
    allowed = ["renpy", "rpgm", "mod", "cheat"]
    while True:
        value = ask("Category (renpy/rpgm/mod/cheat)", "renpy").lower()
        if value in allowed:
            return value
        print("Category tidak valid.")

def ask_platform():
    allowed = ["Windows", "Android"]
    while True:
        raw = ask("Platform pisahkan koma (Windows, Android)", "Windows")
        items = [item.strip().title() for item in raw.split(",") if item.strip()]
        items = [item for item in items if item in allowed]
        if items:
            return list(dict.fromkeys(items))
        print("Pilih minimal satu platform: Windows atau Android.")

def ask_genres():
    while True:
        raw = ask("Genre pisahkan koma", "Adventure")
        items = [item.strip() for item in raw.split(",") if item.strip()]
        if items:
            return list(dict.fromkeys(items))
        print("Genre tidak boleh kosong.")

def load_games():
    if not DATA_FILE.exists():
        return []
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save_games(games):
    DATA_FILE.write_text(json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8")

def make_id(games, category):
    count = sum(1 for g in games if g.get("category") == category) + 1
    return f"{category}-{count:03d}"

def create_detail_page(game):
    category_dir = POSTS_DIR / game["category"]
    category_dir.mkdir(parents=True, exist_ok=True)
    target = category_dir / f'{game["slug"]}.html'
    if target.exists():
        return
    html = f'''<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{game["title"]} - Karbit Prime</title><link rel="stylesheet" href="../../style.css"></head><body><main class="page-shell"><div class="container"><section class="page-hero"><div class="page-copy"><div class="hero-badge">{game["emoji"]} Detail Game</div><h1>{game["title"]}</h1><p>{game["description"]}</p></div><div class="page-icon">{game["emoji"]}</div></section><section class="page-section"><div class="download-card"><div class="download-body"><h3>Informasi</h3><div class="download-meta"><div><strong>{game["version"]}</strong><span>Versi</span></div><div><strong>{game["size"]}</strong><span>Ukuran</span></div><div><strong>{game["language"]}</strong><span>Bahasa</span></div></div><div class="note-box" style="margin-top:18px">Genre: {", ".join(game["genres"])}<br>Platform: {", ".join(game["platform"])}<br>Status: {game["status"]}</div><div class="download-actions" style="margin-top:18px"><a href="{game["downloadUrl"]}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Download</a><a href="../../{game["category"]}.html" class="btn btn-secondary">Kembali ke Katalog</a></div></div></div></section></div></main></body></html>'''
    target.write_text(html, encoding="utf-8")

def main():
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
    download_url = ask("Link download", "#")
    slug = slugify(title)
    game = {"id": make_id(games, category), "slug": slug, "title": title, "category": category, "genres": genres, "platform": platform, "version": version, "size": size, "language": language, "status": status, "emoji": emoji, "image": image, "description": description, "detailUrl": f"./posts/{category}/{slug}.html", "downloadUrl": download_url, "createdAt": date.today().isoformat()}
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
