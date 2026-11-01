// Server-only: exam papers read in the background. A PDF is uploaded to the
// private exam-papers bucket and queued with its paper; the background tick
// (and the admin page, while open) reads it a few pages at a time, each page
// sent to the AI as a one-page PDF, into the same reading as the page-by-page
// reader. Pages that fail are tried again; a page failing three times stops
// the paper (try again from the queue).
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPaper, readPaperPage, type PaperMeta } from "@/lib/exam-papers.server";
import type { PaperKind } from "@/lib/exam-papers";

const BUCKET = "exam-papers";
const from = (table: string) => supabaseAdmin.from(table as never);
const store = () => supabaseAdmin.storage.from(BUCKET);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
const missing = (e: { message: string } | null) =>
  !!e && /exam_paper_queue|schema cache|does not exist/.test(e.message);
export const QUEUE_NOT_READY =
  "The upload queue needs a database update: run the latest migration (exam_paper_queue) in Lovable or the SQL editor.";

// Pages per step, and how long one reader holds a paper.
const PAGES_PER_STEP = 3;
const LOCK_SECONDS = 150;
const MAX_TRIES = 3;

export type QueueItem = {
  id: string;
  paper_id: string | null;
  file_name: string;
  file_path: string;
  status: "uploading" | "waiting" | "reading" | "done" | "failed";
  pages: number;
  pages_done: number;
  attempts: number;
  error: string | null;
  locked_until: string | null;
  created_at: string;
};

// A paper and its queue item; the PDF is uploaded next with the link given.
export async function startQueued(input: {
  meta: PaperMeta;
  kind: PaperKind;
  file_name: string;
  pages: number;
}) {
  const probe = await from("exam_paper_queue").select("id").limit(1);
  if (missing(probe.error)) throw new Error(QUEUE_NOT_READY);
  const paper = await createPaper(input.meta, "pdf", input.pages, input.kind);
  const path = `queue/${paper.id}.pdf`;
  const { data, error } = await from("exam_paper_queue")
    .insert({
      paper_id: paper.id,
      file_name: input.file_name.slice(0, 200),
      file_path: path,
      pages: input.pages,
    } as never)
    .select("*")
    .single();
  fail(error);
  const up = await store().createSignedUploadUrl(path, { upsert: true });
  fail(up.error);
  return {
    paper,
    item: data as unknown as QueueItem,
    upload: { path, token: up.data!.token },
  };
}

// The file is up: the queue reads it.
export async function markUploaded(id: string) {
  fail(
    (
      await from("exam_paper_queue")
        .update({ status: "waiting", updated_at: now() } as never)
        .eq("id", id)
        .eq("status", "uploading")
    ).error,
  );
}

export async function listQueue(): Promise<{
  ready: boolean;
  items: (QueueItem & { exam: string })[];
}> {
  const { data, error } = await from("exam_paper_queue")
    .select("*, paper:exam_papers(exam)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (missing(error)) return { ready: false, items: [] };
  fail(error);
  return {
    ready: true,
    items: ((data ?? []) as unknown as (QueueItem & { paper: { exam: string } | null })[]).map(
      ({ paper, ...q }) => ({ ...q, exam: paper?.exam ?? q.file_name }),
    ),
  };
}

export async function retryQueued(id: string) {
  fail(
    (
      await from("exam_paper_queue")
        .update({
          status: "waiting",
          attempts: 0,
          error: null,
          locked_until: null,
          updated_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
}

// Off the queue (the paper and what was read stay).
export async function removeQueued(id: string) {
  const { data } = await from("exam_paper_queue").select("file_path").eq("id", id).maybeSingle();
  const path = (data as { file_path?: string } | null)?.file_path;
  if (path) await store().remove([path]);
  fail((await from("exam_paper_queue").delete().eq("id", id)).error);
}

// One page of a PDF, alone, as base64.
export async function pdfPage(doc: PDFDocument, index: number): Promise<string> {
  const one = await PDFDocument.create();
  const [page] = await one.copyPages(doc, [index]);
  one.addPage(page);
  return Buffer.from(await one.save()).toString("base64");
}

// Takes the next paper to read (one reader at a time).
async function claim(id?: string): Promise<QueueItem | null> {
  let q = from("exam_paper_queue")
    .select("*")
    .in("status", ["waiting", "reading"])
    .or(`locked_until.is.null,locked_until.lt.${now()}`)
    .order("created_at")
    .limit(1);
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (missing(error)) return null;
  fail(error);
  const item = ((data ?? []) as unknown as QueueItem[])[0];
  if (!item) return null;
  const until = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString();
  let upd = from("exam_paper_queue")
    .update({ status: "reading", locked_until: until, updated_at: now() } as never)
    .eq("id", item.id);
  upd = item.locked_until
    ? upd.eq("locked_until", item.locked_until)
    : upd.is("locked_until", null);
  const { data: got } = await upd.select("id");
  return (got ?? []).length ? { ...item, status: "reading", locked_until: until } : null;
}

// Reads the next pages of the next paper (or of the one given). Returns what
// it did, or null when nothing is waiting.
export async function queueStep(id?: string): Promise<string | null> {
  const item = await claim(id);
  if (!item) return null;
  const release = (patch: Record<string, unknown>) =>
    from("exam_paper_queue")
      .update({ ...patch, locked_until: null, updated_at: now() } as never)
      .eq("id", item.id);
  if (!item.paper_id) {
    await release({ status: "failed", error: "Its paper was deleted." });
    return "paper deleted";
  }
  const blob = await store().download(item.file_path);
  if (blob.error || !blob.data) {
    await release({ status: "failed", error: "The PDF isn't in storage: upload it again." });
    return "no file";
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(new Uint8Array(await blob.data.arrayBuffer()), {
      ignoreEncryption: true,
    });
  } catch {
    await release({ status: "failed", error: "This PDF can't be opened." });
    return "bad pdf";
  }
  const pages = doc.getPageCount();
  let done = item.pages_done;
  let attempts = item.attempts;
  const t0 = Date.now();
  for (let n = 0; n < PAGES_PER_STEP && done < pages && Date.now() - t0 < 60_000; n++) {
    const page = done + 1;
    try {
      await readPaperPage(item.paper_id, page, pages, {
        media_type: "application/pdf",
        data: await pdfPage(doc, page - 1),
      });
      done = page;
      attempts = 0;
      await from("exam_paper_queue")
        .update({ pages, pages_done: done, attempts: 0, error: null, updated_at: now() } as never)
        .eq("id", item.id);
    } catch (e) {
      attempts++;
      const message = e instanceof Error ? e.message : String(e);
      await release({
        pages,
        attempts,
        error: `Page ${page}: ${message}`.slice(0, 500),
        status: attempts >= MAX_TRIES ? "failed" : "waiting",
      });
      return `page ${page} failed`;
    }
  }
  if (done >= pages) {
    await release({ pages, pages_done: done, status: "done", error: null });
    await store().remove([item.file_path]);
    return `read ${item.file_name}`;
  }
  await release({ pages, pages_done: done, status: "waiting", attempts });
  return `read ${item.file_name} to page ${done}`;
}
