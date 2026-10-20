// Hindi and English saying the same thing. Every part of a story the
// magazine prints (its text, Static Connect, "Did you know", the MCQ, the
// Mains question and the revision lines) is in both languages: a part in one
// language only, or a number, date or name that differs between them, is half
// a story or a wrong fact for half the readers. Missing parts, numbers and
// dates are found here, as the editor works; names (and facts one language
// leaves out) need SAATHI, one AI request a day.
// Pure helpers, shared by the server, the admin panel and tests.
import { normalizeForMatch, type Bi, type CaContent } from "@/lib/current-affairs";
import { partName } from "@/lib/ca-style";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One part whose languages differ. `en`/`hi` are the texts compared; once
// either changes, the note is gone. `wrong`: the language to fix, when known
// (from the story's source, or SAATHI); `fix`: that language's line corrected.
export type LangNote = {
  id: string;
  item_id: string;
  part: string;
  kind: "numbers" | "names" | "missing";
  en: string;
  hi: string;
  issue: string;
  wrong: "en" | "hi" | null;
  fix: string | null;
  // The source's words behind a point, to see which language is right.
  source?: string;
};

export type LangCheck = {
  // When SAATHI last compared names ("" when only notes were waved through).
  at: string;
  // Each story's text when SAATHI compared it.
  stories: Record<string, string>;
  notes: LangNote[];
  // Notes the editor waved through ("It's fine").
  dismissed: string[];
};

// ---------- The printed parts ----------

type Access = {
  get: (c: CaContent) => Bi | null | undefined;
  set: (c: CaContent, b: Bi) => CaContent;
};

// Where a part lives in the story, by its name ("point 2", "static 1 term",
// "mcq option 3"…).
function access(part: string): Access | null {
  const at = (re: RegExp) => Number(re.exec(part)?.[1] ?? 0) - 1;
  const mapAt = <T>(xs: T[] | undefined, i: number, f: (x: T) => T) =>
    (xs ?? []).map((x, j) => (j === i ? f(x) : x));
  switch (part) {
    case "headline":
    case "summary":
    case "why":
      return { get: (c) => c[part], set: (c, b) => ({ ...c, [part]: b }) };
    case "background":
      return { get: (c) => c.background, set: (c, b) => ({ ...c, background: b }) };
    case "mains":
      return { get: (c) => c.mains, set: (c, b) => ({ ...c, mains: b }) };
    case "one-liner":
      return { get: (c) => c.oneliner, set: (c, b) => ({ ...c, oneliner: b }) };
    case "mcq question":
      return {
        get: (c) => c.mcq?.question,
        set: (c, b) => (c.mcq ? { ...c, mcq: { ...c.mcq, question: b } } : c),
      };
    case "mcq explanation":
      return {
        get: (c) => c.mcq?.explanation,
        set: (c, b) => (c.mcq ? { ...c, mcq: { ...c.mcq, explanation: b } } : c),
      };
    case "quick question":
      return {
        get: (c) => c.quick?.q,
        set: (c, b) => (c.quick ? { ...c, quick: { ...c.quick, q: b } } : c),
      };
    case "quick answer":
      return {
        get: (c) => c.quick?.a,
        set: (c, b) => (c.quick ? { ...c, quick: { ...c.quick, a: b } } : c),
      };
  }
  let i = at(/^point (\d+)$/);
  if (i >= 0) {
    return {
      get: (c) => c.points[i],
      set: (c, b) => ({ ...c, points: mapAt(c.points, i, () => b) }),
    };
  }
  i = at(/^static (\d+)$/);
  if (i >= 0) {
    return {
      get: (c) => c.statics?.[i]?.text,
      set: (c, b) => ({ ...c, statics: mapAt(c.statics, i, (x) => ({ ...x, text: b })) }),
    };
  }
  i = at(/^static (\d+) term$/);
  if (i >= 0) {
    return {
      get: (c) => c.statics?.[i]?.keyword,
      set: (c, b) => ({ ...c, statics: mapAt(c.statics, i, (x) => ({ ...x, keyword: b })) }),
    };
  }
  i = at(/^did you know (\d+)$/);
  if (i >= 0) {
    return {
      get: (c) => c.dyk?.[i],
      set: (c, b) => ({ ...c, dyk: mapAt(c.dyk, i, (x) => ({ ...x, en: b.en, hi: b.hi })) }),
    };
  }
  i = at(/^mcq option (\d+)$/);
  if (i >= 0) {
    return {
      get: (c) => c.mcq?.options[i],
      set: (c, b) =>
        c.mcq ? { ...c, mcq: { ...c.mcq, options: mapAt(c.mcq.options, i, () => b) } } : c,
    };
  }
  return null;
}

