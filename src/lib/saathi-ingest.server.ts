// Server-only SAATHI ingestion: chunk, embed in batches, check for duplicates and
// save all-or-nothing, so a failed upload never leaves a half-saved document.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chunkDocument } from "@/lib/saathi-chunk";
import { saathiEmbedMany } from "../../supabase/functions/_shared/saathi-core.ts";

export type SaathiDocMeta = {
  title: string;
  subject: string;
  topic: string | null;
  medium: string;
  // Who published it (NCERT, IGNOU…), shown with the title when it is cited.
  source?: string | null;
};

type PreparedChunk = {
  title: string;
  content: string;
  chunk_index: number;
  embedding: number[];
};

const MAX_CHUNKS = 800;
const INSERT_BATCH = 50;
// Share of a new document's chunks that may already exist elsewhere before the
// upload is treated as a copy.
const DUPLICATE_SHARE = 0.8;

const table = () => supabaseAdmin.from("saathi_knowledge");

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export function cleanSubject(subject: string): string {
  return subject.trim().replace(/\s+/g, " ");
}

// Reuses an existing subject's spelling when only case or spacing differs.
export async function canonicalSubject(subject: string): Promise<string> {
  const clean = cleanSubject(subject);
  const { data, error } = await table().select("subject").is("parent_id", null);
  if (error) throw new Error(error.message);
  const match = (data ?? []).find(
    (r) => cleanSubject(r.subject).toLowerCase() === clean.toLowerCase(),
  );
  return match ? cleanSubject(match.subject) : clean;
}

// The text that gets embedded: where the chunk lives, then the chunk itself.
export function embeddingText(meta: SaathiDocMeta, content: string): string {
  const where = [meta.subject, meta.topic, meta.title].filter(Boolean).join(" › ");
  return `${where}\n\n${content}`;
}

export function chunkTitle(docTitle: string, index: number, total: number): string {
  return total > 1 ? `${docTitle} (Part ${index})` : docTitle;
}

async function prepareChunks(
  meta: SaathiDocMeta,
  text: string,
  startIndex: number,
  totalAfter: (count: number) => number,
): Promise<PreparedChunk[]> {
  const chunks = chunkDocument(text);
  if (chunks.length === 0) throw new Error("No text found to save.");
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `This document makes ${chunks.length} chunks (max ${MAX_CHUNKS}). Split it into smaller files.`,
    );
  }
  const embeddings = await saathiEmbedMany(
    apiKey(),
    chunks.map((c) => embeddingText(meta, c.content)),
  );
  const total = totalAfter(chunks.length);
  return chunks.map((c, i) => ({
    title: chunkTitle(meta.title, startIndex + i, total),
    content: c.content,
    chunk_index: startIndex + i,
    embedding: embeddings[i],
  }));
}

async function assertNotDuplicate(contents: string[], excludeParent: string | null) {
  const { data, error } = await supabaseAdmin.rpc(
    "saathi_find_duplicate_chunks" as never,
    {
      contents,
      exclude_parent: excludeParent,
    } as never,
  );
  if (error) {
    // Older database without the duplicate check: skip it rather than block uploads.
    if (error.code === "PGRST202") return;
    throw new Error(error.message);
  }
  const top = ((data ?? []) as { title: string; matches: number }[])[0];
  if (top && top.matches / contents.length >= DUPLICATE_SHARE) {
    throw new Error(
      `This looks like a copy of "${top.title}" (${top.matches} of ${contents.length} parts are already saved). Use Replace on that document instead.`,
    );
  }
}

async function insertChunks(parentId: string, meta: SaathiDocMeta, chunks: PreparedChunk[]) {
  const inserted: string[] = [];
  try {
    for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
      const rows = chunks.slice(i, i + INSERT_BATCH).map((c) => ({
        parent_id: parentId,
        title: c.title,
        subject: meta.subject,
        topic: meta.topic,
        medium: meta.medium,
        content: c.content,
        source_file: meta.title,
        chunk_index: c.chunk_index,
        embedding: c.embedding as unknown as string,
      }));
      const { data, error } = await table()
        .insert(rows as never)
        .select("id");
      if (error) throw new Error(error.message);
      inserted.push(...(data ?? []).map((r) => r.id));
    }
  } catch (e) {
    await deleteIds(inserted);
    throw e;
  }
}

