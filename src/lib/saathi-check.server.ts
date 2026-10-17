import { z } from "zod";
import {
  CHECK_DAILY_LIMIT,
  CHECK_MAX_PHOTOS,
  checkAnswer,
  checkCounterKey,
  lengthNote,
  type CheckResult,
} from "../../supabase/functions/_shared/saathi-check.ts";
import { SaathiAiError } from "../../supabase/functions/_shared/saathi-core.ts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  clientIp,
  consumeSaathiRateLimit,
  isSaathiLocked,
  saathiRpc,
} from "@/lib/saathi-ask.server";

// Progress and result of a check, as newline-delimited JSON. A check takes up to
// a minute or two, so the stream also carries pings to keep the connection open.
export type CheckStreamEvent =
  | { type: "stage"; stage: "reading" | "checking" }
  | { type: "ping" }
  | {
      type: "done";
      result: CheckResult;
      transcript: string | null;
      // Word count against the limit, as a sentence in the answer's language.
      length: string;
      left: number;
    }
  | {
      type: "error";
      message: string;
      reason?: "unreadable" | "too_short" | "failed";
      transcript?: string | null;
    };

const checkSchema = z.object({
  question: z.string().trim().min(5).max(2000),
  marks: z.number().int().min(1).max(50).nullish(),
  answer: z.string().max(12_000).default(""),
  images: z
    .array(
      z.object({
        media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
        // Base64; Claude reads images up to 5 MB.
        data: z
          .string()
          .min(100)
          .max(6_500_000)
          .regex(/^[A-Za-z0-9+/]+=*$/),
      }),
    )
    .max(CHECK_MAX_PHOTOS)
    .default([]),
  // Telegram mini app: the student's checks count with the bot's /check.
  initData: z.string().max(4096).optional(),
});

// Telegram users are counted by their Telegram id, shared with the bot (where
// the private chat id is the user id); everyone else by IP.
async function checker(request: Request, initData?: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (initData && token) {
    const { verifyInitData } = await import("@/lib/telegram-init-data.server");
    const verified = verifyInitData(initData, token);
    try {
      const id = verified?.user ? (JSON.parse(verified.user) as { id?: number }).id : null;
      if (id) return `tg:${id}`;
    } catch {
      // fall back to IP
    }
  }
  return `ip:${clientIp(request) ?? "unknown"}`;
}

async function checksUsed(key: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("saathi_rate_limits")
    .select("hits")
    .eq("key", key)
    .maybeSingle();
  if (error) console.error("saathi check count:", error.message);
  return (data as { hits?: number } | null)?.hits ?? 0;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function handleSaathiCheck(request: Request): Promise<Response> {
  let input: z.infer<typeof checkSchema>;
  try {
    input = checkSchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request.", 400);
  }
  if (!input.answer.trim() && input.images.length === 0) {
    return jsonError("Type your answer or add photos of it.", 400);
  }

  const [locked, allowed] = await Promise.all([
    isSaathiLocked(),
    consumeSaathiRateLimit(request, "check-req"),
  ]);
  if (locked) return jsonError("SAATHI is coming soon!", 403);
  if (!allowed) return jsonError("Too many requests. Please wait a minute and try again.", 429);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return jsonError("SAATHI is not configured.", 500);

  const key = checkCounterKey(await checker(request, input.initData));
  const used = await checksUsed(key);
  if (used >= CHECK_DAILY_LIMIT) {
    return jsonError(
      `You've used today's ${CHECK_DAILY_LIMIT} answer checks. Come back tomorrow!`,
      429,
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: CheckStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // client gone
        }
      };
      const ping = setInterval(() => emit({ type: "ping" }), 15_000);
      try {
        const outcome = await checkAnswer({
          apiKey,
          rpc: saathiRpc,
          question: input.question,
          marks: input.marks ?? null,
          answer: input.answer,
          images: input.images,
          signal: request.signal,
          onStage: (stage) => emit({ type: "stage", stage }),
        });
        if (!outcome.ok) {
          emit({
            type: "error",
            reason: outcome.reason,
            transcript: outcome.transcript,
            message: {
              unreadable:
                "We couldn't read the photos. Use clear, well-lit photos, one page each, taken from above.",
              too_short: "Your answer is too short to check. Write at least a few sentences.",
              failed: "SAATHI couldn't check your answer this time. Please try again.",
            }[outcome.reason],
          });
          return;
        }
        // Only a finished check counts towards the day's allowance.
        const { error } = await supabaseAdmin.rpc(
          "saathi_consume_rate_limit" as never,
          { rl_key: key, window_seconds: 172_800, max_hits: CHECK_DAILY_LIMIT } as never,
        );
        if (error) console.error("saathi check count:", error.message);
        const r = outcome.result;
        emit({
          type: "done",
          result: r,
          transcript: outcome.transcript,
          length: lengthNote(r.words, r.wordLimit, r.language === "Hindi"),
          left: Math.max(0, CHECK_DAILY_LIMIT - used - 1),
        });
      } catch (e) {
        console.error("saathi check:", e);
        emit({
          type: "error",
          message:
            e instanceof SaathiAiError && (e.status === 429 || e.status === 402)
              ? e.message
              : "SAATHI is having trouble right now. Please try again.",
        });
      } finally {
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
