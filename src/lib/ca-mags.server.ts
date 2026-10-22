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
  normalizeSections,
  parsePlan,
  parseSort,
  planMessages,
  sortMessages,
  type CustomMag,
  type MagSection,
} from "@/lib/ca-mags";
import { renderMagazine, type CustomLayout, type Lang } from "@/lib/current-affairs-html";
import { fillerPages, normalizeIssueDesign } from "@/lib/ca-covers";
import type { CaFact } from "@/lib/current-affairs";
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
};
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

async function countCopies(magId: string, status?: string): Promise<number> {
  let q = from("ca_items").select("id", { count: "exact", head: true }).eq("magazine_id", magId);
  if (status) q = q.eq("status", status);
  const { count } = await q;
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
  if (copies.length) fail((await from("ca_items").insert(copies as never)).error);
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
      const r = await fillMag(m.id);
      if (r) return `“${m.title_en}”: checked ${r.checked} stories, added ${r.added}`;
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

// ---------- One magazine ----------

export async function getMag(id: string): Promise<{
  mag: CustomMag;
  items: MagItem[];
  checked: number;
  total: number;
}> {
  const mag = await loadMag(id);
  const { data, error } = await from("ca_items")
    .select(ITEM_COLS)
    .eq("magazine_id", id)
    .order("mag_date")
    .order("position");
  fail(error);
  // Each copy works with the day its story came from.
  const items = ((data ?? []) as unknown as MagItem[]).map((i) => ({
    ...i,
    issue_date: i.mag_date,
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
  const included = items.filter((i) => i.status === "included" && i.content);
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
