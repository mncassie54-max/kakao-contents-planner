import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { requirePassword } from "./lib/gate.js";
import { weekRange, ymd } from "./lib/week.js";

const state = { year: 0, month: 0, items: [], categories: [], people: [], scopeFilter: "all", editingId: null };
let contentsCol = null;
let categoriesCol = null;
let peopleCol = null;

// 2026 대한민국 공휴일 (대체공휴일 포함). 필요시 값만 수정하세요.
const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날", "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거일", "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-09-28": "대체공휴일",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일", "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymdParts = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayStr() { const t = new Date(); return ymdParts(t.getFullYear(), t.getMonth(), t.getDate()); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function weekItems() {
  const { start, end } = weekRange(new Date());
  const s = ymd(start), e = ymd(end);
  return state.items
    .filter((it) => it.sendDate >= s && it.sendDate < e)
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate) || a.sendTime.localeCompare(b.sendTime));
}

// 처음 1회 자동 시드되는 기본 카테고리 (이후 앱에서 자유롭게 추가/수정/삭제)
const DEFAULT_CATEGORIES = [
  { name: "AI Literacy", color: "#64748b" },
  { name: "V-insight", color: "#4f46e5" },
  { name: "메디닥링크", color: "#0891b2" },
  { name: "카드뉴스", color: "#d97706" },
  { name: "쇼츠", color: "#db2777" },
  { name: "VDS", color: "#7c3aed" },
  { name: "웨비나", color: "#059669" },
];
const NO_CAT = { color: "#94a3b8", short: "기타" };
function hashColor(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 52% 46%)`; }
function catMeta(name) {
  if (!name) return NO_CAT;
  const c = state.categories.find((x) => x.name === name);
  return { color: c ? c.color : hashColor(name), short: name };
}

// 발송 대상 구분: 사내(임직원) / 대외(HCP) / 미지정
function scopeOf(it) {
  const s = `${it.target || ""} ${it.title || ""}`;
  if (/임직원|내부용|internal/i.test(s)) return "internal";
  if (/HCP/i.test(s)) return "hcp";
  return "";
}
// 필터: all=전체, hcp=대외(사내 제외), internal=사내만
function matchScope(it) {
  const f = state.scopeFilter;
  if (f === "all") return true;
  const s = scopeOf(it);
  return f === "internal" ? s === "internal" : s !== "internal";
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
function weekdayKr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAY_KR[new Date(y, m - 1, d).getDay()];
}

function statusOf(it) {
  const today = todayStr();
  if (it.ready) return { key: "ready", label: "준비완료", cls: "ready" };
  if (it.sendDate < today && !it.result) return { key: "overdue", label: "지연", cls: "overdue" };
  if (it.result) return { key: "result", label: "결과 입력됨", cls: "result" };
  return { key: "plan", label: "예정", cls: "plan" };
}

/* ---------- 통계 스트립 ---------- */
function renderStats() {
  const today = todayStr();
  const wk = weekItems();
  const readyCnt = wk.filter((i) => i.ready).length;
  const ratio = wk.length ? Math.round((readyCnt / wk.length) * 100) : 0;
  const monthPrefix = `${state.year}-${pad(state.month + 1)}`;
  const monthCnt = state.items.filter((i) => i.sendDate.startsWith(monthPrefix)).length;
  const overdue = state.items.filter((i) => i.sendDate < today && !i.result).length;

  const cards = [
    { k: "📆 이번 주 발송", v: `${wk.length}<small>건</small>` },
    { k: "✅ 준비 완료율", v: `${ratio}<small>%</small>`, cls: ratio === 100 && wk.length ? "good" : "" },
    { k: "🗓️ 이번 달 발송", v: `${monthCnt}<small>건</small>` },
    { k: "⏰ 결과 미입력", v: `${overdue}<small>건</small>`, cls: overdue ? "alert" : "" },
  ];
  $("stats").innerHTML = cards
    .map((c) => `<div class="stat ${c.cls || ""}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`)
    .join("");
}

