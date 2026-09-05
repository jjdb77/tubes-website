#!/usr/bin/env node
// Neemt de studio's uit de locatiegids (src/_data/filmlocations.json, type
// "Studio & backlot") over in de bedrijvenlijst (src/_data/mediacompanies.json)
// als type "Studio". Bestaande entries met hetzelfde `guide_id` worden
// vervangen, zodat je dit na een uitbreiding van de gids gewoon opnieuw draait.
// Handmatig toegevoegde studio's (zonder guide_id) blijven staan.
//   node scripts/studios-from-locations.mjs
import fs from "node:fs";

const GUIDE = "src/_data/filmlocations.json";
const OUT = "src/_data/mediacompanies.json";
const ISO = {
  Austria: "at", Belgium: "be", Bulgaria: "bg", Croatia: "hr", "Czech Republic": "cz", Denmark: "dk",
  Estonia: "ee", Finland: "fi", France: "fr", Germany: "de", Greece: "gr", Hungary: "hu", Iceland: "is",
  Ireland: "ie", Italy: "it", Latvia: "lv", Lithuania: "lt", Luxembourg: "lu", Malta: "mt", Netherlands: "nl",
  Norway: "no", Poland: "pl", Portugal: "pt", Romania: "ro", Serbia: "rs", Slovakia: "sk", Slovenia: "si",
  Spain: "es", Sweden: "se", Switzerland: "ch", "United Kingdom": "uk",
};

const guide = JSON.parse(fs.readFileSync(GUIDE, "utf8")).locations;
const studios = guide.filter((l) => l.type === "Studio & backlot");

