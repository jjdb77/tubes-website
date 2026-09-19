// Pagina-indeling van de locatiegids, uit src/_data/filmlocations.json.
//
// Waarom: /compare-film-tv-locations/ zet alle 2.827 locaties in de HTML, maar
// het is EEN URL, en daarmee kan er ook maar een ranken. Wie zoekt doet dat op
// een soort plek in een land ("castles to film in Portugal", "abandoned
// factory location Poland"), en dat is precies een groep uit deze data.
//
// Bewust GEEN pagina per locatie: van de 2.827 hebben er 1.616 alleen een
// zin met de omschrijving en verder niets. Duizenden pagina's met een foto en
// een regel eronder zijn precies de "scaled content abuse" waar we bij de
// bedrijvengids drempels voor hebben ingebouwd. Groepen hebben wel inhoud:
// tientallen echte plekken met foto, streek en bronlink.
//
// Drempels: land- en typepagina's bestaan altijd (het kleinste land heeft er
// 23, het kleinste type 16). Combinaties en streken pas vanaf MIN_COMBO /
// MIN_REGION, anders staat er een pagina met vier kaarten.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "filmlocations.json"), "utf8"));
const incentives = JSON.parse(fs.readFileSync(path.join(dir, "locations.json"), "utf8"));
const companies = JSON.parse(fs.readFileSync(path.join(dir, "mediacompanies.json"), "utf8"));

const MIN_COMBO = 8; // type + land
const MIN_REGION = 12; // streek
const PREVIEW = 8; // kaarten per land op een typepagina

// Geen named export ernaast: Eleventy geeft dan de hele module door
// ({ default, slug }) in plaats van alleen de default.
const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const THE = new Set(["Netherlands", "United Kingdom", "Czech Republic"]);
const withArticle = (c) => (THE.has(c) ? `the ${c}` : c);

// Voor de <title>: elk woord een hoofdletter, behalve de kleine woorden.
// Zonder dit staat er "Castles and estates to Film In".
const SMALL = new Set(["and", "for", "of", "in", "the", "to", "a"]);
const titleCase = (v) =>
  String(v)
    .split(" ")
    .map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

