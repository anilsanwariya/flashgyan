import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saathiEmbed } from "../../supabase/functions/_shared/saathi-core.ts";

export type SaathiMedium = "Hindi" | "English" | "Bilingual";

export type SaathiDoc = {
  id: string;
  title: string;
  subject: string;
  medium: SaathiMedium;
  content: string;
  created_at: string;
  parent_id: string | null;
  chunk_index: number | null;
};

// --- SEMANTIC CHUNKING HELPER ---
function chunkText(text: string, maxLen = 1500): string[] {
  const sections = text.split(/(?=^#{1,3} )/m);
  const chunks: string[] = [];
  for (const sec of sections) {
    if (sec.trim().length > maxLen) {
      const paras = sec.split(/\n\s*\n/);
      let cur = "";
      for (const p of paras) {
        if (cur.length + p.length > maxLen) {
          if (cur) chunks.push(cur.trim());
          cur = p;
        } else {
          cur += (cur ? "\n\n" : "") + p;
        }
      }
      if (cur) chunks.push(cur.trim());
    } else if (sec.trim()) {
      chunks.push(sec.trim());
    }
  }
  return chunks.length ? chunks : [text];
}

// Must use the same model as question embeddings, so it goes through the shared core.
async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return saathiEmbed(key, text);
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
  return admin;
}

const DOC_COLS = "id,title,subject,medium,content,created_at,parent_id,chunk_index";

export const listSaathiDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("saathi_knowledge")
      .select(DOC_COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SaathiDoc[];
  });

export const createSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(300),
      subject: z.string().trim().min(1).max(120),
      medium: z.enum(["Hindi", "English", "Bilingual"]),
      content: z.string().trim().min(1).max(500_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);

    // Create Parent (No embedding)
    const { data: parent, error: pErr } = await admin
      .from("saathi_knowledge")
      .insert({
        title: data.title,
        subject: data.subject,
        medium: data.medium,
        content: "",
        source_file: data.title,
      })
      .select(DOC_COLS)
      .single();
    if (pErr) throw new Error(pErr.message);
    const parentRow = parent as unknown as SaathiDoc;

    // Create Chunks
    const chunks = chunkText(data.content, 1500);
    for (let i = 0; i < chunks.length; i++) {
      const chunkTitle = chunks.length > 1 ? `${data.title} (Part ${i + 1})` : data.title;
      const embedding = await embed(`${chunkTitle}\n\n${chunks[i]}`);
      const { error: cErr } = await admin.from("saathi_knowledge").insert({
        parent_id: parentRow.id,
        title: chunkTitle,
        subject: data.subject,
        medium: data.medium,
        content: chunks[i],
        source_file: data.title,
        chunk_index: i + 1,
        embedding: embedding as unknown as string,
      });
      if (cErr) throw new Error(cErr.message);
    }
    return parentRow;
  });

export const updateSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(300),
      subject: z.string().trim().min(1).max(120),
      medium: z.enum(["Hindi", "English", "Bilingual"]),
      content: z.string().trim().min(1).max(200_000),
      is_chunk: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);

    if (data.is_chunk) {
      const embedding = await embed(`${data.title}\n\n${data.content}`);
      const { data: row, error } = await admin
        .from("saathi_knowledge")
        .update({
          title: data.title,
          content: data.content,
          embedding: embedding as unknown as string,
        })
        .eq("id", data.id)
        .select(DOC_COLS)
        .single();
      if (error) throw new Error(error.message);
      return row as unknown as SaathiDoc;
    } else {
      const { data: row, error } = await admin
        .from("saathi_knowledge")
        .update({
          title: data.title,
          subject: data.subject,
          medium: data.medium,
        })
        .eq("id", data.id)
        .select(DOC_COLS)
        .single();
      if (error) throw new Error(error.message);

      // Search reads the chunks, so they must carry the parent's subject, medium and title.
      const { data: chunks, error: chunkErr } = await admin
        .from("saathi_knowledge")
        .update({ subject: data.subject, medium: data.medium, source_file: data.title })
        .eq("parent_id", data.id)
        .select("id,chunk_index");
      if (chunkErr) throw new Error(chunkErr.message);
      const parts = chunks ?? [];
      for (const c of parts) {
        const title = parts.length > 1 ? `${data.title} (Part ${c.chunk_index})` : data.title;
        const { error: tErr } = await admin.from("saathi_knowledge").update({ title }).eq("id", c.id);
        if (tErr) throw new Error(tErr.message);
      }
      return row as unknown as SaathiDoc;
    }
  });

