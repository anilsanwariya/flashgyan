// Server-only: GK infographics. A subject (one runs at a time) has an
// ordered topic list; each day the editor picks a topic, the AI reads the
// topic's passages from the subject's books (the SAATHI knowledge base) and
// plans as many cards as the material warrants, the editor keeps the ones
// they want, the AI writes them (words, then each card's map or visual from
// its facts) and proofreads them, the editor checks each in the card editor
// and approves, the images are made in both languages, and the two albums
// (Hindi, English) are posted at the chosen time. Work moves a step at a
// time, from the minute tick or the editor's page, whichever comes first.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  matchLabel,
  relevantMatches,
  saathiComplete,
  saathiErrorDetail,
  saathiSearchQuery,
  type SaathiRpc,
} from "../../supabase/functions/_shared/saathi-core.ts";
import { hindiGuide } from "../../supabase/functions/_shared/ca-hindi.ts";
import { formatDate, istDate } from "@/lib/current-affairs";
import * as CA from "@/lib/current-affairs.server";
import { parseVisual, visualMessages, type VisualType } from "@/lib/ca-visuals";
import { parseStoryMap, storyMapMessages } from "@/lib/ca-map";
import { channelChatId, channelLabel, captionText, CAPTION_MAX } from "@/lib/ig-words";
import { screenshot, telegramCaption } from "@/lib/ig.server";
import {
  applyGkFix,
  cardFromIdea,
  gkCardHtml,
  gkSettingsOf,
  parseIssues,
  parsePart,
  parsePlan,
  parseTopics,
  parseWritten,
  partMessages,
  planMessages,
  proofMessages,
  topicsMessages,
  writeMessages,
  type GkCard,
  type GkCheck,
  type GkIdea,
  type GkLang,
  type GkPart,
  type GkPassage,
  type GkSettings,
} from "@/lib/gk";
import type { Bi } from "@/lib/current-affairs";
import type { MapSpec } from "@/lib/map-spec";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
const rpc: SaathiRpc = (fn, args) => supabaseAdmin.rpc(fn as never, args as never);
type Row = Record<string, unknown>;
const BUCKET = "ca-magazines";
const publicUrl = (path: string | null | undefined) =>
  path ? supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
const glossary = async () => (await CA.getMagazineSettings()).glossary ?? [];
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

// ---------- Settings ----------

const SETTINGS_KEY = "gk_settings";

