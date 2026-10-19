// Finding facts in a source's full text, for the article reader: where a
// quote sits (ignoring case, punctuation and spacing, as fact checking does),
// how the text splits into sentences, and which part of a long source to show.
// Pure helpers, shared by the server and the browser.
import {
  normalizeForMatch,
  quoteInSource,
  type CaChange,
  type CaFact,
} from "@/lib/current-affairs";

export type Span = [start: number, end: number];

// A highlight in the reader: words from one source, and whether they become a
// key point or only guide the summary and "why it matters". "check" marks a
// point the editor wants to verify: it shows as "to check" until marked checked.
export type Highlight = { source_id: string; quote: string; point: boolean; check?: boolean };

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

// Where the quote is in the text, or null.
export function findQuote(text: string, quote: string): Span | null {
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
