// Admin server functions for the flashcard studio.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CardPatch, ImportResult, TopicSummary } from "@/lib/flash-studio.server";

export type { ImportResult, TopicSummary };

async function server() {
  return import("@/lib/flash-studio.server");
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
const wordKey = z.enum(["", "front", "back"]);
const column = z.object({
  id: z.string().max(20),
  title: z.string().max(80),
  hint: z.string().max(300),
});
const book = z.object({
  code: z.string().max(30),
  name: z.string().max(200),
  color: z.string().max(20),
});
const big = z.string().max(20000);
// A card's AI check record (the fixes it suggests, what was done with them).
const aiShape = z
  .object({
    at: z.string().max(40),
    sig: z.string().max(40),
    fixes: z
      .array(
        z.object({
          field: z.string().max(30),
          from: big,
          to: big,
          type: z.string().max(60),
          note: z.string().max(500),
        }),
      )
      .max(20),
    done: z
      .array(z.object({ type: z.string().max(60), applied: z.boolean(), at: z.string().max(40) }))
      .max(100)
      .default([]),
  })
  .nullable();
const sheetCard = z.object({
  front: big,
  back: big,
  back_hint: z.string().max(4000),
  is_revealed: z.boolean(),
  word_key: wordKey,
  prompt: z.string().max(1000),
  ex: z.record(z.string().max(80), big),
  book: z.string().max(30),
  book_order: z.number().int().nullable(),
  error: z.boolean(),
  error_type: z.string().max(200),
  sheet: z.number().int().nullable(),
  sheet_order: z.number().int().nullable(),
  order: z.number().int().nullable(),
  app_id: z.string().max(200),
});

export const listFlashTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listTemplates();
  });

export const saveFlashTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: id.optional(),
        name: z.string().max(200),
        prompt: z.string().max(1000),
        columns: z.array(column).max(30),
        word_key: wordKey,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveTemplate(data);
  });

export const deleteFlashTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteTemplate(data.id);
    return { ok: true };
  });

export const listFlashTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listTopics();
  });

export const createFlashTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().trim().min(1).max(200), template_id: id.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createTopic(data.name, data.template_id);
  });

export const getFlashTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getTopic(data.id);
  });

export const updateFlashTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        name: z.string().max(200).optional(),
        prompt: z.string().max(1000).optional(),
        columns: z.array(column).max(30).optional(),
        word_key: wordKey.optional(),
        books: z.array(book).max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id: topicId, ...patch } = data;
    return (await server()).updateTopic(topicId, patch);
  });

export const deleteFlashTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteTopic(data.id);
    return { ok: true };
  });

export const importFlashSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        cards: z.array(sheetCard).min(1).max(5000),
        columns: z.array(z.string().max(80)).max(30),
        prompt: z.string().max(1000),
        book: z.string().max(30),
        name: z.string().max(200).optional(),
        replace: id.optional(),
        keep_numbers: z.boolean(),
        from_app: z
          .object({ verified: z.boolean(), downloaded: z.array(z.number().int()).max(500) })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).importSheet(
      data.topic_id,
      data,
      data.keep_numbers,
      data.replace,
      data.from_app,
    );
  });

export const saveFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        patch: z
          .object({
            prompt: z.string().max(1000).nullable(),
            front: big,
            back: big,
            back_hint: z.string().max(4000),
            is_revealed: z.boolean(),
            word_key: wordKey.nullable(),
            ex: z.record(z.string().max(20), big),
            own: z.array(z.string().max(20)).max(30),
            error: z.boolean(),
            error_type: z.string().max(200),
            verified: z.boolean(),
            note: z.string().max(2000),
            ai: aiShape,
          })
          .partial(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveCard(data.id, data.patch as CardPatch);
  });

export const addFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).addCard(data.topic_id);
  });

export const deleteFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { done: await (await server()).deleteCard(data.id) };
  });

export const numberFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        sizes: z.array(z.number().int().min(1).max(5000)).min(1).max(200),
        seed: z
          .number()
          .int()
          .min(0)
          .max(2 ** 31),
        only: z.array(id).max(5000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).numberCards(data.topic_id, data.sizes, data.seed, data.only);
  });

export const saveFlashAppIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        rows: z
          .array(
            z.object({
              order: z.number().int().nullable(),
              front: big,
              app_id: z.string().max(200),
            }),
          )
          .max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveAppIds(data.topic_id, data.rows);
  });

