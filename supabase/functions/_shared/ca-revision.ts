// Revision in the students' daily quiz: questions a student got wrong come
// back a few days later (and once more after getting them right), the
// monthly practice set goes out a few questions a day once the monthly is
// posted, and the month's one-liners come as a short card before the quiz.
// Pure helpers shared by the bot (Deno) and tests; no network or database.
import type { Bi, QuizLang, QuizMcq } from "./ca-quiz.ts";

// Per quiz: missed questions brought back, practice set questions, one-liners.
export const REVISION_MAX = 3;
export const PRACTICE_PER_DAY = 2;
export const ONELINERS_PER_DAY = 5;
// Days until a missed question comes back: after the miss, then after
// getting it right once. Right twice: learnt.
export const REVISION_GAPS = [3, 7];

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A question's key: the same question is one card wherever it came from.
export function questionKey(m: QuizMcq): string {
  const s = (m.question?.en || m.question?.hi || "").replace(/\s+/g, " ").trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `q${h.toString(36)}${s.length.toString(36)}`;
}

// What an answer does to the student's card: kept (with when it comes
// back), dropped (learnt), or nothing (right the first time).
export type CardChange = { action: "save"; box: number; due: string } | { action: "drop" } | { action: "none" };
export function afterAnswer(
  card: { box: number } | null,
  correct: boolean,
  today: string,
): CardChange {
  if (!correct) return { action: "save", box: 0, due: addDays(today, REVISION_GAPS[0]) };
  if (!card) return { action: "none" };
  const box = card.box + 1;
  return box >= REVISION_GAPS.length
    ? { action: "drop" }
    : { action: "save", box, due: addDays(today, REVISION_GAPS[box]) };
}

// A practice set question as a quiz MCQ: its statements, lists or
// assertion and reason under the question.
export type PracticeLike = { question: Bi; extra?: Bi; options: Bi[]; answer: number; explanation?: Bi };
export function practiceMcq(q: PracticeLike): QuizMcq | null {
  if (!Array.isArray(q?.options) || q.options.length !== 4) return null;
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return null;
  const join = (a: string, b: string | undefined) => (b?.trim() ? `${a}\n${b.trim()}` : a);
  const question = { en: join(q.question?.en ?? "", q.extra?.en), hi: join(q.question?.hi ?? "", q.extra?.hi) };
  if (!question.en.trim() && !question.hi.trim()) return null;
  return { question, options: q.options, answer: q.answer, explanation: q.explanation ?? { en: "", hi: "" } };
}

// Where the student is in the posted monthly's practice set and one-liners.
export type RevisionState = { month: string; practice_next: number; lines_next: number };
export function monthState(s: RevisionState | null | undefined, month: string): RevisionState {
  return s && s.month === month ? s : { month, practice_next: 0, lines_next: 0 };
}
// The next `n` of `total`, from where the student is.
export function nextSlice(from: number, total: number, n: number): number[] {
  const out: number[] = [];
  for (let i = from; i < total && out.length < n; i++) out.push(i);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = (b: Bi, lang: QuizLang) => (lang === "hi" ? b.hi || b.en : b.en || b.hi);

// The one-liners card before the quiz.
export function onelinerCard(lines: { text: Bi }[], monthLabel: string, lang?: QuizLang): string {
  const head =
    lang === "hi"
      ? `⚡ <b>एक मिनट में दोहराएँ</b> · ${monthLabel} के वन-लाइनर`
      : lang === "en"
        ? `⚡ <b>Revise in a minute</b> · ${monthLabel} in one-liners`
        : `⚡ <b>एक मिनट में दोहराएँ | Revise in a minute</b> · ${monthLabel}`;
  const body = lines.map((l) => {
    if (lang) return `• ${esc(pick(l.text, lang))}`;
    const hi = l.text.hi?.trim();
    const en = l.text.en?.trim();
    return hi && en && hi !== en ? `• ${esc(hi)}\n  <i>${esc(en)}</i>` : `• ${esc(hi || en || "")}`;
  });
  return `${head}\n\n${body.join("\n")}`;
}

// The heading before each group of polls.
export function groupHeading(kind: "revision" | "practice", lang?: QuizLang): string {
  if (kind === "revision")
    return lang === "hi"
      ? "🔁 <b>दोहराएँ</b> · जिन प्रश्नों के उत्तर पहले गलत हुए थे"
      : lang === "en"
        ? "🔁 <b>Revision</b> · questions you got wrong earlier"
        : "🔁 <b>दोहराएँ | Revision</b> · पहले गलत हुए प्रश्न / questions you got wrong earlier";
  return lang === "hi"
    ? "📘 <b>मासिक अभ्यास</b> · परीक्षा पैटर्न के प्रश्न"
    : lang === "en"
      ? "📘 <b>Monthly practice</b> · exam-pattern questions"
      : "📘 <b>मासिक अभ्यास | Monthly practice</b> · exam-pattern questions";
}

// The line under the result about the questions that come back.
export function comeBackLine(missed: number, lang?: QuizLang): string {
  if (!missed) return "";
  const days = REVISION_GAPS[0];
  return lang === "hi"
    ? `\n🔁 गलत हुए ${missed} प्रश्न ${days} दिन बाद दोहराने के लिए फिर आएँगे।`
    : `\n🔁 The ${missed} you missed come back in ${days} days to revise.`;
}

export function monthLabel(month: string, lang?: QuizLang): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
