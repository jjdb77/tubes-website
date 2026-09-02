/* Budget Builder — gratis tool op /tools/budget-builder/.
 *
 * Eén stap: secties met budgetregels (code, omschrijving, opmerking, aantal,
 * eenheid, tarief) en percentages daarbovenop (contingency, production fee).
 * Alleen de kostenkant; geen verkoopprijzen of offertes.
 *
 * - Alles staat in de browser (localStorage) en rekent lokaal.
 * - Opslaan van een versie vraagt om een account (e-mail + wachtwoord); de
 *   server (server.js, /api/tools/*) bewaart hoogstens tien versies van één
 *   budget met hoogstens 2000 regels. Inloggen kan vooraf, tussendoor of achteraf.
 * - Import: Movie Magic-export of elk budget als xlsx/CSV, via de lezer van de
 *   vergelijkingstool (window.BudgetCompare uit budget-compare.js).
 * - Formaten (rekeningschema's) komen uit budget-templates.js (window.BudgetTemplates).
 * - Export: Excel in de lay-out van de Tubes-export (eigen minimale xlsx-schrijver,
 *   zonder bibliotheek), CSV en print.
 *
 * Netwerk: alleen fetch naar /api/tools/* op de eigen host; de CSP van deze
 * pagina staat niets anders toe.
 */
