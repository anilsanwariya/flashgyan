import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDecks, type DeckSummary } from "@/lib/flashcards.functions";
import { ArrowLeft, ChevronRight, Layers, ListChecks, Settings } from "lucide-react";
import logoAsset from "@/assets/flashgyan-logo.png.asset.json";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const decksQO = queryOptions({
  queryKey: ["decks"],
  queryFn: () => listDecks(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flashgyan web — Pick a feature" },
      { name: "description", content: "Choose a study feature: flashcards or multiple choice questions." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQO),
  component: Home,
});

function encodeDeckId(d: { subject: string; topic: string }) {
  return btoa(unescape(encodeURIComponent(`${d.subject}|||${d.topic}`)));
}

type View = "home" | "flashcards";

function Home() {
  const { data: decks } = useSuspenseQuery(decksQO);
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
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              Pick a feature.
            </h1>
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
              Flashcards
            </h1>
            <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
              Filter by subject and topic, then flip through cards and rate your recall.
            </p>
          </>
        )}
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-32 space-y-6">
        {view === "home" ? (
          <FeaturePicker onOpenFlashcards={() => setView("flashcards")} />
        ) : (
          <FlashcardsSection decks={decks} />
        )}
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

function FeaturePicker({ onOpenFlashcards }: { onOpenFlashcards: () => void }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        onClick={onOpenFlashcards}
        className="group text-left flex items-center gap-4 rounded-2xl bg-card border border-border p-4 active:scale-[0.99] transition-transform shadow-sm"
      >
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">Flashcards</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Flip cards and rate recall.
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <div
        aria-disabled="true"
        className="flex items-center gap-4 rounded-2xl bg-card border border-border p-4 shadow-sm opacity-60 cursor-not-allowed"
      >
        <div className="h-10 w-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold truncate">MCQs</div>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              Coming soon
            </span>
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            Multiple choice questions.
          </div>
        </div>
      </div>
    </section>
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
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {filtered.map((d) => (
              <DeckCard key={`${d.subject}|${d.topic}`} deck={d} />
            ))}
          </ul>
        )}
      </section>
    </>
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

function DeckCard({ deck }: { deck: DeckSummary }) {
  const id = encodeDeckId(deck);
  return (
    <li>
      <Link
        to="/practice/$deckId"
        params={{ deckId: id }}
        search={{ review: false }}
        className="group flex items-center gap-4 rounded-2xl bg-card border border-border p-4 active:scale-[0.99] transition-transform shadow-sm"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {deck.subject}
          </div>
          <div className="mt-0.5 text-lg font-semibold truncate">{deck.topic}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {deck.count} card{deck.count === 1 ? "" : "s"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No decks yet. An admin can upload an Excel file from{" "}
        <Link to="/admin" className="text-primary font-medium">
          Admin
        </Link>
        .
      </p>
    </div>
  );
}
