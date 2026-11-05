// The theme pages made from the notes: folk deities and their fairs, the
// forts' sakas and jauhars, the fair and festival calendar, and the painting
// schools on a map. The map beside each list shows the places it names.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { atlasNotesThemeFn, type PublicPlace } from "@/lib/atlas.functions";
import { ATLAS_THEMES, pickBi, type AtlasLang } from "@/lib/atlas";
import {
  HINDU_MONTHS,
  NOTES_THEMES,
  SCHOOL_COLOURS,
  bi,
  hinduMonthNow,
  notesThemeOf,
  type NotesThemeKey,
} from "@/lib/atlas-notes-themes";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasPlaces } from "@/components/atlas-data";
import { withOffline } from "@/lib/atlas-device";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
type Data = Awaited<ReturnType<typeof atlasNotesThemeFn>>;
type Of<K extends Data["key"]> = Extract<Data, { key: K }>;

export function NotesThemeView({ theme }: { theme: NotesThemeKey }) {
  const t = notesThemeOf(theme)!;
  const [lang, setLang] = useAtlasLang();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const fn = useServerFn(atlasNotesThemeFn);
  const q = useQuery({
    queryKey: ["atlasNotesTheme", theme],
    queryFn: () => withOffline(`notes-theme:${theme}`, () => fn({ data: { key: theme } })),
    staleTime: 10 * 60_000,
  });
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom?: number } | null>(null);
  const byKey = useMemo(
    () => new Map((places.data ?? []).map((p) => [p[0], p] as const)),
    [places.data],
  );
  // The map's dots and district colours, from what the list shows.
  const [shown, setShown] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, string> | undefined>(undefined);
  const dots = shown.map((k) => byKey.get(k)).filter((p): p is PublicPlace => !!p);
  const show = (k: string) => {
    const p = byKey.get(k);
    if (!p) return;
    setSel(k);
    setFocus({ lon: p[5], lat: p[4], zoom: 4 });
  };
  const ctx = { lang, byKey, show, setShown, setMarks };
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/atlas"
          aria-label={L(lang, "एटलस", "Atlas")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          {pickBi(t.name, lang)}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[1fr_460px]">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{pickBi(t.blurb, lang)}</p>
          {base.data && (
            <AtlasMap
              base={base.data}
              places={dots}
              lang={lang}
              colour={null}
              overlays={[]}
              selected={sel}
              focus={focus}
              marks={marks}
              onPlace={show}
              cluster
              className="h-[42vh] lg:sticky lg:top-16 lg:h-[calc(100dvh-140px)]"
            />
          )}
          {sel && byKey.get(sel) && (
            <p className="text-sm" data-theme-selected>
              📍 <span className="font-medium">{name(byKey.get(sel)!, lang)}</span>
              {byKey.get(sel)![6] && ` · ${byKey.get(sel)![6]}`} ·{" "}
              <Link to="/atlas/place/$key" params={{ key: sel }} className="text-primary underline">
                {L(lang, "स्थान देखें", "Open the place")}
              </Link>
            </p>
          )}
        </div>
        <div className="space-y-4" data-notes-theme={theme}>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : !q.data ? (
            <p className="text-sm text-muted-foreground">
              {L(lang, "अभी नहीं खुल सका।", "Couldn't open it just now.")}
            </p>
          ) : q.data.key === "folk-deities" ? (
            <Deities d={q.data} {...ctx} />
          ) : q.data.key === "sakas" ? (
            <Sakas d={q.data} {...ctx} />
          ) : q.data.key === "fair-calendar" ? (
            <Calendar d={q.data} {...ctx} />
          ) : (
            <Painting d={q.data} {...ctx} />
          )}
          <MoreThemes lang={lang} current={theme} />
        </div>
      </div>
    </div>
  );
}

const name = (p: PublicPlace, lang: AtlasLang) => (lang === "hi" ? p[2] || p[1] : p[1]);

type Ctx = {
  lang: AtlasLang;
  byKey: Map<string, PublicPlace>;
  show: (k: string) => void;
  setShown: (k: string[]) => void;
  setMarks: (m: Record<string, string> | undefined) => void;
};

// Keeps the map's dots in step with what a list shows.
function useMapDots(keys: string[], setShown: Ctx["setShown"]) {
  const sig = keys.join("|");
  useEffect(() => setShown(sig ? sig.split("|") : []), [sig, setShown]);
}

// A place name that shows the place on the map when it is on it.
function PlaceName({ text, k, ctx }: { text: string; k?: string; ctx: Ctx }) {
  if (!k || !ctx.byKey.has(k)) return <>{text}</>;
  return (
    <button
      type="button"
      onClick={() => ctx.show(k)}
      className="text-left font-medium text-primary underline decoration-dotted underline-offset-2"
      data-theme-place={k}
    >
      {text}
    </button>
  );
}

