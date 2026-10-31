import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { atlasDrillsFn } from "@/lib/atlas.functions";
import { AGRO_ZONES, ATLAS_GROUPS, DIVISIONS, atlasCat, pickBi, type AtlasLang } from "@/lib/atlas";
import { BORDERS } from "@/lib/atlas-drills";
import { withOffline } from "@/lib/atlas-device";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasEntityFacts, useAtlasPlaces } from "@/components/atlas-data";
import { useAtlasAskedCounts } from "@/components/atlas-exams";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/sheet/$district")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `${params.district} district: one-page revision sheet — FlashGyan` },
      {
        name: "description",
        content: `A printable one-page revision sheet of ${params.district} district, Rajasthan: its map, places and key facts for RPSC and RSSB exams.`,
      },
    ],
  }),
  component: SheetPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
// Facts that fit one page beside the map and the places.
const FACTS = 18;

function SheetPage() {
  const { district } = Route.useParams();
  const [lang, setLang] = useAtlasLang();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const facts = useAtlasEntityFacts(`D:${district}`);
  const asked = useAtlasAskedCounts().data;
  const drillsFn = useServerFn(atlasDrillsFn);
  const drills = useQuery({
    queryKey: ["atlasDrills"],
    queryFn: () => withOffline("drills", () => drillsFn()),
    staleTime: 10 * 60_000,
  });
  const d = base.data?.districts.find((x) => x.en === district);
  const mine = useMemo(
    () => (places.data ?? []).filter((p) => p[6] === district),
    [places.data, district],
  );
  const dName = (en: string) => {
    const x = base.data?.districts.find((y) => y.en === en);
    return x ? (lang === "hi" ? x.hi : x.en) : en;
  };
  const text = (f: { text: { en: string; hi: string } }) => pickBi(f.text, lang);
  // Facts that change ("as of …") apart, to check before the exam.
  const all = facts.data ?? [];
  const dated = all.filter((f) => /\(as of /i.test(f.text.en)).slice(0, 3);
  const main = all.filter((f) => !dated.includes(f)).slice(0, FACTS);
  const borders = BORDERS.filter((b) =>
    (drills.data?.borders[b.key] ?? b.districts).includes(district),
  );
  const askedHere =
    (asked?.districts[district] ?? 0) + mine.reduce((s, p) => s + (asked?.places[p[0]] ?? 0), 0);

  if (base.isLoading || places.isLoading)
    return <p className="p-6 text-muted-foreground">{L(lang, "खुल रहा है…", "Opening…")}</p>;
  if (!d)
    return (
      <p className="p-6">
        {L(lang, "यह जिला नहीं मिला।", "That district isn't in the atlas.")}{" "}
        <Link to="/atlas" className="text-primary underline">
          {L(lang, "एटलस", "Atlas")}
        </Link>
      </p>
    );
  const zone = AGRO_ZONES.find((z) => z.key === d.meta.zone);
  const division = DIVISIONS.find((x) => x.key === d.meta.division);
  const groups = ATLAS_GROUPS.map((g) => ({
    g,
    ps: mine.filter((p) => atlasCat(p[3]).group === g.key),
  })).filter((x) => x.ps.length);

  return (
    <div className="min-h-[100dvh] bg-muted/40 print:bg-white">
      <style>{`@page { size: A4; margin: 9mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur print:hidden sm:px-4">
        <Link
          to="/atlas"
          search={{ district }}
          aria-label={L(lang, "एटलस", "Atlas")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-lg font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "एक पेज का सार", "One-page sheet")}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <LangToggle lang={lang} onChange={setLang} />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Printer className="h-4 w-4" /> {L(lang, "प्रिंट / PDF", "Print / PDF")}
          </button>
        </div>
      </header>

      <article
        className="mx-auto my-4 w-full max-w-[210mm] bg-white p-[8mm] text-[#1b1b1b] shadow print:my-0 print:max-h-[277mm] print:max-w-none print:overflow-hidden print:p-0 print:shadow-none"
        data-sheet={district}
      >
        <div className="flex items-end justify-between border-b-2 border-[#1f2a5c] pb-1.5">
          <div>
            <h2 className="font-serif text-3xl font-bold leading-none text-[#1f2a5c]">
              {lang === "hi" ? d.hi : d.en}
            </h2>
            <p className="text-xs text-[#555]">
              {lang === "hi" ? d.en : d.hi} · {L(lang, "जिला, राजस्थान", "District, Rajasthan")}
            </p>
          </div>
          <p className="text-right text-[10px] text-[#555]">
            FlashGyan · {L(lang, "राजस्थान एटलस", "Rajasthan Atlas")}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_1.15fr] gap-3">
          <div className="space-y-2">
            <AtlasMap
              base={base.data!}
              places={mine}
              lang={lang}
              colour={null}
              overlays={[]}
              district={district}
              className="h-[78mm] rounded border border-[#ddd]"
            />
            <dl className="grid grid-cols-2 gap-1 text-[10.5px]">
              {division && (
                <Item k={L(lang, "संभाग", "Division")} v={pickBi(division.name, lang)} />
              )}
              {zone && (
                <Item
                  k={L(lang, "कृषि जलवायु क्षेत्र", "Agro-climatic zone")}
                  v={pickBi(zone.name, lang)}
                />
              )}
              {d.meta.tehsils ? (
                <Item k={L(lang, "तहसीलें", "Tehsils")} v={String(d.meta.tehsils)} />
              ) : null}
              {askedHere > 0 && (
                <Item
                  k={L(lang, "परीक्षाओं में पूछा", "Asked in exams")}
                  v={L(lang, `${askedHere} प्रश्न`, `${askedHere} questions`)}
                />
              )}
              {!!d.meta.neighbours?.length && (
                <div className="col-span-2">
                  <Item
                    k={L(lang, "पड़ोसी जिले", "Neighbouring districts")}
                    v={d.meta.neighbours.map(dName).join(", ")}
                  />
                </div>
              )}
              {borders.length > 0 && (
                <div className="col-span-2">
                  <Item
                    k={L(lang, "सीमा", "Border with")}
                    v={borders.map((b) => pickBi(b.name, lang)).join(", ")}
                  />
                </div>
              )}
            </dl>
          </div>

          <div className="space-y-1.5 text-[10.5px] leading-snug" data-sheet-places>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1f2a5c]">
              {L(lang, "प्रमुख स्थान", "Places")} ({mine.length})
            </p>
            {groups.map(({ g, ps }) => (
              <p key={g.key} className="line-clamp-2">
                <span className="font-semibold" style={{ color: g.color }}>
                  {pickBi(g.name, lang)}:
                </span>{" "}
                {ps
                  .slice(0, 14)
                  .map((p) => (lang === "hi" ? p[2] || p[1] : p[1]))
                  .join(" · ")}
                {ps.length > 14 ? ` +${ps.length - 14}` : ""}
              </p>
            ))}
            {dated.length > 0 && (
              <div
                className="mt-2 rounded border border-amber-300 bg-amber-50 p-1.5"
                data-sheet-dated
              >
                <p className="font-semibold text-amber-900">
                  {L(
                    lang,
                    "बदलने वाले तथ्य — परीक्षा से पहले जाँचें",
                    "Facts that change: check before the exam",
                  )}
                </p>
                <ul className="mt-0.5 list-disc pl-4">
                  {dated.map((f) => (
                    <li key={f.id} className="line-clamp-2">
                      {text(f)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <section className="mt-2" data-sheet-facts>
          <p className="border-b border-[#ccc] pb-0.5 text-[11px] font-bold uppercase tracking-wide text-[#1f2a5c]">
            {L(lang, "नोट्स से मुख्य तथ्य", "Key facts from the notes")}
          </p>
          {facts.isLoading ? (
            <p className="text-xs">…</p>
          ) : !main.length ? (
            <p className="text-xs text-[#555]">{L(lang, "अभी कोई तथ्य नहीं।", "No facts yet.")}</p>
          ) : (
            <ol className="mt-1 columns-2 gap-4 text-[10px] leading-snug">
              {main.map((f, i) => (
                <li key={f.id} className="mb-1 line-clamp-3 break-inside-avoid">
                  <span className="font-semibold text-[#1f2a5c]">{i + 1}.</span> {text(f)}
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="mt-2 border-t border-[#ccc] pt-1 text-[9px] text-[#777]">
          flashgyan.com/atlas/{encodeURIComponent(d.en)} ·{" "}
          {new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </article>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded bg-[#f4f1ea] px-1.5 py-1">
      <dt className="text-[8.5px] uppercase text-[#666]">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
