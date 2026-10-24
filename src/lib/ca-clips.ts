// Newspaper clipping (shared by the server and the clipper page): the
// articles boxed on a newspaper's pages, and reading a clipping's images into
// an article's text.

type ChatMessage = { role: "system" | "user"; content: string };

// A box on a page, as parts of the page (0-1), from its top left corner.
export type ClipBox = { page: number; x: number; y: number; w: number; h: number };
export type ClipPart = ClipBox & { path: string; url?: string };
export type ClipStatus = "new" | "read" | "changed" | "skipped" | "failed";
export type Clip = {
  id: string;
  newspaper_id: string;
  parts: ClipPart[];
  status: ClipStatus;
  error: string | null;
  headline: string;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};
export type Newspaper = {
  id: string;
  issue_date: string;
  source_name: string;
  official: boolean;
  file_path: string;
  file_size: number;
  pages: number;
  file_deleted_at: string | null;
  created_at: string;
};

// A clipping's parts: at most this many boxes (an article continued on
// other pages).
export const MAX_PARTS = 6;
// Boxes smaller than this (part of the page) are a slip, not an article.
export const MIN_BOX = 0.015;
// The newspaper PDF is kept this long; its clippings stay.
export const KEEP_DAYS = 30;
// Largest newspaper PDF.
export const MAX_PDF_MB = 150;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// A box kept on its page, with a size that can be clipped (null if too
// small).
export function cleanBox(b: ClipBox, pages: number): ClipBox | null {
  const page = Math.round(b.page);
  if (!Number.isFinite(page) || page < 1 || page > Math.max(1, pages)) return null;
  const x = clamp(Math.min(b.x, b.x + b.w));
  const y = clamp(Math.min(b.y, b.y + b.h));
  const w = clamp(Math.max(b.x, b.x + b.w)) - x;
  const h = clamp(Math.max(b.y, b.y + b.h)) - y;
  if (!(w >= MIN_BOX && h >= MIN_BOX)) return null;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { page, x: r(x), y: r(y), w: r(w), h: r(h) };
}

// The pages a clipping is on, e.g. "p. 3" or "pp. 3, 7".
export function clipPages(parts: Pick<ClipBox, "page">[]): string {
  const pages = [...new Set(parts.map((p) => p.page))];
  return pages.length ? `${pages.length > 1 ? "pp." : "p."} ${pages.join(", ")}` : "";
}

export type ClipKind = "news" | "editorial" | "ad" | "other";

// Reading a clipping: its images (the parts, in order) into the article.
export function clipReadMessages(sourceName: string, parts: number): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You copy newspaper articles from clippings for a current affairs magazine (Rajasthan competitive exams). The images are one article clipped from ${sourceName || "a newspaper"}${parts > 1 ? `, in ${parts} parts in reading order (the article continues from one part to the next, sometimes on another page)` : ""}.
Copy the article exactly as printed, in its own language: Hindi stays Hindi, English stays English; never translate or summarise. Keep every number, name, date and place. Join lines broken by the columns, and join the parts in order. Keep the dateline (e.g. "जयपुर।"), subheadings (as lines starting with "## ") and photo captions (as lines starting with "Caption: "). Leave out "continued on page …" / "शेष पेज …" lines, text of other articles cut in at the edges of the box, ads and page headers.
Say what the clipping is: "news" (a report), "editorial" (an editorial, opinion or analysis), "ad" (an advertisement, notice or tender) or "other" (a puzzle, horoscope, index…).
Reply with JSON only: {"kind": "news", "headline": "…", "text": "…"}`,
    },
    { role: "user", content: "Copy this article." },
  ];
}

export function parseClipRead(raw: string): { kind: ClipKind; headline: string; text: string } {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let o: Record<string, unknown> = {};
  try {
    const start = body.indexOf("{");
    o = JSON.parse(start >= 0 ? body.slice(start, body.lastIndexOf("}") + 1) : body);
  } catch {
    return { kind: "other", headline: "", text: "" };
  }
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "";
  const kind = (["news", "editorial", "ad", "other"] as const).find((k) => k === o.kind) ?? "news";
  return {
    kind,
    headline: str(o.headline, 300).replace(/\s+/g, " "),
    text: str(o.text, 60000)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  };
}

// A clipping's article as a source's text: headline, then the text, then
// where it was printed.
export function clipContent(headline: string, text: string, sourceName: string, pages: string) {
  return `# ${headline}\n\n${text}\n\n(${[sourceName, pages].filter(Boolean).join(", ")})`;
}

// ---------- Suggested articles ----------

// An article the AI thinks worth clipping on a page, with its box.
export type SuggestedClip = {
  box: ClipBox;
  headline: string;
  why: string;
  // 1 = may be asked, 3 = likely asked.
  importance: number;
};
// Text lines of a page with where they are (from the PDF's own text).
export type PageTextLine = { x: number; y: number; w: number; h: number; text: string };

// Lines given to the AI: enough to place the articles, not the whole page.
export const SUGGEST_LINES = 350;
const pct = (v: number) => Math.round(v * 1000) / 10;

