// "Asked before" (server): past exam questions linked to stories, found by
// meaning and confirmed by the AI; and the coverage meter.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiEmbedMany } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  ASKED_BATCH,
  ASKED_CANDIDATES,
  ASKED_CLOSE,
  askedMessages,
  coverageRows,
  parseAsked,
  questionEmbedText,
  type AskedQ,
  type CoverageRow,
} from "@/lib/ca-asked";
import { parseSections, sectionMessages } from "@/lib/exam-papers";
import { monthRange, type CaContent, type CaFact } from "@/lib/current-affairs";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
// Before the "Asked before" migration.
const missing = (e: { message: string } | null) =>
  !!e && /asked|embedding|section|exam_questions_near|schema cache/i.test(e.message);
export const ASKED_NOT_READY =
  "“Asked before” needs a database update: run the latest migration (ca_asked_before) in Lovable or the SQL editor.";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

const toVec = (v: unknown): number[] | null => {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string" && v.startsWith("[")) {
    try {
      return JSON.parse(v) as number[];
    } catch {
      return null;
    }
  }
  return null;
};

type QuestionRow = {
  id: string;
  paper_id: string;
  q_no: number;
  question_en: string;
  question_hi: string;
  extra_en: string;
  extra_hi: string;
  options: { en: string; hi: string }[];
  correct: number | null;
};

// Past questions not embedded yet get their embeddings (a batch at a time).
export async function embedQuestions(limit = 100): Promise<number> {
  const { data, error } = await from("exam_questions")
    .select("id,paper_id,q_no,question_en,question_hi,extra_en,extra_hi,options,correct")
    .is("embedding", null)
    .eq("deleted", false)
    .limit(limit);
  if (missing(error)) throw new Error(ASKED_NOT_READY);
  fail(error);
  const rows = ((data ?? []) as unknown as QuestionRow[]).filter(
    (q) => q.question_en || q.question_hi,
  );
  if (!rows.length) return 0;
  const vecs = await saathiEmbedMany(
    apiKey(),
    rows.map((q) =>
      questionEmbedText({ ...q, options: Array.isArray(q.options) ? q.options : [] }),
    ),
  );
  for (const [i, q] of rows.entries())
    fail(
      (
        await from("exam_questions")
          .update({ embedding: vecs[i] as unknown as string } as never)
          .eq("id", q.id)
      ).error,
    );
  return rows.length;
}

type StoryRow = {
  id: string;
  headline: string;
  facts: CaFact[];
  content: CaContent | null;
  embedding: unknown;
  asked_hidden?: string[] | null;
};
const STORY_COLS = "id,headline,facts,content,embedding,asked_hidden";

