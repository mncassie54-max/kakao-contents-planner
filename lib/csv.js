// 순수 로직 (브라우저 ESM + node:test 공용)

export const HEADER = [
  "발송일", "발송시간", "제목", "링크", "카테고리",
  "제품명", "포맷", "발송타겟", "담당자", "코멘트", "오픈률", "피드백",
];

function esc(value) {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(rows) {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const cells = [
      r.sendDate,
      r.sendTime,
      r.title,
      r.link ?? "",
      r.category ?? "",
      r.product ?? "",
      r.format ?? "",
      r.target ?? "",
      r.owner ?? "",
      r.comment ?? "",
      r.result && r.result.openRate != null ? r.result.openRate : "",
      (r.result && r.result.feedback) ?? "",
    ].map(esc);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
