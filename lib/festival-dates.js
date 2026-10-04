// Een festival met een "next_dates" in het verleden ("2 to 12 September 2026")
// is niet meer de volgende editie. Bij het bouwen valt die datum weg, zodat de
// kaart terugvalt op de gebruikelijke maand (`month`) tot iemand de nieuwe
// data invult. De laatste volledige datum in de tekst telt ("... 2027 (festival);
// Forum 23 to 25 March 2027" eindigt op 25 maart 2027).
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function lastDate(text) {
  const re = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi;
  let last = null;
  for (const m of String(text || "").matchAll(re)) {
    last = new Date(Date.UTC(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[1])));
  }
  return last;
}

export function withoutPastDates(item, today = new Date()) {
  const end = lastDate(item.next_dates);
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return end && end < startOfToday ? { ...item, next_dates: null } : item;
}