/* ---------- 이번 주 준비 현황 ---------- */
function renderWeekPanel() {
  const wk = weekItems();
  const readyCnt = wk.filter((i) => i.ready).length;
  const ratio = wk.length ? Math.round((readyCnt / wk.length) * 100) : 0;
  $("wkBar").style.width = ratio + "%";
  $("wkSummary").textContent = wk.length ? `${readyCnt} / ${wk.length} 완료 (${ratio}%)` : "";

  if (!wk.length) {
    $("wkList").innerHTML = '<div class="wk-empty">이번 주 발송 예정 콘텐츠가 없습니다. “+ 새 콘텐츠”로 추가하세요.</div>';
    return;
  }
  $("wkList").innerHTML = wk
    .map((it) => {
      const st = statusOf(it);
      const badge = it.ready ? "" : `<span class="badge ${st.cls}">${st.label}</span>`;
      const cm = catMeta(it.category);
      const scope = scopeOf(it);
      const scopeBadge = scope === "internal" ? '<span class="c-scope int">사내</span>'
        : scope === "hcp" ? '<span class="c-scope hcp">HCP</span>' : "";
      return `<div class="wk-row ${it.ready ? "done" : ""}">
        <input type="checkbox" class="wk-check" data-id="${it.id}" ${it.ready ? "checked" : ""} title="발송 준비 완료 체크" />
        <span class="wk-dot" style="background:${cm.color}" title="${escapeHtml(it.category || "기타")}"></span>
        <span class="wk-when">${it.sendDate.slice(5)} (${weekdayKr(it.sendDate)}) ${it.sendTime}</span>
        <span class="wk-title" data-id="${it.id}">${escapeHtml(it.title)}</span>
        ${scopeBadge}
        ${it.ready ? '<span class="badge ready">준비완료</span>' : badge}
      </div>`;
    })
    .join("");
}

/* ---------- 캘린더 ---------- */
function renderCalendar() {
  const { year, month } = state;
  $("monthLabel").textContent = `${year}년 ${month + 1}월`;
  const head = ["월", "화", "수", "목", "금"]; // 주말 숨김
  $("calHead").innerHTML = head.map((w) => `<div class="cal-head">${w}</div>`).join("");

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = {};
  for (const it of state.items) { if (matchScope(it)) (byDate[it.sendDate] ||= []).push(it); }

  const today = todayStr();
  const cells = [];
  let started = false;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (new Date(year, month, d).getDay() + 6) % 7; // 월=0 ... 일=6
    if (dow >= 5) continue; // 토·일 숨김
    if (!started) { for (let i = 0; i < dow; i++) cells.push('<div class="cal-cell dim"></div>'); started = true; }
    const key = ymdParts(year, month, d);
    const isToday = key === today;
    const holiday = HOLIDAYS[key];
    const chips = (byDate[key] || [])
      .sort((a, b) => a.sendTime.localeCompare(b.sendTime))
      .map((it) => {
        const cm = catMeta(it.category);
        const scope = scopeOf(it);
        const scopeBadge = scope === "internal" ? '<span class="c-scope int">사내</span>'
          : scope === "hcp" ? '<span class="c-scope hcp">HCP</span>' : "";
        const dot = (it.ready || it.result) ? "ok" : (key < today ? "bad" : "plan");
        const tip = [it.category, it.product, it.target, it.title].filter(Boolean).join(" · ");
        return `<div class="chip" data-id="${it.id}" style="border-left-color:${cm.color}" title="${escapeHtml(tip)}">
          <div class="c-meta"><span class="c-cat" style="color:${cm.color}">${cm.short}</span>${scopeBadge}${it.sendTime ? `<span class="c-time">${it.sendTime}</span>` : ""}<span class="c-status ${dot}"></span></div>
          <div class="c-title">${escapeHtml(it.title)}</div>
          ${it.product ? `<div class="c-prod">💊 ${escapeHtml(it.product)}</div>` : ""}
        </div>`;
      })
      .join("");
    cells.push(
      `<div class="cal-cell ${isToday ? "today" : ""} ${holiday ? "holiday" : ""}" data-date="${key}">
        <div class="cal-date"><span class="num">${d}</span>${holiday ? `<span class="hol">${holiday}</span>` : ""}</div>${chips}</div>`
    );
  }
  while (cells.length % 5 !== 0) cells.push('<div class="cal-cell dim"></div>');
  $("calBody").innerHTML = cells.join("");
}

function renderDatalists() {
  for (const key of ["product", "format", "target"]) {
    const vals = [...new Set(state.items.map((i) => i[key]).filter(Boolean))];
    $(`dl-${key}`).innerHTML = vals.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
  }
  // 카테고리: 관리 목록 + 실제 사용된 값 합집합
  const catNames = [...new Set([...state.categories.map((c) => c.name), ...state.items.map((i) => i.category).filter(Boolean)])];
  $("dl-category").innerHTML = catNames.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
}

function renderPeople() {
  const sel = $("f-owner");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">담당자 선택</option>' +
    state.people.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
  sel.value = cur;
}

function renderCatManager() {
  const el = $("catList");
  if (!el) return;
  el.innerHTML = state.categories
    .map((c) => `<div class="cat-row" data-id="${c.id}">
      <input type="color" class="cat-color" value="${c.color}" />
      <input type="text" class="cat-name" value="${escapeHtml(c.name)}" />
      <button class="btn sm cat-save">저장</button>
      <button class="btn sm cat-del" style="color:var(--red); border-color:var(--red)">삭제</button>
    </div>`)
    .join("");
}

