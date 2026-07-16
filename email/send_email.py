"""
Weekly email report generator + sender.

Two sender backends, auto-selected by env:
  - Gmail SMTP (recommended if FROM is a Gmail address) — requires
      GMAIL_ADDRESS + GMAIL_APP_PASSWORD
  - Resend HTTP API (fallback) — requires RESEND_API_KEY

Recipient env (both paths):
  EMAIL_FROM                sender display, e.g. "Weather Bot <chatchatjune@gmail.com>"
  EMAIL_TO                  comma-separated recipients

Usage:
  python send_email.py --render            # only write preview.html
  python send_email.py                     # render + send
  python send_email.py --date-from X --date-to Y
"""

from __future__ import annotations

import argparse
import json
import os
import smtplib
import sys
from datetime import datetime, timedelta
from email.message import EmailMessage
from html import escape
from pathlib import Path
from typing import Any

import requests


# Colors mirror the official CN warning system
LEVEL_COLORS = {
    "红色": "#d32f2f",
    "橙色": "#f57c00",
    "黄色": "#fbc02d",
    "蓝色": "#1976d2",
}


def load_warnings(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def filter_window(
    warnings: list[dict],
    date_from: str,
    date_to: str,
    only_pudong: bool = True,
    only_orange_red: bool = True,
) -> list[dict]:
    out = []
    for w in warnings:
        wf = w.get("date_from", "")[:10]
        wt = w.get("date_to", "")[:10]
        if not wf or wf > date_to or wt < date_from:
            continue
        if only_pudong and w.get("area") != "浦东新区":
            continue
        if only_orange_red and w.get("level") not in ("橙色", "红色"):
            continue
        out.append(w)
    out.sort(key=lambda x: (x.get("date_from", ""), x.get("published_at", "")))
    return out


def render_email_html(items: list[dict], date_from: str, date_to: str) -> str:
    """Return the full HTML body for the email."""
    head = f"""\
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>浦东新区天气预警周报</title>
</head>
<body style="font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background:#f5f7fb; padding:24px; color:#222;">
  <div style="max-width:720px; margin:0 auto; background:#fff; border-radius:8px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px; font-size:20px;">浦东新区天气预警周报</h1>
    <p style="margin:0 0 16px; color:#666; font-size:13px;">
      时间范围: <strong>{date_from}</strong> ~ <strong>{date_to}</strong> &nbsp;·&nbsp;
      仅统计 <strong>橙色 / 红色</strong> 预警 &nbsp;·&nbsp;
      生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M")}
    </p>
"""
    if not items:
        body = """\
    <div style="background:#e8f5e9; border-left:4px solid #43a047; padding:12px 16px; border-radius:4px; margin:12px 0;">
      ✅ 本周期内浦东新区 <strong>无</strong> 橙色或红色天气预警。
    </div>
"""
    else:
        rows = []
        for w in items:
            level = w.get("level", "")
            color = LEVEL_COLORS.get(level, "#666")
            rows.append(
                f"""
        <tr>
          <td style="padding:8px 6px; border-top:1px solid #eee; white-space:nowrap;">{escape(w.get('date_from',''))}<br><span style="color:#888; font-size:12px;">~ {escape(w.get('date_to',''))}</span></td>
          <td style="padding:8px 6px; border-top:1px solid #eee;"><span style="display:inline-block; padding:2px 10px; background:{color}; color:#fff; border-radius:12px; font-size:12px;">{escape(level)}</span></td>
          <td style="padding:8px 6px; border-top:1px solid #eee; font-weight:600;">{escape(w.get('warning_type',''))}</td>
          <td style="padding:8px 6px; border-top:1px solid #eee; color:#444; font-size:13px;">{escape(w.get('description',''))}</td>
        </tr>"""
            )
        body = f"""
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:#fafafa; text-align:left;">
          <th style="padding:8px 6px;">时间</th>
          <th style="padding:8px 6px;">级别</th>
          <th style="padding:8px 6px;">类型</th>
          <th style="padding:8px 6px;">详情</th>
        </tr>
      </thead>
      <tbody>{''.join(rows)}
      </tbody>
    </table>
    <p style="margin:16px 0 0; color:#888; font-size:12px;">共 {len(items)} 条预警 · 数据来源:
      <a href="https://sh.weather.com.cn/zhyj/index.shtml" style="color:#1976d2;">上海气象预警</a>
    </p>
"""
    tail = """
  </div>
</body>
</html>"""
    return head + body + tail


def render_plain_text(items: list[dict], date_from: str, date_to: str) -> str:
    lines = [f"浦东新区天气预警周报 ({date_from} ~ {date_to})", ""]
    if not items:
        lines.append("✅ 本周期内浦东新区无橙色或红色天气预警。")
        return "\n".join(lines)
    for w in items:
        lines.append(
            f"[{w.get('level')}] {w.get('warning_type')}  "
            f"{w.get('date_from')} ~ {w.get('date_to')}\n"
            f"  {w.get('description','')[:200]}"
        )
    return "\n\n".join(lines)


def send_via_gmail_smtp(
    subject: str,
    html_body: str,
    text_body: str,
    gmail_address: str,
    app_password: str,
    sender: str,
    recipients: list[str],
) -> dict:
    """
    Send via Gmail SMTP using an App Password (not the regular account password).
    Prereq: the Gmail account must have 2-Step Verification enabled, then create an
    App Password at https://myaccount.google.com/apppasswords .
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(gmail_address, app_password)
            smtp.send_message(msg)
        return {"status_code": 250, "body": {"sent": True, "to": recipients}}
    except smtplib.SMTPException as exc:
        return {"status_code": 500, "body": {"error": str(exc), "to": recipients}}


def send_via_resend(
    subject: str,
    html_body: str,
    text_body: str,
    api_key: str,
    sender: str,
    recipients: list[str],
) -> dict:
    """Resend HTTP API — https://resend.com/docs/api-reference/emails/send-email"""
    url = "https://api.resend.com/emails"
    payload = {
        "from": sender,
        "to": recipients,
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    try:
        body: Any = r.json()
    except json.JSONDecodeError:
        body = {"raw": r.text}
    return {"status_code": r.status_code, "body": body}


def last_friday_to_this_thursday(now: datetime | None = None) -> tuple[str, str]:
    """
    Returns (date_from, date_to) covering last Friday 00:00 → this Thursday 23:59.
    The job is scheduled to run on Friday morning, so:
      - date_from = today - 7 days
      - date_to   = today - 1 day
    This guarantees we always cover the previous 7 days.
    """
    now = now or datetime.now()
    return (
        (now - timedelta(days=7)).strftime("%Y-%m-%d"),
        (now - timedelta(days=1)).strftime("%Y-%m-%d"),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-file", default="data/warnings.json")
    ap.add_argument("--date-from", help="YYYY-MM-DD, defaults to 7 days ago")
    ap.add_argument("--date-to", help="YYYY-MM-DD, defaults to yesterday")
    ap.add_argument("--render", action="store_true", help="only write preview.html, do not send")
    args = ap.parse_args()

    df, dt = (
        (args.date_from, args.date_to)
        if args.date_from and args.date_to
        else last_friday_to_this_thursday()
    )

    data_path = Path(__file__).resolve().parent.parent / args.data_file
    all_w = load_warnings(data_path)
    items = filter_window(all_w, df, dt)

    subject = f"📡 浦东新区天气预警周报 ({df} ~ {dt}) — {len(items)} 条橙/红预警"
    html_body = render_email_html(items, df, dt)
    text_body = render_plain_text(items, df, dt)

    preview_path = Path(__file__).resolve().parent / "preview.html"
    preview_path.write_text(html_body, encoding="utf-8")
    print(f"[email] rendered preview → {preview_path}")
    print(f"[email] subject: {subject}")
    print(f"[email] items: {len(items)}")

    if args.render:
        return

    sender = os.environ.get("EMAIL_FROM", "")
    recipients_env = os.environ.get("EMAIL_TO", "")
    if not (sender and recipients_env):
        print("[email] missing EMAIL_FROM / EMAIL_TO env; set them to actually send.", file=sys.stderr)
        sys.exit(2)
    recipients = [r.strip() for r in recipients_env.split(",") if r.strip()]

    # Pick the sender backend: Gmail SMTP if GMAIL_ADDRESS is set, else Resend.
    gmail_address = os.environ.get("GMAIL_ADDRESS", "")
    gmail_app_password = os.environ.get("GMAIL_APP_PASSWORD", "")
    resend_api_key = os.environ.get("RESEND_API_KEY", "")

    if gmail_address and gmail_app_password:
        print(f"[email] sending via Gmail SMTP as {sender} → {recipients}")
        result = send_via_gmail_smtp(
            subject, html_body, text_body,
            gmail_address, gmail_app_password, sender, recipients,
        )
    elif resend_api_key:
        print(f"[email] sending via Resend API as {sender} → {recipients}")
        result = send_via_resend(
            subject, html_body, text_body,
            resend_api_key, sender, recipients,
        )
    else:
        print(
            "[email] no send backend configured.\n"
            "        Set GMAIL_ADDRESS + GMAIL_APP_PASSWORD (recommended) or RESEND_API_KEY.",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"[email] response: {result}")
    if result["status_code"] >= 300:
        sys.exit(1)


if __name__ == "__main__":
    main()
