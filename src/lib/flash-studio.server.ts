// Server-only flashcard studio: templates, topics and cards; reading a sheet
// into a topic, numbering its chunks once, and keeping the app's ids.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
  planNumbers,
  wordKeyOf,
  BOOK_COLORS,
  type FlashCard,
  type FlashColumn,
  type FlashTemplate,
  type FlashTopic,
  type IdMatch,
  type SheetCard,
  type WordKey,
} from "@/lib/flash-studio";

const from = (table: string) => supabaseAdmin.from(table as never);
const missing = (e: { message: string } | null) =>
  !!e &&
  /flash_(templates|topics|cards).*(does not exist|schema cache)|Could not find the table/.test(
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
  error: r.error === true,
  error_type: String(r.error_type ?? ""),
  verified: r.verified === true,
  removed: r.removed === true,
  chunk: typeof r.chunk === "number" ? r.chunk : null,
  card_order: typeof r.card_order === "number" ? r.card_order : null,
  app_id: typeof r.app_id === "string" && r.app_id ? r.app_id : null,
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
  const [topic, cards] = await Promise.all([topicRow(id), topicCards(id)]);
  return { topic, cards };
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
  sheet: { cards: SheetCard[]; columns: string[]; prompt: string; book: string },
  keepNumbers: boolean,
): Promise<ImportResult> {
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
      sources: book ? [{ book, pos: c.book_order }] : [],
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
    fail((await from("flash_cards").delete().eq("id", id)).error);
    await touch(card.topic_id);
    return "deleted";
  }
  await saveCard(id, { removed: true });
  return "removed";
}

// ---------- Numbering ----------

// The cards without numbers shuffled, split into chunks of the given sizes
// and numbered on from the topic's last number. Done once per card.
export async function numberCards(topicId: string, sizes: number[], seed: number) {
  const { topic, cards } = await getTopic(topicId);
  const ids = cards.filter((c) => c.card_order === null && !c.removed).map((c) => c.id);
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
