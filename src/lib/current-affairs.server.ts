// Server-only current affairs magazine: sources → news items → bilingual
// issues → PDF (Cloudflare browser rendering) → scheduled Telegram post.
import {
  adImage,
  fillerPages,
  normalizeAds,
  normalizeIssueDesign,
  normalizePresets,
  type DailyLayout,
  type IssueDesign,
} from "@/lib/ca-covers";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { startsIncluded } from "@/lib/ca-blueprint";
import {
  MAX_PAIRS,
  MAYBE_SAME,
  SURELY_SAME,
  candidatePairs,
  duplicateGroups,
  parseSameStory,
  parseVector,
  pickKeeper,
  sameStoryMessages,
  type StoryBrief,
} from "@/lib/ca-duplicates";
import {
  featureMessages,
  featureTopicMessages,
  parseFeature,
  parseFeatureTopics,
  type CaFeature,
  type FeatureTopic,
} from "@/lib/ca-feature";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiEmbed,
  saathiEmbedMany,
  saathiSearchQuery,
  type SaathiImage,
  type SaathiRpc,
  saathiErrorDetail,
} from "../../supabase/functions/_shared/saathi-core.ts";
import {
  imageTextMessages,
  materialMessages,
  materialName,
  parseMaterial,
  type MaterialFact,
  type MaterialFind,
  type MaterialStatic,
  type MaterialTarget,
} from "@/lib/ca-material";
import {
  DEFAULT_MAGAZINE_SETTINGS,
  applyChanges,
  captionFor,
  correctionNote,
  categoryLabel,
  changeCheckMessages,
  dailyPostTime,
  dykMessages,
  relatedMessages,
  parseRelated,
  flashcardDeckFor,
  issueCards,
  dayCardRange,
  type EarlierStory,
  parseDyk,
  type DykFact,
  type WebPage,
  enrichMessages,
  extractMessages,
  formatDate,
  isCategory,
  normalizeCategory,
  CATEGORIES,
  mergeFacts,
  monthRange,
  parseChanges,
  parseContent,
  parseExtracted,
  MAX_STATICS,
  mergeKeywords,
  mergeStatics,
  newStoryMessages,
  parseNewStory,
  parseStaticFacts,
  staticFactsMessages,
  staticSources,
  type StaticFact,
  normalizeForMatch,
  quoteInSource,
  removePoint,
  shiftChanges,
  splitSource,
  storyText,
  type Bi,
  type CaChange,
  type CaContent,
  type CaQuick,
  type RawItem,
  type CaFact,
  type Category,
  type MagazineSettings,
  type UploadSection,
} from "@/lib/current-affairs";
import {
  VISUAL_LABELS,
  parseVisual,
  unverifiedNumbers,
  visualMessages,
  type Visual,
  type VisualType,
} from "@/lib/ca-visuals";
import {
  isPaged,
  outline,
  sourceArticles,
  type ArticleText,
  type OutlineEntry,
} from "@/lib/ca-reader-format";
import { missingMessages, parseMissing, type MissingCheck } from "@/lib/ca-missing";
import { parseSummaryOptions, summaryOptionsMessages } from "@/lib/ca-summary";
import {
  parseSuggestedMarks,
  suggestMarksMessages,
  type SuggestedMark,
} from "@/lib/ca-suggest-marks";
import { fixShortFormsDeep } from "../../supabase/functions/_shared/ca-hindi.ts";
import {
  glossaryMessages,
  normalizeGlossary,
  parseGlossary,
  GLOSSARY_MIN_EDITS,
  type GlossaryEntry,
  type GlossarySuggestion,
  type HindiEdit,
} from "@/lib/ca-glossary";
import { bestArticle, cosine, meaningText, type CompareMatch } from "@/lib/ca-compare";
import { ADD_POINTS_MAX, STORY_POINTS_MAX, parsePoints, pointsMessages } from "@/lib/ca-points";
import { dayChecklist, type Check } from "@/lib/ca-checklist";
import {
  LANG_CHECK_STORIES,
  langCheckMessages,
  langFingerprint,
  langStatus,
  langPartName,
  langText,
  parseLangNotes,
  syncLines,
  withLangPart,
  type LangCheck,
} from "@/lib/ca-bilingual";
import {
  SYNC_LINES_MAX,
  parseSync,
  syncMessages,
} from "../../supabase/functions/_shared/ca-translate.ts";
import {
  STYLE_CHECK_STORIES,
  STYLE_MIN_EDITS,
  STYLE_RULES_MAX,
  afterFix,
  afterKeep,
  editPairs,
  parseStyleBreaks,
  parseStyleRules,
  partText,
  rulesFingerprint,
  storyFingerprint,
  styleCheckMessages,
  styleMessages,
  styleStatus,
  tallyFound,
  withPart,
  type EditPair,
  type StyleCheck,
  type StyleSuggestion,
} from "@/lib/ca-style";
import {
  closestSentence,
  quoteContext,
  sourceSentences,
  type QuoteContext,
} from "@/lib/ca-factcheck";
import {
  RANK_MAX,
  parseRanks,
  rankMessages,
  skippedKey,
  uncoveredArticles,
  type FoundArticle,
  type SkippedArticle,
  type SkippedRank,
} from "@/lib/ca-skipped";

export type { SkippedArticle };
import {
  factsFromHighlights,
  findQuote,
  type Span,
  READER_PAD,
  READER_WHOLE,
  readerWindow,
  remapChanges,
  snapToLines,
  type Highlight,
} from "@/lib/ca-highlight";
import {
  footerTemplate,
  renderMagazine,
  type Lang,
  type MagazineCorrection,
  type MagazineItem,
} from "@/lib/current-affairs-html";
import { syllabusTopics } from "../../supabase/functions/_shared/ras-syllabus.ts";

// The generated types don't know these tables yet.
const from = (table: string) => {
  const q = supabaseAdmin.from(table as never);
  return table === "ca_items" ? withShortForms(q) : q;
};

// Every story saved, whoever wrote it, has its short forms in Latin letters
// in the Hindi (SCO, not एससीओ).
function withShortForms<T extends object>(q: T): T {
  const fix = (row: unknown): unknown =>
    row && typeof row === "object" && !Array.isArray(row) && "content" in row
      ? { ...row, content: fixShortFormsDeep((row as { content: unknown }).content) }
      : row;
  return new Proxy(q, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "update" || prop === "insert" || prop === "upsert")
        return (rows: unknown, ...rest: unknown[]) =>
          value.call(target, Array.isArray(rows) ? rows.map(fix) : fix(rows), ...rest);
      return value.bind(target);
    },
  });
}
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
export const SAME_DAY_SIMILARITY = SURELY_SAME;
export const FOLLOW_UP_SIMILARITY = 0.85;
export const CA_SUBJECT = "Current Affairs";
const BUCKET = "ca-magazines";

// ---------- Settings ----------

const SETTINGS_KEY = "ca_magazine";

// The editor's glossary, for prompts that write Hindi.
const glossaryNow = async () => (await getMagazineSettings()).glossary ?? [];

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

