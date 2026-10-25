// The syllabus library: each exam stage's official syllabus as published
// (RAS Prelims, RAS Mains…), in Hindi and English line by line, its scheme
// of examination, and each line's subject section. Read from the PDFs a page
// at a time by the AI (the English page's text, the Hindi page as an image:
// old Hindi fonts like Kruti Dev don't copy out as Hindi). Pure helpers,
// shared by the server, the admin page and tests.
import { SUBJECT_SECTIONS, subjectSection } from "@/lib/exam-papers";

type ChatMessage = { role: "system" | "user"; content: string };

export const STAGES = [
  { id: "prelims", label: "Prelims" },
  { id: "mains", label: "Mains" },
  { id: "single", label: "Single stage" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];

export const NODE_KINDS = ["paper", "unit", "part", "heading", "subheading", "line"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const KIND_LABEL: Record<NodeKind, string> = {
  paper: "Paper",
  unit: "Unit",
  part: "Part",
  heading: "Heading",
  subheading: "Subheading",
  line: "Line",
};
// How far in a kind is shown (a line under whatever heads it).
export const KIND_DEPTH: Record<NodeKind, number> = {
  paper: 0,
  unit: 1,
  part: 2,
  heading: 2,
  subheading: 3,
  line: 4,
};

export type SchemeRow = {
  questions: number | null;
  marks_each: number | null;
  total: number | null;
  words: number | null;
};
export type SchemeUnit = { name: string; total: number | null; rows: SchemeRow[] };
export type SchemePaper = {
  name: string;
  marks: number | null;
  minutes: number | null;
  units: SchemeUnit[];
};
export type Scheme = { papers: SchemePaper[]; notes: string[] };

export type SyllabusExam = {
  id: string;
  name: string;
  body: string;
  stage: Stage;
  notified_on: string | null;
  scheme: Scheme | null;
  pages: number;
  pages_done: number;
  status: "draft" | "final";
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type SyllabusNode = {
  id: string;
  exam_id: string;
  position: number;
  kind: NodeKind;
  text_en: string;
  text_hi: string;
  section: string;
  marks: number | null;
  page: number | null;
};

export const examTitle = (e: Pick<SyllabusExam, "name" | "stage">) =>
  `${e.name}${e.stage === "single" ? "" : ` ${e.stage === "prelims" ? "Prelims" : "Mains"}`}`;

const str = (v: unknown, max = 2000) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

// ---------- Reading a page ----------

// Where the page before left off: the paper, unit, part and heading it was in.
export type ReadContext = { kind: NodeKind; en: string; hi: string }[];

export function contextOf(
  nodes: Pick<SyllabusNode, "kind" | "text_en" | "text_hi">[],
): ReadContext {
  const out: ReadContext = [];
  for (const n of nodes) {
    if (n.kind === "line") continue;
    const d = KIND_DEPTH[n.kind];
    while (out.length && KIND_DEPTH[out[out.length - 1].kind] >= d) out.pop();
    out.push({ kind: n.kind, en: n.text_en, hi: n.text_hi });
  }
  const last = nodes[nodes.length - 1];
  if (last?.kind === "line") out.push({ kind: "line", en: last.text_en, hi: last.text_hi });
  return out;
}

export function pageMessages(opts: {
  exam: string;
  page: number;
  pages: number;
  enText: string | null;
  hasEnImage: boolean;
  hasHiImage: boolean;
  context: ReadContext;
}): ChatMessage[] {
  const sources = [
    opts.enText !== null
      ? "the English syllabus page's text (below)"
      : opts.hasEnImage
        ? "the English syllabus page (the first image)"
        : null,
    opts.hasHiImage
      ? `the same page of the Hindi syllabus (${opts.hasEnImage ? "the second image" : "the image"})`
      : null,
  ].filter(Boolean);
  return [
    {
      role: "system",
      content: `You copy an official exam syllabus (Indian public service commissions: RPSC, RSSB, UPSC) into a structured list, line by line, exactly as published.
You get ${sources.join(" and ")}.
Rules:
- Every heading and every syllabus point in order, nothing left out, nothing added or reworded. Keep the official wording; only join a point that wraps onto several printed lines into one.
- "kind": "paper" (Paper-I, General Studies-II…), "unit" (Unit I…), "part" (Part A…), "heading" (a subject heading such as "Geography of Rajasthan"), "subheading" (a smaller heading such as "Ancient & Medieval Period:" or "World Geography:"), "line" (a syllabus point, usually a bullet). The exam's notes, instructions, tables of marks, signatures and page numbers are not part of the list.
- "en" and "hi": the item in English and in Hindi as printed on the two pages (pair each English item with its Hindi version; read Hindi in Unicode Devanagari). If a page in one language is missing, leave that language "".
- "marks": the marks printed with a paper, unit or part, else null.
- "section": for every item, which of these subject sections it belongs to: ${JSON.stringify(SUBJECT_SECTIONS.map((s) => s.en))}. History of Rajasthan's art, culture, literature, religion and society: "Rajasthan Art & Culture"; its political history: "Rajasthan History". Reasoning and mental ability: "Reasoning"; basic numeracy: "Mathematics". General science, health, everyday science: "General Science"; technology, computers, defence, space: "Science & Technology"; environment and ecology: "Environment & Ecology". Pick the closest; "Other" only if none fits.
- "cont": true only for the first item when it continues a point cut off at the end of the previous page (give just the rest of it).
Reply with JSON only: [{"kind": "...", "en": "...", "hi": "...", "marks": null, "section": "...", "cont": false}]`,
    },
    {
      role: "user",
      content: `Exam: ${opts.exam}\nPage ${opts.page} of ${opts.pages}.\n${
        opts.context.length
          ? `The previous page ended inside:\n${opts.context.map((c) => `- ${c.kind}: ${c.en || c.hi}`).join("\n")}`
          : "This is the first page."
      }${opts.enText !== null ? `\n\nEnglish page text:\n${opts.enText}` : ""}`,
    },
  ];
}

export type PageRow = {
  kind: NodeKind;
  en: string;
  hi: string;
  marks: number | null;
  section: string;
  cont: boolean;
};

export function parsePage(raw: string): PageRow[] {
  const list = parseJson<unknown>(raw.slice(Math.max(0, raw.indexOf("["))));
  const out: PageRow[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const en = str(o.en);
    const hi = str(o.hi);
    if (!en && !hi) continue;
    out.push({
      kind: NODE_KINDS.find((k) => k === o.kind) ?? "line",
      en,
      hi,
      marks: num(o.marks),
      section: subjectSection(o.section),
      cont: out.length === 0 && o.cont === true,
    });
  }
  return out;
}

// Joins the end of a point cut across pages.
export const joinCut = (a: string, b: string) =>
  !a ? b : !b ? a : /[-–]$/.test(a) ? `${a.replace(/[-–]$/, "")}${b}` : `${a} ${b}`;

// ---------- The scheme of examination ----------

export function schemeMessages(text: string, exam: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You read the scheme of examination of an Indian competitive exam (papers, marks, time, and for each unit the number of questions, marks per question and word limits).
Reply with JSON only: {"papers": [{"name": "Paper-I: General Studies-I", "marks": 200, "minutes": 180, "units": [{"name": "Unit-I", "total": 70, "rows": [{"questions": 8, "marks_each": 5, "total": 40, "words": 50}]}]}], "notes": ["other rules worth knowing, e.g. negative marking, answer in Hindi or English"]}. Use null for what isn't given.`,
    },
    { role: "user", content: `Exam: ${exam}\n\n${text.slice(0, 20000)}` },
  ];
}

export function normalizeScheme(v: unknown): Scheme | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.papers)) return null;
  const papers = o.papers.slice(0, 20).map((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    return {
      name: str(r.name, 200),
      marks: num(r.marks),
      minutes: num(r.minutes),
      units: (Array.isArray(r.units) ? r.units : []).slice(0, 20).map((u) => {
        const x = (u ?? {}) as Record<string, unknown>;
        return {
          name: str(x.name, 200),
          total: num(x.total),
          rows: (Array.isArray(x.rows) ? x.rows : []).slice(0, 20).map((w) => {
            const y = (w ?? {}) as Record<string, unknown>;
            return {
              questions: num(y.questions),
              marks_each: num(y.marks_each),
              total: num(y.total),
              words: num(y.words),
            };
          }),
        };
      }),
    };
  });
  const notes = (Array.isArray(o.notes) ? o.notes : [])
    .map((n) => str(n, 400))
    .filter(Boolean)
    .slice(0, 20);
  return papers.some((p) => p.name) || notes.length
    ? { papers: papers.filter((p) => p.name), notes }
    : null;
}

export const parseScheme = (raw: string) => normalizeScheme(parseJson(raw));

// A page's printed text worth sending as text (a scan, or an old Hindi font,
// has none worth reading).
export const readableText = (s: string, lang: "en" | "hi") =>
  lang === "en"
    ? (s.match(/[A-Za-z]/g)?.length ?? 0) >= 40
    : (s.match(/[ऀ-ॿ]/g)?.length ?? 0) >= 40;
