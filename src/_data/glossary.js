// Woordenlijst (/film-production-glossary/). De begrippen staan in
// glossary-terms.json (CMS: "Woordenlijst"); hier worden ze gesorteerd, per
// letter ingedeeld en worden de see_also-slugs omgezet in { slug, term }.
// Een see_also naar een begrip dat niet bestaat valt stil weg.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { terms: raw } = JSON.parse(fs.readFileSync(path.join(dir, "glossary-terms.json"), "utf8"));

const sortKey = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const terms = [...raw].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term)));
const bySlug = new Map(terms.map((t) => [t.slug, t]));
const letterOf = (t) => {
  const c = sortKey(t.term).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

export default {
  letters: [...new Set(terms.map(letterOf))],
  terms: terms.map((t) => ({
    ...t,
    letter: letterOf(t),
    see_also: (t.see_also || []).filter((s) => s !== t.slug && bySlug.has(s)).map((s) => ({ slug: s, term: bySlug.get(s).term })),
    search: [t.term, ...(t.aka || []), t.definition].join(" ").toLowerCase().replace(/"/g, ""),
  })),
};
