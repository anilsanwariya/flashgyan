// Admin: collecting news from past dates. Reads the watched websites one day
// at a time (their site maps, or a search limited to that day), files the
// stories under their real dates with the AI's picks, and marks them as
// collected later. Daily issues already posted don't change; the monthly and
// custom magazines get the stories.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Pause, Play, RefreshCw, Square } from "lucide-react";
import {
  getCaBackfill,
  runCaCollectionTick,
  setCaBackfillStatus,
  startCaBackfill,
  type BackfillDay,
} from "@/lib/ca-collect.functions";
import { MAX_BACKFILL_DAYS, addDays, datesBetween } from "@/lib/ca-backfill";
import { formatDate, istDate } from "@/lib/current-affairs";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The range offered first: the month given (up to yesterday), or the last
// seven days.
function defaultRange(month?: string): { from: string; to: string } {
  const yesterday = addDays(istDate(), -1);
  if (month) {
    const end = addDays(`${addDays(month, 31).slice(0, 7)}-01`, -1);
    return { from: month, to: end < yesterday ? end : yesterday };
  }
  return { from: addDays(yesterday, -6), to: yesterday };
}

const DAY_TONES: Record<BackfillDay["state"], "muted" | "primary" | "good" | "bad"> = {
  waiting: "muted",
  collecting: "primary",
  done: "good",
  stopped: "bad",
};
const DAY_LABELS: Record<BackfillDay["state"], string> = {
  waiting: "Waiting",
  collecting: "Collecting",
  done: "Done",
  stopped: "Stopped",
};

