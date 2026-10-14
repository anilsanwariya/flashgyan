// SAATHI question answering, shared by the website (src/lib/saathi-ask.server.ts)
// and the Telegram bot (supabase/functions/telegram-demo-bot). Keep this file free
// of runtime-specific imports so both Node (Vite) and Deno can load it.

export const SAATHI_AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const SAATHI_EMBED_MODEL = "google/gemini-embedding-001";
export const SAATHI_EMBED_DIMS = 1536;
export const SAATHI_CHAT_MODEL = "google/gemini-3-flash-preview";

// The model starts its reply with this token when the material can't answer the question.
export const SAATHI_NO_ANSWER_MARKER = "[[NO_ANSWER]]";
// The model ends an answer with this token followed by suggested follow-up questions.
export const SAATHI_NEXT_MARKER = "[[NEXT]]";

// Chunks with no keyword hit need at least this cosine similarity to reach the model.
// Kept low because Hindi questions about English material score lower; the model
// still refuses when the material doesn't answer. Raise it if off-topic questions
// burn credits; lower it if real questions show up as knowledge gaps.
export const SAATHI_MIN_VECTOR_SCORE = 0.5;

export const SAATHI_MATCH_COUNT = 8;
// Candidates fetched per search query, and how many the re-ranker keeps for the answer.
export const SAATHI_CANDIDATES = 16;
export const SAATHI_CONTEXT_CHUNKS = 6;
export const SAATHI_HISTORY_TURNS = 6;

export type SaathiChannel = "web" | "telegram";

export type SaathiTurn = { role: "user" | "assistant"; content: string };

export type SaathiMatch = {
  id: string;
  title: string;
  subject: string;
  topic?: string | null;
  medium?: string | null;
  // The chunk's own language, detected from its script ("Hindi" | "English").
  language?: string | null;
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
// searchQuery/englishQuery are what the knowledge base was searched with; "Quiz me"
// sends them back so the quiz is built from the same material.
export type SaathiStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      noAnswer: boolean;
      sources: SaathiSource[];
      followups?: string[];
      searchQuery?: string;
      englishQuery?: string | null;
      // Answer-writing mode: marks, word limit, blueprint used, words written.
      mains?: {
        marks: number;
        wordLimit: number;
        directive: string;
        blueprint: { version: number; samples: number; directive: string; unit?: string } | null;
        exemplars: number;
        pyq: { year: number | null; paper: string | null; marks: number } | null;
        // The RAS Mains syllabus topic the question was matched to.
        syllabus?: { paper: string; unit: string; part: string; topic: string } | null;
        words?: number;
      };
    }
  | { type: "error"; message: string };

export type SaathiQuizItem = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

const HINGLISH_WORDS =
  /\b(kya|kyaa|hai|hain|ka|ki|ke|ko|kaun|kab|kaise|kahan|kitne|kitna|kyun|kyon|mein|aur|batao|samjhao|matlab|wala|wali|tha|thi)\b/i;

// True when the text is likely Hindi written in Latin letters.
export function looksHinglish(text: string): boolean {
  return !DEVANAGARI.test(text) && (text.match(new RegExp(HINGLISH_WORDS, "gi"))?.length ?? 0) >= 2;
}

export type SaathiQuery = {
  // The question rewritten to stand on its own, in the student's language.
  standalone: string;
  // An English version for searching English material; null when not needed.
  english: string | null;
};

export function parseJsonLoose<T>(raw: string): T | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = /[[{][\s\S]*[\]}]/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

