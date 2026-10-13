// Budget Planner-portal: accounts voor productiebedrijven, producties
// (jobs) met documenten, en de HTTP-API die de lokale Budget Planner-app
// (Electron, map BudgetPlannerBuilder) gebruikt om jobs op te halen en het
// resultaat terug te zetten. Zie docs/budget-planner-portal.md.
//
// Opslag op de volume (DATA_DIR/portal/):
//   companies.json        bedrijf-id → bedrijf (wachtwoord als scrypt-hash,
//                         API-sleutel als sha256-hash, alleen het id in klare tekst)
//   jobs.json             job-id → job (brief, documentmetadata, status, resultaat)
//   files/<jobId>/<docId> geüploade documenten, onder hun id (originele naam
//                         staat alleen in jobs.json)
//   files/<jobId>/result-budget.json, result-tubes.json, result.pdf
//   session-secret        HMAC-sleutel voor de sessiecookie (of env
//                         PORTAL_SESSION_SECRET)
//
//   downloads/<id>, downloads.json   de installers (mac-arm64, mac-x64, win),
//                         door de admin geüpload; achter PORTAL_DOWNLOAD_PASSWORD
//
// Env: PORTAL_ADMIN_KEY (bearer voor /admin/jobs en alle jobs),
// PORTAL_DOWNLOAD_PASSWORD (wachtwoord voor de installers),
// PORTAL_SESSION_SECRET (optioneel), PORTAL_NOTIFY_EMAIL (nieuwe productie
// wordt gemeld; standaard joachim@tubes.media). Mail loopt via stuurMail()
// uit server.js (Resend); zonder RESEND_API_KEY gebeurt er niets.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";

export const PORTAL_BASE = "/api/portal";
export const API_BASE = `${PORTAL_BASE}/v1`;
export const PORTAL_PAGE = "/resources/budget-planner/portal/";

const COOKIE = "tubes_portal";
const SESSION_DAYS = 30;
const DL_COOKIE = "tubes_portal_dl";
const DL_DAYS = 7;
const DL_MAX_BYTES = 200 * 1024 * 1024;
export const DOWNLOAD_IDS = {
  "mac-arm64": { label: "macOS, Apple Silicon", hint: ".dmg for M1, M2, M3 and M4 Macs" },
  "mac-x64": { label: "macOS, Intel", hint: ".dmg for Intel Macs" },
  win: { label: "Windows", hint: "Setup .exe, 64-bit" },
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 5 * MAX_FILE_BYTES + 64 * 1024;
const MAX_DOCS_PER_JOB = 10;
const MAX_JOBS_PER_COMPANY = 100;

export const FORMATS = ["feature_film", "short_film", "documentary", "drama_series", "commercial", "other"];
export const BUDGET_LEVELS = ["modest", "mid", "high"];
export const START_PHASES = ["development", "preproduction", "shoot", "post"];
export const LANGUAGES = ["nl", "en"];
export const DOC_KINDS = ["script", "treatment", "synopsis", "brief", "other"];
export const STATUSES = ["submitted", "in_progress", "delivered"];
const DOC_EXTENSIONS = { ".fdx": "application/xml", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Opslag ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const now = () => new Date().toISOString();

// Simpele rate-limit per sleutel (IP of token-id), eigen emmers zodat de app
// die elke minuut pollt niet de limiet van het contactformulier opsnoept.
const buckets = new Map();
function limited(key, max, windowMs = 10 * 60 * 1000) {
  const t = Date.now();
  const hits = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  if (hits.length >= max) return true;
  hits.push(t);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return false;
}
const ipOf = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "?";

// ---------- Multipart (eigen minimale lezer, geen afhankelijkheid) ----------
//
// Leest het hele lichaam in het geheugen (hoogstens MAX_BODY_BYTES) en knipt
// het op de boundary. Genoeg voor een handvol scripts van hoogstens 20 MB.

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Groot lichaam (installer tot 200 MB) rechtstreeks naar een bestand, zonder
// het in het geheugen te houden. Geeft de grootte terug.
function streamToFile(req, file, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) return reject(Object.assign(new Error("too large"), { status: 413 }));
    let size = 0;
    const out = fs.createWriteStream(file);
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        out.destroy();
        reject(Object.assign(new Error("too large"), { status: 413 }));
      }
    });
    req.on("error", (err) => {
      out.destroy();
      reject(err);
    });
    out.on("error", reject);
    out.on("finish", () => resolve(size));
    req.pipe(out);
  });
}

// Alle posities van `needle` in een bestand, gelezen in blokken met overlap.
async function findAllInFile(file, needle) {
  const found = [];
  const overlap = needle.length - 1;
  let carry = Buffer.alloc(0);
  let base = 0;
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    const buf = Buffer.concat([carry, chunk]);
    let i = buf.indexOf(needle);
    while (i >= 0) {
      if (base + i > (found[found.length - 1] ?? -1)) found.push(base + i);
      i = buf.indexOf(needle, i + 1);
    }
    const keep = Math.min(overlap, buf.length);
    base += buf.length - keep;
    carry = buf.slice(buf.length - keep);
  }
  return found;
}

