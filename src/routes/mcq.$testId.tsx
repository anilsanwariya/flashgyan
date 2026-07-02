import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMcqTest, type McqQuestion } from "@/lib/mcq.functions";
import { ChevronLeft, ChevronRight, Timer, X, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { AppDownloadPopup } from "@/components/app-download-popup";
import { triggerHaptic } from "@/lib/haptics";

const testQO = (id: string) =>
  queryOptions({
    queryKey: ["mcqTest", id],
    queryFn: () => getMcqTest({ data: { id } }),
  });

export const Route = createFileRoute("/mcq/$testId")({
  ssr: false,
  head: () => ({ meta: [{ title: "MCQ Test — Flashgyan web" }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(testQO(params.testId)),
  component: TakeTest,
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
  notFoundComponent: () => (
    <div className="p-6 text-center font-medium text-muted-foreground min-h-dvh flex items-center justify-center bg-background">
      Test not found.
    </div>
  ),
});

function TakeTest() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(testQO(testId));
  const { test, questions } = data;

  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null));
  // FIXED: Reverted to duration_seconds to prevent NaN errors
  const [timeLeft, setTimeLeft] = useState(test.duration_seconds || 0);
  const startedAt = useRef(Date.now());
  const paletteRef = useRef<HTMLDivElement>(null);

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState(false);

  const total = questions.length;
  const q = questions[index];
  const pick = picks[index];

  // Auto-scroll the horizontal palette to keep the active question in view
  useEffect(() => {
    if (!paletteRef.current) return;
    const activeBtn = paletteRef.current.children[index] as HTMLElement;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [index]);

  useEffect(() => {
    const int = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(int);
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(int);
  }, []);

  function handleTimeUp() {
    triggerHaptic("error");
    submit(picks);
  }

  function onPick(opt: number) {
    const next = picks.slice();
    next[index] = opt;
    setPicks(next);
    triggerHaptic("success");

    // Auto-advance if not the last question
    if (index < total - 1) {
      setTimeout(() => setIndex(index + 1), 350);
    }
  }

  function submit(finalPicks: (number | null)[]) {
    const endedAt = Date.now();
    const attempt = {
      testId,
      testName: test.name,
      questions,
      answers: {} as Record<string, number | null>,
      startedAt: startedAt.current,
      endedAt,
      durationSeconds: test.duration_seconds,
    };
    questions.forEach((qq, i) => {
      attempt.answers[qq.id] = finalPicks[i];
    });

    sessionStorage.setItem(`mcq-attempt:${testId}`, JSON.stringify(attempt));
    setPendingSubmission(true);
    setShowDownloadPopup(true);
  }

  function handleContinueToResult() {
    setShowDownloadPopup(false);
    if (pendingSubmission) {
      navigate({ to: "/mcq-result/$testId", params: { testId } });
    }
  }

  const answeredCount = picks.filter((x) => x !== null).length;
  const isUrgent = timeLeft < 60; // Less than 1 minute remaining

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 via-background to-secondary/10 -z-10 pointer-events-none" />
      <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[50%] rounded-full bg-primary/10 blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-[40%] -right-[20%] w-[50%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] -z-10 pointer-events-none" />

      {/* iOS Glass Header */}
      <header className="shrink-0 px-5 pt-safe pb-3 max-w-2xl w-full mx-auto backdrop-blur-2xl bg-white/40 dark:bg-black/40 sticky top-0 z-50 border-b border-border/20 flex items-center justify-between">
        {/* Left: Quit */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full h-8 px-3.5 text-[13px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 active:scale-95 transition-all"
            >
              <X className="h-3.5 w-3.5" /> Quit
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[28px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border-white/20 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center text-xl">Quit Test?</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                Your progress will be lost. Are you sure you want to exit?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 mt-4 sm:space-x-0">
              <AlertDialogAction
                onClick={() => navigate({ to: "/mcq-tests" })}
                className="w-full rounded-2xl font-semibold bg-destructive hover:bg-destructive/90 text-white h-12 active:scale-95 transition-transform"
              >
                Yes, Quit
              </AlertDialogAction>
              <AlertDialogCancel className="w-full rounded-2xl font-semibold bg-secondary/50 border-0 hover:bg-secondary/70 h-12 m-0 active:scale-95 transition-transform">
                Resume Test
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Center: Timer */}
        <div
          className={`inline-flex items-center gap-1.5 rounded-full h-8 px-3.5 text-[13px] font-bold tabular-nums border backdrop-blur-md transition-colors ${
            isUrgent
              ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
              : "bg-white/50 dark:bg-black/50 text-foreground/80 border-border/30"
          }`}
        >
          <Timer className="h-3.5 w-3.5" />
          {formatTime(timeLeft)}
        </div>

        {/* Right: Submit Button */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="h-8 px-3.5 rounded-full bg-primary/10 text-primary font-semibold text-[13px] border border-primary/20 active:scale-95 transition-all shadow-[0_2px_10px_rgba(var(--primary),0.1)]">
              Submit
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[28px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border-white/20 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center text-xl">Submit Test?</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                You answered <strong className="text-foreground">{answeredCount}</strong> out of{" "}
                <strong className="text-foreground">{total}</strong> questions. Unanswered questions count as 0.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 mt-4 sm:space-x-0">
              <AlertDialogAction
                onClick={() => submit(picks)}
                className="w-full rounded-2xl font-semibold bg-primary hover:bg-primary/90 text-white h-12 active:scale-95 transition-transform"
              >
                Confirm Submission
              </AlertDialogAction>
              <AlertDialogCancel className="w-full rounded-2xl font-semibold bg-secondary/50 border-0 hover:bg-secondary/70 h-12 m-0 active:scale-95 transition-transform">
                Keep Going
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {/* Main Area */}
      <main className="flex-1 min-h-0 flex flex-col px-5 pt-4 max-w-2xl w-full mx-auto pb-4">
        {/* Test Name Header directly above card */}
        <div className="text-center mb-3">
          <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary/80 bg-primary/5 px-3 py-1 rounded-full border border-primary/10 backdrop-blur-md">
            {test.name}
          </span>
        </div>

        <div className="w-full h-full relative [perspective:1200px] flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full" // STRICT absolute bounds prevent 'half squish' glitch
            >
              {/* Premium iOS Glass Card */}
              <div className="w-full h-full rounded-[36px] backdrop-blur-3xl border border-border/30 bg-white/60 dark:bg-black/40 shadow-[0_8px_32px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
                <ScrollArea className="h-full flex-1">
                  <div className="p-7 md:p-8 space-y-6">
                    <div className="flex justify-between items-center text-[12px] font-bold uppercase tracking-widest text-primary/70">
                      <span>
                        Question {index + 1} of {total}
                      </span>
                      {pick !== null && (
                        <span className="text-success flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Answered
                        </span>
                      )}
                    </div>

                    <p className="text-[20px] md:text-[24px] font-semibold leading-tight text-balance text-foreground/90 tracking-tight">
                      {q.question}
                    </p>

                    {q.image_url && (
                      <div className="relative rounded-[24px] overflow-hidden border border-border/30 shadow-sm">
                        <img src={q.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                      </div>
                    )}

                    {q.hint && (
                      <div className="bg-amber-500/10 border border-amber-500/20 backdrop-blur-xl text-amber-700 dark:text-amber-400 p-4 rounded-[20px] text-[15px] font-medium leading-relaxed">
                        <span className="font-bold flex items-center gap-1.5 mb-1.5 text-xs uppercase tracking-widest opacity-80">
                          <Sparkles className="h-4 w-4" /> Hint
                        </span>
                        {q.hint}
                      </div>
                    )}

                    <div className="space-y-3 pt-2">
                      {[1, 2, 3, 4].map((n) => {
                        const text = q[`option_${n}` as `option_${1 | 2 | 3 | 4}`];
                        const isPick = pick === n;

                        let baseCls =
                          "w-full text-left rounded-[24px] border transition-all duration-300 flex items-start gap-4 px-5 py-4 cursor-pointer active:scale-[0.98] shadow-sm backdrop-blur-md ";

                        if (isPick) {
                          baseCls +=
                            "border-primary/40 bg-primary/10 text-primary shadow-[0_4px_20px_rgba(var(--primary),0.15)]";
                        } else {
                          baseCls +=
                            "border-border/30 bg-white/40 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-black/60 text-foreground/80";
                        }

                        return (
                          <button key={n} type="button" onClick={() => onPick(n)} className={baseCls}>
                            <div
                              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold border transition-colors ${
                                isPick
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white/50 dark:bg-black/50 text-foreground/60 border-border/40"
                              }`}
                            >
                              {String.fromCharCode(64 + n)}
                            </div>
                            <div
                              className={`text-[16px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 ${isPick ? "text-primary" : "text-foreground/90"}`}
                            >
                              {text}
                            </div>
                          </button>
                        );
                      })}

                      {/* Clear Selection Option */}
                      <button
                        onClick={() =>
                          setPicks((p) => {
                            const next = p.slice();
                            next[index] = null;
                            return next;
                          })
                        }
                        className={
                          pick === null
                            ? "hidden"
                            : "w-full text-left rounded-[24px] px-5 py-3.5 flex items-start gap-4 bg-transparent border border-dashed border-border/40 active:scale-[0.98] hover:bg-white/20 transition-all duration-150 cursor-pointer"
                        }
                      >
                        <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border border-dashed border-border/50 text-foreground/40">
                          —
                        </div>
                        <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 text-muted-foreground">
                          Clear selection
                        </div>
                      </button>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Floating Edge Navigation */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              aria-label="Previous question"
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all"
            >
              <ChevronLeft className="h-6 w-6 text-foreground/80 ml-[-2px]" />
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              aria-label="Next question"
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all"
            >
              <ChevronRight className="h-6 w-6 text-foreground/80 mr-[-2px]" />
            </button>
          )}
        </div>
      </main>

      {/* iOS Floating Footer: Question Palette */}
      <footer className="shrink-0 px-5 pb-safe pt-1 max-w-2xl w-full mx-auto relative z-10 mb-4">
        <div
          ref={paletteRef}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-2 mask-fade-edges"
        >
          {questions.map((_, i) => {
            const isAnswered = picks[i] !== null;
            const isCurrent = i === index;

            // Reduced to h-9 w-9 to allow ~10 to fit on screen
            let btnCls =
              "h-9 w-9 shrink-0 snap-center rounded-full text-[13px] font-semibold border transition-all duration-300 flex items-center justify-center backdrop-blur-md ";

            if (isCurrent) {
              btnCls += "border-primary shadow-[0_4px_16px_rgba(var(--primary),0.3)] scale-110 z-10 ";
              btnCls += isAnswered ? "bg-primary text-white" : "bg-primary/10 text-primary";
            } else {
              btnCls += isAnswered
                ? "bg-primary/80 text-white border-transparent opacity-80"
                : "bg-white/40 dark:bg-black/40 border-border/30 text-foreground/70 active:scale-95";
            }

            return (
              <button key={i} type="button" onClick={() => setIndex(i)} className={btnCls}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </footer>

      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleContinueToResult}
      />
    </div>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
