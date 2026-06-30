import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { verifyTelegram, type TelegramProfile } from "@/lib/telegram-auth.functions";

type AuthState =
  | { status: "loading"; mode: "telegram"; user: null }
  | { status: "ready"; mode: "telegram"; user: TelegramProfile }
  | { status: "ready"; mode: "guest"; user: null }
  | { status: "error"; mode: "telegram"; user: null; error: string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        initDataUnsafe?: { user?: { first_name?: string; username?: string } };
      };
    };
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") return { status: "ready", mode: "guest", user: null };
    const initData = window.Telegram?.WebApp?.initData;
    if (initData && initData.length > 0) {
      return { status: "loading", mode: "telegram", user: null };
    }
    return { status: "ready", mode: "guest", user: null };
  });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData;
    if (!initData) return;
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      /* noop */
    }
    let cancelled = false;
    (async () => {
      try {
        const user = await verifyTelegram({ data: { initData } });
        if (cancelled) return;
        setState({ status: "ready", mode: "telegram", user });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          mode: "telegram",
          user: null,
          error: e instanceof Error ? e.message : "Verification failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    );
  }

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) return { status: "ready", mode: "guest", user: null };
  return ctx;
}

export function useDisplayName(): string | null {
  const auth = useAuth();
  if (auth.status === "ready" && auth.mode === "telegram") {
    return auth.user.first_name ?? auth.user.username ?? null;
  }
  return null;
}
