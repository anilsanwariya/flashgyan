import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  relevantMatches,
  saathiEmbed,
  saathiSearch,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";

export type SaathiMedium = "Hindi" | "English" | "Bilingual";

export type SaathiDoc = {
  id: string;
  title: string;
  subject: string;
  medium: SaathiMedium;
  topic: string | null;
  content: string;
  created_at: string;
  parent_id: string | null;
  chunk_index: number | null;
};

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return saathiEmbed(key, text);
}

async function ingest() {
  return import("@/lib/saathi-ingest.server");
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

const DOC_COLS = "id,title,subject,medium,topic,content,created_at,parent_id,chunk_index";

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

const docMeta = {
  title: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(120).nullish(),
  medium: z.enum(["Hindi", "English", "Bilingual"]),
};

export const createSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ...docMeta, content: z.string().trim().min(1).max(500_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { createDocument } = await ingest();
    return createDocument(
      { title: data.title, subject: data.subject, topic: data.topic || null, medium: data.medium },
      data.content,
    );
  });

export const updateSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      ...docMeta,
      content: z.string().trim().min(1).max(200_000),
      is_chunk: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { canonicalSubject, chunkTitle, embeddingText } = await ingest();

    if (data.is_chunk) {
      const { data: chunk, error: cErr } = await admin
        .from("saathi_knowledge")
        .select("subject,topic,medium,source_file,title")
        .eq("id", data.id)
        .single();
      if (cErr) throw new Error(cErr.message);
      const c = chunk as unknown as {
        subject: string;
        topic: string | null;
        medium: string;
        source_file: string | null;
        title: string;
      };
      const embedding = await embed(
        embeddingText(
          { title: c.source_file || c.title, subject: c.subject, topic: c.topic, medium: c.medium },
          data.content,
        ),
      );
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
    }

    const subject = await canonicalSubject(data.subject);
    const topic = data.topic || null;
    const { data: row, error } = await admin
      .from("saathi_knowledge")
      .update({ title: data.title, subject, topic, medium: data.medium } as never)
      .eq("id", data.id)
      .select(DOC_COLS)
      .single();
    if (error) throw new Error(error.message);

    // Search reads the chunks, so they must carry the parent's metadata and title.
    // Embeddings are not refreshed here; use Rebuild to re-embed with the new labels.
    const { data: chunks, error: chunkErr } = await admin
      .from("saathi_knowledge")
      .update({ subject, topic, medium: data.medium, source_file: data.title } as never)
      .eq("parent_id", data.id)
      .select("id,chunk_index");
    if (chunkErr) throw new Error(chunkErr.message);
    const parts = chunks ?? [];
    for (const c of parts) {
      const title = chunkTitle(data.title, c.chunk_index ?? 1, parts.length);
      const { error: tErr } = await admin.from("saathi_knowledge").update({ title }).eq("id", c.id);
      if (tErr) throw new Error(tErr.message);
    }
    return row as unknown as SaathiDoc;
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
    await assertAdmin(context.userId);
    const { appendToDocument } = await ingest();
    return appendToDocument(data.parent_id, data.content);
  });

// Replaces a document's text (content given) or rebuilds its chunks from the saved
// original with the current splitter (content omitted).
export const replaceSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      content: z.string().trim().min(1).max(500_000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { replaceDocument } = await ingest();
    return replaceDocument(data.id, data.content ?? null);
  });

export type SaathiHealthRow = {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  medium: string;
  created_at: string;
  is_legacy: boolean;
  has_source: boolean;
  chunk_count: number;
  avg_chars: number;
  max_chars: number;
  tiny_chunks: number;
  oversized_chunks: number;
  missing_embeddings: number;
  duplicate_chunks: number;
};

export const getSaathiHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaathiHealthRow[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin.rpc("saathi_health" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SaathiHealthRow[];
  });

export type SaathiRetrievalHit = {
  id: string;
  title: string;
  document: string;
  subject: string;
  topic: string | null;
  medium: string | null;
  content: string;
  vector_score: number;
  keyword_score: number;
  similarity: number;
  relevant: boolean;
};

// Admin tool: shows exactly which chunks SAATHI would read for a question.
export const testSaathiRetrieval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      question: z.string().trim().min(1).max(2000),
      subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SaathiRetrievalHit[]> => {
    const admin = await assertAdmin(context.userId);
    const embedding = await embed(data.question);
    const rpc: SaathiRpc = (fn, args) => admin.rpc(fn as never, args as never);
    const matches = await saathiSearch(rpc, data.question, embedding, data.subjects);
    const relevant = new Set(relevantMatches(matches).map((m) => m.id));
    return matches.map((m) => ({
      id: m.id,
      title: m.title,
      document: m.source_file || m.title,
      subject: m.subject,
      topic: m.topic ?? null,
      medium: m.medium ?? null,
      content: m.content,
      vector_score: m.vector_score,
      keyword_score: m.keyword_score,
      similarity: m.similarity,
      relevant: relevant.has(m.id),
    }));
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
      // Old single-row documents aren't searchable until rebuilt, so don't suggest them.
      .eq("content", "")
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
