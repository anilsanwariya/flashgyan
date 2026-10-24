// Admin: the monthly's A–Z topic index, on the Monthly page: made from the
// month's stories, its terms checked (removed or renamed), printed at the
// back of the monthly issue with story numbers.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ListOrdered, Pencil, RefreshCw, X } from "lucide-react";
import { getCaIndex, saveCaIndex, stepCaIndex } from "@/lib/ca-index.functions";
import type { IndexEntry, TopicIndex } from "@/lib/ca-index";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function IndexBox({ month }: { month: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaIndex);
  const stepFn = useServerFn(stepCaIndex);
  const saveFn = useServerFn(saveCaIndex);
  const key = ["caIndex", month.slice(0, 7)];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getFn({ data: { month } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [editing, setEditing] = useState<{ at: number; en: string; hi: string } | null>(null);
  const stop = useRef(false);
  const index = q.data ?? null;
  const entries = index?.entries ?? [];

  async function make() {
    stop.current = false;
    try {
      let offset: number | null = 0;
      let total = 0;
      while (offset !== null && !stop.current) {
        setBusy(
          `Making the index… ${total ? `${Math.min(offset, total)} of ${total} stories` : ""}`,
        );
        const r: Awaited<ReturnType<typeof stepFn>> = await stepFn({ data: { month, offset } });
        qc.setQueryData(key, r.index);
        total = r.total;
        offset = r.next;
      }
      toast.success("Index ready");
      setOpen(true);
    } catch (e) {
      toast.error(errorText(e, "Couldn't make the index"));
    } finally {
      setBusy(null);
    }
  }

  async function save(next: IndexEntry[] | null, ok: string) {
    try {
      const saved = await saveFn({
        data: {
          month,
          index: next
            ? { made_at: index?.made_at ?? new Date().toISOString(), entries: next }
            : null,
        },
      });
      qc.setQueryData<TopicIndex | null>(key, saved);
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  }

  const term = find.trim().toLowerCase();
  const shown = entries
    .map((e, at) => ({ e, at }))
    .filter(({ e }) => !term || `${e.term.en} ${e.term.hi}`.toLowerCase().includes(term))
    .sort((a, b) => a.e.term.en.localeCompare(b.e.term.en));

  return (
    <section
      aria-label="Topic index"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start gap-2">
        <ListOrdered className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Index</h3>
          <p className="text-sm text-muted-foreground">
            Schemes, persons, places, organisations, reports and awards, A–Z, with the numbers of
            their stories, on the last pages of the issue.
            {index ? ` ${entries.length} terms.` : " Not made yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void make()}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {index ? "Make again" : "Make the index"}
          </Button>
          {index && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                if (confirm("Take the index out of this month's issue?"))
                  void save(null, "Index taken out");
              }}
            >
              Take out
            </Button>
          )}
        </div>
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {busy}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => (stop.current = true)}>
            Stop
          </Button>
        </p>
      )}
      {index && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-sm font-medium"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Check the terms
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              <Input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find a term"
                aria-label="Find a term"
                className="h-8 sm:max-w-xs"
              />
              <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
                {shown.map(({ e, at }) => (
                  <li
                    key={`${e.term.en}-${at}`}
                    data-term={e.term.en}
                    className="flex items-center gap-2 px-2 py-1"
                  >
                    {editing?.at === at ? (
                      <form
                        className="flex flex-1 flex-wrap gap-1"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          const next = entries.map((x, i) =>
                            i === at
                              ? { ...x, term: { en: editing.en.trim(), hi: editing.hi.trim() } }
                              : x,
                          );
                          setEditing(null);
                          void save(next, "Term saved");
                        }}
                      >
                        <Input
                          aria-label="Term in English"
                          className="h-7 min-w-0 flex-1"
                          value={editing.en}
                          onChange={(ev) => setEditing({ ...editing, en: ev.target.value })}
                        />
                        <Input
                          aria-label="Term in Hindi"
                          className="h-7 min-w-0 flex-1"
                          value={editing.hi}
                          onChange={(ev) => setEditing({ ...editing, hi: ev.target.value })}
                        />
                        <Button
                          size="sm"
                          className="h-7"
                          type="submit"
                          disabled={!editing.en.trim()}
                        >
                          Save
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1">
                          {e.term.en}
                          {e.term.hi !== e.term.en && (
                            <span className="text-muted-foreground" lang="hi">
                              {" "}
                              · {e.term.hi}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {e.kind} · {e.items.length} {e.items.length === 1 ? "story" : "stories"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Edit ${e.term.en}`}
                          onClick={() => setEditing({ at, en: e.term.en, hi: e.term.hi })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${e.term.en}`}
                          onClick={() =>
                            void save(
                              entries.filter((_, i) => i !== at),
                              "Term removed",
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
