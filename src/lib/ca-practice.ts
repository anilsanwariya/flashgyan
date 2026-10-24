// The monthly's exam-pattern practice set (25 questions in RPSC/RSSB styles:
// statements, match the following, assertion and reason, chronology, odd
// one out, direct) and "Month in One-liners" (short facts to revise), made
// from the month's stories; shared by the server and the admin page.
import type { Bi } from "@/lib/current-affairs";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

type ChatMessage = { role: "system" | "user"; content: string };

export const PRACTICE_STYLES = [
  "statements",
  "match",
  "assertion",
  "chronology",
  "odd",
  "direct",
] as const;
export type PracticeStyle = (typeof PRACTICE_STYLES)[number];

export const STYLE_LABEL: Record<PracticeStyle, string> = {
  statements: "Statements",
  match: "Match the following",
  assertion: "Assertion and reason",
  chronology: "Chronology",
  odd: "Odd one out",
  direct: "Direct",
};

export type PracticeQ = {
  style: PracticeStyle;
  question: Bi;
  // Statements, List I / List II, assertion and reason: one per line.
  extra: Bi;
  options: Bi[];
  // 0-3.
  answer: number;
  explanation: Bi;
  // The stories it is made from.
  items: string[];
  // Which part of the making it came from (0-2).
  part: number;
};
export type PracticeSet = { made_at: string; questions: PracticeQ[] };

export type OneLiner = { section: string; item: string; text: Bi };
export type OneLiners = { made_at: string; lines: OneLiner[] };

// 25 questions, made in three parts: the styles each part asks for.
export const PRACTICE_SIZE = 25;
export const PRACTICE_PARTS: Partial<Record<PracticeStyle, number>>[] = [
  { statements: 3, match: 2, assertion: 1, direct: 2, chronology: 1 },
  { statements: 3, match: 1, assertion: 1, direct: 2, odd: 1 },
  { statements: 2, match: 1, assertion: 1, direct: 2, chronology: 1, odd: 1 },
];
// Stories a part is made from, and one-liner stories per AI call.
export const PRACTICE_STORIES = 30;
export const ONELINER_BATCH = 25;
export const ONELINERS_PER_STORY = 3;

const STYLE_HOW: Record<PracticeStyle, string> = {
  statements: `"statements": "Consider the following statements about …" with 2 to 4 numbered statements in "extra" (one per line, "1. …"), some true and some false; options like "Only 1 and 2", "Only 2", "1, 2 and 3", "Only 3"`,
  match: `"match": "Match List I with List II" with 4 pairs in "extra" as lines "A. … – 1. …" (List I letters, List II numbers, the List II order shuffled); options are codes like "A-2, B-1, C-4, D-3"`,
  assertion: `"assertion": "Assertion (A): …" and "Reason (R): …" as two lines in "extra"; the four standard options (both true and R explains A; both true but R doesn't explain A; A true R false; A false R true)`,
  chronology: `"chronology": arrange 4 events of the month (or of a scheme's history in the facts) in order; the events as lines "1. …" in "extra"; options are orders like "2-1-4-3"`,
  odd: `"odd": which one of the four is not like the others (e.g. not a Rajasthan scheme, not in this month's index top 10), with the options themselves`,
  direct: `"direct": a single-fact question (who, where, which rank, how much) with four close options`,
};

const json = (raw: string): unknown => {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
};
const str = (v: unknown, max = 1200) =>
  typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "";
const bi = (v: unknown, max = 1200): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return { en: en || hi, hi: hi || en };
};

export type PracticeStory = {
  id: string;
  date: string;
  section: string;
  headline: string;
  facts: string[];
};

// One part of the practice set: these styles, from these stories, written
// the way the saved papers write them.
export function practiceMessages(
  stories: PracticeStory[],
  styles: Partial<Record<PracticeStyle, number>>,
  examples: { style: PracticeStyle; text: string }[],
  glossary?: GlossaryEntry[],
): ChatMessage[] {
  const wanted = Object.entries(styles).filter(([, n]) => n);
  return [
    {
      role: "system",
      content: `You set exam-pattern practice questions for a monthly current affairs magazine for Rajasthan competitive exams (RPSC RAS, RSSB Patwari, VDO, LDC and others), from the month's stories only.
Write exactly: ${wanted.map(([s, n]) => `${n} "${s}"`).join(", ")}.
How each style looks:
${wanted.map(([s]) => `- ${STYLE_HOW[s as PracticeStyle]}`).join("\n")}
Rules: every fact in a question, statement, option and answer comes from the stories' facts given (never from your own knowledge); a false statement or wrong option changes one real fact (a wrong number, place, year or name) so it is plausible; exactly one option is correct; mix the sections (Rajasthan, national, schemes, persons, sports…) and prefer Rajasthan news; no two questions on the same story; the explanation (1-2 sentences) says why the answer is right, with the fact. Write each in English and in Hindi; options and the answer are the same in both.${examples.length ? `\nThe papers write these styles like this (follow their wording, not their content):\n${examples.map((e) => `[${e.style}] ${e.text}`).join("\n")}` : ""}${hindiGuide(glossary)}
Reply with JSON only: [{"style": "...", "stories": [story numbers used], "question": {"en": "...", "hi": "..."}, "extra": {"en": "lines", "hi": "lines"}, "options": [{"en": "...", "hi": "..."} ×4], "answer": 1-4, "explanation": {"en": "...", "hi": "..."}}]`,
    },
    {
      role: "user",
      content: stories
        .map(
          (s, i) =>
            `${i + 1}. [${s.section}, ${s.date}] ${s.headline}\n${s.facts
              .slice(0, 8)
              .map((f) => `   - ${f}`)
              .join("\n")}`,
        )
        .join("\n"),
    },
  ];
}

