// The notes writer: each topic of a notes book written by the AI from its
// knowledge base passages, in both languages, in the parts of the approved
// Layout A (Prelims: points, definitions, a table, an exam trap, one-liners;
// Mains: keywords, sections, data, official text, an answer plan and a
// practice question; a map when the topic needs one). Every point cites the
// passages it came from; anything not from a passage is marked (◇) and must
// be checked or replaced before the topic is approved. Definitions are word
// for word from a passage. Pure helpers, shared by the server, the admin
// panel and tests.
import type { Bi } from "@/lib/current-affairs";
import type { NotesStage } from "@/lib/notes-books";
import type { MapNeed } from "@/lib/notes-plan";

type ChatMessage = { role: "system" | "user"; content: string };

export type NotePassage = { k: number; title: string; subject: string; content: string };

// src: the passages it came from (none: written by the AI, ◇); ok: the
// editor checked an AI line and keeps it.
export type NotePoint = { text: Bi; src: number[]; ok?: boolean };
export type NoteSourced = { text: Bi; source: string; src: number[]; ok?: boolean };
export type NoteDefinition = { term: Bi; text: Bi; source: string; src: number[] };
export type NoteTable = { caption: Bi; head: Bi[]; rows: Bi[][]; src: number[] };
export type NotePlace = { name: Bi; lat: number; lon: number };
export type NoteMap = {
  region: "rajasthan" | "india";
  rivers: boolean;
  title: Bi;
  places: NotePlace[];
};

export type NoteContent = {
  intro: NotePoint;
  definitions: NoteDefinition[];
  points: NotePoint[];
  table: NoteTable | null;
  trap: Bi;
  oneliners: { q: Bi; a: Bi }[];
  keywords: Bi[];
  sections: { heading: Bi; points: NotePoint[] }[];
  data: NoteSourced[];
  official: NoteSourced[];
  plan: { part: Bi; words: number }[];
  practice: Bi;
  map: NoteMap | null;
};

export type DraftStatus = "draft" | "approved";

export const EMPTY_CONTENT: NoteContent = {
  intro: { text: { en: "", hi: "" }, src: [] },
  definitions: [],
  points: [],
  table: null,
  trap: { en: "", hi: "" },
  oneliners: [],
  keywords: [],
  sections: [],
  data: [],
  official: [],
  plan: [],
  practice: { en: "", hi: "" },
  map: null,
};

export const WRITE_PASSAGES = 8;
export const MAX_PLACES = 12;

// ---------- Cleaning ----------

const str = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const bi = (v: unknown, max = 600): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: str(o.en, max), hi: str(o.hi, max) };
};
const filled = (x: Bi) => !!(x.en || x.hi);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const srcs = (v: unknown, count: number): number[] =>
  [...new Set(list(v).map((n) => Number(String(n).replace(/\D/g, ""))))].filter(
    (n) => Number.isInteger(n) && n >= 1 && n <= count,
  );
const point = (v: unknown, count: number, max = 600): NotePoint => {
  const o = (v ?? {}) as Record<string, unknown>;
  // Either {text: {en, hi}} or {en, hi} with src beside.
  const text = o.text && typeof o.text === "object" ? bi(o.text, max) : bi(o, max);
  return { text, src: srcs(o.src, count), ...(o.ok === true ? { ok: true } : {}) };
};
const sourced = (v: unknown, count: number): NoteSourced => {
  const p = point(v, count, 500);
  const o = (v ?? {}) as Record<string, unknown>;
  return { ...p, source: str(o.source, 160) };
};

