// Skipped news: the articles in a day's sources that no story uses, so the
// editor can read them and make stories from what the AI left out. Pure
// helpers, shared by the server and tests.
import { findQuote, type Span } from "@/lib/ca-highlight";
import { blockRuns, isPaged, parseBlocks, splitArticles } from "@/lib/ca-reader-format";

export type SkippedArticle = {
  source_id: string;
  source_title: string;
  source_name: string;
  // The article's heading (or first words), and its page on newspaper PDFs.
  title: string;
  page: number | null;
  // Where it is in the source's text.
  at: number;
  end: number;
  words: number;
  preview: string;
  rajasthan: boolean;
};

// Shorter articles are captions, briefs and page furniture.
export const SKIPPED_MIN_WORDS = 60;

const RAJASTHAN =
  /rajasthan|राजस्थान|jaipur|जयपुर|jodhpur|जोधपुर|udaipur|उदयपुर|ajmer|अजमेर|bikaner|बीकानेर|kota\b|कोटा|bhilwara|भीलवाड़ा|alwar|अलवर|sikar|सीकर|barmer|बाड़मेर|jaisalmer|जैसलमेर|rpsc|आरपीएससी/i;
export const aboutRajasthan = (text: string) => RAJASTHAN.test(text);

// The articles of one source that none of the quotes fall in. A web page is
// one article: it is skipped when no story uses the source at all. A paged
// source (a newspaper PDF) is split into its articles, and each article
// counts as covered when a story's quote is in it.
export function uncoveredArticles(
  source: { id: string; title: string; source_name: string; url: string | null; content: string },
  quotes: string[],
  used: boolean,
  rajasthanSource = false,
): SkippedArticle[] {
  const { content } = source;
  const paged = isPaged(source.url);
  const blocks = parseBlocks(content, paged).filter((b) => !b.clutter);
  const textOf = (at: number, end: number) =>
    blocks
      .filter((b) => b.at >= at && b.end <= end)
      .map((b) =>
        blockRuns(b)
          .map((r) => r.text)
          .join(""),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const base = {
    source_id: source.id,
    source_title: source.title,
    source_name: source.source_name,
  };

  if (!paged) {
    if (used) return [];
    const text = textOf(0, content.length);
    const words = text.split(" ").filter(Boolean).length;
    if (words < SKIPPED_MIN_WORDS) return [];
    return [
      {
        ...base,
        title: source.title,
        page: null,
        at: 0,
        end: content.length,
        words,
        preview: text.slice(0, 240),
        rajasthan: rajasthanSource || aboutRajasthan(`${source.title} ${text.slice(0, 3000)}`),
      },
    ];
  }

  const spans = quotes.map((q) => findQuote(content, q)).filter((s): s is Span => !!s);
  const out: SkippedArticle[] = [];
  for (const a of splitArticles(blocks)) {
    if (spans.some((s) => s[0] < a.end && s[1] > a.at)) continue;
    const text = textOf(a.at, a.end);
    const words = text.split(" ").filter(Boolean).length;
    if (words < SKIPPED_MIN_WORDS) continue;
    // The preview skips the heading the title already shows.
    const body = text.startsWith(a.title.replace(/…$/, "")) ? text.slice(a.title.length) : text;
    out.push({
      ...base,
      title: a.title,
      page: a.page,
      at: a.at,
      end: a.end,
      words,
      preview: body.trim().slice(0, 240),
      rajasthan: rajasthanSource || aboutRajasthan(`${a.title} ${text.slice(0, 3000)}`),
    });
  }
  return out;
}
