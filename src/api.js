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
