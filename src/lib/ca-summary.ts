// "Write another" for a story's summary: SAATHI writes three different
// summaries of the length the editor picks, from the story's own facts and
// background, and the editor chooses one. Pure helpers, shared by the
// server and tests.
import { numbersIn } from "@/lib/ca-bilingual";
import { clampSummaryWords, styleBlock, summaryRule, type Bi } from "@/lib/current-affairs";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

export const SUMMARY_OPTIONS = 3;
export const SUMMARY_LENGTHS = [40, 60, 80, 100] as const;

type ChatMessage = { role: "system" | "user"; content: string };

export function summaryOptionsMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  facts: string[];
  // Background the editor gave for the summary and Exam Angle only.
  context: string[];
  current: Bi;
  words: number;
  note?: string | null;
  // Summaries already offered and not wanted ("Try again").
  avoid?: Bi[];
  style?: string[];
}): ChatMessage[] {
  const words = clampSummaryWords(opts.words);
  const list = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join("\n");
  const avoid = (opts.avoid ?? []).map((b) => b.en || b.hi).filter(Boolean);
  return [
    {
      role: "system",
      content: `You write the summary of one news item in a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). The editor wants other summaries than the one the story has.
${summaryRule(words)}
Write ${SUMMARY_OPTIONS} summaries that differ from the current one and from each other in approach (for example: one opens with the news itself, one with the background or the problem it answers, one with what it means for Rajasthan or for students), all with the same facts.
RULES: Use only the numbered facts and the background given. Never add a number, name, date or claim that is not in them. Follow the editor's note when one is given.${styleBlock(opts.style)}${hindiGuide(opts.glossary)}
Reply with JSON only: {"summaries": [{"en": "...", "hi": "..."}, …]}`,
    },
    {
      role: "user",
      content: `Headline: ${opts.headline}\n\nFacts:\n${list(opts.facts) || "(none)"}${
        opts.context.length ? `\n\nBackground:\n${list(opts.context)}` : ""
      }\n\nCurrent summary: ${opts.current.en || opts.current.hi || "(none)"}${
        avoid.length ? `\n\nAlready offered (write different ones):\n${list(avoid)}` : ""
      }${opts.note?.trim() ? `\n\nEditor's note: ${opts.note.trim()}` : ""}\n\nLength: about ${words} words each.`,
    },
  ];
}

function parseJson(raw: string): Record<string, unknown> {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  for (const t of [text, /\{[\s\S]*\}/.exec(text)?.[0] ?? ""]) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") return v as Record<string, unknown>;
    } catch {
      // try the next form
    }
  }
  return {};
}

const clean = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 1500) : "";

// SAATHI's summaries, in both languages, keeping only those whose numbers
// all appear in the story's own text (facts, background, headline and the
// current summary); `dropped` counts the rest.
export function parseSummaryOptions(
  raw: string,
  known: string,
): { summaries: Bi[]; dropped: number } {
  const allowed = numbersIn(known);
  const o = parseJson(raw);
  const seen = new Set<string>();
  const summaries: Bi[] = [];
  let dropped = 0;
  for (const x of Array.isArray(o.summaries) ? o.summaries : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const en = clean(r.en);
    const hi = clean(r.hi);
    if (!en || !hi || seen.has(en.toLowerCase())) continue;
    const stray = [...numbersIn(`${en} ${hi}`)].filter((n) => !allowed.has(n));
    if (stray.length) {
      dropped++;
      continue;
    }
    seen.add(en.toLowerCase());
    summaries.push({ en, hi });
    if (summaries.length >= SUMMARY_OPTIONS) break;
  }
  return { summaries, dropped };
}

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
