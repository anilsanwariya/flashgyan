// The monthly's practice set and one-liners (server): made from the month's
// stories in parts, kept per month, edited by the editor, printed in the
// monthly issue.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  ONELINER_BATCH,
  PRACTICE_PARTS,
  PRACTICE_STORIES,
  normalizeOneliners,
  normalizePractice,
  onelinerMessages,
  parseOneliners,
  parsePractice,
  practiceMessages,
  type OneLiners,
  type PracticeSet,
  type PracticeStory,
  type PracticeStyle,
} from "@/lib/ca-practice";
import { CATEGORIES, monthRange, type CaContent, type CaFact } from "@/lib/current-affairs";
import { getMagazineSettings } from "@/lib/current-affairs.server";
import { focusText } from "@/lib/ca-exam-weights";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

const practiceKey = (month: string) => `ca_practice:${month.slice(0, 7)}`;
const onelinersKey = (month: string) => `ca_oneliners:${month.slice(0, 7)}`;

async function readSetting(key: string): Promise<unknown> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
}
async function writeSetting(key: string, value: unknown | null) {
  if (value === null) {
    fail((await from("bot_settings").delete().eq("key", key)).error);
    return;
  }
  fail((await from("bot_settings").upsert({ key, value, updated_at: now() } as never)).error);
}

// The month's stories, most important first (Rajasthan before others).
async function monthStories(month: string): Promise<(PracticeStory & { importance: number })[]> {
  const range = monthRange(month);
  const rows: {
    id: string;
    issue_date: string;
    category: string;
    headline: string;
    facts: CaFact[];
    content: CaContent | null;
    importance: number;
    rajasthan: boolean;
  }[] = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("ca_items")
      .select("id,issue_date,category,headline,facts,content,importance,rajasthan")
      .gte("issue_date", range.from)
      .lte("issue_date", range.to)
      .eq("status", "included")
      .neq("category", "editorial")
      .not("content", "is", null)
      .order("id")
      .range(at, at + 999);
    fail(error);
    rows.push(...((data ?? []) as unknown as typeof rows));
    if ((data ?? []).length < 1000) break;
  }
  return rows
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        Number(b.rajasthan) - Number(a.rajasthan) ||
        a.issue_date.localeCompare(b.issue_date),
    )
    .map((r) => ({
      id: r.id,
      date: r.issue_date,
      section: r.category,
      headline: r.content?.headline.en || r.headline,
      // The written points first (as printed), then the facts.
      facts: [
        ...(r.content?.points ?? []).map((p) => p.en).filter(Boolean),
        ...r.facts.map((f) => f.text),
      ].slice(0, 10),
      importance: r.importance,
    }));
}

// How the saved papers write each style: a couple of their questions.
async function styleExamples(): Promise<{ style: PracticeStyle; text: string }[]> {
  const { data, error } = await from("exam_questions")
    .select("question_en,extra_en")
    .eq("deleted", false)
    .neq("extra_en", "")
    .limit(400);
  if (error) return [];
  const rows = (data ?? []) as { question_en: string; extra_en: string }[];
  const kinds: [PracticeStyle, RegExp][] = [
    ["statements", /statement/i],
    ["match", /match|list[- ]?i/i],
    ["assertion", /assertion/i],
    ["chronology", /chronolog|order|sequence/i],
  ];
  const out: { style: PracticeStyle; text: string }[] = [];
  for (const [style, re] of kinds)
    for (const r of rows.filter((x) => re.test(`${x.question_en} ${x.extra_en}`)).slice(0, 2))
      out.push({
        style,
        text: `${r.question_en} ${r.extra_en.replace(/\n/g, " / ")}`.slice(0, 400),
      });
  return out;
}

// The exams the magazine prepares for ("" until weighed).
async function focus(): Promise<string> {
  const W = await import("@/lib/ca-exam-weights.server");
  return focusText(await W.savedProfile().catch(() => null));
}

// ---------- Practice set ----------

export async function getPractice(month: string): Promise<PracticeSet | null> {
  return normalizePractice(await readSetting(practiceKey(month)));
}

export async function savePractice(month: string, set: unknown | null) {
  const clean = set === null ? null : normalizePractice(set);
  await writeSetting(practiceKey(month), clean);
  return clean;
}

