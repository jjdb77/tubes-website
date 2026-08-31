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

  // Suggesties van de locatievergelijking gaan meteen per mail door; de rest
  // van de contactberichten staat (voorlopig) alleen op /beheer.
  if (!flagged) {
    meldLocatieSuggestie(entry).catch((err) => console.error("[mail] locatiesuggestie:", err.message));
  }
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
    const max = {};
    for (const question of config.questions || []) {
      if (!question.key) continue;
      keys.push(question.key);
      labels[question.key] = question.label || question.key;
      allowed[question.key] = new Set(question.options || []);
      if (question.max) max[question.key] = question.max;
    }
    if (keys.length) return { keys, labels, allowed, max };
  } catch {
    console.warn("healthcheck.json niet te lezen, vragen worden niet opgeslagen");
  }
  return { keys: [], labels: {}, allowed: {}, max: {} };
}

const { keys: HC_KEYS, labels: HC_LABELS, allowed: HC_ALLOWED, max: HC_MAX } = readHealthCheckConfig();

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

    // Sommige vragen laten meer antwoorden toe; die komen als lijst binnen.
    // Alleen bekende keuzes worden bewaard, één of meer.
    const answers = {};
    for (const key of HC_KEYS) {
      const binnen = Array.isArray(b[key]) ? b[key] : [b[key]];
      const geldig = binnen
        .map((v) => String(v || "").trim())
        .filter((v) => HC_ALLOWED[key]?.has(v));
      // Een vraag kan een maximum hebben; meer dan dat bewaren we niet.
      const max = HC_MAX[key] || geldig.length;
      if (geldig.length) answers[key] = geldig.slice(0, max).join(", ");
    }
    if (Object.keys(answers).length) entry.answers = answers;

    const notes = String(b.notes || "").trim().slice(0, 2000);
    if (notes) entry.notes = notes;

    fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + "\n");
    res.json({ ok: true, id: entry.id });
    // Eerst doorzetten, dan de mail: dan staat er meteen in of het gelukt is.
    pushToCrm(entry, answers).then((ok) => meldNieuweAanvraag(entry, answers, ok));
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
//   CRM_URL           de intake van 4Relations (verplicht), in de praktijk
//                     https://4relationstubes.appconnected.nl/api/assessments/intake
//   CRM_TOKEN         de sleutel (env ASSESSMENT_TOKEN aan de 4Relations-kant)
//   CRM_AUTH_HEADER   naam van de header; voor die intake "x-assessment-token"
//   CRM_AUTH_PREFIX   wat vóór de sleutel komt; voor die intake leeg laten
// Zonder CRM_URL gebeurt er niets en werkt de rest gewoon.

const CRM_URL = process.env.CRM_URL || "";
const CRM_TOKEN = process.env.CRM_TOKEN || "";
const CRM_AUTH_HEADER = process.env.CRM_AUTH_HEADER || "Authorization";
const CRM_AUTH_PREFIX = process.env.CRM_AUTH_PREFIX ?? "Bearer ";
const CRM_STATUS = process.env.CRM_STATUS || "prospect";

// Waarschuwing per e-mail als een aanvraag blijft vastzitten. Verstuurd via
// Resend (dezelfde dienst als 4Relations gebruikt); zonder RESEND_API_KEY
// gebeurt er niets en blijft het bij de regel in de serverlog. Het afzender-
// adres moet een domein zijn dat in Resend geverifieerd is: appsolutions.nl is
// dat, tubes.media (nog) niet.
const MAIL_KEY = process.env.RESEND_API_KEY || "";
const MAIL_API = process.env.MAIL_API_URL || "https://api.resend.com/emails";
const MAIL_FROM = process.env.MAIL_FROM || "Tubes site <info@appsolutions.nl>";
// Twee lijsten, want het zijn twee soorten bericht: een aanvraag is nieuws voor
// wie het gesprek voert, een storing is iets om te repareren. Komma's ertussen.
const LEAD_EMAIL = process.env.LEAD_EMAIL || "joachim@tubes.media, chris.arboit@tubes.media";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "joachim@tubes.media";
const adressen = (lijst) => String(lijst).split(",").map((a) => a.trim()).filter(Boolean);
// Pas na drie mislukte pogingen (een half uur proberen) is het meer dan een
// hikje en is een mailtje op zijn plaats.
const ALERT_NA_POGINGEN = 3;

