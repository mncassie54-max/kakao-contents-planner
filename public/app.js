"use strict";

const state = { year: 0, month: 0, items: [], editingId: null };

const $ = (id) => document.getElementById(id);
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayStr() { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); }

async function api(method, url, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { throw new Error((await res.json().catch(() => ({}))).error || res.statusText); }
  return res.status === 200 || res.status === 201 ? res.json() : null;
}

async function loadMonth() {
  // 현재 월 1일 ~ 말일 (양끝 포함). 캘린더는 현재 월 셀만 렌더하므로 이 범위로 충분.
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const from = ymd(state.year, state.month, 1);
  const to = ymd(state.year, state.month, daysInMonth);
  state.items = await api("GET", `/api/contents?from=${from}&to=${to}`);
  renderCalendar();
  renderDatalists();
}

async function loadBanner() {
  const week = await api("GET", "/api/week");
  const el = $("banner");
  if (!week.length) {
    el.innerHTML = "<strong>📢 이번 주 발송 예정 0건</strong><div>예정된 발송이 없습니다.</div>";
    return;
  }
  const lis = week
    .map((it) => `<li>${it.sendDate.slice(5)} ${it.sendTime} · ${escapeHtml(it.title)}</li>`)
    .join("");
  el.innerHTML = `<strong>📢 이번 주 발송 예정 ${week.length}건</strong><ul>${lis}</ul>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
    const key = ymd(year, month, d);
    const chips = (byDate[key] || [])
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

async function refresh() { await Promise.all([loadMonth(), loadBanner()]); }

async function save() {
  const d = formData();
  if (!d.sendDate || !d.sendTime || !d.title) { alert("발송일, 발송시간, 제목은 필수입니다."); return; }
  try {
    if (state.editingId) await api("PATCH", `/api/contents/${state.editingId}`, d);
    else await api("POST", "/api/contents", d);
    closeModal();
    await refresh();
  } catch (e) { alert("저장 실패: " + e.message); }
}

async function saveResult() {
  if (!state.editingId) return;
  try {
    await api("PUT", `/api/contents/${state.editingId}/result`, {
      openRate: $("f-openRate").value,
      feedback: $("f-feedback").value,
    });
    closeModal();
    await refresh();
  } catch (e) { alert("결과 저장 실패: " + e.message); }
}

async function remove() {
  if (!state.editingId || !confirm("삭제할까요?")) return;
  try { await api("DELETE", `/api/contents/${state.editingId}`); closeModal(); await refresh(); }
  catch (e) { alert("삭제 실패: " + e.message); }
}

function shiftMonth(delta) {
  let m = state.month + delta;
  if (m < 0) { state.year--; m = 11; }
  else if (m > 11) { state.year++; m = 0; }
  state.month = m;
  loadMonth();
}

function init() {
  const t = new Date();
  state.year = t.getFullYear();
  state.month = t.getMonth();

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

  refresh();
}

init();
