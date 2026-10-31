import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { atlasBaseFn, atlasDistrictFn } from "@/lib/atlas.functions";
import {
  AGRO_ZONES,
  ATLAS_GROUPS,
  DIVISIONS,
  atlasCat,
  atlasShareMeta,
  pickBi,
  type AtlasLang,
} from "@/lib/atlas";
import { SITE_URL } from "@/lib/app-promo";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasDistrict, useAtlasPlace } from "@/components/atlas-data";
import { OverviewHero, OverviewSections, SectionChips } from "@/components/atlas-overview";
import { FactsList, LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/$district")({
  ssr: false,
  head: ({ params }) => {
    const description = `${params.district} district of Rajasthan for RPSC and RSSB exams: geography, agriculture, forts, temples, folk saints, history and every place on the map.`;
    return {
      meta: [
        { title: `${params.district} district — Rajasthan Atlas · FlashGyan` },
        { name: "description", content: description },
        ...atlasShareMeta({
          title: `${params.district} district — Rajasthan Atlas`,
          description,
          url: `${SITE_URL}/atlas/${encodeURIComponent(params.district)}`,
          image: `${SITE_URL}/api/atlas/preview?district=${encodeURIComponent(params.district)}`,
        }),
      ],
    };
  },
  component: DistrictPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

function DistrictPage() {
  const { district } = Route.useParams();
  const [lang, setLang] = useAtlasLang();
  const q = useAtlasDistrict(district);
  const base = useAtlasBase();
  const d = q.data;
  if (q.isLoading) return <p className="p-6 text-muted-foreground">…</p>;
  if (!d)
    return (
      <div className="space-y-3 p-6">
        <p>{L(lang, "यह जिला एटलस में नहीं है।", "This district isn't in the atlas.")}</p>
        <Link to="/atlas" className="underline">
          {L(lang, "एटलस खोलें", "Open the atlas")}
        </Link>
      </div>
    );
  const ov = d.overview;
  const zone = AGRO_ZONES.find((z) => z.key === d.meta.zone);
  const division = DIVISIONS.find((x) => x.key === d.meta.division);
  const map = base.data ? <DistrictMap base={base.data} page={d} lang={lang} /> : null;
  return (
    <div className="min-h-[100dvh] bg-[#f6efe2] dark:bg-[#17140f]">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[#e5d7bd] bg-[#f6efe2]/95 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-[#17140f]/95">
        <Link
          to="/atlas"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm hover:bg-black/5"
        >
          <ArrowLeft className="h-4 w-4" /> {L(lang, "एटलस", "Atlas")}
        </Link>
        <span className="truncate text-sm font-semibold">
          {lang === "hi" ? d.name.hi : d.name.en}
        </span>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </div>
      {ov ? (
        <>
          <OverviewHero ov={ov} lang={lang} />
          <div className="sticky top-[49px] z-10 border-b border-[#e5d7bd] bg-[#f6efe2]/95 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-[#17140f]/95 sm:px-8">
            <SectionChips ov={ov} lang={lang} />
          </div>
          <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
            <OverviewSections ov={ov} lang={lang} before={map} />
          </main>
        </>
      ) : (
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
          <h1 className="font-serif text-5xl font-bold text-[#1f2a5c] dark:text-indigo-200">
            {lang === "hi" ? d.name.hi : d.name.en}
          </h1>
          <p className="text-sm text-muted-foreground">
            {L(
              lang,
              "इस जिले का पूरा जिला दर्शन जल्द आ रहा है। तब तक इसके स्थान और तथ्य देखें।",
              "The full overview of this district is coming soon. Meanwhile, see its places and facts.",
            )}
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            {division && (
              <span className="rounded-full bg-white px-3 py-1 dark:bg-white/10">
                {L(lang, "संभाग", "Division")}: {pickBi(division.name, lang)}
              </span>
            )}
            {zone && (
              <span className="rounded-full bg-white px-3 py-1 dark:bg-white/10">
                {pickBi(zone.name, lang)}
              </span>
            )}
          </div>
          {map}
        </main>
      )}
    </div>
  );
}

function DistrictMap({
  base,
  page,
  lang,
}: {
  base: Awaited<ReturnType<typeof atlasBaseFn>>;
  page: NonNullable<Awaited<ReturnType<typeof atlasDistrictFn>>>;
  lang: AtlasLang;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of page.places)
      m.set(atlasCat(p[3]).group, (m.get(atlasCat(p[3]).group) ?? 0) + 1);
    return ATLAS_GROUPS.filter((g) => m.get(g.key)).map((g) => ({ ...g, n: m.get(g.key)! }));
  }, [page.places]);
  const [on, setOn] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const card = useAtlasPlace(sel);
  const shown = page.places.filter((p) => !on.length || on.includes(atlasCat(p[3]).group));
  return (
    <section
      id="sec-map"
      className="scroll-mt-28 space-y-3"
      aria-label={L(lang, "स्थान मानचित्र", "Map of places")}
    >
      <div>
        <h2 className="flex items-center gap-2 font-serif text-3xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          <MapIcon className="h-6 w-6" /> {L(lang, "स्थान मानचित्र", "Map of places")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {L(
            lang,
            "हर बिंदु पर टैप करें — उस स्थान से जुड़े सभी परीक्षा-तथ्य नीचे दिखेंगे। श्रेणी बटन से छाँटें।",
            "Tap a dot: the place's exam facts show below. Filter with the buttons.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const active = on.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={active}
              onClick={() => setOn((x) => (active ? x.filter((k) => k !== g.key) : [...x, g.key]))}
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={
                active || !on.length
                  ? { background: g.color, color: "#fff", borderColor: g.color }
                  : { borderColor: g.color, color: g.color }
              }
            >
              {pickBi(g.name, lang)} {g.n}
            </button>
          );
        })}
      </div>
      <AtlasMap
        base={base}
        places={shown}
        lang={lang}
        colour={null}
        overlays={[]}
        district={page.district}
        selected={sel}
        onPlace={setSel}
        className="h-[60vh] max-h-[640px]"
      />
      <div
        className="rounded-xl border border-[#e5d7bd] bg-[#fffaf0] p-4 dark:border-white/10 dark:bg-white/5"
        aria-live="polite"
      >
        {!sel ? (
          <p className="text-sm text-muted-foreground">
            {L(lang, "किसी बिंदु पर टैप करें।", "Tap a dot.")}
          </p>
        ) : card.data ? (
          <div className="space-y-2" data-place-card>
            <p
              className="text-xs font-semibold"
              style={{ color: atlasCat(card.data.place.cat).color }}
            >
              {pickBi(atlasCat(card.data.place.cat).name, lang)}
              {card.data.place.tehsil
                ? ` · ${L(lang, "तहसील", "Tehsil")}: ${card.data.place.tehsil}`
                : ""}
            </p>
            <h3 className="text-lg font-bold">{pickBi(card.data.place.name, lang)}</h3>
            <FactsList facts={card.data.facts} lang={lang} limit={8} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">…</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {L(
          lang,
          "जिले की सीमा राज्य रिमोट सेंसिंग केन्द्र के मानचित्र से; बिंदुओं की स्थिति नोट्स के मानचित्र से।",
          "District outline from the State Remote Sensing Application Centre's map; dots from the notes' map.",
        )}
      </p>
    </section>
  );
}