// What the AI wrote or the editor saved, cleaned. `count` is the number of
// passages (source numbers beyond it are dropped).
export function normalizeContent(v: unknown, count: number): NoteContent {
  const o = (v ?? {}) as Record<string, unknown>;
  const t = (o.table ?? null) as Record<string, unknown> | null;
  const head = t
    ? list(t.head)
        .map((h) => bi(h, 80))
        .slice(0, 5)
    : [];
  const m = (o.map ?? null) as Record<string, unknown> | null;
  const places = m
    ? list(m.places)
        .map((x) => {
          const p = (x ?? {}) as Record<string, unknown>;
          const name = p.name && typeof p.name === "object" ? bi(p.name, 60) : bi(p, 60);
          return { name, lat: Number(p.lat), lon: Number(p.lon) };
        })
        .filter((p) => filled(p.name) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .slice(0, MAX_PLACES)
    : [];
  return {
    intro: point(o.intro, count, 1200),
    definitions: list(o.definitions)
      .map((x) => {
        const d = (x ?? {}) as Record<string, unknown>;
        return {
          term: bi(d.term, 80),
          text: bi(d.text, 600),
          source: str(d.source, 160),
          src: srcs(d.src, count),
        };
      })
      .filter((d) => filled(d.term) && filled(d.text))
      .slice(0, 4),
    points: list(o.points)
      .map((x) => point(x, count))
      .filter((p) => filled(p.text))
      .slice(0, 20),
    table:
      t && head.length >= 2
        ? {
            caption: bi(t.caption, 120),
            head,
            rows: list(t.rows)
              .map((r) =>
                list(r)
                  .map((c) => bi(c, 160))
                  .slice(0, head.length),
              )
              .filter((r) => r.length === head.length && r.some(filled))
              .slice(0, 15),
            src: srcs(t.src, count),
          }
        : null,
    trap: bi(o.trap, 400),
    oneliners: list(o.oneliners)
      .map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        return { q: bi(r.q, 120), a: bi(r.a, 80) };
      })
      .filter((r) => filled(r.q) && filled(r.a))
      .slice(0, 6),
    keywords: list(o.keywords)
      .map((x) => bi(x, 60))
      .filter(filled)
      .slice(0, 8),
    sections: list(o.sections)
      .map((x) => {
        const s = (x ?? {}) as Record<string, unknown>;
        return {
          heading: bi(s.heading, 80),
          points: list(s.points)
            .map((p) => point(p, count))
            .filter((p) => filled(p.text))
            .slice(0, 10),
        };
      })
      .filter((s) => filled(s.heading) && s.points.length)
      .slice(0, 6),
    data: list(o.data)
      .map((x) => sourced(x, count))
      .filter((d) => filled(d.text))
      .slice(0, 6),
    official: list(o.official)
      .map((x) => sourced(x, count))
      .filter((d) => filled(d.text))
      .slice(0, 4),
    plan: list(o.plan)
      .map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        return {
          part: bi(r.part, 40),
          words: Math.max(5, Math.min(400, Math.round(Number(r.words) || 0))),
        };
      })
      .filter((r) => filled(r.part))
      .slice(0, 6),
    practice: bi(o.practice, 400),
    map:
      m && places.length
        ? {
            region: m.region === "india" ? "india" : "rajasthan",
            rivers: m.rivers === true,
            title: bi(m.title, 100),
            places,
          }
        : null,
  };
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’।.,;:()\-–—\s]+/g, " ")
    .trim();

// A definition is word for word from a passage: one that isn't found in the
// passage it cites loses its citation (the editor must check it).
export function checkDefinitions(c: NoteContent, passages: NotePassage[]): NoteContent {
  return {
    ...c,
    definitions: c.definitions.map((d) => {
      const found = d.src.filter((k) => {
        const p = passages.find((x) => x.k === k);
        if (!p) return false;
        const text = squash(p.content);
        return [d.text.en, d.text.hi].some((t) => t && text.includes(squash(t)));
      });
      const first = passages.find((p) => p.k === found[0]);
      return { ...d, src: found, source: d.source || (first ? first.title : "") };
    }),
  };
}

// The lines written by the AI (no passage) that the editor hasn't checked.
export function unchecked(c: NoteContent): number {
  const lines: { src: number[]; ok?: boolean; filled: boolean }[] = [
    { ...c.intro, filled: filled(c.intro.text) },
    ...c.points.map((p) => ({ ...p, filled: true })),
    ...c.sections.flatMap((s) => s.points.map((p) => ({ ...p, filled: true }))),
    ...c.definitions.map((d) => ({ src: d.src, filled: true })),
    ...c.data.map((d) => ({ ...d, filled: true })),
    ...c.official.map((d) => ({ ...d, filled: true })),
  ];
  return lines.filter((l) => l.filled && !l.src.length && !l.ok).length;
}

// The passages a topic's notes use (for the chapter's sources list).
export function usedSources(c: NoteContent, passages: NotePassage[]): string[] {
  const ks = new Set<number>([
    ...c.intro.src,
    ...c.points.flatMap((p) => p.src),
    ...c.sections.flatMap((s) => s.points.flatMap((p) => p.src)),
    ...c.definitions.flatMap((d) => d.src),
    ...(c.table?.src ?? []),
    ...c.data.flatMap((d) => d.src),
    ...c.official.flatMap((d) => d.src),
  ]);
  return [...new Set(passages.filter((p) => ks.has(p.k)).map((p) => p.title))];
}

// ---------- The AI ----------

