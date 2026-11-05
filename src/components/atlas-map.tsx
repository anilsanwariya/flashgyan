// The atlas's map: Rajasthan's districts, its main rivers, a thematic layer
// coloured under them, line layers over them and the places as dots by
// category. Drag to move, wheel or pinch to zoom; places and districts are
// tapped. Shared by the students' atlas and the district pages.
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  atlasCat,
  clusterDots,
  layerSvg,
  pickBi,
  type AtlasLang,
  type AtlasLayer,
  type LonLat,
} from "@/lib/atlas";
import type { AtlasBase, PublicPlace } from "@/lib/atlas.functions";

// Longitude/latitude to the map's x/y (degrees of longitude shortened at
// Rajasthan's latitude so shapes keep their proportions).
const LON0 = 69.2;
const LAT1 = 30.3;
const K = Math.cos((26.5 * Math.PI) / 180);
const S = 100;
export const project = (lon: number, lat: number): [number, number] => [
  (lon - LON0) * K * S,
  (LAT1 - lat) * S,
];
const W = (78.4 - LON0) * K * S;
const H = (LAT1 - 23) * S;

type View = { x: number; y: number; w: number; h: number };
const ring = (r: LonLat[]) =>
  "M" +
  r
    .map(([lon, lat]) => project(lon, lat))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join("L") +
  "Z";

export function fitView(rings: LonLat[][], pad = 0.08): View {
  const pts = rings.flat().map(([lon, lat]) => project(lon, lat));
  if (!pts.length) return { x: 0, y: 0, w: W, h: H };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  return { x: x0 - w * pad, y: y0 - h * pad, w: w * (1 + 2 * pad), h: h * (1 + 2 * pad) };
}

