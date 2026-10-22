// Current affairs magazine: shared types, AI prompts and the pure helpers that
// check facts against their sources, merge duplicate stories, apply
// corrections and schedule posts. No database or network access here.

import { EVENT_FIELD, parseRawEvent, roundupNote, type RawEvent } from "@/lib/ca-events";
import type { Binding, CoverPreset, DailyLayout, MagazineAd } from "@/lib/ca-covers";
import { unverifiedNumbers, type Visual } from "@/lib/ca-visuals";
import { DEFAULT_MIN_RAJASTHAN } from "@/lib/ca-report";
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import {
  DEFAULT_DAILY_STORIES,
  REPEATABLE_SLOTS,
  blueprintText,
  editorialBlueprintText,
  keepSlotted,
  storyType,
} from "@/lib/ca-blueprint";

export const UPLOAD_SECTIONS = [
  {
    id: "editorial",
    label: "Editorials",
    hint: "Newspaper editorials and opinion pages",
    source: "",
  },
  { id: "news", label: "News", hint: "Newspaper news pages", source: "" },
  { id: "pib", label: "PIB press releases", hint: "Press Information Bureau", source: "PIB" },
  {
    id: "dipr",
    label: "DIPR / Sujas",
    hint: "Rajasthan DIPR press notes and Sujas summaries",
    source: "DIPR Rajasthan",
  },
  {
    id: "other",
    label: "Other government sources",
    hint: "Ministry, RPSC, gazette and other official releases",
    source: "",
  },
] as const;

export type UploadSection = (typeof UPLOAD_SECTIONS)[number]["id"];

