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

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
      dimensions: EMBED_DIMS,
    }),
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

// ---------------- Admin server functions ----------------

export const listSaathiDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertAdmin(context.userId);
    const { data, error } = await admin
      .from("saathi_knowledge")
      .select("id,title,subject,medium,content,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SaathiDoc[];
  });

export const createSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(300),
        subject: z.string().trim().min(1).max(120),
        medium: z.enum(["Hindi", "English", "Bilingual"]),
        content: z.string().trim().min(1).max(200_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const embedInput = `${data.title}\n\n${data.content}`.slice(0, 30_000);
    const embedding = await embed(embedInput);
    const { data: row, error } = await admin
      .from("saathi_knowledge")
      .insert({
        title: data.title,
        subject: data.subject,
        medium: data.medium,
        content: data.content,
        embedding: embedding as unknown as string,
      })
      .select("id,title,subject,medium,content,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as SaathiDoc;
  });

export const updateSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(300),
        subject: z.string().trim().min(1).max(120),
        medium: z.enum(["Hindi", "English", "Bilingual"]),
        content: z.string().trim().min(1).max(200_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const embedInput = `${data.title}\n\n${data.content}`.slice(0, 30_000);
    const embedding = await embed(embedInput);
    const { data: row, error } = await admin
      .from("saathi_knowledge")
      .update({
        title: data.title,
        subject: data.subject,
        medium: data.medium,
        content: data.content,
        embedding: embedding as unknown as string,
      })
      .eq("id", data.id)
      .select("id,title,subject,medium,content,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as SaathiDoc;
  });

export const deleteSaathiDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin.from("saathi_knowledge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Public chat server functions ----------------

export const listSaathiSubjects = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getAdmin();
  const { data, error } = await admin.from("saathi_knowledge").select("subject");
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) if (row.subject) set.add(row.subject);
  return Array.from(set).sort();
});

const FALLBACK = "I don't have information on that subject.";
const SYSTEM_PROMPT = `You are SAATHI, an expert study assistant. Answer questions ONLY based on the provided database context. If the answer is not contained in the context, reply exactly with: '${FALLBACK}'

LANGUAGE MATCHING: You must detect the language of the user's question and reply in that EXACT same language (e.g., if asked in Hindi, reply in Hindi; if in English, reply in English).

RICH FORMATTING: Always format your answers using Markdown. Use **bold** for headings, and *italicize* or **bold** important keywords for emphasis. Use bullet points and numbered lists where appropriate.

VISUAL AIDS: When explaining processes, timelines, or comparisons, you MUST use Markdown tables, or generate Mermaid.js code blocks (\`\`\`mermaid) to draw flowcharts/diagrams to make the concepts easier for students to understand.`;

export const askSaathi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
        subjects: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");
    const admin = await getAdmin();

    const queryEmbedding = await embed(data.question);

    // Run one match per subject and merge top results.
    const perSubject = await Promise.all(
      data.subjects.map((subject) =>
        admin.rpc("match_saathi_knowledge", {
          query_embedding: queryEmbedding as unknown as string,
          match_count: 6,
          subject_filter: subject,
        }),
      ),
    );
    const errored = perSubject.find((r) => r.error);
    if (errored?.error) throw new Error(errored.error.message);
    const merged = perSubject.flatMap((r) => (r.data ?? []) as Array<{
      id: string;
      title: string;
      subject: string;
      content: string;
      similarity: number;
    }>);
    const seen = new Set<string>();
    const matches = merged
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 8);


    const sources = matches as Array<{
      id: string;
      title: string;
      subject: string;
      content: string;
      similarity: number;
    }>;

    if (sources.length === 0) {
      return {
        answer: FALLBACK,
        sources: [] as SaathiChatSource[],
      };
    }

    const contextBlock = sources
      .map(
        (s, i) =>
          `[Source ${i + 1}] Title: ${s.title}\nSubject: ${s.subject}\nContent:\n${s.content}`,
      )
      .join("\n\n---\n\n");

    const userPrompt = `Context from knowledge base:\n\n${contextBlock}\n\n---\n\nQuestion: ${data.question}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) throw new Error("Rate limit reached. Please try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    if (!aiRes.ok) {
      const body = await aiRes.text();
      throw new Error(`AI request failed (${aiRes.status}): ${body}`);
    }

    const aiJson = (await aiRes.json()) as {
      choices: { message: { content: string } }[];
    };
    const answer = aiJson.choices?.[0]?.message?.content?.trim() || FALLBACK;

    return {
      answer,
      sources: sources.map((s) => ({
        id: s.id,
        title: s.title,
        subject: s.subject,
        similarity: s.similarity,
      })) satisfies SaathiChatSource[],
    };
  });
