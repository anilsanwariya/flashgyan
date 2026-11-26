import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Target } from "lucide-react";
import { getCaReaderDay } from "@/lib/ca-reader.functions";
import { formatDate } from "@/lib/current-affairs";
import {
  DayStories,
  READER_FONTS,
  ReaderHeader,
  useReaderPrefs,
  type ReaderSectionRef,
} from "@/components/ca-reader";

export const Route = createFileRoute("/current-affairs/$date")({
  head: ({ params }) => ({
    meta: [
      { title: `Current Affairs ${params.date} — FlashGyan` },
      {
        name: "description",
        content: `Current affairs of ${params.date} for Rajasthan exams, in Hindi and English, with MCQ practice.`,
      },
    ],
    links: [{ rel: "stylesheet", href: READER_FONTS }],
  }),
  component: DayPage,
});

// A story asked for by the link: "#story-3".
const storyFromHash = () => {
  if (typeof window === "undefined") return null;
  const m = /^#story-(\d{1,3})$/.exec(window.location.hash);
  return m ? Number(m[1]) : null;
};

function DayPage() {
  const { date } = Route.useParams();
  const [prefs, setPrefs] = useReaderPrefs();
  const hi = prefs.lang === "hi";
  const q = useQuery({
    queryKey: ["caReaderDay", date, prefs.lang],
    queryFn: () => getCaReaderDay({ data: { date, lang: prefs.lang } }),
  });
  const [sections, setSections] = useState<ReaderSectionRef[]>([]);
  const [story, setStory] = useState<number | null>(null);
  useEffect(() => setStory(storyFromHash()), [date]);
  const day = q.data;
  return (
    <div className={`min-h-dvh ${prefs.dark ? "bg-slate-950 text-slate-100" : "bg-muted/30"}`}>
      <ReaderHeader
        back="/current-affairs"
        backLabel={hi ? "सभी दिन" : "All days"}
        prefs={prefs}
        setPrefs={setPrefs}
        showSize
      />
      {sections.length > 1 && (
        <nav
          aria-label={hi ? "खंड" : "Sections"}
          className={`sticky top-[57px] z-40 border-b border-border/40 backdrop-blur-xl ${prefs.dark ? "bg-slate-950/85" : "bg-background/85"}`}
        >
          <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
            {sections.map((s) => (
              <button
                key={s.cat}
                type="button"
                onClick={() => s.el.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-sm font-medium"
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <main className="mx-auto max-w-2xl px-3 pb-16 pt-4">
        <h1 className="mb-3 px-1 text-xl font-extrabold tracking-tight">
          {hi ? "करेंट अफेयर्स" : "Current Affairs"} · {formatDate(date, prefs.lang)}
        </h1>
        {q.isLoading ? (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
          </p>
        ) : q.error ? (
          <p className="px-1 text-sm text-destructive">
            {hi ? "यह दिन लोड नहीं हो सका।" : "Couldn't load this day."}
          </p>
        ) : !day ? (
          <p className="px-1 text-sm text-muted-foreground">
            {hi ? "यह दिन उपलब्ध नहीं है।" : "This day isn't available."}{" "}
            <Link to="/current-affairs" className="text-primary underline">
              {hi ? "सभी दिन देखें" : "See all days"}
            </Link>
          </p>
        ) : (
          <>
            <DayStories
              html={day.html}
              lang={prefs.lang}
              size={prefs.size}
              dark={prefs.dark}
              story={story}
              onSections={setSections}
            />
            {day.practiceTestId && (
              <Link
                to="/practice-mcq/$testId"
                params={{ testId: day.practiceTestId }}
                className="mt-4 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-sm"
                data-practice
              >
                <Target className="h-6 w-6 shrink-0" />
                <span className="flex-1">
                  <span className="block text-lg font-bold">
                    {hi ? "आज के MCQ हल करें" : "Practise today's MCQs"}
                  </span>
                  <span className="block text-sm text-primary-foreground/85">
                    {hi
                      ? "तुरंत उत्तर और व्याख्या के साथ"
                      : "With instant answers and explanations"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5" />
              </Link>
            )}
            <div className="mt-4 flex justify-between gap-3">
              {day.older ? (
                <Link
                  to="/current-affairs/$date"
                  params={{ date: day.older }}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-semibold"
                >
                  <ChevronLeft className="h-4 w-4" /> {formatDate(day.older, prefs.lang)}
                </Link>
              ) : (
                <span />
              )}
              {day.newer && (
                <Link
                  to="/current-affairs/$date"
                  params={{ date: day.newer }}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-semibold"
                >
                  {formatDate(day.newer, prefs.lang)} <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
