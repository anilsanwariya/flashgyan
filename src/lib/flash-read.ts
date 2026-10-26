// Reading a book into a topic's cards: a Word file or pasted text split
// into pieces the AI reads one at a time (each starting with the heading in
// force), a PDF page by page (as images), and the AI's reply turned into
// cards in the deck type's columns. Explanations come only from the book
// here; filling gaps from the AI's own knowledge is a separate, marked step.
// Pure: shared by the server, the admin panel and tests.
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";
import { parseJsonLoose } from "../../supabase/functions/_shared/saathi-core.ts";
import type { FlashColumn, FlashExample } from "@/lib/flash-studio";

export const PIECE_CHARS = 4500;

// The files read as books (Excel sheets are added as they are).
export const isPdf = (f: File) => /\.pdf$/i.test(f.name);
export const isWord = (f: File) => /\.docx$/i.test(f.name);
const isText = (f: File) => /\.(txt|md)$/i.test(f.name);
export const BOOK_FILE_TYPES = ".docx,.pdf,.txt,.md";
export const isBookFile = (f: File) => isPdf(f) || isWord(f) || isText(f);

export type Piece = { text: string; heading: string };
export type Todo = { where: string; text: string };

// The book's own notes and the converter's gaps, for the editor to check.
const TODO =
  /black strip|content (?:\/diagram )?not visible|not visible|\bwrite\b.{0,40}\b(?:pg|page)\b|\b(?:pg|page)\.? ?\d+\b.{0,20}\bfrom\b|\btodo\b|\?\?\?|\(\?\)/i;

const isHeading = (l: string) => /^#{1,6}\s/.test(l);
const headingText = (l: string) =>
  l
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .trim();

