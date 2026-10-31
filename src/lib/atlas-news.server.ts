// Server-only: the atlas in the rest of the site. SAATHI's answers get the
// atlas places and districts they name (for a small map under the answer);
// current affairs stories from posted daily issues are linked to the atlas
// places they are about (a pin of the story's map, or the place named in
// it), shown as "In the news" on the place; and the GK infographics get a
// "District of the day" series made from the atlas.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RAJ_DISTRICTS } from "@/lib/geo-admin";
import { findMentions, mentionKey } from "@/lib/atlas";
import type { Bi } from "@/lib/current-affairs";
import { atlasPublicPlaces, invalidateAtlas, type PublicPlace } from "@/lib/atlas.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
type Row = Record<string, unknown>;
const missing = (e: { message: string } | null) =>
  !!e && /atlas_news|schema cache|does not exist/i.test(e.message);
export const NEWS_NOT_READY = "News links need the migration 20261216090000_atlas_news.sql.";

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

// ---------- Names ----------

type PlaceEntry = { p: PublicPlace; names: string[] };
let index: { at: number; places: PlaceEntry[] } = { at: 0, places: [] };
// The atlas's verified places, by their names.
async function placeIndex(): Promise<PlaceEntry[]> {
  if (Date.now() - index.at < 5 * 60_000 && index.places.length) return index.places;
  // A place called just like a district ("Rajsamand" for its crops) is
  // the district, not a place.
  const districts = new Set(RAJ_DISTRICTS.flatMap((d) => [mentionKey(d.en), mentionKey(d.hi)]));
  const ps = (await atlasPublicPlaces()).filter((p) => !districts.has(mentionKey(p[1])));
  // Labels that come down to the same name ("Pushkar (Brahma temple)",
  // "Pushkar (Kubad patti end)" → "pushkar") can't tell which is meant: only
  // the place called just that is matched by it.
  const seen = new Map<string, number>();
  for (const p of ps) seen.set(mentionKey(p[1]), (seen.get(mentionKey(p[1])) ?? 0) + 1);
  const plain = (n: string) => !/[()]/.test(n);
  index = {
    at: Date.now(),
    places: ps
      .filter((p) => seen.get(mentionKey(p[1]))! === 1 || plain(p[1]))
      .map((p) => ({ p, names: [p[1], p[2]].filter(Boolean) })),
  };
  return index.places;
}
const DISTRICTS = RAJ_DISTRICTS.map((d) => ({ en: d.en, hi: d.hi, names: [d.en, d.hi] }));

// What a SAATHI answer names: Rajasthan's districts and the atlas's places
// (only when it is about Rajasthan: it names the state or a district).
export async function atlasMentions(
  text: string,
): Promise<{ districts: Bi[]; places: PublicPlace[] }> {
  const districts = findMentions(text, DISTRICTS, 4);
  if (!districts.length && !/rajasthan|राजस्थान/i.test(text)) return { districts: [], places: [] };
  const places = findMentions(text, await placeIndex()).map((e) => e.p);
  return {
    districts: districts.slice(0, 4).map((d) => ({ en: d.en, hi: d.hi })),
    places: places.slice(0, 8),
  };
}

// ---------- In the news ----------

type Scan = { after: string };
const SCAN_KEY = "atlas_news_scan";
const NEAR_KM = 3;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180));

type ItemRow = { id: string; issue_date: string; headline: string; content: Row | null };
const itemText = (i: ItemRow) => {
  const c = (i.content ?? {}) as {
    headline?: Bi;
    summary?: Bi;
    points?: Bi[];
  };
  return [
    i.headline,
    c.headline?.en,
    c.headline?.hi,
    c.summary?.en,
    c.summary?.hi,
    ...(c.points ?? []).flatMap((p) => [p.en, p.hi]),
  ]
    .filter(Boolean)
    .join("\n");
};

