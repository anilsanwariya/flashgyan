import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDecks, type DeckSummary } from "@/lib/flashcards.functions";
import { listMcqTests, type McqTestSummary } from "@/lib/mcq.functions";
import { getHomeData, type HomeData } from "@/lib/home.functions";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  ListChecks,
  Lock,
  Settings,
  Sparkles,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
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
const homeQO = queryOptions({ queryKey: ["homeData"], queryFn: () => getHomeData() });

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
      context.queryClient.ensureQueryData(homeQO),
    ]),
  component: Home,
});

type View = "home" | "flashcards" | "mcqs";

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function Home() {
  const { data: decks } = useSuspenseQuery(decksQO);
  const { data: tests } = useSuspenseQuery(mcqQO);
  const { data: home } = useSuspenseQuery(homeQO);
  const [view, setView] = useState<View>("home");
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));

  useEffect(() => {
    const t = setInterval(() => setGreeting(greetingFor(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-10 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <img src={logoAsset.url} alt="Flashgyan web logo" className="h-5 w-5 rounded-sm" />
          Flashgyan web
        </div>

        {view === "home" ? (
          <>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{greeting}.</h1>
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
          <>
            <BannerCarousel banners={home.banners} />
            <FeaturePicker
              settings={home.settings}
              onOpenFlashcards={() => setView("flashcards")}
              onOpenMcqs={() => setView("mcqs")}
            />
          </>
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

function BannerCarousel({ banners }: { banners: HomeData["banners"] }) {
  const [idx, setIdx] = useState(0);
  const len = banners.length;

  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % len), 4500);
    return () => clearInterval(t);
  }, [len]);

  if (len === 0) return null;

  return (
    <section
      className="relative w-full overflow-hidden rounded-3xl shadow-soft bg-muted"
      style={{ aspectRatio: "2 / 1" }}
      aria-label="Featured banners"
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {banners.map((b) => (
          <img
            key={b.id}
            src={b.url}
            alt=""
            className="w-full h-full object-cover shrink-0"
            draggable={false}
          />
        ))}
      </div>
      {len > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={`Show banner ${i + 1}`}
              onClick={() => setIdx(i)}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60")
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FeaturePicker({
  settings,
  onOpenFlashcards,
  onOpenMcqs,
}: {
  settings: HomeData["settings"];
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
        locked={settings.lock_flashcards}
        onClick={onOpenFlashcards}
      />
      <FeatureCard
        title="MCQ Tests"
        subtitle="Timed multiple choice tests."
        icon={<ListChecks className="h-5 w-5" />}
        gradient="grad-lavender"
        locked={settings.lock_mcq}
        onClick={onOpenMcqs}
      />
      <SaathiFeatureLink locked={settings.lock_saathi} />
      {settings.cta_url.trim() && settings.cta_label.trim() && (
        <ExternalCtaCard
          label={settings.cta_label}
          url={settings.cta_url}
          locked={settings.lock_cta}
        />
      )}
    </section>
  );
}

function ExternalCtaCard({
  label,
  url,
  locked,
}: {
  label: string;
  url: string;
  locked: boolean;
}) {
  return (
    <FeatureCard
      title={label}
      subtitle="Open external link"
      icon={<ExternalLink className="h-5 w-5" />}
      gradient="grad-mint"
      locked={locked}
      onClick={() => {
        if (locked) return;
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    />
  );
}

function SaathiFeatureLink({ locked }: { locked: boolean }) {
  const navigate = useNavigate();
  return (
    <FeatureCard
      title="SAATHI"
      subtitle="Ask the AI study assistant."
      icon={<Sparkles className="h-5 w-5" />}
      gradient="grad-peach"
      locked={locked}
      onClick={() => {
        if (locked) return;
        navigate({ to: "/saathi" });
      }}
    />
  );
}

const GRADIENTS = ["grad-pink", "grad-lavender", "grad-peach", "grad-mint"] as const;

function FeatureCard({
  title,
  subtitle,
  icon,
  gradient,
  locked = false,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  locked?: boolean;
  onClick: () => void;
}) {
  const handle = () => {
    if (locked) {
      toast.info(`${title} is locked.`);
      return;
    }
    onClick();
  };
  return (
    <button
      onClick={handle}
      aria-disabled={locked}
      className={`group w-full text-left flex items-center gap-4 rounded-3xl ${gradient} p-5 shadow-soft transition-transform ${
        locked ? "opacity-80 cursor-not-allowed" : "active:scale-[0.99]"
      }`}
    >
      <div className="h-12 w-12 rounded-full bg-white/70 text-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-foreground">{title}</div>
        <div className="mt-0.5 text-sm text-foreground/70">{subtitle}</div>
      </div>
      {locked ? (
        <Lock className="h-5 w-5 text-foreground/70 shrink-0" aria-label="Locked" />
      ) : (
        <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      )}
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

// Re-export for unused-import safety (BannerCarousel internal use only)
export { BannerCarousel };
