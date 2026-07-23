# Kakao Contents Planner Implementation Plan (Pure Node.js)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DI팀이 카카오 콘텐츠 발송 플랜을 캘린더로 등록·관리하고, 발송 후 결과를 기록하며, 이번 주 알림과 기간 CSV 리포트를 뽑는 가장 작은 공유 웹앱을 **외부 패키지 없이** 만든다.

**Architecture:** Node.js v24 내장 모듈만 사용. `node:http` 서버가 `public/`의 정적 파일과 `/api/*` JSON REST를 제공한다. 저장은 `node:sqlite`(DatabaseSync)의 파일 DB `data.db`. 순수 로직(주간 범위, CSV)은 `src/`에 분리하고 `node:test`로 단위 테스트한다. 프론트는 의존성 없는 바닐라 HTML/CSS/JS.

**Tech Stack:** Node.js v24, `node:http`, `node:sqlite`, `node:test`, vanilla JS. 외부 의존성 0개. CommonJS(`require`). 모든 날짜는 `YYYY-MM-DD` 문자열.

**Environment notes:** `npm` 없음, 네트워크 없음. `node`는 PATH에 있음(v24.13). 빌드/설치 단계 없음. 실행 `node server.js`, 테스트 `node --test "tests/**/*.test.js"` (이 Windows/Node에서는 `node --test tests/` 디렉터리 형태가 실패하므로 glob 사용), 시드 `node seed.js`.

---

## File Structure

```
kakao contents planner/
├── package.json           # 최소 메타 + scripts (설치 의존성 없음)
├── .gitignore
├── README.md
├── server.js              # http 서버: 정적 서빙 + 라우팅
├── seed.js                # 더미 데이터 시드
├── src/
│   ├── db.js              # DatabaseSync 초기화 + 스키마 + 쿼리 헬퍼
│   ├── week.js            # weekRange, ymd (순수, 테스트 대상)
│   ├── csv.js             # toCsv (순수, 테스트 대상)
│   └── api.js             # 요청 핸들러 (list/create/get/update/delete/result/week/report)
├── public/
│   ├── index.html         # 배너 + 캘린더 + 모달 마크업 골격
│   ├── report.html        # 리포트 페이지
│   ├── styles.css
│   ├── app.js             # 메인 클라이언트 JS
│   └── report.js          # 리포트 클라이언트 JS
└── tests/
    ├── week.test.js       # node:test
    └── csv.test.js        # node:test
```

**참고:** 이전(Next.js) 시도에서 git이 이미 초기화되었고 `package.json`/`tsconfig.json`/`next.config.ts`/`.gitignore`가 커밋되어 있음. Task 1에서 이를 정리한다.

---

## Task 1: 스캐폴딩 정리 (Next.js 잔재 제거 → 순수 Node)

**Files:**
- Replace: `package.json`
- Delete: `tsconfig.json`, `next.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: package.json 교체**

Overwrite `package.json` with:
```json
{
  "name": "kakao-contents-planner",
  "version": "0.1.0",
  "private": true,
  "description": "DI팀 카카오 콘텐츠 플래너 (pure Node.js, zero dependencies)",
  "scripts": {
    "start": "node server.js",
    "seed": "node seed.js",
    "test": "node --test \"tests/**/*.test.js\""
  }
}
```
(주의: `"type"` 필드 없음 → CommonJS 기본. `require` 사용. 이 Windows/Node v24에서는 `node --test tests/` 디렉터리 형태가 실패하여 glob 패턴을 쓴다.)

- [ ] **Step 2: Next.js 전용 파일 삭제**

Delete `tsconfig.json` and `next.config.ts`.
Run (Git Bash): `rm -f tsconfig.json next.config.ts`

- [ ] **Step 3: .gitignore 교체**

Overwrite `.gitignore` with:
```
node_modules/
*.db
*.db-journal
*.db-wal
*.db-shm
.env
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: switch scaffold to pure Node.js (no npm deps)"
```

---

## Task 2: DB 모듈 (src/db.js)

**Files:**
- Create: `src/db.js`

- [ ] **Step 1: db.js 작성**

Create `src/db.js`:
```javascript
"use strict";
const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const path = require("node:path");

