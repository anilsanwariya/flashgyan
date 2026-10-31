// Dated facts in the atlas: the notes mark facts that change ("⟦🔄 … (as of
// Sep 2026 — check) ⟧"). Students see only "(as of Sep 2026)", so the editor
// rechecks them on a schedule instead: a fact is due some months after its
// "as of" date or its last recheck, whichever is later. Pure.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_HI = [
  ["जनवरी"],
  ["फ़रवरी", "फरवरी"],
  ["मार्च"],
  ["अप्रैल"],
  ["मई"],
  ["जून"],
  ["जुलाई"],
  ["अगस्त"],
  ["सितंबर", "सितम्बर"],
  ["अक्टूबर", "अक्तूबर"],
  ["नवंबर", "नवम्बर"],
  ["दिसंबर", "दिसम्बर"],
];

export const RECHECK_MONTHS = [3, 6, 12] as const;
export const DEFAULT_RECHECK = 6;

// "Sep 2026" → "2026-09", "2026" → "2026-01", "2023-24 data" → "2024-01",
// "post-2023" → "2023-01"; null when there is no year.
export function asOfMonth(s: string): string | null {
  const m =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+((?:19|20)\d{2})\b/i.exec(s);
  if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}`;
  const r = /\b((?:19|20)\d{2})\s*[-–]\s*(\d{2})\b/.exec(s);
  if (r) return `${r[1].slice(0, 2)}${r[2]}-01`;
  const y = /\b((?:19|20)\d{2})\b/.exec(s);
  return y ? `${y[1]}-01` : null;
}

// The "as of" part of a fact: "(as of Sep 2026 — check)" → "Sep 2026".
const AS_OF = /\(as of ([^;)—–]*)/i;

// A fact that needs rechecking (marked 🔄, or with an "as of" date), and
// the month it was last true; null for any other fact.
export function datedFact(text: string): { asOf: string | null; label: string } | null {
  const m = AS_OF.exec(text);
  if (!m && !/🔄/u.test(text)) return null;
  const label = m ? m[1].trim() : "";
  return { asOf: label ? asOfMonth(label) : null, label };
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
export const monthOf = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// When a dated fact is next due: `months` after the later of its "as of"
// month and its last recheck (a "YYYY-MM-DD"). Never checked and undated:
// due now.
export function recheckDue(
  asOf: string | null,
  checkedOn: string | null,
  months: number,
  today: Date,
): { last: string | null; due: string; isDue: boolean } {
  const checked = checkedOn ? checkedOn.slice(0, 7) : null;
  const last = [asOf, checked].filter(Boolean).sort().pop() ?? null;
  const now = monthOf(today);
  const due = last ? addMonths(last, months) : now;
  return { last, due, isDue: due <= now };
}

// "Still true": the fact's "as of" date moved to this month, when it is a
// month ("Sep 2026"). A year alone ("as of 2024") is usually the year of
// the data, and "2023-24 data" or "post-2023" are part of the fact: kept.
// The Hindi text follows when it has the same date (in English or Hindi
// month names).
export function bumpAsOf(en: string, hi: string, today: Date): { en: string; hi: string } {
  const m = AS_OF.exec(en);
  const label = m?.[1].trim() ?? "";
  const plain = /^[A-Za-z]{3,9}\.?,?\s+(?:19|20)\d{2}$/.test(label);
  if (!m || !plain) return { en, hi };
  const now = `${MONTH_EN[today.getUTCMonth()]} ${today.getUTCFullYear()}`;
  if (label === now) return { en, hi };
  const at = m.index + m[0].indexOf(label);
  const newEn = en.slice(0, at) + now + en.slice(at + label.length);
  let newHi = hi;
  if (hi.includes(label)) newHi = hi.replace(label, now);
  else {
    const old = asOfMonth(label)!;
    const [y, mo] = old.split("-").map(Number);
    const hiNow = `${MONTH_HI[today.getUTCMonth()][0]} ${today.getUTCFullYear()}`;
    for (const name of MONTH_HI[mo - 1]) {
      const re = new RegExp(`${name},?\\s+${y}`);
      if (re.test(hi)) {
        newHi = hi.replace(re, hiNow);
        break;
      }
    }
  }
  return { en: newEn, hi: newHi };
}
