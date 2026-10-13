// SAATHI question answering, shared by the website (src/lib/saathi-ask.server.ts)
// and the Telegram bot (supabase/functions/telegram-demo-bot). Keep this file free
// of runtime-specific imports so both Node (Vite) and Deno can load it.

export const SAATHI_AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const SAATHI_EMBED_MODEL = "google/gemini-embedding-001";
export const SAATHI_EMBED_DIMS = 1536;
export const SAATHI_CHAT_MODEL = "google/gemini-3-flash-preview";

// The model starts its reply with this token when the material can't answer the question.
export const SAATHI_NO_ANSWER_MARKER = "[[NO_ANSWER]]";

// Chunks with no keyword hit need at least this cosine similarity to reach the model.
// Kept low because Hindi questions about English material score lower; the model
// still refuses when the material doesn't answer. Raise it if off-topic questions
// burn credits; lower it if real questions show up as knowledge gaps.
export const SAATHI_MIN_VECTOR_SCORE = 0.5;

export const SAATHI_MATCH_COUNT = 8;
export const SAATHI_HISTORY_TURNS = 6;

export type SaathiChannel = "web" | "telegram";

export type SaathiTurn = { role: "user" | "assistant"; content: string };

export type SaathiMatch = {
  id: string;
  title: string;
  subject: string;
  topic?: string | null;
  medium?: string | null;
  content: string;
  source_file: string | null;
  vector_score: number;
  keyword_score: number;
  similarity: number;
};

export type SaathiSource = {
  title: string;
  subject: string;
  topic: string | null;
  passages: string[];
};

// Newline-delimited JSON events streamed by the website's /api/saathi/ask route.
export type SaathiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; noAnswer: boolean; sources: SaathiSource[] }
  | { type: "error"; message: string };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type SaathiRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export class SaathiAiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function gatewayError(status: number, body: string): SaathiAiError {
  if (status === 429)
    return new SaathiAiError("SAATHI is busy right now. Please try again in a minute.", 429);
  if (status === 402)
    return new SaathiAiError("SAATHI is unavailable right now. Please try again later.", 402);
  return new SaathiAiError(`AI request failed (${status}): ${body.slice(0, 300)}`, status);
}

export async function saathiEmbed(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch(`${SAATHI_AI_GATEWAY}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: SAATHI_EMBED_MODEL, input: text, dimensions: SAATHI_EMBED_DIMS }),
  });
  if (!res.ok) throw gatewayError(res.status, await res.text());
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

const EMBED_BATCH = 64;

// Embeds many texts with one request per batch, keeping input order. If the gateway
// rejects batched input, falls back to a few single requests at a time.
export async function saathiEmbedMany(apiKey: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    out.push(...(await embedBatch(apiKey, batch)));
  }
  return out;
}

async function embedBatch(apiKey: string, batch: string[]): Promise<number[][]> {
  const res = await fetch(`${SAATHI_AI_GATEWAY}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: SAATHI_EMBED_MODEL,
      input: batch,
      dimensions: SAATHI_EMBED_DIMS,
    }),
  });
  if (res.status === 429 || res.status === 402) throw gatewayError(res.status, await res.text());
  if (res.ok) {
    const json = (await res.json()) as { data?: { embedding: number[]; index?: number }[] };
    const data = json.data ?? [];
    if (data.length === batch.length) {
      return data
        .map((d, i) => ({ i: d.index ?? i, e: d.embedding }))
        .sort((a, b) => a.i - b.i)
        .map((d) => d.e);
    }
  }
  const single: number[][] = new Array(batch.length);
  for (let i = 0; i < batch.length; i += 4) {
    const part = await Promise.all(batch.slice(i, i + 4).map((t) => saathiEmbed(apiKey, t)));
    part.forEach((e, j) => (single[i + j] = e));
  }
  return single;
}

