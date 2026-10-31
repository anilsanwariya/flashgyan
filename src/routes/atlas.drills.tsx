import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { atlasDrillsFn, type PublicPlace } from "@/lib/atlas.functions";
import { pickBi, type AtlasLang } from "@/lib/atlas";
import { NO_DISTRICT_QUESTION, shuffle } from "@/lib/atlas-practice";
import {
  BORDERS,
  byNorth,
  checkSet,
  northSouth,
  orderScore,
  type NsPlace,
} from "@/lib/atlas-drills";
import { withOffline } from "@/lib/atlas-device";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasPlaces } from "@/components/atlas-data";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/drills")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rajasthan Map Drills — FlashGyan" },
      {
        name: "description",
        content:
          "Drills on Rajasthan's map for RPSC and RSSB: the districts a river flows through, the districts on each border, and places from north to south.",
      },
    ],
  }),
  component: DrillsPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
type Drill = "river" | "border" | "ns";
const GOOD = "#86efac";
const BAD = "#fca5a5";
const MISSED = "#fde68a";
const PICKED = "#93c5fd";

function DrillsPage() {
  const [lang, setLang] = useAtlasLang();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const fn = useServerFn(atlasDrillsFn);
  const drills = useQuery({
    queryKey: ["atlasDrills"],
    queryFn: () => withOffline("drills", () => fn()),
    staleTime: 10 * 60_000,
  });
  const [drill, setDrill] = useState<Drill>("border");
  const dName = (en: string) => {
    const d = base.data?.districts.find((x) => x.en === en);
    return d ? (lang === "hi" ? d.hi : d.en) : en;
  };
  const tabs: { key: Drill; en: string; hi: string; n?: number }[] = [
    { key: "border", en: "Borders", hi: "सीमाएँ" },
    { key: "river", en: "River's path", hi: "नदी का मार्ग", n: drills.data?.rivers.length },
    { key: "ns", en: "North to south", hi: "उत्तर से दक्षिण" },
  ];
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          to="/atlas/quiz"
          aria-label={L(lang, "क्विज़", "Quiz")}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#1f2a5c] dark:text-indigo-200">
          {L(lang, "मानचित्र अभ्यास", "Map drills")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-3 sm:p-4">
        <div className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={drill === t.key}
              disabled={t.n === 0}
              onClick={() => setDrill(t.key)}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium disabled:opacity-40 ${drill === t.key ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {pickBi(t, lang)}
            </button>
          ))}
        </div>
        {!base.data || !places.data || !drills.data ? (
          <p className="text-muted-foreground">
            {base.error || drills.error
              ? L(lang, "नहीं खुल सका।", "Couldn't open.")
              : L(lang, "खुल रहा है…", "Opening…")}
          </p>
        ) : drill === "border" ? (
          <BorderDrill
            key="border"
            lang={lang}
            base={base.data}
            borders={drills.data.borders}
            dName={dName}
          />
        ) : drill === "river" ? (
          <RiverDrill
            key="river"
            lang={lang}
            base={base.data}
            rivers={drills.data.rivers}
            dName={dName}
          />
        ) : (
          <NorthSouth key="ns" lang={lang} base={base.data} places={places.data} />
        )}
      </main>
    </div>
  );
}

type Base = NonNullable<ReturnType<typeof useAtlasBase>["data"]>;
type Drills = Awaited<ReturnType<typeof atlasDrillsFn>>;

function Result({ lang, all, text }: { lang: AtlasLang; all: boolean; text: string }) {
  return (
    <p
      className={`rounded-lg p-2 text-sm font-medium ${all ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-amber-500/10"}`}
      data-drill-result={all ? "right" : "wrong"}
    >
      {all ? `✓ ${L(lang, "सब सही!", "All right!")} ` : ""}
      {text}
    </p>
  );
}

// ---------- Borders: tap every district on a border ----------

