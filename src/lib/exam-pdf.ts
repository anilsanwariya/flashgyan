// In the browser: a question paper's PDF made into page images for the AI to
// read (scans included), and a PDF's own text (an answer key printed as a
// table). Uses pdf.js, loaded only when needed.

export type PageImage = { media_type: "image/jpeg"; data: string };

// Longest side of a page image: enough for small print, small enough to send.
const PAGE_SIDE = 2000;

// The legacy build: the modern one needs very new browser features (missing
// in Telegram's browser and older phones).
async function pdfjs() {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

// pdf.js's decoders for scanned pages (CCITT and JBIG2 black-and-white
// scans, JPEG 2000, colour profiles), served with the app: without them
// those pages come out blank.
const WASM: Record<string, () => Promise<{ default: string }>> = {
  "jbig2.wasm": () => import("pdfjs-dist/wasm/jbig2.wasm?url"),
  "openjpeg.wasm": () => import("pdfjs-dist/wasm/openjpeg.wasm?url"),
  "qcms_bg.wasm": () => import("pdfjs-dist/wasm/qcms_bg.wasm?url"),
};
class BinaryData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "wasmUrl" ? WASM[filename] : undefined;
    if (!url) throw new Error(`No ${filename}`);
    const res = await fetch((await url()).default);
    if (!res.ok) throw new Error(`Couldn't load ${filename}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

async function open(file: File) {
  const lib = await pdfjs();
  return lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    BinaryDataFactory: BinaryData,
  } as Parameters<typeof lib.getDocument>[0]).promise;
}

export async function pdfPageCount(file: File): Promise<number> {
  const doc = await open(file);
  const n = doc.numPages;
  await doc.loadingTask.destroy();
  return n;
}

const toBase64 = async (blob: Blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
};

// Each page from `first` on, as an image, handed to `each` in turn (which
// can stop by returning false).
export async function eachPageImage(
  file: File,
  first: number,
  each: (page: number, pages: number, image: PageImage) => Promise<boolean | void>,
): Promise<void> {
  const doc = await open(file);
  try {
    for (let n = Math.max(1, first); n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: PAGE_SIDE / Math.max(base.width, base.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
      if (!blob) throw new Error(`Couldn't read page ${n}`);
      const go = await each(n, doc.numPages, {
        media_type: "image/jpeg",
        data: await toBase64(blob),
      });
      if (go === false) break;
    }
  } finally {
    await doc.loadingTask.destroy();
  }
}

// A PDF's own text, line by line as printed (pieces on one line, left to
// right). Empty for a scan.
export async function pdfText(file: File): Promise<string> {
  const doc = await open(file);
  try {
    const lines: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const it of content.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        const row = rows.get(y) ?? [];
        const x = it.transform[4];
        const s = it.str.trim();
        // Bold printed by drawing the text twice, a little apart: kept once.
        if (row.some((r) => r.s === s && Math.abs(r.x - x) < 3)) continue;
        row.push({ x, s });
        rows.set(y, row);
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a))
        lines.push(
          rows
            .get(y)!
            .sort((a, b) => a.x - b.x)
            .map((r) => r.s)
            .join(" "),
        );
    }
    return lines.join("\n");
  } finally {
    await doc.loadingTask.destroy();
  }
}

// An image file (a photo or scan of a key) for the AI, about 2,000 px.
export async function imageFile(file: File): Promise<PageImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
  if (!blob) throw new Error("Couldn't read this image");
  return { media_type: "image/jpeg", data: await toBase64(blob) };
}

// A workbook's sheets as rows (header row first).
export async function workbookSheets(
  file: File,
): Promise<{ name: string; rows: Record<string, unknown>[] }[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" }),
  }));
}

// Saves a workbook with these sheets (rows of objects, keys as headers).
export async function saveWorkbook(
  fileName: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[],
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    // Wide question columns.
    ws["!cols"] = Object.keys(s.rows[0] ?? {}).map((h) => ({
      wch: /question|option/i.test(h) ? 40 : 14,
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}
