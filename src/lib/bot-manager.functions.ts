// Server functions for the Bot Manager admin panel:
// - list bot_users, broadcast a Telegram message to all
// - bulk-insert bot_flashcards, bot_mcq_tests, bot_mcq_questions
// All handlers are admin-gated via user_roles.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  return supabaseAdmin;
}

// ---------- Bot users / broadcast ----------
export type BotUserRow = {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_active: string;
  created_at: string;
};

export const listBotUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotUserRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("bot_users")
      .select("chat_id, username, first_name, last_active, created_at")
      .order("last_active", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BotUserRow[];
  });

export const broadcastBotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

    const { data: users, error } = await admin
      .from("bot_users")
      .select("chat_id");
    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;
    for (const u of users ?? []) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: (u as { chat_id: number }).chat_id,
            text: data.text,
            parse_mode: "HTML",
          }),
        });
        if (r.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      // Respect Telegram's ~30 msg/sec limit
      await new Promise((res) => setTimeout(res, 40));
    }
    return { sent, failed, total: (users ?? []).length };
  });

// ---------- Bot flashcards ----------
const sectionSchema = z.object({ title: z.string().default(""), body: z.string().default("") });
const botFcRowSchema = z.object({
  order_index: z.number().int().default(0),
  prompt: z.string().default(""),
  question: z.string().min(1),
  answer: z.string().min(1),
  sections: z.array(sectionSchema).default([]),
});

export type BotFcDeckRow = { subject: string; topic: string; count: number };

export const listBotFlashcardDecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotFcDeckRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("bot_flashcards")
      .select("subject, topic");
    if (error) throw new Error(error.message);
    const map = new Map<string, BotFcDeckRow>();
    for (const r of (data ?? []) as { subject: string; topic: string }[]) {
      const key = `${r.subject}\u0000${r.topic}`;
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { subject: r.subject, topic: r.topic, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.subject === b.subject ? a.topic.localeCompare(b.topic) : a.subject.localeCompare(b.subject),
    );
  });

export const deleteBotFlashcardDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subject: z.string().min(1), topic: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("bot_flashcards")
      .delete()
      .eq("subject", data.subject)
      .eq("topic", data.topic);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportBotFlashcards = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subject: z.string().min(1),
        topic: z.string().min(1),
        rows: z.array(botFcRowSchema).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const payload = data.rows.map((r) => ({
      subject: data.subject.trim(),
      topic: data.topic.trim(),
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
      const { error } = await admin.from("bot_flashcards").insert(slice as never);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

// ---------- Bot MCQs ----------
export type BotMcqTestRow = {
  id: string;
  name: string;
  subject: string;
  topic: string;
  description: string;
};

export const listBotMcqTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotMcqTestRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("bot_mcq_tests")
      .select("id, name, subject, topic, description")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BotMcqTestRow[];
  });

export const createBotMcqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1),
        subject: z.string().min(1),
        topic: z.string().default(""),
        description: z.string().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: row, error } = await admin
      .from("bot_mcq_tests")
      .insert({
        name: data.name.trim(),
        subject: data.subject.trim(),
        topic: data.topic.trim(),
        description: data.description.trim(),
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

const botMcqRowSchema = z.object({
  order_index: z.number().int().default(0),
  question: z.string().min(1),
  question_ext: z.string().default(""),
  option_1: z.string().min(1),
  option_2: z.string().min(1),
  option_3: z.string().min(1),
  option_4: z.string().min(1),
  answer: z.number().int().min(1).max(4),
  explanation_sections: z.array(sectionSchema).default([]),
});

export const bulkImportBotMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        test_id: z.string().uuid(),
        rows: z.array(botMcqRowSchema).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const payload = data.rows.map((r) => ({ ...r, test_id: data.test_id }));
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await admin.from("bot_mcq_questions").insert(slice as never);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

export const deleteBotMcqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("bot_mcq_tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

