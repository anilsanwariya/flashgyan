import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDecks, type DeckSummary } from "@/lib/flashcards.functions";
import { listMcqTests, type McqTestSummary } from "@/lib/mcq.functions";
import { ArrowLeft, ChevronRight, Layers, ListChecks, Settings, Sparkles, Timer } from "lucide-react";
import logoAsset from "@/assets/flashgyan-logo.png.asset.json";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const decksQO = queryOptions({ queryKey: ["decks"], queryFn: () => listDecks() });
const mcqQO = queryOptions({ queryKey: ["mcqTests"], queryFn: () => listMcqTests() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flashgyan web — Pick a feature" },
      {
        name: "description",
        content: "Choose a study feature: flashcards or multiple choice question tests.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(decksQO),
      context.queryClient.ensureQueryData(mcqQO),
    ]),
  component: Home,
});


type View = "home" | "flashcards" | "mcqs";

function Home() {
  const { data: decks } = useSuspenseQuery(decksQO);
  const { data: tests } = useSuspenseQuery(mcqQO);
  const [view, setView] = useState<View>("home");

  return (
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-10 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <img src={logoAsset.url} alt="Flashgyan web logo" className="h-5 w-5 rounded-sm" />
          Flashgyan web
        </div>

        {view === "home" ? (
          <>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Pick a feature.</h1>
            <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
              Choose how you want to study today.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => setView("home")}
              className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              {view === "flashcards" ? "Flashcards" : "MCQ Tests"}
            </h1>
            <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
              {view === "flashcards"
                ? "Filter by subject and topic, then flip through cards and rate your recall."
                : "Pick a test, answer the questions before time runs out, and review your score."}
            </p>
          </>
        )}
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-32 space-y-6">
        {view === "home" && (
          <FeaturePicker
            onOpenFlashcards={() => setView("flashcards")}
            onOpenMcqs={() => setView("mcqs")}
          />
        )}
        {view === "flashcards" && <FlashcardsSection decks={decks} />}
        {view === "mcqs" && <McqSection tests={tests} />}
      </main>

      <footer className="fixed bottom-0 inset-x-0 border-t border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="max-w-2xl mx-auto px-5 py-3 flex justify-end">
          <Link
            to="/admin"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" /> Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}

function FeaturePicker({
  onOpenFlashcards,
  onOpenMcqs,
}: {
  onOpenFlashcards: () => void;
  onOpenMcqs: () => void;
}) {
  return (
    <section className="space-y-3">
      <FeatureCard
        title="Flashcards"
        subtitle="Flip cards and rate recall."
        icon={<Layers className="h-5 w-5" />}
        gradient="grad-pink"
        onClick={onOpenFlashcards}
      />
      <FeatureCard
        title="MCQ Tests"
        subtitle="Timed multiple choice tests."
        icon={<ListChecks className="h-5 w-5" />}
        gradient="grad-lavender"
        onClick={onOpenMcqs}
      />
      <SaathiFeatureLink />
    </section>
  );
}

function SaathiFeatureLink() {
  return (
    <Link
      to="/saathi"
      className="group w-full text-left flex items-center gap-4 rounded-3xl grad-peach p-5 shadow-soft active:scale-[0.99] transition-transform"
    >
      <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-foreground">SAATHI</div>
        <div className="mt-0.5 text-sm text-foreground/70">
          Ask the AI study assistant.
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

const GRADIENTS = ["grad-pink", "grad-lavender", "grad-peach", "grad-mint"] as const;

function FeatureCard({
  title,
  subtitle,
  icon,
  gradient,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left flex items-center gap-4 rounded-3xl ${gradient} p-5 shadow-soft active:scale-[0.99] transition-transform`}
    >
      <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-foreground">{title}</div>
        <div className="mt-0.5 text-sm text-foreground/70">{subtitle}</div>
      </div>
      <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

function FlashcardsSection({ decks }: { decks: DeckSummary[] }) {
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
        (d) =>
          (!subject || d.subject === subject) && (!topic || d.topic === topic),
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

function McqSection({ tests }: { tests: McqTestSummary[] }) {
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

function FilterSelect({
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
            <div className="mt-1 text-sm text-foreground/70 line-clamp-2">
              {deck.description}
            </div>
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

function EmptyState({ what }: { what: string }) {
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
