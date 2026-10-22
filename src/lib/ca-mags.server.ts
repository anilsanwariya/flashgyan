// Server-only custom magazines: a theme over a date range, with sections
// and subsections the AI plans, filled from the daily stories a batch at a
// time (on the once-a-minute schedule, or faster from the admin page) and
// growing until it is marked final. Its stories are copies, so editing them
// never changes the daily archive; a copy has no day of its own, so no daily
// or monthly issue ever lists it.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import { fixShortFormsDeep } from "../../supabase/functions/_shared/ca-hindi.ts";
import {
  OTHER_SECTION,
  SORT_BATCH,
  biName,
  magPeriod,
  COMBINED_FACTS,
  combinedFacts,
  combinedNote,
  groupMessages,
  normalizeSections,
  parseGroups,
  parsePlan,
  parseReorg,
  reorgMessages,
  storySig,
  topicClusters,
  parseSort,
  planMessages,
  sortMessages,
  type CustomMag,
  type MagSection,
} from "@/lib/ca-mags";
import { renderMagazine, type CustomLayout, type Lang } from "@/lib/current-affairs-html";
import { fillerPages, normalizeIssueDesign } from "@/lib/ca-covers";
import { mergeFacts, type Bi, type CaFact } from "@/lib/current-affairs";
import { cosine, parseVector } from "@/lib/ca-duplicates";
import * as CA from "@/lib/current-affairs.server";
import type { CaItem } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
// The same storage bucket as the daily and monthly issues.
const BUCKET = "ca-magazines";
// Longest period a magazine covers.
const MAX_DAYS = 731;

// A database without the custom magazines migration.
const missing = (e: { message: string } | null) =>
  !!e && /ca_mags|ca_mag_seen|magazine_id|mag_date|mag_section/.test(e.message);
const NOT_READY =
  "Custom magazines need a database update: run the latest migration (ca_custom_magazines) in Lovable or the SQL editor.";

const ITEM_COLS =
  "id,issue_date,category,headline,facts,source_ids,importance,rajasthan,content,context_sources,syllabus_topic_id,unit,needs_enrich,enrich_error,related_item_id,status,position,created_at,concept,mag_date,mag_section,mag_sub,mag_pinned,origin_id";

export type MagItem = CaItem & {
  mag_date: string;
  mag_section: string | null;
  mag_sub: string | null;
  mag_pinned: boolean;
  origin_id: string | null;
  // Step 3 (missing before its migration): the combined article a copy is
  // joined into, whether this is one, stories waiting to be added to it,
  // and whether the daily story changed since it was copied.
  mag_parent?: string | null;
  mag_combined?: boolean;
  mag_pending?: number;
  mag_grouped?: boolean;
  changed?: boolean;
};

// The step 3 columns (combined articles); a database without them works as
// before.
const TOPIC_COLS = ",mag_parent,mag_combined,mag_grouped,mag_pending,mag_origin_sig";
const missingTopics = (e: { message: string } | null) =>
  !!e && /mag_parent|mag_combined|mag_grouped|mag_pending|mag_origin_sig|reorg_/.test(e.message);
export type MagSummary = CustomMag & { stories: number; checked: number; total: number };

const now = () => new Date().toISOString();
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

function readMag(row: unknown): CustomMag {
  const m = row as CustomMag;
  return { ...m, sections: normalizeSections(m.sections) };
}

async function loadMag(id: string): Promise<CustomMag> {
  const { data, error } = await from("ca_mags").select("*").eq("id", id).single();
  if (missing(error)) throw new Error(NOT_READY);
  fail(error);
  return readMag(data);
}

// The daily stories in a magazine's period that it could take: written and
// in their day's issue.
async function candidateIds(mag: Pick<CustomMag, "date_from" | "date_to">): Promise<string[]> {
  const out: string[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await from("ca_items")
      .select("id")
      .gte("issue_date", mag.date_from)
      .lte("issue_date", mag.date_to)
      .eq("status", "included")
      .not("content", "is", null)
      .order("issue_date")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    fail(error);
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    out.push(...ids);
    if (ids.length < 1000) break;
  }
  return out;
}

async function seenIds(magId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const { data, error } = await from("ca_mag_seen")
      .select("item_id")
      .eq("mag_id", magId)
      .range(page * 1000, page * 1000 + 999);
    fail(error);
    const ids = ((data ?? []) as { item_id: string }[]).map((r) => r.item_id);
    for (const id of ids) out.add(id);
    if (ids.length < 1000) break;
  }
  return out;
}

