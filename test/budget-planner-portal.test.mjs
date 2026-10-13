// End-to-end-test van het Budget Planner-portaal: start server.js op een vrije
// poort met een tijdelijke datamap, en doorloopt aanmelden → koppelcode →
// productie met documenten → API-lijst met de sleutel → admin-lijst →
// in_progress → resultaat uploaden → portaal toont delivered → downloads →
// opmerking → verwijderen. Draaien: `node test/budget-planner-portal.test.mjs`
// (ook onderdeel van `npm test`). Geen mail: zonder RESEND_API_KEY doet
// stuurMail() niets, dus de test raakt Resend niet.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseMultipart, cleanBrief } from "../lib/portal.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bp-portal-"));
const PORT = 3900 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api/portal/v1`;
const ADMIN = "test-admin-key";
const DL_PASSWORD = "open-sesame-2026";

let failures = 0;
// Leest het antwoord alleen bij een verkeerde status (anders is de body op).
const expectStatus = async (r, status) => {
  if (r.status !== status) throw new Error(`${r.status} !== ${status}: ${await r.text()}`);
  return r;
};
const t = async (name, fn) => {
  try {
    await fn();
    console.log("ok  ", name);
  } catch (e) {
    failures++;
    console.log("FAIL", name, "\n     ", e.stack || e.message);
  }
};

// ---------- Pure delen, zonder server ----------

await t("parseMultipart: velden en bestanden", () => {
  const b = "----xyz";
  const body = Buffer.from(
    [`--${b}`, 'Content-Disposition: form-data; name="title"', "", "De laatste veerboot", `--${b}`, 'Content-Disposition: form-data; name="documents"; filename="script.txt"', "Content-Type: text/plain", "", "INT. BOOT - DAG\r\nTekst", `--${b}--`, ""].join("\r\n")
  );
  const p = parseMultipart(body, `multipart/form-data; boundary=${b}`);
  assert.deepEqual(p.fields.title, ["De laatste veerboot"]);
  assert.equal(p.files.length, 1);
  assert.equal(p.files[0].filename, "script.txt");
  assert.equal(p.files[0].data.toString(), "INT. BOOT - DAG\r\nTekst");
});

await t("cleanBrief: onbekende waarden vallen terug, titel verplicht", () => {
  const b = cleanBrief({ title: " X ", format: "opera", budget_level: "huge", length_minutes: "90", target_total: "250.000", currency: "eur", start_date: "2027-01-05", deadline: "bad" });
  assert.equal(b.title, "X");
  assert.equal(b.format, "other");
  assert.equal(b.budget_level, "mid");
  assert.equal(b.length_minutes, 90);
  assert.equal(b.target_total, 250);
  assert.equal(b.currency, "EUR");
  assert.equal(b.start_date, "2027-01-05");
  assert.equal(b.deadline, null);
  assert.throws(() => cleanBrief({ title: "" }), /title/);
});

// ---------- Server ----------

const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), RAILWAY_VOLUME_MOUNT_PATH: dataDir, PORTAL_ADMIN_KEY: ADMIN, PORTAL_DOWNLOAD_PASSWORD: DL_PASSWORD, RESEND_API_KEY: "", PORTAL_SESSION_SECRET: "test-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
const started = Date.now();
while (Date.now() - started < 15000) {
  try {
    const r = await fetch(`${BASE}/api/portal/session`);
    if (r.ok) break;
  } catch {
    /* nog niet op */
  }
  await new Promise((r) => setTimeout(r, 150));
}

let cookie = "";
const session = async (path, { method = "GET", body, form, headers = {} } = {}) => {
  const h = { Cookie: cookie, "X-Requested-With": "test", ...headers };
  let payload = form;
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
};
const bearer = (token) => async (path, { method = "GET", body, form } = {}) => {
  const h = { Authorization: `Bearer ${token}` };
  let payload = form;
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(`${BASE}${path}`, { method, headers: h, body: payload });
};

let apiKey = "";
let jobId = "";
let docId = "";

try {
  await t("server draait", async () => {
    const r = await fetch(`${BASE}/api/portal/session`);
    if (r.status !== 200) throw new Error(log);
    assert.equal((await r.json()).company, null);
  });

  await t("aanmelden zonder X-Requested-With wordt geweigerd (CSRF)", async () => {
    const r = await fetch(`${BASE}/api/portal/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: "X", contact: "Y", email: "x@example.com", password: "0123456789", consent: true }) });
    assert.equal(r.status, 403);
  });

  await t("aanmelden: bedrijf, contact, e-mail, wachtwoord", async () => {
    const r = await session("/api/portal/signup", { method: "POST", body: { company: "Veerboot Films", contact: "Anna", email: "Anna@Example.com", password: "wachtwoord123", consent: true } });
    await expectStatus(r, 200);
    const d = await r.json();
    assert.equal(d.company.company, "Veerboot Films");
    assert.equal(d.company.email, "anna@example.com");
    assert.equal(d.company.verified, false);
    assert.match(cookie, /^tubes_portal=/);
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "portal", "companies.json"), "utf8"));
    const c = Object.values(stored)[0];
    assert.ok(c.hash && c.salt && !("password" in c), "wachtwoord alleen als hash");
  });

  await t("dubbel aanmelden geeft 409, fout wachtwoord 401", async () => {
    const dup = await session("/api/portal/signup", { method: "POST", body: { company: "Veerboot Films", contact: "Anna", email: "anna@example.com", password: "wachtwoord123", consent: true } });
    assert.equal(dup.status, 409);
    const saved = cookie;
    const bad = await session("/api/portal/login", { method: "POST", body: { email: "anna@example.com", password: "fout" } });
    assert.equal(bad.status, 401);
    cookie = saved;
  });

  await t("koppelcode: eenmalig getoond, als hash bewaard", async () => {
    const r = await session("/api/portal/api-key", { method: "POST" });
    await expectStatus(r, 200);
    const d = await r.json();
    apiKey = d.apiKey.key;
    assert.match(apiKey, /^bp_[0-9a-f]{8}_[0-9a-f]{48}$/);
    const s = await (await session("/api/portal/session")).json();
    assert.equal(s.apiKey.id, d.apiKey.id);
    assert.equal(s.apiKey.key, undefined);
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "portal", "companies.json"), "utf8"));
    assert.ok(!JSON.stringify(stored).includes(apiKey), "sleutel staat niet in klare tekst op schijf");
  });

  await t("productie aanmaken met twee documenten (sessie, multipart)", async () => {
    const form = new FormData();
    form.append("title", "De laatste veerboot");
    form.append("format", "short_film");
    form.append("genre", "Drama");
    form.append("length_minutes", "18");
    form.append("budget_level", "modest");
    form.append("target_total", "45000");
    form.append("start_phase", "preproduction");
    form.append("start_date", "2027-03-01");
    form.append("shooting_days", "4");
    form.append("notes", "Locatie is al geregeld.");
    form.append("language", "nl");
    form.append("currency", "EUR");
    form.append("documents", new Blob(["INT. VEERBOOT - DAG\nAnna kijkt uit over het water."], { type: "text/plain" }), "../../script met spatie.txt");
    form.append("documents_kind", "script");
    form.append("documents", new Blob(["Een korte film over een laatste overtocht."], { type: "text/markdown" }), "synopsis.md");
    form.append("documents_kind", "synopsis");
    const r = await session("/api/portal/v1/jobs", { method: "POST", form });
    await expectStatus(r, 201);
    const j = await r.json();
    jobId = j.id;
    assert.equal(j.status, "submitted");
    assert.equal(j.brief.shooting_days, 4);
    assert.equal(j.brief.target_total, 45000);
    assert.equal(j.documents.length, 2);
    assert.equal(j.documents[0].kind, "script");
    assert.equal(j.documents[0].name, "script met spatie.txt", "padgedeelte uit de bestandsnaam");
    docId = j.documents[0].id;
    const files = fs.readdirSync(path.join(dataDir, "portal", "files", jobId));
    assert.deepEqual(files.sort(), j.documents.map((d) => d.id).sort(), "bestanden staan onder hun id");
  });

  await t("verkeerd bestandstype wordt geweigerd", async () => {
    const form = new FormData();
    form.append("title", "X");
    form.append("documents", new Blob(["x"]), "virus.exe");
    const r = await session("/api/portal/v1/jobs", { method: "POST", form });
    assert.equal(r.status, 400);
  });

  const app = bearer(apiKey);
  await t("API met sleutel: /me en /jobs", async () => {
    const me = await (await app("/api/portal/v1/me")).json();
    assert.deepEqual({ company: me.company, contact: me.contact, email: me.email }, { company: "Veerboot Films", contact: "Anna", email: "anna@example.com" });
    const jobs = await (await app("/api/portal/v1/jobs")).json();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, jobId);
    assert.equal(jobs[0].title, "De laatste veerboot");
    assert.deepEqual(Object.keys(jobs[0].brief).sort(), ["budget_level", "currency", "deadline", "episodes", "format", "genre", "language", "length_minutes", "notes", "shooting_days", "start_date", "start_phase", "target_total", "title"]);
    assert.equal(jobs[0].feedback, "");
  });

  await t("API: verkeerde sleutel 401, admin-routes dicht voor een bedrijf", async () => {
    assert.equal((await bearer("bp_00000000_" + "0".repeat(48))("/api/portal/v1/jobs")).status, 401);
    assert.equal((await app("/api/portal/v1/admin/jobs")).status, 403);
  });

  await t("API: document downloaden met Content-Disposition", async () => {
    const r = await app(`/api/portal/v1/jobs/${jobId}/documents/${docId}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-disposition"), /attachment; filename="script met spatie.txt"/);
    assert.match(await r.text(), /VEERBOOT/);
  });

  const admin = bearer(ADMIN);
  await t("admin: alle jobs met bedrijfsnaam en sleutel-id", async () => {
    const r = await admin("/api/portal/v1/admin/jobs");
    await expectStatus(r, 200);
    const jobs = await r.json();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].company.name, "Veerboot Films");
    assert.equal(jobs[0].company.api_key_id, apiKey.split("_")[1]);
  });

  await t("PATCH status in_progress (app) en delivered geweigerd", async () => {
    const r = await app(`/api/portal/v1/jobs/${jobId}`, { method: "PATCH", body: { status: "in_progress" } });
    await expectStatus(r, 200);
    assert.equal((await r.json()).status, "in_progress");
    assert.equal((await app(`/api/portal/v1/jobs/${jobId}`, { method: "PATCH", body: { status: "delivered" } })).status, 400);
  });

  await t("resultaat uploaden (admin): summary + budget + tubes + pdf", async () => {
    const form = new FormData();
    form.append("summary", JSON.stringify({ total: 48250.5, currency: "EUR", activities: 7, shooting_days: 4, lines: 63, verdict: "Within 10% of target", summary_text: "Vier draaidagen op één locatie." }));
    form.append("budget", new Blob([JSON.stringify({ format: "budget-builder", title: "De laatste veerboot" })], { type: "application/json" }), "veerboot.budget.json");
    form.append("tubes", new Blob([JSON.stringify({ format: "tubes-planner-export", version: 1 })], { type: "application/json" }), "veerboot.tubes-planner.json");
    form.append("pdf", new Blob(["%PDF-1.4\n%fake\n"], { type: "application/pdf" }), "veerboot.pdf");
    const r = await admin(`/api/portal/v1/jobs/${jobId}/result`, { method: "POST", form });
    await expectStatus(r, 200);
    const j = await r.json();
    assert.equal(j.status, "delivered");
    assert.equal(j.result.summary.total, 48250.5);
    assert.equal(j.result.summary.lines, 63);
    assert.equal(j.result.downloads.pdf, `/api/portal/v1/jobs/${jobId}/result/pdf`);
  });

  await t("resultaat met kapotte JSON wordt geweigerd", async () => {
    const form = new FormData();
    form.append("summary", "{}");
    form.append("budget", new Blob(["{not json"]), "b.json");
    form.append("tubes", new Blob(["{}"]), "t.json");
    assert.equal((await admin(`/api/portal/v1/jobs/${jobId}/result`, { method: "POST", form })).status, 400);
  });

  await t("GET /jobs/:id/result (app) en downloads", async () => {
    const r = await app(`/api/portal/v1/jobs/${jobId}/result`);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.summary.verdict, "Within 10% of target");
    const b = await app(d.downloads.budget);
    assert.equal(b.headers.get("content-type"), "application/json");
    assert.match(b.headers.get("content-disposition"), /de-laatste-veerboot\.budget\.json/);
    assert.equal((await b.json()).format, "budget-builder");
    const tb = await app(d.downloads.tubes);
    assert.match(tb.headers.get("content-disposition"), /\.tubes-planner\.json/);
    const pdf = await app(d.downloads.pdf);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
  });

  await t("portaal (sessie) ziet delivered met samenvatting", async () => {
    const jobs = await (await session("/api/portal/v1/jobs")).json();
    assert.equal(jobs[0].status, "delivered");
    assert.equal(jobs[0].result.summary.activities, 7);
    assert.equal(jobs[0].result.summary.shooting_days, 4);
  });

  await t("opmerking terugsturen, zichtbaar voor de app", async () => {
    const r = await session(`/api/portal/v1/jobs/${jobId}/feedback`, { method: "POST", body: { feedback: "Catering te hoog." } });
    await expectStatus(r, 200);
    const jobs = await (await app("/api/portal/v1/jobs")).json();
    assert.equal(jobs[0].feedback, "Catering te hoog.");
  });

  await t("sessie zonder X-Requested-With mag niet wijzigen, wel lezen", async () => {
    const r = await fetch(`${BASE}/api/portal/v1/jobs/${jobId}/feedback`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ feedback: "x" }) });
    assert.equal(r.status, 403);
    const g = await fetch(`${BASE}/api/portal/v1/jobs`, { headers: { Cookie: cookie } });
    assert.equal(g.status, 200);
  });

  await t("tweede bedrijf ziet de job niet", async () => {
    const saved = cookie;
    cookie = "";
    const r = await session("/api/portal/signup", { method: "POST", body: { company: "Ander Bedrijf", contact: "Bob", email: "bob@example.com", password: "wachtwoord123", consent: true } });
    assert.equal(r.status, 200);
    assert.equal((await session(`/api/portal/v1/jobs/${jobId}`)).status, 404);
    assert.deepEqual(await (await session("/api/portal/v1/jobs")).json(), []);
    cookie = saved;
  });

  await t("productie verwijderen ruimt de bestanden op", async () => {
    const r = await session(`/api/portal/v1/jobs/${jobId}`, { method: "DELETE" });
    assert.equal(r.status, 200);
    assert.equal(fs.existsSync(path.join(dataDir, "portal", "files", jobId)), false);
    assert.equal((await app(`/api/portal/v1/jobs/${jobId}`)).status, 404);
  });

  // ----- Installers achter wachtwoord -----
  let dlCookie = "";
  const dl = async (path, { method = "GET", body, headers = {}, raw } = {}) => {
    const h = { Cookie: dlCookie, ...headers };
    let payload = raw;
    if (body !== undefined) {
      h["Content-Type"] = "application/json";
      h["X-Requested-With"] = "test";
      payload = JSON.stringify(body);
    }
    return fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  };

  await t("downloads: zonder wachtwoord 401, fout wachtwoord 401", async () => {
    assert.equal((await dl("/api/portal/downloads")).status, 401);
    assert.equal((await dl("/api/portal/download/mac-arm64")).status, 401);
    assert.equal((await dl("/api/portal/download-access", { method: "POST", body: { password: "nope" } })).status, 401);
    const noHeader = await fetch(`${BASE}/api/portal/download-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: DL_PASSWORD }) });
    assert.equal(noHeader.status, 403, "zonder X-Requested-With");
  });

  await t("downloads: goed wachtwoord zet cookie, lijst leeg, download 404", async () => {
    const r = await dl("/api/portal/download-access", { method: "POST", body: { password: DL_PASSWORD } });
    await expectStatus(r, 200);
    const set = r.headers.get("set-cookie") || "";
    assert.match(set, /tubes_portal_dl=dl\.\d+\.[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax/);
    dlCookie = set.split(";")[0];
    const list = (await (await dl("/api/portal/downloads")).json()).downloads;
    assert.deepEqual(list.map((d) => d.id), ["mac-arm64", "mac-x64", "win"]);
    assert.ok(list.every((d) => d.available === false && d.size === null));
    assert.equal((await dl("/api/portal/download/mac-arm64")).status, 404);
    assert.equal((await dl("/api/portal/download/linux")).status, 404);
  });

  await t("admin: installer plaatsen als raw body (curl -T), lijst en download", async () => {
    const bytes = Buffer.alloc(300000, 7);
    assert.equal((await app("/api/portal/v1/admin/downloads/mac-arm64?version=0.2.0", { method: "PUT", form: bytes })).status, 403, "bedrijfssleutel mag niet");
    const r = await admin("/api/portal/v1/admin/downloads/mac-arm64?version=0.2.0&name=Budget%20Builder-0.2.0-mac-arm64.dmg", { method: "PUT", form: bytes });
    await expectStatus(r, 200);
    const d = (await r.json()).download;
    assert.deepEqual({ id: d.id, name: d.name, size: d.size, version: d.version, available: d.available }, { id: "mac-arm64", name: "Budget Builder-0.2.0-mac-arm64.dmg", size: 300000, version: "0.2.0", available: true });
    const list = (await (await dl("/api/portal/downloads")).json()).downloads;
    assert.equal(list.find((x) => x.id === "mac-arm64").version, "0.2.0");
    const file = await dl("/api/portal/download/mac-arm64");
    assert.equal(file.status, 200);
    assert.match(file.headers.get("content-disposition"), /attachment; filename="Budget Builder-0.2.0-mac-arm64.dmg"/);
    assert.equal(file.headers.get("content-length"), "300000");
    const got = Buffer.from(await file.arrayBuffer());
    assert.equal(got.length, 300000);
    assert.ok(got.equals(bytes), "bytes komen ongewijzigd terug");
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, "portal", "downloads.json"), "utf8"));
    assert.equal(meta["mac-arm64"].size, 300000);
    assert.ok(fs.existsSync(path.join(dataDir, "portal", "downloads", "mac-arm64")));
    assert.equal(fs.readdirSync(path.join(dataDir, "portal", "downloads")).length, 1, "geen tijdelijke bestanden over");
  });

  await t("admin: installer plaatsen als multipart (veld file) met version en name als velden", async () => {
    const bytes = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(150000, 3), Buffer.from("\r\n--not-a-boundary\r\n"), Buffer.alloc(1000, 9)]);
    const form = new FormData();
    form.append("version", "0.2.1");
    form.append("name", "Budget Builder-Setup-0.2.1.exe");
    form.append("file", new Blob([bytes]), "upload.exe");
    const r = await admin("/api/portal/v1/admin/downloads/win", { method: "PUT", form });
    await expectStatus(r, 200);
    const d = (await r.json()).download;
    assert.equal(d.name, "Budget Builder-Setup-0.2.1.exe");
    assert.equal(d.version, "0.2.1");
    assert.equal(d.size, bytes.length);
    const got = Buffer.from(await (await dl("/api/portal/download/win")).arrayBuffer());
    assert.ok(got.equals(bytes), "multipart-deel exact uitgeknipt");
    assert.equal((await admin("/api/portal/v1/admin/downloads/other", { method: "PUT", form: Buffer.alloc(10) })).status, 404);
  });

  await t("ingelogde sessie ziet de downloads zonder wachtwoord", async () => {
    const r = await fetch(`${BASE}/api/portal/downloads`, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const list = (await r.json()).downloads;
    assert.equal(list.filter((d) => d.available).length, 2);
    const file = await fetch(`${BASE}/api/portal/download/win`, { headers: { Cookie: cookie } });
    assert.equal(file.status, 200);
    await file.arrayBuffer();
  });

  await t("admin: installer verwijderen", async () => {
    assert.equal((await admin("/api/portal/v1/admin/downloads/mac-arm64", { method: "DELETE" })).status, 200);
    const list = (await (await dl("/api/portal/downloads")).json()).downloads;
    assert.equal(list.find((x) => x.id === "mac-arm64").available, false);
    assert.equal((await dl("/api/portal/download/mac-arm64")).status, 404);
  });

  await t("uitloggen", async () => {
    await session("/api/portal/logout", { method: "POST" });
    assert.equal((await (await session("/api/portal/session")).json()).company, null);
  });
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failures) {
  console.log(`\n${failures} test(s) failed\n--- server log ---\n${log}`);
  process.exitCode = 1;
} else {
  console.log("\nAll portal tests passed");
}