function BorderDrill({
  lang,
  base,
  borders,
  dName,
}: {
  lang: AtlasLang;
  base: Base;
  borders: Drills["borders"];
  dName: (en: string) => string;
}) {
  const [at, setAt] = useState(() => Math.floor(Math.random() * BORDERS.length));
  const b = BORDERS[at];
  const right = borders[b.key] ?? b.districts;
  const [chosen, setChosen] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const r = checkSet(chosen, right);
  const marks = useMemo(() => {
    const m: Record<string, string> = {};
    if (!checked) for (const d of chosen) m[d] = PICKED;
    else {
      for (const d of r.ok) m[d] = GOOD;
      for (const d of r.wrong) m[d] = BAD;
      for (const d of r.missed) m[d] = MISSED;
    }
    return m;
  }, [chosen, checked, r.ok, r.wrong, r.missed]);
  const next = () => {
    setAt((at + 1 + Math.floor(Math.random() * (BORDERS.length - 1))) % BORDERS.length);
    setChosen([]);
    setChecked(false);
  };
  return (
    <section className="space-y-2" data-drill="border">
      <p className="text-lg font-semibold" data-drill-prompt>
        {L(
          lang,
          `${b.name.hi} से सीमा बनाने वाले सभी जिलों पर टैप करें`,
          `Tap every district on the border with ${b.name.en}`,
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {L(lang, `${chosen.length} चुने`, `${chosen.length} chosen`)} ·{" "}
        {L(lang, `कुल ${right.length} जिले`, `${right.length} districts in all`)}
      </p>
      <AtlasMap
        base={base}
        places={[]}
        lang={lang}
        colour={null}
        overlays={[]}
        blind={!checked}
        named={checked ? [...r.ok, ...r.wrong, ...r.missed] : []}
        marks={marks}
        onDistrict={(d) => {
          if (checked) return;
          setChosen((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]));
        }}
        className="h-[55vh] max-h-[560px]"
      />
      {checked ? (
        <>
          <Result
            lang={lang}
            all={r.all}
            text={
              r.all
                ? ""
                : [
                    r.missed.length &&
                      `${L(lang, "छूटे", "Missed")}: ${r.missed.map(dName).join(", ")}`,
                    r.wrong.length &&
                      `${L(lang, "गलत", "Not on it")}: ${r.wrong.map(dName).join(", ")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
          />
          <button
            type="button"
            onClick={next}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground"
          >
            <RotateCcw className="h-4 w-4" /> {L(lang, "अगली सीमा", "Next border")}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={!chosen.length}
          onClick={() => setChecked(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {L(lang, "जाँचें", "Check")}
        </button>
      )}
    </section>
  );
}

// ---------- Order chips (rivers, north to south) ----------

function OrderChips({
  lang,
  items,
  given,
  setGiven,
  checked,
  right,
}: {
  lang: AtlasLang;
  items: { key: string; label: string }[];
  given: string[];
  setGiven: (g: string[]) => void;
  checked: boolean;
  right: string[];
}) {
  const label = (k: string) => items.find((i) => i.key === k)?.label ?? k;
  return (
    <div className="space-y-2">
      <ol
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-border p-2"
        data-order-given
      >
        {!given.length && (
          <li className="text-sm text-muted-foreground">
            {L(lang, "नीचे से क्रम में टैप करें", "Tap them below in order")}
          </li>
        )}
        {given.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              disabled={checked}
              onClick={() => setGiven(given.filter((x) => x !== k))}
              className={`rounded-full border px-2.5 py-1 text-sm ${
                !checked
                  ? "border-primary bg-primary/10"
                  : right[i] === k
                    ? "border-emerald-500 bg-emerald-500/15"
                    : "border-red-400 bg-red-500/10"
              }`}
            >
              {i + 1}. {label(k)}
            </button>
          </li>
        ))}
      </ol>
      {!checked && (
        <div className="flex flex-wrap gap-1.5" data-order-pool>
          {items
            .filter((i) => !given.includes(i.key))
            .map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setGiven([...given, i.key])}
                className="rounded-full border border-border px-2.5 py-1 text-sm hover:bg-muted"
              >
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------- A river's districts in order ----------

function RiverDrill({
  lang,
  base,
  rivers,
  dName,
}: {
  lang: AtlasLang;
  base: Base;
  rivers: Drills["rivers"];
  dName: (en: string) => string;
}) {
  const [at, setAt] = useState(() => Math.floor(Math.random() * Math.max(1, rivers.length)));
  const river = rivers[at];
  const pool = useMemo(() => (river ? shuffle(river.districts, Math.random) : []), [river]);
  const [given, setGiven] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  if (!river)
    return (
      <p className="text-sm text-muted-foreground">
        {L(lang, "अभी कोई नदी तैयार नहीं।", "No rivers ready yet.")}
      </p>
    );
  const score = orderScore(given, river.districts);
  const marks = checked ? Object.fromEntries(river.districts.map((d) => [d, GOOD])) : {};
  return (
    <section className="space-y-2" data-drill="river">
      <p className="text-lg font-semibold" data-drill-prompt>
        {L(
          lang,
          `${river.name.hi || river.name.en} जिन जिलों से बहती है, उन्हें उद्गम से क्रम में लगाएँ`,
          `Put the districts the ${river.name.en} flows through in order, from its source`,
        )}
      </p>
      <OrderChips
        lang={lang}
        items={pool.map((d) => ({ key: d, label: dName(d) }))}
        given={given}
        setGiven={setGiven}
        checked={checked}
        right={river.districts}
      />
      {checked && (
        <Result
          lang={lang}
          all={score === river.districts.length}
          text={
            score === river.districts.length
              ? ""
              : `${score}/${river.districts.length} · ${L(lang, "सही क्रम", "Right order")}: ${river.districts.map(dName).join(" → ")}`
          }
        />
      )}
      {checked && (
        <AtlasMap
          base={base}
          places={[]}
          lang={lang}
          colour={null}
          overlays={[]}
          marks={marks}
          className="h-72"
        />
      )}
      {checked ? (
        <button
          type="button"
          onClick={() => {
            setAt((at + 1) % rivers.length);
            setGiven([]);
            setChecked(false);
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground"
        >
          <RotateCcw className="h-4 w-4" /> {L(lang, "अगली नदी", "Next river")}
        </button>
      ) : (
        <button
          type="button"
          disabled={given.length < river.districts.length}
          onClick={() => setChecked(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {L(lang, "जाँचें", "Check")}
        </button>
      )}
    </section>
  );
}

// ---------- Places from north to south ----------

function NorthSouth({
  lang,
  base,
  places,
}: {
  lang: AtlasLang;
  base: Base;
  places: PublicPlace[];
}) {
  const usable = useMemo<NsPlace[]>(
    () =>
      places
        .filter((p) => !NO_DISTRICT_QUESTION.has(p[3]) && !/[()]/.test(p[1]))
        .map((p) => ({ key: p[0], en: p[1], hi: p[2], lat: p[4], lon: p[5] })),
    [places],
  );
  const [round, setRound] = useState(0);
  const four = useMemo(() => northSouth(usable, Math.random) ?? [], [usable, round]);
  const right = byNorth(four).map((p) => p.key);
  const [given, setGiven] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const name = (p: NsPlace) => (lang === "hi" ? p.hi || p.en : p.en);
  const score = orderScore(given, right);
  return (
    <section className="space-y-2" data-drill="ns">
      <p className="text-lg font-semibold" data-drill-prompt>
        {L(
          lang,
          "इन स्थानों को उत्तर से दक्षिण के क्रम में लगाएँ",
          "Put these places in order from north to south",
        )}
      </p>
      <OrderChips
        lang={lang}
        items={four.map((p) => ({ key: p.key, label: name(p) }))}
        given={given}
        setGiven={setGiven}
        checked={checked}
        right={right}
      />
      {checked && (
        <>
          <Result
            lang={lang}
            all={score === right.length}
            text={
              score === right.length
                ? ""
                : `${score}/${right.length} · ${L(lang, "सही क्रम", "Right order")}: ${byNorth(four)
                    .map((p) => `${name(p)} (${p.lat.toFixed(1)}°)`)
                    .join(" → ")}`
            }
          />
          <AtlasMap
            base={base}
            places={places.filter((p) => right.includes(p[0]))}
            lang={lang}
            colour={null}
            overlays={[]}
            className="h-72"
          />
        </>
      )}
      {checked ? (
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setGiven([]);
            setChecked(false);
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground"
        >
          <RotateCcw className="h-4 w-4" /> {L(lang, "अगले चार", "Next four")}
        </button>
      ) : (
        <button
          type="button"
          disabled={given.length < four.length || !four.length}
          onClick={() => setChecked(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> {L(lang, "जाँचें", "Check")}
        </button>
      )}
    </section>
  );
}
