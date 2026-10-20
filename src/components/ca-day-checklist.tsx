// Admin: the day's checklist before the issue is scheduled. What is still
// left (sources to read, stories to write, open or check, corrections, the
// Rajasthan share, skipped news), each with a button that goes there.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, Info } from "lucide-react";
import type { Check, CheckAction } from "@/lib/ca-checklist";
import { Button } from "@/components/ui/button";

export function DayChecklist({
  checks,
  onAction,
}: {
  checks: Check[];
  onAction: (a: CheckAction) => void;
}) {
  const [open, setOpen] = useState(true);
  const todo = checks.filter((c) => c.state === "todo").length;
  const done = checks.filter((c) => c.state === "done").length;
  return (
    <section
      aria-label="Before you schedule"
      className={`rounded-2xl border bg-card ${todo ? "border-amber-500/40" : "border-emerald-500/40"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ListChecks
          className={`h-5 w-5 shrink-0 ${todo ? "text-amber-600" : "text-emerald-600"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Before you schedule</div>
          <div className="text-xs text-muted-foreground">
            {todo
              ? `${todo} to do · ${done} done`
              : "Everything is done. The issue is ready to approve."}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="space-y-1 border-t border-border px-3 py-2">
          {checks.map((c) => (
            <li
              key={c.key}
              data-check={c.key}
              data-state={c.state}
              className="flex items-center gap-2 py-1 text-sm"
            >
              {c.state === "done" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : c.state === "todo" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={`min-w-0 flex-1 ${c.state === "done" ? "text-muted-foreground" : ""}`}
              >
                {c.text}
              </span>
              {c.action && (
                <Button
                  size="sm"
                  variant={c.state === "todo" ? "outline" : "ghost"}
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => onAction(c.action!)}
                >
                  {c.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
