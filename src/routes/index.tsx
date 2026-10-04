import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getHomeData, type HomeData } from "@/lib/home.functions";
import { getRandomFlashcards, type Flashcard } from "@/lib/flashcards.functions";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  Brain,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Layers,
  ListChecks,
  Lock,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import finalLogo from "@/assets/final-logo.png";
import tgIcon from "@/assets/tg-icon.svg";
import { useDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
<script src="https://telegram.org/js/telegram-web-app.js"></script>;

const homeQO = queryOptions({ queryKey: ["homeData"], queryFn: () => getHomeData() });
const demoCardsQO = queryOptions({
  queryKey: ["homepage-demo-cards"],
  queryFn: () => getRandomFlashcards(),
  staleTime: Number.POSITIVE_INFINITY,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        name: "description",
        content:
          "FlashGyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go.",
      },
      { property: "og:title", content: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        property: "og:description",
        content:
          "Learn faster with active recall, spaced repetition, exam-focused flashcards, and MCQ practice in English and Hindi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homeQO),
      context.queryClient.ensureQueryData(demoCardsQO),
    ]),
  component: Home,
});

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Home() {
  const { data: home } = useSuspenseQuery(homeQO);
  const { data: demoCards } = useSuspenseQuery(demoCardsQO);
  const displayName = useDisplayName();
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));

  useEffect(() => {
    const t = setInterval(() => setGreeting(greetingFor(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-dvh bg-background relative selection:bg-primary/20">
      {/* GLASSMORPHIC HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" aria-label="Go to Home">
            <img src={finalLogo} alt="Flashgyan" className="h-10 w-auto object-contain drop-shadow-sm" />
          </Link>
          <img
            src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images/RASbandhu-logo-green.png"
            alt="RASbandhu"
            className="h-10 w-auto object-contain drop-shadow-sm"
          />
        </div>
      </header>

      <main className="px-5 max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto pb-12 space-y-7 pt-6">
        {/* Top section: stacked on mobile/tablet, 2-column split on desktop */}
        <div className="space-y-7 lg:grid lg:grid-cols-[2fr_1fr] lg:gap-12 lg:items-center lg:space-y-0">
          {/* Left column (desktop): greeting + description */}
          <div className="text-center space-y-1.5 animate-in fade-in slide-in-from-bottom-3 duration-700 lg:text-left lg:col-start-1 lg:row-start-1">
            <h1 className="text-2xl font-bold tracking-tight text-[#910000] drop-shadow-sm">
              {greeting}
              {displayName ? `, ${displayName}` : ""}!
            </h1>
            <p className="text-foreground/80 font-medium text-[15px] leading-relaxed max-w-md mx-auto lg:mx-0">
              Welcome to Flashgyan. Let's make your exam preparation smarter and faster today.
            </p>
          </div>

          {/* Right column (desktop): banner spans the full left column height */}
          <div className="w-full md:max-w-2xl md:mx-auto lg:max-w-none lg:col-start-2 lg:row-start-1 lg:row-span-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both">
            <BannerCarousel banners={home.banners} />
          </div>

          {/* Left column (desktop): app store badges */}
          <div className="flex justify-center gap-4 items-center w-full max-w-sm mx-auto lg:mx-0 lg:justify-start animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both lg:col-start-1 lg:row-start-2">
            {!home.settings.hide_app_store && (
              <button
                onClick={() => toast.info("iOS app is coming soon!")}
                className="transition-all hover:scale-105 hover:-translate-y-1 active:scale-95 block drop-shadow-md"
                aria-label="Download on the App Store (Coming Soon)"
              >
                <img
                  src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg"
                  alt="Download on the App Store"
                  className="h-[48px] w-auto object-contain"
                />
              </button>
            )}

            {!home.settings.hide_google_play && (
              <a
                href="https://play.google.com/store/apps/details?id=com.flashgyan"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-all hover:scale-105 hover:-translate-y-1 active:scale-95 block drop-shadow-md"
                aria-label="Get it on Google Play"
              >
                <img
                  src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images/GetItOnGooglePlay_Badge_Web_color_English.svg"
                  alt="Get it on Google Play"
                  className="h-[48px] w-auto object-contain"
                />
              </a>
            )}
          </div>

          {/* Left column (desktop): CTA + caption */}
          <div className="animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200 fill-mode-both lg:col-start-1 lg:row-start-3">
            {home.settings.cta_url.trim() && home.settings.cta_label.trim() && (
              <ExternalCtaButton
                label={home.settings.cta_label}
                subtitle={home.settings.cta_subtitle}
                url={home.settings.cta_url}
                locked={home.settings.lock_cta}
              />
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById("why-flashgyan")?.scrollIntoView({ behavior: "smooth" })}
              className={`w-full bg-background/60 backdrop-blur-sm ${
                home.settings.cta_url.trim() && home.settings.cta_label.trim() ? "mt-3" : ""
              }`}
            >
              Why FlashGyan?
              <ArrowDown aria-hidden="true" />
            </Button>

            {home.settings.cta_caption.trim() && (
              <p className="mt-3 mb-2 text-center lg:text-left text-[#910000] font-medium text-[14px] opacity-90">
                {home.settings.cta_caption}
              </p>
            )}
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
          <FeaturePicker settings={home.settings} />
        </div>

        <WhyFlashGyan cards={demoCards} />
      </main>

      <footer className="border-t border-border/50 bg-background/40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col items-center justify-center text-center gap-4 text-xs text-muted-foreground">
          <p className="uppercase tracking-widest font-semibold opacity-70">
            <span className="block">© 2026 FLASHGYAN EDTECH LLP.</span>
            <span className="block mt-1">ALL RIGHTS RESERVED.</span>
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-medium">
            <Link to="/privacy-policy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:flashgyanedtech@gmail.com" className="hover:text-primary transition-colors">
              Contact Support
            </a>
          </nav>
        </div>
      </footer>
      <TelegramFloatingButton />
    </div>
  );
}

type LandingLanguage = "en" | "hi";

const whyContent = {
  en: {
    eyebrow: "WHY FLASHGYAN?",
    scienceTitle: "The Science of Learning",
    worksTitle: "How FlashGyan Works",
    demoLabel: "5 CARD DEMO",
    scienceCards: [
      {
        title: "Power of Active Recall",
        description:
          "Stop passively reading PDFs. FlashGyan forces your brain to actively retrieve information, which is scientifically proven to build stronger neural pathways and lock in facts faster.",
      },
      {
        title: "Smart Spaced Repetition",
        description:
          "Our algorithm tracks what you know and what you forget. Hard questions reappear right before you are about to forget them, maximizing retention while minimizing study time.",
      },
      {
        title: "Laser-Focused for Exams",
        description:
          "Built specifically for state competitive exams. Master complex Hindi vocabulary, dates, and polity articles with decks tailored for RAS, REET, PSI, and Patwari.",
      },
    ],
    steps: [
      {
        title: "Test Yourself",
        description: "Read the prompt and try to recall the exact answer from memory before flipping.",
      },
      {
        title: "Flip & Review",
        description: "Tap the card to reveal the answer. Compare your mental response with the exact fact.",
      },
      {
        title: "Swipe & Master",
        description:
          "Rate how hard it was to remember. FlashGyan uses this rating to schedule the card's next appearance.",
      },
    ],
    mock: {
      progress: "of",
      reveal: "Reveal Answer",
      answerLabel: "ANSWER",
      hard: "Hard",
      medium: "Medium",
      easy: "Easy",
      completed: "Demo complete",
      completedDescription: "You rated all five cards.",
      noCards: "No flashcards are available yet.",
      loading: "Loading flashcards…",
    },
  },
  hi: {
    eyebrow: "FLASHGYAN क्यों?",
    scienceTitle: "सीखने का विज्ञान",
    worksTitle: "FlashGyan कैसे काम करता है",
    demoLabel: "5 कार्ड डेमो",
    scienceCards: [
      {
        title: "सक्रिय स्मरण (Active Recall)",
        description:
          "पीडीएफ को निष्क्रिय रूप से पढ़ना बंद करें। फ्लैशज्ञान आपके मस्तिष्क को सक्रिय रूप से जानकारी याद करने के लिए मजबूर करता है, जिससे चीजें तेजी से और लंबे समय तक याद रहती हैं।",
      },
      {
        title: "स्मार्ट स्पेस रिपीटीशन",
        description:
          "हमारा एल्गोरिदम ट्रैक करता है कि आप क्या जानते हैं और क्या भूल रहे हैं। कठिन प्रश्न आपके भूलने से ठीक पहले दोबारा दिखाई देते हैं, जिससे कम समय में बेहतरीन तैयारी होती है।",
      },
      {
        title: "परीक्षाओं के लिए सटीक",
        description:
          "राज्य स्तरीय प्रतियोगी परीक्षाओं के लिए विशेष रूप से निर्मित। RAS, REET, PSI और पटवारी के लिए तैयार किए गए डेक के साथ जटिल शब्दावली, तिथियों और राजनीति के अनुच्छेदों में महारत हासिल करें।",
      },
    ],
    steps: [
      {
        title: "खुद का परीक्षण करें",
        description: "प्रश्न पढ़ें और कार्ड पलटने से पहले उत्तर को याद करने का प्रयास करें।",
      },
      {
        title: "पलटें और जांचें",
        description: "उत्तर देखने के लिए कार्ड पर टैप करें। अपने सोचे गए उत्तर की सही तथ्य से तुलना करें।",
      },
      {
        title: "स्वाइप करें और मास्टर बनें",
        description:
          "कार्ड को रेटिंग दें कि इसे याद करना कितना कठिन था। फ्लैशज्ञान इसी आधार पर कार्ड को अगली बार दिखाएगा।",
      },
    ],
    mock: {
      progress: "में से",
      reveal: "उत्तर देखें",
      answerLabel: "उत्तर",
      hard: "कठिन",
      medium: "मध्यम",
      easy: "आसान",
      completed: "डेमो पूरा हुआ",
      completedDescription: "आपने सभी पाँच कार्डों को रेट किया।",
      noCards: "अभी कोई फ्लैशकार्ड उपलब्ध नहीं है।",
      loading: "फ्लैशकार्ड लोड हो रहे हैं…",
    },
  },
} as const;

const scienceIcons = [Brain, RotateCcw, GraduationCap] as const;
const scienceStyles = ["grad-pink", "grad-lavender", "grad-mint"] as const;

function WhyFlashGyan({ cards }: { cards: Flashcard[] }) {
  const [lang, setLang] = useState<LandingLanguage>("en");
  const content = whyContent[lang];

  return (
    <section
      id="why-flashgyan"
      lang={lang === "hi" ? "hi" : "en"}
      className="scroll-mt-28 border-t border-border/60 pt-10 md:pt-14"
      aria-labelledby="why-flashgyan-title"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-primary">{content.eyebrow}</p>
          <h2 id="why-flashgyan-title" className="mt-2 text-3xl font-bold text-foreground md:text-4xl">
            {content.scienceTitle}
          </h2>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border bg-card/80 p-1 shadow-sm backdrop-blur-xl" aria-label="Language">
          {(["en", "hi"] as const).map((language) => (
            <Button
              key={language}
              type="button"
              variant={lang === language ? "default" : "ghost"}
              size="sm"
              aria-pressed={lang === language}
              onClick={() => setLang(language)}
              className="min-w-12 border-b-0 hover:border-b-0 active:translate-y-0"
            >
              {language.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {content.scienceCards.map((card, index) => {
          const Icon = scienceIcons[index];
          return (
            <article
              key={card.title}
              className={`group rounded-3xl border border-border/50 p-6 shadow-soft transition-transform duration-300 motion-safe:hover:-translate-y-1 ${scienceStyles[index]}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-card/80 bg-card/70 shadow-sm backdrop-blur-sm">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-xl font-bold text-foreground">{card.title}</h3>
              <p className="mt-3 text-sm font-medium leading-6 text-foreground/75">{card.description}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-12 md:mt-16">
        <p className="text-xs font-bold uppercase text-primary">{content.demoLabel}</p>
        <h2 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">{content.worksTitle}</h2>

        <FlashcardDemo cards={cards} content={content.mock} />
      </div>
    </section>
  );
}

type DemoRating = "hard" | "medium" | "easy";

function FlashcardDemo({
  cards,
  content,
}: {
  cards: Flashcard[];
  content: (typeof whyContent)[LandingLanguage]["mock"];
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<DemoRating[]>([]);
  const [mounted, setMounted] = useState(false);
  const completed = cards.length > 0 && ratings.length === cards.length;
  const card = cards[index];

  useEffect(() => setMounted(true), []);

  const rate = (rating: DemoRating) => {
    const nextRatings = [...ratings, rating];
    setRatings(nextRatings);
    if (index < cards.length - 1) {
      setTimeout(() => {
        setIndex((current) => current + 1);
        setFlipped(false);
      }, 300);
    }
  };

  if (!mounted) {
    return (
      <div className="mx-auto mt-7 flex h-[28rem] max-w-2xl items-center justify-center rounded-3xl border border-border/40 bg-card/70 font-medium text-muted-foreground shadow-soft backdrop-blur-3xl sm:h-[30rem]">
        {content.loading}
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto mt-7 max-w-2xl rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center font-medium text-muted-foreground">
        {content.noCards}
      </div>
    );
  }

  if (completed) {
    const counts = {
      hard: ratings.filter((rating) => rating === "hard").length,
      medium: ratings.filter((rating) => rating === "medium").length,
      easy: ratings.filter((rating) => rating === "easy").length,
    };
    return (
      <div className="mx-auto mt-7 max-w-2xl rounded-3xl border border-border/70 bg-card/65 p-6 text-center shadow-soft backdrop-blur-xl md:p-8">
        <h3 className="text-2xl font-bold text-foreground">{content.completed}</h3>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{content.completedDescription}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <DemoScore label={content.hard} count={counts.hard} tone="destructive" />
          <DemoScore label={content.medium} count={counts.medium} tone="warning" />
          <DemoScore label={content.easy} count={counts.easy} tone="success" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-7 max-w-2xl">
      <div className="mb-3 flex items-center justify-between px-1 text-xs font-bold text-muted-foreground">
        <span>{card.subject} · {card.topic}</span>
        <span>{index + 1} {content.progress} {cards.length}</span>
      </div>
      <div className="relative h-[28rem] w-full [perspective:1200px] sm:h-[30rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="relative h-full w-full"
          >
            <motion.div
              initial={false}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
              className="relative h-full w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div
                className="absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/70 shadow-soft backdrop-blur-3xl"
                style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "translateZ(1px)" }}
              >
                <ScrollArea className="h-full flex-1">
                  <div className="flex min-h-full flex-col justify-center p-7 md:p-9">
                    <p className="text-center text-[11px] font-bold uppercase text-primary">{card.prompt}</p>
                    <p className="mt-7 text-center text-xl font-semibold leading-snug text-foreground md:text-2xl">{card.question}</p>
                    {card.image_url && <img src={card.image_url} alt="" className="mt-6 aspect-[2/1] w-full rounded-2xl border border-border/30 object-cover" />}
                  </div>
                </ScrollArea>
              </div>
              <div
                className="absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-3xl border border-primary/25 bg-card/75 shadow-soft backdrop-blur-3xl"
                style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg) translateZ(1px)" }}
              >
                <ScrollArea className="h-full flex-1">
                  <div className="p-7 md:p-9">
                    <p className="text-[11px] font-bold uppercase text-primary">{card.prompt}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">{card.question}</p>
                    <div className="my-6 border-t border-border/30" />
                    <p className="text-[11px] font-bold uppercase text-success">{content.answerLabel}</p>
                    <p className="mt-2 text-xl font-semibold leading-snug text-foreground md:text-2xl">{card.answer}</p>
                    {card.image_url && <img src={card.image_url} alt="" className="mt-6 aspect-[2/1] w-full rounded-2xl border border-border/30 object-cover" />}
                    {card.sections.map((section, sectionIndex) => (
                      <div key={`${section.title}-${sectionIndex}`} className="mt-6 border-t border-border/30 pt-6">
                        <p className="text-[11px] font-bold uppercase text-primary">{section.title}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-foreground/75">{section.body}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4">
        {flipped ? (
          <div className="grid grid-cols-3 gap-3">
            <DemoRatingButton label={content.hard} tone="destructive" onClick={() => rate("hard")} />
            <DemoRatingButton label={content.medium} tone="warning" onClick={() => rate("medium")} />
            <DemoRatingButton label={content.easy} tone="success" onClick={() => rate("easy")} />
          </div>
        ) : (
          <Button type="button" onClick={() => setFlipped(true)} className="h-14 w-full rounded-2xl text-base">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {content.reveal}
          </Button>
        )}
      </div>
    </div>
  );
}

type DemoTone = "destructive" | "warning" | "success";

function DemoRatingButton({ label, tone, onClick }: { label: string; tone: DemoTone; onClick: () => void }) {
  const classes = tone === "destructive"
    ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
    : tone === "warning"
      ? "border-warning/30 bg-warning/15 text-warning hover:bg-warning/25"
      : "border-success/30 bg-success/10 text-success hover:bg-success/20";
  return <Button type="button" variant="outline" onClick={onClick} className={`h-13 rounded-2xl ${classes}`}>{label}</Button>;
}

function DemoScore({ label, count, tone }: { label: string; count: number; tone: DemoTone }) {
  const classes = tone === "destructive"
    ? "bg-destructive/10 text-destructive"
    : tone === "warning"
      ? "bg-warning/15 text-warning"
      : "bg-success/10 text-success";
  return <div className={`rounded-2xl px-3 py-4 ${classes}`}><strong className="block text-2xl">{count}</strong><span className="text-xs font-bold">{label}</span></div>;
}

function BannerCarousel({ banners }: { banners: HomeData["banners"] }) {
  const [idx, setIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Touch & Swipe states
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const len = banners.length;
  const minSwipeDistance = 50;

  // Auto-rotate logic
  useEffect(() => {
    if (len <= 1 || isPaused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % len), 4500);
    return () => clearInterval(t);
  }, [len, isPaused]);

  // Pause rotation for 5 seconds upon user interaction
  const handleInteraction = () => {
    setIsPaused(true);
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => setIsPaused(false), 5000);
  };

  // --- SWIPE HANDLERS ---
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    handleInteraction();
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) setIdx((i) => (i + 1) % len);
    if (isRightSwipe) setIdx((i) => (i - 1 + len) % len);

    setTouchStart(null);
    setTouchEnd(null);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setTouchEnd(null);
    setTouchStart(e.clientX);
    handleInteraction();
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (touchStart !== null) setTouchEnd(e.clientX);
  };

  const onMouseUp = () => {
    if (touchStart !== null && touchEnd !== null) {
      const distance = touchStart - touchEnd;
      if (distance > minSwipeDistance) setIdx((i) => (i + 1) % len);
      if (distance < -minSwipeDistance) setIdx((i) => (i - 1 + len) % len);
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  if (len === 0) return null;

  return (
    <section
      className="relative w-full cursor-grab active:cursor-grabbing"
      aria-label="Featured banners"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="relative w-full overflow-hidden rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] bg-muted border border-border/50 aspect-[2/1]">
        <div
          className="flex h-full transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {banners.map((b) => (
            <img
              key={b.id}
              src={b.url}
              alt=""
              className="w-full h-full object-cover lg:object-contain shrink-0 select-none"
              draggable={false}
            />
          ))}
        </div>


        {/* Pagination Dots (Inside the image track) */}
        {len > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Show banner ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                  handleInteraction();
                }}
                className={`h-2 rounded-full transition-all duration-300 shadow-sm ${
                  i === idx ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturePicker({ settings }: { settings: HomeData["settings"] }) {
  const navigate = useNavigate();
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <FeatureCard
        title="Flashcards"
        subtitle="Flip cards and rate recall."
        icon={<Layers className="h-6 w-6 text-pink-600" />}
        gradient="bg-gradient-to-br from-pink-100 to-pink-50 border-pink-200"
        locked={settings.lock_flashcards}
        onClick={() => navigate({ to: "/flashcards" })}
      />
      <FeatureCard
        title="MCQ Practice"
        subtitle="Q&A with instant feedback."
        icon={<Target className="h-6 w-6 text-emerald-600" />}
        gradient="bg-gradient-to-br from-emerald-100 to-emerald-50 border-emerald-200"
        locked={settings.lock_mcq_practice}
        onClick={() => navigate({ to: "/mcq-practice" })}
      />
      <FeatureCard
        title="MCQ Tests"
        subtitle="Timed multiple choice tests."
        icon={<ListChecks className="h-6 w-6 text-violet-600" />}
        gradient="bg-gradient-to-br from-violet-100 to-violet-50 border-violet-200"
        locked={settings.lock_mcq}
        onClick={() => navigate({ to: "/mcq-tests" })}
      />
      <FeatureCard
        title="SAATHI"
        subtitle="Ask the AI study assistant."
        icon={<Sparkles className="h-6 w-6 text-amber-600" />}
        gradient="bg-gradient-to-br from-amber-100 to-amber-50 border-amber-200"
        locked={settings.lock_saathi}
        onClick={() => navigate({ to: "/saathi" })}
      />
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
      toast.info(`${label} is coming soon!`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      onClick={handle}
      aria-disabled={locked}
      className={`w-full rounded-2xl bg-primary px-6 py-4 text-left text-primary-foreground transition-all duration-150 border-b-[6px] border-primary/80 hover:-translate-y-1 hover:border-b-[8px] active:translate-y-[6px] active:border-b-0 shadow-sm ${
        locked ? "opacity-80 cursor-not-allowed" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 shadow-inner">
          {locked ? <Lock className="h-6 w-6" /> : <ExternalLink className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold tracking-tight drop-shadow-sm">{label}</div>
          {subtitle && <div className="mt-0.5 truncate text-sm font-medium text-primary-foreground/80">{subtitle}</div>}
        </div>
        {!locked && <ChevronRight className="h-6 w-6 shrink-0 text-primary-foreground/90" />}
      </div>
    </button>
  );
}

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
      toast.info(`${title} is coming soon!`);
      return;
    }
    onClick();
  };
  return (
    <button
      onClick={handle}
      aria-disabled={locked}
      className={`group w-full text-left flex items-center gap-4 rounded-[28px] border-[1.5px] p-5 transition-all duration-200 shadow-[0_8px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.08)] hover:-translate-y-1 active:translate-y-0.5 active:shadow-sm relative overflow-hidden ${gradient} ${
        locked ? "opacity-80 cursor-not-allowed" : ""
      }`}
    >
      <div className="relative h-14 w-14 rounded-2xl bg-white/60 backdrop-blur-md border border-white flex items-center justify-center shrink-0 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)] z-10">
        {icon}
      </div>

      <div className="min-w-0 flex-1 z-10">
        <div className="text-[17px] font-bold text-foreground/90 tracking-tight drop-shadow-sm">{title}</div>
        <div className="mt-0.5 text-[14px] font-medium text-foreground/70">{subtitle}</div>
      </div>

      {locked ? (
        <Lock className="h-5 w-5 text-foreground/40 shrink-0 z-10" aria-label="Locked" />
      ) : (
        <ChevronRight className="h-6 w-6 text-foreground/40 shrink-0 group-hover:translate-x-1 group-hover:text-foreground/70 transition-all z-10" />
      )}

      <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/40 blur-3xl rounded-full pointer-events-none" />
    </button>
  );
}

function TelegramFloatingButton() {
  return (
    <div
      className="fixed right-6 bottom-6 z-50 pointer-events-none"
      style={{ animation: "float-bob 3s ease-in-out infinite" }}
    >
      {/* The style block injects the keyframes safely into React. 
        It floats the wrapper, keeping the button's native hover effects perfectly intact.
      */}
      <style>{`
        @keyframes float-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
      <a
        href="https://t.me/RASbandhu"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Join Telegram"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#229ed9]/30 backdrop-blur-xl border border-[#229ed9]/40 shadow-[0_8px_32px_rgba(34,158,217,0.25)] transition-all hover:scale-110 hover:bg-[#229ed9]/40 active:scale-95 overflow-hidden pointer-events-auto"
      >
        <img src={tgIcon} alt="Telegram" className="h-8 w-8 object-contain drop-shadow-md" />
      </a>
    </div>
  );
}