// Magazine sections, in the order they appear. Practice questions are the
// last section, built from the items' questions.
export const CATEGORIES = [
  { id: "rajasthan", en: "Rajasthan", hi: "राजस्थान" },
  { id: "national", en: "National", hi: "राष्ट्रीय" },
  { id: "international", en: "International", hi: "अंतरराष्ट्रीय" },
  { id: "science", en: "Science & Technology", hi: "विज्ञान एवं प्रौद्योगिकी" },
  { id: "economy", en: "Economics", hi: "अर्थव्यवस्था" },
  { id: "sports", en: "Sports", hi: "खेल" },
  { id: "misc", en: "Miscellaneous Topics", hi: "विविध" },
  { id: "editorial", en: "Editorials", hi: "संपादकीय" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as string[];

// Earlier section names, mapped to the current ones.
const LEGACY_CATEGORIES: Record<string, Category> = {
  schemes: "national",
  environment: "science",
  persons: "misc",
  days: "misc",
};

export const isCategory = (v: unknown): v is Category =>
  typeof v === "string" && CATEGORY_IDS.includes(v);

export function normalizeCategory(v: unknown): Category {
  if (isCategory(v)) return v;
  return (typeof v === "string" && LEGACY_CATEGORIES[v]) || "misc";
}

export type Bi = { en: string; hi: string };

export type CaFact = {
  text: string;
  // The exact source words behind the fact.
  quote: string;
  source_id: string;
  // The quote was found in the source text.
  verified: boolean;
  // The editor checked it by hand: the AI's quote wasn't in the source as
  // written (for the weekly report's accuracy count).
  checked?: boolean;
  // Set when an approved correction replaced this fact.
  corrected?: boolean;
  // Which blueprint slot the fact fills (launch date, ministry, rank…);
  // missing on older facts.
  slot?: string;
  // The editor's margin note on how to use it ("use in the headline").
  note?: string;
};

export type CaMcq = { question: Bi; options: Bi[]; answer: number; explanation: Bi };

// The bilingual magazine text for one item, written only from its facts.
export type CaContent = {
  headline: Bi;
  summary: Bi;
  // One point per fact, in the same order.
  points: Bi[];
  why: Bi;
  // The single background paragraph of older items; newer items use statics.
  background: Bi | null;
  // Static Context: textbook facts on the static concepts the news links to.
  statics?: StaticFact[];
  // Keywords the news links to, offered for more Static Context facts.
  keywords?: Bi[];
  // The admin chose the Static Context facts; rewriting the story keeps them.
  statics_edited?: boolean;
  // Facts the editor highlighted for the summary and "why" only (not points).
  context_facts?: CaFact[];
  mcq: CaMcq | null;
  mains: Bi | null;
  // "Fact Bite" facts from trusted websites (missing on older items).
  dyk?: DykFact[];
  // A chart, table, timeline, flow chart or mind map built from the facts,
  // and the story in one line for the revision page (missing on older items).
  visual?: Visual | null;
  // Facts (0-based) the visual shows; their points are not printed with it.
  visual_covers?: number[];
  // More visuals, printed after the first in this order (the editor adds
  // them).
  visual2?: Visual | null;
  visual2_covers?: number[];
  visual3?: Visual | null;
  visual3_covers?: number[];
  visual4?: Visual | null;
  visual4_covers?: number[];
  // Which visuals (by slot) print below the key points; the rest print
  // above them.
  visual_below?: boolean[];
  // Visuals placed two to a row, when they fit at half width.
  visual_pair?: boolean;
  oneliner?: Bi | null;
  // One quick exam question with a short answer, for the revision page
  // (missing on older items, which show the one-liner instead).
  quick?: CaQuick | null;
  // Photos, maps or diagrams the editor uploaded (the AI can't take images
  // from the sources), in order; w × h is the image's size in pixels.
  images?: CaImage[];
  // Left out of the issue when the key points or visuals tell the story
  // (the text is kept, so it can be put back).
  hide_summary?: boolean;
  hide_why?: boolean;
};

export type CaQuick = { q: Bi; a: Bi };

// A story's visual slots, in print order: the visual and the facts it shows.
export const VISUAL_SLOTS = [
  ["visual", "visual_covers"],
  ["visual2", "visual2_covers"],
  ["visual3", "visual3_covers"],
  ["visual4", "visual4_covers"],
] as const;
export const MAX_VISUALS = VISUAL_SLOTS.length;

// One of a story's visuals, as the editor arranges them.
export type StoryVisual = { visual: Visual; covers: number[]; below: boolean };

// The story's visuals in order (empty slots skipped).
export function storyVisuals(c: Partial<CaContent> | null | undefined): StoryVisual[] {
  if (!c) return [];
  const out: StoryVisual[] = [];
  VISUAL_SLOTS.forEach(([key, coversKey], i) => {
    const v = c[key];
    if (v) out.push({ visual: v, covers: c[coversKey] ?? [], below: !!c.visual_below?.[i] });
  });
  return out;
}

// The content fields for these visuals, in this order (every slot is set,
// so ones left over are cleared).
export function visualsPatch(list: StoryVisual[]): Partial<CaContent> {
  const patch: Partial<CaContent> = {};
  const below: boolean[] = [];
  VISUAL_SLOTS.forEach(([key, coversKey], i) => {
    const v = list[i];
    Object.assign(patch, { [key]: v?.visual ?? null, [coversKey]: v ? v.covers : [] });
    below.push(!!v?.below);
  });
  patch.visual_below = below;
  return patch;
}

export type CaImage = {
  url: string;
  path: string;
  w: number;
  h: number;
  caption?: Bi;
  // "Photo: PIB", printed small under the image (the same in both issues).
  credit?: string;
  // In the rows (default), on a row of its own, or beside the story's text.
  layout?: ImageLayout;
  // An edited image keeps its original and the edit, to change or undo it.
  original?: { url: string; path: string; w: number; h: number };
  edit?: ImageEdit;
};
export type ImageLayout = "row" | "own" | "right" | "left";
export type ImageEdit = {
  // Quarter turns clockwise, a mirror image, and a small tilt in degrees.
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  straighten: number;
  // The part kept, as fractions of the turned image.
  crop: { x: number; y: number; w: number; h: number };
};
export const MAX_IMAGES = 8;

// One Static Context fact: a static concept the news links to, explained the
// way a textbook does. "source" is the book it came from ("NCERT · …"), or
// null when SAATHI wrote it from its own knowledge.
export type StaticFact = { keyword: Bi; text: Bi; source: string | null };

// A summary's length in words: the default, and what can be chosen.
export const DEFAULT_SUMMARY_WORDS = 70;
export const MIN_SUMMARY_WORDS = 25;
export const MAX_SUMMARY_WORDS = 150;
export const clampSummaryWords = (n: unknown) =>
  Math.min(
    MAX_SUMMARY_WORDS,
    Math.max(MIN_SUMMARY_WORDS, Math.round(Number(n) || DEFAULT_SUMMARY_WORDS)),
  );

export const STATIC_CONNECT = { en: "Static Context", hi: "Static Context" };
export const MAX_KEYWORDS = 8;
export const MAX_STATICS = 6;

// The books behind a story's Static Context, for its sources line.
export function staticSources(statics: StaticFact[] | undefined): { title: string }[] {
  return [
    ...new Set(
      (statics ?? []).flatMap((s) => (s.source ? s.source.split(" | ") : [])).filter(Boolean),
    ),
  ].map((title) => ({ title }));
}

// The printed sources line names who published each book ("NCERT, NIOS"),
// each once; a book with no publisher set keeps its title.
export function sourcePublishers(sources: { title: string }[]): string[] {
  return [
    ...new Set(
      sources
        .map((s) => {
          const at = s.title.indexOf(" · ");
          return (at > 0 ? s.title.slice(0, at) : s.title).trim();
        })
        .filter(Boolean),
    ),
  ];
}

const sameKeyword = (a: Bi, b: Bi) =>
  (!!a.en && normalizeForMatch(a.en) === normalizeForMatch(b.en)) ||
  (!!a.hi && normalizeForMatch(a.hi) === normalizeForMatch(b.hi));

// Adds or replaces Static Context facts by keyword, keeping the order.
export function mergeStatics(cur: StaticFact[], add: StaticFact[]): StaticFact[] {
  const out = [...cur];
  for (const f of add) {
    const at = out.findIndex((x) => sameKeyword(x.keyword, f.keyword));
    if (at >= 0) out[at] = f;
    else out.push(f);
  }
  return out.slice(0, MAX_STATICS);
}

// Keywords plus any Static Context keyword not among them.
export function mergeKeywords(keywords: Bi[], statics: StaticFact[]): Bi[] {
  const out = [...keywords];
  for (const f of statics) if (!out.some((k) => sameKeyword(k, f.keyword))) out.push(f.keyword);
  return out.slice(0, MAX_KEYWORDS + MAX_STATICS);
}

// A fact from the web, with the page it came from and the exact passage.
export type DykFact = Bi & { url: string; site: string; quote: string };

export type RawItem = {
  headline: string;
  // Blueprint story type (scheme, index, appointment…).
  type: string;
  category: Category;
  importance: 1 | 2 | 3;
  rajasthan: boolean;
  facts: CaFact[];
  // The static textbook concept behind the story, as a short search phrase.
  concept: string | null;
  // The news event in a few fixed English words (place · scheme or body ·
  // what happened), the same for every source on it: finds the same story
  // told from another angle or in another language.
  key: string | null;
  // The several-day event the story is part of (the Olympics, a summit).
  event: RawEvent | null;
};

// What the extraction prompt asks for as the story's event key.
const KEY_FIELD = `"key": the news event in 4 to 12 English words as "place · main subject's official name · what happened" (e.g. "Rajasthan · Mukhyamantri Jal Swavlamban Abhiyan 3.0 · launch", "India · RBI monetary policy · repo rate unchanged", "Jaipur · Rajasthan High Court · ruling on panchayat polls"); every report on the same event must get the same key whatever its angle, so name the scheme, body, person or law, never the angle`;

// What the extraction prompt asks for as the story's static concept.
const CONCEPT_FIELD = `"concept": the static textbook concept behind the story that an NCERT-level book explains, as a short search phrase naming it exactly (e.g. "ballistic missile", "Article 14 equality before law", "Article 368 amendment of the Constitution", "Ramsar Convention wetlands", "repo rate monetary policy"), or null when there is none (awards, appointments, sports results)`;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = /[[{][\s\S]*[\]}]/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- Splitting long sources ----------

export const CHUNK_CHARS = 7000;

// Splits on paragraph boundaries so each AI call reads whole stories.
export function splitSource(text: string, max = CHUNK_CHARS): string[] {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    const para = p.trim();
    if (!para) continue;
    if (cur && cur.length + para.length + 2 > max) {
      chunks.push(cur);
      cur = "";
    }
    if (para.length > max) {
      for (let i = 0; i < para.length; i += max) chunks.push(para.slice(i, i + max));
      continue;
    }
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text.slice(0, max)];
}

// ---------- A new story from facts the editor highlighted ----------

export function newStoryMessages(facts: string[], note?: string | null): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are the current affairs editor of a magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). The editor highlighted these facts in a news source as one new story. Classify it.
Categories: "rajasthan" for anything about Rajasthan; "national" for India-wide polity, governance, schemes and judgments; "international"; "science" for science, technology, defence, space, health and environment; "economy"; "sports"; "misc" for awards, appointments, persons in news, important days, reports and indices; "editorial" only for an editorial's arguments.
Reply with JSON only: {"headline": a short factual headline in English, "category": one of ${JSON.stringify(CATEGORY_IDS)}, "importance": 1 to 3 (3 = very likely in RPSC or RSSB exams, above all RAS), "rajasthan": true if it concerns Rajasthan, ${CONCEPT_FIELD}}`,
    },
    {
      role: "user",
      content: `${facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}${note?.trim() ? `\n\nEditor's note: ${note.trim()}` : ""}`,
    },
  ];
}

export function parseNewStory(
  raw: string,
  fallback: string,
): Pick<RawItem, "headline" | "category" | "importance" | "rajasthan" | "concept"> {
  const o = parseJson<Record<string, unknown>>(raw) ?? {};
  const importance = Math.round(Number(o.importance));
  return {
    headline: str(o.headline, 300) || fallback.slice(0, 300),
    category: normalizeCategory(o.category),
    importance: (importance >= 1 && importance <= 3 ? importance : 2) as 1 | 2 | 3,
    rajasthan: o.rajasthan === true,
    concept: str(o.concept, 300) || null,
  };
}

// ---------- Verifying facts against the source ----------

// Letters (with Devanagari vowel signs) and digits only, lower-cased, single-spaced.
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

// Markdown that is never quoted: images, link targets and HTML tags.
const stripMarkdownTargets = (s: string) =>
  s
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, " ")
    .replace(/\]\([^)\n]*\)/g, "] ")
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, " ");

// Words joined from two places in a source ("first part … second part")
// count as found when every part is.
export const QUOTE_JOIN = " … ";
export function quoteInSource(quote: string, source: string): boolean {
  const parts = quote.includes(QUOTE_JOIN) ? quote.split(QUOTE_JOIN) : [quote];
  const text = normalizeForMatch(stripMarkdownTargets(source));
  const qs = parts.map((p) => normalizeForMatch(p)).filter(Boolean);
  return qs.join(" ").length >= 8 && qs.every((q) => q.length >= 4 && text.includes(q));
}

// ---------- 1) Extracting items from a source ----------

const SECTION_TEXT: Record<UploadSection, string> = {
  editorial: "a newspaper editorial page",
  news: "newspaper news pages",
  pib: "Press Information Bureau (Government of India) press releases",
  dipr: "Rajasthan government DIPR press notes / Sujas summaries",
  other: "official government releases",
};

export function extractMessages(opts: {
  section: UploadSection;
  sourceName: string;
  date: string;
  text: string;
}): ChatMessage[] {
  if (opts.section === "editorial") return editorialExtractMessages(opts);
  return [
    {
      role: "system",
      content: `You are the current affairs editor of a magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). From the source text, extract only the news items RPSC or RSSB is likely to ask about in its exams (RAS Prelims and Mains above all). Be strict: students lose time on news that is never asked, so leave out anything that does not clearly fit a story type below or would not give at least two exam facts.
