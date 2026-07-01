import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getMcqPracticeTest, type McqPracticeQuestion } from "@/lib/mcq-practice.functions";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
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
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-muted-foreground">Practice set not found.</p>
        <Link to="/" className="text-primary mt-2 inline-block font-medium">
          Back home
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-destructive">{error.message}</p>
        <Link to="/" className="text-primary mt-2 inline-block font-medium">
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
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">This practice set has no questions.</p>
          <Link to="/" className="text-primary mt-2 inline-block font-medium">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  function onPick(opt: number) {
    if (answered) return;
    const next = picks.slice();
    next[index] = opt;
    setPicks(next);

    const correct = opt === q.answer;
    if (correct) {
      triggerHaptic("success");
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } else {
      triggerHaptic("error");
    }

    recordRating(q.id, correct ? "easy" : "hard");
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

  const borderCls = answered ? (isCorrect ? "border-success" : "border-destructive") : "border-border/50";

  return (
    <div className="h-dvh flex flex-col bg-background/50 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      {/* Glassmorphic Header */}
      <header className="shrink-0 px-5 pt-4 pb-3 max-w-2xl w-full mx-auto backdrop-blur-xl bg-background/60 sticky top-0 z-50 border-b border-border/40">
        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full h-9 px-4 text-sm font-semibold border-2 border-b-[4px] border-destructive/80 text-destructive hover:-translate-y-0.5 hover:border-b-[5px] active:translate-y-[2px] active:border-b-[2px] transition-all duration-150 bg-background"
              >
                End Session <X className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  You can keep going, or end now and see your summary. Unanswered questions stay unanswered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-success text-success-foreground hover:bg-success/90 border-0">
                  Continue
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => submit(picks)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  End session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="text-sm tabular-nums font-bold text-foreground/80 bg-foreground/5 px-3 py-1 rounded-full border border-border/50">
            {index + 1} / {total}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="truncate">{test.name}</span>
          {review && (
            <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-bold tracking-wide">
              REVIEW
            </span>
          )}
        </div>
        <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60 shadow-inner">
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

      <main className="flex-1 min-h-0 flex flex-col px-5 pt-4 max-w-2xl w-full mx-auto pb-3">
        <div className="w-full relative flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full h-full"
            >
              {/* Premium Card Container */}
              <div
                className={`h-full rounded-[28px] bg-card border-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden transition-colors duration-300 ${borderCls}`}
              >
                <ScrollArea className="h-full">
                  <div className="p-6 md:p-8 space-y-6">
                    <p className="text-[20px] md:text-2xl font-bold leading-snug text-balance text-foreground/90">
                      {q.question}
                    </p>

                    {q.image_url && (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm">
                        <img src={q.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                      </div>
                    )}

                    {q.hint && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-2xl text-[15px] leading-relaxed">
                        <span className="font-bold flex items-center gap-1.5 mb-1">
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

                        // 3D Button Classes
                        let baseCls =
                          "w-full text-left rounded-[20px] border-2 transition-all duration-150 flex items-start gap-4 px-5 py-4 ";

                        if (!answered) {
                          // Unclicked state: Hover off page, thick bottom border
                          baseCls +=
                            "border-border border-b-[6px] bg-background hover:-translate-y-1 hover:border-b-[8px] active:translate-y-[4px] active:border-b-[2px] cursor-pointer shadow-sm";
                        } else {
                          // Clicked State: Squished down into page
                          baseCls += "translate-y-[4px] border-b-[2px] cursor-default ";
                          if (isAnswer) {
                            baseCls +=
                              "border-success bg-success/15 text-foreground shadow-[inset_0_0_0_1px_rgba(34,197,94,0.2)]";
                          } else if (isPick) {
                            baseCls +=
                              "border-destructive bg-destructive/15 text-foreground shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]";
                          } else {
                            baseCls += "opacity-50 border-border bg-background/50";
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
                              className={
                                "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors " +
                                (answered && isAnswer
                                  ? "bg-success text-success-foreground border-success"
                                  : answered && isPick
                                    ? "bg-destructive text-destructive-foreground border-destructive"
                                    : "bg-muted text-foreground/60 border-border")
                              }
                            >
                              {answered && isAnswer ? (
                                <Check className="h-4 w-4" strokeWidth={3} />
                              ) : answered && isPick ? (
                                <X className="h-4 w-4" strokeWidth={3} />
                              ) : (
                                String.fromCharCode(64 + n)
                              )}
                            </div>
                            <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 text-foreground/90">
                              {text}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {answered && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="pt-6 mt-4 border-t-2 border-border/50 space-y-5"
                      >
                        <div
                          className={
                            "text-[15px] font-bold inline-flex items-center gap-2 px-4 py-2 rounded-xl " +
                            (isCorrect ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")
                          }
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
                          <div className="space-y-4 bg-muted/30 p-5 rounded-2xl border border-border/40">
                            {q.explanation_sections.map((s, i) => (
                              <div key={i}>
                                <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5 opacity-80">
                                  {s.title}
                                </div>
                                <p className="text-[15px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
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

          {/* Navigation Overlay Buttons */}
          {index > 0 && (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous question"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-background/80 backdrop-blur-md border-2 border-border shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6 text-foreground/70" />
            </button>
          )}
          {answered && index < total - 1 && (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next question"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-background/80 backdrop-blur-md border-2 border-border shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all animate-in zoom-in duration-300"
            >
              <ChevronRight className="h-6 w-6 text-foreground/70" />
            </button>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-5 pb-6 pt-3 max-w-2xl w-full mx-auto relative z-10">
        <button
          onClick={goNext}
          disabled={!answered}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-lg border-b-[5px] border-primary/80 hover:-translate-y-1 hover:border-b-[6px] active:translate-y-[4px] active:border-b-0 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:border-b-0"
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
