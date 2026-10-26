// A card as students see it in the app: the flip card of the practice page
// (prompt and front; then the answer and a section per explanation). Tap
// to flip; a chunk's cards one after another, in number order.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { FlashCard, FlashTopic } from "@/lib/flash-studio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Shown = Pick<FlashCard, "prompt" | "front" | "back" | "ex">;

const studentCard = (topic: Pick<FlashTopic, "prompt" | "columns">, c: Shown) => ({
  prompt: (c.prompt ?? topic.prompt).trim(),
  question: c.front,
  answer: c.back,
  sections: topic.columns
    .map((col) => ({ title: col.title, body: (c.ex[col.id] ?? "").trim() }))
    .filter((s) => s.body),
});

export function StudentPreview({
  topic,
  cards,
  title,
  onClose,
}: {
  topic: Pick<FlashTopic, "prompt" | "columns">;
  cards: Shown[];
  title: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const go = (n: number) => {
    if (n < 0 || n >= cards.length) return;
    setI(n);
    setFlipped(false);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const card = cards[i] ? studentCard(topic, cards[i]) : null;
  const face =
    "absolute inset-0 flex flex-col overflow-hidden rounded-[36px] border border-border/60 bg-card shadow-[0_8px_32px_rgba(0,0,0,0.08)] [backface-visibility:hidden]";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[96dvh] flex-col gap-3 p-4 sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            As students see it in the app. Tap the card to flip it.
          </p>
        </DialogHeader>
        {card ? (
          <div className="relative h-[min(34rem,70dvh)] w-full [perspective:1200px]">
            <div
              role="button"
              tabIndex={0}
              aria-label={flipped ? "Card back" : "Card front"}
              onClick={() => setFlipped(!flipped)}
              className="relative h-full w-full cursor-pointer transition-transform duration-500 [transform-style:preserve-3d]"
              style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
            >
              <div className={face} aria-hidden={flipped}>
                <div className="flex flex-1 flex-col justify-center overflow-y-auto p-8">
                  <div className="mb-6 text-center text-[11px] font-semibold uppercase tracking-widest text-primary/70">
                    {card.prompt}
                  </div>
                  <p
                    lang="hi"
                    className="whitespace-pre-wrap text-balance text-center text-[22px] font-semibold leading-tight tracking-tight text-foreground/90 md:text-[26px]"
                  >
                    {card.question}
                  </p>
                </div>
              </div>
              <div
                className={face}
                style={{ transform: "rotateY(180deg)" }}
                aria-hidden={!flipped}
                data-face="back"
              >
                <div className="flex-1 overflow-y-auto p-8" lang="hi">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">
                    {card.prompt}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] font-medium leading-snug text-foreground/60">
                    {card.question}
                  </p>
                  <div className="mb-4 mt-8 w-full border-b border-border/20" />
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-600/80">
                    Answer
                  </div>
                  <p className="whitespace-pre-wrap text-balance text-[22px] font-semibold leading-tight tracking-tight text-foreground/90 md:text-[26px]">
                    {card.answer}
                  </p>
                  {card.sections.map((s, k) => (
                    <div key={k} className="mt-6 border-t border-border/20 pt-6">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-primary/70">
                        {s.title}
                      </div>
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/70">
                        {s.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">No cards.</p>
        )}
        <div className="flex items-center gap-2">
          {cards.length > 1 && (
            <>
              <Button
                size="icon"
                variant="outline"
                aria-label="Previous card"
                disabled={i === 0}
                onClick={() => go(i - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {i + 1} / {cards.length}
              </span>
              <Button
                size="icon"
                variant="outline"
                aria-label="Next card"
                disabled={i === cards.length - 1}
                onClick={() => go(i + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button className="ml-auto" variant="outline" onClick={() => setFlipped(!flipped)}>
            <RotateCcw className="mr-1 h-4 w-4" /> {flipped ? "Show front" : "Reveal answer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
