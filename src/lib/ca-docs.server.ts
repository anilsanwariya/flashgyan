// Official documents for the monthly magazine (server). A document added for a
// month is read part by part on the collection schedule: its stories are
// filed under the date it is about (new ones), offered as additions to the
// month's stories already written (the editor approves), checked against
// them for corrections, and a report's findings become its page in
// "Reports & documents of the month".
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import { fixShortFormsDeep } from "../../supabase/functions/_shared/ca-hindi.ts";
import {
  docNotesMessages,
  docSourceName,
  focusLine,
  mergeNotes,
  monthEnd,
  monthOf,
  newFacts,
  parseDocNotes,
  parseReport,
  reportMessages,
  type CaReport,
  type DocNote,
} from "@/lib/ca-docs";
import {
  extractMessages,
  mergeFacts,
  parseExtracted,
  splitSource,
  storyText,
  type CaFact,
} from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const now = () => new Date().toISOString();

// A database without the documents migration.
const missingDocs = (e: { message: string } | null) =>
  !!e &&
  /doc_month|doc_date|doc_focus|doc_notes|doc_lock|official|from_document|ca_doc_additions/.test(
    e.message,
  );
export const DOCS_NOT_READY =
  "This needs a database update: run the latest migration (ca_month_documents) in Lovable or the SQL editor.";

// A document part is worked on by one reader at a time for this long.
const LOCK_MS = 5 * 60_000;
// Stories from a document start in the issue from this importance.
const INCLUDE_FROM = 2;
// Findings a report needs before it gets a page.
const MIN_NOTES = 3;

export type MonthDoc = {
  id: string;
  title: string;
  source_name: string;
  doc_date: string;
  doc_focus: string | null;
  chunks: number;
  chunks_done: number;
  status: string;
  error: string | null;
  created_at: string;
  // Findings gathered for its page, new stories, and additions offered.
  notes: number;
  stories: number;
  additions: number;
};

export type DocAddition = {
  id: string;
  source_id: string;
  item_id: string;
  facts: CaFact[];
  status: "pending" | "approved" | "rejected";
  error: string | null;
  created_at: string;
  // The story it adds to, and the document.
  headline: string;
  issue_date: string;
  doc: string;
};

const DOC_COLS =
  "id,title,source_name,doc_date,doc_focus,doc_month,doc_notes,chunks,chunks_done,status,error,created_at";
type DocRow = Omit<MonthDoc, "notes" | "stories" | "additions"> & {
  doc_month: string;
  doc_notes: DocNote[];
};

// ---------- Adding and listing ----------

export async function addDocument(
  month: string,
  input: {
    name: string;
    released_by: string;
    date: string;
    focus?: string | null;
    content: string;
    url?: string | null;
  },
): Promise<MonthDoc> {
  const m = monthOf(month);
  const date = input.date >= m && input.date <= monthEnd(m) ? input.date : monthEnd(m);
  const content = input.content.trim().slice(0, 600_000);
  if (content.length < 40) throw new Error("There is too little text in this document.");
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 300) || "Official document";
  const { data, error } = await from("ca_sources")
    .insert({
      issue_date: null,
      doc_month: m,
      doc_date: date,
      doc_focus: input.focus?.trim().slice(0, 300) || null,
      official: true,
      section: "other",
      source_name: docSourceName(name, input.released_by),
      title: name,
      content,
      url: input.url ?? null,
      chunks: splitSource(content).length,
      chunks_done: 0,
      status: "new",
    } as never)
    .select(DOC_COLS)
    .single();
  if (missingDocs(error)) throw new Error(DOCS_NOT_READY);
  fail(error);
  return { ...(data as unknown as DocRow), notes: 0, stories: 0, additions: 0 };
}

