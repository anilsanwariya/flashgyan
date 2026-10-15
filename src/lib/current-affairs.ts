// Current affairs magazine: shared types, AI prompts and the pure helpers that
// check facts against their sources, merge duplicate stories, apply
// corrections and schedule posts. No database or network access here.

import { unverifiedNumbers, type Visual } from "@/lib/ca-visuals";

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
  // Set when an approved correction replaced this fact.
  corrected?: boolean;
};

export type CaMcq = { question: Bi; options: Bi[]; answer: number; explanation: Bi };

// The bilingual magazine text for one item, written only from its facts.
export type CaContent = {
  headline: Bi;
  summary: Bi;
  // One point per fact, in the same order.
  points: Bi[];
  why: Bi;
  // Background from the SAATHI knowledge base, or null when nothing related.
  background: Bi | null;
  mcq: CaMcq | null;
  mains: Bi | null;
  // "Did you know?" facts from trusted websites (missing on older items).
  dyk?: DykFact[];
  // A chart, table, timeline, flow chart or mind map built from the facts,
  // and the story in one line for the revision page (missing on older items).
  visual?: Visual | null;
  // Facts (0-based) the visual shows; their points are not printed with it.
  visual_covers?: number[];
  oneliner?: Bi | null;
};

// A fact from the web, with the page it came from and the exact passage.
export type DykFact = Bi & { url: string; site: string; quote: string };

export type RawItem = {
  headline: string;
  category: Category;
  importance: 1 | 2 | 3;
  rajasthan: boolean;
  facts: CaFact[];
};

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

// ---------- Verifying facts against the source ----------

// Letters (with Devanagari vowel signs) and digits only, lower-cased, single-spaced.
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

export function quoteInSource(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length >= 8 && normalizeForMatch(source).includes(q);
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
  const editorial =
    opts.section === "editorial"
      ? ' This is an editorial page: return one item per editorial, with category "editorial", a headline naming its subject, and facts covering its main arguments, data and suggestions.'
      : "";
  return [
    {
      role: "system",
      content: `You are the current affairs editor of a magazine for RAS (Rajasthan Administrative Service) exam aspirants. From the source text, extract the news items worth knowing for the RAS Prelims and Mains exams.
Include: Rajasthan government decisions, schemes, appointments and events; national policies, schemes, bills, reports, indices and court judgments; international relations, summits and organisations; economic data; science, technology, defence, space, health and environment; sports; awards, appointments, persons in news and important days.
Categories: "rajasthan" for anything about Rajasthan; "national" for India-wide polity, governance, schemes and judgments; "international"; "science" for science, technology, defence, space, health and environment; "economy"; "sports"; "misc" for awards, appointments, persons in news, important days, reports and indices that fit nowhere else; "editorial" only for editorials.
Skip: advertisements, crime and accidents, purely local incidents, opinion without facts, market tips, entertainment.${editorial}
Reply with JSON only: [{"headline": a short factual headline in English, "category": one of ${JSON.stringify(CATEGORY_IDS)}, "importance": 1 to 3 (3 = very likely to be asked in the exam), "rajasthan": true if it concerns Rajasthan, "facts": [{"text": one fact in English, "quote": the exact words from the source that state this fact, copied character for character (5 to 30 words, in the source's language)}]}].
Use only facts stated in the source and keep every number, name and date exactly. At most 8 facts per item. Reply [] if nothing is exam-relevant.`,
    },
    {
      role: "user",
      content: `Source: ${opts.sourceName || SECTION_TEXT[opts.section]} (${SECTION_TEXT[opts.section]}), dated ${opts.date}.\n\n${opts.text}`,
    },
  ];
}

export function parseExtracted(raw: string, source: string, sourceId: string): RawItem[] {
  const list = parseJson<unknown[]>(raw);
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const facts = (Array.isArray(o.facts) ? o.facts : [])
        .map((f) => {
          const fo = (f ?? {}) as Record<string, unknown>;
          const text = str(fo.text, 600);
          const quote = str(fo.quote, 600);
          return { text, quote, source_id: sourceId, verified: quoteInSource(quote, source) };
        })
        .filter((f) => f.text)
        .slice(0, 8);
      const importance = Math.round(Number(o.importance));
      return {
        headline: str(o.headline, 300),
        category: normalizeCategory(o.category),
        importance: (importance >= 1 && importance <= 3 ? importance : 2) as 1 | 2 | 3,
        rajasthan: o.rajasthan === true,
        facts,
      };
    })
    .filter((i) => i.headline && i.facts.length > 0);
}

