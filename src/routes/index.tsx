import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDecks, type DeckSummary } from "@/lib/flashcards.functions";
import { listMcqTests, type McqTestSummary } from "@/lib/mcq.functions";
import { listMcqPracticeTests, type McqPracticeTestSummary } from "@/lib/mcq-practice.functions";
import { getHomeData, type HomeData } from "@/lib/home.functions";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  ListChecks,
  Lock,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import finalLogo from "@/assets/final-logo.png.asset.json";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M21.4 4.96c-.2-.74-.82-1.3-1.57-1.43C18.6 3.23 6.3 6.69 4.04 7.34c-.63.18-1.15.66-1.34 1.3-.5 1.58.5 2.45 1.96 3.05l.02.01 3.58 1.25.02.01c.43.15.9.09 1.28-.16.77-.51 3.25-2.19 5.47-3.74.32-.23.75-.16.98.15.23.32.16.75-.15.98-2.18 1.52-4.65 3.19-5.42 3.71-.57.38-.97.97-1.08 1.63l-.69 4.13-.02.11c-.13.78.65 1.35 1.31.99l7.05-3.95.02-.01c1.36-.78 2.62-1.52 3.63-2.12 1.41-.86 2.52-1.56 2.52-2.81 0-.45-.15-1.05-.44-1.95z" />
    </svg>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const decksQO = queryOptions({ queryKey: ["decks"], queryFn: () => listDecks() });
const mcqQO = queryOptions({ queryKey: ["mcqTests"], queryFn: () => listMcqTests() });
const mcqPracticeQO = queryOptions({
  queryKey: ["mcqPracticeTests"],
  queryFn: () => listMcqPracticeTests(),
});
const homeQO = queryOptions({ queryKey: ["homeData"], queryFn: () => getHomeData() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flashgyan web — Pick a feature" },
      {
        name: "description",
        content: "Choose a study feature: flashcards, MCQ practice or timed MCQ tests.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(decksQO),
      context.queryClient.ensureQueryData(mcqQO),
      context.queryClient.ensureQueryData(mcqPracticeQO),
      context.queryClient.ensureQueryData(homeQO),
    ]),
  component: Home,
});