// ---------- Folk deities ----------

function Deities({ d, ...ctx }: { d: Of<"folk-deities"> } & Ctx) {
  const { lang } = ctx;
  const [kind, setKind] = useState<"deity" | "goddess">("deity");
  const list = d.deities.filter((x) => x.kind === kind);
  useMapDots(
    list.flatMap((x) => x.places),
    ctx.setShown,
  );
  return (
    <>
      <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="tablist">
        {(["deity", "goddess"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
              kind === k ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            {k === "deity"
              ? L(lang, "लोक देवता", "Folk deities")
              : L(lang, "लोक देवियाँ", "Folk goddesses")}
            <span className="ml-1 text-xs opacity-60">
              {d.deities.filter((x) => x.kind === k).length}
            </span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.map((c) => (
          <article
            key={c.heading}
            className="rounded-xl border border-border bg-card p-3 shadow-sm"
            data-deity={c.name.en}
          >
            <header className="mb-1 flex items-baseline gap-2">
              <h2 className="font-serif text-lg font-bold text-[#1f2a5c] dark:text-indigo-200">
                {bi(c.name, lang)}
              </h2>
              {c.dates && <span className="text-xs text-muted-foreground">{c.dates}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                {c.facts} {L(lang, "तथ्य", "facts")}
              </span>
            </header>
            {c.intro && <p className="text-sm">{bi(c.intro, lang)}</p>}
            {c.fairs.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-500/10">
                {c.fairs.map((f, i) => (
                  <li key={i}>🎪 {bi(f, lang)}</li>
                ))}
              </ul>
            )}
            {c.sites.length > 0 && (
              <dl className="mt-2 grid gap-1 text-sm">
                {c.sites.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <dt className="w-40 shrink-0">
                      <PlaceName text={bi(s.place, lang)} k={s.places[0]} ctx={ctx} />
                    </dt>
                    <dd className="min-w-0 text-muted-foreground">{bi(s.about, lang)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!c.sites.length && c.places[0] && ctx.byKey.has(c.places[0]) && (
              <p className="mt-2 text-sm">
                📍{" "}
                <PlaceName
                  text={name(ctx.byKey.get(c.places[0])!, lang)}
                  k={c.places[0]}
                  ctx={ctx}
                />
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

// ---------- Sakas and jauhars ----------

function Sakas({ d, ...ctx }: { d: Of<"sakas"> } & Ctx) {
  const { lang } = ctx;
  useMapDots(
    d.forts.map((f) => f.place).filter((k): k is string => !!k),
    ctx.setShown,
  );
  return (
    <>
      {d.tips.map((t, i) => (
        <p
          key={i}
          className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-2.5 py-1.5 text-sm dark:bg-amber-500/10"
        >
          🧠 {bi(t, lang)}
        </p>
      ))}
      {d.forts.map((f) => (
        <article
          key={f.fort.en}
          className="rounded-xl border border-border bg-card p-3 shadow-sm"
          data-saka-fort={f.fort.en}
        >
          <header className="mb-2 flex items-baseline gap-2">
            <h2 className="font-serif text-lg font-bold text-[#1f2a5c] dark:text-indigo-200">
              🏰 <PlaceName text={bi(f.fort, lang)} k={f.place ?? undefined} ctx={ctx} />
            </h2>
            <span className="ml-auto rounded-full bg-muted px-2 text-xs font-medium">
              {f.sakas.length} {L(lang, "साके", f.sakas.length === 1 ? "saka" : "sakas")}
            </span>
          </header>
          <ol className="space-y-2 border-l-2 border-red-300 pl-3">
            {f.sakas.map((s, i) => (
              <li key={i} className="text-sm" data-saka>
                <p>
                  <span className="font-semibold">{s.year || "—"}</span>
                  {bi(s.label, lang) && (
                    <span className="ml-1.5 rounded bg-red-100 px-1 text-[11px] font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-200">
                      {bi(s.label, lang)}
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-muted-foreground">
                    {L(lang, "आक्रमणकारी: ", "Attacker: ")}
                  </span>
                  {bi(s.attacker, lang)}
                </p>
                {bi(s.who, lang) && <p className="text-muted-foreground">{bi(s.who, lang)}</p>}
              </li>
            ))}
          </ol>
          {f.tips.map((t, i) => (
            <p key={i} className="mt-2 text-xs text-muted-foreground">
              🧠 {bi(t, lang)}
            </p>
          ))}
        </article>
      ))}
    </>
  );
}

// ---------- Fair and festival calendar ----------

function Calendar({ d, ...ctx }: { d: Of<"fair-calendar"> } & Ctx) {
  const { lang } = ctx;
  const now = hinduMonthNow();
  const [m, setM] = useState(now);
  const month = d.months[m];
  useMapDots(
    month.fairs.flatMap((f) => f.places),
    ctx.setShown,
  );
  return (
    <>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6" role="tablist" data-months>
        {HINDU_MONTHS.map((x, i) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={m === i}
            onClick={() => setM(i)}
            className={`rounded-lg border px-1.5 py-1 text-xs leading-tight ${
              m === i ? "border-[#1f2a5c] bg-[#1f2a5c] text-white" : "border-border hover:bg-muted"
            }`}
          >
            <span className="block font-semibold">{bi(x.name, lang)}</span>
            <span className="block opacity-70">
              {i === now ? L(lang, "अभी", "now") : bi(x.around, lang)}
            </span>
          </button>
        ))}
      </div>
      <section>
        <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          🎪 {L(lang, "मेले", "Fairs")} · {month.fairs.length}
        </h2>
        {month.fairs.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {month.fairs.map((f, i) => (
              <li key={i} className="px-3 py-2" data-calendar-fair>
                <p className="font-medium">{bi(f.name, lang)}</p>
                <p className="text-xs text-muted-foreground">
                  {f.place && (
                    <>
                      📍 <PlaceName text={bi(f.place, lang)} k={f.places[0]} ctx={ctx} />
                      {" · "}
                    </>
                  )}
                  {bi(f.when, lang)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {L(lang, "इस माह के मेले नोट्स में नहीं।", "No fairs in the notes for this month.")}
          </p>
        )}
      </section>
      {month.festivals.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            🪔 {L(lang, "त्योहार", "Festivals")} · {month.festivals.length}
          </h2>
          <ul className="space-y-1 text-sm">
            {month.festivals.map((f, i) => (
              <li key={i} className="flex gap-2" data-calendar-festival>
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {bi(f.when, lang)}
                </span>
                <span className="min-w-0">{bi(f.name, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------- Painting schools ----------

function Painting({ d, ...ctx }: { d: Of<"painting"> } & Ctx) {
  const { lang } = ctx;
  const colours = useMemo(() => {
    const m: Record<string, string> = {};
    d.schools.forEach((s, i) => {
      for (const st of s.styles)
        for (const dn of st.districts ?? []) m[dn] ??= SCHOOL_COLOURS[i % SCHOOL_COLOURS.length];
    });
    return m;
  }, [d]);
  const { setMarks } = ctx;
  useEffect(() => {
    setMarks(colours);
    return () => setMarks(undefined);
  }, [colours, setMarks]);
  useMapDots(
    d.schools.flatMap((s) => s.styles.map((st) => st.place).filter((k): k is string => !!k)),
    ctx.setShown,
  );
  return (
    <>
      {d.schools.map((s, i) => (
        <section
          key={s.name.en}
          className="rounded-xl border border-border bg-card p-3 shadow-sm"
          data-school={s.name.en}
        >
          <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-bold text-[#1f2a5c] dark:text-indigo-200">
            <i
              className="inline-block h-3.5 w-3.5 rounded-sm border border-black/10"
              style={{ background: SCHOOL_COLOURS[i % SCHOOL_COLOURS.length] }}
            />
            {bi(s.name, lang)}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {s.styles.length} {L(lang, "शैलियाँ", "styles")}
            </span>
          </h2>
          <div className="space-y-2">
            {s.styles.map((st) => (
              <div key={st.name.en} className="rounded-lg bg-muted/40 p-2" data-style={st.name.en}>
                <p className="text-sm font-semibold">
                  🎨 <PlaceName text={bi(st.name, lang)} k={st.place ?? undefined} ctx={ctx} />
                  {!!st.districts?.length && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      · {st.districts.join(", ")}
                    </span>
                  )}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {st.points.map((x, j) => (
                    <li key={j}>{bi(x, lang)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// The other theme pages.
function MoreThemes({ lang, current }: { lang: AtlasLang; current: string }) {
  return (
    <nav className="border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {L(lang, "और विषय", "More themes")}
      </p>
      <div className="flex flex-wrap gap-1">
        {[...NOTES_THEMES, ...ATLAS_THEMES]
          .filter((x) => x.key !== current)
          .map((x) => (
            <Link
              key={x.key}
              to="/atlas/theme/$theme"
              params={{ theme: x.key }}
              className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
            >
              {pickBi(x.name, lang)}
            </Link>
          ))}
      </div>
    </nav>
  );
}