export async function listDocuments(month: string): Promise<{
  ready: boolean;
  docs: MonthDoc[];
  additions: DocAddition[];
  reports: CaReport[];
}> {
  const m = monthOf(month);
  const { data, error } = await from("ca_sources")
    .select(DOC_COLS)
    .eq("doc_month", m)
    .order("created_at");
  if (missingDocs(error)) return { ready: false, docs: [], additions: [], reports: [] };
  fail(error);
  const rows = (data ?? []) as unknown as DocRow[];
  const ids = rows.map((r) => r.id);
  const stories = new Map<string, number>();
  if (ids.length) {
    const { data: its } = await from("ca_items")
      .select("source_ids")
      .eq("from_document", true)
      .overlaps("source_ids", ids);
    for (const r of (its ?? []) as { source_ids: string[] }[])
      for (const s of r.source_ids) stories.set(s, (stories.get(s) ?? 0) + 1);
  }
  const additions = await listAdditions(m);
  const offered = new Map<string, number>();
  for (const a of additions) offered.set(a.source_id, (offered.get(a.source_id) ?? 0) + 1);
  return {
    ready: true,
    docs: rows.map(({ doc_notes, doc_month: _m, ...r }) => ({
      ...r,
      notes: Array.isArray(doc_notes) ? doc_notes.length : 0,
      stories: stories.get(r.id) ?? 0,
      additions: offered.get(r.id) ?? 0,
    })),
    additions: additions.filter((a) => a.status === "pending"),
    reports: await getReports(m),
  };
}

async function listAdditions(month: string): Promise<DocAddition[]> {
  const { data, error } = await from("ca_doc_additions")
    .select("id,source_id,item_id,facts,status,error,created_at")
    .eq("month", month)
    .order("created_at");
  if (missingDocs(error)) return [];
  fail(error);
  const rows = (data ?? []) as unknown as Omit<DocAddition, "headline" | "issue_date" | "doc">[];
  if (!rows.length) return [];
  const [items, docs] = await Promise.all([
    from("ca_items")
      .select("id,headline,issue_date,content")
      .in("id", [...new Set(rows.map((r) => r.item_id))]),
    from("ca_sources")
      .select("id,title")
      .in("id", [...new Set(rows.map((r) => r.source_id))]),
  ]);
  const byId = new Map(
    (
      (items.data ?? []) as {
        id: string;
        headline: string;
        issue_date: string;
        content: { headline?: { en?: string } } | null;
      }[]
    ).map((i) => [i.id, i]),
  );
  const names = new Map(
    ((docs.data ?? []) as { id: string; title: string }[]).map((d) => [d.id, d.title]),
  );
  return rows.map((r) => {
    const it = byId.get(r.item_id);
    return {
      ...r,
      headline: it?.content?.headline?.en || it?.headline || "",
      issue_date: it?.issue_date ?? "",
      doc: names.get(r.source_id) ?? "",
    };
  });
}

// Removes a document with the stories made only from it; facts it added to
// other stories go too (those stories are written again).
export async function deleteDocument(id: string) {
  const { data } = await from("ca_sources").select("id,doc_month").eq("id", id).maybeSingle();
  const doc = data as { id: string; doc_month: string | null } | null;
  if (!doc?.doc_month) throw new Error("No such document");
  await CA.deleteSource(id);
  const reports = await getReports(doc.doc_month);
  if (reports.some((r) => r.source_id === id))
    await saveReports(
      doc.doc_month,
      reports.filter((r) => r.source_id !== id),
    );
}

// ---------- Reading, one part at a time ----------

// Takes the next document part no other reader is on.
async function claimDocument(): Promise<
  (DocRow & { content: string; doc_focus: string | null }) | null
> {
  const stale = new Date(Date.now() - LOCK_MS).toISOString();
  const { data, error } = await from("ca_sources")
    .select(`${DOC_COLS},content,doc_lock`)
    .not("doc_month", "is", null)
    .in("status", ["new", "extracting"])
    .or(`doc_lock.is.null,doc_lock.lt."${stale}"`)
    .order("created_at")
    .limit(1);
  if (missingDocs(error)) return null;
  fail(error);
  const row = (
    (data ?? []) as unknown as (DocRow & { content: string; doc_lock: string | null })[]
  )[0];
  if (!row) return null;
  // Taken only if no other reader took it since (its lock is as read; an
  // or() filter isn't allowed on an update).
  const claim = from("ca_sources")
    .update({ doc_lock: now() } as never)
    .eq("id", row.id);
  const { data: got } = await (
    row.doc_lock ? claim.eq("doc_lock", row.doc_lock) : claim.is("doc_lock", null)
  ).select("id");
  return (got ?? []).length ? row : null;
}

