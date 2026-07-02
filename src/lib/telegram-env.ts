export function isTelegramMiniApp(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as any).Telegram !== undefined &&
    (window as any).Telegram.WebApp !== undefined &&
    (window as any).Telegram.WebApp.initData !== ""
  );
}

export function getTelegramWebApp() {
  if (isTelegramMiniApp()) {
    return (window as any).Telegram.WebApp;
  }
  return null;
}