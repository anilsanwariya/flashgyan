// Server-only: the magazine's editorial team. Each AI step is a team member
// with a notebook of lessons learnt from the editor (the Editor-in-chief's
// picking rules, the Writer's house style), new lessons suggested each
// Sunday for the editor to keep or drop, every notebook change kept so it
// can be undone, and a weekly scorecard of how often the editor agreed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { istDate } from "@/lib/current-affairs";
import { pickChanges } from "@/lib/ca-picks";

type Row = Record<string, unknown>;
const from = (t: string) => supabaseAdmin.from(t as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export type TeamMember = "chief" | "writer";
const HISTORY_MAX = 20;
const historyKey = (m: TeamMember) => `ca_team_history:${m}`;

export type NotebookVersion = { at: string; rules: string[] };

export async function notebookHistory(m: TeamMember): Promise<NotebookVersion[]> {
  const { data, error } = await from("bot_settings")
    .select("value")
    .eq("key", historyKey(m))
    .maybeSingle();
  fail(error);
  const v = (data as { value?: { versions?: NotebookVersion[] } } | null)?.value?.versions;
  return Array.isArray(v) ? v : [];
}

// The notebook as it was before a change, kept (newest first) so the change
// can be undone. Called by the saves of the picking rules and house style.
export async function rememberNotebook(m: TeamMember, before: string[], after: string[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  try {
    const versions = [
      { at: new Date().toISOString(), rules: before },
      ...(await notebookHistory(m)),
    ];
    await from("bot_settings").upsert(
      {
        key: historyKey(m),
        value: { versions: versions.slice(0, HISTORY_MAX) },
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" },
    );
  } catch (e) {
    // The change stands; only its undo is lost.
    console.error("team notebook history:", e);
  }
}

// ---------- Scorecards ----------

export type WeekScore = {
  // The week's Monday.
  week: string;
  // How many of the member's decisions or stories the editor saw.
  total: number;
  // How many the editor left as they were.
  agreed: number;
};

const mondayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// The last weeks' stories (before today, whose decisions are settled).
async function recentRows(columns: string, weeks: number): Promise<Row[]> {
  const since = mondayOf(istDate(new Date(Date.now() - (weeks * 7 - 1) * 86_400_000)));
  const today = istDate();
  const rows: Row[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("ca_items")
      .select(columns)
      .gte("issue_date", since)
      .lt("issue_date", today)
      .order("issue_date")
      .order("id")
      .range(at, at + 999);
    fail(error);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

const byWeek = (rows: Row[]) => {
  const out = new Map<string, Row[]>();
  for (const r of rows) {
    const w = mondayOf(String(r.issue_date));
    out.set(w, [...(out.get(w) ?? []), r]);
  }
  return out;
};

// The Editor-in-chief: stories whose pick (in or out, importance, section)
// the editor left as the AI made it.
async function chiefScores(weeks: number): Promise<WeekScore[]> {
  const rows = (
    await recentRows(
      "issue_date,headline,story_type,category,importance,status,rajasthan,facts,ai_pick",
      weeks,
    )
  ).filter((r) => r.ai_pick);
  return [...byWeek(rows)].map(([week, list]) => {
    const { changes, counts } = pickChanges(list as never);
    const changed = new Set(changes.map((c) => `${c.date}|${c.headline}`));
    return { week, total: counts.stories, agreed: counts.stories - changed.size };
  });
}

// The Writer: written stories the editor didn't edit afterwards.
async function writerScores(weeks: number): Promise<WeekScore[]> {
  const rows = (await recentRows("id,issue_date,status,content", weeks)).filter(
    (r) => r.status === "included" && r.content,
  );
  const ids = rows.map((r) => String(r.id));
  const edited = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await from("ca_item_versions")
      .select("item_id")
      .in("item_id", ids.slice(i, i + 300))
      .eq("reason", "edit");
    fail(error);
    for (const v of (data ?? []) as Row[]) edited.add(String(v.item_id));
  }
  return [...byWeek(rows)].map(([week, list]) => ({
    week,
    total: list.length,
    agreed: list.filter((r) => !edited.has(String(r.id))).length,
  }));
}

export type TeamOverview = Record<TeamMember, { scores: WeekScore[]; history: NotebookVersion[] }>;

export async function teamOverview(weeks = 6): Promise<TeamOverview> {
  const [chief, writer, chiefHistory, writerHistory] = await Promise.all([
    chiefScores(weeks).catch(() => []),
    writerScores(weeks).catch(() => []),
    notebookHistory("chief"),
    notebookHistory("writer"),
  ]);
  const sort = (s: WeekScore[]) => s.sort((a, b) => a.week.localeCompare(b.week));
  return {
    chief: { scores: sort(chief), history: chiefHistory },
    writer: { scores: sort(writer), history: writerHistory },
  };
}

// A notebook put back as it was (the current one kept in the history too).
export async function restoreNotebook(m: TeamMember, at: string): Promise<string[]> {
  const version = (await notebookHistory(m)).find((v) => v.at === at);
  if (!version) throw new Error("That version is no longer kept.");
  if (m === "chief") {
    const picks = await import("@/lib/ca-picks.server");
    return picks.savePickRules(version.rules);
  }
  const CA = await import("@/lib/current-affairs.server");
  return CA.saveStyleRules(version.rules);
}
