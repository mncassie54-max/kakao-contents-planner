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
