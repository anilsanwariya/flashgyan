// Proofreading a topic's cards: the same word from several books found and
// merged into one card (the other books' versions kept with it), the
// answers of list cards (synonyms…) combined from all the books with how
// many give each, the books' disagreements shown, and the AI's two helpers:
// filling empty explanations (from the books first, its own knowledge
// marked) and checking cards (it only flags). Pure: shared by the server,
// the admin panel and tests.
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";
import { parseJsonLoose } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  ERROR_TYPES,
  wordKey,
  type FlashCard,
  type FlashColumn,
  type FlashExample,
} from "@/lib/flash-studio";

// ---------- The same word in several books ----------

// A card's front as a key: each line (or "/"-separated part) without
// "‣ – -" marks, spelling folded, the parts in any order.
export function dupKey(front: string): string {
  return front
    .split(/\n|\s\/\s/)
    .map((l) => wordKey(l.replace(/^[‣◆•\s]+/, "").replace(/\s*[-–—:]\s*$/, "")))
    .filter(Boolean)
    .sort()
    .join("|");
}

export type DupGroup = { key: string; cards: FlashCard[]; books: string[]; sameBook: boolean };

// Live cards whose fronts are the same word, two or more to a group, in the
// order the first of each appears.
export function groupDuplicates(cards: FlashCard[]): DupGroup[] {
  const by = new Map<string, FlashCard[]>();
  for (const c of cards) {
    if (c.removed) continue;
    const k = dupKey(c.front);
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  return [...by]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const books = list.map((c) => c.sources[0]?.book ?? "");
      return {
        key,
        cards: [...list].sort((a, b) => a.pos - b.pos),
        books: [...new Set(books.filter(Boolean))],
        sameBook: books.some((b, i) => b && books.indexOf(b) !== i),
      };
    })
    .sort((a, b) => a.cards[0].pos - b.cards[0].pos);
}

// The main card of a group: from the first book in the topic's order (then
// the earliest), so a merge keeps the preferred book's version in front.
export function mainOf(cards: FlashCard[], bookOrder: string[]): FlashCard {
  const rank = (c: FlashCard) => {
    const i = bookOrder.indexOf(c.sources[0]?.book ?? "");
    return i < 0 ? bookOrder.length : i;
  };
  return [...cards].sort(
    (a, b) =>
      Number(a.card_order === null) - Number(b.card_order === null) ||
      rank(a) - rank(b) ||
      a.pos - b.pos,
  )[0];
}

export type Version = { book: string; front: string; back: string; ex: Record<string, string> };

// A card's own version and the other books' it was merged with.
export function versionsOf(
  c: Pick<FlashCard, "front" | "back" | "ex" | "sources" | "variants">,
): Version[] {
  return [
    { book: c.sources[0]?.book ?? "", front: c.front, back: c.back, ex: c.ex },
    ...c.variants.map((v) => ({ book: v.book, front: v.front, back: v.back, ex: v.ex })),
  ];
}

export const booksOf = (c: Pick<FlashCard, "sources" | "variants">) => [
  ...new Set([...c.sources.map((s) => s.book), ...c.variants.map((v) => v.book)].filter(Boolean)),
];

// ---------- Combining list answers ----------

// The items of an answer: "a, b, c", one per line, numbered meanings
// ("1. a, b\n2. c") each kept with its number.
export function listItems(back: string): { meaning: number; text: string }[] {
  const out: { meaning: number; text: string }[] = [];
  let meaning = 0;
  for (const raw of back.split("\n")) {
    let line = raw.replace(/^[‣◆•\s]+/, "").trim();
    const m = /^(\d+)[.)]\s*/.exec(line);
    if (m) {
      meaning = Number(m[1]);
      line = line.slice(m[0].length);
    }
    for (const part of line.split(/[,،;]/)) {
      const text = part.replace(/[।.]+$/, "").trim();
      if (text) out.push({ meaning, text });
    }
  }
  return out;
}

export type Chip = {
  text: string;
  key: string;
  meaning: number;
  books: string[];
  spellings: string[];
};

// Every item any book gives, once, with the books that give it (spellings
// folded together; the first spelling seen shown). Most books first, then
// the order they came in.
export function combineItems(versions: Version[]): Chip[] {
  const chips: (Chip & { first: number })[] = [];
  let n = 0;
  for (const v of versions)
    for (const it of listItems(v.back)) {
      const key = `${it.meaning}:${wordKey(it.text)}`;
      const found = chips.find((c) => c.key === key);
      if (found) {
        if (v.book && !found.books.includes(v.book)) found.books.push(v.book);
        if (!found.spellings.includes(it.text)) found.spellings.push(it.text);
      } else
        chips.push({
          text: it.text,
          key,
          meaning: it.meaning,
          books: v.book ? [v.book] : [],
          spellings: [it.text],
          first: n++,
        });
    }
  return chips
    .sort((a, b) => a.meaning - b.meaning || b.books.length - a.books.length || a.first - b.first)
    .map(({ first: _f, ...c }) => c);
}

