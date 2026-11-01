// Admin server functions for exam papers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaperSummary, CheckProgress } from "@/lib/exam-papers.server";

export type { PaperSummary, CheckProgress };

async function server() {
  return import("@/lib/exam-papers.server");
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

const id = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const meta = z.object({
  exam: z.string().trim().max(200),
  subject: z.string().trim().max(200),
  conducted_by: z.string().trim().max(100),
  exam_date: dateSchema.nullable(),
  paper_code: z.string().trim().max(60).optional(),
  series: z.string().trim().max(20).optional(),
  paper_type: z.string().trim().max(40).optional(),
  sections: z
    .array(
      z.object({
        key: z.string().max(30),
        from: z.number().int().min(1).max(1000).nullable(),
        to: z.number().int().min(1).max(1000).nullable(),
      }),
    )
    .max(12)
    .optional(),
  exam_syllabus_id: z.string().uuid().nullable().optional(),
});
const bi = z.object({ en: z.string().max(4000), hi: z.string().max(4000) });
const draft = z.object({
  q_no: z.number().int().min(1).max(1000),
  question_en: z.string().max(4000),
  question_hi: z.string().max(4000),
  extra_en: z.string().max(4000),
  extra_hi: z.string().max(4000),
  options: z.array(bi).max(4),
  correct: z.number().int().min(1).max(4).nullable().optional(),
  deleted: z.boolean().optional(),
  explanation_en: z.string().max(6000).optional(),
  explanation_hi: z.string().max(6000).optional(),
  explanation_source: z.string().max(4000).optional(),
  explanation_general: z.boolean().optional(),
  key_note: z.string().max(4000).optional(),
  subject_section: z.string().max(80).optional(),
  topic_en: z.string().max(80).optional(),
  topic_hi: z.string().max(80).optional(),
  unit: z.string().max(60).optional(),
  part: z.string().max(60).optional(),
  marks: z.number().int().min(0).max(1000).nullable().optional(),
  word_limit: z.number().int().min(0).max(5000).nullable().optional(),
  model_answer: z.string().max(20000).optional(),
  model_source: z.string().max(200).optional(),
  also_correct: z.array(z.number().int().min(1).max(4)).max(3).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
});
const keyEntry = z.object({
  q_no: z.number().int().min(1).max(1000),
  correct: z.number().int().min(1).max(4).nullable(),
  deleted: z.boolean(),
  also: z.array(z.number().int().min(1).max(4)).max(3).optional(),
});
const image = z.object({
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(10).max(8_000_000),
});

export const listExamPapers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const [list, lessons] = await Promise.all([s.listPapers(), s.lessonsInUse()]);
    return { ...list, lessons };
  });

export const getExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const got = await s.getPaper(data.id);
    const stories = await s.matchedStories(
      got.questions.map((q) => q.matched_item).filter((x): x is string => !!x),
    );
    // The master outline's topics the questions are filed under.
    const ids = [
      ...new Set(got.questions.map((q) => q.master_topic_id).filter((x): x is string => !!x)),
    ];
    const topics = ids.length ? await (await import("@/lib/outline.server")).topicNames(ids) : {};
    return {
      ...got,
      stories,
      topics,
      lessons: await s.lessonsInUse(),
      syllabus: await s.paperSyllabus(got.paper.syllabus_id).catch(() => null),
      // The exam's syllabus to tag on, its lines and tags, and the sections.
      tagging: await s.paperTagging(got.paper).catch(() => null),
    };
  });

// The paper sections (a setting): GK & GS, Hindi, English…
export const getExamSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).getSections();
  });

export const saveExamSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sections: z
          .array(
            z.object({
              key: z.string().max(30),
              name_en: z.string().max(60),
              name_hi: z.string().max(60),
              lang: z.enum(["en", "hi"]).nullable(),
            }),
          )
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveSections(data.sections);
  });

// The old syllabus a paper followed (or none).
export const setExamPaperSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, syllabus_id: id.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setPaperSyllabus(data.id, data.syllabus_id);
    return { ok: true };
  });

export const createExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meta,
        pages: z.number().int().min(0).max(500),
        kind: z.enum(["objective", "subjective"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createPaper(data.meta, "pdf", data.pages, data.kind);
  });

export const updateExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, meta: meta.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updatePaper(data.id, data.meta);
    return { ok: true };
  });

export const deleteExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deletePaper(data.id);
    return { ok: true };
  });

// One page of a question paper, as an image (made in the browser).
export const readExamPaperPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        page: z.number().int().min(1).max(500),
        pages: z.number().int().min(1).max(500),
        image,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readPaperPage(data.id, data.page, data.pages, data.image);
  });

// An answer key read in the browser (a text PDF or Excel), or an image the
// AI reads.
export const applyExamKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        entries: z.array(keyEntry).max(1000).optional(),
        image: image.optional(),
        // The paper's series, when the editor just picked it.
        series: z.string().trim().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    if (data.image) return s.keyFromImage(data.id, data.image, data.series);
    return s.applyKey(data.id, data.entries ?? [], data.series);
  });