function renderLegend() {
  const el = $("legend");
  if (!el) return;
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))];
  const catHtml = cats
    .map((c) => { const m = catMeta(c); return `<span><i style="background:${m.color}"></i>${escapeHtml(c)}</span>`; })
    .join("");
  const extra =
    '<span class="lg-sep"></span>' +
    '<span><b class="c-scope int">사내</b> 임직원</span>' +
    '<span><b class="c-scope hcp">HCP</b></span>' +
    '<span><i class="lg-dot ok"></i>준비완료</span>' +
    '<span><i class="lg-dot bad"></i>지연</span>';
  el.innerHTML = catHtml + extra;
}

function render() { renderStats(); renderWeekPanel(); renderCalendar(); renderDatalists(); renderLegend(); }

/* ---------- 모달 ---------- */
function openModal(dateStr, item) {
  state.editingId = item ? item.id : null;
  $("modalTitle").textContent = item ? "콘텐츠 수정" : "콘텐츠 등록";
  $("saveBtn").textContent = item ? "수정 저장" : "등록";
  $("f-sendDate").value = item ? item.sendDate : dateStr;
  $("f-sendTime").value = item ? item.sendTime : "10:00";
  $("f-title").value = item ? item.title : "";
  $("f-link").value = item?.link || "";
  $("f-category").value = item?.category || "";
  $("f-product").value = item?.product || "";
  $("f-format").value = item?.format || "";
  $("f-target").value = item?.target || "";
  $("f-owner").value = item?.owner || "";
  $("f-comment").value = item?.comment || "";
  $("f-ready").checked = !!item?.ready;
  $("resultSection").style.display = item ? "block" : "none";
  $("deleteBtn").style.display = item ? "inline-flex" : "none";
  $("f-openRate").value = item?.result?.openRate ?? "";
  $("f-feedback").value = item?.result?.feedback ?? "";
  $("modalBackdrop").classList.remove("hidden");
  setTimeout(() => $("f-title").focus(), 30);
}
function closeModal() { $("modalBackdrop").classList.add("hidden"); state.editingId = null; }

function formData() {
  return {
    sendDate: $("f-sendDate").value,
    sendTime: $("f-sendTime").value,
    title: $("f-title").value.trim(),
    link: $("f-link").value,
    category: $("f-category").value,
    product: $("f-product").value,
    format: $("f-format").value,
    target: $("f-target").value,
    owner: $("f-owner").value,
    comment: $("f-comment").value,
    ready: $("f-ready").checked,
  };
}

async function save() {
  const d = formData();
  if (!d.sendDate || !d.sendTime || !d.title) { alert("발송일, 발송시간, 제목은 필수입니다."); return; }
  try {
    if (state.editingId) await updateDoc(doc(contentsCol, state.editingId), d);
    else await addDoc(contentsCol, { ...d, createdAt: new Date().toISOString(), result: null });
    closeModal();
  } catch (e) { alert("저장 실패: " + e.message); }
}

async function saveResult() {
  if (!state.editingId) return;
  const raw = $("f-openRate").value;
  const result = {
    openRate: raw === "" ? null : Number(raw),
    feedback: $("f-feedback").value || null,
    recordedAt: new Date().toISOString(),
  };
  try { await updateDoc(doc(contentsCol, state.editingId), { result }); closeModal(); }
  catch (e) { alert("결과 저장 실패: " + e.message); }
}

async function remove() {
  if (!state.editingId || !confirm("삭제할까요?")) return;
  try { await deleteDoc(doc(contentsCol, state.editingId)); closeModal(); }
  catch (e) { alert("삭제 실패: " + e.message); }
}

async function toggleReady(id, val) {
  try { await updateDoc(doc(contentsCol, id), { ready: val }); }
  catch (e) { alert("업데이트 실패: " + e.message); render(); }
}

function shiftMonth(delta) {
  let m = state.month + delta;
  if (m < 0) { state.year--; m = 11; } else if (m > 11) { state.year++; m = 0; }
  state.month = m;
  renderCalendar(); renderStats();
}
let monthAnchor = null; // 마지막으로 인식한 "실제 현재 월"

function goToday() {
  const t = new Date();
  state.year = t.getFullYear(); state.month = t.getMonth();
  monthAnchor = { y: state.year, m: state.month };
  renderCalendar(); renderStats();
}

// 앱을 열어둔 채 달이 바뀌면(자정/월말 경과), 현재 월을 보고 있던 경우 자동으로 새 달로 이동.
function maybeRollMonth() {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth();
  if (!monthAnchor) { monthAnchor = { y, m }; return; }
  if (y !== monthAnchor.y || m !== monthAnchor.m) {
    const wasViewingCurrent = state.year === monthAnchor.y && state.month === monthAnchor.m;
    if (wasViewingCurrent) goToday();     // 사용자가 현재 월을 보고 있었으면 새 달로
    else monthAnchor = { y, m };          // 다른 달을 보고 있었으면 앵커만 갱신
  }
}

