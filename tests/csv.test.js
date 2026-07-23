import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../lib/csv.js";

const row = {
  id: "1",
  sendDate: "2026-07-20",
  sendTime: "10:00",
  title: '제목, "따옴표"',
  link: "https://example.com",
  category: "뉴스레터",
  product: "더미A",
  format: "텍스트",
  comment: "줄\n바꿈",
  createdAt: "2026-07-01T00:00:00.000Z",
  result: { openRate: 32.5, feedback: "좋음", recordedAt: "2026-07-21T00:00:00.000Z" },
};

test("헤더 행을 포함한다", () => {
  const csv = toCsv([]);
  assert.equal(
    csv.split("\n")[0],
    "발송일,발송시간,제목,링크,카테고리,제품명,포맷,코멘트,오픈률,피드백"
  );
});

test("쉼표/따옴표/개행 값을 이스케이프한다", () => {
  const csv = toCsv([row]);
  assert.ok(csv.includes('"제목, ""따옴표"""'));
  assert.ok(csv.includes('"줄\n바꿈"'));
});

test("결과 없으면 오픈률/피드백은 빈 칸", () => {
  const csv = toCsv([{ ...row, result: null }]);
  const lastLine = csv.trim().split("\n").pop();
  assert.ok(lastLine.endsWith(",,"));
});
