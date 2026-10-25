// The notes' maps: Rajasthan (with its neighbours' borders) or India, from
// the magazine's outlines (DataMeet, following the Survey of India boundary),
// with India's rivers when the topic needs them (Natural Earth) and the
// topic's places as numbered dots, listed beside the map. Server only: the
// outlines are large.
import { INDIA_MAP, RAJASTHAN_MAP, type MapProjection } from "@/lib/ca-map-data";
import { RIVERS } from "@/lib/notes-map-data";
import type { Bi } from "@/lib/current-affairs";
import type { NoteMap, NotePlace } from "@/lib/notes-write";

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
  let rivers = "";
  let labels = "";
  if (m.rivers) {
    const inside = ([x, y]: [number, number], margin: number) =>
      x >= vx - margin && y >= vy - margin && x <= vx + vw + margin && y <= vy + vh + margin;
    for (const r of RIVERS) {
      const segs = r.lines
        .map((l) => l.map(([lon, lat]) => project(pr, lon, lat)))
        .filter((l) => l.some((q) => inside(q, 40 * k)));
      if (!segs.length) continue;
      rivers += `<path d="${segs.map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")).join("")}" fill="none" stroke="#2563eb" stroke-width="${sw(india ? 1.2 : 1.8)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      // The name at the middle of its longest part in view.
      const longest = segs
        .map((l) => l.filter((q) => inside(q, -10 * k)))
        .sort((a, b) => b.length - a.length)[0];
      if (longest && longest.length >= 3) {
        const [x, y] = longest[Math.floor(longest.length / 2)];
        labels += `<text x="${x.toFixed(1)}" y="${(y - 5 * k).toFixed(1)}" class="nm-river" style="font-size:${(15 * k).toFixed(2)}px;stroke-width:${(4 * k).toFixed(2)}px">${esc(lang === "hi" ? r.hi : r.en)}</text>`;
      }
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
  return `<svg viewBox="${box}" class="nm" role="img" aria-label="${esc(pick(m.title, lang))}"><defs><clipPath id="nm-clip"><rect x="${(vx - pad).toFixed(1)}" y="${(vy - pad).toFixed(1)}" width="${(vw + 2 * pad).toFixed(1)}" height="${(vh + 2 * pad).toFixed(1)}"/></clipPath></defs><rect x="${(vx - pad).toFixed(1)}" y="${(vy - pad).toFixed(1)}" width="${(vw + 2 * pad).toFixed(1)}" height="${(vh + 2 * pad).toFixed(1)}" fill="#fbfaf7"/><g clip-path="url(#nm-clip)">${base}${rivers}${labels}${dots}</g><g transform="translate(${nx.toFixed(1)},${ny.toFixed(1)}) scale(${k.toFixed(3)})"><path d="M0,-14 L6,4 L0,0 L-6,4 Z" fill="#1f2430"/><text y="17" text-anchor="middle" class="nm-n">N</text></g></svg>`;
}

// The map with its numbered places listed beside it.
export function noteMapHtml(m: NoteMap, lang: Lang, accent: string): string {
  const places = m.places.filter((p) => onMap(m, p));
  return `<figure class="nmap"><div class="nmap-svg">${noteMapSvg(m, lang, accent)}</div><div class="nmap-side"><ol class="nmap-list">${places.map((p, i) => `<li><span class="dn">${i + 1}</span>${esc(pick(p.name, lang))}</li>`).join("")}</ol><div class="nmap-credit">${
    lang === "hi" ? "मानचित्र पैमाने पर नहीं" : "Map not to scale"
  }</div></div></figure>`;
}

export const NOTE_MAP_CSS = `
.nmap { display: grid; grid-template-columns: 50% 1fr; gap: 4mm; align-items: start; margin: 1mm 0 3mm; break-inside: avoid; }
.nmap-svg svg { display: block; width: 100%; height: auto; border-radius: 1mm; }
.nm text { font-family: var(--body); }
.nm .nm-river { font-size: 15px; fill: #1d4ed8; font-style: italic; text-anchor: middle; paint-order: stroke; stroke: #fbfaf7; stroke-width: 4px; }
.nm .nm-num { font-size: 11px; font-weight: 700; fill: #fff; }
.nm .nm-n { font-size: 12px; font-weight: 700; fill: #1f2430; }
.nmap-title { font-weight: 700; margin-bottom: 1.5mm; }
.nmap-list { list-style: none; padding: 0; margin: 0; font-size: 9.2pt; columns: 1; }
.nmap-list li { display: flex; align-items: center; gap: 1.5mm; padding: 0.6mm 0; }
.nmap-credit { font-size: 7pt; color: #6b7080; margin-top: 2mm; }
`;
