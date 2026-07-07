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
      { name: "description", content: "Practice multiple-choice questions with instant feedback and explanations." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mcqPracticeQO),
  component: McqPracticePage,
});

function McqPracticePage() {
  const { data: tests } = useSuspenseQuery(mcqPracticeQO);
  return (
    <div className="min-h-dvh bg-background/50 relative overflow-hidden selection:bg-primary/20">
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
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground/90 drop-shadow-sm">MCQ Practice</h1>
          <p className="mt-2 text-foreground/70 font-medium text-[15px] leading-relaxed">
            Answer the questions, see what's right, and read the explanation.
          </p>
        </div>

        <McqPracticeSection tests={tests} />
      </main>
    </div>
  );
}