// Links stories to their past questions: the closest questions by meaning,
// then the AI keeps those on the same topic. Every story given is marked
// checked. Returns how many got a question.
export async function linkAsked(stories: StoryRow[]): Promise<number> {
  if (!stories.length) return 0;
  // New papers' questions first.
  for (let i = 0; i < 5 && (await embedQuestions(100)) > 0; i++);
  const near = await Promise.all(
    stories.map(async (s) => {
      const vec = toVec(s.embedding);
      if (!vec) return [] as string[];
      const { data, error } = await supabaseAdmin.rpc(
        "exam_questions_near" as never,
        {
          p_embedding: vec,
          p_count: ASKED_CANDIDATES,
        } as never,
      );
      fail(error);
      const hidden = new Set(s.asked_hidden ?? []);
      return ((data ?? []) as unknown as { id: string; similarity: number }[])
        .filter((r) => r.similarity >= ASKED_CLOSE && !hidden.has(r.id))
        .map((r) => r.id);
    }),
  );
  const ids = [...new Set(near.flat())];
  const questions = new Map<string, QuestionRow & { exam: string; year: number | null }>();
  if (ids.length) {
    const { data, error } = await from("exam_questions")
      .select("id,paper_id,q_no,question_en,question_hi,extra_en,extra_hi,options,correct")
      .in("id", ids);
    fail(error);
    const rows = (data ?? []) as unknown as QuestionRow[];
    const { data: papers } = await from("exam_papers")
      .select("id,exam,exam_date")
      .in("id", [...new Set(rows.map((r) => r.paper_id))]);
    const paperOf = new Map(
      ((papers ?? []) as { id: string; exam: string; exam_date: string | null }[]).map((p) => [
        p.id,
        p,
      ]),
    );
    for (const r of rows) {
      const p = paperOf.get(r.paper_id);
      questions.set(r.id, {
        ...r,
        options: Array.isArray(r.options) ? r.options : [],
        exam: p?.exam ?? "",
        year: p?.exam_date ? Number(p.exam_date.slice(0, 4)) : null,
      });
    }
  }
  const asking = stories
    .map((s, i) => ({ s, qs: near[i].map((id) => questions.get(id)).filter((q) => !!q) }))
    .filter((x) => x.qs.length);
  const linked = new Map<string, AskedQ[]>();
  if (asking.length) {
    const briefs = asking.map(({ s, qs }) => ({
      headline: s.content?.headline.en || s.headline,
      facts: s.facts.map((f) => f.text),
      questions: qs.map((q, n) => ({ n: n + 1, text: questionEmbedText(q).replace(/\n/g, " · ") })),
    }));
    const picks = parseAsked(await saathiComplete(apiKey(), askedMessages(briefs)), briefs);
    asking.forEach(({ s, qs }, i) => {
      const got = picks[i]
        .map((n) => qs[n - 1])
        .map(
          (q): AskedQ => ({
            id: q.id,
            exam: q.exam,
            year: q.year,
            q_no: q.q_no,
            en: [q.question_en, q.extra_en].filter(Boolean).join(" "),
            hi: [q.question_hi, q.extra_hi].filter(Boolean).join(" "),
          }),
        )
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      if (got.length) linked.set(s.id, got);
    });
  }
  for (const s of stories)
    fail(
      (
        await from("ca_items")
          .update({ asked: linked.get(s.id) ?? [], asked_checked: true } as never)
          .eq("id", s.id)
      ).error,
    );
  return linked.size;
}

