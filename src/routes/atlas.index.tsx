import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Gamepad2, Layers, MapPin, Search, X } from "lucide-react";
import {
  atlasBaseFn,
  atlasEntityFactsFn,
  atlasPlaceFn,
  atlasPlacesFn,
} from "@/lib/atlas.functions";
import {
  AGRO_ZONES,
  ATLAS_CATS,
  ATLAS_GROUPS,
  DIVISIONS,
  LAYER_GROUPS,
  atlasCat,
  layerLegend,
  pickBi,
  ATLAS_THEMES,
  ERAS,
  MONTHS,
  eraLabel,
  inEra,
  monthsLabel,
  type AtlasLang,
} from "@/lib/atlas";
import { AtlasMap } from "@/components/atlas-map";
import { FactsList, LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rajasthan Atlas — FlashGyan" },
      {
        name: "description",
        content:
          "Rajasthan's districts, physical divisions, climate, soils and every place in the notes (forts, mines, passes, dams, sanctuaries) on one map, with the facts for exams.",
      },
    ],
  }),
  component: AtlasPage,
});

const DEFAULT_CATS = ["fort", "tiger", "sanct", "lake", "dam", "peak"];
const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

function AtlasPage() {
  const [lang, setLang] = useAtlasLang();
  const baseFn = useServerFn(atlasBaseFn);
  const placesFn = useServerFn(atlasPlacesFn);
  const base = useQuery({ queryKey: ["atlasBase"], queryFn: () => baseFn(), staleTime: Infinity });
  const places = useQuery({
    queryKey: ["atlasPlaces"],
    queryFn: () => placesFn(),
    staleTime: Infinity,
  });
  const [colour, setColour] = useState<string | null>("divisions");
  const [overlays, setOverlays] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>(DEFAULT_CATS);
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState<{ kind: "place" | "district"; key: string } | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom?: number } | null>(null);
  const [q, setQ] = useState("");
  // In time: the places of a span of years, or a month's fairs (across all
  // kinds, instead of the kinds chosen).
  const [time, setTime] = useState<{ from: number; to: number } | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const all = places.data ?? [];
  const timed = useMemo(() => all.filter((p) => p[8] != null || p[9] != null), [all]);
  const monthly = useMemo(() => all.filter((p) => p[10]?.length), [all]);
  const shown = useMemo(
    () =>
      all.filter(
        (p) =>
          (time
            ? inEra({ era_from: p[8], era_to: p[9] }, time.from, time.to)
            : month
              ? p[10]?.includes(month)
              : cats.includes(p[3])) ||
          (sel?.kind === "place" && sel.key === p[0]),
      ),
    [all, cats, sel, time, month],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) m.set(p[3], (m.get(p[3]) ?? 0) + 1);
    return m;
  }, [all]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const d = (base.data?.districts ?? [])
      .filter((x) => x.en.toLowerCase().includes(t) || x.hi.includes(q.trim()))
      .map((x) => ({
        kind: "district" as const,
        key: x.en,
        name: lang === "hi" ? x.hi : x.en,
        sub: L(lang, "जिला", "District"),
      }));
    const p = all
      .filter((x) => x[1].toLowerCase().includes(t) || x[2].includes(q.trim()))
      .slice(0, 12)
      .map((x) => ({
        kind: "place" as const,
        key: x[0],
        name: lang === "hi" ? x[2] || x[1] : x[1],
        sub: `${pickBi(atlasCat(x[3]).name, lang)} · ${x[6]}`,
      }));
    return [...d, ...p].slice(0, 14);
  }, [q, all, base.data, lang]);

  const pick = (kind: "place" | "district", key: string) => {
    setSel({ kind, key });
    setQ("");
    if (kind === "place") {
      const p = all.find((x) => x[0] === key);
      if (p) {
        if (!cats.includes(p[3])) setCats((c) => [...c, p[3]]);
        setFocus({ lon: p[5], lat: p[4], zoom: 5 });
      }
    } else {
      const d = base.data?.districts.find((x) => x.en === key);
      if (d) setFocus({ lon: d.at[0], lat: d.at[1], zoom: 3 });
    }
  };

  const layers = base.data?.layers ?? [];
  const colourLayers = layers.filter((l) =>
    l.items.some((f) => f.kind === "area" || f.kind === "district"),
  );
  const lineLayers = layers.filter((l) => l.items.some((f) => f.kind === "line"));
  const active = layers.find((l) => l.key === colour);

  const Panel = (
    <div className="space-y-5">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {L(lang, "मानचित्र का रंग", "Colour the map by")}
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="colour" checked={!colour} onChange={() => setColour(null)} />
            {L(lang, "केवल जिले", "Districts only")}
          </label>
          {LAYER_GROUPS.map((g) => {
            const ls = colourLayers.filter((l) => l.grp === g.key);
            if (!ls.length) return null;
            return (
              <div key={g.key}>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {pickBi(g.name, lang)}
                </p>
                {ls.map((l) => (
                  <label key={l.key} className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="radio"
                      name="colour"
                      checked={colour === l.key}
                      onChange={() => setColour(l.key)}
                    />
                    {lang === "hi" ? l.name_hi || l.name_en : l.name_en}
                    {l.approx && (
                      <span className="text-[10px] text-muted-foreground">
                        {L(lang, "(सांकेतिक)", "(schematic)")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </section>
      {lineLayers.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {L(lang, "रेखाएँ", "Lines")}
          </p>
          {lineLayers.map((l) => (
            <label key={l.key} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                checked={overlays.includes(l.key)}
                onChange={(e) =>
                  setOverlays((o) =>
                    e.target.checked ? [...o, l.key] : o.filter((x) => x !== l.key),
                  )
                }
              />
              {lang === "hi" ? l.name_hi || l.name_en : l.name_en}
            </label>
          ))}
        </section>
      )}
      <ThemeLinks lang={lang} all={all} />
      {timed.length > 0 && (
        <TimeFilter
          lang={lang}
          value={time}
          count={
            time
              ? timed.filter((p) => inEra({ era_from: p[8], era_to: p[9] }, time.from, time.to))
                  .length
              : timed.length
          }
          onChange={(t) => {
            setTime(t);
            if (t) setMonth(null);
          }}
        />
      )}
      {monthly.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {L(lang, "माह के मेले-उत्सव", "Fairs by month")}
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={L(lang, "माह", "Month")}>
            {MONTHS.map((m, i) => {
              const n = monthly.filter((p) => p[10]!.includes(i + 1)).length;
              const on = month === i + 1;
              return (
                <button
                  key={m.en}
                  type="button"
                  aria-pressed={on}
                  disabled={!n}
                  onClick={() => {
                    setMonth(on ? null : i + 1);
                    setTime(null);
                  }}
                  className={`rounded-md border px-1.5 py-0.5 text-xs disabled:opacity-40 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                >
                  {pickBi(m, lang)}
                  {n ? <span className="opacity-70"> {n}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section className={time || month ? "opacity-50" : ""}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {L(lang, "स्थान", "Places")}
          </p>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setCats(cats.length ? [] : ATLAS_CATS.map((c) => c.key))}
          >
            {cats.length ? L(lang, "सब हटाएँ", "Clear") : L(lang, "सभी", "All")}
          </button>
        </div>
        <div className="space-y-2">
          {ATLAS_GROUPS.map((g) => {
            const cs = ATLAS_CATS.filter((c) => c.group === g.key && counts.get(c.key));
            if (!cs.length) return null;
            return (
              <div key={g.key}>
                <p className="text-[11px] font-semibold" style={{ color: g.color }}>
                  {pickBi(g.name, lang)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cs.map((c) => {
                    const on = cats.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setCats((x) => (on ? x.filter((k) => k !== c.key) : [...x, c.key]))
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs ${on ? "text-white" : "bg-background"}`}
                        style={
                          on
                            ? { background: c.color, borderColor: c.color }
                            : { borderColor: `${c.color}66` }
                        }
                      >
                        {c.icon} {pickBi(c.name, lang)}{" "}
                        <span className="opacity-70">{counts.get(c.key)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/"
          aria-label={L(lang, "मुख्य पृष्ठ", "Home")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "राजस्थान एटलस", "Rajasthan Atlas")}
        </h1>
        <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L(
              lang,
              "जिला, दुर्ग, खान, दर्रा, बाँध खोजें…",
              "Find a district, fort, mine, pass, dam…",
            )}
            aria-label={L(lang, "खोजें", "Search")}
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm"
          />
          {results.length > 0 && (
            <ul className="absolute inset-x-0 top-10 z-30 max-h-80 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-lg">
              {results.map((r) => (
                <li key={`${r.kind}:${r.key}`}>
                  <button
                    type="button"
                    onClick={() => pick(r.kind, r.key)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          to="/atlas/quiz"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          <Gamepad2 className="h-4 w-4" /> {L(lang, "क्विज़", "Quiz")}
        </Link>
        <LangToggle lang={lang} onChange={setLang} />
        <button
          type="button"
          onClick={() => setPanel(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm lg:hidden"
        >
          <Layers className="h-4 w-4" /> {L(lang, "परतें", "Layers")}
        </button>
      </header>
      {base.isLoading || places.isLoading ? (
        <p className="p-6 text-muted-foreground">
          {L(lang, "मानचित्र खुल रहा है…", "Opening the map…")}
        </p>
      ) : base.error ? (
        <p className="p-6 text-destructive">
          {L(lang, "मानचित्र नहीं खुल सका।", "The map couldn't open.")}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_380px]">
          <aside className="hidden overflow-y-auto border-r border-border p-4 lg:block lg:max-h-[calc(100dvh-53px)]">
            {Panel}
          </aside>
          <main className="relative flex min-h-0 flex-col gap-2 p-2 sm:p-3">
            <AtlasMap
              base={base.data!}
              places={shown}
              lang={lang}
              colour={colour}
              overlays={overlays}
              selected={sel?.kind === "place" ? sel.key : null}
              focus={focus}
              onPlace={(k) => setSel({ kind: "place", key: k })}
              onDistrict={(d) => setSel({ kind: "district", key: d })}
              className="h-[62dvh] lg:h-[calc(100dvh-120px)]"
            />
            {active && (
              <div
                className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-border bg-background p-2 text-xs"
                aria-label={L(lang, "संकेत", "Legend")}
              >
                {(active.key === "agro"
                  ? AGRO_ZONES.map((z) => ({ name: z.name, color: z.color, kind: "area" }))
                  : active.key === "divisions"
                    ? layerLegend(active).map((x) => ({
                        ...x,
                        name: {
                          en: x.name.en,
                          hi: `${DIVISIONS.find((d) => x.name.en.startsWith(d.key))?.name.hi ?? x.name.hi} संभाग`,
                        },
                      }))
                    : layerLegend(active)
                ).map((x, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ background: x.color }}
                    />
                    {pickBi(x.name, lang)}
                  </span>
                ))}
              </div>
            )}
          </main>
          <aside
            className="border-t border-border p-4 xl:max-h-[calc(100dvh-53px)] xl:overflow-y-auto xl:border-l xl:border-t-0"
            aria-live="polite"
          >
            {sel?.kind === "place" ? (
              <PlaceCard
                k={sel.key}
                lang={lang}
                all={all}
                onPlace={(k) => pick("place", k)}
                onClose={() => setSel(null)}
                onDistrict={(d) => pick("district", d)}
              />
            ) : sel?.kind === "district" ? (
              <DistrictCard
                name={sel.key}
                base={base.data!}
                lang={lang}
                places={all}
                onClose={() => setSel(null)}
                onPlace={(k) => pick("place", k)}
              />
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {L(
                    lang,
                    "किसी स्थान या जिले पर टैप करें — उससे जुड़े सभी परीक्षा-तथ्य यहाँ दिखेंगे।",
                    "Tap a place or a district: all its exam facts show here.",
                  )}
                </p>
                <DistrictLinks base={base.data!} lang={lang} />
              </div>
            )}
          </aside>
        </div>
      )}
      {panel && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-label={L(lang, "परतें", "Layers")}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setPanel(false)} />
          <div className="relative ml-auto h-full w-[85%] max-w-sm overflow-y-auto bg-background p-4">
            <button
              type="button"
              aria-label={L(lang, "बंद करें", "Close")}
              onClick={() => setPanel(false)}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            {Panel}
          </div>
        </div>
      )}
    </div>
  );
}

type BaseData = Awaited<ReturnType<typeof atlasBaseFn>>;

function DistrictLinks({ base, lang }: { base: BaseData; lang: AtlasLang }) {
  const published = base.districts.filter((d) => d.published);
  if (!published.length) return null;
  return (
    <div>
      <p className="mb-1.5 font-semibold text-foreground">
        {L(lang, "जिला दर्शन", "District overviews")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {published.map((d) => (
          <Link
            key={d.en}
            to="/atlas/$district"
            params={{ district: d.en }}
            className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted"
          >
            {lang === "hi" ? d.hi : d.en}
          </Link>
        ))}
      </div>
    </div>
  );
}
function PlaceCard({
  k,
  lang,
  all,
  onClose,
  onDistrict,
  onPlace,
}: {
  k: string;
  lang: AtlasLang;
  all: Awaited<ReturnType<typeof atlasPlacesFn>>;
  onClose: () => void;
  onDistrict: (d: string) => void;
  onPlace: (k: string) => void;
}) {
  const fn = useServerFn(atlasPlaceFn);
  const q = useQuery({ queryKey: ["atlasPlace", k], queryFn: () => fn({ data: { key: k } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (!q.data) return null;
  const { place, facts, mentions } = q.data;
  // Places within 25 km, by category (as on the notes' map).
  const near = all
    .filter((x) => x[0] !== place.key)
    .map((x) => ({
      x,
      km: Math.hypot(
        (x[4] - place.lat) * 111,
        (x[5] - place.lon) * 111 * Math.cos((place.lat * Math.PI) / 180),
      ),
    }))
    .filter((n) => n.km <= 25)
    .sort((a, b) => a.km - b.km);
  const c = atlasCat(place.cat);
  return (
    <div className="space-y-3" data-place-card>
      <div className="flex items-start gap-2">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl"
          style={{ background: `${c.color}22` }}
        >
          {c.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{pickBi(place.name, lang)}</h2>
          <p className="text-xs text-muted-foreground">{pickBi(c.name, lang)}</p>
          {(place.era_from != null || place.era_to != null || place.months?.length > 0) && (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300" data-place-time>
              {[eraLabel(place.era_from, place.era_to, lang), monthsLabel(place.months, lang)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={L(lang, "बंद करें", "Close")}
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/50 p-2">
          <dt className="text-[10px] uppercase text-muted-foreground">
            {L(lang, "जिला", "District")}
          </dt>
          <dd>
            {place.district ? (
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => onDistrict(place.district)}
              >
                {place.district}
              </button>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <dt className="text-[10px] uppercase text-muted-foreground">
            {L(lang, "तहसील (लगभग)", "Tehsil (approx.)")}
          </dt>
          <dd className="font-semibold">{place.tehsil || "—"}</dd>
        </div>
        <div className="col-span-2 rounded-lg bg-muted/50 p-2">
          <dt className="text-[10px] uppercase text-muted-foreground">
            {L(lang, "अक्षांश / देशांतर", "Lat / long")}
          </dt>
          <dd className="font-semibold">
            {place.lat.toFixed(2)}°N, {place.lon.toFixed(2)}°E
          </dd>
        </div>
      </dl>
      {pickBi(place.note, lang) && <p className="text-sm">{pickBi(place.note, lang)}</p>}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <BookOpen className="h-4 w-4" /> {L(lang, "नोट्स से तथ्य", "From the notes")} (
          {facts.length})
        </p>
        <FactsList facts={facts} lang={lang} limit={12} />
      </div>
      {mentions.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            {L(lang, "नोट्स में इसका उल्लेख", "Mentioned in the notes")} ({mentions.length})
          </p>
          <FactsList facts={mentions} lang={lang} limit={6} />
        </div>
      )}
      {near.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            {L(lang, "25 किमी के भीतर", "Within 25 km")} ({near.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {near.slice(0, 24).map(({ x }) => (
              <button
                key={x[0]}
                type="button"
                onClick={() => onPlace(x[0])}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
              >
                {atlasCat(x[3]).icon} {lang === "hi" ? x[2] || x[1] : x[1]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DistrictCard({
  name,
  base,
  lang,
  places,
  onClose,
  onPlace,
}: {
  name: string;
  base: BaseData;
  lang: AtlasLang;
  places: Awaited<ReturnType<typeof atlasPlacesFn>>;
  onClose: () => void;
  onPlace: (k: string) => void;
}) {
  const fn = useServerFn(atlasEntityFactsFn);
  const q = useQuery({
    queryKey: ["atlasEntity", `D:${name}`],
    queryFn: () => fn({ data: { entity: `D:${name}` } }),
  });
  const d = base.districts.find((x) => x.en === name);
  if (!d) return null;
  const mine = places.filter((p) => p[6] === name);
  const zone = AGRO_ZONES.find((z) => z.key === d.meta.zone);
  const division = DIVISIONS.find((x) => x.key === d.meta.division);
  return (
    <div className="space-y-3" data-district-card={name}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-2xl font-bold text-[#1f2a5c] dark:text-indigo-200">
            {lang === "hi" ? d.hi : d.en}
          </h2>
          <p className="text-xs text-muted-foreground">{L(lang, "जिला", "District")}</p>
        </div>
        <button
          type="button"
          aria-label={L(lang, "बंद करें", "Close")}
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {d.published && (
        <Link
          to="/atlas/$district"
          params={{ district: d.en }}
          className="block rounded-xl bg-[#1f2a5c] px-3 py-2 text-center text-sm font-semibold text-white"
        >
          {L(lang, "पूरा जिला दर्शन पढ़ें →", "Read the full district overview →")}
        </Link>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {division && (
          <div className="rounded-lg bg-muted/50 p-2">
            <dt className="text-[10px] uppercase text-muted-foreground">
              {L(lang, "संभाग", "Division")}
            </dt>
            <dd className="font-semibold">{pickBi(division.name, lang)}</dd>
          </div>
        )}
        {zone && (
          <div className="rounded-lg bg-muted/50 p-2">
            <dt className="text-[10px] uppercase text-muted-foreground">
              {L(lang, "कृषि जलवायु क्षेत्र", "Agro-climatic zone")}
            </dt>
            <dd className="font-semibold">{pickBi(zone.name, lang)}</dd>
          </div>
        )}
        {d.meta.tehsils && (
          <div className="rounded-lg bg-muted/50 p-2">
            <dt className="text-[10px] uppercase text-muted-foreground">
              {L(lang, "तहसीलें", "Tehsils")}
            </dt>
            <dd className="font-semibold">{d.meta.tehsils}</dd>
          </div>
        )}
        {!!d.meta.neighbours?.length && (
          <div className="col-span-2 rounded-lg bg-muted/50 p-2">
            <dt className="text-[10px] uppercase text-muted-foreground">
              {L(lang, "पड़ोसी जिले", "Neighbouring districts")}
            </dt>
            <dd className="font-semibold">
              {d.meta.neighbours
                .map((n) => (lang === "hi" ? base.districts.find((x) => x.en === n)?.hi || n : n))
                .join(", ")}
            </dd>
          </div>
        )}
      </dl>
      {mine.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            {L(lang, "जिले के स्थान", "Places in the district")} ({mine.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {mine.slice(0, 40).map((p) => (
              <button
                key={p[0]}
                type="button"
                onClick={() => onPlace(p[0])}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
              >
                {atlasCat(p[3]).icon} {lang === "hi" ? p[2] || p[1] : p[1]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <BookOpen className="h-4 w-4" /> {L(lang, "नोट्स से तथ्य", "From the notes")}
        </p>
        {q.data ? (
          <FactsList facts={q.data} lang={lang} limit={10} />
        ) : (
          <p className="text-sm text-muted-foreground">…</p>
        )}
      </div>
    </div>
  );
}

// The theme pages with places in them.
function ThemeLinks({ lang, all }: { lang: AtlasLang; all: { 3: string }[] }) {
  const themes = ATLAS_THEMES.map((t) => ({
    t,
    n: all.filter((p) => t.cats.includes(p[3])).length,
  })).filter((x) => x.n > 0);
  if (!themes.length) return null;
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {L(lang, "विषय अनुसार", "By theme")}
      </p>
      <div className="flex flex-wrap gap-1">
        {themes.map(({ t, n }) => (
          <Link
            key={t.key}
            to="/atlas/theme/$theme"
            params={{ theme: t.key }}
            className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
          >
            {pickBi(t.name, lang)} <span className="opacity-60">{n}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// A span of years: an era, or any years with the slider.
const MIN_YEAR = -3000;
const MAX_YEAR = 2030;
function TimeFilter({
  lang,
  value,
  count,
  onChange,
}: {
  lang: AtlasLang;
  value: { from: number; to: number } | null;
  count: number;
  onChange: (v: { from: number; to: number } | null) => void;
}) {
  const v = value ?? { from: 1200, to: 1707 };
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {L(lang, "समय के अनुसार", "In time")}
        </p>
        {value && (
          <button type="button" className="text-xs underline" onClick={() => onChange(null)}>
            {L(lang, "हटाएँ", "Clear")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {ERAS.map((e) => {
          const on = value?.from === e.from && value?.to === e.to;
          return (
            <button
              key={e.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : { from: e.from, to: e.to })}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {pickBi(e.name, lang)}
            </button>
          );
        })}
      </div>
      <div className="mt-2 space-y-1">
        <input
          type="range"
          aria-label={L(lang, "से वर्ष", "From year")}
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={10}
          value={v.from}
          onChange={(e) => onChange({ from: Math.min(Number(e.target.value), v.to), to: v.to })}
          className="w-full accent-primary"
        />
        <input
          type="range"
          aria-label={L(lang, "तक वर्ष", "To year")}
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={10}
          value={v.to}
          onChange={(e) => onChange({ from: v.from, to: Math.max(Number(e.target.value), v.from) })}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground" data-time-range>
          {value
            ? `${eraLabel(v.from, v.to, lang)} · ${count} ${L(lang, "स्थान", "places")}`
            : L(lang, `${count} स्थानों का समय ज्ञात है`, `${count} places have a time`)}
        </p>
      </div>
    </section>
  );
}
