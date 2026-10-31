// The atlas's map: Rajasthan's districts, its main rivers, a thematic layer
// coloured under them, line layers over them and the places as dots by
// category. Drag to move, wheel or pinch to zoom; places and districts are
// tapped. Shared by the students' atlas and the district pages.
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  atlasCat,
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
  onPlace,
  onDistrict,
  blind = false,
  marks,
  named = [],
  className = "",
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
  onPlace?: (key: string) => void;
  onDistrict?: (name: string) => void;
  // A quiz: no names on the map (districts, places), and districts coloured
  // by `marks` (a colour by district).
  blind?: boolean;
  marks?: Record<string, string>;
  // Districts whose names show on a blind map (an answered question's).
  named?: string[];
  className?: string;
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
  const k = view.w / (W + 20);

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
  const stateD = useMemo(
    () => base.districts.map((d) => d.rings.map(ring).join("")).join(""),
    [base.districts],
  );
  const r = 5.5 * k;
  // Names that fit: the places with the most facts first, none over
  // another name or another dot (the chosen place always).
  const labelled = useMemo(() => {
    const out = new Set<string>();
    if (blind) return out;
    if (!(zoom > 3.5 || own)) {
      if (selected) out.add(selected);
      return out;
    }
    const size = (own ? 12 : 10) * k;
    const boxes: [number, number, number, number][] = places.map((p) => {
      const [x, y] = project(p[5], p[4]);
      return [x - r, y - r, x + r, y + r];
    });
    const hit = (b: [number, number, number, number]) =>
      boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = [...places].sort(
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
  }, [places, zoom > 3.5, Math.round(k * 50), own, selected, lang, blind]);
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
        <g style={{ pointerEvents: "none" }}>
          {shown.map((d) => {
            if (blind && !named.includes(d.en)) return null;
            const [x, y] = project(d.at[0], d.at[1]);
            const size = (own ? 22 : 11) * k;
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
          {places.map((p) => {
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
                <circle cx={x} cy={y} r={r * 2.2} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={on ? r * 1.6 : r}
                  fill={c.color}
                  stroke="#fff"
                  strokeWidth={r * 0.35}
                />
                {labelled.has(p[0]) && (
                  <text
                    x={x + r * 1.6}
                    y={y + r * 0.6}
                    fontSize={(own ? 12 : 10) * k}
                    fill="#1f2430"
                    stroke="#fffdf6"
                    strokeWidth={2.4 * k}
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
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
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
