// Installing FlashGyan as an app from the browser: the service worker, the
// install prompt Chrome/Edge offer, and whether we're already running as an
// installed app. Android users are sent to the Play Store app instead.
import { useEffect, useState } from "react";
import { detectPlatform } from "@/lib/app-promo";
import { isTelegramMiniApp } from "@/lib/telegram-env";

// Lovable's editor previews must never get a service worker.
const PREVIEW_HOSTS = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "lovable.app",
  "gpt-eng.com",
  "gptengineer.run",
];
const isPreviewHost = (host: string) =>
  PREVIEW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV || isPreviewHost(location.hostname)) {
    // Clean up one that a preview may have picked up earlier.
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()));
    return;
  }
  const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ---------- Chrome/Edge install prompt ----------

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Chrome fires this once, often before React mounts, so it's caught early.
export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canInstall: deferred !== null,
    install: async () => {
      const e = deferred;
      if (!e) return false;
      deferred = null;
      notify();
      await e.prompt();
      return (await e.userChoice).outcome === "accepted";
    },
  };
}

// ---------- When to suggest installing the website ----------

const SHOWN_KEY = "fg-web-install-shown-at";
const SNOOZE_KEY = "fg-web-install-snoozed-at";
const DAY = 24 * 60 * 60 * 1000;

function readTime(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeTime(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

// iPhone/iPad and computers only (Android has the Play Store app), at most
// once a day, and not for a week after "Not now".
export function shouldSuggestWebInstall() {
  if (typeof window === "undefined" || isStandalone() || isTelegramMiniApp()) return false;
  if (detectPlatform() === "android") return false;
  const now = Date.now();
  return now - readTime(SHOWN_KEY) >= DAY && now - readTime(SNOOZE_KEY) >= 7 * DAY;
}
export const markWebInstallShown = () => writeTime(SHOWN_KEY);
export const snoozeWebInstall = () => writeTime(SNOOZE_KEY);

// ---------- Admin on this device ----------

const ADMIN_DEVICE_KEY = "fg-admin-device";

export function setAdminDevice(on: boolean) {
  try {
    if (on) localStorage.setItem(ADMIN_DEVICE_KEY, "1");
    else localStorage.removeItem(ADMIN_DEVICE_KEY);
  } catch {
    /* storage unavailable */
  }
}
export function isAdminDevice() {
  try {
    return localStorage.getItem(ADMIN_DEVICE_KEY) === "1";
  } catch {
    return false;
  }
}
