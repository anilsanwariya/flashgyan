import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMcqTest, type McqQuestion } from "@/lib/mcq.functions";
import { ChevronLeft, ChevronRight, Timer, Sparkles } from "lucide-react";
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
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div>
        <p className="text-destructive font-semibold">{error.message}</p>
        <Link to="/" className="mt-3 inline-block text-sm font-bold text-primary">
          Back home
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-center font-medium text-muted-foreground min-h-dvh flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      Test not found.
    </div>
  ),
});

type Answers = Record<string, number | null>;

export type McqAttempt = {
  testId: string;
  testName: string;
  questions: McqQuestion[];
  answers: Answers;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
};

const STORAGE_KEY = (id: string) => `mcq-attempt:${id}`;

function TakeTest() {
  const { testId } = Route.useParams();
  const { data } = useSuspenseQuery(testQO(testId));
  const navigate = useNavigate();

  const { test, questions } = data;
  const [answers, setAnswers] = useState<Answers>(() => Object.fromEntries(questions.map((q) => [q.id, null])));
  const [idx, setIdx] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [remaining, setRemaining] = useState(test.duration_seconds);

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  useEffect(() => {
    if (remaining <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  function submit() {
    const attempt: McqAttempt = {
      testId,
      testName: test.name,
      questions,
      answers,
      startedAt,
      endedAt: Date.now(),
      durationSeconds: test.duration_seconds,
    };
    try {
      sessionStorage.setItem(STORAGE_KEY(testId), JSON.stringify(attempt));
    } catch {
      /* ignore */
    }
    setShowDownloadPopup(true);
  }

  function handleContinueToResults() {
    setShowDownloadPopup(false);
    navigate({ to: "/mcq-result/$testId", params: { testId } });
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div>
          <p className="text-muted-foreground font-medium">This test has no questions yet.</p>
          <Link to="/" className="mt-3 inline-block text-sm font-bold text-primary">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const choice = answers[q.id];
  const opts = [q.option_1, q.option_2, q.option_3, q.option_4];

  function setChoice(v: number | null) {
    setAnswers((a) => ({ ...a, [q.id]: v }));
  }

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;

  return (
    <div className="h-dvh overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex flex-col relative">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-[480px] w-[480px] rounded-full bg-secondary/30 blur-[120px]" />

      {/* Glassmorphic Header */}
      <header className="relative z-50 shrink-0 backdrop-blur-2xl bg-white/40 dark:bg-black/40 border-b border-border/20 sticky top-0">
        <div className="max-w-2xl mx-auto px-5 py-3 grid grid-cols-3 items-center gap-3">
          <div className="text-sm font-bold tabular-nums justify-self-start text-foreground/80 bg-white/50 dark:bg-black/40 backdrop-blur-xl px-3.5 py-1.5 rounded-full border border-border/30">
            {idx + 1} / {questions.length}
          </div>

          <div className="text-center min-w-0 justify-self-center flex flex-col items-center w-full">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 truncate w-full mb-1">
              {test.name}
            </div>
            <div className="inline-flex items-center gap-1.5 tabular-nums font-mono text-sm font-bold text-foreground/90 bg-white/50 dark:bg-black/40 backdrop-blur-xl px-3 py-0.5 rounded-full border border-border/30">
              <Timer className="h-3.5 w-3.5 text-primary" />
              {formatTime(remaining)}
            </div>
          </div>

          <div className="flex justify-end justify-self-end">
            <SubmitTestDialog onConfirm={submit} answered={answeredCount} total={questions.length} />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 max-w-2xl w-full mx-auto px-5 py-4 flex flex-col">
        {/* Glass Question Card */}
        <div className="flex-1 min-h-0 flex flex-col rounded-[32px] bg-white/50 dark:bg-black/30 backdrop-blur-3xl border border-border/30 shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 space-y-6">
            <p className="text-[20px] md:text-2xl font-bold leading-snug text-balance text-foreground/90">
              {q.question}
            </p>

            {q.image_url && (
              <div className="relative rounded-3xl overflow-hidden border border-border/30 shadow-sm">
                <img src={q.image_url} alt="" className="max-h-72 w-full object-contain bg-white/40 backdrop-blur-xl" />
              </div>
            )}

            {q.hint && (
              <div className="bg-amber-500/10 border border-amber-500/20 backdrop-blur-xl text-amber-700 dark:text-amber-400 p-4 rounded-3xl text-[15px] leading-relaxed">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4" /> Hint
                </span>
                {q.hint}
              </div>
            )}

            <div className="space-y-3 pt-2">
              {opts.map((o, i) => {
                const n = i + 1;
                const selected = choice === n;

                const cls = selected
                  ? "w-full text-left rounded-[20px] px-5 py-4 flex items-start gap-4 bg-primary text-primary-foreground border border-transparent shadow-md transition-all duration-200 cursor-default"
                  : "w-full text-left rounded-[20px] px-5 py-4 flex items-start gap-4 bg-white/40 dark:bg-black/30 border border-border/30 backdrop-blur-xl active:scale-[0.98] hover:bg-white/60 dark:hover:bg-black/40 transition-all duration-150 cursor-pointer";

                return (
                  <button key={i} onClick={() => setChoice(n)} className={cls}>
                    <div
                      className={
                        "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border transition-colors " +
                        (selected
                          ? "bg-white/25 text-primary-foreground border-transparent"
                          : "bg-white/60 dark:bg-black/40 text-foreground/70 border-border/40")
                      }
                    >
                      {String.fromCharCode(64 + n)}
                    </div>
                    <div
                      className={
                        "text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 " +
                        (selected ? "text-primary-foreground" : "text-foreground/90")
                      }
                    >
                      {o}
                    </div>
                  </button>
                );
              })}

              {/* Not Answered */}
              <button
                onClick={() => setChoice(null)}
                className={
                  choice === null
                    ? "w-full text-left rounded-[20px] px-5 py-4 flex items-start gap-4 bg-muted-foreground/80 text-background border border-transparent shadow-md transition-all duration-200 cursor-default"
                    : "w-full text-left rounded-[20px] px-5 py-4 flex items-start gap-4 bg-white/30 dark:bg-black/20 border border-dashed border-border/40 backdrop-blur-xl active:scale-[0.98] hover:bg-white/50 transition-all duration-150 cursor-pointer"
                }
              >
                <div
                  className={
                    "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border transition-colors " +
                    (choice === null
                      ? "bg-white/25 text-background border-transparent"
                      : "bg-white/50 text-foreground/40 border-dashed border-border/50")
                  }
                >
                  —
                </div>
                <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1">
                  Not answered
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 mt-3">
          <QuestionPalette
            questions={questions}
            answers={answers}
            current={idx}
            onJump={setIdx}
            answeredCount={answeredCount}
          />
        </div>
      </main>

      <footer className="relative z-10 shrink-0 border-t border-border/20 bg-white/40 dark:bg-black/40 backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <button
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 h-12 px-5 rounded-full bg-white/50 dark:bg-black/40 backdrop-blur-xl border border-border/40 text-foreground/80 font-semibold text-[15px] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            <ChevronLeft className="h-5 w-5" /> Previous
          </button>
          <button
            disabled={idx === questions.length - 1}
            onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex items-center gap-1 h-12 px-6 rounded-full bg-primary/15 text-primary border border-primary/25 backdrop-blur-xl font-semibold text-[15px] active:scale-95 hover:bg-primary/25 transition-all shadow-[0_4px_20px_rgba(var(--primary),0.12)] disabled:opacity-40 disabled:active:scale-100"
          >
            Next <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>

      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleContinueToResults}
      />
    </div>
  );
}

function QuestionPalette({
  questions,
  answers,
  current,
  onJump,
  answeredCount,
}: {
  questions: McqQuestion[];
  answers: Answers;
  current: number;
  onJump: (i: number) => void;
  answeredCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = scrollRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  useEffect(() => {
    updateEdges();
  }, [questions.length]);

  function page(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="bg-white/50 dark:bg-black/30 backdrop-blur-3xl border border-border/30 rounded-[24px] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80">Questions</div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {answeredCount}/{questions.length} Answered
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => page(-1)}
          disabled={atStart}
          aria-label="Scroll left"
          className="h-8 w-8 shrink-0 rounded-full bg-white/60 dark:bg-black/40 border border-border/30 backdrop-blur-xl text-foreground/70 grid place-items-center active:scale-90 transition-all disabled:opacity-40 disabled:active:scale-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={scrollRef}
          onScroll={updateEdges}
          className="flex-1 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar"
        >
          <div className="flex">
            {Array.from({ length: Math.ceil(questions.length / 20) }).map((_, pageIdx) => {
              const pageQs = questions.slice(pageIdx * 20, pageIdx * 20 + 20);
              return (
                <div key={pageIdx} className="w-full shrink-0 snap-start grid grid-cols-10 grid-rows-2 gap-1.5">
                  {pageQs.map((q, j) => {
                    const i = pageIdx * 20 + j;
                    const a = answers[q.id];
                    const cur = i === current;

                    let cls =
                      "h-8 rounded-[10px] text-[13px] font-bold tabular-nums border transition-all duration-150 backdrop-blur-xl ";

                    if (cur) {
                      cls += "border-transparent bg-primary text-primary-foreground shadow-md scale-110 z-10";
                    } else if (a !== null) {
                      cls += "border-success/40 bg-success/10 text-success active:scale-95";
                    } else {
                      cls += "border-border/30 bg-white/40 dark:bg-black/30 text-muted-foreground active:scale-95";
                    }

                    return (
                      <button key={q.id} onClick={() => onJump(i)} className={cls}>
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => page(1)}
          disabled={atEnd}
          aria-label="Scroll right"
          className="h-8 w-8 shrink-0 rounded-full bg-white/60 dark:bg-black/40 border border-border/30 backdrop-blur-xl text-foreground/70 grid place-items-center active:scale-90 transition-all disabled:opacity-40 disabled:active:scale-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SubmitTestDialog({ onConfirm, answered, total }: { onConfirm: () => void; answered: number; total: number }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full h-9 px-4 text-sm font-semibold text-destructive bg-destructive/10 border border-destructive/25 backdrop-blur-xl active:scale-95 hover:bg-destructive/20 transition-all shadow-[0_4px_16px_rgba(239,68,68,0.1)]"
        >
          Submit
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-[28px] bg-white/80 dark:bg-black/70 backdrop-blur-3xl border-border/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">Submit test?</AlertDialogTitle>
          <AlertDialogDescription className="text-[15px]">
            You answered <strong className="text-foreground">{answered}</strong> out of{" "}
            <strong className="text-foreground">{total}</strong> questions. Unanswered questions count as 0.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel className="rounded-full h-11 px-5 font-semibold bg-white/60 dark:bg-black/40 border border-border/40 backdrop-blur-xl active:scale-95 transition-all">
            Keep going
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-full h-11 px-5 font-semibold bg-destructive/15 text-destructive border border-destructive/30 backdrop-blur-xl hover:bg-destructive/25 active:scale-95 transition-all shadow-[0_4px_20px_rgba(239,68,68,0.15)]"
          >
            Submit Test
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
