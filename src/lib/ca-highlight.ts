// Finding facts in a source's full text, for the article reader: where a
// quote sits (ignoring case, punctuation and spacing, as fact checking does),
// how the text splits into sentences, and which part of a long source to show.
// Pure helpers, shared by the server and the browser.
import {
  QUOTE_JOIN,
  normalizeForMatch,
  quoteInSource,
  type CaChange,
  type CaFact,
} from "@/lib/current-affairs";

export { QUOTE_JOIN };

export type Span = [start: number, end: number];

// A highlight in the reader: words from one source, and whether they become a
// key point or only guide the summary and "why it matters". "check" marks a
// point the editor wants to verify: it shows as "to check" until marked checked.
// "note" tells SAATHI how to use it ("use in the headline").
export type Highlight = {
  source_id: string;
  quote: string;
  point: boolean;
  check?: boolean;
  note?: string;
};

const HIDDEN = /^(?:!\[[^\]\n]*\]\([^)\n]*\)|\]\([^)\n]*\)|<\/?[a-zA-Z][^<>\n]*>)/;

// The text lowered and reduced to letters (with Devanagari vowel signs) and
// digits, single-spaced, with each character's position in the original.
function normalized(text: string): { norm: string; at: number[] } {
  let norm = "";
  const at: number[] = [];
  let gap = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Markdown the reader doesn't show (images, link targets, HTML tags) is
    // not part of any quote.
    if (ch === "!" || ch === "]" || ch === "<") {
      const hidden = HIDDEN.exec(text.slice(i, i + 600));
      if (hidden) {
        i += hidden[0].length - 1;
        gap = true;
        continue;
      }
    }
    if (/[\u200b-\u200d\ufeff]/.test(ch)) continue;
    if (/[\p{L}\p{M}\p{N}]/u.test(ch)) {
      if (gap && norm) {
        norm += " ";
        at.push(i);
      }
      gap = false;
      for (const low of ch.toLowerCase()) {
        norm += low;
        at.push(i);
      }
    } else gap = true;
  }
  return { norm, at };
}

const cache = new Map<string, ReturnType<typeof normalized>>();
function normalizedCached(text: string) {
  let hit = cache.get(text);
  if (!hit) {
    if (cache.size > 20) cache.clear();
    hit = normalized(text);
    cache.set(text, hit);
  }
  return hit;
}

// Every place the words appear (ignoring case, punctuation and spacing), for
// the reader's find bar.
export function findAll(text: string, query: string, max = 500): Span[] {
  const q = normalized(query).norm;
  if (q.length < 2) return [];
  const { norm, at } = normalizedCached(text);
  const out: Span[] = [];
  for (let i = norm.indexOf(q); i >= 0 && out.length < max; i = norm.indexOf(q, i + q.length)) {
    out.push([at[i], at[i + q.length - 1] + 1]);
  }
  return out;
}

// The parts of a joined quote ("first part … second part"); one part for an
// ordinary quote.
export const quoteParts = (quote: string) =>
  quote.includes(QUOTE_JOIN) ? quote.split(QUOTE_JOIN).filter((p) => p.trim()) : [quote];

// Where each part of a quote is in the text (empty when any part is missing).
export function findQuoteParts(text: string, quote: string): Span[] {
  const spans = quoteParts(quote).map((p) => findQuote(text, p));
  return spans.every(Boolean) ? (spans as Span[]) : [];
}

// Where the quote is in the text, or null. A joined quote: where its first
// part is.
export function findQuote(text: string, quote: string): Span | null {
  if (quote.includes(QUOTE_JOIN)) return findQuoteParts(text, quote)[0] ?? null;
  const q = normalized(quote).norm;
  if (q.length < 4) return null;
  const { norm, at } = normalizedCached(text);
  const i = norm.indexOf(q);
  if (i < 0) return null;
  return [at[i], at[i + q.length - 1] + 1];
}

