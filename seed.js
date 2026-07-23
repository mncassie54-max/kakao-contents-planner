"use strict";
const db = require("./src/db");

// 기존 데이터 초기화 후 더미 삽입 (실제 정보 아님)
db.db.exec("DELETE FROM Result; DELETE FROM Content;");

const c1 = db.createContent({
  sendDate: "2026-07-20",
  sendTime: "10:00",
  title: "[더미] 여름 건강관리 뉴스레터",
  link: "https://example.com/dummy-1",
  category: "뉴스레터",
  product: "더미제품A",
  format: "텍스트+이미지",
  comment: "예시 데이터입니다.",
});
db.upsertResult(c1.id, { openRate: 32.5, feedback: "반응 양호(더미)" });

db.createContent({
  sendDate: "2026-07-24",
  sendTime: "14:00",
  title: "[더미] 신제품 안내",
  link: "https://example.com/dummy-2",
  category: "프로모션",
  product: "더미제품B",
  format: "카드뉴스",
  comment: "발송 예정(더미).",
});

console.log("Seeded dummy data.");
