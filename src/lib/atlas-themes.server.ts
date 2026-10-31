// Server-only: filling the atlas's history and culture themes from the
// editor's own notes. The AI reads the verified facts a batch a step and
// suggests places for the theme categories (battles, dynasty seats, saints,
// folk deities, fairs, dances, painting schools, crafts, constituencies),
// with their years or months where the facts state them, or adds those to
// places already there. Nothing reaches students until the editor accepts
// it: an accepted place is verified and linked to the facts it came from.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { saathiComplete, saathiErrorDetail } from "../../supabase/functions/_shared/saathi-core.ts";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import { matchPlace } from "@/lib/geo-places";
import { atlasCat, districtName } from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";
import { districtAt, slug } from "@/lib/atlas-import.server";
import { invalidateAtlas, matchAtlasPlace, placeCols } from "@/lib/atlas.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}
const missing = (e: { message: string } | null) =>
  !!e && /atlas_suggestions|era_from|months|schema cache|does not exist/i.test(e.message);
export const THEMES_NOT_READY = "Suggestions need the migration 20261215090000_atlas_themes.sql.";

// The categories suggestions are made for.
export const THEME_CATS = [
  "battle",
  "dynasty",
  "saint",
  "folkdeity",
  "temple",
  "fair",
  "cattlefair",
  "dance",
  "music",
  "painting",
  "craft",
  "fort",
  "heritage",
  "archaeo",
  "seat",
] as const;

export const SUGGEST_SYSTEM = `You read numbered facts from a teacher's Rajasthan GK notes (for RPSC and RSSB exams) and list the places they name in these categories:
${THEME_CATS.map((k) => `- ${k}: ${atlasCat(k).name.en}`).join("\n")}
For each: what it is (its name, in English and Hindi), the category, the town or village it is at (in English and Hindi; for a dynasty its capital; for a dance, painting school or craft the place it comes from; for a constituency its headquarters town), the district, and the numbers of the facts that state it. Add the years only when the facts state them (from and to; one year twice for a single event; BCE as negative numbers), and a fair's months only when the facts give the month or the Hindu month (as its usual Gregorian months: Chaitra 3–4, Vaishakh 4–5, Jyeshtha 5–6, Ashadh 6–7, Shravan 7–8, Bhadrapad 8–9, Ashvin 9–10, Kartik 10–11, Margashirsha 11–12, Paush 12–1, Magh 1–2, Phalgun 2–3). Use only what the facts state; never add a place, year or month from your own knowledge. Places in the "Already in the atlas" list: give only new years or months for them, with their key.
Reply with JSON only: {"items": [{"cat": "...", "name": {"en": "...", "hi": "..."}, "at": {"en": "...", "hi": "..."}, "district": "...", "era_from": null, "era_to": null, "months": [], "facts": [1, 2]}], "updates": [{"key": "...", "era_from": null, "era_to": null, "months": [], "facts": [3]}]}`;

type Job = { chapters: string[]; at: number; error: string | null };
const JOB_KEY = "atlas_themes_job";
async function setting<T>(key: string, dflt: T): Promise<T> {
  const { data } = await from("bot_settings").select("value").eq("key", key).maybeSingle();
  return ((data as Row | null)?.value as T) ?? dflt;
}
async function saveSetting(key: string, value: unknown) {
  fail((await from("bot_settings").upsert({ key, value, updated_at: now() } as never)).error);
}
const BATCH = 60;

export type Suggestion = {
  id: string;
  key: string;
  kind: "new" | "update";
  place_key: string;
  data: {
    cat: string;
    name: Bi;
    at?: Bi;
    district: string;
    lat: number | null;
    lon: number | null;
    // Where the position came from.
    found: "atlas" | "place list" | "district" | "none";
    era_from: number | null;
    era_to: number | null;
    months: number[];
    // For an update: the place as it is.
    place?: { name: string; era_from: number | null; era_to: number | null; months: number[] };
  };
  facts: string[];
  status: "open" | "accepted" | "rejected";
  quotes?: string[];
};

// ---------- The background job ----------

