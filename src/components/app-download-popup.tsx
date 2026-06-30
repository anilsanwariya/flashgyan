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
  appLink = "https://play.google.com/store/apps/details?id=com.flashgyan" 
}: AppDownloadPopupProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-primary text-center">
            Loved FlashGyan? 🚀
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-center mt-2">
            Download our official app to study more efficiently, get offline access, and ace your exams!
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex flex-col gap-3 py-4">
          <Button 
            size="lg"
            className="w-full text-md font-semibold" 
            onClick={() => {
              window.open(appLink, "_blank");
            }}
          >
            Download App to Study More
          </Button>
        </div>

        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel 
            onClick={onContinue} 
            className="w-full sm:w-auto border-none shadow-none hover:bg-transparent text-muted-foreground hover:text-foreground"
          >
            Skip to Summary
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}