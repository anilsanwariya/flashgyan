// Client-side document text extraction for SAATHI knowledge uploads.
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { parsePdfWithLlama } from "@/lib/saathi-pdf.functions";

export async function extractTextFromFile(
  file: File,
  medium?: "Hindi" | "English" | "Bilingual",
): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file, medium);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return extractXlsx(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();
  throw new Error("Unsupported file type. Use .pdf, .docx, or .xlsx");
}

// Converts via HTML so headings, lists and tables survive; SAATHI's chunker
// uses the headings to keep each chunk's context.
async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await mammoth.convertToHtml({ arrayBuffer: buf });
  return htmlToMarkdown(res.value);
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const inner = Array.from(node.childNodes).map(inline).join("");
    switch (node.tagName) {
      case "STRONG":
      case "B":
        return inner.trim() ? `**${inner.trim()}**` : "";
      case "EM":
      case "I":
        return inner.trim() ? `*${inner.trim()}*` : "";
      case "BR":
        return "\n";
      default:
        return inner;
    }
  };
  const cell = (el: Element) => inline(el).replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  const isList = (n: Node) => n instanceof Element && (n.tagName === "UL" || n.tagName === "OL");
  const list = (el: Element, depth: number): string =>
    Array.from(el.children)
      .filter((li) => li.tagName === "LI")
      .map((li, i) => {
        const text = Array.from(li.childNodes)
          .filter((n) => !isList(n))
          .map(inline)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        const marker = el.tagName === "OL" ? `${i + 1}.` : "-";
        const nested = Array.from(li.children).filter(isList);
        return [
          `${"  ".repeat(depth)}${marker} ${text}`,
          ...nested.map((n) => list(n, depth + 1)),
        ].join("\n");
      })
      .join("\n");
  const blocks: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const text = cell(child);
        if (text) blocks.push(`${"#".repeat(Number(tag[1]))} ${text}`);
      } else if (tag === "P") {
        const text = inline(child).trim();
        if (text) blocks.push(text);
      } else if (tag === "UL" || tag === "OL") {
        const text = list(child, 0);
        if (text) blocks.push(text);
      } else if (tag === "TABLE") {
        const rows = Array.from(child.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.children).map(cell),
        );
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
          const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
          blocks.push(
            [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n"),
          );
        }
      } else {
        walk(child);
      }
    }
  };
  walk(doc.body);
  return blocks.join("\n\n").trim();
}

// Each row becomes "**Header:** value" lines, which search far better than CSV.
async function extractXlsx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: "",
      raw: false,
    });
    const blocks = rows
      .map((r) =>
        Object.entries(r)
          .map(([k, v]) => [k.trim(), String(v ?? "").trim()] as const)
          .filter(([k, v]) => v && !/^__EMPTY/.test(k))
          .map(([k, v]) => `**${k}:** ${v}`)
          .join("\n"),
      )
      .filter(Boolean);
    if (blocks.length) parts.push(`# ${sheetName}\n\n${blocks.join("\n\n")}`);
  }
  return parts.join("\n\n").trim();
}

// Encode a File to base64 without stack-blowing on large inputs.
async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Sends the PDF to our TanStack server fn which calls LlamaParse.
async function extractPdf(file: File, medium?: "Hindi" | "English" | "Bilingual"): Promise<string> {
  return (await extractPdfPages(file, medium)).markdown;
}

// The parsed PDF as a whole and page by page (for header/footer cleanup).
export async function extractPdfPages(
  file: File,
  medium?: "Hindi" | "English" | "Bilingual",
): Promise<{ markdown: string; pages: string[] }> {
  const base64 = await fileToBase64(file);
  const { markdown, pages } = await parsePdfWithLlama({
    data: { filename: file.name, base64, medium },
  });
  if (!markdown) throw new Error("No markdown returned from parser");
  return { markdown, pages: pages.length ? pages : [markdown] };
}

export type QnARow = {
  order: number | null;
  question: string;
  answer: string;
  explanations: { title: string; body: string }[];
  /** Pre-rendered markdown ready for saving as content */
  markdown: string;
};

const QNA_RESERVED = new Set(["order", "question", "answer"]);

/**
 * Parse an Excel/CSV with header row:
 *   order | question | answer | explanation_title_1 | explanation_title_2 | ...
 * Each row becomes one Q&A entry. Columns after `answer` are treated as
 * explanation sections; their HEADER text is used as the section title and
 * the cell value as the section body.
 */
export async function parseQnAExcel(file: File): Promise<QnARow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: QnARow[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
    const findKey = (want: string) => headers.find((h) => norm(h) === want) ?? null;
    const qKey = findKey("question");
    const aKey = findKey("answer");
    if (!qKey || !aKey) {
      throw new Error(
        `Sheet "${sheetName}" needs columns: question, answer (plus optional order & explanation_* columns).`,
      );
    }
    const orderKey = findKey("order");
    const explanationKeys = headers.filter(
      (h) => !QNA_RESERVED.has(norm(h)) && h !== orderKey && h !== qKey && h !== aKey,
    );

    for (const r of rows) {
      const question = String(r[qKey] ?? "").trim();
      const answer = String(r[aKey] ?? "").trim();
      if (!question || !answer) continue;
      const orderRaw = orderKey ? String(r[orderKey] ?? "").trim() : "";
      const orderNum = orderRaw ? Number(orderRaw) : null;
      const explanations = explanationKeys
        .map((k) => ({
          title: k.trim(),
          body: String(r[k] ?? "").trim(),
        }))
        .filter((e) => e.body.length > 0);

      const lines: string[] = [];
      lines.push(`**Q:** ${question}`);
      lines.push("");
      lines.push(`**Answer:** ${answer}`);
      for (const ex of explanations) {
        lines.push("");
        lines.push(`### ${ex.title}`);
        lines.push(ex.body);
      }
      out.push({
        order: Number.isFinite(orderNum as number) ? (orderNum as number) : null,
        question,
        answer,
        explanations,
        markdown: lines.join("\n"),
      });
    }
  }
  return out;
}

// File types the SAATHI deck form accepts.
export const SAATHI_ACCEPT = ".pdf,.docx,.xlsx,.xls,.txt,.md";

// Adds a file's text under a heading named after the file, pushing the file's own
// headings one level down so they nest beneath it.
export function textBlockForFile(fileName: string, text: string): string {
  const name = fileName.replace(/\.[^.]+$/, "");
  let inFence = false;
  const body = text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      return !inFence && /^#{1,5}\s/.test(line) ? `#${line}` : line;
    })
    .join("\n");
  return `# ${name}\n\n${body}`;
}
