import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Map as MapIcon } from "lucide-react";
import { atlasPlaceFn } from "@/lib/atlas.functions";
import {
  atlasCat,
  atlasShareMeta,
  eraLabel,
  monthsLabel,
  pickBi,
  placePath,
  type AtlasLang,
} from "@/lib/atlas";
import { SITE_URL } from "@/lib/app-promo";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasPlace, useAtlasPlaces } from "@/components/atlas-data";
import { SaveButton, ShareButton } from "@/components/atlas-actions";
import { NewsList } from "@/components/atlas-news";
import { AskedInExams } from "@/components/atlas-exams";
import { ReportButton } from "@/components/atlas-report";
import { FactsList, LangToggle, useAtlasLang } from "@/components/atlas-ui";

// A place's own page: what a shared link opens, with its link preview
// (the place's name, district and a fact, and its picture on the map).
export const Route = createFileRoute("/atlas/place/$key")({
  ssr: "data-only",
  loader: async ({ params }) => {
    try {
      return await atlasPlaceFn({ data: { key: params.key } });
    } catch {
      // Not in the atlas, or offline: the page reads it itself.
      return null;
    }
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.place;
    const url = `${SITE_URL}${placePath(params.key)}`;
    if (!p) return { meta: [{ title: "Rajasthan Atlas — FlashGyan" }] };
    const c = atlasCat(p.cat);
    const title = `${p.name.en}${p.name.hi && p.name.hi !== p.name.en ? ` (${p.name.hi})` : ""} — Rajasthan Atlas`;
    const fact = loaderData.facts[0]?.text.en ?? loaderData.mentions[0]?.text.en ?? "";
    const description = [`${c.name.en}${p.district ? `, ${p.district} district` : ""}.`, fact]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300);
    return {
      meta: [
        { title: `${title} · FlashGyan` },
        { name: "description", content: description },
        ...atlasShareMeta({
          title,
          description,
          url,
          image: `${SITE_URL}/api/atlas/preview?place=${encodeURIComponent(params.key)}`,
        }),
      ],
    };
  },
  component: PlacePage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

function PlacePage() {
  const { key } = Route.useParams();
  const first = Route.useLoaderData();
  const [lang, setLang] = useAtlasLang();
  const q = useAtlasPlace(key);
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const data = q.data ?? first;
  if (!data)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6">
        <p>
          {q.isLoading
            ? "…"
            : L(lang, "यह स्थान एटलस में नहीं मिला।", "This place isn't in the atlas.")}
        </p>
        <Link to="/atlas" className="text-primary underline">
          {L(lang, "एटलस खोलें", "Open the atlas")}
        </Link>
      </div>
    );
  const p = data.place;
  const c = atlasCat(p.cat);
  const row = places.data?.find((x) => x[0] === key);
  const when = [eraLabel(p.era_from, p.era_to, lang), monthsLabel(p.months, lang)]
    .filter(Boolean)
    .join(" · ");
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
        <p className="font-serif text-lg font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "राजस्थान एटलस", "Rajasthan Atlas")}
        </p>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-5xl gap-4 p-3 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-3">
          <div className="flex items-start gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl"
              style={{ background: `${c.color}22` }}
            >
              {c.icon}
            </span>
            <div>
              <h1 className="font-serif text-2xl font-bold leading-tight text-[#1f2a5c] dark:text-indigo-200">
                {pickBi(p.name, lang)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {pickBi(c.name, lang)}
                {p.district && (
                  <>
                    {" · "}
                    <Link
                      to="/atlas/$district"
                      params={{ district: p.district }}
                      className="underline"
                    >
                      {p.district}
                    </Link>
                  </>
                )}
              </p>
              {when && (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{when}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SaveButton
              lang={lang}
              place={{
                key: p.key,
                name: p.name.en,
                name_hi: p.name.hi,
                cat: p.cat,
                district: p.district,
              }}
            />
            <ShareButton
              lang={lang}
              path={placePath(p.key)}
              title={`${pickBi(p.name, lang)} · ${L(lang, "राजस्थान एटलस", "Rajasthan Atlas")}`}
            />
            <ReportButton
              lang={lang}
              kind="place"
              refKey={p.key}
              label={`${pickBi(p.name, lang)} · ${p.district} · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}
            />
            <Link
              to="/atlas"
              search={{ place: p.key }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted"
            >
              <MapIcon className="h-3.5 w-3.5" /> {L(lang, "पूरे एटलस में", "In the full atlas")}
            </Link>
          </div>
          {pickBi(p.note, lang) && <p className="text-sm">{pickBi(p.note, lang)}</p>}
          <NewsList items={data.news ?? []} lang={lang} />
          <AskedInExams lang={lang} place={p.key} />
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen className="h-4 w-4" /> {L(lang, "नोट्स से तथ्य", "From the notes")}
            </p>
            <FactsList facts={[...data.facts, ...data.mentions]} lang={lang} />
          </div>
        </section>
        {base.data && (
          <AtlasMap
            base={base.data}
            places={row ? [row] : []}
            lang={lang}
            colour={null}
            overlays={[]}
            selected={key}
            focus={{ lon: p.lon, lat: p.lat, zoom: 3 }}
            className="order-first h-[38vh] lg:sticky lg:top-16 lg:order-none lg:h-[70vh]"
          />
        )}
      </main>
    </div>
  );
}
