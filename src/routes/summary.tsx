import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Trophy, Clock, Layers, Check, X, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadSession, type SessionDetail, type Rating, type SessionCardResult } from "@/lib/session-store";

const summarySchema = z.object({
  deckId: fallback(z.string(), "").default(""),
  practiceId: fallback(z.string(), "").default(""),
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
    meta: [{ title: "Session summary — Flashgyan web" }],
  }),
  component: Summary,
});

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const ratingLabel: Record<Rating, string> = {
  hard: "Hard",
  medium: "Medium",
  easy: "Easy",
};

function Summary() {
  const { deckId, practiceId, total, hard, medium, easy, seconds, sessionId } =
    Route.useSearch();
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (sessionId) setDetail(loadSession(sessionId));
  }, [sessionId]);

  const isPractice = !!practiceId;
  // In MCQ practice, easy = correct, hard = incorrect (medium unused).
  const correct = easy;
  const incorrect = hard + medium;

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const avgSec = total ? Math.round(seconds / total) : 0;

  // Selection: for practice → "correct" | "incorrect"; for decks → Rating
  const [selectedPractice, setSelectedPractice] = useState<"correct" | "incorrect" | null>(
    null,
  );
  const [selectedRating, setSelectedRating] = useState<Rating | null>(null);

  const filteredCards = useMemo(() => {
    if (!detail) return [];
    if (isPractice) {
      if (!selectedPractice) return [];
      return detail.results.filter((r) =>
        selectedPractice === "correct" ? r.rating === "easy" : r.rating !== "easy",
      );
    }
    if (!selectedRating) return [];
    return detail.results.filter((r) => r.rating === selectedRating);
  }, [detail, isPractice, selectedPractice, selectedRating]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 pt-12 pb-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Session complete</h1>
          <p className="mt-2 text-muted-foreground">
            {total} {isPractice ? "question" : "card"}
            {total === 1 ? "" : "s"} · {fmtTime(seconds)}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <Stat
            icon={<Layers className="h-4 w-4" />}
            label={isPractice ? "Questions" : "Cards"}
            value={String(total)}
          />
          <Stat icon={<Clock className="h-4 w-4" />} label="Total" value={fmtTime(seconds)} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Per item" value={`${avgSec}s`} />
        </div>

        {isPractice ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Results {detail ? "· tap to review questions" : ""}
            </h2>
            <div className="space-y-3">
              <Row
                label="Correct"
                value={correct}
                pct={pct(correct)}
                tone="success"
                active={selectedPractice === "correct"}
                disabled={!detail || correct === 0}
                onClick={() =>
                  setSelectedPractice((s) => (s === "correct" ? null : "correct"))
                }
              />
              <Row
                label="Incorrect"
                value={incorrect}
                pct={pct(incorrect)}
                tone="destructive"
                active={selectedPractice === "incorrect"}
                disabled={!detail || incorrect === 0}
                onClick={() =>
                  setSelectedPractice((s) => (s === "incorrect" ? null : "incorrect"))
                }
              />
            </div>

            {selectedPractice && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-2">
                  Showing {filteredCards.length} {selectedPractice} question
                  {filteredCards.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-3">
                  {filteredCards.map((c, i) => (
                    <McqReviewCard key={c.id} index={i} card={c} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              By difficulty {detail ? "· tap to view cards" : ""}
            </h2>
            <div className="space-y-3">
              <Row
                label="Easy"
                value={easy}
                pct={pct(easy)}
                tone="success"
                active={selectedRating === "easy"}
                disabled={!detail || easy === 0}
                onClick={() =>
                  setSelectedRating((s) => (s === "easy" ? null : "easy"))
                }
              />
              <Row
                label="Medium"
                value={medium}
                pct={pct(medium)}
                tone="warning"
                active={selectedRating === "medium"}
                disabled={!detail || medium === 0}
                onClick={() =>
                  setSelectedRating((s) => (s === "medium" ? null : "medium"))
                }
              />
              <Row
                label="Hard"
                value={hard}
                pct={pct(hard)}
                tone="destructive"
                active={selectedRating === "hard"}
                disabled={!detail || hard === 0}
                onClick={() =>
                  setSelectedRating((s) => (s === "hard" ? null : "hard"))
                }
              />
            </div>

            {selectedRating && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-2">
                  Showing {filteredCards.length} {ratingLabel[selectedRating].toLowerCase()} card
                  {filteredCards.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-2">
                  {filteredCards.map((c) => (
                    <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
                      <div className="text-xs text-muted-foreground truncate">
                        {c.subject} · {c.topic}
                      </div>
                      <div className="mt-1 font-medium leading-snug">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-2">
                          {c.prompt}
                        </span>
                        {c.question}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground leading-snug">
                        {c.answer}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="mt-10 grid grid-cols-2 gap-3">
          <Link
            to="/"
            className="h-12 rounded-2xl border border-border bg-card font-semibold grid place-items-center"
          >
            Home
          </Link>
          {practiceId ? (
            <Link
              to="/practice-mcq/$testId"
              params={{ testId: practiceId }}
              search={{ review: incorrect > 0 }}
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-semibold grid place-items-center"
            >
              {incorrect > 0 ? "Review incorrect" : "Practice again"}
            </Link>
          ) : deckId ? (
            <Link
              to="/practice/$deckId"
              params={{ deckId }}
              search={{ review: hard + medium > 0 }}
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-semibold grid place-items-center"
            >
              {hard + medium > 0 ? "Review" : "Practice again"}
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

function McqReviewCard({ index, card }: { index: number; card: SessionCardResult }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const correct = card.rating === "easy";
  const mcq = card.mcq;

  // Fallback for sessions saved before mcq data was attached.
  if (!mcq) {
    return (
      <li className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground truncate">
          {card.subject} · {card.topic}
        </div>
        <div className="mt-1 font-medium leading-snug">{card.question}</div>
        <div className="mt-1 text-sm text-muted-foreground leading-snug">{card.answer}</div>
      </li>
    );
  }

  const borderCls = correct ? "border-success" : "border-destructive";

  return (
    <li className={`rounded-2xl border-2 bg-card p-5 ${borderCls}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Q{index + 1} · {card.subject}
          {card.topic ? ` · ${card.topic}` : ""}
        </div>
        <div
          className={
            "inline-flex items-center gap-1 text-xs font-semibold " +
            (correct ? "text-success" : "text-destructive")
          }
        >
          {correct ? (
            <>
              <Check className="h-3.5 w-3.5" /> Correct
            </>
          ) : (
            <>
              <X className="h-3.5 w-3.5" /> Incorrect
            </>
          )}
        </div>
      </div>

      <p className="text-base font-semibold leading-snug whitespace-pre-wrap">
        {card.question}
      </p>

      {mcq.imageUrl && (
        <img
          src={mcq.imageUrl}
          alt=""
          className="mt-3 w-full aspect-[2/1] rounded-xl object-cover border border-border"
        />
      )}

      {mcq.hint && (
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
          {mcq.hint}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {mcq.options.map((text, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const isAnswer = n === mcq.answerIndex;
          const isPick = n === mcq.pickedIndex;
          let cls = "border-border bg-background opacity-70";
          if (isAnswer) cls = "border-success bg-success/15 text-foreground opacity-100";
          else if (isPick) cls = "border-destructive bg-destructive/15 text-foreground opacity-100";
          return (
            <div
              key={n}
              className={`w-full text-left rounded-2xl border-2 px-4 py-3 flex items-start gap-3 ${cls}`}
            >
              <div
                className={
                  "h-7 w-7 shrink-0 rounded-full grid place-items-center text-xs font-semibold border " +
                  (isAnswer
                    ? "bg-success text-success-foreground border-success"
                    : isPick
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-muted text-foreground border-border")
                }
              >
                {isAnswer ? (
                  <Check className="h-4 w-4" />
                ) : isPick ? (
                  <X className="h-4 w-4" />
                ) : (
                  String.fromCharCode(64 + n)
                )}
              </div>
              <div className="text-sm leading-snug flex-1 min-w-0 whitespace-pre-wrap">
                {text}
              </div>
            </div>
          );
        })}
      </div>

      {mcq.explanationSections.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowExplanation((s) => !s)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showExplanation ? "rotate-180" : ""}`}
            />
            {showExplanation ? "Hide explanation" : "Show explanation"}
          </button>
          {showExplanation && (
            <div className="mt-3 space-y-4">
              {mcq.explanationSections.map((s, i) => (
                <div key={i}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
                    {s.title}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
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
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive";
  const ring =
    tone === "success" ? "ring-success" : tone === "warning" ? "ring-warning" : "ring-destructive";
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
