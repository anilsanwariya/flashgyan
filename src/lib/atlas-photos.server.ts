// Photos of the atlas's places from Wikimedia Commons, chosen by the editor:
// only freely licensed files (public domain, CC0, CC BY, CC BY-SA), shown
// with their author, licence and a link back, as the licences ask. The
// choice is kept in bot_settings (atlas_photos); the picture itself is
// served by Wikimedia (its thumbnail), not copied.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const from = (t: string) => supabaseAdmin.from(t as never);
export const PHOTOS_KEY = "atlas_photos";
const API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks automated clients to say who they are.
const UA = "FlashGyanAtlas/1.0 (https://flashgyan.com; atlas place photos)";
const WIDTH = 800;

export type PlacePhoto = {
  // "File:Junagarh Fort Bikaner.jpg"
  title: string;
  thumb: string;
  w: number;
  h: number;
  // The file's page on Commons (the credit links here).
  page: string;
  author: string;
  license: string;
  licenseUrl: string;
};

// ---------- Reading Commons' answers ----------

const FREE = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?([ -][\d.]+)?)/i;
const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Info = {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
};

// A Commons file's details as a photo we may show, or null (not a photo,
// not freely licensed, or missing what the credit needs).
export function photoOf(title: string, ii: Info | undefined): PlacePhoto | null {
  if (!ii?.thumburl || !ii.descriptionurl) return null;
  if (ii.mime && !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return null;
  const m = ii.extmetadata ?? {};
  const license = stripHtml(m.LicenseShortName?.value ?? "");
  if (!FREE.test(license) || /\b(nc|nd)\b/i.test(license)) return null;
  if (/restricted|non-free|fair use/i.test(m.Restrictions?.value ?? "")) return null;
  const author =
    stripHtml(m.Artist?.value ?? "").slice(0, 160) ||
    (/^(pd|public domain|cc0)/i.test(license) ? "Unknown author" : "");
  if (!author) return null;
  if (!ii.thumburl.startsWith("https://upload.wikimedia.org/")) return null;
  return {
    title,
    thumb: ii.thumburl,
    w: ii.thumbwidth ?? WIDTH,
    h: ii.thumbheight ?? Math.round(WIDTH * 0.66),
    page: ii.descriptionurl,
    author,
    license,
    licenseUrl: (m.LicenseUrl?.value ?? "").trim(),
  };
}

type Answer = { query?: { pages?: { title: string; index?: number; imageinfo?: Info[] }[] } };
export const photosOf = (a: Answer): PlacePhoto[] =>
  [...(a.query?.pages ?? [])]
    .sort((x, y) => (x.index ?? 0) - (y.index ?? 0))
    .map((p) => photoOf(p.title, p.imageinfo?.[0]))
    .filter((p): p is PlacePhoto => !!p);

async function commons(params: Record<string, string>): Promise<Answer> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: String(WIDTH),
    ...params,
  });
  const res = await fetch(`${API}?${q}`, {
    headers: { "user-agent": UA, "api-user-agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wikimedia Commons answered ${res.status}`);
  return (await res.json()) as Answer;
}

// Free photos on Commons for a search ("Junagarh fort Bikaner").
export async function searchCommons(query: string): Promise<PlacePhoto[]> {
  const a = await commons({
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "24",
  });
  return photosOf(a);
}

// One file's details, read again from Commons (what is saved is Commons' own).
async function commonsFile(title: string): Promise<PlacePhoto | null> {
  const a = await commons({ titles: title });
  return photosOf(a)[0] ?? null;
}

// ---------- The editor's choices ----------

let cache: { at: number; map: Record<string, PlacePhoto> } | null = null;
export async function photos(): Promise<Record<string, PlacePhoto>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.map;
  const { data } = await from("bot_settings").select("value").eq("key", PHOTOS_KEY).maybeSingle();
  const map = ((data as { value?: unknown } | null)?.value ?? {}) as Record<string, PlacePhoto>;
  cache = { at: Date.now(), map };
  return map;
}
// Each place's photo thumbnail (for search results), by place key.
export async function photoThumbs(): Promise<Record<string, string>> {
  const map = await photos().catch(() => ({}) as Record<string, PlacePhoto>);
  return Object.fromEntries(Object.entries(map).map(([k, p]) => [k, p.thumb]));
}
export async function placePhoto(key: string): Promise<PlacePhoto | null> {
  return (await photos().catch(() => ({}) as Record<string, PlacePhoto>))[key] ?? null;
}

async function save(map: Record<string, PlacePhoto>) {
  const { error } = await from("bot_settings").upsert({
    key: PHOTOS_KEY,
    value: map,
    updated_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(error.message);
  cache = { at: Date.now(), map };
}

// Choose a Commons file for a place (null: no photo).
export async function setPlacePhoto(key: string, title: string | null): Promise<PlacePhoto | null> {
  const map = { ...(await photos()) };
  if (!title) {
    delete map[key];
    await save(map);
    return null;
  }
  const p = await commonsFile(title);
  if (!p) throw new Error("That file isn't freely licensed or couldn't be read.");
  map[key] = p;
  await save(map);
  return p;
}

// A search for a place: its name before the comma, without brackets, and
// its district ("Junagarh fort, Bikaner (UNESCO)" → "Junagarh fort Bikaner").
export const placeQuery = (name: string, district: string) => {
  const n = (name.split(",")[0] ?? name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n.toLowerCase().includes(district.toLowerCase()) || !district ? n : `${n} ${district}`;
};

// The first free photo for each place (to look at, not saved), searching
// with the district first and the name alone after.
export async function suggestPhotos(
  places: { key: string; name: string; district: string }[],
): Promise<Record<string, PlacePhoto | null>> {
  const out: Record<string, PlacePhoto | null> = {};
  for (const p of places) {
    const q = placeQuery(p.name, p.district);
    let hit = (await searchCommons(q).catch(() => []))[0] ?? null;
    if (!hit && q !== placeQuery(p.name, ""))
      hit = (await searchCommons(placeQuery(p.name, "")).catch(() => []))[0] ?? null;
    out[p.key] = hit;
  }
  return out;
}
