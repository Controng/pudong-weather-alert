"""
Shanghai / Pudong weather warning scraper.

Primary source: https://sh.weather.com.cn/zhyj/index.shtml
Backup sources:
  - National Early Warning Release Center (国家预警信息发布中心): 12379.cn
  - Caiyun weather API (needs token): https://api.caiyunapp.com

The script is designed to be idempotent — it appends new warnings to
`data/warnings.json` and never duplicates an existing (headline, published_at)
entry.

Usage:
    python scraper.py [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup


# -------- Config ----------------------------------------------------------------

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "warnings.json"
PRIMARY_URL = "https://sh.weather.com.cn/zhyj/index.shtml"
BACKUP_URLS = [
    # 12379.cn is the National Early Warning Release Center — the absolute
    # authoritative source for all CN early warnings. Its Shanghai board.
    "https://www.12379.cn/sh.shtml",
    # 上海市突发事件预警发布中心 (if it exists in the future).
    "https://www.soweather.com/yjxx/index.html",
]

PUDONG_KEYWORDS = ["浦东新区", "浦东", "Pudong"]
ORANGE_LEVELS = ["橙色", "Ⅱ级", "2级", "II级"]
RED_LEVELS = ["红色", "Ⅰ级", "1级", "I级"]
TARGET_LEVELS = ORANGE_LEVELS + RED_LEVELS

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


# -------- Data model ------------------------------------------------------------

@dataclass
class Warning:
    """A single weather warning entry."""

    headline: str           # e.g. "上海市浦东新区发布高温橙色预警"
    warning_type: str       # e.g. "高温"
    level: str              # "橙色" | "红色"
    area: str               # e.g. "浦东新区"
    published_at: str       # ISO 8601
    date_from: str          # ISO date — effective start
    date_to: str            # ISO date — effective end
    description: str        # full body text
    source: str             # primary | backup-caiyun | backup-12379 | manual
    source_url: str = ""    # where we got it from
    raw_id: str = ""        # dedupe key (e.g. headline + published_at)

    def to_dict(self):
        return asdict(self)


# -------- HTTP ------------------------------------------------------------------

def fetch(url: str, timeout: int = 15) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text
    except requests.RequestException as exc:
        print(f"[fetch] failed {url}: {exc}", file=sys.stderr)
        return None


# -------- Parsing ---------------------------------------------------------------

# Examples we want to match:
#   浦东新区气象台2026年07月16日07时26分发布高温橙色预警[Ⅱ级/严重]:预计本区大部分街镇...
#   浦东新区气象台2023年09月11日16时22分更新暴雨橙色预警信号为暴雨红色预警信号:...
#   上海中心气象台2023年09月11日16时02分更新暴雨蓝色预警信号为暴雨黄色预警信号:...
PUBLISH_RE = re.compile(
    r"(?P<issuer>[^，。\s]{2,15}(?:气象台|气象局|预警发布中心))"
    r"(?P<date>\d{4}年\d{1,2}月\d{1,2}日)"
    r"(?P<time>\d{1,2}时\d{1,2}分)"
    r"(?P<action>发布|更新[^为]*?为)"
    r"(?P<body>.+?)(?=\n|$)",
    re.MULTILINE | re.DOTALL,
)

LEVEL_RE = re.compile(r"(红色|橙色|黄色|蓝色)")
PUDONG_AREA_RE = re.compile(r"浦东(?:新区|新?区)?")


def parse_warning_text(text: str, source: str, source_url: str) -> Iterable[Warning]:
    """
    Walk through any blob of warning text and yield Warning objects.
    Each record is identified by: <issuer><date><time> + body[:30] (rough but stable).
    """
    text = text.replace("\u3000", " ").strip()
    for m in PUBLISH_RE.finditer(text):
        body = m.group("body").strip()
        # stop at the next "预警信息来源" footnote if present
        body = re.split(r"\(预警信息来源", body)[0].strip()

        # Must be orange or red
        level_match = LEVEL_RE.search(body)
        if not level_match:
            continue
        level = level_match.group(1)
        if level not in ("橙色", "红色"):
            continue

        # Pudong detection — check issuer first (most reliable), then body.
        # A real Pudong warning body always contains 本区 (本区大部分街镇 / 本区花木街道…).
        # Adjacent text that just happens to say "不是浦东" must NOT match.
        issuer = m.group("issuer")
        if PUDONG_AREA_RE.search(issuer):
            pass
        elif "本区" in body and PUDONG_AREA_RE.search(body):
            pass
        else:
            continue
        area = "浦东新区"

        # Warning type — first 2-4 chinese chars before 预警/预警信号
        type_match = re.search(r"(\S{1,6}?)(?:橙色|红色|黄色|蓝色)预警(?:信号)?", body)
        warning_type = type_match.group(1) if type_match else "未知"

        # Datetime — always normalize to YYYY-MM-DD (zero-padded)
        date_s = m.group("date").replace("年", "-").replace("月", "-").replace("日", "")
        time_s = m.group("time").replace("时", ":").replace("分", "")
        try:
            dt = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
            published_at = dt.isoformat(timespec="minutes")
            date_from = dt.strftime("%Y-%m-%d")
            date_to = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            # Fallback: try non-padded
            try:
                dt = datetime.strptime(
                    f"{date_s.replace('-0', '-')} {time_s}", "%Y-%m-%d %H:%M"
                )
                published_at = dt.isoformat(timespec="minutes")
                date_from = dt.strftime("%Y-%m-%d")
                date_to = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
            except ValueError:
                # Last resort: keep the raw strings
                published_at = f"{date_s}T{m.group('time')}"
                date_from = date_s
                date_to = date_s

        headline = f"{area}发布{warning_type}{level}预警"

        yield Warning(
            headline=headline,
            warning_type=warning_type,
            level=level,
            area=area,
            published_at=published_at,
            date_from=date_from,
            date_to=date_to,
            description=body,
            source=source,
            source_url=source_url,
            raw_id=f"{headline}|{published_at}",
        )


# -------- Source-specific fetchers ---------------------------------------------

def fetch_primary() -> list[Warning]:
    html = fetch(PRIMARY_URL)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    # The page contains a 预警列表 block. Strategy: collect every <li>/<p>/<a>
    # whose text contains 浦东 + (橙色|红色).
    candidates: list[str] = []
    # 1) specific CSS classes that sh.weather.com.cn tends to use
    for el in soup.select("ul.yj_list li, .warningList li, .yjList li, li, p, a"):
        t = el.get_text(" ", strip=True)
        if not t or "浦东" not in t:
            continue
        if not re.search(r"(红色|橙色)", t):
            continue
        candidates.append(t)
    # 2) if nothing matched, fall back to whole-text matching
    if not candidates:
        text = soup.get_text("\n", strip=True)
        for chunk in re.split(r"\n+", text):
            if "浦东" in chunk and re.search(r"(红色|橙色)", chunk):
                candidates.append(chunk)
    out: list[Warning] = []
    for c in candidates:
        out.extend(parse_warning_text(c, "primary", PRIMARY_URL))
    return out


def fetch_backup() -> list[Warning]:
    """
    Try each backup source until one returns Pudong orange/red warnings.
    Note: most backup sources today only show CURRENT warnings, same as primary.
    The dedupe in save_warnings() ensures we only store new entries.
    """
    for url in BACKUP_URLS:
        print(f"[backup] trying {url}", file=sys.stderr)
        html = fetch(url)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text("\n", strip=True)
        warnings = list(parse_warning_text(text, f"backup-{urlparse(url).netloc}", url))
        if warnings:
            return warnings
    return []


def urlparse(s: str):
    from urllib.parse import urlparse as _u
    return _u(s)


# -------- Storage ---------------------------------------------------------------

def load_existing() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_warnings(new: list[Warning]) -> int:
    """
    Append `new` to the JSON store, deduped by `raw_id`. Returns count actually added.
    """
    existing = load_existing()
    seen = {w.get("raw_id") for w in existing if w.get("raw_id")}
    added = 0
    for w in new:
        if w.raw_id in seen:
            continue
        existing.append(w.to_dict())
        seen.add(w.raw_id)
        added += 1
    existing.sort(key=lambda x: (x.get("date_from", ""), x.get("published_at", "")))
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return added


# -------- Filter ----------------------------------------------------------------

def filter_pudong_orange_red(warnings: list[Warning]) -> list[Warning]:
    return [w for w in warnings if w.area == "浦东新区" and w.level in ("橙色", "红色")]


def filter_by_date_range(
    warnings: list[dict], date_from: str, date_to: str
) -> list[dict]:
    out = []
    for w in warnings:
        wf = w.get("date_from", "")[:10]
        wt = w.get("date_to", "")[:10]
        if not wf:
            continue
        # warning overlaps the [date_from, date_to] window
        if wf > date_to or wt < date_from:
            continue
        out.append(w)
    return out


# -------- Main ------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date-from", help="inclusive YYYY-MM-DD")
    ap.add_argument("--date-to", help="inclusive YYYY-MM-DD")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--print-only", action="store_true", help="just print results, do not save")
    args = ap.parse_args()

    print(f"[scrape] start {datetime.now().isoformat(timespec='seconds')}")
    warnings = fetch_primary()
    src = "primary"
    if not warnings:
        print("[scrape] primary returned nothing, trying backups…", file=sys.stderr)
        warnings = fetch_backup()
        src = "backup"
    print(f"[scrape] {src} got {len(warnings)} raw entries")

    if args.dry_run or args.print_only:
        for w in warnings:
            print(json.dumps(w.to_dict(), ensure_ascii=False))
        return

    added = save_warnings(warnings)
    print(f"[scrape] added {added} new entries; total now {len(load_existing())}")

    if args.date_from and args.date_to:
        out = filter_by_date_range(load_existing(), args.date_from, args.date_to)
        out = [w for w in out if w.get("area") == "浦东新区" and w.get("level") in ("橙色", "红色")]
        print(
            json.dumps(
                {"date_from": args.date_from, "date_to": args.date_to, "count": len(out), "items": out},
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