const ABBREVIATIONS =
  /(?:^|[\s(])(?:mr|mrs|ms|dr|prof|shri|smt|sh|st|lt|gen|col|capt|rs|no|nos|vs|etc|i\.e|e\.g|govt|dept|approx|jr|sr|inc|ltd|co)\.$/i;

// Sentences as spans: ends at . ! ? । ॥ followed by a space, or at a line
// break. A full stop after a common abbreviation ("Dr.", "Rs.") does not end
// one.
export function sentenceSpans(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (end: number) => {
    let s = start;
    while (s < end && /\s/.test(text[s])) s++;
    let e = end;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push([s, e]);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      push(i + 1);
      continue;
    }
    if (/[.!?।॥]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[.!?।॥"'”’)\]]/.test(text[j])) j++;
      if (j < text.length && !/\s/.test(text[j])) continue;
      if (ch === "." && ABBREVIATIONS.test(text.slice(Math.max(start, i - 8), i + 1))) continue;
      push(j);
      i = j - 1;
    }
  }
  push(text.length);
  return out;
}

// A sentence's clauses: split at commas, semicolons, colons, dashes and
// brackets, and before joining words ("and", "but", "while", "which",
// "और", "तथा", "जबकि", "लेकिन", "एवं"). A clause shorter than a few words
// joins the next one, so a tap never marks a lone word.
const CLAUSE_BREAK =
  /[,;:–—()]|\s(?=(?:and|but|while|whereas|which|who|after|before|as|और|तथा|जबकि|लेकिन|किंतु|परंतु|एवं|जिसमें|जिससे)\s)/giu;
const CLAUSE_WORD = /^(?:and|but|while|whereas|और|तथा|जबकि|लेकिन|किंतु|परंतु|एवं)\s+/iu;
export function clauseSpans(text: string, sentence: Span): Span[] {
  const [a, b] = sentence;
  const piece = text.slice(a, b);
  const cuts = [0];
  for (const m of piece.matchAll(CLAUSE_BREAK)) cuts.push(m.index! + m[0].length);
  cuts.push(piece.length);
  const raw: Span[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let s = cuts[i];
    let e = cuts[i + 1];
    while (s < e && /[\s,;:–—()]/.test(piece[s])) s++;
    // The joining word itself is left out of the clause.
    const join = CLAUSE_WORD.exec(piece.slice(s, e));
    if (join) s += join[0].length;
    while (e > s && /[\s,;:–—().!?।॥]/.test(piece[e - 1])) e--;
    if (e > s) raw.push([a + s, a + e]);
  }
  // Too short to be a fact on its own: joined with the next clause.
  const out: Span[] = [];
  for (const sp of raw) {
    const prev = out[out.length - 1];
    const words = (x: Span) => text.slice(x[0], x[1]).trim().split(/\s+/).length;
    if (prev && words(prev) < 3) out[out.length - 1] = [prev[0], sp[1]];
    else out.push(sp);
  }
  const last = out[out.length - 1];
  if (out.length > 1 && last && text.slice(last[0], last[1]).trim().split(/\s+/).length < 3)
    out.splice(-2, 2, [out[out.length - 2][0], last[1]]);
  return out.length ? out : [sentence];
}

// The clause of a sentence at an offset.
export function clauseAt(text: string, sentences: Span[], offset: number): Span | null {
  const s = sentences.find(([x, y]) => x <= offset && offset < y);
  if (!s) return null;
  const cl = clauseSpans(text, s);
  return cl.find(([x, y]) => x <= offset && offset < y) ?? cl.find(([x]) => x > offset) ?? s;
}

// The words of [a, b) with their offsets, for trimming a highlight.
export function wordsIn(text: string, span: Span): Span[] {
  const out: Span[] = [];
  const re = /[\p{L}\p{M}\p{N}₹$%][\p{L}\p{M}\p{N}₹$%.,'’/-]*/gu;
  const piece = text.slice(span[0], span[1]);
  for (const m of piece.matchAll(re)) {
    let w = m[0];
    while (w.length > 1 && /[.,'’/-]$/.test(w)) w = w.slice(0, -1);
    out.push([span[0] + m.index!, span[0] + m.index! + w.length]);
  }
  return out;
}

// Sources up to this size are shown whole; longer ones (a full newspaper)
// open around the story.
export const READER_WHOLE = 40_000;
export const READER_PAD = 6_000;

// The part of a long source to show first: around the story's quotes, from
// a line start to a line end. Short sources are shown whole.
export function readerWindow(text: string, quotes: string[]): Span {
  if (text.length <= READER_WHOLE) return [0, text.length];
  const spans = quotes.map((q) => findQuote(text, q)).filter((s): s is Span => !!s);
  const from = spans.length ? Math.min(...spans.map((s) => s[0])) - READER_PAD : 0;
  const to = spans.length ? Math.max(...spans.map((s) => s[1])) + READER_PAD : READER_WHOLE;
  return snapToLines(text, Math.max(0, from), Math.min(text.length, to));
}

export function snapToLines(text: string, from: number, to: number): Span {
  const a = from <= 0 ? 0 : text.lastIndexOf("\n", from) + 1;
  const nl = text.indexOf("\n", to);
  const b = to >= text.length || nl < 0 ? text.length : nl;
  return [a, b];
}

// Cleans a highlight for use as a fact: single spaces, no stray punctuation
// at the ends.
export function cleanQuote(quote: string): string {
  return quote
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
}

// The story's facts from the reader's highlights: key points in order, and
// summary-only context. A highlight that is an existing fact's quote keeps
// that fact (its short wording, slot and correction mark).
export function factsFromHighlights(
  highlights: Highlight[],
  sources: Map<string, string>,
  existing: CaFact[],
): { facts: CaFact[]; context: CaFact[] } {
  const facts: CaFact[] = [];
  const context: CaFact[] = [];
  const seen = new Set<string>();
  for (const h of highlights) {
    const quote = cleanQuote(h.quote);
    const key = normalizeForMatch(quote);
    if (key.length < 8 || seen.has(key)) continue;
    seen.add(key);
    const same = existing.find((f) => normalizeForMatch(f.quote) === key);
    const text = sources.get(h.source_id) ?? "";
    // A pink (to check) highlight stays unverified; otherwise a fact is
    // verified when its words are in the source (or were checked before).
    const found = quoteInSource(same?.quote ?? quote, text);
    const fact: CaFact = same
      ? { ...same, source_id: h.source_id, verified: !h.check && (same.verified || found) }
      : { text: quote, quote, source_id: h.source_id, verified: !h.check && found };
    const note = h.note?.trim();
    if (note) fact.note = note.slice(0, 200);
    else delete fact.note;
    (h.point ? facts : context).push(fact);
  }
  return { facts, context };
}

// Pending corrections name facts by position; after the facts change, each
// change follows its fact, and changes whose fact is gone are dropped.
export function remapChanges(
  changes: CaChange[],
  before: CaFact[],
  after: CaFact[],
): CaChange[] | null {
  const next = changes.flatMap((c) => {
    const old = before[c.fact];
    if (!old) return [];
    const key = normalizeForMatch(old.quote);
    const at = after.findIndex((f) => normalizeForMatch(f.quote) === key || f.text === old.text);
    return at >= 0 ? [{ ...c, fact: at }] : [];
  });
  return next.length ? next : null;
}
