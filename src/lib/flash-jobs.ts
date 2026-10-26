// The card studio's AI jobs (the check, filling explanations, पृथक करें
// cards) run here, outside any one tab: they keep going while the editor
// opens cards, switches tabs or opens another topic. They stop if the page
// is closed; cards already done keep their results, so running again
// continues.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

export type StudioJob = {
  label: string;
  topic: string;
  done: number;
  total: number;
  // What it found so far, e.g. "12 with suggestions".
  found: string;
};

let job: StudioJob | null = null;
let stopping = false;
const listeners = new Set<() => void>();
const set = (next: StudioJob | null) => {
  job = next;
  listeners.forEach((l) => l());
};

export function useStudioJob(): StudioJob | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => job,
    () => null,
  );
}

export const stopStudioJob = () => {
  stopping = true;
};

// Runs `step` over the ids in batches of `size`, one job at a time.
// `each` takes each batch's result and returns what it found so far;
// `end` says how it went (also after Stop).
export async function runStudioJob<T>(o: {
  label: string;
  topic: string;
  ids: string[];
  size: number;
  step: (ids: string[]) => Promise<T>;
  each: (r: T) => string;
  end: (found: string, stopped: boolean) => void;
}) {
  if (job) {
    toast.error(`Wait for “${job.label}” to finish, or stop it`);
    return;
  }
  stopping = false;
  let found = "";
  set({ label: o.label, topic: o.topic, done: 0, total: o.ids.length, found });
  try {
    for (let i = 0; i < o.ids.length && !stopping; i += o.size) {
      found = o.each(await o.step(o.ids.slice(i, i + o.size)));
      set({
        label: o.label,
        topic: o.topic,
        done: Math.min(o.ids.length, i + o.size),
        total: o.ids.length,
        found,
      });
    }
    o.end(found, stopping);
  } catch (e) {
    toast.error(
      (e instanceof Error && e.message ? e.message : `${o.label} stopped`) +
        " — run it again to continue from where it stopped",
    );
  } finally {
    set(null);
  }
}
