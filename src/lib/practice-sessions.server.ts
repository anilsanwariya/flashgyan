// Server-only: counting finished practice sessions (the north-star number)
// in practice_sessions_daily, and reading them back for the admin page.
// Before the migration nothing is counted and the study pages work as before.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SESSION_KINDS, type SessionDay, type SessionKind } from "@/lib/practice-sessions";

export const SESSIONS_MIGRATION = "20261225090000_practice_sessions.sql";
const missing = (e: { message: string } | null) =>
  !!e &&
  /practice_sessions_daily|practice_session_count|schema cache|does not exist/i.test(e.message);

// One finished session, limited per address and in all so the number can't
// be inflated by scripting the public endpoint.
export async function recordSession(kind: SessionKind, ip: string | null) {
  for (const [key, win, max] of [
    ip ? [`practice-sessions:ip:${ip}:h`, 3600, 60] : null,
    ["practice-sessions:global:d", 86400, 200_000],
  ].filter(Boolean) as [string, number, number][]) {
    const { data, error } = await supabaseAdmin.rpc(
      "saathi_consume_rate_limit" as never,
      { rl_key: key, window_seconds: win, max_hits: max } as never,
    );
    if (!error && data === false) return { ok: false };
  }
  try {
    await supabaseAdmin.rpc("practice_session_count" as never, { p_kind: kind } as never);
  } catch {
    // Not counted.
  }
  return { ok: true };
}

// India's date, `back` days ago.
function indiaDay(back: number) {
  return new Date(Date.now() + 5.5 * 3600_000 - back * 86_400_000).toISOString().slice(0, 10);
}

// The last `days` days, newest first, with zero for days without sessions.
export async function sessionsView(
  days: number,
): Promise<{ ready: false } | { ready: true; days: SessionDay[] }> {
  const { data, error } = await supabaseAdmin
    .from("practice_sessions_daily" as never)
    .select("day,kind,n")
    .gte("day", indiaDay(days - 1));
  if (missing(error)) return { ready: false };
  if (error) throw new Error(error.message);

  const byDay = new Map<string, SessionDay>();
  for (let back = 0; back < days; back++) {
    const day = indiaDay(back);
    byDay.set(day, { day, flashcards: 0, mcq_practice: 0, mcq_test: 0 });
  }
  for (const row of (data ?? []) as { day: string; kind: string; n: number }[]) {
    const entry = byDay.get(row.day);
    if (entry && (SESSION_KINDS as readonly string[]).includes(row.kind)) {
      entry[row.kind as SessionKind] += row.n;
    }
  }
  return { ready: true, days: [...byDay.values()] };
}
