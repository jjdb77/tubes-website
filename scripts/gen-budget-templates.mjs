import fs from "node:fs"; import vm from "node:vm";
vm.runInThisContext(fs.readFileSync("src/js/budget-compare.js", "utf8"));
const BC = globalThis.BudgetCompare;
const buf = fs.readFileSync("test/fixtures/magic-movie-template.xlsx");
const sheets = await BC.parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const rows = sheets[0].rows;
const ACRONYMS = ["ATL", "BTL", "VFX", "ADR", "SA", "TV", "DP", "UPM", "AD", "DIT", "SFX", "PA", "EPK", "MOS", "VTR"];
const title = (s) => {
  let t = String(s).toLowerCase().replace(/(^|[\s,&/(-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  for (const a of ACRONYMS) t = t.replace(new RegExp("\\b" + a[0] + a.slice(1).toLowerCase() + "\\b", "g"), a);
  return t;
};
const sections = []; let cur = null;
for (const r of rows) {
  if (typeof r[0] === "number" && r[1]) { cur = { number: String(r[0]), name: title(r[1]), lines: [] }; sections.push(cur); }
  else if (cur && typeof r[2] === "number") cur.lines.push({ code: String(r[2]), description: title(r[3] || "") });
}
const lineCount = sections.reduce((n, s) => n + s.lines.length, 0);
const templates = [
  { id: "blank", name: "Blank", description: "Start from nothing and add your own sections and lines." },
  { id: "movie-magic", name: "Movie Magic (film and TV standard)", description: `The category and account numbering of Movie Magic Budgeting: ${sections.length} sections and ${lineCount} accounts, from 1100 Development to 7100 Rebates. Quantities and rates start empty.`, sections },
];
const body = JSON.stringify(templates, null, 1).replace(/\n\s+(?=[{}\]"])/g, (m) => (m.trim() === "" && m.length > 3 ? " " : m));
const out = `// Budgetformaten (rekeningschema's) voor de gratis Budget Builder.
// "movie-magic": de standaard categorie- en accountindeling van Movie Magic
// Budgeting, gegenereerd uit test/fixtures/magic-movie-template.xlsx met
// scripts/gen-budget-templates.mjs. Nieuwe formaten: een object met id, name,
// description en sections [{ number, name, lines: [{ code, description }] }].
// Regels hebben geen aantallen of tarieven: een formaat geeft alleen de structuur.
window.BudgetTemplates = ${JSON.stringify(templates)};
`;
fs.writeFileSync("src/js/budget-templates.js", out);
console.log("sections", sections.length, "lines", lineCount, "bytes", fs.statSync("src/js/budget-templates.js").size);
console.log(sections[0].name, "|", sections[0].lines[0].description, "|", sections[4].name);
