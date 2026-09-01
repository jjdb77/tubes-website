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
  mediasoftware: load("mediasoftware.json"),
};
