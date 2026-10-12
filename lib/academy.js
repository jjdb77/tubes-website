// Tubes Academy: aanmelden met e-mail + code, goedkeuring door de eigenaar
// (in de lokale beheerapp Studoo Beheer), en downloads van de app Oskar en de
// trainingen (boek- en audiozips) voor goedgekeurde deelnemers.
//
// Contract: docs in CLAUDE.md, sectie "Tubes Academy". Kort:
//   bezoeker   GET /academy/, POST /api/academy/code|verify|logout, GET /academy/files/<naam>
//   Oskar      GET /api/academy/catalog, GET /api/academy/download/<naam>  (Bearer = licentiekey)
//              POST /api/academy/ai/v1/responses|chat/completions, GET /api/academy/ai/v1/models (Bearer = licentiekey):
//              AI via OPENAI_API_KEY op deze server (lib/ai-proxy.cjs), maandlimiet per deelnemer
//   beheer     /api/academy/admin/*  (Bearer = ACADEMY_ADMIN_TOKEN, zonder token 503)
//
// Opslag op de volume, map academy/:
//   users.json   [{ email, name, company, role, status, requestedAt, decidedAt, licenceKey, licenceExpires }]
//   files.json   [{ name, kind, bookId?, title?, version?, lang?, size, sha256, uploadedAt }]
//   files/<naam> de bestanden zelf
//   codes.json   lopende inlogcodes, alleen als HMAC-hash, met vervaltijd en pogingen
//   ai-usage.json  AI-verbruik deze maand per deelnemer (euro, aantal vragen)
//
// Losse module zonder globale toestand, zodat de tests hem met een eigen map,
// geheim en nep-mailfunctie kunnen opstarten.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import aiProxyModule from "./ai-proxy.cjs";

export const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(dmg|zip)$/;
export const BOOK_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const LICENCE_KEY_RE = /^[A-Za-z0-9._~+/=-]{8,2000}$/;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const LANG_RE = /^[a-z]{2}(-[A-Za-z]{2})?$/;
const KINDS = ["app", "book", "audio"];

const CODE_TTL = 15 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_EMAIL = 3; // per 15 minuten
const SESSION_DAYS = 30;
const COOKIE = "tubes_academy";
export const MAX_UPLOAD = 600 * 1024 * 1024;
const WINDOW = 10 * 60 * 1000;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Korte tekstvelden: geen stuurtekens, ingekort, getrimd.
function shortText(v, max = 120) {
  if (v == null) return "";
  if (typeof v !== "string") return null;
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}
function normEmail(v) {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 200 && EMAIL_RE.test(e) ? e : null;
}
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "?";
}
function humanSize(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + " GB";
  if (n >= 1024 * 1024) return Math.round(n / 1024 / 1024) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}
function contentTypeFor(name) {
  return name.endsWith(".dmg") ? "application/x-apple-diskimage" : "application/zip";
}

