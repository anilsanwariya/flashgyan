// Admin server functions for GK infographics.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VISUAL_TYPES, type VisualType } from "@/lib/ca-visuals";
import {
  GK_DESIGN_KEYS,
  GK_LOOKS,
  type GkCard,
  type GkDesign,
  type GkIdea,
  type GkLook,
} from "@/lib/gk";
import type { GkCardRow, GkDay, GkDayView, GkSubject, GkTopic } from "@/lib/gk.server";

export type { GkCardRow, GkDay, GkDayView, GkSubject, GkTopic };

async function server() {
  return import("@/lib/gk.server");
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

// The site's address, for the card images' logo.
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
const design = z.enum(GK_DESIGN_KEYS as [GkDesign, ...GkDesign[]]);
const look = z.enum(GK_LOOKS as [GkLook, ...GkLook[]]);
const vtype = z.enum(VISUAL_TYPES as unknown as [VisualType, ...VisualType[]]);
const bi = (max: number) => z.object({ en: z.string().max(max), hi: z.string().max(max) });
const fact = z.object({
  text: z.string().max(600),
  quote: z.string().max(1200),
  source: z.string().max(300),
  verified: z.boolean(),
});
const idea = z.object({
  title: bi(200),
  look,
  why: z.string().max(400),
  facts: z.array(fact).max(20),
});
// The visual and map are the magazine's own shapes, checked where they're drawn.
const card = z.object({
  title: bi(200),
  intro: bi(400),
  look,
  visual: z.record(z.string(), z.unknown()).nullable().optional(),
  map: z.record(z.string(), z.unknown()).nullable().optional(),
  points: z.array(bi(400)).max(8),
  facts: z.array(fact).max(20),
  sources: z.array(z.string().max(300)).max(10),
});

// ---------- Settings ----------

export const getGkSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).getGkSettings();
  });

export const saveGkSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.string().max(200).optional(),
        post_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        design_en: design.optional(),
        design_hi: design.optional(),
        caption_en: z.string().max(2000).optional(),
        caption_hi: z.string().max(2000).optional(),
        watermark: z.number().min(0).max(30).optional(),
        notify: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveGkSettings(data);
  });

// ---------- Subjects and books ----------

export const listGkSubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listGkSubjects();
  });

export const getGkSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const [subject, books] = await Promise.all([s.getGkSubject(data.id), s.gkBooks(data.id)]);
    return { ...subject, books };
  });

const subjectFields = z.object({
  name_en: z.string().trim().min(1).max(120),
  name_hi: z.string().trim().max(120),
  kb_subjects: z.array(z.string().max(120)).max(20),
});

export const createGkSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subjectFields.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createGkSubject(data);
  });

export const updateGkSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, patch: subjectFields.partial() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updateGkSubject(data.id, data.patch);
  });

export const setGkSubjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, status: z.enum(["active", "paused", "done"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setGkSubjectStatus(data.id, data.status);
  });

export const deleteGkSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteGkSubject(data.id);
  });

export const listKbSubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).kbSubjects();
  });

export const addGkReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(40, "Paste the material's text").max(400_000),
        medium: z.enum(["Hindi", "English", "Bilingual"]),
        source: z.string().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id: subject, ...input } = data;
    await (await server()).addGkReference(subject, input);
  });

// ---------- Topics ----------

export const addGkTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subject: id, names: z.array(bi(200)).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { added: await (await server()).addGkTopics(data.subject, data.names) };
  });

export const updateGkTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        patch: z.object({
          name_en: z.string().trim().min(1).max(200).optional(),
          name_hi: z.string().max(200).optional(),
          note: z.string().max(1000).optional(),
          status: z.enum(["todo", "posted", "skipped"]).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).updateGkTopic(data.id, data.patch);
  });

export const moveGkTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, by: z.union([z.literal(-1), z.literal(1)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).moveGkTopic(data.id, data.by);
  });

export const deleteGkTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteGkTopic(data.id);
  });

export const suggestGkTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subject: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestGkTopics(data.subject);
  });

// ---------- The day ----------

export const getGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getGkDay(data.date);
  });

export const advanceGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { status: await (await server()).advanceGkDay(data.date, origin()) };
  });

export const startGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, topic: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).startGkDay(data.date, data.topic);
  });

export const replanGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).replanGkDay(data.date);
  });

export const pickGkIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date,
        picks: z.array(z.number().int().min(0)).max(40),
        extra: z.array(idea).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).pickGkIdeas(data.date, data.picks, (data.extra ?? []) as GkIdea[]);
  });

export const approveGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date,
        caption_en: z.string().max(4000),
        caption_hi: z.string().max(4000),
        now: z.boolean().optional(),
        at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (
      await server()
    ).approveGkDay(data.date, { en: data.caption_en, hi: data.caption_hi }, data.now, data.at);
  });

export const cancelGkDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).cancelGkDay(data.date);
  });

export const postGkNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).postGkNow(data.date);
  });

export const gkHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).gkHistory();
  });

// ---------- The card editor ----------

export const saveGkCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, card, label: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).saveGkCard(data.id, data.card as unknown as GkCard, data.label);
  });

export const gkCardPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, lang }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { html: await (await server()).gkCardPreview(data.id, data.lang, origin() ?? "") };
  });

export const gkVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).gkVersions(data.id);
  });

export const restoreGkVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, at: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).restoreGkVersion(data.id, data.at);
  });

export const rewriteGkPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, part: z.enum(["words", "points"]), note: z.string().max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).rewriteGkPart(data.id, data.part, data.note);
  });

export const makeGkVisual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, type: vtype.optional(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).makeGkVisual(data.id, { type: data.type, note: data.note });
  });

export const suggestGkMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestGkMap(data.id);
  });

export const setGkCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id, check: z.string().max(80), state: z.enum(["open", "accepted", "ignored"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // The card as it is now (a fix may have changed it).
    const { card } = await (await server()).setGkCheck(data.id, data.check, data.state);
    return { card };
  });

export const setGkChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, checked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setGkChecked(data.id, data.checked);
  });

export const moveGkCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, by: z.union([z.literal(-1), z.literal(1)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).moveGkCard(data.id, data.by);
  });

export const deleteGkCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteGkCard(data.id);
  });
