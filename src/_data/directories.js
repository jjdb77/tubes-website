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
  // Software: een product kan naast zijn hoofdcategorie in andere categorieën
  // staan (`also_in`, zie softwareIndex.js). `categories` (lijst) is het
  // filterveld op de zoekpagina, `category_label` de tekst op kaart en in de
  // vergelijking ("Production management · Budgeting & cost control").
  mediasoftware: (() => {
    const d = load("mediasoftware.json");
    const items = d.items
      .map((p) => {
        const categories = [p.category, ...(Array.isArray(p.also_in) ? p.also_in : [])].filter(Boolean);
        return { ...p, categories, category_label: categories.join(" · "), page_url: `/software/${p.id}/` };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    // Tubes op de tweede plek zodra het in de (gefilterde of doorzochte) lijst
    // voorkomt, nooit onderaan bij de T: `pin` zet de kaart in de browser op
    // die positie tussen de zichtbare kaarten (directory.njk). Waar Tubes niet
    // bij past (editing, post, payroll) komt het door het filter niet in beeld.
    const i = items.findIndex((p) => p.id === "tubes");
    if (i > 1) items.splice(1, 0, ...items.splice(i, 1));
    if (i >= 0) items[1].pin = 2;
    return { ...d, items };
  })(),
  // Elk bedrijf heeft ook een eigen pagina (/companies/<id>/); die link komt
  // hier als `page_url` bij, zodat de kaarten in de zoekpagina ernaartoe wijzen.
  mediacompanies: (() => {
    const d = load("mediacompanies.json");
    return { ...d, items: d.items.map((c) => ({ ...c, page_url: `/companies/${c.id}/` })) };
  })(),
};
