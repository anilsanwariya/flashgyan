// The atlas's proofreading desk (admin): a subject's topics and subtopics
// with how far each is checked, their facts to read, correct, verify, hide
// or delete, and the places and districts each fact is about — tagged and
// untagged, or a new place made on the spot. What the editor tags or
// deletes is remembered, so importing the files again keeps it.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import {
  APPROX_NOTE,
  ATLAS_CATS,
  type AtlasFact,
  type AtlasPlace,
  type AtlasStatus,
} from "@/lib/atlas";
import { DELETED_KEY, LINKED_KEY, UNLINKED_KEY } from "@/lib/atlas-cleanup.server";

const from = (t: string) => supabaseAdmin.from(t as never);
type Row = Record<string, unknown>;
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail(
    (
      await from("bot_settings").upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
}
async function all<T>(
  q: () => {
    range: (
      a: number,
      b: number,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q().range(i, i + 999);
    fail(error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const done = async () => (await import("@/lib/atlas.server")).invalidateAtlas();

// ---------- The outline ----------

export type Counts = { total: number; verified: number; to_check: number; hidden: number };
export type ProofTopic = {
  key: string;
  title: string;
  subject: string;
  counts: Counts;
  subtopics: { name: string; counts: Counts }[];
};
const zero = (): Counts => ({ total: 0, verified: 0, to_check: 0, hidden: 0 });
const add = (c: Counts, s: AtlasStatus) => {
  c.total++;
  c[s]++;
};

// Every subject's topics (chapters) and subtopics (first heading), counted.
export async function proofOutline(): Promise<ProofTopic[]> {
  const rows = await all<
    Pick<AtlasFact, "subject" | "chapter_key" | "chapter" | "heading" | "status">
  >(() =>
    from("atlas_facts")
      .select("subject,chapter_key,chapter,heading,status")
      .order("chapter_key")
      .order("position"),
  );
  const topics = new Map<string, ProofTopic>();
  for (const r of rows) {
    let t = topics.get(r.chapter_key);
    if (!t)
      topics.set(
        r.chapter_key,
        (t = {
          key: r.chapter_key,
          title: r.chapter,
          subject: r.subject,
          counts: zero(),
          subtopics: [],
        }),
      );
    add(t.counts, r.status);
    const name = r.heading.split(" › ")[0] ?? "";
    let s = t.subtopics.find((x) => x.name === name);
    if (!s) t.subtopics.push((s = { name, counts: zero() }));
    add(s.counts, r.status);
  }
  return [...topics.values()].sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
}

// ---------- The facts ----------

export type ProofFact = AtlasFact & {
  // The places it is tagged with, named.
  placeNames: Record<string, { name: string; district: string; cat: string }>;
};

export async function proofList(f: {
  chapter: string;
  subtopic?: string;
  status?: AtlasStatus | "all";
  q?: string;
  page?: number;
}): Promise<{ rows: ProofFact[]; total: number }> {
  let q = from("atlas_facts")
    .select(
      "id,key,subject,chapter_key,chapter,heading,text_en,text_hi,table_head,flags,entities,position,status,note,hi_ai,source,edited,in_file",
      { count: "exact" },
    )
    .eq("chapter_key", f.chapter);
  if (f.subtopic !== undefined) {
    const t = f.subtopic.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(`heading.eq.${JSON.stringify(f.subtopic)},heading.like.${JSON.stringify(`${t} › %`)}`);
  }
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.q?.trim()) {
    const t = f.q.trim().replace(/[%,()"]/g, " ");
    q = q.or(`text_en.ilike.%${t}%,text_hi.ilike.%${t}%,heading.ilike.%${t}%,note.ilike.%${t}%`);
  }
  const page = f.page ?? 0;
  const { data, count, error } = await q.order("position").range(page * 50, page * 50 + 49);
  fail(error);
  const rows = (data ?? []) as unknown as AtlasFact[];
  const keys = [
    ...new Set(
      rows.flatMap((r) => r.entities.filter((e) => e.startsWith("P:")).map((e) => e.slice(2))),
    ),
  ];
  const names: ProofFact["placeNames"] = {};
  for (let i = 0; i < keys.length; i += 100) {
    const { data: pl } = await from("atlas_places")
      .select("key,name_en,label_en,district,cat")
      .in("key", keys.slice(i, i + 100));
    for (const p of (pl ?? []) as unknown as AtlasPlace[])
      names[p.key] = { name: p.label_en || p.name_en, district: p.district, cat: p.cat };
  }
  return {
    rows: rows.map((r) => ({ ...r, placeNames: names })),
    total: count ?? 0,
  };
}

// Many facts' status at once.
export async function setStatus(ids: string[], status: AtlasStatus) {
  for (let i = 0; i < ids.length; i += 100)
    fail(
      (
        await from("atlas_facts")
          .update({ status, edited: true, updated_at: new Date().toISOString() } as never)
          .in("id", ids.slice(i, i + 100))
      ).error,
    );
  await done();
}

// Deleted for good, and left out when the files are imported again.
export async function deleteFacts(ids: string[]) {
  const keys: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await from("atlas_facts")
      .select("key")
      .in("id", ids.slice(i, i + 100));
    fail(error);
    keys.push(...((data ?? []) as Row[]).map((r) => String(r.key)));
  }
  const deleted = new Set(await setting<string[]>(DELETED_KEY, []));
  for (const k of keys) if (!k.startsWith("admin-")) deleted.add(k);
  await saveSetting(DELETED_KEY, [...deleted]);
  for (let i = 0; i < ids.length; i += 100)
    fail(
      (
        await from("atlas_facts")
          .delete()
          .in("id", ids.slice(i, i + 100))
      ).error,
    );
  await done();
  return { deleted: ids.length };
}

// ---------- Tags ----------

const entityOk = (e: string) =>
  (e.startsWith("D:") && RAJ_DISTRICTS.some((d) => `D:${d.en}` === e)) ||
  (e.startsWith("P:") && e.length > 2);

// Tag a fact with a place ("P:<key>") or district ("D:<name>").
export async function tagFact(id: string, entity: string) {
  if (!entityOk(entity)) throw new Error("That isn't a place or district of the atlas.");
  if (entity.startsWith("P:")) {
    const { data } = await from("atlas_places")
      .select("key")
      .eq("key", entity.slice(2))
      .maybeSingle();
    if (!data) throw new Error("That place isn't in the atlas.");
  }
  const { data, error } = await from("atlas_facts").select("id,key,entities").eq("id", id).single();
  fail(error);
  const f = data as unknown as AtlasFact;
  const entities = [...new Set([...f.entities, entity])].sort();
  fail(
    (
      await from("atlas_facts")
        .update({ entities } as never)
        .eq("id", id)
    ).error,
  );
  // Remembered: added, and no longer unlinked.
  const linked = await setting<Record<string, string[]>>(LINKED_KEY, {});
  linked[f.key] = [...new Set([...(linked[f.key] ?? []), entity])];
  await saveSetting(LINKED_KEY, linked);
  const off = await setting<Record<string, string[]>>(UNLINKED_KEY, {});
  if (off[f.key]) {
    off[f.key] = off[f.key].filter((x) => x !== entity && `P:${x}` !== entity);
    await saveSetting(UNLINKED_KEY, off);
  }
  await done();
  return entities;
}

export async function untagFact(id: string, entity: string) {
  const { data, error } = await from("atlas_facts").select("id,key,entities").eq("id", id).single();
  fail(error);
  const f = data as unknown as AtlasFact;
  const entities = f.entities.filter((e) => e !== entity);
  fail(
    (
      await from("atlas_facts")
        .update({ entities } as never)
        .eq("id", id)
    ).error,
  );
  const off = await setting<Record<string, string[]>>(UNLINKED_KEY, {});
  const mark = entity.startsWith("P:") ? entity.slice(2) : entity;
  off[f.key] = [...new Set([...(off[f.key] ?? []), mark])];
  await saveSetting(UNLINKED_KEY, off);
  const linked = await setting<Record<string, string[]>>(LINKED_KEY, {});
  if (linked[f.key]) {
    linked[f.key] = linked[f.key].filter((x) => x !== entity);
    await saveSetting(LINKED_KEY, linked);
  }
  await done();
  return entities;
}

// Places to tag with: by name (English or Hindi), the best first.
export async function findPlaces(q: string) {
  const t = q.trim().replace(/[%,()"]/g, " ");
  if (t.length < 2) return [];
  const { data, error } = await from("atlas_places")
    .select("key,name_en,name_hi,label_en,district,cat,status")
    .or(`name_en.ilike.%${t}%,name_hi.ilike.%${t}%,label_en.ilike.%${t}%`)
    .neq("status", "hidden")
    .limit(30);
  fail(error);
  const low = t.toLowerCase();
  return ((data ?? []) as unknown as AtlasPlace[])
    .map((p) => ({
      key: p.key,
      name: p.label_en || p.name_en,
      nameHi: p.name_hi,
      district: p.district,
      cat: p.cat,
      status: p.status,
    }))
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(low)) -
          Number(!b.name.toLowerCase().startsWith(low)) || a.name.length - b.name.length,
    )
    .slice(0, 15);
}

// A new place, pinned at its district's centre until its position is set
// (it shows on the position checks list), and tagged on the fact.
export async function newPlaceForFact(
  id: string,
  p: { name_en: string; name_hi: string; cat: string; district: string },
) {
  const d = RAJ_DISTRICTS.find((x) => x.en === p.district);
  if (!d) throw new Error("Choose the place's district.");
  if (!ATLAS_CATS.some((c) => c.key === p.cat)) throw new Error("Choose the kind of place.");
  const { savePlace } = await import("@/lib/atlas.server");
  const before = new Date().toISOString();
  await savePlace({
    name_en: p.name_en.trim(),
    name_hi: p.name_hi.trim(),
    cat: p.cat,
    district: d.en,
    lon: d.at[0],
    lat: d.at[1],
    status: "verified",
    note_en: `${APPROX_NOTE} at ${d.en}'s centre, until its position is set.`,
  } as Partial<AtlasPlace>);
  const { data } = await from("atlas_places")
    .select("key")
    .eq("source", "admin")
    .eq("name_en", p.name_en.trim())
    .gte("updated_at", before)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const key = String((data as Row | null)?.key ?? "");
  if (!key) throw new Error("The place couldn't be made.");
  const entities = await tagFact(id, `P:${key}`);
  return { key, entities };
}
