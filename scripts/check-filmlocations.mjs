#!/usr/bin/env node
// Controleert de locatiegids-data (src/_data/filmlocations.json, of een los
// JSON-bestand met een array van entries):
//   - verplichte velden, id-patroon en unieke id's
//   - type uit de vaste lijst (zelfde lijst als in src/admin/config.yml)
//   - land bekend en coördinaten binnen het land
//   - geen em-dashes, setting hoogstens 240 tekens
//   - fotolicentie vrij (CC0, CC BY, CC BY-SA, publiek domein) of "met toestemming"
// Met --net haalt hij ook elke URL op (officiële site, commissiepagina, foto en
// fotopagina) en meldt alles dat geen 2xx/3xx geeft.
//   node scripts/check-filmlocations.mjs [bestand] [--net]
import fs from "node:fs";

const args = process.argv.slice(2);
const net = args.includes("--net");
const file = args.find((a) => !a.startsWith("--")) || "src/_data/filmlocations.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const locs = Array.isArray(raw) ? raw : raw.locations;

export const TYPES = [
  "Castle & estate", "Palace & landmark", "Historic town & street", "Village & countryside",
  "City & skyline", "Coast & beach", "Mountains & wilderness", "Forest & lake", "Hotel & interiors",
  "Church & monastery", "Transport & infrastructure", "Industrial & derelict", "Modern architecture",
  "Studio & backlot", "House & apartment", "Hospital, prison & institution",
  "Office, school & public building", "Bar, restaurant & shop", "Theatre, arena & venue",
];
// [latMin, latMax, lngMin, lngMax]; meerdere vakken voor eilanden/overzee
const BBOX = {
  Austria: [[46.3, 49.1, 9.5, 17.2]],
  Belgium: [[49.4, 51.6, 2.5, 6.5]],
  Croatia: [[42.3, 46.6, 13.4, 19.5]],
  "Czech Republic": [[48.5, 51.1, 12.0, 18.9]],
  Denmark: [[54.5, 57.8, 8.0, 15.3]],
  Finland: [[59.7, 70.1, 19.0, 31.6]],
  France: [[41.3, 51.1, -5.2, 9.7]],
  Germany: [[47.2, 55.1, 5.8, 15.1]],
  Greece: [[34.8, 41.8, 19.3, 29.7]],
  Hungary: [[45.7, 48.6, 16.1, 22.9]],
  Iceland: [[63.3, 66.6, -24.6, -13.4]],
  Ireland: [[51.4, 55.4, -10.7, -5.9]],
  Italy: [[35.4, 47.1, 6.6, 18.6]],
  Malta: [[35.7, 36.1, 14.1, 14.6]],
  Netherlands: [[50.7, 53.6, 3.3, 7.3]],
  Norway: [[57.9, 71.2, 4.5, 31.2], [74.0, 81.0, 10.0, 35.0]],
  Poland: [[49.0, 54.9, 14.1, 24.2]],
  Portugal: [[36.9, 42.2, -9.6, -6.2], [32.6, 33.2, -17.3, -16.2], [36.9, 39.8, -31.3, -24.9]],
  Spain: [[35.9, 43.8, -9.4, 4.4], [27.6, 29.5, -18.2, -13.3]],
  Sweden: [[55.3, 69.1, 10.9, 24.2]],
  "United Kingdom": [[49.9, 60.9, -8.2, 1.8]],
};
const LICENSE_OK = /^(CC0|CC[- ]BY(-SA)?|Public domain|PD|with permission|met toestemming)/i;
const URL_OK = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);

const problems = [];
const warn = [];
const ids = new Set();
const names = new Set();
const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