// Per type: de slug (dus de URL), hoe het in een kop heet, en wat er in die
// groep zit. De koppen volgen de zoekvraag, niet onze etiketten: niemand zoekt
// op "Industrial & derelict", wel op "industrial filming locations". De blurb
// zegt wat er echt in de groep zit, zodat de pagina meer is dan een lijst.
const TYPE_LABEL = {
  "Theatre, arena & venue": {
    slug: "theatres-and-venues",
    plural: "Theatres, arenas and venues",
    lower: "theatres, arenas and venues",
    blurb: "Auditoriums, concert halls, opera houses, cinemas, arenas and event spaces, with the backstage, foyers and dressing rooms that come with them.",
  },
  "Industrial & derelict": {
    slug: "industrial-and-derelict",
    plural: "Industrial and derelict locations",
    lower: "industrial and derelict locations",
    blurb: "Factories, warehouses, power stations, mines, depots and abandoned buildings: raw space, hard surfaces and the kind of decay that is impossible to build.",
  },
  "Office, school & public building": {
    slug: "offices-and-public-buildings",
    plural: "Offices, schools and public buildings",
    lower: "offices, schools and public buildings",
    blurb: "Offices, town halls, courtrooms, libraries, universities and schools: the interiors most contemporary drama actually needs.",
  },
  "Transport & infrastructure": {
    slug: "transport-and-infrastructure",
    plural: "Transport and infrastructure",
    lower: "transport and infrastructure locations",
    blurb: "Stations, airports, ports, bridges, tunnels, metro lines and rolling stock, including disused stretches that can be closed off for a shoot.",
  },
  "Studio & backlot": {
    slug: "studios-and-backlots",
    plural: "Film studios and backlots",
    lower: "studios and backlots",
    blurb: "Sound stages, backlots, water tanks and virtual production volumes you can hire, with the crew base and power that go with them.",
  },
  "Hospital, prison & institution": {
    slug: "hospitals-and-prisons",
    plural: "Hospitals, prisons and institutions",
    lower: "hospitals, prisons and institutions",
    blurb: "Working and disused hospitals, clinics, prisons, barracks and asylums: corridors, wards and cells that are close to impossible to fake convincingly.",
  },
  "House & apartment": {
    slug: "houses-and-apartments",
    plural: "Houses and apartments",
    lower: "houses and apartments",
    blurb: "Private houses, villas, apartments and period interiors available for filming, from workers' housing to architect-designed homes.",
  },
  "Hotel & interiors": {
    slug: "hotels",
    plural: "Hotels and interiors",
    lower: "hotels and hotel interiors",
    blurb: "Hotels, spas and their lobbies, ballrooms, bars and corridors, including closed or seasonal properties that can take over a whole unit.",
  },
  "Bar, restaurant & shop": {
    slug: "bars-restaurants-and-shops",
    plural: "Bars, restaurants and shops",
    lower: "bars, restaurants and shops",
    blurb: "Cafes, bars, restaurants, markets, shops and shopping streets, the everyday interiors a schedule eats through quickly.",
  },
  "Castle & estate": {
    slug: "castles-and-estates",
    plural: "Castles and estates",
    lower: "castles and estates",
    blurb: "Castles, fortresses, manor houses and country estates, usually with grounds, outbuildings and period interiors in one place.",
  },
  "Historic town & street": {
    slug: "historic-towns-and-streets",
    plural: "Historic towns and streets",
    lower: "historic towns and streets",
    blurb: "Old towns, squares and streets that can double for a period without dressing out a modern skyline.",
  },
  "Church & monastery": {
    slug: "churches-and-monasteries",
    plural: "Churches and monasteries",
    lower: "churches and monasteries",
    blurb: "Cathedrals, churches, chapels, monasteries and cloisters, plus the crypts and refectories behind them.",
  },
  "Village & countryside": {
    slug: "villages-and-countryside",
    plural: "Villages and countryside",
    lower: "villages and countryside",
    blurb: "Villages, farmland, meadows and rural roads: open country with somewhere to put a unit base.",
  },
  "Modern architecture": {
    slug: "modern-architecture",
    plural: "Modern architecture",
    lower: "modern architecture",
    blurb: "Contemporary buildings with a strong shape: museums, concert halls, campuses, glass towers and brutalist concrete.",
  },
  "Palace & landmark": {
    slug: "palaces-and-landmarks",
    plural: "Palaces and landmarks",
    lower: "palaces and landmarks",
    blurb: "Palaces, state rooms and recognisable landmarks, the places an establishing shot is built around.",
  },
  "Mountains & wilderness": {
    slug: "mountains-and-wilderness",
    plural: "Mountains and wilderness",
    lower: "mountains and wilderness",
    blurb: "Mountains, moors, volcanic ground, glaciers and empty terrain, where access and weather decide the schedule.",
  },
  "Coast & beach": {
    slug: "coast-and-beaches",
    plural: "Coast and beaches",
    lower: "coast and beaches",
    blurb: "Beaches, cliffs, harbours and coastline, including stretches that can be closed off in the off season.",
  },
  "Forest & lake": {
    slug: "forests-and-lakes",
    plural: "Forests and lakes",
    lower: "forests and lakes",
    blurb: "Woodland, forests, lakes and rivers, with the access tracks and permits that shooting in them needs.",
  },
  "City & skyline": {
    slug: "cities-and-skylines",
    plural: "Cities and skylines",
    lower: "cities and skylines",
    blurb: "Skylines, rooftops, viewpoints and city panoramas for establishing shots.",
  },
};

const items = data.locations;

const byGroup = (list, key) => {
  const out = new Map();
  for (const it of list) {
    const k = key(it);
    if (!k) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(it);
  }
  return out;
};

// Locaties met een foto eerst: een pagina die opent met grijze vlakken oogt
// leeg, terwijl de gids voor meer dan de helft wel beeld heeft. Daarbinnen
// alfabetisch, zodat de volgorde niet per build verspringt.
const sortForPage = (list) =>
  [...list].sort((a, b) => Number(Boolean(b.photo?.thumb)) - Number(Boolean(a.photo?.thumb)) || a.name.localeCompare(b.name));