export async function getGkSettings(): Promise<GkSettings> {
  const { data } = await from("bot_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  return gkSettingsOf((data as Row | null)?.value);
}

export async function saveGkSettings(patch: Partial<GkSettings>): Promise<GkSettings> {
  const next = gkSettingsOf({ ...(await getGkSettings()), ...patch });
  fail(
    (
      await from("bot_settings").upsert({
        key: SETTINGS_KEY,
        value: next,
        updated_at: now(),
      } as never)
    ).error,
  );
  return next;
}

// ---------- Subjects ----------

export type GkSubject = {
  id: string;
  name_en: string;
  name_hi: string;
  kb_subjects: string[];
  status: "active" | "paused" | "done";
  started_on: string | null;
  created_at: string;
};
export type GkTopic = {
  id: string;
  subject_id: string;
  position: number;
  name_en: string;
  name_hi: string;
  note: string;
  status: "todo" | "posted" | "skipped";
  posted_on: string | null;
};
const SUBJECT_COLS = "id,name_en,name_hi,kb_subjects,status,started_on,created_at";
const TOPIC_COLS = "id,subject_id,position,name_en,name_hi,note,status,posted_on";

// Without the migration the page says so instead of failing.
const missing = (e: { message: string } | null) =>
  !!e && /gk_(subjects|topics|days|cards)|schema cache|does not exist/i.test(e.message);

export async function listGkSubjects(): Promise<{
  ready: boolean;
  subjects: (GkSubject & { topics: number; posted: number })[];
}> {
  const { data, error } = await from("gk_subjects")
    .select(SUBJECT_COLS)
    .order("created_at", { ascending: false });
  if (missing(error)) return { ready: false, subjects: [] };
  fail(error);
  const subjects = (data ?? []) as unknown as GkSubject[];
  const { data: t } = await from("gk_topics").select("subject_id,status");
  const topics = (t ?? []) as Row[];
  return {
    ready: true,
    subjects: subjects.map((s) => ({
      ...s,
      topics: topics.filter((x) => x.subject_id === s.id).length,
      posted: topics.filter((x) => x.subject_id === s.id && x.status === "posted").length,
    })),
  };
}

export async function getGkSubject(id: string): Promise<{ subject: GkSubject; topics: GkTopic[] }> {
  const { data, error } = await from("gk_subjects").select(SUBJECT_COLS).eq("id", id).single();
  fail(error);
  const { data: t, error: te } = await from("gk_topics")
    .select(TOPIC_COLS)
    .eq("subject_id", id)
    .order("position");
  fail(te);
  return { subject: data as unknown as GkSubject, topics: (t ?? []) as unknown as GkTopic[] };
}

export async function createGkSubject(input: {
  name_en: string;
  name_hi: string;
  kb_subjects: string[];
}): Promise<GkSubject> {
  const { data, error } = await from("gk_subjects")
    .insert({ ...input, status: "paused" } as never)
    .select(SUBJECT_COLS)
    .single();
  fail(error);
  return data as unknown as GkSubject;
}

export async function updateGkSubject(
  id: string,
  patch: Partial<Pick<GkSubject, "name_en" | "name_hi" | "kb_subjects">>,
) {
  fail(
    (
      await from("gk_subjects")
        .update({ ...patch, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

// The running subject: one at a time (the others are paused).
export async function setGkSubjectStatus(id: string, status: GkSubject["status"]) {
  if (status === "active")
    fail(
      (
        await from("gk_subjects")
          .update({ status: "paused", updated_at: now() } as never)
          .eq("status", "active")
          .neq("id", id)
      ).error,
    );
  const { data } = await from("gk_subjects").select("started_on").eq("id", id).single();
  fail(
    (
      await from("gk_subjects")
        .update({
          status,
          ...(status === "active" && !(data as Row | null)?.started_on
            ? { started_on: istDate() }
            : {}),
          updated_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
}

export async function deleteGkSubject(id: string) {
  fail((await from("gk_subjects").delete().eq("id", id)).error);
}

// ---------- The books ----------

// The knowledge base's subjects (to link a GK subject to).
export async function kbSubjects(): Promise<{ subject: string; docs: number }[]> {
  const { data, error } = await from("saathi_knowledge")
    .select("subject")
    .is("parent_id", null)
    .limit(5000);
  fail(error);
  const n = new Map<string, number>();
  for (const r of (data ?? []) as Row[]) {
    const s = String(r.subject ?? "");
    if (s && s !== CA.CA_SUBJECT) n.set(s, (n.get(s) ?? 0) + 1);
  }
  return [...n.entries()]
    .map(([subject, docs]) => ({ subject, docs }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

// The subject's books: the documents of its knowledge base subjects.
export async function gkBooks(
  id: string,
): Promise<{ id: string; title: string; topic: string | null; subject: string; medium: string }[]> {
  const { subject } = await getGkSubject(id);
  if (!subject.kb_subjects.length) return [];
  const { data, error } = await from("saathi_knowledge")
    .select("id,title,topic,subject,medium")
    .is("parent_id", null)
    .in("subject", subject.kb_subjects)
    .order("created_at", { ascending: false })
    .limit(500);
  fail(error);
  return (data ?? []) as unknown as {
    id: string;
    title: string;
    topic: string | null;
    subject: string;
    medium: string;
  }[];
}

// Reference material added for the subject: kept in the knowledge base
// (searched like every book) under the subject's first knowledge base
// subject, or its own name, which is linked to it.
export async function addGkReference(
  id: string,
  input: {
    title: string;
    text: string;
    medium: "Hindi" | "English" | "Bilingual";
    source?: string;
  },
) {
  const { subject } = await getGkSubject(id);
  const kb = subject.kb_subjects[0] ?? subject.name_en;
  const { createDocument } = await import("@/lib/saathi-ingest.server");
  const doc = await createDocument(
    {
      title: input.title,
      subject: kb,
      topic: null,
      medium: input.medium,
      source: input.source || null,
    },
    input.text,
  );
  if (!subject.kb_subjects.includes(kb))
    await updateGkSubject(id, { kb_subjects: [...subject.kb_subjects, kb] });
  return doc;
}

// The topic's passages from the subject's books.
async function passagesFor(subject: GkSubject, topic: GkTopic): Promise<GkPassage[]> {
  if (!subject.kb_subjects.length) return [];
  const matches = await saathiSearchQuery(
    apiKey(),
    rpc,
    {
      standalone: [topic.name_en, topic.name_hi, topic.note, subject.name_en]
        .filter(Boolean)
        .join("\n")
        .slice(0, 1200),
      english: `${topic.name_en} (${subject.name_en})`,
    },
    subject.kb_subjects,
    24,
  );
  return relevantMatches(matches)
    .slice(0, 14)
    .map((m, i) => ({ k: i + 1, title: matchLabel(m), content: m.content.slice(0, 2200) }));
}

// ---------- Topics ----------

export async function addGkTopics(subjectId: string, names: Bi[]) {
  const { topics } = await getGkSubject(subjectId);
  let at = topics.reduce((m, t) => Math.max(m, t.position), 0);
  const have = new Set(topics.map((t) => t.name_en.toLowerCase()));
  const rows = names
    .filter((n) => (n.en || n.hi) && !have.has(n.en.toLowerCase()))
    .map((n) => ({ subject_id: subjectId, position: ++at, name_en: n.en || n.hi, name_hi: n.hi }));
  if (rows.length) fail((await from("gk_topics").insert(rows as never)).error);
  return rows.length;
}

export async function updateGkTopic(
  id: string,
  patch: Partial<Pick<GkTopic, "name_en" | "name_hi" | "note" | "status">>,
) {
  fail(
    (
      await from("gk_topics")
        .update({ ...patch, ...(patch.status === "todo" ? { posted_on: null } : {}) } as never)
        .eq("id", id)
    ).error,
  );
}

export async function moveGkTopic(id: string, by: -1 | 1) {
  const { data } = await from("gk_topics").select("subject_id").eq("id", id).single();
  const { topics } = await getGkSubject(String((data as unknown as Row).subject_id));
  const at = topics.findIndex((t) => t.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= topics.length) return;
  const order = [...topics];
  [order[at], order[to]] = [order[to], order[at]];
  for (const [i, t] of order.entries())
    if (t.position !== i + 1)
      fail(
        (
          await from("gk_topics")
            .update({ position: i + 1 } as never)
            .eq("id", t.id)
        ).error,
      );
}

export async function deleteGkTopic(id: string) {
  fail((await from("gk_topics").delete().eq("id", id)).error);
}

// A topic list for the subject from its books (not saved: the editor
// chooses which to add).
export async function suggestGkTopics(subjectId: string): Promise<Bi[]> {
  const { subject } = await getGkSubject(subjectId);
  const books = await gkBooks(subjectId);
  if (!books.length)
    throw new Error("Link the subject to its books (knowledge base subjects) first.");
  const list = parseTopics(
    await saathiComplete(
      apiKey(),
      topicsMessages({
        subject: { en: subject.name_en, hi: subject.name_hi },
        books: books.map((b) => `${b.title}${b.topic ? ` — ${b.topic}` : ""}`),
        glossary: await glossary(),
      }),
    ),
  );
  if (!list) throw new Error("The AI's topic list could not be read. Try again.");
  return list;
}

// ---------- Days and cards ----------

export type GkStatus =
  | "planning"
  | "picking"
  | "writing"
  | "review"
  | "rendering"
  | "scheduled"
  | "posting"
  | "posted"
  | "failed"
  | "cancelled";

export type GkDay = {
  day: string;
  subject_id: string | null;
  topic_id: string | null;
  day_no: number;
  status: GkStatus;
  ideas: GkIdea[];
  material_note: string;
  caption_en: string;
  caption_hi: string;
  scheduled_for: string | null;
  posted_at: string | null;
  error: string | null;
  notified: string[];
  updated_at: string;
};
const DAY_COLS =
  "day,subject_id,topic_id,day_no,status,ideas,material_note,caption_en,caption_hi,scheduled_for,posted_at,error,notified,updated_at";

export type GkCardRow = {
  id: string;
  day: string;
  position: number;
  idea: GkIdea;
  card: GkCard | null;
  checks: GkCheck[];
  proofed: boolean;
  checked: boolean;
  image_en: string | null;
  image_hi: string | null;
  image_en_url: string | null;
  image_hi_url: string | null;
};
const CARD_COLS = "id,day,position,idea,card,checks,proofed,checked,image_en,image_hi";

async function readDay(day: string): Promise<GkDay | null> {
  const { data, error } = await from("gk_days").select(DAY_COLS).eq("day", day).maybeSingle();
  fail(error);
  return (data as unknown as GkDay | null) ?? null;
}

async function patchDay(day: string, patch: Partial<GkDay> & { locked_until?: string | null }) {
  fail(
    (
      await from("gk_days")
        .update({ ...patch, updated_at: now() } as never)
        .eq("day", day)
    ).error,
  );
}

async function cardsOf(day: string): Promise<GkCardRow[]> {
  const { data, error } = await from("gk_cards").select(CARD_COLS).eq("day", day).order("position");
  fail(error);
  return ((data ?? []) as unknown as GkCardRow[]).map((c) => ({
    ...c,
    checks: c.checks ?? [],
    image_en_url: publicUrl(c.image_en),
    image_hi_url: publicUrl(c.image_hi),
  }));
}

async function patchCard(
  id: string,
  patch: Partial<Omit<GkCardRow, "image_en_url" | "image_hi_url">>,
) {
  fail(
    (
      await from("gk_cards")
        .update({ ...patch, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
}

const lockQuery = (day: string, until: string) =>
  from("gk_days")
    .update({ locked_until: until } as never)
    .eq("day", day);

async function claim(day: string): Promise<GkDay | null> {
  const until = new Date(Date.now() + 120_000).toISOString();
  for (const free of [
    (q: ReturnType<typeof lockQuery>) => q.is("locked_until", null),
    (q: ReturnType<typeof lockQuery>) => q.lt("locked_until", now()),
  ]) {
    const { data, error } = await free(lockQuery(day, until)).select(DAY_COLS);
    fail(error);
    const row = ((data ?? []) as unknown as GkDay[])[0];
    if (row) return row;
  }
  return null;
}
const release = (day: string) => patchDay(day, { locked_until: null });

async function subjectAndTopic(d: GkDay) {
  const [{ data: s }, { data: t }] = await Promise.all([
    from("gk_subjects")
      .select(SUBJECT_COLS)
      .eq("id", d.subject_id ?? "")
      .maybeSingle(),
    from("gk_topics")
      .select(TOPIC_COLS)
      .eq("id", d.topic_id ?? "")
      .maybeSingle(),
  ]);
  return { subject: s as unknown as GkSubject | null, topic: t as unknown as GkTopic | null };
}
const biOf = (en: string, hi: string): Bi => ({ en, hi });

export type GkDayView = {
  ready: boolean;
  day: GkDay | null;
  subject: GkSubject | null;
  topic: GkTopic | null;
  // The running subject and its next topic (to start the day with).
  active: GkSubject | null;
  topics: GkTopic[];
  cards: GkCardRow[];
  settings: GkSettings;
};

export async function getGkDay(day: string): Promise<GkDayView> {
  const settings = await getGkSettings();
  const { data: a, error } = await from("gk_subjects")
    .select(SUBJECT_COLS)
    .eq("status", "active")
    .maybeSingle();
  if (missing(error))
    return {
      ready: false,
      day: null,
      subject: null,
      topic: null,
      active: null,
      topics: [],
      cards: [],
      settings,
    };
  fail(error);
  const active = (a as unknown as GkSubject | null) ?? null;
  const topics = active ? (await getGkSubject(active.id)).topics : [];
  const row = await readDay(day);
  const st = row ? await subjectAndTopic(row) : { subject: null, topic: null };
  return {
    ready: true,
    day: row,
    subject: st.subject,
    topic: st.topic,
    active,
    topics,
    cards: row ? await cardsOf(day) : [],
    settings,
  };
}

// The day's topic chosen: the AI reads the books and plans the cards.
export async function startGkDay(day: string, topicId: string): Promise<GkDay> {
  const { data: t, error } = await from("gk_topics").select(TOPIC_COLS).eq("id", topicId).single();
  fail(error);
  const topic = t as unknown as GkTopic;
  const old = await readDay(day);
  if (old && !["planning", "picking", "failed", "cancelled"].includes(old.status))
    throw new Error("This day's cards are already written; cancel them first to change the topic.");
  const { count } = await from("gk_days")
    .select("day", { count: "exact", head: true })
    .eq("subject_id", topic.subject_id)
    .lt("day", day);
  if (old) fail((await from("gk_cards").delete().eq("day", day)).error);
  const row = {
    day,
    subject_id: topic.subject_id,
    topic_id: topic.id,
    day_no: (count ?? 0) + 1,
    status: "planning",
    ideas: [],
    material_note: "",
    error: null,
    notified: [],
    locked_until: null,
    updated_at: now(),
  };
  fail((await from("gk_days").upsert(row as never)).error);
  return (await readDay(day))!;
}

// Cards the series has already posted (their titles), not to repeat.
async function postedTitles(subjectId: string): Promise<string[]> {
  const { data: days } = await from("gk_days")
    .select("day")
    .eq("subject_id", subjectId)
    .eq("status", "posted");
  const ds = ((days ?? []) as Row[]).map((r) => String(r.day));
  if (!ds.length) return [];
  const { data } = await from("gk_cards")
    .select("card")
    .in("day", ds)
    .order("day")
    .order("position");
  return ((data ?? []) as Row[])
    .map((r) => (r.card as GkCard | null)?.title.en ?? "")
    .filter(Boolean);
}

async function plan(d: GkDay) {
  const { subject, topic } = await subjectAndTopic(d);
  if (!subject || !topic) throw new Error("The day's subject or topic is gone.");
  const passages = await passagesFor(subject, topic);
  if (!passages.length)
    throw new Error(
      "The subject's books have nothing on this topic: add reference material (Subjects tab) or pick another topic.",
    );
  const out = parsePlan(
    await saathiComplete(
      apiKey(),
      planMessages({
        subject: biOf(subject.name_en, subject.name_hi),
        topic: biOf(topic.name_en, topic.name_hi),
        note: topic.note,
        passages,
        done: await postedTitles(subject.id),
        glossary: await glossary(),
      }),
    ),
    passages,
  );
  if (!out) throw new Error("The AI's card plan could not be read. Try again.");
  if (!out.ideas.length)
    throw new Error(out.note || "The AI found no card in the books' passages for this topic.");
  await patchDay(d.day, {
    status: "picking",
    ideas: out.ideas,
    material_note: out.enough ? out.note : `Not enough material: ${out.note}`,
    error: null,
  });
}

// The ideas the editor keeps (in this order) become the day's cards.
export async function pickGkIdeas(day: string, picks: number[], extra: GkIdea[] = []) {
  const d = await readDay(day);
  if (!d || d.status !== "picking") throw new Error("Pick the cards once the plan is ready.");
  const chosen = [...picks.map((i) => d.ideas[i]).filter(Boolean), ...extra];
  if (!chosen.length) throw new Error("Keep at least one card.");
  fail((await from("gk_cards").delete().eq("day", day)).error);
  fail(
    (
      await from("gk_cards").insert(
        chosen.map((idea, i) => ({ day, position: i + 1, idea })) as never,
      )
    ).error,
  );
  await patchDay(day, { status: "writing", error: null });
}

// The words of up to six cards at once.
async function writeWords(d: GkDay, cards: GkCardRow[]): Promise<boolean> {
  const todo = cards.filter((c) => !c.card).slice(0, 6);
  if (!todo.length) return false;
  const { subject, topic } = await subjectAndTopic(d);
  const written = parseWritten(
    await saathiComplete(
      apiKey(),
      writeMessages({
        subject: biOf(subject?.name_en ?? "", subject?.name_hi ?? ""),
        topic: biOf(topic?.name_en ?? "", topic?.name_hi ?? ""),
        ideas: todo.map((c) => c.idea),
        glossary: await glossary(),
      }),
    ),
  );
  if (!written) throw new Error("The AI's cards could not be read. Try again.");
  for (const [i, c] of todo.entries())
    await patchCard(c.id, {
      card: cardFromIdea(
        c.idea,
        written.find((w) => w.n === i + 1),
      ),
    });
  return true;
}

// A visual from the card's facts (the magazine's maker and number check).
async function visualFor(
  card: GkCard,
  opts: { type?: VisualType; note?: string } = {},
): Promise<{ visual: GkCard["visual"]; problem: string | null }> {
  let problem: string | undefined;
  const facts = card.facts.map((f) => ({ ...f, source_id: "", verified: f.verified }));
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await saathiComplete(
      apiKey(),
      visualMessages({
        glossary: await glossary(),
        headline: card.title.en,
        category: "misc",
        facts,
        problem,
        type: opts.type ?? (card.look === "map" || card.look === "points" ? undefined : card.look),
        note: opts.note,
        others: [],
        compact: false,
        picked: false,
      }),
    );
    const r = parseVisual(raw, facts, card.title.en);
    if (r.visual) return { visual: r.visual, problem: null };
    problem = r.problem ?? undefined;
    if (!problem) break;
  }
  return { visual: null, problem: problem ?? "No visual passed the number check." };
}

// A map of the card's places, put where the place list says they are.
async function mapFor(card: GkCard): Promise<MapSpec | null> {
  const atlas = await import("@/lib/atlas.server");
  const layers = await atlas.atlasLayerChoices().catch(() => []);
  const { ATLAS_CATS } = await import("@/lib/atlas");
  const messages = storyMapMessages(
    card.title.en,
    card.facts.map((f) => f.text),
    hindiGuide(await glossary()),
  );
  // The editor's atlas: thematic layers, and every place of a kind.
  messages.splice(1, 0, {
    role: "system",
    content: `This map is for a GK infographic card. The editor's Rajasthan atlas can also draw, under the places:
- a thematic layer, when the card is about it (at most one): ${layers.map((l) => `"${l.key}" ${l.name.en}`).join("; ")}. Add it in the map as "layers": ["key"].
- every place of one kind from the atlas, when the card is about all of them (e.g. all passes, all copper mines): add "atlas": {"cat": category, "district": "" or one district} beside "map". Categories: ${ATLAS_CATS.map((c) => `"${c.key}" ${c.name.en}`).join("; ")}.`,
  });
  const raw = await saathiComplete(apiKey(), messages);
  const map = parseStoryMap(raw);
  if (!map) return null;
  // Every place of the kind asked for (the atlas's verified ones).
  let pick: { cat?: string; district?: string } = {};
  try {
    const t = raw.replace(/```(?:json)?/g, "");
    pick =
      (JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { atlas?: typeof pick })
        .atlas ?? {};
  } catch {
    // No atlas places asked for.
  }
  if (pick.cat) {
    const { MAX_PLACES } = await import("@/lib/map-spec");
    const found = await atlas.atlasPlacesOf(pick.cat, pick.district || undefined);
    const have = new Set(map.places.map((p) => p.name.en.toLowerCase()));
    for (const p of found) {
      if (map.places.length >= MAX_PLACES) break;
      if (have.has(p.name_en.toLowerCase())) continue;
      map.places.push({
        name: { en: p.name_en, hi: p.name_hi },
        lat: p.lat,
        lon: p.lon,
        src: "list",
      });
    }
  }
  const { checkMapPlaces } = await import("@/lib/geo-places");
  return checkMapPlaces(map);
}

// One card's map or visual a step.
async function drawOne(cards: GkCardRow[]): Promise<boolean> {
  const c = cards.find(
    (x) =>
      x.card &&
      x.card.look !== "points" &&
      !(x.card.look === "map" ? x.card.map : x.card.visual) &&
      !x.checks.some(
        (k) => k.field === (x.card!.look === "map" ? "map" : "visual") && k.source === "book",
      ),
  );
  if (!c?.card) return false;
  const card = c.card;
  if (card.look === "map") {
    const map = await mapFor(card).catch(() => null);
    if (map) await patchCard(c.id, { card: { ...card, map } });
    else
      await patchCard(c.id, {
        checks: [
          ...c.checks,
          {
            id: crypto.randomUUID(),
            source: "book",
            field: "map",
            text: "",
            fix: "",
            why: "No map could be made from the card's facts: pick another visual or draw it in the Map tab.",
            state: "open",
          },
        ],
      });
  } else {
    const r = await visualFor(card);
    if (r.visual) await patchCard(c.id, { card: { ...card, visual: r.visual } });
    else
      await patchCard(c.id, {
        checks: [
          ...c.checks,
          {
            id: crypto.randomUUID(),
            source: "book",
            field: "visual",
            text: "",
            fix: "",
            why: `No ${card.look} could be made: ${r.problem}`,
            state: "open",
          },
        ],
      });
  }
  return true;
}

// The day's cards proofread at once; facts not found in the books noted.
async function proofAll(cards: GkCardRow[]): Promise<boolean> {
  const todo = cards.filter((c) => c.card && !c.proofed);
  if (!todo.length) return false;
  const issues =
    parseIssues(
      await saathiComplete(
        apiKey(),
        proofMessages(todo.map((c, i) => ({ ...(c.card as GkCard), n: i + 1 }))),
      ),
    ) ?? [];
  for (const [i, c] of todo.entries()) {
    const ai: GkCheck[] = issues
      .filter((x) => x.n === i + 1)
      .map((x) => ({ id: crypto.randomUUID(), source: "ai", ...x, state: "open" }));
    const book: GkCheck[] = (c.card as GkCard).facts
      .filter((f) => !f.verified)
      .map((f) => ({
        id: crypto.randomUUID(),
        source: "book",
        field: "points",
        text: f.text,
        fix: "",
        why: `Not found word for word in the books: "${f.quote.slice(0, 120)}". Check it before posting.`,
        state: "open",
      }));
    const kept = c.checks.filter(
      (k) => k.state !== "open" || k.field === "visual" || k.field === "map",
    );
    await patchCard(c.id, { checks: [...kept, ...ai, ...book], proofed: true });
  }
  return true;
}

// ---------- Making the images ----------

async function renderOne(d: GkDay, cards: GkCardRow[], origin: string, settings: GkSettings) {
  const { subject } = await subjectAndTopic(d);
  const { noteMapHtml } = await import("@/lib/notes-map");
  await (await import("@/lib/atlas.server")).primeAtlasLayers();
  for (const lang of ["en", "hi"] as GkLang[]) {
    const c = cards.find((x) => !(lang === "en" ? x.image_en : x.image_hi));
    if (!c?.card) continue;
    const n = cards.indexOf(c) + 1;
    const html = gkCardHtml(c.card, {
      lang,
      design: lang === "en" ? settings.design_en : settings.design_hi,
      n,
      total: cards.length,
      subject: biOf(subject?.name_en ?? "", subject?.name_hi ?? ""),
      dayNo: d.day_no,
      date: d.day,
      channel: channelLabel(settings.channel),
      assetBase: origin,
      watermark: settings.watermark,
      mapHtml: (m, l, accent) => noteMapHtml(m as never, l, accent),
    });
    const png = await screenshot(html);
    const path = `gk/${d.day}/${String(n).padStart(2, "0")}-${lang}-${Date.now()}.png`;
    fail(
      (
        await supabaseAdmin.storage
          .from(BUCKET)
          .upload(path, png, { contentType: "image/png", upsert: true })
      ).error,
    );
    await patchCard(c.id, lang === "en" ? { image_en: path } : { image_hi: path });
    return true;
  }
  return false;
}

// A card's page for the editor's preview (the map drawn, as in the image).
export async function gkCardPreview(id: string, lang: GkLang, origin: string): Promise<string> {
  const { data, error } = await from("gk_cards").select(CARD_COLS).eq("id", id).single();
  fail(error);
  const c = data as unknown as GkCardRow;
  if (!c.card) throw new Error("The card isn't written yet.");
  const d = (await readDay(c.day))!;
  const cards = await cardsOf(c.day);
  const settings = await getGkSettings();
  const { subject } = await subjectAndTopic(d);
  const { noteMapHtml } = await import("@/lib/notes-map");
  await (await import("@/lib/atlas.server")).primeAtlasLayers();
  return gkCardHtml(c.card, {
    lang,
    design: lang === "en" ? settings.design_en : settings.design_hi,
    n: cards.findIndex((x) => x.id === id) + 1,
    total: cards.length,
    subject: biOf(subject?.name_en ?? "", subject?.name_hi ?? ""),
    dayNo: d.day_no,
    date: d.day,
    channel: channelLabel(settings.channel),
    assetBase: origin,
    watermark: settings.watermark,
    mapHtml: (m, l, accent) => noteMapHtml(m as never, l, accent),
  });
}

// ---------- Posting ----------

async function sendAlbum(chat: string, urls: string[], caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  // Telegram albums hold 10 photos: more go as further albums.
  for (let i = 0; i < urls.length; i += 10) {
    const media = urls.slice(i, i + 10).map((u, j) => ({
      type: "photo",
      media: `${u}?v=${Date.now()}`,
      ...(i === 0 && j === 0 && caption.trim() ? telegramCaption(caption) : {}),
    }));
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, media }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!json.ok) throw new Error(`Telegram: ${json.description ?? res.status}`);
  }
}

async function post(d: GkDay, settings: GkSettings) {
  const chat = channelChatId(settings.channel);
  if (!chat) throw new Error("Add the channel link in GK infographics settings.");
  const cards = await cardsOf(d.day);
  if (cards.some((c) => !c.image_en || !c.image_hi))
    throw new Error("Some cards have no image yet.");
  // Hindi first, then English: two albums, each with its own caption.
  await sendAlbum(
    chat,
    cards.map((c) => c.image_hi_url!),
    d.caption_hi,
  );
  await sendAlbum(
    chat,
    cards.map((c) => c.image_en_url!),
    d.caption_en,
  );
  await patchDay(d.day, { status: "posted", posted_at: now(), error: null });
  if (d.topic_id)
    await from("gk_topics")
      .update({ status: "posted", posted_on: d.day } as never)
      .eq("id", d.topic_id);
}

// ---------- The admin's note on Telegram ----------

async function notify(day: string, origin: string | undefined) {
  const settings = await getGkSettings();
  const row = await readDay(day);
  if (!settings.notify || !row || row.notified.includes("review")) return;
  await patchDay(day, { notified: [...row.notified, "review"] });
  const admin = (await CA.getMagazineSettings()).test_chat_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!admin || !token) return;
  const { topic } = await subjectAndTopic(row);
  const cards = await cardsOf(day);
  const open = cards.reduce((n, c) => n + c.checks.filter((x) => x.state === "open").length, 0);
  const link = origin ? `${origin}/admin?section=ca.gk&date=${day}` : "";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: admin,
      text: `🗺️ GK infographics, ${formatDate(day, "en")}: ${cards.length} cards on "${topic?.name_en ?? ""}" are ready to check${open ? ` (${open} notes)` : ""}.`,
      ...(link ? { reply_markup: { inline_keyboard: [[{ text: "Open", url: link }]] } } : {}),
    }),
  }).catch(() => undefined);
}

// ---------- One step ----------

export async function advanceGkDay(day: string, origin?: string): Promise<GkStatus | null> {
  const row = await claim(day);
  if (!row) return (await readDay(day))?.status ?? null;
  const settings = await getGkSettings();
  try {
    if (row.status === "planning") await plan(row);
    else if (row.status === "writing") {
      const cards = await cardsOf(day);
      const did =
        (await writeWords(row, cards)) || (await drawOne(cards)) || (await proofAll(cards));
      if (!did) {
        await patchDay(day, { status: "review", error: null });
        await notify(day, origin);
      }
    } else if (row.status === "rendering") {
      if (!origin) return row.status;
      const cards = await cardsOf(day);
      if (!(await renderOne(row, cards, origin, settings)))
        await patchDay(day, { status: "scheduled", error: null });
    } else if (row.status === "scheduled") {
      if (row.scheduled_for && Date.parse(row.scheduled_for) <= Date.now()) {
        await patchDay(day, { status: "posting" });
        try {
          await post(row, settings);
        } catch (e) {
          await patchDay(day, { status: "failed", error: saathiErrorDetail(e) });
        }
      }
    }
  } catch (e) {
    await patchDay(day, { error: saathiErrorDetail(e) });
    throw e;
  } finally {
    await release(day);
  }
  return (await readDay(day))?.status ?? null;
}

// The minute tick: every day with work to do, a step each.
export async function gkStep(origin?: string): Promise<void> {
  const { data, error } = await from("gk_days")
    .select("day,status,scheduled_for")
    .in("status", ["planning", "writing", "rendering", "scheduled"])
    .order("day")
    .limit(5);
  if (missing(error)) return;
  fail(error);
  for (const d of (data ?? []) as Row[]) {
    if (d.status === "scheduled" && Date.parse(String(d.scheduled_for)) > Date.now()) continue;
    try {
      await advanceGkDay(String(d.day), origin);
    } catch (e) {
      console.error("gk infographics:", saathiErrorDetail(e));
    }
  }
}

// ---------- The editor ----------

type Version = { at: string; label: string; card: GkCard };

export async function saveGkCard(id: string, card: GkCard, label?: string) {
  const { data, error } = await from("gk_cards").select("card,versions").eq("id", id).single();
  fail(error);
  const r = data as unknown as Row;
  const patch: Record<string, unknown> = { card, image_en: null, image_hi: null, checked: false };
  if (label && r.card)
    patch.versions = [
      { at: now(), label, card: r.card },
      ...((r.versions as Version[]) ?? []),
    ].slice(0, 20);
  await patchCard(id, patch as never);
}

export async function gkVersions(id: string): Promise<Version[]> {
  const { data, error } = await from("gk_cards").select("versions").eq("id", id).single();
  fail(error);
  return ((data as unknown as Row).versions as Version[]) ?? [];
}

export async function restoreGkVersion(id: string, at: string): Promise<GkCard> {
  const v = (await gkVersions(id)).find((x) => x.at === at);
  if (!v) throw new Error("That version is no longer kept.");
  await saveGkCard(id, v.card, "Before a restore");
  return v.card;
}

async function cardRow(id: string): Promise<GkCardRow> {
  const { data, error } = await from("gk_cards").select(CARD_COLS).eq("id", id).single();
  fail(error);
  return data as unknown as GkCardRow;
}

// The card's words or points written again (not saved).
export async function rewriteGkPart(id: string, part: GkPart, note: string) {
  const c = await cardRow(id);
  if (!c.card) throw new Error("The card isn't written yet.");
  const out = parsePart(
    part,
    await saathiComplete(apiKey(), partMessages(part, c.card, note, await glossary())),
  );
  if (!out) throw new Error("The AI's version could not be read. Try again.");
  return out;
}

// A new visual for the card (not saved), of the type asked for.
export async function makeGkVisual(id: string, opts: { type?: VisualType; note?: string }) {
  const c = await cardRow(id);
  if (!c.card) throw new Error("The card isn't written yet.");
  const r = await visualFor(c.card, opts);
  if (!r.visual) throw new Error(`SAATHI couldn't make it from the card's facts: ${r.problem}`);
  return { visual: r.visual, covers: [] as number[] };
}

// A map of the card's places (not saved).
export async function suggestGkMap(id: string): Promise<MapSpec> {
  const c = await cardRow(id);
  if (!c.card) throw new Error("The card isn't written yet.");
  const map = await mapFor(c.card);
  if (!map) throw new Error("SAATHI found no place in the card's facts for a map.");
  return map;
}

export async function setGkCheck(id: string, checkId: string, state: GkCheck["state"]) {
  const c = await cardRow(id);
  const k = c.checks.find((x) => x.id === checkId);
  if (!k) throw new Error("That note is gone.");
  let card = c.card;
  if (state === "accepted" && card && k.fix) card = applyGkFix(card, k.field, k.text, k.fix);
  const checks = c.checks.map((x) => (x.id === checkId ? { ...x, state } : x));
  await patchCard(id, {
    checks,
    ...(card !== c.card ? { card, image_en: null, image_hi: null } : {}),
  });
  return { ...c, checks, card };
}

export async function setGkChecked(id: string, checked: boolean) {
  const c = await cardRow(id);
  if (checked && c.checks.some((x) => x.state === "open"))
    throw new Error("Decide the notes first.");
  await patchCard(id, { checked });
}

export async function moveGkCard(id: string, by: -1 | 1) {
  const c = await cardRow(id);
  const cards = await cardsOf(c.day);
  const at = cards.findIndex((x) => x.id === id);
  const to = at + by;
  if (to < 0 || to >= cards.length) return;
  const order = [...cards];
  [order[at], order[to]] = [order[to], order[at]];
  for (const [i, x] of order.entries())
    await patchCard(x.id, { position: i + 1, image_en: null, image_hi: null });
}

export async function deleteGkCard(id: string) {
  const c = await cardRow(id);
  const d = await readDay(c.day);
  if (d && !["writing", "review"].includes(d.status)) throw new Error("Cancel the schedule first.");
  fail((await from("gk_cards").delete().eq("id", id)).error);
}

// ---------- Approving ----------

export async function approveGkDay(
  day: string,
  captions: { en: string; hi: string },
  postNow = false,
  at?: string,
) {
  const d = await readDay(day);
  if (!d || !["review", "failed", "cancelled"].includes(d.status))
    throw new Error("Only cards waiting for review can be approved.");
  const settings = await getGkSettings();
  if (!channelChatId(settings.channel))
    throw new Error("Add the channel link in GK settings first.");
  const cards = await cardsOf(day);
  if (!cards.length || cards.some((c) => !c.card))
    throw new Error("Some cards aren't written yet.");
  const unticked = cards.filter((c) => !c.checked);
  if (unticked.length)
    throw new Error(`Tick every card as checked first (${unticked.length} left).`);
  for (const [l, c] of Object.entries(captions))
    if (captionText(c).length > CAPTION_MAX)
      throw new Error(`The ${l === "hi" ? "Hindi" : "English"} caption is too long for Telegram.`);
  let when = new Date();
  if (!postNow) {
    const { igPostDefault } = await import("@/lib/ig-words");
    when = at ? new Date(at) : igPostDefault(settings.post_time);
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() - 2 * 60_000)
      throw new Error("That posting time has passed: choose a later one.");
  }
  await patchDay(day, {
    status: "rendering",
    caption_en: captions.en,
    caption_hi: captions.hi,
    scheduled_for: when.toISOString(),
    error: null,
  });
}

export async function cancelGkDay(day: string) {
  const d = await readDay(day);
  if (!d || !["rendering", "scheduled", "failed"].includes(d.status))
    throw new Error("Only a scheduled day can go back to review.");
  await patchDay(day, { status: "review", scheduled_for: null, error: null });
}

export async function postGkNow(day: string) {
  await patchDay(day, { scheduled_for: now() });
}

// Back to planning the same topic (the cards are dropped).
export async function replanGkDay(day: string) {
  const d = await readDay(day);
  if (!d?.topic_id) throw new Error("Pick a topic first.");
  return startGkDay(day, d.topic_id);
}

// The days posted, newest first.
export async function gkHistory(): Promise<
  { day: string; day_no: number; subject: string; topic: string; cards: number; status: string }[]
> {
  const { data, error } = await from("gk_days")
    .select("day,day_no,status,subject_id,topic_id")
    .order("day", { ascending: false })
    .limit(120);
  if (missing(error)) return [];
  fail(error);
  const rows = (data ?? []) as Row[];
  const [{ data: s }, { data: t }, { data: c }] = await Promise.all([
    from("gk_subjects").select("id,name_en"),
    from("gk_topics").select("id,name_en"),
    from("gk_cards")
      .select("day")
      .in(
        "day",
        rows.map((r) => String(r.day)),
      ),
  ]);
  const name = (list: unknown, id: unknown) =>
    String(((list ?? []) as Row[]).find((x) => x.id === id)?.name_en ?? "");
  return rows.map((r) => ({
    day: String(r.day),
    day_no: Number(r.day_no),
    status: String(r.status),
    subject: name(s, r.subject_id),
    topic: name(t, r.topic_id),
    cards: ((c ?? []) as Row[]).filter((x) => x.day === r.day).length,
  }));
}