// One part of the set (0-2), made again: its styles from its share of the
// month's stories (every third, most important first).
export async function practiceStep(month: string, part: number): Promise<PracticeSet> {
  const styles = PRACTICE_PARTS[part];
  if (!styles) throw new Error("No such part.");
  const all = await monthStories(month);
  if (!all.length) throw new Error("There are no stories this month yet.");
  const stories = all
    .filter((_, i) => i % PRACTICE_PARTS.length === part)
    .slice(0, PRACTICE_STORIES);
  const settings = await getMagazineSettings();
  const made = parsePractice(
    await saathiComplete(
      apiKey(),
      practiceMessages(stories, styles, await styleExamples(), settings.glossary, await focus()),
    ),
    stories,
    part,
  );
  if (!made.length) throw new Error("The AI's questions couldn't be read: try again.");
  const had = (await getPractice(month))?.questions ?? [];
  const set: PracticeSet = {
    made_at: now(),
    questions: [...had.filter((q) => q.part !== part), ...made].sort((a, b) => a.part - b.part),
  };
  await writeSetting(practiceKey(month), set);
  return set;
}

// One question made again in the same style, from other stories of its part.
export async function replaceQuestion(month: string, index: number): Promise<PracticeSet> {
  const set = await getPractice(month);
  const q = set?.questions[index];
  if (!set || !q) throw new Error("That question isn't there any more.");
  const all = await monthStories(month);
  const usedElsewhere = new Set(set.questions.flatMap((x) => x.items));
  const stories = all
    .filter((_, i) => i % PRACTICE_PARTS.length === q.part)
    .filter((s) => !usedElsewhere.has(s.id))
    .slice(0, PRACTICE_STORIES);
  if (!stories.length) throw new Error("No other stories left for a new question.");
  const settings = await getMagazineSettings();
  const made = parsePractice(
    await saathiComplete(
      apiKey(),
      practiceMessages(
        stories,
        { [q.style]: 1 },
        await styleExamples(),
        settings.glossary,
        await focus(),
      ),
    ),
    stories,
    q.part,
  ).find((x) => x.style === q.style);
  if (!made) throw new Error("The AI's question couldn't be read: try again.");
  const next = {
    made_at: set.made_at,
    questions: set.questions.map((x, i) => (i === index ? made : x)),
  };
  await writeSetting(practiceKey(month), next);
  return next;
}

// ---------- One-liners ----------

export async function getOneliners(month: string): Promise<OneLiners | null> {
  return normalizeOneliners(await readSetting(onelinersKey(month)));
}

export async function saveOneliners(month: string, list: unknown | null) {
  const clean = list === null ? null : normalizeOneliners(list);
  await writeSetting(onelinersKey(month), clean);
  return clean;
}

// The next batch of the month's stories (in magazine order) made into
// one-liners; from 0 starts the list again.
export async function onelinerStep(
  month: string,
  offset: number,
): Promise<{ list: OneLiners; next: number | null; total: number }> {
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const all = (await monthStories(month)).sort(
    (a, b) =>
      (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99) ||
      b.importance - a.importance ||
      a.date.localeCompare(b.date),
  );
  if (!all.length) throw new Error("There are no stories this month yet.");
  const batch = all.slice(offset, offset + ONELINER_BATCH);
  const settings = await getMagazineSettings();
  const made = batch.length
    ? parseOneliners(
        await saathiComplete(apiKey(), onelinerMessages(batch, settings.glossary)),
        batch,
      )
    : [];
  const had = offset === 0 ? [] : ((await getOneliners(month))?.lines ?? []);
  const lines = [...had.filter((l) => !batch.some((s) => s.id === l.item)), ...made];
  // Kept in magazine order.
  const pos = new Map(all.map((s, i) => [s.id, i]));
  lines.sort((a, b) => (pos.get(a.item) ?? 1e6) - (pos.get(b.item) ?? 1e6));
  const list: OneLiners = { made_at: now(), lines };
  await writeSetting(onelinersKey(month), list);
  const next = offset + ONELINER_BATCH;
  return { list, next: next < all.length ? next : null, total: all.length };
}
