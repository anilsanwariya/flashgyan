// SAATHI checks a student's RAS Mains answer: reads handwritten photos into
// text, then marks the answer like an RPSC examiner against the study material
// on the question (and the structure learned from model answers). Shared by the
// website and the Telegram bot; prompts, parsing and text only, no network.
import {
  SAATHI_NO_ANSWER_MARKER,
  matchLabel,
  questionLanguage,
  saathiComplete,
  type ChatMessage,
  type SaathiImage,
  type SaathiRpc,
} from "./saathi-core.ts";
import { DIRECTIVE_LABELS, countWords, saathiMainsPlan, type MainsPlan } from "./saathi-mains.ts";
import { syllabusUnit } from "./ras-syllabus.ts";

// Checks a student gets per day, on the website and in the bot.
export const CHECK_DAILY_LIMIT = 3;
// Photos (pages) of one handwritten answer.
export const CHECK_MAX_PHOTOS = 3;
// Shortest answer worth checking, in words.
export const CHECK_MIN_WORDS = 15;

// ---------- Reading handwritten photos ----------

export const READ_PHOTOS_PROMPT = `These photos are the pages, in order, of a student's handwritten answer for the RAS Mains exam, in Hindi or English. Write out exactly what is written, word for word, in the language and script used (Hindi in Devanagari). Keep the student's headings, numbering and bullet points on their own lines, and their spelling mistakes too. Do not correct, improve, summarise or add anything. Mark a word you cannot read as [?]. Leave out the question if it is written at the top, page numbers, and anything crossed out. If a diagram or flowchart is drawn, write [Diagram: …] with its labels.
If the photos do not show a handwritten answer, or are too blurred to read, reply with exactly: UNREADABLE`;

export function readPhotosMessages(): ChatMessage[] {
  return [{ role: "user", content: READ_PHOTOS_PROMPT }];
}

// The transcribed answer, or null when the photos could not be read.
export function parseReadPhotos(raw: string): string | null {
  const text = raw.trim();
  if (!text || /^UNREADABLE\b/i.test(text)) return null;
  // More than a third of the words unreadable is not worth checking.
  const words = text.split(/\s+/).filter(Boolean);
  const unread = words.filter((w) => w.includes("[?]")).length;
  return words.length && unread / words.length > 0.33 ? null : text;
}

// ---------- Marking ----------

export const CHECK_CRITERIA = ["content", "structure", "specificity", "presentation"] as const;
export type CheckCriterion = (typeof CHECK_CRITERIA)[number];

export type CheckResult = {
  // Marks the answer would get, out of the question's marks (half marks allowed).
  awarded: number;
  outOf: number;
  // Each criterion 0-10.
  scores: Record<CheckCriterion, number>;
  words: number;
  wordLimit: number;
  // One line on the answer as a whole.
  verdict: string;
  strengths: string[];
  // Points from the study material the answer should have made.
  missing: string[];
  // Concrete changes, most important first.
  improve: string[];
  // Feedback language: the answer's own.
  language: "Hindi" | "English";
  // True when the study material did not cover the question; marked on general
  // exam standards only.
  noMaterial: boolean;
};

export const CRITERIA_LABELS: Record<CheckCriterion, { en: string; hi: string }> = {
  content: { en: "Content", hi: "विषय-वस्तु" },
  structure: { en: "Structure", hi: "संरचना" },
  specificity: { en: "Facts & examples", hi: "तथ्य व उदाहरण" },
  presentation: { en: "Presentation", hi: "प्रस्तुति" },
};

