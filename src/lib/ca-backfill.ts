// Collecting news from past dates: finding what a website published on one
// day (its site maps, or a search limited to that day). Pure helpers, shared
// by the collector, the admin panel and tests.
import { decodeEntities, type FoundLink } from "@/lib/ca-collect";

// Longest range one past-date collection covers.
export const MAX_BACKFILL_DAYS = 186;

// Every date from `from` to `to`, both included (YYYY-MM-DD).
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length <= MAX_BACKFILL_DAYS * 2) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The day (India time) of a timestamp, or null.
export function istDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.trim());
  if (Number.isNaN(t)) return /^\d{4}-\d{2}-\d{2}$/.test(iso.trim()) ? iso.trim() : null;
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
  // A news site map's own publication date and title.
  published: string | null;
  title: string | null;
};

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim() : null;
};

// A site map: either an index of more site maps or a list of pages.
export function parseSitemap(xml: string): {
  sitemaps: { loc: string; lastmod: string | null }[];
  urls: SitemapEntry[];
} {
  const sitemaps = (xml.match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) ?? [])
    .map((b) => ({ loc: tag(b, "loc") ?? "", lastmod: tag(b, "lastmod") }))
    .filter((s) => /^https?:\/\//.test(s.loc));
  const urls = (xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? [])
    .map((b) => ({
      loc: tag(b, "loc") ?? "",
      lastmod: tag(b, "lastmod"),
      published: tag(b, "news:publication_date"),
      title: tag(b, "news:title"),
    }))
    .filter((u) => /^https?:\/\//.test(u.loc));
  return { sitemaps, urls };
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// The ways a URL writes a day ("2025-07-14", "2025/07/14", "20250714",
// "14-07-2025") and a month ("2025-07", "2025/07", "july-2025").
function dayTokens(date: string): string[] {
  const [y, m, d] = date.split("-");
  return [`${y}-${m}-${d}`, `${y}/${m}/${d}`, `${y}${m}${d}`, `${d}-${m}-${y}`, `${d}/${m}/${y}`];
}
function monthTokens(date: string): string[] {
  const [y, m] = date.split("-");
  const name = MONTHS[Number(m) - 1];
  return [
    `${y}-${m}`,
    `${y}/${m}`,
    `${y}${m}`,
    `${y}_${m}`,
    `${name}-${y}`,
    `${y}-${name}`,
    `yyyy=${y}&mm=${m}`,
    `year=${y}&month=${Number(m)}`,
  ];
}

const FULL_DATE = /(20\d{2})[-/_]?(0[1-9]|1[0-2])[-/_]?(0[1-9]|[12]\d|3[01])(?!\d)/g;

// The full dates a URL carries (only well-formed YYYY-MM-DD ones).
function datesIn(url: string): string[] {
  return [...url.matchAll(FULL_DATE)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
}

export const urlHasDate = (url: string, date: string) => {
  const u = url.toLowerCase();
  return dayTokens(date).some((t) => u.includes(t)) || datesIn(u).includes(date);
};

// The child site maps worth opening for a day: ones named for that day or
// month; otherwise those last changed on or after it (a month's map is
// changed at its end), oldest first. At most `max`.
export function sitemapsFor(
  list: { loc: string; lastmod: string | null }[],
  date: string,
  max = 4,
): string[] {
  const lower = (s: string) => s.toLowerCase();
  const named = list.filter(
    (s) => urlHasDate(s.loc, date) || monthTokens(date).some((t) => lower(s.loc).includes(t)),
  );
  // Maps named for another day or month are never the right one.
  const otherDate = (s: { loc: string }) => {
    const ds = datesIn(lower(s.loc));
    return ds.length > 0 && !ds.includes(date);
  };
  if (named.length)
    return named
      .filter((s) => !otherDate(s) || urlHasDate(s.loc, date))
      .slice(0, max)
      .map((s) => s.loc);
  const later = list
    .filter((s) => !otherDate(s) && (istDay(s.lastmod) ?? "") >= date)
    .sort((a, b) => (istDay(a.lastmod) ?? "").localeCompare(istDay(b.lastmod) ?? ""));
  // Without dates at all, the first few (sites list their newest maps first).
  const undated = list.filter((s) => !s.lastmod && !otherDate(s));
  return [...later, ...(later.length ? [] : undated)].slice(0, max).map((s) => s.loc);
}

// The pages of a site map published on the day: by the news date, else the
// date in the URL, else the last change (only when the URL has no other
// date).
export function pagesOn(urls: SitemapEntry[], date: string): SitemapEntry[] {
  return urls.filter((u) => {
    const pub = istDay(u.published);
    if (pub) return pub === date;
    const inUrl = datesIn(u.loc.toLowerCase());
    if (inUrl.length) return inUrl.includes(date);
    return istDay(u.lastmod) === date;
  });
}

// A readable title from an article's address, for pages without one
// ("…/rajasthan/cm-launches-water-scheme-123456.html" → "Cm launches water
// scheme"). Null when the address has no words.
export function titleFromUrl(url: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const parts = path.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const words = parts[i]
      .replace(/\.(html?|php|aspx?|cms)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{4,}\b/g, " ")
      .replace(/\b(amp|news|article|story|index)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (words.split(" ").filter((w) => /\p{L}{2,}/u.test(w)).length >= 3)
      return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 200);
  }
  return null;
}

// Links in the part of the site that was added (a section such as
// "/rajasthan"), when there are enough of them; otherwise all.
export function inSection(links: FoundLink[], siteUrl: string): FoundLink[] {
  let section = "";
  try {
    section = new URL(siteUrl).pathname.replace(/\/+$/, "").toLowerCase();
  } catch {
    return links;
  }
  if (!section || section === "/") return links;
  const last = section.split("/").filter(Boolean).pop() ?? "";
  const own = links.filter((l) => {
    try {
      const p = new URL(l.url).pathname.toLowerCase();
      return p.startsWith(section) || (last.length > 3 && p.includes(`/${last}`));
    } catch {
      return false;
    }
  });
  return own.length >= 3 ? own : links;
}

// Site map pages as links (with a title from the address when the map has
// none), for one day.
export function sitemapLinks(urls: SitemapEntry[], date: string): FoundLink[] {
  const seen = new Set<string>();
  const out: FoundLink[] = [];
  for (const u of pagesOn(urls, date)) {
    if (seen.has(u.loc)) continue;
    seen.add(u.loc);
    const title = u.title || titleFromUrl(u.loc);
    if (title) out.push({ url: u.loc, title, published_at: u.published ?? u.lastmod ?? null });
  }
  return out;
}

// A search result published on the day or the day after (sites date pages
// in their own time zone; a story is often online the evening before).
export function searchHitOn(link: FoundLink, date: string): boolean {
  const day = istDay(link.published_at);
  if (!day) return true;
  return day === date || day === addDays(date, 1) || day === addDays(date, -1);
}
