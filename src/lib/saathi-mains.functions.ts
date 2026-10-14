// Server functions for SAATHI answer writing (RAS Mains): word limits, model
// answers, blueprints, previews and scores. Everything except the public list
// of answer formats is admin-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_WORD_LIMITS,
  MAINS_DIRECTIVES,
  type BlueprintDirective,
} from "../../supabase/functions/_shared/saathi-mains.ts";
import type {
  Blueprint,
  BlueprintScore,
  ModelAnswer,
  RebuildResult,
  WrittenAnswer,
} from "@/lib/saathi-mains.server";

export type { Blueprint, BlueprintScore, ModelAnswer, RebuildResult, WrittenAnswer };

async function server() {
  return import("@/lib/saathi-mains.server");
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
  return admin;
}

const from = async (table: string) => (await getAdmin()).from(table as never);

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist/i.test(e.message ?? ""));

const directiveSchema = z.enum(MAINS_DIRECTIVES);
const blueprintDirectiveSchema = z.enum([...MAINS_DIRECTIVES, "any"]);
const marksSchema = z.number().int().min(1).max(50);

// ---------- Word limits ----------

export type AnswerFormat = { marks: number; word_limit: number; enabled: boolean };

const defaultFormats = (): AnswerFormat[] =>
  Object.entries(DEFAULT_WORD_LIMITS).map(([marks, word_limit]) => ({
    marks: Number(marks),
    word_limit,
    enabled: true,
  }));

// Public: the marks options students can pick on the SAATHI page.
export const listSaathiAnswerFormats = createServerFn({ method: "GET" }).handler(
  async (): Promise<AnswerFormat[]> => {
    const { data, error } = await (
      await from("saathi_answer_formats")
    )
      .select("marks,word_limit,enabled")
      .eq("enabled", true)
      .order("marks");
    if (error) {
      if (isMissing(error)) return defaultFormats();
      throw new Error(error.message);
    }
    return (data ?? []) as unknown as AnswerFormat[];
  },
);

export const adminListAnswerFormats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnswerFormat[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("saathi_answer_formats" as never)
      .select("marks,word_limit,enabled")
      .order("marks");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AnswerFormat[];
  });

// Saving a word limit rebuilds that marks band's blueprints, whose word
// budgets depend on it.
export const saveAnswerFormat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        marks: marksSchema,
        word_limit: z.number().int().min(5).max(1000),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: before } = await admin
      .from("saathi_answer_formats" as never)
      .select("word_limit")
      .eq("marks", data.marks)
      .maybeSingle();
    const { error } = await admin
      .from("saathi_answer_formats" as never)
      .upsert({ ...data, updated_at: new Date().toISOString() } as never);
    if (error) throw new Error(error.message);
    const prevLimit = (before as { word_limit: number } | null)?.word_limit;
    if (prevLimit !== undefined && prevLimit !== data.word_limit) {
      await (await server()).rebuildBlueprints(data.marks, true);
    }
    return { ok: true };
  });

export const deleteAnswerFormat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ marks: marksSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("saathi_answer_formats" as never)
      .delete()
      .eq("marks", data.marks);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Model answers ----------

export const listModelAnswers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ModelAnswer[]> => {
    const admin = await assertAdmin(context.userId);
    const { MODEL_ANSWER_COLS } = await server();
    const { data, error } = await admin
      .from("saathi_model_answers" as never)
      .select(MODEL_ANSWER_COLS)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ModelAnswer[];
  });

const modelAnswerSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(4000),
  answer: z.string().trim().min(1).max(30_000),
  marks: marksSchema,
  directive: directiveSchema.nullish(),
  year: z.number().int().min(1950).max(2100).nullish(),
  paper: z.string().trim().max(60).nullish(),
  subject: z.string().trim().max(120).nullish(),
  source: z.string().trim().max(300).nullish(),
  holdout: z.boolean().default(false),
  // Bulk imports rebuild once at the end instead of after every answer.
  rebuild: z.boolean().default(true),
});

export const saveModelAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => modelAnswerSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ answer: ModelAnswer; rebuilt: RebuildResult[] }> => {
      await assertAdmin(context.userId);
      const s = await server();
      const { rebuild, ...input } = data;
      const { answer, oldMarks } = await s.saveModelAnswer(input);
      const rebuilt: RebuildResult[] = [];
      if (rebuild) {
        rebuilt.push(...(await s.rebuildBlueprints(answer.marks)));
        if (oldMarks !== null && oldMarks !== answer.marks) {
          rebuilt.push(...(await s.rebuildBlueprints(oldMarks)));
        }
      }
      return { answer, rebuilt };
    },
  );

