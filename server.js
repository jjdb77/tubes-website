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

// De vragen staan in src/_data/healthcheck.json, te wijzigen via het CMS.
// Die lezen we hier ook, zodat een vraag die daar wordt toegevoegd meteen
// wordt opgeslagen en op /beheer verschijnt, zonder dat hier iets hoeft te
// veranderen. Alleen bekende sleutels en bekende labels komen erin, dus er
// belandt geen losse tekst in de opslag.
const HC_CONFIG_FILE = path.join(__dirname, "src", "_data", "healthcheck.json");

function readHealthCheckConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(HC_CONFIG_FILE, "utf8"));
    const keys = [];
    const labels = {};
    const allowed = {};
    for (const question of config.questions || []) {
      if (!question.key) continue;
      keys.push(question.key);
      labels[question.key] = question.label || question.key;
      allowed[question.key] = new Set(question.options || []);
    }
    if (keys.length) return { keys, labels, allowed };
  } catch {
    console.warn("healthcheck.json niet te lezen, vragen worden niet opgeslagen");
  }
  return { keys: [], labels: {}, allowed: {} };
}

const { keys: HC_KEYS, labels: HC_LABELS, allowed: HC_ALLOWED } = readHealthCheckConfig();

// Zoekt het e-mailadres dat bij een eerder opgeslagen aanvraag hoort. Zo hoeft
// het niet mee in de link naar de vragenlijst.
function emailForEntry(id) {
  if (!id || !fs.existsSync(DATA_FILE)) return "";
  for (const line of fs.readFileSync(DATA_FILE, "utf8").split("\n")) {
    if (!line.includes(id)) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.id === id) return String(entry.email || "");
    } catch { /* stukke regel overslaan */ }
  }
  return "";
}

app.post("/api/health-check", (req, res) => {
  if (rateLimited(req, 12)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }

  const b = req.body || {};

  // Zie het contactformulier: markeren, niet weggooien.
  const flagged = Boolean(String(b.company_website || "").trim());

  const STAGES = new Set(["email", "details"]);
  const stage = STAGES.has(b.stage) ? b.stage : "email";
  const leadId = String(b.lead_id || "").slice(0, 64);

  let email = String(b.email || "").trim().slice(0, 200);
  if (stage === "details" && !EMAIL_RE.test(email) && leadId) {
    email = emailForEntry(leadId);
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }
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

  // De ingevulde vragenlijst: wie je bent plus de antwoorden. Alleen bekende
  // sleutels en bekende keuzes komen erin, dus er belandt geen losse tekst in
  // de opslag.
  if (stage === "details") {
    const name = String(b.name || "").trim().slice(0, 120);
    const company = String(b.company || "").trim().slice(0, 160);
    if (!name || !company) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }
    entry.lead_id = leadId;
    entry.name = name;
    entry.company = company;
    entry.role = String(b.role || "").trim().slice(0, 120);

    const answers = {};
    for (const key of HC_KEYS) {
      const value = String(b[key] || "").trim();
      if (HC_ALLOWED[key]?.has(value)) answers[key] = value;
    }
    if (Object.keys(answers).length) entry.answers = answers;

    const notes = String(b.notes || "").trim().slice(0, 2000);
    if (notes) entry.notes = notes;

    fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
    res.json({ ok: true, id: entry.id });
    pushToCrm(entry, answers);
    return;
  }

  // Blijft over: stage "email", het adres dat bij het doorklikken wordt
  // vastgelegd. Dat is nog geen lead om in het CRM te zetten.
  fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
  res.json({ ok: true, id: entry.id });
});

// ---------- Doorzetten naar 4Relations ----------
//
// Aanvragen blijven altijd hier staan (JSONL op de volume); 4Relations is een
// kopie, geen vervanging. Daarom gebeurt het versturen ná het antwoord aan de
// bezoeker en kan een storing daar nooit een aanvraag kosten. Mislukt het,
// dan onthouden we dat en kun je het op /beheer opnieuw proberen.
//
// Aanzetten op Railway met env-variabelen:
//   CRM_URL           het adres dat een client/lead aanmaakt (verplicht)
//   CRM_TOKEN         de sleutel (optioneel, maar in de praktijk nodig)
//   CRM_AUTH_HEADER   naam van de header, standaard "Authorization"
//   CRM_AUTH_PREFIX   wat vóór de sleutel komt, standaard "Bearer "
// Zonder CRM_URL gebeurt er niets en werkt de rest gewoon.

