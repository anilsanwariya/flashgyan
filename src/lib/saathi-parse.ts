// Client-side document text extraction for SAATHI knowledge uploads.
import * as XLSX from "xlsx";
import mammoth from "mammoth";

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

async function extractPdf(file: File): Promise<string> {
  // Dynamic import for client-only browser worker
  const pdfjs = await import("pdfjs-dist");
  // Use bundled worker via Vite ?url
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: unknown) => (it as { str?: string }).str ?? "")
      .join(" ");
    parts.push(text);
  }
  return parts.join("\n\n").trim();
}