// Hoeveel een groep echt te bieden heeft: telt mee in de samenvattingszin
// boven elke pagina, en houdt ons eerlijk over wat er in de data zit.
const statsOf = (list) => ({
  total: list.length,
  photos: list.filter((l) => l.photo?.thumb).length,
  practical: list.filter((l) => l.capacity || l.facilities || l.price_note || l.logistics || l.permit_needed).length,
  credits: list.filter((l) => l.known_for).length,
});

// Zin als "47 theatres and venues, 42 industrial locations and 255 more":
// de drie grootste soorten met een getal, de rest samengevat. Met de hand in
// de template geschreven werd dit een kluwen van {% if loop.index %}.
const topTypesPhrase = (groups) => {
  const top = groups.slice(0, 3);
  const rest = groups.slice(3).reduce((n, g) => n + g.count, 0);
  const parts = top.map((g) => `${g.count} ${g.lower}`);
  if (rest) parts.push(`${rest} more`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const incentiveByCountry = new Map();
for (const i of incentives.locations || []) {
  if (i.name && !incentiveByCountry.has(i.name)) incentiveByCountry.set(i.name, i);
}

// Aantal bedrijven per land, om naar de bedrijvengids door te kunnen verwijzen.
const companiesPerCountry = new Map();
for (const c of companies.items || []) companiesPerCountry.set(c.country, (companiesPerCountry.get(c.country) || 0) + 1);

const typeInfo = (type) => {
  const t = TYPE_LABEL[type] || { slug: slug(type), plural: type, lower: type.toLowerCase(), blurb: "" };
  return { ...t, pluralTitle: titleCase(t.plural) };
};

const countryUrlOf = (name) => `/film-locations/country/${slug(name)}/`;
const typeUrlOf = (type) => `/film-locations/${typeInfo(type).slug}/`;
const comboUrlOf = (type, country) => `/film-locations/${typeInfo(type).slug}/${slug(country)}/`;
const regionUrlOf = (country, region) => `/film-locations/region/${slug(region)}-${slug(country)}/`;

const countryGroups = byGroup(items, (l) => l.country);
const typeGroups = byGroup(items, (l) => l.type);
const comboGroups = byGroup(items, (l) => `${l.type}|${l.country}`);
const regionGroups = byGroup(items, (l) => (l.region ? `${l.region}|${l.country}` : ""));

const comboCount = new Map([...comboGroups].map(([k, v]) => [k, v.length]));
const regionCount = new Map([...regionGroups].map(([k, v]) => [k, v.length]));
const hasCombo = (type, country) => (comboCount.get(`${type}|${country}`) || 0) >= MIN_COMBO;
const hasRegion = (region, country) => (regionCount.get(`${region}|${country}`) || 0) >= MIN_REGION;

const countries = [...countryGroups.entries()]
  .map(([name, list]) => ({
    name,
    inName: withArticle(name),
    slug: slug(name),
    url: countryUrlOf(name),
    count: list.length,
    stats: statsOf(list),
    locations: sortForPage(list),
    byType: [...byGroup(list, (l) => l.type).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, l]) => ({
        type,
        ...typeInfo(type),
        count: l.length,
        url: hasCombo(type, name) ? comboUrlOf(type, name) : null,
        typeUrl: typeUrlOf(type),
        locations: sortForPage(l),
      })),
    byRegion: [...byGroup(list, (l) => l.region).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([region, l]) => ({ region, count: l.length, url: hasRegion(region, name) ? regionUrlOf(name, region) : null })),
    incentive: incentiveByCountry.get(name) || null,
    companies: companiesPerCountry.get(name) || 0,
  }))
  .map((c) => ({ ...c, typesPhrase: topTypesPhrase(c.byType), topTypes: c.byType.slice(0, 3),
    // Streken met een of twee locaties zijn ruis in een chiprij; die met een
    // eigen pagina horen er altijd in.
    regionChips: c.byRegion.filter((r) => r.url || r.count >= 3),
    regionRest: c.byRegion.filter((r) => !r.url && r.count < 3).length,
  }))
  .sort((a, b) => b.count - a.count);