export function checkMessages(opts: {
  question: string;
  answer: string;
  plan: MainsPlan;
}): ChatMessage[] {
  const { plan } = opts;
  const unit = syllabusUnit(plan.topic?.unit_id);
  const words = countWords(opts.answer);
  const language = questionLanguage(opts.answer);
  const material = plan.matches
    .map((m, i) => `[Material ${i + 1}] ${matchLabel(m)}\n${m.content}`)
    .join("\n\n---\n\n");
  const example = plan.exemplars[0]
    ? `\n\nA model answer to a similar question (for structure and depth only):\n${plan.exemplars[0].answer.slice(0, 2500)}`
    : "";
  const structure = plan.blueprint?.guide?.trim();
  return [
    {
      role: "system",
      content: `You are an experienced RPSC examiner checking a candidate's RAS Mains answer, and a coach who tells them exactly how to improve. Mark strictly but fairly, as RPSC does: an average answer gets about 40-50% of the marks, a good one 55-65%, and above 70% only an excellent answer.

QUESTION: ${plan.marks} marks, word limit about ${plan.wordLimit} words (the 2026 RAS Mains pattern: 5 marks in 50 words, 10 marks in 150 words). Directive: ${DIRECTIVE_LABELS[plan.directive]}.${
        unit && plan.topic
          ? ` Syllabus: Paper ${unit.paper}, Unit ${unit.unit} (${unit.title}) › ${plan.topic.part}: ${plan.topic.topic}. In this unit good answers: ${unit.hint}`
          : ""
      }${structure ? `\nExpected structure (learned from model answers):\n${structure}` : ""}

Score each criterion from 0 to 10:
- "content": answers what the directive asks and covers the key points of the study material.
- "structure": introduction, organised body and conclusion as this kind of question needs.
- "specificity": exact facts, articles, data, schemes, examples, with Rajasthan where relevant.
- "presentation": clear, concise points or sub-headings, within the word limit (the answer has ${words} words), no filler.
Then give "awarded": the marks out of ${plan.marks} (a multiple of 0.5) an RPSC examiner would give. Going well over the word limit loses marks.

Judge facts against the study material: name in "missing" the important points from the material the answer leaves out (at most 4, each a short phrase with the exact fact), and point out any fact in the answer that contradicts the material. Do not reward or demand facts that are not in the material. If the material does not cover the question at all, begin your reply with ${SAATHI_NO_ANSWER_MARKER} and still mark on general exam standards, leaving "missing" empty.

Write all feedback in ${language === "Hindi" ? "Hindi (Devanagari), using the standard Hindi terms of RAS exams" : "English"}, addressed to the student ("you"), short and specific.
Reply with JSON only: {"content": n, "structure": n, "specificity": n, "presentation": n, "awarded": n, "verdict": "one sentence on the answer as a whole", "strengths": ["what is good", ...at most 3], "missing": ["missing point", ...], "improve": ["a concrete change, e.g. 'Start with a one-line definition of X'", ...at most 4]}`,
    },
    {
      role: "user",
      content: `Study material on the question:\n\n${material || "(none)"}${example}\n\n---\n\nQuestion: ${opts.question}\n\nCandidate's answer:\n${opts.answer.slice(0, 12_000)}`,
    },
  ];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 400))
    .filter(Boolean)
    .slice(0, n);

export function parseCheck(
  raw: string,
  opts: { answer: string; marks: number; wordLimit: number },
): CheckResult | null {
  const noMaterial = raw.trimStart().startsWith(SAATHI_NO_ANSWER_MARKER);
  const text = raw.replace(SAATHI_NO_ANSWER_MARKER, "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const score = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 10) / 10)) : null;
  };
  const raw4 = CHECK_CRITERIA.map((k) => score(o[k]));
  if (raw4.some((p) => p === null)) return null;
  const parts = raw4 as number[];
  const scores = Object.fromEntries(CHECK_CRITERIA.map((k, i) => [k, parts[i]])) as Record<
    CheckCriterion,
    number
  >;
  // The examiner's marks; if missing, from the criteria average.
  const given = Number(o.awarded);
  const average = parts.reduce((a, b) => a + b, 0) / parts.length / 10;
  const awarded = Math.min(
    opts.marks,
    Math.max(0, Math.round((Number.isFinite(given) ? given : average * opts.marks) * 2) / 2),
  );
  return {
    awarded,
    outOf: opts.marks,
    scores,
    words: countWords(opts.answer),
    wordLimit: opts.wordLimit,
    verdict: str(o.verdict, 400),
    strengths: list(o.strengths, 3),
    missing: noMaterial ? [] : list(o.missing, 4),
    improve: list(o.improve, 4),
    language: questionLanguage(opts.answer),
    noMaterial,
  };
}

// ---------- Running a check ----------

export type CheckOutcome =
  | { ok: true; result: CheckResult; transcript: string | null }
  | { ok: false; reason: "unreadable" | "too_short" | "failed"; transcript: string | null };

