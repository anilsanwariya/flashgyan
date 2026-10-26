// Reading a book into a topic's cards: a Word file or pasted text split
// into pieces the AI reads one at a time (each starting with the heading in
// force), a PDF page by page (as images), and the AI's reply turned into
// cards in the deck type's columns. Explanations come only from the book
// here; filling gaps from the AI's own knowledge is a separate, marked step.
// Pure: shared by the server, the admin panel and tests.
import type { ChatMessage } from "../../supabase/functions/_shared/saathi-core.ts";
import { parseJsonLoose } from "../../supabase/functions/_shared/saathi-core.ts";
import type { FlashColumn, FlashExample } from "@/lib/flash-studio";

// A part is kept small (the AI's reply for it must fit and come back in
// well under a minute): about 1,500 characters and at most 40 examples.
export const PIECE_CHARS = 1500;
export const PIECE_EXAMPLES = 40;

// The files read as books (Excel sheets are added as they are).
export const isPdf = (f: File) => /\.pdf$/i.test(f.name);
export const isWord = (f: File) => /\.docx$/i.test(f.name);
const isText = (f: File) => /\.(txt|md)$/i.test(f.name);
export const BOOK_FILE_TYPES = ".docx,.pdf,.txt,.md";
export const isBookFile = (f: File) => isPdf(f) || isWord(f) || isText(f);

// A part's text and where it sits in the book ("स्वर सन्धि › दीर्घ सन्धि ·
// अ + अ = आ"), so each part can be read on its own.
export type Piece = { text: string; heading: string };
export type Todo = { where: string; text: string };

// The book's own notes and the converter's gaps, for the editor to check.
const TODO =
  /black strip|content (?:\/diagram )?not visible|not visible|\bwrite\b.{0,40}\b(?:pg|page)\b|\b(?:pg|page)\.? ?\d+\b.{0,20}\bfrom\b|\btodo\b|\?\?\?|\(\?\)/i;

const isHeading = (l: string) => /^#{1,6}\s/.test(l);
const plain = (l: string) =>
  l
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*+/g, "")
    .replace(/^\|\s*|\s*\|$/g, "")
    .replace(/\s*\|\s*\|?\s*$/g, "")
    .trim();

// A heading written as a plain line, as most Word books have them:
// "1. दीर्घ सन्धि", "(ii) गुण स्वर संधि", "**स्वर सन्धि**".
function plainHeading(l: string): boolean {
  const t = plain(l);
  if (t.length < 2 || t.length > 60 || /[+=|।?]/.test(t)) return false;
  return (
    /^\d{1,2}[.)]\s*\S/.test(t) ||
    /^\(?[ivx]{1,4}\)\s*\S/i.test(t) ||
    /^\*\*[^*]+\*\*$/.test(l.trim())
  );
}

// A section heading without a number: a short line naming the kind
// ("व्यंजन सन्धि", "स्वर सन्धि/अच् संधि", "तद्धित प्रत्यय").
function sectionHeading(l: string): boolean {
  const t = plain(l);
  return (
    t.length <= 40 &&
    !/[+=|।?:,]/.test(t) &&
    /(सन्धि|संधि|समास|प्रत्यय|उपसर्ग|पर्यायवाची|विलोम|मुहावर|लोकोक्ति)/.test(t)
  );
}

// A rule as books state it: "अ + अ = आ", "(i) इ/ई + इ/ई = ई" (short parts,
// unlike an example's words), ": + क्, ख्, त् → स्", or a numbered rule
// paragraph ("नियम नं. 6. यदि …", kept short).
export function isRuleLine(l: string): boolean {
  const t = plain(l).replace(/^\(?[ivx\d]{1,4}\)\s*/i, "");
  if (/^नियम\s*(नं|संख्या)?\.?\s*\d/.test(t)) return true;
  if (t.length <= 50 && /\+/.test(t) && /[→➝]/.test(t)) return true;
  return /^[^\s+=]{1,4}(?:\s*\/\s*[^\s+=]{1,4})?(?:\s*\([^)]{1,6}\))?\s*\+\s*[^\s+=]{1,4}(?:\s*\/\s*[^\s+=]{1,4})?(?:\s*\([^)]{1,6}\))?\s*=\s*\S{1,8}$/.test(
    t,
  );
}

