import { z } from "zod";
import {
  NoAnswerFilter,
  SaathiAiError,
  cleanHistory,
  collectSources,
  relevantMatches,
  saathiCompleteStream,
  saathiEmbed,
  saathiMessages,
  saathiNoMaterialReply,
  saathiSearch,
  saathiStandaloneQuestion,
  type SaathiRpc,
  type SaathiStreamEvent,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  subjects: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(40)
    .default([]),
});

// Per-IP limits for the public endpoint, plus a site-wide ceiling as a backstop
// against credit drain from many IPs.
const LIMITS = [
  { scope: "ip", suffix: "min", windowSeconds: 60, maxHits: 8 },
  { scope: "ip", suffix: "day", windowSeconds: 86_400, maxHits: 150 },
  { scope: "global", suffix: "min", windowSeconds: 60, maxHits: 400 },
] as const;

const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);

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
  const standalone = await saathiStandaloneQuestion(apiKey, history, input.question);

  let matches;
  try {
    const embedding = await saathiEmbed(apiKey, standalone);
    matches = relevantMatches(await saathiSearch(rpc, standalone, embedding, input.subjects));
  } catch (e) {
    console.error("saathi search:", e);
    if (e instanceof SaathiAiError && (e.status === 429 || e.status === 402)) {
      return jsonError(e.message, 503);
    }
    return jsonError("SAATHI is having trouble right now. Please try again.", 502);
  }

  if (matches.length === 0) {
    await recordKnowledgeGap(standalone);
    return ndjson(async (emit) => {
      emit({ type: "delta", text: saathiNoMaterialReply(input.question) });
      emit({ type: "done", noAnswer: true, sources: [] });
    });
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

  return ndjson(async (emit) => {
    const filter = new NoAnswerFilter();
    let wrote = false;
    for await (const delta of deltas) {
      const text = filter.push(delta);
      if (text) {
        wrote = true;
        emit({ type: "delta", text });
      }
    }
    const tail = filter.finish();
    if (tail) {
      wrote = true;
      emit({ type: "delta", text: tail });
    }
    const noAnswer = filter.noAnswer || !wrote;
    if (!wrote) emit({ type: "delta", text: saathiNoMaterialReply(input.question) });
    if (noAnswer) await recordKnowledgeGap(standalone);
    emit({ type: "done", noAnswer, sources: noAnswer ? [] : collectSources(matches) });
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
