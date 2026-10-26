// Server-only flashcard studio: templates, topics and cards; reading a sheet
// into a topic, numbering its chunks once, and keeping the app's ids.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiSearchQuery,
  type SaathiImage,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { parseReply, readMessages, type ReadResult, type Todo } from "@/lib/flash-read";
import * as M from "@/lib/flash-merge";
import * as L from "@/lib/flash-lint";
import * as SH from "@/lib/flash-sheets";
import * as S from "@/lib/flash-split";
import {
  DEFAULT_TEMPLATES,
  lastNumbers,
  matchAppIds,
  newColumnId,
  normalizeBooks,
  normalizeChunks,
  normalizeColumns,
  normalizeEx,
  normalizeExamples,
  normalizeSources,
  normalizeVariants,
  normalizeAi,
  cardSig,
  needsCheck,
  fieldText,
  doneOf,
  type AiFix,
  planNumbers,
  wordKeyOf,
  BOOK_COLORS,
  type FlashCard,
  type FlashColumn,
  type FlashTemplate,
  type FlashSourceRow,
  type FlashTopic,
  type FlashVariant,
  type IdMatch,
  type SheetCard,
  type WordKey,
} from "@/lib/flash-studio";

const from = (table: string) => supabaseAdmin.from(table as never);
const missing = (e: { message: string } | null) =>
  !!e &&
  /flash_(templates|topics|cards|sources).*(does not exist|schema cache)|Could not find the table/.test(
    e.message,
  );
export const STUDIO_NOT_READY =
  "The flashcard studio needs a database update: run the latest migration (flash_studio) in Lovable or the SQL editor.";
