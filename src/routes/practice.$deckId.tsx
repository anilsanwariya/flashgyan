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
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-muted-foreground font-medium">Deck not found.</p>
        <Link to="/" className="text-primary mt-2 inline-block font-medium">
          Back to decks
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-destructive font-semibold">{error.message}</p>
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
  const [isTransitioning, setIsTransitioning] = useState(false);
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
      ? "border-destructive/60 shadow-[0_8px_32px_rgba(239,68,68,0.25)] bg-destructive/10"
      : displayRating === "medium"
        ? "border-warning/60 shadow-[0_8px_32px_rgba(245,158,11,0.25)] bg-warning/10"
        : displayRating === "easy"
          ? "border-success/60 shadow-[0_8px_32px_rgba(16,185,129,0.25)] bg-success/10"
          : "border-border/30 shadow-[0_8px_32px_rgba(0,0,0,0.08)] bg-white/60 dark:bg-black/40";

  useEffect(() => {
    setFlipped(cardRatings[index] !== null);
  }, [index, cardRatings]);

  if (total === 0) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
        <div>
          <p className="text-muted-foreground font-medium">This deck has no cards.</p>
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
        image_url: c.image_url,
        sections: c.sections,
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
    if (isTransitioning) return;

    const next = cardRatings.slice();
    next[index] = r;
    setCardRatings(next);

    if (index < total - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setIndex(index + 1);
        setIsTransitioning(false);
      }, 450);
    } else if (next.every((x) => x !== null)) {
      setIsTransitioning(true);
      setTimeout(() => {
        submit(next);
      }, 450);
    }
  }

  function goPrev() {
    if (isTransitioning) return;
    if (index > 0) setIndex(index - 1);
  }

  function goNext() {
    if (isTransitioning) return;
    if (currentRating === null) return;
    if (index < total - 1) setIndex(index + 1);
  }

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 via-background to-secondary/10 -z-10 pointer-events-none" />
      <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[50%] rounded-full bg-primary/10 blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute top-[40%] -right-[20%] w-[50%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] -z-10 pointer-events-none" />

      {/* FIXED Padding */}
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
            <AlertDialogContent className="rounded-[32px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border border-white/20 dark:border-white/10 shadow-2xl p-6 sm:max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold text-foreground text-center tracking-tight">
                  End Session?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[14px] text-center text-muted-foreground mt-1.5 leading-snug">
                  You can keep going, or end now and see your summary. Unrated cards stay unrated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-3 pt-4 sm:space-x-0">
                <AlertDialogAction
                  onClick={() => submit(cardRatings)}
                  className="w-full h-[52px] rounded-[24px] bg-destructive/10 text-destructive font-semibold text-[16px] border border-destructive/30 backdrop-blur-xl hover:bg-destructive/20 active:scale-[0.98] transition-all"
                >
                  End Session
                </AlertDialogAction>
                <AlertDialogCancel className="w-full h-[48px] m-0 rounded-[20px] font-semibold bg-secondary/50 text-secondary-foreground border border-border/30 hover:bg-secondary/70 active:scale-[0.98] transition-all">
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
          <span className="truncate">
            {subject} <span className="opacity-40 mx-1">•</span> {topic}
          </span>
          {review && (
            <span className="shrink-0 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 font-semibold text-[10px] tracking-widest uppercase">
              Review
            </span>
          )}
        </div>
        <div className="mt-3 flex h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
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

      <main className="flex-1 min-h-0 flex flex-col px-5 pt-6 max-w-2xl w-full mx-auto pb-4">
        <div className="w-full h-full relative [perspective:1200px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full h-full relative"
            >
              <motion.div
                initial={false}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
                className="w-full h-full relative"
                style={{ transformStyle: "preserve-3d" }}
              >
                <div
                  className={`absolute inset-0 w-full h-full rounded-[36px] backdrop-blur-3xl border transition-all duration-200 ease-out ${borderClass} overflow-hidden flex flex-col`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "translateZ(1px)",
                    zIndex: flipped ? 0 : 10,
                    pointerEvents: flipped ? "none" : "auto",
                  }}
                >
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-8 min-h-full flex flex-col justify-center">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 text-center mb-6">
                        {card.prompt}
                      </div>
                      <div className="flex flex-col items-center justify-center gap-4 py-4">
                        <p className="text-[22px] md:text-[26px] font-semibold leading-tight text-center text-balance text-foreground/90 tracking-tight">
                          {card.question}
                        </p>
                        {card.image_url && (
                          <div className="relative rounded-[24px] overflow-hidden border border-border/30 shadow-sm mt-4 w-full">
                            <img src={card.image_url} alt="" className="w-full aspect-[2/1] object-cover" />
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <div
                  className={`absolute inset-0 w-full h-full rounded-[36px] backdrop-blur-3xl border transition-all duration-200 ease-out ${borderClass} overflow-hidden flex flex-col`}
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg) translateZ(1px)",
                    zIndex: flipped ? 10 : 0,
                    pointerEvents: flipped ? "auto" : "none",
                  }}
                >
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-8">
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">
                        {card.prompt}
                      </div>
                      <p className="mt-2 text-[15px] font-medium leading-snug text-foreground/60">{card.question}</p>

                      <div className="mt-8 mb-4 border-b border-border/20 w-full" />

                      <div className="text-[11px] font-semibold uppercase tracking-widest text-success/80 mb-2">
                        Answer
                      </div>
                      <p className="text-[22px] md:text-[26px] font-semibold leading-tight text-balance text-foreground/90 tracking-tight">
                        {card.answer}
                      </p>

                      {card.sections.map((s, i) => (
                        <div key={i} className="mt-6 pt-6 border-t border-border/20">
                          <div className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 mb-2">
                            {s.title}
                          </div>
                          <p className="text-[15px] text-foreground/70 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </motion.div>
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
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all"
            >
              <ChevronLeft className="h-6 w-6 text-foreground/80 ml-[-2px]" />
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
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full bg-white/20 dark:bg-black/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-90 transition-all animate-in zoom-in duration-300"
            >
              <ChevronRight className="h-6 w-6 text-foreground/80 mr-[-2px]" />
            </button>
          )}
        </div>
      </main>

      {/* FIXED Padding */}
      <footer className="shrink-0 px-5 pb-6 pt-2 max-w-2xl w-full mx-auto relative z-10 mb-2">
        {flipped ? (
          <div className="grid grid-cols-3 gap-3">
            <RatingButton
              label="Hard"
              tone="destructive"
              onClick={() => rate("hard")}
              disabled={isTransitioning}
              active={currentRating === "hard"}
            />
            <RatingButton
              label="Medium"
              tone="warning"
              onClick={() => rate("medium")}
              disabled={isTransitioning}
              active={currentRating === "medium"}
            />
            <RatingButton
              label="Easy"
              tone="success"
              onClick={() => rate("easy")}
              disabled={isTransitioning}
              active={currentRating === "easy"}
            />
          </div>
        ) : (
          <button
            onClick={() => setFlipped(true)}
            className="w-full h-14 rounded-[24px] bg-primary/10 text-primary font-semibold text-[17px] border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.1)]"
          >
            Reveal Answer
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
    ? active
      ? "bg-destructive text-white shadow-md border-transparent"
      : "bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/20"
    : isWarning
      ? active
        ? "bg-warning text-white shadow-md border-transparent"
        : "bg-warning/15 text-warning border-warning/20 hover:bg-warning/20"
      : active
        ? "bg-success text-white shadow-md border-transparent"
        : "bg-success/15 text-success border-success/20 hover:bg-success/20";

  const stateCls = disabled
    ? active
      ? "opacity-100"
      : "opacity-50 cursor-not-allowed"
    : "cursor-pointer active:scale-95";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-[52px] rounded-[20px] font-semibold text-[15px] tracking-wide backdrop-blur-xl border transition-all duration-300 ${bgCls} ${stateCls}`}
    >
      {label}
    </button>
  );
}
