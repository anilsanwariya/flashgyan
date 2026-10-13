// Optional Google Analytics 4. Set VITE_GA_MEASUREMENT_ID (e.g. "G-XXXXXXXXXX")
// to enable it; without it every call here is a no-op.
const rawId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() ?? "";

export const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/.test(rawId) ? rawId : "";

export function analyticsHeadScripts() {
  if (!GA_MEASUREMENT_ID) return [];
  return [
    { src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`, async: true },
    {
      children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`,
    },
  ];
}

export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", name, params);
}