export function PastCollection({ month }: { month?: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaBackfill);
  const startFn = useServerFn(startCaBackfill);
  const statusFn = useServerFn(setCaBackfillStatus);
  const tickFn = useServerFn(runCaCollectionTick);
  const q = useQuery({
    queryKey: ["caBackfill"],
    queryFn: () => getFn(),
    refetchInterval: (query) => (query.state.data?.backfill?.status === "running" ? 20_000 : false),
  });
  const [range, setRange] = useState(() => defaultRange(month));
  useEffect(() => setRange(defaultRange(month)), [month]);
  const [sites, setSites] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [driving, setDriving] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const data = q.data;
  const all = data?.sites ?? [];
  // The websites switched on in Settings, until changed here.
  const chosen = sites ?? new Set(all.filter((s) => s.enabled).map((s) => s.id));
  const bf = data?.backfill ?? null;
  const active = bf && (bf.status === "running" || bf.status === "paused");
  const reload = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["caBackfill"] }),
      qc.invalidateQueries({ queryKey: ["caMonth"] }),
      qc.invalidateQueries({ queryKey: ["caDay"] }),
    ]);

  // Works on it from this page while it's open (the once-a-minute schedule
  // goes on when it's closed, more slowly).
  async function drive() {
    if (driving) return;
    setDriving(true);
    stop.current = false;
    try {
      for (let i = 0; i < 2000 && !stop.current; i++) {
        const r = await tickFn({ data: { origin: window.location.origin } });
        if (r.error) toast.error(r.error);
        if (i % 3 === 0) await reload();
        const fresh = await getFn();
        if (fresh.backfill?.status !== "running") break;
        if (!r.run || r.steps.includes("waiting for PDF parsing")) await sleep(6000);
      }
    } catch (e) {
      toast.error(errorText(e, "Collection stopped"));
    } finally {
      setDriving(false);
      await reload();
    }
  }

  async function start() {
    setBusy(true);
    try {
      await startFn({ data: { from: range.from, to: range.to, sites: [...chosen] } });
      toast.success("Past-date collection started");
      await reload();
      void drive();
    } catch (e) {
      toast.error(errorText(e, "Couldn't start"));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "pause" | "resume" | "stop") {
    if (!bf) return;
    if (
      action === "stop" &&
      !confirm("Stop this past-date collection? What it collected so far stays.")
    )
      return;
    setBusy(true);
    try {
      await statusFn({ data: { id: bf.id, action } });
      if (action !== "resume") stop.current = true;
      toast.success(
        action === "pause"
          ? "Paused: the day being collected finishes first"
          : action === "resume"
            ? "Going on"
            : "Stopped",
      );
      await reload();
      if (action === "resume") void drive();
    } catch (e) {
      toast.error(errorText(e, "Couldn't change it"));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return null;
  if (q.error)
    return (
      <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load past dates")}</p>
    );

  const yesterday = addDays(istDate(), -1);
  const dayCount = range.from <= range.to ? datesBetween(range.from, range.to).length : 0;
  const rangeProblem =
    range.from > range.to
      ? "The start date is after the end date."
      : range.to > yesterday
        ? "Pick dates up to yesterday; today is collected every evening."
        : dayCount > MAX_BACKFILL_DAYS
          ? `Pick at most ${MAX_BACKFILL_DAYS} days at a time.`
          : null;
  const days = data?.days ?? [];
  const finished = days.filter((d) => d.state === "done" || d.state === "stopped").length;
  const stories = days.reduce((n, d) => n + d.stories, 0);

  return (
    <section
      aria-label="Collect past dates"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4" /> Collect past dates
        </h3>
        <p className="text-sm text-muted-foreground">
          Reads your websites for past days, one day at a time, and files the stories the AI picks
          under their real dates. They're marked “Collected later” and go into the monthly and
          custom magazines; daily issues already posted don't change.
        </p>
      </div>

      {data && !data.ready ? (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
          This needs a database update: run the latest migration (ca_past_collection) in Lovable or
          the SQL editor, then reload this page.
        </p>
      ) : active && bf ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {formatDate(bf.date_from, "en")} – {formatDate(bf.date_to, "en")}
            </span>
            <Badge tone={bf.status === "running" ? "primary" : "warn"}>
              {bf.status === "running" ? "Collecting" : "Paused"}
            </Badge>
            <span className="text-muted-foreground">
              {finished} of {days.length} days · {stories} stories added
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {bf.status === "running" ? (
                <>
                  {!driving && (
                    <Button size="sm" onClick={() => void drive()} disabled={busy}>
                      <RefreshCw className="mr-1 h-4 w-4" /> Speed up
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void act("pause")}
                    disabled={busy}
                  >
                    <Pause className="mr-1 h-4 w-4" /> Pause
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => void act("resume")} disabled={busy}>
                  <Play className="mr-1 h-4 w-4" /> Go on
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void act("stop")} disabled={busy}>
                <Square className="mr-1 h-4 w-4" /> Stop
              </Button>
            </div>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Days collected"
            aria-valuemin={0}
            aria-valuemax={days.length}
            aria-valuenow={finished}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${days.length ? (finished / days.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {driving
              ? "Working from this page: keep it open to go faster."
              : "Goes on by itself in the background (about one story a minute); “Speed up” works from this page while it's open."}
          </p>
          <DayList days={days} />
        </div>
      ) : (
        <div className="space-y-3">
          {bf && (
            <p className="text-xs text-muted-foreground">
              Last: {formatDate(bf.date_from, "en")} – {formatDate(bf.date_to, "en")} (
              {bf.status === "done" ? "finished" : "stopped"}), {stories} stories added.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span className="block">From</span>
              <Input
                type="date"
                aria-label="From date"
                value={range.from}
                max={yesterday}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
                className="h-9 w-40"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span className="block">To</span>
              <Input
                type="date"
                aria-label="To date"
                value={range.to}
                max={yesterday}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
                className="h-9 w-40"
              />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">
              {dayCount ? `${dayCount} ${dayCount === 1 ? "day" : "days"}` : ""}
            </span>
          </div>
          {all.length ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">
                Websites ({chosen.size} of {all.length})
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {all.map((s) => (
                  <label
                    key={s.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chosen.has(s.id) ? "border-primary/50 bg-primary/10" : "border-border text-muted-foreground"}`}
                  >
                    <Checkbox
                      checked={chosen.has(s.id)}
                      aria-label={s.name}
                      onCheckedChange={(on) => {
                        const next = new Set(chosen);
                        if (on === true) next.add(s.id);
                        else next.delete(s.id);
                        setSites(next);
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add websites in Magazine settings → Websites to watch first.
            </p>
          )}
          {rangeProblem && <p className="text-xs text-destructive">{rangeProblem}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void start()}
              disabled={busy || !!rangeProblem || !chosen.size || !dayCount}
            >
              <CalendarClock className="mr-1 h-4 w-4" />
              {busy ? "Starting…" : "Collect these dates"}
            </Button>
            {dayCount > 0 && chosen.size > 0 && !rangeProblem && (
              <span className="text-xs text-muted-foreground">
                {dayCount} {dayCount === 1 ? "day" : "days"} × {chosen.size}{" "}
                {chosen.size === 1 ? "website" : "websites"}. Each day takes about 10–20 minutes in
                the background; faster with this page open.
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Websites with dated site maps or search work best. For an e-paper that only shows today,
            upload that day's PDF on the Daily page instead.
          </p>
        </div>
      )}
    </section>
  );
}

function DayList({ days }: { days: BackfillDay[] }) {
  return (
    <ul
      className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-border p-1.5 text-xs sm:grid-cols-2"
      aria-label="Days"
    >
      {days.map((d) => (
        <li
          key={d.date}
          data-day={d.date}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
        >
          <a
            href={`/admin?section=ca.daily&date=${d.date}`}
            className="w-32 shrink-0 whitespace-nowrap font-medium hover:underline"
          >
            {formatDate(d.date, "en")}
          </a>
          <Badge tone={DAY_TONES[d.state]}>{DAY_LABELS[d.state]}</Badge>
          <span className="ml-auto text-muted-foreground">
            {d.found
              ? `${d.found} found · ${d.picked} picked · `
              : d.state === "done"
                ? "nothing found · "
                : ""}
            <b className="text-foreground">{d.stories}</b> stories
          </span>
        </li>
      ))}
    </ul>
  );
}