function bindUi() {
  $("prevBtn").onclick = () => shiftMonth(-1);
  $("nextBtn").onclick = () => shiftMonth(1);
  $("todayBtn").onclick = goToday;
  $("newBtn").onclick = () => openModal(todayStr(), null);
  $("closeBtn").onclick = closeModal;
  $("saveBtn").onclick = save;
  $("saveResultBtn").onclick = saveResult;
  $("deleteBtn").onclick = remove;
  $("modalBackdrop").onclick = (e) => { if (e.target === $("modalBackdrop")) closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeRollMonth(); });
  window.addEventListener("focus", maybeRollMonth);

  $("calBody").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      const item = state.items.find((i) => i.id === chip.dataset.id);
      if (item) openModal(item.sendDate, item);
      return;
    }
    const cell = e.target.closest(".cal-cell:not(.dim)");
    if (cell && cell.dataset.date) openModal(cell.dataset.date, null);
  });

  $("wkList").addEventListener("change", (e) => {
    const cb = e.target.closest(".wk-check");
    if (cb) toggleReady(cb.dataset.id, cb.checked);
  });
  $("wkList").addEventListener("click", (e) => {
    const t = e.target.closest(".wk-title");
    if (t) { const item = state.items.find((i) => i.id === t.dataset.id); if (item) openModal(item.sendDate, item); }
  });

  // 발송 대상 필터 (전체 / HCP·대외 / 사내)
  $("scopeFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-scope]");
    if (!b) return;
    state.scopeFilter = b.dataset.scope;
    [...$("scopeFilter").children].forEach((c) => c.classList.toggle("active", c.dataset.scope === state.scopeFilter));
    renderCalendar();
  });

  // 카테고리 관리
  $("catBtn").onclick = () => { renderCatManager(); $("catModalBackdrop").classList.remove("hidden"); };
  $("catCloseBtn").onclick = () => $("catModalBackdrop").classList.add("hidden");
  $("catModalBackdrop").onclick = (e) => { if (e.target === $("catModalBackdrop")) $("catModalBackdrop").classList.add("hidden"); };
  $("catAddBtn").onclick = () => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `<input type="color" class="cat-color" value="#4f46e5" />
      <input type="text" class="cat-name" placeholder="새 카테고리 이름" />
      <button class="btn sm cat-save">저장</button>
      <button class="btn sm cat-del" style="color:var(--red); border-color:var(--red)">삭제</button>`;
    $("catList").appendChild(row);
    row.querySelector(".cat-name").focus();
  };
  $("catList").addEventListener("click", async (e) => {
    const row = e.target.closest(".cat-row");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.classList.contains("cat-save")) {
      const name = row.querySelector(".cat-name").value.trim();
      const color = row.querySelector(".cat-color").value;
      if (!name) { alert("카테고리 이름을 입력하세요."); return; }
      try {
        if (id) {
          const old = state.categories.find((x) => x.id === id);
          await updateDoc(doc(categoriesCol, id), { name, color });
          if (old && old.name !== name) {
            for (const it of state.items) if (it.category === old.name) await updateDoc(doc(contentsCol, it.id), { category: name });
          }
        } else {
          await addDoc(categoriesCol, { name, color });
        }
      } catch (err) { alert("저장 실패: " + err.message); }
    } else if (e.target.classList.contains("cat-del")) {
      if (!id) { row.remove(); return; }
      if (!confirm("이 카테고리를 삭제할까요? 기존 콘텐츠의 값은 유지되며 '기타'로 표시됩니다.")) return;
      try { await deleteDoc(doc(categoriesCol, id)); } catch (err) { alert("삭제 실패: " + err.message); }
    }
  });
}

function configMissing() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");
}

async function main() {
  await requirePassword();
  goToday();
  bindUi();

  if (configMissing()) {
    $("wkList").innerHTML = '<div class="notice warn">⚠️ <b>Firebase 설정이 필요합니다.</b> firebase-config.js에 콘솔 config 값을 넣어주세요.</div>';
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  contentsCol = collection(db, "contents");
  categoriesCol = collection(db, "categories");
  peopleCol = collection(db, "people");

  let catSeeded = false;
  onSnapshot(categoriesCol, (snap) => {
    state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    if (!catSeeded && state.categories.length === 0) { catSeeded = true; DEFAULT_CATEGORIES.forEach((c) => addDoc(categoriesCol, c)); }
    renderCatManager();
    render();
  });
  onSnapshot(peopleCol, (snap) => {
    state.people = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderPeople();
  });

  onSnapshot(contentsCol, (snap) => {
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    $("wkList").innerHTML = `<div class="notice warn">⚠️ <b>데이터 연결 오류:</b> ${escapeHtml(err.message)}</div>`;
  });
}

main();