// Story images live next to the PDFs, public like them, so the PDF renderer
// can load them. Files stay when an image is taken off a story: an older
// version in the story's history may still show it.
export async function uploadImage(itemId: string, bytes: Uint8Array, contentType: string) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `images/${itemId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType });
  fail(error);
  return { path, url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
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
  // The static textbook concept the background explains (older items: null).
  concept?: string | null;
};

export type CaIssue = {
  id: string;
  kind: "daily" | "monthly";
  period: string;
  status: "draft" | "scheduled" | "posting" | "posted" | "failed" | "cancelled";
  // The English issue's PDF and caption, and the Hindi issue's (none on older
  // bilingual issues, whose one PDF is in pdf_path).
  pdf_path: string | null;
  pdf_url: string | null;
  pdf_path_hi: string | null;
  pdf_url_hi: string | null;
  item_count: number;
  caption: string | null;
  caption_hi: string | null;
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
  "id,issue_date,category,headline,facts,source_ids,importance,rajasthan,content,context_sources,syllabus_topic_id,unit,needs_enrich,enrich_error,related_item_id,status,position,created_at,concept";

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

// The most similar included stories in a date range. An editorial is only
// ever compared with editorials, and a news story with news stories.
async function similarItems(
  embedding: number[],
  fromDate: string,
  toDate: string,
  editorial: boolean,
) {
  const { data, error } = await rpc("ca_similar_items", {
    p_embedding: embedding,
    p_from: fromDate,
    p_to: toDate,
    p_exclude: null,
    p_count: 8,
  });
  fail(error);
  const similar = (data ?? []) as Similar[];
  if (!similar.length) return similar;
  const { data: rows } = await from("ca_items")
    .select("id,category")
    .in(
      "id",
      similar.map((s) => s.id),
    );
  const sameKind = new Set(
    ((rows ?? []) as { id: string; category: string }[])
      .filter((r) => (r.category === "editorial") === editorial)
      .map((r) => r.id),
  );
  return similar.filter((s) => sameKind.has(s.id)).slice(0, 3);
}

const dayBefore = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// The same day's story a new item is the same news as, if any: a near-identical
// one directly, otherwise the AI decides among the similar ones. A failed AI
// check never blocks the source; the item is then saved as a new story.
async function sameDayStory(
  item: RawItem,
  embedding: number[],
  date: string,
  editorial: boolean,
): Promise<string | null> {
  const similar = await similarItems(embedding, date, date, editorial);
  const sure = similar.find((s) => s.similarity >= SURELY_SAME);
  if (sure) return sure.id;
  const maybe = similar.filter((s) => s.similarity >= MAYBE_SAME);
  if (!maybe.length) return null;
  try {
    const { data } = await from("ca_items")
      .select("id,headline,facts")
      .in(
        "id",
        maybe.map((m) => m.id),
      );
    const rows = new Map(
      ((data ?? []) as Pick<CaItem, "id" | "headline" | "facts">[]).map((r) => [r.id, r]),
    );
    const others = maybe.map((m) => rows.get(m.id)).filter((r) => r !== undefined);
    if (!others.length) return null;
    const pairs = others.map((o) => [item, o] as [StoryBrief, StoryBrief]);
    const yes = parseSameStory(
      await saathiComplete(apiKey(), sameStoryMessages(pairs)),
      pairs.length,
    );
    const first = [...yes].sort((a, b) => a - b)[0];
    return first === undefined ? null : others[first].id;
  } catch (e) {
    console.error("same-story check:", e);
    return null;
  }
}

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
      const editorial = category === "editorial";
      const same = await sameDayStory(item, embedding, src.issue_date, editorial);
      if (same) {
        const { data: existing } = await from("ca_items")
          .select("facts,source_ids,importance,rajasthan,concept")
          .eq("id", same)
          .single();
        const e = existing as unknown as Pick<
          CaItem,
          "facts" | "source_ids" | "importance" | "rajasthan" | "concept"
        >;
        const { error: uErr } = await from("ca_items")
          .update({
            facts: mergeFacts(e.facts, item.facts),
            source_ids: [...new Set([...e.source_ids, src.id])],
            importance: Math.max(e.importance, item.importance),
            rajasthan: e.rajasthan || item.rajasthan,
            concept: e.concept || item.concept,
            needs_enrich: true,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", same);
        fail(uErr);
        merged++;
        continue;
      }
      const monthStart = monthRange(src.issue_date).from;
      // Editorials are opinion, so they are never follow-ups that correct facts.
      const earlier =
        !editorial && src.issue_date > monthStart
          ? (await similarItems(embedding, monthStart, dayBefore(src.issue_date), false)).find(
              (s) => s.similarity >= FOLLOW_UP_SIMILARITY,
            )
          : undefined;
      // Unlikely stories, and less important non-Rajasthan ones once the day is
      // full, arrive already dropped; an editorial always goes in and does not
      // count towards the day's stories.
      const { count: includedSoFar } = await from("ca_items")
        .select("id", { count: "exact", head: true })
        .eq("issue_date", src.issue_date)
        .eq("status", "included")
        .neq("category", "editorial");
      const included =
        editorial ||
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
        concept: item.concept,
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
type DupRow = Pick<
  CaItem,
  | "id"
  | "headline"
  | "facts"
  | "importance"
  | "rajasthan"
  | "status"
  | "position"
  | "source_ids"
  | "related_item_id"
  | "category"
> & { embedding: unknown };

// Finds the day's stories that are the same news and merges each group into
// one story (facts and sources combined, written again). Returns the stories
// kept, so the caller can write them.
export async function mergeDayDuplicates(
  date: string,
): Promise<{ groups: number; removed: number; kept: string[] }> {
  await assertDayEditable([date]);
  const { data, error } = await from("ca_items")
    .select(
      "id,headline,facts,importance,rajasthan,status,position,source_ids,related_item_id,category,embedding",
    )
    .eq("issue_date", date)
    .order("position");
  fail(error);
  const items = (data ?? []) as unknown as DupRow[];
  // An editorial and a news story on the same event are kept apart.
  const editorial = (i: number) => items[i].category === "editorial";
  const pairs = candidatePairs(items.map((i) => parseVector(i.embedding))).filter(
    (p) => editorial(p.a) === editorial(p.b),
  );
  const sure = pairs.filter((p) => p.similarity >= SURELY_SAME);
  const doubtful = pairs.filter((p) => p.similarity < SURELY_SAME).slice(0, MAX_PAIRS);
  let confirmed: { a: number; b: number }[] = [];
  if (doubtful.length) {
    const yes = parseSameStory(
      await saathiComplete(
        apiKey(),
        sameStoryMessages(doubtful.map((p) => [items[p.a], items[p.b]])),
      ),
      doubtful.length,
    );
    confirmed = doubtful.filter((_, i) => yes.has(i));
  }
  const groups = duplicateGroups(items.length, [...sure, ...confirmed]);
  const kept: string[] = [];
  let removed = 0;
  for (const g of groups) {
    const members = g.map((i) => items[i]);
    const keeper = members[pickKeeper(members)];
    const others = members.filter((m) => m.id !== keeper.id);
    const otherIds = others.map((o) => o.id);
    const facts = others.reduce((acc, o) => mergeFacts(acc, o.facts, 10), keeper.facts);
    fail(
      (
        await from("ca_items")
          .update({
            facts,
            source_ids: [...new Set(members.flatMap((m) => m.source_ids))],
            importance: Math.max(...members.map((m) => m.importance)),
            rajasthan: members.some((m) => m.rajasthan),
            status: members.some((m) => m.status === "included") ? "included" : keeper.status,
            related_item_id:
              keeper.related_item_id ??
              others.find((o) => o.related_item_id && !otherIds.includes(o.related_item_id))
                ?.related_item_id ??
              null,
            needs_enrich: true,
            enrich_error: null,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", keeper.id)
      ).error,
    );
    // Corrections and follow-ups that point at a removed story move to the kept one.
    fail(
      (
        await from("ca_corrections")
          .update({ item_id: keeper.id } as never)
          .in("item_id", otherIds)
      ).error,
    );
    fail(
      (
        await from("ca_items")
          .update({ related_item_id: keeper.id } as never)
          .in("related_item_id", otherIds)
          .neq("id", keeper.id)
      ).error,
    );
    fail((await from("ca_items").delete().in("id", otherIds)).error);
    kept.push(keeper.id);
    removed += others.length;
  }
  return { groups: groups.length, removed, kept };
}

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

const TOPIC_LABELS = new Map(
  syllabusTopics().map((t) => [
    t.id,
    `GS Paper ${t.paper} › ${t.unit_title} › ${t.part} › ${t.topic}`,
  ]),
);
// "GS Paper I: History, Art & Culture; Economics; … | GS Paper II: …"
const PAPER_SUBJECTS = [...new Set(syllabusTopics().map((t) => t.paper))]
  .map(
    (p) =>
      `GS Paper ${p}: ${[
        ...new Set(
          syllabusTopics()
            .filter((t) => t.paper === p)
            .map((t) => t.unit_title),
        ),
      ].join("; ")}`,
  )
  .join(" | ");

// Mains questions the issue's other kept stories already have (English).
async function issueMainsQuestions(date: string, exceptId: string): Promise<string[]> {
  const { data } = await from("ca_items")
    .select("id,status,mains:content->mains")
    .eq("issue_date", date)
    .neq("id", exceptId);
  return ((data ?? []) as unknown as { status: string; mains: Bi | null }[])
    .filter((r) => r.status !== "dropped" && r.mains?.en)
    .map((r) => r.mains!.en)
    .slice(0, 30);
}

// opts.context: facts for the summary and "why" only (from the reader's
// highlights; otherwise the story's saved ones). opts.note: the editor's
// instruction for this writing. opts.before: the story as it was before the
// caller changed its facts, saved as a version once the new one is written.
export async function enrichItem(
  itemId: string,
  opts: {
    context?: CaFact[];
    note?: string | null;
    before?: CaSnapshot | null;
    reason?: CaVersion["reason"];
  } = {},
): Promise<CaItem> {
  const { data, error } = await from("ca_items").select(ITEM_COLS).eq("id", itemId).single();
  fail(error);
  const item = data as unknown as CaItem;
  item.category = normalizeCategory(item.category);
  const before = opts.before !== undefined ? opts.before : snapshotOf(item);
  const context = opts.context ?? item.content?.context_facts ?? [];
  const key = apiKey();
  const { style_rules: style, summary_words: summaryWords, glossary } = await getMagazineSettings();
  try {
    // The background explains the story's static concept, so the books are
    // searched for the concept, and for the headline in case the concept's
    // words differ from the book's; older stories without one use the news.
    const newsText = `${item.headline}\n${item.facts.map((f) => f.text).join(" ")}`.slice(0, 1000);
    const search = item.concept
      ? { standalone: item.concept.slice(0, 300), english: item.headline.slice(0, 300) }
      : { standalone: newsText, english: null };
    const subjects = await studySubjects();
    // The visual comes first so the text can leave out what it shows.
    const [kbMatches, embedding, look, mainsSet] = await Promise.all([
      subjects.length
        ? saathiSearchQuery(key, rpc, search, subjects).then((m) => relevantMatches(m).slice(0, 4))
        : Promise.resolve([]),
      embedOne(storyText(item)),
      makeVisual(item),
      issueMainsQuestions(item.issue_date, itemId),
    ]);
    const { data: topic } = await rpc("saathi_nearest_syllabus_topic", { p_embedding: embedding });
    const t = topic as { id: string; unit_id: string; similarity: number } | null;
    const syllabusId = t && t.similarity >= 0.5 ? t.id : null;

    // Each passage is cited by its book and publisher ("NCERT · …").
    const kb = kbMatches.map((m) => ({ title: matchLabel(m), content: m.content }));
    const raw = await saathiComplete(
      key,
      enrichMessages({
        headline: item.headline,
        category: item.category,
        facts: item.facts,
        kb,
        syllabus: syllabusId ? (TOPIC_LABELS.get(syllabusId) ?? null) : null,
        papers: PAPER_SUBJECTS,
        mainsSet,
        concept: item.concept,
        context: context.map((f) => (f.note ? `${f.text} [Editor's note: ${f.note}]` : f.text)),
        note: opts.note,
        style,
        summaryWords,
        glossary,
        visual: look.visual
          ? { type: VISUAL_LABELS[look.visual.type].toLowerCase(), covers: look.visual_covers }
          : null,
      }),
    );
    const parsed = parseContent(
      raw,
      item.facts.length,
      kb.map((k) => k.title),
    );
    if (!parsed) throw new Error("The AI's reply could not be read. Try again.");
    // Static Context facts the admin chose survive rewriting the story.
    const kept = item.content?.statics_edited ? item.content : null;
    const statics = kept ? (kept.statics ?? []) : (parsed.content.statics ?? []);

    const dyk = await findDidYouKnow(item, embedding, parsed.content.headline.en || item.headline);
    const update = {
      content: {
        ...parsed.content,
        ...(kept
          ? {
              background: kept.background,
              statics,
              keywords: mergeKeywords(kept.keywords ?? [], statics),
              statics_edited: true,
            }
          : {}),
        context_facts: context,
        dyk,
        ...look,
        // The editor's images survive rewriting the story, and so does a
        // second visual whose numbers are all still in the facts (its facts
        // print as points again, as their order may have changed).
        ...(item.content?.images?.length ? { images: item.content.images } : {}),
        ...(item.content?.visual2 && !unverifiedNumbers(item.content.visual2, item.facts).length
          ? { visual2: item.content.visual2, visual2_covers: [] }
          : {}),
      },
      context_sources: staticSources(statics),
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
    if (before) await saveVersion(itemId, before, opts.reason ?? "write");
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
export async function saveFeature(month: string, given: CaFeature | null) {
  const feature = given && fixShortFormsDeep(given);
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
    .map((m) => ({ title: matchLabel(m), content: m.content }));
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
      featureMessages({
        topic: topic.topic,
        stories: topic.stories,
        passages,
        problem,
        glossary: await glossaryNow(),
      }),
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
          glossary: await glossaryNow(),
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

// A visual of the type the editor picked (or SAATHI's choice), with their
// note, shown to them before it replaces anything. The story's other visual
// is passed so the two show different things. One retry when its numbers
// aren't all in the facts.
export async function previewVisual(
  itemId: string,
  opts: { slot: 1 | 2; type?: VisualType; note?: string },
): Promise<{ visual: Visual; covers: number[] }> {
  const item = await getItem(itemId);
  if (!item.content) throw new Error("Write the text first");
  const other = opts.slot === 1 ? item.content.visual2 : item.content.visual;
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await saathiComplete(
      apiKey(),
      visualMessages({
        glossary: await glossaryNow(),
        headline: item.headline,
        category: item.category,
        facts: item.facts,
        problem,
        type: opts.type,
        note: opts.note?.trim() || undefined,
        other: other ?? null,
      }),
    );
    const r = parseVisual(raw, item.facts, item.headline);
    if (r.visual && (!opts.type || r.visual.type === opts.type))
      return { visual: r.visual, covers: r.covers };
    problem =
      r.problem ?? (r.visual ? `You made a "${r.visual.type}"; make a "${opts.type}".` : undefined);
    if (!problem) break;
  }
  throw new Error(
    opts.type
      ? `SAATHI couldn't make a ${VISUAL_LABELS[opts.type].toLowerCase()} from these facts that passed the number check.${problem ? ` (${problem})` : ""}`
      : "SAATHI couldn't make a visual from these facts that passed the number check.",
  );
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

// ---------- Material the editor adds to a story ----------

// Reads the material (a page, typed or file text, or an image), keeps it
// as one of the day's sources (so its facts have a source and a quote), and
// asks SAATHI what the story lacks from it, for the place the editor chose.
// Nothing in the story changes until the editor picks what goes in.
export async function readMaterial(
  itemId: string,
  input: {
    target: MaterialTarget;
    note?: string | null;
    url?: string;
    text?: { title: string; content: string };
    image?: { name: string; contentType: SaathiImage["media_type"]; base64: string };
  },
): Promise<{ source_id: string; title: string } & MaterialFind & { dropped: number }> {
  const item = await loadItem(itemId);
  let title: string;
  let content: string;
  let url: string | null = null;
  if (input.url) {
    const { readPage } = await import("@/lib/ca-collect.server");
    const page = await readPage(input.url);
    if (!page)
      throw new Error(
        "Couldn't read this page (it may be blocked or behind a login). Copy its text and paste it instead.",
      );
    ({ title, text: content } = page);
    url = input.url;
  } else if (input.image) {
    content = (
      await saathiComplete(apiKey(), imageTextMessages(), undefined, [
        { media_type: input.image.contentType, data: input.image.base64 },
      ])
    ).trim();
    if (content.length < 20) throw new Error("No readable text in this image.");
    title = input.image.name;
  } else if (input.text) {
    ({ title, content } = input.text);
  } else throw new Error("Add a link, a file or some text.");
  const name = materialName({ url, fileName: input.image?.name ?? input.text?.title });
  const source = await addSource({
    issue_date: item.issue_date,
    section: "other",
    source_name: name,
    title: title.slice(0, 300) || name,
    content: content.slice(0, 600_000),
    url,
  });
  // Already read: it isn't split into stories of its own.
  fail(
    (
      await from("ca_sources")
        .update({ chunks_done: source.chunks, status: "done" } as never)
        .eq("id", source.id)
    ).error,
  );
  const c = item.content;
  const known =
    input.target === "static"
      ? (c?.statics ?? []).map((f) => f.keyword.en)
      : [...item.facts, ...(c?.context_facts ?? [])].map((f) => f.text);
  const raw = await saathiComplete(
    apiKey(),
    materialMessages({
      glossary: await glossaryNow(),
      headline: c?.headline.en || item.headline,
      facts: item.facts.map((f) => f.text),
      material: content,
      title: source.title,
      target: input.target,
      note: input.note,
    }),
  );
  return {
    source_id: source.id,
    title: source.title,
    ...parseMaterial(raw, content, input.target, known),
  };
}

// The material wasn't used: its source goes, unless a story already uses it.
export async function discardMaterial(sourceId: string) {
  const { data } = await from("ca_items").select("id").contains("source_ids", [sourceId]).limit(1);
  if ((data ?? []).length) return { deleted: false };
  fail((await from("ca_sources").delete().eq("id", sourceId)).error);
  return { deleted: true };
}

// What the editor picked from the material goes into the story: new facts or
// background, with the story written again around them, or Static Context
// entries added as they are.
export async function applyMaterial(
  itemId: string,
  input: {
    source_id: string;
    target: MaterialTarget;
    facts: MaterialFact[];
    statics: MaterialStatic[];
    note?: string | null;
  },
): Promise<CaItem> {
  const item = await loadItem(itemId);
  const { data: src, error } = await from("ca_sources")
    .select("id,title,content")
    .eq("id", input.source_id)
    .single();
  fail(error);
  const source = src as unknown as { id: string; title: string; content: string };
  const c = item.content;
  if (!c) throw new Error("Write the story first.");
  if (input.target === "static") {
    const add = input.statics
      .filter((s) => quoteInSource(s.quote, source.content))
      .map((s) => ({ keyword: s.keyword, text: s.text, source: source.title }));
    if (!add.length) throw new Error("Pick at least one entry.");
    const statics = mergeStatics(c.statics ?? [], add);
    // The story uses the material (so it isn't listed as skipped news).
    fail(
      (
        await from("ca_items")
          .update({ source_ids: [...new Set([...item.source_ids, source.id])] } as never)
          .eq("id", itemId)
      ).error,
    );
    return asEdit(itemId, () =>
      updateItem(itemId, {
        content: {
          ...c,
          statics,
          keywords: mergeKeywords(c.keywords ?? [], statics),
          statics_edited: true,
        },
      }),
    );
  }
  const have = new Set(
    [...item.facts, ...(c.context_facts ?? [])].map((f) => normalizeForMatch(f.quote)),
  );
  const picked: CaFact[] = input.facts
    .filter((f) => quoteInSource(f.quote, source.content))
    .filter((f) => !have.has(normalizeForMatch(f.quote)))
    .map((f) => ({ text: f.text, quote: f.quote, source_id: source.id, verified: true }));
  if (!picked.length) throw new Error("Pick at least one fact.");
  const before = snapshotOf(item);
  const facts = input.target === "facts" ? [...item.facts, ...picked] : item.facts;
  const context = input.target === "context" ? [...(c.context_facts ?? []), ...picked] : undefined;
  fail(
    (
      await from("ca_items")
        .update({
          facts,
          source_ids: [...new Set([...item.source_ids, source.id])],
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", itemId)
    ).error,
  );
  return enrichItem(itemId, {
    ...(context ? { context } : {}),
    note: input.note,
    before,
    reason: "rewrite",
  });
}

// ---------- "Fact Bite" from trusted websites ----------

// Searches the trusted sites with Tavily and keeps only facts quoted from the
// pages. Never fails the item: without a key or results the box is left out.
// Earlier stories this close are the same news again, not a related one.
const RELATED_MAX_SIMILARITY = 0.92;
const RELATED_MIN_SIMILARITY = 0.6;

// "Fact Bite": related recent developments of the same kind, first from
// the magazine's own stories of the last 12 months, then from trusted websites.
export async function findDidYouKnow(
  item: Pick<CaItem, "id" | "issue_date" | "category" | "facts" | "concept">,
  embedding: number[],
  headline: string,
): Promise<DykFact[]> {
  const settings = await getMagazineSettings();
  if (!settings.do_you_know || item.category === "editorial") return [];
  let found: DykFact[] = [];
  try {
    found = await relatedFromArchive(item, embedding, headline);
  } catch (e) {
    console.error("did you know (archive):", e);
  }
  if (found.length >= 2) return found;
  const web = await relatedFromWeb(item, headline, settings.trusted_domains);
  return [...found, ...web].slice(0, 3);
}

// More Fact Bite entries for the editor to choose from: related earlier
// stories of the magazine and pages of the trusted sites (searched for the
// editor's words, when given), leaving out what the box already has. Nothing
// is saved; the editor picks.
export async function suggestFactBites(itemId: string, search?: string): Promise<DykFact[]> {
  const item = await loadItem(itemId);
  const { trusted_domains } = await getMagazineSettings();
  const headline = item.content?.headline.en || item.headline;
  const { data } = await from("ca_items").select("embedding").eq("id", itemId).single();
  const raw = (data as { embedding: string | number[] | null } | null)?.embedding;
  const embedding = typeof raw === "string" ? (JSON.parse(raw) as number[]) : raw;
  const [archive, web] = await Promise.all([
    embedding && !search?.trim()
      ? relatedFromArchive(item, embedding, headline).catch((e) => {
          console.error("fact bite (archive):", e);
          return [];
        })
      : Promise.resolve([]),
    relatedFromWeb(
      search?.trim() ? { facts: item.facts, concept: search.trim() } : item,
      headline,
      trusted_domains,
    ),
  ]);
  const have = (item.content?.dyk ?? []).map((d) => normalizeForMatch(d.en || d.hi));
  const seen = new Set(have);
  return [...archive, ...web].filter((d) => {
    const k = normalizeForMatch(d.en || d.hi);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function relatedFromArchive(
  item: Pick<CaItem, "id" | "issue_date" | "facts">,
  embedding: number[],
  headline: string,
): Promise<DykFact[]> {
  const yearAgo = new Date(`${item.issue_date}T00:00:00Z`);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const { data, error } = await rpc("ca_similar_items", {
    p_embedding: embedding,
    p_from: yearAgo.toISOString().slice(0, 10),
    p_to: dayBefore(item.issue_date),
    p_exclude: item.id,
    p_count: 10,
  });
  fail(error);
  const near = ((data ?? []) as Similar[]).filter(
    (r) => r.similarity >= RELATED_MIN_SIMILARITY && r.similarity < RELATED_MAX_SIMILARITY,
  );
  if (!near.length) return [];
  const { data: rows } = await from("ca_items")
    .select("id,issue_date,headline,facts,category")
    .in(
      "id",
      near.map((r) => r.id),
    );
  const byId = new Map(
    ((rows ?? []) as Pick<CaItem, "id" | "issue_date" | "headline" | "facts" | "category">[])
      .filter((r) => r.category !== "editorial")
      .map((r) => [r.id, r]),
  );
  const stories: EarlierStory[] = near
    .map((r) => byId.get(r.id))
    .filter((r) => r !== undefined)
    .map((r) => ({ date: r.issue_date, headline: r.headline, facts: r.facts.map((f) => f.text) }));
  if (!stories.length) return [];
  return parseRelated(
    await saathiComplete(
      apiKey(),
      relatedMessages({ headline, facts: item.facts, stories, glossary: await glossaryNow() }),
    ),
    stories,
  );
}

async function relatedFromWeb(
  item: Pick<CaItem, "facts" | "concept">,
  headline: string,
  domains: string[],
): Promise<DykFact[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key || !domains.length) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: (item.concept ? `recent ${item.concept} India` : headline).slice(0, 380),
        search_depth: "basic",
        max_results: 3,
        include_domains: domains,
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
    return parseDyk(
      await saathiComplete(
        apiKey(),
        dykMessages({ headline, facts: item.facts, pages, glossary: await glossaryNow() }),
      ),
      pages,
    );
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
      glossary: await glossaryNow(),
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
        headline_bi: it?.content?.headline ?? { en: it?.headline ?? "", hi: "" },
      };
    })
    .filter((c) => c.item_date >= fromDate && c.item_date <= toDate);
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<CaItem, "category" | "status" | "position" | "content" | "importance">>,
) {
  if (patch.category && !isCategory(patch.category)) throw new Error("Unknown section");
  // The Static Context's books are its sources line.
  const sources =
    patch.content?.statics !== undefined
      ? { context_sources: staticSources(patch.content.statics) }
      : {};
  const { data, error } = await from("ca_items")
    .update({ ...patch, ...sources, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select(ITEM_COLS)
    .single();
  fail(error);
  return data as unknown as CaItem;
}

export const getItem = (id: string) => loadItem(id);

// "Write another" summary: three summaries of the length asked, from the
// story's facts and background. Nothing in the story changes until the
// editor picks one (saved like a hand edit, so History keeps the old one).
export async function suggestSummaries(
  itemId: string,
  opts: { words: number; note?: string | null; avoid?: Bi[] },
): Promise<{ summaries: Bi[]; dropped: number }> {
  const item = await loadItem(itemId);
  const c = item.content;
  if (!c) throw new Error("Write the story first.");
  const context = (c.context_facts ?? []).map((f) => f.text);
  const facts = item.facts.map((f) => f.text);
  const { style_rules, glossary } = await getMagazineSettings();
  const raw = await saathiComplete(
    apiKey(),
    summaryOptionsMessages({
      glossary,
      headline: c.headline.en || c.headline.hi || item.headline,
      facts,
      context,
      current: c.summary,
      words: opts.words,
      note: opts.note,
      avoid: opts.avoid,
      style: style_rules,
    }),
  );
  const known = [
    item.headline,
    c.headline.en,
    c.headline.hi,
    c.summary.en,
    c.summary.hi,
    ...facts,
    ...context,
    ...c.points.flatMap((p) => [p.en, p.hi]),
  ].join("\n");
  const r = parseSummaryOptions(raw, known);
  if (!r.summaries.length)
    throw new Error(
      r.dropped
        ? "SAATHI's summaries had numbers that aren't in the story's facts. Try again."
        : "The AI's reply could not be read. Try again.",
    );
  return r;
}

async function loadItem(id: string): Promise<CaItem> {
  const { data, error } = await from("ca_items").select(ITEM_COLS).eq("id", id).single();
  fail(error);
  return data as unknown as CaItem;
}

// ---------- The article reader: highlighting facts in the full source ----------

export type ReaderSource = {
  id: string;
  title: string;
  source_name: string;
  section: UploadSection;
  url: string | null;
  // The part of the text shown first, where it starts, and the full length.
  text: string;
  start: number;
  total: number;
  // Headings and pages of the whole source, for jumping around in it.
  outline: OutlineEntry[];
  // The day's other stories made from this source, with their quotes, so the
  // reader can show which articles of a newspaper page have no story yet.
  stories: { id: string; headline: string; dropped: boolean; quotes: string[] }[];
};

const READER_MAX = 30_000;

type SourceRow = Omit<ReaderSource, "text" | "start" | "total" | "outline" | "stories"> & {
  content: string;
};
const READER_SOURCE_COLS = "id,title,source_name,section,url,content";

// The stories made from these sources (except one), with their quotes.
async function storiesOn(sourceIds: string[], except: string | null) {
  let q = from("ca_items").select("id,headline,status,facts").overlaps("source_ids", sourceIds);
  if (except) q = q.neq("id", except);
  const { data } = await q.limit(300);
  return (data ?? []) as unknown as Pick<CaItem, "id" | "headline" | "status" | "facts">[];
}

function readerSource(
  { content, ...r }: SourceRow,
  [a, b]: Span,
  stories: Pick<CaItem, "id" | "headline" | "status" | "facts">[],
): ReaderSource {
  return {
    ...r,
    text: content.slice(a, b),
    start: a,
    total: content.length,
    outline: outline(content, isPaged(r.url)),
    stories: stories
      .map((o) => ({
        id: o.id,
        headline: o.headline,
        dropped: o.status === "dropped",
        quotes: o.facts.filter((f) => f.source_id === r.id).map((f) => f.quote),
      }))
      .filter((o) => o.quotes.length),
  };
}

// The story's sources, each opened around the story's quotes (short ones whole).
export async function itemReader(id: string): Promise<ReaderSource[]> {
  const item = await loadItem(id);
  if (!item.source_ids.length) return [];
  const { data, error } = await from("ca_sources")
    .select(READER_SOURCE_COLS)
    .in("id", item.source_ids);
  fail(error);
  const quotes = [...item.facts, ...(item.content?.context_facts ?? [])];
  const siblings = await storiesOn(item.source_ids, id);
  const rows = (data ?? []) as unknown as SourceRow[];
  return item.source_ids
    .map((sid) => rows.find((r) => r.id === sid))
    .filter((r): r is SourceRow => !!r)
    .map((r) => {
      const own = quotes.filter((f) => f.source_id === r.id).map((f) => f.quote);
      return readerSource(r, readerWindow(r.content, own), siblings);
    });
}

// One source, opened at one of its articles (skipped news, or read beside
// another source), or where a quote is when one is given.
export async function sourceReader(
  sourceId: string,
  at0: number,
  quote?: string,
): Promise<ReaderSource[]> {
  const { data, error } = await from("ca_sources")
    .select(READER_SOURCE_COLS)
    .eq("id", sourceId)
    .single();
  fail(error);
  const row = data as unknown as SourceRow;
  const len = row.content.length;
  const found = quote ? findQuote(row.content, quote) : null;
  const at = found ? found[0] : at0;
  const span: Span =
    len <= READER_WHOLE
      ? [0, len]
      : snapToLines(row.content, Math.max(0, at - READER_PAD), Math.min(len, at + 2 * READER_PAD));
  return [readerSource(row, span, await storiesOn([sourceId], null))];
}

// The day's other sources, for reading one beside the source open in the
// reader: each with its article most like what is being read (`query`), best
// matches first.
export type CompareSource = Omit<
  ReaderSource,
  "text" | "start" | "total" | "outline" | "stories"
> & {
  match: CompareMatch | null;
};

export async function compareSources(sourceId: string, query: string): Promise<CompareSource[]> {
  const { data: cur, error } = await from("ca_sources")
    .select("issue_date")
    .eq("id", sourceId)
    .single();
  fail(error);
  const { data, error: lErr } = await from("ca_sources")
    .select(READER_SOURCE_COLS)
    .eq("issue_date", (cur as unknown as { issue_date: string }).issue_date)
    .neq("id", sourceId)
    .order("created_at")
    .limit(60);
  fail(lErr);
  const rows = ((data ?? []) as unknown as SourceRow[])
    .filter((r) => r.content.trim())
    .map((r) => ({ row: r, articles: sourceArticles(r) }));
  const cosines = await articleMeanings(
    query,
    rows.map((r) => r.articles),
  );
  return rows
    .map(({ row: { content: _, ...r }, articles }, i) => ({
      ...r,
      match: bestArticle(query, articles, cosines[i]),
    }))
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
}

// How close in meaning each article is to the text being read (null when
// unknown): the same news in a Hindi and an English paper shares few words.
// Embeddings are cached for the process; a failure leaves word matching.
const MEANING_MAX = 300;
const meaningCache = new Map<string, number[]>();

async function articleMeanings(query: string, sources: ArticleText[][]) {
  const out = sources.map((list) => list.map((): number | null => null));
  const texts = sources.flatMap((list, s) => list.map((a, i) => ({ s, i, text: meaningText(a) })));
  const todo = texts.slice(0, MEANING_MAX);
  if (!query.trim() || !todo.length) return out;
  try {
    const want = [query.slice(0, 1500), ...todo.map((t) => t.text)];
    const missing = [...new Set(want.filter((t) => !meaningCache.has(t)))];
    if (missing.length) {
      const vectors = await saathiEmbedMany(apiKey(), missing);
      if (meaningCache.size + missing.length > 3000) meaningCache.clear();
      missing.forEach((t, k) => meaningCache.set(t, vectors[k]));
    }
    const q = meaningCache.get(want[0])!;
    for (const t of todo) out[t.s][t.i] = cosine(q, meaningCache.get(t.text)!);
  } catch (e) {
    console.error("compare by meaning:", saathiErrorDetail(e));
  }
  return out;
}

// Sources a story's highlights may come from: its own, and any other source
// of the same day (read beside them).
async function allowedSources(date: string, own: string[], wanted: string[]) {
  const ok = new Set(own);
  const extra = uniq(wanted.filter((id) => !ok.has(id)));
  if (extra.length) {
    const { data } = await from("ca_sources").select("id").in("id", extra).eq("issue_date", date);
    for (const r of (data ?? []) as { id: string }[]) ok.add(r.id);
  }
  return ok;
}

// The day's articles that no story uses: what the AI left out. Sources still
// being read are counted, not checked.
async function findSkipped(date: string): Promise<{ found: FoundArticle[]; reading: number }> {
  const { data, error } = await from("ca_sources")
    .select(`${READER_SOURCE_COLS},status`)
    .eq("issue_date", date)
    .order("created_at");
  fail(error);
  const all = (data ?? []) as unknown as (SourceRow & { status: CaSource["status"] })[];
  const rows = all.filter((r) => (r.status === "done" || r.status === "error") && r.content.trim());
  const reading = all.filter((r) => r.status === "new" || r.status === "extracting").length;
  if (!rows.length) return { found: [], reading };
  const { data: its, error: iErr } = await from("ca_items")
    .select("facts,source_ids,context_facts:content->context_facts")
    .overlaps(
      "source_ids",
      rows.map((r) => r.id),
    );
  fail(iErr);
  const items = (its ?? []) as unknown as (Pick<CaItem, "facts" | "source_ids"> & {
    context_facts: CaFact[] | null;
  })[];
  const found = rows.flatMap((r) => {
    const using = items.filter((i) => i.source_ids.includes(r.id));
    const quotes = using
      .flatMap((i) => [...i.facts, ...(i.context_facts ?? [])])
      .filter((f) => f.source_id === r.id)
      .map((f) => f.quote);
    return uncoveredArticles(r, quotes, using.length > 0, r.section === "dipr");
  });
  return { found: found.slice(0, 300), reading };
}

// The exam-value ranks given so far for a day's skipped news, by article.
// `counts`: how many skipped articles are worth a story and not ranked yet,
// as last worked out, for the day's checklist without reading every source.
// `hidden`: articles the editor marked "not needed" (on any device); they
// are not ranked or counted.
type SkippedCounts = { worth: number; unranked: number; at: string };
type SkippedRanks = {
  ranked_at: string;
  ranks: Record<string, SkippedRank>;
  counts?: SkippedCounts;
  hidden?: string[];
};

async function saveRanks(date: string, value: SkippedRanks) {
  const { error } = await from("bot_settings").upsert({
    key: ranksKey(date),
    value,
    updated_at: new Date().toISOString(),
  } as never);
  fail(error);
}

// What counts: articles worth a story, and not ranked yet, leaving out those
// marked "not needed".
function countSkipped(
  articles: { source_id: string; at: number }[],
  ranks: Record<string, SkippedRank>,
  hidden: Set<string>,
): SkippedCounts {
  const shown = articles.filter((a) => !hidden.has(skippedKey(a)));
  return {
    worth: shown.filter((a) => (ranks[skippedKey(a)]?.score ?? 0) >= 2).length,
    unranked: shown.filter((a) => !ranks[skippedKey(a)]).length,
    at: new Date().toISOString(),
  };
}
const ranksKey = (date: string) => `ca_skipped_rank:${date}`;

async function loadRanks(date: string): Promise<SkippedRanks | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", ranksKey(date))
    .maybeSingle();
  return (data as { value: SkippedRanks } | null)?.value ?? null;
}

export async function skippedNews(date: string): Promise<{
  articles: SkippedArticle[];
  reading: number;
  ranked_at: string | null;
}> {
  const [{ found, reading }, saved] = await Promise.all([findSkipped(date), loadRanks(date)]);
  const hidden = new Set(saved?.hidden ?? []);
  const articles = found.map(({ snippet: _, ...a }) => ({
    ...a,
    rank: saved?.ranks[skippedKey(a)] ?? null,
    hidden: hidden.has(skippedKey(a)),
  }));
  await saveCounts(date, saved, articles);
  return { articles, reading, ranked_at: saved?.ranked_at ?? null };
}

// Marks skipped articles "not needed" (or needed again), for every device.
export async function setSkippedHidden(date: string, keys: string[], hide: boolean) {
  const saved = await loadRanks(date);
  const before = new Set(saved?.hidden ?? []);
  const changed = keys.filter((k) => before.has(k) !== hide);
  const hidden = new Set(before);
  for (const k of changed) {
    if (hide) hidden.add(k);
    else hidden.delete(k);
  }
  // The counts follow without reading the sources again: the articles were
  // just listed as skipped.
  const ranks = saved?.ranks ?? {};
  const step = hide ? -1 : 1;
  const counts = saved?.counts && {
    worth: Math.max(
      0,
      saved.counts.worth + step * changed.filter((k) => (ranks[k]?.score ?? 0) >= 2).length,
    ),
    unranked: Math.max(0, saved.counts.unranked + step * changed.filter((k) => !ranks[k]).length),
    at: new Date().toISOString(),
  };
  await saveRanks(date, {
    ranked_at: saved?.ranked_at ?? "",
    ranks,
    hidden: [...hidden],
    ...(counts ? { counts } : {}),
  });
  return { hidden: [...hidden] };
}

// Keeps the day's counts up to date (only written when they change).
async function saveCounts(
  date: string,
  saved: SkippedRanks | null,
  articles: { source_id: string; at: number }[],
) {
  const counts = countSkipped(articles, saved?.ranks ?? {}, new Set(saved?.hidden ?? []));
  if (saved?.counts?.worth === counts.worth && saved.counts.unranked === counts.unranked) return;
  try {
    await saveRanks(date, {
      ranked_at: saved?.ranked_at ?? "",
      ranks: saved?.ranks ?? {},
      ...(saved?.hidden ? { hidden: saved.hidden } : {}),
      counts,
    });
  } catch (e) {
    console.error("skipped news counts:", e instanceof Error ? e.message : e);
  }
}

// The day's skipped-news counts as last worked out (no sources are read).
export async function skippedSummary(date: string): Promise<SkippedCounts | null> {
  return (await loadRanks(date))?.counts ?? null;
}

// Ranks the day's skipped articles that have no rank yet, by their value for
// the exam: one AI call for up to RANK_MAX of them.
export async function rankSkipped(date: string): Promise<{ ranked: number; left: number }> {
  const [{ found }, saved] = await Promise.all([findSkipped(date), loadRanks(date)]);
  const ranks = { ...(saved?.ranks ?? {}) };
  const hidden = new Set(saved?.hidden ?? []);
  // Articles marked "not needed" are not ranked.
  const todo = found.filter((a) => !ranks[skippedKey(a)] && !hidden.has(skippedKey(a)));
  if (!todo.length) {
    // Nothing new to rank: the counts still follow the stories made since.
    await saveCounts(date, saved, found);
    return { ranked: 0, left: 0 };
  }
  const batch = todo.slice(0, RANK_MAX);
  const parsed = parseRanks(await saathiComplete(apiKey(), rankMessages(batch)), batch.length);
  if (!parsed) throw new Error("The AI's reply could not be read. Try again.");
  let ranked = 0;
  batch.forEach((a, i) => {
    const r = parsed[i];
    if (r) {
      ranks[skippedKey(a)] = r;
      ranked++;
    }
  });
  // Ranks of articles no longer skipped (made into stories) are dropped.
  const live = new Set(found.map(skippedKey));
  const kept = Object.fromEntries(Object.entries(ranks).filter(([k]) => live.has(k)));
  await saveRanks(date, {
    ranked_at: new Date().toISOString(),
    ranks: kept,
    ...(saved?.hidden ? { hidden: saved.hidden.filter((k) => live.has(k)) } : {}),
    counts: countSkipped(found, kept, hidden),
  });
  return { ranked, left: todo.length - ranked };
}

// The day's checklist as the server sees it (what was opened in the review
// list is only known in the browser), for the "draft ready" message.
export async function dayChecks(date: string): Promise<Check[]> {
  const [day, settings, counts, style, lang] = await Promise.all([
    getDay(date),
    getMagazineSettings(),
    skippedSummary(date),
    getStyleCheck(date),
    getLangCheck(date),
  ]);
  return dayChecklist({
    items: day.items,
    reviewed: null,
    unfinishedSources: day.sources.filter((s) => s.chunks_done < s.chunks).length,
    corrections: day.corrections.filter((c) => c.item_date === date).length,
    skipped: counts,
    minRajasthan: settings.min_rajasthan,
    target: settings.daily_stories,
    style: styleStatus(style, day.items, settings.style_rules),
    lang: langStatus(lang, day.items, settings.glossary),
  });
}

// "What's missing?": the facts an examiner asks for that the highlights don't
// cover, with where this source states them. One AI call, on request.
// With no story (skipped news), the source's article is checked on its own.
// `article`: the part of the source the reader shows as one article.
// "Suggest facts": the exam facts in the article being read, as its own
// words (one AI request; nothing saved).
export async function suggestMarks(
  id: string | null,
  sourceId: string,
  marked: string[],
  article?: Span,
): Promise<SuggestedMark[]> {
  const item = id ? await loadItem(id) : null;
  if (item && !item.source_ids.includes(sourceId)) {
    throw new Error("That source isn't part of this story");
  }
  const { data, error } = await from("ca_sources")
    .select("title,content")
    .eq("id", sourceId)
    .single();
  fail(error);
  const { title, content } = data as unknown as { title: string; content: string };
  // The article shown, or the part around the story's facts.
  const spans = (item?.facts ?? [])
    .filter((f) => f.source_id === sourceId)
    .map((f) => findQuote(content, f.quote))
    .filter((x): x is Span => !!x);
  let from0 = spans.length ? Math.max(0, Math.min(...spans.map((x) => x[0])) - 4000) : 0;
  let to0 = Math.min(content.length, from0 + 16_000);
  if (article) {
    from0 = Math.max(0, Math.min(article[0], content.length));
    to0 = Math.min(content.length, Math.max(from0, article[1]), from0 + 16_000);
  }
  const [a, b] = snapToLines(content, from0, to0);
  const text = content.slice(a, b);
  const raw = await saathiComplete(
    apiKey(),
    suggestMarksMessages({
      headline: item ? item.content?.headline.en || item.headline : title,
      article: text,
      marked,
    }),
  );
  return parseSuggestedMarks(raw, text, marked);
}

export async function checkMissing(
  id: string | null,
  sourceId: string,
  highlights: string[],
  article?: Span,
): Promise<MissingCheck> {
  const item = id ? await loadItem(id) : null;
  if (item && !item.source_ids.includes(sourceId)) {
    throw new Error("That source isn't part of this story");
  }
  const { data, error } = await from("ca_sources")
    .select("title,content")
    .eq("id", sourceId)
    .single();
  fail(error);
  const { title, content } = data as unknown as { title: string; content: string };
  // The article around the highlights (and the story's facts), not a whole newspaper.
  const anchors = [
    ...highlights,
    ...(item?.facts ?? []).filter((f) => f.source_id === sourceId).map((f) => f.quote),
  ];
  const spans = anchors.map((q) => findQuote(content, q)).filter((x): x is Span => !!x);
  let from0 = spans.length ? Math.max(0, Math.min(...spans.map((x) => x[0])) - 5000) : 0;
  let to0 = Math.min(
    content.length,
    spans.length ? Math.max(...spans.map((x) => x[1])) + 5000 : 16_000,
    from0 + 16_000,
  );
  if (article) {
    from0 = Math.max(0, Math.min(article[0], content.length));
    to0 = Math.min(content.length, Math.max(from0, article[1]), from0 + 16_000);
  }
  const [a, b] = snapToLines(content, from0, to0);
  const slotOf = (q: string) =>
    item?.facts.find((f) => normalizeForMatch(f.quote) === normalizeForMatch(q))?.slot;
  const raw = await saathiComplete(
    apiKey(),
    missingMessages({
      headline: item ? item.content?.headline.en || item.headline : title,
      category: item?.category ?? "news",
      highlights: highlights.map((quote) => ({ quote, slot: slotOf(quote) })),
      article: content.slice(a, b),
    }),
  );
  const parsed = parseMissing(raw, content, highlights);
  if (!parsed) throw new Error("The AI's reply could not be read. Try again.");
  return parsed;
}

// More of a long source, as the reader scrolls past what it has.
export async function readerText(
  sourceId: string,
  start: number,
  end: number,
): Promise<{ text: string; start: number; end: number; total: number }> {
  const { data, error } = await from("ca_sources").select("content").eq("id", sourceId).single();
  fail(error);
  const content = (data as unknown as { content: string }).content;
  const from0 = Math.max(0, Math.min(start, content.length));
  const to0 = Math.min(content.length, Math.max(from0, end), from0 + READER_MAX);
  const [a, b] = snapToLines(content, from0, to0);
  return { text: content.slice(a, b), start: a, end: b, total: content.length };
}

async function sourceTexts(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await from("ca_sources").select("id,content").in("id", ids);
  fail(error);
  return new Map(((data ?? []) as { id: string; content: string }[]).map((r) => [r.id, r.content]));
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

// Rewrites a story from the facts the editor highlighted in its sources:
// "point" highlights become its key points, the rest only guide the summary
// and "why it matters".
export async function rewriteFromHighlights(
  id: string,
  highlights: Highlight[],
  note: string | null,
  keywords: string[] = [],
): Promise<CaItem> {
  const item = await loadItem(id);
  await assertDayEditable([item.issue_date]);
  const ok = await allowedSources(
    item.issue_date,
    item.source_ids,
    highlights.map((h) => h.source_id),
  );
  const allowed = highlights.filter((h) => ok.has(h.source_id));
  const texts = await sourceTexts(uniq(allowed.map((h) => h.source_id)));
  const { facts, context } = factsFromHighlights(allowed, texts, [
    ...item.facts,
    ...(item.content?.context_facts ?? []),
  ]);
  if (!facts.length) throw new Error("Mark at least one highlight as a key point.");

  // Pending corrections follow their facts to the new positions.
  const { data: pending } = await from("ca_corrections")
    .select("id,changes")
    .eq("item_id", id)
    .eq("status", "pending");
  for (const c of (pending ?? []) as Pick<CaCorrection, "id" | "changes">[]) {
    const changes = remapChanges(c.changes, item.facts, facts);
    fail(
      (
        await from("ca_corrections")
          .update((changes ? { changes } : { status: "rejected" }) as never)
          .eq("id", c.id)
      ).error,
    );
  }

  const { error } = await from("ca_items")
    .update({
      facts,
      source_ids: uniq([...facts, ...context].map((f) => f.source_id)),
      needs_enrich: true,
      enrich_error: null,
      ...(item.content ? { content: { ...item.content, context_facts: context } } : {}),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  fail(error);
  return withKeywords(
    await enrichItem(id, { context, note, before: snapshotOf(item), reason: "rewrite" }),
    keywords,
  );
}

// New key points from the reader's highlights (in the story's sources or
// another source of its day), added to the written story without writing it
// again: one small AI call words them, and everything else stays.
// The new key points highlights would add, and SAATHI's points for them
// (nothing saved): shown before they are added.
export async function previewPoints(
  id: string,
  highlights: Highlight[],
): Promise<{ facts: CaFact[]; points: Bi[] }> {
  const item = await loadItem(id);
  const { fresh, points } = await newPoints(item, highlights);
  return { facts: fresh, points };
}

async function newPoints(
  item: CaItem,
  highlights: Highlight[],
  given?: Bi[],
): Promise<{ fresh: CaFact[]; points: Bi[] }> {
  const c = item.content;
  if (!c) throw new Error("Write the story first.");
  const ok = await allowedSources(
    item.issue_date,
    item.source_ids,
    highlights.map((h) => h.source_id),
  );
  const allowed = highlights.filter((h) => h.point && ok.has(h.source_id));
  const texts = await sourceTexts(uniq(allowed.map((h) => h.source_id)));
  const have = new Set(item.facts.map((f) => normalizeForMatch(f.quote)));
  const room = STORY_POINTS_MAX - item.facts.length;
  if (room <= 0) throw new Error(`This story already has ${STORY_POINTS_MAX} key points.`);
  const fresh = factsFromHighlights(allowed, texts, [])
    .facts.filter((f) => !have.has(normalizeForMatch(f.quote)))
    .slice(0, Math.min(room, ADD_POINTS_MAX));
  if (!fresh.length) throw new Error("Highlight a new key point first.");
  // Points the editor saw (and maybe changed) in the preview are kept.
  if (given?.length === fresh.length && given.every((p) => p.en.trim() && p.hi.trim()))
    return { fresh, points: given };
  const points = parsePoints(
    await saathiComplete(
      apiKey(),
      pointsMessages({
        glossary: await glossaryNow(),
        headline: c.headline.en || c.headline.hi || item.headline,
        summary: c.summary.en || c.summary.hi,
        points: c.points.map((p) => p.en || p.hi),
        facts: fresh,
        style: (await getMagazineSettings()).style_rules,
      }),
    ),
    fresh.length,
  );
  if (!points) throw new Error("The AI's reply could not be read. Try again.");
  return { fresh, points };
}

export async function addPointsFromHighlights(
  id: string,
  highlights: Highlight[],
  keywords: string[] = [],
  given?: Bi[],
): Promise<CaItem> {
  const item = await loadItem(id);
  const c = item.content;
  if (!c) throw new Error("Write the story first.");
  await assertDayEditable([item.issue_date]);
  const { fresh, points } = await newPoints(item, highlights, given);
  const before = snapshotOf(item);
  const { data, error } = await from("ca_items")
    .update({
      facts: [...item.facts, ...fresh],
      source_ids: uniq([...item.source_ids, ...fresh.map((f) => f.source_id)]),
      content: { ...c, points: [...c.points, ...points] },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .select(ITEM_COLS)
    .single();
  fail(error);
  if (before) await saveVersion(id, before, "points");
  return withKeywords(data as unknown as CaItem, keywords);
}

// A new story from highlights in another story's sources, or in a source no
// story uses (news the AI skipped), written at once. It goes right after the
// story it came from, or at the end of the source's day.
export async function createFromHighlights(
  from0: { itemId: string } | { sourceId: string },
  highlights: Highlight[],
  note: string | null,
  keywords: string[] = [],
): Promise<CaItem> {
  let origin: { issue_date: string; position: number; source_ids: string[] };
  if ("itemId" in from0) origin = await loadItem(from0.itemId);
  else {
    const { data, error } = await from("ca_sources")
      .select("issue_date")
      .eq("id", from0.sourceId)
      .single();
    fail(error);
    const date = (data as unknown as { issue_date: string }).issue_date;
    const { data: last } = await from("ca_items")
      .select("position")
      .eq("issue_date", date)
      .order("position", { ascending: false })
      .limit(1);
    const top = ((last ?? []) as { position: number }[])[0]?.position ?? -1;
    origin = { issue_date: date, position: top, source_ids: [from0.sourceId] };
  }
  await assertDayEditable([origin.issue_date]);
  const ok = await allowedSources(
    origin.issue_date,
    origin.source_ids,
    highlights.map((h) => h.source_id),
  );
  const allowed = highlights.filter((h) => ok.has(h.source_id));
  const texts = await sourceTexts(uniq(allowed.map((h) => h.source_id)));
  const { facts, context } = factsFromHighlights(allowed, texts, []);
  if (!facts.length) throw new Error("Mark at least one highlight as a key point.");
  const story = parseNewStory(
    await saathiComplete(
      apiKey(),
      newStoryMessages(
        facts.map((f) => f.text),
        note,
      ),
    ),
    facts[0].text,
  );

  // Make room right after the story it came from.
  const { data: later } = await from("ca_items")
    .select("id,position")
    .eq("issue_date", origin.issue_date)
    .gt("position", origin.position);
  for (const r of (later ?? []) as { id: string; position: number }[]) {
    fail(
      (
        await from("ca_items")
          .update({ position: r.position + 1 } as never)
          .eq("id", r.id)
      ).error,
    );
  }
  const { data: created, error } = await from("ca_items")
    .insert({
      issue_date: origin.issue_date,
      status: "included",
      ...story,
      facts,
      source_ids: uniq([...facts, ...context].map((f) => f.source_id)),
      position: origin.position + 1,
    } as never)
    .select("id")
    .single();
  fail(error);
  return withKeywords(
    await enrichItem((created as unknown as { id: string }).id, { context, note }),
    keywords,
  );
}

// ---------- Story versions: undoing a rewrite ----------

// What writing a story changes, saved before each rewrite so it can be undone.
export type CaSnapshot = Pick<
  CaItem,
  "facts" | "source_ids" | "content" | "context_sources" | "syllabus_topic_id" | "unit"
>;
export type CaVersion = {
  id: string;
  created_at: string;
  // "write": written again; "rewrite": from the reader's highlights;
  // "restore": the story as it was before an older version was restored;
  // "edit": before the admin's own changes (one per editing session);
  // "correction": before an approved correction; "points": before key points
  // were added from the reader.
  reason: "write" | "rewrite" | "restore" | "edit" | "correction" | "points";
  headline: string;
  snapshot: CaSnapshot;
};
export const VERSIONS_KEPT = 10;

const snapshotOf = (item: CaItem): CaSnapshot | null =>
  item.content
    ? {
        facts: item.facts,
        source_ids: item.source_ids,
        content: item.content,
        context_sources: item.context_sources,
        syllabus_topic_id: item.syllabus_topic_id,
        unit: item.unit,
      }
    : null;

// Keeps the story as it was, and only the latest few versions. Versions are a
// safety net: a failure here (the table not created yet) never stops the
// rewrite itself.
async function saveVersion(itemId: string, snap: CaSnapshot, reason: CaVersion["reason"]) {
  try {
    fail(
      (
        await from("ca_item_versions").insert({
          item_id: itemId,
          reason,
          headline: snap.content?.headline.en || snap.content?.headline.hi || "",
          snapshot: snap,
        } as never)
      ).error,
    );
    const { data } = await from("ca_item_versions")
      .select("id")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .range(VERSIONS_KEPT, VERSIONS_KEPT + 100);
    const old = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (old.length) await from("ca_item_versions").delete().in("id", old);
  } catch (e) {
    console.error("story version not saved:", (e instanceof Error && e.message) || e);
  }
}

// The admin's own changes keep the story as it was before them: one version
// per editing session, so a run of small edits doesn't push out the rewrites.
export const EDIT_SESSION_MS = 30 * 60_000;

export async function asEdit<T>(itemId: string, change: () => Promise<T>): Promise<T> {
  const before = await loadItem(itemId).catch(() => null);
  const result = await change();
  const snap = before && snapshotOf(before);
  if (snap) {
    const { data, error } = await from("ca_item_versions")
      .select("reason,created_at")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = ((data ?? []) as Pick<CaVersion, "reason" | "created_at">[])[0];
    const sameSession =
      last?.reason === "edit" && Date.now() - Date.parse(last.created_at) < EDIT_SESSION_MS;
    if (!error && !sameSession) await saveVersion(itemId, snap, "edit");
  }
  return result;
}

// The story's earlier versions, newest first.
export async function listVersions(itemId: string): Promise<CaVersion[]> {
  const { data, error } = await from("ca_item_versions")
    .select("id,created_at,reason,headline,snapshot")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(VERSIONS_KEPT);
  if (error) {
    console.error("story versions:", error.message);
    return [];
  }
  return (data ?? []) as unknown as CaVersion[];
}

// Puts an earlier version back (the latest one when no id is given). The
// story as it is now becomes a version, so a restore can be undone too.
export async function restoreVersion(itemId: string, versionId?: string): Promise<CaItem> {
  const item = await loadItem(itemId);
  await assertDayEditable([item.issue_date]);
  let q = from("ca_item_versions").select("id,snapshot").eq("item_id", itemId);
  q = versionId ? q.eq("id", versionId) : q.order("created_at", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error("Story history isn't available yet.");
  if (!data) throw new Error("That version is no longer saved.");
  const v = data as unknown as Pick<CaVersion, "id" | "snapshot">;
  const snap = v.snapshot;

  // Pending corrections follow their facts back.
  const { data: pending } = await from("ca_corrections")
    .select("id,changes")
    .eq("item_id", itemId)
    .eq("status", "pending");
  for (const c of (pending ?? []) as Pick<CaCorrection, "id" | "changes">[]) {
    const changes = remapChanges(c.changes, item.facts, snap.facts);
    fail(
      (
        await from("ca_corrections")
          .update((changes ? { changes } : { status: "rejected" }) as never)
          .eq("id", c.id)
      ).error,
    );
  }

  // The search embedding follows the facts; a failure keeps the old one.
  const embedding = await embedOne(storyText({ headline: item.headline, facts: snap.facts })).catch(
    () => null,
  );
  const { data: saved, error: uErr } = await from("ca_items")
    .update({
      facts: snap.facts,
      source_ids: snap.source_ids,
      content: snap.content,
      context_sources: snap.context_sources,
      syllabus_topic_id: snap.syllabus_topic_id,
      unit: snap.unit,
      ...(embedding ? { embedding: embedding as unknown as string } : {}),
      needs_enrich: false,
      enrich_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", itemId)
    .select(ITEM_COLS)
    .single();
  fail(uErr);
  await from("ca_item_versions").delete().eq("id", v.id);
  const now = snapshotOf(item);
  if (now) await saveVersion(itemId, now, "restore");
  return saved as unknown as CaItem;
}

// ---------- Static Context ----------

const keywordBi = (k: string): Bi =>
  /[\u0900-\u097F]/.test(k) ? { en: "", hi: k } : { en: k, hi: "" };

// Keywords the editor marked with the green pen: written as Static Context
// facts while there is room, the rest offered as keywords. A failure here
// never undoes the story that was just written.
export async function withKeywords(item: CaItem, keywords: string[]): Promise<CaItem> {
  const list = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].map(keywordBi);
  if (!list.length || !item.content) return item;
  const room = MAX_STATICS - (item.content.statics?.length ?? 0);
  try {
    if (room > 0) item = await addStaticFacts(item.id, list.slice(0, room));
  } catch (e) {
    console.error("static connect keywords:", saathiErrorDetail(e));
  }
  const c = item.content!;
  const keywordsNow = mergeKeywords([...(c.keywords ?? []), ...list], c.statics ?? []);
  return keywordsNow.length === (c.keywords ?? []).length
    ? item
    : updateItem(item.id, { content: { ...c, keywords: keywordsNow } });
}

async function keywordPassages(key: string, keyword: Bi, subjects: string[]) {
  if (!subjects.length) return [];
  const query = {
    standalone: (keyword.en || keyword.hi).slice(0, 300),
    english: keyword.en ? keyword.en.slice(0, 300) : null,
  };
  const matches = relevantMatches(await saathiSearchQuery(key, rpc, query, subjects));
  return matches.slice(0, 3);
}

// Writes Static Context facts for the keywords the admin picked (from the
// books when they explain them, otherwise SAATHI's own knowledge).
export async function addStaticFacts(id: string, keywords: Bi[]): Promise<CaItem> {
  const item = await loadItem(id);
  const c = item.content;
  if (!c) throw new Error("Write the story first.");
  const key = apiKey();
  const subjects = await studySubjects();
  const found = await Promise.all(
    keywords.map(async (keyword) => ({
      keyword,
      passages: (await keywordPassages(key, keyword, subjects)).map((m) => ({
        title: matchLabel(m),
        content: m.content,
      })),
    })),
  );
  const { messages, kbTitles } = staticFactsMessages({
    glossary: await glossaryNow(),
    headline: c.headline.en || item.headline,
    facts: item.facts.map((f) => f.text),
    keywords: found,
  });
  const added = parseStaticFacts(await saathiComplete(key, messages), keywords, kbTitles);
  if (!added.length) throw new Error("The AI's reply could not be read. Try again.");
  const statics = mergeStatics(c.statics ?? [], added);
  return updateItem(id, {
    content: {
      ...c,
      statics,
      keywords: mergeKeywords(c.keywords ?? [], statics),
      statics_edited: true,
    },
  });
}

// For each suggested keyword, the book that covers it, if any: a passage
// from the search that names the keyword.
export async function keywordBooks(id: string): Promise<{ keyword: Bi; book: string | null }[]> {
  const item = await loadItem(id);
  const keywords = item.content?.keywords ?? [];
  const key = apiKey();
  const subjects = await studySubjects();
  return Promise.all(
    keywords.map(async (keyword) => {
      const names = [keyword.en, keyword.hi].map(normalizeForMatch).filter((n) => n.length >= 3);
      const hit = (await keywordPassages(key, keyword, subjects)).find((m) =>
        names.some((n) => normalizeForMatch(m.content).includes(n)),
      );
      return { keyword, book: hit ? matchLabel(hit) : null };
    }),
  );
}

// A fact the editor checked by hand (it stays marked as such, for the weekly
// report), or wants checked again.
function markChecked(f: CaFact, checked: boolean): CaFact {
  if (checked) return { ...f, verified: true, checked: true };
  const { checked: _, ...rest } = f;
  return { ...rest, verified: false };
}

// The editor checked a fact against the source (or wants it checked again).
export async function setFactChecked(
  id: string,
  factText: string,
  checked: boolean,
): Promise<CaItem> {
  const item = await loadItem(id);
  const index = item.facts.findIndex((f) => f.text === factText);
  if (index < 0) throw new Error("That fact is no longer in the story");
  const facts = item.facts.map((f, i) => (i === index ? markChecked(f, checked) : f));
  const { data, error } = await from("ca_items")
    .update({ facts, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select(ITEM_COLS)
    .single();
  fail(error);
  return data as unknown as CaItem;
}

// ---------- House style ----------

// The editor's changes to SAATHI's drafts in the last days: for each story
// edited by hand, its text before the first edit against its text now.
// Stories written again by SAATHI after that edit are left out (their text
// now isn't the editor's).
export async function styleEdits(days = 7): Promise<EditPair[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await from("ca_item_versions")
    .select("item_id,reason,created_at,snapshot")
    .gte("created_at", since)
    .order("created_at")
    .limit(500);
  if (error) return [];
  const rows = (data ?? []) as {
    item_id: string;
    reason: CaVersion["reason"];
    snapshot: CaSnapshot;
  }[];
  const first = new Map<string, CaSnapshot>();
  const rewritten = new Set<string>();
  for (const v of rows) {
    if (v.reason === "edit" && !first.has(v.item_id)) first.set(v.item_id, v.snapshot);
    else if (first.has(v.item_id) && ["rewrite", "write", "restore", "points"].includes(v.reason))
      rewritten.add(v.item_id);
  }
  const ids = [...first.keys()].filter((id) => !rewritten.has(id));
  if (!ids.length) return [];
  const { data: items } = await from("ca_items").select("id,content").in("id", ids);
  return ((items ?? []) as Pick<CaItem, "id" | "content">[]).flatMap((it) => {
    const was = first.get(it.id)?.content;
    return was && it.content ? editPairs(was, it.content) : [];
  });
}

const STYLE_KEY = "ca_style_suggestions";
export type StyleSuggestions = { at: string; edits: number; rules: StyleSuggestion[] };

// Rules SAATHI suggests from the week's edits (one AI call). They wait for
// the editor in Magazine settings; nothing changes until one is added.
export async function suggestStyleRules(): Promise<StyleSuggestions> {
  const pairs = await styleEdits();
  if (pairs.length < STYLE_MIN_EDITS) {
    throw new Error(
      `Not enough edits this week to see a style yet (${pairs.length}; at least ${STYLE_MIN_EDITS} changes needed).`,
    );
  }
  const { style_rules } = await getMagazineSettings();
  const rules = parseStyleRules(
    await saathiComplete(apiKey(), styleMessages(pairs, style_rules)),
    style_rules,
  );
  if (!rules) throw new Error("The AI's reply could not be read. Try again.");
  const value: StyleSuggestions = { at: new Date().toISOString(), edits: pairs.length, rules };
  fail(
    (
      await from("bot_settings").upsert({
        key: STYLE_KEY,
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return value;
}

// Hindi lines the editor changed in the last days, with the English of the
// same part, for glossary suggestions.
export async function hindiEdits(days = 30): Promise<HindiEdit[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await from("ca_item_versions")
    .select("item_id,reason,created_at,snapshot")
    .gte("created_at", since)
    .eq("reason", "edit")
    .order("created_at")
    .limit(500);
  if (error) return [];
  const first = new Map<string, CaSnapshot>();
  for (const v of (data ?? []) as { item_id: string; snapshot: CaSnapshot }[])
    if (!first.has(v.item_id)) first.set(v.item_id, v.snapshot);
  if (!first.size) return [];
  const { data: items } = await from("ca_items")
    .select("id,content")
    .in("id", [...first.keys()]);
  return ((items ?? []) as Pick<CaItem, "id" | "content">[]).flatMap((it) => {
    const was = first.get(it.id)?.content;
    if (!was || !it.content) return [];
    const now = it.content;
    const pairs: [Bi | null | undefined, Bi | null | undefined][] = [
      [was.headline, now.headline],
      [was.summary, now.summary],
      [was.why, now.why],
      ...was.points.map((p, i) => [p, now.points[i]] as [Bi, Bi | undefined]),
    ];
    return pairs.flatMap(([a, b]) =>
      a?.hi?.trim() && b?.hi?.trim() && b.en?.trim() && a.hi.trim() !== b.hi.trim()
        ? [
            {
              en: b.en.trim().slice(0, 300),
              before: a.hi.trim().slice(0, 300),
              after: b.hi.trim().slice(0, 300),
            },
          ]
        : [],
    );
  });
}

// Glossary entries SAATHI suggests from the Hindi the editor corrected
// (one AI call); nothing is added until the editor picks one.
export async function suggestGlossary(): Promise<GlossarySuggestion[]> {
  const edits = await hindiEdits();
  if (edits.length < GLOSSARY_MIN_EDITS)
    throw new Error(
      `Not enough Hindi edits in the last 30 days to see a pattern yet (${edits.length}; at least ${GLOSSARY_MIN_EDITS} needed).`,
    );
  const { glossary } = await getMagazineSettings();
  const terms = parseGlossary(
    await saathiComplete(apiKey(), glossaryMessages(edits, glossary)),
    glossary,
  );
  if (!terms) throw new Error("The AI's reply could not be read. Try again.");
  return terms;
}

export async function saveGlossary(entries: GlossaryEntry[]): Promise<GlossaryEntry[]> {
  const glossary = normalizeGlossary(entries);
  await saveMagazineSettings({ glossary });
  return glossary;
}

export async function styleSuggestions(): Promise<StyleSuggestions | null> {
  const { data } = await from("bot_settings").select("value").eq("key", STYLE_KEY).maybeSingle();
  return (data as { value: StyleSuggestions } | null)?.value ?? null;
}

export async function saveStyleRules(rules: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const clean = rules
    .map((r) => r.replace(/\s+/g, " ").trim().slice(0, 200))
    .filter((r) => {
      const k = normalizeForMatch(r);
      if (r.length < 3 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, STYLE_RULES_MAX);
  return (await saveMagazineSettings({ style_rules: clean })).style_rules;
}

// ---------- House style check before scheduling ----------

const styleCheckKey = (date: string) => `ca_style_check:${date}`;

export async function getStyleCheck(date: string): Promise<StyleCheck | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", styleCheckKey(date))
    .maybeSingle();
  return (data as { value: StyleCheck } | null)?.value ?? null;
}

async function saveStyleCheck(date: string, value: StyleCheck) {
  fail(
    (
      await from("bot_settings").upsert({
        key: styleCheckKey(date),
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}

// Checks the day's written stories against the house style rules (one AI
// call): the stories not yet checked as they are now, or all of them when the
// rules changed. Notes on stories that weren't checked again are kept.
export async function checkStyle(
  date: string,
): Promise<{ check: StyleCheck; checked: number; found: number; left: number }> {
  const { style_rules: rules } = await getMagazineSettings();
  if (!rules.length) throw new Error("Add your house style rules in Magazine settings first.");
  const { data, error } = await from("ca_items")
    .select("id,category,position,content")
    .eq("issue_date", date)
    .eq("status", "included");
  fail(error);
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const items = (
    (data ?? []) as unknown as Pick<CaItem, "id" | "category" | "position" | "content">[]
  )
    .filter((i): i is typeof i & { content: CaContent } => !!i.content)
    .sort(
      (a, b) =>
        (order.get(normalizeCategory(a.category)) ?? 99) -
          (order.get(normalizeCategory(b.category)) ?? 99) || a.position - b.position,
    );
  const saved = await getStyleCheck(date);
  const key = rulesFingerprint(rules);
  const same = saved?.rules === key ? saved : null;
  const todo = items.filter((i) => same?.stories[i.id] !== storyFingerprint(i.content));
  const batch = todo.slice(0, STYLE_CHECK_STORIES);
  const found = batch.length
    ? parseStyleBreaks(
        await saathiComplete(apiKey(), styleCheckMessages(rules, batch)),
        rules,
        batch,
      )
    : [];
  if (!found) throw new Error("The AI's reply could not be read. Try again.");
  const live = new Set(items.map((i) => i.id));
  const done = new Set(batch.map((i) => i.id));
  const value: StyleCheck = {
    at: new Date().toISOString(),
    rules: key,
    stories: {
      ...Object.fromEntries(Object.entries(same?.stories ?? {}).filter(([id]) => live.has(id))),
      ...Object.fromEntries(batch.map((i) => [i.id, storyFingerprint(i.content)])),
    },
    breaks: [
      ...(same?.breaks ?? []).filter((b) => live.has(b.item_id) && !done.has(b.item_id)),
      ...found,
    ],
    dismissed: (saved?.dismissed ?? []).slice(-200),
    tally: tallyFound(saved, found),
  };
  await saveStyleCheck(date, value);
  const waved = new Set(value.dismissed);
  return {
    check: value,
    checked: batch.length,
    found: found.filter((b) => !waved.has(b.id)).length,
    left: todo.length - batch.length,
  };
}

// Puts the AI's suggested text in place of the part that breaks a rule, kept
// in the story's History like the editor's own edits.
export async function applyStyleFix(date: string, breakId: string): Promise<CaItem> {
  const saved = await getStyleCheck(date);
  const b = saved?.breaks.find((x) => x.id === breakId);
  if (!saved || !b) throw new Error("That house style note is no longer there. Check again.");
  const item = await loadItem(b.item_id);
  await assertDayEditable([item.issue_date]);
  const content = item.content;
  if (!content || partText(content, b.part, b.lang) !== b.text) {
    throw new Error("That part of the story has changed since the check. Check again.");
  }
  const fixed = await syncLanguages(
    content,
    withPart(content, b.part, b.lang, b.fix),
    headlineOf(item),
  );
  const updated = await asEdit(item.id, () => updateItem(item.id, { content: fixed }));
  if (updated.content) await saveStyleCheck(date, afterFix(saved, b, content, updated.content));
  return updated;
}

// "It's fine": the note stays out of the list (and out of later checks that
// find the same thing in the same text).
export async function dismissStyleBreak(date: string, breakId: string): Promise<StyleCheck> {
  const saved = await getStyleCheck(date);
  const b = saved?.breaks.find((x) => x.id === breakId);
  if (!saved || !b) throw new Error("That house style note is no longer there.");
  const next = afterKeep(saved, b);
  await saveStyleCheck(date, next);
  return next;
}

// ---------- Hindi and English saying the same thing ----------

const langCheckKey = (date: string) => `ca_lang_check:${date}`;

export async function getLangCheck(date: string): Promise<LangCheck | null> {
  const { data } = await from("bot_settings")
    .select("value")
    .eq("key", langCheckKey(date))
    .maybeSingle();
  return (data as { value: LangCheck } | null)?.value ?? null;
}

async function saveLangCheck(date: string, value: LangCheck) {
  fail(
    (
      await from("bot_settings").upsert({
        key: langCheckKey(date),
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}

// SAATHI compares the names in the day's Hindi and English (one AI call):
// the written stories not compared as they are now. Numbers and dates need
// no request; they are compared wherever the checklist is shown.
export async function checkLanguages(
  date: string,
): Promise<{ check: LangCheck; checked: number; found: number; left: number }> {
  const { data, error } = await from("ca_items")
    .select("id,category,position,content")
    .eq("issue_date", date)
    .eq("status", "included");
  fail(error);
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const items = (
    (data ?? []) as unknown as Pick<CaItem, "id" | "category" | "position" | "content">[]
  )
    .filter((i): i is typeof i & { content: CaContent } => !!i.content)
    .sort(
      (a, b) =>
        (order.get(normalizeCategory(a.category)) ?? 99) -
          (order.get(normalizeCategory(b.category)) ?? 99) || a.position - b.position,
    );
  const saved = await getLangCheck(date);
  const todo = items.filter((i) => saved?.stories[i.id] !== langFingerprint(i.content));
  const batch = todo.slice(0, LANG_CHECK_STORIES);
  const found = batch.length
    ? parseLangNotes(await saathiComplete(apiKey(), langCheckMessages(batch)), batch)
    : [];
  if (!found) throw new Error("The AI's reply could not be read. Try again.");
  const live = new Set(items.map((i) => i.id));
  const done = new Set(batch.map((i) => i.id));
  const value: LangCheck = {
    at: new Date().toISOString(),
    stories: {
      ...Object.fromEntries(Object.entries(saved?.stories ?? {}).filter(([id]) => live.has(id))),
      ...Object.fromEntries(batch.map((i) => [i.id, langFingerprint(i.content)])),
    },
    notes: [
      ...(saved?.notes ?? []).filter((n) => live.has(n.item_id) && !done.has(n.item_id)),
      ...found,
    ],
    dismissed: (saved?.dismissed ?? []).slice(-300),
  };
  await saveLangCheck(date, value);
  const waved = new Set(value.dismissed);
  return {
    check: value,
    checked: batch.length,
    found: found.filter((n) => !waved.has(n.id)).length,
    left: todo.length - batch.length,
  };
}

// "It's fine": a numbers note (worked out as the editor goes) or SAATHI's
// names note stays out of the list while its texts stay the same.
export async function dismissLangNote(date: string, noteId: string): Promise<LangCheck> {
  const saved = await getLangCheck(date);
  const next: LangCheck = {
    at: saved?.at ?? "",
    stories: saved?.stories ?? {},
    notes: saved?.notes ?? [],
    dismissed: uniq([...(saved?.dismissed ?? []), noteId]).slice(-300),
  };
  await saveLangCheck(date, next);
  return next;
}

// SAATHI writes a part in the other language (one AI call), for the editor
// to check and save; nothing is saved here.
export async function translatePart(id: string, part: string, to: "en" | "hi"): Promise<string> {
  const item = await loadItem(id);
  const text = langText(item.content, part, to === "hi" ? "en" : "hi");
  if (!text) throw new Error("There is nothing to translate in that part.");
  const out = parseSync(
    await saathiComplete(
      apiKey(),
      syncMessages(
        headlineOf(item),
        [{ label: langPartName(part), to, text }],
        await glossaryNow(),
      ),
    ),
    1,
  );
  if (!out) throw new Error("The AI's reply could not be read. Try again.");
  return out[0];
}

const headlineOf = (item: Pick<CaItem, "headline" | "content">) =>
  item.content?.headline.en || item.content?.headline.hi || item.headline;

// Every save leaves Hindi and English the same: where the editor changed only
// one language of a part, SAATHI writes the other (one AI call for all of
// them). If it can't, the text is saved as the editor left it, and the
// Hindi–English check shows what still differs.
export async function syncLanguages(
  before: CaContent | null,
  after: CaContent,
  headline: string,
): Promise<CaContent> {
  const lines = syncLines(before, after).slice(0, SYNC_LINES_MAX);
  if (!lines.length) return after;
  try {
    const out = parseSync(
      await saathiComplete(
        apiKey(),
        syncMessages(
          headline,
          lines.map((l) => ({ label: langPartName(l.part), to: l.to, text: l.text })),
          await glossaryNow(),
        ),
      ),
      lines.length,
    );
    if (!out) throw new Error("unreadable reply");
    return lines.reduce((c, l, i) => withLangPart(c, l.part, l.to, out[i]), after);
  } catch (e) {
    console.error("language sync:", (e instanceof Error && e.message) || e);
    return after;
  }
}

// ---------- Fact-check mode ----------

// A fact marked "to check", with its printed point and what its source says.
export type FactCheck = {
  item_id: string;
  headline: string;
  text: string;
  quote: string;
  note?: string;
  point: Bi | null;
  source: { id: string; name: string; title: string } | null;
  // The quote with the words around it, when the source has it word for word.
  found: QuoteContext | null;
  // Otherwise the source's sentence closest to the fact, if any.
  closest: string | null;
};

// Every fact of the day's stories still to check, in the review list's order.
export async function factChecks(date: string): Promise<FactCheck[]> {
  const { data, error } = await from("ca_items")
    .select("id,headline,category,position,facts,content")
    .eq("issue_date", date)
    .eq("status", "included");
  fail(error);
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
  const items = (
    (data ?? []) as unknown as Pick<
      CaItem,
      "id" | "headline" | "category" | "position" | "facts" | "content"
    >[]
  )
    .filter((i) => i.facts.some((f) => !f.verified))
    .sort(
      (a, b) =>
        (order.get(normalizeCategory(a.category)) ?? 99) -
          (order.get(normalizeCategory(b.category)) ?? 99) || a.position - b.position,
    );
  const ids = uniq(
    items.flatMap((i) => i.facts.filter((f) => !f.verified).map((f) => f.source_id)),
  );
  const { data: srcs } = ids.length
    ? await from("ca_sources").select("id,source_name,title,content").in("id", ids)
    : { data: [] };
  const sources = new Map(
    ((srcs ?? []) as { id: string; source_name: string; title: string; content: string }[]).map(
      (r) => [r.id, r],
    ),
  );
  const sentences = new Map<string, string[]>();
  const sentencesOf = (id: string, content: string) => {
    let list = sentences.get(id);
    if (!list) sentences.set(id, (list = sourceSentences(content)));
    return list;
  };
  return items.flatMap((item) =>
    item.facts.flatMap((f, i): FactCheck[] => {
      if (f.verified) return [];
      const src = sources.get(f.source_id);
      const found = src ? quoteContext(src.content, f.quote) : null;
      return [
        {
          item_id: item.id,
          headline: item.content?.headline.en || item.headline,
          text: f.text,
          quote: f.quote,
          ...(f.note ? { note: f.note } : {}),
          point: item.content?.points[i] ?? null,
          source: src ? { id: src.id, name: src.source_name, title: src.title } : null,
          found,
          closest:
            src && !found
              ? closestSentence(sentencesOf(src.id, src.content), `${f.text} ${f.quote}`)
              : null,
        },
      ];
    }),
  );
}

// A fact checked in fact-check mode, its printed point corrected if needed.
export async function checkFact(id: string, factText: string, point?: Bi): Promise<CaItem> {
  const item = await loadItem(id);
  const index = item.facts.findIndex((f) => f.text === factText);
  if (index < 0) throw new Error("That fact is no longer in the story");
  const facts = item.facts.map((f, i) => (i === index ? markChecked(f, true) : f));
  const content =
    point && item.content
      ? await syncLanguages(
          item.content,
          { ...item.content, points: item.content.points.map((p, i) => (i === index ? point : p)) },
          headlineOf(item),
        )
      : undefined;
  const { data, error } = await from("ca_items")
    .update({
      facts,
      ...(content ? { content } : {}),
      updated_at: new Date().toISOString(),
    } as never)
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

// A correction approved after the day's issue went out is announced on the
// channel, as a reply under that day's PDF: in each issue's language under
// the Hindi and the English issue (both languages under an older bilingual
// issue). It never stops the correction.
async function postCorrectionNote(
  item: CaItem,
  corr: CaCorrection,
  settings: MagazineSettings,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channel = settings.channel.trim();
  if (!settings.post_corrections || !channel || !token) return false;
  const { data } = await from("ca_issues")
    .select("status,telegram_message_id,telegram_message_id_hi,pdf_path_hi")
    .eq("kind", "daily")
    .eq("period", item.issue_date)
    .maybeSingle();
  const issue = data as {
    status: string;
    telegram_message_id: number | null;
    telegram_message_id_hi: number | null;
    pdf_path_hi: string | null;
  } | null;
  if (issue?.status !== "posted") return false;
  const note = {
    date: item.issue_date,
    headline: item.content?.headline ?? { en: item.headline, hi: "" },
    summary_en: corr.summary_en,
    summary_hi: corr.summary_hi,
  };
  const send = async (chat_id: string, text: string, under: number | null) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id,
          parse_mode: "HTML",
          text,
          ...(under
            ? { reply_parameters: { message_id: under, allow_sending_without_reply: true } }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!json.ok) throw new Error(json.description ?? `Telegram error ${res.status}`);
      return true;
    } catch (e) {
      console.error("correction note:", e instanceof Error ? e.message : e);
      return false;
    }
  };
  if (!issue.pdf_path_hi) return send(channel, correctionNote(note), issue.telegram_message_id);
  const sent = await Promise.all([
    send(channel, correctionNote(note, "en"), issue.telegram_message_id),
    send(channel, correctionNote(note, "hi"), issue.telegram_message_id_hi),
  ]);
  return sent.some(Boolean);
}

// `noted`: the correction was also announced on the channel.
export async function decideCorrection(id: string, approve: boolean) {
  const { data, error } = await from("ca_corrections").select("*").eq("id", id).single();
  fail(error);
  const corr = data as unknown as CaCorrection;
  let noted = false;
  if (approve) {
    const { data: it } = await from("ca_items").select(ITEM_COLS).eq("id", corr.item_id).single();
    const item = it as unknown as CaItem;
    const next = applyChanges(item.facts, item.content, corr.changes);
    const before = snapshotOf(item);
    if (before) await saveVersion(item.id, before, "correction");
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
    noted = await postCorrectionNote(item, corr, settings);
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
  return { ...corr, noted };
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

export async function issueHtml(
  kind: "daily" | "monthly",
  period: string,
  lang: Lang,
  opts: {
    fillers?: number;
    design?: IssueDesign;
    coverOnly?: boolean;
    // A daily layout being tried in Settings, before it is saved.
    dailyCover?: DailyLayout;
  } = {},
) {
  const saved = await getMagazineSettings();
  const settings = opts.dailyCover ? { ...saved, daily_cover: opts.dailyCover } : saved;
  const range = kind === "daily" ? { from: period, to: period } : monthRange(period);
  const items = await magazineItems(range.from, range.to);
  let corrections: MagazineCorrection[] = [];
  if (kind === "monthly") {
    corrections = (await listCorrections(range.from, range.to, "approved"))
      .sort((a, b) => a.item_date.localeCompare(b.item_date))
      .map((c) => ({
        date: c.item_date,
        headline: c.headline_bi,
        summary: { en: c.summary_en, hi: c.summary_hi },
        changes: c.changes
          .filter((ch) => ch.old_value || ch.new_value)
          .map((ch) => ({
            from: { en: ch.old_value, hi: ch.old_value_hi },
            to: { en: ch.new_value, hi: ch.new_value_hi },
          })),
      }));
  }
  const feature = kind === "monthly" ? await getFeature(range.from) : null;
  const design = kind === "monthly" ? (opts.design ?? (await getIssueDesign(range.from))) : null;
  return {
    html: renderMagazine({
      kind,
      period: kind === "daily" ? period : range.from,
      lang,
      settings,
      items,
      corrections,
      feature: feature?.included ? feature : null,
      design,
      fillers: opts.fillers,
      coverOnly: opts.coverOnly,
    }),
    // A monthly cover's own colour, when it is the whole issue's, also
    // colours the Telegram link on every page.
    settings:
      design?.cover.color && design.cover.color_scope !== "cover"
        ? { ...settings, accent: design.cover.color }
        : settings,
    count: items.length,
  };
}

// Cloudflare Browser Rendering (REST API) turns the HTML into a PDF; the
// finishing step makes the ad pages clean and adds the Telegram link. Says
// how many pages the PDF has.
export async function renderPdf(
  html: string,
  settings: MagazineSettings,
  lang: Lang = "en",
): Promise<{ pdf: Uint8Array; pages: number }> {
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
  // Cloudflare limits how often PDFs can be made: on "too many", wait (as long
  // as it asks, up to 20 seconds) and try again, a few times.
  let res = await call("browser-rendering");
  if (res.status === 404) res = await call("browser-run");
  for (let attempt = 0; res.status === 429 && attempt < 3; attempt++) {
    const wait = Math.min(
      20,
      Math.max(5, Number(res.headers.get("retry-after")) || 8 * (attempt + 1)),
    );
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await call("browser-rendering");
    if (res.status === 404) res = await call("browser-run");
  }
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
  const pdf = new Uint8Array(await res.arrayBuffer());
  // "Join us on Telegram", linked, at the bottom of every page.
  const d = DEFAULT_MAGAZINE_SETTINGS;
  const ads = normalizeAds(settings.ads);
  try {
    const { finishPdf } = await import("@/lib/ca-pdf-link");
    return await finishPdf(pdf, {
      join: {
        text: settings.join_text ?? d.join_text,
        url: (settings.join_url ?? d.join_url).trim(),
        color: settings.accent,
      },
      loadAd: async (id) => {
        const ad = ads.find((a) => a.id === id);
        if (!ad) return null;
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(adImage(ad, lang).path);
        if (error || !data) return null;
        return { bytes: new Uint8Array(await data.arrayBuffer()), fit: ad.fit, link: ad.link };
      },
    });
  } catch (e) {
    // The issue still goes out, without the link.
    console.error("join link:", e instanceof Error ? e.message : e);
    return { pdf, pages: 0 };
  }
}

// An issue's PDF in one language. A monthly issue for print gets ruled notes
// pages before its back cover so the back cover lands on the outside: the
// first PDF tells how many pages there are, and when notes pages are needed
// the issue is made again with them (so the page numbers count them).
async function issuePdf(kind: "daily" | "monthly", period: string, lang: Lang) {
  const first = await issueHtml(kind, period, lang);
  const made = await renderPdf(first.html, first.settings, lang);
  const binding = first.settings.print_binding ?? "booklet";
  const need = kind === "monthly" && made.pages ? fillerPages(made.pages, binding) : 0;
  if (!need) return { ...first, pdf: made.pdf };
  const again = await issueHtml(kind, period, lang, { fillers: need });
  const padded = await renderPdf(again.html, again.settings, lang);
  return { ...again, pdf: padded.pdf };
}

function fileName(kind: "daily" | "monthly", period: string, lang: Lang) {
  const name = lang === "hi" ? "Hindi" : "English";
  return kind === "daily"
    ? `daily/FlashGyan-Current-Affairs-${period}-${name}.pdf`
    : `monthly/FlashGyan-Current-Affairs-${period.slice(0, 7)}-${name}.pdf`;
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

// ---------- Covers and ads ----------

// A monthly issue's cover, ads and back cover, kept with the issue.
export async function getIssueDesign(period: string): Promise<IssueDesign> {
  const { data } = await from("ca_issues")
    .select("design")
    .eq("kind", "monthly")
    .eq("period", period)
    .maybeSingle();
  return normalizeIssueDesign((data as { design?: unknown } | null)?.design);
}

export async function saveIssueDesign(period: string, design: unknown): Promise<IssueDesign> {
  const clean = normalizeIssueDesign(design);
  try {
    await upsertIssue("monthly", period, { design: clean });
  } catch (e) {
    if (e instanceof Error && /'design' column/.test(e.message))
      throw new Error(
        "The database is missing the monthly cover column: run migration 20261021120000_ca_issue_design.sql, then save again.",
      );
    throw e;
  }
  return clean;
}

// Cover photos and ads live next to the PDFs, public like them, so the PDF
// renderer can load them.
export async function uploadMagazineFile(
  folder: "covers" | "ads",
  bytes: Uint8Array,
  contentType: string,
) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType });
  fail(error);
  return { path, url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function saveAds(list: unknown) {
  const ads = normalizeAds(list).filter(
    (a) => a.path.startsWith("ads/") && (!a.path_hi || a.path_hi.startsWith("ads/")),
  );
  const settings = await getMagazineSettings();
  const ids = new Set(ads.map((a) => a.id));
  return saveMagazineSettings({
    ads,
    // A removed ad is no longer the daily back cover.
    daily_back_cover: ids.has(settings.daily_back_cover) ? settings.daily_back_cover : "",
  });
}

export async function saveCoverPresets(list: unknown) {
  return saveMagazineSettings({ cover_presets: normalizePresets(list) });
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
  // The English issue and the Hindi issue, from the same stories, one after
  // the other: Cloudflare refuses PDFs asked for at the same time.
  const made = [];
  for (const lang of ["en", "hi"] as const) {
    made.push(
      await (async () => {
        const { pdf, settings, count } = await issuePdf(kind, period, lang);
        if (count === 0) throw new Error("There are no items to put in this issue.");
        const path = fileName(kind, period, lang);
        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, pdf, { contentType: "application/pdf", upsert: true });
        fail(error);
        const url = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
        return {
          path,
          url,
          settings,
          count,
          caption: captionFor(kind, period, settings, count, lang),
        };
      })(),
    );
  }
  const [en, hi] = made;
  const { settings, count } = en;
  const scheduledFor = opts.schedule
    ? opts.when
      ? new Date(opts.when)
      : kind === "daily"
        ? dailyPostTime(period, settings.post_time)
        : new Date()
    : null;
  const issue = await upsertIssue(kind, period, {
    pdf_path: en.path,
    pdf_url: en.url,
    caption: en.caption,
    pdf_path_hi: hi.path,
    pdf_url_hi: hi.url,
    caption_hi: hi.caption,
    item_count: count,
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
  if (opts.schedule && kind === "daily" && settings.add_to_flashcards) {
    try {
      await addDayToFlashcards(period);
    } catch (e) {
      console.error("current affairs → flashcards:", e);
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

async function sendPdf(chatId: string, path: string, caption: string | null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  fail(error);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", data as Blob, path.split("/").pop() ?? "magazine.pdf");
  if (caption) {
    form.append("caption", caption);
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
  if (!issue?.pdf_path) throw new Error("Make the PDF first.");
  // Both issues, English then Hindi.
  await sendPdf(settings.test_chat_id, issue.pdf_path, issue.caption);
  if (issue.pdf_path_hi) await sendPdf(settings.test_chat_id, issue.pdf_path_hi, issue.caption_hi);
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
// Puts the day's quick revision questions in the month's flashcard deck,
// replacing that day's cards if it was approved before.
export async function addDayToFlashcards(date: string): Promise<number> {
  const items = await magazineItems(date, date);
  const cards = issueCards(date, items);
  const deck = flashcardDeckFor(date);
  const { data: found, error: fErr } = await supabaseAdmin
    .from("flashcard_decks")
    .select("id")
    .eq("subject", deck.subject)
    .eq("topic", deck.topic)
    .limit(1)
    .maybeSingle();
  fail(fErr);
  let deckId = (found as { id: string } | null)?.id;
  if (!deckId) {
    if (!cards.length) return 0;
    const { data: made, error } = await supabaseAdmin
      .from("flashcard_decks")
      .insert(deck)
      .select("id")
      .single();
    fail(error);
    deckId = (made as { id: string }).id;
  }
  const [lo, hi] = dayCardRange(date);
  fail(
    (
      await supabaseAdmin
        .from("flashcards")
        .delete()
        .eq("deck_id", deckId)
        .gte("order_index", lo)
        .lte("order_index", hi)
    ).error,
  );
  if (!cards.length) return 0;
  const { error } = await supabaseAdmin.from("flashcards").insert(
    cards.map((c) => ({
      ...c,
      deck_id: deckId,
      subject: deck.subject,
      topic: deck.topic,
    })) as never,
  );
  fail(error);
  return cards.length;
}

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
      {
        title,
        subject: CA_SUBJECT,
        topic: date.slice(0, 7),
        medium: "Bilingual",
        source: "FlashGyan Current Affairs",
      },
      text,
    );
}
