// Admin: the day's skipped news. Articles in the day's sources that no story
// uses, so the editor can read them and make stories from what the AI left
// out, most exam-worthy first once ranked. Opening one shows it in the article
// reader, where highlights become a new story at the end of the day.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, ChevronDown, EyeOff, Newspaper, RefreshCw, Sparkles } from "lucide-react";
import {
  getCaSkipped,
  rankCaSkipped,
  setCaSkippedHidden,
  type SkippedArticle,
} from "@/lib/current-affairs.functions";
import { SourceReader } from "@/components/ca-source-reader";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

const hiddenKey = (date: string) => `ca-skipped-hidden:${date}`;
const SCORES = [
  { label: "Not exam material", tone: "muted" },
  { label: "Low exam value", tone: "muted" },
  { label: "Useful", tone: "primary" },
  { label: "High exam value", tone: "good" },
] as const;
const rowKey = (a: SkippedArticle) => `${a.source_id}:${a.at}`;

// "Not needed" used to be kept on the device; those marks move to the
// server (where every device sees them) the first time the list loads.
function takeDeviceHidden(date: string): string[] {
  try {
    const keys = JSON.parse(localStorage.getItem(hiddenKey(date)) ?? "[]") as string[];
    localStorage.removeItem(hiddenKey(date));
    return keys;
  } catch {
    return [];
  }
}

