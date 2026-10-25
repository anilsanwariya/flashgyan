// Master subject outlines: our own chapter > topic > subtopic tree for each
// subject section, made by the AI from every exam's official syllabus lines
// in that section (and editable), with each official line linked to the
// topics that cover it. One outline serves every exam; a topic knows which
// exams ask it from its lines. Pure helpers, shared by the server, the admin
// page and tests.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

type ChatMessage = { role: "system" | "user"; content: string };

export const LEVELS = ["chapter", "topic", "subtopic"] as const;
export type Level = (typeof LEVELS)[number];
export const childLevel = (l: Level): Level | null =>
  l === "chapter" ? "topic" : l === "topic" ? "subtopic" : null;

export type MasterTopic = {
  id: string;
  section: string;
  parent_id: string | null;
  level: Level;
  position: number;
  name_en: string;
  name_hi: string;
};

// An official line of a syllabus, with where it comes from.
export type OutlineLine = {
  id: string;
  exam: string; // "RAS Prelims"
  where: string; // "Paper-I › Unit I › Part A"
  text_en: string;
  text_hi: string;
  topics: string[]; // linked topic ids
};

const str = (v: unknown, max = 160) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

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

const lineList = (lines: OutlineLine[]) =>
  lines
    .map(
      (l, i) =>
        `L${i + 1} [${l.exam}${l.where ? ` · ${l.where}` : ""}] ${l.text_en}${l.text_hi && l.text_hi !== l.text_en ? ` | ${l.text_hi}` : ""}`,
    )
    .join("\n");

// ---------- Making the outline ----------

export function outlineMessages(
  section: string,
  lines: OutlineLine[],
  glossary?: GlossaryEntry[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan the master outline of a study-notes book for Rajasthan and Indian competitive exams (RPSC, RSSB, UPSC; Prelims and Mains) for one subject, from every exam's official syllabus lines for it. One book serves all these exams, so the outline must cover every line.
Make it the way the standard books on the subject (NCERT, state board, IGNOU, NIOS) divide it:
- "chapters" (4 to 16), in the order the subject is learnt, each with "topics" (2 to 14), each topic with "subtopics" (0 to 10) where the topic has clearly separate parts.
- Names short (at most 6 words), in English ("en") and in natural standard Hindi as used in RPSC exams ("hi").
- "lines": the numbers of the syllabus lines (L1, L2… given as 1, 2…) a topic or subtopic covers. Every line must be covered by at least one topic or subtopic; a line naming several things goes to each. Link a line at the most specific level that covers it.
- No topic outside the subject; no duplicate topics.${hindiGuide(glossary)}
Reply with JSON only: {"chapters": [{"en": "...", "hi": "...", "topics": [{"en": "...", "hi": "...", "lines": [1, 2], "subtopics": [{"en": "...", "hi": "...", "lines": [3]}]}]}]}`,
    },
    { role: "user", content: `Subject: ${section}\n\nSyllabus lines:\n${lineList(lines)}` },
  ];
}

export type PlannedTopic = { en: string; hi: string; lines: number[]; children: PlannedTopic[] };

const lineNums = (v: unknown, count: number) =>
  [
    ...new Set(
      (Array.isArray(v) ? v : [])
        .map((x) => Number(String(x).replace(/^L/i, "")))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= count),
    ),
  ] as number[];

// The outline from the AI's reply (line numbers 1-based), or null.
export function parseOutline(raw: string, count: number): PlannedTopic[] | null {
  const o = parseJson<{ chapters?: unknown }>(raw);
  if (!o || !Array.isArray(o.chapters)) return null;
  const node = (x: unknown, depth: number): PlannedTopic | null => {
    const r = (x ?? {}) as Record<string, unknown>;
    const en = str(r.en);
    const hi = str(r.hi);
    if (!en && !hi) return null;
    const kids = depth === 0 ? r.topics : depth === 1 ? r.subtopics : null;
    return {
      en: en || hi,
      hi: hi || en,
      lines: lineNums(r.lines, count),
      children: (Array.isArray(kids) ? kids : [])
        .slice(0, 20)
        .map((k) => node(k, depth + 1))
        .filter((k): k is PlannedTopic => !!k),
    };
  };
  const chapters = o.chapters
    .slice(0, 24)
    .map((c) => node(c, 0))
    .filter((c): c is PlannedTopic => !!c);
  return chapters.length ? chapters : null;
}

// ---------- Fitting new lines into an outline ----------

// The outline as numbered topics (T1…) for the AI.
export function outlineText(topics: MasterTopic[]): { text: string; ids: string[] } {
  const ids: string[] = [];
  const out: string[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of childrenOf(topics, parent)) {
      ids.push(t.id);
      out.push(`${"  ".repeat(depth)}T${ids.length} ${t.level}: ${t.name_en}`);
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return { text: out.join("\n"), ids };
}

export function fitMessages(
  section: string,
  outline: string,
  lines: OutlineLine[],
  glossary?: GlossaryEntry[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You keep the master outline of a study-notes book (one subject, for RPSC, RSSB and UPSC exams) up to date. New official syllabus lines have come in: link each to the outline's chapters, topics or subtopics (T numbers) that cover it, at the most specific level. Only when nothing covers a line, propose a new topic under the chapter where it belongs ("under": a chapter's T number, or null for a new chapter with "chapter" names), with short names in English and natural standard Hindi.${hindiGuide(glossary)}
Reply with JSON only: [{"line": 1, "topics": [3, 7], "new": null}] or for a new topic [{"line": 2, "topics": [], "new": {"under": 1, "en": "...", "hi": "...", "chapter": null}}]`,
    },
    {
      role: "user",
      content: `Subject: ${section}\n\nOutline:\n${outline}\n\nNew syllabus lines:\n${lineList(lines)}`,
    },
  ];
}

