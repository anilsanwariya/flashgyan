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
        keep_numbers: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).importSheet(data.topic_id, data, data.keep_numbers);
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
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).numberCards(data.topic_id, data.sizes, data.seed);
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
