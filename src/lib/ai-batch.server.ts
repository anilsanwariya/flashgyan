// Server-only: running an existing AI step through a Message Batch.
//
// A step that calls the AI once (check these cards, read this page) is run
// twice. First with captureCall: it builds its request as it always does,
// and the call is caught instead of sent, so its messages go into a batch.
// When the batch has ended, the step runs again with replayReply: it builds
// its request again and gets the batch's reply instead of calling the AI.
// The reply is used only if the request's last user message (the cards or
// page it is about) is the same as was sent; otherwise (the cards were
// edited meanwhile) StaleReply is thrown and the step is sent again later.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  saathiComplete,
  type ChatMessage,
  type SaathiImage,
  type SaathiOptions,
} from "../../supabase/functions/_shared/saathi-core.ts";

export type Completer = (messages: ChatMessage[], images?: SaathiImage[]) => Promise<string>;

export class CapturedCall extends Error {
  constructor(
    public messages: ChatMessage[],
    public images?: SaathiImage[],
  ) {
    super("captured for a batch");
  }
}
export class StaleReply extends Error {
  constructor() {
    super("what was asked has changed since it was sent");
  }
}

// The AI called now (the usual way).
export const liveCall =
  (opts: SaathiOptions = {}): Completer =>
  (messages, images) =>
    saathiComplete("", messages, undefined, images, opts);

export const captureCall: Completer = async (messages, images) => {
  throw new CapturedCall(messages, images);
};

// What a reply is about: the request's last user message.
export function fingerprint(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return createHash("sha256").update(last).digest("hex");
}

export const replayReply =
  (text: string, fp: string): Completer =>
  async (messages) => {
    if (fingerprint(messages) !== fp) throw new StaleReply();
    return text;
  };

// ---------- A job's batch waiting for its replies (bot_settings) ----------

const from = (t: string) => supabaseAdmin.from(t as never);

export async function pendingBatch<T>(key: string): Promise<T | null> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as { value?: unknown } | null)?.value as T) ?? null;
}
export async function savePendingBatch(key: string, value: unknown) {
  const { error } = await from("bot_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(error.message);
}
export async function clearPendingBatch(key: string) {
  const { error } = await from("bot_settings").delete().eq("key", key);
  if (error) throw new Error(error.message);
}

// ---------- Batches on or off, per background job (ai_jobs) ----------

export type BatchJob = "studio_jobs" | "exam_read";
export const BATCH_JOBS: Record<BatchJob, string> = {
  studio_jobs: "Card studio jobs on the server (AI check, fill explanations)",
  exam_read: "Exam papers read from the upload queue (objective papers)",
};
const AI_JOBS_KEY = "ai_jobs";

async function aiJobs(): Promise<Record<string, unknown>> {
  return (await pendingBatch<Record<string, unknown>>(AI_JOBS_KEY)) ?? {};
}
export async function batchOn(job: BatchJob): Promise<boolean> {
  const v = (await aiJobs())[job] as { batch?: boolean } | undefined;
  return v?.batch !== false;
}
export async function batchSettings(): Promise<Record<BatchJob, boolean>> {
  const all = await aiJobs();
  return Object.fromEntries(
    (Object.keys(BATCH_JOBS) as BatchJob[]).map((j) => [
      j,
      (all[j] as { batch?: boolean } | undefined)?.batch !== false,
    ]),
  ) as Record<BatchJob, boolean>;
}
export async function setBatchOn(job: BatchJob, on: boolean) {
  const all = await aiJobs();
  await savePendingBatch(AI_JOBS_KEY, {
    ...all,
    [job]: { ...((all[job] as object) ?? {}), batch: on },
  });
}
