import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseQuiz,
  relevantMatches,
  saathiComplete,
  saathiEmbed,
  saathiQuizMessages,
  saathiRetrieve,
  saathiSearchQuery,
  SAATHI_CONTEXT_CHUNKS,
  type SaathiQuizItem,
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
  // Decks only: who published it (NCERT, IGNOU…).
  source?: string | null;
};

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

async function embed(text: string): Promise<number[]> {
  return saathiEmbed(apiKey(), text);
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
const DECK_COLS = `${DOC_COLS},source`;

// The database returns at most 1,000 rows per request, so lists are read in pages.
const PAGE = 1000;

export type SaathiDeck = SaathiDoc & { chunk_count: number };

// Decks only, with how many chunks each has; chunks load when a deck is opened.
export const listSaathiDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaathiDeck[]> => {
    const admin = await assertAdmin(context.userId);
    const out: SaathiDeck[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await admin
        .from("saathi_knowledge")
        .select(`${DECK_COLS},chunks:saathi_knowledge!parent_id(count)`)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, start + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as (SaathiDoc & { chunks: { count: number }[] })[];
      for (const { chunks, ...doc } of rows)
        out.push({ ...doc, chunk_count: chunks[0]?.count ?? 0 });
      if (rows.length < PAGE) break;
    }
    return out;
  });

// One deck's chunks, in order.
export const listSaathiChunks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ parent_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SaathiDoc[]> => {
    const admin = await assertAdmin(context.userId);
    const out: SaathiDoc[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data: rows, error } = await admin
        .from("saathi_knowledge")
        .select(DOC_COLS)
        .eq("parent_id", data.parent_id)
        .order("chunk_index")
        .order("id")
        .range(start, start + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...((rows ?? []) as unknown as SaathiDoc[]));
      if ((rows ?? []).length < PAGE) break;
    }
    return out;
  });

const docMeta = {
  title: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(120).nullish(),
  medium: z.enum(["Hindi", "English", "Bilingual"]),
  source: z.string().trim().max(120).nullish(),
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
      {
        title: data.title,
        subject: data.subject,
        topic: data.topic || null,
        medium: data.medium,
        source: data.source || null,
      },
      data.content,
    );
  });

export const updateSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ...docMeta,
        content: z.string().trim().min(1).max(200_000),
        is_chunk: z.boolean().default(false),
      })
      .parse(input),
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
      .update({
        title: data.title,
        subject,
        topic,
        medium: data.medium,
        ...(data.source !== undefined ? { source: data.source || null } : {}),
      } as never)
      .eq("id", data.id)
      .select(DECK_COLS)
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

// Sets who published several decks at once (NCERT, IGNOU…); empty clears it.
export const setSaathiSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(5000),
        source: z.string().trim().max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    let updated = 0;
    for (let i = 0; i < data.ids.length; i += 200) {
      const { data: rows, error } = await admin
        .from("saathi_knowledge")
        .update({ source: data.source || null } as never)
        .in("id", data.ids.slice(i, i + 200))
        .is("parent_id", null)
        .select("id");
      if (error) throw new Error(error.message);
      updated += (rows ?? []).length;
    }
    return { updated };
  });

export const appendSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parent_id: z.string().uuid(),
        content: z.string().trim().min(1).max(500_000),
      })
      .parse(input),
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
    z
      .object({
        id: z.string().uuid(),
        content: z.string().trim().min(1).max(500_000).optional(),
      })
      .parse(input),
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
  hindi_chunks?: number;
  english_chunks?: number;
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
  // Position among the chunks given to the AI (1 = first), or null if not used.
  used_rank: number | null;
};

export type SaathiRetrievalResult = {
  standalone: string;
  english: string | null;
  hits: SaathiRetrievalHit[];
};

const docOf = (m: { source_file: string | null; title: string }) => m.source_file || m.title;

// Admin tool: runs the same search as students get (including the English search
// for Hindi/Hinglish questions and re-ranking) and shows every candidate chunk.
export const testSaathiRetrieval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SaathiRetrievalResult> => {
    const admin = await assertAdmin(context.userId);
    const rpc: SaathiRpc = (fn, args) => admin.rpc(fn as never, args as never);
    const { query, candidates, matches } = await saathiRetrieve({
      apiKey: apiKey(),
      rpc,
      history: [],
      question: data.question,
      subjects: data.subjects,
    });
    const relevant = new Set(relevantMatches(candidates).map((m) => m.id));
    const rank = new Map(matches.map((m, i) => [m.id, i + 1]));
    const hits = candidates.map((m) => ({
      id: m.id,
      title: m.title,
      document: docOf(m),
      subject: m.subject,
      topic: m.topic ?? null,
      medium: m.medium ?? null,
      content: m.content,
      vector_score: m.vector_score,
      keyword_score: m.keyword_score,
      similarity: m.similarity,
      relevant: relevant.has(m.id),
      used_rank: rank.get(m.id) ?? null,
    }));
    hits.sort((a, b) => (a.used_rank ?? 99) - (b.used_rank ?? 99) || b.similarity - a.similarity);
    return { standalone: query.standalone, english: query.english, hits };
  });

