// "Places in News" maps for the monthly magazine: where each place is (from
// the AI, checked against the state's or country's outline), drawn as
// numbered dots on a Rajasthan map and an India map. Server only: the
// outlines are large.
import {
  INDIA_MAP,
  INSIDE,
  MAP_CREDIT,
  RAJASTHAN_MAP,
  type MapProjection,
} from "@/lib/ca-map-data";

export type GeoRegion = "rajasthan" | "india" | "world";
export type Geo = { lat: number; lon: number; region: GeoRegion };

type ChatMessage = { role: "system" | "user"; content: string };
type Bi = { en: string; hi: string };

// Inside the rings (even-odd, so holes and islands count right).
function inside(rings: number[][][], lon: number, lat: number): boolean {
  let hit = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  return hit;
}

// Near the rings' outline (islands and the coast, which the simplified
// outline can miss): within `deg` degrees of one of its points.
function near(rings: number[][][], lon: number, lat: number, deg: number): boolean {
  return rings.some((ring) => ring.some(([x, y]) => Math.hypot(x - lon, y - lat) <= deg));
}

// A place's location kept only when it lies where the AI says it is: in
// Rajasthan, elsewhere in India, or abroad (abroad is never drawn).
export function checkGeo(g: Geo): Geo | null {
  if (!Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return null;
  if (Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180) return null;
  const inRaj = inside(INSIDE.rajasthan, g.lon, g.lat);
  const inIndia =
    inRaj || inside(INSIDE.india, g.lon, g.lat) || near(INSIDE.india, g.lon, g.lat, 0.25);
  if (g.region === "rajasthan") return inRaj ? g : null;
  if (g.region === "india") return inIndia ? { ...g, region: inRaj ? "rajasthan" : "india" } : null;
  return inIndia ? null : g;
}

const project = (p: MapProjection, lat: number, lon: number) => [
  (lon - p.lon0) * p.k * p.scale,
  (p.lat1 - lat) * p.scale,
];

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// One map with its places as numbered dots (the stories' numbers).
function mapSvg(
  which: "rajasthan" | "india",
  dots: { n: number; geo: Geo }[],
  accent: string,
  title: string,
): string {
  const m = which === "rajasthan" ? RAJASTHAN_MAP : INDIA_MAP;
  const p = m.projection;
  const base =
    which === "rajasthan"
      ? `<path d="${RAJASTHAN_MAP.outline}" fill="#f8fafc" stroke="${accent}" stroke-width="1.6"/>`
      : `<path d="${INDIA_MAP.states}" fill="none" stroke="#cbd5e1" stroke-width=".6"/><path d="${INDIA_MAP.rajasthan}" fill="${accent}" fill-opacity=".08" stroke="${accent}" stroke-width=".8"/><path d="${INDIA_MAP.outline}" fill="none" stroke="#334155" stroke-width="1"/>`;
  const marks = dots
    .map(({ n, geo }) => {
      const [x, y] = project(p, geo.lat, geo.lon);
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${accent}" stroke="#fff" stroke-width="2"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">${n}</text></g>`;
    })
    .join("");
  return `<figure class="pmap"><figcaption>${esc(title)}</figcaption><svg viewBox="-16 -16 ${p.width + 32} ${p.height + 32}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">${base}${marks}</svg></figure>`;
}

const TITLES: Record<"rajasthan" | "india", Bi> = {
  rajasthan: { en: "Rajasthan: places in news", hi: "राजस्थान: चर्चित स्थल" },
  india: { en: "India: places in news", hi: "भारत: चर्चित स्थल" },
};

// The maps for a month's places (those in Rajasthan, and elsewhere in India;
// India's map also shows the Rajasthan ones). Empty when none can be drawn.
export function placeMaps(
  dots: { n: number; geo: Geo }[],
  lang: "en" | "hi",
  accent: string,
): string {
  const raj = dots.filter((d) => d.geo.region === "rajasthan");
  const india = dots.filter((d) => d.geo.region !== "world");
  const maps = [
    raj.length ? mapSvg("rajasthan", raj, accent, TITLES.rajasthan[lang]) : "",
    india.some((d) => d.geo.region === "india")
      ? mapSvg("india", india, accent, TITLES.india[lang])
      : "",
  ].filter(Boolean);
  if (!maps.length) return "";
  return `<div class="pmaps">${maps.join("")}</div><p class="pmap-credit">${MAP_CREDIT}</p>`;
}

// ---------- Where the places are (AI) ----------

export function geoMessages(places: { headline: string; facts: string[] }[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You locate places in the news for a map in a current affairs magazine. For each numbered story, give the place it is about: its latitude and longitude in decimal degrees (the town, lake, sanctuary, site or region's centre), and its region: "rajasthan" if it is in Rajasthan, "india" if elsewhere in India, "world" if outside India. Give a location only when you are sure of it; leave out a story whose place you cannot locate.
Reply with JSON only: [{"n": story number, "lat": number, "lon": number, "region": "rajasthan" | "india" | "world"}]`,
    },
    {
      role: "user",
      content: places
        .map(
          (p, i) =>
            `${i + 1}. ${p.headline}${p.facts.length ? ` — ${p.facts.slice(0, 4).join("; ")}` : ""}`,
        )
        .join("\n"),
    },
  ];
}

// Each story's location, checked against the outlines, by its place in the
// list (a story the AI couldn't place, or placed outside its region, has
// none).
export function parseGeo(raw: string, count: number): Map<number, Geo> {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let list: unknown;
  try {
    list = JSON.parse(text.slice(Math.max(0, text.indexOf("["))));
  } catch {
    return new Map();
  }
  const out = new Map<number, Geo>();
  if (!Array.isArray(list)) return out;
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>;
    const i = Number(o.n) - 1;
    const region = o.region;
    if (!Number.isInteger(i) || i < 0 || i >= count || out.has(i)) continue;
    if (region !== "rajasthan" && region !== "india" && region !== "world") continue;
    const geo = checkGeo({ lat: Number(o.lat), lon: Number(o.lon), region });
    if (geo) out.set(i, geo);
  }
  return out;
}
