// Export sets: a question bank filter saved as a set for the app, downloaded
// as one sheet per language in the app's layout (id, order, text,
// difficulty, isMultiselect, option1_text, option1_isCorrect … option4,
// explanation_<title>). Like the card studio's chunks: questions already in
// the app keep their id and order; new ones go at the end with an empty id;
// a question changed since the last download, or new, means "upload again";
// one that left the set is listed with its app id to remove. Pure helpers.
import { answersOf, OPTION_COUNT, type ExamQuestion } from "@/lib/exam-papers";

export type ExportLang = "hi" | "en";
export const EXPORT_LANGS: ExportLang[] = ["hi", "en"];
export const LANG_NAME: Record<ExportLang, string> = { hi: "Hindi", en: "English" };
export type Titles = Record<ExportLang, string>;
export const DEFAULT_TITLES: Titles = { hi: "व्याख्या", en: "Explanation" };

// A question's row in one language (without id and order), or why it can't
// go in that language's sheet.
export type ExportRow = {
  text: string;
  difficulty: string;
  isMultiselect: boolean;
  options: { text: string; correct: boolean }[];
  explanation: string;
};

type Q = Pick<
  ExamQuestion,
  | "question_en"
  | "question_hi"
  | "extra_en"
  | "extra_hi"
  | "options"
  | "correct"
  | "also_correct"
  | "deleted"
  | "explanation_en"
  | "explanation_hi"
  | "difficulty"
>;

const clean = (s: string | undefined) => (s ?? "").replace(/\r/g, "").trim();

export function exportRow(q: Q, lang: ExportLang): ExportRow | { skip: string } {
  if (q.deleted) return { skip: "deleted by the key" };
  const question = clean(lang === "hi" ? q.question_hi : q.question_en);
  if (!question) return { skip: `no ${LANG_NAME[lang]} text` };
  const extra = clean(lang === "hi" ? q.extra_hi : q.extra_en);
  const answers = answersOf(q);
  if (!answers.length) return { skip: "no answer" };
  const options = Array.from({ length: OPTION_COUNT }, (_, i) => ({
    text: clean(q.options[i]?.[lang]),
    correct: answers.includes(i + 1),
  }));
  if (options.some((o) => !o.text)) return { skip: `an option has no ${LANG_NAME[lang]} text` };
  return {
    // Statements and lists on their own lines below the question.
    text: extra ? `${question}\n${extra}` : question,
    difficulty: q.difficulty ?? "",
    isMultiselect: answers.length > 1,
    options,
    explanation: clean(lang === "hi" ? q.explanation_hi : q.explanation_en),
  };
}

// The row as the app's sheet has it, in its column order.
export function sheetRow(
  appId: string,
  order: number,
  r: ExportRow,
  title: string,
): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = {
    id: appId,
    order,
    text: r.text,
    difficulty: r.difficulty,
    isMultiselect: r.isMultiselect,
  };
  r.options.forEach((o, i) => {
    row[`option${i + 1}_text`] = o.text;
    row[`option${i + 1}_isCorrect`] = o.correct;
  });
  row[`explanation_${title.trim() || "Explanation"}`] = r.explanation;
  return row;
}

// What a row looked like (to tell when it changed).
export const sigOf = (r: ExportRow) => JSON.stringify(r);

export type ExportItem = {
  question_id: string;
  position: number;
  app_id: string;
  sig: string;
  label: string;
  gone_at: string | null;
};

export type Planned = {
  question_id: string;
  position: number;
  app_id: string;
  row: ExportRow;
  sig: string;
  label: string;
  status: "same" | "changed" | "new";
};

// The set now: its members (in order) against what was downloaded. A
// member keeps its order number and app id; a new one goes at the end; one
// that left the set is gone (to remove from the app when it has an id).
export function planSet(
  members: { question_id: string; row: ExportRow; label: string }[],
  items: ExportItem[],
): { rows: Planned[]; gone: ExportItem[]; newlyGone: ExportItem[] } {
  const had = new Map(items.map((i) => [i.question_id, i]));
  const ids = new Set(members.map((m) => m.question_id));
  let next = items.reduce((m, i) => Math.max(m, i.position), 0);
  const rows: Planned[] = members.map((m) => {
    const sig = sigOf(m.row);
    const it = had.get(m.question_id);
    if (!it)
      return {
        question_id: m.question_id,
        position: ++next,
        app_id: "",
        row: m.row,
        sig,
        label: m.label,
        status: "new",
      };
    return {
      question_id: m.question_id,
      position: it.position,
      app_id: it.app_id,
      row: m.row,
      sig,
      label: m.label,
      // Back after leaving, or never downloaded with its id: as new.
      status: !it.app_id && !it.sig ? "new" : it.gone_at || it.sig !== sig ? "changed" : "same",
    };
  });
  rows.sort((a, b) => a.position - b.position);
  const newlyGone = items.filter((i) => !ids.has(i.question_id) && !i.gone_at);
  const gone = items.filter((i) => !ids.has(i.question_id) && i.app_id);
  return { rows, gone, newlyGone };
}

// A set's state in one language.
export type SetStatus = {
  questions: number;
  fresh: number; // new since the last download
  changed: number;
  remove: number; // app ids to remove
  noIds: number; // downloaded, app ids not uploaded back yet
  noExplanation: number;
  skipped: number; // can't go in this language's sheet
  downloaded: string | null;
};
export const needsUpload = (s: SetStatus) => !s.downloaded || s.fresh > 0 || s.changed > 0;

// The app's sheet uploaded back: each of its rows' id matched to the set's
// question, by order and text (else by text alone).
export function matchIds(
  uploaded: { id: string; order: number | null; text: string }[],
  rows: { question_id: string; position: number; text: string }[],
): { ids: Map<string, string>; unmatched: number } {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const byPos = new Map(rows.map((r) => [r.position, r]));
  const byText = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byText.set(norm(r.text), [...(byText.get(norm(r.text)) ?? []), r]);
  const ids = new Map<string, string>();
  let unmatched = 0;
  for (const u of uploaded) {
    const id = String(u.id ?? "").trim();
    if (!id) continue;
    const at = u.order !== null ? byPos.get(u.order) : undefined;
    const same = at && norm(at.text) === norm(u.text) ? at : null;
    const byT = byText.get(norm(u.text));
    const hit = same ?? (byT?.length === 1 ? byT[0] : null);
    if (hit && !ids.has(hit.question_id)) ids.set(hit.question_id, id);
    else unmatched++;
  }
  return { ids, unmatched };
}

// The uploaded sheet's rows (any heading case; "order" may be text).
export function readUploaded(rows: Record<string, unknown>[]) {
  return rows.map((r) => {
    const get = (k: string) =>
      Object.entries(r).find(([h]) => h.trim().toLowerCase() === k)?.[1] ?? "";
    const o = Number(get("order"));
    return {
      id: String(get("id")).trim(),
      order: Number.isFinite(o) && o > 0 ? o : null,
      text: String(get("text")),
    };
  });
}

export const exportFileName = (name: string, lang: ExportLang) =>
  `${
    name
      .replace(/[^\p{L}\p{N} .&()-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Questions"
  } - ${LANG_NAME[lang]}.xlsx`;
