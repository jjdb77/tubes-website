// Pagina-indeling van de festivallijst, uit src/_data/filmfestivals.json.
//
// ⚠️ Bewust GEEN pagina per festival. Per festival hebben we een zin over de
// insteek, een zin over het industrieprogramma, de maand en een link: samen
// zo'n tachtig woorden. Vijftig van die pagina's zijn dunne content, en anders
// dan bij een postproductiehuis in Lissabon concurreren ze met de site van het
// festival zelf, die voor "Berlinale 2027 dates" altijd het betere antwoord
// heeft. Wat wij wel hebben is het overzicht: welke evenementen er in mei zijn,
// welke markten er in Europa bestaan, wat er in Frankrijk gebeurt. Daar is
// onze lijst het antwoord, en daar gaan deze pagina's over.
//
// Wordt de data ooit veel rijker (deadlines, kosten, secties, prijzen per
// festival), dan kan een pagina per festival alsnog.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "filmfestivals.json"), "utf8"));

const MIN_TYPE = 3;
const MIN_COUNTRY = 4;

const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const THE = new Set(["Netherlands", "United Kingdom", "Czech Republic"]);
const withArticle = (c) => (THE.has(c) ? `the ${c}` : c);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Wat een soort evenement is, in gewone woorden, plus de naam waaronder ernaar
// gezocht wordt. "Market" als kop zegt niemand iets; "Film markets in Europe"
// wel.
const TYPE_LABEL = {
  "Film festival": {
    slug: "film-festivals",
    plural: "Film festivals",
    lower: "film festivals",
    blurb: "Competitive and curated festivals with a public programme, most of them with an industry strand, accreditation and premieres that decide a film's festival run.",
  },
  "Documentary festival": {
    slug: "documentary-festivals",
    plural: "Documentary festivals",
    lower: "documentary festivals",
    blurb: "Festivals built around non-fiction, usually with a pitching forum or a co-production market attached.",
  },
  Market: {
    slug: "film-markets",
    plural: "Film markets",
    lower: "film markets",
    blurb: "Where finished films and projects in development are bought, sold and financed. Accreditation and a stand cost money and belong in the budget.",
  },
  "Trade show": {
    slug: "trade-shows",
    plural: "Trade shows",
    lower: "trade shows",
    blurb: "Technology and broadcast exhibitions: kit, workflow, post and delivery, aimed at the people who buy and operate it.",
  },
  "Series & TV event": {
    slug: "series-and-tv-events",
    plural: "Series and TV events",
    lower: "series and TV events",
    blurb: "Events built around drama series and television: competition, pitching and the commissioners who attend.",
  },
  "Industry conference": {
    slug: "industry-conferences",
    plural: "Industry conferences",
    lower: "industry conferences",
    blurb: "Conferences about the business rather than the films: financing, policy, distribution and production practice.",
  },
  "Animation festival": {
    slug: "animation-festivals",
    plural: "Animation festivals",
    lower: "animation festivals",
    blurb: "Festivals and markets for animated film and series.",
  },
  "Genre festival": {
    slug: "genre-festivals",
    plural: "Genre festivals",
    lower: "genre festivals",
    blurb: "Fantastic, horror and genre film festivals, with their own buyers and audiences.",
  },
};

// Voor de <title>: hoofdletters per woord, behalve de kleine woorden.
const SMALL = new Set(["and", "for", "of", "in", "the", "to", "a"]);
const titleCase = (v) =>
  String(v)
    .split(" ")
    .map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const items = data.items;
const typeInfo = (t) => {
  const info = TYPE_LABEL[t] || { slug: slug(t), plural: t, lower: t.toLowerCase(), blurb: "" };
  return { ...info, pluralTitle: titleCase(info.plural) };
};

const byGroup = (list, key) => {
  const out = new Map();
  for (const it of list) {
    const ks = key(it);
    for (const k of Array.isArray(ks) ? ks : [ks]) {
      if (!k) continue;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(it);
    }
  }
  return out;
};

// `month` is vrije tekst ("January to February", "November (film festival);
// March (documentary festival)"). Een evenement hoort op de pagina van elke
// maand die erin voorkomt, want dat is precies wat iemand met een kalender wil.
const monthsOf = (item) => MONTHS.filter((m) => new RegExp(m, "i").test(item.month || ""));

const sortByName = (a, b) => a.name.localeCompare(b.name);
// Met foto eerst, zodat een pagina niet met grijze vlakken opent.
const sortForPage = (list) =>
  [...list].sort((a, b) => Number(Boolean(b.photo?.thumb)) - Number(Boolean(a.photo?.thumb)) || sortByName(a, b));

const festivals = items.map((f) => ({
  ...f,
  ...typeInfo(f.type),
  typeUrl: `/film-festivals/${typeInfo(f.type).slug}/`,
  inCountry: withArticle(f.country),
  months: monthsOf(f),
}));

const typeGroups = byGroup(festivals, (f) => f.type);
const types = [...typeGroups.entries()]
  .map(([type, list]) => ({
    type,
    ...typeInfo(type),
    url: `/film-festivals/${typeInfo(type).slug}/`,
    count: list.length,
    festivals: sortForPage(list),
    countries: [...new Set(list.map((f) => f.country))].sort(),
    // "Film festival" krijgt geen eigen pagina: dat zijn 26 van de 50 en de
    // hub zelf is al die pagina. Een /film-festivals/film-festivals/ ernaast
    // zou dezelfde lijst nog eens zijn.
    hasPage: list.length >= MIN_TYPE && type !== "Film festival",
  }))
  .sort((a, b) => b.count - a.count);

const months = MONTHS.map((name, i) => {
  const list = festivals.filter((f) => f.months.includes(name));
  return {
    name,
    number: i + 1,
    slug: name.toLowerCase(),
    url: `/film-festivals/${name.toLowerCase()}/`,
    count: list.length,
    festivals: sortForPage(list),
    hasPage: list.length >= MIN_TYPE,
    // Vorige en volgende maand met een pagina, voor de kalenderlinks.
    prev: null,
    next: null,
  };
});
const monthPages = months.filter((m) => m.hasPage);
monthPages.forEach((m, i) => {
  m.prev = monthPages[(i - 1 + monthPages.length) % monthPages.length];
  m.next = monthPages[(i + 1) % monthPages.length];
});

const countries = [...byGroup(festivals, (f) => f.country).entries()]
  .map(([country, list]) => ({
    country,
    inCountry: withArticle(country),
    slug: slug(country),
    url: `/film-festivals/country/${slug(country)}/`,
    count: list.length,
    festivals: sortForPage(list),
    byType: [...byGroup(list, (f) => f.type).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, l]) => ({ type, ...typeInfo(type), count: l.length })),
    hasPage: list.length >= MIN_COUNTRY,
  }))
  .sort((a, b) => b.count - a.count);

const HUB = { name: "Film festivals and events", url: "/film-festivals/" };
const crumbsByUrl = {};
for (const t of types.filter((t) => t.hasPage)) crumbsByUrl[t.url] = [HUB];
for (const m of monthPages) crumbsByUrl[m.url] = [HUB];
for (const c of countries.filter((c) => c.hasPage)) crumbsByUrl[c.url] = [HUB];

export default {
  updated: data.updated,
  total: festivals.length,
  festivals: sortForPage(festivals),
  types,
  typePages: types.filter((t) => t.hasPage),
  months,
  monthPages,
  countries,
  countryPages: countries.filter((c) => c.hasPage),
  crumbsByUrl,
  minType: MIN_TYPE,
  minCountry: MIN_COUNTRY,
};