const STAGE: Record<NotesStage, string> = {
  prelims: `This is the PRELIMS book: precise, factual, easy to revise. Write:
- "intro": 2–3 sentences placing the topic.
- "definitions": 0–2 key terms, each quoted WORD FOR WORD from a passage (copy the sentence exactly; give its passage number), only when a passage defines the term.
- "points": 6–12 key facts (names, places, dates, figures, lists), each one line, with the key word in **bold**.
- "table": when facts compare well side by side (dams, places, years…), a small table; else null.
- "trap": one fact students often confuse (e.g. two similar names or "longest" vs "longest wholly within").
- "oneliners": 3 quick-revision question/answer pairs.
- Leave "keywords", "sections", "data", "official", "plan" and "practice" empty.`,
  mains: `This is the MAINS book: analytical, answer-ready. Write:
- "intro": 2–3 sentences of context that can open an answer.
- "definitions": 0–2 key terms, each quoted WORD FOR WORD from a passage (copy the sentence exactly; give its passage number), only when a passage defines the term.
- "keywords": 4–6 terms to use in answers.
- "sections": 3–5 parts with a heading each, as the topic needs (e.g. features, significance or impact, problems, way forward), 2–5 points each, the key word in **bold**.
- "data": figures with their year and source (e.g. "Census 2011"), only from the passages.
- "official": text from the Constitution, an Act or a policy, with its source, only from the passages.
- "plan": how to split a 150-word answer on this topic across its parts (words per part).
- "practice": one Mains-style question on the topic with marks and word limit.
- Leave "trap" and "oneliners" empty; "points" may hold any other key facts.`,
};

export function writeMessages(
  stage: NotesStage,
  section: string,
  topic: {
    number: string;
    path: string;
    name: Bi;
    lines: string[];
    questions: string[];
    map: MapNeed | null;
  },
  passages: NotePassage[],
  hindiGuide: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write the study notes of "${section}" for Rajasthan's competitive exams (RPSC, RSSB), in English and Hindi together: the same content in both, Hindi in clear standard Devanagari as used in Rajasthan's exams.
Write ONLY from the passages given (our knowledge base of NCERT, NIOS, IGNOU and board books, official documents and Acts). After every item give "src": the numbers of the passages it comes from. If an important fact is not in any passage, you may add it with "src": [] only when you are sure of it; it will be checked by the editor. Never invent figures, dates or names.
${STAGE[stage]}
- "map": when the topic needs a map, {"region": "rajasthan" or "india", "rivers": true when rivers must show, "title": {"en","hi"}, "places": up to ${MAX_PLACES} places to mark (towns, dams, peaks, lakes, sanctuaries…), each {"en","hi","lat","lon"} with accurate coordinates}; else null.
Keep each item short. Do not repeat the same fact in two places.
${hindiGuide}
Reply with JSON only, in this shape:
{"intro": {"en": "", "hi": "", "src": [1]}, "definitions": [{"term": {"en": "", "hi": ""}, "text": {"en": "", "hi": ""}, "src": [2]}], "points": [{"en": "", "hi": "", "src": [1]}], "table": {"caption": {"en": "", "hi": ""}, "head": [{"en": "", "hi": ""}], "rows": [[{"en": "", "hi": ""}]], "src": [1]} or null, "trap": {"en": "", "hi": ""}, "oneliners": [{"q": {"en": "", "hi": ""}, "a": {"en": "", "hi": ""}}], "keywords": [{"en": "", "hi": ""}], "sections": [{"heading": {"en": "", "hi": ""}, "points": [{"en": "", "hi": "", "src": [1]}]}], "data": [{"en": "", "hi": "", "source": "", "src": [1]}], "official": [{"en": "", "hi": "", "source": "", "src": [1]}], "plan": [{"part": {"en": "", "hi": ""}, "words": 30}], "practice": {"en": "", "hi": ""}, "map": null}`,
    },
    {
      role: "user",
      content: [
        `Topic ${topic.number}: ${topic.path}${topic.name.hi ? ` | ${topic.name.hi}` : ""}`,
        topic.lines.length ? `Syllabus lines: ${topic.lines.join(" | ")}` : "",
        topic.questions.length
          ? `Asked in past papers:\n${topic.questions.map((q) => `- ${q}`).join("\n")}`
          : "",
        topic.map
          ? `The planner says this topic needs a map (${topic.map.kind}): ${topic.map.what}.`
          : "",
        passages.length
          ? `Passages:\n${passages.map((p) => `[${p.k}] ${p.title}:\n${p.content}`).join("\n\n")}`
          : 'Passages: none were found. Write only what you are sure of, all with "src": [].',
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    try {
      return JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) as T;
    } catch {
      return null;
    }
  }
}

// The AI's notes, cleaned; null when they can't be read or say nothing.
export function parseNotes(raw: string, passages: NotePassage[]): NoteContent | null {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o) return null;
  const c = checkDefinitions(normalizeContent(o, passages.length), passages);
  return filled(c.intro.text) || c.points.length || c.sections.length ? c : null;
}
