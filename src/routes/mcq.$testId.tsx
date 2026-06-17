import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMcqTest, type McqQuestion } from "@/lib/mcq.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Timer } from "lucide-react";
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

const testQO = (id: string) =>
  queryOptions({
    queryKey: ["mcqTest", id],
    queryFn: () => getMcqTest({ data: { id } }),
  });

export const Route = createFileRoute("/mcq/$testId")({
  ssr: false,
  head: () => ({ meta: [{ title: "MCQ Test — Flashgyan web" }] }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(testQO(params.testId)),
  component: TakeTest,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-destructive">{error.message}</p>
        <Link to="/" className="mt-3 inline-block text-sm text-primary">
          Back home
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Test not found.</div>,
});

type Answers = Record<string, number | null>; // null = not answered

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
  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(questions.map((q) => [q.id, null])),
  );
  const [idx, setIdx] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [remaining, setRemaining] = useState(test.duration_seconds);

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
    navigate({ to: "/mcq-result/$testId", params: { testId } });
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">This test has no questions yet.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary">
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
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{test.name}</div>
            <div className="text-sm font-medium">
              Q {idx + 1} / {questions.length}
            </div>
          </div>
          <div className="inline-flex items-center gap-1 tabular-nums font-mono text-sm">
            <Timer className="h-4 w-4 text-muted-foreground" />
            {formatTime(remaining)}
          </div>
          <EndTestDialog onConfirm={submit} />
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-5 py-4 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-card border border-border p-5">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
            <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">
              {q.question}
            </p>
            {q.image_url && (
              <img
                src={q.image_url}
                alt=""
                className="max-h-72 w-full object-contain rounded-lg border border-border"
              />
            )}
            {q.hint && (
              <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">
                {q.hint}
              </p>
            )}

            <div className="space-y-2">
              {opts.map((o, i) => {
                const n = i + 1;
                const selected = choice === n;
                return (
                  <button
                    key={i}
                    onClick={() => setChoice(n)}
                    className={
                      "w-full text-left rounded-xl border p-3 text-sm transition-colors " +
                      (selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-accent/50")
                    }
                  >
                    <span className="font-semibold mr-2">{n}.</span>
                    {o}
                  </button>
                );
              })}
              <button
                onClick={() => setChoice(null)}
                className={
                  "w-full text-left rounded-xl border p-3 text-sm transition-colors " +
                  (choice === null
                    ? "border-muted-foreground/50 bg-muted/40"
                    : "border-dashed border-border bg-background hover:bg-accent/50")
                }
              >
                <span className="font-semibold mr-2">—</span>
                Not answered
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

      <footer className="sticky bottom-0 border-t border-border bg-background">
        <div className="max-w-2xl mx-auto px-5 py-3 grid grid-cols-3 items-center gap-3">
          <div className="justify-self-start">
            <Button
              variant="outline"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              Prev
            </Button>
          </div>
          <div className="justify-self-center">
            <SubmitDialog onConfirm={submit} answered={answeredCount} total={questions.length} />
          </div>
          <div className="justify-self-end">
            <Button
              disabled={idx === questions.length - 1}
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </footer>
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
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        Questions ({answeredCount}/{questions.length})
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => page(-1)}
          disabled={atStart}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          ref={scrollRef}
          onScroll={updateEdges}
          className="flex-1 overflow-x-auto scroll-smooth no-scrollbar"
        >
          <div
            className="grid grid-rows-2 grid-flow-col gap-1"
            style={{ gridAutoColumns: "calc((100% - (9 * 0.25rem)) / 10)" }}
          >
            {questions.map((q, i) => {
              const a = answers[q.id];
              const cur = i === current;
              return (
                <button
                  key={q.id}
                  onClick={() => onJump(i)}
                  className={
                    "h-7 rounded-md text-xs font-medium tabular-nums border " +
                    (cur
                      ? "border-primary bg-primary text-primary-foreground"
                      : a !== null
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-card text-muted-foreground")
                  }
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
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

function EndTestDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" /> End
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End test now?</AlertDialogTitle>
          <AlertDialogDescription>
            Unanswered questions will count as 0. You'll be taken to the result page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white">
            Continue
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            End test
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmitDialog({
  onConfirm,
  answered,
  total,
}: {
  onConfirm: () => void;
  answered: number;
  total: number;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Submit</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit test?</AlertDialogTitle>
          <AlertDialogDescription>
            You answered {answered} of {total}. Unanswered questions count as 0.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Submit</AlertDialogAction>
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
