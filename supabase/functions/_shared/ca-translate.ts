// Keeping a story's two languages the same: when the editor changes a line in
// one language, SAATHI writes it in the other, so every save leaves Hindi and
// English matching (the Hindi and English issues print one each). Several
// lines go in one request. Pure prompt and parsing, shared by the website and
// the bot.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One line to write in the other language; `label` names the part for SAATHI
// ("Headline", "Point 2"…).
export type SyncLine = { label: string; to: "en" | "hi"; text: string };

export const SYNC_LINES_MAX = 20;

export function syncMessages(headline: string, lines: SyncLine[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You keep a current affairs magazine for RAS exam aspirants the same in Hindi and English. The editor changed some lines in one language; write each of them in the other language.
RULES: Keep every fact, number (in digits), date and official name; add nothing and leave nothing out. Keep each line's form: a headline stays a short headline, a point a short phrase, a question a question. Hindi must be natural standard Hindi as used in Rajasthan competitive exams (मानक हिंदी); English plain exam-style English.
Reply with JSON only: {"lines": ["...", "..."]} with one line for each numbered line, in the same order.`,
    },
    {
      role: "user",
      content: `Story: ${headline}\n\n${lines
        .map(
          (l, i) => `${i + 1}. ${l.label}, into ${l.to === "hi" ? "Hindi" : "English"}: ${l.text}`,
        )
        .join("\n")}`,
    },
  ];
}

// The lines, one per line asked for; null when the reply doesn't give them all.
export function parseSync(raw: string, count: number): string[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { lines?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { lines?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.lines) || o.lines.length < count) return null;
  const lines = o.lines
    .slice(0, count)
    .map((l) => (typeof l === "string" ? l.replace(/\s+/g, " ").trim().slice(0, 500) : ""));
  return lines.every(Boolean) ? lines : null;
}
