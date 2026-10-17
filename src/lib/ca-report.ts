// The admin's weekly quality report on Telegram and the Rajasthan balance
// check for a day's issue. Pure helpers: counting and text, no database here.

// RPSC asks a lot about Rajasthan; fewer stories than this in a day's issue is
// flagged in the admin panel and in the "draft ready" message.
export const DEFAULT_MIN_RAJASTHAN = 5;

type BalanceItem = { category: string; rajasthan: boolean; status: string };

const isRajasthan = (i: BalanceItem) => i.rajasthan || i.category === "rajasthan";

export type RajasthanBalance = {
  // Stories in the issue (editorials not counted).
  included: number;
  rajasthan: number;
  // Rajasthan stories that arrived dropped and can be brought back.
  droppedRajasthan: number;
  min: number;
  short: boolean;
};

export function rajasthanBalance(items: BalanceItem[], min: number): RajasthanBalance {
  const news = items.filter((i) => i.category !== "editorial");
  const included = news.filter((i) => i.status === "included");
  const rajasthan = included.filter(isRajasthan).length;
  return {
    included: included.length,
    rajasthan,
    droppedRajasthan: news.filter((i) => i.status === "dropped" && isRajasthan(i)).length,
    min,
    short: included.length > 0 && rajasthan < min,
  };
}

// The line added to the "draft ready" message, or "" when the day is fine.
export function rajasthanWarningLine(b: RajasthanBalance): string {
  if (!b.short) return "";
  return `\n⚠️ Only ${b.rajasthan} Rajasthan ${b.rajasthan === 1 ? "story" : "stories"} (aim for ${b.min}+)${
    b.droppedRajasthan ? `; ${b.droppedRajasthan} more arrived dropped and can be brought back` : ""
  }.`;
}

// ---------- Weekly report ----------

// The week reported on a given day: the 7 days ending yesterday (India time).
export function reportWeek(now = new Date()): { from: string; to: string } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const to = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 1));
  const from = new Date(to.getTime() - 6 * 86_400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return { from: d(from), to: d(to) };
}

// Sunday from 9 AM India time, once per week.
export function weeklyReportDue(now: Date, lastSentTo: string | null): boolean {
  const ist = new Date(now.getTime() + 330 * 60_000);
  if (ist.getUTCDay() !== 0 || ist.getUTCHours() < 9) return false;
  return lastSentTo !== reportWeek(now).to;
}

export type WeeklyStats = {
  from: string;
  to: string;
  issuesPosted: number;
  stories: number;
  dropped: number;
  rajasthan: number;
  // Days whose issue had fewer Rajasthan stories than the minimum.
  rajasthanShortDays: number;
  minRajasthan: number;
  editorials: number;
  // Stories with a static concept but no background from the books.
  missingBackground: number;
  uncoveredConcepts: string[];
  unverifiedFacts: number;
  multiSource: number;
  pendingCorrections: number;
  saathiUp: number;
  saathiDown: number;
  knowledgeGaps: number;
  quiz: { on: number; joined: number; finished: number; streak3: number; topStreak: number } | null;
};

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function weeklyReportText(s: WeeklyStats, adminUrl?: string): string {
  const lines = [
    `📊 <b>FlashGyan weekly report</b> · ${s.from} to ${s.to}`,
    "",
    `<b>Magazine</b>`,
    `📰 ${s.issuesPosted}/7 daily issues posted · ${s.stories} stories (${s.dropped} dropped)`,
    `🏜 Rajasthan: ${s.rajasthan} stories (${pct(s.rajasthan, s.stories)})${
      s.rajasthanShortDays
        ? ` · ⚠️ ${s.rajasthanShortDays} day${s.rajasthanShortDays === 1 ? "" : "s"} under ${s.minRajasthan}`
        : ""
    }`,
    `✍️ Editorials: ${s.editorials}`,
    `🔗 Built from 2+ sources: ${s.multiSource}`,
    `${s.unverifiedFacts ? "⚠️" : "✅"} Facts not found word for word in their source: ${s.unverifiedFacts}`,
    `📚 Stories without a book background: ${s.missingBackground}`,
  ];
  if (s.uncoveredConcepts.length)
    lines.push(`   Books needed for: ${esc(s.uncoveredConcepts.slice(0, 5).join(", "))}`);
  if (s.pendingCorrections) lines.push(`📝 Corrections waiting for you: ${s.pendingCorrections}`);
  lines.push(
    "",
    `<b>SAATHI</b>`,
    `👍 ${s.saathiUp} · 👎 ${s.saathiDown}${
      s.saathiUp + s.saathiDown ? ` (${pct(s.saathiUp, s.saathiUp + s.saathiDown)} helpful)` : ""
    }`,
    `❓ Questions it couldn't answer: ${s.knowledgeGaps}`,
  );
  if (s.quiz)
    lines.push(
      "",
      `<b>Daily quiz</b>`,
      `🔥 ${s.quiz.on} students on (${s.quiz.joined} new) · ${s.quiz.finished} finished a quiz this week`,
      `🏅 ${s.quiz.streak3} on a 3+ day streak · longest ${s.quiz.topStreak}`,
    );
  if (adminUrl) lines.push("", `Review: ${adminUrl}`);
  return lines.join("\n");
}
