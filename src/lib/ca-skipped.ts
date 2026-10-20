// Skipped news: the articles in a day's sources that no story uses, so the
// editor can read them and make stories from what the AI left out, ranked by
// their value for the exam. Pure helpers, shared by the server and tests.
import { findQuote, type Span } from "@/lib/ca-highlight";
import { isPaged, sourceArticles } from "@/lib/ca-reader-format";

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
  // Its exam value, once ranked.
  rank?: SkippedRank | null;
};

// 3 = likely in the exam, 2 = useful, 1 = minor, 0 = not exam material.
export type SkippedRank = { score: 0 | 1 | 2 | 3; why: string };

// An article as found, with the start of its text for ranking.
export type FoundArticle = SkippedArticle & { snippet: string };

export const skippedKey = (a: { source_id: string; at: number }) => `${a.source_id}:${a.at}`;

// Shorter articles are captions, briefs and page furniture.
export const SKIPPED_MIN_WORDS = 60;
// How much of each article the ranking reads, and how many one call ranks.
const SNIPPET = 700;
export const RANK_MAX = 60;

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
): FoundArticle[] {
  const base = {
    source_id: source.id,
    source_title: source.title,
    source_name: source.source_name,
  };
  const paged = isPaged(source.url);
  // A web page is covered once any story uses it.
  if (!paged && used) return [];
  const spans = paged
    ? quotes.map((q) => findQuote(source.content, q)).filter((s): s is Span => !!s)
    : [];
  const out: FoundArticle[] = [];
  for (const a of sourceArticles(source)) {
    if (spans.some((s) => s[0] < a.end && s[1] > a.at)) continue;
    const words = a.text.split(" ").filter(Boolean).length;
    if (words < SKIPPED_MIN_WORDS) continue;
    // The preview skips the heading the title already shows.
    const head = a.title.replace(/…$/, "");
    const body = (paged && a.text.startsWith(head) ? a.text.slice(head.length) : a.text).trim();
    out.push({
      ...base,
      title: a.title,
      page: a.page,
      at: a.at,
      end: a.end,
      words,
      preview: body.slice(0, 240),
      snippet: body.slice(0, SNIPPET),
      rajasthan: rajasthanSource || aboutRajasthan(`${a.title} ${a.text.slice(0, 3000)}`),
    });
  }
  return out;
}
// ---------- Ranking by exam value: one AI call for the day's list ----------

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function rankMessages(
  articles: { title: string; source_name: string; page: number | null; snippet: string }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You help the editor of a magazine for RAS (Rajasthan) exam aspirants. These newspaper articles were not made into stories. Rate each one's value for the RPSC RAS exam (Prelims and Mains general studies):
3 = likely to be asked: Rajasthan or central government schemes, policies, laws and judgments; appointments, awards and honours; reports, indices and rankings; firsts and records; science, technology, defence and space; environment and wildlife; economy data; important days; international events involving India; Rajasthan's art, culture, heritage and geography.
2 = useful background for an exam topic.
1 = minor or routine.
0 = not exam material: crime, accidents, local politics and party news, routine match results, entertainment, advertisements, notices.
Give the reason in at most 12 words, naming what an examiner could ask.
Reply with JSON only: {"ranks": [{"n": the article's number, "score": 0 to 3, "why": "..."}]} with one entry per article.`,
    },
    {
      role: "user",
      content: articles
        .map(
          (a, i) =>
            `${i + 1}. [${a.source_name}${a.page !== null ? `, page ${a.page}` : ""}] ${a.title}\n${a.snippet}`,
        )
        .join("\n\n"),
    },
  ];
}

// Each article's rank, by position; null where the reply has none.
export function parseRanks(raw: string, count: number): (SkippedRank | null)[] | null {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let o: { ranks?: unknown };
  try {
    o = JSON.parse(text.slice(start, end + 1)) as { ranks?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(o.ranks)) return null;
  const out: (SkippedRank | null)[] = Array.from({ length: count }, () => null);
  for (const r of o.ranks as Record<string, unknown>[]) {
    const n = Math.round(Number(r?.n));
    const score = Math.round(Number(r?.score));
    if (!(n >= 1 && n <= count) || !(score >= 0 && score <= 3) || out[n - 1]) continue;
    const why = typeof r.why === "string" ? r.why.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    out[n - 1] = { score: score as SkippedRank["score"], why };
  }
  return out;
}
