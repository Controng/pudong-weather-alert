/* =============================================================
   Pudong Weather Alert — H5 page logic v4
   =============================================================
   - Multi-select level filter (default: red + orange)
   - Per-type color stripes in calendar cells
   - Monthly summary tiles synced with calendar view + filter
   - Tooltips showing official warning definitions
   ============================================================= */
(() => {
  "use strict";

  const DATA_URL = "data/warnings.json";
  const META_URL = "data/_meta.json";
  const LS_KEY = "pudong-weather-alert:edited-data";
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const REPO_RAW_URL = "https://github.com/Controng/pudong-weather-alert/edit/main/data/warnings.json";

  // ---- Type → color (per-type, used in cell stripes) ----
  // TYPE_COLORS: saturated version (used for chips, badges, type icons)
  // TYPE_COLORS_SOFT: pastel version (used as cell background — easier on eyes)
  const TYPE_COLORS = {
    "高温": "#e53935",
    "暴雨": "#1e88e5",
    "雷电": "#8e24aa",
    "台风": "#00838f",
    "寒潮": "#0288d1",
    "暴雪": "#78909c",
    "大雾": "#90a4ae",
    "大风": "#43a047",
    "冰雹": "#5e35b1",
    "干旱": "#bf360c",
    "霾": "#616161",
    "道路结冰": "#00bcd4",
    "沙尘暴": "#e65100",
    "森林火险": "#d32f2f",
    "霜冻": "#4fc3f7",
    "未知": "#9e9e9e",
  };
  const TYPE_COLORS_SOFT = {
    "高温": "#ffcdd2",     // light red
    "暴雨": "#bbdefb",     // light blue
    "雷电": "#e1bee7",     // light purple
    "台风": "#b2ebf2",     // light cyan
    "寒潮": "#b3e5fc",     // light sky
    "暴雪": "#cfd8dc",     // light blue grey
    "大雾": "#cfd8dc",
    "大风": "#c8e6c9",     // light green
    "冰雹": "#d1c4e9",
    "干旱": "#ffccbc",
    "霾": "#e0e0e0",
    "道路结冰": "#b2ebf2",
    "沙尘暴": "#ffe0b2",
    "森林火险": "#ffcdd2",
    "霜冻": "#b3e5fc",
    "未知": "#eeeeee",
  };
  const typeColor = (t) => TYPE_COLORS[t] || TYPE_COLORS["未知"];
  const typeColorSoft = (t) => TYPE_COLORS_SOFT[t] || TYPE_COLORS_SOFT["未知"];
  const typeIcon = (t) => {
    const m = {
      "高温": "🌡️", "暴雨": "🌧️", "雷电": "⚡", "台风": "🌀",
      "寒潮": "🥶", "暴雪": "❄️", "大雾": "🌫️", "大风": "💨",
      "冰雹": "🧊", "干旱": "🏜️", "霾": "😷", "道路结冰": "🛣️",
      "沙尘暴": "🌪️", "森林火险": "🔥", "霜冻": "🌨️", "未知": "⚠️",
    };
    return m[t] || "⚠️";
  };

  // ---- Level + type-level official definitions (for tooltips) ----
  const LEVEL_GENERAL = {
    "蓝色": "蓝色 (Ⅳ级 / 一般): 12-24小时内可能或已受影响,程度一般",
    "黄色": "黄色 (Ⅲ级 / 较重): 24小时内可能或已受影响,程度较重",
    "橙色": "橙色 (Ⅱ级 / 严重): 24小时内可能或已受影响,程度严重",
    "红色": "红色 (Ⅰ级 / 特别严重): 24小时内可能或已受影响,程度特别严重",
  };

  // 官方定义（节选自中国气象局《气象灾害预警信号发布与传播办法》及相关地方标准）
  const TYPE_LEVEL_SPECIFIC = {
    "高温": {
      "黄色": "24小时内最高气温将升至35℃以上",
      "橙色": "24小时内最高气温将升至37℃以上",
      "红色": "24小时内最高气温将升至40℃以上",
    },
    "暴雨": {
      "蓝色": "12小时内累积降水量将达50毫米以上,或已出现明显降水且可能持续",
      "黄色": "6小时内累积降水量将达50毫米以上,或12小时内将达100毫米以上",
      "橙色": "3小时内累积降水量将达50毫米以上,或6小时内将达100毫米以上,或12小时内将达150毫米以上",
      "红色": "3小时内累积降水量将达100毫米以上,或6小时内将达200毫米以上",
    },
    "雷电": {
      "黄色": "6小时内可能发生雷电活动,可能会造成雷电灾害事故",
      "橙色": "2小时内发生雷电活动的可能性很大,或者已经受雷电影响",
      "红色": "2小时内发生雷电活动的可能性非常大,或者已经受雷电影响且可能持续",
    },
    "台风": {
      "蓝色": "24小时内可能或已受热带气旋影响,平均风力6级以上或阵风8级以上",
      "黄色": "24小时内可能或已受热带气旋影响,平均风力8级以上或阵风10级以上",
      "橙色": "12小时内可能或已受热带气旋影响,平均风力10级以上或阵风12级以上",
      "红色": "6小时内可能或已受热带气旋影响,平均风力12级以上或阵风14级以上",
    },
    "大风": {
      "蓝色": "24小时内可能受大风影响,平均风力6级以上或阵风7级以上",
      "黄色": "12小时内可能受大风影响,平均风力8级以上或阵风9级以上",
      "橙色": "6小时内可能受大风影响,平均风力10级以上或阵风11级以上",
      "红色": "6小时内可能受大风影响,平均风力12级以上或阵风13级以上",
    },
    "大雾": {
      "黄色": "12小时内可能出现能见度小于500米的浓雾",
      "橙色": "6小时内可能出现能见度小于200米的浓雾",
      "红色": "2小时内可能出现能见度小于50米的强浓雾",
    },
    "霾": {
      "黄色": "12小时内可能出现能见度小于3000米的霾",
      "橙色": "6小时内可能出现能见度小于2000米的霾",
      "红色": "2小时内可能出现能见度小于1000米的霾",
    },
    "暴雪": {
      "蓝色": "12小时内可能出现对交通或农业有影响的降雪",
      "黄色": "12小时内可能出现对交通或农业有较大影响的降雪",
      "橙色": "6小时内可能出现对交通或农业有较大影响的降雪",
      "红色": "6小时内可能出现对交通或农业有重大影响的降雪",
    },
    "寒潮": {
      "蓝色": "48小时内最低气温降幅达8℃以上",
      "黄色": "48小时内最低气温降幅达10℃以上",
      "橙色": "24小时内最低气温降幅达12℃以上",
      "红色": "24小时内最低气温降幅达16℃以上",
    },
    "冰雹": {
      "黄色": "6小时内可能出现冰雹天气",
      "橙色": "6小时内出现冰雹可能性较大",
      "红色": "2小时内出现冰雹可能性极大",
    },
    "道路结冰": {
      "黄色": "12小时内可能出现对交通有影响的道路结冰",
      "橙色": "6小时内可能出现对交通有较大影响的道路结冰",
      "红色": "2小时内可能出现对交通有重大影响的道路结冰",
    },
    "沙尘暴": {
      "蓝色": "12小时内可能出现能见度小于1000米的沙尘暴",
      "黄色": "12小时内可能出现能见度小于1000米的沙尘暴,或已出现且可能持续",
      "橙色": "6小时内可能出现能见度小于500米的强沙尘暴",
      "红色": "6小时内可能出现能见度小于50米的特强沙尘暴",
    },
    "森林火险": {
      "黄色": "较高危险,易燃烧,易蔓延",
      "橙色": "高度危险,易燃烧,易蔓延",
      "红色": "极度危险,极易燃烧,极易蔓延",
    },
    "干旱": {
      "黄色": "连续3天无降水,或日蒸发量大于降水量,旱象初显",
      "橙色": "连续7天以上无降水,或连续3天日蒸发量大于降水量,旱象明显",
      "红色": "连续15天以上无降水,或连续7天日蒸发量大于降水量,旱象严重",
    },
    "霜冻": {
      "蓝色": "48小时内地面最低气温将降至0℃以下",
      "黄色": "24小时内地面最低气温将降至-3℃以下",
      "橙色": "24小时内地面最低气温将降至-5℃以下",
    },
  };

  function getDefinition(w) {
    const specific = TYPE_LEVEL_SPECIFIC[w.warning_type]?.[w.level];
    const general = LEVEL_GENERAL[w.level] || w.level;
    if (specific) return `${w.warning_type}${w.level}预警: ${specific}\n\n${general}`;
    return general;
  }
  function getLevelDefinition(level) {
    return LEVEL_GENERAL[level] || level;
  }

  // ---------- state ----------
  let original = [];
  let meta = {};
  let working = [];
  let editMode = false;
  let filtered = [];
  let monthFiltered = [];
  let calYear, calMonth;
  let editingRawId = null;
  // Multi-select state: Set of "红色"/"橙色"/"黄色"/"蓝色"
  let levelFilterSet = new Set(["红色", "橙色"]);
  // Search term
  let searchTerm = "";

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inMonth = (dateStr, year, month) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getFullYear() === year && d.getMonth() === month;
  };
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
      el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:6px;z-index:200;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:opacity .3s;max-width:90%;white-space:pre-wrap;text-align:left;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === "error" ? "#d32f2f" : type === "success" ? "#43a047" : "#333";
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = "0"; }, 3000);
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
    const saved = loadEditedFromLS();
    working = saved || original.slice();
    recomputeFiltered();
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
    if (!arr) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }
  function isDirty() { return loadEditedFromLS() !== null; }
  function applyWorking() {
    working = loadEditedFromLS() || original.slice();
  }

  // ---------- filters ----------
  function matchesFilter(w) {
    if (!levelFilterSet.has(w.level)) return false;
    if (searchTerm) {
      const hay = `${w.warning_type} ${w.description} ${w.headline}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  }
  function recomputeFiltered() {
    filtered = working.filter(matchesFilter);
    monthFiltered = filtered.filter((w) => inMonth(w.date_from, calYear, calMonth));
  }

  // ---------- summary tiles (monthly + synced with filter) ----------
  function renderSummary() {
    const red = monthFiltered.filter((w) => w.level === "红色").length;
    const orange = monthFiltered.filter((w) => w.level === "橙色").length;
    const days = new Set(monthFiltered.map((w) => w.date_from)).size;
    const types = new Set(monthFiltered.map((w) => w.warning_type)).size;
    $("#cntRed").textContent = red;
    $("#cntOrange").textContent = orange;
    $("#cntDays").textContent = days;
    $("#cntTypes").textContent = types;
    $("#summaryMonth").textContent = `${calYear} 年 ${calMonth + 1} 月`;
  }

  // ---------- calendar ----------
  function calendarFor(year, month) {
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build day map from `filtered` (so level filter + search both apply).
    const dayMap = new Map();
    for (const w of filtered) {
      const from = w.date_from?.slice(0, 10);
      const to = w.date_to?.slice(0, 10) || from;
      if (!from) continue;
      // Only count days within the current month for visual clarity
      if (!inMonth(from, year, month) && !inMonth(to, year, month)) continue;
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const k = dateKey(cur);
        if (!dayMap.has(k)) dayMap.set(k, []);
        dayMap.get(k).push(w);
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
      const ws = dayMap.get(k) || [];
      const cell = document.createElement("div");
      cell.className = "calendar__cell";
      if (k === today) cell.classList.add("calendar__cell--today");

      if (ws.length) {
        cell.classList.add("calendar__cell--has-warning");
        // Collect distinct types present on this day (preserve insertion order)
        const typesOnDay = [];
        const seen = new Set();
        for (const w of ws) {
          if (!seen.has(w.warning_type)) {
            seen.add(w.warning_type);
            typesOnDay.push(w.warning_type);
          }
        }
        // Build multi-color background gradient from distinct types (soft/pastel)
        const segs = typesOnDay.slice(0, 4);
        if (segs.length === 1) {
          cell.style.background = typeColorSoft(segs[0]);
          cell.classList.add("cell-solid");
        } else {
          const stops = segs.map((t, i) => {
            const start = (i / segs.length) * 100;
            const end = ((i + 1) / segs.length) * 100;
            return `${typeColorSoft(t)} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
          }).join(", ");
          cell.style.background = `linear-gradient(135deg, ${stops})`;
          cell.classList.add("cell-multi");
        }
        // Add a small left-edge color bar (saturated) so each type is still visually identifiable
        const barStops = typesOnDay.slice(0, 4).map((t) => typeColor(t)).join(", ");
        cell.style.borderLeft = typesOnDay.length > 0
          ? `4px solid ${typesOnDay.length === 1 ? typesOnDay[0] && typeColor(typesOnDay[0]) : "transparent"}`
          : "";

        // Date number
        cell.innerHTML = `<div class="calendar__date">${d}</div>`;
        // Type chips (only show if ≤ 3 to avoid clutter)
        if (typesOnDay.length <= 3) {
          const chips = typesOnDay.map((t) => {
            const lvls = ws.filter((w) => w.warning_type === t).map((w) => w.level);
            const lvl = lvls.includes("红色") ? "红色"
                       : lvls.includes("橙色") ? "橙色"
                       : lvls.includes("黄色") ? "黄色" : "蓝色";
            return `<span class="calendar__chip chip--${lvl}"><span class="type-icon">${typeIcon(t)}</span>${escapeHtml(t)}</span>`;
          }).join("");
          cell.insertAdjacentHTML("beforeend", `<div class="calendar__chips">${chips}</div>`);
        } else {
          cell.insertAdjacentHTML("beforeend",
            `<div class="calendar__chips"><span class="calendar__chip chip--more">+${typesOnDay.length} 类型</span></div>`);
        }
        // Title: full list of types + levels for the day (browser native hover)
        const tipLines = ws.map((w) => `${w.warning_type}${w.level}`);
        cell.title = tipLines.join(" / ");
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
    $("#detailDate").textContent = `${dateISO} — ${ws.length} 条预警`;
    $("#detailList").innerHTML = ws.map((w) => {
      const levelClass = w.level === "红色" ? "red"
        : w.level === "橙色" ? "orange"
        : w.level === "黄色" ? "yellow" : "blue";
      const tip = getDefinition(w);
      const actions = editMode
        ? `<button class="btn btn--sm" data-action="edit" data-id="${escapeHtml(w.raw_id)}">编辑</button>
           <button class="btn btn--sm btn--danger" data-action="delete" data-id="${escapeHtml(w.raw_id)}">删除</button>`
        : "";
      return `
        <div class="detail-item detail-item--${levelClass}">
          <div class="detail-item__head">
            <span class="badge badge--${levelClass}" style="border-left: 3px solid ${typeColor(w.warning_type)};">${escapeHtml(w.level)}</span>
            <strong><span class="type-icon type-icon--lg" style="color: ${typeColor(w.warning_type)};">${typeIcon(w.warning_type)}</span> ${escapeHtml(w.warning_type)}</strong>
            <button type="button" class="info-icon info-icon--lg" data-tip="${escapeHtml(tip)}" aria-label="查看 ${escapeHtml(w.warning_type)}${escapeHtml(w.level)} 官方定义">ⓘ 定义</button>
            <span class="muted small">${escapeHtml(w.headline)}</span>
          </div>
          <div class="detail-item__desc">${escapeHtml(w.description)}</div>
          <div class="detail-item__time">发布: ${escapeHtml(w.published_at ?? "")} · 生效: ${escapeHtml(w.date_from ?? "")} ~ ${escapeHtml(w.date_to ?? "")}</div>
          ${actions ? `<div class="row-actions" style="margin-top:8px;">${actions}</div>` : ""}
        </div>`;
    }).join("");
    $("#detailSection").classList.remove("section--hidden");
    $("#detailSection").scrollIntoView({ behavior: "smooth", block: "start" });

    attachInfoIconHandlers($("#detailList"));
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
    body.innerHTML = filtered.map((w) => {
      const levelClass = w.level === "红色" ? "red"
        : w.level === "橙色" ? "orange"
        : w.level === "黄色" ? "yellow" : "blue";
      const tip = getDefinition(w);
      const actions = editMode
        ? `<button class="btn btn--sm" data-action="edit" data-id="${escapeHtml(w.raw_id)}">编辑</button>
           <button class="btn btn--sm btn--danger" data-action="delete" data-id="${escapeHtml(w.raw_id)}">删除</button>`
        : "";
      return `
        <tr>
          <td>${escapeHtml(w.date_from ?? "")}</td>
          <td>${escapeHtml(w.date_to ?? "")}</td>
          <td>${escapeHtml(w.published_at ?? "")}</td>
          <td><span class="badge badge--${levelClass}" style="border-left: 3px solid ${typeColor(w.warning_type)}; padding-left: 6px;">${escapeHtml(w.level)}</span>
              <button type="button" class="info-icon" data-tip="${escapeHtml(tip)}" aria-label="查看 ${escapeHtml(w.warning_type)}${escapeHtml(w.level)} 官方定义">ⓘ</button></td>
          <td><span class="type-icon" style="color: ${typeColor(w.warning_type)}">${typeIcon(w.warning_type)}</span> ${escapeHtml(w.warning_type)}</td>
          <td>${escapeHtml(w.area ?? "")}</td>
          <td class="desc-cell">${escapeHtml(w.description ?? "")}</td>
          <td class="edit-only ${editMode ? "" : "hidden"} row-actions">${actions}</td>
        </tr>`;
    }).join("");

    attachInfoIconHandlers(body);
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
    $("#pageUpdated").textContent = meta.last_scraped ? fmtDate(meta.last_scraped) : "—";
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

  // ---------- level filter (multi-select) ----------
  function renderLevelFilter() {
    const el = $("#levelFilter");
    el.innerHTML = "";
    const levels = ["红色", "橙色", "黄色", "蓝色"];
    for (const lv of levels) {
      const tip = getLevelDefinition(lv);
      const checked = levelFilterSet.has(lv);
      const id = `lvl-${lv}`;
      const label = document.createElement("label");
      label.className = "level-toggle";
      label.setAttribute("for", id);
      label.innerHTML = `
        <input type="checkbox" id="${id}" data-level="${lv}" ${checked ? "checked" : ""} />
        <span class="level-toggle__pill level-toggle__pill--${lv === "红色" ? "red" : lv === "橙色" ? "orange" : lv === "黄色" ? "yellow" : "blue"}">${escapeHtml(lv)}</span>
        <button type="button" class="info-icon" data-tip="${escapeHtml(tip)}" aria-label="查看 ${lv} 定义">ⓘ</button>
      `;
      el.appendChild(label);
    }
    el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) levelFilterSet.add(cb.dataset.level);
        else levelFilterSet.delete(cb.dataset.level);
        recomputeFiltered();
        renderAll();
      });
    });
    attachInfoIconHandlers(el);
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
    recomputeFiltered();
    renderAll();
    showToast("已暂存到浏览器（记得点「保存并导出」上传到 GitHub）", "success");
  }

  function deleteEntry(rawId) {
    if (!confirm("确认删除这条预警？")) return;
    applyWorking();
    working = working.filter((w) => w.raw_id !== rawId);
    saveEditedToLS(working);
    recomputeFiltered();
    renderAll();
    $("#detailSection").classList.add("section--hidden");
    showToast("已删除（记得导出后上传到 GitHub）", "success");
  }

  function resetToOriginal() {
    if (!confirm("放弃所有本地修改，恢复到 GitHub 上的原始数据？")) return;
    saveEditedToLS(null);
    working = original.slice();
    recomputeFiltered();
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

  // ---------- tooltip (click-triggered popover) ----------
  let activePopover = null;

  function ensurePopover() {
    let p = document.getElementById("tipPopover");
    if (!p) {
      p = document.createElement("div");
      p.id = "tipPopover";
      p.className = "tip-popover hidden";
      p.innerHTML = `
        <button type="button" class="tip-popover__close" aria-label="关闭">×</button>
        <div class="tip-popover__content"></div>
      `;
      document.body.appendChild(p);
      p.querySelector(".tip-popover__close").addEventListener("click", hideTip);
      // Click outside to close
      document.addEventListener("click", (e) => {
        if (activePopover && !e.target.closest(".info-icon") && !e.target.closest("#tipPopover")) {
          hideTip();
        }
      });
      // Escape to close
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideTip();
      });
    }
    return p;
  }

  function showTip(text, anchorEl) {
    const p = ensurePopover();
    const content = p.querySelector(".tip-popover__content");
    // Render with bold on the leading part (e.g. "🌡️ 高温橙色预警: " before the first newline)
    const lines = text.split("\n\n");
    content.innerHTML = lines.map((l, i) => {
      const colonIdx = l.indexOf(":");
      if (i === 0 && colonIdx > 0 && colonIdx < 30) {
        return `<div class="tip-popover__head"><strong>${escapeHtml(l.slice(0, colonIdx + 1))}</strong> ${escapeHtml(l.slice(colonIdx + 1))}</div>`;
      }
      return `<div>${escapeHtml(l)}</div>`;
    }).join("");
    // Position below anchor
    p.classList.remove("hidden");
    const r = anchorEl.getBoundingClientRect();
    const popW = p.offsetWidth || 320;
    let left = r.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    p.style.left = left + "px";
    p.style.top = (r.bottom + 6) + "px";
    activePopover = p;
  }
  function hideTip() {
    if (activePopover) activePopover.classList.add("hidden");
    activePopover = null;
  }

  function attachInfoIconHandlers(root) {
    root.querySelectorAll(".info-icon").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = btn.dataset.tip;
        if (!text) return;
        if (activePopover && activePopover.dataset.anchor === btn) {
          hideTip();
          return;
        }
        showTip(text, btn);
        activePopover.dataset.anchor = btn;
      });
    });
  }

  // ---------- init ----------
  function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    $("#calPrev").addEventListener("click", () => {
      calMonth -= 1;
      if (calMonth < 0) { calMonth = 11; calYear -= 1; }
      recomputeFiltered();
      renderAll();
    });
    $("#calNext").addEventListener("click", () => {
      calMonth += 1;
      if (calMonth > 11) { calMonth = 0; calYear += 1; }
      recomputeFiltered();
      renderAll();
    });
    $("#calToday").addEventListener("click", () => {
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth();
      recomputeFiltered();
      renderAll();
    });
    $("#detailClose").addEventListener("click", () => $("#detailSection").classList.add("section--hidden"));
    $("#search").addEventListener("input", () => {
      searchTerm = ($("#search").value || "").trim().toLowerCase();
      recomputeFiltered();
      renderAll();
    });
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

    renderLevelFilter();
    loadOriginal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
