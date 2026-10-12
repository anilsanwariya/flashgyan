import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import playStoreQr from "@/assets/play-store-qr.svg";
import {
  markAppPromptShown,
  openExternal,
  openPlayStore,
  usePlatform,
  type AppPromoPlacement,
} from "@/lib/app-promo";

interface AppDownloadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  placement?: AppPromoPlacement;
  appLink?: string;
  title?: string;
  description?: string;
  downloadLabel?: string;
  continueLabel?: string;
  continueDisabled?: boolean;
}

export function AppDownloadPopup({
  isOpen,
  onClose,
  onContinue,
  placement = "flashcard_complete",
  appLink,
  title = "Loved Flashgyan?",
  description = "Download our official app to study more efficiently, get offline access, and ace your exams!",
  downloadLabel = "Download Official App",
  continueLabel,
  continueDisabled = false,
}: AppDownloadPopupProps) {
  const platform = usePlatform();

  useEffect(() => {
    if (isOpen) markAppPromptShown(placement);
  }, [isOpen, placement]);

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* iOS Glass Sheet */}
      <AlertDialogContent className="rounded-[32px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border border-white/20 shadow-2xl p-5 sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold text-foreground text-center tracking-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[14px] text-center text-muted-foreground mt-1.5 leading-snug">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 pt-4 pb-2">
          <Button
            size="lg"
            className="w-full h-[52px] rounded-[24px] bg-primary text-primary-foreground font-semibold text-[16px] shadow-[0_4px_24px_rgba(var(--primary),0.2)] active:scale-[0.98] transition-all"
            onClick={() => (appLink ? openExternal(appLink) : openPlayStore(placement))}
          >
            {downloadLabel}
          </Button>
          {platform === "desktop" && !appLink && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white p-2 pr-4">
              <img src={playStoreQr} alt="QR code for FlashGyan on Google Play" className="h-20 w-20 shrink-0" />
              <p className="text-[13px] font-medium leading-snug text-neutral-600">
                On a computer? Scan with your Android phone to install.
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:space-x-0">
          {continueLabel ? (
            <Button
              onClick={onContinue}
              disabled={continueDisabled}
              className="w-full h-[48px] m-0 rounded-[20px] font-semibold bg-success/15 text-success border border-success/20 hover:bg-success/25 active:scale-[0.98] transition-all"
            >
              {continueLabel}
            </Button>
          ) : <AlertDialogCancel
            onClick={onContinue}
            className="w-full h-[48px] m-0 rounded-[20px] font-semibold bg-success/15 text-success border border-success/20 hover:bg-success/25 active:scale-[0.98] transition-all"
          >
            Skip to Summary
          </AlertDialogCancel>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
