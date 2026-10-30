// The maps of the notes and the magazine's stories: Rajasthan (with its
// neighbours' borders) or India, from the magazine's outlines (DataMeet,
// following the Survey of India boundary), with the layers the map asks for
// (Rajasthan: India-WRIS rivers, the main canals, the 33 districts, the
// protected areas; India: Natural Earth's rivers) and the places as numbered
// dots, listed beside the map. Server only: the outlines are large.
import { INDIA_MAP, RAJASTHAN_MAP, type MapProjection } from "@/lib/ca-map-data";
import { RIVERS } from "@/lib/notes-map-data";
import { RAJ_CANALS, RAJ_PROTECTED, RAJ_RIVERS, type GeoLine } from "@/lib/geo-data";
import { RAJ_CONSTITUENCIES, RAJ_DISTRICTS } from "@/lib/geo-admin";
import type { Bi } from "@/lib/current-affairs";
import { MAP_CSS, type MapPlace as NotePlace, type MapSpec as NoteMap } from "@/lib/map-spec";
import { layerLegend, layerSvg, pickBi, type AtlasLayer } from "@/lib/atlas";

// The atlas's thematic layers, as the server last read them (the atlas
// keeps them up to date: see primeAtlasLayers).
let atlasLayers: AtlasLayer[] = [];
export function setAtlasLayers(list: AtlasLayer[]) {
  atlasLayers = list;
}
const mapLayers = (m: NoteMap) =>
  (m.layers ?? [])
    .map((k) => atlasLayers.find((l) => l.key === k))
    .filter((l): l is AtlasLayer => !!l);

type Lang = "en" | "hi";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pick = (b: Bi, lang: Lang) => (lang === "hi" ? b.hi || b.en : b.en || b.hi);

const project = (p: MapProjection, lon: number, lat: number): [number, number] => [
  (lon - p.lon0) * p.k * p.scale,
  (p.lat1 - lat) * p.scale,
];
const unproject = (p: MapProjection, x: number, y: number): [number, number] => [
  x / (p.k * p.scale) + p.lon0,
  p.lat1 - y / p.scale,
];

// A projected path moved from one projection to another.
function reproject(d: string, from: MapProjection, to: MapProjection): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => {
    const [lon, lat] = unproject(from, Number(x), Number(y));
    const [nx, ny] = project(to, lon, lat);
    return `${nx.toFixed(1)},${ny.toFixed(1)}`;
  });
}

let neighbours: string | null = null;

// A place is drawn when it falls on the map (with a small margin).
export function onMap(m: Pick<NoteMap, "region">, p: Pick<NotePlace, "lat" | "lon">): boolean {
  const pr = m.region === "india" ? INDIA_MAP.projection : RAJASTHAN_MAP.projection;
  const [x, y] = project(pr, p.lon, p.lat);
  return x >= -20 && y >= -20 && x <= pr.width + 20 && y <= pr.height + 20;
}