${blueprintText()}
Categories: "rajasthan" for anything about Rajasthan; "national" for India-wide polity, governance, schemes and judgments; "international"; "science" for science, technology, defence, space, health and environment; "economy"; "sports"; "misc" for awards, appointments, persons in news, important days, reports and indices that fit nowhere else; "editorial" only for editorials.
Skip: advertisements, crime and accidents, purely local incidents, opinion without facts, market tips, entertainment.
Reply with JSON only: [{"type": one story type id, "headline": a short factual headline in English, "category": one of ${JSON.stringify(CATEGORY_IDS)}, "importance": 1 to 3 as described above, "rajasthan": true if it concerns Rajasthan, ${KEY_FIELD}, ${EVENT_FIELD}, ${CONCEPT_FIELD}, "facts": [{"slot": the slot id this fact fills, "text": one short fact in English, "quote": the exact words from the source that state this fact, copied character for character (5 to 30 words, in the source's language)}]}].
Every fact must fill one slot of its story's type; leave a slot out if the source doesn't state it, and drop any fact that fits no slot. Use only facts stated in the source and keep every number, name and date exactly. Reply [] if nothing is exam-relevant.`,
    },
    {
      role: "user",
      content: `Source: ${opts.sourceName || SECTION_TEXT[opts.section]} (${SECTION_TEXT[opts.section]}), dated ${opts.date}.\n\n${opts.text}`,
    },
  ];
}

// Editorials are read for RAS Mains: the issue, the evidence and the way
// forward rather than news facts.
function editorialExtractMessages(opts: {
  sourceName: string;
  date: string;
  text: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are the editorials editor of a current affairs magazine for RAS (Rajasthan Administrative Service) Mains aspirants. From the newspaper editorial text, return one item per editorial on an issue RPSC asks in RAS Mains.
${editorialBlueprintText()}
Reply with JSON only: [{"type": "editorial", "headline": a short factual headline in English naming the issue (not the editorial's figurative title), "category": "editorial", "importance": 2 or 3, "rajasthan": true if it concerns Rajasthan, ${KEY_FIELD}, ${EVENT_FIELD}, ${CONCEPT_FIELD}, "facts": [{"slot": the slot id this fact fills, "text": one short point in English, "quote": the exact words from the source that state it, copied character for character (5 to 30 words, in the source's language)}]}].
Keep the editorial's own reasoning but drop rhetoric, quotes of politicians and vague lines. Use only what the editorial states, keeping every number, name and date exactly. Reply [] if no editorial is on an exam issue.`,
    },
    {
      role: "user",
      content: `Source: ${opts.sourceName || SECTION_TEXT.editorial} (${SECTION_TEXT.editorial}), dated ${opts.date}.\n\n${opts.text}`,
    },
  ];
}

export function parseExtracted(raw: string, source: string, sourceId: string): RawItem[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      // An editorial always uses the editorial checklist, whatever type it was given.
      const type = storyType(normalizeCategory(o.category) === "editorial" ? "editorial" : o.type);
      const all = (Array.isArray(o.facts) ? o.facts : [])
        .map((f) => {
          const fo = (f ?? {}) as Record<string, unknown>;
          const text = str(fo.text, 600);
          const quote = str(fo.quote, 600);
          const slot = str(fo.slot, 40);
          return {
            text,
            quote,
            source_id: sourceId,
            verified: quoteInSource(quote, source),
            ...(slot ? { slot } : {}),
          };
        })
        .filter((f) => f.text);
      // If the AI tagged no fact at all, keep the first few rather than lose the story.
      const facts = all.some((f) => f.slot) ? keepSlotted(type, all) : all.slice(0, type.maxFacts);
      const importance = Math.round(Number(o.importance));
      return {
        headline: str(o.headline, 300),
        type: type.id,
        category: normalizeCategory(o.category),
        importance: (importance >= 1 && importance <= 3 ? importance : 2) as 1 | 2 | 3,
        rajasthan: o.rajasthan === true,
        facts,
        concept: str(o.concept, 160) || null,
        key: str(o.key, 160) || null,
        event: parseRawEvent(o.event),
      };
    })
    .filter((i) => i.headline && i.facts.length > 0);
}

// The text embedded to find the same story in other sources and days.
export function storyText(item: { headline: string; facts: { text: string }[] }): string {
  return [item.headline, ...item.facts.map((f) => f.text)].join("\n").slice(0, 4000);
}