// The magazine's stories as printed (a combined article counts once, not
// the stories joined into it).
async function countCopies(magId: string, status?: string): Promise<number> {
  const q = (top: boolean) => {
    let x = from("ca_items").select("id", { count: "exact", head: true }).eq("magazine_id", magId);
    if (status) x = x.eq("status", status);
    if (top) x = x.is("mag_parent", null);
    return x;
  };
  let { count, error } = await q(true);
  if (missingTopics(error)) ({ count, error } = await q(false));
  return count ?? 0;
}

// ---------- The list and creating one ----------

export async function listMags(): Promise<{ ready: boolean; mags: MagSummary[] }> {
  const { data, error } = await from("ca_mags")
    .select("*")
    .order("updated_at", { ascending: false });
  if (missing(error)) return { ready: false, mags: [] };
  fail(error);
  const mags = ((data ?? []) as unknown[]).map(readMag);
  const out: MagSummary[] = [];
  for (const m of mags) {
    const [stories, seen, total] = await Promise.all([
      countCopies(m.id, "included"),
      from("ca_mag_seen").select("item_id", { count: "exact", head: true }).eq("mag_id", m.id),
      from("ca_items")
        .select("id", { count: "exact", head: true })
        .gte("issue_date", m.date_from)
        .lte("issue_date", m.date_to)
        .eq("status", "included")
        .not("content", "is", null),
    ]);
    out.push({ ...m, stories, checked: seen.count ?? 0, total: total.count ?? 0 });
  }
  return { ready: true, mags: out };
}

// A new magazine: its sections planned by the AI from the theme and a
// sample of the period's headlines. It then fills in the background.
export async function createMag(input: {
  title_en: string;
  title_hi?: string;
  theme: string;
  date_from: string;
  date_to: string;
}): Promise<CustomMag> {
  if (input.date_from > input.date_to) throw new Error("The start date is after the end date.");
  if (days(input.date_from, input.date_to) > MAX_DAYS)
    throw new Error("A magazine covers at most two years.");
  const probe = await from("ca_mags").select("id").limit(1);
  if (missing(probe.error)) throw new Error(NOT_READY);
  const { data: rows } = await from("ca_items")
    .select("headline,content")
    .gte("issue_date", input.date_from)
    .lte("issue_date", input.date_to)
    .eq("status", "included")
    .order("issue_date")
    .limit(3000);
  const all = ((rows ?? []) as Pick<CaItem, "headline" | "content">[]).map(
    (r) => r.content?.headline.en || r.headline,
  );
  // An even spread across the period.
  const step = Math.max(1, Math.floor(all.length / 200));
  const sample = all.filter((_, i) => i % step === 0).slice(0, 200);
  const glossary = (await CA.getMagazineSettings()).glossary ?? [];
  let sections: MagSection[] | null = null;
  for (let attempt = 0; attempt < 2 && !sections; attempt++) {
    sections = parsePlan(
      await saathiComplete(
        apiKey(),
        planMessages({ title: input.title_en, theme: input.theme, headlines: sample, glossary }),
      ),
    );
  }
  if (!sections) throw new Error("SAATHI couldn't plan the sections. Try again.");
  const { data, error } = await from("ca_mags")
    .insert({
      title_en: input.title_en.trim(),
      title_hi: (input.title_hi ?? "").trim(),
      theme: input.theme.trim(),
      date_from: input.date_from,
      date_to: input.date_to,
      sections,
    } as never)
    .select("*")
    .single();
  fail(error);
  return readMag(data);
}

// ---------- Filling it ----------

