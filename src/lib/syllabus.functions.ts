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
    const [syllabus, links] = await Promise.all([
      (await server()).getSyllabus(data.id),
      // Each line's master topics (none before the outlines' migration).
      (await outlines()).linksForExam(data.id).catch(() => ({})),
    ]);
    return { ...syllabus, links };
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

// ---------- Master outlines ----------

async function outlines() {
  return import("@/lib/outline.server");
}
const section = z.string().trim().min(2).max(80);
const names = z.object({
  name_en: z.string().trim().max(160).optional(),
  name_hi: z.string().trim().max(160).optional(),
});

export const listOutlines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await outlines()).listOutlines();
  });

export const getOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ section }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await outlines()).getOutline(data.section);
  });

export const makeOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ section, replace: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await outlines()).makeOutline(data.section, data.replace ?? false);
  });

export const fitOutlineLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ section }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await outlines()).fitLines(data.section);
  });

export const addMasterTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        section,
        parent: id.nullable(),
        name_en: z.string().trim().max(160),
        name_hi: z.string().trim().max(160),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return {
      id: await (await outlines()).addTopic(data.section, data.parent, data.name_en, data.name_hi),
    };
  });

export const updateMasterTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, patch: names }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await outlines()).updateTopic(data.id, data.patch);
    return { ok: true };
  });

export const deleteMasterTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await outlines()).deleteTopic(data.id);
    return { ok: true };
  });

export const moveMasterTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, dir: z.union([z.literal(-1), z.literal(1)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await outlines()).moveTopic(data.id, data.dir);
    return { ok: true };
  });

export const setSyllabusLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ node: id, topic: id, on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await outlines()).setLink(data.node, data.topic, data.on);
    return { ok: true };
  });
