// Admin: the north-star number. Practice sessions students finished each day
// (flashcards and MCQ practice to their summary page, MCQ tests to their result).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPracticeSessions } from "@/lib/practice-sessions.functions";
import { SESSION_KINDS, SESSION_KIND_LABELS, type SessionDay } from "@/lib/practice-sessions";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

const RANGES = [7, 30, 90] as const;

const total = (d: SessionDay) => SESSION_KINDS.reduce((sum, k) => sum + d[k], 0);

export function PracticeSessionsPanel() {
  const fn = useServerFn(getPracticeSessions);
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const q = useQuery({
    queryKey: ["practiceSessions", days],
    queryFn: () => fn({ data: { days } }),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!q.data?.ready)
    return (
      <p className="rounded-lg bg-amber-500/10 p-3 text-sm">
        Run the migration <code>20261225090000_practice_sessions.sql</code> to start counting
        finished practice sessions.
      </p>
    );

  const rows = q.data.days;
  const today = rows[0];
  const sum = rows.reduce((s, d) => s + total(d), 0);
  const best = rows.reduce((b, d) => Math.max(b, total(d)), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Your north-star number: practice sessions students finished each day (India time). A
          session counts once, when it reaches its summary or result page. No student is identified.
        </p>
        <div className="flex gap-1" role="group" aria-label="Period">
          {RANGES.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d} days
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
        <Stat label="Today so far" value={today ? total(today) : 0} />
        <Stat label="Average per day" value={Math.round(sum / rows.length)} />
        <Stat label="Best day" value={best} />
        <Stat label={`Total, ${days} days`} value={sum} />
      </div>

      {sum === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions finished in this period yet.</p>
      ) : (
        <section aria-label="By day" className="space-y-2">
          <h2 className="font-semibold">By day</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Day</th>
                  {SESSION_KINDS.map((k) => (
                    <th key={k} className="p-2 text-right">
                      {SESSION_KIND_LABELS[k]}
                    </th>
                  ))}
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.day} className="border-t border-border">
                    <td className="p-2">{d.day}</td>
                    {SESSION_KINDS.map((k) => (
                      <td key={k} className="p-2 text-right tabular-nums">
                        {d[k]}
                      </td>
                    ))}
                    <td className="p-2 text-right font-semibold tabular-nums">{total(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
