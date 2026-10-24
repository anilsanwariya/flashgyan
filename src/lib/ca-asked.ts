// "Asked before": past exam questions on a story's topic, printed under it,
// and the coverage meter (the month's stories per section against how often
// exams ask each section). Shared by the server and the admin pages.
import type { Bi } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user"; content: string };

// A past question linked to a story.
export type AskedQ = {
  id: string;
  exam: string;
  year: number | null;
  q_no: number;
  en: string;
  hi: string;
};

// At most this many under a story.
export const ASKED_SHOWN = 2;
// How close a question must be to a story to be checked by the AI.
export const ASKED_CLOSE = 0.6;
// Candidates per story, and stories per AI check.
export const ASKED_CANDIDATES = 4;
export const ASKED_BATCH = 10;

// A question's text for matching: the question, its other part and the
// correct answer (what a story would have to contain).
export function questionEmbedText(q: {
  question_en: string;
  question_hi: string;
  extra_en: string;
  extra_hi: string;
  options: { en: string; hi: string }[];
  correct: number | null;
}): string {
  const answer = q.correct ? q.options[q.correct - 1] : null;
  return [
    q.question_en || q.question_hi,
    q.extra_en || q.extra_hi,
    answer ? `Answer: ${answer.en || answer.hi}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

// "RAS Pre 2023": the exam's name, with its year when the name lacks it.
export function examLabel(q: Pick<AskedQ, "exam" | "year">): string {
  return q.year && !q.exam.includes(String(q.year)) ? `${q.exam} (${q.year})` : q.exam;
}

// The AI's check: which close questions really test the story's topic.
export function askedMessages(
  stories: {
    headline: string;
    facts: string[];
    questions: { n: number; text: string }[];
  }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You link a current affairs magazine's stories to past questions of Rajasthan competitive exams (RPSC, RSSB), so students see the topic was asked before. A question is linked to a story only when it asks about the same specific topic: the same scheme, policy, report or index, the same place, person, post, award, institution, event or law (an earlier edition or an earlier fact of it is fine). Not when it only shares a broad subject (two different schemes, two different awards).
Reply with JSON only: [{"story": story number, "questions": [question numbers that are linked]}] for the stories with a linked question; [] if none.`,
    },
    {
      role: "user",
      content: stories
        .map(
          (s, i) =>
            `Story ${i + 1}: ${s.headline}${s.facts.length ? ` — ${s.facts.slice(0, 4).join("; ")}` : ""}\nQuestions:\n${s.questions.map((q) => `  ${q.n}. ${q.text}`).join("\n")}`,
        )
        .join("\n\n"),
    },
  ];
}

export function parseAsked(raw: string, stories: { questions: { n: number }[] }[]): number[][] {
  const out: number[][] = stories.map(() => []);
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let list: unknown;
  try {
    list = JSON.parse(body.slice(body.indexOf("["), body.lastIndexOf("]") + 1));
  } catch {
    return out;
  }
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const i = Number(o.story) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= stories.length) continue;
    const allowed = new Set(stories[i].questions.map((q) => q.n));
    out[i] = [...new Set((Array.isArray(o.questions) ? o.questions : []).map(Number))].filter((n) =>
      allowed.has(n),
    );
  }
  return out;
}

// The line under a story: "Asked before: RAS Pre 2023 (Q 4): …".
export const ASKED_LABEL: Bi = { en: "Asked before", hi: "पहले पूछा गया" };

export function askedLine(q: AskedQ, lang: "en" | "hi"): string {
  const text = (lang === "hi" ? q.hi || q.en : q.en || q.hi).replace(/\s+/g, " ").trim();
  return `${examLabel(q)} (Q ${q.q_no}): ${text.length > 220 ? `${text.slice(0, 217)}…` : text}`;
}

// ---------- Coverage meter ----------

export type CoverageRow = {
  section: string;
  stories: number;
  // Share of the current affairs questions asked from this section.
  asked: number;
  share: number;
  // Stories this section would have at that share.
  expected: number;
  status: "low" | "ok" | "high";
};

// Fewer than this many sorted questions: the shares mean little yet.
export const COVERAGE_MIN_QUESTIONS = 20;

export function coverageRows(
  stories: Record<string, number>,
  asked: Record<string, number>,
): CoverageRow[] {
  const totalStories = Object.values(stories).reduce((a, b) => a + b, 0);
  const totalAsked = Object.values(asked).reduce((a, b) => a + b, 0);
  const sections = [...new Set([...Object.keys(stories), ...Object.keys(asked)])];
  return sections
    .map((section) => {
      const share = totalAsked ? (asked[section] ?? 0) / totalAsked : 0;
      const expected = Math.round(share * totalStories * 10) / 10;
      const have = stories[section] ?? 0;
      const status: CoverageRow["status"] =
        totalAsked < COVERAGE_MIN_QUESTIONS || expected < 1
          ? "ok"
          : have < expected * 0.6
            ? "low"
            : have > expected * 1.8 && have - expected >= 3
              ? "high"
              : "ok";
      return {
        section,
        stories: have,
        asked: asked[section] ?? 0,
        share: Math.round(share * 1000) / 10,
        expected,
        status,
      };
    })
    .sort((a, b) => b.share - a.share || b.stories - a.stories);
}
