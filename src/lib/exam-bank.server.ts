// Server-only: the question bank, every objective paper's questions in one
// small list (their checks, tags and sections), for filtering and progress
// reports on the admin page.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentSyllabi, getSections } from "@/lib/exam-papers.server";
import { finished, type ExamPaper } from "@/lib/exam-papers";
import { cleanRanges, guessSyllabus, sectionOf, syllabusTags, type Tag } from "@/lib/exam-sections";
import { examTitle } from "@/lib/syllabus";
import { yearOf, type BankPaper, type BankRow } from "@/lib/exam-bank";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;

const BASE = "id,paper_id,q_no,question_en,question_hi,deleted,verified,subject_section,topic_en";
// Each optional group, dropped when its migration hasn't run.
const GROUPS = [
  { cols: ",has_explanation", miss: /has_explanation/, alt: ",explanation_en,explanation_hi" },
  {
    cols: ",proof_question,proof_answer,proof_explanation,difficulty",
    miss: /proof_|difficulty/,
    alt: "",
  },
  { cols: ",paper_section,syllabus_node_id", miss: /paper_section|syllabus_node_id/, alt: "" },
];

async function allQuestions(): Promise<Row[]> {
  const on = GROUPS.map(() => true);
  for (;;) {
    const cols = BASE + GROUPS.map((g, i) => (on[i] ? g.cols : g.alt)).join("");
    const rows: Row[] = [];
    let missed = -1;
    for (let at = 0; ; at += 1000) {
      const { data, error } = await from("exam_questions")
        .select(cols)
        .order("id")
        .range(at, at + 999);
      if (error) {
        missed = GROUPS.findIndex((g, i) => on[i] && g.miss.test(error.message));
        if (missed < 0) fail(error);
        break;
      }
      rows.push(...((data ?? []) as Row[]));
      if ((data ?? []).length < 1000) break;
    }
    if (missed < 0) return rows;
    on[missed] = false;
  }
}

// The tags of the syllabus lines used (each line's whole syllabus read for
// its headings).
async function tagsFor(nodeIds: string[]): Promise<Map<string, Tag>> {
  const exams = new Set<string>();
  for (let i = 0; i < nodeIds.length; i += 200) {
    const { data } = await from("syllabus_nodes")
      .select("exam_id")
      .in("id", nodeIds.slice(i, i + 200));
    for (const r of (data ?? []) as { exam_id: string }[]) exams.add(r.exam_id);
  }
  const out = new Map<string, Tag>();
  for (const examId of exams) {
    const { data } = await from("syllabus_nodes")
      .select("id,kind,text_en,text_hi,section")
      .eq("exam_id", examId)
      .order("position");
    for (const [k, v] of syllabusTags((data ?? []) as never)) out.set(k, v);
  }
  return out;
}

export async function questionBank(): Promise<{
  ready: boolean;
  papers: BankPaper[];
  rows: BankRow[];
}> {
  const { data, error } = await from("exam_papers").select("*");
  if (error && /exam_papers|schema cache/.test(error.message))
    return { ready: false, papers: [], rows: [] };
  fail(error);
  // Objective papers only (written ones have model answers, not keys).
  const raw = ((data ?? []) as unknown as ExamPaper[]).filter((p) => p.kind !== "subjective");
  const syllabi = await currentSyllabi();
  const sections = await getSections();
  const papers: BankPaper[] = raw.map((p) => {
    const syl =
      (p.exam_syllabus_id && syllabi.find((s) => s.id === p.exam_syllabus_id)) ||
      guessSyllabus(p.exam, syllabi);
    return {
      id: p.id,
      exam: p.exam,
      examName: syl
        ? examTitle(syl as never)
        : p.exam
            .replace(/\b(19|20)\d{2}\b/g, "")
            .replace(/\s+/g, " ")
            .trim(),
      year: yearOf(p.exam_date, p.exam),
      published: p.status === "published",
    };
  });
  const byId = new Map(raw.map((p) => [p.id, p]));
  const ranges = new Map(raw.map((p) => [p.id, cleanRanges(p.sections, sections)]));
  const qs = (await allQuestions()).filter((q) => byId.has(String(q.paper_id)));
  const tags = await tagsFor([
    ...new Set(qs.map((q) => q.syllabus_node_id).filter((x): x is string => !!x)),
  ]);
  const rows: BankRow[] = qs.map((q) => {
    const verified = q.verified === true;
    const x =
      q.has_explanation !== undefined
        ? q.has_explanation === true
        : !!(String(q.explanation_en ?? "").trim() || String(q.explanation_hi ?? "").trim());
    const proof = {
      proof_question: (q.proof_question as boolean | undefined) ?? verified,
      proof_answer: (q.proof_answer as boolean | undefined) ?? verified,
      proof_explanation: (q.proof_explanation as boolean | undefined) ?? (verified && x),
    };
    const tag = q.syllabus_node_id ? tags.get(String(q.syllabus_node_id)) : undefined;
    return {
      id: String(q.id),
      paper: String(q.paper_id),
      n: Number(q.q_no),
      text: String(q.question_en || q.question_hi || "").slice(0, 160),
      deleted: q.deleted === true,
      q: proof.proof_question,
      a: proof.proof_answer,
      e: proof.proof_explanation,
      x,
      done: finished({
        ...proof,
        verified,
        explanation_en: x ? "x" : "",
        explanation_hi: "",
      }),
      tagged: !!tag,
      subject: tag?.subject || String(q.subject_section ?? ""),
      topic: tag?.topic_en || String(q.topic_en ?? ""),
      subtopic: tag?.subtopic_en ?? "",
      section: sectionOf(ranges.get(String(q.paper_id)) ?? [], {
        q_no: Number(q.q_no),
        paper_section: (q.paper_section as string | undefined) ?? "",
      }),
      difficulty: String(q.difficulty ?? ""),
    };
  });
  rows.sort((a, b) => a.paper.localeCompare(b.paper) || a.n - b.n);
  return { ready: true, papers, rows };
}
