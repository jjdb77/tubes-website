#!/usr/bin/env node
// Zoekt bij locaties zonder foto een vrije foto op Wikimedia Commons, via het
// Wikipedia-artikel over de plek. Waarom via het artikel en niet via een
// zoekopdracht op Commons: het artikel heeft coördinaten, dus we kunnen
// controleren dat het echt over DEZE plek gaat (hooguit MAX_KM ervandaan).
// Zo komt er geen foto van een gelijknamig gebouw elders in het land op de kaart.
// Alleen vrije licenties (CC0, CC BY, CC BY-SA, publiek domein) worden overgenomen,
// met maker en licentie erbij; niet-vrije bestanden worden overgeslagen.
//
//   node scripts/add-photos.mjs [bestand] [--km 3] [--limit 0] [--offset 0] [--dry]
import fs from "node:fs";

const args = process.argv.slice(2);
// Het eerste losse woord is het bestand, maar de waarde achter --km, --limit,
// --offset of --out is dat niet: zonder deze uitzondering leest het script
// "3" als bestandsnaam zodra je --limit 3 meegeeft.
const TAKES_VALUE = new Set(["--km", "--limit", "--offset", "--out"]);
const file = args.find((a, i) => !a.startsWith("--") && !TAKES_VALUE.has(args[i - 1])) || "src/_data/filmlocations.json";
const MAX_KM = Number(args[args.indexOf("--km") + 1]) || 3;
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 0;
// Met --offset kun je de lijst in blokken verdelen en die naast elkaar draaien.
// Serieel duurt een volle ronde over duizend locaties ruim een uur.
const OFFSET = Number(args[args.indexOf("--offset") + 1]) || 0;
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
// Een tekening is geen foto van de plek: SVG's op Commons zijn logo's, wapens,
// zegels of circuitkaarten. Het universiteitslogo van Santiago en de baankaart
// van MotorLand Aragon kwamen zo als "foto" op een kaart terecht.
const VECTOR = /\.svgz?$/i;
// Woorden die niets zeggen over welke plek het is.
const WEAK = new Set(["the", "of", "and", "de", "la", "le", "el", "du", "des", "van", "der", "die", "das", "il", "in", "at", "on", "a", "an", "old", "new", "national", "royal", "museum", "centre", "center", "park", "house", "hotel", "station", "theatre", "theater", "castle", "church", "city", "hall", "studio", "studios", "fort", "mine", "bridge", "tower", "factory", "works", "market", "school", "university", "hospital", "prison"]);
const keyWords = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !WEAK.has(w));
// Zelfde opsplitsing maar met de gewone woorden erbij, om artikeltitel en
// locatienaam als geheel te kunnen vergelijken.
const allWords = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
// Woorden waarmee een Wikipedia-titel zegt dat het over een plaats gaat.
// Soorten gebouw uit de naam. Die tellen niet mee als kenmerkend woord (anders
// zou "Kunsthaus Graz" op "haus" gaan matchen), maar ze moeten wel terugkomen
// in de artikeltitel: zonder die eis kreeg "Cluj-Napoca City Hall" de foto van
// het theater verderop, omdat alleen de stadsnaam overeenkwam.
const TYPE = new Set(["museum", "centre", "center", "park", "house", "hotel", "station", "theatre", "theater", "castle", "church", "city", "hall", "studio", "studios", "fort", "mine", "bridge", "tower", "factory", "works", "market", "school", "university", "hospital", "prison"]);
// Hoe ver het Wikipedia-artikel van de locatie mag liggen. Een gebouw hoort er
// vrijwel bovenop te staan; een natuurgebied, een haven of een vliegveld is zelf
// kilometers groot, dus daar mag het punt verder weg liggen. Zonder dit verschil
// kreeg "Kraftwerk Zurich" de foto van Kraftwerk Letten, 1,6 km verderop.
const WIDE = new Set(["Mountains & wilderness", "Forest & lake", "Coast & beach", "Village & countryside", "City & skyline", "Historic town & street", "Transport & infrastructure", "Castle & estate"]);
const NEAR_KM = 0.8;
const SETTLEMENT = new Set(["town", "city", "village", "municipality", "commune", "district", "borough", "suburb", "quarter", "stadt", "gemeinde", "ville", "comune", "ciudad", "miasto", "mesto", "obec"]);