// After a story is written: its past questions (a failure never blocks it).
export async function linkAskedFor(itemId: string): Promise<void> {
  try {
    const { data, error } = await from("ca_items").select(STORY_COLS).eq("id", itemId).single();
    if (error) return;
    const { count } = await from("exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("deleted", false);
    if (!count) return;
    await linkAsked([data as unknown as StoryRow]);
  } catch (e) {
    console.error("asked before:", e);
  }
}

// One step of linking a month's stories not checked yet.
export async function askedStep(
  month: string,
): Promise<{ checked: number; linked: number; left: number }> {
  const range = monthRange(month);
  const base = () =>
    from("ca_items")
      .select(STORY_COLS, { count: "exact" })
      .gte("issue_date", range.from)
      .lte("issue_date", range.to)
      .eq("status", "included")
      .neq("category", "editorial")
      .eq("asked_checked", false)
      .not("embedding", "is", null);
  const { data, error, count } = await base().order("id").limit(ASKED_BATCH);
  if (missing(error)) throw new Error(ASKED_NOT_READY);
  fail(error);
  const rows = (data ?? []) as unknown as StoryRow[];
  const linked = await linkAsked(rows);
  return { checked: rows.length, linked, left: Math.max(0, (count ?? 0) - rows.length) };
}

// The month's stories checked again (after adding papers); removed links
// stay removed.
export async function recheckAsked(month: string) {
  const range = monthRange(month);
  const { error } = await from("ca_items")
    .update({ asked_checked: false } as never)
    .gte("issue_date", range.from)
    .lte("issue_date", range.to);
  if (missing(error)) throw new Error(ASKED_NOT_READY);
  fail(error);
}

export async function askedOf(itemId: string): Promise<AskedQ[]> {
  const { data, error } = await from("ca_items").select("asked").eq("id", itemId).single();
  if (missing(error)) return [];
  fail(error);
  const asked = (data as { asked?: AskedQ[] | null } | null)?.asked;
  return Array.isArray(asked) ? asked : [];
}

// The editor takes a question off a story: it isn't linked again.
export async function hideAsked(itemId: string, questionId: string): Promise<AskedQ[]> {
  const { data, error } = await from("ca_items")
    .select("asked,asked_hidden")
    .eq("id", itemId)
    .single();
  fail(error);
  const row = data as unknown as { asked?: AskedQ[] | null; asked_hidden?: string[] | null };
  const asked = (row.asked ?? []).filter((q) => q.id !== questionId);
  fail(
    (
      await from("ca_items")
        .update({
          asked,
          asked_hidden: [...new Set([...(row.asked_hidden ?? []), questionId])],
        } as never)
        .eq("id", itemId)
    ).error,
  );
  return asked;
}

// Stories' past questions for print (a custom magazine's copy uses its
// daily story's).
export async function askedForItems(
  items: { id: string; origin_id?: string | null }[],
): Promise<Map<string, AskedQ[]>> {
  const out = new Map<string, AskedQ[]>();
  const ids = [...new Set(items.flatMap((i) => [i.id, i.origin_id].filter(Boolean) as string[]))];
  const found = new Map<string, AskedQ[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await from("ca_items")
      .select("id,asked")
      .in("id", ids.slice(i, i + 150));
    if (error) return out;
    for (const r of (data ?? []) as { id: string; asked?: AskedQ[] | null }[])
      if (Array.isArray(r.asked) && r.asked.length) found.set(r.id, r.asked);
  }
  for (const i of items) {
    const got = found.get(i.id) ?? (i.origin_id ? found.get(i.origin_id) : undefined);
    if (got) out.set(i.id, got);
  }
  return out;
}

// ---------- Coverage meter ----------

// The month's stories per section against the share of current affairs
// questions asked from each (all saved papers, or one body's).
export async function coverage(
  month: string,
  body: string | null,
): Promise<{
  ready: boolean;
  rows: CoverageRow[];
  questions: number;
  unsorted: number;
  papers: number;
  bodies: string[];
}> {
  const range = monthRange(month);
  const stories: Record<string, number> = {};
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("ca_items")
      .select("category")
      .gte("issue_date", range.from)
      .lte("issue_date", range.to)
      .eq("status", "included")
      .neq("category", "editorial")
      .order("id")
      .range(at, at + 999);
    fail(error);
    for (const r of (data ?? []) as { category: string }[])
      stories[r.category] = (stories[r.category] ?? 0) + 1;
    if ((data ?? []).length < 1000) break;
  }
  const { data: papers, error: pErr } = await from("exam_papers").select("id,conducted_by");
  fail(pErr);
  const all = (papers ?? []) as { id: string; conducted_by: string }[];
  const bodies = [...new Set(all.map((p) => p.conducted_by).filter(Boolean))].sort();
  const chosen = all.filter((p) => !body || p.conducted_by === body).map((p) => p.id);
  const asked: Record<string, number> = {};
  let unsorted = 0;
  for (let i = 0; i < chosen.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select("section")
      .in("paper_id", chosen.slice(i, i + 100))
      .eq("ca", true)
      .eq("deleted", false);
    if (missing(error))
      return { ready: false, rows: [], questions: 0, unsorted: 0, papers: 0, bodies };
    fail(error);
    for (const r of (data ?? []) as { section: string | null }[]) {
      if (r.section) asked[r.section] = (asked[r.section] ?? 0) + 1;
      else unsorted++;
    }
  }
  return {
    ready: true,
    rows: coverageRows(stories, asked),
    questions: Object.values(asked).reduce((a, b) => a + b, 0),
    unsorted,
    papers: chosen.length,
    bodies,
  };
}

// Current affairs questions sorted before sections were asked for: their
// section, a batch at a time. Returns how many were sorted.
export async function sortQuestionSections(): Promise<number> {
  const { data, error } = await from("exam_questions")
    .select("id,question_en,question_hi,extra_en,extra_hi")
    .eq("ca", true)
    .eq("deleted", false)
    .is("section", null)
    .limit(30);
  if (missing(error)) throw new Error(ASKED_NOT_READY);
  fail(error);
  const rows = (data ?? []) as {
    id: string;
    question_en: string;
    question_hi: string;
    extra_en: string;
    extra_hi: string;
  }[];
  if (!rows.length) return 0;
  const nums = rows.map((_, i) => i + 1);
  const got = parseSections(
    await saathiComplete(
      apiKey(),
      sectionMessages(
        rows.map((r, i) => ({
          n: i + 1,
          text: [r.question_en || r.question_hi, r.extra_en || r.extra_hi]
            .filter(Boolean)
            .join(" "),
        })),
      ),
    ),
    nums,
  );
  // One the AI couldn't place counts as "misc", so the step moves on.
  for (const [i, r] of rows.entries())
    fail(
      (
        await from("exam_questions")
          .update({ section: got.get(i + 1) ?? "misc" } as never)
          .eq("id", r.id)
      ).error,
    );
  return rows.length;
}
