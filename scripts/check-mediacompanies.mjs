#!/usr/bin/env node
// Controleert de bedrijvenlijst (src/_data/mediacompanies.json, of een los
// JSON-bestand met een array van entries, zoals een onderzoeksbestand):
//   - verplichte velden, id-patroon (landcode-slug) en unieke id's/namen
//   - type en specialisme uit de vaste lijsten (zelfde als src/admin/config.yml),
//     en het specialisme passend bij het type
//   - land bekend en coördinaten binnen het land
//   - geen em-dashes, summary hoogstens 240 tekens
// Met --net haalt hij ook elke officiële site en fotolink op en meldt alles
// dat geen 2xx/3xx geeft.
//   node scripts/check-mediacompanies.mjs [bestand] [--net]
import fs from "node:fs";

const args = process.argv.slice(2);
const net = args.includes("--net");
const file = args.find((a) => !a.startsWith("--")) || "src/_data/mediacompanies.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const items = Array.isArray(raw) ? raw : raw.items;

export const TYPES = ["Studio", "Production company", "Post-production"];
export const SPECIALISMS = {
  Studio: ["Sound stages & backlot", "Virtual production stage", "TV & broadcast studio", "Sound & music recording"],
  "Production company": ["Feature film", "TV drama & series", "Documentary", "Commercials & branded content", "Animation", "Entertainment & unscripted", "Service production"],
  "Post-production": ["Picture post & colour", "VFX & animation", "Sound post & dubbing", "Full-service post"],
};
export const ISO = {
  Austria: "at", Belgium: "be", Bulgaria: "bg", Croatia: "hr", "Czech Republic": "cz", Denmark: "dk",
  Estonia: "ee", Finland: "fi", France: "fr", Germany: "de", Greece: "gr", Hungary: "hu", Iceland: "is",
  Ireland: "ie", Italy: "it", Latvia: "lv", Lithuania: "lt", Luxembourg: "lu", Malta: "mt", Netherlands: "nl",
  Norway: "no", Poland: "pl", Portugal: "pt", Romania: "ro", Serbia: "rs", Slovakia: "sk", Slovenia: "si",
  Spain: "es", Sweden: "se", Switzerland: "ch", "United Kingdom": "uk",
};
// [latMin, latMax, lngMin, lngMax]; meerdere vakken voor eilanden/overzee
const BBOX = {
  Austria: [[46.3, 49.1, 9.5, 17.2]], Belgium: [[49.4, 51.6, 2.5, 6.5]], Bulgaria: [[41.2, 44.3, 22.3, 28.7]],
  Croatia: [[42.3, 46.6, 13.4, 19.5]], "Czech Republic": [[48.5, 51.1, 12.0, 18.9]], Denmark: [[54.5, 57.8, 8.0, 15.3]],
  Estonia: [[57.5, 59.8, 21.7, 28.3]], Finland: [[59.7, 70.1, 19.0, 31.6]], France: [[41.3, 51.1, -5.2, 9.7]],
  Germany: [[47.2, 55.1, 5.8, 15.1]], Greece: [[34.8, 41.8, 19.3, 29.7]], Hungary: [[45.7, 48.6, 16.1, 22.9]],
  Iceland: [[63.3, 66.6, -24.6, -13.4]], Ireland: [[51.4, 55.4, -10.7, -5.9]], Italy: [[35.4, 47.1, 6.6, 18.6]],
  Latvia: [[55.6, 58.1, 20.9, 28.3]], Lithuania: [[53.8, 56.5, 20.9, 26.9]], Luxembourg: [[49.4, 50.2, 5.7, 6.6]],
  Malta: [[35.7, 36.1, 14.1, 14.6]], Netherlands: [[50.7, 53.6, 3.3, 7.3]], Norway: [[57.9, 71.2, 4.5, 31.2]],
  Poland: [[49.0, 54.9, 14.1, 24.2]], Portugal: [[36.9, 42.2, -9.6, -6.2], [32.6, 33.2, -17.3, -16.2], [36.9, 39.8, -31.3, -24.9]],
  Romania: [[43.6, 48.3, 20.2, 29.8]], Serbia: [[42.2, 46.2, 18.8, 23.1]], Slovakia: [[47.7, 49.7, 16.8, 22.6]],
  Slovenia: [[45.4, 46.9, 13.3, 16.6]], Spain: [[35.9, 43.8, -9.4, 4.4], [27.6, 29.5, -18.2, -13.3]],
  Sweden: [[55.3, 69.1, 10.9, 24.2]], Switzerland: [[45.8, 47.9, 5.9, 10.5]], "United Kingdom": [[49.9, 60.9, -8.2, 1.8]],
};
const LICENSE_OK = /^(CC0|CC[- ]BY(-SA)?|Public domain|PD|No restrictions|with permission|met toestemming)/i;
const URL_OK = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);
const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

