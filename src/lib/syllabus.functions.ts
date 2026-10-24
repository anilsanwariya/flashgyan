// Admin server functions for the syllabus library.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SyllabusSummary } from "@/lib/syllabus.server";

export type { SyllabusSummary };

async function server() {
  return import("@/lib/syllabus.server");
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
const stage = z.enum(["prelims", "mains", "single"]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const image = z.object({
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(10).max(8_000_000),
});
const nodePatch = z.object({
  kind: z.enum(["paper", "unit", "part", "heading", "subheading", "line"]).optional(),
  text_en: z.string().max(2000).optional(),
  text_hi: z.string().max(2000).optional(),
  section: z.string().max(80).optional(),
  marks: z.number().int().min(0).max(1000).nullable().optional(),
});

export const listSyllabi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listSyllabi();
  });

export const createSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        body: z.string().trim().max(60),
        stage,
        notified_on: date,
        pages: z.number().int().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createSyllabus(data);
  });

export const getSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getSyllabus(data.id);
  });

export const readSyllabusPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        page: z.number().int().min(1).max(200),
        pages: z.number().int().min(1).max(200),
        enText: z.string().max(40000).nullable().optional(),
        enImage: image.nullable().optional(),
        hiImage: image.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readSyllabusPage(data.id, data.page, data.pages, data);
  });

export const readSyllabusScheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, text: z.string().min(20).max(40000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readSyllabusScheme(data.id, data.text);
  });

export const updateSyllabusExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        patch: z.object({
          name: z.string().trim().min(2).max(120).optional(),
          body: z.string().trim().max(60).optional(),
          stage: stage.optional(),
          notified_on: date.optional(),
          status: z.enum(["draft", "final"]).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).updateSyllabusExam(data.id, data.patch);
  });

export const deleteSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteSyllabus(data.id);
    return { ok: true };
  });

export const resetSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).resetSyllabus(data.id);
    return { ok: true };
  });

export const updateSyllabusNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, patch: nodePatch }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updateSyllabusNode(data.id, data.patch);
    return { ok: true };
  });

export const addSyllabusNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ exam: id, after: id.nullable(), patch: nodePatch }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { id: await (await server()).addSyllabusNode(data.exam, data.after, data.patch) };
  });

export const deleteSyllabusNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteSyllabusNode(data.id);
    return { ok: true };
  });
