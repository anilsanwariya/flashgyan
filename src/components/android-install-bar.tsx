import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openPlayStore } from "@/lib/app-promo";

export function AndroidInstallBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/50 bg-background/90 px-4 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-500"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Get the FlashGyan app"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src="/icons/icon-192x192.png"
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl border border-border/40"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-foreground">FlashGyan app</div>
          <div className="truncate text-[13px] font-medium text-muted-foreground">
            Free on Google Play
          </div>
        </div>
        <Button
          type="button"
          onClick={() => openPlayStore("android_bar")}
          className="h-10 shrink-0 rounded-full px-5"
        >
          Install
        </Button>
      </div>
    </div>
  );
}
