import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, X } from "lucide-react";
import { AGRO_ZONES, ATLAS_GROUPS, DIVISIONS, atlasCat, pickBi, type AtlasLang } from "@/lib/atlas";
import type { PublicPlace } from "@/lib/atlas.functions";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasEntityFacts, useAtlasPlaces } from "@/components/atlas-data";
import { ShareButton } from "@/components/atlas-actions";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/compare")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { d?: string } =>
    typeof s.d === "string" && s.d.length <= 200 ? { d: s.d } : {},
  head: () => ({
    meta: [
      { title: "Compare districts — Rajasthan Atlas · FlashGyan" },
      {
        name: "description",
        content:
          "Rajasthan's districts side by side: division, agro-climatic zone, neighbours and their places, for RPSC and RSSB exams.",
      },
    ],
  }),
  component: ComparePage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
const MAX = 3;
const COLOURS = ["#fde68a", "#bfdbfe", "#bbf7d0"];

// Up to three districts side by side, and on the map.
function ComparePage() {
  const [lang, setLang] = useAtlasLang();
  const { d } = Route.useSearch();
  const navigate = useNavigate();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const all = base.data?.districts ?? [];
  const chosen = useMemo(
    () =>
      [...new Set((d ?? "").split(",").map((x) => x.trim()))]
        .filter((x) => all.some((y) => y.en === x))
        .slice(0, MAX),
    [d, all],
  );
  const set = (next: string[]) =>
    void navigate({ to: "/atlas/compare", search: next.length ? { d: next.join(",") } : {} });
  const f0 = useAtlasEntityFacts(chosen[0] ? `D:${chosen[0]}` : null);
  const f1 = useAtlasEntityFacts(chosen[1] ? `D:${chosen[1]}` : null);
  const f2 = useAtlasEntityFacts(chosen[2] ? `D:${chosen[2]}` : null);
  const facts = [f0, f1, f2];
  const dist = (en: string) => all.find((x) => x.en === en)!;
  const name = (en: string) => (lang === "hi" ? (all.find((x) => x.en === en)?.hi ?? en) : en);
  const mine = (en: string): PublicPlace[] => (places.data ?? []).filter((p) => p[6] === en);
  const marks = Object.fromEntries(chosen.map((c, i) => [c, COLOURS[i]]));
  const groups = ATLAS_GROUPS.filter((g) =>
    chosen.some((c) => mine(c).some((p) => atlasCat(p[3]).group === g.key)),
  );
  const row = (label: string, cell: (en: string, i: number) => React.ReactNode, key?: string) => (
    <tr key={key ?? label} className="border-t border-border align-top">
      <th className="w-36 py-2 pr-2 text-left text-xs font-medium text-muted-foreground">
        {label}
      </th>
      {chosen.map((c, i) => (
        <td key={c} className="px-2 py-2 text-sm">
          {cell(c, i)}
        </td>
      ))}
    </tr>
  );
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
          {L(lang, "जिलों की तुलना", "Compare districts")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      {base.isLoading ? (
        <p className="p-6 text-muted-foreground">…</p>
      ) : (
        <main className="mx-auto w-full max-w-6xl space-y-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {chosen.map((c, i) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-3 pr-1 text-sm font-medium"
                style={{ background: COLOURS[i] }}
              >
                {name(c)}
                <button
                  type="button"
                  aria-label={L(lang, `${name(c)} हटाएँ`, `Remove ${c}`)}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-black/10"
                  onClick={() => set(chosen.filter((x) => x !== c))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {chosen.length < MAX && (
              <select
                aria-label={L(lang, "जिला जोड़ें", "Add a district")}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value=""
                onChange={(e) => e.target.value && set([...chosen, e.target.value])}
              >
                <option value="">
                  {chosen.length
                    ? L(lang, "+ एक और जिला", "+ Another district")
                    : L(lang, "जिला चुनें…", "Choose a district…")}
                </option>
                {all
                  .filter((x) => !chosen.includes(x.en))
                  .map((x) => (
                    <option key={x.en} value={x.en}>
                      {lang === "hi" ? x.hi : x.en}
                    </option>
                  ))}
              </select>
            )}
            {chosen.length > 1 && (
              <ShareButton
                lang={lang}
                path={`/atlas/compare?d=${encodeURIComponent(chosen.join(","))}`}
                title={chosen.map(name).join(" · ")}
              />
            )}
          </div>
          {chosen.length < 2 && (
            <p className="text-sm text-muted-foreground">
              {L(
                lang,
                "दो या तीन जिले चुनें: उनका संभाग, कृषि जलवायु क्षेत्र, पड़ोसी जिले और स्थान साथ-साथ दिखेंगे।",
                "Choose two or three districts: their division, agro-climatic zone, neighbours and places, side by side.",
              )}
            </p>
          )}
          {base.data && (
            <AtlasMap
              base={base.data}
              places={[]}
              lang={lang}
              colour={null}
              overlays={[]}
              blind
              marks={marks}
              named={chosen}
              onDistrict={(x) =>
                chosen.includes(x)
                  ? set(chosen.filter((c) => c !== x))
                  : chosen.length < MAX && set([...chosen, x])
              }
              className="h-[38vh]"
            />
          )}
          {chosen.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]" data-compare-table>
                <thead>
                  <tr>
                    <th />
                    {chosen.map((c, i) => (
                      <th key={c} className="px-2 py-1 text-left">
                        <span
                          className="rounded px-1.5 py-0.5 font-serif text-lg"
                          style={{ background: COLOURS[i] }}
                        >
                          {name(c)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {row(L(lang, "संभाग", "Division"), (c) => {
                    const v = DIVISIONS.find((x) => x.key === dist(c).meta.division);
                    return v ? pickBi(v.name, lang) : "—";
                  })}
                  {row(L(lang, "कृषि जलवायु क्षेत्र", "Agro-climatic zone"), (c) => {
                    const v = AGRO_ZONES.find((x) => x.key === dist(c).meta.zone);
                    return v ? pickBi(v.name, lang) : "—";
                  })}
                  {row(L(lang, "तहसीलें", "Tehsils"), (c) => dist(c).meta.tehsils ?? "—")}
                  {row(L(lang, "पड़ोसी जिले", "Neighbours"), (c) => (
                    <span>
                      {(dist(c).meta.neighbours ?? []).map((n, k) => (
                        <span key={n}>
                          {k > 0 && ", "}
                          <span
                            className={chosen.includes(n) ? "font-semibold underline" : ""}
                            title={
                              chosen.includes(n)
                                ? L(lang, "आपस में पड़ोसी", "They border each other")
                                : undefined
                            }
                          >
                            {name(n)}
                          </span>
                        </span>
                      ))}
                    </span>
                  ))}
                  {row(L(lang, "एटलस में स्थान", "Places in the atlas"), (c) => mine(c).length)}
                  {row(L(lang, "नोट्स में तथ्य", "Facts in the notes"), (_c, i) =>
                    facts[i].data ? facts[i].data!.length : "…",
                  )}
                  {groups.map((g) =>
                    row(
                      pickBi(g.name, lang),
                      (c) => {
                        const ps = mine(c).filter((p) => atlasCat(p[3]).group === g.key);
                        if (!ps.length) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span>
                            <span className="font-semibold">{ps.length}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              ·{" "}
                              {ps
                                .sort((a, b) => b[7] - a[7])
                                .slice(0, 5)
                                .map((p) => (lang === "hi" ? p[2] || p[1] : p[1]))
                                .join(", ")}
                              {ps.length > 5 ? "…" : ""}
                            </span>
                          </span>
                        );
                      },
                      g.key,
                    ),
                  )}
                  {row("", (c) => (
                    <Link
                      to="/atlas/$district"
                      params={{ district: c }}
                      className="text-sm text-primary underline"
                    >
                      {L(lang, "जिला देखें →", "See the district →")}
                    </Link>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
