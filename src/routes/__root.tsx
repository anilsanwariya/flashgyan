import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import logoAsset from "@/assets/flashgyan-logo.png";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { isTelegramMiniApp, getTelegramWebApp } from "@/lib/telegram-env";

// Telegram Expander: Forces the mini-app to take up the full screen height
function TelegramExpander() {
  useEffect(() => {
    if (isTelegramMiniApp()) {
      const tg = getTelegramWebApp();
      tg?.ready();
      tg?.expand();
      
      document.body.classList.add("tg-mini-app");
      tg?.enableClosingConfirmation(); 

      // Matches Telegram's native backdrop to prevent white/black flashing underneath
      try {
        if (tg.themeParams?.bg_color) {
          tg.setBackgroundColor(tg.themeParams.bg_color);
        }
      } catch (e) {
        // Ignore if older Telegram version doesn't support this
      }

      const forceRepaint = () => {
        // Force iOS WKWebView to re-composite the page after resume.
        // Toggling a transform on the root element is more reliable than scroll jolts.
        const root = document.documentElement;
        root.style.transform = "translateZ(0)";
        // Read a layout property to flush styles
        void root.offsetHeight;
        requestAnimationFrame(() => {
          root.style.transform = "";
          try {
            tg?.expand();
          } catch {
            /* noop */
          }
        });
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          forceRepaint();
        }
      };

      window.addEventListener("pageshow", forceRepaint);
      window.addEventListener("focus", forceRepaint);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        window.removeEventListener("pageshow", forceRepaint);
        window.removeEventListener("focus", forceRepaint);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }
  }, []);

  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        name: "description",
        content:
          "Flashgyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go.",
      },
      { property: "og:title", content: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        property: "og:description",
        content:
          "Flashgyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#f7f5ed" },
      { name: "twitter:title", content: "Flashgyan: Smart Flashcards for Exam Success" },
      {
        name: "twitter:description",
        content:
          "Flashgyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d41aadb9-a809-4d28-a7cb-615634015c40",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d41aadb9-a809-4d28-a7cb-615634015c40",
      },
      { name: "description", content: "FlashGyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go." },
      { property: "og:description", content: "FlashGyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go." },
      { name: "twitter:description", content: "FlashGyan uses active recall & spaced repetition to boost memory! Master any syllabus with our smart digital flashcards. Study efficiently anywhere you go." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ab39d20b-0ba5-4e3e-a17e-c84d41522181" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ab39d20b-0ba5-4e3e-a17e-c84d41522181" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: logoAsset },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap",
      },
    ],
    scripts: [
      // REMOVED async: true to ensure Telegram SDK loads synchronously before React checks for it
      { src: "https://telegram.org/js/telegram-web-app.js" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (cancelled) return;
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      return () => sub.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="top-center" />
      <AuthProvider>
        <TelegramExpander />
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}