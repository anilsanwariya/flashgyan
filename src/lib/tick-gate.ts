// Which parts of the background tick run this minute: the rules alone, no
// network (the reads are in tick-gate.server.ts).
//
// The schedule calls the tick every minute. Every fifth minute is a full
// tick: every part runs, exactly as before, so nothing can be missed or run
// more than five minutes late. In the minutes between, the tick first asks a
// few cheap questions (is a collection running, a job queued, a post due?)
// and runs only the parts with work in progress, plus the parts that did
// something on the last tick (they are likely still going). A minute with
// nothing to do costs a handful of small reads.

export type TickPart =
  | "approvals"
  | "collection"
  | "ig"
  | "gk"
  | "studio"
  | "exams"
  | "clips"
  | "backfill"
  | "mags"
  | "docs"
  | "schemes"
  | "atlas";

// Parts with a cheap question of their own, in the order they are asked.
export const PROBED: TickPart[] = [
  "approvals",
  "collection",
  "ig",
  "gk",
  "studio",
  "exams",
  "clips",
];
// Parts without one: they run every minute while they did something on the
// last tick, and on full ticks.
export const BY_MOMENTUM: TickPart[] = ["backfill", "mags", "docs", "schemes", "atlas"];

// Every fifth minute (UTC) runs every part.
export const isFullTick = (now = new Date()) => now.getUTCMinutes() % 5 === 0;

// The parts to run on a quick tick: those whose question found work, and
// those busy on the last tick. `before` null (unreadable): every momentum
// part runs, as it would have without this check.
export function busyFrom(found: boolean[], before: string[] | null): Set<TickPart> {
  const out = new Set<TickPart>(PROBED.filter((_, i) => found[i]));
  for (const p of before ?? BY_MOMENTUM)
    if (BY_MOMENTUM.includes(p as TickPart)) out.add(p as TickPart);
  return out;
}

// The momentum parts to keep for the next tick, or null when unchanged
// (nothing to write).
export function nextBusy(before: string[] | null, did: Set<TickPart>): TickPart[] | null {
  const parts = BY_MOMENTUM.filter((p) => did.has(p));
  const same =
    before !== null &&
    before.length === parts.length &&
    before.every((p) => parts.includes(p as TickPart));
  return same ? null : parts;
}
