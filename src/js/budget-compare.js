/* Budget version compare — gratis tool op /tools/budget-compare/.
 *
 * Alles gebeurt in de browser. Dit bestand doet geen enkele netwerkaanroep en
 * server.js zet op /tools/* een Content-Security-Policy die dat ook afdwingt
 * (connect-src 'none', form-action 'none'). Houd dat zo: geen fetch, geen
 * beacon, geen externe scripts. De privacyclaim op de pagina steunt hierop.
 *
 * Opbouw:
 *   1. lezen: CSV/TSV, geplakte cellen, en .xlsx (eigen minimale zip- en
 *      XML-lezer, dus geen bibliotheek nodig)
 *   2. herkennen: kopregel, kolommen (code, omschrijving, bedrag, sectie),
 *      getalnotatie (1.234,56 of 1,234.56)
 *   3. vergelijken: regels koppelen op code (anders op omschrijving),
 *      verschillen per regel en per sectie
 *   4. tonen: samenvatting, tabel, CSV-download en print
 *
 * De pure functies staan onder window.BudgetCompare zodat ze ook los te
 * testen zijn (node test/budget-compare.test.mjs).
 */
(function () {
  "use strict";

  // ---------- Tekst en getallen ----------

  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const normKey = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const normCode = (s) => norm(s).toUpperCase().replace(/\s+/g, "");

  const NUMERIC_RE = /^\s*[-−–(]?\s*(?:€|\$|£|eur|usd|gbp|chf)?\s*[-−–]?\s*\d[\d.,\s ']*\s*(?:€|\$|£|eur|usd|gbp|chf)?\s*\)?\s*[-−–]?\s*$/i;
  const looksNumeric = (v) => typeof v === "number" || (typeof v === "string" && NUMERIC_RE.test(v));

  // Subtotaal- en totaalregels tellen niet mee, anders telt alles dubbel.
  const TOTAL_RE = /^(?:sub-?\s*)?tota(?:l|al)s?\b|^grand\s+total|^(?:sum|som)\b|\btotal\s*(?:budget|costs?|kosten)?\s*$/i;

  // "1.234,56", "1,234.56", "€ 1.500", "(2.000)", "1500-" → getal of null.
  // format: "auto" | "eu" (komma decimaal) | "us" (punt decimaal)
  function parseAmount(value, format) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let s = String(value ?? "").trim();
    if (!s) return null;
    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    if (/^[-−–]/.test(s) || /[-−–]$/.test(s)) negative = true;
    s = s.replace(/[^\d.,]/g, "");
    if (!/\d/.test(s)) return null;

    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    let decimalSep = null;
    if (lastComma >= 0 && lastDot >= 0) {
      decimalSep = lastComma > lastDot ? "," : ".";
    } else if (lastComma >= 0 || lastDot >= 0) {
      const sep = lastComma >= 0 ? "," : ".";
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      if (parts.length > 2) decimalSep = null; // 1.234.567: alleen groepen
      else if (format === "eu") decimalSep = sep === "," ? "," : null;
      else if (format === "us") decimalSep = sep === "." ? "." : null;
      else decimalSep = tail.length === 3 ? null : sep; // 1.500 en 1,500 zijn duizendtallen
    }
    const digits = decimalSep
      ? s.replace(decimalSep === "," ? /\./g : /,/g, "").replace(decimalSep, ".")
      : s.replace(/[.,]/g, "");
    const n = parseFloat(digits);
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  }

  // Kijkt naar een hele kolom: komma's met twee decimalen wijzen op de
  // Europese notatie, punten met twee decimalen op de Engelse.
  function detectNumberFormat(values) {
    let eu = 0;
    let us = 0;
    for (const v of values) {
      if (typeof v !== "string") continue;
      const s = v.trim();
      if (!s) continue;
      if (/,\d{2}$/.test(s) || (/\d\.\d{3}(?:\D|$)/.test(s) && !/\.\d{2}$/.test(s))) eu++;
      if (/\.\d{2}$/.test(s) || (/\d,\d{3}(?:\D|$)/.test(s) && !/,\d{2}$/.test(s))) us++;
    }
    if (eu > us) return "eu";
    if (us > eu) return "us";
    return "auto";
  }

  // ---------- CSV, TSV en geplakte cellen ----------

  function decodeText(buffer) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder("windows-1252").decode(buffer);
    }
    return text.replace(/^\uFEFF/, "");
  }

  // Tab wint (plakken uit Excel), dan puntkomma (Nederlands Excel), dan komma.
  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 25);
    const score = { "\t": 0, ";": 0, ",": 0 };
    for (const line of lines) {
      for (const d of Object.keys(score)) score[d] += line.split(d).length - 1;
    }
    return ["\t", ";", ","].reduce((best, d) => (score[d] > score[best] ? d : best), "\t");
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"' && field === "") {
        // Alleen een aanhalingsteken aan het begin van een veld opent een
        // quote; eentje middenin ("craft" services) is gewoon tekst.
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else {
        field += ch;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  }

  function parseText(text) {
    const clean = text.replace(/^\uFEFF/, "");
    return parseDelimited(clean, detectDelimiter(clean));
  }

  // ---------- .xlsx: minimale zip- en XML-lezer ----------

  async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") throw new Error("no-inflate");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not-a-zip");
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const method = view.getUint16(offset + 10, true);
      const compSize = view.getUint32(offset + 20, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
      entries.set(name, { method, compSize, localOffset });
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return {
      async text(name) {
        const e = entries.get(name);
        if (!e) return null;
        const lo = e.localOffset;
        if (view.getUint32(lo, true) !== 0x04034b50) throw new Error("bad-zip");
        const start = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true);
        const data = bytes.subarray(start, start + e.compSize);
        let out;
        if (e.method === 0) out = data;
        else if (e.method === 8) out = await inflateRaw(data);
        else throw new Error("zip-method");
        return new TextDecoder().decode(out);
      },
    };
  }

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const xmlEntity = (s) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  const xmlAttr = (attrs, name) => {
    const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
    return m ? xmlEntity(m[1]) : null;
  };
  // Alle <t>-stukjes van een rich-text-cel achter elkaar (zonder fonetische rPh-runs)
  const xmlText = (inner) => {
    const cleaned = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    let out = "";
    for (const m of cleaned.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
    return xmlEntity(out);
  };
  const colIndex = (ref) => {
    let n = 0;
    for (const ch of ref) {
      const c = ch.charCodeAt(0);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  };

  function parseSheet(xml, shared) {
    const rows = [];
    const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
    if (!data) return rows;
    for (const rm of data[1].matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      if (rm[2] === undefined) continue;
      const cells = [];
      let nextCol = 0;
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const inner = cm[2] || "";
        const ref = xmlAttr(attrs, "r");
        const col = ref ? colIndex(ref) : nextCol;
        nextCol = col + 1;
        const type = xmlAttr(attrs, "t");
        let value = "";
        if (type === "inlineStr") {
          value = xmlText(inner);
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          const raw = v ? xmlEntity(v[1]) : "";
          if (type === "s") value = shared[parseInt(raw, 10)] ?? "";
          else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
          else if (type === "e") value = "";
          else if (type === "str") value = raw;
          else value = raw === "" ? "" : Number(raw);
        }
        cells[col] = typeof value === "string" ? value.trim() : value;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      if (cells.some((c) => c !== "" && !Number.isNaN(c))) rows.push(cells);
    }
    return rows;
  }

  async function parseXlsx(buffer) {
    const zip = await readZip(buffer);
    const workbook = await zip.text("xl/workbook.xml");
    if (!workbook) throw new Error("not-xlsx");
    const rels = (await zip.text("xl/_rels/workbook.xml.rels")) || "";
    const relMap = new Map();
    for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = xmlAttr(m[1], "Id");
      const target = xmlAttr(m[1], "Target");
      if (id && target) relMap.set(id, target.startsWith("/") ? target.slice(1) : "xl/" + target);
    }
    const shared = [];
    const sst = await zip.text("xl/sharedStrings.xml");
    if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlText(m[1]));
    const sheets = [];
    for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const name = xmlAttr(m[1], "name") || `Sheet ${sheets.length + 1}`;
      const rid = xmlAttr(m[1], "r:id") || xmlAttr(m[1], "id");
      const path = relMap.get(rid);
      if (!path) continue;
      const xml = await zip.text(path);
      if (!xml) continue;
      const rows = parseSheet(xml, shared);
      if (rows.length) sheets.push({ name, rows });
    }
    if (!sheets.length) throw new Error("empty");
    return sheets;
  }

  // ---------- Herkennen van kopregel en kolommen ----------

  const HEADER_WORDS = /desc|omschrijving|total|totaal|amount|bedrag|account|acct|code|budget|item|name|naam|line|post|rekening|cost|kosten|section|department|afdeling/i;

  // Boven een budget staan vaak titelregels ("Production: ...") voordat de
  // echte kopregel komt. Zoek die kopregel in de eerste vijftien regels.
  function findHeaderIndex(rows) {
    const limit = Math.min(rows.length, 15);
    for (let i = 0; i < limit; i++) {
      const texts = rows[i].filter((c) => typeof c === "string" && c.trim() && !looksNumeric(c));
      if (texts.length >= 2 && texts.some((c) => HEADER_WORDS.test(c))) return i;
    }
    return -1;
  }

  function detectMapping(rows, hasHeader) {
    const width = rows.slice(0, 60).reduce((w, r) => Math.max(w, r.length), 0);
    const cols = [...Array(width).keys()];
    const header = hasHeader ? cols.map((c) => normKey(rows[0][c])) : cols.map(() => "");
    const sample = rows.slice(hasHeader ? 1 : 0, 250);
    const filled = (c) => sample.filter((r) => r[c] !== undefined && String(r[c]).trim() !== "");
    const numericScore = cols.map((c) => filled(c).filter((r) => looksNumeric(r[c])).length);
    const textScore = cols.map((c) => filled(c).filter((r) => !looksNumeric(r[c])).length);
    const find = (re, exclude = []) => {
      const hit = cols.find((c) => !exclude.includes(c) && re.test(header[c]));
      return hit === undefined ? -1 : hit;
    };
    const m = { code: -1, desc: -1, amount: -1, group: -1 };
    if (hasHeader) {
      m.group = find(/^(group|section|department|dept|categor|afdeling|rubriek|phase|fase|kostengroep|cost group)/);
      m.code = find(/^(acc(ount)?( ?(no|nr|number|code|#))?|acct|code|nr|no|number|rekening|post|line ?(no|nr|number)|budget ?code|id|#)$/, [m.group]);
      if (m.code < 0) m.code = find(/\b(code|account|acct)\b/, [m.group]);
      m.desc = find(/^(description|desc|omschrijving|name|naam|item|title|label|detail|budget line|line item|line|post)$/, [m.group, m.code]);
      if (m.desc < 0) m.desc = find(/desc|omschrijving|name|item|line/, [m.group, m.code]);
      // Eerst een kolom die precies "Total"/"Amount" heet, dan pas "Subtotal" e.d.
      m.amount = find(/^(total|totaal|amount|bedrag|budget|totaal bedrag|total amount|line total)$/, [m.group, m.code, m.desc]);
      if (m.amount < 0) m.amount = find(/^(total|totaal|amount|bedrag|budget|subtotal|sum|cost|value|estimate|approved|current|revised)/, [m.group, m.code, m.desc]);
      if (m.amount < 0) m.amount = find(/total|amount|bedrag|budget|€|eur|usd|gbp|\$|cost|kosten/, [m.group, m.code, m.desc]);
    }
    const taken = () => [m.group, m.code, m.desc, m.amount];
    if (m.amount < 0) {
      // Meest gevulde getallenkolom, bij gelijkspel de meest rechtse (het totaal staat rechts)
      let best = -1;
      for (const c of cols) if (!taken().includes(c) && numericScore[c] > 0 && numericScore[c] >= (best < 0 ? 0 : numericScore[best])) best = c;
      m.amount = best;
    }
    if (m.desc < 0) {
      let best = -1;
      for (const c of cols) if (!taken().includes(c) && textScore[c] > (best < 0 ? 0 : textScore[best])) best = c;
      m.desc = best;
    }
    if (m.code < 0) {
      // Een korte, bijna altijd gevulde kolom links van de omschrijving
      for (const c of cols) {
        if (taken().includes(c) || (m.desc >= 0 && c > m.desc)) continue;
        const values = filled(c);
        if (values.length < sample.length * 0.6) continue;
        const avg = values.reduce((n, r) => n + String(r[c]).length, 0) / values.length;
        if (avg <= 8) { m.code = c; break; }
      }
    }
    if (m.group < 0) {
      // Sectiekolom zonder kopregel: tekst op een minderheid van de regels, en
      // op precies die regels is de omschrijvingskolom leeg. Zo staan
      // categorieën in Movie Magic-exports (kolom 2) en in ingesprongen sheets.
      for (const c of cols) {
        if (taken().includes(c)) continue;
        const values = filled(c);
        if (!values.length || values.length > sample.length * 0.6) continue;
        if (values.filter((r) => !looksNumeric(r[c])).length < values.length * 0.8) continue;
        const descEmpty = m.desc < 0 ? values.length : values.filter((r) => !String(r[m.desc] ?? "").trim()).length;
        if (descEmpty >= values.length * 0.8) { m.group = c; break; }
      }
    }
    return m;
  }

  // Een kopregel heeft minstens twee tekstcellen en geen getallen. Een
  // titelregel als "MAGIC MOVIE BUDGET" (één cel) is dus geen kopregel.
  function looksLikeHeader(row) {
    if (!row) return false;
    const cells = row.filter((c) => c !== undefined && String(c).trim() !== "");
    return cells.length >= 2 && cells.every((c) => !looksNumeric(c));
  }

  // ---------- Regels eruit halen en vergelijken ----------

  function extractLines(version) {
    const { rows, mapping, headerRow, numberFormat, ignoreTotals } = version;
    const lines = [];
    let group = "";
    let skippedTotals = 0;
    for (let i = headerRow ? 1 : 0; i < rows.length; i++) {
      const r = rows[i];
      const code = mapping.code >= 0 ? norm(r[mapping.code]) : "";
      const desc = mapping.desc >= 0 ? norm(r[mapping.desc]) : "";
      const explicitGroup = mapping.group >= 0 ? norm(r[mapping.group]) : "";
      if (explicitGroup) group = explicitGroup;
      const amount = mapping.amount >= 0 ? parseAmount(r[mapping.amount], numberFormat) : null;
      const isTotal = TOTAL_RE.test(desc) || (!desc && TOTAL_RE.test(code));
      if (amount === null) {
        // Tekst zonder bedrag: een kopje boven een blok regels
        if (mapping.group < 0 && !isTotal && (desc || code)) group = desc || code;
        continue;
      }
      if (isTotal) {
        if (ignoreTotals) { skippedTotals++; continue; }
      }
      if (!code && !desc) continue;
      lines.push({ code, desc, amount, group });
    }
    return { lines, skippedTotals };
  }

  function compareLines(linesA, linesB) {
    const hasDuplicateCodes = (lines) => {
      const seen = new Set();
      for (const l of lines) {
        if (!l.code) continue;
        const k = normCode(l.code);
        if (seen.has(k)) return true;
        seen.add(k);
      }
      return false;
    };
    const anyCode = linesA.some((l) => l.code) || linesB.some((l) => l.code);
    const composite = anyCode && (hasDuplicateCodes(linesA) || hasDuplicateCodes(linesB));
    const keyOf = (l) => {
      if (l.code) return composite ? `c:${normCode(l.code)}|${normKey(l.desc)}` : `c:${normCode(l.code)}`;
      return `d:${normKey(l.desc)}`;
    };
    const index = (lines) => {
      const map = new Map();
      for (const l of lines) {
        const k = keyOf(l);
        const e = map.get(k);
        if (e) { e.amount += l.amount; e.count++; } else map.set(k, { ...l, count: 1 });
      }
      return map;
    };
    const mapA = index(linesA);
    const mapB = index(linesB);

    // Volgorde: de nieuwe versie (B) is leidend, zodat een nieuwe regel op
    // zijn eigen plek staat. Vervallen regels uit A komen direct na de laatste
    // regel die er in A vóór stond en in B nog bestaat.
    const removedAfter = new Map();
    let lastShared = "";
    for (const k of mapA.keys()) {
      if (mapB.has(k)) { lastShared = k; continue; }
      if (!removedAfter.has(lastShared)) removedAfter.set(lastShared, []);
      removedAfter.get(lastShared).push(k);
    }
    const keys = [...(removedAfter.get("") || [])];
    for (const k of mapB.keys()) {
      keys.push(k);
      for (const r of removedAfter.get(k) || []) keys.push(r);
    }

    const rows = keys.map((key) => {
      const a = mapA.get(key);
      const b = mapB.get(key);
      const ref = b || a;
      const row = { key, code: ref.code, desc: ref.desc, group: ref.group, a: a ? a.amount : null, b: b ? b.amount : null };
      row.delta = (row.b ?? 0) - (row.a ?? 0);
      row.status = !a ? "added" : !b ? "removed" : Math.abs(row.delta) < 0.005 ? "same" : "changed";
      row.pct = a && Math.abs(a.amount) > 0.005 ? (row.delta / Math.abs(a.amount)) * 100 : null;
      return row;
    });

    // Secties samenvoegen zonder op hoofdletters of dubbele spaties te letten
    // ("ABOVE THE LINE" en "Above the line" zijn dezelfde sectie).
    const groups = [];
    const byName = new Map();
    for (const row of rows) {
      const gk = normKey(row.group);
      let g = byName.get(gk);
      if (!g) {
        g = { name: row.group, rows: [], a: 0, b: 0, delta: 0, changes: 0 };
        byName.set(gk, g);
        groups.push(g);
      }
      g.rows.push(row);
      g.a += row.a ?? 0;
      g.b += row.b ?? 0;
      g.delta += row.delta;
      if (row.status !== "same") g.changes++;
    }
    const totalA = rows.reduce((n, r) => n + (r.a ?? 0), 0);
    const totalB = rows.reduce((n, r) => n + (r.b ?? 0), 0);
    const count = (s) => rows.filter((r) => r.status === s).length;
    return {
      rows,
      groups,
      totalA,
      totalB,
      delta: totalB - totalA,
      pct: Math.abs(totalA) > 0.005 ? ((totalB - totalA) / Math.abs(totalA)) * 100 : null,
      changed: count("changed"),
      added: count("added"),
      removed: count("removed"),
      same: count("same"),
      matchedOn: anyCode ? (composite ? "code+desc" : "code") : "desc",
      hasCents: rows.some((r) => [r.a, r.b].some((v) => v !== null && Math.abs(v - Math.round(v)) > 0.001)),
    };
  }

  // Voor tests (Node) en voor de pagina
  const api = { parseAmount, detectNumberFormat, detectDelimiter, parseDelimited, parseText, parseXlsx, findHeaderIndex, detectMapping, extractLines, compareLines, looksNumeric };
  if (typeof globalThis !== "undefined") globalThis.BudgetCompare = api;
  if (typeof document === "undefined") return;

  // ======================================================================
  // Pagina
  // ======================================================================

  const root = document.querySelector("[data-budget-compare]");
  if (!root) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STORAGE_KEY = "tubes-budget-compare";
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { return {}; } };
  const savePrefs = (prefs) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* privémodus of geblokkeerd: dan onthouden we niets */ } };

  const versions = {};
  const results = root.querySelector("[data-bc-results]");
  const summaryText = root.querySelector("[data-bc-summary-text]");
  const tiles = root.querySelector("[data-bc-tiles]");
  const tableWrap = root.querySelector("[data-bc-table]");
  const notes = root.querySelector("[data-bc-notes]");
  let current = null;
  let scrolledOnce = false;

  // Alles wat een getal toont, komt hier langs. Geen valuta: die weten we niet.
  const numberFormatter = (decimals, sign) =>
    new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: sign ? "exceptZero" : "auto" });

  function setupVersion(panel) {
    const id = panel.dataset.version;
    const v = {
      id,
      panel,
      label: panel.querySelector("[data-bc-label]"),
      file: panel.querySelector("[data-bc-file]"),
      paste: panel.querySelector("[data-bc-paste]"),
      status: panel.querySelector("[data-bc-status]"),
      setup: panel.querySelector("[data-bc-setup]"),
      sheetWrap: panel.querySelector("[data-bc-sheet-wrap]"),
      sheet: panel.querySelector("[data-bc-sheet]"),
      cols: Object.fromEntries([...panel.querySelectorAll("[data-bc-col]")].map((el) => [el.dataset.bcCol, el])),
      format: panel.querySelector("[data-bc-format]"),
      header: panel.querySelector("[data-bc-header]"),
      totals: panel.querySelector("[data-bc-totals]"),
      preview: panel.querySelector("[data-bc-preview]"),
      sheets: null,
      rows: null,
      mapping: null,
      headerRow: true,
      numberFormat: "auto",
      ignoreTotals: true,
      lines: [],
      skippedTotals: 0,
      sourceName: "",
    };
    versions[id] = v;

    v.file.addEventListener("change", async () => {
      const file = v.file.files && v.file.files[0];
      if (!file) return;
      v.status.textContent = "Reading " + file.name + "…";
      v.status.className = "bc-status";
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
        if (isZip) {
          setSheets(v, await parseXlsx(buffer), file.name);
        } else {
          setSheets(v, [{ name: file.name, rows: parseText(decodeText(buffer)) }], file.name);
        }
        v.paste.value = "";
      } catch (err) {
        const why = err && err.message === "no-inflate"
          ? "This browser cannot read Excel files directly. Paste the cells instead, or save the sheet as CSV."
          : "Could not read this file. Paste the cells instead, or save the sheet as CSV.";
        fail(v, why);
      }
      v.file.value = "";
    });

    let pasteTimer = null;
    v.paste.addEventListener("input", () => {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => {
        const text = v.paste.value;
        if (!text.trim()) return;
        try {
          setSheets(v, [{ name: "Pasted cells", rows: parseText(text) }], "pasted cells");
        } catch {
          fail(v, "Could not read the pasted cells.");
        }
      }, 250);
    });

    v.sheet.addEventListener("change", () => useSheet(v, Number(v.sheet.value)));
    for (const [name, select] of Object.entries(v.cols)) {
      select.addEventListener("change", () => {
        v.mapping[name] = Number(select.value);
        if (name === "amount") autoFormat(v);
        applySettings(v);
      });
    }
    v.format.addEventListener("change", () => { v.numberFormat = v.format.value; applySettings(v); });
    v.header.addEventListener("change", () => { v.headerRow = v.header.checked; applySettings(v); });
    v.totals.addEventListener("change", () => { v.ignoreTotals = v.totals.checked; applySettings(v); });
    v.label.addEventListener("input", () => { if (current) render(); });
  }

  function fail(v, message) {
    v.rows = null;
    v.lines = [];
    v.setup.hidden = true;
    v.status.textContent = message;
    v.status.className = "bc-status is-error";
    recompute();
  }

  function setSheets(v, sheets, sourceName) {
    v.sheets = sheets;
    v.sourceName = sourceName;
    v.sheet.innerHTML = sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join("");
    v.sheetWrap.hidden = sheets.length < 2;
    // Bij meer werkbladen: het eerste blad met de meeste regels
    let best = 0;
    sheets.forEach((s, i) => { if (s.rows.length > sheets[best].rows.length * 1.5) best = i; });
    v.sheet.value = String(best);
    useSheet(v, best);
  }

  function useSheet(v, index) {
    const sheet = v.sheets[index];
    const headerIndex = findHeaderIndex(sheet.rows);
    v.rows = headerIndex > 0 ? sheet.rows.slice(headerIndex) : sheet.rows;
    v.headerRow = headerIndex >= 0;
    v.mapping = detectMapping(v.rows, v.headerRow);
    if (!v.headerRow && v.rows.length > 1 && looksLikeHeader(v.rows[0])) {
      // Kopregel zonder bekende woorden (bijv. "A;B;C"): toch als kop nemen
      v.headerRow = true;
      v.mapping = detectMapping(v.rows, true);
    }
    v.numberFormat = "auto";
    v.ignoreTotals = true;
    autoFormat(v);

    // Eerder gekozen kolommen voor dezelfde kopregel weer gebruiken
    const saved = loadPrefs()[signature(v)];
    if (saved && saved.mapping) {
      v.mapping = { ...v.mapping, ...saved.mapping };
      if (saved.numberFormat) v.numberFormat = saved.numberFormat;
      if (typeof saved.headerRow === "boolean") v.headerRow = saved.headerRow;
      if (typeof saved.ignoreTotals === "boolean") v.ignoreTotals = saved.ignoreTotals;
    }
    // Zelfde kopregel als de andere versie: neem die instellingen over
    const other = versions[v.id === "a" ? "b" : "a"];
    if (other && other.rows && !saved && signature(other) === signature(v)) {
      v.mapping = { ...other.mapping };
      v.numberFormat = other.numberFormat;
      v.headerRow = other.headerRow;
      v.ignoreTotals = other.ignoreTotals;
    }
    fillControls(v);
    applySettings(v);
  }

  function autoFormat(v) {
    if (v.mapping.amount < 0) return;
    const values = v.rows.slice(v.headerRow ? 1 : 0, 300).map((r) => r[v.mapping.amount]);
    v.numberFormat = detectNumberFormat(values);
  }

  function signature(v) {
    if (!v.rows) return "";
    const width = v.rows.slice(0, 20).reduce((w, r) => Math.max(w, r.length), 0);
    return v.headerRow ? "h:" + v.rows[0].map((c) => normKey(c)).join("|") : "w:" + width;
  }

  function columnLabel(v, c) {
    const headerText = v.headerRow ? norm(v.rows[0][c]) : "";
    const first = v.rows.slice(v.headerRow ? 1 : 0).find((r) => r[c] !== undefined && String(r[c]).trim() !== "");
    const example = first ? norm(first[c]) : "";
    const name = headerText || `Column ${c + 1}`;
    return example ? `${name} (${example.length > 18 ? example.slice(0, 17) + "…" : example})` : name;
  }

  function fillControls(v) {
    const width = v.rows.slice(0, 60).reduce((w, r) => Math.max(w, r.length), 0);
    for (const [name, select] of Object.entries(v.cols)) {
      const options = [`<option value="-1">${name === "amount" ? "Choose…" : "None"}</option>`];
      for (let c = 0; c < width; c++) options.push(`<option value="${c}">${esc(columnLabel(v, c))}</option>`);
      select.innerHTML = options.join("");
      select.value = String(v.mapping[name]);
    }
    v.format.value = v.numberFormat;
    v.header.checked = v.headerRow;
    v.totals.checked = v.ignoreTotals;
    v.setup.hidden = false;
  }

  function applySettings(v) {
    const prefs = loadPrefs();
    prefs[signature(v)] = { mapping: v.mapping, numberFormat: v.numberFormat, headerRow: v.headerRow, ignoreTotals: v.ignoreTotals };
    savePrefs(prefs);
    renderPreview(v);
    if (v.mapping.amount < 0) {
      v.lines = [];
      v.status.textContent = "Which column holds the amounts? Choose it below.";
      v.status.className = "bc-status is-error";
    } else {
      const { lines, skippedTotals } = extractLines(v);
      v.lines = lines;
      v.skippedTotals = skippedTotals;
      if (!lines.length) {
        v.status.textContent = `No budget lines found in ${v.sourceName}. Check the Code, Line and Amount columns below.`;
        v.status.className = "bc-status is-error";
      } else {
        const bits = [`${lines.length} budget line${lines.length === 1 ? "" : "s"} from ${esc(v.sourceName)}`];
        if (skippedTotals) bits.push(`${skippedTotals} total row${skippedTotals === 1 ? "" : "s"} skipped`);
        v.status.innerHTML = bits.join(", ") + ".";
        v.status.className = "bc-status is-ok";
      }
    }
    recompute();
  }

  function renderPreview(v) {
    const width = v.rows.slice(0, 60).reduce((w, r) => Math.max(w, r.length), 0);
    const tags = { code: "Code", desc: "Line", amount: "Amount", group: "Section" };
    const head = [];
    for (let c = 0; c < width; c++) {
      const role = Object.keys(tags).find((k) => v.mapping[k] === c);
      const name = v.headerRow ? norm(v.rows[0][c]) : `Column ${c + 1}`;
      head.push(`<th${role ? ` class="is-${role}"` : ""}>${esc(name || " ")}${role ? `<span class="bc-tag">${tags[role]}</span>` : ""}</th>`);
    }
    const body = v.rows.slice(v.headerRow ? 1 : 0, (v.headerRow ? 1 : 0) + 5).map((r) => {
      const cells = [];
      for (let c = 0; c < width; c++) {
        const role = Object.keys(tags).find((k) => v.mapping[k] === c);
        cells.push(`<td${role ? ` class="is-${role}"` : ""}>${esc(r[c] ?? "")}</td>`);
      }
      return `<tr>${cells.join("")}</tr>`;
    });
    v.preview.innerHTML = `<div class="bc-preview-scroll"><table class="bc-preview-table"><thead><tr>${head.join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
  }

  function recompute() {
    const a = versions.a;
    const b = versions.b;
    if (!a || !b || !a.lines.length || !b.lines.length) {
      current = null;
      results.hidden = true;
      return;
    }
    current = compareLines(a.lines, b.lines);
    render();
    if (!scrolledOnce) {
      scrolledOnce = true;
      results.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }

  const STATUS_LABEL = { changed: "Changed", added: "New", removed: "Removed", same: "" };

  // ---------- Filters (één rij boven grafieken en tabel; gelden voor alles eronder) ----------

  const filters = { section: "", show: { changed: true, added: true, removed: true, same: false }, search: "" };
  const sectionSelect = root.querySelector("[data-bc-filter-section]");
  const showBoxes = [...root.querySelectorAll("[data-bc-show]")];
  const searchBox = root.querySelector("[data-bc-search]");
  const chartSections = root.querySelector("[data-bc-chart-sections]");
  const chartSectionsNote = root.querySelector("[data-bc-chart-sections-note]");
  const chartMovers = root.querySelector("[data-bc-chart-movers]");
  const legendA = root.querySelector("[data-bc-legend-a]");
  const legendB = root.querySelector("[data-bc-legend-b]");

  const groupKey = (name) => "g:" + normKey(name);
  const rowVisible = (row) =>
    filters.show[row.status] &&
    (!filters.section || groupKey(row.group) === filters.section) &&
    (!filters.search || (row.code + " " + row.desc).toLowerCase().includes(filters.search));

  function fillSectionFilter(r, groupName) {
    const wanted = filters.section;
    const options = ['<option value="">All sections</option>'];
    for (const g of r.groups) options.push(`<option value="${esc(groupKey(g.name))}">${esc(groupName(g))}</option>`);
    sectionSelect.innerHTML = options.join("");
    if (r.groups.some((g) => groupKey(g.name) === wanted)) sectionSelect.value = wanted;
    else { filters.section = ""; sectionSelect.value = ""; }
  }

  // ---------- Grafieken: inline SVG op de echte breedte, geen bibliotheek ----------
  // Staven dun (11-12px), datakant 4px rond en recht op de nullijn, 2px lucht
  // tussen de twee staven van een paar, hairline-raster, tekst in tekstkleuren.
  // Kleuren staan in style.css (bc-bar-a/-b, bc-bar-up/-down) en zijn
  // gevalideerd met de dataviz-validator (CVD-afstand en contrast).

  const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  const compactSigned = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const truncate = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);
  const px = (n) => Number(n.toFixed(1));

  // Asstap: 1, 2, 2.5 of 5 × 10^k, zodat er ongeveer `count` rasterlijnen komen
  function niceStep(range, count) {
    const raw = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }

  function gridLines(x, min, max, top, bottom, labelY) {
    const step = niceStep(max - min || 1, 4);
    let out = "";
    for (let t = Math.ceil(min / step - 1e-9) * step; t <= max + 1e-9; t += step) {
      const gx = px(x(t));
      out += `<line class="bc-grid" x1="${gx}" x2="${gx}" y1="${top}" y2="${bottom}"/>` +
        `<text class="bc-tick" x="${gx}" y="${labelY}" text-anchor="middle">${esc(compact.format(Math.abs(t) < 1e-9 ? 0 : t))}</text>`;
    }
    return out;
  }

  // Staaf van de nullijn (x0) naar de waarde (x1): rond aan de datakant, recht aan de nullijn
  function bar(x0, x1, y, h, cls, title) {
    const left = px(Math.min(x0, x1));
    const width = px(Math.abs(x1 - x0));
    if (width < 0.5) return "";
    const r = Math.min(4, width / 2, h / 2);
    const right = px(left + width);
    const d = x1 >= x0
      ? `M${left},${y} H${px(right - r)} A${r},${r} 0 0 1 ${right},${px(y + r)} V${px(y + h - r)} A${r},${r} 0 0 1 ${px(right - r)},${px(y + h)} H${left} Z`
      : `M${px(left + r)},${y} H${right} V${px(y + h)} H${px(left + r)} A${r},${r} 0 0 1 ${left},${px(y + h - r)} V${px(y + r)} A${r},${r} 0 0 1 ${px(left + r)},${y} Z`;
    return `<path class="${cls}" d="${d}"><title>${esc(title)}</title></path>`;
  }

  // Totalen per sectie: twee staven per sectie (A, B) met het verschil als enig getal
  function sectionsChart(groups, labelA, labelB, groupName, money, signed) {
    const W = Math.max(300, chartSections.clientWidth || 560);
    if (!groups.length) return `<p class="bc-chart-empty">No sections to show.</p>`;
    const labelW = Math.min(200, Math.round(W * 0.32));
    const valueW = 76;
    const padTop = 6;
    const band = 34;
    const barH = 11;
    const gap = 2;
    const plotX = labelW;
    const plotW = W - labelW - valueW;
    const values = groups.flatMap((g) => [g.a, g.b]);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const range = max - min || 1;
    const x = (v) => plotX + ((v - min) / range) * plotW;
    const plotBottom = padTop + groups.length * band;
    const H = plotBottom + 24;
    const chars = Math.floor(labelW / 7.2);
    const rows = groups.map((g, i) => {
      const y = px(padTop + i * band + (band - (2 * barH + gap)) / 2);
      const mid = px(y + barH + gap / 2);
      const name = groupName(g);
      const title = `${name}: ${labelA} ${money.format(g.a)}, ${labelB} ${money.format(g.b)}, change ${signed.format(g.delta)}`;
      const end = Math.max(x(g.a), x(g.b), x(0));
      return `<g class="bc-mark">` +
        `<text class="bc-label" x="${labelW - 12}" y="${mid}" text-anchor="end" dominant-baseline="middle">${esc(truncate(name, chars))}<title>${esc(title)}</title></text>` +
        bar(x(0), x(g.a), y, barH, "bc-bar bc-bar-a", title) +
        bar(x(0), x(g.b), px(y + barH + gap), barH, "bc-bar bc-bar-b", title) +
        (Math.abs(g.delta) > 0.005 ? `<text class="bc-value" x="${px(end + 8)}" y="${mid}" dominant-baseline="middle">${esc(compactSigned.format(g.delta))}</text>` : "") +
        `</g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Totals per section, ${esc(labelA)} against ${esc(labelB)}">` +
      gridLines(x, min, max, padTop, plotBottom, H - 6) +
      `<line class="bc-axis" x1="${px(x(0))}" x2="${px(x(0))}" y1="${padTop}" y2="${plotBottom}"/>` +
      rows + `</svg>`;
  }

  // Grootste verschuivingen: divergerende staven rond nul, elk met zijn waarde
  function moversChart(rows, money, signed) {
    const W = Math.max(300, chartMovers.clientWidth || 560);
    const movers = rows.filter((row) => Math.abs(row.delta) > 0.005).sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta)).slice(0, 10);
    if (!movers.length) return `<p class="bc-chart-empty">No changes within the current filters.</p>`;
    const labelW = Math.min(230, Math.round(W * 0.36));
    const valueW = 70;
    const padTop = 6;
    const band = 30;
    const barH = 12;
    const min = Math.min(0, ...movers.map((m) => m.delta));
    const max = Math.max(0, ...movers.map((m) => m.delta));
    const range = max - min || 1;
    const plotX = labelW + (min < 0 ? valueW : 0);
    const plotW = W - plotX - (max > 0 ? valueW : 0);
    const x = (v) => plotX + ((v - min) / range) * plotW;
    const plotBottom = padTop + movers.length * band;
    const H = plotBottom + 24;
    const chars = Math.floor(labelW / 7.2);
    const marks = movers.map((row, i) => {
      const y = px(padTop + i * band + (band - barH) / 2);
      const mid = px(y + barH / 2);
      const name = (row.code ? row.code + " " : "") + (row.desc || "(no description)");
      const from = row.a === null ? "new" : money.format(row.a);
      const to = row.b === null ? "removed" : money.format(row.b);
      const title = `${name}: ${from} to ${to}, change ${signed.format(row.delta)}`;
      const up = row.delta > 0;
      return `<g class="bc-mark">` +
        `<text class="bc-label" x="${labelW - 12}" y="${mid}" text-anchor="end" dominant-baseline="middle">${esc(truncate(name, chars))}<title>${esc(title)}</title></text>` +
        bar(x(0), x(row.delta), y, barH, up ? "bc-bar bc-bar-up" : "bc-bar bc-bar-down", title) +
        `<text class="bc-value" x="${px(x(row.delta) + (up ? 8 : -8))}" y="${mid}" text-anchor="${up ? "start" : "end"}" dominant-baseline="middle">${esc(compactSigned.format(row.delta))}</text>` +
        `</g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Lines with the largest change">` +
      gridLines(x, min, max, padTop, plotBottom, H - 6) +
      `<line class="bc-axis" x1="${px(x(0))}" x2="${px(x(0))}" y1="${padTop}" y2="${plotBottom}"/>` +
      marks + `</svg>`;
  }

  // ---------- Resultaat tonen ----------

  function render() {
    const r = current;
    const labelA = norm(versions.a.label.value) || "Version A";
    const labelB = norm(versions.b.label.value) || "Version B";
    const dec = r.hasCents ? 2 : 0;
    const money = numberFormatter(dec, false);
    const signed = numberFormatter(dec, true);
    const pct = (p) => (p === null ? "" : numberFormatter(1, true).format(p) + "%");
    const direction = r.delta > 0.005 ? "higher than" : r.delta < -0.005 ? "lower than" : "the same as";
    const changes = r.changed + r.added + r.removed;
    const groupName = (g) => g.name || (r.groups.length === 1 ? "All lines" : "Other lines");

    results.hidden = false;
    summaryText.innerHTML =
      `<strong>${esc(labelB)}</strong> totals ${money.format(r.totalB)}, ${direction} <strong>${esc(labelA)}</strong> at ${money.format(r.totalA)}` +
      (Math.abs(r.delta) > 0.005 ? ` (${signed.format(r.delta)}${r.pct === null ? "" : ", " + pct(r.pct)})` : "") +
      `. ${changes === 0 ? "No lines changed." : `${changes} of ${r.rows.length} lines differ.`}`;

    tiles.innerHTML = [
      tile(esc(labelA), money.format(r.totalA), "blue"),
      tile(esc(labelB), money.format(r.totalB), "teal"),
      tile("Difference", `${signed.format(r.delta)}${r.pct === null ? "" : ` <small>${pct(r.pct)}</small>`}`, r.delta > 0.005 ? "amber" : r.delta < -0.005 ? "mint" : "neutral"),
      tile("Lines", `${r.changed} changed <small>· ${r.added} new · ${r.removed} removed</small>`, "neutral"),
    ].join("");

    // Filters en wat erdoor zichtbaar blijft
    fillSectionFilter(r, groupName);
    const visibleGroups = r.groups.map((g) => ({ g, rows: g.rows.filter(rowVisible) })).filter((x) => x.rows.length);
    const visibleRows = visibleGroups.flatMap((x) => x.rows);

    // Grafieken: sectiegrafiek volgt alleen het sectiefilter; bij veel secties de grootste vijftien
    legendA.textContent = labelA;
    legendB.textContent = labelB;
    let chartGroups = filters.section ? r.groups.filter((g) => groupKey(g.name) === filters.section) : r.groups;
    const MAX_SECTIONS = 15;
    if (chartGroups.length > MAX_SECTIONS) {
      const keep = new Set([...chartGroups].sort((p, q) => Math.max(Math.abs(q.a), Math.abs(q.b)) - Math.max(Math.abs(p.a), Math.abs(p.b))).slice(0, MAX_SECTIONS));
      chartSectionsNote.textContent = `The ${MAX_SECTIONS} largest of ${chartGroups.length} sections; the table below has them all.`;
      chartGroups = chartGroups.filter((g) => keep.has(g));
    } else {
      chartSectionsNote.textContent = "Both versions side by side, with the change at the end of each pair.";
    }
    chartSections.innerHTML = sectionsChart(chartGroups, labelA, labelB, groupName, money, signed);
    chartMovers.innerHTML = moversChart(visibleRows, money, signed);

    // Tabel
    const head = `<thead><tr><th class="bc-col-status"><span class="visually-hidden">Status</span></th><th class="bc-col-code">Code</th><th>Line</th><th class="bc-num">${esc(labelA)}</th><th class="bc-num">${esc(labelB)}</th><th class="bc-num">Change</th><th class="bc-num bc-col-pct">%</th></tr></thead>`;
    const body = visibleGroups.map(({ g, rows }) => {
      const rowsHtml = rows.map((row) => `<tr class="bc-row bc-row-${row.status}">
          <td class="bc-col-status">${row.status === "same" ? "" : `<span class="chip bc-chip-${row.status}">${STATUS_LABEL[row.status]}</span>`}</td>
          <td class="bc-col-code">${esc(row.code)}</td>
          <td class="bc-col-desc">${esc(row.desc) || "<span class=\"bc-muted\">(no description)</span>"}</td>
          <td class="bc-num">${row.a === null ? "<span class=\"bc-muted\">–</span>" : money.format(row.a)}</td>
          <td class="bc-num">${row.b === null ? "<span class=\"bc-muted\">–</span>" : money.format(row.b)}</td>
          <td class="bc-num bc-delta">${Math.abs(row.delta) < 0.005 ? "" : signed.format(row.delta)}</td>
          <td class="bc-num bc-col-pct">${row.status === "changed" ? pct(row.pct) : ""}</td>
        </tr>`).join("");
      return `<tbody class="bc-group">
        <tr class="bc-group-row"><th scope="rowgroup" colspan="3">${esc(groupName(g))}</th><td class="bc-num">${money.format(g.a)}</td><td class="bc-num">${money.format(g.b)}</td><td class="bc-num bc-delta">${Math.abs(g.delta) < 0.005 ? "" : signed.format(g.delta)}</td><td class="bc-col-pct"></td></tr>
        ${rowsHtml}
      </tbody>`;
    }).join("");
    const foot = `<tfoot><tr><th scope="row" colspan="3">Total</th><td class="bc-num">${money.format(r.totalA)}</td><td class="bc-num">${money.format(r.totalB)}</td><td class="bc-num bc-delta">${Math.abs(r.delta) < 0.005 ? "" : signed.format(r.delta)}</td><td class="bc-num bc-col-pct">${pct(r.pct)}</td></tr></tfoot>`;
    if (!visibleRows.length) {
      const nothingChanged = changes === 0 && !filters.show.same && !filters.section && !filters.search;
      tableWrap.innerHTML = `<p class="bc-empty">${nothingChanged
        ? `The two versions have the same amounts on every matched line. Tick "Unchanged" to see all ${r.rows.length} lines.`
        : "No lines match the current filters."}</p>`;
    } else {
      tableWrap.innerHTML = `<table class="bc-table">${head}${body}${foot}</table>`;
    }

    const matched = { code: "account code", "code+desc": "account code and description", desc: "description (no code column)" }[r.matchedOn];
    const skipped = ["a", "b"].map((id) => versions[id].skippedTotals ? `${versions[id].skippedTotals} total row${versions[id].skippedTotals === 1 ? "" : "s"} skipped in ${esc(norm(versions[id].label.value) || (id === "a" ? "version A" : "version B"))}` : "").filter(Boolean);
    notes.innerHTML = `Lines matched on ${matched}.${skipped.length ? " " + skipped.join("; ") + "." : ""} Section and grand totals always cover every line; the filters only decide which lines are listed. Amounts are shown as they appear in your sheets, without currency.`;
  }

  function tile(label, value, tone) {
    return `<div class="bc-tile bc-tile-${tone}"><span class="bc-tile-label">${label}</span><span class="bc-tile-value">${value}</span></div>`;
  }

  // ---------- Export ----------

  function exportCsv() {
    if (!current) return;
    const r = current;
    const labelA = norm(versions.a.label.value) || "Version A";
    const labelB = norm(versions.b.label.value) || "Version B";
    const decimalComma = new Intl.NumberFormat().format(1.5).includes(",");
    const sep = decimalComma ? ";" : ",";
    const num = (n) => (n === null ? "" : decimalComma ? n.toFixed(2).replace(".", ",") : n.toFixed(2));
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [["Section", "Code", "Line", labelA, labelB, "Change", "Change %", "Status"].map(q).join(sep)];
    for (const row of r.rows) {
      lines.push([q(row.group), q(row.code), q(row.desc), num(row.a), num(row.b), num(row.delta), row.pct === null ? "" : num(row.pct), q(STATUS_LABEL[row.status] || "Unchanged")].join(sep));
    }
    lines.push([q(""), q(""), q("Total"), num(r.totalA), num(r.totalB), num(r.delta), r.pct === null ? "" : num(r.pct), q("")].join(sep));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `budget-compare-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Voorbeeldbudgetten ----------

  const SAMPLE_A = [
    ["Account", "Description", "Total"],
    ["", "ABOVE THE LINE", ""],
    ["1100", "Story & rights", "45.000"],
    ["1200", "Producers", "120.000"],
    ["1300", "Director", "85.000"],
    ["1400", "Principal cast", "160.000"],
    ["", "Total above the line", "410.000"],
    ["", "BELOW THE LINE", ""],
    ["2100", "Production staff", "210.000"],
    ["2200", "Camera", "96.000"],
    ["2300", "Lighting & grip", "74.000"],
    ["2400", "Art department", "88.000"],
    ["2500", "Locations", "62.000"],
    ["2600", "Transport", "38.000"],
    ["2700", "Catering", "24.500"],
    ["", "Total below the line", "592.500"],
    ["", "POST PRODUCTION", ""],
    ["3100", "Editing", "58.000"],
    ["3200", "Sound post", "32.000"],
    ["3300", "Grading & VFX", "41.000"],
    ["", "Total post production", "131.000"],
    ["", "OTHER", ""],
    ["4100", "Insurance", "18.000"],
    ["4200", "Legal & accounting", "14.000"],
    ["4900", "Contingency", "80.000"],
    ["", "Total other", "112.000"],
    ["", "GRAND TOTAL", "1.245.500"],
  ];
  const SAMPLE_B = [
    ["Account", "Description", "Total"],
    ["", "ABOVE THE LINE", ""],
    ["1100", "Story & rights", "45.000"],
    ["1200", "Producers", "120.000"],
    ["1300", "Director", "85.000"],
    ["1400", "Principal cast", "172.000"],
    ["", "Total above the line", "422.000"],
    ["", "BELOW THE LINE", ""],
    ["2100", "Production staff", "218.400"],
    ["2200", "Camera", "96.000"],
    ["2300", "Lighting & grip", "79.500"],
    ["2400", "Art department", "88.000"],
    ["2500", "Locations", "71.000"],
    ["2550", "Weather cover", "9.000"],
    ["2600", "Transport", "41.000"],
    ["2700", "Catering", "24.500"],
    ["", "Total below the line", "627.400"],
    ["", "POST PRODUCTION", ""],
    ["3100", "Editing", "58.000"],
    ["3200", "Sound post", "32.000"],
    ["3300", "Grading & VFX", "36.000"],
    ["", "Total post production", "126.000"],
    ["", "OTHER", ""],
    ["4100", "Insurance", "18.000"],
    ["4900", "Contingency", "80.000"],
    ["", "Total other", "98.000"],
    ["", "GRAND TOTAL", "1.273.400"],
  ];

  // ---------- Start ----------

  for (const panel of root.querySelectorAll("[data-version]")) setupVersion(panel);
  sectionSelect.addEventListener("change", () => { filters.section = sectionSelect.value; if (current) render(); });
  for (const box of showBoxes) box.addEventListener("change", () => { filters.show[box.dataset.bcShow] = box.checked; if (current) render(); });
  searchBox.addEventListener("input", () => { filters.search = searchBox.value.trim().toLowerCase(); if (current) render(); });
  // Grafieken staan op de echte breedte; bij een andere breedte opnieuw tekenen
  if ("ResizeObserver" in window) {
    let lastWidth = 0;
    let resizeTimer = null;
    new ResizeObserver(() => {
      const width = chartSections.clientWidth;
      if (!current || !width || width === lastWidth) return;
      lastWidth = width;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 120);
    }).observe(chartSections);
  }
  root.querySelector("[data-bc-csv]").addEventListener("click", exportCsv);
  root.querySelector("[data-bc-print]").addEventListener("click", () => window.print());
  const sampleButton = root.querySelector("[data-bc-sample]");
  if (sampleButton) {
    sampleButton.addEventListener("click", () => {
      versions.a.label.value = "Approved budget";
      versions.b.label.value = "Working budget v3";
      versions.a.paste.value = "";
      versions.b.paste.value = "";
      setSheets(versions.a, [{ name: "Sample", rows: SAMPLE_A.map((r) => [...r]) }], "the sample budget");
      setSheets(versions.b, [{ name: "Sample", rows: SAMPLE_B.map((r) => [...r]) }], "the sample budget");
    });
  }
})();
