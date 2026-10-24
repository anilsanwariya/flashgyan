// The monthly's topic index: every scheme, person, place, organisation,
// report, award, event and law in the month's stories, A to Z, with the
// numbers of the stories it is in. The terms are picked by the AI from the
// stories in batches; the same term from different stories becomes one
// entry. Shared by the server, the admin page and the renderer.
import type { Bi } from "@/lib/current-affairs";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

type ChatMessage = { role: "system" | "user"; content: string };

export const INDEX_KINDS = [
  "scheme",
  "person",
  "place",
  "organisation",
  "report",
  "award",
  "event",
  "law",
  "other",
] as const;
export type IndexKind = (typeof INDEX_KINDS)[number];

export type IndexEntry = { term: Bi; kind: IndexKind; items: string[] };
export type TopicIndex = { made_at: string; entries: IndexEntry[] };

// Stories per AI call, and terms per story.
export const INDEX_BATCH = 25;
export const TERMS_PER_STORY = 6;

export type IndexStory = { id: string; headline: string; facts: string[] };

export function indexMessages(stories: IndexStory[], glossary?: GlossaryEntry[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You make the A–Z index of a monthly current affairs magazine for Rajasthan competitive exams, so students can find every story on a scheme, person, place or report.
For each story list 2 to ${TERMS_PER_STORY} index terms: the proper names a student would look up — schemes, missions and campaigns; persons; places (districts, cities, countries, sites); organisations and institutions; reports and indices; awards; events (games, summits, festivals); acts and laws. Write each term in its standard full official form (e.g. "Mukhyamantri Jal Swavlamban Abhiyan", "Global Hunger Index", "Neeraj Chopra", "Bundi"), the same way every time it appears; a person without "Shri" or titles; no generic words ("Government", "India", "scheme", "Rajasthan" alone) and no dates or numbers. Only names in the story. In English and in Hindi.${hindiGuide(glossary)}
Reply with JSON only: [{"story": story number, "terms": [{"en": "...", "hi": "...", "kind": one of ${JSON.stringify(INDEX_KINDS)}}]}]`,
    },
    {
      role: "user",
      content: stories
        .map(
          (s, i) =>
            `${i + 1}. ${s.headline}\n${s.facts
              .slice(0, 8)
              .map((f) => `   - ${f}`)
              .join("\n")}`,
        )
        .join("\n"),
    },
  ];
}

const str = (v: unknown, max = 120) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
// Terms compared without case, dots or spacing ("U.N.E.S.C.O." = "UNESCO").
export const termKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
const GENERIC = new Set([
  "india",
  "rajasthan",
  "government",
  "scheme",
  "centre",
  "state",
  "भारत",
  "राजस्थान",
]);

export function parseIndex(raw: string, stories: { id: string }[]): IndexEntry[] {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let list: unknown;
  try {
    list = JSON.parse(body.slice(body.indexOf("["), body.lastIndexOf("]") + 1));
  } catch {
    return [];
  }
  const out: IndexEntry[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const s = stories[Number(o.story) - 1];
    if (!s) continue;
    for (const t of (Array.isArray(o.terms) ? o.terms : []).slice(0, TERMS_PER_STORY)) {
      const r = (t ?? {}) as Record<string, unknown>;
      const en = str(r.en);
      const hi = str(r.hi);
      const term = { en: en || hi, hi: hi || en };
      if (term.en.length < 2 || GENERIC.has(termKey(term.en)) || /^\d+$/.test(termKey(term.en)))
        continue;
      out.push({
        term,
        kind: INDEX_KINDS.find((k) => k === r.kind) ?? "other",
        items: [s.id],
      });
    }
  }
  return out;
}

// One entry per term, with all its stories (the first spelling kept).
export function mergeIndex(entries: IndexEntry[]): IndexEntry[] {
  const by = new Map<string, IndexEntry>();
  for (const e of entries) {
    const k = termKey(e.term.en);
    if (!k) continue;
    const had = by.get(k);
    if (had) had.items = [...new Set([...had.items, ...e.items])];
    else by.set(k, { term: { ...e.term }, kind: e.kind, items: [...new Set(e.items)] });
  }
  return [...by.values()];
}

export function normalizeIndex(v: unknown): TopicIndex | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.entries)) return null;
  const entries = o.entries
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const t = (r.term ?? {}) as Record<string, unknown>;
      const en = str(t.en);
      const hi = str(t.hi);
      return {
        term: { en: en || hi, hi: hi || en },
        kind: INDEX_KINDS.find((k) => k === r.kind) ?? ("other" as IndexKind),
        items: (Array.isArray(r.items) ? r.items : []).filter(
          (i): i is string => typeof i === "string",
        ),
      };
    })
    .filter((e) => e.term.en && e.items.length);
  return { made_at: str(o.made_at, 40) || new Date().toISOString(), entries: mergeIndex(entries) };
}

// The index as printed: each term with the numbers of its printed stories,
// sorted in the issue's language, under its first letter.
export function indexRows(
  index: TopicIndex | null | undefined,
  numberOf: Map<string, number>,
  lang: "en" | "hi",
): { letter: string; rows: { term: string; numbers: number[] }[] }[] {
  if (!index) return [];
  const rows = index.entries
    .map((e) => ({
      term: lang === "hi" ? e.term.hi || e.term.en : e.term.en,
      numbers: [
        ...new Set(e.items.map((i) => numberOf.get(i)).filter((n): n is number => !!n)),
      ].sort((a, b) => a - b),
    }))
    .filter((r) => r.term && r.numbers.length);
  // The same term twice once printed (two spellings in one language).
  const seen = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = r.term.toLowerCase();
    const had = seen.get(k);
    if (had) had.numbers = [...new Set([...had.numbers, ...r.numbers])].sort((a, b) => a - b);
    else seen.set(k, r);
  }
  const sorted = [...seen.values()].sort((a, b) =>
    a.term.localeCompare(b.term, lang === "hi" ? "hi" : "en", { sensitivity: "base" }),
  );
  const groups: { letter: string; rows: typeof sorted }[] = [];
  for (const r of sorted) {
    const first = [...r.term][0] ?? "";
    const letter = /\p{Script=Latin}/u.test(first)
      ? first.toUpperCase()
      : /\d/.test(first)
        ? "#"
        : first;
    const g = groups.at(-1);
    if (g && g.letter === letter) g.rows.push(r);
    else groups.push({ letter, rows: [r] });
  }
  return groups;
}
