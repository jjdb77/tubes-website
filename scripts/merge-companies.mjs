#!/usr/bin/env node
// Voegt onderzoeksbestanden (JSON-arrays met bedrijven in het formaat van
// docs/company-research-brief.md) samen in src/_data/mediacompanies.json.
//   node scripts/merge-companies.mjs <map-met-json-bestanden> [--dry]
// Overgeslagen: dubbele id's, dubbele namen binnen hetzelfde land (ook tegen
// wat er al staat, met een losse vergelijking op naam zonder rechtsvorm),
// onvolledige records en alles in companies-dropped.json (bewust geschrapt).
import fs from "node:fs";
import path from "node:path";

const OUT = "src/_data/mediacompanies.json";
const DROPPED = "src/_data/companies-dropped.json";
const dir = process.argv[2];
const dry = process.argv.includes("--dry");
if (!dir) { console.error("usage: merge-companies.mjs <dir> [--dry]"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(OUT, "utf8"));
const dropped = fs.existsSync(DROPPED) ? JSON.parse(fs.readFileSync(DROPPED, "utf8")) : [];
const droppedIds = new Set(dropped.map((d) => d.id));
const norm = (s) => String(s || "").toLowerCase()
  .replace(/\b(gmbh|ag|bv|b\.v\.|nv|n\.v\.|ltd|limited|llc|s\.?r\.?l\.?|s\.?a\.?|sas|sarl|sp\. z o\.o\.|s\.r\.o\.|kft|zrt|aps|a\/s|ab|as|oy|d\.o\.o\.|doo|studios?|films?|film|productions?|pictures|media|group|the)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const ids = new Set(data.items.map((i) => i.id));
const names = new Set(data.items.map((i) => `${i.country}|${norm(i.name)}`));
const REQUIRED = ["id", "name", "city", "country", "type", "specialism", "summary", "official_url"];
const FIELDS = ["id", "name", "city", "country", "lat", "lng", "type", "specialism", "summary", "services", "credits", "facilities", "group", "founded", "official_url", "source_urls", "photo"];

let added = 0;
const skipped = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { skipped.push(`${f}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(arr)) { skipped.push(`${f}: not an array`); continue; }
  for (const raw of arr) {
    const tag = `${f} ${raw.id || raw.name || "?"}`;
    if (REQUIRED.some((k) => !raw[k])) { skipped.push(`${tag}: incomplete`); continue; }
    if (droppedIds.has(raw.id)) { skipped.push(`${tag}: in dropped list`); continue; }
    if (ids.has(raw.id)) { skipped.push(`${tag}: duplicate id`); continue; }
    const nk = `${raw.country}|${norm(raw.name)}`;
    if (nk.endsWith("|")) { skipped.push(`${tag}: empty name after normalising`); continue; }
    if (names.has(nk)) { skipped.push(`${tag}: duplicate name in ${raw.country}`); continue; }
    const it = {};
    for (const k of FIELDS) it[k] = raw[k] === undefined ? null : raw[k];
    for (const k of ["services", "credits", "facilities", "group"]) if (typeof it[k] === "string" && !it[k].trim()) it[k] = null;
    if (typeof it.founded === "string" && /^\d{4}$/.test(it.founded)) it.founded = Number(it.founded);
    if (!Array.isArray(it.source_urls) || !it.source_urls.length) it.source_urls = [it.official_url];
    if (it.photo && it.photo.thumb) it.photo.thumb = it.photo.thumb.replace("://thumb.wikimedia.org/", "://upload.wikimedia.org/");
    else it.photo = null;
    for (const k of Object.keys(it)) if (typeof it[k] === "string") it[k] = it[k].replace(/—/g, ",").replace(/\s+,/g, ",").trim();
    data.items.push(it);
    ids.add(it.id); names.add(nk); added++;
  }
}
data.items.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
if (!dry) fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
for (const s of skipped) console.log("skip " + s);
console.log(`${added} added${dry ? " (dry run, nothing written)" : ""}, ${skipped.length} skipped, ${data.items.length} total`);
