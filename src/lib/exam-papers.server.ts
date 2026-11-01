// Exam papers (server): saving papers exam by exam, reading a question
// paper's pages with the AI, applying answer keys, importing from Excel, and
// checking a paper against the current affairs magazine.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiImage,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  pyqRow,
  pyqSets,
  type PyqQuestion,
  CHECK_BATCH,
  checkSig,
  checkedNow,
  cleanAlso,
  difficultyOf,
  hasExplanation,
  needsExplanation,
  proofAfter,
  type Difficulty,
  type ProofLevel,
  parseReview,
  reviewMessages,
  subjectSection,
  EXPLAIN_BATCH,
  OPTION_COUNT,
  classifyMessages,
  explainMessages,
  parseExplanations,
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
  type PaperKind,
  type WrittenContext,
  parseWrittenPage,
  writtenPageMessages,
  type ImportedPaper,
  type KeyEntry,
  type QuestionDraft,
} from "@/lib/exam-papers";
import {
  cleanRanges,
  cleanSections,
  guessSyllabus,
  langOf,
  needsSorting,
  readTag,
  sectionOf,
  syllabusTags,
  tagContext,
  tagLines,
  type PaperSection,
  type SectionRange,
} from "@/lib/exam-sections";
import { examTitle, type SyllabusNode } from "@/lib/syllabus";
import type { CaContent, CaFact } from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";
import * as WN from "@/lib/flash-wordnet";

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
  !!e &&
  /exam_papers|exam_questions|explanation_|verified|key_note|status|mcq_test_id/.test(e.message);
export const PAPERS_NOT_READY =
  "Exam papers need a database update: run the latest migrations (exam_papers, exam_proofread) in Lovable or the SQL editor.";

export type PaperSummary = ExamPaper & {
  questions: number;
  answered: number;
  deleted: number;
  incomplete: number;
  covered: number;
  low: number;
  missed: number;
  ca: number;
  verified: number;
  explained: number;
  // The three checks (after the exam_proof_levels migration), and finished
  // questions still without an explanation.
  proof_question: number;
  proof_answer: number;
  proof_explanation: number;
  need_explanation: number;
};

const QUESTION_COLS =
  "id,paper_id,q_no,question_en,question_hi,extra_en,extra_hi,options,correct,deleted,ca,matched_item,match,match_note,explanation_en,explanation_hi,explanation_source,explanation_general,verified,key_note";

// After the paper_check_subjects migration: subjects, topics, the AI check.
const CHECK_COLS = ",subject_section,topic_en,topic_hi,ai_check";
const missingCheck = (e: { message: string } | null) =>
  !!e && /subject_section|topic_en|topic_hi|ai_check/.test(e.message);
export const CHECK_NOT_READY =
  "Subjects and the AI check need a database update: run the latest migration (paper_check_subjects) in Lovable or the SQL editor.";

// After the exam_proof_levels migration: the three checks, other accepted
// options and difficulty.
const PROOF_COLS = ",proof_question,proof_answer,proof_explanation,also_correct,difficulty";
const missingProof = (e: { message: string } | null) =>
  !!e && /proof_question|proof_answer|proof_explanation|also_correct|difficulty/.test(e.message);
export const PROOF_NOT_READY =
  "The three proofreading checks need a database update: run the latest migration (exam_proof_levels) in Lovable or the SQL editor.";

// After the paper_sections migration: a question's section and syllabus
// line; a paper's type, sections and syllabus.
const SECTION_COLS = ",paper_section,syllabus_node_id";
const missingSections = (e: { message: string } | null) =>
  !!e &&
  /paper_section|syllabus_node_id|paper_type|exam_syllabus_id|'sections'|"sections"|\.sections\b/.test(
    e.message,
  );
export const SECTIONS_NOT_READY =
  "Paper types, sections and syllabus tags need a database update: run the latest migration (paper_sections) in Lovable or the SQL editor.";

// ---------- Sections (a setting) ----------

const SECTIONS_KEY = "exam_sections";
export async function getSections(): Promise<PaperSection[]> {
  const { data } = await from("bot_settings").select("value").eq("key", SECTIONS_KEY).maybeSingle();
  return cleanSections((data as { value?: unknown } | null)?.value);
}
export async function saveSections(list: PaperSection[]) {
  const clean = cleanSections(list);
  fail(
    (
      await from("bot_settings").upsert({
        key: SECTIONS_KEY,
        value: clean,
        updated_at: now(),
      } as never)
    ).error,
  );
  return clean;
}

// A paper's sections (cleaned against the setting) and each question's
// language: a language section's questions are in that language only.
export async function paperSectionsOf(paper: Pick<ExamPaper, "sections">) {
  const sections = await getSections();
  const ranges = cleanRanges(paper.sections, sections);
  return {
    sections,
    ranges,
    lang: (q: { q_no: number; paper_section?: string | null }) =>
      langOf(sections, sectionOf(ranges, q)),
  };
}

// The optional column groups, each dropped when its migration hasn't run.
const OPTIONAL = [
  {
    key: "check",
    cols: () => CHECK_COLS,
    miss: (e: { message: string } | null) => missingCheck(e),
  },
  {
    key: "mains",
    cols: () => MAINS_COLS,
    miss: (e: { message: string } | null) => missingMains(e),
  },
  { key: "proof", cols: () => PROOF_COLS, miss: missingProof },
  {
    key: "sections",
    cols: () => SECTION_COLS,
    miss: (e: { message: string } | null) => missingSections(e),
  },
] as const;
type Ready = Record<(typeof OPTIONAL)[number]["key"], boolean>;