// Sorts the next batch of daily stories into one magazine: those that fit
// its theme are copied into their section and subsection (new subsections
// as the AI finds them). Null when it has nothing left to look at.
export async function fillMag(magId: string): Promise<{ checked: number; added: number } | null> {
  const mag = await loadMag(magId);
  if (mag.status !== "growing") return null;
  const seen = await seenIds(mag.id);
  const batch = (await candidateIds(mag)).filter((id) => !seen.has(id)).slice(0, SORT_BATCH);
  if (!batch.length) return null;
  const { data, error } = await from("ca_items").select("*").in("id", batch);
  fail(error);
  const byId = new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, r]));
  const rows = batch.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
  const story = (r: Record<string, unknown>) => {
    const c = r.content as CaItem["content"];
    return {
      headline: c?.headline.en || (r.headline as string),
      facts: ((r.facts as CaFact[]) ?? []).map((f) => f.text),
      date: r.issue_date as string,
    };
  };
  const glossary = (await CA.getMagazineSettings()).glossary ?? [];
  const sorted = parseSort(
    await saathiComplete(
      apiKey(),
      sortMessages({
        title: mag.title_en,
        theme: mag.theme,
        sections: mag.sections,
        stories: rows.map(story),
        glossary,
      }),
    ),
    rows.length,
    mag.sections,
  );
  if (!sorted) throw new Error("SAATHI's sorting couldn't be read; it will try again.");
  // Copies of the stories that fit, after the magazine's other stories.
  const { count: had } = await from("ca_items")
    .select("id", { count: "exact", head: true })
    .eq("magazine_id", mag.id);
  const copies = sorted.placed.map((p, i) => {
    const {
      id: _id,
      created_at: _c,
      updated_at: _u,
      event_id: _e,
      related_item_id: _r,
      collected_later: _l,
      ...rest
    } = rows[p.index];
    return {
      ...rest,
      content: fixShortFormsDeep(rest.content),
      issue_date: null,
      magazine_id: mag.id,
      mag_date: rows[p.index].issue_date,
      origin_id: rows[p.index].id,
      mag_section: p.section,
      mag_sub: p.sub,
      mag_pinned: false,
      status: "included",
      needs_enrich: false,
      position: (had ?? 0) + i,
    };
  });
  if (copies.length) {
    const signed = copies.map((c) => ({
      ...c,
      mag_origin_sig: storySig(((c as { facts?: CaFact[] }).facts ?? []) as CaFact[], c.content),
    }));
    let { error: iErr } = await from("ca_items").insert(signed as never);
    if (missingTopics(iErr)) ({ error: iErr } = await from("ca_items").insert(copies as never));
    fail(iErr);
  }
  const fits = new Set(sorted.placed.map((p) => rows[p.index].id as string));
  fail(
    (
      await from("ca_mag_seen").upsert(
        rows.map((r) => ({
          mag_id: mag.id,
          item_id: r.id,
          fits: fits.has(r.id as string),
        })) as never,
        { onConflict: "mag_id,item_id", ignoreDuplicates: true },
      )
    ).error,
  );
  fail(
    (
      await from("ca_mags")
        .update({ sections: sorted.sections, error: null, updated_at: now() } as never)
        .eq("id", mag.id)
    ).error,
  );
  return { checked: rows.length, added: copies.length };
}

