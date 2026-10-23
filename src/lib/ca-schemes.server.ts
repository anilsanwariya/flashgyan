// The scheme register (server): links each scheme story to its scheme's
// record on the collection schedule, and serves the register page and the
// "Earlier" lines the magazine prints.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete } from "../../supabase/functions/_shared/saathi-core.ts";
import {
  EARLIER_SHOWN,
  normName,
  parseSame,
  sameSchemeMessages,
  schemeNameOf,
  type CaScheme,
  type Earlier,
  type SchemeLevel,
} from "@/lib/ca-schemes";
import { cosine, parseVector } from "@/lib/ca-duplicates";
import type { Bi, CaContent, CaFact } from "@/lib/current-affairs";
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

// A database without the scheme register migration.
const missing = (e: { message: string } | null) =>
  !!e && /ca_schemes|scheme_id|scheme_checked|story_type/.test(e.message);
export const SCHEMES_NOT_READY =
  "The scheme register needs a database update: run the latest migration (ca_scheme_register) in Lovable or the SQL editor.";

// Names this close are the same scheme; closer than the lower one, the AI
// decides.
const SURE = 0.93;
const MAYBE = 0.8;
// Stories linked per run.
const BATCH = 5;

type SchemeRow = CaScheme & { embedding: unknown };
type StoryRow = {
  id: string;
  issue_date: string;
  headline: string;
  rajasthan: boolean;
  facts: CaFact[];
  content: CaContent | null;
};

async function allSchemes(): Promise<(SchemeRow & { vec: number[] | null })[]> {
  const { data, error } = await from("ca_schemes").select("*");
  fail(error);
  return ((data ?? []) as unknown as SchemeRow[]).map((s) => ({
    ...s,
    vec: parseVector(s.embedding),
  }));
}

// Links one story to its scheme's record (found by name, by a close name the
// AI confirms, or made new). Null when the story names no scheme.
export async function linkStory(story: StoryRow): Promise<string | null> {
  const name = schemeNameOf(story.facts);
  if (!name) return null;
  const level: SchemeLevel = story.rajasthan ? "rajasthan" : "central";
  const key = normName(name);
  const schemes = await allSchemes();
  let found = schemes.find(
    (s) => normName(s.name) === key || s.aliases.some((a) => normName(a) === key),
  );
  const vec = await CA.embedText(name);
  if (!found) {
    const close = schemes
      .filter((s) => s.vec)
      .map((s) => ({ s, score: cosine(vec, s.vec!) }))
      .filter((x) => x.score >= MAYBE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (close[0]?.score >= SURE) found = close[0].s;
    else if (close.length) {
      const i = parseSame(
        await saathiComplete(
          apiKey(),
          sameSchemeMessages(
            name,
            story.facts.map((f) => f.text),
            close.map((x) => x.s),
          ),
        ),
        close.length,
      );
      if (i >= 0) found = close[i].s;
    }
    // Another name for it, to match next time.
    if (found && normName(found.name) !== key)
      fail(
        (
          await from("ca_schemes")
            .update({
              aliases: [...new Set([...found.aliases, name])].slice(0, 20),
              updated_at: now(),
            } as never)
            .eq("id", found.id)
        ).error,
      );
  }
  let id = found?.id;
  if (!id) {
    const at = story.facts.findIndex((f) => f.slot === "name");
    const point =
      story.content?.points.length === story.facts.length ? story.content.points[at] : null;
    const { data, error } = await from("ca_schemes")
      .insert({
        name,
        name_hi: point?.hi ?? "",
        level,
        embedding: vec as unknown as string,
      } as never)
      .select("id")
      .single();
    fail(error);
    id = (data as unknown as { id: string }).id;
  }
  fail(
    (
      await from("ca_items")
        .update({ scheme_id: id, scheme_checked: true } as never)
        .eq("id", story.id)
    ).error,
  );
  return id;
}

// Scheme stories not yet looked at, newest days last (the archive in order).
async function waiting(limit: number) {
  const { data, error } = await from("ca_items")
    .select("id,issue_date,headline,rajasthan,facts,content")
    .eq("story_type", "scheme")
    .eq("scheme_checked", false)
    .eq("status", "included")
    .not("issue_date", "is", null)
    .order("issue_date")
    .limit(limit);
  return { rows: (data ?? []) as unknown as StoryRow[], error };
}

// Links the next few scheme stories (the collection schedule, or "Link
// now"). Null when none wait.
export async function schemeStep(): Promise<string | null> {
  const { rows, error } = await waiting(BATCH);
  if (missing(error)) return null;
  fail(error);
  if (!rows.length) return null;
  let linked = 0;
  for (const r of rows) {
    if (await linkStory(r)) linked++;
    else
      await from("ca_items")
        .update({ scheme_checked: true } as never)
        .eq("id", r.id);
  }
  return `scheme register: linked ${linked} of ${rows.length} stories`;
}

// ---------- The register page ----------

export type SchemeSummary = CaScheme & {
  stories: number;
  first: string | null;
  last: string | null;
};
export type SchemeStory = {
  id: string;
  issue_date: string;
  headline: string;
  status: string;
};

export async function listSchemes(): Promise<{
  ready: boolean;
  schemes: SchemeSummary[];
  waiting: number;
}> {
  const { data, error } = await from("ca_schemes")
    .select("id,name,name_hi,level,aliases,created_at,updated_at")
    .order("name");
  if (missing(error)) return { ready: false, schemes: [], waiting: 0 };
  fail(error);
  const schemes = (data ?? []) as unknown as CaScheme[];
  // A page at a time: one request returns at most 1,000 rows.
  const linked: { scheme_id: string; issue_date: string }[] = [];
  for (let at = 0; ; at += 1000) {
    const { data: page, error: pErr } = await from("ca_items")
      .select("scheme_id,issue_date")
      .not("scheme_id", "is", null)
      .not("issue_date", "is", null)
      .order("id")
      .range(at, at + 999);
    fail(pErr);
    linked.push(...((page ?? []) as { scheme_id: string; issue_date: string }[]));
    if ((page ?? []).length < 1000) break;
  }
  const span = new Map<string, { n: number; first: string; last: string }>();
  for (const r of linked) {
    const s = span.get(r.scheme_id);
    if (!s) span.set(r.scheme_id, { n: 1, first: r.issue_date, last: r.issue_date });
    else {
      s.n++;
      if (r.issue_date < s.first) s.first = r.issue_date;
      if (r.issue_date > s.last) s.last = r.issue_date;
    }
  }
  const { count } = await from("ca_items")
    .select("id", { count: "exact", head: true })
    .eq("story_type", "scheme")
    .eq("scheme_checked", false)
    .eq("status", "included")
    .not("issue_date", "is", null);
  return {
    ready: true,
    schemes: schemes
      .map((s) => ({
        ...s,
        stories: span.get(s.id)?.n ?? 0,
        first: span.get(s.id)?.first ?? null,
        last: span.get(s.id)?.last ?? null,
      }))
      .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || a.name.localeCompare(b.name)),
    waiting: count ?? 0,
  };
}

