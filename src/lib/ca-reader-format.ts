// The article reader's clean view: a source's markdown (from the collector
// and the PDF parser) as headings, paragraphs, lists and tables, with website
// clutter hidden. Every piece of shown text keeps its position in the raw
// text, so highlights made in the clean view are the source's own words and
// fact checking keeps working. Pure helpers, shared by the server and browser.

// Shown text and where it starts in the raw text: text === raw.slice(at, at + text.length).
export type Run = { text: string; at: number; bold?: boolean; link?: boolean };
// A space between lines, cells or rows, with no raw position.
const SEP: Run = { text: " ", at: -1 };

export type Block = { at: number; end: number; clutter?: boolean } & (
  | { kind: "heading"; level: number; runs: Run[] }
  | { kind: "para"; runs: Run[] }
  | { kind: "item"; marker: string; runs: Run[] }
  | { kind: "quote"; runs: Run[] }
  | { kind: "table"; rows: Run[][][] }
  | { kind: "page"; n: number }
  | { kind: "rule" }
);

type Line = { from: number; to: number };

function lines(text: string): Line[] {
  const out: Line[] = [];
  let from = 0;
  while (from <= text.length) {
    const nl = text.indexOf("\n", from);
    const to = nl < 0 ? text.length : nl;
    out.push({ from, to });
    if (nl < 0) break;
    from = nl + 1;
  }
  return out;
}

