// Tests voor de pure delen van de gratis Budget Builder: getallen, totalen,
// import van regels naar secties en de Excel-schrijver (roundtrip via de lezer
// van de vergelijkingstool). Draaien zonder browser: `npm test`.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, "..", "src", "js", "budget-compare.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(here, "..", "src", "js", "budget-builder.js"), "utf8"));
const C = globalThis.BudgetBuilderCore;
const BC = globalThis.BudgetCompare;
let n = 0;
const t = (name, fn) => { n++; try { fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n     ", e.message); process.exitCode = 1; } };

t("parseNum: getypte getallen in beide notaties", () => {
  assert.equal(C.parseNum("1,5"), 1.5);
  assert.equal(C.parseNum("1.5"), 1.5);
  assert.equal(C.parseNum("1.234,56"), 1234.56);
  assert.equal(C.parseNum("1,234.56"), 1234.56);
  assert.equal(C.parseNum("60.000"), 60000);
  assert.equal(C.parseNum("1.234.567"), 1234567);
  assert.equal(C.parseNum("€ 12"), 12);
  assert.equal(C.parseNum("-3"), -3);
  assert.equal(C.parseNum(""), 0);
  assert.equal(C.parseNum(7), 7);
});

const budget = {
  name: "Draft 1", production: "Test", currency: "EUR", vat: 21, date: "2026-09-02",
  additionals: [{ name: "Contingency", percent: 10 }],
  sections: [
    { number: "1100", name: "Development", lines: [{ code: "1102", description: "Dev", remarks: "", qty: "1", unit: "allow", rate: "60.000" }, { code: "1104", description: "Script & rights", qty: "2", unit: "flat", rate: "1.234,56" }] },
    { number: "2000", name: "Staff", lines: [{ code: "2001", description: "PM", qty: 10, unit: "weeks", rate: 100 }] },
  ],
};
t("totalsOf: subtotaal, percentage, btw", () => {
  const tot = C.totalsOf(budget);
  assert.equal(tot.subtotal, 63469.12);
  assert.equal(tot.additionals[0].amount, 6346.91);
  assert.equal(tot.totalExcl, 69816.03);
  assert.equal(tot.vat, 14661.37);
  assert.equal(tot.totalIncl, 84477.4);
  assert.equal(C.lineCountOf(budget), 3);
});

t("linesToSections: secties uit topsheet of codeprefix", () => {
  const lookup = new Map([["1100", "DEVELOPMENT"], ["2000", "STAFF"]]);
  const lines = [{ code: "1102", desc: "Dev", amount: 10, group: "DEVELOPMENT" }, { code: "1104", desc: "Script", amount: 20, group: "DEVELOPMENT" }, { code: "2001", desc: "PM", amount: 30, group: "STAFF" }, { code: "", desc: "Loose", amount: 5, group: "" }];
  const sections = C.linesToSections(lines, lookup);
  assert.deepEqual(sections.map((s) => [s.number, s.name, s.lines.length]), [["1100", "DEVELOPMENT", 2], ["2000", "STAFF", 1], ["3000", "Budget lines", 1]]);
  assert.deepEqual(sections[0].lines[0], { code: "1102", description: "Dev", qty: 1, unit: "", rate: 10 });
  const noLookup = C.linesToSections([{ code: "4120", desc: "X", amount: 1, group: "Post" }], null);
  assert.equal(noLookup[0].number, "4100");
});

await (async () => {
  const blob = C.buildXlsxFor(budget);
  const sheets = await BC.parseXlsx(await blob.arrayBuffer());
  t("Excel-export: opbouw als de Tubes-export, leesbaar door de vergelijkingstool", () => {
    assert.deepEqual(sheets.map((s) => s.name), ["Budget", "Summary by Category"]);
    const rows = sheets[0].rows;
    assert.deepEqual(rows[0], ["Draft 1"]);
    assert.ok(rows[1].includes("Project: Test") && rows[1].includes("Currency: EUR"));
    assert.deepEqual(rows[2], ["BUDGET SUMMARY"]);
    assert.deepEqual(rows[3], ["Budget Total", 63469.12]);
    const hi = BC.findHeaderIndex(rows);
    assert.deepEqual(rows[hi], ["Type", "Description", "Remarks", "Qty", "Unit", "Price/Unit", "Budget Total"]);
    assert.equal(rows[hi + 1][0], "1100 - Development", "categorieregel");
    assert.deepEqual(rows[hi + 2], ["1102", "Dev", "", 1, "allow", 60000, 60000], "regel met gecachete formulewaarde");
    assert.equal(rows[hi + 3][6], 2469.12);
    const foot = rows.find((r) => r[4] === "Total (excl. VAT)");
    assert.equal(foot[6], 63469.12);
    assert.equal(rows.at(-1)[4], "Total incl. VAT");
    assert.equal(rows.at(-1)[6], 84477.4);
    // De vergelijkingstool leest hem als budget: 3 regels, 2 secties, totalen overgeslagen
    const a = BC.analyseSheet(rows);
    const { lines, skippedTotals } = BC.extractLines({ ...a, numberFormat: "auto", ignoreTotals: true });
    assert.equal(lines.length, 3);
    assert.equal(skippedTotals, 0, "voetregels staan in kolom E en tellen niet als regel");
    assert.deepEqual([...new Set(lines.map((l) => l.group))], ["1100 - Development", "2000 - Staff"]);
    const s2 = sheets[1].rows;
    assert.deepEqual(s2[2], ["Category", "# Items", "Budget Total", "% of Budget"]);
    assert.deepEqual(s2.at(-1), ["TOTAL", 3, 63469.12, "100%"]);
  });
})();
console.log(`${n} tests, exit ${process.exitCode || 0}`);