// Every printed part with text in either language, in the order of the page.
export function bilingualParts(c: CaContent): { part: string; en: string; hi: string }[] {
  const names = [
    "headline",
    "summary",
    ...(c.points ?? []).map((_, i) => `point ${i + 1}`),
    "why",
    "background",
    ...(c.statics ?? []).flatMap((_, i) => [`static ${i + 1} term`, `static ${i + 1}`]),
    ...(c.dyk ?? []).map((_, i) => `did you know ${i + 1}`),
    ...(c.mcq
      ? ["mcq question", ...c.mcq.options.map((_, i) => `mcq option ${i + 1}`), "mcq explanation"]
      : []),
    "mains",
    "one-liner",
    "quick question",
    "quick answer",
  ];
  return names
    .map((part) => ({ part, en: langText(c, part, "en"), hi: langText(c, part, "hi") }))
    .filter((p) => p.en || p.hi);
}

export function langText(c: CaContent | null, part: string, lang: "en" | "hi"): string {
  const b = c ? access(part)?.get(c) : null;
  return (typeof b?.[lang] === "string" ? b[lang] : "").trim();
}

export function withLangPart(
  c: CaContent,
  part: string,
  lang: "en" | "hi",
  text: string,
): CaContent {
  const a = access(part);
  if (!a) return c;
  const b = a.get(c);
  return a.set(c, { en: b?.en ?? "", hi: b?.hi ?? "", [lang]: text });
}

// The editor's names for the parts.
export function langPartName(part: string): string {
  const n = /(\d+)/.exec(part)?.[1];
  if (/^static \d+ term$/.test(part)) return `Static Connect ${n} (term)`;
  if (/^static \d+$/.test(part)) return `Static Connect ${n}`;
  if (/^did you know \d+$/.test(part)) return `Did you know ${n}`;
  if (/^mcq option \d+$/.test(part)) return `MCQ option ${"ABCDEFGH"[Number(n) - 1] ?? n}`;
  const fixed: Record<string, string> = {
    background: "Background",
    "mcq question": "MCQ question",
    "mcq explanation": "MCQ explanation",
    mains: "Mains question",
    "one-liner": "One-liner",
    "quick question": "Quick question",
    "quick answer": "Quick answer",
  };
  return fixed[part] ?? partName(part);
}

// Whether a story's printed text changed since SAATHI compared it.
export const langFingerprint = (c: CaContent) => hash(JSON.stringify(bilingualParts(c)));

// ---------- In one language only ----------

// Each part printed in one language only: half a story for the other readers.
export function missingNotes(story: Story): LangNote[] {
  if (!story.content) return [];
  return bilingualParts(story.content)
    .filter((p) => !p.en || !p.hi)
    .map((p) => ({
      id: noteId(story.id, p.part, "missing", p.en, p.hi),
      item_id: story.id,
      part: p.part,
      kind: "missing" as const,
      en: p.en,
      hi: p.hi,
      issue: p.en ? "No Hindi" : "No English",
      wrong: p.en ? ("hi" as const) : ("en" as const),
      fix: null,
    }));
}

// ---------- Numbers and dates ----------

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const MONTH_WORDS: [string, number][] = [
  ["january|jan|जनवरी", 1],
  ["february|feb|फ़रवरी|फरवरी", 2],
  ["march|mar|मार्च", 3],
  ["april|apr|अप्रैल|अप्रेल", 4],
  ["may|मई", 5],
  ["june|jun|जून", 6],
  ["july|jul|जुलाई", 7],
  ["august|aug|अगस्त", 8],
  ["september|sept|sep|सितंबर|सितम्बर", 9],
  ["october|oct|अक्टूबर|अक्तूबर", 10],
  ["november|nov|नवंबर|नवम्बर", 11],
  ["december|dec|दिसंबर|दिसम्बर", 12],
];
// A month only next to a number ("2 May", "May 2026"): "may" alone is a verb.
const MONTHS = MONTH_WORDS.map(
  ([names, n]) =>
    [
      new RegExp(
        `(?:\\d\\s*(?:${names})(?![\\p{L}\\p{M}]))|(?:(?<![\\p{L}\\p{M}])(?:${names})\\.?\\s*\\d)`,
        "iu",
      ),
      n,
    ] as const,
);
const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The numbers in a line (Devanagari digits read as digits, "1,200" as 1200,
// "05" as 5) and the months next to a number, as "m10".
export function numbersIn(text: string): Set<string> {
  const t = text
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d)/g, "$1");
  const out = new Set([...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => String(Number(m[0]))));
  for (const [re, n] of MONTHS) if (re.test(t)) out.add(`m${n}`);
  return out;
}

