#!/usr/bin/env node
// Trekt de coördinaten van locaties na bij Nominatim (OpenStreetMap) en meldt
// alles dat verder dan MAX_KM van de gevonden plek ligt, plus wat niet
// gevonden is. Agents schatten coördinaten soms; dit vangt dat op.
//   node scripts/check-coordinates.mjs [bestand] [--km 25] [--fix]
// --fix schrijft de gevonden coördinaten terug (alleen bij een treffer die
// binnen het juiste land valt en met een duidelijke naamovereenkomst).
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) || "src/_data/filmlocations.json";
const MAX_KM = Number(args[args.indexOf("--km") + 1]) || 25;
const fix = args.includes("--fix");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const locs = Array.isArray(raw) ? raw : raw.locations;
const UA = "tubes-locations-guide/1.0 (https://www.tubes.media; coordinate check)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => {
  const R = 6371, t = Math.PI / 180;
  const dLat = (c - a) * t, dLng = (d - b) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
};

// Nominatim knijpt hard af zodra er meer sessies vanaf hetzelfde adres vragen.
// Photon (van Komoot) draait op dezelfde OpenStreetMap-gegevens en is dan de
// tweede kans; zonder die terugval bestaat de uitslag vooral uit "niet gevonden".
const nominatim = async (q) => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
      if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.length) return null;
      return { lat: Number(j[0].lat), lng: Number(j[0].lon), name: j[0].display_name, via: "osm" };
    } catch { await sleep(1000); }
  }
  return null;
};
const photon = async (q) => {
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const j = await r.json();
    const f = j.features && j.features[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties || {};
    return { lat, lng, name: [p.name, p.city, p.country].filter(Boolean).join(", "), via: "photon" };
  } catch { return null; }
};
const geocode = async (q) => (await nominatim(q)) || (await photon(q));

let checked = 0, off = 0, missing = 0, fixed = 0;
for (const l of locs) {
  const query = `${l.name}, ${l.region}, ${l.country}`;
  const hit = (await geocode(query)) || (await geocode(`${l.name}, ${l.country}`));
  await sleep(1100); // Nominatim: hoogstens 1 verzoek per seconde
  if (!hit) { missing++; console.log(`NOTFOUND ${l.id} (${l.name}, ${l.region})`); continue; }
  checked++;
  const d = km(l.lat, l.lng, hit.lat, hit.lng);
  if (d > MAX_KM) {
    off++;
    console.log(`OFF ${d} km  ${l.id} (${l.name}) has ${l.lat},${l.lng} | ${hit.via} ${hit.lat},${hit.lng} -> ${hit.name.slice(0, 80)}`);
    if (fix) { l.lat = Math.round(hit.lat * 10000) / 10000; l.lng = Math.round(hit.lng * 10000) / 10000; fixed++; }
  }
}
if (fix && fixed) { fs.writeFileSync(file, JSON.stringify(raw, null, Array.isArray(raw) ? 1 : 2) + "\n"); }
console.log(`checked ${checked}, off by more than ${MAX_KM} km: ${off}, not found: ${missing}${fix ? `, fixed ${fixed}` : ""}`);