const problems = [], warn = [];
const ids = new Set(), names = new Set();
for (const [i, c] of items.entries()) {
  const tag = `${c.id || "#" + i} (${c.name || "?"})`;
  const bad = (m) => problems.push(`${tag}: ${m}`);
  for (const k of ["id", "name", "city", "country", "type", "specialism", "summary", "official_url"]) {
    if (!c[k] || typeof c[k] !== "string") bad(`missing ${k}`);
  }
  if (typeof c.lat !== "number" || typeof c.lng !== "number") bad("lat/lng not numbers");
  if (c.id && !/^[a-z]{2}-[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) bad("id must be <cc>-<slug>, lowercase ascii");
  if (c.id && c.country && ISO[c.country] && !c.id.startsWith(ISO[c.country] + "-")) bad(`id prefix does not match ${c.country} (${ISO[c.country]}-)`);
  if (c.id) { if (ids.has(c.id)) bad("duplicate id"); ids.add(c.id); }
  const nk = `${c.country}|${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
  if (c.name) { if (names.has(nk)) bad("duplicate name in the same country"); names.add(nk); }
  if (c.type && !TYPES.includes(c.type)) bad(`unknown type "${c.type}"`);
  else if (c.type && c.specialism && !SPECIALISMS[c.type].includes(c.specialism)) bad(`specialism "${c.specialism}" does not belong to type "${c.type}"`);
  const boxes = BBOX[c.country];
  if (!boxes) bad(`unknown country "${c.country}"`);
  else if (typeof c.lat === "number" && !boxes.some(([a, b, x, y]) => c.lat >= a && c.lat <= b && c.lng >= x && c.lng <= y)) bad(`coordinates ${c.lat},${c.lng} outside ${c.country}`);
  if (c.summary && c.summary.length > 240) bad(`summary too long (${c.summary.length})`);
  if (c.summary && /award-winning|leading|world-class|premier|best-in-class/i.test(c.summary)) warn.push(`${tag}: marketing wording in summary`);
  for (const s of strings(c)) if (s.includes("—")) { bad("em-dash in text"); break; }
  for (const k of ["official_url", "guide_url"]) if (c[k] != null && !(URL_OK(c[k]) || String(c[k]).startsWith("/"))) bad(`${k} is not a URL`);
  if (c.source_urls != null && !(Array.isArray(c.source_urls) && c.source_urls.every(URL_OK))) bad("source_urls must be an array of URLs");
  if (c.founded != null && !(Number.isInteger(c.founded) && c.founded > 1880 && c.founded <= new Date().getFullYear())) bad(`founded must be a plausible year, got ${JSON.stringify(c.founded)}`);
  if (c.photo) {
    const p = c.photo;
    if (!p.thumb || !(URL_OK(p.thumb) || p.thumb.startsWith("/assets/"))) bad("photo.thumb missing or not a URL");
    if (!p.author) bad("photo.author missing");
    if (!p.license) bad("photo.license missing");
    else if (!LICENSE_OK.test(p.license)) bad(`photo licence not free: "${p.license}"`);
  }
}

const per = (k) => Object.entries(items.reduce((a, c) => ((a[c[k]] = (a[c[k]] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ");
console.log(`${items.length} entries, ${new Set(items.map((c) => c.country)).size} countries`);
console.log("per country:", per("country"));
console.log("per type:", per("type"));
console.log("per specialism:", per("specialism"));

if (net) {
  const urls = new Map();
  for (const c of items) for (const [k, u] of [["official_url", c.official_url], ["photo.thumb", c.photo?.thumb]]) if (URL_OK(u) && !urls.has(u)) urls.set(u, `${c.id} ${k}`);
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
      if (/wikimedia\.org/.test(u)) await new Promise((r) => setTimeout(r, 400));
      if (typeof status === "number" && status >= 200 && status < 400) continue;
      if (status === 403 || status === 429) { soft.push(`${tag}: ${status} (probably blocks bots; check in a browser) ${u}`); continue; }
      // Node's fetch weigert een onvolledige certificaatketen; browsers en curl
      // halen het ontbrekende tussencertificaat zelf op, dus de site werkt wel.
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
