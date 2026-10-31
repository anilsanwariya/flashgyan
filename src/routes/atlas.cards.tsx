import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Layers } from "lucide-react";
import { atlasCardsFn } from "@/lib/atlas.functions";
import { pickBi, type AtlasLang } from "@/lib/atlas";
import {
  NEW_PER_DAY,
  afterRating,
  dayOf,
  ratingDays,
  todaysCards,
  type Rating,
  type Schedule,
} from "@/lib/atlas-cards";
import { readSchedule, writeSchedule } from "@/lib/atlas-device";
import { useAtlasCards } from "@/components/atlas-data";
import { LangToggle, useAtlasLang } from "@/components/atlas-ui";

export const Route = createFileRoute("/atlas/cards")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rajasthan Atlas Revision Cards — FlashGyan" },
      {
        name: "description",
        content:
          "Revise Rajasthan's geography and polity for RPSC and RSSB exams with flashcards that come back just before you forget them.",
      },
    ],
  }),
  component: CardsPage,
});

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);
type Card = Awaited<ReturnType<typeof atlasCardsFn>>[number];

const RATINGS: { r: Rating; en: string; hi: string; tone: string }[] = [
  { r: "again", en: "Forgot", hi: "भूल गए", tone: "border-red-300 bg-red-50 dark:bg-red-500/10" },
  { r: "hard", en: "Hard", hi: "कठिन", tone: "border-amber-300 bg-amber-50 dark:bg-amber-500/10" },
  {
    r: "good",
    en: "Knew it",
    hi: "याद था",
    tone: "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10",
  },
  { r: "easy", en: "Easy", hi: "आसान", tone: "border-sky-300 bg-sky-50 dark:bg-sky-500/10" },
];
const inDays = (n: number, lang: AtlasLang) =>
  n <= 0 ? L(lang, "अभी", "now") : lang === "hi" ? `${n} दिन` : `${n}d`;

function CardsPage() {
  const [lang, setLang] = useAtlasLang();
  const q = useAtlasCards();
  const [sch, setSch] = useState<Schedule>({ cards: {}, day: "", fresh: 0 });
  useEffect(() => setSch(readSchedule()), []);
  const [chapter, setChapter] = useState("");
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const today = dayOf(new Date());
  const all = useMemo(
    () => (q.data ?? []).filter((c) => !chapter || c.chapter === chapter),
    [q.data, chapter],
  );
  const chapters = useMemo(() => [...new Set((q.data ?? []).map((c) => c.chapter))], [q.data]);
  const t = todaysCards(all, sch, today);
  const known = Object.keys(sch.cards).length;
  const next = Object.values(sch.cards)
    .map((c) => c.due)
    .filter((d) => d > today)
    .sort()[0];

  const rate = (r: Rating) => {
    if (!queue?.length) return;
    const [card, ...rest] = queue;
    const s = afterRating(sch, card.key, r, today);
    setSch(s);
    writeSchedule(s);
    setFlipped(false);
    setDone((n) => n + 1);
    // Forgotten: once more at the end of today's round.
    setQueue(r === "again" ? [...rest, card] : rest);
  };
  const card = queue?.[0];

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
          {L(lang, "दोहराव कार्ड", "Revision cards")}
        </h1>
        <div className="ml-auto">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 p-4">
        {q.isLoading ? (
          <p className="text-muted-foreground">
            {L(lang, "कार्ड खुल रहे हैं…", "Opening the cards…")}
          </p>
        ) : q.error ? (
          <p className="text-destructive">
            {L(lang, "कार्ड नहीं खुल सके।", "The cards couldn't open.")}
          </p>
        ) : card ? (
          <section className="space-y-3" data-card={card.key}>
            <p className="text-xs text-muted-foreground" data-cards-left>
              {card.chapter} · {L(lang, `${queue!.length} बाकी`, `${queue!.length} left`)}
            </p>
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="block min-h-48 w-full rounded-2xl border border-border bg-[#fffaf0] p-5 text-left shadow-sm dark:bg-white/5"
            >
              <p className="text-lg font-semibold" data-card-front>
                {pickBi(card.front, lang)}
              </p>
              {flipped ? (
                <p className="mt-3 whitespace-pre-line border-t border-border pt-3" data-card-back>
                  {pickBi(card.back, lang)}
                </p>
              ) : (
                <p className="mt-6 text-sm text-primary">
                  {L(lang, "उत्तर देखने के लिए टैप करें", "Tap to see the answer")}
                </p>
              )}
            </button>
            {flipped && (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((x) => (
                  <button
                    key={x.r}
                    type="button"
                    onClick={() => rate(x.r)}
                    className={`rounded-xl border px-1 py-2 text-center text-sm font-medium ${x.tone}`}
                  >
                    {pickBi(x, lang)}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {inDays(ratingDays(sch.cards[card.key], today)[x.r], lang)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            {queue && (
              <div className="rounded-2xl border border-border p-5 text-center" data-cards-done>
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                <p className="mt-2 font-semibold">
                  {L(lang, `आज के ${done} कार्ड पूरे!`, `${done} cards done for today!`)}
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-border p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Layers className="h-4 w-4" />
                {L(lang, "आज", "Today")}
              </p>
              <p className="mt-1 text-sm" data-cards-today>
                {L(
                  lang,
                  `${t.due.length} दोहराने हैं · ${t.fresh.length} नए`,
                  `${t.due.length} to revise · ${t.fresh.length} new`,
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {L(
                  lang,
                  `याद किया कार्ड बाद में (1, 3, 7, 16, 35 दिन) लौटता है, भूला हुआ जल्दी। रोज़ ${NEW_PER_DAY} नए कार्ड। आपकी प्रगति इसी डिवाइस पर रहती है। ${known} कार्ड शुरू किए।`,
                  `A card you know comes back later (1, 3, 7, 16, 35 days), one you forget sooner. ${NEW_PER_DAY} new cards a day. Your progress stays on this device. ${known} cards started.`,
                )}
              </p>
              {chapters.length > 1 && (
                <select
                  aria-label={L(lang, "अध्याय", "Chapter")}
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  className="mt-3 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value="">{L(lang, "सभी अध्याय", "All chapters")}</option>
                  {chapters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={!t.due.length && !t.fresh.length}
                onClick={() => {
                  setQueue([...t.due, ...t.fresh]);
                  setDone(0);
                  setFlipped(false);
                }}
                className="mt-3 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t.due.length || t.fresh.length
                  ? L(
                      lang,
                      `शुरू करें (${t.due.length + t.fresh.length})`,
                      `Start (${t.due.length + t.fresh.length})`,
                    )
                  : L(lang, "आज के लिए सब पूरा", "All done for today")}
              </button>
              {!t.due.length && !t.fresh.length && next && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {L(lang, "अगला कार्ड", "Next card")}: {next}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
