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
      {
        name: "description",
        content: "Flip through flashcard decks and rate your recall.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQO),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const { data: decks } = useSuspenseQuery(decksQO);
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 bg-background px-5 py-2 max-w-2xl mx-auto shadow-sm">
        <div className="flex items-center justify-between">
          <img src={finalLogo.url} alt="Flashgyan" className="h-10 w-auto object-contain" />
          <img
            src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//RASbandhu-logo-green.png"
            alt="RASbandhu"
            className="h-10 w-auto object-contain"
          />
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6 pt-5">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Flashcards</h1>
          <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
            Flip through cards and rate your recall.
          </p>
        </div>

        <FlashcardsSection decks={decks} />
      </main>
    </div>
  );
}
