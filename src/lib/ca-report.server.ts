// Server-only: the admin's weekly quality report, sent on Telegram to the
// test chat every Sunday from 9 AM India time (from the collection tick), or on
// demand from Magazine settings.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uncoveredConcepts, type CaFact } from "@/lib/current-affairs";
import {
  rajasthanBalance,
  reportWeek,
  weeklyReportDue,
  weeklyReportText,
  type WeeklyStats,
} from "@/lib/ca-report";
import { getMagazineSettings } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const STATE_KEY = "ca_weekly_report";

type ItemRow = {
  issue_date: string;
  category: string;
  rajasthan: boolean;
  status: string;
  facts: CaFact[];
  source_ids: string[];
  concept: string | null;
  headline: string;
  background: unknown;
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
          "issue_date,category,rajasthan,status,facts,source_ids,concept,headline,background:content->background",
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
    missingBackground: news.filter((i) => i.concept && !i.background).length,
    uncoveredConcepts: uncoveredConcepts(news).map((c) => c.concept),
    unverifiedFacts: kept.reduce((n, i) => n + i.facts.filter((f) => !f.verified).length, 0),
    multiSource: news.filter((i) => i.source_ids.length > 1).length,
    pendingCorrections,
    saathiUp,
    saathiDown,
    knowledgeGaps,
    quiz: await quizStats(fromDate, toDate),
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
export async function sendWeeklyReport(origin?: string): Promise<{ sent: boolean; text: string }> {
  const settings = await getMagazineSettings();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const week = reportWeek();
  const text = weeklyReportText(
    await weeklyStats(week.from, week.to),
    origin ? `${origin}/admin?section=ca.daily` : undefined,
  );
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
    string | null;
  if (!weeklyReportDue(new Date(), last)) return;
  // Mark the week first so overlapping ticks never send it twice; undo on failure.
  await from("bot_settings").upsert({
    key: STATE_KEY,
    value: { last_to: reportWeek().to, sent_at: null },
    updated_at: new Date().toISOString(),
  } as never);
  try {
    await sendWeeklyReport(origin);
  } catch (e) {
    await from("bot_settings").upsert({
      key: STATE_KEY,
      value: { last_to: last, sent_at: null },
      updated_at: new Date().toISOString(),
    } as never);
    throw e;
  }
}
