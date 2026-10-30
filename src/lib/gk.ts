// GK infographics: a subject (Rajasthan Geography) posted as a series, a
// topic a day, as 9:16 image cards made only from the editor's books (the
// SAATHI knowledge base). The AI reads the topic's passages and plans as
// many cards as the material warrants, each a focused sub-topic shown as a
// map (forts, rivers, sanctuaries) or one of the magazine's visuals (table,
// timeline, ranking…) with a few exam points; every fact comes with the
// book's words. Cards are written once in both languages and posted as two
// albums, Hindi and English, each in its own fixed design. Pure helpers,
// shared by the server, the admin page and tests.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import { normalizeForMatch, type Bi } from "@/lib/current-affairs";
import {
  VISUAL_CSS,
  VISUAL_TYPES,
  visualHtml,
  type Visual,
  type VisualType,
} from "@/lib/ca-visuals";
import { MAP_CSS, type MapSpec } from "@/lib/map-spec";
import { igDate } from "@/lib/ig-cards";

type ChatMessage = { role: "system" | "user"; content: string };
export type GkLang = "en" | "hi";

// ---------- Settings ----------

export const GK_DESIGNS = [
  { key: "royal", name: "Royal", note: "FlashGyan purple band, white panels", dark: false },
  { key: "slate", name: "Slate", note: "Deep navy, sky-blue accents", dark: true },
  { key: "parchment", name: "Parchment", note: "Cream page, maroon ink, serif", dark: false },
  { key: "mint", name: "Mint grid", note: "White grid paper, teal accents", dark: false },
  { key: "saffron", name: "Saffron", note: "Saffron band, white page", dark: false },
] as const;
export type GkDesign = (typeof GK_DESIGNS)[number]["key"];
export const GK_DESIGN_KEYS = GK_DESIGNS.map((d) => d.key) as GkDesign[];

export type GkSettings = {
  // The Telegram channel both albums go to.
  channel: string;
  // Posting time (India) on the day the editor approves.
  post_time: string;
  // Each language's album has its own design, the same every day.
  design_en: GkDesign;
  design_hi: GkDesign;
  // Each album's caption; fill-ins {subject} {topic} {day} {date} {count}
  // {channel} {app_link}; a link written [words](link).
  caption_en: string;
  caption_hi: string;
  // The large faint "F", 0 (off) to 30.
  watermark: number;
  // Message the admin chat when the cards are ready to check.
  notify: boolean;
};

export const DEFAULT_GK_CAPTION_EN = `📘 {subject} · Day {day}
🗺️ {topic}

{count} cards to save and revise 👇

📲 [Click here to download FlashGyan]({app_link})

#RajasthanGK #RPSC #RSSB`;

export const DEFAULT_GK_CAPTION_HI = `📘 {subject} · दिन {day}
🗺️ {topic}

सहेजें और दोहराएँ: {count} कार्ड 👇

📲 [FlashGyan ऐप डाउनलोड करने के लिए यहाँ क्लिक करें]({app_link})

#राजस्थान_जीके #RPSC #RSSB`;

export const DEFAULT_GK_SETTINGS: GkSettings = {
  channel: "",
  post_time: "18:00",
  design_en: "royal",
  design_hi: "parchment",
  caption_en: DEFAULT_GK_CAPTION_EN,
  caption_hi: DEFAULT_GK_CAPTION_HI,
  watermark: 7,
  notify: true,
};

export function gkSettingsOf(value: unknown): GkSettings {
  const v = (value && typeof value === "object" ? value : {}) as Partial<GkSettings>;
  const s = { ...DEFAULT_GK_SETTINGS, ...v };
  const design = (d: unknown, dflt: GkDesign) =>
    GK_DESIGN_KEYS.includes(d as GkDesign) ? (d as GkDesign) : dflt;
  return {
    ...s,
    design_en: design(s.design_en, DEFAULT_GK_SETTINGS.design_en),
    design_hi: design(s.design_hi, DEFAULT_GK_SETTINGS.design_hi),
    watermark: Math.max(0, Math.min(30, Number(s.watermark) || 0)),
  };
}