const DB_PATH = process.env.KCP_DB || path.join(__dirname, "..", "data.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS Content (
    id        TEXT PRIMARY KEY,
    sendDate  TEXT NOT NULL,
    sendTime  TEXT NOT NULL,
    title     TEXT NOT NULL,
    link      TEXT,
    category  TEXT,
    product   TEXT,
    format    TEXT,
    comment   TEXT,
    createdAt TEXT NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS Result (
    contentId  TEXT PRIMARY KEY,
    openRate   REAL,
    feedback   TEXT,
    recordedAt TEXT NOT NULL,
    FOREIGN KEY (contentId) REFERENCES Content(id) ON DELETE CASCADE
  );
`);

const UPDATABLE = ["sendDate", "sendTime", "title", "link", "category", "product", "format", "comment"];

function assemble(row) {
  if (!row) return null;
  const r = db.prepare("SELECT openRate, feedback, recordedAt FROM Result WHERE contentId = ?").get(row.id);
  return {
    id: row.id,
    sendDate: row.sendDate,
    sendTime: row.sendTime,
    title: row.title,
    link: row.link ?? null,
    category: row.category ?? null,
    product: row.product ?? null,
    format: row.format ?? null,
    comment: row.comment ?? null,
    createdAt: row.createdAt,
    result: r ? { openRate: r.openRate ?? null, feedback: r.feedback ?? null, recordedAt: r.recordedAt } : null,
  };
}

function listContents(from, to) {
  let rows;
  if (from && to) {
    rows = db.prepare(
      "SELECT * FROM Content WHERE sendDate >= ? AND sendDate <= ? ORDER BY sendDate, sendTime"
    ).all(from, to);
  } else {
    rows = db.prepare("SELECT * FROM Content ORDER BY sendDate, sendTime").all();
  }
  return rows.map(assemble);
}

function getContent(id) {
  return assemble(db.prepare("SELECT * FROM Content WHERE id = ?").get(id));
}

function createContent(d) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO Content (id, sendDate, sendTime, title, link, category, product, format, comment, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, d.sendDate, d.sendTime, d.title,
    d.link ?? null, d.category ?? null, d.product ?? null, d.format ?? null, d.comment ?? null, createdAt
  );
  return getContent(id);
}

function updateContent(id, d) {
  const sets = [];
  const vals = [];
  for (const f of UPDATABLE) {
    if (f in d) { sets.push(`${f} = ?`); vals.push(d[f] ?? null); }
  }
  if (sets.length) {
    vals.push(id);
    db.prepare(`UPDATE Content SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
  return getContent(id);
}

function deleteContent(id) {
  db.prepare("DELETE FROM Content WHERE id = ?").run(id);
}

