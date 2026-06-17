import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Trophy } from "lucide-react";

const summarySchema = z.object({
  deckId: fallback(z.string(), "").default(""),
  total: fallback(z.number().int().min(0), 0).default(0),
  hard: fallback(z.number().int().min(0), 0).default(0),
  medium: fallback(z.number().int().min(0), 0).default(0),
  easy: fallback(z.number().int().min(0), 0).default(0),
  seconds: fallback(z.number().int().min(0), 0).default(0),
});

export const Route = createFileRoute("/summary")({
  validateSearch: zodValidator(summarySchema),
  beforeLoad: ({ search }) => {
    if (!search.total) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Session summary — Flashly" }],
  }),
  component: Summary,
});

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function Summary() {
  const { deckId, total, hard, medium, easy, seconds } = Route.useSearch();
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 pt-12 pb-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
            Session complete
          </h1>
          <p className="mt-2 text-muted-foreground">
            {total} card{total === 1 ? "" : "s"} · {fmtTime(seconds)}
          </p>
        </div>

        <div className="mt-10 space-y-3">
          <Row label="Easy" value={easy} pct={pct(easy)} tone="success" />
          <Row label="Medium" value={medium} pct={pct(medium)} tone="warning" />
          <Row label="Hard" value={hard} pct={pct(hard)} tone="destructive" />
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3">
          <Link
            to="/"
            className="h-12 rounded-2xl border border-border bg-card font-semibold grid place-items-center"
          >
            All decks
          </Link>
          {deckId ? (
            <Link
              to="/practice/$deckId"
              params={{ deckId }}
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-semibold grid place-items-center"
            >
              Practice again
            </Link>
          ) : (
            <Link
              to="/"
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-semibold grid place-items-center"
            >
              Done
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "success" | "warning" | "destructive";
}) {
  const bar =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
      ? "bg-warning"
      : "bg-destructive";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">{label}</div>
        <div className="text-sm tabular-nums text-muted-foreground">
          {value} · {pct}%
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
