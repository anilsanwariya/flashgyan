// Adding facts to a written story without writing it again: the editor's new
// key-point highlights (from the story's sources or another paper read beside
// them) become extra points in Hindi and English, in the story's style, and
// the rest of the story stays as it is. Pure prompt and parsing.
import type { Bi } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// New points one request adds, and the most points a story has.
export const ADD_POINTS_MAX = 5;
export const STORY_POINTS_MAX = 12;

export function pointsMessages(opts: {
  headline: string;
  summary: string;
  points: string[];
  facts: { text: string; note?: string }[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write key points, in Hindi and English, for a current affairs magazine for RAS exam aspirants. Add key points to a written story, one for each new fact.
RULES: Use only the new fact's words: never add a number, name, date or claim that is not in it. Each point is a short phrase (at most 15 words) that starts with the key term or number, not a full explanatory sentence, and does not repeat what the story's summary or points already say. Follow an [Editor's note] on a fact. Hindi must be natural standard Hindi as used in Rajasthan competitive exams (मानक हिंदी), with the same numbers and official names.
Reply with JSON only: {"points": [{"en": "...", "hi": "..."}]} with exactly one point per new fact, in the same order.`,
    },
    {
      role: "user",
      content: `Story: ${opts.headline}
Summary: ${opts.summary}
Points it has:
${opts.points.map((p) => `- ${p}`).join("\n") || "(none)"}

New facts:
${opts.facts.map((f, i) => `${i + 1}. ${f.text}${f.note ? ` [Editor's note: ${f.note}]` : ""}`).join("\n")}`,
    },
  ];
}

// The new points, one per fact, or null when the reply doesn't give them all.
export function parsePoints(raw: string, count: number): Bi[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { points?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { points?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.points) || o.points.length < count) return null;
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const points = (o.points as Record<string, unknown>[]).slice(0, count).map((p) => ({
    en: clean(p?.en).slice(0, 300),
    hi: clean(p?.hi).slice(0, 300),
  }));
  return points.every((p) => p.en || p.hi) ? points : null;
}