export const addFlashSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        book: z.string().trim().min(1).max(30),
        name: z.string().max(200),
        kind: z.enum(["word", "pdf", "text"]),
        pieces: z.array(z.string().max(20000)).max(2000),
        pages: z.number().int().min(0).max(2000),
        todos: z.array(z.object({ where: z.string().max(60), text: z.string().max(400) })).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { topic_id, ...s } = data;
    return (await server()).addSource(topic_id, s);
  });

export const readFlashSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        part: z.number().int().min(1).max(5000).optional(),
        image: z
          .object({ media_type: z.literal("image/jpeg"), data: z.string().max(12_000_000) })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).readSourceStep(data.id, data.part, data.image);
  });

export const deleteFlashSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).deleteSource(data.id);
  });

const ids = z.array(id).min(1).max(40);

export const mergeFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ main: id, others: z.array(id).min(1).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).mergeCards(data.main, data.others);
  });

export const mergeAllFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).mergeAll(data.topic_id);
  });

export const splitFlashVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, index: z.number().int().min(0).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).splitVariant(data.id, data.index);
  });

export const fillFlashExplanations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id, ids }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).fillExplanations(data.topic_id, data.ids);
  });

export const checkFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id, ids }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).checkCards(data.topic_id, data.ids);
  });

export const markFlashDownloaded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ topic_id: id, chunks: z.array(z.number().int().min(1)).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).markDownloaded(data.topic_id, data.chunks);
  });

export const makeFlashSplitCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ topic_id: id, ids: z.array(id).min(1).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).makeSplitCards(data.topic_id, data.ids);
  });

export const resetFlashChunks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).resetChunks(data.topic_id);
  });

export const setFlashExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        column: z.string().max(20),
        from: z.array(z.string().max(20000)).min(1).max(500),
        to: z.string().max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).setExplanation(data.topic_id, data.column, data.from, data.to);
  });

export const bulkFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        ids: z.array(id).min(1).max(5000),
        action: z.enum(["verify", "unverify", "recheck", "delete", "apply_ai", "fix_lint"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).bulkCards(data.topic_id, data.ids, data.action);
  });

export const getFlashCardHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).cardHistory(data.id);
  });

export const resolveFlashAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        apply: z.boolean(),
        picks: z
          .array(z.object({ id, field: z.string().max(30), to: big }))
          .min(1)
          .max(3000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).resolveAi(data.topic_id, data.picks, data.apply);
  });

export const replaceFlashSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        source_id: id,
        cards: z.array(sheetCard).min(1).max(5000),
        columns: z.array(z.string().max(80)).max(30),
        book: z.string().max(30),
        name: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).replaceSheet(data.topic_id, data.source_id, data);
  });

export const applyFlashWorking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        rows: z
          .array(
            z.object({
              id: z.union([id, z.literal("")]),
              book: z.string().max(30),
              front: big,
              back: big,
              ex: z.record(z.string().max(20), big),
              verified: z.boolean().nullable(),
              note: z.string().max(2000).nullable(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).applyWorking(data.topic_id, data.rows);
  });

export const otherFlashTopicWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).otherTopicWords(data.topic_id);
  });

export const startFlashServerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        kind: z.enum(["check", "fill"]),
        ids: z.array(id).min(1).max(5000),
        with_verified: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).startServerJob(
      data.topic_id,
      data.kind,
      data.ids,
      data.with_verified ?? false,
    );
  });

export const listFlashServerJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listServerJobs(data.topic_id);
  });

export const stopFlashServerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).stopServerJob(data.id);
  });

export const replaceFlashText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        reverify: z.boolean(),
        edits: z
          .array(z.object({ id, field: z.string().max(30), before: big, after: big }))
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).replaceText(data.topic_id, data.edits, data.reverify);
  });

export const listFlashTrash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).listTrash(data.topic_id);
  });

export const restoreFlashTrash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ topic_id: id, ids: z.array(id).min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).restoreTrash(data.topic_id, data.ids);
  });

export const restoreFlashStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topic_id: id,
        states: z
          .array(
            z.object({
              id,
              front: big,
              back: big,
              ex: z.record(z.string().max(20), big),
              own: z.array(z.string().max(20)).max(30),
              verified: z.boolean(),
              error: z.boolean(),
              error_type: z.string().max(200),
              note: z.string().max(2000),
              ai: aiShape,
              removed: z.boolean(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).restoreStates(data.topic_id, data.states);
  });

export const getFlashBookText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: id, card_id: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).bookText(data.topic_id, data.card_id);
  });