export function AtlasMap({
  base,
  places,
  lang,
  colour,
  overlays,
  selected,
  focus,
  district,
  highlight = null,
  onPlace,
  onDistrict,
  blind = false,
  marks,
  named = [],
  cluster = false,
  className = "",
  fullscreen,
  onFullscreen,
  nearMe = false,
}: {
  base: AtlasBase;
  places: PublicPlace[];
  lang: AtlasLang;
  // The thematic layer colouring the map, and the line layers drawn over it.
  colour: string | null;
  overlays: string[];
  selected?: string | null;
  // Fly to this place or district when it changes.
  focus?: { lon: number; lat: number; zoom?: number } | null;
  // A district page: only this district, its outline and its places.
  district?: string;
  // The district open beside the map: outlined, the others faded.
  highlight?: string | null;
  onPlace?: (key: string) => void;
  onDistrict?: (name: string) => void;
  // A quiz: no names on the map (districts, places), and districts coloured
  // by `marks` (a colour by district).
  blind?: boolean;
  marks?: Record<string, string>;
  // Districts whose names show on a blind map (an answered question's).
  named?: string[];
  // Crowded dots drawn as one, with a list of the places there.
  cluster?: boolean;
  className?: string;
  // A full-screen button (the page decides what full screen is).
  fullscreen?: boolean;
  onFullscreen?: () => void;
  // A "Near me" button: the device's position on the map.
  nearMe?: boolean;
}) {
  const own = district ? base.districts.find((d) => d.en === district) : null;
  const home = useMemo(
    () => (own ? fitView(own.rings, 0.06) : { x: -10, y: -10, w: W + 20, h: H + 20 }),
    [own],
  );
  const [view, setView] = useState<View>(home);
  useEffect(() => setView(home), [home]);
  const svg = useRef<SVGSVGElement>(null);
  const zoom = home.w / view.w;
  // The map's width on screen, so names and dots are sized in screen pixels:
  // as readable on a phone as on a laptop, at every zoom.
  const [px, setPx] = useState(0);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Map units per screen pixel (before the first measure: as a laptop).
  const u = view.w / (px || 940);
  const narrow = px > 0 && px < 560;

  useEffect(() => {
    if (!focus) return;
    const [x, y] = project(focus.lon, focus.lat);
    const w = home.w / (focus.zoom ?? 5);
    setView({ x: x - w / 2, y: y - (w * (home.h / home.w)) / 2, w, h: w * (home.h / home.w) });
  }, [focus, home]);

  // Zoom about a point (in screen coordinates within the map).
  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const el = svg.current?.getBoundingClientRect();
      const fx = el && cx !== undefined ? (cx - el.left) / el.width : 0.5;
      const fy = el && cy !== undefined ? (cy - el.top) / el.height : 0.5;
      const w = Math.min(home.w * 1.2, Math.max(home.w / 40, v.w / factor));
      const h = w * (v.h / v.w);
      return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
    });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);
  // Drag to pan; two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    const last = p.get(e.pointerId);
    if (!last) return;
    const el = svg.current?.getBoundingClientRect();
    if (!el) return;
    if (p.size === 2) {
      const [a, b] = [...p.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) zoomAt(after / before, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
    } else {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
      setView((v) => ({ ...v, x: v.x - (dx * v.w) / el.width, y: v.y - (dy * v.h) / el.height }));
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => pointers.current.delete(e.pointerId);

  const districtRings = (name: string) => base.districts.find((d) => d.en === name)?.rings ?? null;
  const colourLayer = base.layers.find((l) => l.key === colour) ?? null;
  const lineLayers = overlays
    .map((key) => base.layers.find((l) => l.key === key))
    .filter((l): l is AtlasLayer => !!l);
  // The layers' SVG, drawn once per choice (their strokes don't scale).
  const layersSvg = useMemo(() => {
    const clip = (l: AtlasLayer): AtlasLayer =>
      own
        ? { ...l, items: l.items.filter((f) => f.kind !== "district" || f.district === own.en) }
        : l;
    return (
      (colourLayer
        ? layerSvg(clip(colourLayer), project, 1, lang, districtRings, {
            opacity: 0.55,
            labels: false,
          })
        : "") +
      lineLayers
        .map((l) => layerSvg(l, project, 1, lang, districtRings, { labels: false }))
        .join("")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colour, overlays.join(","), lang, own]);

  const shown = own ? base.districts.filter((d) => d.en === own.en) : base.districts;
  // Each district's width (map units): its name shows only when it fits.
  const widths = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of base.districts) {
      const xs = d.rings.flat().map(([lon, lat]) => project(lon, lat)[0]);
      m.set(d.en, Math.max(...xs) - Math.min(...xs));
    }
    return m;
  }, [base.districts]);
  // Near me: where the device is (shown as a blue dot), or why not.
  const [me, setMe] = useState<{ x: number; y: number } | null>(null);
  const [meNote, setMeNote] = useState("");
  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMeNote(
        lang === "hi" ? "यह डिवाइस स्थान नहीं बताता।" : "This device can't tell its location.",
      );
      return;
    }
    setMeNote(lang === "hi" ? "स्थान खोज रहे हैं…" : "Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lon, latitude: lat } = pos.coords;
        if (lon < 69 || lon > 78.6 || lat < 22.8 || lat > 30.5) {
          setMe(null);
          setMeNote(lang === "hi" ? "आप राजस्थान से बाहर हैं।" : "You're outside Rajasthan.");
          return;
        }
        const [x, y] = project(lon, lat);
        setMe({ x, y });
        setMeNote("");
        const w = home.w / 6;
        const h = w * (home.h / home.w);
        setView({ x: x - w / 2, y: y - h / 2, w, h });
      },
      () =>
        setMeNote(
          lang === "hi" ? "स्थान की अनुमति नहीं मिली।" : "Location permission wasn't given.",
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };
  useEffect(() => {
    if (!meNote || meNote.endsWith("…")) return;
    const t = setTimeout(() => setMeNote(""), 4000);
    return () => clearTimeout(t);
  }, [meNote]);
  // A scale bar about 80px long, in a round number of km (1 map unit ≈ 1.11 km).
  const kmPerPx = u * (111.32 / 100);
  const scaleKm = (() => {
    const raw = 80 * kmPerPx;
    const p10 = 10 ** Math.floor(Math.log10(raw));
    return (
      [1, 2, 5, 10]
        .map((m) => m * p10)
        .filter((v) => v <= raw)
        .pop() ?? p10
    );
  })();
  const stateD = useMemo(
    () => base.districts.map((d) => d.rings.map(ring).join("")).join(""),
    [base.districts],
  );
  // A dot's radius: 6px (5px on a phone); a place's name 13px (12px).
  const r = (narrow ? 5 : 6) * u;
  const labelPx = own ? 13 : narrow ? 12 : 12.5;
  // Crowded dots: groups of two or more (the chosen place always alone).
  const groups = useMemo(() => {
    if (!cluster || zoom > 8) return null;
    const dots = places
      .filter((p) => p[0] !== selected)
      .map((p) => {
        const [x, y] = project(p[5], p[4]);
        return { key: p[0], x, y, w: p[7], p };
      });
    return clusterDots(dots, r * 2.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, cluster, Math.round(r * 40), selected]);
  const crowds = groups?.filter((g) => g.members.length > 1) ?? [];
  const alone = useMemo(() => {
    if (!groups) return places;
    const single = new Set(
      groups.filter((g) => g.members.length === 1).map((g) => g.members[0].key),
    );
    return places.filter((p) => single.has(p[0]) || p[0] === selected);
  }, [groups, places, selected]);
  const [here, setHere] = useState<{
    x: number;
    y: number;
    members: { x: number; y: number; p: PublicPlace }[];
  } | null>(null);
  useEffect(() => setHere(null), [places]);
  const zoomTo = (pts: { x: number; y: number }[]) => {
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const pad = r * 6;
    const w = Math.max(
      home.w / 40,
      Math.max(...xs) - Math.min(...xs) + pad * 2,
      ((Math.max(...ys) - Math.min(...ys) + pad * 2) * home.w) / home.h,
    );
    const h = w * (home.h / home.w);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    setView({ x: cx - w / 2, y: cy - h / 2, w, h });
  };
  // Names that fit: the places with the most facts first, none over
  // another name or another dot (the chosen place always).
  const labelled = useMemo(() => {
    const out = new Set<string>();
    if (blind) return out;
    if (!(zoom > 3.5 || own)) {
      if (selected) out.add(selected);
      return out;
    }
    const size = labelPx * u;
    const boxes: [number, number, number, number][] = alone.map((p) => {
      const [x, y] = project(p[5], p[4]);
      return [x - r, y - r, x + r, y + r];
    });
    const hit = (b: [number, number, number, number]) =>
      boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = [...alone].sort(
      (a, b) => Number(b[0] === selected) - Number(a[0] === selected) || b[7] - a[7],
    );
    for (const p of order) {
      const [x, y] = project(p[5], p[4]);
      const text = lang === "hi" ? p[2] || p[1] : p[1];
      const w = text.length * size * (lang === "hi" ? 0.5 : 0.55);
      const box: [number, number, number, number] = [
        x + r * 1.4,
        y - size * 0.7,
        x + r * 1.6 + w,
        y + size * 0.4,
      ];
      if (p[0] !== selected && hit(box)) continue;
      boxes.push(box);
      out.add(p[0]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alone, zoom > 3.5, Math.round(u * 500), own, selected, lang, blind]);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-[#eef2f7] dark:bg-slate-900 ${className}`}
    >
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label={lang === "hi" ? "राजस्थान का मानचित्र" : "Map of Rajasthan"}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          {own && (
            <clipPath id="atlas-own">
              <path d={own.rings.map(ring).join("")} />
            </clipPath>
          )}
          <clipPath id="atlas-state">
            <path d={stateD} />
          </clipPath>
        </defs>
        {own && (
          <g opacity=".35">
            {base.districts
              .filter((d) => d.en !== own.en)
              .map((d) => (
                <path
                  key={d.en}
                  d={d.rings.map(ring).join("")}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </g>
        )}
        <g>
          {shown.map((d) => (
            <path
              key={d.en}
              d={d.rings.map(ring).join("")}
              fill={marks?.[d.en] ?? "#fffdf6"}
              stroke="#94a3b8"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              className={onDistrict && !marks?.[d.en] ? "cursor-pointer hover:fill-amber-50" : ""}
              onClick={() => !moved.current && onDistrict?.(d.en)}
              data-district={d.en}
            >
              {!blind && <title>{lang === "hi" ? d.hi : d.en}</title>}
            </path>
          ))}
        </g>
        <g
          clipPath={own ? "url(#atlas-own)" : "url(#atlas-state)"}
          style={{ pointerEvents: "none" }}
          className="[&_path]:[vector-effect:non-scaling-stroke]"
          dangerouslySetInnerHTML={{ __html: layersSvg }}
        />
        <g
          style={{ pointerEvents: "none" }}
          clipPath={own ? "url(#atlas-own)" : "url(#atlas-state)"}
        >
          {base.rivers
            .filter((rv) => rv.tier === 1 || zoom > 2.5)
            .map((rv) => (
              <path
                key={rv.en}
                d={rv.lines
                  .map(
                    (l) =>
                      "M" +
                      l
                        .map(([lon, lat]) =>
                          project(lon, lat)
                            .map((n) => n.toFixed(1))
                            .join(","),
                        )
                        .join("L"),
                  )
                  .join("")}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={rv.tier === 1 ? 1.4 : 0.9}
                strokeOpacity={0.8}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <path
            d={shown.map((d) => d.rings.map(ring).join("")).join("")}
            fill="none"
            stroke="#334155"
            strokeWidth={own ? 2 : 0.9}
            vectorEffect="non-scaling-stroke"
          />
        </g>
        {highlight && !own && base.districts.some((d) => d.en === highlight) && (
          <g style={{ pointerEvents: "none" }} data-highlight={highlight}>
            <path
              d={base.districts
                .filter((d) => d.en !== highlight)
                .map((d) => d.rings.map(ring).join(""))
                .join("")}
              fill="#ffffff"
              fillOpacity={0.45}
              stroke="none"
            />
            <path
              d={base.districts
                .find((d) => d.en === highlight)!
                .rings.map(ring)
                .join("")}
              fill="none"
              stroke="#d97706"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
        <g style={{ pointerEvents: "none" }}>
          {shown.map((d) => {
            if (blind && !named.includes(d.en)) return null;
            const [x, y] = project(d.at[0], d.at[1]);
            // Small on a phone's whole-state view (41 names in 360px), full
            // size once zoomed.
            const size = (own ? 22 : narrow && zoom < 1.8 ? 9 : 12) * u;
            // Only names that fit across their district (fewer, not crowded,
            // on a phone's whole-state view; all of them once zoomed).
            const name = lang === "hi" ? d.hi : d.en;
            const textW = name.length * size * (lang === "hi" ? 0.5 : 0.56);
            if (!own && !named.includes(d.en) && textW > (widths.get(d.en) ?? 0) * 1.05)
              return null;
            return (
              <text
                key={d.en}
                x={x}
                y={y}
                textAnchor="middle"
                fontSize={size}
                fontWeight={600}
                fill="#334155"
                stroke="#fffdf6"
                strokeWidth={size * 0.25}
                paintOrder="stroke"
                opacity={own ? 0.25 : 0.85}
              >
                {lang === "hi" ? d.hi : d.en}
              </text>
            );
          })}
        </g>
        <g>
          {crowds.map((g) => {
            const top = atlasCat(g.members[0].p[3]);
            const n = g.members.length;
            return (
              <g
                key={`c:${g.members[0].key}`}
                className="cursor-pointer"
                role="button"
                aria-label={lang === "hi" ? `यहाँ ${n} स्थान` : `${n} places here`}
                data-crowd={n}
                onClick={() => !moved.current && setHere(g)}
              >
                <circle cx={g.x} cy={g.y} r={r * 3} fill="transparent" />
                <circle
                  cx={g.x}
                  cy={g.y}
                  r={r * (1.5 + Math.min(n, 20) / 20)}
                  fill={top.color}
                  fillOpacity={0.9}
                  stroke="#fff"
                  strokeWidth={r * 0.35}
                />
                <text
                  x={g.x}
                  y={g.y + r * 0.55}
                  textAnchor="middle"
                  fontSize={Math.max(r * 1.5, 10 * u)}
                  fontWeight={700}
                  fill="#fff"
                  style={{ pointerEvents: "none" }}
                >
                  {n}
                </text>
              </g>
            );
          })}
          {alone.map((p) => {
            const [x, y] = project(p[5], p[4]);
            const c = atlasCat(p[3]);
            const on = selected === p[0];
            return (
              <g
                key={p[0]}
                className="cursor-pointer"
                onClick={() => !moved.current && onPlace?.(p[0])}
                role="button"
                aria-label={blind ? undefined : lang === "hi" ? p[2] || p[1] : p[1]}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={Math.max(r * 2.2, (narrow ? 14 : 10) * u)}
                  fill="transparent"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={on ? r * 1.6 : r}
                  fill={c.color}
                  stroke="#fff"
                  strokeWidth={r * 0.35}
                />
                {on && (
                  // The tapped dot answers: a ring that spreads twice.
                  <circle
                    key={`pulse:${p[0]}`}
                    cx={x}
                    cy={y}
                    r={r * 1.6}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={r * 0.5}
                    style={{ pointerEvents: "none" }}
                    data-pulse
                  >
                    <animate
                      attributeName="r"
                      from={r * 1.6}
                      to={r * 5}
                      dur="0.9s"
                      repeatCount="2"
                      fill="freeze"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.9"
                      to="0"
                      dur="0.9s"
                      repeatCount="2"
                      fill="freeze"
                    />
                  </circle>
                )}
                {labelled.has(p[0]) && (
                  <text
                    x={x + r * 1.6}
                    y={y + r * 0.6}
                    fontSize={labelPx * u}
                    fill="#1f2430"
                    stroke="#fffdf6"
                    strokeWidth={3 * u}
                    paintOrder="stroke"
                    fontWeight={on ? 700 : 500}
                    style={{ pointerEvents: "none" }}
                  >
                    {lang === "hi" ? p[2] || p[1] : p[1]}
                  </text>
                )}
                {!blind && (
                  <title>{`${lang === "hi" ? p[2] || p[1] : p[1]} · ${pickBi(c.name, lang)}`}</title>
                )}
              </g>
            );
          })}
        </g>
        {me && (
          <g style={{ pointerEvents: "none" }} data-me>
            <circle cx={me.x} cy={me.y} r={14 * u} fill="#2563eb" fillOpacity={0.18} />
            <circle
              cx={me.x}
              cy={me.y}
              r={6 * u}
              fill="#2563eb"
              stroke="#fff"
              strokeWidth={2.5 * u}
            />
          </g>
        )}
      </svg>
      {!blind && (
        <div
          className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 print:hidden"
          data-scale
        >
          <div
            className="h-1.5 border-x-2 border-b-2 border-slate-700 dark:border-slate-200"
            style={{ width: `${Math.round(scaleKm / kmPerPx)}px` }}
          />
          {scaleKm} km
        </div>
      )}
      {meNote && (
        <p
          className="absolute inset-x-2 top-2 mx-auto w-fit max-w-[80%] rounded-lg bg-background/95 px-3 py-1.5 text-center text-xs shadow"
          role="status"
        >
          {meNote}
        </p>
      )}
      {here && (
        <div
          className="absolute inset-x-2 bottom-2 max-h-[45%] overflow-y-auto rounded-xl border border-border bg-background/95 p-2 shadow-lg sm:right-auto sm:w-80"
          data-places-here
        >
          <div className="mb-1 flex items-center gap-2">
            <p className="flex-1 text-sm font-semibold">
              {lang === "hi"
                ? `यहाँ ${here.members.length} स्थान`
                : `${here.members.length} places here`}
            </p>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
              onClick={() => {
                zoomTo(here.members);
                setHere(null);
              }}
            >
              {lang === "hi" ? "बड़ा करके देखें" : "Zoom in"}
            </button>
            <button
              type="button"
              aria-label={lang === "hi" ? "बंद करें" : "Close"}
              className="grid h-6 w-6 place-items-center rounded hover:bg-muted"
              onClick={() => setHere(null)}
            >
              ×
            </button>
          </div>
          <ul className="space-y-0.5">
            {here.members.map(({ p }) => (
              <li key={p[0]}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setHere(null);
                    onPlace?.(p[0]);
                  }}
                >
                  <span>{atlasCat(p[3]).icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {lang === "hi" ? p[2] || p[1] : p[1]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {pickBi(atlasCat(p[3]).name, lang)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="absolute right-2 top-2 flex flex-col gap-1 print:hidden">
        {[
          { icon: Plus, label: lang === "hi" ? "बड़ा करें" : "Zoom in", on: () => zoomAt(1.5) },
          {
            icon: Minus,
            label: lang === "hi" ? "छोटा करें" : "Zoom out",
            on: () => zoomAt(1 / 1.5),
          },
          {
            icon: RotateCcw,
            label: lang === "hi" ? "पूरा मानचित्र" : "Whole map",
            on: () => setView(home),
          },
          ...(nearMe
            ? [{ icon: LocateFixed, label: lang === "hi" ? "मेरे पास" : "Near me", on: locate }]
            : []),
          ...(onFullscreen
            ? [
                {
                  icon: fullscreen ? Minimize2 : Maximize2,
                  label: fullscreen
                    ? lang === "hi"
                      ? "पूर्ण स्क्रीन बंद करें"
                      : "Exit full screen"
                    : lang === "hi"
                      ? "पूर्ण स्क्रीन"
                      : "Full screen",
                  on: onFullscreen,
                },
              ]
            : []),
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            title={b.label}
            onClick={b.on}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/95 shadow-sm hover:bg-muted"
          >
            <b.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
