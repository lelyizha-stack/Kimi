#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv, json, re, sys
from io import StringIO
from pathlib import Path
from urllib.request import urlopen
ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "games.json"
def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")
def read_source(source: str) -> str:
    if source.startswith("http://") or source.startswith("https://"):
        with urlopen(source) as resp:
            return resp.read().decode("utf-8")
    return Path(source).read_text(encoding="utf-8")
def parse_csv(text: str):
    rows = list(csv.DictReader(StringIO(text)))
    games = []; counters = {}
    for row in rows:
        category = (row.get("category") or "renpy").strip().lower(); counters[category] = counters.get(category, 0) + 1
        title = (row.get("title") or "").strip(); slug = slugify(title)
        genres = [x.strip() for x in (row.get("genres") or "").split(",") if x.strip()]
        platform = [x.strip().title() for x in (row.get("platform") or "").split(",") if x.strip()]
        games.append({"id": f"{category}-{counters[category]:03d}", "slug": slug, "title": title, "category": category, "genres": genres, "platform": platform, "version": (row.get("version") or "v1.0").strip(), "size": (row.get("size") or "-").strip(), "language": (row.get("language") or "English").strip(), "status": (row.get("status") or "Updated").strip(), "emoji": (row.get("emoji") or "🎮").strip(), "image": (row.get("image") or "").strip(), "description": (row.get("description") or "").strip(), "detailUrl": (row.get("detailUrl") or "").strip() or f"./posts/{category}/{slug}.html", "downloadUrl": (row.get("downloadUrl") or "#").strip(), "createdAt": (row.get("createdAt") or "").strip()})
    return games
def main():
    if len(sys.argv) < 2:
        print('Pakai: python tools/sheets_to_json.py tools/sample-sheet.csv')
        print('   atau: python tools/sheets_to_json.py "https://docs.google.com/.../pub?output=csv"')
        sys.exit(1)
    source = sys.argv[1]
    text = read_source(source)
    games = parse_csv(text)
    DATA_FILE.write_text(json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Berhasil update {len(games)} item ke {DATA_FILE}")
if __name__ == "__main__":
    main()
