// Admin server functions for newspaper clipping.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NewspaperSummary } from "@/lib/ca-clips.server";

export type { NewspaperSummary };

async function server() {
  return import("@/lib/ca-clips.server");
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
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const part = z.object({
  page: z.number().int().min(1).max(500),
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  w: z.number().min(-2).max(2),
  h: z.number().min(-2).max(2),
  // A new image for this box (JPEG, base64).
  image: z.string().min(10).max(6_000_000).optional(),
});

export const startCaNewspaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        issue_date: date,
        source_name: z.string().trim().min(1).max(120),
        official: z.boolean(),
        pages: z.number().int().min(1).max(500),
        file_size: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).startNewspaper(data);
  });

export const listCaNewspapers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listNewspapers(data.date);
  });

export const getCaNewspaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getNewspaper(data.id);
  });

export const renameCaNewspaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id, source_name: z.string().trim().min(1).max(120), official: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).renameNewspaper(data.id, data.source_name, data.official);
    return { ok: true };
  });

export const deleteCaNewspaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, with_sources: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteNewspaper(data.id, data.with_sources);
    return { ok: true };
  });

export const saveCaClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ newspaper_id: id, id: id.optional(), parts: z.array(part).min(1).max(6) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveClip(data);
  });

export const deleteCaClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteClip(data.id);
    return { ok: true };
  });

export const readCaClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readClip(data.id);
  });

// The clippings a story's sources were read from (reader, story images).
export const getCaSourceClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ source_ids: z.array(id).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).clipsOfSources(data.source_ids);
  });

// Suggested articles: a page's suggestions (its image and text lines sent
// from the browser, which has the PDF open), all of them, and one dropped.
const line = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  text: z.string().max(400),
});
export const suggestCaClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        newspaper_id: id,
        page: z.number().int().min(1).max(500),
        // A page as a JPEG (base64), at most about 6 MB.
        image: z.string().min(100).max(8_000_000),
        lines: z.array(line).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestPage(data);
  });

export const getCaClipSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ newspaper_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getSuggestions(data.newspaper_id);
  });

export const dropCaClipSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        newspaper_id: id,
        page: z.number().int().min(1).max(500),
        headline: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).dropSuggestion(data.newspaper_id, data.page, data.headline);
  });
