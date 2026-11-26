import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { listCaReaderDays } from "@/lib/ca-reader.functions";
import { formatDate } from "@/lib/current-affairs";
import { ReaderHeader, useReaderPrefs } from "@/components/ca-reader";

export const Route = createFileRoute("/current-affairs/")({
  head: () => ({
    meta: [
      { title: "Daily Current Affairs — FlashGyan" },
      {
        name: "description",
        content:
          "Daily current affairs for Rajasthan exams (RPSC, RSSB, RAS) in Hindi and English, with MCQ practice for every day.",
      },
    ],
  }),
  component: DaysPage,
});

function DaysPage() {
  const [prefs, setPrefs] = useReaderPrefs();
  const q = useInfiniteQuery({
    queryKey: ["caReaderDays", prefs.lang],
    queryFn: ({ pageParam }) => listCaReaderDays({ data: { lang: prefs.lang, before: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.more ? (last.days.at(-1)?.date ?? null) : null),
  });
  const days = q.data?.pages.flatMap((p) => p.days) ?? [];
  const hi = prefs.lang === "hi";
  return (
    <div className="min-h-dvh bg-background">
      <ReaderHeader back="/" backLabel={hi ? "होम" : "Home"} prefs={prefs} setPrefs={setPrefs} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-12 pt-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {hi ? "दैनिक करेंट अफेयर्स" : "Daily Current Affairs"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hi
              ? "हर दिन की परीक्षा उपयोगी खबरें, और उन पर MCQ अभ्यास।"
              : "Each day's exam-relevant news, with MCQ practice on it."}
          </p>
        </div>
        {q.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {hi ? "लोड हो रहा है…" : "Loading…"}
          </p>
        ) : q.error ? (
          <p className="text-sm text-destructive">
            {hi ? "दिन लोड नहीं हो सके।" : "Couldn't load the days."}
          </p>
        ) : !days.length ? (
          <p className="text-sm text-muted-foreground">
            {hi ? "अभी कोई दिन उपलब्ध नहीं है।" : "No days yet."}
          </p>
        ) : (
          <ul className="space-y-3" data-days>
            {days.map((d) => (
              <li key={d.date}>
                <Link
                  to="/current-affairs/$date"
                  params={{ date: d.date }}
                  className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(d.date, prefs.lang)}
                    <span className="ml-auto text-xs font-medium text-muted-foreground">
                      {d.count} {hi ? "खबरें" : d.count === 1 ? "story" : "stories"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ul className="mt-2 space-y-1 text-[15px] leading-snug" lang={prefs.lang}>
                    {d.headlines.map((h, i) => (
                      <li key={i} className="line-clamp-2">
                        • {h}
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <button
            type="button"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
            className="mx-auto block rounded-full border border-border px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {q.isFetchingNextPage ? "…" : hi ? "पुराने दिन दिखाएँ" : "Show older days"}
          </button>
        )}
      </main>
    </div>
  );
}
