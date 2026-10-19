// "What's missing?" in the article reader: SAATHI picks the story's type from
// the exam blueprint, lists the facts an examiner asks for that the editor's
// highlights don't cover yet, and quotes where the article states each one,
// so it can be highlighted with one tap. Pure prompt and parsing.
import { STORY_TYPES, EDITORIAL_TYPE, storyType } from "@/lib/ca-blueprint";
import { findQuote } from "@/lib/ca-highlight";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type MissingFact = { slot: string; label: string; quote: string | null };
export type MissingCheck = { type: string; typeLabel: string; missing: MissingFact[] };

export const MISSING_MAX = 6;

const typesText = () =>
  [...STORY_TYPES, EDITORIAL_TYPE]
    .map((t) => `- ${t.id} (${t.label}): ${t.slots.map((s) => `${s.id}: ${s.label}`).join(" | ")}`)
    .join("\n");

export function missingMessages(opts: {
  headline: string;
  category: string;
  // The highlights, with the slot already known for the story's own facts.
  highlights: { quote: string; slot?: string }[];
  article: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You help the editor of a current affairs magazine for RAS (Rajasthan) exam aspirants. The editor highlighted facts in a news article for one story. Pick the story's type from the list, then name the facts of that type an RPSC examiner would ask about that the highlights do not cover yet, most exam-relevant first, at most ${MISSING_MAX}. For each, copy the exact words of the article that state it (5 to 30 words, character for character, in the article's language), or null when the article does not state it. Only facts about this story; never anything the highlights already say.
STORY TYPES and their facts, as "slot: what it holds":
${typesText()}
Reply with JSON only: {"type": type id, "missing": [{"slot": slot id, "quote": "..." or null}]}`,
    },
    {
      role: "user",
      content: `Story: ${opts.headline} (section: ${opts.category})
Highlighted facts:
${opts.highlights.map((h, i) => `${i + 1}. ${h.slot ? `[${h.slot}] ` : ""}${h.quote}`).join("\n") || "(none yet)"}

Article:
${opts.article}`,
    },
  ];
}

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// The check, keeping only slots of the type and quotes that really are in
// the source (the AI's words are verified like any fact).
export function parseMissing(
  raw: string,
  source: string,
  highlighted: string[],
): MissingCheck | null {
  const o = parseJson<{ type?: unknown; missing?: unknown }>(raw);
  if (!o) return null;
  const type = storyType(o.type);
  const slots = new Map(type.slots.map((s) => [s.id, s.label]));
  const taken = highlighted.map((q) => findQuote(source, q)).filter(Boolean) as [number, number][];
  const seen = new Set<string>();
  const missing: MissingFact[] = [];
  for (const x of Array.isArray(o.missing) ? o.missing : []) {
    const m = (x ?? {}) as Record<string, unknown>;
    const slot = String(m.slot ?? "")
      .trim()
      .toLowerCase()
      .replace(/\+$/, "");
    const label = slots.get(slot);
    if (!label || seen.has(slot)) continue;
    seen.add(slot);
    let quote = typeof m.quote === "string" ? m.quote.trim().slice(0, 600) : "";
    const at = quote ? findQuote(source, quote) : null;
    // Already highlighted: not missing at all.
    if (at && taken.some(([a, b]) => at[0] < b && at[1] > a)) continue;
    // Words that are not in the article are not offered.
    if (!at) quote = "";
    missing.push({ slot, label, quote: quote || null });
    if (missing.length >= MISSING_MAX) break;
  }
  return { type: type.id, typeLabel: type.label, missing };
}