const types = [...typeGroups.entries()]
  .map(([type, list]) => ({
    type,
    ...typeInfo(type),
    url: typeUrlOf(type),
    count: list.length,
    stats: statsOf(list),
    byCountry: [...byGroup(list, (l) => l.country).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([country, l]) => ({
        country,
        inCountry: withArticle(country),
        slug: slug(country),
        countryUrl: countryUrlOf(country),
        count: l.length,
        url: hasCombo(type, country) ? comboUrlOf(type, country) : null,
        locations: sortForPage(l),
        // De typepagina toont per land een handvol kaarten en linkt door;
        // alle 427 theaters op een pagina zetten heeft niemand iets aan.
        preview: sortForPage(l).slice(0, PREVIEW),
        previewMore: Math.max(0, l.length - PREVIEW),
      })),
  }))
  .sort((a, b) => b.count - a.count);

const typeCountries = [];
for (const t of types) {
  for (const c of t.byCountry) {
    if (!c.url) continue;
    typeCountries.push({
      type: t.type,
      typeSlug: t.slug,
      typePlural: t.plural,
      typePluralTitle: t.pluralTitle,
      typeLower: t.lower,
      typeBlurb: t.blurb,
      typeUrl: t.url,
      country: c.country,
      inCountry: c.inCountry,
      countrySlug: c.slug,
      countryUrl: c.countryUrl,
      url: c.url,
      count: c.count,
      stats: statsOf(c.locations),
      locations: c.locations,
      incentive: incentiveByCountry.get(c.country) || null,
      // Andere landen met genoeg van hetzelfde type: de link waarlangs iemand
      // (en Google) van "castles in Portugal" naar "castles in Spain" loopt.
      siblings: t.byCountry.filter((o) => o.url && o.country !== c.country).slice(0, 12),
      // En de andere soorten plekken in datzelfde land.
      otherTypes: [],
    });
  }
}
const combosByCountry = new Map();
for (const tc of typeCountries) {
  if (!combosByCountry.has(tc.country)) combosByCountry.set(tc.country, []);
  combosByCountry.get(tc.country).push(tc);
}
for (const tc of typeCountries) {
  tc.otherTypes = (combosByCountry.get(tc.country) || [])
    .filter((o) => o.type !== tc.type)
    .map((o) => ({ plural: o.typePlural, url: o.url, count: o.count }))
    .slice(0, 12);
}

const regions = [...regionGroups.entries()]
  .filter(([, list]) => list.length >= MIN_REGION)
  .map(([key, list]) => {
    const [region, country] = key.split("|");
    return {
      region,
      country,
      inCountry: withArticle(country),
      slug: `${slug(region)}-${slug(country)}`,
      url: regionUrlOf(country, region),
      countryUrl: countryUrlOf(country),
      count: list.length,
      stats: statsOf(list),
      locations: sortForPage(list),
      byType: [...byGroup(list, (l) => l.type).entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([type, l]) => ({ type, ...typeInfo(type), count: l.length, url: hasCombo(type, country) ? comboUrlOf(type, country) : typeUrlOf(type) })),
      incentive: incentiveByCountry.get(country) || null,
    };
  })
  .map((r) => ({ ...r, typesPhrase: topTypesPhrase(r.byType) }))
  .sort((a, b) => b.count - a.count);

// Kruimelpaden horen HIER, niet in de front matter van de templates. Een
// genest lijstje in `eleventyComputed` wordt door Eleventy een keer uitgerekend
// en daarna op elke pagina van de reeks herhaald: elke locatiepagina kreeg zo
// het kruimelpad van de eerste ("Theatres, arenas and venues > United
// Kingdom"). Dezelfde oplossing als bij de bedrijven- en softwarepagina's:
// layout.njk zoekt de pagina op URL op en geeft dit pad aan de jsonld-filter.
const HUB = { name: "Film locations", url: "/film-locations/" };
// De pagina zelf hoort er niet in: de jsonld-filter zet die er zelf achter.
const crumbsByUrl = {};
for (const c of countries) crumbsByUrl[c.url] = [HUB];
for (const t of types) crumbsByUrl[t.url] = [HUB];
for (const tc of typeCountries) crumbsByUrl[tc.url] = [HUB, { name: tc.typePlural, url: tc.typeUrl }];
for (const r of regions) crumbsByUrl[r.url] = [HUB, { name: r.country, url: r.countryUrl }];

export default {
  updated: data.updated,
  crumbsByUrl,
  total: items.length,
  stats: statsOf(items),
  countries,
  types,
  typeCountries,
  regions,
  minCombo: MIN_COMBO,
  minRegion: MIN_REGION,
};
