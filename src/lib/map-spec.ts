// A map as the notes and the magazine's stories keep it: Rajasthan or India,
// the layers drawn (rivers, canals, districts, protected areas), a title and
// up to twelve numbered places. Each place says where its position came
// from: the place list (checked), the AI (to check) or the editor. Pure:
// shared by the server, the admin panel and tests.
import type { Bi } from "@/lib/current-affairs";

export type MapPlaceSource = "list" | "ai" | "you";
export type MapPlace = {
  name: Bi;
  lat: number;
  lon: number;
  src?: MapPlaceSource;
  // The place list's kind (d dam, n national park, w sanctuary…).
  kind?: string;
};
export type MapSpec = {
  region: "rajasthan" | "india";
  rivers: boolean;
  // Rajasthan maps only.
  districts?: boolean;
  protected?: boolean;
  canals?: boolean;
  title: Bi;
  places: MapPlace[];
};

export const MAX_PLACES = 12;

export const EMPTY_MAP: MapSpec = {
  region: "rajasthan",
  rivers: true,
  districts: false,
  protected: false,
  canals: false,
  title: { en: "", hi: "" },
  places: [],
};

const str = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const bi = (v: unknown, max: number): Bi => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: str(o.en, max), hi: str(o.hi, max) };
};

// A map as the AI wrote it or the editor saved it, cleaned; null when it
// isn't a map. Places without a name or a position are dropped (the editor
// keeps the one they are typing until it has both).
export function normalizeMap(v: unknown): MapSpec | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const places = (Array.isArray(m.places) ? m.places : [])
    .map((x): MapPlace | null => {
      const p = (x ?? {}) as Record<string, unknown>;
      const name = p.name && typeof p.name === "object" ? bi(p.name, 60) : bi(p, 60);
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (!(name.en || name.hi) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      const src = p.src === "list" || p.src === "you" || p.src === "ai" ? p.src : undefined;
      const kind = str(p.kind, 2);
      return {
        name,
        lat: Math.round(lat * 1e4) / 1e4,
        lon: Math.round(lon * 1e4) / 1e4,
        ...(src ? { src } : {}),
        ...(kind ? { kind } : {}),
      };
    })
    .filter((p): p is MapPlace => !!p)
    .slice(0, MAX_PLACES);
  const region = m.region === "india" ? "india" : "rajasthan";
  return {
    region,
    rivers: m.rivers === true,
    ...(region === "rajasthan"
      ? {
          districts: m.districts === true,
          protected: m.protected === true,
          canals: m.canals === true,
        }
      : {}),
    title: bi(m.title, 100),
    places,
  };
}

// Places whose position no one has checked (from the AI, not found in the
// place list).
export const uncheckedPlaces = (m: MapSpec | null | undefined) =>
  (m?.places ?? []).filter((p) => p.src === "ai").length;

// A link to check a position on Google Maps (the editor's own check; the
// maps we print never use Google's).
export const googleMapsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;

export const PLACE_KIND_NAMES: Record<string, string> = {
  c: "Town",
  t: "Tehsil HQ",
  d: "Dam",
  n: "National park",
  w: "Sanctuary",
  l: "Lake",
  f: "Fort",
  h: "Hill / peak / pass",
  r: "Range",
  s: "Site",
  v: "Village",
};

// The maps' print styles (the notes and the magazine).
export const MAP_CSS = `
.nmap { display: grid; grid-template-columns: 50% 1fr; gap: 4mm; align-items: start; margin: 1mm 0 3mm; break-inside: avoid; }
.nmap-svg svg { display: block; width: 100%; height: auto; border-radius: 1mm; }
.nm text { font-family: var(--body, inherit); }
.nm .nm-river { font-size: 15px; fill: #1d4ed8; font-style: italic; text-anchor: middle; paint-order: stroke; stroke: #fbfaf7; stroke-width: 4px; }
.nm .nm-canal { font-size: 15px; fill: #0e7490; font-style: italic; text-anchor: middle; paint-order: stroke; stroke: #fbfaf7; stroke-width: 4px; }
.nm .nm-dist { font-size: 12px; fill: #8a8f9c; text-anchor: middle; paint-order: stroke; stroke: #fbfaf7; stroke-width: 3px; letter-spacing: .02em; }
.nm .nm-num { font-size: 11px; font-weight: 700; fill: #fff; }
.nm .nm-n { font-size: 12px; font-weight: 700; fill: #1f2430; }
.nmap-title { font-weight: 700; margin-bottom: 1.5mm; }
.nmap-list { list-style: none; padding: 0; margin: 0; font-size: 9.2pt; columns: 1; }
.nmap-list li { display: flex; align-items: center; gap: 1.5mm; padding: 0.6mm 0; }
.nmap-credit { font-size: 7pt; color: #6b7080; margin-top: 2mm; }
`;
