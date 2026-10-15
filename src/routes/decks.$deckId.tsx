import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Layers } from "lucide-react";
import finalLogo from "@/assets/final-logo.png";
import { getDeck } from "@/lib/flashcards.functions";
import { SITE_URL, openPlayStore, playStoreUrl } from "@/lib/app-promo";
import { Button } from "@/components/ui/button";

const deckQO = (deckId: string) =>
  queryOptions({
    queryKey: ["deck", deckId],
    queryFn: () => getDeck({ data: { id: deckId } }),
  });

// Public, indexable overview of a deck: every question is server-rendered so
// search engines can find it, with answers tucked behind a tap for recall.
export const Route = createFileRoute("/decks/$deckId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(deckQO(params.deckId)),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Flashcards — Flashgyan" }] };
    const { deck, cards } = loaderData;
    const title = `${deck.name}: ${deck.subject} ${deck.topic} flashcards — FlashGyan`;
    const description =
      deck.description?.trim() ||
      `Revise ${cards.length} ${deck.subject} (${deck.topic}) flashcards with active recall. Practise free on FlashGyan or get the Android app.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/decks/${params.deckId}` }],
    };
  },
  component: DeckOverview,
  errorComponent: () => (
    <div className="min-h-dvh grid place-items-center p-6 text-center bg-background">
      <div>
        <p className="text-muted-foreground font-medium">This deck could not be found.</p>
        <Link to="/flashcards" className="text-primary mt-2 inline-block font-medium">
          Browse all decks
        </Link>
      </div>
    </div>
  ),
});

function DeckOverview() {
  const { deckId } = Route.useParams();
  const { data } = useSuspenseQuery(deckQO(deckId));
  const { deck, cards } = data;

  return (
    <div className="min-h-dvh bg-background/50 relative selection:bg-primary/20">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40 px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Link to="/" aria-label="Go to Home">
            <img
              src={finalLogo}
              alt="Flashgyan"
              className="h-10 w-auto object-contain drop-shadow-sm"
            />
          </Link>
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div>
          <Link
            to="/flashcards"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 bg-muted/50 hover:bg-muted px-3 py-1 rounded-full border border-border/50 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" /> All decks
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
            {deck.subject} · {deck.topic}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground/90 drop-shadow-sm">
            {deck.name}
          </h1>
          {deck.description && (
            <p className="mt-2 text-foreground/70 font-medium text-[15px] leading-relaxed">
              {deck.description}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-foreground/60">
            <Layers className="h-4 w-4" /> {cards.length} card{cards.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild size="lg" className="w-full">
            <Link to="/practice/$deckId" params={{ deckId }} search={{ review: false }}>
              Practise this deck
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full">
            <a
              href={playStoreUrl("deck_page", "website")}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openPlayStore("deck_page");
              }}
            >
              Get the Android app
            </a>
          </Button>
        </div>

        <section aria-label="Cards in this deck">
          <ol className="space-y-3">
            {cards.map((card, i) => (
              <li key={card.id}>
                <details className="group rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
                  <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="mt-0.5 text-xs font-bold text-muted-foreground tabular-nums">
                      {i + 1}.
                    </span>
                    <span className="flex-1">
                      {card.prompt && (
                        <span className="block text-xs font-bold uppercase text-primary">
                          {card.prompt}
                        </span>
                      )}
                      <span className="block text-[15px] font-semibold leading-snug text-foreground">
                        {card.question}
                      </span>
                    </span>
                    <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 border-t border-border/30 pt-3 pl-6">
                    <p className="text-xs font-bold uppercase text-success">Answer</p>
                    <p className="mt-1 text-[15px] font-medium leading-relaxed text-foreground/85">
                      {card.answer}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>

        <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 text-center">
          <h2 className="text-xl font-bold text-foreground">Remember it for exam day</h2>
          <p className="mt-2 text-sm font-medium text-foreground/70">
            The FlashGyan app schedules these cards with spaced repetition so you revise them right
            before you forget.
          </p>
          <Button
            type="button"
            className="mt-4 w-full sm:w-auto"
            onClick={() => openPlayStore("deck_page")}
          >
            Get FlashGyan on Google Play
          </Button>
        </div>
      </main>
    </div>
  );
}
