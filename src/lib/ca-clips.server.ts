// Newspaper clipping (server): a day's newspaper PDF kept privately, the
// articles boxed on it, each read by the AI from its images into a source of
// its own, and the clippings shown again in the reader and for story images.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  KEEP_DAYS,
  MAX_PARTS,
  MAX_PDF_MB,
  cleanBox,
  clipContent,
  clipPages,
  clipReadMessages,
  parseClipRead,
  type Clip,
  type ClipBox,
  type ClipPart,
  type Newspaper,
} from "@/lib/ca-clips";
import type { CaSource } from "@/lib/current-affairs.server";
import * as CA from "@/lib/current-affairs.server";

const BUCKET = "ca-clips";
const from = (table: string) => supabaseAdmin.from(table as never);
const store = () => supabaseAdmin.storage.from(BUCKET);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
// Before the clipping migration.
const missing = (e: { message: string } | null) =>
  !!e && /ca_newspapers|ca_clips|schema cache|does not exist/i.test(e.message);
export const CLIPS_NOT_READY =
  "Newspaper clipping needs a database update: run the latest migration (ca_clips) in Lovable or the SQL editor.";

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set: clippings are read by Claude.");
  return key;
}

// Signed links to private files, for an hour.
async function signed(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await store().createSignedUrls(list.slice(i, i + 100), 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}

const withUrls = async (clips: Clip[]): Promise<Clip[]> => {
  const urls = await signed(clips.flatMap((c) => c.parts.map((p) => p.path)));
  return clips.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({ ...p, url: urls.get(p.path) })),
  }));
};

const readClipRow = (r: unknown): Clip => {
  const c = r as Clip;
  return { ...c, parts: Array.isArray(c.parts) ? c.parts : [] };
};

// ---------- Newspapers ----------

// A newspaper about to be uploaded: its record, and where the browser puts
// the PDF (straight to storage: a newspaper is too big for a request).
export async function startNewspaper(input: {
  issue_date: string;
  source_name: string;
  official: boolean;
  pages: number;
  file_size: number;
}): Promise<{ newspaper: Newspaper; upload: { path: string; token: string } }> {
  const name = input.source_name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) throw new Error("Give the newspaper's name.");
  if (input.file_size > MAX_PDF_MB * 1024 * 1024)
    throw new Error(`The PDF is over ${MAX_PDF_MB} MB.`);
  const id = crypto.randomUUID();
  const path = `papers/${input.issue_date}/${id}.pdf`;
  const { data, error } = await from("ca_newspapers")
    .insert({
      id,
      issue_date: input.issue_date,
      source_name: name,
      official: input.official,
      pages: input.pages,
      file_size: input.file_size,
      file_path: path,
    } as never)
    .select("*")
    .single();
  if (missing(error)) throw new Error(CLIPS_NOT_READY);
  fail(error);
  const up = await store().createSignedUploadUrl(path);
  fail(up.error);
  return { newspaper: data as unknown as Newspaper, upload: { path, token: up.data!.token } };
}

export type NewspaperSummary = Newspaper & {
  clips: number;
  read: number;
  waiting: number;
  failed: number;
};

// A day's newspapers, with how far their clipping got. Newspapers older than
// 30 days lose their PDF here (their clippings stay).
export async function listNewspapers(
  date: string,
): Promise<{ ready: boolean; newspapers: NewspaperSummary[] }> {
  await removeOldFiles();
  const { data, error } = await from("ca_newspapers")
    .select("*")
    .eq("issue_date", date)
    .order("created_at");
  if (missing(error)) return { ready: false, newspapers: [] };
  fail(error);
  const papers = (data ?? []) as unknown as Newspaper[];
  if (!papers.length) return { ready: true, newspapers: [] };
  const { data: clips, error: cErr } = await from("ca_clips")
    .select("newspaper_id,status")
    .in(
      "newspaper_id",
      papers.map((p) => p.id),
    );
  fail(cErr);
  const rows = (clips ?? []) as { newspaper_id: string; status: Clip["status"] }[];
  return {
    ready: true,
    newspapers: papers.map((p) => {
      const own = rows.filter((c) => c.newspaper_id === p.id);
      return {
        ...p,
        clips: own.length,
        read: own.filter((c) => c.status === "read").length,
        waiting: own.filter((c) => c.status === "new" || c.status === "changed").length,
        failed: own.filter((c) => c.status === "failed").length,
      };
    }),
  };
}

