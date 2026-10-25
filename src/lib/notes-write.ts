// The notes writer: each topic of a notes book written by the AI from its
// knowledge base passages, in both languages, in the parts of the approved
// Layout A (Prelims: points, definitions, a table, an exam trap, one-liners;
// Mains: keywords, sections, data, official text, an answer plan and a
// practice question; a map when the topic needs one; "Did you know" facts).
// The editor adds images and visuals like a magazine story's, picks the past
// questions shown, and can have any one part written again. Every point cites the
// passages it came from; anything not from a passage is marked (◇) and must
// be checked or replaced before the topic is approved. Definitions are word
// for word from a passage. Pure helpers, shared by the server, the admin
// panel and tests.
import type { Bi, CaImage, ImageEdit, ImageLayout } from "@/lib/current-affairs";
import { cleanVisual, type Visual } from "@/lib/ca-visuals";
import {
  MAX_PLACES,
  normalizeMap,
  uncheckedPlaces,
  type MapPlace,
  type MapSpec,
} from "@/lib/map-spec";
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
export type NotePlace = MapPlace;
export type NoteMap = MapSpec;

// A story's visual slots (the magazine's editor works on them as they are):
// up to four visuals, the key points each one shows (left out of the text),
// and where each prints.
export type NoteVisualSlots = {
  visual?: Visual | null;
  visual_covers?: number[];
  visual2?: Visual | null;
  visual2_covers?: number[];
  visual3?: Visual | null;
  visual3_covers?: number[];
  visual4?: Visual | null;
  visual4_covers?: number[];
  visual_below?: boolean[];
  visual_beside?: boolean[];
  visual_pair?: boolean;
};

export type NoteContent = NoteVisualSlots & {
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
  dyk: NotePoint[];
  images: CaImage[];
  // The past questions printed (none chosen: the first that fits).
  pyq_ids: string[];
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
  dyk: [],
  images: [],
  pyq_ids: [],
};

export const WRITE_PASSAGES = 8;
export { MAX_PLACES };
export const MAX_NOTE_IMAGES = 8;
export const MAX_DYK = 4;
export const MAX_PYQS = 3;

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

const httpsUrl = (v: unknown) =>
  typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : "";
const LAYOUTS: ImageLayout[] = ["row", "own", "right", "left"];
const unit = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));

function cleanImage(v: unknown): CaImage | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const url = httpsUrl(o.url);
  const w = Number(o.w);
  const h = Number(o.h);
  if (!url || !(w > 0) || !(h > 0)) return null;
  const orig = (o.original ?? null) as Record<string, unknown> | null;
  const e = (o.edit ?? null) as Record<string, unknown> | null;
  const crop = (e?.crop ?? {}) as Record<string, unknown>;
  const credit = str(o.credit, 120);
  return {
    url,
    path: str(o.path, 300),
    w,
    h,
    ...(o.caption ? { caption: bi(o.caption, 300) } : {}),
    ...(credit ? { credit } : {}),
    ...(LAYOUTS.includes(o.layout as ImageLayout) ? { layout: o.layout as ImageLayout } : {}),
    ...(orig && httpsUrl(orig.url) && Number(orig.w) > 0 && Number(orig.h) > 0
      ? {
          original: {
            url: httpsUrl(orig.url),
            path: str(orig.path, 300),
            w: Number(orig.w),
            h: Number(orig.h),
          },
        }
      : {}),
    ...(e
      ? {
          edit: {
            rotate: ([0, 90, 180, 270].includes(Number(e.rotate))
              ? Number(e.rotate)
              : 0) as ImageEdit["rotate"],
            flip: e.flip === true,
            straighten: Math.max(-45, Math.min(45, Number(e.straighten) || 0)),
            crop: {
              x: unit(crop.x),
              y: unit(crop.y),
              w: unit(crop.w ?? 1) || 1,
              h: unit(crop.h ?? 1) || 1,
            },
          },
        }
      : {}),
  };
}

