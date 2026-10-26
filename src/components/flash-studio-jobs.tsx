// The card studio's running AI job, shown at the top of the studio with
// its progress and Stop.
import { Pause } from "lucide-react";
import { stopStudioJob, useStudioJob } from "@/lib/flash-jobs";
import { Button } from "@/components/ui/button";

// The running job, at the top of the studio.
export function StudioJobBar() {
  const j = useStudioJob();
  if (!j) return null;
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
  return (
    <div
      role="status"
      aria-label="AI job"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span className="font-medium">{j.label}</span>
      <span className="truncate text-muted-foreground" lang="hi">
        {j.topic}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {j.done}/{j.total}
      </span>
      {j.found && <span className="text-amber-700 dark:text-amber-400">{j.found}</span>}
      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <Button size="sm" variant="ghost" className="h-7" onClick={stopStudioJob}>
        <Pause className="mr-1 h-4 w-4" /> Stop
      </Button>
      <span className="basis-full text-xs text-muted-foreground">
        Keeps going while you work here; closing or refreshing the page stops it (run it again to
        continue).
      </span>
    </div>
  );
}