export async function schemeStories(id: string): Promise<SchemeStory[]> {
  const { data, error } = await from("ca_items")
    .select("id,issue_date,headline,status,content")
    .eq("scheme_id", id)
    .not("issue_date", "is", null)
    .order("issue_date");
  fail(error);
  return ((data ?? []) as unknown as (SchemeStory & { content: CaContent | null })[]).map(
    ({ content, ...r }) => ({ ...r, headline: content?.headline.en || r.headline }),
  );
}

export async function renameScheme(id: string, name: string, nameHi: string, level: SchemeLevel) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!normName(clean)) throw new Error("Give the scheme's name.");
  const { data } = await from("ca_schemes").select("name,aliases").eq("id", id).single();
  const old = data as unknown as { name: string; aliases: string[] };
  fail(
    (
      await from("ca_schemes")
        .update({
          name: clean,
          name_hi: nameHi.replace(/\s+/g, " ").trim().slice(0, 160),
          level,
          // The old name still matches stories.
          aliases:
            old.name !== clean
              ? [...new Set([...old.aliases, old.name])].slice(0, 20)
              : old.aliases,
          embedding: (await CA.embedText(clean)) as unknown as string,
          updated_at: now(),
        } as never)
        .eq("id", id)
    ).error,
  );
}

// Two records of one scheme become one: the stories and names move over.
export async function mergeSchemes(fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("Pick another scheme.");
  const { data } = await from("ca_schemes").select("id,name,aliases").in("id", [fromId, intoId]);
  const rows = (data ?? []) as unknown as { id: string; name: string; aliases: string[] }[];
  const a = rows.find((r) => r.id === fromId);
  const b = rows.find((r) => r.id === intoId);
  if (!a || !b) throw new Error("No such scheme");
  fail(
    (
      await from("ca_items")
        .update({ scheme_id: intoId } as never)
        .eq("scheme_id", fromId)
    ).error,
  );
  fail(
    (
      await from("ca_schemes")
        .update({
          aliases: [...new Set([...b.aliases, a.name, ...a.aliases])].slice(0, 20),
          updated_at: now(),
        } as never)
        .eq("id", intoId)
    ).error,
  );
  fail((await from("ca_schemes").delete().eq("id", fromId)).error);
}

// Takes a story out of its scheme's record (it stays looked at).
export async function unlinkStory(itemId: string) {
  fail(
    (
      await from("ca_items")
        .update({ scheme_id: null, scheme_checked: true } as never)
        .eq("id", itemId)
    ).error,
  );
}

// ---------- Printing ----------

// For each printed story on a registered scheme, the stories before it on
// that scheme (latest first). A custom magazine's copy goes by the daily
// story it came from.
export async function earlierFor(
  items: { id: string; issue_date: string; origin_id?: string | null }[],
): Promise<Map<string, Earlier[]>> {
  const out = new Map<string, Earlier[]>();
  const own = new Map(items.map((i) => [i.id, i.origin_id || i.id]));
  const ids = [...new Set(own.values())];
  const schemeOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await from("ca_items")
      .select("id,scheme_id")
      .in("id", ids.slice(i, i + 150))
      .not("scheme_id", "is", null);
    if (error) return out;
    for (const r of (data ?? []) as { id: string; scheme_id: string }[])
      schemeOf.set(r.id, r.scheme_id);
  }
  const schemes = [...new Set(schemeOf.values())];
  if (!schemes.length) return out;
  const { data, error } = await from("ca_items")
    .select("id,scheme_id,issue_date,headline,content")
    .in("scheme_id", schemes)
    .eq("status", "included")
    .not("issue_date", "is", null)
    .order("issue_date", { ascending: false });
  if (error) return out;
  const linked = (data ?? []) as unknown as {
    id: string;
    scheme_id: string;
    issue_date: string;
    headline: string;
    content: CaContent | null;
  }[];
  for (const it of items) {
    const self = own.get(it.id)!;
    const scheme = schemeOf.get(self);
    if (!scheme) continue;
    const before = linked
      .filter((l) => l.scheme_id === scheme && l.id !== self && l.issue_date < it.issue_date)
      .slice(0, EARLIER_SHOWN)
      .map((l) => ({
        date: l.issue_date,
        headline: (l.content?.headline ?? { en: l.headline, hi: l.headline }) as Bi,
      }));
    if (before.length) out.set(it.id, before);
  }
  return out;
}