export function suggestMessages(o: {
  sourceName: string;
  page: number;
  lines: PageTextLine[];
  // The editor's picking rules and the exams (as for picking stories).
  guide?: string;
}): ChatMessage[] {
  const lines = o.lines.slice(0, SUGGEST_LINES);
  return [
    {
      role: "system",
      content: `You help the editor of a current affairs magazine for Rajasthan competitive exams (RPSC and RSSB, with depth for RAS Mains) clip a newspaper. The image is page ${o.page} of ${o.sourceName || "a newspaper"}. Find the articles worth clipping: news an exam may ask about (government schemes and decisions, appointments, awards, reports and indices, sports results, science, economy, places, Rajasthan's districts, international relations, and editorials on such issues). Leave out crime, accidents, local incidents, politics without decisions, entertainment, ads, notices, horoscopes and photos without a story.
For each article give its box: the whole article from its headline to its last line (all its columns, its photo and caption), as percentages of the page from the top left: "x", "y", "w", "h".${lines.length ? ` The page's text lines are listed with their place (x%, y%, width%, height%); also give the numbers of the article's first and last lines ("from", "to") and any line inside it you're sure of.` : ""}
"importance": 3 likely asked, 2 may be asked, 1 rarely asked (leave out what is never asked). "why": a few words on what an exam would ask. "headline": the article's headline as printed.${o.guide ? `\n${o.guide}` : ""}
Reply with JSON only: {"articles": [{"headline": "...", "why": "...", "importance": 2, "x": 0, "y": 0, "w": 0, "h": 0${lines.length ? ', "lines": [line numbers in the article]' : ""}}]}; {"articles": []} when none is worth clipping.`,
    },
    {
      role: "user",
      content: lines.length
        ? `Text lines of the page:\n${lines
            .map(
              (l, i) =>
                `${i + 1}. (${pct(l.x)}, ${pct(l.y)}, ${pct(l.w)}, ${pct(l.h)}) ${l.text.slice(0, 70)}`,
            )
            .join("\n")}`
        : "The page has no text of its own (a scan): use the image.",
    },
  ];
}

// How much of box `a` lies inside box `b` (0-1), on the same page.
export function covered(a: ClipBox, b: ClipBox): number {
  if (a.page !== b.page) return 0;
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / (a.w * a.h) : 0;
}

// The AI's articles as boxes on the page. With the page's text lines, the
// box is fitted to the lines it names (the AI's own box only widens it a
// little); articles already clipped, or boxed twice, are left out.
export function parseSuggestions(
  raw: string,
  page: number,
  lines: PageTextLine[],
  clipped: ClipBox[] = [],
): SuggestedClip[] {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let o: { articles?: unknown };
  try {
    o = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const shown = lines.slice(0, SUGGEST_LINES);
  const out: SuggestedClip[] = [];
  for (const x of Array.isArray(o.articles) ? o.articles : []) {
    const a = (x ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) / 100 : NaN);
    let box: ClipBox | null = cleanBox({ page, x: n(a.x), y: n(a.y), w: n(a.w), h: n(a.h) }, page);
    const named = [
      ...(Array.isArray(a.lines) ? a.lines : []),
      ...[a.from, a.to].filter((v) => v != null),
    ]
      .map((v) => shown[Number(v) - 1])
      .filter((l): l is PageTextLine => !!l);
    if (named.length) {
      const pad = 0.004;
      const x0 = Math.min(...named.map((l) => l.x));
      const y0 = Math.min(...named.map((l) => l.y));
      const x1 = Math.max(...named.map((l) => l.x + l.w));
      const y1 = Math.max(...named.map((l) => l.y + l.h));
      const fit = cleanBox(
        { page, x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad },
        page,
      );
      // The AI's box adds what has no text (a photo), when it mostly agrees.
      if (fit && box && covered(fit, box) > 0.6) {
        const ux = Math.min(fit.x, box.x);
        const uy = Math.min(fit.y, box.y);
        box = cleanBox(
          {
            page,
            x: ux,
            y: uy,
            w: Math.max(fit.x + fit.w, box.x + box.w) - ux,
            h: Math.max(fit.y + fit.h, box.y + box.h) - uy,
          },
          page,
        );
      } else box = fit ?? box;
    }
    const headline =
      typeof a.headline === "string" ? a.headline.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const importance = Math.min(3, Math.max(1, Math.round(Number(a.importance)) || 2));
    if (!box || !headline) continue;
    const b = box;
    if (clipped.some((c) => covered(b, c) > 0.5 || covered(c, b) > 0.5)) continue;
    if (out.some((s) => covered(b, s.box) > 0.6 || covered(s.box, b) > 0.6)) continue;
    out.push({
      box: b,
      headline,
      why: typeof a.why === "string" ? a.why.replace(/\s+/g, " ").trim().slice(0, 160) : "",
      importance,
    });
  }
  return out.sort((x, y) => y.importance - x.importance || x.box.y - y.box.y || x.box.x - y.box.x);
}
