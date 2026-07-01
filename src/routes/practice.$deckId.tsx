import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getDeck } from "@/lib/flashcards.functions";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
        <Link to="/" className="text-primary mt-2 inline-block font-bold">
          Back to decks
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <p className="text-destructive font-semibold">{error.message}</p>
        <Link to="/" className="text-primary mt-2 inline-block font-bold">
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
          : "border-border/50";

  useEffect(() => {
    setFlipped(cardRatings[index] !== null);
  }, [index, cardRatings]);

  if (total === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">This deck has no cards.</p>
          <Link to="/" className="text-primary mt-2 inline-block font-bold">
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
          <div className="text-sm tabular-nums font-bold text-foreground/80 bg-foreground/5 px-3 py-1 rounded-full border border-border/50">
            {index + 1} / {total}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="truncate">
            {subject} · {topic}
          </span>
          {review && (
            <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-bold tracking-wide">
              REVIEW
            </span>
          )}
        </div>
        <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60 shadow-inner">
          <div
            className="h-full bg-success transition-all duration-500 ease-out"
            style={{ width: `${(ratings.easy / total) * 100}%` }}
          />
          <div
            className="h-full bg-warning transition-all duration-500 ease-out"
            style={{ width: `${(ratings.medium / total) * 100}%` }}
          />
          <div
            className="h-full bg-destructive transition-all duration-500 ease-out"
            style={{ width: `${(ratings.hard / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-4 max-w-2xl w-full mx-auto pb-6">
        <div className="w-full relative min-h-[60vh] [perspective:1000px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full relative min-h-[60vh]"
            >
              {/* FRONT CARD - Animated independently */}
              <motion.div
                initial={false}
                animate={{ rotateY: flipped ? -180 : 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  pointerEvents: flipped ? "none" : "auto",
                }}
              >
                <div
                  className={`w-full h-full rounded-[28px] bg-card border-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-colors duration-300 ${borderClass} overflow-hidden flex flex-col`}
                >
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-7 md:p-8 min-h-[60vh] flex flex-col">
                      <div className="text-xs font-bold uppercase tracking-widest text-primary/80 text-center mb-6">
                        {card.prompt}
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
                        <p className="text-[20px] md:text-2xl font-bold leading-snug text-center text-balance text-foreground/90">
                          {card.question}
                        </p>
                        {card.image_url && (
                          <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm mt-4">
                            <img src={card.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </motion.div>

              {/* BACK CARD - Animated independently */}
              <motion.div
                initial={false}
                animate={{ rotateY: flipped ? 0 : 180 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  pointerEvents: flipped ? "auto" : "none",
                }}
              >
                <div
                  className={`w-full h-full rounded-[28px] bg-card border-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-colors duration-300 ${borderClass} overflow-hidden flex flex-col`}
                >
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-7 md:p-8">
                      <div className="text-xs font-bold uppercase tracking-widest text-primary/80">{card.prompt}</div>
                      <p className="mt-2 text-[15px] font-medium leading-snug text-foreground/80">{card.question}</p>
                      {card.image_url && (
                        <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm mt-3">
                          <img src={card.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                        </div>
                      )}

                      <div className="mt-6 pt-6 border-t-2 border-border/50 text-xs font-bold uppercase tracking-widest text-success">
                        Answer
                      </div>
                      <p className="mt-3 text-[20px] md:text-2xl font-bold leading-snug text-balance text-foreground/90">
                        {card.answer}
                      </p>

                      {card.sections.map((s, i) => (
                        <div key={i} className="mt-5 pt-5 border-t border-border/40">
                          <div className="text-xs font-bold uppercase tracking-widest text-primary/80 mb-2">
                            {s.title}
                          </div>
                          <p className="text-[15px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Overlay Buttons */}
          {index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous card"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-background/80 backdrop-blur-md border-2 border-border shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6 text-foreground/70" />
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
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-background/80 backdrop-blur-md border-2 border-border shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all animate-in zoom-in duration-300"
            >
              <ChevronRight className="h-6 w-6 text-foreground/70" />
            </button>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-5 pb-6 pt-3 max-w-2xl w-full mx-auto relative z-10">
        {flipped ? (
          <div className="grid grid-cols-3 gap-3">
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
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-lg border-b-[5px] border-primary/80 hover:-translate-y-1 hover:border-b-[6px] active:translate-y-[4px] active:border-b-0 shadow-sm transition-all"
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
  const isDestructive = tone === "destructive";
  const isWarning = tone === "warning";

  const bgCls = isDestructive
    ? "bg-destructive text-destructive-foreground border-destructive/80"
    : isWarning
      ? "bg-warning text-warning-foreground border-warning/80"
      : "bg-success text-success-foreground border-success/80";

  const stateCls = disabled
    ? active
      ? "cursor-not-allowed translate-y-[4px] border-b-0"
      : "opacity-40 cursor-not-allowed border-b-[4px]"
    : "border-b-[5px] hover:-translate-y-1 hover:border-b-[6px] active:translate-y-[4px] active:border-b-0 shadow-sm cursor-pointer";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-14 rounded-2xl font-bold text-base transition-all duration-150 border-x-0 border-t-0 ${bgCls} ${stateCls}`}
    >
      {label}
    </button>
  );
}
