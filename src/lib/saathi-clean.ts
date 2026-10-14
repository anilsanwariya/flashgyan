// Cleans text parsed from book PDFs before it is saved to SAATHI:
// - running headers/footers (short lines repeated at the top or bottom of many pages)
// - watermarks (short lines repeated anywhere on most pages)
// - bare page numbers ("12", "- 12 -", "Page 12 of 300", "पृष्ठ 12")
// - lines containing admin-supplied phrases (e.g. a coaching centre's name)
// - words hyphenated across lines and sentences broken over several lines
// Numbers are ignored when comparing lines, so "Page 12" and "Page 13" match.

export type CleanResult = {
  text: string;
  // Each distinct line that was removed, with how many times.
  removed: { line: string; count: number }[];
};

const EDGE_LINES = 3;
const MAX_REPEATED_LINE = 100;

const PAGE_NUMBER =
  /^(?:page|pg\.?|p\.|पृष्ठ|पेज)?\s*[-–—(|[]?\s*[\d०-९]{1,4}\s*[-–—)|\]]?(?:\s*(?:of|\/|का)\s*[\d०-९]{1,4})?$/i;

function plain(line: string): string {
  return line
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Exact text, for watermarks.
function exactKey(line: string): string {
  return plain(line).toLowerCase();
}

// Numbers ignored, for running headers and footers ("Page 12" = "Page 13").
function keyOf(line: string): string {
  return plain(line)
    .toLowerCase()
    .replace(/[\d०-९]+/g, "#");
}

const isHeading = (l: string) => /^\s*#{1,6}\s/.test(l);
const isTableRow = (l: string) => /^\s*\|/.test(l);
const isListItem = (l: string) => /^\s*(?:[-*+•]|\d+[.)])\s/.test(l);

export function cleanPdfPages(pages: string[], removePhrases: string[] = []): CleanResult {
  const pageLines = pages.map((p) => p.replace(/\r\n?/g, "\n").split("\n"));
  const n = pageLines.length;
  const phrases = removePhrases.map((p) => p.trim().toLowerCase()).filter(Boolean);

  // Count, once per page, which short lines sit at a page's edges and which
  // appear anywhere on it.
  const edgeCount = new Map<string, number>();
  const anyCount = new Map<string, number>();
  // Lines that repeat within a single page (labels like "Explanation:" in a
  // question book) are content, never watermarks.
  const repeatsOnAPage = new Set<string>();
  for (const lines of pageLines) {
    const nonEmpty = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim());
    const edge = new Set(
      [...nonEmpty.slice(0, EDGE_LINES), ...nonEmpty.slice(-EDGE_LINES)]
        .filter(({ l }) => !isTableRow(l) && plain(l).length <= MAX_REPEATED_LINE)
        .map(({ l }) => keyOf(l)),
    );
    const anywhere = new Set(
      nonEmpty
        .filter(
          ({ l }) =>
            !isTableRow(l) &&
            !isHeading(l) &&
            !isListItem(l) &&
            plain(l).length <= MAX_REPEATED_LINE,
        )
        .map(({ l }) => exactKey(l)),
    );
    const seen = new Set<string>();
    for (const { l } of nonEmpty) {
      const k = exactKey(l);
      if (seen.has(k)) repeatsOnAPage.add(k);
      if (seen.has(k)) repeatsOnAPage.add(keyOf(l));
      seen.add(k);
    }
    for (const k of edge) if (k) edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    for (const k of anywhere) if (k) anyCount.set(k, (anyCount.get(k) ?? 0) + 1);
  }
  const edgeLimit = Math.max(3, Math.ceil(n * 0.3));
  const anyLimit = Math.max(4, Math.ceil(n * 0.5));
  const isLabel = (k: string) => repeatsOnAPage.has(k) || k.endsWith(":");
  const repeatedEdge = new Set(
    [...edgeCount].filter(([k, c]) => c >= edgeLimit && !isLabel(k)).map(([k]) => k),
  );
  const watermark = new Set(
    [...anyCount].filter(([k, c]) => c >= anyLimit && !isLabel(k)).map(([k]) => k),
  );

  // Grouped by pattern (numbers ignored), keeping the first example to show.
  const removed = new Map<string, { line: string; count: number }>();
  const drop = (line: string) => {
    const key = keyOf(line);
    const entry = removed.get(key);
    if (entry) entry.count += 1;
    else removed.set(key, { line: plain(line).slice(0, 120), count: 1 });
  };
  // A chapter title that also runs as the page header is kept the first time.
  const keptHeadings = new Set<string>();

  const cleanedPages = pageLines.map((lines) => {
    const nonEmptyIdx = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
    const edgeIdx = new Set([
      ...nonEmptyIdx.slice(0, EDGE_LINES),
      ...nonEmptyIdx.slice(-EDGE_LINES),
    ]);
    return lines
      .filter((line, i) => {
        if (!line.trim()) return true;
        const p = plain(line);
        const key = keyOf(line);
        if (!p) return true;
        if (!isTableRow(line) && PAGE_NUMBER.test(p)) {
          drop(line);
          return false;
        }
        if (phrases.some((ph) => p.toLowerCase().includes(ph))) {
          drop(line);
          return false;
        }
        if (edgeIdx.has(i) && repeatedEdge.has(key)) {
          if (isHeading(line) && !keptHeadings.has(key)) {
            keptHeadings.add(key);
            return true;
          }
          drop(line);
          return false;
        }
        if (
          watermark.has(exactKey(line)) &&
          !isHeading(line) &&
          !isListItem(line) &&
          !isTableRow(line)
        ) {
          drop(line);
          return false;
        }
        return true;
      })
      .join("\n");
  });

  return {
    text: repairLines(cleanedPages.join("\n\n")),
    removed: [...removed.values()].sort((a, b) => b.count - a.count),
  };
}

const SENTENCE_END = /(?:[.!?:;)"”'’]|।|॥)$/;
// Lower-case Latin, Devanagari or "(" — the line continues the previous sentence.
function startsContinuation(text: string): boolean {
  const c = text.codePointAt(0) ?? 0;
  return (c >= 0x61 && c <= 0x7a) || (c >= 0x900 && c <= 0x97f) || c === 0x28;
}

// Rejoins words hyphenated across lines and sentences that the PDF broke over
// several lines, leaving headings, lists, tables and code untouched.
export function repairLines(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const prev = out.length ? out[out.length - 1] : null;
    const joinable =
      !inFence &&
      prev !== null &&
      prev.trim() !== "" &&
      line.trim() !== "" &&
      !isHeading(prev) &&
      !isHeading(line) &&
      !isTableRow(prev) &&
      !isTableRow(line) &&
      !isListItem(line) &&
      !/^\s*(```|~~~)/.test(prev);
    if (joinable && /[A-Za-z]-$/.test(prev) && /^[a-z]/.test(line.trim())) {
      out[out.length - 1] = prev.slice(0, -1) + line.trim();
    } else if (joinable && !SENTENCE_END.test(prev.trim()) && startsContinuation(line.trim())) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