export function createAcademy({
  dataDir,
  secret,
  sendMail = async () => false,
  adminToken = process.env.ACADEMY_ADMIN_TOKEN || "",
  notifyEmail = process.env.ACADEMY_NOTIFY_EMAIL || "joachim@tubes.media",
  siteUrl = "https://www.tubes.media",
  pageFile = null, // het door Eleventy gebouwde _site/academy/index.html
  log = console,
  limits = {}, // per 10 minuten per IP; tests zetten ze hoger
  maxUpload = MAX_UPLOAD,
  openaiKey = process.env.OPENAI_API_KEY || "",
  aiCapEur = Number(process.env.ACADEMY_AI_CAP_EUR || 5),
  aiUpstream = undefined, // alleen tests: een nep-OpenAI
} = {}) {
  const LIMIT = { code: 5, verify: 20, catalog: 60, download: 120, adminFail: 20, ai: 200, ...limits };
  if (!dataDir) throw new Error("academy: dataDir ontbreekt");
  if (!secret || String(secret).length < 16) throw new Error("academy: geheim ontbreekt of is te kort");

  const DIR = path.join(dataDir, "academy");
  const FILES_DIR = path.join(DIR, "files");
  const USERS = path.join(DIR, "users.json");
  const MANIFEST = path.join(DIR, "files.json");
  const CODES = path.join(DIR, "codes.json");
  fs.mkdirSync(FILES_DIR, { recursive: true });

  // Eigen sleutels per doel, afgeleid van het formuliergeheim.
  const sessionKey = crypto.createHmac("sha256", String(secret)).update("academy-session").digest();
  const codeKey = crypto.createHmac("sha256", String(secret)).update("academy-code").digest();

  // ---------- opslag ----------
  const readJson = (file, fallback) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
  };
  const writeJson = (file, data) => {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  };
  const readUsers = () => { const u = readJson(USERS, []); return Array.isArray(u) ? u : []; };
  const readFiles = () => { const f = readJson(MANIFEST, []); return Array.isArray(f) ? f : []; };
  const findUser = (email) => readUsers().find((u) => u.email === email) || null;

  // ---------- rate-limits (eigen tellers, los van de formulieren) ----------
  const buckets = new Map();
  function limited(req, name, max) {
    const key = `${name}|${clientIp(req)}`;
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW);
    if (hits.length >= max) { buckets.set(key, hits); return true; }
    hits.push(now);
    buckets.set(key, hits);
    return false;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, hits] of buckets) if (!hits.some((t) => now - t < WINDOW)) buckets.delete(k);
  }, WINDOW);
  sweep.unref?.();

  // ---------- inlogcodes ----------
  const hashCode = (email, code) => crypto.createHmac("sha256", codeKey).update(`${email}\n${code}`).digest("hex");
  function readCodes() {
    const now = Date.now();
    const all = readJson(CODES, {});
    const out = {};
    for (const [email, c] of Object.entries(all && typeof all === "object" ? all : {})) {
      if (c && c.expires > now) out[email] = c;
    }
    return out;
  }

  // ---------- sessie ----------
  function makeSession(email) {
    const payload = `${Buffer.from(email).toString("base64url")}.${Date.now() + SESSION_DAYS * 864e5}`;
    const sig = crypto.createHmac("sha256", sessionKey).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }
  function readSession(req) {
    let raw = "";
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0 && part.slice(0, i).trim() === COOKIE) raw = part.slice(i + 1).trim();
    }
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [em, exp, sig] = parts;
    const expected = crypto.createHmac("sha256", sessionKey).update(`${em}.${exp}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
    const email = Buffer.from(em, "base64url").toString("utf8");
    return normEmail(email);
  }
  function setCookie(req, res, value) {
    const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");
    const maxAge = value ? SESSION_DAYS * 86400 : 0;
    res.setHeader("Set-Cookie", `${COOKIE}=${value || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  }
  const sessionUser = (req) => { const email = readSession(req); return email ? findUser(email) : null; };

  // ---------- licentie ----------
  function licenceValid(user, now = Date.now()) {
    if (!user || user.status !== "approved" || !user.licenceKey) return false;
    if (user.licenceExpires) {
      const t = Date.parse(user.licenceExpires);
      if (!Number.isFinite(t) || t < now) return false;
    }
    return true;
  }
  function userForKey(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
    if (!m || !LICENCE_KEY_RE.test(m[1])) return null;
    let found = null;
    for (const u of readUsers()) if (u.licenceKey && safeEqual(u.licenceKey, m[1])) found = u;
    return licenceValid(found) ? found : null;
  }

  // ---------- catalogus ----------
  const latestApp = () => readFiles().filter((f) => f.kind === "app").sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] || null;
  function catalogItems() {
    const files = readFiles();
    const byBook = new Map();
    for (const f of files) {
      if (f.kind !== "book" && f.kind !== "audio") continue;
      const slot = byBook.get(f.bookId) || {};
      slot[f.kind] = f;
      byBook.set(f.bookId, slot);
    }
    const items = [];
    for (const [bookId, slot] of byBook) {
      if (!slot.book) continue;
      const pick = (f) => ({ name: f.name, size: f.size, sha256: f.sha256 });
      items.push({
        bookId,
        title: slot.book.title || bookId,
        version: slot.book.version || "",
        lang: slot.book.lang || "",
        book: pick(slot.book),
        ...(slot.audio ? { audio: pick(slot.audio) } : {}),
      });
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }

  // ---------- mail ----------
  const mailWrap = (inner) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1A1A1A">${inner}<p style="color:#8B8E94;font-size:13px">Tubes Academy, ${esc(siteUrl.replace(/^https?:\/\//, ""))}/academy/</p></div>`;

  const router = express.Router();
  const json = express.json({ limit: "16kb" });
  const noStore = (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };
  router.use(["/api/academy", "/academy"], noStore);

  // Body kan JSON of urlencoded zijn (server.js parseert urlencoded al).
  const body = (req) => (req.body && typeof req.body === "object" ? req.body : {});

  // ===== bezoekers =====

  router.post("/api/academy/code", json, async (req, res) => {
    if (limited(req, "code", LIMIT.code)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    const b = body(req);
    // Honeypot: doen alsof het gelukt is, niets versturen.
    if (b.company_website) return res.json({ ok: true });
    const email = normEmail(b.email);
    if (!email) return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    const codes = readCodes();
    const prev = codes[email];
    const now = Date.now();
    const sent = (prev?.sent || []).filter((t) => now - t < CODE_TTL);
    if (sent.length >= CODES_PER_EMAIL) return res.status(429).json({ ok: false, error: "We already sent you a few codes. Check your inbox or try again later." });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    codes[email] = { hash: hashCode(email, code), expires: now + CODE_TTL, attempts: 0, sent: [...sent, now] };
    writeJson(CODES, codes);
    const ok = await sendMail(
      email,
      `Your Tubes Academy code: ${code}`,
      mailWrap(`<p>Your sign-in code for the Tubes Academy is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>The code is valid for 15 minutes. Did you not ask for it? Then you can ignore this email.</p>`)
    );
    if (!ok) return res.status(502).json({ ok: false, error: "We could not send the code right now. Please try again later." });
    res.json({ ok: true });
  });

  router.post("/api/academy/verify", json, async (req, res) => {
    if (limited(req, "verify", LIMIT.verify)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    const b = body(req);
    const email = normEmail(b.email);
    const code = typeof b.code === "string" ? b.code.replace(/\s+/g, "") : "";
    const name = shortText(b.name), company = shortText(b.company), role = shortText(b.role);
    if (!email || !/^\d{6}$/.test(code) || name === null || company === null || role === null) {
      return res.status(400).json({ ok: false, error: "Enter your email address and the 6 digit code." });
    }
    const codes = readCodes();
    const entry = codes[email];
    if (!entry) return res.status(400).json({ ok: false, error: "This code has expired. Request a new one." });
    if (!safeEqual(entry.hash, hashCode(email, code))) {
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts >= CODE_MAX_ATTEMPTS) {
        delete codes[email];
        writeJson(CODES, codes);
        return res.status(429).json({ ok: false, error: "Too many wrong codes. Request a new one." });
      }
      writeJson(CODES, codes);
      return res.status(400).json({ ok: false, error: "That code is not right." });
    }
    delete codes[email];
    writeJson(CODES, codes);

    const users = readUsers();
    let user = users.find((u) => u.email === email);
    if (!user) {
      user = { email, name, company, role, status: "pending", requestedAt: new Date().toISOString(), decidedAt: null, licenceKey: null, licenceExpires: null };
      users.push(user);
      writeJson(USERS, users);
      sendMail(
        notifyEmail,
        `Tubes Academy: new sign-up from ${email}`,
        mailWrap(`<p>New sign-up for the Tubes Academy.</p><p><b>${esc(name || "(no name)")}</b><br>${esc(email)}<br>${esc(company || "(no company)")}${role ? ", " + esc(role) : ""}</p><p>Approve or reject the request in Studoo Beheer.</p>`),
        email
      ).catch((err) => log.error?.("[academy] melding mislukt:", err.message));
    } else {
      let changed = false;
      for (const [k, v] of Object.entries({ name, company, role })) if (v && !user[k]) { user[k] = v; changed = true; }
      if (changed) writeJson(USERS, users);
    }
    setCookie(req, res, makeSession(email));
    res.json({ ok: true, status: user.status });
  });

  router.post("/api/academy/logout", (req, res) => {
    setCookie(req, res, "");
    if (String(req.headers.accept || "").includes("text/html")) return res.redirect(303, "/academy/");
    res.json({ ok: true });
  });

  router.get("/academy/index.html", (req, res) => res.redirect(301, "/academy/"));
  // Zonder strict routing vangt deze route zowel /academy als /academy/.
  router.get("/academy/", (req, res) => {
    if (!req.path.endsWith("/")) return res.redirect(301, "/academy/");
    const user = sessionUser(req);
    let page;
    try { page = pageFile ? fs.readFileSync(pageFile, "utf8") : null; } catch { page = null; }
    if (!page) page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Tubes Academy</title></head><body><main><!--AC:SIGNED_OUT--><p>Sign in</p><!--/AC:SIGNED_OUT--><!--AC:STATE--></main></body></html>`;
    if (user) {
      page = page.replace(/<!--AC:SIGNED_OUT-->[\s\S]*?<!--\/AC:SIGNED_OUT-->/, "").replace("<!--AC:STATE-->", stateHtml(user));
    }
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(page);
  });

  function stateHtml(user) {
    const who = `<p class="ac-who">Signed in as <b>${esc(user.email)}</b></p>
      <form class="ac-logout" method="post" action="/api/academy/logout"><button class="ac-link" type="submit">Sign out</button></form>`;
    if (user.status === "pending") {
      return `<div class="ac-card ac-card-wait"><h2>We review your request</h2>
        <p>Thanks for signing up. We check every request by hand and send you an email as soon as your access is ready. That is usually within one working day.</p>${who}</div>`;
    }
    if (user.status !== "approved") {
      return `<div class="ac-card"><h2>Your access is not active</h2>
        <p>Your Tubes Academy access is not active at the moment. Questions? Mail us at <a href="mailto:contact@tubes.media">contact@tubes.media</a>.</p>${who}</div>`;
    }
    const app = latestApp();
    const appBlock = app
      ? `<a class="button button-primary" href="/academy/files/${encodeURIComponent(app.name)}" download>Download Oskar for Mac</a>
         <p class="ac-meta">${esc(app.version ? "Version " + app.version + ", " : "")}${humanSize(app.size)}. Open the file and drag Oskar to your Applications folder.</p>`
      : `<p class="ac-meta">The download is almost ready. Check back soon.</p>`;
    const expires = user.licenceExpires ? new Date(user.licenceExpires) : null;
    const expiresText = expires && Number.isFinite(expires.getTime())
      ? `<p class="ac-meta">Valid until ${esc(expires.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }))}.</p>` : "";
    const keyBlock = licenceValid(user)
      ? `<div class="ac-key"><code class="ac-key-value" id="ac-key">${esc(user.licenceKey)}</code>
           <button class="button button-secondary ac-copy" type="button" data-ac-copy="ac-key">Copy</button></div>
         <div class="button-row"><a class="button button-primary" href="oskar://activate?code=${esc(encodeURIComponent(user.licenceKey))}">Activate Oskar</a></div>
         ${expiresText}<p class="ac-meta">Activate Oskar works once Oskar is installed. You can also paste the key in Oskar yourself.</p>`
      : `<p class="ac-meta">Your licence key has expired. Mail us at <a href="mailto:contact@tubes.media">contact@tubes.media</a> for a new one.</p>`;
    const items = catalogItems();
    const dl = (f, label) => `<a class="ac-file" href="/academy/files/${encodeURIComponent(f.name)}" download>${label} <span>${humanSize(f.size)}</span></a>`;
    const trainings = items.length
      ? `<ul class="ac-trainings">${items.map((it) => `<li class="ac-training">
          <div><h3>${esc(it.title)}</h3><p class="ac-meta">${[it.version && "Version " + esc(it.version), it.lang && esc(it.lang.toUpperCase())].filter(Boolean).join(", ")}</p></div>
          <div class="ac-files">${dl(it.book, "Book")}${it.audio ? dl(it.audio, "Audio") : ""}</div></li>`).join("")}</ul>`
      : `<p class="ac-meta">No trainings yet. They appear here as soon as they are published.</p>`;
    return `<ol class="ac-steps">
      <li class="ac-card"><span class="ac-step-no">1</span><h2>Download Oskar for Mac</h2>${appBlock}</li>
      <li class="ac-card"><span class="ac-step-no">2</span><h2>Activate Oskar with your licence key</h2>${keyBlock}</li>
      <li class="ac-card"><span class="ac-step-no">3</span><h2>Trainings</h2>
        <p>Oskar fetches new trainings by itself. You can also download them here and import them in Oskar.</p>${trainings}</li>
    </ol>${who}`;
  }

  router.get("/academy/files/:name", (req, res) => {
    const name = req.params.name;
    if (!FILE_NAME_RE.test(name)) return res.status(404).type("text").send("Not found");
    const user = sessionUser(req);
    if (!user) return res.redirect(302, "/academy/");
    if (user.status !== "approved") return res.status(403).type("text").send("Your Tubes Academy access is not active.");
    const entry = readFiles().find((f) => f.name === name);
    if (!entry) return res.status(404).type("text").send("Not found");
    sendStored(res, entry);
  });

  function sendStored(res, entry) {
    res.sendFile(entry.name, {
      root: FILES_DIR,
      dotfiles: "deny",
      headers: {
        "Content-Type": contentTypeFor(entry.name),
        "Content-Disposition": `attachment; filename="${entry.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).type("text").send("Not found");
    });
  }

  // ===== Oskar =====

  router.get("/api/academy/catalog", (req, res) => {
    if (limited(req, "catalog", LIMIT.catalog)) return res.status(429).json({ ok: false, error: "rate" });
    if (!userForKey(req)) return res.status(401).json({ ok: false, error: "licence" });
    res.json({ format: "tubes-academy-catalog", items: catalogItems() });
  });

  router.get("/api/academy/download/:name", (req, res) => {
    if (limited(req, "download", LIMIT.download)) return res.status(429).json({ ok: false, error: "rate" });
    if (!userForKey(req)) return res.status(401).json({ ok: false, error: "licence" });
    const name = req.params.name;
    if (!FILE_NAME_RE.test(name)) return res.status(404).json({ ok: false, error: "not found" });
    const entry = readFiles().find((f) => f.name === name && (f.kind === "book" || f.kind === "audio"));
    if (!entry) return res.status(404).json({ ok: false, error: "not found" });
    sendStored(res, entry);
  });

  // AI voor Oskar: de OpenAI-sleutel staat alleen hier; Oskar toont zijn licentiekey. Ingetrokken of verlopen = 401.
  const ai = aiProxyModule.createAiProxy({ apiKey: () => openaiKey, usageFile: path.join(DIR, "ai-usage.json"), capEur: aiCapEur, upstream: aiUpstream, log });
  const aiJson = express.json({ limit: "1mb" });
  for (const route of ["/v1/responses", "/v1/chat/completions"]) {
    router.post(`/api/academy/ai${route}`, aiJson, async (req, res) => {
      if (limited(req, "ai", LIMIT.ai)) return res.status(429).json({ error: { message: "rate" } });
      const user = userForKey(req);
      if (!user) return res.status(401).json({ error: { message: "licence" } });
      await ai.forward({ account: `academy:${user.email}`, route, body: req.body, res });
    });
  }
  router.get("/api/academy/ai/v1/models", (req, res) => {
    if (!userForKey(req)) return res.status(401).json({ error: { message: "licence" } });
    ai.models(res);
  });

  // ===== beheer (Studoo Beheer) =====

  function admin(req, res, next) {
    if (!adminToken) return res.status(503).json({ ok: false, error: "ACADEMY_ADMIN_TOKEN is not set" });
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
    if (!m || !safeEqual(m[1], adminToken)) {
      limited(req, "admin-fail", 1e9);
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  }
  // Te veel mislukte pogingen per IP: dicht, ook voor de juiste token.
  function adminRate(req, res, next) {
    const hits = (buckets.get(`admin-fail|${clientIp(req)}`) || []).filter((t) => Date.now() - t < WINDOW);
    if (hits.length >= LIMIT.adminFail) return res.status(429).json({ ok: false, error: "rate" });
    next();
  }
  router.use("/api/academy/admin", adminRate, admin);

  router.get("/api/academy/admin/requests", (req, res) => {
    const usage = ai.usage().accounts;
    const users = readUsers().sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
      .map((u) => ({ ...u, aiEur: (usage[`academy:${u.email}`] || {}).eur || 0, aiCalls: (usage[`academy:${u.email}`] || {}).calls || 0 }));
    res.json({ users, aiCapEur });
  });

  function updateUser(email, fn) {
    const users = readUsers();
    const user = users.find((u) => u.email === email);
    if (!user) return null;
    fn(user, users);
    writeJson(USERS, users);
    return user;
  }

  router.post("/api/academy/admin/approve", json, async (req, res) => {
    const b = body(req);
    const email = normEmail(b.email);
    const licenceKey = typeof b.licenceKey === "string" ? b.licenceKey.trim() : "";
    const expires = typeof b.licenceExpires === "string" ? b.licenceExpires.trim() : "";
    if (!email) return res.status(400).json({ ok: false, error: "email" });
    if (!LICENCE_KEY_RE.test(licenceKey)) return res.status(400).json({ ok: false, error: "licenceKey" });
    if (!/^\d{4}-\d{2}-\d{2}/.test(expires) || !Number.isFinite(Date.parse(expires))) return res.status(400).json({ ok: false, error: "licenceExpires" });
    const others = readUsers().filter((u) => u.email !== email && u.licenceKey && safeEqual(u.licenceKey, licenceKey));
    if (others.length) return res.status(409).json({ ok: false, error: "licenceKey in use" });
    const user = updateUser(email, (u) => {
      u.status = "approved";
      u.decidedAt = new Date().toISOString();
      u.licenceKey = licenceKey;
      u.licenceExpires = expires;
    });
    if (!user) return res.status(404).json({ ok: false, error: "unknown email" });
    const link = `${siteUrl}/academy/`;
    const mailed = await sendMail(
      email,
      "Your Tubes Academy access is ready",
      mailWrap(`<p>Hi${user.name ? " " + esc(user.name) : ""},</p><p>Your access to the Tubes Academy is ready. Sign in at <a href="${esc(link)}">${esc(link)}</a> to download Oskar and the trainings.</p><p>Your licence key:</p><p style="font-family:monospace;word-break:break-all;background:#F6F7F9;padding:10px;border-radius:8px">${esc(licenceKey)}</p>`)
    ).catch(() => false);
    res.json({ ok: true, user, mailed: Boolean(mailed) });
  });

  for (const action of ["reject", "revoke"]) {
    router.post(`/api/academy/admin/${action}`, json, (req, res) => {
      const email = normEmail(body(req).email);
      if (!email) return res.status(400).json({ ok: false, error: "email" });
      const user = updateUser(email, (u) => {
        u.status = "rejected";
        u.decidedAt = new Date().toISOString();
        if (action === "revoke") u.revokedAt = u.decidedAt;
      });
      if (!user) return res.status(404).json({ ok: false, error: "unknown email" });
      res.json({ ok: true, user });
    });
  }

  router.get("/api/academy/admin/files", (req, res) => res.json({ files: readFiles() }));

  router.delete("/api/academy/admin/files/:name", (req, res) => {
    const name = req.params.name;
    if (!FILE_NAME_RE.test(name)) return res.status(400).json({ ok: false, error: "name" });
    const files = readFiles();
    if (!files.some((f) => f.name === name)) return res.status(404).json({ ok: false, error: "not found" });
    writeJson(MANIFEST, files.filter((f) => f.name !== name));
    fs.rmSync(path.join(FILES_DIR, name), { force: true });
    res.json({ ok: true });
  });

  router.post("/api/academy/admin/upload", async (req, res) => {
    const q = req.query || {};
    const one = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : null);
    const name = one(q.name), kind = one(q.kind), bookId = one(q.bookId), version = one(q.version), lang = one(q.lang);
    const title = q.title == null ? "" : shortText(q.title, 200);
    if (!name || !FILE_NAME_RE.test(name)) return res.status(400).json({ ok: false, error: "name" });
    if (!KINDS.includes(kind)) return res.status(400).json({ ok: false, error: "kind" });
    if (kind !== "app" && !name.endsWith(".zip")) return res.status(400).json({ ok: false, error: "name" });
    if (kind !== "app" && !BOOK_ID_RE.test(bookId || "")) return res.status(400).json({ ok: false, error: "bookId" });
    if (kind === "app" && bookId) return res.status(400).json({ ok: false, error: "bookId" });
    if (title === null || version === null || lang === null || bookId === null) return res.status(400).json({ ok: false, error: "query" });
    if (version && !VERSION_RE.test(version)) return res.status(400).json({ ok: false, error: "version" });
    if (lang && !LANG_RE.test(lang)) return res.status(400).json({ ok: false, error: "lang" });
    // Al door een body-parser gelezen: dan is de stream leeg.
    if (req._body) return res.status(400).json({ ok: false, error: "body already parsed" });
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxUpload) return res.status(413).json({ ok: false, error: "too large" });

    const tmp = path.join(FILES_DIR, `.upload-${crypto.randomBytes(8).toString("hex")}.tmp`);
    const hash = crypto.createHash("sha256");
    let size = 0;
    let tooLarge = false;
    // Boven de grens: niets meer wegschrijven, wel de rest van de body
    // aflezen, zodat de client een nette 413 krijgt.
    const meter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > maxUpload) tooLarge = true;
        if (tooLarge) return cb();
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(req, meter, fs.createWriteStream(tmp, { mode: 0o600 }));
    } catch {
      fs.rmSync(tmp, { force: true });
      if (!res.headersSent) res.status(400).json({ ok: false, error: "upload failed" });
      return;
    }
    if (tooLarge) { fs.rmSync(tmp, { force: true }); return res.status(413).json({ ok: false, error: "too large" }); }
    if (size === 0) { fs.rmSync(tmp, { force: true }); return res.status(400).json({ ok: false, error: "empty" }); }
    fs.renameSync(tmp, path.join(FILES_DIR, name));

    const entry = {
      name, kind,
      ...(kind !== "app" ? { bookId } : {}),
      ...(title ? { title } : {}),
      ...(version ? { version } : {}),
      ...(lang ? { lang } : {}),
      size, sha256: hash.digest("hex"), uploadedAt: new Date().toISOString(),
    };
    const files = readFiles();
    const keep = [];
    for (const f of files) {
      if (f.name === name) continue; // zelfde naam: vervangen
      if (kind !== "app" && f.kind === kind && f.bookId === bookId) {
        // Eén actuele versie per boek en soort: oude regel en bestand weg.
        if (FILE_NAME_RE.test(f.name)) fs.rmSync(path.join(FILES_DIR, f.name), { force: true });
        continue;
      }
      keep.push(f);
    }
    keep.push(entry);
    writeJson(MANIFEST, keep);
    res.json({ ok: true, file: entry });
  });

  // Losse tijdelijke uploads van een onderbroken deploy opruimen.
  try {
    for (const f of fs.readdirSync(FILES_DIR)) if (f.startsWith(".upload-")) fs.rmSync(path.join(FILES_DIR, f), { force: true });
  } catch { /* geen map */ }

  router.stop = () => clearInterval(sweep);
  return router;
}
