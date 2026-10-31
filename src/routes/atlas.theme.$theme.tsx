import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { atlasBaseFn, atlasPlaceFn, atlasPlacesFn, type PublicPlace } from "@/lib/atlas.functions";
import {
  ATLAS_THEMES,
  MONTHS,
  atlasCat,
  atlasTheme,
  eraLabel,
  monthsLabel,
  pickBi,
  type AtlasLang,
} from "@/lib/atlas";
import { AtlasMap } from "@/components/atlas-map";
import { FactsList, LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/theme/$theme")({
  ssr: false,
  head: ({ params }) => {
    const t = atlasTheme(params.theme);
    return {
      meta: [
        { title: `${t ? t.name.en : "Theme"} of Rajasthan — Rajasthan Atlas · FlashGyan` },
        {
          name: "description",
          content: t
            ? `${t.blurb.en} On the map of Rajasthan, with the facts for RPSC and RSSB exams.`
            : "Rajasthan Atlas themes.",
        },
      ],
    };
  },
  component: ThemePage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
const name = (p: PublicPlace, lang: AtlasLang) => (lang === "hi" ? p[2] || p[1] : p[1]);

// A fresh page (map view, open item) for each theme.
function ThemePage() {
  const { theme } = Route.useParams();
  return <ThemeView key={theme} theme={theme} />;
}

function ThemeView({ theme }: { theme: string }) {
  const t = atlasTheme(theme);
  const [lang, setLang] = useAtlasLang();
  const baseFn = useServerFn(atlasBaseFn);
  const placesFn = useServerFn(atlasPlacesFn);
  const base = useQuery({ queryKey: ["atlasBase"], queryFn: () => baseFn(), staleTime: Infinity });
  const places = useQuery({
    queryKey: ["atlasPlaces"],
    queryFn: () => placesFn(),
    staleTime: Infinity,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; zoom?: number } | null>(null);
  const mine = useMemo(
    () => (t ? (places.data ?? []).filter((p) => t.cats.includes(p[3])) : []),
    [places.data, t],
  );
  // The list's groups: by time (those without a year last), month or district.
  const groups = useMemo(() => {
    if (!t) return [];
    const byName = (a: PublicPlace, b: PublicPlace) => a[1].localeCompare(b[1]);
    if (t.order === "time") {
      const dated = mine
        .filter((p) => p[8] != null || p[9] != null)
        .sort((a, b) => (a[8] ?? a[9]!) - (b[8] ?? b[9]!) || byName(a, b));
      const rest = mine.filter((p) => p[8] == null && p[9] == null).sort(byName);
      return [
        ...(dated.length ? [{ key: "dated", title: null, items: dated }] : []),
        ...(rest.length
          ? [
              {
                key: "rest",
                title: L(lang, "समय अभी नोट्स में नहीं", "Year not in the notes yet"),
                items: rest,
              },
            ]
          : []),
      ];
    }
    if (t.order === "month") {
      const out = MONTHS.map((m, i) => ({
        key: `m${i + 1}`,
        title: pickBi(m, lang),
        items: mine.filter((p) => p[10]?.includes(i + 1)).sort(byName),
      })).filter((g) => g.items.length);
      const rest = mine.filter((p) => !p[10]?.length).sort(byName);
      return rest.length
        ? [
            ...out,
            {
              key: "rest",
              title: L(lang, "माह अभी नोट्स में नहीं", "Month not in the notes yet"),
              items: rest,
            },
          ]
        : out;
    }
    const districts = [...new Set(mine.map((p) => p[6] || "—"))].sort();
    return districts.map((d) => ({
      key: d,
      title: d,
      items: mine.filter((p) => (p[6] || "—") === d).sort(byName),
    }));
  }, [mine, t, lang]);

  if (!t)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6">
        <p>{L(lang, "यह विषय नहीं मिला।", "There's no such theme.")}</p>
        <Link to="/atlas" className="text-primary underline">
          {L(lang, "एटलस पर लौटें", "Back to the atlas")}
        </Link>
      </div>
    );
  const pick = (p: PublicPlace) => {
    setOpen(open === p[0] ? null : p[0]);
    setFocus({ lon: p[5], lat: p[4], zoom: 4 });
  };
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
      {base.isLoading || places.isLoading ? (
        <p className="p-6 text-muted-foreground">
          {L(lang, "मानचित्र खुल रहा है…", "Opening the map…")}
        </p>
      ) : (
        <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[1fr_420px]">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {pickBi(t.blurb, lang)} · {mine.length} {L(lang, "स्थान", "places")}
            </p>
            <AtlasMap
              base={base.data!}
              places={mine}
              lang={lang}
              colour={null}
              overlays={[]}
              selected={open}
              focus={focus}
              onPlace={(k) => {
                const p = mine.find((x) => x[0] === k);
                if (p) pick(p);
              }}
              className="h-[48vh] lg:sticky lg:top-16 lg:h-[calc(100dvh-140px)]"
            />
          </div>
          <div className="space-y-4" data-theme-list>
            {!mine.length && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                {L(
                  lang,
                  "इस विषय के स्थान जल्द आ रहे हैं।",
                  "The places of this theme are coming soon.",
                )}
              </p>
            )}
            {groups.map((g) => (
              <section key={g.key}>
                {g.title && (
                  <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.title} <span className="opacity-60">{g.items.length}</span>
                  </h2>
                )}
                <ol
                  className={
                    t.order === "time" && g.key === "dated"
                      ? "border-l-2 border-amber-300 pl-3"
                      : ""
                  }
                >
                  {g.items.map((p) => (
                    <ThemeItem
                      key={p[0]}
                      p={p}
                      lang={lang}
                      open={open === p[0]}
                      onClick={() => pick(p)}
                    />
                  ))}
                </ol>
              </section>
            ))}
            <nav className="border-t border-border pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {L(lang, "और विषय", "More themes")}
              </p>
              <div className="flex flex-wrap gap-1">
                {ATLAS_THEMES.filter((x) => x.key !== t.key).map((x) => (
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
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeItem({
  p,
  lang,
  open,
  onClick,
}: {
  p: PublicPlace;
  lang: AtlasLang;
  open: boolean;
  onClick: () => void;
}) {
  const fn = useServerFn(atlasPlaceFn);
  const q = useQuery({
    queryKey: ["atlasPlace", p[0]],
    queryFn: () => fn({ data: { key: p[0] } }),
    enabled: open,
  });
  const c = atlasCat(p[3]);
  const when = [eraLabel(p[8], p[9], lang), monthsLabel(p[10], lang)].filter(Boolean).join(" · ");
  return (
    <li className="border-b border-border/60" data-theme-item={p[0]}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40"
      >
        <span>{c.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{name(p, lang)}</span>
          <span className="block text-xs text-muted-foreground">
            {[when, p[6], pickBi(c.name, lang)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 pb-3 pl-6">
          {q.isLoading ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : q.data ? (
            <>
              {pickBi(q.data.place.note, lang) && (
                <p className="text-sm">{pickBi(q.data.place.note, lang)}</p>
              )}
              <FactsList facts={[...q.data.facts, ...q.data.mentions]} lang={lang} limit={8} />
              {p[6] && (
                <Link
                  to="/atlas/$district"
                  params={{ district: p[6] }}
                  className="text-xs text-primary underline"
                >
                  {L(lang, `${p[6]} जिला देखें`, `See ${p[6]} district`)}
                </Link>
              )}
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}
