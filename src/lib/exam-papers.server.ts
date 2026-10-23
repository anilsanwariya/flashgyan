// Exam papers (server): saving papers exam by exam, reading a question
// paper's pages with the AI, applying answer keys, importing from Excel, and
// checking a paper against the current affairs magazine.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, type SaathiImage } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  OPTION_COUNT,
  classifyMessages,
  keyImageMessages,
  lessonsMessages,
  parseClassify,
  parseLessons,
  parseStoryMatch,
  storyMatchMessages,
  mergeQuestion,
  pageMessages,
  parseKeyJson,
  normSeries,
  parsePage,
  type ExamPaper,
  type ExamQuestion,
  type ImportedPaper,
  type KeyEntry,
  type QuestionDraft,
} from "@/lib/exam-papers";
import type { CaContent, CaFact } from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const now = () => new Date().toISOString();

const missing = (e: { message: string } | null) =>
  !!e && /exam_papers|exam_questions/.test(e.message);
export const PAPERS_NOT_READY =
  "Exam papers need a database update: run the latest migration (exam_papers) in Lovable or the SQL editor.";

export type PaperSummary = ExamPaper & {
  questions: number;
  answered: number;
  deleted: number;
  incomplete: number;
  covered: number;
  low: number;
  missed: number;
  ca: number;
};

const QUESTION_COLS =
  "id,paper_id,q_no,question_en,question_hi,extra_en,extra_hi,options,correct,deleted,ca,matched_item,match,match_note";

function readQuestion(r: unknown): ExamQuestion {
  const q = r as ExamQuestion;
  const options = Array.isArray(q.options) ? q.options : [];
  return {
    ...q,
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      en: options[i]?.en ?? "",
      hi: options[i]?.hi ?? "",
    })),
  };
}

const incomplete = (q: ExamQuestion) =>
  !q.question_en || !q.question_hi || q.options.some((o) => !o.en || !o.hi);

// ---------- Papers ----------

