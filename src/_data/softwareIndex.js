// Pagina-indeling van de softwarelijst, uit src/_data/mediasoftware.json.
// Zelfde redenering als companyIndex.js: /compare-media-software/ zet alles wel
// in de HTML, maar het is EEN URL. Wie zoekt op "production accounting software"
// of "alternatives to Movie Magic" moet op een pagina komen die daarover gaat.
//
// Drempels tegen dunne pagina's: een categorie- of landpagina bestaat pas vanaf
// MIN_GROUP producten. Daaronder wijst de link naar de hub.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "mediasoftware.json"), "utf8"));

const MIN_GROUP = 3;

const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const THE = new Set(["Netherlands", "United Kingdom", "Czech Republic", "United States", "Philippines"]);
const withArticle = (c) => (THE.has(c) ? `the ${c}` : c);

// Wat een categorie is, in gewone woorden. Zonder dit is een categoriepagina
// een kop met een lijstje eronder, en dat is te dun om te laten indexeren.
const CATEGORY_BLURB = {
  "Production management": "Software that runs the production itself: projects, crew, schedules, approvals, documents and reporting in one place.",
  "Budgeting & cost control": "Tools for building a production budget, tracking actual costs against it and forecasting where the production lands.",
  "Scheduling & call sheets": "Stripboards, shooting schedules, day out of days and the call sheets that come out of them.",
  "Production accounting & payroll": "Purchase orders, cost reports, payroll and the accounting side of a production, often built around local tax and union rules.",
  "Script & pre-production": "Screenwriting, breakdowns, storyboards and the pre-production paperwork that follows a script.",
  "Location & crew sourcing": "Finding places to shoot and people to shoot with, plus the permits, releases and bookings that go with them.",
  "Asset & media management": "Storing, logging, searching and moving media: MAM and DAM systems, transfer tools and archives.",
  "Post-production & VFX": "Editing, colour, finishing, visual effects, animation and the review and approval tools around them.",
  "Rights & distribution": "Tracking rights, licensing, deliveries and the distribution of finished titles.",
  "Business & CRM": "The company around the productions: sales, contacts, contracts and business administration.",
};

const items = data.items;
const sortByName = (a, b) => a.name.localeCompare(b.name);
// Elke productlijst is alfabetisch, met Tubes op de tweede plek (verzoek
// Joachim, 17-9-2026): zichtbaar zonder bovenaan te dringen. Geldt voor de
// alternatieven, de categorie-, land- en hubpagina's; de zoekpagina doet
// hetzelfde via `pin` in directories.js.
const TUBES_POSITION = 2;
const sortProducts = (list) => {
  const s = [...list].sort(sortByName);
  const i = s.findIndex((p) => p.id === "tubes");
  if (i >= 0 && s.length >= TUBES_POSITION && i !== TUBES_POSITION - 1) s.splice(TUBES_POSITION - 1, 0, ...s.splice(i, 1));
  return s;
};
// Een product heeft een hoofdcategorie (`category`) en kan daarnaast in andere
// categorieën staan (`also_in`, lijst). Tubes staat zo in "Production
// management" én in "Budgeting & cost control": het hoort in de lijst van
// budgetteringssoftware, want dat is wat het doet, zonder dat de hoofdindeling
// verschuift. Overal waar op categorie gegroepeerd wordt telt de hele lijst.
const catsOf = (p) => [p.category, ...(Array.isArray(p.also_in) ? p.also_in : [])].filter(Boolean);
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

const categories = [...byGroup(items, catsOf).entries()]
  .map(([name, list]) => ({
    name,
    slug: slug(name),
    url: `/software/category/${slug(name)}/`,
    blurb: CATEGORY_BLURB[name] || "",
    count: list.length,
    products: sortProducts(list),
    byDeployment: [...byGroup(list, (i) => i.deployment).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([deployment, l]) => ({ deployment, count: l.length })),
  }))
  .sort((a, b) => b.count - a.count);

const countries = [...byGroup(items, (i) => i.vendor_country).entries()]
  .map(([name, list]) => ({
    name,
    inName: withArticle(name),
    slug: slug(name),
    url: `/software/country/${slug(name)}/`,
    count: list.length,
    products: sortProducts(list),
    byCategory: [...byGroup(list, catsOf).entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category, l]) => ({ category, slug: slug(category), count: l.length, products: sortProducts(l) })),
  }))
  .sort((a, b) => b.count - a.count);

const categoryUrl = new Map(categories.filter((c) => c.count >= MIN_GROUP).map((c) => [c.name, c.url]));
const countryUrl = new Map(countries.filter((c) => c.count >= MIN_GROUP).map((c) => [c.name, c.url]));

const products = sortProducts(items).map((p) => {
  // "Alternatives to X": hetzelfde doel, dus een gedeelde categorie. Dat is
  // precies waar iemand op zoekt die al een product kent en wil vergelijken.
  const cats = catsOf(p);
  const alternatives = sortProducts(items.filter((o) => o.id !== p.id && catsOf(o).some((c) => cats.includes(c))));
  const sameVendor = sortProducts(items.filter((o) => o.id !== p.id && o.vendor === p.vendor));
  return {
    ...p,
    url: `/software/${p.id}/`,
    categories: cats,
    // Voor lopende tekst: "production management and budgeting & cost control"
    categoriesText: cats.map((c) => c.toLowerCase()).join(" and "),
    alsoIn: cats.slice(1).map((c) => ({ name: c, url: categoryUrl.get(c) || "/software/" })),
    categorySlug: slug(p.category),
    categoryUrl: categoryUrl.get(p.category) || "/software/",
    categoryBlurb: CATEGORY_BLURB[p.category] || "",
    countryUrl: countryUrl.get(p.vendor_country) || null,
    inCountry: withArticle(p.vendor_country),
    alternatives: alternatives.slice(0, 10),
    alternativesMore: Math.max(0, alternatives.length - 10),
    sameVendor,
    isTubes: p.id === "tubes",
  };
});

export default {
  updated: data.updated,
  note: data.note,
  total: items.length,
  products,
  categories,
  countries,
  // Alleen groepen die groot genoeg zijn krijgen een eigen pagina.
  categoryPages: categories.filter((c) => c.count >= MIN_GROUP),
  countryPages: countries.filter((c) => c.count >= MIN_GROUP),
  byUrl: Object.fromEntries(products.map((p) => [p.url, p])),
  minGroup: MIN_GROUP,
};