// Reads the photos (if any), finds the study material on the question, and
// marks the answer. Typed text and photos may be combined (text first).
export async function checkAnswer(opts: {
  apiKey: string;
  rpc: SaathiRpc;
  question: string;
  marks: number | null;
  answer?: string;
  images?: SaathiImage[];
  signal?: AbortSignal;
  // Progress, for showing what is happening during the minute a check takes.
  onStage?: (stage: "reading" | "checking") => void;
}): Promise<CheckOutcome> {
  let transcript: string | null = null;
  if (opts.images?.length) {
    opts.onStage?.("reading");
    transcript = parseReadPhotos(
      await saathiComplete(opts.apiKey, readPhotosMessages(), opts.signal, opts.images),
    );
    if (!transcript) return { ok: false, reason: "unreadable", transcript: null };
  }
  const answer = [opts.answer?.trim(), transcript].filter(Boolean).join("\n\n");
  if (countWords(answer) < CHECK_MIN_WORDS) return { ok: false, reason: "too_short", transcript };
  opts.onStage?.("checking");
  const plan = await saathiMainsPlan({
    apiKey: opts.apiKey,
    rpc: opts.rpc,
    history: [],
    question: opts.question,
    subjects: null,
    marks: opts.marks,
  });
  const messages = checkMessages({ question: opts.question, answer, plan });
  const parse = (raw: string) =>
    parseCheck(raw, { answer, marks: plan.marks, wordLimit: plan.wordLimit });
  // One retry when the reply can't be read.
  const result =
    parse(await saathiComplete(opts.apiKey, messages, opts.signal)) ??
    parse(await saathiComplete(opts.apiKey, messages, opts.signal));
  return result ? { ok: true, result, transcript } : { ok: false, reason: "failed", transcript };
}

// The daily allowance: one counter per student per India date.
export function checkCounterKey(who: string, now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return `check:${who}:${ist}`;
}

// ---------- Showing the result ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Word count against the limit: within 10% is fine.
export function lengthNote(words: number, limit: number, hindi: boolean): string {
  if (words > limit * 1.25)
    return hindi
      ? `${words} शब्द, सीमा ${limit} से काफ़ी अधिक; अंक कटेंगे`
      : `${words} words, well over the ${limit}-word limit; this loses marks`;
  if (words < limit * 0.6)
    return hindi
      ? `${words} शब्द, ${limit} की सीमा के लिए कम`
      : `${words} words, short for ${limit}`;
  return hindi ? `${words} शब्द (सीमा ${limit})` : `${words} words (limit ${limit})`;
}

export function checkResultTelegram(
  r: CheckResult,
  opts: { left: number; transcribed: boolean },
): string {
  const hi = r.language === "Hindi";
  const bar = (n: number) => "●".repeat(Math.round(n / 2)) + "○".repeat(5 - Math.round(n / 2));
  const lines = [
    `📝 <b>${hi ? "आपके अंक" : "Your marks"}: ${r.awarded} / ${r.outOf}</b>`,
    `<i>${esc(r.verdict)}</i>`,
    "",
    ...CHECK_CRITERIA.map(
      (k) =>
        `${bar(r.scores[k])} ${hi ? CRITERIA_LABELS[k].hi : CRITERIA_LABELS[k].en} ${r.scores[k]}/10`,
    ),
    `📏 ${lengthNote(r.words, r.wordLimit, hi)}`,
  ];
  if (r.strengths.length)
    lines.push(
      "",
      `✅ <b>${hi ? "अच्छा है" : "Good"}</b>`,
      ...r.strengths.map((s) => `• ${esc(s)}`),
    );
  if (r.missing.length)
    lines.push(
      "",
      `📚 <b>${hi ? "छूटे हुए बिंदु (आपकी पुस्तकों से)" : "Missing points (from your books)"}</b>`,
      ...r.missing.map((s) => `• ${esc(s)}`),
    );
  if (r.improve.length)
    lines.push(
      "",
      `🎯 <b>${hi ? "सुधार कैसे करें" : "How to improve"}</b>`,
      ...r.improve.map((s) => `• ${esc(s)}`),
    );
  if (r.noMaterial)
    lines.push(
      "",
      `<i>${hi ? "इस प्रश्न की अध्ययन सामग्री अभी उपलब्ध नहीं है; जाँच सामान्य परीक्षा मानकों पर की गई है।" : "This topic isn't in the study material yet, so the answer was marked on general exam standards."}</i>`,
    );
  if (opts.transcribed)
    lines.push(
      "",
      `<i>${hi ? "हस्तलिखित उत्तर पढ़कर जाँचा गया; ऊपर देखें कि क्या पढ़ा गया।" : "Checked from your handwriting; see above what was read."}</i>`,
    );
  lines.push(
    "",
    hi
      ? `आज ${opts.left} जाँच शेष। नया उत्तर: /check`
      : `${opts.left} check${opts.left === 1 ? "" : "s"} left today. Check another: /check`,
  );
  return lines.join("\n");
}
