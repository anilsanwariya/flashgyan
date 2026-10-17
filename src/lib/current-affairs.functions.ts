// Admin server functions for the current affairs magazine.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CATEGORIES,
  UPLOAD_SECTIONS,
  cleanDomains,
  type MagazineSettings,
} from "@/lib/current-affairs";
import type {
  CaCorrection,
  CaIssue,
  CaItem,
  CaSource,
  DayData,
} from "@/lib/current-affairs.server";

export type { CaCorrection, CaIssue, CaItem, CaSource, DayData };

async function server() {
  return import("@/lib/current-affairs.server");
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
const kindSchema = z.enum(["daily", "monthly"]);
const sectionIds = UPLOAD_SECTIONS.map((s) => s.id) as [string, ...string[]];
const categoryIds = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const bi = z.object({ en: z.string().max(4000), hi: z.string().max(4000) });
const contentSchema = z.object({
  headline: bi,
  summary: bi,
  points: z.array(bi).max(20),
  why: bi,
  background: bi.nullable(),
  mcq: z
    .object({
      question: bi,
      options: z.array(bi).length(4),
      answer: z.number().int().min(0).max(3),
      explanation: bi,
    })
    .nullable(),
  mains: bi.nullable(),
  dyk: z
    .array(
      bi.extend({
        url: z.string().url().max(2000),
        site: z.string().max(200),
        quote: z.string().max(1000),
      }),
    )
    .max(5)
    .optional(),
  // Checked and cleaned by cleanVisual in the handler.
  visual: z.unknown().optional(),
  visual_covers: z.array(z.number().int().min(0).max(100)).max(50).optional(),
  oneliner: bi.nullable().optional(),
  quick: z.object({ q: bi, a: bi }).nullable().optional(),
});

// ---------- Settings ----------

export const getMagazineSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<MagazineSettings & { pdf_ready: boolean; web_search_ready: boolean }> => {
      await assertAdmin(context.userId);
      const settings = await (await server()).getMagazineSettings();
      return {
        ...settings,
        pdf_ready: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
        web_search_ready: Boolean(process.env.TAVILY_API_KEY),
      };
    },
  );

// Sends this week's quality report to the test chat now.
export const sendCaWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const { sendWeeklyReport } = await import("@/lib/ca-report.server");
    return sendWeeklyReport(origin);
  });

export const saveMagazineSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.string().trim().max(100),
        post_time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
        title_en: z.string().trim().min(1).max(80),
        title_hi: z.string().trim().min(1).max(80),
        brand_line: z.string().trim().max(100),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #6d28d9"),
        test_chat_id: z.string().trim().max(40),
        add_to_knowledge_base: z.boolean(),
        do_you_know: z.boolean(),
        trusted_domains: z.array(z.string().max(200)).max(100),
        auto_collect: z.boolean(),
        collect_time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
        notify_when_ready: z.boolean(),
        visuals: z.boolean(),
        daily_stories: z.number().int().min(3).max(40),
        daily_editorials: z.number().int().min(0).max(6),
        channel_quiz: z.boolean(),
        channel_quiz_count: z.number().int().min(1).max(10),
        add_to_flashcards: z.boolean(),
        weekly_report: z.boolean(),
        min_rajasthan: z.number().int().min(0).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveMagazineSettings({
      ...data,
      trusted_domains: cleanDomains(data.trusted_domains),
    });
  });

// One tiny request to each AI service, to see which one is failing and why.
export const checkAiServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { saathiCheckProviders } =
      await import("../../supabase/functions/_shared/saathi-core.ts");
    return saathiCheckProviders();
  });

export const uploadMagazineLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["main", "partner"]),
        contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        base64: z.string().min(1).max(4_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    return (await server()).uploadLogo(data.kind, bytes, data.contentType);
  });

// ---------- Sources and items ----------

export const getCaDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<DayData> => {
    await assertAdmin(context.userId);
    return (await server()).getDay(data.date);
  });

export const addCaSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        issue_date: dateSchema,
        section: z.enum(sectionIds),
        source_name: z.string().trim().max(120),
        title: z.string().trim().min(1).max(300),
        content: z.string().trim().min(20).max(600_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaSource> => {
    await assertAdmin(context.userId);
    return (await server()).addSource(
      data as Parameters<Awaited<ReturnType<typeof server>>["addSource"]>[0],
    );
  });

export const extractCaSourcePart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), part: z.number().int().min(0).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).extractSourceChunk(data.id, data.part);
  });

export const deleteCaSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteSource(data.id);
    return { ok: true };
  });

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });

export const deleteCaSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { deleted: await (await server()).deleteSources(data.ids) };
  });

