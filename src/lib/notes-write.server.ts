// Server-only notes writer: each topic of a notes book written by the AI
// from its knowledge base passages (one topic a call), kept as a draft with
// the passages it used; edited and approved by the editor; shown as Layout A
// pages, one topic or the whole book for printing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { childrenOf, type MasterTopic } from "@/lib/outline";
import { sectionOutline } from "@/lib/outline.server";
import { bookContext, bookData, getBook } from "@/lib/notes-books.server";
import { getPlan } from "@/lib/notes-plan.server";
import { CA_SUBJECT, getMagazineSettings } from "@/lib/current-affairs.server";
import {
  normalizeContent,
  parseNotes,
  unchecked,
  usedSources,
  writeMessages,
  WRITE_PASSAGES,
  type DraftStatus,
  type NoteContent,
  type NotePassage,
} from "@/lib/notes-write";
import { bookFrontBody, notesDoc } from "@/lib/notes-book-html";
import {
  chapterHtml,
  NOTES_PAGE_CSS,
  reviewNote,
  topicHtml,
  type ChapterPages,
  type TopicPage,
  type TopicPyq,
} from "@/lib/notes-page-html";
import type { Bi } from "@/lib/current-affairs";
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
    /notes_drafts.*(does not exist|schema cache)|Could not find the table/.test(e.message));
export const DRAFTS_NOT_READY =
  "The notes writer needs a database update: run the latest migration (notes_drafts) in Lovable or the SQL editor.";

type DraftRow = {
  topic_id: string;
  content: unknown;
  passages: NotePassage[];
  status: DraftStatus;
  written_at: string;
  updated_at: string;
};

async function drafts(bookId: string, topicId?: string): Promise<Map<string, DraftRow>> {
  let q = from("notes_drafts")
    .select("topic_id,content,passages,status,written_at,updated_at")
    .eq("book_id", bookId);
  if (topicId) q = q.eq("topic_id", topicId);
  const { data, error } = await q;
  if (missing(error)) throw new Error(DRAFTS_NOT_READY);
  fail(error);
  return new Map(((data ?? []) as unknown as DraftRow[]).map((d) => [d.topic_id, d]));
}
const contentOf = (d: DraftRow) => normalizeContent(d.content, d.passages.length);

// The past questions filed under the book's topics, from its stage's papers.
async function topicQuestions(book: NotesBook, ids: string[]) {
  const kind = book.stage === "mains" ? "subjective" : "objective";
  const out = new Map<
    string,
    { exam: string; q: Bi; options: Bi[]; correct: number | null; marks: number | null }[]
  >();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select(
        "master_topic_id,question_en,question_hi,options,correct,deleted,marks,paper:exam_papers(exam,kind,exam_date)",
      )
      .in("master_topic_id", ids.slice(i, i + 100));
    if (error) break;
    for (const r of (data ?? []) as unknown as {
      master_topic_id: string;
      question_en: string;
      question_hi: string;
      options: { en: string; hi: string }[];
      correct: number | null;
      deleted: boolean;
      marks?: number | null;
      paper: { exam: string; kind?: string; exam_date: string | null } | null;
    }[]) {
      if (r.deleted || (r.paper?.kind ?? "objective") !== kind) continue;
      out.set(r.master_topic_id, [
        ...(out.get(r.master_topic_id) ?? []),
        {
          exam: r.paper?.exam ?? "",
          q: { en: r.question_en, hi: r.question_hi },
          options: r.options ?? [],
          correct: r.correct,
          marks: r.marks ?? null,
        },
      ]);
    }
  }
  return out;
}

export type NotesRow = {
  topic_id: string;
  number: string;
  name: Bi;
  chapter: number;
  asked: number;
  coverage: string | null;
  status: DraftStatus | null;
  unchecked: number;
  written_at: string | null;
};

export async function listNotes(bookId: string) {
  const [plan, have] = await Promise.all([getPlan(bookId), drafts(bookId)]);
  const rows: NotesRow[] = plan.rows.map((r) => {
    const d = have.get(r.topic_id);
    return {
      topic_id: r.topic_id,
      number: r.number,
      name: r.name,
      chapter: r.chapter,
      asked: r.asked,
      coverage: r.plan && !r.changed ? r.plan.coverage : null,
      status: d?.status ?? null,
      unchecked: d ? unchecked(contentOf(d)) : 0,
      written_at: d?.written_at ?? null,
    };
  });
  return { chapters: plan.chapters, rows };
}

