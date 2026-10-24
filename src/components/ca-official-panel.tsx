// Admin: the official source check. A chip in the story editor (each
// checked fact: confirmed, differs with the official value, or not found),
// and the day's check from the checklist (every story, then the facts that
// differ, to open or keep).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Landmark, RefreshCw } from "lucide-react";
import { checkCaOfficial, keepCaOfficial } from "@/lib/ca-official.functions";
import {
  OFFICIAL_DAY_BATCH,
  OFFICIAL_LABEL,
  factsToCheck,
  officialCounts,
  officialOf,
  type OfficialCheck,
} from "@/lib/ca-official";
import type { CaFact } from "@/lib/current-affairs";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Story = {
  id: string;
  headline: string;
  status?: string;
  facts: CaFact[];
  content?: { headline: { en: string } } | null;
};

const TONE: Record<OfficialCheck["status"], string> = {
  confirmed: "text-emerald-700 dark:text-emerald-400",
  differs: "text-amber-700 dark:text-amber-400",
  not_found: "text-muted-foreground",
};

function CheckLine({
  fact,
  busy,
  onKeep,
}: {
  fact: CaFact;
  busy: boolean;
  onKeep: (kept: boolean) => void;
}) {
  const c = officialOf(fact);
  return (
    <li className="space-y-0.5 border-b border-border/60 pb-1.5 last:border-0">
      <p className="break-words">{fact.text}</p>
      {!c ? (
        <p className="text-xs text-muted-foreground">Not checked yet</p>
      ) : (
        <div className="space-y-0.5 text-xs">
          <p className={TONE[c.status]}>
            {c.status === "differs" && c.kept
              ? "Kept ours after a difference"
              : OFFICIAL_LABEL[c.status]}
            {c.source && (
              <>
                {" · "}
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 underline"
                  >
                    {c.source} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  c.source
                )}
              </>
            )}
          </p>
          {c.status === "differs" && (
            <p className="flex flex-wrap items-center gap-2">
              <span>
                Official: <b>{c.value}</b>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                disabled={busy}
                onClick={() => onKeep(!c.kept)}
              >
                {c.kept ? "Undo keep" : "Keep ours"}
              </Button>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function OfficialChip({
  item,
  disabled,
  onChanged,
}: {
  item: Story;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const checkFn = useServerFn(checkCaOfficial);
  const keepFn = useServerFn(keepCaOfficial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const picked = factsToCheck(item.facts);
  if (!picked.length) return null;
  const n = officialCounts(item.facts);
  const checked = picked.length - n.unchecked;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't check"));
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
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
          n.differs
            ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : checked
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-border text-muted-foreground"
        }`}
      >
        <Landmark className="h-3 w-3" />
        {!checked
          ? "Official check"
          : n.differs
            ? `${n.differs} differ${n.differs === 1 ? "s" : ""} from official`
            : `${n.confirmed} of ${picked.length} confirmed`}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Official source check"
          className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[min(90vw,30rem)] space-y-2 overflow-y-auto rounded-xl border border-border bg-popover p-3 text-sm shadow-lg"
        >
          <p className="text-xs text-muted-foreground">
            Names, amounts, dates and posts compared with SAATHI's books (Economic Review and
            others) and government websites (PIB, DIPR…).
          </p>
          <ul className="space-y-1.5">
            {picked.map((i) => (
              <CheckLine
                key={i}
                fact={item.facts[i]}
                busy={busy || !!disabled}
                onKeep={(kept) =>
                  void run(() => keepFn({ data: { item_id: item.id, index: i, kept } }))
                }
              />
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || disabled}
            onClick={() =>
              void run(
                () => checkFn({ data: { item_id: item.id } }),
                "Checked with official sources",
              )
            }
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {checked ? "Check again" : "Check now"}
          </Button>
        </div>
      )}
    </span>
  );
}

// The day's check: stories with facts not checked yet, a few at a time, then
// the facts that differ.
export function OfficialDayDialog({
  open,
  onOpenChange,
  items,
  onOpenStory,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Story[];
  onOpenStory: (id: string) => void;
  onChanged: () => void;
}) {
  const checkFn = useServerFn(checkCaOfficial);
  const keepFn = useServerFn(keepCaOfficial);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const stories = items.filter((i) => i.status === "included" && factsToCheck(i.facts).length);
  const todo = stories.filter((s) => officialCounts(s.facts).unchecked);
  const differ = stories.flatMap((s) =>
    factsToCheck(s.facts)
      .filter((i) => officialOf(s.facts[i])?.status === "differs")
      .map((i) => ({ story: s, index: i })),
  );
  const runAll = async (list: Story[]) => {
    setProgress({ done: 0, total: list.length });
    let failed = 0;
    for (let at = 0; at < list.length; at += OFFICIAL_DAY_BATCH) {
      const part = list.slice(at, at + OFFICIAL_DAY_BATCH);
      const res = await Promise.allSettled(part.map((s) => checkFn({ data: { item_id: s.id } })));
      failed += res.filter((r) => r.status === "rejected").length;
      setProgress({ done: Math.min(list.length, at + part.length), total: list.length });
    }
    setProgress(null);
    onChanged();
    if (failed) toast.error(`${failed} stor${failed === 1 ? "y" : "ies"} couldn't be checked`);
    else toast.success("Checked with official sources");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogTitle>Official source check</DialogTitle>
        <p className="text-sm text-muted-foreground">
          The day's names, amounts, dates and posts compared with SAATHI's books (Economic Review
          and others) and government websites (PIB, DIPR…).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!!progress || !todo.length} onClick={() => void runAll(todo)}>
            {todo.length
              ? `Check ${todo.length} stor${todo.length === 1 ? "y" : "ies"} not checked`
              : "Every story is checked"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!progress || !stories.length}
            onClick={() => void runAll(stories)}
          >
            Check all again
          </Button>
          {progress && (
            <span className="text-sm text-muted-foreground" role="status">
              Checking {progress.done} of {progress.total}…
            </span>
          )}
        </div>
        {differ.length ? (
          <ul className="space-y-3">
            {differ.map(({ story, index }) => (
              <li key={`${story.id}:${index}`} className="rounded-lg border border-border p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {story.content?.headline.en || story.headline}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onOpenStory(story.id)}>
                    Open
                  </Button>
                </div>
                <ul className="text-sm">
                  <CheckLine
                    fact={story.facts[index]}
                    busy={busy || !!progress}
                    onKeep={async (kept) => {
                      setBusy(true);
                      try {
                        await keepFn({ data: { item_id: story.id, index, kept } });
                        onChanged();
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't save"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {stories.length - todo.length
              ? "No checked fact differs from the official sources."
              : "Nothing checked yet."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
