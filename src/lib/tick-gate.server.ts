// Server-only: the reads behind the tick's gate (rules in tick-gate.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { busyFrom, nextBusy, type TickPart } from "@/lib/tick-gate";

export { isFullTick, type TickPart } from "@/lib/tick-gate";

const MOMENTUM_KEY = "tick_busy";

type Db = (table: string) => ReturnType<typeof supabaseAdmin.from>;
const defaultDb: Db = (t) => supabaseAdmin.from(t as never);

// Does the query find a row? A query that fails counts as yes: the part
// runs, as it would have without this check.
async function any(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<boolean> {
  try {
    const { data, error } = await q;
    return !!error || ((data as unknown[] | null) ?? []).length > 0;
  } catch {
    return true;
  }
}

// The momentum parts kept by the last tick (null: unreadable).
export async function lastBusy(db: Db = defaultDb): Promise<string[] | null> {
  try {
    const { data, error } = await db("bot_settings")
      .select("value")
      .eq("key", MOMENTUM_KEY)
      .maybeSingle();
    if (error) return null;
    const v = (data as { value?: { parts?: unknown } } | null)?.value?.parts;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return null;
  }
}

// The parts with work now, and the list kept by the last tick.
export async function busyParts(
  approveKey: string,
  now = new Date(),
  db: Db = defaultDb,
): Promise<{ busy: Set<TickPart>; before: string[] | null }> {
  const at = now.toISOString();
  const free = `locked_until.is.null,locked_until.lt.${at}`;
  const due = (statuses: string) =>
    `status.in.(${statuses}),and(status.eq.scheduled,scheduled_for.lte.${at})`;
  // In the order of PROBED.
  const [before, ...found] = await Promise.all([
    lastBusy(db),
    // A Telegram "Approve" tap waiting.
    any(db("bot_settings").select("key").like("key", `${approveKey}%`).limit(1)),
    // A news collection running and not taken by another tick.
    any(db("ca_runs").select("id").eq("status", "running").or(free).limit(1)),
    // Words in the News: suggesting, writing, making images, or a post due.
    any(db("ig_days").select("day").or(due("suggesting,writing,rendering")).limit(1)),
    // GK infographics: the same.
    any(db("gk_days").select("day").or(due("planning,writing,rendering")).limit(1)),
    // Card studio server jobs waiting to be taken.
    any(db("flash_jobs").select("id").in("status", ["queued", "running"]).or(free).limit(1)),
    // Exam papers waiting in the upload queue.
    any(db("exam_paper_queue").select("id").in("status", ["waiting", "reading"]).or(free).limit(1)),
    // Clipped newspapers still being read or written up.
    any(
      db("ca_newspapers")
        .select("id")
        .not("work", "is", null)
        .neq("work->>state", "done")
        .or(free)
        .limit(1),
    ),
  ]);
  return { busy: busyFrom(found as boolean[], before), before };
}

// The momentum parts that did something this tick, kept for the next one
// (written only when the list changes).
export async function rememberBusy(
  before: string[] | null,
  did: Set<TickPart>,
  db: Db = defaultDb,
) {
  const parts = nextBusy(before, did);
  if (!parts) return;
  try {
    await db("bot_settings").upsert({
      key: MOMENTUM_KEY,
      value: { parts },
      updated_at: new Date().toISOString(),
    } as never);
  } catch {
    // Only an optimisation: the next full tick runs everything anyway.
  }
}