export function noteMapSvg(m: NoteMap, lang: Lang, accent: string): string {
  const india = m.region === "india";
  const pr = india ? INDIA_MAP.projection : RAJASTHAN_MAP.projection;
  const places = m.places.filter((p) => onMap(m, p));
  // The view: the whole region, or closer in when the places sit together
  // (at least a quarter of the region's width, kept inside it).
  let [vx, vy, vw, vh] = [0, 0, pr.width, pr.height];
  if (places.length) {
    const pts = places.map((p) => project(pr, p.lon, p.lat));
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const span = Math.max(
      Math.max(...xs) - Math.min(...xs),
      (Math.max(...ys) - Math.min(...ys)) * (pr.width / pr.height),
    );
    const w = Math.min(pr.width, Math.max(pr.width / 4, span * 1.8 + 60));
    if (w < pr.width * 0.75) {
      const h = (w * pr.height) / pr.width;
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      [vx, vy, vw, vh] = [
        Math.min(Math.max(cx - w / 2, 0), pr.width - w),
        Math.min(Math.max(cy - h / 2, 0), pr.height - h),
        w,
        h,
      ];
    }
  }
  // Sizes stay the same on paper however close the view is.
  const k = vw / pr.width;
  const pad = 16 * k;
  const box = `${(vx - pad).toFixed(1)} ${(vy - pad).toFixed(1)} ${(vw + 2 * pad).toFixed(1)} ${(vh + 2 * pad).toFixed(1)}`;
  const sw = (n: number) => (n * k).toFixed(2);
  const base = india
    ? `<path d="${INDIA_MAP.states}" fill="none" stroke="#cbd5e1" stroke-width="${sw(0.6)}"/><path d="${INDIA_MAP.outline}" fill="#f8fafc" fill-opacity=".6" stroke="#334155" stroke-width="${sw(1)}"/>`
    : `<path d="${RAJASTHAN_MAP.outline}" fill="${accent}" fill-opacity=".07" stroke="none"/><path d="${(neighbours ??= reproject(INDIA_MAP.states, INDIA_MAP.projection, RAJASTHAN_MAP.projection))}" fill="none" stroke="#b8bcc6" stroke-width="${sw(1)}" stroke-dasharray="${sw(5)} ${sw(3)}"/><path d="${RAJASTHAN_MAP.outline}" fill="none" stroke="${accent}" stroke-width="${sw(1.6)}"/>`;
  const inside = ([x, y]: [number, number], margin: number) =>
    x >= vx - margin && y >= vy - margin && x <= vx + vw + margin && y <= vy + vh + margin;
  const path = (lines: GeoLine[]) =>
    lines
      .map((l) => l.map(([lon, lat]) => project(pr, lon, lat)))
      .filter((l) => l.some((q) => inside(q, 40 * k)))
      .map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L"))
      .join("");
  // Labels never overlap: each claims its box (the places' dots first).
  const taken: [number, number, number, number][] = places.map((p) => {
    const [x, y] = project(pr, p.lon, p.lat);
    return [x - 11 * k, y - 11 * k, x + 11 * k, y + 11 * k];
  });
  const claim = (x: number, y: number, text: string, size: number) => {
    const w = text.length * size * (lang === "hi" ? 0.5 : 0.55);
    const box: [number, number, number, number] = [x - w / 2, y - size, x + w / 2, y + size * 0.25];
    if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
      return false;
    taken.push(box);
    return true;
  };
  const label = (x: number, y: number, text: string, cls: string, size: number) =>
    claim(x, y, text, size * k)
      ? `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" style="font-size:${(size * k).toFixed(2)}px;stroke-width:${(size * 0.27 * k).toFixed(2)}px">${esc(text)}</text>`
      : "";
  // A name along a line's longest part in view (the middle, else a little
  // either side when that spot is taken).
  const lineLabel = (lines: GeoLine[], text: string, cls: string, size = 15) => {
    const longest = lines
      .map((l) => l.map(([lon, lat]) => project(pr, lon, lat)).filter((q) => inside(q, -10 * k)))
      .sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length < 3) return "";
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const [x, y] = longest[Math.floor((longest.length - 1) * f)];
      const t = label(x, y - 5 * k, text, cls, size);
      if (t) return t;
    }
    return "";
  };
  // Rivers the map is about (named in its title or places) always show.
  const named = (r: { en: string; hi: string }) => {
    const text = [m.title.en, m.title.hi, ...m.places.flatMap((p) => [p.name.en, p.name.hi])]
      .join(" ")
      .toLowerCase();
    return text.includes(r.en.toLowerCase()) || (!!r.hi && text.includes(r.hi));
  };
  let layers = "";
  let labels = "";
  // The atlas's layers, kept inside Rajasthan (they are drawn from the
  // notes' sketch maps).
  if (!india && mapLayers(m).length) layers += `<g clip-path="url(#nm-raj)">`;
  if (!india)
    for (const l of mapLayers(m))
      layers += layerSvg(
        l,
        (lon, lat) => project(pr, lon, lat),
        k,
        lang,
        (name) => RAJ_DISTRICTS.find((d) => d.en === name)?.rings ?? null,
        { opacity: 0.38, labels: false },
      );
  if (!india && mapLayers(m).length) layers += `</g>`;
  // District names go last: rivers and canals matter more.
  const distLabels: [number, number, string][] = [];
  const acLabels: [number, number, string][] = [];
  if (!india && m.districts) {
    for (const d of RAJ_DISTRICTS) {
      const dp = path(d.rings);
      if (!dp) continue;
      layers += `<path d="${dp}" fill="none" stroke="#c4c8d0" stroke-width="${sw(0.8)}"/>`;
      const [x, y] = project(pr, d.at[0], d.at[1]);
      if (inside([x, y], -20 * k)) distLabels.push([x, y, lang === "hi" ? d.hi : d.en]);
    }
  }
  // Assembly constituencies: thin lines and their numbers (the list beside
  // the map names the places; a student reads the number off the map).
  if (!india && m.constituencies) {
    const ap = path(RAJ_CONSTITUENCIES.flatMap((c) => c.rings));
    if (ap) layers += `<path d="${ap}" fill="none" stroke="#c9a3d4" stroke-width="${sw(0.6)}"/>`;
    // The whole state has too many to read: there, only the seats the
    // map's places are in.
    const hit = (c: (typeof RAJ_CONSTITUENCIES)[number]) =>
      places.some((p) => c.rings.some((r) => inRing(r, p.lon, p.lat)));
    for (const c of RAJ_CONSTITUENCIES) {
      const [x, y] = project(pr, c.at[0], c.at[1]);
      if (inside([x, y], -10 * k) && (k <= 0.6 || hit(c))) acLabels.push([x, y, String(c.n)]);
    }
  }
  if (!india && m.protected) {
    for (const a of RAJ_PROTECTED) {
      const ap = path(a.rings);
      if (ap)
        layers += `<path d="${ap}Z" fill="#16a34a" fill-opacity=".16" stroke="#15803d" stroke-width="${sw(0.6)}"/>`;
    }
  }
  if (m.rivers) {
    // Rajasthan's main rivers always; tributaries closer in; the rest
    // closer still, or when the map names them (named ones first).
    const shown = (india ? RIVERS.map((r) => ({ ...r, tier: 1 as const })) : RAJ_RIVERS)
      .map((r) => ({ ...r, tier: r.tier ?? 1, key: named(r) }))
      .filter((r) => r.key || r.tier === 1 || (r.tier === 2 && k <= 0.6) || k <= 0.35)
      .sort((a, b) => Number(b.key) - Number(a.key) || a.tier - b.tier);
    for (const r of shown) {
      const rp = path(r.lines);
      if (!rp) continue;
      const width = r.key ? 2.2 : india ? 1.2 : r.tier === 1 ? 1.5 : 1;
      layers += `<path d="${rp}" fill="none" stroke="#2563eb" stroke-opacity="${r.key || r.tier === 1 ? 1 : 0.75}" stroke-width="${sw(width)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      labels += lineLabel(
        r.lines,
        lang === "hi" ? r.hi : r.en,
        "nm-river",
        r.tier === 1 || r.key ? 15 : 12.5,
      );
    }
  }
  if (!india && m.canals) {
    for (const c of RAJ_CANALS) {
      const cp = path(c.lines);
      if (!cp) continue;
      layers += `<path d="${cp}" fill="none" stroke="#0891b2" stroke-width="${sw(1.6)}" stroke-dasharray="${sw(6)} ${sw(3)}"/>`;
      labels += lineLabel(c.lines, lang === "hi" ? c.hi : c.en, "nm-canal");
    }
  }
  for (const [x, y, t] of distLabels) labels += label(x, y, t, "nm-dist", 12);
  // A seat's number moves a little off a place's dot rather than go.
  for (const [x, y, t] of acLabels)
    for (const [dx, dy] of [
      [0, 0],
      [0, 16],
      [0, -14],
      [16, 4],
      [-16, 4],
    ]) {
      const l = label(x + dx * k, y + dy * k, t, "nm-ac", 9);
      if (l) {
        labels += l;
        break;
      }
    }
  const dots = places
    .map((p, i) => {
      const [x, y] = project(pr, p.lon, p.lat);
      return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(9 * k).toFixed(2)}" fill="${accent}" stroke="#fff" stroke-width="${sw(1.6)}"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy=".36em" text-anchor="middle" class="nm-num" style="font-size:${(11 * k).toFixed(2)}px">${i + 1}</text></g>`;
    })
    .join("");
  const nx = vx + vw - 14 * k;
  const ny = vy + 18 * k;
  return `<svg viewBox="${box}" class="nm" role="img" aria-label="${esc(pick(m.title, lang))}"><defs>${india ? "" : `<clipPath id="nm-raj"><path d="${RAJASTHAN_MAP.outline}"/></clipPath>`}<clipPath id="nm-clip"><rect x="${(vx - pad).toFixed(1)}" y="${(vy - pad).toFixed(1)}" width="${(vw + 2 * pad).toFixed(1)}" height="${(vh + 2 * pad).toFixed(1)}"/></clipPath></defs><rect x="${(vx - pad).toFixed(1)}" y="${(vy - pad).toFixed(1)}" width="${(vw + 2 * pad).toFixed(1)}" height="${(vh + 2 * pad).toFixed(1)}" fill="#fbfaf7"/><g clip-path="url(#nm-clip)">${base}${layers}${labels}${dots}</g><g transform="translate(${nx.toFixed(1)},${ny.toFixed(1)}) scale(${k.toFixed(3)})"><path d="M0,-14 L6,4 L0,0 L-6,4 Z" fill="#1f2430"/><text y="17" text-anchor="middle" class="nm-n">N</text></g></svg>`;
}

