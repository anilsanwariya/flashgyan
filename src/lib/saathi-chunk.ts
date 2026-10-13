// Splits SAATHI study material into retrieval chunks.
//
// - Markdown headings become a breadcrumb ("## Polity › Fundamental Rights") at the
//   top of every chunk, so a piece cut from the middle of a section keeps its context.
// - Small sections are merged, oversized blocks (long paragraphs, tables, CSV) are
//   split, and pieces cut from one section overlap slightly.
// - Q&A material ("**Q:** … **Answer:** …") becomes one chunk per question, so
//   explanations stay attached to the question they explain.

export const CHUNK_MAX = 1500;
const CHUNK_MIN = 400;
const QNA_MAX = 2200;
const OVERLAP = 200;

export type SaathiChunk = { heading: string; content: string };

type Piece = { path: string[]; body: string };

export function chunkDocument(text: string): SaathiChunk[] {
  const clean = normalize(text);
  if (!clean) return [];
  const chunks = isQnA(clean) ? chunkQnA(clean) : chunkMarkdown(clean);
  // Exact repeats inside one document add nothing to search.
  const seen = new Set<string>();
  return chunks.filter((c) => (seen.has(c.content) ? false : (seen.add(c.content), true)));
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QNA_LINE = /^\*\*Q:\*\*/;

function isQnA(text: string): boolean {
  return (text.match(/^\*\*Q:\*\*/gm) ?? []).length >= 2;
}

function chunkQnA(text: string): SaathiChunk[] {
  const entries: string[] = [];
  let preamble = "";
  let cur: string[] | null = null;
  for (const line of text.split("\n")) {
    if (QNA_LINE.test(line)) {
      if (cur) entries.push(cur.join("\n"));
      cur = [line];
    } else if (cur) {
      if (line.trim() !== "---") cur.push(line);
    } else {
      preamble += line + "\n";
    }
  }
  if (cur) entries.push(cur.join("\n"));

  const out: SaathiChunk[] = preamble.trim() ? chunkMarkdown(preamble.trim()) : [];
  for (const raw of entries) {
    const entry = raw.trim();
    const question = entry.split("\n")[0];
    const heading = stripMarkdown(question.replace(QNA_LINE, "")).slice(0, 160);
    if (entry.length <= QNA_MAX) {
      out.push({ heading, content: entry });
      continue;
    }
    // A very long explanation is split, repeating the question on every piece.
    const rest = entry.slice(question.length).trim();
    for (const piece of chunkMarkdown(rest, CHUNK_MAX - question.length - 2)) {
      out.push({ heading, content: `${question}\n\n${piece.content}` });
    }
  }
  return out;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/[*_`#]+/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkMarkdown(text: string, max = CHUNK_MAX): SaathiChunk[] {
  const pieces: Piece[] = [];
  for (const section of parseSections(text)) {
    pieces.push(...splitSection(section, max));
  }
  return mergeSmall(pieces, max).map((group) => ({
    heading: group[0].path.join(" › "),
    content: group.map(renderPiece).join("\n\n"),
  }));
}

function parseSections(text: string): Piece[] {
  const sections: Piece[] = [];
  const stack: { level: number; title: string }[] = [];
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
    const content = body.join("\n").trim();
    if (content) sections.push({ path: stack.map((s) => s.title), body: content });
    body = [];
  };

  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const title = stripMarkdown(m[2]);
      if (title) stack.push({ level, title });
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function renderPiece(p: Piece): string {
  return p.path.length ? `## ${p.path.join(" › ")}\n\n${p.body}` : p.body;
}

function headerCost(path: string[]): number {
  return path.length ? path.join(" › ").length + 5 : 0;
}

// Splits one section into pieces that fit, overlapping consecutive pieces.
function splitSection(section: Piece, max: number): Piece[] {
  const budget = Math.max(300, max - headerCost(section.path));
  const blocks = section.body
    .split(/\n{2,}/)
    .flatMap((b) => (b.length > budget ? splitBlock(b, budget) : [b]));

  const bodies: string[] = [];
  let cur = "";
  for (const block of blocks) {
    if (cur && cur.length + 2 + block.length > budget) {
      bodies.push(cur);
      const overlap = isTable(block) ? "" : tailOverlap(cur);
      cur =
        overlap && overlap.length + 2 + block.length <= budget ? `${overlap}\n\n${block}` : block;
    } else {
      cur = cur ? `${cur}\n\n${block}` : block;
    }
  }
  if (cur) bodies.push(cur);
  return bodies.map((body) => ({ path: section.path, body }));
}

function isTable(block: string): boolean {
  return block.split("\n").every((l) => l.trim().startsWith("|"));
}

function splitBlock(block: string, max: number): string[] {
  const lines = block.split("\n");
  if (isTable(block)) {
    // Repeat the header row on every part of a long table.
    const hasHeader = lines.length > 2 && /^\|?\s*:?-{3,}/.test(lines[1].trim());
    const header = hasHeader ? lines.slice(0, 2) : [];
    const rows = hasHeader ? lines.slice(2) : lines;
    return pack(rows, max - header.join("\n").length - 1, "\n").map((part) =>
      header.length ? `${header.join("\n")}\n${part}` : part,
    );
  }
  const units = lines.flatMap((line) => (line.length > max ? splitLine(line, max) : [line]));
  return pack(units, max, "\n");
}

function splitLine(line: string, max: number): string[] {
  const sentences = line.split(/(?<=[.!?।])\s+/);
  const units = sentences.flatMap((s) => {
    if (s.length <= max) return [s];
    const parts: string[] = [];
    for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
    return parts;
  });
  return pack(units, max, " ");
}

function pack(units: string[], max: number, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + sep.length + u.length > max) {
      out.push(cur);
      cur = u;
    } else {
      cur = cur ? cur + sep + u : u;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// The last sentence or two of a piece, repeated at the start of the next one.
function tailOverlap(text: string): string {
  if (text.length <= OVERLAP * 2) return "";
  const tail = text.slice(-OVERLAP);
  const m = /[.!?।\n]\s+/.exec(tail);
  if (!m) return "";
  const out = tail.slice(m.index + m[0].length).trim();
  return out.length >= 40 ? `…${out}` : "";
}

function mergeSmall(pieces: Piece[], max: number): Piece[][] {
  const groups: Piece[][] = [];
  let cur: Piece[] = [];
  let curLen = 0;
  for (const p of pieces) {
    const len = renderPiece(p).length;
    const small = curLen < CHUNK_MIN || len < CHUNK_MIN;
    if (cur.length && small && curLen + 2 + len <= max) {
      cur.push(p);
      curLen += 2 + len;
    } else {
      if (cur.length) groups.push(cur);
      cur = [p];
      curLen = len;
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}