// Rows with every optional column group whose migration has run.
async function withOptional(
  run: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  base = QUESTION_COLS,
  groups: (keyof Ready)[] = ["check", "mains", "proof", "sections"],
): Promise<{ rows: unknown[]; has: Ready }> {
  const has: Ready = {
    check: groups.includes("check"),
    mains: groups.includes("mains"),
    proof: groups.includes("proof"),
    sections: groups.includes("sections"),
  };
  for (;;) {
    const r = await run(
      base +
        OPTIONAL.filter((g) => has[g.key])
          .map((g) => g.cols())
          .join(""),
    );
    // The newest groups first: their names never match the older patterns.
    const gone = [...OPTIONAL].reverse().find((g) => has[g.key] && g.miss(r.error));
    if (!gone) {
      fail(r.error);
      return { rows: (r.data ?? []) as unknown[], has };
    }
    has[gone.key] = false;
  }
}

// Questions by id (for proofreading across papers), with the migrations'
// columns when they have run.
export async function questionsByIds(ids: string[]): Promise<ExamQuestion[]> {
  const out: ExamQuestion[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { rows } = await withOptional((cols) =>
      from("exam_questions")
        .select(cols)
        .in("id", ids.slice(i, i + 200)),
    );
    out.push(...rows.map(readQuestion));
  }
  const at = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
}

// A paper's questions (those numbered, or all), with the migrations'
// columns when they have run.
async function selectQuestions(paperId: string, qNos?: number[]) {
  const { rows, has } = await withOptional((cols) => {
    let x = from("exam_questions").select(cols).eq("paper_id", paperId);
    if (qNos) x = x.in("q_no", qNos);
    return x.order("q_no");
  });
  return {
    ready: has.check,
    mains: has.mains,
    proof: has.proof,
    sections: has.sections,
    questions: rows.map(readQuestion),
  };
}

// After the mains_papers migration: written questions and master topics.
const MAINS_COLS = ",unit,part,marks,word_limit,model_answer,model_source,master_topic_id";
const missingMains = (e: { message: string } | null) =>
  !!e &&
  /unit|part|marks|word_limit|model_answer|model_source|master_topic_id|kind/.test(e.message);
export const MAINS_NOT_READY =
  "Mains papers and topic links need a database update: run the latest migration (mains_papers) in Lovable or the SQL editor.";
const isWritten = (p: { kind?: string }) => p.kind === "subjective";

function readQuestion(r: unknown): ExamQuestion {
  const q = r as ExamQuestion;
  const options = Array.isArray(q.options) ? q.options : [];
  const explained = hasExplanation(q);
  return {
    ...q,
    // Before the exam_proof_levels migration: "verified" ticks every check.
    proof_question: q.proof_question ?? q.verified,
    proof_answer: q.proof_answer ?? q.verified,
    proof_explanation: q.proof_explanation ?? (q.verified && explained),
    also_correct: cleanAlso(q.also_correct, q.correct),
    paper_section: q.paper_section ?? "",
    syllabus_node_id: q.syllabus_node_id ?? null,
    difficulty: difficultyOf(q.difficulty),
    options: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      en: options[i]?.en ?? "",
      hi: options[i]?.hi ?? "",
    })),
  };
}

// A written (Mains) question has no options.
// A language section's question (lang) needs only that language.
const incomplete = (q: ExamQuestion, written = false, lang: "en" | "hi" | null = null) =>
  (!q.question_en && lang !== "hi") ||
  (!q.question_hi && lang !== "en") ||
  (!written && q.options.some((o) => (!o.en && lang !== "hi") || (!o.hi && lang !== "en")));

// ---------- Tagging on the exam's syllabus ----------

type SylRow = { id: string; name: string; stage: string; notified_on: string | null };
// The syllabi in the Syllabus feature (old ones kept for old papers left
// out).
export async function currentSyllabi(): Promise<SylRow[]> {
  let { data, error } = await from("syllabus_exams")
    .select("id,name,stage,notified_on")
    .eq("archived", false);
  if (error && /archived/.test(error.message))
    ({ data, error } = await from("syllabus_exams").select("id,name,stage,notified_on"));
  if (error) return [];
  return (data ?? []) as unknown as SylRow[];
}

async function syllabusNodes(examId: string) {
  const { data } = await from("syllabus_nodes")
    .select("id,kind,text_en,text_hi,section")
    .eq("exam_id", examId)
    .order("position");
  return (data ?? []) as unknown as Pick<
    SyllabusNode,
    "id" | "kind" | "text_en" | "text_hi" | "section"
  >[];
}

