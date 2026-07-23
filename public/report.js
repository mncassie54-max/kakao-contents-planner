"use strict";
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function validRange() {
  const from = $("from").value, to = $("to").value;
  if (!from || !to) { alert("시작일과 종료일을 선택하세요."); return null; }
  return { from, to };
}

async function preview() {
  const r = validRange();
  if (!r) return;
  const res = await fetch(`/api/contents?from=${r.from}&to=${r.to}`);
  const rows = await res.json();
  const tbody = $("tbody");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:#888">해당 기간 데이터가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((r) => `<tr>
      <td>${r.sendDate}</td><td>${r.sendTime}</td><td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.product)}</td><td>${escapeHtml(r.format)}</td>
      <td>${r.result?.openRate ?? ""}</td><td>${escapeHtml(r.result?.feedback)}</td>
    </tr>`)
    .join("");
}

function download() {
  const r = validRange();
  if (!r) return;
  window.location.href = `/api/report?from=${r.from}&to=${r.to}`;
}

$("previewBtn").onclick = preview;
$("downloadBtn").onclick = download;