for (const [i, l] of locs.entries()) {
  const tag = `${l.id || "#" + i} (${l.name || "?"})`;
  const bad = (m) => problems.push(`${tag}: ${m}`);
  for (const k of ["id", "name", "country", "region", "type", "setting", "official_url"]) {
    if (!l[k] || typeof l[k] !== "string") bad(`missing ${k}`);
  }
  if (typeof l.lat !== "number" || typeof l.lng !== "number") bad("lat/lng not numbers");
  if (l.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.id)) bad("id must be lowercase ascii with hyphens");
  if (l.id) { if (ids.has(l.id)) bad("duplicate id"); ids.add(l.id); }
  const nk = `${l.country}|${String(l.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
  if (l.name) { if (names.has(nk)) bad("duplicate name in the same country"); names.add(nk); }
  if (l.type && !TYPES.includes(l.type)) bad(`unknown type "${l.type}"`);
  const boxes = BBOX[l.country];
  if (!boxes) bad(`unknown country "${l.country}"`);
  else if (typeof l.lat === "number" && !boxes.some(([a, b, c, d]) => l.lat >= a && l.lat <= b && l.lng >= c && l.lng <= d)) bad(`coordinates ${l.lat},${l.lng} outside ${l.country}`);
  if (l.setting && l.setting.length > 240) bad(`setting too long (${l.setting.length})`);
  if (l.setting && /[!]/.test(l.setting)) warn.push(`${tag}: exclamation mark in setting`);
  for (const s of strings(l)) if (s.includes("—")) { bad("em-dash in text"); break; }
  for (const k of ["official_url", "commission_url", "url"]) if (l[k] != null && !URL_OK(l[k])) bad(`${k} is not a URL`);
  if (l.source_urls != null) {
    if (!Array.isArray(l.source_urls) || !l.source_urls.every(URL_OK)) bad("source_urls must be an array of URLs");
  }
  for (const k of ["price_eur_day", "capacity"]) if (l[k] != null && !Number.isInteger(l[k])) bad(`${k} must be an integer`);
  if (l.permit_needed != null && !["Yes", "No"].includes(l.permit_needed)) bad("permit_needed must be Yes or No");
  if (l.photo) {
    const p = l.photo;
    if (!p.thumb || !(URL_OK(p.thumb) || p.thumb.startsWith("/assets/"))) bad("photo.thumb missing or not a URL");
    if (!p.author) bad("photo.author missing");
    if (!p.license) bad("photo.license missing");
    else if (!LICENSE_OK.test(p.license)) bad(`photo licence not free: "${p.license}"`);
    if (URL_OK(p.thumb) && !/upload\.wikimedia\.org|commons\.wikimedia\.org/.test(p.thumb)) bad("photo.thumb is not on Wikimedia Commons");
    if (p.file_page && !URL_OK(p.file_page)) bad("photo.file_page is not a URL");
  }
}

const count = {};
for (const l of locs) count[l.country] = (count[l.country] || 0) + 1;
const types = {};
for (const l of locs) types[l.type] = (types[l.type] || 0) + 1;
console.log(`${locs.length} entries, ${Object.keys(count).length} countries`);
console.log("per country:", Object.entries(count).sort().map(([c, n]) => `${c} ${n}`).join(", "));
console.log("per type:", Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", "));

if (net) {
  const urls = new Map();
  for (const l of locs) {
    for (const [k, u] of [["official_url", l.official_url], ["url", l.url], ["photo.thumb", l.photo?.thumb], ["photo.file_page", l.photo?.file_page], ["commission_url", l.commission_url]]) {
      if (URL_OK(u) && !urls.has(u)) urls.set(u, `${l.id} ${k}`);
    }
  }
  // Sommige sites (Cloudflare e.d.) geven elk geautomatiseerd verzoek een 403,
  // ook met een browser-User-Agent, terwijl ze in een browser gewoon werken.
  // Die melden we apart, zodat een echte dode link opvalt.
  const BOT_BLOCKED = ["northernirelandscreen.co.uk", "hants.gov.uk", "iwm.org.uk", "nationaltrust.org.uk", "english-heritage.org.uk", "marriott.com", "maltafilmstudios.com.mt", "screenmalta.com", "nts.org.uk", "screenyorkshire.co.uk", "venetofilmcommission.com", "powerscourt.com", "royalalberthall.com", "liceubarcelona.cat", "cite-espace.com", "villaempain.com", "vca.gov.mt"];
  const blocked = (u) => BOT_BLOCKED.some((h) => u.includes(h));
  console.log(`checking ${urls.size} URLs...`);
  const list = [...urls.entries()];
  let idx = 0;
  // Een "compatible"-User-Agent lokt juist bot-blokkades uit; met een gewone
  // browserstring lijkt de controle op een echte bezoeker, wat we willen weten.
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const one = async (u) => {
    for (const method of ["HEAD", "GET"]) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(u, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*" } });
        clearTimeout(t);
        if (r.ok || (method === "HEAD" && r.status === 405)) { if (r.ok) return r.status; continue; }
        if (method === "GET") return r.status;
      } catch (e) {
        if (method === "GET") return "ERR " + (e.cause?.code || e.name);
      }
    }
    return 0;
  };
  const results = [], softResults = [];
  const worker = async () => {
    while (idx < list.length) {
      const [u, tag] = list[idx++];
      const status = await one(u);
      if (/wikimedia\.org/.test(u)) await new Promise((r) => setTimeout(r, 400));
      if (typeof status === "number" && status >= 200 && status < 400) continue;
      if (status === 403 && blocked(u)) { softResults.push(`${tag}: 403 (blocks bots, fine in a browser) ${u}`); continue; }
      results.push(`${tag}: ${status} ${u}`);
    }
  };
  // Wikimedia knijpt af bij te veel gelijktijdige verzoeken; twee stromen en een
  // korte pauze houden de uitslag bruikbaar in plaats van een muur van 429's.
  await Promise.all(Array.from({ length: 3 }, worker));
  for (const r of softResults.sort()) console.log("note " + r);
  for (const r of results.sort()) console.log("URL " + r);
  console.log(`${results.length} URL problems, ${softResults.length} bot-blocked but fine`);
}

for (const w of warn) console.log("warn " + w);
for (const p of problems) console.log("PROBLEM " + p);
console.log(`${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
