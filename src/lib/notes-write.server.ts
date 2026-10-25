// Server-only notes writer: each topic of a notes book written by the AI
// from its knowledge base passages (one topic a call), kept as a draft with
// the passages it used; edited and approved by the editor; shown as Layout A
// pages, one topic or the whole book for printing. The topic editor can
// make visuals from the notes, write one part again, add passages (from a
// new search or the editor's own material), and go back to an earlier
// version.
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
  noteFacts,
  normalizeContent,
  parseNotes,
  parsePart,
  partMessages,
  unchecked,
  usedSources,
  writeMessages,
  MAX_PYQS,
  WRITE_PASSAGES,
  type DraftStatus,
  type NoteContent,
  type NotePart,
  type NotePassage,
} from "@/lib/notes-write";
import {
  parseVisual,
  visualMessages,
  VISUAL_LABELS,
  type Visual,
  type VisualType,
} from "@/lib/ca-visuals";
import { VISUAL_SLOTS, type CaFact } from "@/lib/current-affairs";
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

export type TopicQuestion = {
  id: string;
  exam: string;
  q: Bi;
  options: Bi[];
  correct: number | null;
  marks: number | null;
};

// A past question can print: an MCQ with its four options (Prelims) or any
// written question (Mains).
const printable = (q: TopicQuestion) =>
  !q.options.length || (q.options.length === 4 && q.options.every((o) => o.en || o.hi));

