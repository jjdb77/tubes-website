// Tubes website-server: serveert de statische site én vangt
// formulierberichten op, met een beheerpagina op /beheer.
//
// Opslag: JSON-lines in een bestand op de Railway-volume
// (RAILWAY_VOLUME_MOUNT_PATH). Beveiliging beheerpagina: Basic Auth
// met het wachtwoord uit de env-variabele ADMIN_PASSWORD.

import express from "express";
import compression from "compression";
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
// HTML en CSS gecomprimeerd versturen: scheelt ruwweg 70% aan laadtijd,
// en laadsnelheid telt mee in de Google-ranking.
app.use(compression());

// Oude adressen doorsturen naar www.tubes.media met een 301.
// en.tubes.media was de Weglot-vertaalproxy; Product Hunt, LinkedIn en
// AlternativeTo linken daar nog naartoe en die links lopen nu dood. Een 301
// geeft de waarde van zo'n link door aan de echte site.
// Werkt pas zodra het domein in Railway op deze service staat en de DNS
// erheen wijst. tubes.appconnected.nl blijft bewust het testadres.
const CANONICAL_HOST = "www.tubes.media";
const REDIRECT_HOSTS = new Set(["tubes.media", "en.tubes.media", "www.en.tubes.media"]);

app.use((req, res, next) => {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (REDIRECT_HOSTS.has(host)) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }
  next();
});

// Oude Squarespace-adressen. Google kent deze nog (19 stuks in Search Console,
// allemaal 404) en op LinkedIn staat nog een link naar /news. Een 301 naar de
// dichtstbijzijnde nieuwe pagina houdt bezoekers binnen en geeft de waarde van
// die oude links door. Let op: het bestand src/_redirects doet op Railway
// niets, dat is een Netlify/Cloudflare-formaat. Hier is de enige echte plek.
const OLD_PATHS = new Map([
  ["/waarom-tubes", "/platform/"],
  ["/grip", "/platform/"],
  ["/artificialintelligence", "/platform/"],
  ["/oplossing", "/solutions/"],
  ["/missie", "/company/"],
  ["/home-2", "/company/"],
  ["/handleiding", "/academy/"],
  ["/product-videos", "/academy/"],
  ["/news", "/insights/"],
  ["/nieuws", "/insights/"],
  ["/contact-us", "/contact/"],
  ["/intro", "/"],
]);

app.use((req, res, next) => {
  const clean = req.path.replace(/\/+$/, "").toLowerCase() || "/";
  const target = OLD_PATHS.get(clean);
  if (target) return res.redirect(301, target);
  next();
});

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

// Alleen www.tubes.media hoort in de zoekresultaten. Het testadres
// tubes.appconnected.nl serveert exact dezelfde pagina's; zonder deze header
// biedt de site zich daar aan als tweede, concurrerende kopie. De canonical in
// de HTML wijst wel naar www, maar dat is voor Google een hint en geen regel.
//
// Let op: robots.txt blijft hier bewust alles toestaan. Een crawler moet de
// pagina kunnen ophalen om deze header te zien; zou robots.txt hem tegenhouden,
// dan zag hij de noindex nooit.
app.use((req, res, next) => {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (host !== CANONICAL_HOST) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  next();
});

const SITE = path.join(__dirname, "_site");

// Cachebeleid.
//
// De CSS-, JS- en afbeeldingslinks in de HTML dragen een ?v=<hash> die bij
// elke wijziging verandert (zie eleventy.config.js, filters "assets" en
// "imgSrc"). Zo'n URL mag een jaar bewaard blijven: na een deploy is het
// simpelweg een ander adres. Zonder die hash blijft de cache kort, anders
// zou een bezoeker na een deploy oude opmaak of een oude schermafbeelding
// blijven zien. Lettertypes en video's veranderen zelden en krijgen geen
// hash, die cachen we gewoon lang. HTML nooit cachen, zodat tekstwijzigingen
// meteen zichtbaar zijn.
const CACHE_YEAR = 60 * 60 * 24 * 365;
const CACHE_LONG = 60 * 60 * 24 * 30; // 30 dagen
const CACHE_SHORT = 60 * 5; // 5 minuten

app.use(
  express.static(SITE, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      const hashed = Boolean(res.req?.query?.v);
      if (/\.(css|js|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(filePath)) {
        res.setHeader(
          "Cache-Control",
          hashed ? `public, max-age=${CACHE_YEAR}, immutable` : `public, max-age=${CACHE_SHORT}, must-revalidate`
        );
      } else if (/\.(woff2?|mp4)$/i.test(filePath)) {
        res.setHeader("Cache-Control", `public, max-age=${CACHE_LONG}`);
      } else {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  })
);

app.use((req, res) => {
  res.status(404).sendFile(path.join(SITE, "404.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tubes site + formulierbackend op poort ${PORT}, data in ${DATA_FILE}`);
});
