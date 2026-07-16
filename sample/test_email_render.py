"""
End-to-end smoke test: render the email HTML without sending.
This validates:
  - load_warnings works
  - filter_window correctly picks the 7-day slice
  - render_email_html produces valid HTML
"""

import sys
import re
from pathlib import Path
from datetime import datetime, timedelta

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Import the render functions directly without instantiating requests
import importlib.util
spec = importlib.util.spec_from_file_location("send_email", ROOT / "email" / "send_email.py")
send_email = importlib.util.module_from_spec(spec)
# Bypass the actual import of requests since we don't need it for rendering
import types
fake_requests = types.ModuleType("requests")
fake_requests.post = lambda *a, **kw: None
sys.modules["requests"] = fake_requests
spec.loader.exec_module(send_email)


def main():
    all_w = send_email.load_warnings(ROOT / "data" / "warnings.json")
    print(f"loaded {len(all_w)} warnings")
    assert len(all_w) >= 1, f"expected sample data to have ≥1 entry, got {len(all_w)}"
    # Sample should be Pudong + 橙/红 only
    for w in all_w:
        assert w["area"] == "浦东新区", f"non-pudong slipped in: {w}"
        assert w["level"] in ("橙色", "红色"), f"non-橙/红 slipped in: {w}"

    # Use a window that includes all the sample dates
    df = "2026-07-13"
    dt = "2026-07-16"
    items = send_email.filter_window(all_w, df, dt)
    print(f"filtered to {len(items)} warnings in {df} ~ {dt}")
    assert len(items) >= 1, f"expected ≥1 items in window, got {len(items)}"

    html = send_email.render_email_html(items, df, dt)
    text = send_email.render_plain_text(items, df, dt)

    out = ROOT / "email" / "preview.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote preview HTML → {out} ({len(html)} bytes)")

    # Sanity: html should mention each item's warning type and date
    for w in items:
        assert w["warning_type"] in html, f"missing type {w['warning_type']!r} in HTML"
        assert w["date_from"] in html, f"missing date_from {w['date_from']!r} in HTML"
    # Sanity: should have a table or the green "no warnings" panel
    assert ("<table" in html) or ("无" in html and "橙色" in html)
    # Sanity: level color codes present
    has_red = any(w["level"] == "红色" for w in items)
    has_orange = any(w["level"] == "橙色" for w in items)
    if has_red:
        assert "#d32f2f" in html, "red color missing"
    if has_orange:
        assert "#f57c00" in html, "orange color missing"
    assert has_red or has_orange, "expected at least one 橙/红 warning"

    # Plain text body
    print("\n--- plain text ---")
    print(text[:600])
    assert f"{df}" in text and f"{dt}" in text

    print("\n✅ email render end-to-end works")


if __name__ == "__main__":
    main()
