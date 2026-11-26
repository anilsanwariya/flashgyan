// A story's repeated facts: the same figure or date, or the same sentence,
// printed in two parts of one story (the summary and a point, a point and
// the Static Context…). Pure and without imports, for the story editor,
// the day's checklist and tests. The headline may share the main fact.

type Bi = { en: string; hi: string };
type Lang = "en" | "hi";

// The parts of a story's content this looks at (what prints).
export type RepeatContent = {
  summary?: Bi | null;
  hide_summary?: boolean;
  points?: Bi[];
  statics?: { keyword?: Bi; text: Bi }[];
  dyk?: Bi[];
  visual?: unknown;
  visual_covers?: number[];
  visual2?: unknown;
  visual2_covers?: number[];
  visual3?: unknown;
  visual3_covers?: number[];
  visual4?: unknown;
  visual4_covers?: number[];
};

export type RepeatPart =
  | { kind: "summary" }
  | { kind: "point"; index: number }
  | { kind: "visual"; slot: number }
  | { kind: "static"; index: number }
  | { kind: "dyk"; index: number };

export type Repeat = {
  // The figure or date as written, or the start of the repeated sentence.
  value: string;
  what: "figure" | "sentence";
  parts: RepeatPart[];
};

const pick = (b: Bi | null | undefined, lang: Lang) =>
  ((lang === "hi" ? b?.hi || b?.en : b?.en || b?.hi) ?? "").trim();

const N = "[0-9०-९]+([,.][0-9०-९]+)*";
const UNITS = "करोड़|लाख|हज़ार|हजार|crore|lakh|billion|million|trillion|प्रतिशत|per cent|percent";
const MONTHS =
  "जनवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर|January|February|March|April|May|June|July|August|September|October|November|December";
const FIGURE = new RegExp(
  `(?<![A-Za-z0-9०-९])(₹ ?${N}( ?(${UNITS}))?|${N} (${MONTHS})( [0-9०-९]{4})?|${N}( ?%| (${UNITS}))?)`,
  "g",
);

const DIGITS: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};
// The same figure however it's written (Devanagari digits, commas, spaces,
// "per cent" or "%", Hindi or English unit).
const UNIT_KEY: Record<string, string> = {
  करोड़: "cr",
  crore: "cr",
  लाख: "lakh",
  lakh: "lakh",
  हज़ार: "k",
  हजार: "k",
  billion: "bn",
  million: "mn",
  trillion: "tn",
  प्रतिशत: "%",
  "per cent": "%",
  percent: "%",
};
function figureKey(s: string): string {
  let t = s.replace(/[०-९]/g, (d) => DIGITS[d]).toLowerCase();
  for (const [w, k] of Object.entries(UNIT_KEY)) t = t.replace(w.toLowerCase(), k);
  return t.replace(/[\s,₹]/g, "");
}

// A bare number worth counting: not a small count ("3 stages") or a year
// on its own ("2026").
function counts(match: string): boolean {
  const bare = /^[0-9०-९]+([,.][0-9०-९]+)*$/.test(match.trim());
  if (!bare) return true;
  const n = Number(match.replace(/[०-९]/g, (d) => DIGITS[d]).replace(/,/g, ""));
  return n >= 10 && !(n >= 1900 && n <= 2100);
}

function figures(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(FIGURE)) if (counts(m[0])) out.set(figureKey(m[0]), m[0].trim());
  return out;
}

// Every text in a visual, in the language.
function visualText(v: unknown, lang: Lang): string {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(walk);
    const o = x as Record<string, unknown>;
    if (typeof o.en === "string" && typeof o.hi === "string") {
      out.push(pick(o as Bi, lang));
      return;
    }
    for (const [k, val] of Object.entries(o)) {
      if (k === "type") continue;
      if (typeof val === "string" && k === "value") out.push(val);
      else if (typeof val === "number" && k === "value") out.push(String(val));
      else walk(val);
    }
  };
  walk(v);
  return out.join(" · ");
}

const SLOTS = [
  ["visual", "visual_covers"],
  ["visual2", "visual2_covers"],
  ["visual3", "visual3_covers"],
  ["visual4", "visual4_covers"],
] as const;

// The printed parts, each with its text.
function printedParts(c: RepeatContent, lang: Lang): { part: RepeatPart; text: string }[] {
  const out: { part: RepeatPart; text: string }[] = [];
  if (!c.hide_summary && pick(c.summary, lang))
    out.push({ part: { kind: "summary" }, text: pick(c.summary, lang) });
  // Points a visual shows aren't printed.
  const hidden = new Set(SLOTS.flatMap(([k, cov]) => (c[k] ? (c[cov] ?? []) : [])));
  (c.points ?? []).forEach((p, index) => {
    if (!hidden.has(index) && pick(p, lang))
      out.push({ part: { kind: "point", index }, text: pick(p, lang) });
  });
  SLOTS.forEach(([k], slot) => {
    if (c[k]) out.push({ part: { kind: "visual", slot }, text: visualText(c[k], lang) });
  });
  (c.statics ?? []).forEach((s, index) => {
    if (pick(s.text, lang)) out.push({ part: { kind: "static", index }, text: pick(s.text, lang) });
  });
  (c.dyk ?? []).forEach((d, index) => {
    if (pick(d, lang)) out.push({ part: { kind: "dyk", index }, text: pick(d, lang) });
  });
  return out;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[\s,;:।.()"'“”‘’\-–—/]+/)
      .filter((w) => w.length > 2),
  );

// The same sentence (most of its words) in two parts.
function sameSentence(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.size < 5 || wb.size < 5) return false;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / Math.min(wa.size, wb.size) >= 0.8;
}

export function findRepeats(c: RepeatContent | null | undefined, lang: Lang): Repeat[] {
  if (!c) return [];
  const parts = printedParts(c, lang);
  const out: Repeat[] = [];
  // Figures and dates in more than one part.
  const seen = new Map<string, { value: string; parts: RepeatPart[] }>();
  for (const p of parts)
    for (const [key, value] of figures(p.text)) {
      const e = seen.get(key) ?? { value, parts: [] };
      e.parts.push(p.part);
      seen.set(key, e);
    }
  for (const e of seen.values())
    if (e.parts.length > 1) out.push({ value: e.value, what: "figure", parts: e.parts });
  // The summary's sentences said again in a point, the Static Context or the
  // Fact Bite.
  const summary = parts.find((p) => p.part.kind === "summary");
  if (summary)
    for (const s of summary.text.split(/(?<=[.।!?])\s+/))
      for (const p of parts)
        if (p.part.kind !== "summary" && p.part.kind !== "visual" && sameSentence(s, p.text))
          out.push({
            value: s.slice(0, 80),
            what: "sentence",
            parts: [{ kind: "summary" }, p.part],
          });
  return out;
}

export function partLabel(p: RepeatPart): string {
  switch (p.kind) {
    case "summary":
      return "the summary";
    case "point":
      return `point ${p.index + 1}`;
    case "visual":
      return p.slot ? `visual ${p.slot + 1}` : "the visual";
    case "static":
      return "Static Context";
    case "dyk":
      return "the Fact Bite";
  }
}
