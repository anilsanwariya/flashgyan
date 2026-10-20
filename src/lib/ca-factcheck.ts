// Fact-check mode: each fact of the day marked "to check" beside what its
// source says. Where the fact's quote is in the source, the words around it;
// where it isn't (the AI changed or invented them), the source's sentence
// closest to the fact. Pure helpers, shared by the server and tests.
import { findQuote, sentenceSpans } from "@/lib/ca-highlight";
import { matchWords, similarity } from "@/lib/ca-compare";

export type QuoteContext = { before: string; quote: string; after: string };

// Markdown the reader doesn't show, removed from a stretch of source text.
const plain = (s: string) =>
  s
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, " ")
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, " ")
    .replace(/(^|\n)\s*(#{1,6}|[-*+•]|\d{1,3}[.)]|>)\s+/g, "$1")
    .replace(/[*_`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CONTEXT = 280;

// The quote in the source with the words around it, from a sentence or line
// start before to a sentence or line end after; null when it isn't there.
export function quoteContext(content: string, quote: string): QuoteContext | null {
  const span = findQuote(content, quote);
  if (!span) return null;
  const [a, b] = span;
  let from = Math.max(0, a - CONTEXT);
  const head = content.slice(from, a);
  const cut = Math.max(head.lastIndexOf("\n"), head.search(/[.!?।](?=\s)[^.!?।]*$/));
  if (cut >= 0) from += cut + 1;
  let to = Math.min(content.length, b + CONTEXT);
  const tail = content.slice(b, to);
  const end = tail.search(/[.!?।](\s|$)|\n/);
  if (end >= 0) to = b + end + 1;
  const before = plain(content.slice(from, a));
  return {
    before: from > 0 && before ? `…${before}` : before,
    quote: plain(content.slice(a, b)),
    after: plain(content.slice(b, to)),
  };
}

// The sentences of a source, once, for finding the closest one to a fact.
export const sourceSentences = (content: string) =>
  sentenceSpans(content)
    .map(([a, b]) => plain(content.slice(a, b)))
    .filter((s) => s.split(" ").length >= 4);

// The source's sentence most like the fact, when one shares enough of its
// names and numbers.
export function closestSentence(sentences: string[], fact: string, min = 0.25): string | null {
  const want = matchWords(fact);
  if (!want.size) return null;
  let best: { s: string; score: number } | null = null;
  for (const s of sentences) {
    const score = similarity(want, matchWords(s));
    if (score >= min && (!best || score > best.score)) best = { s, score };
  }
  return best ? best.s.slice(0, 500) : null;
}
