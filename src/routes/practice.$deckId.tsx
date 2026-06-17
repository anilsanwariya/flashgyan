import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getDeckCards } from "@/lib/flashcards.functions";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  newSessionId,
  saveSession,
  loadReview,
  saveReview,
  applyReviewOrder,
  type SessionCardResult,
} from "@/lib/session-store";

function decodeDeckId(id: string): { subject: string; topic: string } {
  try {
    const raw = decodeURIComponent(escape(atob(id)));
    const [subject, topic] = raw.split("|||");
    if (!subject || !topic) throw new Error("bad id");
    return { subject, topic };
  } catch {
    throw notFound();
  }
}

const cardsQO = (deckId: string) => {
  const { subject, topic } = decodeDeckId(deckId);
  return queryOptions({
    queryKey: ["deck", subject, topic],
    queryFn: () => getDeckCards({ data: { subject, topic } }),
  });
};

const practiceSearchSchema = z.object({
  review: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/practice/$deckId")({
  validateSearch: zodValidator(practiceSearchSchema),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardsQO(params.deckId)),
  component: Practice,
  notFoundComponent: () => (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-muted-foreground">Deck not found.</p>
        <Link to="/" className="text-primary mt-2 inline-block font-medium">
          Back to decks
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-destructive">{error.message}</p>
        <Link to="/" className="text-primary mt-2 inline-block font-medium">
          Back to decks
        </Link>
      </div>
    </div>
  ),
});

type Rating = "hard" | "medium" | "easy";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Practice() {
  const { deckId } = Route.useParams();
  const { review } = Route.useSearch();
  const { subject, topic } = useMemo(() => decodeDeckId(deckId), [deckId]);
  const { data: cardsRaw } = useSuspenseQuery(cardsQO(deckId));
  const navigate = useNavigate();
  const startedAt = useRef(Date.now());

  const [cards] = useState(() => {
    if (review) {
      const state = loadReview(deckId);
      const ordered = applyReviewOrder(cardsRaw, state);
      return ordered.length > 0 ? ordered : shuffle(cardsRaw);
    }
    return shuffle(cardsRaw);
  });
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Record<Rating, number>>({
    hard: 0,
    medium: 0,
    easy: 0,
  });
  const resultsRef = useRef<SessionCardResult[]>([]);

  const card = cards[index];
  const total = cards.length;

  useEffect(() => {
    setFlipped(false);
  }, [index]);

  if (total === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">This deck has no cards.</p>
          <Link to="/" className="text-primary mt-2 inline-block font-medium">
            Back to decks
          </Link>
        </div>
      </div>
    );
  }

  function rate(r: Rating) {
    const next = { ...ratings, [r]: ratings[r] + 1 };
    setRatings(next);
    resultsRef.current.push({
      id: card.id,
      subject: card.subject,
      topic: card.topic,
      front_question: card.front_question,
      back_answer: card.back_answer,
      rating: r,
    });
    if (index + 1 >= total) {
      const endedAt = Date.now();
      const seconds = Math.round((endedAt - startedAt.current) / 1000);
      const sessionId = newSessionId();
      saveSession(sessionId, {
        deckId,
        subject,
        topic,
        startedAt: startedAt.current,
        endedAt,
        results: resultsRef.current,
      });
      // Persist spaced-repetition state: most recent rating per card.
      const state = loadReview(deckId);
      for (const result of resultsRef.current) {
        state[result.id] = result.rating;
      }
      saveReview(deckId, state);
      navigate({
        to: "/summary",
        search: {
          deckId,
          total,
          hard: next.hard,
          medium: next.medium,
          easy: next.easy,
          seconds,
          sessionId,
        },
      });
    } else {
      setIndex(index + 1);
    }
  }




  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="px-5 pt-4 pb-3 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Exit
          </Link>
          <div className="text-sm tabular-nums text-muted-foreground">
            {index + 1} / {total}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{subject} · {topic}</span>
          {review && (
            <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
              Review mode
            </span>
          )}
        </div>
        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${(ratings.easy / total) * 100}%` }}
          />
          <div
            className="h-full bg-warning transition-all duration-300"
            style={{ width: `${(ratings.medium / total) * 100}%` }}
          />
          <div
            className="h-full bg-destructive transition-all duration-300"
            style={{ width: `${(ratings.hard / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 max-w-2xl w-full mx-auto pb-6">
        <div className="w-full perspective-1000">
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="w-full"
            >
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="w-full text-left perspective-1000"
                aria-label={flipped ? "Show question" : "Reveal answer"}
              >
                <div
                  className={
                    "relative w-full min-h-[60vh] preserve-3d transition-transform duration-500 " +
                    (flipped ? "rotate-y-180" : "")
                  }
                >
                  {/* Front */}
                  <div className="absolute inset-0 backface-hidden rounded-3xl bg-card border border-border shadow-sm p-7 flex flex-col">
                    {card.front_prompt && (
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {card.front_prompt}
                      </div>
                    )}
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-2xl font-semibold leading-snug text-center text-balance">
                        {card.front_question}
                      </p>
                    </div>
                    <div className="text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" /> Tap to reveal
                    </div>
                  </div>
                  {/* Back */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-card border border-border shadow-sm p-7 flex flex-col">
                    <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Answer
                    </div>
                    <div className="mt-4">
                      <p className="text-2xl font-semibold leading-snug text-balance">
                        {card.back_answer}
                      </p>
                    </div>
                    {card.back_explanation && (
                      <div className="mt-5 pt-5 border-t border-border">
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {card.back_explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="px-5 pb-6 pt-2 max-w-2xl w-full mx-auto">
        {flipped ? (
          <div className="grid grid-cols-3 gap-2">
            <RatingButton label="Hard" tone="destructive" onClick={() => rate("hard")} />
            <RatingButton label="Medium" tone="warning" onClick={() => rate("medium")} />
            <RatingButton label="Easy" tone="success" onClick={() => rate("easy")} />
          </div>
        ) : (
          <button
            onClick={() => setFlipped(true)}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base shadow-sm active:scale-[0.99] transition-transform"
          >
            Reveal answer
          </button>
        )}
      </footer>
    </div>
  );
}

function RatingButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "destructive" | "warning" | "success";
  onClick: () => void;
}) {
  const cls =
    tone === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : tone === "warning"
      ? "bg-warning text-warning-foreground"
      : "bg-success text-success-foreground";
  return (
    <button
      onClick={onClick}
      className={`h-14 rounded-2xl font-semibold text-base shadow-sm active:scale-[0.98] transition-transform ${cls}`}
    >
      {label}
    </button>
  );
}