const show = (xs: string[]) =>
  xs.map((x) => (x.startsWith("m") ? MONTH_NAMES[Number(x.slice(1))] : x)).join(", ");

// A short hash (FNV-1a): a note's id from the texts it compared.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const noteId = (item_id: string, part: string, kind: string, en: string, hi: string) =>
  hash(JSON.stringify([item_id, part, kind, en, hi]));

type Story = {
  id: string;
  content: CaContent | null;
  facts?: { text: string; quote: string }[];
};

// Each part whose Hindi and English give different numbers or dates. For a
// point, its fact's source words tell which language is right, when they do.
export function numberNotes(story: Story): LangNote[] {
  const c = story.content;
  if (!c) return [];
  const out: LangNote[] = [];
  for (const { part, en, hi } of bilingualParts(c)) {
    if (!en || !hi) continue;
    const a = numbersIn(en);
    const b = numbersIn(hi);
    const onlyEn = [...a].filter((x) => !b.has(x));
    const onlyHi = [...b].filter((x) => !a.has(x));
    if (!onlyEn.length && !onlyHi.length) continue;
    const point = /^point (\d+)$/.exec(part);
    const fact = point ? story.facts?.[Number(point[1]) - 1] : undefined;
    const said = fact ? numbersIn(`${fact.text} ${fact.quote}`) : null;
    const fits = (xs: string[]) => !!said && xs.every((x) => said.has(x));
    const wrong =
      said && onlyEn.length && fits(onlyEn) && !fits(onlyHi)
        ? "hi"
        : said && onlyHi.length && fits(onlyHi) && !fits(onlyEn)
          ? "en"
          : null;
    out.push({
      id: noteId(story.id, part, "numbers", en, hi),
      item_id: story.id,
      part,
      kind: "numbers",
      en,
      hi,
      issue: [
        onlyEn.length ? `English has ${show(onlyEn)}` : "",
        onlyHi.length ? `Hindi has ${show(onlyHi)}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      wrong,
      fix: null,
      ...(fact?.quote ? { source: fact.quote.slice(0, 300) } : {}),
    });
  }
  return out;
}

// ---------- Names: SAATHI compares them ----------

// What one AI request compares, and the most notes it gives.
export const LANG_CHECK_STORIES = 30;
const LANG_NOTES_MAX = 40;

const ref = (n: number, part: string) => `S${n}.${part.replace(/[\s-]+/g, "")}`;
// The parts printed in both languages.
const pairs = (c: CaContent) =>
  bilingualParts(c)
    .filter((p) => p.en && p.hi)
    .map(({ part, en, hi }) => [part, { en, hi }] as [string, { en: string; hi: string }]);

export function langCheckMessages(stories: { content: CaContent }[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You compare the Hindi and English versions of a bilingual current affairs magazine for RAS exam aspirants before it is published. Each part of a story is given in English (en) and Hindi (hi), labelled like S2.point3 (story 2, point 3); both must say the same thing.
RULES: Report only clear differences in names (people, places, schemes, missions, organisations, acts, awards) and in what the facts say (a different subject, or a fact one language leaves out). Ignore numbers and dates (they are checked separately), word order, style, translation choices, and different spellings of the same name in Devanagari. For each difference say which language is wrong and give that language's whole line corrected, changing only what differs. At most ${LANG_NOTES_MAX} notes, the clearest first; an empty list is fine.
Reply with JSON only: {"notes": [{"ref": "S1.point2", "wrong": "hi", "issue": "Hindi names Jodhpur, English names Jaipur", "fix": "..."}]}`,
    },
    {
      role: "user",
      content: stories
        .map((s, i) =>
          pairs(s.content)
            .map(([part, v]) => `${ref(i + 1, part)}.en: ${v.en}\n${ref(i + 1, part)}.hi: ${v.hi}`)
            .join("\n"),
        )
        .join("\n\n"),
    },
  ];
}

// The notes SAATHI gave, matched to the stories' parts; null when unreadable.
export function parseLangNotes(
  raw: string,
  stories: { id: string; content: CaContent }[],
): LangNote[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { notes?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { notes?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.notes)) return null;
  const parts = new Map<string, { id: string; part: string; en: string; hi: string }>();
  stories.forEach((s, i) => {
    for (const [part, v] of pairs(s.content))
      parts.set(ref(i + 1, part).toLowerCase(), { id: s.id, part, ...v });
  });
  const clean = (v: unknown, n: number) =>
    typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
  const out: LangNote[] = [];
  const seen = new Set<string>();
  for (const n of o.notes as Record<string, unknown>[]) {
    const at = parts.get(clean(n?.ref, 40).replace(/\s+/g, "").toLowerCase());
    const issue = clean(n?.issue, 200);
    const wrong = n?.wrong === "en" || n?.wrong === "hi" ? n.wrong : null;
    const fix = clean(n?.fix, 400);
    if (!at || !issue) continue;
    const id = noteId(at.id, at.part, "names", at.en, at.hi);
    if (seen.has(id)) continue;
    seen.add(id);
    // A "fix" that changes nothing says the lines don't differ after all.
    if (wrong && fix && normalizeForMatch(fix) === normalizeForMatch(at[wrong])) continue;
    out.push({
      id,
      item_id: at.id,
      part: at.part,
      kind: "names",
      en: at.en,
      hi: at.hi,
      issue,
      wrong,
      fix: wrong && fix ? fix : null,
    });
  }
  return out.slice(0, LANG_NOTES_MAX);
}

// ---------- How the day stands ----------

// The notes still in the text (not waved through): missing parts, numbers
// and dates as they are now, and SAATHI's names notes whose texts haven't
// changed; whether SAATHI compared names, and the written stories it didn't
// compare as they are now. Null when nothing is written.
export type LangStatus = { checked: boolean; open: LangNote[]; unchecked: string[] };

export function langStatus(
  check: LangCheck | null,
  items: (Story & { status: string })[],
): LangStatus | null {
  const written = items.filter((i) => i.status === "included" && i.content);
  if (!written.length) return null;
  const dismissed = new Set(check?.dismissed ?? []);
  const byId = new Map(written.map((i) => [i.id, i]));
  const pairOf = (n: LangNote) => {
    const c = byId.get(n.item_id)?.content;
    return c ? pairs(c).find(([part]) => part === n.part)?.[1] : undefined;
  };
  const names = (check?.notes ?? []).filter((n) => {
    const now = pairOf(n);
    return now?.en === n.en && now?.hi === n.hi;
  });
  return {
    checked: !!check?.at,
    open: [...written.flatMap(missingNotes), ...written.flatMap(numberNotes), ...names].filter(
      (n) => !dismissed.has(n.id),
    ),
    unchecked: written
      .filter((i) => check?.stories[i.id] !== langFingerprint(i.content!))
      .map((i) => i.id),
  };
}

export const langPartLabel = (n: LangNote) => langPartName(n.part);

// ---------- SAATHI writing the other language ----------

// One line into the other language, in the magazine's style, for the editor
// to check before saving.
export function translateMessages(o: {
  part: string;
  text: string;
  to: "en" | "hi";
  headline: string;
}): ChatMessage[] {
  const to = o.to === "hi" ? "Hindi" : "English";
  return [
    {
      role: "system",
      content: `Translate this line of a bilingual current affairs magazine for RAS exam aspirants into ${to}. Keep every fact, number, date and official name; add nothing. ${
        o.to === "hi"
          ? "Write natural standard Hindi as used in Rajasthan competitive exams (मानक हिंदी), with the same numbers (in digits) and official names."
          : "Write plain, exam-style English with the same numbers and official names."
      } Keep its form: a headline stays a short headline, a point a short phrase, a question a question.
Reply with the ${to} line only.`,
    },
    {
      role: "user",
      content: `Story: ${o.headline}\nPart: ${langPartName(o.part)}\nLine: ${o.text}`,
    },
  ];
}

// The translation as one clean line; null when there is none.
export function parseTranslation(raw: string): string | null {
  const line = raw
    .replace(/^```\w*\s*|\s*```$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .slice(0, 500);
  return line.length >= 2 ? line : null;
}
