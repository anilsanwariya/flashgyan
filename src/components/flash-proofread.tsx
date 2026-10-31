// Proofread sheets in the card studio: the sheets the editor marked as
// already proofread (shared with every part of a topic's page), and the
// ✓ / ✗ shown beside words and versions when books are compared.
import { createContext, useContext } from "react";
import type { ProofMark } from "@/lib/flash-merge";

export const ProofreadContext = createContext<ReadonlySet<string>>(new Set());
// The ids of the topic's sheets marked proofread.
export const useProofread = () => useContext(ProofreadContext);

export function Mark({ mark, title }: { mark: ProofMark; title?: string }) {
  if (!mark) return null;
  return mark === "yes" ? (
    <span
      className="font-bold text-emerald-600 dark:text-emerald-400"
      title={title ?? "From a proofread sheet"}
      aria-label="from a proofread sheet"
      data-proof="yes"
    >
      ✓
    </span>
  ) : (
    <span
      className="font-bold text-red-600 dark:text-red-400"
      title={title ?? "Only from sheets not proofread"}
      aria-label="only from sheets not proofread"
      data-proof="no"
    >
      ✗
    </span>
  );
}

// "Already proofread?", asked on every upload (and replacement) of a sheet.
export function ProofreadBox({
  checked,
  onChange,
  before,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  // The replaced sheet's mark, shown as a reminder.
  before?: boolean;
}) {
  return (
    <label
      className="flex items-start gap-2 rounded-lg border border-border p-2"
      data-proofread-box
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">This sheet is already proofread</span>
        <span className="block text-xs text-muted-foreground">
          Its words get a green ✓ when books are compared and merged; words only from sheets not
          proofread get a red ✗. Its cards are not marked verified.
          {before !== undefined &&
            ` The sheet it replaces was ${before ? "marked proofread" : "not marked proofread"}.`}
        </span>
      </span>
    </label>
  );
}
