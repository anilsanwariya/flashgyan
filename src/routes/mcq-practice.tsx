import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import finalLogo from "@/assets/final-logo.png.asset.json";
import { listMcqPracticeTests } from "@/lib/mcq-practice.functions";
import { McqPracticeSection } from "@/components/feature-sections";

const mcqPracticeQO = queryOptions({
  queryKey: ["mcqPracticeTests"],
  queryFn: () => listMcqPracticeTests(),
});

export const Route = createFileRoute("/mcq-practice")({
  head: () => ({
    meta: [
      { title: "MCQ Practice — Flashgyan" },
      {
        name: "description",
        content: "Practice multiple-choice questions with instant feedback and explanations.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mcqPracticeQO),
  component: McqPracticePage,
});

function McqPracticePage() {
  const { data: tests } = useSuspenseQuery(mcqPracticeQO);
  return (
    <div className="min-h-dvh bg-background">
      <header className="px-5 pt-2 pb-2 max-w-2xl mx-auto">
        <div className="flex items-center justify-center pb-1 border-b-2 border-primary/60">
          <img src={finalLogo.url} alt="Flashgyan" className="h-10 w-auto object-contain" />
        </div>
        <Link
          to="/"
          className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">MCQ Practice</h1>
        <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
          Answer the questions, see what's right, and read the explanation.
        </p>
      </header>
      <main className="px-5 max-w-2xl mx-auto pb-12 space-y-6">
        <McqPracticeSection tests={tests} />
      </main>
    </div>
  );
}
