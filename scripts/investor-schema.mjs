// Vaste lijsten voor src/_data/filminvestors.json (zie docs/film-investor-research-brief.md).
export const TYPES = ["Pan-European fund", "National film fund", "Regional film fund", "Private equity and film finance", "Bank or specialist lender", "Tax shelter investor"];
export const FORMATS = ["Feature fiction", "Documentary", "Animation", "Series", "Short film", "Immersive and games"];
export const INSTRUMENTS = ["Grant", "Soft loan", "Equity", "Debt and gap finance", "Tax shelter"];
export const STAGES = ["Development", "Production", "Post-production", "Distribution", "Co-production"];
export const COUNTRIES = { "United Kingdom": "gb", Ireland: "ie", France: "fr", Belgium: "be", Luxembourg: "lu", Netherlands: "nl", Switzerland: "ch", Germany: "de", Austria: "at", Italy: "it", Spain: "es", Portugal: "pt", Malta: "mt", Greece: "gr", Sweden: "se", Norway: "no", Denmark: "dk", Finland: "fi", Iceland: "is", Estonia: "ee", Latvia: "lv", Lithuania: "lt", Poland: "pl", Czechia: "cz", Slovakia: "sk", Hungary: "hu", Slovenia: "si", Croatia: "hr", Serbia: "rs", Romania: "ro", Bulgaria: "bg" };
export const FIELDS = ["id", "name", "type", "country", "city", "lat", "lng", "summary", "formats", "instruments", "stages", "eligibility", "how_to_apply", "budget_note", "founded", "official_url", "source_urls"];
export const REQUIRED = ["id", "name", "type", "country", "city", "summary", "official_url"];

// Geeft een lijst problemen voor één entry (leeg = goed).
export function problems(it) {
  const out = [];
  for (const k of REQUIRED) if (!it[k]) out.push(`missing ${k}`);
  if (!TYPES.includes(it.type)) out.push(`bad type ${it.type}`);
  if (!(it.country in COUNTRIES)) out.push(`bad country ${it.country}`);
  const cc = COUNTRIES[it.country];
  if (it.id && !(it.id.startsWith(cc + "-") || (it.type === "Pan-European fund" && it.id.startsWith("eu-")))) out.push(`id prefix should be ${cc}-`);
  for (const [k, list] of [["formats", FORMATS], ["instruments", INSTRUMENTS], ["stages", STAGES]]) {
    if (!Array.isArray(it[k]) || !it[k].length) out.push(`empty ${k}`);
    else for (const v of it[k]) if (!list.includes(v)) out.push(`bad ${k} value ${v}`);
  }
  if (typeof it.lat !== "number" || typeof it.lng !== "number" || it.lat < 27 || it.lat > 72 || it.lng < -25 || it.lng > 45) out.push("bad coordinates");
  const text = JSON.stringify(it);
  if (/[—–;]/.test(text)) out.push("dash or semicolon");
  if (it.summary && it.summary.length > 320) out.push("summary too long");
  if (it.budget_note && !/\(published\)\s*$/.test(it.budget_note)) out.push("budget_note without (published)");
  return out;
}
