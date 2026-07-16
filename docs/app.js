/* =============================================================
   Pudong Weather Alert — H5 page logic
   ============================================================= */
(() => {
  "use strict";

  const DATA_URL = "data/warnings.json";
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  // ---------- state ----------
  let all = [];
  let filtered = [];
  let calYear, calMonth; // 0-indexed month

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- data ----------
  async function loadData() {
    try {
      const r = await fetch(DATA_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      all = await r.json();
    } catch (e) {
      console.error("[load] failed:", e);
      all = [];
    }
    filtered = applyFilters();
    renderAll();
  }

  function applyFilters() {
    const q = ($("#search").value || "").trim().toLowerCase();
    const level = $("#levelFilter").value;
    const area = $("#areaFilter").value;
    return all.filter((w) => {
      if (level && w.level !== level) return false;
      if (area && w.area !== area) return false;
      if (q) {
        const hay = `${w.warning_type} ${w.description} ${w.headline}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // ---------- summary tiles ----------
  function renderSummary() {
    const red = filtered.filter((w) => w.level === "红色").length;
    const orange = filtered.filter((w) => w.level === "橙色").length;
    const days = new Set(filtered.map((w) => w.date_from)).size;
    const types = new Set(filtered.map((w) => w.warning_type)).size;
    $("#cntRed").textContent = red;
    $("#cntOrange").textContent = orange;
    $("#cntDays").textContent = days;
    $("#cntTypes").textContent = types;
  }

  // ---------- calendar ----------
  function calendarFor(year, month) {
    const first = new Date(year, month, 1);
    const startDay = first.getDay();          // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // build a map date -> warnings
    const map = new Map();
    for (const w of filtered) {
      const from = w.date_from?.slice(0, 10);
      const to = w.date_to?.slice(0, 10) || from;
      if (!from) continue;
      // walk each day [from, to]
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const k = dateKey(cur);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(w);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const cal = $("#calendar");
    cal.innerHTML = "";
    // weekday header
    for (const wd of WEEKDAYS) {
      const el = document.createElement("div");
      el.className = "calendar__weekday";
      el.textContent = wd;
      cal.appendChild(el);
    }
    // leading blanks
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement("div");
      el.className = "calendar__cell calendar__cell--empty";
      cal.appendChild(el);
    }
    // days
    const today = todayISO();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const k = dateKey(date);
      const ws = map.get(k) || [];
      const cell = document.createElement("div");
      cell.className = "calendar__cell";
      if (k === today) cell.classList.add("calendar__cell--today");

      if (ws.length) {
        cell.classList.add("calendar__cell--has-warning");
        const levels = new Set(ws.map((w) => w.level));
        if (levels.has("红色") && levels.has("橙色")) {
          cell.classList.add("cell-bg--mix");
        } else if (levels.has("红色")) {
          cell.classList.add("cell-bg--red");
        } else {
          cell.classList.add("cell-bg--orange");
        }
        // collect types, show up to 2 chips
        const types = [...new Set(ws.map((w) => w.warning_type))];
        const chipsHtml = types
          .slice(0, 2)
          .map((t) => {
            const maxLevel = ws.filter((w) => w.warning_type === t).map((w) => w.level).includes("红色") ? "red" : "orange";
            return `<span class="calendar__chip chip--${maxLevel}">${escapeHtml(t)}</span>`;
          })
          .join("");
        const more = types.length > 2 ? `<span class="calendar__chip chip--more">+${types.length - 2}</span>` : "";
        cell.innerHTML = `<div class="calendar__date">${d}</div><div class="calendar__chips">${chipsHtml}${more}</div>`;
        cell.addEventListener("click", () => showDayDetail(k));
      } else {
        cell.innerHTML = `<div class="calendar__date">${d}</div>`;
      }
      cal.appendChild(cell);
    }

    $("#calLabel").textContent = `${year} 年 ${month + 1} 月`;
  }

  function showDayDetail(dateISO) {
    const ws = filtered.filter((w) => {
      const from = w.date_from?.slice(0, 10);
      const to = w.date_to?.slice(0, 10) || from;
      return dateISO >= from && dateISO <= to;
    });
    if (!ws.length) return;
    $("#detailDate").textContent = `${dateISO} — ${ws.length} 条橙/红预警`;
    $("#detailList").innerHTML = ws
      .map(
        (w) => `
        <div class="detail-item detail-item--${w.level === "红色" ? "red" : "orange"}">
          <div class="detail-item__head">
            <span class="badge badge--${w.level === "红色" ? "red" : "orange"}">${escapeHtml(w.level)}</span>
            <strong>${escapeHtml(w.warning_type)}</strong>
            <span class="muted small">${escapeHtml(w.headline)}</span>
          </div>
          <div class="detail-item__desc">${escapeHtml(w.description)}</div>
          <div class="detail-item__time">发布: ${escapeHtml(w.published_at ?? "")} · 生效: ${escapeHtml(w.date_from ?? "")} ~ ${escapeHtml(w.date_to ?? "")}</div>
        </div>`
      )
      .join("");
    $("#detailSection").classList.remove("section--hidden");
    $("#detailSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- raw table ----------
  function renderTable() {
    const body = $("#rawTableBody");
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted center">暂无符合条件的预警记录。</td></tr>`;
      return;
    }
    body.innerHTML = filtered
      .map(
        (w) => `
        <tr>
          <td>${escapeHtml(w.date_from ?? "")}</td>
          <td>${escapeHtml(w.date_to ?? "")}</td>
          <td>${escapeHtml(w.published_at ?? "")}</td>
          <td><span class="badge badge--${w.level === "红色" ? "red" : "orange"}">${escapeHtml(w.level)}</span></td>
          <td>${escapeHtml(w.warning_type ?? "")}</td>
          <td>${escapeHtml(w.area ?? "")}</td>
          <td class="desc-cell">${escapeHtml(w.description ?? "")}</td>
        </tr>`
      )
      .join("");
  }

  // ---------- meta ----------
  function renderMeta() {
    if (!all.length) {
      $("#lastUpdated").textContent = "暂无数据 · 等待 GitHub Actions 抓取";
      return;
    }
    const latest = all
      .map((w) => w.published_at ?? w.date_from ?? "")
      .filter(Boolean)
      .sort()
      .pop();
    $("#lastUpdated").textContent = `数据更新于 ${latest.slice(0, 16).replace("T", " ")}`;
  }

  // ---------- main render ----------
  function renderAll() {
    renderMeta();
    renderSummary();
    calendarFor(calYear, calMonth);
    renderTable();
  }

  // ---------- init ----------
  function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    $("#calPrev").addEventListener("click", () => {
      calMonth -= 1;
      if (calMonth < 0) { calMonth = 11; calYear -= 1; }
      calendarFor(calYear, calMonth);
    });
    $("#calNext").addEventListener("click", () => {
      calMonth += 1;
      if (calMonth > 11) { calMonth = 0; calYear += 1; }
      calendarFor(calYear, calMonth);
    });
    $("#calToday").addEventListener("click", () => {
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth();
      calendarFor(calYear, calMonth);
    });
    $("#detailClose").addEventListener("click", () => $("#detailSection").classList.add("section--hidden"));
    $("#search").addEventListener("input", () => { filtered = applyFilters(); renderAll(); });
    $("#levelFilter").addEventListener("change", () => { filtered = applyFilters(); renderAll(); });
    $("#areaFilter").addEventListener("change", () => { filtered = applyFilters(); renderAll(); });

    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
