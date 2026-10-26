// Genereert src/js/budget-templates.js (window.BudgetTemplates) uit de eigen
// Tubes-kostenstructuur in scripts/budget-data/tubes-budget-structure.json.
// Draaien: node scripts/gen-budget-templates.mjs
import fs from "node:fs";
const source = JSON.parse(fs.readFileSync("scripts/budget-data/tubes-budget-structure.json", "utf8"));
const COLORS = [
  "#F4B6C2", "#F7C5A8", "#F9D5A7", "#FBE3A7", "#EDE6A6",
  "#D7E8A6", "#BFE3B4", "#AEE2C3", "#A9E3D6", "#A7DDE3",
  "#A9D2EA", "#B5C8EA", "#C4BDE8", "#D4B8E5", "#E2B8DE",
];
const sections = source.sections.map((section, sectionIndex) => ({
  number: section.number,
  name: section.name,
  color: COLORS[sectionIndex % COLORS.length],
  lines: section.lines.map((description, lineIndex) => ({
    code: String(Number(section.number) + (lineIndex + 1) * 3).padStart(4, "0"),
    description,
  })),
}));
const lineCount = sections.reduce((total, section) => total + section.lines.length, 0);

const templates = [
  { id: "blank", name: "Start from scratch", description: "Add your own areas and costs." },
  { id: source.id, name: source.name, description: source.description, sections },
];
const out = `// Budgetformaten (rekeningschema's) voor de gratis Budget Builder.
// GEGENEREERD door scripts/gen-budget-templates.mjs uit de eigen Tubes-
// kostenstructuur. Niet met de hand bewerken; pas het bronbestand of het
// script aan en genereer opnieuw.
// Vorm: { id, name, description, sections: [{ number, name, color, lines: [{ code, description }] }] }.
// Regels hebben geen aantallen of tarieven: een formaat geeft alleen de structuur.
window.BudgetTemplates = ${JSON.stringify(templates)};
`;
fs.writeFileSync("src/js/budget-templates.js", out);
console.log(`sections ${sections.length}, lines ${lineCount}, colours ${sections.filter((s) => s.color).length}, bytes ${fs.statSync("src/js/budget-templates.js").size}`);