// An answer from the chosen chips: "a, b, c", or numbered meanings on
// their own lines.
export function backFromChips(chips: Pick<Chip, "text" | "meaning">[]): string {
  const meanings = [...new Set(chips.map((c) => c.meaning))].sort((a, b) => a - b);
  if (meanings.length <= 1 && !meanings[0]) return chips.map((c) => c.text).join(", ");
  return meanings
    .map(
      (m, i) =>
        `${m || i + 1}. ${chips
          .filter((c) => c.meaning === m)
          .map((c) => c.text)
          .join(", ")}`,
    )
    .join("\n");
}

// Whether the books disagree on the answer (as a set of items, spelling
// folded) or spell the front differently.
export function disagreement(c: Pick<FlashCard, "front" | "back" | "ex" | "sources" | "variants">) {
  const vs = versionsOf(c);
  if (vs.length < 2) return { answer: false, spelling: false };
  const set = (back: string) =>
    listItems(back)
      .map((i) => `${i.meaning}:${wordKey(i.text)}`)
      .sort()
      .join("|");
  const answers = new Set(vs.map((v) => set(v.back)));
  const fronts = new Set(vs.map((v) => v.front.replace(/\s+/g, " ").trim()));
  return { answer: answers.size > 1, spelling: fronts.size > 1 };
}

// Whether a card's answer is a list worth combining (any version has two
// or more items).
export const isList = (vs: Version[]) => vs.some((v) => listItems(v.back).length > 1);

// ---------- Explanations from the books ----------

// The column ids still empty on a card.
export const emptyColumns = (c: Pick<FlashCard, "ex">, columns: FlashColumn[]) =>
  columns.filter((col) => !(c.ex[col.id] ?? "").trim()).map((col) => col.id);

// Explanations other cards already have from the same book's heading and
// rule (a rule's explanation is the same for all its examples): copied,
// as from the books.
export function fromSiblings(card: FlashCard, cards: FlashCard[], columns: FlashColumn[]) {
  const s = card.sources[0];
  if (!s?.rule || !s.heading) return {};
  const out: Record<string, string> = {};
  for (const id of emptyColumns(card, columns)) {
    const sib = cards.find(
      (o) =>
        o.id !== card.id &&
        !o.removed &&
        o.sources[0]?.book === s.book &&
        o.sources[0]?.heading === s.heading &&
        o.sources[0]?.rule === s.rule &&
        (o.ex[id] ?? "").trim() &&
        !o.own.includes(id),
    );
    if (sib) out[id] = sib.ex[id];
  }
  return out;
}

// The part of a book's text around a card's word (for the AI to explain
// it from), or "".
export function passageFor(pieces: string[], front: string, size = 1600): string {
  const words = front
    .split(/\n|\+|\s\/\s/)
    .map((w) => w.replace(/[‣◆•\-–:]/g, "").trim())
    .filter((w) => w.length > 1);
  for (const w of words)
    for (const p of pieces) {
      const at = p.indexOf(w);
      if (at < 0) continue;
      const start = Math.max(0, at - size / 2);
      return p.slice(start, start + size);
    }
  return "";
}

type Deck = { name: string; prompt: string; columns: FlashColumn[]; examples: FlashExample[] };

export type FillItem = {
  n: number;
  front: string;
  back: string;
  heading: string;
  rule: string;
  // Filled columns, by title.
  have: Record<string, string>;
  // Empty columns to fill, by title.
  want: string[];
  passage: string;
};

