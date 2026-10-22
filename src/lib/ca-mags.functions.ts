// Admin server functions for custom magazines.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MagItem, MagSummary } from "@/lib/ca-mags.server";

export type { MagItem, MagSummary };

async function server() {
  return import("@/lib/ca-mags.server");
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const id = z.string().uuid();
const name = z.object({
  id: z.string().min(1).max(80),
  en: z.string().trim().min(1).max(60),
  hi: z.string().trim().max(60),
});

export const listCaMags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listMags();
  });

export const createCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title_en: z.string().trim().min(3).max(120),
        title_hi: z.string().trim().max(120).optional(),
        theme: z.string().trim().min(3).max(600),
        date_from: dateSchema,
        date_to: dateSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createMag(data);
  });

export const getCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getMag(data.id);
  });

// One unit of work now (the page's "Speed up"): stories sorted in, topics
// joined, combined articles written or subsections re-sorted.
export const fillCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const step = await (await server()).stepMag(data.id);
    return { done: !step, step };
  });

export const updateCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        patch: z
          .object({
            title_en: z.string().trim().min(3).max(120),
            title_hi: z.string().trim().max(120),
            theme: z.string().trim().min(3).max(600),
            date_from: dateSchema,
            date_to: dateSchema,
          })
          .partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).updateMag(data.id, data.patch);
  });

export const saveCaMagSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        sections: z.array(name.extend({ subs: z.array(name).max(30) })).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveSections(data.id, data.sections);
  });

export const placeCaMagStories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        ids: z.array(id).min(1).max(500),
        section: z.string().min(1).max(80),
        sub: z.string().min(1).max(80).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).placeStories(data.id, data.ids, data.section, data.sub);
    return { ok: true };
  });

export const setCaMagStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, status: z.enum(["growing", "final"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setMagStatus(data.id, data.status);
    return { ok: true };
  });

export const deleteCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteMag(data.id);
    return { ok: true };
  });

export const buildCaMagPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).buildMagPdf(data.id);
  });

// The magazine as it prints, for the preview.
export const previewCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, lang: z.enum(["en", "hi"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { html: (await (await server()).magHtml(data.id, data.lang)).html };
  });

// ---------- Combined articles ----------

export const joinCaMagStories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, ids: z.array(id).min(2).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { combined: await (await server()).joinStories(data.id, data.ids) };
  });

// Writes a combined article now (also adds the stories waiting for it).
export const writeCaMagTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).writeCombined(data.id);
    return { ok: true };
  });

export const splitCaMagTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).splitTopic(data.id);
    return { ok: true };
  });

export const takeOutCaMagStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).takeOut(data.id);
    return { ok: true };
  });

export const updateCaMagFromDaily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updateFromDaily(data.id);
    return { ok: true };
  });
