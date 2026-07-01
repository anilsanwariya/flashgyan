// src/routes/practice.$deckId.tsx
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

  const ratings = useMemo(() => {
    const r = { hard: 0, medium: 0, easy: 0 };
    for (const c of cardRatings) if (c) r[c]++;
    return r;
  }, [cardRatings]);

  const card = cards[index];
  const total = cards.length;
  const currentRating = cardRatings[index];

  const borderClass =
    currentRating === "hard"
      ? "border-destructive"
      : currentRating === "medium"
        ? "border-warning"
        : currentRating === "easy"
          ? "border-success"
          : "border-border";

  function submit(finalRatings: (Rating | null)[]) {
    const endedAt = Date.now();
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

    saveSession(sessionId, { deckId, subject, topic, startedAt: startedAt.current, endedAt, results });
    const state = loadReview(deckId);
    for (const r of results) state[r.id] = r.rating;
    saveReview(deckId, state);

    setNavData({
      deckId,
      total: results.length,
      hard: counts.hard,
      medium: counts.medium,
      easy: counts.easy,
      seconds: Math.round((endedAt - startedAt.current) / 1000),
      sessionId,
    });
    setShowDownloadPopup(true);
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
              <button className="inline-flex items-center gap-1 rounded-full h-9 px-4 text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 transition-colors">
                End Session <X className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End session?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continue</AlertDialogCancel>
                <AlertDialogAction onClick={() => submit(cardRatings)} className="bg-destructive">
                  End session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 max-w-2xl w-full mx-auto pb-6">
        <div className="w-full relative min-h-[60vh] [perspective:1000px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              className="relative w-full h-full"
              initial={false}
              animate={{ rotateY: flipped ? -180 : 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Front Face */}
              <div
                className={`absolute inset-0 w-full h-full rounded-[22px] bg-card border-2 shadow-sm ${borderClass} flex flex-col`}
                style={{ backfaceVisibility: "hidden" }}
              >
                <ScrollArea className="flex-1 h-full p-7">
                  <div className="text-xs font-semibold text-muted-foreground text-center uppercase">{card.prompt}</div>
                  <div className="text-2xl font-semibold text-center mt-6">{card.question}</div>
                </ScrollArea>
              </div>
              {/* Back Face */}
              <div
                className={`absolute inset-0 w-full h-full rounded-[22px] bg-card border-2 shadow-sm ${borderClass} flex flex-col [transform:rotateY(180deg)]`}
                style={{ backfaceVisibility: "hidden" }}
              >
                <ScrollArea className="flex-1 h-full p-7">
                  <div className="text-2xl font-semibold">{card.answer}</div>
                </ScrollArea>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="px-5 pb-6 pt-2 max-w-2xl w-full mx-auto">
        {!flipped ? (
          <button
            onClick={() => setFlipped(true)}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold"
          >
            Reveal answer
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <RatingButton label="Hard" tone="destructive" onClick={() => rate("hard")} />
            <RatingButton label="Medium" tone="warning" onClick={() => rate("medium")} />
            <RatingButton label="Easy" tone="success" onClick={() => rate("easy")} />
          </div>
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
}: {
  label: string;
  tone: "destructive" | "warning" | "success";
  onClick: () => void;
}) {
  const cls = tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-success";
  return (
    <button onClick={onClick} className={`h-14 rounded-2xl text-white font-semibold ${cls}`}>
      {label}
    </button>
  );
}
