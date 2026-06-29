// src/lib/haptics.ts
export function triggerHaptic(type: "success" | "error" | "light") {
  if (!("vibrate" in navigator)) return;
  try {
    switch (type) {
      case "success": navigator.vibrate([30, 50, 30]); break;
      case "error": navigator.vibrate([100, 50, 100]); break;
      case "light": navigator.vibrate(20); break;
    }
  } catch (e) {}
}