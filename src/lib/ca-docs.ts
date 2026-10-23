// Official documents for the monthly magazine: government reports, gazettes,
// surveys and releases. They are read into new stories (filed under the
// date they are about), additions to stories already written (the editor
// approves each), corrections, and, for a report, an index or a survey, a
// page in "Reports & documents of the month". Pure helpers: types, prompts
// and parsers; no network here.
import { hindiGuide, type GlossaryEntry } from "../../supabase/functions/_shared/ca-hindi.ts";
import { quoteInSource, type Bi, type CaFact, type CaMcq } from "@/lib/current-affairs";

type ChatMessage = { role: "system" | "user"; content: string };

// A finding of a report, with the words that state it.
export type DocNote = { text: string; quote: string };

// A report's page in the monthly magazine.
export type CaReport = {
  // The document it was written from.
  source_id: string;
  name: Bi;
  released_by: Bi;
  // The date it was released (or is about).
  date: string;
  // What the report is, in one or two sentences.
  what: Bi;
  // Its key findings, rankings and figures, one a line.
  findings: Bi[];
  // Rajasthan's place in it, when it says.
  rajasthan: Bi | null;
  mcqs: CaMcq[];
  // Printed in the monthly issue.
  included: boolean;
  created_at: string;
};

// The most findings kept from one document, and printed on its page.
export const MAX_DOC_NOTES = 60;
export const REPORT_FINDINGS_MAX = 10;

// A story's new facts are an addition only when they add this many.
export const MIN_ADDITION_FACTS = 1;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const bi = (v: unknown, max: number): Bi | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  const en = str(o.en, max);
  const hi = str(o.hi, max);
  return en && hi ? { en, hi } : null;
};

function parseJson<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

// The month a date is in ("2026-08-17" → "2026-08-01").
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

// The month's last day.
export function monthEnd(month: string): string {
  const d = new Date(`${monthOf(month)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// The name a document's stories print as their source.
export function docSourceName(name: string, releasedBy: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  const by = releasedBy.replace(/\s+/g, " ").trim();
  return (by && !n.toLowerCase().includes(by.toLowerCase()) ? `${n}, ${by}` : n).slice(0, 120);
}

// A line of the editor's focus for the readers ("Read only: …").
export function focusLine(focus: string | null | undefined): string {
  const f = (focus ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return f
    ? `\nThe editor wants only this part of the document: ${f}. Leave out anything else.`
    : "";
}

// ---------- A report's findings, part by part ----------

export function docNotesMessages(opts: {
  name: string;
  releasedBy: string;
  focus?: string | null;
  text: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You read an official document (a government report, index, survey, gazette or release) for a monthly current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains). Decide whether the document is a report, index, ranking, survey or official study whose own findings are exam material ("Which state ranked first in …?", "According to the … report …"); a plain release announcing a decision is not.
If it is, list the findings in this part that an exam could ask: headline numbers, rankings (first, last, India's or Rajasthan's place), targets, trends, definitions the report sets. Each finding is one short fact in English, with the exact words from the text that state it, copied character for character (5 to 30 words, in the text's language). Keep every number, name and date exactly.${focusLine(opts.focus)}
Reply with JSON only: {"report": true or false, "findings": [{"text": "...", "quote": "..."}]}. Reply {"report": false, "findings": []} if it is not a report.`,
    },
    {
      role: "user",
      content: `Document: ${opts.name}${opts.releasedBy ? ` (released by ${opts.releasedBy})` : ""}\n\n${opts.text}`,
    },
  ];
}

// The report's findings in this part, each found in the text.
export function parseDocNotes(raw: string, text: string): { report: boolean; notes: DocNote[] } {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return { report: false, notes: [] };
  const notes = (Array.isArray(o.findings) ? o.findings : [])
    .map((x) => {
      const f = (x ?? {}) as Record<string, unknown>;
      return { text: str(f.text, 400), quote: str(f.quote, 400) };
    })
    .filter((f) => f.text && f.quote && quoteInSource(f.quote, text));
  return { report: o.report === true && notes.length > 0, notes };
}

// Findings gathered so far and the new ones, without repeats, up to the most.
export function mergeNotes(had: DocNote[], fresh: DocNote[]): DocNote[] {
  const key = (n: DocNote) =>
    n.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const seen = new Set(had.map(key));
  const out = [...had];
  for (const n of fresh) {
    if (out.length >= MAX_DOC_NOTES) break;
    if (seen.has(key(n))) continue;
    seen.add(key(n));
    out.push(n);
  }
  return out;
}

// ---------- The report's page ----------