const fail = (e: { message: string } | null) => {
  if (missing(e)) throw new Error(STUDIO_NOT_READY);
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();

type Row = Record<string, unknown>;

const readTemplate = (r: Row): FlashTemplate => ({
  id: String(r.id),
  key: String(r.key),
  name: String(r.name),
  prompt: String(r.prompt ?? ""),
  columns: normalizeColumns(r.columns),
  word_key: wordKeyOf(r.word_key),
  examples: normalizeExamples(r.examples),
  sort: Number(r.sort) || 0,
});

const readTopic = (r: Row): FlashTopic => ({
  id: String(r.id),
  name: String(r.name),
  template_id: (r.template_id as string) ?? null,
  prompt: String(r.prompt ?? ""),
  columns: normalizeColumns(r.columns),
  word_key: wordKeyOf(r.word_key),
  books: normalizeBooks(r.books),
  chunks: normalizeChunks(r.chunks),
  locked_at: (r.locked_at as string) ?? null,
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

const readCard = (r: Row): FlashCard => ({
  id: String(r.id),
  topic_id: String(r.topic_id),
  pos: Number(r.pos) || 0,
  prompt: typeof r.prompt === "string" ? r.prompt : null,
  front: String(r.front ?? ""),
  back: String(r.back ?? ""),
  back_hint: String(r.back_hint ?? ""),
  is_revealed: r.is_revealed === true,
  word_key: r.word_key === null || r.word_key === undefined ? null : wordKeyOf(r.word_key),
  ex: normalizeEx(r.ex),
  own: Array.isArray(r.own) ? r.own.filter((x): x is string => typeof x === "string") : [],
  sources: normalizeSources(r.sources),
  variants: normalizeVariants(r.variants),
  note: String(r.note ?? ""),
  error: r.error === true,
  error_type: String(r.error_type ?? ""),
  verified: r.verified === true,
  removed: r.removed === true,
  chunk: typeof r.chunk === "number" ? r.chunk : null,
  card_order: typeof r.card_order === "number" ? r.card_order : null,
  app_id: typeof r.app_id === "string" && r.app_id ? r.app_id : null,
  ai: normalizeAi(r.ai),
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

// ---------- Templates ----------

export async function listTemplates(): Promise<FlashTemplate[]> {
  const { data, error } = await from("flash_templates").select("*").order("sort");
  fail(error);
  const rows = (data ?? []) as Row[];
  // The deck types the finished sheets use, added the first time.
  if (!rows.length) {
    const { error: e } = await from("flash_templates").insert(DEFAULT_TEMPLATES as never);
    fail(e);
    return listTemplates();
  }
  return rows.map(readTemplate);
}

export async function saveTemplate(t: {
  id?: string;
  name: string;
  prompt: string;
  columns: FlashColumn[];
  word_key: WordKey;
}): Promise<FlashTemplate> {
  const row = {
    name: t.name.trim() || "Deck type",
    prompt: t.prompt,
    columns: normalizeColumns(t.columns),
    word_key: t.word_key,
    updated_at: now(),
  };
  const q = t.id
    ? from("flash_templates")
        .update(row as never)
        .eq("id", t.id)
    : from("flash_templates").insert({
        ...row,
        key: `own-${Date.now().toString(36)}`,
        sort: 100,
      } as never);
  const { data, error } = await q.select("*").single();
  fail(error);
  return readTemplate(data as unknown as Row);
}

export async function deleteTemplate(id: string) {
  fail((await from("flash_templates").delete().eq("id", id)).error);
}

// ---------- Topics ----------

export type TopicSummary = FlashTopic & {
  total: number;
  verified: number;
  errors: number;
  numbered: number;
  withId: number;
  removed: number;
};

export async function listTopics(): Promise<TopicSummary[]> {
  const { data, error } = await from("flash_topics").select("*").order("updated_at", {
    ascending: false,
  });
  fail(error);
  const topics = ((data ?? []) as Row[]).map(readTopic);
  const counts = new Map<string, Omit<TopicSummary, keyof FlashTopic>>();
  for (const t of topics)
    counts.set(t.id, { total: 0, verified: 0, errors: 0, numbered: 0, withId: 0, removed: 0 });
  // Counted in pages (a topic can have thousands of cards).
  for (let page = 0; ; page++) {
    const { data: cards, error: e } = await from("flash_cards")
      .select("topic_id, verified, error, removed, card_order, app_id")
      .range(page * 1000, page * 1000 + 999);
    fail(e);
    for (const c of (cards ?? []) as Row[]) {
      const n = counts.get(String(c.topic_id));
      if (!n) continue;
      if (c.removed) {
        n.removed++;
        continue;
      }
      n.total++;
      if (c.verified) n.verified++;
      if (c.error) n.errors++;
      if (c.card_order !== null) n.numbered++;
      if (c.app_id) n.withId++;
    }
    if ((cards ?? []).length < 1000) break;
  }
  return topics.map((t) => ({ ...t, ...counts.get(t.id)! }));
}

export async function createTopic(name: string, templateId: string | null): Promise<FlashTopic> {
  let base = { prompt: "", columns: [] as FlashColumn[], word_key: "" as WordKey };
  if (templateId) {
    const { data, error } = await from("flash_templates").select("*").eq("id", templateId).single();
    fail(error);
    const t = readTemplate(data as unknown as Row);
    base = { prompt: t.prompt, columns: t.columns, word_key: t.word_key };
  }
  const { data, error } = await from("flash_topics")
    .insert({ name: name.trim(), template_id: templateId, ...base } as never)
    .select("*")
    .single();
  fail(error);
  return readTopic(data as unknown as Row);
}

async function topicRow(id: string): Promise<FlashTopic> {
  const { data, error } = await from("flash_topics").select("*").eq("id", id).single();
  fail(error);
  return readTopic(data as unknown as Row);
}

async function topicCards(id: string): Promise<FlashCard[]> {
  const out: FlashCard[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await from("flash_cards")
      .select("*")
      .eq("topic_id", id)
      .order("pos")
      .range(page * 1000, page * 1000 + 999);
    fail(error);
    out.push(...((data ?? []) as Row[]).map(readCard));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function getTopic(id: string) {
  const [topic, cards, sources] = await Promise.all([
    topicRow(id),
    topicCards(id),
    listSources(id),
  ]);
  return { topic, cards, sources };
}

export async function updateTopic(
  id: string,
  patch: Partial<Pick<FlashTopic, "name" | "prompt" | "columns" | "word_key" | "books">>,
): Promise<FlashTopic> {
  const row: Row = { updated_at: now() };
  if (patch.name !== undefined) row.name = patch.name.trim() || "Topic";
  if (patch.prompt !== undefined) row.prompt = patch.prompt;
  if (patch.columns !== undefined) row.columns = normalizeColumns(patch.columns);
  if (patch.word_key !== undefined) row.word_key = patch.word_key;
  if (patch.books !== undefined) row.books = normalizeBooks(patch.books);
  const { data, error } = await from("flash_topics")
    .update(row as never)
    .eq("id", id)
    .select("*")
    .single();
  fail(error);
  return readTopic(data as unknown as Row);
}

export async function deleteTopic(id: string) {
  fail((await from("flash_topics").delete().eq("id", id)).error);
}

const touch = (id: string) =>
  from("flash_topics")
    .update({ updated_at: now() } as never)
    .eq("id", id);

async function insertCards(rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await from("flash_cards").insert(rows.slice(i, i + 500) as never);
    fail(error);
  }
}

// ---------- Reading a sheet into a topic ----------

export type ImportResult = {
  added: number;
  columnsAdded: string[];
  booksAdded: string[];
  numbered: boolean;
};

// A sheet's cards added to a topic: its explanation columns matched by title
// (new ones added), its books added to the topic's. `keepNumbers` keeps the
// sheet's chunks and numbers (a topic finished and uploaded before); only
// for a topic with no numbers yet.
export async function importSheet(
  topicId: string,
  sheet: { cards: SheetCard[]; columns: string[]; prompt: string; book: string; name?: string },
  keepNumbers: boolean,
  // A sheet added before, replaced by this one (its cards not yet
  // numbered go; numbered ones stay, their numbers being in the app).
  replace?: string,
): Promise<ImportResult> {
  if (replace) await deleteSource(replace);
  const { topic, cards } = await getTopic(topicId);
  const columns = [...topic.columns];
  const columnsAdded: string[] = [];
  const idOf = new Map(columns.map((c) => [c.title.trim(), c.id]));
  for (const title of sheet.columns) {
    const t = title.trim();
    if (!t || idOf.has(t)) continue;
    const id = newColumnId(columns);
    columns.push({ id, title: t, hint: "" });
    idOf.set(t, id);
    columnsAdded.push(t);
  }
  const books = [...topic.books];
  const booksAdded: string[] = [];
  for (const c of sheet.cards) {
    const code = (c.book || sheet.book).trim();
    if (code && !books.some((b) => b.code === code)) {
      books.push({ code, name: "", color: BOOK_COLORS[books.length % BOOK_COLORS.length] });
      booksAdded.push(code);
    }
  }
  const prompt = topic.prompt || sheet.prompt;
  if (keepNumbers) {
    if (cards.some((c) => c.card_order !== null) || topic.chunks.length)
      throw new Error(
        "This topic already has numbered chunks: add the cards without their numbers.",
      );
    if (sheet.cards.some((c) => c.sheet === null || c.order === null))
      throw new Error("Every card needs a sheet and an order to keep the numbers.");
  }
  const start = cards.reduce((m, c) => Math.max(m, c.pos + 1), 0);
  // The sheet kept as one of the topic's sources (shown in its Sheets tab).
  const sheetBooks = [
    ...new Set(sheet.cards.map((c) => (c.book || sheet.book).trim()).filter(Boolean)),
  ];
  let src: string | null = null;
  {
    const { data, error } = await from("flash_sources")
      .insert({
        topic_id: topicId,
        book: sheetBooks.join(", ").slice(0, 60) || "—",
        name: (sheet.name ?? "").slice(0, 200),
        kind: "sheet",
        total: 1,
        done: 1,
        cards: sheet.cards.length,
        context: { parts: [1], rows: sheet.cards.length, deleted: 0, merged: 0 },
      } as never)
      .select("id")
      .single();
    // Before the sheet migration: added without being kept as a source.
    if (!error) src = String((data as unknown as Row).id);
  }
  const rows: Row[] = sheet.cards.map((c, i) => {
    const ex: Record<string, string> = {};
    for (const [title, v] of Object.entries(c.ex)) {
      const id = idOf.get(title.trim());
      if (id && v) ex[id] = v;
    }
    const book = (c.book || sheet.book).trim();
    return {
      topic_id: topicId,
      pos: start + i,
      prompt: c.prompt && c.prompt !== prompt ? c.prompt : null,
      front: c.front,
      back: c.back,
      back_hint: c.back_hint,
      is_revealed: c.is_revealed,
      word_key: c.word_key || null,
      ex,
      sources: book || src ? [{ book, pos: c.book_order, ...(src ? { src } : {}) }] : [],
      error: c.error,
      error_type: c.error_type,
      chunk: keepNumbers ? c.sheet : null,
      card_order: keepNumbers ? c.order : null,
      app_id: c.app_id || null,
    };
  });
  const topicPatch: Row = { columns, books, prompt, updated_at: now() };
  if (keepNumbers) {
    const byChunk = new Map<number, number[]>();
    for (const c of sheet.cards)
      byChunk.set(c.sheet!, [...(byChunk.get(c.sheet!) ?? []), c.order!]);
    topicPatch.chunks = [...byChunk]
      .map(([n, list]) => ({ n, from: Math.min(...list), to: Math.max(...list) }))
      .sort((a, b) => a.n - b.n);
    topicPatch.locked_at = now();
  }
  await insertCards(rows);
  fail(
    (
      await from("flash_topics")
        .update(topicPatch as never)
        .eq("id", topicId)
    ).error,
  );
  return { added: rows.length, columnsAdded, booksAdded, numbered: keepNumbers };
}

// ---------- Cards ----------

export type CardPatch = Partial<
  Pick<
    FlashCard,
    | "prompt"
    | "front"
    | "back"
    | "back_hint"
    | "is_revealed"
    | "word_key"
    | "ex"
    | "own"
    | "error"
    | "error_type"
    | "verified"
    | "removed"
    | "note"
    | "ai"
  >
>;

export async function saveCard(id: string, patch: CardPatch): Promise<FlashCard> {
  const { data: old, error: e0 } = await from("flash_cards").select("*").eq("id", id).single();
  fail(e0);
  const before = readCard(old as unknown as Row);
  if (patch.removed && before.card_order === null)
    throw new Error("A card without a number is deleted, not removed");
  const row: Row = { ...patch, updated_at: now() };
  if (patch.ex) row.ex = normalizeEx(patch.ex);
  // Text changes are kept (the last 20).
  if (["front", "back", "ex"].some((k) => k in patch)) {
    const history = Array.isArray((old as unknown as Row).history)
      ? ((old as unknown as Row).history as unknown[])
      : [];
    row.history = [
      { at: now(), front: before.front, back: before.back, ex: before.ex },
      ...history,
    ].slice(0, 20);
  }
  const { data, error } = await from("flash_cards")
    .update(row as never)
    .eq("id", id)
    .select("*")
    .single();
  fail(error);
  await touch(before.topic_id);
  return readCard(data as unknown as Row);
}

export async function addCard(topicId: string): Promise<FlashCard> {
  const { data: last } = await from("flash_cards")
    .select("pos")
    .eq("topic_id", topicId)
    .order("pos", { ascending: false })
    .limit(1);
  const pos = ((last ?? []) as Row[])[0] ? Number(((last ?? []) as Row[])[0].pos) + 1 : 0;
  const { data, error } = await from("flash_cards")
    .insert({ topic_id: topicId, pos } as never)
    .select("*")
    .single();
  fail(error);
  await touch(topicId);
  return readCard(data as unknown as Row);
}

// A card not yet numbered is deleted; a numbered one is marked removed (its
// number is never used again).
export async function deleteCard(id: string): Promise<"deleted" | "removed"> {
  const { data, error } = await from("flash_cards").select("*").eq("id", id).single();
  fail(error);
  const card = readCard(data as unknown as Row);
  if (card.card_order === null) {
    await deleteKept([id], "deleted");
    await countFor(card.sources[0]?.src, "deleted");
    await touch(card.topic_id);
    return "deleted";
  }
  await saveCard(id, { removed: true });
  return "removed";
}

// ---------- Numbering ----------

// The cards without numbers shuffled, split into chunks of the given sizes
// and numbered on from the topic's last number. Done once per card.
// `only`: just these cards (an alphabetical range), the rest left for later.
export async function numberCards(topicId: string, sizes: number[], seed: number, only?: string[]) {
  const { topic, cards } = await getTopic(topicId);
  const ids = cards
    .filter((c) => c.card_order === null && !c.removed && (!only || only.includes(c.id)))
    .map((c) => c.id);
  if (!ids.length) throw new Error("Every card already has its number");
  const { numbers, chunks } = planNumbers(ids, sizes, seed, lastNumbers(topic, cards));
  const rows = numbers.map((n) => ({ topic_id: topicId, ...n, updated_at: now() }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await from("flash_cards").upsert(rows.slice(i, i + 500) as never, {
      onConflict: "id",
    });
    fail(error);
  }
  const { error } = await from("flash_topics")
    .update({
      chunks: [...topic.chunks, ...chunks],
      locked_at: topic.locked_at ?? now(),
      updated_at: now(),
    } as never)
    .eq("id", topicId);
  fail(error);
  return chunks;
}

// The app's export: each row's id kept against the card with that number.
export async function saveAppIds(
  topicId: string,
  rows: Pick<SheetCard, "order" | "front" | "app_id">[],
): Promise<IdMatch> {
  const cards = await topicCards(topicId);
  const match = matchAppIds(cards, rows);
  const out = match.saved.map((s) => ({ id: s.card, topic_id: topicId, app_id: s.app_id }));
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await from("flash_cards").upsert(out.slice(i, i + 500) as never, {
      onConflict: "id",
    });
    fail(error);
  }
  if (out.length) await touch(topicId);
  return match;
}

// ---------- Reading books with the AI ----------

// The parts (or pages) already read, 1-based. Older rows kept a count.
const partsDone = (r: Row): number[] => {
  const ctx = (r.context ?? {}) as { parts?: unknown };
  if (Array.isArray(ctx.parts)) return ctx.parts.filter((n): n is number => typeof n === "number");
  return Array.from({ length: Number(r.done) || 0 }, (_, i) => i + 1);
};

const readSource = (r: Row): FlashSourceRow => ({
  id: String(r.id),
  topic_id: String(r.topic_id),
  book: String(r.book),
  name: String(r.name ?? ""),
  kind: (["word", "pdf", "text", "sheet"].includes(String(r.kind))
    ? r.kind
    : "text") as FlashSourceRow["kind"],
  total: Number(r.total) || 0,
  done: partsDone(r).length,
  parts: partsDone(r),
  cards: Number(r.cards) || 0,
  todos: Array.isArray(r.todos) ? (r.todos as FlashSourceRow["todos"]) : [],
  error: typeof r.error === "string" ? r.error : null,
  rows: Number((r.context as { rows?: number })?.rows) || 0,
  deleted: Number((r.context as { deleted?: number })?.deleted) || 0,
  merged: Number((r.context as { merged?: number })?.merged) || 0,
  created_at: String(r.created_at),
});

const SOURCE_COLS =
  "id,topic_id,book,name,kind,total,done,cards,todos,error,context,created_at,updated_at";

// The books read into a topic (none before the flash_sources migration).
export async function listSources(topicId: string): Promise<FlashSourceRow[]> {
  const { data, error } = await from("flash_sources")
    .select(SOURCE_COLS)
    .eq("topic_id", topicId)
    .order("created_at");
  if (missing(error)) return [];
  fail(error);
  return ((data ?? []) as Row[]).map(readSource);
}

// Each part's cards get positions of their own (part × 1000 on from the
// book's start), so parts read at the same time still sort in the book's
// order.
const PART_SPAN = 1000;

// A book to read: a Word file or pasted text in parts, or a PDF's page
// count (its pages are sent one at a time). Its book joins the topic's.
export async function addSource(
  topicId: string,
  s: {
    book: string;
    name: string;
    kind: FlashSourceRow["kind"];
    pieces: string[];
    pages: number;
    todos: Todo[];
  },
): Promise<FlashSourceRow> {
  const book = s.book.trim();
  if (!book) throw new Error("Give the book's short name");
  const total = s.kind === "pdf" ? s.pages : s.pieces.length;
  if (!total) throw new Error("Nothing to read in this file");
  const topic = await topicRow(topicId);
  if (!topic.books.some((b) => b.code === book))
    await updateTopic(topicId, {
      books: [
        ...topic.books,
        { code: book, name: "", color: BOOK_COLORS[topic.books.length % BOOK_COLORS.length] },
      ],
    });
  // After every card and every other book's reserved positions.
  const { data: last } = await from("flash_cards")
    .select("pos")
    .eq("topic_id", topicId)
    .order("pos", { ascending: false })
    .limit(1);
  const { data: others } = await from("flash_sources").select("context").eq("topic_id", topicId);
  const base = Math.max(
    ((last ?? []) as Row[])[0] ? Number(((last ?? []) as Row[])[0].pos) + 1 : 0,
    ...((others ?? []) as Row[]).map((o) => Number((o.context as { end?: number })?.end) || 0),
  );
  const { data, error } = await from("flash_sources")
    .insert({
      topic_id: topicId,
      book,
      name: s.name.slice(0, 200),
      kind: s.kind,
      pieces: s.kind === "pdf" ? [] : s.pieces,
      total,
      todos: s.todos.slice(0, 500),
      context: { parts: [], base, end: base + total * PART_SPAN },
    } as never)
    .select(SOURCE_COLS)
    .single();
  fail(error);
  return readSource(data as unknown as Row);
}

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

// Changes a book's row only if no one else changed it meanwhile (parts are
// read three at a time), trying again on a clash.
async function updateSource(id: string, change: (r: Row) => Row): Promise<Row> {
  for (let i = 0; i < 8; i++) {
    const { data, error } = await from("flash_sources").select(SOURCE_COLS).eq("id", id).single();
    fail(error);
    const row = data as unknown as Row;
    const { data: saved, error: e2 } = await from("flash_sources")
      .update({ ...change(row), updated_at: now() } as never)
      .eq("id", id)
      .eq("updated_at", String(row.updated_at))
      .select(SOURCE_COLS);
    fail(e2);
    if (((saved ?? []) as Row[]).length) return ((saved ?? []) as Row[])[0];
    await new Promise((ok) => setTimeout(ok, 50 + Math.random() * 150));
  }
  throw new Error("The book is busy; try again");
}

// One part (or the given PDF page; by default the first not read yet)
// read by the AI into cards, kept in the book's order. When the last part
// is in, the cards are numbered in the book's order.
export async function readSourceStep(
  sourceId: string,
  part?: number,
  image?: SaathiImage,
): Promise<FlashSourceRow & { added: number }> {
  const { data, error } = await from("flash_sources").select("*").eq("id", sourceId).single();
  fail(error);
  const row = data as unknown as Row;
  const src = readSource(row);
  const n =
    part ?? Array.from({ length: src.total }, (_, i) => i + 1).find((x) => !src.parts.includes(x));
  if (!n || n > src.total || src.parts.includes(n)) return { ...src, added: 0 };
  const topic = await topicRow(src.topic_id);
  let deck = {
    name: topic.name,
    prompt: topic.prompt,
    columns: topic.columns,
    examples: [] as FlashTemplate["examples"],
  };
  if (topic.template_id) {
    const { data: t } = await from("flash_templates")
      .select("*")
      .eq("id", topic.template_id)
      .maybeSingle();
    if (t)
      deck = {
        ...deck,
        name: readTemplate(t as unknown as Row).name,
        examples: readTemplate(t as unknown as Row).examples,
      };
  }
  let input: Parameters<typeof readMessages>[2];
  if (src.kind === "pdf") {
    if (!image) throw new Error("Choose the PDF again to go on reading it");
    input = { page: n, pages: src.total };
  } else {
    const pieces = Array.isArray(row.pieces) ? (row.pieces as string[]) : [];
    input = { text: String(pieces[n - 1] ?? ""), part: n, parts: src.total };
  }
  const where = src.kind === "pdf" ? `Page ${n}` : `Part ${n}`;
  let read: ReadResult;
  try {
    read = parseReply(
      await saathiComplete(
        apiKey(),
        readMessages(deck, src.book, input),
        undefined,
        image ? [image] : undefined,
      ),
      topic.columns,
      { heading: "", rule: "" },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await from("flash_sources")
      .update({ error: `${where}: ${message}`.slice(0, 500) } as never)
      .eq("id", sourceId);
    throw new Error(`${where}: ${message}`);
  }
  const base = Number((row.context as { base?: number })?.base) || 0;
  await insertCards(
    read.cards.map((c, i) => ({
      topic_id: src.topic_id,
      pos: base + (n - 1) * PART_SPAN + i,
      front: c.front,
      back: c.back,
      ex: c.ex,
      sources: [
        {
          book: src.book,
          pos: (n - 1) * PART_SPAN + i + 1,
          page: src.kind === "pdf" ? n : null,
          heading: c.heading,
          rule: c.rule,
          ...(c.note ? { note: c.note } : {}),
          src: sourceId,
        },
      ],
    })),
  );
  const saved = await updateSource(sourceId, (r) => {
    const parts = [...new Set([...partsDone(r), n])].sort((a, b) => a - b);
    const todos = Array.isArray(r.todos) ? (r.todos as Todo[]) : [];
    return {
      context: { ...((r.context ?? {}) as object), parts },
      done: parts.length,
      cards: (Number(r.cards) || 0) + read.cards.length,
      todos: [...todos, ...read.notes.map((text) => ({ where, text }))].slice(0, 500),
      error: null,
    };
  });
  const out = readSource(saved);
  // All read: the cards numbered 1, 2, 3… in the book's order.
  if (out.done >= out.total) {
    const cards = (await topicCards(src.topic_id))
      .filter((c) => c.sources[0]?.src === sourceId)
      .sort((a, b) => a.pos - b.pos);
    const rows = cards.map((c, i) => ({
      id: c.id,
      topic_id: c.topic_id,
      sources: [{ ...c.sources[0], pos: i + 1 }, ...c.sources.slice(1)],
    }));
    for (let i = 0; i < rows.length; i += 500)
      fail(
        (await from("flash_cards").upsert(rows.slice(i, i + 500) as never, { onConflict: "id" }))
          .error,
      );
  }
  await touch(src.topic_id);
  return { ...out, added: read.cards.length };
}

// A book taken out again: its cards not yet numbered go with it (numbered
// ones stay, their numbers being in the app).
export async function deleteSource(sourceId: string): Promise<{ deleted: number; kept: number }> {
  const { data, error } = await from("flash_sources")
    .select("topic_id")
    .eq("id", sourceId)
    .single();
  fail(error);
  const topicId = String((data as unknown as Row).topic_id);
  const cards = (await topicCards(topicId)).filter((c) =>
    c.sources.some((s) => s.src === sourceId),
  );
  // Its own cards not yet numbered go; numbered ones stay. One holding other
  // books' versions merged into it goes to the next book's version instead.
  const own = cards.filter((c) => c.sources[0]?.src === sourceId);
  const free = own.filter((c) => c.card_order === null);
  await removeOwn(sourceId, free);
  // Its versions merged into other books' cards are taken out of them.
  const strip = cards
    .filter((c) => c.sources[0]?.src !== sourceId)
    .map((c) => ({
      id: c.id,
      topic_id: c.topic_id,
      sources: c.sources.filter((s) => s.src !== sourceId),
      variants: c.variants.filter((v) => v.source?.src !== sourceId),
      updated_at: now(),
    }));
  for (let i = 0; i < strip.length; i += 500)
    fail(
      (await from("flash_cards").upsert(strip.slice(i, i + 500) as never, { onConflict: "id" }))
        .error,
    );
  fail((await from("flash_sources").delete().eq("id", sourceId)).error);
  await touch(topicId);
  return { deleted: free.length, kept: own.length - free.length };
}

// A sheet's own cards (not numbered) taken out: one holding other books'
// versions merged into it goes to the next book's version, the rest are
// deleted.
async function removeOwn(sourceId: string, free: FlashCard[]) {
  const promote = free
    .map((c) => {
      const variants = c.variants.filter((v) => v.source?.src !== sourceId);
      const [v, ...rest] = variants;
      if (!v) return null;
      return {
        id: c.id,
        topic_id: c.topic_id,
        front: v.front,
        back: v.back,
        ex: v.ex,
        own: [],
        verified: false,
        sources: [
          ...(v.source ? [v.source] : []),
          ...c.sources.filter((s) => s.src !== sourceId && !sameSource(s, v.source)),
        ],
        variants: rest,
        updated_at: now(),
      };
    })
    .filter((r) => r !== null);
  for (let i = 0; i < promote.length; i += 500)
    fail(
      (await from("flash_cards").upsert(promote.slice(i, i + 500) as never, { onConflict: "id" }))
        .error,
    );
  const kept = new Set(promote.map((r) => r.id));
  const drop = free.filter((c) => !kept.has(c.id)).map((c) => c.id);
  await deleteKept(drop, "its sheet removed or replaced");
}

const sameSource = (a: FlashCard["sources"][number], b: FlashCard["sources"][number] | null) =>
  !!b && a.book === b.book && a.pos === b.pos && a.src === b.src && a.page === b.page;

// ---------- Merging the same word from several books ----------

async function cardsByIds(ids: string[]): Promise<FlashCard[]> {
  const out: FlashCard[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await from("flash_cards")
      .select("*")
      .in("id", ids.slice(i, i + 200));
    fail(error);
    out.push(...((data ?? []) as Row[]).map(readCard));
  }
  return out;
}

// The other cards folded into `main`: their versions kept as its variants,
// their books as its sources, and its empty explanations filled from
// theirs. They must not be numbered (their numbers are in the app).
async function foldInto(main: FlashCard, others: FlashCard[]) {
  if (others.some((o) => o.card_order !== null))
    throw new Error("A numbered card can't be merged into another; remove it instead");
  for (const o of others) await countFor(o.sources[0]?.src, "merged");
  const ex = { ...main.ex };
  const own = [...main.own];
  for (const o of others)
    for (const [k, v] of Object.entries(o.ex))
      if (v && !(ex[k] ?? "").trim()) {
        ex[k] = v;
        if (o.own.includes(k)) own.push(k);
      }
  const variants = [
    ...main.variants,
    ...others.flatMap((o) => [
      {
        book: o.sources[0]?.book ?? "",
        front: o.front,
        back: o.back,
        ex: o.ex,
        source: o.sources[0] ?? null,
      },
      ...o.variants,
    ]),
  ];
  const sources = [...main.sources, ...others.flatMap((o) => o.sources)];
  fail(
    (
      await from("flash_cards")
        .update({ ex, own: [...new Set(own)], variants, sources, updated_at: now() } as never)
        .eq("id", main.id)
    ).error,
  );
  fail(
    (
      await from("flash_cards")
        .delete()
        .in(
          "id",
          others.map((o) => o.id),
        )
    ).error,
  );
}

export async function mergeCards(mainId: string, otherIds: string[]): Promise<FlashCard> {
  const cards = await cardsByIds([mainId, ...otherIds]);
  const main = cards.find((c) => c.id === mainId);
  if (!main) throw new Error("Card not found");
  const others = cards.filter((c) => c.id !== mainId);
  if (others.some((o) => o.topic_id !== main.topic_id)) throw new Error("Cards from another topic");
  if (!others.length) return main;
  await foldInto(main, others);
  await touch(main.topic_id);
  return (await cardsByIds([mainId]))[0];
}

// Every group of the same word merged into its main card (the first book
// in the topic's order). Groups with more than one numbered card are left.
export async function mergeAll(
  topicId: string,
): Promise<{ merged: number; cards: number; skipped: number }> {
  const { topic, cards } = await getTopic(topicId);
  let merged = 0;
  let folded = 0;
  let skipped = 0;
  for (const g of M.groupDuplicates(cards)) {
    if (g.cards.filter((c) => c.card_order !== null).length > 1) {
      skipped++;
      continue;
    }
    const main = M.mainOf(
      g.cards,
      topic.books.map((b) => b.code),
    );
    const others = g.cards.filter((c) => c.id !== main.id);
    await foldInto(main, others);
    merged++;
    folded += others.length;
  }
  if (merged) await touch(topicId);
  return { merged, cards: folded, skipped };
}

// One book's version taken out of a merged card again, as its own card.
export async function splitVariant(cardId: string, index: number): Promise<FlashCard> {
  const [card] = await cardsByIds([cardId]);
  if (!card) throw new Error("Card not found");
  const v = card.variants[index];
  if (!v) throw new Error("That version isn't there");
  const sources = [...card.sources];
  const at = v.source
    ? sources.findIndex(
        (s, i) =>
          i > 0 && s.book === v.source!.book && s.pos === v.source!.pos && s.src === v.source!.src,
      )
    : -1;
  if (at > 0) sources.splice(at, 1);
  const variants = card.variants.filter((_, i) => i !== index);
  fail(
    (
      await from("flash_cards")
        .update({ variants, sources, updated_at: now() } as never)
        .eq("id", cardId)
    ).error,
  );
  const { data: last } = await from("flash_cards")
    .select("pos")
    .eq("topic_id", card.topic_id)
    .order("pos", { ascending: false })
    .limit(1);
  const pos = ((last ?? []) as Row[])[0] ? Number(((last ?? []) as Row[])[0].pos) + 1 : 0;
  const { data, error } = await from("flash_cards")
    .insert({
      topic_id: card.topic_id,
      pos,
      front: v.front,
      back: v.back,
      ex: v.ex,
      sources: v.source ? [v.source] : [{ book: v.book }],
    } as never)
    .select("*")
    .single();
  fail(error);
  await touch(card.topic_id);
  return readCard(data as unknown as Row);
}

// ---------- The AI's help: explanations and the check ----------

async function deckOf(topic: FlashTopic) {
  let deck = {
    name: topic.name,
    prompt: topic.prompt,
    columns: topic.columns,
    examples: [] as FlashTemplate["examples"],
  };
  if (topic.template_id) {
    const { data: t } = await from("flash_templates")
      .select("*")
      .eq("id", topic.template_id)
      .maybeSingle();
    if (t) {
      const tpl = readTemplate(t as unknown as Row);
      deck = { ...deck, name: tpl.name, examples: tpl.examples };
    }
  }
  return deck;
}

// Empty explanations filled for these cards: first from other cards of the
// same book's heading and rule, then by the AI from the book's text (or,
// marked as its own knowledge, without it).
export async function fillExplanations(
  topicId: string,
  ids: string[],
): Promise<{ filled: number; own: number; cards: FlashCard[] }> {
  const { topic, cards } = await getTopic(topicId);
  const want = cards.filter((c) => ids.includes(c.id) && !c.removed);
  const deck = await deckOf(topic);
  // The editor's own verified cards show the house style best: those
  // closest to these cards, with the wordings they use again and again.
  const verified = M.styleExamples(cards, topic.columns, want);
  const wordings = M.usedWordings(cards, topic.columns);
  deck.examples = [
    ...verified.map((c) => ({
      front: c.front,
      back: c.back,
      // Only what the editor wrote (not the AI's own).
      ex: Object.fromEntries(
        topic.columns.map((col) => [col.title, c.own.includes(col.id) ? "" : (c.ex[col.id] ?? "")]),
      ),
    })),
    ...deck.examples,
  ];
  // The books' text, for the passages.
  const { data: srcRows } = await from("flash_sources").select("id,pieces").eq("topic_id", topicId);
  const pieces = new Map(
    ((srcRows ?? []) as Row[]).map((r) => [
      String(r.id),
      Array.isArray(r.pieces) ? (r.pieces as string[]) : [],
    ]),
  );
  const title = new Map(topic.columns.map((c) => [c.id, c.title]));
  const patches = new Map<string, { ex: Record<string, string>; own: string[] }>();
  const items: (M.FillItem & { id: string })[] = [];
  // Examples of the same book's heading and rule share its explanation:
  // the AI writes it once (for the first), the others take it.
  const ruleOf = (c: FlashCard) => {
    const s = c.sources[0];
    return s?.heading && s.rule ? `${s.book}|${s.heading}|${s.rule}` : "";
  };
  const leaders = new Map<string, string>();
  const followers: { id: string; leader: string; empty: string[] }[] = [];
  for (const c of want) {
    const sib = M.fromSiblings(c, cards, topic.columns);
    const ex = { ...c.ex, ...sib };
    if (Object.keys(sib).length) patches.set(c.id, { ex, own: c.own });
    const empty = M.emptyColumns({ ex }, topic.columns);
    if (!empty.length) continue;
    const rule = ruleOf(c);
    if (rule && leaders.has(rule)) {
      followers.push({ id: c.id, leader: leaders.get(rule)!, empty });
      continue;
    }
    if (rule) leaders.set(rule, c.id);
    const texts = c.sources.flatMap((s) => (s.src ? (pieces.get(s.src) ?? []) : []));
    items.push({
      id: c.id,
      n: items.length + 1,
      front: c.front,
      back: c.back,
      heading: c.sources[0]?.heading ?? "",
      rule: c.sources[0]?.rule ?? "",
      have: Object.fromEntries(
        topic.columns
          .filter((col) => (ex[col.id] ?? "").trim())
          .map((col) => [col.title, ex[col.id]]),
      ),
      want: empty.map((id) => title.get(id)!),
      passage: M.passageFor(texts, c.front),
    });
  }
  let own = 0;
  if (items.length) {
    const got = M.parseFill(
      await saathiComplete(apiKey(), M.fillMessages(deck, items, wordings)),
      topic.columns,
      items,
    );
    for (const it of items) {
      const f = got.get(it.n);
      if (!f || !Object.keys(f.ex).length) continue;
      const card = want.find((c) => c.id === it.id)!;
      const base = patches.get(it.id) ?? { ex: card.ex, own: card.own };
      own += f.own.length;
      patches.set(it.id, {
        ex: { ...base.ex, ...f.ex },
        own: [...new Set([...base.own, ...f.own])],
      });
    }
  }
  for (const f of followers) {
    const lead = patches.get(f.leader);
    if (!lead) continue;
    const card = want.find((c) => c.id === f.id)!;
    const base = patches.get(f.id) ?? { ex: card.ex, own: card.own };
    const add = Object.fromEntries(
      f.empty.filter((id) => lead.ex[id]).map((id) => [id, lead.ex[id]]),
    );
    if (!Object.keys(add).length) continue;
    const ownAdd = Object.keys(add).filter((id) => lead.own.includes(id));
    own += ownAdd.length;
    patches.set(f.id, { ex: { ...base.ex, ...add }, own: [...new Set([...base.own, ...ownAdd])] });
  }
  const out: FlashCard[] = [];
  for (const [id, p] of patches) out.push(await saveCard(id, { ex: p.ex, own: p.own }));
  return { filled: out.length, own, cards: out };
}

// The AI's check of these cards: a problem it finds marks the card to
// recheck with its kind and a note; it changes nothing else.
export async function checkCards(
  topicId: string,
  ids: string[],
): Promise<{ checked: number; flagged: number; cards: FlashCard[] }> {
  const { topic, cards } = await getTopic(topicId);
  // Only cards not verified and not read as they are now.
  const want = cards.filter((c) => ids.includes(c.id) && needsCheck(c));
  if (!want.length) return { checked: 0, flagged: 0, cards: [] };
  const deck = await deckOf(topic);
  const items = want.map((c, i) => ({
    n: i + 1,
    front: c.front,
    back: c.back,
    ex: Object.fromEntries(
      topic.columns
        .filter((col) => (c.ex[col.id] ?? "").trim())
        .map((col) => [col.title, c.ex[col.id]]),
    ),
  }));
  const flags = M.parseCheck(
    await saathiComplete(apiKey(), M.checkMessages(deck, items)),
    items,
    topic.columns,
  );
  const at = now();
  const rows = want.map((c, i) => {
    const mine = flags.filter((f) => f.n === i + 1);
    const fixes = mine.map((f) => {
      const from = f.field ? fieldText(c, f.field) : "";
      return {
        field: f.field,
        from,
        // A "fix" the same as the text is only a pointer.
        to: f.fix && f.fix !== from.trim() ? f.fix : "",
        type: f.type,
        note: f.note,
      };
    });
    // Every row has the same keys (a bulk upsert nulls missing ones).
    return {
      id: c.id,
      topic_id: topicId,
      ai: { at, sig: cardSig(c), fixes, done: c.ai?.done ?? [] },
      error: fixes.length ? true : c.error,
      error_type: fixes.length ? fixes[0].type : c.error_type,
      note: fixes.length ? `AI: ${fixes.map((f) => f.note).join("; ")}`.slice(0, 2000) : c.note,
      flagged: fixes.length > 0,
    };
  });
  const { data, error } = await from("flash_cards")
    .upsert(rows.map(({ flagged: _f, ...r }) => r) as never, { onConflict: "id" })
    .select("*");
  if (error && /\bai\b.*(column|schema cache)|column.*\bai\b/i.test(error.message))
    throw new Error(
      "The AI check needs a database update: run the latest migration (flash_card_ai) in Lovable or the SQL editor.",
    );
  fail(error);
  await touch(topicId);
  return {
    checked: want.length,
    flagged: rows.filter((r) => r.flagged).length,
    cards: ((data ?? []) as Row[]).map(readCard),
  };
}

// ---------- Downloads ----------

// The chunks just downloaded: their time kept, so later edits show as
// "changed since download".
export async function markDownloaded(topicId: string, ns: number[]) {
  const topic = await topicRow(topicId);
  const at = now();
  const chunks = topic.chunks.map((c) => (ns.includes(c.n) ? { ...c, downloaded: at } : c));
  fail(
    (
      await from("flash_topics")
        .update({ chunks } as never)
        .eq("id", topicId)
    ).error,
  );
  return chunks;
}

// ---------- "पृथक करें" cards from an उपसर्ग / प्रत्यय topic ----------

async function templateKey(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await from("flash_templates").select("key").eq("id", id).maybeSingle();
  return data ? String((data as unknown as Row).key) : null;
}

// The "पृथक करें" topic for an उपसर्ग / प्रत्यय topic: the one named after it,
// or a new one of the matching deck type.
async function splitTopicFor(source: FlashTopic, kind: S.AffixKind): Promise<FlashTopic> {
  const name = `${source.name} – पृथक करें`;
  const { data } = await from("flash_topics").select("*").eq("name", name).limit(1);
  if (((data ?? []) as Row[])[0]) return readTopic(((data ?? []) as Row[])[0]);
  const { data: t } = await from("flash_templates")
    .select("id")
    .eq("key", S.SPLIT_OF[kind])
    .maybeSingle();
  const created = await createTopic(name, t ? String((t as unknown as Row).id) : null);
  return updateTopic(created.id, { books: source.books });
}

export async function makeSplitCards(
  sourceId: string,
  cardIds: string[],
): Promise<{ topic: FlashTopic; added: number; ai: number; skipped: number }> {
  const { topic: source, cards } = await getTopic(sourceId);
  const kind = S.kindOfTemplate(await templateKey(source.template_id));
  if (!kind) throw new Error("Only an उपसर्ग or प्रत्यय topic makes पृथक करें cards");
  const target = await splitTopicFor(source, kind);
  const have = new Set(
    (await topicCards(target.id)).filter((c) => !c.removed).map((c) => M.dupKey(c.front)),
  );
  const colOf = new Map(target.columns.map((c) => [c.title.trim(), c.id]));
  type Made = { word: string; split: string | null; card: FlashCard; affix: string };
  const made: Made[] = [];
  let skipped = 0;
  for (const card of cards.filter((c) => cardIds.includes(c.id) && !c.removed)) {
    const affix = S.cleanAffix(card.front);
    for (const word of S.wordsOf(card.back)) {
      const key = M.dupKey(word);
      if (have.has(key)) {
        skipped++;
        continue;
      }
      have.add(key);
      made.push({ word, split: S.plainSplit(kind, affix, word), card, affix });
    }
  }
  const ask = made
    .filter((m) => !m.split)
    .map((m, i) => ({ n: i + 1, affix: m.affix, word: m.word, m }));
  let ai = 0;
  if (ask.length) {
    const got = S.parseSplit(await saathiComplete(apiKey(), S.splitMessages(kind, ask)), ask);
    for (const a of ask) {
      const split = got.get(a.n);
      if (split) {
        a.m.split = split;
        ai++;
      }
    }
  }
  const { data: last } = await from("flash_cards")
    .select("pos")
    .eq("topic_id", target.id)
    .order("pos", { ascending: false })
    .limit(1);
  let pos = ((last ?? []) as Row[])[0] ? Number(((last ?? []) as Row[])[0].pos) + 1 : 0;
  const titleOf = new Map(source.columns.map((c) => [c.id, c.title.trim()]));
  const rows = made
    .filter((m) => m.split)
    .map((m) => {
      const ex: Record<string, string> = {};
      const own: string[] = [];
      for (const [id, v] of Object.entries(m.card.ex)) {
        const to = colOf.get(titleOf.get(id) ?? "");
        if (to && v) {
          ex[to] = v;
          if (m.card.own.includes(id)) own.push(to);
        }
      }
      const fromAi = !S.plainSplit(kind, m.affix, m.word);
      return {
        topic_id: target.id,
        pos: pos++,
        front: m.word,
        back: m.split,
        ex,
        own,
        sources: m.card.sources.slice(0, 1),
        note: fromAi ? "AI: parts split by the AI; check them" : "",
        error: false,
      };
    });
  skipped += made.length - rows.length;
  await insertCards(rows);
  await touch(target.id);
  return { topic: target, added: rows.length, ai, skipped };
}

// ---------- A sheet's counts ----------

// A card of this source deleted or merged into another: counted on the
// source, for its status.
async function countFor(src: string | undefined, what: "deleted" | "merged") {
  if (!src) return;
  try {
    await updateSource(src, (r) => {
      const ctx = (r.context ?? {}) as Record<string, unknown>;
      return { context: { ...ctx, [what]: (Number(ctx[what]) || 0) + 1 } };
    });
  } catch {
    // The source is gone, or busy: only its count is missed.
  }
}

// ---------- Starting the chunks again ----------

// Every number, chunk and app id taken off the topic's cards (cards removed
// after numbering go for good), so it can be finalised again. For a topic
// chunked only to try it out: its chunks in the app no longer match.
export async function resetChunks(topicId: string): Promise<{ cards: number; removed: number }> {
  const cards = await topicCards(topicId);
  const removed = cards.filter((c) => c.removed).map((c) => c.id);
  await deleteKept(removed, "removed, then the chunks were reset");
  const rows = cards
    .filter((c) => !c.removed && (c.card_order !== null || c.chunk !== null || c.app_id))
    .map((c) => ({
      id: c.id,
      topic_id: topicId,
      chunk: null,
      card_order: null,
      app_id: null,
      updated_at: now(),
    }));
  for (let i = 0; i < rows.length; i += 500)
    fail(
      (await from("flash_cards").upsert(rows.slice(i, i + 500) as never, { onConflict: "id" }))
        .error,
    );
  fail(
    (
      await from("flash_topics")
        .update({ chunks: [], locked_at: null, updated_at: now() } as never)
        .eq("id", topicId)
    ).error,
  );
  return { cards: rows.length, removed: removed.length };
}

// ---------- One wording for an explanation ----------

// Every card whose column says one of `wordings` (the same explanation in other
// words) given `to` instead. The editor chose it, so it is no longer marked
// as the AI's own.
export async function setExplanation(
  topicId: string,
  column: string,
  wordings: string[],
  to: string,
): Promise<{ changed: number }> {
  const want = new Set(wordings.map((f) => f.trim()));
  const cards = (await topicCards(topicId)).filter(
    (c) =>
      !c.removed &&
      want.has((c.ex[column] ?? "").trim()) &&
      (c.ex[column] ?? "").trim() !== to.trim(),
  );
  const rows = cards.map((c) => ({
    id: c.id,
    topic_id: topicId,
    ex: { ...c.ex, [column]: to },
    own: c.own.filter((o) => o !== column),
    updated_at: now(),
  }));
  for (let i = 0; i < rows.length; i += 500)
    fail(
      (await from("flash_cards").upsert(rows.slice(i, i + 500) as never, { onConflict: "id" }))
        .error,
    );
  if (rows.length) await touch(topicId);
  return { changed: rows.length };
}

// ---------- Many cards at once ----------

export type BulkAction = "verify" | "unverify" | "recheck" | "delete" | "apply_ai" | "fix_lint";

// Text changes to many cards in one go, each card's old text kept in its
// history (the last 20) as a single save would.
async function writeEdits(topicId: string, edits: { id: string; patch: Row }[]) {
  if (!edits.length) return [] as FlashCard[];
  const raw = new Map<string, Row>();
  const ids = edits.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await from("flash_cards")
      .select("*")
      .in("id", ids.slice(i, i + 200));
    fail(error);
    for (const r of (data ?? []) as Row[]) raw.set(String(r.id), r);
  }
  const at = now();
  // Every row has the same keys (a bulk upsert nulls missing ones).
  const keys = [...new Set(edits.flatMap((e) => Object.keys(e.patch)))];
  const rows = edits
    .filter((e) => raw.has(e.id))
    .map((e) => {
      const old = raw.get(e.id)!;
      const before = readCard(old);
      const row: Row = { id: e.id, topic_id: topicId, updated_at: at };
      for (const k of keys) row[k] = k in e.patch ? e.patch[k] : old[k];
      if (["front", "back", "ex"].some((k) => k in e.patch)) {
        const history = Array.isArray(old.history) ? (old.history as unknown[]) : [];
        row.history = [
          { at, front: before.front, back: before.back, ex: before.ex },
          ...history,
        ].slice(0, 20);
      } else row.history = old.history ?? [];
      return row;
    });
  const out: FlashCard[] = [];
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await from("flash_cards")
      .upsert(rows.slice(i, i + 300) as never, { onConflict: "id" })
      .select("*");
    fail(error);
    out.push(...((data ?? []) as Row[]).map(readCard));
  }
  await touch(topicId);
  return out;
}

// What an action does to many cards: verify, not verified, to recheck,
// delete (numbered cards are removed), apply the AI's fixes, or make the
// quick checks' safe fixes.
export async function bulkCards(
  topicId: string,
  ids: string[],
  action: BulkAction,
): Promise<{
  changed: number;
  deleted: number;
  removed: number;
  cards: FlashCard[];
  // Cards deleted (in the bin) and numbered cards removed.
  deletedIds?: string[];
  removedIds?: string[];
}> {
  const { topic, cards } = await getTopic(topicId);
  const want = new Set(ids);
  const chosen = cards.filter((c) => want.has(c.id) && !c.removed);
  if (action === "delete") {
    const deletedIds: string[] = [];
    const removedIds: string[] = [];
    for (const c of chosen)
      ((await deleteCard(c.id)) === "deleted" ? deletedIds : removedIds).push(c.id);
    return {
      changed: 0,
      deleted: deletedIds.length,
      removed: removedIds.length,
      cards: [],
      deletedIds,
      removedIds,
    };
  }
  const edits: { id: string; patch: Row }[] = [];
  if (action === "verify" || action === "unverify")
    for (const c of chosen) {
      if (c.verified !== (action === "verify"))
        edits.push({ id: c.id, patch: { verified: action === "verify" } });
    }
  else if (action === "recheck")
    for (const c of chosen) {
      if (!c.error)
        edits.push({ id: c.id, patch: { error: true, error_type: c.error_type, verified: false } });
    }
  else if (action === "apply_ai")
    for (const c of chosen) {
      const fixes = c.ai?.fixes ?? [];
      const usable = fixes.filter((f) => f.to && f.field);
      if (!usable.length) continue;
      const next = { front: c.front, back: c.back, ex: { ...c.ex } };
      let own = c.own;
      for (const f of usable) {
        if (f.field === "front") next.front = f.to;
        else if (f.field === "back") next.back = f.to;
        else {
          next.ex[f.field.slice(3)] = f.to;
          own = own.filter((o) => `ex:${o}` !== f.field);
        }
      }
      const left = fixes.filter((f) => !(f.to && f.field));
      const clear = !left.length && c.note.startsWith("AI:");
      edits.push({
        id: c.id,
        patch: {
          ...next,
          own,
          ai: {
            ...c.ai!,
            fixes: left,
            sig: cardSig(next),
            done: [...c.ai!.done, ...doneOf(usable, true)].slice(-100),
          },
          ...(clear ? { note: "", error: false, error_type: "" } : {}),
        },
      });
    }
  else if (action === "fix_lint") {
    const lints = L.lintTopic(cards, topic.columns);
    for (const c of chosen) {
      const mine = (lints.get(c.id) ?? []).filter((l) => l.fix !== undefined);
      if (!mine.length) continue;
      const next = L.applyLints(c, mine);
      if (JSON.stringify(next) === JSON.stringify({ front: c.front, back: c.back, ex: c.ex }))
        continue;
      edits.push({ id: c.id, patch: { ...next } });
    }
  }
  const out = await writeEdits(topicId, edits);
  return { changed: out.length, deleted: 0, removed: 0, cards: out };
}

export type CardVersion = { at: string; front: string; back: string; ex: Record<string, string> };

// A card's earlier texts, newest first.
export async function cardHistory(id: string): Promise<CardVersion[]> {
  const { data, error } = await from("flash_cards").select("history").eq("id", id).single();
  fail(error);
  const h = (data as unknown as Row | null)?.history;
  return (Array.isArray(h) ? h : []).map((x) => {
    const o = (x ?? {}) as Row;
    return {
      at: String(o.at ?? ""),
      front: String(o.front ?? ""),
      back: String(o.back ?? ""),
      ex: normalizeEx(o.ex),
    };
  });
}

// ---------- The AI's fixes, many at once ----------

// Fixes picked from the topic's list (each by card, field and suggested
// text, so a list shown before a new check can't touch the wrong one),
// applied or dismissed. A card with none left loses the AI's note and its
// recheck mark; one whose text changed counts as read as it now is.
export async function resolveAi(
  topicId: string,
  picks: { id: string; field: string; to: string }[],
  apply: boolean,
): Promise<{ changed: number; cards: FlashCard[] }> {
  const cards = await topicCards(topicId);
  const want = new Map<string, { field: string; to: string }[]>();
  for (const p of picks) want.set(p.id, [...(want.get(p.id) ?? []), p]);
  const edits: { id: string; patch: Row }[] = [];
  for (const c of cards) {
    const mine = want.get(c.id);
    if (!mine || !c.ai || c.removed) continue;
    const hit = (f: AiFix) => mine.some((p) => p.field === f.field && p.to === f.to);
    const chosen = c.ai.fixes.filter(hit);
    if (!chosen.length) continue;
    const left = c.ai.fixes.filter((f) => !hit(f));
    const next = { front: c.front, back: c.back, ex: { ...c.ex } };
    let own = c.own;
    const used = apply ? chosen.filter((f) => f.to && f.field) : [];
    for (const f of used) {
      if (f.field === "front") next.front = f.to;
      else if (f.field === "back") next.back = f.to;
      else {
        next.ex[f.field.slice(3)] = f.to;
        own = own.filter((o) => `ex:${o}` !== f.field);
      }
    }
    const clear = !left.length && c.note.startsWith("AI:");
    const ai = {
      ...c.ai,
      fixes: left,
      sig: used.length ? cardSig(next) : c.ai.sig,
      done: [
        ...c.ai.done,
        ...doneOf(used, true),
        ...doneOf(
          chosen.filter((f) => !used.includes(f)),
          false,
        ),
      ].slice(-100),
    };
    edits.push({
      id: c.id,
      patch: {
        ...(used.length ? { ...next, own } : {}),
        ai,
        ...(clear ? { note: "", error: false, error_type: "" } : {}),
      },
    });
  }
  // Text and no-text edits written apart (a bulk write has one set of keys).
  const withText = edits.filter((e) => "front" in e.patch);
  const without = edits.filter((e) => !("front" in e.patch));
  const out = [...(await writeEdits(topicId, withText)), ...(await writeEdits(topicId, without))];
  return { changed: out.length, cards: out };
}

// ---------- A book's sheet replaced, card by card ----------

// The topic's columns and books with any the sheet brings added.
function growTopic(topic: FlashTopic, titles: string[], codes: string[]) {
  const columns = [...topic.columns];
  const idOf = new Map(columns.map((c) => [c.title.trim(), c.id]));
  for (const title of titles) {
    const t = title.trim();
    if (!t || idOf.has(t)) continue;
    const id = newColumnId(columns);
    columns.push({ id, title: t, hint: "" });
    idOf.set(t, id);
  }
  const books = [...topic.books];
  for (const code of codes)
    if (code && !books.some((b) => b.code === code))
      books.push({ code, name: "", color: BOOK_COLORS[books.length % BOOK_COLORS.length] });
  return { columns, books, idOf };
}

export type ReplaceResult = {
  same: number;
  changed: number;
  added: number;
  gone: number;
  // Gone from the sheet but numbered (in the app): kept.
  kept: number;
};

// The sheet `sourceId` replaced by a new version: rows matched to its cards
// (and its versions merged into other books' cards) by their word. The same
// stay as they are, with their merges and verified marks; changed ones get
// the new text (old text kept in their history) and need verifying again;
// new rows are added; rows gone are taken out (numbered cards stay).
export async function replaceSheet(
  topicId: string,
  sourceId: string,
  sheet: { cards: SheetCard[]; columns: string[]; book: string; name?: string },
): Promise<ReplaceResult> {
  const { topic, cards } = await getTopic(topicId);
  const codes = [...new Set(sheet.cards.map((c) => (c.book || sheet.book).trim()).filter(Boolean))];
  const { columns, books, idOf } = growTopic(topic, sheet.columns, codes);
  const plan = SH.planReplace(cards, sourceId, sheet.cards, idOf);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const textEdits = new Map<string, Row>();
  // Cards whose merged versions change or go: their versions, by place.
  const versions = new Map<string, (FlashVariant | null)[]>();
  const versionsOf = (id: string) => {
    if (!versions.has(id)) versions.set(id, [...byId.get(id)!.variants]);
    return versions.get(id)!;
  };
  for (const ch of plan.changed) {
    if (ch.variant === null)
      textEdits.set(ch.id, {
        front: ch.after.front,
        back: ch.after.back,
        ex: ch.after.ex,
        verified: false,
      });
    else {
      const vs = versionsOf(ch.id);
      vs[ch.variant] = { ...vs[ch.variant]!, ...ch.after };
    }
  }
  const goneOwn: FlashCard[] = [];
  let kept = 0;
  for (const g of plan.gone) {
    if (g.variant !== null) versionsOf(g.id)[g.variant] = null;
    else if (g.numbered) kept++;
    else goneOwn.push(byId.get(g.id)!);
  }
  const edits: { id: string; patch: Row }[] = [...textEdits].map(([id, patch]) => ({ id, patch }));
  for (const [id, vs] of versions) {
    const c = byId.get(id)!;
    const goneSrc = c.variants.filter((_, i) => vs[i] === null).map((v) => v.source);
    edits.push({
      id,
      patch: {
        ...(textEdits.get(id) ?? {}),
        variants: vs.filter((v) => v !== null),
        sources: c.sources.filter((s) => !goneSrc.some((g) => sameSource(s, g ?? null))),
      },
    });
  }
  // One write per card (a card may have both kinds of change).
  const merged = new Map<string, Row>();
  for (const e of edits) merged.set(e.id, { ...(merged.get(e.id) ?? {}), ...e.patch });
  await writeEdits(
    topicId,
    [...merged].map(([id, patch]) => ({ id, patch })),
  );
  await removeOwn(sourceId, goneOwn);
  const start = cards.reduce((m, c) => Math.max(m, c.pos + 1), 0);
  await insertCards(
    plan.added.map((i, k) => {
      const c = sheet.cards[i];
      const book = (c.book || sheet.book).trim();
      return {
        topic_id: topicId,
        pos: start + k,
        prompt: c.prompt && c.prompt !== topic.prompt ? c.prompt : null,
        front: c.front,
        back: c.back,
        back_hint: c.back_hint,
        is_revealed: c.is_revealed,
        word_key: c.word_key || null,
        ex: SH.sheetEx(c, idOf),
        sources: [{ book, pos: c.book_order, src: sourceId }],
        error: c.error,
        error_type: c.error_type,
      };
    }),
  );
  fail(
    (
      await from("flash_topics")
        .update({ columns, books, updated_at: now() } as never)
        .eq("id", topicId)
    ).error,
  );
  await updateSource(sourceId, (r) => ({
    name: (sheet.name ?? String(r.name ?? "")).slice(0, 200),
    cards: sheet.cards.length,
    context: { ...((r.context ?? {}) as Row), rows: sheet.cards.length },
  }));
  await touch(topicId);
  return {
    same: plan.same,
    changed: plan.changed.length,
    added: plan.added.length,
    gone: plan.gone.length - kept,
    kept,
  };
}

// ---------- The working sheet back ----------

export type WorkingResult = { same: number; changed: number; added: number; unknown: number };

// A working sheet's edits made on the cards they name (old text kept in
// each card's history); rows without a card id added as new cards.
export async function applyWorking(topicId: string, rows: SH.WorkingRow[]): Promise<WorkingResult> {
  const { topic, cards } = await getTopic(topicId);
  const plan = SH.planWorking(cards, rows);
  const edits = plan.changed
    .map((ch) => ({ id: ch.id, patch: SH.workingPatch(ch.before, ch.after) as Row }))
    .filter((e) => Object.keys(e.patch).length);
  // A bulk write has one set of keys: text edits and mark-only edits apart.
  await writeEdits(
    topicId,
    edits.filter((e) => "front" in e.patch),
  );
  await writeEdits(
    topicId,
    edits.filter((e) => !("front" in e.patch)),
  );
  if (plan.added.length) {
    const { books } = growTopic(
      topic,
      [],
      plan.added.map((r) => r.book),
    );
    const start = cards.reduce((m, c) => Math.max(m, c.pos + 1), 0);
    await insertCards(
      plan.added.map((r, k) => ({
        topic_id: topicId,
        pos: start + k,
        front: r.front,
        back: r.back,
        ex: Object.fromEntries(Object.entries(r.ex).filter(([, v]) => v.trim())),
        sources: r.book ? [{ book: r.book, pos: null }] : [],
        verified: r.verified === true,
        note: r.note ?? "",
      })),
    );
    fail(
      (
        await from("flash_topics")
          .update({ books, updated_at: now() } as never)
          .eq("id", topicId)
      ).error,
    );
  }
  await touch(topicId);
  return {
    same: plan.same,
    changed: edits.length,
    added: plan.added.length,
    unknown: plan.unknown.length,
  };
}

// ---------- The same word in other topics ----------

// For this topic's words (by their key), the other topics that have them.
export async function otherTopicWords(
  topicId: string,
): Promise<{ key: string; topics: { id: string; name: string; front: string }[] }[]> {
  const mine = new Set(
    (await topicCards(topicId)).filter((c) => !c.removed).map((c) => M.dupKey(c.front)),
  );
  mine.delete("");
  const { data: topics, error } = await from("flash_topics").select("id,name").neq("id", topicId);
  fail(error);
  const names = new Map(((topics ?? []) as Row[]).map((t) => [String(t.id), String(t.name)]));
  const found = new Map<string, Map<string, { id: string; name: string; front: string }>>();
  for (let page = 0; ; page++) {
    const { data, error: e2 } = await from("flash_cards")
      .select("topic_id,front")
      .neq("topic_id", topicId)
      .eq("removed", false)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    fail(e2);
    for (const r of (data ?? []) as Row[]) {
      const key = M.dupKey(String(r.front ?? ""));
      const tid = String(r.topic_id);
      if (!mine.has(key) || !names.has(tid)) continue;
      const m = found.get(key) ?? new Map();
      if (!m.has(tid)) m.set(tid, { id: tid, name: names.get(tid)!, front: String(r.front) });
      found.set(key, m);
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...found].map(([key, m]) => ({ key, topics: [...m.values()] }));
}

// ---------- AI jobs on the server (with the browser closed) ----------

export type FlashJob = {
  id: string;
  topic_id: string;
  kind: "check" | "fill";
  total: number;
  done: number;
  found: number;
  status: "queued" | "running" | "done" | "stopped" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
};

const JOB_COLS = "id,topic_id,kind,total,done,found,status,error,created_at,updated_at";
const JOBS_NOT_READY =
  "AI jobs on the server need a database update: run the latest migration (flash_jobs) in Lovable or the SQL editor.";
const jobFail = (e: { message: string } | null) => {
  if (e && /flash_jobs/.test(e.message)) throw new Error(JOBS_NOT_READY);
  fail(e);
};
const readJob = (r: Row): FlashJob => ({
  id: String(r.id),
  topic_id: String(r.topic_id),
  kind: r.kind === "fill" ? "fill" : "check",
  total: Number(r.total) || 0,
  done: Number(r.done) || 0,
  found: Number(r.found) || 0,
  status: (["queued", "running", "done", "stopped", "failed"].includes(String(r.status))
    ? r.status
    : "queued") as FlashJob["status"],
  error: typeof r.error === "string" ? r.error : null,
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

// A job queued for the server: the cards that need it now (not verified
// and not read as they are, for the check; with empty explanations, for
// the fill). One of each kind a topic at a time.
export async function startServerJob(
  topicId: string,
  kind: "check" | "fill",
  ids: string[],
): Promise<FlashJob> {
  const { topic, cards } = await getTopic(topicId);
  const want = new Set(ids);
  const todo = cards
    .filter(
      (c) =>
        want.has(c.id) &&
        !c.removed &&
        (kind === "check" ? needsCheck(c) : M.emptyColumns(c, topic.columns).length > 0),
    )
    .map((c) => c.id);
  if (!todo.length) throw new Error("Nothing to do: every card asked for is done already");
  const { data: running, error: e0 } = await from("flash_jobs")
    .select("id")
    .eq("topic_id", topicId)
    .eq("kind", kind)
    .in("status", ["queued", "running"]);
  jobFail(e0);
  if ((running ?? []).length)
    throw new Error("This topic already has that job on the server: stop it or wait for it");
  const { data, error } = await from("flash_jobs")
    .insert({ topic_id: topicId, kind, ids: todo, total: todo.length } as never)
    .select(JOB_COLS)
    .single();
  jobFail(error);
  return readJob(data as unknown as Row);
}

export async function listServerJobs(topicId: string): Promise<FlashJob[]> {
  const { data, error } = await from("flash_jobs")
    .select(JOB_COLS)
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(5);
  // Before the migration: no jobs.
  if (error && /flash_jobs/.test(error.message)) return [];
  fail(error);
  return ((data ?? []) as Row[]).map(readJob);
}

export async function stopServerJob(id: string): Promise<FlashJob> {
  const { data, error } = await from("flash_jobs")
    .update({ status: "stopped", locked_until: null, updated_at: now() } as never)
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select(JOB_COLS)
    .maybeSingle();
  jobFail(error);
  if (!data) throw new Error("The job had already finished");
  return readJob(data as unknown as Row);
}

// One step of the oldest job waiting: its next few batches, side by side
// (the check reads 20 cards a batch, the fill 10). A job claims itself for
// two minutes so two ticks don't run it at once. Three failures in a row
// stop it with the error.
export async function jobStep(batches = 3): Promise<FlashJob | null> {
  const at = now();
  const { data: waiting, error } = await from("flash_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .or(`locked_until.is.null,locked_until.lt.${at}`)
    .order("created_at")
    .limit(1);
  if (error && /flash_jobs/.test(error.message)) return null;
  fail(error);
  const row = ((waiting ?? []) as Row[])[0];
  if (!row) return null;
  // Claimed only if no other tick claimed it since.
  const { data: claimed, error: e2 } = await from("flash_jobs")
    .update({
      status: "running",
      locked_until: new Date(Date.now() + 120_000).toISOString(),
      updated_at: at,
    } as never)
    .eq("id", String(row.id))
    .eq("updated_at", String(row.updated_at))
    .select("*")
    .maybeSingle();
  fail(e2);
  if (!claimed) return null;
  const job = claimed as unknown as Row;
  const ids = (Array.isArray(job.ids) ? job.ids : []).map(String);
  const size = job.kind === "fill" ? 10 : 20;
  const parts: string[][] = [];
  for (let i = 0; i < Math.min(ids.length, size * batches); i += size)
    parts.push(ids.slice(i, i + size));
  const topicId = String(job.topic_id);
  const results = await Promise.allSettled(
    parts.map((p) =>
      job.kind === "fill"
        ? fillExplanations(topicId, p).then((r) => r.filled)
        : checkCards(topicId, p).then((r) => r.flagged),
    ),
  );
  const ok = results
    .map((r, i) => ({ r, ids: parts[i] }))
    .filter((x) => x.r.status === "fulfilled");
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  const doneIds = new Set(ok.flatMap((x) => x.ids));
  const left = ids.filter((id) => !doneIds.has(id));
  const fails = failed && !ok.length ? (Number(job.fails) || 0) + 1 : 0;
  const status = !left.length ? "done" : fails >= 3 ? "failed" : "running";
  const { data: saved, error: e3 } = await from("flash_jobs")
    .update({
      ids: left,
      done: (Number(job.done) || 0) + doneIds.size,
      found:
        (Number(job.found) || 0) +
        ok.reduce((n, x) => n + ((x.r as PromiseFulfilledResult<number>).value || 0), 0),
      fails,
      status,
      error: failed
        ? String(failed.reason instanceof Error ? failed.reason.message : failed.reason).slice(
            0,
            500,
          )
        : null,
      locked_until: null,
      updated_at: now(),
    } as never)
    .eq("id", String(job.id))
    // Stopped meanwhile: stays stopped (its progress is kept).
    .eq("status", "running")
    .select(JOB_COLS)
    .maybeSingle();
  fail(e3);
  return saved ? readJob(saved as unknown as Row) : null;
}

// ---------- Find and replace ----------

// Replacements picked from the preview, made where the field still reads
// as it did then (each card's old text kept in its history). `reverify`:
// changed cards need verifying again.
export async function replaceText(
  topicId: string,
  edits: { id: string; field: string; before: string; after: string }[],
  reverify: boolean,
): Promise<{ changed: number; skipped: number; cards: FlashCard[] }> {
  const cards = await topicCards(topicId);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const patches = new Map<string, Row>();
  let skipped = 0;
  for (const e of edits) {
    const c = byId.get(e.id);
    if (!c || c.removed || fieldText(c, e.field) !== e.before) {
      skipped++;
      continue;
    }
    const p = patches.get(c.id) ?? { front: c.front, back: c.back, ex: { ...c.ex }, own: c.own };
    if (e.field === "front") p.front = e.after;
    else if (e.field === "back") p.back = e.after;
    else if (e.field.startsWith("ex:")) {
      (p.ex as Record<string, string>)[e.field.slice(3)] = e.after;
      p.own = (p.own as string[]).filter((o) => `ex:${o}` !== e.field);
    } else {
      skipped++;
      continue;
    }
    if (reverify) p.verified = false;
    patches.set(c.id, p);
  }
  const out = await writeEdits(
    topicId,
    [...patches].map(([id, patch]) => ({ id, patch })),
  );
  return { changed: out.length, skipped, cards: out };
}

// ---------- Recently deleted ----------

// Cards deleted, each kept whole in the bin for 30 days first (before the
// bin's migration: deleted without being kept).
async function deleteKept(ids: string[], why: string) {
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data, error } = await from("flash_cards").select("*").in("id", part);
    fail(error);
    const rows = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      topic_id: r.topic_id,
      card: r,
      why,
      deleted_at: now(),
    }));
    if (rows.length) {
      const { error: e2 } = await from("flash_trash").upsert(rows as never, { onConflict: "id" });
      if (e2 && !/flash_trash/.test(e2.message)) fail(e2);
    }
    fail((await from("flash_cards").delete().in("id", part)).error);
  }
}

export type TrashItem = {
  id: string;
  front: string;
  back: string;
  why: string;
  deleted_at: string;
};

// The topic's bin (those over 30 days old emptied out first).
export async function listTrash(topicId: string): Promise<TrashItem[]> {
  const cut = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const old = await from("flash_trash").delete().eq("topic_id", topicId).lt("deleted_at", cut);
  if (old.error && /flash_trash/.test(old.error.message)) return [];
  fail(old.error);
  const { data, error } = await from("flash_trash")
    .select("id,card,why,deleted_at")
    .eq("topic_id", topicId)
    .order("deleted_at", { ascending: false })
    .limit(2000);
  fail(error);
  return ((data ?? []) as Row[]).map((r) => {
    const c = (r.card ?? {}) as Row;
    return {
      id: String(r.id),
      front: String(c.front ?? ""),
      back: String(c.back ?? ""),
      why: String(r.why ?? ""),
      deleted_at: String(r.deleted_at),
    };
  });
}

// Cards back from the bin, as they were.
export async function restoreTrash(topicId: string, ids: string[]): Promise<{ restored: number }> {
  let restored = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await from("flash_trash")
      .select("id,card")
      .eq("topic_id", topicId)
      .in("id", ids.slice(i, i + 200));
    fail(error);
    const rows: Row[] = ((data ?? []) as Row[]).map((r) => ({
      ...(r.card as Row),
      updated_at: now(),
    }));
    if (!rows.length) continue;
    fail(
      (
        await from("flash_cards").upsert(rows as never, {
          onConflict: "id",
          ignoreDuplicates: true,
        })
      ).error,
    );
    fail(
      (
        await from("flash_trash")
          .delete()
          .in(
            "id",
            rows.map((r) => String(r.id)),
          )
      ).error,
    );
    restored += rows.length;
  }
  await touch(topicId);
  return { restored };
}

// ---------- Undo ----------

export type CardState = Pick<
  FlashCard,
  | "id"
  | "front"
  | "back"
  | "ex"
  | "own"
  | "verified"
  | "error"
  | "error_type"
  | "note"
  | "ai"
  | "removed"
>;

// Cards put back as they were before an action (their text and marks).
export async function restoreStates(
  topicId: string,
  states: CardState[],
): Promise<{ changed: number; cards: FlashCard[] }> {
  const out = await writeEdits(
    topicId,
    states.map(({ id, ...patch }) => ({ id, patch: { ...patch, ex: normalizeEx(patch.ex) } })),
  );
  return { changed: out.length, cards: out };
}

// ---------- Book text ----------

export type BookPassage = { from: "book" | "saathi"; label: string; text: string };

const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);

// What the books say about a card, to check what the AI wrote beside it:
// the card's own books' text where its word is (from the sheets' sources),
// then the closest passages in SAATHI's knowledge base.
export async function bookText(
  topicId: string,
  cardId: string,
): Promise<{ passages: BookPassage[] }> {
  const { data, error } = await from("flash_cards")
    .select("*")
    .eq("id", cardId)
    .eq("topic_id", topicId)
    .maybeSingle();
  fail(error);
  if (!data) throw new Error("This card isn't in the topic any more.");
  const card = readCard(data as unknown as Row);
  const srcs = [...card.sources, ...card.variants.flatMap((v) => (v.source ? [v.source] : []))];
  const ids = [...new Set(srcs.map((s) => s.src).filter(Boolean))];
  const passages: BookPassage[] = [];
  if (ids.length) {
    const { data: rows, error: e2 } = await from("flash_sources").select("id,pieces").in("id", ids);
    fail(e2);
    for (const r of (rows ?? []) as Row[]) {
      const pieces = Array.isArray(r.pieces) ? (r.pieces as string[]) : [];
      const text = M.passageFor(pieces, card.front, 1200).trim();
      const book = srcs.find((s) => s.src === r.id)?.book ?? "";
      if (text) passages.push({ from: "book", label: book || "The book", text });
    }
  }
  const { data: subj } = await supabaseAdmin
    .from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  const subjects = [
    ...new Set(((subj ?? []) as { subject: string }[]).map((r) => r.subject)),
  ].filter(Boolean);
  if (subjects.length) {
    const query = [card.front, card.back].join("\n").slice(0, 1000);
    const matches = await saathiSearchQuery(
      apiKey(),
      rpc,
      { standalone: query, english: null },
      subjects,
    )
      .then((m) => relevantMatches(m).slice(0, 3))
      .catch(() => []);
    for (const m of matches)
      passages.push({ from: "saathi", label: matchLabel(m), text: m.content.slice(0, 1500) });
  }
  return { passages };
}
