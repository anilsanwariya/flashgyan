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
});
const keyEntry = z.object({
  q_no: z.number().int().min(1).max(1000),
  correct: z.number().int().min(1).max(4).nullable(),
  deleted: z.boolean(),
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
    return { ...got, stories, lessons: await s.lessonsInUse() };
  });

export const createExamPaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meta, pages: z.number().int().min(0).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createPaper(data.meta, "pdf", data.pages);
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
            }),
          )
          .max(50),
        conducted_by: z.string().trim().max(100),
        exam_date: dateSchema.nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).importPapers(data.papers, {
      conducted_by: data.conducted_by,
      exam_date: data.exam_date,
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
