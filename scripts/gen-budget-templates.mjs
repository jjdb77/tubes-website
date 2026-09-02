// Genereert src/js/budget-templates.js (window.BudgetTemplates) uit de
// Movie Magic-lijsten in test/fixtures:
//   magic-movie-cost-types.xlsx   Cost Category | Cost Type Nr | Name   (van Joachim)
//   magic-movie-colors.xlsx       Cost Category Nr | ColorCode           (van Joachim)
//   magic-movie-template.xlsx     categorienamen (MMB-sjabloonexport)
// Draaien: node scripts/gen-budget-templates.mjs
// Nieuw formaat toevoegen: lijsten in test/fixtures zetten en hieronder een
// tweede blok maken, of het object rechtstreeks in budget-templates.js zetten.
import fs from "node:fs";
import vm from "node:vm";
vm.runInThisContext(fs.readFileSync("src/js/budget-compare.js", "utf8"));
const BC = globalThis.BudgetCompare;
const read = async (file) => { const b = fs.readFileSync(file); return (await BC.parseXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)))[0].rows; };

const ACRONYMS = ["ATL", "BTL", "VFX", "ADR", "SA", "TV", "DP", "UPM", "AD", "DIT", "SFX", "PA", "EPK", "MOS", "VTR"];
const title = (s) => {
  let t = String(s).toLowerCase().replace(/(^|[\s,&/(-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  for (const a of ACRONYMS) t = t.replace(new RegExp("\\b" + a[0] + a.slice(1).toLowerCase() + "\\b", "g"), a);
  return t;
};

// Categorienamen uit de sjabloonexport (kolom 1 = nummer, kolom 2 = naam)
const names = new Map();
for (const r of await read("test/fixtures/magic-movie-template.xlsx")) if (typeof r[0] === "number" && r[1]) names.set(String(r[0]), title(r[1]));
// Kleuren per categorie
const colors = new Map();
for (const r of (await read("test/fixtures/magic-movie-colors.xlsx")).slice(1)) if (r[0] !== "" && r[1]) colors.set(String(r[0]), String(r[1]).toUpperCase());
// Kostensoorten per categorie, in bestandsvolgorde
const sections = [];
const byNumber = new Map();
for (const r of (await read("test/fixtures/magic-movie-cost-types.xlsx")).slice(1)) {
  if (r[0] === "" || r[1] === "") continue;
  const number = String(r[0]);
  let s = byNumber.get(number);
  if (!s) {
    s = { number, name: names.get(number) || `Category ${number}`, color: colors.get(number) || "", lines: [] };
    byNumber.set(number, s);
    sections.push(s);
  }
  s.lines.push({ code: String(r[1]), description: title(r[2] || "") });
}
sections.sort((a, b) => Number(a.number) - Number(b.number));
const lineCount = sections.reduce((n, s) => n + s.lines.length, 0);
const missingNames = sections.filter((s) => !names.has(s.number)).map((s) => s.number);

const templates = [
  { id: "blank", name: "Blank", description: "Start from nothing and add your own sections and lines." },
  { id: "movie-magic", name: "Movie Magic (film and TV standard)", description: `The category and account numbering of Movie Magic Budgeting: ${sections.length} sections and ${lineCount} accounts, from 1100 Development to 7100 Rebates, each section in its own colour. Quantities and rates start empty.`, sections },
];
const out = `// Budgetformaten (rekeningschema's) voor de gratis Budget Builder.
// GEGENEREERD door scripts/gen-budget-templates.mjs uit de lijsten in
// test/fixtures (Movie Magic: categorieën met kleur, kostensoorten). Niet met
// de hand bewerken; pas de lijsten of het script aan en genereer opnieuw.
// Vorm: { id, name, description, sections: [{ number, name, color, lines: [{ code, description }] }] }.
// Regels hebben geen aantallen of tarieven: een formaat geeft alleen de structuur.
window.BudgetTemplates = ${JSON.stringify(templates)};
`;
fs.writeFileSync("src/js/budget-templates.js", out);
console.log(`sections ${sections.length}, lines ${lineCount}, colours ${sections.filter((s) => s.color).length}, bytes ${fs.statSync("src/js/budget-templates.js").size}`);
if (missingNames.length) console.log("geen naam gevonden voor:", missingNames.join(", "));