// Multipart uit een bestand op schijf: geeft per deel naam, bestandsnaam en
// het bytebereik [start, end) in dat bestand; kleine velden ook als tekst.
async function multipartRangesFromFile(file, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) throw Object.assign(new Error("no boundary"), { status: 400 });
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const marks = await findAllInFile(file, boundary);
  const fd = fs.openSync(file, "r");
  const parts = [];
  try {
    for (let k = 0; k + 1 < marks.length; k++) {
      const headBuf = Buffer.alloc(4096);
      const n = fs.readSync(fd, headBuf, 0, 4096, marks[k] + boundary.length);
      const head = headBuf.slice(0, n);
      if (head[0] === 0x2d && head[1] === 0x2d) break;
      const headEnd = head.indexOf("\r\n\r\n");
      if (headEnd < 0) continue;
      const headers = head.slice(0, headEnd).toString("utf8");
      const disp = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers)?.[1] || "";
      const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
      const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1];
      const start = marks[k] + boundary.length + headEnd + 4;
      const end = Math.max(start, marks[k + 1] - 2);
      let text = null;
      if (filename == null && end - start < 4096) {
        const b = Buffer.alloc(end - start);
        fs.readSync(fd, b, 0, end - start, start);
        text = b.toString("utf8");
      }
      if (name != null) parts.push({ name, filename: filename != null ? path.basename(filename) : null, start, end, text });
    }
  } finally {
    fs.closeSync(fd);
  }
  return parts;
}

function copyRange(src, dest, start, end) {
  return new Promise((resolve, reject) => {
    if (end <= start) {
      fs.writeFileSync(dest, "");
      return resolve(0);
    }
    const out = fs.createWriteStream(dest);
    fs.createReadStream(src, { start, end: end - 1 }).on("error", reject).pipe(out).on("error", reject).on("finish", () => resolve(end - start));
  });
}

export function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) throw Object.assign(new Error("no boundary"), { status: 400 });
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const fields = {};
  const files = [];
  let pos = body.indexOf(boundary);
  if (pos < 0) return { fields, files };
  pos += boundary.length;
  for (;;) {
    // Na de boundary volgt "--" (einde) of CRLF
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;
    const headEnd = body.indexOf("\r\n\r\n", pos);
    if (headEnd < 0) break;
    const head = body.slice(pos, headEnd).toString("utf8");
    const dataStart = headEnd + 4;
    let next = body.indexOf(boundary, dataStart);
    if (next < 0) break;
    const dataEnd = next - 2; // CRLF vóór de boundary
    const data = body.slice(dataStart, Math.max(dataStart, dataEnd));
    const disp = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(head)?.[1] || "";
    const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() || "application/octet-stream";
    if (name != null) {
      if (filename != null) files.push({ field: name, filename: path.basename(filename), type, data });
      else (fields[name] ||= []).push(data.toString("utf8"));
    }
    pos = next + boundary.length;
  }
  return { fields, files };
}

async function multipart(req) {
  const type = String(req.headers["content-type"] || "");
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw Object.assign(new Error("Send multipart/form-data."), { status: 415 });
  }
  const body = await readRawBody(req, MAX_BODY_BYTES);
  return parseMultipart(body, type);
}

// ---------- Validatie ----------

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const intOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
const oneOf = (v, list, fallback) => (list.includes(String(v)) ? String(v) : fallback);

export function cleanBrief(input) {
  const b = input || {};
  const title = str(b.title, 200);
  if (!title) throw Object.assign(new Error("Give the production a title."), { status: 400 });
  return {
    title,
    format: oneOf(b.format, FORMATS, "other"),
    genre: str(b.genre, 120),
    length_minutes: intOrNull(b.length_minutes),
    episodes: intOrNull(b.episodes),
    budget_level: oneOf(b.budget_level, BUDGET_LEVELS, "mid"),
    target_total: numOrNull(b.target_total),
    start_phase: oneOf(b.start_phase, START_PHASES, "development"),
    start_date: dateOrNull(b.start_date),
    deadline: dateOrNull(b.deadline),
    shooting_days: intOrNull(b.shooting_days),
    notes: str(b.notes, 5000),
    language: oneOf(b.language, LANGUAGES, "en"),
    currency: /^[A-Z]{3}$/.test(String(b.currency || "").toUpperCase()) ? String(b.currency).toUpperCase() : "EUR",
  };
}

function cleanSummary(raw) {
  let s;
  try {
    s = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw Object.assign(new Error("summary must be a JSON object."), { status: 400 });
  }
  if (!s || typeof s !== "object") throw Object.assign(new Error("summary must be a JSON object."), { status: 400 });
  return {
    total: numOrNull(s.total),
    currency: /^[A-Z]{3}$/.test(String(s.currency || "").toUpperCase()) ? String(s.currency).toUpperCase() : null,
    activities: intOrNull(s.activities),
    shooting_days: intOrNull(s.shooting_days),
    lines: intOrNull(s.lines),
    verdict: str(s.verdict, 2000),
    summary_text: str(s.summary_text, 20000),
  };
}

const slug = (s) =>
  String(s || "production")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "production";

