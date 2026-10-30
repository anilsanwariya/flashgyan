// Admin: what the AI costs. Every AI call records its tokens (fresh input,
// input written to and read from the prompt cache, output); this page adds
// them up by kind of call and by day, with what prompt caching saved.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiUsage } from "@/lib/ai-usage.functions";
import { cachedShare, costOf, groupCost, type AiCost } from "@/lib/ai-usage";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

const RANGES = [7, 30, 90] as const;

const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function AiUsagePanel() {
  const fn = useServerFn(getAiUsage);
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const q = useQuery({ queryKey: ["aiUsage", days], queryFn: () => fn({ data: { days } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  if (!q.data?.ready)
    return (
      <p className="rounded-lg bg-amber-500/10 p-3 text-sm">
        Run the migration <code>20261210090000_ai_usage.sql</code> to start recording AI usage.
      </p>
    );
  const rows = q.data.rows;
  const all = costOf(rows);
  const kinds = groupCost(rows, (r) => r.label);
  const byDay = groupCost(rows, (r) => r.day).sort((a, b) => b.key.localeCompare(a.key));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Every AI call&apos;s tokens, added up. Costs are estimates from Claude&apos;s list prices.
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
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No AI calls recorded in this period yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
            <Stat label="Spent (estimate)" value={usd(all.cost)} />
            <Stat
              label="Saved by caching"
              value={usd(Math.max(0, all.without - all.cost))}
              note={
                all.without
                  ? `${pct(Math.max(0, all.without - all.cost) / all.without)} of the cost without it`
                  : undefined
              }
            />
            <Stat
              label="Input read from the cache"
              value={pct(cachedShare(all))}
              note={`${tokens(all.read)} of ${tokens(all.input + all.write + all.read)} tokens`}
            />
            <Stat label="AI calls" value={all.calls.toLocaleString()} />
          </div>
          <section aria-label="By kind of call" className="space-y-2">
            <h2 className="font-semibold">By kind of call</h2>
            <p className="text-xs text-muted-foreground">
              Named by the start of each call&apos;s instructions. A low cached share on a kind that
              runs many times in a row means its instructions change from call to call.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Kind of call</th>
                    <th className="p-2 text-right">Calls</th>
                    <th className="p-2 text-right">Input</th>
                    <th className="p-2 text-right">Cached</th>
                    <th className="p-2 text-right">Output</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {kinds.map((k) => (
                    <Row key={k.key} name={k.key} c={k.cost} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-label="By day" className="space-y-2">
            <h2 className="font-semibold">By day</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Day</th>
                    <th className="p-2 text-right">Calls</th>
                    <th className="p-2 text-right">Input</th>
                    <th className="p-2 text-right">Cached</th>
                    <th className="p-2 text-right">Output</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((d) => (
                    <Row key={d.key} name={d.key} c={d.cost} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Row({ name, c }: { name: string; c: AiCost }) {
  return (
    <tr className="border-t border-border" data-usage-row={name}>
      <td className="max-w-[22rem] p-2">
        <span className="line-clamp-2" title={name}>
          {name}
        </span>
      </td>
      <td className="p-2 text-right tabular-nums">{c.calls.toLocaleString()}</td>
      <td className="p-2 text-right tabular-nums">{tokens(c.input + c.write + c.read)}</td>
      <td className="p-2 text-right tabular-nums">{pct(cachedShare(c))}</td>
      <td className="p-2 text-right tabular-nums">{tokens(c.output)}</td>
      <td className="p-2 text-right tabular-nums">{usd(c.cost)}</td>
      <td className="p-2 text-right tabular-nums">{usd(Math.max(0, c.without - c.cost))}</td>
    </tr>
  );
}
