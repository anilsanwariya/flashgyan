// Sheets coming back to a topic: a book's sheet replacing the version added
// before (matched card by card, so unchanged cards keep their merges,
// edits and verified marks), and the working sheet — the whole topic
// downloaded with each card's id, edited in Excel and uploaded back onto
// the same cards. Pure: shared by the server, the panel and tests.
import { dupKey } from "@/lib/flash-merge";
import type { FlashCard, FlashColumn, SheetCard } from "@/lib/flash-studio";

type Text = { front: string; back: string; ex: Record<string, string> };

// ---------- Replacing a book's sheet ----------

export type ReplaceItem = {
  id: string;
  // The book's version merged into another book's card: its place there.
  variant: number | null;
  numbered: boolean;
  before: Text;
};

export type ReplacePlan = {
  same: number;
  changed: (ReplaceItem & { after: Text })[];
  // The new sheet's rows matching nothing before (their places in it).
  added: number[];
  gone: ReplaceItem[];
};

// The sheet's explanation cells by column id (blank cells left out: a blank
// in the new sheet doesn't wipe what the card has).
export const sheetEx = (c: SheetCard, idOf: Map<string, string>) => {
  const ex: Record<string, string> = {};
  for (const [title, v] of Object.entries(c.ex)) {
    const id = idOf.get(title.trim());
    if (id && v.trim()) ex[id] = v;
  }
  return ex;
};

const sameText = (a: Text, b: Text) =>
  a.front.trim() === b.front.trim() &&
  a.back.trim() === b.back.trim() &&
  Object.keys({ ...a.ex, ...b.ex }).every((k) => (a.ex[k] ?? "").trim() === (b.ex[k] ?? "").trim());

// What replacing sheet `src` with these rows does: each row matched to the
// card (or merged version) the old sheet gave the same word, in order.
export function planReplace(
  cards: FlashCard[],
  src: string,
  rows: SheetCard[],
  idOf: Map<string, string>,
): ReplacePlan {
  const old: ReplaceItem[] = [];
  for (const c of cards) {
    if (c.removed) continue;
    if (c.sources[0]?.src === src)
      old.push({
        id: c.id,
        variant: null,
        numbered: c.card_order !== null,
        before: { front: c.front, back: c.back, ex: c.ex },
      });
    c.variants.forEach((v, i) => {
      if (v.source?.src === src)
        old.push({
          id: c.id,
          variant: i,
          numbered: false,
          before: { front: v.front, back: v.back, ex: v.ex },
        });
    });
  }
  const byKey = new Map<string, ReplaceItem[]>();
  for (const o of old) {
    const k = dupKey(o.before.front) || o.before.front.trim();
    byKey.set(k, [...(byKey.get(k) ?? []), o]);
  }
  const plan: ReplacePlan = { same: 0, changed: [], added: [], gone: [] };
  rows.forEach((r, i) => {
    const k = dupKey(r.front) || r.front.trim();
    const match = byKey.get(k)?.shift();
    if (!match) return plan.added.push(i);
    const after = {
      front: r.front,
      back: r.back,
      ex: { ...match.before.ex, ...sheetEx(r, idOf) },
    };
    if (sameText(match.before, after)) plan.same++;
    else plan.changed.push({ ...match, after });
  });
  for (const list of byKey.values()) plan.gone.push(...list);
  return plan;
}

// ---------- The working sheet ----------

export const WORKING_ID = "card_id";

// The topic's live cards as rows: card_id, book, order, front, back, every
// explanation, verified, note.
export function workingRows(cards: FlashCard[], columns: FlashColumn[]): (string | number)[][] {
  const head = [
    WORKING_ID,
    "book",
    "order",
    "front",
    "back",
    ...columns.map((c) => `explanation_${c.title}`),
    "verified",
    "note",
  ];
  return [
    head,
    ...cards
      .filter((c) => !c.removed)
      .map((c) => [
        c.id,
        c.sources.map((s) => s.book).join(", "),
        c.card_order ?? "",
        c.front,
        c.back,
        ...columns.map((col) => c.ex[col.id] ?? ""),
        c.verified ? 1 : 0,
        c.note,
      ]),
  ];
}

