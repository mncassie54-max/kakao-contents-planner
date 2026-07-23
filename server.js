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
