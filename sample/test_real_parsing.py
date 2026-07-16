"""Quick test harness for the parser using real-world Pudong warning samples."""

import sys
import json
from pathlib import Path

# Make the scraper module importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper.scraper import (
    parse_warning_text,
    filter_pudong_orange_red,
)


REAL_SAMPLES = """
浦东新区气象台2026年07月16日07时26分发布高温橙色预警[Ⅱ级/严重]:预计本区大部分街镇今天的最高气温将超过37℃,请注意防范强高温对工农业生产、人体健康、大功率电气设备的不利影响,注意用火用电安全。(预警信息来源:国家预警信息发布中心)

浦东新区气象台2023年07月12日11时26分发布高温橙色预警[Ⅱ级/严重]:受副热带高压影响,预计本区中北部街镇今天的最高气温将超过37℃,高温黄色预警信号更新为高温橙色预警信号,请注意防范强高温对工农业生产、人体健康的不利影响,确保生产、消防、用电等方面的安全。防御指南:1.有关部门和单位按照职责落实防暑降温保障措施;2.尽量避免在高温时段进行户外活动,高温条件下作业的人员应当缩短连续工作时间;3.对老、弱、病、幼人群提供防暑降温指导,并采取必要的防护措施;4.有关部门和单位应当注意防范因用电量过高,以及电线、变压器等电力负载过大而引发的火灾。

浦东新区气象局2023年06月24日05时12分发布暴雨橙色预警[Ⅱ级/严重]:受梅雨带北抬影响,预计今天傍晚以前本区三林等中北部街镇将出现6小时累积降水量达100毫米以上的强降水,暴雨黄色预警信号更新为暴雨橙色预警信号,强降雨可能引发城市积涝、农田受淹、交通拥堵等情况,致灾风险很高,请特别加强防范。

浦东新区气象局2024年08月03日12时06分发布高温红色预警[Ⅰ级/特别严重]:受副热带高压影响,预计本区部分街镇今天的最高气温将超过40℃,高温橙色预警信号更新为高温红色预警信号,请特别加强防范强高温对工农业生产、人体健康的不利影响,确保生产、消防、用电等方面的安全。

上海市浦东新区气象台2023年09月11日16时22分更新暴雨橙色预警信号为暴雨红色预警信号:受较强的降水云团影响,预计未来6小时内本区花木街道将出现1小时100毫米以上的短时强降水,暴雨橙色预警信号更新为暴雨红色预警信号,强降雨可能引发城市积涝、农田受淹、交通堵塞等情况,致灾风险极高,请特别加强防范。

上海市徐汇区气象台2024年8月5日10时00分发布高温橙色预警:这条应该被忽略,因为不是浦东。

上海中心气象台2023年09月11日16时02分更新暴雨蓝色预警信号为暴雨黄色预警信号:这条应该被忽略,因为是上海中心台而非浦东气象台,且是黄色不是橙红。
"""


def main():
    parsed = list(parse_warning_text(REAL_SAMPLES, source="test", source_url=""))
    print(f"Parsed {len(parsed)} warnings total")
    print("--- All parsed (should be only Pudong + 橙/红) ---")
    for w in parsed:
        print(json.dumps(w.to_dict(), ensure_ascii=False, indent=2))
        print()

    filtered = filter_pudong_orange_red(parsed)
    print(f"--- Filtered (pudong + 橙/红): {len(filtered)} ---")
    for w in filtered:
        print(f"  [{w.level}] {w.headline} ({w.date_from})")

    # Sanity: must include the high-temp orange + the rainstorm red
    types = {w.warning_type for w in filtered}
    levels = {w.level for w in filtered}
    assert "高温" in types, "expected 高温 type to be present"
    assert "暴雨" in types, "expected 暴雨 type to be present"
    assert "橙色" in levels, "expected 橙色 level"
    assert "红色" in levels, "expected 红色 level"
    assert all(w.area == "浦东新区" for w in filtered), "non-pudong slipped through"
    print("\nOK — parser correctly identifies Pudong + orange/red warnings only.")


if __name__ == "__main__":
    main()
