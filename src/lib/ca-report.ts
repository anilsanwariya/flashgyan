// The admin's weekly quality report on Telegram and the Rajasthan balance
// check for a day's issue. Pure helpers: counting and text, no database here.
import { ruleKey, type StyleTally } from "../../supabase/functions/_shared/ca-style-check.ts";

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
  // How much fixing SAATHI's drafts needed, by day.
  accuracy?: Accuracy;
  // House style rules SAATHI suggested from the week's edits, waiting for
  // the editor.
  styleSuggestions?: number;
  // Picking rules SAATHI suggested from the editor's picks, waiting.
  pickSuggestions?: number;
  // Each house style rule's week in the style check.
  style?: StyleScore[];
  // The atlas: dated facts due for a recheck, students' open reports.
  atlas?: { recheck: number; reports: number };
};

// One house style rule's week: notes the style check found, fixed with
// SAATHI's text, and kept as they were.
export type StyleScore = { rule: string; found: number; fixed: number; kept: number };

// The days' tallies added up for each current rule (rules compared without
// case or punctuation).
export function styleScores(tallies: StyleTally[], rules: string[]): StyleScore[] {
  const sums = new Map<string, Omit<StyleScore, "rule">>();
  for (const t of tallies) {
    for (const [rule, v] of Object.entries(t ?? {})) {
      const k = ruleKey(rule);
      const s = sums.get(k) ?? { found: 0, fixed: 0, kept: 0 };
      sums.set(k, { found: s.found + v.found, fixed: s.fixed + v.fixed, kept: s.kept + v.kept });
    }
  }
  return rules.map((rule) => ({
    rule,
    ...(sums.get(ruleKey(rule)) ?? { found: 0, fixed: 0, kept: 0 }),
  }));
}

// The rule the editor should look at: one whose notes are mostly kept as
// they were (the rule says something they don't want), or else the one
// SAATHI breaks most.
export function styleHint(scores: StyleScore[]): string {
  const busy = scores.filter((s) => s.found >= 3);
  const waved = busy
    .filter((s) => s.kept / s.found >= 0.5)
    .sort((a, b) => b.kept / b.found - a.kept / a.found)[0];
  if (waved)
    return `👉 You kept most notes on “${esc(waved.rule)}” as they were: reword the rule or drop it in Magazine settings → House style.`;
  const most = busy.sort((a, b) => b.found - a.found)[0];
  if (most)
    return `👉 SAATHI breaks “${esc(most.rule)}” most (${most.found} times). Adding an example to the rule may help SAATHI follow it.`;
  return "";
}

export function styleScoreLines(scores: StyleScore[]): string[] {
  if (!scores.length) return [];
  const total = (k: "found" | "fixed" | "kept") => scores.reduce((n, s) => n + s[k], 0);
  const found = total("found");
  const hint = styleHint(scores);
  return [
    "",
    `<b>House style</b>`,
    found
      ? `✍️ ${found} note${found === 1 ? "" : "s"} from the style check: ${total("fixed")} fixed, ${total("kept")} kept as written`
      : "✅ No house style notes this week.",
    ...scores.map(
      (s) =>
        `• ${esc(s.rule)}: ${s.found ? `${s.found} · fixed ${s.fixed} · kept ${s.kept}` : "no notes"}`,
    ),
    ...(hint ? [hint] : []),
  ];
}

// One day's fixing: facts in the issue, facts whose quote wasn't in the source
// as written, stories edited by hand, rewritten (from highlights or written
// again), corrections approved, and skipped articles worth a story.
export type DayAccuracy = {
  date: string;
  facts: number;
  misses: number;
  edited: number;
  rewritten: number;
  corrections: number;
  skippedWorth: number;
};
export type Accuracy = { stories: number; days: DayAccuracy[] };

const sum = (days: DayAccuracy[], k: keyof Omit<DayAccuracy, "date">) =>
  days.reduce((n, d) => n + d[k], 0);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
};