// The next topics written (those without notes, or those asked for again),
// one a call, in the outline's order. Says how many are left.
export async function writeStep(
  bookId: string,
  opts: { redo?: string[]; skip?: string[] } = {},
): Promise<{ done: number; left: number; missed: string[] }> {
  const [plan, have, book] = await Promise.all([getPlan(bookId), drafts(bookId), getBook(bookId)]);
  const skip = new Set(opts.skip ?? []);
  const todo = plan.rows.filter(
    (r) =>
      !skip.has(r.topic_id) &&
      (opts.redo?.length ? opts.redo.includes(r.topic_id) : !have.has(r.topic_id)),
  );
  const r = todo[0];
  if (!r) return { done: 0, left: 0, missed: [] };
  const qs = (await topicQuestions(book, [r.topic_id])).get(r.topic_id) ?? [];
  const { data: subj } = await from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((subj ?? []) as { subject: string }[]).map((x) => x.subject)),
  ].filter((s) => s && s !== CA_SUBJECT);
  const matches = subjects.length
    ? await saathiSearchQuery(
        apiKey(),
        rpc,
        {
          standalone: [
            r.path,
            r.name.hi,
            ...r.lines.slice(0, 3),
            ...qs.slice(0, 2).map((q) => q.q.en || q.q.hi),
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1500),
          english: r.path,
        },
        subjects,
      )
        .then((m) => relevantMatches(m).slice(0, WRITE_PASSAGES))
        .catch(() => [])
    : [];
  const passages: NotePassage[] = matches.map((m, i) => ({
    k: i + 1,
    title: matchLabel(m),
    subject: m.subject,
    content: m.content.replace(/[ \t]+/g, " ").slice(0, 1800),
  }));
  const { glossary } = await getMagazineSettings();
  const { hindiGuide } = await import("../../supabase/functions/_shared/ca-hindi.ts");
  const content = parseNotes(
    await saathiComplete(
      apiKey(),
      writeMessages(
        book.stage,
        book.section,
        {
          number: r.number,
          path: r.path,
          name: r.name,
          lines: r.lines,
          questions: qs.slice(0, 4).map((q) => `${q.q.en || q.q.hi} (${q.exam})`),
          map: r.plan && !r.changed ? r.plan.map : null,
        },
        passages,
        hindiGuide(glossary),
      ),
    ),
    passages,
  );
  if (!content) return { done: 0, left: todo.length - 1, missed: [r.topic_id] };
  const now = new Date().toISOString();
  const { error } = await from("notes_drafts").upsert(
    {
      book_id: bookId,
      topic_id: r.topic_id,
      content,
      passages,
      status: "draft",
      written_at: now,
      updated_at: now,
    } as never,
    { onConflict: "book_id,topic_id" },
  );
  if (missing(error)) throw new Error(DRAFTS_NOT_READY);
  fail(error);
  return { done: 1, left: todo.length - 1, missed: [] };
}

export async function getNote(bookId: string, topicId: string) {
  const d = (await drafts(bookId, topicId)).get(topicId);
  if (!d) throw new Error("This topic isn't written yet.");
  return {
    topic_id: topicId,
    status: d.status,
    content: contentOf(d),
    passages: d.passages,
    written_at: d.written_at,
    updated_at: d.updated_at,
  };
}

// The editor's changes: back to a draft (approve again after editing).
export async function saveNote(bookId: string, topicId: string, content: unknown) {
  const d = (await drafts(bookId, topicId)).get(topicId);
  if (!d) throw new Error("This topic isn't written yet.");
  const clean = normalizeContent(content, d.passages.length);
  fail(
    (
      await from("notes_drafts")
        .update({ content: clean, status: "draft", updated_at: new Date().toISOString() } as never)
        .eq("book_id", bookId)
        .eq("topic_id", topicId)
    ).error,
  );
  return getNote(bookId, topicId);
}