export async function startSuggestions(chapter?: string) {
  const probe = await from("atlas_suggestions").select("id").limit(1);
  if (missing(probe.error)) throw new Error(THEMES_NOT_READY);
  fail(probe.error);
  const { data } = await from("atlas_facts").select("chapter_key").eq("status", "verified");
  const all = [
    ...new Set(((data ?? []) as Row[]).map((r) => String(r.chapter_key)).filter(Boolean)),
  ];
  const chapters = chapter ? all.filter((c) => c === chapter) : all.sort();
  await saveSetting(JOB_KEY, { chapters, at: 0, error: null } satisfies Job);
  return { chapters: chapters.length };
}
export async function stopSuggestions() {
  await saveSetting(JOB_KEY, { chapters: [], at: 0, error: null } satisfies Job);
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v > -5000 && v < 2200 ? v : null;
const monthList = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : []).map(Number).filter((m) => m >= 1 && m <= 12))].sort(
    (a, b) => a - b,
  );
const bi = (v: unknown): Bi => {
  const o = (v ?? {}) as Row;
  return {
    en: String(o.en ?? "")
      .trim()
      .slice(0, 160),
    hi: String(o.hi ?? "")
      .trim()
      .slice(0, 160),
  };
};
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Where a suggested place is: the atlas's own place of that name, the
// surveyed place list, or the district's centre (to be moved).
async function locate(at: Bi, name: Bi, district: string) {
  const d = RAJ_DISTRICTS.find((x) => x.en === district);
  const near = d ? { lon: d.at[0], lat: d.at[1] } : null;
  for (const n of [at, name]) {
    if (!n.en && !n.hi) continue;
    const a = await matchAtlasPlace(n, near, 120);
    if (a) return { lat: a.lat, lon: a.lon, found: "atlas" as const };
    const m = await matchPlace(n, near, 120);
    if (m) return { lat: m.place.lat, lon: m.place.lon, found: "place list" as const };
  }
  if (d) return { lat: d.at[1], lon: d.at[0], found: "district" as const };
  return { lat: null, lon: null, found: "none" as const };
}

