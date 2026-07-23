"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { weekRange, ymd } = require("../src/week");

test("수요일 기준 → 월요일 시작, 다음주 월요일 end(배타)", () => {
  const { start, end } = weekRange(new Date(2026, 6, 22, 9, 0)); // 2026-07-22 수
  assert.equal(ymd(start), "2026-07-20"); // 월
  assert.equal(ymd(end), "2026-07-27");   // 다음 월 (배타)
});

test("월요일 기준 → 그날이 주 시작", () => {
  const { start } = weekRange(new Date(2026, 6, 20, 23, 0));
  assert.equal(ymd(start), "2026-07-20");
});

test("일요일 기준 → 그 주 월요일이 시작", () => {
  const { start, end } = weekRange(new Date(2026, 6, 26, 12, 0)); // 일
  assert.equal(ymd(start), "2026-07-20");
  assert.equal(ymd(end), "2026-07-27");
});

test("ymd는 로컬 연-월-일을 0패딩", () => {
  assert.equal(ymd(new Date(2026, 0, 5)), "2026-01-05");
});
