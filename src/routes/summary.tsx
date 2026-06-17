import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Trophy, Clock, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { loadSession, type SessionDetail, type Rating } from "@/lib/session-store";

const summarySchema = z.object({
  deckId: fallback(z.string(), "").default(""),
  total: fallback(z.number().int().min(0), 0).default(0),
  hard: fallback(z.number().int().min(0), 0).default(0),
  medium: fallback(z.number().int().min(0), 0).default(0),
  easy: fallback(z.number().int().min(0), 0).default(0),
  seconds: fallback(z.number().int().min(0), 0).default(0),
  sessionId: fallback(z.string(), "").default(""),
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

const ratingTone: Record<Rating, "success" | "warning" | "destructive"> = {
  easy: "success",
  medium: "warning",
  hard: "destructive",
};

const ratingLabel: Record<Rating, string> = {
  hard: "Hard",
  medium: "Medium",
  easy: "Easy",
};

function Summary() {
  const { deckId, total, hard, medium, easy, seconds, sessionId } =
    Route.useSearch();
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (sessionId) setDetail(loadSession(sessionId));
  }, [sessionId]);

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const avgSec = total ? Math.round(seconds / total) : 0;

  // Group results by subject/topic
  const grouped = new Map<
    string,
    { subject: string; topic: string; counts: Record<Rating, number>; cards: typeof detail extends null ? never : NonNullable<SessionDetail>["results"] }
  >();
  if (detail) {
    for (const r of detail.results) {
      const key = `${r.subject}|||${r.topic}`;
      let g = grouped.get(key);
      if (!g) {
        g = {
          subject: r.subject,
          topic: r.topic,
          counts: { hard: 0, medium: 0, easy: 0 },
          cards: [],
        };
        grouped.set(key, g);
      }
      g.counts[r.rating]++;
      g.cards.push(r);
    }
  }

  const [selected, setSelected] = useState<Rating | null>(null);
  const selectedCards =
    selected && detail ? detail.results.filter((r) => r.rating === selected) : [];

  function toggle(r: Rating) {
    setSelected((s) => (s === r ? null : r));
  }

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

        <div className="mt-8 grid grid-cols-3 gap-3">
          <Stat icon={<Layers className="h-4 w-4" />} label="Cards" value={String(total)} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Total" value={fmtTime(seconds)} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Per card" value={`${avgSec}s`} />
        </div>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            By difficulty {detail ? "· tap to view cards" : ""}
          </h2>
          <div className="space-y-3">
            <Row label="Easy" value={easy} pct={pct(easy)} tone="success"
              active={selected === "easy"} disabled={!detail || easy === 0}
              onClick={() => toggle("easy")} />
            <Row label="Medium" value={medium} pct={pct(medium)} tone="warning"
              active={selected === "medium"} disabled={!detail || medium === 0}
              onClick={() => toggle("medium")} />
            <Row label="Hard" value={hard} pct={pct(hard)} tone="destructive"
              active={selected === "hard"} disabled={!detail || hard === 0}
              onClick={() => toggle("hard")} />
          </div>

          {selected && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">
                Showing {selectedCards.length} {ratingLabel[selected].toLowerCase()} card{selectedCards.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-2">
                {selectedCards.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs text-muted-foreground truncate">
                      {c.subject} · {c.topic}
                    </div>
                    <div className="mt-1 font-medium leading-snug">{c.front_question}</div>
                    <div className="mt-1 text-sm text-muted-foreground leading-snug">{c.back_answer}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>


        {grouped.size > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              By subject · topic
            </h2>
            <div className="space-y-3">
              {Array.from(grouped.values()).map((g) => {
                const gTotal = g.cards.length;
                return (
                  <div
                    key={`${g.subject}-${g.topic}`}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{g.topic}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {g.subject}
                        </div>
                      </div>
                      <div className="text-sm tabular-nums text-muted-foreground shrink-0">
                        {gTotal} card{gTotal === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      <Seg n={g.counts.easy} total={gTotal} className="bg-success" />
                      <Seg n={g.counts.medium} total={gTotal} className="bg-warning" />
                      <Seg n={g.counts.hard} total={gTotal} className="bg-destructive" />
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground tabular-nums">
                      <span><span className="inline-block h-2 w-2 rounded-full bg-success mr-1 align-middle" />{g.counts.easy} easy</span>
                      <span><span className="inline-block h-2 w-2 rounded-full bg-warning mr-1 align-middle" />{g.counts.medium} med</span>
                      <span><span className="inline-block h-2 w-2 rounded-full bg-destructive mr-1 align-middle" />{g.counts.hard} hard</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}




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
              search={{ review: hard + medium > 0 }}
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-semibold grid place-items-center"
            >
              {hard + medium > 0 ? "Review hard & medium" : "Practice again"}
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Seg({ n, total, className }: { n: number; total: number; className: string }) {
  if (!n) return null;
  const w = total ? (n / total) * 100 : 0;
  return <div className={className} style={{ width: `${w}%` }} />;
}

function Row({
  label,
  value,
  pct,
  tone,
  active,
  disabled,
  onClick,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "success" | "warning" | "destructive";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const bar =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
      ? "bg-warning"
      : "bg-destructive";
  const ring =
    tone === "success"
      ? "ring-success"
      : tone === "warning"
      ? "ring-warning"
      : "ring-destructive";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`w-full text-left rounded-2xl border bg-card p-4 transition ${
        active ? `ring-2 ${ring} border-transparent` : "border-border"
      } ${disabled ? "opacity-60 cursor-default" : "cursor-pointer active:scale-[0.99]"}`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">{label}</div>
        <div className="text-sm tabular-nums text-muted-foreground">
          {value} · {pct}%
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
