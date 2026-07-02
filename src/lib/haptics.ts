import { isTelegramMiniApp, getTelegramWebApp } from "./telegram-env";

export function triggerHaptic(type: "success" | "error" | "light" | "medium" | "heavy") {
  if (isTelegramMiniApp()) {
    const tg = getTelegramWebApp();
    if (!tg) return;

    // Telegram Native Haptics Engine
    if (type === "success") tg.HapticFeedback.notificationOccurred("success");
    else if (type === "error") tg.HapticFeedback.notificationOccurred("error");
    else tg.HapticFeedback.impactOccurred(type);
    
  } else {
    // Standard Browser Web Haptics (Fallback)
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    
    if (type === "light") navigator.vibrate(50);
    else if (type === "medium") navigator.vibrate(100);
    else if (type === "heavy") navigator.vibrate(150);
    else if (type === "success") navigator.vibrate([50, 50, 50]);
    else if (type === "error") navigator.vibrate([100, 50, 100, 50, 100]);
  }
}