// The atlas places a story is about: its map's pins near an atlas place of
// the same name, and the places it names.
export async function storyPlaces(i: ItemRow): Promise<{ key: string; how: "map" | "name" }[]> {
  const places = await placeIndex();
  const out = new Map<string, "map" | "name">();
  const pins =
    (i.content as { map?: { places?: { name: Bi; lat: number; lon: number }[] } } | null)?.map
      ?.places ?? [];
  for (const pin of pins)
    for (const e of places)
      if (
        km(pin, { lat: e.p[4], lon: e.p[5] }) <= NEAR_KM &&
        findMentions(`${pin.name.en} ${pin.name.hi}`, [e]).length
      )
        out.set(e.p[0], "map");
  for (const e of findMentions(itemText(i), places)) if (!out.has(e.p[0])) out.set(e.p[0], "name");
  return [...out].map(([key, how]) => ({ key, how }));
}

// One posted daily issue's stories linked a step. Null: none left.
export async function newsStep(): Promise<{ did: string | null }> {
  const probe = await from("atlas_news").select("id").limit(1);
  if (missing(probe.error)) return { did: null };
  const scan = await setting<Scan>(SCAN_KEY, { after: "1900-01-01" });
  const { data: issues } = await from("ca_issues")
    .select("period")
    .eq("kind", "daily")
    .eq("status", "posted")
    .gt("period", scan.after)
    .order("period")
    .limit(1);
  const day = ((issues ?? []) as Row[])[0]?.period as string | undefined;
  if (!day) return { did: null };
  const { data, error } = await from("ca_items")
    .select("id,issue_date,headline,content")
    .eq("issue_date", day)
    .eq("status", "included");
  fail(error);
  const rows: Row[] = [];
  for (const i of (data ?? []) as ItemRow[])
    for (const l of await storyPlaces(i))
      rows.push({ place_key: l.key, item_id: i.id, issue_date: i.issue_date, how: l.how });
  if (rows.length)
    fail(
      (
        await from("atlas_news").upsert(rows as never, {
          onConflict: "place_key,item_id",
          ignoreDuplicates: true,
        })
      ).error,
    );
  await saveSetting(SCAN_KEY, { after: day } satisfies Scan);
  invalidateAtlas();
  return { did: `news:${day}` };
}

