#!/usr/bin/env node
// Trekt de regionamen in de locatiegids gelijk. Agents schrijven dezelfde regio
// op vijf manieren op ("Noord-Holland" naast "North Holland", "Île-de-France"
// naast "Ile-de-France", "Greater London, England" naast "Greater London"), en
// dat is te zien onder elke kaart en in de vergelijking.
//
//   node scripts/normalize-regions.mjs [bestand] [--dry]
//
// De regels, op volgorde:
//   1. "Regio (Stad)" wordt "Stad, Regio"; staat er een opsomming tussen de
//      haakjes, dan gaat de hele haakjesgroep eruit.
//   2. Engelse graafschappen verliezen ", England", ", Midlands" en
//      ", North of England"; Schotse, Welshe en Noord-Ierse gebieden krijgen
//      juist hun landsnaam erbij, want die zegt wel iets.
//   3. Accenten eruit: het zoeken vouwt accenten weg, dus in de lijst zelf is
//      één schrijfwijze rustiger. Alleen voor regio's, niet voor locatienamen.
//   4. Een vaste vertaallijst voor namen die anders naast elkaar blijven staan
//      (Bretagne/Brittany, Lisboa/Lisbon, Madrid/Community of Madrid).
//   5. Wat daarna nog alleen in hoofdletters verschilt, krijgt de vorm die het
//      vaakst voorkomt.
import fs from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--")) || "src/_data/filmlocations.json";
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const locs = Array.isArray(raw) ? raw : raw.locations;

// Gebieden buiten Engeland: hier hoort de landsnaam er juist bij, omdat een
// producent op "Scotland" of "Wales" zoekt en niet op "Perth and Kinross".
const SCOTLAND = ["Glasgow", "Edinburgh", "Highland", "Aberdeen", "Aberdeenshire", "Dundee", "Stirling", "Perth and Kinross", "Fife", "Falkirk", "South Ayrshire", "North Ayrshire", "East Ayrshire", "West Lothian", "East Lothian", "Midlothian", "North Lanarkshire", "South Lanarkshire", "Renfrewshire", "East Renfrewshire", "Inverclyde", "West Dunbartonshire", "East Dunbartonshire", "Argyll and Bute", "Dumfries and Galloway", "Scottish Borders", "Angus", "Moray", "Clackmannanshire", "Orkney", "Shetland", "Na h-Eileanan Siar", "Western Isles"];
const WALES = ["Cardiff", "Swansea", "Newport", "Gwynedd", "Conwy", "Denbighshire", "Flintshire", "Wrexham", "Powys", "Ceredigion", "Pembrokeshire", "Carmarthenshire", "Monmouthshire", "Torfaen", "Blaenau Gwent", "Caerphilly", "Merthyr Tydfil", "Rhondda Cynon Taf", "Bridgend", "Neath Port Talbot", "Vale of Glamorgan", "Isle of Anglesey", "Anglesey"];
const NIRELAND = ["Belfast", "Derry", "Londonderry", "County Down", "County Antrim", "County Armagh", "County Fermanagh", "County Tyrone", "County Londonderry", "Ards", "Lisburn", "Newry", "Mid Ulster", "Causeway Coast and Glens", "Derry and Strabane", "Fermanagh and Omagh", "Armagh City, Banbridge and Craigavon"];

