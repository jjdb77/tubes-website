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

// Max <max> inzendingen per 10 minuten per IP. De Health Check stuurt twee
// keer (stap 1 en stap 2) en krijgt daarom een ruimere marge.
function rateLimited(req, max) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= max) return true;
  hits.push(now);
  recent.set(ip, hits);
  return false;
}

app.post("/api/contact", (req, res) => {
  if (rateLimited(req, 5)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }

  const b = req.body || {};

  // Honeypot: dit veld staat op display:none, dus alleen bots vullen het in.
  // We gooien zo'n bericht niet weg maar merken het: een wachtwoordmanager die
  // het tóch invult mag nooit een echte aanvraag laten verdwijnen. Op /beheer
  // staan gemarkeerde berichten apart.
  const flagged = Boolean(String(b.company_website || "").trim());

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
    ...(flagged ? { spam: true } : {}),
  };
  fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
  res.json({ ok: true });
});

// ---------- Health Check-aanvragen ----------
//
// De pagina /production-finance-health-check/ vraagt in twee stappen. Stap 1
// stuurt alleen het e-mailadres (stage "email"), stap 2 de rest (stage
// "complete") met lead_id erbij. Zo blijft een half ingevulde aanvraag toch
// zichtbaar in de trechter, en telt hij niet dubbel: /beheer laat de regel van
// stap 1 weg zodra de bijbehorende stap 2 binnen is.
//
// Opslag: hetzelfde JSONL-bestand op de volume als het contactformulier, geen
// tweede systeem ernaast.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// Gratis e-maildomeinen blokkeren we niet: veel producenten werken zelfstandig
// en gebruiken hun eigen adres. We markeren ze alleen, zodat op /beheer te zien
// is welke aanvragen van een bedrijfsdomein komen.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com",
  "live.com", "live.nl", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "msn.com",
  "ziggo.nl", "kpnmail.nl", "telfort.nl", "home.nl", "planet.nl", "xs4all.nl",
]);

// De zes gebieden en de drie labels, zoals ze op de pagina staan. Alleen deze
// waarden worden bewaard, zodat er geen losse tekst in de opslag belandt.
const HC_AREAS = [
  "budget_structure",
  "budget_handover",
  "actuals",
  "forecasting",
  "approvals",
  "reporting",
];
const HC_AREA_LABELS = {
  budget_structure: "Budgetstructuur en versiebeheer",
  budget_handover: "Budget naar productie",
  actuals: "Actuals en reconciliatie",
  forecasting: "Forecasting",
  approvals: "Approvals en controls",
  reporting: "Reporting en zichtbaarheid",
};
const HC_LABELS = new Set(["Strong", "Could improve", "Opportunity"]);

app.post("/api/health-check", (req, res) => {
  if (rateLimited(req, 12)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }

  const b = req.body || {};

  // Zie het contactformulier: markeren, niet weggooien.
  const flagged = Boolean(String(b.company_website || "").trim());

  const email = String(b.email || "").trim().slice(0, 200);
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  const STAGES = new Set(["email", "complete", "assessment"]);
  const stage = STAGES.has(b.stage) ? b.stage : "email";
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: "health_check",
    stage,
    email,
    free_email: FREE_EMAIL_DOMAINS.has(email.split("@")[1].toLowerCase()),
    page: String(b.page || "").slice(0, 200),
    ...(flagged ? { spam: true } : {}),
  };

  // Het optionele zelfbeeld dat ná de bevestiging wordt ingevuld. Hoort bij de
  // aanvraag waarvan het id in lead_id staat; /beheer vouwt het daarin.
  if (stage === "assessment") {
    const answers = {};
    for (const key of HC_AREAS) {
      const value = String(b[key] || "").trim();
      if (HC_LABELS.has(value)) answers[key] = value;
    }
    if (!Object.keys(answers).length) {
      return res.status(400).json({ ok: false, error: "No answers" });
    }
    entry.lead_id = String(b.lead_id || "").slice(0, 64);
    entry.answers = answers;
    fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
    return res.json({ ok: true, id: entry.id });
  }

  if (stage === "complete") {
    const name = String(b.name || "").trim().slice(0, 120);
    const company = String(b.company || "").trim().slice(0, 160);
    if (!name || !company) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }
    entry.lead_id = String(b.lead_id || "").slice(0, 64);
    entry.name = name;
    entry.company = company;
    entry.role = String(b.role || "").trim().slice(0, 120);
    entry.improve = String(b.improve || "").trim().slice(0, 120);
    entry.current_system = String(b.current_system || "").trim().slice(0, 120);
  }

  fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
  res.json({ ok: true, id: entry.id });
});

// ---------- MMG-pitchpagina's (Basic Auth) ----------

const MMG_PASSWORD = process.env.MMG_PASSWORD || "MMGTubes01!";

