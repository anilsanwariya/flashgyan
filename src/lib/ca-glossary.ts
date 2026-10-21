// The editor's glossary: English terms and the Hindi SAATHI must always use
// for them (or the English kept as it is). Saved in Magazine settings; SAATHI
// can suggest entries from the Hindi the editor keeps correcting. Pure
// helpers, shared by the server, the admin panel and tests.
import { GLOSSARY_MAX, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

export { GLOSSARY_MAX, type GlossaryEntry };

// One Hindi line the editor changed, with the English of the same part.
export type HindiEdit = { en: string; before: string; after: string };
export type GlossarySuggestion = GlossaryEntry & { example: string };

// Fewer changed Hindi lines than this say little about a term.
export const GLOSSARY_MIN_EDITS = 3;
const EDITS_MAX = 40;

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// Trimmed, one entry per English term (the last one wins), kept terms with
// their Hindi equal to the English, at most GLOSSARY_MAX.
export function normalizeGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  const byTerm = new Map<string, GlossaryEntry>();
  for (const e of entries) {
    const en = clean(e.en, 80);
    const keep = !!e.keep;
    const hi = keep ? en : clean(e.hi, 120);
    if (!en || !hi) continue;
    byTerm.delete(en.toLowerCase());
    byTerm.set(en.toLowerCase(), keep ? { en, hi, keep } : { en, hi });
  }
  return [...byTerm.values()].slice(-GLOSSARY_MAX);
}

type ChatMessage = { role: "system" | "user"; content: string };

export function glossaryMessages(edits: HindiEdit[], glossary: GlossaryEntry[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You help keep the Hindi of a bilingual current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams) consistent. SAATHI drafts the Hindi; the editor corrects it. Below are SAATHI's Hindi lines, the editor's versions and the English of the same line. Find terms whose Hindi the editor changes in a consistent way: an English term the editor translates with a particular Hindi word, or keeps in English.
RULES: At most 10 entries, the clearest first. Each "en" is the English term as it appears in the English line (at most 5 words); "hi" is the Hindi the editor used; "keep" is true when the editor kept the English term in Hindi. Leave out one-off fixes of facts, names or numbers, and terms the glossary already has. Add one short example from the edits ("draft → edited"). Use an empty list when there is no clear pattern.
Reply with JSON only: {"terms": [{"en": "...", "hi": "...", "keep": false, "example": "..."}]}`,
    },
    {
      role: "user",
      content: `Glossary so far:\n${
        glossary.map((g) => `- ${g.en} → ${g.keep ? "(keep in English)" : g.hi}`).join("\n") ||
        "(none)"
      }\n\nEdits:\n${edits
        .slice(0, EDITS_MAX)
        .map(
          (e, i) =>
            `${i + 1}. English: ${e.en}\nDraft Hindi: ${e.before}\nEdited Hindi: ${e.after}`,
        )
        .join("\n\n")}`,
    },
  ];
}

// The suggested entries, without terms the glossary already has; null when
// the reply can't be read.
export function parseGlossary(raw: string, existing: GlossaryEntry[]): GlossarySuggestion[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { terms?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { terms?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.terms)) return null;
  const have = new Set(existing.map((g) => g.en.toLowerCase()));
  const out: GlossarySuggestion[] = [];
  for (const x of o.terms) {
    const r = (x ?? {}) as Record<string, unknown>;
    const en = clean(r.en, 80);
    const keep = r.keep === true;
    const hi = keep ? en : clean(r.hi, 120);
    if (!en || !hi || have.has(en.toLowerCase())) continue;
    have.add(en.toLowerCase());
    out.push({ en, hi, ...(keep ? { keep } : {}), example: clean(r.example, 200) });
    if (out.length >= 10) break;
  }
  return out;
}
