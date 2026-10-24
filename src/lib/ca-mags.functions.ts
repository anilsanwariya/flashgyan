// Admin server functions for custom magazines.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SPECIAL_MAX, SPECIAL_MIN } from "@/lib/ca-specials";
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

export const createCaExamSpecial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        exam: z.string().trim().min(1).max(120),
        date_from: dateSchema,
        date_to: dateSchema,
        size: z.number().int().min(SPECIAL_MIN).max(SPECIAL_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createExamSpecial(data);
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

// ---------- Cover and ads, Telegram, background articles ----------

export const getCaMagDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getMagDesign(data.id);
  });

export const saveCaMagDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, design: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveMagDesign(data.id, data.design);
  });

// The PDFs to the channel, or to the editor's test chat.
export const postCaMag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, test: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).postMag(data.id, data.test);
    return { ok: true };
  });

export const writeCaMagFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, section: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).writeSectionFeature(data.id, data.section);
  });

export const removeCaMagFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, section: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).removeSectionFeature(data.id, data.section);
    return { ok: true };
  });

// ---------- Material and websites ----------

export const listCaMagMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listMaterials(data.id);
  });

export const addCaMagMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        title: z.string().trim().max(300),
        source_name: z.string().trim().max(120),
        content: z.string().min(1).max(600_000).optional(),
        url: z.string().url().max(2000).optional(),
        date: dateSchema.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let { content, title } = data;
    // A web page: read it first.
    if (!content && data.url) {
      const { readPage } = await import("@/lib/ca-collect.server");
      const page = await readPage(data.url);
      if (!page) throw new Error("That page couldn't be read.");
      content = page.text;
      title = title || page.title;
    }
    if (!content) throw new Error("Add a file, a link or some text.");
    return (await server()).addMaterial(data.id, {
      title,
      source_name: data.source_name || (data.url ? new URL(data.url).hostname : "Material"),
      content,
      date: data.date ?? null,
      url: data.url ?? null,
    });
  });

export const deleteCaMagMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, source: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteMaterial(data.id, data.source);
    return { ok: true };
  });

export const setCaMagSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, sites: z.array(id).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setMagSites(data.id, data.sites);
    return { ok: true };
  });

export const collectCaMagSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).collectMagSites(data.id);
    return { ok: true };
  });
