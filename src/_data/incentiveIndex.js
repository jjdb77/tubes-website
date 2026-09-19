// Pagina-indeling van de incentive-vergelijking, uit src/_data/locations.json.
//
// Waarom: /compare-film-incentives/ is een rekentool op EEN URL, terwijl
// "film tax incentive Portugal" of "section 481 Ireland" losse zoekvragen zijn
// met een duidelijk antwoord. Elke regeling heeft genoeg eigen inhoud voor een
// pagina: tarief, staffels, plafond, minimum spend, betaalmoment,
// financieringsrisico, het voorgeschreven begrotingssjabloon en de bron.
//
// Anders dan bij de locatiegids is hier geen drempel nodig: alle 32 regelingen
// zijn even uitgebreid vastgelegd.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "locations.json"), "utf8"));
const locationsData = JSON.parse(fs.readFileSync(path.join(dir, "filmlocations.json"), "utf8"));
const companiesData = JSON.parse(fs.readFileSync(path.join(dir, "mediacompanies.json"), "utf8"));

const slug = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const THE = new Set(["Netherlands", "United Kingdom", "Czech Republic"]);
const withArticle = (c) => (THE.has(c) ? `the ${c}` : c);

// Wat een soort regeling in de praktijk betekent voor de cashflow. Dit is het
// verschil tussen "30%" en "30% die je pas na de aangifte ziet".
const MECHANISM_NOTE = {
  "Tax credit": "A credit against tax, claimed through a return. It is reliable, but it arrives after the filing rather than during the shoot, and in some countries it is itself taxable.",
  "Cash rebate": "A payment on approved local spend, usually claimed after delivery or in stages. What matters is the queue: most cash rebates run from an annual budget.",
  "Tax shelter": "Private investors fund the production in exchange for a tax advantage. The headline percentage is the investors' benefit, not yours: what reaches the budget is what is left after their return and the intermediary's fee.",
  "Selective fund": "A jury or committee decides, so it is not an entitlement. Budget for the possibility that the answer is no, and for the rounds that decide when you can apply.",
};
const FUNDING_NOTE = {
  Entitlement: "If the production qualifies, the money follows. No queue, no annual pot.",
  "Budget-limited": "There is an annual pot and a queue. Applying early in the year matters, and a full pot can push a production to the next round.",
  "Investor-based": "The money comes from private investors, so it depends on the market rather than on a public budget.",
  Selective: "A committee picks the projects. Qualifying is not the same as receiving.",
};

const items = data.locations;

// Alleen tellen wat we echt hebben: het aantal locaties en bedrijven per land,
// om naar de andere gidsen door te kunnen verwijzen. De koppeling is op naam,
// dus "Spain (mainland)" en "Canary Islands (Spain)" horen allebei bij Spain.
const countryOf = (entry) => entry.name.replace(/\s*\(.*\)\s*$/, "").trim();
const CANARY = { "Canary Islands (Spain)": "Spain" };
const guideCountry = (entry) => CANARY[entry.name] || countryOf(entry);

const locationsPerCountry = new Map();
for (const l of locationsData.locations) locationsPerCountry.set(l.country, (locationsPerCountry.get(l.country) || 0) + 1);
const companiesPerCountry = new Map();
for (const c of companiesData.items) companiesPerCountry.set(c.country, (companiesPerCountry.get(c.country) || 0) + 1);

// De hoogste waarde die een regeling kan opleveren, na belasting en na de
// staffels: waarop we de lijst op de hub sorteren en waarmee een pagina zegt
// hoe hij zich verhoudt tot de rest. Bewust zonder plafonds en aannames, want
// die hangen van de productie af; de rekentool doet dat wel.
const topRate = (i) => {
  const rates = [i.rate];
  if (i.film_uplift?.rate) rates.push(i.film_uplift.rate);
  if (i.spend_uplift?.rate) rates.push(i.spend_uplift.rate);
  for (const t of i.tiers || []) rates.push(t.rate);
  const best = Math.max(...rates.filter((r) => typeof r === "number"));
  return Math.round(best * (i.net_factor || 1) * 10) / 10;
};

// Voor de <title>: het getoonde tarief kan een halve alinea zijn ("30% / 25%
// (large track); 30% to 40% (medium track)"). In de titel hoort dan gewoon
// het basispercentage, en de regelingsnaam zonder de afkorting tussen haakjes.
const shortRate = (i) => (i.rate_label && i.rate_label.length <= 12 ? i.rate_label : `${i.rate}%`);
const shortScheme = (i) => i.scheme.replace(/\s*\([^)]*\)\s*$/, "").trim();

const incentives = items.map((i) => {
  const land = guideCountry(i);
  return {
    ...i,
    url: `/film-incentives/${i.id}/`,
    inName: withArticle(i.name),
    shortRate: shortRate(i),
    shortScheme: shortScheme(i),
    topRate: topRate(i),
    mechanismNote: MECHANISM_NOTE[i.mechanism] || "",
    fundingNote: FUNDING_NOTE[i.funding] || "",
    // De uplifts en staffels als losse regels, zodat de template ze niet zelf
    // hoeft uit te pluizen.
    extras: [
      ...(i.film_uplift?.label ? [i.film_uplift.label] : []),
      ...(i.spend_uplift?.label ? [i.spend_uplift.label] : []),
      ...(i.tiers || []).map((t) =>
        t.upto
          ? `${t.rate}% on the first ${i.currency} ${t.upto.toLocaleString("en-GB")} of qualifying spend`
          : `${t.rate}% above that`
      ),
    ],
    guide: {
      country: land,
      locations: locationsPerCountry.get(land) || 0,
      locationsUrl: `/film-locations/country/${slug(land)}/`,
      companies: companiesPerCountry.get(land) || 0,
      companiesUrl: `/companies/country/${slug(land)}/`,
    },
  };
});

// Op de pagina zelf: dezelfde soort regeling elders, en de buren in de
// ranglijst. Dat is waar iemand die een land vergelijkt naartoe wil.
const ranked = [...incentives].sort((a, b) => b.topRate - a.topRate);
ranked.forEach((i, idx) => {
  i.rank = idx + 1;
  i.higher = ranked.slice(Math.max(0, idx - 3), idx);
  i.lower = ranked.slice(idx + 1, idx + 4);
});
for (const i of incentives) {
  i.sameMechanism = incentives.filter((o) => o.id !== i.id && o.mechanism === i.mechanism).slice(0, 8);
}

const byMechanism = [...new Set(items.map((i) => i.mechanism))].map((m) => ({
  mechanism: m,
  note: MECHANISM_NOTE[m] || "",
  count: incentives.filter((i) => i.mechanism === m).length,
  incentives: ranked.filter((i) => i.mechanism === m),
}));

const HUB = { name: "Film incentives", url: "/film-incentives/" };
const crumbsByUrl = {};
for (const i of incentives) crumbsByUrl[i.url] = [HUB];

export default {
  updated: data.updated,
  total: incentives.length,
  incentives,
  ranked,
  byMechanism,
  crumbsByUrl,
};
