import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getMcqPracticeTest, type McqPracticeQuestion } from "@/lib/mcq-practice.functions";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Check, X, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { triggerHaptic } from "../lib/haptics";
import confetti from "canvas-confetti";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  loadReview,
  saveReview,
  applyReviewOrder,
  newSessionId,
  saveSession,
  type Rating,
  type SessionCardResult,
} from "@/lib/session-store";
import { AppDownloadPopup } from "@/components/app-download-popup";

const testQO = (id: string) =>
  queryOptions({
    queryKey: ["mcqPractice", id],
    queryFn: () => getMcqPracticeTest({ data: { id } }),
  });

const searchSchema = z.object({
  review: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/practice-mcq/$testId")({
  validateSearch: zodValidator(searchSchema),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(testQO(params.testId)),
  component: PracticeMcq,
  notFoundComponent: () => (
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-muted-foreground font-medium">Practice set not found.</p>
        <Link to="/" className="text-primary mt-2 inline-block font-semibold">
          Back home
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-destructive font-semibold">{error.message}</p>
        <Link to="/" className="text-primary mt-2 inline-block font-semibold">
          Back home
        </Link>
      </div>
    </div>
  ),
});

function PracticeMcq() {
  const { testId } = Route.useParams();
  const { review } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(testQO(testId));
  const { test, questions: qRaw } = data;

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [navData, setNavData] = useState<any>(null);

  const [questions] = useState(() => {
    if (review) {
      const state = loadReview(testId);
      const ordered = applyReviewOrder(qRaw, state);
      return ordered.length > 0 ? ordered : qRaw.slice();
    }
    return qRaw.slice();
  });

  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null));
  const startedAt = useRef(Date.now());

  const total = questions.length;
  const q = questions[index];
  const pick = picks[index];
  const answered = pick !== null;
  const isCorrect = answered && pick === q?.answer;

  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (p === null) unanswered++;
      else if (p === questions[i].answer) correct++;
      else wrong++;
    }
    return { correct, wrong, unanswered };
  }, [picks, questions]);

  const reviewRef = useRef(loadReview(testId));
  function recordRating(qId: string, rating: Rating) {
    reviewRef.current[qId] = rating;
    saveReview(testId, reviewRef.current);
  }

  if (total === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
        <div>
          <p className="text-muted-foreground font-medium">This practice set has no questions.</p>
          <Link to="/" className="text-primary mt-2 inline-block font-semibold">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  function onPick(opt: number) {
    if (answered) return;

    // 1. INSTANT STATE UPDATE
    const next = picks.slice();
    next[index] = opt;
    setPicks(next);

    const correct = opt === q.answer;

    // 2. INSTANT CONFETTI & HAPTICS (Using web worker to avoid lagging the UI thread)
    if (correct) {
      triggerHaptic("success");
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          disableForReducedMotion: true,
          useWorker: true,
        });
      } catch (e) {
        // Ignore
      }
    } else {
      triggerHaptic("error");
    }

    // 3. DEFER STORAGE SAVE so it doesn't block the click animation
    setTimeout(() => {
      recordRating(q.id, correct ? "easy" : "hard");
    }, 100);
  }

  function submit(finalPicks: (number | null)[]) {
    const endedAt = Date.now();
    const seconds = Math.round((endedAt - startedAt.current) / 1000);
    const sessionId = newSessionId();
    const results: SessionCardResult[] = [];
    questions.forEach((qq, i) => {
      const p = finalPicks[i];
      if (p === null) return;
      const correct = p === qq.answer;
      const rating: Rating = correct ? "easy" : "hard";
      const answerText = qq[`option_${qq.answer}` as `option_${1 | 2 | 3 | 4}`];
      const pickedText = qq[`option_${p}` as `option_${1 | 2 | 3 | 4}`];
      results.push({
        id: qq.id,
        subject: test.subject || test.name,
        topic: test.topic || "",
        prompt: correct ? "Correct" : "Incorrect",
        question: qq.question,
        answer: correct ? answerText : `Your answer: ${pickedText} · Correct: ${answerText}`,
        rating,
        mcq: {
          options: [qq.option_1, qq.option_2, qq.option_3, qq.option_4],
          answerIndex: qq.answer as 1 | 2 | 3 | 4,
          pickedIndex: p as 1 | 2 | 3 | 4,
          explanationSections: qq.explanation_sections,
          imageUrl: qq.image_url,
          hint: qq.hint,
        },
      });
    });
    const counts = { hard: 0, medium: 0, easy: 0 };
    for (const r of results) counts[r.rating]++;
    saveSession(sessionId, {
      deckId: testId,
      subject: test.subject || test.name,
      topic: test.topic || "",
      startedAt: startedAt.current,
      endedAt,
      results,
    });

    setNavData({
      deckId: "",
      practiceId: testId,
      total: results.length,
      hard: counts.hard,
      medium: counts.medium,
      easy: counts.easy,
      seconds,
      sessionId,
    });
    setShowDownloadPopup(true);
  }

  function handleContinueToSummary() {
    setShowDownloadPopup(false);
    if (navData) {
      navigate({
        to: "/summary",
        search: navData,
      });
    }
  }

  function goPrev() {
    if (index > 0) setIndex(index - 1);
  }

  function goNext() {
    if (!answered) return;
    if (index < total - 1) setIndex(index + 1);
    else submit(picks);
  }

  // OPTIMIZATION: The background color of the glass card is strictly locked to white/black.
  // ONLY the border and shadow change color. This eliminates massive DOM repaints.
  const baseBg = "bg-white/60 dark:bg-black/40";
  const borderClass = answered
    ? isCorrect
      ? `border-success/60 shadow-[0_8px_32px_rgba(16,185,129,0.15)] ${baseBg}`
      : `border-destructive/60 shadow-[0_8px_32px_rgba(239,68,68,0.15)] ${baseBg}`
    : `border-border/30 shadow-[0_8px_32px_rgba(0,0,0,0.08)] ${baseBg}`;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 via-background to-secondary/10 -z-10 pointer-events-none" />
      <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[50%] rounded-full bg-primary/10 blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-[40%] -right-[20%] w-[50%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] -z-10 pointer-events-none" />

      <header className="shrink-0 px-5 pt-4 pb-3 max-w-2xl w-full mx-auto backdrop-blur-2xl bg-white/40 dark:bg-black/40 sticky top-0 z-50 border-b border-border/20">
        <div className="flex items-center justify-between mt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full h-8 px-4 text-[13px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 active:scale-95 transition-all"
              >
                End Session <X className="h-3.5 w-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[28px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border-white/20 shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-center text-xl">End Session?</AlertDialogTitle>
                <AlertDialogDescription className="text-center">
                  You can keep going, or end now and see your summary. Unanswered questions stay unanswered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2 mt-4 sm:space-x-0">
                <AlertDialogAction
                  onClick={() => submit(picks)}
                  className="w-full rounded-2xl font-semibold bg-destructive hover:bg-destructive/90 text-white h-12 active:scale-95 transition-transform"
                >
                  End session
                </AlertDialogAction>
                <AlertDialogCancel className="w-full rounded-2xl font-semibold bg-secondary/50 border-0 hover:bg-secondary/70 h-12 m-0 active:scale-95 transition-transform">
                  Continue
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="text-[13px] font-medium text-muted-foreground/80 tracking-widest bg-black/5 dark:bg-white/10 px-3 py-1 rounded-full border border-black/5 dark:border-white/5">
            {index + 1} OF {total}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-foreground/70">
          <span className="truncate">{test.name}</span>
          {review && (
            <span className="shrink-0 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 font-semibold text-[10px] tracking-widest uppercase">
              REVIEW
            </span>
          )}
        </div>
        <div className="mt-3 flex h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full bg-success transition-all duration-500 ease-out"
            style={{ width: `${(stats.correct / total) * 100}%` }}
          />
          <div
            className="h-full bg-destructive transition-all duration-500 ease-out"
            style={{ width: `${(stats.wrong / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col px-5 pt-6 max-w-2xl w-full mx-auto pb-4">
        <div className="w-full h-full relative [perspective:1200px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full h-full relative"
            >
              <div
                className={`w-full h-full rounded-[36px] backdrop-blur-3xl border transition-colors duration-500 ${borderClass} overflow-hidden flex flex-col`}
              >
                <ScrollArea className="h-full flex-1">
                  <div className="p-7 md:p-8 space-y-6">
                    <p className="text-[20px] md:text-[24px] font-semibold leading-tight text-balance text-foreground/90 tracking-tight">
                      {q.question}
                    </p>

                    {q.image_url && (
                      <div className="relative rounded-[24px] overflow-hidden border border-border/30 shadow-sm">
                        <img src={q.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                      </div>
                    )}

                    {q.hint && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-[20px] text-[15px] font-medium leading-relaxed">
                        <span className="font-bold flex items-center gap-1.5 mb-1.5 text-xs uppercase tracking-widest opacity-80">
                          <Sparkles className="h-4 w-4" /> Hint
                        </span>
                        {q.hint}
                      </div>
                    )}

                    <div className="space-y-3 pt-2">
                      {[1, 2, 3, 4].map((n) => {
                        const text = q[`option_${n}` as `option_${1 | 2 | 3 | 4}`];
                        const isAnswer = n === q.answer;
                        const isPick = pick === n;

                        const shakeCls = answered && isPick && !isAnswer ? "animate-shake" : "";

                        let baseCls =
                          "w-full text-left rounded-[24px] border transition-all duration-300 flex items-start gap-4 px-5 py-4 ";

                        if (!answered) {
                          baseCls +=
                            "border-border/30 bg-white/40 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-black/60 active:scale-[0.98] shadow-sm backdrop-blur-md cursor-pointer";
                        } else {
                          baseCls += "cursor-default backdrop-blur-md ";
                          if (isAnswer) {
                            baseCls += "border-success/40 bg-success/15 text-foreground shadow-sm";
                          } else if (isPick) {
                            baseCls += "border-destructive/40 bg-destructive/15 text-foreground shadow-sm";
                          } else {
                            baseCls += "opacity-50 border-border/20 bg-background/20";
                          }
                        }

                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={answered}
                            onClick={() => onPick(n)}
                            className={`${baseCls} ${shakeCls}`}
                          >
                            <div
                              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold border transition-colors ${
                                answered && isAnswer
                                  ? "bg-success text-white border-success"
                                  : answered && isPick
                                    ? "bg-destructive text-white border-destructive"
                                    : "bg-white/50 dark:bg-black/50 text-foreground/60 border-border/40"
                              }`}
                            >
                              {answered && isAnswer ? (
                                <Check className="h-4 w-4" strokeWidth={3} />
                              ) : answered && isPick ? (
                                <X className="h-4 w-4" strokeWidth={3} />
                              ) : (
                                String.fromCharCode(64 + n)
                              )}
                            </div>
                            <div className="text-[16px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 text-foreground/90">
                              {text}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {answered && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="pt-6 mt-4 border-t border-border/20 space-y-5"
                      >
                        <div
                          className={`text-[15px] font-semibold inline-flex items-center gap-2 px-4 py-2.5 rounded-[16px] border ${
                            isCorrect
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <Check className="h-5 w-5" strokeWidth={3} /> You got it right!
                            </>
                          ) : (
                            <>
                              <X className="h-5 w-5" strokeWidth={3} /> Incorrect Answer
                            </>
                          )}
                        </div>

                        {q.explanation_sections.length > 0 && (
                          <div className="space-y-5 bg-black/5 dark:bg-white/5 p-6 rounded-[24px] border border-border/10">
                            {q.explanation_sections.map((s, i) => (
                              <div key={i}>
                                <div className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 mb-2">
                                  {s.title}
                                </div>
                                <p className="text-[15px] text-foreground/70 leading-relaxed whitespace-pre-wrap">
                                  {s.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          </AnimatePresence>

          {index > 0 && (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous question"
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all"
            >
              <ChevronLeft className="h-6 w-6 text-foreground/80 ml-[-2px]" />
            </button>
          )}
          {answered && index < total - 1 && (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next question"
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all animate-in zoom-in duration-300"
            >
              <ChevronRight className="h-6 w-6 text-foreground/80 mr-[-2px]" />
            </button>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-5 pb-safe pt-2 max-w-2xl w-full mx-auto relative z-10 mb-6">
        <button
          onClick={goNext}
          disabled={!answered}
          className="w-full h-[52px] rounded-[24px] bg-primary/10 text-primary font-semibold text-[17px] border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {!answered ? "Pick an answer" : index >= total - 1 ? "Finish Session" : "Next Question"}
        </button>
      </footer>

      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleContinueToSummary}
      />
    </div>
  );
}

export type { McqPracticeQuestion };
