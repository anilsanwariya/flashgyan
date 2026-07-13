import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type SaathiChatSource = {
  id: string;
  title: string;
  subject: string;
  similarity: number;
};

const EMBED_MODEL = "google/gemini-embedding-001";
const EMBED_DIMS = 1536;
const CHAT_MODEL = "google/gemini-3-flash-preview";

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

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
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

export const listSaathiSubjects = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getAdmin();
  const { data, error } = await admin.from("saathi_knowledge").select("subject");
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) if (row.subject) set.add(row.subject);
  return Array.from(set).sort();
});

const FALLBACK = "I don't have information on that subject in my current study materials.";
const SYSTEM_PROMPT = `You are SAATHI, an expert study assistant. Answer questions ONLY based on the provided database context. If the answer is not contained in the context, reply exactly with: '${FALLBACK}'

LANGUAGE MATCHING: You must detect the language of the user's question and reply in that EXACT same language (e.g., if asked in Hindi, reply in Hindi). Ensure Hindi grammatical structures are preserved.

SOURCE CITATIONS: Every time you state a fact or provide an explanation based on the context, you MUST append a citation using the exact Source Title provided. Format it at the end of your thought like this: (Source: [Title]).

RICH FORMATTING: Always format your answers using Markdown. Use **bold** for headings and keywords. Use bullet points where appropriate.

VISUAL AIDS: When explaining processes, timelines, or comparisons, you MUST use Markdown tables, or generate Mermaid.js code blocks (\`\`\`mermaid) to draw diagrams to make concepts easier for students.`;

export const askSaathi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      question: z.string().trim().min(1).max(2000),
      subjects: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");
    const admin = await getAdmin();
    const queryEmbedding = await embed(data.question);

    const perSubject = await Promise.all(
      data.subjects.map((subject) =>
        admin.rpc("match_saathi_hybrid", {
          query_text: data.question,
          query_embedding: queryEmbedding as unknown as string,
          match_count: 6,
          subject_filter: subject,
        }),
      ),
    );

    const errored = perSubject.find((r) => r.error);
    if (errored?.error) throw new Error(errored.error.message);

    const merged = perSubject.flatMap((r) => (r.data ?? []) as Array<{
      id: string; title: string; subject: string; content: string; source_file: string; similarity: number;
    }>);

    const seen = new Set<string>();
    const matches = merged
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);

    const sources = matches;

    if (sources.length === 0) return { answer: FALLBACK, sources: [] as SaathiChatSource[] };

    // Feed the AI the Parent Deck name (source_file) instead of the chunk title
    const contextBlock = sources
      .map((s, i) => `[Source ${i + 1}] Title: ${s.source_file}\nSubject: ${s.subject}\nContent:\n${s.content}`)
      .join("\n\n---\n\n");

    const userPrompt = `Context from knowledge base:\n\n${contextBlock}\n\n---\n\nQuestion: ${data.question}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
      }),
    });

    if (aiRes.status === 429) throw new Error("Rate limit reached. Please try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    if (!aiRes.ok) {
      const body = await aiRes.text();
      throw new Error(`AI request failed (${aiRes.status}): ${body}`);
    }

    const aiJson = (await aiRes.json()) as { choices: { message: { content: string } }[] };
    const answer = aiJson.choices?.[0]?.message?.content?.trim() || FALLBACK;

    // Deduplicate the sources by Parent Deck title for the UI
    const uniqueSources: SaathiChatSource[] = [];
    const seenTitles = new Set<string>();

    for (const s of sources) {
      if (!seenTitles.has(s.source_file)) {
        seenTitles.add(s.source_file);
        uniqueSources.push({
          id: s.id,
          title: s.source_file,
          subject: s.subject,
          similarity: s.similarity,
        });
      }
    }

    return {
      answer,
      sources: uniqueSources,
    };
  });

