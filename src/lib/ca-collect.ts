// Automatic news collection: reading RSS feeds and news pages, and the AI
// prompt that picks exam-relevant headlines. Pure helpers, no network here.
import {
  EDITORIAL_SKIP,
  EDITORIAL_TOPICS,
  IMPORTANCE_GUIDE,
  SKIP_STORIES,
  STORY_TYPES,
} from "@/lib/ca-blueprint";

export type FoundLink = { url: string; title: string; published_at: string | null };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

const stripTags = (s: string) =>
  decodeEntities(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function looksLikeFeed(body: string, contentType = ""): boolean {
  return (
    /xml|rss|atom/i.test(contentType) || /^\s*(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(body)
  );
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? stripTags(m[1]) : "";
}

function toIso(date: string): string | null {
  const t = Date.parse(date);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Items of an RSS or Atom feed.
export function parseFeed(xml: string, base: string): FoundLink[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const out: FoundLink[] = [];
  for (const b of blocks) {
    const title = tag(b, "title");
    let link = tag(b, "link");
    if (!link) link = /<link\b[^>]*href=["']([^"']+)["']/i.exec(b)?.[1] ?? "";
    if (!link) link = tag(b, "guid");
    if (!link.trim()) continue;
    const url = absolute(decodeEntities(link.trim()), base);
    if (!title || !url) continue;
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    out.push({ url, title, published_at: date ? toIso(date) : null });
  }
  return dedupe(out);
}

function absolute(href: string, base: string): string {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// The site's own feed, when its page advertises one.
export function feedLink(html: string, base: string): string | null {
  const m = /<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i.exec(html)?.[0] ?? "";
  const href = /href=["']([^"']+)["']/i.exec(m)?.[1];
  return href ? absolute(decodeEntities(href), base) || null : null;
}

const NOT_ARTICLE =
  /\/(tag|tags|topic|topics|category|categories|author|authors|videos?|photos?|gallery|galleries|podcasts?|live-tv|login|signup|subscribe|subscription|epaper|e-paper|search|about|contact|privacy|terms|advertise|careers|horoscope|rashifal|astrology|entertainment|bollywood|lifestyle|web-?stories)(\/|$)/i;

// Whether a link on a news page is probably an article (or a PDF notice).
export function looksLikeArticle(url: string, text: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (/\.pdf$/i.test(path)) return text.length >= 4;
  if (NOT_ARTICLE.test(path)) return false;
  if (text.length < 20 || text.split(/\s+/).length < 4) return false;
  const segments = path.split("/").filter(Boolean);
  return (
    /\d{4,}/.test(path) ||
    /\.(html?|cms|aspx)$/i.test(path) ||
    segments.some((s) => (s.match(/-/g) ?? []).length >= 3)
  );
}

// Article links on a news page, on the same site, in page order.
export function extractLinks(html: string, base: string, limit = 150): FoundLink[] {
  const site = host(base);
  const out: FoundLink[] = [];
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit * 3) {
    const url = absolute(decodeEntities(m[1]), base);
    const h = host(url);
    if (!url || !(h === site || h.endsWith(`.${site}`) || site.endsWith(`.${h}`))) continue;
    const title =
      stripTags(m[2]) || decodeEntities(/title=["']([^"']+)["']/i.exec(m[0])?.[1] ?? "").trim();
    if (looksLikeArticle(url, title))
      out.push({ url, title: title.slice(0, 300), published_at: null });
  }
  return dedupe(out).slice(0, limit);
}

function dedupe(list: FoundLink[]): FoundLink[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    const key = l.url.replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const OPINION_PATH =
  /(opinion|editorial|edit-?page|columns?|sampadkiya|sampadakiya|vichar|blogs?)/i;

// On an editorial site's page or search results, the links that are opinion
// pieces (menus and sidebars also link to ordinary news). If no link looks
// like one, the site keeps its own links.
export function editorialLinks(links: FoundLink[]): FoundLink[] {
  const opinion = links.filter((l) => {
    try {
      return OPINION_PATH.test(new URL(l.url).pathname);
    } catch {
      return false;
    }
  });
  return opinion.length ? opinion : links;
}

// Feed items older than this are not today's news.
export const MAX_AGE_HOURS = 30;

export function isRecent(link: FoundLink, now = new Date()): boolean {
  if (!link.published_at) return true;
  return now.getTime() - Date.parse(link.published_at) <= MAX_AGE_HOURS * 3600_000;
}

// ---------- Picking exam-relevant headlines ----------

type ChatMessage = { role: "system" | "user"; content: string };

const TYPE_LABELS = STORY_TYPES.filter((t) => t.id !== "other")
  .map((t) => t.label)
  .join("; ");

export function triageMessages(
  list: { title: string; site: string }[],
  max: number,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You pick news for a daily current affairs magazine for RAS (Rajasthan Administrative Service) exam aspirants. From the numbered headlines (Hindi or English), choose only those RPSC is likely to ask about in the RAS Prelims or Mains exam. Be strict: a headline must clearly fit one of these story types: ${TYPE_LABELS}.
Skip: ${SKIP_STORIES.join("; ")}; opinion pieces; duplicate headlines about the same story (keep the most informative one).
Rank by importance and leave out importance-1 headlines: ${IMPORTANCE_GUIDE}
Reply with JSON only: an array of the chosen numbers, most exam-relevant first, at most ${max}. Reply [] if none.`,
    },
    {
      role: "user",
      content: list.map((l, i) => `${i + 1}. ${l.title} (${l.site})`).join("\n"),
    },
  ];
}

// Picks the day's editorials worth a RAS Mains aspirant's time.
export function editorialTriageMessages(
  list: { title: string; site: string }[],
  max: number,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You pick newspaper editorials for a current affairs magazine for RAS (Rajasthan Administrative Service) Mains aspirants. From the numbered headlines of editorial and opinion pages (Hindi or English), choose editorials on issues RPSC asks in RAS Mains: ${EDITORIAL_TOPICS}.
Skip ${EDITORIAL_SKIP}. Editorial titles are often figurative: judge by the issue the title points to, and leave out titles you cannot place. Prefer Rajasthan issues and issues in the news that link to a law, scheme, institution or report; never pick two editorials on the same issue.
Reply with JSON only: an array of the chosen numbers, best first, at most ${max}. Reply [] if none.`,
    },
    {
      role: "user",
      content: list.map((l, i) => `${i + 1}. ${l.title} (${l.site})`).join("\n"),
    },
  ];
}

export function parseTriage(raw: string, count: number, max: number): number[] {
  const m = /\[[\s\S]*?\]/.exec(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  if (!m) return [];
  let list: unknown;
  try {
    list = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of list) {
    const i = Number(x) - 1;
    if (Number.isInteger(i) && i >= 0 && i < count && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Schedule ----------

// True once the collection time (HH:MM, India time) has passed today.
export function collectionDue(collectTime: string, now = new Date()): boolean {
  const [h, m] = (/^(\d{1,2}):(\d{2})$/.exec(collectTime) ?? ["", "21", "00"]).slice(1).map(Number);
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes() >= h * 60 + m;
}

// The readable text of an article page: the <article> (or <body>) without
// scripts, menus and footers, with paragraphs on their own lines.
export function readableText(html: string): string {
  const article = /<article\b[^>]*>([\s\S]*)<\/article>/i.exec(html)?.[1];
  const body = article ?? /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// Article text worth using: long enough, and not a paywall or cookie page.
export function usableText(text: string): boolean {
  const t = text.trim();
  if (t.length < 400) return false;
  return !/(subscribe to (continue|read)|this content is for subscribers|sign in to continue|enable javascript)/i.test(
    t.slice(0, 1500),
  );
}