// What tagging a paper needs: the exam's current syllabus (set on the paper,
// else guessed from its name), its numbered lines and their tags, the old
// syllabus the paper followed (its headings), and the paper's sections.
export async function paperTagging(paper: ExamPaper) {
  const list = await currentSyllabi();
  const set = paper.exam_syllabus_id ? list.find((x) => x.id === paper.exam_syllabus_id) : null;
  const syl = set ?? guessSyllabus(paper.exam, list);
  const nodes = syl ? await syllabusNodes(syl.id) : [];
  const tags = syllabusTags(nodes);
  let old: { name: string; heads: string[] } | null = null;
  if (paper.syllabus_id) {
    const { data } = await from("syllabus_exams")
      .select("name,stage")
      .eq("id", paper.syllabus_id)
      .maybeSingle();
    if (data) {
      const heads = (await syllabusNodes(paper.syllabus_id))
        .filter((n) => n.kind === "heading" || n.kind === "subheading")
        .map((n) => n.text_en || n.text_hi);
      old = { name: examTitle(data as never), heads };
    }
  }
  const { sections, ranges } = await paperSectionsOf(paper);
  return {
    syllabus: syl ? { id: syl.id, title: examTitle(syl as never), guessed: !set } : null,
    syllabi: list.map((x) => ({ id: x.id, title: examTitle(x as never) })),
    lines: tagLines(nodes),
    tags: Object.fromEntries(tags),
    old,
    sections,
    ranges,
  };
}

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
  const writtenIds = new Set(papers.filter(isWritten).map((p) => p.id));
  // Each paper's sections, for its language questions.
  const allSections = await getSections();
  const rangesOf = new Map(papers.map((p) => [p.id, cleanRanges(p.sections, allSections)]));
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
      verified: 0,
      explained: 0,
      proof_question: 0,
      proof_answer: 0,
      proof_explanation: 0,
      need_explanation: 0,
    });
  // A page at a time: one request returns at most 1,000 rows.
  for (let at = 0; papers.length; at += 1000) {
    const { rows } = await withOptional(
      (cols) =>
        from("exam_questions")
          .select(cols)
          .order("id")
          .range(at, at + 999),
      QUESTION_COLS,
      ["proof", "sections"],
    );
    for (const raw of rows) {
      const q = readQuestion(raw);
      const s = stats.get(q.paper_id);
      if (!s) continue;
      s.questions++;
      if (q.correct) s.answered++;
      if (q.deleted) s.deleted++;
      const lang = langOf(allSections, sectionOf(rangesOf.get(q.paper_id) ?? [], q));
      if (incomplete(q, writtenIds.has(q.paper_id), lang)) s.incomplete++;
      if (q.ca) s.ca++;
      if (q.match === "covered") s.covered++;
      if (q.match === "low") s.low++;
      if (q.match === "missed") s.missed++;
      if (q.verified) s.verified++;
      if (q.explanation_en || q.explanation_hi) s.explained++;
      if (q.proof_question) s.proof_question++;
      if (q.proof_answer) s.proof_answer++;
      if (q.proof_explanation) s.proof_explanation++;
      if (needsExplanation(q)) s.need_explanation++;
    }
    if (rows.length < 1000) break;
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
  // After the paper_sections migration.
  paper_type?: string;
  sections?: SectionRange[];
  exam_syllabus_id?: string | null;
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
  ...(m.paper_type !== undefined ? { paper_type: m.paper_type.trim().slice(0, 40) } : {}),
  ...(m.sections !== undefined ? { sections: m.sections.slice(0, 12) } : {}),
  ...(m.exam_syllabus_id !== undefined ? { exam_syllabus_id: m.exam_syllabus_id } : {}),
});

export async function createPaper(
  meta: PaperMeta,
  source: "pdf" | "excel",
  pages = 0,
  kind: PaperKind = "objective",
): Promise<ExamPaper> {
  const row = cleanMeta(meta);
  if (!row.exam) throw new Error("Give the exam's name.");
  if (row.sections) row.sections = cleanRanges(row.sections, await getSections());
  const insert = (r: Record<string, unknown>) =>
    from("exam_papers")
      .insert({ ...r, source, pages, ...(kind === "subjective" ? { kind } : {}) } as never)
      .select("*")
      .single();
  let { data, error } = await insert(row);
  // Before the paper_sections migration: added without its type and
  // sections (the paper's page asks for the migration).
  if (missingSections(error)) {
    const { paper_type: _t, sections: _s, exam_syllabus_id: _e, ...plain } = row;
    ({ data, error } = await insert(plain));
  }
  if (kind === "subjective" && missingMains(error)) throw new Error(MAINS_NOT_READY);
  if (missingSections(error)) throw new Error(SECTIONS_NOT_READY);
  if (missing(error)) throw new Error(PAPERS_NOT_READY);
  fail(error);
  return data as unknown as ExamPaper;
}

export async function updatePaper(id: string, meta: Partial<PaperMeta>) {
  const row = cleanMeta(meta);
  if (row.exam === "") throw new Error("Give the exam's name.");
  if (row.sections) row.sections = cleanRanges(row.sections, await getSections());
  const { error } = await from("exam_papers")
    .update({ ...row, updated_at: now() } as never)
    .eq("id", id);
  if (missingSections(error)) throw new Error(SECTIONS_NOT_READY);
  fail(error);
}

// The old syllabus a paper followed (an old one kept for old papers only),
// or none.
export async function setPaperSyllabus(paperId: string, syllabusId: string | null) {
  if (syllabusId) {
    const { data, error } = await from("syllabus_exams")
      .select("id,archived")
      .eq("id", syllabusId)
      .single();
    if (error && /archived/.test(error.message))
      throw new Error(
        "Old syllabi need a database update: run the latest migration (syllabus_stages) in Lovable or the SQL editor.",
      );
    fail(error);
    if (!(data as unknown as { archived?: boolean }).archived)
      throw new Error(
        "That's an exam's current syllabus: a paper links only to an old syllabus kept for old papers.",
      );
  }
  const { error } = await from("exam_papers")
    .update({ syllabus_id: syllabusId, updated_at: now() } as never)
    .eq("id", paperId);
  if (error && /syllabus_id/.test(error.message))
    throw new Error(
      "Old syllabi need a database update: run the latest migration (syllabus_stages) in Lovable or the SQL editor.",
    );
  fail(error);
}

// A paper's old syllabus in short, for its page.
export async function paperSyllabus(syllabusId: string | null | undefined) {
  if (!syllabusId) return null;
  const { data } = await from("syllabus_exams")
    .select("id,name,stage,body,notified_on,pages,pages_done,status")
    .eq("id", syllabusId)
    .maybeSingle();
  if (!data) return null;
  const { count } = await from("syllabus_nodes")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", syllabusId)
    .eq("kind", "line");
  const e = data as {
    id: string;
    name: string;
    stage: string;
    body: string;
    notified_on: string | null;
    pages: number;
    pages_done: number;
    status: string;
  };
  return { ...e, lines: count ?? 0 };
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
  const { questions } = await selectQuestions(id);
  const paper = data as unknown as ExamPaper;
  return {
    paper: { ...paper, lessons: Array.isArray(paper.lessons) ? paper.lessons : [] },
    questions,
  };
}