// A line that is an example (to count them per part).
const isExample = (l: string) =>
  /\S\s*\+\s*\S/.test(l) ||
  (/^\|/.test(l.trim()) && l.split("|").filter((c) => c.trim()).length >= 2);

// A book's text (Markdown, as the Word reader makes it) in small parts, cut
// between lines; each knows the heading and rule it starts under. Table
// separator lines are dropped. Also the lines to check.
export function splitPieces(
  md: string,
  max = PIECE_CHARS,
  maxExamples = PIECE_EXAMPLES,
): { pieces: Piece[]; todos: Todo[] } {
  const lines = md
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() && !/^\|?\s*(-{3,}\s*\|\s*)+-*\s*\|?$/.test(l.trim()));
  const pieces: Piece[] = [];
  const todos: Todo[] = [];
  const stack: string[] = [];
  let sub = "";
  let rule = "";
  let cur: string[] = [];
  let size = 0;
  let examples = 0;
  let startHeading = "";
  const where = () => {
    const h = [...stack.filter(Boolean), sub].filter(Boolean).join(" › ");
    return rule ? `${h}${h ? " · " : ""}${rule}` : h;
  };
  const flush = () => {
    if (cur.length) pieces.push({ text: cur.join("\n"), heading: startHeading });
    cur = [];
    size = 0;
    examples = 0;
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
      const ex = isExample(l) && !isRuleLine(l);
      if ((size + l.length + 1 > max || (ex && examples >= maxExamples)) && cur.length) flush();
      if (!cur.length) startHeading = where();
      if (isHeading(l)) {
        const level = l.match(/^#+/)![0].length;
        stack.length = level - 1;
        stack[level - 1] = plain(l);
        sub = "";
        rule = "";
      } else if (sectionHeading(l)) {
        stack.length = Math.max(stack.length, 1);
        stack[stack.length - 1] = plain(l);
        sub = "";
        rule = "";
      } else if (plainHeading(l)) {
        sub = plain(l);
        rule = "";
      } else if (isRuleLine(l)) rule = plain(l).slice(0, 90);
      if (TODO.test(l))
        todos.push({
          where: `Part ${pieces.length + 1}`,
          text: l.replace(/\*+/g, "").trim().slice(0, 300),
        });
      cur.push(l);
      size += l.length + 1;
      if (ex) examples++;
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

// The AI's instructions for one part of a book (text, starting with the
// heading and rule it sits under) or one page (image). The reply is one
// line per card, so it stays short and a reply cut off still keeps every
// card before the cut.
export function readMessages(
  deck: Deck,
  book: string,
  input: { text: string; part: number; parts: number } | { page: number; pages: number },
): ChatMessage[] {
  const where =
    "text" in input
      ? `Part ${input.part} of ${input.parts} of the book's text`
      : `Page ${input.page} of ${input.pages} (the image)`;
  return [
    {
      role: "system",
      content: `You turn pages of a Hindi grammar book into flashcards for FlashGyan, an app for Rajasthan's competitive exams (RPSC, RSSB). An editor proofreads every card afterwards.
${deckGuide(deck)}

Rules:
- Make one card for EVERY example the text gives of what this deck asks (each word, pair, phrase or sentence), in the book's order. Skip none; add none the text doesn't have. Definitions, theory and lists without a question to ask are not cards.
- Copy words exactly as the book prints them, even if you think they are misspelt (the editor decides); only mend broken line breaks and stray symbols left by the conversion.
- Each card points to the rule it sits under. A rule line gives its heading (the section, e.g. "दीर्घ स्वर संधि") and the rule as the book states it in short (e.g. "अ + अ = आ"). A part's text may start with [heading · rule]: the examples before the text names a new one sit under that.
- Explanations come ONLY from this text: what the book says about a rule, written once on its X lines. Leave a column out when the text doesn't say it. Never fill one from your own knowledge.
- A note the book gives for one example (a meaning in brackets, "प्रतिकार शब्द भी सही है") goes in that card's note, not in its front or back.
- N lines: things the editor must check: text that can't be read, the book's own notes to itself (e.g. "Write explanation from pg 135"), an example cut off at the edge of this part.

Reply in exactly this line format and nothing else. Fields are separated by " | "; write a line break inside a field as \\n and never use "|" inside a field:
R | <rule number> | <heading> | <rule>
X | <rule number> | <column title> | <explanation>
C | <rule number> | <front> | <back> | <note or empty>
N | <note for the editor>
END
Write each R line before its cards. Finish with END.`,
    },
    {
      role: "user",
      content: `Book: ${book}.\n\n${where}:${"text" in input ? `\n\n${input.text}` : ""}`,
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

export type ReadResult = {
  cards: ReadCard[];
  notes: string[];
  context: ReadContext;
  // The reply stopped before its END line (cut off): the cards before the
  // cut are kept, and a note says so.
  cut?: boolean;
};

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

const field = (v: string | undefined, max = 4000) =>
  (v ?? "").replace(/\\n/g, "\n").trim().slice(0, max);

// The AI's reply in the line format (or, from an older reply, JSON).
export function parseReply(raw: string, columns: FlashColumn[], context: ReadContext): ReadResult {
  const text = raw.replace(/^```[a-z]*\n?|```\s*$/g, "").trim();
  if (text.startsWith("{")) return parseRead(text, columns, context);
  const byTitle = new Map(columns.map((c) => [c.title.trim(), c.id]));
  const rules = new Map<string, { heading: string; rule: string; ex: Record<string, string> }>();
  const cards: ReadCard[] = [];
  const notes: string[] = [];
  let last = { heading: context.heading, rule: context.rule };
  let ended = false;
  let lines = 0;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    if (/^END\b/.test(l)) {
      ended = true;
      break;
    }
    const f = l.split(/\s*\|\s*/);
    const kind = f[0].toUpperCase();
    if (kind === "R" && f.length >= 4) {
      rules.set(f[1], {
        heading: field(f[2], 300),
        rule: field(f.slice(3).join(" / "), 300),
        ex: {},
      });
      lines++;
    } else if (kind === "X" && f.length >= 4) {
      const id = byTitle.get(field(f[2], 80));
      const r = rules.get(f[1]);
      const v = field(f.slice(3).join(" / "), 8000);
      if (id && r && v) r.ex[id] = v;
      lines++;
    } else if (kind === "C" && f.length >= 4) {
      const front = field(f[2]);
      const back = field(f[3]);
      if (!front && !back) continue;
      const r = rules.get(f[1]);
      if (r) last = { heading: r.heading || last.heading, rule: r.rule || last.rule };
      cards.push({
        front,
        back,
        ex: { ...(r?.ex ?? {}) },
        heading: r?.heading || last.heading,
        rule: r?.rule || last.rule,
        note: field(f.slice(4).join(" / "), 500),
      });
      lines++;
    } else if (kind === "N" && f.length >= 2) {
      const n = field(f.slice(1).join(" / "), 500);
      if (n) notes.push(n);
      lines++;
    }
  }
  if (!lines && !ended) throw new Error("The AI's reply couldn't be read");
  // An X line can come after its rule's cards: those cards get it too.
  for (const c of cards) {
    const r = [...rules.values()].find((x) => x.heading === c.heading && x.rule === c.rule);
    if (r) c.ex = { ...r.ex, ...c.ex };
  }
  if (!ended) notes.push("The AI's reply was cut off: check the last examples of this part");
  return { cards, notes, context: last, cut: !ended };
}
