// Server-only: the magazine's editorial team. Each AI step is a team member
// with a notebook of lessons learnt from the editor (the Editor-in-chief's
// picking rules, the Writer's house style), new lessons suggested each
// Sunday for the editor to keep or drop, every notebook change kept so it
// can be undone, and a weekly scorecard of how often the editor agreed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { istDate } from "@/lib/current-affairs";
import { pickChanges } from "@/lib/ca-picks";
import {
  NOTEBOOK_MAX,
  notebookSuggestMessages,
  parseLessons,
  type NotebookMember,
} from "@/lib/ca-team";

type Row = Record<string, unknown>;
const from = (t: string) => supabaseAdmin.from(t as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export type TeamMember = "chief" | "writer" | NotebookMember;
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
      "issue_date,headline,story_type,category,importance,status,rajasthan,facts,ai_pick,format",
      weeks,
    ).catch(() =>
      recentRows(
        "issue_date,headline,story_type,category,importance,status,rajasthan,facts,ai_pick",
        weeks,
      ),
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

export type TeamOverview = Record<
  TeamMember,
  { scores: WeekScore[]; history: NotebookVersion[]; notebook?: Notebook }
>;

export async function teamOverview(weeks = 6): Promise<TeamOverview> {
  const sort = (s: WeekScore[]) => s.sort((a, b) => a.week.localeCompare(b.week));
  const member = async (m: NotebookMember) => ({
    scores: await notebookScores(m, weeks).catch(() => []),
    history: await notebookHistory(m),
    notebook: await notebook(m),
  });
  const [chief, writer, chiefHistory, writerHistory, proofreader, updater] = await Promise.all([
    chiefScores(weeks).catch(() => []),
    writerScores(weeks).catch(() => []),
    notebookHistory("chief"),
    notebookHistory("writer"),
    member("proofreader"),
    member("updater"),
  ]);
  return {
    chief: { scores: sort(chief), history: chiefHistory },
    writer: { scores: sort(writer), history: writerHistory },
    proofreader,
    updater,
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
  if (m === "proofreader" || m === "updater") return (await saveLessons(m, version.rules)).rules;
  const CA = await import("@/lib/current-affairs.server");
  return CA.saveStyleRules(version.rules);
}

// ---------- The Proofreader's and the Updater's notebooks ----------

const notebookKey = (m: NotebookMember) => `ca_team_notebook:${m}`;

export type Notebook = {
  rules: string[];
  // The lessons suggested on Sunday, waiting to be kept or dropped.
  suggestions: { at: string; decisions: number; rules: string[] } | null;
};

export async function notebook(m: NotebookMember): Promise<Notebook> {
  const { data, error } = await from("bot_settings")
    .select("value")
    .eq("key", notebookKey(m))
    .maybeSingle();
  fail(error);
  const v = (data as { value?: Partial<Notebook> } | null)?.value ?? {};
  return {
    rules: Array.isArray(v.rules) ? v.rules.filter((r) => typeof r === "string") : [],
    suggestions: v.suggestions ?? null,
  };
}

async function writeNotebook(m: NotebookMember, nb: Notebook) {
  fail(
    (
      await from("bot_settings").upsert(
        { key: notebookKey(m), value: nb, updated_at: new Date().toISOString() } as never,
        { onConflict: "key" },
      )
    ).error,
  );
}

const cleanRules = (rules: string[]) => {
  const seen = new Set<string>();
  return rules
    .map((r) => r.replace(/\s+/g, " ").trim().slice(0, 240))
    .filter((r) => {
      const k = r.toLowerCase();
      if (r.length < 3 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, NOTEBOOK_MAX);
};

// The notebook's lessons saved (the version before kept, to undo).
export async function saveLessons(m: NotebookMember, rules: string[]): Promise<Notebook> {
  const nb = await notebook(m);
  const next = { ...nb, rules: cleanRules(rules) };
  await writeNotebook(m, next);
  await rememberNotebook(m, nb.rules, next.rules);
  return next;
}

// A suggested lesson kept (into the notebook) or dropped.
export async function decideSuggestion(
  m: NotebookMember,
  rule: string,
  keep: boolean,
): Promise<Notebook> {
  const nb = await notebook(m);
  const left = (nb.suggestions?.rules ?? []).filter((r) => r !== rule);
  const suggestions = nb.suggestions && left.length ? { ...nb.suggestions, rules: left } : null;
  if (keep) {
    const rules = cleanRules([...nb.rules, rule]);
    await writeNotebook(m, { rules, suggestions });
    await rememberNotebook(m, nb.rules, rules);
    return { rules, suggestions };
  }
  await writeNotebook(m, { ...nb, suggestions });
  return { ...nb, suggestions };
}

const EVIDENCE_DAYS = 28;
const sinceDate = () => istDate(new Date(Date.now() - EVIDENCE_DAYS * 86_400_000));

type StyleBreakRow = { id: string; rule: string; text?: string; fix: string; lang?: string };
type LangNoteRow = { id: string; kind: string; issue: string; en: string; hi: string };

// The last weeks' house style and Hindi–English checks: the notes the editor
// waved through (false alarms) and, per day, how many it fixed.
async function proofDecisions(): Promise<{
  evidence: string[];
  days: { date: string; fixed: number; waved: number }[];
}> {
  const since = sinceDate();
  const { data, error } = await from("bot_settings")
    .select("key,value")
    .or("key.like.ca_style_check:%,key.like.ca_lang_check:%");
  fail(error);
  const evidence: string[] = [];
  const days = new Map<string, { fixed: number; waved: number }>();
  for (const r of (data ?? []) as Row[]) {
    const key = String(r.key);
    const date = key.slice(key.indexOf(":") + 1);
    if (date < since) continue;
    const v = (r.value ?? {}) as Row;
    const dismissed = new Set((v.dismissed as string[] | undefined) ?? []);
    const day = days.get(date) ?? { fixed: 0, waved: 0 };
    if (key.startsWith("ca_style_check:")) {
      for (const b of (v.breaks as StyleBreakRow[] | undefined) ?? [])
        if (dismissed.has(b.id))
          evidence.push(
            `False alarm (house style "${b.rule}"): flagged "${(b.text ?? "").slice(0, 120)}", suggested "${b.fix.slice(0, 120)}"; the editor kept the original.`,
          );
      for (const t of Object.values(
        (v.tally as Record<string, { fixed: number; kept: number }>) ?? {},
      )) {
        day.fixed += t.fixed || 0;
        day.waved += t.kept || 0;
      }
    } else {
      for (const n of (v.notes as LangNoteRow[] | undefined) ?? []) {
        if (dismissed.has(n.id)) {
          evidence.push(
            `False alarm (Hindi–English, ${n.kind}): "${n.issue}" on "${n.en.slice(0, 80)}" / "${n.hi.slice(0, 80)}"; the editor said it's fine.`,
          );
          day.waved++;
        }
      }
    }
    days.set(date, day);
  }
  return { evidence: evidence.slice(-60), days: [...days].map(([date, d]) => ({ date, ...d })) };
}

// The last weeks' corrections the editor decided.
async function updaterDecisions(): Promise<{
  evidence: string[];
  days: { date: string; approved: number; rejected: number }[];
}> {
  const { data, error } = await from("ca_corrections")
    .select("status,changes,decided_at")
    .in("status", ["approved", "rejected"])
    .gte("decided_at", `${sinceDate()}T00:00:00Z`)
    .order("decided_at", { ascending: false })
    .limit(200);
  fail(error);
  const evidence: string[] = [];
  const days = new Map<string, { approved: number; rejected: number }>();
  for (const r of (data ?? []) as Row[]) {
    const date = String(r.decided_at).slice(0, 10);
    const d = days.get(date) ?? { approved: 0, rejected: 0 };
    const ok = r.status === "approved";
    if (ok) d.approved++;
    else d.rejected++;
    days.set(date, d);
    const changes =
      (r.changes as { old_value?: string; new_value?: string; note?: string }[]) ?? [];
    for (const c of changes.slice(0, 3))
      evidence.push(
        `${ok ? "Approved" : "Rejected (not a real change)"}: "${c.old_value ?? ""}" → "${c.new_value ?? ""}"${c.note ? ` (${c.note})` : ""}.`,
      );
  }
  return { evidence: evidence.slice(0, 60), days: [...days].map(([date, d]) => ({ date, ...d })) };
}

const MIN_DECISIONS = 4;

// The weekly suggestion (with the Sunday report): new lessons from the last
// weeks' decisions, waiting for the editor.
export async function suggestLessons(m: NotebookMember): Promise<Notebook> {
  const { evidence } = m === "proofreader" ? await proofDecisions() : await updaterDecisions();
  if (evidence.length < MIN_DECISIONS)
    throw new Error(
      `Not enough decisions in the last ${EVIDENCE_DAYS} days to learn from yet (${evidence.length}; at least ${MIN_DECISIONS}).`,
    );
  const nb = await notebook(m);
  const { saathiComplete } = await import("../../supabase/functions/_shared/saathi-core.ts");
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const rules = parseLessons(
    await saathiComplete(key, notebookSuggestMessages(m, evidence, nb.rules)),
    nb.rules,
  );
  const next: Notebook = {
    ...nb,
    suggestions: rules.length
      ? { at: new Date().toISOString(), decisions: evidence.length, rules }
      : null,
  };
  await writeNotebook(m, next);
  return next;
}

// The Proofreader's and the Updater's weekly scorecards.
export async function notebookScores(m: NotebookMember, weeks = 6): Promise<WeekScore[]> {
  const first = mondayOf(istDate(new Date(Date.now() - (weeks * 7 - 1) * 86_400_000)));
  const out = new Map<string, WeekScore>();
  const add = (date: string, total: number, agreed: number) => {
    const w = mondayOf(date);
    if (w < first) return;
    const s = out.get(w) ?? { week: w, total: 0, agreed: 0 };
    s.total += total;
    s.agreed += agreed;
    out.set(w, s);
  };
  if (m === "proofreader")
    for (const d of (await proofDecisions()).days) add(d.date, d.fixed + d.waved, d.fixed);
  else
    for (const d of (await updaterDecisions()).days)
      add(d.date, d.approved + d.rejected, d.approved);
  return [...out.values()].filter((s) => s.total).sort((a, b) => a.week.localeCompare(b.week));
}
