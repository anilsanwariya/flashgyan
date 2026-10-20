// Parsing a PDF with LlamaCloud's LlamaParse API into markdown (one string a
// page too). Requires LLAMA_CLOUD_API_KEY. Used for knowledge-base uploads
// and for material added to a magazine story.
const LLAMA_BASE = "https://api.cloud.llamaindex.ai/api/parsing";
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000; // 3 min

export async function parsePdfBytes(
  bytes: Uint8Array,
  data: { filename: string; medium?: "Hindi" | "English" | "Bilingual" },
): Promise<{ markdown: string; pages: string[] }> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) throw new Error("LLAMA_CLOUD_API_KEY is not configured");

  if (bytes.byteLength === 0) throw new Error("Empty PDF payload");
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds ${MAX_PDF_BYTES / (1024 * 1024)} MB limit`);
  }

  // 1) Upload
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    data.filename.endsWith(".pdf") ? data.filename : `${data.filename}.pdf`,
  );
  // Devanagari OCR also reads Latin text, so Bilingual material uses it too.
  form.append("language", data.medium && data.medium !== "English" ? "hi" : "en");
  form.append("result_type", "markdown");
  // Diagonal text on book pages is almost always a watermark.
  form.append("skip_diagonal_text", "true");

  const uploadRes = await fetch(`${LLAMA_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new Error(`LlamaParse upload failed (${uploadRes.status}): ${body.slice(0, 500)}`);
  }
  const uploadJson = (await uploadRes.json()) as { id?: string };
  const jobId = uploadJson.id;
  if (!jobId) throw new Error("LlamaParse did not return a job id");

  // 2) Poll for completion
  const started = Date.now();
  while (true) {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error("LlamaParse timed out");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(`${LLAMA_BASE}/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!statusRes.ok) {
      const body = await statusRes.text().catch(() => "");
      throw new Error(`LlamaParse status failed (${statusRes.status}): ${body.slice(0, 500)}`);
    }
    const statusJson = (await statusRes.json()) as { status?: string };
    const status = (statusJson.status ?? "").toUpperCase();
    if (status === "SUCCESS") break;
    if (status === "ERROR" || status === "FAILED" || status === "CANCELED") {
      throw new Error(`LlamaParse job ${status.toLowerCase()}`);
    }
  }

  // 3) Fetch the result page by page (needed to spot running headers and
  //    footers), falling back to the single markdown document.
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  let pages: string[] = [];
  const jsonRes = await fetch(`${LLAMA_BASE}/job/${jobId}/result/json`, { headers });
  if (jsonRes.ok) {
    const json = (await jsonRes.json().catch(() => null)) as {
      pages?: { md?: string; text?: string }[];
    } | null;
    pages = (json?.pages ?? []).map((p) => (p.md ?? p.text ?? "").trim());
  }
  let markdown = pages.join("\n\n").trim();
  if (!markdown) {
    const mdRes = await fetch(`${LLAMA_BASE}/job/${jobId}/result/markdown`, { headers });
    if (!mdRes.ok) {
      const body = await mdRes.text().catch(() => "");
      throw new Error(`LlamaParse result failed (${mdRes.status}): ${body.slice(0, 500)}`);
    }
    const mdJson = (await mdRes.json()) as { markdown?: string };
    markdown = (mdJson.markdown ?? "").trim();
    // LlamaParse separates pages in its markdown with a "---" line.
    const split = markdown.split(/\n-{3}\n/);
    pages = split.length >= 3 ? split : [markdown];
  }
  if (!markdown) throw new Error("LlamaParse returned empty markdown");
  return { markdown, pages };
}
