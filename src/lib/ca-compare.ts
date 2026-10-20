// Two papers on the same news, side by side in the article reader: finding,
// in another of the day's sources, the article that matches the one being
// read, by the names and numbers they share. Pure helpers, shared by the
// server and tests.
import { normalizeForMatch } from "@/lib/current-affairs";
import { sourceArticles } from "@/lib/ca-reader-format";

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
};

// Below this, an article only shares common words with the one being read.
export const MATCH_MIN = 0.12;

// The article of a source most like the text being read, if any is close.
export function bestArticle(
  query: string,
  source: { title: string; url: string | null; content: string },
): CompareMatch | null {
  const q = matchWords(query);
  if (!q.size) return null;
  let best: CompareMatch | null = null;
  for (const a of sourceArticles(source)) {
    const score = similarity(q, matchWords(`${a.title} ${a.text}`));
    if (score >= MATCH_MIN && (!best || score > best.score)) {
      best = { title: a.title, page: a.page, at: a.at, end: a.end, score };
    }
  }
  return best && { ...best, score: Math.round(best.score * 100) / 100 };
}
