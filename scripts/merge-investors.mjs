#!/usr/bin/env node
// Voegt onderzoeksbestanden (JSON-arrays volgens docs/film-investor-research-brief.md)
// samen in src/_data/filminvestors.json.
//   node scripts/merge-investors.mjs <map-met-json-bestanden> [--dry]
// Overgeslagen: dubbele id's en namen, en entries met fouten (zie investor-schema.mjs).
import fs from "node:fs";
import path from "node:path";
import { FIELDS, problems } from "./investor-schema.mjs";

const OUT = "src/_data/filminvestors.json";
const dir = process.argv[2];
const dry = process.argv.includes("--dry");
if (!dir) { console.error("usage: merge-investors.mjs <dir> [--dry]"); process.exit(1); }
const data = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : { updated: "", note: "Only what an organisation publishes itself. Amounts only as published; null means not published.", items: [] };
const norm = (s) => String(s || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const ids = new Set(data.items.map((i) => i.id));
const names = new Set(data.items.map((i) => norm(i.name)));
let added = 0;
const skipped = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { skipped.push(`${f}: invalid JSON (${e.message})`); continue; }
  for (const raw of arr) {
    const it = {};
    for (const k of FIELDS) it[k] = raw[k] === undefined ? null : raw[k];
    for (const k of Object.keys(it)) if (typeof it[k] === "string") { it[k] = it[k].trim(); if (!it[k]) it[k] = null; }
    if (typeof it.founded === "string" && /^\d{4}$/.test(it.founded)) it.founded = Number(it.founded);
    if (!Array.isArray(it.source_urls) || !it.source_urls.length) it.source_urls = [it.official_url];
    const tag = `${f} ${it.id || it.name || "?"}`;
    const p = problems(it);
    if (p.length) { skipped.push(`${tag}: ${p.join(", ")}`); continue; }
    if (ids.has(it.id)) { skipped.push(`${tag}: duplicate id`); continue; }
    if (names.has(norm(it.name))) { skipped.push(`${tag}: duplicate name`); continue; }
    data.items.push(it); ids.add(it.id); names.add(norm(it.name)); added++;
  }
}
data.items.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
data.updated = new Date().toISOString().slice(0, 10);
if (!dry) fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
for (const s of skipped) console.log("skip " + s);
console.log(`${added} added${dry ? " (dry run)" : ""}, ${skipped.length} skipped, ${data.items.length} total`);