type View = "home" | "flashcards" | "mcqs" | "mcqPractice";

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Home() {
  const { data: decks } = useSuspenseQuery(decksQO);
  const { data: tests } = useSuspenseQuery(mcqQO);
  const { data: practiceTests } = useSuspenseQuery(mcqPracticeQO);
  const { data: home } = useSuspenseQuery(homeQO);
  const [view, setView] = useState<View>("home");
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));

  useEffect(() => {
    const t = setInterval(() => setGreeting(greetingFor(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  const headings: Record<Exclude<View, "home">, { title: string; sub: string }> = {
    flashcards: {
      title: "Flashcards",
      sub: "Filter by subject and topic, then flip through cards and rate your recall.",
    },
    mcqs: {
      title: "MCQ Tests",
      sub: "Pick a test, answer the questions before time runs out, and review your score.",
    },
    mcqPractice: {
      title: "MCQ Practice",
      sub: "Untimed practice. Tap an option, see what's right, and read the explanation.",
    },
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-16 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center">
          <img src={finalLogo.url} alt="Flashgyan" className="h-9 w-auto object-contain" />
        </div>

        {view === "home" ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{greeting}.</h1>
            <p className="mt-2 text-left text-foreground font-semibold text-[15px] leading-relaxed">
              "Welcome to FlashGyan! Let's make your exam preparation smarter and faster."
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
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{headings[view].title}</h1>
            <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">{headings[view].sub}</p>
          </>
        )}
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6">
        {view === "home" && (
          <>
            <BannerCarousel banners={home.banners} />
            {home.settings.cta_url.trim() && home.settings.cta_label.trim() && (
              <>
                <ExternalCtaButton
                  label={home.settings.cta_label}
                  subtitle={home.settings.cta_subtitle}
                  url={home.settings.cta_url}
                  locked={home.settings.lock_cta}
                />
                {home.settings.cta_caption.trim() && (
                  <p className="-mt-2 text-center text-muted-foreground text-[15px] leading-relaxed">
                    {home.settings.cta_caption}
                  </p>
                )}
              </>
            )}
            <FeaturePicker
              settings={home.settings}
              onOpenFlashcards={() => setView("flashcards")}
              onOpenMcqs={() => setView("mcqs")}
              onOpenMcqPractice={() => setView("mcqPractice")}
            />
          </>
        )}
        {view === "flashcards" && <FlashcardsSection decks={decks} />}
        {view === "mcqs" && <McqSection tests={tests} />}
        {view === "mcqPractice" && <McqPracticeSection tests={practiceTests} />}
      </main>

      <footer className="border-t border-border bg-background/60">
        <div className="max-w-2xl mx-auto px-5 py-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <p className="uppercase tracking-wide font-medium">© 2026 FLASHGYAN EDTECH LLP. ALL RIGHTS RESERVED.</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/privacy-policy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <a href="mailto:flashgyanedtech@gmail.com" className="hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </footer>
      {view === "home" && <TelegramFloatingButton />}
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
          <img key={b.id} src={b.url} alt="" className="w-full h-full object-cover shrink-0" draggable={false} />
        ))}
      </div>
      {len > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => setIdx((i) => (i - 1 + len) % len)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-white drop-shadow-md flex items-center justify-center hover:text-white/80 active:scale-95 transition"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => setIdx((i) => (i + 1) % len)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white drop-shadow-md flex items-center justify-center hover:text-white/80 active:scale-95 transition"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Show banner ${i + 1}`}
                onClick={() => setIdx(i)}
                className={"h-1.5 rounded-full transition-all " + (i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60")}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FeaturePicker({
  settings,
  onOpenFlashcards,
  onOpenMcqs,
  onOpenMcqPractice,
}: {
  settings: HomeData["settings"];
  onOpenFlashcards: () => void;
  onOpenMcqs: () => void;
  onOpenMcqPractice: () => void;
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
        title="MCQ Practice"
        subtitle="Untimed Q&A with instant feedback."
        icon={<Target className="h-5 w-5" />}
        gradient="grad-mint"
        locked={settings.lock_mcq_practice}
        onClick={onOpenMcqPractice}
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
    </section>
  );
}

function ExternalCtaButton({
  label,
  subtitle,
  url,
  locked,
}: {
  label: string;
  subtitle: string;
  url: string;
  locked: boolean;
}) {
  const handle = () => {
    if (locked) {
      toast.info(`${label} is locked.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      onClick={handle}
      aria-disabled={locked}
      className={`w-full rounded-2xl bg-primary px-5 py-4 text-left text-primary-foreground shadow-soft transition-colors hover:bg-primary/90 active:scale-[0.99] ${
        locked ? "opacity-80 cursor-not-allowed" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/20">
          {locked ? <Lock className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold tracking-tight">{label}</div>
          {subtitle && <div className="mt-0.5 truncate text-sm text-primary-foreground/80">{subtitle}</div>}
        </div>
        {!locked && <ChevronRight className="h-5 w-5 shrink-0 text-primary-foreground/90" />}
      </div>
    </button>
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
                {t.description && <div className="mt-1 text-sm text-foreground/60 line-clamp-2">{t.description}</div>}
              </div>
              <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function McqPracticeSection({ tests }: { tests: McqPracticeTestSummary[] }) {
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
                    <div className="mt-0.5 text-lg font-bold text-foreground truncate">{t.name}</div>
                    <div className="mt-0.5 text-sm text-foreground/70">
                      {t.question_count} question{t.question_count === 1 ? "" : "s"}
                    </div>
                    {t.description && (
                      <div className="mt-1 text-sm text-foreground/60 line-clamp-2">{t.description}</div>
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
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)} disabled={disabled}>
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
          {deck.description && <div className="mt-1 text-sm text-foreground/70 line-clamp-2">{deck.description}</div>}
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

function TelegramFloatingButton() {
  return (
    <a
      href="https://t.me/RASbandhu"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Telegram"
      className="fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform hover:scale-105 active:scale-95"
    >
      <TelegramIcon className="h-7 w-7" />
    </a>
  );
}