// Adds facts from another source about the same story, skipping repeats and
// slots the story already has a fact for (repeatable slots excepted).
export function mergeFacts(base: CaFact[], extra: CaFact[], max = 8): CaFact[] {
  const seen = new Set(base.map((f) => normalizeForMatch(f.text)));
  const filled = new Set(base.map((f) => f.slot).filter(Boolean));
  const out = [...base];
  for (const f of extra) {
    const key = normalizeForMatch(f.text);
    if (seen.has(key)) continue;
    if (f.slot && filled.has(f.slot) && !REPEATABLE_SLOTS.has(f.slot)) continue;
    seen.add(key);
    if (f.slot) filled.add(f.slot);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- 2) Writing the bilingual magazine text ----------

export type KbPassage = { title: string; content: string };

// The editor's house style rules, in a writing prompt.
export function styleBlock(rules: string[] | undefined): string {
  const list = (rules ?? []).map((r) => r.trim()).filter(Boolean);
  return list.length
    ? `\nHOUSE STYLE (the editor's own rules; follow them within the RULES above):\n${list.map((r) => `- ${r}`).join("\n")}`
    : "";
}

// What a summary must do, shared by the writing and the "Write another"
// prompts: the whole news in context, not one line lifted from it.
export function summaryRule(words: number): string {
  return `THE SUMMARY gives the complete context of the news in about ${words} words (3-4 connected sentences, never more than ${words + 15} words): what happened, who did it and where, the background as far as the facts and Context say (why it happened or what led to it), and what it means or what comes next. It reads as a short explanation a student can understand on its own, never one line copied from the news. Exact figures stay in the points; name one in the summary only where the story needs it.`;
}

export function enrichMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  category: Category;
  facts: CaFact[];
  kb: KbPassage[];
  syllabus: string | null;
  // The syllabus's papers and their subjects, for the "why" label when no
  // topic matched.
  papers?: string;
  // Mains questions the issue's other stories already have (English), so
  // the issue does not ask the same theme twice.
  mainsSet?: string[];
  // The static concept the background explains, when known.
  concept?: string | null;
  // The visual printed with the text, and the facts (0-based) it shows.
  visual?: { type: string; covers: number[] } | null;
  // Facts the editor picked for the summary and "why" only, not as points.
  context?: string[];
  // The editor's instruction for this story ("focus on the Rajasthan angle").
  note?: string | null;
  // The editor's house style rules (Magazine settings).
  style?: string[];
  // About how many words the summary has (Magazine settings).
  summaryWords?: number;
  // The several-day event the story belongs to: the day's roundup of it.
  event?: string | null;
}): ChatMessage[] {
  const words = clampSummaryWords(opts.summaryWords);
  const facts = opts.facts
    .map((f, i) => `${i + 1}. ${f.text}${f.note ? ` [Editor's note: ${f.note}]` : ""}`)
    .join("\n");
  const context = opts.context?.length
    ? `\n\nContext (use for the summary and "why" only; no points):\n${opts.context.map((f) => `- ${f}`).join("\n")}`
    : "";
  const note = opts.note?.trim() ? `\n\nEditor's instruction: ${opts.note.trim()}` : "";
  const kb = opts.kb.length
    ? opts.kb.map((p, i) => `[K${i + 1}] ${p.title}\n${p.content.slice(0, 1500)}`).join("\n\n")
    : "(none)";
  const editorial = opts.category === "editorial";
  const covered = opts.visual?.covers.map((i) => i + 1) ?? [];
  const visualNote = opts.visual
    ? `\nA ${opts.visual.type} printed with this story already shows ${covered.length ? `facts ${covered.join(", ")}` : "some of the facts"}. Do not restate ${covered.length ? "those facts" : "what it shows"} in the summary or "why"; still write their points (they are only printed if the visual is removed).`
    : "";
  return [
    {
      role: "system",
      content: `You write a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). Write one news item from the numbered facts.
RULES: Use only the facts given (numbered facts and any Context). Never add a number, name, date or claim that is not in them. Follow the editor's instruction when one is given, and an [Editor's note] on a fact (for example: put it in the headline, build the MCQ or the Mains question on it, keep it word for word), within these rules.
BE BRIEF: students revise from this, so less theory, more memorable facts. ${summaryRule(words)} Nothing is repeated between the points and "why". Points are short phrases (at most 15 words) that start with the key term or number, not full explanatory sentences. No filler such as "This is a significant step".${visualNote}${opts.event ? roundupNote(opts.event) : ""}${styleBlock(opts.style)}
STATIC CONNECT links the news to the static syllabus. "keywords" lists up to ${MAX_KEYWORDS} static concepts the news links to that RPSC could ask about (constitutional articles, acts, institutions, technologies, schemes, places, conventions, terms), most important first (the "Static concept" in the message, when given), whether or not the passages explain them; each is a short name of at most 5 words. "statics" explains the first 1 or 2 keywords the way a textbook does: what it is, what it says, how it works, in 1-2 sentences of at most 40 words each, without retelling the news. Base each on the knowledge-base passages [K…] that explain it, even if they never mention the news, and list them in "from"; when no passage explains it, write it from well-established textbook knowledge you are sure of (no doubtful figures or dates) and leave "from" empty. Use [] for both when the news has no static concept worth explaining.${hindiGuide(opts.glossary)}
Reply with JSON only:
{"headline": {"en": "...", "hi": "..."},
 "summary": {"en": ${editorial ? `"3-4 connected sentences, about ${words} words: the issue, the main argument and the suggested way forward"` : `"3-4 connected sentences, about ${words} words (never more than ${words + 15}): the complete context of the news"`}, "hi": "..."},
 "points": [{"en": "...", "hi": "..."}] (exactly one per numbered fact, same order),
 "why": {"en": "a label, not a sentence: 'GS Paper <number> · <subject> · <topic in at most 6 words>' from the RAS syllabus topic given (e.g. 'GS Paper II · Earth Science · Climate of Rajasthan')", "hi": "the same label in Hindi (e.g. 'सामान्य अध्ययन प्रश्नपत्र II · भू-विज्ञान · राजस्थान की जलवायु')"},
 "keywords": [{"en": "...", "hi": "..."}],
 "statics": [{"keyword": its number in "keywords" (1 = first), "en": "...", "hi": "...", "from": ["K1", ...]}],
 "mcq": {"question": {"en": "...", "hi": "..."}, "options": [{"en": "...", "hi": "..."} x4], "answer": index 0-3, "explanation": {"en": "...", "hi": "..."}}${editorial ? " or null" : ""},
 "mains": {"en": "...", "hi": "..."} or null}
PRACTICE QUESTIONS follow the RPSC (RAS) pattern and difficulty:
- "mcq" is a RAS Prelims question written the way RPSC sets current affairs (RAS Pre 2024 and Sub-Inspector 2025 papers, 2026 Prelims syllabus). Test the exact detail an examiner picks (a name, number, district, rank, ordinal, date, host, winner, author or provision), not the story's general idea. Choose the format from the facts:
  - several features, provisions or figures of one scheme, policy, law, budget or report: statements ("Consider the following statements: 1. … 2. … 3. … Which of the statements given above is/are correct?", options like "Only 1 and 2"); a wrong statement changes one number, date or name from the facts;
  - several sites, winners or items each with its place, district or partner: "Which of the following pairs is NOT correctly matched?" with one pair per option;
  - figures for several districts, states, years or items: arrange them in order, or ask which is highest or lowest;
  - one key fact (who, where, which ordinal, host city, captain, author, venue): a direct question whose four options are all of the same kind (four Rajasthan districts, four cities, four people, four ordinals), with no option obviously out of place.
  Bring in the static link when the facts or passages give it (the river a barrage is on, the district of a site, the state of a Ramsar site, a constitutional article, an acronym's full form). The answer and every statement must be decidable from the facts or passages; wrong options must be wrong by them yet plausible to someone who only skimmed the news. Never use "All of the above" or "None of the above", and never give the answer away in the question. Put each statement or pair on its own line (line breaks inside the string). The explanation states the correct fact and, for statements, what is wrong in each wrong one. The Hindi version uses RPSC's Hindi phrasing ("निम्नलिखित कथनों पर विचार कीजिए", "उपर्युक्त में से कौन-सा/से कथन सही है/हैं?", "निम्नलिखित में से कौन-सा युग्म सुमेलित नहीं है?", "निम्नलिखित को अवरोही क्रम में व्यवस्थित कीजिए").
- "mains" is a RAS Mains question written the way RPSC sets current affairs questions (RAS Mains 2023 and 2024 papers, 2026 scheme). Set it only for news RPSC asks in Mains: a named scheme, mission, policy or act of India or Rajasthan (its objectives, targets, features); a budget's announcements for a sector; a commission's or committee's recommendations; a landmark court judgment; a new technology, mission or platform; a geopolitical development affecting India; a person in news; sports achievements and sports schemes of India or Rajasthan. Otherwise null: appointments, days, rankings and scores, MoUs, minor awards and routine events have no Mains value.
  - Name the exact subject with its full official title (and year, if the facts give it) and "of India" / "of Rajasthan"; never "a recent scheme" or "the recently launched initiative". One or two lines with no news preamble ("In light of recent reports…") and no quotation of the story.
  - Ask for concrete content the facts or passages answer, as RPSC does: "What is X? Write its main objectives.", "What are the aims/targets of X?", "Mention the main features/provisions of X.", "Describe the main recommendations of X.", "Who is X? Why was he/she in news recently?", "What specific measures were announced in X to boost Y?", "Describe the location and strategic importance of X in the present scenario." A count is fine ("any three").
  - 5 marks, 50 words by default. 10 marks, 150 words only when the facts give at least five answer points: join two tasks in one question (what it is and its features, or the measures and how they help Rajasthan), anchored to a static syllabus topic (the constitutional article, institution or concept behind the news). Never print marks for parts and never offer "OR".
  - Use What is/are, Who, Write, Mention, Explain, Describe, Differentiate, Enumerate; "Examine" or "Analyse" only at 10 marks. Never a vague "Discuss the role/significance/importance of X", never opinion or political judgment, never bare recall of a date, rank or figure.
  - Name Rajasthan in the question when the facts are about Rajasthan (the state scheme, act, district or project); do not tack "with special reference to Rajasthan" onto national news.
  - Questions already set for this issue are listed in the message; never set one on the same scheme, event or theme again (use null).${
    editorial
      ? `
  - THIS IS AN EDITORIAL: set "mains" unless it is about party politics. Ask an analytical question on the issue, anchored to its static topic and naming the exact subject, as RPSC does: "What are the challenges in implementing X? Suggest measures.", "How will X affect Y?", "Examine the issues in X." 10 marks, 150 words when the points give at least five answer points, otherwise 5 marks, 50 words. Set "mcq" to null if the editorial gives no checkable fact.`
      : ""
  }
  - End with the marks and word limit: "(5 marks, 50 words)" or "(10 marks, 150 words)"; in Hindi "(5 अंक, 50 शब्द)" or "(10 अंक, 150 शब्द)", using RPSC's Hindi phrasing (e.g. "के प्रमुख उद्देश्य लिखिए", "की मुख्य विशेषताओं का उल्लेख कीजिए").`,
    },
    {
      role: "user",
      content: `Category: ${opts.category}\nHeadline: ${opts.headline}\n${opts.syllabus ? `RAS syllabus topic: ${opts.syllabus}\n` : opts.papers ? `No syllabus topic matched; pick the paper and subject from: ${opts.papers}\n` : ""}${opts.concept ? `Static concept: ${opts.concept}\n` : ""}${opts.mainsSet?.length ? `Mains questions already set for this issue:\n${opts.mainsSet.map((q) => `- ${q}`).join("\n")}\n` : ""}\nFacts:\n${facts}${context}${note}\n\nKnowledge-base passages:\n${kb}`,
    },
  ];
}

const bi = (v: unknown, max = 2000): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en || hi ? { en, hi } : null;
};

// Keywords and Static Context facts from a reply; "from" names passages
// [K1]…, which become the facts' book labels.
function parseStatics(
  rawKeywords: unknown,
  rawStatics: unknown,
  kbTitles: string[],
): { keywords: Bi[]; statics: StaticFact[] } {
  const keywords = (Array.isArray(rawKeywords) ? rawKeywords : [])
    .map((k) => bi(k, 80))
    .filter((k): k is Bi => !!k)
    .slice(0, MAX_KEYWORDS);
  const statics = (Array.isArray(rawStatics) ? rawStatics : [])
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const n = Number(o.keyword) - 1;
      return staticFact(o, Number.isInteger(n) ? keywords[n] : bi(o.keyword, 80), kbTitles);
    })
    .filter((f): f is StaticFact => !!f);
  return { keywords, statics: mergeStatics([], statics) };
}

