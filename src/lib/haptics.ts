// src/lib/haptics.ts

// 1. Properly declare the Telegram object on the global Window interface
// This stops TypeScript and ESLint from throwing build errors.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
        };
      };
    };
  }
}

export type HapticStyle = "success" | "error" | "light" | "medium" | "heavy" | "warning";

export function triggerHaptic(type: HapticStyle = "light") {
  if (typeof window === "undefined") return;

  // 2. Safely access Telegram now that TypeScript knows about it
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

  // 3. Fallback to standard Browser API (For Android / Web / PWA)
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
