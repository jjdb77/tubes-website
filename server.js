// Tubes website-server: serveert de statische site én vangt
// formulierberichten op, met een beheerpagina op /beheer.
//
// Opslag: JSON-lines in een bestand op de Railway-volume
// (RAILWAY_VOLUME_MOUNT_PATH). Beveiliging beheerpagina: Basic Auth
// met het wachtwoord uit de env-variabele ADMIN_PASSWORD.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.jsonl");
fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// ---------- Formulier ontvangen ----------

const recent = new Map(); // simpele rate-limit per IP

app.post("/api/contact", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

  // Max 5 berichten per 10 minuten per IP
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 5) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }
  hits.push(now);
  recent.set(ip, hits);

  const b = req.body || {};

  // Honeypot: echte bezoekers vullen dit onzichtbare veld nooit in
  if (b.company_website) {
    return res.json({ ok: true });
  }

  const first = String(b.first_name || "").trim().slice(0, 100);
  const last = String(b.last_name || "").trim().slice(0, 100);
  const email = String(b.email || "").trim().slice(0, 200);
  const phone = String(b.phone || "").trim().slice(0, 50);
  const message = String(b.message || "").trim().slice(0, 5000);

  if (!first || !last || !email || !message || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }

  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    first_name: first,
    last_name: last,
    email,
    phone,
    message,
    page: String(b.page || "").slice(0, 200),
  };
  fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
  res.json({ ok: true });
});

// ---------- Beheerpagina ----------

function checkAuth(req, res) {
  const wanted = process.env.ADMIN_PASSWORD;
  if (!wanted) {
    res.status(503).send("Stel eerst de env-variabele ADMIN_PASSWORD in op Railway.");
    return false;
  }
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [, pass] = Buffer.from(encoded, "base64").toString().split(":");
    const a = Buffer.from(String(pass || ""));
    const b = Buffer.from(wanted);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  res.set("WWW-Authenticate", 'Basic realm="Tubes beheer"');
  res.status(401).send("Inloggen vereist.");
  return false;
}

function readSubmissions() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs
    .readFileSync(DATA_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .reverse();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.get("/beheer", (req, res) => {
  if (!checkAuth(req, res)) return;
  const items = readSubmissions();
  const rows = items
    .map(
      (s) => `<article class="msg">
        <header><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
          <span>${new Date(s.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</span></header>
        <p class="meta"><a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.phone ? " &middot; " + esc(s.phone) : ""}${s.page ? " &middot; via " + esc(s.page) : ""}</p>
        <p class="body">${esc(s.message)}</p>
      </article>`
    )
    .join("\n");
  res.send(`<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Berichten — Tubes beheer</title>
<style>
  body{font-family:"Mulish",system-ui,sans-serif;background:#F6F7F9;color:#5C5750;margin:0;padding:40px 20px}
  .wrap{max-width:760px;margin:0 auto}
  h1{color:#1A1A1A;font-size:1.6rem}
  .count{color:#8B8E94;margin-bottom:24px}
  .msg{background:#fff;border:1px solid #E3E5E9;border-radius:16px;padding:22px 24px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .msg header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .msg header strong{color:#1A1A1A}
  .msg header span{color:#8B8E94;font-size:.85rem}
  .meta{font-size:.9rem;margin:.4em 0}
  .meta a{color:#0E8C77}
  .body{white-space:pre-wrap;margin:.6em 0 0;color:#1A1A1A}
  .empty{background:#fff;border:1px dashed #E3E5E9;border-radius:16px;padding:40px;text-align:center;color:#8B8E94}
</style></head><body><div class="wrap">
<h1>Berichten</h1>
<p class="count">${items.length} bericht${items.length === 1 ? "" : "en"} &middot; <a href="/beheer/export.csv" style="color:#0E8C77">download als CSV</a></p>
${rows || '<div class="empty">Nog geen berichten. Zodra iemand het formulier verstuurt, verschijnt het hier.</div>'}
</div></body></html>`);
});

app.get("/beheer/export.csv", (req, res) => {
  if (!checkAuth(req, res)) return;
  const items = readSubmissions();
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = ["datum,voornaam,achternaam,email,telefoon,bericht,pagina"]
    .concat(items.map((s) => [s.at, s.first_name, s.last_name, s.email, s.phone, s.message, s.page].map(q).join(",")))
    .join("\r\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", "attachment; filename=tubes-berichten.csv");
  res.send("﻿" + csv);
});

// ---------- Statische site ----------

const SITE = path.join(__dirname, "_site");
app.use(express.static(SITE, { extensions: ["html"] }));
app.use((req, res) => {
  res.status(404).sendFile(path.join(SITE, "404.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tubes site + formulierbackend op poort ${PORT}, data in ${DATA_FILE}`);
});