// Turns the latest message into search queries: follow-ups like "explain more" are
// rewritten into a standalone question, and Hindi or Hinglish questions also get an
// English version so English material is found by both meaning and keywords.
// Plain English first questions need no model call.
export async function saathiPrepareQuery(
  apiKey: string,
  history: SaathiTurn[],
  question: string,
): Promise<SaathiQuery> {
  const translate = DEVANAGARI.test(question) || looksHinglish(question);
  if (history.length === 0 && !translate) return { standalone: question, english: null };
  const transcript = history
    .map((t) => `${t.role === "user" ? "Student" : "SAATHI"}: ${t.content.slice(0, 1200)}`)
    .join("\n");
  try {
    const raw = await saathiComplete(apiKey, [
      {
        role: "system",
        content:
          'You prepare search queries for a study assistant. Reply with JSON only: {"question": string, "english": string}. "question": the student\'s latest message rewritten as one standalone question that can be understood without the conversation, in the same language and script as the student wrote it (unchanged if already standalone). "english": the same question in clear English, keeping names, article numbers, dates and technical terms.',
      },
      {
        role: "user",
        content: `${transcript ? `Conversation:\n${transcript}\n\n` : ""}Latest message: ${question}`,
      },
    ]);
    const parsed = parseJsonLoose<{ question?: string; english?: string }>(raw);
    const standalone = parsed?.question?.trim().slice(0, 1000) || question;
    const english = parsed?.english?.trim().slice(0, 1000) || null;
    return {
      standalone,
      english: english && english.toLowerCase() !== standalone.toLowerCase() ? english : null,
    };
  } catch {
    return { standalone: question, english: null };
  }
}

