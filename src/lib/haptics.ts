// src/lib/haptics.ts

export type HapticStyle = "success" | "error" | "light" | "medium" | "heavy" | "warning";

export function triggerHaptic(type: HapticStyle = "light") {
  if (typeof window === "undefined") return;

  // 1. Try Telegram Mini App SDK first (Fixes iOS issues)
  // @ts-ignore - window.Telegram might not be fully typed in your project yet
  const tgWebApp = window.Telegram?.WebApp;

  if (tgWebApp && tgWebApp.HapticFeedback) {
    try {
      if (["light", "medium", "heavy"].includes(type)) {
        tgWebApp.HapticFeedback.impactOccurred(type);
      } else {
        tgWebApp.HapticFeedback.notificationOccurred(type);
      }
      return; // Exit early if Telegram successfully fired the haptic
    } catch (e) {
      console.error("Telegram haptic failed:", e);
    }
  }

  // 2. Fallback to standard Browser API (For Android / Web / PWA)
  if ("vibrate" in navigator) {
    try {
      switch (type) {
        case "success":
          navigator.vibrate([30, 50, 30]);
          break;
        case "error":
        case "warning":
          navigator.vibrate([100, 50, 100]);
          break;
        case "heavy":
          navigator.vibrate(50);
          break;
        case "medium":
          navigator.vibrate(30);
          break;
        case "light":
        default:
          navigator.vibrate(20);
          break;
      }
    } catch (e) {
      console.error("Browser haptic failed:", e);
    }
  }
}
