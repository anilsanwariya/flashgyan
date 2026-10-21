// "Suggest facts" in the article reader: SAATHI points out the words an
// examiner would ask about (numbers, dates, names, places, firsts) in the
// article being read. They show with a dotted outline; the editor taps the
// ones to keep. Every suggestion must be the article's own words. Pure
// helpers, shared by the server and tests.
import { findQuote } from "@/lib/ca-highlight";
import { normalizeForMatch } from "@/lib/current-affairs";

export const SUGGEST_MAX = 12;

type ChatMessage = { role: "system" | "user"; content: string };

export function suggestMarksMessages(opts: {
  headline: string;
  article: string;
  // Words already highlighted, so they aren't suggested again.
  marked: string[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You help the editor of a current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains) mark the facts in a news article that an examiner could ask about: numbers and amounts, dates, names of schemes, people, places and bodies, targets, firsts and ranks, and the provisions of a law or policy.
Pick up to ${SUGGEST_MAX} such facts from the article, the most exam-worthy first. For each, copy the article's words that state it, character for character, as short as the fact allows (4 to 30 words; a clause, not the whole paragraph). Leave out background, quotes of opinions, and anything already highlighted. Use an empty list when the article has no exam facts.
Reply with JSON only: {"facts": [{"quote": "...", "kind": "number|date|name|place|first|provision|other"}]}`,
    },
    {
      role: "user",
      content: `Story: ${opts.headline}\n\nAlready highlighted:\n${
        opts.marked.map((m) => `- ${m}`).join("\n") || "(none)"
      }\n\nArticle:\n${opts.article.slice(0, 16_000)}`,
    },
  ];
}

export type SuggestedMark = { quote: string; kind: string };

// SAATHI's suggestions that are the article's own words, not already marked,
// one of each, at most SUGGEST_MAX.
export function parseSuggestedMarks(
  raw: string,
  article: string,
  marked: string[],
): SuggestedMark[] {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let o: { facts?: unknown } = {};
  for (const t of [text, /\{[\s\S]*\}/.exec(text)?.[0] ?? ""]) {
    try {
      o = JSON.parse(t) as { facts?: unknown };
      break;
    } catch {
      // try the next form
    }
  }
  const taken = new Set(marked.map(normalizeForMatch));
  const out: SuggestedMark[] = [];
  for (const x of Array.isArray(o.facts) ? o.facts : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    const quote = typeof r.quote === "string" ? r.quote.replace(/\s+/g, " ").trim() : "";
    const key = normalizeForMatch(quote);
    if (key.length < 8 || quote.length > 400 || taken.has(key)) continue;
    // Inside words already highlighted: nothing new.
    if ([...taken].some((t) => t.includes(key))) continue;
    if (!findQuote(article, quote)) continue;
    taken.add(key);
    out.push({ quote, kind: typeof r.kind === "string" ? r.kind.slice(0, 20) : "other" });
    if (out.length >= SUGGEST_MAX) break;
  }
  return out;
}
