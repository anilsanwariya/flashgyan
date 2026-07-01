// src/routes/practice.$deckId.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getDeck } from "@/lib/flashcards.functions";
import { motion, AnimatePresence } from "motion/react";
import { RotateCcw, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  newSessionId,
  saveSession,
  loadReview,
  saveReview,
  applyReviewOrder,
  type SessionCardResult,
} from "@/lib/session-store";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AppDownloadPopup } from "@/components/app-download-popup";

const deckQO = (deckId: string) =>
  queryOptions({
    queryKey: ["deck", deckId],
    queryFn: () => getDeck({ data: { id: deckId } }),
  });

const practiceSearchSchema = z.object({
  review: fallback(z.boolean(), false).default(false),
});

export const Route = createFileRoute("/practice/$deckId")({
  validateSearch: zodValidator(practiceSearchSchema),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(deckQO(params.deckId)),
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
  const { data: deckData } = useSuspenseQuery(deckQO(deckId));
  const { subject, topic } = deckData.deck;
  const cardsRaw = deckData.cards;
  const navigate = useNavigate();
  const startedAt = useRef(Date.now());

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [navData, setNavData] = useState<any>(null);

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
  const [cardRatings, setCardRatings] = useState<(Rating | null)[]>(() => cards.map(() => null));
  const [priorRatings] = useState<(Rating | null)[]>(() => {
    if (!review) return cards.map(() => null);
    const state = loadReview(deckId);
    return cards.map((c) => state[c.id] ?? null);
  });

  const ratings = useMemo(() => {
    const r = { hard: 0, medium: 0, easy: 0 };
    for (const c of cardRatings) if (c) r[c]++;
    return r;
  }, [cardRatings]);

  const card = cards[index];
  const total = cards.length;
  const currentRating = cardRatings[index];
  const displayRating = currentRating ?? priorRatings[index];
  const borderClass =
    displayRating === "hard"
      ? "border-destructive"
      : displayRating === "medium"
        ? "border-warning"
        : displayRating === "easy"
          ? "border-success"
          : "border-border";

  useEffect(() => {
    setFlipped(cardRatings[index] !== null);
  }, [index, cardRatings]);

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

  function submit(finalRatings: (Rating | null)[]) {
    const endedAt = Date.now();
    const seconds = Math.round((endedAt - startedAt.current) / 1000);
    const sessionId = newSessionId();
    const results: SessionCardResult[] = [];
    cards.forEach((c, i) => {
      const r = finalRatings[i];
      if (!r) return;
      results.push({
        id: c.id,
        subject: c.subject,
        topic: c.topic,
        prompt: c.prompt,
        question: c.question,
        answer: c.answer,
        rating: r,
      });
    });
    const counts = { hard: 0, medium: 0, easy: 0 };
    for (const r of results) counts[r.rating]++;
    saveSession(sessionId, {
      deckId,
      subject,
      topic,
      startedAt: startedAt.current,
      endedAt,
      results,
    });
    const state = loadReview(deckId);
    for (const r of results) state[r.id] = r.rating;
    saveReview(deckId, state);

    setNavData({
      deckId,
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

  function rate(r: Rating) {
    const next = cardRatings.slice();
    next[index] = r;
    setCardRatings(next);
    if (index < total - 1) {
      setIndex(index + 1);
    } else if (next.every((x) => x !== null)) {
      submit(next);
    }
  }

  function goPrev() {
    if (index > 0) setIndex(index - 1);
  }

  function goNext() {
    if (currentRating === null) return;
    if (index < total - 1) setIndex(index + 1);
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="px-5 pt-4 pb-3 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {index + 1} / {total}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors"
              >
                End Session <X className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  You can keep going, or end now and see your summary. Unrated cards stay unrated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-success text-success-foreground hover:bg-success/90 border-0">
                  Continue
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => submit(cardRatings)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  End session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {subject} · {topic}
          </span>
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
        <div className="w-full relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="w-full perspective-1000"
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
                  <div
                    className={`absolute inset-0 backface-hidden rounded-3xl bg-card border-2 shadow-sm overflow-hidden transition-colors ${borderClass}`}
                  >
                    <ScrollArea className="h-full">
                      <div className="p-7 min-h-[60vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                          {card.prompt}
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
                          <p className="text-2xl font-semibold leading-snug text-center text-balance">
                            {card.question}
                          </p>
                          {card.image_url && (
                            <img
                              src={card.image_url}
                              alt=""
                              className="w-full aspect-[2/1] rounded-xl object-cover border border-border"
                            />
                          )}
                        </div>
                        <div className="text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5" /> Tap to reveal
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                  {/* Back */}
                  <div
                    className={`absolute inset-0 backface-hidden rotate-y-180 rounded-3xl bg-card border-2 shadow-sm transition-colors ${borderClass} overflow-hidden flex flex-col`}
                  >
                    <ScrollArea className="flex-1 h-full">
                      <div className="p-7" onClick={(e) => e.stopPropagation()}>
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {card.prompt}
                        </div>
                        <p className="mt-2 text-base font-medium leading-snug">{card.question}</p>
                        {card.image_url && (
                          <img
                            src={card.image_url}
                            alt=""
                            className="mt-3 w-full aspect-[2/1] rounded-xl object-cover border border-border"
                          />
                        )}
                        <div className="mt-4 pt-4 border-t border-border text-xs font-semibold uppercase tracking-wider text-primary">
                          Answer
                        </div>
                        <p className="mt-3 text-2xl font-semibold leading-snug text-balance">{card.answer}</p>
                        {card.sections.map((s, i) => (
                          <div key={i} className="mt-5 pt-5 border-t border-border">
                            <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                              {s.title}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {s.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </button>
            </motion.div>
          </AnimatePresence>
          {index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous card"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/60 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center hover:bg-background/80 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {currentRating !== null && index < total - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next card"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/60 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center hover:bg-background/80 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </main>

      <footer className="px-5 pb-6 pt-2 max-w-2xl w-full mx-auto">
        {flipped ? (
          <div className="grid grid-cols-3 gap-2">
            <RatingButton
              label="Hard"
              tone="destructive"
              onClick={() => rate("hard")}
              disabled={currentRating !== null}
              active={currentRating === "hard"}
            />
            <RatingButton
              label="Medium"
              tone="warning"
              onClick={() => rate("medium")}
              disabled={currentRating !== null}
              active={currentRating === "medium"}
            />
            <RatingButton
              label="Easy"
              tone="success"
              onClick={() => rate("easy")}
              disabled={currentRating !== null}
              active={currentRating === "easy"}
            />
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

      <AppDownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onContinue={handleContinueToSummary}
      />
    </div>
  );
}

function RatingButton({
  label,
  tone,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  tone: "destructive" | "warning" | "success";
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const cls =
    tone === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : tone === "warning"
        ? "bg-warning text-warning-foreground"
        : "bg-success text-success-foreground";
  const stateCls = disabled ? (active ? "cursor-not-allowed" : "opacity-40 cursor-not-allowed") : "active:scale-[0.98]";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-14 rounded-2xl font-semibold text-base shadow-sm transition-transform ${cls} ${stateCls}`}
    >
      {label}
    </button>
  );
}
