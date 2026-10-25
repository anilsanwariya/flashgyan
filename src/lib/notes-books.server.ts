// Server-only notes books: one per subject section and stage, with its cover
// and front pages' text; and what the front pages are made from (the master
// outline's chapters, the syllabus lines and the linked past questions).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { childrenOf, type MasterTopic } from "@/lib/outline";
import { listOutlines, sectionOutline } from "@/lib/outline.server";
import { subjectName } from "@/lib/exam-papers";
import { getMagazineSettings } from "@/lib/current-affairs.server";
import {
  normalizeCover,
  normalizeFront,
  pyqAnalysis,
  type BookData,
  type NotesBook,
  type NotesStage,
} from "@/lib/notes-books";
import { bookFrontHtml, type BookContext, type FrontPart } from "@/lib/notes-book-html";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
const missing = (e: { message: string } | null) =>
  !!e && /notes_books.*(does not exist|schema cache)|Could not find the table/.test(e.message);
export const BOOKS_NOT_READY =
  "Notes books need a database update: run the latest migration (notes_books) in Lovable or the SQL editor.";

type Row = {
  id: string;
  section: string;
  stage: NotesStage;
  cover: unknown;
  front: unknown;
  created_at: string;
  updated_at: string;
};
const readBook = (r: Row): NotesBook => ({
  ...r,
  cover: normalizeCover(r.cover, r.stage, r.section),
  front: normalizeFront(r.front, r.stage),
});

export type BookSummary = Pick<NotesBook, "id" | "section" | "stage" | "updated_at"> & {
  design: string;
  color: string;
};

export async function listBooks(): Promise<{
  ready: boolean;
  books: BookSummary[];
  sections: { section: string; topics: number }[];
}> {
  const { data, error } = await from("notes_books")
    .select("id,section,stage,cover,front,created_at,updated_at")
    .order("section")
    .order("stage", { ascending: false });
  if (missing(error)) return { ready: false, books: [], sections: [] };
  fail(error);
  const outlines = await listOutlines().catch(() => ({ ready: false, sections: [] }));
  return {
    ready: true,
    books: ((data ?? []) as unknown as Row[]).map((r) => {
      const b = readBook(r);
      return {
        id: b.id,
        section: b.section,
        stage: b.stage,
        updated_at: b.updated_at,
        design: b.cover.design,
        color: b.cover.color,
      };
    }),
    // Subjects with an outline (a book follows its outline).
    sections: outlines.sections
      .filter((s) => s.topics > 0)
      .map((s) => ({ section: s.section, topics: s.topics })),
  };
}

export async function createBook(section: string, stage: NotesStage): Promise<NotesBook> {
  const { data, error } = await from("notes_books")
    .insert({ section, stage, cover: normalizeCover({}, stage, section), front: {} } as never)
    .select("*")
    .single();
  if (error && /duplicate|unique/i.test(error.message))
    throw new Error(
      `There is already a ${stage === "mains" ? "Mains" : "Prelims"} book for ${section}.`,
    );
  // A missing table can come back as an error with no message.
  if (missing(error) || (error && !error.message)) throw new Error(BOOKS_NOT_READY);
  fail(error);
  return readBook(data as unknown as Row);
}

export async function getBook(id: string): Promise<NotesBook> {
  const { data, error } = await from("notes_books").select("*").eq("id", id).single();
  if (missing(error)) throw new Error(BOOKS_NOT_READY);
  fail(error);
  return readBook(data as unknown as Row);
}

export async function saveBook(
  id: string,
  patch: { cover?: unknown; front?: unknown },
): Promise<NotesBook> {
  const book = await getBook(id);
  const row: Record<string, unknown> = { updated_at: now() };
  if (patch.cover !== undefined) row.cover = normalizeCover(patch.cover, book.stage, book.section);
  if (patch.front !== undefined) row.front = normalizeFront(patch.front, book.stage);
  fail(
    (
      await from("notes_books")
        .update(row as never)
        .eq("id", id)
    ).error,
  );
  return getBook(id);
}

