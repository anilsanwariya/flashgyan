import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import finalLogo from "@/assets/final-logo.png.asset.json";
import { listMcqTests } from "@/lib/mcq.functions";
import { McqSection } from "@/components/feature-sections";

const mcqQO = queryOptions({ queryKey: ["mcqTests"], queryFn: () => listMcqTests() });

export const Route = createFileRoute("/mcq-tests")({
  head: () => ({
    meta: [
      { title: "MCQ Tests — Flashgyan" },
      {
        name: "description",
        content: "Take timed multiple-choice tests and review your score.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mcqQO),
  component: McqTestsPage,
});

function McqTestsPage() {
  const { data: tests } = useSuspenseQuery(mcqQO);
  return (
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-2 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center justify-between pb-1 border-b-2 border-primary/60">
          <img src={finalLogo.url} alt="Flashgyan" className="h-10 w-auto object-contain" />
          <img
            src="https://ueldzqtaqepehyeivppm.supabase.co/storage/v1/object/public/my-images//RASbandhu-logo-green.png"
            alt="RASbandhu"
            className="h-10 w-auto object-contain"
          />
        </div>
        <Link
          to="/"
          className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">MCQ Tests</h1>
        <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
          Answer the questions before time runs out, and review your score.
        </p>
      </header>
      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6">
        <McqSection tests={tests} />
      </main>
    </div>
  );
}