// Approved only when every line written without a source passage has been
// checked (or replaced).
export async function setNoteStatus(bookId: string, topicId: string, approved: boolean) {
  const note = await getNote(bookId, topicId);
  const left = unchecked(note.content);
  if (approved && left)
    throw new Error(
      `${left} line${left === 1 ? "" : "s"} written without a source must be checked or replaced first.`,
    );
  fail(
    (
      await from("notes_drafts")
        .update({
          status: approved ? "approved" : "draft",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("book_id", bookId)
        .eq("topic_id", topicId)
    ).error,
  );
  return { ok: true };
}

export async function deleteNote(bookId: string, topicId: string) {
  fail((await from("notes_drafts").delete().eq("book_id", bookId).eq("topic_id", topicId)).error);
}

// ---------- Pages ----------

async function pagesFor(bookId: string, only?: string, draft?: unknown) {
  const book = await getBook(bookId);
  const [plan, have, { topics }] = await Promise.all([
    getPlan(bookId),
    drafts(bookId, only),
    sectionOutline(book.section),
  ]);
  const byId = new Map(topics.map((t) => [t.id, t]));
  const rows = plan.rows.filter((r) => (only ? r.topic_id === only : have.has(r.topic_id)));
  const qs = await topicQuestions(
    book,
    rows.map((r) => r.topic_id),
  );
  const page = (r: (typeof rows)[number]): TopicPage | null => {
    const d = have.get(r.topic_id);
    if (!d) return null;
    const t = byId.get(r.topic_id);
    const parent: MasterTopic | undefined = t?.parent_id ? byId.get(t.parent_id) : undefined;
    const list = qs.get(r.topic_id) ?? [];
    const content =
      only && draft !== undefined ? normalizeContent(draft, d.passages.length) : contentOf(d);
    return {
      topic_id: r.topic_id,
      number: r.number,
      name: r.name,
      // The topic above (not the chapter, which heads the chapter).
      parent: parent && parent.parent_id ? { en: parent.name_en, hi: parent.name_hi } : null,
      syllabus: r.lines,
      asked: [
        ...new Set(
          list
            .map((q) => (book.stage === "mains" && q.marks ? `${q.exam} · ${q.marks}` : q.exam))
            .filter(Boolean),
        ),
      ],
      pyqs: list
        .filter((q) => q.options.length === 4 && q.options.every((o) => o.en || o.hi))
        .slice(0, 1)
        .map((q): TopicPyq => ({ exam: q.exam, q: q.q, options: q.options, correct: q.correct })),
      content,
    };
  };
  const chapters: ChapterPages[] = childrenOf(topics, null)
    .map((c, i) => {
      const pages = rows
        .filter((r) => r.chapter === i + 1)
        .map(page)
        .filter((p): p is TopicPage => !!p);
      const sources = [
        ...new Set(
          pages.flatMap((p) => {
            const d = have.get(p.topic_id)!;
            return usedSources(p.content as NoteContent, d.passages);
          }),
        ),
      ];
      return { n: i + 1, name: { en: c.name_en, hi: c.name_hi }, topics: pages, sources };
    })
    .filter((c) => c.topics.length);
  return { book, chapters };
}

// One topic's page (with unsaved changes when given), in the review copy.
export async function noteHtml(
  bookId: string,
  topicId: string,
  lang: "en" | "hi",
  draft?: unknown,
) {
  const { book, chapters } = await pagesFor(bookId, topicId, draft);
  const t = chapters[0]?.topics[0];
  if (!t) throw new Error("This topic isn't written yet.");
  return notesDoc(
    `${reviewNote(lang)}<section class="tp-only">${topicHtml(t, book.stage, lang, true, book.cover.color)}</section>`,
    lang,
    book.cover.color,
    "",
    NOTES_PAGE_CSS,
  );
}

// The whole book: cover, front pages and the written chapters. The student
// copy has only approved topics and no ◇ marks; the review copy has every
// written topic.
export async function bookPrintHtml(bookId: string, lang: "en" | "hi", review: boolean) {
  const { book, chapters } = await pagesFor(bookId);
  const statuses = await drafts(bookId);
  const shown = chapters
    .map((c) => ({
      ...c,
      topics: c.topics.filter((t) => review || statuses.get(t.topic_id)?.status === "approved"),
    }))
    .filter((c) => c.topics.length);
  const [ctx, data] = await Promise.all([bookContext(book), bookData(book)]);
  return notesDoc(
    `${review ? reviewNote(lang) : ""}${bookFrontBody(book, lang, ctx, data)}${shown
      .map((c) => chapterHtml(c, book.stage, lang, review, book.cover.color))
      .join("")}`,
    lang,
    book.cover.color,
    "",
    NOTES_PAGE_CSS,
  );
}
