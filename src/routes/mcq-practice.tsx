import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import finalLogo from "@/assets/final-logo.png";
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
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">MCQ Practice</h1>
          <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
            Answer the questions, see what's right, and read the explanation.
          </p>
        </div>

        <McqPracticeSection tests={tests} />
      </main>
    </div>
  );
}
