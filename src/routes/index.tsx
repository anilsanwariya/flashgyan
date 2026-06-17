import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDecks, type DeckSummary } from "@/lib/flashcards.functions";
import { Button } from "@/components/ui/button";
import { ChevronRight, Layers, Settings } from "lucide-react";
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
      { title: "Flashly — Pick a deck" },
      { name: "description", content: "Browse flashcard decks by subject and topic and start a focused practice session." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQO),
  component: Home,
});

function encodeDeckId(d: { subject: string; topic: string }) {
  return btoa(unescape(encodeURIComponent(`${d.subject}|||${d.topic}`)));
}

function Home() {
  const { data: decks } = useSuspenseQuery(decksQO);
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
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-10 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" />
          Flashly
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          Pick a deck. Practice.
        </h1>
        <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
          Filter by subject and topic, then flip through cards and rate your recall.
        </p>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-32 space-y-6">
        <section className="space-y-3">
          <FilterRow
            label="Subject"
            options={subjects}
            value={subject}
            onChange={(v) => {
              setSubject(v);
              setTopic(null);
            }}
          />
          {subject && (
            <FilterRow
              label="Topic"
              options={topics}
              value={topic}
              onChange={setTopic}
            />
          )}
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

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {label}
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(active ? null : opt)}
              className={
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors " +
                (active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-foreground hover:bg-accent")
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
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