const SLOTS = [
  ["visual", "visual_covers"],
  ["visual2", "visual2_covers"],
  ["visual3", "visual3_covers"],
  ["visual4", "visual4_covers"],
] as const;

// The visuals, checked as the magazine checks them; `points` is the number
// of key points (a visual can stand in for some of them).
function visualSlots(o: Record<string, unknown>, points: number): NoteVisualSlots {
  const out: NoteVisualSlots = {};
  const below: boolean[] = [];
  const beside: boolean[] = [];
  SLOTS.forEach(([key, coversKey], i) => {
    const v = o[key] ? cleanVisual(o[key]).visual : null;
    out[key] = v;
    out[coversKey] = v
      ? [...new Set(list(o[coversKey]).map(Number))].filter(
          (x) => Number.isInteger(x) && x >= 0 && x < points,
        )
      : [];
    below.push(!!v && list(o.visual_below)[i] === true);
    beside.push(!!v && list(o.visual_beside)[i] === true);
  });
  out.visual_below = below;
  out.visual_beside = beside;
  out.visual_pair = o.visual_pair === true;
  return out;
}

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
  const points = list(o.points)
    .map((x) => point(x, count))
    .filter((p) => filled(p.text))
    .slice(0, 20);
  return {
    ...visualSlots(o, points.length),
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
    points,
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
    map: normalizeMap(o.map),
    dyk: list(o.dyk)
      .map((x) => point(x, count, 400))
      .filter((p) => filled(p.text))
      .slice(0, MAX_DYK),
    images: list(o.images)
      .map(cleanImage)
      .filter((x): x is CaImage => !!x)
      .slice(0, MAX_NOTE_IMAGES),
    pyq_ids: [
      ...new Set(
        list(o.pyq_ids).filter(
          (x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x),
        ),
      ),
    ].slice(0, MAX_PYQS),
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

// The lines written by the AI (no passage) that the editor hasn't checked,
// and the map's places the AI placed that aren't in the place list.
export function unchecked(c: NoteContent): number {
  const lines: { src: number[]; ok?: boolean; filled: boolean }[] = [
    { ...c.intro, filled: filled(c.intro.text) },
    ...c.points.map((p) => ({ ...p, filled: true })),
    ...c.sections.flatMap((s) => s.points.map((p) => ({ ...p, filled: true }))),
    ...c.definitions.map((d) => ({ src: d.src, filled: true })),
    ...c.data.map((d) => ({ ...d, filled: true })),
    ...c.official.map((d) => ({ ...d, filled: true })),
    ...c.dyk.map((d) => ({ ...d, filled: true })),
  ];
  return lines.filter((l) => l.filled && !l.src.length && !l.ok).length + uncheckedPlaces(c.map);
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
    ...c.dyk.flatMap((d) => d.src),
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
- "dyk": 1–2 "Did you know?" facts: surprising, memorable and exam-useful.
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
- "dyk": 0–2 "Did you know?" facts that make an answer stand out.
- Leave "trap" and "oneliners" empty; "points" may hold any other key facts.`,
};

const MAP_ASK = `{"region": "rajasthan" or "india", "rivers": true when rivers must show, "title": {"en","hi"}, "places": up to ${MAX_PLACES} places to mark (towns, dams, peaks, lakes, sanctuaries…), each {"en","hi","lat","lon"} with accurate coordinates}`;

const RULES = (section: string) =>
  `You write the study notes of "${section}" for Rajasthan's competitive exams (RPSC, RSSB), in English and Hindi together: the same content in both, Hindi in clear standard Devanagari as used in Rajasthan's exams.
Write ONLY from the passages given (our knowledge base of NCERT, NIOS, IGNOU and board books, official documents and Acts). After every item give "src": the numbers of the passages it comes from. If an important fact is not in any passage, you may add it with "src": [] only when you are sure of it; it will be checked by the editor. Never invent figures, dates or names.`;

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
      content: `${RULES(section)}
${STAGE[stage]}
- "map": when the topic needs a map, ${MAP_ASK}; else null.
Keep each item short. Do not repeat the same fact in two places.
${hindiGuide}
Reply with JSON only, in this shape:
{"intro": {"en": "", "hi": "", "src": [1]}, "definitions": [{"term": {"en": "", "hi": ""}, "text": {"en": "", "hi": ""}, "src": [2]}], "points": [{"en": "", "hi": "", "src": [1]}], "table": {"caption": {"en": "", "hi": ""}, "head": [{"en": "", "hi": ""}], "rows": [[{"en": "", "hi": ""}]], "src": [1]} or null, "trap": {"en": "", "hi": ""}, "oneliners": [{"q": {"en": "", "hi": ""}, "a": {"en": "", "hi": ""}}], "keywords": [{"en": "", "hi": ""}], "sections": [{"heading": {"en": "", "hi": ""}, "points": [{"en": "", "hi": "", "src": [1]}]}], "data": [{"en": "", "hi": "", "source": "", "src": [1]}], "official": [{"en": "", "hi": "", "source": "", "src": [1]}], "plan": [{"part": {"en": "", "hi": ""}, "words": 30}], "practice": {"en": "", "hi": ""}, "dyk": [{"en": "", "hi": "", "src": [1]}], "map": null}`,
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

// ---------- One part again ----------

// The parts the editor can have written again, what each is and its shape.
export const NOTE_PARTS = {
  intro: {
    label: "Opening",
    ask: "2–3 sentences placing the topic (Mains: context that can open an answer)",
    shape: '{"intro": {"en": "", "hi": "", "src": [1]}}',
  },
  definitions: {
    label: "Definitions",
    ask: "0–2 key terms, each quoted WORD FOR WORD from a passage (copy the sentence exactly), only when a passage defines the term",
    shape:
      '{"definitions": [{"term": {"en": "", "hi": ""}, "text": {"en": "", "hi": ""}, "src": [2]}]}',
  },
  points: {
    label: "Key points",
    ask: "6–12 key facts (names, places, dates, figures, lists), each one line, the key word in **bold**",
    shape: '{"points": [{"en": "", "hi": "", "src": [1]}]}',
  },
  sections: {
    label: "Sections",
    ask: "3–5 parts with a heading each (e.g. features, significance, problems, way forward), 2–5 points each, the key word in **bold**",
    shape:
      '{"sections": [{"heading": {"en": "", "hi": ""}, "points": [{"en": "", "hi": "", "src": [1]}]}]}',
  },
  table: {
    label: "Table",
    ask: "a small table of facts that compare well side by side (2–5 columns, up to 10 rows), or null",
    shape:
      '{"table": {"caption": {"en": "", "hi": ""}, "head": [{"en": "", "hi": ""}], "rows": [[{"en": "", "hi": ""}]], "src": [1]}}',
  },
  trap: {
    label: "Exam trap",
    ask: 'one fact students often confuse (two similar names, "longest" vs "longest wholly within"…)',
    shape: '{"trap": {"en": "", "hi": ""}}',
  },
  oneliners: {
    label: "Quick revision",
    ask: "3–6 quick-revision question/answer pairs, answers of a few words",
    shape: '{"oneliners": [{"q": {"en": "", "hi": ""}, "a": {"en": "", "hi": ""}}]}',
  },
  dyk: {
    label: "Did you know",
    ask: '1–3 "Did you know?" facts: surprising, memorable and exam-useful',
    shape: '{"dyk": [{"en": "", "hi": "", "src": [1]}]}',
  },
  keywords: {
    label: "Keywords",
    ask: "4–8 terms to use in answers",
    shape: '{"keywords": [{"en": "", "hi": ""}]}',
  },
  data: {
    label: "Data",
    ask: 'figures with their year and source (e.g. "Census 2011"), only from the passages',
    shape: '{"data": [{"en": "", "hi": "", "source": "", "src": [1]}]}',
  },
  official: {
    label: "Official text",
    ask: "text from the Constitution, an Act or a policy, with its source, only from the passages",
    shape: '{"official": [{"en": "", "hi": "", "source": "", "src": [1]}]}',
  },
  plan: {
    label: "Answer plan",
    ask: "how to split a 150-word answer on this topic across its parts (words per part)",
    shape: '{"plan": [{"part": {"en": "", "hi": ""}, "words": 30}]}',
  },
  practice: {
    label: "Practice question",
    ask: "one Mains-style question on the topic with marks and word limit",
    shape: '{"practice": {"en": "", "hi": ""}}',
  },
  map: {
    label: "Map",
    ask: `a map for the topic: ${MAP_ASK}`,
    shape:
      '{"map": {"region": "rajasthan", "rivers": false, "title": {"en": "", "hi": ""}, "places": [{"en": "", "hi": "", "lat": 0, "lon": 0}]}}',
  },
} as const;
export type NotePart = keyof typeof NOTE_PARTS;
export const NOTE_PART_KEYS = Object.keys(NOTE_PARTS) as NotePart[];

// One part written again, knowing the rest of the notes (not to repeat
// them), with the editor's note ("add the dams of the Chambal").
export function partMessages(
  section: string,
  topic: { number: string; path: string; name: Bi },
  part: NotePart,
  current: NoteContent,
  passages: NotePassage[],
  note: string,
  hindiGuide: string,
): ChatMessage[] {
  const info = NOTE_PARTS[part];
  const others = [
    ...current.points.map((p) => p.text.en || p.text.hi),
    ...current.sections.flatMap((x) => x.points.map((p) => p.text.en || p.text.hi)),
  ].filter(Boolean);
  return [
    {
      role: "system",
      content: `${RULES(section)}
Write again ONE part of a topic's notes, "${part}": ${info.ask}.
Keep each item short. Do not repeat what the rest of the notes already say.
${hindiGuide}
Reply with JSON only, in this shape: ${info.shape}`,
    },
    {
      role: "user",
      content: [
        `Topic ${topic.number}: ${topic.path}${topic.name.hi ? ` | ${topic.name.hi}` : ""}`,
        `The part now:\n${JSON.stringify((current as Record<string, unknown>)[part] ?? null)}`,
        part !== "points" && part !== "sections" && others.length
          ? `The notes' key points (for context):\n${others.map((x) => `- ${x}`).join("\n")}`
          : "",
        note.trim() ? `The editor's note: ${note.trim()}` : "",
        passages.length
          ? `Passages:\n${passages.map((p) => `[${p.k}] ${p.title}:\n${p.content}`).join("\n\n")}`
          : 'Passages: none. Write only what you are sure of, all with "src": [].',
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

// The part the AI wrote, cleaned as a whole note is; null when missing.
export function parsePart(
  raw: string,
  part: NotePart,
  current: NoteContent,
  passages: NotePassage[],
): Partial<NoteContent> | null {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || !(part in o)) return null;
  let c = normalizeContent({ ...current, [part]: o[part] }, passages.length);
  if (part === "definitions") c = checkDefinitions(c, passages);
  // New key points: the visuals no longer stand in for any of them.
  if (part === "points")
    return { points: c.points, ...Object.fromEntries(SLOTS.map(([, k]) => [k, []])) };
  return { [part]: c[part] } as Partial<NoteContent>;
}

// The notes as facts for a visual: the key points first (a visual made from
// them can stand in for them), then the sections' points and the data.
export function noteFacts(c: NoteContent): { text: string }[] {
  const t = (b: Bi) => (b.en || b.hi).replace(/\*\*/g, "");
  return [
    ...c.points.map((p) => ({ text: t(p.text) })),
    ...c.sections.flatMap((x) => x.points.map((p) => ({ text: t(p.text) }))),
    ...c.data.map((d) => ({ text: `${t(d.text)}${d.source ? ` (${d.source})` : ""}` })),
  ];
}
