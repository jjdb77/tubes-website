// Tests voor de pure functies van de gratis tool Budget version compare.
// Draaien zonder browser: `npm test`. Het script hangt zijn functies aan
// globalThis.BudgetCompare en slaat het DOM-deel over als er geen document is.
//
// Fixtures: version-a.xlsx (titelregels boven de kop, twee werkbladen, getallen
// als getallen) en version-b.csv (puntkomma, Windows-1252, Europese notatie).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");
const src = fs.readFileSync(path.join(here, "..", "src", "js", "budget-compare.js"), "utf8");
vm.runInThisContext(src);
const BC = globalThis.BudgetCompare;
let n = 0;
const t = (name, fn) => { n++; try { fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n     ", e.message); process.exitCode = 1; } };

t("parseAmount notaties", () => {
  const p = BC.parseAmount;
  assert.equal(p("1.234,56", "auto"), 1234.56);
  assert.equal(p("1,234.56", "auto"), 1234.56);
  assert.equal(p("€ 1.500", "auto"), 1500);
  assert.equal(p("1,500", "auto"), 1500);
  assert.equal(p("1,500", "eu"), 1.5);
  assert.equal(p("1.500", "us"), 1.5);
  assert.equal(p("12,5", "auto"), 12.5);
  assert.equal(p("0,50", "auto"), 0.5);
  assert.equal(p("1.234.567", "auto"), 1234567);
  assert.equal(p("(2.000)", "auto"), -2000);
  assert.equal(p("1500-", "auto"), -1500);
  assert.equal(p("-1,000.25", "auto"), -1000.25);
  assert.equal(p("", "auto"), null);
  assert.equal(p("-", "auto"), null);
  assert.equal(p("n/a", "auto"), null);
  assert.equal(p(42, "auto"), 42);
});
t("detectNumberFormat", () => {
  assert.equal(BC.detectNumberFormat(["1.234,56", "45.000,00", "12,00"]), "eu");
  assert.equal(BC.detectNumberFormat(["1,234.56", "45,000.00"]), "us");
  assert.equal(BC.detectNumberFormat(["1500", "2000"]), "auto");
});
t("delimiter en quotes", () => {
  assert.equal(BC.detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(BC.detectDelimiter("a;b;c\n1;2,5;3"), ";");
  assert.equal(BC.detectDelimiter("a,b,c\n1,2,3"), ",");
  const rows = BC.parseText('Code,Line,Total\r\n1100,"Story, rights & ""more""",45000\r\n\r\n');
  assert.deepEqual(rows, [["Code", "Line", "Total"], ["1100", 'Story, rights & "more"', "45000"]]);
  // Een aanhalingsteken middenin een veld is gewoon tekst (komt voor in exports)
  assert.deepEqual(BC.parseText('2700;Catering & "craft" <services>;24.500,00'), [["2700", 'Catering & "craft" <services>', "24.500,00"]]);
});
t("kopregel na titelregels + mapping", () => {
  const rows = [["Production: X"], ["Acct", "Description", "Qty", "Rate", "Total"], ["1100", "Story", "1", "100", "100"]];
  assert.equal(BC.findHeaderIndex(rows), 1);
  const m = BC.detectMapping(rows.slice(1), true);
  assert.deepEqual(m, { code: 0, desc: 1, amount: 4, group: -1 });
});
t("mapping zonder kopregel", () => {
  const rows = [["1100", "Story & rights", "45.000"], ["1200", "Producers", "120.000"], ["1300", "Director", "85.000"]];
  assert.equal(BC.findHeaderIndex(rows), -1);
  const m = BC.detectMapping(rows, false);
  assert.equal(m.amount, 2); assert.equal(m.desc, 1); assert.equal(m.code, 0);
});
t("extractLines: kopjes, totalen, sectie", () => {
  const v = { rows: [["Account", "Description", "Total"], ["", "ABOVE THE LINE", ""], ["1100", "Story", "45.000"], ["", "Total above the line", "45.000"], ["", "BELOW", ""], ["2100", "Staff", "10.000"], ["", "GRAND TOTAL", "55.000"]],
    mapping: { code: 0, desc: 1, amount: 2, group: -1 }, headerRow: true, numberFormat: "auto", ignoreTotals: true };
  const { lines, skippedTotals } = BC.extractLines(v);
  assert.equal(skippedTotals, 2);
  assert.deepEqual(lines.map((l) => [l.code, l.group, l.amount]), [["1100", "ABOVE THE LINE", 45000], ["2100", "BELOW", 10000]]);
});
t("compareLines: changed/added/removed en groepen", () => {
  const A = [{ code: "1100", desc: "Story", amount: 45000, group: "ATL" }, { code: "1200", desc: "Producers", amount: 120000, group: "ATL" }, { code: "4200", desc: "Legal", amount: 14000, group: "OTHER" }];
  const B = [{ code: "1100", desc: "Story", amount: 45000, group: "ATL" }, { code: "1200", desc: "Producers", amount: 125000, group: "ATL" }, { code: "2550", desc: "Weather cover", amount: 9000, group: "BTL" }];
  const r = BC.compareLines(A, B);
  assert.equal(r.totalA, 179000); assert.equal(r.totalB, 179000);
  assert.equal(r.changed, 1); assert.equal(r.added, 1); assert.equal(r.removed, 1); assert.equal(r.same, 1);
  assert.equal(r.matchedOn, "code");
  assert.deepEqual(r.groups.map((g) => [g.name, g.changes]), [["ATL", 1], ["OTHER", 1], ["BTL", 1]]);
  const p = r.rows.find((x) => x.code === "1200"); assert.equal(p.delta, 5000); assert.ok(Math.abs(p.pct - 4.1667) < 0.001);
});
t("compareLines: dubbele codes → code+desc, zonder codes → desc", () => {
  const A = [{ code: "10", desc: "Camera", amount: 1, group: "" }, { code: "10", desc: "Lenses", amount: 2, group: "" }];
  const B = [{ code: "10", desc: "Camera", amount: 1, group: "" }, { code: "10", desc: "Lenses", amount: 3, group: "" }];
  assert.equal(BC.compareLines(A, B).matchedOn, "code+desc");
  assert.equal(BC.compareLines(A, B).changed, 1);
  const C = [{ code: "", desc: "Camera  rental", amount: 1, group: "" }];
  const D = [{ code: "", desc: "camera rental", amount: 1, group: "" }];
  assert.equal(BC.compareLines(C, D).same, 1);
});
await (async () => {
  const buf = fs.readFileSync(path.join(fixtures, "version-a.xlsx"));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let sheets;
  try { sheets = await BC.parseXlsx(ab); } catch (e) { console.log("FAIL xlsx parse:", e); process.exitCode = 1; return; }
  t("xlsx: werkbladen en cellen", () => {
    assert.deepEqual(sheets.map((s) => s.name), ["Notes", "Budget"]);
    const rows = sheets[1].rows;
    assert.equal(rows[0][0], "Production: Northern Crossing");
    const hi = BC.findHeaderIndex(rows); assert.equal(hi, 2, "lege regel is weggefilterd");
    const data = rows.slice(hi);
    assert.deepEqual(data[0], ["Acct", "Description", "Qty", "Rate", "Total"]);
    assert.equal(data[2][0], 1100); assert.equal(data[2][4], 45000);
    assert.equal(data[3][4], 120000);
    assert.equal(data[9][1], 'Catering & "craft" <services>');
    assert.equal(data[8][4], 96000.5);
    const m = BC.detectMapping(data, true);
    assert.deepEqual(m, { code: 0, desc: 1, amount: 4, group: -1 });
    const { lines, skippedTotals } = BC.extractLines({ rows: data, mapping: m, headerRow: true, numberFormat: "auto", ignoreTotals: true });
    assert.equal(skippedTotals, 2);
    assert.equal(lines.length, 6);
    assert.equal(lines.reduce((s, l) => s + l.amount, 0), 655500.5);
  });
  t("csv windows-1252 + eu-getallen, vergelijking met xlsx", () => {
    const cbuf = fs.readFileSync(path.join(fixtures, "version-b.csv"));
    const cab = cbuf.buffer.slice(cbuf.byteOffset, cbuf.byteOffset + cbuf.byteLength);
    let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(cab); } catch { text = new TextDecoder("windows-1252").decode(cab); }
    const rows = BC.parseText(text);
    assert.equal(rows[2][2], "€ 45.000,00");
    const m = BC.detectMapping(rows, true);
    assert.deepEqual(m, { code: 0, desc: 1, amount: 2, group: -1 });
    const fmt = BC.detectNumberFormat(rows.slice(1).map((r) => r[2])); assert.equal(fmt, "eu");
    const b = BC.extractLines({ rows, mapping: m, headerRow: true, numberFormat: fmt, ignoreTotals: true });
    assert.equal(b.skippedTotals, 2); assert.equal(b.lines.length, 7);
    const data = sheets[1].rows.slice(3);
    const a = BC.extractLines({ rows: data, mapping: BC.detectMapping(data, true), headerRow: true, numberFormat: "auto", ignoreTotals: true });
    const r = BC.compareLines(a.lines, b.lines);
    assert.equal(r.totalA, 655500.5); assert.equal(r.totalB, 684900.5);
    assert.equal(r.added, 1); assert.equal(r.removed, 0); assert.equal(r.changed, 2); assert.equal(r.same, 4);
    assert.equal(r.rows.find((x) => x.code === "2550").status, "added");
    assert.equal(r.rows.find((x) => x.code === "2100").delta, 8400);
    assert.equal(r.hasCents, true);
  });
})();
console.log(`${n} tests, exit ${process.exitCode || 0}`);