// Namen die na het strippen van accenten nog steeds uiteenlopen. Links wat een
// agent schreef, rechts de vorm die de gids aanhoudt (Engels waar er een
// gangbare Engelse naam is, anders de plaatselijke).
const ALIAS = {
  Netherlands: {
    "Noord-Holland": "North Holland", "Zuid-Holland": "South Holland", "Noord-Brabant": "North Brabant",
    "Fryslan": "Friesland", "Zuid Holland": "South Holland", "Noord Holland": "North Holland",
  },
  France: {
    "Bretagne": "Brittany", "Normandie": "Normandy", "Corse": "Corsica",
    "Provence-Alpes-Cote d'Azur": "Provence-Alpes-Cote d'Azur", "Pays-de-la-Loire": "Pays de la Loire",
  },
  Portugal: {
    "Lisboa": "Lisbon", "Lisbon District": "Lisbon", "Lisbon Region": "Lisbon", "Lisbon region": "Lisbon",
    "Porto District": "Porto", "Centro de Portugal": "Centro", "Norte": "Norte", "Minho": "Norte",
    "Setubal District": "Setubal", "Ribatejo": "Ribatejo",
  },
  Spain: {
    "Madrid": "Community of Madrid", "Comunidad de Madrid": "Community of Madrid",
    "Cataluna": "Catalonia", "Catalunya": "Catalonia", "Pais Vasco": "Basque Country",
    "Islas Canarias": "Canary Islands", "Illes Balears": "Balearic Islands",
    "Castilla y Leon": "Castile and Leon", "Comunidad Valenciana": "Valencian Community",
    "Navarra": "Navarre", "Andalucia": "Andalusia", "Galiza": "Galicia",
  },
  Germany: {
    "Bayern": "Bavaria", "Hessen": "Hesse", "Sachsen": "Saxony", "Sachsen-Anhalt": "Saxony-Anhalt",
    "Thuringen": "Thuringia", "Niedersachsen": "Lower Saxony", "Nordrhein-Westfalen": "North Rhine-Westphalia",
    "Rheinland-Pfalz": "Rhineland-Palatinate", "Mecklenburg-Western Pomerania": "Mecklenburg-Vorpommern",
  },
  "Czech Republic": {
    "Plzen Region": "Pilsen Region", "Praha": "Prague", "Prague Region": "Prague",
    "Jihomoravsky Region": "South Moravian Region", "Vysocina": "Vysocina Region",
  },
  Italy: {
    "Trentino": "Trentino-Alto Adige", "Alto Adige": "South Tyrol", "Puglia": "Apulia",
    "Piemonte": "Piedmont", "Toscana": "Tuscany", "Sicilia": "Sicily", "Sardegna": "Sardinia",
    "Lombardia": "Lombardy", "Valle d'Aosta": "Aosta Valley",
  },
  Poland: { "Lodzkie": "Lodz Voivodeship", "Mazowieckie": "Masovian Voivodeship", "Masovia": "Masovian Voivodeship", "Lesser Poland": "Lesser Poland Voivodeship", "Greater Poland": "Greater Poland Voivodeship" },
  Hungary: { "Budapest County": "Budapest", "Pest County": "Pest" },
  Austria: { "Wien": "Vienna", "Niederosterreich": "Lower Austria", "Oberosterreich": "Upper Austria", "Steiermark": "Styria", "Karnten": "Carinthia", "Tirol": "Tyrol" },
  Belgium: { "Vlaanderen": "Flanders", "Wallonie": "Wallonia", "Bruxelles": "Brussels", "Brussels-Capital Region": "Brussels" },
  Greece: { "Attiki": "Attica", "Kriti": "Crete" },
  Croatia: { "Zagreb County": "Zagreb", "City of Zagreb": "Zagreb" },
  Ireland: { "Co. Dublin": "County Dublin", "Co. Cork": "County Cork", "Co. Wicklow": "County Wicklow" },
  // Haakjes die geen plaats binnen een regio zijn maar een tweede naam of juist
  // het grotere gebied; die draait regel 1 anders verkeerd om.
  Malta: { "Vittoriosa, Birgu": "Birgu" },
  Sweden: { "Skane County": "Skane", "Stockholm County": "Stockholm", "Norrland, Norrbotten": "Norrbotten" },
  Denmark: { "Capital Region of Denmark": "Capital Region" },
};

const deaccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ĐđŁłØøÆæŒœß]/g, (c) => ({ "Đ": "D", "đ": "d", "Ł": "L", "ł": "l", "Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "ß": "ss" }[c]));
const tidy = (s) => s.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/^[\s,]+|[\s,]+$/g, "");

// Stap 1: "Regio (Stad)" omdraaien, of de haakjes laten vallen.
const unbracket = (r) => {
  const m = r.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m) return r;
  const [, head, inner] = m;
  if (!head.trim()) return inner.trim();
  // Een opsomming tussen haakjes ("Zakopane, Tatra Mountains") zegt te veel om
  // voor de regio door te gaan; die gaat er in zijn geheel af.
  if (inner.includes(",")) return head.trim();
  // Herhaalt de stad de regio, dan blijft alleen de regio staan.
  if (deaccent(head).toLowerCase().startsWith(deaccent(inner).toLowerCase())) return head.trim();
  return `${inner.trim()}, ${head.trim()}`;
};