// ---------- Test set ----------

export type SaathiEvalQuestion = {
  id: string;
  question: string;
  expected_document: string;
  last_passed: boolean | null;
  last_rank: number | null;
  last_english_query: string | null;
  last_run_at: string | null;
  created_at: string;
};

const evalTable = "saathi_eval_questions" as never;

export const listSaathiEvals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaathiEvalQuestion[]> => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from(evalTable)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SaathiEvalQuestion[];
  });

export const addSaathiEval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        expected_document: z.string().trim().min(1).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from(evalTable).insert(data as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSaathiEval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from(evalTable).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Runs one saved question through the student search and records whether the
// expected document was among the chunks given to the AI.
export const runSaathiEval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SaathiEvalQuestion> => {
    const admin = await assertAdmin(context.userId);
    const { data: row, error } = await admin.from(evalTable).select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const q = row as unknown as SaathiEvalQuestion;
    const rpc: SaathiRpc = (fn, args) => admin.rpc(fn as never, args as never);
    const { query, matches } = await saathiRetrieve({
      apiKey: apiKey(),
      rpc,
      history: [],
      question: q.question,
      subjects: null,
    });
    const expected = q.expected_document.trim().toLowerCase();
    const index = matches.findIndex((m) => docOf(m).trim().toLowerCase() === expected);
    const result = {
      last_passed: index >= 0,
      last_rank: index >= 0 ? index + 1 : null,
      last_english_query: query.english,
      last_run_at: new Date().toISOString(),
    };
    const { data: saved, error: uErr } = await admin
      .from(evalTable)
      .update(result as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);
    return saved as unknown as SaathiEvalQuestion;
  });

// ---------- "Quiz me" (public) ----------

// Builds 3 practice MCQs from the same material an answer used. The search
// queries come from the answer's "done" event; the material is fetched again
// server-side, so students never send study text to this endpoint.
export const saathiQuiz = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        searchQuery: z.string().trim().min(1).max(1000),
        englishQuery: z.string().trim().min(1).max(1000).nullish(),
        subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SaathiQuizItem[]> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { consumeSaathiRateLimit, isSaathiLocked, saathiRpc } =
      await import("@/lib/saathi-ask.server");
    if (await isSaathiLocked()) throw new Error("SAATHI is coming soon!");
    if (!(await consumeSaathiRateLimit(getRequest(), "quiz"))) {
      throw new Error("Too many requests. Please wait a minute and try again.");
    }
    const key = apiKey();
    const candidates = await saathiSearchQuery(
      key,
      saathiRpc,
      { standalone: data.searchQuery, english: data.englishQuery ?? null },
      data.subjects,
    );
    const matches = relevantMatches(candidates).slice(0, SAATHI_CONTEXT_CHUNKS);
    const quiz = parseQuiz(
      await saathiComplete(key, saathiQuizMessages(data.searchQuery, matches)),
    );
    if (quiz.length === 0) throw new Error("Couldn't make a quiz this time. Please try again.");
    return quiz;
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
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        answer: z.string().trim().min(1).max(20_000),
        rating: z.union([z.literal(1), z.literal(-1)]),
        sources: z.array(z.string().max(300)).max(20).default([]),
      })
      .parse(input),
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

// Static concepts behind the last 6 months' magazine stories that no book in
// the knowledge base explained (the background, if any, is SAATHI's own).
export const listUncoveredConcepts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context.userId);
    const { uncoveredConcepts } = await import("@/lib/current-affairs");
    const since = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
    const rows: Parameters<typeof uncoveredConcepts>[0] = [];
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await admin
        .from("ca_items" as never)
        .select("concept,issue_date,headline,context_sources")
        .not("concept", "is", null)
        .eq("status", "included")
        .eq("needs_enrich", false)
        .gte("issue_date", since)
        .order("issue_date", { ascending: false })
        .range(start, start + PAGE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as typeof rows;
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return uncoveredConcepts(rows).slice(0, 100);
  });

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
  .handler(
    async ({ context }): Promise<{ up: number; down: number; recentDown: SaathiFeedback[] }> => {
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
    },
  );

export const deleteSaathiFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("saathi_feedback" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
