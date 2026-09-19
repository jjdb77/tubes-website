#!/usr/bin/env node
// Voegt onderzoeksbestanden (JSON-arrays met producten in het formaat van
// docs/software-research-brief.md) samen in src/_data/mediasoftware.json.
//   node scripts/merge-software.mjs <map-met-json-bestanden> [--dry]
// Overgeslagen: dubbele id's, dubbele namen (ook tegen wat er al staat),
// onvolledige records en alles in software-dropped.json (bewust geschrapt).
// De volgorde in het bestand blijft die van `order_note`: per categorie in de
// bestaande volgorde, alfabetisch daarbinnen (de site sorteert zelf, dit is
// alleen voor wie het bestand of het CMS leest).
import fs from "node:fs";
import path from "node:path";

const OUT = "src/_data/mediasoftware.json";
const DROPPED = "src/_data/software-dropped.json";
const dir = process.argv[2];
const dry = process.argv.includes("--dry");
if (!dir) { console.error("usage: merge-software.mjs <dir> [--dry]"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(OUT, "utf8"));
const dropped = fs.existsSync(DROPPED) ? JSON.parse(fs.readFileSync(DROPPED, "utf8")) : [];
const droppedIds = new Set(dropped.map((d) => d.id));
const norm = (s) => String(s || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const ids = new Set(data.items.map((i) => i.id));
const names = new Set(data.items.map((i) => norm(i.name)));
const REQUIRED = ["id", "name", "vendor", "vendor_country", "category", "summary", "pricing_model", "official_url"];
const FIELDS = ["id", "name", "vendor", "vendor_country", "category", "also_in", "summary", "for_whom", "pricing_model", "deployment", "platforms", "integrations", "founded", "official_url", "source_urls", "logo", "photo"];
// Volgorde van de categorieën zoals ze nu in het bestand staan.
const ORDER = [...new Set(data.items.map((i) => i.category))];

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
    const nk = norm(raw.name);
    if (!nk) { skipped.push(`${tag}: empty name after normalising`); continue; }
    if (names.has(nk)) { skipped.push(`${tag}: duplicate name`); continue; }
    const it = {};
    for (const k of FIELDS) it[k] = raw[k] === undefined ? null : raw[k];
    if (!Array.isArray(it.also_in) || !it.also_in.length) delete it.also_in;
    // Een agent levert platforms of integraties soms als array aan; Nunjucks
    // plakt die zonder spatie aan elkaar, dus hier meteen als tekst wegschrijven.
    for (const k of ["for_whom", "platforms", "integrations", "summary"]) {
      if (Array.isArray(it[k])) it[k] = it[k].join(", ");
      if (typeof it[k] === "string" && !it[k].trim()) it[k] = null;
    }
    if (typeof it.founded === "string" && /^\d{4}$/.test(it.founded)) it.founded = Number(it.founded);
    if (!Array.isArray(it.source_urls) || !it.source_urls.length) it.source_urls = [it.official_url];
    it.logo = null; it.photo = null;
    for (const k of Object.keys(it)) if (typeof it[k] === "string") it[k] = it[k].replace(/—/g, ",").replace(/\s+,/g, ",").trim();
    data.items.push(it);
    ids.add(it.id); names.add(nk); added++;
  }
}
const rank = (c) => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
data.items.sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
if (!dry) fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
for (const s of skipped) console.log("skip " + s);
console.log(`${added} added${dry ? " (dry run, nothing written)" : ""}, ${skipped.length} skipped, ${data.items.length} total`);
