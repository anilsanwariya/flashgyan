import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getHomeData, type HomeData } from "@/lib/home.functions";
import { ChevronRight, ExternalLink, Layers, ListChecks, Lock, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import finalLogo from "@/assets/final-logo.png";
import tgIcon from "@/assets/tg-icon.svg";
import { useDisplayName } from "@/hooks/use-auth";
<script src="https://telegram.org/js/telegram-web-app.js"></script>;

const homeQO = queryOptions({ queryKey: ["homeData"], queryFn: () => getHomeData() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        name: "description",
        content:
          "FlashGyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQO),
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
        <div className="space-y-7 lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center lg:space-y-0">
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
      <div className="relative w-full overflow-hidden rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] bg-muted border border-border/50 aspect-[2/1] lg:aspect-video">
        <div
          className="flex h-full transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {banners.map((b) => (
            <img
              key={b.id}
              src={b.url}
              alt=""
              className="w-full h-full object-cover shrink-0 select-none"
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
    <a
      href="https://t.me/RASbandhu"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Telegram"
      className="fixed right-6 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#229ed9] shadow-[0_8px_30px_rgba(42,171,238,0.4)] transition-all hover:scale-110 hover:-translate-y-1 active:scale-95 overflow-hidden border-0"
    >
      <img src={tgIcon} alt="Telegram" className="h-8 w-8 object-contain" />
    </a>
  );
}
