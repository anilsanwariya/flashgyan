// Server-only: the current affairs web reader.
//
// A day is public once its daily issue has been posted to the channel (the
// issue's "posted" status is the day's public flag), unless the editor took
// it off the website. Each public day also gets an MCQ practice test per
// language, made from its stories' MCQs by the background tick.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatDate, type CaContent, type MagazineSettings } from "@/lib/current-affairs";
import { CA_PRACTICE_SUBJECT } from "@/lib/ca-reader";

type Lang = "en" | "hi";
type Row = Record<string, unknown>;
const from = (t: string) => supabaseAdmin.from(t as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

const HIDDEN_KEY = "ca_reader_hidden";
const PRACTICE_KEY = "ca_reader_practice";

async function setting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  fail(error);
  return ((data as { value?: T } | null)?.value ?? fallback) as T;
}
async function saveSetting(key: string, value: unknown) {
  fail(
    (
      await from("bot_settings").upsert(
        { key, value, updated_at: new Date().toISOString() } as never,
        { onConflict: "key" },
      )
    ).error,
  );
}

// Days the editor took off the website.
export async function hiddenDays(): Promise<Set<string>> {
  const v = await setting<{ dates?: string[] }>(HIDDEN_KEY, {});
  return new Set((v.dates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
}

// Practice test ids by day and language.
type PracticeMap = Record<string, Partial<Record<Lang, string>>>;
const practiceMap = () => setting<PracticeMap>(PRACTICE_KEY, {});

// Posted daily issues, newest first (their dates).
async function postedDates(limit = 2000): Promise<string[]> {
  const { data, error } = await from("ca_issues")
    .select("period")
    .eq("kind", "daily")
    .eq("status", "posted")
    .order("period", { ascending: false })
    .limit(limit);
  fail(error);
  return ((data ?? []) as Row[]).map((r) => String(r.period));
}

// The reader's public days (posted and not taken off), newest first, for the
// sitemap.
export async function publicDates(limit = 1000): Promise<string[]> {
  const hidden = await hiddenDays();
  return (await postedDates(limit)).filter((d) => !hidden.has(d));
}

export async function isPublicDay(date: string): Promise<boolean> {
  const { data, error } = await from("ca_issues")
    .select("status")
    .eq("kind", "daily")
    .eq("period", date)
    .eq("status", "posted")
    .maybeSingle();
  fail(error);
  return !!data && !(await hiddenDays()).has(date);
}

export type ReaderDay = { date: string; count: number; headlines: string[] };

// A page of public days (newest first), each with its top headlines.
export async function listDays(
  lang: Lang,
  before: string | null,
  pageSize = 20,
): Promise<{ days: ReaderDay[]; more: boolean }> {
  const hidden = await hiddenDays();
  const all = (await postedDates()).filter((d) => !hidden.has(d) && (!before || d < before));
  const page = all.slice(0, pageSize);
  if (!page.length) return { days: [], more: false };
  const { data, error } = await from("ca_items")
    .select("issue_date,importance,position,content")
    .in("issue_date", page)
    .eq("status", "included");
  fail(error);
  const byDay = new Map<string, { importance: number; position: number; headline: string }[]>();
  for (const r of (data ?? []) as Row[]) {
    const c = r.content as CaContent | null;
    const h = c?.headline
      ? lang === "hi"
        ? c.headline.hi || c.headline.en
        : c.headline.en || c.headline.hi
      : "";
    if (!h) continue;
    const d = String(r.issue_date);
    byDay.set(d, [
      ...(byDay.get(d) ?? []),
      { importance: Number(r.importance) || 0, position: Number(r.position) || 0, headline: h },
    ]);
  }
  const days = page.map((date) => {
    const list = (byDay.get(date) ?? []).sort(
      (a, b) => b.importance - a.importance || a.position - b.position,
    );
    return { date, count: list.length, headlines: list.slice(0, 3).map((x) => x.headline) };
  });
  return { days: days.filter((d) => d.count > 0), more: all.length > pageSize };
}

export type ReaderSection = { cat: string; label: string; count: number };

// One public day: its stories as the web edition's HTML, its sections, its
// practice test and the days before and after it.
export async function readDay(date: string, lang: Lang) {
  if (!(await isPublicDay(date))) return null;
  const CA = await import("@/lib/current-affairs.server");
  const { html, count } = await CA.issueHtml("daily", date, lang, { edition: "web" });
  const hidden = await hiddenDays();
  const dates = (await postedDates()).filter((d) => !hidden.has(d));
  const at = dates.indexOf(date);
  const practice = (await practiceMap())[date]?.[lang] ?? null;
  return {
    date,
    title: formatDate(date, lang),
    html,
    count,
    newer: at > 0 ? dates[at - 1] : null,
    older: at >= 0 && at < dates.length - 1 ? dates[at + 1] : null,
    practiceTestId: practice,
  };
}

// ---------- The editor: a day on or off the website ----------

export async function setDayHidden(date: string, hidden: boolean) {
  const days = await hiddenDays();
  if (hidden) days.add(date);
  else days.delete(date);
  await saveSetting(HIDDEN_KEY, { dates: [...days].sort() });
  // A hidden day's practice tests go too (made again if it comes back).
  if (hidden) await removePractice(date);
}

export async function dayOnWebsite(date: string): Promise<boolean> {
  return !(await hiddenDays()).has(date);
}

// ---------- Practice tests ----------

async function removePractice(date: string) {
  const map = await practiceMap();
  const ids = Object.values(map[date] ?? {}).filter(Boolean) as string[];
  if (ids.length) fail((await from("mcq_practice_tests").delete().in("id", ids)).error);
  if (map[date]) {
    delete map[date];
    await saveSetting(PRACTICE_KEY, map);
  }
}

const practiceName = (date: string, lang: Lang) =>
  lang === "hi"
    ? `करेंट अफेयर्स · ${formatDate(date, "hi")}`
    : `Current Affairs · ${formatDate(date, "en")}`;

// Makes the practice tests of a few public days that don't have them yet
// (newest first, so new days come first and old days fill in over time).
// Run by the background tick.
export async function makePracticeTests(maxDays = 5): Promise<number> {
  const hidden = await hiddenDays();
  const map = await practiceMap();
  const todo = (await postedDates())
    .filter((d) => !hidden.has(d) && !(map[d]?.en && map[d]?.hi))
    .slice(0, maxDays);
  if (!todo.length) return 0;
  const { data, error } = await from("ca_items")
    .select("id,issue_date,importance,position,content")
    .in("issue_date", todo)
    .eq("status", "included");
  fail(error);
  const rows = ((data ?? []) as Row[]).sort(
    (a, b) =>
      (Number(b.importance) || 0) - (Number(a.importance) || 0) ||
      (Number(a.position) || 0) - (Number(b.position) || 0),
  );
  let made = 0;
  for (const date of todo) {
    const mcqs = rows
      .filter((r) => String(r.issue_date) === date)
      .map((r) => (r.content as CaContent | null)?.mcq)
      .filter((m): m is NonNullable<CaContent["mcq"]> => !!m && m.options?.length === 4);
    map[date] = map[date] ?? {};
    for (const lang of ["hi", "en"] as const) {
      if (map[date][lang]) continue;
      const pick = (b: { en: string; hi: string }) =>
        (lang === "hi" ? b.hi || b.en : b.en || b.hi).trim();
      const qs = mcqs.filter((m) => pick(m.question) && m.options.every((o) => pick(o)));
      // A day without questions is marked done with no test.
      if (!qs.length) {
        map[date][lang] = "";
        continue;
      }
      const { data: test, error: te } = await from("mcq_practice_tests")
        .insert({
          name: practiceName(date, lang),
          description:
            lang === "hi"
              ? `${formatDate(date, "hi")} की खबरों पर ${qs.length} प्रश्न`
              : `${qs.length} questions on the news of ${formatDate(date, "en")}`,
          subject: CA_PRACTICE_SUBJECT,
          topic: date.slice(0, 7),
          order_index: 0,
        } as never)
        .select("id")
        .single();
      fail(te);
      const testId = String((test as unknown as Row).id);
      const { error: qe } = await from("mcq_practice_questions").insert(
        qs.map((m, i) => ({
          test_id: testId,
          order_index: i,
          question: pick(m.question),
          question_ext: "",
          option_1: pick(m.options[0]),
          option_2: pick(m.options[1]),
          option_3: pick(m.options[2]),
          option_4: pick(m.options[3]),
          answer: Math.min(4, Math.max(1, (Number(m.answer) || 0) + 1)),
          explanation_sections: pick(m.explanation)
            ? [{ title: lang === "hi" ? "व्याख्या" : "Explanation", body: pick(m.explanation) }]
            : [],
        })) as never,
      );
      if (qe) {
        // Not left half made.
        await from("mcq_practice_tests").delete().eq("id", testId);
        fail(qe);
      }
      map[date][lang] = testId;
      made++;
    }
    await saveSetting(PRACTICE_KEY, map);
  }
  return made;
}

// The reader's link for a day: the Telegram mini app's link when set (it
// opens the app on that day), otherwise the website's page.
export function readerLink(settings: MagazineSettings, date: string, site: string): string {
  const app = (settings.reader_app_link ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/t\.me\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(app)
    ? `${app}?startapp=ca_${date}`
    : `${site.replace(/\/+$/, "")}/current-affairs/${date}`;
}
