// Admin server functions for the current affairs magazine.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CATEGORIES,
  MAX_STATICS,
  UPLOAD_SECTIONS,
  cleanDomains,
  type MagazineSettings,
} from "@/lib/current-affairs";
import type {
  CaCorrection,
  CaIssue,
  CaItem,
  CaSource,
  CaVersion,
  DayData,
  FactCheck,
  ReaderSource,
  SkippedArticle,
} from "@/lib/current-affairs.server";

export type {
  CaCorrection,
  CaIssue,
  CaItem,
  CaSource,
  CaVersion,
  DayData,
  FactCheck,
  ReaderSource,
  SkippedArticle,
};

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
const keyword = z.object({ en: z.string().trim().max(80), hi: z.string().trim().max(80) });
const factSchema = z.object({
  text: z.string().max(4000),
  quote: z.string().max(4000),
  source_id: z.string().uuid(),
  verified: z.boolean(),
  checked: z.boolean().optional(),
  corrected: z.boolean().optional(),
  slot: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
});
const contentSchema = z.object({
  headline: bi,
  summary: bi,
  points: z.array(bi).max(20),
  why: bi,
  background: bi.nullable(),
  statics: z
    .array(z.object({ keyword, text: bi, source: z.string().max(500).nullable() }))
    .max(MAX_STATICS)
    .optional(),
  keywords: z.array(keyword).max(20).optional(),
  statics_edited: z.boolean().optional(),
  context_facts: z.array(factSchema).max(40).optional(),
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
        post_corrections: z.boolean(),
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

// House style: the editor's writing rules, and rules SAATHI suggests from the
// week's edits (one AI call).
export const getCaStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const [settings, suggestions] = await Promise.all([
      s.getMagazineSettings(),
      s.styleSuggestions(),
    ]);
    return { rules: settings.style_rules, suggestions };
  });

export const suggestCaStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestStyleRules();
  });

export const saveCaStyleRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rules: z.array(z.string().trim().max(200)).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveStyleRules(data.rules);
  });

// The house style check of a day: the last one, running it (the stories not
// yet checked as they are), applying a suggested fix, and "It's fine".
export const getCaStyleCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getStyleCheck(data.date);
  });

export const runCaStyleCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).checkStyle(data.date);
  });

const styleBreakSchema = z.object({ date: dateSchema, id: z.string().regex(/^[0-9a-f]{8}$/) });

export const applyCaStyleFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => styleBreakSchema.parse(d))
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).applyStyleFix(data.date, data.id);
  });

export const dismissCaStyleBreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => styleBreakSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).dismissStyleBreak(data.date, data.id);
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
    const s = await server();
    const save = () =>
      s.updateItem(id, patch as Parameters<Awaited<ReturnType<typeof server>>["updateItem"]>[1]);
    // Text edits are kept in the story's history; moving or dropping isn't.
    return patch.content ? s.asEdit(id, save) : save();
  });

// ---------- Article reader and Static Connect ----------

const highlightsSchema = z
  .array(
    z.object({
      source_id: z.string().uuid(),
      quote: z.string().trim().min(8).max(2000),
      point: z.boolean(),
      check: z.boolean().optional(),
      note: z.string().trim().max(200).optional(),
    }),
  )
  .min(1)
  .max(40);
const noteSchema = z.string().trim().max(500).nullish();
// Green-pen highlights: keywords for Static Connect.
const penKeywords = z.array(z.string().trim().min(2).max(80)).max(10).optional();

export const getCaReader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReaderSource[]> => {
    await assertAdmin(context.userId);
    return (await server()).itemReader(data.id);
  });

export const getCaReaderText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source_id: z.string().uuid(),
        start: z.number().int().min(0),
        end: z.number().int().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readerText(data.source_id, data.start, data.end);
  });

export const rewriteCaFromHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        highlights: highlightsSchema,
        note: noteSchema,
        keywords: penKeywords,
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).rewriteFromHighlights(
      data.id,
      data.highlights,
      data.note ?? null,
      data.keywords,
    );
  });

