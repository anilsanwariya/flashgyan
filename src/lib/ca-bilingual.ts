// Hindi and English saying the same thing. Each part of a story (headline,
// summary, points, "why it matters") is printed in both languages, and a
// number, date or name that differs between them is a wrong fact for half the
// readers. Numbers and dates are compared here, as the editor works; names
// (and facts one language leaves out) need SAATHI, one AI request a day.
// Pure helpers, shared by the server, the admin panel and tests.
import { normalizeForMatch, type CaContent } from "@/lib/current-affairs";
import { partName, storyFingerprint, storyParts } from "@/lib/ca-style";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One part whose languages differ. `en`/`hi` are the texts compared; once
// either changes, the note is gone. `wrong`: the language to fix, when known
// (from the story's source, or SAATHI); `fix`: that language's line corrected.
export type LangNote = {
  id: string;
  item_id: string;
  part: string;
  kind: "numbers" | "names";
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
  const byPart = new Map<string, { en?: string; hi?: string }>();
  for (const p of storyParts(c)) byPart.set(p.part, { ...byPart.get(p.part), [p.lang]: p.text });
  const out: LangNote[] = [];
  for (const [part, { en, hi }] of byPart) {
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

const ref = (n: number, part: string) => `S${n}.${part.replace(" ", "")}`;
const pairs = (c: CaContent) => {
  const byPart = new Map<string, { en?: string; hi?: string }>();
  for (const p of storyParts(c)) byPart.set(p.part, { ...byPart.get(p.part), [p.lang]: p.text });
  return [...byPart].filter(([, v]) => v.en && v.hi) as [string, { en: string; hi: string }][];
};

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

// The notes still in the text (not waved through): numbers as they are now,
// and SAATHI's names notes whose texts haven't changed; whether SAATHI
// compared names, and the written stories it didn't compare as they are now.
// Null when nothing is written.
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
    open: [...written.flatMap(numberNotes), ...names].filter((n) => !dismissed.has(n.id)),
    unchecked: written
      .filter((i) => check?.stories[i.id] !== storyFingerprint(i.content!))
      .map((i) => i.id),
  };
}

export const langPartLabel = (n: LangNote) => partName(n.part);