// Links again from a day on (e.g. after the atlas has grown).
export async function rescanNews(fromDay: string) {
  const d = new Date(`${fromDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  await saveSetting(SCAN_KEY, { after: d.toISOString().slice(0, 10) } satisfies Scan);
}

export type NewsItem = {
  item: string;
  date: string;
  headline: Bi;
  summary: Bi;
  place?: { key: string; name: Bi };
};
const LINK_COLS = "place_key,item_id,issue_date,how";
const rowsOf = (r: { data: unknown; error: { message: string } | null }): Row[] => {
  if (missing(r.error)) return [];
  fail(r.error);
  return (r.data ?? []) as Row[];
};
async function withStories(links: Row[]): Promise<NewsItem[]> {
  const ids = [...new Set(links.map((l) => String(l.item_id)))];
  if (!ids.length) return [];
  const { data } = await from("ca_items").select("id,headline,content").in("id", ids);
  const items = new Map(((data ?? []) as Row[]).map((r) => [String(r.id), r]));
  const places = new Map((await atlasPublicPlaces()).map((p) => [p[0], p]));
  return links
    .map((l) => {
      const it = items.get(String(l.item_id));
      if (!it) return null;
      const c = (it.content ?? {}) as { headline?: Bi; summary?: Bi };
      const p = places.get(String(l.place_key));
      return {
        item: String(l.item_id),
        date: String(l.issue_date),
        headline: c.headline ?? { en: String(it.headline), hi: "" },
        summary: c.summary ?? { en: "", hi: "" },
        ...(p ? { place: { key: p[0], name: { en: p[1], hi: p[2] } } } : {}),
      };
    })
    .filter((x): x is NewsItem => !!x);
}

// A place's latest stories.
export async function placeNews(key: string): Promise<NewsItem[]> {
  const links = rowsOf(
    await from("atlas_news")
      .select(LINK_COLS)
      .eq("hidden", false)
      .eq("place_key", key)
      .order("issue_date", { ascending: false })
      .limit(5),
  );
  return withStories(links);
}

// The places in the news lately (the newest story of each).
export async function atlasInNews(days = 45): Promise<NewsItem[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const links = rowsOf(
    await from("atlas_news")
      .select(LINK_COLS)
      .eq("hidden", false)
      .gte("issue_date", since)
      .order("issue_date", { ascending: false })
      .limit(200),
  );
  const seen = new Set<string>();
  const first = links.filter((l) => {
    const k = String(l.place_key);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (await withStories(first)).slice(0, 16);
}

// The editor's view: recent links, and hiding a wrong one.
export async function newsLinks() {
  const probe = await from("atlas_news").select("id").limit(1);
  if (missing(probe.error)) return { ready: false } as const;
  const { data, error } = await from("atlas_news")
    .select("id,place_key,item_id,issue_date,how,hidden")
    .order("issue_date", { ascending: false })
    .limit(150);
  fail(error);
  const rows = (data ?? []) as Row[];
  const stories = await withStories(rows);
  const byItem = new Map(stories.map((s) => [s.item, s]));
  const places = new Map((await atlasPublicPlaces()).map((p) => [p[0], p]));
  const scan = await setting<Scan>(SCAN_KEY, { after: "1900-01-01" });
  return {
    ready: true,
    scannedTo: scan.after,
    links: rows.map((r) => ({
      id: String(r.id),
      place: {
        key: String(r.place_key),
        name: places.has(String(r.place_key))
          ? { en: places.get(String(r.place_key))![1], hi: places.get(String(r.place_key))![2] }
          : { en: String(r.place_key), hi: "" },
      },

      date: String(r.issue_date),
      how: r.how as "map" | "name",
      hidden: !!r.hidden,
      headline: byItem.get(String(r.item_id))?.headline ?? { en: "", hi: "" },
    })),
  } as const;
}
export async function hideNewsLink(id: string, hidden: boolean) {
  fail(
    (
      await from("atlas_news")
        .update({ hidden } as never)
        .eq("id", id)
    ).error,
  );
  invalidateAtlas();
}

// ---------- GK: District of the day ----------

export const SERIES = { en: "District of the day", hi: "आज का जिला" };

// The GK series (made once, paused until the editor starts it): one topic a
// district, the published district pages first, then those the notes say
// most about.
export async function districtSeries() {
  const { data: subs, error } = await from("gk_subjects")
    .select("id,status")
    .eq("name_en", SERIES.en)
    .limit(1);
  if (error && /gk_subjects|schema cache|does not exist/i.test(error.message))
    return { ready: false } as const;
  fail(error);
  const s = ((subs ?? []) as Row[])[0];
  if (!s) return { ready: true, id: null, status: null, topics: 0, posted: 0 } as const;
  const { data: t } = await from("gk_topics").select("status").eq("subject_id", String(s.id));
  const topics = (t ?? []) as Row[];
  return {
    ready: true,
    id: String(s.id),
    status: String(s.status),
    topics: topics.length,
    posted: topics.filter((x) => x.status === "posted").length,
  } as const;
}

export async function setUpDistrictSeries(): Promise<{ id: string; added: number }> {
  const gk = await import("@/lib/gk.server");
  const { KB_SUBJECT } = await import("@/lib/atlas.server");
  const s = await districtSeries();
  if (!s.ready) throw new Error("GK infographics need their migration first.");
  const id =
    s.id ??
    (
      await gk.createGkSubject({
        name_en: SERIES.en,
        name_hi: SERIES.hi,
        kb_subjects: [KB_SUBJECT],
      })
    ).id;
  const { data: d } = await from("atlas_districts").select("district,status");
  const published = new Set(
    ((d ?? []) as Row[]).filter((r) => r.status === "published").map((r) => String(r.district)),
  );
  const places = await atlasPublicPlaces();
  const weight = (en: string) =>
    places.filter((p) => p[6] === en).reduce((n, p) => n + 1 + p[7], 0);
  const order = [...RAJ_DISTRICTS].sort(
    (a, b) =>
      Number(published.has(b.en)) - Number(published.has(a.en)) || weight(b.en) - weight(a.en),
  );
  const added = await gk.addGkTopics(
    id,
    order.map((x) => ({ en: `${x.en} district`, hi: `${x.hi} जिला` })),
  );
  return { id, added };
}
