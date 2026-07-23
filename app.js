import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { requirePassword } from "./lib/gate.js";
import { weekRange, ymd } from "./lib/week.js";

const state = { year: 0, month: 0, items: [], editingId: null };
let contentsCol = null;

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
      return `<div class="wk-row ${it.ready ? "done" : ""}">
        <input type="checkbox" class="wk-check" data-id="${it.id}" ${it.ready ? "checked" : ""} title="발송 준비 완료 체크" />
        <span class="wk-when">${it.sendDate.slice(5)} ${it.sendTime}</span>
        <span class="wk-title" data-id="${it.id}">${escapeHtml(it.title)}</span>
        ${it.ready ? '<span class="badge ready">준비완료</span>' : badge}
      </div>`;
    })
    .join("");
}

/* ---------- 캘린더 ---------- */
function renderCalendar() {
  const { year, month } = state;
  $("monthLabel").textContent = `${year}년 ${month + 1}월`;
  const head = ["월", "화", "수", "목", "금", "토", "일"];
  $("calHead").innerHTML = head
    .map((w, i) => `<div class="cal-head ${i === 5 ? "sat" : i === 6 ? "sun" : ""}">${w}</div>`)
    .join("");

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = {};
  for (const it of state.items) (byDate[it.sendDate] ||= []).push(it);

  const today = todayStr();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell dim"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymdParts(year, month, d);
    const isToday = key === today;
    const chips = (byDate[key] || [])
      .sort((a, b) => a.sendTime.localeCompare(b.sendTime))
      .map((it) => {
        let cls = "chip";
        if (it.ready || it.result) cls += " done";
        else if (key < today) cls += " overdue";
        return `<div class="${cls}" data-id="${it.id}" title="${escapeHtml(it.title)}">${it.sendTime} ${escapeHtml(it.title)}</div>`;
      })
      .join("");
    cells.push(
      `<div class="cal-cell ${isToday ? "today" : ""}" data-date="${key}">
        <div class="cal-date"><span class="num">${d}</span></div>${chips}</div>`
    );
  }
  while (cells.length % 7 !== 0) cells.push('<div class="cal-cell dim"></div>');
  $("calBody").innerHTML = cells.join("");
}

function renderDatalists() {
  for (const key of ["category", "product", "format"]) {
    const vals = [...new Set(state.items.map((i) => i[key]).filter(Boolean))];
    $(`dl-${key}`).innerHTML = vals.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
  }
}

function render() { renderStats(); renderWeekPanel(); renderCalendar(); renderDatalists(); }

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
function goToday() {
  const t = new Date();
  state.year = t.getFullYear(); state.month = t.getMonth();
  renderCalendar(); renderStats();
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

  onSnapshot(contentsCol, (snap) => {
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    $("wkList").innerHTML = `<div class="notice warn">⚠️ <b>데이터 연결 오류:</b> ${escapeHtml(err.message)}</div>`;
  });
}

main();
