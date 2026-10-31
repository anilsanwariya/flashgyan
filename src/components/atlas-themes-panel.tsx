// The atlas's history and culture themes (admin): places suggested from the
// notes (battles, dynasty seats, saints, folk deities, fairs, dances,
// painting schools, crafts, constituencies) with their years or months,
// accepted as they are or corrected, or rejected; and the year and month
// fields of a place.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import {
  atlasSuggestionsStatus,
  decideAtlasSuggestion,
  listAtlasSuggestions,
  runAtlasStep,
  startAtlasSuggestions,
  type Suggestion,
} from "@/lib/atlas.functions";
import { ATLAS_CATS, MONTHS, atlasCat, eraLabel, monthsLabel } from "@/lib/atlas";
import { googleMapsUrl } from "@/lib/map-spec";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MIGRATION =
  "Suggestions need the migration 20261215090000_atlas_themes.sql (years and months of places, and the suggestions).";
const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Time = { era_from: number | null; era_to: number | null; months: number[] };

// Years (BCE as negative) and a fair's months.
export function TimeFields({ value, onChange }: { value: Time; onChange: (t: Time) => void }) {
  const year = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Years</span>
      <Input
        aria-label="From year"
        type="number"
        placeholder="from"
        className="w-24"
        value={value.era_from ?? ""}
        onChange={(e) => onChange({ ...value, era_from: year(e.target.value) })}
      />
      <span>–</span>
      <Input
        aria-label="To year"
        type="number"
        placeholder="to"
        className="w-24"
        value={value.era_to ?? ""}
        onChange={(e) => onChange({ ...value, era_to: year(e.target.value) })}
      />
      <span className="text-xs text-muted-foreground">(BCE as minus)</span>
      <span className="ml-2 text-muted-foreground">Months</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Months">
        {MONTHS.map((m, i) => {
          const on = value.months.includes(i + 1);
          return (
            <button
              key={m.en}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...value,
                  months: on
                    ? value.months.filter((x) => x !== i + 1)
                    : [...value.months, i + 1].sort((a, b) => a - b),
                })
              }
              className={`rounded border px-1.5 py-0.5 text-xs ${on ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {m.en}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AtlasSuggestions() {
  const statusFn = useServerFn(atlasSuggestionsStatus);
  const startFn = useServerFn(startAtlasSuggestions);
  const stepFn = useServerFn(runAtlasStep);
  const listFn = useServerFn(listAtlasSuggestions);
  const decideFn = useServerFn(decideAtlasSuggestion);
  const qc = useQueryClient();
  const [view, setView] = useState<"open" | "accepted" | "rejected">("open");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const status = useQuery({
    queryKey: ["atlasSuggestionsStatus"],
    queryFn: () => statusFn(),
    refetchOnMount: "always",
  });
  const list = useQuery({
    queryKey: ["atlasSuggestions", view, cat],
    queryFn: () => listFn({ data: { status: view, ...(cat ? { cat } : {}) } }),
    enabled: !!status.data?.ready,
    refetchOnMount: "always",
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["atlasSuggestionsStatus"] }),
      qc.invalidateQueries({ queryKey: ["atlasSuggestions"] }),
    ]);
  // Reads the notes from this page a batch at a time (the minute tick
  // does the same, more slowly).
  const read = async () => {
    setBusy(true);
    stop.current = false;
    try {
      const r = await startFn({ data: {} });
      toast.success(`Reading ${r.chapters} chapters of your notes`);
      for (let i = 0; i < 500 && !stop.current; i++) {
        const s = await stepFn();
        if (i % 2 === 0) await refresh();
        if (!s.did) break;
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't read the notes"));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  if (status.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (status.error)
    return <p className="text-destructive">{errorText(status.error, "Couldn't load")}</p>;
  const s = status.data!;
  if (!s.ready) return <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>;
  const rows = list.data ?? [];
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Places from your notes</h3>
        <p className="text-sm text-muted-foreground">
          The AI reads your verified facts and suggests places for the history and culture themes
          (battles, dynasty seats, saints and folk deities, fairs, dances, painting schools, crafts,
          constituencies), with the years or months the facts give. It only uses what your notes
          say. Check each one: an accepted place is verified, shown to students and linked to the
          facts it came from.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <Button variant="outline" onClick={() => (stop.current = true)}>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Stop reading{s.job.chapter ? ` (${s.job.left} chapters left)` : ""}
            </Button>
          ) : (
            <Button onClick={read}>Read my notes for places</Button>
          )}
          <span className="text-sm text-muted-foreground">
            {s.open} to check · {s.accepted} accepted · {s.rejected} rejected
          </span>
        </div>
        {s.job.error && (
          <p className="text-sm text-destructive">The reading stopped: {s.job.error}</p>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "accepted", "rejected"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1 text-sm ${view === v ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
          >
            {v === "open" ? "To check" : v === "accepted" ? "Accepted" : "Rejected"}
          </button>
        ))}
        <select
          aria-label="Category"
          className={select}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="">Every kind</option>
          {ATLAS_CATS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.icon} {c.name.en}
            </option>
          ))}
        </select>
        {view === "open" && rows.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={async () => {
              if (!window.confirm(`Reject all ${rows.length} shown?`)) return;
              await decideFn({ data: { decision: "reject", ids: rows.map((r) => r.id) } });
              await refresh();
            }}
          >
            Reject all shown
          </Button>
        )}
      </div>
      {list.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          {view === "open" ? "Nothing to check. Read your notes for places." : "None."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <SuggestionRow
              key={r.id}
              s={r}
              open={view === "open"}
              onDecide={async (accept, edit) => {
                try {
                  await decideFn({
                    data: accept
                      ? { decision: "accept", id: r.id, edit: edit ?? {} }
                      : { decision: "reject", ids: [r.id] },
                  });
                  await refresh();
                } catch (e) {
                  toast.error(errorText(e, "Couldn't save"));
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({
  s,
  open,
  onDecide,
}: {
  s: Suggestion;
  open: boolean;
  onDecide: (accept: boolean, edit?: Partial<Suggestion["data"]>) => Promise<void>;
}) {
  const d = s.data;
  const [edit, setEdit] = useState(false);
  const [e, setE] = useState(d);
  const c = atlasCat(d.cat);
  const where =
    d.found === "atlas"
      ? "at an atlas place"
      : d.found === "place list"
        ? "from the place list"
        : d.found === "district"
          ? "at the district's centre: move it"
          : "no position: give one";
  return (
    <li className="space-y-2 rounded-xl border border-border p-3 text-sm" data-suggestion={s.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg">{c.icon}</span>
        <span className="font-semibold">{d.name.en}</span>
        {d.name.hi && <span className="text-muted-foreground">{d.name.hi}</span>}
        <Badge>{c.name.en}</Badge>
        {s.kind === "update" && <Badge tone="primary">Adds to a place</Badge>}
        {d.district && <span className="text-xs text-muted-foreground">{d.district}</span>}
      </div>
      {s.kind === "update" ? (
        <p className="text-xs">
          Adds{" "}
          {[eraLabel(d.era_from, d.era_to), monthsLabel(d.months, "en")]
            .filter(Boolean)
            .join(" · ")}{" "}
          to {d.place?.name}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {[
            d.at?.en && `at ${d.at.en}`,
            eraLabel(d.era_from, d.era_to),
            monthsLabel(d.months, "en"),
          ]
            .filter(Boolean)
            .join(" · ")}
          {d.lat != null && (
            <>
              {" "}
              ·{" "}
              <a
                href={googleMapsUrl(d.lat, d.lon!)}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {where}
              </a>
            </>
          )}
          {d.lat == null && <span className="text-destructive"> · {where}</span>}
        </p>
      )}
      <ul className="space-y-0.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
        {(s.quotes ?? []).slice(0, 4).map((q, i) => (
          <li key={i}>“{q}”</li>
        ))}
      </ul>
      {edit && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-2 sm:grid-cols-2">
          {s.kind === "new" && (
            <>
              <Input
                aria-label="Name (English)"
                value={e.name.en}
                onChange={(x) => setE({ ...e, name: { ...e.name, en: x.target.value } })}
              />
              <Input
                aria-label="Name (Hindi)"
                lang="hi"
                value={e.name.hi}
                onChange={(x) => setE({ ...e, name: { ...e.name, hi: x.target.value } })}
              />
              <select
                aria-label="Kind"
                className={select}
                value={e.cat}
                onChange={(x) => setE({ ...e, cat: x.target.value })}
              >
                {ATLAS_CATS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.icon} {k.name.en}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  aria-label="Latitude"
                  type="number"
                  step="0.001"
                  value={e.lat ?? ""}
                  onChange={(x) =>
                    setE({ ...e, lat: x.target.value ? Number(x.target.value) : null })
                  }
                />
                <Input
                  aria-label="Longitude"
                  type="number"
                  step="0.001"
                  value={e.lon ?? ""}
                  onChange={(x) =>
                    setE({ ...e, lon: x.target.value ? Number(x.target.value) : null })
                  }
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <TimeFields
              value={{ era_from: e.era_from, era_to: e.era_to, months: e.months }}
              onChange={(t) => setE({ ...e, ...t })}
            />
          </div>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              onDecide(
                true,
                edit
                  ? {
                      ...(s.kind === "new"
                        ? {
                            name: e.name,
                            cat: e.cat,
                            ...(e.lat != null ? { lat: e.lat } : {}),
                            ...(e.lon != null ? { lon: e.lon } : {}),
                          }
                        : {}),
                      era_from: e.era_from,
                      era_to: e.era_to,
                      months: e.months,
                    }
                  : undefined,
              )
            }
          >
            <Check className="mr-1 h-4 w-4" />
            {edit ? "Accept with my changes" : "Accept"}
          </Button>
          {!edit && (
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
              Correct
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onDecide(false)}>
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}
