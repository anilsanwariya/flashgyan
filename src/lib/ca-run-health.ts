// Whether a running news collection is still moving. Each tick that works on
// a collection records a fingerprint of its progress (websites read, articles,
// sources and stories changed); the same fingerprint over several ticks means
// the collection is stuck. Pure helpers, no network here.

// Several ticks with nothing new, and at least this long: longer
// than a PDF may take to parse (it is given up after 20 minutes).
export const STALL_TICKS = 6;
export const STALL_MINUTES = 30;

export type RunHealth = {
  // The progress fingerprint at the last tick.
  sig: string;
  // When the fingerprint last changed.
  since: string;
  // The last tick that worked on the collection.
  at: string;
  // Ticks in a row since then that changed nothing.
  ticks: number;
  // The admin was told it is stuck (once per stall).
  alerted: boolean;
};

export type CollectionHealth =
  | { state: "ok" }
  | { state: "stalled"; minutes: number; ticks: number }
  | { state: "no_ticks"; minutes: number }
  | { state: "queued"; behind: string };

export function nextRunHealth(prev: RunHealth | null, sig: string, now = new Date()): RunHealth {
  const at = now.toISOString();
  if (!prev || prev.sig !== sig) return { sig, since: at, at, ticks: 0, alerted: false };
  return { ...prev, at, ticks: prev.ticks + 1 };
}

// `lastClaimed`: when a tick last took the collection (the run's updated_at).
export function runHealthState(
  h: RunHealth | null,
  lastClaimed: string,
  now = new Date(),
): CollectionHealth {
  const minutes = (iso: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (h && h.ticks >= STALL_TICKS && minutes(h.since) >= STALL_MINUTES)
    return { state: "stalled", minutes: minutes(h.since), ticks: h.ticks };
  const last = h && Date.parse(h.at) > Date.parse(lastClaimed) ? h.at : lastClaimed;
  if (minutes(last) >= STALL_MINUTES) return { state: "no_ticks", minutes: minutes(last) };
  return { state: "ok" };
}
