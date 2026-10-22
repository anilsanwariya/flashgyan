// Admin server functions for collecting news from the watched websites.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UPLOAD_SECTIONS } from "@/lib/current-affairs";
import type {
  BackfillDay,
  CaArticle,
  CaBackfill,
  CaRun,
  TickResult,
  WatchSite,
} from "@/lib/ca-collect.server";

export type { BackfillDay, CaArticle, CaBackfill, CaRun, TickResult, WatchSite };
export type Collection = { run: CaRun | null; articles: CaArticle[]; sites: WatchSite[] };

async function server() {
  return import("@/lib/ca-collect.server");
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
const sectionIds = UPLOAD_SECTIONS.map((s) => s.id) as [string, ...string[]];

export const getCaCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<Collection> => {
    await assertAdmin(context.userId);
    return (await server()).getCollection(data.date);
  });

export const startCaCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ date: dateSchema, sites: z.array(z.string().uuid()).min(1).max(100).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaRun> => {
    await assertAdmin(context.userId);
    return (await server()).startRun(data.date, "admin", data.sites);
  });

// One tick of work, run from the admin page while it is open.
export const runCaCollectionTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string().url().max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<TickResult> => {
    await assertAdmin(context.userId);
    return (await server()).tick(new URL(data.origin).origin);
  });

export const setCaArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["selected", "skipped"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setArticleStatus(data.id, data.status);
    return { ok: true };
  });

export const setCaArticlesStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(["selected", "skipped"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    for (const id of data.ids) await s.setArticleStatus(id, data.status);
    return { ok: true };
  });

export const saveCaWatchSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        url: z
          .string()
          .trim()
          .url("Enter the full address, starting with https://")
          .max(500)
          .refine((u) => /^https?:\/\//i.test(u), "Use an http(s) address"),
        name: z.string().trim().min(1).max(100),
        section: z.enum(sectionIds),
        language: z.enum(["Hindi", "English", "Bilingual"]),
        max_articles: z.number().int().min(1).max(50),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (
      await server()
    ).saveSite(data as Parameters<Awaited<ReturnType<typeof server>>["saveSite"]>[0]);
    return { ok: true };
  });

export const deleteCaWatchSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteSite(data.id);
    return { ok: true };
  });

// Reads a site now without saving anything, to check it works.
export const testCaWatchSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        url: z.string().trim().url().max(500),
        name: z.string().trim().max(100),
        section: z.enum(["editorial", "news", "pib", "dipr", "other"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const r = await (
      await server()
    ).readSite({ url: data.url, name: data.name || data.url, section: data.section });
    return { method: r.method, error: r.error, count: r.links.length, links: r.links.slice(0, 15) };
  });

export const listCaWatchSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WatchSite[]> => {
    await assertAdmin(context.userId);
    return (await server()).getSites();
  });

// ---------- Past-date collections ----------

export const getCaBackfill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).getBackfill();
  });

export const startCaBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: dateSchema,
        to: dateSchema,
        sites: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaBackfill> => {
    await assertAdmin(context.userId);
    return (await server()).startBackfill(data.from, data.to, data.sites, "admin");
  });

export const setCaBackfillStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["pause", "resume", "stop"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setBackfillStatus(data.id, data.action);
    return { ok: true };
  });
