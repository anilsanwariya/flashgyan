import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { McqAttempt } from "./mcq.$testId";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

const STORAGE_KEY = (id: string) => `mcq-attempt:${id}`;

export const Route = createFileRoute("/mcq-result/$testId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Test Result — Flashgyan web" }] }),
  component: Result,
});

function Result() {
  const { testId } = Route.useParams();
  const [attempt, setAttempt] = useState<McqAttempt | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY(testId));
      if (raw) setAttempt(JSON.parse(raw) as McqAttempt);
    } catch {
      /* ignore */
    }
  }, [testId]);

  const stats = useMemo(() => {
    if (!attempt) return null;
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const q of attempt.questions) {
      const a = attempt.answers[q.id];
      if (a === null || a === undefined) unanswered++;
      else if (a === q.answer) correct++;
      else wrong++;
    }
    const score = correct * 1 - wrong * (1 / 3);
    const total = attempt.questions.length;
    const timeTakenSec = Math.max(
      0,
      Math.round((attempt.endedAt - attempt.startedAt) / 1000),
    );
    return { correct, wrong, unanswered, score, total, timeTakenSec };
  }, [attempt]);

  if (!attempt || !stats) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">No result found for this test.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="text-sm font-semibold">Result</div>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6 space-y-6 pb-24">
        <section className="rounded-2xl border border-border bg-card p-5 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {attempt.testName}
          </div>
          <div className="mt-2 text-4xl font-extrabold tabular-nums">
            {stats.score.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground">out of {stats.total}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <StatPill
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Correct"
              value={stats.correct}
              tone="text-emerald-600 dark:text-emerald-400"
            />
            <StatPill
              icon={<XCircle className="h-4 w-4" />}
              label="Wrong"
              value={stats.wrong}
              tone="text-red-600 dark:text-red-400"
            />
            <StatPill
              icon={<MinusCircle className="h-4 w-4" />}
              label="Skipped"
              value={stats.unanswered}
              tone="text-muted-foreground"
            />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Time taken {formatTime(stats.timeTakenSec)} · Marking +1 / −⅓ / 0
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Review answers
          </h2>
          <ul className="space-y-3">
            {attempt.questions.map((q, i) => {
              const userChoice = attempt.answers[q.id];
              const isCorrect = userChoice === q.answer;
              const opts = [q.option_1, q.option_2, q.option_3, q.option_4];
              return (
                <li
                  key={q.id}
                  className="rounded-2xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      Q{i + 1}
                    </span>
                    <p className="text-sm font-medium leading-relaxed flex-1">
                      {q.question}
                    </p>
                  </div>
                  {q.image_url && (
                    <img
                      src={q.image_url}
                      alt=""
                      className="max-h-60 w-full object-contain rounded-lg border border-border"
                    />
                  )}
                  {q.hint && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold">Hint:</span> {q.hint}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {opts.map((o, oi) => {
                      const n = oi + 1;
                      const isCorrectOpt = n === q.answer;
                      const isUserOpt = n === userChoice;
                      return (
                        <li
                          key={oi}
                          className={
                            "rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-2 " +
                            (isCorrectOpt
                              ? "border-emerald-500/60 bg-emerald-500/10"
                              : isUserOpt
                                ? "border-red-500/60 bg-red-500/10"
                                : "border-border")
                          }
                        >
                          <span className="font-semibold">{n}.</span>
                          <span className="flex-1">{o}</span>
                          {isCorrectOpt && (
                            <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              Correct
                            </span>
                          )}
                          {isUserOpt && !isCorrectOpt && (
                            <span className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-300">
                              Your answer
                            </span>
                          )}
                          {isUserOpt && isCorrectOpt && (
                            <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              Your answer
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {userChoice === null && (
                    <div className="text-xs text-muted-foreground italic">Not answered</div>
                  )}
                  <div className="text-xs">
                    <span
                      className={
                        isCorrect
                          ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                          : userChoice === null
                            ? "text-muted-foreground font-semibold"
                            : "text-red-600 dark:text-red-400 font-semibold"
                      }
                    >
                      {isCorrect
                        ? "+1"
                        : userChoice === null
                          ? "0"
                          : "−1/3"}
                    </span>
                  </div>
                  {q.explanation_sections.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-primary font-medium text-xs">
                        Show explanation
                      </summary>
                      <div className="mt-2 space-y-2">
                        {q.explanation_sections.map((s, si) => (
                          <div key={si}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {s.title}
                            </div>
                            <p className="text-sm mt-0.5 whitespace-pre-wrap">{s.body}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border p-2">
      <div className={"inline-flex items-center gap-1 text-xs " + tone}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