export async function deleteBook(id: string) {
  fail((await from("notes_books").delete().eq("id", id)).error);
}

// ---------- What the front pages show ----------

export async function bookData(book: Pick<NotesBook, "section" | "stage">): Promise<BookData> {
  const { topics, lines } = await sectionOutline(book.section);
  const chapters = childrenOf(topics, null);
  const number = new Map(chapters.map((c, i) => [c.id, i + 1]));
  const byId = new Map(topics.map((t) => [t.id, t]));
  const chapterOf = new Map<string, number>();
  for (const t of topics) {
    let x: MasterTopic | undefined = t;
    while (x && x.parent_id) x = byId.get(x.parent_id);
    if (x && number.has(x.id)) chapterOf.set(t.id, number.get(x.id)!);
  }
  // The book's own exams' lines (and single-stage syllabi).
  const coverage = lines
    .filter((l) => l.stage === book.stage || l.stage === "single")
    .map((l) => ({
      exam: l.exam,
      text: { en: l.text_en, hi: l.text_hi },
      chapters: [
        ...new Set(l.topics.map((id) => chapterOf.get(id)).filter((n): n is number => !!n)),
      ].sort((a, b) => a - b),
    }));
  // Past questions filed under the outline, from this stage's papers.
  const kind = book.stage === "mains" ? "subjective" : "objective";
  const ids = topics.map((t) => t.id);
  const questions: { topic_id: string; paper_id: string; year: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select("master_topic_id,paper_id,deleted,paper:exam_papers(kind,exam_date)")
      .in("master_topic_id", ids.slice(i, i + 100));
    // Before the mains_papers migration nothing is linked.
    if (error) break;
    for (const r of (data ?? []) as unknown as {
      master_topic_id: string;
      paper_id: string;
      deleted: boolean;
      paper: { kind?: string; exam_date: string | null } | null;
    }[]) {
      if (r.deleted || (r.paper?.kind ?? "objective") !== kind) continue;
      const y = Number(r.paper?.exam_date?.slice(0, 4));
      questions.push({ topic_id: r.master_topic_id, paper_id: r.paper_id, year: y || null });
    }
  }
  return {
    chapters: chapters.map((c, i) => ({
      n: i + 1,
      name: { en: c.name_en, hi: c.name_hi },
      topics: childrenOf(topics, c.id).map((x) => ({ en: x.name_en, hi: x.name_hi })),
    })),
    coverage,
    pyq: pyqAnalysis(topics, chapterOf, questions),
  };
}

export async function bookContext(book: NotesBook): Promise<BookContext> {
  const year = new Date(book.created_at || Date.now()).getFullYear();
  const settings = await getMagazineSettings().catch(() => null);
  return {
    subject: { en: book.section, hi: subjectName(book.section, "hi") },
    edition: { en: `Edition ${year}`, hi: `संस्करण ${year}` },
    brand: settings?.brand_line || "FlashGyan",
  };
}

// The cover and front pages as HTML; with a draft (unsaved) cover or front
// text when given, for the live preview.
export async function bookHtml(
  id: string,
  lang: "en" | "hi",
  parts?: FrontPart[],
  draft: { cover?: unknown; front?: unknown } = {},
): Promise<string> {
  const saved = await getBook(id);
  const book: NotesBook = {
    ...saved,
    cover:
      draft.cover !== undefined
        ? normalizeCover(draft.cover, saved.stage, saved.section)
        : saved.cover,
    front: draft.front !== undefined ? normalizeFront(draft.front, saved.stage) : saved.front,
  };
  const onlyCover = parts?.length === 1 && parts[0] === "cover";
  const data = onlyCover
    ? { chapters: [], coverage: [], pyq: pyqAnalysis([], new Map(), []) }
    : await bookData(book);
  return bookFrontHtml(book, lang, await bookContext(book), data, parts);
}
