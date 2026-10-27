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
  // A numbered card first (its number is in the app), then the one with
  // the most explanations, then the books' order.
  return [...cards].sort(
    (a, b) =>
      Number(a.card_order === null) - Number(b.card_order === null) ||
      filledCount(b) - filledCount(a) ||
      rank(a) - rank(b) ||
      a.pos - b.pos,
  )[0];
}

// How many explanation columns a card (or a book's version) has filled.
export const filledCount = (c: Pick<FlashCard, "ex">) =>
  Object.values(c.ex).filter((v) => (v ?? "").trim()).length;

// The columns where two of these cards say different things: merged, the
// main card keeps its own and the other wording stays in its version.
export function exConflicts(cards: Pick<FlashCard, "ex">[], columns: FlashColumn[]): FlashColumn[] {
  return columns.filter((col) => {
    const said = new Set(
      cards.map((c) => (c.ex[col.id] ?? "").trim().replace(/[।.]$/, "")).filter(Boolean),
    );
    return said.size > 1;
  });
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

type Deck = {
  name: string;
  prompt: string;
  columns: FlashColumn[];
  examples: FlashExample[];
  // The front is the wrong form on purpose (शब्द शुद्धि, वाक्य शुद्धि).
  wrongFront?: boolean;
};

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

// `wordings`: by column title, the values the editor already uses again and
// again (a kind, a rule): the AI reuses one exactly when it fits.
export function fillMessages(
  deck: Deck,
  items: FillItem[],
  wordings: Record<string, string[]> = {},
  // The house spellings of the cards' words.
  house: string[] = [],
): ChatMessage[] {
  const cols = deck.columns
    .map((c) => {
      const used = wordings[c.title] ?? [];
      return `- "${c.title}": ${c.hint || "as the books explain it"}${used.length ? `\n  Wordings already used (use one exactly when it fits): ${used.map((u) => `"${u}"`).join("; ")}` : ""}`;
    })
    .join("\n");
  const examples = deck.examples
    .slice(0, 6)
    .map((e) => JSON.stringify({ front: e.front, back: e.back, ex: e.ex }))
    .join("\n");
  return [
    {
      role: "system",
      content: `You write the explanation columns of Hindi flashcards for FlashGyan, an app for Rajasthan's competitive exams (RPSC, RSSB). Deck type: ${deck.name}; each card asks "${deck.prompt.trim()}".
Columns:
${cols}
Finished cards in the house style, checked by the editor (copy their form, length, wording and symbols):
${examples || "(none)"}

${house.length ? `House spellings (the editor's accepted forms of words in these cards; write them this way): ${house.join("; ")}\n\n` : ""}For each card, fill ONLY the columns listed under "fill". Use the book passage given with the card first; mark such a value "from": "book". When the passage doesn't say it, write it from your own knowledge and mark it "from": "own" (the editor checks those). Never change the front or back. Write in Hindi unless the column is English (e.g. Pronunciation, Sentence-Usage). Be exact and short; no value is better than a doubtful one, so leave a column out when unsure.
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

// The AI check: every field of each card read (front and back as closely
// as the explanations), each problem with the field's corrected text.
export function checkMessages(
  deck: Deck,
  items: CheckItem[],
  // The house spellings of the cards' words.
  house: string[] = [],
  // What Wiktionary says of the cards' words (looked up before).
  dict: string[] = [],
  // Words of the back and explanations whose WordNet spelling differs.
  hints: string[] = [],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You proofread Hindi flashcards for FlashGyan (Rajasthan's competitive exams: RPSC, RSSB) before students see them. Deck type: ${deck.name}; each card asks "${deck.prompt.trim()}" about its front, and the back is the answer.
Read every field of every card — the front and the back as closely as the explanations.${
        deck.wrongFront
          ? `
THIS DECK'S FRONT IS WRONG ON PURPOSE: each front is the incorrect form the student must correct, and the back is its correct form. Never report the front's spelling or grammar as a mistake and never give a fix for the front. Instead check that: the front really has a mistake (a front that is already correct is a problem: report it on the front, without a fix); the back is the front with only that mistake corrected, nothing else changed, and is itself fully correct; the अशुद्धि column (if any) names the kind of mistake the front actually has; the explanation gives the right rule. Proofread the back and every explanation fully for spelling.`
          : ""
      }
Report only real problems a careful Hindi teacher would fix: a misspelt word (वर्तनी: matras, nukta, halant, anusvara, चन्द्रबिन्दु), a wrong, incomplete or extra answer on the back, a front that isn't the right word or form for this deck, an explanation that is wrong or doesn't fit the card, the wrong rule or type (e.g. a संधि named wrongly), or a form that breaks the deck's style. Don't report style preferences or spellings both of which are accepted. A card with no problem is left out.
For each problem give the field ("front", "back", or the explanation's name exactly as written), the kind, a short reason, and "fix": the whole field as it should read, changing only what is wrong and keeping its layout (numbering, commas, line breaks). If you can only point the problem out (you would need the book), leave "fix" empty.
Kinds: ${ERROR_TYPES.filter((t) => t !== "Check in book" && t !== "Other").join(", ")}, Check in book, Other.
${house.length ? `House spellings (the editor's accepted forms; never report these as misspelt, and when a card spells one of these words another way, that is a Spelling problem): ${house.join("; ")}\n` : ""}${dict.length ? `Dictionary (Wiktionary; often incomplete, so a word missing from it is not wrong by itself, but a clear clash is worth reporting):\n${dict.join("\n")}\n` : ""}${hints.length ? `Spelling hints from Hindi WordNet for words of the backs and explanations (a word WordNet spells another way, or a word it lacks whose near spelling it has; an inflected form, a name or a second accepted spelling can be fine, so judge each in its sentence):\n${hints.join("\n")}\n` : ""}Reply with JSON only: {"flags": [{"n": 1, "field": "back", "type": "Spelling", "note": "what is wrong, in a few words", "fix": "the field corrected"}]}`,
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

export type CheckFlag = {
  n: number;
  type: string;
  note: string;
  // "front", "back" or "ex:<column id>"; "" when the AI named no field.
  field: string;
  fix: string;
};

export function parseCheck(
  raw: string,
  items: CheckItem[],
  columns: FlashColumn[] = [],
): CheckFlag[] {
  const o = parseJsonLoose<{ flags?: unknown }>(raw);
  if (!o || !Array.isArray(o.flags)) throw new Error("The AI's reply couldn't be read");
  const ns = new Set(items.map((i) => i.n));
  const fieldOf = (v: unknown) => {
    const f = String(v ?? "")
      .trim()
      .replace(/^explanation_/, "");
    if (/^front$/i.test(f)) return "front";
    if (/^back$/i.test(f)) return "back";
    const col = columns.find((c) => c.title.trim() === f || c.id === f);
    return col ? `ex:${col.id}` : "";
  };
  return (o.flags as Record<string, unknown>[])
    .map((f) => ({
      n: Number(f?.n),
      type: ERROR_TYPES.includes(String(f?.type)) ? String(f?.type) : "Other",
      note: typeof f?.note === "string" ? f.note.trim().slice(0, 500) : "",
      field: fieldOf(f?.field),
      fix: typeof f?.fix === "string" ? f.fix.trim().slice(0, 20000) : "",
    }))
    .filter((f) => ns.has(f.n) && f.note);
}

// ---------- The house style for the AI ----------

// The editor's verified cards that show the house style best for these
// cards: those with the most explanations they wrote themselves (not the
// AI's), the same heading first, then the closest words.
export function styleExamples(
  cards: FlashCard[],
  columns: FlashColumn[],
  forCards: FlashCard[],
  max = 5,
): FlashCard[] {
  const headings = new Set(forCards.map((c) => c.sources[0]?.heading).filter(Boolean));
  const fronts = forCards.slice(0, 20).map((c) => c.front);
  const mine = (c: FlashCard) =>
    columns.filter((col) => (c.ex[col.id] ?? "").trim() && !c.own.includes(col.id)).length;
  const near = (c: FlashCard) => Math.max(0, ...fronts.map((f) => likeness(f, c.front)));
  const ids = new Set(forCards.map((c) => c.id));
  return cards
    .filter((c) => c.verified && !c.removed && !ids.has(c.id) && mine(c) > 0)
    .map((c) => ({
      c,
      score: mine(c) * 10 + (headings.has(c.sources[0]?.heading) ? 20 : 0) + near(c) * 5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.c);
}

// By column title: the short values the editor's verified cards use at
// least twice (most used first), for the AI to reuse word for word.
export function usedWordings(
  cards: FlashCard[],
  columns: FlashColumn[],
  max = 15,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const col of columns) {
    const count = new Map<string, number>();
    for (const c of cards) {
      if (!c.verified || c.removed || c.own.includes(col.id)) continue;
      const v = (c.ex[col.id] ?? "").trim();
      if (v && v.length <= 60 && !v.includes("\n")) count.set(v, (count.get(v) ?? 0) + 1);
    }
    const used = [...count]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([v]) => v);
    if (used.length) out[col.title] = used;
  }
  return out;
}

// ---------- Words spelt a little differently ----------

// Whether two keys are one letter apart (one added, dropped or changed).
function oneApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const x = a.slice(i);
  const y = b.slice(i);
  return x.slice(1) === y.slice(1) || x.slice(1) === y || x === y.slice(1);
}

// Cards whose fronts are one letter apart (and not already the same word):
// perhaps the same word spelt differently. Words of 4 letters or more; two
// cards a group.
export function nearDuplicates(cards: FlashCard[], max = 300): DupGroup[] {
  const live = cards.filter((c) => !c.removed && dupKey(c.front).length >= 4);
  // Grouped by length, compared with the same and the next length.
  const byLen = new Map<number, FlashCard[]>();
  for (const c of live) {
    const n = dupKey(c.front).length;
    byLen.set(n, [...(byLen.get(n) ?? []), c]);
  }
  const out: DupGroup[] = [];
  const seen = new Set<string>();
  for (const [n, list] of [...byLen].sort((a, b) => a[0] - b[0])) {
    const next = [...list, ...(byLen.get(n + 1) ?? [])];
    for (let i = 0; i < list.length && out.length < max; i++)
      for (let j = i + 1; j < next.length && out.length < max; j++) {
        const a = list[i];
        const b = next[j];
        const ka = dupKey(a.front);
        const kb = dupKey(b.front);
        if (ka === kb || !oneApart(ka, kb)) continue;
        const k = [ka, kb].sort().join("~");
        if (seen.has(k)) continue;
        seen.add(k);
        const books = [a, b].map((c) => c.sources[0]?.book ?? "");
        out.push({
          key: k,
          cards: [a, b].sort((x, y) => x.pos - y.pos),
          books: [...new Set(books.filter(Boolean))],
          sameBook: books[0] === books[1],
        });
      }
  }
  return out;
}

// ---------- Views ----------

export type SortKey = "order" | "front" | "back" | "book" | `ex:${string}`;

// Cards sorted by the topic's order (numbers, then as added), front, back,
// book or one explanation column, alphabetically (Hindi and English).
export function sortCards(cards: FlashCard[], key: SortKey, desc = false): FlashCard[] {
  const text = (c: FlashCard) =>
    key === "front"
      ? c.front
      : key === "back"
        ? c.back
        : key === "book"
          ? `${c.sources[0]?.book ?? ""}\u0000${String(c.sources[0]?.pos ?? 0).padStart(8, "0")}`
          : key.startsWith("ex:")
            ? (c.ex[key.slice(3)] ?? "")
            : "";
  const dir = desc ? -1 : 1;
  return [...cards].sort((a, b) => {
    if (key === "order")
      return dir * ((a.card_order ?? Infinity) - (b.card_order ?? Infinity) || a.pos - b.pos);
    const x = text(a).trim();
    const y = text(b).trim();
    // Empty ones last either way.
    if (!x || !y) return Number(!x) - Number(!y);
    return dir * x.localeCompare(y, "hi") || a.pos - b.pos;
  });
}

// The version of a card a book gives (its own, or one merged into it).
export function versionFor(c: FlashCard, book: string): Version | null {
  return versionsOf(c).find((v) => v.book === book) ?? null;
}

// ---------- The same explanation in other words ----------

const grams = (s: string) => {
  const t = s.normalize("NFC").replace(/[\s\p{P}]+/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  if (t.length === 1) out.add(t);
  return out;
};

// How alike two texts are (0–1, by their letter pairs).
export function likeness(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}

export type Wording = { text: string; cards: string[] };
export type WordingGroup = { wordings: Wording[]; cards: number };

// A column's wordings that say much the same thing, grouped (each group
// two or more different wordings), the largest first.
export function wordingGroups(cards: FlashCard[], column: string, alike = 0.5): WordingGroup[] {
  const by = new Map<string, string[]>();
  for (const c of cards) {
    if (c.removed) continue;
    const t = (c.ex[column] ?? "").trim();
    if (t) by.set(t, [...(by.get(t) ?? []), c.id]);
  }
  const all = [...by]
    .map(([text, ids]) => ({ text, cards: ids }))
    .sort((a, b) => b.cards.length - a.cards.length);
  const groups: Wording[][] = [];
  for (const w of all) {
    const g = groups.find((list) => likeness(list[0].text, w.text) >= alike);
    if (g) g.push(w);
    else groups.push([w]);
  }
  return groups
    .filter((g) => g.length > 1)
    .map((wordings) => ({ wordings, cards: wordings.reduce((n, w) => n + w.cards.length, 0) }))
    .sort((a, b) => b.cards - a.cards);
}

// ---------- A sheet's status ----------

export type SheetStatus = {
  // Its own cards now in the topic, and its versions merged into other
  // books' cards.
  cards: number;
  mergedIn: number;
  verified: number;
  errors: number;
  noExplanation: number;
  numbered: number;
  removed: number;
};

export function sheetStatus(src: string, cards: FlashCard[], columns: FlashColumn[]): SheetStatus {
  const own = cards.filter((c) => c.sources[0]?.src === src);
  const live = own.filter((c) => !c.removed);
  return {
    cards: live.length,
    mergedIn: cards.filter((c) => !c.removed && c.sources.slice(1).some((s) => s.src === src))
      .length,
    verified: live.filter((c) => c.verified).length,
    errors: live.filter((c) => c.error).length,
    noExplanation: columns.length ? live.filter((c) => emptyColumns(c, columns).length).length : 0,
    numbered: live.filter((c) => c.card_order !== null).length,
    removed: own.length - live.length,
  };
}