// The text embedded to find the same story in other sources and days.
export function storyText(item: { headline: string; facts: { text: string }[] }): string {
  return [item.headline, ...item.facts.map((f) => f.text)].join("\n").slice(0, 4000);
}

// Adds facts from another source about the same story, skipping repeats.
export function mergeFacts(base: CaFact[], extra: CaFact[], max = 12): CaFact[] {
  const seen = new Set(base.map((f) => normalizeForMatch(f.text)));
  const out = [...base];
  for (const f of extra) {
    const key = normalizeForMatch(f.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- 2) Writing the bilingual magazine text ----------

export type KbPassage = { title: string; content: string };

export function enrichMessages(opts: {
  headline: string;
  category: Category;
  facts: CaFact[];
  kb: KbPassage[];
  syllabus: string | null;
  // The visual printed with the text, and the facts (0-based) it shows.
  visual?: { type: string; covers: number[] } | null;
}): ChatMessage[] {
  const facts = opts.facts.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
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
      content: `You write a bilingual (Hindi and English) current affairs magazine for RAS exam aspirants. Write one news item from the numbered facts.
RULES: Use only the facts given. Never add a number, name, date or claim that is not in the facts. Hindi must be natural standard Hindi as used in Rajasthan competitive exams (मानक हिंदी), with the same numbers and official names (give the English name in brackets the first time if it helps).
BE BRIEF: students revise from this, so less theory, more memorable facts. Say each fact once: the summary gives only the gist (what happened, who, where), the points carry the details, and nothing is repeated between summary, points and "why". Points are short phrases (at most 15 words) that start with the key term or number, not full explanatory sentences. No filler such as "This is a significant step".${visualNote}
"background" explains the static concept the news relates to (for example the scheme's origin and aim, the constitutional article, the institution), using ONLY the knowledge-base passages [K…]; set it to null if none of them is genuinely about this news. List the passages you used in "background_from".
Reply with JSON only:
{"headline": {"en": "...", "hi": "..."},
 "summary": {"en": ${editorial ? '"3-4 short sentences: the issue, the main argument and the suggested way forward"' : opts.visual ? '"one sentence, at most 25 words"' : '"1-2 sentences, at most 40 words"'}, "hi": "..."},
 "points": [{"en": "...", "hi": "..."}] (exactly one per numbered fact, same order),
 "why": {"en": "one sentence, at most 25 words: why this matters for RAS (which exam paper or topic)", "hi": "..."},
 "background": {"en": "1-2 sentences, at most 40 words", "hi": "..."} or null,
 "background_from": ["K1", ...],
 "mcq": {"question": {"en": "...", "hi": "..."}, "options": [{"en": "...", "hi": "..."} x4], "answer": index 0-3, "explanation": {"en": "...", "hi": "..."}},
 "mains": {"en": "...", "hi": "..."} or null}
PRACTICE QUESTIONS follow the RPSC (RAS) pattern and difficulty:
- "mcq" is a RAS Prelims question of moderate to hard difficulty, not a one-line recall question. Prefer statement-based ("Consider the following statements: 1. … 2. … 3. … Which of the statements given above is/are correct?" with options like "Only 1 and 2"), match-the-pairs, or "Which one of the following is NOT correct?" formats. Put each statement on its own line (use line breaks inside the string). Options must be plausible; the correct answer and every statement must be decidable from the facts. The Hindi version uses RPSC's Hindi phrasing (e.g. "निम्नलिखित कथनों पर विचार कीजिए", "उपर्युक्त में से कौन-सा/से कथन सही है/हैं?").
- "mains" is a RAS Mains question in the RPSC style, ending with the marks and word limit: "(5 marks, 50 words)" or "(10 marks, 150 words)" ("(5 अंक, 50 शब्द)" / "(10 अंक, 150 शब्द)" in Hindi); null if the news has no Mains value.`,
    },
    {
      role: "user",
      content: `Category: ${opts.category}\nHeadline: ${opts.headline}\n${opts.syllabus ? `RAS syllabus topic: ${opts.syllabus}\n` : ""}\nFacts:\n${facts}\n\nKnowledge-base passages:\n${kb}`,
    },
  ];
}

