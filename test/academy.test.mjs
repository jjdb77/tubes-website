// Tests voor de Tubes Academy (lib/academy.js): code-inlog, toegang per status,
// catalogus met licentiekey, beheer-API en uploads. Draait zonder netwerk naar
// buiten: een eigen Express-app op een vrije poort, een tijdelijke datamap en
// een nep-mailfunctie die de verstuurde mails bewaart. `npm test`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createAcademy } from "../lib/academy.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "academy-test-"));
const mails = [];
const ADMIN = "test-admin-token-123";

function start(opts) {
  const app = express();
  // Zelfde uitzondering als server.js: de upload-body niet laten parsen.
  const urlencoded = express.urlencoded({ extended: false });
  app.use((req, res, next) => (req.path === "/api/academy/admin/upload" ? next() : urlencoded(req, res, next)));
  const router = createAcademy({
    dataDir, secret: "x".repeat(32), adminToken: ADMIN, notifyEmail: "owner@example.com",
    sendMail: async (to, subject, html) => { mails.push({ to, subject, html }); return true; },
    log: { error() {} }, limits: { code: 100, verify: 100 }, maxUpload: 64 * 1024, ...opts,
  });
  app.use(router);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, router, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const { server, router, base } = await start();
const noToken = await start({ adminToken: "" });

let n = 0;
let failed = 0;
async function t(name, fn) {
  n++;
  try { await fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.stack, e.cause); }
}
const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const admin = (p, init = {}) => fetch(base + p, { ...init, headers: { Authorization: `Bearer ${ADMIN}`, ...(init.headers || {}) } });
const adminPost = (p, body) => admin(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const upload = (query, data) => admin(`/api/academy/admin/upload?${new URLSearchParams(query)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: data });
const lastCode = (email) => {
  const m = [...mails].reverse().find((x) => x.to === email && /code/.test(x.subject));
  return m && /(\d{6})/.exec(m.subject)[1];
};
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function signIn(email, extra = {}) {
  assert.equal((await post("/api/academy/code", { email })).status, 200);
  const res = await post("/api/academy/verify", { email, code: lastCode(email), ...extra });
  assert.equal(res.status, 200);
  return cookieOf(res);
}

await t("code flow: code per mail, verkeerde code, juiste code geeft sessie en pending", async () => {
  const email = "Anna@Example.com";
  let res = await post("/api/academy/code", { email });
  assert.equal(res.status, 200);
  const code = lastCode("anna@example.com");
  assert.match(code, /^\d{6}$/);
  // Code staat alleen gehasht op schijf
  assert.ok(!fs.readFileSync(path.join(dataDir, "academy", "codes.json"), "utf8").includes(code));
  const wrong = code === "000000" ? "111111" : "000000";
  res = await post("/api/academy/verify", { email, code: wrong });
  assert.equal(res.status, 400);
  res = await post("/api/academy/verify", { email, code, name: "Anna", company: "Studio", role: "Producer" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "pending");
  const setCookie = res.headers.get("set-cookie");
  assert.match(setCookie, /tubes_academy=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
  // Code is eenmalig
  res = await post("/api/academy/verify", { email, code });
  assert.equal(res.status, 400);
  // Melding naar de eigenaar
  assert.ok(mails.some((m) => m.to === "owner@example.com" && /anna@example\.com/.test(m.subject)));
  const users = JSON.parse(fs.readFileSync(path.join(dataDir, "academy", "users.json"), "utf8"));
  assert.equal(users[0].email, "anna@example.com");
  assert.equal(users[0].status, "pending");
  assert.equal(users[0].company, "Studio");
});

await t("code flow: na 5 foute pogingen is de code ongeldig", async () => {
  const email = "brute@example.com";
  await post("/api/academy/code", { email });
  const code = lastCode(email);
  const wrong = code === "123456" ? "654321" : "123456";
  for (let i = 0; i < 4; i++) assert.equal((await post("/api/academy/verify", { email, code: wrong })).status, 400);
  assert.equal((await post("/api/academy/verify", { email, code: wrong })).status, 429);
  assert.equal((await post("/api/academy/verify", { email, code })).status, 400);
});

await t("code: ongeldige e-mail 400, honeypot stuurt niets", async () => {
  assert.equal((await post("/api/academy/code", { email: "nope" })).status, 400);
  const before = mails.length;
  const res = await post("/api/academy/code", { email: "bot@example.com", company_website: "x" });
  assert.equal(res.status, 200);
  assert.equal(mails.length, before);
});

let annaCookie;
await t("pagina: zonder sessie aanmeldblok, pending ziet 'We review your request'", async () => {
  const redirect = await fetch(base + "/academy", { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/academy/");
  let html = await (await fetch(base + "/academy/")).text();
  assert.match(html, /AC:SIGNED_OUT/);
  annaCookie = await signIn("anna@example.com");
  html = await (await fetch(base + "/academy/", { headers: { Cookie: annaCookie } })).text();
  assert.match(html, /We review your request/);
  assert.doesNotMatch(html, /AC:SIGNED_OUT/);
  // Vervalste cookie telt niet
  html = await (await fetch(base + "/academy/", { headers: { Cookie: annaCookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")) } })).text();
  assert.match(html, /AC:SIGNED_OUT/);
});

await t("beheer: zonder token 503, verkeerd of geen token 401", async () => {
  await signIn("brute@example.com");
  assert.equal((await fetch(noToken.base + "/api/academy/admin/requests", { headers: { Authorization: "Bearer x" } })).status, 503);
  assert.equal((await fetch(base + "/api/academy/admin/requests")).status, 401);
  assert.equal((await fetch(base + "/api/academy/admin/requests", { headers: { Authorization: "Bearer wrong" } })).status, 401);
  const res = await admin("/api/academy/admin/requests");
  assert.equal(res.status, 200);
  const { users } = await res.json();
  assert.ok(users.length >= 2);
  assert.ok(users[0].requestedAt >= users[1].requestedAt, "nieuwste eerst");
});

const appBuf = Buffer.from("fake dmg " + "x".repeat(1000));
const bookV1 = Buffer.from("book v1");
const bookV2 = Buffer.from("book v2 longer");
const audio = Buffer.from("audio zip");

await t("upload: app, boek, audio, en catalogusregel", async () => {
  let res = await upload({ name: "Oskar-0.1.0.dmg", kind: "app", version: "0.1.0" }, appBuf);
  assert.equal(res.status, 200);
  const { file } = await res.json();
  assert.equal(file.sha256, sha(appBuf));
  assert.equal(file.size, appBuf.length);
  res = await upload({ name: "tubes-basics-1.0.zip", kind: "book", bookId: "tubes-basics", title: "Tubes: The Basics", version: "1.0", lang: "en" }, bookV1);
  assert.equal(res.status, 200);
  res = await upload({ name: "tubes-basics-audio.zip", kind: "audio", bookId: "tubes-basics" }, audio);
  assert.equal(res.status, 200);
  assert.equal(fs.readdirSync(path.join(dataDir, "academy", "files")).filter((f) => f.startsWith(".")).length, 0, "geen tijdelijke bestanden");
});

await t("upload: nieuwere boekversie vervangt de oude (regel en bestand)", async () => {
  const res = await upload({ name: "tubes-basics-1.1.zip", kind: "book", bookId: "tubes-basics", title: "Tubes: The Basics", version: "1.1", lang: "en" }, bookV2);
  assert.equal(res.status, 200);
  const { files } = await (await admin("/api/academy/admin/files")).json();
  const books = files.filter((f) => f.kind === "book" && f.bookId === "tubes-basics");
  assert.deepEqual(books.map((f) => f.name), ["tubes-basics-1.1.zip"]);
  assert.ok(!fs.existsSync(path.join(dataDir, "academy", "files", "tubes-basics-1.0.zip")));
  // Zelfde naam opnieuw: vervangen, geen dubbele regel
  await upload({ name: "Oskar-0.1.0.dmg", kind: "app", version: "0.1.0" }, appBuf);
  const again = await (await admin("/api/academy/admin/files")).json();
  assert.equal(again.files.filter((f) => f.name === "Oskar-0.1.0.dmg").length, 1);
});

await t("upload: bestandsnamen en velden worden streng gecontroleerd", async () => {
  const bad = ["../evil.zip", ".hidden.zip", "a/b.zip", "evil.exe", "evil.zip.sh", "x".repeat(101) + ".zip", "space name.zip", "evil.ZIP"];
  for (const name of bad) assert.equal((await upload({ name, kind: "app" }, Buffer.from("x"))).status, 400, name);
  assert.equal((await upload({ name: "ok.zip", kind: "movie" }, Buffer.from("x"))).status, 400);
  assert.equal((await upload({ name: "ok.zip", kind: "book", bookId: "Bad_ID" }, Buffer.from("x"))).status, 400);
  assert.equal((await upload({ name: "ok.dmg", kind: "book", bookId: "ok" }, Buffer.from("x"))).status, 400);
  assert.equal((await upload({ name: "ok.zip", kind: "book", bookId: "ok", lang: "english!" }, Buffer.from("x"))).status, 400);
  assert.equal((await upload({ name: "empty.zip", kind: "book", bookId: "ok" }, Buffer.alloc(0))).status, 400);
  // Met een formulier-Content-Type (zoals curl --data-binary) komt de body gewoon door
  const form = await admin("/api/academy/admin/upload?name=form.zip&kind=book&bookId=form-test", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "a=1&b=2" });
  assert.equal(form.status, 200);
  assert.equal((await form.json()).file.size, 7);
  await admin("/api/academy/admin/files/form.zip", { method: "DELETE" });
  assert.equal((await upload({ name: "big.zip", kind: "book", bookId: "ok" }, Buffer.alloc(65 * 1024))).status, 413);
  // Te groot zonder Content-Length (gestreamd): ook 413, geen restbestand
  const big = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(8 * 1024)); c.close(); } });
  const streamed = await admin("/api/academy/admin/upload?name=big.zip&kind=book&bookId=ok", { method: "POST", body: big, duplex: "half" });
  assert.equal(streamed.status, 413);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, "academy", "files")).filter((f) => f.startsWith(".") || f === "big.zip"), []);
  assert.equal((await fetch(base + "/api/academy/admin/upload?name=ok.zip&kind=app", { method: "POST", body: "x" })).status, 401);
  // Rare paden bij downloaden
  assert.equal((await fetch(base + "/academy/files/..%2Fusers.json", { headers: { Cookie: annaCookie } })).status, 404);
});

await t("bestanden: pending krijgt 403, zonder sessie redirect, approved krijgt het bestand", async () => {
  let res = await fetch(base + "/academy/files/Oskar-0.1.0.dmg", { headers: { Cookie: annaCookie }, redirect: "manual" });
  assert.equal(res.status, 403);
  res = await fetch(base + "/academy/files/Oskar-0.1.0.dmg", { redirect: "manual" });
  assert.equal(res.status, 302);
  res = await adminPost("/api/academy/admin/approve", { email: "anna@example.com", licenceKey: "LK1.abc_DEF-123.sigsig", licenceExpires: "2099-12-31" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.status, "approved");
  assert.ok(mails.some((m) => m.to === "anna@example.com" && /ready/.test(m.subject) && m.html.includes("LK1.abc_DEF-123.sigsig")));
  res = await fetch(base + "/academy/files/Oskar-0.1.0.dmg", { headers: { Cookie: annaCookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), /attachment/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), appBuf);
  res = await fetch(base + "/academy/files/nothere.zip", { headers: { Cookie: annaCookie } });
  assert.equal(res.status, 404);
  const html = await (await fetch(base + "/academy/", { headers: { Cookie: annaCookie } })).text();
  assert.match(html, /Download Oskar for Mac/);
  assert.match(html, /oskar:\/\/activate\?code=LK1.abc_DEF-123.sigsig/);
  assert.match(html, /Tubes: The Basics/);
});

await t("approve: ongeldige invoer en onbekende e-mail", async () => {
  assert.equal((await adminPost("/api/academy/admin/approve", { email: "anna@example.com", licenceKey: "short", licenceExpires: "2099-01-01" })).status, 400);
  assert.equal((await adminPost("/api/academy/admin/approve", { email: "anna@example.com", licenceKey: "LK1.abc.def12345", licenceExpires: "soon" })).status, 400);
  assert.equal((await adminPost("/api/academy/admin/approve", { email: "nobody@example.com", licenceKey: "LK1.abc.def12345", licenceExpires: "2099-01-01" })).status, 404);
  assert.equal((await adminPost("/api/academy/admin/approve", { email: "brute@example.com", licenceKey: "LK1.abc_DEF-123.sigsig", licenceExpires: "2099-01-01" })).status, 409);
});

const key = (k) => ({ headers: { Authorization: `Bearer ${k}` } });
await t("catalogus: geldige key, onbekende key, verlopen key", async () => {
  let res = await fetch(base + "/api/academy/catalog", key("LK1.abc_DEF-123.sigsig"));
  assert.equal(res.status, 200);
  const cat = await res.json();
  assert.equal(cat.format, "tubes-academy-catalog");
  assert.equal(cat.items.length, 1);
  const it = cat.items[0];
  assert.equal(it.bookId, "tubes-basics");
  assert.equal(it.title, "Tubes: The Basics");
  assert.equal(it.version, "1.1");
  assert.equal(it.lang, "en");
  assert.deepEqual(it.book, { name: "tubes-basics-1.1.zip", size: bookV2.length, sha256: sha(bookV2) });
  assert.equal(it.audio.sha256, sha(audio));

  assert.equal((await fetch(base + "/api/academy/catalog", key("LK1.unknown.key12345"))).status, 401);
  assert.equal((await fetch(base + "/api/academy/catalog")).status, 401);

  // Brute approven met een verlopen datum
  await adminPost("/api/academy/admin/approve", { email: "brute@example.com", licenceKey: "LK1.expired.key12345", licenceExpires: "2020-01-01" });
  assert.equal((await fetch(base + "/api/academy/catalog", key("LK1.expired.key12345"))).status, 401);
});

await t("download met key: alleen boek/audio, niet de app", async () => {
  let res = await fetch(base + "/api/academy/download/tubes-basics-1.1.zip", key("LK1.abc_DEF-123.sigsig"));
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bookV2);
  res = await fetch(base + "/api/academy/download/Oskar-0.1.0.dmg", key("LK1.abc_DEF-123.sigsig"));
  assert.equal(res.status, 404);
  res = await fetch(base + "/api/academy/download/tubes-basics-1.1.zip", key("LK1.unknown.key12345"));
  assert.equal(res.status, 401);
});

// Nep-OpenAI voor de AI-route: bewaart wat er binnenkomt en geeft verbruik terug.
const upSeen = [];
const upstream = await new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      upSeen.push({ auth: req.headers.authorization, body });
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end('data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":10}}}\n\n');
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ output_text: "ok", usage: { input_tokens: 100000, output_tokens: 100000 } }));
      }
    });
  });
  srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
});
const withAi = await start({ openaiKey: "sk-server-secret", aiUpstream: upstream.url, aiCapEur: 1 });

await t("AI: licentiekey geeft toegang, serversleutel naar OpenAI, alleen onze velden, maandlimiet", async () => {
  const ask = { model: "gpt-5.6-terra", input: "hi", tools: [{ type: "web_search" }] };
  const post = (b, k) => fetch(withAi.base + "/api/academy/ai/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", ...(k ? { Authorization: `Bearer ${k}` } : {}) }, body: JSON.stringify(b) });
  assert.equal((await post(ask)).status, 401);
  assert.equal((await post(ask, "LK1.unknown.key12345")).status, 401);
  assert.equal((await post(ask, "LK1.expired.key12345")).status, 401, "verlopen");
  assert.equal((await post({ ...ask, model: "gpt-9" }, "LK1.abc_DEF-123.sigsig")).status, 400);
  const plain = await fetch(base + "/api/academy/ai/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer LK1.abc_DEF-123.sigsig" }, body: JSON.stringify(ask) });
  assert.equal(plain.status, 503, "zonder OPENAI_API_KEY staat AI uit");
  let res = await post(ask, "LK1.abc_DEF-123.sigsig");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).output_text, "ok");
  assert.equal(upSeen.at(-1).auth, "Bearer sk-server-secret");
  assert.equal(upSeen.at(-1).body.tools, undefined);
  assert.equal(upSeen.at(-1).body.store, false);
  res = await post({ ...ask, stream: true }, "LK1.abc_DEF-123.sigsig");
  assert.equal(res.status, 402, "boven de limiet na het eerste antwoord");
  res = await fetch(withAi.base + "/api/academy/admin/requests", { headers: { Authorization: `Bearer ${ADMIN}` } });
  const anna = (await res.json()).users.find((u) => u.email === "anna@example.com");
  assert.equal(anna.aiCalls, 1);
  assert.ok(anna.aiEur > 1.6 && anna.aiEur < 1.62);
  res = await fetch(withAi.base + "/api/academy/ai/v1/models", { headers: { Authorization: "Bearer LK1.abc_DEF-123.sigsig" } });
  assert.equal(res.status, 200);
});

await t("revoke: key werkt niet meer en bestanden zijn dicht", async () => {
  const res = await adminPost("/api/academy/admin/revoke", { email: "anna@example.com" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.status, "rejected");
  assert.equal((await fetch(base + "/api/academy/catalog", key("LK1.abc_DEF-123.sigsig"))).status, 401);
  assert.equal((await fetch(base + "/academy/files/Oskar-0.1.0.dmg", { headers: { Cookie: annaCookie } })).status, 403);
  const html = await (await fetch(base + "/academy/", { headers: { Cookie: annaCookie } })).text();
  assert.match(html, /not active/);
  assert.equal((await adminPost("/api/academy/admin/reject", { email: "brute@example.com" })).status, 200);
});

await t("AI: na intrekken geen toegang meer", async () => {
  const res = await fetch(withAi.base + "/api/academy/ai/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer LK1.abc_DEF-123.sigsig" }, body: JSON.stringify({ model: "gpt-5.6-terra", input: "x" }) });
  assert.equal(res.status, 401);
});

await t("delete: bestand en regel weg", async () => {
  assert.equal((await admin("/api/academy/admin/files/tubes-basics-audio.zip", { method: "DELETE" })).status, 200);
  assert.ok(!fs.existsSync(path.join(dataDir, "academy", "files", "tubes-basics-audio.zip")));
  assert.equal((await admin("/api/academy/admin/files/tubes-basics-audio.zip", { method: "DELETE" })).status, 404);
  assert.equal((await admin("/api/academy/admin/files/..%2Fusers.json", { method: "DELETE" })).status, 400);
});

await t("logout wist de cookie", async () => {
  const res = await fetch(base + "/api/academy/logout", { method: "POST" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /tubes_academy=; .*Max-Age=0/);
});

server.close();
noToken.server.close();
withAi.server.close();
upstream.srv.close();
router.stop();
noToken.router.stop();
withAi.router.stop();
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${n - failed}/${n} academy-tests geslaagd`);
if (failed) process.exitCode = 1;
