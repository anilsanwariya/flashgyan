// Admin: the day's skipped news. Articles in the day's sources that no story
// uses, so the editor can read them and make stories from what the AI left
// out. Opening one shows it in the article reader, where highlights become a
// new story at the end of the day.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, EyeOff, Newspaper } from "lucide-react";
import { getCaSkipped, type SkippedArticle } from "@/lib/current-affairs.functions";
import { SourceReader } from "@/components/ca-source-reader";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

const hiddenKey = (date: string) => `ca-skipped-hidden:${date}`;
const rowKey = (a: SkippedArticle) => `${a.source_id}:${a.at}`;

function readHidden(date: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(hiddenKey(date)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeHidden(date: string, hidden: Set<string>) {
  try {
    if (hidden.size) localStorage.setItem(hiddenKey(date), JSON.stringify([...hidden]));
    else localStorage.removeItem(hiddenKey(date));
  } catch {
    // storage unavailable
  }
}

export function SkippedNews({
  date,
  sourceCount,
  onChanged,
}: {
  date: string;
  sourceCount: number;
  onChanged: () => void;
}) {
  const skippedFn = useServerFn(getCaSkipped);
  const [open, setOpen] = useState(false);
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
  useEffect(() => {
    setHidden(readHidden(date));
    setOpen(false);
  }, [date]);

  const articles = useMemo(() => q.data?.articles ?? [], [q.data]);
  const rajasthan = articles.filter((a) => a.rajasthan).length;
  const hiddenHere = articles.filter((a) => hidden.has(rowKey(a))).length;
  const shown = articles.filter(
    (a) => (!onlyRajasthan || a.rajasthan) && (showHidden || !hidden.has(rowKey(a))),
  );
  const toggleHidden = (a: SkippedArticle) =>
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(rowKey(a))) next.delete(rowKey(a));
      else next.add(rowKey(a));
      writeHidden(date, next);
      return next;
    });

  if (!sourceCount) return null;
  const count = q.data ? articles.length - hiddenHere : null;

  return (
    <section className="rounded-2xl border border-border bg-card">
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
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
                        </div>
                        <div className="mt-1 font-semibold leading-snug">{a.title}</div>
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