export const appendSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      parent_id: z.string().uuid(),
      content: z.string().trim().min(1).max(500_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);

    const { data: parent, error: pErr } = await admin
      .from("saathi_knowledge")
      .select("*")
      .eq("id", data.parent_id)
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: existingChunks } = await admin
      .from("saathi_knowledge")
      .select("chunk_index")
      .eq("parent_id", data.parent_id)
      .order("chunk_index", { ascending: false })
      .limit(1);
    const startIndex = ((existingChunks?.[0]?.chunk_index as number | null) || 0) + 1;

    const chunks = chunkText(data.content, 1500);
    for (let i = 0; i < chunks.length; i++) {
      const idx = startIndex + i;
      const chunkTitle = `${parent.title} (Part ${idx})`;
      const embedding = await embed(`${chunkTitle}\n\n${chunks[i]}`);
      const { error: cErr } = await admin.from("saathi_knowledge").insert({
        parent_id: parent.id,
        title: chunkTitle,
        subject: parent.subject,
        medium: parent.medium,
        content: chunks[i],
        source_file: parent.title,
        chunk_index: idx,
        embedding: embedding as unknown as string,
      });
      if (cErr) throw new Error(cErr.message);
    }
    return { ok: true, added: chunks.length };
  });

export const deleteSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("saathi_knowledge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SaathiTopic = { subject: string; title: string };

// Subjects and document titles for the public SAATHI page (subject picker and
// starter questions). Only parent rows are read, never chunk content.
export const listSaathiTopics = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ subjects: string[]; topics: SaathiTopic[] }> => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("saathi_knowledge")
      .select("subject,title")
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const topics = (data ?? []).filter((r) => r.subject && r.title) as SaathiTopic[];
    const subjects = Array.from(new Set(topics.map((t) => t.subject))).sort();
    return { subjects, topics };
  },
);

export const submitSaathiFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      question: z.string().trim().min(1).max(2000),
      answer: z.string().trim().min(1).max(20_000),
      rating: z.union([z.literal(1), z.literal(-1)]),
      sources: z.array(z.string().max(300)).max(20).default([]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { consumeSaathiRateLimit } = await import("@/lib/saathi-ask.server");
    if (!(await consumeSaathiRateLimit(getRequest(), "feedback"))) {
      throw new Error("Too many requests. Please try again later.");
    }
    const admin = await getAdmin();
    const { error } = await admin.from("saathi_feedback" as never).insert({
      question: data.question,
      answer: data.answer,
      rating: data.rating,
      sources: data.sources,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SaathiKnowledgeGap = {
  id: string;
  question: string;
  ask_count: number;
  last_asked_at: string;
  created_at: string;
};

export const listKnowledgeGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaathiKnowledgeGap[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("saathi_knowledge_gaps" as never)
      .select("*")
      .order("last_asked_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SaathiKnowledgeGap[];
  });

export const deleteKnowledgeGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("saathi_knowledge_gaps" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type SaathiFeedback = {
  id: string;
  question: string;
  answer: string;
  rating: 1 | -1;
  sources: string[];
  created_at: string;
};

export const listSaathiFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ up: number; down: number; recentDown: SaathiFeedback[] }> => {
    const admin = await assertAdmin(context.userId);
    const table = "saathi_feedback" as never;
    const [up, down, recent] = await Promise.all([
      admin.from(table).select("id", { count: "exact", head: true }).eq("rating", 1),
      admin.from(table).select("id", { count: "exact", head: true }).eq("rating", -1),
      admin
        .from(table)
        .select("id,question,answer,rating,sources,created_at")
        .eq("rating", -1)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const failed = [up, down, recent].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return {
      up: up.count ?? 0,
      down: down.count ?? 0,
      recentDown: (recent.data ?? []) as unknown as SaathiFeedback[],
    };
  });

export const deleteSaathiFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("saathi_feedback" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