// One batch of one chapter's facts. False: nothing left to do.
export async function themesStep(): Promise<{ did: string | null }> {
  const job = await setting<Job>(JOB_KEY, { chapters: [], at: 0, error: null });
  if (!job.chapters.length) return { did: null };
  const chapter = job.chapters[0];
  const { data, error } = await from("atlas_facts")
    .select("id,heading,text_en,entities")
    .eq("chapter_key", chapter)
    .eq("status", "verified")
    .order("position")
    .range(job.at, job.at + BATCH - 1);
  fail(error);
  const facts = (data ?? []) as Row[];
  const next = (more: boolean) =>
    saveSetting(JOB_KEY, {
      chapters: more ? job.chapters : job.chapters.slice(1),
      at: more ? job.at + BATCH : 0,
      error: null,
    } satisfies Job);
  if (!facts.length) {
    await next(false);
    return { did: `themes:${chapter}` };
  }
  try {
    // The theme places these facts name already (by key), for years and months.
    const text = facts
      .map((f) => String(f.text_en))
      .join("\n")
      .toLowerCase();
    const cols = await placeCols();
    const { data: ps } = await from("atlas_places")
      .select(cols)
      .in("cat", [...THEME_CATS])
      .neq("status", "hidden");
    const known = ((ps ?? []) as Row[]).filter((p) => {
      const n = norm(String(p.label_en || p.name_en));
      return n.length >= 4 && text.includes(n);
    });
    const raw = await saathiComplete(apiKey(), [
      { role: "system", content: SUGGEST_SYSTEM },
      {
        role: "user",
        content:
          (known.length
            ? `Already in the atlas:\n${known
                .map((p) => `- ${p.key}: ${p.label_en || p.name_en} (${p.cat}, ${p.district})`)
                .join("\n")}\n\n`
            : "") +
          `Facts:\n${facts.map((f, i) => `${i + 1}. [${f.heading}] ${f.text_en}`).join("\n")}`,
      },
    ]);
    const t = raw.replace(/```(?:json)?/g, "");
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as {
      items?: Row[];
      updates?: Row[];
    };
    const factIds = (v: unknown) =>
      (Array.isArray(v) ? v : [])
        .map(Number)
        .filter((n) => n >= 1 && n <= facts.length)
        .map((n) => String(facts[n - 1].id));
    const existing = ((await from("atlas_places").select("key,cat,name_en,label_en")).data ??
      []) as Row[];
    for (const it of o.items ?? []) {
      const cat = String(it.cat ?? "");
      const name = bi(it.name);
      const ids = factIds(it.facts);
      if (!(THEME_CATS as readonly string[]).includes(cat) || !name.en || !ids.length) continue;
      // Already a place of that kind and name.
      if (
        existing.some(
          (p) =>
            p.cat === cat && [p.name_en, p.label_en].some((x) => norm(String(x)) === norm(name.en)),
        )
      )
        continue;
      const at = bi(it.at);
      let district = districtName(String(it.district ?? ""));
      if (!RAJ_DISTRICTS.some((d) => d.en === district)) district = "";
      const pos = await locate(at, name, district);
      if (!district && pos.lat != null) district = districtAt(pos.lon!, pos.lat);
      const era_from = num(it.era_from);
      const era_to = num(it.era_to) ?? era_from;
      await upsert(
        `new:${cat}:${slug(name.en)}`,
        "new",
        "",
        {
          cat,
          name,
          at,
          district,
          ...pos,
          era_from: era_from ?? era_to,
          era_to,
          months: monthList(it.months),
        },
        ids,
      );
    }
    for (const u of o.updates ?? []) {
      const p = known.find((k) => k.key === u.key);
      const ids = factIds(u.facts);
      if (!p || !ids.length) continue;
      const era_from = num(u.era_from);
      const era_to = num(u.era_to) ?? era_from;
      const months = monthList(u.months);
      const has = {
        era_from: (p.era_from as number | null) ?? null,
        era_to: (p.era_to as number | null) ?? null,
        months: (p.months as number[] | undefined) ?? [],
      };
      // Only what the place doesn't have yet.
      const adds =
        (era_from != null && has.era_from == null) || (months.length && !has.months.length);
      if (!adds) continue;
      await upsert(
        `update:${p.key}`,
        "update",
        String(p.key),
        {
          cat: String(p.cat),
          name: { en: String(p.label_en || p.name_en), hi: "" },
          district: String(p.district),
          lat: Number(p.lat),
          lon: Number(p.lon),
          found: "atlas",
          era_from: has.era_from ?? era_from ?? era_to,
          era_to: has.era_to ?? era_to,
          months: has.months.length ? has.months : months,
          place: { name: String(p.label_en || p.name_en), ...has },
        },
        ids,
      );
    }
    await next(facts.length === BATCH);
    return { did: `themes:${chapter}` };
  } catch (e) {
    console.error("atlas themes:", saathiErrorDetail(e));
    await saveSetting(JOB_KEY, {
      ...job,
      error: e instanceof Error ? e.message : String(e),
      chapters: [],
    } satisfies Job);
    return { did: null };
  }
}

// A suggestion made again keeps the editor's decision; an open one takes
// the new reading (and the facts of both).
async function upsert(
  key: string,
  kind: "new" | "update",
  placeKey: string,
  data: Suggestion["data"],
  facts: string[],
) {
  const { data: old } = await from("atlas_suggestions")
    .select("id,status,facts")
    .eq("key", key)
    .maybeSingle();
  const o = old as Row | null;
  if (o && o.status !== "open") return;
  if (o)
    fail(
      (
        await from("atlas_suggestions")
          .update({
            data,
            facts: [...new Set([...((o.facts as string[]) ?? []), ...facts])],
            updated_at: now(),
          } as never)
          .eq("id", String(o.id))
      ).error,
    );
  else
    fail(
      (
        await from("atlas_suggestions").insert({
          key,
          kind,
          place_key: placeKey,
          data,
          facts,
        } as never)
      ).error,
    );
}

// ---------- The editor's review ----------

export async function suggestionsStatus() {
  const probe = await from("atlas_suggestions").select("status");
  if (missing(probe.error)) return { ready: false } as const;
  fail(probe.error);
  const rows = (probe.data ?? []) as Row[];
  const job = await setting<Job>(JOB_KEY, { chapters: [], at: 0, error: null });
  return {
    ready: true,
    open: rows.filter((r) => r.status === "open").length,
    accepted: rows.filter((r) => r.status === "accepted").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    job: { left: job.chapters.length, chapter: job.chapters[0] ?? null, error: job.error },
  } as const;
}

export async function listSuggestions(f: { status?: string; cat?: string }): Promise<Suggestion[]> {
  let q = from("atlas_suggestions").select("id,key,kind,place_key,data,facts,status");
  q = q.eq("status", f.status ?? "open");
  if (f.cat) q = q.eq("data->>cat", f.cat);
  const { data, error } = await q.order("key").limit(200);
  if (missing(error)) throw new Error(THEMES_NOT_READY);
  fail(error);
  const rows = (data ?? []) as unknown as Suggestion[];
  const ids = [...new Set(rows.flatMap((r) => r.facts))];
  const quotes = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: fs } = await from("atlas_facts")
      .select("id,text_en")
      .in("id", ids.slice(i, i + 200));
    for (const f of (fs ?? []) as Row[]) quotes.set(String(f.id), String(f.text_en));
  }
  return rows.map((r) => ({
    ...r,
    quotes: r.facts.map((id) => quotes.get(id) ?? "").filter(Boolean),
  }));
}

export async function rejectSuggestions(ids: string[]) {
  fail(
    (
      await from("atlas_suggestions")
        .update({ status: "rejected", updated_at: now() } as never)
        .in("id", ids)
    ).error,
  );
}

// Accepted (as suggested, or as the editor corrected it): a new place,
// verified, linked to its facts; or the years and months added to a place.
export async function acceptSuggestion(
  id: string,
  edit: Partial<
    Pick<
      Suggestion["data"],
      "cat" | "name" | "district" | "lat" | "lon" | "era_from" | "era_to" | "months"
    >
  >,
): Promise<{ key: string }> {
  if (!(await placeCols()).includes("era_from")) throw new Error(THEMES_NOT_READY);
  const { data, error } = await from("atlas_suggestions")
    .select("id,key,kind,place_key,data,facts,status")
    .eq("id", id)
    .single();
  fail(error);
  const s = data as unknown as Suggestion;
  if (s.status !== "open") throw new Error("This suggestion has been decided already.");
  const d = { ...s.data, ...edit };
  if (d.era_from != null && d.era_to != null && d.era_to < d.era_from)
    throw new Error("The end year comes before the start year.");
  let key = s.place_key;
  if (s.kind === "new") {
    if (d.lat == null || d.lon == null) throw new Error("Give the place a position first.");
    key = `${d.cat}:${slug(d.name.en)}-${Date.now().toString(36)}`;
    fail(
      (
        await from("atlas_places").insert({
          key,
          name_en: d.name.en,
          name_hi: d.name.hi,
          label_en: d.name.en,
          label_hi: d.name.hi,
          cat: d.cat,
          lat: d.lat,
          lon: d.lon,
          district: d.district || districtAt(d.lon, d.lat),
          era_from: d.era_from,
          era_to: d.era_to,
          months: d.months,
          status: "verified",
          source: "notes-suggestion",
          edited: true,
        } as never)
      ).error,
    );
  } else {
    fail(
      (
        await from("atlas_places")
          .update({
            era_from: d.era_from,
            era_to: d.era_to,
            months: d.months,
            edited: true,
            updated_at: now(),
          } as never)
          .eq("key", key)
      ).error,
    );
  }
  // Its facts now show on its card.
  for (const fid of s.facts) {
    const { data: f } = await from("atlas_facts").select("entities").eq("id", fid).maybeSingle();
    const ents = ((f as Row | null)?.entities as string[]) ?? [];
    if (!ents.includes(`P:${key}`))
      await from("atlas_facts")
        .update({ entities: [...ents, `P:${key}`] } as never)
        .eq("id", fid);
  }
  fail(
    (
      await from("atlas_suggestions")
        .update({ status: "accepted", place_key: key, data: d, updated_at: now() } as never)
        .eq("id", id)
    ).error,
  );
  invalidateAtlas();
  return { key };
}
