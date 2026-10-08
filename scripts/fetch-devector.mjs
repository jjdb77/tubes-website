// Haalt film- en tv-nieuws op uit De Vector Zakelijk (selectie met de branche
// "Film, tv & mediaproductie") en toont wat nog niet op /news/ staat.
// Het schrijft zelf niets: de kop en samenvatting op de site zijn Engels en in
// eigen woorden, dus kiezen en schrijven blijft handwerk (src/content/headlines).
//
//   DEVECTOR_API_KEY=dv_... node scripts/fetch-devector.mjs [--since 2026-09-24] [--json]
//
// De sleutel hoort nooit in de repo (die is publiek). Zonder --since geldt de
// datum van het nieuwste bericht in src/content/headlines, anders twee weken terug.
import { readdirSync, readFileSync } from "node:fs";

const API = "https://www.devector.nl/api/business/feed.json";
const DIR = new URL("../src/content/headlines/", import.meta.url);

const key = process.env.DEVECTOR_API_KEY;
if (!key) {
  console.error("Zet DEVECTOR_API_KEY (de sleutel van De Vector Zakelijk, Feed & mail > API-sleutel).");
  process.exit(1);
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sinceArg = args[args.indexOf("--since") + 1];

// Wat er al staat: datums en de artikelpaden achter /edition/.
const known = new Set();
let newest = null;
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(new URL(f, DIR), "utf8");
  const link = text.match(/^link:\s*(\S+)/m)?.[1] || "";
  const path = link.match(/\/(?:en\/edition|editie)\/(.+)\.html/)?.[1];
  if (path) known.add(path);
  const date = text.match(/^date:\s*(\S+)/m)?.[1];
  if (date && (!newest || date > newest)) newest = date;
}

const since = sinceArg && !sinceArg.startsWith("--")
  ? sinceArg
  : newest || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);

const url = `${API}?since=${encodeURIComponent(new Date(since).toISOString())}&limit=200`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`De Vector gaf ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const data = await res.json();

const fresh = (data.articles || [])
  .map((a) => {
    const path = a.url.match(/\/editie\/(.+)\.html/)?.[1];
    return { ...a, path, en: path ? `https://www.devector.nl/en/edition/${path}.html` : a.url };
  })
  .filter((a) => !known.has(a.path));

if (asJson) {
  console.log(JSON.stringify(fresh, null, 2));
} else {
  console.log(`${fresh.length} nieuw sinds ${since} (${data.count} in de feed${data.more ? ", er is meer: verklein --since" : ""})\n`);
  for (const a of fresh) {
    console.log(`${a.when.slice(0, 10)}  [${a.section}]  ${a.headline}`);
    console.log(`  ${a.lead}`);
    console.log(`  ${a.en}\n`);
  }
}