const CRM_URL = process.env.CRM_URL || "";
const CRM_TOKEN = process.env.CRM_TOKEN || "";
const CRM_AUTH_HEADER = process.env.CRM_AUTH_HEADER || "Authorization";
const CRM_AUTH_PREFIX = process.env.CRM_AUTH_PREFIX ?? "Bearer ";
const CRM_STATUS = process.env.CRM_STATUS || "prospect";

// Wat we naar 4Relations sturen. Het bedrijf is de client (status prospect),
// de persoon het contact, en de Health Check-gegevens zitten eronder.
function crmPayload(entry, answers) {
  const domain = String(entry.email || "").split("@")[1] || "";
  return {
    source: "tubes.media",
    form: "production finance health check",
    kind: "request",
    received_at: entry.at,
    reference: entry.id,
    status: CRM_STATUS,
    client: {
      name: entry.company || "",
      email_domain: domain,
    },
    contact: {
      name: entry.name || "",
      email: entry.email || "",
      role: entry.role || "",
    },
    health_check: {
      notes: entry.notes || "",
      answers: Object.entries(answers || {}).map(([key, answer]) => ({
        key,
        question: HC_LABELS[key] || key,
        answer,
      })),
    },
    page: entry.page || "",
  };
}

function recordPush(entry, ok, error) {
  fs.appendFileSync(
    DATA_FILE,
    JSON.stringify({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: "crm_push",
      lead_id: entry.id,
      ok,
      ...(error ? { error: String(error).slice(0, 300) } : {}),
    }) + "\n"
  );
}

async function pushToCrm(entry, answers) {
  if (!CRM_URL || entry.spam) return;
  if (typeof fetch !== "function") {
    console.warn("Geen fetch beschikbaar in deze Node-versie, 4Relations overgeslagen");
    return;
  }

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(CRM_URL, {
      method: "POST",
      signal: stop.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(CRM_TOKEN ? { [CRM_AUTH_HEADER]: CRM_AUTH_PREFIX + CRM_TOKEN } : {}),
      },
      body: JSON.stringify(crmPayload(entry, answers)),
    });
    recordPush(entry, res.ok, res.ok ? "" : `HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  } catch (err) {
    recordPush(entry, false, err.name === "AbortError" ? "time-out na 8 seconden" : err.message);
  } finally {
    clearTimeout(timer);
  }
}

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

  // Uitkomst van het doorzetten naar 4Relations, laatste poging telt.
  const pushes = new Map();
  for (const s of all) {
    if (s.kind === "crm_push" && s.lead_id) pushes.set(s.lead_id, s);
  }

  // Van één bezoeker kunnen meerdere regels komen: het e-mailadres dat bij het
  // doorklikken wordt vastgelegd, en daarna de ingevulde vragenlijst. Wie
  // terugloopt en opnieuw verstuurt, levert er nog een. Per persoon houden we
  // de rijkste, meest recente regel over; de rest blijft wel in het bestand.
  const berichten = all.filter((s) => s.kind !== "crm_push");
  const groepen = new Map();
  const los = [];

  for (const s of berichten) {
    if (s.kind !== "health_check") {
      los.push(s);
      continue;
    }
    const sleutel = (s.email || s.id).toLowerCase();
    const huidig = groepen.get(sleutel);
    // Een ingevulde vragenlijst wint van een kaal e-mailadres; daarna telt de
    // laatste inzending.
    const beter =
      !huidig ||
      (Boolean(s.answers) && !huidig.answers) ||
      (Boolean(s.answers) === Boolean(huidig.answers) && new Date(s.at) > new Date(huidig.at));
    if (beter) groepen.set(sleutel, s);
  }

  const list = [...los, ...groepen.values()];
  for (const entry of list) {
    const push = pushes.get(entry.id);
    if (push) entry.crm = { ok: push.ok, error: push.error || "", at: push.at };
  }

  return list.sort((a, b) => new Date(a.at) - new Date(b.at)).reverse();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const stamp = (at) => new Date(at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });

// Merkje of deze aanvraag in 4Relations staat. Zonder CRM_URL laten we het
// helemaal weg, anders zou elke aanvraag er als "niet doorgezet" bij staan.
function crmTag(entry) {
  if (!CRM_URL || entry.spam || entry.stage === "email") return "";
  if (entry.crm?.ok) return ' <span class="tag">in 4Relations</span>';
  if (entry.crm) return ` <span class="tag tag-warn" title="${esc(entry.crm.error)}">4Relations mislukt</span>`;
  return ' <span class="tag tag-open">nog niet doorgezet</span>';
}

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
  const partial = s.stage !== "details";
  const label =
    s.stage === "details"
      ? "Health Check-aanvraag"
      : s.stage === "details"
        ? "Vragenlijst ingevuld, geen aanvraag gevonden"
        : "Health Check &middot; alleen e-mail (stap 1)";
  const details = [
    ["Bedrijf", s.company],
    ["Rol", s.role],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<span><strong>${esc(label)}:</strong> ${esc(value)}</span>`)
    .join("<br>");

  const selfView = s.answers
    ? `<p class="body selfview"><strong>Antwoorden:</strong><br>${HC_KEYS.filter((k) => s.answers[k])
        .map((k) => `<span>${esc(HC_LABELS[k])}: <em>${esc(s.answers[k])}</em></span>`)
        .join("<br>")}${s.notes ? `<br><br><strong>Wil besproken hebben:</strong><br>${esc(s.notes)}` : ""}</p>`
    : "";

  return `<article class="msg${partial ? " msg-partial" : ""}">
        <header><strong>${esc(s.name || s.email)}</strong>
          <span>${stamp(s.at)}</span></header>
        <p class="meta">
          <span class="tag${partial ? " tag-open" : ""}">${label}</span>
          <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.free_email ? ' <span class="tag tag-warn">geen zakelijk domein</span>' : ""}${s.spam ? ' <span class="tag tag-warn">als spam gemarkeerd</span>' : ""}${crmTag(s)}
        </p>
        ${details ? `<p class="body">${details}</p>` : ""}
        ${selfView}
      </article>`;
}

