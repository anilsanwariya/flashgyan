import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMcqTest, type McqQuestion } from "@/lib/mcq.functions";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-destructive font-semibold">{error.message}</p>
        <Link to="/" className="mt-3 inline-block text-sm font-bold text-primary">
          Back home
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-center font-medium text-muted-foreground bg-background min-h-dvh flex items-center justify-center">
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
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
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
    <div className="h-dvh overflow-hidden bg-background/50 flex flex-col relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      {/* Glassmorphic Header */}
      <header className="shrink-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40 sticky top-0">
        <div className="max-w-2xl mx-auto px-5 py-3 grid grid-cols-3 items-center gap-3">
          {/* LEFT: Question Counter */}
          <div className="text-sm font-bold tabular-nums justify-self-start text-foreground/80 bg-foreground/5 px-3 py-1 rounded-full border border-border/50">
            {idx + 1} / {questions.length}
          </div>

          {/* CENTER: Title and Timer */}
          <div className="text-center min-w-0 justify-self-center flex flex-col items-center w-full">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary/80 truncate w-full mb-0.5">
              {test.name}
            </div>
            <div className="inline-flex items-center gap-1.5 tabular-nums font-mono text-sm font-bold text-foreground/90 bg-muted/50 px-2.5 py-0.5 rounded-lg border border-border/50">
              <Timer className="h-4 w-4 text-primary" />
              {formatTime(remaining)}
            </div>
          </div>

          {/* RIGHT: Submit Button */}
          <div className="flex justify-end justify-self-end">
            <SubmitTestDialog onConfirm={submit} answered={answeredCount} total={questions.length} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-5 py-4 flex flex-col">
        {/* Premium Question Card */}
        <div className="flex-1 min-h-0 flex flex-col rounded-[28px] bg-card border-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
            <p className="text-[20px] md:text-2xl font-bold leading-snug text-balance text-foreground/90">
              {q.question}
            </p>

            {q.image_url && (
              <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm">
                <img src={q.image_url} alt="" className="max-h-72 w-full object-contain bg-muted/30" />
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
              {opts.map((o, i) => {
                const n = i + 1;
                const selected = choice === n;

                let baseCls =
                  "w-full text-left rounded-[20px] border-2 transition-all duration-150 flex items-start gap-4 px-5 py-4 ";

                if (!selected) {
                  // Unclicked state: Hover off page, thick bottom border
                  baseCls +=
                    "border-border border-b-[6px] bg-background hover:-translate-y-1 hover:border-b-[8px] active:translate-y-[4px] active:border-b-[2px] cursor-pointer shadow-sm";
                } else {
                  // Clicked State: Squished down into page
                  baseCls +=
                    "translate-y-[4px] border-b-[2px] border-primary bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_rgba(var(--primary),0.2)] cursor-default";
                }

                return (
                  <button key={i} onClick={() => setChoice(n)} className={baseCls}>
                    <div
                      className={
                        "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors " +
                        (selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-foreground/60 border-border")
                      }
                    >
                      {String.fromCharCode(64 + n)}
                    </div>
                    <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 text-foreground/90">
                      {o}
                    </div>
                  </button>
                );
              })}

              {/* Not Answered Button */}
              <button
                onClick={() => setChoice(null)}
                className={
                  "w-full text-left rounded-[20px] border-2 border-dashed transition-all duration-150 flex items-start gap-4 px-5 py-4 " +
                  (choice !== null
                    ? "border-border border-b-[6px] bg-background/50 hover:-translate-y-1 hover:border-b-[8px] active:translate-y-[4px] active:border-b-[2px] cursor-pointer shadow-sm"
                    : "translate-y-[4px] border-b-[2px] border-muted-foreground/40 bg-muted/40 cursor-default")
                }
              >
                <div
                  className={
                    "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors " +
                    (choice === null
                      ? "bg-muted-foreground text-background border-muted-foreground"
                      : "bg-muted/50 text-foreground/40 border-dashed border-border")
                  }
                >
                  —
                </div>
                <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap mt-1 text-foreground/90">
                  Not answered
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 mt-4">
          <QuestionPalette
            questions={questions}
            answers={answers}
            current={idx}
            onJump={setIdx}
            answeredCount={answeredCount}
          />
        </div>
      </main>

      {/* Footer using the globally upgraded Button component */}
      <footer className="shrink-0 border-t border-border/40 bg-background/60 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <Button variant="outline" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
            <ChevronLeft className="h-5 w-5 mr-1" /> Previous
          </Button>
          <Button
            disabled={idx === questions.length - 1}
            onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
            className="px-6"
          >
            Next <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
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
    <div className="bg-card border-2 border-border/60 rounded-[24px] p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[11px] font-bold uppercase tracking-widest text-primary/80">Questions</div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {answeredCount}/{questions.length} Answered
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-xl"
          onClick={() => page(-1)}
          disabled={atStart}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
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
                      "h-8 rounded-[10px] text-[13px] font-bold tabular-nums border-2 transition-all duration-150 ";

                    if (cur) {
                      cls += "border-primary bg-primary text-primary-foreground shadow-sm scale-110 z-10";
                    } else if (a !== null) {
                      cls +=
                        "border-success/50 bg-success/15 text-success shadow-sm hover:-translate-y-0.5 active:translate-y-0";
                    } else {
                      cls += "border-border bg-background text-muted-foreground hover:bg-muted active:scale-95";
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
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-xl"
          onClick={() => page(1)}
          disabled={atEnd}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
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
          className="inline-flex items-center gap-1 rounded-full h-9 px-4 text-sm font-semibold border-2 border-b-[4px] border-destructive/80 text-destructive hover:-translate-y-0.5 hover:border-b-[5px] active:translate-y-[2px] active:border-b-[2px] transition-all duration-150 bg-background shadow-sm"
        >
          Submit
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-[24px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">Submit test?</AlertDialogTitle>
          <AlertDialogDescription className="text-[15px]">
            You answered <strong className="text-foreground">{answered}</strong> out of{" "}
            <strong className="text-foreground">{total}</strong> questions. Unanswered questions count as 0.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel className="rounded-xl h-11 font-semibold hover:bg-muted border-2">
            Keep going
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-xl h-11 font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground border-b-[4px] border-destructive/80 active:border-b-0 active:translate-y-[4px] transition-all"
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
