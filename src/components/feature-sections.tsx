import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Layers, Target, Timer } from "lucide-react";
import type { DeckSummary } from "@/lib/flashcards.functions";
import type { McqTestSummary } from "@/lib/mcq.functions";
import type { McqPracticeTestSummary } from "@/lib/mcq-practice.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const GRADIENTS = ["grad-pink", "grad-lavender", "grad-peach", "grad-mint"] as const;

export function EmptyState({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No {what} yet. An admin can add them from{" "}
        <Link to="/admin" className="text-primary font-medium">
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
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {label}
      </div>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DeckCard({ deck, gradient }: { deck: DeckSummary; gradient: string }) {
  return (
    <li>
      <Link
        to="/practice/$deckId"
        params={{ deckId: deck.id }}
        search={{ review: false }}
        className={`group flex items-center gap-4 rounded-3xl ${gradient} p-5 shadow-soft active:scale-[0.99] transition-transform`}
      >
        <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-foreground/60">
            {deck.subject} · {deck.topic}
          </div>
          <div className="mt-0.5 text-lg font-bold text-foreground truncate">{deck.name}</div>
          {deck.description && (
            <div className="mt-1 text-sm text-foreground/70 line-clamp-2">{deck.description}</div>
          )}
          <div className="mt-1 text-sm text-foreground/60">
            {deck.count} card{deck.count === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </li>
  );
}

export function FlashcardsSection({ decks }: { decks: DeckSummary[] }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const subjects = useMemo(
    () => Array.from(new Set(decks.map((d) => d.subject))).sort(),
    [decks],
  );
  const topics = useMemo(
    () =>
      subject
        ? Array.from(
            new Set(decks.filter((d) => d.subject === subject).map((d) => d.topic)),
          ).sort()
        : [],
    [decks, subject],
  );
  const filtered = useMemo(
    () =>
      decks.filter(
        (d) => (!subject || d.subject === subject) && (!topic || d.topic === topic),
      ),
    [decks, subject, topic],
  );

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
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

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {filtered.length} deck{filtered.length === 1 ? "" : "s"}
          </h2>
          {(subject || topic) && (
            <button
              onClick={() => {
                setSubject(null);
                setTopic(null);
              }}
              className="text-xs text-primary font-medium"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState what="decks" />
        ) : (
          <ul className="space-y-3">
            {filtered.map((d, i) => (
              <DeckCard key={d.id} deck={d} gradient={GRADIENTS[i % GRADIENTS.length]} />
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
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {tests.length} test{tests.length === 1 ? "" : "s"}
      </h2>
      <ul className="space-y-3">
        {tests.map((t, i) => (
          <li key={t.id}>
            <Link
              to="/mcq/$testId"
              params={{ testId: t.id }}
              className={`group flex items-center gap-4 rounded-3xl ${GRADIENTS[i % GRADIENTS.length]} p-5 shadow-soft active:scale-[0.99] transition-transform`}
            >
              <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
                <Timer className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-foreground truncate">{t.name}</div>
                <div className="mt-0.5 text-sm text-foreground/70">
                  {Math.round(t.duration_seconds / 60)} min · {t.question_count} Q
                </div>
                {t.description && (
                  <div className="mt-1 text-sm text-foreground/60 line-clamp-2">
                    {t.description}
                  </div>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function McqPracticeSection({ tests }: { tests: McqPracticeTestSummary[] }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const subjects = useMemo(
    () => Array.from(new Set(tests.map((t) => t.subject).filter(Boolean))).sort(),
    [tests],
  );
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
    () =>
      tests.filter(
        (t) => (!subject || t.subject === subject) && (!topic || t.topic === topic),
      ),
    [tests, subject, topic],
  );

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
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

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {filtered.length} practice set{filtered.length === 1 ? "" : "s"}
          </h2>
          {(subject || topic) && (
            <button
              onClick={() => {
                setSubject(null);
                setTopic(null);
              }}
              className="text-xs text-primary font-medium"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState what="practice sets" />
        ) : (
          <ul className="space-y-3">
            {filtered.map((t, i) => (
              <li key={t.id}>
                <Link
                  to="/practice-mcq/$testId"
                  params={{ testId: t.id }}
                  search={{ review: false }}
                  className={`group flex items-center gap-4 rounded-3xl ${GRADIENTS[i % GRADIENTS.length]} p-5 shadow-soft active:scale-[0.99] transition-transform`}
                >
                  <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {(t.subject || t.topic) && (
                      <div className="text-xs uppercase tracking-wide text-foreground/60">
                        {[t.subject, t.topic].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="mt-0.5 text-lg font-bold text-foreground truncate">
                      {t.name}
                    </div>
                    <div className="mt-0.5 text-sm text-foreground/70">
                      {t.question_count} question{t.question_count === 1 ? "" : "s"}
                    </div>
                    {t.description && (
                      <div className="mt-1 text-sm text-foreground/60 line-clamp-2">
                        {t.description}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