export type WorkingRow = {
  id: string;
  book: string;
  front: string;
  back: string;
  // By column id; every known column (an empty cell clears it).
  ex: Record<string, string>;
  verified: boolean | null;
  note: string | null;
};

const cell = (v: unknown) =>
  v === null || v === undefined ? "" : typeof v === "number" ? String(v) : String(v);

// A working sheet read back: null when the rows aren't one (no card_id
// column). Columns it names that the topic doesn't have are listed.
export function parseWorking(
  rows: unknown[][],
  columns: FlashColumn[],
): { rows: WorkingRow[]; unknown: string[] } | null {
  const at = rows.findIndex((r) =>
    (r ?? []).some((c) => cell(c).trim().toLowerCase() === WORKING_ID),
  );
  if (at < 0) return null;
  const head = (rows[at] ?? []).map((c) => cell(c).trim());
  const find = (name: string) => head.findIndex((h) => h.toLowerCase() === name);
  const ix = {
    id: find(WORKING_ID),
    book: find("book"),
    front: find("front"),
    back: find("back"),
    verified: find("verified"),
    note: find("note"),
  };
  const exCols = head
    .map((h, i) => ({
      i,
      title: h.replace(/^explanation_/i, "").trim(),
      is: /^explanation_/i.test(h),
    }))
    .filter((c) => c.is && c.title);
  const unknown = exCols
    .filter((c) => !columns.some((col) => col.title.trim() === c.title))
    .map((c) => c.title);
  const out: WorkingRow[] = [];
  for (const r of rows.slice(at + 1)) {
    const get = (i: number) => (i >= 0 ? cell((r ?? [])[i]) : "");
    const front = get(ix.front);
    const back = get(ix.back);
    if (!front.trim() && !back.trim() && !get(ix.id).trim()) continue;
    const ex: Record<string, string> = {};
    for (const e of exCols) {
      const col = columns.find((c) => c.title.trim() === e.title);
      if (col) ex[col.id] = get(e.i);
    }
    const v = get(ix.verified).trim().toLowerCase();
    out.push({
      id: get(ix.id).trim(),
      book: get(ix.book).split(",")[0].trim(),
      front,
      back,
      ex,
      verified: ix.verified < 0 || !v ? null : ["1", "true", "yes", "y", "✓"].includes(v),
      note: ix.note < 0 ? null : get(ix.note),
    });
  }
  return { rows: out, unknown };
}

export type WorkingPlan = {
  same: number;
  changed: { id: string; before: FlashCard; after: WorkingRow }[];
  // Rows without a card id: new cards.
  added: WorkingRow[];
  // Ids that aren't (live) cards of this topic.
  unknown: string[];
};

export function planWorking(cards: FlashCard[], rows: WorkingRow[]): WorkingPlan {
  const byId = new Map(cards.filter((c) => !c.removed).map((c) => [c.id, c]));
  const plan: WorkingPlan = { same: 0, changed: [], added: [], unknown: [] };
  for (const r of rows) {
    if (!r.id) {
      if (r.front.trim()) plan.added.push(r);
      continue;
    }
    const c = byId.get(r.id);
    if (!c) {
      plan.unknown.push(r.id);
      continue;
    }
    const text = sameText(
      {
        front: c.front,
        back: c.back,
        ex: Object.fromEntries(Object.keys(r.ex).map((k) => [k, c.ex[k] ?? ""])),
      },
      { front: r.front, back: r.back, ex: r.ex },
    );
    const same =
      text &&
      (r.verified === null || r.verified === c.verified) &&
      (r.note === null || r.note.trim() === c.note.trim());
    if (same) plan.same++;
    else plan.changed.push({ id: c.id, before: c, after: r });
  }
  return plan;
}

