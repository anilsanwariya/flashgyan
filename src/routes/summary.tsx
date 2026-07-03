import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Trophy, Clock, Layers, Check, X, ChevronDown, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
    <div className="min-h-dvh bg-gradient-to-br from-primary/10 via-background to-secondary/10 relative overflow-hidden selection:bg-primary/20">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-40 -left-24 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-32 h-[500px] w-[500px] rounded-full bg-secondary/30 blur-[120px]" />

      <header className="relative z-50 sticky top-0 backdrop-blur-2xl bg-white/40 dark:bg-black/40 border-b border-border/20">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-5 py-3">
          <Link
            to={featureLink}
            className="inline-flex items-center gap-1.5 rounded-full h-10 px-4 text-sm font-semibold text-foreground/80 bg-white/50 dark:bg-black/40 border border-border/30 backdrop-blur-xl active:scale-95 transition-all"
          >
            <ArrowLeft className="h-4 w-4" /> {featureName}
          </Link>
          <img src={finalLogo} alt="Flashgyan" className="h-9 w-auto object-contain drop-shadow-sm opacity-80" />
        </div>
      </header>

      <main className="relative z-10 max-w-2xl w-full mx-auto px-5 pt-8 pb-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[32px] bg-primary/10 text-primary border border-primary/25 backdrop-blur-xl shadow-[0_8px_32px_rgba(var(--primary),0.15)] mb-4">
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
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
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
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-4">
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
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
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
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-4">
                  Showing {filteredCards.length} {ratingLabel[selectedRating].toLowerCase()} card
                  {filteredCards.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-4">
                  {filteredCards.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-[32px] border border-border/30 bg-white/50 dark:bg-black/30 backdrop-blur-3xl p-6"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-white/60 dark:bg-black/40 border border-border/30 backdrop-blur-xl inline-block px-2.5 py-1 rounded-full mb-3">
                        {c.subject} · {c.topic}
                      </div>
                      <div className="font-semibold text-lg leading-snug mb-3 text-foreground/90">
                        <span className="text-[12px] font-bold text-primary uppercase tracking-widest mr-2 bg-primary/10 border border-primary/20 backdrop-blur-xl px-2 py-0.5 rounded-full">
                          {c.prompt}
                        </span>
                        {c.question}
                      </div>
                      <div className="text-[15px] text-muted-foreground font-medium leading-relaxed bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-border/30 backdrop-blur-xl">
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
          <Link
            to="/"
            className="h-14 rounded-[24px] flex items-center justify-center font-semibold text-[15px] text-foreground/80 bg-white/50 dark:bg-black/40 border border-border/40 backdrop-blur-xl active:scale-[0.98] transition-all"
          >
            Back to Home
          </Link>
          {practiceId ? (
            <Link
              to="/practice-mcq/$testId"
              params={{ testId: practiceId }}
              search={{ review: incorrect > 0 }}
              className="h-14 rounded-[24px] flex items-center justify-center font-semibold text-[15px] text-primary bg-primary/10 border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.12)]"
            >
              {incorrect > 0 ? "Review Incorrect" : "Practice Again"}
            </Link>
          ) : deckId ? (
            <Link
              to="/practice/$deckId"
              params={{ deckId }}
              search={{ review: hard + medium > 0 }}
              className="h-14 rounded-[24px] flex items-center justify-center font-semibold text-[15px] text-primary bg-primary/10 border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.12)]"
            >
              {hard + medium > 0 ? "Review Weak Cards" : "Practice Again"}
            </Link>
          ) : (
            <Link
              to="/"
              className="h-14 rounded-[24px] flex items-center justify-center font-semibold text-[15px] text-primary bg-primary/10 border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.12)]"
            >
              Done
            </Link>
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
      <li className="rounded-[32px] border border-border/30 bg-white/50 dark:bg-black/30 backdrop-blur-3xl p-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-white/60 border border-border/30 backdrop-blur-xl inline-block px-2.5 py-1 rounded-full mb-3">
          {card.subject} · {card.topic}
        </div>
        <div className="font-semibold text-lg leading-snug mb-3 text-foreground/90">{card.question}</div>
        <div className="text-[15px] text-muted-foreground font-medium leading-relaxed bg-white/40 dark:bg-black/20 p-4 rounded-2xl border border-border/30 backdrop-blur-xl">
          {card.answer}
        </div>
      </li>
    );
  }

  const glowCls = correct
    ? "border-success/40 shadow-[0_8px_32px_rgba(16,185,129,0.12)]"
    : "border-destructive/40 shadow-[0_8px_32px_rgba(239,68,68,0.12)]";

  return (
    <li className={`rounded-[32px] border bg-white/50 dark:bg-black/30 backdrop-blur-3xl p-6 md:p-8 space-y-5 transition-colors ${glowCls}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-white/60 dark:bg-black/40 border border-border/30 backdrop-blur-xl px-2.5 py-1 rounded-full">
          Q{index + 1} · {card.subject} {card.topic ? `· ${card.topic}` : ""}
        </div>
        <div
          className={`text-xs font-bold flex items-center gap-1 backdrop-blur-xl border px-2.5 py-1 rounded-full ${
            correct ? "text-success bg-success/10 border-success/25" : "text-destructive bg-destructive/10 border-destructive/25"
          }`}
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
        <div className="relative rounded-3xl overflow-hidden border border-border/30 shadow-sm">
          <img src={mcq.imageUrl} alt="" className="max-h-60 w-full object-contain bg-white/40" />
        </div>
      )}

      {mcq.question_ext && (
        <p className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap text-amber-700 dark:text-amber-400 bg-amber-500/10 p-4 rounded-3xl border border-amber-500/20 backdrop-blur-xl">
          <strong className="block mb-1 text-xs uppercase tracking-widest">Hint</strong>
          {mcq.question_ext}
        </p>
      )}

      <ul className="space-y-2 pt-2">
        {mcq.options.map((text, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const isAnswer = n === mcq.answerIndex;
          const isPick = n === mcq.pickedIndex;

          let optBaseCls =
            "w-full text-left rounded-[20px] border px-4 py-3 flex items-start gap-3 transition-colors backdrop-blur-xl ";
          if (isAnswer) optBaseCls += "border-success/40 bg-success/10 text-foreground";
          else if (isPick) optBaseCls += "border-destructive/40 bg-destructive/10 text-foreground";
          else optBaseCls += "border-border/30 bg-white/40 dark:bg-black/20 text-muted-foreground";

          return (
            <li key={n} className={optBaseCls}>
              <div
                className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border ${
                  isAnswer
                    ? "bg-success text-white border-transparent"
                    : isPick
                      ? "bg-destructive text-white border-transparent"
                      : "bg-white/60 text-foreground/60 border-border/40"
                }`}
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
        <div className="mt-4 border-t border-border/30 pt-4">
          <button
            type="button"
            onClick={() => setShowExplanation((s) => !s)}
            className="flex items-center gap-1.5 text-[14px] font-bold text-primary"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showExplanation ? "rotate-180" : ""}`} />
            {showExplanation ? "Hide Explanation" : "Read Explanation"}
          </button>
          {showExplanation && (
            <div className="mt-4 space-y-4 bg-white/40 dark:bg-black/20 backdrop-blur-xl p-5 rounded-3xl border border-border/30">
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
    <div className="rounded-[28px] bg-white/50 dark:bg-black/30 border border-border/30 backdrop-blur-3xl p-4 text-center">
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
  const activeGlow =
    tone === "success"
      ? "border-success/40 shadow-[0_8px_32px_rgba(16,185,129,0.15)] bg-success/5"
      : tone === "warning"
        ? "border-warning/40 shadow-[0_8px_32px_rgba(234,179,8,0.15)] bg-warning/5"
        : "border-destructive/40 shadow-[0_8px_32px_rgba(239,68,68,0.15)] bg-destructive/5";

  let stateCls: string;
  if (disabled) stateCls = "opacity-50 cursor-not-allowed border-border/30 bg-white/40 dark:bg-black/20";
  else if (active) stateCls = activeGlow;
  else stateCls = "border-border/30 bg-white/50 dark:bg-black/30 active:scale-[0.99] hover:bg-white/60";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`w-full text-left rounded-[28px] border backdrop-blur-3xl p-5 transition-all duration-200 ${stateCls}`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-bold text-[17px]">{label}</div>
        <div className="text-[13px] font-bold tabular-nums text-muted-foreground">
          {value} items · {pct}%
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
