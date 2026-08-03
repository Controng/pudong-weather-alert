"""
Shanghai / Pudong weather warning scraper.

PRIMARY source (rewrite 2026-07-30):
  https://d1.weather.com.cn/shweather/alarm.json  (JSONP)
  This is the same feed that the official sh.weather.com.cn page uses
  to render its warning map and list. Returns all currently-effective
  warnings for every district in Shanghai.

Why rewrite:
  The sh.weather.com.cn/zhyj/index.shtml page was migrated from a
  server-rendered list to a JS-driven SPA. The HTML still contains a
  2019-era stub `<li>` list (e.g. 上海市气象局2019-10-04 大雾橙色预警),
  and the real data only loads via an AJAX call to alarm.json. Our
  previous BeautifulSoup parser was therefore scraping the stub and
  producing 0 new entries every day.

Backup sources (kept for redundancy, mostly return current warnings too):
  - 12379.cn (国家预警信息发布中心)
  - soweather.com

The script is idempotent — it appends new warnings to
`data/warnings.json` and never duplicates an existing (headline, published_at)
entry.

Usage:
    python scraper.py [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests


# -------- Config ----------------------------------------------------------------

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "warnings.json"

# The real data feed (JSONP).
# Returned shape: alarm_callback({"<prov>_<city>_<town>_<type>": {...}, ...})
# Each value has: status, province, city, town, type, level, time, content, icon
PRIMARY_URL = "https://d1.weather.com.cn/shweather/alarm.json"

BACKUP_URLS = [
    "https://www.12379.cn/sh.shtml",
    "https://www.soweather.com/yjxx/index.html",
]

# Beijing time (UTC+8) — this is what the upstream feed uses.
BJ_TZ = timezone(timedelta(hours=8))

PUDONG_TOWN_KEYS = ("浦东新区",)  # exact match against the 'town' field
ALL_LEVELS = ("红色", "橙色", "黄色", "蓝色")  # 4 official levels

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://sh.weather.com.cn/",
}


# -------- Data model ------------------------------------------------------------

@dataclass
class Warning:
    """A single weather warning entry."""

    headline: str           # e.g. "上海市浦东新区发布高温橙色预警"
    warning_type: str       # e.g. "高温"
    level: str              # "红色" | "橙色" | "黄色" | "蓝色"
    area: str               # e.g. "浦东新区"
    published_at: str       # ISO 8601 (Beijing time, no TZ suffix for back-compat)
    date_from: str          # ISO date — effective start
    date_to: str            # ISO date — effective end
    description: str        # full body text
    source: str             # primary | backup-12379 | backup-soweather | manual
    source_url: str = ""    # where we got it from
    raw_id: str = ""        # dedupe key (e.g. headline + published_at)

    def to_dict(self):
        return asdict(self)


# -------- HTTP ------------------------------------------------------------------

def fetch(url: str, timeout: int = 15) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.text
    except requests.RequestException as exc:
        print(f"[fetch] failed {url}: {exc}", file=sys.stderr)
        return None


# -------- Primary fetcher: alarm.json ------------------------------------------

def fetch_primary() -> list[Warning]:
    """
    Fetch the live alarm.json feed and convert Pudong entries into Warnings.
    """
    raw = fetch(PRIMARY_URL)
    if not raw:
        return []

    # JSONP wrapper: alarm_callback({...})
    m = re.match(r"\s*\w+\((.*)\)\s*;?\s*$", raw, re.S)
    if not m:
        print("[primary] no JSONP wrapper found", file=sys.stderr)
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as exc:
        print(f"[primary] JSON decode failed: {exc}", file=sys.stderr)
        return []

    warnings: list[Warning] = []
    for key, item in data.items():
        town = item.get("town", "")
        if town not in PUDONG_TOWN_KEYS:
            continue

        # Parse time: '20260730080000' → 2026-07-30 08:00 (BJ)
        t = str(item.get("time", "")).strip()
        if len(t) < 12 or not t.isdigit():
            continue
        try:
            dt_bj = datetime(
                int(t[0:4]), int(t[4:6]), int(t[6:8]),
                int(t[8:10]), int(t[10:12]), int(t[12:14]) if len(t) >= 14 else 0,
                tzinfo=BJ_TZ,
            )
        except ValueError:
            continue

        warning_type = item.get("type", "").strip()
        level = item.get("level", "").strip()
        if warning_type not in ("高温", "暴雨", "雷电", "大风", "台风", "大雾",
                                "寒潮", "暴雪", "霜冻", "冰雹", "干旱",
                                "道路结冰", "沙尘暴", "霾", "森林火险"):
            # unknown type — still keep it, don't filter on type
            pass
        if level not in ALL_LEVELS:
            continue

        # Description = the full content text
        content = item.get("content", "").strip()
        if not content:
            continue

        # Build headline — always "{town}发布/更新{type}{level}预警"
        # status: '0' = new, '1' = updated from another level
        is_update = item.get("status") == "1" and "更新" in content
        action = "更新" if is_update else "发布"
        headline = f"{town}{action}{warning_type}{level}预警"

        published_at = dt_bj.strftime("%Y-%m-%dT%H:%M")
        date_from = dt_bj.strftime("%Y-%m-%d")
        date_to = (dt_bj + timedelta(days=1)).strftime("%Y-%m-%d")

        raw_id = f"{headline}|{published_at}"
        warnings.append(Warning(
            headline=headline,
            warning_type=warning_type,
            level=level,
            area=town,
            published_at=published_at,
            date_from=date_from,
            date_to=date_to,
            description=content,
            source="primary",
            source_url=PRIMARY_URL,
            raw_id=raw_id,
        ))

    return warnings


# -------- Backup: HTML pages (kept for redundancy) -----------------------------

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
    """Walk any blob of warning text and yield Warning objects."""
    text = text.replace("\u3000", " ").strip()
    for m in PUBLISH_RE.finditer(text):
        body = m.group("body").strip()
        body = re.split(r"\(预警信息来源", body)[0].strip()
        level_match = LEVEL_RE.search(body)
        if not level_match:
            continue
        level = level_match.group(1)
        if level not in ("橙色", "红色", "黄色", "蓝色"):
            continue
        issuer = m.group("issuer")
        if PUDONG_AREA_RE.search(issuer):
            pass
        elif "本区" in body and PUDONG_AREA_RE.search(body):
            pass
        else:
            continue
        area = "浦东新区"
        type_match = re.search(r"(\S{1,6}?)(?:橙色|红色|黄色|蓝色)预警(?:信号)?", body)
        warning_type = type_match.group(1) if type_match else "未知"
        date_s = m.group("date").replace("年", "-").replace("月", "-").replace("日", "")
        time_s = m.group("time").replace("时", ":").replace("分", "")
        try:
            dt = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
            published_at = dt.isoformat(timespec="minutes")
            date_from = dt.strftime("%Y-%m-%d")
            date_to = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            continue

        if "更新" in m.group("action"):
            headline = f"{area}更新{warning_type}{level}预警"
        else:
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


def fetch_backup() -> list[Warning]:
    for url in BACKUP_URLS:
        print(f"[backup] trying {url}", file=sys.stderr)
        html = fetch(url)
        if not html:
            continue
        text = re.sub(r"<[^>]+>", "\n", html)
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


# -------- Main ------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date-from", help="inclusive YYYY-MM-DD")
    ap.add_argument("--date-to", help="inclusive YYYY-MM-DD")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--print-only", action="store_true", help="just print results, do not save")
    args = ap.parse_args()

    print(f"[scrape] start {datetime.now(BJ_TZ).isoformat(timespec='seconds')}")
    warnings = fetch_primary()
    src = "primary"
    if not warnings:
        print("[scrape] primary returned nothing, trying backups…", file=sys.stderr)
        warnings = fetch_backup()
        src = "backup"
    print(f"[scrape] {src} got {len(warnings)} raw Pudong entries")

    if args.dry_run or args.print_only:
        for w in warnings:
            print(json.dumps(w.to_dict(), ensure_ascii=False))
        return

    added = save_warnings(warnings)
    print(f"[scrape] added {added} new entries; total now {len(load_existing())}")


if __name__ == "__main__":
    main()