// Where SAATHI's drafts needed the most fixing, as one line for the admin.
export function accuracyHint(a: Accuracy): string {
  const facts = sum(a.days, "misses");
  const quoteRate = facts / Math.max(1, sum(a.days, "facts"));
  const editRate = (sum(a.days, "edited") + sum(a.days, "rewritten")) / Math.max(1, a.stories);
  const worth = sum(a.days, "skippedWorth");
  const skipRate = worth / Math.max(1, a.stories + worth);
  const [rate, which] = [
    [quoteRate, "quotes"],
    [editRate, "edits"],
    [skipRate, "skips"],
  ].sort((x, y) => (y[0] as number) - (x[0] as number))[0] as [number, string];
  if (rate < 0.1) return "✅ SAATHI's drafts needed little fixing this week.";
  if (which === "quotes")
    return "👉 Most fixing: facts whose words weren't in the source. SAATHI should copy the source's words exactly when it picks facts.";
  if (which === "edits")
    return "👉 Most fixing: stories edited or rewritten by hand. Note what you change most (headline, points, Hindi) so the writing instructions can say it.";
  return "👉 Most fixing: good news left out. Raise the daily story count or add sites in Magazine settings.";
}

export function accuracyLines(a: Accuracy): string[] {
  const facts = sum(a.days, "facts");
  const misses = sum(a.days, "misses");
  const rows = a.days.map(
    (d) =>
      `${dayLabel(d.date).padEnd(7)}${String(d.misses).padStart(5)}${String(d.edited).padStart(5)}${String(d.rewritten).padStart(5)}${String(d.skippedWorth).padStart(5)}`,
  );
  return [
    "",
    `<b>AI accuracy</b>`,
    `🎯 Facts not word for word in the source: ${misses} of ${facts} (${pct(misses, facts)})`,
    `✏️ Stories edited by hand: ${sum(a.days, "edited")} · rewritten: ${sum(a.days, "rewritten")} · corrections approved: ${sum(a.days, "corrections")}`,
    `🗞 Skipped articles worth a story: ${sum(a.days, "skippedWorth")}`,
    ...(rows.length ? [`<pre>Day    Quote Edit Rewr Skip\n${rows.join("\n")}</pre>`] : []),
    accuracyHint(a),
  ];
}

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
    `${s.unverifiedFacts ? "⚠️" : "✅"} Facts still to check: ${s.unverifiedFacts}`,
    `📚 Stories whose Static Context has no book: ${s.missingBackground}`,
  ];
  if (s.uncoveredConcepts.length)
    lines.push(`   Books needed for: ${esc(s.uncoveredConcepts.slice(0, 5).join(", "))}`);
  if (s.pendingCorrections) lines.push(`📝 Corrections waiting for you: ${s.pendingCorrections}`);
  if (s.accuracy) lines.push(...accuracyLines(s.accuracy));
  if (s.style) lines.push(...styleScoreLines(s.style));
  if (s.styleSuggestions)
    lines.push(
      `✍️ SAATHI suggests ${s.styleSuggestions} house style rule${s.styleSuggestions === 1 ? "" : "s"} from your edits: add the ones you agree with in Magazine settings → House style.`,
    );
  if (s.pickSuggestions)
    lines.push(
      `🎯 SAATHI suggests ${s.pickSuggestions} picking rule${s.pickSuggestions === 1 ? "" : "s"} from the stories you dropped, kept or moved: add the ones you agree with in Magazine settings → Collection → Learnt from your picks.`,
    );
  lines.push(
    "",
    `<b>SAATHI</b>`,
    `👍 ${s.saathiUp} · 👎 ${s.saathiDown}${
      s.saathiUp + s.saathiDown ? ` (${pct(s.saathiUp, s.saathiUp + s.saathiDown)} helpful)` : ""
    }`,
    `❓ Questions it couldn't answer: ${s.knowledgeGaps}`,
  );

  if (s.atlas && (s.atlas.recheck || s.atlas.reports)) {
    lines.push("", `<b>Atlas</b>`);
    if (s.atlas.recheck)
      lines.push(
        `🔄 ${s.atlas.recheck} dated fact${s.atlas.recheck === 1 ? "" : "s"} due for a recheck: Atlas → Quality → Recheck`,
      );
    if (s.atlas.reports)
      lines.push(
        `🚩 ${s.atlas.reports} mistake report${s.atlas.reports === 1 ? "" : "s"} from students waiting`,
      );
  }
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
