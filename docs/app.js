/* =============================================================
   Pudong Weather Alert — H5 page logic
   ============================================================= */
(() => {
  "use strict";

  const DATA_URL = "data/warnings.json";
  const META_URL = "data/_meta.json";
  const LS_KEY = "pudong-weather-alert:edited-data";
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const REPO_RAW_URL = "https://github.com/Controng/pudong-weather-alert/edit/main/data/warnings.json";

  // Warning type → emoji icon
  const ICONS = {
    "高温": "🌡️",
    "暴雨": "🌧️",
    "雷电": "⚡",
    "台风": "🌀",
    "寒潮": "🥶",
    "暴雪": "❄️",
    "大雾": "🌫️",
    "大风": "💨",
    "冰雹": "🧊",
    "干旱": "🏜️",
    "霜冻": "🌨️",
    "道路结冰": "🛣️",
    "沙尘暴": "🌪️",
    "霾": "😷",
    "森林火险": "🔥",
    "未知": "⚠️",
  };
  const typeIcon = (t) => ICONS[t] || "⚠️";

  // ---------- state ----------
  /** @type {Array<object>} */ let original = [];   // last loaded from server
  /** @type {object} */ let meta = {};              // last loaded from _meta.json
  /** @type {Array<object>} */ let working = [];     // current displayed (may = original or edited)
  let editMode = false;
  let filtered = [];
  let calYear, calMonth;
  /** @type {string|null} */ let editingRawId = null;

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);

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

  function showToast(msg, type = "info") {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:6px;z-index:200;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:opacity .3s;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === "error" ? "#d32f2f" : type === "success" ? "#43a047" : "#333";
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = "0"; }, 2400);
  }

  // ---------- data load ----------
  async function loadOriginal() {
    try {
      const r = await fetch(DATA_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      original = await r.json();
    } catch (e) {
      console.error("[load] failed:", e);
      original = [];
    }
    try {
      const r2 = await fetch(META_URL, { cache: "no-store" });
      if (r2.ok) meta = await r2.json();
      else meta = {};
    } catch (_) { meta = {}; }
    // If we have unsaved edits in localStorage, prefer them.
    const saved = loadEditedFromLS();
    working = saved || original.slice();
    filtered = applyFilters();
    renderAll();
  }

  function loadEditedFromLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* ignore */ }
    return null;
  }
  function saveEditedToLS(arr) {
    if (!arr) {
      localStorage.removeItem(LS_KEY);
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    }
  }
  function isDirty() {
    const saved = loadEditedFromLS();
    return saved !== null;
  }
  function applyWorking() {
    working = loadEditedFromLS() || original.slice();
    filtered = applyFilters();
  }

  // ---------- filters ----------
  function applyFilters() {
    const q = ($("#search").value || "").trim().toLowerCase();
    const level = $("#levelFilter").value;
    return working.filter((w) => {
      if (level && w.level !== level) return false;
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
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const map = new Map();
    for (const w of filtered) {
      const from = w.date_from?.slice(0, 10);
      const to = w.date_to?.slice(0, 10) || from;
      if (!from) continue;
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
    for (const wd of WEEKDAYS) {
      const el = document.createElement("div");
      el.className = "calendar__weekday";
      el.textContent = wd;
      cal.appendChild(el);
    }
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement("div");
      el.className = "calendar__cell calendar__cell--empty";
      cal.appendChild(el);
    }
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
        // Show up to 2 distinct type chips, with icon
        const types = [...new Set(ws.map((w) => w.warning_type))];
        const chipsHtml = types
          .slice(0, 2)
          .map((t) => {
            const hasRed = ws.some((w) => w.warning_type === t && w.level === "红色");
            const cls = hasRed ? "chip--red" : "chip--orange";
            return `<span class="calendar__chip ${cls}"><span class="type-icon">${typeIcon(t)}</span>${escapeHtml(t)}</span>`;
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
      .map((w) => {
        const levelClass = w.level === "红色" ? "red" : (w.level === "橙色" ? "orange" : (w.level === "黄色" ? "yellow" : "blue"));
        const actions = editMode
          ? `<button class="btn btn--sm" data-action="edit" data-id="${escapeHtml(w.raw_id)}">编辑</button>
             <button class="btn btn--sm btn--danger" data-action="delete" data-id="${escapeHtml(w.raw_id)}">删除</button>`
          : "";
        return `
        <div class="detail-item detail-item--${levelClass}">
          <div class="detail-item__head">
            <span class="badge badge--${levelClass}"><span class="type-icon">${typeIcon(w.warning_type)}</span>${escapeHtml(w.level)}</span>
            <strong><span class="type-icon type-icon--lg">${typeIcon(w.warning_type)}</span> ${escapeHtml(w.warning_type)}</strong>
            <span class="muted small">${escapeHtml(w.headline)}</span>
          </div>
          <div class="detail-item__desc">${escapeHtml(w.description)}</div>
          <div class="detail-item__time">发布: ${escapeHtml(w.published_at ?? "")} · 生效: ${escapeHtml(w.date_from ?? "")} ~ ${escapeHtml(w.date_to ?? "")}</div>
          ${actions ? `<div class="row-actions" style="margin-top:8px;">${actions}</div>` : ""}
        </div>`;
      })
      .join("");
    $("#detailSection").classList.remove("section--hidden");
    $("#detailSection").scrollIntoView({ behavior: "smooth", block: "start" });

    // Wire action buttons
    $("#detailList").querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "edit") openEditModal(working.find((w) => w.raw_id === id));
        if (action === "delete") deleteEntry(id);
      });
    });
  }

  // ---------- raw table ----------
  function renderTable() {
    const body = $("#rawTableBody");
    if (!filtered.length) {
      const cols = editMode ? 8 : 7;
      body.innerHTML = `<tr><td colspan="${cols}" class="muted center">暂无符合条件的预警记录。</td></tr>`;
      return;
    }
    body.innerHTML = filtered
      .map((w) => {
        const levelClass = w.level === "红色" ? "red" : (w.level === "橙色" ? "orange" : (w.level === "黄色" ? "yellow" : "blue"));
        const actions = editMode
          ? `<button class="btn btn--sm" data-action="edit" data-id="${escapeHtml(w.raw_id)}">编辑</button>
             <button class="btn btn--sm btn--danger" data-action="delete" data-id="${escapeHtml(w.raw_id)}">删除</button>`
          : "";
        return `
        <tr>
          <td>${escapeHtml(w.date_from ?? "")}</td>
          <td>${escapeHtml(w.date_to ?? "")}</td>
          <td>${escapeHtml(w.published_at ?? "")}</td>
          <td><span class="badge badge--${levelClass}">${escapeHtml(w.level)}</span></td>
          <td><span class="type-icon">${typeIcon(w.warning_type)}</span> ${escapeHtml(w.warning_type)}</td>
          <td>${escapeHtml(w.area ?? "")}</td>
          <td class="desc-cell">${escapeHtml(w.description ?? "")}</td>
          <td class="edit-only ${editMode ? "" : "hidden"} row-actions">${actions}</td>
        </tr>`;
      })
      .join("");

    body.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === "edit") openEditModal(working.find((w) => w.raw_id === id));
        if (action === "delete") deleteEntry(id);
      });
    });
  }

  // ---------- meta ----------
  function fmtDate(s) {
    if (!s) return "—";
    return s.slice(0, 16).replace("T", " ");
  }
  function renderMeta() {
    // 「页面更新」: from _meta.json's last_scraped
    const scraped = meta.last_scraped;
    $("#pageUpdated").textContent = scraped ? fmtDate(scraped) : "—";

    // 「最新预警」: latest published_at in data
    if (!working.length) {
      $("#lastUpdated").textContent = "暂无数据";
    } else {
      const latest = working
        .map((w) => w.published_at ?? w.date_from ?? "")
        .filter(Boolean)
        .sort()
        .pop();
      $("#lastUpdated").textContent = fmtDate(latest);
    }
    // Dirty hint
    if (isDirty()) {
      $("#lastUpdated").title = "本地有未导出的修改";
      $("#lastUpdated").style.color = "var(--orange)";
    } else {
      $("#lastUpdated").title = "";
      $("#lastUpdated").style.color = "";
    }
  }

  // ---------- main render ----------
  function renderAll() {
    renderMeta();
    renderSummary();
    calendarFor(calYear, calMonth);
    renderTable();
  }

  // ---------- edit mode ----------
  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("edit-mode", on);
    $("#editToggle").classList.toggle("active", on);
    $("#editToggle").textContent = on ? "✏️ 退出编辑" : "✏️ 编辑";
    $("#editBanner").classList.toggle("hidden", !on);
    document.querySelectorAll(".edit-only").forEach((el) => el.classList.toggle("hidden", !on));
    $("#addBtn").classList.toggle("hidden", !on);
    renderAll();
  }

  function openEditModal(entry) {
    editingRawId = entry?.raw_id || null;
    $("#editModalTitle").textContent = entry ? "编辑预警" : "添加预警";
    const form = $("#editForm");
    form.warning_type.value = entry?.warning_type || "高温";
    form.level.value = entry?.level || "橙色";
    form.area.value = entry?.area || "浦东新区";
    form.date_from.value = entry?.date_from || todayISO();
    form.date_to.value = entry?.date_to || todayISO();
    form.published_at.value = (entry?.published_at || "").slice(0, 16) || todayISO() + "T08:00";
    form.description.value = entry?.description || "";
    $("#editModal").classList.remove("hidden");
  }
  function closeEditModal() { $("#editModal").classList.add("hidden"); editingRawId = null; }

  function saveForm(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.warning_type || !data.level || !data.date_from || !data.date_to) {
      showToast("请填写完整必填项", "error");
      return;
    }
    applyWorking();
    const published = data.published_at.length === 16 ? data.published_at : (data.published_at + ":00");
    const headline = `${data.area}发布${data.warning_type}${data.level}预警`;
    const newEntry = {
      headline,
      warning_type: data.warning_type,
      level: data.level,
      area: data.area,
      published_at: published,
      date_from: data.date_from,
      date_to: data.date_to,
      description: data.description,
      source: "manual",
      source_url: "",
      raw_id: editingRawId || `${headline}|${published}`,
    };
    if (editingRawId) {
      const idx = working.findIndex((w) => w.raw_id === editingRawId);
      if (idx >= 0) working[idx] = newEntry;
      else working.push(newEntry);
    } else {
      if (working.some((w) => w.raw_id === newEntry.raw_id)) {
        showToast("已存在同一条记录", "error");
        return;
      }
      working.push(newEntry);
    }
    working.sort((a, b) => (a.date_from || "").localeCompare(b.date_from || ""));
    saveEditedToLS(working);
    closeEditModal();
    filtered = applyFilters();
    renderAll();
    showToast("已暂存到浏览器（记得点「保存并导出」上传到 GitHub）", "success");
  }

  function deleteEntry(rawId) {
    if (!confirm("确认删除这条预警？")) return;
    applyWorking();
    working = working.filter((w) => w.raw_id !== rawId);
    saveEditedToLS(working);
    filtered = applyFilters();
    renderAll();
    $("#detailSection").classList.add("section--hidden");
    showToast("已删除（记得导出后上传到 GitHub）", "success");
  }

  function resetToOriginal() {
    if (!confirm("放弃所有本地修改，恢复到 GitHub 上的原始数据？")) return;
    saveEditedToLS(null);
    working = original.slice();
    filtered = applyFilters();
    renderAll();
    showToast("已恢复原始数据", "success");
  }

  function openExportModal() {
    applyWorking();
    const json = JSON.stringify(working, null, 2);
    $("#exportText").value = json;
    $("#exportModal").classList.remove("hidden");
  }
  function closeExportModal() { $("#exportModal").classList.add("hidden"); }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText($("#exportText").value);
      showToast("JSON 已复制到剪贴板", "success");
    } catch (e) {
      // fallback
      $("#exportText").select();
      document.execCommand("copy");
      showToast("JSON 已复制（兼容模式）", "success");
    }
  }
  function downloadExport() {
    const blob = new Blob([$("#exportText").value], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "warnings.json";
    a.click();
    URL.revokeObjectURL(a.href);
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

    // Edit mode
    $("#editToggle").addEventListener("click", () => setEditMode(!editMode));
    $("#exitEditBtn").addEventListener("click", () => setEditMode(false));
    $("#resetBtn").addEventListener("click", resetToOriginal);
    $("#addBtn").addEventListener("click", () => openEditModal(null));
    $("#exportBtn").addEventListener("click", openExportModal);
    $("#editForm").addEventListener("submit", saveForm);
    document.querySelectorAll("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", () => {
        closeEditModal();
        closeExportModal();
      });
    });
    $("#copyBtn").addEventListener("click", copyExport);
    $("#downloadBtn").addEventListener("click", downloadExport);
    $("#openGitHubBtn").href = REPO_RAW_URL;

    loadOriginal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
