// Admin: a report's or an appointment's history line in the story editor
// ("Over the years: …", "On this post before: …"), to check, edit, make
// again or clear.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, RefreshCw } from "lucide-react";
import { getCaHistory, remakeCaHistory, setCaHistory } from "@/lib/ca-history.functions";
import { HISTORY_LABEL } from "@/lib/ca-history";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function HistoryChip({ itemId, disabled }: { itemId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaHistory);
  const remakeFn = useServerFn(remakeCaHistory);
  const setFn = useServerFn(setCaHistory);
  const q = useQuery({
    queryKey: ["caHistory", itemId],
    queryFn: () => getFn({ data: { item_id: itemId } }),
    refetchOnMount: true,
  });
  const kind = q.data?.kind ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ en: string; hi: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!kind) return null;
  const h = q.data?.history;
  const has = !!h && !!(h.en || h.hi);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      const history = await fn();
      qc.setQueryData(["caHistory", itemId], { kind, history });
      toast.success(ok);
      setDraft(null);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${has ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
      >
        <CalendarClock className="h-3 w-3" /> {HISTORY_LABEL[kind].en}
        {!has && " (none)"}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={HISTORY_LABEL[kind].en}
          className="absolute left-0 top-full z-30 mt-1 w-[min(90vw,28rem)] space-y-2 rounded-xl border border-border bg-popover p-3 text-sm shadow-lg"
        >
          <p className="text-xs text-muted-foreground">
            {kind === "report"
              ? "India's (and Rajasthan's) rank in this and earlier editions, printed under the story. Made only from this story's facts and earlier stories on the same report."
              : "Who held this post before, printed under the story. Made only from this story's facts and earlier stories on the same post."}
          </p>
          {draft ? (
            <>
              <Textarea
                aria-label="History in English"
                rows={2}
                value={draft.en}
                onChange={(e) => setDraft({ ...draft, en: e.target.value })}
              />
              <Textarea
                aria-label="History in Hindi"
                rows={2}
                value={draft.hi}
                onChange={(e) => setDraft({ ...draft, hi: e.target.value })}
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={busy || disabled}
                  onClick={() =>
                    void run(
                      () =>
                        setFn({
                          data: {
                            item_id: itemId,
                            line: draft.en.trim() || draft.hi.trim() ? draft : null,
                          },
                        }),
                      "Saved",
                    )
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              {has ? (
                <div className="space-y-1">
                  <p className="break-words">{h!.en}</p>
                  <p className="break-words text-muted-foreground" lang="hi">
                    {h!.hi}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Nothing earlier in this story's facts or the magazine's earlier stories.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || disabled}
                  onClick={() => setDraft({ en: h?.en ?? "", hi: h?.hi ?? "" })}
                >
                  {has ? "Edit" : "Write one"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || disabled}
                  onClick={() =>
                    void run(() => remakeFn({ data: { item_id: itemId } }), "Made again")
                  }
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Make
                  again
                </Button>
                {has && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || disabled}
                    onClick={() =>
                      void run(() => setFn({ data: { item_id: itemId, line: null } }), "Taken off")
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