function staticFact(
  o: Record<string, unknown>,
  keyword: Bi | null | undefined,
  kbTitles: string[],
): StaticFact | null {
  const text = bi(o, 1000);
  if (!text || !keyword || (!keyword.en && !keyword.hi)) return null;
  const books = [
    ...new Set(
      (Array.isArray(o.from) ? o.from : [])
        .map((k) => kbTitles[Number(String(k).replace(/\D/g, "")) - 1])
        .filter(Boolean),
    ),
  ];
  return { keyword, text, source: books.length ? books.join(" | ") : null };
}

export function parseContent(
  raw: string,
  factCount: number,
  kbTitles: string[] = [],
): { content: CaContent } | null {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const headline = bi(o.headline, 300);
  const summary = bi(o.summary, 3000);
  if (!headline || !summary) return null;
  const points = (Array.isArray(o.points) ? o.points : [])
    .map((p) => bi(p, 800))
    .filter((p): p is Bi => !!p)
    .slice(0, Math.max(factCount, 1));
  let mcq: CaMcq | null = null;
  const m = (o.mcq ?? null) as Record<string, unknown> | null;
  if (m) {
    const options = (Array.isArray(m.options) ? m.options : [])
      .map((x) => bi(x, 300))
      .filter((x): x is Bi => !!x);
    const answer = Number(m.answer);
    const question = bi(m.question, 600);
    // Four different options, or the question is unanswerable.
    const distinct = new Set(options.map((x) => normalizeForMatch(x.en || x.hi))).size === 4;
    if (
      question &&
      options.length === 4 &&
      distinct &&
      Number.isInteger(answer) &&
      answer >= 0 &&
      answer < 4
    ) {
      mcq = {
        question,
        options,
        answer,
        explanation: bi(m.explanation, 600) ?? { en: "", hi: "" },
      };
    }
  }
  const { keywords, statics } = parseStatics(o.keywords, o.statics, kbTitles);
  return {
    content: {
      headline,
      summary,
      points,
      why: bi(o.why, 800) ?? { en: "", hi: "" },
      background: null,
      statics,
      keywords: mergeKeywords(keywords, statics),
      mcq,
      mains: bi(o.mains, 600),
    },
  };
}

// More Static Context facts, for keywords the admin picked. Each keyword
// comes with the passages its search found.
export function staticFactsMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  facts: string[];
  keywords: { keyword: Bi; passages: KbPassage[] }[];
}): { messages: ChatMessage[]; kbTitles: string[] } {
  const kbTitles: string[] = [];
  const blocks = opts.keywords.map((k, i) => {
    const passages = k.passages.map((p) => {
      kbTitles.push(p.title);
      return `[K${kbTitles.length}] ${p.title}\n${p.content.slice(0, 1500)}`;
    });
    return `Keyword ${i + 1}: ${k.keyword.en}${k.keyword.hi ? ` / ${k.keyword.hi}` : ""}\n${passages.join("\n\n") || "(no passages)"}`;
  });
  return {
    kbTitles,
    messages: [
      {
        role: "system",
        content: `You write the "Static Context" box of a bilingual (Hindi and English) current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains): textbook facts on the static concepts a news item links to. For each keyword, explain the concept the way a textbook does (what it is, what it says, how it works), linked to the news where it helps, in 1-2 sentences of at most 40 words, without retelling the news. Base it on that keyword's knowledge-base passages [K…] when they explain it and list them in "from"; otherwise write it from well-established textbook knowledge you are sure of (no doubtful figures or dates) and leave "from" empty.${hindiGuide(opts.glossary)}
Reply with JSON only: [{"keyword": the keyword's number, "keyword_hi": the keyword in Hindi, "keyword_en": the keyword in English, "en": "...", "hi": "...", "from": ["K1", ...]}], one per keyword.`,
      },
      {
        role: "user",
        content: `News: ${opts.headline}\n${opts.facts.map((f) => `- ${f}`).join("\n")}\n\n${blocks.join("\n\n---\n\n")}`,
      },
    ],
  };
}

export function parseStaticFacts(raw: string, keywords: Bi[], kbTitles: string[]): StaticFact[] {
  const rows = parseJson<unknown[]>(raw);
  if (!Array.isArray(rows)) return [];
  const out = rows
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const n = Number(o.keyword) - 1;
      const given = Number.isInteger(n) ? keywords[n] : undefined;
      // The model fills in the language the admin's keyword was missing.
      const keyword = given && {
        en: given.en || str(o.keyword_en, 80),
        hi: given.hi || str(o.keyword_hi, 80),
      };
      return staticFact(o, keyword, kbTitles);
    })
    .filter((f): f is StaticFact => !!f);
  return mergeStatics([], out);
}

// ---------- 3) Corrections: a later report changes an earlier fact ----------

export type CaChange = {
  // Index of the earlier item's fact that changed.
  fact: number;
  new_en: string;
  new_hi: string;
  // The changed value as it appears in the earlier text, for replacing it in
  // the headline and summary too (e.g. "₹500 crore" -> "₹700 crore").
  old_value: string;
  new_value: string;
  old_value_hi: string;
  new_value_hi: string;
  note: string;
};

