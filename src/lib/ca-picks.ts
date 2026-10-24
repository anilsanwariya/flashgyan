// Learning from the editor's picks: what the AI first decided for a story
// (in or out, importance, section) is kept with it; the editor's changes to
// those decisions become picking rules SAATHI suggests, and the ones the
// editor adds go into how stories are picked from every source. Pure
// helpers, shared by the server, the admin page and tests.
import { normalizeForMatch } from "@/lib/current-affairs";
import { parseStyleRules, type StyleSuggestion } from "@/lib/ca-style";

type ChatMessage = { role: "system" | "user"; content: string };

// The AI's first decision, saved when the story is made. `capped`: it came
// in dropped only because the day was already full.
export type AiPick = {
  status: "included" | "dropped";
  importance: number;
  category: string;
  capped?: boolean;
};

export type PickChangeKind = "dropped" | "kept" | "importance" | "section";
export type PickChange = {
  kind: PickChangeKind;
  date: string;
  headline: string;
  type: string | null;
  rajasthan: boolean;
  facts: string[];
  ai: AiPick;
  editor: { status: string; importance: number; category: string };
};
export type PickCounts = Record<PickChangeKind, number> & { stories: number };

export const PICK_RULES_MAX = 10;
// Fewer changes than this say little about how the editor picks.
export const PICK_MIN_CHANGES = 5;
const PER_KIND = 12;

type Row = {
  issue_date: string;
  headline: string;
  story_type?: string | null;
  category: string;
  importance: number;
  status: string;
  rajasthan: boolean;
  facts: { text: string }[];
  ai_pick: AiPick | null;
};

// Where the editor's final decision differs from the AI's first one. A story
// dropped and back in counts once, as it ended.
export function pickChanges(rows: Row[]): { changes: PickChange[]; counts: PickCounts } {
  const changes: PickChange[] = [];
  let stories = 0;
  for (const r of rows) {
    const ai = r.ai_pick;
    if (!ai || r.category === "editorial" || ai.category === "editorial") continue;
    stories++;
    const base = {
      date: r.issue_date,
      headline: r.headline,
      type: r.story_type ?? null,
      rajasthan: r.rajasthan,
      facts: r.facts.slice(0, 4).map((f) => f.text),
      ai,
      editor: { status: r.status, importance: r.importance, category: r.category },
    };
    const inNow = r.status === "included";
    if (ai.status === "included" && r.status === "dropped")
      changes.push({ kind: "dropped", ...base });
    else if (ai.status === "dropped" && inNow) changes.push({ kind: "kept", ...base });
    if (inNow && ai.importance !== r.importance) changes.push({ kind: "importance", ...base });
    if (ai.category !== r.category) changes.push({ kind: "section", ...base });
  }
  const counts: PickCounts = { stories, dropped: 0, kept: 0, importance: 0, section: 0 };
  for (const c of changes) counts[c.kind]++;
  return { changes, counts };
}

const line = (c: PickChange) => {
  const what = `"${c.headline}" [${c.type ?? "story"}${c.rajasthan ? ", Rajasthan" : ""}] — ${c.facts.join("; ")}`;
  switch (c.kind) {
    case "dropped":
      return `${what}\n   AI kept it (importance ${c.ai.importance}); the editor dropped it.`;
    case "kept":
      return `${what}\n   AI left it out${c.ai.capped ? " (day already full)" : ""} at importance ${c.ai.importance}; the editor kept it at importance ${c.editor.importance}.`;
    case "importance":
      return `${what}\n   AI gave importance ${c.ai.importance}; the editor set ${c.editor.importance}.`;
    case "section":
      return `${what}\n   AI put it in "${c.ai.category}"; the editor moved it to "${c.editor.category}".`;
  }
};

const HEADS: Record<PickChangeKind, string> = {
  dropped: "Kept by the AI, dropped by the editor",
  kept: "Left out by the AI, kept by the editor",
  importance: "Importance changed",
  section: "Section changed",
};

export function pickMessages(changes: PickChange[], rules: string[]): ChatMessage[] {
  const groups = (Object.keys(HEADS) as PickChangeKind[])
    .map((k) => ({ k, list: changes.filter((c) => c.kind === k).slice(-PER_KIND) }))
    .filter((g) => g.list.length);
  return [
    {
      role: "system",
      content: `You help the AI editor of a current affairs magazine for Rajasthan competitive exams (RPSC and RSSB, with depth for RAS Mains) pick stories the way the human editor does. Below are stories where the editor changed the AI's decision: dropped a story the AI kept, kept one it left out, changed its importance (1 = rarely asked, 2 = may be asked, 3 = likely asked) or moved it to another section. Find the editor's consistent preferences and write them as picking rules the AI should follow when it reads a source.
RULES: At most 5 rules, the clearest first. Each is one specific instruction of at most 30 words, in English, naming the kind of news (story type, subject, level such as district or national) and what to do (leave out, keep, importance n, which section). Leave out one-off decisions and anything the existing rules already say. Add one short example from the changes for each rule. Fewer rules are better than vague ones; reply with an empty list when there is no clear pattern.
Reply with JSON only: {"rules": [{"rule": "...", "example": "..."}]}`,
    },
    {
      role: "user",
      content: `Existing picking rules:\n${rules.map((r) => `- ${r}`).join("\n") || "(none)"}\n\n${groups
        .map((g) => `${HEADS[g.k]}:\n${g.list.map((c, i) => `${i + 1}. ${line(c)}`).join("\n")}`)
        .join("\n\n")}`,
    },
  ];
}

export function parsePickRules(raw: string, existing: string[]): StyleSuggestion[] | null {
  return parseStyleRules(raw, existing);
}

// The rules as saved: one line each, no repeats, at most PICK_RULES_MAX.
export function cleanPickRules(rules: string[]): string[] {
  const seen = new Set<string>();
  return rules
    .map((r) => r.replace(/\s+/g, " ").trim().slice(0, 240))
    .filter((r) => {
      const k = normalizeForMatch(r);
      if (r.length < 3 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, PICK_RULES_MAX);
}
