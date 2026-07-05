// Server function: parse a PDF via LlamaCloud's LlamaParse API and return markdown.
// Requires LLAMA_CLOUD_API_KEY in server env. Requires an authenticated user.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LLAMA_BASE = "https://api.cloud.llamaindex.ai/api/parsing";
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000; // 3 min

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const parsePdfWithLlama = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(300),
        // base64-encoded PDF bytes (no data: prefix)
        base64: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) throw new Error("LLAMA_CLOUD_API_KEY is not configured");

    const bytes = b64ToBytes(data.base64);
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
    form.append("language", "en");
    form.append("result_type", "markdown");

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

    // 3) Fetch markdown
    const mdRes = await fetch(`${LLAMA_BASE}/job/${jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!mdRes.ok) {
      const body = await mdRes.text().catch(() => "");
      throw new Error(`LlamaParse result failed (${mdRes.status}): ${body.slice(0, 500)}`);
    }
    const mdJson = (await mdRes.json()) as { markdown?: string };
    const markdown = (mdJson.markdown ?? "").trim();
    if (!markdown) throw new Error("LlamaParse returned empty markdown");
    return { markdown };
  });
