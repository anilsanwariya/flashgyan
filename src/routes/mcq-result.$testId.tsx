// src/routes/mcq-result.$testId.tsx
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { McqAttempt } from "./mcq.$testId";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Trophy, ChevronDown } from "lucide-react";
import { AppDownloadPopup } from "@/components/app-download-popup";

const STORAGE_KEY = (id: string) => `mcq-attempt:${id}`;

export const Route = createFileRoute("/mcq-result/$testId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Test Result — Flashgyan web" }] }),
  component: Result,
});

function Result() {
  const { testId } = Route.useParams();
  const router = useRouter();
  const [attempt, setAttempt] = useState<McqAttempt | null>(null);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

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
    const timeTakenSec = Math.max(0, Math.round((attempt.endedAt - attempt.startedAt) / 1000));
    return { correct, wrong, unanswered, score, total, timeTakenSec };
  }, [attempt]);

  const handleGoHome = () => {
    setShowDownloadPopup(false);
    router.navigate({ to: "/" });
  };

  if (!attempt || !stats) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div>
          <p className="text-muted-foreground font-medium text-lg">No result found for this test.</p>
          <button
            onClick={() => setShowDownloadPopup(true)}
            className="mt-4 inline-block font-bold text-primary hover:underline"
          >
            Back home
          </button>
        </div>
        <AppDownloadPopup
          isOpen={showDownloadPopup}
          onClose={() => setShowDownloadPopup(false)}
          onContinue={handleGoHome}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-primary/10 via-background to-secondary/10 relative overflow-hidden selection:bg-primary/20">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-40 -left-24 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-32 h-[500px] w-[500px] rounded-full bg-secondary/30 blur-[120px]" />

      {/* Glass Header */}
      <header className="relative z-50 sticky top-0 backdrop-blur-2xl bg-white/40 dark:bg-black/40 border-b border-border/20">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link
            to="/mcq-tests"
            className="inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-sm font-semibold text-foreground/80 bg-white/50 dark:bg-black/40 border border-border/30 backdrop-blur-xl active:scale-95 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> MCQ Tests
          </Link>
          <div className="text-sm font-bold text-foreground/80 tracking-tight">Test Result</div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-5 py-8 space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Hero */}
        <section className="text-center space-y-3">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[32px] bg-primary/10 text-primary border border-primary/25 backdrop-blur-xl shadow-[0_8px_32px_rgba(var(--primary),0.15)] mb-2">
            <Trophy className="h-10 w-10" />
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-primary/80">{attempt.testName}</div>
          <div className="text-6xl font-extrabold tabular-nums tracking-tighter text-foreground drop-shadow-sm">
            {stats.score.toFixed(2)}
          </div>
          <div className="text-sm font-semibold text-muted-foreground">out of {stats.total} points</div>
          <div className="mt-2 text-xs font-bold text-muted-foreground/80 bg-white/50 dark:bg-black/30 inline-block px-3 py-1 rounded-full border border-border/30 backdrop-blur-xl">
            Time taken {formatTime(stats.timeTakenSec)} · Marking +1 / −⅓ / 0
          </div>
        </section>

        {/* Glass Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Correct"
            value={stats.correct}
            tone="text-success"
            glow="shadow-[0_8px_32px_rgba(16,185,129,0.12)] border-success/30"
          />
          <StatBox
            icon={<XCircle className="h-5 w-5" />}
            label="Wrong"
            value={stats.wrong}
            tone="text-destructive"
            glow="shadow-[0_8px_32px_rgba(239,68,68,0.12)] border-destructive/30"
          />
          <StatBox
            icon={<MinusCircle className="h-5 w-5" />}
            label="Skipped"
            value={stats.unanswered}
            tone="text-muted-foreground"
            glow="border-border/30"
          />
        </div>

        <section className="space-y-4 pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Review answers</h2>
          <ul className="space-y-5">
            {attempt.questions.map((q, i) => {
              const userChoice = attempt.answers[q.id];
              const isCorrect = userChoice === q.answer;
              const opts = [q.option_1, q.option_2, q.option_3, q.option_4];

              const glowCls = isCorrect
                ? "border-success/40 shadow-[0_8px_32px_rgba(16,185,129,0.12)]"
                : userChoice === null
                  ? "border-border/30"
                  : "border-destructive/40 shadow-[0_8px_32px_rgba(239,68,68,0.12)]";

              return (
                <li
                  key={q.id}
                  className={`rounded-[32px] border bg-white/50 dark:bg-black/30 backdrop-blur-3xl p-6 md:p-8 space-y-5 transition-colors ${glowCls}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-white/60 dark:bg-black/40 border border-border/30 backdrop-blur-xl px-2.5 py-1 rounded-full">
                      Q{i + 1}
                    </span>
                    <div className="text-xs font-bold">
                      <span
                        className={
                          isCorrect
                            ? "text-success bg-success/10 border border-success/25 backdrop-blur-xl px-2.5 py-1 rounded-full"
                            : userChoice === null
                              ? "text-muted-foreground bg-white/60 border border-border/30 backdrop-blur-xl px-2.5 py-1 rounded-full"
                              : "text-destructive bg-destructive/10 border border-destructive/25 backdrop-blur-xl px-2.5 py-1 rounded-full"
                        }
                      >
                        {isCorrect ? "+1 Point" : userChoice === null ? "0 Points" : "−1/3 Point"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[18px] font-bold leading-snug text-foreground/90">{q.question}</p>

                  {q.image_url && (
                    <div className="relative rounded-3xl overflow-hidden border border-border/30 shadow-sm">
                      <img src={q.image_url} alt="" className="max-h-60 w-full object-contain bg-white/40" />
                    </div>
                  )}

                  {q.hint && (
                    <p className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap text-amber-700 dark:text-amber-400 bg-amber-500/10 p-4 rounded-3xl border border-amber-500/20 backdrop-blur-xl">
                      <strong className="block mb-1 text-xs uppercase tracking-widest">Hint</strong>
                      {q.hint}
                    </p>
                  )}

                  <ul className="space-y-2 pt-2">
                    {opts.map((o, oi) => {
                      const n = oi + 1;
                      const isCorrectOpt = n === q.answer;
                      const isUserOpt = n === userChoice;

                      let optBaseCls =
                        "w-full text-left rounded-[20px] border px-4 py-3 flex items-start gap-3 transition-colors backdrop-blur-xl ";
                      if (isCorrectOpt) optBaseCls += "border-success/40 bg-success/10";
                      else if (isUserOpt) optBaseCls += "border-destructive/40 bg-destructive/10";
                      else optBaseCls += "border-border/30 bg-white/40 dark:bg-black/20";

                      return (
                        <li key={oi} className={optBaseCls}>
                          <div
                            className={
                              "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border " +
                              (isCorrectOpt
                                ? "bg-success text-white border-transparent"
                                : isUserOpt
                                  ? "bg-destructive text-white border-transparent"
                                  : "bg-white/60 text-foreground/60 border-border/40")
                            }
                          >
                            {String.fromCharCode(64 + n)}
                          </div>
                          <div className="flex-1">
                            <span className="text-[15px] font-medium leading-snug text-foreground/90 block mt-0.5">
                              {o}
                            </span>
                            <div className="flex gap-2 mt-1.5">
                              {isCorrectOpt && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-success">
                                  Correct Answer
                                </span>
                              )}
                              {isUserOpt && !isCorrectOpt && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">
                                  Your Answer
                                </span>
                              )}
                              {isUserOpt && isCorrectOpt && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-success">
                                  (Your Answer)
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {userChoice === null && (
                    <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest bg-white/50 inline-block px-3 py-1.5 rounded-full border border-border/30 backdrop-blur-xl">
                      Not answered
                    </div>
                  )}

                  {q.explanation_sections.length > 0 && (
                    <details className="text-sm group border-t border-border/30 pt-4 mt-2">
                      <summary className="cursor-pointer font-bold text-[14px] text-primary flex items-center gap-1.5 list-none">
                        <ChevronDown className="h-4 w-4 transition-transform group-open:-rotate-180" />
                        Explanation
                      </summary>
                      <div className="mt-4 space-y-4 bg-white/40 dark:bg-black/20 backdrop-blur-xl p-5 rounded-3xl border border-border/30">
                        {q.explanation_sections.map((s, si) => (
                          <div key={si}>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                              {s.title}
                            </div>
                            <p className="text-[14px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                              {s.body}
                            </p>
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

        <div className="pt-6">
          <button
            onClick={() => setShowDownloadPopup(true)}
            className="w-full h-14 rounded-[24px] bg-primary/10 text-primary font-semibold text-[17px] border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.1)]"
          >
            Finish & Return Home
          </button>
        </div>
      </main>

      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleGoHome}
      />
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  tone,
  glow,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  glow: string;
}) {
  return (
    <div
      className={`rounded-[28px] bg-white/50 dark:bg-black/30 border backdrop-blur-3xl p-4 text-center ${glow}`}
    >
      <div className={`flex justify-center mb-1.5 ${tone}`}>{icon}</div>
      <div className="text-2xl font-extrabold tabular-nums tracking-tight mb-0.5">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