export function fillMessages(deck: Deck, items: FillItem[]): ChatMessage[] {
  const cols = deck.columns
    .map((c) => `- "${c.title}": ${c.hint || "as the books explain it"}`)
    .join("\n");
  const examples = deck.examples
    .slice(0, 2)
    .map((e) => JSON.stringify({ front: e.front, back: e.back, ex: e.ex }))
    .join("\n");
  return [
    {
      role: "system",
      content: `You write the explanation columns of Hindi flashcards for FlashGyan, an app for Rajasthan's competitive exams (RPSC, RSSB). Deck type: ${deck.name}; each card asks "${deck.prompt.trim()}".
Columns:
${cols}
Finished cards in the house style (copy their form, length and symbols):
${examples || "(none)"}

For each card, fill ONLY the columns listed under "fill". Use the book passage given with the card first; mark such a value "from": "book". When the passage doesn't say it, write it from your own knowledge and mark it "from": "own" (the editor checks those). Never change the front or back. Write in Hindi unless the column is English (e.g. Pronunciation, Sentence-Usage). Be exact and short; no value is better than a doubtful one, so leave a column out when unsure.
Reply with JSON only: {"cards": [{"n": 1, "ex": {"<column title>": {"text": "...", "from": "book"}}}]}`,
    },
    {
      role: "user",
      content: items
        .map(
          (it) =>
            `Card ${it.n}\nfront: ${it.front}\nback: ${it.back}\n${it.heading ? `heading: ${it.heading}\n` : ""}${it.rule ? `rule: ${it.rule}\n` : ""}${Object.entries(
              it.have,
            )
              .map(([k, v]) => `${k}: ${v}`)
              .join(
                "\n",
              )}${Object.keys(it.have).length ? "\n" : ""}fill: ${it.want.join(", ")}\nbook passage: ${it.passage || "(none)"}`,
        )
        .join("\n\n"),
    },
  ];
}

export type Filled = Map<number, { ex: Record<string, string>; own: string[] }>;

// The AI's explanations by card number: values by column id, and which
// came from its own knowledge. Only the columns asked for are kept.
export function parseFill(raw: string, columns: FlashColumn[], items: FillItem[]): Filled {
  const o = parseJsonLoose<{ cards?: unknown }>(raw);
  if (!o || !Array.isArray(o.cards)) throw new Error("The AI's reply couldn't be read");
  const byTitle = new Map(columns.map((c) => [c.title.trim(), c.id]));
  const out: Filled = new Map();
  for (const c of o.cards as Record<string, unknown>[]) {
    const n = Number(c?.n);
    const item = items.find((i) => i.n === n);
    if (!item) continue;
    const ex: Record<string, string> = {};
    const own: string[] = [];
    for (const [title, v] of Object.entries((c.ex ?? {}) as Record<string, unknown>)) {
      const id = byTitle.get(title.trim());
      if (!id || !item.want.includes(title.trim())) continue;
      const val =
        typeof v === "string" ? { text: v, from: "own" } : ((v ?? {}) as Record<string, unknown>);
      const text = typeof val.text === "string" ? val.text.trim().slice(0, 8000) : "";
      if (!text) continue;
      ex[id] = text;
      if (val.from !== "book") own.push(id);
    }
    out.set(n, { ex, own });
  }
  return out;
}

// ---------- The AI check ----------

export type CheckItem = { n: number; front: string; back: string; ex: Record<string, string> };

export function checkMessages(deck: Deck, items: CheckItem[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You proofread Hindi flashcards for FlashGyan (Rajasthan's competitive exams: RPSC, RSSB) before students see them. Deck type: ${deck.name}; each card asks "${deck.prompt.trim()}".
Report only real problems a careful Hindi teacher would fix: a misspelt word (वर्तनी: matras, nukta, halant, anusvara), a wrong or incomplete answer, an explanation that is wrong or doesn't fit the card, the wrong rule or type (e.g. a संधि named wrongly), or a form that breaks the deck's style. Don't report style preferences or spellings both of which are accepted. A card with no problem is left out.
Kinds: ${ERROR_TYPES.filter((t) => t !== "Check in book" && t !== "Other").join(", ")}, Other.
Reply with JSON only: {"flags": [{"n": 1, "type": "Spelling", "note": "what is wrong and the fix, in a few words"}]}`,
    },
    {
      role: "user",
      content: items
        .map(
          (it) =>
            `Card ${it.n}\nfront: ${it.front}\nback: ${it.back}${Object.entries(it.ex)
              .map(([k, v]) => `\n${k}: ${v}`)
              .join("")}`,
        )
        .join("\n\n"),
    },
  ];
}

export function parseCheck(
  raw: string,
  items: CheckItem[],
): { n: number; type: string; note: string }[] {
  const o = parseJsonLoose<{ flags?: unknown }>(raw);
  if (!o || !Array.isArray(o.flags)) throw new Error("The AI's reply couldn't be read");
  const ns = new Set(items.map((i) => i.n));
  return (o.flags as Record<string, unknown>[])
    .map((f) => ({
      n: Number(f?.n),
      type: ERROR_TYPES.includes(String(f?.type)) ? String(f?.type) : "Other",
      note: typeof f?.note === "string" ? f.note.trim().slice(0, 500) : "",
    }))
    .filter((f) => ns.has(f.n) && f.note);
}
