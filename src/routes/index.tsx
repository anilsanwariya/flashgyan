import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getHomeData, type HomeData } from "@/lib/home.functions";
import { ChevronLeft, ChevronRight, ExternalLink, Layers, ListChecks, Lock, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import finalLogo from "@/assets/final-logo.png.asset.json";
import tgIcon from "@/assets/tg-icon.svg.asset.json";
import { useDisplayName } from "@/hooks/use-auth";


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
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 bg-background px-5 py-2 max-w-2xl mx-auto shadow-sm">
        <div className="flex items-center justify-between">
          <img src={finalLogo.url} alt="Flashgyan" className="h-10 w-auto object-contain" />
          <img
            src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//RASbandhu-logo-green.png"
            alt="RASbandhu"
            className="h-10 w-auto object-contain"
          />
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6 pt-5">
        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-[#910000]">{greeting}{displayName ? `, ${displayName}` : ""}.</h1>
          <p className="text-foreground font-semibold text-[15px] leading-relaxed">
            "Welcome to FlashGyan! Let's make your exam preparation smarter and faster."
          </p>
        </div>

        <div className="w-full space-y-3">
          <BannerCarousel banners={home.banners} />

          <div className="flex justify-between items-center w-full">
            <button
              onClick={() => toast.info("iOS app is coming soon!")}
              className="transition-transform hover:scale-105 active:scale-95 block"
              aria-label="Download on the App Store (Coming Soon)"
            >
              <img
                src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg"
                alt="Download on the App Store"
                className="h-[52px] w-auto object-contain drop-shadow-sm"
              />
            </button>

            <a
              href="https://play.google.com/store/apps/details?id=com.flashgyan"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-105 active:scale-95 block"
              aria-label="Get it on Google Play"
            >
              <img
                src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//GetItOnGooglePlay_Badge_Web_color_English.svg"
                alt="Get it on Google Play"
                className="h-[52px] w-auto object-contain drop-shadow-sm"
              />
            </a>
          </div>
        </div>

        {home.settings.cta_url.trim() && home.settings.cta_label.trim() && (
          <ExternalCtaButton
            label={home.settings.cta_label}
            subtitle={home.settings.cta_subtitle}
            url={home.settings.cta_url}
            locked={home.settings.lock_cta}
          />
        )}

        {home.settings.cta_caption.trim() && (
          <p className="mt-3 mb-2 text-center text-[#910000] text-[15px] leading-relaxed">
            {home.settings.cta_caption}
          </p>
        )}

        <FeaturePicker settings={home.settings} />
      </main>

      <footer className="border-t border-border bg-background/60">
        <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col items-center justify-center text-center gap-3 text-xs text-muted-foreground">
          <p className="uppercase tracking-wide font-small">
            <span className="block">© 2026 FLASHGYAN EDTECH LLP.</span>
            <span className="block mt-1">ALL RIGHTS RESERVED.</span>
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
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
      <TelegramFloatingButton />
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
      className="relative w-full overflow-hidden rounded-[06px] shadow-soft bg-muted border-2 border-primary/20"
      style={{ aspectRatio: "2 / 1" }}
      aria-label="Featured banners"
    >
      <div
        className="flex h-full transition-transform duration-800 ease-out"
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
            className="absolute left-0 top-1/2 -translate-y-1/2 px-0 py-3 text-white drop-shadow-md flex items-center justify-center hover:text-white/80 active:scale-95 transition"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => setIdx((i) => (i + 1) % len)}
            className="absolute right-0 top-1/2 -translate-y-1/2 px-0 py-3 text-white drop-shadow-md flex items-center justify-center hover:text-white/80 active:scale-95 transition"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
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

function FeaturePicker({ settings }: { settings: HomeData["settings"] }) {
  const navigate = useNavigate();
  return (
    <section className="space-y-3">
      <FeatureCard
        title="Flashcards"
        subtitle="Flip cards and rate recall."
        icon={<Layers className="h-5 w-5" />}
        gradient="grad-pink"
        locked={settings.lock_flashcards}
        onClick={() => navigate({ to: "/flashcards" })}
      />
      <FeatureCard
        title="MCQ Practice"
        subtitle="Q&A with instant feedback."
        icon={<Target className="h-5 w-5" />}
        gradient="grad-mint"
        locked={settings.lock_mcq_practice}
        onClick={() => navigate({ to: "/mcq-practice" })}
      />
      <FeatureCard
        title="MCQ Tests"
        subtitle="Timed multiple choice tests."
        icon={<ListChecks className="h-5 w-5" />}
        gradient="grad-lavender"
        locked={settings.lock_mcq}
        onClick={() => navigate({ to: "/mcq-tests" })}
      />
      <FeatureCard
        title="SAATHI"
        subtitle="Ask the AI study assistant."
        icon={<Sparkles className="h-5 w-5" />}
        gradient="grad-peach"
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

function TelegramFloatingButton() {
  return (
    <a
      href="https://t.me/RASbandhu"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Telegram"
      className="fixed right-5 bottom-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#2aabee] shadow-soft transition-transform hover:scale-105 active:scale-95 overflow-hidden"
    >
      <img src={tgIcon.url} alt="Telegram" className="h-full w-full object-cover" />
    </a>
  );
}
