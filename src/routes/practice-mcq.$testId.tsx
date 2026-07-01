import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getMcqPracticeTest, type McqPracticeQuestion } from "@/lib/mcq-practice.functions";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
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
import { AppDownloadPopup } from "@/components/app-download-popup"; // Added import

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

  // Added states for popup interception
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

    // Save navigation data and trigger popup instead of navigating immediately
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

  const borderCls = answered ? (isCorrect ? "border-success" : "border-destructive") : "border-border";

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <header className="shrink-0 px-5 pt-4 pb-3 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full h-9 px-4 text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> End Session
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
          <div className="text-sm tabular-nums text-muted-foreground">
            {index + 1} / {total}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{test.name}</span>
          {review && (
            <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
              Review mode
            </span>
          )}
        </div>
        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${(stats.correct / total) * 100}%` }}
          />
          <div
            className="h-full bg-destructive transition-all duration-300"
            style={{ width: `${(stats.wrong / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col px-5 max-w-2xl w-full mx-auto pb-3">
        <div className="w-full relative flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="w-full h-full"
            >
              <div
                className={`h-full rounded-3xl bg-card border-2 shadow-sm overflow-hidden transition-colors ${borderCls}`}
              >
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-5">
                    <p className="text-xl font-semibold leading-snug text-balance">{q.question}</p>
                    {q.image_url && (
                      <img
                        src={q.image_url}
                        alt=""
                        className="w-full aspect-[2/1] rounded-xl object-cover border border-border"
                      />
                    )}
                    {q.hint && (
                      <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground/85">{q.hint}</p>
                    )}

                    <div className="space-y-2.5">
                      {[1, 2, 3, 4].map((n) => {
                        const text = q[`option_${n}` as `option_${1 | 2 | 3 | 4}`];
                        const isAnswer = n === q.answer;
                        const isPick = pick === n;

                        // Add shake class if this button was picked and is wrong
                        const shakeCls = answered && isPick && !isAnswer ? "animate-shake" : "";

                        let cls = "border-border bg-background hover:bg-accent active:scale-[0.99]";
                        if (answered) {
                          if (isAnswer) {
                            cls = "border-success bg-success/15 text-foreground";
                          } else if (isPick) {
                            cls = "border-destructive bg-destructive/15 text-foreground";
                          } else {
                            cls = "border-border bg-background opacity-70";
                          }
                        }

                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={answered}
                            onClick={() => onPick(n)}
                            className={`w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-colors flex items-start gap-3 ${cls} ${shakeCls} ${
                              answered ? "cursor-default" : "cursor-pointer"
                            }`}
                          >
                            <div
                              className={
                                "h-7 w-7 shrink-0 rounded-full grid place-items-center text-xs font-semibold border " +
                                (answered && isAnswer
                                  ? "bg-success text-success-foreground border-success"
                                  : answered && isPick
                                    ? "bg-destructive text-destructive-foreground border-destructive"
                                    : "bg-muted text-foreground border-border")
                              }
                            >
                              {answered && isAnswer ? (
                                <Check className="h-4 w-4" />
                              ) : answered && isPick ? (
                                <X className="h-4 w-4" />
                              ) : (
                                String.fromCharCode(64 + n)
                              )}
                            </div>
                            <div className="text-sm leading-snug flex-1 min-w-0 whitespace-pre-wrap">{text}</div>
                          </button>
                        );
                      })}
                    </div>

                    {answered && (
                      <div className="pt-3 border-t border-border space-y-4">
                        <div
                          className={
                            "text-sm font-semibold inline-flex items-center gap-1.5 " +
                            (isCorrect ? "text-success" : "text-destructive")
                          }
                        >
                          {isCorrect ? (
                            <>
                              <Check className="h-4 w-4" /> Correct
                            </>
                          ) : (
                            <>
                              <X className="h-4 w-4" /> Incorrect
                            </>
                          )}
                        </div>
                        {q.explanation_sections.map((s, i) => (
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
                </ScrollArea>
              </div>
            </motion.div>
          </AnimatePresence>

          {index > 0 && (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous question"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/60 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center hover:bg-background/80 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {answered && index < total - 1 && (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next question"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/60 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center hover:bg-background/80 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-5 pb-6 pt-2 max-w-2xl w-full mx-auto">
        <button
          onClick={goNext}
          disabled={!answered}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base shadow-sm active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {!answered ? "Pick an answer" : index >= total - 1 ? "Finish" : "Next"}
        </button>
      </footer>

      {/* Added App Download Popup */}
      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleContinueToSummary}
      />
    </div>
  );
}

export type { McqPracticeQuestion };