// A book's text (Markdown, as the Word reader makes it) in pieces of about
// `max` characters, cut between lines; each knows the heading it starts
// under. Table separator lines are dropped. Also the lines to check.
export function splitPieces(md: string, max = PIECE_CHARS): { pieces: Piece[]; todos: Todo[] } {
  const lines = md
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() && !/^\|?\s*(-{3,}\s*\|\s*)+-*\s*\|?$/.test(l.trim()));
  const pieces: Piece[] = [];
  const todos: Todo[] = [];
  const stack: string[] = [];
  let cur: string[] = [];
  let size = 0;
  let startHeading = "";
  const flush = () => {
    if (cur.length) pieces.push({ text: cur.join("\n"), heading: startHeading });
    cur = [];
    size = 0;
  };
  for (const raw of lines) {
    // A very long line is cut at spaces.
    const parts: string[] = [];
    let line = raw;
    while (line.length > max) {
      const at = line.lastIndexOf(" ", max);
      const cut = at > max / 2 ? at : max;
      parts.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    parts.push(line);
    for (const l of parts) {
      if (size + l.length + 1 > max && cur.length) flush();
      if (!cur.length) startHeading = stack.filter(Boolean).join(" › ");
      if (isHeading(l)) {
        const level = l.match(/^#+/)![0].length;
        stack.length = level - 1;
        stack[level - 1] = headingText(l);
      }
      if (TODO.test(l))
        todos.push({
          where: `Part ${pieces.length + 1}`,
          text: l.replace(/\*+/g, "").trim().slice(0, 300),
        });
      cur.push(l);
      size += l.length + 1;
    }
  }
  flush();
  return { pieces, todos };
}

export type ReadContext = { heading: string; rule: string };

type Deck = { name: string; prompt: string; columns: FlashColumn[]; examples: FlashExample[] };

function deckGuide(deck: Deck): string {
  const cols = deck.columns.length
    ? deck.columns.map((c) => `- "${c.title}": ${c.hint || "as the book explains it"}`).join("\n")
    : "(none)";
  const examples = deck.examples
    .slice(0, 3)
    .map((e) => JSON.stringify({ front: e.front, back: e.back, ex: e.ex }))
    .join("\n");
  return `Deck type: ${deck.name}. Each card asks: "${deck.prompt.trim()}".
Explanation columns (by title):
${cols}
Finished cards in the house style (copy their form exactly: line breaks, "‣", "◆", " + ", spacing):
${examples || "(none)"}`;
}

// The AI's instructions for one piece of a book (text) or one page (image).
export function readMessages(
  deck: Deck,
  book: string,
  input: { text: string; part: number; parts: number } | { page: number; pages: number },
  context: ReadContext,
): ChatMessage[] {
  const where =
    "text" in input
      ? `Part ${input.part} of ${input.parts} of the book's text`
      : `Page ${input.page} of ${input.pages} (the image)`;
  const before =
    context.heading || context.rule
      ? `Where the last part ended: heading "${context.heading}"${context.rule ? `, rule "${context.rule}"` : ""}.`
      : "This is the start of the book's chapter.";
  return [
    {
      role: "system",
      content: `You turn pages of a Hindi grammar book into flashcards for FlashGyan, an app for Rajasthan's competitive exams (RPSC, RSSB). An editor proofreads every card afterwards.
${deckGuide(deck)}

Rules:
- Make one card for EVERY example the text gives of what this deck asks (each word, pair, phrase or sentence), in the book's order. Skip none; add none the text doesn't have. Definitions, theory and lists without a question to ask are not cards.
- Copy words exactly as the book prints them, even if you think they are misspelt (the editor decides); only mend broken line breaks and stray symbols left by the conversion.
- Explanations come ONLY from this text: what the book says about the heading and rule each example sits under. Write each rule once in "rules" and point cards to it with "r". Leave a column out when the text doesn't say it. Never fill one from your own knowledge.
- "heading" is the section the example sits under (e.g. "दीर्घ स्वर संधि"), "rule" its rule as the book states it in short (e.g. "अ + अ = आ"). Carry on from where the last part ended until the text starts a new one.
- A note the book gives for one example (a meaning in brackets, "प्रतिकार शब्द भी सही है") goes in that card's "note", not in its front or back.
- "notes": things the editor must check: text that can't be read, the book's own notes to itself (e.g. "Write explanation from pg 135"), an example cut off at the edge of this part.
Reply with JSON only: {"rules": [{"n": 1, "heading": "...", "rule": "...", "ex": {"<column title>": "..."}}], "cards": [{"front": "...", "back": "...", "r": 1, "ex": {}, "note": ""}], "notes": ["..."], "heading": "the heading in force at the end", "rule": "the rule in force at the end"}`,
    },
    {
      role: "user",
      content: `Book: ${book}. ${before}\n\n${where}:${"text" in input ? `\n\n${input.text}` : ""}`,
    },
  ];
}

export type ReadCard = {
  front: string;
  back: string;
  // By column id.
  ex: Record<string, string>;
  heading: string;
  rule: string;
  note: string;
};

export type ReadResult = { cards: ReadCard[]; notes: string[]; context: ReadContext };

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The AI's reply as cards (explanations by column id; a card's own value
// over its rule's), the notes to check and where the text ended.
export function parseRead(raw: string, columns: FlashColumn[], context: ReadContext): ReadResult {
  const o = parseJsonLoose<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object" || Array.isArray(o))
    throw new Error("The AI's reply couldn't be read");
  const byTitle = new Map(columns.map((c) => [c.title.trim(), c.id]));
  const exOf = (v: unknown) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
      const id = byTitle.get(k.trim());
      const s = str(val, 8000);
      if (id && s) out[id] = s;
    }
    return out;
  };
  const rules = new Map<number, { heading: string; rule: string; ex: Record<string, string> }>();
  for (const r of Array.isArray(o.rules) ? o.rules : []) {
    const x = (r ?? {}) as Record<string, unknown>;
    const n = Number(x.n);
    if (Number.isFinite(n))
      rules.set(n, { heading: str(x.heading, 300), rule: str(x.rule, 300), ex: exOf(x.ex) });
  }
  let last = { heading: context.heading, rule: context.rule };
  const cards: ReadCard[] = [];
  for (const c of Array.isArray(o.cards) ? o.cards : []) {
    const x = (c ?? {}) as Record<string, unknown>;
    const front = str(x.front);
    const back = str(x.back);
    if (!front && !back) continue;
    const rule = rules.get(Number(x.r));
    if (rule) last = { heading: rule.heading || last.heading, rule: rule.rule || last.rule };
    cards.push({
      front,
      back,
      ex: { ...(rule?.ex ?? {}), ...exOf(x.ex) },
      heading: rule?.heading || last.heading,
      rule: rule?.rule || last.rule,
      note: str(x.note, 500),
    });
  }
  const notes = (Array.isArray(o.notes) ? o.notes : []).map((n) => str(n, 500)).filter(Boolean);
  return {
    cards,
    notes,
    context: { heading: str(o.heading, 300) || last.heading, rule: str(o.rule, 300) || last.rule },
  };
}
