import { diffWords } from "@/lib/flash-studio";

// An AI fix's old and new text, with only the changed words marked: the
// rest reads plainly, so a one-letter fix stands out.
export function FixDiff({ from, to }: { from: string; to: string }) {
  const d = diffWords(from, to);
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-2" lang="hi">
      <div
        className="whitespace-pre-wrap rounded bg-red-500/5 px-2 py-1 text-foreground/80"
        aria-label="Now"
      >
        {from
          ? d.from.map((p, i) =>
              p.changed ? (
                <del
                  key={i}
                  className="rounded bg-red-500/20 px-0.5 text-red-800 decoration-red-500/70 dark:text-red-300"
                >
                  {p.text}
                </del>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )
          : "—"}
      </div>
      <div
        className="whitespace-pre-wrap rounded bg-emerald-500/5 px-2 py-1 text-foreground/80"
        aria-label="Suggested"
      >
        {d.to.map((p, i) =>
          p.changed ? (
            <ins
              key={i}
              className="rounded bg-emerald-500/25 px-0.5 font-medium text-emerald-900 no-underline dark:text-emerald-200"
            >
              {p.text}
            </ins>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
    </div>
  );
}
