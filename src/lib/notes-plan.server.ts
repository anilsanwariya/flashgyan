// Server-only notes planner: each topic of a notes book checked against the
// knowledge base (a few topics a call), and the plan read back with the
// topics' past questions, what to upload next and the maps the notes need.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { childrenOf, numbering, type MasterTopic } from "@/lib/outline";
import { sectionOutline } from "@/lib/outline.server";
import { getBook } from "@/lib/notes-books.server";
import { CA_SUBJECT } from "@/lib/current-affairs.server";
import {
  parsePlan,
  planMessages,
  planSig,
  PLAN_BATCH,
  priority,
  uploadList,
  type PlanItem,
  type PlanSource,
  type TopicPlan,
} from "@/lib/notes-plan";
import type { NotesBook } from "@/lib/notes-books";

const from = (table: string) => supabaseAdmin.from(table as never);
const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const missing = (e: { message: string } | null) =>
  !!e &&
  (!e.message ||
    /notes_topic_plans.*(does not exist|schema cache)|Could not find the table/.test(e.message));
export const PLANS_NOT_READY =
  "The notes planner needs a database update: run the latest migration (notes_plans) in Lovable or the SQL editor.";

export type PlanRow = PlanItem & {
  plan: TopicPlan | null;
  // The topic's place or lines changed since it was checked.
  changed: boolean;
  // Material was added to the knowledge base after it was checked.
  stale: boolean;
  priority: number;
};

type Built = {
  book: NotesBook;
  rows: PlanRow[];
  questions: Map<string, string[]>;
  kbUpdated: string | null;
};

// The book's topics to plan (those with nothing under them), in outline
// order, with their lines, past questions and plans.
async function build(bookId: string): Promise<Built> {
  const book = await getBook(bookId);
  const { topics, lines } = await sectionOutline(book.section);
  const nums = numbering(topics);
  const byId = new Map(topics.map((t) => [t.id, t]));
  const order: MasterTopic[] = [];
  const walk = (parent: string | null) =>
    childrenOf(topics, parent).forEach((t) => {
      order.push(t);
      walk(t.id);
    });
  walk(null);
  const hasChildren = new Set(topics.map((t) => t.parent_id).filter(Boolean));
  const ancestors = (t: MasterTopic) => {
    const out: MasterTopic[] = [];
    for (
      let x = t.parent_id ? byId.get(t.parent_id) : undefined;
      x;
      x = x.parent_id ? byId.get(x.parent_id) : undefined
    )
      out.unshift(x);
    return out;
  };
  const chapterNo = new Map(childrenOf(topics, null).map((c, i) => [c.id, i + 1]));
  // The book's own exams' lines.
  const stageLines = lines.filter((l) => l.stage === book.stage || l.stage === "single");
  // Past questions on each topic, from this stage's papers.
  const kind = book.stage === "mains" ? "subjective" : "objective";
  const asked = new Map<string, string[]>();
  const ids = topics.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select("master_topic_id,question_en,question_hi,deleted,paper:exam_papers(kind)")
      .in("master_topic_id", ids.slice(i, i + 100));
    if (error) break;
    for (const r of (data ?? []) as unknown as {
      master_topic_id: string;
      question_en: string;
      question_hi: string;
      deleted: boolean;
      paper: { kind?: string } | null;
    }[]) {
      if (r.deleted || (r.paper?.kind ?? "objective") !== kind) continue;
      asked.set(r.master_topic_id, [
        ...(asked.get(r.master_topic_id) ?? []),
        (r.question_en || r.question_hi).slice(0, 200),
      ]);
    }
  }
  const { data: planData, error: planErr } = await from("notes_topic_plans")
    .select("topic_id,coverage,missing,sources,map,upload,sig,checked_at")
    .eq("book_id", bookId);
  if (missing(planErr)) throw new Error(PLANS_NOT_READY);
  fail(planErr);
  const plans = new Map(((planData ?? []) as unknown as TopicPlan[]).map((p) => [p.topic_id, p]));
  const { data: kb } = await from("saathi_knowledge")
    .select("updated_at,created_at,subject")
    .is("parent_id", null)
    .neq("subject", CA_SUBJECT)
    .order("updated_at", { ascending: false })
    .limit(1);
  const last = ((kb ?? []) as { updated_at: string | null; created_at: string }[])[0];
  const kbUpdated = last ? last.updated_at || last.created_at : null;

  const questions = new Map<string, string[]>();
  const rows = order
    .filter((t) => !hasChildren.has(t.id))
    .map((t): PlanRow => {
      const up = ancestors(t);
      const chain = [...up, t];
      const own = new Set(chain.map((x) => x.id));
      const myLines = [
        ...new Set(
          stageLines
            .filter((l) => l.topics.some((id) => own.has(id)))
            .map((l) => `${l.text_en || l.text_hi} (${l.exam})`),
        ),
      ];
      const qs = asked.get(t.id) ?? [];
      questions.set(t.id, qs);
      const path = chain.map((x) => x.name_en || x.name_hi).join(" › ");
      const sig = planSig(path, myLines);
      const plan = plans.get(t.id) ?? null;
      return {
        topic_id: t.id,
        number: nums.get(t.id) ?? "",
        name: { en: t.name_en, hi: t.name_hi },
        path,
        chapter: chapterNo.get(chain[0].id) ?? 0,
        asked: qs.length,
        lines: myLines,
        plan,
        changed: !!plan && plan.sig !== sig,
        stale: !!plan && !!kbUpdated && kbUpdated > plan.checked_at,
        priority: priority(qs.length, myLines.length, plan?.coverage ?? null),
      };
    });
  return { book, rows, questions, kbUpdated };
}

