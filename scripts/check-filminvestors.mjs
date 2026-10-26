#!/usr/bin/env node
// Controleert src/_data/filminvestors.json: velden, vaste lijsten, coördinaten,
// leestekens; met --net ook of elke officiële site en bron laadt.
//   node scripts/check-filminvestors.mjs [bestand] [--net]
import fs from "node:fs";
import { problems } from "./investor-schema.mjs";

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) || "src/_data/filminvestors.json";
const net = process.argv.includes("--net");
const { items } = JSON.parse(fs.readFileSync(file, "utf8"));
let bad = 0;
const ids = new Set();
for (const it of items) {
  const p = problems(it);
  if (ids.has(it.id)) p.push("duplicate id");
  ids.add(it.id);
  if (p.length) { bad++; console.log(`${it.id}: ${p.join(", ")}`); }
}
if (net) {
  // Een server die de verbinding halverwege sluit mag de controle niet laten crashen.
  process.on("uncaughtException", (e) => console.log(`note ${e.code || e.name} (connection closed)`));
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
  const urls = [...new Set(items.flatMap((it) => [it.official_url, ...(it.source_urls || [])]))];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
        r.body?.cancel().catch(() => {});
        if (r.status >= 400) console.log(`${r.status === 403 || r.status === 429 ? "note" : "error"} ${r.status} ${u}`);
      } catch (e) { console.log(`note ${e.cause?.code || e.name} ${u}`); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}
console.log(`${items.length} entries, ${bad} with problems`);
