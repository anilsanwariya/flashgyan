// SAATHI answer writing for descriptive (RAS Mains) questions, shared by the
// website and the Telegram bot. Model answers uploaded by admins are analysed
// into a structure, the structures of many answers are combined into a
// "blueprint" per marks and question type, and SAATHI follows the blueprint
// (with the closest model answers as examples) while taking facts only from the
// knowledge base. Keep this file free of runtime-specific imports.

import {
  SAATHI_NO_ANSWER_MARKER,
  parseJsonLoose,
  questionLanguage,
  saathiEmbedQuery,
  saathiPrepareQuery,
  saathiRetrieve,
  type ChatMessage,
  type SaathiChannel,
  type SaathiMatch,
  type SaathiQuery,
  type SaathiRpc,
  type SaathiTurn,
} from "./saathi-core.ts";

// ---------- Question types ----------

export const MAINS_DIRECTIVES = [
  "define",
  "explain",
  "discuss",
  "critical",
  "compare",
  "suggest",
] as const;
export type MainsDirective = (typeof MAINS_DIRECTIVES)[number];
// Blueprints learned from every answer of a marks band, whatever its directive.
export type BlueprintDirective = MainsDirective | "any";

export const DIRECTIVE_LABELS: Record<BlueprintDirective, string> = {
  define: "Define / What is",
  explain: "Explain / Describe",
  discuss: "Discuss / Analyse",
  critical: "Critically examine",
  compare: "Compare / Differentiate",
  suggest: "Suggest measures",
  any: "All question types",
};

// What each question type asks for, given to the model with every answer.
const DIRECTIVE_HINTS: Record<MainsDirective, string> = {
  define:
    "Give the precise definition or identity first, then the most important facts (dates, place, significance).",
  explain:
    "Explain the main points in a logical order (what, why, how), one idea per point, each backed by a fact.",
  discuss:
    "Cover several dimensions (for example political, economic, social, administrative) with a fact or example for each.",
  critical:
    "Give both sides: achievements or positives and limitations or criticism, each backed by a fact, and end with a balanced view.",
  compare:
    "Compare both sides on the same parameters, preferably in a table, then state the key difference.",
  suggest:
    "State the problem in a line, then give specific, practical measures, including government schemes or initiatives the material mentions.",
};

// Checked in order: the first group with a matching phrase wins. English
// phrases match whole words; Hindi phrases match anywhere.
const DIRECTIVE_PATTERNS: { directive: MainsDirective; en: RegExp; hi: string[] }[] = [
  {
    directive: "critical",
    en: /\b(critically|critical|evaluate|assess|comment on|do you agree|justify|appraise)\b/i,
    hi: [
      "आलोचनात्मक",
      "समालोचना",
      "मूल्यांकन",
      "टिप्पणी कीजिए",
      "टिप्पणी करें",
      "क्या आप सहमत",
      "औचित्य",
    ],
  },
  {
    directive: "compare",
    en: /\b(compare|comparison|differentiate|distinguish|difference between|differences between|contrast)\b/i,
    hi: ["तुलना", "अंतर", "अन्तर", "भेद"],
  },
  {
    directive: "suggest",
    en: /\b(suggest|measures|way forward|remedies|remedial|steps (?:should|to be|needed|taken)|how can)\b/i,
    hi: ["उपाय", "सुझाव", "कदम"],
  },
  {
    directive: "discuss",
    en: /\b(discuss|analy[sz]e|analysis|examine|significance|impact|role of|importance)\b/i,
    hi: ["विवेचना", "चर्चा", "विश्लेषण", "परीक्षण", "महत्व", "प्रभाव", "भूमिका"],
  },
  {
    directive: "explain",
    en: /\b(explain|describe|elaborate|highlight|outline|write a note|short note|features of|enumerate)\b/i,
    hi: ["स्पष्ट", "वर्णन", "समझाइए", "व्याख्या", "टिप्पणी", "विशेषता"],
  },
  {
    directive: "define",
    en: /\b(define|definition|what is|what are|who was|who is|who were|meaning of|what do you mean)\b/i,
    hi: ["परिभाषित", "परिभाषा", "क्या है", "क्या हैं", "किसे कहते", "कौन थे", "कौन है", "अर्थ"],
  },
];