export const deleteCaItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { deleted: await (await server()).deleteItems(data.ids) };
  });

export const clearCaCollectedDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).clearCollectedDay(data.date);
  });

export const enrichCaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).enrichItem(data.id);
  });

export const updateCaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        category: z.enum(categoryIds).optional(),
        status: z.enum(["included", "dropped"]).optional(),
        position: z.number().int().min(0).max(100_000).optional(),
        importance: z.number().int().min(1).max(3).optional(),
        content: contentSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    if (patch.content && patch.content.visual !== undefined) {
      const { cleanVisual } = await import("@/lib/ca-visuals");
      patch.content.visual = cleanVisual(patch.content.visual).visual;
    }
    return (await server()).updateItem(
      id,
      patch as Parameters<Awaited<ReturnType<typeof server>>["updateItem"]>[1],
    );
  });

export const deleteCaPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).deletePoint(data.id, data.text);
  });

export const redoCaVisual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).redoVisual(data.id);
  });

export const decideCaCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).decideCorrection(data.id, data.approve);
    return { ok: true };
  });

// ---------- Issues ----------

export const previewCaIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, period: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<{ html: string; count: number }> => {
    await assertAdmin(context.userId);
    const { html, count } = await (await server()).issueHtml(data.kind, data.period);
    return { html, count };
  });

export const buildCaIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        period: dateSchema,
        schedule: z.boolean(),
        when: z.string().datetime().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaIssue> => {
    await assertAdmin(context.userId);
    return (await server()).buildIssue(data.kind, data.period, {
      schedule: data.schedule,
      when: data.when ?? null,
    });
  });

export const cancelCaIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, period: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<CaIssue> => {
    await assertAdmin(context.userId);
    return (await server()).cancelIssue(data.kind, data.period);
  });

export const postCaIssueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, period: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<CaIssue> => {
    await assertAdmin(context.userId);
    return (await server()).postIssueNow(data.kind, data.period);
  });

export const sendCaIssueTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, period: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).sendTestIssue(data.kind, data.period);
    return { ok: true };
  });

// ---------- Month ----------

export type MonthSummary = {
  days: { date: string; items: number; status: CaIssue["status"] | null }[];
  issue: CaIssue | null;
  corrections: (CaCorrection & { item_date: string; headline: string })[];
};

export const getCaMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: dateSchema }).parse(d))
  .handler(async ({ data, context }): Promise<MonthSummary> => {
    await assertAdmin(context.userId);
    const s = await server();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { monthRange } = await import("@/lib/current-affairs");
    const range = monthRange(data.month);
    const [items, issues, corrections] = await Promise.all([
      supabaseAdmin
        .from("ca_items" as never)
        .select("issue_date")
        .gte("issue_date", range.from)
        .lte("issue_date", range.to)
        .eq("status", "included"),
      supabaseAdmin
        .from("ca_issues" as never)
        .select("*")
        .gte("period", range.from)
        .lte("period", range.to),
      s.listCorrections(range.from, range.to),
    ]);
    const counts = new Map<string, number>();
    for (const r of (items.data ?? []) as { issue_date: string }[]) {
      counts.set(r.issue_date, (counts.get(r.issue_date) ?? 0) + 1);
    }
    const all = (issues.data ?? []) as unknown as CaIssue[];
    const daily = new Map(all.filter((i) => i.kind === "daily").map((i) => [i.period, i.status]));
    const days = [...new Set([...counts.keys(), ...daily.keys()])]
      .sort()
      .map((date) => ({ date, items: counts.get(date) ?? 0, status: daily.get(date) ?? null }));
    return {
      days,
      issue: all.find((i) => i.kind === "monthly" && i.period === range.from) ?? null,
      corrections,
    };
  });

// ---------- Monthly background article ----------

const featureSchema = z.object({
  topic: bi,
  title: bi,
  intro: bi,
  sections: z
    .array(z.object({ heading: bi, body: bi }))
    .min(1)
    .max(8),
  sources: z.array(z.string().max(300)).max(20),
  included: z.boolean(),
  created_at: z.string().max(40),
});

export const getCaFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getFeature(data.month);
  });

export const suggestCaFeatureTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestFeatureTopics(data.month);
  });

export const writeCaFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: dateSchema,
        topic: bi,
        query: z.string().trim().min(2).max(300),
        stories: z.array(z.string().max(400)).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).writeFeature(data.month, data);
  });

export const saveCaFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month: dateSchema, feature: featureSchema.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveFeature(data.month, data.feature);
  });

export const mergeCaDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).mergeDayDuplicates(data.date);
  });
