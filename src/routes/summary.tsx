import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Trophy, Clock, Layers, Check, X, ChevronDown, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadSession, type SessionDetail, type Rating, type SessionCardResult } from "@/lib/session-store";
import finalLogo from "@/assets/final-logo.png";

const summarySchema = z.object({
  deckId: fallback(z.string(), "").default(""),
  practiceId: fallback(z.string(), "").default(""),
  total: fallback(z.number().int().min(0), 0).default(0),
  hard: fallback(z.number().int().min(0), 0).default(0),
  medium: fallback(z.number().int().min(0), 0).default(0),
  easy: fallback(z.number().int().min(0), 0).default(0),
  seconds: fallback(z.number().int().min(0), 0).default(0),
  sessionId: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/summary")({
  validateSearch: zodValidator(summarySchema),
  beforeLoad: ({ search }) => {
    if (!search.total) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Session summary — Flashgyan web" }],
  }),
  component: Summary,
});

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const ratingLabel: Record<Rating, string> = {
  hard: "Hard",
  medium: "Medium",
  easy: "Easy",
};

function Summary() {
  const { deckId, practiceId, total, hard, medium, easy, seconds, sessionId } = Route.useSearch();
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (sessionId) setDetail(loadSession(sessionId));
  }, [sessionId]);

  const isPractice = !!practiceId;
  const correct = easy;
  const incorrect = hard + medium;

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const avgSec = total ? Math.round(seconds / total) : 0;

  const [selectedPractice, setSelectedPractice] = useState<"correct" | "incorrect" | null>(null);
  const [selectedRating, setSelectedRating] = useState<Rating | null>(null);

  const filteredCards = useMemo(() => {
    if (!detail) return [];
    if (isPractice) {
      if (!selectedPractice) return [];
      return detail.results.filter((r) => (selectedPractice === "correct" ? r.rating === "easy" : r.rating !== "easy"));
    }
    if (!selectedRating) return [];
    return detail.results.filter((r) => r.rating === selectedRating);
  }, [detail, isPractice, selectedPractice, selectedRating]);

  const featureLink = deckId ? "/flashcards" : practiceId ? "/mcq-practice" : "/";
  const featureName = deckId ? "Flashcards" : practiceId ? "MCQ Practice" : "Home";

  return (
    <div className="min-h-dvh bg-background/50 relative overflow-hidden selection:bg-primary/20">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button asChild variant="outline" className="rounded-xl shadow-sm border-2">
            <Link to={featureLink}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> {featureName}
            </Link>
          </Button>
          <img src={finalLogo} alt="Flashgyan" className="h-9 w-auto object-contain drop-shadow-sm opacity-80" />
        </div>
      </header>

      <main className="max-w-2xl w-full mx-auto px-5 pt-8 pb-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[32px] bg-primary/10 text-primary border-2 border-primary/20 shadow-inner mb-4">
            <Trophy className="h-10 w-10" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Session Complete!</h1>
          <p className="mt-3 text-muted-foreground font-medium text-[15px] md:text-[17px]">
            You crushed {total} {isPractice ? "question" : "card"}
            {total === 1 ? "" : "s"} in {fmtTime(seconds)}.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-10">
          <Stat
            icon={<Layers className="h-5 w-5" />}
            label={isPractice ? "Questions" : "Cards"}
            value={String(total)}
          />
          <Stat icon={<Clock className="h-5 w-5" />} label="Total Time" value={fmtTime(seconds)} />
          <Stat icon={<Clock className="h-5 w-5" />} label="Avg/Item" value={`${avgSec}s`} />
        </div>

        {isPractice ? (
          <section className="space-y-4">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1">
              Results {detail ? "· tap to review questions" : ""}
            </h2>
            <div className="space-y-3">
              <Row
                label="Correct"
                value={correct}
                pct={pct(correct)}
                tone="success"
                active={selectedPractice === "correct"}
                disabled={!detail || correct === 0}
                onClick={() => setSelectedPractice((s) => (s === "correct" ? null : "correct"))}
              />
              <Row
                label="Incorrect"
                value={incorrect}
                pct={pct(incorrect)}
                tone="destructive"
                active={selectedPractice === "incorrect"}
                disabled={!detail || incorrect === 0}
                onClick={() => setSelectedPractice((s) => (s === "incorrect" ? null : "incorrect"))}
              />
            </div>

            {selectedPractice && (
              <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-4">
                  Reviewing {filteredCards.length} {selectedPractice} question{filteredCards.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-5">
                  {filteredCards.map((c, i) => (
                    <McqReviewCard key={c.id} index={i} card={c} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1">
              By difficulty {detail ? "· tap to view cards" : ""}
            </h2>
            <div className="space-y-3">
              <Row
                label="Easy"
                value={easy}
                pct={pct(easy)}
                tone="success"
                active={selectedRating === "easy"}
                disabled={!detail || easy === 0}
                onClick={() => setSelectedRating((s) => (s === "easy" ? null : "easy"))}
              />
              <Row
                label="Medium"
                value={medium}
                pct={pct(medium)}
                tone="warning"
                active={selectedRating === "medium"}
                disabled={!detail || medium === 0}
                onClick={() => setSelectedRating((s) => (s === "medium" ? null : "medium"))}
              />
              <Row
                label="Hard"
                value={hard}
                pct={pct(hard)}
                tone="destructive"
                active={selectedRating === "hard"}
                disabled={!detail || hard === 0}
                onClick={() => setSelectedRating((s) => (s === "hard" ? null : "hard"))}
              />
            </div>

            {selectedRating && (
              <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-4">
                  Showing {filteredCards.length} {ratingLabel[selectedRating].toLowerCase()} card
                  {filteredCards.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-4">
                  {filteredCards.map((c) => (
                    <li key={c.id} className="rounded-[24px] border-2 border-border/60 bg-card p-6 shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted inline-block px-2 py-0.5 rounded-md mb-3">
                        {c.subject} · {c.topic}
                      </div>
                      <div className="font-semibold text-lg leading-snug mb-3 text-foreground/90">
                        <span className="text-[12px] font-bold text-primary uppercase tracking-widest mr-2 bg-primary/10 px-2 py-0.5 rounded-md">
                          {c.prompt}
                        </span>
                        {c.question}
                      </div>
                      <div className="text-[15px] text-muted-foreground font-medium leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border/40">
                        {c.answer}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="mt-12 grid grid-cols-2 gap-4">
          <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl font-bold border-2">
            <Link to="/">Back to Home</Link>
          </Button>
          {practiceId ? (
            <Button asChild size="lg" className="h-14 rounded-2xl font-bold shadow-lg shadow-primary/20">
              <Link to="/practice-mcq/$testId" params={{ testId: practiceId }} search={{ review: incorrect > 0 }}>
                {incorrect > 0 ? "Review Incorrect" : "Practice Again"}
              </Link>
            </Button>
          ) : deckId ? (
            <Button asChild size="lg" className="h-14 rounded-2xl font-bold shadow-lg shadow-primary/20">
              <Link to="/practice/$deckId" params={{ deckId }} search={{ review: hard + medium > 0 }}>
                {hard + medium > 0 ? "Review Weak Cards" : "Practice Again"}
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="h-14 rounded-2xl font-bold shadow-lg shadow-primary/20">
              <Link to="/">Done</Link>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function McqReviewCard({ index, card }: { index: number; card: SessionCardResult }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const correct = card.rating === "easy";
  const mcq = card.mcq;

  if (!mcq) {
    return (
      <li className="rounded-[24px] border-2 border-border/60 bg-card p-6 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted inline-block px-2 py-0.5 rounded-md mb-3">
          {card.subject} · {card.topic}
        </div>
        <div className="font-semibold text-lg leading-snug mb-3 text-foreground/90">{card.question}</div>
        <div className="text-[15px] text-muted-foreground font-medium leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border/40">
          {card.answer}
        </div>
      </li>
    );
  }

  const borderCls = correct
    ? "border-success/40 shadow-[0_8px_30px_rgba(16,185,129,0.06)]"
    : "border-destructive/40 shadow-[0_8px_30px_rgba(239,68,68,0.06)]";

  return (
    <li className={`rounded-[28px] border-2 bg-card p-6 md:p-8 space-y-5 transition-colors ${borderCls}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-lg">
          Q{index + 1} · {card.subject} {card.topic ? `· ${card.topic}` : ""}
        </div>
        <div
          className={`text-xs font-bold flex items-center gap-1 ${correct ? "text-success bg-success/10" : "text-destructive bg-destructive/10"} px-2 py-1 rounded-md`}
        >
          {correct ? (
            <>
              <Check className="h-3.5 w-3.5" /> Correct
            </>
          ) : (
            <>
              <X className="h-3.5 w-3.5" /> Incorrect
            </>
          )}
        </div>
      </div>

      <p className="text-[18px] font-bold leading-snug text-foreground/90">{card.question}</p>

      {mcq.imageUrl && (
        <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-sm">
          <img src={mcq.imageUrl} alt="" className="max-h-60 w-full object-contain bg-muted/20" />
        </div>
      )}

      {mcq.hint && (
        <p className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap text-amber-700 dark:text-amber-400 bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20">
          <strong className="block mb-1 text-xs uppercase tracking-widest">Hint</strong>
          {mcq.hint}
        </p>
      )}

      <ul className="space-y-2 pt-2">
        {mcq.options.map((text, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const isAnswer = n === mcq.answerIndex;
          const isPick = n === mcq.pickedIndex;

          let optBaseCls =
            "w-full text-left rounded-[16px] border-2 px-4 py-3 flex items-start gap-3 transition-colors ";
          if (isAnswer) optBaseCls += "border-success/60 bg-success/10 text-foreground";
          else if (isPick) optBaseCls += "border-destructive/60 bg-destructive/10 text-foreground";
          else optBaseCls += "border-border/40 bg-muted/20 text-muted-foreground";

          return (
            <li key={n} className={optBaseCls}>
              <div
                className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 ${isAnswer ? "bg-success text-white border-success" : isPick ? "bg-destructive text-white border-destructive" : "bg-muted text-foreground/60 border-border"}`}
              >
                {isAnswer ? (
                  <Check className="h-4 w-4" />
                ) : isPick ? (
                  <X className="h-4 w-4" />
                ) : (
                  String.fromCharCode(64 + n)
                )}
              </div>
              <div className="text-[15px] font-medium leading-snug flex-1 min-w-0 whitespace-pre-wrap block mt-0.5">
                {text}
              </div>
            </li>
          );
        })}
      </ul>

      {mcq.explanationSections.length > 0 && (
        <div className="mt-4 border-t-2 border-border/40 pt-4">
          <button
            type="button"
            onClick={() => setShowExplanation((s) => !s)}
            className="flex items-center gap-1.5 text-[14px] font-bold text-primary group"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showExplanation ? "rotate-180" : ""}`} />
            {showExplanation ? "Hide Explanation" : "Read Explanation"}
          </button>
          {showExplanation && (
            <div className="mt-4 space-y-4 bg-muted/30 p-5 rounded-2xl border border-border/40">
              {mcq.explanationSections.map((s, i) => (
                <div key={i}>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                    {s.title}
                  </div>
                  <p className="text-[14px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{s.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-card border-2 border-border/60 p-4 text-center shadow-sm backdrop-blur-md bg-white/60">
      <div className="flex justify-center mb-1.5 text-muted-foreground">{icon}</div>
      <div className="text-2xl font-extrabold tabular-nums tracking-tight mb-0.5">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Row({
  label,
  value,
  pct,
  tone,
  active,
  disabled,
  onClick,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "success" | "warning" | "destructive";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const bar = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive";

  let stateCls = "";
  if (disabled) stateCls = "opacity-50 cursor-not-allowed border-b-[2px] translate-y-[2px] shadow-none";
  else if (active) stateCls = "border-primary shadow-lg border-b-[2px] translate-y-[4px]";
  else
    stateCls =
      "border-border/60 border-b-[6px] hover:-translate-y-1 hover:border-b-[8px] active:translate-y-[4px] active:border-b-[2px] shadow-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`w-full text-left rounded-[24px] border-2 bg-card p-5 transition-all duration-200 ${stateCls}`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-bold text-[17px]">{label}</div>
        <div className="text-[14px] font-bold tabular-nums text-muted-foreground">
          {value} items · {pct}%
        </div>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
