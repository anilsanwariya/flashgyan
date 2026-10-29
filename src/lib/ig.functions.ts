// Admin server functions for Infographics ("Words in the News").
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IG_DESIGN_KEYS, type IgDesign } from "@/lib/ig-cards";
import type {
  IgCardAids,
  IgDayView,
  IgHistoryRow,
  IgPickStats,
  IgVersion,
  IgWeek,
  IgWord,
} from "@/lib/ig.server";

export type { IgCardAids, IgDayView, IgHistoryRow, IgPickStats, IgVersion, IgWeek, IgWord };

async function server() {
  return import("@/lib/ig.server");
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

// The site's address, for the card images' logos and the Telegram links.
function origin(): string | undefined {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return undefined;
  }
}

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const lang = z.enum(["en", "hi"]);
const design = z.enum(IG_DESIGN_KEYS as [IgDesign, ...IgDesign[]]);
const text = (max: number) => z.string().max(max);
const card = z.object({
  lang,
  word: text(80),
  pos: text(80),
  say: text(80),
  ipa: text(80),
  main: text(300),
  sub: text(300),
  news: text(600),
  newsHi: text(600),
  paper: text(120),
  rewritten: z.boolean().optional(),
  synonyms: z.array(text(80)).max(6),
  antonyms: z.array(text(80)).max(6),
  extras: z.array(z.object({ title: text(60), text: text(300) })).max(3),
});

export const getIgDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getIgDay(data.date);
  });

export const listIgDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listIgDays();
  });

// One unit of the day's work (suggesting, writing, proofreading, images),
// so the page moves it along while it is open.
export const advanceIgDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { status: await (await server()).advanceDay(data.date, origin()) };
  });

export const startIgDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).startIgDay(data.date);
  });

export const addOwnIgWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        day: date,
        lang,
        word: z.string().trim().min(1).max(60),
        sentence: text(500),
        paper: text(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).addOwnIgWord(data);
  });

export const pickIgWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, ids: z.array(id).min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).pickIgWords(data.date, data.ids);
    return { ok: true };
  });

export const swapIgWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, from: id, to: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).swapIgWord(data.date, data.from, data.to);
    return { ok: true };
  });

export const saveIgCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, card, label: z.string().max(120).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).saveIgCard(data.id, data.card, data.label);
    return { ok: true };
  });

// The card editor's helpers: the article's other lines with the word,
// WordNet's synonyms and antonyms, and the card's earlier versions.
export const igCardAids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).igCardAids(data.id);
  });

export const rewriteIgPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        part: z.enum(["say", "meaning", "sentence", "words", "tips"]),
        note: text(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).rewriteIgPart(data.id, data.part, data.note);
  });

export const restoreIgVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, at: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).restoreIgVersion(data.id, data.at);
  });

export const moveIgCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date, id, by: z.union([z.literal(-1), z.literal(1)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).moveIgCard(data.date, data.id, data.by);
    return { ok: true };
  });

export const setIgCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        check: z.string().min(1).max(20),
        state: z.enum(["open", "accepted", "ignored"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).setIgCheck(data.id, data.check, data.state);
  });

export const setIgChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, checked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setIgChecked(data.id, data.checked);
    return { ok: true };
  });

export const recheckIgCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).recheckIgCard(data.date, data.id);
    return { ok: true };
  });

export const setIgDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, design }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setIgDesign(data.date, data.design);
    return { ok: true };
  });

export const approveIgDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date, caption: text(4000), now: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).approveIgDay(data.date, data.caption, data.now ?? false);
    return { ok: true };
  });

export const postIgNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).postIgNow(data.date);
    return { ok: true };
  });

export const cancelIgDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).cancelIgDay(data.date);
    return { ok: true };
  });

export const getIgSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).getIgSettings();
  });

export const saveIgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        auto_suggest: z.boolean(),
        channel: text(200),
        post_time: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:MM"),
        suggest_en: z.number().int().min(0).max(20),
        suggest_hi: z.number().int().min(0).max(20),
        pick_en: z.number().int().min(0).max(10),
        pick_hi: z.number().int().min(0).max(10),
        designs: z.array(design).min(1),
        watermark: z.number().int().min(0).max(100),
        caption: z.string().min(1).max(3000),
        notify: z.boolean(),
        learn_from_picks: z.boolean(),
        pick_rules: z.object({
          en: z.array(z.string().trim().min(3).max(240)).max(10),
          hi: z.array(z.string().trim().min(3).max(240)).max(10),
        }),
        weekly: z.boolean(),
        weekly_day: z.number().int().min(0).max(6),
        weekly_time: z.string().regex(/^\d{1,2}:\d{2}$/, "Use HH:MM"),
        weekly_caption: z.string().min(1).max(3000),
        weekly_app_link: z.string().max(400),
        monthly_page: z.boolean(),
      })
      .refine((s) => s.pick_en + s.pick_hi >= 1 && s.pick_en + s.pick_hi <= 10, {
        message: "A Telegram album holds 1 to 10 cards.",
      })
      .refine((s) => (!s.pick_en || s.suggest_en > 0) && (!s.pick_hi || s.suggest_hi > 0), {
        message: "A language with cards needs at least 1 suggestion.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveIgSettings(data);
  });

export const igHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: text(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).igHistory(data.search);
  });

export const releaseIgWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, release: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).releaseIgWord(data.id, data.release);
    return { ok: true };
  });

// ---------- Round-ups ----------

export const listIgWeeks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listIgWeeks();
  });

export const igWeekPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ to: date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).igWeekPreview(data.to, origin());
  });

export const postIgWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ to: date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).postIgWeek(data.to, origin());
    return { ok: true };
  });

// ---------- Learning from the editor's picks ----------

export const igPickStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).igPickStats();
  });

export const suggestIgPickRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lang }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestIgPickRules(data.lang);
  });
