// Server-only: the admin's weekly quality report, sent on Telegram to the
// test chat every Sunday from 9 AM India time (from the collection tick), or on
// demand from Magazine settings.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uncoveredConcepts, type CaFact, type StaticFact } from "@/lib/current-affairs";
import {
  rajasthanBalance,
  reportWeek,
  styleScores,
  weeklyReportDue,
  weeklyReportText,
  type Accuracy,
  type StyleScore,
  type WeeklyStats,
} from "@/lib/ca-report";
import type { StyleCheck } from "@/lib/ca-style";
import { getMagazineSettings, suggestStyleRules } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const STATE_KEY = "ca_weekly_report";

type ItemRow = {
  id: string;
  issue_date: string;
  category: string;
  rajasthan: boolean;
  status: string;
  facts: CaFact[];
  source_ids: string[];
  concept: string | null;
  headline: string;
  background: unknown;
  context_sources: { title: string }[] | null;
  statics: StaticFact[] | null;
};

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function weeklyStats(fromDate: string, toDate: string): Promise<WeeklyStats> {
  const settings = await getMagazineSettings();
  // The week in India time, for timestamps.
  const since = `${fromDate}T00:00:00+05:30`;
  const until = `${toDate}T23:59:59.999+05:30`;
  const [{ data: rows }, issuesPosted, pendingCorrections, saathiUp, saathiDown, knowledgeGaps] =
    await Promise.all([
      from("ca_items")
        .select(
          "id,issue_date,category,rajasthan,status,facts,source_ids,concept,headline,background:content->background,statics:content->statics,context_sources",
        )
        .gte("issue_date", fromDate)
        .lte("issue_date", toDate)
        .limit(5000),
      count(
        from("ca_issues")
          .select("id", { count: "exact", head: true })
          .eq("kind", "daily")
          .eq("status", "posted")
          .gte("period", fromDate)
          .lte("period", toDate),
      ),
      count(
        from("ca_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ),
      count(
        from("saathi_feedback")
          .select("id", { count: "exact", head: true })
          .eq("rating", 1)
          .gte("created_at", since)
          .lte("created_at", until),
      ),
      count(
        from("saathi_feedback")
          .select("id", { count: "exact", head: true })
          .eq("rating", -1)
          .gte("created_at", since)
          .lte("created_at", until),
      ),
      count(
        from("saathi_knowledge_gaps")
          .select("id", { count: "exact", head: true })
          .gte("last_asked_at", since)
          .lte("last_asked_at", until),
      ),
    ]);
  const items = (rows ?? []) as unknown as ItemRow[];
  const kept = items.filter((i) => i.status === "included");
  const news = kept.filter((i) => i.category !== "editorial");
  const days = [...new Set(items.map((i) => i.issue_date))];
  const rajasthanShortDays = days.filter(
    (d) =>
      rajasthanBalance(
        items.filter((i) => i.issue_date === d),
        settings.min_rajasthan,
      ).short,
  ).length;
  return {
    from: fromDate,
    to: toDate,
    issuesPosted,
    stories: news.length,
    dropped: items.filter((i) => i.status === "dropped" && i.category !== "editorial").length,
    rajasthan: rajasthanBalance(items, settings.min_rajasthan).rajasthan,
    rajasthanShortDays,
    minRajasthan: settings.min_rajasthan,
    editorials: kept.length - news.length,
    // No book behind the Static Context (none, or SAATHI's own knowledge).
    missingBackground: news.filter(
      (i) => (i.concept || i.statics?.length) && !i.context_sources?.length,
    ).length,
    uncoveredConcepts: uncoveredConcepts(news).map((c) => c.concept),
    unverifiedFacts: kept.reduce((n, i) => n + i.facts.filter((f) => !f.verified).length, 0),
    multiSource: news.filter((i) => i.source_ids.length > 1).length,
    pendingCorrections,
    saathiUp,
    saathiDown,
    knowledgeGaps,
    quiz: await quizStats(fromDate, toDate),
    accuracy: await accuracyStats(fromDate, toDate, kept, news.length),
    style: await styleWeek(fromDate, toDate, settings.style_rules),
  };
}

// The days' house style checks added up for each rule (each day's check
// keeps a tally of the notes it found, fixed and kept).
export async function styleWeek(
  fromDate: string,
  toDate: string,
  rules: string[],
): Promise<StyleScore[]> {
  if (!rules.length) return [];
  const keys: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00Z`); d <= new Date(`${toDate}T00:00:00Z`); ) {
    keys.push(`ca_style_check:${d.toISOString().slice(0, 10)}`);
    d = new Date(d.getTime() + 86_400_000);
  }
  const { data, error } = await from("bot_settings").select("value").in("key", keys.slice(0, 62));
  if (error) return styleScores([], rules);
  return styleScores(
    ((data ?? []) as { value: StyleCheck | null }[]).map((r) => r.value?.tally ?? {}),
    rules,
  );
}

// How much fixing SAATHI's drafts needed, day by day: facts whose quote
// wasn't in the source as written (still to check, or checked by hand),
// stories edited or rewritten (from their history), corrections approved,
// and skipped articles worth a story (the day's saved counts).
async function accuracyStats(
  fromDate: string,
  toDate: string,
  kept: ItemRow[],
  stories: number,
): Promise<Accuracy> {
  const ids = kept.map((i) => i.id);
  const dateOf = new Map(kept.map((i) => [i.id, i.issue_date]));
  const edited = new Set<string>();
  const rewritten = new Set<string>();
  const corrected = new Map<string, number>();
  for (let k = 0; k < ids.length; k += 200) {
    const chunk = ids.slice(k, k + 200);
    const [versions, corrections] = await Promise.all([
      from("ca_item_versions").select("item_id,reason").in("item_id", chunk).limit(10_000),
      from("ca_corrections")
        .select("item_id")
        .eq("status", "approved")
        .in("item_id", chunk)
        .limit(10_000),
    ]);
    // Story history may not be there yet (before its migration).
    for (const v of (versions.data ?? []) as { item_id: string; reason: string }[]) {
      if (v.reason === "edit") edited.add(v.item_id);
      else if (v.reason === "rewrite" || v.reason === "write" || v.reason === "points")
        rewritten.add(v.item_id);
    }
    for (const c of (corrections.data ?? []) as { item_id: string }[]) {
      corrected.set(c.item_id, (corrected.get(c.item_id) ?? 0) + 1);
    }
  }
  const dates: string[] = [];
  for (let d = fromDate; d <= toDate; ) {
    dates.push(d);
    const next = new Date(`${d}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  const { data: saved } = await from("bot_settings")
    .select("key,value")
    .in(
      "key",
      dates.map((d) => `ca_skipped_rank:${d}`),
    );
  const worth = new Map(
    ((saved ?? []) as { key: string; value: { counts?: { worth: number } } }[]).map((r) => [
      r.key.slice("ca_skipped_rank:".length),
      r.value.counts?.worth ?? 0,
    ]),
  );
  const count = (d: string, ofItem: Set<string> | Map<string, number>) =>
    [...ofItem.keys()].reduce(
      (n, id) =>
        dateOf.get(id) === d ? n + (ofItem instanceof Map ? (ofItem.get(id) ?? 0) : 1) : n,
      0,
    );
  return {
    stories,
    days: dates
      .map((d) => {
        const day = kept.filter((i) => i.issue_date === d);
        return {
          date: d,
          facts: day.reduce((n, i) => n + i.facts.length, 0),
          misses: day.reduce(
            (n, i) => n + i.facts.filter((f) => !f.verified || f.checked).length,
            0,
          ),
          edited: count(d, edited),
          rewritten: count(d, rewritten),
          corrections: count(d, corrected),
          skippedWorth: worth.get(d) ?? 0,
        };
      })
      // Days without an issue (nothing collected) are left out.
      .filter((d) => d.facts || d.skippedWorth),
  };
}

// The bot's daily quiz, or null before its migration.
async function quizStats(fromDate: string, toDate: string): Promise<WeeklyStats["quiz"]> {
  const { data, error } = await from("bot_daily_quiz")
    .select("enabled,streak,created_at,last_done_date")
    .limit(100_000);
  if (error) return null;
  const rows = (data ?? []) as {
    enabled: boolean;
    streak: number;
    created_at: string;
    last_done_date: string | null;
  }[];
  const on = rows.filter((r) => r.enabled);
  return {
    on: on.length,
    joined: rows.filter((r) => {
      const t = Date.parse(r.created_at);
      return (
        t >= Date.parse(`${fromDate}T00:00:00+05:30`) &&
        t <= Date.parse(`${toDate}T23:59:59.999+05:30`)
      );
    }).length,
    finished: rows.filter((r) => {
      const d = r.last_done_date ?? "";
      return d >= fromDate && d <= toDate;
    }).length,
    streak3: on.filter((r) => r.streak >= 3).length,
    topStreak: Math.max(0, ...rows.map((r) => r.streak)),
  };
}

// Sends the report for the week ending yesterday to the admin's test chat.
// With `suggestStyle` (the Sunday report), SAATHI also suggests house style
// rules from the week's edits (one AI call, only when there are enough).
export async function sendWeeklyReport(
  origin?: string,
  opts: { suggestStyle?: boolean } = {},
): Promise<{ sent: boolean; text: string }> {
  const settings = await getMagazineSettings();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const week = reportWeek();
  const stats = await weeklyStats(week.from, week.to);
  if (opts.suggestStyle) {
    try {
      stats.styleSuggestions = (await suggestStyleRules()).rules.length;
    } catch (e) {
      // Too few edits, or the AI failed: the report goes out without it.
      console.error("house style:", e instanceof Error ? e.message : e);
    }
    try {
      const picks = await import("@/lib/ca-picks.server");
      stats.pickSuggestions = (await picks.suggestPickRules()).rules.length;
    } catch (e) {
      // Too few changed picks, no migration yet, or the AI failed.
      console.error("picking rules:", e instanceof Error ? e.message : e);
    }
  }
  try {
    stats.atlas = await (await import("@/lib/atlas-recheck.server")).atlasWeekly();
  } catch (e) {
    // No atlas yet: the report goes out without it.
    console.error("atlas:", e instanceof Error ? e.message : e);
  }
  const text = weeklyReportText(stats, origin ? `${origin}/admin?section=ca.daily` : undefined);
  if (!token || !settings.test_chat_id) return { sent: false, text };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.test_chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram error ${res.status}`);
  await from("bot_settings").upsert({
    key: STATE_KEY,
    value: { last_to: week.to, sent_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  } as never);
  return { sent: true, text };
}

// Called by every collection tick: sends the week's report once on Sunday.
export async function maybeSendWeeklyReport(origin?: string) {
  const settings = await getMagazineSettings();
  if (!settings.weekly_report || !settings.test_chat_id) return;
  const { data } = await from("bot_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  const last = ((data as { value?: { last_to?: string } } | null)?.value?.last_to ?? null) as
    | string
    | null;
  if (!weeklyReportDue(new Date(), last)) return;
  // Mark the week first so overlapping ticks never send it twice; undo on failure.
  await from("bot_settings").upsert({
    key: STATE_KEY,
    value: { last_to: reportWeek().to, sent_at: null },
    updated_at: new Date().toISOString(),
  } as never);
  try {
    await sendWeeklyReport(origin, { suggestStyle: true });
  } catch (e) {
    await from("bot_settings").upsert({
      key: STATE_KEY,
      value: { last_to: last, sent_at: null },
      updated_at: new Date().toISOString(),
    } as never);
    throw e;
  }
}
