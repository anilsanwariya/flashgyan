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

export type McqPracticeTest = {
  id: string;
  name: string;
  description: string;
  subject: string;
  topic: string;
  order_index: number;
};

export type McqPracticeTestSummary = McqPracticeTest & { question_count: number };

export type McqPracticeQuestion = {
  id: string;
  test_id: string;
  order_index: number;
  question: string;
  hint: string;
  image_url: string | null;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  answer: number;
  explanation_sections: ExplanationSection[];
};

// ---------- Public reads ----------

export const listMcqPracticeTests = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data: tests, error } = await supabase
    .from("mcq_practice_tests")
    .select("id, name, description, subject, topic, order_index")
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const { data: qs, error: qErr } = await supabase
    .from("mcq_practice_questions")
    .select("test_id");
  if (qErr) throw new Error(qErr.message);
  const counts = new Map<string, number>();
  for (const r of qs ?? []) counts.set(r.test_id, (counts.get(r.test_id) ?? 0) + 1);
  return (tests ?? []).map((t) => ({
    ...t,
    question_count: counts.get(t.id) ?? 0,
  })) as McqPracticeTestSummary[];
});

export const getMcqPracticeTest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ test: McqPracticeTest; questions: McqPracticeQuestion[] }> => {
    const supabase = publicClient();
    const { data: test, error: tErr } = await supabase
      .from("mcq_practice_tests")
      .select("id, name, description, subject, topic, order_index")
      .eq("id", data.id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!test) throw new Error("Practice set not found");
    const { data: rows, error } = await supabase
      .from("mcq_practice_questions")
      .select(
        "id, test_id, order_index, question, hint, image_url, option_1, option_2, option_3, option_4, answer, explanation_sections",
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
    })) as McqPracticeQuestion[];
    return { test: test as McqPracticeTest, questions };
  });

// ---------- Admin ----------

const explanationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const testMetaSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  subject: z.string().max(200).default(""),
  topic: z.string().max(200).default(""),
  order_index: z.number().int(),
});

const importRowSchema = z.object({
  order_index: z.number().int(),
  question: z.string().min(1),
  hint: z.string().default(""),
  option_1: z.string().min(1),
  option_2: z.string().min(1),
  option_3: z.string().min(1),
  option_4: z.string().min(1),
  answer: z.number().int().min(1).max(4),
  explanation_sections: z.array(explanationSchema).default([]),
});

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin role required");
  return supabaseAdmin;
}

export const createMcqPracticeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testMetaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: inserted, error } = await supabaseAdmin
      .from("mcq_practice_tests")
      .insert({
        name: data.name.trim(),
        description: data.description.trim(),
        subject: data.subject.trim(),
        topic: data.topic.trim(),
        order_index: data.order_index,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const updateMcqPracticeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    testMetaSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_practice_tests")
      .update({
        name: data.name.trim(),
        description: data.description.trim(),
        subject: data.subject.trim(),
        topic: data.topic.trim(),
        order_index: data.order_index,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMcqPracticeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("mcq_practice_tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportMcqPractice = createServerFn({ method: "POST" })
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
        .from("mcq_practice_questions")
        .delete()
        .eq("test_id", data.test_id);
      if (delErr) throw new Error(delErr.message);
    }
    const payload = data.rows.map((r) => ({
      test_id: data.test_id,
      order_index: r.order_index,
      question: r.question.trim(),
      hint: r.hint.trim(),
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
      const { error } = await supabaseAdmin.from("mcq_practice_questions").insert(slice);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

export const updateMcqPracticeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        order_index: z.number().int(),
        question: z.string().min(1),
        hint: z.string().default(""),
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
    const { error } = await supabaseAdmin.from("mcq_practice_questions").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMcqPracticeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_practice_questions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMcqPracticeQuestionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), image_url: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("mcq_practice_questions")
      .update({ image_url: data.image_url })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadMcqPracticeImage = createServerFn({ method: "POST" })
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
    const path = `practice/${data.id}/${Date.now()}.${ext}`;
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
      .from("mcq_practice_questions")
      .update({ image_url: signed.signedUrl })
      .eq("id", data.id);
    if (dbErr) throw new Error(dbErr.message);
    return { path, url: signed.signedUrl };
  });
