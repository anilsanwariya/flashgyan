// Admin: a notes book's planner. Each topic of the book (those with nothing
// under them) is checked against the knowledge base: covered, partly
// covered or not, what is missing, where the material was found, whether the
// notes need a map, and what to upload next. Topics asked more often in past
// papers are checked and listed first.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Map as MapIcon, RefreshCw, Search, Upload } from "lucide-react";
import { getNotesPlan, planNotesStep } from "@/lib/notes-books.functions";
import { COVERAGE_NAME, type Coverage } from "@/lib/notes-plan";
import type { NotesStage } from "@/lib/notes-books";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

type Data = Awaited<ReturnType<typeof getNotesPlan>>;
type Row = Data["rows"][number];
type Filter = "all" | Coverage | "unchecked" | "map";

const TONE: Record<Coverage, "good" | "warn" | "bad"> = {
  full: "good",
  partial: "warn",
  none: "bad",
};
const BAR: Record<Coverage | "unchecked", string> = {
  full: "bg-emerald-500",
  partial: "bg-amber-400",
  none: "bg-red-500",
  unchecked: "bg-muted-foreground/25",
};

export function NotesPlanner({ id, stage }: { id: string; stage: NotesStage }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getNotesPlan);
  const stepFn = useServerFn(planNotesStep);
  const q = useQuery({
    queryKey: ["notesPlan", id],
    queryFn: () => getFn({ data: { id } }),
    refetchOnMount: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"outline" | "priority">("outline");
  const [allUploads, setAllUploads] = useState(false);
  const stop = useRef(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["notesPlan", id] });

  // Checks topics a batch at a time: new (or changed) ones, the gaps again,
  // or the ones asked for.
  async function run(mode: "new" | "gaps", redo?: string[]) {
    stop.current = false;
    const since = new Date().toISOString();
    const skip: string[] = [];
    let done = 0;
    try {
      for (;;) {
        setBusy(
          redo ? "Checking it again…" : `Checking topics against the knowledge base… ${done} done`,
        );
        const r = await stepFn({
          data: { id, skip, ...(redo ? { redo } : mode === "gaps" ? { since } : {}) },
        });
        done += r.done;
        skip.push(...r.missed);
        await refresh();
        if (redo || r.left === 0 || stop.current || (!r.done && !r.missed.length)) break;
      }
      toast.success(done ? `${done} topic${done === 1 ? "" : "s"} checked` : "Nothing to check");
    } catch (e) {
      toast.error(errorText(e, "Couldn't check"));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return (
      <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load the plan")}</p>
    );
  const data = q.data!;
  const rows = data.rows;
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        This subject's master outline has no topics yet: make it in the Master outlines tab.
      </p>
    );
  const count = (c: Coverage) => rows.filter((r) => r.plan?.coverage === c && !r.changed).length;
  const unchecked = rows.filter((r) => !r.plan || r.changed).length;
  const stale = rows.filter((r) => r.stale && !r.changed).length;
  const gaps = rows.filter(
    (r) => r.plan && !r.changed && (r.plan.coverage !== "full" || r.stale),
  ).length;
  const maps = rows.filter((r) => r.plan?.map);
  const shown = rows
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "unchecked"
          ? !r.plan || r.changed
          : filter === "map"
            ? !!r.plan?.map
            : r.plan?.coverage === filter && !r.changed,
    )
    .sort((a, b) => (sort === "priority" ? b.priority - a.priority || b.asked - a.asked : 0));
  const segs: [Coverage | "unchecked", number][] = [
    ["full", count("full")],
    ["partial", count("partial")],
    ["none", count("none")],
    ["unchecked", unchecked],
  ];
  const uploads = allUploads ? data.uploads : data.uploads.slice(0, 6);

  return (
    <div className="space-y-4">
      <section
        aria-label="Coverage"
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-semibold">Knowledge base coverage</h3>
          <span className="text-sm text-muted-foreground" data-testid="plan-counts">
            {rows.length} topics · {rows.length - unchecked} checked · {maps.length} need a map
          </span>
        </div>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label="Coverage of the topics"
        >
          {segs.map(([k, n]) =>
            n ? (
              <span
                key={k}
                className={`${BAR[k]} h-full`}
                style={{ width: `${(n / rows.length) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {segs.map(([k, n]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${BAR[k]}`} />
              {k === "unchecked" ? "Not checked" : COVERAGE_NAME[k]}: <b>{n}</b>
            </span>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Each topic is searched in the knowledge base with its syllabus lines and past questions;
          the AI judges whether the passages found are enough to write its{" "}
          {stage === "mains" ? "Mains (analytical)" : "Prelims (factual)"} notes, says what is
          missing and what to upload, and whether the notes need a map. Most asked topics are
          checked first (an AI request per 5 topics).
        </p>
        {stale > 0 && (
          <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-2.5 text-sm">
            New material was added to the knowledge base after {stale} topic
            {stale === 1 ? " was" : "s were"} checked: re-check the gaps to update them.
          </p>
        )}
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <RefreshCw className="h-4 w-4 animate-spin" /> {busy}
            <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!unchecked} onClick={() => void run("new")}>
              <Search className="mr-1 h-4 w-4" />
              {unchecked ? `Check coverage (${unchecked})` : "All checked"}
            </Button>
            <Button size="sm" variant="outline" disabled={!gaps} onClick={() => void run("gaps")}>
              <RefreshCw className="mr-1 h-4 w-4" /> Re-check the gaps ({gaps})
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="/admin?section=saathi">Open the knowledge base</a>
            </Button>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-label="Upload next"
          className="min-w-0 space-y-2 rounded-2xl border border-border bg-card p-4"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <Upload className="h-4 w-4 text-primary" /> Upload next
          </h3>
          {data.uploads.length ? (
            <>
              <p className="text-xs text-muted-foreground">
                Sources the AI suggests for the gaps, those filling the most asked topics first.
                Check each before uploading.
              </p>
              <ol className="space-y-1.5 text-sm" data-testid="uploads">
                {uploads.map((u, i) => (
                  <li key={u.source} className="flex gap-2">
                    <span className="w-5 flex-none text-right tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="min-w-0">
                      <span className="break-words font-medium">{u.source}</span>
                      <span className="block text-xs text-muted-foreground">
                        For {u.topics.length} topic{u.topics.length === 1 ? "" : "s"}:{" "}
                        {u.topics.join(", ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              {data.uploads.length > 6 && (
                <Button size="sm" variant="ghost" onClick={() => setAllUploads(!allUploads)}>
                  {allUploads ? "Show fewer" : `Show all ${data.uploads.length}`}
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {rows.some((r) => r.plan)
                ? "No gaps with suggestions."
                : "Check coverage to see what to upload."}
            </p>
          )}
        </section>
        <section
          aria-label="Maps needed"
          className="min-w-0 space-y-2 rounded-2xl border border-border bg-card p-4"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <MapIcon className="h-4 w-4 text-primary" /> Maps needed ({maps.length})
          </h3>
          {maps.length ? (
            <ul className="space-y-1 text-sm" data-testid="maps">
              {maps.map((r) => (
                <li key={r.topic_id} className="flex gap-2">
                  <span className="w-12 flex-none tabular-nums text-muted-foreground">
                    {r.number}
                  </span>
                  <span className="min-w-0">
                    <Badge tone="primary">{r.plan!.map!.kind}</Badge>{" "}
                    <span className="break-words">{r.plan!.map!.what}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {rows.some((r) => r.plan)
                ? "No topic needs a map so far."
                : "Topics that need a map are listed here once checked."}
            </p>
          )}
        </section>
      </div>

      <section aria-label="Topics" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Show topics" className="flex flex-wrap gap-1">
            {(
              [
                ["all", `All (${rows.length})`],
                ["none", `Not covered (${count("none")})`],
                ["partial", `Partly (${count("partial")})`],
                ["full", `Covered (${count("full")})`],
                ["unchecked", `Not checked (${unchecked})`],
                ["map", `Need a map (${maps.length})`],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={filter === k}
                onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="Order"
            value={sort}
            onChange={(e) => setSort(e.target.value as "outline" | "priority")}
            className="ml-auto h-7 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="outline">Outline order</option>
            <option value="priority">Biggest gaps first</option>
          </select>
        </div>
        {shown.length ? (
          <ol className="space-y-1.5" data-testid="plan-topics">
            {shown.map((r, i) => {
              const head = sort === "outline" && (i === 0 || shown[i - 1].chapter !== r.chapter);
              const ch = data.chapters.find((c) => c.n === r.chapter);
              return (
                <li key={r.topic_id}>
                  {head && ch && (
                    <h4 className="mb-1 mt-3 font-semibold">
                      {ch.n}. {ch.name.hi || ch.name.en}{" "}
                      {ch.name.hi && ch.name.en !== ch.name.hi && (
                        <span className="font-normal text-muted-foreground">{ch.name.en}</span>
                      )}
                    </h4>
                  )}
                  <TopicRow row={r} busy={!!busy} onRecheck={() => void run("new", [r.topic_id])} />
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No topic here.
          </p>
        )}
      </section>
    </div>
  );
}

function TopicRow({ row: r, busy, onRecheck }: { row: Row; busy: boolean; onRecheck: () => void }) {
  const p = r.plan && !r.changed ? r.plan : null;
  return (
    <div
      className="space-y-1 rounded-xl border border-border bg-card p-2.5 text-sm"
      data-topic={r.name.en}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 flex-none tabular-nums text-muted-foreground">{r.number}</span>
        <span className="min-w-0 flex-1 basis-[12rem] font-medium">
          <span lang="hi">{r.name.hi || r.name.en}</span>
          {r.name.hi && r.name.en !== r.name.hi && (
            <span className="ml-2 font-normal text-muted-foreground">{r.name.en}</span>
          )}
        </span>
        {r.asked > 0 && <Badge tone="warn">Asked {r.asked}×</Badge>}
        {p ? (
          <Badge tone={TONE[p.coverage]}>{COVERAGE_NAME[p.coverage]}</Badge>
        ) : (
          <Badge tone="muted">{r.changed ? "Changed: check again" : "Not checked"}</Badge>
        )}
        {p && r.stale && <Badge tone="primary">New material since</Badge>}
        {r.plan && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={busy}
            onClick={onRecheck}
            aria-label={`Check ${r.name.en} again`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {p && (
        <div className="space-y-0.5 pl-14 text-xs">
          {p.sources.length > 0 && (
            <p className="text-muted-foreground">
              Found in:{" "}
              <span className="text-foreground">{p.sources.map((s) => s.title).join("; ")}</span>
            </p>
          )}
          {p.missing && <p>Missing: {p.missing}</p>}
          {p.map && (
            <p className="text-primary">
              Map ({p.map.kind}): {p.map.what}
            </p>
          )}
          {p.upload.length > 0 && (
            <p className="text-muted-foreground">Upload: {p.upload.join("; ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
