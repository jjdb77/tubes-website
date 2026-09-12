// Bouwt de pagina-indeling van de bedrijvengids uit src/_data/mediacompanies.json.
//
// Waarom: de zoekpagina /compare-media-production-companies/ zet alle bedrijven
// wel in de HTML (Google ziet ze dus), maar het is EEN URL. Daarmee kan er ook
// maar een pagina ranken, terwijl het profiel van elk bedrijf (diensten,
// credits, faciliteiten) juist is waar mensen op zoeken. Daarom krijgt elk
// bedrijf hier een eigen pagina, plus land-, stad- en typepagina's.
//
// Drempels: een overzichtspagina met een of twee bedrijven is te dun om te laten
// indexeren, dus die maken we niet. Land- en typepagina's bestaan altijd (elk
// land heeft er minstens vier), combinaties en steden pas vanaf MIN_COMBO.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "mediacompanies.json"), "utf8"));
const incentives = JSON.parse(fs.readFileSync(path.join(dir, "locations.json"), "utf8"));

const MIN_COMBO = 4; // type + land
const MIN_CITY = 5; // stad

// Geen named export ernaast: Eleventy geeft dan de hele module door
// ({ default, slug }) in plaats van alleen de default, en de pagina's krijgen
// niets te zien.
const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// "in Netherlands" leest fout; deze landen krijgen een lidwoord.
const THE = new Set(["Netherlands", "United Kingdom", "Czech Republic"]);
const withArticle = (c) => (THE.has(c) ? `the ${c}` : c);

const TYPE_LABEL = {
  Studio: { plural: "Studios", slug: "studios", blurb: "Sound stages, backlots, virtual production volumes, TV studios and scoring stages you can hire." },
  "Production company": { plural: "Production companies", slug: "production-companies", blurb: "Companies that develop and produce film, series, documentaries, commercials, animation and entertainment, or service foreign shoots." },
  "Post-production": { plural: "Post-production companies", slug: "post-production", blurb: "Editing, colour grading, finishing, VFX, animation, sound post, dubbing and full-service post houses." },
};

const items = data.items;
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
const sortByName = (a, b) => a.name.localeCompare(b.name);

// Incentive per land, gekoppeld op landnaam, zodat een bedrijfspagina kan zeggen
// wat er in dat land te halen valt zonder de cijfers hier te herhalen.
const incentiveByCountry = new Map();
for (const i of incentives.locations || incentives.items || []) {
  if (i.name && !incentiveByCountry.has(i.name)) incentiveByCountry.set(i.name, i);
}

const countries = [...byGroup(items, (i) => i.country).entries()]
  .map(([name, list]) => ({
    name,
    inName: withArticle(name),
    slug: slug(name),
    url: `/companies/country/${slug(name)}/`,
    count: list.length,
    companies: [...list].sort(sortByName),
    byType: [...byGroup(list, (i) => i.type).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, l]) => ({ type, label: TYPE_LABEL[type], count: l.length, companies: [...l].sort(sortByName) })),
    incentive: incentiveByCountry.get(name) || null,
  }))
  .sort((a, b) => b.count - a.count);

const types = [...byGroup(items, (i) => i.type).entries()]
  .map(([type, list]) => ({
    type,
    ...TYPE_LABEL[type],
    url: `/companies/${TYPE_LABEL[type].slug}/`,
    count: list.length,
    companies: [...list].sort(sortByName),
    byCountry: [...byGroup(list, (i) => i.country).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([country, l]) => ({ country, inCountry: withArticle(country), slug: slug(country), count: l.length, companies: [...l].sort(sortByName) })),
    bySpecialism: [...byGroup(list, (i) => i.specialism).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([specialism, l]) => ({ specialism, count: l.length })),
  }))
  .sort((a, b) => b.count - a.count);