// A newspaper to clip: its clippings and a link to its PDF (while kept).
export async function getNewspaper(
  id: string,
): Promise<{ newspaper: Newspaper; clips: Clip[]; pdf_url: string | null }> {
  const { data, error } = await from("ca_newspapers").select("*").eq("id", id).single();
  if (missing(error)) throw new Error(CLIPS_NOT_READY);
  fail(error);
  const paper = data as unknown as Newspaper;
  const { data: clips, error: cErr } = await from("ca_clips")
    .select("*")
    .eq("newspaper_id", id)
    .order("created_at");
  fail(cErr);
  let pdf_url: string | null = null;
  if (!paper.file_deleted_at) {
    const { data: s } = await store().createSignedUrl(paper.file_path, 6 * 3600);
    pdf_url = s?.signedUrl ?? null;
  }
  return {
    newspaper: paper,
    clips: await withUrls((clips ?? []).map(readClipRow)),
    pdf_url,
  };
}

export async function renameNewspaper(id: string, sourceName: string, official: boolean) {
  const name = sourceName.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) throw new Error("Give the newspaper's name.");
  fail(
    (
      await from("ca_newspapers")
        .update({ source_name: name, official } as never)
        .eq("id", id)
    ).error,
  );
}

// Deletes a newspaper: its PDF and clippings. The sources read from them
// stay unless `withSources` (then their facts and stories go too).
export async function deleteNewspaper(id: string, withSources: boolean) {
  const { newspaper, clips } = await getNewspaper(id);
  if (withSources) for (const c of clips) if (c.source_id) await CA.deleteSource(c.source_id);
  const paths = [newspaper.file_path, ...clips.flatMap((c) => c.parts.map((p) => p.path))];
  if (paths.length) await store().remove(paths);
  fail((await from("ca_newspapers").delete().eq("id", id)).error);
}

// Newspaper PDFs kept for 30 days, then removed (the clippings stay).
export async function removeOldFiles(): Promise<number> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString();
  const { data, error } = await from("ca_newspapers")
    .select("id,file_path")
    .is("file_deleted_at", null)
    .lt("created_at", cutoff)
    .limit(50);
  if (error) return 0;
  const old = (data ?? []) as { id: string; file_path: string }[];
  if (!old.length) return 0;
  await store().remove(old.map((o) => o.file_path));
  fail(
    (
      await from("ca_newspapers")
        .update({ file_deleted_at: now() } as never)
        .in(
          "id",
          old.map((o) => o.id),
        )
    ).error,
  );
  return old.length;
}

// ---------- Clippings ----------

// Saves a clipping: its boxes in order, with a new image for each box drawn
// or changed (JPEG, made in the browser). A clipping already read is marked
// changed, to be read again.
export async function saveClip(input: {
  newspaper_id: string;
  id?: string;
  parts: (ClipBox & { image?: string })[];
}): Promise<Clip> {
  const { data: np, error: npErr } = await from("ca_newspapers")
    .select("pages")
    .eq("id", input.newspaper_id)
    .single();
  if (missing(npErr)) throw new Error(CLIPS_NOT_READY);
  fail(npErr);
  const pages = (np as unknown as { pages: number }).pages;
  if (!input.parts.length) throw new Error("Draw a box around the article.");
  if (input.parts.length > MAX_PARTS)
    throw new Error(`A clipping can have at most ${MAX_PARTS} parts.`);
  let had: Clip | null = null;
  if (input.id) {
    const { data, error } = await from("ca_clips").select("*").eq("id", input.id).single();
    fail(error);
    had = readClipRow(data);
    if (had.newspaper_id !== input.newspaper_id) throw new Error("Not this newspaper's clipping.");
  }
  const id = had?.id ?? crypto.randomUUID();
  const parts: ClipPart[] = [];
  for (const [i, p] of input.parts.entries()) {
    const box = cleanBox(p, pages);
    if (!box) throw new Error("That box is too small or off the page.");
    // A box kept as it was keeps its image (wherever it is in the order).
    const same = had?.parts.find(
      (q) =>
        q.page === box.page && q.x === box.x && q.y === box.y && q.w === box.w && q.h === box.h,
    );
    let path = same?.path ?? had?.parts[i]?.path ?? "";
    if (p.image) {
      path = `clips/${id}/${crypto.randomUUID()}.jpg`;
      const bytes = Uint8Array.from(atob(p.image), (c) => c.charCodeAt(0));
      fail((await store().upload(path, bytes, { contentType: "image/jpeg" })).error);
    }
    if (!path) throw new Error("A new box needs its image.");
    parts.push({ ...box, path });
  }
  // Compared field by field (the database keeps the keys in its own order).
  const key = (p: ClipPart) => [p.page, p.x, p.y, p.w, p.h, p.path].join("|");
  const changed = !had || had.parts.map(key).join(";") !== parts.map(key).join(";");
  // Read before (an article or skipped): to be read again; otherwise waiting.
  const status = !had
    ? "new"
    : !changed
      ? had.status
      : had.status === "read" || had.status === "skipped" || had.status === "changed"
        ? "changed"
        : "new";
  const row = {
    id,
    newspaper_id: input.newspaper_id,
    parts,
    status,
    error: null,
    updated_at: now(),
  };
  const { data, error } = await from("ca_clips")
    .upsert(row as never)
    .select("*")
    .single();
  fail(error);
  // Images no longer used.
  const gone = (had?.parts ?? [])
    .map((p) => p.path)
    .filter((p) => !parts.some((q) => q.path === p));
  if (gone.length) await store().remove(gone);
  return (await withUrls([readClipRow(data)]))[0];
}