(function () {
  "use strict";

  const root = typeof document === "undefined" ? null : document.querySelector("[data-budget-builder]");
  const MAX_LINES = Number(root && root.dataset.maxLines) || 2000;
  const MAX_VERSIONS = Number(root && root.dataset.maxVersions) || 10;
  const STORAGE_KEY = "tubes-budget-builder";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14));
  const today = () => new Date().toISOString().slice(0, 10);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
  const dateLabel = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

  // ---------- Model ----------

  const newLine = (p = {}) => ({ id: uid(), code: String(p.code ?? ""), description: String(p.description ?? ""), remarks: String(p.remarks ?? ""), qty: p.qty ?? "", unit: String(p.unit ?? ""), rate: p.rate ?? "" });
  const newSection = (p = {}) => ({ id: uid(), number: String(p.number ?? ""), name: String(p.name ?? ""), color: String(p.color ?? ""), lines: (p.lines || []).map(newLine) });
  const newAdditional = (p = {}) => ({ id: uid(), name: String(p.name ?? "Contingency"), percent: p.percent ?? 10 });
  const emptyBudget = () => ({ id: uid(), name: "Draft 1", production: "", currency: "EUR", vat: 21, date: today(), template: "", sections: [], additionals: [] });

  // Getypte getallen, zelfde regels als de vergelijkingstool: bij twee soorten
  // scheidingstekens is het laatste het decimaalteken ("1.234,56"); één
  // scheidingsteken met precies drie cijfers erachter is een duizendtal
  // ("60.000", "1,500"), anders het decimaalteken ("1,5", "12.50").
  function parseNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    let s = String(v ?? "").trim().replace(/[\s\u00a0']/g, "");
    if (!s) return 0;
    const neg = /^-/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc >= 0 || ld >= 0) {
      const sep = lc >= 0 ? "," : ".";
      const parts = s.split(sep);
      s = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join("") : parts.join(".");
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -n : n;
  }
  const lineTotal = (l) => round2(parseNum(l.qty) * parseNum(l.rate));
  const sectionTotal = (s) => round2(s.lines.reduce((n, l) => n + lineTotal(l), 0));
  const lineCountOf = (b) => b.sections.reduce((n, s) => n + s.lines.length, 0);
  const lineCount = () => lineCountOf(budget);

  function totalsOf(b) {
    const subtotal = round2(b.sections.reduce((n, s) => n + sectionTotal(s), 0));
    const additionals = (b.additionals || []).map((a) => ({ ...a, amount: round2((subtotal * parseNum(a.percent)) / 100) }));
    const totalExcl = round2(subtotal + additionals.reduce((n, a) => n + a.amount, 0));
    const vat = round2((totalExcl * parseNum(b.vat)) / 100);
    return { subtotal, additionals, totalExcl, vat, totalIncl: round2(totalExcl + vat) };
  }
  const totals = () => totalsOf(budget);

  const numberFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const money = (n) => numberFormat.format(round2(n));

  // ---------- Excel-schrijver (xlsx = zip met XML, hier zonder compressie) ----------

  const xmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  const colRef = (idx) => { let ref = ""; let i = idx; while (i >= 0) { ref = String.fromCharCode(65 + (i % 26)) + ref; i = Math.floor(i / 26) - 1; } return ref; };

  // Stijlen: 0 standaard, 1 titel, 2 info, 3 samenvattingslabel, 4 samenvattingswaarde,
  // 5 tabelkop midden, 6 tabelkop links, 7 categorie, 8 tekst, 9 getal, 10 bedrag,
  // 11 midden, 12 voetlabel, 13 voetwaarde (zelfde opzet als de export van Tubes)
  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF9FAFB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="4" fontId="4" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="4" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // Eén werkblad opbouwen uit rijen van cellen: {t: "s"|"n"|"f", v, f, s}
  function sheetXml(rows, widths, merges) {
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const body = rows.map((cells, r) => {
      const xml = cells.map((c, i) => {
        if (c == null) return "";
        const ref = colRef(i) + (r + 1);
        const s = c.s != null ? ` s="${c.s}"` : "";
        if (c.t === "n") return `<c r="${ref}"${s}><v>${Number(c.v) || 0}</v></c>`;
        if (c.t === "f") return `<c r="${ref}"${s}><f>${xmlEsc(c.f)}</f><v>${Number(c.v) || 0}</v></c>`;
        if (c.v === "" || c.v == null) return `<c r="${ref}"${s}/>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}">${xml}</row>`;
    }).join("");
    const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${body}</sheetData>${mergeXml}</worksheet>`;
  }

  function buildXlsxFor(b) {
    const t = totalsOf(b);
    const S = (v, s) => ({ t: "s", v, s });
    const N = (v, s) => ({ t: "n", v, s });
    const F = (f, v, s) => ({ t: "f", f, v, s });
    const E = (s) => ({ t: "s", v: "", s });
    const W = 7; // kolommen A..G
    const blankRow = () => [];
    const styledRow = (style, first) => [S(first, style), ...Array.from({ length: W - 1 }, () => E(style))];

    // Blad 1: Budget, in de opbouw van de Tubes-export
    const rows = [];
    const merges = [];
    rows.push([S(b.name || "Budget", 1)]);
    rows.push(blankRow());
    const info = [];
    if (b.production) info.push(`Project: ${b.production}`);
    info.push(`Version: ${b.name || "Untitled"}`);
    if (b.currency) info.push(`Currency: ${b.currency}`);
    info.push(`Date: ${dateLabel(b.date || today())}`);
    rows.push(info.map((x) => S(x, 2)));
    rows.push(blankRow());
    rows.push([S("BUDGET SUMMARY", 1)]);
    rows.push([S("Budget Total", 3), N(t.subtotal, 4)]);
    for (const a of t.additionals) rows.push([S(`${a.name} ${parseNum(a.percent)}%`, 3), N(a.amount, 4)]);
    if (t.additionals.length) rows.push([S("Total incl. additional costs", 3), N(t.totalExcl, 4)]);
    rows.push([S(`VAT ${parseNum(b.vat)}%`, 3), N(t.vat, 4)]);
    rows.push([S("Total incl. VAT", 3), N(t.totalIncl, 4)]);
    rows.push(blankRow());
    rows.push(blankRow());
    rows.push([S("Type", 6), S("Description", 6), S("Remarks", 6), S("Qty", 5), S("Unit", 5), S("Price/Unit", 5), S("Budget Total", 5)]);
    let dataStart = null;
    for (const s of b.sections) {
      const label = `${s.number || "00"} - ${s.name || "Uncategorized"}`;
      rows.push(styledRow(7, label));
      merges.push(`A${rows.length}:${colRef(W - 1)}${rows.length}`);
      for (const l of s.lines) {
        const r = rows.length + 1;
        if (dataStart === null) dataStart = r;
        rows.push([S(l.code || "-", 11), S(l.description, 8), S(l.remarks, 8), N(parseNum(l.qty), 9), S(l.unit, 11), N(parseNum(l.rate), 10), F(`ROUND(D${r}*F${r},2)`, lineTotal(l), 10)]);
      }
    }
    const dataEnd = rows.length;
    rows.push(blankRow());
    const footRow = rows.length + 1;
    const sumFormula = dataStart ? `SUM(G${dataStart}:G${dataEnd})` : "0";
    rows.push([null, null, null, null, S("Total (excl. VAT)", 12), E(12), F(sumFormula, t.subtotal, 13)]);
    merges.push(`E${footRow}:F${footRow}`);
    let lastTotalRow = footRow;
    if (t.additionals.length) {
      const addRows = [];
      for (const a of t.additionals) {
        rows.push([null, null, null, null, S(`${a.name} ${parseNum(a.percent)}%`, 12), E(12), F(`ROUND(G${footRow}*${parseNum(a.percent)}/100,2)`, a.amount, 13)]);
        merges.push(`E${rows.length}:F${rows.length}`);
        addRows.push(rows.length);
      }
      rows.push([null, null, null, null, S("Total incl. additional costs", 12), E(12), F(`G${footRow}+${addRows.map((r) => `G${r}`).join("+")}`, t.totalExcl, 13)]);
      merges.push(`E${rows.length}:F${rows.length}`);
      lastTotalRow = rows.length;
    }
    rows.push([null, null, null, null, S(`VAT ${parseNum(b.vat)}%`, 12), E(12), F(`ROUND(G${lastTotalRow}*${parseNum(b.vat)}/100,2)`, t.vat, 13)]);
    merges.push(`E${rows.length}:F${rows.length}`);
    rows.push([null, null, null, null, S("Total incl. VAT", 12), E(12), F(`G${lastTotalRow}+G${rows.length}`, t.totalIncl, 13)]);
    merges.push(`E${rows.length}:F${rows.length}`);
    const sheet1 = sheetXml(rows, [8, 30, 25, 8, 10, 12, 15], merges);

    // Blad 2: Summary by Category
    const rows2 = [[S("Category Summary", 1)], [S(`Generated: ${dateLabel(today())}`, 2)], blankRow(), [S("Category", 6), S("# Items", 6), S("Budget Total", 6), S("% of Budget", 6)]];
    for (const s of b.sections) {
      const st = sectionTotal(s);
      rows2.push([S(`${s.number || "00"} - ${s.name || "Uncategorized"}`, 8), N(s.lines.length, 9), N(st, 10), S(t.subtotal ? `${((st / t.subtotal) * 100).toFixed(1)}%` : "0%", 11)]);
    }
    rows2.push(blankRow());
    rows2.push([S("TOTAL", 12), N(lineCountOf(b), 13), N(t.subtotal, 13), S("100%", 12)]);
    const sheet2 = sheetXml(rows2, [40, 10, 16, 12], []);

    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Summary by Category" sheetId="2" r:id="rId2"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", STYLES_XML],
      ["xl/worksheets/sheet1.xml", sheet1],
      ["xl/worksheets/sheet2.xml", sheet2],
    ];
    return zipStore(files);
  }

  // Zip zonder compressie: elke browser kan het maken en Excel leest het gewoon.
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nameBytes = enc.encode(name);
      const data = enc.encode(content);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
      parts.push(local.buffer, nameBytes, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameBytes.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
      central.push(cd.buffer, nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const centralSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
    return new Blob([...parts, ...central, eocd.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const buildXlsx = () => buildXlsxFor(budget);

  // Regels met een sectienaam → secties met nummer, regels met aantal 1 en het bedrag als tarief
  function linesToSections(lines, lookup) {
    const sections = [];
    const byGroup = new Map();
    const lookupNumber = (code) => {
      if (!lookup || !/^\d+$/.test(code)) return "";
      if (lookup.has(code)) return code;
      for (let k = 1; k < code.length; k++) { const c = code.slice(0, code.length - k) + "0".repeat(k); if (lookup.has(c)) return c; }
      return "";
    };
    for (const l of lines) {
      const key = (l.group || "").trim().toLowerCase();
      let s = byGroup.get(key);
      if (!s) {
        const code = String(l.code || "").replace(/\s/g, "");
        let number = lookupNumber(code);
        if (!number && /^\d{3,}$/.test(code)) number = code.slice(0, code.length - 2) + "00";
        s = { number, name: l.group || "Budget lines", lines: [] };
        byGroup.set(key, s);
        sections.push(s);
      }
      s.lines.push({ code: l.code, description: l.desc, qty: 1, unit: "", rate: l.amount });
    }
    sections.forEach((s, i) => { if (!s.number) s.number = String((i + 1) * 1000); });
    return sections;
  }

  // Pure delen, ook zonder browser te testen (test/budget-builder.test.mjs)
  if (typeof globalThis !== "undefined") globalThis.BudgetBuilderCore = { parseNum, totalsOf, lineCountOf, buildXlsxFor, linesToSections };
  if (!root) return;

  // ---------- Opslag in de browser ----------

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const b = JSON.parse(raw);
      if (!b || !Array.isArray(b.sections)) return null;
      b.additionals = Array.isArray(b.additionals) ? b.additionals : [];
      return b;
    } catch { return null; }
  }
  let saveTimer = null;
  function saveLocal() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(budget)); } catch { /* privémodus of vol: dan alleen in het geheugen */ }
    }, 250);
  }

  let budget = loadLocal() || emptyBudget();
  let dirty = false; // sinds de laatste opgeslagen versie
  const touch = () => { dirty = true; saveLocal(); renderAccount(); };

  // ---------- Meldingen en dialogen ----------

  const noticeEl = $("[data-bb-notice]");
  let noticeTimer = null;
  function notice(text, kind) {
    noticeEl.textContent = text;
    noticeEl.className = "bb-notice" + (kind ? " is-" + kind : "");
    noticeEl.hidden = !text;
    clearTimeout(noticeTimer);
    if (text && kind !== "error") noticeTimer = setTimeout(() => { noticeEl.hidden = true; }, 6000);
  }
  const dialogs = Object.fromEntries($$("[data-bb-dialog]").map((d) => [d.dataset.bbDialog, d]));
  function openDialog(name) {
    for (const d of Object.values(dialogs)) if (d.open) d.close();
    const d = dialogs[name];
    if (d && typeof d.showModal === "function") d.showModal();
  }
  for (const d of Object.values(dialogs)) {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    $("[data-bb-close]", d).addEventListener("click", () => d.close());
  }
  for (const b of $$("[data-bb-open]")) b.addEventListener("click", () => { prepareDialog(b.dataset.bbOpen); openDialog(b.dataset.bbOpen); });

  // ---------- Weergave ----------

  const sectionsEl = $("[data-bb-sections]");
  const metaInputs = $$("[data-bb-meta]");

  function renderMeta() {
    for (const input of metaInputs) {
      const value = budget[input.dataset.bbMeta] ?? "";
      input.value = value;
      // Valuta uit een oudere versie die niet in de lijst staat: terug naar EUR
      if (input.tagName === "SELECT" && input.value !== String(value)) { input.value = "EUR"; budget[input.dataset.bbMeta] = "EUR"; }
    }
  }

  function lineRow(s, l) {
    return `<tr class="bb-line" data-line="${l.id}">
      <td class="bb-col-code"><input type="text" data-field="code" value="${esc(l.code)}" aria-label="Code" autocomplete="off"></td>
      <td class="bb-col-desc"><input type="text" data-field="description" value="${esc(l.description)}" placeholder="Description" aria-label="Description" autocomplete="off"></td>
      <td class="bb-col-remarks"><input type="text" data-field="remarks" value="${esc(l.remarks)}" placeholder="Remarks" aria-label="Remarks" autocomplete="off"></td>
      <td class="bb-col-qty"><input type="text" inputmode="decimal" data-field="qty" value="${esc(l.qty)}" placeholder="0" aria-label="Quantity" autocomplete="off"></td>
      <td class="bb-col-unit"><input type="text" data-field="unit" value="${esc(l.unit)}" placeholder="unit" aria-label="Unit" autocomplete="off"></td>
      <td class="bb-col-rate"><input type="text" inputmode="decimal" data-field="rate" value="${esc(l.rate)}" placeholder="0" aria-label="Rate" autocomplete="off"></td>
      <td class="bb-col-total bb-num" data-line-total>${money(lineTotal(l))}</td>
      <td class="bb-col-actions"><button type="button" class="bb-icon" data-act="up-line" title="Move up" aria-label="Move line up">&#8593;</button><button type="button" class="bb-icon" data-act="down-line" title="Move down" aria-label="Move line down">&#8595;</button><button type="button" class="bb-icon bb-icon-danger" data-act="del-line" title="Delete line" aria-label="Delete line">&times;</button></td>
    </tr>`;
  }

  function sectionCard(s) {
    const catalog = catalogFor(s);
    const used = new Set(s.lines.map((l) => String(l.code).trim()));
    const available = catalog ? catalog.filter((c) => !used.has(String(c.code))) : [];
    const picker = catalog ? `<select class="bb-pick" data-act="pick-line" aria-label="Add a cost type from the template"><option value="">${available.length ? `Add a cost type… (${available.length})` : "All cost types added"}</option>${available.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} ${esc(c.description)}</option>`).join("")}</select>` +
      (available.length > 1 ? `<button type="button" class="bc-link-button" data-act="add-all">Add all ${available.length}</button>` : "") : "";
    return `<section class="bb-section" data-section="${s.id}"${s.color ? ` style="--section-color: ${esc(s.color)}"` : ""}>
      <div class="bb-section-head">
        <input type="text" class="bb-section-number" data-sfield="number" value="${esc(s.number)}" placeholder="1000" aria-label="Section number" autocomplete="off">
        <input type="text" class="bb-section-name" data-sfield="name" value="${esc(s.name)}" placeholder="Section name" aria-label="Section name" autocomplete="off">
        <span class="bb-section-total bb-num" data-section-total>${money(sectionTotal(s))}</span>
        <span class="bb-section-actions"><button type="button" class="bb-icon" data-act="up-section" title="Move section up" aria-label="Move section up">&#8593;</button><button type="button" class="bb-icon" data-act="down-section" title="Move section down" aria-label="Move section down">&#8595;</button><button type="button" class="bb-icon bb-icon-danger" data-act="del-section" title="Delete section" aria-label="Delete section">&times;</button></span>
      </div>
      <div class="bb-table-wrap"><table class="bb-table">
        <thead><tr><th class="bb-col-code">Code</th><th class="bb-col-desc">Description</th><th class="bb-col-remarks">Remarks</th><th class="bb-col-qty bb-num">Qty</th><th class="bb-col-unit">Unit</th><th class="bb-col-rate bb-num">Rate</th><th class="bb-col-total bb-num">Total</th><th class="bb-col-actions"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${s.lines.map((l) => lineRow(s, l)).join("")}</tbody>
      </table></div>
      <div class="bb-section-foot">${picker}<button type="button" class="bc-link-button" data-act="add-line">+ ${catalog ? "Blank line" : "Add line"}</button></div>
    </section>`;
  }

  function renderSections() {
    sectionsEl.innerHTML = budget.sections.map(sectionCard).join("") +
      `<div class="bb-add-section"><button type="button" class="button button-secondary" data-act="add-section">+ Add section</button></div>`;
    renderFormats();
  }

  // Stap 1 bovenaan: formaat kiezen. Tegels zolang er nog geen secties zijn,
  // daarna een smalle balk met het gekozen formaat.
  const formatsEl = $("[data-bb-formats]");
  function renderFormats() {
    // Eerst een formaat kiezen (of importeren), dan pas de rest van de stappen
    root.classList.toggle("is-choosing", !(budget.template || budget.sections.length));
    if (!budget.template && !budget.sections.length) {
      formatsEl.innerHTML = `<div class="bb-start"><div class="bb-start-head"><span class="bb-step">1</span><div><h3>Choose your format</h3><p class="bb-help">All categories of the format appear as sections; add the budget lines per category from the list. Or start blank.</p></div></div>${templateTiles()}</div>`;
      return;
    }
    const t = budget.template && allTemplates().find((x) => x.id === budget.template);
    formatsEl.innerHTML = `<div class="bb-format-bar"><span class="bb-step">1</span><span>Format: <strong>${t ? esc(t.name) : "none"}</strong>${t ? ` <span class="bb-help">${(t.sections || []).length} categories</span>` : ""}</span><button type="button" class="bc-link-button" data-bb-open="templates">Choose your format</button></div>`;
    for (const b of $$("[data-bb-open]", formatsEl)) b.addEventListener("click", () => { prepareDialog(b.dataset.bbOpen); openDialog(b.dataset.bbOpen); });
  }
  formatsEl.addEventListener("click", (e) => { const b = e.target.closest("[data-tact]"); if (b) applyTemplate(b); });

  const summary = {
    total: $("[data-bb-total]"), subtotal: $("[data-bb-subtotal]"), additionals: $("[data-bb-additionals]"),
    totalExcl: $("[data-bb-total-excl]"), vatLabel: $("[data-bb-vat-label]"), vat: $("[data-bb-vat]"), totalIncl: $("[data-bb-total-incl]"),
    share: $("[data-bb-share]"), shareList: $("[data-bb-share-list]"),
  };

  function renderSummary() {
    const t = totals();
    const cur = (budget.currency || "").trim();
    summary.total.textContent = (cur ? cur + " " : "") + money(t.totalExcl);
    summary.subtotal.textContent = money(t.subtotal);
    summary.additionals.innerHTML = t.additionals.map((a) => `<div class="bb-sum-row bb-additional" data-additional="${a.id}">
        <span class="bb-additional-fields"><input type="text" data-afield="name" value="${esc(a.name)}" placeholder="Contingency" aria-label="Name of the percentage" autocomplete="off"><input type="text" inputmode="decimal" data-afield="percent" value="${esc(a.percent)}" aria-label="Percentage" autocomplete="off"><span class="bb-pct">%</span></span>
        <span class="bb-additional-amount"><span class="bb-num">${money(a.amount)}</span><button type="button" class="bb-icon bb-icon-danger" data-act="del-additional" title="Remove" aria-label="Remove percentage">&times;</button></span>
      </div>`).join("");
    summary.totalExcl.textContent = money(t.totalExcl);
    summary.vatLabel.textContent = `${parseNum(budget.vat)}%`;
    summary.vat.textContent = money(t.vat);
    summary.totalIncl.textContent = money(t.totalIncl);

    const shares = budget.sections.map((s) => ({ name: s.name || s.number || "Untitled section", amount: sectionTotal(s) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
    summary.share.hidden = shares.length < 2;
    if (shares.length >= 2) {
      const top = shares.slice(0, 8);
      const rest = shares.slice(8).reduce((n, x) => n + x.amount, 0);
      if (rest > 0) top.push({ name: `Other (${shares.length - 8} sections)`, amount: rest });
      summary.shareList.innerHTML = top.map((x) => {
        const pct = t.subtotal ? (x.amount / t.subtotal) * 100 : 0;
        return `<div class="bb-share-item"><div class="bb-share-head"><span>${esc(x.name)}</span><span class="bb-num">${pct.toFixed(0)}%</span></div><div class="bb-bar"><span style="width:${Math.max(1, pct).toFixed(1)}%"></span></div></div>`;
      }).join("");
    }
  }

  function updateTotalsFor(sectionEl) {
    const s = budget.sections.find((x) => x.id === sectionEl.dataset.section);
    if (!s) return;
    for (const row of $$("[data-line]", sectionEl)) {
      const l = s.lines.find((x) => x.id === row.dataset.line);
      if (l) $("[data-line-total]", row).textContent = money(lineTotal(l));
    }
    $("[data-section-total]", sectionEl).textContent = money(sectionTotal(s));
    renderSummary();
  }

  function renderAll() {
    renderMeta();
    renderSections();
    renderSummary();
    renderAccount();
  }

  // ---------- Bewerken ----------

  sectionsEl.addEventListener("input", (e) => {
    const input = e.target;
    const sectionEl = input.closest("[data-section]");
    if (!sectionEl) return;
    const s = budget.sections.find((x) => x.id === sectionEl.dataset.section);
    if (!s) return;
    if (input.dataset.sfield) {
      s[input.dataset.sfield] = input.value;
      touch();
      if (input.dataset.sfield === "name") renderSummary();
      return;
    }
    const row = input.closest("[data-line]");
    const l = row && s.lines.find((x) => x.id === row.dataset.line);
    if (!l || !input.dataset.field) return;
    l[input.dataset.field] = input.value;
    if (input.dataset.field === "qty" || input.dataset.field === "rate") updateTotalsFor(sectionEl);
    touch();
  });

  // Enter in het tarief: nieuwe regel eronder, cursor in de omschrijving
  sectionsEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.dataset || e.target.dataset.field !== "rate") return;
    e.preventDefault();
    const row = e.target.closest("[data-line]");
    const sectionEl = row.closest("[data-section]");
    addLine(sectionEl.dataset.section, row.dataset.line);
  });

  sectionsEl.addEventListener("change", (e) => {
    const select = e.target.closest('[data-act="pick-line"]');
    if (!select || !select.value) return;
    const sectionEl = select.closest("[data-section]");
    const s0 = budget.sections.find((x) => x.id === sectionEl.dataset.section);
    const c = (catalogFor(s0) || []).find((x) => String(x.code) === select.value);
    if (c) addLine(s0.id, null, { code: c.code, description: c.description });
  });
  sectionsEl.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-tact]");
    if (tile) { applyTemplate(tile); return; }
    const button = e.target.closest("[data-act]");
    if (!button) return;
    const act = button.dataset.act;
    const sectionEl = button.closest("[data-section]");
    const sectionId = sectionEl && sectionEl.dataset.section;
    const row = button.closest("[data-line]");
    if (act === "add-section") { addSection(); return; }
    if (act === "add-line") { addLine(sectionId); return; }
    if (act === "add-all") {
      const s0 = budget.sections.find((x) => x.id === sectionId);
      const catalog = s0 ? catalogFor(s0) : null;
      if (!catalog) return;
      const used = new Set(s0.lines.map((l) => String(l.code).trim()));
      const missing = catalog.filter((c) => !used.has(String(c.code)));
      if (lineCount() + missing.length > MAX_LINES) { notice(`That would exceed ${MAX_LINES} lines.`, "error"); return; }
      for (const c of missing) s0.lines.push(newLine({ code: c.code, description: c.description }));
      touch(); renderSections(); renderSummary();
      return;
    }
    const si = budget.sections.findIndex((x) => x.id === sectionId);
    if (si < 0) return;
    const s = budget.sections[si];
    if (act === "del-section") {
      if (s.lines.length && button.dataset.armed !== "1") {
        button.dataset.armed = "1"; button.textContent = "Delete?"; button.classList.add("is-armed");
        setTimeout(() => { button.dataset.armed = ""; button.innerHTML = "&times;"; button.classList.remove("is-armed"); }, 4000);
        return;
      }
      budget.sections.splice(si, 1); touch(); renderSections(); renderSummary(); return;
    }
    if (act === "up-section" || act === "down-section") {
      const to = act === "up-section" ? si - 1 : si + 1;
      if (to < 0 || to >= budget.sections.length) return;
      budget.sections.splice(to, 0, budget.sections.splice(si, 1)[0]); touch(); renderSections(); return;
    }
    const li = row ? s.lines.findIndex((x) => x.id === row.dataset.line) : -1;
    if (li < 0) return;
    if (act === "del-line") { s.lines.splice(li, 1); touch(); row.remove(); updateTotalsFor(sectionEl); return; }
    if (act === "up-line" || act === "down-line") {
      const to = act === "up-line" ? li - 1 : li + 1;
      if (to < 0 || to >= s.lines.length) return;
      s.lines.splice(to, 0, s.lines.splice(li, 1)[0]); touch();
      const tbody = row.parentElement;
      if (act === "up-line") tbody.insertBefore(row, row.previousElementSibling); else tbody.insertBefore(row.nextElementSibling, row);
    }
  });

  // Volgende vrije code: na de regel waarachter je invoegt, anders na de hoogste
  function nextCode(s, afterLine) {
    const used = new Set(s.lines.map((l) => String(l.code).trim()));
    const codes = s.lines.map((l) => parseInt(l.code, 10)).filter(Number.isFinite);
    let candidate;
    if (afterLine && Number.isFinite(parseInt(afterLine.code, 10))) candidate = parseInt(afterLine.code, 10) + 1;
    else if (codes.length) candidate = Math.max(...codes) + 1;
    else {
      const base = parseInt(s.number, 10);
      if (!Number.isFinite(base)) return "";
      candidate = base + 1;
    }
    while (used.has(String(candidate))) candidate++;
    return String(candidate);
  }

  function addLine(sectionId, afterLineId, preset) {
    if (lineCount() >= MAX_LINES) { notice(`A budget can hold up to ${MAX_LINES} lines.`, "error"); return; }
    const s = budget.sections.find((x) => x.id === sectionId);
    if (!s) return;
    const at = afterLineId ? s.lines.findIndex((x) => x.id === afterLineId) + 1 : s.lines.length;
    const after = afterLineId ? s.lines[at - 1] : s.lines[s.lines.length - 1];
    const l = newLine(preset ? { ...preset } : { code: nextCode(s, after) });
    s.lines.splice(at, 0, l);
    touch();
    const sectionEl = $(`[data-section="${s.id}"]`, sectionsEl);
    const tbody = $("tbody", sectionEl);
    const tmp = document.createElement("tbody");
    tmp.innerHTML = lineRow(s, l);
    const rowEl = tmp.firstElementChild;
    const before = afterLineId ? $(`[data-line="${afterLineId}"]`, tbody).nextElementSibling : null;
    tbody.insertBefore(rowEl, before);
    if (preset) {
      // Keuzelijst zonder deze kostensoort opnieuw opbouwen
      const fresh = document.createElement("div");
      fresh.innerHTML = sectionCard(s);
      $(".bb-section-foot", sectionEl).replaceWith($(".bb-section-foot", fresh));
      $('[data-field="qty"]', rowEl).focus();
    } else {
      $('[data-field="description"]', rowEl).focus();
    }
  }

  function addSection(preset) {
    const numbers = budget.sections.map((s) => parseInt(s.number, 10)).filter(Number.isFinite);
    const number = preset && preset.number ? preset.number : numbers.length ? String(Math.max(...numbers) + 100) : "1000";
    const s = newSection({ ...(preset || {}), number });
    budget.sections.push(s);
    touch();
    renderSections();
    renderSummary();
    const el = $(`[data-section="${s.id}"]`, sectionsEl);
    if (!preset) { $('[data-sfield="name"]', el).focus(); }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  for (const input of metaInputs) {
    input.addEventListener("input", () => {
      budget[input.dataset.bbMeta] = input.type === "number" ? input.value : input.value;
      if (input.dataset.bbMeta === "vat" || input.dataset.bbMeta === "currency") renderSummary();
      touch();
    });
  }

  summary.additionals.addEventListener("input", (e) => {
    const rowEl = e.target.closest("[data-additional]");
    const a = rowEl && budget.additionals.find((x) => x.id === rowEl.dataset.additional);
    if (!a || !e.target.dataset.afield) return;
    a[e.target.dataset.afield] = e.target.value;
    touch();
    if (e.target.dataset.afield === "percent") {
      const t = totals();
      const calc = t.additionals.find((x) => x.id === a.id);
      $(".bb-additional-amount .bb-num", rowEl).textContent = money(calc.amount);
      summary.total.textContent = ((budget.currency || "").trim() ? budget.currency.trim() + " " : "") + money(t.totalExcl);
      summary.totalExcl.textContent = money(t.totalExcl);
      summary.vat.textContent = money(t.vat);
      summary.totalIncl.textContent = money(t.totalIncl);
    }
  });
  summary.additionals.addEventListener("click", (e) => {
    const button = e.target.closest('[data-act="del-additional"]');
    if (!button) return;
    const rowEl = button.closest("[data-additional]");
    budget.additionals = budget.additionals.filter((x) => x.id !== rowEl.dataset.additional);
    touch();
    renderSummary();
  });
  $("[data-bb-add-additional]").addEventListener("click", () => {
    budget.additionals.push(newAdditional(budget.additionals.length ? { name: "", percent: 0 } : { name: "Contingency", percent: 10 }));
    touch();
    renderSummary();
    const last = $$("[data-additional]", summary.additionals).pop();
    if (last) $('[data-afield="name"]', last).focus();
  });

  // ---------- Account en versies ----------

  const account = { user: null, versions: [], offline: false };
  const accountEl = $("[data-bb-account]");
  const saveButtons = $$("[data-bb-save]");
  const setSaveButtons = (fn) => saveButtons.forEach(fn);
  let pendingSave = false;

  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try { data = await res.json(); } catch { /* geen JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const err = new Error((data && data.error) || `Something went wrong (${res.status}).`);
      err.status = res.status;
      err.limit = Boolean(data && data.limit);
      throw err;
    }
    return data;
  }

  function renderAccount() {
    if (account.user) {
      const n = account.versions.length;
      accountEl.innerHTML = `${esc(account.user.email)} · <button type="button" class="bc-link-button" data-bb-versions-open>${n} of ${MAX_VERSIONS} version${n === 1 ? "" : "s"}</button>`;
      $("[data-bb-versions-open]", accountEl).addEventListener("click", () => { prepareDialog("versions"); openDialog("versions"); });
      setSaveButtons((b) => { b.textContent = "Save version"; });
    } else {
      accountEl.innerHTML = `Not signed in · <button type="button" class="bc-link-button" data-bb-login>Log in</button>`;
      $("[data-bb-login]", accountEl).addEventListener("click", () => openAccount("login", false));
      setSaveButtons((b) => { b.textContent = "Save version"; });
    }
  }

  api("/api/tools/me").then((data) => {
    account.user = data.user;
    account.versions = data.versions || [];
    renderAccount();
  }).catch(() => { account.offline = true; });

  const accountDialog = dialogs.account;
  const accountForm = $("[data-bb-account-form]");
  const accountError = $("[data-bb-account-error]");
  let accountMode = "register";

  function setAccountMode(mode) {
    accountMode = mode;
    for (const tab of $$("[data-bb-mode]", accountDialog)) {
      const on = tab.dataset.bbMode === mode;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    }
    $("[data-bb-consent-row]", accountDialog).hidden = mode !== "register";
    $("[data-bb-password-help]", accountDialog).hidden = mode !== "register";
    accountForm.password.autocomplete = mode === "register" ? "new-password" : "current-password";
    $("[data-bb-account-submit]").textContent = mode === "register" ? (pendingSave ? "Create account and save" : "Create account") : (pendingSave ? "Log in and save" : "Log in");
    accountError.textContent = "";
  }
  function openAccount(mode, forSave) {
    pendingSave = Boolean(forSave);
    $("[data-bb-account-title]").textContent = forSave ? "Save your budget" : "Log in";
    setAccountMode(mode);
    openDialog("account");
    accountForm.email.focus();
  }
  for (const tab of $$("[data-bb-mode]", accountDialog)) tab.addEventListener("click", () => setAccountMode(tab.dataset.bbMode));
  $("[data-bb-login]").addEventListener("click", () => openAccount("login", false));

  accountForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    accountError.textContent = "";
    const submit = $("[data-bb-account-submit]");
    submit.disabled = true;
    try {
      const body = { email: accountForm.email.value.trim(), password: accountForm.password.value };
      if (accountMode === "register") body.consent = accountForm.consent.checked;
      const data = await api(accountMode === "register" ? "/api/tools/register" : "/api/tools/login", { method: "POST", body });
      account.user = data.user;
      account.versions = data.versions || [];
      accountForm.reset();
      accountDialog.close();
      renderAccount();
      if (pendingSave) { pendingSave = false; await saveVersion(false); }
      else notice(`Logged in as ${account.user.email}.`, "ok");
    } catch (err) {
      accountError.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  async function saveVersion(asNew) {
    if (!account.user) { openAccount("register", true); return; }
    if (lineCount() > MAX_LINES) { notice(`A version can hold up to ${MAX_LINES} lines.`, "error"); return; }
    if (asNew) {
      budget.id = uid();
      const m = /^(.*?)(\d+)\s*$/.exec(budget.name || "");
      budget.name = m ? `${m[1]}${Number(m[2]) + 1}` : `${budget.name || "Draft"} 2`;
      renderMeta();
      saveLocal();
    }
    setSaveButtons((b) => { b.disabled = true; });
    try {
      const data = await api(`/api/tools/versions/${encodeURIComponent(budget.id)}`, { method: "PUT", body: { budget } });
      account.versions = data.versions || [];
      dirty = false;
      renderAccount();
      notice(`Saved "${budget.name || "Untitled"}" (${account.versions.length} of ${MAX_VERSIONS} versions).`, "ok");
      if (dialogs.versions.open) prepareDialog("versions");
    } catch (err) {
      if (err.status === 401) { account.user = null; renderAccount(); openAccount("login", true); }
      else if (err.limit) { notice(err.message, "error"); prepareDialog("versions"); openDialog("versions"); }
      else notice(err.message, "error");
    } finally {
      setSaveButtons((b) => { b.disabled = false; });
    }
  }
  for (const b of saveButtons) b.addEventListener("click", () => saveVersion(false));
  $("[data-bb-save-new]").addEventListener("click", () => saveVersion(true));
  $("[data-bb-logout]").addEventListener("click", async () => {
    try { await api("/api/tools/logout", { method: "POST" }); } catch { /* sessie weg is sessie weg */ }
    account.user = null;
    account.versions = [];
    dialogs.versions.close();
    renderAccount();
    notice("Logged out. The budget stays in this browser.", "ok");
  });

  function renderVersions() {
    const list = $("[data-bb-versions]");
    $("[data-bb-versions-intro]").textContent = `${account.versions.length} of ${MAX_VERSIONS} versions saved${account.user ? ` for ${account.user.email}` : ""}.`;
    if (!account.versions.length) { list.innerHTML = `<p class="bb-help">No versions saved yet.</p>`; return; }
    list.innerHTML = account.versions.map((v) => `<div class="bb-version${v.id === budget.id ? " is-current" : ""}" data-version="${esc(v.id)}">
        <div class="bb-version-text"><strong>${esc(v.name || "Untitled")}</strong>${v.production ? ` <span class="bb-help">${esc(v.production)}</span>` : ""}<span class="bb-help">${v.lines} line${v.lines === 1 ? "" : "s"} · total ${money(v.total || 0)} · ${new Date(v.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${v.id === budget.id ? " · open now" : ""}</span></div>
        <div class="bb-version-actions"><button type="button" class="button button-secondary" data-vact="open">Open</button><button type="button" class="bb-icon bb-icon-danger" data-vact="delete" title="Delete version" aria-label="Delete version">&times;</button></div>
      </div>`).join("");
  }
  $("[data-bb-versions]").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-vact]");
    if (!button) return;
    const id = button.closest("[data-version]").dataset.version;
    try {
      if (button.dataset.vact === "open") {
        const data = await api(`/api/tools/versions/${encodeURIComponent(id)}`);
        budget = data.budget;
        budget.additionals = Array.isArray(budget.additionals) ? budget.additionals : [];
        dirty = false;
        saveLocal();
        renderAll();
        dialogs.versions.close();
        notice(`Opened "${budget.name || "Untitled"}".`, "ok");
      } else if (button.dataset.vact === "delete") {
        if (button.dataset.armed !== "1") { button.dataset.armed = "1"; button.textContent = "Delete?"; button.classList.add("is-armed"); setTimeout(() => { button.dataset.armed = ""; button.innerHTML = "&times;"; button.classList.remove("is-armed"); }, 4000); return; }
        const data = await api(`/api/tools/versions/${encodeURIComponent(id)}`, { method: "DELETE" });
        account.versions = data.versions || [];
        if (id === budget.id) dirty = true;
        renderAccount();
        renderVersions();
      }
    } catch (err) {
      notice(err.message, "error");
    }
  });

  // ---------- Import (Movie Magic of elk budgetbestand) ----------

  let importResult = null;
  const importStatus = $("[data-bb-import-status]");
  $("[data-bb-import-file]").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const BC = window.BudgetCompare;
    importResult = null;
    $("[data-bb-import-preview]").hidden = true;
    if (!BC) { importStatus.textContent = "The file reader did not load. Reload the page and try again."; return; }
    importStatus.textContent = `Reading ${file.name}…`;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let sheets;
      if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) sheets = await BC.parseXlsx(buffer);
      else {
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { text = new TextDecoder("windows-1252").decode(buffer); }
        sheets = [{ name: file.name, rows: BC.parseText(text) }];
      }
      const index = sheets.length > 1 ? BC.chooseSheet(sheets) : 0;
      const a = BC.analyseSheet(sheets[index].rows);
      if (a.mapping.amount < 0) throw new Error("no-amount");
      const values = a.rows.slice(a.headerRow ? 1 : 0, 300).map((r) => r[a.mapping.amount]);
      const lookup = sheets.length > 1 ? BC.sectionLookupFromSheets(sheets, index) : null;
      const { lines } = BC.extractLines({ rows: a.rows, mapping: a.mapping, headerRow: a.headerRow, numberFormat: BC.detectNumberFormat(values), ignoreTotals: true, sectionLookup: lookup });
      if (!lines.length) throw new Error("no-lines");
      if (lines.length > MAX_LINES) throw new Error("too-many");
      importResult = { sections: linesToSections(lines, lookup), file: file.name, sheet: sheets[index].name, count: lines.length };
      const total = importResult.sections.reduce((n, s) => n + s.lines.reduce((m, l) => m + parseNum(l.qty) * parseNum(l.rate), 0), 0);
      $("[data-bb-import-summary]").textContent = `${file.name}${sheets.length > 1 ? ` (sheet ${sheets[index].name})` : ""}: ${importResult.sections.length} section${importResult.sections.length === 1 ? "" : "s"}, ${lines.length} lines, total ${money(total)}.`;
      $("[data-bb-import-preview]").hidden = false;
      importStatus.textContent = "";
    } catch (err) {
      const why = { "no-inflate": "This browser cannot read Excel files directly. Save the sheet as CSV and try again.", "no-amount": "No amount column found in this file.", "no-lines": "No budget lines found in this file.", "too-many": `This file has more than ${MAX_LINES} lines.` }[err && err.message];
      importStatus.textContent = why || "Could not read this file. Try an .xlsx or CSV export.";
    }
  });

  for (const b of $$("[data-bb-import-apply]")) b.addEventListener("click", () => {
    if (!importResult) return;
    if (b.dataset.bbImportApply === "append" && lineCount() + importResult.count > MAX_LINES) { importStatus.textContent = `That would exceed ${MAX_LINES} lines.`; return; }
    if (b.dataset.bbImportApply === "replace") {
      budget.sections = [];
      if (!budget.production) budget.production = importResult.file.replace(/\.[^.]+$/, "");
    }
    for (const s of importResult.sections) budget.sections.push(newSection(s));
    touch();
    renderAll();
    dialogs.import.close();
    notice(`Imported ${importResult.count} lines from ${importResult.file}.`, "ok");
    importResult = null;
    $("[data-bb-import-preview]").hidden = true;
  });

  // ---------- Formaten en voorbeeld ----------

  const SAMPLE = {
    id: "sample", name: "Sample budget", description: "A small drama budget with numbers filled in, to see how the builder and the exports behave.",
    additionals: [{ name: "Contingency", percent: 10 }],
    sections: [
      { number: "1100", name: "Development, story, rights", lines: [{ code: "1102", description: "Development", remarks: "Scouting, prep", qty: 1, unit: "allow", rate: 60000 }, { code: "1104", description: "Script & development", qty: 1, unit: "allow", rate: 85000 }] },
      { number: "1200", name: "Producers", lines: [{ code: "1201", description: "Producers", qty: 2, unit: "flat", rate: 140000 }, { code: "1206", description: "Line producer", qty: 12, unit: "weeks", rate: 5362.17 }] },
      { number: "1300", name: "Direction", lines: [{ code: "1301", description: "Director", qty: 1, unit: "flat", rate: 115946 }] },
      { number: "1400", name: "Cast", lines: [{ code: "1401", description: "Principal cast", remarks: "2 leads", qty: 2, unit: "flat", rate: 179000 }, { code: "1402", description: "Supporting cast", qty: 8, unit: "weeks", rate: 25250 }, { code: "1404", description: "Stunt coordinator", qty: 6, unit: "weeks", rate: 6000 }, { code: "1420", description: "Casting director", qty: 1, unit: "flat", rate: 126025 }] },
      { number: "1500", name: "ATL travel & living", lines: [{ code: "1520", description: "ATL hotel", qty: 60, unit: "nights", rate: 890 }, { code: "1535", description: "Per diems", qty: 1, unit: "allow", rate: 27072 }] },
      { number: "2000", name: "Production staff", lines: [{ code: "2001", description: "Production manager", remarks: "incl. prep", qty: 10, unit: "weeks", rate: 11074.6 }, { code: "2002", description: "Production coordinator", qty: 10, unit: "weeks", rate: 9400 }] },
    ],
  };

  const allTemplates = () => [...(window.BudgetTemplates || []), SAMPLE];

  // Kostensoorten van het gekozen formaat voor deze sectie (op sectienummer)
  function catalogFor(section) {
    const t = budget.template && allTemplates().find((x) => x.id === budget.template);
    const ts = t && (t.sections || []).find((x) => String(x.number) === String(section.number).trim());
    return ts && ts.lines && ts.lines.length ? ts.lines : null;
  }

  // Tegels om een formaat te kiezen; in het Templates-venster en op de lege pagina
  function templateTiles() {
    return `<div class="bb-tiles">${allTemplates().map((t) => {
      const sections = t.sections || [];
      const count = sections.reduce((n, s) => n + (s.lines || []).length, 0);
      const colors = sections.map((s) => s.color).filter(Boolean).slice(0, 14);
      const meta = t.id === "sample" ? `${sections.length} sections, ${count} lines with figures` : sections.length ? `${sections.length} categories, ${count} cost types to pick from` : "Your own sections and lines";
      return `<div class="bb-tile" data-template="${esc(t.id)}">
        <div class="bb-tile-colors" aria-hidden="true">${(colors.length ? colors : ["#EAF1FC"]).map((c) => `<span style="background:${esc(c)}"></span>`).join("")}</div>
        <strong>${esc(t.name)}</strong>
        <span class="bb-help">${esc(t.description || "")}</span>
        <span class="bb-tile-meta">${esc(meta)}</span>
        <div class="bb-tile-actions"><button type="button" class="button button-primary" data-tact="use">Use</button>${sections.length ? `<button type="button" class="button button-secondary" data-tact="append">Add sections</button>` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }
  function renderTemplates() { $("[data-bb-templates]").innerHTML = templateTiles(); }

  function applyTemplate(button) {
    const id = button.closest("[data-template]").dataset.template;
    const t = allTemplates().find((x) => x.id === id);
    if (!t) return;
    const sections = t.sections || [];
    // Een formaat geeft de categorieën; de regels kies je daarna per sectie.
    // Alleen het voorbeeldbudget komt met ingevulde regels.
    const withLines = id === "sample";
    const asSection = (s) => newSection({ number: s.number, name: s.name, color: s.color, lines: withLines ? s.lines : [] });
    if (button.dataset.tact === "use") {
      if (lineCount() && button.dataset.armed !== "1") { button.dataset.armed = "1"; button.textContent = "Replace current budget?"; setTimeout(() => { button.dataset.armed = ""; button.textContent = "Use"; }, 5000); return; }
      budget = { ...emptyBudget(), name: budget.name || "Draft 1", production: budget.production, currency: budget.currency || "EUR", vat: budget.vat ?? 21, template: id === "sample" ? "" : id, sections: sections.map(asSection), additionals: (t.additionals || []).map(newAdditional) };
    } else {
      for (const s of sections) budget.sections.push(asSection(s));
      if (!budget.template && id !== "sample") budget.template = id;
    }
    touch();
    renderAll();
    dialogs.templates.close();
    notice(withLines ? `${t.name}: ${sections.length} sections, ${sections.reduce((n, s) => n + s.lines.length, 0)} lines.` : `${t.name}: ${sections.length} categories added. Pick the cost types per section, or add blank lines.`, "ok");
  }
  $("[data-bb-templates]").addEventListener("click", (e) => { const b = e.target.closest("[data-tact]"); if (b) applyTemplate(b); });

  // ---------- Feedback ----------

  const feedbackForm = $("[data-bb-feedback-form]");
  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("[data-bb-feedback-error]");
    const submit = $("[data-bb-feedback-submit]");
    error.textContent = "";
    submit.disabled = true;
    try {
      await api("/api/tools/feedback", { method: "POST", body: { message: feedbackForm.message.value.trim(), email: feedbackForm.email.value.trim(), page: location.pathname } });
      feedbackForm.reset();
      dialogs.feedback.close();
      notice("Thank you, your feedback has been sent.", "ok");
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  function prepareDialog(name) {
    if (name === "feedback" && account.user && !feedbackForm.email.value) feedbackForm.email.value = account.user.email;
    if (name === "templates") renderTemplates();
    if (name === "versions") renderVersions();
    if (name === "import") { importStatus.textContent = ""; $("[data-bb-import-preview]").hidden = true; }
  }

  // ---------- Export ----------

  function download(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileStem = () => ((budget.production ? budget.production + " " : "") + (budget.name || "budget")).replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "budget";

  for (const b of $$("[data-bb-export]")) b.addEventListener("click", () => {
    const kind = b.dataset.bbExport;
    if (kind === "xlsx") download(buildXlsx(), fileStem() + ".xlsx");
    if (kind === "csv") download(buildCsv(), fileStem() + ".csv");
    if (kind === "print") { renderPrint(); dialogs.export.close(); setTimeout(() => window.print(), 50); return; }
    dialogs.export.close();
  });

  function buildCsv() {
    const decimalComma = new Intl.NumberFormat().format(1.5).includes(",");
    const sep = decimalComma ? ";" : ",";
    const num = (n) => (decimalComma ? String(round2(n)).replace(".", ",") : String(round2(n)));
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["Section number", "Section", "Code", "Description", "Remarks", "Qty", "Unit", "Rate", "Total"].map(q).join(sep)];
    for (const s of budget.sections) for (const l of s.lines) rows.push([q(s.number), q(s.name), q(l.code), q(l.description), q(l.remarks), num(parseNum(l.qty)), q(l.unit), num(parseNum(l.rate)), num(lineTotal(l))].join(sep));
    const t = totals();
    rows.push([q(""), q(""), q(""), q("Total (excl. VAT)"), q(""), "", q(""), "", num(t.subtotal)].join(sep));
    for (const a of t.additionals) rows.push([q(""), q(""), q(""), q(`${a.name} ${parseNum(a.percent)}%`), q(""), "", q(""), "", num(a.amount)].join(sep));
    return new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  }

  // Printversie: statische tabel, alleen zichtbaar bij afdrukken
  function renderPrint() {
    let el = $("[data-bb-print]");
    if (!el) { el = document.createElement("div"); el.className = "bb-print"; el.setAttribute("data-bb-print", ""); root.append(el); }
    const t = totals();
    el.innerHTML = `<h1>${esc(budget.name || "Budget")}</h1><p>${[budget.production && `Production: ${esc(budget.production)}`, budget.date && `Date: ${esc(dateLabel(budget.date))}`, budget.currency && `Currency: ${esc(budget.currency)}`].filter(Boolean).join(" · ")}</p>
      <table><thead><tr><th>Code</th><th>Description</th><th>Remarks</th><th class="bb-num">Qty</th><th>Unit</th><th class="bb-num">Rate</th><th class="bb-num">Total</th></tr></thead>
      ${budget.sections.map((s) => `<tbody><tr class="bb-print-section"><th colspan="6">${esc(s.number)} ${esc(s.name)}</th><td class="bb-num">${money(sectionTotal(s))}</td></tr>${s.lines.map((l) => `<tr><td>${esc(l.code)}</td><td>${esc(l.description)}</td><td>${esc(l.remarks)}</td><td class="bb-num">${esc(l.qty)}</td><td>${esc(l.unit)}</td><td class="bb-num">${money(parseNum(l.rate))}</td><td class="bb-num">${money(lineTotal(l))}</td></tr>`).join("")}</tbody>`).join("")}
      <tfoot><tr><th colspan="6">Lines subtotal</th><td class="bb-num">${money(t.subtotal)}</td></tr>${t.additionals.map((a) => `<tr><th colspan="6">${esc(a.name)} ${parseNum(a.percent)}%</th><td class="bb-num">${money(a.amount)}</td></tr>`).join("")}<tr class="bb-print-total"><th colspan="6">Total excl. VAT</th><td class="bb-num">${money(t.totalExcl)}</td></tr><tr><th colspan="6">VAT ${parseNum(budget.vat)}%</th><td class="bb-num">${money(t.vat)}</td></tr><tr><th colspan="6">Total incl. VAT</th><td class="bb-num">${money(t.totalIncl)}</td></tr></tfoot></table>`;
  }

  // ---------- Start ----------

  renderAll();
})();
