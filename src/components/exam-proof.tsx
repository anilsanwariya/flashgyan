// The three proofreading checks on an exam paper's question: ① the question
// and its options read right, ② the answer, ③ the explanation (only after
// the answer, and only once one is written). Finished questions without an
// explanation are marked so it can be filled in later.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateExamQuestion } from "@/lib/exam-papers.functions";
import {
  DIFFICULTIES,
  LEVELS,
  LEVEL_NO,
  PROOF_LABEL,
  finished,
  hasExplanation,
  levelDone,
  needsExplanation,
  type Difficulty,
  type ExamQuestion,
  type ProofLevel,
} from "@/lib/exam-papers";
import { errorText } from "@/components/ca-ui";

export function ProofChecks({
  q,
  locked,
  onChanged,
}: {
  q: ExamQuestion;
  locked?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const fn = useServerFn(updateExamQuestion);
  // Ticked at once; the server's answer follows.
  const [local, setLocal] = useState<Partial<Record<ProofLevel, boolean>>>({});
  useEffect(() => setLocal({}), [q.proof_question, q.proof_answer, q.proof_explanation]);
  const done = (l: ProofLevel) => local[l] ?? levelDone(q, l);
  const explained = hasExplanation(q);
  const set = (l: ProofLevel, on: boolean) => {
    const next = { ...local, [l]: on };
    if (l === "answer" && !on) next.explanation = false;
    setLocal(next);
    void fn({ data: { id: q.id, patch: { proof: { [l]: on } } } })
      .then(onChanged)
      .catch((e) => {
        setLocal({});
        toast.error(errorText(e, "Couldn't save"));
      });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-proof-checks={q.q_no}>
      {LEVELS.map((l) => {
        const disabled = locked || (l === "explanation" && (!explained || !done("answer")));
        return (
          <label
            key={l}
            title={
              l === "explanation" && !explained
                ? "No explanation yet"
                : l === "explanation" && !done("answer")
                  ? "Tick the answer first"
                  : `${PROOF_LABEL[l]} proofread`
            }
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              done(l)
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "border-border text-muted-foreground"
            } ${disabled ? "opacity-50" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              className="h-3 w-3"
              data-proof={l}
              checked={done(l)}
              disabled={disabled}
              onChange={(e) => set(l, e.target.checked)}
            />
            {LEVEL_NO[l]} {PROOF_LABEL[l]}
          </label>
        );
      })}
      {finished(q) && (
        <span
          className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"
          data-finished
        >
          Finished
        </span>
      )}
      {needsExplanation(q) && (
        <span
          className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-300"
          data-needs-explanation
          title="Usable now; write its explanation and proofread it later"
        >
          Needs explanation
        </span>
      )}
    </span>
  );
}

// The options the key accepts, besides the main one.
export function AlsoAccepted({
  answer,
  also,
  onChange,
}: {
  answer: string;
  also: number[];
  onChange: (also: number[]) => void;
}) {
  if (!/^[1-4]$/.test(answer)) return null;
  const main = Number(answer);
  return (
    <span className="inline-flex items-center gap-1 text-xs" data-also-accepted>
      Also accepted:
      {[1, 2, 3, 4]
        .filter((n) => n !== main)
        .map((n) => (
          <label key={n} className="inline-flex items-center gap-0.5">
            <input
              type="checkbox"
              aria-label={`Option ${n} also accepted`}
              checked={also.includes(n)}
              onChange={(e) =>
                onChange(e.target.checked ? [...also, n].sort() : also.filter((x) => x !== n))
              }
            />
            {n}
          </label>
        ))}
    </span>
  );
}

export function DifficultySelect({
  value,
  onChange,
}: {
  value: Difficulty | "";
  onChange: (v: Difficulty | "") => void;
}) {
  return (
    <select
      aria-label="Difficulty"
      value={value}
      onChange={(e) => onChange(e.target.value as Difficulty | "")}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">Difficulty: not set</option>
      {DIFFICULTIES.map((d) => (
        <option key={d} value={d}>
          {d[0].toUpperCase() + d.slice(1)}
        </option>
      ))}
    </select>
  );
}