// Stap 2: de landsnaam in het Verenigd Koninkrijk.
const ukNation = (r) => {
  let out = r.replace(/,\s*(England|North of England|Midlands|South of England|the Midlands)\s*$/i, "").trim();
  const head = out.split(",")[0].trim();
  const nation = SCOTLAND.includes(head) ? "Scotland" : WALES.includes(head) ? "Wales" : NIRELAND.includes(head) ? "Northern Ireland" : null;
  if (!nation) return out;
  if (new RegExp(`,\\s*${nation}\\s*$`, "i").test(out)) return out;
  // Al een andere landsnaam erachter? Dan die vervangen, niet stapelen.
  out = out.replace(/,\s*(Scotland|Wales|Northern Ireland)\s*$/i, "");
  return `${out}, ${nation}`;
};

const changes = [];
for (const l of locs) {
  if (typeof l.region !== "string") continue;
  const was = l.region;
  let r = tidy(unbracket(tidy(was)));
  if (l.country === "United Kingdom") r = ukNation(r);
  r = deaccent(r);
  // "Portalegre district, Alentejo" is de plaatsnaam plus een restje bestuurstaal
  // uit de bron; met een hoofdletter ("Zlin Region") hoort het er wel bij.
  r = r.replace(/\s+(district|region|county|province|voivodeship)\b/g, "");
  const map = ALIAS[l.country] || {};
  // De vertaallijst geldt voor het hele veld en voor het staartstuk na de komma
  // ("Cascais, Lisbon region" wordt "Cascais, Lisbon").
  if (map[r]) r = map[r];
  else {
    const parts = r.split(", ");
    if (parts.length > 1) {
      const tail = parts.slice(1).join(", ");
      if (map[tail]) r = `${parts[0]}, ${map[tail]}`;
    }
  }
  r = tidy(r);
  if (r && r !== was) { l.region = r; changes.push([was, r, l.country]); }
}

// Stap 5: wat alleen in hoofdletters of spaties verschilt, krijgt de vorm die
// het vaakst voorkomt.
const groups = {};
for (const l of locs) {
  if (typeof l.region !== "string") continue;
  const key = `${l.country}|${l.region.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  (groups[key] = groups[key] || {})[l.region] = (groups[key][l.region] || 0) + 1;
}
const winner = {};
for (const [key, variants] of Object.entries(groups)) {
  const list = Object.entries(variants).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (list.length > 1) winner[key] = list[0][0];
}
for (const l of locs) {
  if (typeof l.region !== "string") continue;
  const key = `${l.country}|${l.region.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  if (winner[key] && winner[key] !== l.region) { changes.push([l.region, winner[key], l.country]); l.region = winner[key]; }
}

const seen = new Map();
for (const [was, now, country] of changes) {
  const k = `${country}: ${was} -> ${now}`;
  seen.set(k, (seen.get(k) || 0) + 1);
}
for (const [k, n] of [...seen.entries()].sort()) console.log(`${String(n).padStart(4)}x ${k}`);
console.log(`\n${changes.length} regionamen aangepast, ${seen.size} verschillende wijzigingen.`);

// Wat er daarna nog op elkaar lijkt: handwerk, geen automatische samenvoeging.
const perCountry = {};
for (const l of locs) (perCountry[l.country] = perCountry[l.country] || new Set()).add(l.region);
const near = [];
for (const [country, set] of Object.entries(perCountry)) {
  const list = [...set];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].toLowerCase(), b = list[j].toLowerCase();
      if (a.includes(b) || b.includes(a)) near.push(`${country}: "${list[i]}" ~ "${list[j]}"`);
    }
  }
}
if (near.length) console.log(`\nLijken nog op elkaar (${near.length}), zelf naar kijken:\n` + near.slice(0, 40).join("\n"));

if (!dry) {
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  console.log(`\n${file} bijgewerkt.`);
} else {
  console.log("\n--dry: niets weggeschreven.");
}
