// Haalt film- en tv-nieuws op uit De Vector Zakelijk (selectie met de branche
// "Film, tv & mediaproductie") en toont wat nog niet op /news/ staat.
// Het schrijft zelf niets: de kop en samenvatting op de site zijn Engels en in
// eigen woorden, dus kiezen en schrijven blijft handwerk (src/content/headlines,
// met de oorspronkelijke bronnen onder `sources` en de De Vector-link als `via`).
//
//   DEVECTOR_API_KEY=dv_... node scripts/fetch-devector.mjs [--since 2026-09-24] [--json]
//   (of zet de sleutel in .devector-key in de hoofdmap)
//   node scripts/fetch-devector.mjs --site [--since 2026-10-08] [--json]
//
// De sleutel hoort nooit in de repo (die is publiek). Zonder --since geldt de
// datum van het nieuwste bericht in src/content/headlines, anders twee weken terug.
// Met --site (of zonder sleutel) leest het script de openbare editiepagina's
// (/editie/<datum>/) en neemt het de rubrieken Film en Media; zo werkt de
// geplande taak zonder sleutel. Die rubrieken zijn breder dan de branche-selectie
// van de feed (ook overlijdens, radio, persvrijheid), dus kiezen blijft nodig.
import { readdirSync, readFileSync, existsSync } from "node:fs";

const API = "https://www.devector.nl/api/business/feed.json";
const DIR = new URL("../src/content/headlines/", import.meta.url);

// Sleutel uit de omgeving, anders uit .devector-key in de hoofdmap (staat in
// .gitignore, dus nooit in de publieke repo).
const keyFile = new URL("../.devector-key", import.meta.url);
const key = process.env.DEVECTOR_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
const args = process.argv.slice(2);
const fromSite = args.includes("--site") || !key;
const asJson = args.includes("--json");
const sinceArg = args[args.indexOf("--since") + 1];

// Sleutel van een artikel: "<datum>/<slug>" voor de dagelijkse editie,
// "film-tv/<datum>/<slug>" voor het vakblad (/bladen/film-tv/, in de feed
// "Screen & Broadcast"), in welke taal de link ook staat.
function pathOf(link) {
  const blad = link.match(/\/bladen\/([^/]+)\/(?:[a-z]{2}\/)?(\d{4}-\d{2}-\d{2}\/[^/]+)\.html/);
  if (blad) return `${blad[1]}/${blad[2]}`;
  return link.match(/\/(?:en\/edition|editie)\/(.+)\.html/)?.[1];
}
// Engelse versie: /en/edition/... of /bladen/<blad>/en/...
function enOf(link, path) {
  const blad = link.match(/\/bladen\/([^/]+)\//);
  if (blad) return `https://www.devector.nl/bladen/${blad[1]}/en/${path.slice(blad[1].length + 1)}.html`;
  return path ? `https://www.devector.nl/en/edition/${path}.html` : link;
}

// Wat er al staat: datums en de artikelpaden.
const known = new Set();
let newest = null;
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(new URL(f, DIR), "utf8");
  const link = text.match(/^(?:via|link):\s*(\S+)/m)?.[1] || "";
  const path = pathOf(link);
  if (path) known.add(path);
  const date = text.match(/^date:\s*(\S+)/m)?.[1];
  if (date && (!newest || date > newest)) newest = date;
}

// Bewust overgeslagen stukken (scripts/devector-skipped.txt, "pad  # reden"):
// die komen niet terug in de lijst.
const skipFile = new URL("./devector-skipped.txt", import.meta.url);
if (existsSync(skipFile)) {
  for (const line of readFileSync(skipFile, "utf8").split("\n")) {
    const p = line.split("#")[0].trim();
    if (p) known.add(p);
  }
}

const since = sinceArg && !sinceArg.startsWith("--")
  ? sinceArg
  : newest || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);

// Openbare editiepagina's: per dag de stukken in de rubrieken Film en Media.
async function fromEditions(since) {
  const out = [];
  const decode = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim();
  for (let d = new Date(since); d <= new Date(); d = new Date(+d + 864e5)) {
    const day = d.toISOString().slice(0, 10);
    const res = await fetch(`https://www.devector.nl/editie/${day}/`, { headers: { "User-Agent": "Mozilla/5.0 (Tubes news)" } });
    if (!res.ok) continue;
    const html = await res.text();
    const seen = new Set();
    for (const m of html.matchAll(/<[^>]*data-section="(Film|Media)"[^>]*>/g)) {
      const chunk = html.slice(m.index, m.index + 2000);
      const href = chunk.match(/href="(?:[^"]*\/)?([^"/]+)\.html"/)?.[1];
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const heads = [...chunk.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((h) => decode(h[1])).filter((h) => h && h !== m[1]);
      const path = `${day}/${href}`;
      out.push({ when: day, section: m[1], headline: heads[0] || href, lead: "", path, en: `https://www.devector.nl/en/edition/${path}.html` });
    }
  }
  // Het vakblad Screen & Broadcast heeft geen dagpagina's; de index toont de
  // laatste weken, per stuk een rubriek en een link "<datum>/<slug>.html".
  const res = await fetch("https://www.devector.nl/bladen/film-tv/", { headers: { "User-Agent": "Mozilla/5.0 (Tubes news)" } });
  if (res.ok) {
    const html = await res.text();
    const seen = new Set();
    for (const m of html.matchAll(/(?:<span class="bl-kicker">([^<]*)<\/span>\s*)?<a href="(?:[^"]*\/)?(\d{4}-\d{2}-\d{2})\/([^"/]+)\.html"[^>]*>([\s\S]*?)<\/a>/g)) {
      const [, kicker, day, slug, text] = m;
      const path = `film-tv/${day}/${slug}`;
      if (day < since || seen.has(path) || !decode(text)) continue;
      seen.add(path);
      out.push({ when: day, section: `Screen & Broadcast${kicker ? " · " + decode(kicker) : ""}`, headline: decode(text), lead: "", path, en: `https://www.devector.nl/bladen/film-tv/en/${day}/${slug}.html` });
    }
  }
  return out.sort((a, b) => (a.when < b.when ? 1 : -1));
}

if (fromSite) {
  const fresh = (await fromEditions(since)).filter((a) => !known.has(a.path));
  if (asJson) console.log(JSON.stringify(fresh, null, 2));
  else {
    console.log(`${fresh.length} nieuw in Film/Media en Screen & Broadcast sinds ${since} (openbare pagina's)\n`);
    for (const a of fresh) console.log(`${a.when}  [${a.section}]  ${a.headline}\n  ${a.en}\n`);
  }
  process.exit(0);
}

const url = `${API}?since=${encodeURIComponent(new Date(since).toISOString())}&limit=200`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`De Vector gaf ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const data = await res.json();

const fresh = (data.articles || [])
  .map((a) => {
    const path = pathOf(a.url);
    return { ...a, path, en: enOf(a.url, path) };
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