const typeCountries = [];
for (const t of types) {
  for (const c of t.byCountry) {
    if (c.count < MIN_COMBO) continue;
    typeCountries.push({
      type: t.type,
      label: t.plural,
      typeSlug: t.slug,
      typeUrl: t.url,
      country: c.country,
      inCountry: c.inCountry,
      countrySlug: c.slug,
      countryUrl: `/companies/country/${c.slug}/`,
      url: `/companies/${t.slug}/${c.slug}/`,
      count: c.count,
      companies: c.companies,
    });
  }
}

const cities = [...byGroup(items, (i) => `${i.city}|${i.country}`).entries()]
  .filter(([, list]) => list.length >= MIN_CITY)
  .map(([key, list]) => {
    const [city, country] = key.split("|");
    return {
      city,
      country,
      inCountry: withArticle(country),
      slug: `${slug(city)}-${slug(country)}`,
      url: `/companies/city/${slug(city)}-${slug(country)}/`,
      count: list.length,
      companies: [...list].sort(sortByName),
      byType: [...byGroup(list, (i) => i.type).entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([type, l]) => ({ type, label: TYPE_LABEL[type], count: l.length, companies: [...l].sort(sortByName) })),
    };
  })
  .sort((a, b) => b.count - a.count);

const cityUrl = new Map(cities.map((c) => [`${c.city}|${c.country}`, c.url]));
const countryUrl = new Map(countries.map((c) => [c.name, c.url]));
const typeUrl = new Map(types.map((t) => [t.type, t.url]));
const typeCountryUrl = new Map(typeCountries.map((t) => [`${t.type}|${t.country}`, t.url]));

// Per bedrijf de pagina zelf, plus de buren die de bezoeker (en Google) verder
// helpen: zelfde stad, en hetzelfde type in hetzelfde land.
const companies = items.map((c) => {
  const sameCity = items
    .filter((o) => o.id !== c.id && o.city === c.city && o.country === c.country)
    .sort(sortByName);
  const sameTypeCountry = items
    .filter((o) => o.id !== c.id && o.type === c.type && o.country === c.country)
    .sort(sortByName);
  // "Vergelijkbare bedrijven": zelfde specialisme, eigen land eerst. Dat is wat
  // iemand bedoelt met "een post-house zoals dit, maar dan in Praag", en het
  // legt tegelijk de interne links waarlangs Google de gids doorloopt.
  const similar = items
    .filter((o) => o.id !== c.id && o.specialism === c.specialism)
    .sort((a, b) => {
      const own = (x) => (x.country === c.country ? 0 : 1);
      return own(a) - own(b) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name);
    })
    .slice(0, 8);
  return {
    ...c,
    url: `/companies/${c.id}/`,
    inCountry: withArticle(c.country),
    typeLabel: TYPE_LABEL[c.type],
    typeUrl: typeUrl.get(c.type),
    countryUrl: countryUrl.get(c.country),
    cityUrl: cityUrl.get(`${c.city}|${c.country}`) || null,
    typeCountryUrl: typeCountryUrl.get(`${c.type}|${c.country}`) || null,
    incentive: incentiveByCountry.get(c.country) || null,
    sameCity: sameCity.slice(0, 8),
    sameCityMore: Math.max(0, sameCity.length - 8),
    sameTypeCountry: sameTypeCountry.slice(0, 8),
    sameTypeCountryMore: Math.max(0, sameTypeCountry.length - 8),
    similar,
  };
});

const urlById = new Map(companies.map((c) => [c.id, c.url]));
// Op URL, zodat layout.njk het bedrijf van de huidige pagina kan opzoeken en
// als OBJECT aan de jsonld-filter kan geven. Via de front matter zou het een
// string worden en levert de structured data een lege Organization op.
const byUrl = Object.fromEntries(companies.map((c) => [c.url, c]));

export default {
  updated: data.updated,
  total: items.length,
  companies,
  countries,
  types,
  typeCountries,
  cities,
  urlById: Object.fromEntries(urlById),
  byUrl,
  minCombo: MIN_COMBO,
  minCity: MIN_CITY,
};