export const reanalyseModelAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const answer = await s.analyseModelAnswer(data.id);
    const rebuilt = await s.rebuildBlueprints(answer.marks);
    return { answer, rebuilt };
  });

export const deleteModelAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: rows, error } = await admin
      .from("saathi_model_answers" as never)
      .delete()
      .eq("id", data.id)
      .select("marks");
    if (error) throw new Error(error.message);
    const marks = (rows as { marks: number }[] | null)?.[0]?.marks;
    const rebuilt = marks ? await (await server()).rebuildBlueprints(marks) : [];
    return { ok: true, rebuilt };
  });

// ---------- Blueprints ----------

export type BlueprintWithScore = Blueprint & { avg_score: number | null; scored: number };

export const listBlueprints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlueprintWithScore[]> => {
    const admin = await assertAdmin(context.userId);
    const [bps, scores] = await Promise.all([
      admin
        .from("saathi_blueprints" as never)
        .select("*")
        .order("marks")
        .order("directive")
        .order("version", { ascending: false })
        .limit(1000),
      admin
        .from("saathi_blueprint_scores" as never)
        .select("blueprint_id,total")
        .limit(5000),
    ]);
    if (bps.error) throw new Error(bps.error.message);
    const totals = new Map<string, number[]>();
    for (const s of (scores.data ?? []) as { blueprint_id: string | null; total: number }[]) {
      if (!s.blueprint_id) continue;
      const list = totals.get(s.blueprint_id) ?? [];
      list.push(Number(s.total));
      totals.set(s.blueprint_id, list);
    }
    return ((bps.data ?? []) as unknown as Blueprint[]).map((b) => {
      const list = totals.get(b.id) ?? [];
      return {
        ...b,
        scored: list.length,
        avg_score: list.length ? Math.round(list.reduce((a, c) => a + c, 0) / list.length) : null,
      };
    });
  });

export const rebuildSaathiBlueprints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ marks: z.array(marksSchema).max(50).optional(), force: z.boolean().default(false) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RebuildResult[]> => {
    const admin = await assertAdmin(context.userId);
    let marks = data.marks;
    if (!marks) {
      const { data: rows, error } = await admin
        .from("saathi_model_answers" as never)
        .select("marks");
      if (error) throw new Error(error.message);
      const { data: bps } = await admin
        .from("saathi_blueprints" as never)
        .select("marks")
        .eq("status", "active");
      marks = [
        ...new Set(
          [...((rows ?? []) as { marks: number }[]), ...((bps ?? []) as { marks: number }[])].map(
            (r) => r.marks,
          ),
        ),
      ];
    }
    const s = await server();
    const out: RebuildResult[] = [];
    for (const m of [...new Set(marks)].sort((a, b) => a - b)) {
      out.push(...(await s.rebuildBlueprints(m, data.force)));
    }
    return out;
  });

export const editBlueprintGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), guide: z.string().trim().min(10).max(6000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).editBlueprintGuide(data.id, data.guide);
  });

export const createBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        marks: marksSchema,
        directive: blueprintDirectiveSchema,
        guide: z.string().trim().max(6000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createManualBlueprint(
      data.marks,
      data.directive as BlueprintDirective,
      data.guide ?? null,
    );
  });

export const activateBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).activateBlueprint(data.id);
    return { ok: true };
  });

export const setBlueprintLocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), locked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("saathi_blueprints" as never)
      .update({ locked: data.locked } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Stops using a blueprint; SAATHI falls back to the marks band's general one
// or the built-in structure.
export const retireBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("saathi_blueprints" as never)
      .update({ status: "archived" } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Try it and scores ----------

export const previewMainsAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        marks: marksSchema.nullish(),
        subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WrittenAnswer> => {
    await assertAdmin(context.userId);
    return (await server()).writeMainsAnswer({
      question: data.question,
      marks: data.marks ?? null,
      subjects: data.subjects,
    });
  });

export const scoreModelAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answer_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<BlueprintScore> => {
    await assertAdmin(context.userId);
    return (await server()).scoreModelAnswer(data.answer_id);
  });

export const listBlueprintScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlueprintScore[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("saathi_blueprint_scores" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BlueprintScore[];
  });
