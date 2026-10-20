// Two papers on the same news, side by side in the article reader: finding,
// in another of the day's sources, the article that matches the one being
// read, by the names and numbers they share or, across Hindi and English
// papers, by meaning (their search embeddings). Pure helpers, shared by the
// server and tests.
import { normalizeForMatch } from "@/lib/current-affairs";
import { sourceArticles, type ArticleText } from "@/lib/ca-reader-format";

// Words that say nothing about which news it is.
const STOP = new Set(
  (
    "the and for with that this from was were are has have had will been which said also its his her " +
    "their they them after over into about than more under would could there other such these those " +
    "but not all new one two who what when where how per out our you your may can did does " +
    "के का की में है और से को पर ने यह इस एक भी हैं था थी थे गया गई गए किया कहा लिए तक कि जो वह वे हो " +
    "कर करने करें रहे रहा रही साथ बाद अब नहीं ही तो द्वारा उन्होंने इसके उनके अपने वाले वाली जा सकता"
  ).split(" "),
);

// Each telling word once; numbers count double, as they rarely repeat by chance.
export function matchWords(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of normalizeForMatch(text).split(" ")) {
    if (!w || STOP.has(w)) continue;
    const number = /\d/.test(w);
    if (!number && w.length < 3) continue;
    out.set(w, number ? 2 : 1);
  }
  return out;
}

// 0 (nothing in common) to 1 (the same words).
export function similarity(a: Map<string, number>, b: Map<string, number>): number {
  let shared = 0;
  let wa = 0;
  let wb = 0;
  for (const [w, v] of a) {
    wa += v;
    if (b.has(w)) shared += v;
  }
  for (const v of b.values()) wb += v;
  return wa && wb ? shared / Math.sqrt(wa * wb) : 0;
}

export type CompareMatch = {
  title: string;
  page: number | null;
  at: number;
  end: number;
  score: number;
  // Found by meaning rather than shared words (usually the other language).
  meaning?: boolean;
};

// Below this, an article only shares common words with the one being read.
export const MATCH_MIN = 0.12;

// Embedding similarity: unrelated news stays below MEANING_FLOOR; the same
// news (in either language) reaches MEANING_MATCH and above.
export const MEANING_FLOOR = 0.7;
export const MEANING_MATCH = 0.8;
export const meaningScore = (cos: number) =>
  Math.max(0, Math.min(1, (cos - MEANING_FLOOR) / (1 - MEANING_FLOOR)));

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// What an article is embedded from: its title and opening.
export const meaningText = (a: { title: string; text: string }) =>
  `${a.title}\n${a.text.slice(0, 600)}`;

// The article of a source most like the text being read, if any is close.
// `meanings`: each article's embedding similarity to the text (in the order
// of the articles), when known.
export function bestArticle(
  query: string,
  source: { title: string; url: string | null; content: string } | ArticleText[],
  meanings: (number | null)[] = [],
): CompareMatch | null {
  const q = matchWords(query);
  let best: CompareMatch | null = null;
  const articles = Array.isArray(source) ? source : sourceArticles(source);
  articles.forEach((a, i) => {
    const words = q.size ? similarity(q, matchWords(`${a.title} ${a.text}`)) : 0;
    const cos = meanings[i] ?? null;
    const meant = cos === null ? 0 : meaningScore(cos);
    if (words < MATCH_MIN && (cos === null || cos < MEANING_MATCH)) return;
    const score = Math.max(words, meant);
    if (!best || score > best.score) {
      best = { title: a.title, page: a.page, at: a.at, end: a.end, score, meaning: meant > words };
    }
  });
  const found = best as CompareMatch | null;
  return found && { ...found, score: Math.round(found.score * 100) / 100 };
}
