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

const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const rateFmt = (v) => `${v.count}건 · ${v.rates.length ? mean(v.rates).toFixed(1) + "%" : "-"}`;

function renderDashboard(rows, range) {
  const rated = rows.filter((r) => r.result && r.result.openRate != null);
  const avgOpen = mean(rated.map((r) => Number(r.result.openRate)));
  const failVals = rows.filter((r) => r.result && r.result.failRate != null).map((r) => Number(r.result.failRate));
  const avgFail = mean(failVals);
  const internal = rows.filter((r) => /임직원|내부용/i.test(`${r.target || ""} ${r.title || ""}`)).length;

  $("dashRange").textContent = `${range.from} ~ ${range.to}`;
  $("dashCards").innerHTML = [
    { k: "📨 총 발송", v: `${rows.length}<small>건</small>` },
    { k: "📈 평균 열람률", v: avgOpen == null ? "-" : `${avgOpen.toFixed(1)}<small>%</small>`, cls: "good" },
    { k: "🚚 평균 실패율", v: avgFail == null ? "-" : `${avgFail.toFixed(1)}<small>%</small>`, cls: avgFail != null && avgFail >= 10 ? "alert" : "" },
    { k: "🏢 사내 / 대외", v: `${internal}<small> / ${rows.length - internal}</small>` },
  ].map((c) => `<div class="stat ${c.cls || ""}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`).join("");

  const byCat = {}, byFormat = {};
  for (const r of rows) {
    const rate = r.result && r.result.openRate != null ? Number(r.result.openRate) : null;
    const c = r.category || "";
    (byCat[c] ||= { count: 0, rates: [] }).count++;
    if (rate != null) byCat[c].rates.push(rate);
    const f = r.format || "";
    (byFormat[f] ||= { count: 0, rates: [] }).count++;
    if (rate != null) byFormat[f].rates.push(rate);
  }
  $("dashCat").innerHTML = bars(byCat, colorOf, rateFmt);
  $("dashFormat").innerHTML = bars(byFormat, (k) => (k ? hashColor(k) : "#94a3b8"), rateFmt);

  // 열람률 랭킹 (Top/Bottom)
  const sorted = rated.slice().sort((a, b) => Number(b.result.openRate) - Number(a.result.openRate));
  if (!sorted.length) {
    $("dashRank").innerHTML = '<div class="wk-empty">아직 열람률 데이터가 없습니다. “📥 오픈데이터”로 업데이트하세요.</div>';
  } else {
    const line = (r, medal) => `<div class="rank-row"><span class="rank-medal">${medal}</span><span class="rank-rate">${Number(r.result.openRate).toFixed(1)}%</span><span class="rank-title">${escapeHtml(r.title)}</span></div>`;
    if (sorted.length <= 6) {
      // 데이터가 적으면 단일 순위 목록 (상/하위 중복 방지)
      $("dashRank").innerHTML = sorted.map((r, i) => line(r, ["🥇", "🥈", "🥉"][i] || `${i + 1}`)).join("");
    } else {
      const top = sorted.slice(0, 3).map((r, i) => line(r, ["🥇", "🥈", "🥉"][i]));
      const bottom = sorted.slice(-3).reverse().map((r) => line(r, "🔻"));
      $("dashRank").innerHTML = `<div class="rank-cols"><div><div class="rank-head">상위</div>${top.join("")}</div>` +
        `<div><div class="rank-head">하위</div>${bottom.join("")}</div></div>`;
    }
  }
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