// A caption with its fill-ins.
export function fillGkCaption(
  template: string,
  p: {
    subject: string;
    topic: string;
    day: number;
    date: string;
    count: number;
    channel: string;
    appLink: string;
  },
): string {
  const t = p.appLink
    ? template
    : template
        .split("\n")
        .filter((l) => !l.includes("{app_link}"))
        .join("\n");
  return t
    .replace(/\{subject\}/g, p.subject)
    .replace(/\{topic\}/g, p.topic)
    .replace(/\{day\}/g, String(p.day))
    .replace(/\{date\}/g, p.date)
    .replace(/\{count\}/g, String(p.count))
    .replace(/\{channel\}/g, p.channel)
    .replace(/\{app_link\}/g, p.appLink)
    .trim();
}

export const GK_CAPTION_FIELDS: [string, string][] = [
  ["{subject}", "the subject"],
  ["{topic}", "today's topic"],
  ["{day}", "the series' day number"],
  ["{date}", "the date"],
  ["{count}", "how many cards"],
  ["{app_link}", "the Play Store link"],
  ["{channel}", "the channel link"],
];

// ---------- Cards ----------

// A fact from the books: what it says, the book's own words and the book.
export type GkFact = { text: string; quote: string; source: string; verified: boolean };

// How a card shows its facts: a map, one of the magazine's visuals, or
// just its points.
export type GkLook = "map" | "points" | VisualType;
export const GK_LOOKS: GkLook[] = ["map", ...VISUAL_TYPES, "points"];

// An idea for a card, as the AI plans the day.
export type GkIdea = {
  title: Bi;
  look: GkLook;
  why: string;
  facts: GkFact[];
};

export type GkCard = {
  title: Bi;
  // One line under the title.
  intro: Bi;
  look: GkLook;
  visual?: Visual | null;
  map?: MapSpec | null;
  // 2-5 exam points; **bold** allowed.
  points: Bi[];
  facts: GkFact[];
  // The books it comes from, shown at the foot of the card.
  sources: string[];
};

export const GK_POINTS_MAX = 5;

// A note on a card: from the AI's proofreading or the book check.
export type GkCheck = {
  id: string;
  source: "ai" | "book";
  field: "title" | "intro" | "points" | "visual" | "map";
  text: string;
  fix: string;
  why: string;
  state: "open" | "accepted" | "ignored";
};

// ---------- The books' passages ----------

export type GkPassage = { k: number; title: string; content: string };

// The fact's quote is in its passage (spacing, case and punctuation aside).
export function quoteFound(quote: string, passages: GkPassage[]): GkPassage | null {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return null;
  return passages.find((p) => normalizeForMatch(p.content).includes(q)) ?? null;
}

const passagesText = (passages: GkPassage[]) =>
  passages.map((p) => `[P${p.k}] ${p.title}\n${p.content}`).join("\n\n");

const EXAMS =
  "Rajasthan competitive exams (RPSC RAS, RSSB Patwari, VDO, LDC, police, teachers) and other state exams";

// ---------- The subject's topics ----------

export function topicsMessages(opts: {
  subject: Bi;
  // The books' document titles and their topics.
  books: string[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan a daily series of GK infographic cards for ${EXAMS}: one topic a day, in the order a student should learn the subject, as exam books arrange it. Each topic is narrow enough for one day's 3-10 cards (e.g. "Rivers of Rajasthan: the Chambal system", "Forts of Rajasthan", "Wildlife sanctuaries"), not a whole chapter, and is covered by the books listed.${hindiGuide(opts.glossary ?? [])}
Reply with JSON only: {"topics": [{"en": "topic in English", "hi": "topic in Hindi"}]} (10-40 topics).`,
    },
    {
      role: "user",
      content: `Subject: ${opts.subject.en}${opts.subject.hi ? ` (${opts.subject.hi})` : ""}\n\nThe books (titles and their topics):\n${opts.books
        .slice(0, 200)
        .map((b) => `- ${b}`)
        .join("\n")}`,
    },
  ];
}

const jsonObject = (raw: string): unknown => {
  const t = raw.replace(/```(?:json)?/g, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
};
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const biOf = (v: unknown, max = 300): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: str(o.en, max), hi: str(o.hi, max) };
};

