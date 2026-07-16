"""Standalone test of the parser — no external deps required.

We inline-copy the regex + dataclass + parsing logic from scraper.py so the
test can run on a machine without requests/bs4 installed. The logic is
identical to scraper.py.
"""

import re
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta


LEVEL_RE = re.compile(r"(红色|橙色|黄色|蓝色)")
PUDONG_AREA_RE = re.compile(r"浦东(?:新区|新?区)?")

PUBLISH_RE = re.compile(
    r"(?P<issuer>[^，。\s]{2,15}(?:气象台|气象局|预警发布中心))"
    r"(?P<date>\d{4}年\d{1,2}月\d{1,2}日)"
    r"(?P<time>\d{1,2}时\d{1,2}分)"
    r"(?P<action>发布|更新[^为]*?为)"
    r"(?P<body>.+?)(?=\n|$)",
    re.MULTILINE | re.DOTALL,
)


@dataclass
class Warning:
    headline: str
    warning_type: str
    level: str
    area: str
    published_at: str
    date_from: str
    date_to: str
    description: str
    source: str
    source_url: str = ""
    raw_id: str = ""

    def to_dict(self):
        return asdict(self)


def parse_warning_text(text, source, source_url=""):
    text = text.replace("\u3000", " ").strip()
    for m in PUBLISH_RE.finditer(text):
        body = m.group("body").strip()
        body = re.split(r"\(预警信息来源", body)[0].strip()

        level_match = LEVEL_RE.search(body)
        if not level_match:
            continue
        level = level_match.group(1)
        if level not in ("橙色", "红色"):
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
            try:
                dt = datetime.strptime(
                    f"{date_s.replace('-0', '-')} {time_s}", "%Y-%m-%d %H:%M"
                )
                published_at = dt.isoformat(timespec="minutes")
                date_from = dt.strftime("%Y-%m-%d")
                date_to = (dt + timedelta(days=1)).strftime("%Y-%m-%d")
            except ValueError:
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


REAL_SAMPLES = """
浦东新区气象台2026年07月16日07时26分发布高温橙色预警[Ⅱ级/严重]:预计本区大部分街镇今天的最高气温将超过37℃,请注意防范强高温对工农业生产、人体健康、大功率电气设备的不利影响,注意用火用电安全。(预警信息来源:国家预警信息发布中心)

浦东新区气象台2023年07月12日11时26分发布高温橙色预警[Ⅱ级/严重]:受副热带高压影响,预计本区中北部街镇今天的最高气温将超过37℃,高温黄色预警信号更新为高温橙色预警信号,请注意防范强高温对工农业生产、人体健康的不利影响,确保生产、消防、用电等方面的安全。防御指南:1.有关部门和单位按照职责落实防暑降温保障措施;2.尽量避免在高温时段进行户外活动,高温条件下作业的人员应当缩短连续工作时间;3.对老、弱、病、幼人群提供防暑降温指导,并采取必要的防护措施;4.有关部门和单位应当注意防范因用电量过高,以及电线、变压器等电力负载过大而引发的火灾。

浦东新区气象局2023年06月24日05时12分发布暴雨橙色预警[Ⅱ级/严重]:受梅雨带北抬影响,预计今天傍晚以前本区三林等中北部街镇将出现6小时累积降水量达100毫米以上的强降水,暴雨黄色预警信号更新为暴雨橙色预警信号,强降雨可能引发城市积涝、农田受淹、交通拥堵等情况,致灾风险很高,请特别加强防范。

浦东新区气象局2024年08月03日12时06分发布高温红色预警[Ⅰ级/特别严重]:受副热带高压影响,预计本区部分街镇今天的最高气温将超过40℃,高温橙色预警信号更新为高温红色预警信号,请特别加强防范强高温对工农业生产、人体健康的不利影响,确保生产、消防、用电等方面的安全。

上海市浦东新区气象台2023年09月11日16时22分更新暴雨橙色预警信号为暴雨红色预警信号:受较强的降水云团影响,预计未来6小时内本区花木街道将出现1小时100毫米以上的短时强降水,暴雨橙色预警信号更新为暴雨红色预警信号,强降雨可能引发城市积涝、农田受淹、交通堵塞等情况,致灾风险极高,请特别加强防范。

上海市徐汇区气象台2024年8月5日10时00分发布高温橙色预警:这条应该被忽略,因为不是浦东。

上海中心气象台2023年09月11日16时02分更新暴雨蓝色预警信号为暴雨黄色预警信号:这条应该被忽略,因为是上海中心台而非浦东气象台,且是黄色不是橙红。

浦东新区气象台2023年08月03日08时00分发布雷电黄色预警:这条应该被忽略,因为是黄色。
"""


def main():
    parsed = list(parse_warning_text(REAL_SAMPLES, source="test"))
    print(f"Parsed {len(parsed)} warnings")
    print()
    for w in parsed:
        print(f"  [{w.level}] {w.warning_type} | {w.headline} ({w.date_from})")
        print(f"    published_at: {w.published_at}")
        print(f"    raw_id: {w.raw_id}")
        print(f"    description[:60]: {w.description[:60]}…")
        print()

    types = {w.warning_type for w in parsed}
    levels = {w.level for w in parsed}
    assert len(parsed) == 5, f"expected 5 warnings, got {len(parsed)}"
    assert all(w.area == "浦东新区" for w in parsed), "non-pudong slipped through"
    assert "高温" in types
    assert "暴雨" in types
    assert "橙色" in levels
    assert "红色" in levels
    print("✅ all assertions passed — parser correctly filters Pudong + orange/red")


if __name__ == "__main__":
    main()
