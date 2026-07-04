// Client-side document text extraction for SAATHI knowledge uploads.
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { supabase } from "@/integrations/supabase/client";

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return extractXlsx(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();
  throw new Error("Unsupported file type. Use .pdf, .docx, or .xlsx");
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value.trim();
}

async function extractXlsx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n").trim();
}

// 🚀 FIXED: Sends the PDF to our LlamaParse Edge Function to extract layout, tables, and diagrams perfectly!
async function extractPdf(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const { data, error } = await supabase.functions.invoke('parse-pdf', {
    body: formData,
  });

  if (error) throw new Error(error.message);
  if (!data?.markdown) throw new Error("No markdown returned from parser");

  return data.markdown;
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
    const findKey = (want: string) =>
      headers.find((h) => norm(h) === want) ?? null;
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