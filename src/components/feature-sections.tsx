import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Layers, Target, Timer } from "lucide-react";
import type { DeckSummary } from "@/lib/flashcards.functions";
import type { McqTestSummary } from "@/lib/mcq.functions";
import type { McqPracticeTestSummary } from "@/lib/mcq-practice.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const CARD_STYLES = [
  { gradient: "bg-gradient-to-br from-pink-100 to-pink-50 border-pink-200", iconColor: "text-pink-600" },
  { gradient: "bg-gradient-to-br from-emerald-100 to-emerald-50 border-emerald-200", iconColor: "text-emerald-600" },
  { gradient: "bg-gradient-to-br from-violet-100 to-violet-50 border-violet-200", iconColor: "text-violet-600" },
  { gradient: "bg-gradient-to-br from-amber-100 to-amber-50 border-amber-200", iconColor: "text-amber-600" },
  { gradient: "bg-gradient-to-br from-blue-100 to-blue-50 border-blue-200", iconColor: "text-blue-600" },
] as const;

export function EmptyState({ what }: { what: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-border/60 bg-muted/30 p-10 text-center shadow-sm">
      <p className="text-[15px] font-medium text-muted-foreground">
        No {what} yet. An admin can add them from{" "}
        <Link to="/admin" className="text-primary font-bold hover:underline">
          Admin
        </Link>
        .
      </p>
    </div>
  );
}

