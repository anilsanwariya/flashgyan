import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { getTelegramWebApp, isTelegramMiniApp } from "@/lib/telegram-env";

export const SITE_URL = "https://www.flashgyan.com";
export const ANDROID_PACKAGE = "com.flashgyan";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

// Where on the site an install link was shown. Becomes utm_medium in the Play
// install referrer, so Play Console can attribute installs to each placement.
export type AppPromoPlacement =
  | "home_badge"
  | "desktop_qr"
  | "home_demo"
  | "android_bar"
  | "flashcard_complete"
  | "mcq_test_complete"
  | "mcq_practice_complete"
  | "mcq_result"
  | "deck_page"
  // The daily "Words in the News" album on the Telegram channel.
  | "words_in_news";

export type Platform = "android" | "ios" | "desktop";

function trafficSource() {
  return isTelegramMiniApp() ? "telegram_miniapp" : "website";
}

export function playStoreUrl(placement: AppPromoPlacement, source = trafficSource()) {
  const referrer = `utm_source=${source}&utm_medium=${placement}&utm_campaign=web_to_app`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "desktop";
}

// Null until mounted, so server and first client render match.
export function usePlatform() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => setPlatform(detectPlatform()), []);
  return platform;
}

// Telegram's in-app browser can trap https links; openLink hands them to the
// system so play.google.com opens the Play Store app.
export function openExternal(url: string) {
  const tg = getTelegramWebApp();
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openPlayStore(placement: AppPromoPlacement) {
  trackEvent("app_download_click", { placement, platform: detectPlatform() });
  openExternal(playStoreUrl(placement));
}

// ---------- Prompt frequency + installed-app detection ----------

const PROMPT_SHOWN_KEY = "fg-app-prompt-shown-at";
const INSTALLED_KEY = "fg-app-installed";
const BAR_DISMISSED_KEY = "fg-app-bar-dismissed-at";
const PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BAR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function readNumber(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function isAppInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

// Works once the Android app declares the site in its asset statements;
// until then Chrome reports no related apps and this stays false.
export async function detectInstalledApp() {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<{ platform: string; id?: string }[]>;
  };
  if (!nav.getInstalledRelatedApps) return;
  try {
    const apps = await nav.getInstalledRelatedApps();
    const installed = apps.some((app) => app.platform === "play" && app.id === ANDROID_PACKAGE);
    writeValue(INSTALLED_KEY, installed ? "1" : "0");
  } catch {
    /* unsupported */
  }
}

// The download popup appears at most once a day, never on iOS (no iOS app
// yet) and never for people who already have the Android app.
export function shouldShowAppPrompt() {
  if (typeof window === "undefined") return false;
  if (detectPlatform() === "ios" || isAppInstalled()) return false;
  return Date.now() - readNumber(PROMPT_SHOWN_KEY) >= PROMPT_INTERVAL_MS;
}

export function markAppPromptShown(placement: AppPromoPlacement) {
  writeValue(PROMPT_SHOWN_KEY, String(Date.now()));
  trackEvent("app_prompt_view", { placement, platform: detectPlatform() });
}

function shouldShowInstallBar() {
  if (detectPlatform() !== "android" || isAppInstalled()) return false;
  return Date.now() - readNumber(BAR_DISMISSED_KEY) >= BAR_SNOOZE_MS;
}

function dismissInstallBar() {
  writeValue(BAR_DISMISSED_KEY, String(Date.now()));
}

// Android-only "Install" bar, snoozed for a week when dismissed.
export function useAndroidInstallBar() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(shouldShowInstallBar()), []);
  const dismiss = () => {
    dismissInstallBar();
    setVisible(false);
  };
  return { visible, dismiss };
}

// ---------- Sharing ----------

function siteShareUrl(medium: string) {
  return `${SITE_URL}/?utm_source=share&utm_medium=${medium}&utm_campaign=score_share`;
}

// Telegram share sheet inside the mini app, the native share sheet on phones,
// WhatsApp everywhere else.
export function shareScore(text: string, medium: string) {
  const url = siteShareUrl(medium);
  trackEvent("share_click", { medium });
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    );
    return;
  }
  if (typeof navigator.share === "function") {
    navigator.share({ text, url }).catch(() => {
      /* dismissed */
    });
    return;
  }
  window.open(
    `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    "_blank",
    "noopener,noreferrer",
  );
}
