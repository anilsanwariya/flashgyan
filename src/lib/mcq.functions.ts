import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export type ExplanationSection = { title: string; body: string };

export type McqTest = {
  id: string;
  name: string;
  description: string;
  order_index: number;
  duration_seconds: number;
};

export type McqTestSummary = McqTest & { question_count: number };

export type McqQuestion = {
  id: string;
  test_id: string;
  order_index: number;
  question: string;
  question_ext: string;
  image_url: string | null;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  answer: number;
  explanation_sections: ExplanationSection[];
};

// ---------- Public reads ----------

export const listMcqTests = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data: tests, error } = await supabase
    .from("mcq_tests")
    .select("id, name, description, order_index, duration_seconds")
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const { data: qs, error: qErr } = await supabase
    .from("mcq_questions")
    .select("test_id");
  if (qErr) throw new Error(qErr.message);
  const counts = new Map<string, number>();
  for (const r of qs ?? []) counts.set(r.test_id, (counts.get(r.test_id) ?? 0) + 1);
  return (tests ?? []).map((t) => ({
    ...t,
    question_count: counts.get(t.id) ?? 0,
  })) as McqTestSummary[];
});

export const getMcqTest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ test: McqTest; questions: McqQuestion[] }> => {
    const supabase = publicClient();
    const { data: test, error: tErr } = await supabase
      .from("mcq_tests")
      .select("id, name, description, order_index, duration_seconds")
      .eq("id", data.id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!test) throw new Error("Test not found");
    const { data: rows, error } = await supabase
      .from("mcq_questions")
      .select(
        "id, test_id, order_index, question, question_ext, image_url, option_1, option_2, option_3, option_4, answer, explanation_sections",
      )
      .eq("test_id", data.id)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const questions = (rows ?? []).map((r) => ({
      ...r,
      explanation_sections: Array.isArray(r.explanation_sections)
        ? (r.explanation_sections as unknown as ExplanationSection[])
        : [],
    })) as McqQuestion[];
    return { test: test as McqTest, questions };
  });

// ---------- Admin schemas ----------

const explanationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const testMetaSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  order_index: z.number().int(),
  duration_seconds: z.number().int().min(10).max(60 * 60 * 6),
});

const importRowSchema = z.object({
  order_index: z.number().int(),
  question: z.string().min(1),
  question_ext: z.string().default(""),
  option_1: z.string().min(1),
  option_2: z.string().min(1),
  option_3: z.string().min(1),
  option_4: z.string().min(1),
  answer: z.number().int().min(1).max(4),
  explanation_sections: z.array(explanationSchema).default([]),
});

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
  return supabaseAdmin;
}

// ---------- Admin: tests ----------

export const listMcqTestsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return listMcqTests();
  });

export const createMcqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testMetaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: inserted, error } = await supabaseAdmin
      .from("mcq_tests")
      .insert({
        name: data.name.trim(),
        description: data.description.trim(),
        order_index: data.order_index,
        duration_seconds: data.duration_seconds,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const updateMcqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    testMetaSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_tests")
      .update({
        name: data.name.trim(),
        description: data.description.trim(),
        order_index: data.order_index,
        duration_seconds: data.duration_seconds,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMcqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("mcq_tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: questions ----------

export const bulkImportMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        test_id: z.string().uuid(),
        rows: z.array(importRowSchema).min(1).max(5000),
        mode: z.enum(["append", "replace"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    if (data.mode === "replace") {
      const { error: delErr } = await supabaseAdmin
        .from("mcq_questions")
        .delete()
        .eq("test_id", data.test_id);
      if (delErr) throw new Error(delErr.message);
    }
    const payload = data.rows.map((r) => ({
      test_id: data.test_id,
      order_index: r.order_index,
      question: r.question.trim(),
      question_ext: r.question_ext.trim(),
      option_1: r.option_1.trim(),
      option_2: r.option_2.trim(),
      option_3: r.option_3.trim(),
      option_4: r.option_4.trim(),
      answer: r.answer,
      explanation_sections: r.explanation_sections,
    }));
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("mcq_questions").insert(slice);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

export const updateMcqQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        order_index: z.number().int(),
        question: z.string().min(1),
        question_ext: z.string().default(""),
        image_url: z.string().nullable(),
        option_1: z.string().min(1),
        option_2: z.string().min(1),
        option_3: z.string().min(1),
        option_4: z.string().min(1),
        answer: z.number().int().min(1).max(4),
        explanation_sections: z.array(explanationSchema).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin.from("mcq_questions").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMcqQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_questions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMcqQuestionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), image_url: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_questions")
      .update({ image_url: data.image_url })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Generate a long-lived signed URL for an uploaded image (private bucket).
export const signMcqImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("mcq-images")
      .createSignedUrl(data.path, 60 * 60 * 24 * 365 * 10); // 10 years
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const uploadMcqImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const ext = data.filename.split(".").pop() || "png";
    const path = `${data.id}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(data.dataBase64, "base64");
    const { error: upErr } = await supabaseAdmin.storage
      .from("mcq-images")
      .upload(path, bytes, { upsert: true, contentType: data.contentType });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("mcq-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (sErr) throw new Error(sErr.message);
    const { error: dbErr } = await supabaseAdmin
      .from("mcq_questions")
      .update({ image_url: signed.signedUrl })
      .eq("id", data.id);
    if (dbErr) throw new Error(dbErr.message);
    return { path, url: signed.signedUrl };
  });
