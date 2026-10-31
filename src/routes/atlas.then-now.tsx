import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { atlasTehsilsFn } from "@/lib/atlas.functions";
import { type AtlasLang } from "@/lib/atlas";
import {
  CANCELLED_2024,
  NEW_2023,
  PARENTS_2023,
  findTehsil,
  type TehsilRow,
} from "@/lib/atlas-drills";
import { withOffline } from "@/lib/atlas-device";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase } from "@/components/atlas-data";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/then-now")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rajasthan Districts Then and Now — FlashGyan" },
      {
        name: "description",
        content:
          "Which district was a tehsil in under Rajasthan's 33-district map, the 50-district map of 2023 and today's 41 districts.",
      },
    ],
  }),
  component: ThenNowPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
// Hindi names of the nine cancelled districts (not on today's map).
const CANCELLED_HI: Record<string, string> = {
  Anupgarh: "अनूपगढ़",
  Dudu: "दूदू",
  "Gangapur City": "गंगापुर सिटी",
  "Jaipur Rural": "जयपुर ग्रामीण",
  "Jodhpur Rural": "जोधपुर ग्रामीण",
  Kekri: "केकड़ी",
  "Neem Ka Thana": "नीम का थाना",
  Sanchore: "सांचौर",
  Shahpura: "शाहपुरा",
};
const NEW = "#c7d2fe";
const HERE = "#fbbf24";

function ThenNowPage() {
  const [lang, setLang] = useAtlasLang();
  const base = useAtlasBase();
  const fn = useServerFn(atlasTehsilsFn);
  const q = useQuery({
    queryKey: ["atlasTehsils"],
    queryFn: () => withOffline("tehsils", () => fn()),
    staleTime: 10 * 60_000,
  });
  const [text, setText] = useState("");
  const [pick, setPick] = useState<TehsilRow | null>(null);
  const rows = q.data ?? [];
  const found = useMemo(() => findTehsil(rows, text), [rows, text]);
  const dName = (en: string) => {
    if (lang === "en") return en;
    return base.data?.districts.find((x) => x.en === en)?.hi || CANCELLED_HI[en] || en;
  };
  const marks = useMemo(() => {
    if (pick) return { [pick.d41]: HERE };
    return Object.fromEntries(NEW_2023.map((d) => [d, NEW]));
  }, [pick]);
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/atlas"
          aria-label={L(lang, "एटलस", "Atlas")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "जिले: तब और अब", "Districts then and now")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {L(
              lang,
              "33 जिले (2008–2023) → 50 जिले (7 अगस्त 2023) → 41 जिले (दिसंबर 2024 से)। तहसील खोजें और देखें कि वह हर समय किस जिले में थी।",
              "33 districts (2008–2023) → 50 districts (7 Aug 2023) → 41 districts (since Dec 2024). Find a tehsil to see its district in each.",
            )}
          </p>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPick(null);
              }}
              placeholder={L(lang, "तहसील का नाम…", "A tehsil's name…")}
              aria-label={L(lang, "तहसील खोजें", "Find a tehsil")}
              className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3"
            />
          </label>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : !rows.length ? (
            <p className="rounded-lg bg-muted/50 p-3 text-sm">
              {L(
                lang,
                "तहसीलों की सूची जल्द आ रही है। तब तक नीचे 2023 के जिले देखें।",
                "The tehsil list is coming soon. Meanwhile, see the 2023 districts below.",
              )}
            </p>
          ) : text.trim().length >= 2 && !found.length ? (
            <p className="text-sm text-muted-foreground">
              {L(lang, "यह तहसील सूची में नहीं है।", "That tehsil is not in the list.")}
            </p>
          ) : (
            <ul className="space-y-1.5" data-tehsils>
              {found.map((r) => (
                <li key={r.tehsil.en}>
                  <button
                    type="button"
                    onClick={() => setPick(r)}
                    className={`w-full rounded-xl border p-3 text-left ${pick === r ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                    data-tehsil={r.tehsil.en}
                  >
                    <p className="font-semibold">
                      {lang === "hi" ? r.tehsil.hi || r.tehsil.en : r.tehsil.en}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                      <Step label="33" name={dName(r.d33)} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <Step label="50" name={dName(r.d50)} changed={r.d50 !== r.d33} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <Step label="41" name={dName(r.d41)} changed={r.d41 !== r.d50} />
                    </p>
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-border p-3" data-new-2023>
            <p className="text-sm font-semibold">
              {L(
                lang,
                "7 अगस्त 2023 के जिले जो आज भी हैं (8)",
                "The 2023 districts that remain (8)",
              )}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {NEW_2023.map((d) => (
                <li key={d}>
                  <span className="font-medium">{dName(d)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ← {PARENTS_2023[d].map(dName).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border p-3" data-cancelled>
            <p className="text-sm font-semibold">
              {L(lang, "दिसंबर 2024 में समाप्त जिले (9)", "Districts cancelled in Dec 2024 (9)")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {CANCELLED_2024.map(dName).join(", ")}
            </p>
          </div>
        </section>
        <section className="space-y-1">
          {base.data && (
            <AtlasMap
              base={base.data}
              places={[]}
              lang={lang}
              colour={null}
              overlays={[]}
              marks={marks}
              className="h-[60vh] max-h-[620px] lg:sticky lg:top-16"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {pick
              ? L(lang, "आज का जिला पीले रंग में।", "Today's district in yellow.")
              : L(lang, "नीले रंग में: 2023 के 8 जिले।", "In blue: the eight 2023 districts.")}
          </p>
        </section>
      </main>
    </div>
  );
}

function Step({ label, name, changed }: { label: string; name: string; changed?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${changed ? "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" : "bg-muted"}`}
    >
      <span className="text-[10px] opacity-70">{label}</span> {name}
    </span>
  );
}
