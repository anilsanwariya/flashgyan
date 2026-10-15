// Server-only current affairs magazine: sources → news items → bilingual
// issues → PDF (Cloudflare browser rendering) → scheduled Telegram post.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { startsIncluded } from "@/lib/ca-blueprint";
import {
  featureMessages,
  featureTopicMessages,
  parseFeature,
  parseFeatureTopics,
  type CaFeature,
  type FeatureTopic,
} from "@/lib/ca-feature";
import {
  relevantMatches,
  saathiComplete,
  saathiEmbed,
  saathiSearchQuery,
  type SaathiRpc,
  saathiErrorDetail,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  DEFAULT_MAGAZINE_SETTINGS,
  applyChanges,
  captionFor,
  categoryLabel,
  changeCheckMessages,
  dailyPostTime,
  dykMessages,
  parseDyk,
  type DykFact,
  type WebPage,
  enrichMessages,
  extractMessages,
  formatDate,
  isCategory,
  normalizeCategory,
  mergeFacts,
  monthRange,
  parseChanges,
  parseContent,
  parseExtracted,
  removePoint,
  shiftChanges,
  splitSource,
  storyText,
  type Bi,
  type CaChange,
  type CaContent,
  type CaQuick,
  type CaFact,
  type Category,
  type MagazineSettings,
  type UploadSection,
} from "@/lib/current-affairs";
import { VISUAL_LABELS, parseVisual, visualMessages, type Visual } from "@/lib/ca-visuals";
import {
  footerTemplate,
  renderMagazine,
  type MagazineCorrection,
  type MagazineItem,
} from "@/lib/current-affairs-html";
import { syllabusTopics } from "../../supabase/functions/_shared/ras-syllabus.ts";

// The generated types don't know these tables yet.
const from = (table: string) => supabaseAdmin.from(table as never);
const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

// Same story on the same day (merge) and on an earlier day (follow-up).
export const SAME_DAY_SIMILARITY = 0.88;
export const FOLLOW_UP_SIMILARITY = 0.85;
export const CA_SUBJECT = "Current Affairs";
const BUCKET = "ca-magazines";

// ---------- Settings ----------

const SETTINGS_KEY = "ca_magazine";

