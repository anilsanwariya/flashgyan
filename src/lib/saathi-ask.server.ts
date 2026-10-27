import { z } from "zod";
import {
  NextQuestionsFilter,
  NoAnswerFilter,
  SaathiAiError,
  cleanHistory,
  collectSources,
  saathiCompleteStream,
  saathiMessages,
  saathiNoMaterialReply,
  saathiPrepareQuery,
  saathiRetrieve,
  type SaathiMatch,
  type SaathiQuery,
  type SaathiRpc,
  type SaathiSource,
  type SaathiStreamEvent,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  mainsInfo,
  mainsMessages,
  mainsNoMaterialReply,
  saathiMainsPlan,
  type MainsInfo,
  type MainsPlan,
} from "../../supabase/functions/_shared/saathi-mains.ts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as WN from "@/lib/flash-wordnet";

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(40)
    .default([]),
  // "mains" writes a descriptive exam answer for the given marks.
  mode: z.enum(["chat", "mains"]).default("chat"),
  marks: z.number().int().min(1).max(50).nullish(),
});

// Per-IP limits for the public endpoint, plus a site-wide ceiling as a backstop
// against credit drain from many IPs.
const LIMITS = [
  { scope: "ip", suffix: "min", windowSeconds: 60, maxHits: 8 },
  { scope: "ip", suffix: "day", windowSeconds: 86_400, maxHits: 150 },
  { scope: "global", suffix: "min", windowSeconds: 60, maxHits: 400 },
] as const;

export const saathiRpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);
const rpc = saathiRpc;

type CachedAnswer = {
  answer: string;
  sources: SaathiSource[];
  followups: string[];
  english_query: string | null;
  meta?: { mains?: MainsInfo; general?: boolean } | null;
};

// Cached answers are keyed by the standalone question and subjects, and are only
// served while the knowledge base is unchanged. Cache problems never block an answer.
async function cacheGet(
  channel: string,
  question: string,
  subjects: string[],
): Promise<CachedAnswer | null> {
  const { data, error } = await rpc("saathi_cache_get", {
    p_channel: channel,
    p_question: question,
    p_subjects: subjects,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("saathi cache get:", error.message);
    return null;
  }
  return ((data ?? []) as CachedAnswer[])[0] ?? null;
}

async function cachePut(
  channel: string,
  query: SaathiQuery,
  subjects: string[],
  value: Omit<CachedAnswer, "english_query">,
) {
  const { error } = await rpc("saathi_cache_put", {
    p_channel: channel,
    p_question: query.standalone,
    p_subjects: subjects,
    p_answer: value.answer,
    p_sources: value.sources,
    p_followups: value.followups,
    p_english_query: query.english,
    // Only sent when there is something to store, so databases without the
    // answer-writing migration keep working for chat answers.
    ...(value.meta ? { p_meta: value.meta } : {}),
  });
  if (error && error.code !== "PGRST202") console.error("saathi cache put:", error.message);
}

export function clientIp(request: Request): string | null {
  const h = request.headers;
  const ip =
    h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || null;
}

// Returns false when any limit is exceeded. Fails open if the limiter itself
// errors, so a database hiccup never locks students out.
export async function consumeSaathiRateLimit(request: Request, bucket = "ask"): Promise<boolean> {
  const ip = clientIp(request);
  for (const limit of LIMITS) {
    if (limit.scope === "ip" && !ip) continue;
    const key =
      limit.scope === "ip"
        ? `${bucket}:ip:${ip}:${limit.suffix}`
        : `${bucket}:global:${limit.suffix}`;
    const { data, error } = await supabaseAdmin.rpc(
      "saathi_consume_rate_limit" as never,
      {
        rl_key: key,
        window_seconds: limit.windowSeconds,
        max_hits: limit.maxHits,
      } as never,
    );
    if (error) {
      console.error("saathi rate limit:", error.message);
      return true;
    }
    if (data === false) return false;
  }
  return true;
}

export async function isSaathiLocked(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("home_settings")
    .select("lock_saathi")
    .eq("id", 1)
    .maybeSingle();
  return Boolean(data?.lock_saathi);
}

// Whether SAATHI may use Hindi WordNet (off unless switched on in the
// card studio; off too before its migration).
export async function saathiUsesWordnet(): Promise<boolean> {
  const { data } = await supabaseAdmin.from("home_settings").select("*").eq("id", 1).maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.saathi_wordnet);
}