// Stand van de koppeling onderaan de lijst, met een knop om te herstellen.
function crmLine(items) {
  if (!CRM_URL) {
    return '<p class="count" style="margin-top:20px">4Relations-koppeling staat uit. Zet <code>CRM_URL</code> (en meestal <code>CRM_TOKEN</code>) op de Railway-service om aanvragen automatisch door te zetten.</p>';
  }
  const open = items.filter(
    (s) => s.kind === "health_check" && s.stage !== "email" && !s.spam && !s.crm?.ok
  ).length;
  if (!open) return '<p class="count" style="margin-top:20px">Alle aanvragen staan in 4Relations.</p>';
  return `<form method="POST" action="/beheer/crm-retry" style="margin-top:20px">
    <p class="count">${open} aanvra${open === 1 ? "ag" : "gen"} nog niet in 4Relations.
    <button type="submit" style="font:inherit;color:#0E8C77;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline">opnieuw proberen</button></p>
  </form>`;
}

app.get("/beheer", (req, res) => {
  if (!checkAuth(req, res)) return;
  const all = readSubmissions();
  const showSpam = req.query.spam === "1";
  const spamCount = all.filter((s) => s.spam).length;
  const items = showSpam ? all : all.filter((s) => !s.spam);
  const healthChecks = items.filter((s) => s.kind === "health_check" && s.answers).length;
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
${crmLine(items)}
${spamCount ? `<p class="count" style="margin-top:20px">${spamCount} bericht${spamCount === 1 ? "" : "en"} als spam gemarkeerd &middot; <a href="/beheer?spam=${showSpam ? "0" : "1"}" style="color:#0E8C77">${showSpam ? "verbergen" : "toch tonen"}</a></p>` : ""}
</div></body></html>`);
});

// Alles wat nog niet (goed) is doorgezet alsnog naar 4Relations sturen.
app.post("/beheer/crm-retry", async (req, res) => {
  if (!checkAuth(req, res)) return;
  if (!CRM_URL) return res.status(503).send("Stel eerst CRM_URL in op Railway.");

  const wachtenden = readSubmissions().filter(
    (s) => s.kind === "health_check" && s.stage !== "email" && !s.spam && !s.crm?.ok
  );
  for (const entry of wachtenden) {
    await pushToCrm(entry, entry.answers || null);
  }
  res.redirect("/beheer");
});

app.get("/beheer/export.csv", (req, res) => {
  if (!checkAuth(req, res)) return;
  const items = readSubmissions();
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = ["datum,soort,naam,email,telefoon,bedrijf,rol,antwoorden,bericht,pagina"]
    .concat(
      items.map((s) => {
        const isHc = s.kind === "health_check";
        const soort = isHc ? (s.answers ? "health check" : "health check (alleen e-mail)") : "contact";
        const naam = isHc ? s.name || "" : `${s.first_name || ""} ${s.last_name || ""}`.trim();
        const zelfbeeld = s.answers
          ? HC_KEYS.filter((k) => s.answers[k])
              .map((k) => `${HC_LABELS[k]}: ${s.answers[k]}`)
              .join("; ")
          : "";
        return [
          s.at, soort, naam, s.email, s.phone || "",
          s.company || "", s.role || "",
          zelfbeeld, s.notes || s.message || "", s.page || "",
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