// The visible text of [from, to) without markdown: bold and code markers,
// escapes, images and HTML tags are dropped, links keep their text.
export function inlineRuns(text: string, from: number, to: number, link = false): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let start = from;
  const close = (end: number) => {
    if (end > start) runs.push({ text: text.slice(start, end), at: start, bold, link });
  };
  let i = from;
  while (i < to) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (two === "**" || two === "__") {
      close(i);
      bold = !bold;
      i += 2;
      start = i;
    } else if (ch === "*" || ch === "`") {
      close(i);
      i += 1;
      start = i;
    } else if (ch === "\\" && i + 1 < to && /[\\`*_{}[\]()#+\-.!|>]/.test(text[i + 1])) {
      close(i);
      start = i + 1;
      i += 2;
    } else if (two === "![" || ch === "[") {
      const img = two === "![";
      const open = img ? i + 1 : i;
      const shut = text.indexOf("]", open + 1);
      const paren = shut >= 0 && shut < to && text[shut + 1] === "(" ? text.indexOf(")", shut) : -1;
      if (paren >= 0 && paren < to) {
        close(i);
        if (!img) runs.push(...inlineRuns(text, open + 1, shut, true).map((r) => ({ ...r, bold })));
        i = paren + 1;
        start = i;
      } else i += 1;
    } else if (ch === "<") {
      const gt = text.indexOf(">", i);
      if (gt > 0 && gt < to && /^<\/?[a-zA-Z][^<>]*>$/.test(text.slice(i, gt + 1))) {
        close(i);
        i = gt + 1;
        start = i;
      } else i += 1;
    } else i += 1;
  }
  close(to);
  return runs.filter((r) => r.text.length > 0);
}

const HEADING = /^ {0,3}(#{1,6})\s+/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+/;
const QUOTE = /^\s*>\s?/;
const TABLE = /^\s*\|/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(text: string, line: Line): Run[][] {
  const cells: Run[][] = [];
  let i = line.from;
  while (i < line.to && text[i] !== "|") i++;
  i++;
  while (i < line.to) {
    let j = i;
    while (j < line.to && !(text[j] === "|" && text[j - 1] !== "\\")) j++;
    let a = i;
    let b = j;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (j < line.to || a < b) cells.push(inlineRuns(text, a, b));
    i = j + 1;
  }
  return cells;
}

const CLUTTER =
  /^(also read|read also|read more|recommended|related (news|articles|stories)|advertisement|sponsored|follow us|follow on|share (this|on)|subscribe|sign in|log ?in|click here|download (the )?app|join (our|us)|whatsapp|telegram channel|copyright|all rights reserved|tags?:|यह भी पढ़ें|ये भी पढ़ें|इसे भी पढ़ें|और पढ़ें|विज्ञापन|फॉलो करें|शेयर करें|डाउनलोड करें|हमें फॉलो)/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function isClutter(runs: Run[]): boolean {
  const text = runs
    .map((r) => r.text)
    .join("")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return true;
  if (CLUTTER.test(text)) return true;
  // Lines that are only links (menus, "related" lists, share buttons).
  return runs.length > 0 && runs.every((r) => r.link || !r.text.trim()) && words(text) <= 10;
}

// Whether "---" lines in a source are page breaks: the PDF parser puts one
// between pages; on web pages they are just dividers.
export const isPaged = (url: string | null | undefined) => !url || /\.pdf(\?|#|$)/i.test(url);

// The text as blocks. Offsets are positions in `text`. `firstPage` is the
// page the text starts on, when it is part of a longer paged source.
export function parseBlocks(text: string, paged = false, firstPage = 1): Block[] {
  const all = lines(text);
  const out: Block[] = [];
  let para: { at: number; end: number; runs: Run[] } | null = null;
  const flush = () => {
    if (para && para.runs.length) out.push({ kind: "para", ...para });
    para = null;
  };
  let page = firstPage;
  for (let k = 0; k < all.length; k++) {
    const l = all[k];
    const line = text.slice(l.from, l.to);
    if (!line.trim()) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      // The PDF parser puts "---" between pages.
      out.push(
        paged
          ? { kind: "page", n: ++page, at: l.from, end: l.to }
          : { kind: "rule", at: l.from, end: l.to },
      );
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const runs = inlineRuns(text, l.from + h[0].length, l.to);
      if (runs.length) {
        out.push({ kind: "heading", level: Math.min(h[1].length, 3), runs, at: l.from, end: l.to });
      }
      continue;
    }
    if (TABLE.test(line)) {
      flush();
      const rows: Run[][][] = [];
      const at = l.from;
      let end = l.to;
      for (; k < all.length && TABLE.test(text.slice(all[k].from, all[k].to)); k++) {
        const row = all[k];
        end = row.to;
        if (!TABLE_SEP.test(text.slice(row.from, row.to))) rows.push(tableCells(text, row));
      }
      k--;
      if (rows.length) out.push({ kind: "table", rows, at, end });
      continue;
    }
    const it = ITEM.exec(line);
    if (it) {
      flush();
      const runs = inlineRuns(text, l.from + it[0].length, l.to);
      if (runs.length) {
        out.push({
          kind: "item",
          marker: /\d/.test(it[2]) ? it[2] : "•",
          runs,
          at: l.from,
          end: l.to,
          clutter: isClutter(runs),
        });
      }
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      flush();
      const runs = inlineRuns(text, l.from + q[0].length, l.to);
      if (runs.length) out.push({ kind: "quote", runs, at: l.from, end: l.to });
      continue;
    }
    // A paragraph: consecutive plain lines. A clutter line ("Also read: …")
    // stands alone, so hiding it never hides the lines around it.
    const runs = inlineRuns(text, l.from, l.to);
    // Nothing to show (an image line).
    if (!runs.some((r) => r.text.trim())) continue;
    if (isClutter(runs)) {
      flush();
      out.push({ kind: "para", runs, at: l.from, end: l.to, clutter: true });
      continue;
    }
    if (!para) para = { at: l.from, end: l.to, runs: [] };
    else para.runs.push(SEP);
    para.runs.push(...runs);
    para.end = l.to;
  }
  flush();
  return out;
}

// A block's runs in reading order; table cells and rows are separated by a
// space that has no raw position.
export function blockRuns(b: Block): Run[] {
  if (b.kind === "table") return b.rows.flatMap((row) => row.flatMap((cell) => [...cell, SEP]));
  return "runs" in b ? b.runs : [];
}

// The words shown for raw [from, to): what a highlight quotes.
export function plainText(text: string, from: number, to: number): string {
  const parts: string[] = [];
  for (const b of parseBlocks(text, true)) {
    if (b.end <= from || b.at >= to) continue;
    for (const r of blockRuns(b)) {
      if (r.at < 0) {
        parts.push(" ");
        continue;
      }
      const a = Math.max(from, r.at);
      const z = Math.min(to, r.at + r.text.length);
      if (z > a) parts.push(text.slice(a, z));
    }
    parts.push(" ");
  }
  return parts
    .join("")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
}

// Headings and pages of a whole source, for the reader's contents list.
export type OutlineEntry = { title: string; at: number; level: number };

export function outline(text: string, paged: boolean, max = 400): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  for (const b of parseBlocks(text, paged)) {
    if (b.kind === "heading" && !b.clutter) {
      const title = b.runs
        .map((r) => r.text)
        .join("")
        .trim();
      if (title) out.push({ title: title.slice(0, 120), at: b.at, level: b.level });
    } else if (b.kind === "page") out.push({ title: `Page ${b.n}`, at: b.at, level: 0 });
    if (out.length >= max) break;
  }
  if (out.some((e) => e.level === 0)) out.unshift({ title: "Page 1", at: 0, level: 0 });
  return out;
}

const WORD = /[\p{L}\p{M}\p{N}₹$%]/u;
// Trimmed from the ends of a painted stretch: spaces, punctuation, markdown.
const EDGE = /[\s,;:.!?"'“”‘’()[\]{}–—\-|*#>_`]/;

// [a, b) widened to whole words, without stray punctuation at the ends.
export function snapToWords(text: string, a: number, b: number): [number, number] {
  let s = Math.max(0, Math.min(a, b));
  let e = Math.min(text.length, Math.max(a, b));
  while (s > 0 && WORD.test(text[s - 1])) s--;
  while (e < text.length && WORD.test(text[e])) e++;
  while (s < e && EDGE.test(text[s])) s++;
  while (e > s && EDGE.test(text[e - 1])) e--;
  return [s, e];
}

// A newspaper page's articles: each heading starts one, and so does each
// page. Text before a page's first heading is an article too, named by its
// first words.
export type Article = { title: string; at: number; end: number; page: number };

export function splitArticles(blocks: Block[], firstPage = 1): Article[] {
  const out: Article[] = [];
  let cur: Article | null = null;
  let page = firstPage;
  const close = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const b of blocks) {
    if (b.clutter) continue;
    if (b.kind === "page") {
      close();
      page = b.n;
      continue;
    }
    if (b.kind === "heading") {
      close();
      const title = b.runs
        .map((r) => r.text)
        .join("")
        .trim();
      cur = { title: title.slice(0, 120), at: b.at, end: b.end, page };
      continue;
    }
    if (!cur) {
      const words = blockRuns(b)
        .map((r) => r.text)
        .join("")
        .trim()
        .split(/\s+/);
      cur = {
        title: words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : ""),
        at: b.at,
        end: b.end,
        page,
      };
    }
    cur.end = b.end;
  }
  close();
  return out;
}

// A source's articles with their shown text: a newspaper page split into its
// articles, a web page as one article.
export type ArticleText = Omit<Article, "page"> & { page: number | null; text: string };

export function sourceArticles(source: {
  title: string;
  url: string | null;
  content: string;
}): ArticleText[] {
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
  if (!paged) {
    return [
      {
        title: source.title,
        at: 0,
        end: content.length,
        page: null,
        text: textOf(0, content.length),
      },
    ];
  }
  return splitArticles(blocks).map((a) => ({ ...a, text: textOf(a.at, a.end) }));
}
