import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import finalLogo from "@/assets/final-logo.png";
import { listDecks } from "@/lib/flashcards.functions";
import { FlashcardsSection } from "@/components/feature-sections";

const decksQO = queryOptions({ queryKey: ["decks"], queryFn: () => listDecks() });

export const Route = createFileRoute("/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — Flashgyan" },
      { name: "description", content: "Flip through flashcard decks and rate your recall." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQO),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const { data: decks } = useSuspenseQuery(decksQO);
  return (
    <div className="min-h-dvh bg-background/50 relative selection:bg-primary/20">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Link to="/" aria-label="Go to Home">
            <img src={finalLogo} alt="Flashgyan" className="h-10 w-auto object-contain drop-shadow-sm" />
          </Link>
          <img
            src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//RASbandhu-logo-green.png"
            alt="RASbandhu"
            className="h-10 w-auto object-contain drop-shadow-sm"
          />
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 bg-muted/50 hover:bg-muted px-3 py-1 rounded-full border border-border/50 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground/90 drop-shadow-sm">Flashcards</h1>
          <p className="mt-2 text-foreground/70 font-medium text-[15px] leading-relaxed">
            Flip through cards and rate your recall.
          </p>
        </div>

        <FlashcardsSection decks={decks} />
      </main>
    </div>
  );
}