// One batch for the magazine that has the most waiting (called on every
// tick of the schedule).
export async function magStep(): Promise<string | null> {
  const { data, error } = await from("ca_mags")
    .select("id,title_en")
    .eq("status", "growing")
    .order("updated_at");
  if (missing(error)) return null;
  fail(error);
  for (const m of (data ?? []) as { id: string; title_en: string }[]) {
    try {
      const r = await stepMag(m.id);
      if (r) return `“${m.title_en}”: ${r}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await from("ca_mags")
        .update({ error: msg.slice(0, 300), updated_at: now() } as never)
        .eq("id", m.id);
      return `“${m.title_en}”: ${msg}`;
    }
  }
  return null;
}

// One unit of work on a magazine: sort the next stories in, then join
// stories on one topic, write combined articles, and re-sort subsections.
// Null when there's nothing to do.
export async function stepMag(id: string): Promise<string | null> {
  const r = await fillMag(id);
  if (r) return `checked ${r.checked} stories, added ${r.added}`;
  return (await groupStep(id)) ?? (await writeStep(id)) ?? (await reorgStep(id));
}

// ---------- One magazine ----------

export async function getMag(id: string): Promise<{
  mag: CustomMag;
  items: MagItem[];
  checked: number;
  total: number;
}> {
  const mag = await loadMag(id);
  const query = (cols: string) =>
    from("ca_items").select(cols).eq("magazine_id", id).order("mag_date").order("position");
  let { data, error } = await query(ITEM_COLS + TOPIC_COLS);
  if (missingTopics(error)) ({ data, error } = await query(ITEM_COLS));
  fail(error);
  // Each copy works with the day its story came from.
  const rows = (data ?? []) as unknown as (MagItem & { mag_origin_sig?: string | null })[];
  // Copies whose daily story changed since they were copied.
  const signed = rows.filter((r) => r.origin_id && r.mag_origin_sig);
  const origins = new Map<string, string>();
  for (let i = 0; i < signed.length; i += 200) {
    const { data: o } = await from("ca_items")
      .select("id,facts,content")
      .in(
        "id",
        signed.slice(i, i + 200).map((r) => r.origin_id!),
      );
    for (const r of (o ?? []) as Pick<CaItem, "id" | "facts" | "content">[])
      origins.set(r.id, storySig(r.facts ?? [], r.content));
  }
  const items: MagItem[] = rows.map(({ mag_origin_sig, ...i }) => ({
    ...i,
    issue_date: i.mag_date,
    changed:
      !!mag_origin_sig &&
      !!i.origin_id &&
      origins.has(i.origin_id) &&
      origins.get(i.origin_id) !== mag_origin_sig,
  }));
  const [seen, total] = await Promise.all([
    from("ca_mag_seen").select("item_id", { count: "exact", head: true }).eq("mag_id", id),
    from("ca_items")
      .select("id", { count: "exact", head: true })
      .gte("issue_date", mag.date_from)
      .lte("issue_date", mag.date_to)
      .eq("status", "included")
      .not("content", "is", null),
  ]);
  return { mag, items, checked: seen.count ?? 0, total: total.count ?? 0 };
}

// The editor's changes to a magazine's details. The period can only grow
// (the stories already in it stay).
export async function updateMag(
  id: string,
  patch: Partial<Pick<CustomMag, "title_en" | "title_hi" | "theme" | "date_from" | "date_to">>,
): Promise<CustomMag> {
  const mag = await loadMag(id);
  const fromDate = patch.date_from ?? mag.date_from;
  const toDate = patch.date_to ?? mag.date_to;
  if (fromDate > mag.date_from || toDate < mag.date_to)
    throw new Error("The period can only be made longer.");
  if (days(fromDate, toDate) > MAX_DAYS) throw new Error("A magazine covers at most two years.");
  const { data, error } = await from("ca_mags")
    .update({ ...patch, updated_at: now() } as never)
    .eq("id", id)
    .select("*")
    .single();
  fail(error);
  return readMag(data);
}

// Section and subsection names changed by hand (ids stay). Stories in a
// subsection that is removed stay in its section.
export async function saveSections(id: string, sections: MagSection[]): Promise<CustomMag> {
  const mag = await loadMag(id);
  const next = normalizeSections(sections);
  const known = new Set(mag.sections.map((s) => s.id));
  if (next.some((s) => !known.has(s.id))) throw new Error("Unknown section");
  const subs = new Set(next.flatMap((s) => s.subs.map((x) => x.id)));
  const { data } = await from("ca_items")
    .select("id,mag_sub")
    .eq("magazine_id", id)
    .not("mag_sub", "is", null);
  const orphans = ((data ?? []) as { id: string; mag_sub: string }[])
    .filter((r) => !subs.has(r.mag_sub))
    .map((r) => r.id);
  if (orphans.length)
    fail(
      (
        await from("ca_items")
          .update({ mag_sub: null } as never)
          .in("id", orphans)
      ).error,
    );
  // A section can't be removed here (its stories need a place).
  const kept = mag.sections.map((s) => next.find((n) => n.id === s.id) ?? s);
  const order = next.map((s) => s.id);
  kept.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const { data: saved, error } = await from("ca_mags")
    .update({ sections: kept, updated_at: now() } as never)
    .eq("id", id)
    .select("*")
    .single();
  fail(error);
  return readMag(saved);
}

// Moves stories to another section or subsection; the AI leaves them there.
export async function placeStories(
  magId: string,
  ids: string[],
  section: string,
  sub: string | null,
) {
  const mag = await loadMag(magId);
  let sec = mag.sections.find((s) => s.id === section);
  if (!sec && section === OTHER_SECTION.id) {
    sec = { ...OTHER_SECTION, subs: [] };
    await from("ca_mags")
      .update({ sections: [...mag.sections, sec], updated_at: now() } as never)
      .eq("id", magId);
  }
  if (!sec) throw new Error("Unknown section");
  if (sub && !sec.subs.some((x) => x.id === sub)) throw new Error("Unknown subsection");
  fail(
    (
      await from("ca_items")
        .update({ mag_section: section, mag_sub: sub, mag_pinned: true } as never)
        .eq("magazine_id", magId)
        .in("id", ids)
    ).error,
  );
}

export async function setMagStatus(id: string, status: CustomMag["status"]) {
  fail(
    (
      await from("ca_mags")
        .update({
          status,
          finalized_at: status === "final" ? now() : null,
          updated_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteMag(id: string) {
  fail((await from("ca_mags").delete().eq("id", id)).error);
}

// ---------- Printing ----------

function layout(mag: CustomMag): CustomLayout {
  const sections = mag.sections.some((s) => s.id === OTHER_SECTION.id)
    ? mag.sections
    : [...mag.sections, OTHER_SECTION];
  return {
    title: { en: mag.title_en, hi: mag.title_hi || mag.title_en },
    dateLine: {
      en: magPeriod(mag.date_from, mag.date_to, "en"),
      hi: magPeriod(mag.date_from, mag.date_to, "hi"),
    },
    sections: sections.map((s) => ({
      id: s.id,
      title: biName(s),
      subs: s.subs.map((x) => ({ id: x.id, title: biName(x) })),
    })),
  };
}

export async function magHtml(id: string, lang: Lang, fillers = 0) {
  const { mag, items } = await getMag(id);
  const settings = await CA.getMagazineSettings();
  // Stories joined into a combined article print as that article.
  const included = items.filter((i) => i.status === "included" && i.content && !i.mag_parent);
  const printed = await CA.toMagazineItems(included);
  const place = new Map(included.map((i) => [i.id, i]));
  const design = normalizeIssueDesign(mag.design ?? null);
  return {
    html: renderMagazine({
      kind: "monthly",
      period: mag.date_from,
      lang,
      settings,
      items: printed.map((p) => ({
        ...p,
        category: place.get(p.id)?.mag_section ?? OTHER_SECTION.id,
        sub: place.get(p.id)?.mag_sub ?? null,
      })),
      design,
      fillers,
      custom: layout(mag),
    }),
    settings,
    count: printed.length,
  };
}

// The magazine's English and Hindi PDFs, made now (it stays growing until
// marked final).
export async function buildMagPdf(id: string): Promise<CustomMag> {
  const urls: Record<Lang, string> = { en: "", hi: "" };
  for (const lang of ["en", "hi"] as const) {
    const first = await magHtml(id, lang);
    if (!first.count) throw new Error("There are no stories in this magazine yet.");
    let made = await CA.renderPdf(first.html, first.settings, lang);
    const need = made.pages
      ? fillerPages(made.pages, first.settings.print_binding ?? "booklet")
      : 0;
    if (need) {
      const again = await magHtml(id, lang, need);
      made = await CA.renderPdf(again.html, again.settings, lang);
    }
    const path = `custom/FlashGyan-${id.slice(0, 8)}-${lang === "hi" ? "Hindi" : "English"}.pdf`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, made.pdf, { contentType: "application/pdf", upsert: true });
    fail(error);
    urls[lang] =
      `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  }
  const { data, error } = await from("ca_mags")
    .update({ pdf_url_en: urls.en, pdf_url_hi: urls.hi, pdf_at: now(), updated_at: now() } as never)
    .eq("id", id)
    .select("*")
    .single();
  fail(error);
  return readMag(data);
}

// ---------- Combined articles (step 3) ----------

type PoolRow = {
  id: string;
  headline: string;
  ch: { en?: string; hi?: string } | null;
  mag_date: string;
  mag_section: string | null;
  mag_sub: string | null;
  mag_combined: boolean;
  mag_grouped: boolean;
  mag_pinned: boolean;
  embedding: unknown;
};

const headlineOf = (r: Pick<PoolRow, "headline" | "ch">) => r.ch?.en || r.headline;

// The magazine's stories that print on their own (not joined into another).
async function topLevel(magId: string): Promise<PoolRow[] | null> {
  const { data, error } = await from("ca_items")
    .select(
      "id,headline,ch:content->headline,mag_date,mag_section,mag_sub,mag_combined,mag_grouped,mag_pinned,embedding",
    )
    .eq("magazine_id", magId)
    .eq("status", "included")
    .is("mag_parent", null)
    .order("mag_date");
  if (missingTopics(error)) return null;
  fail(error);
  return (data ?? []) as unknown as PoolRow[];
}

// Whether the last change to a story was a hand edit (so writing it again
// would replace the editor's text).
async function editedByHand(id: string): Promise<boolean> {
  const { data } = await from("ca_item_versions")
    .select("reason")
    .eq("item_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? []) as { reason: string }[])[0]?.reason === "edit";
}

const most = (xs: (string | null)[]) => {
  const n = new Map<string | null, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// A combined article from these stories (their copies), waiting to be
// written; the stories are joined into it.
async function makeCombined(magId: string, ids: string[], title: Bi | null): Promise<string> {
  const { data, error } = await from("ca_items").select("*").in("id", ids);
  fail(error);
  const rows = ((data ?? []) as Record<string, unknown>[]).sort((a, b) =>
    String(a.mag_date).localeCompare(String(b.mag_date)),
  );
  if (rows.length < 2) throw new Error("Pick at least two stories to join.");
  const latest = rows[rows.length - 1];
  const facts = combinedFacts(
    rows.map((r) => ({ date: String(r.mag_date), facts: (r.facts as CaFact[]) ?? [] })),
    mergeFacts,
  );
  const { data: made, error: mErr } = await from("ca_items")
    .insert({
      magazine_id: magId,
      issue_date: null,
      mag_date: latest.mag_date,
      category: latest.category,
      headline: title?.en ?? latest.headline,
      facts,
      source_ids: [...new Set(rows.flatMap((r) => (r.source_ids as string[]) ?? []))],
      importance: Math.max(...rows.map((r) => Number(r.importance) || 1)),
      rajasthan: rows.some((r) => r.rajasthan),
      concept: latest.concept ?? null,
      embedding: latest.embedding ?? null,
      content: null,
      context_sources: [],
      status: "included",
      needs_enrich: true,
      position: Math.min(...rows.map((r) => Number(r.position) || 0)),
      mag_section: most(rows.map((r) => (r.mag_section as string | null) ?? null)),
      mag_sub: most(rows.map((r) => (r.mag_sub as string | null) ?? null)),
      mag_combined: true,
      mag_grouped: true,
    } as never)
    .select("id")
    .single();
  fail(mErr);
  const id = (made as unknown as { id: string }).id;
  fail(
    (
      await from("ca_items")
        .update({ mag_parent: id, mag_grouped: true } as never)
        .in(
          "id",
          rows.map((r) => r.id as string),
        )
    ).error,
  );
  return id;
}

// Stories join an existing combined article: it is written again, unless
// the editor changed its text by hand (then they wait to be added).
async function joinInto(combinedId: string, ids: string[]) {
  if (!ids.length) return;
  fail(
    (
      await from("ca_items")
        .update({ mag_parent: combinedId, mag_grouped: true } as never)
        .in("id", ids)
    ).error,
  );
  const { data } = await from("ca_items").select("mag_pending").eq("id", combinedId).single();
  const pending = Number((data as { mag_pending?: number } | null)?.mag_pending ?? 0);
  fail(
    (
      await from("ca_items")
        .update(
          ((await editedByHand(combinedId))
            ? { mag_pending: pending + ids.length }
            : { needs_enrich: true }) as never,
        )
        .eq("id", combinedId)
    ).error,
  );
}

// Looks at the next stories not yet checked for a topic: those close to
// others in their section go to the AI, which says which follow one topic;
// those are joined into a combined article (new, or one already there).
export async function groupStep(magId: string): Promise<string | null> {
  const mag = await loadMag(magId);
  const pool = await topLevel(magId);
  if (!pool) return null;
  const first = pool.find((r) => !r.mag_grouped && !r.mag_combined);
  if (!first) return null;
  const sec = pool.filter((r) => r.mag_section === first.mag_section);
  const fresh = sec
    .map((r, i) => (!r.mag_grouped && !r.mag_combined ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, 40);
  const done = async () =>
    fail(
      (
        await from("ca_items")
          .update({ mag_grouped: true } as never)
          .in(
            "id",
            fresh.map((i) => sec[i].id),
          )
      ).error,
    );
  // A combined article is also matched through the stories joined into it
  // (its own text covers the whole topic; theirs match the new reports).
  const combinedIds = sec.filter((r) => r.mag_combined).map((r) => r.id);
  const { data: joinedRows } = combinedIds.length
    ? await from("ca_items")
        .select("mag_parent,embedding")
        .in("mag_parent", combinedIds)
        .eq("status", "included")
    : { data: [] };
  const inTopics = (joinedRows ?? []) as { mag_parent: string; embedding: unknown }[];
  const at = new Map(sec.map((r, i) => [r.id, i]));
  const clusters = topicClusters(
    [...sec, ...inTopics].map((r) => parseVector(r.embedding)),
    fresh,
    cosine,
  )
    // A joined story stands for its combined article.
    .map((c) => [
      ...new Set(c.map((i) => (i < sec.length ? i : at.get(inTopics[i - sec.length].mag_parent)!))),
    ])
    .filter((c) => c.length >= 2)
    .map((c) => c.sort((a, b) => a - b));
  if (!clusters.length) {
    await done();
    return `checked ${fresh.length} stories for topics: none to join`;
  }
  const flat = clusters.flat();
  const clusterOf = clusters.flatMap((c, ci) => c.map(() => ci));
  const groups = parseGroups(
    await saathiComplete(
      apiKey(),
      groupMessages({
        title: mag.title_en,
        theme: mag.theme,
        clusters: clusters.map((c) =>
          c.map((i) => ({
            headline: headlineOf(sec[i]),
            date: sec[i].mag_date,
            combined: sec[i].mag_combined,
          })),
        ),
      }),
    ),
    clusterOf,
  );
  let joined = 0;
  for (const g of groups) {
    const rows = g.stories.map((k) => sec[flat[k]]);
    const combined = rows.filter((r) => r.mag_combined);
    const plain = rows.filter((r) => !r.mag_combined).map((r) => r.id);
    if (combined.length) {
      const [main, ...more] = combined;
      // Two combined articles on one topic become one.
      for (const extra of more) {
        await from("ca_items")
          .update({ mag_parent: main.id } as never)
          .eq("mag_parent", extra.id);
        await from("ca_items").delete().eq("id", extra.id);
      }
      await joinInto(main.id, plain);
      if (more.length && !(await editedByHand(main.id)))
        await from("ca_items")
          .update({ needs_enrich: true } as never)
          .eq("id", main.id);
    } else await makeCombined(magId, plain, g.title);
    joined += plain.length;
  }
  await done();
  return joined
    ? `joined ${joined} stories on ${groups.length} ${groups.length === 1 ? "topic" : "topics"}`
    : `checked ${fresh.length} stories for topics: none to join`;
}

// Writes a combined article from the stories joined into it: their facts
// (the latest figures winning), as one development in order. A combined
// article left with one story is taken apart.
export async function writeCombined(id: string) {
  const { data, error } = await from("ca_items")
    .select("id,mag_date,facts,source_ids")
    .eq("mag_parent", id)
    .eq("status", "included")
    .order("mag_date");
  fail(error);
  const members = (data ?? []) as {
    id: string;
    mag_date: string;
    facts: CaFact[];
    source_ids: string[];
  }[];
  if (members.length < 2) {
    await splitTopic(id);
    return null;
  }
  const facts = combinedFacts(
    members.map((m) => ({ date: m.mag_date, facts: m.facts ?? [] })),
    mergeFacts,
  ).slice(0, COMBINED_FACTS);
  fail(
    (
      await from("ca_items")
        .update({
          facts,
          source_ids: [...new Set(members.flatMap((m) => m.source_ids ?? []))],
          mag_date: members[members.length - 1].mag_date,
          mag_pending: 0,
          needs_enrich: true,
        } as never)
        .eq("id", id)
    ).error,
  );
  return CA.enrichItem(id, {
    note: combinedNote(members.length, members[0].mag_date, members[members.length - 1].mag_date),
  });
}

// The next combined article waiting to be written.
export async function writeStep(magId: string): Promise<string | null> {
  const { data, error } = await from("ca_items")
    .select("id,headline")
    .eq("magazine_id", magId)
    .eq("mag_combined", true)
    .eq("needs_enrich", true)
    .is("enrich_error", null)
    .order("created_at")
    .limit(1);
  if (missingTopics(error)) return null;
  fail(error);
  const row = ((data ?? []) as { id: string; headline: string }[])[0];
  if (!row) return null;
  try {
    await writeCombined(row.id);
  } catch (e) {
    await from("ca_items")
      .update({ enrich_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } as never)
      .eq("id", row.id);
  }
  return `wrote the combined article “${row.headline.slice(0, 60)}”`;
}

// Re-sorts subsections as the magazine grows: after 8 or more new stories,
// each section in turn (one a step); stories the editor placed stay.
export async function reorgStep(magId: string): Promise<string | null> {
  const { data, error } = await from("ca_mags")
    .select("reorg_at,reorg_queue")
    .eq("id", magId)
    .single();
  if (missingTopics(error)) return null;
  fail(error);
  const state = data as unknown as { reorg_at: string | null; reorg_queue: string[] | null };
  let queue = state.reorg_queue ?? [];
  const mag = await loadMag(magId);
  if (!queue.length) {
    let q = from("ca_items")
      .select("id", { count: "exact", head: true })
      .eq("magazine_id", magId)
      .is("mag_parent", null);
    if (state.reorg_at) q = q.gt("created_at", state.reorg_at);
    const { count } = await q;
    if ((count ?? 0) < 8) return null;
    queue = mag.sections.map((s) => s.id);
    if (!queue.length) return null;
  }
  const [secId, ...rest] = queue;
  const section = mag.sections.find((s) => s.id === secId);
  const pool = (await topLevel(magId)) ?? [];
  const rows = pool.filter((r) => r.mag_section === secId);
  let changed = 0;
  if (section && rows.length >= 3) {
    const glossary = (await CA.getMagazineSettings()).glossary ?? [];
    const r = parseReorg(
      await saathiComplete(
        apiKey(),
        reorgMessages({
          title: mag.title_en,
          section,
          subs: section.subs,
          stories: rows
            .map((x) => ({
              headline: headlineOf(x),
              sub: x.mag_sub ? section.subs.findIndex((s) => s.id === x.mag_sub) : null,
              pinned: x.mag_pinned,
            }))
            .map((x) => ({ ...x, sub: x.sub === -1 ? null : x.sub })),
          glossary,
        }),
      ),
      section,
      rows.map((x) => ({ sub: x.mag_sub, pinned: x.mag_pinned })),
    );
    if (r) {
      const sections = mag.sections.map((s) => (s.id === secId ? { ...s, subs: r.subs } : s));
      fail(
        (
          await from("ca_mags")
            .update({ sections, updated_at: now() } as never)
            .eq("id", magId)
        ).error,
      );
      const moves = new Map<string | null, string[]>();
      rows.forEach((x, i) => {
        if (x.mag_pinned || r.place[i] === x.mag_sub) return;
        moves.set(r.place[i], [...(moves.get(r.place[i]) ?? []), x.id]);
      });
      for (const [sub, ids] of moves) {
        changed += ids.length;
        fail(
          (
            await from("ca_items")
              .update({ mag_sub: sub } as never)
              .in("id", ids)
          ).error,
        );
      }
    }
  }
  fail(
    (
      await from("ca_mags")
        .update({
          reorg_queue: rest,
          ...(rest.length ? {} : { reorg_at: now() }),
        } as never)
        .eq("id", magId)
    ).error,
  );
  return `re-sorted ${section?.en ?? secId}${changed ? ` (${changed} stories moved)` : ""}`;
}

// ---------- The editor's changes to topics ----------

// Joins the stories picked into one combined article (into the combined
// article among them, when there is one). Returns the combined article.
export async function joinStories(magId: string, ids: string[], title?: Bi | null) {
  const { data, error } = await from("ca_items")
    .select("id,mag_combined,mag_parent,magazine_id")
    .in("id", ids);
  fail(error);
  const rows = (data ?? []) as {
    id: string;
    mag_combined: boolean;
    mag_parent: string | null;
    magazine_id: string;
  }[];
  if (rows.some((r) => r.magazine_id !== magId)) throw new Error("Unknown story");
  if (rows.length < 2) throw new Error("Pick at least two stories to join.");
  const combined = rows.filter((r) => r.mag_combined);
  if (combined.length) {
    const [main, ...more] = combined;
    for (const extra of more) {
      await from("ca_items")
        .update({ mag_parent: main.id } as never)
        .eq("mag_parent", extra.id);
      await from("ca_items").delete().eq("id", extra.id);
    }
    const plain = rows.filter((r) => !r.mag_combined).map((r) => r.id);
    fail(
      (
        await from("ca_items")
          .update({ mag_parent: main.id, mag_grouped: true, mag_pending: 0 } as never)
          .in("id", plain)
      ).error,
    );
    fail(
      (
        await from("ca_items")
          .update({ needs_enrich: true, mag_pending: 0 } as never)
          .eq("id", main.id)
      ).error,
    );
    return main.id;
  }
  return makeCombined(magId, ids, title ?? null);
}

// Takes a combined article apart: its stories print on their own again.
export async function splitTopic(id: string) {
  fail(
    (
      await from("ca_items")
        .update({ mag_parent: null, mag_grouped: true } as never)
        .eq("mag_parent", id)
    ).error,
  );
  fail((await from("ca_items").delete().eq("id", id).eq("mag_combined", true)).error);
}

// Takes one story out of its combined article (written again without it,
// unless edited by hand); a combined article left with one story goes.
export async function takeOut(id: string) {
  const { data } = await from("ca_items").select("mag_parent").eq("id", id).single();
  const parent = (data as { mag_parent: string | null } | null)?.mag_parent;
  if (!parent) return;
  fail(
    (
      await from("ca_items")
        .update({ mag_parent: null, mag_grouped: true, mag_pinned: true } as never)
        .eq("id", id)
    ).error,
  );
  const { count } = await from("ca_items")
    .select("id", { count: "exact", head: true })
    .eq("mag_parent", parent);
  if ((count ?? 0) < 2) await splitTopic(parent);
  else if (!(await editedByHand(parent)))
    await from("ca_items")
      .update({ needs_enrich: true } as never)
      .eq("id", parent);
}

// A copy takes the daily story's text again (its own text is kept in the
// story's history).
export async function updateFromDaily(id: string) {
  const { data } = await from("ca_items").select("origin_id").eq("id", id).single();
  const origin = (data as { origin_id: string | null } | null)?.origin_id;
  if (!origin) throw new Error("This story has no daily story to update from.");
  const { data: o, error } = await from("ca_items")
    .select("headline,facts,content,source_ids,context_sources,importance,rajasthan")
    .eq("id", origin)
    .single();
  fail(error);
  const src = o as unknown as Pick<
    CaItem,
    "headline" | "facts" | "content" | "source_ids" | "context_sources" | "importance" | "rajasthan"
  >;
  return CA.asEdit(id, async () => {
    fail(
      (
        await from("ca_items")
          .update({
            ...src,
            mag_origin_sig: storySig(src.facts ?? [], src.content),
            updated_at: now(),
          } as never)
          .eq("id", id)
      ).error,
    );
  });
}
