import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, RotateCcw, Trophy, X } from "lucide-react";
import { type PublicPlace } from "@/lib/atlas.functions";
import { ATLAS_GROUPS, atlasCat, pickBi, type AtlasLang } from "@/lib/atlas";
import { NO_DISTRICT_QUESTION, quizRound, type QuizMode, type QuizQ } from "@/lib/atlas-practice";
import { AtlasMap } from "@/components/atlas-map";
import { useAtlasBase, useAtlasPlaces } from "@/components/atlas-data";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";
import {
  districtScore,
  recordQuizAnswers,
  useAtlasSaved,
  useDistrictStats,
  WEAK_PCT,
} from "@/lib/atlas-device";

export const Route = createFileRoute("/atlas/quiz")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rajasthan Map Quiz — FlashGyan" },
      {
        name: "description",
        content:
          "Practise Rajasthan's map for RPSC and RSSB exams: find the districts, place forts, mines, dams and sanctuaries in their districts, and name the districts.",
      },
    ],
  }),
  // From the saved list: a "where is it?" quiz on the saved places.
  validateSearch: (s: Record<string, unknown>): { saved?: 1 } =>
    s.saved === 1 || s.saved === "1" ? { saved: 1 } : {},
  component: QuizPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
const MODES: {
  key: QuizMode;
  name: { en: string; hi: string };
  sub: { en: string; hi: string };
}[] = [
  {
    key: "find",
    name: { en: "Find the district", hi: "जिला खोजें" },
    sub: { en: "Tap the district named", hi: "बताए गए जिले पर टैप करें" },
  },
  {
    key: "where",
    name: { en: "Where is it?", hi: "कहाँ है?" },
    sub: {
      en: "Tap the district a fort, mine, dam… is in",
      hi: "दुर्ग, खान, बाँध… किस जिले में है, टैप करें",
    },
  },
  {
    key: "name",
    name: { en: "Name the district", hi: "जिले का नाम बताएँ" },
    sub: { en: "Pick the name of the district shown", hi: "दिखाए गए जिले का नाम चुनें" },
  },
  {
    key: "mix",
    name: { en: "Mixed", hi: "मिश्रित" },
    sub: { en: "All three together", hi: "तीनों एक साथ" },
  },
];
const BEST_KEY = "atlas-quiz-best";
const GOOD = "#bbf7d0";
const BAD = "#fecaca";
const ASKED = "#fde68a";

type Answer = { q: QuizQ; given: string; right: boolean };

function readBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function QuizPage() {
  const [lang, setLang] = useAtlasLang();
  const base = useAtlasBase();
  const places = useAtlasPlaces();
  const fromSaved = !!Route.useSearch().saved;
  const { saved } = useAtlasSaved();
  const savedKeys = useMemo(() => new Set(saved.places.map((p) => p.key)), [saved.places]);
  const [mode, setMode] = useState<QuizMode>(fromSaved ? "where" : "find");
  const [groups, setGroups] = useState<string[]>(["culture", "water", "wildlife", "minerals"]);
  const [size, setSize] = useState(10);
  const [round, setRound] = useState<QuizQ[] | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => setBest(readBest()), []);
  // The student's own results by district (this device), and a round on
  // their weak districts only.
  const results = useDistrictStats();
  const [focus, setFocus] = useState<string[] | null>(null);

  const quizPlaces = useMemo(
    () => (places.data ?? []).filter((p) => !NO_DISTRICT_QUESTION.has(p[3])),
    [places.data],
  );
  // The saved places a "which district?" question can be asked about.
  const savedUsable = quizPlaces.filter((p) => savedKeys.has(p[0]) && p[6]).length;
  const groupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of quizPlaces) {
      const g = atlasCat(p[3]).group;
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  }, [quizPlaces]);
  const districtName = (en: string) => {
    const d = base.data?.districts.find((x) => x.en === en);
    return d ? (lang === "hi" ? d.hi : d.en) : en;
  };
  const placeName = (p: { en: string; hi: string }) => (lang === "hi" ? p.hi || p.en : p.en);

  const start = (on: string[] | null = focus) => {
    setFocus(on);
    const chosen = quizPlaces
      // Weak districts: every kind of place in them.
      .filter((p) =>
        on ? true : fromSaved ? savedKeys.has(p[0]) : groups.includes(atlasCat(p[3]).group),
      )
      .map((p) => ({
        key: p[0],
        en: p[1],
        hi: p[2],
        cat: p[3],
        lat: p[4],
        lon: p[5],
        district: p[6],
      }));
    setRound(
      quizRound(
        on ? "mix" : mode,
        base.data!.districts,
        chosen,
        Math.random,
        size,
        on ? new Set(on) : undefined,
      ),
    );
    setAt(0);
    setAnswers([]);
  };

  const q = round?.[at];
  const done = !!round && at >= round.length;
  const answered = answers.length > at ? answers[at] : null;
  const answer = (given: string) => {
    if (!q || answered) return;
    setAnswers((a) => [...a, { q, given, right: given === q.district }]);
  };
  const score = answers.filter((a) => a.right).length;
  useEffect(() => {
    if (!done || !round) return;
    recordQuizAnswers(answers.map((a) => ({ district: a.q.district, right: a.right })));
    if (focus) return; // a weak-districts round is not a best score
    const key = `${mode}:${round.length}`;
    const pct = Math.round((score / round.length) * 100);
    const b = readBest();
    if (pct > (b[key] ?? -1)) {
      b[key] = pct;
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(b));
      } catch {
        // A private window: the best score is just not kept.
      }
      setBest(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // The map's colours: the district asked (naming), the answer and a wrong tap.
  const marks = useMemo(() => {
    const m: Record<string, string> = {};
    if (!q) return m;
    if (q.mode === "name") m[q.district] = ASKED;
    if (answered) {
      if (!answered.right && q.mode !== "name") m[answered.given] = BAD;
      m[q.district] = GOOD;
    }
    return m;
  }, [q, answered]);
  const placeDot: PublicPlace[] =
    q?.mode === "where" && answered
      ? [
          [
            q.place.key,
            q.place.en,
            q.place.hi,
            q.place.cat,
            q.place.lat,
            q.place.lon,
            q.district,
            0,
          ],
        ]
      : [];

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
          {L(lang, "मानचित्र क्विज़", "Map quiz")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      {base.isLoading || places.isLoading ? (
        <p className="p-6 text-muted-foreground">
          {L(lang, "मानचित्र खुल रहा है…", "Opening the map…")}
        </p>
      ) : base.error || places.error ? (
        <p className="p-6 text-destructive">
          {L(lang, "मानचित्र नहीं खुल सका।", "The map couldn't open.")}
        </p>
      ) : !round ? (
        <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
          {!fromSaved && Object.keys(results.stats).length > 0 && base.data && (
            <YourDistricts
              lang={lang}
              base={base.data}
              stats={results.stats}
              weak={results.weak}
              districtName={districtName}
              onPractise={() => start(results.weak.slice(0, 6))}
              onClear={results.clear}
            />
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {L(lang, "क्विज़ चुनें", "Choose a quiz")}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => setMode(m.key)}
                  className={`rounded-xl border p-3 text-left ${mode === m.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"}`}
                >
                  <p className="font-semibold">{pickBi(m.name, lang)}</p>
                  <p className="text-sm text-muted-foreground">{pickBi(m.sub, lang)}</p>
                  {best[`${m.key}:${size}`] !== undefined && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {L(lang, "सर्वश्रेष्ठ", "Best")}: {best[`${m.key}:${size}`]}%
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
          {fromSaved && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm" data-quiz-saved>
              {L(
                lang,
                `आपके सहेजे ${savedUsable} स्थानों पर क्विज़`,
                `A quiz on your ${savedUsable} saved places`,
              )}
            </p>
          )}
          {!fromSaved && (mode === "where" || mode === "mix") && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {L(lang, "किन स्थानों से", "Which places")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {ATLAS_GROUPS.filter((g) => groupCount.get(g.key)).map((g) => {
                  const on = groups.includes(g.key);
                  return (
                    <button
                      key={g.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setGroups((x) => (on ? x.filter((k) => k !== g.key) : [...x, g.key]))
                      }
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-transparent text-white" : "border-border"}`}
                      style={on ? { background: g.color } : undefined}
                    >
                      {pickBi(g.name, lang)} · {groupCount.get(g.key)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <section className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">{L(lang, "प्रश्न", "Questions")}</span>
            {[10, 20, 30].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={size === n}
                onClick={() => setSize(n)}
                className={`h-9 w-12 rounded-lg border text-sm ${size === n ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}
              >
                {n}
              </button>
            ))}
          </section>
          <button
            type="button"
            onClick={() => start(null)}
            disabled={(mode === "where" && !groups.length && !fromSaved) || !base.data}
            className="h-11 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {L(lang, "शुरू करें", "Start")}
          </button>
        </main>
      ) : done ? (
        <main className="mx-auto w-full max-w-2xl space-y-5 p-4">
          <div className="rounded-2xl border border-border p-6 text-center">
            <Trophy className="mx-auto h-10 w-10 text-amber-500" />
            {focus && (
              <p className="mt-1 text-sm text-muted-foreground" data-quiz-focus>
                {L(lang, "कमज़ोर जिले", "Weak districts")}: {focus.map(districtName).join(", ")}
              </p>
            )}
            <p className="mt-2 text-3xl font-bold" data-quiz-score>
              {score} / {round.length}
            </p>
            <p className="text-muted-foreground">
              {score === round.length
                ? L(lang, "सब सही! शानदार।", "All right! Excellent.")
                : score >= round.length * 0.7
                  ? L(lang, "बहुत अच्छा।", "Very good.")
                  : L(
                      lang,
                      "नीचे गलतियाँ देखें और फिर से खेलें।",
                      "See the mistakes below and play again.",
                    )}
            </p>
          </div>
          {answers.some((a) => !a.right) && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {L(lang, "गलत उत्तर", "Got wrong")}
              </h2>
              <ul className="space-y-1.5">
                {answers
                  .filter((a) => !a.right)
                  .map((a, i) => (
                    <li key={i} className="rounded-xl border border-border p-3 text-sm">
                      <p>{prompt(a.q, lang, districtName, placeName)}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                        <span className="text-destructive">
                          <X className="mr-0.5 inline h-3 w-3" />
                          {districtName(a.given)}
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          <Check className="mr-0.5 inline h-3 w-3" />
                          {districtName(a.q.district)}
                        </span>
                        <Link
                          to="/atlas/$district"
                          params={{ district: a.q.district }}
                          className="text-primary underline"
                        >
                          {L(lang, "जिला देखें", "See the district")}
                        </Link>
                      </p>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => start()}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              {L(lang, "फिर से खेलें", "Play again")}
            </button>
            <button
              type="button"
              onClick={() => {
                setRound(null);
                setFocus(null);
              }}
              className="h-11 flex-1 rounded-xl border border-border font-semibold"
            >
              {L(lang, "क्विज़ बदलें", "Change quiz")}
            </button>
          </div>
        </main>
      ) : q ? (
        <main className="flex h-[calc(100dvh-53px)] flex-col gap-2 p-2 sm:p-3 lg:mx-auto lg:w-full lg:max-w-5xl">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span data-quiz-progress>
              {at + 1} / {round.length}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((at + (answered ? 1 : 0)) / round.length) * 100}%` }}
              />
            </div>
            <span>
              {L(lang, "अंक", "Score")} {score}
            </span>
          </div>
          <p className="text-lg font-semibold" data-quiz-prompt>
            {prompt(q, lang, districtName, placeName)}
          </p>
          {q.mode === "name" && (
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((o) => {
                const tone = !answered
                  ? "border-border hover:bg-muted"
                  : o === q.district
                    ? "border-emerald-500 bg-emerald-500/10"
                    : o === answered.given
                      ? "border-destructive bg-destructive/10"
                      : "border-border opacity-60";
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={!!answered}
                    onClick={() => answer(o)}
                    className={`h-11 rounded-xl border px-3 text-sm font-medium ${tone}`}
                  >
                    {districtName(o)}
                  </button>
                );
              })}
            </div>
          )}
          <AtlasMap
            base={base.data!}
            places={placeDot}
            lang={lang}
            colour={null}
            overlays={[]}
            selected={placeDot[0]?.[0] ?? null}
            blind
            marks={marks}
            named={answered ? [q.district, answered.given] : []}
            onDistrict={q.mode === "name" ? undefined : answer}
            className="min-h-[260px] flex-1"
          />
          {answered && (
            <div
              className={`flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm ${answered.right ? "bg-emerald-500/10" : "bg-destructive/10"}`}
              data-quiz-feedback={answered.right ? "right" : "wrong"}
            >
              {answered.right ? (
                <Check className="h-5 w-5 text-emerald-600" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )}
              <p className="flex-1">
                {answered.right
                  ? L(lang, "सही!", "Right!")
                  : q.mode === "where"
                    ? L(
                        lang,
                        `${placeName(q.place)} ${districtName(q.district)} जिले में है।`,
                        `${placeName(q.place)} is in ${districtName(q.district)} district.`,
                      )
                    : L(
                        lang,
                        `सही उत्तर: ${districtName(q.district)}`,
                        `The answer: ${districtName(q.district)}`,
                      )}
              </p>
              <button
                type="button"
                onClick={() => setAt((x) => x + 1)}
                className="h-10 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
                ref={(el) => el?.focus({ preventScroll: true })}
              >
                {at + 1 >= round.length ? L(lang, "परिणाम", "Result") : L(lang, "अगला", "Next")}
              </button>
            </div>
          )}
        </main>
      ) : null}
    </div>
  );
}

function prompt(
  q: QuizQ,
  lang: AtlasLang,
  districtName: (en: string) => string,
  placeName: (p: { en: string; hi: string }) => string,
) {
  if (q.mode === "find")
    return L(
      lang,
      `${districtName(q.district)} जिले पर टैप करें`,
      `Tap ${districtName(q.district)} district`,
    );
  if (q.mode === "name")
    return L(lang, "पीले रंग से दिखाया गया जिला कौन-सा है?", "Which district is shown in yellow?");
  const cat = pickBi(atlasCat(q.place.cat).name, lang);
  return L(
    lang,
    `${placeName(q.place)} (${cat}) किस जिले में है? मानचित्र पर टैप करें`,
    `${placeName(q.place)} (${cat.toLowerCase()}) — tap its district`,
  );
}

// The student's results by district on this device: a map coloured by how
// often they got each district right, and a round on the weak ones.
function YourDistricts({
  lang,
  base,
  stats,
  weak,
  districtName,
  onPractise,
  onClear,
}: {
  lang: AtlasLang;
  base: NonNullable<ReturnType<typeof useAtlasBase>["data"]>;
  stats: Record<string, string>;
  weak: string[];
  districtName: (en: string) => string;
  onPractise: () => void;
  onClear: () => void;
}) {
  const marks = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [d, s] of Object.entries(stats)) {
      const { pct } = districtScore(s);
      m[d] = pct >= 85 ? "#86efac" : pct >= WEAK_PCT ? "#fde68a" : "#fca5a5";
    }
    return m;
  }, [stats]);
  const tried = Object.keys(stats).length;
  return (
    <section className="space-y-2 rounded-2xl border border-border p-3" data-your-districts>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {L(lang, "आपके जिले", "Your districts")}
        </h2>
        <button type="button" onClick={onClear} className="ml-auto text-xs underline">
          {L(lang, "परिणाम मिटाएँ", "Clear my results")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {L(
          lang,
          `${tried} जिलों पर आपके पिछले उत्तर (इसी डिवाइस पर): हरा = ठीक, पीला = लगभग, लाल = कमज़ोर।`,
          `Your last answers on ${tried} districts (on this device): green = sure, yellow = nearly, red = weak.`,
        )}
      </p>
      <AtlasMap
        base={base}
        places={[]}
        lang={lang}
        colour={null}
        overlays={[]}
        marks={marks}
        className="h-56"
      />
      {weak.length ? (
        <>
          <div className="flex flex-wrap gap-1">
            {weak.slice(0, 6).map((d) => (
              <span
                key={d}
                className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-500/20 dark:text-red-200"
              >
                {districtName(d)} · {districtScore(stats[d]).pct}%
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onPractise}
            className="h-10 w-full rounded-xl bg-red-600 text-sm font-semibold text-white"
          >
            {L(
              lang,
              `मेरे कमज़ोर जिलों का अभ्यास (${Math.min(weak.length, 6)})`,
              `Practise my weak districts (${Math.min(weak.length, 6)})`,
            )}
          </button>
        </>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {L(lang, "अभी कोई कमज़ोर जिला नहीं। शाबाश!", "No weak districts just now. Well done!")}
        </p>
      )}
    </section>
  );
}
