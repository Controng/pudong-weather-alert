"""
Manual data entry helper.

Use when scraping fails or when you spot a warning on 12379.cn / news articles
that you want to add by hand.

Usage:
    python scraper/manual_add.py --type 高温 --level 橙色 --area 浦东新区 \
        --date-from 2026-07-16 --date-to 2026-07-17 \
        --published-at "2026-07-16T07:26" \
        --description "浦东新区气象台2026年07月16日07时26分发布高温橙色预警[Ⅱ级/严重]:..."

The script writes a single JSON line on stdout that you can paste into
data/warnings.json, OR use --append to add it directly.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "warnings.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", required=True, help="warning type, e.g. 高温 / 暴雨 / 雷电 / 台风")
    ap.add_argument("--level", required=True, choices=["蓝色", "黄色", "橙色", "红色"])
    ap.add_argument("--area", default="浦东新区")
    ap.add_argument("--date-from", required=True, help="YYYY-MM-DD")
    ap.add_argument("--date-to", required=True, help="YYYY-MM-DD")
    ap.add_argument("--published-at", required=True, help="ISO datetime, e.g. 2026-07-16T07:26")
    ap.add_argument("--description", required=True, help="full warning text")
    ap.add_argument("--source", default="manual", help="source label, default 'manual'")
    ap.add_argument("--source-url", default="", help="URL you copied the warning from")
    ap.add_argument("--append", action="store_true", help="append to data/warnings.json instead of stdout")
    args = ap.parse_args()

    headline = f"{args.area}发布{args.type}{args.level}预警"
    entry = {
        "headline": headline,
        "warning_type": args.type,
        "level": args.level,
        "area": args.area,
        "published_at": args.published_at,
        "date_from": args.date_from,
        "date_to": args.date_to,
        "description": args.description,
        "source": args.source,
        "source_url": args.source_url,
        "raw_id": f"{headline}|{args.published_at}",
    }
    line = json.dumps(entry, ensure_ascii=False)
    if args.append:
        existing = json.loads(DATA_FILE.read_text(encoding="utf-8")) if DATA_FILE.exists() else []
        if any(w.get("raw_id") == entry["raw_id"] for w in existing):
            print(f"[manual] already exists, skip: {entry['raw_id']}", file=sys.stderr)
            sys.exit(0)
        existing.append(entry)
        existing.sort(key=lambda w: (w.get("date_from", ""), w.get("published_at", "")))
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[manual] appended to {DATA_FILE}")
    else:
        print(line)


if __name__ == "__main__":
    main()