export const importExamPapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        papers: z
          .array(
            z.object({
              exam: z.string().trim().max(200),
              subject: z.string().trim().max(200),
              questions: z.array(draft).max(1000),
              kind: z.enum(["objective", "subjective"]).optional(),
            }),
          )
          .max(50),
        conducted_by: z.string().trim().max(100),
        exam_date: dateSchema.nullable(),
        // The type, sections and syllabus chosen in the form, for every paper.
        paper_type: meta.shape.paper_type,
        sections: meta.shape.sections,
        exam_syllabus_id: meta.shape.exam_syllabus_id,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).importPapers(data.papers, {
      conducted_by: data.conducted_by,
      exam_date: data.exam_date,
      paper_type: data.paper_type,
      sections: data.sections,
      exam_syllabus_id: data.exam_syllabus_id,
    });
  });

export const updateExamQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        patch: z.object({
          question_en: z.string().max(4000).optional(),
          question_hi: z.string().max(4000).optional(),
          extra_en: z.string().max(4000).optional(),
          extra_hi: z.string().max(4000).optional(),
          options: z.array(bi).max(4).optional(),
          correct: z.number().int().min(1).max(4).nullable().optional(),
          deleted: z.boolean().optional(),
          explanation_en: z.string().max(6000).optional(),
          explanation_hi: z.string().max(6000).optional(),
          verified: z.boolean().optional(),
          subject_section: z.string().max(80).optional(),
          topic_en: z.string().max(80).optional(),
          topic_hi: z.string().max(80).optional(),
          unit: z.string().max(60).optional(),
          part: z.string().max(60).optional(),
          marks: z.number().int().min(0).max(1000).nullable().optional(),
          word_limit: z.number().int().min(0).max(5000).nullable().optional(),
          model_answer: z.string().max(20000).optional(),
          model_source: z.string().max(200).optional(),
          master_topic_id: id.nullable().optional(),
          also_correct: z.array(z.number().int().min(1).max(4)).max(3).optional(),
          difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
          paper_section: z.string().max(30).optional(),
          syllabus_node_id: id.nullable().optional(),
          proof: z
            .object({
              question: z.boolean().optional(),
              answer: z.boolean().optional(),
              explanation: z.boolean().optional(),
            })
            .optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updateQuestion(data.id, data.patch);
    return { ok: true };
  });

export const deleteExamQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteQuestion(data.id);
    return { ok: true };
  });

// One step of checking a paper against the magazine (the page loops).
export const checkExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, restart: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    if (data.restart) await s.resetCheck(data.id);
    return s.checkStep(data.id);
  });

export const setExamLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lesson: z.string().trim().min(1).max(300), on: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).useLesson(data.lesson, data.on);
  });

// Explanations from SAATHI's books, a few questions per call (the page
// loops); `redo` writes these questions' explanations again.
export const explainExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, redo: z.array(id).max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).explainStep(data.id, data.redo ?? []);
  });

// A paper's questions filed under the master outlines' topics, a batch at a
// time.
export const linkExamTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, skip: z.array(id).max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { linkPaperTopics } = await import("@/lib/outline.server");
    return linkPaperTopics(data.id, data.skip ?? []);
  });

// Subjects, topics and the AI check, a batch at a time.
export const reviewExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, redo: z.array(id).max(50).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).reviewStep(data.id, data.redo ?? []);
  });

// Publishing (every question verified): a test for students too.
export const publishExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, minutes: z.number().int().min(10).max(600).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).publishPaper(data.id, data.minutes);
  });

// The MCQ practice sets made from published papers, made again.
export const syncExamPyqSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).syncPyqSets();
  });

export const unpublishExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).unpublishPaper(data.id);
  });

// The question bank: every objective paper's questions, small, for filters
// and progress reports.
export const examQuestionBank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await import("@/lib/exam-bank.server")).questionBank();
  });

// Questions in full (for proofreading across papers), and their papers.
export const examBankQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(id).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).questionsByIds(data.ids);
  });

// ---------- Export sets ----------

const exportServer = () => import("@/lib/exam-export.server");
const lang = z.enum(["hi", "en"]);
const bankFilter = z
  .object({
    exam: z.string().max(300).optional(),
    year: z.string().max(10).optional(),
    paper: z.string().max(60).optional(),
    subject: z.string().max(300).optional(),
    topic: z.string().max(400).optional(),
    subtopic: z.string().max(400).optional(),
    section: z.string().max(60).optional(),
    difficulty: z.string().max(10).optional(),
    search: z.string().max(200).optional(),
  })
  .passthrough();

export const listExportSets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await exportServer()).listSets();
  });

export const createExportSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().max(120), filter: bankFilter }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await exportServer()).createSet(data.name, data.filter);
  });

export const updateExportSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        name: z.string().max(120).optional(),
        titles: z
          .object({ hi: z.string().max(40), en: z.string().max(40) })
          .partial()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await exportServer()).updateSet(data.id, data);
    return { ok: true };
  });

export const deleteExportSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await exportServer()).deleteSet(data.id);
    return { ok: true };
  });

export const downloadExportSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, lang }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await exportServer()).downloadSet(data.id, data.lang);
  });

export const importExportIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        lang,
        rows: z
          .array(
            z.object({
              id: z.string().max(120),
              order: z.number().int().nullable(),
              text: z.string().max(8000),
            }),
          )
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await exportServer()).importIds(data.id, data.lang, data.rows);
  });

export const clearExportRemoved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, lang }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await exportServer()).clearRemoved(data.id, data.lang);
  });
