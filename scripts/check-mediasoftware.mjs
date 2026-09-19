#!/usr/bin/env node
// Controleert de softwarelijst (src/_data/mediasoftware.json, of een los
// JSON-bestand met een array van entries, zoals een onderzoeksbestand):
//   - verplichte velden, id-patroon (slug) en unieke id's/namen
//   - categorie (en also_in) en deployment uit de vaste lijsten (zelfde als
//     src/admin/config.yml en softwareIndex.js)
//   - prijs: als gepubliceerd met "(published)" erachter, of "Not published" /
//     "Quote on request" / "Free ..."; een bedrag zonder "(published)" is verdacht
//   - geen em-dashes, geen marketingtaal, summary hoogstens 420 tekens
// Met --net haalt hij ook elke officiële site op en meldt alles dat geen
// 2xx/3xx geeft.
//   node scripts/check-mediasoftware.mjs [bestand] [--net]
import fs from "node:fs";

const args = process.argv.slice(2);
const net = args.includes("--net");
const file = args.find((a) => !a.startsWith("--")) || "src/_data/mediasoftware.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(raw) ? raw : raw.items;

export const CATEGORIES = [
  "Production management", "Budgeting & cost control", "Scheduling & call sheets", "Production accounting & payroll",
  "Script & pre-production", "Location & crew sourcing", "Asset & media management", "Post-production & VFX",
  "Rights & distribution", "Business & CRM",
];
export const DEPLOYMENTS = ["Cloud", "Desktop", "Cloud + desktop", "On-premise + cloud"];
const URL_OK = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);
const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

const problems = [], warn = [];
const ids = new Set(), names = new Set();
for (const [i, p] of items.entries()) {
  const tag = `${p.id || "#" + i} (${p.name || "?"})`;
  const bad = (m) => problems.push(`${tag}: ${m}`);
  for (const k of ["id", "name", "vendor", "vendor_country", "category", "summary", "pricing_model", "official_url"]) {
    if (!p[k] || typeof p[k] !== "string") bad(`missing ${k}`);
  }
  if (p.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) bad("id must be a lowercase ascii slug");
  if (p.id) { if (ids.has(p.id)) bad("duplicate id"); ids.add(p.id); }
  const nk = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (p.name) { if (names.has(nk)) bad("duplicate name"); names.add(nk); }
  if (p.category && !CATEGORIES.includes(p.category)) bad(`unknown category "${p.category}"`);
  if (p.also_in != null) {
    if (!Array.isArray(p.also_in)) bad("also_in must be an array");
    else for (const c of p.also_in) { if (!CATEGORIES.includes(c)) bad(`unknown also_in category "${c}"`); if (c === p.category) bad("also_in repeats the main category"); }
  }
  if (p.deployment != null && !DEPLOYMENTS.includes(p.deployment)) bad(`unknown deployment "${p.deployment}"`);
  if (p.summary && p.summary.length > 420) bad(`summary too long (${p.summary.length})`);
  for (const k of ["for_whom", "platforms", "integrations", "vendor", "vendor_country"]) if (p[k] != null && typeof p[k] !== "string") bad(`${k} must be text, not ${Array.isArray(p[k]) ? "an array" : typeof p[k]}`);
  if (typeof p.pricing_model === "string") {
    const pm = p.pricing_model;
    const hasAmount = /\d/.test(pm) && /\b(EUR|USD|GBP|CAD|AUD|CHF|SEK|NOK|DKK|JPY|€|\$|£)/.test(pm);
    if (hasAmount && !/\(published\)\s*$/.test(pm)) warn.push(`${tag}: pricing has an amount but no "(published)" at the end`);
    if (!hasAmount && !/^(Not published|Quote on request|Free|Open source)/i.test(pm) && !/\(published\)\s*$/.test(pm)) warn.push(`${tag}: pricing is neither an amount, "Not published", "Quote on request" nor "Free ...": "${pm.slice(0, 60)}"`);
    if (/\b(approx|around|about|estimated|roughly)\b/i.test(pm)) bad("pricing looks estimated");
  }
  if (p.summary && /\b(award-winning|leading|world-class|premier|best-in-class|cutting-edge|state-of-the-art|renowned|powerful|seamless(ly)?|industry-standard)\b/i.test(p.summary)) warn.push(`${tag}: marketing wording in summary`);
  for (const s of strings(p)) if (s.includes("—")) { bad("em-dash in text"); break; }
  if (p.official_url != null && !URL_OK(p.official_url)) bad("official_url is not a URL");
  if (p.source_urls != null && !(Array.isArray(p.source_urls) && p.source_urls.every(URL_OK))) bad("source_urls must be an array of URLs");
  if (p.founded != null && !(Number.isInteger(p.founded) && p.founded > 1880 && p.founded <= new Date().getFullYear())) bad(`founded must be a plausible year, got ${JSON.stringify(p.founded)}`);
  if (p.logo != null || p.photo != null) warn.push(`${tag}: logo/photo set; we do not use vendor images`);
}

const per = (k) => Object.entries(items.reduce((a, c) => ((a[c[k]] = (a[c[k]] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ");
console.log(`${items.length} products, ${new Set(items.map((c) => c.vendor_country)).size} vendor countries`);
console.log("per category:", per("category"));
console.log("per country:", per("vendor_country"));
console.log("per deployment:", per("deployment"));

if (net) {
  const urls = new Map();
  for (const p of items) if (URL_OK(p.official_url) && !urls.has(p.official_url)) urls.set(p.official_url, `${p.id} official_url`);
  console.log(`checking ${urls.size} URLs...`);
  const list = [...urls.entries()];
  let idx = 0;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const one = async (u) => {
    for (const method of ["HEAD", "GET"]) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(u, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en" } });
        clearTimeout(t);
        if (r.ok) return r.status;
        if (method === "GET") return r.status;
      } catch (e) {
        if (method === "GET") return "ERR " + (e.cause?.code || e.name);
      }
    }
    return 0;
  };
  const results = [], soft = [];
  const worker = async () => {
    while (idx < list.length) {
      const [u, tag] = list[idx++];
      const status = await one(u);
      if (typeof status === "number" && status >= 200 && status < 400) continue;
      if (status === 403 || status === 429) { soft.push(`${tag}: ${status} (probably blocks bots; check in a browser) ${u}`); continue; }
      if (status === "ERR UNABLE_TO_VERIFY_LEAF_SIGNATURE") { soft.push(`${tag}: incomplete certificate chain (works in a browser) ${u}`); continue; }
      results.push(`${tag}: ${status} ${u}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const r of soft.sort()) console.log("note " + r);
  for (const r of results.sort()) console.log("URL " + r);
  console.log(`${results.length} URL problems, ${soft.length} bot-blocked (check by hand)`);
}

for (const w of warn) console.log("warn " + w);
for (const p of problems) console.log("PROBLEM " + p);
console.log(`${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