export function SkippedNews({
  date,
  sourceCount,
  onChanged,
  openSignal = 0,
  onStats,
}: {
  date: string;
  sourceCount: number;
  onChanged: () => void;
  // Changes when the day's checklist asks to show the list.
  openSignal?: number;
  // Articles worth a story and not ranked yet (both without those marked
  // "not needed"), once the list has loaded; for the day's checklist.
  onStats?: (stats: { worth: number; unranked: number } | null) => void;
}) {
  const skippedFn = useServerFn(getCaSkipped);
  const rankFn = useServerFn(rankCaSkipped);
  const hideFn = useServerFn(setCaSkippedHidden);
  const [open, setOpen] = useState(false);
  const [ranking, setRanking] = useState(false);
  // Most exam-worthy first, or in the order of the papers.
  const [byValue, setByValue] = useState(true);
  const [worthOnly, setWorthOnly] = useState(false);
  const q = useQuery({
    // Under "caDay", so it refreshes with the day's stories.
    queryKey: ["caDay", date, "skipped"],
    queryFn: () => skippedFn({ data: { date } }),
    enabled: open && sourceCount > 0,
  });
  const [onlyRajasthan, setOnlyRajasthan] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // The article being read stays set while the reader closes.
  const [reading, setReading] = useState<SkippedArticle | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [date]);
  // "Not needed" as the server has it (every device), plus marks moved from
  // this device.
  useEffect(() => {
    if (!q.data) return;
    const server = q.data.articles.filter((a) => a.hidden).map(rowKey);
    const listed = new Set(q.data.articles.map(rowKey));
    const moved = takeDeviceHidden(date).filter((k) => listed.has(k) && !server.includes(k));
    setHidden(new Set([...server, ...moved]));
    if (moved.length) {
      void hideFn({ data: { date, keys: moved, hidden: true } }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    requestAnimationFrame(() =>
      boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [openSignal]);
  useEffect(() => {
    const list = q.data?.articles.filter((a) => !hidden.has(rowKey(a)));
    onStats?.(
      list
        ? {
            worth: list.filter((a) => (a.rank?.score ?? 0) >= 2).length,
            unranked: list.filter((a) => !a.rank).length,
          }
        : null,
    );
  }, [q.data, hidden, onStats]);

  const articles = useMemo(() => q.data?.articles ?? [], [q.data]);
  const rajasthan = articles.filter((a) => a.rajasthan).length;
  const hiddenHere = articles.filter((a) => hidden.has(rowKey(a))).length;
  const ranked = articles.filter((a) => a.rank).length;
  const visible = articles.filter((a) => !hidden.has(rowKey(a)));
  const worth = visible.filter((a) => (a.rank?.score ?? 0) >= 2).length;
  // Articles marked "not needed" are not ranked.
  const unranked = visible.filter((a) => !a.rank).length;
  const shown = useMemo(() => {
    const list = articles.filter(
      (a) =>
        (!onlyRajasthan || a.rajasthan) &&
        (!worthOnly || (a.rank?.score ?? 0) >= 2) &&
        (showHidden || !hidden.has(rowKey(a))),
    );
    // Not ranked yet sits between useful and low.
    const value = (a: SkippedArticle) => (a.rank ? a.rank.score : 1.5);
    return byValue && ranked ? [...list].sort((a, b) => value(b) - value(a)) : list;
  }, [articles, onlyRajasthan, worthOnly, showHidden, hidden, byValue, ranked]);

  async function rank() {
    setRanking(true);
    try {
      const r = await rankFn({ data: { date } });
      toast.success(
        `Ranked ${r.ranked} article${r.ranked === 1 ? "" : "s"}${r.left ? ` · ${r.left} more to rank` : ""}`,
      );
      setByValue(true);
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e, "Couldn't rank the articles"));
    } finally {
      setRanking(false);
    }
  }
  // Shown at once; saved for every device.
  function toggleHidden(a: SkippedArticle) {
    const key = rowKey(a);
    const hide = !hidden.has(key);
    const flip = (on: boolean) =>
      setHidden((cur) => {
        const next = new Set(cur);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });
    flip(hide);
    hideFn({ data: { date, keys: [key], hidden: hide } }).catch((e) => {
      flip(!hide);
      toast.error(errorText(e, "Couldn't save"));
    });
  }

  if (!sourceCount) return null;
  const count = q.data ? articles.length - hiddenHere : null;

  return (
    <section ref={boxRef} className="scroll-mt-20 rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Newspaper className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Skipped news{count !== null ? ` (${count})` : ""}</div>
          <div className="text-xs text-muted-foreground">
            Articles in today's sources that no story uses. Read one and highlight its facts to add
            it as a story.
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-3 sm:p-4">
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking the day's sources…</p>
          ) : q.error ? (
            <p className="text-sm text-destructive">{errorText(q.error, "Couldn't check")}</p>
          ) : (
            <>
              {articles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {unranked > 0 && (
                    <Button size="sm" disabled={ranking} onClick={() => void rank()}>
                      {ranking ? (
                        <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-4 w-4" />
                      )}
                      {ranking
                        ? "Ranking…"
                        : ranked
                          ? `Rank ${unranked} new`
                          : "Rank by exam value"}
                    </Button>
                  )}
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {ranked
                      ? `${worth} of ${articles.length} worth a story.`
                      : "SAATHI rates each article for the RAS exam, so you read the important ones first (one AI request)."}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {ranked > 0 && (
                  <>
                    <button
                      type="button"
                      aria-pressed={byValue}
                      onClick={() => setByValue((v) => !v)}
                      className={`rounded-full border px-3 py-1 font-medium ${byValue ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      {byValue ? "Most exam value first" : "Paper order"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={worthOnly}
                      onClick={() => setWorthOnly((v) => !v)}
                      className={`rounded-full border px-3 py-1 font-medium ${worthOnly ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}
                    >
                      Worth a story ({worth})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-pressed={onlyRajasthan}
                  onClick={() => setOnlyRajasthan((v) => !v)}
                  className={`rounded-full border px-3 py-1 font-medium ${onlyRajasthan ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground"}`}
                >
                  Rajasthan only ({rajasthan})
                </button>
                {hiddenHere > 0 && (
                  <button
                    type="button"
                    aria-pressed={showHidden}
                    onClick={() => setShowHidden((v) => !v)}
                    className={`rounded-full border px-3 py-1 font-medium ${showHidden ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    Show {hiddenHere} marked not needed
                  </button>
                )}
                {(q.data?.reading ?? 0) > 0 && (
                  <span className="text-muted-foreground">
                    {q.data!.reading} source(s) still being read are not checked yet.
                  </span>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {articles.length
                    ? "Nothing left here."
                    : "Every article in the day's sources is used by a story."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {shown.map((a) => {
                    const off = hidden.has(rowKey(a));
                    return (
                      <li
                        key={rowKey(a)}
                        data-skipped={a.title}
                        className={`rounded-xl border border-border p-3 ${off ? "opacity-60" : ""}`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="min-w-0 truncate">
                            {a.source_name || a.source_title}
                            {a.page !== null ? ` · Page ${a.page}` : ""}
                          </span>
                          <Badge>{a.words} words</Badge>
                          {a.rajasthan && <Badge tone="warn">Rajasthan</Badge>}
                          {a.rank && (
                            <Badge tone={SCORES[a.rank.score].tone}>
                              {SCORES[a.rank.score].label}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 font-semibold leading-snug">{a.title}</div>
                        {a.rank?.why && (
                          <p
                            data-rank-why
                            className={`mt-0.5 text-xs font-medium ${a.rank.score >= 2 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
                          >
                            {a.rank.why}
                          </p>
                        )}
                        {a.preview && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                            {a.preview}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReading(a);
                              setReaderOpen(true);
                            }}
                          >
                            <BookOpen className="mr-1 h-4 w-4" /> Read and highlight
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleHidden(a)}>
                            <EyeOff className="mr-1 h-4 w-4" />
                            {off ? "Show again" : "Not needed"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <SourceReader
        item={null}
        origin={reading ? { source_id: reading.source_id, at: reading.at } : null}
        open={readerOpen && !!reading}
        onOpenChange={setReaderOpen}
        onChanged={onChanged}
      />
    </section>
  );
}
