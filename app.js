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
function pad(n) { return String(n).padStart(2, "0"); }
function ymdParts(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayStr() { const t = new Date(); return ymdParts(t.getFullYear(), t.getMonth(), t.getDate()); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderBanner() {
  const { start, end } = weekRange(new Date());
  const s = ymd(start), e = ymd(end);
  const week = state.items
    .filter((it) => it.sendDate >= s && it.sendDate < e)
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate) || a.sendTime.localeCompare(b.sendTime));
  const el = $("banner");
  el.className = "banner";
  if (!week.length) {
    el.innerHTML = "<strong>📢 이번 주 발송 예정 0건</strong><div>예정된 발송이 없습니다.</div>";
    return;
  }
  const lis = week
    .map((it) => `<li>${it.sendDate.slice(5)} ${it.sendTime} · ${escapeHtml(it.title)}</li>`)
    .join("");
  el.innerHTML = `<strong>📢 이번 주 발송 예정 ${week.length}건</strong><ul>${lis}</ul>`;
}

function renderCalendar() {
  const { year, month } = state;
  $("monthLabel").textContent = `${year}년 ${month + 1}월`;
  const head = ["월", "화", "수", "목", "금", "토", "일"];
  $("calHead").innerHTML = head.map((w) => `<div class="cal-head">${w}</div>`).join("");

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = {};
  for (const it of state.items) (byDate[it.sendDate] ||= []).push(it);

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell dim"></div>');
  const today = todayStr();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymdParts(year, month, d);
    const chips = (byDate[key] || [])
      .sort((a, b) => a.sendTime.localeCompare(b.sendTime))
      .map((it) => {
        let cls = "chip";
        if (it.result) cls += " done";
        else if (key < today) cls += " overdue";
        return `<div class="${cls}" data-id="${it.id}" title="${escapeHtml(it.title)}">${it.sendTime} ${escapeHtml(it.title)}</div>`;
      })
      .join("");
    cells.push(`<div class="cal-cell" data-date="${key}"><div class="cal-date">${d}</div>${chips}</div>`);
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

function render() { renderBanner(); renderCalendar(); renderDatalists(); }

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
  $("resultSection").style.display = item ? "block" : "none";
  $("deleteBtn").style.display = item ? "inline-block" : "none";
  $("f-openRate").value = item?.result?.openRate ?? "";
  $("f-feedback").value = item?.result?.feedback ?? "";
  $("modalBackdrop").classList.remove("hidden");
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
  };
}

async function save() {
  const d = formData();
  if (!d.sendDate || !d.sendTime || !d.title) { alert("발송일, 발송시간, 제목은 필수입니다."); return; }
  try {
    if (state.editingId) {
      await updateDoc(doc(contentsCol, state.editingId), d);
    } else {
      await addDoc(contentsCol, { ...d, createdAt: new Date().toISOString(), result: null });
    }
    closeModal();
  } catch (e) { alert("저장 실패: " + e.message); }
}

async function saveResult() {
  if (!state.editingId) return;
  const openRateRaw = $("f-openRate").value;
  const result = {
    openRate: openRateRaw === "" ? null : Number(openRateRaw),
    feedback: $("f-feedback").value || null,
    recordedAt: new Date().toISOString(),
  };
  try {
    await updateDoc(doc(contentsCol, state.editingId), { result });
    closeModal();
  } catch (e) { alert("결과 저장 실패: " + e.message); }
}

async function remove() {
  if (!state.editingId || !confirm("삭제할까요?")) return;
  try { await deleteDoc(doc(contentsCol, state.editingId)); closeModal(); }
  catch (e) { alert("삭제 실패: " + e.message); }
}

function shiftMonth(delta) {
  let m = state.month + delta;
  if (m < 0) { state.year--; m = 11; }
  else if (m > 11) { state.year++; m = 0; }
  state.month = m;
  renderCalendar();
}

function bindUi() {
  $("prevBtn").onclick = () => shiftMonth(-1);
  $("nextBtn").onclick = () => shiftMonth(1);
  $("closeBtn").onclick = closeModal;
  $("saveBtn").onclick = save;
  $("saveResultBtn").onclick = saveResult;
  $("deleteBtn").onclick = remove;
  $("modalBackdrop").onclick = (e) => { if (e.target === $("modalBackdrop")) closeModal(); };
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
}

function configMissing() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");
}

async function main() {
  await requirePassword();

  const t = new Date();
  state.year = t.getFullYear();
  state.month = t.getMonth();
  bindUi();
  renderCalendar();

  if (configMissing()) {
    const el = $("banner");
    el.className = "banner warn";
    el.innerHTML = "⚠️ <strong>Firebase 설정이 필요합니다.</strong> <code>firebase-config.js</code>에 콘솔의 config 값을 넣어주세요.";
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  contentsCol = collection(db, "contents");

  onSnapshot(contentsCol, (snap) => {
    state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    const el = $("banner");
    el.className = "banner warn";
    el.innerHTML = `⚠️ <strong>데이터 연결 오류:</strong> ${escapeHtml(err.message)}`;
  });
}

main();