export function changeCheckMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  earlier: { date: string; facts: CaFact[]; points: Bi[] };
  later: { date: string; facts: CaFact[] };
}): ChatMessage[] {
  const earlier = opts.earlier.facts
    .map(
      (f, i) =>
        `${i}. ${f.text}${opts.earlier.points[i]?.hi ? ` | हिंदी: ${opts.earlier.points[i].hi}` : ""}`,
    )
    .join("\n");
  const later = opts.later.facts.map((f) => `- ${f.text}`).join("\n");
  return [
    {
      role: "system",
      content: `You check current affairs for corrections. An earlier news item and a later report are about the same story. Find facts of the earlier item that the later report changes or corrects (a figure, date, name, place or status). New information that does not contradict an earlier fact is NOT a change.${hindiGuide(opts.glossary)}
Reply with JSON only: {"changes": [{"fact": index of the earlier fact, "new_en": the corrected fact in English, "new_hi": the corrected fact in Hindi, "old_value": the exact changed words in the earlier English fact, "new_value": what replaces them, "old_value_hi": the exact changed words in the earlier Hindi text (or ""), "new_value_hi": the Hindi replacement (or ""), "note": short reason in English}]}. Reply {"changes": []} if nothing changed.`,
    },
    {
      role: "user",
      content: `Earlier item (${opts.earlier.date}):\n${earlier}\n\nLater report (${opts.later.date}):\n${later}`,
    },
  ];
}

export function parseChanges(raw: string, factCount: number): CaChange[] {
  const o = parseJson<{ changes?: unknown[] }>(raw);
  const list = Array.isArray(o?.changes) ? o!.changes : [];
  return list
    .map((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      return {
        fact: Math.round(Number(c.fact)),
        new_en: str(c.new_en, 600),
        new_hi: str(c.new_hi, 600),
        old_value: str(c.old_value, 200),
        new_value: str(c.new_value, 200),
        old_value_hi: str(c.old_value_hi, 200),
        new_value_hi: str(c.new_value_hi, 200),
        note: str(c.note, 300),
      };
    })
    .filter((c) => Number.isInteger(c.fact) && c.fact >= 0 && c.fact < factCount && c.new_en);
}

const replaceAll = (s: string, from: string, to: string) =>
  from && to && from !== to ? s.split(from).join(to) : s;

// Applies approved changes to an item's facts and magazine text.
export function applyChanges(
  facts: CaFact[],
  content: CaContent | null,
  changes: CaChange[],
): { facts: CaFact[]; content: CaContent | null } {
  const nextFacts = facts.map((f) => ({ ...f }));
  let next = content ? (JSON.parse(JSON.stringify(content)) as CaContent) : null;
  for (const c of changes) {
    if (nextFacts[c.fact]) {
      nextFacts[c.fact] = { ...nextFacts[c.fact], text: c.new_en, corrected: true };
    }
    if (!next) continue;
    if (next.points[c.fact]) {
      next.points[c.fact] = { en: c.new_en, hi: c.new_hi || next.points[c.fact].hi };
    }
    const swap = (b: Bi): Bi => ({
      en: replaceAll(b.en, c.old_value, c.new_value),
      hi: replaceAll(b.hi, c.old_value_hi, c.new_value_hi),
    });
    next = {
      ...next,
      headline: swap(next.headline),
      summary: swap(next.summary),
      why: swap(next.why),
      oneliner: next.oneliner ? swap(next.oneliner) : next.oneliner,
      quick: next.quick ? { q: swap(next.quick.q), a: swap(next.quick.a) } : next.quick,
    };
  }
  // A visual showing a number the correction replaced is dropped (it can be
  // made again from the corrected facts), and its facts print as points again.
  // So is one that shows a changed fact in place of its point.
  if (next) {
    for (const [key, coversKey] of VISUAL_SLOTS) {
      const v = next[key];
      const covers = new Set(next[coversKey] ?? []);
      if (
        v &&
        (unverifiedNumbers(v, nextFacts).length || changes.some((c) => covers.has(c.fact)))
      ) {
        next[key] = null;
      }
    }
  }
  return { facts: nextFacts, content: next };
}

// Removes one key point and the fact it was written from (points and facts
// stay index-aligned for corrections and visuals). Says whether the visual
// still shows it, so the admin can redo or remove the visual.
export function removePoint(
  facts: CaFact[],
  content: CaContent | null,
  index: number,
): { facts: CaFact[]; content: CaContent | null; visualShowsIt: boolean } {
  const nextFacts = facts.filter((_, i) => i !== index);
  if (!content) return { facts: nextFacts, content, visualShowsIt: false };
  const shift = (covers: number[]) =>
    covers.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
  const visualShowsIt = VISUAL_SLOTS.some(([key, coversKey]) => {
    const v = content[key];
    return Boolean(
      v && ((content[coversKey] ?? []).includes(index) || unverifiedNumbers(v, nextFacts).length),
    );
  });
  return {
    facts: nextFacts,
    content: {
      ...content,
      points: content.points.filter((_, i) => i !== index),
      ...Object.fromEntries(
        VISUAL_SLOTS.filter(([key], i) => i === 0 || content[key]).map(([, coversKey]) => [
          coversKey,
          shift(content[coversKey] ?? []),
        ]),
      ),
    },
    visualShowsIt,
  };
}

// Pending corrections point at facts by index: drop changes to the removed
// fact and shift the rest. Returns null when no change is left.
export function shiftChanges(changes: CaChange[], index: number): CaChange[] | null {
  const next = changes
    .filter((c) => c.fact !== index)
    .map((c) => (c.fact > index ? { ...c, fact: c.fact - 1 } : c));
  return next.length ? next : null;
}

// ---------- Scheduling ----------

const IST_OFFSET_MIN = 330;

