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
