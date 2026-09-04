// Voegt onderzoeksbestanden samen met src/_data/filmlocations.json.
//   node scripts/merge-locations.mjs <repo-pad> <map-met-json-bestanden> [--dry]
// Bestanden die "enrich-" heten of studios-patch.json zijn PATCHES ({id, veld...});
// de rest zijn hele locaties. Dubbele id's en namen worden overgeslagen, en
// locations-dropped.json (naast de map) houdt bewust geschrapte locaties weg.
import fs from "node:fs";
import path from "node:path";

const [repo, outDir, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry");
const file = path.join(repo, "src/_data/filmlocations.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ORDER = ["id","name","country","region","lat","lng","type","setting","known_for","price_note","price_eur_day","capacity","facilities","suitability","permit_needed","logistics","source_urls","url","official_url","commission_url","photo"];
const clean = (l) => {
  const o = {};
  for (const k of ORDER) {
    let v = l[k];
    if (v == null) continue;
    if (typeof v === "string") { v = v.replace(/\s+/g, " ").trim(); if (!v) continue; }
    if (Array.isArray(v)) { v = v.map((x) => typeof x === "string" ? x.trim() : (x && x.url) || "").filter(Boolean); if (!v.length) continue; }
    if (k === "lat" || k === "lng") v = Math.round(Number(v) * 10000) / 10000;
    if (k === "photo") {
      if (!v.thumb) continue;
      // Agents schrijven soms thumb.wikimedia.org of upload.wikimedia.org/.../commons/x/xx/Naam.jpg
      // zonder /thumb/; de eerste host bestaat niet, de tweede is het origineel (te groot).
      let t = String(v.thumb).replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/");
      v = { thumb: t, file_page: v.file_page, author: String(v.author || "").replace(/<[^>]+>/g, "").trim(), license: v.license };
    }
    o[k] = v;
  }
  return o;
};
// Bewust geschrapte locaties (zie dropped.json): overslaan en verwijderen als ze
// er nog in staan, anders zet de volgende samenvoeging ze zo weer terug.
let DROP = {};
try { DROP = JSON.parse(fs.readFileSync(path.join(repo, "src/_data/locations-dropped.json"), "utf8")).ids || {}; } catch {}
const dropped = data.locations.filter((l) => DROP[l.id]).map((l) => l.id);
if (dropped.length) { data.locations = data.locations.filter((l) => !DROP[l.id]); console.log("removed again:", dropped.join(", ")); }
const byId = new Map(data.locations.map((l) => [l.id, l]));
const nameKey = (l) => `${l.country}|${String(l.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
const names = new Set(data.locations.map(nameKey));
let added = 0, skippedDup = 0, patched = 0;
for (const f of fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort()) {
  const arr = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
  // Patchbestanden bevatten {id, veld...} en geen hele locaties.
  if (f === "studios-patch.json" || f.startsWith("enrich-")) {
    for (const p of arr) {
      const t = byId.get(p.id); if (!t) { console.log("patch: unknown id", p.id); continue; }
      // source_urls samenvoegen in plaats van overschrijven: de patch voegt de
      // pagina's toe waar de praktische feiten vandaan komen.
      const merged = { ...t, ...p };
      if (t.source_urls || p.source_urls) merged.source_urls = [...new Set([...(t.source_urls || []), ...(p.source_urls || [])])];
      const c = clean(merged); Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, c); patched++;
    }
    continue;
  }
  for (const l of arr) {
    const c = clean(l);
    // Agents schrijven tussentijds weg; zo'n bestand kan halve entries bevatten.
    // Die overslaan in plaats van erop stuklopen.
    if (!c.id || !c.name || !c.country || typeof c.lat !== "number" || typeof c.lng !== "number") {
      console.log(`incomplete, skipped (${f}): ${c.id || c.name || "(no id)"}`);
      continue;
    }
    if (DROP[c.id]) { console.log(`dropped on purpose (${f}): ${c.id} ${DROP[c.id]}`); continue; }
    if (byId.has(c.id) || names.has(nameKey(c))) { skippedDup++; console.log(`dup skipped (${f}): ${c.id} ${c.name}`); continue; }
    byId.set(c.id, c); names.add(nameKey(c)); data.locations.push(c); added++;
  }
  console.log(`${f}: ${arr.length} entries`);
}
data.locations.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
data.updated = "2026-09-03";
console.log(`added ${added}, skipped ${skippedDup} duplicates, patched ${patched} studios, total ${data.locations.length}`);
if (!dry) fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
