// Neemt een artikel van De Vector volledig over in src/content/headlines/<slug>.md:
// tekst, foto (met maker en licentie), perspectieven, fact check, noot en bronnen.
//
//   node scripts/import-devector.mjs <slug> [https://www.devector.nl/en/edition/...html]
//
// Zonder URL wordt `via` uit het bestaande bericht gebruikt. Wat wij zelf schrijven
// blijft staan: title, date, topic en summary (de kaart op /news/, die wel in Google
// staat). De artikelpagina zelf heeft noindex (headlines.11tydata.js), want de tekst
// staat ook op De Vector.
//
// Bewust weggelaten: de byline met de naam van de AI-schrijver, "written with
// ChatGPT", de reactieknop, advertenties en "More on this in Dutch media". De fact
// check krijgt op de pagina één regel "Automated fact check", zodat niemand denkt
// dat een mens het heeft nagelopen.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [slug, urlArg] = process.argv.slice(2);
if (!slug) {
  console.error("Gebruik: node scripts/import-devector.mjs <slug> [url]");
  process.exit(1);
}
const file = new URL(`../src/content/headlines/${slug}.md`, import.meta.url);

// Bestaand bericht: front matter (JSON-waarden of kale tekst per regel) en body.
const old = {};
if (existsSync(file)) {
  const text = readFileSync(file, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)[1];
  for (const key of ["title", "date", "topic", "summary", "via"]) {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    if (m) old[key] = m[1].trim().startsWith('"') ? JSON.parse(m[1]) : m[1].trim();
  }
}
const url = urlArg || old.via;
if (!url) {
  console.error("Geen URL: geef hem mee of zet `via` in het bericht.");
  process.exit(1);
}

const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Tubes import)" } });
if (!res.ok) {
  console.error(`De Vector gaf ${res.status} voor ${url}`);
  process.exit(1);
}
const html = await res.text();
const art = html.slice(html.indexOf("<article"), html.indexOf("</article>"));

const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
// Huisregel: geen em-dashes in teksten op de site.
const noDash = (s) => s.replace(/\s*—\s*/g, ", ");
const pick = (re, s = art) => s.match(re)?.[1];

const headline = strip(pick(/<h2>([\s\S]*?)<\/h2>/) || "");
const standfirst = noDash(strip(pick(/<p class="sub">([\s\S]*?)<\/p>/) || ""));

// Foto: thumb.wikimedia.org laadt niet, upload.wikimedia.org wel; 960px is genoeg.
let photo = null;
const fig = pick(/<figure class="photo">([\s\S]*?)<\/figure>/);
if (fig) {
  let src = pick(/<img src="([^"]+)"/, fig) || "";
  src = src.replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/").replace(/\/\d+px-([^/]+)$/, "/960px-$1");
  const credit = fig.match(/<a href="([^"]+)"[^>]*>Photo: ([^<]+)<\/a>/);
  const license = fig.match(/<a href="([^"]+)" rel="license[^"]*">([^<]+)<\/a>/);
  photo = {
    src,
    alt: decode(pick(/alt="([^"]*)"/, fig) || ""),
    caption: strip(pick(/<span class="cap">([\s\S]*?)<\/span>/, fig) || ""),
    credit: credit ? decode(credit[2]).trim() : "",
    credit_url: credit ? credit[1] : "",
    license: license ? license[2] : "",
    license_url: license ? license[1] : "",
  };
}

// Lopende tekst: de lead en de gewone alinea's tot de reactieknop of de fact check.
const bodyEnd = Math.min(...[art.indexOf('<section class="perspectives"'), art.indexOf('<p class="art-fb"'), art.indexOf('<section class="factcheck')].filter((i) => i > 0));
const bodyHtml = art.slice(0, bodyEnd);
const paragraphs = [...bodyHtml.matchAll(/<p( class="lead")?>([\s\S]*?)<\/p>/g)].map((m) => noDash(strip(m[2])));