export function reportMessages(opts: {
  glossary?: GlossaryEntry[];
  name: string;
  releasedBy: string;
  date: string;
  notes: DocNote[];
  problem?: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write one page of "Reports & documents of the month" in a bilingual (Hindi and English) monthly current affairs magazine for Rajasthan competitive exam aspirants (RPSC and RSSB exams, with depth for RAS Mains), about the report given, using only its findings listed (never add numbers, ranks or dates that are not in them).
Write for revision: "what" is 1-2 sentences on what the report is and who released it; "findings" are the ${REPORT_FINDINGS_MAX} or fewer findings most likely to be asked, one short fact each, most important first; "rajasthan" is Rajasthan's place in the report when the findings state it, else null; "mcqs" are 2 or 3 RPSC-style questions on the findings, each with 4 options, the index of the correct one (0-3) and a one-line explanation.${hindiGuide(opts.glossary)}
Reply with JSON only: {"name": {"en": "...", "hi": "..."}, "released_by": {"en": "...", "hi": "..."}, "what": {"en": "...", "hi": "..."}, "findings": [{"en": "...", "hi": "..."}], "rajasthan": {"en": "...", "hi": "..."} or null, "mcqs": [{"question": {"en": "...", "hi": "..."}, "options": [{"en": "...", "hi": "..."}, ...4], "answer": 0, "explanation": {"en": "...", "hi": "..."}}]}`,
    },
    {
      role: "user",
      content: `Report: ${opts.name}${opts.releasedBy ? `\nReleased by: ${opts.releasedBy}` : ""}\nDate: ${opts.date}\n\nFindings:\n${opts.notes
        .map((n, i) => `${i + 1}. ${n.text} (“${n.quote}”)`)
        .join(
          "\n",
        )}${opts.problem ? `\n\nYour previous page was rejected: ${opts.problem} Fix it.` : ""}`,
    },
  ];
}

// Numbers in a text ("12.5", "2,000", "3rd" → "12.5", "2000", "3").
function numbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

export type ParsedReport =
  | {
      ok: true;
      report: Omit<CaReport, "source_id" | "date" | "included" | "created_at">;
    }
  | { ok: false; reason: string };

// The page, checked: every number in its English findings, Rajasthan line
// and questions is one the findings state.
// `about`: the report's name and date, whose numbers may be used too.
export function parseReport(raw: string, notes: DocNote[], about = ""): ParsedReport {
  const o = parseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o))
    return { ok: false, reason: "The AI's reply could not be read." };
  const name = bi(o.name, 200);
  const releasedBy = bi(o.released_by, 200) ?? { en: "", hi: "" };
  const what = bi(o.what, 600);
  const findings = (Array.isArray(o.findings) ? o.findings : [])
    .map((x) => bi(x, 400))
    .filter((x): x is Bi => x !== null)
    .slice(0, REPORT_FINDINGS_MAX);
  const rajasthan = o.rajasthan ? bi(o.rajasthan, 400) : null;
  const mcqs = (Array.isArray(o.mcqs) ? o.mcqs : [])
    .map((x) => {
      const m = (x ?? {}) as Record<string, unknown>;
      const question = bi(m.question, 400);
      const options = (Array.isArray(m.options) ? m.options : [])
        .map((p) => bi(p, 200))
        .filter((p): p is Bi => p !== null);
      const answer = Number(m.answer);
      const explanation = bi(m.explanation, 400) ?? { en: "", hi: "" };
      return question &&
        options.length === 4 &&
        Number.isInteger(answer) &&
        answer >= 0 &&
        answer < 4
        ? { question, options, answer, explanation }
        : null;
    })
    .filter((m): m is CaMcq => m !== null)
    .slice(0, 3);
  if (!name || !what || findings.length < 2)
    return { ok: false, reason: "The page came back incomplete." };
  const known = new Set(numbers(`${notes.map((n) => `${n.text} ${n.quote}`).join(" ")} ${about}`));
  const checked = [
    ...findings.map((f) => f.en),
    rajasthan?.en ?? "",
    ...mcqs.flatMap((m) => [m.question.en, ...m.options.map((p) => p.en)]),
  ];
  const unknown = [...new Set(checked.flatMap(numbers))].filter(
    // Small numbers (ranks, counts of options) can be the AI's own.
    (n) => !known.has(n) && Number(n) > 10,
  );
  if (unknown.length)
    return {
      ok: false,
      reason: `It has numbers the findings don't state: ${unknown.slice(0, 5).join(", ")}.`,
    };
  return { ok: true, report: { name, released_by: releasedBy, what, findings, rajasthan, mcqs } };
}

// ---------- Additions to stories already written ----------

// The document's facts a story doesn't have yet (by their words).
export function newFacts(have: CaFact[], fresh: CaFact[]): CaFact[] {
  const key = (f: CaFact) =>
    f.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const quote = (f: CaFact) =>
    f.quote
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const texts = new Set(have.map(key));
  const quotes = new Set(have.map(quote));
  const out: CaFact[] = [];
  for (const f of fresh) {
    if (texts.has(key(f)) || quotes.has(quote(f))) continue;
    texts.add(key(f));
    quotes.add(quote(f));
    out.push(f);
  }
  return out;
}