export async function getPlan(bookId: string) {
  const { book, rows, kbUpdated } = await build(bookId);
  const { topics } = await sectionOutline(book.section);
  return {
    book: { id: book.id, section: book.section, stage: book.stage },
    chapters: childrenOf(topics, null).map((c, i) => ({
      n: i + 1,
      name: { en: c.name_en, hi: c.name_hi },
    })),
    rows,
    uploads: uploadList(
      rows
        .filter((r) => r.plan)
        .map((r) => ({ number: r.number, priority: r.priority, upload: r.plan!.upload })),
    ).slice(0, 15),
    kbUpdated,
  };
}

// The next topics checked against the knowledge base: those not checked yet
// (or changed since); asked for again; or, re-checking, those not fully
// covered that were checked before `since`. Most asked first.
export async function planStep(
  bookId: string,
  opts: { redo?: string[]; since?: string; skip?: string[] } = {},
): Promise<{ done: number; left: number; missed: string[] }> {
  const { book, rows, questions } = await build(bookId);
  const skip = new Set(opts.skip ?? []);
  const todo = rows
    .filter((r) => !skip.has(r.topic_id))
    .filter((r) =>
      opts.redo?.length
        ? opts.redo.includes(r.topic_id)
        : opts.since
          ? !!r.plan &&
            r.plan.checked_at < opts.since &&
            (r.plan.coverage !== "full" || r.stale || r.changed)
          : !r.plan || r.changed,
    )
    .sort((a, b) => b.asked * 2 + b.lines.length - (a.asked * 2 + a.lines.length));
  const batch = todo.slice(0, PLAN_BATCH);
  if (!batch.length) return { done: 0, left: 0, missed: [] };
  const { data: subj } = await from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((subj ?? []) as { subject: string }[]).map((r) => r.subject)),
  ].filter((s) => s && s !== CA_SUBJECT);
  let k = 0;
  const found = await Promise.all(
    batch.map(async (r) => {
      const qs = questions.get(r.topic_id) ?? [];
      const matches = subjects.length
        ? await saathiSearchQuery(
            apiKey(),
            rpc,
            {
              standalone: [r.path, r.name.hi, ...r.lines.slice(0, 3), ...qs.slice(0, 2)]
                .filter(Boolean)
                .join("\n")
                .slice(0, 1500),
              english: r.path,
            },
            subjects,
          )
            .then((m) => relevantMatches(m).slice(0, 5))
            .catch(() => [])
        : [];
      const sources: PlanSource[] = [];
      for (const m of matches) {
        const title = matchLabel(m);
        if (!sources.some((s) => s.title === title)) sources.push({ title, subject: m.subject });
      }
      return {
        r,
        sources: sources.slice(0, 4),
        passages: matches.map((m) => ({
          k: ++k,
          title: matchLabel(m),
          content: m.content.replace(/\s+/g, " ").slice(0, 700),
        })),
      };
    }),
  );
  const out = parsePlan(
    await saathiComplete(
      apiKey(),
      planMessages(
        book.stage,
        book.section,
        found.map(({ r, passages }, i) => ({
          n: i + 1,
          title: `${r.number} ${r.path}${r.name.hi ? ` | ${r.name.hi}` : ""}`,
          lines: r.lines,
          asked: r.asked,
          questions: (questions.get(r.topic_id) ?? []).slice(0, 2),
          passages,
        })),
      ),
    ),
    found.map((_, i) => i + 1),
  );
  const now = new Date().toISOString();
  const save = found.flatMap(({ r, sources }, i) => {
    const p = out.get(i + 1);
    if (!p) return [];
    return [
      {
        book_id: bookId,
        topic_id: r.topic_id,
        coverage: p.coverage,
        missing: p.missing,
        sources,
        map: p.map,
        upload: p.upload,
        sig: planSig(r.path, r.lines),
        checked_at: now,
      },
    ];
  });
  if (save.length) {
    const { error } = await from("notes_topic_plans").upsert(save as never, {
      onConflict: "book_id,topic_id",
    });
    if (missing(error)) throw new Error(PLANS_NOT_READY);
    fail(error);
  }
  return {
    done: save.length,
    left: todo.length - batch.length,
    missed: found.filter((_, i) => !out.has(i + 1)).map(({ r }) => r.topic_id),
  };
}