const specialism = (l) => {
  const t = [l.name, l.setting, l.facilities, l.suitability].filter(Boolean).join(" ");
  if (/virtual production|LED (volume|wall|stage|screen)|xr stage|in-camera vfx/i.test(t)) return "Virtual production stage";
  if (/scoring stage|recording studio|music recording|synchron stage|orchestra/i.test(t)) return "Sound & music recording";
  if (/\b(tv|television|broadcast)[ -]?(studio|centre|center|production)/i.test(t) && !/sound stage|backlot/i.test(t)) return "TV & broadcast studio";
  return "Sound stages & backlot";
};
// Handmatige correcties op de automatische indeling (de tekst van een studio
// noemt vaak een LED-stage of tv-gebruik terwijl de kern iets anders is) en op
// de stad (reverse geocoding geeft soms een district of graafschap terug).
const OVERRIDE = {
  "at-hq7-studios-wien": { specialism: "Sound stages & backlot" },
  "be-option-media": { type: "Post-production", specialism: "Full-service post" },
  "cz-upp": { type: "Post-production", specialism: "VFX & animation" },
  "dk-nordisk-film-studios-valby": { specialism: "Sound stages & backlot" },
  "fr-provence-studios": { specialism: "Sound stages & backlot" },
  "de-penzing-studios": { specialism: "Sound stages & backlot" },
  "it-cinecitta": { specialism: "Sound stages & backlot" },
  "nl-media-park-hilversum": { specialism: "TV & broadcast studio" },
  "pl-alvernia-studios": { specialism: "Sound stages & backlot" },
  "pl-atm-studio-warsaw": { specialism: "Sound stages & backlot" },
  "pt-valentim-de-carvalho": { specialism: "TV & broadcast studio" },
  "es-banzai-studio": { specialism: "Sound stages & backlot" },
  "es-gran-canaria-platos": { specialism: "Sound stages & backlot" },
  "se-ystad-studios": { specialism: "Sound stages & backlot" },
  "uk-garden-studios": { specialism: "Sound stages & backlot" },
  "uk-mediacity-studios": { specialism: "TV & broadcast studio" },
  "uk-twickenham-studios": { specialism: "Sound stages & backlot" },
  "uk-space-studios-manchester": { specialism: "Sound stages & backlot" },
};
const CITY = {
  "at-grandurfilmstudio-klagenfurt": "Klagenfurt", "es-mini-hollywood-oasys": "Tabernas",
  "dk-filmbyen": "Hvidovre", "gr-kapa-studios": "Spata", "gr-studio-karamanos": "Athens",
  "ie-telegael-studios": "Spiddal", "ie-west-cork-film-studios": "Skibbereen", "fr-tsf-studios-aquitaine": "Bordeaux",
  "uk-belfast-harbour-studios": "Belfast", "uk-black-hangar-studios": "Lasham", "uk-elstree-studios": "Borehamwood",
  "uk-sky-studios-elstree": "Borehamwood", "uk-longcross-studios": "Chertsey", "uk-north-light-film-studios": "Huddersfield",
  "uk-shepperton-studios": "Shepperton", "uk-warner-bros-studios-leavesden": "Leavesden", "uk-dragon-studios": "Llanharan",
  "uk-studio-ulster": "Belfast", "uk-wardpark-studios": "Cumbernauld", "uk-cardington-studios": "Cardington",
};
const city = (l, prev) => {
  const key = Object.keys(CITY).find((k) => l.id.startsWith(k) || k.startsWith(l.id));
  if (key) return CITY[key];
  // Eerder (via reverse geocoding) gevonden stad bewaren; anders de regio uit de gids
  return (prev && prev.city) || l.region || "";
};
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "." : s);
// De gids beschrijft bij `suitability` vaak wat de website van de locatie zegt
// ("Site lists use for ..."). Als dienstenregel op een bedrijfskaart leest dat
// raar, dus deze staan hier met de inhoud maar zonder die aanhef.
const SERVICES = {
  "be-nep-belgium": "TV, film, commercial and event productions, with level-0 warehouse access for loading sets and equipment straight into the studios.",
  "be-option-media": "Parts of the facility are available to rent, with client visits on site, free parking and direct access from the E19 motorway.",
  "be-pixel-kinetics-alliance": "Cinema, television, advertising and digital content shoots, plus LED wall and media-server rental with technical crew for live events.",
  "be-rv-studio": "Television productions, corporate events, fashion shows, theatre rehearsals and cultural events; loading through a 3.9 m by 4 m gate and a 480 kVA high-voltage supply.",
  "jadran-film": "Full-service production base with base camp infrastructure and dressing, makeup and wardrobe rooms around each stage. Studios 4 and 9 are on long-term lease to a television company and a Studio 10 of 2,500 to 3,200 m2 is planned.",
  "nl-fotostudio-vk-pijnacker": "Video clips, fashion films, commercials and interviews, with drive-in access for vehicles and equipment.",
  "nl-nep-netherlands-hilversum": "Turnkey-equipped studios for short-term productions: Studio 22 for large game and entertainment shows, Studio 20 for talk shows and quiz productions.",
  "nl-studio-8-amsterdam": "Car shoots, fashion productions, commercials, video clips and photography, plus greenscreen and on-location filming.",
  "nl-studio-noorderfabriek-amsterdam": "Fashion shoots, e-commerce photography, campaigns, video and podcast production, and corporate events.",
  "pt-algarve-studios": "Equipment rental, production crew (camera operators, cinematographers, drone operators, producers), lighting and casting.",
  "pt-estudio-da-fabrica": "Studio hire for producers, independent filmmakers, photographers, advertising and digital agencies and music video companies; equipment rental covers HD, 4K and 6K cameras, lighting, a Blackmagic ATEM multi-camera system, audio gear and a teleprompter.",
  "pt-valentim-de-carvalho": "Music recording in the soundproofed Studio 1, and national TV broadcasts including the RTP Festival da Cancao.",
  "pt-moviebox-studios-algarve": "Exclusive-use warehouse and stage space plus about 20,000 sq ft of workshop and ancillary space for prop storage and construction, with a concrete hardstanding for builds, parking and VFX work.",
};

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { updated: "", note: "", items: [] };
// Een studio die eerder met de hand is toegevoegd en later ook in de gids
// belandt, zou dubbel komen te staan. De gids wint (die heeft de locatiegegevens
// en de link terug), dus zo'n handmatige entry valt hier af.
const norm = (s) => String(s || "").toLowerCase()
  .replace(/\b(gmbh|ag|bv|nv|ltd|limited|llc|sro|s r o|kft|zrt|aps|a\/s|ab|as|oy|d o o|doo|studios?|films?|film|productions?|pictures|media|group|the)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const fromGuideKeys = new Set(studios.flatMap((l) => {
  const iso = ISO[l.country] || "xx";
  return [`${iso}-${l.id.replace(/^[a-z]{2}-/, "")}`, `${l.country}|${norm(l.name)}`];
}));
// Zo'n handmatige entry gaat niet verloren: wat de gids niet weet (diensten,
// credits, oprichtingsjaar, moederbedrijf) wordt hieronder overgenomen.
const absorbed = new Map();
const keep = existing.items.filter((it) => {
  if (it.guide_id) return false;
  for (const k of [it.id, `${it.country}|${norm(it.name)}`]) {
    if (fromGuideKeys.has(k)) { absorbed.set(k, it); return false; }
  }
  return true;
});
const prevByGuide = Object.fromEntries(existing.items.filter((it) => it.guide_id).map((it) => [it.guide_id, it]));
const fromGuide = studios.map((l) => {
  const iso = ISO[l.country] || "xx";
  const slug = l.id.replace(/^[a-z]{2}-/, "");
  const prev = prevByGuide[l.id];
  const o = OVERRIDE[l.id] || {};
  const had = absorbed.get(`${iso}-${slug}`) || absorbed.get(`${l.country}|${norm(l.name)}`) || {};
  return {
    id: `${iso}-${slug}`,
    name: l.name,
    city: city(l, prev),
    country: l.country,
    lat: l.lat,
    lng: l.lng,
    type: o.type || "Studio",
    specialism: o.specialism || specialism(l),
    summary: clip(l.setting, 220),
    services: SERVICES[l.id] || l.suitability || had.services || null,
    credits: l.known_for || had.credits || null,
    facilities: l.facilities || had.facilities || null,
    group: had.group || null,
    founded: had.founded || null,
    official_url: l.official_url,
    source_urls: l.source_urls || [l.official_url],
    photo: l.photo || null,
    guide_id: l.id,
    guide_url: `/compare-film-tv-locations/#loc-${l.id}`,
  };
});
const items = [...keep, ...fromGuide].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
const out = {
  updated: existing.updated || new Date().toISOString().slice(0, 10),
  note: existing.note || "Only what a company publishes itself (or Wikipedia states). Summaries in our own words; credits, facilities and founding years only as published, otherwise null. Studios marked with guide_id come from the locations guide and are refreshed by scripts/studios-from-locations.mjs.",
  items,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const spec = {};
for (const s of fromGuide) spec[s.specialism] = (spec[s.specialism] || 0) + 1;
console.log(`${fromGuide.length} studios from the guide, ${keep.length} kept, ${items.length} total`);
if (absorbed.size) console.log(`absorbed into the guide entry: ${[...absorbed.values()].map((i) => i.id).join(", ")}`);
console.log(spec);