// ---------- Montage ----------

export function mountPortal(app, { dataDir, sendMail, siteUrl = "https://www.tubes.media" }) {
  const DIR = path.join(dataDir, "portal");
  const COMPANIES = path.join(DIR, "companies.json");
  const JOBS = path.join(DIR, "jobs.json");
  const FILES = path.join(DIR, "files");
  const SECRET_FILE = path.join(DIR, "session-secret");
  fs.mkdirSync(FILES, { recursive: true });

  const ADMIN_KEY = process.env.PORTAL_ADMIN_KEY || "";
  const NOTIFY_EMAIL = process.env.PORTAL_NOTIFY_EMAIL || "joachim@tubes.media";
  const mail = typeof sendMail === "function" ? sendMail : async () => false;

  const SECRET = (() => {
    if (process.env.PORTAL_SESSION_SECRET) return process.env.PORTAL_SESSION_SECRET;
    try {
      return fs.readFileSync(SECRET_FILE, "utf8").trim();
    } catch {
      const s = crypto.randomBytes(32).toString("hex");
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
      return s;
    }
  })();

  const readCompanies = () => readJson(COMPANIES, {});
  const readJobs = () => readJson(JOBS, {});
  const companyByEmail = (email) => Object.values(readCompanies()).find((c) => c.email === email) || null;
  const jobDir = (jobId) => path.join(FILES, jobId);

  // ----- Sessie (cookie, HMAC) -----
  const makeSession = (companyId) => {
    const payload = `${companyId}.${Date.now() + SESSION_DAYS * 86400 * 1000}`;
    return `${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex")}`;
  };
  const verifySession = (token) => {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [id, exp, sig] = parts;
    const expected = crypto.createHmac("sha256", SECRET).update(`${id}.${exp}`).digest("hex");
    if (!safeEqual(sig, expected) || Number(exp) < Date.now()) return null;
    return id;
  };
  const cookies = (req) => {
    const out = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  };
  const setSession = (req, res, token) => {
    const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");
    const maxAge = token ? SESSION_DAYS * 86400 : 0;
    res.setHeader("Set-Cookie", `${COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  };

  // ----- API-sleutel -----
  const newApiKey = () => {
    const id = crypto.randomBytes(4).toString("hex");
    const key = `bp_${id}_${crypto.randomBytes(24).toString("hex")}`;
    return { id, key, hash: sha256(key), createdAt: now() };
  };
  const companyByApiKey = (key) => {
    const m = /^bp_([0-9a-f]{8})_[0-9a-f]{48}$/.exec(String(key || ""));
    if (!m) return null;
    const company = Object.values(readCompanies()).find((c) => c.apiKey?.id === m[1]);
    if (!company || !safeEqual(sha256(key), company.apiKey.hash)) return null;
    return company;
  };

  // ----- Wie is dit? Bearer (API-sleutel of admin) of sessiecookie. -----
  // Voor een sessie op een wijzigend verzoek is de header X-Requested-With
  // verplicht: een andere site kan die niet meesturen zonder CORS-preflight
  // (en CORS staat hier niet aan), dus dat houdt CSRF buiten. Daarnaast moet
  // een meegestuurde Origin bij de eigen host horen.
  function identify(req) {
    const auth = String(req.headers.authorization || "");
    if (auth.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      if (ADMIN_KEY && safeEqual(token, ADMIN_KEY)) return { admin: true, via: "admin" };
      const company = companyByApiKey(token);
      return company ? { company, via: "key" } : null;
    }
    const id = verifySession(cookies(req)[COOKIE]);
    if (!id) return null;
    const company = readCompanies()[id];
    return company ? { company, via: "session" } : null;
  }
  function csrfOk(req, who) {
    if (who.via !== "session") return true;
    if (req.method === "GET" || req.method === "HEAD") return true;
    if (!req.headers["x-requested-with"]) return false;
    const origin = req.headers.origin;
    if (origin) {
      const host = String(req.headers.host || "").toLowerCase();
      try {
        if (new URL(origin).host.toLowerCase() !== host) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  const requireAuth = (req, res, next) => {
    const who = identify(req);
    if (!who) return res.status(401).json({ ok: false, error: "Log in or send a valid API key." });
    if (!csrfOk(req, who)) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
    const limitKey = who.admin ? "admin" : who.via === "key" ? `key:${who.company.apiKey.id}` : `ip:${ipOf(req)}`;
    if (limited(limitKey, 600)) return res.status(429).json({ ok: false, error: "Too many requests. Try again in a few minutes." });
    req.portal = who;
    next();
  };
  const requireSession = (req, res, next) => {
    const who = identify(req);
    if (!who || who.via !== "session") return res.status(401).json({ ok: false, error: "Log in first." });
    if (!csrfOk(req, who)) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
    req.portal = who;
    next();
  };

  const publicCompany = (c) => ({ id: c.id, company: c.name, contact: c.contact, email: c.email, created_at: c.createdAt, verified: Boolean(c.verifiedAt) });
  const publicJob = (j) => ({
    id: j.id,
    title: j.brief.title,
    status: j.status,
    created_at: j.created_at,
    updated_at: j.updated_at,
    brief: j.brief,
    documents: j.documents.map((d) => ({ id: d.id, name: d.name, kind: d.kind, size: d.size })),
    feedback: j.feedback || "",
    language: j.brief.language,
    result: j.result ? resultOf(j) : null,
  });
  const resultOf = (j) => ({
    summary: j.result.summary,
    delivered_at: j.result.delivered_at,
    downloads: {
      budget: `${API_BASE}/jobs/${j.id}/result/budget`,
      tubes: `${API_BASE}/jobs/${j.id}/result/tubes`,
      pdf: j.result.files.pdf ? `${API_BASE}/jobs/${j.id}/result/pdf` : null,
    },
  });
  const canSee = (who, job) => who.admin || job.companyId === who.company.id;
  const findJob = (req, res) => {
    const job = readJobs()[req.params.id];
    if (!job || !canSee(req.portal, job)) {
      res.status(404).json({ ok: false, error: "No such production." });
      return null;
    }
    return job;
  };
  const saveJob = (job) => {
    const jobs = readJobs();
    job.updated_at = now();
    jobs[job.id] = job;
    writeJson(JOBS, jobs);
    return job;
  };

  // ----- Mail -----
  async function sendVerification(company) {
    const link = `${siteUrl}${PORTAL_BASE}/verify?token=${company.verifyToken}`;
    return mail(
      company.email,
      "Confirm your email address for the Budget Planner",
      `<p>Hi ${esc(company.contact)},</p><p>Confirm the email address for ${esc(company.name)} in the Tubes Budget Planner portal:</p><p><a href="${link}">${link}</a></p><p>If you did not create this account, ignore this message.</p>`
    );
  }

  app.use(PORTAL_BASE, (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const json = express.json({ limit: "256kb" });

  // ---------- Account (portal-pagina) ----------

  app.post(`${PORTAL_BASE}/signup`, json, async (req, res) => {
    if (limited(`auth:${ipOf(req)}`, 10)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    if (!req.headers["x-requested-with"]) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
    const name = str(req.body?.company, 200);
    const contact = str(req.body?.contact, 200);
    const email = str(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password || "");
    if (!name) return res.status(400).json({ ok: false, error: "Enter your company name." });
    if (!contact) return res.status(400).json({ ok: false, error: "Enter a contact name." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    if (password.length < 10) return res.status(400).json({ ok: false, error: "Use a password of at least 10 characters." });
    if (!req.body?.consent) return res.status(400).json({ ok: false, error: "Please agree to the storage of your details and documents." });
    if (companyByEmail(email)) return res.status(409).json({ ok: false, error: "There is already an account with this email address. Log in instead." });
    const salt = crypto.randomBytes(16).toString("hex");
    const company = {
      id: crypto.randomUUID(),
      name,
      contact,
      email,
      salt,
      hash: hashPassword(password, salt),
      createdAt: now(),
      verifiedAt: null,
      verifyToken: crypto.randomBytes(24).toString("hex"),
      apiKey: null,
    };
    const companies = readCompanies();
    companies[company.id] = company;
    writeJson(COMPANIES, companies);
    setSession(req, res, makeSession(company.id));
    const mailed = await sendVerification(company);
    res.json({ ok: true, company: publicCompany(company), apiKey: null, verificationMailed: mailed });
  });

  app.post(`${PORTAL_BASE}/login`, json, (req, res) => {
    if (limited(`auth:${ipOf(req)}`, 10)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    if (!req.headers["x-requested-with"]) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
    const email = str(req.body?.email, 200).toLowerCase();
    const company = companyByEmail(email);
    const ok = company && safeEqual(hashPassword(String(req.body?.password || ""), company.salt), company.hash);
    if (!ok) return res.status(401).json({ ok: false, error: "Email address or password is not right." });
    setSession(req, res, makeSession(company.id));
    res.json({ ok: true, company: publicCompany(company), apiKey: company.apiKey ? { id: company.apiKey.id, created_at: company.apiKey.createdAt } : null });
  });

  app.post(`${PORTAL_BASE}/logout`, (req, res) => {
    setSession(req, res, "");
    res.json({ ok: true });
  });

  app.get(`${PORTAL_BASE}/session`, (req, res) => {
    const who = identify(req);
    if (!who || who.via !== "session") return res.json({ ok: true, company: null });
    const c = who.company;
    res.json({ ok: true, company: publicCompany(c), apiKey: c.apiKey ? { id: c.apiKey.id, created_at: c.apiKey.createdAt } : null });
  });

  // Nieuwe koppelcode: de oude vervalt meteen; de sleutel zelf wordt één keer
  // teruggegeven en alleen als hash bewaard.
  app.post(`${PORTAL_BASE}/api-key`, requireSession, (req, res) => {
    const companies = readCompanies();
    const c = companies[req.portal.company.id];
    const k = newApiKey();
    c.apiKey = { id: k.id, hash: k.hash, createdAt: k.createdAt };
    writeJson(COMPANIES, companies);
    res.json({ ok: true, apiKey: { id: k.id, created_at: k.createdAt, key: k.key } });
  });

  app.get(`${PORTAL_BASE}/verify`, (req, res) => {
    const token = str(req.query.token, 100);
    const companies = readCompanies();
    const c = Object.values(companies).find((x) => x.verifyToken && token && safeEqual(x.verifyToken, token));
    if (!c) return res.redirect(`${PORTAL_PAGE}?verified=0`);
    c.verifiedAt = now();
    c.verifyToken = null;
    writeJson(COMPANIES, companies);
    res.redirect(`${PORTAL_PAGE}?verified=1`);
  });

  app.post(`${PORTAL_BASE}/verify/resend`, requireSession, async (req, res) => {
    if (limited(`auth:${ipOf(req)}`, 10)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    const companies = readCompanies();
    const c = companies[req.portal.company.id];
    if (c.verifiedAt) return res.json({ ok: true, mailed: false, verified: true });
    if (!c.verifyToken) {
      c.verifyToken = crypto.randomBytes(24).toString("hex");
      writeJson(COMPANIES, companies);
    }
    res.json({ ok: true, mailed: await sendVerification(c) });
  });

  // ---------- Installers (achter wachtwoord) ----------
  //
  // De drie installers staan op de volume (downloads/<id>) en zijn alleen te
  // zien en te halen met een getekende cookie (na het wachtwoord uit
  // PORTAL_DOWNLOAD_PASSWORD) of met een ingelogde sessie / de admin-sleutel.
  // De admin zet ze erop met PUT .../v1/admin/downloads/:id, zonder redeploy.

  const DL_DIR = path.join(DIR, "downloads");
  const DL_META = path.join(DIR, "downloads.json");
  const DL_PASSWORD = process.env.PORTAL_DOWNLOAD_PASSWORD || "";
  const readDlMeta = () => readJson(DL_META, {});
  const dlFile = (id) => path.join(DL_DIR, id);

  const makeDlToken = () => {
    const payload = `dl.${Date.now() + DL_DAYS * 86400 * 1000}`;
    return `${payload}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex")}`;
  };
  const verifyDlToken = (token) => {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || parts[0] !== "dl") return false;
    const expected = crypto.createHmac("sha256", SECRET).update(`dl.${parts[1]}`).digest("hex");
    return safeEqual(parts[2], expected) && Number(parts[1]) > Date.now();
  };
  const setDlCookie = (req, res, token) => {
    const secure = req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https");
    const maxAge = token ? DL_DAYS * 86400 : 0;
    res.append("Set-Cookie", `${DL_COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  };
  // Ontgrendeld = wachtwoordcookie, of ingelogd, of admin-sleutel.
  const unlocked = (req) => verifyDlToken(cookies(req)[DL_COOKIE]) || Boolean(identify(req));
  const downloadList = () => {
    const meta = readDlMeta();
    return Object.entries(DOWNLOAD_IDS).map(([id, d]) => {
      const m = meta[id];
      const available = Boolean(m) && fs.existsSync(dlFile(id));
      return { id, label: d.label, hint: d.hint, name: available ? m.name : null, size: available ? m.size : null, version: available ? m.version : null, uploaded_at: available ? m.uploaded_at : null, available };
    });
  };

  app.post(`${PORTAL_BASE}/download-access`, json, (req, res) => {
    if (!req.headers["x-requested-with"]) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
    if (limited(`dl:${ipOf(req)}`, 10)) return res.status(429).json({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    if (!DL_PASSWORD) return res.status(503).json({ ok: false, error: "Downloads are not open yet." });
    const given = String(req.body?.password || "");
    if (!given || !safeEqual(given, DL_PASSWORD)) return res.status(401).json({ ok: false, error: "That password is not right." });
    setDlCookie(req, res, makeDlToken());
    res.json({ ok: true, downloads: downloadList() });
  });

  app.get(`${PORTAL_BASE}/downloads`, (req, res) => {
    if (!unlocked(req)) return res.status(401).json({ ok: false, error: "Enter the download password first.", locked: true });
    res.json({ ok: true, downloads: downloadList() });
  });

  app.get(`${PORTAL_BASE}/download/:id`, (req, res) => {
    if (!unlocked(req)) return res.status(401).json({ ok: false, error: "Enter the download password first.", locked: true });
    const id = req.params.id;
    const m = DOWNLOAD_IDS[id] && readDlMeta()[id];
    if (!m || !fs.existsSync(dlFile(id))) return res.status(404).json({ ok: false, error: "This installer is not available yet." });
    // no-transform: anders gzipt de compression-middleware de installer
    // (octet-stream geldt als comprimeerbaar) en vervalt de Content-Length.
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(fs.statSync(dlFile(id)).size));
    res.setHeader("Content-Disposition", `attachment; filename="${m.name.replace(/[^\w.\- ]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(m.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(dlFile(id)).pipe(res);
  });

  const requireAdmin = (req, res, next) => {
    const who = identify(req);
    if (!who || !who.admin) return res.status(who ? 403 : 401).json({ ok: false, error: "Admin key required." });
    next();
  };

  // Installer plaatsen: raw body (curl -T) of multipart met veld "file";
  // version/name uit de query of uit multipart-velden. Streamt naar een
  // tijdelijk bestand en knipt daar eventueel het multipart-deel uit.
  app.put(`${API_BASE}/admin/downloads/:id`, requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!DOWNLOAD_IDS[id]) return res.status(404).json({ ok: false, error: `Unknown installer id; use ${Object.keys(DOWNLOAD_IDS).join(", ")}.` });
    fs.mkdirSync(DL_DIR, { recursive: true });
    const tmp = `${dlFile(id)}.${process.pid}.upload`;
    try {
      await streamToFile(req, tmp, DL_MAX_BYTES);
      let version = str(req.query.version, 40);
      let name = str(req.query.name, 200);
      const type = String(req.headers["content-type"] || "").toLowerCase();
      if (type.startsWith("multipart/form-data")) {
        const parts = await multipartRangesFromFile(tmp, type);
        const filePart = parts.find((p) => p.name === "file" && p.filename != null);
        if (!filePart) return res.status(400).json({ ok: false, error: 'Send the installer in the multipart field "file".' });
        version = version || str(parts.find((p) => p.name === "version")?.text, 40);
        name = name || str(parts.find((p) => p.name === "name")?.text, 200) || str(filePart.filename, 200);
        const cut = `${tmp}.part`;
        await copyRange(tmp, cut, filePart.start, filePart.end);
        fs.renameSync(cut, tmp);
      }
      const size = fs.statSync(tmp).size;
      if (!size) return res.status(400).json({ ok: false, error: "The file is empty." });
      if (!name) name = `budget-planner-${id}${id === "win" ? ".exe" : ".dmg"}`;
      fs.renameSync(tmp, dlFile(id));
      const meta = readDlMeta();
      meta[id] = { name: path.basename(name), version: version || null, size, uploaded_at: now() };
      writeJson(DL_META, meta);
      res.json({ ok: true, download: downloadList().find((d) => d.id === id) });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.status === 413 ? "The file is larger than 200 MB." : err.message });
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.part`, { force: true });
    }
  });

  app.delete(`${API_BASE}/admin/downloads/:id`, requireAdmin, (req, res) => {
    const id = req.params.id;
    if (!DOWNLOAD_IDS[id]) return res.status(404).json({ ok: false, error: "Unknown installer id." });
    fs.rmSync(dlFile(id), { force: true });
    const meta = readDlMeta();
    delete meta[id];
    writeJson(DL_META, meta);
    res.json({ ok: true });
  });

  app.get(`${API_BASE}/admin/downloads`, requireAdmin, (req, res) => res.json({ ok: true, downloads: downloadList() }));

  // ---------- API v1 (app én portal-pagina) ----------

  app.get(`${API_BASE}/me`, requireAuth, (req, res) => {
    if (req.portal.admin) return res.json({ admin: true, company: null, contact: null, email: null });
    const c = req.portal.company;
    res.json({ company: c.name, contact: c.contact, email: c.email, verified: Boolean(c.verifiedAt) });
  });

  app.get(`${API_BASE}/jobs`, requireAuth, (req, res) => {
    const jobs = Object.values(readJobs())
      .filter((j) => canSee(req.portal, j))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json(jobs.map(publicJob));
  });

  app.get(`${API_BASE}/admin/jobs`, requireAuth, (req, res) => {
    if (!req.portal.admin) return res.status(403).json({ ok: false, error: "Admin key required." });
    const companies = readCompanies();
    const jobs = Object.values(readJobs()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json(
      jobs.map((j) => {
        const c = companies[j.companyId];
        return { ...publicJob(j), company: c ? { id: c.id, name: c.name, contact: c.contact, email: c.email, api_key_id: c.apiKey?.id || null } : null };
      })
    );
  });

  // Nieuwe productie: multipart met de briefvelden plus bestanden in het veld
  // "documents" en per bestand een "documents_kind" in dezelfde volgorde.
  app.post(`${API_BASE}/jobs`, requireAuth, async (req, res) => {
    if (req.portal.admin) return res.status(400).json({ ok: false, error: "Create productions with a company account, not the admin key." });
    if (limited(`upload:${req.portal.company.id}`, 30)) return res.status(429).json({ ok: false, error: "Too many uploads. Try again in a few minutes." });
    let parsed;
    try {
      parsed = await multipart(req);
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.status === 413 ? "The upload is too large (20 MB per file)." : err.message });
    }
    const one = (k) => parsed.fields[k]?.[0];
    let brief;
    try {
      brief = cleanBrief(Object.fromEntries(Object.keys(parsed.fields).map((k) => [k, one(k)])));
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }
    const own = Object.values(readJobs()).filter((j) => j.companyId === req.portal.company.id);
    if (own.length >= MAX_JOBS_PER_COMPANY) return res.status(400).json({ ok: false, error: `At most ${MAX_JOBS_PER_COMPANY} productions per account.` });
    const uploads = parsed.files.filter((f) => f.field === "documents" && f.filename);
    if (uploads.length > MAX_DOCS_PER_JOB) return res.status(400).json({ ok: false, error: `At most ${MAX_DOCS_PER_JOB} documents per production.` });
    const kinds = parsed.fields.documents_kind || [];
    const docs = [];
    for (const [i, f] of uploads.entries()) {
      const ext = path.extname(f.filename).toLowerCase();
      if (!DOC_EXTENSIONS[ext]) return res.status(400).json({ ok: false, error: `${f.filename}: only .fdx, .pdf, .txt and .md files.` });
      if (f.data.length > MAX_FILE_BYTES) return res.status(400).json({ ok: false, error: `${f.filename}: larger than 20 MB.` });
      if (!f.data.length) return res.status(400).json({ ok: false, error: `${f.filename}: the file is empty.` });
      docs.push({ id: crypto.randomUUID(), name: str(f.filename, 200), kind: oneOf(kinds[i], DOC_KINDS, "other"), size: f.data.length, type: DOC_EXTENSIONS[ext], data: f.data });
    }
    const job = {
      id: crypto.randomUUID(),
      companyId: req.portal.company.id,
      status: "submitted",
      created_at: now(),
      updated_at: now(),
      brief,
      documents: docs.map(({ data, ...d }) => d),
      feedback: "",
      result: null,
    };
    fs.mkdirSync(jobDir(job.id), { recursive: true });
    for (const d of docs) fs.writeFileSync(path.join(jobDir(job.id), d.id), d.data);
    saveJob(job);
    const c = req.portal.company;
    mail(
      NOTIFY_EMAIL,
      `Budget Planner: new production "${brief.title}" (${c.name})`,
      `<p>${esc(c.name)} (${esc(c.contact)}, ${esc(c.email)}) submitted <strong>${esc(brief.title)}</strong>: ${esc(brief.format)}, ${docs.length} document${docs.length === 1 ? "" : "s"}.</p><p>Job id: ${job.id}</p>`,
      c.email
    ).catch(() => {});
    res.status(201).json(publicJob(job));
  });

  app.get(`${API_BASE}/jobs/:id`, requireAuth, (req, res) => {
    const job = findJob(req, res);
    if (job) res.json(publicJob(job));
  });

  app.patch(`${API_BASE}/jobs/:id`, requireAuth, json, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    const body = req.body || {};
    if (body.status != null) {
      const status = String(body.status);
      if (!["submitted", "in_progress"].includes(status)) return res.status(400).json({ ok: false, error: "status must be submitted or in_progress (delivered is set by uploading the result)." });
      job.status = status;
    }
    if (body.feedback != null) job.feedback = str(body.feedback, 5000);
    res.json(publicJob(saveJob(job)));
  });

  app.post(`${API_BASE}/jobs/:id/feedback`, requireAuth, json, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    job.feedback = str(req.body?.feedback, 5000);
    saveJob(job);
    if (job.feedback) {
      const c = readCompanies()[job.companyId];
      mail(NOTIFY_EMAIL, `Budget Planner: feedback on "${job.brief.title}"${c ? ` (${c.name})` : ""}`, `<p>${esc(job.feedback).replace(/\n/g, "<br>")}</p><p>Job id: ${job.id}</p>`, c?.email).catch(() => {});
    }
    res.json(publicJob(job));
  });

  app.delete(`${API_BASE}/jobs/:id`, requireAuth, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    const jobs = readJobs();
    delete jobs[job.id];
    writeJson(JOBS, jobs);
    fs.rmSync(jobDir(job.id), { recursive: true, force: true });
    res.json({ ok: true });
  });

  app.get(`${API_BASE}/jobs/:id/documents/:docId`, requireAuth, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    const doc = job.documents.find((d) => d.id === req.params.docId);
    const file = doc && path.join(jobDir(job.id), doc.id);
    if (!doc || !fs.existsSync(file)) return res.status(404).json({ ok: false, error: "No such document." });
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Content-Type", doc.type || "application/octet-stream");
    res.setHeader("Content-Length", String(fs.statSync(file).size));
    res.setHeader("Content-Disposition", `attachment; filename="${doc.name.replace(/[^\w.\- ]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(file).pipe(res);
  });

  // Resultaat van de planner: summary (JSON-string) + bestanden budget, tubes, pdf.
  app.post(`${API_BASE}/jobs/:id/result`, requireAuth, async (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    if (limited(`upload:${req.portal.admin ? "admin" : req.portal.company.id}`, 30)) return res.status(429).json({ ok: false, error: "Too many uploads. Try again in a few minutes." });
    let parsed;
    try {
      parsed = await multipart(req);
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.status === 413 ? "The upload is too large (20 MB per file)." : err.message });
    }
    const file = (name) => parsed.files.find((f) => f.field === name && f.data.length);
    const budget = file("budget");
    const tubes = file("tubes");
    const pdf = file("pdf");
    if (!budget || !tubes) return res.status(400).json({ ok: false, error: "Send the files budget and tubes." });
    for (const f of [budget, tubes, pdf]) if (f && f.data.length > MAX_FILE_BYTES) return res.status(400).json({ ok: false, error: `${f.filename}: larger than 20 MB.` });
    for (const f of [budget, tubes]) {
      try {
        JSON.parse(f.data.toString("utf8"));
      } catch {
        return res.status(400).json({ ok: false, error: `${f.field} is not valid JSON.` });
      }
    }
    if (pdf && pdf.data.slice(0, 5).toString() !== "%PDF-") return res.status(400).json({ ok: false, error: "pdf is not a PDF file." });
    let summary;
    try {
      summary = cleanSummary(parsed.fields.summary?.[0] ?? "{}");
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }
    const dir = jobDir(job.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "result-budget.json"), budget.data);
    fs.writeFileSync(path.join(dir, "result-tubes.json"), tubes.data);
    if (pdf) fs.writeFileSync(path.join(dir, "result.pdf"), pdf.data);
    else fs.rmSync(path.join(dir, "result.pdf"), { force: true });
    job.result = {
      summary,
      delivered_at: now(),
      files: {
        budget: { name: str(budget.filename, 200), size: budget.data.length },
        tubes: { name: str(tubes.filename, 200), size: tubes.data.length },
        pdf: pdf ? { name: str(pdf.filename, 200), size: pdf.data.length } : null,
      },
    };
    job.status = "delivered";
    saveJob(job);
    const c = readCompanies()[job.companyId];
    if (c) {
      mail(
        c.email,
        `Your budget for "${job.brief.title}" is ready`,
        `<p>Hi ${esc(c.contact)},</p><p>The Budget Planner has finished <strong>${esc(job.brief.title)}</strong>${summary.total != null ? ` (total ${esc(summary.currency || job.brief.currency)} ${Number(summary.total).toLocaleString("en-GB")})` : ""}. Download the budget, the Tubes export and the summary in the portal:</p><p><a href="${siteUrl}${PORTAL_PAGE}">${siteUrl}${PORTAL_PAGE}</a></p>${summary.summary_text ? `<p>${esc(summary.summary_text).replace(/\n/g, "<br>")}</p>` : ""}`
      ).catch(() => {});
    }
    res.json(publicJob(job));
  });

  app.get(`${API_BASE}/jobs/:id/result`, requireAuth, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    if (!job.result) return res.status(404).json({ ok: false, error: "No result yet." });
    res.json({ id: job.id, title: job.brief.title, status: job.status, feedback: job.feedback || "", ...resultOf(job) });
  });

  const RESULT_FILES = {
    budget: { file: "result-budget.json", type: "application/json", suffix: ".budget.json" },
    tubes: { file: "result-tubes.json", type: "application/json", suffix: ".tubes-planner.json" },
    pdf: { file: "result.pdf", type: "application/pdf", suffix: ".pdf" },
  };
  app.get(`${API_BASE}/jobs/:id/result/:which`, requireAuth, (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    const spec = RESULT_FILES[req.params.which];
    const file = spec && path.join(jobDir(job.id), spec.file);
    if (!job.result || !spec || !fs.existsSync(file)) return res.status(404).json({ ok: false, error: "No such file." });
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Content-Type", spec.type);
    res.setHeader("Content-Length", String(fs.statSync(file).size));
    res.setHeader("Content-Disposition", `attachment; filename="${slug(job.brief.title)}${spec.suffix}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(file).pipe(res);
  });

  app.use(PORTAL_BASE, (req, res) => res.status(404).json({ ok: false, error: "Unknown portal route." }));

  // Blok voor /beheer: bedrijven met hun producties.
  function adminBlock() {
    const companies = Object.values(readCompanies()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!companies.length) return "";
    const jobs = Object.values(readJobs());
    const rows = companies
      .map((c) => {
        const own = jobs.filter((j) => j.companyId === c.id);
        const open = own.filter((j) => j.status !== "delivered").length;
        return `<div class="msg"><header><strong>${esc(c.name)}</strong><span>${new Date(c.createdAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</span></header>` +
          `<p class="meta">${esc(c.contact)}, ${esc(c.email)}${c.verifiedAt ? "" : " (e-mail niet bevestigd)"} &middot; koppelcode ${c.apiKey ? esc(c.apiKey.id) : "nog niet aangemaakt"}</p>` +
          `<p class="meta">${own.length} productie${own.length === 1 ? "" : "s"}${open ? `, <span class="tag tag-open">${open} open</span>` : ""}${own.map((j) => ` &middot; ${esc(j.brief.title)} (${esc(j.status)})`).join("")}</p></div>`;
      })
      .join("\n");
    return `<h2 style="color:#1A1A1A;font-size:1.25rem;margin-top:40px">Budget Planner-portal</h2><p class="count">${companies.length} bedrijf${companies.length === 1 ? "" : "ven"}, ${jobs.length} productie${jobs.length === 1 ? "" : "s"}; de jobs zelf via GET ${API_BASE}/admin/jobs met de admin-sleutel</p>${rows}`;
  }

  console.log(`[portal] Budget Planner-portal op ${API_BASE}; admin-sleutel ${ADMIN_KEY ? "aanwezig" : "ONTBREEKT (PORTAL_ADMIN_KEY)"}; downloadwachtwoord ${DL_PASSWORD ? "aanwezig" : "ONTBREEKT (PORTAL_DOWNLOAD_PASSWORD)"}; data in ${DIR}`);
  return { adminBlock };
}
