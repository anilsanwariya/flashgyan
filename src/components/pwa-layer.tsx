// App-install suggestions and the admin's shortcut, shown on top of every
// page: "Add to Home Screen" help on iPhone/iPad, an "Install" card on
// computers, an "Install admin app" button inside the admin panel, and an
// Admin button on the public site for a device where the admin has signed in.
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, Share, ShieldCheck, SquarePlus, X } from "lucide-react";
import { detectPlatform } from "@/lib/app-promo";
import { isTelegramMiniApp } from "@/lib/telegram-env";
import {
  isAdminDevice,
  isStandalone,
  markWebInstallShown,
  shouldSuggestWebInstall,
  snoozeWebInstall,
  useInstallPrompt,
} from "@/lib/pwa";
import { Button } from "@/components/ui/button";

export function PwaLayer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(!isTelegramMiniApp()), []);
  if (!ready) return null;
  if (pathname.startsWith("/admin")) return <AdminInstallButton />;
  if (pathname.startsWith("/auth")) return null;
  return (
    <>
      <WebInstallSuggestion />
      <AdminShortcut />
    </>
  );
}

// ---------- Students: install the website ----------

function WebInstallSuggestion() {
  const { canInstall, install } = useInstallPrompt();
  const [show, setShow] = useState<"ios" | "desktop" | null>(null);

  useEffect(() => {
    if (!shouldSuggestWebInstall()) return;
    const platform = detectPlatform();
    if (platform === "desktop" && !canInstall) return;
    // Give people a moment with the site before asking.
    const t = setTimeout(
      () => {
        if (!shouldSuggestWebInstall()) return;
        markWebInstallShown();
        setShow(platform === "ios" ? "ios" : "desktop");
      },
      platform === "ios" ? 20_000 : 10_000,
    );
    return () => clearTimeout(t);
  }, [canInstall]);

  if (!show) return null;
  const close = () => {
    snoozeWebInstall();
    setShow(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Install FlashGyan"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-background/95 p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-500 sm:inset-x-auto sm:right-5 sm:bottom-5"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icons/apple-touch-icon.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0">
          <p className="font-semibold">
            Add FlashGyan to your {show === "ios" ? "Home Screen" : "computer"}
          </p>
          <p className="text-sm text-muted-foreground">
            Opens like an app, full screen and faster.
          </p>
        </div>
      </div>
      {show === "ios" ? (
        <ol className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              1
            </span>
            Tap <Share className="inline h-4 w-4 text-primary" aria-label="Share" /> Share in the
            browser bar
          </li>
          <li className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              2
            </span>
            Choose <SquarePlus className="inline h-4 w-4 text-primary" aria-hidden /> “Add to Home
            Screen”
          </li>
        </ol>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await install();
              setShow(null);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Install
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Admin: a way back in without a public link ----------

function AdminShortcut() {
  const [show, setShow] = useState(false);
  // On Android it sits above the "Get the app" bar.
  const [lift, setLift] = useState(false);
  useEffect(() => setLift(detectPlatform() === "android"), []);
  useEffect(() => {
    if (!isAdminDevice()) return;
    let cancelled = false;
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setShow(Boolean(data.session));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  if (!show) return null;
  return (
    <Link
      to="/admin"
      className="fixed left-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur hover:bg-muted"
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${lift ? "5.5rem" : "0.75rem"})` }}
    >
      <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin
    </Link>
  );
}

const ADMIN_INSTALL_DISMISSED = "fg-admin-install-dismissed";

function AdminInstallButton() {
  const { canInstall, install } = useInstallPrompt();
  const [state, setState] = useState<"hidden" | "button" | "ios-help">("hidden");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(ADMIN_INSTALL_DISMISSED) === "1";
    } catch {
      /* storage unavailable */
    }
    if (dismissed || isStandalone()) return setState("hidden");
    setState(canInstall || detectPlatform() === "ios" ? "button" : "hidden");
  }, [canInstall]);

  if (state === "hidden") return null;
  const dismiss = () => {
    try {
      localStorage.setItem(ADMIN_INSTALL_DISMISSED, "1");
    } catch {
      /* storage unavailable */
    }
    setState("hidden");
  };

  return (
    <div
      className="fixed right-3 z-40 flex max-w-xs items-start gap-2 rounded-2xl border border-border bg-background/95 p-2 pl-3 text-sm shadow-lg backdrop-blur"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      {state === "ios-help" ? (
        <p className="py-1">
          Tap <Share className="inline h-4 w-4 text-primary" aria-label="Share" /> Share, then “Add
          to Home Screen”. The “FG Admin” icon opens straight into this panel.
        </p>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 py-1 font-semibold text-primary"
          onClick={async () => {
            if (detectPlatform() === "ios" || !canInstall) return setState("ios-help");
            if (await install()) dismiss();
          }}
        >
          <Download className="h-4 w-4" /> Install admin app
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Don't show again"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