function upsertResult(id, { openRate, feedback }) {
  const recordedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO Result (contentId, openRate, feedback, recordedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(contentId) DO UPDATE SET
       openRate = excluded.openRate,
       feedback = excluded.feedback,
       recordedAt = excluded.recordedAt`
  ).run(id, openRate ?? null, feedback ?? null, recordedAt);
  return getContent(id);
}

module.exports = { db, listContents, getContent, createContent, updateContent, deleteContent, upsertResult };
```

- [ ] **Step 2: 로드/기본동작 스모크 테스트**

Run:
```bash
KCP_DB=":memory:" node -e "const d=require('./src/db'); const c=d.createContent({sendDate:'2026-07-20',sendTime:'10:00',title:'t'}); console.log('created', c.id, c.result); d.upsertResult(c.id,{openRate:20,feedback:'x'}); console.log('withResult', d.getContent(c.id).result); console.log('list', d.listContents('2026-07-01','2026-07-31').length); d.deleteContent(c.id); console.log('afterDelete', d.getContent(c.id));"
```
Expected: created id 출력 + `result null`, withResult `{openRate:20,...}`, list `1`, afterDelete `null`. (ExperimentalWarning 한 줄은 무시.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add sqlite db module"
```

---

## Task 3: 주간 범위 로직 (TDD, node:test)

**Files:**
- Create: `src/week.js`
- Test: `tests/week.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/week.test.js`:
```javascript
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/week.test.js`
Expected: FAIL — Cannot find module '../src/week'

- [ ] **Step 3: 최소 구현 작성**

Create `src/week.js`:
```javascript
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/week.test.js`
Expected: PASS (4 tests, 0 fail)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add weekRange/ymd helpers with tests"
```

---

## Task 4: CSV 직렬화 로직 (TDD, node:test)

**Files:**
- Create: `src/csv.js`
- Test: `tests/csv.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/csv.test.js`:
```javascript
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toCsv } = require("../src/csv");

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/csv.test.js`
Expected: FAIL — Cannot find module '../src/csv'

- [ ] **Step 3: 최소 구현 작성**

Create `src/csv.js`:
```javascript
"use strict";

const HEADER = [
  "발송일", "발송시간", "제목", "링크", "카테고리",
  "제품명", "포맷", "코멘트", "오픈률", "피드백",
];

function esc(value) {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows) {
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
      r.comment ?? "",
      r.result && r.result.openRate != null ? r.result.openRate : "",
      (r.result && r.result.feedback) ?? "",
    ].map(esc);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

module.exports = { toCsv, HEADER };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (week 4 + csv 3 = 7 tests, 0 fail)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add CSV serializer with tests"
```

---

## Task 5: API 핸들러 (src/api.js)

**Files:**
- Create: `src/api.js`

- [ ] **Step 1: api.js 작성**

각 핸들러는 순수하게 `{ status, json }` 또는 `{ status, csv, filename }` 를 반환한다(HTTP 객체를 직접 만지지 않음). Create `src/api.js`:
```javascript
"use strict";
const db = require("./db");
const { toCsv } = require("./csv");
const { weekRange, ymd } = require("./week");

function listContents(query) {
  return { status: 200, json: db.listContents(query.from, query.to) };
}

function createContent(body) {
  if (!body || !body.sendDate || !body.sendTime || !body.title) {
    return { status: 400, json: { error: "sendDate, sendTime, title은 필수입니다." } };
  }
  return { status: 201, json: db.createContent(body) };
}

function getContent(id) {
  const c = db.getContent(id);
  return c ? { status: 200, json: c } : { status: 404, json: { error: "not found" } };
}

function updateContent(id, body) {
  if (!db.getContent(id)) return { status: 404, json: { error: "not found" } };
  if (!body) return { status: 400, json: { error: "invalid body" } };
  return { status: 200, json: db.updateContent(id, body) };
}

function deleteContent(id) {
  if (!db.getContent(id)) return { status: 404, json: { error: "not found" } };
  db.deleteContent(id);
  return { status: 200, json: { ok: true } };
}

function putResult(id, body) {
  if (!db.getContent(id)) return { status: 404, json: { error: "not found" } };
  if (!body) return { status: 400, json: { error: "invalid body" } };
  const openRate = body.openRate == null || body.openRate === "" ? null : Number(body.openRate);
  const feedback = body.feedback ?? null;
  return { status: 200, json: db.upsertResult(id, { openRate, feedback }) };
}

function thisWeek() {
  const { start, end } = weekRange(new Date());
  const lastDay = new Date(end);
  lastDay.setDate(end.getDate() - 1); // 일요일(포함 끝)
  return { status: 200, json: db.listContents(ymd(start), ymd(lastDay)) };
}

function report(query) {
  if (!query.from || !query.to) {
    return { status: 400, json: { error: "from, to는 필수입니다." } };
  }
  const items = db.listContents(query.from, query.to);
  const csv = "﻿" + toCsv(items); // BOM: 엑셀 한글 방지
  return { status: 200, csv, filename: `kakao-report_${query.from}_${query.to}.csv` };
}

module.exports = {
  listContents, createContent, getContent, updateContent,
  deleteContent, putResult, thisWeek, report,
};
```

- [ ] **Step 2: 스모크 테스트**

Run:
```bash
KCP_DB=":memory:" node -e "const a=require('./src/api'); console.log('missing', a.createContent({}).status); const c=a.createContent({sendDate:'2026-07-20',sendTime:'10:00',title:'t'}); console.log('create', c.status); console.log('week', a.thisWeek().status); const r=a.report({from:'2026-07-01',to:'2026-07-31'}); console.log('report', r.status, r.csv.slice(0,3));"
```
Expected: `missing 400`, `create 201`, `week 200`, `report 200` + CSV가 BOM(`﻿`)로 시작.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add API handlers"
```

---

## Task 6: HTTP 서버 (server.js)

**Files:**
- Create: `server.js`

- [ ] **Step 1: server.js 작성**

Create `server.js`:
```javascript
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const api = require("./src/api");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function respond(res, r) {
  if (r.csv != null) {
    res.writeHead(r.status, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.filename}"`,
    });
    res.end(r.csv);
    return;
  }
  sendJson(res, r.status, r.json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}

function serveStatic(res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel === "/report") rel = "/report.html";
  const full = path.join(PUBLIC, path.normalize(rel));
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  if (pathname.startsWith("/api/")) {
    try {
      if (pathname === "/api/contents" && req.method === "GET") return respond(res, api.listContents(query));
      if (pathname === "/api/contents" && req.method === "POST") return respond(res, api.createContent(await readBody(req)));
      if (pathname === "/api/week" && req.method === "GET") return respond(res, api.thisWeek());
      if (pathname === "/api/report" && req.method === "GET") return respond(res, api.report(query));

      const m = pathname.match(/^\/api\/contents\/([^/]+)(\/result)?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const isResult = Boolean(m[2]);
        if (isResult && req.method === "PUT") return respond(res, api.putResult(id, await readBody(req)));
        if (!isResult && req.method === "GET") return respond(res, api.getContent(id));
        if (!isResult && req.method === "PATCH") return respond(res, api.updateContent(id, await readBody(req)));
        if (!isResult && req.method === "DELETE") return respond(res, api.deleteContent(id));
      }
      sendJson(res, 404, { error: "not found" });
    } catch (e) {
      sendJson(res, 500, { error: String((e && e.message) || e) });
    }
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`Kakao Contents Planner running: http://localhost:${PORT}`);
});
```

- [ ] **Step 2: 서버 기동 + API 스모크 (curl)**

`public/` 가 아직 없으므로 정적 응답은 404여도 정상. API만 확인.
Run in background: `node server.js`
그 다음:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/contents -H "Content-Type: application/json" -d "{}"
```
Expected: `400`
```bash
curl -s -X POST http://localhost:3000/api/contents -H "Content-Type: application/json" -d "{\"sendDate\":\"2026-07-24\",\"sendTime\":\"10:00\",\"title\":\"스모크\"}"
curl -s "http://localhost:3000/api/contents?from=2026-07-01&to=2026-07-31"
curl -s "http://localhost:3000/api/week"
```
Expected: 생성된 JSON, 목록에 1건 이상, week 응답(JSON 배열).
확인 후 `node server.js` 백그라운드 프로세스를 종료한다.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add http server with routing and static serving"
```

---

## Task 7: 스타일 + 메인 페이지 마크업 (public/styles.css, public/index.html)

**Files:**
- Create: `public/styles.css`, `public/index.html`

- [ ] **Step 1: styles.css 작성**

Create `public/styles.css`:
```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  color: #1a1a1a;
  background: #f7f7f8;
}
.container { max-width: 1000px; margin: 0 auto; padding: 24px 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h2 { margin: 0; }
a.navlink { color: #2563eb; text-decoration: none; }
.banner { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
.banner ul { margin: 6px 0 0; padding-left: 18px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-head { text-align: center; font-weight: 600; padding: 6px 0; color: #555; }
.cal-cell { min-height: 92px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px; cursor: pointer; font-size: 12px; }
.cal-cell.dim { background: #fafafa; cursor: default; }
.cal-date { font-size: 12px; color: #888; }
.chip { background: #dbeafe; border-radius: 4px; padding: 2px 4px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.chip.done { background: #dcfce7; }
.chip.overdue { background: #fee2e2; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal-backdrop.hidden { display: none; }
.modal { background: #fff; border-radius: 10px; padding: 20px; width: 440px; max-width: 92vw; max-height: 90vh; overflow-y: auto; }
.modal h3 { margin-top: 0; }
.modal label { display: block; font-size: 13px; margin: 8px 0 2px; }
.modal input, .modal textarea { width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
button { cursor: pointer; border-radius: 6px; border: 1px solid #d1d5db; padding: 6px 12px; background: #fff; font-family: inherit; }
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.modal-actions { display: flex; justify-content: space-between; margin-top: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 6px; text-align: left; }
th { border-bottom: 2px solid #ddd; }
tbody tr:nth-child(even) { background: #fafafa; }
```

- [ ] **Step 2: index.html 작성**

Create `public/index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kakao Contents Planner</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <h2>Kakao Contents Planner</h2>
      <a class="navlink" href="/report">리포트 →</a>
    </div>

    <div id="banner" class="banner">불러오는 중…</div>

    <div class="toolbar">
      <button id="prevBtn">← 이전</button>
      <strong id="monthLabel"></strong>
      <button id="nextBtn">다음 →</button>
    </div>

    <div class="cal-grid" id="calHead"></div>
    <div class="cal-grid" id="calBody"></div>
  </div>

  <div id="modalBackdrop" class="modal-backdrop hidden">
    <div class="modal">
      <h3 id="modalTitle">콘텐츠 등록</h3>
      <div class="row">
        <div><label>발송일</label><input type="date" id="f-sendDate" /></div>
        <div><label>발송시간</label><input type="time" id="f-sendTime" value="10:00" /></div>
      </div>
      <label>제목 *</label><input id="f-title" />
      <label>연결 링크</label><input id="f-link" />
      <div class="row">
        <div><label>카테고리</label><input id="f-category" list="dl-category" /></div>
        <div><label>제품명</label><input id="f-product" list="dl-product" /></div>
      </div>
      <label>포맷</label><input id="f-format" list="dl-format" />
      <label>코멘트</label><textarea id="f-comment" rows="2"></textarea>

      <div id="resultSection" style="display:none">
        <hr style="margin:16px 0" />
        <h4 style="margin:0 0 4px">발송 후 결과</h4>
        <div class="row">
          <div><label>오픈률(%)</label><input type="number" id="f-openRate" step="0.1" /></div>
          <div><label>피드백</label><input id="f-feedback" /></div>
        </div>
        <button id="saveResultBtn" style="margin-top:8px">결과 저장</button>
      </div>

      <div class="modal-actions">
        <button id="deleteBtn" style="display:none">삭제</button>
        <div class="row" style="gap:8px">
          <button id="closeBtn">닫기</button>
          <button id="saveBtn" class="primary">등록</button>
        </div>
      </div>
    </div>
  </div>

  <datalist id="dl-category"></datalist>
  <datalist id="dl-product"></datalist>
  <datalist id="dl-format"></datalist>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add styles and main page markup"
```

---

## Task 8: 메인 클라이언트 로직 (public/app.js)

**Files:**
- Create: `public/app.js`

- [ ] **Step 1: app.js 작성**

Create `public/app.js`:
```javascript
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
```

- [ ] **Step 2: 브라우저 검증**

`node seed.js` 는 아직 없으므로 데이터 없이 확인. `node server.js` 실행 후 preview 도구로 `http://localhost:3000` 확인.
Expected:
- 배너 "이번 주 발송 예정 N건" 렌더
- 현재 월 캘린더 그리드(월~일 헤더) 렌더, 콘솔 에러 없음
- 빈 날짜 클릭 → 등록 모달, 발송일 프리필
- 콘텐츠 등록 → 캘린더에 칩 표시
- 칩 클릭 → 수정 모달 + 결과 입력 영역 표시

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add main page client logic (calendar, banner, modal)"
```

---

## Task 9: 리포트 페이지 (public/report.html, public/report.js)

**Files:**
- Create: `public/report.html`, `public/report.js`

- [ ] **Step 1: report.html 작성**

Create `public/report.html`:
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>리포트 · Kakao Contents Planner</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <h2>리포트</h2>
      <a class="navlink" href="/">← 캘린더</a>
    </div>

    <div class="row" style="align-items:flex-end; margin-bottom:16px; max-width:640px">
      <div><label>시작일</label><input type="date" id="from" /></div>
      <div><label>종료일</label><input type="date" id="to" /></div>
      <button id="previewBtn">미리보기</button>
      <button id="downloadBtn" class="primary">CSV 다운로드</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>발송일</th><th>시간</th><th>제목</th><th>카테고리</th>
          <th>제품</th><th>포맷</th><th>오픈률</th><th>피드백</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="8" style="color:#888">기간을 지정하고 미리보기를 누르세요.</td></tr>
      </tbody>
    </table>
  </div>
  <script src="/report.js"></script>
</body>
</html>
```

- [ ] **Step 2: report.js 작성**

Create `public/report.js`:
```javascript
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
```

- [ ] **Step 3: 브라우저 검증**

`node server.js` 실행 후 preview 도구로 `http://localhost:3000/report` 확인.
Expected: 기간(2026-07-01 ~ 2026-07-31) 지정 → 미리보기 시 표 렌더 → CSV 다운로드 클릭 시 파일 응답(200, Content-Disposition attachment).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add report page with preview and CSV download"
```

---

## Task 10: 시드 + 최종 검증 + README

**Files:**
- Create: `seed.js`, `README.md`

- [ ] **Step 1: seed.js 작성 (전부 더미 데이터)**

Create `seed.js`:
```javascript
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
```

- [ ] **Step 2: 시드 실행 확인**

Run: `node seed.js`
Expected: `Seeded dummy data.` (ExperimentalWarning 무시). 이후 `data.db` 파일 생성됨.

- [ ] **Step 3: 전체 테스트 실행**

Run: `node --test "tests/**/*.test.js"`
Expected: PASS (7 tests: week 4, csv 3), 0 fail.

- [ ] **Step 4: 엔드투엔드 브라우저 검증**

`node server.js` 실행 → preview 도구로:
- `http://localhost:3000` : 배너에 이번 주 항목(7/24) 노출, 7월 캘린더에 7/20(초록=결과있음)·7/24 칩 표시
- 새 콘텐츠 등록/수정/삭제 동작
- `http://localhost:3000/report` : 2026-07-01~2026-07-31 미리보기 2건, CSV 다운로드 성공
검증 후 서버 종료.

- [ ] **Step 5: README 작성**

Create `README.md`:
```markdown
# Kakao Contents Planner

DI팀 카카오 콘텐츠 발송 플랜 관리 도구 (v1). 외부 의존성 없는 순수 Node.js.

## 요구사항
- Node.js v22+ (v24 권장). 별도 설치·빌드 없음.

## 실행
    node seed.js     # (선택) 더미 데이터 넣기
    node server.js   # http://localhost:3000

테스트: `node --test "tests/**/*.test.js"`

## 기능
- 월별 캘린더로 발송 플랜 등록/수정/삭제
- 발송 후 결과(오픈률/피드백) 기록
- 이번 주 발송 예정 배너
- 기간 지정 리포트 CSV 다운로드 (엑셀 한글 지원, BOM 포함)

## 데이터
- SQLite 파일 `data.db` (자동 생성). `KCP_DB` 환경변수로 경로 변경 가능.
- 공유: 같은 네트워크에서 서버에 접속하거나, 사내 서버에서 `node server.js` 상시 구동.

## 데이터 원칙
시드/예시는 전부 더미 데이터. 실제 고객·환자·미공개 임상/매출 정보는 넣지 않는다.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add seed, README; final verification"
```

---

## Self-Review 체크

- **Spec 커버리지:** 발송플랜 등록+캘린더(T6~T8), 결과 등록(T5·T8), 이번 주 배너(T5 `/api/week`·T8), CSV 리포트(T5·T9) — PRD 필수기능 4개 모두 태스크 존재. ✅
- **더미 데이터 원칙:** seed(T10)·README(T10)에 명시. ✅
- **의존성 0개:** 모든 모듈이 `node:*` 내장만 사용(`node:http`/`node:sqlite`/`node:crypto`/`node:test`). npm 불필요. ✅
- **타입/시그니처 일관성:** `assemble()`가 만드는 content 객체 형태(`{...,result:{openRate,feedback,recordedAt}|null}`)를 `toCsv`(T4)·`app.js`·`report.js`가 동일하게 소비. `weekRange`/`ymd`(T3)를 `api.thisWeek`(T5)가 사용. 날짜는 전 구간 `YYYY-MM-DD`. ✅
- **날짜 범위:** db.listContents는 `>= from AND <= to`(양끝 포함). thisWeek은 [월, 일] 포함. report from~to 포함. ✅
```