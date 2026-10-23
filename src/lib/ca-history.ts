// History lines under a story: a report's or index's earlier editions
// ("Over the years: India 85th (2025) → 80th (2026)") and an appointment's
// predecessors ("On this post before: …"), from the story's own facts and
// the magazine's earlier stories on the same report or post.
import type { Bi } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user"; content: string };

export type HistoryKind = "report" | "post";
export type StoryHistory = { kind: HistoryKind; en: string; hi: string; from: string[] };

// The story types that get one.
export function historyKind(type: string | null | undefined): HistoryKind | null {
  return type === "index" ? "report" : type === "appointment" ? "post" : null;
}

export const HISTORY_LABEL: Record<HistoryKind, Bi> = {
  report: { en: "Over the years", hi: "वर्षवार" },
  post: { en: "On this post before", hi: "इस पद पर पूर्व में" },
};

// Earlier stories looked at, and how far back.
export const HISTORY_CANDIDATES = 6;
export const HISTORY_YEARS = 6;
export const HISTORY_CLOSE = 0.7;

export function historyMessages(
  kind: HistoryKind,
  story: { date: string; headline: string; facts: string[] },
  earlier: { date: string; headline: string; facts: string[] }[],
): ChatMessage[] {
  const what =
    kind === "report"
      ? `a report, index, ranking or survey. Write the line "Over the years": India's (and Rajasthan's, when given) rank, score or category in this and earlier editions, oldest first, each with its year, e.g. "India: 85th (2025) → 80th of 199 (2026); Rajasthan: 12th → 9th". Use only editions of the same report or index.`
      : `an appointment. Write the line "On this post before": who held this same post before, newest first, with their number in the series and years when given, e.g. "Justice D.Y. Chandrachud (50th CJI, 2022–24), Justice U.U. Lalit (49th, 2022)"; add whom the new holder replaces if that's all that is known. Use only the same post (the same office of the same body).`;
  return [
    {
      role: "system",
      content: `You add a short history line to a current affairs magazine story about ${what}
Use only the story's facts and the earlier stories given below: never add a rank, year, name or number from your own knowledge. Earlier stories about something else are left out. If the facts give nothing earlier (no earlier edition, rank or holder), the line is empty.
Write it in English and in Hindi (simple standard Hindi, names and numbers kept), at most 40 words each.
Reply with JSON only: {"same": [numbers of the earlier stories used], "en": "...", "hi": "..."}`,
    },
    {
      role: "user",
      content: `Story (${story.date}): ${story.headline}\n${story.facts.map((f) => `- ${f}`).join("\n")}\n\nEarlier stories:\n${
        earlier.length
          ? earlier
              .map(
                (e, i) =>
                  `${i + 1}. (${e.date}) ${e.headline}\n${e.facts
                    .slice(0, 6)
                    .map((f) => `   - ${f}`)
                    .join("\n")}`,
              )
              .join("\n")
          : "(none)"
      }`,
    },
  ];
}

export function parseHistory(
  raw: string,
  kind: HistoryKind,
  earlierIds: string[],
): StoryHistory | null {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const str = (v: unknown) =>
    typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  const en = str(o.en);
  const hi = str(o.hi);
  if (!en && !hi) return null;
  const from = (Array.isArray(o.same) ? o.same : [])
    .map((n) => earlierIds[Number(n) - 1])
    .filter((x): x is string => !!x);
  return { kind, en: en || hi, hi: hi || en, from: [...new Set(from)] };
}
