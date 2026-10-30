// Editing a map (the notes' and the stories'): the region, the layers drawn,
// the title and the numbered places. Each place shows where its position
// came from: the place list (checked), the AI (◇, to check) or the editor.
// A place is found in the place list by name, checked on Google Maps in a
// new tab, or marked as checked by hand.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, MapPin, Plus, Search, X } from "lucide-react";
import { findMapPlaces } from "@/lib/geo.functions";
import { atlasMapChoices, atlasPlacesOfFn } from "@/lib/atlas.functions";
import { ATLAS_CATS } from "@/lib/atlas";
import { useQuery } from "@tanstack/react-query";
import {
  EMPTY_MAP,
  googleMapsUrl,
  MAX_MAP_LAYERS,
  MAX_PLACES,
  PLACE_KIND_NAMES,
  type MapPlace,
  type MapSpec,
} from "@/lib/map-spec";
import type { Bi } from "@/lib/current-affairs";
import { BiField } from "@/components/notes-books";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMPTY: Bi = { en: "", hi: "" };
type Found = Awaited<ReturnType<typeof findMapPlaces>>[number];

export function MapEdit({
  map: m,
  onChange,
}: {
  map: MapSpec | null;
  onChange: (m: MapSpec | null) => void;
}) {
  const [finding, setFinding] = useState<number | "new" | null>(null);
  if (!m)
    return (
      <Button size="sm" variant="outline" onClick={() => onChange(EMPTY_MAP)}>
        <Plus className="mr-1 h-4 w-4" /> Add a map
      </Button>
    );
  const setPlace = (i: number, patch: Partial<MapPlace>) =>
    onChange({ ...m, places: m.places.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const raj = m.region === "rajasthan";
  const layers: [keyof MapSpec, string][] = [
    ["rivers", "Rivers"],
    ...(raj
      ? ([
          ["canals", "Canals"],
          ["districts", "Districts (41)"],
          ["constituencies", "Assembly constituencies (200)"],
          ["protected", "National parks and sanctuaries"],
        ] as [keyof MapSpec, string][])
      : []),
  ];
  return (
    <div className="space-y-3">
      <BiField label="Map title" value={m.title} onChange={(title) => onChange({ ...m, title })} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <select
          aria-label="Map region"
          value={m.region}
          onChange={(e) => onChange({ ...m, region: e.target.value as "rajasthan" | "india" })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="rajasthan">Rajasthan</option>
          <option value="india">India</option>
        </select>
        {layers.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!m[key]}
              onChange={(e) => onChange({ ...m, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange(null)}>
          Remove the map
        </Button>
      </div>
      {raj && <AtlasExtras map={m} onChange={onChange} />}
      <ol className="space-y-2" aria-label="Places">
        {m.places.map((p, i) => (
          <li
            key={i}
            className={`space-y-1.5 rounded-xl border p-2 ${p.src === "ai" ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : "border-border"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <Input
                aria-label={`Place ${i + 1} (Hindi)`}
                lang="hi"
                className="h-8 min-w-0 flex-1 basis-32"
                value={p.name.hi}
                onChange={(e) => setPlace(i, { name: { ...p.name, hi: e.target.value } })}
              />
              <Input
                aria-label={`Place ${i + 1} (English)`}
                className="h-8 min-w-0 flex-1 basis-32"
                value={p.name.en}
                onChange={(e) => setPlace(i, { name: { ...p.name, en: e.target.value } })}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`Remove place ${i + 1}`}
                onClick={() => onChange({ ...m, places: m.places.filter((_, k) => k !== i) })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-8 text-xs">
              {p.src === "list" ? (
                <Badge tone="good">
                  <Check className="h-3 w-3" /> From the place list
                  {p.kind && PLACE_KIND_NAMES[p.kind] ? ` · ${PLACE_KIND_NAMES[p.kind]}` : ""}
                </Badge>
              ) : p.src === "you" ? (
                <Badge tone="primary">Checked by you</Badge>
              ) : p.src === "ai" ? (
                <Badge tone="bad">◇ Position not checked</Badge>
              ) : null}
              <Input
                aria-label={`Place ${i + 1} latitude`}
                type="number"
                step="0.01"
                className="h-7 w-24 text-xs"
                value={p.lat}
                onChange={(e) => setPlace(i, { lat: Number(e.target.value), src: "you" })}
              />
              <Input
                aria-label={`Place ${i + 1} longitude`}
                type="number"
                step="0.01"
                className="h-7 w-24 text-xs"
                value={p.lon}
                onChange={(e) => setPlace(i, { lon: Number(e.target.value), src: "you" })}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setFinding(finding === i ? null : i)}
              >
                <Search className="mr-1 h-3.5 w-3.5" /> Find in the place list
              </Button>
              <a
                href={googleMapsUrl(p.lat, p.lon)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Check on Google Maps
              </a>
              {p.src === "ai" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setPlace(i, { src: "you" })}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Position is right
                </Button>
              )}
            </div>
            {finding === i && (
              <PlaceFinder
                initial={p.name.en || p.name.hi}
                near={p}
                onPick={(f) => {
                  setPlace(i, {
                    name: { en: p.name.en || f.en, hi: p.name.hi || f.hi },
                    lat: f.lat,
                    lon: f.lon,
                    kind: f.kind,
                    src: "list",
                  });
                  setFinding(null);
                }}
                onClose={() => setFinding(null)}
              />
            )}
          </li>
        ))}
      </ol>
      {finding === "new" && (
        <PlaceFinder
          initial=""
          onPick={(f) => {
            onChange({
              ...m,
              places: [
                ...m.places,
                {
                  name: { en: f.en, hi: f.hi },
                  lat: f.lat,
                  lon: f.lon,
                  kind: f.kind,
                  src: "list",
                },
              ],
            });
            setFinding(null);
          }}
          onClose={() => setFinding(null)}
        />
      )}
      {m.places.length < MAX_PLACES && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setFinding("new")}>
            <MapPin className="mr-1 h-4 w-4" /> Add a place from the list
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({
                ...m,
                places: [
                  ...m.places,
                  {
                    name: EMPTY,
                    lat: m.region === "india" ? 22.5 : 26.9,
                    lon: m.region === "india" ? 79 : 75.8,
                    src: "you",
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add a place by hand
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The place list has Survey of India place names (with their Hindi), dams, national parks and
        sanctuaries, and district and tehsil headquarters. Places the AI put on the map are matched
        to it; those it couldn't find carry ◇ until you check them.
      </p>
    </div>
  );
}

function PlaceFinder({
  initial,
  near,
  onPick,
  onClose,
}: {
  initial: string;
  near?: { lat: number; lon: number };
  onPick: (f: Found) => void;
  onClose: () => void;
}) {
  const findFn = useServerFn(findMapPlaces);
  const [query, setQuery] = useState(initial);
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setFound(await findFn({ data: { query, ...(near ? { near } : {}) } }));
    } catch (e) {
      toast.error(errorText(e, "Couldn't search"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-muted/30 p-2"
      data-testid="place-finder"
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          aria-label="Place name"
          autoFocus
          className="h-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A town, dam, lake, sanctuary, fort… (Hindi or English)"
        />
        <Button type="submit" size="sm" className="h-8" disabled={busy || query.trim().length < 2}>
          <Search className="mr-1 h-3.5 w-3.5" /> {busy ? "Finding…" : "Find"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClose}>
          Close
        </Button>
      </form>
      {found &&
        (found.length ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {found.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="flex w-full flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 text-left hover:bg-muted"
                >
                  <span className="font-medium">{f.en}</span>
                  {f.hi && <span lang="hi">{f.hi}</span>}
                  <span className="text-xs text-muted-foreground">
                    {PLACE_KIND_NAMES[f.kind] ?? f.kind}
                    {f.admin
                      ? ` · ${f.admin.district.en} district${f.admin.constituency ? ` · AC ${f.admin.constituency.n} ${f.admin.constituency.en}${f.admin.constituency.res ? ` (${f.admin.constituency.res})` : ""}` : ""}`
                      : ""}{" "}
                    · {f.lat.toFixed(2)}, {f.lon.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not in the place list. Add it by hand and check it on Google Maps.
          </p>
        ))}
    </div>
  );
}

// The atlas's thematic layers under the places, and every place of a kind
// from the atlas added at once ("all the passes of the Aravalli").
function AtlasExtras({ map: m, onChange }: { map: MapSpec; onChange: (m: MapSpec) => void }) {
  const choicesFn = useServerFn(atlasMapChoices);
  const placesFn = useServerFn(atlasPlacesOfFn);
  const q = useQuery({ queryKey: ["atlasMapChoices"], queryFn: () => choicesFn() });
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const on = m.layers ?? [];
  if (!q.data?.length) return null;
  const toggle = (key: string) =>
    onChange({
      ...m,
      layers: on.includes(key) ? on.filter((k) => k !== key) : [...on, key].slice(-MAX_MAP_LAYERS),
    });
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-2 text-sm">
      <p className="text-xs font-medium text-muted-foreground">
        From the Rajasthan atlas (up to {MAX_MAP_LAYERS} layers)
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atlas layers">
        {q.data.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={on.includes(l.key)}
            onClick={() => toggle(l.key)}
            className={`rounded-full border px-2 py-0.5 text-xs ${on.includes(l.key) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {l.name.en}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Atlas category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Add every place of a kind…</option>
          {ATLAS_CATS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.icon} {c.name.en}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!cat || busy || m.places.length >= MAX_PLACES}
          onClick={async () => {
            setBusy(true);
            try {
              const found = await placesFn({ data: { cat } });
              const have = new Set(m.places.map((p) => p.name.en.toLowerCase()));
              const add = found
                .filter((p) => !have.has(p.name.en.toLowerCase()))
                .slice(0, MAX_PLACES - m.places.length)
                .map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, src: "list" as const }));
              onChange({ ...m, places: [...m.places, ...add] });
              toast.success(
                found.length > add.length
                  ? `${add.length} of ${found.length} added (a map holds ${MAX_PLACES})`
                  : `${add.length} added`,
              );
            } catch (e) {
              toast.error(errorText(e, "Couldn't add them"));
            } finally {
              setBusy(false);
            }
          }}
        >
          Add from the atlas
        </Button>
      </div>
    </div>
  );
}
