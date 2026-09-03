#!/usr/bin/env node
// Zoekt bij locaties zonder foto een vrije foto op Wikimedia Commons, via het
// Wikipedia-artikel over de plek. Waarom via het artikel en niet via een
// zoekopdracht op Commons: het artikel heeft coördinaten, dus we kunnen
// controleren dat het echt over DEZE plek gaat (hooguit MAX_KM ervandaan).
// Zo komt er geen foto van een gelijknamig gebouw elders in het land op de kaart.
// Alleen vrije licenties (CC0, CC BY, CC BY-SA, publiek domein) worden overgenomen,
// met maker en licentie erbij; niet-vrije bestanden worden overgeslagen.
//
//   node scripts/add-photos.mjs [bestand] [--km 3] [--limit 0] [--dry]
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) || "src/_data/filmlocations.json";
const MAX_KM = Number(args[args.indexOf("--km") + 1]) || 3;
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 0;
const dry = args.includes("--dry");
// Met --out schrijft het script {id, photo}-patches in plaats van het databestand
// zelf. Zo botst een lange fotoronde niet met andere bewerkingen aan de data.
const outIdx = args.indexOf("--out");
const outFile = outIdx > -1 ? args[outIdx + 1] : null;
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const locs = (Array.isArray(raw) ? raw : raw.locations).filter((l) => !l.photo);

const UA = "tubes-locations-guide/1.0 (https://www.tubes.media; free photo lookup)";
const OK_LICENCE = /^(cc0|cc[ -]by([ -]sa)?|public domain|pd[- ]|no restrictions)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => {
  const R = 6371, t = Math.PI / 180;
  const s = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const api = async (host, params) => {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000); }
  }
  return null;
};
const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// Bestanden die nooit een locatiefoto zijn.
const BAD_FILE = /(^|[ _-])(map|karte|mapa|carte|locator|location|coat[ _]of[ _]arms|wappen|escudo|flag|flagge|bandera|logo|seal|emblem|blason|plan|diagram|chart|portrait|stamp)([ _-]|\.)/i;
// Woorden die niets zeggen over welke plek het is.
const WEAK = new Set(["the", "of", "and", "de", "la", "le", "el", "du", "des", "van", "der", "die", "das", "il", "in", "at", "on", "a", "an", "old", "new", "national", "royal", "museum", "centre", "center", "park", "house", "hotel", "station", "theatre", "theater", "castle", "church", "city", "hall", "studio", "studios", "fort", "mine", "bridge", "tower", "factory", "works", "market", "school", "university", "hospital", "prison"]);
const keyWords = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !WEAK.has(w));

// Zoek het Wikipedia-artikel dat bij deze plek hoort. Twee eisen tegen een
// verkeerde foto: de coördinaten van het artikel liggen dicht bij die van de
// locatie, en de titel deelt een kenmerkend woord met de naam (of het artikel
// staat er letterlijk bovenop, minder dan 400 meter).
const findFile = async (loc) => {
  const want = keyWords(loc.name);
  // Woorden die alleen de plaats aanduiden tellen niet als bewijs.
  const place = new Set(keyWords(`${loc.region} ${loc.country}`));
  for (const q of [`${loc.name} ${loc.region}`, `${loc.name} ${loc.country}`, loc.name]) {
    const j = await api("en.wikipedia.org", {
      action: "query", generator: "search", gsrsearch: q, gsrlimit: "5",
      prop: "coordinates|pageprops", ppprop: "page_image_free",
    });
    await sleep(300);
    const pages = j?.query?.pages || [];
    const scored = [];
    for (const p of pages) {
      const c = p.coordinates?.[0];
      const img = p.pageprops?.page_image_free;
      if (!c || !img || BAD_FILE.test(img)) continue;
      const d = km(loc.lat, loc.lng, c.lat, c.lon);
      if (d > MAX_KM) continue;
      // Alle kenmerkende woorden uit de naam moeten in de artikeltitel staan.
      // Alleen de plaatsnaam laten meetellen is niet genoeg: "Kunsthaus Graz"
      // zou dan het artikel "Graz" pakken en een skylinefoto opleveren.
      const title = keyWords(p.title);
      const hit = (w) => title.some((t) => t.startsWith(w) || w.startsWith(t));
      const distinctive = want.filter((w) => !place.has(w));
      const need = distinctive.length ? distinctive : want;
      if (!need.length || !need.every(hit)) continue;
      scored.push({ file: img, article: p.title, distance: Math.round(d * 100) / 100, shared: need.length });
    }
    scored.sort((a, b) => b.shared - a.shared || a.distance - b.distance);
    if (scored.length) return scored[0];
  }
  return null;
};

// Haal licentie, maker en een thumbnail van 960 px op bij Commons.
const fileInfo = async (name) => {
  const j = await api("commons.wikimedia.org", {
    action: "query", titles: `File:${name}`, prop: "imageinfo",
    iiprop: "url|extmetadata", iiurlwidth: "960",
  });
  await sleep(300);
  const info = j?.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const m = info.extmetadata || {};
  const licence = stripHtml(m.LicenseShortName?.value) || stripHtml(m.License?.value);
  const author = stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value);
  if (!licence || !OK_LICENCE.test(licence)) return { rejected: licence || "unknown licence" };
  // De API geeft tegenwoordig thumb.wikimedia.org met trackingparameters terug;
  // die host serveert niets, dus omzetten naar upload.wikimedia.org zonder query.
  const thumb = String(info.thumburl || "").split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/");
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(thumb)) return { rejected: "no thumbnail" };
  return {
    thumb,
    file_page: String(info.descriptionurl || "").split("?")[0],
    author: author.slice(0, 120) || "Wikimedia Commons contributor",
    license: licence,
  };
};

let found = 0, none = 0, rejected = 0;
const patches = [];
const todo = LIMIT ? locs.slice(0, LIMIT) : locs;
console.log(`${todo.length} locations without a photo`);
for (const loc of todo) {
  const hit = await findFile(loc);
  if (!hit) { none++; continue; }
  const info = await fileInfo(hit.file);
  if (!info) { none++; continue; }
  if (info.rejected) { rejected++; console.log(`skip ${loc.id}: ${info.rejected}`); continue; }
  loc.photo = info;
  patches.push({ id: loc.id, photo: info });
  found++;
  console.log(`ok   ${loc.id} <- ${hit.article} (${hit.distance} km) ${info.license}`);
  if (outFile && found % 10 === 0) fs.writeFileSync(outFile, JSON.stringify(patches, null, 1) + "\n");
}
console.log(`found ${found}, nothing suitable ${none}, licence rejected ${rejected}`);
if (!dry && found) {
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(patches, null, 1) + "\n");
  else fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
}
