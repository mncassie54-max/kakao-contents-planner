import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { requirePassword } from "./lib/gate.js";
import { toCsv } from "./lib/csv.js";

const $ = (id) => document.getElementById(id);
let contentsCol = null;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function validRange() {
  const from = $("from").value, to = $("to").value;
  if (!from || !to) { alert("시작일과 종료일을 선택하세요."); return null; }
  return { from, to };
}

async function fetchRange(from, to) {
  const snap = await getDocs(contentsCol);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.sendDate >= from && r.sendDate <= to)
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate) || a.sendTime.localeCompare(b.sendTime));
}

async function preview() {
  const r = validRange();
  if (!r) return;
  const rows = await fetchRange(r.from, r.to);
  const tbody = $("tbody");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="color:var(--muted); padding:16px">해당 기간 데이터가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((row) => `<tr>
      <td>${row.sendDate}</td><td>${row.sendTime}</td><td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.product)}</td><td>${escapeHtml(row.format)}</td>
      <td>${escapeHtml(row.target)}</td><td>${escapeHtml(row.owner)}</td>
      <td>${row.result?.openRate ?? ""}</td><td>${escapeHtml(row.result?.feedback)}</td>
    </tr>`)
    .join("");
}

async function download() {
  const r = validRange();
  if (!r) return;
  const rows = await fetchRange(r.from, r.to);
  const csv = "﻿" + toCsv(rows); // BOM: 엑셀 한글 방지
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kakao-report_${r.from}_${r.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function configMissing() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");
}

async function main() {
  await requirePassword();
  $("previewBtn").onclick = preview;
  $("downloadBtn").onclick = download;

  if (configMissing()) {
    $("tbody").innerHTML = '<tr><td colspan="8" style="color:#dc2626">⚠️ firebase-config.js에 Firebase config를 넣어주세요.</td></tr>';
    $("previewBtn").disabled = true;
    $("downloadBtn").disabled = true;
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  contentsCol = collection(db, "contents");
}

main();