export async function getMagazineSettings(): Promise<MagazineSettings> {
  const { data } = await from("bot_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const value = (data as { value: Partial<MagazineSettings> } | null)?.value ?? {};
  return { ...DEFAULT_MAGAZINE_SETTINGS, ...value };
}

export async function saveMagazineSettings(patch: Partial<MagazineSettings>) {
  const next = { ...(await getMagazineSettings()), ...patch };
  const { error } = await from("bot_settings").upsert({
    key: SETTINGS_KEY,
    value: next,
    updated_at: new Date().toISOString(),
  } as never);
  fail(error);
  return next;
}

export async function uploadLogo(kind: "main" | "partner", bytes: Uint8Array, contentType: string) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `brand/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  fail(error);
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return saveMagazineSettings(kind === "main" ? { logo_main_url: url } : { logo_partner_url: url });
}

// ---------- Types ----------

export type CaSource = {
  id: string;
  issue_date: string;
  section: UploadSection;
  source_name: string;
  title: string;
  chunks: number;
  chunks_done: number;
  status: "new" | "extracting" | "done" | "error";
  error: string | null;
  created_at: string;
};

export type CaItem = {
  id: string;
  issue_date: string;
  category: Category;
  headline: string;
  facts: CaFact[];
  source_ids: string[];
  importance: number;
  rajasthan: boolean;
  content: CaContent | null;
  context_sources: { title: string }[];
  syllabus_topic_id: string | null;
  unit: string | null;
  needs_enrich: boolean;
  enrich_error: string | null;
  related_item_id: string | null;
  status: "included" | "dropped";
  position: number;
  created_at: string;
};

export type CaIssue = {
  id: string;
  kind: "daily" | "monthly";
  period: string;
  status: "draft" | "scheduled" | "posting" | "posted" | "failed" | "cancelled";
  pdf_path: string | null;
  pdf_url: string | null;
  item_count: number;
  caption: string | null;
  scheduled_for: string | null;
  approved_at: string | null;
  posted_at: string | null;
  error: string | null;
};

export type CaCorrection = {
  id: string;
  item_id: string;
  from_item_id: string | null;
  changes: CaChange[];
  summary_en: string;
  summary_hi: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const SOURCE_COLS =
  "id,issue_date,section,source_name,title,chunks,chunks_done,status,error,created_at";
const ITEM_COLS =
  "id,issue_date,category,headline,facts,source_ids,importance,rajasthan,content,context_sources,syllabus_topic_id,unit,needs_enrich,enrich_error,related_item_id,status,position,created_at";

// ---------- Sources ----------

export async function addSource(input: {
  issue_date: string;
  section: UploadSection;
  source_name: string;
  title: string;
  content: string;
  // The web page it came from (automatic collection).
  url?: string | null;
}): Promise<CaSource> {
  const chunks = splitSource(input.content).length;
  const { data, error } = await from("ca_sources")
    .insert({ ...input, chunks } as never)
    .select(SOURCE_COLS)
    .single();
  fail(error);
  return data as unknown as CaSource;
}

async function embedOne(text: string) {
  return saathiEmbed(apiKey(), text);
}

type Similar = { id: string; issue_date: string; headline: string; similarity: number };

async function similarItems(
  embedding: number[],
  fromDate: string,
  toDate: string,
  exclude?: string,
) {
  const { data, error } = await rpc("ca_similar_items", {
    p_embedding: embedding,
    p_from: fromDate,
    p_to: toDate,
    p_exclude: exclude ?? null,
    p_count: 3,
  });
  fail(error);
  return (data ?? []) as Similar[];
}

const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Reads one part of a source and saves its news items. A story already found
// in another source the same day gets this source's facts added instead of a
// duplicate item.
export async function extractSourceChunk(sourceId: string, index: number) {
  const { data, error } = await from("ca_sources").select("*").eq("id", sourceId).single();
  fail(error);
  const src = data as unknown as CaSource & { content: string };
  const parts = splitSource(src.content);
  const text = parts[index];
  if (text === undefined) throw new Error("No such part of this source");
  await from("ca_sources")
    .update({ status: "extracting", error: null, updated_at: new Date().toISOString() } as never)
    .eq("id", sourceId);

  try {
    const raw = await saathiComplete(
      apiKey(),
      extractMessages({
        section: src.section,
        sourceName: src.source_name,
        date: src.issue_date,
        text,
      }),
    );
    const found = parseExtracted(raw, text, src.id);
    const { daily_stories } = await getMagazineSettings();
    let created = 0;
    let merged = 0;
    for (const item of found) {
      const category: Category = src.section === "editorial" ? "editorial" : item.category;
      const embedding = await embedOne(storyText(item));
      const same = (await similarItems(embedding, src.issue_date, src.issue_date)).find(
        (s) => s.similarity >= SAME_DAY_SIMILARITY,
      );
      if (same) {
        const { data: existing } = await from("ca_items")
          .select("facts,source_ids,importance,rajasthan")
          .eq("id", same.id)
          .single();
        const e = existing as unknown as Pick<
          CaItem,
          "facts" | "source_ids" | "importance" | "rajasthan"
        >;
        const { error: uErr } = await from("ca_items")
          .update({
            facts: mergeFacts(e.facts, item.facts),
            source_ids: [...new Set([...e.source_ids, src.id])],
            importance: Math.max(e.importance, item.importance),
            rajasthan: e.rajasthan || item.rajasthan,
            needs_enrich: true,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", same.id);
        fail(uErr);
        merged++;
        continue;
      }
      const monthStart = monthRange(src.issue_date).from;
      const earlier =
        src.issue_date > monthStart
          ? (await similarItems(embedding, monthStart, dayBefore(src.issue_date))).find(
              (s) => s.similarity >= FOLLOW_UP_SIMILARITY,
            )
          : undefined;
      // Unlikely stories, and less important non-Rajasthan ones once the day is
      // full, arrive already dropped; an uploaded editorial always goes in.
      const { count: includedSoFar } = await from("ca_items")
        .select("id", { count: "exact", head: true })
        .eq("issue_date", src.issue_date)
        .eq("status", "included");
      const included =
        category === "editorial" ||
        startsIncluded(item.importance, includedSoFar ?? 0, daily_stories, item.rajasthan);
      const { error: iErr } = await from("ca_items").insert({
        issue_date: src.issue_date,
        category,
        status: included ? "included" : "dropped",
        headline: item.headline,
        facts: item.facts,
        source_ids: [src.id],
        importance: item.importance,
        rajasthan: item.rajasthan,
        embedding: embedding as unknown as string,
        related_item_id: earlier?.id ?? null,
        position: 1000 + created,
      } as never);
      fail(iErr);
      created++;
    }
    const done = Math.max(src.chunks_done, index + 1);
    await from("ca_sources")
      .update({
        chunks_done: done,
        status: done >= parts.length ? "done" : "extracting",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", sourceId);
    return { created, merged, parts: parts.length };
  } catch (e) {
    await from("ca_sources")
      .update({
        status: "error",
        error: saathiErrorDetail(e),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", sourceId);
    throw new Error(saathiErrorDetail(e));
  }
}

// Removes a source and the facts that came only from it.
export async function deleteSource(sourceId: string) {
  const { data } = await from("ca_items")
    .select("id,facts,source_ids")
    .contains("source_ids", [sourceId]);
  for (const it of (data ?? []) as Pick<CaItem, "id" | "facts" | "source_ids">[]) {
    const rest = it.source_ids.filter((s) => s !== sourceId);
    if (!rest.length) {
      fail((await from("ca_items").delete().eq("id", it.id)).error);
    } else {
      fail(
        (
          await from("ca_items")
            .update({
              source_ids: rest,
              facts: it.facts.filter((f) => f.source_id !== sourceId),
              needs_enrich: true,
            } as never)
            .eq("id", it.id)
        ).error,
      );
    }
  }
  fail((await from("ca_sources").delete().eq("id", sourceId)).error);
}

// Bulk changes are refused while the day's issue is waiting to be posted, so
// the scheduled PDF never differs from what the admin sees.
async function assertDayEditable(dates: string[]) {
  if (!dates.length) return;
  const { data } = await from("ca_issues")
    .select("period,status")
    .eq("kind", "daily")
    .in("period", [...new Set(dates)])
    .in("status", ["scheduled", "posting"]);
  const busy = ((data ?? []) as { period: string }[])[0];
  if (busy) {
    throw new Error(
      `The issue for ${formatDate(busy.period, "en")} is scheduled. Cancel the schedule first, then delete.`,
    );
  }
}

// Deletes several sources (and the facts that came only from them).
export async function deleteSources(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data } = await from("ca_sources").select("id,issue_date").in("id", ids);
  const rows = (data ?? []) as { id: string; issue_date: string }[];
  await assertDayEditable(rows.map((r) => r.issue_date));
  for (const r of rows) await deleteSource(r.id);
  return rows.length;
}

// Deletes news items outright (dropping only hides them from the issue).
export async function deleteItems(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data } = await from("ca_items").select("id,issue_date").in("id", ids);
  const rows = (data ?? []) as { id: string; issue_date: string }[];
  await assertDayEditable(rows.map((r) => r.issue_date));
  if (!rows.length) return 0;
  fail(
    (
      await from("ca_items")
        .delete()
        .in(
          "id",
          rows.map((r) => r.id),
        )
    ).error,
  );
  return rows.length;
}

// Removes everything collected from the watched websites for a day: the
// articles found, the sources made from them and the facts and items that
// came only from those sources. The admin's own uploads stay. The next
// collection reads the websites again from scratch, as if new.
export async function clearCollectedDay(date: string) {
  await assertDayEditable([date]);
  const { data } = await from("ca_sources")
    .select("id")
    .eq("issue_date", date)
    .not("url", "is", null);
  const sources = ((data ?? []) as { id: string }[]).map((r) => r.id);
  for (const id of sources) await deleteSource(id);
  const { count: articles, error } = await from("ca_articles")
    .delete({ count: "exact" })
    .eq("issue_date", date);
  fail(error);
  // The run is kept, marked as cleared, so the evening schedule doesn't start
  // again by itself; "Collect now" starts a fresh one.
  const at = new Date().toISOString();
  fail(
    (
      await from("ca_runs")
        .update({
          status: "done",
          started_by: "cleared",
          discovered: [],
          locked_until: null,
          notified: true,
          error: null,
          finished_at: at,
          updated_at: at,
        } as never)
        .eq("issue_date", date)
    ).error,
  );
  return { sources: sources.length, articles: articles ?? 0 };
}

// ---------- Writing the magazine text ----------

// Subjects in SAATHI's knowledge base, except current affairs itself, so the
// background always comes from the study notes.
async function studySubjects(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(2000);
  return [...new Set(((data ?? []) as { subject: string }[]).map((r) => r.subject))].filter(
    (s) => s && s !== CA_SUBJECT,
  );
}

const TOPIC_LABELS = new Map(syllabusTopics().map((t) => [t.id, `${t.unit_title} › ${t.topic}`]));

export async function enrichItem(itemId: string): Promise<CaItem> {
  const { data, error } = await from("ca_items").select(ITEM_COLS).eq("id", itemId).single();
  fail(error);
  const item = data as unknown as CaItem;
  item.category = normalizeCategory(item.category);
  const key = apiKey();
  try {
    const query = `${item.headline}\n${item.facts.map((f) => f.text).join(" ")}`.slice(0, 1000);
    const subjects = await studySubjects();
    // The visual comes first so the text can leave out what it shows.
    const [kbMatches, embedding, look] = await Promise.all([
      subjects.length
        ? saathiSearchQuery(key, rpc, { standalone: query, english: null }, subjects).then((m) =>
            relevantMatches(m).slice(0, 4),
          )
        : Promise.resolve([]),
      embedOne(storyText(item)),
      makeVisual(item),
    ]);
    const { data: topic } = await rpc("saathi_nearest_syllabus_topic", { p_embedding: embedding });
    const t = topic as { id: string; unit_id: string; similarity: number } | null;
    const syllabusId = t && t.similarity >= 0.5 ? t.id : null;

    const kb = kbMatches.map((m) => ({ title: m.source_file || m.title, content: m.content }));
    const raw = await saathiComplete(
      key,
      enrichMessages({
        headline: item.headline,
        category: item.category,
        facts: item.facts,
        kb,
        syllabus: syllabusId ? (TOPIC_LABELS.get(syllabusId) ?? null) : null,
        visual: look.visual
          ? { type: VISUAL_LABELS[look.visual.type].toLowerCase(), covers: look.visual_covers }
          : null,
      }),
    );
    const parsed = parseContent(raw, item.facts.length);
    if (!parsed) throw new Error("The AI's reply could not be read. Try again.");
    const contextSources = [
      ...new Set(parsed.backgroundFrom.map((i) => kb[i]?.title).filter(Boolean) as string[]),
    ].map((title) => ({ title }));

    const dyk = await findDidYouKnow(parsed.content.headline.en || item.headline, item.facts);
    const update = {
      content: { ...parsed.content, dyk, ...look },
      context_sources: contextSources,
      syllabus_topic_id: syllabusId,
      unit: syllabusId ? t!.unit_id : null,
      embedding: embedding as unknown as string,
      needs_enrich: false,
      enrich_error: null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: uErr } = await from("ca_items")
      .update(update as never)
      .eq("id", itemId)
      .select(ITEM_COLS)
      .single();
    fail(uErr);
    if (item.related_item_id) await checkForCorrections(item.related_item_id, itemId);
    return saved as unknown as CaItem;
  } catch (e) {
    await from("ca_items")
      .update({ enrich_error: saathiErrorDetail(e) } as never)
      .eq("id", itemId);
    throw new Error(saathiErrorDetail(e));
  }
}

// ---------- Monthly background article ----------

const featureKey = (month: string) => `ca_feature:${month.slice(0, 7)}`;

export async function getFeature(month: string): Promise<CaFeature | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", featureKey(month))
    .maybeSingle();
  return (data as { value: CaFeature } | null)?.value ?? null;
}

// Saves the month's article (edits, or in/out of the issue); null deletes it.
export async function saveFeature(month: string, feature: CaFeature | null) {
  if (!feature) {
    fail((await from("bot_settings").delete().eq("key", featureKey(month))).error);
    return null;
  }
  const { error } = await from("bot_settings").upsert({
    key: featureKey(month),
    value: feature,
    updated_at: new Date().toISOString(),
  } as never);
  fail(error);
  return feature;
}

// Knowledge-base passages on a topic, from the study notes (not current affairs).
async function featurePassages(query: string, count = 8) {
  const subjects = await studySubjects();
  if (!subjects.length) return [];
  const matches = await saathiSearchQuery(
    apiKey(),
    rpc,
    { standalone: query, english: null },
    subjects,
  );
  return relevantMatches(matches)
    .slice(0, count)
    .map((m) => ({ title: m.source_file || m.title, content: m.content }));
}

const NOT_COVERED =
  "Your SAATHI notes don't cover this topic well enough for an article. Add notes on it to the knowledge base first, or pick another topic.";

// Up to 3 topics behind this month's stories that the knowledge base covers.
export async function suggestFeatureTopics(month: string): Promise<FeatureTopic[]> {
  const range = monthRange(month);
  const { data, error } = await from("ca_items")
    .select("headline,category,content")
    .gte("issue_date", range.from)
    .lte("issue_date", range.to)
    .eq("status", "included")
    .order("importance", { ascending: false })
    .limit(150);
  fail(error);
  const stories = (
    (data ?? []) as { headline: string; category: string; content: CaContent | null }[]
  ).map((r) => ({
    headline: r.content?.headline.en || r.headline,
    category: categoryLabel(normalizeCategory(r.category)).en,
  }));
  if (!stories.length) throw new Error("There are no stories this month yet.");
  const topics = parseFeatureTopics(
    await saathiComplete(apiKey(), featureTopicMessages(stories)),
    stories,
  );
  const checked = await Promise.all(
    topics.map(async (t) => ({ ...t, passages: (await featurePassages(t.query)).length })),
  );
  return checked
    .filter((t) => t.passages >= 2)
    .sort((a, b) => b.stories.length - a.stories.length || b.passages - a.passages)
    .slice(0, 3);
}

// Writes the month's article on a topic from the knowledge base. A draft with
// a number the passages don't contain gets one retry, then fails.
export async function writeFeature(
  month: string,
  topic: { topic: Bi; query: string; stories: string[] },
): Promise<CaFeature> {
  const passages = await featurePassages(topic.query || topic.topic.en);
  if (passages.length < 2) throw new Error(NOT_COVERED);
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await saathiComplete(
      apiKey(),
      featureMessages({ topic: topic.topic, stories: topic.stories, passages, problem }),
    );
    const r = parseFeature(raw, passages);
    if (r.ok) {
      const feature: CaFeature = {
        topic: topic.topic,
        title: r.title,
        intro: r.intro,
        sections: r.sections,
        sources: [...new Set(r.from.map((i) => passages[i].title).filter(Boolean))],
        included: true,
        created_at: new Date().toISOString(),
      };
      await saveFeature(month, feature);
      return feature;
    }
    if (r.reason === "not covered") throw new Error(NOT_COVERED);
    problem = r.reason;
  }
  throw new Error(`SAATHI's article didn't pass the fact check: ${problem}`);
}

// ---------- Visuals ----------

// Asks SAATHI for the story's visual and revision line. A visual whose numbers
// aren't all in the facts gets one retry with the reason, then is left out.
// Never fails the item.
export async function makeVisual(item: Pick<CaItem, "headline" | "category" | "facts">): Promise<{
  visual: Visual | null;
  visual_covers: number[];
  oneliner: Bi | null;
  quick: CaQuick | null;
}> {
  try {
    const settings = await getMagazineSettings();
    let problem: string | undefined;
    let oneliner: Bi | null = null;
    let quick: CaQuick | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await saathiComplete(
        apiKey(),
        visualMessages({
          headline: item.headline,
          category: item.category,
          facts: item.facts,
          problem,
        }),
      );
      const r = parseVisual(raw, item.facts, item.headline);
      oneliner = r.oneliner ?? oneliner;
      quick = r.quick ?? quick;
      if (!settings.visuals) return { visual: null, visual_covers: [], oneliner, quick };
      if (r.visual || !r.problem)
        return { visual: r.visual, visual_covers: r.covers, oneliner, quick };
      problem = r.problem;
    }
    console.error("visual rejected:", problem);
    return { visual: null, visual_covers: [], oneliner, quick };
  } catch (e) {
    console.error("visual:", e);
    return { visual: null, visual_covers: [], oneliner: null, quick: null };
  }
}

// Makes the visual again (the admin's "Redo visual").
export async function redoVisual(itemId: string): Promise<CaItem> {
  const { data, error } = await from("ca_items").select(ITEM_COLS).eq("id", itemId).single();
  fail(error);
  const item = data as unknown as CaItem;
  if (!item.content) throw new Error("Write the text first");
  const look = await makeVisual(item);
  if (!look.visual) {
    // Keep the new revision line and question even without a visual.
    const keep = {
      ...(look.oneliner ? { oneliner: look.oneliner } : {}),
      ...(look.quick ? { quick: look.quick } : {}),
    };
    if (Object.keys(keep).length)
      await updateItem(itemId, { content: { ...item.content, ...keep } });
    throw new Error("SAATHI couldn't make a visual from these facts that passed the number check.");
  }
  return updateItem(itemId, { content: { ...item.content, ...look } });
}

// ---------- "Did you know?" from trusted websites ----------

// Searches the trusted sites with Tavily and keeps only facts quoted from the
// pages. Never fails the item: without a key or results the box is left out.
export async function findDidYouKnow(headline: string, facts: CaFact[]): Promise<DykFact[]> {
  const key = process.env.TAVILY_API_KEY;
  const settings = await getMagazineSettings();
  if (!key || !settings.do_you_know || !settings.trusted_domains.length) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: headline.slice(0, 380),
        search_depth: "basic",
        max_results: 3,
        include_domains: settings.trusted_domains,
        include_raw_content: true,
      }),
    });
    if (!res.ok) {
      console.error("tavily:", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string; raw_content?: string | null }[];
    };
    const pages: WebPage[] = (json.results ?? [])
      .filter((r) => r.url && (r.raw_content || r.content))
      .map((r) => ({
        title: r.title ?? "",
        url: r.url!,
        content: (r.raw_content || r.content || "").slice(0, 12_000),
      }));
    if (!pages.length) return [];
    return parseDyk(await saathiComplete(apiKey(), dykMessages({ headline, facts, pages })), pages);
  } catch (e) {
    console.error("did you know:", e);
    return [];
  }
}

// Compares a follow-up with the earlier item and records any changed facts
// as a correction for the admin to approve.
async function checkForCorrections(earlierId: string, laterId: string) {
  const { data: existing } = await from("ca_corrections")
    .select("id")
    .eq("item_id", earlierId)
    .eq("from_item_id", laterId)
    .limit(1);
  if ((existing ?? []).length) return;
  const { data } = await from("ca_items").select(ITEM_COLS).in("id", [earlierId, laterId]);
  const rows = (data ?? []) as unknown as CaItem[];
  const earlier = rows.find((r) => r.id === earlierId);
  const later = rows.find((r) => r.id === laterId);
  if (!earlier || !later || earlier.status === "dropped") return;
  const raw = await saathiComplete(
    apiKey(),
    changeCheckMessages({
      earlier: {
        date: earlier.issue_date,
        facts: earlier.facts,
        points: earlier.content?.points ?? [],
      },
      later: { date: later.issue_date, facts: later.facts },
    }),
  );
  const changes = parseChanges(raw, earlier.facts.length);
  if (!changes.length) return;
  const headline = earlier.content?.headline ?? { en: earlier.headline, hi: earlier.headline };
  const { error } = await from("ca_corrections").insert({
    item_id: earlierId,
    from_item_id: laterId,
    changes,
    summary_en: `${headline.en}: ${changes.map((c) => c.new_en).join("; ")}`,
    summary_hi: `${headline.hi}: ${changes.map((c) => c.new_hi || c.new_en).join("; ")}`,
  } as never);
  fail(error);
}

// ---------- Review ----------

export type DayData = {
  sources: CaSource[];
  items: CaItem[];
  issue: CaIssue | null;
  corrections: (CaCorrection & { item_date: string; headline: string })[];
};

export async function getDay(date: string): Promise<DayData> {
  const [sources, items, issue] = await Promise.all([
    from("ca_sources").select(SOURCE_COLS).eq("issue_date", date).order("created_at"),
    from("ca_items").select(ITEM_COLS).eq("issue_date", date).order("position").order("created_at"),
    from("ca_issues").select("*").eq("kind", "daily").eq("period", date).maybeSingle(),
  ]);
  fail(sources.error);
  fail(items.error);
  const month = monthRange(date);
  return {
    sources: (sources.data ?? []) as unknown as CaSource[],
    items: ((items.data ?? []) as unknown as CaItem[]).map((i) => ({
      ...i,
      category: normalizeCategory(i.category),
    })),
    issue: (issue.data as unknown as CaIssue | null) ?? null,
    corrections: await listCorrections(month.from, month.to, "pending"),
  };
}

export async function listCorrections(
  fromDate: string,
  toDate: string,
  status?: CaCorrection["status"],
) {
  let q = from("ca_corrections").select("*").order("created_at");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  fail(error);
  const list = (data ?? []) as unknown as CaCorrection[];
  if (!list.length) return [];
  const { data: items } = await from("ca_items")
    .select("id,issue_date,headline,content")
    .in("id", [...new Set(list.map((c) => c.item_id))]);
  const byId = new Map(
    ((items ?? []) as unknown as Pick<CaItem, "id" | "issue_date" | "headline" | "content">[]).map(
      (i) => [i.id, i],
    ),
  );
  return list
    .map((c) => {
      const it = byId.get(c.item_id);
      return {
        ...c,
        item_date: it?.issue_date ?? "",
        headline: it?.content?.headline.en || it?.headline || "",
      };
    })
    .filter((c) => c.item_date >= fromDate && c.item_date <= toDate);
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<CaItem, "category" | "status" | "position" | "content" | "importance">>,
) {
  if (patch.category && !isCategory(patch.category)) throw new Error("Unknown section");
  const { data, error } = await from("ca_items")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select(ITEM_COLS)
    .single();
  fail(error);
  return data as unknown as CaItem;
}

// Deletes one key point together with its fact (both languages).
// The point is named by its fact's text, so several quick deletes on the same
// story can't hit the wrong point after the list shifts.
export async function deletePoint(
  id: string,
  factText: string,
): Promise<{ item: CaItem; visualShowsIt: boolean }> {
  const { data, error } = await from("ca_items").select(ITEM_COLS).eq("id", id).single();
  fail(error);
  const item = data as unknown as CaItem;
  const index = item.facts.findIndex((f) => f.text === factText);
  if (index < 0) throw new Error("That point was already removed");
  const r = removePoint(item.facts, item.content, index);
  const { data: saved, error: uErr } = await from("ca_items")
    .update({ facts: r.facts, content: r.content, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select(ITEM_COLS)
    .single();
  fail(uErr);
  const { data: pending } = await from("ca_corrections")
    .select("id,changes")
    .eq("item_id", id)
    .eq("status", "pending");
  for (const c of (pending ?? []) as Pick<CaCorrection, "id" | "changes">[]) {
    const changes = shiftChanges(c.changes, index);
    const q = changes
      ? from("ca_corrections")
          .update({ changes } as never)
          .eq("id", c.id)
      : from("ca_corrections").delete().eq("id", c.id);
    fail((await q).error);
  }
  return { item: saved as unknown as CaItem, visualShowsIt: r.visualShowsIt };
}

export async function decideCorrection(id: string, approve: boolean) {
  const { data, error } = await from("ca_corrections").select("*").eq("id", id).single();
  fail(error);
  const corr = data as unknown as CaCorrection;
  if (approve) {
    const { data: it } = await from("ca_items").select(ITEM_COLS).eq("id", corr.item_id).single();
    const item = it as unknown as CaItem;
    const next = applyChanges(item.facts, item.content, corr.changes);
    fail(
      (
        await from("ca_items")
          .update({
            facts: next.facts,
            content: next.content,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", item.id)
      ).error,
    );
    // Keep SAATHI's copy of that day up to date.
    const day = await getIssue("daily", item.issue_date);
    const settings = await getMagazineSettings();
    if (
      day &&
      day.status !== "draft" &&
      day.status !== "cancelled" &&
      settings.add_to_knowledge_base
    ) {
      try {
        await addDayToKnowledgeBase(item.issue_date);
      } catch (e) {
        console.error("current affairs → knowledge base:", e);
      }
    }
  }
  fail(
    (
      await from("ca_corrections")
        .update({
          status: approve ? "approved" : "rejected",
          decided_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
    ).error,
  );
  return corr;
}

// ---------- Building issues ----------

async function magazineItems(fromDate: string, toDate: string): Promise<MagazineItem[]> {
  const { data, error } = await from("ca_items")
    .select(ITEM_COLS)
    .gte("issue_date", fromDate)
    .lte("issue_date", toDate)
    .eq("status", "included")
    .order("issue_date")
    .order("position");
  fail(error);
  const items = ((data ?? []) as unknown as CaItem[]).filter((i) => i.content);
  const sourceIds = [...new Set(items.flatMap((i) => i.source_ids))];
  const { data: srcs } = sourceIds.length
    ? await from("ca_sources").select("id,source_name,section").in("id", sourceIds)
    : { data: [] };
  const names = new Map(
    ((srcs ?? []) as { id: string; source_name: string; section: string }[]).map((s) => [
      s.id,
      s.source_name || s.section.toUpperCase(),
    ]),
  );
  return items.map((i) => ({
    id: i.id,
    issue_date: i.issue_date,
    category: normalizeCategory(i.category),
    importance: i.importance,
    rajasthan: i.rajasthan,
    content: i.content!,
    facts: i.facts,
    context_sources: i.context_sources,
    source_names: [...new Set(i.source_ids.map((s) => names.get(s)).filter(Boolean) as string[])],
  }));
}

export async function issueHtml(kind: "daily" | "monthly", period: string) {
  const settings = await getMagazineSettings();
  const range = kind === "daily" ? { from: period, to: period } : monthRange(period);
  const items = await magazineItems(range.from, range.to);
  let corrections: MagazineCorrection[] = [];
  if (kind === "monthly") {
    corrections = (await listCorrections(range.from, range.to, "approved")).map((c) => ({
      date: c.item_date,
      summary: { en: c.summary_en, hi: c.summary_hi },
    }));
  }
  const feature = kind === "monthly" ? await getFeature(range.from) : null;
  return {
    html: renderMagazine({
      kind,
      period: kind === "daily" ? period : range.from,
      settings,
      items,
      corrections,
      feature: feature?.included ? feature : null,
    }),
    settings,
    count: items.length,
  };
}

// Cloudflare Browser Rendering (REST API) turns the HTML into a PDF.
export async function renderPdf(html: string, settings: MagazineSettings): Promise<Uint8Array> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    throw new Error(
      "PDF making is not set up: add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the project's secrets.",
    );
  }
  // The product was renamed from Browser Rendering to Browser Run; try the
  // newer path if the older one is ever retired.
  const call = (path: string) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}/pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
        pdfOptions: {
          format: "a4",
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: footerTemplate(settings),
        },
      }),
    });
  let res = await call("browser-rendering");
  if (res.status === 404) res = await call("browser-run");
  if (!res.ok) {
    const body = await res.text();
    const hint =
      res.status === 401 || res.status === 403
        ? " Check that the API token has the Account → Browser Run (Browser Rendering) → Edit permission and belongs to this account."
        : res.status === 429
          ? " Cloudflare's usage limit was reached; try again later or upgrade the Workers plan."
          : "";
    throw new Error(`Cloudflare PDF making failed (${res.status}).${hint} ${body.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function fileName(kind: "daily" | "monthly", period: string) {
  return kind === "daily"
    ? `daily/FlashGyan-Current-Affairs-${period}.pdf`
    : `monthly/FlashGyan-Current-Affairs-${period.slice(0, 7)}.pdf`;
}

async function upsertIssue(
  kind: "daily" | "monthly",
  period: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await from("ca_issues")
    .upsert({ kind, period, ...patch, updated_at: new Date().toISOString() } as never, {
      onConflict: "kind,period",
    })
    .select("*")
    .single();
  fail(error);
  return data as unknown as CaIssue;
}

async function getIssue(kind: "daily" | "monthly", period: string) {
  const { data } = await from("ca_issues")
    .select("*")
    .eq("kind", kind)
    .eq("period", period)
    .maybeSingle();
  return (data as unknown as CaIssue | null) ?? null;
}

// Builds the PDF and stores it. With schedule, the issue is approved and will
// be posted at `when` (daily default: next day at the set time, India time).
export async function buildIssue(
  kind: "daily" | "monthly",
  period: string,
  opts: { schedule: boolean; when?: string | null },
): Promise<CaIssue> {
  const current = await getIssue(kind, period);
  if (current && (current.status === "posting" || current.status === "posted")) {
    throw new Error("This issue has already been posted.");
  }
  if (kind === "daily") {
    const { count } = await from("ca_items")
      .select("id", { count: "exact", head: true })
      .eq("issue_date", period)
      .eq("status", "included")
      .eq("needs_enrich", true);
    if (count)
      throw new Error(`${count} item(s) still need writing. Run "Write magazine text" first.`);
  }
  const { html, settings, count } = await issueHtml(kind, period);
  if (count === 0) throw new Error("There are no items to put in this issue.");
  const pdf = await renderPdf(html, settings);
  const path = fileName(kind, period);
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  fail(error);
  const url = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const scheduledFor = opts.schedule
    ? opts.when
      ? new Date(opts.when)
      : kind === "daily"
        ? dailyPostTime(period, settings.post_time)
        : new Date()
    : null;
  const issue = await upsertIssue(kind, period, {
    pdf_path: path,
    pdf_url: url,
    item_count: count,
    caption: captionFor(kind, period, settings, count),
    status: opts.schedule ? "scheduled" : "draft",
    scheduled_for: scheduledFor?.toISOString() ?? null,
    approved_at: opts.schedule ? new Date().toISOString() : null,
    error: null,
  });
  if (opts.schedule && kind === "daily" && settings.add_to_knowledge_base) {
    try {
      await addDayToKnowledgeBase(period);
    } catch (e) {
      console.error("current affairs → knowledge base:", e);
    }
  }
  return issue;
}

export async function cancelIssue(kind: "daily" | "monthly", period: string) {
  const issue = await getIssue(kind, period);
  if (!issue || issue.status !== "scheduled")
    throw new Error("Only a scheduled issue can be cancelled.");
  return upsertIssue(kind, period, { status: "cancelled", scheduled_for: null });
}

export async function postIssueNow(kind: "daily" | "monthly", period: string) {
  const issue = await getIssue(kind, period);
  if (!issue?.pdf_path) throw new Error("Approve the issue first.");
  if (issue.status === "posted" || issue.status === "posting") throw new Error("Already posted.");
  return upsertIssue(kind, period, {
    status: "scheduled",
    scheduled_for: new Date().toISOString(),
    error: null,
  });
}

// ---------- Telegram ----------

async function sendPdf(chatId: string, issue: CaIssue) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!issue.pdf_path) throw new Error("This issue has no PDF yet.");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(issue.pdf_path);
  fail(error);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", data as Blob, issue.pdf_path.split("/").pop() ?? "magazine.pdf");
  if (issue.caption) {
    form.append("caption", issue.caption);
    form.append("parse_mode", "HTML");
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram error ${res.status}`);
}

export async function sendTestIssue(kind: "daily" | "monthly", period: string) {
  const settings = await getMagazineSettings();
  if (!settings.test_chat_id)
    throw new Error("Add your Telegram chat id in Magazine settings first.");
  const issue = await getIssue(kind, period);
  if (!issue) throw new Error("Make the PDF first.");
  await sendPdf(settings.test_chat_id, issue);
}

// ---------- Knowledge base ----------

function itemMarkdown(i: MagazineItem): string {
  const c = i.content;
  const lines = [
    `## ${c.headline.hi} | ${c.headline.en}`,
    `${categoryLabel(i.category).en} · ${formatDate(i.issue_date, "en")}`,
    "",
    c.summary.hi,
    "",
    c.summary.en,
    "",
    ...c.points.map((p) => `- ${p.hi} / ${p.en}`),
  ];
  if (c.why.en) lines.push("", `**RAS:** ${c.why.hi} / ${c.why.en}`);
  return lines.join("\n");
}

// Saves an approved day as a SAATHI document, so students can ask about it.
export async function addDayToKnowledgeBase(date: string) {
  const items = await magazineItems(date, date);
  if (!items.length) return;
  const ingest = await import("@/lib/saathi-ingest.server");
  const title = `Current Affairs ${date}`;
  const text = `# करेंट अफेयर्स ${formatDate(date, "hi")} | Current Affairs ${formatDate(date, "en")}\n\n${items
    .map(itemMarkdown)
    .join("\n\n")}`;
  const { data } = await supabaseAdmin
    .from("saathi_knowledge")
    .select("id")
    .is("parent_id", null)
    .eq("title", title)
    .maybeSingle();
  if (data?.id) await ingest.replaceDocument(data.id, text);
  else
    await ingest.createDocument(
      { title, subject: CA_SUBJECT, topic: date.slice(0, 7), medium: "Bilingual" },
      text,
    );
}