// A new story, from another story's sources (from_id) or from a source no
// story uses yet (source_id).
export const createCaFromHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from_id: z.string().uuid().optional(),
        source_id: z.string().uuid().optional(),
        highlights: highlightsSchema,
        note: noteSchema,
        keywords: penKeywords,
      })
      .refine((o) => !!o.from_id !== !!o.source_id, "Give a story or a source")
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).createFromHighlights(
      data.from_id ? { itemId: data.from_id } : { sourceId: data.source_id! },
      data.highlights,
      data.note ?? null,
      data.keywords,
    );
  });

// New key points from the reader, added without rewriting the story.
export const addCaPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), highlights: highlightsSchema, keywords: penKeywords })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).addPointsFromHighlights(data.id, data.highlights, data.keywords);
  });

// Green-pen keywords added to Static Connect without rewriting the story.
export const addCaPenKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    const s = await server();
    return s.asEdit(data.id, async () => s.withKeywords(await s.getItem(data.id), data.keywords));
  });

// A story's earlier versions (before each rewrite), and putting one back.
export const listCaVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CaVersion[]> => {
    await assertAdmin(context.userId);
    return (await server()).listVersions(data.id);
  });

export const restoreCaVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), version_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).restoreVersion(data.id, data.version_id);
  });

// "What's missing?" for the reader's highlights in one source.
export const checkCaMissing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        source_id: z.string().uuid(),
        highlights: z.array(z.string().trim().min(2).max(2000)).max(40),
        // The article shown, as [start, end) in the whole source.
        article: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).checkMissing(
      data.id ?? null,
      data.source_id,
      data.highlights,
      data.article,
    );
  });

// Skipped news: the day's articles no story uses, and reading one of them.
export const getCaSkipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).skippedNews(data.date);
  });

// The day's skipped-news counts as last worked out, for the checklist.
export const getCaSkippedSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).skippedSummary(data.date);
  });

// Marks skipped articles "not needed" (or needed again) on every device.
export const setCaSkippedHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: dateSchema,
        keys: z.array(z.string().min(3).max(80)).min(1).max(500),
        hidden: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).setSkippedHidden(data.date, data.keys, data.hidden);
  });

// Ranks the day's skipped news by exam value (one AI call).
export const rankCaSkipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).rankSkipped(data.date);
  });

// The day's other sources, each with its article most like the one being read.
export const getCaCompareSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ source_id: z.string().uuid(), query: z.string().max(6000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).compareSources(data.source_id, data.query);
  });

export const getCaSourceReader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source_id: z.string().uuid(),
        at: z.number().int().min(0),
        quote: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ReaderSource[]> => {
    await assertAdmin(context.userId);
    return (await server()).sourceReader(data.source_id, data.at, data.quote);
  });

// Fact-check mode: the day's facts to check, and checking one (with its
// printed point corrected when the wording was wrong).
export const getCaFactChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).factChecks(data.date);
  });

export const checkCaFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        text: z.string().min(1).max(4000),
        point: z
          .object({ en: z.string().trim().max(400), hi: z.string().trim().max(400) })
          .refine((p) => p.en || p.hi, "Write the point")
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    const s = await server();
    const check = () => s.checkFact(data.id, data.text, data.point);
    // A corrected point is an edit, kept in the story's history.
    return data.point ? s.asEdit(data.id, check) : check();
  });

export const setCaFactChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), text: z.string().min(1).max(4000), checked: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    return (await server()).setFactChecked(data.id, data.text, data.checked);
  });

export const addCaStaticFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        keywords: z
          .array(keyword.refine((k) => k.en || k.hi, "Empty keyword"))
          .min(1)
          .max(MAX_STATICS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    const s = await server();
    return s.asEdit(data.id, () => s.addStaticFacts(data.id, data.keywords));
  });

export const getCaKeywordBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).keywordBooks(data.id);
  });

export const deleteCaPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    return s.asEdit(data.id, () => s.deletePoint(data.id, data.text));
  });

export const redoCaVisual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CaItem> => {
    await assertAdmin(context.userId);
    const s = await server();
    return s.asEdit(data.id, () => s.redoVisual(data.id));
  });

export const decideCaCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const r = await (await server()).decideCorrection(data.id, data.approve);
    return { ok: true, noted: r.noted };
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