// Saves questions read (from a page or Excel): new ones added, ones read
// before merged (a question cut across two pages). The answer key is kept.
export async function saveQuestions(paperId: string, drafts: QuestionDraft[], replace = false) {
  if (!drafts.length) return;
  const {
    ready,
    mains,
    proof,
    questions: old0,
  } = await selectQuestions(
    paperId,
    drafts.map((d) => d.q_no),
  );
  const had = new Map(old0.map((q) => [q.q_no, q]));
  // Subjects and topics from the sheet (kept otherwise).
  const subjects = ready && drafts.some((d) => d.subject_section || d.topic_en || d.topic_hi);
  // A written question's unit, part, marks, word limit and model answer.
  const written =
    mains &&
    drafts.some(
      (d) => d.unit || d.part || d.marks || d.word_limit || d.model_answer || d.model_source,
    );
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
      explanation_en: d.explanation_en ?? old?.explanation_en ?? "",
      explanation_hi: d.explanation_hi ?? old?.explanation_hi ?? "",
      explanation_source: d.explanation_source ?? old?.explanation_source ?? "",
      explanation_general: d.explanation_general ?? old?.explanation_general ?? false,
      key_note: d.key_note ?? old?.key_note ?? "",
      ...(proof
        ? {
            also_correct: cleanAlso(
              d.also_correct ?? old?.also_correct,
              d.correct !== undefined ? d.correct : (old?.correct ?? null),
            ),
            difficulty: difficultyOf(d.difficulty ?? old?.difficulty),
          }
        : {}),
      ...(subjects
        ? {
            subject_section: d.subject_section ?? old?.subject_section ?? "",
            topic_en: d.topic_en ?? old?.topic_en ?? "",
            topic_hi: d.topic_hi ?? old?.topic_hi ?? "",
          }
        : {}),
      ...(written
        ? {
            unit: d.unit ?? old?.unit ?? "",
            part: d.part ?? old?.part ?? "",
            marks: d.marks ?? old?.marks ?? null,
            word_limit: d.word_limit ?? old?.word_limit ?? null,
            model_answer: d.model_answer ?? old?.model_answer ?? "",
            model_source: d.model_source ?? old?.model_source ?? "",
          }
        : {}),
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
  const { data: kindRow } = await from("exam_papers").select("*").eq("id", paperId).single();
  const read = isWritten((kindRow ?? {}) as { kind?: string })
    ? await readWrittenPage(paperId, page, pages, image)
    : parsePage(await saathiComplete(apiKey(), pageMessages(page, pages), undefined, [image]));
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

// A written (Mains) paper's page: the unit, part, marks and word limit
// carried on from the questions read before.
async function readWrittenPage(paperId: string, page: number, pages: number, image: SaathiImage) {
  const { questions } = await selectQuestions(paperId);
  const last = questions.at(-1);
  const context: WrittenContext | null = last
    ? {
        unit: last.unit ?? "",
        part: last.part ?? "",
        marks: last.marks ?? null,
        words: last.word_limit ?? null,
        last: last.q_no,
      }
    : null;
  return parseWrittenPage(
    await saathiComplete(apiKey(), writtenPageMessages(page, pages, context), undefined, [image]),
    context,
  );
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
  // A question whose answer the key changes: its answer and explanation
  // are proofread again.
  const { proof, questions: had } = await selectQuestions(
    paperId,
    entries.map((e) => e.q_no),
  );
  const old = new Map(had.map((q) => [q.q_no, q]));
  const rows = entries.map((e) => {
    const correct = e.deleted ? null : e.correct;
    const row = {
      paper_id: paperId,
      q_no: e.q_no,
      correct,
      deleted: e.deleted,
      updated_at: now(),
    };
    if (!proof) return row;
    const also = cleanAlso(e.also, correct);
    const q = old.get(e.q_no);
    const answer =
      !!q &&
      (q.correct !== correct ||
        q.deleted !== e.deleted ||
        (q.also_correct ?? []).join() !== also.join());
    const checks = q
      ? proofAfter(q, q, { answer })
      : { proof_question: false, proof_answer: false, proof_explanation: false, verified: false };
    return { ...row, also_correct: also, ...checks };
  });
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
  meta: {
    conducted_by: string;
    exam_date: string | null;
    paper_type?: string;
    sections?: SectionRange[];
    exam_syllabus_id?: string | null;
  },
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
        ...(meta.paper_type ? { paper_type: meta.paper_type } : {}),
        ...(meta.sections ? { sections: meta.sections } : {}),
        ...(meta.exam_syllabus_id ? { exam_syllabus_id: meta.exam_syllabus_id } : {}),
      },
      "excel",
      0,
      p.kind ?? "objective",
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

export type QuestionPatch = Partial<
  Pick<
    ExamQuestion,
    | "question_en"
    | "question_hi"
    | "extra_en"
    | "extra_hi"
    | "options"
    | "correct"
    | "deleted"
    | "explanation_en"
    | "explanation_hi"
    | "verified"
    | "subject_section"
    | "topic_en"
    | "topic_hi"
    | "unit"
    | "part"
    | "marks"
    | "word_limit"
    | "model_answer"
    | "model_source"
    | "master_topic_id"
    | "also_correct"
  >
> & {
  // Ticks or clears one or more of the three checks.
  proof?: Partial<Record<ProofLevel, boolean>>;
  difficulty?: Difficulty | null;
  paper_section?: string;
  syllabus_node_id?: string | null;
};

async function questionById(id: string) {
  const { rows, has } = await withOptional((cols) =>
    from("exam_questions").select(cols).eq("id", id).limit(1),
  );
  if (!rows.length) throw new Error("That question is gone: reload the paper.");
  return { q: readQuestion(rows[0]), has };
}

const sameText = (a: string | undefined, b: string | undefined) =>
  (a ?? "").trim() === (b ?? "").trim();

export async function updateQuestion(id: string, patch: QuestionPatch) {
  // A model answer or outline topic changes nothing students see: allowed on
  // a published paper too.
  const privateOnly = Object.keys(patch).every((k) =>
    ["model_answer", "model_source", "master_topic_id"].includes(k),
  );
  if (!privateOnly) await assertDraft({ question: id });
  // The subject, topic, difficulty, model answer and outline topic: no
  // need to proofread again.
  const sorted: Record<string, unknown> = {};
  if (patch.subject_section !== undefined)
    sorted.subject_section = subjectSection(patch.subject_section);
  for (const k of ["topic_en", "topic_hi"] as const)
    if (patch[k] !== undefined) sorted[k] = String(patch[k]).trim().slice(0, 80);
  if (patch.model_answer !== undefined)
    sorted.model_answer = String(patch.model_answer).trim().slice(0, 20000);
  if (patch.model_source !== undefined)
    sorted.model_source = String(patch.model_source).trim().slice(0, 200);
  if (patch.master_topic_id !== undefined) sorted.master_topic_id = patch.master_topic_id;
  if (patch.difficulty !== undefined) sorted.difficulty = difficultyOf(patch.difficulty);
  if (patch.paper_section !== undefined)
    sorted.paper_section = String(patch.paper_section).slice(0, 30);
  // A syllabus line: the subject and topic follow it.
  if (patch.syllabus_node_id !== undefined) {
    sorted.syllabus_node_id = patch.syllabus_node_id;
    if (patch.syllabus_node_id) {
      const { data: n } = await from("syllabus_nodes")
        .select("exam_id")
        .eq("id", patch.syllabus_node_id)
        .maybeSingle();
      if (!n) throw new Error("That syllabus line is gone: reload the paper.");
      const tag = syllabusTags(await syllabusNodes((n as { exam_id: string }).exam_id)).get(
        patch.syllabus_node_id,
      );
      if (tag) {
        sorted.subject_section = tag.subject;
        sorted.topic_en = tag.topic_en;
        sorted.topic_hi = tag.topic_hi;
      }
    }
  }
  if (Object.keys(sorted).length) {
    const { error } = await from("exam_questions")
      .update({ ...sorted, updated_at: now() } as never)
      .eq("id", id);
    if (missingSections(error)) throw new Error(SECTIONS_NOT_READY);
    if (missingProof(error)) throw new Error(PROOF_NOT_READY);
    if (missingMains(error) && /model_|master_topic/.test(error!.message))
      throw new Error(MAINS_NOT_READY);
    if (missingCheck(error)) throw new Error(CHECK_NOT_READY);
    fail(error);
    const rest = Object.keys(patch).filter((k) => !(k in sorted));
    if (!rest.length) return;
  }
  const { q: old, has } = await questionById(id);
  if ((patch.proof || patch.also_correct) && !has.proof) throw new Error(PROOF_NOT_READY);
  const row: Record<string, unknown> = { updated_at: now() };
  for (const k of [
    "question_en",
    "question_hi",
    "extra_en",
    "extra_hi",
    "explanation_en",
    "explanation_hi",
  ] as const)
    if (patch[k] !== undefined) row[k] = String(patch[k]).trim().slice(0, 6000);
  for (const k of ["unit", "part"] as const)
    if (patch[k] !== undefined) row[k] = String(patch[k]).trim().slice(0, 60);
  for (const k of ["marks", "word_limit"] as const) if (patch[k] !== undefined) row[k] = patch[k];
  if (patch.options)
    row.options = Array.from({ length: OPTION_COUNT }, (_, i) => ({
      en: String(patch.options![i]?.en ?? "")
        .trim()
        .slice(0, 1000),
      hi: String(patch.options![i]?.hi ?? "")
        .trim()
        .slice(0, 1000),
    }));
  const deleted = patch.deleted ?? old.deleted;
  if (patch.deleted !== undefined) row.deleted = patch.deleted;
  if (patch.correct !== undefined || patch.deleted !== undefined)
    row.correct = deleted ? null : patch.correct !== undefined ? patch.correct : old.correct;
  const correct = (row.correct as number | null | undefined) ?? (deleted ? null : old.correct);
  if (has.proof && (patch.also_correct !== undefined || "correct" in row))
    row.also_correct = cleanAlso(patch.also_correct ?? old.also_correct, correct);
  // What really changed (the editor sends every field when saving).
  const textChanged = (k: keyof ExamQuestion) =>
    k in row && !sameText(row[k] as string, old[k] as string);
  const optionsChanged =
    !!row.options &&
    (row.options as { en: string; hi: string }[]).some(
      (o, i) => !sameText(o.en, old.options[i]?.en) || !sameText(o.hi, old.options[i]?.hi),
    );
  const changed = {
    question:
      optionsChanged ||
      (["question_en", "question_hi", "extra_en", "extra_hi"] as const).some(textChanged) ||
      (["unit", "part", "marks", "word_limit"] as const).some((k) => k in row && row[k] !== old[k]),
    answer:
      deleted !== old.deleted ||
      correct !== old.correct ||
      (has.proof &&
        "also_correct" in row &&
        (row.also_correct as number[]).join() !== (old.also_correct ?? []).join()),
    explanation: (["explanation_en", "explanation_hi"] as const).some(textChanged),
  };
  // The key's note is settled once the key is set by hand.
  if (patch.correct !== undefined || patch.deleted !== undefined) row.key_note = "";
  if (has.proof) {
    Object.assign(
      row,
      proofAfter(
        old,
        {
          explanation_en: (row.explanation_en as string) ?? old.explanation_en,
          explanation_hi: (row.explanation_hi as string) ?? old.explanation_hi,
        },
        changed,
        { ...patch.proof, ...(patch.verified !== undefined ? { verified: patch.verified } : {}) },
      ),
    );
  } else if (patch.verified !== undefined) row.verified = patch.verified;
  else if (changed.question || changed.answer || changed.explanation) row.verified = false;
  fail(
    (
      await from("exam_questions")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteQuestion(id: string) {
  await assertDraft({ question: id });
  fail((await from("exam_questions").delete().eq("id", id)).error);
}

// A published paper is changed only after unpublishing it.
async function assertDraft(where: { paper?: string; question?: string }) {
  let paperId = where.paper;
  if (!paperId && where.question) {
    const { data } = await from("exam_questions")
      .select("paper_id")
      .eq("id", where.question)
      .maybeSingle();
    paperId = (data as { paper_id: string } | null)?.paper_id;
  }
  if (!paperId) return;
  const { data, error } = await from("exam_papers").select("status").eq("id", paperId).single();
  if (error && /status/.test(error.message)) return;
  fail(error);
  if ((data as unknown as { status: string }).status === "published")
    throw new Error("This paper is published: unpublish it to make changes.");
}

// The papers the other features use: published ones (all of them before the
// proofreading migration).
export async function publishedPaperIds(): Promise<string[]> {
  const { data, error } = await from("exam_papers").select("id").eq("status", "published");
  if (error && /status/.test(error.message)) {
    const { data: all } = await from("exam_papers").select("id");
    return ((all ?? []) as { id: string }[]).map((r) => r.id);
  }
  fail(error);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// ---------- Explanations ----------

const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);

// The next questions without an explanation (or those asked for again)
// explained from SAATHI's books, a few per call. Returns how many are left.
export async function explainStep(
  paperId: string,
  redo: string[] = [],
): Promise<{ done: number; left: number; total: number }> {
  await assertDraft({ paper: paperId });
  const { paper } = await getPaper(paperId);
  const { proof: proofCols, questions } = await selectQuestions(paperId);
  if (isWritten(paper)) throw new Error("A written paper has model answers, not explanations.");
  // A language section's questions: explained in that language only.
  const { lang: langFor } = await paperSectionsOf(paper);
  const wanted = (q: ExamQuestion) =>
    redo.length ? redo.includes(q.id) : !q.explanation_en && !q.explanation_hi;
  const todo = questions.filter(wanted);
  const batch = todo.slice(0, EXPLAIN_BATCH);
  if (!batch.length) return { done: 0, left: 0, total: questions.length };
  const { data: subj } = await supabaseAdmin
    .from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((subj ?? []) as { subject: string }[]).map((r) => r.subject)),
  ].filter(Boolean);
  let k = 0;
  const items = await Promise.all(
    batch.map(async (q) => {
      const answer = q.correct ? q.options[q.correct - 1] : null;
      const text = [
        q.question_en || q.question_hi,
        q.extra_en || q.extra_hi,
        answer?.en || answer?.hi,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1000);
      const matches = subjects.length
        ? await saathiSearchQuery(apiKey(), rpc, { standalone: text, english: null }, subjects)
            .then((m) => relevantMatches(m).slice(0, 3))
            .catch(() => [])
        : [];
      const passages = matches.map((m) => ({
        k: ++k,
        title: matchLabel(m),
        content: m.content.slice(0, 1500),
      }));
      // A पर्यायवाची / विलोम / अर्थ question: the words' Hindi WordNet
      // meanings too (when it is loaded in the card studio).
      const wq = [q.question_hi, q.question_en].filter(Boolean).join("\n");
      if (WN.wordQuestion(wq)) {
        const words = WN.wordQuestionWords(
          q.question_hi || q.question_en,
          q.options.map((o) => o.hi || o.en),
        );
        const content = words.length
          ? await import("@/lib/flash-studio.server")
              .then((m) => m.wordnetSenses(words))
              .then((f) => WN.wnPassage(f, 2500))
              .catch(() => "")
          : "";
        if (content) passages.push({ k: ++k, title: WN.WN_CREDIT, content });
      }
      return { q, passages };
    }),
  );
  const { glossary } = await CA.getMagazineSettings();
  const { hindiGuide } = await import("../../supabase/functions/_shared/ca-hindi.ts");
  const out = parseExplanations(
    await saathiComplete(
      apiKey(),
      explainMessages(
        items.map(({ q, passages }) => ({
          n: q.q_no,
          question: [q.question_en, q.question_hi].filter(Boolean).join("\n"),
          extra: [q.extra_en, q.extra_hi].filter(Boolean).join("\n"),
          options: q.options.map((o) => [o.en, o.hi].filter(Boolean).join(" / ")),
          correct: q.correct,
          also: q.also_correct,
          deleted: q.deleted,
          passages,
          lang: langFor(q),
        })),
        hindiGuide(glossary),
      ),
    ),
  );
  if (!out.size) throw new Error("The AI's explanations couldn't be read: try again.");
  let done = 0;
  for (const { q, passages } of items) {
    const e = out.get(q.q_no);
    if (!e) continue;
    const used = passages.filter((p) => e.from.includes(p.k));
    fail(
      (
        await from("exam_questions")
          .update({
            // A language question: never a translation.
            explanation_en: langFor(q) === "hi" ? "" : e.en,
            explanation_hi: langFor(q) === "en" ? "" : e.hi,
            explanation_source: [...new Set(used.map((p) => p.title))].join("; ").slice(0, 500),
            explanation_general: !used.length,
            // A new explanation is proofread again (and needed for
            // finishing now that there is one).
            verified: false,
            ...(proofCols ? { proof_explanation: false } : {}),
            updated_at: now(),
          } as never)
          .eq("id", q.id)
      ).error,
    );
    done++;
  }
  const left = redo.length ? Math.max(0, todo.length - batch.length) : todo.length - done;
  return { done, left, total: questions.length };
}

// ---------- Subjects and the AI check ----------

// The next questions not checked (or changed since, or asked for again):
// sorted into subject sections and topics (where not set by hand) and
// checked, a batch per AI call. Returns how many are left.
export async function reviewStep(
  paperId: string,
  redo: string[] = [],
): Promise<{ done: number; left: number; total: number }> {
  await assertDraft({ paper: paperId });
  const { data: p, error } = await from("exam_papers").select("*").eq("id", paperId).single();
  fail(error);
  const written = isWritten(p as unknown as { kind?: string });
  const { ready, questions, proof, sections: sectionCols } = await selectQuestions(paperId);
  if (!ready) throw new Error(CHECK_NOT_READY);
  // Tagging on the exam's syllabus, and the paper's sections (after the
  // paper_sections migration).
  const tagging = sectionCols ? await paperTagging(p as unknown as ExamPaper) : null;
  const langFor = (q: ExamQuestion) =>
    tagging ? langOf(tagging.sections, sectionOf(tagging.ranges, q)) : null;
  const paperSections =
    tagging && needsSorting(tagging.ranges)
      ? tagging.sections.filter((x) => tagging.ranges.some((r) => r.key === x.key))
      : null;
  const context =
    tagging && (tagging.lines.length || paperSections)
      ? tagContext({
          syllabus: tagging.syllabus?.title ?? "",
          lines: tagging.lines,
          oldSyllabus: tagging.old,
          sections: paperSections,
        })
      : undefined;
  const wanted = (q: ExamQuestion) => (redo.length ? redo.includes(q.id) : !checkedNow(q));
  const todo = questions.filter(wanted);
  const batch = todo.slice(0, CHECK_BATCH);
  if (!batch.length) return { done: 0, left: 0, total: questions.length };
  const out = parseReview(
    await saathiComplete(
      apiKey(),
      reviewMessages(
        batch.map((q) => ({
          n: q.q_no,
          question_en: [q.question_en, q.extra_en].filter(Boolean).join("\n"),
          question_hi: [q.question_hi, q.extra_hi].filter(Boolean).join("\n"),
          options_en: q.options.map((o) => o.en),
          options_hi: q.options.map((o) => o.hi),
          correct: q.correct,
          also: q.also_correct,
          deleted: q.deleted,
          explanation_en: q.explanation_en,
          explanation_hi: q.explanation_hi,
          written: written ? { marks: q.marks ?? null, words: q.word_limit ?? null } : null,
          lang: langFor(q),
        })),
        (p as unknown as { exam: string }).exam,
        context,
      ),
    ),
    batch.map((q) => q.q_no),
  );
  if (!out.size) throw new Error("The AI's check couldn't be read: try again.");
  let done = 0;
  for (const q of batch) {
    const r = out.get(q.q_no);
    if (!r) continue;
    // A question deleted by the key: no key to doubt.
    // Its syllabus line (when not tagged yet), its section (when no range
    // covers it) and difficulty (when not set): subject and topic follow the
    // line.
    const t = tagging
      ? readTag(
          r.raw,
          tagging.lines,
          tagging.ranges.map((x) => x.key),
        )
      : null;
    const sorted =
      t?.section &&
      paperSections &&
      !tagging!.ranges.some((x) => x.from && x.to && q.q_no >= x.from && q.q_no <= x.to)
        ? t.section
        : null;
    // A language question has no translation to compare (its section as
    // just sorted counts).
    const qLang = langFor({ ...q, paper_section: sorted ?? q.paper_section });
    const issues = (q.deleted ? r.issues.filter((i) => i.kind !== "key") : r.issues).filter(
      (i) => i.kind !== "language" || !qLang,
    );
    const node = t?.node && !q.syllabus_node_id ? t.node : null;
    const tag = node ? tagging!.tags[node] : null;
    fail(
      (
        await from("exam_questions")
          .update({
            ...(tag
              ? {
                  syllabus_node_id: node,
                  subject_section: tag.subject || r.subject,
                  topic_en: tag.topic_en,
                  topic_hi: tag.topic_hi,
                }
              : {
                  ...(q.subject_section ? {} : { subject_section: r.subject }),
                  ...(q.topic_en || q.topic_hi
                    ? {}
                    : { topic_en: r.topic.en, topic_hi: r.topic.hi }),
                }),
            ...(sorted ? { paper_section: sorted } : {}),
            ...(proof && t?.difficulty && !q.difficulty ? { difficulty: t.difficulty } : {}),
            ai_check: {
              issues,
              suggest: q.deleted ? null : r.suggest,
              sig: checkSig(q),
              at: now(),
            },
          } as never)
          .eq("id", q.id)
      ).error,
    );
    done++;
  }
  const left = redo.length ? Math.max(0, todo.length - batch.length) : todo.length - done;
  return { done, left, total: questions.length };
}

// ---------- Publishing ----------

// A test for students: the paper as printed (Hindi and English together),
// its explanations and source.
export async function publishPaper(paperId: string, minutes?: number) {
  const { paper, questions } = await getPaper(paperId);
  if (paper.status === "published") return paper;
  if (!questions.length) throw new Error("This paper has no questions.");
  const left = questions.filter((q) => !q.verified).length;
  if (left)
    throw new Error(
      `${left} question${left === 1 ? " isn't" : "s aren't"} proofread yet (question and answer, and the explanation where one is written).`,
    );
  // A written paper: for the notes and the other features, no students' test.
  if (isWritten(paper)) {
    fail(
      (
        await from("exam_papers")
          .update({ status: "published", published_at: now(), updated_at: now() } as never)
          .eq("id", paperId)
      ).error,
    );
    return (await getPaper(paperId)).paper;
  }
  const usable = questions.filter((q) => !q.deleted && q.correct);
  const join = (a: string, b: string) => (a && b && a !== b ? `${a}\n${b}` : a || b);
  const { data: first } = await from("mcq_tests")
    .select("order_index")
    .order("order_index", { ascending: true })
    .limit(1);
  const order = ((first ?? []) as { order_index: number }[])[0]?.order_index ?? 0;
  const { data: test, error: tErr } = await from("mcq_tests")
    .insert({
      name: [paper.exam, paper.subject].filter(Boolean).join(" — ").slice(0, 200),
      description: `Previous year paper${paper.conducted_by ? ` (${paper.conducted_by})` : ""} · ${usable.length} questions with explanations`,
      order_index: order - 1,
      duration_seconds: Math.max(600, Math.round((minutes ?? usable.length * 1.2) * 60)),
    } as never)
    .select("id")
    .single();
  fail(tErr);
  const testId = (test as unknown as { id: string }).id;
  try {
    const rows = usable.map((q, i) => {
      const sections = [
        q.also_correct?.length
          ? {
              title: "Also accepted / ये भी सही",
              body: `Option ${q.also_correct.join(", ")} (answer key) / विकल्प ${q.also_correct.join(", ")} (उत्तर कुंजी)`,
            }
          : null,
        q.explanation_hi ? { title: "व्याख्या", body: q.explanation_hi } : null,
        q.explanation_en && q.explanation_en !== q.explanation_hi
          ? { title: "Explanation", body: q.explanation_en }
          : null,
        q.explanation_general || q.explanation_source
          ? {
              title: "Source / स्रोत",
              body: q.explanation_general
                ? "General knowledge / सामान्य ज्ञान"
                : q.explanation_source,
            }
          : null,
      ].filter(Boolean);
      return {
        test_id: testId,
        order_index: i,
        question: `${q.q_no}. ${join(q.question_hi, q.question_en)}`,
        question_ext: join(q.extra_hi, q.extra_en),
        option_1: join(q.options[0].hi, q.options[0].en),
        option_2: join(q.options[1].hi, q.options[1].en),
        option_3: join(q.options[2].hi, q.options[2].en),
        option_4: join(q.options[3].hi, q.options[3].en),
        answer: q.correct,
        explanation_sections: sections,
      };
    });
    for (let i = 0; i < rows.length; i += 200)
      fail((await from("mcq_questions").insert(rows.slice(i, i + 200) as never)).error);
    fail(
      (
        await from("exam_papers")
          .update({
            status: "published",
            published_at: now(),
            mcq_test_id: testId,
            updated_at: now(),
          } as never)
          .eq("id", paperId)
      ).error,
    );
  } catch (e) {
    await from("mcq_tests").delete().eq("id", testId);
    throw e;
  }
  await syncPyqSafely();
  return (await getPaper(paperId)).paper;
}

// Back to a draft: the students' test is taken down.
export async function unpublishPaper(paperId: string) {
  const { paper } = await getPaper(paperId);
  if (paper.mcq_test_id) fail((await from("mcq_tests").delete().eq("id", paper.mcq_test_id)).error);
  fail(
    (
      await from("exam_papers")
        .update({
          status: "draft",
          published_at: null,
          mcq_test_id: null,
          updated_at: now(),
        } as never)
        .eq("id", paperId)
    ).error,
  );
  await syncPyqSafely();
  return (await getPaper(paperId)).paper;
}

// ---------- Previous year questions as practice sets ----------

const missingPyq = (e: { message: string } | null) => !!e && /from_papers/.test(e.message);
export const PYQ_NOT_READY =
  "Practice sets from papers need a database update: run the latest migration (pyq_practice) in Lovable or the SQL editor.";

// The MCQ practice sets made from the published papers, made again: by
// subject section and topic (sets made by hand are never touched).
export async function syncPyqSets(): Promise<{ sets: number; questions: number }> {
  const probe = await from("mcq_practice_tests").select("id").eq("from_papers", true).limit(1);
  if (missingPyq(probe.error)) throw new Error(PYQ_NOT_READY);
  fail(probe.error);
  const { data: papers, error } = await from("exam_papers")
    .select("id,exam,exam_date")
    .eq("status", "published");
  fail(error);
  const all: PyqQuestion[] = [];
  for (const p of (papers ?? []) as { id: string; exam: string; exam_date: string | null }[]) {
    const { ready, questions } = await selectQuestions(p.id);
    if (!ready) break;
    all.push(...questions.map((q) => ({ ...q, exam: p.exam, exam_date: p.exam_date })));
  }
  const sets = pyqSets(all);
  // After the sets made by hand.
  const { data: last } = await from("mcq_practice_tests")
    .select("order_index")
    .eq("from_papers", false)
    .order("order_index", { ascending: false })
    .limit(1);
  const after = ((last ?? []) as { order_index: number }[])[0]?.order_index ?? 0;
  fail((await from("mcq_practice_tests").delete().eq("from_papers", true)).error);
  let count = 0;
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const { data: t, error: tErr } = await from("mcq_practice_tests")
      .insert({
        name: set.name.slice(0, 200),
        description: set.description.slice(0, 500),
        subject: set.subject,
        topic: set.topic.slice(0, 200),
        order_index: after + 1 + i,
        from_papers: true,
      } as never)
      .select("id")
      .single();
    fail(tErr);
    const id = (t as unknown as { id: string }).id;
    const rows = set.questions.map((q, k) => ({ test_id: id, ...pyqRow(q, k) }));
    for (let k = 0; k < rows.length; k += 200)
      fail((await from("mcq_practice_questions").insert(rows.slice(k, k + 200) as never)).error);
    count += rows.length;
  }
  return { sets: sets.length, questions: count };
}

// Publishing never fails on the practice sets (before their migration too).
async function syncPyqSafely() {
  try {
    await syncPyqSets();
  } catch (e) {
    console.error("practice sets from papers:", e);
  }
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
      const r = sorted.get(q.q_no) ?? { ca: false, search: "", section: null };
      const row = {
        ca: r.ca,
        // The words to find its story by, until it's matched.
        match_note: r.ca ? `search: ${r.search}` : null,
        section: r.section,
        match: null,
        matched_item: null,
      };
      let { error } = await from("exam_questions")
        .update(row as never)
        .eq("id", q.id);
      // Before the "Asked before" migration: no section.
      if (error && /section/.test(error.message)) {
        const { section: _s, ...rest } = row;
        ({ error } = await from("exam_questions")
          .update(rest as never)
          .eq("id", q.id));
      }
      fail(error);
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
