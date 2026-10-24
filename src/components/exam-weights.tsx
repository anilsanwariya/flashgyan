// Admin: the exams the magazine prepares for, on the Exam papers page. Each
// exam (its papers grouped without the year) gets a weight; what their
// current affairs questions ask, weighted, guides story picking, the
// practice set and the coverage meter.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { getExamProfile, saveExamWeights } from "@/lib/ca-exam-weights.functions";
import { WEIGHTS, type ExamProfile } from "@/lib/ca-exam-weights";
import { CATEGORIES } from "@/lib/current-affairs";
import { errorText, SavesInstantly } from "@/components/ca-ui";

const sectionName = (id: string) => CATEGORIES.find((c) => c.id === id)?.en ?? id;

export function ExamWeights() {
  const qc = useQueryClient();
  const getFn = useServerFn(getExamProfile);
  const saveFn = useServerFn(saveExamWeights);
  const q = useQuery({ queryKey: ["examProfile"], queryFn: () => getFn(), refetchOnMount: true });
  const [busy, setBusy] = useState(false);
  const p = q.data;
  if (!p || !p.families.length) return null;

  async function setWeight(family: string, weight: number) {
    setBusy(true);
    try {
      const weights: Record<string, number> = Object.fromEntries(
        p!.families.map((f) => [f.family, f.weight]),
      );
      weights[family] = weight;
      const next = await saveFn({ data: { weights } });
      qc.setQueryData<ExamProfile>(["examProfile"], next);
      void qc.invalidateQueries({ queryKey: ["caCoverage"] });
      toast.success("Exam weight saved");
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }

  const top = Object.entries(p.shares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return (
    <section
      aria-label="Exams you prepare for"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Exams you prepare for</h3>
          <SavesInstantly />
        </div>
        <p className="text-sm text-muted-foreground">
          How much each exam matters for your students. What their papers ask in current affairs, by
          these weights, guides which news SAATHI picks and its importance, the monthly practice
          set, and the coverage meter (“Weighted by your exams”).
          {!p.set && " Until you set one, every exam counts the same and picking isn't changed."}
        </p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {p.families.map((f) => (
          <li
            key={f.family}
            data-exam={f.family}
            className="flex flex-wrap items-center gap-2 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{f.family}</p>
              <p className="text-xs text-muted-foreground">
                {f.papers} {f.papers === 1 ? "paper" : "papers"} · {f.questions} current affairs{" "}
                {f.questions === 1 ? "question" : "questions"}
              </p>
            </div>
            <div role="radiogroup" aria-label={`Weight of ${f.family}`} className="flex gap-1">
              {WEIGHTS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={f.weight === w.id}
                  disabled={busy}
                  onClick={() => f.weight !== w.id && void setWeight(f.family, w.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    f.weight === w.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {top.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="exam-mix">
          Weighted, their current affairs questions come most from:{" "}
          {top.map(([s, v]) => `${sectionName(s)} ${Math.round(v)}%`).join(" · ")}
        </p>
      )}
    </section>
  );
}
