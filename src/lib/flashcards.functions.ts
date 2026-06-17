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

export type DeckSummary = {
  subject: string;
  topic: string;
  count: number;
};

export type CardSection = { title: string; body: string };

export type Flashcard = {
  id: string;
  subject: string;
  topic: string;
  order_index: number;
  prompt: string;
  back: string;
  sections: CardSection[];
};

export const listDecks = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("flashcards")
    .select("subject, topic");
  if (error) throw new Error(error.message);
  const map = new Map<string, DeckSummary>();
  for (const row of data ?? []) {
    const key = `${row.subject}|||${row.topic}`;
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { subject: row.subject, topic: row.topic, count: 1 });
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic),
  );
});

export const getDeckCards = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ subject: z.string(), topic: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<Flashcard[]> => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("flashcards")
      .select("id, subject, topic, order_index, prompt, back, sections")
      .eq("subject", data.subject)
      .eq("topic", data.topic)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      topic: r.topic,
      order_index: r.order_index,
      prompt: r.prompt,
      back: r.back,
      sections: Array.isArray(r.sections) ? (r.sections as unknown as CardSection[]) : [],
    }));
  });

const sectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const importRowSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  order_index: z.number().int(),
  prompt: z.string().min(1),
  back: z.string().min(1),
  sections: z.array(sectionSchema),
});

const bulkImportSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(5000),
  mode: z.enum(["append", "replace"]),
});

export const bulkImportCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    if (data.mode === "replace") {
      const { error: delErr } = await supabaseAdmin
        .from("flashcards")
        .delete()
        .not("id", "is", null);
      if (delErr) throw new Error(delErr.message);
    }

    const payload = data.rows.map((r) => ({
      subject: r.subject.trim(),
      topic: r.topic.trim(),
      order_index: r.order_index,
      prompt: r.prompt.trim(),
      back: r.back.trim(),
      sections: r.sections,
    }));

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("flashcards").insert(slice);
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    return { inserted };
  });

export const deleteDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subject: z.string(), topic: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { error } = await supabaseAdmin
      .from("flashcards")
      .delete()
      .eq("subject", data.subject)
      .eq("topic", data.topic);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!isAdmin, userId: context.userId };
  });
