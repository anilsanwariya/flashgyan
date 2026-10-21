// Extra material for one story: a link, PDF, image, Word or text file the
// editor adds when the day's sources leave something out. SAATHI picks what
// the story lacks from it, for one place in the story: new facts (key
// points), Static Context, or background for the summary and Exam Angle.
// Everything it picks must be quoted from the material word for word; the
// editor sees the list and chooses what goes in. Pure helpers, shared by the
// server, the admin panel and tests.
import { quoteInSource, type Bi } from "@/lib/current-affairs";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";

export type MaterialTarget = "facts" | "static" | "context";

export const MATERIAL_TARGETS: { id: MaterialTarget; label: string; hint: string }[] = [
  {
    id: "facts",
    label: "New facts",
    hint: "Exam facts the story lacks become key points; the story is rewritten with them",
  },
  {
    id: "static",
    label: "Static Context",
    hint: "Textbook background on the concepts behind the news",
  },
  {
    id: "context",
    label: "Background",
    hint: "Information that helps explain the news: used in the summary and Exam Angle, not as points",
  },
];

// What SAATHI found: the fact (in the material's language, as short as a
// key point) and the material's words for it.
export type MaterialFact = { text: string; quote: string };
export type MaterialStatic = { keyword: Bi; text: Bi; quote: string };
export type MaterialFind = { facts: MaterialFact[]; statics: MaterialStatic[] };

// The material sent to SAATHI is cut at this length.
export const MATERIAL_MAX_CHARS = 60_000;
const MAX_FACTS = 8;
const MAX_STATICS = 4;

type ChatMessage = { role: "system" | "user"; content: string };

export function materialMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  facts: string[];
  material: string;
  title: string;
  target: MaterialTarget;
  note?: string | null;
}): ChatMessage[] {
  const ask: Record<MaterialTarget, string> = {
    facts: `Pick up to ${MAX_FACTS} facts about THIS news from the material that the story's facts don't already state and that an RPSC or RSSB examiner could ask: numbers, names, dates, places, provisions, targets, firsts. Each is one short fact (at most 25 words, in the material's language) with "quote": the material's words that state it (5 to 40 words). Reply {"facts": [{"text": "...", "quote": "..."}]}.`,
    context: `Pick up to ${MAX_FACTS} pieces of background from the material that help explain this news (why it happened, what led to it, what it means), for the story's summary and exam relevance; not new key points. Each is one short line (at most 30 words, in the material's language) with "quote": the material's words for it (5 to 40 words). Reply {"facts": [{"text": "...", "quote": "..."}]}.`,
    static: `Write up to ${MAX_STATICS} "Static Context" entries from the material: textbook facts on the static concepts this news links to (an institution, act, article, scheme, place, technology or term), each explained the way a textbook does in 1-2 sentences of at most 40 words, without retelling the news. Give each a short "keyword" (at most 5 words) and the explanation in both languages, and "quote": the material's words it is based on (5 to 40 words). Reply {"statics": [{"keyword": {"en": "...", "hi": "..."}, "text": {"en": "...", "hi": "..."}, "quote": "..."}]}.`,
  };
  return [
    {
      role: "system",
      content: `You help the editor of a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). The editor added material to one story. ${ask[opts.target]}
Use only the material. Every "quote" must be copied from the material character for character (no changes, no joining of separate sentences). Leave out anything not about this news or its concepts, and anything the story's facts already say. Follow the editor's note when one is given. Use an empty list when the material has nothing useful.${hindiGuide(opts.glossary)}
Reply with JSON only.`,
    },
    {
      role: "user",
      content: `Story: ${opts.headline}\n\nThe story's facts:\n${
        opts.facts.map((f, i) => `${i + 1}. ${f}`).join("\n") || "(none yet)"
      }${opts.note?.trim() ? `\n\nEditor's note: ${opts.note.trim()}` : ""}\n\nMaterial: ${opts.title}\n${opts.material.slice(0, MATERIAL_MAX_CHARS)}`,
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

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const bi = (v: unknown, max: number): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en || hi ? { en: en || hi, hi: hi || en } : null;
};

// SAATHI's picks, keeping only those quoted from the material (and one of
// each); `dropped` counts the rest.
export function parseMaterial(
  raw: string,
  material: string,
  target: MaterialTarget,
  known: string[] = [],
): MaterialFind & { dropped: number } {
  const o = parseJson(raw);
  const seen = new Set(known.map((k) => k.toLowerCase()));
  let dropped = 0;
  const quoted = (quote: string) => {
    if (quote && quoteInSource(quote, material)) return true;
    dropped++;
    return false;
  };
  const facts: MaterialFact[] = [];
  const statics: MaterialStatic[] = [];
  if (target === "static") {
    for (const x of Array.isArray(o.statics) ? o.statics : []) {
      const r = (x ?? {}) as Record<string, unknown>;
      const keyword = bi(r.keyword, 60);
      const text = bi(r.text, 400);
      const quote = str(r.quote, 600);
      if (!keyword || !text || !quoted(quote)) continue;
      if (seen.has(keyword.en.toLowerCase())) continue;
      seen.add(keyword.en.toLowerCase());
      statics.push({ keyword, text, quote });
      if (statics.length >= MAX_STATICS) break;
    }
  } else {
    for (const x of Array.isArray(o.facts) ? o.facts : []) {
      const r = (x ?? {}) as Record<string, unknown>;
      const text = str(r.text, 300);
      const quote = str(r.quote, 600);
      if (!text || !quoted(quote)) continue;
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      facts.push({ text, quote });
      if (facts.length >= MAX_FACTS) break;
    }
  }
  return { facts, statics, dropped };
}

// The material's name for its sources line: a page's site, or the file's
// name without its extension.
export function materialName(o: { url?: string | null; fileName?: string | null }): string {
  if (o.url) {
    try {
      return new URL(o.url).hostname.replace(/^www\./, "");
    } catch {
      // fall through
    }
  }
  const f = (o.fileName ?? "").replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  return f.slice(0, 120) || "Editor's material";
}

export function imageTextMessages(): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Write out all the text in this image exactly as printed, in its own language (Hindi or English), line by line. For a table or chart, write each row or bar as one line with its label and value. Describe nothing else. Reply with the text only.",
    },
    { role: "user", content: "The image:" },
  ];
}