export async function listPapers(): Promise<{ ready: boolean; papers: PaperSummary[] }> {
  const { data, error } = await from("exam_papers")
    .select("*")
    .order("exam_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (missing(error)) return { ready: false, papers: [] };
  fail(error);
  const papers = (data ?? []) as unknown as ExamPaper[];
  const stats = new Map<string, Omit<PaperSummary, keyof ExamPaper>>();
  for (const p of papers)
    stats.set(p.id, {
      questions: 0,
      answered: 0,
      deleted: 0,
      incomplete: 0,
      covered: 0,
      low: 0,
      missed: 0,
      ca: 0,
    });
  // A page at a time: one request returns at most 1,000 rows.
  for (let at = 0; papers.length; at += 1000) {
    const { data: rows, error: qErr } = await from("exam_questions")
      .select(QUESTION_COLS)
      .order("id")
      .range(at, at + 999);
    fail(qErr);
    for (const raw of rows ?? []) {
      const q = readQuestion(raw);
      const s = stats.get(q.paper_id);
      if (!s) continue;
      s.questions++;
      if (q.correct) s.answered++;
      if (q.deleted) s.deleted++;
      if (incomplete(q)) s.incomplete++;
      if (q.ca) s.ca++;
      if (q.match === "covered") s.covered++;
      if (q.match === "low") s.low++;
      if (q.match === "missed") s.missed++;
    }
    if ((rows ?? []).length < 1000) break;
  }
  return {
    ready: true,
    papers: papers.map((p) => ({
      ...p,
      lessons: Array.isArray(p.lessons) ? p.lessons : [],
      ...stats.get(p.id)!,
    })),
  };
}

export type PaperMeta = {
  exam: string;
  subject: string;
  conducted_by: string;
  exam_date: string | null;
  paper_code?: string;
  series?: string;
};

const cleanMeta = (m: Partial<PaperMeta>) => ({
  ...(m.exam !== undefined ? { exam: m.exam.replace(/\s+/g, " ").trim().slice(0, 200) } : {}),
  ...(m.subject !== undefined
    ? { subject: m.subject.replace(/\s+/g, " ").trim().slice(0, 200) }
    : {}),
  ...(m.conducted_by !== undefined ? { conducted_by: m.conducted_by.trim().slice(0, 100) } : {}),
  ...(m.exam_date !== undefined ? { exam_date: m.exam_date || null } : {}),
  ...(m.paper_code !== undefined ? { paper_code: m.paper_code.trim().slice(0, 60) } : {}),
  ...(m.series !== undefined ? { series: normSeries(m.series) } : {}),
});

export async function createPaper(
  meta: PaperMeta,
  source: "pdf" | "excel",
  pages = 0,
): Promise<ExamPaper> {
  const row = cleanMeta(meta);
  if (!row.exam) throw new Error("Give the exam's name.");
  const { data, error } = await from("exam_papers")
    .insert({ ...row, source, pages } as never)
    .select("*")
    .single();
  if (missing(error)) throw new Error(PAPERS_NOT_READY);
  fail(error);
  return data as unknown as ExamPaper;
}

export async function updatePaper(id: string, meta: Partial<PaperMeta>) {
  const row = cleanMeta(meta);
  if (row.exam === "") throw new Error("Give the exam's name.");
  fail(
    (
      await from("exam_papers")
        .update({ ...row, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

export async function deletePaper(id: string) {
  fail((await from("exam_papers").delete().eq("id", id)).error);
}

export async function getPaper(
  id: string,
): Promise<{ paper: ExamPaper; questions: ExamQuestion[] }> {
  const { data, error } = await from("exam_papers").select("*").eq("id", id).single();
  if (missing(error)) throw new Error(PAPERS_NOT_READY);
  fail(error);
  const { data: rows, error: qErr } = await from("exam_questions")
    .select(QUESTION_COLS)
    .eq("paper_id", id)
    .order("q_no");
  fail(qErr);
  const paper = data as unknown as ExamPaper;
  return {
    paper: { ...paper, lessons: Array.isArray(paper.lessons) ? paper.lessons : [] },
    questions: (rows ?? []).map(readQuestion),
  };
}

// Saves questions read (from a page or Excel): new ones added, ones read
// before merged (a question cut across two pages). The answer key is kept.
export async function saveQuestions(paperId: string, drafts: QuestionDraft[], replace = false) {
  if (!drafts.length) return;
  const { data } = await from("exam_questions")
    .select(QUESTION_COLS)
    .eq("paper_id", paperId)
    .in(
      "q_no",
      drafts.map((d) => d.q_no),
    );
  const had = new Map((data ?? []).map((r) => [readQuestion(r).q_no, readQuestion(r)]));
  const rows = drafts.map((d) => {
    const old = had.get(d.q_no);
    const q = old && !replace ? mergeQuestion(old, d) : d;
    return {
      paper_id: paperId,
      q_no: d.q_no,
      question_en: q.question_en,
      question_hi: q.question_hi,
      extra_en: q.extra_en,
      extra_hi: q.extra_hi,
      options: q.options,
      // Every row with the same columns: a bulk upsert fills a column missing
      // from one row with null.
      correct: d.correct !== undefined ? d.correct : (old?.correct ?? null),
      deleted: d.deleted !== undefined ? d.deleted : (old?.deleted ?? false),
      updated_at: now(),
    };
  });
  fail((await from("exam_questions").upsert(rows as never, { onConflict: "paper_id,q_no" })).error);
}

// Reads one page of a question paper (an image) into its questions; the
// cover page gives the paper's code and number of questions.
export async function readPaperPage(
  paperId: string,
  page: number,
  pages: number,
  image: SaathiImage,
): Promise<{ questions: number[]; paper: boolean }> {
  const read = parsePage(
    await saathiComplete(apiKey(), pageMessages(page, pages), undefined, [image]),
  );
  await saveQuestions(paperId, read.questions);
  const { data } = await from("exam_papers")
    .select("pages_done,paper_code,questions_total,series")
    .eq("id", paperId)
    .single();
  const p = data as unknown as Pick<
    ExamPaper,
    "pages_done" | "paper_code" | "questions_total" | "series"
  >;
  fail(
    (
      await from("exam_papers")
        .update({
          pages,
          pages_done: Math.max(p.pages_done, page),
          ...(read.paper?.paper_code && !p.paper_code ? { paper_code: read.paper.paper_code } : {}),
          ...(read.paper?.series && !p.series ? { series: read.paper.series } : {}),
          ...(read.paper?.questions && !p.questions_total
            ? { questions_total: read.paper.questions }
            : {}),
          error: null,
          updated_at: now(),
        } as never)
        .eq("id", paperId)
    ).error,
  );
  return { questions: read.questions.map((q) => q.q_no), paper: !!read.paper };
}

// ---------- The answer key ----------

// Applies a key: each question's correct option, or deleted. A question not
// read yet gets its answer now and its text when its page is read.
export async function applyKey(
  paperId: string,
  entries: KeyEntry[],
  series?: string,
): Promise<{ applied: number; deleted: number }> {
  if (!entries.length) throw new Error("No answers found in this key.");
  // The series the answers were picked for, kept on the paper.
  if (series !== undefined) await updatePaper(paperId, { series });
  const rows = entries.map((e) => ({
    paper_id: paperId,
    q_no: e.q_no,
    correct: e.deleted ? null : e.correct,
    deleted: e.deleted,
    updated_at: now(),
  }));
  for (let i = 0; i < rows.length; i += 200)
    fail(
      (
        await from("exam_questions").upsert(rows.slice(i, i + 200) as never, {
          onConflict: "paper_id,q_no",
        })
      ).error,
    );
  fail(
    (
      await from("exam_papers")
        .update({ key_added: true, updated_at: now() } as never)
        .eq("id", paperId)
    ).error,
  );
  return { applied: entries.length, deleted: entries.filter((e) => e.deleted).length };
}

// A key that is only an image: the AI reads it, for the paper's series when
// the key has several.
export async function keyFromImage(paperId: string, image: SaathiImage, series?: string) {
  if (series !== undefined) await updatePaper(paperId, { series });
  const { data } = await from("exam_papers").select("series").eq("id", paperId).single();
  const own = normSeries((data as { series?: string } | null)?.series ?? "");
  const read = parseKeyJson(
    await saathiComplete(apiKey(), keyImageMessages(own), undefined, [image]),
  );
  if (read.series.length > 1 && !read.series.includes(own))
    throw new SeriesNeeded(read.series, own);
  return { ...(await applyKey(paperId, read.entries)), series: read.series.length > 1 ? own : "" };
}

// A key for several series, and the paper's series isn't one of them (or
// isn't set): the editor picks it.
export class SeriesNeeded extends Error {
  constructor(series: string[], own: string) {
    super(
      own
        ? `This key has series ${series.join(", ")}, not ${own}. Check the paper's series. [series:${series.join(",")}]`
        : `This key has answers for series ${series.join(", ")}. Choose your paper's series first. [series:${series.join(",")}]`,
    );
  }
}

// ---------- Excel ----------

export async function importPapers(
  papers: ImportedPaper[],
  meta: { conducted_by: string; exam_date: string | null },
): Promise<{ papers: string[]; questions: number }> {
  if (!papers.length || !papers.some((p) => p.questions.length))
    throw new Error(
      "No questions found. Use the columns: Exam name, Subject, Question No., Question, Other part of question, Option 1–4, Correct Option No.",
    );
  const ids: string[] = [];
  let count = 0;
  for (const p of papers) {
    const paper = await createPaper(
      {
        exam: p.exam,
        subject: p.subject,
        conducted_by: meta.conducted_by,
        exam_date: meta.exam_date,
      },
      "excel",
    );
    ids.push(paper.id);
    for (let i = 0; i < p.questions.length; i += 200)
      await saveQuestions(paper.id, p.questions.slice(i, i + 200), true);
    if (p.questions.some((q) => q.correct || q.deleted))
      fail(
        (
          await from("exam_papers")
            .update({ key_added: true } as never)
            .eq("id", paper.id)
        ).error,
      );
    count += p.questions.length;
  }
  return { papers: ids, questions: count };
}

// ---------- Editing ----------

export async function updateQuestion(
  id: string,
  patch: Partial<
    Pick<
      ExamQuestion,
      "question_en" | "question_hi" | "extra_en" | "extra_hi" | "options" | "correct" | "deleted"
    >
  >,
) {
  const row: Record<string, unknown> = { updated_at: now() };
  for (const k of ["question_en", "question_hi", "extra_en", "extra_hi"] as const)
    if (patch[k] !== undefined) row[k] = String(patch[k]).trim().slice(0, 4000);
  if (patch.options)
    row.options = Array.from({ length: OPTION_COUNT }, (_, i) => ({
      en: String(patch.options![i]?.en ?? "")
        .trim()
        .slice(0, 1000),
      hi: String(patch.options![i]?.hi ?? "")
        .trim()
        .slice(0, 1000),
    }));
  if (patch.deleted !== undefined) row.deleted = patch.deleted;
  if (patch.correct !== undefined) row.correct = patch.deleted ? null : patch.correct;
  fail(
    (
      await from("exam_questions")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteQuestion(id: string) {
  fail((await from("exam_questions").delete().eq("id", id)).error);
}

// ---------- Checking a paper against the magazine ----------

// Questions sorted per step, and current affairs questions matched per step.
const CLASSIFY_BATCH = 15;
const MATCH_BATCH = 3;
// Months of news before the exam its current affairs questions come from.
const WINDOW_MONTHS = 18;
// Stories this close to a question are shown to the AI.
const CLOSE = 0.5;

const shift = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

const questionText = (q: ExamQuestion) =>
  [q.question_en || q.question_hi, q.extra_en || q.extra_hi].filter(Boolean).join("\n");
const answerText = (q: ExamQuestion) =>
  q.correct ? q.options[q.correct - 1]?.en || q.options[q.correct - 1]?.hi || null : null;

export type CheckProgress = {
  done: boolean;
  step: string;
  sorted: number;
  matched: number;
  total: number;
};

// One step of checking a paper: sort the next questions into current affairs
// or static, else match the next current affairs questions to stories, else
// write the lessons. Asking again later checks only what's new.
export async function checkStep(paperId: string): Promise<CheckProgress> {
  const { paper, questions } = await getPaper(paperId);
  const live = questions.filter((q) => !q.deleted && (q.question_en || q.question_hi));
  const progress = (step: string, done = false): CheckProgress => ({
    done,
    step,
    sorted: live.filter((q) => q.ca !== null).length,
    matched: live.filter((q) => q.ca && q.match).length,
    total: live.length,
  });
  if (!live.length) throw new Error("Read the paper's questions first.");

  // 1) Current affairs or static.
  const unsorted = live.filter((q) => q.ca === null).slice(0, CLASSIFY_BATCH);
  if (unsorted.length) {
    const sorted = parseClassify(
      await saathiComplete(
        apiKey(),
        classifyMessages(
          unsorted.map((q) => ({ n: q.q_no, text: questionText(q) })),
          paper.exam_date,
        ),
      ),
      unsorted.map((q) => q.q_no),
    );
    for (const q of unsorted) {
      const r = sorted.get(q.q_no) ?? { ca: false, search: "" };
      fail(
        (
          await from("exam_questions")
            .update({
              ca: r.ca,
              // The words to find its story by, until it's matched.
              match_note: r.ca ? `search: ${r.search}` : null,
              match: null,
              matched_item: null,
            } as never)
            .eq("id", q.id)
        ).error,
      );
      q.ca = r.ca;
    }
    return progress(`sorted questions ${unsorted[0].q_no}–${unsorted.at(-1)!.q_no}`);
  }

  // 2) Current affairs questions: did a story cover them?
  const to = paper.exam_date ?? new Date().toISOString().slice(0, 10);
  const fromDate = shift(to, -WINDOW_MONTHS);
  const unmatched = live.filter((q) => q.ca && !q.match).slice(0, MATCH_BATCH);
  if (unmatched.length) {
    for (const q of unmatched) {
      const search = q.match_note?.replace(/^search:\s*/, "") || questionText(q);
      const { data: near, error } = await supabaseAdmin.rpc(
        "exam_similar_items" as never,
        {
          p_embedding: await CA.embedText(`${search}\n${questionText(q)}`),
          p_from: fromDate,
          p_to: to,
          p_count: 6,
        } as never,
      );
      fail(error);
      const close = ((near ?? []) as unknown as { id: string; similarity: number }[]).filter(
        (x) => x.similarity >= CLOSE,
      );
      let match: "covered" | "low" | "missed" = "missed";
      let item: string | null = null;
      let note = "No story on it";
      if (close.length) {
        const { data } = await from("ca_items")
          .select("id,issue_date,headline,facts,content,status,importance")
          .in(
            "id",
            close.map((c) => c.id),
          );
        const stories = (
          (data ?? []) as unknown as {
            id: string;
            issue_date: string;
            headline: string;
            facts: CaFact[];
            content: CaContent | null;
            status: string;
            importance: number;
          }[]
        ).sort(
          (a, b) => close.findIndex((c) => c.id === a.id) - close.findIndex((c) => c.id === b.id),
        );
        const r = parseStoryMatch(
          await saathiComplete(
            apiKey(),
            storyMatchMessages(
              questionText(q),
              answerText(q),
              stories.map((st) => ({
                date: st.issue_date,
                headline: st.content?.headline.en || st.headline,
                facts: st.facts.map((f) => f.text),
              })),
            ),
          ),
          stories.length,
        );
        note = r.note || note;
        if (r.index >= 0) {
          const st = stories[r.index];
          item = st.id;
          // In the magazine and rated worth it: covered; left out, or rated
          // least likely: low.
          match = st.status === "included" && st.importance >= 2 ? "covered" : "low";
        }
      }
      fail(
        (
          await from("exam_questions")
            .update({ match, matched_item: item, match_note: note.slice(0, 300) } as never)
            .eq("id", q.id)
        ).error,
      );
      q.match = match;
    }
    return progress(`matched questions ${unmatched.map((q) => q.q_no).join(", ")}`);
  }

  // 3) Lessons from what was missed or rated low.
  const lessonsFrom = live
    .filter((q) => q.match === "missed" || q.match === "low")
    .map((q) => ({
      question: questionText(q),
      note: q.match_note ?? "",
      kind: q.match as "missed" | "low",
    }));
  const lessons = lessonsFrom.length
    ? parseLessons(await saathiComplete(apiKey(), lessonsMessages(lessonsFrom.slice(0, 60))))
    : [];
  fail(
    (
      await from("exam_papers")
        .update({ lessons, checked_at: now(), updated_at: now() } as never)
        .eq("id", paperId)
    ).error,
  );
  return progress("wrote the lessons", true);
}

// Starts the check again from the start (after editing questions).
export async function resetCheck(paperId: string) {
  fail(
    (
      await from("exam_questions")
        .update({ ca: null, match: null, matched_item: null, match_note: null } as never)
        .eq("paper_id", paperId)
    ).error,
  );
  fail(
    (
      await from("exam_papers")
        .update({ checked_at: null, lessons: [] } as never)
        .eq("id", paperId)
    ).error,
  );
}

// The questions' matched stories (date and headline), for the report.
export async function matchedStories(
  ids: string[],
): Promise<Record<string, { date: string; headline: string; status: string }>> {
  if (!ids.length) return {};
  const { data } = await from("ca_items")
    .select("id,issue_date,headline,content,status")
    .in("id", ids);
  return Object.fromEntries(
    (
      (data ?? []) as unknown as {
        id: string;
        issue_date: string;
        headline: string;
        content: CaContent | null;
        status: string;
      }[]
    ).map((r) => [
      r.id,
      { date: r.issue_date, headline: r.content?.headline.en || r.headline, status: r.status },
    ]),
  );
}

// ---------- Lessons in story picking ----------

export async function lessonsInUse(): Promise<string[]> {
  return (await CA.getMagazineSettings()).exam_lessons ?? [];
}

// Adds or removes a lesson from how stories are picked.
export async function useLesson(lesson: string, on: boolean): Promise<string[]> {
  const had = await lessonsInUse();
  const text = lesson.replace(/\s+/g, " ").trim().slice(0, 300);
  const next = on
    ? had.includes(text)
      ? had
      : [...had, text].slice(-12)
    : had.filter((l) => l !== text);
  await CA.saveMagazineSettings({ exam_lessons: next });
  return next;
}
