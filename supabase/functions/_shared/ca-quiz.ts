// Current affairs quizzes on Telegram: the magazine's MCQs as quiz polls, for
// the channel after each daily issue and for students' daily quiz in the bot,
// plus the daily quiz's streak rules. Pure helpers shared by the bot (Deno)
// and the website (Node); no network or database here.

export type Bi = { en: string; hi: string };
export type QuizMcq = { question: Bi; options: Bi[]; answer: number; explanation: Bi };

// What Telegram allows in a poll.
const QUESTION_MAX = 300;
const OPTION_MAX = 100;
const EXPLANATION_MAX = 200;

export type QuizPoll = {
  // The full question as a message before the poll, when it is too long for one.
  intro: string | null;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const both = (b: Bi, sep: string) =>
  b.hi && b.en && b.hi !== b.en ? `${b.hi}${sep}${b.en}` : b.hi || b.en;

// The issue's MCQs that can be polls: four options and a valid answer.
export function quizMcqs(items: { mcq?: QuizMcq | null }[], max: number): QuizMcq[] {
  return items
    .map((i) => i.mcq)
    .filter(
      (m): m is QuizMcq =>
        !!m &&
        Array.isArray(m.options) &&
        m.options.length === 4 &&
        Number.isInteger(m.answer) &&
        m.answer >= 0 &&
        m.answer < 4 &&
        !!(m.question?.hi || m.question?.en),
    )
    .slice(0, Math.max(0, max));
}

// One MCQ as a Telegram quiz poll, Hindi and English together where they fit.
// A statement question too long for a poll goes in a message just before it.
export function quizPoll(m: QuizMcq, n: number, total: number): QuizPoll {
  const no = `${n}/${total}. `;
  const full = both(m.question, "\n\n");
  const fits = no.length + full.length <= QUESTION_MAX;
  const options = m.options.map((o) => {
    const pair = both(o, " / ");
    if (pair.length <= OPTION_MAX) return pair;
    if (o.en && o.en.length <= OPTION_MAX) return o.en;
    if (o.hi && o.hi.length <= OPTION_MAX) return o.hi;
    return clip(o.en || o.hi, OPTION_MAX);
  });
  const ex = m.explanation ?? { en: "", hi: "" };
  const explanation =
    ex.hi && ex.hi.length <= EXPLANATION_MAX
      ? ex.hi
      : ex.en && ex.en.length <= EXPLANATION_MAX
        ? ex.en
        : clip(ex.hi || ex.en || "", EXPLANATION_MAX);
  return {
    intro: fits
      ? null
      : `<b>${n}/${total}</b>\n\n${esc(m.question.hi || m.question.en)}${
          m.question.hi && m.question.en ? `\n\n${esc(m.question.en)}` : ""
        }`,
    question: fits
      ? `${no}${full}`
      : `${no}ऊपर दिए प्रश्न का सही उत्तर चुनें / Choose the answer to the question above`,
    options,
    correct: m.answer,
    explanation,
  };
}

// ---------- Daily quiz in the bot ----------

export const DAILY_QUIZ_SIZE = 5;
// Hours (India time) a student can pick for the daily quiz.
export const DAILY_QUIZ_HOURS = [7, 9, 13, 18, 21];
export const DAILY_QUIZ_DEFAULT_HOUR = 9;

// Today's date (YYYY-MM-DD) and hour in India.
export function istNow(now = new Date()): { date: string; hour: number } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { date: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() };
}

export function hourLabel(h: number): string {
  const am = h < 12;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${am ? "AM" : "PM"}`;
}

export type DailyQuizState = {
  streak: number;
  best_streak: number;
  last_sent_date: string | null;
  last_done_date: string | null;
};

// Sending a new quiz: a streak survives only if the last quiz sent was finished.
// Days with no new issue send nothing, so they never break a streak.
export function streakOnSend(s: DailyQuizState): number {
  return s.last_sent_date && (s.last_done_date ?? "") < s.last_sent_date ? 0 : s.streak;
}

// Finishing the quiz sent on `sentDate` adds a day, once.
export function streakOnDone(
  s: DailyQuizState,
  sentDate: string,
): { streak: number; best_streak: number; last_done_date: string } {
  if (s.last_done_date && s.last_done_date >= sentDate)
    return { streak: s.streak, best_streak: s.best_streak, last_done_date: s.last_done_date };
  const streak = s.streak + 1;
  return { streak, best_streak: Math.max(s.best_streak, streak), last_done_date: sentDate };
}

// The result after the last question.
export function quizResultText(correct: number, total: number, streak: number, best: number) {
  const fire = streak >= 2 ? `🔥 <b>${streak}-day streak!</b>` : "🔥 Streak started: 1 day";
  return `🏁 <b>Daily quiz done</b> · ${correct}/${total} correct\n\n${fire}${
    best > streak ? ` (best: ${best})` : ""
  }\n<i>Tomorrow's quiz comes at the same time. Keep the streak going!</i>`;
}
