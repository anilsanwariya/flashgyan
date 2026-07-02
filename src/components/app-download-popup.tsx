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

interface AppDownloadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  appLink?: string;
}

export function AppDownloadPopup({
  isOpen,
  onClose,
  onContinue,
  appLink = "https://play.google.com/store/apps/details?id=com.flashgyan",
}: AppDownloadPopupProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* iOS Glass Sheet */}
      <AlertDialogContent className="rounded-[32px] backdrop-blur-3xl bg-white/80 dark:bg-black/80 border border-white/20 shadow-2xl p-6 sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground text-center tracking-tight">
            Loved Flashgyan?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] text-center text-muted-foreground mt-2 leading-relaxed">
            Download our official app to study more efficiently, get offline access, and ace your exams!
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 py-6">
          <Button
            size="lg"
            className="w-full h-14 rounded-[24px] bg-primary text-primary-foreground font-semibold text-[17px] shadow-[0_4px_24px_rgba(var(--primary),0.2)] active:scale-[0.98] transition-all"
            onClick={() => {
              window.open(appLink, "_blank");
            }}
          >
            Download Official App
          </Button>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:space-x-0">
          <AlertDialogCancel
            onClick={onContinue}
            className="w-full h-12 rounded-[20px] font-semibold bg-secondary/50 border-0 hover:bg-secondary/70 active:scale-[0.98] transition-all"
          >
            Skip to Summary
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