async function deleteIds(ids: string[]) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await table()
      .delete()
      .in("id", ids.slice(i, i + 100));
    if (error) console.error("saathi cleanup:", error.message);
  }
}

export async function createDocument(meta: SaathiDocMeta, text: string) {
  const subject = await canonicalSubject(meta.subject);
  const doc = { ...meta, subject };
  const chunks = await prepareChunks(doc, text, 1, (n) => n);
  await assertNotDuplicate(
    chunks.map((c) => c.content),
    null,
  );

  const { data: parent, error } = await table()
    .insert({
      title: doc.title,
      subject: doc.subject,
      topic: doc.topic,
      medium: doc.medium,
      content: "",
      source_file: doc.title,
      source_markdown: text,
      ...(doc.source ? { source: doc.source } : {}),
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const parentId = (parent as { id: string }).id;

  try {
    await insertChunks(parentId, doc, chunks);
  } catch (e) {
    await deleteIds([parentId]);
    throw e;
  }
  return { id: parentId, chunks: chunks.length, subject };
}

type ParentRow = {
  id: string;
  parent_id: string | null;
  title: string;
  subject: string;
  topic: string | null;
  medium: string;
  content: string;
  source_markdown: string | null;
};

async function loadParent(id: string): Promise<ParentRow> {
  const { data, error } = await table()
    .select("id,parent_id,title,subject,topic,medium,content,source_markdown")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as ParentRow;
  if (row.parent_id) throw new Error("Expected a document, got a chunk.");
  return row;
}

async function loadChunks(parentId: string) {
  const { data, error } = await table()
    .select("id,content,chunk_index")
    .eq("parent_id", parentId)
    .order("chunk_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

const metaOf = (p: ParentRow): SaathiDocMeta => ({
  title: p.title,
  subject: p.subject,
  topic: p.topic,
  medium: p.medium,
});

export async function appendToDocument(parentId: string, text: string) {
  const parent = await loadParent(parentId);
  const existing = await loadChunks(parentId);
  const start = existing.reduce((max, c) => Math.max(max, c.chunk_index ?? 0), 0) + 1;
  const chunks = await prepareChunks(metaOf(parent), text, start, (n) => existing.length + n);
  await assertNotDuplicate(
    chunks.map((c) => c.content),
    null,
  );
  await insertChunks(parentId, metaOf(parent), chunks);

  if (parent.source_markdown != null) {
    await table()
      .update({ source_markdown: `${parent.source_markdown}\n\n${text}` } as never)
      .eq("id", parentId);
  }
  return { added: chunks.length };
}

// Rebuilds a document's chunks from new text, or (text = null) from its saved
// original, or from its old-format content or chunks. New chunks are saved
// before the old ones are removed, so a failure leaves the document as it was.
export async function replaceDocument(parentId: string, text: string | null) {
  const parent = await loadParent(parentId);
  const old = await loadChunks(parentId);
  const source =
    text ??
    parent.source_markdown ??
    (parent.content.trim() ? parent.content : old.map((c) => c.content).join("\n\n"));
  if (!source.trim()) throw new Error("This document has no text to rebuild from.");

  const chunks = await prepareChunks(metaOf(parent), source, 1, (n) => n);
  await assertNotDuplicate(
    chunks.map((c) => c.content),
    parentId,
  );
  await insertChunks(parentId, metaOf(parent), chunks);
  await deleteIds(old.map((c) => c.id));

  // Old single-row documents become normal parents: their text moves to
  // source_markdown and they no longer carry an embedding of their own.
  const { error } = await table()
    .update({
      content: "",
      embedding: null,
      source_markdown: source,
      source_file: parent.title,
    } as never)
    .eq("id", parentId);
  if (error) throw new Error(error.message);
  return { before: old.length, after: chunks.length };
}
