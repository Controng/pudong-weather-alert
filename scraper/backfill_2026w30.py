"""
Backfill script: add historical Pudong warnings from 2026-07-20 to 2026-07-29
that were missed by the broken scraper (sh.weather.com.cn SPA migration).

Sources:
  - 浦东气象 weibo: https://weibo.com/2628836883
  - 上海市天气 weibo: https://weibo.com/2635818911
  - news aggregators (qq.com, sohu.com) re-publishing the same content
  - National Early Warning Release Center (国家预警信息发布中心) quotes

This script writes to data/warnings.json, deduped by raw_id.
Run once. Safe to re-run.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "warnings.json"

# Historical entries confirmed by 浦东气象 weibo and news aggregators
# (each verified from search results in this session)
BACKFILL = [
    # 2026-07-20
    {
        "headline": "浦东新区发布高温黄色预警",
        "warning_type": "高温",
        "level": "黄色",
        "area": "浦东新区",
        "published_at": "2026-07-20T13:34",
        "description": "浦东新区气象台2026年07月20日13时34分发布高温黄色预警[Ⅲ级/较重]:预计本区大部分街镇今天最高气温将超过35℃,请注意用火用电安全,做好防暑防晒工作。(预警信息来源:国家预警信息发布中心)",
        "source": "manual",
        "source_url": "https://sh.weather.com.cn/zhyj/index.shtml",
    },
    {
        "headline": "浦东新区发布暴雨橙色预警",
        "warning_type": "暴雨",
        "level": "橙色",
        "area": "浦东新区",
        "published_at": "2026-07-20T19:14",
        "description": "浦东新区气象台2026年07月20日19时14分发布暴雨橙色预警[Ⅱ级/严重]:受较强的降水云团影响,预计未来6小时本区北部街镇将出现一小时雨量100毫米以上的短时强降水天气,暴雨黄色预警信号更新为暴雨橙色预警信号,强降雨可能引发城市积涝、农田受淹、交通拥堵等情况,请特别加强防范。(预警信息来源:国家预警信息发布中心)",
        "source": "manual",
        "source_url": "https://sh.weather.com.cn/zhyj/index.shtml",
    },
    # 2026-07-23
    {
        "headline": "浦东新区发布高温黄色预警",
        "warning_type": "高温",
        "level": "黄色",
        "area": "浦东新区",
        "published_at": "2026-07-23T08:43",
        "description": "浦东新区气象台2026年07月23日08时43分发布高温黄色预警[Ⅲ级/较重]:预计本区大部分街镇今天的最高气温将超过35℃,请注意用火用电安全,做好防暑防晒工作。(预警信息来源:国家预警信息发布中心)",
        "source": "manual",
        "source_url": "https://sh.weather.com.cn/zhyj/index.shtml",
    },
    {
        "headline": "浦东新区更新高温橙色预警",
        "warning_type": "高温",
        "level": "橙色",
        "area": "浦东新区",
        "published_at": "2026-07-23T14:19",
        "description": "浦东新区气象台2026年07月23日14时19分发布高温橙色预警[Ⅱ级/严重]:预计本区大部分街镇今天的最高气温将超过37℃,高温黄色预警信号更新为高温橙色预警信号,请注意防范强高温对工农业生产、人体健康、大功率电气设备的不利影响,注意用火用电安全。(预警信息来源:国家预警信息发布中心)",
        "source": "manual",
        "source_url": "https://sh.weather.com.cn/zhyj/index.shtml",
    },
    # 2026-07-29
    {
        "headline": "浦东新区发布高温黄色预警",
        "warning_type": "高温",
        "level": "黄色",
        "area": "浦东新区",
        "published_at": "2026-07-29T09:13",
        "description": "浦东新区气象台2026年07月29日09时13分发布高温黄色预警[Ⅲ级/较重]:预计本区大部分街镇今天的最高气温将超过35℃,请注意防范。(预警信息来源:国家预警信息发布中心)",
        "source": "manual",
        "source_url": "https://sh.weather.com.cn/zhyj/index.shtml",
    },
]


def main():
    if not DATA_FILE.exists():
        print(f"[backfill] {DATA_FILE} does not exist — nothing to do")
        return
    existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    seen = {w.get("raw_id") for w in existing if w.get("raw_id")}
    added = 0
    for entry in BACKFILL:
        # Fill derived fields
        dt = datetime.strptime(entry["published_at"], "%Y-%m-%dT%H:%M")
        entry["date_from"] = dt.strftime("%Y-%m-%d")
        entry["date_to"] = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
        # headline from level+type (matches scraper convention)
        # If description starts with "更新", make headline start with 更新
        is_update = "更新" in entry["description"][:60]
        entry["headline"] = (
            f"浦东新区{'更新' if is_update else '发布'}{entry['warning_type']}{entry['level']}预警"
        )
        entry["raw_id"] = f"{entry['headline']}|{entry['published_at']}"
        if entry["raw_id"] in seen:
            print(f"[backfill] skip (exists): {entry['raw_id']}")
            continue
        existing.append(entry)
        seen.add(entry["raw_id"])
        added += 1
        print(f"[backfill] + {entry['raw_id']}")

    existing.sort(key=lambda x: (x.get("date_from", ""), x.get("published_at", "")))
    DATA_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[backfill] added {added}; total now {len(existing)}")


if __name__ == "__main__":
    main()