const bi = (v: unknown, max = 2000): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en || hi ? { en, hi } : null;
};

export function parseContent(
  raw: string,
  factCount: number,
): { content: CaContent; backgroundFrom: number[] } | null {
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
    if (question && options.length === 4 && Number.isInteger(answer) && answer >= 0 && answer < 4) {
      mcq = {
        question,
        options,
        answer,
        explanation: bi(m.explanation, 600) ?? { en: "", hi: "" },
      };
    }
  }
  const from = (Array.isArray(o.background_from) ? o.background_from : [])
    .map((k) => Number(String(k).replace(/\D/g, "")) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0);
  const background = from.length ? bi(o.background, 1500) : null;
  return {
    content: {
      headline,
      summary,
      points,
      why: bi(o.why, 800) ?? { en: "", hi: "" },
      background,
      mcq,
      mains: bi(o.mains, 600),
    },
    backgroundFrom: background ? from : [],
  };
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
      content: `You check current affairs for corrections. An earlier news item and a later report are about the same story. Find facts of the earlier item that the later report changes or corrects (a figure, date, name, place or status). New information that does not contradict an earlier fact is NOT a change.
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
    };
  }
  // A visual showing a number the correction replaced is dropped (it can be
  // made again from the corrected facts), and its facts print as points again.
  // So is one that shows a changed fact in place of its point.
  const covers = new Set(next?.visual_covers ?? []);
  if (
    next?.visual &&
    (unverifiedNumbers(next.visual, nextFacts).length || changes.some((c) => covers.has(c.fact)))
  ) {
    next.visual = null;
  }
  return { facts: nextFacts, content: next };
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
  // @channelusername or the numeric chat id (-100…).
  channel: string;
  // HH:MM in India time.
  post_time: string;
  title_en: string;
  title_hi: string;
  brand_line: string;
  accent: string;
  logo_main_url: string;
  logo_partner_url: string;
  // Your own Telegram chat id, for test sends.
  test_chat_id: string;
  // Add approved issues to SAATHI's knowledge base.
  add_to_knowledge_base: boolean;
  // "Did you know?" facts searched on the web (Tavily), from these sites only.
  do_you_know: boolean;
  trusted_domains: string[];
  // Collect news from the watched websites every evening at this time (IST).
  auto_collect: boolean;
  collect_time: string;
  // Message the test chat on Telegram when the day's draft is ready.
  notify_when_ready: boolean;
  // Add a chart, table, timeline, flow chart or mind map to each story.
  visuals: boolean;
};

// Official and reference sites the "Did you know?" search may use. Subdomains
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
};

export function categoryLabel(id: string): { en: string; hi: string } {
  return CATEGORIES.find((c) => c.id === id) ?? { en: id, hi: id };
}

export function captionFor(
  kind: "daily" | "monthly",
  period: string,
  settings: MagazineSettings,
  count: number,
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (kind === "monthly") {
    return `📚 <b>${esc(settings.title_hi.replace("दैनिक", "मासिक"))} | Monthly Current Affairs</b>\n🗓 ${formatDate(period, "hi", false)} / ${formatDate(period, "en", false)}\n📰 ${count} topics for RAS Prelims & Mains\n\n${esc(settings.brand_line)}`;
  }
  return `📰 <b>${esc(settings.title_hi)} | ${esc(settings.title_en)}</b>\n🗓 ${formatDate(period, "hi")} / ${formatDate(period, "en")}\n✅ ${count} important news items for RAS, bilingual\n\n${esc(settings.brand_line)}`;
}

// ---------- "Did you know?" from trusted websites ----------

export type WebPage = { title: string; url: string; content: string };

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function dykMessages(opts: {
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
      content: `You add a "Did you know?" box to a current affairs news item for RAS exam aspirants. Using ONLY the web pages given, write up to 3 short, interesting facts related to the news that are useful for the exam: background, records, firsts, origin, related places, institutions or numbers. Do not repeat the news facts. Skip anything the pages don't state clearly, and anything that may be outdated. Each fact must quote the page word for word.
Reply with JSON only: [{"en": one sentence in English, "hi": the same in standard exam Hindi, "page": "W1", "quote": the exact words from that page that state it (8 to 40 words, copied character for character)}]. Reply [] if the pages have nothing suitable.`,
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