// The past questions filed under the book's topics, from its stage's papers.
async function topicQuestions(book: NotesBook, ids: string[]) {
  const kind = book.stage === "mains" ? "subjective" : "objective";
  const out = new Map<string, TopicQuestion[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("exam_questions")
      .select(
        "id,master_topic_id,question_en,question_hi,options,correct,deleted,marks,paper:exam_papers(exam,kind,exam_date)",
      )
      .in("master_topic_id", ids.slice(i, i + 100));
    if (error) break;
    for (const r of (data ?? []) as unknown as {
      id: string;
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
          id: r.id,
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

// The subjects searched for passages (current affairs aren't book material).
async function bookSubjects(): Promise<string[]> {
  const { data: subj } = await from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  return [...new Set(((subj ?? []) as { subject: string }[]).map((x) => x.subject))].filter(
    (s) => s && s !== CA_SUBJECT,
  );
}

type Match = { title: string; subject: string; content: string };

async function searchPassages(query: string, english: string, limit: number): Promise<Match[]> {
  const subjects = await bookSubjects();
  if (!subjects.length) return [];
  const matches = await saathiSearchQuery(
    apiKey(),
    rpc,
    { standalone: query.slice(0, 1500), english },
    subjects,
  )
    .then((m) => relevantMatches(m).slice(0, limit))
    .catch(() => []);
  return matches.map((m) => ({
    title: matchLabel(m),
    subject: m.subject,
    content: m.content.replace(/[ \t]+/g, " ").slice(0, 1800),
  }));
}

async function hindiGuideNow(): Promise<string> {
  const { glossary } = await getMagazineSettings();
  const { hindiGuide } = await import("../../supabase/functions/_shared/ca-hindi.ts");
  return hindiGuide(glossary);
}

type PlanRow = Awaited<ReturnType<typeof getPlan>>["rows"][number];

// Writes one topic: from a new search of the knowledge base, or from the
// passages given (the topic's own, with the editor's material). What the
// editor added that the AI doesn't write (images, visuals, the past
// questions chosen) is kept.
async function writeTopic(
  bookId: string,
  book: NotesBook,
  r: PlanRow,
  opts: { passages?: NotePassage[]; note?: string; keep?: NoteContent | null } = {},
): Promise<boolean> {
  const qs = (await topicQuestions(book, [r.topic_id])).get(r.topic_id) ?? [];
  const passages: NotePassage[] =
    opts.passages ??
    (
      await searchPassages(
        [r.path, r.name.hi, ...r.lines.slice(0, 3), ...qs.slice(0, 2).map((q) => q.q.en || q.q.hi)]
          .filter(Boolean)
          .join("\n"),
        r.path,
        WRITE_PASSAGES,
      )
    ).map((m, i) => ({ k: i + 1, ...m }));
  const messages = writeMessages(
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
    await hindiGuideNow(),
  );
  if (opts.note?.trim())
    messages[1].content += `\n\nThe editor's note: ${opts.note.trim().slice(0, 500)}`;
  const written = parseNotes(await saathiComplete(apiKey(), messages), passages);
  if (!written) return false;
  const keep = opts.keep;
  // New key points: the visuals stay but no longer stand in for any of them.
  const content: NoteContent = keep
    ? {
        ...written,
        images: keep.images,
        pyq_ids: keep.pyq_ids,
        visual_pair: keep.visual_pair,
        visual_below: keep.visual_below,
        visual_beside: keep.visual_beside,
        ...Object.fromEntries(
          VISUAL_SLOTS.flatMap(([key, coversKey]) => [
            [key, keep[key] ?? null],
            [coversKey, []],
          ]),
        ),
      }
    : written;
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
  return true;
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
  const d = have.get(r.topic_id);
  if (d) await snapshot(bookId, r.topic_id, contentOf(d), "Before writing it again", true);
  const ok = await writeTopic(bookId, book, r, { keep: d ? contentOf(d) : null });
  return ok
    ? { done: 1, left: todo.length - 1, missed: [] }
    : { done: 0, left: todo.length - 1, missed: [r.topic_id] };
}

// The topic written again by the editor: from its passages as they are now
// (with any added), or from a new search, with their note to the AI.
export async function rewriteTopic(
  bookId: string,
  topicId: string,
  opts: { fresh: boolean; note?: string },
) {
  const [plan, book, d] = await Promise.all([
    getPlan(bookId),
    getBook(bookId),
    draftOf(bookId, topicId),
  ]);
  const r = plan.rows.find((x) => x.topic_id === topicId);
  if (!r) throw new Error("This topic isn't in the book's outline.");
  await snapshot(bookId, topicId, contentOf(d), "Before writing it again", true);
  const ok = await writeTopic(bookId, book, r, {
    passages: opts.fresh ? undefined : d.passages,
    note: opts.note,
    keep: contentOf(d),
  });
  if (!ok) throw new Error("The AI's notes couldn't be read: try again.");
  return getNote(bookId, topicId);
}

async function draftOf(bookId: string, topicId: string): Promise<DraftRow> {
  const d = (await drafts(bookId, topicId)).get(topicId);
  if (!d) throw new Error("This topic isn't written yet.");
  return d;
}

// ---------- Versions ----------

export type NoteVersion = { at: string; label: string; content: unknown };
const MAX_VERSIONS = 15;
// Hand edits are kept once in a while (every save would crowd out the rest).
const EDIT_GAP_MS = 10 * 60 * 1000;

// The versions kept, newest first; null before the database update adds them.
async function versionsOf(bookId: string, topicId: string): Promise<NoteVersion[] | null> {
  const { data, error } = await from("notes_drafts")
    .select("versions")
    .eq("book_id", bookId)
    .eq("topic_id", topicId)
    .maybeSingle();
  if (error) return null;
  return ((data as { versions?: NoteVersion[] } | null)?.versions ?? []).slice(0, MAX_VERSIONS);
}

// Keeps a version of the notes before they change (forced before the AI
// writes anything; for hand edits, when the last one is a while ago).
async function snapshot(
  bookId: string,
  topicId: string,
  content: NoteContent,
  label: string,
  force: boolean,
) {
  const list = await versionsOf(bookId, topicId);
  if (!list) return;
  if (!force && list[0] && Date.now() - Date.parse(list[0].at) < EDIT_GAP_MS) return;
  const next = [{ at: new Date().toISOString(), label, content }, ...list].slice(0, MAX_VERSIONS);
  await from("notes_drafts")
    .update({ versions: next } as never)
    .eq("book_id", bookId)
    .eq("topic_id", topicId);
}

export async function noteVersion(bookId: string, topicId: string, at: string) {
  const d = await draftOf(bookId, topicId);
  const v = (await versionsOf(bookId, topicId))?.find((x) => x.at === at);
  if (!v) throw new Error("That version isn't kept any more.");
  return { at: v.at, label: v.label, content: normalizeContent(v.content, d.passages.length) };
}

// Back to an earlier version (the notes now are kept as a version first).
export async function restoreNote(bookId: string, topicId: string, at: string) {
  const v = await noteVersion(bookId, topicId, at);
  return saveNote(bookId, topicId, v.content, "Before going back to an earlier version");
}

export async function getNote(bookId: string, topicId: string) {
  const [d, book, plan] = await Promise.all([
    draftOf(bookId, topicId),
    getBook(bookId),
    getPlan(bookId),
  ]);
  const r = plan.rows.find((x) => x.topic_id === topicId);
  const [qs, versions] = await Promise.all([
    topicQuestions(book, [topicId]),
    versionsOf(bookId, topicId),
  ]);
  return {
    topic_id: topicId,
    status: d.status,
    content: contentOf(d),
    passages: d.passages,
    written_at: d.written_at,
    updated_at: d.updated_at,
    topic: r
      ? { number: r.number, name: r.name, path: r.path, chapter: r.chapter, lines: r.lines }
      : null,
    // Every past question filed here, for choosing the ones printed.
    questions: (qs.get(topicId) ?? []).filter(printable),
    // null: the version history needs the database update.
    versions: versions ? versions.map((v) => ({ at: v.at, label: v.label })) : null,
  };
}

// The editor's changes (saved as they go): back to a draft when anything
// changed (approve again after editing). `label` keeps the notes as they
// were as a version first (before an AI part is kept, say).
export async function saveNote(bookId: string, topicId: string, content: unknown, label?: string) {
  const d = await draftOf(bookId, topicId);
  const before = contentOf(d);
  const clean = normalizeContent(content, d.passages.length);
  if (JSON.stringify(clean) !== JSON.stringify(before)) {
    await snapshot(bookId, topicId, before, label ?? "Hand edits", !!label);
    fail(
      (
        await from("notes_drafts")
          .update({
            content: clean,
            status: "draft",
            updated_at: new Date().toISOString(),
          } as never)
          .eq("book_id", bookId)
          .eq("topic_id", topicId)
      ).error,
    );
  }
  return getNote(bookId, topicId);
}

// ---------- The AI on one part ----------

// One part written again, not saved: the editor sees it and keeps it or not.
export async function rewritePart(
  bookId: string,
  topicId: string,
  part: NotePart,
  note: string,
  draft?: unknown,
): Promise<Partial<NoteContent>> {
  const [d, book, plan] = await Promise.all([
    draftOf(bookId, topicId),
    getBook(bookId),
    getPlan(bookId),
  ]);
  const r = plan.rows.find((x) => x.topic_id === topicId);
  const current = draft !== undefined ? normalizeContent(draft, d.passages.length) : contentOf(d);
  const raw = await saathiComplete(
    apiKey(),
    partMessages(
      book.section,
      { number: r?.number ?? "", path: r?.path ?? "", name: r?.name ?? { en: "", hi: "" } },
      part,
      current,
      d.passages,
      note,
      await hindiGuideNow(),
    ),
  );
  const out = parsePart(raw, part, current, d.passages);
  if (!out) throw new Error("The AI's answer couldn't be read: try again.");
  return out;
}

// A visual made from the notes (the key points, or only those picked),
// not saved, as the magazine's editor makes one for a story.
export async function previewNoteVisual(
  bookId: string,
  topicId: string,
  opts: { slot: number; type?: VisualType; note?: string; facts?: number[] },
  draft?: unknown,
): Promise<{ visual: Visual; covers: number[] }> {
  const [d, plan] = await Promise.all([draftOf(bookId, topicId), getPlan(bookId)]);
  const c = draft !== undefined ? normalizeContent(draft, d.passages.length) : contentOf(d);
  const name = plan.rows.find((x) => x.topic_id === topicId)?.name;
  const headline = name ? name.en || name.hi : "";
  const all = noteFacts(c).map(
    (f): CaFact => ({ text: f.text, quote: "", source_id: "", verified: true }),
  );
  const picked = (opts.facts ?? []).filter((i) => i >= 0 && i < c.points.length);
  if (opts.facts && picked.length < 2) throw new Error("Pick at least two key points.");
  const facts = picked.length ? picked.map((i) => all[i]) : all;
  if (facts.length < 2) throw new Error("Write some key points first.");
  const others = VISUAL_SLOTS.filter((_, i) => i !== opts.slot - 1)
    .map(([key]) => c[key])
    .filter((v): v is Visual => !!v);
  const { glossary } = await getMagazineSettings();
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await saathiComplete(
      apiKey(),
      visualMessages({
        glossary,
        headline,
        category: "study notes",
        facts,
        problem,
        type: opts.type,
        note: opts.note?.trim() || undefined,
        others,
        compact: !!c.visual_pair,
        picked: picked.length > 0,
      }),
    );
    const v = parseVisual(raw, facts, headline);
    if (v.visual && (!opts.type || v.visual.type === opts.type))
      // Only key points can be left out of the text (not sections or data).
      return {
        visual: v.visual,
        covers: picked.length ? picked : v.covers.filter((i) => i < c.points.length),
      };
    problem =
      v.problem ?? (v.visual ? `You made a "${v.visual.type}"; make a "${opts.type}".` : undefined);
    if (!problem) break;
  }
  throw new Error(
    opts.type
      ? `SAATHI couldn't make a ${VISUAL_LABELS[opts.type].toLowerCase()} from these notes that passed the number check.`
      : "SAATHI couldn't make a visual from these notes that passed the number check.",
  );
}

// ---------- Passages ----------

// A new search of the knowledge base (the editor's words), less the
// passages the topic already has.
export async function findPassages(bookId: string, topicId: string, query: string) {
  const d = await draftOf(bookId, topicId);
  const have = new Set(d.passages.map((p) => p.content.slice(0, 200)));
  return (await searchPassages(query, query, 10)).filter((m) => !have.has(m.content.slice(0, 200)));
}

// Passages added to the topic (found or the editor's own material), for
// writing a part or the whole topic again from them.
export async function addPassages(
  bookId: string,
  topicId: string,
  items: { title: string; subject: string; content: string }[],
) {
  const d = await draftOf(bookId, topicId);
  const next: NotePassage[] = [
    ...d.passages,
    ...items.map((x, i) => ({
      k: d.passages.length + i + 1,
      title: x.title.trim().slice(0, 200) || "Your material",
      subject: x.subject.trim().slice(0, 80),
      content: x.content
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, 6000),
    })),
  ].slice(0, 30);
  fail(
    (
      await from("notes_drafts")
        .update({ passages: next, updated_at: new Date().toISOString() } as never)
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
      // The ones the editor chose, in their order; else the first that fits.
      pyqs: (content.pyq_ids.length
        ? content.pyq_ids
            .map((id) => list.find((q) => q.id === id))
            .filter((q): q is TopicQuestion => !!q)
        : list.filter((q) => (book.stage === "mains" ? true : q.options.length === 4)).slice(0, 1)
      )
        .filter(printable)
        .slice(0, MAX_PYQS)
        .map(
          (q): TopicPyq => ({
            exam: q.exam,
            q: q.q,
            options: q.options,
            correct: q.correct,
            marks: q.marks,
          }),
        ),
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