// Deletes a clipping, and the source read from it with the facts that came
// only from it.
export async function deleteClip(id: string) {
  const { data, error } = await from("ca_clips").select("*").eq("id", id).single();
  fail(error);
  const clip = readClipRow(data);
  if (clip.source_id) await CA.deleteSource(clip.source_id);
  if (clip.parts.length) await store().remove(clip.parts.map((p) => p.path));
  fail((await from("ca_clips").delete().eq("id", id)).error);
}

const toBase64 = (buf: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
};

// Reads a clipping with the AI into its own source (replacing the one read
// before, after its boxes changed). Ads and the like are skipped. The
// browser then reads the source into stories, as for an uploaded source.
export async function readClip(
  id: string,
): Promise<{ clip: Clip; source: CaSource | null; kind: string }> {
  const { data, error } = await from("ca_clips").select("*").eq("id", id).single();
  fail(error);
  const clip = readClipRow(data);
  const { data: np, error: npErr } = await from("ca_newspapers")
    .select("*")
    .eq("id", clip.newspaper_id)
    .single();
  fail(npErr);
  const paper = np as unknown as Newspaper;
  const update = async (patch: Record<string, unknown>) => {
    const { data: row, error: uErr } = await from("ca_clips")
      .update({ ...patch, updated_at: now() } as never)
      .eq("id", id)
      .select("*")
      .single();
    fail(uErr);
    return (await withUrls([readClipRow(row)]))[0];
  };
  try {
    const images = [];
    for (const p of clip.parts) {
      const { data: blob, error: dErr } = await store().download(p.path);
      if (dErr || !blob) throw new Error("A clipping image is missing: draw the box again.");
      images.push({
        media_type: "image/jpeg" as const,
        data: toBase64(new Uint8Array(await blob.arrayBuffer())),
      });
    }
    const read = parseClipRead(
      await saathiComplete(
        apiKey(),
        clipReadMessages(paper.source_name, clip.parts.length),
        undefined,
        images,
      ),
    );
    // The article read before is replaced.
    if (clip.source_id) await CA.deleteSource(clip.source_id);
    if (read.kind === "ad" || read.kind === "other" || read.text.length < 40) {
      const skipped = await update({
        status: "skipped",
        source_id: null,
        headline: read.headline || (read.kind === "ad" ? "Advertisement" : ""),
        error: null,
      });
      return { clip: skipped, source: null, kind: read.kind };
    }
    const headline = read.headline || read.text.split("\n")[0].slice(0, 120);
    const source = await CA.addSource({
      issue_date: paper.issue_date,
      section: paper.official ? "dipr" : read.kind === "editorial" ? "editorial" : "news",
      source_name: paper.source_name,
      title: `${headline} (${clipPages(clip.parts)})`.slice(0, 300),
      content: clipContent(headline, read.text, paper.source_name, clipPages(clip.parts)),
      official: paper.official,
    });
    const done = await update({ status: "read", source_id: source.id, headline, error: null });
    return { clip: done, source, kind: read.kind };
  } catch (e) {
    await update({
      status: "failed",
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    throw e;
  }
}

// The clippings of these sources (for the reader and story images), with
// links to their images.
export async function clipsOfSources(
  sourceIds: string[],
): Promise<{ source_id: string; source_name: string; parts: ClipPart[] }[]> {
  if (!sourceIds.length) return [];
  const { data, error } = await from("ca_clips").select("*").in("source_id", sourceIds);
  if (missing(error)) return [];
  fail(error);
  const clips = await withUrls((data ?? []).map(readClipRow));
  const papers = new Map<string, string>();
  const ids = [...new Set(clips.map((c) => c.newspaper_id))];
  if (ids.length) {
    const { data: np } = await from("ca_newspapers").select("id,source_name").in("id", ids);
    for (const p of (np ?? []) as { id: string; source_name: string }[])
      papers.set(p.id, p.source_name);
  }
  return clips.map((c) => ({
    source_id: c.source_id!,
    source_name: papers.get(c.newspaper_id) ?? "",
    parts: c.parts,
  }));
}
