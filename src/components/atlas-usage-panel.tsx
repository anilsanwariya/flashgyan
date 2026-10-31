// How students use the atlas (admin): the places and districts they open
// most, the districts they get wrong most in the map quiz, what they
// searched for and didn't find, the daily challenge, and the places with
// the most mistake reports. Counted by day; no student is identified.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { atlasUsageView } from "@/lib/atlas.functions";
import { placePath } from "@/lib/atlas";
import { errorText } from "@/components/ca-ui";

const MIGRATION = "Usage needs the migration 20261218090000_atlas_usage.sql.";

export function AtlasUsage() {
  const fn = useServerFn(atlasUsageView);
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["atlasUsage", days],
    queryFn: () => fn({ data: { days } }),
    refetchOnMount: "always",
  });
  const d = q.data;
  return (
    <div className="space-y-4" data-atlas-usage>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Counted by day; no student is identified. Places and districts count each time a card or
          page opens.
        </p>
        <div className="ml-auto flex gap-1">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === n}
              onClick={() => setDays(n)}
              className={`rounded-full border px-3 py-1 text-xs ${days === n ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>
      ) : !d?.ready ? (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{MIGRATION}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Places opened most" empty={!d.places.length}>
            <ol className="space-y-0.5 text-sm" data-usage-places>
              {d.places.map((p) => (
                <li key={p.key} className="flex gap-2">
                  <a href={placePath(p.key)} target="_blank" rel="noreferrer" className="underline">
                    {p.name}
                  </a>
                  <span className="text-muted-foreground">{p.district}</span>
                  <span className="ml-auto tabular-nums">{p.n}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Districts opened most" empty={!d.districts.length}>
            <ol className="space-y-0.5 text-sm">
              {d.districts.map((x) => (
                <li key={x.district} className="flex">
                  {x.district}
                  <span className="ml-auto tabular-nums">{x.n}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card
            title="Hardest districts in the map quiz"
            note="Share of wrong answers (districts with 5 answers or more)."
            empty={!d.quiz.length}
          >
            <ol className="space-y-1 text-sm" data-usage-quiz>
              {d.quiz.map((x) => (
                <li key={x.district} className="flex items-center gap-2">
                  <span className="w-32 shrink-0">{x.district}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-red-400" style={{ width: `${x.wrongPct}%` }} />
                  </span>
                  <span className="w-20 text-right tabular-nums">
                    {x.wrongPct}% of {x.answers}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card
            title="Searched for, not found"
            note="What students typed in the atlas search that found nothing: places or spellings to add."
            empty={!d.searches.length}
          >
            <div className="flex flex-wrap gap-1" data-usage-searches>
              {d.searches.map((s) => (
                <span key={s.q} className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {s.q} <span className="text-muted-foreground">×{s.n}</span>
                </span>
              ))}
            </div>
          </Card>
          <Card
            title="Most reported places and districts"
            note="Students' mistake reports (all time): open / all."
            empty={!d.reports.length}
          >
            <ol className="space-y-0.5 text-sm">
              {d.reports.map((r) => (
                <li key={r.key} className="flex gap-2">
                  {r.label}
                  <span className="ml-auto tabular-nums">
                    {r.open} / {r.all}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="By day" empty={!d.byDay.length}>
            <table className="w-full text-sm" data-usage-days>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Day</th>
                  <th>Places</th>
                  <th>Districts</th>
                  <th>Quiz answers</th>
                  <th>Daily</th>
                  <th>Not found</th>
                </tr>
              </thead>
              <tbody>
                {d.byDay.map((x) => (
                  <tr key={x.day} className="border-t border-border tabular-nums">
                    <td className="py-1">{x.day}</td>
                    <td>{x.place ?? 0}</td>
                    <td>{x.district ?? 0}</td>
                    <td>{x.quiz ?? 0}</td>
                    <td>{x.daily ?? 0}</td>
                    <td>{x.search_miss ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  note,
  empty,
  children,
}: {
  title: string;
  note?: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border p-4">
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {empty ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : children}
    </section>
  );
}
