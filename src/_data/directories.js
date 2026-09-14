// Bundelt de datasets voor het generieke "zoek en vergelijk"-sectietype
// (partials/sections/directory.njk): een pagina kiest met `dataset` welke
// lijst hij toont. Elke JSON heeft { updated, note, items: [...] }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

export default {
  filmfestivals: load("filmfestivals.json"),
  // Elk product heeft ook een eigen pagina (/software/<id>/); die link komt hier
  // als `page_url` bij, zodat de kaarten in de zoekpagina ernaartoe wijzen.
  mediasoftware: (() => {
    const d = load("mediasoftware.json");
    return { ...d, items: d.items.map((p) => ({ ...p, page_url: `/software/${p.id}/` })) };
  })(),
  // Elk bedrijf heeft ook een eigen pagina (/companies/<id>/); die link komt
  // hier als `page_url` bij, zodat de kaarten in de zoekpagina ernaartoe wijzen.
  mediacompanies: (() => {
    const d = load("mediacompanies.json");
    return { ...d, items: d.items.map((c) => ({ ...c, page_url: `/companies/${c.id}/` })) };
  })(),
};