function inRing(ring: [number, number][], lon: number, lat: number) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// The map with its numbered places listed beside it.
// In a review copy, places the AI placed that aren't in the place list
// carry ◇ until the editor checks them.
export function noteMapHtml(m: NoteMap, lang: Lang, accent: string, review = false): string {
  const places = m.places.filter((p) => onMap(m, p));
  const mark = (p: NotePlace) =>
    review && p.src === "ai" ? `<sup class="ai" title="Position not checked">◇</sup>` : "";
  return `<figure class="nmap"><div class="nmap-svg">${noteMapSvg(m, lang, accent)}</div><div class="nmap-side"><ol class="nmap-list">${places.map((p, i) => `<li><span class="dn">${i + 1}</span>${esc(pick(p.name, lang))}${mark(p)}</li>`).join("")}</ol>${legendHtml(m, lang)}<div class="nmap-credit">${
    lang === "hi" ? "मानचित्र पैमाने पर नहीं" : "Map not to scale"
  }</div></div></figure>`;
}

export const NOTE_MAP_CSS = MAP_CSS;

// The thematic layers' keys (colour → name) under the places.
function legendHtml(m: NoteMap, lang: Lang): string {
  const items = mapLayers(m).flatMap((l) => layerLegend(l));
  if (!items.length) return "";
  return `<ul class="nmap-legend">${items
    .slice(0, 14)
    .map(
      (x) =>
        `<li><i class="${x.kind === "line" ? "ln" : ""}" style="background:${x.color}"></i>${esc(pickBi(x.name, lang))}</li>`,
    )
    .join("")}</ul>`;
}
