// The card studio's running AI jobs: the one in this page, shown at the top
// of the studio with its progress and Stop, and a topic's jobs on the server.
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pause, Server } from "lucide-react";
import { stopStudioJob, useStudioJob } from "@/lib/flash-jobs";
import { listFlashServerJobs, stopFlashServerJob } from "@/lib/flash-studio.functions";
import { errorText } from "@/components/ca-ui";
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

// The topic's AI jobs on the server: running ones with their progress and
// Stop, and the last finished one for a while. Looked at every 10 seconds
// while one runs; the cards are reloaded as it goes.
export function ServerJobsBar({
  topicId,
  onProgress,
}: {
  topicId: string;
  onProgress: () => void;
}) {
  const listFn = useServerFn(listFlashServerJobs);
  const stopFn = useServerFn(stopFlashServerJob);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["flashJobs", topicId],
    queryFn: () => listFn({ data: { topic_id: topicId } }),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => j.status === "queued" || j.status === "running")
        ? 10_000
        : false,
  });
  const jobs = q.data ?? [];
  const done = jobs.reduce((n, j) => n + j.done, 0);
  const seen = useRef(done);
  useEffect(() => {
    if (done !== seen.current) {
      seen.current = done;
      onProgress();
    }
  }, [done, onProgress]);
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const recent = jobs.find(
    (j) =>
      !active.includes(j) &&
      j.status !== "stopped" &&
      Date.now() - new Date(j.updated_at).getTime() < 15 * 60_000,
  );
  const label = (j: { kind: string }) => (j.kind === "fill" ? "Filling explanations" : "AI check");
  const found = (j: { kind: string; found: number }) =>
    j.found
      ? j.kind === "fill"
        ? `${j.found} cards filled`
        : `${j.found} card${j.found === 1 ? "" : "s"} to recheck`
      : "";
  if (!active.length && !recent) return null;
  return (
    <div className="space-y-1.5" aria-label="Server jobs">
      {active.map((j) => (
        <div
          key={j.id}
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm"
        >
          <Server className="h-4 w-4 text-primary" />
          <span className="font-medium">{label(j)} on the server</span>
          <span className="tabular-nums text-muted-foreground">
            {j.status === "queued" ? "starts within a minute" : `${j.done}/${j.total}`}
          </span>
          {found(j) && <span className="text-amber-700 dark:text-amber-400">{found(j)}</span>}
          <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${j.total ? Math.round((j.done / j.total) * 100) : 0}%` }}
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={async () => {
              try {
                await stopFn({ data: { id: j.id } });
                await qc.invalidateQueries({ queryKey: ["flashJobs", topicId] });
                toast.success("Stopped: the cards done keep their results");
              } catch (e) {
                toast.error(errorText(e, "Couldn't stop it"));
              }
            }}
          >
            <Pause className="mr-1 h-4 w-4" /> Stop
          </Button>
          <span className="basis-full text-xs text-muted-foreground">
            Goes on with this page closed; a few batches each minute.
          </span>
        </div>
      ))}
      {recent && (
        <div
          role="status"
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${recent.status === "failed" ? "border-red-300 text-destructive" : "border-emerald-300"}`}
        >
          <Server className="h-4 w-4" />
          {recent.status === "failed"
            ? `${label(recent)} on the server stopped after ${recent.done} of ${recent.total}: ${recent.error ?? "the AI failed"}. Start it again to go on.`
            : `${label(recent)} on the server done: ${recent.total} cards${found(recent) ? `, ${found(recent)}` : ""}.`}
        </div>
      )}
    </div>
  );
}
