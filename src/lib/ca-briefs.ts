// News in brief (संक्षेप में): news worth one line, not a full story. The
// Editor-in-chief makes a picked story a brief by its type (an appointment,
// a day, a minor award, an MoU, a ranking, a sports result, an obituary, a
// routine announcement) unless it concerns Rajasthan or is very likely in
// exams; the editor can switch any story either way. A brief is written in
// one short AI call: a headline, one line in each language and one quick
// MCQ. Shared by the server, the pages and tests.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

export type StoryFormat = "story" | "brief";

// How many briefs a day takes at most (Magazine settings), apart from the
// day's full stories.
export const DEFAULT_DAILY_BRIEFS = 10;
export const MAX_DAILY_BRIEFS = 30;

// Story types that are usually worth one line.
export const BRIEF_TYPES = [
  "appointment",
  "day",
  "award",
  "agreement",
  "index",
  "sports",
  "book",
  "conference",
  "person",
] as const;

// A picked story starts as a brief when the AI says so (its picking rules
// and the editor's lessons included) or, when it didn't say, its type is one
// of these; never about Rajasthan or very likely in exams.
export function startsBrief(
  type: string | null | undefined,
  importance: number,
  rajasthan: boolean,
  aiBrief?: boolean,
) {
  if (rajasthan || importance >= 3) return false;
  if (typeof aiBrief === "boolean") return aiBrief;
  return !!type && (BRIEF_TYPES as readonly string[]).includes(type);
}

// A brief goes into the day while there is room for briefs (and it is
// likely enough in exams at all).
export function briefIncluded(importance: number, briefsSoFar: number, limit: number) {
  return importance >= 2 && briefsSoFar < limit;
}

type ChatMessage = { role: "system" | "user"; content: string };

export function briefMessages(opts: {
  headline: string;
  // The story's facts, or an article's text (an article from the skipped
  // news list).
  facts?: string[];
  article?: string;
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write the "News in brief" (संक्षेप में) section of a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams). A brief is ONE line (at most 30 words) that states the news with the exact fact an examiner would ask: who, what, where, the figure or the date. No background, no opinion, no filler. Use only what you are given.${hindiGuide(opts.glossary)}
Also write one quick MCQ on the line's key fact, in RPSC style: four options of the same kind, one correct, decidable from the line.
Reply with JSON only: {"headline": {"en": "...", "hi": "..."}, "line": {"en": "...", "hi": "..."}, "mcq": {"question": {"en": "...", "hi": "..."}, "options": [{"en": "...", "hi": "..."} x4], "answer": index 0-3, "explanation": {"en": "...", "hi": "..."}} or null}`,
    },
    {
      role: "user",
      content: `Headline: ${opts.headline}\n${
        opts.facts?.length
          ? `Facts:\n${opts.facts.map((f) => `- ${f}`).join("\n")}`
          : `Article:\n${(opts.article ?? "").slice(0, 4000)}`
      }`,
    },
  ];
}

type Bi = { en: string; hi: string };
export type ParsedBrief = {
  headline: Bi;
  line: Bi;
  mcq: { question: Bi; options: Bi[]; answer: number; explanation: Bi } | null;
};

const bi = (v: unknown): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = typeof o.en === "string" ? o.en.trim() : "";
  const hi = typeof o.hi === "string" ? o.hi.trim() : "";
  return en || hi ? { en: en.slice(0, 400), hi: hi.slice(0, 400) } : null;
};

export function parseBrief(raw: string): ParsedBrief | null {
  let o: Record<string, unknown> | null = null;
  try {
    const m = /\{[\s\S]*\}/.exec(raw);
    o = m ? JSON.parse(m[0]) : null;
  } catch {
    o = null;
  }
  if (!o) return null;
  const headline = bi(o.headline);
  const line = bi(o.line);
  if (!headline || !line) return null;
  const q = (o.mcq ?? null) as Record<string, unknown> | null;
  const options = Array.isArray(q?.options) ? (q!.options as unknown[]).map(bi) : [];
  const answer = Number(q?.answer);
  const question = bi(q?.question);
  const mcq =
    question && options.length === 4 && options.every(Boolean) && answer >= 0 && answer <= 3
      ? {
          question,
          options: options as Bi[],
          answer,
          explanation: bi(q?.explanation) ?? { en: "", hi: "" },
        }
      : null;
  return { headline, line, mcq };
}
