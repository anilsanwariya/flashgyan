// The current affairs web reader: shared by the server and the pages.

// The subject of the daily current affairs practice tests (kept out of the
// general MCQ practice list; the reader links them).
export const CA_PRACTICE_SUBJECT = "Current Affairs";

// A Telegram mini app's start parameter for a day (and a story):
// "ca_2026-11-25" or "ca_2026-11-25_3".
export function readerStart(
  param: string | null | undefined,
): { date: string; story: number | null } | null {
  const m = /^ca_(\d{4}-\d{2}-\d{2})(?:_(\d{1,3}))?$/.exec(param ?? "");
  return m ? { date: m[1], story: m[2] ? Number(m[2]) : null } : null;
}

// Amounts, numbers with their units and dates, marked bold in the reader
// (the phone PDF does the same in its own script).
const N = "[0-9०-९]+([,.][0-9०-९]+)*";
const UNITS = "करोड़|लाख|हज़ार|हजार|crore|lakh|billion|million|trillion|प्रतिशत|per cent|percent";
const MONTHS =
  "जनवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर|January|February|March|April|May|June|July|August|September|October|November|December";
export const FACT_RE = new RegExp(
  `(?<![A-Za-z0-9०-९])(₹ ?${N}( ?(${UNITS}))?|${N} (${MONTHS})( [0-9०-९]{4})?|${N}( ?%| (${UNITS})|st|nd|rd|th)?)`,
  "g",
);

// The text split into plain runs and exam facts.
export function factParts(text: string): { text: string; fact: boolean }[] {
  const out: { text: string; fact: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(FACT_RE)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index), fact: false });
    out.push({ text: m[0], fact: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), fact: false });
  return out;
}
