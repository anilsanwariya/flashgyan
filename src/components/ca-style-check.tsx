// Admin: the house style check before scheduling. SAATHI reads the day's
// stories against the editor's rules (one AI request; the evening collection
// does it too) and lists each part that breaks one, with the text it suggests.
// One tap puts the fix in (kept in the story's History) or keeps the text.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import {
  applyCaStyleFix,
  dismissCaStyleBreak,
  runCaStyleCheck,
} from "@/lib/current-affairs.functions";
import { CATEGORIES, type CaContent } from "@/lib/current-affairs";
import type { StyleBreak, StyleStatus } from "@/lib/ca-style";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type DayStory = {
  id: string;
  headline: string;
  category: string;
  position: number;
  content: CaContent | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const partLabel = (b: StyleBreak) =>
  `${b.part === "why" ? "Why it matters" : b.part[0].toUpperCase() + b.part.slice(1)} · ${b.lang === "en" ? "English" : "Hindi"}`;

export function StyleCheckDialog({
  date,
  open,
  onOpenChange,
  status,
  checkedAt,
  rules,
  items,
  onChanged,
  onOpenStory,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StyleStatus | null;
  checkedAt: string | null;
  rules: number;
  items: DayStory[];
  onChanged: () => void;
  onOpenStory: (id: string) => void;
}) {
  const runFn = useServerFn(runCaStyleCheck);
  const applyFn = useServerFn(applyCaStyleFix);
  const dismissFn = useServerFn(dismissCaStyleBreak);
  const [busy, setBusy] = useState<string | null>(null);
  // Notes handled while the dialog is open go at once, before the refresh.
  const [handled, setHandled] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setHandled(new Set());
  }, [open]);

  // Grouped by story, in the review list's order.
  const groups = useMemo(() => {
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c.id, i]));
    const stories = [...items].sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.position - b.position,
    );
    const open = (status?.open ?? []).filter((b) => !handled.has(b.id));
    return stories
      .map((s) => ({ story: s, breaks: open.filter((b) => b.item_id === s.id) }))
      .filter((g) => g.breaks.length);
  }, [items, status, handled]);
  const count = groups.reduce((n, g) => n + g.breaks.length, 0);
  const unchecked = status?.unchecked.length ?? 0;

  async function run() {
    setBusy("run");
    try {
      const r = await runFn({ data: { date } });
      toast.success(
        `Checked ${r.checked} ${r.checked === 1 ? "story" : "stories"}: ${r.found ? `${r.found} house style ${r.found === 1 ? "break" : "breaks"} found` : "no breaks found"}${r.left ? `. ${r.left} more to check: press the button again.` : ""}`,
      );
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't check the stories"));
    } finally {
      setBusy(null);
    }
  }

  async function act(b: StyleBreak, kind: "fix" | "keep") {
    setBusy(b.id);
    try {
      if (kind === "fix") await applyFn({ data: { date, id: b.id } });
      else await dismissFn({ data: { date, id: b.id } });
      setHandled((cur) => {
        const next = new Set(cur).add(b.id);
        // A fix changes the text, so other notes on the same text go too.
        if (kind === "fix") {
          for (const x of status?.open ?? []) {
            if (x.item_id === b.item_id && x.part === b.part && x.lang === b.lang) next.add(x.id);
          }
        }
        return next;
      });
      toast.success(kind === "fix" ? "Fixed" : "Kept as it is");
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-5">
        <div className="pr-8">
          <DialogTitle className="text-base">House style check</DialogTitle>
          <DialogDescription className="text-xs">
            The day's stories against your {rules} house style {rules === 1 ? "rule" : "rules"}{" "}
            (Magazine settings → House style). Put SAATHI's fix in, or keep the text when it's fine.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <span className="min-w-[10rem] flex-1 text-muted-foreground">
            {!status?.checked
              ? "Not checked yet. SAATHI reads every written story (one AI request)."
              : `Last checked ${checkedAt ? when(checkedAt) : ""}.${unchecked ? ` ${unchecked} ${unchecked === 1 ? "story" : "stories"} changed or new since.` : ""}`}
          </span>
          {(!status?.checked || unchecked > 0) && (
            <Button size="sm" disabled={!!busy} onClick={() => void run()}>
              {busy === "run" ? (
                <>
                  <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Checking…
                </>
              ) : !status?.checked ? (
                "Check the stories"
              ) : (
                `Check ${unchecked === 1 ? "it" : `these ${unchecked}`}`
              )}
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {status?.checked && !count && (
            <p className="py-6 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
              No house style breaks{unchecked ? " in the stories checked" : ""}.
            </p>
          )}
          {groups.map(({ story, breaks }) => (
            <section key={story.id} data-style-story={story.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <h4 className="min-w-0 flex-1 text-sm font-semibold">
                  {story.content?.headline.en || story.content?.headline.hi || story.headline}
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  disabled={!!busy}
                  onClick={() => {
                    onOpenChange(false);
                    onOpenStory(story.id);
                  }}
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open story
                </Button>
              </div>
              {breaks.map((b) => (
                <div
                  key={b.id}
                  data-style-break={b.id}
                  className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div className="text-xs font-medium text-muted-foreground">{partLabel(b)}</div>
                  <p className="text-xs text-amber-800 dark:text-amber-300">Rule: {b.rule}</p>
                  <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">
                    {b.text}
                  </p>
                  <p className="text-sm font-medium">{b.fix}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={!!busy} onClick={() => void act(b, "fix")}>
                      <Check className="mr-1 h-4 w-4" />
                      {busy === b.id ? "Saving…" : "Apply fix"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void act(b, "keep")}
                    >
                      It's fine
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
