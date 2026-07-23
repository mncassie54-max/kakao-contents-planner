import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { requirePassword } from "./lib/gate.js";
import { toCsv } from "./lib/csv.js";

const $ = (id) => document.getElementById(id);
let contentsCol = null, categoriesCol = null, peopleCol = null;
let catColors = {};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function hashColor(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 52% 46%)`; }
const colorOf = (c) => (c && catColors[c]) || (c ? hashColor(c) : "#94a3b8");

function validRange() {
  const from = $("from").value, to = $("to").value;
  if (!from || !to) { alert("시작일과 종료일을 선택하세요."); return null; }
  return { from, to };
}

async function allContents() {
  const snap = await getDocs(contentsCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fetchRange(from, to) {
  return (await allContents())
    .filter((r) => r.sendDate >= from && r.sendDate <= to)
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate) || (a.sendTime || "").localeCompare(b.sendTime || ""));
}

function bars(map, colorFn, fmt) {
  const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  const max = Math.max(1, ...entries.map(([, v]) => v.count));
  return entries.map(([k, v]) => `<div class="bar-row">
    <span class="bar-label"><i style="width:9px;height:9px;border-radius:3px;background:${colorFn(k)};display:inline-block"></i>${escapeHtml(k || "미지정")}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${(v.count / max) * 100}%;background:${colorFn(k)}"></span></span>
    <span class="bar-val">${fmt(v)}</span>
  </div>`).join("") || '<div class="wk-empty">데이터 없음</div>';
}

function renderDashboard(rows, range) {
  const withRate = rows.filter((r) => r.result && r.result.openRate != null);
  const avg = withRate.length ? (withRate.reduce((s, r) => s + Number(r.result.openRate), 0) / withRate.length) : null;
  const readyCnt = rows.filter((r) => r.ready).length;
  const internal = rows.filter((r) => /임직원|내부용/i.test(`${r.target || ""} ${r.title || ""}`)).length;

  $("dashRange").textContent = `${range.from} ~ ${range.to}`;
  $("dashCards").innerHTML = [
    { k: "📨 총 발송", v: `${rows.length}<small>건</small>` },
    { k: "📈 평균 오픈률", v: avg == null ? "-" : `${avg.toFixed(1)}<small>%</small>`, cls: "good" },
    { k: "✅ 준비 완료", v: `${readyCnt}<small>/${rows.length}</small>` },
    { k: "🏢 사내 / 대외", v: `${internal}<small> / ${rows.length - internal}</small>` },
  ].map((c) => `<div class="stat ${c.cls || ""}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`).join("");

  const byCat = {}, byOwner = {};
  for (const r of rows) {
    const c = r.category || "";
    (byCat[c] ||= { count: 0, rates: [] }).count++;
    if (r.result && r.result.openRate != null) byCat[c].rates.push(Number(r.result.openRate));
    const o = r.owner || "";
    (byOwner[o] ||= { count: 0 }).count++;
  }
  $("dashCat").innerHTML = bars(byCat, colorOf, (v) => {
    const a = v.rates.length ? (v.rates.reduce((s, x) => s + x, 0) / v.rates.length).toFixed(1) + "%" : "-";
    return `${v.count}건 · ${a}`;
  });
  $("dashOwner").innerHTML = bars(byOwner, () => "#4f46e5", (v) => `${v.count}건`);
  $("dashboard").style.display = "";
}

async function preview() {
  const r = validRange();
  if (!r) return;
  const rows = await fetchRange(r.from, r.to);
  renderDashboard(rows, r);
  const tbody = $("tbody");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="color:var(--muted); padding:16px">해당 기간 데이터가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((row) => `<tr>
      <td>${row.sendDate}</td><td>${row.sendTime || ""}</td><td>${escapeHtml(row.title)}</td>
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
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `kakao-report_${r.from}_${r.to}.csv`);
}

async function backup() {
  const [cSnap, catSnap, pSnap] = await Promise.all([getDocs(contentsCol), getDocs(categoriesCol), getDocs(peopleCol)]);
  const data = {
    exportedAt: new Date().toISOString(),
    contents: cSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    categories: catSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    people: pSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `kakao-planner-backup_${stamp}.json`);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function configMissing() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");
}

async function main() {
  await requirePassword();
  $("previewBtn").onclick = preview;
  $("downloadBtn").onclick = download;
  $("backupBtn").onclick = backup;

  if (configMissing()) {
    $("tbody").innerHTML = '<tr><td colspan="10" style="color:#dc2626">⚠️ firebase-config.js에 Firebase config를 넣어주세요.</td></tr>';
    ["previewBtn", "downloadBtn", "backupBtn"].forEach((id) => ($(id).disabled = true));
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  contentsCol = collection(db, "contents");
  categoriesCol = collection(db, "categories");
  peopleCol = collection(db, "people");

  const catSnap = await getDocs(categoriesCol);
  catColors = Object.fromEntries(catSnap.docs.map((d) => [d.data().name, d.data().color]));
}

main();
