// The place list behind the maps (Survey of India names with their Hindi,
// India-WRIS dams, PM GatiShakti protected areas, district and tehsil
// headquarters): finding a place by name, near where the AI or the editor
// says it is, so the dot goes where the place really is. Server only: the
// list is large and read once.
import { PLACES_GZ } from "@/lib/geo-places-data";

export type PlaceKind = "c" | "t" | "d" | "n" | "w" | "l" | "f" | "h" | "r" | "s" | "v";
export type Place = { en: string; hi: string; kind: PlaceKind; lat: number; lon: number };

// Which kind a name points to ("Bisalpur Dam", "Sariska Sanctuary").
function kindHint(name: string): PlaceKind | null {
  if (/\b(dam|bandh|bundh|barrage|reservoir|project)\b/i.test(name)) return "d";
  if (/\bnational park\b|\bn\.?\s?p\.?$/i.test(name)) return "n";
  if (/\b(sanctuary|santuary|reserve)\b/i.test(name)) return "w";
  if (/\b(lake|jheel|jhil|talab|sarovar)\b/i.test(name)) return "l";
  if (/\b(fort|kila|qila)\b/i.test(name)) return "f";
  if (/\b(peak|shikhar|hill|pass|ghati)\b/i.test(name)) return "h";
  return null;
}

// A spelling-tolerant key: the same for Chittaurgarh and Chittorgarh,
// Jhunjhunun and Jhunjhunu, Bisalpur Dam and Bisalpur.
export function placeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(dam|bandh|bundh|barrage|reservoir|project|lake|jheel|jhil|talab|sarovar|national park|wildlife sanctuary|wild life sanctuary|sanctuary|santuary|tiger reserve|reserve|fort|kila|qila|city|town|village|district|tehsil|peak|hill|pass|the|of|np|wls)\b/g,
      " ",
    )
    .replace(/[^a-z]/g, "")
    .replace(/au/g, "o")
    .replace(/ou/g, "u")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/([bcdgjkpt])h/g, "$1")
    .replace(/sh/g, "s")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?<=.{3})[aeiu]$/, "");
}

// Hindi names compared without the marks that vary between spellings.
export function hindiKey(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[़ँंः्‌‍\s.()\-–]/g, "")
    .replace(/[ाआ]/g, "ा")
    .replace(/ी/g, "ि")
    .replace(/ू/g, "ु")
    .replace(/ड़/g, "ड")
    .replace(/ढ़/g, "ढ");
}

// The key's consonants only (Pokhran and Pokaran), for a second look.
const skeleton = (key: string) => key.slice(0, 1) + key.slice(1).replace(/[aeiou]/g, "");

type Index = {
  list: Place[];
  byKey: Map<string, number[]>;
  bySkeleton: Map<string, number[]>;
  byHindi: Map<string, number[]>;
};
let index: Promise<Index> | null = null;

async function unzip(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function load(): Promise<Index> {
  return (index ??= unzip(PLACES_GZ).then((tsv) => {
    const list: Place[] = [];
    const byKey = new Map<string, number[]>();
    const bySkeleton = new Map<string, number[]>();
    const byHindi = new Map<string, number[]>();
    const put = (m: Map<string, number[]>, k: string, i: number) => {
      if (!k) return;
      const at = m.get(k);
      if (at) at.push(i);
      else m.set(k, [i]);
    };
    for (const line of tsv.split("\n")) {
      const [en, hi, kind, lat, lon] = line.split("\t");
      const i =
        list.push({ en, hi, kind: kind as PlaceKind, lat: Number(lat), lon: Number(lon) }) - 1;
      const key = placeKey(en);
      put(byKey, key, i);
      if (key.length >= 4) put(bySkeleton, skeleton(key), i);
      if (hi) put(byHindi, hindiKey(hi), i);
    }
    return { list, byKey, bySkeleton, byHindi };
  }));
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lon - b.lon) * 111 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
};

// How likely a kind is meant when nothing else decides (towns and the
// well-known features before villages).
const RANK: Record<PlaceKind, number> = {
  c: 0,
  d: 1,
  n: 1,
  w: 1,
  l: 2,
  f: 2,
  t: 3,
  r: 4,
  h: 4,
  s: 5,
  v: 6,
};

export type PlaceMatch = { place: Place; km: number | null };