// A word question (पर्यायवाची, विलोम, अर्थ) with WordNet switched on: the
// words' Hindi WordNet meanings as one more passage (credited as a source).
// Never blocks an answer.
async function wordnetMatch(question: string): Promise<SaathiMatch | null> {
  try {
    if (!WN.wordQuestion(question) || !(await saathiUsesWordnet())) return null;
    const words = WN.wordQuestionWords(question, [], 6);
    if (!words.length) return null;
    const { wordnetSenses } = await import("@/lib/flash-studio.server");
    const content = WN.wnPassage(await wordnetSenses(words));
    if (!content) return null;
    return {
      id: "hindi-wordnet",
      title: WN.WN_CREDIT,
      subject: "हिन्दी",
      topic: "शब्दकोश",
      language: "Hindi",
      content,
      source_file: null,
      source: "CFILT, IIT Bombay",
      vector_score: 1,
      keyword_score: 0,
      similarity: 1,
    };
  } catch (e) {
    console.error("saathi wordnet:", e);
    return null;
  }
}

async function recordKnowledgeGap(question: string) {
  const { error } = await supabaseAdmin.rpc("increment_knowledge_gap", { gap_question: question });
  if (error) console.error("saathi knowledge gap:", error.message);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function handleSaathiAsk(request: Request): Promise<Response> {
  let input: z.infer<typeof askSchema>;
  try {
    input = askSchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const [locked, allowed] = await Promise.all([isSaathiLocked(), consumeSaathiRateLimit(request)]);
  if (locked) return jsonError("SAATHI is coming soon!", 403);
  if (!allowed) {
    return jsonError("You're asking too fast. Please wait a minute and try again.", 429);
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return jsonError("SAATHI is not configured.", 500);

  const history = cleanHistory(input.history);
  const subjects = [...input.subjects].sort();
  if (input.mode === "mains") return handleMains(request, apiKey, input, history, subjects);

  let query: SaathiQuery;
  let matches;
  try {
    query = await saathiPrepareQuery(apiKey, history, input.question);
    const cached = await cacheGet("web", query.standalone, subjects);
    if (cached) {
      const hit = cached;
      const q = query;
      return ndjson(async (emit) => {
        emit({ type: "delta", text: hit.answer });
        emit({
          type: "done",
          noAnswer: false,
          general: !!hit.meta?.general,
          sources: hit.sources,
          followups: hit.followups,
          searchQuery: q.standalone,
          englishQuery: q.english,
        });
      });
    }
    ({ matches } = await saathiRetrieve({
      apiKey,
      rpc,
      history,
      question: input.question,
      subjects,
      query,
    }));
    const wn = await wordnetMatch(input.question);
    if (wn) matches = [...matches, wn];
  } catch (e) {
    console.error("saathi search:", e);
    if (e instanceof SaathiAiError && (e.status === 429 || e.status === 402)) {
      return jsonError(e.message, 503);
    }
    return jsonError("SAATHI is having trouble right now. Please try again.", 502);
  }

  let deltas: AsyncGenerator<string>;
  try {
    deltas = await saathiCompleteStream(
      apiKey,
      saathiMessages({ channel: "web", history, question: input.question, matches }),
      request.signal,
    );
  } catch (e) {
    console.error("saathi chat:", e);
    if (e instanceof SaathiAiError && (e.status === 429 || e.status === 402)) {
      return jsonError(e.message, 503);
    }
    return jsonError("SAATHI is having trouble right now. Please try again.", 502);
  }

  const used = matches;
  // Not cached with WordNet in it, so switching it off takes effect at once.
  const withWordnet = matches.some((m) => m.id === "hindi-wordnet");
  const q = query;
  return ndjson(async (emit) => {
    const noAnswerFilter = new NoAnswerFilter();
    const nextFilter = new NextQuestionsFilter();
    let answer = "";
    const write = (text: string) => {
      if (!text) return;
      answer += text;
      emit({ type: "delta", text });
    };
    for await (const delta of deltas) write(nextFilter.push(noAnswerFilter.push(delta)));
    write(nextFilter.push(noAnswerFilter.finish()));
    write(nextFilter.finish());

    const noAnswer = !answer.trim();
    // Not in the books: answered from SAATHI's own knowledge, and a gap to fill.
    const general = noAnswerFilter.noAnswer || used.length === 0;
    if (noAnswer) emit({ type: "delta", text: saathiNoMaterialReply(input.question) });
    if (noAnswer || general) await recordKnowledgeGap(q.standalone);
    const sources = noAnswer || general ? [] : collectSources(used);
    const followups = noAnswer ? [] : nextFilter.questions;
    if (!noAnswer && !withWordnet && !request.signal.aborted) {
      await cachePut("web", q, subjects, {
        answer: answer.trimEnd(),
        sources,
        followups,
        meta: general ? { general } : null,
      });
    }
    emit({
      type: "done",
      noAnswer,
      general: !noAnswer && general,
      sources,
      followups,
      searchQuery: q.standalone,
      englishQuery: q.english,
    });
  });
}

// Descriptive (RAS Mains) answers: the same search with more material, plus the
// blueprint and example answers for the question's marks and type.
async function handleMains(
  request: Request,
  apiKey: string,
  input: z.infer<typeof askSchema>,
  history: ReturnType<typeof cleanHistory>,
  subjects: string[],
): Promise<Response> {
  let plan: MainsPlan;
  let channel: string;
  try {
    const query = await saathiPrepareQuery(apiKey, history, input.question);
    // Marks are part of the cache key: the same question at 5 and 10 marks
    // needs different answers.
    const requested = input.marks ?? null;
    channel = `web:mains:${requested ?? "auto"}`;
    const cached = await cacheGet(channel, query.standalone, subjects);
    if (cached) {
      const hit = cached;
      return ndjson(async (emit) => {
        emit({ type: "delta", text: hit.answer });
        emit({
          type: "done",
          noAnswer: false,
          general: !!hit.meta?.general,
          sources: hit.sources,
          followups: [],
          searchQuery: query.standalone,
          englishQuery: query.english,
          mains: hit.meta?.mains,
        });
      });
    }
    plan = await saathiMainsPlan({
      apiKey,
      rpc,
      history,
      question: input.question,
      subjects,
      marks: requested,
      query,
    });
  } catch (e) {
    console.error("saathi mains plan:", e);
    if (e instanceof SaathiAiError && (e.status === 429 || e.status === 402)) {
      return jsonError(e.message, 503);
    }
    return jsonError("SAATHI is having trouble right now. Please try again.", 502);
  }

  let deltas: AsyncGenerator<string>;
  try {
    deltas = await saathiCompleteStream(
      apiKey,
      mainsMessages({ channel: "web", history, question: input.question, plan }),
      request.signal,
    );
  } catch (e) {
    console.error("saathi mains chat:", e);
    if (e instanceof SaathiAiError && (e.status === 429 || e.status === 402)) {
      return jsonError(e.message, 503);
    }
    return jsonError("SAATHI is having trouble right now. Please try again.", 502);
  }

  const p = plan;
  const cacheChannel = channel;
  return ndjson(async (emit) => {
    const noAnswerFilter = new NoAnswerFilter();
    let answer = "";
    const write = (text: string) => {
      if (!text) return;
      answer += text;
      emit({ type: "delta", text });
    };
    for await (const delta of deltas) write(noAnswerFilter.push(delta));
    write(noAnswerFilter.finish());

    const noAnswer = !answer.trim();
    const general = noAnswerFilter.noAnswer || p.matches.length === 0;
    if (noAnswer) emit({ type: "delta", text: mainsNoMaterialReply(input.question) });
    if (noAnswer || general) await recordKnowledgeGap(p.query.standalone);
    const sources = noAnswer || general ? [] : collectSources(p.matches);
    const info = mainsInfo(p, noAnswer ? undefined : answer);
    if (!noAnswer && !request.signal.aborted) {
      await cachePut(cacheChannel, p.query, subjects, {
        answer: answer.trimEnd(),
        sources,
        followups: [],
        meta: { mains: info, ...(general ? { general } : {}) },
      });
    }
    emit({
      type: "done",
      noAnswer,
      general: !noAnswer && general,
      sources,
      followups: [],
      searchQuery: p.query.standalone,
      englishQuery: p.query.english,
      mains: info,
    });
  });
}

function ndjson(run: (emit: (event: SaathiStreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SaathiStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await run(emit);
      } catch (e) {
        console.error("saathi stream:", e);
        try {
          emit({ type: "error", message: "SAATHI stopped unexpectedly. Please try again." });
        } catch {
          // client already gone
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