// The change a working-sheet row makes to its card. Changed text unverifies
// it, unless the sheet's verified mark was changed to say so.
export function workingPatch(c: FlashCard, r: WorkingRow): Record<string, unknown> {
  const ex = { ...c.ex };
  for (const [k, v] of Object.entries(r.ex)) {
    if (v.trim()) ex[k] = v;
    else delete ex[k];
  }
  const textChanged = !sameText(
    { front: c.front, back: c.back, ex: c.ex },
    { front: r.front, back: r.back, ex },
  );
  const patch: Record<string, unknown> = {};
  if (textChanged) {
    patch.front = r.front;
    patch.back = r.back;
    patch.ex = ex;
    // Columns written by the AI and now edited are the editor's.
    patch.own = c.own.filter((o) => (c.ex[o] ?? "") === (ex[o] ?? ""));
  }
  // The verified column counts when it was changed in the sheet; left as
  // it was, changed text needs verifying again.
  if (r.verified !== null && r.verified !== c.verified) patch.verified = r.verified;
  else if (textChanged) patch.verified = false;
  if (r.note !== null && r.note.trim() !== c.note.trim()) patch.note = r.note;
  return patch;
}

// ---------- What changed since a chunk's download ----------

export type ChangeRow = {
  chunk: number;
  order: number | null;
  appId: string;
  word: string;
  // "front", "back", "explanation_<title>", or "removed".
  field: string;
  before: string;
  after: string;
};

type Version = { at: string; front: string; back: string; ex: Record<string, string> };

// Each card of these chunks changed since the chunk's download: every
// field whose text differs from the text at the download (from the card's
// history: the oldest version saved after it), and cards removed. Cards
// changed only in their marks (verified, notes, the AI's reading) are
// counted, not listed: nothing of them goes to the app.
export function chunkChangeRows(
  topic: { chunks: { n: number; downloaded?: string | null }[]; columns: FlashColumn[] },
  cards: FlashCard[],
  history: Map<string, Version[]>,
  chunks: number[],
): { rows: ChangeRow[]; marksOnly: number; older: number } {
  const rows: ChangeRow[] = [];
  let marksOnly = 0;
  let older = 0;
  for (const ch of topic.chunks) {
    if (!chunks.includes(ch.n) || !ch.downloaded) continue;
    const at = Date.parse(ch.downloaded);
    const changed = cards
      .filter((c) => c.chunk === ch.n && Date.parse(c.updated_at) > at)
      .sort((a, b) => (a.card_order ?? 0) - (b.card_order ?? 0));
    for (const c of changed) {
      const base = {
        chunk: ch.n,
        order: c.card_order,
        appId: c.app_id ?? "",
        word: c.front.split("\n")[0].trim(),
      };
      if (c.removed) {
        rows.push({ ...base, field: "removed", before: "", after: "delete this card in the app" });
        continue;
      }
      // Newest first: the last one saved after the download holds the text
      // as it was then.
      const after = (history.get(c.id) ?? []).filter((v) => Date.parse(v.at) > at);
      const then = after[after.length - 1];
      if (!then) {
        marksOnly++;
        continue;
      }
      // History keeps 20 versions: with that many since, the oldest may be
      // later than the download.
      if (after.length >= 20) older++;
      const diffs: [string, string, string][] = [
        ["front", then.front, c.front],
        ["back", then.back, c.back],
        ...topic.columns.map((col): [string, string, string] => [
          `explanation_${col.title}`,
          then.ex[col.id] ?? "",
          c.ex[col.id] ?? "",
        ]),
      ];
      const own = diffs.filter(([, b, a]) => b.trim() !== a.trim());
      if (!own.length) marksOnly++;
      for (const [field, before, now] of own) rows.push({ ...base, field, before, after: now });
    }
  }
  return { rows, marksOnly, older };
}

export const CHANGE_HEAD = ["chunk", "order", "id", "word", "field", "before", "after"];

export const changeSheet = (rows: ChangeRow[]): (string | number)[][] => [
  CHANGE_HEAD,
  ...rows.map((r) => [r.chunk, r.order ?? "", r.appId, r.word, r.field, r.before, r.after]),
];