app.use("/mmg", (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [, pass] = Buffer.from(encoded, "base64").toString().split(":");
    const a = Buffer.from(String(pass || ""));
    const b = Buffer.from(MMG_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Tubes for Motion Media Group"');
  res.status(401).send("Password required.");
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
  const all = fs
    .readFileSync(DATA_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  // Een afgeronde Health Check verwijst met lead_id naar de regel van stap 1.
  // Die eerste regel laten we hier weg, anders staat dezelfde aanvraag er
  // twee keer. In het bestand blijven allebei staan (trechterdata).
  const superseded = new Set(
    all.filter((s) => s.stage === "complete").map((s) => s.lead_id).filter(Boolean)
  );

  // Het zelfbeeld is geen apart bericht maar hoort bij de aanvraag.
  const answersByRequest = new Map();
  for (const s of all) {
    if (s.stage === "assessment" && s.lead_id) answersByRequest.set(s.lead_id, s.answers);
  }

  const list = all.filter((s) => s.stage !== "assessment" && !superseded.has(s.id));
  for (const s of list) {
    const answers = answersByRequest.get(s.id);
    if (answers) s.answers = answers;
  }
  return list.reverse();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const stamp = (at) => new Date(at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });

function contactCard(s) {
  return `<article class="msg">
        <header><strong>${esc(s.first_name)} ${esc(s.last_name)}</strong>
          <span>${stamp(s.at)}</span></header>
        <p class="meta">${s.spam ? '<span class="tag tag-warn">als spam gemarkeerd</span> ' : ""}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.phone ? " &middot; " + esc(s.phone) : ""}${s.page ? " &middot; via " + esc(s.page) : ""}</p>
        <p class="body">${esc(s.message)}</p>
      </article>`;
}

// Health Check-aanvraag. Stap 1 (alleen een e-mailadres) krijgt een eigen
// label: dat is trechterdata, nog geen complete aanvraag.
function healthCheckCard(s) {
  const partial = s.stage !== "complete";
  const details = [
    ["Bedrijf", s.company],
    ["Rol", s.role],
    ["Wil verbeteren", s.improve],
    ["Werkt nu met", s.current_system],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<span><strong>${esc(label)}:</strong> ${esc(value)}</span>`)
    .join("<br>");

  const selfView = s.answers
    ? `<p class="body selfview"><strong>Zelfbeeld vooraf:</strong><br>${HC_AREAS.filter((k) => s.answers[k])
        .map((k) => `<span>${esc(HC_AREA_LABELS[k])}: <em>${esc(s.answers[k])}</em></span>`)
        .join("<br>")}</p>`
    : "";

  return `<article class="msg${partial ? " msg-partial" : ""}">
        <header><strong>${esc(s.name || s.email)}</strong>
          <span>${stamp(s.at)}</span></header>
        <p class="meta">
          <span class="tag${partial ? " tag-open" : ""}">${partial ? "Health Check &middot; alleen e-mail (stap 1)" : "Health Check-aanvraag"}</span>
          <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.free_email ? ' <span class="tag tag-warn">geen zakelijk domein</span>' : ""}${s.spam ? ' <span class="tag tag-warn">als spam gemarkeerd</span>' : ""}
        </p>
        ${details ? `<p class="body">${details}</p>` : ""}
        ${selfView}
      </article>`;
}

app.get("/beheer", (req, res) => {
  if (!checkAuth(req, res)) return;
  const all = readSubmissions();
  const showSpam = req.query.spam === "1";
  const spamCount = all.filter((s) => s.spam).length;
  const items = showSpam ? all : all.filter((s) => !s.spam);
  const healthChecks = items.filter((s) => s.kind === "health_check" && s.stage === "complete").length;
  const rows = items
    .map((s) => (s.kind === "health_check" ? healthCheckCard(s) : contactCard(s)))
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
  .msg-partial{border-style:dashed;background:#FCFCFD}
  .tag{display:inline-block;font-size:.78rem;font-weight:700;padding:3px 9px;border-radius:8px;background:#DBF3EE;color:#0E8C77;margin-right:8px}
  .tag-open{background:#FBF0CE;color:#977414}
  .tag-warn{background:#F6E7E9;color:#C23B4B;margin:0 0 0 6px}
  .body span strong{color:#5C5750;font-weight:600}
  .selfview{margin-top:10px;padding-top:10px;border-top:1px dashed #E3E5E9;font-size:.92rem}
  .selfview em{font-style:normal;font-weight:700;color:#5C5750}
</style></head><body><div class="wrap">
<h1>Berichten</h1>
<p class="count">${items.length} bericht${items.length === 1 ? "" : "en"}${healthChecks ? `, waarvan ${healthChecks} Health Check-aanvra${healthChecks === 1 ? "ag" : "gen"}` : ""} &middot; <a href="/beheer/export.csv" style="color:#0E8C77">download als CSV</a></p>
${rows || '<div class="empty">Nog geen berichten. Zodra iemand het formulier verstuurt, verschijnt het hier.</div>'}
${spamCount ? `<p class="count" style="margin-top:20px">${spamCount} bericht${spamCount === 1 ? "" : "en"} als spam gemarkeerd &middot; <a href="/beheer?spam=${showSpam ? "0" : "1"}" style="color:#0E8C77">${showSpam ? "verbergen" : "toch tonen"}</a></p>` : ""}
</div></body></html>`);
});

app.get("/beheer/export.csv", (req, res) => {
  if (!checkAuth(req, res)) return;
  const items = readSubmissions();
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = ["datum,soort,naam,email,telefoon,bedrijf,rol,wil verbeteren,werkt nu met,zelfbeeld,bericht,pagina"]
    .concat(
      items.map((s) => {
        const isHc = s.kind === "health_check";
        const soort = isHc ? (s.stage === "complete" ? "health check" : "health check (alleen e-mail)") : "contact";
        const naam = isHc ? s.name || "" : `${s.first_name || ""} ${s.last_name || ""}`.trim();
        const zelfbeeld = s.answers
          ? HC_AREAS.filter((k) => s.answers[k])
              .map((k) => `${HC_AREA_LABELS[k]}: ${s.answers[k]}`)
              .join("; ")
          : "";
        return [
          s.at, soort, naam, s.email, s.phone || "",
          s.company || "", s.role || "", s.improve || "", s.current_system || "",
          zelfbeeld, s.message || "", s.page || "",
        ].map(q).join(",");
      })
    )
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