// Searches the knowledge base. Falls back to the older per-subject RPC if the
// match_saathi_chunks migration hasn't been applied yet.
export async function saathiSearch(
  rpc: SaathiRpc,
  query: string,
  embedding: number[],
  subjects: string[] | null,
  matchCount = SAATHI_MATCH_COUNT,
  // Text whose language decides which chunks get the language bonus.
  languageOf = query,
): Promise<SaathiMatch[]> {
  const res = await rpc("match_saathi_chunks", {
    query_text: query,
    query_embedding: embedding,
    match_count: matchCount,
    subject_filters: subjects && subjects.length ? subjects : null,
  });
  if (!res.error) return preferQuestionLanguage((res.data ?? []) as SaathiMatch[], languageOf);
  if (res.error.code !== "PGRST202") throw new Error(res.error.message);

  const perSubject = await Promise.all(
    (subjects && subjects.length ? subjects : [null]).map((subject) =>
      rpc("match_saathi_hybrid", {
        query_text: query,
        query_embedding: embedding,
        match_count: matchCount,
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
    .slice(0, matchCount);
}

function queryTexts(query: SaathiQuery): string[] {
  return query.english ? [query.standalone, query.english] : [query.standalone];
}

// Embeddings for the standalone question and, when present, its English version.
export async function saathiEmbedQuery(apiKey: string, query: SaathiQuery): Promise<number[][]> {
  const texts = queryTexts(query);
  return texts.length === 1
    ? [await saathiEmbed(apiKey, texts[0])]
    : saathiEmbedMany(apiKey, texts);
}

// Searches with the standalone question and, when present, its English version,
// keeping each chunk's best scores from either search.
export async function saathiSearchQuery(
  apiKey: string,
  rpc: SaathiRpc,
  query: SaathiQuery,
  subjects: string[] | null,
  matchCount = SAATHI_CANDIDATES,
  // Precomputed from saathiEmbedQuery, when the caller also needs them.
  precomputed?: number[][],
): Promise<SaathiMatch[]> {
  const texts = queryTexts(query);
  const embeddings = precomputed ?? (await saathiEmbedQuery(apiKey, query));
  const results = await Promise.all(
    texts.map((t, i) =>
      saathiSearch(rpc, t, embeddings[i], subjects, matchCount, query.standalone),
    ),
  );
  const best = new Map<string, SaathiMatch>();
  for (const m of results.flat()) {
    const prev = best.get(m.id);
    best.set(
      m.id,
      prev
        ? {
            ...prev,
            vector_score: Math.max(prev.vector_score, m.vector_score),
            keyword_score: Math.max(prev.keyword_score, m.keyword_score),
            similarity: Math.max(prev.similarity, m.similarity),
          }
        : m,
    );
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}

// Asks the model which candidate chunks best answer the question, best first.
// Keeps the search order if there are few candidates or the model's reply is unusable.
export async function saathiRerank(
  apiKey: string,
  question: string,
  matches: SaathiMatch[],
  keep = SAATHI_CONTEXT_CHUNKS,
  // The student's language; when the same facts appear in Hindi and English,
  // the version in this language is kept.
  preferLanguage?: "Hindi" | "English",
): Promise<SaathiMatch[]> {
  if (matches.length <= keep) return matches;
  const list = matches
    .map((m, i) => {
      const lang = languageOf(m);
      return `[${i + 1}]${lang ? ` (${lang})` : ""} ${m.source_file || m.title}\n${m.content.slice(0, 700)}`;
    })
    .join("\n\n");
  const languageRule = preferLanguage
    ? ` The material may contain the same content in Hindi and English: never pick two passages that state the same facts in different languages; keep the ${preferLanguage} one.`
    : "";
  try {
    const raw = await saathiComplete(apiKey, [
      {
        role: "system",
        content: `You rank study material for answering a student's question. Reply with a JSON array of the numbers of the passages that help answer it, most useful first, at most ${keep} numbers. Use [] if none help.${languageRule}`,
      },
      { role: "user", content: `Question: ${question}\n\nPassages:\n\n${list}` },
    ]);
    const picked = parseJsonLoose<unknown[]>(raw);
    if (!Array.isArray(picked)) return matches.slice(0, keep);
    const seen = new Set<number>();
    const out = picked
      .map((n) => Number(n) - 1)
      .filter(
        (i) =>
          Number.isInteger(i) &&
          i >= 0 &&
          i < matches.length &&
          !seen.has(i) &&
          (seen.add(i), true),
      )
      .slice(0, keep)
      .map((i) => matches[i]);
    // An empty pick from the model is not trusted over the search scores.
    return out.length ? out : matches.slice(0, keep);
  } catch {
    return matches.slice(0, keep);
  }
}

export type SaathiRetrieval = {
  query: SaathiQuery;
  // Everything the searches returned, with scores (for the admin test tools).
  candidates: SaathiMatch[];
  // The chunks given to the model, best first. Empty means "no material".
  matches: SaathiMatch[];
};

// The full search pipeline shared by the website, the Telegram bot and admin tools.
export async function saathiRetrieve(opts: {
  apiKey: string;
  rpc: SaathiRpc;
  history: SaathiTurn[];
  question: string;
  subjects: string[] | null;
  query?: SaathiQuery;
  embeddings?: number[][];
  // How many chunks go to the model (longer answers need more material).
  keep?: number;
}): Promise<SaathiRetrieval> {
  const query = opts.query ?? (await saathiPrepareQuery(opts.apiKey, opts.history, opts.question));
  const candidates = await saathiSearchQuery(
    opts.apiKey,
    opts.rpc,
    query,
    opts.subjects,
    SAATHI_CANDIDATES,
    opts.embeddings,
  );
  const relevant = relevantMatches(candidates);
  const matches = await saathiRerank(
    opts.apiKey,
    query.english ?? query.standalone,
    relevant,
    opts.keep ?? SAATHI_CONTEXT_CHUNKS,
    questionLanguage(query.standalone),
  );
  return { query, candidates, matches };
}

const DEVANAGARI = /[\u0900-\u097F]/;
const LANGUAGE_BONUS = 0.03;

// Nudges chunks written in the question's language (by the document's medium) ahead
// of equally relevant chunks in the other language. Relevance cut-offs still use
// the raw scores.
export function questionLanguage(text: string): "Hindi" | "English" {
  return DEVANAGARI.test(text) ? "Hindi" : "English";
}

// A chunk's language: detected per chunk, falling back to its deck's medium for
// databases that haven't added per-chunk languages yet.
function languageOf(m: SaathiMatch): string | null {
  return m.language ?? (m.medium === "Bilingual" ? null : (m.medium ?? null));
}

function preferQuestionLanguage(matches: SaathiMatch[], query: string): SaathiMatch[] {
  const wanted = questionLanguage(query);
  return matches
    .map((m) => {
      const lang = languageOf(m);
      return { ...m, similarity: m.similarity + (lang === wanted || !lang ? LANGUAGE_BONUS : 0) };
    })
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

LANGUAGE: Reply in the same language and script as the student's latest message: Hindi in Devanagari gets Hindi in Devanagari, Hinglish (Hindi in Latin letters) gets Hinglish, English gets English. This applies even when the material is in another language: translate it faithfully. In Hindi or Hinglish answers, use the standard Hindi terms used in Indian competitive exams (for example मौलिक अधिकार, नीति निदेशक तत्व, संसद) and give the English term in brackets the first time each appears, e.g. मौलिक अधिकार (Fundamental Rights). Keep names, article numbers, dates and figures exactly as in the material.

${FORMAT_RULES[channel]}

Do not add source citations; the app shows the sources separately.

NEXT QUESTIONS: When you have answered (not when you used ${SAATHI_NO_ANSWER_MARKER}), end with one final line that starts with ${SAATHI_NEXT_MARKER} followed by 2 or 3 short follow-up questions the student could ask next, in the student's language, separated by " || ". Only suggest questions the study material can answer.`;
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

function parseNextQuestions(tail: string): string[] {
  return tail
    .split(/\|\||\n/)
    .map((q) =>
      q
        .trim()
        .replace(/^[-*•\d.)\s]+/, "")
        .replace(/^["'“]+|["'”]+$/g, "")
        .trim(),
    )
    .filter((q) => q.length >= 3 && q.length <= 200)
    .slice(0, 3);
}

// Cuts the follow-up questions line off the end of a (possibly streamed) answer.
// Text that might be the start of the marker is held back until it is clear.
export class NextQuestionsFilter {
  private pending = "";
  private tail: string | null = null;
  questions: string[] = [];

  push(delta: string): string {
    if (this.tail !== null) {
      this.tail += delta;
      return "";
    }
    this.pending += delta;
    const at = this.pending.indexOf(SAATHI_NEXT_MARKER);
    if (at >= 0) {
      const out = this.pending.slice(0, at).trimEnd();
      this.tail = this.pending.slice(at + SAATHI_NEXT_MARKER.length);
      this.pending = "";
      return out;
    }
    let hold = 0;
    for (let k = Math.min(this.pending.length, SAATHI_NEXT_MARKER.length - 1); k > 0; k--) {
      if (SAATHI_NEXT_MARKER.startsWith(this.pending.slice(-k))) {
        hold = k;
        break;
      }
    }
    const out = this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    return out;
  }

  finish(): string {
    if (this.tail !== null) {
      this.questions = parseNextQuestions(this.tail);
      return "";
    }
    const out = this.pending;
    this.pending = "";
    return out;
  }
}

export function splitNextQuestions(text: string): { text: string; next: string[] } {
  const f = new NextQuestionsFilter();
  const out = f.push(text) + f.finish();
  return { text: out.trimEnd(), next: f.questions };
}

// ---------- "Quiz me" ----------

export function saathiQuizMessages(question: string, matches: SaathiMatch[]): ChatMessage[] {
  const material = matches
    .map((m, i) => `[Material ${i + 1}] ${m.source_file || m.title}\n${m.content}`)
    .join("\n\n---\n\n");
  return [
    {
      role: "system",
      content: `You write practice multiple-choice questions for exam students, using ONLY facts stated in the study material. Write 3 questions about the topic of the student's question, in the same language and script as the student's question (use standard exam Hindi terms for Hindi). Each has exactly 4 options and one correct answer. Reply with JSON only: [{"question": string, "options": [string, string, string, string], "answer": index 0-3 of the correct option, "explanation": one short sentence}].`,
    },
    {
      role: "user",
      content: `Study material:\n\n${material}\n\n---\n\nStudent's question: ${question}`,
    },
  ];
}

export function parseQuiz(raw: string): SaathiQuizItem[] {
  const items = parseJsonLoose<unknown[]>(raw);
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const options = Array.isArray(o.options) ? o.options.map((x) => String(x).trim()) : [];
      const answer = Number(o.answer);
      return {
        question: String(o.question ?? "").trim(),
        options,
        answer,
        explanation: String(o.explanation ?? "").trim(),
      };
    })
    .filter(
      (q) =>
        q.question &&
        q.options.length === 4 &&
        q.options.every(Boolean) &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < 4,
    )
    .slice(0, 3);
}
