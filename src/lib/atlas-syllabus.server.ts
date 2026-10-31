// Server-only: the atlas on the syllabus. Each chapter heading's facts are
// filed under topics of the master outlines (by the AI in the background,
// or by the editor), kept in bot_settings ("atlas_syllabus"), and counted
// per topic so the editor sees the syllabus topics with few or no facts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import { cleanFactText, headingSources, splitSources } from "@/lib/atlas";
import {
  ATLAS_SECTIONS,
  SYLLABUS_BATCH,
  groupKey,
  parseSyllabusLinks,
  sectionsOutline,
  syllabusLinkMessages,
  topicCounts,
} from "@/lib/atlas-syllabus";
import type { MasterTopic } from "@/lib/outline";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const KEY = "atlas_syllabus";
// links: group → topic ids. manual: groups the editor filed (not refiled
// by the AI). pending: groups waiting for the AI.
type State = {
  links: Record<string, string[]>;
  manual: Record<string, boolean>;
  pending: string[];
  error: string | null;
};

async function state(): Promise<State> {
  const { data } = await from("bot_settings").select("value").eq("key", KEY).maybeSingle();
  const v = ((data as Row | null)?.value ?? {}) as Partial<State>;
  return {
    links: v.links ?? {},
    manual: v.manual ?? {},
    pending: v.pending ?? [],
    error: v.error ?? null,
  };
}
async function save(s: State) {
  fail(
    (
      await from("bot_settings").upsert({
        key: KEY,
        value: s,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}

export type FactGroup = {
  key: string;
  chapter: string;
  heading: string;
  facts: number;
  sample: string[];
};

// The atlas's facts by chapter heading.
async function factGroups(): Promise<FactGroup[]> {
  const groups = new Map<string, FactGroup>();
  for (let at = 0; ; at += 1000) {
    const { data, error } = await from("atlas_facts")
      .select("chapter,chapter_key,heading,text_en,position")
      .neq("status", "hidden")
      .order("chapter_key")
      .order("position")
      .range(at, at + 999);
    fail(error);
    for (const f of (data ?? []) as Row[]) {
      const key = groupKey(String(f.chapter_key ?? ""), String(f.heading ?? ""));
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          chapter: String(f.chapter ?? ""),
          heading: headingSources(String(f.heading ?? "")).heading,
          facts: 0,
          sample: [],
        };
        groups.set(key, g);
      }
      g.facts++;
      if (g.sample.length < 4) {
        const t = splitSources(cleanFactText(String(f.text_en ?? ""))).text;
        if (t) g.sample.push(t.slice(0, 160));
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...groups.values()];
}

async function outlineTopics(): Promise<MasterTopic[] | null> {
  const { data, error } = await from("master_topics")
    .select("id,section,parent_id,level,position,name_en,name_hi")
    .in("section", ATLAS_SECTIONS);
  if (error) return null; // no master outlines yet
  return (data ?? []) as unknown as MasterTopic[];
}

// The coverage page: each section's outline with its facts per topic, the
// groups and where they are filed, and the AI's progress.
export async function syllabusCoverage() {
  const [topics, groups, s] = await Promise.all([outlineTopics(), factGroups(), state()]);
  if (!topics) return { ready: false as const };
  const facts = Object.fromEntries(groups.map((g) => [g.key, g.facts]));
  const ids = new Set(topics.map((t) => t.id));
  const links = Object.fromEntries(
    Object.entries(s.links).map(([g, t]) => [g, t.filter((x) => ids.has(x))]),
  );
  const counts = topicCounts(topics, links, facts);
  // Past exam questions filed under each topic (and its subtopics).
  const perTopic = await (await import("@/lib/atlas-exams.server")).askedPerTopic();
  const asked = new Map<string, number>();
  const sum = (id: string): number => {
    const n =
      (perTopic.get(id) ?? 0) +
      topics.filter((t) => t.parent_id === id).reduce((s, t) => s + sum(t.id), 0);
    asked.set(id, n);
    return n;
  };
  for (const t of topics.filter((x) => !x.parent_id)) sum(t.id);
  return {
    ready: true as const,
    sections: ATLAS_SECTIONS.filter((x) => topics.some((t) => t.section === x)),
    topics: topics.map((t) => ({ ...t, ...counts.get(t.id)!, asked: asked.get(t.id) ?? 0 })),
    groups: groups.map((g) => ({
      ...g,
      topics: links[g.key] ?? null, // null: not filed yet
      manual: !!s.manual[g.key],
    })),
    pending: s.pending.length,
    error: s.error,
  };
}

// Files the groups not filed yet (or all but the editor's, `again`) in the
// background.
export async function startSyllabusLinks(again: boolean) {
  const [groups, s] = await Promise.all([factGroups(), state()]);
  const topics = await outlineTopics();
  if (!topics?.length) throw new Error("Make the master outlines of the Rajasthan sections first.");
  const pending = groups.map((g) => g.key).filter((k) => !s.manual[k] && (again || !s.links[k]));
  await save({ ...s, pending, error: null });
  return { pending: pending.length };
}

// The editor's own filing of a group.
export async function setGroupTopics(key: string, topicIds: string[]) {
  const s = await state();
  s.links[key] = [...new Set(topicIds)];
  s.manual[key] = true;
  s.pending = s.pending.filter((k) => k !== key);
  await save(s);
}

// One batch of the background filing (from the atlas step).
export async function syllabusStep(): Promise<{ did: string | null }> {
  const s = await state();
  if (!s.pending.length) return { did: null };
  const topics = await outlineTopics();
  if (!topics?.length) {
    await save({ ...s, pending: [], error: "No master outlines for the Rajasthan sections." });
    return { did: null };
  }
  const groups = new Map((await factGroups()).map((g) => [g.key, g]));
  const batch = s.pending.slice(0, SYLLABUS_BATCH).filter((k) => groups.has(k));
  const rest = s.pending.slice(SYLLABUS_BATCH);
  const outline = sectionsOutline(topics);
  try {
    const raw = await saathiComplete(
      apiKey(),
      syllabusLinkMessages(
        outline.text,
        batch.map((k, i) => {
          const g = groups.get(k)!;
          return { n: i + 1, chapter: g.chapter, heading: g.heading, facts: g.sample };
        }),
      ),
    );
    const got = parseSyllabusLinks(
      raw,
      batch.map((_, i) => i + 1),
      outline.ids.length,
    );
    const now = await state(); // the editor may have filed some meanwhile
    batch.forEach((k, i) => {
      const t = got.get(i + 1);
      if (t && !now.manual[k]) now.links[k] = t.map((n) => outline.ids[n - 1]);
    });
    await save({ ...now, pending: now.pending.filter((k) => !batch.includes(k)), error: null });
  } catch (e) {
    console.error("atlas syllabus:", saathiErrorDetail(e));
    await save({ ...s, pending: rest, error: saathiErrorDetail(e) });
  }
  return { did: "syllabus" };
}