export function parsePractice(raw: string, stories: { id: string }[], part: number): PracticeQ[] {
  const list = json(raw);
  const out: PracticeQ[] = [];
  const used = new Set<string>();
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const style = PRACTICE_STYLES.find((s) => s === o.style);
    const question = bi(o.question, 600);
    const options = (Array.isArray(o.options) ? o.options : []).map((v) => bi(v, 300));
    const answer = Number(o.answer) - 1;
    if (!style || !question.en || options.length !== 4 || options.some((v) => !v.en)) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    // The same option twice: no single right answer.
    if (new Set(options.map((v) => v.en.toLowerCase())).size < 4) continue;
    const items = (Array.isArray(o.stories) ? o.stories : [])
      .map((n) => stories[Number(n) - 1]?.id)
      .filter((id): id is string => !!id);
    // One question per story.
    if (items.some((id) => used.has(id))) continue;
    items.forEach((id) => used.add(id));
    out.push({
      style,
      question,
      extra: bi(o.extra, 1500),
      options,
      answer,
      explanation: bi(o.explanation, 600),
      items: [...new Set(items)],
      part,
    });
  }
  return out;
}

// One-liners for a batch of stories: up to three short facts each, the kind
// students revise the night before the exam.
export function onelinerMessages(
  stories: PracticeStory[],
  glossary?: GlossaryEntry[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write "Month in One-liners" for a monthly current affairs magazine for Rajasthan competitive exams: short revision lines, each one fact a student must remember (who, what, where, when, how much, which rank, which first).
For each story write 1 to ${ONELINERS_PER_STORY} one-liners (more for an important story, one for a small one), each at most 20 words, starting with the key term (e.g. "Henley Passport Index 2026 — India 80th; Singapore 1st"). Only the facts given; never add any from your own knowledge. No line repeats another. In English and in Hindi.${hindiGuide(glossary)}
Reply with JSON only: [{"story": story number, "lines": [{"en": "...", "hi": "..."}]}]`,
    },
    {
      role: "user",
      content: stories
        .map(
          (s, i) =>
            `${i + 1}. [${s.section}] ${s.headline}\n${s.facts
              .slice(0, 8)
              .map((f) => `   - ${f}`)
              .join("\n")}`,
        )
        .join("\n"),
    },
  ];
}

export function parseOneliners(raw: string, stories: PracticeStory[]): OneLiner[] {
  const list = json(raw);
  const out: OneLiner[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const s = stories[Number(o.story) - 1];
    if (!s) continue;
    const seen = new Set<string>();
    for (const l of (Array.isArray(o.lines) ? o.lines : []).slice(0, ONELINERS_PER_STORY)) {
      const text = bi(l, 300);
      const key = text.en.toLowerCase();
      if (!text.en || seen.has(key)) continue;
      seen.add(key);
      out.push({ section: s.section, item: s.id, text });
    }
  }
  return out;
}

// What a stored set or list looks like after an edit (bad entries dropped).
export function normalizePractice(v: unknown): PracticeSet | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.questions)) return null;
  const questions = o.questions
    .map((q) => {
      const x = (q ?? {}) as Record<string, unknown>;
      const style = PRACTICE_STYLES.find((s) => s === x.style);
      const options = (Array.isArray(x.options) ? x.options : []).map((v) => bi(v, 300));
      const answer = Number(x.answer);
      if (!style || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3)
        return null;
      return {
        style,
        question: bi(x.question, 600),
        extra: bi(x.extra, 1500),
        options,
        answer,
        explanation: bi(x.explanation, 600),
        items: (Array.isArray(x.items) ? x.items : []).filter(
          (i): i is string => typeof i === "string",
        ),
        part: Number(x.part) || 0,
      } satisfies PracticeQ;
    })
    .filter((q): q is PracticeQ => !!q && !!q.question.en);
  return { made_at: str(o.made_at, 40) || new Date().toISOString(), questions };
}

export function normalizeOneliners(v: unknown): OneLiners | null {
  const o = (v ?? null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.lines)) return null;
  const lines = o.lines
    .map((l) => {
      const x = (l ?? {}) as Record<string, unknown>;
      const text = bi(x.text, 300);
      return text.en
        ? { section: str(x.section, 40) || "misc", item: str(x.item, 60), text }
        : null;
    })
    .filter((l): l is OneLiner => !!l);
  return { made_at: str(o.made_at, 40) || new Date().toISOString(), lines };
}