export type Fit = {
  line: number;
  topics: number[];
  fresh: {
    under: number | null;
    en: string;
    hi: string;
    chapter: { en: string; hi: string } | null;
  } | null;
};

export function parseFit(raw: string, lineCount: number, topicCount: number): Fit[] {
  const list = parseJson<unknown>(raw.slice(Math.max(0, raw.indexOf("["))));
  const out: Fit[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const line = Number(o.line);
    if (!Number.isInteger(line) || line < 1 || line > lineCount || out.some((f) => f.line === line))
      continue;
    const topics = lineNums(o.topics, topicCount);
    const n = (o.new ?? null) as Record<string, unknown> | null;
    let fresh: Fit["fresh"] = null;
    if (n && (str(n.en) || str(n.hi))) {
      const under = Number(n.under);
      const ch = (n.chapter ?? null) as Record<string, unknown> | null;
      fresh = {
        under: Number.isInteger(under) && under >= 1 && under <= topicCount ? under : null,
        en: str(n.en) || str(n.hi),
        hi: str(n.hi) || str(n.en),
        chapter:
          ch && (str(ch.en) || str(ch.hi))
            ? { en: str(ch.en) || str(ch.hi), hi: str(ch.hi) || str(ch.en) }
            : null,
      };
    }
    if (topics.length || fresh) out.push({ line, topics, fresh });
  }
  return out;
}

// ---------- The tree ----------

export const childrenOf = (topics: MasterTopic[], parent: string | null) =>
  topics
    .filter((t) => t.parent_id === parent)
    .sort((a, b) => a.position - b.position || a.name_en.localeCompare(b.name_en));

// A topic and everything under it.
export function subtree(topics: MasterTopic[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++)
    for (const t of topics) if (t.parent_id === out[i]) out.push(t.id);
  return out;
}

// The exams a topic is asked in: those of the lines linked to it or to
// anything under it, in a steady order.
export function topicExams(topics: MasterTopic[], lines: OutlineLine[], id: string): string[] {
  const ids = new Set(subtree(topics, id));
  return [
    ...new Set(lines.filter((l) => l.topics.some((t) => ids.has(t))).map((l) => l.exam)),
  ].sort();
}

// "1.2.3" numbers for the topics, in tree order.
export function numbering(topics: MasterTopic[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (parent: string | null, prefix: string) =>
    childrenOf(topics, parent).forEach((t, i) => {
      const n = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      out.set(t.id, n);
      walk(t.id, n);
    });
  walk(null, "");
  return out;
}

// ---------- Past questions on the outline ----------

// Questions linked per AI call.
export const QUESTION_LINK_BATCH = 20;

export function questionTopicMessages(
  section: string,
  outline: string,
  questions: { n: number; text: string }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You file previous-year exam questions (RPSC, RSSB, UPSC; objective and written) under the master outline of a study-notes book for one subject, so each topic shows the questions asked on it. For each question give the outline item (T number) it asks about, at the most specific level (a subtopic when one fits, else its topic, else the chapter); null only if nothing in the outline is about it.
Reply with JSON only: [{"n": question number, "topic": 12}]`,
    },
    {
      role: "user",
      content: `Subject: ${section}\n\nOutline:\n${outline}\n\nQuestions:\n${questions
        .map((q) => `Q${q.n}. ${q.text}`)
        .join("\n")}`,
    },
  ];
}

// The T number for each question (by its number), when given.
export function parseQuestionTopics(
  raw: string,
  nums: number[],
  topicCount: number,
): Map<number, number> {
  const list = parseJson<unknown>(raw.slice(Math.max(0, raw.indexOf("["))));
  const out = new Map<number, number>();
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = Number(String(o.n).replace(/^Q/i, ""));
    const t = Number(String(o.topic).replace(/^T/i, ""));
    if (nums.includes(n) && Number.isInteger(t) && t >= 1 && t <= topicCount) out.set(n, t);
  }
  return out;
}
