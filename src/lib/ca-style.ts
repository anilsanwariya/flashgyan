// House style: what the editor changes in SAATHI's drafts, turned into a few
// writing rules. Each week (or on request) the edits are compared with the
// drafts and SAATHI suggests rules; the ones the editor approves go into the
// writing instructions of every story. Pure helpers, shared by the server and
// tests.
import { normalizeForMatch, type Bi, type CaContent } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// One change: which part, SAATHI's draft and the editor's version.
export type EditPair = { part: string; before: string; after: string };
export type StyleSuggestion = { rule: string; example: string };

export const STYLE_RULES_MAX = 10;
// Fewer changes than this say little about a style.
export const STYLE_MIN_EDITS = 3;
const PAIRS_MAX = 40;

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 299)}…` : s);

// The parts of a story the editor changed, in both languages.
export function editPairs(before: CaContent, after: CaContent): EditPair[] {
  const out: EditPair[] = [];
  const add = (part: string, a: Bi | null | undefined, b: Bi | null | undefined) => {
    for (const lang of ["en", "hi"] as const) {
      const x = a?.[lang]?.trim() ?? "";
      const y = b?.[lang]?.trim() ?? "";
      if (x && y && normalizeForMatch(x) !== normalizeForMatch(y)) {
        out.push({
          part: `${part} (${lang === "en" ? "English" : "Hindi"})`,
          before: clip(x),
          after: clip(y),
        });
      }
    }
  };
  add("headline", before.headline, after.headline);
  add("summary", before.summary, after.summary);
  before.points.forEach((p, i) => add(`point ${i + 1}`, p, after.points[i]));
  add("why it matters", before.why, after.why);
  return out;
}

export function styleMessages(pairs: EditPair[], rules: string[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You help keep a current affairs magazine's house style. The magazine (Hindi and English, for RAS exam aspirants) is drafted by SAATHI and corrected by the editor. Below are SAATHI's drafts and the editor's versions. Find the editor's consistent preferences in wording, length, structure, word choice and Hindi usage, and write them as rules SAATHI should follow from now on.
RULES: At most 5 rules, most common first. Each is one specific instruction of at most 25 words, in English, that SAATHI can follow without seeing these edits. Leave out one-off fact fixes (a wrong number, name or date corrected) and anything the existing rules already say. Add one short example from the edits for each rule ("draft → edited"). Fewer rules are better than vague ones; reply with an empty list when there is no clear pattern.
Reply with JSON only: {"rules": [{"rule": "...", "example": "..."}]}`,
    },
    {
      role: "user",
      content: `Existing rules:\n${rules.map((r) => `- ${r}`).join("\n") || "(none)"}\n\nEdits:\n${pairs
        .slice(0, PAIRS_MAX)
        .map((p, i) => `${i + 1}. ${p.part}\nDraft: ${p.before}\nEdited: ${p.after}`)
        .join("\n\n")}`,
    },
  ];
}

// The suggested rules, without ones already kept; null when unreadable.
export function parseStyleRules(raw: string, existing: string[]): StyleSuggestion[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { rules?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { rules?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.rules)) return null;
  const have = new Set(existing.map(normalizeForMatch));
  const out: StyleSuggestion[] = [];
  for (const r of o.rules as Record<string, unknown>[]) {
    const rule =
      typeof r?.rule === "string" ? r.rule.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const example =
      typeof r?.example === "string" ? r.example.replace(/\s+/g, " ").trim().slice(0, 240) : "";
    const key = normalizeForMatch(rule);
    if (rule.length < 8 || have.has(key)) continue;
    have.add(key);
    out.push({ rule, example });
  }
  return out.slice(0, 5);
}
