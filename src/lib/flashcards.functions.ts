import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export type CardSection = { title: string; body: string };

export type Deck = {
  id: string;
  name: string;
  description: string;
  subject: string;
  topic: string;
  order_index: number;
};

export type DeckSummary = Deck & { count: number };

export type Flashcard = {
  id: string;
  deck_id: string;
  subject: string;
  topic: string;
  order_index: number;
  prompt: string;
  question: string;
  answer: string;
  image_url: string | null;
  sections: CardSection[];
};

// ---------- Signing helpers ----------

async function signImagePath(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  imageUrl: string | null,
): Promise<string | null> {
  if (!imageUrl) return null;
  // If it's already a signed URL or absolute URL, keep as-is
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const { data, error } = await admin.storage
    .from("flashcard-images")
    .createSignedUrl(imageUrl, 60 * 60 * 24 * 7);
  if (error) return null;
  return data.signedUrl;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function signMany(rows: { image_url: string | null }[]) {
  const needs = rows.some((r) => r.image_url && !r.image_url.startsWith("http"));
  if (!needs) return rows;
  const admin = await getAdmin();
  return Promise.all(
    rows.map(async (r) => ({ ...r, image_url: await signImagePath(admin, r.image_url) })),
  );
}

// ---------- Public reads ----------

export const listDecks = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeckSummary[]> => {
    const supabase = publicClient();
    const { data: decks, error } = await supabase
      .from("flashcard_decks")
      .select("id, name, description, subject, topic, order_index")
      .order("subject", { ascending: true })
      .order("order_index", { ascending: true })
      .order("topic", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: cards, error: cErr } = await supabase
      .from("flashcards")
      .select("deck_id");
    if (cErr) throw new Error(cErr.message);
    const counts = new Map<string, number>();
    for (const c of cards ?? []) counts.set(c.deck_id, (counts.get(c.deck_id) ?? 0) + 1);
    return (decks ?? []).map((d) => ({ ...d, count: counts.get(d.id) ?? 0 }));
  },
);

export const getDeck = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ deck: Deck; cards: Flashcard[] }> => {
    const supabase = publicClient();
    const { data: deck, error: dErr } = await supabase
      .from("flashcard_decks")
      .select("id, name, description, subject, topic, order_index")
      .eq("id", data.id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!deck) throw new Error("Deck not found");
    const { data: rows, error } = await supabase
      .from("flashcards")
      .select(
        "id, deck_id, subject, topic, order_index, prompt, question, answer, image_url, sections",
      )
      .eq("deck_id", data.id)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const base = (rows ?? []).map((r) => ({
      ...r,
      sections: Array.isArray(r.sections) ? (r.sections as unknown as CardSection[]) : [],
    }));
    const signed = await signMany(base);
    return { deck: deck as Deck, cards: signed as Flashcard[] };
  });

export const getDeckCards = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ deckId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Flashcard[]> => {
    const res = await getDeck({ data: { id: data.deckId } });
    return res.cards;
  });

// ---------- Admin ----------

async function assertAdmin(userId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
  return admin;
}

const sectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const deckMetaSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  subject: z.string().min(1).max(120),
  topic: z.string().min(1).max(120),
  order_index: z.number().int(),
});

export const createDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deckMetaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: inserted, error } = await admin
      .from("flashcard_decks")
      .insert({
        name: data.name.trim(),
        description: data.description.trim(),
        subject: data.subject.trim(),
        topic: data.topic.trim(),
        order_index: data.order_index,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const updateDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    deckMetaSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("flashcard_decks")
      .update({
        name: data.name.trim(),
        description: data.description.trim(),
        subject: data.subject.trim(),
        topic: data.topic.trim(),
        order_index: data.order_index,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // If subject/topic changed, also update child flashcards' denormalized fields.
    const { error: uErr } = await admin
      .from("flashcards")
      .update({ subject: data.subject.trim(), topic: data.topic.trim() })
      .eq("deck_id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const deleteDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("flashcard_decks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const cardBaseSchema = z.object({
  order_index: z.number().int(),
  prompt: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  sections: z.array(sectionSchema).default([]),
});

export const createCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    cardBaseSchema.extend({ deck_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: deck, error: dErr } = await admin
      .from("flashcard_decks")
      .select("subject, topic")
      .eq("id", data.deck_id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!deck) throw new Error("Deck not found");
    const { data: inserted, error } = await admin
      .from("flashcards")
      .insert({
        deck_id: data.deck_id,
        subject: deck.subject,
        topic: deck.topic,
        order_index: data.order_index,
        prompt: data.prompt.trim(),
        question: data.question.trim(),
        answer: data.answer.trim(),
        sections: data.sections,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    cardBaseSchema
      .extend({
        id: z.string().uuid(),
        image_url: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await admin
      .from("flashcards")
      .update({
        order_index: rest.order_index,
        prompt: rest.prompt.trim(),
        question: rest.question.trim(),
        answer: rest.answer.trim(),
        sections: rest.sections,
        image_url: rest.image_url,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("flashcards").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCardImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), image_url: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("flashcards")
      .update({ image_url: data.image_url })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signFlashcardImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: signed, error } = await admin.storage
      .from("flashcard-images")
      .createSignedUrl(data.path, 60 * 60 * 24 * 365 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, path: data.path };
  });

export const uploadFlashcardImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const ext = data.filename.split(".").pop() || "png";
    const path = `${data.id}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(data.dataBase64, "base64");
    const { error: upErr } = await admin.storage
      .from("flashcard-images")
      .upload(path, bytes, { upsert: true, contentType: data.contentType });
    if (upErr) throw new Error(upErr.message);
    const { error: dbErr } = await admin
      .from("flashcards")
      .update({ image_url: path })
      .eq("id", data.id);
    if (dbErr) throw new Error(dbErr.message);
    const { data: signed, error: sErr } = await admin.storage
      .from("flashcard-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (sErr) throw new Error(sErr.message);
    return { path, url: signed.signedUrl };
  });

const importRowSchema = z.object({
  order_index: z.number().int(),
  prompt: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  sections: z.array(sectionSchema).default([]),
});

export const bulkImportCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        deck_id: z.string().uuid(),
        rows: z.array(importRowSchema).min(1).max(5000),
        mode: z.enum(["append", "replace"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: deck, error: dErr } = await admin
      .from("flashcard_decks")
      .select("subject, topic")
      .eq("id", data.deck_id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!deck) throw new Error("Deck not found");

    if (data.mode === "replace") {
      const { error: delErr } = await admin
        .from("flashcards")
        .delete()
        .eq("deck_id", data.deck_id);
      if (delErr) throw new Error(delErr.message);
    }

    const payload = data.rows.map((r) => ({
      deck_id: data.deck_id,
      subject: deck.subject,
      topic: deck.topic,
      order_index: r.order_index,
      prompt: r.prompt.trim(),
      question: r.question.trim(),
      answer: r.answer.trim(),
      sections: r.sections,
    }));

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await admin.from("flashcards").insert(slice);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!isAdmin, userId: context.userId };
  });
