// Server-only: how the students' atlas is used, counted by day with no
// student identified (the atlas_usage table): places and districts
// opened, map quiz answers by district, daily challenges played and
// searches that found nothing; read back for the editor's Usage tab with
// the students' reports. Before the migration nothing is counted and the
// atlas works as before.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { atlasPublicPlaces } from "@/lib/atlas.server";

const from = (table: string) => supabaseAdmin.from(table as never);
type Row = Record<string, unknown>;
export const USAGE_NOT_READY = "Usage needs the migration 20261218090000_atlas_usage.sql.";
const missing = (e: { message: string } | null) =>
  !!e && /atlas_usage|schema cache|does not exist|function/i.test(e.message);

export type UsageKind =
  | "place"
  | "district"
  | "quiz_right"
  | "quiz_wrong"
  | "daily"
  | "search_miss";
export type DayCount = {
  day: string;
  place?: number;
  district?: number;
  quiz?: number;
  daily?: number;
  search_miss?: number;
};
export type UsageRow = { kind: UsageKind; ref: string; n?: number };

// Counts added (never failing the student's page).
export async function bumpUsage(rows: UsageRow[]) {
  if (!rows.length) return;
  try {
    await supabaseAdmin.rpc("atlas_usage_bump" as never, { p_rows: rows.slice(0, 60) } as never);
  } catch {
    // Not counted.
  }
}

// A student's own events (quiz answers, the daily challenge, a search
// that found nothing), limited per address and in all.
export async function studentUsage(rows: UsageRow[], ip: string | null) {
  for (const [key, win, max] of [
    ip ? [`atlas-usage:ip:${ip}:h`, 3600, 120] : null,
    ["atlas-usage:global:d", 86400, 50_000],
  ].filter(Boolean) as [string, number, number][]) {
    const { data, error } = await supabaseAdmin.rpc(
      "saathi_consume_rate_limit" as never,
      { rl_key: key, window_seconds: win, max_hits: max } as never,
    );
    if (!error && data === false) return { ok: false };
  }
  await bumpUsage(
    rows
      .filter((r) => ["quiz_right", "quiz_wrong", "daily", "search_miss"].includes(r.kind))
      .map((r) => ({
        kind: r.kind,
        ref: r.kind === "search_miss" ? r.ref.toLowerCase().trim().slice(0, 60) : r.ref,
        n: r.n,
      })),
  );
  return { ok: true };
}

const since = (days: number) =>
  new Date(Date.now() + 5.5 * 3600_000 - (days - 1) * 86_400_000).toISOString().slice(0, 10);

// The editor's view of the last `days` days.
export async function usageView(days: number) {
  const rows: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("atlas_usage")
      .select("day,kind,ref,n")
      .gte("day", since(days))
      .order("day")
      .range(at, at + 999);
    if (missing(error)) return { ready: false as const };
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  const sum = (kind: UsageKind) => {
    const m = new Map<string, number>();
    for (const r of rows)
      if (r.kind === kind) m.set(String(r.ref), (m.get(String(r.ref)) ?? 0) + Number(r.n));
    return m;
  };
  const top = (m: Map<string, number>, n = 20) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  const places = new Map((await atlasPublicPlaces()).map((p) => [p[0], p]));
  const right = sum("quiz_right");
  const wrong = sum("quiz_wrong");
  const quiz = [...new Set([...right.keys(), ...wrong.keys()])]
    .map((d) => {
      const r = right.get(d) ?? 0;
      const w = wrong.get(d) ?? 0;
      return { district: d, answers: r + w, wrongPct: Math.round((w / Math.max(1, r + w)) * 100) };
    })
    .filter((x) => x.answers >= 5)
    .sort((a, b) => b.wrongPct - a.wrongPct || b.answers - a.answers)
    .slice(0, 15);
  const perDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const d = perDay.get(String(r.day)) ?? {};
    const k = String(r.kind).startsWith("quiz") ? "quiz" : String(r.kind);
    d[k] = (d[k] ?? 0) + Number(r.n);
    perDay.set(String(r.day), d);
  }
  // The students' reports, by place or district (all time, open first).
  const { data: reps } = await from("atlas_reports").select("kind,ref,label,status");
  const reportMap = new Map<string, { label: string; open: number; all: number }>();
  for (const r of (reps ?? []) as Row[]) {
    if (r.kind === "fact") continue;
    const k = `${r.kind}:${r.ref}`;
    const x = reportMap.get(k) ?? { label: String(r.label ?? r.ref), open: 0, all: 0 };
    x.all++;
    if (r.status === "open") x.open++;
    reportMap.set(k, x);
  }
  return {
    ready: true as const,
    days,
    places: top(sum("place")).map(([key, n]) => ({
      key,
      n,
      name: places.get(key)?.[1] ?? key,
      district: places.get(key)?.[6] ?? "",
    })),
    districts: top(sum("district")).map(([district, n]) => ({ district, n })),
    quiz,
    searches: top(sum("search_miss"), 25).map(([q, n]) => ({ q, n })),
    byDay: [...perDay]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, c]): DayCount => ({ day, ...c })),
    reports: [...reportMap]
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.open - a.open || b.all - a.all)
      .slice(0, 15),
  };
}