export async function saathiComplete(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${SAATHI_AI_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: SAATHI_CHAT_MODEL, messages }),
  });
  if (!res.ok) throw gatewayError(res.status, await res.text());
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// Starts a streamed completion. Resolves once the gateway has accepted the request,
// so rate-limit and credit errors surface before any text is sent to the student.
export async function saathiCompleteStream(
  apiKey: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<AsyncGenerator<string>> {
  const res = await fetch(`${SAATHI_AI_GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: SAATHI_CHAT_MODEL, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw gatewayError(res.status, await res.text());
  return readSseDeltas(res.body);
}

async function* readSseDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore keep-alives and partial frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function cleanHistory(history: SaathiTurn[]): SaathiTurn[] {
  return history
    .filter((t) => (t.role === "user" || t.role === "assistant") && t.content.trim())
    .slice(-SAATHI_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 3000) }));
}

// Follow-ups like "explain more" search badly on their own, so rewrite them into a
// standalone question using the conversation. Falls back to the original on failure.
export async function saathiStandaloneQuestion(
  apiKey: string,
  history: SaathiTurn[],
  question: string,
): Promise<string> {
  if (history.length === 0) return question;
  const transcript = history
    .map((t) => `${t.role === "user" ? "Student" : "SAATHI"}: ${t.content.slice(0, 1200)}`)
    .join("\n");
  try {
    const rewritten = await saathiComplete(apiKey, [
      {
        role: "system",
        content:
          "Rewrite the student's latest message as one standalone question that can be understood without the conversation. Keep the same language and script. If it is already standalone, return it unchanged. Output only the question.",
      },
      { role: "user", content: `Conversation:\n${transcript}\n\nLatest message: ${question}` },
    ]);
    const clean = rewritten.replace(/^["'\s]+|["'\s]+$/g, "");
    return clean && clean.length <= 1000 ? clean : question;
  } catch {
    return question;
  }
}

// Searches the knowledge base. Falls back to the older per-subject RPC if the
// match_saathi_chunks migration hasn't been applied yet.
export async function saathiSearch(
  rpc: SaathiRpc,
  query: string,
  embedding: number[],
  subjects: string[] | null,
): Promise<SaathiMatch[]> {
  const res = await rpc("match_saathi_chunks", {
    query_text: query,
    query_embedding: embedding,
    match_count: SAATHI_MATCH_COUNT,
    subject_filters: subjects && subjects.length ? subjects : null,
  });
  if (!res.error) return preferQuestionLanguage((res.data ?? []) as SaathiMatch[], query);
  if (res.error.code !== "PGRST202") throw new Error(res.error.message);

  const perSubject = await Promise.all(
    (subjects && subjects.length ? subjects : [null]).map((subject) =>
      rpc("match_saathi_hybrid", {
        query_text: query,
        query_embedding: embedding,
        match_count: SAATHI_MATCH_COUNT,
        subject_filter: subject,
      }),
    ),
  );
  const failed = perSubject.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  const seen = new Set<string>();
  return perSubject
    .flatMap((r) => (r.data ?? []) as Omit<SaathiMatch, "vector_score" | "keyword_score">[])
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m) => ({ ...m, vector_score: m.similarity, keyword_score: 0 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SAATHI_MATCH_COUNT);
}

const DEVANAGARI = /[\u0900-\u097F]/;
const LANGUAGE_BONUS = 0.03;

// Nudges chunks written in the question's language (by the document's medium) ahead
// of equally relevant chunks in the other language. Relevance cut-offs still use
// the raw scores.
function preferQuestionLanguage(matches: SaathiMatch[], query: string): SaathiMatch[] {
  const wanted = DEVANAGARI.test(query) ? "Hindi" : "English";
  return matches
    .map((m) => ({
      ...m,
      similarity:
        m.similarity + (m.medium === wanted || m.medium === "Bilingual" ? LANGUAGE_BONUS : 0),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

export function relevantMatches(matches: SaathiMatch[]): SaathiMatch[] {
  return matches.filter((m) => m.keyword_score > 0 || m.vector_score >= SAATHI_MIN_VECTOR_SCORE);
}

export function collectSources(matches: SaathiMatch[]): SaathiSource[] {
  const byTitle = new Map<string, SaathiSource>();
  for (const m of matches) {
    const title = m.source_file || m.title;
    const existing = byTitle.get(title);
    if (existing) existing.passages.push(m.content);
    else
      byTitle.set(title, {
        title,
        subject: m.subject,
        topic: m.topic ?? null,
        passages: [m.content],
      });
  }
  return [...byTitle.values()];
}

const FORMAT_RULES: Record<SaathiChannel, string> = {
  web: `FORMAT: Use Markdown. Start with a one-line direct answer, then use **bold** key terms and short bullet points. Use a Markdown table for comparisons, timelines or lists of facts.

DIAGRAMS: Only when a step-by-step process is genuinely clearer as a picture, you may add one small \`\`\`mermaid block using "flowchart TD" with short, double-quoted node labels. Otherwise do not draw diagrams.`,
  telegram: `FORMAT: Well-formatted study notes for a Telegram chat. Start with a one-line direct answer in **bold**. Then give short "- " bullet points (or "1. " numbered steps for processes). Use **bold** for key terms, names, dates, articles and numbers, and *italic* for translations, book titles or side notes. Separate groups of points with a blank line. You may use one short heading line written in **bold** if it helps. No Markdown tables, # headings, code blocks or diagrams.`,
};

export function saathiSystemPrompt(channel: SaathiChannel): string {
  return `You are SAATHI, a friendly study assistant for students preparing for exams.

GROUNDING: Answer ONLY from the study material provided with the question. Do not use outside knowledge and do not guess. If the material does not contain the answer, begin your reply with the exact token ${SAATHI_NO_ANSWER_MARKER} and then, in one or two short sentences, say that this topic isn't in the study material yet; if the material covers a closely related topic, suggest it. If the material answers only part of the question, answer that part, say clearly what is not covered, and do not use the token.

LANGUAGE: Reply in the same language and script as the student's latest message: Hindi in Devanagari gets Hindi in Devanagari, Hinglish (Hindi in Latin letters) gets Hinglish, English gets English. Keep names and technical terms as they appear in the material.

${FORMAT_RULES[channel]}

Do not add source citations; the app shows the sources separately.`;
}

export function saathiMessages(opts: {
  channel: SaathiChannel;
  history: SaathiTurn[];
  question: string;
  matches: SaathiMatch[];
}): ChatMessage[] {
  const material = opts.matches
    .map(
      (m, i) =>
        `[Material ${i + 1}] ${m.source_file || m.title} (${[m.subject, m.topic].filter(Boolean).join(" › ")})\n${m.content}`,
    )
    .join("\n\n---\n\n");
  return [
    { role: "system", content: saathiSystemPrompt(opts.channel) },
    ...opts.history,
    {
      role: "user",
      content: `Study material:\n\n${material}\n\n---\n\nStudent's question: ${opts.question}`,
    },
  ];
}

// Shown when nothing relevant was found, so no model call is made.
export function saathiNoMaterialReply(question: string): string {
  return DEVANAGARI.test(question)
    ? "मेरे अध्ययन सामग्री में अभी इस विषय की जानकारी नहीं है। कृपया कोई दूसरा प्रश्न पूछें या अलग विषय चुनें।"
    : "I don't have this topic in my study material yet. Try asking another question or picking a different subject.";
}

// Strips the no-answer token from the start of a (possibly streamed) reply.
export class NoAnswerFilter {
  private pending = "";
  private decided = false;
  noAnswer = false;

  push(delta: string): string {
    if (this.decided) return delta;
    this.pending += delta;
    const head = this.pending.trimStart();
    if (
      head.length >= SAATHI_NO_ANSWER_MARKER.length ||
      !SAATHI_NO_ANSWER_MARKER.startsWith(head)
    ) {
      return this.decide();
    }
    return "";
  }

  finish(): string {
    return this.decided ? "" : this.decide();
  }

  private decide(): string {
    this.decided = true;
    const head = this.pending.trimStart();
    this.pending = "";
    if (head.startsWith(SAATHI_NO_ANSWER_MARKER)) {
      this.noAnswer = true;
      return head.slice(SAATHI_NO_ANSWER_MARKER.length).trimStart();
    }
    return head;
  }
}

export function stripNoAnswer(text: string): { noAnswer: boolean; text: string } {
  const filter = new NoAnswerFilter();
  const out = filter.push(text) + filter.finish();
  return { noAnswer: filter.noAnswer, text: out };
}
