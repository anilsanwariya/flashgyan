// Work on a day's stories that runs on while the editor moves on: writing a
// story's text (with a progress bar from the server's steps), dropping one or
// bringing it back. Kept by the story list, so going to the next story, or
// back to the list, doesn't stop it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCaWriteProgress, type CaItem } from "@/lib/current-affairs.functions";
import { errorText } from "@/components/ca-ui";

export type StoryJob = {
  id: string;
  kind: "write" | "drop" | "include";
  started: number;
  pct: number;
  stage: string;
};

export type StoryJobs = {
  jobs: Map<string, StoryJob>;
  // Runs fn for the story; a second job for the same story waits its turn.
  run: (
    id: string,
    kind: StoryJob["kind"],
    fn: () => Promise<unknown>,
    done: string,
  ) => Promise<boolean>;
};

const FIRST_STAGE: Record<StoryJob["kind"], string> = {
  write: "Starting",
  drop: "Dropping",
  include: "Bringing back",
};

export function useStoryJobs(onChanged: () => void): StoryJobs {
  const progressFn = useServerFn(getCaWriteProgress);
  const [jobs, setJobs] = useState<Map<string, StoryJob>>(new Map());
  const queue = useRef(new Map<string, Promise<unknown>>());
  const patch = (id: string, p: Partial<StoryJob> | null) =>
    setJobs((cur) => {
      const next = new Map(cur);
      const j = next.get(id);
      if (!p) next.delete(id);
      else if (j) next.set(id, { ...j, ...p });
      return next;
    });

  const run = useCallback<StoryJobs["run"]>(
    async (id, kind, fn, done) => {
      const before = queue.current.get(id) ?? Promise.resolve();
      let ok = false;
      const mine = before
        .catch(() => undefined)
        .then(async () => {
          setJobs((cur) =>
            new Map(cur).set(id, {
              id,
              kind,
              started: Date.now(),
              pct: kind === "write" ? 2 : 50,
              stage: FIRST_STAGE[kind],
            }),
          );
          try {
            await fn();
            ok = true;
            toast.success(done);
          } catch (e) {
            toast.error(errorText(e, "Failed"));
          } finally {
            patch(id, null);
            onChanged();
          }
        });
      queue.current.set(id, mine);
      await mine;
      if (queue.current.get(id) === mine) queue.current.delete(id);
      return ok;
    },
    // onChanged refreshes the day; a new one each render is fine to miss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // While stories are being written, ask the server how far each has got.
  const writing = [...jobs.values()].filter((j) => j.kind !== "drop").map((j) => j.id);
  const key = writing.join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const ids = key.split(",");
    const poll = async () => {
      try {
        const got = await progressFn({ data: { ids } });
        if (stop) return;
        setJobs((cur) => {
          const next = new Map(cur);
          for (const [id, p] of Object.entries(got)) {
            const j = next.get(id);
            if (j && p.pct > j.pct)
              next.set(id, { ...j, kind: "write", pct: p.pct, stage: p.stage });
          }
          return next;
        });
      } catch {
        // The bar waits for the next answer.
      }
    };
    void poll();
    const t = setInterval(poll, 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { jobs, run };
}

// A story's job as a thin bar with its step and percentage.
export function JobBar({ job, className = "" }: { job: StoryJob; className?: string }) {
  const write = job.kind === "write" || job.pct > 50;
  return (
    <div className={`space-y-1 ${className}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{write ? `Writing: ${job.stage}…` : `${job.stage}…`}</span>
        {write && <span className="tabular-nums">{Math.round(job.pct)}%</span>}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={write ? "Writing the story" : job.stage}
        aria-valuenow={write ? Math.round(job.pct) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-700 ${write ? "" : "w-1/3 animate-pulse"}`}
          style={write ? { width: `${Math.max(2, Math.min(100, job.pct))}%` } : undefined}
        />
      </div>
    </div>
  );
}

// What the story editor can do with a story's review state; kept by the list.
export type StoryReview = {
  state: (it: CaItem) => "todo" | "approved" | "later" | "dropped";
  set: (it: CaItem, state: "approved" | "later" | null) => void;
  drop: (it: CaItem, drop: boolean) => void;
  write: (it: CaItem) => Promise<boolean>;
  job: (it: CaItem) => StoryJob | undefined;
  // The choices on the story's bar and their names (a custom magazine has
  // only "In the magazine" and "Leave out").
  choices?: { state: "approved" | "dropped" | "later"; label: string }[];
};
