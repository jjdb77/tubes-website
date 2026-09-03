#!/usr/bin/env node
// Zoekt bijna-dubbele locaties: twee agents vinden dezelfde plek soms onder een
// andere naam ("Walcownia Cynku zinc rolling mill" naast "Muzeum Hutnictwa Cynku
// Walcownia"), en dan helpt vergelijken op exacte naam niet. Hier tellen
// gedeelde woorden plus de afstand tussen de coordinaten.
//   node scripts/check-duplicates.mjs [bestand] [--km 25]
// Meldingen zijn kandidaten, geen bewijs: twee stations in dezelfde stad zijn
// echt twee locaties. Kijk er zelf naar en zet een echte dubbel in
// src/_data/locations-dropped.json, anders komt hij bij de volgende
// samenvoeging gewoon terug uit het bronbestand.
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) || "src/_data/filmlocations.json";
const MAX_KM = Number(args[args.indexOf("--km") + 1]) || 25;
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const locs = Array.isArray(raw) ? raw : raw.locations;

// Lidwoorden en voorzetsels weg: die zeggen niets over welke plek het is.
const STOP = new Set(["the", "de", "la", "le", "el", "het", "een", "a", "an", "of", "van", "von", "di", "del", "do", "da", "des", "der", "und", "and"]);
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");
const km = (a, b, c, d) => {
  const R = 6371, t = Math.PI / 180;
  const s = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const byCountry = {};
for (const l of locs) (byCountry[l.country] = byCountry[l.country] || []).push(l);
let found = 0;
for (const [country, rows] of Object.entries(byCountry)) {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const wa = new Set(norm(a.name).split(" ")), wb = new Set(norm(b.name).split(" "));
      const shared = [...wa].filter((w) => wb.has(w) && w.length > 3).length;
      const dist = km(a.lat, a.lng, b.lat, b.lng);
      const sameSpot = dist < 0.35;
      if (norm(a.name) === norm(b.name) || (shared >= 2 && dist < MAX_KM) || (sameSpot && shared >= 1)) {
        found++;
        console.log(`${country}: "${a.name}" (${a.id}) ~ "${b.name}" (${b.id})  ${dist.toFixed(2)} km, ${shared} shared words`);
      }
    }
  }
}
console.log(`${found} possible duplicates in ${locs.length} entries`);