// Perspectieven: vaststaande feiten plus links/midden/rechts.
let perspectives = null;
const persp = pick(/<section class="perspectives">([\s\S]*?)<\/section>/);
if (persp) {
  const facts = [...(pick(/<div class="facts">([\s\S]*?)<\/div>/, persp) || "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => noDash(strip(m[1])));
  const views = [...persp.matchAll(/<div class="view [^"]*"><h6>([^<]+)<\/h6>([\s\S]*?)<\/div>/g)].map((m) => {
    const parts = {};
    for (const p of m[2].matchAll(/<p><b>([^<]+)<\/b>([\s\S]*?)<\/p>/g)) parts[p[1].trim().toLowerCase()] = noDash(strip(p[2]));
    return { name: m[1].trim(), ...parts };
  });
  const disclaimer = noDash(strip(pick(/<p class="disclaimer">([\s\S]*?)<\/p>/, persp) || ""));
  perspectives = { facts, views, disclaimer };
}

// Fact check: oordeel, samenvatting en per bewering status, toelichting en bron.
let factcheck = null;
const fc = pick(/<section class="factcheck[^"]*">([\s\S]*?)<\/section>/);
if (fc) {
  const claims = [...fc.matchAll(/<li class="claim-[^"]*"><span class="status">([^<]+)<\/span>([\s\S]*?)(?:<span class="note">([\s\S]*?)<\/span>)?\s*(?:<a href="([^"]+)"[^>]*>source<\/a>)?<\/li>/g)].map((m) => ({
    status: m[1].trim(),
    text: noDash(strip(m[2])),
    note: m[3] ? strip(m[3]).replace(/^—\s*/, "") : "",
    url: m[4] || "",
  }));
  factcheck = {
    verdict: strip(pick(/<span class="verdict">([^<]+)<\/span>/, fc) || ""),
    summary: noDash(strip(pick(/<p class="summary">([\s\S]*?)<\/p>/, fc) || "")),
    claims: claims.map((c) => ({ ...c, note: noDash(c.note) })),
  };
}

// Noot van de redactie en de bronnenlijst (titel, uitgever, link).
const editorNote = noDash(strip((art.match(/<div class="box"><h5>Editor's note<\/h5>([\s\S]*?)<\/div>/) || [])[1] || ""));
const sourcesBox = (art.match(/<div class="box"><h5>Sources<\/h5>([\s\S]*?)<\/div>/) || [])[1] || "";
const sources = [...sourcesBox.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*(?:<span class="pub">([\s\S]*?)<\/span>)?/g)].map((m) => ({
  name: noDash(strip(m[2])),
  publisher: m[3] ? strip(m[3]).replace(/^—\s*/, "") : "",
  url: m[1],
}));

if (!paragraphs.length) {
  console.error("Geen artikeltekst gevonden; is de opmaak van De Vector veranderd?");
  process.exit(1);
}

// Front matter als JSON-waarden: geldige YAML en geen gedoe met aanhalingstekens.
const fmData = {
  title: old.title || headline,
  date: old.date,
  topic: old.topic || "Business",
  summary: old.summary || standfirst,
  headline,
  standfirst,
  photo,
  perspectives,
  factcheck,
  editor_note: editorNote || null,
  sources,
  via: url,
};
const lines = ["---"];
for (const [k, v] of Object.entries(fmData)) {
  if (v === undefined || v === null) continue;
  lines.push(k === "date" ? `date: ${v}` : `${k}: ${JSON.stringify(v)}`);
}
lines.push("---", paragraphs.join("\n\n"), "");
writeFileSync(file, lines.join("\n"));
console.log(`${slug}: ${paragraphs.length} alinea's, foto ${photo ? "ja" : "nee"}, perspectieven ${perspectives ? "ja" : "nee"}, fact check ${factcheck ? factcheck.claims.length + " beweringen" : "nee"}, ${sources.length} bronnen`);