export function parseTopics(raw: string): Bi[] | null {
  const o = jsonObject(raw) as { topics?: unknown } | null;
  if (!o || !Array.isArray(o.topics)) return null;
  return o.topics
    .map((t) => biOf(t, 160))
    .filter((t) => t.en || t.hi)
    .slice(0, 60);
}

// ---------- The day's cards: planned ----------

const LOOK_GUIDE = `How a card can show its facts ("look"):
- "map": places with a location: forts, rivers and their dams, lakes, wildlife sanctuaries and national parks, hills and peaks, districts, mines, sites. At most 12 places a card: split more into several cards (by division or region).
- "table": features of several things side by side (fort, builder, district).
- "glance": one thing's key details as label → value (river: origin, length, end, tributaries).
- "timeline": dated events in order.
- "ranking": things in order of size or rank (longest rivers, largest districts).
- "compare": two things side by side.
- "stats": 2-4 key numbers.
- "bar" or "pie": quantities to compare, or shares of a whole.
- "flow" or "cycle": a process or a chain of steps.
- "mindmap" or "hierarchy": a concept with its parts, or a structure.
- "change", "trend", "proscons": values that changed, one figure over years, benefits and problems.
- "points": no visual suits it; 3-5 points only.`;

export function planMessages(opts: {
  subject: Bi;
  topic: Bi;
  note: string;
  passages: GkPassage[];
  // Cards the series has already posted (their titles), not to repeat.
  done: string[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You plan a day's GK infographic cards for ${EXAMS}. Each card is one image a student saves and revises: one focused sub-topic of today's topic, shown as a map or a visual with a few exam points. Plan as many cards as the topic's material in the passages warrants: a small topic 2-4 cards, a large one up to 12; never pad. Cover what exams ask most first.
RULES: Use only facts stated in the passages [P…] (the editor's books). Each fact gives the passage's exact words in "quote" (5-40 words, copied character for character, in the passage's language) and the passage number. Never add a fact, number, name or date the passages don't state. Don't repeat a card the series already posted.
${LOOK_GUIDE}
Reply with JSON only: {"enough": true or false (false when the passages don't cover the topic well), "note": "one line: what the books cover or lack", "cards": [{"title": {"en": "...", "hi": "..."}, "look": "map" or a visual type or "points", "why": "one line on why exams ask it", "facts": [{"text": "one short fact in English", "quote": "the passage's exact words", "p": passage number}]}]} with 3-15 facts a card.${hindiGuide(opts.glossary ?? [])}`,
    },
    {
      role: "user",
      content: `Subject: ${opts.subject.en} (${opts.subject.hi})\nToday's topic: ${opts.topic.en} (${opts.topic.hi})${opts.note.trim() ? `\nThe editor wants: ${opts.note.trim()}` : ""}${
        opts.done.length
          ? `\n\nCards the series already posted:\n${opts.done
              .slice(-80)
              .map((t) => `- ${t}`)
              .join("\n")}`
          : ""
      }\n\nPassages from the editor's books:\n${passagesText(opts.passages)}`,
    },
  ];
}

const isLook = (v: unknown): v is GkLook => GK_LOOKS.includes(v as GkLook);

// The ideas, each fact checked against its passage (a quote not found is
// kept, marked unverified, for the editor to see).
export function parsePlan(
  raw: string,
  passages: GkPassage[],
): { ideas: GkIdea[]; enough: boolean; note: string } | null {
  const o = jsonObject(raw) as { cards?: unknown; enough?: unknown; note?: unknown } | null;
  if (!o || !Array.isArray(o.cards)) return null;
  const ideas = o.cards
    .map((c): GkIdea | null => {
      const r = (c ?? {}) as Record<string, unknown>;
      const title = biOf(r.title, 140);
      if (!title.en && !title.hi) return null;
      const facts = (Array.isArray(r.facts) ? r.facts : [])
        .map((f): GkFact | null => {
          const x = (f ?? {}) as Record<string, unknown>;
          const text = str(x.text, 300);
          const quote = str(x.quote, 500);
          if (!text) return null;
          const p = passages.find((y) => y.k === Number(x.p));
          const found = quoteFound(quote, p ? [p, ...passages] : passages);
          return { text, quote, source: (found ?? p)?.title ?? "", verified: !!found };
        })
        .filter((f): f is GkFact => !!f)
        .slice(0, 20);
      if (!facts.length) return null;
      return { title, look: isLook(r.look) ? r.look : "points", why: str(r.why, 200), facts };
    })
    .filter((x): x is GkIdea => !!x)
    .slice(0, 15);
  return { ideas, enough: o.enough !== false, note: str(o.note, 300) };
}

// ---------- The cards: written ----------

export function writeMessages(opts: {
  subject: Bi;
  topic: Bi;
  ideas: GkIdea[];
  glossary?: GlossaryEntry[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write GK infographic cards for ${EXAMS}, in English and in Hindi (the same card in both). Each card has a visual made separately from its facts; you write its words: "title" (at most 8 words), "intro" (one line, at most 18 words: what the card shows), and "points": 2-${GK_POINTS_MAX} exam points (at most 16 words each) that start with the key term, name or number, with the key part in **bold**, covering what the visual can't show (a feature, a first, a fact exams ask). Use only the card's facts; never add a number, name or date. Hindi is standard exam-book Hindi with the standard Hindi names of places.${hindiGuide(opts.glossary ?? [])}
Reply with JSON only: {"cards": [{"n": card number, "title": {"en": "...", "hi": "..."}, "intro": {"en": "...", "hi": "..."}, "points": [{"en": "...", "hi": "..."}]}]}`,
    },
    {
      role: "user",
      content: `Subject: ${opts.subject.en}\nTopic: ${opts.topic.en}\n\n${opts.ideas
        .map(
          (c, i) =>
            `Card ${i + 1}: ${c.title.en} (${c.look})\n${c.facts.map((f) => `  - ${f.text}`).join("\n")}`,
        )
        .join("\n\n")}`,
    },
  ];
}

export type GkWritten = { n: number; title: Bi; intro: Bi; points: Bi[] };

export function parseWritten(raw: string): GkWritten[] | null {
  const o = jsonObject(raw) as { cards?: unknown } | null;
  if (!o || !Array.isArray(o.cards)) return null;
  return o.cards
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      return {
        n: Number(r.n),
        title: biOf(r.title, 140),
        intro: biOf(r.intro, 240),
        points: (Array.isArray(r.points) ? r.points : [])
          .map((p) => biOf(p, 240))
          .filter((p) => p.en || p.hi)
          .slice(0, GK_POINTS_MAX),
      };
    })
    .filter((c) => Number.isFinite(c.n) && (c.title.en || c.title.hi));
}

// A card from its idea and what the AI wrote (the visual or map is added
// after).
export function cardFromIdea(idea: GkIdea, w: GkWritten | undefined): GkCard {
  return {
    title: w?.title.en || w?.title.hi ? w.title : idea.title,
    intro: w?.intro ?? { en: "", hi: "" },
    look: idea.look,
    visual: null,
    map: null,
    points: w?.points ?? [],
    facts: idea.facts,
    sources: [...new Set(idea.facts.map((f) => f.source).filter(Boolean))].slice(0, 3),
  };
}

// ---------- Proofreading ----------

export function proofMessages(cards: (GkCard & { n: number })[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You proofread GK infographic cards for ${EXAMS} before they are posted to thousands of students. Each card's words must agree with its facts (the editor's books). Report real mistakes only: a wrong or unsupported number, name, date or claim (not in the facts), a Hindi line that says something different from the English, wrong Hindi spelling or a non-standard Hindi place name, grammar. Don't report matters of taste.
Reply with JSON only: {"issues": [{"n": card number, "field": "title" | "intro" | "points", "text": "the wrong text exactly as it stands", "fix": "the corrected text", "why": "short reason"}]}; {"issues": []} when there is none.`,
    },
    {
      role: "user",
      content: JSON.stringify(
        cards.map((c) => ({
          n: c.n,
          title: c.title,
          intro: c.intro,
          points: c.points,
          facts: c.facts.map((f) => f.text),
        })),
        null,
        1,
      ),
    },
  ];
}

export function parseIssues(
  raw: string,
): { n: number; field: GkCheck["field"]; text: string; fix: string; why: string }[] | null {
  const o = jsonObject(raw) as { issues?: unknown } | null;
  if (!o || !Array.isArray(o.issues)) return null;
  return o.issues
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      return {
        n: Number(r.n),
        field: str(r.field, 10) as GkCheck["field"],
        text: str(r.text, 400),
        fix: typeof r.fix === "string" ? r.fix.trim().slice(0, 400) : "",
        why: str(r.why, 300),
      };
    })
    .filter(
      (i) => Number.isFinite(i.n) && ["title", "intro", "points"].includes(i.field) && i.text,
    );
}

// A note's fix put into the card (the text replaced in either language).
export function applyGkFix(
  card: GkCard,
  field: GkCheck["field"],
  text: string,
  fix: string,
): GkCard {
  const swap = (b: Bi): Bi => ({
    en: b.en.includes(text) ? b.en.replace(text, fix) : b.en,
    hi: b.hi.includes(text) ? b.hi.replace(text, fix) : b.hi,
  });
  if (field === "title") return { ...card, title: swap(card.title) };
  if (field === "intro") return { ...card, intro: swap(card.intro) };
  if (field === "points") return { ...card, points: card.points.map(swap) };
  return card;
}

// ---------- One part written again ----------

export type GkPart = "words" | "points";

export function partMessages(
  part: GkPart,
  card: GkCard,
  note: string,
  glossary: GlossaryEntry[] = [],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You improve one GK infographic card for ${EXAMS}, in English and Hindi. Use only the card's facts; never add a number, name or date.${hindiGuide(glossary)}
Reply with JSON only: ${part === "words" ? `{"title": {"en": "...", "hi": "..."} (at most 8 words), "intro": {"en": "...", "hi": "..."} (one line, at most 18 words)}` : `{"points": [{"en": "...", "hi": "..."}] (2-${GK_POINTS_MAX} exam points, at most 16 words each, starting with the key term, key part in **bold**)}`}`,
    },
    {
      role: "user",
      content: `The card:\n${JSON.stringify({ title: card.title, intro: card.intro, points: card.points, look: card.look }, null, 1)}\n\nIts facts:\n${card.facts.map((f) => `- ${f.text}`).join("\n")}\n\nWrite ${part === "words" ? "the title and intro" : "the points"} again.${note.trim() ? ` The editor asks: ${note.trim()}` : ""}`,
    },
  ];
}

export function parsePart(part: GkPart, raw: string): Partial<GkCard> | null {
  const o = jsonObject(raw) as Record<string, unknown> | null;
  if (!o) return null;
  if (part === "words") {
    const title = biOf(o.title, 140);
    return title.en || title.hi ? { title, intro: biOf(o.intro, 240) } : null;
  }
  const points = (Array.isArray(o.points) ? o.points : [])
    .map((p) => biOf(p, 240))
    .filter((p) => p.en || p.hi)
    .slice(0, GK_POINTS_MAX);
  return points.length ? { points } : null;
}

// ---------- The card as an image ----------

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const markup = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const pick = (b: Bi, lang: GkLang) => (lang === "hi" ? b.hi || b.en : b.en || b.hi);

const FONTS =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Noto+Sans+Devanagari:wght@400;600;800&family=Noto+Serif:wght@400;700&family=Tiro+Devanagari+Hindi&display=block";

// Each design's accent (for the visuals and maps) and its look.
const DESIGN: Record<GkDesign, { accent: string; css: string }> = {
  royal: {
    accent: "#5b3fd1",
    css: `body { background: #f4f1fe; color: #1f1640; }
      .band { background: linear-gradient(120deg, #3d2a78, #6d4bd1); color: #fff; }
      .band .logo { filter: brightness(0) invert(1); }
      .series { color: #e4dcff; } .pill { background: rgba(255,255,255,.18); color: #fff; }
      h1 { color: #2c1d6b; } .intro { color: #4a3f6b; }
      .panel { background: #fff; box-shadow: 0 6px 24px rgba(61,42,120,.12); }
      .points li::before { background: #6d4bd1; } .src { color: #6b6385; } footer { color: #3d2a78; }`,
  },
  slate: {
    accent: "#0ea5e9",
    css: `body { background: #0f1d2e; color: #e8f1fb; }
      .band { background: #0f1d2e; border-bottom: 3px solid #38bdf8; }
      .band .logo { filter: brightness(0) invert(1); }
      .series { color: #7dd3fc; } .pill { background: #38bdf8; color: #0f1d2e; }
      h1 { color: #fff; } .intro { color: #b6c7da; }
      .panel { background: #fff; color: #1b2733; }
      .points li { color: #e8f1fb; } .points li::before { background: #38bdf8; }
      .points b { color: #7dd3fc; } .src { color: #8aa1b8; } footer { color: #b6c7da; }`,
  },
  parchment: {
    accent: "#8c1d18",
    css: `body { background: #fbf3e4; color: #2b1a0e; font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; }
      .band { background: #fbf3e4; border-bottom: 4px double #8c1d18; }
      .series { color: #8c1d18; } .pill { background: #8c1d18; color: #fbf3e4; }
      h1 { color: #8c1d18; font-family: 'Noto Serif', 'Tiro Devanagari Hindi', serif; } .intro { color: #5a3b22; }
      .panel { background: #fffaf0; border: 2px solid #e7d3b0; }
      .points li::before { background: #8c1d18; } .src { color: #7a5a3c; } footer { color: #8c1d18; }`,
  },
  mint: {
    accent: "#0f766e",
    css: `body { background: #fff; color: #0f2a28;
        background-image: linear-gradient(#e6f4f1 2px, transparent 2px), linear-gradient(90deg, #e6f4f1 2px, transparent 2px);
        background-size: 54px 54px; }
      .band { background: #0f766e; color: #fff; }
      .band .logo { filter: brightness(0) invert(1); }
      .series { color: #ccfbf1; } .pill { background: #fff; color: #0f766e; }
      h1 { color: #0f766e; } .intro { color: #335a56; }
      .panel { background: #fff; border: 3px solid #99d8cf; }
      .points li::before { background: #0f766e; } .src { color: #4b6b67; } footer { color: #0f766e; }`,
  },
  saffron: {
    accent: "#c2410c",
    css: `body { background: #fffaf5; color: #2a1608; }
      .band { background: linear-gradient(120deg, #ea580c, #f59e0b); color: #fff; }
      .band .logo { filter: brightness(0) invert(1); }
      .series { color: #fff3e0; } .pill { background: #fff; color: #c2410c; }
      h1 { color: #9a3412; } .intro { color: #6b4226; }
      .panel { background: #fff; box-shadow: 0 6px 24px rgba(194,65,12,.12); }
      .points li::before { background: #ea580c; } .src { color: #7c5a43; } footer { color: #9a3412; }`,
  },
};

const BASE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; }
  body { font-family: Poppins, 'Noto Sans Devanagari', sans-serif; }
  .card { position: relative; width: 1080px; height: 1920px; display: flex; flex-direction: column; overflow: hidden; }
  .wmk { position: absolute; right: -120px; bottom: 160px; width: 760px; pointer-events: none; }
  .band { padding: 44px 64px 34px; position: relative; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .logo { height: 64px; }
  .pill { font-size: 30px; font-weight: 800; padding: 8px 26px; border-radius: 40px; }
  .series { margin-top: 22px; font-size: 30px; font-weight: 600; letter-spacing: .5px; }
  .fit { flex: 1; padding: 40px 64px 0; display: flex; flex-direction: column; gap: 30px; min-height: 0; }
  h1 { font-size: 66px; line-height: 1.15; font-weight: 800; }
  .intro { font-size: 34px; line-height: 1.4; margin-top: -12px; }
  .panel { border-radius: 28px; padding: 26px; }
  .panel.map { padding: 22px 26px; }
  .panel.map .nmap { display: block; margin: 0; }
  .panel.map .nmap-svg { width: 86%; margin: 0 auto; }
  .panel.map .nmap-list { columns: 2; column-gap: 28px; margin-top: 14px; font-size: 28px; line-height: 1.3; }
  .panel.map .nmap-list li { gap: 12px; padding: 4px 0; break-inside: avoid; }
  .panel.map .dn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-size: 22px; font-weight: 700; }
  .panel.map .nmap-credit { font-size: 20px; margin-top: 6px; }
  .vis { width: 100%; zoom: 2.05; }
  .points { list-style: none; display: flex; flex-direction: column; gap: 18px; }
  .points li { position: relative; padding-left: 44px; font-size: 34px; line-height: 1.4; }
  .points li::before { content: ""; position: absolute; left: 6px; top: 16px; width: 18px; height: 18px; border-radius: 50%; }
  .src { font-size: 24px; }
  footer { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 30px 0 40px; font-size: 28px; font-weight: 600; }
  footer img { height: 44px; border-radius: 10px; }
`;

const FIT_SCRIPT = `<script>
(function () {
  function fit() {
    var card = document.querySelector('.card'), box = document.querySelector('.fit');
    if (!card || !box) return;
    var z = 1;
    box.style.zoom = '1';
    var fits = function () { return card.scrollHeight <= card.clientHeight + 1; };
    // A short card grows to fill the space; a long one shrinks to fit.
    while (fits() && z < 1.35) {
      z += 0.03;
      box.style.zoom = String(z);
    }
    while (!fits() && z > 0.55) {
      z -= 0.03;
      box.style.zoom = String(z);
    }
    document.body.setAttribute('data-fit', String(Math.round(z * 100)));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); else fit();
  window.addEventListener('load', fit);
})();
</script>`;

export type GkRenderOpts = {
  lang: GkLang;
  design: GkDesign;
  n: number;
  total: number;
  subject: Bi;
  dayNo: number;
  date: string;
  channel: string;
  assetBase: string;
  watermark: number;
  // The map drawn on the server (its outlines are large); without it a
  // note stands in, as in a quick preview.
  mapHtml?: (m: MapSpec, lang: GkLang, accent: string) => string;
};

export const gkAccent = (d: GkDesign) => DESIGN[d].accent;

// A card's complete page in one language.
export function gkCardHtml(card: GkCard, o: GkRenderOpts): string {
  const d = DESIGN[o.design] ?? DESIGN.royal;
  const meta = GK_DESIGNS.find((x) => x.key === o.design);
  const hi = o.lang === "hi";
  const a = (f: string) => esc(`${o.assetBase.replace(/\/$/, "")}/infographics/${f}`);
  const strength = Math.max(0, Math.min(100, o.watermark)) / 100;
  const wmk =
    strength > 0
      ? `<img class="wmk" src="${a("f-mark.png")}" alt="" style="opacity:${strength}${meta?.dark ? ";filter:brightness(0) invert(1)" : ""}">`
      : "";
  const dayLine = hi ? `दिन ${o.dayNo}` : `Day ${o.dayNo}`;
  let visual = "";
  if (card.look === "map" && card.map) {
    visual = o.mapHtml
      ? `<div class="panel map">${o.mapHtml(card.map, o.lang, d.accent)}</div>`
      : `<div class="panel map-ph" style="font-size:30px;text-align:center;padding:80px 20px">${esc(hi ? `मानचित्र: ${card.map.places.length} स्थान` : `Map: ${card.map.places.length} places`)}</div>`;
  } else if (card.visual && card.look !== "points") {
    visual = `<div class="panel"><div class="vis">${visualHtml(card.visual, d.accent, o.lang)}</div></div>`;
  }
  const points = card.points.filter((p) => pick(p, o.lang).trim());
  const intro = pick(card.intro, o.lang);
  const src = card.sources.length
    ? `<p class="src">${hi ? "स्रोत" : "Source"}: ${esc(card.sources.join("; "))}</p>`
    : "";
  const channel = o.channel.replace(/^https?:\/\//, "").trim();
  return `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>${BASE}${VISUAL_CSS(d.accent)}${MAP_CSS}${d.css} .panel.map .dn { background: ${d.accent}; }</style></head>
<body><div class="card">${wmk}
<div class="band"><div class="top"><img class="logo" src="${a("wordmark.png")}" alt="FlashGyan"><span class="pill">${o.n}/${o.total}</span></div>
<div class="series">${esc(pick(o.subject, o.lang))} · ${esc(dayLine)} · ${esc(igDate(o.date, hi ? "hi" : "short"))}</div></div>
<div class="fit">
<h1>${esc(pick(card.title, o.lang))}</h1>
${intro ? `<p class="intro">${markup(intro)}</p>` : ""}
${visual}
${points.length ? `<ul class="points">${points.map((p) => `<li>${markup(pick(p, o.lang))}</li>`).join("")}</ul>` : ""}
${src}
</div>
<footer><img src="${a("icon.png")}" alt="">${esc(channel ? `${channel} · FlashGyan app` : "FlashGyan app")}</footer></div>${FIT_SCRIPT}</body></html>`;
}

// A sample card, for the design gallery.
export const GK_SAMPLE: GkCard = {
  title: { en: "Major forts of Rajasthan", hi: "राजस्थान के प्रमुख दुर्ग" },
  intro: {
    en: "Six hill forts are UNESCO World Heritage Sites (2013).",
    hi: "छह पहाड़ी दुर्ग यूनेस्को विश्व धरोहर स्थल हैं (2013)।",
  },
  look: "table",
  visual: {
    type: "table",
    title: { en: "Hill forts", hi: "पहाड़ी दुर्ग" },
    columns: [
      { en: "Fort", hi: "दुर्ग" },
      { en: "District", hi: "ज़िला" },
    ],
    rows: [
      [
        { en: "Chittorgarh", hi: "चित्तौड़गढ़" },
        { en: "Chittorgarh", hi: "चित्तौड़गढ़" },
      ],
      [
        { en: "Kumbhalgarh", hi: "कुंभलगढ़" },
        { en: "Rajsamand", hi: "राजसमंद" },
      ],
      [
        { en: "Ranthambore", hi: "रणथंभौर" },
        { en: "Sawai Madhopur", hi: "सवाई माधोपुर" },
      ],
    ],
  } as unknown as Visual,
  map: null,
  points: [
    {
      en: "**Kumbhalgarh** wall is about 36 km long",
      hi: "**कुंभलगढ़** की दीवार लगभग 36 किमी लंबी है",
    },
    { en: "**Gagron** is a water fort (jal durg)", hi: "**गागरोन** एक जल दुर्ग है" },
  ],
  facts: [],
  sources: ["Sample book"],
};