// Wat we naar 4Relations sturen: de assessment-intake
// (POST /api/assessments/intake). Die verwacht de velden plat, maakt van het
// bedrijf een relatie en van de persoon een contactpersoon (beide find-or-create,
// dus geen dubbelen), en bewaart de rest als JSON onder "answers".
function crmPayload(entry, answers) {
  const vragen = Object.entries(answers || {}).map(([key, answer]) => ({
    key,
    question: HC_LABELS[key] || key,
    answer,
  }));
  // De samenvatting is wat er in de lijst te lezen valt zonder doorklikken.
  const regels = [
    entry.role ? `Role: ${entry.role}` : "",
    ...vragen.map((v) => `${v.question} ${v.answer}`),
    entry.notes ? `Wants to discuss: ${entry.notes}` : "",
  ].filter(Boolean);

  return {
    source: "tubes.media",
    name: entry.name || "",
    email: entry.email || "",
    telephone: "",
    company: entry.company || "",
    // "title" is het soort assessment; in de lijst staat die kolom als
    // "Assessment". Bewust geen score: die kan pas uit het gesprek komen.
    title: "Production Health Check",
    summary: regels.join(" · ").slice(0, 1000),
    answers: {
      reference: entry.id,
      received_at: entry.at,
      page: entry.page || "",
      role: entry.role || "",
      notes: entry.notes || "",
      status: CRM_STATUS,
      questions: vragen,
    },
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

// Geeft true/false terug of het doorzetten lukte, en null als de koppeling
// uitstaat: dan valt er ook niets te melden.
async function pushToCrm(entry, answers) {
  if (!CRM_URL || entry.spam) return null;
  if (typeof fetch !== "function") {
    console.warn("Geen fetch beschikbaar in deze Node-versie, 4Relations overgeslagen");
    return null;
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
    const fout = res.ok ? "" : `HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
    if (fout) console.error("4Relations: doorzetten mislukt:", fout);
    recordPush(entry, res.ok, fout);
    return res.ok;
  } catch (err) {
    const fout = err.name === "AbortError" ? "time-out na 8 seconden" : err.message;
    console.error("4Relations: doorzetten mislukt:", fout);
    recordPush(entry, false, fout);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Achtervang. Mislukt het doorzetten, dan blijft de aanvraag in de eigen
// opslag staan, maar er is niemand die daar een seintje van krijgt. Daarom
// biedt de server alles wat nog niet is aangekomen vanzelf opnieuw aan: elke
// tien minuten, tot zeven dagen terug en hoogstens twaalf pogingen per
// aanvraag. Een storing bij 4Relations herstelt zichzelf dus binnen een paar
// minuten; is er iets structureels mis (verkeerde sleutel), dan houdt het na
// twee uur op en blijft de aanvraag zichtbaar op /beheer met de foutmelding
// erbij, plus de knop om het met de hand te proberen.
const CRM_RETRY_MS = 10 * 60 * 1000;
const CRM_RETRY_DAGEN = 7;
const CRM_MAX_POGINGEN = 12;

async function verstuurWachtenden({ alles = false } = {}) {
  if (!CRM_URL) return 0;
  const grens = Date.now() - CRM_RETRY_DAGEN * 24 * 60 * 60 * 1000;
  const wachtenden = readSubmissions().filter(
    (s) =>
      s.kind === "health_check" &&
      s.stage !== "email" &&
      !s.spam &&
      !s.crm?.ok &&
      (alles || ((s.crm?.pogingen || 0) < CRM_MAX_POGINGEN && Date.parse(s.at) >= grens))
  );
  for (const entry of wachtenden) {
    await pushToCrm(entry, entry.answers || null);
  }
  if (wachtenden.length) {
    console.warn(`4Relations: ${wachtenden.length} aanvraag${wachtenden.length === 1 ? "" : "en"} opnieuw aangeboden`);
  }
  return wachtenden.length;
}

async function stuurMail(naar, onderwerp, html) {
  const ontvangers = adressen(naar);
  if (!MAIL_KEY || !ontvangers.length) {
    console.warn("[mail] geen sleutel of geen ontvanger, mail niet verstuurd:", onderwerp);
    return false;
  }
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(MAIL_API, {
      method: "POST",
      signal: stop.signal,
      headers: { Authorization: `Bearer ${MAIL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: ontvangers, subject: onderwerp, html }),
    });
    if (!res.ok) {
      console.error("[mail] verzenden mislukt:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] fout:", err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Mail bij elke complete aanvraag: wie het is, wat er is ingevuld, en of hij
// in 4Relations staat. Zo hoef je niet op /beheer te wachten om te weten dat
// er iemand langs is geweest.
async function meldNieuweAanvraag(entry, answers, crmOk) {
  if (!MAIL_KEY || entry.spam) return;

  const vragen = Object.entries(answers || {})
    .map(([key, antwoord]) => `<tr><td style="padding:4px 12px 4px 0;color:#5C6B74;vertical-align:top">${esc(HC_LABELS[key] || key)}</td><td style="padding:4px 0"><strong>${esc(antwoord)}</strong></td></tr>`)
    .join("");

  const stand =
    crmOk === null
      ? "<p>De koppeling met 4Relations staat uit, dus deze aanvraag staat alleen in de eigen opslag.</p>"
      : crmOk
        ? "<p>Hij staat in 4Relations, met de relatie en de contactpersoon eraan gekoppeld.</p>"
        : "<p><strong>Let op:</strong> doorzetten naar 4Relations lukte nog niet. De server probeert het elke tien minuten opnieuw.</p>";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1C2B33;line-height:1.6">
    <p><strong>${esc(entry.name || entry.email)}</strong>${entry.company ? ` van ${esc(entry.company)}` : ""}${entry.role ? `, ${esc(entry.role)},` : ""} vroeg een Production Health Check aan.</p>
    <p><a href="mailto:${esc(entry.email)}">${esc(entry.email)}</a>${entry.free_email ? " (geen zakelijk domein)" : ""} &middot; ${esc(stamp(entry.at))}</p>
    ${vragen ? `<table style="border-collapse:collapse;margin:16px 0">${vragen}</table>` : ""}
    ${entry.notes ? `<p style="background:#F6F7F9;padding:12px;border-radius:8px"><em>Wil het hebben over:</em><br>${esc(entry.notes)}</p>` : ""}
    ${stand}
    <p><a href="https://www.tubes.media/beheer">Alle aanvragen op /beheer</a></p>
  </div>`;

  await stuurMail(
    LEAD_EMAIL,
    `Health Check-aanvraag: ${entry.name || entry.email}${entry.company ? ` (${entry.company})` : ""}`,
    html
  );
}

// Suggestie voor de locatievergelijking (/compare-film-tv-locations/). Het
// formulier daar zet "Location request: <locatie>" vooraan in het bericht en
// de toelichting eronder. Zo'n bericht gaat meteen naar LOCATION_EMAIL, zodat
// het niet op /beheer blijft liggen tot iemand kijkt.
const LOCATION_EMAIL = process.env.LOCATION_EMAIL || "joachim@tubes.media";
const LOCATIE_PREFIX = "Location request:";

async function meldLocatieSuggestie(entry) {
  if (!MAIL_KEY || !String(entry.message || "").startsWith(LOCATIE_PREFIX)) return;
  const [kop, ...rest] = entry.message.split("\n");
  const locatie = kop.slice(LOCATIE_PREFIX.length).trim() || "(niet ingevuld)";
  const toelichting = rest.join("\n").trim();
  const naam = `${entry.first_name} ${entry.last_name}`.trim();

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1C2B33;line-height:1.6">
    <p><strong>${esc(naam)}</strong> stelt een locatie voor op de vergelijkingspagina: <strong>${esc(locatie)}</strong>.</p>
    <p><a href="mailto:${esc(entry.email)}">${esc(entry.email)}</a>${entry.phone ? ` &middot; ${esc(entry.phone)}` : ""} &middot; ${esc(stamp(entry.at))}</p>
    ${toelichting ? `<p style="background:#F6F7F9;padding:12px;border-radius:8px;white-space:pre-line"><em>Toelichting:</em><br>${esc(toelichting)}</p>` : "<p>Geen toelichting meegegeven.</p>"}
    <p>Toevoegen of corrigeren kan in het CMS onder "Locaties (vergelijkingspagina)".</p>
    <p><a href="https://www.tubes.media/compare-film-tv-locations/">De vergelijkingspagina</a> &middot; <a href="https://www.tubes.media/beheer">Alle berichten op /beheer</a></p>
  </div>`;

  await stuurMail(LOCATION_EMAIL, `Location suggestion: ${locatie} (${naam})`, html);
}

// Eén mail per aanvraag, en alleen als het na een paar pogingen nog steeds
// misgaat. Zo blijft het stil bij een hikje van een paar minuten, en krijg je
// wel bericht als er echt iets stuk is. Wat gemeld is, wordt vastgelegd, dus
// een herstart levert geen tweede mail op.
async function meldVastzitters() {
  if (!CRM_URL || !MAIL_KEY) return;
  const vast = readSubmissions().filter(
    (s) =>
      s.kind === "health_check" && s.stage !== "email" && !s.spam && !s.crm?.ok &&
      !s.gemeld && (s.crm?.pogingen || 0) >= ALERT_NA_POGINGEN
  );
  if (!vast.length) return;

  const regels = vast
    .map(
      (s) => `<li><strong>${esc(s.name || s.email)}</strong>${s.company ? ` (${esc(s.company)})` : ""}<br>
        <a href="mailto:${esc(s.email)}">${esc(s.email)}</a> &middot; binnengekomen ${esc(stamp(s.at))}<br>
        <span style="color:#8A2E3B">${esc(s.crm?.error || "onbekende fout")}</span></li>`
    )
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1C2B33;line-height:1.6">
    <p>${vast.length === 1 ? "Een Health Check-aanvraag komt" : `${vast.length} Health Check-aanvragen komen`} niet in 4Relations aan.</p>
    <ul>${regels}</ul>
    <p>De aanvra${vast.length === 1 ? "ag staat" : "gen staan"} veilig in de eigen opslag van de site en de server blijft het elke tien minuten proberen, tot twaalf keer. Klopt de sleutel of het adres niet, dan lost vanzelf proberen het niet op.</p>
    <p><a href="https://www.tubes.media/beheer">Bekijk de aanvragen op /beheer</a></p>
  </div>`;

  const verstuurd = await stuurMail(
    ALERT_EMAIL,
    vast.length === 1 ? "Health Check-aanvraag komt niet in 4Relations aan" : `${vast.length} Health Check-aanvragen komen niet in 4Relations aan`,
    html
  );
  if (!verstuurd) return;
  for (const entry of vast) {
    fs.appendFileSync(
      DATA_FILE,
      JSON.stringify({ id: crypto.randomUUID(), at: new Date().toISOString(), kind: "crm_alert", lead_id: entry.id }) + "\n"
    );
  }
  console.warn(`4Relations: ${vast.length} vastzittende aanvraag${vast.length === 1 ? "" : "en"} gemeld aan ${adressen(ALERT_EMAIL).join(", ")}`);
}

if (CRM_URL) {
  // Kort na het opstarten (een deploy kan net in een storing gevallen zijn) en
  // daarna op de klok. unref: dit mag het afsluiten nooit tegenhouden.
  const ronde = async () => {
    await verstuurWachtenden();
    await meldVastzitters();
  };
  setTimeout(ronde, 60 * 1000).unref?.();
  setInterval(ronde, CRM_RETRY_MS).unref?.();
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
  const pogingen = new Map();
  const gemeld = new Set();
  for (const s of all) {
    if (s.kind === "crm_push" && s.lead_id) {
      pushes.set(s.lead_id, s);
      pogingen.set(s.lead_id, (pogingen.get(s.lead_id) || 0) + 1);
    }
    if (s.kind === "crm_alert" && s.lead_id) gemeld.add(s.lead_id);
  }

  // Van één bezoeker kunnen meerdere regels komen: het e-mailadres dat bij het
  // doorklikken wordt vastgelegd, en daarna de ingevulde vragenlijst. Wie
  // terugloopt en opnieuw verstuurt, levert er nog een. Per persoon houden we
  // de rijkste, meest recente regel over; de rest blijft wel in het bestand.
  const berichten = all.filter((s) => s.kind !== "crm_push" && s.kind !== "crm_alert");
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
    if (push) entry.crm = { ok: push.ok, error: push.error || "", at: push.at, pogingen: pogingen.get(entry.id) || 1 };
    if (gemeld.has(entry.id)) entry.gemeld = true;
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
    <p class="count">${open} aanvra${open === 1 ? "ag" : "gen"} nog niet in 4Relations. De server probeert het elke tien minuten vanzelf opnieuw.
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

  await verstuurWachtenden({ alles: true });
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
