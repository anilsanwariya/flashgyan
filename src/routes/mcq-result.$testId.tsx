// src/routes/mcq-result.$testId.tsx
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { McqAttempt } from "./mcq.$testId";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Trophy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
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
    <div className="min-h-dvh bg-background/50 relative overflow-hidden selection:bg-primary/20">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      {/* Glassmorphic Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button asChild variant="outline" className="rounded-xl shadow-sm border-2">
            <Link to="/mcq-tests">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> MCQ Tests
            </Link>
          </Button>
          <div className="text-sm font-bold text-foreground/80 tracking-tight">Test Result</div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8 space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-6 duration-700">
        {/* Premium Hero Score Section */}
        <section className="text-center space-y-3">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[32px] bg-primary/10 text-primary border-2 border-primary/20 shadow-inner mb-2">
            <Trophy className="h-10 w-10" />
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-primary/80">{attempt.testName}</div>
          <div className="text-6xl font-extrabold tabular-nums tracking-tighter text-foreground drop-shadow-sm">
            {stats.score.toFixed(2)}
          </div>
          <div className="text-sm font-semibold text-muted-foreground">out of {stats.total} points</div>
          <div className="mt-2 text-xs font-bold text-muted-foreground/70 bg-muted/40 inline-block px-3 py-1 rounded-full border border-border/40">
            Time taken {formatTime(stats.timeTakenSec)} · Marking +1 / −⅓ / 0
          </div>
        </section>

        {/* Glassmorphic Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Correct"
            value={stats.correct}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <StatBox
            icon={<XCircle className="h-5 w-5" />}
            label="Wrong"
            value={stats.wrong}
            tone="text-red-600 dark:text-red-400"
          />
          <StatBox
            icon={<MinusCircle className="h-5 w-5" />}
            label="Skipped"
            value={stats.unanswered}
            tone="text-muted-foreground"
          />
        </div>

        <section className="space-y-4 pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Review answers</h2>
          <ul className="space-y-5">
            {attempt.questions.map((q, i) => {
              const userChoice = attempt.answers[q.id];
              const isCorrect = userChoice === q.answer;
              const opts = [q.option_1, q.option_2, q.option_3, q.option_4];

              const borderCls = isCorrect
                ? "border-emerald-500/40 shadow-[0_8px_30px_rgba(16,185,129,0.06)]"
                : userChoice === null
                  ? "border-border/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                  : "border-red-500/40 shadow-[0_8px_30px_rgba(239,68,68,0.06)]";

              return (
                <li
                  key={q.id}
                  className={`rounded-[28px] border-2 bg-card p-6 md:p-8 space-y-5 transition-colors ${borderCls}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-lg">
                      Q{i + 1}
                    </span>
                    <div className="text-xs font-bold">
                      <span
                        className={
                          isCorrect
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md"
                            : userChoice === null
                              ? "text-muted-foreground bg-muted px-2 py-1 rounded-md"
                              : "text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-1 rounded-md"
                        }
                      >
                        {isCorrect ? "+1 Point" : userChoice === null ? "0 Points" : "−1/3 Point"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[18px] font-bold leading-snug text-foreground/90">{q.question}</p>

                  {q.image_url && (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm">
                      <img src={q.image_url} alt="" className="max-h-60 w-full object-contain bg-muted/20" />
                    </div>
                  )}

                  {q.hint && (
                    <p className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap text-amber-700 dark:text-amber-400 bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20">
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
                        "w-full text-left rounded-[16px] border-2 px-4 py-3 flex items-start gap-3 transition-colors ";
                      if (isCorrectOpt) optBaseCls += "border-emerald-500/60 bg-emerald-500/10";
                      else if (isUserOpt) optBaseCls += "border-red-500/60 bg-red-500/10";
                      else optBaseCls += "border-border/40 bg-muted/20";

                      return (
                        <li key={oi} className={optBaseCls}>
                          <div
                            className={
                              "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 " +
                              (isCorrectOpt
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : isUserOpt
                                  ? "bg-red-500 text-white border-red-500"
                                  : "bg-muted text-foreground/60 border-border")
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
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                                  Correct Answer
                                </span>
                              )}
                              {isUserOpt && !isCorrectOpt && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400">
                                  Your Answer
                                </span>
                              )}
                              {isUserOpt && isCorrectOpt && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
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
                    <div className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 inline-block px-3 py-1.5 rounded-lg border border-border/40">
                      Not answered
                    </div>
                  )}

                  {q.explanation_sections.length > 0 && (
                    <details className="text-sm group border-t-2 border-border/40 pt-4 mt-2">
                      <summary className="cursor-pointer font-bold text-[14px] text-primary flex items-center gap-1.5 list-none">
                        <ChevronDown className="h-4 w-4 transition-transform group-open:-rotate-180" />
                        Explanation
                      </summary>
                      <div className="mt-4 space-y-4 bg-muted/30 p-5 rounded-2xl border border-border/40">
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
          <Button
            onClick={() => setShowDownloadPopup(true)}
            className="w-full h-14 rounded-2xl font-bold text-lg shadow-lg"
            size="lg"
          >
            Finish & Return Home
          </Button>
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

function StatBox({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[24px] bg-card border-2 border-border/60 p-4 text-center shadow-sm backdrop-blur-md bg-white/60">
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
