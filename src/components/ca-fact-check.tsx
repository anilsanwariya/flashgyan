// Admin: fact-check mode. Steps through every fact of the day marked "to
// check", each beside what its source says (the quote with the words around
// it, or, when the source doesn't have those words, its closest sentence).
// One tap marks it checked; the printed point can be corrected first, or the
// point removed.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  checkCaFact,
  deleteCaPoint,
  getCaFactChecks,
  type FactCheck,
} from "@/lib/current-affairs.functions";
import type { Bi } from "@/lib/current-affairs";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const keyOf = (f: FactCheck) => `${f.item_id}|${f.text}`;

export function FactCheckDialog({
  date,
  open,
  onOpenChange,
  onChanged,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const listFn = useServerFn(getCaFactChecks);
  const checkFn = useServerFn(checkCaFact);
  const deleteFn = useServerFn(deleteCaPoint);
  const q = useQuery({
    queryKey: ["caFactChecks", date],
    queryFn: () => listFn({ data: { date } }),
    enabled: open,
    staleTime: 0,
  });
  // Facts handled while the dialog is open drop out of the list at once.
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [at, setAt] = useState(0);
  const [edit, setEdit] = useState<Bi | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setHandled(new Set());
    setAt(0);
    setEdit(null);
  }, [open]);

  const list = useMemo(
    () => (q.data ?? []).filter((f) => !handled.has(keyOf(f))),
    [q.data, handled],
  );
  const total = q.data?.length ?? 0;
  const pos = Math.min(at, Math.max(0, list.length - 1));
  const fact = list[pos];
  useEffect(() => setEdit(null), [fact?.item_id, fact?.text]);

  async function act(kind: "check" | "save" | "remove") {
    if (!fact) return;
    if (kind === "remove" && !confirm("Remove this point and its fact from the story?")) return;
    setBusy(true);
    try {
      if (kind === "remove") await deleteFn({ data: { id: fact.item_id, text: fact.text } });
      else {
        await checkFn({
          data: {
            id: fact.item_id,
            text: fact.text,
            ...(kind === "save" && edit ? { point: edit } : {}),
          },
        });
      }
      // The next fact takes this one's place.
      setHandled((cur) => new Set(cur).add(keyOf(fact)));
      toast.success(
        kind === "remove"
          ? "Point removed"
          : kind === "save"
            ? "Point fixed and checked"
            : "Checked",
      );
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-5">
        <div className="pr-8">
          <DialogTitle className="text-base">Check facts</DialogTitle>
          <DialogDescription className="text-xs">
            Each fact marked “to check”, beside what its source says.
          </DialogDescription>
        </div>
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {errorText(q.error, "Couldn't load the facts")}
          </p>
        ) : !fact ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {total ? "All facts are checked." : "No facts to check for this day."}
            </p>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span aria-live="polite" data-testid="fact-pos">
                  {pos + 1} of {list.length} left
                </span>
                <span className="min-w-0 flex-1 truncate text-right">{fact.headline}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${total ? ((total - list.length) / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm"
              data-testid="fact-card"
            >
              <section>
                <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  The fact
                </h3>
                <p className="font-medium">{fact.text}</p>
                {fact.note && <p className="text-xs italic text-primary">Note: {fact.note}</p>}
              </section>

              {fact.point && (
                <section>
                  <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Printed point
                  </h3>
                  {edit ? (
                    <div className="space-y-1.5">
                      <Textarea
                        lang="hi"
                        aria-label="Point in Hindi"
                        rows={2}
                        value={edit.hi}
                        onChange={(e) => setEdit({ ...edit, hi: e.target.value })}
                      />
                      <Textarea
                        aria-label="Point in English"
                        rows={2}
                        value={edit.en}
                        onChange={(e) => setEdit({ ...edit, en: e.target.value })}
                      />
                    </div>
                  ) : (
                    <>
                      {fact.point.hi && <p lang="hi">{fact.point.hi}</p>}
                      {fact.point.en && <p className="text-muted-foreground">{fact.point.en}</p>}
                    </>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-border bg-muted/30 p-3">
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  The source{fact.source ? ` · ${fact.source.name || fact.source.title}` : ""}
                </h3>
                {fact.found ? (
                  <p data-testid="fact-source" className="leading-relaxed">
                    {fact.found.before}
                    {fact.found.before ? " " : ""}
                    <mark className="rounded bg-amber-300/60 px-0.5 dark:bg-amber-500/40">
                      {fact.found.quote}
                    </mark>
                    {/^[\s,.;:!?।)]/.test(fact.found.after) ? "" : " "}
                    {fact.found.after}
                  </p>
                ) : (
                  <div className="space-y-2" data-testid="fact-source">
                    <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {fact.source
                        ? "These words aren't in the source as written:"
                        : "The source of this fact is no longer here."}
                    </p>
                    <p className="italic text-muted-foreground">“{fact.quote}”</p>
                    {fact.source && (
                      <>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Closest sentence in the source
                        </h4>
                        <p>{fact.closest ?? "No similar sentence found. Check it elsewhere."}</p>
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Previous fact"
                disabled={busy || pos === 0}
                onClick={() => setAt(pos - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void act("remove")}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Remove point
              </Button>
              {fact.point &&
                (edit ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setEdit(null)}>
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEdit({ ...fact.point! })}
                  >
                    <Pencil className="mr-1 h-4 w-4" /> Fix point
                  </Button>
                ))}
              <div className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  disabled={busy || (!!edit && !edit.en.trim() && !edit.hi.trim())}
                  onClick={() => void act(edit ? "save" : "check")}
                >
                  <Check className="mr-1 h-4 w-4" /> {edit ? "Save and mark checked" : "Checked"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Next fact"
                  disabled={busy || pos >= list.length - 1}
                  onClick={() => setAt(pos + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
