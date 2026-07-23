"use strict";

/** 로컬 날짜를 YYYY-MM-DD 문자열로 반환 */
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ref가 속한 주(월요일 시작)의 [start, end) 범위. 로컬 자정 기준. */
function weekRange(ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = (d.getDay() + 6) % 7; // 월=0 ... 일=6
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

module.exports = { weekRange, ymd };