// Wikipedia van het land zelf: veel kleinere locaties hebben geen Engels
// artikel, maar wel een Duits, Frans, Tsjechisch of Hongaars.
const WIKI = {
  Austria: "de", Germany: "de", Switzerland: "de", France: "fr", Belgium: "nl", Netherlands: "nl",
  Italy: "it", Spain: "es", Portugal: "pt", Poland: "pl", "Czech Republic": "cs", Hungary: "hu",
  Croatia: "hr", Greece: "el", Denmark: "da", Sweden: "sv", Norway: "no", Finland: "fi", Iceland: "is",
};

// Zoek het Wikipedia-artikel dat bij deze plek hoort. Twee eisen tegen een
// verkeerde foto: de coördinaten van het artikel liggen dicht bij die van de
// locatie, en de titel deelt een kenmerkend woord met de naam (of het artikel
// staat er letterlijk bovenop, minder dan 400 meter).
const findFile = async (loc) => {
  const want = keyWords(loc.name);
  // Woorden die alleen de plaats aanduiden tellen niet als bewijs.
  const place = new Set(keyWords(`${loc.region} ${loc.country}`));
  const hosts = ["en.wikipedia.org"];
  const lang = WIKI[loc.country];
  if (lang) hosts.push(`${lang}.wikipedia.org`);
  const queries = [];
  for (const host of hosts) for (const q of [`${loc.name} ${loc.region}`, `${loc.name} ${loc.country}`, loc.name]) queries.push([host, q]);
  for (const [host, q] of queries) {
    const j = await api(host, {
      action: "query", generator: "search", gsrsearch: q, gsrlimit: "5",
      prop: "coordinates|pageprops", ppprop: "page_image_free",
    });
    await sleep(300);
    const pages = j?.query?.pages || [];
    const scored = [];
    for (const p of pages) {
      const c = p.coordinates?.[0];
      const img = p.pageprops?.page_image_free;
      if (!c || !img || BAD_FILE.test(img) || VECTOR.test(img)) continue;
      const d = km(loc.lat, loc.lng, c.lat, c.lon);
      if (d > (WIDE.has(loc.type) ? MAX_KM : NEAR_KM)) continue;
      // Alle kenmerkende woorden uit de naam moeten in de artikeltitel staan.
      // Alleen de plaatsnaam laten meetellen is niet genoeg: "Kunsthaus Graz"
      // zou dan het artikel "Graz" pakken en een skylinefoto opleveren.
      //
      // Wat achter de komma in een artikeltitel staat is de plaatsaanduiding,
      // niet de naam: zonder die afkapping haalde "Camden Market" het artikel
      // "The Hawley Arms, Camden" binnen, en dat is een cafe.
      const title = keyWords(p.title.split(",")[0]);
      const hit = (w) => title.some((t) => t.startsWith(w) || w.startsWith(t));
      const distinctive = want.filter((w) => !place.has(w));
      // Blijft er niets over dan de plaatsnaam, dan is er niets om op te matchen
      // en levert doorzoeken het artikel over de plaats zelf op: "Cluj-Napoca
      // City Hall" kreeg zo een foto van de stad. Dan liever geen foto.
      if (!distinctive.length || !distinctive.every(hit)) continue;
      // Twee vangnetten tegen het artikel over de plaats in plaats van over het
      // gebouw, want dat levert een skylinefoto op bij een markt of een stadhuis.
      const tWords = allWords(p.title.split(",")[0]);
      const nWords = new Set(allWords(loc.name));
      // 1. De titel noemt zichzelf een plaats en de locatienaam doet dat niet:
      //    "Camden Market" haalde zo het artikel "Camden Town" binnen.
      if (tWords.some((w) => SETTLEMENT.has(w) && !nWords.has(w))) continue;
      // 2. De titel is een kortere versie van de naam, waarbij juist het soort
      //    gebouw wegvalt: "Cluj-Napoca City Hall" kreeg het artikel
      //    "Cluj-Napoca". Een titel die even lang is of iets toevoegt mag wel.
      if (tWords.length < nWords.size && tWords.every((w) => nWords.has(w))) continue;
      // 3. Staat het soort gebouw in de naam, dan hoort de titel dat ook te
      //    noemen. Anders past elk gebouw in dezelfde straat.
      const types = [...nWords].filter((w) => TYPE.has(w));
      if (types.length && !types.some((w) => tWords.some((t) => t.startsWith(w) || w.startsWith(t)))) continue;
      scored.push({ file: img, article: p.title, distance: Math.round(d * 100) / 100, shared: distinctive.length });
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
const todo = locs.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
console.log(`${locs.length} locations without a photo; working on ${todo.length} from position ${OFFSET}`);
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