// Reads the next part of a document. Null when no document waits.
export async function readStep(): Promise<string | null> {
  const doc = await claimDocument();
  if (!doc) return null;
  const parts = splitSource(doc.content);
  const index = doc.chunks_done;
  const text = parts[index];
  const month = doc.doc_month;
  let made = 0;
  let offered = 0;
  let corrections = 0;
  let notes = Array.isArray(doc.doc_notes) ? doc.doc_notes : [];
  try {
    if (text) {
      const key = apiKey();
      const [notesRaw, storiesRaw] = await Promise.all([
        saathiComplete(
          key,
          docNotesMessages({
            name: doc.title,
            releasedBy: doc.source_name,
            focus: doc.doc_focus,
            text,
          }),
        ),
        saathiComplete(
          key,
          extractMessages({
            section: "other",
            sourceName: doc.source_name,
            date: doc.doc_date,
            text,
            extra: focusLine(doc.doc_focus),
          }),
        ),
      ]);
      const found = parseDocNotes(notesRaw, text);
      if (found.report) notes = mergeNotes(notes, found.notes);
      const stories = parseExtracted(storiesRaw, text, doc.id).filter((x) => x.facts.length);
      for (const [n, story] of stories.entries()) {
        const embedding = await CA.embedText(storyText(story));
        const close = (await CA.similarInRange(embedding, month, monthEnd(month)))[0];
        const same =
          close && close.similarity >= CA.FOLLOW_UP_SIMILARITY ? await storyRow(close.id) : null;
        if (same) {
          // A story this document already made takes the facts directly.
          if (same.source_ids.includes(doc.id)) {
            await from("ca_items")
              .update({
                facts: mergeFacts(same.facts, story.facts),
                needs_enrich: true,
                updated_at: now(),
              } as never)
              .eq("id", same.id);
            continue;
          }
          const fresh = newFacts(same.facts, story.facts);
          if (fresh.length) {
            await offerAddition(month, doc.id, same.id, fresh);
            offered++;
          }
          try {
            if (
              await CA.documentCorrection(same.id, {
                name: doc.title,
                date: doc.doc_date,
                facts: story.facts,
              })
            )
              corrections++;
          } catch (e) {
            console.error("document correction:", e);
          }
          continue;
        }
        await CA.insertStory({
          id: crypto.randomUUID(),
          issue_date: doc.doc_date,
          category: story.category === "editorial" ? "misc" : story.category,
          status: story.importance >= INCLUDE_FROM ? "included" : "dropped",
          headline: story.headline,
          facts: story.facts,
          source_ids: [doc.id],
          importance: story.importance,
          rajasthan: story.rajasthan,
          concept: story.concept,
          embedding: embedding as unknown as string,
          story_key: story.key,
          needs_enrich: true,
          from_document: true,
          collected_later: true,
          position: 2000 + index * 50 + n,
        });
        made++;
      }
    }
    const done = Math.min(parts.length, index + 1);
    fail(
      (
        await from("ca_sources")
          .update({
            chunks_done: done,
            status: done >= parts.length ? "done" : "extracting",
            doc_notes: notes,
            doc_lock: null,
            error: null,
            updated_at: now(),
          } as never)
          .eq("id", doc.id)
      ).error,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await from("ca_sources")
      .update({
        status: "error",
        error: msg.slice(0, 300),
        doc_lock: null,
        updated_at: now(),
      } as never)
      .eq("id", doc.id);
    return `“${doc.title}”: ${msg}`;
  }
  const bits = [
    `${made} new ${made === 1 ? "story" : "stories"}`,
    offered ? `${offered} ${offered === 1 ? "addition" : "additions"}` : "",
    corrections ? `${corrections} ${corrections === 1 ? "correction" : "corrections"}` : "",
  ].filter(Boolean);
  return `read part ${index + 1} of “${doc.title}”: ${bits.join(", ")}`;
}

type StoryRow = { id: string; facts: CaFact[]; source_ids: string[] };
async function storyRow(id: string): Promise<StoryRow | null> {
  const { data } = await from("ca_items")
    .select("id,facts,source_ids,issue_date")
    .eq("id", id)
    .not("issue_date", "is", null)
    .maybeSingle();
  return (data as StoryRow | null) ?? null;
}

// One addition per story and document: facts found in a later part join it.
async function offerAddition(month: string, sourceId: string, itemId: string, facts: CaFact[]) {
  const { data } = await from("ca_doc_additions")
    .select("id,facts,status")
    .eq("source_id", sourceId)
    .eq("item_id", itemId)
    .maybeSingle();
  const had = data as { id: string; facts: CaFact[]; status: string } | null;
  if (had) {
    if (had.status !== "pending") return;
    fail(
      (
        await from("ca_doc_additions")
          .update({ facts: [...had.facts, ...newFacts(had.facts, facts)] } as never)
          .eq("id", had.id)
      ).error,
    );
    return;
  }
  fail(
    (
      await from("ca_doc_additions").insert({
        month,
        source_id: sourceId,
        item_id: itemId,
        facts,
      } as never)
    ).error,
  );
}

// ---------- Additions ----------

// Adds the document's facts to the story as key points (or leaves them out).
export async function decideAddition(id: string, approve: boolean) {
  const { data, error } = await from("ca_doc_additions").select("*").eq("id", id).single();
  fail(error);
  const a = data as unknown as { id: string; item_id: string; facts: CaFact[]; status: string };
  if (a.status !== "pending") return;
  if (approve) {
    try {
      await CA.addFactsAsPoints(a.item_id, a.facts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await from("ca_doc_additions")
        .update({ error: msg.slice(0, 300) } as never)
        .eq("id", id);
      throw e;
    }
  }
  fail(
    (
      await from("ca_doc_additions")
        .update({
          status: approve ? "approved" : "rejected",
          error: null,
          decided_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
}

// ---------- Reports ----------

const reportsKey = (month: string) => `ca_reports:${month.slice(0, 7)}`;

export async function getReports(month: string): Promise<CaReport[]> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", reportsKey(month))
    .maybeSingle();
  const list = (data as { value: unknown } | null)?.value;
  return Array.isArray(list) ? (list as CaReport[]) : [];
}

export async function saveReports(month: string, list: CaReport[]) {
  if (!list.length) {
    fail((await from("bot_settings").delete().eq("key", reportsKey(month))).error);
    return;
  }
  fail(
    (
      await from("bot_settings").upsert({
        key: reportsKey(month),
        value: list,
        updated_at: now(),
      } as never)
    ).error,
  );
}

// Writes (or writes again) a document's page from its findings. A draft with
// a number the findings don't state gets one retry, then fails.
export async function writeReport(sourceId: string): Promise<CaReport> {
  const { data, error } = await from("ca_sources")
    .select("id,title,source_name,doc_date,doc_month,doc_notes")
    .eq("id", sourceId)
    .single();
  fail(error);
  const doc = data as unknown as {
    id: string;
    title: string;
    source_name: string;
    doc_date: string;
    doc_month: string;
    doc_notes: DocNote[];
  };
  const notes = Array.isArray(doc.doc_notes) ? doc.doc_notes : [];
  if (notes.length < MIN_NOTES)
    throw new Error(
      "This document has too few report findings for a page (it may not be a report).",
    );
  const glossary = (await CA.getMagazineSettings()).glossary ?? [];
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = parseReport(
      await saathiComplete(
        apiKey(),
        reportMessages({
          glossary,
          name: doc.title,
          releasedBy: doc.source_name,
          date: doc.doc_date,
          notes,
          problem,
        }),
      ),
      notes,
      `${doc.title} ${doc.source_name} ${doc.doc_date}`,
    );
    if (r.ok) {
      const report: CaReport = fixShortFormsDeep({
        ...r.report,
        source_id: doc.id,
        date: doc.doc_date,
        included: true,
        created_at: now(),
      });
      const list = await getReports(doc.doc_month);
      const at = list.findIndex((x) => x.source_id === doc.id);
      const next = at >= 0 ? list.map((x, i) => (i === at ? report : x)) : [...list, report];
      await saveReports(doc.doc_month, next);
      return report;
    }
    problem = r.reason;
  }
  throw new Error(`The report page didn't pass the fact check: ${problem}`);
}

export async function setReportIncluded(month: string, sourceId: string, included: boolean) {
  const list = await getReports(month);
  await saveReports(
    month,
    list.map((r) => (r.source_id === sourceId ? { ...r, included } : r)),
  );
}

export async function removeReport(month: string, sourceId: string) {
  await saveReports(
    month,
    (await getReports(month)).filter((r) => r.source_id !== sourceId),
  );
}

// Moves a report up or down the page.
export async function moveReport(month: string, sourceId: string, dir: -1 | 1) {
  const list = await getReports(month);
  const i = list.findIndex((r) => r.source_id === sourceId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveReports(month, list);
}

// A document read to the end with enough findings and no page yet gets one.
async function reportStep(): Promise<string | null> {
  const { data, error } = await from("ca_sources")
    .select("id,title,doc_month,doc_notes")
    .not("doc_month", "is", null)
    .eq("status", "done")
    .is("error", null)
    .order("created_at");
  if (missingDocs(error)) return null;
  fail(error);
  const done = (data ?? []) as unknown as {
    id: string;
    title: string;
    doc_month: string;
    doc_notes: DocNote[];
  }[];
  for (const d of done) {
    if (!Array.isArray(d.doc_notes) || d.doc_notes.length < MIN_NOTES) continue;
    if ((await getReports(d.doc_month)).some((r) => r.source_id === d.id)) continue;
    try {
      await writeReport(d.id);
      return `wrote the report page for “${d.title}”`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Kept on the document, so it isn't tried on every run.
      await from("ca_sources")
        .update({ error: `Report page: ${msg}`.slice(0, 300) } as never)
        .eq("id", d.id);
      return `“${d.title}”: ${msg}`;
    }
  }
  return null;
}

// A document's new story waiting to be written.
async function writeStep(): Promise<string | null> {
  const { data, error } = await from("ca_items")
    .select("id,headline")
    .eq("from_document", true)
    .eq("needs_enrich", true)
    .eq("status", "included")
    .is("enrich_error", null)
    .not("issue_date", "is", null)
    .order("created_at")
    .limit(1);
  if (missingDocs(error)) return null;
  fail(error);
  const row = ((data ?? []) as { id: string; headline: string }[])[0];
  if (!row) return null;
  try {
    await CA.enrichItem(row.id);
  } catch (e) {
    await from("ca_items")
      .update({ enrich_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } as never)
      .eq("id", row.id);
  }
  return `wrote “${row.headline.slice(0, 60)}”`;
}

// One unit of document work (the collection schedule, or "Speed up").
export async function docStep(): Promise<string | null> {
  return (await readStep()) ?? (await writeStep()) ?? (await reportStep());
}

// Work still to do for a month's documents, for the page.
export async function docWork(month: string): Promise<{ parts: number; writing: number }> {
  const m = monthOf(month);
  const [docs, items] = await Promise.all([
    from("ca_sources")
      .select("chunks,chunks_done")
      .eq("doc_month", m)
      .in("status", ["new", "extracting"]),
    from("ca_items")
      .select("id", { count: "exact", head: true })
      .eq("from_document", true)
      .eq("needs_enrich", true)
      .eq("status", "included")
      .is("enrich_error", null)
      .gte("issue_date", m)
      .lte("issue_date", monthEnd(m)),
  ]);
  if (missingDocs(docs.error)) return { parts: 0, writing: 0 };
  const parts = ((docs.data ?? []) as { chunks: number; chunks_done: number }[]).reduce(
    (n, d) => n + Math.max(0, d.chunks - d.chunks_done),
    0,
  );
  return { parts, writing: items.count ?? 0 };
}