// "YYYY-MM-DD" for a date in India.
export function istDate(d = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

// When a day's issue is posted: the next day at the set time (IST). If that
// time has already passed when it is approved, it goes out right away.
export function dailyPostTime(issueDate: string, postTime: string, now = new Date()): Date {
  const [h, m] = (/^(\d{1,2}):(\d{2})$/.exec(postTime) ?? ["", "10", "00"]).slice(1).map(Number);
  const next = new Date(`${issueDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const at = new Date(next.getTime() + (h * 60 + m - IST_OFFSET_MIN) * 60_000);
  return at.getTime() > now.getTime() ? at : now;
}

export function monthRange(month: string): { from: string; to: string } {
  const start = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const HI_MONTHS = [
  "जनवरी",
  "फ़रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्टूबर",
  "नवंबर",
  "दिसंबर",
];
const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDate(date: string, lang: "en" | "hi", withDay = true): string {
  const [y, m, d] = date.split("-").map(Number);
  const month = (lang === "hi" ? HI_MONTHS : EN_MONTHS)[m - 1];
  return withDay ? `${d} ${month} ${y}` : `${month} ${y}`;
}

// ---------- Settings ----------

export type MagazineSettings = {
  // @channelusername or the numeric chat id (-100…): both issues post here.
  channel: string;
  // HH:MM in India time.
  post_time: string;
  title_en: string;
  title_hi: string;
  brand_line: string;
  // Who the magazine is for: the cover line and the post captions.
  tagline_en: string;
  tagline_hi: string;
  // The story boxes' names, the same in both issues.
  box_static: string;
  box_dyk: string;
  box_why: string;
  // "Join us on Telegram", linked at the bottom of every page.
  join_text: string;
  join_url: string;
  accent: string;
  logo_main_url: string;
  logo_partner_url: string;
  // Your own Telegram chat id, for test sends.
  test_chat_id: string;
  // Add approved issues to SAATHI's knowledge base.
  add_to_knowledge_base: boolean;
  // "Fact Bite" facts searched on the web (Tavily), from these sites only.
  do_you_know: boolean;
  trusted_domains: string[];
  // Collect news from the watched websites every evening at this time (IST).
  auto_collect: boolean;
  collect_time: string;
  // Message the test chat on Telegram when the day's draft is ready.
  notify_when_ready: boolean;
  // Add a chart, table, timeline, flow chart or mind map to each story.
  visuals: boolean;
  // Stories a day go into the issue; less important ones beyond this arrive
  // already dropped (must-know stories always go in).
  daily_stories: number;
  // Editorials a day picked from the websites marked "Editorials".
  daily_editorials: number;
  // About how many words SAATHI writes for each story's summary.
  summary_words: number;
  // English terms and the Hindi always used for them (or kept in English).
  glossary: GlossaryEntry[];
  // After each daily PDF, post its MCQs to the channel as quiz polls.
  channel_quiz: boolean;
  channel_quiz_count: number;
  // Each approved daily issue's quick questions go into the month's
  // "Current Affairs" flashcard deck in the app.
  add_to_flashcards: boolean;
  // Weekly quality report to the test chat on Telegram, Sundays from 9 AM.
  weekly_report: boolean;
  // A day's issue with fewer Rajasthan stories than this is flagged.
  min_rajasthan: number;
  // A correction approved after the day's issue was posted is announced on
  // the channel, under that day's PDF.
  post_corrections: boolean;
  // House style: the editor's writing rules, added to SAATHI's instructions.
  style_rules: string[];
  // The daily issue's cover layout.
  daily_cover: DailyLayout;
  // An ad from the library printed as the daily issue's last page ("": none).
  daily_back_cover: string;
  // How the printed monthly issue is bound: ruled notes pages are added so
  // its back cover lands on the outside.
  print_binding: Binding;
  // Full-page A4 ads, for back covers and pages between monthly sections.
  ads: MagazineAd[];
  // Customised monthly covers saved by name.
  cover_presets: CoverPreset[];
};

// Official and reference sites the "Fact Bite" search may use. Subdomains
// are included (gov.in covers pib.gov.in, rajasthan.gov.in, …).
export const DEFAULT_TRUSTED_DOMAINS = [
  "gov.in",
  "nic.in",
  "rbi.org.in",
  "isro.gov.in",
  "sansad.in",
  "eci.gov.in",
  "un.org",
  "who.int",
  "worldbank.org",
  "imf.org",
  "wto.org",
  "unesco.org",
  "britannica.com",
];

export const DEFAULT_MAGAZINE_SETTINGS: MagazineSettings = {
  channel: "",
  post_time: "10:00",
  title_en: "Daily Current Affairs",
  title_hi: "दैनिक करेंट अफेयर्स",
  brand_line: "FlashGyan by RASbandhu",
  tagline_en: "For all Rajasthan competitive exams · Special focus: RAS Mains",
  tagline_hi: "राजस्थान की सभी प्रतियोगी परीक्षाओं के लिए · RAS मुख्य परीक्षा पर विशेष फोकस",
  box_static: "Static Context",
  box_dyk: "Fact Bite",
  box_why: "Exam Angle",
  join_text: "Join us on Telegram",
  join_url: "https://t.me/RASbandhu",
  accent: "#6d28d9",
  logo_main_url: "",
  logo_partner_url: "",
  test_chat_id: "",
  add_to_knowledge_base: true,
  do_you_know: true,
  trusted_domains: DEFAULT_TRUSTED_DOMAINS,
  auto_collect: true,
  collect_time: "21:00",
  notify_when_ready: true,
  visuals: true,
  daily_stories: DEFAULT_DAILY_STORIES,
  daily_editorials: 2,
  summary_words: DEFAULT_SUMMARY_WORDS,
  glossary: [],
  channel_quiz: true,
  channel_quiz_count: 5,
  add_to_flashcards: true,
  weekly_report: true,
  min_rajasthan: DEFAULT_MIN_RAJASTHAN,
  post_corrections: true,
  style_rules: [],
  daily_cover: "classic",
  daily_back_cover: "",
  print_binding: "booklet",
  ads: [],
  cover_presets: [],
};

// The note posted on the channel, under a day's PDF, when a correction to one
// of its stories is approved after the issue went out: in that issue's
// language (both, under an older bilingual issue).
export function correctionNote(
  o: {
    date: string;
    headline: Bi;
    summary_en: string;
    summary_hi: string;
  },
  lang?: "en" | "hi",
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (lang === "hi") {
    return [
      `✏️ <b>सुधार</b> · ${formatDate(o.date, "hi")}`,
      "",
      `<b>${esc(o.headline.hi || o.headline.en)}</b>`,
      "",
      esc(o.summary_hi.trim() || o.summary_en),
    ].join("\n");
  }
  if (lang === "en") {
    return [
      `✏️ <b>Correction</b> · ${formatDate(o.date, "en")}`,
      "",
      `<b>${esc(o.headline.en || o.headline.hi)}</b>`,
      "",
      esc(o.summary_en.trim() || o.summary_hi),
    ].join("\n");
  }
  return [
    `✏️ <b>सुधार · Correction</b> · ${formatDate(o.date, "hi")} / ${formatDate(o.date, "en")}`,
    "",
    `<b>${esc(o.headline.hi || o.headline.en)}</b>`,
    ...(o.headline.hi && o.headline.en ? [esc(o.headline.en)] : []),
    "",
    ...[o.summary_hi, o.summary_en].filter((t) => t.trim()).map(esc),
  ].join("\n");
}

export function categoryLabel(id: string): { en: string; hi: string } {
  return CATEGORIES.find((c) => c.id === id) ?? { en: id, hi: id };
}

// The post's caption, in the issue's language (both for an older bilingual
// issue).
export function captionFor(
  kind: "daily" | "monthly",
  period: string,
  settings: MagazineSettings,
  count: number,
  lang?: "en" | "hi",
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const brand = esc(settings.brand_line);
  const tagline = (l: "en" | "hi") => {
    const t = (
      l === "hi" ? settings.tagline_hi || settings.tagline_en : settings.tagline_en
    ).trim();
    return t ? `🎯 ${esc(t)}\n` : "";
  };
  if (lang === "hi") {
    const title = settings.title_hi || settings.title_en;
    return kind === "monthly"
      ? `📚 <b>${esc(title.replace("दैनिक", "मासिक"))}</b>\n🗓 ${formatDate(period, "hi", false)}\n📰 ${count} विषय\n${tagline("hi")}\n${brand}`
      : `📰 <b>${esc(title)}</b>\n🗓 ${formatDate(period, "hi")}\n✅ ${count} महत्वपूर्ण खबरें\n${tagline("hi")}\n${brand}`;
  }
  if (lang === "en") {
    return kind === "monthly"
      ? `📚 <b>${esc(settings.title_en.replace(/^Daily/i, "Monthly"))}</b>\n🗓 ${formatDate(period, "en", false)}\n📰 ${count} topics\n${tagline("en")}\n${brand}`
      : `📰 <b>${esc(settings.title_en)}</b>\n🗓 ${formatDate(period, "en")}\n✅ ${count} important news items\n${tagline("en")}\n${brand}`;
  }
  if (kind === "monthly") {
    return `📚 <b>${esc(settings.title_hi.replace("दैनिक", "मासिक"))} | Monthly Current Affairs</b>\n🗓 ${formatDate(period, "hi", false)} / ${formatDate(period, "en", false)}\n📰 ${count} topics\n\n${brand}`;
  }
  return `📰 <b>${esc(settings.title_hi)} | ${esc(settings.title_en)}</b>\n🗓 ${formatDate(period, "hi")} / ${formatDate(period, "en")}\n✅ ${count} important news items, bilingual\n\n${brand}`;
}

// ---------- "Fact Bite" from trusted websites ----------

export type WebPage = { title: string; url: string; content: string };

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ---------- Flashcards from an issue ----------

// The month's deck in the app's flashcards ("Current Affairs – October 2026").
// Its topic matches the month's SAATHI documents, so SAATHI can point to it.
export function flashcardDeckFor(date: string) {
  return {
    name: `Current Affairs – ${formatDate(date, "en", false)}`,
    subject: "Current Affairs",
    topic: date.slice(0, 7),
    description: "Quick revision questions from FlashGyan's daily current affairs magazine.",
    // Newest month first.
    order_index: -Number(date.slice(0, 7).replace("-", "")),
  };
}

export type IssueCard = {
  prompt: string;
  question: string;
  answer: string;
  sections: { title: string; body: string }[];
  order_index: number;
};

// A day's cards are numbered from day × 100, so re-approving a day replaces
// exactly its own cards and the deck stays in date order.
export function dayCardRange(date: string): [number, number] {
  const day = Number(date.slice(8, 10));
  return [day * 100, day * 100 + 99];
}

// One card per story with a quick revision question: Hindi on the card,
// English and the headline on the back.
export function issueCards(
  date: string,
  items: { category: string; content: Pick<CaContent, "headline" | "quick"> }[],
): IssueCard[] {
  const [start] = dayCardRange(date);
  return items
    .filter((i) => i.content.quick && (i.content.quick.q.hi || i.content.quick.q.en))
    .slice(0, 99)
    .map((i, n) => {
      const { q, a } = i.content.quick!;
      const english = [q.en && `Q: ${q.en}`, a.en && `A: ${a.en}`].filter(Boolean).join("\n");
      return {
        prompt: `${formatDate(date, "en")} · ${categoryLabel(i.category).en}`,
        question: q.hi || q.en,
        answer: a.hi || a.en,
        sections: [
          ...(english && q.hi ? [{ title: "In English", body: english }] : []),
          {
            title: "खबर / The news",
            body: [i.content.headline.hi, i.content.headline.en].filter(Boolean).join("\n"),
          },
        ],
        order_index: start + n + 1,
      };
    });
}

// Concepts the magazine's stories needed but the books did not explain:
// Static Context keywords SAATHI wrote from its own knowledge (older stories:
// a concept with no book behind the background), grouped, most first.
export type UncoveredConcept = { concept: string; stories: number; last: string; example: string };

export function uncoveredConcepts(
  rows: {
    concept: string | null;
    issue_date: string;
    headline: string;
    context_sources: { title: string }[] | null;
    statics?: StaticFact[] | null;
  }[],
): UncoveredConcept[] {
  const by = new Map<string, UncoveredConcept>();
  for (const r of rows) {
    const concepts = r.statics?.length
      ? r.statics.filter((f) => !f.source).map((f) => f.keyword.en || f.keyword.hi)
      : r.concept?.trim() && !r.context_sources?.length
        ? [r.concept.trim()]
        : [];
    for (const concept of concepts) {
      const key = normalizeForMatch(concept);
      if (!key) continue;
      const cur = by.get(key);
      if (!cur) by.set(key, { concept, stories: 1, last: r.issue_date, example: r.headline });
      else {
        cur.stories += 1;
        if (r.issue_date > cur.last) {
          cur.last = r.issue_date;
          cur.example = r.headline;
        }
      }
    }
  }
  return [...by.values()].sort((a, b) => b.stories - a.stories || b.last.localeCompare(a.last));
}

// "Fact Bite" lists related recent developments of the same kind as the
// news (other missile tests, other amendments, other new Ramsar sites), first
// from the magazine's own earlier stories, then from trusted websites.
export type EarlierStory = { date: string; headline: string; facts: string[] };

export function relatedMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  facts: CaFact[];
  stories: EarlierStory[];
}): ChatMessage[] {
  const stories = opts.stories
    .map(
      (st, i) => `[S${i + 1}] ${formatDate(st.date, "en")}: ${st.headline}\n${st.facts.join("\n")}`,
    )
    .join("\n\n");
  return [
    {
      role: "system",
      content: `You add a "Fact Bite" box to a current affairs news item for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains): related recent developments an examiner would link to this news. From the numbered earlier stories of the same magazine, pick at most 3 developments of the SAME KIND as the news (other missiles tested, other constitutional amendments, other Ramsar sites declared, other judgments on the same article…) and write each as one line that names it, with its month and year and one key detail. Skip stories of a different kind and anything about this same news. Use only what the stories state.${hindiGuide(opts.glossary)}
Reply with JSON only: [{"en": one line in English, "hi": the same in Hindi, "story": "S1", "quote": the exact words from that story's text that state it (5 to 40 words, copied character for character)}]. Reply [] if none is of the same kind.`,
    },
    {
      role: "user",
      content: `News: ${opts.headline}\nNews facts: ${opts.facts.map((f) => f.text).join("; ")}\n\nEarlier stories:\n\n${stories}`,
    },
  ];
}

// Keeps only lines whose quote is in the story they cite; each is credited to
// the magazine issue it appeared in.
export function parseRelated(raw: string, stories: EarlierStory[]): DykFact[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  const out: DykFact[] = [];
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const st = stories[Number(String(o.story ?? "").replace(/\D/g, "")) - 1];
    const en = str(o.en, 400);
    const hi = str(o.hi, 400);
    const quote = str(o.quote, 600);
    if (!st || !en || !quote || !quoteInSource(quote, [st.headline, ...st.facts].join("\n")))
      continue;
    out.push({
      en,
      hi,
      quote,
      url: "",
      site: `FlashGyan Current Affairs, ${formatDate(st.date, "en")}`,
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function dykMessages(opts: {
  // The editor's glossary (Magazine settings).
  glossary?: GlossaryEntry[];
  headline: string;
  facts: CaFact[];
  pages: WebPage[];
}): ChatMessage[] {
  const pages = opts.pages
    .map((p, i) => `[W${i + 1}] ${p.title} (${siteName(p.url)})\n${p.content.slice(0, 4000)}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: `You add a "Fact Bite" box to a current affairs news item for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains): related recent developments an examiner would link to this news. Using ONLY the web pages given, write up to 3 developments of the SAME KIND as the news from roughly the last two years (other missiles tested, other constitutional amendments, other Ramsar sites declared…), each one line naming it with its month and year and one key detail. Do not repeat the news or explain its background. Skip anything undated, older, or not clearly stated. Each line must quote the page word for word.${hindiGuide(opts.glossary)}
Reply with JSON only: [{"en": one sentence in English, "hi": the same in Hindi, "page": "W1", "quote": the exact words from that page that state it (8 to 40 words, copied character for character)}]. Reply [] if the pages have nothing suitable.`,
    },
    {
      role: "user",
      content: `News: ${opts.headline}\nNews facts (do not repeat): ${opts.facts.map((f) => f.text).join("; ")}\n\nWeb pages:\n\n${pages}`,
    },
  ];
}

// Keeps only facts whose quote is found on the page they cite.
export function parseDyk(raw: string, pages: WebPage[]): DykFact[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  const out: DykFact[] = [];
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const page = pages[Number(String(o.page ?? "").replace(/\D/g, "")) - 1];
    const en = str(o.en, 400);
    const hi = str(o.hi, 400);
    const quote = str(o.quote, 600);
    if (!page || !en || !quote || !quoteInSource(quote, page.content)) continue;
    out.push({ en, hi, quote, url: page.url, site: siteName(page.url) });
    if (out.length >= 3) break;
  }
  return out;
}

export function cleanDomains(list: string[]): string[] {
  return [
    ...new Set(
      list
        .map((d) =>
          d
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/\/.*$/, ""),
        )
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    ),
  ].slice(0, 50);
}
