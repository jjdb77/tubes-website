// Maakt het gratis Excel-sjabloon voor /film-budget-template/:
// src/downloads/tubes-film-budget-template.xlsx. Zelfde rekeningschema als
// het Movie Magic-formaat van de Budget Builder (src/js/budget-templates.js)
// en dezelfde Excel-schrijver (buildXlsxFor in src/js/budget-builder.js), dus
// het bestand is precies wat de Budget Builder ook zou downloaden: alle
// categorieën en kostensoorten, bedragen leeg, formules per regel, contingency
// als invulbaar percentage en een tweede blad per categorie.
//
// Draaien na elke wijziging aan het formaat of de schrijver:
//   node scripts/gen-film-budget-template.mjs
// Het bestand staat in git; de site kopieert src/downloads naar /downloads/.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/js/budget-templates.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "src/js/budget-builder.js"), "utf8"));

const format = globalThis.BudgetTemplates.find((t) => t.id === "movie-magic");
// Twee categorieën blijven eruit: 7000 Contingency, want die staat onderaan
// als percentage (dubbel zou verwarren), en 7100 SA Rebate, een korting die
// bij één land hoort en geen kostensoort is.
const SKIP = new Set(["7000", "7100"]);
const sections = format.sections
  .filter((s) => !SKIP.has(s.number))
  .map((s) => ({ number: s.number, name: s.name, lines: s.lines.map((l) => ({ code: l.code, description: l.description, remarks: "", qty: 0, unit: "", rate: 0 })) }));

const budget = {
  name: "Film budget template",
  production: "",
  currency: "",
  vat: null, // geen btw-regels: die verschillen per land, en de meeste budgetten zijn exclusief
  date: new Date().toISOString().slice(0, 10),
  additionals: [{ name: "Contingency", percent: 10 }],
  sections,
};

const blob = globalThis.BudgetBuilderCore.buildXlsxFor(budget);
const out = path.join(root, "src/downloads/tubes-film-budget-template.xlsx");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
const lines = sections.reduce((n, s) => n + s.lines.length, 0);
console.log(`${path.relative(root, out)}: ${sections.length} categories, ${lines} lines, ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