// The place a name means: the one nearest the given position (within
// `withinKm`), or, without one, the only likely one. Null when the list
// doesn't have it or can't tell which.
export async function matchPlace(
  name: { en?: string; hi?: string },
  near?: { lat: number; lon: number } | null,
  withinKm = 60,
): Promise<PlaceMatch | null> {
  const { list, byKey, bySkeleton, byHindi } = await load();
  const key = name.en ? placeKey(name.en) : "";
  const ok = near && Number.isFinite(near.lat) && Number.isFinite(near.lon) ? near : null;
  const hint = kindHint(`${name.en ?? ""}`);
  const pick = (ids: number[]): PlaceMatch | null => {
    let found = [...new Set(ids)].map((i) => list[i]);
    if (hint && found.some((p) => p.kind === hint)) found = found.filter((p) => p.kind === hint);
    if (!found.length) return null;
    if (ok) {
      const best = found
        .map((place) => ({ place, km: km(place, ok) }))
        .sort((a, b) => a.km - b.km || RANK[a.place.kind] - RANK[b.place.kind])[0];
      return best.km <= withinKm ? best : null;
    }
    // Without a position: Rajasthan's first, then the likeliest kind;
    // several of those far apart can't be told apart.
    const raj = found.filter(inRajasthan);
    const pool = raj.length ? raj : found;
    const top = Math.min(...pool.map((p) => RANK[p.kind]));
    const likely = pool.filter((p) => RANK[p.kind] === top);
    return likely.some((p) => km(p, likely[0]) > 15) ? null : { place: likely[0], km: null };
  };
  const exact = pick([
    ...(key ? (byKey.get(key) ?? []) : []),
    ...(name.hi ? (byHindi.get(hindiKey(name.hi)) ?? []) : []),
  ]);
  // A close exact match stands; otherwise spellings with other vowels too.
  if (exact && (exact.km === null || exact.km <= 15)) return exact;
  const loose = key.length >= 4 ? pick(bySkeleton.get(skeleton(key)) ?? []) : null;
  if (!exact) return loose;
  if (!loose) return exact;
  return (loose.km ?? Infinity) < (exact.km ?? Infinity) ? loose : exact;
}

// Roughly Rajasthan (the box around the state).
const inRajasthan = (p: { lat: number; lon: number }) =>
  p.lat >= 23 && p.lat <= 30.2 && p.lon >= 69.4 && p.lon <= 78.3;

// The editor's search: places whose name starts with (or contains) what
// they type, best kinds first, those near `near` first.
export async function searchPlaces(
  query: string,
  near?: { lat: number; lon: number } | null,
  limit = 12,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { list, byHindi } = await load();
  const devanagari = /[ऀ-ॿ]/.test(q);
  const key = devanagari ? hindiKey(q) : placeKey(q) || q.toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return [];
  const hits: { p: Place; score: number }[] = [];
  if (devanagari) {
    for (const [k, ids] of byHindi)
      if (k.startsWith(key))
        for (const i of ids) hits.push({ p: list[i], score: k === key ? 0 : 1 });
  } else {
    const words = q.toLowerCase();
    for (const p of list) {
      const k = placeKey(p.en);
      const score =
        k === key ? 0 : k.startsWith(key) ? 1 : p.en.toLowerCase().includes(words) ? 2 : -1;
      if (score >= 0) hits.push({ p, score });
    }
  }
  return hits
    .sort(
      (a, b) =>
        a.score - b.score ||
        RANK[a.p.kind] - RANK[b.p.kind] ||
        (near ? km(a.p, near) - km(b.p, near) : 0) ||
        a.p.en.localeCompare(b.p.en),
    )
    .slice(0, limit)
    .map((h) => h.p);
}

// A map's places put where the place list says they are (the AI's
// positions are often a little off): found ones are marked "list" (and get
// the list's Hindi name when they have none), the rest "ai", to be checked.
// The editor's own places ("you") are left as they are.
export async function checkMapPlaces<
  M extends {
    places: {
      name: { en: string; hi: string };
      lat: number;
      lon: number;
      src?: string;
      kind?: string;
    }[];
  },
>(m: M): Promise<M> {
  const places = await Promise.all(
    m.places.map(async (p) => {
      if (p.src === "you" || p.src === "list") return p;
      const hit = await matchPlace(p.name, p, 60);
      if (!hit) return { ...p, src: "ai" as const };
      return {
        ...p,
        name: { en: p.name.en || hit.place.en, hi: p.name.hi || hit.place.hi },
        lat: hit.place.lat,
        lon: hit.place.lon,
        kind: hit.place.kind,
        src: "list" as const,
      };
    }),
  );
  return { ...m, places };
}

// Which of Rajasthan's 41 districts and 200 assembly constituencies a
// position is in (null outside Rajasthan).
type Ring = [number, number][];
const inRing = (ring: Ring, lon: number, lat: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
export type AdminArea = {
  district: { en: string; hi: string };
  constituency: { n: number; en: string; hi: string; res: string } | null;
};
export async function adminOf(lat: number, lon: number): Promise<AdminArea | null> {
  if (!inRajasthan({ lat, lon })) return null;
  const { RAJ_DISTRICTS, RAJ_CONSTITUENCIES } = await import("@/lib/geo-admin");
  const d = RAJ_DISTRICTS.find((x) => x.rings.some((r) => inRing(r, lon, lat)));
  if (!d) return null;
  const c = RAJ_CONSTITUENCIES.find((x) => x.rings.some((r) => inRing(r, lon, lat)));
  return {
    district: { en: d.en, hi: d.hi },
    constituency: c ? { n: c.n, en: c.en, hi: c.hi, res: c.res } : null,
  };
}