// The question type from its directive word, or null when none is recognised.
export function detectDirective(question: string): MainsDirective | null {
  for (const p of DIRECTIVE_PATTERNS) {
    if (p.en.test(question) || p.hi.some((w) => question.includes(w))) return p.directive;
  }
  return null;
}

export function isDirective(v: unknown): v is MainsDirective {
  return typeof v === "string" && (MAINS_DIRECTIVES as readonly string[]).includes(v);
}

// Marks written in the question, e.g. "(10 marks)" or "10 अंक".
export function detectMarks(question: string): number | null {
  const m = /(?<!\d)(\d{1,2})\s*(?:marks?\b|अंक)/i.exec(question);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 50 ? n : null;
}

// Used when the answer formats table hasn't been set up.
export const DEFAULT_WORD_LIMITS: Record<number, number> = { 2: 15, 5: 50, 10: 100, 20: 200 };
export const DEFAULT_MAINS_MARKS = 10;

export function defaultWordLimit(marks: number): number {
  return DEFAULT_WORD_LIMITS[marks] ?? Math.max(15, marks * 10);
}

// ---------- Word counting ----------

// Words a student would write: Markdown symbols, diagrams and code are ignored.
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, " ")
    .replace(/[#*_>|`~]/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------- Analysing a model answer ----------

export const INTRO_STYLES = [
  "definition",
  "context",
  "data",
  "constitutional",
  "historical",
  "quote",
  "direct",
  "none",
] as const;
export const BODY_FORMATS = ["points", "paragraphs", "subheadings", "table", "mixed"] as const;
export const CONCLUSION_STYLES = [
  "way_forward",
  "summary",
  "government_initiative",
  "balanced_view",
  "significance",
  "none",
] as const;
export const DIAGRAM_KINDS = ["none", "flowchart", "table", "map", "diagram"] as const;
export const FEATURE_KEYS = ["rajasthan", "data", "schemes", "constitution", "examples"] as const;

export type IntroStyle = (typeof INTRO_STYLES)[number];
export type BodyFormat = (typeof BODY_FORMATS)[number];
export type ConclusionStyle = (typeof CONCLUSION_STYLES)[number];
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type AnswerAnalysis = {
  directive: MainsDirective;
  intro: { style: IntroStyle; words: number };
  body: { format: BodyFormat; points: number; headings: string[] };
  conclusion: { style: ConclusionStyle; words: number };
  features: Record<FeatureKey, boolean>;
  diagram: DiagramKind;
  // What makes the answer score well, as short general tips.
  strengths: string[];
  word_count: number;
};

const INTRO_TEXT: Record<IntroStyle, string> = {
  definition: "define the key term",
  context: "set the context in a line",
  data: "open with a striking fact or figure",
  constitutional: "cite the constitutional article or act",
  historical: "give the historical background in a line",
  quote: "open with a short quote or report finding",
  direct: "answer the question directly",
  none: "go straight into the points",
};

const FORMAT_TEXT: Record<BodyFormat, string> = {
  points: "as short bullet points",
  paragraphs: "in short paragraphs",
  subheadings: "grouped under bold sub-headings",
  table: "in a table",
  mixed: "as bullet points under bold sub-headings",
};

const CONCLUSION_TEXT: Record<ConclusionStyle, string> = {
  way_forward: "a forward-looking way ahead",
  summary: "a one-line summary of the main point",
  government_initiative: "a relevant government initiative or scheme",
  balanced_view: "a balanced overall view",
  significance: "why it matters (its significance)",
  none: "no separate conclusion",
};

const FEATURE_TEXT: Record<FeatureKey, string> = {
  rajasthan: "Rajasthan-specific facts or examples",
  data: "data, figures or dates",
  schemes: "relevant government schemes or policies",
  constitution: "constitutional articles, acts or committees",
  examples: "concrete examples",
};

const DIAGRAM_TEXT: Record<DiagramKind, string> = {
  none: "",
  flowchart: "a simple flowchart",
  table: "a small table",
  map: "a rough map sketch (describe it in words)",
  diagram: "a simple labelled diagram",
};

export function analysisMessages(question: string, answer: string, marks: number): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You study model answers to RAS (Rajasthan Administrative Service) Mains exam questions to learn how good answers are structured. Describe the STRUCTURE of the answer, not its facts. Reply with JSON only:
{"directive": one of ${JSON.stringify(MAINS_DIRECTIVES)} (what the question asks: define/what is, explain/describe, discuss/analyse, critically examine/evaluate, compare/differentiate, suggest measures),
 "intro": {"style": one of ${JSON.stringify(INTRO_STYLES)}, "words": number of words in the introduction (0 if none)},
 "body": {"format": one of ${JSON.stringify(BODY_FORMATS)}, "points": number of distinct points or arguments, "headings": up to 6 generic English labels for the dimensions or sub-headings it covers, e.g. "Causes", "Impact", "Measures", "Economic", "Social" (no topic-specific facts)},
 "conclusion": {"style": one of ${JSON.stringify(CONCLUSION_STYLES)}, "words": number of words in the conclusion (0 if none)},
 "features": {"rajasthan": true if it uses Rajasthan-specific facts or examples, "data": uses figures/dates/statistics, "schemes": mentions government schemes or policies, "constitution": cites articles/acts/committees, "examples": gives concrete examples},
 "diagram": one of ${JSON.stringify(DIAGRAM_KINDS)},
 "strengths": 2 to 4 short general tips (in English, under 15 words each) on what makes this answer score well, about structure and presentation only, never topic facts}`,
    },
    {
      role: "user",
      content: `Marks: ${marks}\nQuestion: ${question}\n\nModel answer:\n${answer.slice(0, 12_000)}`,
    },
  ];
}

const pick = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const wholeNumber = (v: unknown, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

const cleanList = (v: unknown, max: number, maxLength: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => String(x ?? "").trim())
        .filter((x) => x && x.length <= maxLength)
        .slice(0, max)
    : [];

// Parses the model's analysis; returns null if the reply isn't usable.
export function parseAnalysis(
  raw: string,
  answer: string,
  fallbackDirective: MainsDirective,
): AnswerAnalysis | null {
  const o = parseJsonLoose<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const words = countWords(answer);
  const intro = (o.intro ?? {}) as Record<string, unknown>;
  const body = (o.body ?? {}) as Record<string, unknown>;
  const conclusion = (o.conclusion ?? {}) as Record<string, unknown>;
  const features = (o.features ?? {}) as Record<string, unknown>;
  const introWords = wholeNumber(intro.words, words);
  return {
    directive: pick(MAINS_DIRECTIVES, o.directive, fallbackDirective),
    intro: { style: pick(INTRO_STYLES, intro.style, "none"), words: introWords },
    body: {
      format: pick(BODY_FORMATS, body.format, "points"),
      points: wholeNumber(body.points, 30),
      headings: cleanList(body.headings, 6, 40),
    },
    conclusion: {
      style: pick(CONCLUSION_STYLES, conclusion.style, "none"),
      words: wholeNumber(conclusion.words, Math.max(0, words - introWords)),
    },
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, features[k] === true])) as Record<
      FeatureKey,
      boolean
    >,
    diagram: pick(DIAGRAM_KINDS, o.diagram, "none"),
    strengths: cleanList(o.strengths, 4, 160),
    word_count: words,
  };
}

// ---------- Combining analyses into a blueprint ----------

export type Share<T> = { value: T; share: number };

export type BlueprintStats = {
  samples: number;
  words: { median: number; min: number; max: number };
  // Median share of the answer spent on the introduction and conclusion.
  intro_share: number;
  conclusion_share: number;
  intro: Share<IntroStyle>;
  format: Share<BodyFormat>;
  conclusion: Share<ConclusionStyle>;
  points: number;
  headings: { label: string; share: number }[];
  features: Record<FeatureKey, number>;
  // The most used diagram kind, and how many answers used any diagram.
  diagram: Share<DiagramKind>;
};

// A blueprint needs at least this many analysed answers.
export const MIN_BLUEPRINT_SAMPLES = 2;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mostCommon<T extends string>(values: T[], fallback: T): Share<T> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: Share<T> = { value: fallback, share: 0 };
  for (const [value, n] of counts) {
    if (n / values.length > best.share) best = { value, share: n / values.length };
  }
  return best;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const normLabel = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/&-]/gu, "")
    .replace(/\s+/g, " ");

export function aggregateAnalyses(analyses: AnswerAnalysis[]): BlueprintStats {
  const n = analyses.length;
  const wordCounts = analyses.map((a) => a.word_count);
  const shareOf = (part: (a: AnswerAnalysis) => number) =>
    round2(median(analyses.map((a) => (a.word_count > 0 ? part(a) / a.word_count : 0))));

  const headingCounts = new Map<string, { label: string; n: number }>();
  for (const a of analyses) {
    const seen = new Set<string>();
    for (const h of a.body.headings) {
      const key = normLabel(h);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = headingCounts.get(key);
      if (cur) cur.n++;
      else headingCounts.set(key, { label: h.trim(), n: 1 });
    }
  }
  const headings = [...headingCounts.values()]
    // A dimension counts as a pattern when several answers cover it.
    .filter((h) => n === 1 || (h.n >= 2 && h.n / n >= 0.4))
    .map((h) => ({ label: h.label, share: round2(h.n / n) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  const diagrams = analyses.map((a) => a.diagram).filter((d) => d !== "none");
  const diagramKind = mostCommon(diagrams, "none" as DiagramKind).value;

  const features = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, round2(analyses.filter((a) => a.features[k]).length / n)]),
  ) as Record<FeatureKey, number>;

  const roundShare = <T>(s: Share<T>): Share<T> => ({ value: s.value, share: round2(s.share) });
  return {
    samples: n,
    words: {
      median: Math.round(median(wordCounts)),
      min: Math.min(...wordCounts),
      max: Math.max(...wordCounts),
    },
    intro_share: shareOf((a) => a.intro.words),
    conclusion_share: shareOf((a) => a.conclusion.words),
    intro: roundShare(
      mostCommon(
        analyses.map((a) => a.intro.style),
        "none",
      ),
    ),
    format: roundShare(
      mostCommon(
        analyses.map((a) => a.body.format),
        "points",
      ),
    ),
    conclusion: roundShare(
      mostCommon(
        analyses.map((a) => a.conclusion.style),
        "none",
      ),
    ),
    points: Math.round(median(analyses.map((a) => a.body.points))),
    headings,
    features,
    diagram: { value: diagramKind, share: round2(diagrams.length / n) },
  };
}

export type Confidence = "starting" | "growing" | "reliable";

export function blueprintConfidence(samples: number): Confidence {
  return samples >= 10 ? "reliable" : samples >= 4 ? "growing" : "starting";
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

// Words for an introduction or conclusion. Capped at a quarter of the answer so
// a miscounted analysis can't squeeze the body.
function budget(wordLimit: number, share: number, min: number): number {
  return Math.max(min, Math.round((wordLimit * Math.min(share, 0.25)) / 5) * 5);
}

// Turns blueprint numbers into the instructions SAATHI follows. Admins can edit
// the result; an edited guide is kept until they choose to rebuild it.
export function renderBlueprintGuide(opts: {
  marks: number;
  wordLimit: number;
  directive: BlueprintDirective;
  stats: BlueprintStats;
  tips: string[];
}): string {
  const { marks, wordLimit, stats, tips } = opts;
  const lines: string[] = [
    `Learned from ${stats.samples} model answer${stats.samples === 1 ? "" : "s"} (${marks} marks, ${DIRECTIVE_LABELS[opts.directive]}; they average ${stats.words.median} words).`,
  ];

  if (wordLimit <= 30) {
    lines.push(
      `- Write 1–2 crisp sentences (about ${wordLimit} words) with the key fact. No introduction or conclusion.`,
    );
  } else {
    const usesIntro = stats.intro.value !== "none" && stats.intro_share > 0;
    const usesConclusion = stats.conclusion.value !== "none" && stats.conclusion_share > 0;
    const introWords = usesIntro ? budget(wordLimit, stats.intro_share, 10) : 0;
    const conclusionWords = usesConclusion ? budget(wordLimit, stats.conclusion_share, 10) : 0;
    const bodyWords = Math.max(10, wordLimit - introWords - conclusionWords);
    let step = 1;
    if (usesIntro) {
      lines.push(
        `${step++}. Introduction (~${introWords} words): ${INTRO_TEXT[stats.intro.value]}.`,
      );
    }
    const headingText =
      stats.headings.length > 0 && stats.format.value !== "points"
        ? `, typically covering ${stats.headings.map((h) => h.label).join(" / ")}`
        : stats.headings.length > 0
          ? ` covering dimensions such as ${stats.headings.map((h) => h.label).join(" / ")}`
          : "";
    lines.push(
      `${step++}. Body (~${bodyWords} words): about ${Math.max(2, stats.points)} points ${FORMAT_TEXT[stats.format.value]}${headingText}.`,
    );
    if (usesConclusion) {
      lines.push(
        `${step++}. Conclusion (~${conclusionWords} words): ${CONCLUSION_TEXT[stats.conclusion.value]}.`,
      );
    }
  }

  const always = FEATURE_KEYS.filter((k) => stats.features[k] >= 0.5);
  const sometimes = FEATURE_KEYS.filter(
    (k) => stats.features[k] >= 0.25 && stats.features[k] < 0.5,
  );
  if (always.length) {
    lines.push(
      `- Include ${always.map((k) => `${FEATURE_TEXT[k]} (${pct(stats.features[k])} of model answers)`).join("; ")}.`,
    );
  }
  if (sometimes.length) {
    lines.push(
      `- Add ${sometimes.map((k) => FEATURE_TEXT[k]).join(", ")} when the material has them.`,
    );
  }
  if (stats.diagram.value !== "none" && stats.diagram.share >= 0.3) {
    lines.push(
      `- Add ${DIAGRAM_TEXT[stats.diagram.value]} where it helps (${pct(stats.diagram.share)} of model answers have one).`,
    );
  }
  if (tips.length) {
    lines.push("", "What the best answers do:", ...tips.map((t) => `- ${t}`));
  }
  return lines.join("\n");
}

// Structure for marks bands with no learned blueprint yet.
export function defaultGuide(marks: number, wordLimit: number): string {
  if (wordLimit <= 30) {
    return `- Write 1–2 crisp sentences (about ${wordLimit} words) with the key fact. No introduction or conclusion.`;
  }
  if (wordLimit <= 70) {
    return [
      `- One line of context or definition, then 3–4 short points with the key facts (about ${wordLimit} words in all).`,
      "- No separate conclusion needed; end on the most important point.",
      "- Use Rajasthan-specific facts or examples when the material has them.",
    ].join("\n");
  }
  const intro = budget(wordLimit, 0.12, 10);
  const conclusion = budget(wordLimit, 0.12, 10);
  return [
    `1. Introduction (~${intro} words): define the key term or set the context in a line.`,
    `2. Body (~${wordLimit - intro - conclusion} words): ${marks >= 15 ? "6–8" : "4–6"} points, grouped under bold sub-headings when the question has several parts or dimensions.`,
    `3. Conclusion (~${conclusion} words): a forward-looking way ahead or the significance.`,
    "- Use Rajasthan-specific facts, data, schemes and examples whenever the material has them.",
  ].join("\n");
}

// ---------- Tips from many answers ----------

export function tipsMessages(strengths: string[]): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        'You coach students writing RAS Mains answers. Merge these notes about what made model answers score well into 3 to 6 short, distinct, imperative tips about structure and presentation (no topic facts), most common first, in English, under 18 words each. Reply with a JSON array of strings only, e.g. ["Start with ...", "Use ..."].',
    },
    { role: "user", content: strengths.map((s) => `- ${s}`).join("\n") },
  ];
}

export function parseTips(raw: string): string[] {
  return cleanList(parseJsonLoose<unknown[]>(raw), 6, 200);
}

// The most repeated notes, used when merging them with the model fails.
export function fallbackTips(strengths: string[]): string[] {
  const counts = new Map<string, { text: string; n: number }>();
  for (const s of strengths) {
    const key = normLabel(s);
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.n++;
    else counts.set(key, { text: s.trim(), n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((c) => c.text);
}

// ---------- Writing an answer ----------

export type MainsBlueprint = {
  id: string | null;
  marks: number;
  directive: BlueprintDirective;
  version: number;
  guide: string;
  sample_count: number;
};

export type MainsExemplar = {
  id: string;
  question: string;
  answer: string;
  marks: number;
  directive: string;
  year: number | null;
  paper: string | null;
  similarity: number;
};

// A previous-year question that matches the student's question.
export type MainsPyq = {
  question: string;
  year: number | null;
  paper: string | null;
  marks: number;
  similarity: number;
};

export type MainsInfo = {
  marks: number;
  wordLimit: number;
  directive: MainsDirective;
  // null when SAATHI used the built-in structure (no blueprint learned yet).
  blueprint: { version: number; samples: number; directive: BlueprintDirective } | null;
  exemplars: number;
  // Only when and where it was asked; the stored question stays admin-only.
  pyq: Pick<MainsPyq, "year" | "paper" | "marks"> | null;
  words?: number;
};

export type MainsPlan = {
  query: SaathiQuery;
  matches: SaathiMatch[];
  candidates: SaathiMatch[];
  marks: number;
  wordLimit: number;
  directive: MainsDirective;
  blueprint: MainsBlueprint | null;
  exemplars: MainsExemplar[];
  pyq: MainsPyq | null;
};

// Similarity above which a model answer's question counts as the same question.
export const PYQ_MATCH_SIMILARITY = 0.88;
export const MAINS_EXEMPLARS = 2;

type MainsContext = {
  word_limit: number | null;
  blueprint: MainsBlueprint | null;
  exemplars: MainsExemplar[] | null;
  pyq: MainsPyq | null;
};

// Word limit, blueprint, closest model answers and any matching previous-year
// question, in one database call. Falls back to built-in defaults if the
// answer-writing migration hasn't been applied.
export async function saathiMainsContext(
  rpc: SaathiRpc,
  marks: number,
  directive: MainsDirective,
  embedding: number[],
): Promise<MainsContext> {
  const res = await rpc("saathi_mains_context", {
    p_marks: marks,
    p_directive: directive,
    p_embedding: embedding,
    p_count: MAINS_EXEMPLARS,
  });
  if (res.error) {
    if (res.error.code === "PGRST202" || res.error.code === "42P01") {
      return { word_limit: null, blueprint: null, exemplars: [], pyq: null };
    }
    throw new Error(res.error.message);
  }
  return (res.data ?? {}) as MainsContext;
}

// The whole preparation for a descriptive answer: search the knowledge base
// (more material than a chat answer), detect the question type and pick the
// blueprint and example answers.
export async function saathiMainsPlan(opts: {
  apiKey: string;
  rpc: SaathiRpc;
  history: SaathiTurn[];
  question: string;
  subjects: string[] | null;
  marks?: number | null;
  query?: SaathiQuery;
  // Model answers excluded from examples (used when scoring a held-out answer).
  excludeAnswerId?: string;
}): Promise<MainsPlan> {
  const query = opts.query ?? (await saathiPrepareQuery(opts.apiKey, opts.history, opts.question));
  const marks = opts.marks ?? detectMarks(opts.question) ?? DEFAULT_MAINS_MARKS;
  const directive =
    detectDirective(query.standalone) ??
    (query.english ? detectDirective(query.english) : null) ??
    detectDirective(opts.question) ??
    "explain";
  const embeddings = await saathiEmbedQuery(opts.apiKey, query);
  const [retrieval, context] = await Promise.all([
    saathiRetrieve({
      apiKey: opts.apiKey,
      rpc: opts.rpc,
      history: opts.history,
      question: opts.question,
      subjects: opts.subjects,
      query,
      embeddings,
      keep: marks >= 10 ? 8 : 6,
    }),
    saathiMainsContext(opts.rpc, marks, directive, embeddings[0]),
  ]);
  const pyq = context.pyq && context.pyq.similarity >= PYQ_MATCH_SIMILARITY ? context.pyq : null;
  return {
    query,
    matches: retrieval.matches,
    candidates: retrieval.candidates,
    marks,
    wordLimit: context.word_limit ?? defaultWordLimit(marks),
    directive,
    blueprint: context.blueprint ?? null,
    exemplars: (context.exemplars ?? []).filter((e) => e.id !== opts.excludeAnswerId),
    pyq,
  };
}

export function mainsInfo(plan: MainsPlan, answer?: string): MainsInfo {
  return {
    marks: plan.marks,
    wordLimit: plan.wordLimit,
    directive: plan.directive,
    blueprint: plan.blueprint
      ? {
          version: plan.blueprint.version,
          samples: plan.blueprint.sample_count,
          directive: plan.blueprint.directive,
        }
      : null,
    exemplars: plan.exemplars.length,
    pyq: plan.pyq
      ? {
          year: plan.pyq.year,
          paper: plan.pyq.paper,
          marks: plan.pyq.marks,
        }
      : null,
    ...(answer !== undefined ? { words: countWords(answer) } : {}),
  };
}

const MAINS_FORMAT: Record<SaathiChannel, string> = {
  web: `FORMAT: Markdown. Use **bold** sub-headings and short bullet points as the structure asks. Use a Markdown table for comparisons. Only when the structure asks for a flowchart or diagram, you may add one small \`\`\`mermaid block using "flowchart TD" with short, double-quoted node labels (it does not count towards the word limit).`,
  telegram: `FORMAT: For a Telegram chat. Use **bold** for sub-headings and key terms, "- " bullet points, and blank lines between parts. No Markdown tables, # headings, code blocks or diagrams.`,
};

export function mainsSystemPrompt(channel: SaathiChannel, plan: MainsPlan): string {
  const guide = plan.blueprint?.guide?.trim() || defaultGuide(plan.marks, plan.wordLimit);
  const examples = plan.exemplars.length
    ? `\n\nEXAMPLE ANSWERS: The model answers from previous years given with the question show the expected structure, depth and style. Learn from how they are organised. Do not copy their sentences, and do not take facts from them unless the study material states the same facts.`
    : "";
  return `You are SAATHI, an answer-writing coach for students preparing for the RAS (Rajasthan Administrative Service) Mains exam. Write the answer a top-scoring student would write in the exam.

FACTS: Use ONLY facts from the study material provided with the question. Do not use outside knowledge and do not guess. If the material does not cover the question at all, begin your reply with the exact token ${SAATHI_NO_ANSWER_MARKER} and then, in one or two short sentences, say that this topic isn't in the study material yet. If it covers only part of the question, write the best answer the material supports, then add a final line starting with "Note:" that says what is not covered.

QUESTION: ${plan.marks} marks, about ${plan.wordLimit} words. ${DIRECTIVE_HINTS[plan.directive]}

STRUCTURE TO FOLLOW:
${guide}

LENGTH: Stay within about 10% of ${plan.wordLimit} words. Do not repeat the question, and do not state the marks or the word count.${examples}

LANGUAGE: Write in the same language and script as the question: Hindi in Devanagari gets Hindi in Devanagari, English gets English, Hinglish gets Hindi in Devanagari. Translate the material faithfully when it is in another language. In Hindi answers, use the standard Hindi terms used in RAS and other Indian competitive exams. Keep names, article numbers, dates and figures exactly as in the material.

${MAINS_FORMAT[channel]}

Do not add source citations; the app shows the sources separately.`;
}

export function mainsMessages(opts: {
  channel: SaathiChannel;
  history: SaathiTurn[];
  question: string;
  plan: MainsPlan;
}): ChatMessage[] {
  const material = opts.plan.matches
    .map(
      (m, i) =>
        `[Material ${i + 1}] ${m.source_file || m.title} (${[m.subject, m.topic].filter(Boolean).join(" › ")})\n${m.content}`,
    )
    .join("\n\n---\n\n");
  const examples = opts.plan.exemplars
    .map((e, i) => {
      const label = [
        e.year ? `RAS ${e.year}` : null,
        e.paper ? `Paper ${e.paper}` : null,
        `${e.marks} marks`,
      ]
        .filter(Boolean)
        .join(", ");
      return `[Example ${i + 1}] (${label})\nQuestion: ${e.question}\nModel answer:\n${e.answer.slice(0, 3000)}`;
    })
    .join("\n\n---\n\n");
  return [
    { role: "system", content: mainsSystemPrompt(opts.channel, opts.plan) },
    ...opts.history,
    {
      role: "user",
      content: `Study material:\n\n${material}\n\n---\n\n${examples ? `Example answers (structure and style only):\n\n${examples}\n\n---\n\n` : ""}Write the answer (${opts.plan.marks} marks, about ${opts.plan.wordLimit} words) to: ${opts.question}`,
    },
  ];
}

export function mainsNoMaterialReply(question: string): string {
  return questionLanguage(question) === "Hindi"
    ? "इस प्रश्न का उत्तर लिखने के लिए अभी अध्ययन सामग्री उपलब्ध नहीं है। कृपया कोई दूसरा प्रश्न पूछें।"
    : "I don't have study material to write this answer yet. Try another question.";
}

// ---------- Scoring an answer against a model answer ----------

export const SCORE_KEYS = ["structure", "coverage", "specificity", "presentation"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export type MainsScore = Record<ScoreKey | "length", number> & {
  // 0–100, the average of all criteria.
  total: number;
  feedback: string;
};

export function judgeMessages(opts: {
  question: string;
  marks: number;
  wordLimit: number;
  modelAnswer: string;
  answer: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are a strict RAS Mains examiner. Compare a candidate's answer with the model answer for the same question and score the candidate from 0 to 10 on each criterion:
- "structure": follows a clear exam structure suited to the question (introduction, organised body, conclusion where expected) like the model answer.
- "coverage": covers the key points and dimensions of the model answer.
- "specificity": uses concrete facts, data, Rajasthan-specific content, schemes or articles where the model answer does.
- "presentation": readable, concise, well-formatted points or sub-headings, no filler.
Reply with JSON only: {"structure": n, "coverage": n, "specificity": n, "presentation": n, "feedback": "one or two sentences on the biggest improvement, in English"}`,
    },
    {
      role: "user",
      content: `Question (${opts.marks} marks, about ${opts.wordLimit} words): ${opts.question}\n\nModel answer:\n${opts.modelAnswer.slice(0, 8000)}\n\n---\n\nCandidate's answer:\n${opts.answer.slice(0, 8000)}`,
    },
  ];
}

// Full marks within 10% of the limit, falling to zero at double or half length.
export function lengthScore(words: number, wordLimit: number): number {
  if (wordLimit <= 0 || words <= 0) return 0;
  const r = words / wordLimit;
  const score = r > 1.1 ? (10 * (2 - r)) / 0.9 : r < 0.9 ? (10 * (r - 0.5)) / 0.4 : 10;
  return Math.max(0, Math.round(score * 10) / 10);
}

export function parseJudge(raw: string, words: number, wordLimit: number): MainsScore | null {
  const o = parseJsonLoose<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const score = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 10) / 10)) : null;
  };
  const parts = SCORE_KEYS.map((k) => score(o[k]));
  if (parts.some((p) => p === null)) return null;
  const length = lengthScore(words, wordLimit);
  const all = [...(parts as number[]), length];
  const result = Object.fromEntries(SCORE_KEYS.map((k, i) => [k, parts[i]])) as Record<
    ScoreKey,
    number
  >;
  return {
    ...result,
    length,
    total: Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10),
    feedback: String(o.feedback ?? "")
      .trim()
      .slice(0, 500),
  };
}