export function FilterSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const ALL = "__all__";
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{label}</div>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)} disabled={disabled}>
        <SelectTrigger className="rounded-xl border-2 border-border/50 h-11 bg-background/50 backdrop-blur-sm font-medium">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL} className="font-semibold">
            {placeholder}
          </SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt} className="font-medium">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DeckCard({ deck, style }: { deck: DeckSummary; style: (typeof CARD_STYLES)[number] }) {
  return (
    <li>
      <Link
        to="/practice/$deckId"
        params={{ deckId: deck.id }}
        search={{ review: false }}
        className={`group w-full text-left flex items-center gap-4 rounded-[28px] border-[1.5px] p-5 transition-all duration-200 shadow-[0_8px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.08)] hover:-translate-y-1 active:translate-y-0.5 active:shadow-sm relative overflow-hidden ${style.gradient}`}
      >
        <div className="relative h-14 w-14 rounded-2xl bg-white/60 backdrop-blur-md border border-white flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)] z-10">
          <Layers className={`h-6 w-6 ${style.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1 z-10">
          <div className="text-[11px] font-bold uppercase tracking-widest text-foreground/50 mb-1 truncate">
            {deck.subject} · {deck.topic}
          </div>
          <div className="text-[17px] font-bold text-foreground/90 tracking-tight drop-shadow-sm truncate">
            {deck.name}
          </div>
          {deck.description && (
            <div className="mt-0.5 text-[14px] font-medium text-foreground/70 line-clamp-2">{deck.description}</div>
          )}
          <div className="mt-1.5 inline-flex items-center text-[12px] font-bold text-foreground/70 bg-white/50 border border-white/60 shadow-sm px-2.5 py-0.5 rounded-lg">
            {deck.count} card{deck.count === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronRight className="h-6 w-6 text-foreground/40 shrink-0 group-hover:translate-x-1 group-hover:text-foreground/70 transition-all z-10" />
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/40 blur-3xl rounded-full pointer-events-none" />
      </Link>
    </li>
  );
}

export function FlashcardsSection({ decks }: { decks: DeckSummary[] }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const subjects = useMemo(() => Array.from(new Set(decks.map((d) => d.subject))).sort(), [decks]);
  const topics = useMemo(
    () => (subject ? Array.from(new Set(decks.filter((d) => d.subject === subject).map((d) => d.topic))).sort() : []),
    [decks, subject],
  );
  const filtered = useMemo(
    () => decks.filter((d) => (!subject || d.subject === subject) && (!topic || d.topic === topic)),
    [decks, subject, topic],
  );

  return (
    <>
      <section className="grid grid-cols-2 gap-4">
        <FilterSelect
          label="Subject"
          placeholder="All subjects"
          options={subjects}
          value={subject}
          onChange={(v) => {
            setSubject(v);
            setTopic(null);
          }}
        />
        <FilterSelect
          label="Topic"
          placeholder={subject ? "All topics" : "Pick subject first"}
          options={topics}
          value={topic}
          onChange={setTopic}
          disabled={!subject}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">
            {filtered.length} deck{filtered.length === 1 ? "" : "s"} found
          </h2>
          {(subject || topic) && (
            <button
              onClick={() => {
                setSubject(null);
                setTopic(null);
              }}
              className="text-[12px] font-bold text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState what="decks" />
        ) : (
          <ul className="space-y-4">
            {filtered.map((d, i) => (
              <DeckCard key={d.id} deck={d} style={CARD_STYLES[i % CARD_STYLES.length]} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function McqSection({ tests }: { tests: McqTestSummary[] }) {
  if (tests.length === 0) return <EmptyState what="tests" />;
  return (
    <section className="space-y-4">
      <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest px-1">
        {tests.length} test{tests.length === 1 ? "" : "s"} available
      </h2>
      <ul className="space-y-4">
        {tests.map((t, i) => {
          const style = CARD_STYLES[i % CARD_STYLES.length];
          return (
            <li key={t.id}>
              <Link
                to="/mcq/$testId"
                params={{ testId: t.id }}
                className={`group w-full text-left flex items-center gap-4 rounded-[28px] border-[1.5px] p-5 transition-all duration-200 shadow-[0_8px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.08)] hover:-translate-y-1 active:translate-y-0.5 active:shadow-sm relative overflow-hidden ${style.gradient}`}
              >
                <div className="relative h-14 w-14 rounded-2xl bg-white/60 backdrop-blur-md border border-white flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)] z-10">
                  <Timer className={`h-6 w-6 ${style.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1 z-10">
                  <div className="text-[17px] font-bold text-foreground/90 tracking-tight drop-shadow-sm truncate">
                    {t.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[12px] font-bold text-foreground/70 bg-white/50 border border-white/60 shadow-sm px-2.5 py-0.5 rounded-lg">
                      {Math.round(t.duration_seconds / 60)} mins
                    </span>
                    <span className="text-[12px] font-bold text-foreground/70 bg-white/50 border border-white/60 shadow-sm px-2.5 py-0.5 rounded-lg">
                      {t.question_count} Qs
                    </span>
                  </div>
                  {t.description && (
                    <div className="mt-1.5 text-[14px] font-medium text-foreground/70 line-clamp-2">
                      {t.description}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-6 w-6 text-foreground/40 shrink-0 group-hover:translate-x-1 group-hover:text-foreground/70 transition-all z-10" />
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/40 blur-3xl rounded-full pointer-events-none" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function McqPracticeSection({ tests }: { tests: McqPracticeTestSummary[] }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const subjects = useMemo(() => Array.from(new Set(tests.map((t) => t.subject).filter(Boolean))).sort(), [tests]);
  const topics = useMemo(
    () =>
      subject
        ? Array.from(
            new Set(
              tests
                .filter((t) => t.subject === subject)
                .map((t) => t.topic)
                .filter(Boolean),
            ),
          ).sort()
        : [],
    [tests, subject],
  );
  const filtered = useMemo(
    () => tests.filter((t) => (!subject || t.subject === subject) && (!topic || t.topic === topic)),
    [tests, subject, topic],
  );

  return (
    <>
      <section className="grid grid-cols-2 gap-4">
        <FilterSelect
          label="Subject"
          placeholder="All subjects"
          options={subjects}
          value={subject}
          onChange={(v) => {
            setSubject(v);
            setTopic(null);
          }}
        />
        <FilterSelect
          label="Topic"
          placeholder={subject ? "All topics" : "Pick subject first"}
          options={topics}
          value={topic}
          onChange={setTopic}
          disabled={!subject}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">
            {filtered.length} practice set{filtered.length === 1 ? "" : "s"} found
          </h2>
          {(subject || topic) && (
            <button
              onClick={() => {
                setSubject(null);
                setTopic(null);
              }}
              className="text-[12px] font-bold text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState what="practice sets" />
        ) : (
          <ul className="space-y-4">
            {filtered.map((t, i) => {
              const style = CARD_STYLES[i % CARD_STYLES.length];
              return (
                <li key={t.id}>
                  <Link
                    to="/practice-mcq/$testId"
                    params={{ testId: t.id }}
                    search={{ review: false }}
                    className={`group w-full text-left flex items-center gap-4 rounded-[28px] border-[1.5px] p-5 transition-all duration-200 shadow-[0_8px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.08)] hover:-translate-y-1 active:translate-y-0.5 active:shadow-sm relative overflow-hidden ${style.gradient}`}
                  >
                    <div className="relative h-14 w-14 rounded-2xl bg-white/60 backdrop-blur-md border border-white flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)] z-10">
                      <Target className={`h-6 w-6 ${style.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1 z-10">
                      {(t.subject || t.topic) && (
                        <div className="text-[11px] font-bold uppercase tracking-widest text-foreground/50 mb-1 truncate">
                          {[t.subject, t.topic].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="text-[17px] font-bold text-foreground/90 tracking-tight drop-shadow-sm truncate">
                        {t.name}
                      </div>
                      <div className="mt-1.5 inline-flex items-center text-[12px] font-bold text-foreground/70 bg-white/50 border border-white/60 shadow-sm px-2.5 py-0.5 rounded-lg">
                        {t.question_count} Qs
                      </div>
                      {t.description && (
                        <div className="mt-1.5 text-[14px] font-medium text-foreground/70 line-clamp-2">
                          {t.description}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-6 w-6 text-foreground/40 shrink-0 group-hover:translate-x-1 group-hover:text-foreground/70 transition-all z-10" />
                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/40 blur-3xl rounded-full pointer-events-none" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
